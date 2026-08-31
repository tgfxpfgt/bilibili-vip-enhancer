#!/usr/bin/env node
/**
 * 油猴脚本同步校验
 * 用法: node tools/check-userjs-sync.mjs
 *
 * 校验 bilibili-vip-enhancer.user.js 与扩展 manifest.json 的一致性：
 * 1. @version 与 manifest.version 必须一致
 * 2. UserScript 头部必须包含关键字段（@name/@match/@grant/@run-at）
 * 3. 脚本可被 Node 语法解析
 *
 * CI / 迭代时运行：扩展版本升级而油猴脚本未同步时会报错退出。
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const userJsPath = path.join(root, 'bilibili-vip-enhancer.user.js');
const manifestPath = path.join(root, 'manifest.json');

let failed = false;
const fail = (msg) => { console.error('FAIL:', msg); failed = true; };
const ok = (msg) => console.log('PASS:', msg);

// 1. 语法解析
const src = fs.readFileSync(userJsPath, 'utf8');
new Function(src);
ok('语法解析通过');

// 2. UserScript 头部字段
const metaMatch = src.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
if (!metaMatch) {
  fail('缺少 UserScript 元数据头');
  process.exit(1);
}
const meta = metaMatch[1];
for (const field of ['@name', '@version', '@match', '@grant', '@run-at', '@description']) {
  if (!meta.includes(field)) fail(`头部缺少 ${field}`);
}
if (!failed) ok('头部字段完整');

// 3. 版本一致性
const ver = (meta.match(/@version\s+(\S+)/) || [])[1];
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (ver !== manifest.version) {
  fail(`版本不一致: user.js=${ver} manifest=${manifest.version}，请同步更新油猴脚本`);
} else {
  ok(`版本一致: ${ver}`);
}

// 4. 功能同步提示：列出扩展存在但需人工对照的模块映射
const moduleMap = [
  ['content/player-enhancer.js', 'Player'],
  ['content/danmaku-manager.js', 'Danmaku'],
  ['content/page-purifier.js', 'Purifier'],
  ['content/browse-tools.js#setupFeedFilter', 'FeedFilter'],
  ['popup/popup.js', 'SettingsPanel']
];
console.log('\n功能模块对照（迭代时人工检查是否需要同步）:');
for (const [ext, lite] of moduleMap) {
  console.log(`  ${ext}  ->  ${lite}`);
}

process.exit(failed ? 1 : 0);
