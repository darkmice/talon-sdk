#
# Copyright (c) 2026 Talon Contributors
# Author: dark.lijin@gmail.com
# Licensed under the Talon Community Dual License Agreement.
# See the LICENSE file in the project root for full license information.
#
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
        if metadata is not None:
            p["metadata"] = metadata
        if ttl is not None:
            p["ttl"] = ttl
        self._execute("ai", "create_session", p)

    def ai_get_session(self, id: str) -> Dict:
        """获取会话信息。"""
        data = self._execute("ai", "get_session", {"id": id})
        return data.get("session", {})

    def ai_create_session_if_not_exists(self, id: str,
                                         metadata: Optional[Dict[str, str]] = None,
                                         ttl: Optional[int] = None) -> Dict:
        """幂等创建会话：已存在则返回现有 Session，不存在则创建。

        返回 {"session": {...}, "is_new": bool}。
        """
        p: Dict[str, Any] = {"id": id}
        if metadata is not None:
            p["metadata"] = metadata
        if ttl is not None:
            p["ttl"] = ttl
        return self._execute("ai", "create_session_if_not_exists", p)

    def ai_list_sessions(self) -> List[Dict]:
        """列出所有活跃会话（排除已归档和已过期）。"""
        data = self._execute("ai", "list_sessions")
        return data.get("sessions", [])

    def ai_delete_session(self, id: str):
        """删除会话（级联删除 context + trace）。"""
        self._execute("ai", "delete_session", {"id": id})

    def ai_update_session(self, id: str,
                          metadata: Dict[str, str]):
        """更新会话元数据（合并）。"""
        self._execute("ai", "update_session", {
            "id": id, "metadata": metadata,
        })

    def ai_cleanup_expired_sessions(self) -> int:
        """清理所有已过期的 Session，返回清理数量。"""
        data = self._execute("ai", "cleanup_expired_sessions")
        return data.get("cleaned", 0)

    def ai_archive_session(self, id: str):
        """归档会话。"""
        self._execute("ai", "archive_session", {"id": id})

    def ai_unarchive_session(self, id: str):
        """取消归档会话。"""
        self._execute("ai", "unarchive_session", {"id": id})

    def ai_export_session(self, id: str) -> Dict:
        """导出会话（含完整上下文和 trace）。"""
        return self._execute("ai", "export_session", {"id": id})

    def ai_session_stats(self, id: str) -> Dict:
        """获取会话统计信息（消息数/token 用量等）。"""
        return self._execute("ai", "session_stats", {"id": id})

    def ai_add_session_tag(self, id: str, tag: str):
        """为会话添加标签。"""
        self._execute("ai", "add_session_tag", {
            "id": id, "tag": tag,
        })

    def ai_remove_session_tag(self, id: str, tag: str):
        """移除会话标签。"""
        self._execute("ai", "remove_session_tag", {
            "id": id, "tag": tag,
        })

    def ai_list_sessions_by_tag(self, tag: str) -> List[Dict]:
        """按标签查询会话。"""
        data = self._execute("ai", "list_sessions_by_tag", {"tag": tag})
        return data.get("sessions", [])

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

    def ai_get_context_window_with_prompt(self, session_id: str,
                                          max_tokens: int) -> List[Dict]:
        """获取上下文窗口（含 system_prompt + summary）。"""
        data = self._execute("ai", "get_context_window_with_prompt", {
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

    def ai_set_system_prompt(self, session_id: str,
                             prompt: str,
                             token_count: int = 0):
        """设置会话的 System Prompt。"""
        self._execute("ai", "set_system_prompt", {
            "session_id": session_id,
            "prompt": prompt,
            "token_count": token_count,
        })

    def ai_set_context_summary(self, session_id: str,
                                summary: str,
                                token_count: int = 0):
        """设置会话的上下文摘要。"""
        self._execute("ai", "set_context_summary", {
            "session_id": session_id,
            "summary": summary,
            "token_count": token_count,
        })

    def ai_get_context_summary(self, session_id: str) -> Optional[str]:
        """获取会话的上下文摘要。"""
        data = self._execute("ai", "get_context_summary", {
            "session_id": session_id,
        })
        return data.get("summary")

    def ai_auto_summarize(self, session_id: str,
                          max_tokens: Optional[int] = None) -> Dict:
        """自动生成上下文摘要。"""
        p: Dict[str, Any] = {"session_id": session_id}
        if max_tokens is not None:
            p["max_tokens"] = max_tokens
        return self._execute("ai", "auto_summarize", p)

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
        if len(entries) != len(embeddings):
            raise ValueError(
                f"entries({len(entries)}) 和 embeddings({len(embeddings)}) 长度不一致")
        self._execute("ai", "store_memories_batch", {
            "entries": entries, "embeddings": embeddings,
        })

    def ai_deduplicate_memories(self,
                                threshold: float = 0.95) -> List[Dict]:
        """检测并返回重复记忆对。"""
        data = self._execute("ai", "deduplicate_memories", {
            "threshold": threshold,
        })
        return data.get("duplicates", [])

    def ai_cleanup_expired_memories(self) -> int:
        """清理过期记忆，返回清理数量。"""
        data = self._execute("ai", "cleanup_expired_memories")
        return data.get("cleaned", 0)

    def ai_memory_stats(self) -> Dict:
        """获取记忆统计信息。"""
        return self._execute("ai", "memory_stats")

    def ai_add_memory(self, content: str,
                      metadata: Optional[Dict[str, str]] = None,
                      ttl_secs: Optional[int] = None) -> int:
        """存储记忆（自动 embed + 向量写 + FTS 索引 + 缓存）。

        自动完成以下操作：
        1. 调用 Embedding API 生成向量（自带 FNV 哈希缓存）
        2. 写入向量索引（语义搜索）
        3. 写入 FTS 索引（关键词搜索）
        4. 存储元数据到 KV

        需要先调用 ai_set_llm_config 配置 embed provider。
        返回记忆 ID。
        """
        p: Dict[str, Any] = {"content": content}
        if metadata is not None:
            p["metadata"] = metadata
        if ttl_secs is not None:
            p["ttl_secs"] = ttl_secs
        data = self._execute("ai", "add_memory", p)
        return data.get("id", 0)

    def ai_recall(self, query: str, k: int = 10,
                  fts_weight: float = 0.4,
                  vec_weight: float = 0.6) -> List[Dict]:
        """智能召回（hybrid search: BM25 + 向量，RRF 融合）。

        两路检索融合：
        - FTS BM25 路：关键词精确匹配（提升 Single Hop 类问题）
        - Vector 路：语义相似度（保持 Open Domain 优势）
        - RRF 融合排序：无需分数归一化，基于排名融合

        Args:
            query: 搜索查询文本
            k: 返回结果数量
            fts_weight: FTS 路权重（默认 0.4）
            vec_weight: 向量路权重（默认 0.6）

        返回 HybridRecallResult 列表（含 rrf_score, bm25_score, vector_dist）。
        需要先调用 ai_set_llm_config 配置 embed provider。
        """
        data = self._execute("ai", "recall", {
            "query": query, "k": k,
            "fts_weight": fts_weight, "vec_weight": vec_weight,
        })
        return data.get("results", [])

    def ai_search_memory_with_filter(self, embedding: List[float],
                                      k: int = 10,
                                      filters: Optional[Dict[str, str]] = None) -> List[Dict]:
        """向量搜索 + metadata 过滤。"""
        p: Dict[str, Any] = {"embedding": embedding, "k": k}
        if filters:
            p["filters"] = filters
        data = self._execute("ai", "search_memory_with_filter", p)
        return data.get("results", [])

    def ai_find_duplicate_memories(self,
                                    threshold: float = 0.05) -> List[Dict]:
        """查找重复记忆对（不删除）。"""
        data = self._execute("ai", "find_duplicate_memories", {
            "threshold": threshold,
        })
        return data.get("pairs", [])

    def ai_list_memories(self, offset: int = 0,
                          limit: int = 100) -> List[Dict]:
        """分页列出记忆。"""
        data = self._execute("ai", "list_memories", {
            "offset": offset, "limit": limit,
        })
        return data.get("entries", [])

    def ai_clear_llm_config(self):
        """清除 LLM 配置（回到手动模式）。"""
        self._execute("ai", "clear_llm_config")

    def ai_get_context_window_smart(self, session_id: str,
                                     max_tokens: int = 4096) -> List[Dict]:
        """智能上下文窗口：超长时自动触发摘要压缩。"""
        data = self._execute("ai", "get_context_window_smart", {
            "session_id": session_id,
            "max_tokens": max_tokens,
        })
        return data.get("messages", [])

    # ── AI: RAG ──

    def ai_rag_ingest_document(self, document: Dict,
                                chunks: List[Dict],
                                embeddings: List[List[float]]):
        """导入 RAG 文档。

        Args:
            document: {"doc_id": str, "title": str, "source": str, "metadata": dict}
            chunks: [{"chunk_id": str, "content": str, "metadata": dict}, ...]
            embeddings: 与 chunks 一一对应的向量列表
        """
        if len(chunks) != len(embeddings):
            raise ValueError(
                f"chunks({len(chunks)}) 和 embeddings({len(embeddings)}) 长度不一致")
        self._execute("ai", "rag_ingest_document", {
            "document": document,
            "chunks": chunks,
            "embeddings": embeddings,
        })

    def ai_rag_ingest_batch(self, documents: List[Dict]):
        """批量导入 RAG 文档。每个 doc 须含 document/chunks/embeddings。"""
        self._execute("ai", "rag_ingest_batch", {
            "documents": documents,
        })

    def ai_rag_search(self, query_embedding: List[float],
                      k: int = 10,
                      filter: Optional[Dict] = None) -> List[Dict]:
        """RAG 语义搜索，返回相关 chunks。"""
        p: Dict[str, Any] = {
            "query_embedding": query_embedding, "k": k,
        }
        if filter is not None:
            p["filter"] = filter
        data = self._execute("ai", "rag_search", p)
        return data.get("results", [])

    def ai_rag_get_document(self, doc_id: str) -> Optional[Dict]:
        """获取 RAG 文档。"""
        data = self._execute("ai", "rag_get_document", {
            "doc_id": doc_id,
        })
        return data.get("document")

    def ai_rag_list_documents(self) -> List[Dict]:
        """列出所有 RAG 文档。"""
        data = self._execute("ai", "rag_list_documents")
        return data.get("documents", [])

    def ai_rag_delete_document(self, doc_id: str):
        """删除 RAG 文档及其所有 chunks。"""
        self._execute("ai", "rag_delete_document", {
            "doc_id": doc_id,
        })

    def ai_rag_update_document(self, doc_id: str,
                                chunks: List[Dict],
                                embeddings: List[List[float]]):
        """更新 RAG 文档内容（替换 chunks）。"""
        self._execute("ai", "rag_update_document", {
            "doc_id": doc_id,
            "chunks": chunks,
            "embeddings": embeddings,
        })

    def ai_rag_document_versions(self, doc_id: str) -> List[Dict]:
        """获取 RAG 文档版本历史。"""
        data = self._execute("ai", "rag_document_versions", {
            "doc_id": doc_id,
        })
        return data.get("versions", [])

    # ── AI: Agent ──

    def ai_agent_log_step(self, session_id: str, step: Dict):
        """记录 Agent 执行步骤。"""
        self._execute("ai", "agent_log_step", {
            "session_id": session_id, "step": step,
        })

    def ai_agent_get_steps(self, session_id: str,
                           run_id: Optional[str] = None) -> List[Dict]:
        """获取 Agent 执行步骤。"""
        p: Dict[str, Any] = {"session_id": session_id}
        if run_id is not None:
            p["run_id"] = run_id
        data = self._execute("ai", "agent_get_steps", p)
        return data.get("steps", [])

    def ai_agent_cache_tool_result(self, key: str, result: Any,
                                    ttl: Optional[int] = None):
        """缓存 Agent 工具调用结果。"""
        p: Dict[str, Any] = {"key": key, "result": result}
        if ttl is not None:
            p["ttl"] = ttl
        self._execute("ai", "agent_cache_tool_result", p)

    def ai_agent_get_tool_cache(self, key: str) -> Optional[Any]:
        """获取缓存的工具调用结果。"""
        data = self._execute("ai", "agent_get_tool_cache", {"key": key})
        return data.get("result")

    # ── AI: Intent ──

    def ai_classify_intent(self, query: str,
                           embedding: List[float]) -> Dict:
        """意图分类。"""
        return self._execute("ai", "classify_intent", {
            "query": query, "embedding": embedding,
        })

    def ai_register_intent(self, intent: Dict,
                           embeddings: List[List[float]]):
        """注册意图模板。"""
        self._execute("ai", "register_intent", {
            "intent": intent, "embeddings": embeddings,
        })

    def ai_list_intents(self) -> List[Dict]:
        """列出所有已注册的意图。"""
        data = self._execute("ai", "list_intents")
        return data.get("intents", [])

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

    def ai_trace_stats(self, session_id: str) -> Dict:
        """获取 trace 统计信息。"""
        return self._execute("ai", "trace_stats", {
            "session_id": session_id,
        })

    def ai_trace_performance_report(self,
                                     session_id: Optional[str] = None,
                                     run_id: Optional[str] = None) -> Dict:
        """获取 trace 性能报告。"""
        p: Dict[str, Any] = {}
        if session_id is not None:
            p["session_id"] = session_id
        if run_id is not None:
            p["run_id"] = run_id
        return self._execute("ai", "trace_performance_report", p)

    def ai_query_traces(self, session_id: Optional[str] = None,
                        run_id: Optional[str] = None,
                        operation: Optional[str] = None,
                        limit: Optional[int] = None) -> List[Dict]:
        """查询 trace 记录。"""
        p: Dict[str, Any] = {}
        if session_id is not None:
            p["session_id"] = session_id
        if run_id is not None:
            p["run_id"] = run_id
        if operation is not None:
            p["operation"] = operation
        if limit is not None:
            p["limit"] = limit
        data = self._execute("ai", "query_traces", p)
        return data.get("traces", [])

    # ── AI: Embedding Cache ──

    def ai_embedding_cache_get(self, key: str) -> Optional[List[float]]:
        """获取缓存的 embedding 向量。"""
        data = self._execute("ai", "embedding_cache_get", {"key": key})
        return data.get("embedding")

    def ai_embedding_cache_set(self, key: str,
                                embedding: List[float],
                                ttl: Optional[int] = None):
        """缓存 embedding 向量。"""
        p: Dict[str, Any] = {"key": key, "embedding": embedding}
        if ttl is not None:
            p["ttl"] = ttl
        self._execute("ai", "embedding_cache_set", p)

    # ── AI: Token Count ──

    def ai_token_count(self, text: str,
                       encoding: str = "cl100k_base") -> int:
        """计算文本的 token 数量。"""
        data = self._execute("ai", "token_count", {
            "text": text, "encoding": encoding,
        })
        return data.get("count", 0)

    # ── AI: LLM Config ──

    def ai_set_llm_config(self, config: Dict):
        """设置 LLM 配置（API 端点/模型等）。"""
        self._execute("ai", "set_llm_config", {"config": config})

    def ai_get_llm_config(self) -> Dict:
        """获取当前 LLM 配置。"""
        return self._execute("ai", "get_llm_config")

    # ── AI: Auto Embed ──

    def ai_auto_embed(self, texts: List[str]) -> List[List[float]]:
        """自动调用配置的 embedding API 获取向量。"""
        data = self._execute("ai", "auto_embed", {"texts": texts})
        return data.get("embeddings", [])

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
