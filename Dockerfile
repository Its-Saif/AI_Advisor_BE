# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

# Install deps separately to leverage Docker cache
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS devdeps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_ENV=production
COPY --from=devdeps /app/node_modules ./node_modules
COPY . .

# No build step needed; tsx runs TS directly in runtime. Keep source.

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy only what's needed at runtime
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/src ./src
COPY --from=build /app/skus.json ./skus.json

# Install a small runtime for tsx
RUN npm i -g tsx@4.20.5

EXPOSE 3000

CMD ["tsx", "src/server.ts"]


