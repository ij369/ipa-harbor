#!/usr/bin/env bash
bootstrapQuickDeployFromRemote() {
  local remoteUrl="$1"
  local scriptName="${remoteUrl##*/}"
  shift
  local tmpRoot="" libBase=""

  tmpRoot="$(mktemp -d "${TMPDIR:-/tmp}/ipa-harbor-deploy-XXXXXX")"
  libBase="${remoteUrl%/scripts/*}/scripts/lib"
  mkdir -p "${tmpRoot}/lib"
  if ! curl -fsSL "$remoteUrl" -o "${tmpRoot}/${scriptName}"; then
    echo "Error: failed to download deploy script. Check your network and retry." >&2
    exit 1
  fi
  if ! curl -fsSL "${libBase}/lan-network.sh" -o "${tmpRoot}/lib/lan-network.sh"; then
    echo "Error: failed to download deploy script dependency (lan-network.sh). Check your network and retry." >&2
    exit 1
  fi
  if ! curl -fsSL "${libBase}/print-qr.sh" -o "${tmpRoot}/lib/print-qr.sh"; then
    echo "Error: failed to download deploy script dependency (print-qr.sh). Check your network and retry." >&2
    exit 1
  fi
  exec bash "${tmpRoot}/${scriptName}" "$@"
}

if [[ -z "${BASH_SOURCE[0]:-}" || "${BASH_SOURCE[0]:-}" == "-" ]]; then
  bootstrapQuickDeployFromRemote "${QUICK_DEPLOY_REMOTE_URL:-https://raw.githubusercontent.com/ij369/ipa-harbor/main/scripts/quick-deploy.sh}" ${1+"$@"}
fi

set -euo pipefail

readonly CONTAINER_NAME="${CONTAINER_NAME:-ipa-harbor}"
readonly DATA_VOLUME="${DATA_VOLUME:-ipa_data}"
readonly IMAGE="${IMAGE:-uuphy/ipa-harbor:latest}"
readonly HOST_PORT="${HOST_PORT:-3388}"
readonly FALLBACK_HOST_PORT="${FALLBACK_HOST_PORT:-3399}"
readonly CONTAINER_PORT="${CONTAINER_PORT:-3080}"
readonly HTTPS_HOST_PORT="${HTTPS_HOST_PORT:-3443}"
readonly CONTAINER_HTTPS_PORT="${CONTAINER_HTTPS_PORT:-3443}"
readonly ADMIN_INIT_PIN="${ADMIN_INIT_PIN:-20251024}"
readonly WEBAUTHN_RP_ID="localhost"
readonly GITHUB_REPO_URL="https://github.com/ij369/ipa-harbor"
readonly DOCKER_HUB_URL="https://hub.docker.com/r/uuphy/ipa-harbor"
readonly AUTHOR_PROJECTS_URL="https://uuphy.com/projects"
readonly IPA_HARBOR_REPO="${IPA_HARBOR_REPO:-ij369/ipa-harbor}"
readonly IPA_HARBOR_BRANCH="${IPA_HARBOR_BRANCH:-main}"
readonly MENU_LOCALE="en"
readonly SCRIPT_NAME_EN="quick-deploy.sh"
readonly SCRIPT_NAME_ZH="quick-deploy.zh.sh"
readonly REMOTE_SCRIPT_EN="https://raw.githubusercontent.com/${IPA_HARBOR_REPO}/${IPA_HARBOR_BRANCH}/scripts/quick-deploy.sh"
readonly REMOTE_SCRIPT_ZH="https://raw.githubusercontent.com/${IPA_HARBOR_REPO}/${IPA_HARBOR_BRANCH}/scripts/quick-deploy.zh.sh"

resolveQuickDeploySelfPath() {
  local path="${BASH_SOURCE[0]:-}"
  if [[ -z "$path" || "$path" == "-" ]]; then
    path="${0:-}"
  fi
  if [[ -z "$path" || "$path" == "-" || "$path" == "bash" || ! -f "$path" ]]; then
    return 0
  fi
  (cd "$(dirname "$path")" && printf '%s/%s\n' "$(pwd)" "$(basename "$path")")
}

QUICK_DEPLOY_SELF="$(resolveQuickDeploySelfPath)"
readonly QUICK_DEPLOY_SELF

BROWSER_OPEN_CANCELLED=0

promptRead() {
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
    if [[ -w /dev/tty ]] 2>/dev/null; then
      printf '%s' "$prompt" >/dev/tty
    else
      printf '%s' "$prompt" >&2
    fi
  fi

  if [[ -t 0 ]]; then
    read -r "${args[@]}"
    return $?
  fi
  if [[ ! -r /dev/tty ]]; then
    echo "Error: interactive input required." >&2
    return 1
  fi
  read -r "${args[@]}" </dev/tty
}

pause() {
  if isInteractiveTerminal; then
    promptRead -p "Press Enter to continue… " _ || true
  fi
}

