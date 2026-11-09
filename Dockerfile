# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --strict-ssl=true
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 ADMIN_PORT=3001 DATA_DIR=/data/app
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --strict-ssl=true && npm cache clean --force
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /data/app && chown -R node:node /app /data
USER node
EXPOSE 3000 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/server/index.js"]
