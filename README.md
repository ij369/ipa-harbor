# IPA-Harbor
This project is an open-source IPA visualization web management tool built on top of **ipatool**.  
It supports app search, historical version downloads, and containerized deployment with Docker.

本项目是一个基于 **ipatool** 的开源 IPA 可视化 Web 管理工具，  
支持 App 搜索、历史版本下载与 Docker 容器化部署。

[Quick Start](#quick-start) | [快速开始](#快速开始)

## Quick Start
### Local Quick Start Command
+ Suitable for Docker installed locally (e.g., Docker Desktop or OrbStack).  
  Recommended to run the following command for your first experience.

```bash
docker run -d \
  -p 3388:3080 \
  -e KEYCHAIN_PASSPHRASE=$(openssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10) \
  -e PORT=3080 \
  -v ipa_data:/app/data \
  --name ipa-harbor \
  uuphy/ipa-harbor:latest
```

Then open your browser and visit: http://localhost:3388

The first login will prompt you to configure the admin password for accessing the panel later.

<br />

### Public Network Startup Command (Self-signed Certificate or Specified Certificate)

```bash
docker run -d \
  -p 80:3080 \
  -p 443:3443 \
  -e KEYCHAIN_PASSPHRASE=$(openssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10) \
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

The first login will prompt you to configure the admin password for accessing the panel later.

<br />

### Public Network Startup Command (nginx reverse proxy)
+ This simplifies to directly proxy the http port (environment variable PORT)

Assuming you own a domain `example.com`
Used `docker network create my_network` to create a `my_network` network
And added the nginx container to the `my_network` network
At this point, set a hostname for `ipa-harbor` as `ipa_harbor`

The corresponding command is
```bash
docker run -d \
  -e KEYCHAIN_PASSPHRASE=$(openssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10) \
  -e PORT=3080 \
  -e ALLOW_LAN_ACCESS=false \
  -e ALLOWED_DOMAINS=example.com \
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

The first login will prompt you to configure the admin password for accessing the panel later.


### Parameter Description

`-p 3388:3080`: Maps container port 3080 to local port 3388.

`-e ENABLE_MORE_LOGS=true` enables more detailed logs.

`-e KEYCHAIN_PASSPHRASE=X96A49763R`: Randomly generated key to ensure Keychain security, as the Keychain stores Apple ID access credentials.

`-e ALLOW_LAN_ACCESS=true` allows LAN IP access, enabled by default. If deploying to public network, it is recommended to set to `false`.

`-e PORT=3080` specifies the http access port, default 3080, optional.

`-e HTTPS_PORT=3443` specifies the https access port, default 3443, optional.

`-e ALLOWED_DOMAINS=your-domain.com,another-domain.com`: When using domain connections outside of localhost, you need to specify the origin, otherwise access will be denied. When using Docker networks and proxying through other containers, it is recommended to include the hostname, separated by commas.

`-v ipa_data:/app/data`: Persists data (IPA files, database, etc.).

`-v ipa_certs:/app/certs`: Persists certificates.

`--name ipa-harbor`: Container name.


If you deploy on public network, you must have `ALLOWED_DOMAINS` and set `ALLOW_LAN_ACCESS=false` to implement frontend access whitelist. This will affect browser-level access restrictions:

```
-e ALLOWED_DOMAINS=your-domain.com,another-domain.com \
```

## Note

It is recommended to use a single container with a single Apple ID login, as each container has an independent MAC address. The ID should ideally use the same region as the container host IP.

## Directory Structure
```
server/
├── api/
├── app.js
├── bin/     
├──── ipatool          - Extracted ipatool binary file (needs to match current architecture)
├── certs/
├── config/
├── data/
├── Dockerfile
├── middleware/
├── node_modules/
├── nodemon.json
├── package-lock.json
├── package.json
├── static/
└── utils/
client/
├── node_modules/
├── public/
├── src/
├── eslint.config.js
├── index.html
├── package.json
├── pnpm-lock.yaml
└── vite.config.js
```
### Development
First download the latest ipatool assets according to your development computer's CPU architecture
`https://github.com/majd/ipatool/releases`

Extract, then rename the binary file to `ipatool`, directory structure:
```text
server/bin/ipatool
```

#### Backend
```bash
npm i
nodemon
```
There's a small issue:
If on macOS, each time nodemon restarts or makes a request, it will trigger the system keychain prompt. This must be authorized, because macOS keychain is not stored in ~/.ipatool directory, but in the system keychain.

#### Frontend
```bash
pnpm i
pnpm dev
```
Currently using `localhost:5173` to access. If you need to allow LAN IP:5173 access, you need to set environment variables in the backend. See parameter description `allowLAN` for details.

#### Build

Here use a script to download the latest image
```bash
chmod +x dl_latest.sh
```
```bash
dl_latest.sh
```
After downloading, do not decompress the gz file or rename it. Dockerfile will handle it automatically.

Build image and load into local image library
```
docker build -t ipaharbor . --load
```


## Acknowledgements

This project is based on the work of the following open-source project:

- [majd/ipatool](https://github.com/majd/ipatool/)  
  Licensed under the MIT License.

---

## 什么是 IPA
IPA 文件是苹果 iOS 和 iPadOS 应用的存档文件，你可以理解成安装包，本工具下载的 IPA 都会经过签名，早期的 iTunes 就可以直接下载到一样的档案，如果当作压缩包解压后能看到详尽的元数据。

### 下载后的 ipa 档案如何安装到 iPad/ iPhone？
比较新版本的系统直接走 Airdrop，如果设备为老系统，Mac 可以 [Apple Configurator](https://apps.apple.com/app/id1037126344), Windows 建议去下载 12.6.3 的 iTunes, 目前不建议任何其他第三方的侧载工具。

> iTunes 可以去 https://ipsw.me/iTunes 找到

### 下载后的 ipa 档案如何安装到 Mac？
如果是安装到 Apple Silicon 的 Mac，直接双击就能安装到 Mac。


## 项目如何开始的
我以前每次想下一个旧版 ipa 都要抓包，然后 AirDrop 给 iPhone 后面逛帖子时发现 ipatool ，后面拿电脑扣命令，是在是厌烦了，可读的版本号也没有，所以有了想法写这个。

另外，有一个 ipatool.ts 的项目，也非常好，不过我不想维护 ipatool 核心的部分，直接去 ipatool 项目的发版页下载最新的二进制文件，拷贝到我这个项目的 bin 目录即可，正所谓大树下好乘凉，感谢 ipatool 的贡献者，同时省去大家时间。

目前我自用已经有一年时间，两个地区的 ID 都没被封过，非常建议使用的话拿独立的 Apple ID 独立的容器运行，没有花钱购买应用的 ID，这样能避免损失，具体可以去 App Store 进行切换登录，其实折腾这个的不一定只有一个 ID 吧。


## 快速开始
### 本机快速启动命令
+ 适用 Docker 就装在本机的，例如Docker Desktop 或者 OrbStack, 建议首次尝试前执行以下内容进行体验

```bash
docker run -d \
  -p 3388:3080 \
  -e KEYCHAIN_PASSPHRASE=$(openssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10) \
  -e PORT=3080 \
  -v ipa_data:/app/data \
  --name ipa-harbor \
  uuphy/ipa-harbor:latest
```

然后打开浏览器访问： http://localhost:3388

首次登录会进入配置管理员密码，用于后续进入面板。

<br />

### 公网环境启动命令（自签证书或者指定证书）

```bash
docker run -d \
  -p 80:3080 \
  -p 443:3443 \
  -e KEYCHAIN_PASSPHRASE=$(openssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10) \
  -e PORT=3080 \
  -e HTTPS_PORT=3443 \
  -e ALLOW_LAN_ACCESS=false \
  -e ALLOWED_DOMAINS=example.com \
  -v ipa_data:/app/data \
  -v ipa_certs:/app/certs \
  --name ipa-harbor \
  uuphy/ipa-harbor:latest
```

ipa_certs 卷内需要放置两个证书文件 (`server.crt`和`server.key`)，你也可以直接绑定`/app/certs/server.crt` 和 `/app/certs/server.key` 到指定文件
然后打开浏览器访问： http://your-domain.com 和 https://your-domain.com 即可访问。
注意，局域网访问需要 `ALLOW_LAN_ACCESS=true`。

首次登录会进入配置管理员密码，用于后续进入面板。

<br />

### 公网环境启动命令（nginx 反向代理）
+ 这样简化成直接代理http端口（环境变量PORT）

假设你拥有一个域名 `example.com`
使用了 `docker network create my_network` 来创建了一个`my_network`网络
并将 nginx 的容器加入到了该 `my_network` 内
这时，给`ipa-harbor` 设置一个 hostname 为 `ipa_harbor`

对应的命令为
```bash
docker run -d \
  -e KEYCHAIN_PASSPHRASE=$(openssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10) \
  -e PORT=3080 \
  -e ALLOW_LAN_ACCESS=false \
  -e ALLOWED_DOMAINS=example.com \
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

首次登录会进入配置管理员密码，用于后续进入面板。


### 参数说明

`-p 3388:3080`：将容器的 3080 端口映射到本地 3388 端口。

`-e ENABLE_MORE_LOGS=true` 会有更详细的日志

`-e KEYCHAIN_PASSPHRASE=X96A49763R`：随机生成密钥，保证 Keychain 安全, 因为 Keychain 内存着 Apple ID 的访问权。

`-e ALLOW_LAN_ACCESS=true` 允许局域网IP访问，默认开启，如果部署到公网建议设置为`false`

`-e PORT=3080` 指定 http 访问端口，默认3080，可选

`-e HTTPS_PORT=3443` 指定 https 访问端口，默认3443，可选

`-e ALLOWED_DOMAINS=your-domain.com,another-domain.com`，在非 loaclhost 的情况下使用域名连接时，需要指定origin，否则无法访问，使用docker的network时并通过其他容器代理访问时，建议加上主机名，使用`,`隔开

`-v ipa_data:/app/data`：持久化数据（IPA 文件、数据库等）。

`-v ipa_certs:/app/certs`：持久化证书。

`--name ipa-harbor`：容器名称。


如果你部署在公网一定要有`ALLOWED_DOMAINS`, 并`ALLOW_LAN_ACCESS=false`实现前端访问白名单，在浏览器层面会受这个影响禁止访问:

```
-e ALLOWED_DOMAINS=your-domain.com,another-domain.com \
```

## 注意

建议单容器，登录单个Apple ID，因为单个容器有独立的 MAC 地址，ID 最好使用和容器宿主机 IP 相同的地区。

## 目录结构
```
server/
├── api/
├── app.js
├── bin/     
├──── ipatool          - 解压后的 ipatool 二进制文件 (需要符合当前架构)
├── certs/
├── config/
├── data/
├── Dockerfile
├── middleware/
├── node_modules/
├── nodemon.json
├── package-lock.json
├── package.json
├── static/
└── utils/
client/
├── node_modules/
├── public/
├── src/
├── eslint.config.js
├── index.html
├── package.json
├── pnpm-lock.yaml
└── vite.config.js
```
### 开发
先下载 ipatool 最新的资产, 按照开发时电脑的 CPU 架构进行下载
`https://github.com/majd/ipatool/releases`

解压，然后将二进制文件重命名为 `ipatool`, 目录结构为
```text
server/bin/ipatool
```

#### 后端
```bash
npm i
nodemon
```
有个小坑
如果是 macOS, 每次利用 nodemon 重启时或者请求时会触发系统的 keychain 提醒, 这里必须要授权, 因为 macOS 的 keychain 没有放到 ~/.ipatool 目录, 而是放到了系统的 keychain。

#### 前端
```bash
pnpm i
pnpm dev
```
目前都是使用 `localhost:5173` 进入，如果需要允许局域网 IP:5173 的形式, 需要在后端设置环境变量, 详细见 参数说明 `allowLAN`

#### 构建

这里用脚本进行下载最新镜像
```bash
chmod +x dl_latest.sh
```
```bash
dl_latest.sh
```
下载完毕后，文件不要对 gz 文件进行解压和修改文件名操作, Dockerfile 会自动处理

构建镜像并加载本地镜像库
```
docker build -t ipaharbor . --load
```

---

The open-source release was done rather quickly; i18n translations will be added in future commits.


## 致谢

本项目使用了以下开源项目的官方二进制文件：  

- [majd/ipatool](https://github.com/majd/ipatool/)  
  该项目采用 MIT License 开源协议。

