# Talon Java SDK

通过 JNA 封装 `talon_execute` C ABI，Java 11+。

## 前置

```bash
cargo build --release   # 编译 libtalon
```

## 用法

```java
import io.talon.Talon;

try (Talon db = new Talon("./my_data")) {
    db.sql("CREATE TABLE t (id INT, name TEXT)");
    db.kvSet("key", "value", null);
    System.out.println(db.kvGet("key"));
}
```
