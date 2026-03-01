# Talon Java SDK

通过 JNA 封装 `talon_execute` C ABI，Java 11+。

## 安装

Maven:
```xml
<dependency>
  <groupId>io.talon</groupId>
  <artifactId>talon-java</artifactId>
  <version>0.1.3</version>
</dependency>
```

Native library 内嵌于 JAR 中，运行时自动提取，无需手动编译。

## 用法

```java
import io.talon.Talon;

try (Talon db = new Talon("./my_data")) {
    db.sql("CREATE TABLE t (id INT, name TEXT)");
    db.kvSet("key", "value", null);
    System.out.println(db.kvGet("key"));
}
```
