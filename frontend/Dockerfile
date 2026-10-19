FROM node:24-alpine

WORKDIR /workspace
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY frontend frontend

WORKDIR /workspace/frontend
ENV NEXT_TELEMETRY_DISABLED=1
ARG API_URL=http://backend:3001
ENV API_URL=${API_URL}
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
