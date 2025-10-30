# IPA-Harbor
本项目是一个基于 ipatool 的开源 IPA 可视化 Web 管理工具 , 支持 App 搜索、历史版本下载与 Docker 容器化部署。

[快速开始](#快速开始)

## 项目如何开始的
我以前每次想下一个旧版 ipa 都要抓包，然后 AirDrop 给 iPhone 后面逛帖子时发现 ipatool ，后面拿电脑扣命令，是在是厌烦了，可读的版本号也没有，所以有了想法写这个。

另外，有一个 ipatool.ts 的项目，也非常好，不过我不想维护 ipatool 核心的部分，直接去 ipatool 项目的发版页下载最新的二进制文件，拷贝到我这个项目的 bin 目录即可，正所谓大树下好乘凉，感谢 ipatool 的贡献者，同时省去大家时间。

目前我自用已经有一年时间，两个地区的 ID 都没被封过，非常建议使用的话拿独立的 Apple ID 独立的容器运行，没有花钱购买应用的 ID，这样能避免损失，具体可以去 App Store 进行切换登录，其实折腾这个的不一定只有一个 ID 吧。


## 快速开始
### 本机快速启动命令

```bash
docker run -d \
  -p 3388:3080 \
  -e KEYCHAIN_PASSPHRASE=$(openssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10) \
  -e PORT=3080 \
  -v ipa_data:/app/data \
  -v ipa_certs:/app/certs \
  --name ipa-harbor \
  uuphy/ipa-harbor:latest
```

然后打开浏览器访问： http://localhost:3388

首次登录会进入配置管理员密码，用于后续进入面板。


### 参数说明

-p 3388:3080：将容器的 3080 端口映射到本地 3388 端口。

KEYCHAIN_PASSPHRASE：随机生成密钥，保证 Keychain 安全, 因为 Keychain 内存着 Apple ID 的访问权。

-v ipa_data:/app/data：持久化数据（IPA 文件、数据库等）。

-v ipa_certs:/app/certs：持久化证书。

--name ipa-harbor：容器名称。

如果你部署在公网一定要有`ALLOWED_DOMAINS`, 实现前端访问白名单，仅在浏览器层面禁止:

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
├── certs/
├── config/
├── data/
├── Dockerfile
├── ipatool/
├── middleware/
├── nodemon.json
├── package-lock.json
├── package.json
├── static/
└── utils/
```

---

The open-source release was done rather quickly; i18n translations will be added in future commits.

## Acknowledgements

This project is based on the work of the following project:
[majd/ipatool](https://github.com/majd/ipatool/)