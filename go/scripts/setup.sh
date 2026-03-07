#!/usr/bin/env bash
#
# Talon Go SDK — 自动下载预编译原生库
#
# 用法:
#   ./setup.sh              # 使用默认版本
#   ./setup.sh 0.1.0        # 指定版本
#   TALON_VERSION=0.1.0 ./setup.sh
#
# 也可通过 go generate 触发:
#   go generate ./...
#
set -euo pipefail

REPO="darkmice/talon-bin"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LIB_DIR="${SDK_ROOT}/lib"

# 版本优先级: 参数 > 环境变量 > 默认
VERSION="${1:-${TALON_VERSION:-0.1.0}}"

# ── 平台检测 ──

detect_platform() {
  local uname_s uname_m
  uname_s="$(uname -s)"
  uname_m="$(uname -m)"

  case "$uname_s" in
    Darwin)
      LIB_NAME="libtalon.dylib"
      STATIC_LIB="libtalon.a"
      case "$uname_m" in
        arm64) PLAT_DIR="darwin_arm64"; RELEASE_NAME="talon-macos-arm64" ;;
        *)     PLAT_DIR="darwin_amd64"; RELEASE_NAME="talon-macos-amd64" ;;
      esac
      ;;
    Linux)
      LIB_NAME="libtalon.so"
      STATIC_LIB="libtalon.a"
      case "$uname_m" in
        aarch64)     PLAT_DIR="linux_arm64";       RELEASE_NAME="talon-linux-arm64" ;;
        loongarch64) PLAT_DIR="linux_loongarch64";  RELEASE_NAME="talon-linux-loongarch64" ;;
        riscv64)     PLAT_DIR="linux_riscv64";      RELEASE_NAME="talon-linux-riscv64" ;;
        *)           PLAT_DIR="linux_amd64";        RELEASE_NAME="talon-linux-amd64" ;;
      esac
      ;;
    MINGW*|MSYS*|CYGWIN*)
      LIB_NAME="talon.dll"
      STATIC_LIB="talon.lib"
      case "$uname_m" in
        aarch64) PLAT_DIR="windows_arm64"; RELEASE_NAME="talon-windows-arm64" ;;
        *)       PLAT_DIR="windows_amd64"; RELEASE_NAME="talon-windows-amd64" ;;
      esac
      ;;
    *)
      echo "❌ Unsupported platform: ${uname_s}-${uname_m}" >&2
      exit 1
      ;;
  esac
}

# ── 缓存目录 ──

cache_dir() {
  if [ -n "${TALON_CACHE_DIR:-}" ]; then
    echo "${TALON_CACHE_DIR}/${VERSION}"
    return
  fi
  case "$(uname -s)" in
    Darwin) echo "${HOME}/Library/Caches/talon/${VERSION}" ;;
    *)      echo "${XDG_CACHE_HOME:-${HOME}/.cache}/talon/${VERSION}" ;;
  esac
}

# ── 下载 ──

download_lib() {
  local dest_dir="$1"
  local archive_name="libtalon-${RELEASE_NAME}.tar.gz"
  local url="https://github.com/${REPO}/releases/download/v${VERSION}/${archive_name}"
  local archive_path="${dest_dir}/${archive_name}"

  mkdir -p "$dest_dir"

  echo "==> Downloading Talon v${VERSION} for ${RELEASE_NAME}..."
  echo "    URL: ${url}"

  if ! curl -fSL --retry 3 -o "$archive_path" "$url"; then
    echo "❌ Download failed. Check:" >&2
    echo "   - Version v${VERSION} exists in ${REPO}" >&2
    echo "   - Network/proxy settings" >&2
    rm -f "$archive_path"
    return 1
  fi

  # 校验大小
  local size
  size=$(wc -c < "$archive_path" | tr -d ' ')
  if [ "$size" -lt 1024 ]; then
    echo "❌ Downloaded archive too small (${size} bytes), likely corrupted" >&2
    rm -f "$archive_path"
    return 1
  fi

  tar -xzf "$archive_path" -C "$dest_dir"
  rm -f "$archive_path"

  if [ -f "${dest_dir}/${STATIC_LIB}" ]; then
    echo "✅ ${STATIC_LIB} ready in ${dest_dir}/"
    return 0
  elif [ -f "${dest_dir}/${LIB_NAME}" ]; then
    echo "✅ ${LIB_NAME} ready in ${dest_dir}/"
    return 0
  else
    echo "❌ Library not found after extraction" >&2
    return 1
  fi
}

# ── 主流程 ──

main() {
  detect_platform

  local target_dir="${LIB_DIR}/${PLAT_DIR}"

  # 已存在则跳过
  if [ -f "${target_dir}/${STATIC_LIB}" ]; then
    echo "✅ ${STATIC_LIB} already exists in ${target_dir}/"
    return 0
  fi

  # 检查缓存
  local cache
  cache="$(cache_dir)"
  if [ -f "${cache}/${STATIC_LIB}" ]; then
    echo "==> Using cached library from ${cache}/"
    mkdir -p "$target_dir"
    cp "${cache}/${STATIC_LIB}" "$target_dir/"
    [ -f "${cache}/${LIB_NAME}" ] && cp "${cache}/${LIB_NAME}" "$target_dir/"
    [ -f "${cache}/talon.h" ] && cp "${cache}/talon.h" "$target_dir/"
    echo "✅ Library ready in ${target_dir}/"
    return 0
  fi

  # 下载到缓存，再拷贝到 lib/
  if download_lib "$cache"; then
    mkdir -p "$target_dir"
    cp "${cache}/${STATIC_LIB}" "$target_dir/"
    [ -f "${cache}/${LIB_NAME}" ] && cp "${cache}/${LIB_NAME}" "$target_dir/"
    [ -f "${cache}/talon.h" ] && cp "${cache}/talon.h" "$target_dir/"
    echo "✅ Library installed to ${target_dir}/"
  else
    echo ""
    echo "💡 Alternatives:" >&2
    echo "   1. Set TALON_LIB_PATH to a pre-built library" >&2
    echo "   2. Run: make setup VERSION=${VERSION}" >&2
    echo "   3. Build from source: cargo build --release" >&2
    exit 1
  fi
}

main "$@"
