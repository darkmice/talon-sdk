/*
 * Copyright (c) 2026 Talon Contributors
 * Author: dark.lijin@gmail.com
 * Licensed under the Talon Community Dual License Agreement.
 * See the LICENSE file in the project root for full license information.
 */
/**
 * Talon Node.js SDK — 通过 koffi 封装 talon_execute C ABI。
 * @module talon-db
 */

'use strict';

const koffi = require('koffi');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * 获取用户缓存目录。
 * @returns {string}
 */
function cacheDir() {
  const version = require('./package.json').version;
  const base = process.env.TALON_CACHE_DIR || (() => {
    const plat = os.platform();
    if (plat === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'talon');
    if (plat === 'win32') return path.join(process.env.LOCALAPPDATA || os.homedir(), 'talon', 'cache');
    return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'talon');
  })();
  return path.join(base, version);
}

/**
 * 获取平台信息。
 * @returns {{ libName: string, platDir: string, releaseName: string }}
 */
function platformInfo() {
  const plat = os.platform();
  const arch = os.arch();

  let libName, platArch;
  if (arch === 'arm64') platArch = 'arm64';
  else if (arch === 'loong64') platArch = 'loongarch64';
  else if (arch === 'riscv64') platArch = 'riscv64';
  else platArch = 'amd64';

  if (plat === 'darwin') {
    libName = 'libtalon.dylib';
  } else if (plat === 'win32') {
    libName = 'talon.dll';
  } else {
    libName = 'libtalon.so';
  }

  const platDir = plat === 'darwin' ? `darwin_${platArch}`
    : plat === 'win32' ? `windows_${platArch}` : `linux_${platArch}`;
  const releaseName = plat === 'darwin' ? `talon-macos-${platArch}`
    : plat === 'win32' ? `talon-windows-${platArch}` : `talon-linux-${platArch}`;

  return { libName, platDir, releaseName };
}

/**
 * 同步下载原生库到指定目录。
 * @param {string} destDir
 * @returns {string|null}
 */
function downloadLibSync(destDir) {
  const { execSync } = require('child_process');
  const { libName, releaseName } = platformInfo();
  const version = require('./package.json').version;
  const repo = 'darkmice/talon-bin';
  const archiveName = `libtalon-${releaseName}.tar.gz`;
  const url = `https://github.com/${repo}/releases/download/v${version}/${archiveName}`;
  const archivePath = path.join(destDir, archiveName);

  try {
    fs.mkdirSync(destDir, { recursive: true });
    console.log(`[talon] Downloading native library v${version} for ${releaseName}...`);
    execSync(`curl -fSL --retry 3 -o "${archivePath}" "${url}"`, { stdio: 'pipe' });

    // 校验下载大小
    const stat = fs.statSync(archivePath);
    if (stat.size < 1024) {
      console.warn('[talon] Warning: downloaded archive too small, likely corrupted');
      fs.unlinkSync(archivePath);
      return null;
    }

    execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, { stdio: 'pipe' });
    fs.unlinkSync(archivePath);

    const libPath = path.join(destDir, libName);
    if (fs.existsSync(libPath)) {
      console.log(`[talon] Native library ready: ${libPath}`);
      return libPath;
    }
    return null;
  } catch (err) {
    console.warn(`[talon] Failed to download native library: ${err.message}`);
    console.warn('[talon] Set TALON_LIB_PATH or run: npm run postinstall');
    if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
    return null;
  }
}

/**
 * 查找 libtalon 动态库路径。
 *
 * 搜索顺序：
 * 1. 手动指定的 libPath 参数
 * 2. TALON_LIB_PATH 环境变量
 * 3. npm 包内 native/ 目录（postinstall 下载）
 * 4. SDK 开发目录 lib/{platform}/
 * 5. 缓存目录（自动下载）
 * 6. 系统库路径 fallback
 *
 * @param {string} [libPath] - 手动指定路径
 * @returns {string}
 */
