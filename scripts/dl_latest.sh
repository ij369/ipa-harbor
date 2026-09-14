#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
API_URL="https://api.github.com/repos/majd/ipatool/releases/latest"
OUTDIR="${REPO_ROOT}/server/bin"

mkdir -p "$OUTDIR"

for old_tar in "$OUTDIR"/ipatool-*-linux-*.tar.gz; do
  [[ -e "$old_tar" ]] || continue
  rm -f "$old_tar" "${old_tar}.sha256sum"
done

echo "Fetching latest release info from majd/ipatool …"

release_json=$(curl -sL "$API_URL")

# 避免 pipefail + grep -m1 触发 SIGPIPE（exit 141）
tag_name=""
if [[ "$release_json" =~ \"tag_name\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
  tag_name="${BASH_REMATCH[1]}"
fi
if [[ -z "$tag_name" ]]; then
  echo "Failed to get latest version tag" >&2
  exit 1
fi

echo "Latest tag: $tag_name"

urls=()
while IFS= read -r url; do
  [[ -n "$url" ]] && urls+=("$url")
done < <(grep -oE 'https://[^"]+ipatool[^"]+linux[^"]+\.tar\.gz' <<< "$release_json" | sort -u)

if [[ "${#urls[@]}" -eq 0 ]]; then
  echo "No linux .tar.gz assets found." >&2
  exit 1
fi

echo "Found linux assets:"
for url in "${urls[@]}"; do
  echo "  - $url"
done

for url in "${urls[@]}"; do
  filename=$(basename "$url")
  echo "Downloading $filename …"
  curl -L --fail --output "${OUTDIR}/${filename}" "$url"
done

echo "Download completed. Files are saved in: $OUTDIR"
