"""Talon Python SDK — ctypes 封装 talon_execute C ABI。"""

import ctypes
import json
import os
import platform
from typing import Any, Dict, List, Optional

from ._ai_mixin import AiMixin


def _unwrap_value(v):
    """将 Talon Value 枚举解包为 Python 原生类型。

    Talon 的 Value 序列化为带标签 JSON：
    - null / "Null" → None
    - {"Integer": 42} → 42
    - {"Float": 3.14} → 3.14
    - {"Text": "hello"} → "hello"
    - {"Boolean": true} → True
    - {"Jsonb": {...}} → dict
    - {"Vector": [0.1, ...]} → list[float]
    - {"Timestamp": 1234} → int
    - {"GeoPoint": [lat, lng]} → [lat, lng]
    - {"Blob": [...]} → bytes
    - 纯量（int/float/str/bool/None）→ 直接返回
    """
    if v is None or v == "Null":
        return None
    if isinstance(v, (int, float, str, bool)):
        return v
    if isinstance(v, dict) and len(v) == 1:
        tag, inner = next(iter(v.items()))
        if tag == "Blob" and isinstance(inner, list):
            return bytes(inner)
        return inner
    return v


def _unwrap_rows(rows):
    """解包 SQL 结果行中的所有 Value。"""
    return [[_unwrap_value(cell) for cell in row] for row in rows]


def _python_to_value(v):
    """将 Python 原生值转换为 Talon Value JSON 格式。

    - None → "Null"
    - bool → {"Boolean": true/false}  (注意：bool 在 int 之前检查)
    - int → {"Integer": n}
    - float → {"Float": f}
    - str → {"Text": s}
    - list[float] → {"Vector": [...]}
    - bytes → {"Blob": [...]}
    """
    if v is None:
        return "Null"
    if isinstance(v, bool):
        return {"Boolean": v}
    if isinstance(v, int):
        return {"Integer": v}
    if isinstance(v, float):
        return {"Float": v}
    if isinstance(v, str):
        return {"Text": v}
    if isinstance(v, (list, tuple)):
        return {"Vector": [float(x) for x in v]}
    if isinstance(v, bytes):
        return {"Blob": list(v)}
    raise TalonError(f"不支持的参数类型: {type(v)}")