function findLib(libPath) {
  if (libPath && fs.existsSync(libPath)) return libPath;

  // 1. 环境变量
  const env = process.env.TALON_LIB_PATH;
  if (env && fs.existsSync(env)) return env;

  const { libName, platDir } = platformInfo();

  // 2. npm 包内 native/ 目录 (postinstall 下载)
  const nativeDir = path.join(__dirname, 'native', libName);
  if (fs.existsSync(nativeDir)) return nativeDir;

  // 3. SDK 开发目录: talon-sdk/lib/{platform}/
  const sdkRoot = path.resolve(__dirname, '..');
  const bundled = path.join(sdkRoot, 'lib', platDir, libName);
  if (fs.existsSync(bundled)) return bundled;

  // 4. 同目录
  const local = path.join(__dirname, libName);
  if (fs.existsSync(local)) return local;

  // 5. 缓存目录（自动下载）
  const cache = cacheDir();
  const cached = path.join(cache, libName);
  if (fs.existsSync(cached)) return cached;

  // 尝试自动下载
  const downloaded = downloadLibSync(cache);
  if (downloaded) return downloaded;

  // 6. Fallback 到系统路径
  return libName;
}

/**
 * 将 Talon Value 枚举解包为 JS 原生类型。
 * {"Text":"hi"} → "hi", {"Integer":42} → 42, "Null" → null, etc.
 */
function unwrapValue(v) {
  if (v === null || v === undefined || v === 'Null') return null;
  if (typeof v !== 'object') return v;
  const keys = Object.keys(v);
  if (keys.length === 1) {
    const inner = v[keys[0]];
    if (keys[0] === 'Blob' && Array.isArray(inner)) return Buffer.from(inner);
    return inner;
  }
  return v;
}

function unwrapRows(rows) {
  return rows.map(row => row.map(unwrapValue));
}

class TalonError extends Error {
  constructor(msg) { super(msg); this.name = 'TalonError'; }
}

class Talon {
  /**
   * 打开数据库。
   * @param {string} dbPath - 数据目录路径
   * @param {string} [libPath] - libtalon 动态库路径（可选）
   */
  constructor(dbPath, libPath) {
    const lib = koffi.load(findLib(libPath));
    this._talon_open = lib.func('talon_open', 'void *', ['str']);
    this._talon_close = lib.func('talon_close', 'void', ['void *']);
    this._talon_execute = lib.func('talon_execute', 'int', ['void *', 'str', '_Out_ char **']);
    this._talon_free_string = lib.func('talon_free_string', 'void', ['void *']);
    this._talon_persist = lib.func('talon_persist', 'int', ['void *']);
    this._lib = lib;

    this._handle = this._talon_open(dbPath);
    if (!this._handle) {
      throw new TalonError(`无法打开数据库: ${dbPath}`);
    }
  }

  /**
   * 执行通用命令。
   * @param {string} module
   * @param {string} [action='']
   * @param {object} [params={}]
   * @returns {object} data 字段
   */
  _execute(module, action = '', params = {}) {
    if (!this._handle) {
      throw new TalonError('数据库已关闭');
    }
    const cmd = JSON.stringify({ module, action, params });
    const outBuf = [null];
    const rc = this._talon_execute(this._handle, cmd, outBuf);
    if (rc !== 0) throw new TalonError('talon_execute 调用失败');
    const outPtr = outBuf[0];
    let result;
    try {
      result = JSON.parse(koffi.decode(outPtr, 'char', -1));
    } finally {
      this._talon_free_string(outPtr);
    }
    if (!result.ok) throw new TalonError(result.error || '未知错误');
    return result.data || {};
  }

  /** 关闭数据库。 */
  close() {
    if (this._handle) {
      this._talon_close(this._handle);
      this._handle = null;
    }
  }

  /** 刷盘。 */
  persist() {
    if (!this._handle) throw new TalonError('数据库已关闭');
    if (this._talon_persist(this._handle) !== 0) {
      throw new TalonError('persist 失败');
    }
  }

  /** 获取引擎统计信息。 */
  stats() { return this._execute('stats'); }

  // ── SQL ──
  sql(query) { return unwrapRows(this._execute('sql', '', { sql: query }).rows || []); }

