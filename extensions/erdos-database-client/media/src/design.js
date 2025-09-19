/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

(function() {
    const vscode = acquireVsCodeApi();
    
    // State
    let designData = {
        table: '',
        columns: [],
        indexes: [],
        comment: '',
        dbType: ''
    };
    let columnsGrid = null;
    let indexesGrid = null;
    let isEditMode = false;
    let currentEditColumn = null;
    
    // DOM elements
    const tableNameInput = document.getElementById('tableNameInput');
    const tableComment = document.getElementById('tableComment');
    const updateTableBtn = document.getElementById('updateTableBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    // Column elements
    const addColumnBtn = document.getElementById('addColumnBtn');
    const columnsGridEl = document.getElementById('columnsGrid');
    const columnDialog = document.getElementById('columnDialog');
    const columnDialogTitle = document.getElementById('columnDialogTitle');
    const columnName = document.getElementById('columnName');
    const columnType = document.getElementById('columnType');
    const columnComment = document.getElementById('columnComment');
    const columnNotNull = document.getElementById('columnNotNull');
    const saveColumnBtn = document.getElementById('saveColumnBtn');
    const cancelColumnBtn = document.getElementById('cancelColumnBtn');
    
    // Index elements
    const addIndexBtn = document.getElementById('addIndexBtn');
    const indexesGridEl = document.getElementById('indexesGrid');
    const indexDialog = document.getElementById('indexDialog');
    const indexColumn = document.getElementById('indexColumn');
    const indexType = document.getElementById('indexType');
    const saveIndexBtn = document.getElementById('saveIndexBtn');
    const cancelIndexBtn = document.getElementById('cancelIndexBtn');
    
    // Event listeners
    updateTableBtn.addEventListener('click', updateTable);
    refreshBtn.addEventListener('click', refresh);
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });
    
    addColumnBtn.addEventListener('click', () => openColumnDialog());
    saveColumnBtn.addEventListener('click', saveColumn);
    cancelColumnBtn.addEventListener('click', closeColumnDialog);
    
    addIndexBtn.addEventListener('click', () => openIndexDialog());
    saveIndexBtn.addEventListener('click', saveIndex);
    cancelIndexBtn.addEventListener('click', closeIndexDialog);
    
    // Message handler
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'designData':
                loadDesignData(message.data);
                break;
            case 'success':
                showMessage(message.message, 'success');
                refresh();
                break;
            case 'error':
                showMessage(message.message, 'error');
                break;
        }
    });
    
    function loadDesignData(data) {
        designData = data;
        
        // Update table info
        tableNameInput.value = data.table || '';
        tableComment.value = data.comment || '';
        
        // Update columns grid
        updateColumnsGrid();
        
        // Update indexes grid
        updateIndexesGrid();
        
        // Update index column options
        updateIndexColumnOptions();
    }
    
    function updateColumnsGrid() {
        if (!columnsGrid) {
            columnsGrid = new DataGrid(columnsGridEl, {
                sortable: true,
                contextMenu: true,
                onContextAction: handleColumnContextAction
            });
        }
        
        const columns = [
            { field: 'name', title: 'Name' },
            { field: 'type', title: 'Type' },
            { field: 'comment', title: 'Comment' },
            { field: 'maxLength', title: 'Length' },
            { field: 'defaultValue', title: 'Default' },
            { field: 'isPrimary', title: 'Primary Key', render: (value) => value ? '✓' : '' },
            { field: 'isUnique', title: 'Unique', render: (value) => value ? '✓' : '' },
            { field: 'nullable', title: 'Not Null', render: (value) => value === 'NO' ? '✓' : '' },
            { field: 'isAutoIncrement', title: 'Auto Increment', render: (value) => value ? '✓' : '' }
        ];
        
        columnsGrid.setData(designData.columns || [], columns);
    }
    
    function updateIndexesGrid() {
        if (!indexesGrid) {
            indexesGrid = new DataGrid(indexesGridEl, {
                sortable: true,
                contextMenu: true,
                onContextAction: handleIndexContextAction
            });
        }
        
        const columns = [
            { field: 'index_name', title: 'Index Name' },
            { field: 'column_name', title: 'Column Name' },
            { field: 'non_unique', title: 'Non Unique', render: (value) => value ? 'Yes' : 'No' },
            { field: 'index_type', title: 'Index Type' }
        ];
        
        indexesGrid.setData(designData.indexes || [], columns);
    }
    
    function updateIndexColumnOptions() {
        indexColumn.innerHTML = '';
        
        (designData.columns || []).forEach(column => {
            const option = document.createElement('option');
            option.value = column.name;
            option.textContent = column.name;
            indexColumn.appendChild(option);
        });
    }
    
    function switchTab(tabName) {
        // Update tab buttons
        tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // Update tab panels
        tabPanels.forEach(panel => {
            panel.style.display = panel.id === `${tabName}Panel` ? 'block' : 'none';
        });
    }
    
    function updateTable() {
        const newTableName = tableNameInput.value.trim();
        const newComment = tableComment.value.trim();
        
        if (!newTableName) {
            showMessage('Table name is required', 'error');
            return;
        }
        
        vscode.postMessage({
            type: 'updateTable',
            newTableName,
            newComment
        });
    }
    
    function refresh() {
        vscode.postMessage({
            type: 'refresh'
        });
    }
    
    function openColumnDialog(column = null) {
        isEditMode = column !== null;
        currentEditColumn = column;
        
        columnDialogTitle.textContent = isEditMode ? 'Edit Column' : 'Add Column';
        
        if (isEditMode) {
            columnName.value = column.name || '';
            columnType.value = column.type || '';
            columnComment.value = column.comment || '';
            columnNotNull.checked = column.nullable === 'NO';
        } else {
            columnName.value = '';
            columnType.value = '';
            columnComment.value = '';
            columnNotNull.checked = false;
        }
        
        columnDialog.style.display = 'block';
        columnName.focus();
    }
    
    function closeColumnDialog() {
        columnDialog.style.display = 'none';
        isEditMode = false;
        currentEditColumn = null;
    }
    
    function saveColumn() {
        const name = columnName.value.trim();
        const type = columnType.value.trim();
        const comment = columnComment.value.trim();
        const notNull = columnNotNull.checked;
        
        if (!name || !type) {
            showMessage('Column name and type are required', 'error');
            return;
        }
        
        const columnData = {
            name,
            type,
            comment,
            nullable: notNull ? 'NO' : 'YES'
        };
        
        if (isEditMode) {
            columnData.originalName = currentEditColumn.name;
            vscode.postMessage({
                type: 'updateColumn',
                column: columnData
            });
        } else {
            vscode.postMessage({
                type: 'addColumn',
                column: columnData
            });
        }
        
        closeColumnDialog();
    }
    
    function openIndexDialog() {
        indexDialog.style.display = 'block';
        indexColumn.focus();
    }
    
    function closeIndexDialog() {
        indexDialog.style.display = 'none';
        indexColumn.value = '';
        indexType.value = 'UNIQUE';
    }
    
    function saveIndex() {
        const column = indexColumn.value;
        const type = indexType.value;
        
        if (!column) {
            showMessage('Column selection is required', 'error');
            return;
        }
        
        vscode.postMessage({
            type: 'addIndex',
            index: { column, type }
        });
        
        closeIndexDialog();
    }
    
    function handleColumnContextAction(data) {
        const { action, row } = data;
        const column = designData.columns[parseInt(row)];
        
        switch (action) {
            case 'edit':
                openColumnDialog(column);
                break;
            case 'delete':
                if (confirm(`Are you sure you want to delete column "${column.name}"?`)) {
                    vscode.postMessage({
                        type: 'deleteColumn',
                        columnName: column.name
                    });
                }
                break;
        }
    }
    
    function handleIndexContextAction(data) {
        const { action, row } = data;
        const index = designData.indexes[parseInt(row)];
        
        switch (action) {
            case 'delete':
                if (confirm(`Are you sure you want to delete index "${index.index_name}"?`)) {
                    vscode.postMessage({
                        type: 'deleteIndex',
                        indexName: index.index_name
                    });
                }
                break;
        }
    }
    
    function showMessage(message, type) {
        // Create or update status message
        let statusEl = document.querySelector('.status-message');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.className = 'status-message';
            document.body.appendChild(statusEl);
        }
        
        statusEl.textContent = message;
        statusEl.className = `status-message status-${type}`;
        statusEl.style.display = 'block';
        
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 3000);
    }
    
    // Initialize
    vscode.postMessage({ type: 'refresh' });
})();

