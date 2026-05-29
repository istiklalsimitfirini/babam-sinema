FROM node:18-slim

# Install git and other utilities if needed
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency configs
COPY package*.json ./
RUN npm install

# Copy all project files
COPY . .

# Run build step to generate the static playlist.m3u
RUN npm run build

# Hugging Face Spaces require listening on port 7860
EXPOSE 7860
ENV PORT=7860

CMD ["node", "server.js"]
