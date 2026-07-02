FROM node:22-slim AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npx tsc

FROM node:22-slim
WORKDIR /app

RUN npx playwright install chromium --with-deps

# Install VNC + noVNC for manual captcha solving
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11vnc procps ca-certificates \
    novnc websockify \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 3001 6080 9222

ENV HEADLESS=false PORT=3001 DISPLAY=:99

CMD ["/app/start.sh"]
