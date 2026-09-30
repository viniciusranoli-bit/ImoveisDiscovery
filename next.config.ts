import { config } from "dotenv";
import type { NextConfig } from "next";

// Mantém credenciais fora da raiz do frontend e disponíveis somente em rotas do servidor.
config({ path: "./backend/.env" });

const nextConfig: NextConfig = {};

export default nextConfig;
