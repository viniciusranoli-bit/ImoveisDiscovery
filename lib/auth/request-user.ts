import { cookies } from "next/headers";
import { getSessionUserId, SESSION_COOKIE } from "@/lib/auth/session";
import { readUserById, type AuthUser } from "@/lib/auth/users";

export async function requireUser(): Promise<AuthUser> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const userId = await getSessionUserId(token);
  if (!userId) throw new Error("Faça login para continuar.");
  const user = await readUserById(userId);
  if (!user) throw new Error("Sessão inválida. Entre novamente.");
  return user;
}

export async function optionalUser() {
  try {
    return await requireUser();
  } catch {
    return undefined;
  }
}
