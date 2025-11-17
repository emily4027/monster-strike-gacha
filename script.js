// --- 變數定義 ---
const form = document.getElementById('gacha-form');
const tableBody = document.getElementById('history-table-body');
const toastMessage = document.getElementById('toast-message');
const eventDatalist = document.getElementById('event-datalist');

// --- 帳號欄位的新變數 ---
const accountSelect = document.getElementById('account-select');
const accountInputGroup = document.getElementById('account-input-group');
const accountInput = document.getElementById('account-input');
const cancelNewAccount = document.getElementById('cancel-new-account');

const submitBtnText = document.getElementById('submit-btn-text');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

const accountFilter = document.getElementById('account-filter');
// (新) 日期篩選器
const yearFilter = document.getElementById('year-filter');
const monthFilter = document.getElementById('month-filter');

const historyTableTitle = document.getElementById('history-table-title');

// 資料管理按鈕
const clearButton = document.getElementById('clear-data');
const exportButton = document.getElementById('export-data');
const importButton = document.getElementById('import-data');
const importFileInput = document.getElementById('import-file-input');

// 應用程式的核心資料庫 (一個存放所有紀錄的陣列)
let records = [];
// 追蹤是否處於編輯模式
let editMode = false;
let editId = null;
// 追蹤是否正在新增帳號
let isAddingNewAccount = false;
// 定義帳號優先順序
const preferredAccountOrder = ['羽入', '梨花', '沙都子'];

// --- 範例資料 ---
const sampleData = [
    { id: 1700000000001, date: '2025-05-15', event: '孤獨搖滾', account: '羽入', pulls: 90, notes: '虹夏*3 麒麟兒*2 久遠 摩奇亞' },
    { id: 1700000000002, date: '2025-05-15', event: '孤獨搖滾', account: '梨花', pulls: 90, notes: '虹夏 山田 奈特 喜多' },
    { id: 1700000000003, date: '2025-05-15', event: '孤獨搖滾', account: '沙都子', pulls: 70, notes: '虹夏*3 山田*3 摩奇亞 艾兒' },
    { id: 1700000000004, date: '2025-05-01', event: '柯南第二彈', account: '羽入', pulls: 100, notes: '安室透*2 新一*2 基德' },
    { id: 1700000000005, date: '2025-05-01', event: '柯南第二彈', account: '梨花', pulls: 100, notes: '安室透*3 基德*2 柯南 新一' },
    { id: 1700000000006, date: '2025-05-01', event: '柯南第二彈', account: '沙都子', pulls: 100, notes: '柯南 赤井 新一*4' },
    { id: 1700000000007, date: '2025-04-20', event: '2.5次元', account: '羽入', pulls: 20, notes: '諾諾亞*2' },
    { id: 1700000000008, date: '2025-04-20', event: '2.5次元', account: '梨花', pulls: 20, notes: '利利艾路*2  美莉艾拉' },
    { id: 1700000000009, date: '2025-04-20', event: '2.5次元', account: '沙都子', pulls: 40, notes: '' },
];

// --- 核心功能 ---

/**
 * 1. 處理表單提交 (新增 或 更新)
 */
form.addEventListener('submit', (e) => {
    e.preventDefault(); 
    const date = document.getElementById('date').value;
    const event = document.getElementById('event').value.trim(); // 去除前後空白
    
    // --- (新) 根據狀態獲取帳號名稱 ---
    let account;
    if (isAddingNewAccount) {
        account = accountInput.value.trim(); // 從輸入框獲取
    } else {
        account = accountSelect.value; // 從下拉選單獲取
    }
    
    const pulls = parseInt(document.getElementById('pulls').value, 10);
    const notes = document.getElementById('notes').value;

    if (!date) {
        showToast('請選擇日期！', 'error');
        return;
    }
    if (!event) {
        showToast('請輸入活動名稱！', 'error');
        return;
    }
     if (!account || account === '--new--') { // 驗證 !account (空字串) 或 "--new--"
        showToast('請輸入或選擇有效的帳號！', 'error');
        return;
    }
    if (isNaN(pulls) || pulls < 0) {
        showToast('請輸入有效的抽數！', 'error');
        return;
    }

    if (editMode) {
        // --- 更新 (UPDATE) 邏輯 ---
        const recordToUpdate = records.find(r => r.id === editId);
        if (recordToUpdate) {
            recordToUpdate.date = date;
            recordToUpdate.event = event;
            recordToUpdate.account = account;
            recordToUpdate.pulls = pulls;
            recordToUpdate.notes = notes;
        }
        showToast('紀錄已更新！', 'success');

    } else {
        // --- 新增 (CREATE) 邏輯 ---
        const newRecord = {
            id: Date.now(), 
            date, event, account, pulls, notes
        };
        records.push(newRecord);
        showToast('紀錄已儲存！', 'success');
    }

    saveRecords();
    resetFormState(); 
    renderAll();
});

