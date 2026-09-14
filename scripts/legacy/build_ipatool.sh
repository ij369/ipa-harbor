#!/usr/bin/env bash
# DEPRECATED — pre-v2.6.0 source build; see scripts/legacy/README.md
# Build ipatool from main branch source (includes list-purchases; not yet in official releases)
# Interactive target selection by default; Linux packages are built natively in Docker per arch
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
      echo "Unknown source: $IPATOOL_SOURCE (expected official | haughtyeyes | ota | haughtyeyes+ota)" >&2
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
    echo "Current source (${label}): git submodule ipatool"
    if git -C "${SUBMODULE_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      echo "  Submodule commit: $(git -C "${SUBMODULE_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    fi
  else
    echo "Current source (${label}): ${IPATOOL_REPO} @ ${IPATOOL_REF}"
  fi
  if [[ "$IPATOOL_APPLY_OTA_PATCH" -eq 1 ]]; then
    echo "OTA patch: ${IPATOOL_OTA_PATCH}"
  fi
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

  Build ipatool from source. With no options, an interactive menu is shown (Enter = option 1).

Options:
  --choice N    Non-interactive choice: 1 | 2 | 3 | 4 | 0 (0 = exit)
  --arch ARCH   Linux only: amd64 | arm64 | all (skips menu when combined with --darwin)
  --darwin      Also build a local macOS binary at server/bin/ipatool
  --source NAME Source preset: official | haughtyeyes | ota | haughtyeyes+ota (default: haughtyeyes+ota)
  --repo URL    Override source repository URL
  --ref REF     Override branch, tag, or commit
  -h, --help    Show this help

Environment:
  GO_IMAGE       Docker image for builds (default: golang:1.25-bookworm)

Source presets:
  official       majd/ipatool @ main
  haughtyeyes    git submodule ipatool (HaughtyEyes @ fix-empty-volume-store-response)
  ota            iosconstantine/ipatool @ feat/ota-compat-flag (--ota-compat for itms-services)
  haughtyeyes+ota  git submodule ipatool + OTA compat patch (recommended for ipa-harbor)

Notes:
  haughtyeyes / haughtyeyes+ota use the ipatool/ submodule. First time: git submodule update --init ipatool
  The first build is slow (pull image + Go modules). Later builds reuse server/.cache (non-submodule sources).
  Switching --source or --repo clears cached source and re-clones (non-submodule sources only).
  On Apple Silicon, linux/amd64 uses QEMU and is much slower than arm64.
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
      echo "Exited."
      exit 0
      ;;
    *)
      echo "Invalid choice: $choice" >&2
      exit 1
      ;;
  esac
}

prompt_choice() {
  cat <<EOF
Select build target (Enter = 1):
  1. Linux packages (arm64 + amd64) + local macOS dev binary
  2. Local macOS dev binary only
  3. Linux package (arm64)
  4. Linux package (amd64)
  0. Exit
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
      [[ $# -ge 2 ]] || { echo "Missing value for --choice" >&2; exit 1; }
      BUILD_CLI_ARGS=1
      apply_choice "$2"
      shift 2
      ;;
    --arch)
      [[ $# -ge 2 ]] || { echo "Missing value for --arch" >&2; exit 1; }
      BUILD_CLI_ARGS=1
      BUILD_LINUX=1
      case "$2" in
        amd64|arm64) BUILD_ARCHES=("$2") ;;
        all) BUILD_ARCHES=(amd64 arm64) ;;
        *)
          echo "Unknown arch: $2 (expected amd64 | arm64 | all)" >&2
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
      [[ $# -ge 2 ]] || { echo "Missing value for --source" >&2; exit 1; }
      IPATOOL_SOURCE="$2"
      shift 2
      ;;
    --repo)
      [[ $# -ge 2 ]] || { echo "Missing value for --repo" >&2; exit 1; }
      IPATOOL_REPO="$2"
      REPO_EXPLICIT=1
      shift 2
      ;;
    --ref)
      [[ $# -ge 2 ]] || { echo "Missing value for --ref" >&2; exit 1; }
      IPATOOL_REF="$2"
      REF_EXPLICIT=1
      shift 2
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

show_ipatool_source

if [[ "$BUILD_CLI_ARGS" -eq 0 ]]; then
  if [[ -t 0 ]]; then
    prompt_choice
  else
    apply_choice 1
  fi
elif [[ "$BUILD_LINUX" -eq 0 ]] && [[ "$BUILD_DARWIN" -eq 0 ]]; then
  echo "Specify --choice, or use --arch / --darwin." >&2
  exit 1
fi

if [[ "$BUILD_LINUX" -eq 1 ]] && ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for Linux builds: https://docs.docker.com/get-docker/" >&2
  exit 1
fi

if [[ "$BUILD_DARWIN" -eq 1 ]] && ! command -v go >/dev/null 2>&1; then
  echo "Go is required for macOS builds: https://go.dev/dl/" >&2
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
    echo "OTA compat patch already applied"
    return 0
  fi

  if [[ ! -f "$IPATOOL_OTA_PATCH" ]]; then
    echo "OTA patch not found: ${IPATOOL_OTA_PATCH}" >&2
    exit 1
  fi

  echo "Applying OTA compat patch …"
  if ! git -C "$SRC_DIR" apply --check "$IPATOOL_OTA_PATCH" 2>/dev/null; then
    echo "OTA patch does not apply cleanly to ipatool @ $(git -C "$SRC_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)." >&2
    echo "Update ${IPATOOL_OTA_PATCH} or bump the ipatool submodule commit." >&2
    exit 1
  fi
  git -C "$SRC_DIR" apply "$IPATOOL_OTA_PATCH"
}

sync_submodule_source() {
  local desired_patch_key marker_file="${CACHE_DIR}/ipatool-patch-key"
  desired_patch_key="$(get_patch_key)"

  SRC_DIR="${SUBMODULE_DIR}"

  if git -C "$SRC_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Resetting submodule working tree before sync …"
    git -C "$SRC_DIR" reset --hard HEAD
    git -C "$SRC_DIR" clean -fd
  fi

  echo "Updating ipatool submodule …"
  git -C "${SCRIPT_DIR}" submodule update --init ipatool

  if ! git -C "$SRC_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "ipatool submodule failed to initialize. Run:" >&2
    echo "  git submodule update --init ipatool" >&2
    exit 1
  fi

  echo "Syncing submodule to ${IPATOOL_REF} …"
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
      echo "OTA patch set changed, re-cloning …"
      rm -rf "$SRC_DIR"
    fi
  fi

  if [[ -d "${SRC_DIR}/.git" ]]; then
    cached_remote="$(git -C "$SRC_DIR" remote get-url origin 2>/dev/null || true)"
    if [[ -n "$cached_remote" && "$cached_remote" != "$IPATOOL_REPO" ]]; then
      echo "Source repository changed (${cached_remote} -> ${IPATOOL_REPO}), re-cloning …"
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
      echo "Unsupported host arch for macOS build: $host_arch" >&2
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
  echo "Linux build finished in $(( SECONDS - total_start ))s"

  sample_arch="${BUILD_ARCHES[0]}"
  sample_tar="${BIN_DIR}/ipatool-${VERSION}-linux-${sample_arch}.tar.gz"
  if tar -tzf "$sample_tar" | grep -q 'bin/ipatool-'; then
    echo "Linux tar.gz layout OK"
  else
    echo "Warning: unexpected tar.gz layout" >&2
    exit 1
  fi
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

if [[ "$BUILD_LINUX" -eq 1 ]]; then
  echo "Done. Run ./build.sh to build the Docker image."
else
  echo "Done."
fi