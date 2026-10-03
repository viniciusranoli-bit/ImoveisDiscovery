import { config } from "dotenv";
import type { NextConfig } from "next";
import { ensureAuthSecretInProcess } from "./lib/auth/secret";

// Mantém credenciais fora da raiz do frontend e disponíveis somente em rotas do servidor.
config({ path: "./backend/.env" });
ensureAuthSecretInProcess();

const nextConfig: NextConfig = {};

export default nextConfig;