  // ── KV ──
  kvSet(key, value, ttl) {
    const p = { key, value }; if (ttl != null) p.ttl = ttl;
    this._execute('kv', 'set', p);
  }
  kvGet(key) { return this._execute('kv', 'get', { key }).value; }
  kvDel(key) { return this._execute('kv', 'del', { key }).deleted || false; }
  kvExists(key) { return this._execute('kv', 'exists', { key }).exists || false; }
  kvIncr(key) { return this._execute('kv', 'incr', { key }).value || 0; }
  kvKeys(prefix = '') { return this._execute('kv', 'keys', { prefix }).keys || []; }
  kvMset(keys, values) { this._execute('kv', 'mset', { keys, values }); }
  kvMget(keys) { return this._execute('kv', 'mget', { keys }).values || []; }
  kvKeysMatch(pattern) { return this._execute('kv', 'keys_match', { pattern }).keys || []; }
  kvExpire(key, seconds) { this._execute('kv', 'expire', { key, seconds }); }
  kvTtl(key) { return this._execute('kv', 'ttl', { key }).ttl; }

  kvIncrBy(key, delta) { return this._execute('kv', 'incrby', { key, delta }).value || 0; }
  kvDecrBy(key, delta) { return this._execute('kv', 'decrby', { key, delta }).value || 0; }
  kvSetNx(key, value, ttl) {
    const p = { key, value }; if (ttl != null) p.ttl = ttl;
    return this._execute('kv', 'setnx', p).set || false;
  }
  kvKeysLimit(prefix = '', offset = 0, limit = 100) {
    return this._execute('kv', 'keys_limit', { prefix, offset, limit }).keys || [];
  }
  kvScanLimit(prefix = '', offset = 0, limit = 100) {
    return this._execute('kv', 'scan_limit', { prefix, offset, limit });
  }
  kvCount() { return this._execute('kv', 'count').count || 0; }

  // ── TS ──
  tsCreate(name, tags = [], fields = []) {
    this._execute('ts', 'create', { name, tags, fields });
  }
  tsInsert(name, point) { this._execute('ts', 'insert', { name, point }); }
  tsQuery(name, opts = {}) {
    const p = { name, ...opts };
    return this._execute('ts', 'query', p).points || [];
  }
  tsAggregate(name, field, func, opts = {}) {
    return this._execute('ts', 'aggregate', { name, field, func, ...opts }).buckets || [];
  }
  tsSetRetention(name, retentionMs) {
    this._execute('ts', 'set_retention', { name, retention_ms: retentionMs });
  }
  tsPurgeExpired(name) {
    return this._execute('ts', 'purge_expired', { name }).purged || 0;
  }
  tsPurgeByTag(name, tagFilters) {
    return this._execute('ts', 'purge_by_tag', { name, tag_filters: tagFilters }).purged || 0;
  }

  // ── MQ ──
  mqCreate(topic, maxLen = 0) { this._execute('mq', 'create', { topic, max_len: maxLen }); }
  mqPublish(topic, payload) { return this._execute('mq', 'publish', { topic, payload }).id || 0; }
  mqPoll(topic, group, consumer, count = 1, blockMs = 0) {
    return this._execute('mq', 'poll', { topic, group, consumer, count, block_ms: blockMs }).messages || [];
  }
  mqAck(topic, group, consumer, messageId) {
    this._execute('mq', 'ack', { topic, group, consumer, message_id: messageId });
  }
  mqLen(topic) { return this._execute('mq', 'len', { topic }).len || 0; }
  mqDrop(topic) { this._execute('mq', 'drop', { topic }); }
  mqSubscribe(topic, group) { this._execute('mq', 'subscribe', { topic, group }); }
  mqUnsubscribe(topic, group) { this._execute('mq', 'unsubscribe', { topic, group }); }
  mqListSubscriptions(topic) { return this._execute('mq', 'list_subscriptions', { topic }).groups || []; }

