FROM mcr.microsoft.com/playwright:v1.63.0-noble

USER root
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx next build \
  && chown -R pwuser:pwuser /app

RUN printf '%s\n' \
  '#!/bin/sh' \
  'set -eu' \
  'attempts=0' \
  'until npx tsx scripts/db-migrate.ts; do' \
  '  attempts=$$((attempts + 1))' \
  '  if [ "$$attempts" -ge 30 ]; then' \
  '    echo "A migração do banco não concluiu."' \
  '    exit 1' \
  '  fi' \
  '  echo "Aguardando o banco..."' \
  '  sleep 2' \
  'done' \
  'exec npx next start --hostname 0.0.0.0 --port 3000' \
  > /usr/local/bin/docker-entrypoint.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh

USER pwuser
EXPOSE 3000
CMD ["docker-entrypoint.sh"]
