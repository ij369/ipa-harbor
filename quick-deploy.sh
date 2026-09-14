#!/usr/bin/env bash
set -euo pipefail

readonly REPO="${IPA_HARBOR_REPO:-ij369/ipa-harbor}"
readonly BRANCH="${IPA_HARBOR_BRANCH:-main}"
readonly REMOTE_EN="https://raw.githubusercontent.com/${REPO}/${BRANCH}/scripts/quick-deploy.sh"
readonly REMOTE_ZH="https://raw.githubusercontent.com/${REPO}/${BRANCH}/scripts/quick-deploy.zh.sh"

detectLocale() {
  local lang=""
  if [[ -n "${LC_ALL:-}" ]]; then
    lang="$LC_ALL"
  elif [[ -n "${LC_MESSAGES:-}" ]]; then
    lang="$LC_MESSAGES"
  elif [[ -n "${LANGUAGE:-}" && "${LANG:-}" != "C" && "${LANG:-}" != "POSIX" ]]; then
    lang="${LANGUAGE%%:*}"
  elif [[ -n "${LANG:-}" ]]; then
    lang="$LANG"
  fi

  lang="$(printf '%s' "$lang" | tr '[:upper:]' '[:lower:]')"
  lang="${lang//-/_}"

  case "$lang" in
    zh_cn* | zh_hans* | zh_sg*)
      printf '%s\n' "zh"
      ;;
    *)
      printf '%s\n' "en"
      ;;
  esac
}

runLocaleScript() {
  local locale="$1"
  local name="quick-deploy.sh"
  local remoteUrl="$REMOTE_EN"
  if [[ "$locale" == "zh" ]]; then
    name="quick-deploy.zh.sh"
    remoteUrl="$REMOTE_ZH"
  fi

  if [[ -f "${BASH_SOURCE[0]:-}" && "${BASH_SOURCE[0]}" == *.sh ]]; then
    local localScript
    localScript="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/${name}"
    if [[ -f "$localScript" ]]; then
      exec bash "$localScript"
    fi
  fi

  exec bash <(curl -fsSL "$remoteUrl")
}

runLocaleScript "$(detectLocale)"