  // ── Vector ──
  vectorInsert(name, id, vector) {
    this._execute('vector', 'insert', { name, id, vector });
  }
  vectorSearch(name, vector, k = 10, metric = 'cosine') {
    return this._execute('vector', 'search', { name, vector, k, metric }).results || [];
  }
  vectorDelete(name, id) { this._execute('vector', 'delete', { name, id }); }
  vectorCount(name) { return this._execute('vector', 'count', { name }).count || 0; }
  vectorBatchInsert(name, items) {
    return this._execute('vector', 'batch_insert', { name, items }).inserted || 0;
  }
  vectorBatchSearch(name, vectors, k = 10, metric = 'cosine') {
    return this._execute('vector', 'batch_search', { name, vectors, k, metric }).results || [];
  }
  /** 设置向量索引运行时搜索宽度 ef_search。 */
  vectorSetEfSearch(name, efSearch) {
    this._execute('vector', 'set_ef_search', { name, ef_search: efSearch });
  }

  // ── AI: Session ──
  aiCreateSession(id, metadata, ttl) {
    const p = { id }; if (metadata) p.metadata = metadata; if (ttl != null) p.ttl = ttl;
    this._execute('ai', 'create_session', p);
  }
  aiGetSession(id) { return this._execute('ai', 'get_session', { id }).session || {}; }
  aiCreateSessionIfNotExists(id, metadata, ttl) {
    const p = { id }; if (metadata) p.metadata = metadata; if (ttl != null) p.ttl = ttl;
    return this._execute('ai', 'create_session_if_not_exists', p);
  }
  aiListSessions() { return this._execute('ai', 'list_sessions').sessions || []; }
  aiDeleteSession(id) { this._execute('ai', 'delete_session', { id }); }
  aiUpdateSession(id, metadata) {
    this._execute('ai', 'update_session', { id, metadata });
  }
  aiCleanupExpiredSessions() {
    return this._execute('ai', 'cleanup_expired_sessions').cleaned || 0;
  }
  aiArchiveSession(id) { this._execute('ai', 'archive_session', { id }); }
  aiUnarchiveSession(id) { this._execute('ai', 'unarchive_session', { id }); }
  aiExportSession(id) { return this._execute('ai', 'export_session', { id }); }
  aiSessionStats(id) { return this._execute('ai', 'session_stats', { id }); }
  aiAddSessionTag(id, tag) { this._execute('ai', 'add_session_tag', { id, tag }); }
  aiRemoveSessionTag(id, tag) { this._execute('ai', 'remove_session_tag', { id, tag }); }
  aiListSessionsByTag(tag) {
    return this._execute('ai', 'list_sessions_by_tag', { tag }).sessions || [];
  }

  // ── AI: Context ──
  aiClearContext(sessionId) {
    return this._execute('ai', 'clear_context', { session_id: sessionId }).purged || 0;
  }
  aiAppendMessage(sessionId, message) {
    this._execute('ai', 'append_message', { session_id: sessionId, message });
  }
  aiGetHistory(sessionId, limit) {
    const p = { session_id: sessionId }; if (limit != null) p.limit = limit;
    return this._execute('ai', 'get_history', p).messages || [];
  }
  aiGetContextWindow(sessionId, maxTokens) {
    return this._execute('ai', 'get_context_window', {
      session_id: sessionId, max_tokens: maxTokens,
    }).messages || [];
  }
  aiGetContextWindowWithPrompt(sessionId, maxTokens) {
    return this._execute('ai', 'get_context_window_with_prompt', {
      session_id: sessionId, max_tokens: maxTokens,
    }).messages || [];
  }
  aiGetRecentMessages(sessionId, n) {
    return this._execute('ai', 'get_recent_messages', {
      session_id: sessionId, n,
    }).messages || [];
  }
  aiSetSystemPrompt(sessionId, prompt, tokenCount = 0) {
    this._execute('ai', 'set_system_prompt', {
      session_id: sessionId, prompt, token_count: tokenCount,
    });
  }
  aiSetContextSummary(sessionId, summary, tokenCount = 0) {
    this._execute('ai', 'set_context_summary', {
      session_id: sessionId, summary, token_count: tokenCount,
    });
  }
  aiGetContextSummary(sessionId) {
    return this._execute('ai', 'get_context_summary', { session_id: sessionId }).summary;
  }
  aiAutoSummarize(sessionId, maxTokens) {
    const p = { session_id: sessionId };
    if (maxTokens != null) p.max_tokens = maxTokens;
    return this._execute('ai', 'auto_summarize', p);
  }

