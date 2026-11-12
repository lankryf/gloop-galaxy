# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY shared shared
COPY client client
ARG GIT_SHA=unknown
ARG APP_VERSION=dev
RUN GIT_SHA=$GIT_SHA APP_VERSION=$APP_VERSION npm run build -w client

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ARG GIT_SHA=unknown
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    STATIC_DIR=/app/client/dist \
    LOG_DIR=/app/logs \
    GIT_SHA=$GIT_SHA \
    APP_VERSION=$APP_VERSION
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY package.json ./
COPY shared shared
COPY server/package.json server/
COPY server/src server/src
COPY --from=build /app/client/dist client/dist
RUN mkdir -p /app/logs && chown node:node /app/logs
USER node
WORKDIR /app/server
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "src/index.ts"]
