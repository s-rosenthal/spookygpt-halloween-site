FROM node:22-alpine

WORKDIR /app

# Copy only what's needed first (for efficient caching)
COPY package*.json ./

RUN npm install --production

# Copy the rest of your app
COPY . .

# Expose port
EXPOSE 3000

# Set default admin password (should be overridden in production)
ENV SPOOKYGPT_ADMIN_PASSWORD=SpookyAdmin2025!

CMD ["node", "server.js"]

