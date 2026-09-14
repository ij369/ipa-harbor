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
readonly WIZARD_TITLE="IPA Harbor Public Deploy Wizard"
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
    echo "Error: interactive terminal required." >&2
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
  local prompt="${1:-Press any key to continue… }"

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
    printf '%b %s\n' $'\033[1;32m✓\033[0m' "IPA Harbor deployment complete"
  else
    echo "✓ IPA Harbor deployment complete"
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
  echo "Copy and run the following to install Docker (root/sudo required):"
  echo ""
  echo "  curl -fsSL https://get.docker.com | sh"
  echo ""
  echo "Docs: https://docs.docker.com/engine/install/"
}

promptLinuxDockerInstall() {
  local installAnswer=""

  echo "Docker is not installed."
  echo ""
  if ! isInteractiveTerminal; then
    echo "Error: interactive terminal required." >&2
    exit 1
  fi
  promptRead -p "Install Docker using the official script? (y/N) " installAnswer || exit 1
  if ! isYes "$installAnswer"; then
    echo "Docker is required. Exiting..."
    exit 0
  fi
  echo ""
  printDockerOfficialInstallHint
  echo "After installation, start Docker if needed, then run this script again."
  promptAnyKey "Press any key to exit… " || true
  exit 0
}

ensureDockerCommand() {
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi

  if ! isLinux; then
    echo "Error: Docker not found. This script deploys on Linux."
    exit 1
  fi

  promptLinuxDockerInstall
}

printDockerNotRunningHint() {
  echo "Docker is installed but not accessible."
  echo ""
  echo "Try:"
  echo "  sudo systemctl start docker"
  echo ""
  echo "If you just installed Docker, you may also need:"
  echo '  sudo usermod -aG docker "$USER"'
  echo "  (then log out and back in, or run: newgrp docker)"
  echo ""
}

promptLinuxDockerNotRunning() {
  printDockerNotRunningHint
  if ! isInteractiveTerminal; then
    echo "Error: interactive terminal required." >&2
    exit 1
  fi
  echo "After fixing the issue, run this script again."
  promptAnyKey "Press any key to exit… " || true
  exit 0
}

requireDocker() {
  ensureDockerCommand
  if ! docker info >/dev/null 2>&1; then
    if isLinux; then
      promptLinuxDockerNotRunning
    fi
    echo "Error: Docker is not running."
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
    printf "  - Official binary: %s\n" "$COMPOSE_PLUGIN_BINARY_PATH"
  fi
  if isComposePluginPackageInstalled; then
    echo "  - Package manager: docker-compose-plugin"
  fi
}

uninstallComposePlugin() {
  local removed=false

  if isComposePluginBinaryInstalled; then
    runAsRoot rm -f "$COMPOSE_PLUGIN_BINARY_PATH"
    printf "Removed Compose binary: %s\n" "$COMPOSE_PLUGIN_BINARY_PATH"
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
    echo "Removed package docker-compose-plugin"
    removed=true
  fi

  if [[ "$removed" == "false" ]]; then
    echo "No Docker Compose plugin found to remove."
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
  echo "Docker Compose plugin not found. Continue?" >&2
  echo "  1) Install (official binary, recommended)" >&2
  echo "  2) Install (package manager)" >&2
  echo "  0) Exit" >&2
  echo "" >&2

  while true; do
    promptRead -p "Choose [0-2] (default 1): " choice || return 1
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
    echo "Invalid choice. Enter 0-2." >&2
  done
}

ensureCompose() {
  local method=""

  if resolveComposeCmd; then
    return 0
  fi

  method="$(selectComposeInstallMethod)" || exit 1
  if [[ "$method" == "cancel" ]]; then
    echo "Exiting..."
    exit 0
  fi

  case "$method" in
    binary)
      echo "Working, please wait..."
      installComposePluginManually || true
      ;;
    package)
      echo "Working, please wait..."
      installComposePluginViaPackageManager || true
      if ! resolveComposeCmd; then
        echo "Package install failed, trying official binary..."
        installComposePluginManually || true
      fi
      ;;
  esac

  if resolveComposeCmd; then
    return 0
  fi

  echo "Error: Docker Compose install failed (root/sudo required)."
  echo "See: https://docs.docker.com/compose/install/linux/"
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

  echo "Note: outbound Cloudflare port ${CF_TUNNEL_PROBE_PORT} (TCP/UDP) is unreachable. Check firewall or security group."
  echo ""
}