  // ── AI: Memory ──
  aiStoreMemory(entry, embedding) {
    this._execute('ai', 'store_memory', { entry, embedding });
  }
  aiSearchMemory(embedding, k = 10) {
    return this._execute('ai', 'search_memory', { embedding, k }).results || [];
  }
  aiDeleteMemory(id) { this._execute('ai', 'delete_memory', { id }); }
  aiMemoryCount() { return this._execute('ai', 'memory_count').count || 0; }
  aiUpdateMemory(id, content, metadata) {
    const p = { id };
    if (content != null) p.content = content;
    if (metadata != null) p.metadata = metadata;
    this._execute('ai', 'update_memory', p);
  }
  aiStoreMemoriesBatch(entries, embeddings) {
    this._execute('ai', 'store_memories_batch', { entries, embeddings });
  }
  aiDeduplicateMemories(threshold = 0.95) {
    return this._execute('ai', 'deduplicate_memories', { threshold }).duplicates || [];
  }
  aiCleanupExpiredMemories() {
    return this._execute('ai', 'cleanup_expired_memories').cleaned || 0;
  }
  aiMemoryStats() { return this._execute('ai', 'memory_stats'); }

  // ── AI: RAG ──
  aiRagIngestDocument(document, chunks, embeddings) {
    this._execute('ai', 'rag_ingest_document', { document, chunks, embeddings });
  }
  aiRagIngestBatch(documents) {
    this._execute('ai', 'rag_ingest_batch', { documents });
  }
  aiRagSearch(queryEmbedding, k = 10, filter) {
    const p = { query_embedding: queryEmbedding, k };
    if (filter != null) p.filter = filter;
    return this._execute('ai', 'rag_search', p).results || [];
  }
  aiRagGetDocument(docId) {
    return this._execute('ai', 'rag_get_document', { doc_id: docId }).document;
  }
  aiRagListDocuments() {
    return this._execute('ai', 'rag_list_documents').documents || [];
  }
  aiRagDeleteDocument(docId) {
    this._execute('ai', 'rag_delete_document', { doc_id: docId });
  }
  aiRagUpdateDocument(docId, chunks, embeddings) {
    this._execute('ai', 'rag_update_document', { doc_id: docId, chunks, embeddings });
  }
  aiRagDocumentVersions(docId) {
    return this._execute('ai', 'rag_document_versions', { doc_id: docId }).versions || [];
  }

  // ── AI: Agent ──
  aiAgentLogStep(sessionId, step) {
    this._execute('ai', 'agent_log_step', { session_id: sessionId, step });
  }
  aiAgentGetSteps(sessionId, runId) {
    const p = { session_id: sessionId };
    if (runId != null) p.run_id = runId;
    return this._execute('ai', 'agent_get_steps', p).steps || [];
  }
  aiAgentCacheToolResult(key, result, ttl) {
    const p = { key, result }; if (ttl != null) p.ttl = ttl;
    this._execute('ai', 'agent_cache_tool_result', p);
  }
  aiAgentGetToolCache(key) {
    return this._execute('ai', 'agent_get_tool_cache', { key }).result;
  }

  // ── AI: Intent ──
  aiClassifyIntent(query, embedding) {
    return this._execute('ai', 'classify_intent', { query, embedding });
  }
  aiRegisterIntent(intent, embeddings) {
    this._execute('ai', 'register_intent', { intent, embeddings });
  }
  aiListIntents() { return this._execute('ai', 'list_intents').intents || []; }

