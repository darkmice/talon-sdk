# Talon SDK

面向本地 AI 的多模融合数据引擎 [Talon](https://github.com/darkmice/talon-bin) 的多语言 SDK。

一个引擎覆盖 SQL + KV + 时序 + 消息队列 + 向量 + 全文搜索 + 图 + 地理空间，所有 SDK 通过 `talon_execute` C ABI 统一调用。

## SDK 列表

| 语言 | 目录 | 安装方式 | 状态 |
|------|------|---------|------|
| **Go** | [`go/`](go/) | `go get github.com/darkmice/talon-sdk/go` | ✅ 102 action，100% 覆盖 |
| **Python** | [`python/`](python/) | `pip install talon-db` | ✅ |
| **Java** | [`java/`](java/) | Maven 依赖 | ✅ |
| **Node.js** | [`nodejs/`](nodejs/) | `npm install talon-db` | ✅ |
| **.NET** | [`dotnet/`](dotnet/) | NuGet 包 | ✅ |

## 引擎模块

| 模块 | 说明 |
|------|------|
| SQL | 关系型查询 |
| KV | 键值存储（TTL / 原子操作 / 分页扫描） |
| Vector | 向量索引与搜索（HNSW） |
| TS | 时序引擎 |
| MQ | 消息队列 |
| AI | Session / Context / Memory / Trace |
| FTS | 全文搜索（BM25 + 模糊 + 混合搜索） |
| Geo | 地理空间（半径 / 矩形 / 围栏） |
| Graph | 属性图（CRUD + BFS + 最短路径 + PageRank） |

## 预编译库

`lib/` 目录包含 4 个平台的 `libtalon.a` 静态库，由 talon 主仓库 CI 自动构建并推送：

| OS | Arch | 目录 |
|----|------|------|
| macOS | arm64 (Apple Silicon) | `lib/darwin_arm64/` |
| macOS | amd64 (Intel) | `lib/darwin_amd64/` |
| Linux | amd64 | `lib/linux_amd64/` |
| Linux | arm64 | `lib/linux_arm64/` |

## License

MIT
