#!/usr/bin/env bash

# docker exec 调用容器内 Node CLI，QR 逻辑在后端、持久化到 data 卷

buildLanCaInstallPageUrl() {
  local lanIp="$1"
  local httpPort="$2"
  if [[ "$httpPort" == "80" ]]; then
    printf 'http://%s/lan-ca' "$lanIp"
  else
    printf 'http://%s:%s/lan-ca' "$lanIp" "$httpPort"
  fi
}

printTerminalQrCode() {
  local containerName="${1:-}"
  local lanIp="${2:-}"
  local lanHostname="${3:-}"
  local httpPort="${4:-}"
  local attempt=0
  local maxAttempts=3
  local output=""
  local installUrl=""
  local -a execArgs=(node /app/utils/lanCaTerminalQr.js --lan-ip "$lanIp" --http-port "$httpPort")

  [[ -z "$containerName" || -z "$lanIp" || -z "$httpPort" ]] && return 1

  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi

  if [[ -n "$lanHostname" ]]; then
    execArgs+=(--lan-hostname "$lanHostname")
  fi

  installUrl="$(buildLanCaInstallPageUrl "$lanIp" "$httpPort")"

  while [[ $attempt -lt $maxAttempts ]]; do
    output="$(docker exec "$containerName" "${execArgs[@]}" 2>/dev/null || true)"
    if [[ -n "$output" ]]; then
      printf 'URL: %s\n\n' "$installUrl"
      printf '%s\n' "$output" | sed '/^URL: /d'
      return 0
    fi
    attempt=$((attempt + 1))
    [[ $attempt -lt $maxAttempts ]] && sleep 2
  done

  return 1
}
