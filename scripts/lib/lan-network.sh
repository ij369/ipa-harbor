#!/usr/bin/env bash
# 局域网网卡探测与选择

isDarwin() {
  [[ "$(uname -s)" == "Darwin" ]]
}

isLinuxOs() {
  [[ "$(uname -s)" == "Linux" ]]
}

isWindowsOs() {
  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*) return 0 ;;
  esac
  return 1
}

# 过滤常见虚拟/隧道网卡
isVirtualInterface() {
  local iface="${1:-}"
  [[ -z "$iface" ]] && return 0

  case "$iface" in
    lo | lo0 | docker* | br-* | veth* | virbr* | vmnet* | vboxnet* | utun* | awdl* | llw* | gif* | stf* | bridge* | anpi* | nan*)
      return 0
      ;;
  esac

  if [[ "$iface" == tun* || "$iface" == tap* ]]; then
    return 0
  fi

  return 1
}

# Wi-Fi=1 有线=2 其他=3（数字越小优先级越高）
interfaceKindRank() {
  case "${1:-other}" in
    wifi) echo 1 ;;
    ethernet) echo 2 ;;
    *) echo 3 ;;
  esac
}

isPrivateIpv4() {
  local ip="${1:-}"
  [[ "$ip" =~ ^10\. ]] && return 0
  [[ "$ip" =~ ^192\.168\. ]] && return 0
  [[ "$ip" =~ ^172\.(1[6-9]|2[0-9]|3[0-1])\. ]] && return 0
  return 1
}

# macOS：根据 Hardware Port 判断类型（不依赖 default route，避免 VPN 虚拟网卡）
darwinHardwarePortKind() {
  local hwPort="${1:-}"
  case "$hwPort" in
    Wi-Fi*) echo "wifi" ;;
    Ethernet* | *LAN*) echo "ethernet" ;;
    Thunderbolt* | *Bridge*) echo "" ;;
    *) echo "other" ;;
  esac
}

collectDarwinNetworkCandidates() {
  local hwPort="" device="" kind="" ip="" label=""

  if ! command -v networksetup >/dev/null 2>&1; then
    return 1
  fi

  while IFS= read -r line; do
    if [[ "$line" =~ ^Hardware\ Port:\ (.*) ]]; then
      hwPort="${BASH_REMATCH[1]}"
      kind="$(darwinHardwarePortKind "$hwPort")"
    elif [[ "$line" =~ ^Device:\ (.+) ]]; then
      device="${BASH_REMATCH[1]}"
      [[ -z "$kind" ]] && continue
      isVirtualInterface "$device" && continue
      ip="$(ipconfig getifaddr "$device" 2>/dev/null || true)"
      [[ -z "$ip" ]] && continue
      isPrivateIpv4 "$ip" || continue
      label="${hwPort} (${device})"
      printf '%s|%s|%s|%s\n' "$kind" "$device" "$ip" "$label"
    fi
  done < <(networksetup -listallhardwareports 2>/dev/null)
}

collectLinuxNetworkCandidates() {
  if command -v nmcli >/dev/null 2>&1; then
    local line device type state ip kind label
    while IFS=: read -r device type state ip; do
      [[ -z "$device" ]] && continue
      isVirtualInterface "$device" && continue
      [[ "$state" != "connected" && "$state" != "connected (externally)" && "$state" != "connected (local)" ]] && continue
      ip="${ip%%,*}"
      ip="${ip%%/*}"
      [[ -z "$ip" ]] && continue
      isPrivateIpv4 "$ip" || continue
      case "$type" in
        wifi) kind="wifi" ;;
        ethernet | *ethernet*) kind="ethernet" ;;
        *) kind="other" ;;
      esac
      label="${device} (${type}, ${state})"
      printf '%s|%s|%s|%s\n' "$kind" "$device" "$ip" "$label"
    done < <(nmcli -t -f DEVICE,TYPE,STATE,IP4.ADDRESS device status 2>/dev/null | grep -v '^$')
    return 0
  fi

  local line iface ip kind
  while read -r iface ip _rest; do
    [[ -z "$iface" || -z "$ip" ]] && continue
    isVirtualInterface "$iface" && continue
    isPrivateIpv4 "$ip" || continue
    case "$iface" in
      wl* | wlan*) kind="wifi" ;;
      en* | eth*) kind="ethernet" ;;
      *) kind="other" ;;
    esac
    printf '%s|%s|%s|%s\n' "$kind" "$iface" "$ip" "$iface"
  done < <(ip -o -4 addr show scope global 2>/dev/null | awk '{print $2, $4}' | sed 's#/.*##')
}

