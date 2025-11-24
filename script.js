document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('gacha-form');
    const gachaFieldset = document.getElementById('gacha-fieldset');
    const modeToggleBtn = document.getElementById('mode-toggle-btn');
    const tableBody = document.getElementById('history-table-body');
    const toastMessage = document.getElementById('toast-message');
    const tagSelect = document.getElementById('tag-select');
    const eventSelect = document.getElementById('event-select');
    const eventInputGroup = document.getElementById('event-input-group');
    const eventInput = document.getElementById('event-input');
    const cancelNewEvent = document.getElementById('cancel-new-event');
    const editEventBtn = document.getElementById('edit-event-btn');
    const accountSelect = document.getElementById('account-select');
    const accountInputGroup = document.getElementById('account-input-group');
    const accountInput = document.getElementById('account-input');
    const cancelNewAccount = document.getElementById('cancel-new-account');
    const editAccountBtn = document.getElementById('edit-account-btn'); 
    const accountSelectGroup = accountSelect.closest('.input-group'); 
    const dateInput = document.getElementById('date');
    const pullsInput = document.getElementById('pulls');
    const notesInput = document.getElementById('notes');
    const submitBtnText = document.getElementById('submit-btn-text');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const accountFilter = document.getElementById('account-filter');
    const dateFilter = document.getElementById('date-filter'); 
    const historyTableTitle = document.getElementById('history-table-title');
    
    // Data Management Buttons
    const clearButton = document.getElementById('clear-data');
    const exportButton = document.getElementById('export-data');
    const importButton = document.getElementById('import-data');
    const importFileInput = document.getElementById('import-file-input');
    const syncRemoteEventsBtn = document.getElementById('sync-remote-events');
    
    // Admin Mode Elements
    const exportEventJsonButton = document.getElementById('export-event-json');
    const exportAllEventsBtn = document.getElementById('export-all-events-btn');
    const importEventsFileBtn = document.getElementById('import-events-file-btn');
    const importEventsFileInput = document.getElementById('import-events-file-input');
    const adminBadge = document.getElementById('admin-badge');
    
    // Firebase Cloud Elements
    const loginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfoDiv = document.getElementById('user-info');
    const userDisplayNameSpan = document.getElementById('user-display-name');
    const userAvatarImg = document.getElementById('user-avatar');
    
    // Cloud Status Indicators
    const cloudStatus = document.getElementById('cloudStatus');
    const cloudStatusText = document.getElementById('cloudStatusText');
    const statusDot = document.querySelector('.status-dot');

    const REMOTE_EVENTS_URL = 'https://emily4027.github.io/monster-strike-gacha/events.json';
    // [Optimization] 6.2 Cache Key
    const USER_CACHE_KEY = 'gacha_user_cache_v1';

    let records = [];
    let masterEvents = []; 
    let globalEditMode = false;
    let editMode = false;
    let editEventName = null; 
    let isAddingNewAccount = false;
    let isAddingNewEvent = false;
    
    // Cloud State
    let currentUser = null; 
    let isCloudMode = false;
    let saveTimeout = null; // For debounce

    const preferredAccountOrder = ['羽入', '梨花', '沙都子'];
    const sampleData = [];

    // --- Cloud Status Helper ---
    function updateCloudStatus(status, msg) {
        cloudStatus.style.display = 'flex';
        cloudStatusText.textContent = msg;
        statusDot.className = 'status-dot'; // reset
        
        if (status === 'online') {
            statusDot.classList.add('status-online');
        } else if (status === 'saving') {
            statusDot.classList.add('status-saving');
        } else {
            statusDot.classList.add('status-offline');
        }
    }

    // --- [Optimization] 6.2 Render Auth UI (Shared Logic) ---
    function renderAuthUI(userData) {
        if (userData) {
            loginBtn.style.display = 'none';
            userInfoDiv.style.display = 'flex';
            userDisplayNameSpan.textContent = userData.displayName || '使用者';
            if (userData.photoURL) {
                userAvatarImg.src = userData.photoURL;
            }
        } else {
            loginBtn.style.display = 'block';
            userInfoDiv.style.display = 'none';
            userDisplayNameSpan.textContent = '';
            userAvatarImg.src = '';
        }
    }

    // --- [Optimization] 6.2 Check Cache on Init ---
    function checkAuthCache() {
        const cached = sessionStorage.getItem(USER_CACHE_KEY);
        if (cached) {
            try {
                const userData = JSON.parse(cached);
                // 立即渲染 UI，不等待 Firebase 回應
                renderAuthUI(userData);
                console.log('[Optimization] 6.2: Restored Auth UI from sessionStorage');
            } catch (e) {
                console.warn('Cache parse error, clearing.', e);
                sessionStorage.removeItem(USER_CACHE_KEY);
            }
        }
    }
    
    // 立即執行快取檢查
    checkAuthCache();

    // --- Unified Save Function (Local + Cloud Auto-Save) ---
    function saveData() {
        // 1. Always save to LocalStorage immediately
        localStorage.setItem('gachaRecords', JSON.stringify(records));

        // 2. If Cloud Mode, Debounce Save to Firestore
        // [Optimization] 6.1 避免不必要的讀取/寫入：透過 debounce 減少頻率
        if (isCloudMode && currentUser) {
            updateCloudStatus('saving', '儲存中...');
            clearTimeout(saveTimeout);
            
            saveTimeout = setTimeout(async () => {
                try {
                    const { doc, setDoc, serverTimestamp } = window;
                    if (!doc || !setDoc || !serverTimestamp) {
                        throw new Error("Firebase SDK functions missing");
                    }

                    const appId = window.envAppId || 'default-app-id';
                    const userDocRef = doc(window.db, "artifacts", appId, "users", currentUser.uid, "data", "gacha_records");
                    
                    // [Optimization] 使用 merge: true 避免覆蓋整個文件，雖是寫入但可減少意外資料遺失
                    await setDoc(userDocRef, {
                        records: records,
                        lastUpdated: serverTimestamp()
                    }, { merge: true }); 
                    
                    updateCloudStatus('online', '雲端就緒 (已同步)');
                    console.log('[CLOUD] Auto-saved successfully.');
                } catch (error) {
                    console.error('[CLOUD] Auto-save failed:', error);
                    updateCloudStatus('offline', '儲存失敗 (權限不足)');
                }
            }, 1500); 
        } else if (!isCloudMode) {
             updateCloudStatus('offline', '離線模式 (已存本地)');
        }
    }

    // --- Firebase Auth & Initialization (Optimized: Polling instead of fixed timeout) ---
    function initFirebaseAuth(retries = 0) {
        if (window.firebaseAuth) {
            window.onAuthStateChanged(window.firebaseAuth, async (user) => {
                currentUser = user;
                if (user) {
                    // [Optimization] 6.2 更新 SessionStorage
                    const userData = {
                        uid: user.uid,
                        displayName: user.displayName,
                        photoURL: user.photoURL
                    };
                    sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData));
                    
                    // 再次確認 UI 狀態 (確保資料最新)
                    renderAuthUI(userData);
                    
                    isCloudMode = true;
                    updateCloudStatus('saving', '正在從雲端載入...');
                    
                    // [Optimization] 6.1 避免不必要的讀取
                    // 這裡只在「登入成功」時呼叫一次 loadFromCloud
                    // 若之後只有 scroll 或 mousemove，不會觸發此處邏輯
                    await loadFromCloud();
                } else {
                    // [Optimization] 6.2 清除快取
                    sessionStorage.removeItem(USER_CACHE_KEY);
                    renderAuthUI(null);

                    isCloudMode = false;
                    updateCloudStatus('offline', '未偵測到帳戶 (離線模式)');
                }
            });

            logoutBtn.addEventListener('click', async () => {
                try {
                    await window.signOut(window.firebaseAuth);
                    // 登出時立即清除快取
                    sessionStorage.removeItem(USER_CACHE_KEY);
                    showToast('已登出', 'info');
                } catch (error) {
                    console.error(error);
                }
            });
            
            // 綁定登入按鈕事件 (如果尚未綁定)
            loginBtn.onclick = async () => {
                try {
                    const provider = new window.GoogleAuthProvider();
                    await window.signInWithPopup(window.firebaseAuth, provider);
                } catch (error) {
                    console.error("Login failed:", error);
                    showToast('登入失敗', 'error');
                }
            };

        } else if (retries < 50) { // 嘗試 50 次 * 100ms = 5秒
            setTimeout(() => initFirebaseAuth(retries + 1), 100);
        } else {
            console.error("Firebase SDK not loaded after timeout.");
            updateCloudStatus('offline', 'SDK 載入失敗 (離線模式)');
        }
    }
    
    // 啟動 Firebase 偵測
    initFirebaseAuth();

    // --- Cloud Load Logic ---
    async function loadFromCloud() {
        try {
            const { doc, getDoc } = window;
            const appId = window.envAppId || 'default-app-id';
            const userDocRef = doc(window.db, "artifacts", appId, "users", currentUser.uid, "data", "gacha_records");
            
            // [Optimization] 這裡是一次性的讀取 (Get)，符合需求
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.records && Array.isArray(data.records)) {
                    records = data.records;
                    
                    // [新增] 從雲端載入後，自動正規化舊資料
                    normalizeAllRecords();

                    localStorage.setItem('gachaRecords', JSON.stringify(records));
                    renderAll();
                    resetFormState();
                    updateCloudStatus('online', '雲端就緒 (已載入)');
                    showToast('已載入雲端紀錄', 'success');
                }
            } else {
                if (records.length > 0) {
                    saveData(); 
                    showToast('已將本地紀錄同步至雲端', 'info');
                } else {
                    updateCloudStatus('online', '雲端就緒 (尚無資料)');
                }
            }
        } catch (error) {
            console.error("[CLOUD] Load failed:", error);
            updateCloudStatus('offline', '雲端載入失敗');
            showToast('無法載入雲端資料，請檢查權限或網路。', 'error');
        }
    }

    // --- Utility Functions ---
    function extractEventDate(eventName) {
        const match = eventName.match(/^(\d{4})[-\/]?(\d{1,2})/);
        if (match) {
            const year = match[1];
            const month = match[2].padStart(2, '0'); 
            return `${year}-${month}`; 
        }
        return null;
    }

    // Helper: 自動格式化與排序角色字串
    // [修改] 新增 tag 參數，用於判斷是否為寶珠模式
    function formatCharacterString(input, tag) {
        if (!input) return '';
        // 移除可能的「X抽」前綴 (如果使用者誤填，防呆用)
        let cleanInput = input.replace(/^(\d+|[\?？]+)\s*[抽].*?[:：\s]/, '');
        
        // 切割字串：支援 逗號, 頓號, 空白, 換行, 加號
        const parts = cleanInput.split(/[,，、\s\+\n]+/);
        const charList = [];

        parts.forEach(part => {
            const p = part.trim();
            if (!p) return;

            // [修正] 優化 Regex 邏輯
            const match = p.match(/^(.+?)(?:(?:[ *xX×]+)(\d+)[隻體]?|(\d+)[隻體])?$/);
            
            if (match) {
                let name = match[1].trim();
                let count = 1;

                // Group 2: 分隔符 + 數字 (*2)
                // Group 3: 數字 + 單位 (2隻)
                if (match[2]) {
                    count = parseInt(match[2], 10);
                } else if (match[3]) {
                    count = parseInt(match[3], 10);
                }

                // [新增] 寶珠標籤特殊處理
                // 如果是寶珠，且名稱本身就是純數字 (因為上面 Regex 不會吃掉純數字了)，則自動補上「顆」
                if (tag === 'orb' && /^\d+$/.test(name)) {
                    name += '顆';
                }

                // 合併重複輸入的角色
                const existing = charList.find(c => c.name === name);
                if (existing) {
                    existing.count += count;
                } else {
                    charList.push({ name, count });
                }
            }
        });

        // 排序：數量多 -> 數量少
        charList.sort((a, b) => b.count - a.count);

        // 組合字串：數量為1時不顯示 *1，用「、」分隔
        return charList.map(item => {
            return item.count > 1 ? `${item.name}*${item.count}` : item.name;
        }).join('、');
    }

    // [修改] 批次正規化所有紀錄 (傳入 tag)
    function normalizeAllRecords() {
        let hasChanges = false;
        records.forEach(record => {
            const originalNotes = record.notes || '';
            const formattedNotes = formatCharacterString(originalNotes, record.tag);
            
            if (originalNotes !== formattedNotes) {
                record.notes = formattedNotes;
                hasChanges = true;
            }
        });

        if (hasChanges) {
            saveData();
            console.log("Records have been auto-normalized.");
        }
    }

    // [修改] 檢查是否為免費或寶珠標籤，若是且未輸入抽數，則預設為 0
    function checkFreeTagDefault() {
        const tag = tagSelect.value;
        if ((tag === 'free' || tag === 'orb') && pullsInput.value === '') {
            pullsInput.value = 0;
        }
    }

    function mergeNewEvents(newEvents) {
        if (!Array.isArray(newEvents)) {
            showToast("合併失敗：輸入的活動列表格式不正確。", 'error');
            return 0;
        }
        const existingEventsSet = new Set(masterEvents.map(e => e.event));
        let newEventsAdded = 0;
        newEvents.forEach(newEvent => {
            if (newEvent.event && !existingEventsSet.has(newEvent.event)) {
                masterEvents.push(newEvent);
                existingEventsSet.add(newEvent.event); 
                newEventsAdded++;
            }
        });
        masterEvents.sort((a, b) => {
            const dateA = extractEventDate(a.event);
            const dateB = extractEventDate(b.event);
            if (dateA && dateB) return dateB.localeCompare(dateA); 
            if (dateA && !dateB) return -1;
            if (!dateA && dateB) return 1;
            return a.event.localeCompare(b.event);
        });
        updateEventFormSelect(records); 
        return newEventsAdded;
    }

    async function loadMasterEvents(sourceUrl = 'events.json') {
        try {
            const fetchUrl = sourceUrl.startsWith('http') 
                ? `${sourceUrl}?t=${new Date().getTime()}` 
                : sourceUrl;

            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (Array.isArray(data)) {
                masterEvents = data;
                updateEventFormSelect(records);
                if (sourceUrl !== 'events.json') {
                     showToast(`活動清單已成功同步！`, 'success');
                }
            } else {
                 throw new Error("載入的資料格式不正確");
            }
        } catch (error) { 
            console.warn(`無法載入活動清單 (${sourceUrl}):`, error);
        }
    }

    // --- Event Listeners ---

    syncRemoteEventsBtn.addEventListener('click', async () => {
        if (!confirm('確定要從遠端同步活動清單嗎？遠端新增的活動將與本地清單合併。')) return;
        showToast('正在同步...', 'info');
        try {
            const fetchUrl = `${REMOTE_EVENTS_URL}?t=${new Date().getTime()}`;
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`HTTP error!`);
            const newEvents = await response.json();
            const addedCount = mergeNewEvents(newEvents);
            showToast(`同步完成！新增 ${addedCount} 筆活動。`, 'success');
        } catch (error) {
            showToast('同步失敗，請檢查網路。', 'error');
        }
    });

    importEventsFileBtn.addEventListener('click', () => importEventsFileInput.click());
    importEventsFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (Array.isArray(importedData)) {
                    const addedCount = mergeNewEvents(importedData);
                    showToast(`匯入成功！新增 ${addedCount} 筆活動。`, 'success');
                } else {
                    throw new Error('格式錯誤');
                }
            } catch (err) {
                showToast(`匯入失敗：${err.message}`, 'error');
            } finally {
                importEventsFileInput.value = null; 
            }
        };
        reader.readAsText(file);
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!globalEditMode) { showToast('請先點擊右下角的 "進入編輯模式"', 'info'); return; }
        const date = dateInput.value;
        const tag = tagSelect.value;
        const pulls = parseInt(pullsInput.value, 10);
        
        // 在此處進行自動格式化與排序 (針對單筆新增/修改)
        // [修改] 傳入 tag 以進行特殊處理
        const rawNotes = notesInput.value;
        const notes = formatCharacterString(rawNotes, tag);

        let event;
        if (isAddingNewEvent || editMode) { event = eventInput.value.trim(); } else {
            event = eventSelect.value;
            if (event === '--new--') { showToast('請點擊"編輯"按鈕來輸入新活動名稱！', 'error'); return; }
        }
        let account;
        if (isAddingNewAccount) { account = accountInput.value.trim(); } else { account = accountSelect.value; }

        if (!date) { showToast('請選擇日期！', 'error'); return; }
        if (!event || event === '--new--') { showToast('請輸入或選擇有效的活動！', 'error'); return; }
        if (isAddingNewAccount && !account) { showToast('請輸入新帳號名稱！', 'error'); return; }
        if (!account || account === '--new--') { showToast('請輸入或選擇有效的帳號！', 'error'); return; }
        if (account === '--batch--') {} else if (isNaN(pulls) || pulls < 0) { showToast('請輸入有效的抽數！', 'error'); return; }

        const accountUsed = account; 
        
        if (editMode) {
            if (account === '--batch--') {
                let updatedCount = 0;
                records.forEach(r => { if (r.event === editEventName) { r.event = event; r.date = date; r.tag = tag; updatedCount++; } });
                showToast(`已批次更新 ${updatedCount} 筆紀錄！`, 'success');
            } else {
                const recordToUpdate = records.find(r => r.event === editEventName && r.account === account);
                if (recordToUpdate) {
                    recordToUpdate.event = event; recordToUpdate.date = date; recordToUpdate.tag = tag;
                    recordToUpdate.pulls = pulls; recordToUpdate.notes = notes;
                    showToast('紀錄已更新！', 'success');
                } else {
                    const newRecord = { id: Date.now(), date, event, account, pulls, notes, tag };
                    records.push(newRecord);
                    showToast('已為此帳號新增紀錄！', 'success');
                }
            }
        } else {
            const existingRecord = records.find(r => r.date === date && r.event === event && r.account === account);
            if (existingRecord) { showToast('錯誤：該筆紀錄已存在。', 'error'); handleEventSelectChange(); return; }
            const newRecord = { id: Date.now(), date, event, account, pulls, notes, tag };
            records.push(newRecord);
            showToast('紀錄已儲存！', 'success');
        }
        
        saveData();
        resetFormState();
        renderAll();

        if (!editMode && accountUsed && accountUsed !== '--batch--' && accountSelect.querySelector(`option[value="${accountUsed}"]`)) {
            showAccountSelectUI(); 
            accountSelect.value = accountUsed;
        }
    });

    function loadRecords() {
        const data = localStorage.getItem('gachaRecords');
        if (data && JSON.parse(data).length > 0) { 
            records = JSON.parse(data); 
            // [新增] 載入本地資料時，自動正規化
            normalizeAllRecords();
        } else { 
            records = sampleData; 
            saveData(); 
        }
    }

    function renderAll() {
        const selectedAccount = accountFilter.value;
        const selectedDate = dateFilter.value; // Get selected date filter
        
        // Get Selected Tags
        const selectedTags = Array.from(document.querySelectorAll('.tag-filter:checked')).map(cb => cb.value);

        let filteredRecords = records;
        
        // 1. Filter by Account
        if (selectedAccount !== 'all') {
            filteredRecords = filteredRecords.filter(record => record.account === selectedAccount);
        }
        
        // 2. Filter by Date (Year or Year-Month)
        if (selectedDate !== 'all') {
            // selectedDate format is either "YYYY" or "YYYY-MM"
            // record.date format is "YYYY-MM-DD"
            // startsWith works perfectly for both cases
            filteredRecords = filteredRecords.filter(r => r.date.startsWith(selectedDate));
        }

        // 3. Filter by Tags (Multi-select OR logic)
        // If no tags selected, show all. If tags selected, show record if its tag matches ANY selected tag.
        if (selectedTags.length > 0) {
            filteredRecords = filteredRecords.filter(r => selectedTags.includes(r.tag));
        }

        renderTable(filteredRecords, selectedAccount, selectedDate);
        calculateStats(filteredRecords, selectedAccount);
        const sortedAccounts = getSortedAccountNames();
        updateEventFormSelect(filteredRecords); 
        updateAccountFilter(sortedAccounts);
        if (!editMode) updateAccountFormSelect(sortedAccounts); 
        updateDateFilter(); // New: Update unified date filter
        updateAccountEditBtnState();
    }

    function renderTable(filteredRecords, selectedAccount, selectedDate) {
        tableBody.innerHTML = ''; 
        let title = selectedAccount === 'all' ? '歷史紀錄' : `${selectedAccount} 的歷史紀錄`;
        
        // Update Title based on unified date filter
        if (selectedDate !== 'all') {
             title += ` (${selectedDate})`;
        }
        
        historyTableTitle.innerHTML = `<i class="bi bi-table"></i> ${title}`;

        const sortedRecords = [...filteredRecords].sort((a, b) => b.date.localeCompare(a.date));
        const fragment = document.createDocumentFragment();
        sortedRecords.forEach(record => {
            const row = document.createElement('tr');
            if (record.tag && record.tag !== 'none') row.setAttribute('data-tag', record.tag);
            const cleanEventName = getCleanEventName(record.event, record.date);
            const cleanNotes = getCleanNotes(record.notes); 
            row.innerHTML = `
                <td>${record.date}</td><td>${cleanEventName}</td><td>${record.account}</td><td>${record.pulls}</td><td>${cleanNotes}</td> 
                <td class="text-nowrap">
                    <button class="btn btn-warning btn-sm me-2" data-id="${record.id}" title="編輯"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-danger btn-sm" data-id="${record.id}" title="刪除"><i class="bi bi-trash"></i></button>
                </td>`;
            fragment.appendChild(row);
        });
        tableBody.appendChild(fragment);
    }

    function calculateStats(filteredRecords, selectedAccount) {
        const totalPulls = filteredRecords.reduce((sum, record) => sum + record.pulls, 0);
        document.getElementById('total-pulls').textContent = totalPulls.toLocaleString();
        const accountStats = {};
        filteredRecords.forEach(record => { accountStats[record.account] = (accountStats[record.account] || 0) + record.pulls; });
        const accountStatsDiv = document.getElementById('account-stats');
        accountStatsDiv.innerHTML = '<h5><i class="bi bi-people-fill"></i> 各帳號總抽數</h5>';
        Object.entries(accountStats).sort(([, a], [, b]) => b - a).forEach(([acc, pulls]) => {
            accountStatsDiv.innerHTML += `<p>${acc}: <strong>${pulls.toLocaleString()}</strong> 抽</p>`;
        });
        const eventStats = {};
        filteredRecords.forEach(record => {
            if (!eventStats[record.event]) eventStats[record.event] = { pulls: record.pulls, firstDate: record.date };
            else {
                eventStats[record.event].pulls += record.pulls;
                if (record.date < eventStats[record.event].firstDate) eventStats[record.event].firstDate = record.date;
            }
        });
        const eventStatsDiv = document.getElementById('event-stats');
        eventStatsDiv.innerHTML = '<h5><i class="bi bi-calendar-event-fill"></i> 各活動總抽數</h5>';
        const scrollableContent = document.createElement('div');
        scrollableContent.id = 'event-stats-content';
        
        const sortedEvents = Object.entries(eventStats).sort(([, a], [, b]) => b.firstDate.localeCompare(a.firstDate));
        
        if (sortedEvents.length === 0) scrollableContent.innerHTML = `<p><i>尚無資料</i></p>`;
        else {
            sortedEvents.forEach(([event, data]) => {
                const year = data.firstDate.split('-')[0]; const month = parseInt(data.firstDate.split('-')[1], 10);
                const displayEventName = getCleanEventName(event, data.firstDate);
                scrollableContent.innerHTML += `<p><span class="text-muted small me-2" style="display: inline-block; width: 75px;">${year}年 ${month}月</span> ${displayEventName}: <strong>${data.pulls.toLocaleString()}</strong> 抽</p>`;
            });
        }
        eventStatsDiv.appendChild(scrollableContent);
    }

    function getSortedAccountNames() {
        const allNames = [...new Set(records.map(r => r.account))];
        const preferred = [], others = [];
        allNames.forEach(name => preferredAccountOrder.includes(name) ? preferred.push(name) : others.push(name));
        preferred.sort((a, b) => preferredAccountOrder.indexOf(a) - preferredAccountOrder.indexOf(b));
        others.sort((a, b) => a.localeCompare(b));
        return [...preferred, ...others];
    }

    // Optimization: Use RegExp instead of loop through array of strings for better performance
    function getCleanEventName(event, date) {
        let displayEventName = event;
        const year = date.substring(0, 4);
        const monthStr = date.split('-')[1];
        const monthNum = parseInt(monthStr, 10);

        // 建構動態 Regex：匹配 "YYYY-MM月", "YYYY年MM月", "YYYY/MM月" 等模式
        // 注意：這裡使用 new RegExp 是為了動態插入年份與月份
        // 模式：開頭是 (年份 + 分隔符 + 月份 + "月"?)，後面可能接空格
        const pattern = new RegExp(`^${year}[-年/]0?${monthNum}月?\\s*`);
        
        // 直接替換，比對陣列迴圈更有效率
        displayEventName = displayEventName.replace(pattern, '').trim();

        return displayEventName || event;
    }

    function getCleanNotes(notes) {
        if (typeof notes !== 'string' || !notes) return '';
        return notes.replace(/^(\d+)\s*抽\s*/, '').replace(/^(\?\?|？？)\s*抽\s*/, '').trim();
    }

    function updateEventFormSelect(recordsToUse) {
        const currentEvent = eventSelect.value;
        const userEventNames = [...new Set(recordsToUse.map(r => r.event))];
        // Note: Filter logic for event selection is complex with merged date filter. 
        // For simplicity, we show all appropriate events or filter by "Year" part of selection.
        
        const selectedDate = dateFilter.value;
        let filteredMasterEvents = masterEvents;
        
        if (selectedDate !== 'all') {
            filteredMasterEvents = masterEvents.filter(e => e.date.startsWith(selectedDate));
        }

        const masterEventNames = filteredMasterEvents.map(e => e.event);
        
        const allEventNames = [...new Set([...userEventNames, ...masterEventNames])].sort((a, b) => {
            const dateA = extractEventDate(a);
            const dateB = extractEventDate(b);
            if (dateA && dateB) return dateB.localeCompare(dateA); 
            if (dateA && !dateB) return -1;
            if (!dateA && dateB) return 1;
            return a.localeCompare(b);
        });

        eventSelect.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const newOption = document.createElement('option'); newOption.value = '--new--'; newOption.textContent = '-- 新增活動 --'; newOption.style.fontStyle = 'italic'; newOption.style.color = '#0d6efd'; fragment.appendChild(newOption);
        allEventNames.forEach(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; fragment.appendChild(option); });
        eventSelect.appendChild(fragment);
        if (allEventNames.includes(currentEvent)) eventSelect.value = currentEvent; else if (!editMode) eventSelect.value = '--new--';
    }

    function updateAccountFilter(sortedAccounts) {
        const currentFilterValue = accountFilter.value;
        accountFilter.innerHTML = '<option value="all">全部帳號</option>';
        sortedAccounts.forEach(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; accountFilter.appendChild(option); });
        accountFilter.value = currentFilterValue;
    }

    // [Modified] Unified Date Filter Function
    function updateDateFilter() {
        const currentFilterValue = dateFilter.value;
        
        // Collect all Years and Year-Months from records and masterEvents
        const dates = new Set();
        
        // 建立一個 Set 來儲存已知是「合作」的活動名稱 (僅用於判斷名稱)
        const knownCollabEvents = new Set();
        
        records.forEach(r => {
            if (r.tag === 'collab') knownCollabEvents.add(r.event);
        });
        masterEvents.forEach(e => {
            if (e.tag === 'collab') knownCollabEvents.add(e.event);
        });
        
        // 建立一個整合的活動列表 (合併官方活動與使用者自己的紀錄)
        // 這對於顯示標籤至關重要，因為使用者新增的紀錄可能不在 masterEvents 中
        const candidateEvents = [...masterEvents];
        records.forEach(r => {
            // 如果 records 裡的活動名稱在 masterEvents 找不到，就加進去候選名單
            // 我們只關心它的名稱和日期，用於下面的月份比對
            if (!candidateEvents.some(ce => ce.event === r.event)) {
                candidateEvents.push({
                    event: r.event,
                    date: r.date,
                    tag: r.tag
                });
            }
        });

        // [Modified] 強化日期解析邏輯，支援 YYYY-MM 與 YYYY-MM-DD
        const collectDates = (dateStr) => {
            if (!dateStr || typeof dateStr !== 'string') return;
            
            // 嘗試匹配 YYYY-MM 格式
            const match = dateStr.match(/^(\d{4})-(\d{2})/);
            if (match) {
                const year = match[1];
                const month = `${match[1]}-${match[2]}`; // YYYY-MM
                dates.add(year);
                dates.add(month);
            }
        };

        records.forEach(r => collectDates(r.date));
        masterEvents.forEach(e => {
            // 優先使用 date 欄位，若無則嘗試從 event 名稱解析
            let eDate = e.date;
            if (!eDate) {
                eDate = extractEventDate(e.event);
            }
            collectDates(eDate);
        });

        // Sort dates descending
        const sortedDates = [...dates].sort().reverse();
        
        // Group by Year
        const dateTree = {};
        sortedDates.forEach(d => {
            if (d.length === 4) { // Year (YYYY)
                if (!dateTree[d]) dateTree[d] = [];
            } else { // Month (YYYY-MM)
                const y = d.substring(0, 4);
                if (!dateTree[y]) dateTree[y] = [];
                dateTree[y].push(d);
            }
        });

        dateFilter.innerHTML = '<option value="all">全部日期</option>';
        
        Object.keys(dateTree).sort().reverse().forEach(year => {
            // Add Year Option
            const yearOption = document.createElement('option');
            yearOption.value = year;
            yearOption.textContent = `${year}年 (全)`;
            yearOption.style.fontWeight = 'bold';
            dateFilter.appendChild(yearOption);

            // Add Month Options
            const months = dateTree[year].sort().reverse();
            months.forEach(monthStr => {
                const monthNum = parseInt(monthStr.split('-')[1], 10);
                let displayText = `　└ ${monthNum}月`; 

                // [Modified] 顯示合作標籤邏輯優化 - 現在會檢查 candidateEvents (包含 records)
                const collabEventsInMonth = candidateEvents.filter(e => {
                    // 取得該活動的 YYYY-MM (e.date 可能是 YYYY-MM-DD 或 YYYY-MM)
                    let eDate = e.date;
                    if (!eDate) eDate = extractEventDate(e.event);
                    
                    // 只要該活動日期 (如 2025-11-15) "開頭是" 當前月份 (如 2025-11)，就算命中
                    const isSameMonth = eDate && eDate.startsWith(monthStr);
                    
                    // 條件：日期符合該月 AND (官方標記為合作 OR 使用者紀錄中標記為合作)
                    return isSameMonth && knownCollabEvents.has(e.event);
                });

                if (collabEventsInMonth.length > 0) {
                    // 取得活動名稱並去重
                    const uniqueNames = [...new Set(collabEventsInMonth.map(e => e.event))];
                    
                    // 處理名稱顯示邏輯
                    const processedNames = uniqueNames.map(name => {
                        // 1. 移除日期前綴 (例如: "2025-11月 ")
                        let clean = name.replace(/^\d{4}[-年/]\d{1,2}月?\s*/, '');
                        
                        // [使用者自訂] 截斷例外清單：這些活動名稱即使包含「×」也不會被截斷
                        // 如果您想新增其他例外，請直接將活動關鍵字加到下方的陣列中 (字串格式)
                        const truncationExceptions = [
                            "SPY×FAMILY"
                        ];

                        // 2. 處理 "×" 符號截斷 (例如: "超獸神祭×鬼滅之刃" -> "鬼滅之刃")
                        // 邏輯：必須包含 "×" 且 「不包含」任何例外清單中的文字，才會執行截斷
                        if (clean.includes('×') && !truncationExceptions.some(ex => clean.includes(ex))) {
                            // 分割後取最後一段，通常是合作名稱
                            const parts = clean.split('×');
                            if (parts.length > 1) {
                                clean = parts[parts.length - 1];
                            }
                        }
                        return clean.trim();
                    });

                    // 重新去重 (因為處理過後可能名字一樣)
                    const finalUniqueNames = [...new Set(processedNames)];
                    const eventNamesStr = finalUniqueNames.join(' / ');
                    
                    // 字數過長截斷
                    const maxLength = 25;
                    const displayName = eventNamesStr.length > maxLength ? eventNamesStr.substring(0, maxLength) + '...' : eventNamesStr;
                    
                    displayText += ` | 合作：${displayName}`;
                }

                const monthOption = document.createElement('option');
                monthOption.value = monthStr;
                monthOption.textContent = displayText;
                dateFilter.appendChild(monthOption);
            });
        });

        if ([...dateFilter.options].some(o => o.value === currentFilterValue)) {
            dateFilter.value = currentFilterValue;
        }
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
        }
        else { 
            defaultOption.value = '--new--'; 
            defaultOption.textContent = '-- 新增帳號 --'; 
            defaultOption.style.fontStyle = 'italic'; 
            defaultOption.style.color = '#0d6efd'; 
        }
        fragment.appendChild(defaultOption);
        sortedAccounts.forEach(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; fragment.appendChild(option); });
        accountSelect.appendChild(fragment);
        
        if (accountSelect.querySelector(`option[value="${currentAccount}"]`)) {
             accountSelect.value = currentAccount;
        } else if (!options.isEditMode) {
             accountSelect.value = '--new--';
        }
    }

    function updateAccountEditBtnState() {
        if (!editAccountBtn) return;
        const selectedAccount = accountSelect.value;
        if (editMode) {
            editAccountBtn.title = '編輯帳號資訊或新增記錄';
            editAccountBtn.style.display = 'block';
        } else {
            editAccountBtn.title = (selectedAccount === '--new--') ? '輸入新帳號名稱' : '切換到新增帳號輸入';
            editAccountBtn.style.display = 'block'; 
        }
    }

    tagSelect.addEventListener('change', checkFreeTagDefault); // [新增] 監聽標籤變更

    tableBody.addEventListener('click', (e) => {
        const deleteButton = e.target.closest('.btn-danger');
        const editButton = e.target.closest('.btn-warning');
        if (deleteButton) {
            const idToDelete = parseInt(deleteButton.getAttribute('data-id'), 10);
            if (confirm('確定要刪除這筆紀錄嗎？')) { records = records.filter(record => record.id !== idToDelete); saveData(); renderAll(); resetFormState(); showToast('紀錄已刪除', 'success'); }
        } else if (editButton) {
            const idToEdit = parseInt(editButton.getAttribute('data-id'), 10);
            const recordToEdit = records.find(r => r.id === idToEdit);
            if (recordToEdit) {
                if (!globalEditMode) { showToast('請先點擊右下角的 "進入編輯模式"', 'info'); return; }
                showAccountSelectUI(); eventSelect.value = recordToEdit.event; enterEditMode();
                accountSelect.value = recordToEdit.account; loadRecordForEdit(recordToEdit.account);
                window.scrollTo({ top: 0, behavior: 'smooth' }); showToast('請在上方表單編輯', 'info');
            }
        }
    });

    cancelEditBtn.addEventListener('click', (e) => { e.preventDefault(); resetFormState(); showToast('已取消編輯', 'info'); });

    function resetFormState() {
        editMode = false; editEventName = null; form.reset(); tagSelect.value = 'none'; dateInput.valueAsDate = new Date();
        submitBtnText.textContent = '儲存紀錄'; cancelEditBtn.style.display = 'none';
        togglePullFields(true); showEventSelectUI(); updateEventFormSelect(records); 
        eventSelect.value = '--new--'; isAddingNewEvent = false;
        handleEventSelectChange(); 
        showAccountSelectUI(); 
        updateAccountFormSelect(getSortedAccountNames(), { isEditMode: false });
        accountSelect.value = '--new--'; 
        accountInput.value = '';
        updateAccountEditBtnState();
    }

    function showToast(message, type = 'success') {
        toastMessage.textContent = message;
        toastMessage.style.backgroundColor = type === 'error' ? '#dc3545' : (type === 'info' ? '#0d6efd' : '#28a745');
        toastMessage.classList.add('show'); 
        setTimeout(() => toastMessage.classList.remove('show'), 3000);
    }

    function showAccountSelectUI() { 
        accountSelectGroup.style.display = 'flex'; 
        accountInputGroup.style.display = 'none'; 
        isAddingNewAccount = false; 
        updateAccountEditBtnState(); 
    }
    function showAccountInputUI() { 
        accountSelectGroup.style.display = 'none'; 
        accountInputGroup.style.display = 'block'; 
        isAddingNewAccount = true; 
        accountInput.focus({ preventScroll: true }); 
        updateAccountEditBtnState(); 
    }
    function showEventSelectUI() { eventSelect.style.display = 'block'; eventInputGroup.style.display = 'none'; isAddingNewEvent = false; }
    function showEventInputUI() { eventSelect.style.display = 'none'; eventInputGroup.style.display = 'block'; isAddingNewEvent = true; eventInput.value = ''; eventInput.focus(); }
    function togglePullFields(enabled) {
        pullsInput.disabled = !enabled; notesInput.disabled = !enabled;
        if (enabled) { pullsInput.classList.remove('field-disabled'); notesInput.classList.remove('field-disabled'); }
        else { pullsInput.classList.add('field-disabled'); notesInput.classList.add('field-disabled'); pullsInput.value = ''; notesInput.value = ''; }
    }

    clearButton.addEventListener('click', () => { if (confirm('警告：這將刪除所有儲存的抽卡紀錄！確定嗎？')) { records = []; saveData(); renderAll(); resetFormState(); showToast('所有資料已清除', 'error'); } });
    exportButton.addEventListener('click', () => {
        if (records.length === 0) { showToast('目前沒有資料可匯出', 'info'); return; }
        const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `gacha_records_${new Date().toISOString().split('T')[0]}.json`;
        a.click(); showToast('資料已匯出！', 'success');
    });
    importButton.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const jsonData = JSON.parse(event.target.result);
                if (jsonData.enableAdmin === true) {
                    document.body.classList.add('is-admin');
                    adminBadge.style.display = 'inline-block';
                    showToast('管理員模式已啟用！', 'success');
                    return; 
                }
                if (Array.isArray(jsonData)) { 
                    records = jsonData; 
                    
                    // [新增] 匯入資料時，也自動正規化
                    normalizeAllRecords();

                    saveData(); 
                    renderAll(); 
                    showToast('資料已成功載入！', 'success'); 
                } else { 
                    throw new Error('格式錯誤'); 
                }
            } catch (err) { 
                showToast('載入失敗！檔案格式錯誤。', 'error'); 
            } finally { 
                importFileInput.value = null; 
            }
        };
        reader.readAsText(file);
    });

    // Export Single Event (Admin)
    exportEventJsonButton.addEventListener('click', () => {
        const selectedEventName = eventSelect.value;
        if (!selectedEventName || selectedEventName === '--new--') {
            showToast('請先選擇一個有效的活動！', 'error');
            return;
        }
        const eventToExport = masterEvents.find(e => e.event === selectedEventName);
        const dateValue = dateInput.value;
        const tagValue = tagSelect.value;
        const exportData = {
            event: selectedEventName,
            date: eventToExport ? eventToExport.date : dateValue, 
            tag: eventToExport ? eventToExport.tag : (tagValue !== 'none' ? tagValue : '') 
        };
        const blob = new Blob([JSON.stringify([exportData], null, 2)], { type: 'application/json' });
        const eventShortName = selectedEventName.substring(0, 20).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
        const fileName = `event_${eventShortName}_template.json`;
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName;
        a.click();
        showToast(`已匯出活動模板：${selectedEventName}`, 'info');
    });

    // New: Export All Events (Admin)
    exportAllEventsBtn.addEventListener('click', () => {
        if (!masterEvents || masterEvents.length === 0) {
            showToast('目前沒有活動資料可匯出！', 'error');
            return;
        }
        
        // [修改] 智慧補全標籤：建立一個新的清單，嘗試從 records 中補回缺失的 tag
        const enrichedEvents = masterEvents.map(evt => {
            let newEvt = { ...evt }; // 複製物件，避免汙染原始資料
            
            // 如果活動清單中沒有標籤，嘗試去紀錄裡找找看
            if (!newEvt.tag) {
                const record = records.find(r => r.event === newEvt.event && r.tag);
                if (record) newEvt.tag = record.tag;
            }
            
            // 如果活動清單中沒有日期（雖然少見），也嘗試去紀錄裡找
            if (!newEvt.date) {
                const record = records.find(r => r.event === newEvt.event && r.date);
                if (record) newEvt.date = record.date;
            }
            return newEvt;
        });
        
        const blob = new Blob([JSON.stringify(enrichedEvents, null, 2)], { type: 'application/json' });
        const fileName = `events_list_${new Date().toISOString().split('T')[0]}.json`;
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName;
        a.click();
        showToast(`已匯出並補全完整活動清單！(共 ${enrichedEvents.length} 筆)`, 'success');
    });

    function enterAddMode() {
        editMode = false; submitBtnText.textContent = '儲存紀錄'; cancelEditBtn.style.display = 'inline-block'; editEventBtn.style.display = 'none';
        showEventInputUI(); eventInput.value = ''; dateInput.valueAsDate = new Date(); tagSelect.value = 'none'; togglePullFields(true); pullsInput.value = ''; notesInput.value = '';
        showAccountSelectUI(); updateAccountFormSelect(getSortedAccountNames(), { isEditMode: false }); accountSelect.value = '--new--'; showToast('請輸入新活動資訊', 'info');
        updateAccountEditBtnState(); 
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
        }
    }
    
    function enterEditMode() {
        const eventName = eventSelect.value; if (eventName === '--new--' || !eventName) { enterAddMode(); return; }
        editMode = true; editEventName = eventName; submitBtnText.textContent = '更新紀錄'; cancelEditBtn.style.display = 'inline-block'; editEventBtn.style.display = 'none';
        showEventInputUI(); eventInput.value = eventName; updateAccountFormSelect(getSortedAccountNames(), { isEditMode: true });
        accountSelect.value = '--batch--'; loadRecordForEdit('--batch--'); showToast('進入編輯模式', 'info');
        updateAccountEditBtnState(); 
    }
    function loadRecordForEdit(accountName) {
        if (!editMode) return;
        let recordToLoad = null;
        if (accountName === '--batch--') {
            togglePullFields(false);
            recordToLoad = records.find(r => r.event === editEventName) || masterEvents.find(e => e.event === editEventName);
        } else {
            togglePullFields(true);
            recordToLoad = records.find(r => r.event === editEventName && r.account === accountName) || masterEvents.find(e => e.event === editEventName);
        }

        if (recordToLoad) { 
            dateInput.value = recordToLoad.date || ''; 
            tagSelect.value = recordToLoad.tag || 'none'; 
            if (accountName !== '--batch--') { 
                // [修改] 修正 0 抽被視為空值的問題
                // 原本: pullsInput.value = recordToLoad.pulls || '';
                // 修正後: 嚴格檢查 undefined 與 null，確保數字 0 能被保留
                pullsInput.value = (recordToLoad.pulls !== undefined && recordToLoad.pulls !== null) ? recordToLoad.pulls : '';
                notesInput.value = recordToLoad.notes || ''; 
            } 
        }
        else { pullsInput.value = ''; notesInput.value = ''; }
    }

    modeToggleBtn.addEventListener('click', () => {
        globalEditMode = !globalEditMode;
        document.body.classList.toggle('edit-mode-active', globalEditMode);
        gachaFieldset.disabled = !globalEditMode;
        modeToggleBtn.classList.toggle('btn-outline-secondary', !globalEditMode); // 修正：使用 btn-outline-secondary
        modeToggleBtn.classList.toggle('btn-primary', globalEditMode);
        modeToggleBtn.innerHTML = globalEditMode ? '<i class="bi bi-check-circle"></i> 完成編輯' : '<i class="bi bi-eye"></i> 檢視模式 (點此編輯)';
        resetFormState(); showToast(globalEditMode ? '已進入編輯模式' : '已退出編輯模式', 'info');
    });

    accountFilter.addEventListener('change', renderAll);
    // [New] Add Listeners for Date and Tag filters
    dateFilter.addEventListener('change', renderAll);
    document.querySelectorAll('.tag-filter').forEach(checkbox => {
        checkbox.addEventListener('change', renderAll);
    });
    
    function handleEventSelectChange() {
        const selectedEventName = eventSelect.value;
        
        // 修正：總是顯示編輯按鈕，讓使用者可以隨時切換到輸入模式修改活動名稱
        editEventBtn.style.display = 'block'; 
        
        if (selectedEventName !== '--new--') { 
            const m = masterEvents.find(e => e.event === selectedEventName); 
            
            // [修改] 優先使用 masterEvents 的資料，若無 tag 則嘗試從 records 找
            let dateToUse = m ? m.date : '';
            let tagToUse = m ? m.tag : '';

            // 如果官方清單沒標籤，嘗試去歷史紀錄找找看
            if (!tagToUse) {
                const recordWithTag = records.find(r => r.event === selectedEventName && r.tag);
                if (recordWithTag) tagToUse = recordWithTag.tag;
            }
            
            // 填入表單
            if (dateToUse) dateInput.value = dateToUse;
            if (tagToUse) {
                tagSelect.value = tagToUse;
                // [新增] 連動變更活動時，也要檢查是否需預設 0 抽
                checkFreeTagDefault(); 
            }
        }
    }
    
    eventSelect.addEventListener('change', handleEventSelectChange);
    editEventBtn.addEventListener('click', () => eventSelect.value === '--new--' ? enterAddMode() : enterEditMode());
    cancelNewEvent.addEventListener('click', resetFormState);
    
    // 修正：移除 accountSelect 的 change 事件，改由新按鈕處理，並在 select 改變時更新按鈕狀態
    accountSelect.addEventListener('change', () => {
        updateAccountEditBtnState();
    });
    
    // 新增：處理帳號編輯按鈕的點擊事件
    editAccountBtn.addEventListener('click', enterAccountEditMode);
    
    cancelNewAccount.addEventListener('click', () => { 
        showAccountSelectUI(); 
        
        // 修正：取消時根據模式回復正確的選項
        if (editMode) {
             accountSelect.value = '--batch--';
        } else {
             accountSelect.value = '--new--'; 
        }
    });

    async function init() { 
        await loadMasterEvents(); 
        loadRecords(); 
        renderAll(); 
        resetFormState(); 
        gachaFieldset.disabled = true; 
        
        // 修正：確保在初次載入時，模式切換按鈕的文字正確
        modeToggleBtn.classList.add('btn-outline-secondary');
        modeToggleBtn.innerHTML = '<i class="bi bi-eye"></i> 檢視模式 (點此編輯)';

        updateAccountEditBtnState(); // 初始化帳號編輯按鈕狀態
    }
    init();
});