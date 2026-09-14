#!/usr/bin/env bash
set -euo pipefail

readonly DEPLOY_DIR="${DEPLOY_DIR:-$HOME/ipa-harbor-remote}"
readonly COMPOSE_FILE="remote-docker-compose.yml"
readonly DEPLOY_ENV_FILE=".env"
readonly IMAGE="${IMAGE:-uuphy/ipa-harbor:latest}"
readonly CLOUDFLARED_IMAGE="${CLOUDFLARED_IMAGE:-cloudflare/cloudflared:latest}"
readonly CONTAINER_PORT="${CONTAINER_PORT:-3080}"
readonly COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ipa-harbor-remote}"
readonly APP_SERVICE_NAME="${APP_SERVICE_NAME:-ipa-harbor-remote}"
readonly TUNNEL_SERVICE_NAME="${TUNNEL_SERVICE_NAME:-cloudflared-remote}"
readonly DATA_VOLUME="${DATA_VOLUME:-ipa_data_remote}"
readonly COMPOSE_NETWORK="${COMPOSE_NETWORK:-ipa-harbor-net}"
readonly COMPOSE_NETWORK_NAME="${COMPOSE_NETWORK_NAME:-ipa-harbor-remote-net}"
readonly PUBLIC_HTTPS_PORT="${PUBLIC_HTTPS_PORT:-443}"
readonly COMPOSE_PLUGIN_VERSION="${COMPOSE_PLUGIN_VERSION:-v5.5.1}"
readonly COMPOSE_PLUGIN_BINARY_PATH="/usr/local/lib/docker/cli-plugins/docker-compose"
readonly WIZARD_TITLE="IPA Harbor 公网部署向导"
readonly CF_TUNNEL_PROBE_HOST="${CF_TUNNEL_PROBE_HOST:-region1.v2.argotunnel.com}"
readonly CF_TUNNEL_PROBE_PORT="${CF_TUNNEL_PROBE_PORT:-7844}"

COMPOSE_CMD=()
DOCKER_RUNTIME_READY=0


promptRead() {
  if [[ -t 0 ]]; then
    read -r "$@"
    return $?
  fi
  if [[ ! -r /dev/tty ]]; then
    echo "错误: 需要交互式终端。" >&2
    return 1
  fi

  local prompt=""
  local args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -p)
        prompt=$2
        shift 2
        ;;
      *)
        args+=("$1")
        shift
        ;;
    esac
  done

  if [[ -n "$prompt" ]]; then
    printf '%s' "$prompt" >/dev/tty
  fi
  read -r "${args[@]}" </dev/tty
}

promptAnyKey() {
  local prompt="${1:-按任意键继续… }"

  if ! isInteractiveTerminal; then
    return 0
  fi

  if [[ -t 0 ]]; then
    printf '%s' "$prompt"
    read -n 1 -r _
    echo ""
    return 0
  fi

  if [[ ! -r /dev/tty ]]; then
    return 1
  fi

  printf '%s' "$prompt" >/dev/tty
  read -n 1 -r _ </dev/tty
  echo "" >/dev/tty
}

printDivider() {
  echo "----------------------------------------"
}

printInitPinLine() {
  local label="$1"
  local pin="$2"
  if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    printf '%s%b%s%b\n' "$label" $'\033[1;33;40m' "$pin" $'\033[0m'
  else
    printf '%s%s\n' "$label" "$pin"
  fi
}

printDeployCompleteTitle() {
  if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    printf '%b %s\n' $'\033[1;32m✓\033[0m' "IPA-Harbor 部署完成"
  else
    echo "✓ IPA-Harbor 部署完成"
  fi
}

printGuideSubLink() {
  local url="$1"
  local indent="${2:-     }"
  if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    printf '%s%b ↳ %b%s%b\n' "$indent" $'\033[33m' $'\033[36m' "$url" $'\033[0m'
  else
    printf '%s ↳ %s\n' "$indent" "$url"
  fi
}

isYes() {
  [[ "${1:-}" == "y" || "${1:-}" == "Y" || "${1:-}" == "yes" || "${1:-}" == "YES" ]]
}

isInteractiveTerminal() {
  [[ -t 0 ]] && return 0
  ( : < /dev/tty ) 2>/dev/null
}

trimInput() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

generateKeychainPassphrase() {
  openssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10
}

generateAdminInitPin() {
  openssl rand -base64 24 | tr -dc '0-9' | head -c8
}

isLinux() {
  [[ "$(uname -s)" == "Linux" ]]
}

printDockerOfficialInstallHint() {
  echo "请复制以下命令安装 Docker（需要 root/sudo）："
  echo ""
  echo "  curl -fsSL https://get.docker.com | sh"
  echo ""
  echo "文档: https://docs.docker.com/engine/install/"
}