  // ── AI: Trace ──
  aiLogTrace(record) { this._execute('ai', 'log_trace', { record }); }
  aiTokenUsage(sessionId) {
    return this._execute('ai', 'token_usage', { session_id: sessionId }).total_tokens || 0;
  }
  aiTokenUsageByRun(runId) {
    return this._execute('ai', 'token_usage_by_run', { run_id: runId }).total_tokens || 0;
  }
  aiTraceStats(sessionId) {
    return this._execute('ai', 'trace_stats', { session_id: sessionId });
  }
  aiTracePerformanceReport(sessionId, runId) {
    const p = {};
    if (sessionId != null) p.session_id = sessionId;
    if (runId != null) p.run_id = runId;
    return this._execute('ai', 'trace_performance_report', p);
  }
  aiQueryTraces(opts = {}) {
    const p = {};
    if (opts.sessionId != null) p.session_id = opts.sessionId;
    if (opts.runId != null) p.run_id = opts.runId;
    if (opts.operation != null) p.operation = opts.operation;
    if (opts.limit != null) p.limit = opts.limit;
    return this._execute('ai', 'query_traces', p).traces || [];
  }

  // ── AI: Embedding Cache ──
  aiEmbeddingCacheGet(key) {
    return this._execute('ai', 'embedding_cache_get', { key }).embedding;
  }
  aiEmbeddingCacheSet(key, embedding, ttl) {
    const p = { key, embedding }; if (ttl != null) p.ttl = ttl;
    this._execute('ai', 'embedding_cache_set', p);
  }

  // ── AI: Token Count ──
  aiTokenCount(text, encoding = 'cl100k_base') {
    return this._execute('ai', 'token_count', { text, encoding }).count || 0;
  }

  // ── AI: LLM Config ──
  aiSetLlmConfig(config) { this._execute('ai', 'set_llm_config', { config }); }
  aiGetLlmConfig() { return this._execute('ai', 'get_llm_config'); }
  aiClearLlmConfig() { this._execute('ai', 'clear_llm_config'); }

  // ── AI: Auto Embed (需要先配置 LLM) ──

  /**
   * 存储记忆（自动 embed + 向量写 + FTS 索引 + 缓存 + 可选 EDU 提取）。
   * @param {string} content - 记忆内容
   * @param {Record<string,string>} [metadata={}] - 元数据
   * @param {number} [ttlSecs] - 过期时间（秒）
   * @param {boolean} [extractFacts=false] - 是否提取 EDU 结构化事实
   */
  aiAddMemory(content, metadata = {}, ttlSecs, extractFacts = false) {
    const p = { content, metadata };
    if (ttlSecs != null) p.ttl_secs = ttlSecs;
    if (extractFacts) p.extract_facts = true;
    return this._execute('ai', 'add_memory', p);
  }

  /**
   * 智能召回（hybrid search + 时间感知 + 可选 LLM Rerank）。
   * @param {string} query - 搜索查询
   * @param {number} [k=10] - 返回数量
   * @param {number} [ftsWeight=0.4] - FTS 权重
   * @param {number} [vecWeight=0.6] - 向量权重
   * @param {number} [temporalBoost=0.0] - 时间感知权重
   * @param {boolean} [rerank=false] - 是否启用 LLM Rerank
   * @param {number} [rerankTopK] - Rerank 后返回数量
   * @param {number} [graphDepth=0] - Graph 扩展跳数
   */
  aiRecall(query, k = 10, ftsWeight = 0.4, vecWeight = 0.6, temporalBoost = 0.0, rerank = false, rerankTopK = undefined, graphDepth = 0) {
    const p = {
      query, k, fts_weight: ftsWeight, vec_weight: vecWeight,
    };
    if (temporalBoost > 0) p.temporal_boost = temporalBoost;
    if (rerank) p.rerank = true;
    if (rerankTopK !== undefined) p.rerank_top_k = rerankTopK;
    if (graphDepth > 0) p.graph_depth = graphDepth;
    return this._execute('ai', 'recall', p).results || [];
  }

  // ── AI: Auto Summarize (需要先配置 LLM) ──
  aiAutoSummarize(sessionId, opts = {}) {
    const p = { session_id: sessionId };
    if (opts.maxSummaryTokens != null) p.max_summary_tokens = opts.maxSummaryTokens;
    if (opts.purgeOld != null) p.purge_old = opts.purgeOld;
    if (opts.customPrompt != null) p.custom_prompt = opts.customPrompt;
    return this._execute('ai', 'auto_summarize', p);
  }
  aiGetContextWindowSmart(sessionId, maxTokens = 4096) {
    return this._execute('ai', 'get_context_window_smart', {
      session_id: sessionId, max_tokens: maxTokens,
    }).messages || [];
  }

