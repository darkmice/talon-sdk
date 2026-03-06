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
 * 查找 libtalon 动态库路径。
 * @param {string} [libPath] - 手动指定路径
 * @returns {string}
 */
function findLib(libPath) {
  if (libPath && fs.existsSync(libPath)) return libPath;

  const env = process.env.TALON_LIB_PATH;
  if (env && fs.existsSync(env)) return env;

  const plat = os.platform();
  const arch = os.arch();
  const name = plat === 'darwin' ? 'libtalon.dylib'
    : plat === 'win32' ? 'talon.dll' : 'libtalon.so';

  // 平台目录名
  let platArch;
  if (arch === 'arm64') platArch = 'arm64';
  else if (arch === 'loong64') platArch = 'loongarch64';
  else if (arch === 'riscv64') platArch = 'riscv64';
  else platArch = 'amd64';
  const platDir = plat === 'darwin' ? `darwin_${platArch}`
    : plat === 'win32' ? `windows_${platArch}` : `linux_${platArch}`;

  // 1. npm 包内 native/ 目录 (postinstall 下载)
  const nativeDir = path.join(__dirname, 'native', name);
  if (fs.existsSync(nativeDir)) return nativeDir;

  // 2. SDK 内嵌库: talon-sdk/lib/{platform}/
  const sdkRoot = path.resolve(__dirname, '..');
  const bundled = path.join(sdkRoot, 'lib', platDir, name);
  if (fs.existsSync(bundled)) return bundled;

  // 3. 同目录
  const local = path.join(__dirname, name);
  if (fs.existsSync(local)) return local;

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
