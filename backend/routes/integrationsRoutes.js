import express from "express";
import ExternalAccount from "../models/ExternalAccount.js";
import {
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleUserProfile,
  getRequestedUserEmail,
} from "../services/googleService.js";

const router = express.Router();

router.get("/status", async (req, res) => {
  const userEmail = getRequestedUserEmail(req);
  if (!userEmail) {
    return res.json({ google: { connected: false, email: "", updated_at: null } });
  }
  const account = await ExternalAccount.findOne({ userEmail, provider: "google" });
  return res.json({
    google: {
      connected: Boolean(account?.refreshToken || account?.accessToken),
      email: String(account?.providerUserEmail || ""),
      updated_at: account?.updatedAt ? account.updatedAt.toISOString() : null,
    },
  });
});

router.get("/google/connect", async (req, res) => {
  const userEmail = getRequestedUserEmail(req);
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ detail: "Google OAuth not configured on server" });
  }
  if (!userEmail) {
    return res.status(400).json({ detail: "Missing user email; pass email query param" });
  }
  const state = Buffer.from(JSON.stringify({ email: userEmail, t: Date.now() }), "utf8").toString("base64url");
  const authUrl = buildGoogleAuthUrl({ state });
  return res.json({ auth_url: authUrl });
});

router.get("/google/callback", async (req, res) => {
  const frontendOrigin =
    process.env.FRONTEND_ORIGIN || "https://align-ai-deployment.vercel.app";
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    if (!code || !state) {
      return res.redirect(`${frontendOrigin}/settings?google=error`);
    }

    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    const userEmail = String(parsed?.email || "").trim().toLowerCase();
    if (!userEmail) {
      return res.redirect(`${frontendOrigin}/settings?google=error`);
    }

    const tokens = await exchangeCodeForTokens(code);
    const profile = await fetchGoogleUserProfile(String(tokens.access_token));
    const providerEmail = String(profile.email || "").trim().toLowerCase();

    const account = await ExternalAccount.findOne({ userEmail, provider: "google" });
    const row = account || new ExternalAccount({ userEmail, provider: "google" });
    row.providerUserEmail = providerEmail || userEmail;
    row.accessToken = String(tokens.access_token || "");
    if (tokens.refresh_token) {
      row.refreshToken = String(tokens.refresh_token);
    }
    row.expiresAt = tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null;
    row.scope = String(tokens.scope || "");
    await row.save();

    return res.redirect(`${frontendOrigin}/settings?google=connected`);
  } catch (_error) {
    return res.redirect(`${frontendOrigin}/settings?google=error`);
  }
});

router.post("/google/disconnect", async (req, res) => {
  const userEmail = getRequestedUserEmail(req);
  if (!userEmail) {
    return res.status(400).json({ detail: "Missing user email; pass email in body or query" });
  }
  await ExternalAccount.deleteOne({ userEmail, provider: "google" });
  return res.json({ ok: true });
});

export default router;
