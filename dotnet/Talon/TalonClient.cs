// Talon .NET SDK — 通过 P/Invoke 封装 talon_execute C ABI。

using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace TalonDb
{
    /// <summary>Talon 操作异常。</summary>
    public class TalonException : Exception
    {
        public TalonException(string message) : base(message) { }
    }

    /// <summary>Talon 数据库客户端（嵌入式模式）。</summary>
    public class TalonClient : IDisposable
    {
        private IntPtr _handle;

        /// <summary>打开数据库。</summary>
        public TalonClient(string path)
        {
            _handle = NativeLib.talon_open(path);
            if (_handle == IntPtr.Zero)
                throw new TalonException($"无法打开数据库: {path}");
        }

        /// <summary>执行通用命令，返回 data 节点。</summary>
        private JsonNode Execute(string module, string action = "",
            Dictionary<string, object>? parms = null)
        {
            if (_handle == IntPtr.Zero)
                throw new TalonException("数据库已关闭");

            var cmd = new Dictionary<string, object>
            {
                ["module"] = module,
                ["action"] = action,
                ["params"] = parms ?? new Dictionary<string, object>()
            };
            var json = JsonSerializer.Serialize(cmd);

            int rc = NativeLib.talon_execute(_handle, json, out IntPtr outPtr);
            if (rc != 0)
                throw new TalonException("talon_execute 调用失败");
            if (outPtr == IntPtr.Zero)
                throw new TalonException("talon_execute 返回空指针");

            string outStr;
            try
            {
                outStr = Marshal.PtrToStringUTF8(outPtr)!;
            }
            finally
            {
                NativeLib.talon_free_string(outPtr);
            }

            var result = JsonNode.Parse(outStr)!;
            if (result["ok"]?.GetValue<bool>() != true)
            {
                var err = result["error"]?.GetValue<string>() ?? "未知错误";
                throw new TalonException(err);
            }
            return result["data"] ?? JsonNode.Parse("{}")!;
        }

        /// <summary>关闭数据库。</summary>
        public void Close()
        {
            if (_handle != IntPtr.Zero)
            {
                NativeLib.talon_close(_handle);
                _handle = IntPtr.Zero;
            }
        }

        public void Dispose() => Close();

        /// <summary>刷盘。</summary>
        public void Persist()
        {
            if (_handle == IntPtr.Zero)
                throw new TalonException("数据库已关闭");
            if (NativeLib.talon_persist(_handle) != 0)
                throw new TalonException("persist 失败");
        }

        /// <summary>获取引擎统计信息。</summary>
        public JsonNode Stats() => Execute("stats");

        // ── SQL ──
        public JsonNode Sql(string query) =>
            Execute("sql", "", new() { ["sql"] = query });

        // ── KV ──
        public void KvSet(string key, string value, long? ttl = null)
        {
            var p = new Dictionary<string, object> { ["key"] = key, ["value"] = value };
            if (ttl.HasValue) p["ttl"] = ttl.Value;
            Execute("kv", "set", p);
        }

        public string? KvGet(string key) =>
            Execute("kv", "get", new() { ["key"] = key })["value"]?.GetValue<string>();

        public bool KvDel(string key) =>
            Execute("kv", "del", new() { ["key"] = key })["deleted"]?.GetValue<bool>() ?? false;

        public bool KvExists(string key) =>
            Execute("kv", "exists", new() { ["key"] = key })["exists"]?.GetValue<bool>() ?? false;

        public long KvIncr(string key) =>
            Execute("kv", "incr", new() { ["key"] = key })["value"]?.GetValue<long>() ?? 0;

        public JsonNode KvKeys(string prefix = "") =>
            Execute("kv", "keys", new() { ["prefix"] = prefix });

        public void KvMset(string[] keys, string[] values) =>
            Execute("kv", "mset", new() { ["keys"] = keys, ["values"] = values });

        public JsonNode KvMget(string[] keys) =>
            Execute("kv", "mget", new() { ["keys"] = keys });

        public JsonNode KvKeysMatch(string pattern = "*") =>
            Execute("kv", "keys_match", new() { ["pattern"] = pattern });

        public void KvExpire(string key, long seconds) =>
            Execute("kv", "expire", new() { ["key"] = key, ["seconds"] = seconds });

        public long? KvTtl(string key) =>
            Execute("kv", "ttl", new() { ["key"] = key })["ttl"]?.GetValue<long>();

        public long KvIncrBy(string key, long delta) =>
            Execute("kv", "incrby", new() { ["key"] = key, ["delta"] = delta })["value"]?.GetValue<long>() ?? 0;

        public long KvDecrBy(string key, long delta) =>
            Execute("kv", "decrby", new() { ["key"] = key, ["delta"] = delta })["value"]?.GetValue<long>() ?? 0;

        public bool KvSetNx(string key, string value, long? ttl = null)
        {
            var p = new Dictionary<string, object> { ["key"] = key, ["value"] = value };
            if (ttl.HasValue) p["ttl"] = ttl.Value;
            return Execute("kv", "setnx", p)["set"]?.GetValue<bool>() ?? false;
        }

        public JsonNode KvKeysLimit(string prefix = "", long offset = 0, long limit = 100) =>
            Execute("kv", "keys_limit", new() { ["prefix"] = prefix, ["offset"] = offset, ["limit"] = limit });

        public JsonNode KvScanLimit(string prefix = "", long offset = 0, long limit = 100) =>
            Execute("kv", "scan_limit", new() { ["prefix"] = prefix, ["offset"] = offset, ["limit"] = limit });

        public long KvCount() =>
            Execute("kv", "count")["count"]?.GetValue<long>() ?? 0;

        // ── TS ──
        public void TsCreate(string name, string[]? tags = null, string[]? fields = null) =>
            Execute("ts", "create", new()
            {
                ["name"] = name,
                ["tags"] = tags ?? Array.Empty<string>(),
                ["fields"] = fields ?? Array.Empty<string>()
            });

        public void TsInsert(string name, Dictionary<string, object> point) =>
            Execute("ts", "insert", new() { ["name"] = name, ["point"] = point });

        public JsonNode TsQuery(string name, Dictionary<string, object>? opts = null)
        {
            var p = opts ?? new Dictionary<string, object>();
            p["name"] = name;
            return Execute("ts", "query", p);
        }

        public JsonNode TsAggregate(string name, string field, string func,
            Dictionary<string, object>? opts = null)
        {
            var p = opts ?? new Dictionary<string, object>();
            p["name"] = name; p["field"] = field; p["func"] = func;
            return Execute("ts", "aggregate", p);
        }

        public void TsSetRetention(string name, long retentionMs) =>
            Execute("ts", "set_retention", new() { ["name"] = name, ["retention_ms"] = retentionMs });

        public long TsPurgeExpired(string name) =>
            Execute("ts", "purge_expired", new() { ["name"] = name })["purged"]?.GetValue<long>() ?? 0;

        public long TsPurgeByTag(string name, string[][] tagFilters) =>
            Execute("ts", "purge_by_tag", new()
            {
                ["name"] = name, ["tag_filters"] = tagFilters
            })["purged"]?.GetValue<long>() ?? 0;

        // ── MQ ──
        public void MqCreate(string topic, long maxLen = 0) =>
            Execute("mq", "create", new() { ["topic"] = topic, ["max_len"] = maxLen });

        public long MqPublish(string topic, string payload) =>
            Execute("mq", "publish", new() { ["topic"] = topic, ["payload"] = payload })
                ["id"]?.GetValue<long>() ?? 0;

        public JsonNode MqPoll(string topic, string group, string consumer,
            int count = 1, long blockMs = 0) =>
            Execute("mq", "poll", new()
            {
                ["topic"] = topic, ["group"] = group,
                ["consumer"] = consumer, ["count"] = count,
                ["block_ms"] = blockMs
            });

        public void MqAck(string topic, string group, string consumer, long messageId) =>
            Execute("mq", "ack", new()
            {
                ["topic"] = topic, ["group"] = group,
                ["consumer"] = consumer, ["message_id"] = messageId
            });

        public long MqLen(string topic) =>
            Execute("mq", "len", new() { ["topic"] = topic })["len"]?.GetValue<long>() ?? 0;

        public void MqDrop(string topic) =>
            Execute("mq", "drop", new() { ["topic"] = topic });

        public void MqSubscribe(string topic, string group) =>
            Execute("mq", "subscribe", new() { ["topic"] = topic, ["group"] = group });

        public void MqUnsubscribe(string topic, string group) =>
            Execute("mq", "unsubscribe", new() { ["topic"] = topic, ["group"] = group });

        public string[] MqListSubscriptions(string topic)
        {
            var data = Execute("mq", "list_subscriptions", new() { ["topic"] = topic });
            return data["groups"]?.AsArray().Select(v => v?.GetValue<string>() ?? "").ToArray() ?? Array.Empty<string>();
        }

        // ── Vector ──
        public void VectorInsert(string name, long id, float[] vector) =>
            Execute("vector", "insert", new()
            {
                ["name"] = name, ["id"] = id, ["vector"] = vector
            });

        public JsonNode VectorSearch(string name, float[] vector,
            int k = 10, string metric = "cosine") =>
            Execute("vector", "search", new()
            {
                ["name"] = name, ["vector"] = vector, ["k"] = k, ["metric"] = metric
            });

        public void VectorDelete(string name, long id) =>
            Execute("vector", "delete", new() { ["name"] = name, ["id"] = id });

        public long VectorCount(string name) =>
            Execute("vector", "count", new() { ["name"] = name })["count"]?.GetValue<long>() ?? 0;

        public long VectorBatchInsert(string name, object[] items) =>
            Execute("vector", "batch_insert", new()
            {
                ["name"] = name, ["items"] = items
            })["inserted"]?.GetValue<long>() ?? 0;

        public JsonNode VectorBatchSearch(string name, float[][] vectors,
            int k = 10, string metric = "cosine") =>
            Execute("vector", "batch_search", new()
            {
                ["name"] = name, ["vectors"] = vectors, ["k"] = k, ["metric"] = metric
            });

        /// <summary>设置向量索引运行时搜索宽度 ef_search。</summary>
        public void VectorSetEfSearch(string name, int efSearch) =>
            Execute("vector", "set_ef_search", new()
            {
                ["name"] = name, ["ef_search"] = efSearch
            });

        // ── AI ──
        public void AiCreateSession(string id,
            Dictionary<string, string>? metadata = null, long? ttl = null)
        {
            var p = new Dictionary<string, object> { ["id"] = id };
            if (metadata != null) p["metadata"] = metadata;
            if (ttl.HasValue) p["ttl"] = ttl.Value;
            Execute("ai", "create_session", p);
        }

        public JsonNode AiGetSession(string id) =>
            Execute("ai", "get_session", new() { ["id"] = id });

        public JsonNode AiListSessions() => Execute("ai", "list_sessions");

        public void AiDeleteSession(string id) =>
            Execute("ai", "delete_session", new() { ["id"] = id });

        public void AiUpdateSession(string id, Dictionary<string, string> metadata) =>
            Execute("ai", "update_session", new() { ["id"] = id, ["metadata"] = metadata });

        public long AiClearContext(string sessionId) =>
            Execute("ai", "clear_context", new() { ["session_id"] = sessionId })
                ["purged"]?.GetValue<long>() ?? 0;

        public void AiAppendMessage(string sessionId, Dictionary<string, object> message) =>
            Execute("ai", "append_message", new()
            {
                ["session_id"] = sessionId, ["message"] = message
            });

        public JsonNode AiGetHistory(string sessionId, int? limit = null)
        {
            var p = new Dictionary<string, object> { ["session_id"] = sessionId };
            if (limit.HasValue) p["limit"] = limit.Value;
            return Execute("ai", "get_history", p);
        }

        public JsonNode AiGetContextWindow(string sessionId, int maxTokens) =>
            Execute("ai", "get_context_window", new()
            {
                ["session_id"] = sessionId, ["max_tokens"] = maxTokens
            });

        public JsonNode AiGetRecentMessages(string sessionId, int n) =>
            Execute("ai", "get_recent_messages", new()
            {
                ["session_id"] = sessionId, ["n"] = n
            });

        public void AiStoreMemory(Dictionary<string, object> entry, float[] embedding) =>
            Execute("ai", "store_memory", new() { ["entry"] = entry, ["embedding"] = embedding });

        public JsonNode AiSearchMemory(float[] embedding, int k = 10) =>
            Execute("ai", "search_memory", new() { ["embedding"] = embedding, ["k"] = k });

        public void AiDeleteMemory(long id) =>
            Execute("ai", "delete_memory", new() { ["id"] = id });

        public long AiMemoryCount() =>
            Execute("ai", "memory_count")["count"]?.GetValue<long>() ?? 0;

        public void AiUpdateMemory(long id, string? content = null,
            Dictionary<string, string>? metadata = null)
        {
            var p = new Dictionary<string, object> { ["id"] = id };
            if (content != null) p["content"] = content;
            if (metadata != null) p["metadata"] = metadata;
            Execute("ai", "update_memory", p);
        }

        public void AiStoreMemoriesBatch(Dictionary<string, object>[] entries,
            float[][] embeddings) =>
            Execute("ai", "store_memories_batch", new()
            {
                ["entries"] = entries, ["embeddings"] = embeddings
            });

        public void AiLogTrace(Dictionary<string, object> record) =>
            Execute("ai", "log_trace", new() { ["record"] = record });

        public long AiTokenUsage(string sessionId) =>
            Execute("ai", "token_usage", new() { ["session_id"] = sessionId })
                ["total_tokens"]?.GetValue<long>() ?? 0;

        public long AiTokenUsageByRun(string runId) =>
            Execute("ai", "token_usage_by_run", new() { ["run_id"] = runId })
                ["total_tokens"]?.GetValue<long>() ?? 0;

        // ── Cluster ──

        /// <summary>查询集群状态（角色/LSN/从节点列表）。</summary>
        public JsonNode ClusterStatus() => Execute("cluster", "status");

        /// <summary>查询当前集群角色。</summary>
        public string ClusterRole()
        {
            var role = Execute("cluster", "role")["role"];
            if (role is null) return "Standalone";
            return role.GetValueKind() == JsonValueKind.String
                ? role.GetValue<string>()
                : role.ToJsonString();
        }

        /// <summary>将 Replica 提升为 Primary。</summary>
        public void ClusterPromote() => Execute("cluster", "promote");

        /// <summary>查询从节点列表。</summary>
        public JsonNode ClusterReplicas() => Execute("cluster", "replicas");

        // ── Ops ──

        /// <summary>获取数据库全局统计信息。</summary>
        public JsonNode DatabaseStats() => Execute("database_stats");

        /// <summary>执行健康检查。</summary>
        public JsonNode HealthCheck() => Execute("health_check");

        // ── Backup ──
        public long ExportDb(string dir, string[]? keyspaces = null)
        {
            var p = new Dictionary<string, object> { ["dir"] = dir };
            if (keyspaces != null) p["keyspaces"] = keyspaces;
            return Execute("backup", "export", p)["exported"]?.GetValue<long>() ?? 0;
        }

        public long ImportDb(string dir) =>
            Execute("backup", "import", new() { ["dir"] = dir })["imported"]?.GetValue<long>() ?? 0;

        // ── FTS ──

        public void FtsCreateIndex(string name) =>
            Execute("fts", "create_index", new() { ["name"] = name });

        public void FtsDropIndex(string name) =>
            Execute("fts", "drop_index", new() { ["name"] = name });

        public void FtsIndex(string name, string docId, Dictionary<string, string> fields) =>
            Execute("fts", "index", new() { ["name"] = name, ["doc_id"] = docId, ["fields"] = fields });

        public int FtsIndexBatch(string name, Dictionary<string, object>[] docs) =>
            Execute("fts", "index_batch", new() { ["name"] = name, ["docs"] = docs })
                ["count"]?.GetValue<int>() ?? 0;

        public bool FtsDelete(string name, string docId) =>
            Execute("fts", "delete", new() { ["name"] = name, ["doc_id"] = docId })
                ["deleted"]?.GetValue<bool>() ?? false;

        public JsonNode FtsGet(string name, string docId) =>
            Execute("fts", "get", new() { ["name"] = name, ["doc_id"] = docId });

        public JsonNode FtsSearch(string name, string query, int limit = 10) =>
            Execute("fts", "search", new() { ["name"] = name, ["query"] = query, ["limit"] = limit });

        public JsonNode FtsSearchFuzzy(string name, string query, int maxDist = 1, int limit = 10) =>
            Execute("fts", "search_fuzzy", new()
            {
                ["name"] = name, ["query"] = query,
                ["max_dist"] = maxDist, ["limit"] = limit
            });

        public JsonNode FtsHybridSearch(string ftsIdx, string vecIdx,
            string query, float[] vector, Dictionary<string, object>? opts = null)
        {
            var p = new Dictionary<string, object>
            {
                ["name"] = ftsIdx, ["vec_index"] = vecIdx,
                ["query"] = query, ["vector"] = vector
            };
            if (opts != null) foreach (var kv in opts) p[kv.Key] = kv.Value;
            return Execute("fts", "hybrid_search", p);
        }

        public void FtsAddAlias(string alias, string index) =>
            Execute("fts", "add_alias", new() { ["alias"] = alias, ["index"] = index });

        public void FtsRemoveAlias(string alias) =>
            Execute("fts", "remove_alias", new() { ["alias"] = alias });

        public long FtsReindex(string name) =>
            Execute("fts", "reindex", new() { ["name"] = name })["reindexed"]?.GetValue<long>() ?? 0;

        public void FtsCloseIndex(string name) =>
            Execute("fts", "close_index", new() { ["name"] = name });

        public void FtsOpenIndex(string name) =>
            Execute("fts", "open_index", new() { ["name"] = name });

        public JsonNode FtsGetMapping(string name) =>
            Execute("fts", "get_mapping", new() { ["name"] = name });

        public JsonNode FtsListIndexes() => Execute("fts", "list_indexes");

        // ── Geo ──

        public void GeoCreate(string name) =>
            Execute("geo", "create", new() { ["name"] = name });

        public void GeoAdd(string name, string key, double lng, double lat) =>
            Execute("geo", "add", new() { ["name"] = name, ["key"] = key, ["lng"] = lng, ["lat"] = lat });

        public int GeoAddBatch(string name, Dictionary<string, object>[] members) =>
            Execute("geo", "add_batch", new() { ["name"] = name, ["members"] = members })
                ["count"]?.GetValue<int>() ?? 0;

        public JsonNode GeoPos(string name, string key) =>
            Execute("geo", "pos", new() { ["name"] = name, ["key"] = key });

        public bool GeoDel(string name, string key) =>
            Execute("geo", "del", new() { ["name"] = name, ["key"] = key })
                ["deleted"]?.GetValue<bool>() ?? false;

        public JsonNode GeoDist(string name, string key1, string key2, string unit = "m") =>
            Execute("geo", "dist", new()
            {
                ["name"] = name, ["key1"] = key1, ["key2"] = key2, ["unit"] = unit
            });

        public JsonNode GeoSearch(string name, double lng, double lat,
            double radius, string unit = "m", int? count = null)
        {
            var p = new Dictionary<string, object>
            {
                ["name"] = name, ["lng"] = lng, ["lat"] = lat,
                ["radius"] = radius, ["unit"] = unit
            };
            if (count.HasValue) p["count"] = count.Value;
            return Execute("geo", "search", p);
        }

        public JsonNode GeoSearchBox(string name, double minLng, double minLat,
            double maxLng, double maxLat, int? count = null)
        {
            var p = new Dictionary<string, object>
            {
                ["name"] = name, ["min_lng"] = minLng, ["min_lat"] = minLat,
                ["max_lng"] = maxLng, ["max_lat"] = maxLat
            };
            if (count.HasValue) p["count"] = count.Value;
            return Execute("geo", "search_box", p);
        }

        public JsonNode GeoFence(string name, string key, double centerLng,
            double centerLat, double radius, string unit = "m") =>
            Execute("geo", "fence", new()
            {
                ["name"] = name, ["key"] = key,
                ["center_lng"] = centerLng, ["center_lat"] = centerLat,
                ["radius"] = radius, ["unit"] = unit
            });

        public string[] GeoMembers(string name)
        {
            var data = Execute("geo", "members", new() { ["name"] = name });
            var arr = data["members"]?.AsArray();
            if (arr == null) return Array.Empty<string>();
            return arr.Select(v => v?.GetValue<string>() ?? "").ToArray();
        }

        // ── Graph ──

        public void GraphCreate(string graph) =>
            Execute("graph", "create", new() { ["graph"] = graph });

        public long GraphAddVertex(string graph, string label,
            Dictionary<string, string>? properties = null)
        {
            var p = new Dictionary<string, object> { ["graph"] = graph, ["label"] = label };
            if (properties != null) p["properties"] = properties;
            return Execute("graph", "add_vertex", p)["vertex_id"]?.GetValue<long>() ?? 0;
        }

        public JsonNode GraphGetVertex(string graph, long id) =>
            Execute("graph", "get_vertex", new() { ["graph"] = graph, ["id"] = id });

        public void GraphUpdateVertex(string graph, long id,
            Dictionary<string, string> properties) =>
            Execute("graph", "update_vertex", new()
            {
                ["graph"] = graph, ["id"] = id, ["properties"] = properties
            });

        public void GraphDeleteVertex(string graph, long id) =>
            Execute("graph", "delete_vertex", new() { ["graph"] = graph, ["id"] = id });

        public long GraphAddEdge(string graph, long from, long to,
            string label, Dictionary<string, string>? properties = null)
        {
            var p = new Dictionary<string, object>
            {
                ["graph"] = graph, ["from"] = from, ["to"] = to, ["label"] = label
            };
            if (properties != null) p["properties"] = properties;
            return Execute("graph", "add_edge", p)["edge_id"]?.GetValue<long>() ?? 0;
        }

        public JsonNode GraphGetEdge(string graph, long id) =>
            Execute("graph", "get_edge", new() { ["graph"] = graph, ["id"] = id });

        public void GraphDeleteEdge(string graph, long id) =>
            Execute("graph", "delete_edge", new() { ["graph"] = graph, ["id"] = id });

        public JsonNode GraphNeighbors(string graph, long id, string direction = "out") =>
            Execute("graph", "neighbors", new()
            {
                ["graph"] = graph, ["id"] = id, ["direction"] = direction
            });

        public JsonNode GraphOutEdges(string graph, long id) =>
            Execute("graph", "out_edges", new() { ["graph"] = graph, ["id"] = id });

        public JsonNode GraphInEdges(string graph, long id) =>
            Execute("graph", "in_edges", new() { ["graph"] = graph, ["id"] = id });

        public JsonNode GraphVerticesByLabel(string graph, string label) =>
            Execute("graph", "vertices_by_label", new() { ["graph"] = graph, ["label"] = label });

        public long GraphVertexCount(string graph) =>
            Execute("graph", "vertex_count", new() { ["graph"] = graph })
                ["count"]?.GetValue<long>() ?? 0;

        public long GraphEdgeCount(string graph) =>
            Execute("graph", "edge_count", new() { ["graph"] = graph })
                ["count"]?.GetValue<long>() ?? 0;

        public JsonNode GraphBfs(string graph, long start, int maxDepth = 3,
            string direction = "out") =>
            Execute("graph", "bfs", new()
            {
                ["graph"] = graph, ["start"] = start,
                ["max_depth"] = maxDepth, ["direction"] = direction
            });

        public JsonNode GraphShortestPath(string graph, long from, long to,
            int maxDepth = 10) =>
            Execute("graph", "shortest_path", new()
            {
                ["graph"] = graph, ["from"] = from, ["to"] = to, ["max_depth"] = maxDepth
            });

        public JsonNode GraphWeightedShortestPath(string graph, long from, long to,
            int maxDepth = 10, string weightKey = "weight") =>
            Execute("graph", "weighted_shortest_path", new()
            {
                ["graph"] = graph, ["from"] = from, ["to"] = to,
                ["max_depth"] = maxDepth, ["weight_key"] = weightKey
            });

        public JsonNode GraphDegreeCentrality(string graph, int limit = 10) =>
            Execute("graph", "degree_centrality", new() { ["graph"] = graph, ["limit"] = limit });

        public JsonNode GraphPagerank(string graph, double damping = 0.85,
            int iterations = 20, int limit = 10) =>
            Execute("graph", "pagerank", new()
            {
                ["graph"] = graph, ["damping"] = damping,
                ["iterations"] = iterations, ["limit"] = limit
            });
    }
}
