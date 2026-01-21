# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-slim

WORKDIR /app

# Install dependencies strictly for production
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built files
COPY --from=builder /app/build ./build

# Environment variables for configuration can be passed at runtime
# ENV ORACLE_CLIENT_LIB_DIR=... (Optional for Thick mode)

# Entrypoint
ENTRYPOINT ["node", "build/index.js"]
CMD []
