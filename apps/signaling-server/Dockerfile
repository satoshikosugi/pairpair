# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy monorepo files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy packages
COPY packages ./packages

# Copy signaling-server
COPY apps/signaling-server ./apps/signaling-server

# Install pnpm
RUN npm install -g pnpm@11.5.3

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the application
RUN pnpm --filter=@pairpair/signaling-server build

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Install pnpm in runtime image
RUN npm install -g pnpm@11.5.3

# Copy monorepo files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy built packages
COPY --from=builder /app/packages ./packages

# Copy built signaling-server
COPY --from=builder /app/apps/signaling-server/dist ./apps/signaling-server/dist
COPY --from=builder /app/apps/signaling-server/package.json ./apps/signaling-server/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile --filter=@pairpair/signaling-server

# Set working directory
WORKDIR /app/apps/signaling-server

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8080) + '/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Port
EXPOSE 8080

# Start application
CMD ["npm", "start"]