/**
 * 2. 將資料儲存到瀏覽器的 localStorage
 */
function saveRecords() {
    localStorage.setItem('gachaRecords', JSON.stringify(records));
}

/**
 * 3. 從 localStorage 載入資料
 */
function loadRecords() {
    const data = localStorage.getItem('gachaRecords');
    if (data && JSON.parse(data).length > 0) { // 確保載入的不是空陣列
        records = JSON.parse(data);
    } else {
        records = sampleData;
        saveRecords(); 
    }
}

/**
 * 4. 重新整理所有畫面
 */
function renderAll() {
    const selectedAccount = accountFilter.value;
    // (新) 讀取日期篩選器的值
    const selectedYear = yearFilter.value;
    const selectedMonth = monthFilter.value;

    let filteredRecords = records;
    
    // 1. 篩選帳號
    if (selectedAccount !== 'all') {
        filteredRecords = filteredRecords.filter(record => record.account === selectedAccount);
    }
    
    // 2. (新) 篩選日期
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
    
    // (新) 傳入篩選條件以更新標題
    renderTable(filteredRecords, selectedAccount, selectedYear, selectedMonth);
    calculateStats(filteredRecords, selectedAccount);
    
    // 這幾個永遠用全部資料
    const sortedAccounts = getSortedAccountNames();
    updateEventDatalist(); 
    updateAccountFilter(sortedAccounts);
    updateAccountFormSelect(sortedAccounts);
    
    // (新) 更新日期篩選器
    updateYearFilter();
    updateMonthFilter(); // 確保在載入時也更新月份的狀態
}

/**
 * 5. 渲染歷史紀錄表格
 */
