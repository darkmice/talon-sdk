# Talon Node.js SDK

通过 ffi-napi 封装 `talon_execute` C ABI。

## 安装

```bash
cargo build --release   # 编译 Rust 动态库
cd sdk/nodejs
npm install
```

## 用法

```js
const { Talon } = require('talon-db');

const db = new Talon('./my_data');
db.sql("CREATE TABLE t (id INT, name TEXT)");
db.kvSet('key', 'value');
console.log(db.kvGet('key'));
db.close();
```
