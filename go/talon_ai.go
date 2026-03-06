/*
 * Copyright (c) 2026 Talon Contributors
 * Author: dark.lijin@gmail.com
 * Licensed under the Talon Community Dual License Agreement.
 * See the LICENSE file in the project root for full license information.
 */
// Talon Go SDK — AI-Native + Backup 方法。

package talon

import "encoding/json"

// ── AI: Session ──

// AiCreateSession 创建 AI 会话。
func (db *DB) AiCreateSession(id string, metadata map[string]string, ttl *uint64) error {
	p := map[string]interface{}{"id": id}
	if metadata != nil {
		p["metadata"] = metadata
	}
	if ttl != nil {
		p["ttl"] = *ttl
	}
	_, err := db.execute("ai", "create_session", p)
	return err
}

// AiGetSession 获取会话信息，返回原始 JSON。
func (db *DB) AiGetSession(id string) (json.RawMessage, error) {
	return db.execute("ai", "get_session", map[string]interface{}{"id": id})
}

// AiListSessions 列出所有会话，返回原始 JSON。
func (db *DB) AiListSessions() (json.RawMessage, error) {
	return db.execute("ai", "list_sessions", nil)
}

// AiDeleteSession 删除会话。
func (db *DB) AiDeleteSession(id string) error {
	_, err := db.execute("ai", "delete_session", map[string]interface{}{"id": id})
	return err
}

// AiUpdateSession 更新会话元数据。
func (db *DB) AiUpdateSession(id string, metadata map[string]string) error {
	_, err := db.execute("ai", "update_session", map[string]interface{}{
		"id": id, "metadata": metadata,
	})
	return err
}

// ── AI: Context ──

// AiClearContext 清空会话上下文，返回清理数量。
func (db *DB) AiClearContext(sessionID string) (uint64, error) {
	data, err := db.execute("ai", "clear_context", map[string]interface{}{
		"session_id": sessionID,
	})
	if err != nil {
		return 0, err
	}
	var out struct {
		Purged uint64 `json:"purged"`
	}
	return out.Purged, json.Unmarshal(data, &out)
}

// AiAppendMessage 追加消息到会话上下文。
func (db *DB) AiAppendMessage(sessionID string, message map[string]interface{}) error {
	_, err := db.execute("ai", "append_message", map[string]interface{}{
		"session_id": sessionID, "message": message,
	})
	return err
}

// AiGetHistory 获取会话历史，返回原始 JSON。
func (db *DB) AiGetHistory(sessionID string, limit *int) (json.RawMessage, error) {
	p := map[string]interface{}{"session_id": sessionID}
	if limit != nil {
		p["limit"] = *limit
	}
	return db.execute("ai", "get_history", p)
}

// AiGetContextWindow 获取 token 限制内的上下文窗口，返回原始 JSON。
func (db *DB) AiGetContextWindow(sessionID string, maxTokens int) (json.RawMessage, error) {
	return db.execute("ai", "get_context_window", map[string]interface{}{
		"session_id": sessionID, "max_tokens": maxTokens,
	})
}

// AiGetRecentMessages 获取最近 n 条消息，返回原始 JSON。
func (db *DB) AiGetRecentMessages(sessionID string, n int) (json.RawMessage, error) {
	return db.execute("ai", "get_recent_messages", map[string]interface{}{
		"session_id": sessionID, "n": n,
	})
}

// ── AI: Memory ──

// AiStoreMemory 存储记忆。
func (db *DB) AiStoreMemory(entry map[string]interface{}, embedding []float32) error {
	_, err := db.execute("ai", "store_memory", map[string]interface{}{
		"entry": entry, "embedding": embedding,
	})
	return err
}

// AiSearchMemory 向量搜索记忆，返回原始 JSON。
func (db *DB) AiSearchMemory(embedding []float32, k int) (json.RawMessage, error) {
	return db.execute("ai", "search_memory", map[string]interface{}{
		"embedding": embedding, "k": k,
	})
}

// AiDeleteMemory 删除记忆。
func (db *DB) AiDeleteMemory(id uint64) error {
	_, err := db.execute("ai", "delete_memory", map[string]interface{}{"id": id})
	return err
}

// AiMemoryCount 记忆总数。
func (db *DB) AiMemoryCount() (uint64, error) {
	data, err := db.execute("ai", "memory_count", nil)
	if err != nil {
		return 0, err
	}
	var out struct {
		Count uint64 `json:"count"`
	}
	return out.Count, json.Unmarshal(data, &out)
}

// AiUpdateMemory 更新记忆。
func (db *DB) AiUpdateMemory(id uint64, content *string, metadata map[string]string) error {
	p := map[string]interface{}{"id": id}
	if content != nil {
		p["content"] = *content
	}
	if metadata != nil {
		p["metadata"] = metadata
	}
	_, err := db.execute("ai", "update_memory", p)
	return err
}

// AiStoreMemoriesBatch 批量存储记忆。
func (db *DB) AiStoreMemoriesBatch(entries []map[string]interface{}, embeddings [][]float32) error {
	_, err := db.execute("ai", "store_memories_batch", map[string]interface{}{
		"entries": entries, "embeddings": embeddings,
	})
	return err
}

// ── AI: Trace ──

// AiLogTrace 记录 trace。
func (db *DB) AiLogTrace(record map[string]interface{}) error {
	_, err := db.execute("ai", "log_trace", map[string]interface{}{"record": record})
	return err
}

// AiTokenUsage 查询会话 token 用量。
func (db *DB) AiTokenUsage(sessionID string) (uint64, error) {
	data, err := db.execute("ai", "token_usage", map[string]interface{}{
		"session_id": sessionID,
	})
	if err != nil {
		return 0, err
	}
	var out struct {
		TotalTokens uint64 `json:"total_tokens"`
	}
	return out.TotalTokens, json.Unmarshal(data, &out)
}

// AiTokenUsageByRun 按 run_id 查询 token 用量。
func (db *DB) AiTokenUsageByRun(runID string) (uint64, error) {
	data, err := db.execute("ai", "token_usage_by_run", map[string]interface{}{
		"run_id": runID,
	})
	if err != nil {
		return 0, err
	}
	var out struct {
		TotalTokens uint64 `json:"total_tokens"`
	}
	return out.TotalTokens, json.Unmarshal(data, &out)
}

// ── Backup ──

// ExportDb 导出数据库，返回导出数量。
func (db *DB) ExportDb(dir string, keyspaces []string) (uint64, error) {
	p := map[string]interface{}{"dir": dir}
	if keyspaces != nil {
		p["keyspaces"] = keyspaces
	}
	data, err := db.execute("backup", "export", p)
	if err != nil {
		return 0, err
	}
	var out struct {
		Exported uint64 `json:"exported"`
	}
	return out.Exported, json.Unmarshal(data, &out)
}

// ImportDb 导入数据库，返回导入数量。
func (db *DB) ImportDb(dir string) (uint64, error) {
	data, err := db.execute("backup", "import", map[string]interface{}{"dir": dir})
	if err != nil {
		return 0, err
	}
	var out struct {
		Imported uint64 `json:"imported"`
	}
	return out.Imported, json.Unmarshal(data, &out)
}
