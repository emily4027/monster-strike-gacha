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

    // ---- 獲得角色的輸入格式 ----
    // 輸出 (存檔) 格式固定為「角色*數量」以頓號分隔，數量 1 不寫，例如「亞森*2、尼奧」。
    // 輸入可以比較隨意，以下寫法都會整理成「亞森*2」：
    //   亞森*2、亞森x2、亞森×2、亞森 *2、亞森 x 2、亞森2隻 (體 / 個)、亞森 2隻、
    //   2*亞森、2x亞森、2隻亞森、2亞森、亞森、*2 (單獨的 *2 = 前一個角色乘以 2)、全形的 ＊２
    // 「2亞森」這種數字直接接名稱的寫法，名稱要有 2 個字以上，避免把「2B」這類名稱拆開。
    // 名稱後面直接接數字 (亞森5) 視為名稱的一部分；寶珠標籤的純數字會補上「顆」。
    const SEP = '[,，、;；+\\s]';
    const SPLIT_RE = /[,，、;；+\s]+/;
    const TOKEN_END = '(?=$|' + SEP + ')';

    function normalizeCharacterInput(input) {
        return String(input)
            .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
            .replace(/＊/g, '*')
            // 移除開頭誤填的「X抽：」
            .replace(/^(\d+|[\?？]+)\s*[抽].*?[:：\s]/, '')
            // 「2 隻」→「2隻」、「* 2」→「*2」、「 x 2」→「 x2」
            .replace(/(\d)\s+([隻體個顆])/g, '$1$2')
            .replace(/([*×])\s+(?=\d)/g, '$1')
            .replace(/(^|\s)([xX])\s+(?=\d)/g, '$1$2')
            // 「亞森 *2」「亞森 x2」「亞森 2隻」：數量黏回前一個角色
            .replace(new RegExp('\\s+(?=[*×xX]\\d+' + TOKEN_END + ')', 'g'), '')
            .replace(new RegExp('([^\\d\\s])\\s+(?=\\d+[隻體個]' + TOKEN_END + ')', 'g'), '$1')
            // 開頭或分隔符號後的「2隻 亞森」→「2隻亞森」
            .replace(/(^|[,，、;；+])\s*(\d+[隻體個])\s+(?=[^\s\d])/g, '$1$2');
    }

    // 解析一項：回傳 { name, count }；單獨的乘數 (*2) 回傳 { multiplier }
    function parseCharacterToken(p) {
        let m = p.match(/^[*×xX](\d+)$/);
        if (m) return { multiplier: parseInt(m[1], 10) };

        // 名稱在前：亞森*2、亞森x2、亞森2隻
        m = p.match(/^(.+?)(?:[*×xX]+(\d+)[隻體個]?|(\d+)[隻體個])$/);
        if (m) return { name: m[1].trim(), count: parseInt(m[2] || m[3], 10) };

        // 數量在前：2*亞森、2x亞森、2隻亞森 (名稱 1 個字以上)；2亞森 (名稱 2 個字以上)
        m = p.match(/^(\d+)(?:[*×xX]|[隻體個])(.+)$/);
        if (m && /\D/.test(m[2])) return { name: m[2].trim(), count: parseInt(m[1], 10) };
        m = p.match(/^(\d+)(.+)$/);
        if (m && [...m[2]].length >= 2 && !/^[抽顆隻體個]/.test(m[2]) && /\D/.test(m[2])) {
            return { name: m[2].trim(), count: parseInt(m[1], 10) };
        }
        return { name: p, count: 1 };
    }

    // 解析成 [{ name, count }]：同名角色合併，依數量由多到少排序
    function parseCharacterList(input, tag) {
        if (!input) return [];
        const list = [];
        let last = null;   // 上一項加到哪個角色、加了多少 (給單獨的 *2 用)

        normalizeCharacterInput(input).split(SPLIT_RE).forEach((part) => {
            const p = part.trim();
            if (!p) return;
            const token = parseCharacterToken(p);

            if (token.multiplier !== undefined) {
                if (last && token.multiplier > 0) {
                    last.entry.count += last.added * (token.multiplier - 1);
                    last.added *= token.multiplier;
                }
                return;
            }

            let { name, count } = token;
            if (!name || !(count > 0)) { last = null; return; }
            if (tag === 'orb' && /^\d+$/.test(name)) name += '顆';

            let entry = list.find((c) => c.name === name);
            if (entry) entry.count += count;
            else list.push(entry = { name, count });
            last = { entry, added: count };
        });

        return list.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
    }

    // 自動格式化與排序角色字串 (tag 為 orb 時，純數字會自動補上「顆」)
    function formatCharacterString(input, tag) {
        return parseCharacterList(input, tag)
            .map((item) => (item.count > 1 ? item.name + '*' + item.count : item.name)).join('、');
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

    // 角色名稱修正 (角色圖鑑管理員的 shared/characters)：把 notes 裡的名稱換成修正後的名稱
    //   rename(名稱) → 修正後的名稱 (不用改時回傳原名稱)
    //   果實分配的同名編號與註記會保留：「砲姐-2(擊種)」→「御坂美琴-2(擊種)」
    //   改完同名的會合併：「砲姐、御坂美琴」→「御坂美琴*2」
    //   新名稱裡的空白會拿掉 (空白是角色的分隔符號)；沒有要改的名稱時原樣回傳
    const NAME_SUFFIX_RE = /^(.*?)((?:-\d+)?(?:\s*[(（](?:同族|戰型|擊種|雙削)[)）])?)$/;
    function renameCharacters(notes, tag, rename) {
        if (typeof notes !== 'string' || !notes || tag === 'orb' || typeof rename !== 'function') return notes;
        let changed = false;
        const list = parseCharacterList(notes, tag).map((c) => {
            const m = c.name.match(NAME_SUFFIX_RE);
            const base = m ? m[1].trim() : c.name;
            const to = base ? String(rename(base) || '').replace(/\s+/g, '') : '';
            if (!to || to === base) return c;
            changed = true;
            return { name: to + (m ? m[2].trim() : ''), count: c.count };
        });
        if (!changed) return notes;
        return formatCharacterString(list.map((c) => (c.count > 1 ? `${c.name}*${c.count}` : c.name)).join('、'), tag);
    }

    const api = { getCleanNotes, parseCharacterList, formatCharacterString, countCharacters, renameCharacters };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.GachaNotes = api;
})(this);