showCloudflareBeforeScriptGuide() {
  echo ""
  printDivider
  echo "Configure Cloudflare Tunnel"
  printDivider
  echo "Create the tunnel in Cloudflare and copy the Token, then return here."
  echo ""
  echo "  1. Cloudflare Dashboard → Networking → Tunnels"
  printGuideSubLink "https://dash.cloudflare.com/?to=/:account/tunnels"
  echo "  2. Create a tunnel → name it (e.g. ipa-harbor) → Create Tunnel"
  echo "  3. Choose Docker"
  echo "     Scroll to the bottom; you should see Connection Status: Waiting for your Tunnel to connect..."
  echo "  4. Copy the Tunnel Token or docker run command from Cloudflare"
  echo "     Example:"
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
  echo "Configure Cloudflare Route"
  printDivider
  echo "cloudflared is running. Continue in the Cloudflare dashboard:"
  echo ""
  echo "  1. Open the tunnel list"
  printGuideSubLink "https://dash.cloudflare.com/?to=/:account/tunnels"
  echo "     Connection Status should be Healthy / Connected"
  echo "  2. Click the tunnel name → Routes → Add route"
  echo "  3. Choose Published application"
  echo "  4. Subdomain + Domain → must match your public hostname below:"
  printf "     %s\n" "$publicHost"
  echo "  5. Service URL → Compose service name (not Docker hostname/network name):"
  printf "     http://%s:%s\n" "$APP_SERVICE_NAME" "$CONTAINER_PORT"
  echo "  6. Add route"
  echo ""
  printf "Then open in your browser: %s\n" "$publicUrl"
  echo ""
  printInitPinLine "Init PIN on first visit: " "$adminInitPin"
  echo ""
  echo "Note: DNS may take a few minutes to propagate. Refresh later if the site is not up yet."
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
    echo "Error: Tunnel Token is too short. Copy the full install command or Token from Cloudflare."
    return 1
  fi
  if [[ "$token" != eyJ* ]]; then
    echo "Error: Unrecognized Tunnel Token (should start with eyJ). Paste the full docker run command or Token."
    return 1
  fi
  return 0
}