pauseAfterAction() {
  if [[ "$BROWSER_OPEN_CANCELLED" == "1" ]]; then
    BROWSER_OPEN_CANCELLED=0
    return 0
  fi
  pause
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

printAppHeader() {
  echo ""
  printDivider
  echo "IPA-Harbor local Docker manager"
  printDivider
  echo ""
}

printInstallProgressHeader() {
  echo ""
  printDivider
  echo "IPA-Harbor installing"
  printDivider
  echo ""
}

printUpgradeProgressHeader() {
  echo ""
  printDivider
  echo "IPA-Harbor upgrading"
  printDivider
  echo ""
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

printInstallCompleteTitle() {
  if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    printf '%b %s\n' $'\033[1;32m✓\033[0m' "Install complete"
  else
    echo "✓ Install complete"
  fi
}

printUpgradeCompleteTitle() {
  if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    printf '%b %s\n' $'\033[1;32m✓\033[0m' "Upgrade complete"
  else
    echo "✓ Upgrade complete"
  fi
}

printUninstallCompleteTitle() {
  if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    printf '%b %s\n' $'\033[1;32m✓\033[0m' "Uninstall complete"
  else
    echo "✓ Uninstall complete"
  fi
}

printDockerNotInstalledHint() {
  echo "Docker is not installed."
  echo ""
  echo "Please install one of:"
  echo "  • OrbStack"
  echo "    https://orbstack.dev/download"
  echo "  • Docker Desktop"
  echo "    https://www.docker.com/products/docker-desktop/"
  echo ""
}

printDockerNotRunningHint() {
  echo "Docker is not running."
  echo ""
  echo "Please start Docker Desktop or OrbStack, then continue."
  echo ""
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

printLinuxDockerNotRunningHint() {
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
  printLinuxDockerNotRunningHint
  if ! isInteractiveTerminal; then
    echo "Error: interactive terminal required." >&2
    exit 1
  fi
  echo "After fixing the issue, run this script again."
  promptAnyKey "Press any key to exit… " || true
  exit 0
}

ensureDockerCommand() {
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi

  if isLinux; then
    promptLinuxDockerInstall
  fi

  while ! command -v docker >/dev/null 2>&1; do
    printDockerNotInstalledHint
    if ! isInteractiveTerminal; then
      echo "Error: interactive terminal required." >&2
      exit 1
    fi
    promptAnyKey "Press any key to continue… " || exit 1
    echo ""
  done
}

requireDocker() {
  ensureDockerCommand

  if ! docker info >/dev/null 2>&1; then
    if isLinux; then
      promptLinuxDockerNotRunning
    fi

    while ! docker info >/dev/null 2>&1; do
      printDockerNotRunningHint
      if ! isInteractiveTerminal; then
        echo "Error: interactive terminal required." >&2
        exit 1
      fi
      promptAnyKey "Press any key to continue… " || exit 1
      echo ""
    done
  fi
}

isYes() {
  [[ "${1:-}" == "y" || "${1:-}" == "Y" || "${1:-}" == "yes" || "${1:-}" == "YES" ]]
}

isInteractiveTerminal() {
  [[ -t 0 ]] && return 0
  ( : < /dev/tty ) 2>/dev/null
}

initQuickDeployScriptDir() {
  local candidateDir=""

  if [[ -n "$QUICK_DEPLOY_SELF" ]]; then
    candidateDir="$(dirname "$QUICK_DEPLOY_SELF")"
    if [[ -f "${candidateDir}/lib/lan-network.sh" && -f "${candidateDir}/lib/print-qr.sh" ]]; then
      SCRIPT_DIR="$candidateDir"
      return 0
    fi
  fi

  echo "Error: deploy script lib/ not found. Use curl | bash or run from the repo scripts/ directory." >&2
  exit 1
}

initQuickDeployScriptDir
# shellcheck source=lib/lan-network.sh
source "${SCRIPT_DIR}/lib/lan-network.sh"
# shellcheck source=lib/print-qr.sh
source "${SCRIPT_DIR}/lib/print-qr.sh"

buildLanHttpsWebAuthnOrigins() {
  local lanIp="$1"
  local lanHostname="$2"
  local httpPort="$3"
  local httpsPort="$4"
  local origins="http://127.0.0.1:${httpPort},http://localhost:${httpPort}"
  origins+=",http://${lanIp}:${httpPort},https://${lanIp}:${httpsPort}"
  if [[ -n "$lanHostname" ]]; then
    origins+=",http://${lanHostname}:${httpPort},https://${lanHostname}:${httpsPort}"
  fi
  echo "$origins"
}

buildLanHttpsWebAuthnRpId() {
  local lanHostname="$1"
  if [[ -n "$lanHostname" ]]; then
    echo "${lanHostname%.local}"
  else
    echo "localhost"
  fi
}

ensureHttpsPortInPortArgs() {
  local hostPort="$1"
  local containerPort="$2"
  local i=0
  while [[ $i -lt ${#PORT_ARGS[@]} ]]; do
    if [[ "${PORT_ARGS[$i]}" == "-p" ]]; then
      local mapping="${PORT_ARGS[$((i + 1))]}"
      if [[ "$mapping" == *":${containerPort}" ]]; then
        return 0
      fi
    fi
    i=$((i + 2))
  done
  PORT_ARGS+=("-p" "${hostPort}:${containerPort}")
}

applyLanHttpsEnvToArgs() {
  local lanIp="$1"
  local lanHostname="$2"
  local httpPort="$3"
  local httpsPort="$4"
  upsertEnvArg "ENABLE_AUTO_CERT" "true"
  upsertEnvArg "LAN_IP" "$lanIp"
  if [[ -n "$lanHostname" ]]; then
    upsertEnvArg "LAN_HOSTNAME" "$lanHostname"
  fi
  upsertEnvArg "ALLOW_LAN_ACCESS" "true"
  upsertEnvArg "PORT" "$CONTAINER_PORT"
  upsertEnvArg "HTTPS_PORT" "$CONTAINER_HTTPS_PORT"
  upsertEnvArg "WEBAUTHN_RP_ID" "$(buildLanHttpsWebAuthnRpId "$lanHostname")"
  upsertEnvArg "WEBAUTHN_ALLOWED_ORIGINS" "$(buildLanHttpsWebAuthnOrigins "$lanIp" "$lanHostname" "$httpPort" "$httpsPort")"
}

getEnvArgValue() {
  local key="$1"
  local i=0
  while [[ $i -lt ${#ENV_ARGS[@]} ]]; do
    if [[ "${ENV_ARGS[$i]}" == "-e" && "${ENV_ARGS[$i+1]}" == "${key}="* ]]; then
      printf '%s\n' "${ENV_ARGS[$i+1]#${key}=}"
      return 0
    fi
    i=$((i + 2))
  done
  return 1
}

containerHasLanHttpsEnv() {
  [[ "$(getEnvArgValue ENABLE_AUTO_CERT 2>/dev/null || true)" == "true" ]] && [[ -n "$(getEnvArgValue LAN_IP 2>/dev/null || true)" ]]
}

printLanAccessUrls() {
  local lanIp="$1"
  local httpPort="$2"
  local lanHostname="${3:-}"

  if [[ -n "$lanHostname" ]]; then
    printf "HTTPS URL:  https://%s:%s\n" "$lanHostname" "$HTTPS_HOST_PORT"
    printf "            https://%s:%s\n" "$lanIp" "$HTTPS_HOST_PORT"
  else
    printf "HTTPS URL:  https://%s:%s\n" "$lanIp" "$HTTPS_HOST_PORT"
  fi
  echo ""
}

ensureLanHttpsPortAvailable() {
  local containerName="${1:-}"
  ensureHttpsPortInPortArgs "$HTTPS_HOST_PORT" "$CONTAINER_HTTPS_PORT"
  local newHttpsMapping="" i=0
  while [[ $i -lt ${#PORT_ARGS[@]} ]]; do
    if [[ "${PORT_ARGS[$i]}" == "-p" && "${PORT_ARGS[$((i + 1))]}" == *":${CONTAINER_HTTPS_PORT}" ]]; then
      newHttpsMapping="${PORT_ARGS[$((i + 1))]}"
      break
    fi
    i=$((i + 2))
  done
  [[ -z "$newHttpsMapping" ]] && return 0
  local newHostHttpsPort="${newHttpsMapping%%:*}"
  if isHostPortInUse "$newHostHttpsPort"; then
    if [[ -n "$containerName" ]]; then
      local currentPort=""
      currentPort="$(docker port "$containerName" "${CONTAINER_HTTPS_PORT}/tcp" 2>/dev/null | cut -d: -f2 || true)"
      [[ "$newHostHttpsPort" == "$currentPort" ]] && return 0
    fi
    printf "Error: HTTPS port %s is already in use.\n" "$newHostHttpsPort" >&2
    return 1
  fi
  return 0
}

promptEnableAutoCert() {
  local answer=""
  echo "Enable LAN HTTPS?"
  echo "This allows iPhone and iPad devices to install apps over the local network via OTA."
  echo ""
  echo "  0. Skip for now (can be enabled later in the Web UI)"
  echo "  1. Enable"
  promptRead -p "Choose [0-1, default 0]: " answer || true
  answer="${answer//[[:space:]]/}"
  [[ -z "$answer" ]] && answer=0
  [[ "$answer" == "1" ]]
}

prepareLanHttpsCandidate() {
  local httpPort="$1"
  LAN_HTTPS_AVAILABLE=false
  LAN_HTTPS_SKIP_REASON=""

  if ! resolveLanHttpsSettings; then
    LAN_HTTPS_SKIP_REASON="no_lan"
    return 1
  fi
  if isHostPortInUse "$HTTPS_HOST_PORT"; then
    LAN_HTTPS_SKIP_REASON="https_port"
    return 1
  fi
  LAN_HTTPS_AVAILABLE=true
  return 0
}

applyLanHttpsChoiceAfterPrompt() {
  local httpPort="$1"
  local containerName="${2:-}"

  LAN_HTTPS_ENABLED=false
  LAN_HTTPS_AVAILABLE=false
  LAN_HTTPS_SKIP_REASON=""

  if ! promptEnableAutoCert; then
    return 1
  fi

  if ! prepareLanHttpsCandidate "$httpPort"; then
    printLanHttpsSkipHint
    return 1
  fi

  if [[ -n "$containerName" ]] && ! ensureLanHttpsPortAvailable "$containerName"; then
    echo "Note: HTTPS port unavailable; skipping this configuration."
    LAN_HTTPS_SKIP_REASON="https_port"
    return 1
  fi

  LAN_HTTPS_ENABLED=true
  return 0
}

printLanHttpsSkipHint() {
  case "${LAN_HTTPS_SKIP_REASON:-}" in
    no_lan)
      echo "Note: No LAN IP detected; HTTPS access was not enabled. Run the https subcommand later if needed."
      ;;
    https_port)
      printf "Note: HTTPS port %s is in use; HTTPS access was not enabled.\n" "$HTTPS_HOST_PORT"
      ;;
  esac
}

printLanHttpsAccessHints() {
  local containerName="$1"
  local lanIp="$2"
  local lanHostname="$3"
  local httpPort="$4"
  echo "Open the CA install page on your iPhone or iPad"
  echo ""
  printTerminalQrCode "$containerName" "$lanIp" "$lanHostname" "$httpPort" || true
  echo ""
}

restartContainerWithLanHttpsEnv() {
  local targetContainer="$1"
  local containerImage="$2"
  local backupName="${targetContainer}-bak-$(date +%Y%m%d%H%M%S)"

  echo "[1/2] Stopping existing container…"
  if [[ "$(docker inspect --format '{{.State.Running}}' "$targetContainer")" == "true" ]]; then
    docker stop "$targetContainer" >/dev/null
  fi
  docker rename "$targetContainer" "$backupName"

  echo "[2/2] Updating environment and restarting container…"
  if ! runContainerFromConfig "$targetContainer" "$containerImage" "false"; then
    echo ""
    echo "Rolling back…"
    docker rm -f "$targetContainer" >/dev/null 2>&1 || true
    docker rename "$backupName" "$targetContainer" >/dev/null 2>&1 || true
    docker start "$targetContainer" >/dev/null 2>&1 || true
    return 1
  fi

  if [[ "$(docker inspect --format '{{.State.Running}}' "$targetContainer")" == "true" ]]; then
    docker rm -f "$backupName" >/dev/null
    return 0
  fi

  printf "Note: Container is not running; backup kept: %s\n" "$backupName"
  return 1
}

actionLanHttpsAccess() {
  requireDocker

  local existingContainer=""
  if ! existingContainer="$(pickIpaHarborContainer)"; then
    return 1
  fi
  if [[ -z "$existingContainer" ]]; then
    echo "Error: No IPA-Harbor container found. Choose install (1) first."
    return 1
  fi

  if ! resolveLanHttpsSettings; then
    return 1
  fi

  local lanIp="$PICKED_LAN_IP"
  local lanHostname="$PICKED_LAN_HOSTNAME"
  local httpHostPort=""

  readContainerConfig "$existingContainer"
  httpHostPort="$(getPrimaryHostPortFromPortArgs)"

  clearScreen
  echo ""
  printDivider
  echo "Enable HTTPS access"
  printDivider
  printf "Network:     %s\n" "$PICKED_LAN_LABEL"
  echo ""
  printLanAccessUrls "$lanIp" "$httpHostPort" "$lanHostname"
  echo ""

  promptRead -p "Press Enter to continue, or Ctrl+C to cancel… " _

  if ! ensureLanHttpsPortAvailable "$existingContainer"; then
    return 1
  fi

  ensureAdminInitPin
  applyLanHttpsEnvToArgs "$lanIp" "$lanHostname" "$httpHostPort" "$HTTPS_HOST_PORT"

  clearScreen
  echo ""
  printDivider
  echo "Apply HTTPS access"
  printDivider
  echo ""

  if ! restartContainerWithLanHttpsEnv "$existingContainer" "$OLD_IMAGE"; then
    return 1
  fi

  clearScreen
  printAppHeader
  if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    printf '%b %s\n' $'\033[1;32m✓\033[0m' "HTTPS access enabled"
  else
    echo "✓ HTTPS access enabled"
  fi
  printLanHttpsAccessHints "$existingContainer" "$lanIp" "$lanHostname" "$httpHostPort"
  pause
}

clearScreen() {
  if ! isInteractiveTerminal; then
    return 0
  fi
  if command -v clear >/dev/null 2>&1; then
    clear
  else
    printf '\033[H\033[2J' >/dev/tty 2>/dev/null || true
  fi
}

trimInput() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

waitForServiceUrl() {
  local url="$1"
  local attempts="${2:-30}"
  local i=0

  echo "Waiting for service to respond…"
  while [[ $i -lt attempts ]]; do
    if curl -sS --max-time 2 -o /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done

  echo "Note: Service is not responding yet; opening browser anyway."
  return 1
}

openBrowserUrl() {
  local url="$1"

  if [[ "$(uname -s)" != "Darwin" ]]; then
    printf "Please open manually: %s\n" "$url"
    return 1
  fi

  waitForServiceUrl "$url" || true

  if [[ -x /usr/bin/open ]]; then
    if /usr/bin/open "$url"; then
      printf "Opened in your default browser: %s\n" "$url"
      echo ""
      return 0
    fi
  elif command -v open >/dev/null 2>&1; then
    if open "$url"; then
      printf "Opened in your default browser: %s\n" "$url"
      echo ""
      return 0
    fi
  fi

  echo "Could not open browser automatically. Please open:"
  printf "  %s\n" "$url"
  return 1
}

generateKeychainPassphrase() {
  openssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10
}

visitUrlFromPorts() {
  local hostPort="$1"
  echo "http://localhost:${hostPort}"
}

isHostPortInUse() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1 && return 0
  fi
  if command -v nc >/dev/null 2>&1; then
    nc -z localhost "$port" >/dev/null 2>&1 && return 0
  fi
  docker ps --format '{{.Ports}}' 2>/dev/null | grep -qE "(0\\.0\\.0\\.0|127\\.0\\.0\\.1|\\[::\\]):${port}->" && return 0
  return 1
}

explainContainerStartFailure() {
  local errMsg="$1"
  local hostPort="$2"
  if [[ "$errMsg" == *"port is already allocated"* || "$errMsg" == *"Bind for"* ]]; then
    printf "Error: Port %s is already in use; cannot bind the container.\n" "$hostPort"
    echo "   Stop the program using that port and try again."
  else
    echo "Error: Failed to start the container."
    while IFS= read -r line; do
      [[ -n "$line" ]] && echo "   $line"
    done <<< "$errMsg"
  fi
}

getPrimaryHostPortFromPortArgs() {
  if [[ ${#PORT_ARGS[@]} -ge 2 ]]; then
    echo "${PORT_ARGS[1]%%:*}"
  else
    echo "$HOST_PORT"
  fi
}

maybeOpenBrowser() {
  local url="$1"
  local openBrowser=""

  BROWSER_OPEN_CANCELLED=0

  if [[ "$(uname -s)" != "Darwin" ]] || ! isInteractiveTerminal; then
    return 0
  fi

  printf "Opening browser in 5s… Press N to cancel." >/dev/tty
  local i
  for (( i = 0; i < 5; i++ )); do
    if read -r -n 1 -s -t 1 openBrowser </dev/tty 2>/dev/null; then
      if [[ "$openBrowser" == "n" || "$openBrowser" == "N" ]]; then
        echo "" >/dev/tty
        BROWSER_OPEN_CANCELLED=1
        return 0
      fi
    fi
  done
  echo "" >/dev/tty
  openBrowserUrl "$url"
}

containerExists() {
  docker inspect "$1" >/dev/null 2>&1
}

isBackupContainerName() {
  [[ "${1:-}" =~ -bak-[0-9]+$ ]]
}

isIpaHarborImage() {
  local img="${1:-}"
  case "$img" in
    uuphy/ipa-harbor | uuphy/ipa-harbor:* | */uuphy/ipa-harbor | */uuphy/ipa-harbor:*)
      return 0
      ;;
  esac
  return 1
}

resolveInstallHostPort() {
  local preferred="$1"
  local fallback="$2"

  if ! isHostPortInUse "$preferred"; then
    echo "$preferred"
    return 0
  fi

  if [[ "$preferred" == "$fallback" ]]; then
    printf "Error: Port %s is already in use; cannot install.\n" "$preferred" >&2
    return 1
  fi

  if ! isHostPortInUse "$fallback"; then
    echo "$fallback"
    return 0
  fi

  printf "Error: Ports %s and %s are both in use; cannot install.\n" "$preferred" "$fallback" >&2
  return 1
}

listIpaHarborImages() {
  docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E '(^|/)uuphy/ipa-harbor:' | grep -v '<none>' || true
}

listIpaHarborContainers() {
  local name img
  local -a preferred=() running=() stopped=()
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    isBackupContainerName "$name" && continue
    img="$(docker inspect --format '{{.Config.Image}}' "$name" 2>/dev/null || true)"
    isIpaHarborImage "$img" || continue
    if [[ "$name" == "$CONTAINER_NAME" ]]; then
      preferred+=("$name")
    elif [[ "$(docker inspect --format '{{.State.Running}}' "$name" 2>/dev/null || true)" == "true" ]]; then
      running+=("$name")
    else
      stopped+=("$name")
    fi
  done < <(docker ps -a --format '{{.Names}}')

  local n
  for n in ${preferred[@]+"${preferred[@]}"} ${running[@]+"${running[@]}"} ${stopped[@]+"${stopped[@]}"}; do
    [[ -n "$n" ]] && echo "$n"
  done
}

pickIpaHarborContainer() {
  local -a containers=()
  local name img status choice i maxChoice
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    containers+=("$name")
  done < <(listIpaHarborContainers)

  if [[ ${#containers[@]} -eq 0 ]]; then
    echo ""
    return 0
  fi
  if [[ ${#containers[@]} -eq 1 ]]; then
    echo "${containers[0]}"
    return 0
  fi

  echo ""
  echo "Multiple IPA-Harbor containers found:"
  i=1
  for name in "${containers[@]}"; do
    status="stopped"
    [[ "$(docker inspect --format '{{.State.Running}}' "$name" 2>/dev/null || true)" == "true" ]] && status="running"
    img="$(docker inspect --format '{{.Config.Image}}' "$name" 2>/dev/null || true)"
    printf "  %d. %s  (%s, %s)\n" "$i" "$name" "$img" "$status"
    i=$((i + 1))
  done
  echo ""
  maxChoice="${#containers[@]}"
  promptRead -p "Choose [1-${maxChoice}]: " choice
  if [[ "$choice" =~ ^[0-9]+$ && choice -ge 1 && choice -le maxChoice ]]; then
    echo "${containers[$((choice - 1))]}"
    return 0
  fi
  echo "Invalid choice." >&2
  return 1
}

resolveContainer() {
  local picked=""
  if ! picked="$(pickIpaHarborContainer)"; then
    return 1
  fi
  if [[ -n "$picked" ]]; then
    echo "$picked"
    return
  fi

  local fromVolume
  fromVolume="$(docker ps -a --filter "volume=$DATA_VOLUME" --format '{{.Names}}' | grep -Ev '\-bak-[0-9]+$' | head -n1)"
  if [[ -n "$fromVolume" ]]; then
    echo "$fromVolume"
    return
  fi

  echo ""
}

readContainerConfig() {
  local name="$1"
  PORT_ARGS=()
  VOLUME_ARGS=()
  ENV_ARGS=()
  VISIT_URL=""
  HOSTNAME=""
  SHORT_ID=""
  NETWORK_MODE=""
  RESTART_POLICY=""
  OLD_IMAGE=""

  while IFS=' ' read -r hostPort containerPortRaw; do
    [[ -z "$hostPort" || -z "$containerPortRaw" ]] && continue
    local containerPort="${containerPortRaw%%/*}"
    PORT_ARGS+=("-p" "${hostPort}:${containerPort}")
    if [[ -z "$VISIT_URL" && "$containerPort" == "$CONTAINER_PORT" ]]; then
      VISIT_URL="$(visitUrlFromPorts "$hostPort")"
    fi
  done < <(
    docker inspect --format '{{range $p, $conf := .HostConfig.PortBindings}}{{if $conf}}{{(index $conf 0).HostPort}} {{$p}}{{"\n"}}{{end}}{{end}}' "$name"
  )

  if [[ -z "$VISIT_URL" && ${#PORT_ARGS[@]} -ge 2 ]]; then
    VISIT_URL="$(visitUrlFromPorts "${PORT_ARGS[1]%%:*}")"
  fi

  while IFS='|' read -r source dest; do
    [[ -z "$source" || -z "$dest" ]] && continue
    VOLUME_ARGS+=("-v" "${source}:${dest}")
  done < <(
    docker inspect --format '{{range .Mounts}}{{if .Name}}{{.Name}}{{else}}{{.Source}}{{end}}|{{.Destination}}{{"\n"}}{{end}}' "$name"
  )

  while IFS= read -r envLine || [[ -n "$envLine" ]]; do
    [[ -z "$envLine" ]] && continue
    ENV_ARGS+=("-e" "$envLine")
  done < <(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$name")

  HOSTNAME="$(docker inspect --format '{{.Config.Hostname}}' "$name")"
  SHORT_ID="$(docker inspect --format '{{.Id}}' "$name" | cut -c1-12)"
  NETWORK_MODE="$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$name")"
  RESTART_POLICY="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$name")"
  OLD_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$name")"
}

ensureAdminInitPin() {
  local i=0
  while [[ $i -lt ${#ENV_ARGS[@]} ]]; do
    if [[ "${ENV_ARGS[$i]}" == "-e" && "${ENV_ARGS[$i+1]}" == ADMIN_INIT_PIN=* ]]; then
      local existingPin="${ENV_ARGS[$i+1]#ADMIN_INIT_PIN=}"
      if [[ -n "$existingPin" ]]; then
        return 0
      fi
    fi
    i=$((i + 2))
  done

  ENV_ARGS+=("-e" "ADMIN_INIT_PIN=${ADMIN_INIT_PIN}")
  printf "Note: ADMIN_INIT_PIN was missing on the old container; adding %s for upgrade.\n" "$ADMIN_INIT_PIN"
  echo ""
}

upsertEnvArg() {
  local key="$1"
  local value="$2"
  local i=0
  while [[ $i -lt ${#ENV_ARGS[@]} ]]; do
    if [[ "${ENV_ARGS[$i]}" == "-e" && "${ENV_ARGS[$i+1]}" == "${key}="* ]]; then
      ENV_ARGS[$((i + 1))]="${key}=${value}"
      return 0
    fi
    i=$((i + 2))
  done
  ENV_ARGS+=("-e" "${key}=${value}")
}

ensureWebAuthnEnv() {
  local hostPort allowedOrigins
  hostPort="$(getPrimaryHostPortFromPortArgs)"
  allowedOrigins="$(visitUrlFromPorts "$hostPort")"
  upsertEnvArg "WEBAUTHN_RP_ID" "$WEBAUTHN_RP_ID"
  upsertEnvArg "WEBAUTHN_ALLOWED_ORIGINS" "$allowedOrigins"
}

getAdminInitPinFromEnvArgs() {
  local i=0 pin=""
  while [[ $i -lt ${#ENV_ARGS[@]} ]]; do
    if [[ "${ENV_ARGS[$i]}" == "-e" && "${ENV_ARGS[$i+1]}" == ADMIN_INIT_PIN=* ]]; then
      pin="${ENV_ARGS[$i+1]#ADMIN_INIT_PIN=}"
      if [[ -n "$pin" ]]; then
        echo "$pin"
        return 0
      fi
    fi
    i=$((i + 2))
  done
  echo "$ADMIN_INIT_PIN"
}

resolveUpgradeImage() {
  echo "$IMAGE"
}

pullUpgradeImage() {
  docker pull "$1"
}

runContainerFromConfig() {
  local name="$1"
  local image="$2"
  local pullAlways="${3:-false}"
  local -a runArgs
  runArgs=(docker run -d --name "$name")
  if [[ "$pullAlways" == "true" ]]; then
    runArgs+=(--pull always)
  fi
  [[ ${#PORT_ARGS[@]} -gt 0 ]] && runArgs+=("${PORT_ARGS[@]}")
  [[ ${#VOLUME_ARGS[@]} -gt 0 ]] && runArgs+=("${VOLUME_ARGS[@]}")
  [[ ${#ENV_ARGS[@]} -gt 0 ]] && runArgs+=("${ENV_ARGS[@]}")
  if [[ -n "$HOSTNAME" && "$HOSTNAME" != "$SHORT_ID" ]]; then
    runArgs+=(--hostname "$HOSTNAME")
  fi
  if [[ -n "$NETWORK_MODE" && "$NETWORK_MODE" != "default" && "$NETWORK_MODE" != "bridge" ]]; then
    runArgs+=(--network "$NETWORK_MODE")
  fi
  if [[ -n "$RESTART_POLICY" && "$RESTART_POLICY" != "no" ]]; then
    runArgs+=(--restart "$RESTART_POLICY")
  fi
  runArgs+=("$image")
  local runOutput=""
  if ! runOutput=$("${runArgs[@]}" 2>&1); then
    explainContainerStartFailure "$runOutput" "$(getPrimaryHostPortFromPortArgs)"
    return 1
  fi
  return 0
}

actionInstall() {
  requireDocker

  local existingContainer=""
  if ! existingContainer="$(pickIpaHarborContainer)"; then
    return 1
  fi

  if [[ -n "$existingContainer" ]]; then
    printf "Note: IPA-Harbor container already exists: %s\n" "$existingContainer"
    echo ""
    promptRead -p "Upgrade instead? (Y/n) " goUpgrade
    if [[ -z "$goUpgrade" ]] || isYes "$goUpgrade"; then
      actionUpgrade "$existingContainer"
      return
    fi
    echo "Cancelled. Uninstall first (option 3) to reinstall."
    return
  fi

  local installHostPort visitUrl
  if ! installHostPort="$(resolveInstallHostPort "$HOST_PORT" "$FALLBACK_HOST_PORT")"; then
    return 1
  fi
  visitUrl="$(visitUrlFromPorts "$installHostPort")"
  LAN_HTTPS_ENABLED=false

  local keychainPassphrase
  keychainPassphrase="$(generateKeychainPassphrase)"

  clearScreen
  echo ""
  printDivider
  echo "Install IPA-Harbor (local quick setup)"
  printDivider
  echo ""
  applyLanHttpsChoiceAfterPrompt "$installHostPort" || true

  clearScreen
  echo ""
  printDivider
  echo "Install IPA-Harbor (local quick setup)"
  printDivider
  echo ""
  printf "Image:       %s\n" "$IMAGE"
  echo ""
  printf "Container name: %s\n" "$CONTAINER_NAME"
  echo ""
  printf "Data volume:    %s\n" "$DATA_VOLUME"
  echo ""
  printf "Access URL:     %s\n" "$visitUrl"
  if [[ "$LAN_HTTPS_ENABLED" == "true" ]]; then
    echo ""
    printLanAccessUrls "$PICKED_LAN_IP" "$installHostPort" "$PICKED_LAN_HOSTNAME"
  fi
  echo ""
  printInitPinLine "Init PIN:    " "$ADMIN_INIT_PIN"
  echo ""
  echo ""

  promptRead -p "Press Enter to install, or Ctrl+C to cancel… " _

  clearScreen
  printInstallProgressHeader
  echo "[1/3] Pulling image…"
  docker pull "$IMAGE"

  echo "[2/3] Creating data volume and starting container…"
  docker volume create "$DATA_VOLUME" >/dev/null 2>&1 || true
  local -a runPorts=( -p "${installHostPort}:${CONTAINER_PORT}" )
  local -a runEnv=(
    -e "KEYCHAIN_PASSPHRASE=${keychainPassphrase}"
    -e "ADMIN_INIT_PIN=${ADMIN_INIT_PIN}"
    -e "PORT=${CONTAINER_PORT}"
  )
  if [[ "$LAN_HTTPS_ENABLED" == "true" ]]; then
    runPorts+=( -p "${HTTPS_HOST_PORT}:${CONTAINER_HTTPS_PORT}" )
    runEnv+=(
      -e "ENABLE_AUTO_CERT=true"
      -e "LAN_IP=${PICKED_LAN_IP}"
      -e "ALLOW_LAN_ACCESS=true"
      -e "HTTPS_PORT=${CONTAINER_HTTPS_PORT}"
      -e "WEBAUTHN_RP_ID=$(buildLanHttpsWebAuthnRpId "$PICKED_LAN_HOSTNAME")"
      -e "WEBAUTHN_ALLOWED_ORIGINS=$(buildLanHttpsWebAuthnOrigins "$PICKED_LAN_IP" "$PICKED_LAN_HOSTNAME" "$installHostPort" "$HTTPS_HOST_PORT")"
    )
    [[ -n "$PICKED_LAN_HOSTNAME" ]] && runEnv+=( -e "LAN_HOSTNAME=${PICKED_LAN_HOSTNAME}" )
  else
    runEnv+=(
      -e "WEBAUTHN_RP_ID=${WEBAUTHN_RP_ID}"
      -e "WEBAUTHN_ALLOWED_ORIGINS=${visitUrl}"
    )
  fi
  local runOutput=""
  if ! runOutput=$(docker run -d \
    "${runPorts[@]}" \
    "${runEnv[@]}" \
    -v "${DATA_VOLUME}:/app/data" \
    --name "$CONTAINER_NAME" \
    "$IMAGE" 2>&1); then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
    echo ""
    explainContainerStartFailure "$runOutput" "$installHostPort"
    return 1
  fi

  clearScreen
  printAppHeader
  printInstallCompleteTitle
  printf "Open: %s\n" "$visitUrl"
  echo ""
  printInitPinLine "Init PIN: " "$ADMIN_INIT_PIN"
  echo ""
  maybeOpenBrowser "$visitUrl"
}

actionUpgrade() {
  requireDocker

  local targetContainer="${1:-}"
  if [[ -z "$targetContainer" ]]; then
    if ! targetContainer="$(resolveContainer)"; then
      return 1
    fi
  fi
  if [[ -z "$targetContainer" ]]; then
    echo "Error: No container found to upgrade."
    echo "   Choose install (1) first, or check for a uuphy/ipa-harbor container."
    return 1
  fi

  readContainerConfig "$targetContainer"
  ensureAdminInitPin
  local lanHttpsJustAdded=false
  local httpHostPort=""
  httpHostPort="$(getPrimaryHostPortFromPortArgs)"

  local upgradeImage
  upgradeImage="$(resolveUpgradeImage)"

  if ! containerHasLanHttpsEnv; then
    clearScreen
    echo ""
    printDivider
    echo "Upgrade IPA-Harbor"
    printDivider
    echo ""
    if applyLanHttpsChoiceAfterPrompt "$httpHostPort" "$targetContainer"; then
      applyLanHttpsEnvToArgs "$PICKED_LAN_IP" "$PICKED_LAN_HOSTNAME" "$httpHostPort" "$HTTPS_HOST_PORT"
      lanHttpsJustAdded=true
    else
      ensureWebAuthnEnv
    fi
  fi

  clearScreen
  echo ""
  printDivider
  echo "Upgrade IPA-Harbor"
  printDivider
  echo ""
  printf "Container:     %s\n" "$targetContainer"
  echo ""
  printf "Current image: %s\n" "$OLD_IMAGE"
  echo ""
  printf "New image:     %s\n" "$upgradeImage"
  echo ""
  [[ -n "$VISIT_URL" ]] && printf "Access URL:    %s\n" "$VISIT_URL"
  if [[ "$lanHttpsJustAdded" == "true" ]]; then
    echo ""
    printLanAccessUrls "$PICKED_LAN_IP" "$httpHostPort" "$PICKED_LAN_HOSTNAME"
  fi
  echo ""
  echo "Downloaded IPAs and settings are stored in the data volume; upgrade will not erase them."
  echo ""

  promptRead -p "Press Enter to upgrade, or Ctrl+C to cancel… " _

  clearScreen
  printUpgradeProgressHeader
  echo "[1/4] Pulling latest image from registry…"
  pullUpgradeImage "$upgradeImage"

  local backupName="${targetContainer}-bak-$(date +%Y%m%d%H%M%S)"

  echo "[2/4] Stopping old container…"
  if [[ "$(docker inspect --format '{{.State.Running}}' "$targetContainer")" == "true" ]]; then
    docker stop "$targetContainer" >/dev/null
  fi
  docker rename "$targetContainer" "$backupName"

  echo "[3/4] Starting new container…"
  if ! runContainerFromConfig "$targetContainer" "$upgradeImage" "true"; then
    echo ""
    echo "Rolling back to pre-upgrade state…"
    docker rm -f "$targetContainer" >/dev/null 2>&1 || true
    docker rename "$backupName" "$targetContainer" >/dev/null 2>&1 || true
    docker start "$targetContainer" >/dev/null 2>&1 || true
    printf "Rolled back (container: %s).\n" "$targetContainer"
    echo ""
    return 1
  fi

  echo "[4/4] Done."

  if [[ "$(docker inspect --format '{{.State.Running}}' "$targetContainer")" == "true" ]]; then
    docker rm -f "$backupName" >/dev/null
  else
    printf "Note: New container is not running; backup kept for rollback: %s\n" "$backupName"
    echo ""
    printf "    Rollback: docker rm -f %s && docker rename %s %s && docker start %s\n" "$targetContainer" "$backupName" "$targetContainer" "$targetContainer"
    echo ""
    return 1
  fi

  clearScreen
  printAppHeader
  printUpgradeCompleteTitle
  if [[ -n "$VISIT_URL" ]]; then
    local initPin
    initPin="$(getAdminInitPinFromEnvArgs)"
    printf "Please visit: %s\n" "$VISIT_URL"
    echo ""
    printInitPinLine "Init PIN: " "$initPin"
    echo ""
    if [[ "$lanHttpsJustAdded" == "true" ]]; then
      printLanHttpsAccessHints "$targetContainer" "$(getEnvArgValue LAN_IP)" "$(getEnvArgValue LAN_HOSTNAME)" "$(getPrimaryHostPortFromPortArgs)"
    fi
    maybeOpenBrowser "$VISIT_URL"
  fi
}

actionUninstall() {
  requireDocker

  local targetContainer=""
  if ! targetContainer="$(resolveContainer)"; then
    return 1
  fi
  local hasContainer=false
  local hasVolume=false
  local hasImages=false
  local ipaHarborImages=""

  if [[ -n "$targetContainer" ]]; then
    hasContainer=true
  elif containerExists "$CONTAINER_NAME"; then
    local containerImg=""
    containerImg="$(docker inspect --format '{{.Config.Image}}' "$CONTAINER_NAME" 2>/dev/null || true)"
    if isIpaHarborImage "$containerImg"; then
      hasContainer=true
      targetContainer="$CONTAINER_NAME"
    fi
  fi
  if docker volume inspect "${DATA_VOLUME}" >/dev/null 2>&1; then
    hasVolume=true
  fi
  ipaHarborImages="$(listIpaHarborImages)"
  if [[ -n "$ipaHarborImages" ]]; then
    hasImages=true
  fi

  if [[ "$hasContainer" == "false" && "$hasVolume" == "false" && "$hasImages" == "false" ]]; then
    echo "No IPA-Harbor container, data volume, or image found; nothing to uninstall."
    return
  fi

  clearScreen
  echo ""
  printDivider
  echo "Uninstall IPA-Harbor"
  printDivider

  if [[ "$hasContainer" == "true" ]]; then
    [[ -z "$targetContainer" ]] && targetContainer="$CONTAINER_NAME"
    printf "Will remove container: %s\n" "$targetContainer"
    echo ""
    local backupContainers
    backupContainers="$(docker ps -a --format '{{.Names}}' | grep -E "^${CONTAINER_NAME}-bak-|^${targetContainer}-bak-" || true)"
    if [[ -n "$backupContainers" ]]; then
      echo "Will also remove backup containers:"
      echo "$backupContainers" | sed 's/^/  - /'
    fi
  fi

  if [[ "$hasVolume" == "true" ]]; then
    echo ""
    printf "Data volume %s contains:\n" "$DATA_VOLUME"
    echo ""
    echo "  - Downloaded IPA files"
    echo "  - Admin accounts, Apple ID bindings, and other user data"
  fi

  if [[ "$hasImages" == "true" ]]; then
    echo ""
    echo "Local IPA-Harbor Docker images:"
    echo "$ipaHarborImages" | sed 's/^/  - /'
  fi

  echo ""
  promptRead -p "Confirm uninstall? (Y/n) " confirmUninstall
  if [[ -n "$confirmUninstall" ]] && ! isYes "$confirmUninstall"; then
    echo "Cancelled."
    return
  fi

  local keepData=true
  local uninstallSummary=()
  if [[ "$hasVolume" == "true" ]]; then
    echo ""
    promptRead -p "$(printf "Keep downloaded IPAs and user data (volume %s)? (Y/n) " "$DATA_VOLUME")" keepDataAnswer
    if [[ "$keepDataAnswer" == "n" || "$keepDataAnswer" == "N" ]]; then
      keepData=false
    fi
  fi

  local deleteImages=false
  if [[ "$hasImages" == "true" ]]; then
    echo ""
    promptRead -p "Delete local IPA-Harbor Docker images? (y/N) " deleteImagesAnswer
    if isYes "$deleteImagesAnswer"; then
      deleteImages=true
    fi
  fi

  if [[ "$hasContainer" == "true" ]]; then
    if [[ -n "$targetContainer" ]]; then
      docker rm -f "$targetContainer" >/dev/null 2>&1 || true
    fi
    if containerExists "$CONTAINER_NAME"; then
      docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
    fi

    while IFS= read -r bakName; do
      [[ -z "$bakName" ]] && continue
      docker rm -f "$bakName" >/dev/null 2>&1 || true
    done < <(docker ps -a --format '{{.Names}}' | grep -E "^${CONTAINER_NAME}-bak-|^${targetContainer}-bak-" || true)

    uninstallSummary+=("Container removed.")
  fi

  if [[ "$hasVolume" == "true" ]]; then
    if [[ "$keepData" == "true" ]]; then
      uninstallSummary+=("Data volume ${DATA_VOLUME} kept; it will be reused on next install.")
    else
      docker volume rm "${DATA_VOLUME}" >/dev/null 2>&1 || true
      uninstallSummary+=("Data volume ${DATA_VOLUME} removed.")
    fi
  fi

  if [[ "$deleteImages" == "true" ]]; then
    local img removed=0
    while IFS= read -r img; do
      [[ -z "$img" ]] && continue
      if docker rmi "$img" >/dev/null 2>&1; then
        removed=$((removed + 1))
      fi
    done <<< "$ipaHarborImages"
    if [[ $removed -gt 0 ]]; then
      uninstallSummary+=("Removed ${removed} IPA-Harbor image(s).")
    else
      uninstallSummary+=("Note: Could not remove images (they may still be in use by another container).")
    fi
  elif [[ "$hasImages" == "true" ]]; then
    uninstallSummary+=("IPA-Harbor images kept for reuse on next install.")
  fi

  clearScreen
  printAppHeader
  printUninstallCompleteTitle
  local line
  for line in "${uninstallSummary[@]}"; do
    printf '%s\n' "$line"
  done
}

switchLanguage() {
  local targetName targetRemote scriptDir localScript
  if [[ "$MENU_LOCALE" == "zh" ]]; then
    echo "Switching to English…"
    echo ""
    targetName="$SCRIPT_NAME_EN"
    targetRemote="$REMOTE_SCRIPT_EN"
  else
    echo "Switching to 简体中文…"
    echo ""
    targetName="$SCRIPT_NAME_ZH"
    targetRemote="$REMOTE_SCRIPT_ZH"
  fi

  if [[ -n "$QUICK_DEPLOY_SELF" ]]; then
    scriptDir="$(dirname "$QUICK_DEPLOY_SELF")"
    localScript="${scriptDir}/${targetName}"
    if [[ -f "$localScript" ]]; then
      exec bash "$localScript"
    fi
    if [[ -f "${scriptDir}/lib/lan-network.sh" && -f "${scriptDir}/lib/print-qr.sh" ]]; then
      if curl -fsSL "$targetRemote" -o "$localScript"; then
        exec bash "$localScript"
      fi
    fi
  fi

  bootstrapQuickDeployFromRemote "$targetRemote"
}

showAbout() {
  clearScreen
  printAppHeader
  echo "About"
  echo ""
  echo "GitHub source / Feedback:"
  printf "  %s\n" "$GITHUB_REPO_URL"
  echo ""
  echo "Official Docker Hub:"
  printf "  %s\n" "$DOCKER_HUB_URL"
  echo ""
  echo "My other projects:"
  printf "  %s\n" "$AUTHOR_PROJECTS_URL"
  echo ""
  pause
}

showMenu() {
  clearScreen
  printAppHeader
  echo "  1. Install"
  echo "  2. Upgrade (keep data)"
  echo "  3. Uninstall"
  echo "  4. 简体中文"
  echo "  5. About"
  echo "  0. Exit"
  echo ""
}

usage() {
  cat <<'EOF'
Usage:
  bash quick-deploy.sh              interactive menu
  bash quick-deploy.sh install      install directly
  bash quick-deploy.sh upgrade      upgrade directly
  bash quick-deploy.sh uninstall    uninstall directly
  bash quick-deploy.sh https        configure or repair HTTPS access

One-liner (recommended):
  curl -fsSL https://raw.githubusercontent.com/ij369/ipa-harbor/main/quick-deploy.sh | bash
  curl -fsSL https://raw.githubusercontent.com/ij369/ipa-harbor/main/scripts/quick-deploy.zh.sh | bash
  curl -fsSL https://raw.githubusercontent.com/ij369/ipa-harbor/main/scripts/quick-deploy.sh | bash
EOF
}

mainMenu() {
  requireDocker
  while true; do
    showMenu
    promptRead -p "Choose [0-5]: " choice || exit 1
    case "$choice" in
      1)
        actionInstall || true
        pauseAfterAction
        ;;
      2)
        actionUpgrade || true
        pauseAfterAction
        ;;
      3)
        actionUninstall || true
        pause
        ;;
      4)
        switchLanguage
        ;;
      5)
        showAbout
        ;;
      0)
        echo "Goodbye."
        exit 0
        ;;
      *)
        echo "Invalid choice; enter 0-5."
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
  https | https-access)
    actionLanHttpsAccess
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
