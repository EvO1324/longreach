# syntax = docker/dockerfile:1

ARG NODE_VERSION=24.13.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

WORKDIR /app
ENV NODE_ENV="production"

FROM base AS build

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3 ca-certificates

COPY package-lock.json package.json ./
RUN npm ci

COPY . .

FROM base

RUN apt-get update -qq && apt-get install --no-install-recommends -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app

# pm2 runs the API and the Discord bot as separate processes (ecosystem.config.js).
# PocketBase is its own app: see pocketbase/.
RUN npm install -g pm2

EXPOSE 3000
CMD ["pm2-runtime", "start", "ecosystem.config.js"]
