import ExternalAccount from "../models/ExternalAccount.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
];

/**
 * Must match exactly one "Authorized redirect URI" in Google Cloud Console.
 * Prefer GOOGLE_CALLBACK_URL on the server (full URL) so it always matches Console.
 */
export const resolveGoogleOAuthRedirectUri = (explicitOverride) => {
  if (explicitOverride) return explicitOverride;
  const fromEnv =
    (process.env.GOOGLE_CALLBACK_URL && process.env.GOOGLE_CALLBACK_URL.trim()) ||
    (process.env.GOOGLE_REDIRECT_URL_NODE && process.env.GOOGLE_REDIRECT_URL_NODE.trim());
  if (fromEnv) return fromEnv;
  const backendOrigin = (
    process.env.BACKEND_ORIGIN || "https://align-ai-deployment.onrender.com"
  ).replace(/\/$/, "");
  return `${backendOrigin}/api/auth/google/callback`;
};

const getRedirectUri = (override) => resolveGoogleOAuthRedirectUri(override);

const parseJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch (_err) {
    return {};
  }
};

export const getRequestedUserEmail = (req) => {
  const fromQuery = String(req.query?.email || "").trim().toLowerCase();
  const fromBody = String(req.body?.email || "").trim().toLowerCase();
  const fromHeader = String(req.headers["x-user-email"] || "").trim().toLowerCase();
  return fromQuery || fromBody || fromHeader || "";
};

export const buildGoogleAuthUrl = ({ state, redirectUri }) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const resolvedRedirectUri = getRedirectUri(redirectUri);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: resolvedRedirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

export const exchangeCodeForTokens = async (code, { redirectUri } = {}) => {
  const resolvedRedirectUri = getRedirectUri(redirectUri);
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirect_uri: resolvedRedirectUri,
    grant_type: "authorization_code",
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Failed to exchange Google auth code");
  }
  return data;
};

export const refreshAccessToken = async (refreshToken) => {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Failed to refresh Google token");
  }
  return data;
};

export const fetchGoogleUserProfile = async (accessToken) => {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to fetch Google profile");
  }
  return data;
};

export const getAccountAndAccessToken = async (userEmail) => {
  if (!userEmail) {
    throw new Error("Missing user email; pass email when calling this endpoint");
  }
  const account = await ExternalAccount.findOne({ userEmail, provider: "google" });
  if (!account || !account.accessToken) {
    throw new Error("Google account not connected");
  }

  const expiresSoon = account.expiresAt && account.expiresAt.getTime() <= Date.now() + 30_000;
  if (expiresSoon && account.refreshToken) {
    const refreshed = await refreshAccessToken(account.refreshToken);
    account.accessToken = String(refreshed.access_token || account.accessToken);
    account.expiresAt = refreshed.expires_in ? new Date(Date.now() + Number(refreshed.expires_in) * 1000) : account.expiresAt;
    account.scope = String(refreshed.scope || account.scope || "");
    await account.save();
  }

  return {
    account,
    accessToken: account.accessToken,
  };
};
