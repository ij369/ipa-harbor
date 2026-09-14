#!/usr/bin/env bash
# 从官方 majd/ipatool 源码编译：Linux arm64+amd64 包 + 本机 macOS 开发二进制
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BIN_DIR="${REPO_ROOT}/server/bin"
CACHE_DIR="${REPO_ROOT}/server/.cache"
SRC_DIR="${CACHE_DIR}/ipatool-src"
GO_MOD_CACHE="${CACHE_DIR}/go-mod"
GO_BUILD_CACHE="${CACHE_DIR}/go-build"
IPATOOL_REPO="${IPATOOL_REPO:-https://github.com/majd/ipatool.git}"
IPATOOL_REF="${IPATOOL_REF:-main}"
GO_IMAGE="${GO_IMAGE:-golang:1.25-bookworm}"
BUILD_ARCHES=(amd64 arm64)
BUILD_DARWIN=1
LINUX_ONLY=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

  Non-interactive ipatool build: Linux arm64+amd64; on macOS also builds a local dev binary.
  Default source: majd/ipatool @ main (latest branch tip, not a release tag)

Options:
  --ref REF       Override branch / tag / commit (default: main)
  --repo URL      Override repository URL
  --linux-only    Linux packages only (for Docker image builds)
  -h, --help      Show this help

Environment:
  GO_IMAGE        Docker image for builds (default: golang:1.25-bookworm)
  IPATOOL_REF     Same as --ref
  IPATOOL_REPO    Same as --repo
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)
      [[ $# -ge 2 ]] || { echo "Missing value for --ref" >&2; exit 1; }
      IPATOOL_REF="$2"
      shift 2
      ;;
    --repo)
      [[ $# -ge 2 ]] || { echo "Missing value for --repo" >&2; exit 1; }
      IPATOOL_REPO="$2"
      shift 2
      ;;
    --linux-only)
      LINUX_ONLY=1
      BUILD_DARWIN=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$LINUX_ONLY" -eq 0 && "$(uname -s)" != "Darwin" ]]; then
  BUILD_DARWIN=0
fi

echo "Source: ${IPATOOL_REPO} @ ${IPATOOL_REF}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for Linux builds: https://docs.docker.com/get-docker/" >&2
  exit 1
fi

if [[ "$BUILD_DARWIN" -eq 1 ]] && ! command -v go >/dev/null 2>&1; then
  echo "Go is required for macOS dev binary: https://go.dev/dl/" >&2
  exit 1
fi

mkdir -p "$BIN_DIR" "$GO_MOD_CACHE" "$GO_BUILD_CACHE"

sync_cached_source() {
  local cached_remote=""

  if [[ -d "${SRC_DIR}/.git" ]]; then
    cached_remote="$(git -C "$SRC_DIR" remote get-url origin 2>/dev/null || true)"
    if [[ -n "$cached_remote" && "$cached_remote" != "$IPATOOL_REPO" ]]; then
      echo "Source repository changed (${cached_remote} -> ${IPATOOL_REPO}), re-cloning …"
      rm -rf "$SRC_DIR"
    fi
  fi

  if [[ -d "${SRC_DIR}/.git" ]]; then
    echo "Updating cached source (${IPATOOL_REPO} @ ${IPATOOL_REF}, fetching latest) …"
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
}

sync_cached_source

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
      echo "Unsupported macOS host arch: $host_arch" >&2
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
echo "Linux build finished in $(( SECONDS - total_start ))s"

sample_tar="${BIN_DIR}/ipatool-${VERSION}-linux-${BUILD_ARCHES[0]}.tar.gz"
if tar -tzf "$sample_tar" | grep -q 'bin/ipatool-'; then
  echo "Linux tar.gz layout OK"
else
  echo "Warning: unexpected tar.gz layout" >&2
  exit 1
fi

if [[ "$BUILD_DARWIN" -eq 1 ]]; then
  build_darwin
  if "${BIN_DIR}/ipatool" -h 2>&1 | grep -q 'list-purchases'; then
    echo "list-purchases: OK (darwin)"
  else
    echo "Warning: list-purchases not found in darwin binary" >&2
    exit 1
  fi
fi

echo "Done. Output in server/bin/"
