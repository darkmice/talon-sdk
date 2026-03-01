package io.talon;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.sun.jna.Pointer;
import com.sun.jna.ptr.PointerByReference;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Talon 数据库客户端（嵌入式模式）。
 *
 * <p>通过 JNA 调用 talon_execute C ABI，零编译依赖。</p>
 *
 * <pre>{@code
 * try (Talon db = new Talon("./my_data")) {
 *     db.sql("CREATE TABLE t (id INT, name TEXT)");
 *     db.kvSet("key", "value", null);
 * }
 * }</pre>
 */
public class Talon implements AutoCloseable {

    private static final Gson GSON = new Gson();
    private static final NativeLib LIB = NativeLib.INSTANCE;
    private Pointer handle;

    /** 打开数据库。 */
    public Talon(String path) {
        handle = LIB.talon_open(path);
        if (handle == null) {
            throw new TalonException("无法打开数据库: " + path);
        }
    }

    private JsonElement execute(String module, String action,
                                Map<String, Object> params) {
        if (handle == null) {
            throw new TalonException("数据库已关闭");
        }
        Map<String, Object> cmd = new HashMap<>();
        cmd.put("module", module);
        cmd.put("action", action != null ? action : "");
        cmd.put("params", params != null ? params : new HashMap<>());

        PointerByReference outRef = new PointerByReference();
        int rc = LIB.talon_execute(handle, GSON.toJson(cmd), outRef);
        if (rc != 0) {
            throw new TalonException("talon_execute 调用失败");
        }
        Pointer outPtr = outRef.getValue();
        if (outPtr == null) {
            throw new TalonException("talon_execute 返回空指针");
        }
        String outStr;
        try {
            outStr = outPtr.getString(0, "UTF-8");
        } finally {
            LIB.talon_free_string(outPtr);
        }
        JsonObject result = GSON.fromJson(outStr, JsonObject.class);
        if (!result.get("ok").getAsBoolean()) {
            String err = result.has("error")
                ? result.get("error").getAsString() : "未知错误";
            throw new TalonException(err);
        }
        return result.has("data") ? result.get("data") : new JsonObject();
    }

    private JsonElement execute(String module) {
        return execute(module, null, null);
    }

    private JsonElement execute(String module, String action) {
        return execute(module, action, null);
    }

    @Override
    public void close() {
        if (handle != null) {
            LIB.talon_close(handle);
            handle = null;
        }
    }

    /** 刷盘。 */
    public void persist() {
        if (handle == null) throw new TalonException("数据库已关闭");
        if (LIB.talon_persist(handle) != 0) {
            throw new TalonException("persist 失败");
        }
    }

    /** 获取引擎统计信息。 */
    public JsonElement stats() { return execute("stats"); }

    // ── SQL ──

    /** 执行 SQL 语句。 */
    public JsonElement sql(String query) {
        return execute("sql", "", Map.of("sql", query));
    }

    // ── KV ──

    public void kvSet(String key, String value, Long ttl) {
        Map<String, Object> p = new HashMap<>();
        p.put("key", key); p.put("value", value);
        if (ttl != null) p.put("ttl", ttl);
        execute("kv", "set", p);
    }

    public String kvGet(String key) {
        JsonElement v = execute("kv", "get", Map.of("key", key))
            .getAsJsonObject().get("value");
        return v.isJsonNull() ? null : v.getAsString();
    }

    public boolean kvDel(String key) {
        return execute("kv", "del", Map.of("key", key))
            .getAsJsonObject().get("deleted").getAsBoolean();
    }

    public boolean kvExists(String key) {
        return execute("kv", "exists", Map.of("key", key))
            .getAsJsonObject().get("exists").getAsBoolean();
    }

    public long kvIncr(String key) {
        return execute("kv", "incr", Map.of("key", key))
            .getAsJsonObject().get("value").getAsLong();
    }

    public JsonElement kvKeys(String prefix) {
        return execute("kv", "keys", Map.of("prefix", prefix));
    }

    public void kvMset(List<String> keys, List<String> values) {
        Map<String, Object> p = new HashMap<>();
        p.put("keys", keys); p.put("values", values);
        execute("kv", "mset", p);
    }

    public JsonElement kvMget(List<String> keys) {
        return execute("kv", "mget", Map.of("keys", keys));
    }

    public JsonElement kvKeysMatch(String pattern) {
        return execute("kv", "keys_match", Map.of("pattern", pattern));
    }

    public void kvExpire(String key, long seconds) {
        execute("kv", "expire", Map.of("key", key, "seconds", seconds));
    }

    public JsonElement kvTtl(String key) {
        return execute("kv", "ttl", Map.of("key", key));
    }

    // ── TS ──

    public void tsCreate(String name, List<String> tags, List<String> fields) {
        execute("ts", "create", Map.of(
            "name", name,
            "tags", tags != null ? tags : List.of(),
            "fields", fields != null ? fields : List.of()));
    }