promptLinuxDockerInstall() {
  local installAnswer=""

  echo "Docker 未安装。"
  echo ""
  if ! isInteractiveTerminal; then
    echo "错误: 需要交互式终端。" >&2
    exit 1
  fi
  promptRead -p "是否使用官方一键脚本安装 Docker？(y/N) " installAnswer || exit 1
  if ! isYes "$installAnswer"; then
    echo "需要 Docker 才能继续，正在退出…"
    exit 0
  fi
  echo ""
  printDockerOfficialInstallHint
  echo "安装完成后，如需要请启动 Docker 服务，然后重新运行本脚本。"
  promptAnyKey "按任意键退出… " || true
  exit 0
}

ensureDockerCommand() {
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi

  if ! isLinux; then
    echo "错误: 未检测到 Docker。本脚本用于在 Linux 上部署。"
    exit 1
  fi

  promptLinuxDockerInstall
}

printDockerNotRunningHint() {
  echo "Docker 已安装但当前无法连接。"
  echo ""
  echo "可尝试："
  echo "  sudo systemctl start docker"
  echo ""
  echo "若刚安装 Docker，可能还需要："
  echo '  sudo usermod -aG docker "$USER"'
  echo "  （然后重新登录，或执行：newgrp docker）"
  echo ""
}

promptLinuxDockerNotRunning() {
  printDockerNotRunningHint
  if ! isInteractiveTerminal; then
    echo "错误: 需要交互式终端。" >&2
    exit 1
  fi
  echo "处理完成后，请重新运行本脚本。"
  promptAnyKey "按任意键退出… " || true
  exit 0
}

requireDocker() {
  ensureDockerCommand
  if ! docker info >/dev/null 2>&1; then
    if isLinux; then
      promptLinuxDockerNotRunning
    fi
    echo "错误: Docker 未运行。"
    exit 1
  fi
}

runAsRoot() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    return 1
  fi
}

resolveComposeCmd() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    return 0
  fi
  return 1
}

detectComposePluginArch() {
  case "$(uname -m)" in
    x86_64 | amd64) printf '%s\n' x86_64 ;;
    aarch64 | arm64) printf '%s\n' aarch64 ;;
    armv7l | armv6l) printf '%s\n' armv7 ;;
    *) return 1 ;;
  esac
}

hasDockerOfficialPackageRepo() {
  if grep -rq 'download.docker.com' /etc/apt/sources.list.d/ 2>/dev/null; then
    return 0
  fi
  [[ -f /etc/yum.repos.d/docker-ce.repo ]] && return 0
  return 1
}

shouldTryComposePackageInstall() {
  if command -v apt-cache >/dev/null 2>&1; then
    apt-cache show docker-compose-plugin >/dev/null 2>&1 && return 0
    hasDockerOfficialPackageRepo && return 0
    return 1
  fi
  if command -v dnf >/dev/null 2>&1; then
    hasDockerOfficialPackageRepo && return 0
    dnf -q list docker-compose-plugin >/dev/null 2>&1 && return 0
    return 1
  fi
  if command -v yum >/dev/null 2>&1; then
    hasDockerOfficialPackageRepo && return 0
    yum -q list docker-compose-plugin >/dev/null 2>&1 && return 0
    return 1
  fi
  return 1
}

installComposePluginViaPackageManager() {
  if ! shouldTryComposePackageInstall; then
    return 1
  fi

  if command -v apt-get >/dev/null 2>&1; then
    runAsRoot env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a \
      sh -c 'apt-get update -qq && apt-get install -y -qq docker-compose-plugin' >/dev/null 2>&1
    return $?
  fi
  if command -v dnf >/dev/null 2>&1; then
    runAsRoot dnf -q install -y docker-compose-plugin >/dev/null 2>&1
    return $?
  fi
  if command -v yum >/dev/null 2>&1; then
    runAsRoot yum -q install -y docker-compose-plugin >/dev/null 2>&1
    return $?
  fi
  return 1
}

getComposePluginDownloadUrl() {
  local arch version

  arch="$(detectComposePluginArch)" || return 1
  version="$COMPOSE_PLUGIN_VERSION"
  if [[ "$version" == "latest" ]]; then
    version="$(curl -fsSL https://api.github.com/repos/docker/compose/releases/latest \
      | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
      | head -1)"
    [[ -n "$version" ]] || return 1
  fi
  printf '%s\n' "https://github.com/docker/compose/releases/download/${version}/docker-compose-linux-${arch}"
}

installComposePluginManually() {
  local pluginDir
  local downloadUrl

  pluginDir="$(dirname "$COMPOSE_PLUGIN_BINARY_PATH")"
  command -v curl >/dev/null 2>&1 || return 1
  downloadUrl="$(getComposePluginDownloadUrl)" || return 1

  runAsRoot sh -c "mkdir -p '$pluginDir' && curl -fsSL '$downloadUrl' -o '$COMPOSE_PLUGIN_BINARY_PATH' && chmod +x '$COMPOSE_PLUGIN_BINARY_PATH'" >/dev/null 2>&1
}

