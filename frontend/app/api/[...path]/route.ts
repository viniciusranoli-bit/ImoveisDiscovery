import { apiProxyTimeoutMs, proxyToBackend } from "@/app/lib/api-proxy";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: RouteContext) {
  const { path } = await context.params;
  const segment = path.map(encodeURIComponent).join("/");
  const apiPath = `/api/${segment}`;
  return proxyToBackend(request, apiPath, apiProxyTimeoutMs(apiPath));
}

export async function GET(request: Request, context: RouteContext) {
  return forward(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return forward(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return forward(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return forward(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return forward(request, context);
}
