# Talon .NET SDK

通过 P/Invoke 封装 `talon_execute` C ABI，支持 .NET 8+。

## 前置

```bash
cargo build --release   # 编译 libtalon
```

## 用法

```csharp
using TalonDb;

using var db = new TalonClient("./my_data");
db.Sql("CREATE TABLE t (id INT, name TEXT)");
db.KvSet("key", "value");
Console.WriteLine(db.KvGet("key"));
```
