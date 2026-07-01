# syntax=docker/dockerfile:1

# Build backend
FROM node:20-alpine AS server-builder
WORKDIR /app
COPY server/package*.json ./
RUN npm install
COPY server/. .
RUN npm run build

# Build frontend
FROM node:20-alpine AS web-builder
WORKDIR /web
COPY web/package*.json ./
RUN npm install
COPY web/. .
RUN npm run build

# Runtime
FROM node:20-alpine
RUN apk add --no-cache zip
WORKDIR /app
COPY server/package*.json ./
RUN npm install --production
COPY --from=server-builder /app/dist ./dist
COPY --from=web-builder /web/dist ./dist/public

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
