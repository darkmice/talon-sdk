# Talon SDK

面向本地 AI 的多模融合数据引擎 [Talon](https://github.com/darkmice/talon-bin) 的多语言 SDK。

一个引擎覆盖 **SQL + KV + 时序 + 消息队列 + 向量 + 全文搜索 + 图 + 地理空间 + AI**，所有 SDK 通过 `talon_execute` C ABI 统一调用。

## SDK 列表

| 语言 | 目录 | 安装方式 | 模块覆盖 |
|------|------|---------|---------|
| **Go** | [`go/`](go/) | `go get github.com/darkmice/talon-sdk/go` | 10 模块 100% |
| **Python** | [`python/`](python/) | `git clone` + `import talon` | 10 模块 100% |
| **Node.js** | [`nodejs/`](nodejs/) | `git clone` + `require('./nodejs')` | 10 模块 100% |
| **Java** | [`java/`](java/) | Maven / Gradle | 10 模块 100% |
| **.NET** | [`dotnet/`](dotnet/) | NuGet / dotnet add | 10 模块 100% |

## 引擎模块（全部 SDK 覆盖）

| 模块 | 说明 | 方法数 |
|------|------|--------|
| SQL | 关系型查询 | 1 |
| KV | 键值存储（TTL / 原子操作 / 分页扫描） | 17 |
| Vector | 向量索引与搜索（HNSW） | 7 |
| TS | 时序引擎 | 7 |
| MQ | 消息队列 | 9 |
| AI | Session / Context / Memory / Trace | 19 |
| FTS | 全文搜索（BM25 + 模糊 + 混合搜索） | 16 |
| Geo | 地理空间（半径 / 矩形 / 围栏） | 10 |
| Graph | 属性图（CRUD + BFS + 最短路径 + PageRank） | 19 |
| Cluster + Ops | 集群管理 / 统计 / 备份 | 10 |

---

## Go

```bash
go get github.com/darkmice/talon-sdk/go
```

```go
package main

import (
    "fmt"
    talon "github.com/darkmice/talon-sdk/go"
)

func main() {
    db, _ := talon.Open("./data")
    defer db.Close()

    // SQL
    rows, _ := db.SQL("CREATE TABLE t (id INT, name TEXT)")

    // KV
    db.KvSet("key", "value", nil)
    val, _ := db.KvGet("key")

    // Vector
    db.VectorInsert("idx", 1, []float32{0.1, 0.2, 0.3})
    results, _ := db.VectorSearch("idx", []float32{0.1, 0.2, 0.3}, 5, "cosine")

    // FTS
    db.FtsCreateIndex("articles")
    db.FtsIndex("articles", "doc1", map[string]string{"title": "Hello World"})
    hits, _ := db.FtsSearch("articles", "hello", 10)

    // Geo
    db.GeoCreate("shops")
    db.GeoAdd("shops", "starbucks", 121.47, 31.23)
    nearby, _ := db.GeoSearch("shops", 121.47, 31.23, 1000, "m", nil)

    // Graph
    db.GraphCreate("social")
    v1, _ := db.GraphAddVertex("social", "person", map[string]string{"name": "Alice"})
    v2, _ := db.GraphAddVertex("social", "person", map[string]string{"name": "Bob"})
    db.GraphAddEdge("social", v1, v2, "knows", nil)
    path, _ := db.GraphShortestPath("social", v1, v2, 10)

    // AI
    db.AiCreateSession("s1", nil, nil)
    db.AiAppendMessage("s1", map[string]interface{}{"role": "user", "content": "hi"})
    history, _ := db.AiGetHistory("s1", nil)

    fmt.Println(rows, val, results, hits, nearby, path, history)
}
```

Go SDK 通过 cgo 静态链接 `libtalon.a`，`go get` 后即可使用，无需额外下载。

---

## Python

```bash
git clone https://github.com/darkmice/talon-sdk.git
cd talon-sdk
```

```python
from python.talon.client import Talon

db = Talon("./data")

# SQL
db.sql("CREATE TABLE t (id INT, name TEXT)")

# KV
db.kv_set("key", "value")
val = db.kv_get("key")
db.kv_set_nx("lock", "1", ttl=30)  # SETNX + TTL

# Vector
db.vector_insert("idx", 1, [0.1, 0.2, 0.3])
results = db.vector_search("idx", [0.1, 0.2, 0.3], k=5)

# FTS
db.fts_create_index("articles")
db.fts_index("articles", "doc1", {"title": "Hello World"})
hits = db.fts_search("articles", "hello", limit=10)
hybrid = db.fts_hybrid_search("articles", "vectors", "hello", [0.1, 0.2], limit=5)

# Geo
db.geo_create("shops")
db.geo_add("shops", "starbucks", lng=121.47, lat=31.23)
nearby = db.geo_search("shops", lng=121.47, lat=31.23, radius=1000)

# Graph
db.graph_create("social")
v1 = db.graph_add_vertex("social", "person", {"name": "Alice"})
v2 = db.graph_add_vertex("social", "person", {"name": "Bob"})
db.graph_add_edge("social", v1, v2, "knows")
path = db.graph_shortest_path("social", v1, v2)

# AI
db.ai_create_session("s1")
db.ai_append_message("s1", {"role": "user", "content": "hi"})
history = db.ai_get_history("s1")

db.close()
```

Python SDK 通过 `ctypes` 加载 `libtalon.dylib`/`.so`，自动从 `lib/` 目录查找。

---

## Node.js

```bash
git clone https://github.com/darkmice/talon-sdk.git
cd talon-sdk
npm install ffi-napi ref-napi  # 安装 FFI 依赖
```

```javascript
const { Talon } = require('./nodejs');

const db = new Talon('./data');

// SQL
db.sql('CREATE TABLE t (id INT, name TEXT)');

// KV
db.kvSet('key', 'value');
const val = db.kvGet('key');
db.kvSetNx('lock', '1', 30);

// Vector
db.vectorInsert('idx', 1, [0.1, 0.2, 0.3]);
const results = db.vectorSearch('idx', [0.1, 0.2, 0.3], 5);

// FTS
db.ftsCreateIndex('articles');
db.ftsIndex('articles', 'doc1', { title: 'Hello World' });
const hits = db.ftsSearch('articles', 'hello', 10);

// Geo
db.geoCreate('shops');
db.geoAdd('shops', 'starbucks', 121.47, 31.23);
const nearby = db.geoSearch('shops', 121.47, 31.23, 1000);

// Graph
db.graphCreate('social');
const v1 = db.graphAddVertex('social', 'person', { name: 'Alice' });
const v2 = db.graphAddVertex('social', 'person', { name: 'Bob' });
db.graphAddEdge('social', v1, v2, 'knows');
const path = db.graphShortestPath('social', v1, v2);

// AI
db.aiCreateSession('s1');
db.aiAppendMessage('s1', { role: 'user', content: 'hi' });
const history = db.aiGetHistory('s1');

db.close();
```

Node.js SDK 通过 `ffi-napi` 加载动态库，自动从 `lib/` 目录查找。

---

## Java

Maven 依赖（需 JNA）：

```xml
<dependency>
  <groupId>net.java.dev.jna</groupId>
  <artifactId>jna</artifactId>
  <version>5.14.0</version>
</dependency>
<dependency>
  <groupId>com.google.code.gson</groupId>
  <artifactId>gson</artifactId>
  <version>2.10.1</version>
</dependency>
```

```java
import io.talon.Talon;

try (Talon db = new Talon("./data")) {
    // SQL
    db.sql("CREATE TABLE t (id INT, name TEXT)");

    // KV
    db.kvSet("key", "value", null);
    String val = db.kvGet("key");
    db.kvSetNx("lock", "1", 30L);

    // Vector
    db.vectorInsert("idx", 1, new float[]{0.1f, 0.2f, 0.3f});
    var results = db.vectorSearch("idx", new float[]{0.1f, 0.2f, 0.3f}, 5, "cosine");

    // FTS
    db.ftsCreateIndex("articles");
    db.ftsIndex("articles", "doc1", Map.of("title", "Hello World"));
    var hits = db.ftsSearch("articles", "hello", 10);

    // Geo
    db.geoCreate("shops");
    db.geoAdd("shops", "starbucks", 121.47, 31.23);
    var nearby = db.geoSearch("shops", 121.47, 31.23, 1000, "m", null);

    // Graph
    db.graphCreate("social");
    long v1 = db.graphAddVertex("social", "person", Map.of("name", "Alice"));
    long v2 = db.graphAddVertex("social", "person", Map.of("name", "Bob"));
    db.graphAddEdge("social", v1, v2, "knows", null);
    var path = db.graphShortestPath("social", v1, v2, 10);

    // AI
    db.aiCreateSession("s1", null, null);
    db.aiAppendMessage("s1", Map.of("role", "user", "content", "hi"));
    var history = db.aiGetHistory("s1", null);
}
```

Java SDK 通过 JNA 加载动态库，自动从 `lib/` 目录或 `TALON_SDK_ROOT` 环境变量查找。

---

## .NET

```csharp
using TalonDb;

using var db = new TalonClient("./data");

// SQL
db.Sql("CREATE TABLE t (id INT, name TEXT)");

// KV
db.KvSet("key", "value");
var val = db.KvGet("key");
db.KvSetNx("lock", "1", 30);

// Vector
db.VectorInsert("idx", 1, new float[] { 0.1f, 0.2f, 0.3f });
var results = db.VectorSearch("idx", new float[] { 0.1f, 0.2f, 0.3f }, 5);

// FTS
db.FtsCreateIndex("articles");
db.FtsIndex("articles", "doc1", new() { ["title"] = "Hello World" });
var hits = db.FtsSearch("articles", "hello", 10);

// Geo
db.GeoCreate("shops");
db.GeoAdd("shops", "starbucks", 121.47, 31.23);
var nearby = db.GeoSearch("shops", 121.47, 31.23, 1000);

// Graph
db.GraphCreate("social");
var v1 = db.GraphAddVertex("social", "person", new() { ["name"] = "Alice" });
var v2 = db.GraphAddVertex("social", "person", new() { ["name"] = "Bob" });
db.GraphAddEdge("social", v1, v2, "knows");
var path = db.GraphShortestPath("social", v1, v2);

// AI
db.AiCreateSession("s1");
db.AiAppendMessage("s1", new() { ["role"] = "user", ["content"] = "hi" });
var history = db.AiGetHistory("s1");
```

.NET SDK 通过 P/Invoke 加载动态库，静态构造函数自动从 `lib/` 目录查找。

---

## 预编译库

`lib/` 目录包含 4 个平台的静态库（`.a`）和动态库（`.dylib`/`.so`），由主仓库 CI 自动构建推送：

| OS | Arch | 目录 | 静态库 | 动态库 |
|----|------|------|--------|--------|
| macOS | arm64 | `lib/darwin_arm64/` | `libtalon.a` | `libtalon.dylib` |
| macOS | amd64 | `lib/darwin_amd64/` | `libtalon.a` | `libtalon.dylib` |
| Linux | amd64 | `lib/linux_amd64/` | `libtalon.a` | `libtalon.so` |
| Linux | arm64 | `lib/linux_arm64/` | `libtalon.a` | `libtalon.so` |

- **Go** 使用静态库（`.a`），编译后无运行时依赖
- **Python / Node.js / Java / .NET** 使用动态库（`.dylib` / `.so`），运行时自动加载

### 库查找优先级

1. `TALON_LIB_PATH` 环境变量（直接指定文件路径）
2. `talon-sdk/lib/{platform}/` 内嵌库（自动检测平台）
3. 系统搜索路径

## License

MIT
