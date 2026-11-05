// =====================================================
// 雲端同步：版本比對與三方合併 (純函式，不碰 DOM / Firebase)
// 瀏覽器：window.GachaSync；Node (測試)：require('./sync.js')
// =====================================================
(function (root) {
    'use strict';

    // 雲端文件的版本：version 每次寫入加 1；lastUpdated 一併比對，
    // 這樣還開著舊版網頁 (不會更新 version) 的分頁存檔時也偵測得到
    const cloudStampOf = (data) => ({
        version: data && Number.isInteger(data.version) ? data.version : 0,
        updatedAt: (data && data.lastUpdated && typeof data.lastUpdated.toMillis === 'function') ? data.lastUpdated.toMillis() : null
    });
    const sameStamp = (a, b) => !!a && !!b && a.version === b.version && a.updatedAt === b.updatedAt;

    // 比對紀錄內容時看 id 以外的所有欄位 (之後新增欄位也會一起比對)；
    // 物件的欄位順序不影響結果
    const stableStringify = (v) => {
        if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
        if (v && typeof v === 'object') {
            return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort()
                .map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
        }
        return JSON.stringify(v === undefined ? null : v);
    };
    const recordKey = (r) => { const { id, ...rest } = r; return stableStringify(rest); };
    const sameRecord = (a, b) => (a === undefined || b === undefined) ? a === b : recordKey(a) === recordKey(b);

    // 兩份紀錄清單內容是否完全相同 (不看順序)
    function sameRecordSet(a, b) {
        if (a.length !== b.length) return false;
        const byId = new Map(a.map((r) => [r.id, r]));
        return b.every((r) => byId.has(r.id) && sameRecord(byId.get(r.id), r));
    }

    // 本機相對於同步基準，改了幾筆 (新增 / 修改 / 刪除)
    function countChanges(base, local) {
        const baseById = new Map(base.map((r) => [r.id, r]));
        const localIds = new Set(local.map((r) => r.id));
        return local.filter((r) => !sameRecord(baseById.get(r.id), r)).length
            + base.filter((r) => !localIds.has(r.id)).length;
    }

    // 以紀錄 id 逐筆比較：
    //   只有一邊改了 (含刪除)      → 採用改了的那邊
    //   兩邊都改了同一筆           → 以本機 (正在存檔的這台) 為準
    //   一邊刪除、另一邊修改       → 保留修改後的紀錄
    //   兩邊新增的紀錄 id 剛好相同 → 兩筆都保留 (雲端那筆換新 id；只有這種情況會改 id)
    // 注意：果實分配用紀錄 id 記住匯入來源，其他地方不要更改既有紀錄的 id
    //   兩邊輸入了內容完全相同的紀錄 → 只留一筆
    function mergeRecords(base, local, remote) {
        const baseById = new Map(base.map((r) => [r.id, r]));
        const localById = new Map(local.map((r) => [r.id, r]));
        const remoteById = new Map(remote.map((r) => [r.id, r]));
        const ids = [...new Set([...remoteById.keys(), ...localById.keys(), ...baseById.keys()])];
        const usedIds = new Set(ids);
        let nextId = Date.now();
        const merged = [];
        let conflicts = 0;

        ids.forEach((id) => {
            const b = baseById.get(id), l = localById.get(id), r = remoteById.get(id);
            if (sameRecord(l, r)) { if (l) merged.push(l); }
            else if (sameRecord(l, b)) { if (r) merged.push(r); }
            else if (sameRecord(r, b)) { if (l) merged.push(l); }
            else if (!l || !r) { merged.push(l || r); }
            else if (!b) {
                merged.push(l);
                while (usedIds.has(nextId)) nextId++;
                usedIds.add(nextId);
                merged.push({ ...r, id: nextId++ });
            } else { merged.push(l); conflicts++; }
        });

        const seen = new Set();
        return {
            records: merged.filter((r) => { const k = recordKey(r); if (seen.has(k)) return false; seen.add(k); return true; }),
            conflicts
        };
    }

    const api = { cloudStampOf, sameStamp, stableStringify, recordKey, sameRecord, sameRecordSet, countChanges, mergeRecords };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.GachaSync = api;
})(this);
