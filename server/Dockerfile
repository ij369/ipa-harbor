# syntax=docker/dockerfile:1.4

FROM node:lts-bookworm-slim AS builder

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
    find /app/bin ! -name "ipatool" ! -name "LICENSE.txt" -type f -exec rm -f {} + && \
    rm -f /app/Dockerfile /app/.dockerignore && \
    echo "ipatool installed successfully for $TARGETARCH"

FROM node:lts-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 nodejs \
    && useradd -r -u 1001 -g nodejs -d /app -s /usr/sbin/nologin ij369

WORKDIR /app
ARG APP_VERSION

# 设置环境变量
ENV NODE_ENV=production
ENV APP_VERSION=${APP_VERSION}
ENV KEYCHAIN_PASSPHRASE=""
ENV PORT=3080
ENV HTTPS_PORT=3443
ENV ALLOWED_DOMAINS=""
ENV ENABLE_MORE_LOGS=false
ENV ALLOW_LAN_ACCESS=true
# Linux 容器无 GUI keyring，避免 dbus 阻塞 ipatool 登录
ENV DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent
# ipatool 配置目录为 $HOME/.ipatool，指向 data 卷以便持久化
ENV HOME=/app/data
# ipatool 首次 Apple ID 认证需 Unicorn/SAP 模拟，宿主机建议 ≥1GB 可用内存或配置 ≥2GB swap

COPY --from=builder --chown=ij369:nodejs /app /app

# 数据卷挂载点（仅创建目录，避免 chown -R 整棵 /app）
RUN install -d -o ij369 -g nodejs -m 755 /app/data/.ipatool

USER ij369

# 声明数据持久化卷
VOLUME ["/app/data"]

EXPOSE 3080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:$PORT/health || exit 1

CMD ["node", "app.js"]