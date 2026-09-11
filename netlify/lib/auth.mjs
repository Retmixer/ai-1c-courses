import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "ps_admin_session";
const LOGIN_HASH = "bcb56df4778d1be4485b689d09131d15b56e3067de39501694e2329794f4aa4e";
const PASSWORD_HASH = "d144dade0c4c085afa21bf8ce42514ec9ff1f3143a56535c3ff12fba4643c47b";
const FALLBACK_SECRET = "88d225e9f42bf4ef4b6c1a4df103708ae2e79e7ffbdfa30cd219c0c9320d26ff32ac802092ccc5e3ad1452f8278a3e0d";

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function signature(payload) {
  const secret = process.env.ADMIN_SESSION_SECRET || FALLBACK_SECRET;
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function cookies(request) {
  return Object.fromEntries(
    (request.headers.get("cookie") || "")
      .split(";")
      .map((part) => part.trim().split(/=(.*)/s).slice(0, 2))
      .filter(([key]) => key)
  );
}

export function validCredentials(login, password) {
  return safeEqual(hash(login), LOGIN_HASH) && safeEqual(hash(password), PASSWORD_HASH);
}

export function createSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 12 * 60 * 60 * 1000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function isAuthorized(request) {
  try {
    const token = cookies(request)[COOKIE_NAME];
    if (!token) return false;
    const [payload, sentSignature] = token.split(".");
    if (!payload || !sentSignature || !safeEqual(signature(payload), sentSignature)) return false;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(session.exp) > Date.now();
  } catch {
    return false;
  }
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function hasValidOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}
