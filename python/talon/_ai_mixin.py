"""Talon AI + Backup 方法 Mixin，由 Talon 类继承。"""

from typing import Any, Dict, List, Optional


class AiMixin:
    """AI-Native + Backup 方法集合。需要子类提供 _execute 方法。"""

    # ── AI: Session ──

    def ai_create_session(self, id: str,
                          metadata: Optional[Dict[str, str]] = None,
                          ttl: Optional[int] = None):
        """创建 AI 会话。"""
        p: Dict[str, Any] = {"id": id}
        if metadata:
            p["metadata"] = metadata
        if ttl is not None:
            p["ttl"] = ttl
        self._execute("ai", "create_session", p)

    def ai_get_session(self, id: str) -> Dict:
        """获取会话信息。"""
        data = self._execute("ai", "get_session", {"id": id})
        return data.get("session", {})

    def ai_list_sessions(self) -> List[Dict]:
        """列出所有会话。"""
        data = self._execute("ai", "list_sessions")
        return data.get("sessions", [])

    def ai_delete_session(self, id: str):
        """删除会话。"""
        self._execute("ai", "delete_session", {"id": id})

    def ai_update_session(self, id: str,
                          metadata: Dict[str, str]):
        """更新会话元数据。"""
        self._execute("ai", "update_session", {
            "id": id, "metadata": metadata,
        })

    # ── AI: Context ──

    def ai_clear_context(self, session_id: str) -> int:
        """清空会话上下文，返回清理数量。"""
        data = self._execute("ai", "clear_context", {
            "session_id": session_id,
        })
        return data.get("purged", 0)

    def ai_append_message(self, session_id: str, message: Dict):
        """追加消息到会话上下文。"""
        self._execute("ai", "append_message", {
            "session_id": session_id, "message": message,
        })

    def ai_get_history(self, session_id: str,
                       limit: Optional[int] = None) -> List[Dict]:
        """获取会话历史。"""
        p: Dict[str, Any] = {"session_id": session_id}
        if limit is not None:
            p["limit"] = limit
        data = self._execute("ai", "get_history", p)
        return data.get("messages", [])

    def ai_get_context_window(self, session_id: str,
                              max_tokens: int) -> List[Dict]:
        """获取 token 限制内的上下文窗口。"""
        data = self._execute("ai", "get_context_window", {
            "session_id": session_id,
            "max_tokens": max_tokens,
        })
        return data.get("messages", [])

    def ai_get_recent_messages(self, session_id: str,
                               n: int) -> List[Dict]:
        """获取最近 n 条消息。"""
        data = self._execute("ai", "get_recent_messages", {
            "session_id": session_id, "n": n,
        })
        return data.get("messages", [])

    # ── AI: Memory ──

    def ai_store_memory(self, entry: Dict,
                        embedding: List[float]):
        """存储记忆。"""
        self._execute("ai", "store_memory", {
            "entry": entry, "embedding": embedding,
        })

    def ai_search_memory(self, embedding: List[float],
                         k: int = 10) -> List[Dict]:
        """向量搜索记忆。"""
        data = self._execute("ai", "search_memory", {
            "embedding": embedding, "k": k,
        })
        return data.get("results", [])

    def ai_delete_memory(self, id: int):
        """删除记忆。"""
        self._execute("ai", "delete_memory", {"id": id})

    def ai_memory_count(self) -> int:
        """记忆总数。"""
        data = self._execute("ai", "memory_count")
        return data.get("count", 0)

    def ai_update_memory(self, id: int,
                         content: Optional[str] = None,
                         metadata: Optional[Dict[str, str]] = None):
        """更新记忆。"""
        p: Dict[str, Any] = {"id": id}
        if content is not None:
            p["content"] = content
        if metadata is not None:
            p["metadata"] = metadata
        self._execute("ai", "update_memory", p)

    def ai_store_memories_batch(self, entries: List[Dict],
                                embeddings: List[List[float]]):
        """批量存储记忆。"""
        self._execute("ai", "store_memories_batch", {
            "entries": entries, "embeddings": embeddings,
        })

    # ── AI: Trace ──

    def ai_log_trace(self, record: Dict):
        """记录 trace。"""
        self._execute("ai", "log_trace", {"record": record})

    def ai_token_usage(self, session_id: str) -> int:
        """查询会话 token 用量。"""
        data = self._execute("ai", "token_usage", {
            "session_id": session_id,
        })
        return data.get("total_tokens", 0)

    def ai_token_usage_by_run(self, run_id: str) -> int:
        """按 run_id 查询 token 用量。"""
        data = self._execute("ai", "token_usage_by_run", {
            "run_id": run_id,
        })
        return data.get("total_tokens", 0)

    # ── Backup ──

    def export_db(self, dir: str,
                  keyspaces: Optional[List[str]] = None) -> int:
        """导出数据库，返回导出数量。"""
        p: Dict[str, Any] = {"dir": dir}
        if keyspaces:
            p["keyspaces"] = keyspaces
        data = self._execute("backup", "export", p)
        return data.get("exported", 0)

    def import_db(self, dir: str) -> int:
        """导入数据库，返回导入数量。"""
        data = self._execute("backup", "import", {"dir": dir})
        return data.get("imported", 0)
