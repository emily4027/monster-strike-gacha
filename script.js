// --- 變數定義 ---
const form = document.getElementById('gacha-form');
const tableBody = document.getElementById('history-table-body');
const toastMessage = document.getElementById('toast-message');
const tagSelect = document.getElementById('tag-select'); 

// --- Event 欄位變數 ---
const eventSelect = document.getElementById('event-select');
const eventInputGroup = document.getElementById('event-input-group');
const eventInput = document.getElementById('event-input');
const cancelNewEvent = document.getElementById('cancel-new-event');

// --- 帳號欄位的新變數 ---
const accountSelect = document.getElementById('account-select');
const accountInputGroup = document.getElementById('account-input-group');
const accountInput = document.getElementById('account-input');
const cancelNewAccount = document.getElementById('cancel-new-account');

// --- 欄位 ---
const dateInput = document.getElementById('date'); // (新) 日期欄位
const pullsInput = document.getElementById('pulls');
const notesInput = document.getElementById('notes');

const submitBtnText = document.getElementById('submit-btn-text');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
// ... (中略) ...
const importFileInput = document.getElementById('import-file-input');

// 應用程式的核心資料庫 (一個存放所有紀錄的陣列)
let records = [];
// 追蹤是否處於編輯模式
let editMode = false;
let editId = null;
// 追蹤是否正在新增帳號/活動
let isAddingNewAccount = false;
let isAddingNewEvent = false; 
// 定義帳號優先順序
const preferredAccountOrder = ['羽入', '梨花', '沙都子'];

// --- 範例資料 ---
// ... (不變) ...

// --- 核心功能 ---

/**
 * 1. 處理表單提交 (新增 或 更新)
 */
form.addEventListener('submit', (e) => {
    e.preventDefault(); 
    const date = dateInput.value;
    
    // --- 根據狀態獲取活動名稱 ---
    let event;
    if (isAddingNewEvent) {
        event = eventInput.value.trim();
    } else {
        event = eventSelect.value;
    }

    // --- 根據狀態獲取帳號名稱 ---
    let account;
    if (isAddingNewAccount) {
        account = accountInput.value.trim();
    } else {
        account = accountSelect.value;
    }
    
    const pulls = parseInt(pullsInput.value, 10);
    const notes = notesInput.value;
    const tag = tagSelect.value; 

    // --- 驗證 ---
    if (!date) {
        showToast('請選擇日期！', 'error');
        return;
    }
    if (!event || event === '--new--') {
        showToast('請輸入或選擇有效的活動！', 'error');
        return;
    }
     if (!account || account === '--new--') { 
        showToast('請輸入或選擇有效的帳號！', 'error');
        return;
    }
    if (isNaN(pulls) || pulls < 0) {
        showToast('請輸入有效的抽數！', 'error');
        return;
    }

    if (editMode && editId !== null) {
        // --- 一般更新 (UPDATE) 邏輯 ---
        const recordToUpdate = records.find(r => r.id === editId);
        if (recordToUpdate) {
            recordToUpdate.date = date;
            recordToUpdate.event = event;
            recordToUpdate.account = account;
            recordToUpdate.pulls = pulls;
            recordToUpdate.notes = notes;
            recordToUpdate.tag = tag;
        }
        showToast('紀錄已更新！', 'success');

    } else {
        // --- 新增 (CREATE) 邏輯 ---
        // (新) 再次檢查是否存在 (避免重複提交)
        const existingRecord = records.find(r => 
            r.date === date && r.event === event && r.account === account
        );
        if (existingRecord) {
            showToast('錯誤：該筆紀錄已存在。', 'error');
            return;
        }

        const newRecord = {
            id: Date.now(), 
            date, event, account, pulls, notes, tag 
        };
        records.push(newRecord);
        showToast('紀錄已儲存！', 'success');
    }

    saveRecords();
    resetFormState(); // 重置表單
    renderAll(); // 刷新所有畫面
});

// ... (saveRecords, loadRecords 不變) ...

/**
 * 4. 重新整理所有畫面
 */
