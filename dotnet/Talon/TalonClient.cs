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
    }
}
