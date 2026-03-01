# Talon Java SDK

通过 JNA 封装 `talon_execute` C ABI，Java 11+。

## 安装

Java SDK 暂未发布到 Maven Central，需从源码构建：

```bash
git clone https://github.com/darkmice/talon-sdk.git
cd talon-sdk/java
mvn install
```

> **注意**：构建前需确保 `lib/` 目录包含对应平台的 native library（由 CI 自动推送，或从 [GitHub Releases](https://github.com/darkmice/talon-bin/releases) 手动下载）。

## 用法

```java
import io.talon.Talon;

try (Talon db = new Talon("./my_data")) {
    db.sql("CREATE TABLE t (id INT, name TEXT)");
    db.kvSet("key", "value", null);
    System.out.println(db.kvGet("key"));
}
```
