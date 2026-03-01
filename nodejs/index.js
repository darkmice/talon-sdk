/**
 * Talon Node.js SDK — 通过 ffi-napi 封装 talon_execute C ABI。
 * @module talon-db
 */

'use strict';

const ffi = require('ffi-napi');
const ref = require('ref-napi');
const path = require('path');
const fs = require('fs');
const os = require('os');

const voidPtr = ref.refType(ref.types.void);
const stringPtr = ref.refType(ref.types.CString);

/**
 * 查找 libtalon 动态库路径。
 * @param {string} [libPath] - 手动指定路径
 * @returns {string}
 */
function findLib(libPath) {
  if (libPath && fs.existsSync(libPath)) return libPath;

  const env = process.env.TALON_LIB_PATH;
  if (env && fs.existsSync(env)) return env;

  const plat = os.platform();
  const name = plat === 'darwin' ? 'libtalon.dylib'
    : plat === 'win32' ? 'talon.dll' : 'libtalon.so';

  // 同目录
  const local = path.join(__dirname, name);
  if (fs.existsSync(local)) return local;

  // 项目 target
  const root = path.resolve(__dirname, '..', '..');
  for (const profile of ['release', 'debug']) {
    const candidate = path.join(root, 'target', profile, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return name;
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
    this._lib = ffi.Library(findLib(libPath), {
      talon_open: [voidPtr, ['string']],
      talon_close: ['void', [voidPtr]],
      talon_execute: ['int', [voidPtr, 'string', stringPtr]],
      talon_free_string: ['void', [voidPtr]],
      talon_persist: ['int', [voidPtr]],
    });
    this._handle = this._lib.talon_open(dbPath);
    if (this._handle.isNull()) {
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
    if (!this._handle || this._handle.isNull()) {
      throw new TalonError('数据库已关闭');
    }
    const cmd = JSON.stringify({ module, action, params });
    const outBuf = ref.alloc(stringPtr);
    const rc = this._lib.talon_execute(this._handle, cmd, outBuf);
    if (rc !== 0) throw new TalonError('talon_execute 调用失败');
    const outPtr = outBuf.deref();
    let result;
    try {
      result = JSON.parse(outPtr.readCString());
    } finally {
      this._lib.talon_free_string(outPtr);
    }
    if (!result.ok) throw new TalonError(result.error || '未知错误');
    return result.data || {};
  }

  /** 关闭数据库。 */
  close() {
    if (this._handle && !this._handle.isNull()) {
      this._lib.talon_close(this._handle);
      this._handle = null;
    }
  }

  /** 刷盘。 */
  persist() {
    if (!this._handle) throw new TalonError('数据库已关闭');
    if (this._lib.talon_persist(this._handle) !== 0) {
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

  // ── AI ──
  aiCreateSession(id, metadata, ttl) {
    const p = { id }; if (metadata) p.metadata = metadata; if (ttl != null) p.ttl = ttl;
    this._execute('ai', 'create_session', p);
  }
  aiGetSession(id) { return this._execute('ai', 'get_session', { id }).session || {}; }
  aiListSessions() { return this._execute('ai', 'list_sessions').sessions || []; }
  aiDeleteSession(id) { this._execute('ai', 'delete_session', { id }); }
  aiUpdateSession(id, metadata) {
    this._execute('ai', 'update_session', { id, metadata });
  }
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
  aiGetRecentMessages(sessionId, n) {
    return this._execute('ai', 'get_recent_messages', {
      session_id: sessionId, n,
    }).messages || [];
  }
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
  aiLogTrace(record) { this._execute('ai', 'log_trace', { record }); }
  aiTokenUsage(sessionId) {
    return this._execute('ai', 'token_usage', { session_id: sessionId }).total_tokens || 0;
  }
  aiTokenUsageByRun(runId) {
    return this._execute('ai', 'token_usage_by_run', { run_id: runId }).total_tokens || 0;
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
}

module.exports = { Talon, TalonError };
