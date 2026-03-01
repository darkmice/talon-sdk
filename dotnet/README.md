# Talon .NET SDK

通过 P/Invoke 封装 `talon_execute` C ABI，支持 .NET 8+。

## 安装

```bash
dotnet add package TalonDb
```

Native library 已内置于 NuGet 包中（`runtimes/{rid}/native/`），无需手动编译。

## 用法

```csharp
using TalonDb;

using var db = new TalonClient("./my_data");
db.Sql("CREATE TABLE t (id INT, name TEXT)");
db.KvSet("key", "value");
Console.WriteLine(db.KvGet("key"));
```
