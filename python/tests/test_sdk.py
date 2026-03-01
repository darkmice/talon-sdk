"""Talon Python SDK 端到端测试 — 验证全部五大引擎 + AI 模块。"""

import os
import sys
import tempfile
import shutil

# 将 talon 包加入 path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from talon import Talon, TalonError


def test_sql_crud():
    """SQL 引擎：CREATE/INSERT/SELECT/UPDATE/DELETE。"""
    with tempfile.TemporaryDirectory() as tmp:
        db = Talon(tmp)
        try:
            db.sql("CREATE TABLE users (id INT, name TEXT)")
            db.sql("INSERT INTO users (id, name) VALUES (1, 'Alice')")
            db.sql("INSERT INTO users (id, name) VALUES (2, 'Bob')")
            rows = db.sql("SELECT * FROM users")
            assert len(rows) == 2, f"期望 2 行，得到 {len(rows)}"

            db.sql("UPDATE users SET name = 'Charlie' WHERE id = 2")
            rows = db.sql("SELECT name FROM users WHERE id = 2")
            assert len(rows) == 1
            # rows[0] 是一个列表，name 列
            assert rows[0][0] == "Charlie", f"期望 Charlie，得到 {rows[0][0]}"

            db.sql("DELETE FROM users WHERE id = 1")
            rows = db.sql("SELECT * FROM users")
            assert len(rows) == 1
            print("  ✅ SQL CRUD")
        finally:
            db.close()


def test_kv_operations():
    """KV 引擎：SET/GET/DEL/EXISTS/INCR/TTL/KEYS/MSET/MGET。"""
    with tempfile.TemporaryDirectory() as tmp:
        db = Talon(tmp)
        try:
            # set / get
            db.kv_set("k1", "v1")
            assert db.kv_get("k1") == "v1"

            # del
            assert db.kv_del("k1") == True
            assert db.kv_get("k1") is None

            # exists
            db.kv_set("k2", "v2")
            assert db.kv_exists("k2") == True
            assert db.kv_exists("k999") == False

            # incr
            val = db.kv_incr("counter")
            assert val == 1
            val = db.kv_incr("counter")
            assert val == 2

            # keys
            db.kv_set("user:1", "a")
            db.kv_set("user:2", "b")
            keys = db.kv_keys("user:")
            assert len(keys) == 2

            # mset / mget
            db.kv_mset(["mk1", "mk2"], ["mv1", "mv2"])
            vals = db.kv_mget(["mk1", "mk2", "mk_none"])
            assert vals[0] == "mv1"
            assert vals[1] == "mv2"
            assert vals[2] is None

            # keys_match
            keys = db.kv_keys_match("user:*")
            assert len(keys) == 2

            print("  ✅ KV Operations")
        finally:
            db.close()


def test_ts_operations():
    """TS 引擎：CREATE/INSERT/QUERY/AGGREGATE。"""
    with tempfile.TemporaryDirectory() as tmp:
        db = Talon(tmp)
        try:
            db.ts_create("metrics", tags=["host"], fields=["cpu", "mem"])
            for i in range(5):
                db.ts_insert("metrics", {
                    "timestamp": 1000 + i,
                    "tags": {"host": "srv1"},
                    "fields": {"cpu": str(50 + i), "mem": str(80)},
                })

            # query
            points = db.ts_query("metrics",
                                  tag_filters=[["host", "srv1"]])
            assert len(points) == 5, f"期望 5 点，得到 {len(points)}"

            # query with time range
            points = db.ts_query("metrics",
                                  tag_filters=[["host", "srv1"]],
                                  time_start=1002, time_end=1005)
            assert len(points) == 3, f"期望 3 点，得到 {len(points)}"

            # aggregate
            buckets = db.ts_aggregate("metrics", "cpu", "avg",
                                       tag_filters=[["host", "srv1"]])
            assert len(buckets) >= 1
            print("  ✅ TS Operations")
        finally:
            db.close()


def test_mq_operations():
    """MQ 引擎：CREATE/PUBLISH/SUBSCRIBE/POLL/ACK/LEN。"""
    with tempfile.TemporaryDirectory() as tmp:
        db = Talon(tmp)
        try:
            db.mq_create("tasks", max_len=100)

            # publish
            id1 = db.mq_publish("tasks", "job_1")
            id2 = db.mq_publish("tasks", "job_2")
            assert id1 == 1
            assert id2 == 2

            # len
            assert db.mq_len("tasks") == 2

            # subscribe + poll
            db.mq_subscribe("tasks", "workers")
            msgs = db.mq_poll("tasks", "workers", "w1", count=2)
            assert len(msgs) == 2

            # ack
            db.mq_ack("tasks", "workers", "w1", msgs[0]["id"])

            # list_subscriptions
            subs = db.mq_list_subscriptions("tasks")
            assert "workers" in subs

            # unsubscribe
            db.mq_unsubscribe("tasks", "workers")
            subs = db.mq_list_subscriptions("tasks")
            assert "workers" not in subs

            print("  ✅ MQ Operations")
        finally:
            db.close()


def test_vector_operations():
    """Vector 引擎：INSERT/SEARCH/DELETE/COUNT。"""
    with tempfile.TemporaryDirectory() as tmp:
        db = Talon(tmp)
        try:
            db.vector_insert("emb", 1, [1.0, 0.0, 0.0])
            db.vector_insert("emb", 2, [0.0, 1.0, 0.0])
            db.vector_insert("emb", 3, [0.0, 0.0, 1.0])

            assert db.vector_count("emb") == 3

            # search
            results = db.vector_search("emb", [1.0, 0.0, 0.0],
                                        k=2, metric="cosine")
            assert len(results) == 2
            assert results[0]["id"] == 1  # 最近邻

            # delete
            db.vector_delete("emb", 3)
            assert db.vector_count("emb") == 2

            print("  ✅ Vector Operations")
        finally:
            db.close()


def test_context_manager():
    """Context manager 支持。"""
    with tempfile.TemporaryDirectory() as tmp:
        with Talon(tmp) as db:
            db.kv_set("cm_key", "cm_val")
            assert db.kv_get("cm_key") == "cm_val"
        print("  ✅ Context Manager")


def test_persist():
    """persist 刷盘。"""
    with tempfile.TemporaryDirectory() as tmp:
        db = Talon(tmp)
        try:
            db.kv_set("p1", "v1")
            db.persist()  # 不报错即成功
            print("  ✅ Persist")
        finally:
            db.close()


def test_error_handling():
    """错误处理。"""
    with tempfile.TemporaryDirectory() as tmp:
        db = Talon(tmp)
        try:
            # 查询不存在的表
            try:
                db.sql("SELECT * FROM nonexistent")
                assert False, "应该抛出异常"
            except TalonError:
                pass

            # MQ: 发布到不存在的 topic
            try:
                db.mq_publish("ghost_topic", "msg")
                assert False, "应该抛出异常"
            except TalonError:
                pass

            print("  ✅ Error Handling")
        finally:
            db.close()


def test_stats():
    """stats 统计。"""
    with tempfile.TemporaryDirectory() as tmp:
        db = Talon(tmp)
        try:
            s = db.stats()
            assert "version" in s or "engine" in s
            print("  ✅ Stats")
        finally:
            db.close()


if __name__ == "__main__":
    print("Talon Python SDK 端到端测试")
    print("=" * 40)
    test_sql_crud()
    test_kv_operations()
    test_ts_operations()
    test_mq_operations()
    test_vector_operations()
    test_context_manager()
    test_persist()
    test_error_handling()
    test_stats()
    print("=" * 40)
    print("✅ 全部 9 项测试通过!")
