// 執行：node --test tests/
// 獲得角色字串 (notes.js)。存檔格式「角色*數量、角色」也是果實分配解析的格式，
// 改動格式化規則時，這裡的範例要一起確認果實分配那邊還能正確解析。
const test = require('node:test');
const assert = require('node:assert/strict');
const { getCleanNotes, parseCharacterList, formatCharacterString, countCharacters } = require('../notes.js');

const same = (inputs, expected) => {
    for (const s of inputs) assert.equal(formatCharacterString(s), expected, JSON.stringify(s));
};

test('格式化：各種分隔符號都整理成頓號', () => {
    same(['亞森 尼奧 杏子', '亞森,尼奧，杏子', '亞森+尼奧\n杏子', '亞森;尼奧；杏子', '亞森、 尼奧 、杏子'], '亞森、尼奧、杏子');
});

test('格式化：名稱在前的數量寫法', () => {
    same(['亞森*2', '亞森x2', '亞森X2', '亞森×2', '亞森2隻', '亞森2體', '亞森2個'], '亞森*2');
});

test('格式化：名稱和數量之間有空白也可以', () => {
    same(['亞森 *2', '亞森 x2', '亞森 x 2', '亞森 * 2', '亞森 2隻', '亞森 2 隻'], '亞森*2');
    assert.equal(formatCharacterString('亞森 2隻 尼奧'), '亞森*2、尼奧');
    assert.equal(formatCharacterString('亞森 x2 尼奧'), '亞森*2、尼奧');
});

test('格式化：數量在前的寫法', () => {
    same(['2*亞森', '2x亞森', '2×亞森', '2隻亞森', '2隻 亞森', '2亞森'], '亞森*2');
    assert.equal(formatCharacterString('尼奧、2隻 亞森'), '亞森*2、尼奧');
});

test('格式化：數字直接接名稱時，名稱要 2 個字以上 (「2B」「9S」是名稱)', () => {
    assert.equal(formatCharacterString('2B'), '2B');
    assert.equal(formatCharacterString('9S、2B'), '9S、2B');
    assert.equal(formatCharacterString('2新春'), '新春*2');
    assert.equal(formatCharacterString('2*B'), 'B*2', '有 * 時名稱 1 個字也可以');
});

test('格式化：名稱後面直接接數字，視為名稱的一部分', () => {
    assert.equal(formatCharacterString('亞森5'), '亞森5');
});

test('格式化：單獨的 *N 是前一個角色乘以 N', () => {
    assert.equal(formatCharacterString('杏子α、*2'), '杏子α*2');
    assert.equal(formatCharacterString('亞森、*2、尼奧'), '亞森*2、尼奧');
    assert.equal(formatCharacterString('亞森*2、*3'), '亞森*6');
    assert.equal(formatCharacterString('*2'), '', '前面沒有角色時忽略');
});

test('格式化：全形數字與全形星號', () => {
    same(['亞森＊２', '亞森２隻', '２亞森'], '亞森*2');
});

test('格式化：同名角色合併、依數量由多到少排序', () => {
    assert.equal(formatCharacterString('尼奧、亞森、亞森'), '亞森*2、尼奧');
    assert.equal(formatCharacterString('杏子、虹夏*3、杏子'), '虹夏*3、杏子*2');
    assert.equal(formatCharacterString('亞森*2、2隻亞森'), '亞森*4');
});

test('格式化：數量 1 不顯示、數量 0 拿掉', () => {
    assert.equal(formatCharacterString('亞森*1'), '亞森');
    assert.equal(formatCharacterString('亞森*0、尼奧'), '尼奧');
});

test('格式化：寶珠的純數字補上「顆」', () => {
    assert.equal(formatCharacterString('11', 'orb'), '11顆');
    assert.equal(formatCharacterString('114 顆', 'orb'), '114顆');
    assert.equal(formatCharacterString('11', 'honke'), '11');
});

test('格式化：開頭誤填的「N抽」會移除', () => {
    assert.equal(formatCharacterString('30抽 亞森x2'), '亞森*2');
    assert.equal(formatCharacterString('??抽：亞森'), '亞森');
});

test('格式化：存檔格式再格式化一次不會改變 (果實分配讀到的內容穩定)', () => {
    for (const s of ['亞森*2、尼奧', '虹夏*3、杏子*2、喜多', '11顆', '2B', '亞森5', '無']) {
        assert.equal(formatCharacterString(s), s);
        assert.equal(formatCharacterString(formatCharacterString(s + ' 尼奧')), formatCharacterString(s + ' 尼奧'));
    }
});

test('格式化：空字串', () => {
    assert.equal(formatCharacterString(''), '');
    assert.equal(formatCharacterString(undefined), '');
});

test('parseCharacterList：回傳名稱與數量', () => {
    assert.deepEqual(parseCharacterList('亞森 x2、尼奧'), [{ name: '亞森', count: 2 }, { name: '尼奧', count: 1 }]);
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
    assert.equal(countCharacters('亞森 2隻 尼奧'), 3);
    assert.equal(countCharacters('杏子α、*2'), 2);
});

test('countCharacters：不是角色的內容不算', () => {
    assert.equal(countCharacters(''), 0);
    assert.equal(countCharacters('無'), 0);
    assert.equal(countCharacters('11顆'), 0);
    assert.equal(countCharacters('11'), 0);
    assert.equal(countCharacters('3抽'), 0);
    assert.equal(countCharacters('30抽 亞森'), 1);
});
