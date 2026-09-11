#!/usr/bin/env bash
# 从 ipatool main 分支源码编译（含 list-purchases，官方 release 尚未包含）
# 默认交互询问编译目标；Linux 包通过 Docker 在对应架构容器内原生编译
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${SCRIPT_DIR}/server/bin"
CACHE_DIR="${SCRIPT_DIR}/server/.cache"
SUBMODULE_DIR="${SCRIPT_DIR}/ipatool"
SRC_DIR="${CACHE_DIR}/ipatool-src"
GO_MOD_CACHE="${CACHE_DIR}/go-mod"
GO_BUILD_CACHE="${CACHE_DIR}/go-build"
BUILD_DARWIN=0
BUILD_LINUX=0
BUILD_ARCHES=()
IPATOOL_SOURCE="haughtyeyes+ota"
IPATOOL_REPO=""
IPATOOL_REF=""
IPATOOL_USE_SUBMODULE=0
IPATOOL_APPLY_OTA_PATCH=0
IPATOOL_OTA_PATCH="${IPATOOL_OTA_PATCH:-${SCRIPT_DIR}/server/patches/ipatool-haughtyeyes-ota-compat.patch}"
REPO_EXPLICIT=0
REF_EXPLICIT=0
GO_IMAGE="${GO_IMAGE:-golang:1.25-bookworm}"

resolve_ipatool_source() {
  IPATOOL_USE_SUBMODULE=0
  IPATOOL_APPLY_OTA_PATCH=0

  case "$IPATOOL_SOURCE" in
    official|majd|default)
      IPATOOL_REPO="${IPATOOL_REPO:-https://github.com/majd/ipatool.git}"
      IPATOOL_REF="${IPATOOL_REF:-main}"
      ;;
    haughtyeyes|fork|empty-volume-store)
      IPATOOL_USE_SUBMODULE=1
      IPATOOL_REPO="${IPATOOL_REPO:-https://github.com/HaughtyEyes/ipatool.git}"
      IPATOOL_REF="${IPATOOL_REF:-fix-update-product-fallback}"
      ;;
    ota|iosconstantine|ota-compat)
      IPATOOL_REPO="${IPATOOL_REPO:-https://github.com/iosconstantine/ipatool.git}"
      IPATOOL_REF="${IPATOOL_REF:-feat/ota-compat-flag}"
      ;;
    haughtyeyes+ota|haughtyeyes-ota|full|both)
      IPATOOL_USE_SUBMODULE=1
      IPATOOL_APPLY_OTA_PATCH=1
      IPATOOL_REPO="${IPATOOL_REPO:-https://github.com/HaughtyEyes/ipatool.git}"
      IPATOOL_REF="${IPATOOL_REF:-fix-update-product-fallback}"
      ;;
    *)
      echo "未知源码: $IPATOOL_SOURCE（可选 official | haughtyeyes | ota | haughtyeyes+ota）" >&2
      exit 1
      ;;
  esac
}

show_ipatool_source() {
  resolve_ipatool_source
  local label="$IPATOOL_SOURCE"
  if [[ "$REPO_EXPLICIT" -eq 1 || "$REF_EXPLICIT" -eq 1 ]]; then
    label="custom"
  fi
  if [[ "$IPATOOL_USE_SUBMODULE" -eq 1 ]]; then
    echo "当前源码 (${label}): git submodule ipatool"
    if git -C "${SUBMODULE_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      echo "  Submodule commit: $(git -C "${SUBMODULE_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    fi
  else
    echo "当前源码 (${label}): ${IPATOOL_REPO} @ ${IPATOOL_REF}"
  fi
  if [[ "$IPATOOL_APPLY_OTA_PATCH" -eq 1 ]]; then
    echo "OTA 补丁: ${IPATOOL_OTA_PATCH}"
  fi
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

  从源码编译 ipatool。无参数时默认交互选择编译目标（直接回车选 1）。

Options:
  --choice N    非交互指定选项：1 | 2 | 3 | 4 | 0（0 为退出）
  --arch ARCH   仅编译 Linux：amd64 | arm64 | all（与 --darwin 组合时跳过菜单）
  --darwin      额外编译本机 macOS 二进制到 server/bin/ipatool
  --source NAME 源码预设：official | haughtyeyes | ota | haughtyeyes+ota（默认 haughtyeyes+ota）
  --repo URL    自定义源码仓库地址
  --ref REF     自定义分支、tag 或 commit
  -h, --help    显示帮助

环境变量:
  GO_IMAGE       编译用 Docker 镜像（默认 golang:1.25-bookworm）

源码预设:
  official       majd/ipatool @ main
  haughtyeyes    git submodule ipatool（HaughtyEyes @ fix-empty-volume-store-response）
  ota            iosconstantine/ipatool @ feat/ota-compat-flag（支持 --ota-compat，用于 itms-services OTA 安装）
  haughtyeyes+ota  git submodule ipatool + OTA 兼容补丁（ipa-harbor 推荐）

说明:
  haughtyeyes / haughtyeyes+ota 使用 ipatool/ 子模块。首次请先执行: git submodule update --init ipatool
  首次编译较慢（拉镜像 + 下载 Go 依赖）。非 submodule 源码会复用 server/.cache。
  切换 --source 或 --repo 时会清除旧缓存并重新 clone（不含 submodule 预设）。
  Apple Silicon 上编译 linux/amd64 需 QEMU 模拟，比 arm64 慢很多。
EOF
}

apply_choice() {
  local choice="$1"
  BUILD_LINUX=0
  BUILD_DARWIN=0
  BUILD_ARCHES=()

  case "$choice" in
    1)
      BUILD_LINUX=1
      BUILD_ARCHES=(amd64 arm64)
      BUILD_DARWIN=1
      ;;
    2)
      BUILD_DARWIN=1
      ;;
    3)
      BUILD_LINUX=1
      BUILD_ARCHES=(arm64)
      ;;
    4)
      BUILD_LINUX=1
      BUILD_ARCHES=(amd64)
      ;;
    0)
      echo "已退出。"
      exit 0
      ;;
    *)
      echo "无效选项: $choice" >&2
      exit 1
      ;;
  esac
}

