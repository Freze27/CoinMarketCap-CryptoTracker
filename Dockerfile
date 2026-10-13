FROM node:26.10.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:26.10.0-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/app/data/app.db
WORKDIR /app
RUN mkdir data && chown node:node data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY migrations ./migrations
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]