collectWindowsNetworkCandidates() {
  if ! command -v powershell.exe >/dev/null 2>&1; then
    return 1
  fi

  local psOutput
  psOutput="$(powershell.exe -NoProfile -Command '
$ErrorActionPreference = "SilentlyContinue"
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "169.254.*" -and
    $_.PrefixOrigin -ne "WellKnown"
  } |
  ForEach-Object {
    $alias = $_.InterfaceAlias
    $ip = $_.IPAddress
    $kind = "other"
    if ($alias -match "Wi-?Fi|Wireless|WLAN") { $kind = "wifi" }
    elseif ($alias -match "Ethernet|LAN|以太网") { $kind = "ethernet" }
    "$kind|$alias|$ip|$alias"
  }
' 2>/dev/null | tr -d '\r')"

  [[ -n "$psOutput" ]] && printf '%s\n' "$psOutput"
}

collectNetworkCandidates() {
  if isDarwin; then
    collectDarwinNetworkCandidates
    return $?
  fi
  if isLinuxOs; then
    collectLinuxNetworkCandidates
    return $?
  fi
  if isWindowsOs; then
    collectWindowsNetworkCandidates
    return $?
  fi
  return 1
}

sortNetworkCandidates() {
  local -a rows=()
  local kind iface ip label rank
  while IFS='|' read -r kind iface ip label; do
    [[ -z "$kind" || -z "$ip" ]] && continue
    rank="$(interfaceKindRank "$kind")"
    rows+=("${rank}|${kind}|${iface}|${ip}|${label}")
  done

  if [[ ${#rows[@]} -eq 0 ]]; then
    return 1
  fi

  printf '%s\n' "${rows[@]}" | sort -t'|' -k1,1n -k5,5
}

dedupeNetworkCandidates() {
  local -a seen=()
  local rank kind iface ip label key
  while IFS='|' read -r rank kind iface ip label; do
    key="${ip}|${iface}"
    local duplicate=false
    local item
    for item in "${seen[@]+"${seen[@]}"}"; do
      if [[ "$item" == "$key" ]]; then
        duplicate=true
        break
      fi
    done
    $duplicate && continue
    seen+=("$key")
    printf '%s|%s|%s|%s|%s\n' "$rank" "$kind" "$iface" "$ip" "$label"
  done
}

lanNetworkKindLabel() {
  case "${1:-other}" in
    wifi)
      [[ "${MENU_LOCALE:-en}" == "zh" ]] && echo "Wi-Fi" || echo "Wi-Fi"
      ;;
    ethernet)
      [[ "${MENU_LOCALE:-en}" == "zh" ]] && echo "有线" || echo "Ethernet"
      ;;
    *)
      [[ "${MENU_LOCALE:-en}" == "zh" ]] && echo "其他" || echo "Other"
      ;;
  esac
}

# macOS 本机 ping *.local 常先解析到 127.0.0.1，不能据此判定 Bonjour 不可用
macOsHostnameMapsToLanIp() {
  local hostname="$1"
  local lanIp="$2"
  local ip

  [[ -z "$hostname" || -z "$lanIp" ]] && return 1
  command -v dscacheutil >/dev/null 2>&1 || return 1

  while IFS= read -r ip; do
    [[ "$ip" == "$lanIp" ]] && return 0
  done < <(dscacheutil -q host -a name "$hostname" 2>/dev/null | awk '/^ip_address:/ {print $2}')

  return 1
}

# ping 解析到非回环地址时作为补充验证
macOsBonjourHostnamePingReachable() {
  local hostname="$1"
  local output resolved

  [[ -z "$hostname" ]] && return 1
  output="$(ping -c 1 -W 2 "$hostname" 2>&1)" || return 1
  resolved="$(sed -nE 's/^PING [^(]+\(([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\).*/\1/p' <<< "$output" | head -n1)"
  [[ -z "$resolved" ]] && return 1
  [[ "$resolved" == "127.0.0.1" ]] && return 1
  return 0
}

