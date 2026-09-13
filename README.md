# IPA-Harbor
This project is an open-source IPA web management tool based on [ipatool](https://github.com/majd/ipatool).  
It can be accessed and used directly from a web browser, supporting App search, downloading previous versions, and IPA installation. A [Docker image](https://hub.docker.com/r/uuphy/ipa-harbor/tags) is also provided for easy deployment.

本项目是一个基于 [ipatool](https://github.com/majd/ipatool) 的开源 IPA Web 管理工具。
通过浏览器即可访问和使用，支持 App 搜索、历史版本下载及安装，并提供 [Docker 镜像](https://hub.docker.com/r/uuphy/ipa-harbor/tags) 方便部署。

[Quick Start](#quick-start) | [快速开始](#快速开始)

> Apple ID: IPA-Harbor is designed for self-hosted use; this project does not provide a public online instance.
> For security and privacy, we recommend deploying it yourself and using an Apple ID separate from your daily-use account.
> Do not enter Apple ID credentials on unknown or untrusted third-party instances.

> Official Docker image: [`uuphy/ipa-harbor`](https://hub.docker.com/r/uuphy/ipa-harbor) is the only official Docker image for this project, built and published from this repository's source. For most users, we recommend using the latest tag.

> Apple ID： IPA-Harbor 设计为自托管使用，本项目不提供公共在线实例。
> 出于安全和隐私考虑，建议自行部署并与日常使用的 Apple ID 分开。
> 请勿在来源不明或不可信的第三方实例中输入 Apple ID 凭据。

> 官方 Docker 镜像：[`uuphy/ipa-harbor`](https://hub.docker.com/r/uuphy/ipa-harbor) 是本项目唯一官方 Docker 镜像，由本仓库源码构建并发布，对于大多数用户，建议使用 latest 标签。


## Quick Start
### Local Quick Start Command
+ Suitable for Docker installed locally (e.g., [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [OrbStack](https://orbstack.dev/)). Try the following on your first run.

```bash
docker run -d \
  -p 3388:3080 \
  -e KEYCHAIN_PASSPHRASE=$(openssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10) \
  -e ADMIN_INIT_PIN=20251024 \
  -e PORT=3080 \
  -v ipa_data:/app/data \
  --name ipa-harbor \
  uuphy/ipa-harbor:latest
```


#### Quick Deploy Script
Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [OrbStack](https://orbstack.dev/), open Terminal, and run:

```bash
curl -fsSL https://raw.githubusercontent.com/ij369/ipa-harbor/main/quick-deploy.sh | bash
```

Follow the script prompts to install, upgrade, and more.

> [!WARNING]
> **The first Apple ID login runs Unicorn/SAP emulation. Ensure the host has ≥1 GB free RAM, or [configure ≥2 GB swap](#linux-vps-memory--swap-first-apple-id-login).**

Then open your browser and visit: http://localhost:3388

On first run, you will create an admin account; use init PIN **`20251024`**. Use a random value for public deployments.

<br />

### Public Network Startup Command (Self-signed Certificate or Specified Certificate)

```bash
docker run -d \
  -p 80:3080 \
  -p 443:3443 \
  -e KEYCHAIN_PASSPHRASE=$(openssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10) \
  -e ADMIN_INIT_PIN=$(openssl rand -base64 24 | tr -dc '0-9' | head -c8) \
  -e PORT=3080 \
  -e HTTPS_PORT=3443 \
  -e ALLOW_LAN_ACCESS=false \
  -e ALLOWED_DOMAINS=example.com \
  -v ipa_data:/app/data \
  -v ipa_certs:/app/certs \
  --name ipa-harbor \
  uuphy/ipa-harbor:latest
```

The ipa_certs volume requires two certificate files (`server.crt` and `server.key`). You can also directly bind `/app/certs/server.crt` and `/app/certs/server.key` to specific files.
Then open your browser and visit: http://your-domain.com and https://your-domain.com to access.
Note: LAN access requires `ALLOW_LAN_ACCESS=true`.

On first visit, go to `/setup` and use the `ADMIN_INIT_PIN` from the command above. Save that value for recovery if needed.

<br />

### Public Network Startup Command (nginx reverse proxy)
+ This simplifies to directly proxy the http port (environment variable PORT)
+ Set `-e TRUST_PROXY=1` when proxying via nginx or Cloudflare (included below) so rate limiting uses the real client IP. Do not set it for direct access.

Assuming you own a domain `example.com`
Used `docker network create my_network` to create a `my_network` network
And added the nginx container to the `my_network` network
At this point, set a hostname for `ipa-harbor` as `ipa_harbor`

The corresponding command is
```bash
docker run -d \
  -e KEYCHAIN_PASSPHRASE=$(openssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10) \
  -e ADMIN_INIT_PIN=$(openssl rand -base64 24 | tr -dc '0-9' | head -c8) \
  -e PORT=3080 \
  -e ALLOW_LAN_ACCESS=false \
  -e ALLOWED_DOMAINS=example.com \
  -e TRUST_PROXY=1 \
  -v ipa_data:/app/data \
  -v ipa_certs:/app/certs \
  --hostname ipa_harbor \
  --name ipa-harbor \
  uuphy/ipa-harbor:latest
```

```
server {
    listen 80;
    server_name example.com;
        
    location = /robots.txt {
        add_header  Content-Type  text/plain;
        return 200 "User-agent: *\nDisallow: /\n";
    }
    location / {
        proxy_pass http://ipa_harbor:3080;

        # --- Frontend includes WebSocket functionality for progress display, this must be added ---
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        #  --- Optional: Prevent long connection timeout --- 
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}

```

Then open your browser and visit: http://example.com to access. Similarly, you can configure nginx to listen on port 443 with certificates and reverse proxy `http://ipa_harbor:3080` to achieve https access.

On first visit, go to `/setup` and use the `ADMIN_INIT_PIN` from the command above.


### Parameter Description

`-p 3388:3080`: Maps container port 3080 to local port 3388.

`-e ENABLE_MORE_LOGS=true` enables more detailed logs.

`-e KEYCHAIN_PASSPHRASE=X96A49763R`: Randomly generated key to ensure Keychain security, as the Keychain stores Apple ID access credentials.

`-e ADMIN_INIT_PIN=...`: Init PIN for setup and admin password reset.

`-e ADMIN_RECOVERY_ENABLED=true` (optional): Enables `/recover`.

`-e ALLOW_LAN_ACCESS=true` allows LAN IP access, enabled by default. If deploying to public network, it is recommended to set to `false`.

`-e PORT=3080` specifies the http access port, default 3080, optional.

`-e HTTPS_PORT=3443` specifies the https access port, default 3443, optional.

`-e ALLOWED_DOMAINS=your-domain.com,another-domain.com`: When using domain connections outside of localhost, you need to specify the origin, otherwise access will be denied. When using Docker networks and proxying through other containers, it is recommended to include the hostname, separated by commas.

`-v ipa_data:/app/data`: Persists data (IPA files, database, etc.).

`-v ipa_certs:/app/certs`: Persists certificates.

`--name ipa-harbor`: Container name.

**Rate limit:** all `/v1/` APIs, 100 requests/minute per IP. WebSocket is unaffected (not routed under `/v1/`).

If you deploy on public network, you must have `ALLOWED_DOMAINS` and set `ALLOW_LAN_ACCESS=false` to implement frontend access whitelist. This will affect browser-level access restrictions:

```
-e ALLOWED_DOMAINS=your-domain.com,another-domain.com \
```

### System admin authentication

Passkey (optional) offers a more convenient and secure way to sign in, especially on Apple devices and browsers that support Passkey.
If Passkey is not configured, you can still sign in with username and password admin authentication.

To enable this feature, configure at least the following environment variables:

| Variable | Description |
| --- | --- |
| `WEBAUTHN_RP_ID` | Relying Party ID — site domain **without port**, e.g. `example.com` |
| `WEBAUTHN_ALLOWED_ORIGINS` | Comma-separated browser Origins allowed for WebAuthn, e.g. `https://example.com,http://localhost:5173`. **Must match the address bar exactly** (include port when not default). |

**Keep Origin and CORS in sync:** The URL users actually visit must appear in both `ALLOWED_DOMAINS` (CORS) and `WEBAUTHN_ALLOWED_ORIGINS`. If they differ, the app may load but Passkey login/register will fail.

See [`server/docker-compose.example.yml`](https://github.com/ij369/ipa-harbor/blob/main/server/docker-compose.example.yml).


## IPA Installation

After downloading an IPA, you can install it with other tools.

### How to install downloaded IPAs on iPad / iPhone?

On recent iOS/iPadOS versions, AirDrop is the straightforward option. For older devices, use [Apple Configurator](https://apps.apple.com/app/id1037126344) on Mac, or iTunes 12.6.3 on Windows. Third-party sideloading tools are not recommended.

> iTunes downloads: [ipsw.me/iTunes](https://ipsw.me/iTunes)

IPA-Harbor also supports installing IPAs directly via Safari, but this requires additional deployment conditions:

- Available on **iPhone / iPad / Apple Silicon Mac** only (open the site in Safari on the device).
- The site must be served over **HTTPS** — the **Install** button is hidden on plain HTTP.
  - Built-in TLS: `-p 443:3443`, `-e HTTPS_PORT=3443`, `-v ipa_certs:/app/certs` with `server.crt` and `server.key` in the volume (or bind-mount those two files)
  - Or terminate HTTPS on nginx :443 — see [Public Network Startup](#public-network-startup-command-self-signed-certificate-or-specified-certificate)
- Toggle in **Settings → Enable OTA install** (off by default on non-Apple devices).
- IPAs must be downloaded with `--ota-compat` ipatool — thanks to [iosconstantine/ipatool](https://github.com/iosconstantine/ipatool/tree/feat/ota-compat-flag) for the `--ota-compat` design ([#540](https://github.com/majd/ipatool/issues/540)); see [ipatool & Docker](#ipatool--docker).

Therefore, if you only use IPA-Harbor to download IPAs, a standard Docker deployment is sufficient; if you need Safari direct install, see the [related configuration guide](#public-network-startup-command-self-signed-certificate-or-specified-certificate).


## Note

Log in with only one Apple ID per container. Use a separate container for each Apple ID, and try to keep each Apple ID's region aligned with the container's egress IP region.

### Linux VPS: memory & swap (first Apple ID login)

Configure on the **host** (not inside the container). For ~1GB VPS, add 2GB swap:

```bash
fallocate -l 2G /swapfile    # create 2GB file
chmod 600 /swapfile          # root read/write only
mkswap /swapfile             # format as swap
swapon /swapfile             # enable now
echo '/swapfile none swap sw 0 0' >> /etc/fstab   # persist after reboot
swapon --show && free -h     # verify (~2G /swapfile)
```

No further host setup needed — bind Apple ID in the web UI as usual. The first login may take a while (slower on swap); Apple may prompt for email/SMS 2FA. Wait for it; do not click repeatedly.

## Directory Structure
```
ipa-harbor/
├── ipatool/                         - git submodule (HaughtyEyes ipatool source)
├── server/
│   ├── api/                         - REST / WebSocket API
│   ├── app.js
│   ├── bin/
│   │   ├── ipatool                  - dev binary (local macOS or extracted)
│   │   └── ipatool-*-linux-*.tar.gz - Linux packages for Docker build
│   ├── patches/
│   │   └── ipatool-haughtyeyes-ota-compat.patch
│   ├── certs/                       - HTTPS: server.crt, server.key
│   ├── data/                        - IPA files, users.db, .ipatool config
│   ├── Dockerfile
│   ├── docker-compose.example.yml
│   └── static/                      - built frontend (production)
├── client/                          - Vite + React frontend source
├── build.sh                         - build Docker image
├── build_ipatool.sh                 - compile ipatool from source
├── build_zh.sh                      - build Docker image (Chinese UI)
├── build_ipatool_zh.sh              - compile ipatool (Chinese UI)
└── dl_latest.sh                     - fetch official ipatool release
```
### Development

```bash
git clone --recurse-submodules https://github.com/ij369/ipa-harbor.git
# or: git submodule update --init ipatool
```

#### Backend
```bash
cd server && npm i && nodemon
```
On macOS, nodemon restarts may trigger the system keychain prompt — authorize it (credentials live in the system keychain, not `~/.ipatool`).

#### Frontend
```bash
cd client && pnpm i && pnpm dev
```
Dev server: `localhost:5173`. For LAN access, set backend env `allowLAN` (see parameter docs).

#### ipatool & Docker

```bash
# Compile ipatool (default haughtyeyes+ota)
chmod +x build_ipatool.sh && ./build_ipatool.sh

# Build Docker image (prompts to refresh ipatool; choose n if already built)
chmod +x build.sh && ./build.sh
```

**Details**

Default preset **`haughtyeyes+ota`** (submodule `ipatool/` + OTA patch → `server/bin/ipatool`). Official [releases](https://github.com/majd/ipatool/releases) v2.5.0 lack empty-response fixes ([#538](https://github.com/majd/ipatool/issues/538), [#547](https://github.com/majd/ipatool/issues/547)) and OTA support ([#540](https://github.com/majd/ipatool/issues/540)). See [Acknowledgements](#acknowledgements).

| Scenario | Command |
| --- | --- |
| Official release only (no fixes) | `./dl_latest.sh` then `./build.sh --no-fetch` |

`build_ipatool.sh` with no args shows an interactive menu (Enter = option 1):

| Flag | Description |
| --- | --- |
| `--choice N` | Non-interactive: `1` Linux (arm64+amd64) + macOS, `2` macOS only, `3` Linux arm64, `4` Linux amd64 |
| `--arch ARCH` | Linux only: `amd64` \| `arm64` \| `all` (skips menu with `--darwin`) |
| `--darwin` | Also build local macOS binary → `server/bin/ipatool` |
| `--source NAME` | `official` \| `haughtyeyes` \| `ota` \| `haughtyeyes+ota` (default) |
| `--repo URL` / `--ref REF` | Custom source (overrides `--source`) |
| `-h, --help` | Full help |

```bash
./build_ipatool.sh --choice 1                   # Linux packages + macOS dev binary
./build_ipatool.sh --darwin                     # macOS dev binary only
./build_ipatool.sh --arch arm64                 # Linux arm64 package only
./build_ipatool.sh --source haughtyeyes+ota --arch all --darwin
```

After upgrading ipatool, **re-download IPAs** for OTA. Verify: `server/bin/ipatool download -h | grep ota-compat`

First Apple ID login on a Linux VPS needs extra host memory or swap — see [Note → Linux VPS](#linux-vps-memory--swap-first-apple-id-login).

## Acknowledgements

Docker images bundle ipatool from source (`haughtyeyes+ota`). Thanks to:

- [majd/ipatool](https://github.com/majd/ipatool/) — base CLI (MIT License)
- [HaughtyEyes/ipatool](https://github.com/HaughtyEyes/ipatool/tree/fix-empty-volume-store-response) — empty App Store response fixes ([#538](https://github.com/majd/ipatool/issues/538), [#547](https://github.com/majd/ipatool/issues/547))
- [iosconstantine/ipatool](https://github.com/iosconstantine/ipatool/tree/feat/ota-compat-flag) — `--ota-compat` design for OTA install ([#540](https://github.com/majd/ipatool/issues/540), [#469](https://github.com/majd/ipatool/pull/469))

---

## 什么是 IPA
IPA 文件是苹果 iOS 和 iPadOS 应用的存档文件，你可以理解成安装包，本工具下载的 IPA 都会经过签名，早期的 iTunes 就可以直接下载到一样的档案，如果当作压缩包解压后能看到详尽的元数据。

## IPA 安装

下载 IPA 后，用户可以使用其他工具进行安装。

### 下载后的 ipa 档案如何安装到 iPad / iPhone？

比较新版本的系统直接走 Airdrop，如果设备为老系统，Mac 可以 [Apple Configurator](https://apps.apple.com/app/id1037126344)，Windows 建议去下载 12.6.3 的 iTunes，目前不建议任何其他第三方的侧载工具。

> iTunes 可以去 [ipsw.me/iTunes](https://ipsw.me/iTunes) 找到

IPA-Harbor 也支持通过 Safari 直接安装 IPA，但此功能需要满足额外的部署条件：

- 仅 **iPhone / iPad / Apple 芯片 Mac** 可用，请在设备上用 **Safari** 打开站点。
- 站点须为 **HTTPS**，HTTP 下不会显示「安装」按钮。
  - 容器内置 HTTPS：`-p 443:3443`、`-e HTTPS_PORT=3443`、`-v ipa_certs:/app/certs`，卷内放置 `server.crt` 与 `server.key`（也可绑定挂载这两个文件）
  - 亦可用 nginx 监听 443 反代，见 [公网环境启动命令](#公网环境启动命令自签证书或者指定证书)
- 可在 **设置 → 启用 OTA 安装** 中开关（非 Apple 设备上默认关闭）。
- IPA 须由带 `--ota-compat` 的 ipatool 下载，感谢 [iosconstantine/ipatool](https://github.com/iosconstantine/ipatool/tree/feat/ota-compat-flag) 的 `--ota-compat` 方案 ([#540](https://github.com/majd/ipatool/issues/540))；见 [ipatool 与镜像](#ipatool-与镜像)。

因此，如果只是使用 IPA-Harbor 下载 ipa，可以直接使用普通的 Docker 部署方式；如果需要通过 Safari 直接安装，请参考 [相关配置说明](#公网环境启动命令自签证书或者指定证书)。

## 项目如何开始的
我以前每次想下一个旧版 ipa 都要抓包，然后 AirDrop 给 iPhone 后面逛帖子时发现 ipatool ，后面拿电脑扣命令，是在是厌烦了，可读的版本号也没有，所以有了想法写这个。

另外，有一个 ipatool.ts 的项目，也非常好。我不想维护 ipatool 核心，镜像默认用子模块 [HaughtyEyes/ipatool](https://github.com/HaughtyEyes/ipatool) + OTA 补丁从源码编译，站在社区修复之上，感谢 [majd/ipatool](https://github.com/majd/ipatool) 及上述贡献者。

目前我自用已经有一年时间，两个地区的 ID 都没被封过。Apple ID 与容器使用建议见文首说明及 [注意](#注意)。


## 快速开始
### 本机快速启动命令
+ 适用 Docker 就装在本机的，例如 [Docker Desktop](https://www.docker.com/products/docker-desktop/) 或者 [OrbStack](https://orbstack.dev/)，建议首次尝试前执行以下内容进行体验

```bash
docker run -d \
  -p 3388:3080 \
  -e KEYCHAIN_PASSPHRASE=$(openssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10) \
  -e ADMIN_INIT_PIN=20251024 \
  -e PORT=3080 \
  -v ipa_data:/app/data \
  --name ipa-harbor \
  uuphy/ipa-harbor:latest
```


#### 一键脚本
安装 Docker Desktop 或 OrbStack，打开终端执行

```bash
curl -fsSL https://raw.githubusercontent.com/ij369/ipa-harbor/main/quick-deploy.zh.sh | bash
```

按照脚本提示可以进行安装，升级等管理操作

> [!WARNING]
> **首次 Apple ID 认证需要 Unicorn/SAP 模拟。建议宿主机至少有 ≥1 GB 可用内存，或 [配置 ≥2 GB Swap](#linux-vps首次-apple-id-登录与内存)。**

然后打开浏览器访问： http://localhost:3388

首次会创建管理员账户：其中，初始化 PIN 填 **`20251024`** 公网环境请务必使用随机值。

<br />

### 公网环境启动命令（自签证书或者指定证书）

```bash
docker run -d \
  -p 80:3080 \
  -p 443:3443 \
  -e KEYCHAIN_PASSPHRASE=$(openssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10) \
  -e ADMIN_INIT_PIN=$(openssl rand -base64 24 | tr -dc '0-9' | head -c8) \
  -e PORT=3080 \
  -e HTTPS_PORT=3443 \
  -e ALLOW_LAN_ACCESS=false \
  -e ALLOWED_DOMAINS=example.com \
  -v ipa_data:/app/data \
  -v ipa_certs:/app/certs \
  --name ipa-harbor \
  uuphy/ipa-harbor:latest
```

ipa_certs 卷内需要放置两个证书文件（`server.crt` 和 `server.key`），你也可以直接绑定 `/app/certs/server.crt` 和 `/app/certs/server.key` 到指定文件。
然后打开浏览器访问： http://your-domain.com 和 https://your-domain.com 即可访问。
注意，局域网访问需要 `ALLOW_LAN_ACCESS=true`。

首次访问请打开 `/setup`，使用上文命令中的 `ADMIN_INIT_PIN`。请妥善保存以便恢复时使用。

<br />

### 公网环境启动命令（nginx 反向代理）
+ 这样简化成直接代理 http 端口（环境变量 PORT）
+ 经 nginx、Cloudflare 等反代时需加 `-e TRUST_PROXY=1`（下方命令已包含），限流才按真实客户端 IP 计数；直连访问不要设置

假设你拥有一个域名 `example.com`
使用了 `docker network create my_network` 来创建了一个 `my_network` 网络
并将 nginx 的容器加入到了该 `my_network` 内
这时，给 `ipa-harbor` 设置一个 hostname 为 `ipa_harbor`

对应的命令为
```bash
docker run -d \
  -e KEYCHAIN_PASSPHRASE=$(openssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10) \
  -e ADMIN_INIT_PIN=$(openssl rand -base64 24 | tr -dc '0-9' | head -c8) \
  -e PORT=3080 \
  -e ALLOW_LAN_ACCESS=false \
  -e ALLOWED_DOMAINS=example.com \
  -e TRUST_PROXY=1 \
  -v ipa_data:/app/data \
  -v ipa_certs:/app/certs \
  --hostname ipa_harbor \
  --name ipa-harbor \
  uuphy/ipa-harbor:latest
```

```
server {
    listen 80;
    server_name example.com;
        
    location = /robots.txt {
        add_header  Content-Type  text/plain;
        return 200 "User-agent: *\nDisallow: /\n";
    }
    location / {
        proxy_pass http://ipa_harbor:3080;

        # --- 前端包含 WebSocket 功能用于进度展示 必须添加这个 ---
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        #  --- 可选：防止长连接超时 --- 
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}

```

然后打开浏览器访问： http://example.com 即可访问，同样的也可以 nginx 监听 443 端口配置好证书反代`http://ipa_harbor:3080` 实现 https 访问

首次访问请打开 `/setup`，使用上文命令中的 `ADMIN_INIT_PIN`。


### 参数说明

`-p 3388:3080`：将容器的 3080 端口映射到本地 3388 端口。

`-e ENABLE_MORE_LOGS=true` 会有更详细的日志

`-e KEYCHAIN_PASSPHRASE=X96A49763R`：随机生成密钥，保证 Keychain 安全，因为 Keychain 内存着 Apple ID 的访问权。

`-e ADMIN_INIT_PIN=...`：初始化 PIN，用于初始化以及重置管理员密码

`-e ADMIN_RECOVERY_ENABLED=true`（可选）：启用 `/recover`

`-e ALLOW_LAN_ACCESS=true` 允许局域网 IP 访问，默认开启，如果部署到公网建议设置为 `false`

`-e PORT=3080` 指定 http 访问端口，默认 3080，可选

`-e HTTPS_PORT=3443` 指定 https 访问端口，默认 3443，可选

`-e ALLOWED_DOMAINS=your-domain.com,another-domain.com`，在非 localhost 的情况下使用域名连接时，需要指定 origin，否则无法访问，使用 docker 的 network 时并通过其他容器代理访问时，建议加上主机名，使用 `,` 隔开

`-v ipa_data:/app/data`：持久化数据（IPA 文件、数据库等）。

`-v ipa_certs:/app/certs`：持久化证书。

`--name ipa-harbor`：容器名称。

**限流：** `/v1/` API 每 IP 每分钟 100 次。WebSocket 不受影响（不走 `/v1/`）。

如果你部署在公网，一定要有 `ALLOWED_DOMAINS`，并 `ALLOW_LAN_ACCESS=false` 实现前端访问白名单，在浏览器层面会受这个影响禁止访问：

```
-e ALLOWED_DOMAINS=your-domain.com,another-domain.com \
```

### 系统管理员认证登录
Passkey (可选) 可以提供更加方便、安全的登录方式，尤其适合支持 Passkey 的 Apple 设备和浏览器。
如果没有配置 Passkey，仍可使用用户名和密码的管理员认证方式登录。

如果需要启用这个功能，至少配置以下环境变量：

| 变量 | 说明 |
| --- | --- |
| `WEBAUTHN_RP_ID` | Relying Party ID，填站点域名**不含端口**，如 `example.com` |
| `WEBAUTHN_ALLOWED_ORIGINS` | 允许 WebAuthn 的浏览器 Origin 列表，半角逗号分隔，如 `https://example.com,http://localhost:5173`。**须与地址栏完全一致**（非常规端口时要带端口）。 |

**Origin 与 CORS 请保持一致：** 用户实际访问的地址，既要出现在 `ALLOWED_DOMAINS`（CORS）里，也要出现在 `WEBAUTHN_ALLOWED_ORIGINS` 里。两者不一致时，页面可能能打开，但 Passkey 登录/注册会失败。

详见 [`server/docker-compose.example.zh.yml`](https://github.com/ij369/ipa-harbor/blob/main/server/docker-compose.example.zh.yml)。


## 注意

建议每个容器仅登录一个 Apple ID。不同 Apple ID 建议使用独立容器，并尽量保持 Apple ID 所在地区与容器出口 IP 所在地区一致。

### Linux VPS：首次 Apple ID 登录与内存

在**宿主机**配置（非容器内）。约 1GB 内存的 VPS 建议加 2GB swap：

```bash
fallocate -l 2G /swapfile    # 创建 2GB 文件
chmod 600 /swapfile          # 仅 root 可读写
mkswap /swapfile             # 格式化为 swap
swapon /swapfile             # 立即启用
echo '/swapfile none swap sw 0 0' >> /etc/fstab   # 开机自动挂载
swapon --show && free -h     # 验证（应看到约 2G /swapfile）
```

配好后无需其他操作，照常在 Web 里绑定 Apple ID 即可。首次认证可能较慢（走 swap 时更明显），随后会进入二次验证（邮件或短信），多等一会儿，别重复点。

## 目录结构
```
ipa-harbor/
├── ipatool/                         - git 子模块（HaughtyEyes ipatool 源码）
├── server/
│   ├── api/                         - REST / WebSocket API
│   ├── app.js
│   ├── bin/
│   │   ├── ipatool                  - 开发用二进制（本机 macOS 或解压产物）
│   │   └── ipatool-*-linux-*.tar.gz - 构建 Docker 镜像用的 Linux 包
│   ├── patches/
│   │   └── ipatool-haughtyeyes-ota-compat.patch
│   ├── certs/                       - HTTPS 证书：server.crt、server.key
│   ├── data/                        - IPA、users.db、.ipatool 配置
│   ├── Dockerfile
│   ├── docker-compose.example.yml
│   └── static/                      - 构建后的前端（生产环境）
├── client/                          - Vite + React 前端源码
├── build_zh.sh                      - 构建 Docker 镜像
├── build_ipatool_zh.sh              - 从源码编译 ipatool
├── build.sh                         - 构建 Docker 镜像（英文）
├── build_ipatool.sh                 - 从源码编译 ipatool（英文）
└── dl_latest.sh                     - 下载官方 ipatool release
```
### 开发

```bash
git clone --recurse-submodules https://github.com/ij369/ipa-harbor.git
# 或：git submodule update --init ipatool
```

#### 后端
```bash
cd server && npm i && nodemon
```
macOS 上 nodemon 重启可能触发系统钥匙串授权（凭证在系统钥匙串，不在 `~/.ipatool`）。

#### 前端
```bash
cd client && pnpm i && pnpm dev
```
开发地址 `localhost:5173`；局域网访问需在后端设置 `allowLAN`（见参数说明）。

#### ipatool 与镜像

```bash
# 编译 ipatool（默认 haughtyeyes+ota）
chmod +x build_ipatool_zh.sh && ./build_ipatool_zh.sh

# 构建 Docker 镜像（会询问是否更新 ipatool，已编译可选 n）
chmod +x build_zh.sh && ./build_zh.sh
```

**说明**

默认预设 **`haughtyeyes+ota`**（子模块 `ipatool/` + OTA 补丁 → `server/bin/ipatool`）。官方 [releases](https://github.com/majd/ipatool/releases) v2.5.0 不含空响应修复 ([#538](https://github.com/majd/ipatool/issues/538)、[#547](https://github.com/majd/ipatool/issues/547)) 与 OTA ([#540](https://github.com/majd/ipatool/issues/540))，详见 [致谢](#致谢)。

| 场景 | 命令 |
| --- | --- |
| 仅用官方 release（无上述修复） | `./dl_latest.sh` 后 `./build_zh.sh --no-fetch` |

`build_ipatool_zh.sh` 无参数时进入交互菜单（直接回车 = 选项 1）：

| 参数 | 说明 |
| --- | --- |
| `--choice N` | 非交互：`1` Linux（arm64+amd64）+ macOS，`2` 仅 macOS，`3` Linux arm64，`4` Linux amd64 |
| `--arch ARCH` | 仅 Linux：`amd64` \| `arm64` \| `all`（与 `--darwin` 组合时跳过菜单） |
| `--darwin` | 额外编译本机 macOS 二进制 → `server/bin/ipatool` |
| `--source NAME` | `official` \| `haughtyeyes` \| `ota` \| `haughtyeyes+ota`（默认） |
| `--repo URL` / `--ref REF` | 自定义源码（覆盖 `--source`） |
| `-h, --help` | 完整帮助 |

```bash
./build_ipatool_zh.sh --choice 1                   # Linux 包 + macOS 开发二进制
./build_ipatool_zh.sh --darwin                     # 仅 macOS 开发二进制
./build_ipatool_zh.sh --arch arm64                 # 仅 Linux arm64 包
./build_ipatool_zh.sh --source haughtyeyes+ota --arch all --darwin
```

升级 ipatool 后，OTA 用 IPA **须重新下载**。验证：`server/bin/ipatool download -h | grep ota-compat`

Linux VPS 首次 Apple ID 登录需宿主机足够内存或 swap，见 [注意 → Linux VPS](#linux-vps首次-apple-id-登录与内存)。

## 致谢

镜像内 ipatool 从源码编译（`haughtyeyes+ota`），感谢：

- [majd/ipatool](https://github.com/majd/ipatool/) — 基础 CLI（MIT License）
- [HaughtyEyes/ipatool](https://github.com/HaughtyEyes/ipatool/tree/fix-empty-volume-store-response) — 空 App Store 响应修复 ([#538](https://github.com/majd/ipatool/issues/538)、[#547](https://github.com/majd/ipatool/issues/547))
- [iosconstantine/ipatool](https://github.com/iosconstantine/ipatool/tree/feat/ota-compat-flag) — OTA `--ota-compat` 方案 ([#540](https://github.com/majd/ipatool/issues/540)、[#469](https://github.com/majd/ipatool/pull/469))

