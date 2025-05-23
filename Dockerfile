# Use Node.js LTS version
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create volume for logs
VOLUME ["/usr/src/app/logs"]

# Expose port
EXPOSE 3000

# Set environment variables with defaults
ENV NODE_ENV=production \
    PORT=3000 \
    GITHUB_TOKEN="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"

# Add a healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the server
CMD ["sh", "-c", "if [ -z \"$GITHUB_TOKEN\" ]; then echo 'Error: GITHUB_TOKEN is required' && exit 1; else node server.js; fi"]