function renderAll() {
    // ... (篩選邏輯不變) ...
    const selectedAccount = accountFilter.value;
    const selectedYear = yearFilter.value;
    const selectedMonth = monthFilter.value;

    let filteredRecords = records;
    
    // 1. 篩選帳號
    if (selectedAccount !== 'all') {
        filteredRecords = filteredRecords.filter(record => record.account === selectedAccount);
    }
    
    // 2. 篩選日期
    let dateFilterPrefix = '';
    if (selectedYear !== 'all') {
        dateFilterPrefix = selectedYear;
        if (selectedMonth !== 'all') {
            dateFilterPrefix += '-' + selectedMonth; // e.g., "2023-07"
        }
    }
    
    if (dateFilterPrefix !== '') {
        filteredRecords = filteredRecords.filter(r => r.date.startsWith(dateFilterPrefix));
    }
    
    renderTable(filteredRecords, selectedAccount, selectedYear, selectedMonth);
    calculateStats(filteredRecords, selectedAccount);
    
    // 這幾個永遠用全部資料
    const sortedAccounts = getSortedAccountNames();
    updateEventFormSelect(); 
    updateAccountFilter(sortedAccounts);
    updateAccountFormSelect(sortedAccounts);
    
    updateYearFilter();
    updateMonthFilter(); 
}

// ... (renderTable, calculateStats, getSortedAccountNames, getCleanEventName, updateEventFormSelect, updateAccountFilter, updateYearFilter, updateMonthFilter 不變) ...


/**
 * 10c. 更新 "表單" 中的 "帳號" 下拉選單
 */
function updateAccountFormSelect(sortedAccounts) {
    const currentAccount = accountSelect.value; 
    accountSelect.innerHTML = ''; // 清空
    
    // (新) 新增帳號選項放最上面
    const newOption = document.createElement('option');
    newOption.value = '--new--';
    newOption.textContent = '-- 新增帳號 --';
    newOption.style.fontStyle = 'italic';
    newOption.style.color = '#0d6efd';
    accountSelect.appendChild(newOption);

    // (移除 "全部帳號 (僅編輯)" 選項)
    
    sortedAccounts.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        accountSelect.appendChild(option);
    });

    // 嘗試還原
    if (accountSelect.querySelector(`option[value="${currentAccount}"]`)) {
        accountSelect.value = currentAccount;
    }
}


/**
 * 11. 處理表格中的按鈕點擊 (編輯 或 刪除)
 */
tableBody.addEventListener('click', (e) => {
    const deleteButton = e.target.closest('.btn-danger');
    const editButton = e.target.closest('.btn-warning');

    if (deleteButton) {
        // ... (刪除邏輯不變) ...
        const idToDelete = parseInt(deleteButton.getAttribute('data-id'), 10);
        if (confirm('確定要刪除這筆紀錄嗎？')) {
            records = records.filter(record => record.id !== idToDelete);
            saveRecords();
            renderAll(); 
            resetFormState(); // (新) 重置表單，萬一剛好正在編輯被刪除的項目
            showToast('紀錄已刪除', 'success');
        }
    } else if (editButton) {
        // --- 點擊表格 "編輯" 按鈕 ---
        // (新) 邏輯大幅簡化：
        // 只需將該筆紀錄的資料載入表單即可
        // checkAndLoadRecord 會自動處理後續
        const idToEdit = parseInt(editButton.getAttribute('data-id'), 10);
        const recordToEdit = records.find(r => r.id === idToEdit);

        if (recordToEdit) {
            // 1. 確保 UI 是下拉選單
            showEventSelectUI();
            showAccountSelectUI();

            // 2. 設定表單的值
            dateInput.value = recordToEdit.date;
            eventSelect.value = recordToEdit.event;
            accountSelect.value = recordToEdit.account; 
            
            // 3. (新) 手動觸發 checkAndLoadRecord
            //    它會自動載入 pulls, notes, tag 並切換模式
            checkAndLoadRecord(); 

            // 4. 捲動到最上方
            window.scrollTo({ top: 0, behavior: 'smooth' });
            showToast('請在上方表單編輯', 'info');
        }
    }
});

/**
 * 12. 處理 "取消編輯" 按鈕
 */
cancelEditBtn.addEventListener('click', (e) => {
    e.preventDefault();
    resetFormState();
    showToast('已取消編輯', 'info');
});

/**
 * 13. 重置表單狀態 (回到 "新增" 模式)
 */
function resetFormState() {
    editMode = false;
    editId = null;
    form.reset();
    tagSelect.value = 'none'; 
    dateInput.valueAsDate = new Date(); 
    submitBtnText.textContent = '儲存紀錄';
    cancelEditBtn.style.display = 'none';

    // 重置活動欄位
    showEventSelectUI();
    if (eventSelect.options.length > 0) {
         eventSelect.value = eventSelect.options[0].value; // 選回 "-- 新增活動 --"
    }

    // 重置帳號欄位
    showAccountSelectUI();
    updateAccountFormSelect(getSortedAccountNames()); // 重建選單 (移除批次編輯)
    if ([...accountSelect.options].some(opt => opt.value === preferredAccountOrder[0])) {
        accountSelect.value = preferredAccountOrder[0];
    } else if (accountSelect.options.length > 1) { // [0] 是 "新增"
        accountSelect.value = accountSelect.options[1].value;
    }
    
    // (新) 重置時也檢查一次
    checkAndLoadRecord();
}