resolveMacOsLanHostname() {
  local lanIp="${1:-}"
  local localName hostname=""

  if ! isDarwin || ! command -v scutil >/dev/null 2>&1; then
    return 1
  fi

  localName="$(scutil --get LocalHostName 2>/dev/null || true)"
  localName="${localName//[[:space:]]/}"
  [[ -z "$localName" ]] && return 1

  hostname="${localName}.local"

  # 优先：mDNS 记录中包含用户所选局域网 IP（iPhone 侧通常按此解析）
  if [[ -n "$lanIp" ]] && macOsHostnameMapsToLanIp "$hostname" "$lanIp"; then
    printf '%s\n' "$hostname"
    return 0
  fi

  if macOsBonjourHostnamePingReachable "$hostname"; then
    printf '%s\n' "$hostname"
    return 0
  fi

  return 1
}

pickLanNetworkCandidate() {
  local sorted line rank kind iface ip label
  local -a kinds=() ifaces=() ips=() labels=()
  local i choice maxChoice

  if ! sorted="$(collectNetworkCandidates | sortNetworkCandidates | dedupeNetworkCandidates)"; then
    sorted=""
  fi

  while IFS='|' read -r rank kind iface ip label; do
    [[ -z "$ip" ]] && continue
    kinds+=("$kind")
    ifaces+=("$iface")
    ips+=("$ip")
    labels+=("$label")
  done <<< "$sorted"

  if [[ ${#ips[@]} -eq 0 ]]; then
    if [[ "${MENU_LOCALE:-en}" == "zh" ]]; then
      echo "错误: 未找到可用的局域网 IPv4 地址。" >&2
    else
      echo "Error: No usable LAN IPv4 address found." >&2
    fi
    return 1
  fi

  if [[ ${#ips[@]} -eq 1 ]]; then
    PICKED_LAN_KIND="${kinds[0]}"
    PICKED_LAN_IFACE="${ifaces[0]}"
    PICKED_LAN_IP="${ips[0]}"
    PICKED_LAN_LABEL="${labels[0]}"
    return 0
  fi

  echo ""
  if [[ "${MENU_LOCALE:-en}" == "zh" ]]; then
    echo "检测到多个网卡，请选择 iPhone 或 iPad 当前所在局域网的 IP 地址："
  else
    echo "Multiple network interfaces detected. Please select the IP address on the same local network as your iPhone or iPad:"
  fi
  echo ""

  for i in "${!ips[@]}"; do
    printf "  %d. [%s] %s  %s\n" "$((i + 1))" "$(lanNetworkKindLabel "${kinds[$i]}")" "${labels[$i]}" "${ips[$i]}"
  done
  echo ""

  maxChoice="${#ips[@]}"
  if [[ "${MENU_LOCALE:-en}" == "zh" ]]; then
    promptRead -p "请选择 [1-${maxChoice}]: " choice
  else
    promptRead -p "Choose [1-${maxChoice}]: " choice
  fi

  if [[ -z "${choice//[[:space:]]/}" ]]; then
    choice=1
  fi

  if [[ "$choice" =~ ^[0-9]+$ && choice -ge 1 && choice -le maxChoice ]]; then
    i=$((choice - 1))
    PICKED_LAN_KIND="${kinds[$i]}"
    PICKED_LAN_IFACE="${ifaces[$i]}"
    PICKED_LAN_IP="${ips[$i]}"
    PICKED_LAN_LABEL="${labels[$i]}"
    return 0
  fi

  if [[ "${MENU_LOCALE:-en}" == "zh" ]]; then
    echo "无效选项。" >&2
  else
    echo "Invalid choice." >&2
  fi
  return 1
}

resolveLanHttpsSettings() {
  PICKED_LAN_IP=""
  PICKED_LAN_IFACE=""
  PICKED_LAN_KIND=""
  PICKED_LAN_LABEL=""
  PICKED_LAN_HOSTNAME=""

  pickLanNetworkCandidate || return 1

  if isDarwin; then
    if resolvedHostname="$(resolveMacOsLanHostname "$PICKED_LAN_IP" 2>/dev/null)"; then
      PICKED_LAN_HOSTNAME="$resolvedHostname"
    fi
  fi

  return 0
}
