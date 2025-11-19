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
    const dateInput = document.getElementById('date');
    const pullsInput = document.getElementById('pulls');
    const notesInput = document.getElementById('notes');
    const submitBtnText = document.getElementById('submit-btn-text');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const accountFilter = document.getElementById('account-filter');
    const yearFilter = document.getElementById('year-filter');
    const monthFilter = document.getElementById('month-filter');
    const historyTableTitle = document.getElementById('history-table-title');
    const clearButton = document.getElementById('clear-data');
    const exportButton = document.getElementById('export-data');
    const importButton = document.getElementById('import-data');
    const importFileInput = document.getElementById('import-file-input');

    let records = [];
    let masterEvents = []; 
    let globalEditMode = false;
    let editMode = false;
    let editEventName = null; 
    let isAddingNewAccount = false;
    let isAddingNewEvent = false;
    const preferredAccountOrder = ['羽入', '梨花', '沙都子'];
    const sampleData = [];

    async function loadMasterEvents() {
        try {
            const response = await fetch('events.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (Array.isArray(data)) {
                masterEvents = data;
                updateEventFormSelect(records); 
            }
        } catch (error) { console.warn('無法載入 events.json:', error); }
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!globalEditMode) { showToast('請先點擊右下角的 "進入編輯模式"', 'info'); return; }
        const date = dateInput.value;
        const tag = tagSelect.value;
        const pulls = parseInt(pullsInput.value, 10);
        const notes = notesInput.value;
        let event;
        if (isAddingNewEvent || editMode) { event = eventInput.value.trim(); } else {
            event = eventSelect.value;
            if (event === '--new--') { showToast('請點擊"編輯"按鈕來輸入新活動名稱！', 'error'); return; }
        }
        let account;
        if (isAddingNewAccount) { account = accountInput.value.trim(); } else { account = accountSelect.value; }

        if (!date) { showToast('請選擇日期！', 'error'); return; }
        if (!event || event === '--new--') { showToast('請輸入或選擇有效的活動！', 'error'); return; }
        if (!account || account === '--new--') { showToast('請輸入或選擇有效的帳號！', 'error'); return; }
        if (account === '--batch--') {} else if (isNaN(pulls) || pulls < 0) { showToast('請輸入有效的抽數！', 'error'); return; }

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
        saveRecords();
        resetFormState();
        renderAll();
    });

    function saveRecords() { localStorage.setItem('gachaRecords', JSON.stringify(records)); }
    function loadRecords() {
        const data = localStorage.getItem('gachaRecords');
        if (data && JSON.parse(data).length > 0) { records = JSON.parse(data); } else { records = sampleData; saveRecords(); }
    }

    function renderAll() {
        const selectedAccount = accountFilter.value;
        const selectedYear = yearFilter.value;
        const selectedMonth = monthFilter.value;
        let filteredRecords = records;
        if (selectedAccount !== 'all') filteredRecords = filteredRecords.filter(record => record.account === selectedAccount);
        let dateFilterPrefix = '';
        if (selectedYear !== 'all') {
            dateFilterPrefix = selectedYear;
            if (selectedMonth !== 'all') dateFilterPrefix += '-' + selectedMonth;
        }
        if (dateFilterPrefix !== '') filteredRecords = filteredRecords.filter(r => r.date.startsWith(dateFilterPrefix));

        renderTable(filteredRecords, selectedAccount, selectedYear, selectedMonth);
        calculateStats(filteredRecords, selectedAccount);
        const sortedAccounts = getSortedAccountNames();
        updateEventFormSelect(filteredRecords); 
        updateAccountFilter(sortedAccounts);
        if (!editMode) updateAccountFormSelect(sortedAccounts); 
        updateYearFilter();
        updateMonthFilter();
    }

    function renderTable(filteredRecords, selectedAccount, selectedYear, selectedMonth) {
        tableBody.innerHTML = ''; 
        let title = selectedAccount === 'all' ? '歷史紀錄' : `${selectedAccount} 的歷史紀錄`;
        if (selectedYear !== 'all') title += ` (${selectedYear}${selectedMonth !== 'all' ? '-' + selectedMonth : ''})`;
        historyTableTitle.innerHTML = `<i class="bi bi-table"></i> ${title}`;

        const sortedRecords = [...filteredRecords].sort((a, b) => a.date.localeCompare(b.date));
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
        const sortedEvents = Object.entries(eventStats).sort(([, a], [, b]) => a.firstDate.localeCompare(b.firstDate));
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

    function getCleanEventName(event, date) {
        let displayEventName = event; const year = date.substring(0, 4); const monthStr = date.split('-')[1]; const monthNum = parseInt(monthStr, 10);
        const patterns = [`${year}-${monthStr}月`, `${year}-${monthNum}月`, `${year}年${monthStr}月`, `${year}年${monthNum}月`, `${year}/${monthStr}月`, `${year}/${monthNum}月`];
        for (const pattern of patterns) { if (displayEventName.startsWith(pattern)) { displayEventName = displayEventName.substring(pattern.length).trim(); break; } }
        return displayEventName || event;
    }

    function getCleanNotes(notes) {
        if (typeof notes !== 'string' || !notes) return '';
        return notes.replace(/^(\d+)\s*抽\s*/, '').replace(/^(\?\?|？？)\s*抽\s*/, '').trim();
    }

    function updateEventFormSelect(recordsToUse) {
        const currentEvent = eventSelect.value;
        const userEventNames = [...new Set(recordsToUse.map(r => r.event))];
        const selectedYear = yearFilter.value; const selectedMonth = monthFilter.value;
        let filteredMasterEvents = masterEvents;
        if (selectedYear !== 'all') {
            let prefix = selectedYear; if (selectedMonth !== 'all') prefix += '-' + selectedMonth;
            filteredMasterEvents = masterEvents.filter(e => e.date.startsWith(prefix));
        }
        const masterEventNames = filteredMasterEvents.map(e => e.event);
        const allEventNames = [...new Set([...userEventNames, ...masterEventNames])].sort((a, b) => b.localeCompare(a));
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

    function updateYearFilter() {
        const currentYear = yearFilter.value;
        const userYears = records.map(r => r.date.substring(0, 4));
        const masterYears = masterEvents.map(e => e.date.substring(0, 4));
        const allYears = [...new Set([...userYears, ...masterYears])].sort((a, b) => b.localeCompare(a));
        yearFilter.innerHTML = '<option value="all">全部年份</option>';
        allYears.forEach(year => { const option = document.createElement('option'); option.value = year; option.textContent = year; yearFilter.appendChild(option); });
        if ([...yearFilter.options].some(o => o.value === currentYear)) yearFilter.value = currentYear;
    }

    function updateMonthFilter() {
        const selectedYear = yearFilter.value; const currentMonth = monthFilter.value;
        if (selectedYear === 'all') { monthFilter.disabled = true; monthFilter.value = 'all'; monthFilter.innerHTML = '<option value="all">全部月份</option>'; }
        else {
            monthFilter.disabled = false; monthFilter.innerHTML = `<option value="all">全部月份 (${selectedYear})</option>`;
            for (let i = 1; i <= 12; i++) { const month = i.toString().padStart(2, '0'); const option = document.createElement('option'); option.value = month; option.textContent = `${i}月`; monthFilter.appendChild(option); }
            monthFilter.value = currentMonth;
        }
    }

    function updateAccountFormSelect(sortedAccounts, options = { isEditMode: false }) {
        const currentAccount = accountSelect.value; accountSelect.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const defaultOption = document.createElement('option');
        if (options.isEditMode) { defaultOption.value = '--batch--'; defaultOption.textContent = '-- 全部帳號 (僅編輯) --'; defaultOption.style.color = 'blue'; }
        else { defaultOption.value = '--new--'; defaultOption.textContent = '-- 新增帳號 --'; defaultOption.style.fontStyle = 'italic'; defaultOption.style.color = '#0d6efd'; }
        fragment.appendChild(defaultOption);
        sortedAccounts.forEach(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; fragment.appendChild(option); });
        accountSelect.appendChild(fragment);
        if (accountSelect.querySelector(`option[value="${currentAccount}"]`)) accountSelect.value = currentAccount;
    }

    tableBody.addEventListener('click', (e) => {
        const deleteButton = e.target.closest('.btn-danger');
        const editButton = e.target.closest('.btn-warning');
        if (deleteButton) {
            const idToDelete = parseInt(deleteButton.getAttribute('data-id'), 10);
            if (confirm('確定要刪除這筆紀錄嗎？')) { records = records.filter(record => record.id !== idToDelete); saveRecords(); renderAll(); resetFormState(); showToast('紀錄已刪除', 'success'); }
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
        togglePullFields(true); showEventSelectUI(); updateEventFormSelect(records); eventSelect.value = '--new--'; isAddingNewEvent = false;
        handleEventSelectChange(); showAccountSelectUI(); updateAccountFormSelect(getSortedAccountNames(), { isEditMode: false });
        if (accountSelect.options.length > 0) accountSelect.value = accountSelect.options[0].value;
    }

    function showToast(message, type = 'success') {
        toastMessage.textContent = message;
        toastMessage.style.backgroundColor = type === 'error' ? '#dc3545' : (type === 'info' ? '#0d6efd' : '#28a745');
        toastMessage.classList.add('show'); setTimeout(() => toastMessage.classList.remove('show'), 2500);
    }

    function showAccountSelectUI() { accountSelect.style.display = 'block'; accountInputGroup.style.display = 'none'; isAddingNewAccount = false; }
    function showAccountInputUI() { accountSelect.style.display = 'none'; accountInputGroup.style.display = 'block'; isAddingNewAccount = true; accountInput.value = ''; accountInput.focus(); }
    function showEventSelectUI() { eventSelect.style.display = 'block'; eventInputGroup.style.display = 'none'; isAddingNewEvent = false; }
    function showEventInputUI() { eventSelect.style.display = 'none'; eventInputGroup.style.display = 'block'; isAddingNewEvent = true; eventInput.value = ''; eventInput.focus(); }
    function togglePullFields(enabled) {
        pullsInput.disabled = !enabled; notesInput.disabled = !enabled;
        if (enabled) { pullsInput.classList.remove('field-disabled'); notesInput.classList.remove('field-disabled'); }
        else { pullsInput.classList.add('field-disabled'); notesInput.classList.add('field-disabled'); pullsInput.value = ''; notesInput.value = ''; }
    }

    clearButton.addEventListener('click', () => { if (confirm('警告：這將刪除所有儲存的抽卡紀錄！確定嗎？')) { records = []; saveRecords(); renderAll(); resetFormState(); showToast('所有資料已清除', 'error'); } });
    exportButton.addEventListener('click', () => {
        if (records.length === 0) { showToast('目前沒有資料可匯出', 'info'); return; }
        const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `gacha_records_${new Date().toISOString().split('T')[0]}.json`;
        a.click(); showToast('資料已匯出！', 'success');
    });
    importButton.addEventListener('click', () => { if (confirm('警告：匯入將覆蓋目前紀錄！')) importFileInput.click(); });
    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (Array.isArray(importedData)) { records = importedData; saveRecords(); renderAll(); showToast('資料已成功匯入！', 'success'); }
                else throw new Error('格式錯誤');
            } catch (err) { showToast('匯入失敗！檔案格式錯誤。', 'error'); }
            finally { importFileInput.value = null; }
        };
        reader.readAsText(file);
    });

    function enterAddMode() {
        editMode = false; submitBtnText.textContent = '儲存紀錄'; cancelEditBtn.style.display = 'inline-block'; editEventBtn.style.display = 'none';
        showEventInputUI(); eventInput.value = ''; dateInput.valueAsDate = new Date(); tagSelect.value = 'none'; togglePullFields(true); pullsInput.value = ''; notesInput.value = '';
        showAccountSelectUI(); updateAccountFormSelect(getSortedAccountNames(), { isEditMode: false }); accountSelect.value = '--new--'; showToast('請輸入新活動資訊', 'info');
    }
    function enterEditMode() {
        const eventName = eventSelect.value; if (eventName === '--new--' || !eventName) { enterAddMode(); return; }
        editMode = true; editEventName = eventName; submitBtnText.textContent = '更新紀錄'; cancelEditBtn.style.display = 'inline-block'; editEventBtn.style.display = 'none';
        showEventInputUI(); eventInput.value = eventName; updateAccountFormSelect(getSortedAccountNames(), { isEditMode: true });
        accountSelect.value = '--batch--'; loadRecordForEdit('--batch--'); showToast('進入編輯模式', 'info');
    }
    function loadRecordForEdit(accountName) {
        if (!editMode) return;
        let recordToLoad = null;
        if (accountName === '--batch--') {
            togglePullFields(false);
            recordToLoad = records.find(r => r.event === editEventName) || masterEvents.find(e => e.event === editEventName && { date: e.date, tag: e.tag, pulls: '', notes: '' });
        } else {
            togglePullFields(true);
            recordToLoad = records.find(r => r.event === editEventName && r.account === accountName) || masterEvents.find(e => e.event === editEventName && { date: e.date, tag: e.tag, pulls: '', notes: '' });
        }
        if (recordToLoad) { dateInput.value = recordToLoad.date || ''; tagSelect.value = recordToLoad.tag || 'none'; if (accountName !== '--batch--') { pullsInput.value = recordToLoad.pulls || ''; notesInput.value = recordToLoad.notes || ''; } }
        else { pullsInput.value = ''; notesInput.value = ''; }
    }

    modeToggleBtn.addEventListener('click', () => {
        globalEditMode = !globalEditMode;
        document.body.classList.toggle('edit-mode-active', globalEditMode);
        gachaFieldset.disabled = !globalEditMode;
        modeToggleBtn.classList.toggle('btn-outline-primary', !globalEditMode); modeToggleBtn.classList.toggle('btn-primary', globalEditMode);
        modeToggleBtn.innerHTML = globalEditMode ? '<i class="bi bi-check-circle"></i> 完成編輯' : '<i class="bi bi-eye"></i> 檢視模式';
        resetFormState(); showToast(globalEditMode ? '已進入編輯模式' : '已退出編輯模式', 'info');
    });

    accountFilter.addEventListener('change', renderAll); yearFilter.addEventListener('change', handleYearChange); monthFilter.addEventListener('change', renderAll);
    function handleEventSelectChange() {
        const selectedEventName = eventSelect.value;
        editEventBtn.style.display = (selectedEventName === '--new--' || !selectedEventName) ? 'block' : 'block';
        if (selectedEventName !== '--new--') { const m = masterEvents.find(e => e.event === selectedEventName); if (m) { dateInput.value = m.date; tagSelect.value = m.tag; } }
    }
    eventSelect.addEventListener('change', handleEventSelectChange);
    editEventBtn.addEventListener('click', () => eventSelect.value === '--new--' ? enterAddMode() : enterEditMode());
    cancelNewEvent.addEventListener('click', resetFormState);
    accountSelect.addEventListener('change', () => {
        if (accountSelect.value === '--new--') showAccountInputUI();
        else { showAccountSelectUI(); if (editMode) loadRecordForEdit(accountSelect.value); }
    });
    cancelNewAccount.addEventListener('click', () => { showAccountSelectUI(); accountSelect.value = editMode ? '--batch--' : '--new--'; });
    function handleYearChange() { updateMonthFilter(); renderAll(); }

    async function init() { await loadMasterEvents(); loadRecords(); renderAll(); resetFormState(); gachaFieldset.disabled = true; }
    init();
});