import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import ExternalAccount from "../models/ExternalAccount.js";
import { buildGoogleAuthUrl, exchangeCodeForTokens, fetchGoogleUserProfile } from "../services/googleService.js";

const router = express.Router();

const getAuthRedirectUri = () => {
  const backendOrigin =
    process.env.BACKEND_ORIGIN || "https://align-ai-deployment.onrender.com";
  return `${backendOrigin}/api/auth/google/callback`;
};

const createToken = (userId) => jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });

router.get("/google/start", async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ detail: "Google OAuth not configured on server" });
  }
  const frontendOrigin =
    process.env.FRONTEND_ORIGIN || "https://align-ai-deployment.vercel.app";
  const next = String(req.query?.next || "/dashboard");
  const state = Buffer.from(JSON.stringify({ next, t: Date.now(), nonce: crypto.randomUUID() }), "utf8").toString("base64url");
  const authUrl = buildGoogleAuthUrl({ state, redirectUri: getAuthRedirectUri() });
  return res.json({ auth_url: authUrl, frontend_origin: frontendOrigin });
});

router.get("/google/callback", async (req, res) => {
  const frontendOrigin =
    process.env.FRONTEND_ORIGIN || "https://align-ai-deployment.vercel.app";
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    if (!code || !state) {
      return res.redirect(`${frontendOrigin}/login?google=error`);
    }

    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    const next = String(parsed?.next || "/dashboard");

    const tokens = await exchangeCodeForTokens(code, { redirectUri: getAuthRedirectUri() });
    const accessToken = String(tokens.access_token || "");
    if (!accessToken) {
      return res.redirect(`${frontendOrigin}/login?google=error`);
    }

    const profile = await fetchGoogleUserProfile(accessToken);
    const providerEmail = String(profile.email || "").trim().toLowerCase();
    const providerName = String(profile.name || providerEmail.split("@")[0] || "User").trim();

    if (!providerEmail) {
      return res.redirect(`${frontendOrigin}/login?google=error`);
    }

    let user = await User.findOne({ email: providerEmail });
    if (!user) {
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const hashed = await bcrypt.hash(randomPassword, 10);
      user = await User.create({ name: providerName, email: providerEmail, password: hashed });
    }

    const account = await ExternalAccount.findOne({ userEmail: providerEmail, provider: "google" });
    const row = account || new ExternalAccount({ userEmail: providerEmail, provider: "google" });
    row.providerUserEmail = providerEmail;
    row.accessToken = accessToken;
    if (tokens.refresh_token) row.refreshToken = String(tokens.refresh_token);
    row.expiresAt = tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null;
    row.scope = String(tokens.scope || "");
    await row.save();

    const token = createToken(user._id);
    const redirectUrl = new URL(`${frontendOrigin}/oauth/google`);
    redirectUrl.searchParams.set("token", token);
    redirectUrl.searchParams.set("email", providerEmail);
    redirectUrl.searchParams.set("name", user.name || providerName);
    redirectUrl.searchParams.set("next", next);
    return res.redirect(redirectUrl.toString());
  } catch (_err) {
    return res.redirect(`${frontendOrigin}/login?google=error`);
  }
});

export default router;
