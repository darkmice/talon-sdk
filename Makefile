# Talon SDK — 预编译库管理
#
# 从 talon-bin GitHub Releases 下载对应平台的预编译库。
#
# 用法：
#   make setup                  # 下载当前平台的库（默认 v0.1.0）
#   make setup VERSION=0.2.0   # 指定版本
#   make setup-all              # 下载所有平台的库
#   make check                  # 检查是否存在
#   make clean                  # 清理下载的库

VERSION ?= 0.1.0
REPO    := darkmice/talon-bin
LIB_DIR := lib
BASE_URL := https://github.com/$(REPO)/releases/download/v$(VERSION)

# 自动检测当前平台
UNAME_S := $(shell uname -s)
UNAME_M := $(shell uname -m)

ifeq ($(UNAME_S),Darwin)
  ifeq ($(UNAME_M),arm64)
    CURRENT_PLATFORM := darwin_arm64
    RELEASE_NAME := talon-macos-arm64
  else
    CURRENT_PLATFORM := darwin_amd64
    RELEASE_NAME := talon-macos-amd64
  endif
  STATIC_LIB := libtalon.a
  DYLIB := libtalon.dylib
else ifeq ($(UNAME_S),Linux)
  STATIC_LIB := libtalon.a
  DYLIB := libtalon.so
  ifeq ($(UNAME_M),aarch64)
    CURRENT_PLATFORM := linux_arm64
    RELEASE_NAME := talon-linux-arm64
  else ifeq ($(UNAME_M),loongarch64)
    CURRENT_PLATFORM := linux_loongarch64
    RELEASE_NAME := talon-linux-loongarch64
  else ifeq ($(UNAME_M),riscv64)
    CURRENT_PLATFORM := linux_riscv64
    RELEASE_NAME := talon-linux-riscv64
  else
    CURRENT_PLATFORM := linux_amd64
    RELEASE_NAME := talon-linux-amd64
  endif
else
  CURRENT_PLATFORM := windows_amd64
  RELEASE_NAME := talon-windows-amd64
  STATIC_LIB := talon.lib
  DYLIB := talon.dll
endif

# 所有支持的平台
ALL_PLATFORMS := \
	darwin_arm64:talon-macos-arm64 \
	darwin_amd64:talon-macos-amd64 \
	linux_amd64:talon-linux-amd64 \
	linux_arm64:talon-linux-arm64 \
	linux_loongarch64:talon-linux-loongarch64 \
	linux_riscv64:talon-linux-riscv64 \
	windows_amd64:talon-windows-amd64 \
	windows_arm64:talon-windows-arm64

.PHONY: setup setup-all clean check help

## setup: 下载当前平台的预编译库
setup:
	@echo "==> Downloading Talon v$(VERSION) for $(CURRENT_PLATFORM)..."
	@mkdir -p $(LIB_DIR)/$(CURRENT_PLATFORM)
	@curl -fSL --retry 3 \
		"$(BASE_URL)/libtalon-$(RELEASE_NAME).tar.gz" \
		-o $(LIB_DIR)/$(CURRENT_PLATFORM)/_archive.tar.gz
	@tar -xzf $(LIB_DIR)/$(CURRENT_PLATFORM)/_archive.tar.gz \
		-C $(LIB_DIR)/$(CURRENT_PLATFORM)/
	@rm -f $(LIB_DIR)/$(CURRENT_PLATFORM)/_archive.tar.gz
	@echo "✅ $(CURRENT_PLATFORM) ready"

## setup-all: 下载所有平台的预编译库
setup-all:
	@for entry in $(ALL_PLATFORMS); do \
		dir="$${entry%%:*}"; \
		name="$${entry#*:}"; \
		echo "==> Downloading $$name..."; \
		mkdir -p $(LIB_DIR)/$$dir; \
		curl -fSL --retry 3 \
			"$(BASE_URL)/libtalon-$$name.tar.gz" \
			-o $(LIB_DIR)/$$dir/_archive.tar.gz && \
		tar -xzf $(LIB_DIR)/$$dir/_archive.tar.gz \
			-C $(LIB_DIR)/$$dir/ && \
		rm -f $(LIB_DIR)/$$dir/_archive.tar.gz && \
		echo "  ✅ $$dir ready" || \
		echo "  ❌ $$dir failed"; \
	done
	@echo "==> Done."

## check: 检查库文件是否存在
check:
	@if [ -f $(LIB_DIR)/$(CURRENT_PLATFORM)/$(STATIC_LIB) ]; then \
		echo "✅ $(LIB_DIR)/$(CURRENT_PLATFORM)/$(STATIC_LIB)"; \
	else \
		echo "❌ $(STATIC_LIB) not found. Run: make setup" && exit 1; \
	fi

## clean: 清理下载的库文件
clean:
	rm -rf $(LIB_DIR)

## help: 显示帮助
help:
	@echo "Talon SDK — Native Library Manager"
	@echo ""
	@echo "Commands:"
	@echo "  make setup              Download libs for current platform (v$(VERSION))"
	@echo "  make setup VERSION=X    Download libs for specific version"
	@echo "  make setup-all          Download libs for all platforms"
	@echo "  make check              Verify libs exist"
	@echo "  make clean              Remove all downloaded libs"
	@echo ""
	@echo "Current platform: $(CURRENT_PLATFORM)"
	@echo "Supported: darwin_{arm64,amd64} linux_{amd64,arm64,loongarch64,riscv64} windows_{amd64,arm64}"
