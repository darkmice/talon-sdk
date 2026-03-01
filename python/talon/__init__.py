"""
Talon — 面向本地 AI 的多模融合数据引擎 Python SDK。

基于 ctypes 封装 talon_execute C ABI，零编译依赖。

用法::

    from talon import Talon

    db = Talon("./my_data")
    db.sql("CREATE TABLE t (id INT, name TEXT)")
    db.sql("INSERT INTO t VALUES (1, 'hello')")
    rows = db.sql("SELECT * FROM t")

    db.kv_set("key", "value")
    print(db.kv_get("key"))

    db.close()
"""

from talon.client import Talon, TalonError

__all__ = ["Talon", "TalonError"]
__version__ = "0.1.6"
