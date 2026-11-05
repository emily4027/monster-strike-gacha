// =====================================================
// 獲得角色字串：格式化與計算隻數 (純函式)
// 存檔格式為「角色*數量」以頓號分隔，果實分配也會解析這個格式
// 瀏覽器：window.GachaNotes；Node (測試)：require('./notes.js')
// =====================================================
(function (root) {
    'use strict';

    function getCleanNotes(notes) {
        if (typeof notes !== 'string' || !notes) return '';
        return notes.replace(/^(\d+)\s*抽\s*/, '').replace(/^(\?\?|？？)\s*抽\s*/, '').trim();
    }

    // 自動格式化與排序角色字串 (tag 為 orb 時，純數字會自動補上「顆」)
    function formatCharacterString(input, tag) {
        if (!input) return '';
        // 移除可能的「X抽」前綴 (如果使用者誤填，防呆用)
        const cleanInput = input.replace(/^(\d+|[\?？]+)\s*[抽].*?[:：\s]/, '');

        // 切割字串：支援 逗號, 頓號, 空白, 換行, 加號
        const parts = cleanInput.split(/[,，、\s\+\n]+/);
        const charList = [];

        parts.forEach((part) => {
            const p = part.trim();
            if (!p) return;

            const match = p.match(/^(.+?)(?:(?:[ *xX×]+)(\d+)[隻體]?|(\d+)[隻體])?$/);
            if (!match) return;

            let name = match[1].trim();
            let count = 1;

            // Group 2: 分隔符 + 數字 (*2)；Group 3: 數字 + 單位 (2隻)
            if (match[2]) count = parseInt(match[2], 10);
            else if (match[3]) count = parseInt(match[3], 10);

            if (tag === 'orb' && /^\d+$/.test(name)) name += '顆';

            // 合併重複輸入的角色
            const existing = charList.find((c) => c.name === name);
            if (existing) existing.count += count;
            else charList.push({ name, count });
        });

        // 排序：數量多 -> 數量少；數量為 1 時不顯示 *1
        charList.sort((a, b) => b.count - a.count);
        return charList.map((item) => (item.count > 1 ? `${item.name}*${item.count}` : item.name)).join('、');
    }

    // 獲得角色的隻數：用存檔時的格式 (角色*數量，以頓號分隔) 計算；
    // 「3抽」「11顆」、純數字、「無」不算角色
    function countCharacters(notes) {
        return formatCharacterString(getCleanNotes(notes), '').split('、').reduce((sum, part) => {
            const p = part.trim();
            const m = p.match(/^(.*?)\*(\d+)$/);
            const name = (m ? m[1] : p).trim();
            if (!name || /^\d+\s*[抽顆]?$/.test(name) || /^(無|沒有|没有|-|－)$/.test(name)) return sum;
            return sum + (m ? parseInt(m[2], 10) : 1);
        }, 0);
    }

    const api = { getCleanNotes, formatCharacterString, countCharacters };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.GachaNotes = api;
})(this);