    public void tsInsert(String name, Map<String, Object> point) {
        execute("ts", "insert", Map.of("name", name, "point", point));
    }

    public JsonElement tsQuery(String name, Map<String, Object> opts) {
        Map<String, Object> p = opts != null ? new HashMap<>(opts) : new HashMap<>();
        p.put("name", name);
        return execute("ts", "query", p);
    }

    public JsonElement tsAggregate(String name, String field,
                                   String func, Map<String, Object> opts) {
        Map<String, Object> p = opts != null ? new HashMap<>(opts) : new HashMap<>();
        p.put("name", name); p.put("field", field); p.put("func", func);
        return execute("ts", "aggregate", p);
    }

    public void tsSetRetention(String name, long retentionMs) {
        execute("ts", "set_retention",
            Map.of("name", name, "retention_ms", retentionMs));
    }

    public long tsPurgeExpired(String name) {
        return execute("ts", "purge_expired", Map.of("name", name))
            .getAsJsonObject().get("purged").getAsLong();
    }

    public long tsPurgeByTag(String name, List<List<String>> tagFilters) {
        return execute("ts", "purge_by_tag",
            Map.of("name", name, "tag_filters", tagFilters))
            .getAsJsonObject().get("purged").getAsLong();
    }

    // ── MQ ──

    public void mqCreate(String topic, long maxLen) {
        execute("mq", "create", Map.of("topic", topic, "max_len", maxLen));
    }

    public long mqPublish(String topic, String payload) {
        return execute("mq", "publish",
            Map.of("topic", topic, "payload", payload))
            .getAsJsonObject().get("id").getAsLong();
    }

    public JsonElement mqPoll(String topic, String group,
                              String consumer, int count) {
        return mqPoll(topic, group, consumer, count, 0);
    }

    public JsonElement mqPoll(String topic, String group,
                              String consumer, int count, long blockMs) {
        Map<String, Object> p = new HashMap<>();
        p.put("topic", topic); p.put("group", group);
        p.put("consumer", consumer); p.put("count", count);
        p.put("block_ms", blockMs);
        return execute("mq", "poll", p);
    }

    public void mqAck(String topic, String group,
                      String consumer, long messageId) {
        execute("mq", "ack", Map.of(
            "topic", topic, "group", group,
            "consumer", consumer, "message_id", messageId));
    }

    public long mqLen(String topic) {
        return execute("mq", "len", Map.of("topic", topic))
            .getAsJsonObject().get("len").getAsLong();
    }

    public void mqDrop(String topic) {
        execute("mq", "drop", Map.of("topic", topic));
    }

    public void mqSubscribe(String topic, String group) {
        execute("mq", "subscribe", Map.of("topic", topic, "group", group));
    }

    public void mqUnsubscribe(String topic, String group) {
        execute("mq", "unsubscribe", Map.of("topic", topic, "group", group));
    }

    public String[] mqListSubscriptions(String topic) {
        JsonElement data = execute("mq", "list_subscriptions", Map.of("topic", topic));
        JsonArray arr = data.getAsJsonObject().get("groups").getAsJsonArray();
        String[] groups = new String[arr.size()];
        for (int i = 0; i < arr.size(); i++) {
            groups[i] = arr.get(i).getAsString();
        }
        return groups;
    }

    // ── Vector ──