isComposePluginBinaryInstalled() {
  [[ -f "$COMPOSE_PLUGIN_BINARY_PATH" ]]
}

isComposePluginPackageInstalled() {
  if command -v dpkg >/dev/null 2>&1 && dpkg -s docker-compose-plugin >/dev/null 2>&1; then
    return 0
  fi
  if command -v rpm >/dev/null 2>&1 && rpm -q docker-compose-plugin >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

showComposePluginUninstallHint() {
  if isComposePluginBinaryInstalled; then
    printf "  - 官方二进制: %s\n" "$COMPOSE_PLUGIN_BINARY_PATH"
  fi
  if isComposePluginPackageInstalled; then
    echo "  - 包管理器: docker-compose-plugin"
  fi
}

uninstallComposePlugin() {
  local removed=false

  if isComposePluginBinaryInstalled; then
    runAsRoot rm -f "$COMPOSE_PLUGIN_BINARY_PATH"
    printf "已删除 Compose 二进制: %s\n" "$COMPOSE_PLUGIN_BINARY_PATH"
    removed=true
  fi

  if isComposePluginPackageInstalled; then
    if command -v apt-get >/dev/null 2>&1; then
      runAsRoot env DEBIAN_FRONTEND=noninteractive apt-get remove -y -qq docker-compose-plugin >/dev/null 2>&1
    elif command -v dnf >/dev/null 2>&1; then
      runAsRoot dnf -q remove -y docker-compose-plugin >/dev/null 2>&1
    elif command -v yum >/dev/null 2>&1; then
      runAsRoot yum -q remove -y docker-compose-plugin >/dev/null 2>&1
    fi
    echo "已卸载包 docker-compose-plugin"
    removed=true
  fi

  if [[ "$removed" == "false" ]]; then
    echo "未找到可卸载的 Docker Compose 插件。"
    return 1
  fi
  return 0
}

selectComposeInstallMethod() {
  local choice=""
  local envMethod="${COMPOSE_INSTALL_METHOD:-}"

  if [[ -n "$envMethod" ]]; then
    case "$(printf '%s' "$envMethod" | tr '[:upper:]' '[:lower:]')" in
      binary | manual)
        echo "binary"
        return 0
        ;;
      package | pkg | apt | yum | dnf)
        echo "package"
        return 0
        ;;
    esac
  fi

  if ! isInteractiveTerminal; then
    echo "binary"
    return 0
  fi

  if ! shouldTryComposePackageInstall; then
    echo "binary"
    return 0
  fi

  echo "" >&2
  echo "未检测到 Docker Compose 插件，是否继续？" >&2
  echo "  1) 安装 (官方二进制，推荐)" >&2
  echo "  2) 安装 (包管理器)" >&2
  echo "  0) 退出" >&2
  echo "" >&2

  while true; do
    promptRead -p "请选择 [0-2] (默认 1): " choice || return 1
    choice="$(trimInput "$choice")"
    if [[ -z "$choice" || "$choice" == "1" ]]; then
      echo "binary"
      return 0
    fi
    if [[ "$choice" == "2" ]]; then
      echo "package"
      return 0
    fi
    if [[ "$choice" == "0" ]]; then
      echo "cancel"
      return 0
    fi
    echo "无效选项，请输入 0-2。" >&2
  done
}

ensureCompose() {
  local method=""

  if resolveComposeCmd; then
    return 0
  fi

  method="$(selectComposeInstallMethod)" || exit 1
  if [[ "$method" == "cancel" ]]; then
    echo "正在退出..."
    exit 0
  fi

  case "$method" in
    binary)
      echo "正在执行，请稍等..."
      installComposePluginManually || true
      ;;
    package)
      echo "正在执行，请稍等..."
      installComposePluginViaPackageManager || true
      if ! resolveComposeCmd; then
        echo "包管理器安装失败，改试官方二进制的形式…"
        installComposePluginManually || true
      fi
      ;;
  esac

  if resolveComposeCmd; then
    return 0
  fi

  echo "错误: Docker Compose 安装失败（需要 root/sudo 权限）。"
  echo "参考: https://docs.docker.com/compose/install/linux/"
  exit 1
}

ensureDockerRuntime() {
  if [[ "$DOCKER_RUNTIME_READY" == "1" ]]; then
    return 0
  fi
  requireDocker
  ensureCompose
  DOCKER_RUNTIME_READY=1
}

compose() {
  "${COMPOSE_CMD[@]}" -p "${COMPOSE_PROJECT_NAME}" -f "${DEPLOY_DIR}/${COMPOSE_FILE}" --env-file "${DEPLOY_DIR}/${DEPLOY_ENV_FILE}" "$@"
}