validatePublicHost() {
  local host="$1"
  if [[ ! "$host" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$ ]]; then
    echo "Error: invalid hostname. Example: ipa-harbor.uuphy.com"
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
# IPA-Harbor public deployment — contains secrets, do not commit to Git
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
  # App runs as ij369 (1001); pre-create dirs and fix permissions on first volume init
  docker volume create "$DATA_VOLUME" >/dev/null 2>&1 || true
  docker run --rm -v "${DATA_VOLUME}:/data" alpine:3.20 \
    sh -c 'mkdir -p /data/.ipatool && chown -R 1001:1001 /data && chmod -R u+rwX /data' >/dev/null 2>&1 || {
    echo "Warning: data volume permission init failed. Check Docker."
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

  printf "Waiting for %s to start…\n" "$APP_SERVICE_NAME"
  while [[ $i -lt attempts ]]; do
    if docker inspect --format '{{.State.Running}}' "$APP_SERVICE_NAME" 2>/dev/null | grep -qx 'true'; then
      if compose exec -T "$APP_SERVICE_NAME" curl -fsS "http://127.0.0.1:${CONTAINER_PORT}/health" >/dev/null 2>&1; then
        return 0
      fi
    fi
    sleep 2
    i=$((i + 1))
  done
  printf "Note: %s is not ready yet. Check: docker logs %s\n" "$APP_SERVICE_NAME" "$APP_SERVICE_NAME"
  return 1
}

isCloudflaredTunnelReady() {
  local logs=""

  if ! docker inspect --format '{{.State.Running}}' "$TUNNEL_SERVICE_NAME" 2>/dev/null | grep -qx 'true'; then
    return 1
  fi

  logs="$(docker logs --tail 500 "$TUNNEL_SERVICE_NAME" 2>&1)" || return 1
  # Success: "Registered tunnel connection"; remote config: "Updated to new configuration"
  # Word boundaries avoid matching "Unregistered tunnel connection"
  printf '%s' "$logs" | grep -Eiq \
    '\bRegistered tunnel connection\b|Updated to new configuration|"message":"Registered tunnel connection"'
}

waitForCloudflared() {
  local attempts="${1:-60}"
  local i=0

  printf "Waiting for %s to register tunnel…\n" "$TUNNEL_SERVICE_NAME"
  while [[ $i -lt attempts ]]; do
    if isCloudflaredTunnelReady; then
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done

  # Final recheck at poll window boundary
  if isCloudflaredTunnelReady; then
    return 0
  fi

  echo "Note: tunnel connection not detected. Check Token and outbound port 7844:"
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
  promptAnyKey "Press any key to return to menu… " || true
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
  echo "Self-hosted public deployment on a machine running Docker."
  echo "Prerequisites: a Cloudflare-managed domain and a host running Docker (VPS, cloud VM, dedicated host, NAS, Raspberry Pi, etc.)."
  echo "Deploy dir: $DEPLOY_DIR"
  echo ""

  showCloudflareBeforeScriptGuide
  promptRead -p "Press Enter to continue… " _ || return 1
  echo ""

  while true; do
    local tunnelInput=""
    promptRead -p "Paste the Tunnel Token or command from Cloudflare: " tunnelInput || return 1
    if ! tunnelToken="$(parseTunnelToken "$tunnelInput")"; then
      echo "Error: could not parse Token. Paste eyJ... or a command with --token."
      continue
    fi
    if validateTunnelToken "$tunnelToken"; then
      break
    fi
  done

  echo ""
  echo "Public hostname"
  echo "  The URL users open in a browser. Must be a domain on Cloudflare."
  echo "  If your domain is uuphy.com, pick an unused subdomain such as ipa-harbor.uuphy.com"
  echo ""

  while true; do
    promptRead -p "Public hostname (e.g. ipa-harbor.uuphy.com): " publicHost || return 1
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
  echo "Deploy preview"
  printDivider
  printf "Public URL:   %s\n" "$publicUrl"
  echo ""
  printf "ALLOWED_DOMAINS: %s\n" "$allowedDomains"
  echo ""
  printf "WEBAUTHN_RP_ID:  %s\n" "$rpId"
  echo ""
  printInitPinLine "Init PIN: " "$adminInitPin"
  echo ""

  promptRead -p "Press Enter to generate config and start, or Ctrl+C to cancel… " _ || return 1

  mkdir -p "$DEPLOY_DIR"
  writeEnvFile "$tunnelToken" "$publicHost" "$PUBLIC_HTTPS_PORT" "$allowedDomains" "$rpId" "$publicUrl" "$adminInitPin" "$keychainPassphrase"
  writeComposeFile
  ensureDataVolume || return 1

  echo ""
  echo "Generated:"
  printf "  %s/%s\n" "$DEPLOY_DIR" "$COMPOSE_FILE"
  printf "  %s/%s\n" "$DEPLOY_DIR" "$DEPLOY_ENV_FILE"
  echo ""

  echo "Starting services…"
  if ! compose up -d --remove-orphans; then
    echo ""
    echo "Error: services failed to start. Debug with:"
    printf "  cd %s && %s ps\n" "$DEPLOY_DIR" "${COMPOSE_CMD[*]}"
    printf "  cd %s && %s logs\n" "$DEPLOY_DIR" "${COMPOSE_CMD[*]}"
    return 1
  fi

  local ipaOk=false
  local tunnelOk=false
  local ipaWaitPid=0
  local tunnelWaitPid=0

  # Wait in parallel: cloudflared does not depend on app health
  waitForIpaHarbor &
  ipaWaitPid=$!
  waitForCloudflared &
  tunnelWaitPid=$!

  if wait "$ipaWaitPid"; then
    ipaOk=true
    printf "  ✓ %s\n" "$APP_SERVICE_NAME"
  else
    printf "  ✗ %s (not ready, check logs)\n" "$APP_SERVICE_NAME"
  fi

  if wait "$tunnelWaitPid"; then
    tunnelOk=true
    printf "  ✓ %s\n" "$TUNNEL_SERVICE_NAME"
  else
    printf "  ✗ %s (not ready, check logs)\n" "$TUNNEL_SERVICE_NAME"
  fi

  printSuccess "$publicHost" "$publicUrl" "$adminInitPin"

  if [[ "$ipaOk" == "false" || "$tunnelOk" == "false" ]]; then
    echo "Debug commands:"
    printf "  docker logs %s\n" "$APP_SERVICE_NAME"
    printf "  docker logs %s\n" "$TUNNEL_SERVICE_NAME"
    return 1
  fi
}

actionUpgrade() {
  ensureDockerRuntime

  if [[ ! -f "${DEPLOY_DIR}/${COMPOSE_FILE}" || ! -f "${DEPLOY_DIR}/${DEPLOY_ENV_FILE}" ]]; then
    echo "Error: no existing deployment. Run install first."
    return 1
  fi

  echo ""
  printDivider
  echo "${WIZARD_TITLE} — Upgrade"
  printDivider
  printf "Pull latest images and recreate containers. Data volume %s will be kept.\n" "$DATA_VOLUME"
  echo ""

  promptRead -p "Press Enter to upgrade, or Ctrl+C to cancel… " _ || return 1

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
  echo "Upgrade complete."
  [[ -n "$publicUrl" ]] && printf "Public URL: %s\n" "$publicUrl"
  [[ -n "$adminInitPin" ]] && printInitPinLine "Init PIN: " "$adminInitPin"
}

actionUninstall() {
  ensureDockerRuntime

  if [[ ! -f "$DEPLOY_DIR/$COMPOSE_FILE" ]]; then
    echo "Error: no existing deployment."
    return 1
  fi

  local confirm=""
  local keepDataAnswer=""
  local removeComposeAnswer=""
  local keepData=true
  local removeCompose=false

  echo ""
  printDivider
  echo "${WIZARD_TITLE} — Uninstall"
  printDivider

  promptRead -p "Confirm uninstall? (y/N) " confirm || return 1
  if ! isYes "$confirm"; then
    echo "Cancelled."
    return 0
  fi

  promptRead -p "$(printf "Keep data volume %s (downloaded IPAs and user data)? (Y/n) " "$DATA_VOLUME")" keepDataAnswer || return 1
  keepDataAnswer="$(trimInput "$keepDataAnswer")"
  if [[ -n "$keepDataAnswer" ]] && ! isYes "$keepDataAnswer"; then
    keepData=false
  fi

  if isComposePluginBinaryInstalled || isComposePluginPackageInstalled; then
    echo ""
    echo "Docker Compose plugin detected:"
    showComposePluginUninstallHint
    promptRead -p "Also uninstall Docker Compose plugin? (y/N) " removeComposeAnswer || return 1
    if isYes "$(trimInput "$removeComposeAnswer")"; then
      removeCompose=true
    fi
  fi

  compose down --remove-orphans

  if [[ "$keepData" == "true" ]]; then
    printf "Done: containers removed, data volume %s kept.\n" "$DATA_VOLUME"
  else
    docker volume rm "$DATA_VOLUME" >/dev/null 2>&1 || true
    printf "Done: containers and data volume %s removed.\n" "$DATA_VOLUME"
  fi

  if [[ "$removeCompose" == "true" ]]; then
    echo ""
    uninstallComposePlugin || true
  fi

  echo ""
  echo "Note: delete the Tunnel in Cloudflare dashboard manually if you no longer need it."

  if [[ "$removeCompose" == "true" ]]; then
    echo ""
    echo "Exiting..."
    exit 0
  fi
}

showMenu() {
  echo ""
  printDivider
  echo "$WIZARD_TITLE"
  printDivider
  echo "  1. Install"
  echo "  2. Upgrade (keep data)"
  echo "  3. Uninstall"
  echo "  0. Exit"
  echo ""
}

usage() {
  cat <<EOF
Self-hosted public deployment on a machine running Docker (Linux server + Cloudflare Tunnel).

Usage:
  bash public-deploy-cf.sh              Interactive menu
  bash public-deploy-cf.sh install      Install
  bash public-deploy-cf.sh upgrade      Upgrade
  bash public-deploy-cf.sh uninstall    Uninstall

Prerequisites: a Cloudflare-managed domain and a host running Docker (VPS, cloud VM, dedicated host, NAS, Raspberry Pi, etc.).

Environment:
  DEPLOY_DIR              Deploy directory (default: ~/ipa-harbor-remote)
  IMAGE                   IPA-Harbor image (default: uuphy/ipa-harbor:latest)
  PUBLIC_HTTPS_PORT       Public HTTPS port (default: 443, Cloudflare edge)
  COMPOSE_INSTALL_METHOD  Compose install: binary (default) | package
  COMPOSE_PLUGIN_VERSION  Compose binary version (default: v5.5.1, or latest)

One-liner:
  curl -fsSL https://raw.githubusercontent.com/ij369/ipa-harbor/main/scripts/public-deploy-cf.sh | bash
EOF
}

mainMenu() {
  ensureDockerRuntime
  while true; do
    showMenu
    promptRead -p "Choose [0-3]: " choice || exit 1
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
        echo "Exiting..."
        exit 0
        ;;
      *)
        echo "Invalid choice. Enter 0-3."
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
    printf "Unknown command: %s\n" "$1" >&2
    echo "" >&2
    usage >&2
    exit 1
    ;;
esac
