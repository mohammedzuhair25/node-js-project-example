# Dockerfile.dev
FROM node:20-alpine

RUN apk update && apk upgrade --no-cache

# Create app directory
WORKDIR /usr/src/app

# Install dependencies first (better layer caching)
COPY package*.json ./

RUN npm ci --omit=dev

# Copy app source
COPY server.mjs .

# Use a non-root user (optional but recommended) - adjust as needed for your app's permissions
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

# Start the app (change if your start script differs)
CMD ["node", "server.mjs"] 
