#!/usr/bin/env bash
set -euo pipefail

API_URL="https://api.github.com/repos/majd/ipatool/releases/latest"
OUTDIR="./server/bin"

mkdir -p "$OUTDIR"

echo "Fetching latest release info from majd/ipatool …"

# 获取最新 release
release_json=$(curl -sL "$API_URL")

# 从 JSON 中提取 tag_name
tag_name=$(echo "$release_json" | grep -m1 '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
if [[ -z "$tag_name" ]]; then
  echo "Failed to get latest version tag"
  exit 1
fi

echo "Latest tag: $tag_name"

# 提取含 "linux" 的文件 url
urls=$(echo "$release_json" | grep '"browser_download_url":' | grep 'linux' | sed -E 's/.*"(https:[^"]+)".*/\1/')

if [[ -z "$urls" ]]; then
  echo "No assets containing 'linux' found."
  exit 1
fi

echo "Found linux assets:"
echo "$urls" | sed 's/^/  - /'

# 下载文件
for url in $urls; do
  filename=$(basename "$url")
  echo "Downloading $filename …"
  curl -L --fail --output "${OUTDIR}/${filename}" "$url"
done

echo "Download completed. Files are saved in: $OUTDIR"
