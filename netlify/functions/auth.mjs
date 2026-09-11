import {
  clearSessionCookie,
  createSession,
  hasValidOrigin,
  isAuthorized,
  sessionCookie,
  validCredentials
} from "../lib/auth.mjs";

const json = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders }
});

export default async (request) => {
  if (request.method === "GET") return json({ authenticated: isAuthorized(request) });

  if (!hasValidOrigin(request)) return json({ error: "Недопустимый источник запроса" }, 403);

  if (request.method === "DELETE") {
    return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  }

  if (request.method !== "POST") return json({ error: "Метод не поддерживается" }, 405, { allow: "GET, POST, DELETE" });

  try {
    const body = await request.json();
    if (!validCredentials(body.login, body.password)) {
      return json({ error: "Неверный логин или пароль" }, 401);
    }
    return json({ authenticated: true }, 200, { "set-cookie": sessionCookie(createSession()) });
  } catch {
    return json({ error: "Некорректный запрос" }, 400);
  }
};