function renderTable(filteredRecords, selectedAccount, selectedYear, selectedMonth) {
    tableBody.innerHTML = ''; // 清空表格
    
    // (新) 產生動態標題
    let title = '3. ';
    if (selectedAccount === 'all') {
        title += '歷史紀錄 (Tidy Data)';
    } else {
        title += `${selectedAccount} 的歷史紀錄`;
    }
    
    // (新) 加上日期標題
    let dateTitle = '';
    if (selectedYear !== 'all') {
        dateTitle = selectedYear;
        if (selectedMonth !== 'all') {
            dateTitle += `-${selectedMonth}`;
        }
    }
    
    if (dateTitle) {
        historyTableTitle.innerHTML = `<i class="bi bi-table"></i> ${title} <span class="text-muted small">(${dateTitle})</span>`;
    } else {
        historyTableTitle.innerHTML = `<i class="bi bi-table"></i> ${title}`;
    }

    // 依照日期排序 (由舊到新)
    const sortedRecords = [...filteredRecords].sort((a, b) => a.date.localeCompare(b.date)); 

    sortedRecords.forEach(record => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.date}</td>
            <td>${record.event}</td>
            <td>${record.account}</td>
            <td>${record.pulls}</td>
            <td>${record.notes}</td>
            <td class="text-nowrap">
                <button class="btn btn-warning btn-sm me-2" data-id="${record.id}" title="編輯"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-danger btn-sm" data-id="${record.id}" title="刪除"><i class="bi bi-trash"></i></button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

/**
 * 6. 計算並顯示統計資料
 */
function calculateStats(filteredRecords, selectedAccount) {
    // 總抽數
    const totalPulls = filteredRecords.reduce((sum, record) => sum + record.pulls, 0);
    document.getElementById('total-pulls').textContent = totalPulls.toLocaleString();
    const totalPullsTitle = document.getElementById('total-pulls-title');
    totalPullsTitle.innerHTML = `<i class="bi bi-gem"></i> ${selectedAccount === 'all' ? '總投入抽數' : `${selectedAccount} 總抽數`}`;

    // 各帳號統計
    const accountStats = {}; 
    filteredRecords.forEach(record => {
        accountStats[record.account] = (accountStats[record.account] || 0) + record.pulls;
    });
    
    const accountStatsDiv = document.getElementById('account-stats');
    accountStatsDiv.innerHTML = '<h5><i class="bi bi-people-fill"></i> 各帳號總抽數</h5>'; 
    // 排序：依照抽數 (由多到少)
    const sortedAccounts = Object.entries(accountStats).sort(([,a],[,b]) => b-a);
    for (const [account, pulls] of sortedAccounts) {
        accountStatsDiv.innerHTML += `<p>${account}: <strong>${pulls.toLocaleString()}</strong> 抽</p>`;
    }

    // 各活動統計
    const eventStats = {}; 
    filteredRecords.forEach(record => {
        if (!eventStats[record.event]) {
            eventStats[record.event] = { pulls: record.pulls, firstDate: record.date };
        } else {
            eventStats[record.event].pulls += record.pulls;
            if (record.date < eventStats[record.event].firstDate) {
                eventStats[record.event].firstDate = record.date;
            }
        }
    });

    const eventStatsDiv = document.getElementById('event-stats');
    eventStatsDiv.innerHTML = '<h5><i class="bi bi-calendar-event-fill"></i> 各活動總抽數</h5>';
    
    const scrollableContent = document.createElement('div');
    scrollableContent.id = 'event-stats-content';

    // 排序：依照 firstDate (由舊到新)
    const sortedEvents = Object.entries(eventStats).sort(([,a], [,b]) => a.firstDate.localeCompare(b.firstDate));
    
    if (sortedEvents.length === 0) {
        scrollableContent.innerHTML = `<p><i>尚無資料</i></p>`;
    } else {
        for (const [event, data] of sortedEvents) {
            const month = parseInt(data.firstDate.split('-')[1], 10);
            scrollableContent.innerHTML += `<p><span class="text-muted small me-2" style="display: inline-block; width: 30px;">${month}月</span> ${event}: <strong>${data.pulls.toLocaleString()}</strong> 抽</p>`;
        }
    }
    eventStatsDiv.appendChild(scrollableContent);
}

/**
 * 7. (新) 取得排序後的帳號列表
 */
function getSortedAccountNames() {
    const allNames = [...new Set(records.map(r => r.account))];
    const preferred = [];
    const others = [];

    allNames.forEach(name => {
        if (preferredAccountOrder.includes(name)) {
            preferred.push(name);
        } else {
            others.push(name);
        }
    });

    // 1. 依照 preferredAccountOrder 排序 preferred 陣列
    preferred.sort((a, b) => preferredAccountOrder.indexOf(a) - preferredAccountOrder.indexOf(b));
    // 2. 依照字母排序 others 陣列
    others.sort((a, b) => a.localeCompare(b));

    // 3. 合併
    return [...preferred, ...others];
}

/**
 * 8. 更新活動名稱的 datalist (自動完成)
 */
function updateEventDatalist() {
    eventDatalist.innerHTML = '';
    const eventNames = [...new Set(records.map(r => r.event))];
    eventNames.forEach(name => {
        eventDatalist.innerHTML += `<option value="${name}"></option>`;
    });
}

/**
 * 9. 更新帳號篩選器的選項
 */
function updateAccountFilter(sortedAccounts) {
    const currentFilterValue = accountFilter.value; 
    accountFilter.innerHTML = '<option value="all">全部帳號</option>'; 
    
    sortedAccounts.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        accountFilter.appendChild(option);
    });
    
    // 嘗試還原之前的選項
    accountFilter.value = currentFilterValue;
}

/**
 * (新) 10a. 更新年份篩選器
 */
function updateYearFilter() {
    const currentYear = yearFilter.value;
    
    // 從所有紀錄中取得不重複的年份
    const years = [...new Set(records.map(r => r.date.substring(0, 4)))]
                    .sort((a, b) => b.localeCompare(a)); // 降冪排序 (e.g., 2025, 2024, 2023)
    
    yearFilter.innerHTML = '<option value="all">全部年份</option>'; // 重置
    
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    });
    
    // 嘗試還原選項
    yearFilter.value = currentYear;
}

