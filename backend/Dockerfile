FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /workspace
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY backend backend
COPY AGENTS.md MEMORY.md ./

WORKDIR /workspace/backend
EXPOSE 3001
CMD ["sh", "-c", "attempts=0; until npm run db:migrate; do attempts=$((attempts+1)); echo \"db:migrate falhou (tentativa $attempts). DB_HOST=${DB_HOST:-?} DB_PORT=${DB_PORT:-5432} DATABASE_NAME=${DATABASE_NAME:-?} — confira Postgres no host e host.docker.internal.\"; if [ \"$attempts\" -ge 30 ]; then exit 1; fi; sleep 2; done; exec npm run start"]
