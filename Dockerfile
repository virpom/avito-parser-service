# Dockerfile with VNC support for browser automation
FROM ubuntu:22.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js, Chromium, Xvfb, x11vnc, noVNC, websockify
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    chromium-browser \
    xvfb \
    x11vnc \
    fluxbox \
    git \
    python3 \
    python3-numpy \
    net-tools \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install noVNC
RUN git clone https://github.com/novnc/noVNC.git /opt/novnc \
    && git clone https://github.com/novnc/websockify /opt/novnc/utils/websockify \
    && ln -s /opt/novnc/vnc.html /opt/novnc/index.html

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install && npm cache clean --force

# Copy source code
COPY . .

# Build application
RUN npm run build

# Create startup script
RUN echo '#!/bin/bash\n\
export DISPLAY=:99\n\
Xvfb :99 -screen 0 1280x720x24 &\n\
sleep 2\n\
fluxbox &\n\
x11vnc -display :99 -forever -shared -rfbport 5900 -nopw &\n\
/opt/novnc/utils/novnc_proxy --vnc localhost:5900 --listen 6080 &\n\
node dist/main.js\n\
' > /app/start.sh && chmod +x /app/start.sh

# Expose ports
EXPOSE 5011 6080

# Set environment
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    DISPLAY=:99 \
    NODE_ENV=production

# Start script
CMD ["/app/start.sh"]
