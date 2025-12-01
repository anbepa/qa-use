FROM mcr.microsoft.com/playwright:v1.57.0-noble AS deps

RUN npm install -g pnpm

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Builder --------------------------------------------------------------------

FROM mcr.microsoft.com/playwright:v1.57.0-noble AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

# Runner ---------------------------------------------------------------------

FROM mcr.microsoft.com/playwright:v1.57.0-noble AS runner

RUN npm install -g pnpm

WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=builder /app ./

EXPOSE 3000

CMD ["pnpm", "start"]
