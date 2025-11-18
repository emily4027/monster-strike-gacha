// 等待 HTML 文件完全載入後執行
document.addEventListener('DOMContentLoaded', () => {

    // --- 變數定義 ---
    const form = document.getElementById('gacha-form');
    const gachaFieldset = document.getElementById('gacha-fieldset');
    const modeToggleBtn = document.getElementById('mode-toggle-btn');
    const modeToggleText = document.getElementById('mode-toggle-text');

    const tableBody = document.getElementById('history-table-body');
    const toastMessage = document.getElementById('toast-message');
    const tagSelect = document.getElementById('tag-select');

    // --- Event 欄位變數 ---
    const eventSelect = document.getElementById('event-select');
    const eventInputGroup = document.getElementById('event-input-group');
    const eventInput = document.getElementById('event-input');
    const cancelNewEvent = document.getElementById('cancel-new-event');
    const editEventBtn = document.getElementById('edit-event-btn');

    // --- 帳號欄位的新變數 ---
    const accountSelect = document.getElementById('account-select');
    const accountInputGroup = document.getElementById('account-input-group');
    const accountInput = document.getElementById('account-input');
    const cancelNewAccount = document.getElementById('cancel-new-account');

    // --- 欄位 ---
    const dateInput = document.getElementById('date');
    const pullsInput = document.getElementById('pulls');
    const notesInput = document.getElementById('notes');

    const submitBtnText = document.getElementById('submit-btn-text');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    
    // --- 儀表板篩選 ---
    const accountFilter = document.getElementById('account-filter');
    const yearFilter = document.getElementById('year-filter');
    const monthFilter = document.getElementById('month-filter');

    const historyTableTitle = document.getElementById('history-table-title');

    // --- 資料管理按鈕 ---
    const clearButton = document.getElementById('clear-data');
    const exportButton = document.getElementById('export-data');
    const importButton = document.getElementById('import-data');
    const importFileInput = document.getElementById('import-file-input');

    // 應用程式的核心資料庫 (使用者紀錄)
    let records = [];
    // (新) 官方/共用活動資料庫 (從 events.json 讀取)
    let masterEvents = []; 

    // 全局編輯模式狀態
    let globalEditMode = false;
    // 追蹤是否處於編輯模式
    let editMode = false;
    let editEventName = null; 
    // 追蹤是否正在新增帳號/活動
    let isAddingNewAccount = false;
    let isAddingNewEvent = false;
    // 定義帳號優先順序
    const preferredAccountOrder = ['羽入', '梨花', '沙都子'];

    // --- 範例資料 (已清空) ---
    const sampleData = [];

    // --- 核心功能 ---

    /**
     * (新) 從外部 JSON 檔案載入共用活動列表
     */
    async function loadMasterEvents() {
        try {
            const response = await fetch('events.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (Array.isArray(data)) {
                masterEvents = data;
                console.log('成功載入共用活動列表:', masterEvents.length, '筆');
                // 載入後，重新整理下拉選單
                updateEventFormSelect(records); 
            }
        } catch (error) {
            console.warn('無法載入 events.json (如果是本地開啟 HTML 這是正常的):', error);
            // 即使失敗也不影響主程式，只是沒有預設活動選單
        }
    }

    /**
     * 1. 處理表單提交 (新增 或 更新)
     */
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        if (!globalEditMode) {
            showToast('請先點擊右下角的 "進入編輯模式"', 'info');
            return;
        }
        
        const date = dateInput.value;
        const tag = tagSelect.value;
        const pulls = parseInt(pullsInput.value, 10);
        const notes = notesInput.value;

        // --- 根據狀態獲取活動名稱 ---
        let event;
        if (isAddingNewEvent || editMode) { 
            event = eventInput.value.trim();
        } else {
            event = eventSelect.value;
            if (event === '--new--') {
                 showToast('請點擊"編輯"按鈕來輸入新活動名稱！', 'error'); return;
            }
        }

        // --- 根據狀態獲取帳號名稱 ---
        let account;
        if (isAddingNewAccount) {
            account = accountInput.value.trim();
        } else {
            account = accountSelect.value;
        }

        // --- 驗證 ---
        if (!date) { showToast('請選擇日期！', 'error'); return; }
        if (!event || event === '--new--') { showToast('請輸入或選擇有效的活動！', 'error'); return; }
        if (!account || account === '--new--') { showToast('請輸入或選擇有效的帳號！', 'error'); return; }
        
        if (account === '--batch--') {
            // 批次編輯不需要驗證 pulls
        } else if (isNaN(pulls) || pulls < 0) {
            showToast('請輸入有效的抽數！', 'error'); return;
        }

        if (editMode) {
            // --- 更新 (UPDATE) 邏輯 ---
            if (account === '--batch--') {
                // --- 批次更新 ---
                let updatedCount = 0;
                records.forEach(r => {
                    if (r.event === editEventName) {
                        r.event = event;
                        r.date = date;
                        r.tag = tag;
                        updatedCount++;
                    }
                });
                showToast(`已批次更新 ${updatedCount} 筆紀錄！`, 'success');
            } else {
                // --- 單筆更新 ---
                const recordToUpdate = records.find(r => r.event === editEventName && r.account === account);
                if (recordToUpdate) {
                    recordToUpdate.event = event;
                    recordToUpdate.date = date;
                    recordToUpdate.tag = tag;
                    recordToUpdate.pulls = pulls;
                    recordToUpdate.notes = notes;
                    showToast('紀錄已更新！', 'success');
                } else {
                    // 編輯模式下的新增 (該帳號無紀錄)
                    const newRecord = { id: Date.now(), date, event, account, pulls, notes, tag };
                    records.push(newRecord);
                    showToast('已為此帳號新增紀錄！', 'success');
                }
            }
        } else {
            // --- 新增 (CREATE) 邏輯 ---
            const existingRecord = records.find(r =>
                r.date === date && r.event === event && r.account === account
            );
            if (existingRecord) {
                showToast('錯誤：該筆紀錄已存在。請點擊活動旁的"編輯"按鈕。', 'error');
                handleEventSelectChange(); 
                return;
            }

            const newRecord = { id: Date.now(), date, event, account, pulls, notes, tag };
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
        if (data && JSON.parse(data).length > 0) { 
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
                dateFilterPrefix += '-' + selectedMonth;
            }
        }

        if (dateFilterPrefix !== '') {
            filteredRecords = filteredRecords.filter(r => r.date.startsWith(dateFilterPrefix));
        }

        renderTable(filteredRecords, selectedAccount, selectedYear, selectedMonth);
        calculateStats(filteredRecords, selectedAccount);

        const sortedAccounts = getSortedAccountNames();
        
        // 更新活動選單 (傳入篩選後的紀錄，如果是新增模式則傳入全部)
        // (新) 這裡我們會用 filteredRecords 來決定下拉選單要顯示什麼
        // 但如果正在篩選特定日期，我們還是希望顯示 masterEvents 中符合日期的活動
        updateEventFormSelect(filteredRecords); 
        
        updateAccountFilter(sortedAccounts);
        
        if (!editMode) {
            updateAccountFormSelect(sortedAccounts); 
        }

        updateYearFilter();
        updateMonthFilter();
    }

    /**
     * 5. 渲染歷史紀錄表格
     */
    function renderTable(filteredRecords, selectedAccount, selectedYear, selectedMonth) {
        tableBody.innerHTML = ''; 

        let title = '3. ';
        if (selectedAccount === 'all') {
            title += '歷史紀錄 (Tidy Data)';
        } else {
            title += `${selectedAccount} 的歷史紀錄`;
        }

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

        const sortedRecords = [...filteredRecords].sort((a, b) => a.date.localeCompare(b.date));

        sortedRecords.forEach(record => {
            const row = document.createElement('tr');

            if (record.tag && record.tag !== 'none') {
                row.setAttribute('data-tag', record.tag);
            }

            const cleanEventName = getCleanEventName(record.event, record.date);
            const cleanNotes = getCleanNotes(record.notes); 

            row.innerHTML = `
                <td>${record.date}</td>
                <td>${cleanEventName}</td>
                <td>${record.account}</td>
                <td>${record.pulls}</td>
                <td>${cleanNotes}</td> 
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
        const totalPulls = filteredRecords.reduce((sum, record) => sum + record.pulls, 0);
        document.getElementById('total-pulls').textContent = totalPulls.toLocaleString();
        const totalPullsTitle = document.getElementById('total-pulls-title');
        totalPullsTitle.innerHTML = `<i class="bi bi-gem"></i> ${selectedAccount === 'all' ? '總投入抽數' : `${selectedAccount} 總抽數`}`;

        const accountStats = {};
        filteredRecords.forEach(record => {
            accountStats[record.account] = (accountStats[record.account] || 0) + record.pulls;
        });

        const accountStatsDiv = document.getElementById('account-stats');
        accountStatsDiv.innerHTML = '<h5><i class="bi bi-people-fill"></i> 各帳號總抽數</h5>';
        const sortedAccounts = Object.entries(accountStats).sort(([, a], [, b]) => b - a);
        for (const [account, pulls] of sortedAccounts) {
            accountStatsDiv.innerHTML += `<p>${account}: <strong>${pulls.toLocaleString()}</strong> 抽</p>`;
        }

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

        const sortedEvents = Object.entries(eventStats).sort(([, a], [, b]) => a.firstDate.localeCompare(b.firstDate));

        if (sortedEvents.length === 0) {
            scrollableContent.innerHTML = `<p><i>尚無資料</i></p>`;
        } else {
            for (const [event, data] of sortedEvents) {
                const year = data.firstDate.split('-')[0];
                const month = parseInt(data.firstDate.split('-')[1], 10);
                const displayEventName = getCleanEventName(event, data.firstDate);
                scrollableContent.innerHTML += `<p><span class="text-muted small me-2" style="display: inline-block; width: 75px;">${year}年 ${month}月</span> ${displayEventName}: <strong>${data.pulls.toLocaleString()}</strong> 抽</p>`;
            }
        }
        eventStatsDiv.appendChild(scrollableContent);
    }

    /**
     * 7. 取得排序後的帳號列表
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

        preferred.sort((a, b) => preferredAccountOrder.indexOf(a) - preferredAccountOrder.indexOf(b));
        others.sort((a, b) => a.localeCompare(b));

        return [...preferred, ...others];
    }

    function getCleanEventName(event, date) {
        let displayEventName = event;
        const year = date.substring(0, 4);
        const monthNum = parseInt(date.split('-')[1], 10); 
        const monthStr = date.split('-')[1]; 

        const patterns = [
            `${year}-${monthStr}月`, 
            `${year}-${monthNum}月`, 
            `${year}年${monthStr}月`, 
            `${year}年${monthNum}月`, 
            `${year}/${monthStr}月`, 
            `${year}/${monthNum}月`  
        ];
        
        for (const pattern of patterns) {
            if (displayEventName.startsWith(pattern)) {
                displayEventName = displayEventName.substring(pattern.length).trim();
                break; 
            }
        }

        if (displayEventName === "") {
            displayEventName = event; 
        }
        return displayEventName;
    }

    function getCleanNotes(notes) {
        if (typeof notes !== 'string' || !notes) return '';
        return notes.replace(/^(\d+)\s*抽\s*/, '').replace(/^(\?\?|？？)\s*抽\s*/, '').trim();
    }


    /**
     * 8. 更新 "表單" 中的 "活動" 下拉選單
     * (新) 整合 records 和 masterEvents
     */
    function updateEventFormSelect(recordsToUse) {
        const currentEvent = eventSelect.value;

        // 1. 從使用者紀錄中獲取不重複的活動名稱
        const userEventNames = [...new Set(recordsToUse.map(r => r.event))];
        
        // 2. 從 Master List 獲取不重複的活動名稱
        // (新) 這裡可以過濾：如果目前有日期篩選，Master Events 也要符合篩選條件
        const selectedYear = yearFilter.value;
        const selectedMonth = monthFilter.value;
        
        let filteredMasterEvents = masterEvents;
        
        if (selectedYear !== 'all') {
            let prefix = selectedYear;
            if (selectedMonth !== 'all') {
                prefix += '-' + selectedMonth;
            }
            filteredMasterEvents = masterEvents.filter(e => e.date.startsWith(prefix));
        }

        const masterEventNames = filteredMasterEvents.map(e => e.event);

        // 3. 合併並去重
        const allEventNames = [...new Set([...userEventNames, ...masterEventNames])];

        // 4. 排序 (讓新的日期在前面比較好找，或照字母)
        // 這裡我們簡單照字母/日期字串排序
        allEventNames.sort((a, b) => b.localeCompare(a)); 

        eventSelect.innerHTML = '';

        const newOption = document.createElement('option');
        newOption.value = '--new--';
        newOption.textContent = '-- 新增活動 --';
        newOption.style.fontStyle = 'italic';
        newOption.style.color = '#0d6efd';
        eventSelect.appendChild(newOption);

        allEventNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            eventSelect.appendChild(option);
        });

        if (allEventNames.includes(currentEvent)) {
            eventSelect.value = currentEvent;
        } else if (!editMode) { 
            eventSelect.value = '--new--';
        }
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

        accountFilter.value = currentFilterValue;
    }

    /**
     * 10a. 更新年份篩選器
     */
    function updateYearFilter() {
        const currentYear = yearFilter.value;
        // (新) 年份應該包含 User Records 和 Master Events 的年份
        const userYears = records.map(r => r.date.substring(0, 4));
        const masterYears = masterEvents.map(e => e.date.substring(0, 4));
        
        const allYears = [...new Set([...userYears, ...masterYears])]
            .sort((a, b) => b.localeCompare(a)); // 降冪

        yearFilter.innerHTML = '<option value="all">全部年份</option>';

        allYears.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearFilter.appendChild(option);
        });

        if ([...yearFilter.options].some(o => o.value === currentYear)) {
            yearFilter.value = currentYear;
        }
    }

    /**
     * 10b. 更新月份篩選器
     */
    function updateMonthFilter() {
        const selectedYear = yearFilter.value;
        const currentMonth = monthFilter.value;

        if (selectedYear === 'all') {
            monthFilter.disabled = true;
            monthFilter.value = 'all';
            monthFilter.innerHTML = '<option value="all">全部月份</option>';
        } else {
            monthFilter.disabled = false;
            monthFilter.innerHTML = `<option value="all">全部月份 (${selectedYear})</option>`;
            for (let i = 1; i <= 12; i++) {
                const month = i.toString().padStart(2, '0');
                const option = document.createElement('option');
                option.value = month;
                option.textContent = `${i}月`;
                monthFilter.appendChild(option);
            }
            monthFilter.value = currentMonth;
        }
    }


    /**
     * 10c. 更新 "表單" 中的 "帳號" 下拉選單
     */
    function updateAccountFormSelect(sortedAccounts, options = { isEditMode: false }) {
        const currentAccount = accountSelect.value;
        accountSelect.innerHTML = '';

        if (options.isEditMode) {
            const batchOption = document.createElement('option');
            batchOption.value = '--batch--';
            batchOption.textContent = '-- 全部帳號 (僅編輯) --';
            batchOption.style.color = 'blue';
            accountSelect.appendChild(batchOption);
        } else {
            const newOption = document.createElement('option');
            newOption.value = '--new--';
            newOption.textContent = '-- 新增帳號 --';
            newOption.style.fontStyle = 'italic';
            newOption.style.color = '#0d6efd';
            accountSelect.appendChild(newOption);
        }

        sortedAccounts.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            accountSelect.appendChild(option);
        });

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
            const idToDelete = parseInt(deleteButton.getAttribute('data-id'), 10);
            if (confirm('確定要刪除這筆紀錄嗎？')) {
                records = records.filter(record => record.id !== idToDelete);
                saveRecords();
                renderAll();
                resetFormState();
                showToast('紀錄已刪除', 'success');
            }
        } else if (editButton) {
            const idToEdit = parseInt(editButton.getAttribute('data-id'), 10);
            const recordToEdit = records.find(r => r.id === idToEdit);

            if (recordToEdit) {
                if (!globalEditMode) {
                    showToast('請先點擊右下角的 "進入編輯模式"', 'info');
                    return;
                }
                
                showAccountSelectUI();
                // 預先填入活動名稱
                eventSelect.value = recordToEdit.event;
                
                enterEditMode(); 

                accountSelect.value = recordToEdit.account;
                loadRecordForEdit(recordToEdit.account);

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
        editEventName = null; 
        form.reset();
        tagSelect.value = 'none';
        dateInput.valueAsDate = new Date();
        
        submitBtnText.textContent = '儲存紀錄';
        cancelEditBtn.style.display = 'none';

        togglePullFields(true);

        showEventSelectUI(); 
        updateEventFormSelect(records); // 重置時，顯示所有可用的活動 (包含 Master)
        eventSelect.value = '--new--'; 
        isAddingNewEvent = false; 
        
        handleEventSelectChange(); 

        showAccountSelectUI();
        updateAccountFormSelect(getSortedAccountNames(), { isEditMode: false }); 
        if (accountSelect.options.length > 0) {
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

    // --- (新) 欄位 UI 切換輔助函式 ---

    function showAccountSelectUI() {
        accountSelect.style.display = 'block';
        accountInputGroup.style.display = 'none';
        isAddingNewAccount = false;
    }

    function showAccountInputUI() {
        accountSelect.style.display = 'none';
        accountInputGroup.style.display = 'block';
        isAddingNewAccount = true;
        accountInput.value = '';
        accountInput.focus();
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
        if (enabled) {
            pullsInput.disabled = false;
            notesInput.disabled = false;
            pullsInput.classList.remove('field-disabled');
            notesInput.classList.remove('field-disabled');
        } else {
            pullsInput.disabled = true;
            notesInput.disabled = true;
            pullsInput.classList.add('field-disabled');
            notesInput.classList.add('field-disabled');
            pullsInput.value = ''; 
            notesInput.value = ''; 
        }
    }


    // --- 15. 資料管理功能 ---

    clearButton.addEventListener('click', () => {
        if (confirm('警告：這將刪除所有儲存的抽卡紀錄！確定嗎？')) {
            records = [];
            saveRecords();
            renderAll();
            resetFormState();
            showToast('所有資料已清除', 'error');
        }
    });

    exportButton.addEventListener('click', () => {
        if (records.length === 0) {
            showToast('目前沒有資料可匯出', 'info');
            return;
        }

        const dataStr = JSON.stringify(records, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gacha_records_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('資料已匯出！', 'success');
    });

    importButton.addEventListener('click', () => {
        if (confirm('警告：匯入資料將會覆蓋所有目前紀錄！\n請先確認您已匯出目前的資料。\n\n確定要繼續嗎？')) {
            importFileInput.click();
        }
    });

    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);

                if (Array.isArray(importedData)) {
                    records = importedData;
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
                importFileInput.value = null;
            }
        };
        reader.readAsText(file);
    });


    // --- (新) 核心邏輯：進入 "新增" 模式 ---
    function enterAddMode() {
        editMode = false; 

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

        showToast('請輸入新活動的資訊', 'info');
    }


    // --- (新) 核心邏輯：進入 "編輯" 模式 ---
    function enterEditMode() {
        const eventName = eventSelect.value;
        if (eventName === '--new--' || eventName === null) {
            enterAddMode();
            return;
        }

        editMode = true;
        editEventName = eventName; 

        submitBtnText.textContent = '更新紀錄';
        cancelEditBtn.style.display = 'inline-block';
        editEventBtn.style.display = 'none'; 
        
        showEventInputUI();
        eventInput.value = eventName;

        updateAccountFormSelect(getSortedAccountNames(), { isEditMode: true });

        accountSelect.value = '--batch--';

        loadRecordForEdit('--batch--');

        showToast('進入編輯模式', 'info');
    }

    /**
     * (新) 核心邏輯：在編輯模式下，根據帳號選擇載入資料
     */
    function loadRecordForEdit(accountName) {
        if (!editMode) return; 

        let recordToLoad = null;

        if (accountName === '--batch--') {
            togglePullFields(false);
            
            // 優先從 records 找，找不到才去 masterEvents 找 (為了填入日期/標籤)
            recordToLoad = records.find(r => r.event === editEventName);
            
            if (!recordToLoad) {
                const masterEvent = masterEvents.find(e => e.event === editEventName);
                if (masterEvent) {
                    recordToLoad = { date: masterEvent.date, tag: masterEvent.tag, pulls: '', notes: '' };
                }
            }

        } else {
            togglePullFields(true);
            recordToLoad = records.find(r => r.event === editEventName && r.account === accountName);
            
            // 如果該帳號還沒紀錄，但這是 Master Event，可以預先載入日期和標籤
            if (!recordToLoad) {
                const masterEvent = masterEvents.find(e => e.event === editEventName);
                if (masterEvent) {
                     // 創建一個臨時物件來填充表單
                     recordToLoad = { date: masterEvent.date, tag: masterEvent.tag, pulls: '', notes: '' };
                }
            }
        }

        if (recordToLoad) {
            dateInput.value = recordToLoad.date;
            tagSelect.value = recordToLoad.tag || 'none';

            if (accountName !== '--batch--') {
                pullsInput.value = recordToLoad.pulls;
                notesInput.value = recordToLoad.notes;
            }
        } else {
            pullsInput.value = '';
            notesInput.value = '';
        }
    }


    // --- 程式初始化 ---

    modeToggleBtn.addEventListener('click', () => {
        globalEditMode = !globalEditMode; 
        if (globalEditMode) {
            document.body.classList.add('edit-mode-active');
            gachaFieldset.disabled = false; 
            modeToggleBtn.classList.remove('btn-outline-secondary');
            modeToggleBtn.classList.add('btn-primary');
            modeToggleBtn.innerHTML = '<i class="bi bi-check-circle"></i> <span id="mode-toggle-text">完成編輯 (點此檢視)</span>';
            resetFormState(); 
            showToast('已進入編輯模式', 'info');
        } else {
            document.body.classList.remove('edit-mode-active');
            gachaFieldset.disabled = true; 
            modeToggleBtn.classList.add('btn-outline-secondary');
            modeToggleBtn.classList.remove('btn-primary');
            modeToggleBtn.innerHTML = '<i class="bi bi-eye"></i> <span id="mode-toggle-text">檢視模式 (點此編輯)</span>';
            resetFormState(); 
            showToast('已退出編輯模式', 'info');
        }
    });

    accountFilter.addEventListener('change', renderAll);
    yearFilter.addEventListener('change', handleYearChange);
    monthFilter.addEventListener('change', renderAll);

    // (新) 監聽 "活動" 下拉選單變化
    function handleEventSelectChange() {
        const selectedEventName = eventSelect.value;
        
        if (selectedEventName === '--new--' || !selectedEventName) {
             // 這裡不自動切換到 input，只控制編輯按鈕顯示
             // 當選的是 "--new--"，我們顯示按鈕，點擊後進入 Add Mode
             editEventBtn.style.display = 'block';
        } else {
             // 選了已存在的活動，顯示按鈕，點擊後進入 Edit Mode
             // (新) 自動載入 Master Data 的日期和標籤 (如果有的話)
             const masterEvent = masterEvents.find(e => e.event === selectedEventName);
             if (masterEvent) {
                 dateInput.value = masterEvent.date;
                 tagSelect.value = masterEvent.tag;
             }
             editEventBtn.style.display = 'block';
        }
    }
    eventSelect.addEventListener('change', handleEventSelectChange);

    editEventBtn.addEventListener('click', () => {
        if (eventSelect.value === '--new--') {
            enterAddMode();
        } else {
            enterEditMode();
        }
    });


    cancelNewEvent.addEventListener('click', () => {
        resetFormState();
    });

    function handleAccountSelectChange() {
        if (accountSelect.value === '--new--') {
            showAccountInputUI();
        } else {
            showAccountSelectUI(); 
            if (editMode) {
                loadRecordForEdit(accountSelect.value);
            }
        }
    }
    accountSelect.addEventListener('change', handleAccountSelectChange);


    cancelNewAccount.addEventListener('click', () => {
        showAccountSelectUI();
        if (editMode) {
            accountSelect.value = '--batch--';
        } else {
            accountSelect.value = '--new--'; 
        }
    });

    function handleYearChange() {
        updateMonthFilter();
        renderAll();
    }

    // (新) 初始化流程
    async function init() {
        // 1. 載入 Master Events
        await loadMasterEvents();
        // 2. 載入 User Records
        loadRecords();
        // 3. 渲染
        renderAll();
        resetFormState();
        gachaFieldset.disabled = true;
    }
    
    init();
});