resolveHostIpv4() {
  local host="$1"
  local ip=""

  if command -v getent >/dev/null 2>&1; then
    ip="$(getent ahostsv4 "$host" 2>/dev/null | awk '{print $1; exit}')"
    if [[ -n "$ip" ]]; then
      printf '%s\n' "$ip"
      return 0
    fi
  fi

  if command -v dig >/dev/null 2>&1; then
    ip="$(dig +short A "$host" 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)"
    if [[ -n "$ip" ]]; then
      printf '%s\n' "$ip"
      return 0
    fi
  fi

  if command -v host >/dev/null 2>&1; then
    ip="$(host -t A "$host" 2>/dev/null | awk '/has address/ {print $NF; exit}')"
    if [[ -n "$ip" ]]; then
      printf '%s\n' "$ip"
      return 0
    fi
  fi

  return 1
}

canConnectTcpPort() {
  local ip="$1"
  local port="$2"

  if command -v nc >/dev/null 2>&1; then
    nc -z -w 3 "$ip" "$port" >/dev/null 2>&1 && return 0
  fi

  if command -v timeout >/dev/null 2>&1; then
    timeout 3 bash -c "exec 3<>/dev/tcp/${ip}/${port}" >/dev/null 2>&1 && return 0
  fi

  bash -c "exec 3<>/dev/tcp/${ip}/${port}" >/dev/null 2>&1
}

canConnectUdpPort() {
  local ip="$1"
  local port="$2"

  command -v nc >/dev/null 2>&1 || return 1
  nc -u -z -w 3 "$ip" "$port" >/dev/null 2>&1
}

isCloudflareTunnelOutboundOk() {
  local ip=""

  ip="$(resolveHostIpv4 "$CF_TUNNEL_PROBE_HOST")" || return 1
  canConnectTcpPort "$ip" "$CF_TUNNEL_PROBE_PORT" && return 0
  canConnectUdpPort "$ip" "$CF_TUNNEL_PROBE_PORT" && return 0
  return 1
}

showCloudflareOutboundFirewallHintIfNeeded() {
  if isCloudflareTunnelOutboundOk; then
    return 0
  fi

  echo "注意: 本机出站 Cloudflare 端口 ${CF_TUNNEL_PROBE_PORT}（TCP/UDP）暂不可达，请检查防火墙或安全组。"
  echo ""
}

showCloudflareBeforeScriptGuide() {
  echo ""
  printDivider
  echo "配置 Cloudflare 隧道"
  printDivider
  echo "请先在 Cloudflare 完成创建隧道并拷贝 Token，然后回到本脚本继续操作"
  echo ""
  echo "  1. Cloudflare 控制台 → Networking → Tunnels"
  printGuideSubLink "https://dash.cloudflare.com/?to=/:account/tunnels"
  echo "  2. Create a tunnel → 填写名称（如 'ipa-harbor'）→ Create Tunnel"
  echo "  3. 选择 Docker"
  echo "     然后滚动至最下方，你应该能看到 Connection Status: Waiting for your Tunnel to connect..."
  echo "  4. 请拷贝 Cloudflare 网页提供的 Tunnel Token 或 docker run 命令"
  echo "     例如:"
  echo "     docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token eyJ..."
  echo ""
  showCloudflareOutboundFirewallHintIfNeeded
}

showCloudflareAfterScriptGuide() {
  local publicHost="$1"
  local publicUrl="$2"
  local adminInitPin="$3"

  echo ""
  printDivider
  echo "配置 Cloudflare 路由"
  printDivider
  echo "本脚本已启动 cloudflared，请回到 Cloudflare 页面继续："
  echo ""
  echo "  1. 打开隧道列表页面"
  printGuideSubLink "https://dash.cloudflare.com/?to=/:account/tunnels"
  echo "     页面中该隧道的 Connection Status 应变 Healthy / Connected"
  echo "  2. 点击隧道名称可以进入该隧道配置页面，点击 Routes → Add route"
  echo "  3. 选择 Published application"
  echo "  4. Subdomain + Domain → 与下方访问域名一致:"
  printf "     %s\n" "$publicHost"
  echo "  5. Service URL 填 Compose 服务名（不是 Docker 里的 Hostname/网络名）:"
  printf "     http://%s:%s\n" "$APP_SERVICE_NAME" "$CONTAINER_PORT"
  echo "  6. Add route"
  echo ""
  printf "完成后，在浏览器访问: %s\n" "$publicUrl"
  echo ""
  printInitPinLine "首次访问时的初始化 PIN: " "$adminInitPin"
  echo ""
  echo "注意: DNS 刚加完可能要等上几分钟才能访问，若暂时打不开可以稍后再刷新重试"
  echo ""
}

stripTokenWrapping() {
  local token="$1"
  token="${token//$'\r'/}"
  token="$(trimInput "$token")"
  token="${token#\"}"
  token="${token%\"}"
  token="${token#\'}"
  token="${token%\'}"
  token="${token#\`}"
  token="${token%\`}"
  token="${token%;}"
  token="$(trimInput "$token")"
  printf '%s' "$token"
}

