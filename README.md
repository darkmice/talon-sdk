# Talon Go SDK

面向本地 AI 的多模融合数据引擎 [Talon](https://github.com/darkmice/talon-bin) 的 Go SDK。

通过 cgo 封装 `talon_execute` C ABI，零额外 Go 依赖。

## 安装

### 1. 下载预编译库

```bash
# 克隆 SDK
git clone https://github.com/darkmice/talon-sdk.git
cd talon-sdk

# 下载对应平台的 libtalon.a（自动检测 macOS/Linux, amd64/arm64）
make setup VERSION=0.1.3
```

预编译库从 [talon-bin Releases](https://github.com/darkmice/talon-bin/releases) 下载。

### 2. 添加依赖

```bash
go get github.com/darkmice/talon-sdk
```

### 3. 设置库路径（如果使用 go get）

如果通过 `go get` 添加依赖，需确保 `libtalon.a` 在 SDK 包的 `lib/` 目录下：

```bash
# 找到 Go 模块缓存中的 SDK 路径
SDK_PATH=$(go env GOMODCACHE)/github.com/darkmice/talon-sdk@v0.1.3
mkdir -p $SDK_PATH/lib
make -C $SDK_PATH setup VERSION=0.1.3
```

或者使用 `go mod vendor` + replace 指令指向本地克隆。

## 模块覆盖

| 模块 | 文件 | 说明 |
|------|------|------|
| SQL | `talon.go` | SQL 执行 |
| KV | `talon.go` | 键值存储（含 TTL、分页扫描、原子操作） |
| Vector | `talon.go` | 向量索引与搜索（HNSW） |
| TS | `talon_ts.go` | 时序引擎 |
| MQ | `talon_mq.go` | 消息队列 |
| AI | `talon_ai.go` | Session / Context / Memory / Trace |
| FTS | `talon_fts.go` | 全文搜索（BM25 + 模糊 + 混合搜索） |
| Geo | `talon_geo.go` | 地理空间（半径 / 矩形 / 围栏） |
| Graph | `talon_graph.go` | 属性图（CRUD + BFS + 最短路径 + PageRank） |
| Cluster | `talon.go` | 集群管理 |
| Backup | `talon_ai.go` | 导入导出 |

**102 个 FFI action，100% 覆盖。**

## 快速开始

```go
package main

import (
    "fmt"
    talon "github.com/darkmice/talon-sdk"
)

func main() {
    db, err := talon.Open("./my_data")
    if err != nil {
        panic(err)
    }
    defer db.Close()

    // SQL
    db.SQL("CREATE TABLE users (id INT, name TEXT)")
    db.SQL("INSERT INTO users VALUES (1, 'Alice')")
    rows, _ := db.SQL("SELECT * FROM users")
    fmt.Println(rows)

    // KV
    db.KvSet("session:abc", `{"user":"Alice"}`, nil)
    val, _ := db.KvGet("session:abc")
    fmt.Println(*val)

    // Vector (RAG embedding)
    db.VectorInsert("embeddings", 1, []float32{0.1, 0.2, 0.3})
    results, _ := db.VectorSearch("embeddings", []float32{0.1, 0.2, 0.3}, 5, "cosine")
    fmt.Println(string(results))

    // FTS
    db.FtsCreateIndex("articles")
    db.FtsIndex("articles", "doc1", map[string]string{
        "title": "Talon Database", "body": "A multi-model engine for AI",
    })
    hits, _ := db.FtsSearch("articles", "talon", 10)
    fmt.Println(string(hits))

    // Graph (knowledge graph)
    db.GraphCreate("knowledge")
    id1, _ := db.GraphAddVertex("knowledge", "concept", map[string]string{"name": "AI"})
    id2, _ := db.GraphAddVertex("knowledge", "concept", map[string]string{"name": "Database"})
    db.GraphAddEdge("knowledge", id1, id2, "related_to", nil)
    neighbors, _ := db.GraphNeighbors("knowledge", id1, "out")
    fmt.Println(neighbors)

    // Geo
    db.GeoCreate("pois")
    db.GeoAdd("pois", "office", 116.397, 39.908)
    nearby, _ := db.GeoSearch("pois", 116.4, 39.9, 5000, "m", nil)
    fmt.Println(string(nearby))

    // AI Session (对话管理)
    db.AiCreateSession("chat-1", map[string]string{"model": "gpt-4"}, nil)
    db.AiAppendMessage("chat-1", map[string]interface{}{
        "role": "user", "content": "Hello!",
    })
    history, _ := db.AiGetHistory("chat-1", nil)
    fmt.Println(string(history))
}
```

## 支持平台

| OS | Arch | 状态 |
|----|------|------|
| macOS | arm64 (Apple Silicon) | ✅ |
| macOS | amd64 (Intel) | ✅ |
| Linux | amd64 | ✅ |
| Linux | arm64 | ✅ |

## License

MIT