/**
 * (新) 10b. 更新月份篩選器
 */
function updateMonthFilter() {
    const selectedYear = yearFilter.value;
    const currentMonth = monthFilter.value;
    
    if (selectedYear === 'all') {
        // 如果沒選年份，禁用月份
        monthFilter.disabled = true;
        monthFilter.innerHTML = '<option value="all">全部月份</option>';
    } else {
        // 如果選了年份，啟用月份
        monthFilter.disabled = false;
        monthFilter.innerHTML = `<option value="all">全部月份 (${selectedYear})</option>`;
        for (let i = 1; i <= 12; i++) {
            const month = i.toString().padStart(2, '0'); // 轉成 "01", "02" ...
            const option = document.createElement('option');
            option.value = month;
            option.textContent = `${i}月`;
            monthFilter.appendChild(option);
        }
        // 嘗試還原選項
        monthFilter.value = currentMonth;
    }
}


/**
 * 10. (新) 更新 "表單" 中的 "帳號" 下拉選單
 */
function updateAccountFormSelect(sortedAccounts) {
    const currentAccount = accountSelect.value; // 保存目前選中的值
    accountSelect.innerHTML = ''; // 清空
    
    sortedAccounts.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        accountSelect.appendChild(option);
    });
    
    // 新增 "新增帳號" 選項
    const newOption = document.createElement('option');
    newOption.value = '--new--';
    newOption.textContent = '-- 新增帳號 --';
    newOption.style.fontStyle = 'italic';
    newOption.style.color = '#0d6efd';
    accountSelect.appendChild(newOption);

    // Try to restore
    if (sortedAccounts.includes(currentAccount)) {
        accountSelect.value = currentAccount;
    } else if (sortedAccounts.length > 0) {
         accountSelect.value = sortedAccounts[0]; // 預設選第一個
    }
}


/**
 * 11. 處理表格中的按鈕點擊 (編輯 或 刪除)
 */
