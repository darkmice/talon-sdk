# Talon Python SDK

基于 ctypes 封装 `talon_execute` C ABI，零编译依赖。

## 安装

```bash
pip install talon-db
```

Native library 在首次 `import talon` 时自动从 GitHub Releases 下载，无需手动编译。

## 快速开始

```python
from talon import Talon

with Talon("./my_data") as db:
    # SQL
    db.sql("CREATE TABLE t (id INT, name TEXT)")
    db.sql("INSERT INTO t VALUES (1, 'hello')")
    rows = db.sql("SELECT * FROM t")

    # KV
    db.kv_set("key", "value", ttl=60)
    print(db.kv_get("key"))

    # 时序
    db.ts_create("metrics", tags=["host"], fields=["cpu"])
    db.ts_insert("metrics", {
        "timestamp": 1000,
        "tags": {"host": "srv1"},
        "fields": {"cpu": 0.85},
    })

    # 消息队列
    db.mq_create("events")
    db.mq_publish("events", "hello world")
    msgs = db.mq_poll("events", "g1", "c1", count=10)

    # 向量
    db.vector_insert("idx", 1, [0.1, 0.2, 0.3])
    results = db.vector_search("idx", [0.1, 0.2, 0.3], k=5)

    # AI 会话
    db.ai_create_session("s1", metadata={"model": "gpt-4"})
    db.ai_append_message("s1", {
        "role": "user", "content": "hello",
        "token_count": 1,
    })
    history = db.ai_get_history("s1")
```

## 测试

```bash
pip install talon-db
python3 tests/test_sdk.py
```

## 库查找优先级

SDK 按以下顺序查找 `libtalon` 动态库：

1. `TALON_LIB_PATH` 环境变量
2. 包内 `talon/native/` 目录（platform wheel）
3. SDK 开发布局 `talon-sdk/lib/{platform}/`
4. 缓存目录（自动从 GitHub Releases 下载）
5. 系统搜索路径

## 特性

- **零编译依赖**：仅用 Python 标准库 `ctypes`，无需安装额外包
- **全引擎覆盖**：SQL / KV / TS / MQ / Vector / AI 六大模块
- **Value 自动解包**：SQL 结果自动转换为 Python 原生类型（int/float/str/bool/dict/list）
- **Context Manager**：支持 `with Talon(path) as db:` 自动关闭
- **类型注解**：完整 typing 注解，IDE 友好
