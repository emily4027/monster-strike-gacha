// 執行：node --test tests/
// 獲得角色字串 (notes.js)。存檔格式「角色*數量、角色」也是果實分配解析的格式，
// 改動格式化規則時，這裡的範例要一起確認果實分配那邊還能正確解析。
const test = require('node:test');
const assert = require('node:assert/strict');
const { getCleanNotes, formatCharacterString, countCharacters } = require('../notes.js');

test('格式化：各種分隔符號都整理成頓號', () => {
    assert.equal(formatCharacterString('亞森x2 尼奧'), '亞森*2、尼奧');
    assert.equal(formatCharacterString('亞森,尼奧，杏子'), '亞森、尼奧、杏子');
    assert.equal(formatCharacterString('亞森+尼奧\n杏子'), '亞森、尼奧、杏子');
});

test('格式化：數量寫法統一成 *N，數量 1 不顯示', () => {
    assert.equal(formatCharacterString('亞森*2'), '亞森*2');
    assert.equal(formatCharacterString('亞森×3'), '亞森*3');
    // 目前的行為：空白是分隔符號，所以「亞森 2隻」會被拆成兩項 (要寫成「亞森2隻」或「亞森*2」)
    assert.equal(formatCharacterString('亞森 2隻'), '亞森、2隻');
    assert.equal(formatCharacterString('亞森2隻'), '亞森*2');
    assert.equal(formatCharacterString('亞森*1'), '亞森');
});

test('格式化：同名角色合併、依數量由多到少排序', () => {
    assert.equal(formatCharacterString('尼奧、亞森、亞森'), '亞森*2、尼奧');
    assert.equal(formatCharacterString('杏子、虹夏*3、杏子'), '虹夏*3、杏子*2');
});

test('格式化：寶珠的純數字補上「顆」', () => {
    assert.equal(formatCharacterString('11', 'orb'), '11顆');
    assert.equal(formatCharacterString('11', 'honke'), '11');
});

test('格式化：已經格式化過的字串不會再改變', () => {
    for (const s of ['亞森*2、尼奧', '虹夏*3、杏子*2、喜多', '11顆']) {
        assert.equal(formatCharacterString(s), s);
    }
});

test('格式化：空字串', () => {
    assert.equal(formatCharacterString(''), '');
    assert.equal(formatCharacterString(undefined), '');
});

test('getCleanNotes：移除開頭的「N抽」', () => {
    assert.equal(getCleanNotes('30抽 亞森'), '亞森');
    assert.equal(getCleanNotes('??抽 亞森'), '亞森');
    assert.equal(getCleanNotes('亞森'), '亞森');
    assert.equal(getCleanNotes(null), '');
});

test('countCharacters：計算抽到幾隻', () => {
    assert.equal(countCharacters('亞森*2、尼奧'), 3);
    assert.equal(countCharacters('虹夏、虹夏、喜多*2'), 4);
    assert.equal(countCharacters('亞森x2 尼奧'), 3);
});

test('countCharacters：不是角色的內容不算', () => {
    assert.equal(countCharacters(''), 0);
    assert.equal(countCharacters('無'), 0);
    assert.equal(countCharacters('11顆'), 0);
    assert.equal(countCharacters('11'), 0);
    assert.equal(countCharacters('3抽'), 0);
    assert.equal(countCharacters('30抽 亞森'), 1);
});
