FROM node:20-bullseye

WORKDIR /workspace

ENV CI=true
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

# Native and GUI-related dependencies commonly needed by Electron/Chromium builds.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    python3 \
    make \
    g++ \
    pkg-config \
    libgtk-3-0 \
    libnss3 \
    libasound2 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxkbcommon0 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libxss1 \
    libxtst6 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libgtk-3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "run", "dev"]