  // ── AI: Memory Advanced ──
  aiSearchMemoryWithFilter(embedding, k = 10, filters = {}) {
    return this._execute('ai', 'search_memory_with_filter', {
      embedding, k, filters,
    }).results || [];
  }
  aiFindDuplicateMemories(threshold = 0.05) {
    return this._execute('ai', 'find_duplicate_memories', { threshold }).pairs || [];
  }
  aiDeduplicateMemories(threshold = 0.05) {
    return this._execute('ai', 'deduplicate_memories', { threshold }).deduplicated || 0;
  }
  aiListMemories(offset = 0, limit = 100) {
    return this._execute('ai', 'list_memories', { offset, limit }).entries || [];
  }
  aiMemoryStats() { return this._execute('ai', 'memory_stats').stats || {}; }
  aiCleanupExpiredMemories() {
    return this._execute('ai', 'cleanup_expired_memories').cleaned || 0;
  }

  // ── Cluster ──
  clusterStatus() { return this._execute('cluster', 'status'); }
  clusterRole() { return this._execute('cluster', 'role').role; }
  clusterPromote() { return this._execute('cluster', 'promote'); }
  clusterReplicas() { return this._execute('cluster', 'replicas'); }

  // ── Ops ──
  databaseStats() { return this._execute('database_stats'); }
  healthCheck() { return this._execute('health_check'); }

  // ── Backup ──
  exportDb(dir, keyspaces) {
    const p = { dir }; if (keyspaces) p.keyspaces = keyspaces;
    return this._execute('backup', 'export', p).exported || 0;
  }
  importDb(dir) { return this._execute('backup', 'import', { dir }).imported || 0; }

  // ── FTS ──
  ftsCreateIndex(name) { this._execute('fts', 'create_index', { name }); }
  ftsDropIndex(name) { this._execute('fts', 'drop_index', { name }); }
  ftsIndex(name, docId, fields) {
    this._execute('fts', 'index', { name, doc_id: docId, fields });
  }
  ftsIndexBatch(name, docs) {
    return this._execute('fts', 'index_batch', { name, docs }).count || 0;
  }
  ftsDelete(name, docId) {
    return this._execute('fts', 'delete', { name, doc_id: docId }).deleted || false;
  }
  ftsGet(name, docId) {
    return this._execute('fts', 'get', { name, doc_id: docId });
  }
  ftsSearch(name, query, limit = 10) {
    return this._execute('fts', 'search', { name, query, limit });
  }
  ftsSearchFuzzy(name, query, maxDist = 1, limit = 10) {
    return this._execute('fts', 'search_fuzzy', { name, query, max_dist: maxDist, limit });
  }
  ftsHybridSearch(ftsIdx, vecIdx, query, vector, opts = {}) {
    const p = {
      name: ftsIdx, vec_index: vecIdx, query, vector,
      metric: opts.metric || 'cosine', limit: opts.limit || 10,
      fts_weight: opts.ftsWeight || 0.5, vec_weight: opts.vecWeight || 0.5,
    };
    if (opts.numCandidates != null) p.num_candidates = opts.numCandidates;
    if (opts.preFilter) p.pre_filter = opts.preFilter;
    return this._execute('fts', 'hybrid_search', p);
  }
  ftsAddAlias(alias, index) { this._execute('fts', 'add_alias', { alias, index }); }
  ftsRemoveAlias(alias) { this._execute('fts', 'remove_alias', { alias }); }
  ftsReindex(name) { return this._execute('fts', 'reindex', { name }).reindexed || 0; }
  ftsCloseIndex(name) { this._execute('fts', 'close_index', { name }); }
  ftsOpenIndex(name) { this._execute('fts', 'open_index', { name }); }
  ftsGetMapping(name) { return this._execute('fts', 'get_mapping', { name }); }
  ftsListIndexes() { return this._execute('fts', 'list_indexes'); }

