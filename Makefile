# Talon Go SDK — 预编译库下载
#
# 从 talon-bin GitHub Releases 下载对应平台的 libtalon.a 静态库。
# 用法：make setup VERSION=0.1.0

VERSION ?= 0.1.0
REPO    := darkmice/talon-bin
LIB_DIR := lib

# 自动检测平台
UNAME_S := $(shell uname -s)
UNAME_M := $(shell uname -m)

ifeq ($(UNAME_S),Darwin)
  ifeq ($(UNAME_M),arm64)
    TARGET := talon-macos-arm64
  else
    TARGET := talon-macos-amd64
  endif
  LIB_FILE := libtalon.a
else ifeq ($(UNAME_S),Linux)
  ifeq ($(UNAME_M),aarch64)
    TARGET := talon-linux-arm64
  else
    TARGET := talon-linux-amd64
  endif
  LIB_FILE := libtalon.a
else
  $(error Unsupported platform: $(UNAME_S)-$(UNAME_M))
endif

ARCHIVE  := libtalon-$(TARGET).tar.gz
URL      := https://github.com/$(REPO)/releases/download/v$(VERSION)/$(ARCHIVE)

.PHONY: setup clean check

## setup: 下载并解压预编译库到 lib/
setup: $(LIB_DIR)/$(LIB_FILE)

$(LIB_DIR)/$(LIB_FILE):
	@echo "==> Downloading Talon v$(VERSION) for $(TARGET)..."
	@mkdir -p $(LIB_DIR)
	@curl -fSL --retry 3 "$(URL)" -o $(LIB_DIR)/$(ARCHIVE)
	@tar -xzf $(LIB_DIR)/$(ARCHIVE) -C $(LIB_DIR)
	@rm -f $(LIB_DIR)/$(ARCHIVE)
	@echo "==> $(LIB_FILE) ready in $(LIB_DIR)/"

## check: 验证库文件是否存在
check:
	@test -f $(LIB_DIR)/$(LIB_FILE) \
		&& echo "✓ $(LIB_DIR)/$(LIB_FILE) exists" \
		|| (echo "✗ $(LIB_DIR)/$(LIB_FILE) not found. Run: make setup" && exit 1)

## clean: 清除下载的库文件
clean:
	rm -f $(LIB_DIR)/$(LIB_FILE) $(LIB_DIR)/*.tar.gz
