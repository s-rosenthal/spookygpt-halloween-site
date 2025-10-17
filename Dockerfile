FROM node:22-alpine

WORKDIR /app

# Copy only what's needed first (for efficient caching)
COPY package*.json ./

RUN npm install --production

# Copy the rest of your app
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]

