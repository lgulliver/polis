FROM node:22-alpine

RUN npm install -g pnpm@10.9.0

WORKDIR /app

# Install dependencies (separate layer for cache efficiency)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/bot-runner/package.json apps/bot-runner/
RUN pnpm install --frozen-lockfile

# Copy source and agent configs
COPY tsconfig.json ./
COPY apps/bot-runner/src apps/bot-runner/src/
COPY configs ./configs/

# Colony mode by default — runs all agents in one process.
# Pass --agent <Name> to run a single agent instead.
CMD ["pnpm", "--filter", "@polis/bot-runner", "dev"]
