# Talon Node.js SDK

通过 ffi-napi 封装 `talon_execute` C ABI。

## 安装

```bash
npm install talon-db
```

Native library 在 `npm install` 时自动从 GitHub Releases 下载，无需手动编译。

## 用法

```js
const { Talon } = require('talon-db');

const db = new Talon('./my_data');
db.sql("CREATE TABLE t (id INT, name TEXT)");
db.kvSet('key', 'value');
console.log(db.kvGet('key'));
db.close();
```
