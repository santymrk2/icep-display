FROM node:22-bookworm-slim
WORKDIR /app
# ffmpeg convierte los videos subidos a un formato que reproduzca cualquier TV (src/lib/transcode.ts).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