def _find_lib() -> str:
    """查找 libtalon 动态库路径。"""
    system = platform.system()
    machine = platform.machine()
    if system == "Darwin":
        name = "libtalon.dylib"
        arch = "arm64" if machine == "arm64" else "amd64"
        plat_dir = f"darwin_{arch}"
    elif system == "Windows":
        name = "talon.dll"
        plat_dir = "windows_amd64"
    else:
        name = "libtalon.so"
        arch = "arm64" if machine == "aarch64" else "amd64"
        plat_dir = f"linux_{arch}"

    # 1. 环境变量
    env_path = os.environ.get("TALON_LIB_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path

    # 2. SDK 内嵌库: talon-sdk/lib/{platform}/
    here = os.path.dirname(os.path.abspath(__file__))
    sdk_root = os.path.dirname(os.path.dirname(here))
    bundled = os.path.join(sdk_root, "lib", plat_dir, name)
    if os.path.isfile(bundled):
        return bundled

    # 3. 同目录
    local = os.path.join(here, name)
    if os.path.isfile(local):
        return local

    return name  # 回退到系统搜索路径


class TalonError(Exception):
    """Talon 操作错误。"""
    pass


class Talon(AiMixin):
    """Talon 数据库客户端（嵌入式模式）。

    通过 C ABI 直接调用 Talon 引擎，无需启动 Server。
    """

    def __init__(self, path: str, lib_path: Optional[str] = None):
        """打开数据库。

        Args:
            path: 数据目录路径。
            lib_path: libtalon 动态库路径（可选）。
        """
        lib_file = lib_path or _find_lib()
        self._lib = ctypes.CDLL(lib_file)
        self._setup_ffi()
        self._handle = self._lib.talon_open(path.encode("utf-8"))
        if not self._handle:
            raise TalonError(f"无法打开数据库: {path}")

    def _setup_ffi(self):
        """配置 C ABI 函数签名。"""
        lib = self._lib
        lib.talon_open.argtypes = [ctypes.c_char_p]
        lib.talon_open.restype = ctypes.c_void_p
        lib.talon_close.argtypes = [ctypes.c_void_p]
        lib.talon_close.restype = None
        # out_json 是 *mut *mut c_char，用 POINTER(c_void_p) 保留原始指针
        lib.talon_execute.argtypes = [
            ctypes.c_void_p,
            ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_void_p),
        ]
        lib.talon_execute.restype = ctypes.c_int
        lib.talon_free_string.argtypes = [ctypes.c_void_p]
        lib.talon_free_string.restype = None
        lib.talon_persist.argtypes = [ctypes.c_void_p]
        lib.talon_persist.restype = ctypes.c_int

    def _execute(self, module: str, action: str = "",
                 params: Optional[Dict] = None) -> Any:
        """执行通用命令，返回 data 字段。"""
        if not self._handle:
            raise TalonError("数据库已关闭")
        cmd = {"module": module, "action": action,
               "params": params or {}}
        cmd_json = json.dumps(cmd).encode("utf-8")
        out = ctypes.c_void_p()
        rc = self._lib.talon_execute(
            self._handle, cmd_json, ctypes.byref(out))
        if rc != 0:
            raise TalonError("talon_execute 调用失败")
        if not out.value:
            raise TalonError("talon_execute 返回空指针")
        try:
            raw = ctypes.cast(out, ctypes.c_char_p).value
            result = json.loads(raw.decode("utf-8"))
        finally:
            self._lib.talon_free_string(out)
        if not result.get("ok"):
            raise TalonError(result.get("error", "未知错误"))
        return result.get("data", {})

    def close(self):
        """关闭数据库。"""
        if self._handle:
            self._lib.talon_close(self._handle)
            self._handle = None

    def __del__(self):
        self.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def persist(self):
        """刷盘。"""
        if not self._handle:
            raise TalonError("数据库已关闭")
        if self._lib.talon_persist(self._handle) != 0:
            raise TalonError("persist 失败")

    def stats(self) -> Dict:
        """获取引擎统计信息。"""
        return self._execute("stats")

    # ── SQL ──

    def sql(self, query: str,
            bind: Optional[List] = None) -> List[List]:
        """执行 SQL，返回结果行（Value 自动解包为 Python 原生类型）。

        Args:
            query: SQL 语句，支持 `?` 占位符。
            bind: 参数列表，按顺序绑定到 `?` 占位符。
                  Python 类型自动映射：int→Integer, float→Float,
                  str→Text, bool→Boolean, None→Null。

        示例::

            db.sql("SELECT * FROM t WHERE id = ? AND name = ?", [1, 'Alice'])
            db.sql("INSERT INTO t VALUES (?, ?, ?)", [1, 'hello', 3.14])
        """
        p: Dict[str, Any] = {"sql": query}
        if bind is not None:
            p["bind"] = [_python_to_value(v) for v in bind]
        data = self._execute("sql", params=p)
        return _unwrap_rows(data.get("rows", []))

    # ── KV ──

    def kv_set(self, key: str, value: str,
               ttl: Optional[int] = None):
        """KV SET。"""
        p = {"key": key, "value": value}
        if ttl is not None:
            p["ttl"] = ttl
        self._execute("kv", "set", p)

    def kv_get(self, key: str) -> Optional[str]:
        """KV GET，不存在返回 None。"""
        data = self._execute("kv", "get", {"key": key})
        return data.get("value")

    def kv_del(self, key: str) -> bool:
        """KV DEL，返回是否存在。"""
        data = self._execute("kv", "del", {"key": key})
        return data.get("deleted", False)

    def kv_exists(self, key: str) -> bool:
        """KV EXISTS。"""
        data = self._execute("kv", "exists", {"key": key})
        return data.get("exists", False)

    def kv_incr(self, key: str) -> int:
        """KV INCR 原子自增。"""
        data = self._execute("kv", "incr", {"key": key})
        return data.get("value", 0)

    def kv_keys(self, prefix: str = "") -> List[str]:
        """KV KEYS 前缀扫描。"""
        data = self._execute("kv", "keys", {"prefix": prefix})
        return data.get("keys", [])

    def kv_mset(self, keys: List[str], values: List[str]):
        """KV MSET 批量设置。"""
        self._execute("kv", "mset",
                       {"keys": keys, "values": values})

    def kv_mget(self, keys: List[str]) -> List[Optional[str]]:
        """KV MGET 批量获取。"""
        data = self._execute("kv", "mget", {"keys": keys})
        return data.get("values", [])

    def kv_keys_match(self, pattern: str) -> List[str]:
        """KV KEYS glob 模式匹配（支持 * 和 ?）。"""
        data = self._execute("kv", "keys_match",
                              {"pattern": pattern})
        return data.get("keys", [])

    def kv_expire(self, key: str, seconds: int):
        """设置 TTL。"""
        self._execute("kv", "expire",
                       {"key": key, "seconds": seconds})

    def kv_ttl(self, key: str) -> Optional[int]:
        """查询剩余 TTL。"""
        data = self._execute("kv", "ttl", {"key": key})
        return data.get("ttl")

    # ── TS (时序) ──

    def ts_create(self, name: str,
                  tags: Optional[List[str]] = None,
                  fields: Optional[List[str]] = None):
        """创建时序表。"""
        self._execute("ts", "create", {
            "name": name,
            "tags": tags or [],
            "fields": fields or [],
        })

    def ts_insert(self, name: str, point: Dict):
        """插入数据点。point 需含 timestamp/tags/fields。"""
        self._execute("ts", "insert", {
            "name": name, "point": point,
        })

    def ts_query(self, name: str,
                 tag_filters: Optional[List] = None,
                 time_start: Optional[int] = None,
                 time_end: Optional[int] = None,
                 desc: bool = False,
                 limit: Optional[int] = None) -> List[Dict]:
        """查询时序数据。"""
        p: Dict[str, Any] = {"name": name}
        if tag_filters:
            p["tag_filters"] = tag_filters
        if time_start is not None:
            p["time_start"] = time_start
        if time_end is not None:
            p["time_end"] = time_end
        if desc:
            p["desc"] = True
        if limit is not None:
            p["limit"] = limit
        data = self._execute("ts", "query", p)
        return data.get("points", [])

    def ts_aggregate(self, name: str, field: str, func: str,
                     tag_filters: Optional[List] = None,
                     time_start: Optional[int] = None,
                     time_end: Optional[int] = None,
                     interval_ms: Optional[int] = None) -> List[Dict]:
        """时序聚合查询。func: count/sum/avg/min/max。"""
        p: Dict[str, Any] = {
            "name": name, "field": field, "func": func,
        }
        if tag_filters:
            p["tag_filters"] = tag_filters
        if time_start is not None:
            p["time_start"] = time_start
        if time_end is not None:
            p["time_end"] = time_end
        if interval_ms is not None:
            p["interval_ms"] = interval_ms
        data = self._execute("ts", "aggregate", p)
        return data.get("buckets", [])

    def ts_set_retention(self, name: str, retention_ms: int):
        """设置保留策略（毫秒）。"""
        self._execute("ts", "set_retention", {
            "name": name, "retention_ms": retention_ms,
        })

    def ts_purge_expired(self, name: str) -> int:
        """清理过期数据，返回清理数量。"""
        data = self._execute("ts", "purge_expired", {"name": name})
        return data.get("purged", 0)

    def ts_purge_by_tag(self, name: str,
                        tag_filters: List) -> int:
        """按标签清理数据。"""
        data = self._execute("ts", "purge_by_tag", {
            "name": name, "tag_filters": tag_filters,
        })
        return data.get("purged", 0)

    # ── MQ (消息队列) ──

    def mq_create(self, topic: str, max_len: int = 0):
        """创建 topic。"""
        self._execute("mq", "create", {
            "topic": topic, "max_len": max_len,
        })

    def mq_publish(self, topic: str, payload: str) -> int:
        """发布消息，返回消息 ID。"""
        data = self._execute("mq", "publish", {
            "topic": topic, "payload": payload,
        })
        return data.get("id", 0)

    def mq_poll(self, topic: str, group: str,
                consumer: str, count: int = 1,
                block_ms: int = 0) -> List[Dict]:
        """拉取消息。block_ms>0 时阻塞等待直到有消息或超时。"""
        data = self._execute("mq", "poll", {
            "topic": topic, "group": group,
            "consumer": consumer, "count": count,
            "block_ms": block_ms,
        })
        return data.get("messages", [])

    def mq_ack(self, topic: str, group: str,
               consumer: str, message_id: int):
        """确认消息。"""
        self._execute("mq", "ack", {
            "topic": topic, "group": group,
            "consumer": consumer, "message_id": message_id,
        })

    def mq_len(self, topic: str) -> int:
        """获取 topic 消息数。"""
        data = self._execute("mq", "len", {"topic": topic})
        return data.get("len", 0)

    def mq_drop(self, topic: str):
        """删除 topic。"""
        self._execute("mq", "drop", {"topic": topic})

    def mq_subscribe(self, topic: str, group: str):
        """注册消费者组订阅到 topic（持久化绑定）。"""
        self._execute("mq", "subscribe",
                       {"topic": topic, "group": group})

    def mq_unsubscribe(self, topic: str, group: str):
        """取消消费者组对 topic 的订阅。"""
        self._execute("mq", "unsubscribe",
                       {"topic": topic, "group": group})

    def mq_list_subscriptions(self, topic: str) -> List[str]:
        """列出 topic 的所有订阅消费者组。"""
        data = self._execute("mq", "list_subscriptions",
                              {"topic": topic})
        return data.get("groups", [])

    # ── Vector (向量) ──

    def vector_insert(self, name: str, id: int,
                      vector: List[float]):
        """插入向量。"""
        self._execute("vector", "insert", {
            "name": name, "id": id, "vector": vector,
        })

    def vector_search(self, name: str, vector: List[float],
                      k: int = 10,
                      metric: str = "cosine") -> List[Dict]:
        """向量搜索，返回 [{id, distance}, ...]。"""
        data = self._execute("vector", "search", {
            "name": name, "vector": vector,
            "k": k, "metric": metric,
        })
        return data.get("results", [])

    def vector_delete(self, name: str, id: int):
        """删除向量。"""
        self._execute("vector", "delete", {
            "name": name, "id": id,
        })

    def vector_count(self, name: str) -> int:
        """向量数量。"""
        data = self._execute("vector", "count", {"name": name})
        return data.get("count", 0)

    def vector_batch_insert(self, name: str,
                            items: List[Dict]):
        """批量插入向量。items: [{"id": int, "vector": [float]}, ...]"""
        data = self._execute("vector", "batch_insert", {
            "name": name, "items": items,
        })
        return data.get("inserted", 0)

    def vector_batch_search(self, name: str,
                            vectors: List[List[float]],
                            k: int = 10,
                            metric: str = "cosine") -> List[List[Dict]]:
        """批量向量搜索，返回 [[{id, distance}, ...], ...]。"""
        data = self._execute("vector", "batch_search", {
            "name": name, "vectors": vectors,
            "k": k, "metric": metric,
        })
        return data.get("results", [])

    def vector_set_ef_search(self, name: str, ef_search: int):
        """设置向量索引运行时搜索宽度 ef_search。"""
        self._execute("vector", "set_ef_search", {
            "name": name, "ef_search": ef_search,
        })

    # ── Cluster (集群) ──

    def cluster_status(self) -> Dict:
        """查询集群状态（角色/LSN/从节点列表）。"""
        return self._execute("cluster", "status")

    def cluster_role(self) -> Any:
        """查询当前集群角色。"""
        data = self._execute("cluster", "role")
        return data.get("role")

    def cluster_promote(self) -> Dict:
        """将 Replica 提升为 Primary。"""
        return self._execute("cluster", "promote")

    def cluster_replicas(self) -> List[Dict]:
        """查询从节点列表。"""
        data = self._execute("cluster", "replicas")
        if isinstance(data, list):
            return data
        return []

    # ── Ops (运维) ──

    def database_stats(self) -> Dict:
        """获取数据库全局统计信息。"""
        return self._execute("database_stats")

    def health_check(self) -> Dict:
        """执行健康检查。"""
        return self._execute("health_check")