    public void vectorInsert(String name, long id, float[] vector) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name); p.put("id", id); p.put("vector", vector);
        execute("vector", "insert", p);
    }

    public JsonElement vectorSearch(String name, float[] vector,
                                    int k, String metric) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name); p.put("vector", vector);
        p.put("k", k); p.put("metric", metric != null ? metric : "cosine");
        return execute("vector", "search", p);
    }

    public void vectorDelete(String name, long id) {
        execute("vector", "delete", Map.of("name", name, "id", id));
    }

    public long vectorCount(String name) {
        return execute("vector", "count", Map.of("name", name))
            .getAsJsonObject().get("count").getAsLong();
    }

    public long vectorBatchInsert(String name, List<Map<String, Object>> items) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name); p.put("items", items);
        return execute("vector", "batch_insert", p)
            .getAsJsonObject().get("inserted").getAsLong();
    }

    public JsonElement vectorBatchSearch(String name, float[][] vectors,
                                         int k, String metric) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name); p.put("vectors", vectors);
        p.put("k", k); p.put("metric", metric != null ? metric : "cosine");
        return execute("vector", "batch_search", p);
    }

    /** 设置向量索引运行时搜索宽度 ef_search。 */
    public void vectorSetEfSearch(String name, int efSearch) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name); p.put("ef_search", efSearch);
        execute("vector", "set_ef_search", p);
    }

    // ── AI ──

    public void aiCreateSession(String id, Map<String, String> metadata,
                                Long ttl) {
        Map<String, Object> p = new HashMap<>();
        p.put("id", id);
        if (metadata != null) p.put("metadata", metadata);
        if (ttl != null) p.put("ttl", ttl);
        execute("ai", "create_session", p);
    }

    public JsonElement aiGetSession(String id) {
        return execute("ai", "get_session", Map.of("id", id));
    }

    public JsonElement aiListSessions() {
        return execute("ai", "list_sessions");
    }

    public void aiDeleteSession(String id) {
        execute("ai", "delete_session", Map.of("id", id));
    }

    public void aiUpdateSession(String id, Map<String, String> metadata) {
        execute("ai", "update_session", Map.of("id", id, "metadata", metadata));
    }

    public long aiClearContext(String sessionId) {
        return execute("ai", "clear_context", Map.of("session_id", sessionId))
            .getAsJsonObject().get("purged").getAsLong();
    }

    public void aiAppendMessage(String sessionId, Map<String, Object> message) {
        execute("ai", "append_message",
            Map.of("session_id", sessionId, "message", message));
    }

    public JsonElement aiGetHistory(String sessionId, Integer limit) {
        Map<String, Object> p = new HashMap<>();
        p.put("session_id", sessionId);
        if (limit != null) p.put("limit", limit);
        return execute("ai", "get_history", p);
    }

    public JsonElement aiGetContextWindow(String sessionId, int maxTokens) {
        return execute("ai", "get_context_window",
            Map.of("session_id", sessionId, "max_tokens", maxTokens));
    }

    public JsonElement aiGetRecentMessages(String sessionId, int n) {
        return execute("ai", "get_recent_messages",
            Map.of("session_id", sessionId, "n", n));
    }

    public void aiStoreMemory(Map<String, Object> entry, float[] embedding) {
        Map<String, Object> p = new HashMap<>();
        p.put("entry", entry); p.put("embedding", embedding);
        execute("ai", "store_memory", p);
    }

    public JsonElement aiSearchMemory(float[] embedding, int k) {
        Map<String, Object> p = new HashMap<>();
        p.put("embedding", embedding); p.put("k", k);
        return execute("ai", "search_memory", p);
    }

    public void aiDeleteMemory(long id) {
        execute("ai", "delete_memory", Map.of("id", id));
    }

    public long aiMemoryCount() {
        return execute("ai", "memory_count")
            .getAsJsonObject().get("count").getAsLong();
    }

    public void aiUpdateMemory(long id, String content,
                               Map<String, String> metadata) {
        Map<String, Object> p = new HashMap<>();
        p.put("id", id);
        if (content != null) p.put("content", content);
        if (metadata != null) p.put("metadata", metadata);
        execute("ai", "update_memory", p);
    }

    public void aiStoreMemoriesBatch(List<Map<String, Object>> entries,
                                     List<float[]> embeddings) {
        execute("ai", "store_memories_batch",
            Map.of("entries", entries, "embeddings", embeddings));
    }

    public void aiLogTrace(Map<String, Object> record) {
        execute("ai", "log_trace", Map.of("record", record));
    }

    public long aiTokenUsage(String sessionId) {
        return execute("ai", "token_usage", Map.of("session_id", sessionId))
            .getAsJsonObject().get("total_tokens").getAsLong();
    }

    public long aiTokenUsageByRun(String runId) {
        return execute("ai", "token_usage_by_run", Map.of("run_id", runId))
            .getAsJsonObject().get("total_tokens").getAsLong();
    }

    // ── Cluster ──

    /** 查询集群状态（角色/LSN/从节点列表）。 */
    public JsonElement clusterStatus() { return execute("cluster", "status"); }

    /** 查询当前集群角色。 */
    public String clusterRole() {
        JsonElement role = execute("cluster", "role")
            .getAsJsonObject().get("role");
        return role.isJsonPrimitive() ? role.getAsString() : role.toString();
    }

    /** 将 Replica 提升为 Primary。 */
    public void clusterPromote() { execute("cluster", "promote"); }

    /** 查询从节点列表。 */
    public JsonElement clusterReplicas() { return execute("cluster", "replicas"); }

    // ── Ops ──

    /** 获取数据库全局统计信息。 */
    public JsonElement databaseStats() { return execute("database_stats"); }

    /** 执行健康检查。 */
    public JsonElement healthCheck() { return execute("health_check"); }

    // ── Backup ──

    public long exportDb(String dir, List<String> keyspaces) {
        Map<String, Object> p = new HashMap<>();
        p.put("dir", dir);
        if (keyspaces != null) p.put("keyspaces", keyspaces);
        return execute("backup", "export", p)
            .getAsJsonObject().get("exported").getAsLong();
    }

    public long importDb(String dir) {
        return execute("backup", "import", Map.of("dir", dir))
            .getAsJsonObject().get("imported").getAsLong();
    }
}
