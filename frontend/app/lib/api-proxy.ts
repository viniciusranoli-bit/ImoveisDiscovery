const API_URL = process.env.API_URL ?? "http://localhost:3006";

const DEFAULT_LONG_TIMEOUT_MS = 15 * 60 * 1000;

export function apiProxyTimeoutMs(apiPath: string): number {
  if (apiPath.startsWith("/api/playwright/portals")) return DEFAULT_LONG_TIMEOUT_MS;
  if (apiPath.startsWith("/api/chat")) return 90_000;
  if (apiPath.startsWith("/api/admin/whatsapp-evolution")) return 90_000;
  if (apiPath.startsWith("/api/auth/")) return 30_000;
  return 60_000;
}

export async function proxyToBackend(
  request: Request,
  apiPath: string,
  timeoutMs = DEFAULT_LONG_TIMEOUT_MS,
) {
  const url = new URL(request.url);
  const target = `${API_URL}${apiPath}${url.search}`;
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  let response: Response;
  try {
    response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return Response.json(
      {
        error:
          "Não foi possível contactar a API (backend). Em dev, suba `npm run dev` na raiz (API na porta 3006).",
      },
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const body = await response.arrayBuffer();
  const responseHeaders = new Headers();
  const hopByHop = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
  ]);
  response.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (hopByHop.has(lower)) return;
    if (lower === "set-cookie") {
      responseHeaders.append("set-cookie", value);
      return;
    }
    responseHeaders.set(key, value);
  });
  if (typeof response.headers.getSetCookie === "function") {
    responseHeaders.delete("set-cookie");
    for (const cookie of response.headers.getSetCookie()) {
      responseHeaders.append("set-cookie", cookie);
    }
  }

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export async function readApiJson<T>(response: Response): Promise<T> {
  const text = (await response.text()).trim();
  if (!text) {
    throw new Error("A API respondeu vazio. Tente novamente.");
  }
  if (text === "Internal Server Error") {
    throw new Error(
      "Não foi possível contactar a API (backend). Em dev, use `npm run dev` na raiz (frontend 3005, API 3006).",
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Resposta inválida da API. Tente novamente em instantes.");
  }
}
