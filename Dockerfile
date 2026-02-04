FROM node:20-slim

# Install LibreOffice and poppler-utils for document conversion
RUN apt-get update && apt-get install -y \
    libreoffice \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./
COPY ui/package*.json ./ui/

# Install dependencies
RUN npm install
RUN cd ui && npm install

# Copy source code
COPY . .

# Build frontend
RUN cd ui && npm run build

# Set production environment
ENV NODE_ENV=production

# Expose the port Render will use
EXPOSE 3001

# Start the server
CMD ["node", "ui/server.js"]
