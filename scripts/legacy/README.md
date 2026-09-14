# Legacy ipatool 源码编译（已废弃）

Docker 镜像 **0.1.8**、**0.1.9**、**0.1.10** 使用本目录脚本从源码编译 ipatool。当前 main 已改用 [`dl_latest.sh`](../dl_latest.sh) 拉取官方 [majd/ipatool](https://github.com/majd/ipatool) release（v2.6.0+）。

## 背景

当时官方 release 缺少以下修复，故基于社区 fork + OTA 补丁编译：

- [HaughtyEyes/ipatool](https://github.com/HaughtyEyes/ipatool/tree/fix-update-product-fallback) — 空 App Store 响应 / volumeStore、redownload 等（[#538](https://github.com/majd/ipatool/issues/538)、[#547](https://github.com/majd/ipatool/issues/547)），子模块固定 commit `741049d90d4c5c8b49aa67a6d022cbf7e901272c`
- [iosconstantine/ipatool](https://github.com/iosconstantine/ipatool/tree/feat/ota-compat-flag) — OTA / itms-services 的 `--ota-compat` 方案（[#540](https://github.com/majd/ipatool/issues/540)），补丁 [`ipatool-haughtyeyes-ota-compat.patch`](./ipatool-haughtyeyes-ota-compat.patch) 将其合入上述 fork

自 [ipatool v2.6.0](https://github.com/majd/ipatool/releases/tag/v2.6.0) 起上述能力已并入官方（OTA 见 [#560](https://github.com/majd/ipatool/pull/560)）。旧镜像下载的 IPA 若需 OTA，须用对应 ipatool 重新下载；配合旧版服务端时下载须带 `--ota-compat`。

## 构建

脚本按**仓库根目录**路径编写，须先复制到根目录再执行：

```bash
cp scripts/legacy/build_ipatool.sh scripts/legacy/build_ipatool_zh.sh .
mkdir -p server/patches
cp scripts/legacy/ipatool-haughtyeyes-ota-compat.patch server/patches/

git clone https://github.com/HaughtyEyes/ipatool.git ipatool
cd ipatool && git checkout 741049d90d4c5c8b49aa67a6d022cbf7e901272c && cd ..

./build_ipatool_zh.sh --choice 1
```

英文脚本：`build_ipatool.sh`（参数相同）。
