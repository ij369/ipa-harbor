# syntax=docker/dockerfile:1.4

FROM node:lts-alpine

RUN apk add --no-cache curl tar

WORKDIR /app
ARG TARGETARCH

# 复制 package 文件并安装依赖
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .

RUN set -ex && \
    case "$TARGETARCH" in \
    "amd64") TAR_FILE=$(ls bin/ipatool-*-linux-amd64.tar.gz | sort -V | tail -n 1) ;; \
    "arm64") TAR_FILE=$(ls bin/ipatool-*-linux-arm64.tar.gz | sort -V | tail -n 1) ;; \
    *) echo "Unsupported arch: $TARGETARCH" && exit 1 ;; \
    esac && \
    echo "Detected architecture: $TARGETARCH" && \
    echo "Using ipatool archive: $TAR_FILE" && \
    mkdir -p /tmp/ipatool && \
    tar -xzf "$TAR_FILE" -C /tmp/ipatool && \
    IPATOOL_BIN=$(find /tmp/ipatool -type f -name '*ipatool*' | head -n 1) && \
    if [ -z "$IPATOOL_BIN" ]; then \
    echo "ipatool binary not found after extraction" && exit 1; \
    fi && \
    cp "$IPATOOL_BIN" /app/bin/ipatool && \
    chmod +x /app/bin/ipatool && \
    rm -rf /tmp/ipatool && \
    find /app/bin ! -name "ipatool" -type f -exec rm -f {} + && \
    rm -f /app/Dockerfile /app/.dockerignore && \
    echo "ipatool installed successfully for $TARGETARCH"

# 设置环境变量
ENV NODE_ENV=production
ENV KEYCHAIN_PASSPHRASE=""
ENV PORT=3080
ENV ALLOWED_DOMAINS=""
ENV ENABLE_MORE_LOGS=false
ENV ALLOW_LAN_ACCESS=true

# 创建非 root 用户和数据目录
RUN addgroup -g 1001 -S nodejs && \
    adduser -S ij369 -u 1001 -G nodejs && \
    chown -R ij369:nodejs /app

USER ij369

# 声明数据持久化卷
VOLUME ["/app/data"]

EXPOSE 3080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:$PORT/health || exit 1

CMD ["node", "app.js"]