  // ── Geo ──
  geoCreate(name) { this._execute('geo', 'create', { name }); }
  geoAdd(name, key, lng, lat) {
    this._execute('geo', 'add', { name, key, lng, lat });
  }
  geoAddBatch(name, members) {
    return this._execute('geo', 'add_batch', { name, members }).count || 0;
  }
  geoPos(name, key) { return this._execute('geo', 'pos', { name, key }); }
  geoDel(name, key) {
    return this._execute('geo', 'del', { name, key }).deleted || false;
  }
  geoDist(name, key1, key2, unit = 'm') {
    const data = this._execute('geo', 'dist', { name, key1, key2, unit });
    return data.dist != null ? data.dist : null;
  }
  geoSearch(name, lng, lat, radius, unit = 'm', count) {
    const p = { name, lng, lat, radius, unit };
    if (count != null) p.count = count;
    return this._execute('geo', 'search', p);
  }
  geoSearchBox(name, minLng, minLat, maxLng, maxLat, count) {
    const p = { name, min_lng: minLng, min_lat: minLat, max_lng: maxLng, max_lat: maxLat };
    if (count != null) p.count = count;
    return this._execute('geo', 'search_box', p);
  }
  geoFence(name, key, centerLng, centerLat, radius, unit = 'm') {
    const data = this._execute('geo', 'fence', {
      name, key, center_lng: centerLng, center_lat: centerLat, radius, unit,
    });
    return data.inside != null ? data.inside : null;
  }
  geoMembers(name) { return this._execute('geo', 'members', { name }).members || []; }

  // ── Graph ──
  graphCreate(graph) { this._execute('graph', 'create', { graph }); }
  graphAddVertex(graph, label, properties) {
    const p = { graph, label }; if (properties) p.properties = properties;
    return this._execute('graph', 'add_vertex', p).vertex_id || 0;
  }
  graphGetVertex(graph, id) {
    return this._execute('graph', 'get_vertex', { graph, id });
  }
  graphUpdateVertex(graph, id, properties) {
    this._execute('graph', 'update_vertex', { graph, id, properties });
  }
  graphDeleteVertex(graph, id) {
    this._execute('graph', 'delete_vertex', { graph, id });
  }
  graphAddEdge(graph, from, to, label, properties) {
    const p = { graph, from, to, label }; if (properties) p.properties = properties;
    return this._execute('graph', 'add_edge', p).edge_id || 0;
  }
  graphGetEdge(graph, id) {
    return this._execute('graph', 'get_edge', { graph, id });
  }
  graphDeleteEdge(graph, id) {
    this._execute('graph', 'delete_edge', { graph, id });
  }
  graphNeighbors(graph, id, direction = 'out') {
    return this._execute('graph', 'neighbors', { graph, id, direction }).neighbors || [];
  }
  graphOutEdges(graph, id) {
    return this._execute('graph', 'out_edges', { graph, id });
  }
  graphInEdges(graph, id) {
    return this._execute('graph', 'in_edges', { graph, id });
  }
  graphVerticesByLabel(graph, label) {
    return this._execute('graph', 'vertices_by_label', { graph, label });
  }
  graphVertexCount(graph) {
    return this._execute('graph', 'vertex_count', { graph }).count || 0;
  }
  graphEdgeCount(graph) {
    return this._execute('graph', 'edge_count', { graph }).count || 0;
  }
  graphBfs(graph, start, maxDepth = 3, direction = 'out') {
    return this._execute('graph', 'bfs', { graph, start, max_depth: maxDepth, direction });
  }
  graphShortestPath(graph, from, to, maxDepth = 10) {
    return this._execute('graph', 'shortest_path', { graph, from, to, max_depth: maxDepth });
  }
  graphWeightedShortestPath(graph, from, to, maxDepth = 10, weightKey = 'weight') {
    return this._execute('graph', 'weighted_shortest_path', {
      graph, from, to, max_depth: maxDepth, weight_key: weightKey,
    });
  }
  graphDegreeCentrality(graph, limit = 10) {
    return this._execute('graph', 'degree_centrality', { graph, limit });
  }
  graphPagerank(graph, damping = 0.85, iterations = 20, limit = 10) {
    return this._execute('graph', 'pagerank', { graph, damping, iterations, limit });
  }
}

module.exports = { Talon, TalonError };