prompt_choice() {
  cat <<EOF
请选择编译目标（直接回车默认 1）：
  1. Linux 包（arm64 + amd64）+ 本机 macOS 开发二进制
  2. 本机 macOS 开发二进制
  3. Linux 包（arm64）
  4. Linux 包（amd64）
  0. 退出
EOF
  local ans=""
  read -r -p "> " ans || true
  ans="${ans:-1}"
  apply_choice "$ans"
}

BUILD_CLI_ARGS=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --choice)
      [[ $# -ge 2 ]] || { echo "缺少 --choice 参数" >&2; exit 1; }
      BUILD_CLI_ARGS=1
      apply_choice "$2"
      shift 2
      ;;
    --arch)
      [[ $# -ge 2 ]] || { echo "缺少 --arch 参数" >&2; exit 1; }
      BUILD_CLI_ARGS=1
      BUILD_LINUX=1
      case "$2" in
        amd64|arm64) BUILD_ARCHES=("$2") ;;
        all) BUILD_ARCHES=(amd64 arm64) ;;
        *)
          echo "未知架构: $2（可选 amd64 | arm64 | all）" >&2
          exit 1
          ;;
      esac
      shift 2
      ;;
    --darwin)
      BUILD_CLI_ARGS=1
      BUILD_DARWIN=1
      shift
      ;;
    --source)
      [[ $# -ge 2 ]] || { echo "缺少 --source 参数" >&2; exit 1; }
      IPATOOL_SOURCE="$2"
      shift 2
      ;;
    --repo)
      [[ $# -ge 2 ]] || { echo "缺少 --repo 参数" >&2; exit 1; }
      IPATOOL_REPO="$2"
      REPO_EXPLICIT=1
      shift 2
      ;;
    --ref)
      [[ $# -ge 2 ]] || { echo "缺少 --ref 参数" >&2; exit 1; }
      IPATOOL_REF="$2"
      REF_EXPLICIT=1
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

show_ipatool_source

if [[ "$BUILD_CLI_ARGS" -eq 0 ]]; then
  if [[ -t 0 ]]; then
    prompt_choice
  else
    apply_choice 1
  fi
elif [[ "$BUILD_LINUX" -eq 0 ]] && [[ "$BUILD_DARWIN" -eq 0 ]]; then
  echo "请指定 --choice，或使用 --arch / --darwin。" >&2
  exit 1
fi

if [[ "$BUILD_LINUX" -eq 1 ]] && ! command -v docker >/dev/null 2>&1; then
  echo "编译 Linux 包需要 Docker: https://docs.docker.com/get-docker/" >&2
  exit 1
fi

if [[ "$BUILD_DARWIN" -eq 1 ]] && ! command -v go >/dev/null 2>&1; then
  echo "编译 macOS 二进制需要本机安装 Go: https://go.dev/dl/" >&2
  exit 1
fi

mkdir -p "$BIN_DIR" "$GO_MOD_CACHE" "$GO_BUILD_CACHE"

get_patch_key() {
  if [[ "$IPATOOL_APPLY_OTA_PATCH" -eq 1 ]]; then
    shasum -a 256 "$IPATOOL_OTA_PATCH" | awk '{print $1}'
    return
  fi
  printf ''
}

apply_ota_compat_patch() {
  [[ "$IPATOOL_APPLY_OTA_PATCH" -eq 1 ]] || return 0

  if grep -q 'ota-compat' "${SRC_DIR}/cmd/download.go" 2>/dev/null; then
    echo "OTA 兼容补丁已应用，跳过"
    return 0
  fi

  if [[ ! -f "$IPATOOL_OTA_PATCH" ]]; then
    echo "找不到 OTA 补丁: ${IPATOOL_OTA_PATCH}" >&2
    exit 1
  fi

  echo "应用 OTA 兼容补丁 …"
  if ! git -C "$SRC_DIR" apply --check "$IPATOOL_OTA_PATCH" 2>/dev/null; then
    echo "OTA 补丁无法应用到 ipatool @ $(git -C "$SRC_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)。" >&2
    echo "请更新 ${IPATOOL_OTA_PATCH} 或升级 ipatool 子模块 commit。" >&2
    exit 1
  fi
  git -C "$SRC_DIR" apply "$IPATOOL_OTA_PATCH"
}

sync_submodule_source() {
  local desired_patch_key marker_file="${CACHE_DIR}/ipatool-patch-key"
  desired_patch_key="$(get_patch_key)"

  SRC_DIR="${SUBMODULE_DIR}"

  if git -C "$SRC_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "同步前重置子模块工作区 …"
    git -C "$SRC_DIR" reset --hard HEAD
    git -C "$SRC_DIR" clean -fd
  fi

  echo "更新 ipatool 子模块 …"
  git -C "${SCRIPT_DIR}" submodule update --init ipatool

  if ! git -C "$SRC_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "ipatool 子模块初始化失败，请先执行:" >&2
    echo "  git submodule update --init ipatool" >&2
    exit 1
  fi

  echo "同步子模块到 ${IPATOOL_REF} …"
  git -C "$SRC_DIR" remote set-url origin "$IPATOOL_REPO" 2>/dev/null \
    || git -C "$SRC_DIR" remote add origin "$IPATOOL_REPO"
  git -C "$SRC_DIR" fetch --depth 1 origin "$IPATOOL_REF"
  git -C "$SRC_DIR" checkout -f FETCH_HEAD
  git -C "$SRC_DIR" reset --hard HEAD
  git -C "$SRC_DIR" clean -fd

  apply_ota_compat_patch
  printf '%s' "$desired_patch_key" > "$marker_file"
}

sync_cached_source() {
  local cached_remote=""
  local desired_patch_key marker_file="${CACHE_DIR}/ipatool-patch-key"
  desired_patch_key="$(get_patch_key)"

  SRC_DIR="${CACHE_DIR}/ipatool-src"

  if [[ -d "${SRC_DIR}/.git" && -f "$marker_file" ]]; then
    if [[ "$(cat "$marker_file")" != "$desired_patch_key" ]]; then
      echo "OTA 补丁组合已变更，重新 clone …"
      rm -rf "$SRC_DIR"
    fi
  fi

  if [[ -d "${SRC_DIR}/.git" ]]; then
    cached_remote="$(git -C "$SRC_DIR" remote get-url origin 2>/dev/null || true)"
    if [[ -n "$cached_remote" && "$cached_remote" != "$IPATOOL_REPO" ]]; then
      echo "源码仓库已切换（${cached_remote} -> ${IPATOOL_REPO}），重新 clone …"
      rm -rf "$SRC_DIR"
    fi
  fi

  if [[ -d "${SRC_DIR}/.git" ]]; then
    echo "Updating cached source (${IPATOOL_REPO} @ ${IPATOOL_REF}) …"
    git -C "$SRC_DIR" remote set-url origin "$IPATOOL_REPO"
    git -C "$SRC_DIR" fetch --depth 1 origin "$IPATOOL_REF"
    git -C "$SRC_DIR" checkout -f FETCH_HEAD
  else
    echo "Cloning ${IPATOOL_REPO} (${IPATOOL_REF}) …"
    rm -rf "$SRC_DIR"
    git clone --depth 1 --branch "$IPATOOL_REF" "$IPATOOL_REPO" "$SRC_DIR" 2>/dev/null \
      || git clone --depth 1 "$IPATOOL_REPO" "$SRC_DIR"
    git -C "$SRC_DIR" fetch --depth 1 origin "$IPATOOL_REF"
    git -C "$SRC_DIR" checkout -f FETCH_HEAD
  fi

  git -C "$SRC_DIR" fetch --depth 1 origin 'refs/tags/v*' 2>/dev/null || true
  apply_ota_compat_patch
  printf '%s' "$desired_patch_key" > "$marker_file"
}

sync_source() {
  if [[ "$IPATOOL_USE_SUBMODULE" -eq 1 ]]; then
    sync_submodule_source
    return
  fi
  sync_cached_source
}

sync_source

VERSION=$(git -C "$SRC_DIR" describe --tags --always | sed 's/^v//')
if [[ "$VERSION" =~ ^[0-9a-f]{7,}$ ]]; then
  VERSION="2.4.0-dev.${VERSION}"
fi
echo "Build version: ${VERSION}"

LDFLAGS="-s -w -X github.com/majd/ipatool/v2/cmd.version=${VERSION}"

build_linux_docker() {
  local arch="$1"
  local bin_name="ipatool-${VERSION}-linux-${arch}"
  local staging="${SRC_DIR}/dist/linux-${arch}"
  local tar_path="${BIN_DIR}/ipatool-${VERSION}-linux-${arch}.tar.gz"
  local start_ts=$SECONDS

  rm -rf "$staging"
  mkdir -p "${staging}/bin"

  echo "Building linux/${arch} (docker --platform linux/${arch}) …"
  docker run --rm \
    --platform "linux/${arch}" \
    -v "${SRC_DIR}:/src" \
    -v "${GO_MOD_CACHE}:/go/pkg/mod" \
    -v "${GO_BUILD_CACHE}:/go/cache" \
    -w /src \
    -e GOCACHE=/go/cache \
    -e GOMODCACHE=/go/pkg/mod \
    -e "LDFLAGS=${LDFLAGS}" \
    "$GO_IMAGE" \
    go build -trimpath -ldflags="$LDFLAGS" -o "/src/dist/linux-${arch}/bin/${bin_name}" .

  chmod +x "${staging}/bin/${bin_name}"
  rm -f "$tar_path"
  tar -czf "$tar_path" -C "$staging" bin
  echo "  -> ${tar_path} ($(( SECONDS - start_ts ))s)"
}

build_darwin() {
  local host_arch goarch out start_ts
  host_arch="$(uname -m)"
  case "$host_arch" in
    arm64) goarch=arm64 ;;
    x86_64) goarch=amd64 ;;
    *)
      echo "本机架构不支持 macOS 编译: $host_arch" >&2
      exit 1
      ;;
  esac

  out="${BIN_DIR}/ipatool"
  if [[ -f "$out" ]]; then
    cp "$out" "${out}.bak.$(date +%Y%m%d%H%M%S)"
  fi

  start_ts=$SECONDS
  echo "Building darwin/${goarch} …"
  (
    cd "$SRC_DIR"
    CGO_ENABLED=1 GOOS=darwin GOARCH="$goarch" \
      GOMODCACHE="$GO_MOD_CACHE" GOCACHE="$GO_BUILD_CACHE" \
      go build -trimpath -ldflags="$LDFLAGS" -o "$out" .
  )
  chmod +x "$out"
  echo "  -> ${out} ($(( SECONDS - start_ts ))s)"
}