parseTunnelToken() {
  local input="$1"
  local token=""

  input="${input//$'\r'/}"
  input="$(trimInput "$input")"
  [[ -z "$input" ]] && return 1

  if [[ "$input" == *"--token"* ]]; then
    token="${input#*--token}"
    token="$(trimInput "$token")"
    [[ "$token" == =* ]] && token="${token#=}"
    token="$(trimInput "$token")"
    token="${token%%[[:space:]]*}"
  elif [[ "$input" == eyJ* ]]; then
    token="${input%%[[:space:]]*}"
  elif [[ "$input" =~ (eyJ[A-Za-z0-9._~-]+) ]]; then
    token="${BASH_REMATCH[1]}"
  fi

  token="$(stripTokenWrapping "$token")"
  if [[ -n "$token" ]]; then
    printf '%s' "$token"
    return 0
  fi
  return 1
}

validateTunnelToken() {
  local token="$1"
  if [[ ${#token} -lt 40 ]]; then
    echo "错误: Tunnel Token 过短，请从 Cloudflare 控制台完整拷贝安装命令或 Token。"
    return 1
  fi
  if [[ "$token" != eyJ* ]]; then
    echo "错误: 未能识别 Tunnel Token（应以 eyJ 开头）。可粘贴整段 docker run 命令或 Token "
    return 1
  fi
  return 0
}

validatePublicHost() {
  local host="$1"
  if [[ ! "$host" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$ ]]; then
    echo "错误: 域名格式无效，示例: ipa-harbor.uuphy.com"
    return 1
  fi
  return 0
}

deriveRpId() {
  local host="$1"
  local -a parts=()
  local count=""

  IFS='.' read -r -a parts <<< "$host"
  count=${#parts[@]}
  if [[ "$count" -le 2 ]]; then
    printf '%s' "$host"
    return 0
  fi
  printf '%s.%s' "${parts[$((count - 2))]}" "${parts[$((count - 1))]}"
}

buildPublicUrl() {
  local host="$1"
  local port="$2"
  if [[ "$port" == "443" ]]; then
    printf 'https://%s' "$host"
  else
    printf 'https://%s:%s' "$host" "$port"
  fi
}

writeEnvFile() {
  local tunnelToken="$1"
  local publicHost="$2"
  local httpsPort="$3"
  local allowedDomains="$4"
  local rpId="$5"
  local publicUrl="$6"
  local adminInitPin="$7"
  local keychainPassphrase="$8"
  local envPath="${DEPLOY_DIR}/${DEPLOY_ENV_FILE}"

  umask 077
  cat >"$envPath" <<EOF
# IPA-Harbor 公网部署 — 含敏感信息，请勿提交到 Git
TUNNEL_TOKEN=${tunnelToken}
PUBLIC_HOST=${publicHost}
PUBLIC_HTTPS_PORT=${httpsPort}
PUBLIC_URL=${publicUrl}
ALLOWED_DOMAINS=${allowedDomains}
WEBAUTHN_RP_ID=${rpId}
WEBAUTHN_ALLOWED_ORIGINS=${publicUrl}
KEYCHAIN_PASSPHRASE=${keychainPassphrase}
ADMIN_INIT_PIN=${adminInitPin}
IMAGE=${IMAGE}
CLOUDFLARED_IMAGE=${CLOUDFLARED_IMAGE}
EOF
  chmod 600 "$envPath"
}

ensureDataVolume() {
  # 镜像内以 ij369 (1001) 运行；命名卷首次初始化时预建目录并修正权限
  docker volume create "$DATA_VOLUME" >/dev/null 2>&1 || true
  docker run --rm -v "${DATA_VOLUME}:/data" alpine:3.20 \
    sh -c 'mkdir -p /data/.ipatool && chown -R 1001:1001 /data && chmod -R u+rwX /data' >/dev/null 2>&1 || {
    echo "警告: 数据卷权限初始化失败，请检查 Docker 是否正常。"
    return 1
  }
}

writeComposeFile() {
  local composePath="$DEPLOY_DIR/$COMPOSE_FILE"

  cat >"$composePath" <<EOF
name: ${COMPOSE_PROJECT_NAME}

services:
  ${APP_SERVICE_NAME}:
    image: \${IMAGE:-uuphy/ipa-harbor:latest}
    container_name: ${APP_SERVICE_NAME}
    hostname: ${APP_SERVICE_NAME}
    restart: unless-stopped
    expose:
      - "${CONTAINER_PORT}"
    environment:
      NODE_ENV: production
      KEYCHAIN_PASSPHRASE: \${KEYCHAIN_PASSPHRASE}
      ADMIN_INIT_PIN: \${ADMIN_INIT_PIN}
      PORT: "${CONTAINER_PORT}"
      ALLOW_LAN_ACCESS: "true"
      ALLOWED_DOMAINS: \${ALLOWED_DOMAINS}
      TRUST_PROXY: "1"
      WEBAUTHN_RP_ID: \${WEBAUTHN_RP_ID}
      WEBAUTHN_ALLOWED_ORIGINS: \${WEBAUTHN_ALLOWED_ORIGINS}
      DBUS_SESSION_BUS_ADDRESS: unix:path=/nonexistent
    volumes:
      - ${DATA_VOLUME}:/app/data
    networks:
      - ${COMPOSE_NETWORK}

  ${TUNNEL_SERVICE_NAME}:
    image: \${CLOUDFLARED_IMAGE:-cloudflare/cloudflared:latest}
    container_name: ${TUNNEL_SERVICE_NAME}
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: \${TUNNEL_TOKEN}
    depends_on:
      - ${APP_SERVICE_NAME}
    networks:
      - ${COMPOSE_NETWORK}

volumes:
  ${DATA_VOLUME}:
    name: ${DATA_VOLUME}

networks:
  ${COMPOSE_NETWORK}:
    name: ${COMPOSE_NETWORK_NAME}
EOF
}

waitForIpaHarbor() {
  local attempts="${1:-30}"
  local i=0

  printf "正在等待 %s 启动…\n" "$APP_SERVICE_NAME"
  while [[ $i -lt attempts ]]; do
    if docker inspect --format '{{.State.Running}}' "$APP_SERVICE_NAME" 2>/dev/null | grep -qx 'true'; then
      if compose exec -T "$APP_SERVICE_NAME" curl -fsS "http://127.0.0.1:${CONTAINER_PORT}/health" >/dev/null 2>&1; then
        return 0
      fi
    fi
    sleep 2
    i=$((i + 1))
  done
  printf "提示: %s 尚未就绪，请稍后执行: docker logs %s\n" "$APP_SERVICE_NAME" "$APP_SERVICE_NAME"
  return 1
}

isCloudflaredTunnelReady() {
  local logs=""

  if ! docker inspect --format '{{.State.Running}}' "$TUNNEL_SERVICE_NAME" 2>/dev/null | grep -qx 'true'; then
    return 1
  fi

  logs="$(docker logs --tail 500 "$TUNNEL_SERVICE_NAME" 2>&1)" || return 1
  # 官方成功日志为 "Registered tunnel connection"；远程配置下发后为 "Updated to new configuration"
  # 使用词边界，避免把 "Unregistered tunnel connection" 误判为已连接
  printf '%s' "$logs" | grep -Eiq \
    '\bRegistered tunnel connection\b|Updated to new configuration|"message":"Registered tunnel connection"'
}

waitForCloudflared() {
  local attempts="${1:-60}"
  local i=0

  printf "正在等待 %s 注册隧道…\n" "$TUNNEL_SERVICE_NAME"
  while [[ $i -lt attempts ]]; do
    if isCloudflaredTunnelReady; then
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done

  # 轮询窗口边界再复检一次，避免刚连上就结束等待的误判
  if isCloudflaredTunnelReady; then
    return 0
  fi

  echo "提示: 暂未检测到隧道连接，请检查 Token 是否正确、出站 7844 是否放行:"
  printf "  docker logs %s\n" "$TUNNEL_SERVICE_NAME"
  return 1
}

printSuccess() {
  local publicHost="$1"
  local publicUrl="$2"
  local adminInitPin="$3"

  echo ""
  printDivider
  printDeployCompleteTitle
  printDivider
  echo ""
  showCloudflareAfterScriptGuide "$publicHost" "$publicUrl" "$adminInitPin"
  promptAnyKey "按任意键返回菜单… " || true
}

actionInstall() {
  ensureDockerRuntime

  local tunnelToken=""
  local publicHost=""
  local allowedDomains=""
  local rpId=""
  local publicUrl=""
  local adminInitPin=""
  local keychainPassphrase=""
  local confirm=""

  echo ""
  printDivider
  echo "$WIZARD_TITLE"
  printDivider
  echo "在运行 Docker 的机器上自托管公网部署。"
  echo "前提: Cloudflare 域名，以及一台运行 Docker 的主机（VPS、云虚拟机、独立主机、NAS、树莓派等均可）。"
  echo "部署目录: $DEPLOY_DIR"
  echo ""

  showCloudflareBeforeScriptGuide
  promptRead -p "按回车继续… " _ || return 1
  echo ""

  while true; do
    local tunnelInput=""
    promptRead -p "请粘贴刚刚 Cloudflare 网页提供的 Tunnel Token 或命令: " tunnelInput || return 1
    if ! tunnelToken="$(parseTunnelToken "$tunnelInput")"; then
      echo "错误: 未能从输入中识别 Token，请粘贴 eyJ... 或含 --token 的命令。"
      continue
    fi
    if validateTunnelToken "$tunnelToken"; then
      break
    fi
  done

  echo ""
  echo "访问域名"
  echo "  浏览器打开 IPA Harbor 时使用的公网地址，须为已接入 Cloudflare 的域名。"
  echo "  假设你的域名为 uuphy.com，那么访问域名可以设置为一个未被占用的三级域名，如 ipa-harbor.uuphy.com"
  echo ""

  while true; do
    promptRead -p "请输入访问域名 (如 ipa-harbor.uuphy.com): " publicHost || return 1
    publicHost="$(trimInput "$publicHost")"
    publicHost="${publicHost#https://}"
    publicHost="${publicHost#http://}"
    publicHost="${publicHost%%/*}"
    publicHost="${publicHost%%:*}"
    if validatePublicHost "$publicHost"; then
      break
    fi
  done

  allowedDomains="$publicHost"
  rpId="$(deriveRpId "$publicHost")"
  publicUrl="$(buildPublicUrl "$publicHost" "$PUBLIC_HTTPS_PORT")"
  adminInitPin="$(generateAdminInitPin)"
  keychainPassphrase="$(generateKeychainPassphrase)"

  echo ""
  printDivider
  echo "部署预览"
  printDivider
  printf "访问地址:     %s\n" "$publicUrl"
  echo ""
  printf "ALLOWED_DOMAINS: %s\n" "$allowedDomains"
  echo ""
  printf "WEBAUTHN_RP_ID:  %s\n" "$rpId"
  echo ""
  printInitPinLine "初始化 PIN: " "$adminInitPin"
  echo ""

  promptRead -p "按回车开始生成配置并启动，或 Ctrl+C 取消… " _ || return 1

  mkdir -p "$DEPLOY_DIR"
  writeEnvFile "$tunnelToken" "$publicHost" "$PUBLIC_HTTPS_PORT" "$allowedDomains" "$rpId" "$publicUrl" "$adminInitPin" "$keychainPassphrase"
  writeComposeFile
  ensureDataVolume || return 1

  echo ""
  echo "已生成:"
  printf "  %s/%s\n" "$DEPLOY_DIR" "$COMPOSE_FILE"
  printf "  %s/%s\n" "$DEPLOY_DIR" "$DEPLOY_ENV_FILE"
  echo ""

  echo "Starting services…"
  if ! compose up -d --remove-orphans; then
    echo ""
    echo "错误: 服务启动失败，请执行以下命令排查:"
    printf "  cd %s && %s ps\n" "$DEPLOY_DIR" "${COMPOSE_CMD[*]}"
    printf "  cd %s && %s logs\n" "$DEPLOY_DIR" "${COMPOSE_CMD[*]}"
    return 1
  fi

  local ipaOk=false
  local tunnelOk=false
  local ipaWaitPid=0
  local tunnelWaitPid=0

  # 与 IPA-Harbor 并行等待：cloudflared 连 Cloudflare 不依赖应用 health，顺序等待会白耗时间
  waitForIpaHarbor &
  ipaWaitPid=$!
  waitForCloudflared &
  tunnelWaitPid=$!

  if wait "$ipaWaitPid"; then
    ipaOk=true
    printf "  ✓ %s\n" "$APP_SERVICE_NAME"
  else
    printf "  ✗ %s（未就绪，请查看日志）\n" "$APP_SERVICE_NAME"
  fi

  if wait "$tunnelWaitPid"; then
    tunnelOk=true
    printf "  ✓ %s\n" "$TUNNEL_SERVICE_NAME"
  else
    printf "  ✗ %s（未就绪，请查看日志）\n" "$TUNNEL_SERVICE_NAME"
  fi

  printSuccess "$publicHost" "$publicUrl" "$adminInitPin"

  if [[ "$ipaOk" == "false" || "$tunnelOk" == "false" ]]; then
    echo "排查命令:"
    printf "  docker logs %s\n" "$APP_SERVICE_NAME"
    printf "  docker logs %s\n" "$TUNNEL_SERVICE_NAME"
    return 1
  fi
}

actionUpgrade() {
  ensureDockerRuntime

  if [[ ! -f "${DEPLOY_DIR}/${COMPOSE_FILE}" || ! -f "${DEPLOY_DIR}/${DEPLOY_ENV_FILE}" ]]; then
    echo "错误: 未找到已有部署，请先运行安装。"
    return 1
  fi

  echo ""
  printDivider
  echo "${WIZARD_TITLE} — 升级"
  printDivider
  printf "将拉取最新镜像并重建容器，数据卷 %s 会保留。\n" "$DATA_VOLUME"
  echo ""

  promptRead -p "按回车开始升级，或 Ctrl+C 取消… " _ || return 1

  ensureDataVolume || return 1

  echo "Pulling images…"
  compose pull

  echo "Recreating services…"
  compose up -d --remove-orphans

  waitForIpaHarbor || true
  waitForCloudflared || true

  local publicUrl=""
  publicUrl="$(grep '^PUBLIC_URL=' "${DEPLOY_DIR}/${DEPLOY_ENV_FILE}" | cut -d= -f2-)"
  local adminInitPin=""
  adminInitPin="$(grep '^ADMIN_INIT_PIN=' "${DEPLOY_DIR}/${DEPLOY_ENV_FILE}" | cut -d= -f2-)"

  echo ""
  echo "升级完成。"
  [[ -n "$publicUrl" ]] && printf "访问地址: %s\n" "$publicUrl"
  [[ -n "$adminInitPin" ]] && printInitPinLine "初始化 PIN: " "$adminInitPin"
}

actionUninstall() {
  ensureDockerRuntime

  if [[ ! -f "$DEPLOY_DIR/$COMPOSE_FILE" ]]; then
    echo "错误: 未找到已有部署。"
    return 1
  fi

  local confirm=""
  local keepDataAnswer=""
  local removeComposeAnswer=""
  local keepData=true
  local removeCompose=false

  echo ""
  printDivider
  echo "${WIZARD_TITLE} — 卸载"
  printDivider

  promptRead -p "确认卸载？(y/N) " confirm || return 1
  if ! isYes "$confirm"; then
    echo "已取消。"
    return 0
  fi

  promptRead -p "$(printf "是否保留数据卷 %s（已下载 IPA 与用户数据）？(Y/n) " "$DATA_VOLUME")" keepDataAnswer || return 1
  keepDataAnswer="$(trimInput "$keepDataAnswer")"
  if [[ -n "$keepDataAnswer" ]] && ! isYes "$keepDataAnswer"; then
    keepData=false
  fi

  if isComposePluginBinaryInstalled || isComposePluginPackageInstalled; then
    echo ""
    echo "检测到 Docker Compose 插件:"
    showComposePluginUninstallHint
    promptRead -p "是否同时卸载 Docker Compose 插件？(y/N) " removeComposeAnswer || return 1
    if isYes "$(trimInput "$removeComposeAnswer")"; then
      removeCompose=true
    fi
  fi

  compose down --remove-orphans

  if [[ "$keepData" == "true" ]]; then
    printf "完成: 容器已删除，数据卷 %s 已保留。\n" "$DATA_VOLUME"
  else
    docker volume rm "$DATA_VOLUME" >/dev/null 2>&1 || true
    printf "完成: 容器与数据卷 %s 已删除。\n" "$DATA_VOLUME"
  fi

  if [[ "$removeCompose" == "true" ]]; then
    echo ""
    uninstallComposePlugin || true
  fi

  echo ""
  echo "提示: Cloudflare 控制台中的 Tunnel 需手动删除（如不再使用）。"

  if [[ "$removeCompose" == "true" ]]; then
    echo ""
    echo "正在退出..."
    exit 0
  fi
}

showMenu() {
  echo ""
  printDivider
  echo "$WIZARD_TITLE"
  printDivider
  echo "  1. 安装"
  echo "  2. 升级（保留数据）"
  echo "  3. 卸载"
  echo "  0. 退出"
  echo ""
}

usage() {
  cat <<EOF
在运行 Docker 的机器上自托管公网部署（Linux 主机 + Cloudflare Tunnel）。

用法:
  bash public-deploy-cf.zh.sh              交互菜单
  bash public-deploy-cf.zh.sh install      直接安装
  bash public-deploy-cf.zh.sh upgrade      直接升级
  bash public-deploy-cf.zh.sh uninstall    直接卸载

前提: Cloudflare 域名，以及一台运行 Docker 的主机（VPS、云虚拟机、独立主机、NAS、树莓派等均可）。

环境变量:
  DEPLOY_DIR              部署目录（默认: ~/ipa-harbor-remote）
  IMAGE                   IPA-Harbor 镜像（默认: uuphy/ipa-harbor:latest）
  PUBLIC_HTTPS_PORT       公网 HTTPS 端口（默认: 443，Cloudflare 边缘端口）
  COMPOSE_INSTALL_METHOD  Compose 安装方式: binary（默认）| package
  COMPOSE_PLUGIN_VERSION  Compose 二进制版本（默认: v5.5.1，可设 latest）

一键执行命令:
  curl -fsSL https://raw.githubusercontent.com/ij369/ipa-harbor/main/scripts/public-deploy-cf.zh.sh | bash
EOF
}

mainMenu() {
  ensureDockerRuntime
  while true; do
    showMenu
    promptRead -p "请选择 [0-3]: " choice || exit 1
    case "$choice" in
      1)
        actionInstall || true
        ;;
      2)
        actionUpgrade || true
        ;;
      3)
        actionUninstall || true
        ;;
      0)
        echo "正在退出..."
        exit 0
        ;;
      *)
        echo "无效选项，请输入 0-3。"
        ;;
    esac
  done
}

case "${1:-}" in
  install)
    actionInstall
    ;;
  upgrade)
    actionUpgrade
    ;;
  uninstall)
    actionUninstall
    ;;
  -h | --help | help)
    usage
    ;;
  "")
    mainMenu
    ;;
  *)
    printf "未知命令: %s\n" "$1" >&2
    echo "" >&2
    usage >&2
    exit 1
    ;;
esac
