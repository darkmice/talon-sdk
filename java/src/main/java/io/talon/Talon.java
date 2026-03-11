/*
 * Copyright (c) 2026 Talon Contributors
 * Author: dark.lijin@gmail.com
 * Licensed under the Talon Community Dual License Agreement.
 * See the LICENSE file in the project root for full license information.
 */
package io.talon;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
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

    public long kvIncrBy(String key, long delta) {
        return execute("kv", "incrby", Map.of("key", key, "delta", delta))
            .getAsJsonObject().get("value").getAsLong();
    }

    public long kvDecrBy(String key, long delta) {
        return execute("kv", "decrby", Map.of("key", key, "delta", delta))
            .getAsJsonObject().get("value").getAsLong();
    }

    public boolean kvSetNx(String key, String value, Long ttl) {
        Map<String, Object> p = new HashMap<>();
        p.put("key", key); p.put("value", value);
        if (ttl != null) p.put("ttl", ttl);
        return execute("kv", "setnx", p)
            .getAsJsonObject().get("set").getAsBoolean();
    }

    public JsonElement kvKeysLimit(String prefix, long offset, long limit) {
        Map<String, Object> p = new HashMap<>();
        p.put("prefix", prefix); p.put("offset", offset); p.put("limit", limit);
        return execute("kv", "keys_limit", p);
    }

    public JsonElement kvScanLimit(String prefix, long offset, long limit) {
        Map<String, Object> p = new HashMap<>();
        p.put("prefix", prefix); p.put("offset", offset); p.put("limit", limit);
        return execute("kv", "scan_limit", p);
    }

    public long kvCount() {
        return execute("kv", "count")
            .getAsJsonObject().get("count").getAsLong();
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

    // ── AI: Session ──

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

    public JsonElement aiCreateSessionIfNotExists(String id,
        Map<String, String> metadata, Long ttl) {
        Map<String, Object> p = new HashMap<>();
        p.put("id", id);
        if (metadata != null) p.put("metadata", metadata);
        if (ttl != null) p.put("ttl", ttl);
        return execute("ai", "create_session_if_not_exists", p);
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

    public long aiCleanupExpiredSessions() {
        return execute("ai", "cleanup_expired_sessions")
            .getAsJsonObject().get("cleaned").getAsLong();
    }

    public void aiArchiveSession(String id) {
        execute("ai", "archive_session", Map.of("id", id));
    }

    public void aiUnarchiveSession(String id) {
        execute("ai", "unarchive_session", Map.of("id", id));
    }

    public JsonElement aiExportSession(String id) {
        return execute("ai", "export_session", Map.of("id", id));
    }

    public JsonElement aiSessionStats(String id) {
        return execute("ai", "session_stats", Map.of("id", id));
    }

    public void aiAddSessionTag(String id, String tag) {
        execute("ai", "add_session_tag", Map.of("id", id, "tag", tag));
    }

    public void aiRemoveSessionTag(String id, String tag) {
        execute("ai", "remove_session_tag", Map.of("id", id, "tag", tag));
    }

    public JsonElement aiListSessionsByTag(String tag) {
        return execute("ai", "list_sessions_by_tag", Map.of("tag", tag));
    }

    // ── AI: Context ──

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

    public JsonElement aiGetContextWindowWithPrompt(String sessionId, int maxTokens) {
        return execute("ai", "get_context_window_with_prompt",
            Map.of("session_id", sessionId, "max_tokens", maxTokens));
    }

    public JsonElement aiGetRecentMessages(String sessionId, int n) {
        return execute("ai", "get_recent_messages",
            Map.of("session_id", sessionId, "n", n));
    }

    public void aiSetSystemPrompt(String sessionId, String prompt, int tokenCount) {
        Map<String, Object> p = new HashMap<>();
        p.put("session_id", sessionId);
        p.put("prompt", prompt);
        p.put("token_count", tokenCount);
        execute("ai", "set_system_prompt", p);
    }

    public void aiSetContextSummary(String sessionId, String summary, int tokenCount) {
        Map<String, Object> p = new HashMap<>();
        p.put("session_id", sessionId);
        p.put("summary", summary);
        p.put("token_count", tokenCount);
        execute("ai", "set_context_summary", p);
    }

    public JsonElement aiGetContextSummary(String sessionId) {
        return execute("ai", "get_context_summary",
            Map.of("session_id", sessionId));
    }

    public JsonElement aiAutoSummarize(String sessionId, Integer maxTokens) {
        Map<String, Object> p = new HashMap<>();
        p.put("session_id", sessionId);
        if (maxTokens != null) p.put("max_tokens", maxTokens);
        return execute("ai", "auto_summarize", p);
    }

    // ── AI: Memory ──

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

    public JsonElement aiDeduplicateMemories(double threshold) {
        Map<String, Object> p = new HashMap<>();
        p.put("threshold", threshold);
        return execute("ai", "deduplicate_memories", p);
    }

    public long aiCleanupExpiredMemories() {
        return execute("ai", "cleanup_expired_memories")
            .getAsJsonObject().get("cleaned").getAsLong();
    }

    public JsonElement aiMemoryStats() {
        return execute("ai", "memory_stats");
    }

    // ── AI: RAG ──

    public void aiRagIngestDocument(Map<String, Object> document,
        List<Map<String, Object>> chunks, List<float[]> embeddings) {
        Map<String, Object> p = new HashMap<>();
        p.put("document", document);
        p.put("chunks", chunks);
        p.put("embeddings", embeddings);
        execute("ai", "rag_ingest_document", p);
    }

    public void aiRagIngestBatch(List<Map<String, Object>> documents) {
        execute("ai", "rag_ingest_batch", Map.of("documents", documents));
    }

    public JsonElement aiRagSearch(float[] queryEmbedding, int k,
                                   Map<String, Object> filter) {
        Map<String, Object> p = new HashMap<>();
        p.put("query_embedding", queryEmbedding); p.put("k", k);
        if (filter != null) p.put("filter", filter);
        return execute("ai", "rag_search", p);
    }

    public JsonElement aiRagGetDocument(String docId) {
        return execute("ai", "rag_get_document", Map.of("doc_id", docId));
    }

    public JsonElement aiRagListDocuments() {
        return execute("ai", "rag_list_documents");
    }

    public void aiRagDeleteDocument(String docId) {
        execute("ai", "rag_delete_document", Map.of("doc_id", docId));
    }

    public void aiRagUpdateDocument(String docId,
        List<Map<String, Object>> chunks, List<float[]> embeddings) {
        Map<String, Object> p = new HashMap<>();
        p.put("doc_id", docId);
        p.put("chunks", chunks);
        p.put("embeddings", embeddings);
        execute("ai", "rag_update_document", p);
    }

    public JsonElement aiRagDocumentVersions(String docId) {
        return execute("ai", "rag_document_versions", Map.of("doc_id", docId));
    }

    // ── AI: Agent ──

    public void aiAgentLogStep(String sessionId, Map<String, Object> step) {
        execute("ai", "agent_log_step",
            Map.of("session_id", sessionId, "step", step));
    }

    public JsonElement aiAgentGetSteps(String sessionId, String runId) {
        Map<String, Object> p = new HashMap<>();
        p.put("session_id", sessionId);
        if (runId != null) p.put("run_id", runId);
        return execute("ai", "agent_get_steps", p);
    }

    public void aiAgentCacheToolResult(String key, Object result, Long ttl) {
        Map<String, Object> p = new HashMap<>();
        p.put("key", key); p.put("result", result);
        if (ttl != null) p.put("ttl", ttl);
        execute("ai", "agent_cache_tool_result", p);
    }

    public JsonElement aiAgentGetToolCache(String key) {
        return execute("ai", "agent_get_tool_cache", Map.of("key", key));
    }

    // ── AI: Intent ──

    public JsonElement aiClassifyIntent(String query, float[] embedding) {
        Map<String, Object> p = new HashMap<>();
        p.put("query", query); p.put("embedding", embedding);
        return execute("ai", "classify_intent", p);
    }

    public void aiRegisterIntent(Map<String, Object> intent,
                                 List<float[]> embeddings) {
        execute("ai", "register_intent",
            Map.of("intent", intent, "embeddings", embeddings));
    }

    public JsonElement aiListIntents() {
        return execute("ai", "list_intents");
    }

    // ── AI: Trace ──

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

    public JsonElement aiTraceStats(String sessionId) {
        return execute("ai", "trace_stats", Map.of("session_id", sessionId));
    }

    public JsonElement aiTracePerformanceReport(String sessionId, String runId) {
        Map<String, Object> p = new HashMap<>();
        if (sessionId != null) p.put("session_id", sessionId);
        if (runId != null) p.put("run_id", runId);
        return execute("ai", "trace_performance_report", p);
    }

    public JsonElement aiQueryTraces(String sessionId, String runId,
                                     String operation, Integer limit) {
        Map<String, Object> p = new HashMap<>();
        if (sessionId != null) p.put("session_id", sessionId);
        if (runId != null) p.put("run_id", runId);
        if (operation != null) p.put("operation", operation);
        if (limit != null) p.put("limit", limit);
        return execute("ai", "query_traces", p);
    }

    // ── AI: Embedding Cache ──

    public JsonElement aiEmbeddingCacheGet(String key) {
        return execute("ai", "embedding_cache_get", Map.of("key", key));
    }

    public void aiEmbeddingCacheSet(String key, float[] embedding, Long ttl) {
        Map<String, Object> p = new HashMap<>();
        p.put("key", key); p.put("embedding", embedding);
        if (ttl != null) p.put("ttl", ttl);
        execute("ai", "embedding_cache_set", p);
    }

    // ── AI: Token Count ──

    public int aiTokenCount(String text, String encoding) {
        return execute("ai", "token_count",
            Map.of("text", text, "encoding", encoding != null ? encoding : "cl100k_base"))
            .getAsJsonObject().get("count").getAsInt();
    }

    // ── AI: LLM Config ──

    public void aiSetLlmConfig(Map<String, Object> config) {
        execute("ai", "set_llm_config", Map.of("config", config));
    }

    public JsonElement aiGetLlmConfig() {
        return execute("ai", "get_llm_config");
    }

    // ── AI: Auto Embed ──

    public JsonElement aiAutoEmbed(List<String> texts) {
        return execute("ai", "auto_embed", Map.of("texts", texts));
    }

    /** 清除 LLM 配置。 */
    public void aiClearLlmConfig() {
        execute("ai", "clear_llm_config");
    }

    /** 存储记忆（自动 embed + 向量写 + FTS 索引 + 缓存）。
     *
     *  自动完成以下操作：
     *  1. 调用 Embedding API 生成向量（自带 FNV 哈希缓存）
     *  2. 写入向量索引（语义搜索）
     *  3. 写入 FTS 索引（关键词搜索）
     *  4. 存储元数据到 KV
     *
     *  需要先调用 aiSetLlmConfig 配置 embed provider。 */
    public long aiAddMemory(String content,
                            Map<String, String> metadata, Long ttlSecs) {
        Map<String, Object> p = new HashMap<>();
        p.put("content", content);
        if (metadata != null) p.put("metadata", metadata);
        if (ttlSecs != null) p.put("ttl_secs", ttlSecs);
        return execute("ai", "add_memory", p)
            .getAsJsonObject().get("id").getAsLong();
    }

    /** 智能召回（hybrid search: BM25 + 向量，RRF 融合）。 */
    public JsonElement aiRecall(String query, int k,
                                double ftsWeight, double vecWeight) {
        Map<String, Object> p = new HashMap<>();
        p.put("query", query); p.put("k", k);
        p.put("fts_weight", ftsWeight); p.put("vec_weight", vecWeight);
        return execute("ai", "recall", p);
    }

    /** 向量搜索 + metadata 过滤。 */
    public JsonElement aiSearchMemoryWithFilter(float[] embedding, int k,
                                                 Map<String, String> filters) {
        Map<String, Object> p = new HashMap<>();
        p.put("embedding", embedding); p.put("k", k);
        if (filters != null) p.put("filters", filters);
        return execute("ai", "search_memory_with_filter", p);
    }

    /** 查找重复记忆对（不删除）。 */
    public JsonElement aiFindDuplicateMemories(double threshold) {
        Map<String, Object> p = new HashMap<>();
        p.put("threshold", threshold);
        return execute("ai", "find_duplicate_memories", p);
    }

    /** 分页列出记忆。 */
    public JsonElement aiListMemories(int offset, int limit) {
        Map<String, Object> p = new HashMap<>();
        p.put("offset", offset); p.put("limit", limit);
        return execute("ai", "list_memories", p);
    }

    /** 智能上下文窗口：超长时自动触发摘要压缩。 */
    public JsonElement aiGetContextWindowSmart(String sessionId, int maxTokens) {
        return execute("ai", "get_context_window_smart",
            Map.of("session_id", sessionId, "max_tokens", maxTokens));
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

    // ── FTS ──

    public void ftsCreateIndex(String name) {
        execute("fts", "create_index", Map.of("name", name));
    }

    public void ftsDropIndex(String name) {
        execute("fts", "drop_index", Map.of("name", name));
    }

    public void ftsIndex(String name, String docId, Map<String, String> fields) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name); p.put("doc_id", docId); p.put("fields", fields);
        execute("fts", "index", p);
    }

    public int ftsIndexBatch(String name, List<Map<String, Object>> docs) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name); p.put("docs", docs);
        return execute("fts", "index_batch", p)
            .getAsJsonObject().get("count").getAsInt();
    }

    public boolean ftsDelete(String name, String docId) {
        return execute("fts", "delete", Map.of("name", name, "doc_id", docId))
            .getAsJsonObject().get("deleted").getAsBoolean();
    }

    public JsonElement ftsGet(String name, String docId) {
        return execute("fts", "get", Map.of("name", name, "doc_id", docId));
    }

    public JsonElement ftsSearch(String name, String query, int limit) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name); p.put("query", query); p.put("limit", limit);
        return execute("fts", "search", p);
    }

    public JsonElement ftsSearchFuzzy(String name, String query, int maxDist, int limit) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name); p.put("query", query);
        p.put("max_dist", maxDist); p.put("limit", limit);
        return execute("fts", "search_fuzzy", p);
    }

    public JsonElement ftsHybridSearch(String ftsIdx, String vecIdx,
                                        String query, float[] vector,
                                        Map<String, Object> opts) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", ftsIdx); p.put("vec_index", vecIdx);
        p.put("query", query); p.put("vector", vector);
        if (opts != null) p.putAll(opts);
        return execute("fts", "hybrid_search", p);
    }

    public void ftsAddAlias(String alias, String index) {
        execute("fts", "add_alias", Map.of("alias", alias, "index", index));
    }

    public void ftsRemoveAlias(String alias) {
        execute("fts", "remove_alias", Map.of("alias", alias));
    }

    public long ftsReindex(String name) {
        return execute("fts", "reindex", Map.of("name", name))
            .getAsJsonObject().get("reindexed").getAsLong();
    }

    public void ftsCloseIndex(String name) {
        execute("fts", "close_index", Map.of("name", name));
    }

    public void ftsOpenIndex(String name) {
        execute("fts", "open_index", Map.of("name", name));
    }

    public JsonElement ftsGetMapping(String name) {
        return execute("fts", "get_mapping", Map.of("name", name));
    }

    public JsonElement ftsListIndexes() {
        return execute("fts", "list_indexes");
    }

    // ── Geo ──

    public void geoCreate(String name) {
        execute("geo", "create", Map.of("name", name));
    }

    public void geoAdd(String name, String key, double lng, double lat) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name); p.put("key", key);
        p.put("lng", lng); p.put("lat", lat);
        execute("geo", "add", p);
    }

    public int geoAddBatch(String name, List<Map<String, Object>> members) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name); p.put("members", members);
        return execute("geo", "add_batch", p)
            .getAsJsonObject().get("count").getAsInt();
    }

    public JsonElement geoPos(String name, String key) {
        return execute("geo", "pos", Map.of("name", name, "key", key));
    }

    public boolean geoDel(String name, String key) {
        return execute("geo", "del", Map.of("name", name, "key", key))
            .getAsJsonObject().get("deleted").getAsBoolean();
    }

    public JsonElement geoDist(String name, String key1, String key2, String unit) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name); p.put("key1", key1); p.put("key2", key2);
        p.put("unit", unit != null ? unit : "m");
        return execute("geo", "dist", p);
    }

    public JsonElement geoSearch(String name, double lng, double lat,
                                  double radius, String unit, Integer count) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name); p.put("lng", lng); p.put("lat", lat);
        p.put("radius", radius); p.put("unit", unit != null ? unit : "m");
        if (count != null) p.put("count", count);
        return execute("geo", "search", p);
    }

    public JsonElement geoSearchBox(String name, double minLng, double minLat,
                                     double maxLng, double maxLat, Integer count) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name); p.put("min_lng", minLng); p.put("min_lat", minLat);
        p.put("max_lng", maxLng); p.put("max_lat", maxLat);
        if (count != null) p.put("count", count);
        return execute("geo", "search_box", p);
    }

    public JsonElement geoFence(String name, String key, double centerLng,
                                 double centerLat, double radius, String unit) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name); p.put("key", key);
        p.put("center_lng", centerLng); p.put("center_lat", centerLat);
        p.put("radius", radius); p.put("unit", unit != null ? unit : "m");
        return execute("geo", "fence", p);
    }

    public String[] geoMembers(String name) {
        JsonElement data = execute("geo", "members", Map.of("name", name));
        JsonArray arr = data.getAsJsonObject().get("members").getAsJsonArray();
        String[] members = new String[arr.size()];
        for (int i = 0; i < arr.size(); i++) {
            members[i] = arr.get(i).getAsString();
        }
        return members;
    }

    // ── Graph ──

    public void graphCreate(String graph) {
        execute("graph", "create", Map.of("graph", graph));
    }

    public long graphAddVertex(String graph, String label,
                                Map<String, String> properties) {
        Map<String, Object> p = new HashMap<>();
        p.put("graph", graph); p.put("label", label);
        if (properties != null) p.put("properties", properties);
        return execute("graph", "add_vertex", p)
            .getAsJsonObject().get("vertex_id").getAsLong();
    }

    public JsonElement graphGetVertex(String graph, long id) {
        Map<String, Object> p = new HashMap<>();
        p.put("graph", graph); p.put("id", id);
        return execute("graph", "get_vertex", p);
    }

    public void graphUpdateVertex(String graph, long id,
                                   Map<String, String> properties) {
        Map<String, Object> p = new HashMap<>();
        p.put("graph", graph); p.put("id", id);
        if (properties != null) p.put("properties", properties);
        execute("graph", "update_vertex", p);
    }

    public void graphDeleteVertex(String graph, long id) {
        Map<String, Object> p = new HashMap<>();
        p.put("graph", graph); p.put("id", id);
        execute("graph", "delete_vertex", p);
    }

    public long graphAddEdge(String graph, long from, long to,
                              String label, Map<String, String> properties) {
        Map<String, Object> p = new HashMap<>();
        p.put("graph", graph); p.put("from", from);
        p.put("to", to); p.put("label", label);
        if (properties != null) p.put("properties", properties);
        return execute("graph", "add_edge", p)
            .getAsJsonObject().get("edge_id").getAsLong();
    }

    public JsonElement graphGetEdge(String graph, long id) {
        Map<String, Object> p = new HashMap<>();
        p.put("graph", graph); p.put("id", id);
        return execute("graph", "get_edge", p);
    }

    public void graphDeleteEdge(String graph, long id) {
        Map<String, Object> p = new HashMap<>();
        p.put("graph", graph); p.put("id", id);
        execute("graph", "delete_edge", p);
    }

    public JsonElement graphNeighbors(String graph, long id, String direction) {
        Map<String, Object> p = new HashMap<>();
        p.put("graph", graph); p.put("id", id);
        p.put("direction", direction != null ? direction : "out");
        return execute("graph", "neighbors", p);
    }

    public JsonElement graphOutEdges(String graph, long id) {
        Map<String, Object> p = new HashMap<>();
        p.put("graph", graph); p.put("id", id);
        return execute("graph", "out_edges", p);
    }

    public JsonElement graphInEdges(String graph, long id) {
        Map<String, Object> p = new HashMap<>();
        p.put("graph", graph); p.put("id", id);
        return execute("graph", "in_edges", p);
    }

    public JsonElement graphVerticesByLabel(String graph, String label) {
        return execute("graph", "vertices_by_label",
            Map.of("graph", graph, "label", label));
    }

    public long graphVertexCount(String graph) {
        return execute("graph", "vertex_count", Map.of("graph", graph))
            .getAsJsonObject().get("count").getAsLong();
    }

    public long graphEdgeCount(String graph) {
        return execute("graph", "edge_count", Map.of("graph", graph))
            .getAsJsonObject().get("count").getAsLong();
    }

    public JsonElement graphBfs(String graph, long start, int maxDepth, String direction) {
        Map<String, Object> p = new HashMap<>();
        p.put("graph", graph); p.put("start", start);
        p.put("max_depth", maxDepth);
        p.put("direction", direction != null ? direction : "out");
        return execute("graph", "bfs", p);
    }

    public JsonElement graphShortestPath(String graph, long from, long to, int maxDepth) {
        Map<String, Object> p = new HashMap<>();
        p.put("graph", graph); p.put("from", from);
        p.put("to", to); p.put("max_depth", maxDepth);
        return execute("graph", "shortest_path", p);
    }

    public JsonElement graphWeightedShortestPath(String graph, long from, long to,
                                                  int maxDepth, String weightKey) {
        Map<String, Object> p = new HashMap<>();
        p.put("graph", graph); p.put("from", from);
        p.put("to", to); p.put("max_depth", maxDepth);
        p.put("weight_key", weightKey != null ? weightKey : "weight");
        return execute("graph", "weighted_shortest_path", p);
    }

    public JsonElement graphDegreeCentrality(String graph, int limit) {
        return execute("graph", "degree_centrality",
            Map.of("graph", graph, "limit", limit));
    }

    public JsonElement graphPagerank(String graph, double damping,
                                      int iterations, int limit) {
        Map<String, Object> p = new HashMap<>();
        p.put("graph", graph); p.put("damping", damping);
        p.put("iterations", iterations); p.put("limit", limit);
        return execute("graph", "pagerank", p);
    }
}