if [[ "$BUILD_LINUX" -eq 1 ]]; then
  for old_tar in "$BIN_DIR"/ipatool-*-linux-*.tar.gz; do
    [[ -e "$old_tar" ]] || continue
    rm -f "$old_tar" "${old_tar}.sha256sum"
  done

  total_start=$SECONDS
  pids=()
  for arch in "${BUILD_ARCHES[@]}"; do
    build_linux_docker "$arch" &
    pids+=($!)
  done

  build_failed=0
  for pid in "${pids[@]}"; do
    wait "$pid" || build_failed=1
  done
  [[ "$build_failed" -eq 0 ]] || exit 1
  echo "linux 编译完成，耗时 $(( SECONDS - total_start ))s"

  sample_arch="${BUILD_ARCHES[0]}"
  sample_tar="${BIN_DIR}/ipatool-${VERSION}-linux-${sample_arch}.tar.gz"
  if tar -tzf "$sample_tar" | grep -q 'bin/ipatool-'; then
    echo "linux tar.gz 结构校验通过"
  else
    echo "警告: tar.gz 结构异常" >&2
    exit 1
  fi
fi

if [[ "$BUILD_DARWIN" -eq 1 ]]; then
  build_darwin
  if "${BIN_DIR}/ipatool" -h 2>&1 | grep -q 'list-purchases'; then
    echo "list-purchases: OK (darwin)"
  else
    echo "警告: darwin 二进制未检测到 list-purchases" >&2
    exit 1
  fi
fi

if [[ "$BUILD_LINUX" -eq 1 ]]; then
  echo "Done. 可执行 ./build.sh 构建镜像。"
else
  echo "Done."
fi
