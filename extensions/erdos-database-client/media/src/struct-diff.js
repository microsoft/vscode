/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

(function() {
    const vscode = acquireVsCodeApi();
    
    // State
    let initData = { nodes: [], databaseList: {} };
    let option = { 
        from: { connection: null, database: null, db: null }, 
        to: { connection: null, database: null, db: null } 
    };
    let compareResult = { sqlList: null };
    let resultsGrid = null;
    let isLoading = false;
    
    // DOM elements
    const fromConnection = document.getElementById('fromConnection');
    const fromDatabase = document.getElementById('fromDatabase');
    const toConnection = document.getElementById('toConnection');
    const toDatabase = document.getElementById('toDatabase');
    const compareBtn = document.getElementById('compareBtn');
    const comparisonResults = document.getElementById('comparisonResults');
    const syncBtn = document.getElementById('syncBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const selectNoneBtn = document.getElementById('selectNoneBtn');
    const resultsGridEl = document.getElementById('resultsGrid');
    const loadingPanel = document.getElementById('loadingPanel');
    const errorPanel = document.getElementById('errorPanel');
    const errorText = document.getElementById('errorText');
    
    // Event listeners
    fromConnection.addEventListener('change', clearFromDatabase);
    fromDatabase.addEventListener('change', (e) => changeActive(e.target.value, true));
    toConnection.addEventListener('change', clearToDatabase);
    toDatabase.addEventListener('change', (e) => changeActive(e.target.value, false));
    compareBtn.addEventListener('click', startCompare);
    syncBtn.addEventListener('click', confirmSync);
    selectAllBtn.addEventListener('click', selectAll);
    selectNoneBtn.addEventListener('click', selectNone);
    
    // Message handler
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'structDiffData':
                loadStructDiffData(message.data);
                break;
            case 'compareResult':
                loadCompareResult(message.result);
                break;
            case 'syncSuccess':
                showSuccess('Sync completed successfully');
                hideLoading();
                break;
            case 'error':
                showError(message.message);
                hideLoading();
                break;
        }
    });
    
    function loadStructDiffData(data) {
        initData = data;
        populateConnectionOptions();
    }
    
    function populateConnectionOptions() {
        // Clear existing options
        fromConnection.innerHTML = '<option value="">Select connection...</option>';
        toConnection.innerHTML = '<option value="">Select connection...</option>';
        
        // Add connection options
        initData.nodes.forEach(node => {
            const fromOption = document.createElement('option');
            fromOption.value = node.uid;
            fromOption.textContent = node.label;
            fromConnection.appendChild(fromOption);
            
            const toOption = document.createElement('option');
            toOption.value = node.uid;
            toOption.textContent = node.label;
            toConnection.appendChild(toOption);
        });
    }
    
    function clearFromDatabase() {
        option.from.db = null;
        option.from.database = null;
        populateDatabaseOptions(fromConnection.value, fromDatabase);
    }
    
    function clearToDatabase() {
        option.to.db = null;
        option.to.database = null;
        populateDatabaseOptions(toConnection.value, toDatabase);
    }
    
    function populateDatabaseOptions(connectionId, databaseSelect) {
        databaseSelect.innerHTML = '<option value="">Select database...</option>';
        
        if (connectionId && initData.databaseList[connectionId]) {
            initData.databaseList[connectionId].forEach(db => {
                const option = document.createElement('option');
                option.value = db.label;
                option.textContent = db.label;
                databaseSelect.appendChild(option);
            });
        }
    }
    
    function changeActive(dbName, isFrom) {
        const key = isFrom ? option.from.connection : option.to.connection;
        const connectionId = isFrom ? fromConnection.value : toConnection.value;
        
        if (connectionId && initData.databaseList[connectionId]) {
            for (const db of initData.databaseList[connectionId]) {
                if (db.label === dbName) {
                    if (isFrom) {
                        option.from.db = db;
                        option.from.database = dbName;
                        option.from.connection = connectionId;
                    } else {
                        option.to.db = db;
                        option.to.database = dbName;
                        option.to.connection = connectionId;
                    }
                    break;
                }
            }
        }
    }
    
    function startCompare() {
        if (!option.from.connection || !option.from.database || !option.to.connection || !option.to.database) {
            showError('Please select both source and target connections and databases');
            return;
        }
        
        showLoading();
        hideError();
        
        vscode.postMessage({
            type: 'start',
            option: option
        });
    }
    
    function loadCompareResult(result) {
        compareResult = result;
        hideLoading();
        
        if (!result.sqlList || result.sqlList.length === 0) {
            showError('No differences found between the selected schemas');
            return;
        }
        
        renderResults();
        comparisonResults.classList.remove('hidden');
    }
    
    function renderResults() {
        if (!resultsGrid && resultsGridEl) {
            resultsGrid = new DataGrid(resultsGridEl, {
                sortable: true,
                contextMenu: false,
                selectable: true
            });
        }
        
        if (resultsGrid && compareResult.sqlList) {
            const columns = [
                { field: 'type', title: 'Type', width: 80 },
                { field: 'sql', title: 'SQL Statement' }
            ];
            
            // Add selection state to each row
            const dataWithSelection = compareResult.sqlList.map(item => ({
                ...item,
                selected: true // Default to selected
            }));
            
            resultsGrid.setData(dataWithSelection, columns);
        }
    }
    
    function confirmSync() {
        if (!resultsGrid) {
            showError('No comparison results available');
            return;
        }
        
        const selectedRows = resultsGrid.getSelectedRows();
        if (!selectedRows || selectedRows.length === 0) {
            showError('Need to select at least one SQL statement!');
            return;
        }
        
        showLoading();
        
        vscode.postMessage({
            type: 'sync',
            sqlList: selectedRows,
            option: option
        });
    }
    
    function selectAll() {
        if (resultsGrid) {
            resultsGrid.selectAll();
        }
    }
    
    function selectNone() {
        if (resultsGrid) {
            resultsGrid.selectNone();
        }
    }
    
    function showLoading() {
        isLoading = true;
        loadingPanel.classList.remove('hidden');
        compareBtn.disabled = true;
        syncBtn.disabled = true;
    }
    
    function hideLoading() {
        isLoading = false;
        loadingPanel.classList.add('hidden');
        compareBtn.disabled = false;
        syncBtn.disabled = false;
    }
    
    function showError(message) {
        errorText.textContent = message;
        errorPanel.classList.remove('hidden');
    }
    
    function hideError() {
        errorPanel.classList.add('hidden');
    }
    
    function showSuccess(message) {
        // Show success notification
        const notification = document.createElement('div');
        notification.className = 'success-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--vscode-inputValidation-infoBackground);
            color: var(--vscode-inputValidation-infoForeground);
            border: 1px solid var(--vscode-inputValidation-infoBorder);
            padding: 12px 16px;
            border-radius: 4px;
            z-index: 1001;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        notification.innerHTML = `<i class="codicon codicon-check"></i> ${message}`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
        
        // Hide results after successful sync
        comparisonResults.classList.add('hidden');
        compareResult = { sqlList: null };
    }
    
    // Initialize
    vscode.postMessage({ type: 'init' });
})();
