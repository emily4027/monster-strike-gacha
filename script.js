// 等待 HTML 文件完全載入後執行
document.addEventListener('DOMContentLoaded', () => {

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
    const editEventBtn = document.getElementById('edit-event-btn'); // (新) 編輯活動按鈕

    // --- 帳號欄位的新變數 ---
    const accountSelect = document.getElementById('account-select');
    const accountInputGroup = document.getElementById('account-input-group');
    const accountInput = document.getElementById('account-input');
    const cancelNewAccount = document.getElementById('cancel-new-account');

    // --- 欄位 ---
    const dateInput = document.getElementById('date');
    const pullsInput = document.getElementById('pulls');
    const notesInput = document.getElementById('notes');

    // (移除) loadRecordBtn

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

    // 應用程式的核心資料庫 (一個存放所有紀錄的陣列)
    let records = [];
    // 追蹤是否處於編輯模式
    let editMode = false;
    let editEventName = null; // (新) 儲存正在編輯的活動名稱
    // 追蹤是否正在新增帳號/活動
    let isAddingNewAccount = false;
    let isAddingNewEvent = false;
    // 定義帳號優先順序
    const preferredAccountOrder = ['羽入', '梨花', '沙都子'];

    // --- 範例資料 ---
    const sampleData = [
        { id: 1700000000001, date: '2025-05-15', event: '2025-5月 孤獨搖滾', account: '羽入', pulls: 90, notes: '虹夏*3 麒麟兒*2 久遠 摩奇亞', tag: 'collab' },
        { id: 1700000000002, date: '2025-05-15', event: '2025-5月 孤獨搖滾', account: '梨花', pulls: 90, notes: '虹夏 山田 奈特 喜多', tag: 'collab' },
        { id: 1700000000003, date: '2025-05-15', event: '2025-5月 孤獨搖滾', account: '沙都子', pulls: 70, notes: '虹夏*3 山田*3 摩奇亞 艾兒', tag: 'collab' },
        { id: 1700000000004, date: '2025-05-01', event: '2025-5月 柯南第二彈', account: '羽入', pulls: 100, notes: '安室透*2 新一*2 基德', tag: 'collab' },
        { id: 1700000000005, date: '2025-05-01', event: '2025-5月 柯南第二彈', account: '梨花', pulls: 100, notes: '安室透*3 基德*2 柯南 新一', tag: 'collab' },
        { id: 1700000000006, date: '2025-05-01', event: '2025-5月 柯南第二彈', account: '沙都子', pulls: 100, notes: '柯南 赤井 新一*4', tag: 'collab' },
        { id: 1700000000007, date: '2025-04-20', event: '2025-4月 2.5次元', account: '羽入', pulls: 20, notes: '諾諾亞*2', tag: 'honke' },
        { id: 1700000000008, date: '2025-04-20', event: '2025-4月 2.5次元', account: '梨花', pulls: 20, notes: '利利艾路*2  美莉艾拉', tag: 'honke' },
        { id: 1700000000009, date: '2025-04-20', event: '2025-4月 2.5次元', account: '沙都子', pulls: 40, notes: '', tag: 'honke' },
    ];

    // --- 核心功能 ---

    /**
     * 1. 處理表單提交 (新增 或 更新)
     */
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const date = dateInput.value;
        const tag = tagSelect.value;
        const pulls = parseInt(pullsInput.value, 10);
        const notes = notesInput.value;

        // --- 根據狀態獲取活動名稱 ---
        let event;
        if (editMode) {
            event = eventInput.value.trim(); // (新) 編輯模式下，從 "輸入框" 獲取新名稱
        } else if (isAddingNewEvent) {
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

        // --- 驗證 ---
        if (!date) { showToast('請選擇日期！', 'error'); return; }
        if (!event || event === '--new--') { showToast('請輸入或選擇有效的活動！', 'error'); return; }
        if (!account || account === '--new--') { showToast('請輸入或選擇有效的帳號！', 'error'); return; }
        
        // (新) 批次編輯和一般編輯的驗證
        if (account === '--batch--') {
            // 批次編輯不需要驗證 pulls
        } else if (isNaN(pulls) || pulls < 0) {
            // 一般編輯/新增 需要驗證 pulls
            showToast('請輸入有效的抽數！', 'error'); return;
        }


        if (editMode) {
            // --- (新) 更新 (UPDATE) 邏輯 ---
            if (account === '--batch--') {
                // --- 批次更新 ---
                let updatedCount = 0;
                records.forEach(r => {
                    if (r.event === editEventName) {
                        r.event = event; // (新) 連活動名稱一起更新
                        r.date = date; // 更新日期
                        r.tag = tag;   // 更新標籤
                        updatedCount++;
                    }
                });
                showToast(`已批次更新 ${updatedCount} 筆紀錄！`, 'success');
            } else {
                // --- 單筆更新 ---
                const recordToUpdate = records.find(r => r.event === editEventName && r.account === account);
                if (recordToUpdate) {
                    recordToUpdate.event = event; // (新) 連活動名稱一起更新
                    recordToUpdate.date = date;
                    recordToUpdate.tag = tag;
                    recordToUpdate.pulls = pulls;
                    recordToUpdate.notes = notes;
                    // (注意：編輯模式下不允許更改 event 和 account 名稱)
                    showToast('紀錄已更新！', 'success');
                } else {
                    // (新) 如果在編輯模式下，但該帳號沒有紀錄，則轉為 "新增"
                    // (例如：羽入、梨花有抽，但沙都子沒抽。點編輯後，選沙都子，會是新增)
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
                handleEventSelectChange(); // 確保 "編輯" 按鈕可見
                return;
            }

            const newRecord = { id: Date.now(), date, event, account, pulls, notes, tag };
            records.push(newRecord);
            showToast('紀錄已儲存！', 'success');
        }

        saveRecords();
        resetFormState(); // 重置表單
        renderAll(); // 刷新所有畫面
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
        updateEventFormSelect(); // (新) 參數移除
        updateAccountFilter(sortedAccounts);
        
        // (新) 只有在非編輯模式下才更新帳號表單
        // (避免在編輯時，選單被重置)
        if (!editMode) {
            updateAccountFormSelect(sortedAccounts); // (新) 參數移除
        }

        updateYearFilter();
        updateMonthFilter();
    }

    /**
     * 5. 渲染歷史紀錄表格
     */
    function renderTable(filteredRecords, selectedAccount, selectedYear, selectedMonth) {
        tableBody.innerHTML = ''; // 清空表格

        // 產生動態標題
        let title = '3. ';
        if (selectedAccount === 'all') {
            title += '歷史紀錄 (Tidy Data)';
        } else {
            title += `${selectedAccount} 的歷史紀錄`;
        }

        // 加上日期標題
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

            if (record.tag && record.tag !== 'none') {
                row.setAttribute('data-tag', record.tag);
            }

            const cleanEventName = getCleanEventName(record.event, record.date);

            row.innerHTML = `
                <td>${record.date}</td>
                <td>${cleanEventName}</td>
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
        const sortedAccounts = Object.entries(accountStats).sort(([, a], [, b]) => b - a);
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

    /**
     * (新) 輔助函式：清理活動名稱中的日期前綴
     */
    function getCleanEventName(event, date) {
        let displayEventName = event;
        const year = date.substring(0, 4);
        const monthInt = parseInt(date.split('-')[1], 10);

        const pattern1 = `${year}-${monthInt}月`;
        const pattern2 = `${year}年${monthInt}月`;
        const pattern3 = `${year}/${monthInt}月`;

        if (displayEventName.startsWith(pattern1)) {
            displayEventName = displayEventName.substring(pattern1.length).trim();
        } else if (displayEventName.startsWith(pattern2)) {
            displayEventName = displayEventName.substring(pattern2.length).trim();
        } else if (displayEventName.startsWith(pattern3)) {
            displayEventName = displayEventName.substring(pattern3.length).trim();
        }

        if (displayEventName === "") {
            displayEventName = event;
        }
        return displayEventName;
    }

    /**
     * 8. (新) 更新 "表單" 中的 "活動" 下拉選單
     */
    function updateEventFormSelect() {
        const currentEvent = eventSelect.value;
        const eventNames = [...new Set(records.map(r => r.event))].sort((a, b) => a.localeCompare(b));

        eventSelect.innerHTML = '';

        const newOption = document.createElement('option');
        newOption.value = '--new--';
        newOption.textContent = '-- 新增活動 --';
        newOption.style.fontStyle = 'italic';
        newOption.style.color = '#0d6efd';
        eventSelect.appendChild(newOption);

        eventNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            eventSelect.appendChild(option);
        });

        if (eventNames.includes(currentEvent)) {
            eventSelect.value = currentEvent;
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
        const years = [...new Set(records.map(r => r.date.substring(0, 4)))]
            .sort((a, b) => b.localeCompare(a));

        yearFilter.innerHTML = '<option value="all">全部年份</option>';

        years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearFilter.appendChild(option);
        });

        yearFilter.value = currentYear;
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
     * (新) 增加 isEditMode 參數
     */
    function updateAccountFormSelect(sortedAccounts, options = { isEditMode: false }) {
        const currentAccount = accountSelect.value;
        accountSelect.innerHTML = '';

        // (新) 根據是否為編輯模式，決定是否加入 "批次" 選項
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
            const idToDelete = parseInt(deleteButton.getAttribute('data-id'), 10);
            if (confirm('確定要刪除這筆紀錄嗎？')) {
                records = records.filter(record => record.id !== idToDelete);
                saveRecords();
                renderAll();
                resetFormState();
                showToast('紀錄已刪除', 'success');
            }
        } else if (editButton) {
            // --- 點擊表格 "編輯" 按鈕 ---
            const idToEdit = parseInt(editButton.getAttribute('data-id'), 10);
            const recordToEdit = records.find(r => r.id === idToEdit);

            if (recordToEdit) {
                // 1. 確保 UI 是下拉選單
                showEventSelectUI();
                showAccountSelectUI();

                // 2. 設定 "活動"
                eventSelect.value = recordToEdit.event;
                
                // 3. (新) 手動觸發 "編輯" 按鈕邏輯
                // 這會鎖定活動、設定 editEventName、並載入 "批次" 選項
                enterEditMode(); 

                // 4. 設定 "帳號" (在 "批次" 選項載入後)
                accountSelect.value = recordToEdit.account;

                // 5. (新) 手動載入該帳號的資料
                loadRecordForEdit(recordToEdit.account);

                // 6. 捲動到最上方
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
        editEventName = null; // (新)
        form.reset();
        tagSelect.value = 'none';
        dateInput.valueAsDate = new Date();
        
        submitBtnText.textContent = '儲存紀錄';
        cancelEditBtn.style.display = 'none';

        // (新) 解鎖活動欄位 (移除 disabled)
        eventSelect.disabled = false;
        // (新) 隱藏 "編輯" 按鈕
        editEventBtn.style.display = 'none';

        // (新) 啟用 pulls/notes
        togglePullFields(true);

        // 重置活動欄位
        showEventSelectUI(); // (新) 確保顯示的是下拉選單
        if (eventSelect.options.length > 0) {
            eventSelect.value = eventSelect.options[0].value; // 選回 "-- 新增活動 --"
        }

        // 重置帳號欄位
        showAccountSelectUI();
        updateAccountFormSelect(getSortedAccountNames(), { isEditMode: false }); // (新) 傳入 false
        if ([...accountSelect.options].some(opt => opt.value === preferredAccountOrder[0])) {
            accountSelect.value = preferredAccountOrder[0];
        } else if (accountSelect.options.length > 1) { // [0] 是 "新增"
            accountSelect.value = accountSelect.options[1].value;
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
        accountInput.value = '';
        accountInput.focus();
    }

    /**
     * 顯示活動 "下拉選單" (隱藏輸入框)
     */
    function showEventSelectUI() {
        eventSelect.style.display = 'block';
        eventInputGroup.style.display = 'none';
        isAddingNewEvent = false;
    }

    /**
     * 顯示活動 "輸入框" (隱藏下拉選單)
     */
    function showEventInputUI() {
        eventSelect.style.display = 'none';
        eventInputGroup.style.display = 'block';
        isAddingNewEvent = true;
        eventInput.value = '';
        eventInput.focus();
    }

    // --- (新) 啟用/禁用 pulls 和 notes ---
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
            pullsInput.value = ''; // 禁用時清空
            notesInput.value = ''; // 禁用時清空
        }
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

    /**
     * 匯入資料 (Import) - 觸發檔案選擇
     */
    importButton.addEventListener('click', () => {
        if (confirm('警告：匯入資料將會覆蓋所有目前紀錄！\n請先確認您已匯出目前的資料。\n\n確定要繼續嗎？')) {
            importFileInput.click();
        }
    });

    /**
     * 處理選擇的檔案
     */
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


    // --- (新) 核心邏輯：進入編輯模式 ---
    function enterEditMode() {
        const eventName = eventSelect.value;
        if (eventName === '--new--' || eventName === null) return;

        editMode = true;
        editEventName = eventName; // 鎖定正在編輯的 "原始" 活動名稱

        // 1. 更新 UI
        submitBtnText.textContent = '更新紀錄';
        cancelEditBtn.style.display = 'inline-block';
        editEventBtn.style.display = 'none'; // 隱藏自己
        
        // (新) 顯示 "輸入框" 並填入原始名稱，取代 "鎖定下拉選單"
        showEventInputUI();
        eventInput.value = eventName;

        // 2. 重建帳號選單 (加入 "批次" 選項)
        updateAccountFormSelect(getSortedAccountNames(), { isEditMode: true });

        // 3. 預先載入 "批次" 模式的資料 (日期/標籤)
        loadRecordForEdit('--batch--');

        showToast('進入編輯模式', 'info');
    }

    /**
     * (新) 核心邏輯：在編輯模式下，根據帳號選擇載入資料
     */
    function loadRecordForEdit(accountName) {
        if (!editMode) return; // 必須在編輯模式

        let recordToLoad = null;

        if (accountName === '--batch--') {
            // 載入 "批次" 模式：
            // 1. 禁用 pulls/notes
            togglePullFields(false);
            // 2. 尋找此活動的第一筆紀錄，作為日期/標籤的模板
            recordToLoad = records.find(r => r.event === editEventName);
        } else {
            // 載入 "特定帳號" 模式：
            // 1. 啟用 pulls/notes
            togglePullFields(true);
            // 2. 尋找完全符合的紀錄
            recordToLoad = records.find(r => r.event === editEventName && r.account === accountName);
        }

        if (recordToLoad) {
            // 找到了，載入資料
            dateInput.value = recordToLoad.date;
            tagSelect.value = recordToLoad.tag || 'none';

            if (accountName !== '--batch--') {
                pullsInput.value = recordToLoad.pulls;
                notesInput.value = recordToLoad.notes;
            }
        } else {
            // 沒找到 (例如：選了一個 "新帳號" 或該帳號沒有此活動紀錄)
            // 清空 pulls/notes，但保留 date/tag (來自"批次"的模板)
            pullsInput.value = '';
            notesInput.value = '';
        }
    }


    // --- 程式初始化 ---

    // 監聽篩選器變化
    accountFilter.addEventListener('change', renderAll);
    yearFilter.addEventListener('change', handleYearChange);
    monthFilter.addEventListener('change', renderAll);

    // (新) 監聽 "活動" 下拉選單變化
    function handleEventSelectChange() {
        if (eventSelect.value === '--new--') {
            showEventInputUI();
            editEventBtn.style.display = 'none'; // 隱藏 "編輯" 按鈕
        } else {
            // 選擇了已存在的活動
            showEventSelectUI(); // 確保顯示的是下拉選單
            editEventBtn.style.display = 'block'; // (新) 顯示 "編輯" 按鈕
        }
    }
    eventSelect.addEventListener('change', handleEventSelectChange);

    // (新) 監聽 "編輯活動" 按鈕
    editEventBtn.addEventListener('click', enterEditMode);


    // (新) 監聽 "取消新增活動" 按鈕
    cancelNewEvent.addEventListener('click', () => {
        showEventSelectUI();
        if (eventSelect.options.length > 0) {
            eventSelect.value = eventSelect.options[0].value; // 選回 "-- 新增活動 --"
        }
        editEventBtn.style.display = 'none'; // 隱藏 "編輯" 按鈕
    });

    // (新) 監聽 "帳號" 下拉選單變化
    function handleAccountSelectChange() {
        if (accountSelect.value === '--new--') {
            showAccountInputUI();
        } else {
            showAccountSelectUI(); // 確保顯示的是下拉選單
            // (新) 如果在編輯模式下，觸發載入
            if (editMode) {
                loadRecordForEdit(accountSelect.value);
            }
        }
    }
    accountSelect.addEventListener('change', handleAccountSelectChange);


    // (新) 監聽 "取消新增帳號" 按鈕
    cancelNewAccount.addEventListener('click', () => {
        showAccountSelectUI();
        // 重置下拉選單的值
        // (新) 根據是否在編輯模式，決定預設值
        if (editMode) {
            accountSelect.value = '--batch--';
        } else {
            const firstAccount = preferredAccountOrder[0];
            if ([...accountSelect.options].some(opt => opt.value === firstAccount)) {
                accountSelect.value = firstAccount;
            } else if (accountSelect.options.length > 1) { // [0] 是 "新增"
                accountSelect.value = accountSelect.options[1].value;
            }
        }
    });

    // 處理年份變更的函式
    function handleYearChange() {
        updateMonthFilter();
        renderAll();
    }

    loadRecords();
    renderAll();
    resetFormState();
});