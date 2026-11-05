// 執行：node --test tests/
// 版本比對與三方合併 (sync.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const { cloudStampOf, sameStamp, recordKey, sameRecord, sameRecordSet, countChanges, mergeRecords } = require('../sync.js');

const ts = (ms) => ({ toMillis: () => ms });
const rec = (id, extra = {}) => ({ id, date: '2026-11-01', event: 'E', account: 'A' + id, pulls: 10, notes: 'X', tag: 'honke', ...extra });
const byId = (list, id) => list.find((r) => r.id === id);

test('版本比對：沒有人改過就不算衝突', () => {
    assert.equal(sameStamp(cloudStampOf(null), cloudStampOf(null)), true, '雲端還沒有文件');
    const old = { records: [], lastUpdated: ts(1000) };
    assert.equal(sameStamp(cloudStampOf(old), cloudStampOf(old)), true, '舊資料沒有 version');
    assert.deepEqual(cloudStampOf(old), { version: 0, updatedAt: 1000 });
});

test('版本比對：其他裝置寫入都偵測得到', () => {
    const known = { version: 1, updatedAt: 2000 };
    const after = (data) => sameStamp(cloudStampOf({ records: [], ...data }), known);
    assert.equal(after({ version: 1, lastUpdated: ts(2000) }), true, '自己剛寫入的版本');
    assert.equal(after({ version: 2, lastUpdated: ts(3000) }), false, '新版頁面寫入');
    assert.equal(after({ version: 2, lastUpdated: ts(500) }), false, '對方電腦時間比較慢');
    assert.equal(after({ version: 2, lastUpdated: ts(2000) }), false, '同一毫秒寫入，靠 version');
    assert.equal(after({ version: 1, lastUpdated: ts(4000) }), false, '舊版頁面寫入 (不更新 version)，靠 lastUpdated');
    assert.equal(sameStamp(cloudStampOf({ version: 1, lastUpdated: ts(2000) }), null), false, '還沒載入過，要走合併');
});

test('紀錄比對：看 id 以外的所有欄位', () => {
    assert.equal(recordKey(rec(1)), recordKey({ ...rec(1), id: 2 }), 'id 不同、內容相同');
    assert.equal(sameRecord(rec(1), { tag: 'honke', notes: 'X', pulls: 10, account: 'A1', event: 'E', date: '2026-11-01', id: 1 }), true, '欄位順序不同');
    assert.equal(sameRecord(rec(1, { chars: [{ no: 1, n: 2 }] }), rec(1, { chars: [{ no: 1, n: 3 }] })), false, '新欄位不同');
    assert.equal(sameRecord(rec(1, { chars: [{ no: 1, n: 2 }] }), rec(1, { chars: [{ n: 2, no: 1 }] })), true, '巢狀物件欄位順序不同');
    assert.equal(sameRecord(rec(1, { chars: undefined }), rec(1)), true, 'undefined 等同沒有這個欄位');
    assert.equal(sameRecord(undefined, rec(1)), false);
    assert.equal(sameRecordSet([rec(1), rec(2)], [rec(2), rec(1)]), true, '不看順序');
    assert.equal(sameRecordSet([rec(1)], [rec(1), rec(2)]), false);
});

test('countChanges：新增、修改、刪除各算一筆', () => {
    assert.equal(countChanges([rec(1), rec(2)], [rec(1, { pulls: 5 }), rec(3)]), 3);
    assert.equal(countChanges([rec(1)], [rec(1)]), 0);
});

test('三方合併：兩邊改不同紀錄，兩邊的修改都保留', () => {
    const base = [rec(1), rec(2)];
    const m = mergeRecords(base, [rec(1), rec(2, { pulls: 20 }), rec(3)], [rec(1, { notes: 'Y' }), rec(2), rec(4)]);
    assert.equal(byId(m.records, 1).notes, 'Y');
    assert.equal(byId(m.records, 2).pulls, 20);
    assert.ok(byId(m.records, 3) && byId(m.records, 4), '兩邊新增的都在');
    assert.equal(m.conflicts, 0);
});

test('三方合併：只改了新欄位也會保留', () => {
    const base = [rec(1), rec(2)];
    const m = mergeRecords(base, [rec(1), rec(2, { pulls: 20 })], [rec(1, { chars: [{ no: 5 }] }), rec(2)]);
    assert.deepEqual(byId(m.records, 1).chars, [{ no: 5 }]);
    assert.equal(byId(m.records, 2).pulls, 20);
});

test('三方合併：兩邊都改同一筆，以這台為準並計為衝突', () => {
    const m = mergeRecords([rec(1)], [rec(1, { pulls: 1 })], [rec(1, { pulls: 2 })]);
    assert.equal(byId(m.records, 1).pulls, 1);
    assert.equal(m.conflicts, 1);
});

test('三方合併：刪除', () => {
    const base = [rec(1), rec(2)];
    assert.equal(byId(mergeRecords(base, [rec(1)], base).records, 2), undefined, '這台刪除、雲端沒改 → 刪除');
    assert.equal(byId(mergeRecords(base, base, [rec(1)]).records, 2), undefined, '雲端刪除、這台沒改 → 刪除');
    assert.equal(byId(mergeRecords(base, [rec(1)], [rec(1), rec(2, { notes: 'Y' })]).records, 2).notes, 'Y', '一邊刪除、一邊修改 → 保留修改');
    assert.equal(byId(mergeRecords(base, [rec(1), rec(2, { notes: 'Z' })], [rec(1)]).records, 2).notes, 'Z', '一邊修改、一邊刪除 → 保留修改');
});

test('三方合併：兩邊新增相同 id 的紀錄，兩筆都保留，這台的 id 不變', () => {
    const base = [rec(1)];
    const m = mergeRecords(base, [rec(1), rec(3, { event: 'L' })], [rec(1), rec(3, { event: 'R' })]);
    assert.equal(m.records.length, 3);
    assert.equal(byId(m.records, 3).event, 'L');
    const moved = m.records.find((r) => r.event === 'R');
    assert.ok(moved && moved.id !== 3 && moved.id !== 1, '雲端那筆換了新的 id');
});

test('三方合併：兩邊新增內容相同的紀錄只留一筆', () => {
    const base = [rec(1)];
    const m = mergeRecords(base, [rec(1), rec(3)], [rec(1), { ...rec(3), id: 4 }]);
    assert.equal(m.records.length, 2);
});

test('三方合併：沒有同步基準 (第一次) 時兩邊都保留', () => {
    const m = mergeRecords([], [rec(1)], [rec(2)]);
    assert.deepEqual(m.records.map((r) => r.id).sort(), [1, 2]);
});