/**
 * 14. 顯示提示訊息
 */
// ... (不變) ...

// --- (新) 欄位 UI 切換輔助函式 ---
// ... (showAccountSelectUI, showAccountInputUI, showEventSelectUI, showEventInputUI 不變) ...

/**
 * (新) 移除 toggleBulkEditFields 函式 (因為批次編輯已移除)
 */


// --- 15. 資料管理功能 ---
// ... (不變) ...


// --- (新) 核心邏輯：檢查紀錄是否存在並自動載入 ---
function checkAndLoadRecord() {
    // 只有在非 "新增" 模式時才檢查
    if (isAddingNewEvent || isAddingNewAccount) {
        // 如果正在輸入新帳號/活動，強制切換到 "儲存" 模式
        setFormMode('new');
        return;
    }

    const date = dateInput.value;
    const event = eventSelect.value;
    const account = accountSelect.value;

    // 如果 "帳號" 或 "活動" 是 "--new--" (雖然 UI 應該避免了，但多一層保險)
    if (account === '--new--' || event === '--new--') {
        setFormMode('new');
        return;
    }

    // 尋找完全符合的紀錄
    const existingRecord = records.find(r => 
        r.date === date && r.event === event && r.account === account
    );

    if (existingRecord) {
        // --- 找到了：切換到編輯模式 ---
        pullsInput.value = existingRecord.pulls;
        notesInput.value = existingRecord.notes;
        tagSelect.value = existingRecord.tag || 'none';
        
        editId = existingRecord.id;
        setFormMode('edit');
    } else {
        // --- 沒找到：切換到新增模式 ---
        editId = null;
        setFormMode('new');
    }
}

/**
 * (新) 輔助函式：切換表單模式 (新增/編輯)
 */
function setFormMode(mode) {
    if (mode === 'edit') {
        editMode = true;
        submitBtnText.textContent = '更新紀錄';
        cancelEditBtn.style.display = 'inline-block';
    } else {
        // 'new'
        editMode = false;
        editId = null;
        // 清空特定欄位
        pullsInput.value = '';
        notesInput.value = '';
        tagSelect.value = 'none';

        submitBtnText.textContent = '儲存紀錄';
        cancelEditBtn.style.display = 'none';
    }
}


// --- 程式初始化 ---

// 監聽篩選器變化
accountFilter.addEventListener('change', renderAll);
yearFilter.addEventListener('change', handleYearChange);
monthFilter.addEventListener('change', renderAll);

// (新) 監聽表單主欄位的變化
dateInput.addEventListener('change', checkAndLoadRecord);
eventSelect.addEventListener('change', handleEventSelectChange);
accountSelect.addEventListener('change', handleAccountSelectChange);

// (新) 監聽 "活動" 下拉選單變化
function handleEventSelectChange() {
    if (eventSelect.value === '--new--') {
        showEventInputUI();
        setFormMode('new'); // 進入新增模式
    } else {
        checkAndLoadRecord(); // 檢查是否存在
    }
}

// (新) 監聽 "取消新增活動" 按鈕
cancelNewEvent.addEventListener('click', () => {
    showEventSelectUI();
    if (eventSelect.options.length > 0) {
        eventSelect.value = eventSelect.options[0].value; // 選回 "-- 新增活動 --"
    }
    checkAndLoadRecord(); // 檢查
});

// (新) 監聽 "帳號" 下拉選單變化
function handleAccountSelectChange() {
    if (accountSelect.value === '--new--') {
        showAccountInputUI();
        setFormMode('new'); // 進入新增模式
    } else {
        checkAndLoadRecord(); // 檢查是否存在
    }
}

// (新) 監聽 "取消新增帳號" 按鈕
cancelNewAccount.addEventListener('click', () => {
    showAccountSelectUI();
    // 重置下拉選單的值
    const firstAccount = preferredAccountOrder[0];
    if ([...accountSelect.options].some(opt => opt.value === firstAccount)) {
        accountSelect.value = firstAccount;
    } else if (accountSelect.options.length > 1) { // [0] 是 "新增"
        accountSelect.value = accountSelect.options[1].value;
    }
    checkAndLoadRecord(); // 檢查
});

// 處理年份變更的函式
function handleYearChange() {
    updateMonthFilter();
    renderAll();
}

loadRecords(); 
renderAll();   
resetFormState(); // (新) 用 resetFormState 初始化，確保載入正確日期並觸發檢查