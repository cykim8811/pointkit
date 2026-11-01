FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY scripts/build.mjs ./scripts/build.mjs
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY service ./service
ENV PORT=8080 POINTKIT_DB_PATH=/data/points.sqlite3
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "service/server.mjs"]