tableBody.addEventListener('click', (e) => {
    const deleteButton = e.target.closest('.btn-danger');
    const editButton = e.target.closest('.btn-warning');

    if (deleteButton) {
        const idToDelete = parseInt(deleteButton.getAttribute('data-id'), 10);
        if (confirm('確定要刪除這筆紀錄嗎？')) {
            records = records.filter(record => record.id !== idToDelete);
            saveRecords();
            renderAll(); 
            showToast('紀錄已刪除', 'success');
        }
    } else if (editButton) {
        const idToEdit = parseInt(editButton.getAttribute('data-id'), 10);
        const recordToEdit = records.find(r => r.id === idToEdit);

        if (recordToEdit) {
            document.getElementById('date').value = recordToEdit.date;
            document.getElementById('event').value = recordToEdit.event;
            
            // --- (新) 處理帳號 UI ---
            showAccountSelectUI(); // 確保顯示的是下拉選單
            accountSelect.value = recordToEdit.account; // 設定下拉選單的值
            
            document.getElementById('pulls').value = recordToEdit.pulls;
            document.getElementById('notes').value = recordToEdit.notes;

            editMode = true;
            editId = idToEdit;

            submitBtnText.textContent = '更新紀錄';
            cancelEditBtn.style.display = 'inline-block';

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
    document.getElementById('date').valueAsDate = new Date(); 
    submitBtnText.textContent = '儲存紀錄';
    cancelEditBtn.style.display = 'none';

    // --- (新) 重置帳號欄位 ---
    showAccountSelectUI();
    // 嘗試選取第一個偏好帳號，如果不存在，選取列表第一個
    const firstAccount = preferredAccountOrder[0];
    if ([...accountSelect.options].some(opt => opt.value === firstAccount)) {
        accountSelect.value = firstAccount;
    } else if (accountSelect.options.length > 0) {
        accountSelect.value = accountSelect.options[0].value;
    }
}

/**
 * 14. 顯示提示訊息
 */
function showToast(message, type = 'success') {
    toastMessage.textContent = message;
    let bgColor = '#28a745'; // success
    if (type === 'error') {
        bgColor = '#dc3545';
    } else if (type === 'info') {
        bgColor = '#0d6efd'; 
    }
    toastMessage.style.backgroundColor = bgColor;
    toastMessage.classList.add('show');
    setTimeout(() => {
        toastMessage.classList.remove('show');
    }, 2500);
}

// --- (新) 帳號欄位 UI 切換輔助函式 ---

/**
 * 顯示帳號 "下拉選單" (隱藏輸入框)
 */
function showAccountSelectUI() {
    accountSelect.style.display = 'block';
    accountInputGroup.style.display = 'none';
    isAddingNewAccount = false;
}

/**
 * 顯示帳號 "輸入框" (隱藏下拉選單)
 */
function showAccountInputUI() {
    accountSelect.style.display = 'none';
    accountInputGroup.style.display = 'block';
    isAddingNewAccount = true;
    accountInput.value = ''; // 清空
    accountInput.focus(); // 自動對焦
}

// --- 15. 資料管理功能 ---

/**
 * 清除所有資料
 */
clearButton.addEventListener('click', () => {
    if (confirm('警告：這將刪除所有儲存的抽卡紀錄！確定嗎？')) {
        records = []; 
        saveRecords(); 
        renderAll(); 
        resetFormState(); 
        showToast('所有資料已清除', 'error');
    }
});

/**
 * 匯出資料 (Export)
 */
exportButton.addEventListener('click', () => {
    if (records.length === 0) {
        showToast('目前沒有資料可匯出', 'info');
        return;
    }
    
    // 將 records 陣列轉換為 JSON 字串
    const dataStr = JSON.stringify(records, null, 2); // null, 2 是為了格式化 JSON
    // 建立 Blob 物件
    const blob = new Blob([dataStr], { type: 'application/json' });
    // 建立下載連結
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gacha_records_${new Date().toISOString().split('T')[0]}.json`; // 檔名包含日期
    document.body.appendChild(a);
    a.click();
    // 清理
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('資料已匯出！', 'success');
});

/**
 * 匯入資料 (Import) - 觸發檔案選擇
 */
importButton.addEventListener('click', () => {
    if (confirm('警告：匯入資料將會覆蓋所有目前紀錄！\n請先確認您已匯出目前的資料。\n\n確定要繼續嗎？')) {
        importFileInput.click(); // 觸發隱藏的 input
    }
});

/**
 * 處理選擇的檔案
 */
importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) {
        return; // 使用者取消了
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedData = JSON.parse(event.target.result);
            
            // 簡單驗證 (確保是陣列)
            if (Array.isArray(importedData)) {
                records = importedData; // 覆蓋
                saveRecords();
                renderAll();
                showToast('資料已成功匯入！', 'success');
            } else {
                throw new Error('檔案格式不符，並非陣列。');
            }
        } catch (err) {
            console.error('匯入錯誤:', err);
            showToast('匯入失敗！檔案格式錯誤。', 'error');
        } finally {
            // 清空 input value，確保下次選同一個檔案也能觸發 change
            importFileInput.value = null;
        }
    };
    reader.readAsText(file);
});


// --- 程式初始化 ---

// 監聽篩選器變化
accountFilter.addEventListener('change', renderAll);
// (新) 監聽日期篩選器變化
yearFilter.addEventListener('change', handleYearChange);
monthFilter.addEventListener('change', renderAll);

// --- (新) 監聽 "帳號" 下拉選單變化 ---
accountSelect.addEventListener('change', () => {
    if (accountSelect.value === '--new--') {
        showAccountInputUI();
    }
});

// --- (新) 監聽 "取消新增帳號" 按鈕 ---
cancelNewAccount.addEventListener('click', () => {
    showAccountSelectUI();
    // 重置下拉選單的值
    const firstAccount = preferredAccountOrder[0];
    if ([...accountSelect.options].some(opt => opt.value === firstAccount)) {
        accountSelect.value = firstAccount;
    } else if (accountSelect.options.length > 0) {
        accountSelect.value = accountSelect.options[0].value;
    }
});

// (新) 處理年份變更的函式
function handleYearChange() {
    // 當年份改變時，我們需要 (1) 更新月份的選項 (2) 重新渲染所有內容
    updateMonthFilter();
    renderAll();
}

loadRecords(); 
renderAll();   
document.getElementById('date').valueAsDate = new Date();