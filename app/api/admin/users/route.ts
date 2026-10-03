import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/request-user";
import { authSetupStatus } from "@/lib/auth/setup";
import {
  adminCreateUser,
  adminDeleteUser,
  adminUpdateUser,
  listUsersForAdmin,
} from "@/lib/auth/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
    }
    const users = await listUsersForAdmin();
    return NextResponse.json({ users, setup: authSetupStatus(request) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não autenticado." },
      { status: 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    if (actor.role !== "admin") {
      return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
    }
    const body = (await request.json()) as {
      email?: string;
      displayName?: string;
      password?: string;
      role?: "user" | "admin";
      searchQuota?: number;
    };
    const user = await adminCreateUser({
      email: body.email ?? "",
      displayName: body.displayName ?? "",
      password: body.password ?? "",
      role: body.role,
      searchQuota: body.searchQuota,
    });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível criar o usuário." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireUser();
    if (actor.role !== "admin") {
      return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
    }
    const body = (await request.json()) as {
      userId?: string;
      displayName?: string;
      role?: "user" | "admin";
      searchQuota?: number;
      password?: string;
    };
    if (!body.userId) {
      return NextResponse.json({ error: "Informe o usuário." }, { status: 400 });
    }
    const updated = await adminUpdateUser({
      userId: body.userId,
      displayName: body.displayName,
      role: body.role,
      searchQuota: body.searchQuota,
      password: body.password,
    });
    return NextResponse.json({ user: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível atualizar." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireUser();
    if (actor.role !== "admin") {
      return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
    }
    const url = new URL(request.url);
    const userId = url.searchParams.get("id");
    if (!userId) return NextResponse.json({ error: "Informe o usuário." }, { status: 400 });
    await adminDeleteUser(userId, actor.id);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível apagar." },
      { status: 400 },
    );
  }
}
