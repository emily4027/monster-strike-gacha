document.addEventListener('DOMContentLoaded', () => {

    // =====================================================
    // 檔案結構
    //   1. 設定與常數
    //   2. DOM 快取與狀態
    //   3. 工具函式 (跳脫、資料驗證、日期/名稱處理、活動資料整理)
    //   4. 雲端狀態、登入與管理員判斷 (Firebase)
    //   5. 存檔 / 讀取 (LocalStorage + 雲端)
    //   6. 角色字串格式化與活動清單 (events.json / Firestore)
    //   7. 渲染 (表格、統計、各種下拉選單)
    //   8. 表單模式 (新增 / 編輯 / 帳號)
    //   9. 事件綁定 (含管理員功能)
    //  10. 啟動
    //
    //  活動清單的資料來源：
    //    - events.json：靜態備援 / 初始資料
    //    - Firestore shared/events：管理員維護的正式清單 (有資料時優先使用)
    //  管理員判斷：Firestore 存在 admins/{登入者 uid} 文件即為管理員。
    //  真正的寫入權限由 Firestore 規則把關，前端判斷只用來顯示 / 隱藏按鈕。
    // =====================================================


    // 純函式放在 sync.js、notes.js (有自動化測試，見 tests/)
    const { cloudStampOf, sameStamp, sameRecordSet, countChanges, mergeRecords } = window.GachaSync;
    const { getCleanNotes, parseCharacterList, formatCharacterString, countCharacters, renameCharacters } = window.GachaNotes;

    // =====================================================
    // 1. 設定與常數
    // =====================================================
    const USER_CACHE_KEY = 'gacha_user_cache_v1';        // sessionStorage：登入者資訊
    const OLD_DATA_CACHE_PREFIX = 'gacha_cloud_data_';   // sessionStorage：舊版的雲端資料快取 (已停用，只用來清除)
    const LOCAL_RECORDS_KEY = 'gachaRecords';            // localStorage：本機紀錄
    const LAST_UID_KEY = 'gacha_last_uid_v1';            // localStorage：本機紀錄最後一次對應的雲端帳號
    const UNSYNCED_KEY = 'gacha_unsynced_v1';            // localStorage：本機有還沒存到雲端的修改
    const SYNC_BASE_PREFIX = 'gacha_sync_base_v1_';      // localStorage：上次和雲端同步時的紀錄 (三方合併的基準)

    // Firestore 路徑
    const SHARED_COLLECTION = 'shared';                  // shared/events：所有人可讀、管理員可寫
    const EVENTS_DOC_ID = 'events';
    const CHARACTER_FIXES_DOC_ID = 'characters';         // shared/characters：角色圖鑑的名稱修正 (只讀)
    const ADMINS_COLLECTION = 'admins';                  // admins/{uid}：存在即為管理員

    // 懸浮工具箱：工具清單讀取工具箱的 tools.js，讀不到時保留 index.html 裡寫死的連結
    const TOOLBOX_TOOLS_URL = 'https://emily4027.github.io/monster-strike-toolbox/tools.js';
    const THIS_TOOL_ID = 'gacha';

    // 角色圖鑑的卡池 (活動 → 可以抽到的角色)，同網域；index.html 也從這裡載入 pools.js
    const CHARACTER_POOLS_URL = '/monster-strike-character-catalog/pools.json';

    const CLOUD_SAVE_DELAY_MS = 1500;
    const TOAST_DURATION_MS = 3000;
    const FIREBASE_WAIT_RETRIES = 50;                    // 每次間隔 100ms

    // 帳號在下拉選單與統計中的優先順序
    const PREFERRED_ACCOUNT_ORDER = ['羽入', '梨花', '沙都子'];

    // 月份選單顯示合作活動名稱時，包含這些字樣的名稱不會被「×」截斷
    const TRUNCATION_EXCEPTIONS = ['SPY×FAMILY'];
    const COLLAB_NAME_MAX_LENGTH = 25;

    const TOAST_COLORS = { error: '#dc3545', info: '#0d6efd', success: '#28a745' };


    // =====================================================
    // 2. DOM 快取與狀態
    // =====================================================
    const $ = (id) => document.getElementById(id);

    const form = $('gacha-form');
    const gachaFieldset = $('gacha-fieldset');
    const modeToggleBtn = $('mode-toggle-btn');
    const tableBody = $('history-table-body');
    const toastMessage = $('toast-message');
    const tagSelect = $('tag-select');
    const eventSelect = $('event-select');
    const eventInputGroup = $('event-input-group');
    const eventInput = $('event-input');
    const cancelNewEvent = $('cancel-new-event');
    const editEventBtn = $('edit-event-btn');
    const accountSelect = $('account-select');
    const accountInputGroup = $('account-input-group');
    const accountInput = $('account-input');
    const cancelNewAccount = $('cancel-new-account');
    const editAccountBtn = $('edit-account-btn');
    const accountSelectGroup = accountSelect.closest('.input-group');
    const dateInput = $('date');
    const pullsInput = $('pulls');
    const notesInput = $('notes');
    const submitBtnText = $('submit-btn-text');
    const cancelEditBtn = $('cancel-edit-btn');
    const accountFilter = $('account-filter');
    const dateFilter = $('date-filter');
    const historyTableTitle = $('history-table-title');

    // 資料管理按鈕
    const clearButton = $('clear-data');
    const exportButton = $('export-data');
    const importButton = $('import-data');
    const importFileInput = $('import-file-input');

    // 管理員功能
    const exportAllEventsBtn = $('export-all-events-btn');
    const importEventsFileBtn = $('import-events-file-btn');
    const importEventsFileInput = $('import-events-file-input');
    const saveEventMasterBtn = $('save-event-master-btn');
    const eventEndDateInput = $('event-end-date');
    const deleteEventMasterBtn = $('delete-event-master-btn');
    const adminBadge = $('admin-badge');

    // Firebase 登入
    const loginBtn = $('google-login-btn');
    const logoutBtn = $('logout-btn');
    const userInfoDiv = $('user-info');
    const userDisplayNameSpan = $('user-display-name');
    const userAvatarImg = $('user-avatar');

    // 雲端狀態
    const cloudStatus = $('cloudStatus');
    const cloudStatusText = $('cloudStatusText');
    const statusDot = document.querySelector('.status-dot');

    // 狀態
    let records = [];
    let masterEvents = [];
    let characterNameFixes = null;   // 角色圖鑑的名稱修正 (shared/characters)，讀到後才套用
    let globalEditMode = false;
    let editMode = false;
    let editEventName = null;
    let editingRecordId = null;   // 從表格按「編輯」時，記錄要編輯的那一筆 id
    let editingAccountOriginal = null;   // 編輯模式下修改帳號名稱時，原本的帳號
    let isAddingNewAccount = false;
    let isAddingNewEvent = false;

    let currentUser = null;
    let isCloudMode = false;
    let isCloudLoading = false;   // 讀取雲端紀錄期間不寫入雲端，避免本機舊紀錄覆蓋雲端
    let isAdmin = false;
    let saveTimeout = null;
    let hasPendingCloudSave = false;
    let toastTimer = null;
    let dateFilterDirty = true;   // 紀錄或活動清單有變動時，日期篩選才需要重建
    // 上次讀取 / 寫入時雲端紀錄的 { version, updatedAt }。存檔時雲端的值不一樣 = 其他裝置改過
    let knownCloudStamp = null;
    // 雲端活動清單是否已讀到 (或確認雲端還沒有清單)；讀到之前不開放管理員寫入
    let masterEventsReady = false;
    // 上次讀到的雲端活動清單 updatedAt (毫秒)。存檔時不一樣 = 爬蟲或其他管理員剛改過，不覆蓋
    let knownEventsStamp = null;


    // =====================================================
    // 3. 工具函式
    // =====================================================
    // 跳脫 HTML 特殊字元 (帳號、活動、角色名稱可能含 < > " 等字元)
    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function showToast(message, type = 'success') {
        toastMessage.textContent = message;
        toastMessage.style.backgroundColor = TOAST_COLORS[type] || TOAST_COLORS.success;
        toastMessage.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastMessage.classList.remove('show'), TOAST_DURATION_MS);
    }

    function downloadJson(data, fileName) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    // 活動名稱整理：去掉頭尾空白，連續空白合併成一個
    function normalizeName(name) {
        return String(name === undefined || name === null ? '' : name)
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
    }

    const isValidEvent = (e) => e && typeof e === 'object' && typeof e.event === 'string' && normalizeName(e.event);

    // 整理單筆活動資料 (名稱、日期、結束日、標籤、舊名稱 aliases)
    // 結束日 endDate 是選填；沒有、格式不對或早於開始日時就不保留 (舊資料都沒有結束日)
    function normalizeMasterEvent(e) {
        const name = normalizeName(e.event);
        const aliases = Array.isArray(e.aliases)
            ? [...new Set(e.aliases.filter((a) => typeof a === 'string').map(normalizeName).filter((a) => a && a !== name))]
            : [];
        const result = {
            ...e,
            event: name,
            date: typeof e.date === 'string' ? e.date : '',
            tag: typeof e.tag === 'string' ? e.tag : ''
        };
        if (aliases.length > 0) result.aliases = aliases;
        else delete result.aliases;
        if (!(isValidDate(result.endDate) && result.date && result.endDate >= result.date)) delete result.endDate;
        return result;
    }

    // 同名活動只保留第一筆
    function dedupeMasterEvents(list) {
        const map = new Map();
        list.forEach((e) => { if (!map.has(e.event)) map.set(e.event, e); });
        return [...map.values()];
    }

    // 舊名稱 -> 新名稱 對照表 (活動更名後，所有使用者的紀錄會自動對應到新名稱)
    function buildAliasMap() {
        const names = new Set(masterEvents.map((e) => e.event));
        const map = new Map();
        masterEvents.forEach((e) => {
            (e.aliases || []).forEach((alias) => {
                if (!names.has(alias)) map.set(alias, e.event);
            });
        });
        return map;
    }

    // 把 2024/3/5、2024.03.05 這類寫法整理成 YYYY-MM-DD；無法辨識時原樣回傳
    function normalizeDate(value) {
        if (typeof value !== 'string') return value;
        const match = value.trim().match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
        return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : value;
    }

    // 紀錄日期必須是真實存在的 YYYY-MM-DD (<input type="date"> 的格式)
    function isValidDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const [y, m, d] = value.split('-').map(Number);
        const date = new Date(Date.UTC(y, m - 1, d));
        return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
    }

    // 找出「同日、同活動、同帳號」的紀錄 (excludeIds 內的紀錄不算)
    function findDuplicateRecord({ date, event, account }, excludeIds = []) {
        return records.find((r) => !excludeIds.includes(r.id) && r.date === date && r.event === event && r.account === account) || null;
    }

    // 驗證並整理紀錄：略過格式不正確的項目，補齊欄位，確保 id 為不重複的數字
    function sanitizeRecords(list) {
        const seenIds = new Set();
        let nextId = Date.now();
        const clean = [];
        let dropped = 0;

        list.forEach((rawItem) => {
            const item = rawItem && typeof rawItem === 'object' ? { ...rawItem, date: normalizeDate(rawItem.date) } : rawItem;
            const valid = item && typeof item === 'object'
                && isValidDate(item.date)
                && typeof item.event === 'string' && normalizeName(item.event)
                && typeof item.account === 'string' && item.account;
            if (!valid) {
                dropped++;
                return;
            }

            let id = Number(item.id);
            if (!Number.isFinite(id) || seenIds.has(id)) {
                while (seenIds.has(nextId)) nextId++;
                id = nextId++;
            }
            seenIds.add(id);

            const pulls = Number(item.pulls);
            clean.push({
                ...item,
                id,
                event: normalizeName(item.event),
                pulls: Number.isFinite(pulls) && pulls >= 0 ? pulls : 0,
                notes: typeof item.notes === 'string' ? item.notes : '',
                tag: typeof item.tag === 'string' ? item.tag : ''
            });
        });
        return { records: clean, dropped };
    }

    // 套用一批新的紀錄 (載入 / 匯入)
    function setRecords(list) {
        const { records: clean, dropped } = sanitizeRecords(list);
        if (dropped > 0) console.warn(`[DATA] 已略過 ${dropped} 筆格式不正確的紀錄`);
        records = clean;
        dateFilterDirty = true;
        return dropped;
    }

    function generateRecordId() {
        let id = Date.now();
        while (records.some((r) => r.id === id)) id++;
        return id;
    }

    function extractEventDate(eventName) {
        const match = eventName.match(/^(\d{4})[-\/]?(\d{1,2})/);
        if (match) {
            const year = match[1];
            const month = match[2].padStart(2, '0');
            return `${year}-${month}`;
        }
        return null;
    }

    // 活動日期：優先使用 date 欄位，沒有則從活動名稱解析
    function getEventDate(e) {
        return e.date || extractEventDate(e.event) || '';
    }

    function compareEventNamesByDate(a, b) {
        const dateA = extractEventDate(a);
        const dateB = extractEventDate(b);
        if (dateA && dateB) return dateB.localeCompare(dateA);
        if (dateA && !dateB) return -1;
        if (!dateA && dateB) return 1;
        return a.localeCompare(b);
    }

    // 顯示用活動名稱：移除與日期重複的「YYYY-MM月」前綴
    function getCleanEventName(event, date) {
        const year = date.substring(0, 4);
        const monthNum = parseInt(date.split('-')[1], 10);
        const pattern = new RegExp(`^${year}[-年/]0?${monthNum}月?\\s*`);
        const displayEventName = event.replace(pattern, '').trim();
        return displayEventName || event;
    }

    function getSortedAccountNames() {
        const allNames = [...new Set(records.map((r) => r.account))];
        const preferred = [];
        const others = [];
        allNames.forEach((name) => PREFERRED_ACCOUNT_ORDER.includes(name) ? preferred.push(name) : others.push(name));
        preferred.sort((a, b) => PREFERRED_ACCOUNT_ORDER.indexOf(a) - PREFERRED_ACCOUNT_ORDER.indexOf(b));
        others.sort((a, b) => a.localeCompare(b));
        return [...preferred, ...others];
    }

    const hasSelectOption = (select, value) => [...select.options].some((o) => o.value === value);


    // =====================================================
    // 4. 雲端狀態、登入與管理員判斷 (Firebase)
    // =====================================================
    function updateCloudStatus(status, msg) {
        cloudStatus.style.display = 'flex';
        cloudStatusText.textContent = msg;
        statusDot.className = 'status-dot';

        if (status === 'online') statusDot.classList.add('status-online');
        else if (status === 'saving') statusDot.classList.add('status-saving');
        else statusDot.classList.add('status-offline');
    }

    function renderAuthUI(userData) {
        if (userData) {
            loginBtn.style.display = 'none';
            userInfoDiv.style.display = 'flex';
            userDisplayNameSpan.textContent = userData.displayName || '使用者';
            if (userData.photoURL) userAvatarImg.src = userData.photoURL;
        } else {
            loginBtn.style.display = 'block';
            userInfoDiv.style.display = 'none';
            userDisplayNameSpan.textContent = '';
            userAvatarImg.src = '';
        }
    }

    // 從 sessionStorage 立即還原登入畫面，不等待 Firebase
    function checkAuthCache() {
        const cached = sessionStorage.getItem(USER_CACHE_KEY);
        if (!cached) return;
        try {
            renderAuthUI(JSON.parse(cached));
            console.log('[Optimization] 6.2: Restored Auth UI from sessionStorage');
        } catch (e) {
            console.warn('Cache parse error, clearing.', e);
            sessionStorage.removeItem(USER_CACHE_KEY);
        }
    }

    // 等待 Firebase SDK 與 Firestore 函式就緒
    async function waitForFirebaseServices() {
        for (let i = 0; i < FIREBASE_WAIT_RETRIES; i++) {
            if (window.db && window.doc && window.getDoc) return true;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return false;
    }

    function getCloudDocRef() {
        const appId = window.envAppId || 'default-app-id';
        return window.doc(window.db, 'artifacts', appId, 'users', currentUser.uid, 'data', 'gacha_records');
    }

    const getSharedEventsRef = () => window.doc(window.db, SHARED_COLLECTION, EVENTS_DOC_ID);

    // 「本機有還沒存到雲端的修改」標記：存檔時設定，雲端存檔成功後清除
    const setUnsynced = (flag) => (flag ? localStorage.setItem(UNSYNCED_KEY, '1') : localStorage.removeItem(UNSYNCED_KEY));
    const hasUnsynced = () => localStorage.getItem(UNSYNCED_KEY) === '1';

    const cloneRecords = (list) => JSON.parse(JSON.stringify(list));

    // ---- 三方合併 ----
    // 「同步基準」= 上次和雲端同步時的紀錄。雲端被其他裝置改過時，
    // 拿「同步基準、本機、雲端」三份比較，就知道哪一邊改了什麼，兩邊的修改都能保留。
    function readSyncBase(uid) {
        try {
            const base = JSON.parse(localStorage.getItem(SYNC_BASE_PREFIX + uid));
            return Array.isArray(base) ? base : null;
        } catch (e) {
            return null;
        }
    }
    const writeSyncBase = (uid, list) => localStorage.setItem(SYNC_BASE_PREFIX + uid, JSON.stringify(list));

    // 寫入雲端：雲端的 version / lastUpdated 和上次看到的一樣就直接寫入；
    // 不一樣代表其他裝置 (或其他分頁) 改過，先三方合併再寫入，不會覆蓋別人的修改。
    async function saveToCloud() {
        hasPendingCloudSave = false;
        if (!currentUser || !isCloudMode || isCloudLoading) return;
        const uid = currentUser.uid;
        const localSnapshot = cloneRecords(records);
        const base = readSyncBase(uid) || [];
        try {
            if (!window.runTransaction) throw new Error('Firebase SDK functions missing');
            const ref = getCloudDocRef();
            const stamp = Date.now();
            const result = await window.runTransaction(window.db, async (tx) => {
                const snap = await tx.get(ref);
                const data = snap.exists() ? snap.data() : null;
                const current = cloudStampOf(data);
                let written = localSnapshot;
                let merge = null;
                if (!sameStamp(current, knownCloudStamp)) {
                    const remote = sanitizeRecords(data && Array.isArray(data.records) ? data.records : []).records;
                    merge = mergeRecords(base, localSnapshot, remote);
                    written = merge.records;
                }
                const version = current.version + 1;
                tx.set(ref, { records: written, version, lastUpdated: new Date(stamp) }, { merge: true });
                return { written, merge, version };
            });
            if (!currentUser || currentUser.uid !== uid) return;   // 存檔期間已登出或換帳號

            knownCloudStamp = { version: result.version, updatedAt: stamp };
            writeSyncBase(uid, result.written);
            if (result.merge) {
                // 套用合併結果，同時保留存檔期間使用者又做的修改
                records = mergeRecords(localSnapshot, records, result.written).records;
                dateFilterDirty = true;
                localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));
                renderAll();
                showToast('雲端資料已被其他裝置更新，已自動合併兩邊的修改。' + (result.merge.conflicts > 0
                    ? `（${result.merge.conflicts} 筆兩邊都改過，採用這台的版本）`
                    : ''), 'info');
            }
            const stillDirty = !sameRecordSet(records, result.written);
            setUnsynced(stillDirty);
            if (stillDirty) saveData();
            updateCloudStatus('online', '雲端就緒 (已同步)');
            console.log(`[CLOUD] Saved${result.merge ? ' (merged)' : ''}.`);
        } catch (error) {
            console.error('[CLOUD] Auto-save failed:', error);
            updateCloudStatus('offline', '儲存失敗 (修改先存在本機)');
        }
    }

    // 記錄「本機紀錄目前屬於哪個雲端帳號」，用來偵測換帳號登入
    const rememberUser = (uid) => localStorage.setItem(LAST_UID_KEY, uid);

    // 新帳號雲端沒有資料、本機卻有紀錄時：若這些紀錄可能屬於另一個帳號，先詢問是否上傳
    function confirmUploadLocalRecords(uid) {
        const lastUid = localStorage.getItem(LAST_UID_KEY);
        if (!lastUid || lastUid === uid) return true;
        return confirm(
            `本機還留著另一個帳號的 ${records.length} 筆紀錄，而目前登入的帳號在雲端還沒有資料。\n\n` +
            '按「確定」：把這些紀錄上傳到目前登入的帳號。\n' +
            '按「取消」：不上傳，並清空本機紀錄（原帳號的雲端資料不受影響）。'
        );
    }

    // 登出後不把雲端紀錄留在畫面與 LocalStorage 上
    function clearLocalCopyOfCloudRecords(uid) {
        clearTimeout(saveTimeout);
        hasPendingCloudSave = false;
        sessionStorage.removeItem(OLD_DATA_CACHE_PREFIX + uid);
        localStorage.removeItem(LOCAL_RECORDS_KEY);
        localStorage.removeItem(SYNC_BASE_PREFIX + uid);
        setUnsynced(false);
        knownCloudStamp = null;
        records = [];
        dateFilterDirty = true;
        renderAll();
        resetFormState();
    }

    const todayStamp = () => new Date().toISOString().split('T')[0];

    // 讀取雲端紀錄 (不使用快取：快取會讓其他裝置的修改在這個分頁看不到，之後存檔又把它們覆蓋)
    async function loadFromCloud() {
        if (!currentUser) return;
        const uid = currentUser.uid;
        sessionStorage.removeItem(OLD_DATA_CACHE_PREFIX + uid);

        try {
            const docSnap = await window.getDoc(getCloudDocRef());
            if (!currentUser || currentUser.uid !== uid) return;
            isCloudLoading = false;

            const data = docSnap.exists() ? docSnap.data() : null;
            knownCloudStamp = cloudStampOf(data);
            const cloudRecords = data && Array.isArray(data.records) ? data.records : [];
            const oldBase = readSyncBase(uid);

            if (cloudRecords.length > 0 || (oldBase && data)) {
                // 本機有還沒存到雲端的修改時：有同步基準就合併，沒有就以雲端為準並先備份
                const unsyncedLocal = hasUnsynced() && records.length > 0 ? cloneRecords(records) : null;
                const dropped = setRecords(cloudRecords);
                const cloudClean = cloneRecords(records);
                writeSyncBase(uid, cloudClean);
                setUnsynced(false);

                let offlineChanges = 0;
                if (unsyncedLocal && oldBase) {
                    offlineChanges = countChanges(oldBase, unsyncedLocal);
                    records = mergeRecords(oldBase, unsyncedLocal, cloudClean).records;
                }
                normalizeAllRecords();
                localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));
                renderAll();
                resetFormState();
                if (!sameRecordSet(records, cloudClean)) saveData();

                if (dropped > 0) {
                    downloadJson(cloudRecords, `gacha_cloud_raw_${todayStamp()}.json`);
                    showToast(`雲端有 ${dropped} 筆紀錄格式不正確已略過，原始資料已下載備份`, 'error');
                } else if (offlineChanges > 0) {
                    showToast(`已載入雲端紀錄，並合併 ${offlineChanges} 筆離線時的修改`, 'success');
                } else if (unsyncedLocal && !oldBase && !sameRecordSet(unsyncedLocal, cloudClean)) {
                    downloadJson(unsyncedLocal, `gacha_local_backup_${todayStamp()}.json`);
                    showToast('本機有還沒上傳的紀錄，已下載備份，並改用雲端紀錄。', 'info');
                } else {
                    showToast('已載入雲端紀錄', 'success');
                }
                updateCloudStatus('online', '雲端就緒 (已載入)');
            } else if (records.length > 0) {
                writeSyncBase(uid, []);
                if (confirmUploadLocalRecords(uid)) {
                    saveData();
                    showToast('已將本地紀錄同步至雲端', 'info');
                } else {
                    records = [];
                    dateFilterDirty = true;
                    localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));
                    setUnsynced(false);
                    renderAll();
                    resetFormState();
                    updateCloudStatus('online', '雲端就緒 (尚無資料)');
                    showToast('已略過上傳，本機紀錄已清空', 'info');
                }
            } else {
                writeSyncBase(uid, []);
                updateCloudStatus('online', '雲端就緒 (尚無資料)');
            }
            rememberUser(uid);
        } catch (error) {
            // 讀不到雲端時改回離線模式，避免之後的編輯以本機紀錄覆蓋雲端；
            // 這段期間的修改會在下次成功連上雲端時合併
            isCloudLoading = false;
            isCloudMode = false;
            console.error('[CLOUD] Load failed:', error);
            updateCloudStatus('offline', '雲端載入失敗 (修改先存在本機)');
            showToast('無法載入雲端資料，修改會先存在本機，下次連上時合併。', 'error');
        }
    }

    // ---- 管理員 ----
    function setAdminMode(enabled) {
        isAdmin = enabled;
        document.body.classList.toggle('is-admin', enabled);
        adminBadge.style.display = enabled ? 'inline-block' : 'none';
    }

    // Firestore 存在 admins/{uid} 文件即為管理員 (文件由你在 Firebase Console 手動建立)
    async function checkAdminStatus(user) {
        try {
            if (!(await waitForFirebaseServices())) throw new Error('Firebase not ready');
            const snap = await window.getDoc(window.doc(window.db, ADMINS_COLLECTION, user.uid));
            setAdminMode(snap.exists());
        } catch (error) {
            console.warn('[ADMIN] 無法確認管理員身分，視為一般使用者。', error);
            setAdminMode(false);
        }
    }

    function requireAdmin() {
        if (!isAdmin || !currentUser) {
            showToast('需要管理員權限', 'error');
            return false;
        }
        return true;
    }

    // 等待 Firebase SDK 載入 (Polling)
    function initFirebaseAuth(retries = 0) {
        if (window.firebaseAuth) {
            window.onAuthStateChanged(window.firebaseAuth, async (user) => {
                const previousUser = currentUser;
                currentUser = user;
                if (user) {
                    const userData = { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL };
                    sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData));
                    renderAuthUI(userData);

                    isCloudMode = true;
                    isCloudLoading = true;
                    updateCloudStatus('saving', '正在從雲端載入...');
                    await Promise.all([loadFromCloud(), checkAdminStatus(user)]);
                } else {
                    sessionStorage.removeItem(USER_CACHE_KEY);
                    renderAuthUI(null);
                    setAdminMode(false);

                    isCloudMode = false;
                    isCloudLoading = false;
                    updateCloudStatus('offline', '未偵測到帳戶 (離線模式)');

                    // 在本頁登出 (含其他分頁登出)：清除留在這台電腦上的雲端紀錄
                    // 一開始就未登入的離線使用者不受影響
                    if (previousUser) clearLocalCopyOfCloudRecords(previousUser.uid);
                }
            });

            logoutBtn.addEventListener('click', async () => {
                try {
                    // 登出前先送出尚未儲存的變更
                    if (isCloudMode && currentUser && hasPendingCloudSave) {
                        clearTimeout(saveTimeout);
                        await saveToCloud();
                    }
                    // 仍有修改沒存到雲端 (例如雲端連線失敗)：登出會清除本機紀錄，先讓使用者備份
                    if (hasUnsynced() && records.length > 0) {
                        if (!confirm(
                            '有修改還沒存到雲端，登出後會從這台電腦清除。\n\n' +
                            '按「確定」：先下載備份再登出。\n按「取消」：不登出。'
                        )) return;
                        downloadJson(records, `gacha_records_${new Date().toISOString().split('T')[0]}.json`);
                    }
                    await window.signOut(window.firebaseAuth);
                    sessionStorage.removeItem(USER_CACHE_KEY);
                    showToast('已登出，本機上的雲端紀錄已清除', 'info');
                } catch (error) {
                    console.error(error);
                }
            });

            loginBtn.onclick = async () => {
                try {
                    const provider = new window.GoogleAuthProvider();
                    await window.signInWithPopup(window.firebaseAuth, provider);
                } catch (error) {
                    console.error('Login failed:', error);
                    showToast('登入失敗', 'error');
                }
            };

        } else if (retries < 50) {
            setTimeout(() => initFirebaseAuth(retries + 1), 100);
        } else {
            console.error('Firebase SDK not loaded after timeout.');
            updateCloudStatus('offline', 'SDK 載入失敗 (離線模式)');
        }
    }


    // =====================================================
    // 5. 存檔 / 讀取
    // =====================================================
    // 統一儲存：一律存 LocalStorage；雲端模式再以 Debounce 寫入 Firestore
    function saveData() {
        dateFilterDirty = true;
        localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));
        setUnsynced(true);   // 雲端存檔成功後才清除

        // 雲端載入中：只存本機，載入完成後以雲端資料為準
        if (isCloudMode && currentUser && !isCloudLoading) {
            updateCloudStatus('saving', '儲存中...');
            hasPendingCloudSave = true;
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveToCloud, CLOUD_SAVE_DELAY_MS);
        } else if (!isCloudMode) {
            updateCloudStatus('offline', '離線模式 (已存本地)');
        }
    }

    function loadRecords() {
        const raw = localStorage.getItem(LOCAL_RECORDS_KEY);
        let stored = null;
        if (raw) {
            try {
                stored = JSON.parse(raw);
            } catch (e) {
                console.warn('本機紀錄格式損毀，已另存備份', e);
                localStorage.setItem(LOCAL_RECORDS_KEY + '_corrupt_backup', raw);
            }
        }

        if (Array.isArray(stored) && stored.length > 0) {
            setRecords(stored);
            normalizeAllRecords();
        } else {
            records = [];
            localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));
        }
    }


    // =====================================================
    // 6. 角色字串格式化與活動清單
    // =====================================================
    // 整理所有紀錄：活動名稱 (空白整理 + 舊名稱自動對應新名稱) 與獲得角色格式
    function normalizeAllRecords() {
        const aliasMap = buildAliasMap();
        let hasChanges = false;
        const lib = window.CharacterPools;
        const renameCharacter = characterNameFixes && characterNameFixes.renames.size > 0 && lib
            ? (name) => lib.resolveName(characterNameFixes, name) : null;

        records.forEach((record) => {
            const cleanedEvent = normalizeName(record.event);
            const canonicalEvent = aliasMap.get(cleanedEvent) || cleanedEvent;
            if (record.event !== canonicalEvent) {
                record.event = canonicalEvent;
                hasChanges = true;
            }

            const originalNotes = record.notes || '';
            let formattedNotes = formatCharacterString(originalNotes, record.tag);
            // 角色圖鑑管理員的名稱修正：寫錯的角色名稱改成正確名稱 (每個人打開抽卡統計時改自己的紀錄)
            if (renameCharacter) formattedNotes = renameCharacters(formattedNotes, record.tag, renameCharacter);
            if (originalNotes !== formattedNotes) {
                record.notes = formattedNotes;
                hasChanges = true;
            }
        });

        if (hasChanges) {
            saveData();
            console.log('Records have been auto-normalized.');
        }
    }

    // 免費或寶珠標籤且未輸入抽數時，預設為 0
    function checkFreeTagDefault() {
        const tag = tagSelect.value;
        if ((tag === 'free' || tag === 'orb') && pullsInput.value === '') pullsInput.value = 0;
    }

    // 合併活動 (已存在的不覆蓋)，回傳新增筆數
    function mergeNewEvents(newEvents) {
        if (!Array.isArray(newEvents)) {
            showToast('合併失敗：輸入的活動列表格式不正確。', 'error');
            return 0;
        }
        const existingEventsSet = new Set(masterEvents.map((e) => e.event));
        let newEventsAdded = 0;
        newEvents.forEach((newEvent) => {
            if (!isValidEvent(newEvent)) return;
            const normalized = normalizeMasterEvent(newEvent);
            if (!existingEventsSet.has(normalized.event)) {
                masterEvents.push(normalized);
                existingEventsSet.add(normalized.event);
                newEventsAdded++;
            }
        });
        masterEvents.sort((a, b) => compareEventNamesByDate(a.event, b.event));
        dateFilterDirty = true;
        updateEventFormSelect(records);
        return newEventsAdded;
    }

    // 載入靜態的 events.json (備援 / 初始資料)
    async function loadStaticEvents() {
        try {
            const response = await fetch('events.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (!Array.isArray(data)) throw new Error('載入的資料格式不正確');
            masterEvents = dedupeMasterEvents(data.filter(isValidEvent).map(normalizeMasterEvent));
            dateFilterDirty = true;
            normalizeAllRecords();   // 讓舊名稱對照 (aliases) 立即生效
            updateEventFormSelect(records);
        } catch (error) {
            console.warn('無法載入活動清單 (events.json):', error);
        }
    }

    // 讀取雲端活動清單；雲端沒有清單時回傳 null，讀取失敗時丟出錯誤
    async function loadMasterEventsFromCloud() {
        if (!(await waitForFirebaseServices())) throw new Error('Firebase not ready');
        const snap = await window.getDoc(getSharedEventsRef());
        knownEventsStamp = snap.exists() ? eventsStampOf(snap.data()) : null;
        if (!snap.exists()) return null;
        const list = snap.data().events;
        if (!Array.isArray(list) || list.length === 0) return null;
        return dedupeMasterEvents(list.filter(isValidEvent).map(normalizeMasterEvent));
    }

    // 用雲端活動清單取代目前清單，並讓紀錄套用舊名稱對照。
    // 讀到清單 (或確認雲端還沒有清單) 才開放管理員寫入，避免以 events.json 備援覆蓋雲端清單。
    async function refreshMasterEventsFromCloud() {
        try {
            const list = await loadMasterEventsFromCloud();
            masterEventsReady = true;
            if (!list) return true;
            masterEvents = list;
            dateFilterDirty = true;
            normalizeAllRecords();
            renderAll();
            return true;
        } catch (error) {
            masterEventsReady = false;
            console.warn('[CLOUD] 無法載入雲端活動清單，使用 events.json', error);
            return false;
        } finally {
            updateAdminButtonsState();
        }
    }

    function updateAdminButtonsState() {
        [saveEventMasterBtn, deleteEventMasterBtn, importEventsFileBtn].forEach((btn) => {
            btn.disabled = !masterEventsReady;
            btn.title = masterEventsReady ? '' : '雲端活動清單尚未載入，暫時無法修改';
        });
    }

    // 管理員修改清單前，先重新讀取最新的雲端清單 (其他管理員可能剛改過)
    async function prepareMasterEventsForWrite() {
        if (await refreshMasterEventsFromCloud()) return true;
        showToast('無法讀取雲端活動清單，為避免覆蓋雲端資料，請稍後再試。', 'error');
        return false;
    }

    const eventsStampOf = (data) => (data && data.updatedAt && typeof data.updatedAt.toMillis === 'function'
        ? data.updatedAt.toMillis() : null);

    // 管理員：把目前的活動清單寫入雲端。
    // 雲端清單在上次讀取後被改過 (例如每天中午的爬蟲新增了活動) 就不寫入，避免把新增的活動蓋掉
    async function saveMasterEventsToCloud() {
        if (!isAdmin || !currentUser) throw new Error('需要管理員權限');
        const events = JSON.parse(JSON.stringify(masterEvents));
        const ref = getSharedEventsRef();
        await window.runTransaction(window.db, async (tx) => {
            const snap = await tx.get(ref);
            const cloudStamp = snap.exists() ? eventsStampOf(snap.data()) : null;
            if (cloudStamp !== knownEventsStamp) {
                const error = new Error('雲端活動清單在讀取後被修改過');
                error.code = 'events-changed';
                throw error;
            }
            tx.set(ref, { events, updatedAt: window.serverTimestamp() });
        });
    }

    // 寫入活動清單失敗時的提示文字
    function masterSaveErrorMessage(error, fallback) {
        return error && error.code === 'events-changed'
            ? '雲端活動清單剛被更新過（可能是爬蟲新增了活動），沒有儲存。已重新載入，請確認後再操作一次。'
            : fallback;
    }


    // =====================================================
    // 7. 渲染
    // =====================================================
    function renderAll() {
        const selectedAccount = accountFilter.value;
        const selectedDate = dateFilter.value;
        const selectedTags = Array.from(document.querySelectorAll('.tag-filter:checked')).map((cb) => cb.value);

        let filteredRecords = records;

        // 1. 帳號
        if (selectedAccount !== 'all') {
            filteredRecords = filteredRecords.filter((record) => record.account === selectedAccount);
        }
        // 2. 日期 (YYYY 或 YYYY-MM，record.date 為 YYYY-MM-DD，startsWith 兩種都適用)
        if (selectedDate !== 'all') {
            filteredRecords = filteredRecords.filter((r) => r.date.startsWith(selectedDate));
        }
        // 3. 標籤 (多選，符合任一即顯示；未勾選則全部顯示)
        if (selectedTags.length > 0) {
            filteredRecords = filteredRecords.filter((r) => selectedTags.includes(r.tag));
        }

        renderTable(filteredRecords, selectedAccount, selectedDate);
        calculateStats(filteredRecords);
        const sortedAccounts = getSortedAccountNames();
        updateEventFormSelect(filteredRecords);
        updateAccountFilter(sortedAccounts);
        if (!editMode) updateAccountFormSelect(sortedAccounts);
        if (dateFilterDirty) {
            updateDateFilter();
            dateFilterDirty = false;
        }
        updateAccountEditBtnState();
    }

    function renderTable(filteredRecords, selectedAccount, selectedDate) {
        tableBody.innerHTML = '';
        let title = selectedAccount === 'all' ? '歷史紀錄' : `${selectedAccount} 的歷史紀錄`;
        if (selectedDate !== 'all') title += ` (${selectedDate})`;
        historyTableTitle.innerHTML = `<i class="bi bi-table"></i> ${escapeHtml(title)}`;

        const sortedRecords = [...filteredRecords].sort((a, b) => b.date.localeCompare(a.date));
        const fragment = document.createDocumentFragment();
        sortedRecords.forEach((record) => {
            const row = document.createElement('tr');
            if (record.tag && record.tag !== 'none') row.setAttribute('data-tag', record.tag);
            const cleanEventName = getCleanEventName(record.event, record.date);
            const cleanNotes = getCleanNotes(record.notes);
            row.innerHTML = `
                <td>${escapeHtml(record.date)}</td><td>${escapeHtml(cleanEventName)}</td><td>${escapeHtml(record.account)}</td><td>${record.pulls}</td><td>${escapeHtml(cleanNotes)}</td> 
                <td class="text-nowrap">
                    <button class="btn btn-warning btn-sm me-2" data-id="${record.id}" title="編輯"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-danger btn-sm" data-id="${record.id}" title="刪除"><i class="bi bi-trash"></i></button>
                </td>`;
            fragment.appendChild(row);
        });
        tableBody.appendChild(fragment);
    }

    // 統計：「抽數 ÷ 抽到角色數」只算本家與合作 (寶珠的獲得欄位是顆數、免費活動多半 0 抽)
    const RATIO_TAGS = ['honke', 'collab'];
    const TAG_SHARE_ORDER = [
        { tag: 'honke', label: '本家', color: '#dc3545' },
        { tag: 'collab', label: '合作', color: '#6610f2' },
        { tag: 'free', label: '免費', color: '#198754' },
        { tag: 'orb', label: '寶珠', color: '#ffc107' },
        { tag: '', label: '未分類', color: '#adb5bd' }
    ];

    const formatPullsPerChar = (pulls, chars) => {
        const v = pulls / chars;
        return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString();
    };

    // 每月投入趨勢：依月份加總抽數，新的月份在上面
    function renderTrendStats(filteredRecords) {
        const byMonth = new Map();
        filteredRecords.forEach((r) => {
            const month = r.date.slice(0, 7);
            byMonth.set(month, (byMonth.get(month) || 0) + r.pulls);
        });
        const months = [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a));
        const max = Math.max(0, ...months.map(([, pulls]) => pulls));

        let html = '<h5><i class="bi bi-graph-up"></i> 每月投入趨勢</h5>';
        if (months.length === 0) {
            html += '<p><i>尚無資料</i></p>';
        } else {
            html += '<div class="trend-list">' + months.map(([month, pulls]) => {
                const [y, m] = month.split('-');
                const width = max > 0 ? Math.max(pulls > 0 ? 2 : 0, Math.round(pulls / max * 100)) : 0;
                return `<div class="trend-row"><span class="trend-label">${escapeHtml(y)}/${escapeHtml(m)}</span>`
                    + `<span class="trend-track"><span class="trend-bar" style="width: ${width}%"></span></span>`
                    + `<span class="trend-value">${pulls.toLocaleString()}</span></div>`;
            }).join('') + '</div>';
        }
        $('trend-stats').innerHTML = html;
    }

    // 活動類型比例：各標籤的抽數占總抽數的比例
    function renderTagShareStats(filteredRecords) {
        const total = filteredRecords.reduce((sum, r) => sum + r.pulls, 0);
        const byTag = new Map();
        filteredRecords.forEach((r) => {
            const tag = TAG_SHARE_ORDER.some((t) => t.tag === r.tag) ? r.tag : '';
            byTag.set(tag, (byTag.get(tag) || 0) + r.pulls);
        });
        const parts = TAG_SHARE_ORDER.filter((t) => (byTag.get(t.tag) || 0) > 0)
            .map((t) => ({ ...t, pulls: byTag.get(t.tag), pct: byTag.get(t.tag) / total * 100 }));

        let html = '<h5><i class="bi bi-pie-chart-fill"></i> 活動類型比例</h5>';
        if (total === 0) {
            html += '<p><i>尚無資料</i></p>';
        } else {
            html += '<div class="share-bar">' + parts.map((p) =>
                `<span style="width: ${p.pct}%; background-color: ${p.color}" title="${p.label} ${Math.round(p.pct)}%"></span>`).join('') + '</div>';
            html += parts.map((p) =>
                `<p><span class="share-dot" style="background-color: ${p.color}"></span>${p.label}: <strong>${p.pulls.toLocaleString()}</strong> 抽 (${Math.round(p.pct)}%)</p>`).join('');
        }
        $('tag-share-stats').innerHTML = html;
    }

    function calculateStats(filteredRecords) {
        const totalPulls = filteredRecords.reduce((sum, record) => sum + record.pulls, 0);
        $('total-pulls').textContent = totalPulls.toLocaleString();

        // 各帳號總抽數
        const accountStats = {};
        filteredRecords.forEach((record) => {
            accountStats[record.account] = (accountStats[record.account] || 0) + record.pulls;
        });
        let accountHtml = '<h5><i class="bi bi-people-fill"></i> 各帳號總抽數</h5>';
        Object.entries(accountStats).sort(([, a], [, b]) => b - a).forEach(([acc, pulls]) => {
            accountHtml += `<p>${escapeHtml(acc)}: <strong>${pulls.toLocaleString()}</strong> 抽</p>`;
        });
        $('account-stats').innerHTML = accountHtml;

        // 各活動總抽數
        const eventStats = {};
        let ratioPulls = 0;
        let ratioChars = 0;
        filteredRecords.forEach((record) => {
            if (!eventStats[record.event]) {
                eventStats[record.event] = { pulls: 0, chars: 0, ratio: false, firstDate: record.date };
            }
            const stat = eventStats[record.event];
            stat.pulls += record.pulls;
            if (record.date < stat.firstDate) stat.firstDate = record.date;
            if (RATIO_TAGS.includes(record.tag)) {
                const chars = countCharacters(record.notes);
                stat.ratio = true;
                stat.chars += chars;
                ratioPulls += record.pulls;
                ratioChars += chars;
            }
        });

        const eventStatsDiv = $('event-stats');
        eventStatsDiv.innerHTML = '<h5><i class="bi bi-calendar-event-fill"></i> 各活動總抽數</h5>'
            + (ratioChars > 0
                ? `<p class="ratio-summary">本家＋合作：抽到 ${ratioChars.toLocaleString()} 隻，平均每隻 <strong>${formatPullsPerChar(ratioPulls, ratioChars)}</strong> 抽</p>`
                : '');
        const scrollableContent = document.createElement('div');
        scrollableContent.id = 'event-stats-content';

        const sortedEvents = Object.entries(eventStats).sort(([, a], [, b]) => b.firstDate.localeCompare(a.firstDate));
        if (sortedEvents.length === 0) {
            scrollableContent.innerHTML = '<p><i>尚無資料</i></p>';
        } else {
            scrollableContent.innerHTML = sortedEvents.map(([event, data]) => {
                const [year, month] = data.firstDate.split('-');
                const displayEventName = getCleanEventName(event, data.firstDate);
                const ratio = data.ratio && data.pulls > 0
                    ? `<span class="event-ratio">${data.chars.toLocaleString()} 隻${data.chars > 0 ? ` · 每隻 ${formatPullsPerChar(data.pulls, data.chars)} 抽` : ''}</span>`
                    : '';
                // 日期固定一欄、不換行 (2026/11)；活動名稱太長時在右邊那欄換行
                return `<p class="event-line"><span class="event-date">${escapeHtml(year)}/${escapeHtml(month)}</span>`
                    + `<span class="event-body">${escapeHtml(displayEventName)}: <strong>${data.pulls.toLocaleString()}</strong> 抽${ratio}</span></p>`;
            }).join('');
        }
        eventStatsDiv.appendChild(scrollableContent);

        renderTrendStats(filteredRecords);
        renderTagShareStats(filteredRecords);
    }

    function updateEventFormSelect(recordsToUse) {
        const currentEvent = eventSelect.value;
        const userEventNames = [...new Set(recordsToUse.map((r) => r.event))];

        const selectedDate = dateFilter.value;
        let filteredMasterEvents = masterEvents;
        if (selectedDate !== 'all') {
            filteredMasterEvents = masterEvents.filter((e) => getEventDate(e).startsWith(selectedDate));
        }

        const masterEventNames = filteredMasterEvents.map((e) => e.event);
        const allEventNames = [...new Set([...userEventNames, ...masterEventNames])].sort(compareEventNamesByDate);

        eventSelect.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const newOption = document.createElement('option');
        newOption.value = '--new--';
        newOption.textContent = '-- 新增活動 --';
        newOption.style.fontStyle = 'italic';
        newOption.style.color = '#0d6efd';
        fragment.appendChild(newOption);
        allEventNames.forEach((name) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            fragment.appendChild(option);
        });
        eventSelect.appendChild(fragment);

        if (allEventNames.includes(currentEvent)) eventSelect.value = currentEvent;
        else if (!editMode) eventSelect.value = '--new--';
    }

    function updateAccountFilter(sortedAccounts) {
        const currentFilterValue = accountFilter.value;
        accountFilter.innerHTML = '<option value="all">全部帳號</option>';
        sortedAccounts.forEach((name) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            accountFilter.appendChild(option);
        });
        accountFilter.value = currentFilterValue;
    }

    // 合作活動在月份選單中顯示的名稱 (移除日期前綴，必要時截斷「×」前面的部分)
    function getCollabDisplayName(name) {
        let clean = name.replace(/^\d{4}[-年/]\d{1,2}月?\s*/, '');
        if (clean.includes('×') && !TRUNCATION_EXCEPTIONS.some((ex) => clean.includes(ex))) {
            const parts = clean.split('×');
            if (parts.length > 1) clean = parts[parts.length - 1];
        }
        return clean.trim();
    }

    // 日期篩選：年份 + 月份合併成一個選單，月份會標出當月的合作活動
    function updateDateFilter() {
        const currentFilterValue = dateFilter.value;
        const dates = new Set();

        // 已知是「合作」的活動名稱 (來自官方清單或使用者紀錄)
        const knownCollabEvents = new Set();
        records.forEach((r) => { if (r.tag === 'collab') knownCollabEvents.add(r.event); });
        masterEvents.forEach((e) => { if (e.tag === 'collab') knownCollabEvents.add(e.event); });

        // 候選活動：官方清單 + 不在清單內的使用者紀錄
        const candidateEvents = [...masterEvents];
        const candidateNames = new Set(masterEvents.map((e) => e.event));
        records.forEach((r) => {
            if (!candidateNames.has(r.event)) {
                candidateNames.add(r.event);
                candidateEvents.push({ event: r.event, date: r.date, tag: r.tag });
            }
        });

        const collectDates = (dateStr) => {
            if (!dateStr || typeof dateStr !== 'string') return;
            const match = dateStr.match(/^(\d{4})-(\d{2})/);
            if (match) {
                dates.add(match[1]);
                dates.add(`${match[1]}-${match[2]}`);
            }
        };
        records.forEach((r) => collectDates(r.date));
        masterEvents.forEach((e) => collectDates(getEventDate(e)));

        // 依年份分組
        const dateTree = {};
        [...dates].sort().reverse().forEach((d) => {
            if (d.length === 4) {
                if (!dateTree[d]) dateTree[d] = [];
            } else {
                const y = d.substring(0, 4);
                if (!dateTree[y]) dateTree[y] = [];
                dateTree[y].push(d);
            }
        });

        const fragment = document.createDocumentFragment();
        const addOptionTo = (value, text, bold = false) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text;
            if (bold) option.style.fontWeight = 'bold';
            fragment.appendChild(option);
        };

        addOptionTo('all', '全部日期');
        Object.keys(dateTree).sort().reverse().forEach((year) => {
            addOptionTo(year, `${year}年 (全)`, true);

            dateTree[year].sort().reverse().forEach((monthStr) => {
                const monthNum = parseInt(monthStr.split('-')[1], 10);
                let displayText = `　└ ${monthNum}月`;

                const collabNames = candidateEvents
                    .filter((e) => getEventDate(e).startsWith(monthStr) && knownCollabEvents.has(e.event))
                    .map((e) => e.event);

                if (collabNames.length > 0) {
                    const finalUniqueNames = [...new Set([...new Set(collabNames)].map(getCollabDisplayName))];
                    const eventNamesStr = finalUniqueNames.join(' / ');
                    const displayName = eventNamesStr.length > COLLAB_NAME_MAX_LENGTH
                        ? eventNamesStr.substring(0, COLLAB_NAME_MAX_LENGTH) + '...'
                        : eventNamesStr;
                    displayText += ` | 合作：${displayName}`;
                }
                addOptionTo(monthStr, displayText);
            });
        });

        dateFilter.innerHTML = '';
        dateFilter.appendChild(fragment);
        if (hasSelectOption(dateFilter, currentFilterValue)) dateFilter.value = currentFilterValue;
    }

    function updateAccountFormSelect(sortedAccounts, options = { isEditMode: false }) {
        const currentAccount = accountSelect.value;
        accountSelect.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const defaultOption = document.createElement('option');
        if (options.isEditMode) {
            defaultOption.value = '--batch--';
            defaultOption.textContent = '-- 全部帳號 (僅編輯) --';
            defaultOption.style.color = 'blue';
        } else {
            defaultOption.value = '--new--';
            defaultOption.textContent = '-- 新增帳號 --';
            defaultOption.style.fontStyle = 'italic';
            defaultOption.style.color = '#0d6efd';
        }
        fragment.appendChild(defaultOption);
        sortedAccounts.forEach((name) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            fragment.appendChild(option);
        });
        accountSelect.appendChild(fragment);

        if (hasSelectOption(accountSelect, currentAccount)) accountSelect.value = currentAccount;
        else if (!options.isEditMode) accountSelect.value = '--new--';
    }

    function updateAccountEditBtnState() {
        if (!editAccountBtn) return;
        const selectedAccount = accountSelect.value;
        if (editMode) {
            editAccountBtn.title = '編輯帳號資訊或新增記錄';
        } else {
            editAccountBtn.title = (selectedAccount === '--new--') ? '輸入新帳號名稱' : '切換到新增帳號輸入';
        }
        editAccountBtn.style.display = 'block';
    }


    // =====================================================
    // 8. 表單模式 (新增 / 編輯 / 帳號)
    // =====================================================
    function showAccountSelectUI() {
        accountSelectGroup.style.display = 'flex';
        accountInputGroup.style.display = 'none';
        isAddingNewAccount = false;
        editingAccountOriginal = null;
        updateAccountEditBtnState();
    }

    function showAccountInputUI() {
        accountSelectGroup.style.display = 'none';
        accountInputGroup.style.display = 'block';
        isAddingNewAccount = true;
        accountInput.focus({ preventScroll: true });
        updateAccountEditBtnState();
    }

    function showEventSelectUI() {
        eventSelect.style.display = 'block';
        eventInputGroup.style.display = 'none';
        isAddingNewEvent = false;
    }

    function showEventInputUI() {
        eventSelect.style.display = 'none';
        eventInputGroup.style.display = 'block';
        isAddingNewEvent = true;
        eventInput.value = '';
        eventInput.focus();
    }

    function togglePullFields(enabled) {
        pullsInput.disabled = !enabled;
        notesInput.disabled = !enabled;
        if (enabled) {
            pullsInput.classList.remove('field-disabled');
            notesInput.classList.remove('field-disabled');
        } else {
            pullsInput.classList.add('field-disabled');
            notesInput.classList.add('field-disabled');
            pullsInput.value = '';
            notesInput.value = '';
        }
    }

    function resetFormState() {
        editMode = false;
        editEventName = null;
        editingRecordId = null;
        form.reset();
        tagSelect.value = 'none';
        dateInput.valueAsDate = new Date();
        submitBtnText.textContent = '儲存紀錄';
        cancelEditBtn.style.display = 'none';
        togglePullFields(true);
        showEventSelectUI();
        updateEventFormSelect(records);
        eventSelect.value = '--new--';
        isAddingNewEvent = false;
        handleEventSelectChange();
        showAccountSelectUI();
        updateAccountFormSelect(getSortedAccountNames(), { isEditMode: false });
        accountSelect.value = '--new--';
        accountInput.value = '';
        updateAccountEditBtnState();
        renderCharPicker();
    }

    function enterAddMode() {
        editMode = false;
        editingRecordId = null;
        submitBtnText.textContent = '儲存紀錄';
        cancelEditBtn.style.display = 'inline-block';
        editEventBtn.style.display = 'none';
        showEventInputUI();
        eventInput.value = '';
        dateInput.valueAsDate = new Date();
        tagSelect.value = 'none';
        togglePullFields(true);
        pullsInput.value = '';
        notesInput.value = '';
        showAccountSelectUI();
        updateAccountFormSelect(getSortedAccountNames(), { isEditMode: false });
        accountSelect.value = '--new--';
        showToast('請輸入新活動資訊', 'info');
        updateAccountEditBtnState();
        renderCharPicker();
    }

    function enterAccountEditMode() {
        const accountName = accountSelect.value;
        if (accountName === '--new--') {
            showAccountInputUI();
            accountInput.value = '';
        } else if (accountName === '--batch--') {
            showToast('請先選擇一個特定的帳號進行編輯或取消編輯模式', 'error');
        } else {
            showAccountInputUI();
            accountInput.value = accountName;
            // 編輯模式下修改帳號名稱：記住原本的帳號，儲存時把「這一筆」移到新帳號下
            if (editMode) editingAccountOriginal = accountName;
        }
    }

    function enterEditMode() {
        const eventName = eventSelect.value;
        if (eventName === '--new--' || !eventName) {
            enterAddMode();
            return;
        }
        editMode = true;
        editEventName = eventName;
        editingRecordId = null;
        submitBtnText.textContent = '更新紀錄';
        cancelEditBtn.style.display = 'inline-block';
        editEventBtn.style.display = 'none';
        showEventInputUI();
        eventInput.value = eventName;
        updateAccountFormSelect(getSortedAccountNames(), { isEditMode: true });
        accountSelect.value = '--batch--';
        loadRecordForEdit('--batch--');
        showToast('進入編輯模式', 'info');
        updateAccountEditBtnState();
    }

    // 找出編輯對象：從表格進入時優先用 id，其餘以「活動 + 帳號」尋找
    function findRecordForEdit(accountName) {
        if (editingRecordId !== null) {
            const byId = records.find((r) => r.id === editingRecordId);
            if (byId && byId.account === accountName && byId.event === editEventName) return byId;
        }
        return records.find((r) => r.event === editEventName && r.account === accountName);
    }

    function loadRecordForEdit(accountName) {
        if (!editMode) return;
        let recordToLoad = null;
        if (accountName === '--batch--') {
            togglePullFields(false);
            recordToLoad = records.find((r) => r.event === editEventName) || masterEvents.find((e) => e.event === editEventName);
        } else {
            togglePullFields(true);
            recordToLoad = findRecordForEdit(accountName) || masterEvents.find((e) => e.event === editEventName);
        }

        if (recordToLoad) {
            dateInput.value = recordToLoad.date || '';
            tagSelect.value = recordToLoad.tag || 'none';
            if (accountName !== '--batch--') {
                // 嚴格檢查 undefined / null，確保 0 抽能被保留
                pullsInput.value = (recordToLoad.pulls !== undefined && recordToLoad.pulls !== null) ? recordToLoad.pulls : '';
                notesInput.value = recordToLoad.notes || '';
            }
        } else {
            pullsInput.value = '';
            notesInput.value = '';
        }
        renderCharPicker();
    }

    function handleEventSelectChange() {
        const selectedEventName = eventSelect.value;

        // 總是顯示編輯按鈕，讓使用者可以隨時切換到輸入模式修改活動名稱
        editEventBtn.style.display = 'block';

        if (selectedEventName !== '--new--') {
            const m = masterEvents.find((e) => e.event === selectedEventName);
            const dateToUse = m ? m.date : '';
            let tagToUse = m ? m.tag : '';

            // 官方清單沒標籤時，嘗試從歷史紀錄找
            if (!tagToUse) {
                const recordWithTag = records.find((r) => r.event === selectedEventName && r.tag);
                if (recordWithTag) tagToUse = recordWithTag.tag;
            }

            if (dateToUse) dateInput.value = dateToUse;
            eventEndDateInput.value = (m && m.endDate) || '';
            if (tagToUse) {
                tagSelect.value = tagToUse;
                checkFreeTagDefault();
            }
        }
    }

    function handleFormSubmit(e) {
        e.preventDefault();
        if (!globalEditMode) { showToast('請先點擊右下角的 "進入編輯模式"', 'info'); return; }

        const date = dateInput.value;
        const tag = tagSelect.value;
        const pulls = parseInt(pullsInput.value, 10);
        const notes = formatCharacterString(notesInput.value, tag);

        let event;
        if (isAddingNewEvent || editMode) {
            event = normalizeName(eventInput.value);
        } else {
            event = eventSelect.value;
            if (event === '--new--') { showToast('請點擊"編輯"按鈕來輸入新活動名稱！', 'error'); return; }
        }
        const account = isAddingNewAccount ? accountInput.value.trim() : accountSelect.value;

        if (!date) { showToast('請選擇日期！', 'error'); return; }
        if (!event || event === '--new--') { showToast('請輸入或選擇有效的活動！', 'error'); return; }
        if (isAddingNewAccount && !account) { showToast('請輸入新帳號名稱！', 'error'); return; }
        if (!account || account === '--new--') { showToast('請輸入或選擇有效的帳號！', 'error'); return; }
        if (account !== '--batch--' && (isNaN(pulls) || pulls < 0)) { showToast('請輸入有效的抽數！', 'error'); return; }

        const accountUsed = account;

        if (editMode) {
            if (account === '--batch--') {
                // 改名或改日期後，會不會和其他紀錄變成「同日、同活動、同帳號」
                const affected = records.filter((r) => r.event === editEventName);
                const affectedIds = affected.map((r) => r.id);
                const conflicts = [...new Set(affected
                    .filter((r, i) => affected.findIndex((o) => o.account === r.account) !== i
                        || findDuplicateRecord({ date, event, account: r.account }, affectedIds))
                    .map((r) => r.account))];
                if (conflicts.length > 0) {
                    showToast(`無法更新：${conflicts.join('、')} 會出現同一天、同一活動的重複紀錄。`, 'error');
                    return;
                }
                let updatedCount = 0;
                records.forEach((r) => {
                    if (r.event === editEventName) {
                        r.event = event;
                        r.date = date;
                        r.tag = tag;
                        updatedCount++;
                    }
                });
                showToast(`已批次更新 ${updatedCount} 筆紀錄！`, 'success');
            } else {
                // 帳號名稱被改過時，用原本的帳號找出要更新的那一筆 (只把這一筆移到新帳號下)
                const sourceAccount = (isAddingNewAccount && editingAccountOriginal) ? editingAccountOriginal : account;
                const recordToUpdate = findRecordForEdit(sourceAccount);
                if (findDuplicateRecord({ date, event, account }, recordToUpdate ? [recordToUpdate.id] : [])) {
                    showToast(`錯誤：${account} 在 ${date} 已有這個活動的紀錄。`, 'error');
                    return;
                }
                if (recordToUpdate) {
                    recordToUpdate.account = account;
                    recordToUpdate.event = event;
                    recordToUpdate.date = date;
                    recordToUpdate.tag = tag;
                    recordToUpdate.pulls = pulls;
                    recordToUpdate.notes = notes;
                    showToast('紀錄已更新！', 'success');
                } else {
                    records.push({ id: generateRecordId(), date, event, account, pulls, notes, tag });
                    showToast('已為此帳號新增紀錄！', 'success');
                }
            }
        } else {
            if (findDuplicateRecord({ date, event, account })) {
                showToast('錯誤：該筆紀錄已存在。', 'error');
                handleEventSelectChange();
                return;
            }
            records.push({ id: generateRecordId(), date, event, account, pulls, notes, tag });
            showToast('紀錄已儲存！', 'success');
        }

        saveData();
        resetFormState();
        renderAll();

        if (!editMode && accountUsed && accountUsed !== '--batch--' && hasSelectOption(accountSelect, accountUsed)) {
            showAccountSelectUI();
            accountSelect.value = accountUsed;
        }
    }

    function handleTableClick(e) {
        const deleteButton = e.target.closest('.btn-danger');
        const editButton = e.target.closest('.btn-warning');

        if (deleteButton) {
            const idToDelete = parseInt(deleteButton.getAttribute('data-id'), 10);
            if (confirm('確定要刪除這筆紀錄嗎？')) {
                records = records.filter((record) => record.id !== idToDelete);
                saveData();
                renderAll();
                resetFormState();
                showToast('紀錄已刪除', 'success');
            }
        } else if (editButton) {
            const idToEdit = parseInt(editButton.getAttribute('data-id'), 10);
            const recordToEdit = records.find((r) => r.id === idToEdit);
            if (!recordToEdit) return;
            if (!globalEditMode) { showToast('請先點擊右下角的 "進入編輯模式"', 'info'); return; }

            showAccountSelectUI();
            eventSelect.value = recordToEdit.event;
            enterEditMode();
            editingRecordId = recordToEdit.id;
            accountSelect.value = recordToEdit.account;
            loadRecordForEdit(recordToEdit.account);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            showToast('請在上方表單編輯', 'info');
        }
    }


    // =====================================================
    // 8-1. 卡池角色按鈕：選好活動後，把這個活動可以抽到的角色列成按鈕，點一下加進「獲得角色」
    //   卡池資料在角色圖鑑 (pools.js、pools.json)；讀不到時不顯示按鈕，照常手動輸入
    //   合作活動另外列出這個活動之前記過的角色
    // =====================================================
    let characterPools = [];
    const NOT_CHARACTER_RE = /^(?:\d+\s*[抽顆]?|[?？]+\s*抽|無|沒有|没有|-|－)$/;
    // 果實分配的註記與同名編號：「虹夏-2(擊種)」→「虹夏」(和角色圖鑑、果實分配的解析一致)
    const baseCharacterName = (name) => name.replace(/\s*[(（](?:同族|戰型|擊種|雙削)[)）]$/, '').replace(/-\d+$/, '').trim();
    // 輸入框以空白、逗號分隔角色，名稱裡的空白要拿掉 (「Two for all」→「Twoforall」)，結尾的逗號也拿掉
    const pickerName = (name) => name.replace(/\s+/g, '').replace(/[,，、]+$/, '');

    async function loadCharacterPools() {
        const lib = window.CharacterPools;
        if (!lib) return;   // 角色圖鑑的 pools.js 沒載入
        try {
            // no-cache：卡池剛更新時不要讀到 GitHub Pages 快取的舊版
            const res = await fetch(CHARACTER_POOLS_URL, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            characterPools = lib.readPools(await res.json());
            renderCharPicker();
        } catch (e) {
            console.warn('[POOLS] 讀不到角色圖鑑的卡池，獲得角色請手動輸入', e);
        }
        // 管理員在角色圖鑑做的名稱修正 (shared/characters)：
        //   紀錄裡寫錯的名稱改成正確名稱 (normalizeAllRecords，有改到時照常存檔、同步雲端)，「之前記過」也用修正後的名稱
        try {
            if (!lib.readNameFixes || !(await waitForFirebaseServices())) return;
            const snap = await window.getDoc(window.doc(window.db, SHARED_COLLECTION, CHARACTER_FIXES_DOC_ID));
            characterNameFixes = lib.readNameFixes(snap.exists() ? snap.data() : null);
            if (characterNameFixes.renames.size > 0) {
                normalizeAllRecords();
                renderAll();
            }
            renderCharPicker();
        } catch (e) {
            console.warn('[POOLS] 讀不到角色名稱修正，照紀錄原樣顯示', e);
        }
    }

    function currentFormEventName() {
        const name = (isAddingNewEvent || editMode) ? eventInput.value : eventSelect.value;
        return name === '--new--' ? '' : normalizeName(name || '');
    }

    // 這個活動之前記過的角色 (所有帳號)
    function recordedCharactersOf(eventName) {
        const names = [];
        records.forEach((r) => {
            if (r.event !== eventName || r.tag === 'orb') return;
            parseCharacterList(getCleanNotes(r.notes || ''), r.tag).forEach(({ name }) => {
                const base = baseCharacterName(name);
                const n = base && characterNameFixes && window.CharacterPools
                    ? window.CharacterPools.resolveName(characterNameFixes, base) : base;
                if (n && !NOT_CHARACTER_RE.test(n) && !names.includes(n)) names.push(n);
            });
        });
        return names;
    }

    function renderCharPicker() {
        const picker = $('char-picker');
        if (!picker) return;
        const eventName = currentFormEventName();
        const lib = window.CharacterPools;
        const groups = [];
        if (eventName && !notesInput.disabled) {
            if (lib) {
                lib.poolsForEvent(characterPools, eventName).forEach((p) => {
                    groups.push({ title: `${p.kind === 'collab' ? '合作' : '限定'}：${p.pool}`, kind: p.kind, chars: p.chars.map(pickerName) });
                });
            }
            if (tagSelect.value === 'collab') {
                const shown = new Set(groups.flatMap((g) => g.chars));
                const past = recordedCharactersOf(eventName).filter((n) => !shown.has(n));
                if (past.length > 0) groups.push({ title: '這個活動之前記過', kind: 'past', chars: past });
            }
        }

        picker.hidden = groups.length === 0;
        if (picker.hidden) { picker.replaceChildren(); return; }

        const counts = new Map(parseCharacterList(notesInput.value, tagSelect.value).map((c) => [c.name, c.count]));
        picker.replaceChildren(...groups.map((g) => {
            const group = document.createElement('div');
            group.className = `char-picker-group char-picker-${g.kind}`;
            const title = document.createElement('div');
            title.className = 'char-picker-title';
            title.textContent = g.title;
            group.appendChild(title);
            g.chars.forEach((name) => {
                // 一個角色一組：主按鈕加 1 隻；已選的角色後面多一個「−」減 1 隻
                const wrap = document.createElement('span');
                wrap.className = 'char-chip-wrap';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'char-chip';
                btn.dataset.name = name;
                btn.dataset.step = '1';
                btn.title = `加 1 隻「${name}」`;
                btn.textContent = name;
                wrap.appendChild(btn);
                const count = counts.get(name);
                if (count) {
                    wrap.classList.add('is-picked');
                    const badge = document.createElement('span');
                    badge.className = 'char-chip-count';
                    badge.textContent = `×${count}`;
                    btn.appendChild(badge);
                    const minus = document.createElement('button');
                    minus.type = 'button';
                    minus.className = 'char-chip char-chip-minus';
                    minus.dataset.name = name;
                    minus.dataset.step = '-1';
                    minus.title = `減 1 隻「${name}」`;
                    minus.setAttribute('aria-label', `減 1 隻「${name}」`);
                    minus.textContent = '−';
                    wrap.appendChild(minus);
                }
                group.appendChild(wrap);
            });
            return group;
        }));
    }

    // 「獲得角色」裡某隻角色加減 1 隻 (減到 0 就拿掉)，結果整理成存檔格式
    function adjustCharacterCount(notes, name, delta, tag) {
        const list = parseCharacterList(notes, tag);
        const item = list.find((c) => c.name === name);
        if (item) item.count += delta;
        else if (delta > 0) list.push({ name, count: delta });
        return formatCharacterString(list.filter((c) => c.count > 0)
            .map((c) => (c.count > 1 ? `${c.name}*${c.count}` : c.name)).join('、'), tag);
    }

    function bindCharPicker() {
        const picker = $('char-picker');
        if (!picker) return;
        picker.addEventListener('click', (e) => {
            const btn = e.target.closest('.char-chip');
            if (!btn || notesInput.disabled) return;
            notesInput.value = adjustCharacterCount(notesInput.value, btn.dataset.name, btn.dataset.step === '-1' ? -1 : 1, tagSelect.value);
            renderCharPicker();
        });
        notesInput.addEventListener('input', renderCharPicker);
        eventInput.addEventListener('input', renderCharPicker);
        tagSelect.addEventListener('change', renderCharPicker);
        eventSelect.addEventListener('change', renderCharPicker);
    }


    // =====================================================
    // 9. 事件綁定
    // =====================================================
    function bindFormEvents() {
        form.addEventListener('submit', handleFormSubmit);
        tableBody.addEventListener('click', handleTableClick);

        cancelEditBtn.addEventListener('click', (e) => {
            e.preventDefault();
            resetFormState();
            showToast('已取消編輯', 'info');
        });

        tagSelect.addEventListener('change', checkFreeTagDefault);
        eventSelect.addEventListener('change', handleEventSelectChange);
        editEventBtn.addEventListener('click', () => eventSelect.value === '--new--' ? enterAddMode() : enterEditMode());
        cancelNewEvent.addEventListener('click', resetFormState);

        accountSelect.addEventListener('change', updateAccountEditBtnState);
        editAccountBtn.addEventListener('click', enterAccountEditMode);
        cancelNewAccount.addEventListener('click', () => {
            showAccountSelectUI();
            // 取消時依模式回復正確的選項
            accountSelect.value = editMode ? '--batch--' : '--new--';
        });

        modeToggleBtn.addEventListener('click', () => {
            globalEditMode = !globalEditMode;
            document.body.classList.toggle('edit-mode-active', globalEditMode);
            gachaFieldset.disabled = !globalEditMode;
            modeToggleBtn.classList.toggle('btn-outline-secondary', !globalEditMode);
            modeToggleBtn.classList.toggle('btn-primary', globalEditMode);
            modeToggleBtn.innerHTML = globalEditMode
                ? '<i class="bi bi-check-circle"></i> 完成編輯'
                : '<i class="bi bi-eye"></i> 檢視模式 (點此編輯)';
            resetFormState();
            showToast(globalEditMode ? '已進入編輯模式' : '已退出編輯模式', 'info');
        });
    }

    function bindFilterEvents() {
        accountFilter.addEventListener('change', renderAll);
        dateFilter.addEventListener('change', renderAll);
        document.querySelectorAll('.tag-filter').forEach((checkbox) => {
            checkbox.addEventListener('change', renderAll);
        });
    }

    function bindDataEvents() {
        clearButton.addEventListener('click', () => {
            const cloudNote = (isCloudMode && currentUser) ? '\n登入狀態下，雲端的紀錄也會一併清除。' : '';
            if (confirm(`警告：這將刪除所有儲存的抽卡紀錄！確定嗎？${cloudNote}`)) {
                records = [];
                saveData();
                renderAll();
                resetFormState();
                showToast('所有資料已清除', 'error');
            }
        });

        exportButton.addEventListener('click', () => {
            if (records.length === 0) { showToast('目前沒有資料可匯出', 'info'); return; }
            downloadJson(records, `gacha_records_${new Date().toISOString().split('T')[0]}.json`);
            showToast('備份已下載！', 'success');
        });

        importButton.addEventListener('click', () => importFileInput.click());
        importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const jsonData = JSON.parse(event.target.result);
                    if (!Array.isArray(jsonData)) throw new Error('格式錯誤');

                    const cloudNote = (isCloudMode && currentUser) ? '\n登入狀態下，雲端的紀錄也會一併被取代。' : '';
                    if (records.length > 0 && !confirm(
                        `載入「${file.name}」（${jsonData.length} 筆）會取代目前的 ${records.length} 筆紀錄，確定嗎？${cloudNote}`
                    )) return;

                    const dropped = setRecords(jsonData);
                    normalizeAllRecords();
                    saveData();
                    renderAll();
                    showToast(
                        dropped > 0 ? `備份已載入，已略過 ${dropped} 筆格式不正確的紀錄` : '備份已成功載入！',
                        dropped > 0 ? 'info' : 'success'
                    );
                } catch (err) {
                    showToast('載入失敗！檔案格式錯誤。', 'error');
                } finally {
                    importFileInput.value = null;
                }
            };
            reader.readAsText(file);
        });
    }

    // 管理員：在表單旁儲存 / 刪除雲端活動清單中的活動
    async function handleSaveEventToMaster() {
        if (!requireAdmin()) return;
        if (!globalEditMode) { showToast('請先切換到編輯模式', 'info'); return; }

        const rawName = (isAddingNewEvent || editMode) ? eventInput.value : eventSelect.value;
        const name = normalizeName(rawName);
        if (!name || name === '--new--') { showToast('請先選擇或輸入有效的活動名稱！', 'error'); return; }
        const date = dateInput.value;
        if (!date) { showToast('請選擇日期！', 'error'); return; }
        const tag = tagSelect.value === 'none' ? '' : tagSelect.value;
        const endDate = eventEndDateInput.value;
        if (endDate && endDate < date) { showToast('活動結束日不能早於開始日期！', 'error'); return; }

        // 編輯模式下名稱有變動 = 更名；舊名稱會記在 aliases，讓所有人的紀錄自動對應到新名稱
        const oldName = (editMode && editEventName) ? normalizeName(editEventName) : null;
        const isRename = !!oldName && oldName !== name;

        if (!(await prepareMasterEventsForWrite())) return;

        if (isRename) {
            if (masterEvents.some((e) => e.event === name)) {
                showToast('清單中已有同名活動，無法更名。', 'error');
                return;
            }
            if (!confirm(`將活動「${oldName}」更名為「${name}」？\n所有使用者的紀錄會在下次開啟頁面時自動對應到新名稱。`)) return;
        }

        let entry = masterEvents.find((e) => e.event === (isRename ? oldName : name));
        if (entry) {
            const aliases = new Set(entry.aliases || []);
            if (isRename) {
                aliases.add(oldName);
                entry.event = name;
            }
            entry.date = date;
            entry.tag = tag;
            if (endDate) entry.endDate = endDate;
            else delete entry.endDate;
            if (aliases.size > 0) entry.aliases = [...aliases];
            else delete entry.aliases;
        } else {
            entry = { event: name, date, tag };
            if (endDate) entry.endDate = endDate;
            if (isRename) entry.aliases = [oldName];
            masterEvents.push(entry);
        }
        masterEvents.sort((a, b) => compareEventNamesByDate(a.event, b.event));
        dateFilterDirty = true;

        try {
            await saveMasterEventsToCloud();
            normalizeAllRecords();
            resetFormState();
            renderAll();
            showToast(isRename ? `已更名並儲存：${name}` : `已儲存到雲端活動清單：${name}`, 'success');
        } catch (error) {
            console.error('[ADMIN] 儲存活動失敗', error);
            await refreshMasterEventsFromCloud();
            showToast(masterSaveErrorMessage(error, '儲存失敗，請檢查管理員權限或網路。'), 'error');
        }
    }

    async function handleDeleteEventFromMaster() {
        if (!requireAdmin()) return;
        if (!globalEditMode) { showToast('請先切換到編輯模式', 'info'); return; }

        const name = normalizeName(eventSelect.value);
        if (!name || name === '--new--') { showToast('請先選擇一個活動！', 'error'); return; }
        if (!(await prepareMasterEventsForWrite())) return;
        if (!masterEvents.some((e) => e.event === name)) { showToast('此活動不在雲端活動清單中。', 'info'); return; }
        if (!confirm(`確定要從雲端活動清單移除「${name}」嗎？\n（不會刪除任何人的抽卡紀錄）`)) return;

        masterEvents = masterEvents.filter((e) => e.event !== name);
        dateFilterDirty = true;

        try {
            await saveMasterEventsToCloud();
            resetFormState();
            renderAll();
            showToast(`已從清單移除：${name}`, 'success');
        } catch (error) {
            console.error('[ADMIN] 刪除活動失敗', error);
            await refreshMasterEventsFromCloud();
            showToast(masterSaveErrorMessage(error, '刪除失敗，請檢查管理員權限或網路。'), 'error');
        }
    }

    // 管理員：資料管理區的活動清單匯入 / 匯出
    function bindAdminEvents() {
        saveEventMasterBtn.addEventListener('click', handleSaveEventToMaster);
        deleteEventMasterBtn.addEventListener('click', handleDeleteEventFromMaster);

        // 匯入活動清單 (events.json)：合併進目前清單並寫入雲端；已存在的活動不會被覆蓋。
        // 首次建立雲端清單時，直接選擇 repo 裡的 events.json 即可。
        importEventsFileBtn.addEventListener('click', () => {
            if (!requireAdmin()) return;
            importEventsFileInput.click();
        });
        importEventsFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    if (!Array.isArray(importedData)) throw new Error('格式錯誤');
                    if (!(await prepareMasterEventsForWrite())) return;

                    const addedCount = mergeNewEvents(importedData);
                    await saveMasterEventsToCloud();
                    normalizeAllRecords();
                    renderAll();
                    showToast(`匯入成功！新增 ${addedCount} 筆活動，雲端清單共 ${masterEvents.length} 筆。`, 'success');
                } catch (err) {
                    console.error('[ADMIN] 匯入活動清單失敗', err);
                    await refreshMasterEventsFromCloud();
                    showToast(masterSaveErrorMessage(err, `匯入失敗：${err.message}`), 'error');
                } finally {
                    importEventsFileInput.value = null;
                }
            };
            reader.readAsText(file);
        });

        // 匯出活動清單：缺少標籤或日期的活動，嘗試從紀錄補齊 (可用來更新 repo 裡的 events.json 備援)
        exportAllEventsBtn.addEventListener('click', () => {
            if (!masterEvents || masterEvents.length === 0) {
                showToast('目前沒有活動資料可匯出！', 'error');
                return;
            }
            const enrichedEvents = masterEvents.map((evt) => {
                const newEvt = { ...evt };
                if (!newEvt.tag) {
                    const record = records.find((r) => r.event === newEvt.event && r.tag);
                    if (record) newEvt.tag = record.tag;
                }
                if (!newEvt.date) {
                    const record = records.find((r) => r.event === newEvt.event && r.date);
                    if (record) newEvt.date = record.date;
                }
                return newEvt;
            });
            downloadJson(enrichedEvents, `events_list_${new Date().toISOString().split('T')[0]}.json`);
            showToast(`已匯出活動清單！(共 ${enrichedEvents.length} 筆)`, 'success');
        });
    }

    function bindEvents() {
        bindFormEvents();
        bindCharPicker();   // 要在 bindFormEvents 之後：選活動時先帶入標籤，再更新按鈕
        bindFilterEvents();
        bindDataEvents();
        bindAdminEvents();
    }


    // 懸浮工具箱：載入工具箱的 tools.js (window.MS_TOOLS) 後重建工具連結。
    // 用動態載入，不擋住頁面啟動；讀不到或格式不對就維持 index.html 裡的連結
    function renderToolboxMenu() {
        const list = document.querySelector('.toolbox-items-list');
        const tools = Array.isArray(window.MS_TOOLS) ? window.MS_TOOLS : [];
        const valid = tools.filter((t) => t && typeof t.name === 'string' && t.name
            && typeof t.url === 'string' && /^https:\/\//.test(t.url));
        if (!list || valid.length === 0) return;

        const home = list.querySelector('.toolbox-home');
        const links = valid.map((t) => {
            const active = t.id === THIS_TOOL_ID;
            const emoji = typeof t.emoji === 'string' ? t.emoji + ' ' : '';
            return `<a href="${escapeHtml(t.url)}" class="toolbox-item${active ? ' active' : ''}">`
                + `${escapeHtml(emoji + t.name)}${active ? ' (現行)' : ''}</a>`;
        }).join('');
        list.innerHTML = (home ? home.outerHTML : '') + links;
    }

    function loadToolboxMenu() {
        const script = document.createElement('script');
        script.src = TOOLBOX_TOOLS_URL;
        script.async = true;
        script.onload = renderToolboxMenu;
        script.onerror = () => console.warn('[TOOLBOX] 讀不到工具箱的 tools.js，使用內建連結');
        document.head.appendChild(script);
    }


    // =====================================================
    // 10. 啟動
    // =====================================================
    async function init() {
        // 先載入本機紀錄，再啟動登入偵測，避免登入流程搶在本機資料載入之前執行
        loadRecords();
        updateAdminButtonsState();   // 雲端活動清單讀到之前先停用管理員寫入
        initFirebaseAuth();
        loadToolboxMenu();

        await loadStaticEvents();
        renderAll();
        resetFormState();
        gachaFieldset.disabled = true;

        modeToggleBtn.classList.add('btn-outline-secondary');
        modeToggleBtn.innerHTML = '<i class="bi bi-eye"></i> 檢視模式 (點此編輯)';
        updateAccountEditBtnState();

        // 雲端活動清單 (有資料時取代 events.json)，不阻塞畫面
        refreshMasterEventsFromCloud();
        loadCharacterPools();
    }

    checkAuthCache();
    bindEvents();
    init();
});
