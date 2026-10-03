const googleClientId = () => process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = () => process.env.GOOGLE_CLIENT_SECRET?.trim();

export function googleOAuthEnabled() {
  return Boolean(googleClientId() && googleClientSecret());
}

export function googleRedirectUri(request: Request) {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.origin}/api/auth/google/callback`;
}

export function googleAuthorizeUrl(request: Request, state: string) {
  const clientId = googleClientId();
  if (!clientId) throw new Error("Login com Google não está configurado.");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(request: Request, code: string) {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) throw new Error("Login com Google não está configurado.");
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleRedirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: string };
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error("Não foi possível concluir o login com Google.");
  }
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = (await profileResponse.json()) as {
    sub?: string;
    email?: string;
    name?: string;
  };
  if (!profileResponse.ok || !profile.sub || !profile.email) {
    throw new Error("Não foi possível ler o perfil do Google.");
  }
  return {
    googleSub: profile.sub,
    email: profile.email,
    displayName: profile.name ?? profile.email,
  };
}
