#!/usr/bin/env bash
set -euo pipefail

readonly CONTAINER_NAME="${CONTAINER_NAME:-ipa-harbor}"
readonly DATA_VOLUME="${DATA_VOLUME:-ipa_data}"
readonly IMAGE="${IMAGE:-uuphy/ipa-harbor:latest}"
readonly HOST_PORT="${HOST_PORT:-3388}"
readonly FALLBACK_HOST_PORT="${FALLBACK_HOST_PORT:-3399}"
readonly CONTAINER_PORT="${CONTAINER_PORT:-3080}"
readonly ADMIN_INIT_PIN="${ADMIN_INIT_PIN:-20251024}"
readonly WEBAUTHN_RP_ID="localhost"

BROWSER_OPEN_CANCELLED=0

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

pause() {
  if isInteractiveTerminal; then
    promptRead -p "按回车继续… " _ || true
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

printAppHeader() {
  echo ""
  printDivider
  echo "IPA-Harbor 本地 Docker 管理"
  printDivider
  echo ""
}

printInstallProgressHeader() {
  echo ""
  printDivider
  echo "IPA-Harbor 安装中"
  printDivider
  echo ""
}

printUpgradeProgressHeader() {
  echo ""
  printDivider
  echo "IPA-Harbor 升级中"
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
    printf '%b %s\n' $'\033[1;32m✓\033[0m' "安装完成"
  else
    echo "✓ 安装完成"
  fi
}

printUpgradeCompleteTitle() {
  if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    printf '%b %s\n' $'\033[1;32m✓\033[0m' "升级完成"
  else
    echo "✓ 升级完成"
  fi
}

printUninstallCompleteTitle() {
  if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    printf '%b %s\n' $'\033[1;32m✓\033[0m' "卸载完成"
  else
    echo "✓ 卸载完成"
  fi
}

printDockerNotInstalledHint() {
  echo "Docker 未安装。"
  echo ""
  echo "请安装以下之一："
  echo "  • OrbStack"
  echo "    https://orbstack.dev/download"
  echo "  • Docker Desktop"
  echo "    https://www.docker.com/products/docker-desktop/"
  echo ""
}

printDockerNotRunningHint() {
  echo "Docker 未运行。"
  echo ""
  echo "请先启动 Docker Desktop 或 OrbStack，然后继续。"
  echo ""
}

requireDocker() {
  while ! command -v docker >/dev/null 2>&1; do
    printDockerNotInstalledHint
    if ! isInteractiveTerminal; then
      echo "错误: 需要交互式终端。" >&2
      exit 1
    fi
    promptAnyKey "按任意键继续… " || exit 1
    echo ""
  done
  while ! docker info >/dev/null 2>&1; do
    printDockerNotRunningHint
    if ! isInteractiveTerminal; then
      echo "错误: 需要交互式终端。" >&2
      exit 1
    fi
    promptAnyKey "按任意键继续… " || exit 1
    echo ""
  done
}

isYes() {
  [[ "${1:-}" == "y" || "${1:-}" == "Y" || "${1:-}" == "yes" || "${1:-}" == "YES" ]]
}

isInteractiveTerminal() {
  [[ -t 0 ]] && return 0
  ( : < /dev/tty ) 2>/dev/null
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

  echo "正在等待服务响应…"
  while [[ $i -lt attempts ]]; do
    if curl -sS --max-time 2 -o /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done

  echo "提示: 服务尚未就绪，仍将尝试打开浏览器。"
  return 1
}

openBrowserUrl() {
  local url="$1"

  if [[ "$(uname -s)" != "Darwin" ]]; then
    printf "请手动打开: %s\n" "$url"
    return 1
  fi

  waitForServiceUrl "$url" || true

  if [[ -x /usr/bin/open ]]; then
    if /usr/bin/open "$url"; then
      printf "已在默认浏览器中打开: %s\n" "$url"
      echo ""
      return 0
    fi
  elif command -v open >/dev/null 2>&1; then
    if open "$url"; then
      printf "已在默认浏览器中打开: %s\n" "$url"
      echo ""
      return 0
    fi
  fi

  echo "无法自动打开浏览器，请手动访问:"
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
    printf "错误: 端口 %s 已被占用，容器无法绑定。\n" "$hostPort"
    echo "   请关闭占用该端口的程序后重试。"
  else
    echo "错误: 容器启动失败。"
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

  printf "5 秒后将自动打开浏览器，按 N 取消。" >/dev/tty
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
    printf "错误: 端口 %s 已被占用，无法安装。\n" "$preferred" >&2
    return 1
  fi

  if ! isHostPortInUse "$fallback"; then
    echo "$fallback"
    return 0
  fi

  printf "错误: 端口 %s 与 %s 均已被占用，无法安装。\n" "$preferred" "$fallback" >&2
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
  echo "发现多个 IPA-Harbor 容器:"
  i=1
  for name in "${containers[@]}"; do
    status="已停止"
    [[ "$(docker inspect --format '{{.State.Running}}' "$name" 2>/dev/null || true)" == "true" ]] && status="运行中"
    img="$(docker inspect --format '{{.Config.Image}}' "$name" 2>/dev/null || true)"
    printf "  %d. %s  (%s, %s)\n" "$i" "$name" "$img" "$status"
    i=$((i + 1))
  done
  echo ""
  maxChoice="${#containers[@]}"
  promptRead -p "请选择容器 [1-${maxChoice}]: " choice
  if [[ "$choice" =~ ^[0-9]+$ ]] && choice -ge 1 && choice -le maxChoice; then
    echo "${containers[$((choice - 1))]}"
    return 0
  fi
  echo "无效选项。" >&2
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
  printf "提示: 旧容器未设置 ADMIN_INIT_PIN，升级时将自动补上: %s\n" "$ADMIN_INIT_PIN"
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
    printf "注意: 已存在 IPA-Harbor 容器: %s\n" "$existingContainer"
    echo ""
    promptRead -p "是否改为执行升级？(Y/n) " goUpgrade
    if [[ -z "$goUpgrade" ]] || isYes "$goUpgrade"; then
      actionUpgrade "$existingContainer"
      return
    fi
    echo "已取消。如需重装请先卸载（选项 3）。"
    return
  fi

  local installHostPort visitUrl
  if ! installHostPort="$(resolveInstallHostPort "$HOST_PORT" "$FALLBACK_HOST_PORT")"; then
    return 1
  fi
  visitUrl="$(visitUrlFromPorts "$installHostPort")"

  local keychainPassphrase
  keychainPassphrase="$(generateKeychainPassphrase)"

  clearScreen
  echo ""
  printDivider
  echo "即将安装 IPA-Harbor（本机快速部署）"
  printDivider
  printf "镜像:       %s\n" "$IMAGE"
  echo ""
  printf "容器名:     %s\n" "$CONTAINER_NAME"
  echo ""
  printf "数据卷:     %s\n" "$DATA_VOLUME"
  echo ""
  printf "访问地址:   %s\n" "$visitUrl"
  echo ""
  printInitPinLine "初始化 PIN: " "$ADMIN_INIT_PIN"
  echo ""
  echo ""

  promptRead -p "按回车开始安装，或 Ctrl+C 取消… " _

  clearScreen
  printInstallProgressHeader
  echo "[1/3] 拉取镜像…"
  docker pull "$IMAGE"

  echo "[2/3] 创建数据卷并启动容器…"
  docker volume create "$DATA_VOLUME" >/dev/null 2>&1 || true
  local runOutput=""
  if ! runOutput=$(docker run -d \
    -p "${installHostPort}:${CONTAINER_PORT}" \
    -e "KEYCHAIN_PASSPHRASE=${keychainPassphrase}" \
    -e "ADMIN_INIT_PIN=${ADMIN_INIT_PIN}" \
    -e "WEBAUTHN_RP_ID=${WEBAUTHN_RP_ID}" \
    -e "WEBAUTHN_ALLOWED_ORIGINS=${visitUrl}" \
    -e "PORT=${CONTAINER_PORT}" \
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
  printf "打开: %s\n" "$visitUrl"
  echo ""
  printInitPinLine "初始化 PIN: " "$ADMIN_INIT_PIN"
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
    echo "错误: 未找到可升级的容器。"
    echo "   请先选择「1. 安装」，或确认本机是否有 uuphy/ipa-harbor 镜像的容器。"
    return 1
  fi

  readContainerConfig "$targetContainer"
  ensureAdminInitPin
  ensureWebAuthnEnv

  local upgradeImage
  upgradeImage="$(resolveUpgradeImage)"

  clearScreen
  echo ""
  printDivider
  echo "IPA-Harbor 升级"
  printDivider
  printf "容器:     %s\n" "$targetContainer"
  echo ""
  printf "当前镜像: %s\n" "$OLD_IMAGE"
  echo ""
  printf "新镜像:   %s\n" "$upgradeImage"
  echo ""
  [[ -n "$VISIT_URL" ]] && printf "访问地址:   %s\n" "$VISIT_URL" && echo ""
  echo ""
  echo "已下载的 IPA 与配置保存在数据卷中，升级不会清空。"
  echo ""

  promptRead -p "按回车开始升级，或 Ctrl+C 取消… " _

  clearScreen
  printUpgradeProgressHeader
  echo "[1/4] 从 registry 拉取最新 latest 镜像…"
  pullUpgradeImage "$upgradeImage"

  local backupName="${targetContainer}-bak-$(date +%Y%m%d%H%M%S)"

  echo "[2/4] 停止旧容器…"
  if [[ "$(docker inspect --format '{{.State.Running}}' "$targetContainer")" == "true" ]]; then
    docker stop "$targetContainer" >/dev/null
  fi
  docker rename "$targetContainer" "$backupName"

  echo "[3/4] 启动新容器…"
  if ! runContainerFromConfig "$targetContainer" "$upgradeImage" "true"; then
    echo ""
    echo "正在回滚至升级前状态…"
    docker rm -f "$targetContainer" >/dev/null 2>&1 || true
    docker rename "$backupName" "$targetContainer" >/dev/null 2>&1 || true
    docker start "$targetContainer" >/dev/null 2>&1 || true
    printf "已回滚（容器: %s）。\n" "$targetContainer"
    echo ""
    return 1
  fi

  echo "[4/4] 完成。"

  if [[ "$(docker inspect --format '{{.State.Running}}' "$targetContainer")" == "true" ]]; then
    docker rm -f "$backupName" >/dev/null
  else
    printf "注意: 新容器未正常运行，已保留备份以便回滚: %s\n" "$backupName"
    echo ""
    printf "    回滚: docker rm -f %s && docker rename %s %s && docker start %s\n" "$targetContainer" "$backupName" "$targetContainer" "$targetContainer"
    echo ""
    return 1
  fi

  clearScreen
  printAppHeader
  printUpgradeCompleteTitle
  if [[ -n "$VISIT_URL" ]]; then
    local initPin
    initPin="$(getAdminInitPinFromEnvArgs)"
    printf "请访问: %s\n" "$VISIT_URL"
    echo ""
    printInitPinLine "初始化 PIN: " "$initPin"
    echo ""
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
    echo "未找到 IPA-Harbor 容器、数据卷或镜像，无需卸载。"
    return
  fi

  clearScreen
  echo ""
  printDivider
  echo "IPA-Harbor 卸载"
  printDivider

  if [[ "$hasContainer" == "true" ]]; then
    [[ -z "$targetContainer" ]] && targetContainer="$CONTAINER_NAME"
    printf "将删除容器: %s\n" "$targetContainer"
    echo ""
    local backupContainers
    backupContainers="$(docker ps -a --format '{{.Names}}' | grep -E "^${CONTAINER_NAME}-bak-|^${targetContainer}-bak-" || true)"
    if [[ -n "$backupContainers" ]]; then
      echo "同时删除备份容器:"
      echo "$backupContainers" | sed 's/^/  - /'
    fi
  fi

  if [[ "$hasVolume" == "true" ]]; then
    echo ""
    printf "数据卷 %s 内存有:\n" "$DATA_VOLUME"
    echo ""
    echo "  - 已下载的 IPA 文件"
    echo "  - 管理员账户、Apple ID 绑定等用户数据"
  fi

  if [[ "$hasImages" == "true" ]]; then
    echo ""
    echo "本机 IPA-Harbor Docker 镜像:"
    echo "$ipaHarborImages" | sed 's/^/  - /'
  fi

  echo ""
  promptRead -p "确认卸载？(Y/n) " confirmUninstall
  if [[ -n "$confirmUninstall" ]] && ! isYes "$confirmUninstall"; then
    echo "已取消。"
    return
  fi

  local keepData=true
  local uninstallSummary=()
  if [[ "$hasVolume" == "true" ]]; then
    echo ""
    promptRead -p "$(printf "是否保留已下载的 IPA 与用户数据（数据卷 %s）？(Y/n) " "$DATA_VOLUME")" keepDataAnswer
    if [[ "$keepDataAnswer" == "n" || "$keepDataAnswer" == "N" ]]; then
      keepData=false
    fi
  fi

  local deleteImages=false
  if [[ "$hasImages" == "true" ]]; then
    echo ""
    promptRead -p "是否删除本机 IPA-Harbor Docker 镜像？(y/N) " deleteImagesAnswer
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

    uninstallSummary+=("容器已删除。")
  fi

  if [[ "$hasVolume" == "true" ]]; then
    if [[ "$keepData" == "true" ]]; then
      uninstallSummary+=("数据卷 ${DATA_VOLUME} 已保留，下次安装时会自动复用。")
    else
      docker volume rm "${DATA_VOLUME}" >/dev/null 2>&1 || true
      uninstallSummary+=("数据卷 ${DATA_VOLUME} 已删除。")
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
      uninstallSummary+=("已删除 ${removed} 个 IPA-Harbor 镜像。")
    else
      uninstallSummary+=("注意: 未能删除镜像（可能仍被其他容器占用）。")
    fi
  elif [[ "$hasImages" == "true" ]]; then
    uninstallSummary+=("IPA-Harbor 镜像已保留，下次安装可复用。")
  fi

  clearScreen
  printAppHeader
  printUninstallCompleteTitle
  local line
  for line in "${uninstallSummary[@]}"; do
    printf '%s\n' "$line"
  done
}

showMenu() {
  clearScreen
  printAppHeader
  echo "  1. 安装"
  echo "  2. 升级（保留数据）"
  echo "  3. 卸载"
  echo "  0. 退出"
  echo ""
}

usage() {
  cat <<EOF
用法:
  bash quick-deploy.zh.sh              交互菜单
  bash quick-deploy.zh.sh install      直接安装
  bash quick-deploy.zh.sh upgrade      直接升级
  bash quick-deploy.zh.sh uninstall    直接卸载

一键执行命令（推荐）:
  curl -fsSL https://raw.githubusercontent.com/ij369/ipa-harbor/main/scripts/quick-deploy.zh.sh | bash
EOF
}

mainMenu() {
  requireDocker
  while true; do
    showMenu
    promptRead -p "请选择 [0-3]: " choice || exit 1
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
      0)
        echo "再见。"
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
