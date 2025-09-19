/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

(function() {
    const vscode = acquireVsCodeApi();
    
    // State management
    let state = {
        result: {
            data: [],
            fields: [],
            dbType: "",
            costTime: 0,
            sql: "",
            primaryKey: null,
            columnList: null,
            primaryKeyList: null,
            database: null,
            table: null,
            tableCount: null,
            transId: null
        },
        page: {
            pageNum: 1,
            pageSize: -1,
            total: null
        },
        table: {
            search: "",
            loading: true,
            widthItem: {}
        },
        toolbar: {
            sql: null,
            filter: {},
            showColumns: []
        },
        editDialog: {
            visible: false,
            loading: false,
            mode: 'insert', // 'insert', 'update', 'copy'
            originModel: {},
            editModel: {},
            columnList: [],
            primaryKey: null,
            primaryKeyList: [],
            dbType: null,
            database: null,
            table: null
        },
        exportOption: {
            visible: false
        },
        info: {
            sql: null,
            message: null,
            error: false,
            needRefresh: true
        },
        update: {
            editList: {},
            lock: false
        },
        remainHeight: 0,
        showFullBtn: false
    };

    // DOM elements
    let elements = {};
    
    // Initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        initializeElements();
        setupEventListeners();
        calculateHeight();
        
        // Send init message to VS Code
        vscode.postMessage({ type: 'init' });
    });

    function initializeElements() {
        elements = {
            queryInput: document.getElementById('queryInput'),
            executeBtn: document.getElementById('executeBtn'),
            connectionInfo: document.getElementById('connectionInfo'),
            resultsInfoToolbar: document.getElementById('resultsInfoToolbar'),
            resultsContent: document.getElementById('resultsContent'),
            insertBtn: document.getElementById('insertBtn'),
            deleteBtn: document.getElementById('deleteBtn'),
            exportBtn: document.getElementById('exportBtn'),
            searchInput: document.getElementById('searchInput'),
            // Breadcrumb elements
            breadcrumbPath: document.getElementById('breadcrumbPath'),
            connectionBreadcrumb: document.getElementById('connectionBreadcrumb'),
            databaseBreadcrumb: document.getElementById('databaseBreadcrumb'),
            tableBreadcrumb: document.getElementById('tableBreadcrumb'),
            connectionName: document.getElementById('connectionName'),
            databaseName: document.getElementById('databaseName'),
            tableName: document.getElementById('tableName'),
            paginationInfo: document.getElementById('paginationInfo'),
            costTime: document.getElementById('costTime'),
            dataTable: document.getElementById('dataTable'),
            messagePanel: document.getElementById('messagePanel'),
            prevPageBtn: document.getElementById('prevPageBtn'),
            nextPageBtn: document.getElementById('nextPageBtn'),
            pageNumSpan: document.getElementById('pageNum'),
            totalRowsSpan: document.getElementById('totalRows'),
            // Column selector elements
            columnSelectorDialog: document.getElementById('columnSelectorDialog'),
            columnCheckboxes: document.getElementById('columnCheckboxes'),
            selectAllColumnsBtn: document.getElementById('selectAllColumnsBtn'),
            deselectAllColumnsBtn: document.getElementById('deselectAllColumnsBtn'),
            closeColumnSelectorBtn: document.getElementById('closeColumnSelectorBtn'),
            // Export dialog elements
            exportDialog: document.getElementById('exportDialog'),
            exportType: document.getElementById('exportType'),
            removeLimit: document.getElementById('removeLimit'),
            confirmExportBtn: document.getElementById('confirmExportBtn'),
            cancelExportBtn: document.getElementById('cancelExportBtn'),
            // Edit dialog elements
            editDialog: document.getElementById('editDialog'),
            editDialogTitle: document.getElementById('editDialogTitle'),
            editDialogBody: document.getElementById('editDialogBody'),
            saveRowBtn: document.getElementById('saveRowBtn'),
            cancelEditBtn: document.getElementById('cancelEditBtn')
        };
    }

    function setupEventListeners() {
        // Query input - Ctrl+Enter to execute and auto-resize
        if (elements.queryInput) {
            elements.queryInput.addEventListener('keydown', function(event) {
                if (event.ctrlKey && event.key === 'Enter') {
                    executeQuery();
                    event.preventDefault();
                }
            });
            
            // Auto-resize textarea
            elements.queryInput.addEventListener('input', autoResizeTextarea);
            elements.queryInput.addEventListener('paste', function() {
                setTimeout(autoResizeTextarea, 0);
            });
            
            // Initial resize
            autoResizeTextarea();
        }

        // Toolbar buttons
        if (elements.executeBtn) {
            elements.executeBtn.addEventListener('click', executeQuery);
        }
        
        if (elements.insertBtn) {
            elements.insertBtn.addEventListener('click', function() {
                openInsert();
            });
        }
        
        if (elements.deleteBtn) {
            elements.deleteBtn.addEventListener('click', deleteSelected);
        }
        
        if (elements.exportBtn) {
            elements.exportBtn.addEventListener('click', function() {
                showExportDialog();
            });
        }

        // Search functionality
        if (elements.searchInput) {
            elements.searchInput.addEventListener('input', function() {
                state.table.search = this.value;
                filterAndRenderTable();
            });
        }

        // Pagination
        if (elements.prevPageBtn) {
            elements.prevPageBtn.addEventListener('click', function() {
                changePage(-1);
            });
        }
        
        if (elements.nextPageBtn) {
            elements.nextPageBtn.addEventListener('click', function() {
                changePage(1);
            });
        }

        // Column selector functionality
        if (elements.selectAllColumnsBtn) {
            elements.selectAllColumnsBtn.addEventListener('click', selectAllColumns);
        }
        if (elements.deselectAllColumnsBtn) {
            elements.deselectAllColumnsBtn.addEventListener('click', deselectAllColumns);
        }
        if (elements.closeColumnSelectorBtn) {
            elements.closeColumnSelectorBtn.addEventListener('click', closeColumnSelector);
        }

        // Export dialog functionality
        if (elements.confirmExportBtn) {
            elements.confirmExportBtn.addEventListener('click', confirmExport);
        }
        if (elements.cancelExportBtn) {
            elements.cancelExportBtn.addEventListener('click', closeExportDialog);
        }

        // Edit dialog functionality
        if (elements.saveRowBtn) {
            elements.saveRowBtn.addEventListener('click', saveEditedRow);
        }
        if (elements.cancelEditBtn) {
            elements.cancelEditBtn.addEventListener('click', closeEditDialog);
        }

        // Window resize
        window.addEventListener('resize', calculateHeight);

        // Copy functionality
        window.addEventListener('keyup', function(event) {
            if (event.key === 'c' && event.ctrlKey) {
                document.execCommand('copy');
            }
        });

        // Save functionality - Ctrl+S or Enter in edit mode
        window.addEventListener('keypress', function(event) {
            if ((event.code === 'Enter' && event.target.classList.contains('edit-column')) ||
                (event.ctrlKey && event.code === 'KeyS')) {
                save();
                event.stopPropagation();
                event.preventDefault();
            }
        });
    }

    function calculateHeight() {
        state.remainHeight = window.innerHeight - 90;
        state.showFullBtn = window.outerWidth / window.innerWidth >= 2;
        
        if (elements.dataTable) {
            elements.dataTable.style.height = state.remainHeight + 'px';
        }
    }

    function executeQuery() {
        if (!elements.queryInput || !elements.queryInput.value.trim()) return;
        
        const sql = elements.queryInput.value.trim();
        state.info.message = false;
        state.table.loading = true;
        
        vscode.postMessage({
            type: 'execute',
            sql: sql
        });
        
        showLoading(true);
    }

    function changePage(direction, jumpTo = null) {
        const pageNum = jumpTo || (state.page.pageNum + direction);
        
        vscode.postMessage({
            type: 'next',
            sql: state.result.sql,
            pageNum: pageNum,
            pageSize: state.page.pageSize
        });
        
        state.table.loading = true;
        showLoading(true);
    }

    function deleteSelected() {
        const selectedRows = getSelectedRows();
        if (!selectedRows || selectedRows.length === 0) {
            showMessage('You need to select at least one row of data.', 'warning');
            return;
        }

        if (confirm('Are you sure you want to delete this data?')) {
            const checkboxRecords = selectedRows
                .filter(row => row[state.result.primaryKey] != null)
                .map(row => wrapQuote(
                    getTypeByColumn(state.result.primaryKey),
                    row[state.result.primaryKey]
                ));

            let deleteSql = null;
            
            if (state.result.dbType === 'ElasticSearch') {
                deleteSql = checkboxRecords.length > 1
                    ? `POST /_bulk\n${checkboxRecords
                        .map(c => `{ "delete" : { "_index" : "${state.result.table}", "_id" : "${c}" } }`)
                        .join('\n')}`
                    : `DELETE /${state.result.table}/_doc/${checkboxRecords[0]}`;
            } else if (state.result.dbType === 'MongoDB') {
                deleteSql = `db('${state.result.database}').collection("${state.result.table}")
                    .deleteMany({_id:{$in:[${checkboxRecords.join(',')}]}})`;
            } else {
                const table = wrapByDb(state.result.table, state.result.dbType);
                deleteSql = checkboxRecords.length > 1
                    ? `DELETE FROM ${table} WHERE ${state.result.primaryKey} in (${checkboxRecords.join(',')})`
                    : `DELETE FROM ${table} WHERE ${state.result.primaryKey}=${checkboxRecords[0]}`;
            }
            
            executeCustomQuery(deleteSql);
        }
    }

    function executeCustomQuery(sql) {
        vscode.postMessage({
            type: 'execute',
            sql: sql
        });
        state.table.loading = true;
        showLoading(true);
    }

    function showExportDialog() {
        // Reset dialog state
        if (elements.exportType) {
            elements.exportType.value = 'xlsx'; // Default to xlsx like Vue
        }
        if (elements.removeLimit) {
            elements.removeLimit.checked = true; // Default to true like Vue
        }
        
        // Show the dialog
        if (elements.exportDialog) {
            elements.exportDialog.style.display = 'block';
        }
    }

    function closeExportDialog() {
        if (elements.exportDialog) {
            elements.exportDialog.style.display = 'none';
        }
    }

    function confirmExport() {
        const exportType = elements.exportType ? elements.exportType.value : 'xlsx';
        const withOutLimit = elements.removeLimit ? elements.removeLimit.checked : true;
        
        // Show loading state like Vue
        if (elements.confirmExportBtn) {
            elements.confirmExportBtn.textContent = 'Exporting...';
            elements.confirmExportBtn.disabled = true;
        }
        
        vscode.postMessage({
            type: 'export',
            option: {
                type: exportType,
                withOutLimit: withOutLimit,
                sql: state.result.sql,
                table: state.result.table
            }
        });
        
        // Close dialog after sending message
        closeExportDialog();
        
        // Reset button state after a delay
        setTimeout(() => {
            if (elements.confirmExportBtn) {
                elements.confirmExportBtn.textContent = 'Export';
                elements.confirmExportBtn.disabled = false;
            }
        }, 2000);
    }

    function save() {
        if (Object.keys(state.update.editList).length === 0 && state.update.lock) {
            return;
        }
        
        state.update.lock = true;
        let sql = "";
        
        for (const index in state.update.editList) {
            const element = state.update.editList[index];
            sql += buildUpdateSql(element, state.result.data[index]);
        }
        
        if (sql) {
            vscode.postMessage({
                type: 'saveModify',
                sql: sql
            });
        }
    }

    function buildUpdateSql(newRow, originalRow) {
        // Build UPDATE SQL based on changes
        const updates = [];
        for (const key in newRow) {
            if (newRow[key] !== originalRow[key]) {
                updates.push(`${key} = ${wrapQuote(getTypeByColumn(key), newRow[key])}`);
            }
        }
        
        if (updates.length === 0) return '';
        
        const table = wrapByDb(state.result.table, state.result.dbType);
        const primaryKeyValue = wrapQuote(
            getTypeByColumn(state.result.primaryKey),
            originalRow[state.result.primaryKey]
        );
        
        return `UPDATE ${table} SET ${updates.join(', ')} WHERE ${state.result.primaryKey} = ${primaryKeyValue};\n`;
    }

    function renderTable() {
        if (!elements.dataTable || !state.result.data) {
            return;
        }

        const filteredData = filterData();
        let html = '<table class="results-table"><thead><tr>';
        
        // Index/Row number column (clickable for selection)
        html += `<th class="index-col">
            <span>#</span>
        </th>`;
        
        // Data columns with enhanced headers (Row/Header.vue functionality)
        if (state.result.fields) {
            const visibleFields = state.result.fields
                .filter(field => state.toolbar.showColumns.includes(field.name.toLowerCase()));
            
            visibleFields.forEach((field, index) => {
                    const columnInfo = state.editDialog.columnList[index] || field;
                    const isRequired = columnInfo.nullable !== 'YES' ? '<span class="required-indicator">*</span>' : '';
                    const tooltip = getColumnTooltip(columnInfo);
                    
                    html += `<th class="sortable column-header" data-field="${field.name}" title="${tooltip}">
                        <div class="column-header-content">
                            ${isRequired}
                            <span class="column-name">${field.name}</span><br>
                            <span class="column-type">${field.type || columnInfo.type || ''}</span>
                        </div>
                    </th>`;
                });
        }
        
        html += '</tr></thead><tbody>';
        
        // Data rows
        filteredData.forEach((row, index) => {
            if (row.isFilter) return; // Skip filter row
            
            html += `<tr data-index="${index}" ondblclick="editRow(${index})">`;
            html += `<td class="row-number-cell" onclick="toggleRowSelection(${index})" title="Click to select row">${index + 1}</td>`;
            
            if (state.result.fields) {
                state.result.fields
                    .filter(field => state.toolbar.showColumns.includes(field.name.toLowerCase()))
                    .forEach(field => {
                        const value = row[field.name];
                        const isEditable = state.result.primaryKey && state.result.tableCount === 1;
                        const cellContent = formatCellValue(value, field, state.result.dbType);
                        
                        html += `<td class="data-cell ${isEditable ? 'editable-cell' : ''}" 
                                     data-field="${field.name}" 
                                     data-row-index="${index}"
                                     ${isEditable ? 'contenteditable="true"' : ''}
                                     onblur="${isEditable ? 'handleCellEdit(this)' : ''}"
                                     >${cellContent}</td>`;
                    });
            }
            
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        elements.dataTable.innerHTML = html;
        
        // Add event listeners for sorting and selection
        setupTableEventListeners();
        
        // Add column selector to toolbar
        addColumnSelectorToToolbar();
        
        // Re-apply selection styling to previously selected rows
        selectedRowIndices.forEach(index => {
            const row = document.querySelector(`tr[data-index="${index}"]`);
            if (row) {
                row.classList.add('selected-row');
            }
        });
        
        updatePaginationInfo();
    }

    // Track selected rows by index
    let selectedRowIndices = new Set();
    
    function setupTableEventListeners() {
        // Sortable headers
        document.querySelectorAll('.sortable').forEach(header => {
            header.addEventListener('click', function() {
                const field = this.dataset.field;
                sortByField(field);
            });
        });
    }
    
    function toggleRowSelection(rowIndex) {
        const row = document.querySelector(`tr[data-index="${rowIndex}"]`);
        if (!row) return;
        
        if (selectedRowIndices.has(rowIndex)) {
            selectedRowIndices.delete(rowIndex);
            row.classList.remove('selected-row');
        } else {
            selectedRowIndices.add(rowIndex);
            row.classList.add('selected-row');
        }
    }
    
    function clearRowSelection() {
        selectedRowIndices.clear();
        document.querySelectorAll('.selected-row').forEach(row => {
            row.classList.remove('selected-row');
        });
    }

    function sortByField(field) {
        if (state.result.dbType === 'ElasticSearch') {
            vscode.postMessage({
                type: 'esSort',
                sort: [{ [field]: { order: 'asc' } }]
            });
            return;
        }
        
        let sortSql = state.result.sql
            .replace(/\n/, ' ')
            .replace(';', '')
            .replace(/order by .+? (desc|asc)?/gi, '')
            .replace(/\s?(limit.+)?$/i, ` ORDER BY ${field} ASC $1 `);
            
        executeCustomQuery(sortSql + ';');
    }

    function filterData() {
        if (!state.table.search) return state.result.data;
        
        return state.result.data.filter(data =>
            !state.table.search ||
            JSON.stringify(data)
                .toLowerCase()
                .includes(state.table.search.toLowerCase())
        );
    }

    function filterAndRenderTable() {
        renderTable();
    }

    function updatePaginationInfo() {
        if (elements.pageNumSpan) {
            elements.pageNumSpan.textContent = state.page.pageNum;
        }
        if (elements.totalRowsSpan && state.page.total !== null) {
            elements.totalRowsSpan.textContent = state.page.total;
        }
        if (elements.costTime) {
            elements.costTime.textContent = state.result.costTime + 'ms';
        }
    }

    function updateBreadcrumb() {
        // Update connection name
        if (elements.connectionName && state.result.connectionName) {
            elements.connectionName.textContent = state.result.connectionName;
        } else if (elements.connectionName) {
            elements.connectionName.textContent = 'Connection';
        }
        
        // Update database name
        if (elements.databaseName && state.result.database) {
            elements.databaseName.textContent = state.result.database;
            if (elements.databaseBreadcrumb) {
                elements.databaseBreadcrumb.style.display = 'flex';
            }
        } else if (elements.databaseBreadcrumb) {
            elements.databaseBreadcrumb.style.display = 'none';
        }
        
        // Update table name
        if (elements.tableName && state.result.table) {
            elements.tableName.textContent = state.result.table;
            if (elements.tableBreadcrumb) {
                elements.tableBreadcrumb.style.display = 'flex';
            }
        } else if (elements.tableBreadcrumb) {
            elements.tableBreadcrumb.style.display = 'none';
        }
        
        // Show/hide separators based on visible items
        const separators = document.querySelectorAll('.breadcrumb-separator');
        separators.forEach((sep, index) => {
            if (index === 0) {
                // First separator (after connection)
                sep.style.display = (state.result.database || state.result.table) ? 'inline' : 'none';
            } else if (index === 1) {
                // Second separator (after database)
                sep.style.display = (state.result.database && state.result.table) ? 'inline' : 'none';
            }
        });
    }

    function getSelectedRows() {
        const selectedRows = [];
        const filteredData = filterData();
        
        selectedRowIndices.forEach(index => {
            if (filteredData[index]) {
                selectedRows.push(filteredData[index]);
            }
        });
        
        return selectedRows;
    }

    function showLoading(show) {
        state.table.loading = show;
        if (elements.dataTable) {
            elements.dataTable.classList.toggle('loading', show);
        }
    }

    function showMessage(message, type = 'info') {
        if (elements.messagePanel) {
            elements.messagePanel.innerHTML = `<div class="message ${type}">${message}</div>`;
            elements.messagePanel.style.display = 'block';
            
            setTimeout(() => {
                elements.messagePanel.style.display = 'none';
            }, 3000);
        }
    }

    function initShowColumn() {
        const fields = state.result.fields;
        if (!fields) return;
        
        state.toolbar.showColumns = [];
        for (let i = 0; i < fields.length; i++) {
            if (!fields[i].name) continue;
            state.toolbar.showColumns.push(fields[i].name.toLowerCase());
        }
    }

    function clear() {
        // Reset page
        state.page.pageNum = 1;
        state.page.pageSize = state.result.pageSize;
        state.page.total = null;
        
        // Info
        if (state.info.needRefresh) {
            state.info.message = null;
        } else {
            state.info.needRefresh = true;
        }
        
        // Loading
        state.table.loading = false;
    }

    function reset() {
        clear();
        // Table
        state.table.widthItem = {};
        initShowColumn();
        
        // Add filter row
        if (state.result.columnList) {
            state.result.data.unshift({ isFilter: true, content: "" });
        }
        
        // Toolbar
        if (!state.result.sql.match(/\bwhere\b/gi)) {
            state.toolbar.filter = {};
        }
    }

    // Utility functions
    function wrapQuote(type, value) {
        if (value === "" || value === null || value === undefined) {
            return "null";
        }
        
        // Method call
        if (/\(.*?\)/.exec(value)) {
            return value;
        }
        
        const lowerType = (type || '').toLowerCase();
        
        if (lowerType.includes('int') || lowerType.includes('number') || 
            lowerType.includes('decimal') || lowerType.includes('float') ||
            lowerType.includes('double') || lowerType.includes('real')) {
            return value;
        }
        
        return `'${value.toString().replace(/'/g, "''")}'`;
    }

    function wrapByDb(tableName, dbType) {
        switch (dbType) {
            case 'MySQL':
                return `\`${tableName}\``;
            case 'PostgreSQL':
                return `"${tableName}"`;
            case 'SQL Server':
                return `[${tableName}]`;
            default:
                return tableName;
        }
    }

    function getTypeByColumn(key) {
        if (!state.result.columnList) return;
        for (const column of state.result.columnList) {
            if (column.name === key) {
                return column.simpleType || column.type;
            }
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Handle messages from VS Code
    window.addEventListener('message', function(event) {
        const message = event.data;
        if (!message) return;
        
        const response = message.content;
        state.result.transId = response.transId;
        state.table.loading = false;
        
        switch (message.type) {
            case 'EXPORT_DONE':
                showMessage('Export completed successfully', 'success');
                break;
                
            case 'RUN':
                if (elements.queryInput) {
                    elements.queryInput.value = response.sql;
                }
                state.toolbar.sql = response.sql;
                state.table.loading = response.transId !== state.result.transId;
                break;
                
            case 'DATA':
                handleDataResponse(response);
                break;
                
            case 'NEXT_PAGE':
                state.result.data = response.data;
                state.result.costTime = response.costTime;
                state.toolbar.sql = response.sql;
                state.result.data.unshift({ isFilter: true, content: "" });
                renderTable();
                break;
                
            case 'COUNT':
                state.page.total = parseInt(response.data);
                updatePaginationInfo();
                break;
                
            case 'DML':
            case 'DDL':
            case 'MESSAGE_BLOCK':
                handleCommandResponse(response);
                state.info.error = false;
                state.info.needRefresh = false;
                if (response.message.indexOf("AffectedRows") !== -1 || response.isInsert) {
                    refresh();
                }
                break;
                
            case 'ERROR':
                handleCommandResponse(response);
                state.info.error = true;
                break;
                
            case 'MESSAGE':
                if (response.message) {
                    showMessage(response.message, response.success ? 'success' : 'error');
                }
                refresh();
                break;
                
            case 'updateSuccess':
                for (const index in state.update.editList) {
                    const element = state.update.editList[index];
                    state.result.data[index] = element;
                }
                state.update.editList = [];
                state.update.lock = false;
                showMessage('Update Success', 'success');
                break;
                
            case 'connectionUpdated':
                if (response.connection) {
                    state.result.connectionName = response.connection.name;
                    updateBreadcrumb();
                }
                break;
        }
        
        showLoading(false);
    });

    function handleDataResponse(response) {
        state.result = response;
        state.toolbar.sql = response.sql;
        
        const sameTable = state.result.table === response.table;
        if (sameTable) {
            clear();
        } else {
            reset();
        }
        
        // Initialize showColumns to show all fields
        if (state.result.fields && state.result.fields.length > 0) {
            state.toolbar.showColumns = state.result.fields.map(field => field.name.toLowerCase());
        }
        
        // Only ES has total
        if (response.total != null) {
            state.page.total = parseInt(response.total);
        } else if (state.result.tableCount === 1 && 
                   state.page.pageSize < state.result.data.length + 1) {
            count();
        } else {
            state.page.total = state.result.data.length - 1;
        }
        
        state.update.editList = [];
        state.update.lock = false;
        
        // Clear row selections when new data is loaded
        selectedRowIndices.clear();
        
        // Initialize edit dialog data when new result is loaded
        initializeEditDialogData();
        
        // Update breadcrumb with new data
        updateBreadcrumb();
        
        renderTable();
    }

    function handleCommandResponse(response) {
        state.info.message = response.message;
        if (elements.messagePanel) {
            const messageClass = state.info.error ? 'error' : 'success';
            elements.messagePanel.innerHTML = `<div class="message ${messageClass}">${response.message}</div>`;
            elements.messagePanel.style.display = 'block';
        }
    }

    function refresh() {
        if (state.result.sql) {
            executeCustomQuery(state.result.sql);
        }
    }

    function count() {
        if (!state.result.table) return;
        state.info.message = null;
        vscode.postMessage({
            type: 'count',
            sql: state.result.sql
        });
    }

    // Column selector functions
    function openColumnSelector() {
        if (!state.result.fields || state.result.fields.length === 0) {
            showMessage('No columns available', 'warning');
            return;
        }
        
        renderColumnCheckboxes();
        if (elements.columnSelectorDialog) {
            elements.columnSelectorDialog.style.display = 'block';
        }
    }
    
    // Add column selector button to toolbar
    function addColumnSelectorToToolbar() {
        const toolbar = document.querySelector('.table-actions-toolbar .toolbar-left');
        if (toolbar && !document.getElementById('columnSelectorBtn')) {
            const button = document.createElement('button');
            button.id = 'columnSelectorBtn';
            button.className = 'btn btn-icon';
            button.title = 'Select columns to show';
            button.innerHTML = '<i class="codicon codicon-filter"></i>';
            button.addEventListener('click', openColumnSelector);
            toolbar.appendChild(button);
        }
    }
    
    function renderColumnCheckboxes() {
        if (!elements.columnCheckboxes || !state.result.fields) return;
        
        elements.columnCheckboxes.innerHTML = '';
        
        state.result.fields.forEach((field, index) => {
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'checkbox-container';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `column_${index}`;
            checkbox.value = field.name;
            checkbox.checked = state.toolbar.showColumns.includes(field.name.toLowerCase());
            checkbox.addEventListener('change', onColumnCheckboxChange);
            
            const label = document.createElement('label');
            label.htmlFor = `column_${index}`;
            label.textContent = field.name;
            
            checkboxContainer.appendChild(checkbox);
            checkboxContainer.appendChild(label);
            elements.columnCheckboxes.appendChild(checkboxContainer);
        });
    }
    
    function onColumnCheckboxChange(event) {
        const columnName = event.target.value.toLowerCase();
        const isChecked = event.target.checked;
        
        if (isChecked && !state.toolbar.showColumns.includes(columnName)) {
            state.toolbar.showColumns.push(columnName);
        } else if (!isChecked && state.toolbar.showColumns.includes(columnName)) {
            const index = state.toolbar.showColumns.indexOf(columnName);
            state.toolbar.showColumns.splice(index, 1);
        }
        
        // Re-render table with updated columns
        renderTable();
    }
    
    function selectAllColumns() {
        if (!state.result.fields) return;
        
        state.toolbar.showColumns = state.result.fields.map(field => field.name.toLowerCase());
        renderColumnCheckboxes();
        renderTable();
    }
    
    function deselectAllColumns() {
        state.toolbar.showColumns = [];
        renderColumnCheckboxes();
        renderTable();
    }
    
    function closeColumnSelector() {
        if (elements.columnSelectorDialog) {
            elements.columnSelectorDialog.style.display = 'none';
        }
    }
    
    // Edit Dialog Functions - matching Vue EditDialog/index.vue exactly
    function openEdit(originModel) {
        if (!originModel) {
            showMessage('Edit row cannot be null!', 'error');
            return;
        }
        
        state.editDialog.originModel = originModel;
        state.editDialog.editModel = { ...originModel };
        state.editDialog.mode = 'update';
        state.editDialog.loading = false;
        state.editDialog.visible = true;
        
        renderEditDialog();
        if (elements.editDialog) {
            elements.editDialog.style.display = 'block';
        }
    }
    
    function openCopy(originModel) {
        if (!originModel) {
            showMessage('Edit row cannot be null!', 'error');
            return;
        }
        
        state.editDialog.originModel = originModel;
        state.editDialog.editModel = { ...originModel };
        // Set primary key to null for copy
        if (state.editDialog.primaryKey) {
            state.editDialog.editModel[state.editDialog.primaryKey] = null;
        }
        state.editDialog.mode = 'copy';
        state.editDialog.loading = false;
        state.editDialog.visible = true;
        
        renderEditDialog();
        if (elements.editDialog) {
            elements.editDialog.style.display = 'block';
        }
    }
    
    function openInsert() {
        if (state.result.tableCount !== 1) {
            showMessage('Not table found!', 'warning');
            return;
        }
        
        state.editDialog.mode = 'insert';
        state.editDialog.editModel = {};
        state.editDialog.loading = false;
        state.editDialog.visible = true;
        
        renderEditDialog();
        if (elements.editDialog) {
            elements.editDialog.style.display = 'block';
        }
    }
    
    function closeEditDialog() {
        state.editDialog.visible = false;
        if (elements.editDialog) {
            elements.editDialog.style.display = 'none';
        }
    }
    
    function getTypeByColumn(key) {
        if (!state.editDialog.columnList) return null;
        for (const column of state.editDialog.columnList) {
            if (column.name === key) {
                return column.simpleType || column.type;
            }
        }
        return null;
    }
    
    function wrapQuote(type, value) {
        if (value === null || value === undefined) {
            return 'NULL';
        }
        
        const upperType = type ? type.toUpperCase() : '';
        
        // Numeric types don't need quotes
        if (upperType.includes('INT') || upperType.includes('DECIMAL') || 
            upperType.includes('FLOAT') || upperType.includes('DOUBLE') ||
            upperType.includes('NUMERIC') || upperType.includes('NUMBER')) {
            return value.toString();
        }
        
        // Boolean handling
        if (upperType.includes('BOOL')) {
            return value ? 'true' : 'false';
        }
        
        // String values need quotes and escaping
        const escapedValue = value.toString().replace(/'/g, "''");
        return `'${escapedValue}'`;
    }
    
    function renderEditDialog() {
        if (!elements.editDialogTitle || !elements.editDialogBody) return;
        
        // Set dialog title based on mode - matching Vue computed property
        let title = '';
        if (state.editDialog.mode === 'insert') {
            title = 'Insert To ' + (state.editDialog.table || state.result.table);
        } else if (state.editDialog.mode === 'update') {
            const pkValue = state.editDialog.originModel[state.editDialog.primaryKey] || '';
            title = `Edit For ${state.editDialog.table || state.result.table} : ${state.editDialog.primaryKey}=${pkValue}`;
        } else {
            title = 'Copy To ' + (state.editDialog.table || state.result.table);
        }
        elements.editDialogTitle.textContent = title;
        
        // Generate form fields based on columns
        let formHtml = '';
        if (state.editDialog.columnList && state.editDialog.columnList.length > 0) {
            state.editDialog.columnList.forEach(column => {
                const currentValue = state.editDialog.editModel[column.name] || '';
                const isRequired = column.nullable !== 'YES' ? ' *' : '';
                const defaultInfo = column.defaultValue ? ` Default: ${column.defaultValue}` : '';
                const autoIncrement = column.extra === 'auto_increment' ? ' AUTO_INCREMENT' : '';
                
                formHtml += `
                    <div class="form-group">
                        <label for="edit_${column.name}">
                            ${column.name} : ${column.type}
                            <span style="color: red;">${column.key}${isRequired}</span>
                            <span>${defaultInfo}${autoIncrement}</span>
                        </label>
                        ${renderCellEditor(column, currentValue)}
                    </div>
                `;
            });
        }
        
        elements.editDialogBody.innerHTML = formHtml;
        
        // Update save button text based on mode
        if (elements.saveRowBtn) {
            if (state.editDialog.mode === 'update') {
                elements.saveRowBtn.textContent = 'Update';
            } else {
                elements.saveRowBtn.textContent = 'Insert';
            }
        }
    }
    
    function renderCellEditor(column, value) {
        const fieldId = `edit_${column.name}`;
        const type = column.type ? column.type.toUpperCase() : '';
        
        // Date picker for date types
        if (type === 'DATE') {
            return `<input type="date" id="${fieldId}" class="form-control" value="${value || ''}" onchange="updateEditModel('${column.name}', this.value)">`;
        }
        
        // Time picker for time types
        if (type === 'TIME') {
            return `<input type="time" id="${fieldId}" class="form-control" value="${value || ''}" onchange="updateEditModel('${column.name}', this.value)">`;
        }
        
        // DateTime picker for datetime types
        if (type === 'DATETIME' || type === 'TIMESTAMP' || 
            type.includes('TIMESTAMP WITHOUT TIME ZONE') || 
            type.includes('TIMESTAMP WITH TIME ZONE')) {
            // Use datetime-local input type
            const datetimeValue = value ? value.replace(' ', 'T').substring(0, 16) : '';
            return `<input type="datetime-local" id="${fieldId}" class="form-control" value="${datetimeValue}" onchange="updateEditModel('${column.name}', this.value.replace('T', ' ') + ':00')">`;
        }
        
        // Default to text input
        return `<input type="text" id="${fieldId}" class="form-control" value="${value || ''}" onchange="updateEditModel('${column.name}', this.value)">`;
    }
    
    function updateEditModel(columnName, value) {
        state.editDialog.editModel[columnName] = value;
    }
    
    function saveEditedRow() {
        if (state.editDialog.mode === 'update') {
            confirmUpdate(state.editDialog.editModel, state.editDialog.originModel);
        } else {
            confirmInsert(state.editDialog.editModel);
        }
    }
    
    function confirmInsert(editModel) {
        if (state.editDialog.dbType === 'ElasticSearch') {
            confirmInsertEs(editModel);
            return;
        } else if (state.editDialog.dbType === 'MongoDB') {
            confirmInsertMongo(editModel);
            return;
        }
        
        let columns = '';
        let values = '';
        for (const key in editModel) {
            if (getTypeByColumn(key) === null) continue;
            const newEle = editModel[key];
            if (newEle !== null && newEle !== '') {
                columns += `${key},`;
                values += `${wrapQuote(getTypeByColumn(key), newEle)},`;
            }
        }
        
        if (values) {
            const tableName = state.editDialog.table || state.result.table;
            const insertSql = `INSERT INTO ${tableName}(${columns.replace(/,$/, '')}) VALUES(${values.replace(/,$/, '')})`;
            state.editDialog.loading = true;
            executeSQL(insertSql);
            closeEditDialog();
        } else {
            showMessage('Not any input, insert fail!', 'warning');
        }
    }
    
    function confirmUpdate(currentNew, oldRow) {
        const sql = buildUpdateSqlForEdit(currentNew, oldRow);
        if (sql) {
            state.editDialog.loading = true;
            executeSQL(sql);
            closeEditDialog();
        } else {
            showMessage('Not any change, update fail!', 'warning');
        }
    }
    
    function buildUpdateSqlForEdit(currentNew, oldRow) {
        if (state.editDialog.dbType === 'ElasticSearch') {
            return confirmUpdateEs(currentNew);
        } else if (state.editDialog.dbType === 'MongoDB') {
            return confirmUpdateMongo(currentNew, oldRow);
        }
        
        if (!state.editDialog.primaryKey) {
            showMessage('This table has not primary key, cannot update!', 'error');
            return '';
        }
        
        let change = '';
        for (const key in currentNew) {
            if (getTypeByColumn(key) === null) continue;
            const oldEle = oldRow[key];
            const newEle = currentNew[key];
            if (oldEle !== newEle) {
                change += `${key}=${wrapQuote(getTypeByColumn(key), newEle)},`;
            }
        }
        
        if (!change) {
            return '';
        }
        
        const tableName = state.editDialog.table || state.result.table;
        let updateSql = `UPDATE ${tableName} SET ${change.replace(/,$/, '')}`;
        
        // Handle multiple primary keys
        const pkList = state.editDialog.primaryKeyList.length > 0 ? state.editDialog.primaryKeyList : [{name: state.editDialog.primaryKey, type: 'VARCHAR'}];
        for (let i = 0; i < pkList.length; i++) {
            const pk = pkList[i];
            const pkName = pk.name;
            const pkType = pk.simpleType || pk.type;
            if (i === 0) {
                updateSql += ` WHERE ${pkName}=${wrapQuote(pkType, oldRow[pkName])}`;
            } else {
                updateSql += ` AND ${pkName}=${wrapQuote(pkType, oldRow[pkName])}`;
            }
        }
        
        return updateSql + ';';
    }
    
    function confirmInsertEs(editModel) {
        const tableName = state.editDialog.table || state.result.table;
        const sql = `POST /${tableName}/_doc\n` + JSON.stringify(editModel);
        executeSQL(sql);
    }
    
    function confirmInsertMongo(editModel) {
        const dbName = state.editDialog.database || state.result.database;
        const tableName = state.editDialog.table || state.result.table;
        const sql = `db('${dbName}').collection("${tableName}").insertOne(${JSON.stringify(editModel)})\n`;
        executeSQL(sql);
    }
    
    function confirmUpdateEs(row) {
        let value = {};
        for (const key in row) {
            if (key === '_XID' || key === '_index' || key === '_type' || 
                key === '_score' || key === '_id') {
                continue;
            }
            value[key] = row[key];
        }
        const tableName = state.editDialog.table || state.result.table;
        return `POST /${tableName}/_doc/${row._id}\n` + JSON.stringify(value);
    }
    
    function confirmUpdateMongo(row, oldRow) {
        const temp = Object.assign({}, row);
        delete temp['_id'];
        const id = oldRow._id.indexOf('ObjectID') !== -1 ? oldRow._id : `'${oldRow._id}'`;
        const dbName = state.editDialog.database || state.result.database;
        const tableName = state.editDialog.table || state.result.table;
        return `db('${dbName}').collection("${tableName}").updateOne({_id:${id}},{ $set:${JSON.stringify(temp)}})\n`;
    }
    
    // Initialize edit dialog data when result is loaded
    function initializeEditDialogData() {
        state.editDialog.columnList = state.result.fields || [];
        state.editDialog.dbType = state.result.dbType;
        state.editDialog.database = state.result.database;
        state.editDialog.table = state.result.table;
        
        // Find primary key info
        if (state.result.primaryKey) {
            state.editDialog.primaryKey = state.result.primaryKey;
        }
        if (state.result.primaryKeyList) {
            state.editDialog.primaryKeyList = state.result.primaryKeyList;
        }
    }

    // Row context menu and edit functions
    
    // Context menu cleanup no longer needed - using native VSCode context menus
    
    function editRow(rowIndex) {
        const row = getFilteredRowData(rowIndex);
        if (row) {
            openEdit(row);
        }
    }
    
    function copyRow(rowIndex) {
        const row = getFilteredRowData(rowIndex);
        if (row) {
            openCopy(row);
        }
    }
    
    function getFilteredRowData(index) {
        const filteredData = filterData();
        return filteredData[index];
    }
    
    function getColumnTooltip(column) {
        if (!column) return '';
        
        let tooltip = column.name || '';
        
        if (column.comment) {
            return column.comment;
        }
        
        // Build tooltip with column information
        const parts = [];
        if (column.type) parts.push(`Type: ${column.type}`);
        if (column.nullable !== undefined) parts.push(column.nullable === 'YES' ? 'Nullable' : 'Not Null');
        if (column.defaultValue) parts.push(`Default: ${column.defaultValue}`);
        if (column.extra === 'auto_increment') parts.push('Auto Increment');
        if (column.key === 'PRI') parts.push('Primary Key');
        if (column.key === 'UNI') parts.push('Unique');
        
        return parts.length > 0 ? parts.join(', ') : tooltip;
    }
    
    function formatCellValue(value, field, dbType) {
        // Handle NULL values with special formatting (Row/index.vue functionality)
        if (value === null || value === undefined) {
            return '<span class="null-column">(NULL)</span>';
        }
        
        // Handle ElasticSearch specific formatting
        if (dbType === 'ElasticSearch') {
            if (value && typeof value === 'object' && value.hasOwnProperty('type')) {
                return String.fromCharCode.apply(null, new Uint16Array(value.data));
            }
            return value;
        }
        
        // Handle binary data
        if (value && typeof value === 'object' && value.hasOwnProperty('type')) {
            return String.fromCharCode.apply(null, new Uint16Array(value.data));
        }
        
        return escapeHtml(value.toString());
    }
    
    function handleCellEdit(cell) {
        const field = cell.dataset.field;
        const rowIndex = parseInt(cell.dataset.rowIndex);
        const newValue = cell.textContent;
        const originalData = filterData()[rowIndex];
        
        // Track the edit
        if (!state.update.editList[rowIndex]) {
            state.update.editList[rowIndex] = { ...originalData };
            delete state.update.editList[rowIndex]._XID;
        }
        
        state.update.editList[rowIndex][field] = newValue;
        
        // Send data modification event
        vscode.postMessage({ type: 'dataModify' });
        
        // Show visual feedback
        cell.classList.add('cell-edited');
        setTimeout(() => cell.classList.remove('cell-edited'), 2000);
    }
    
    
    function copyCellValue(value) {
        navigator.clipboard.writeText(value).then(() => {
            showMessage('Value copied to clipboard', 'info');
        }).catch(() => {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = value;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showMessage('Value copied to clipboard', 'info');
        });
    }
    
    function filterByValue(fieldName, value, operator) {
        if (state.result.dbType === 'ElasticSearch') {
            // ElasticSearch specific filtering
            const filterObj = {};
            filterObj[fieldName] = value;
            vscode.postMessage({ 
                type: 'esFilter', 
                match: filterObj 
            });
            return;
        }
        
        // SQL filtering logic from Row/index.vue
        let filterSql = state.result.sql.replace(/\n/, ' ').replace(';', ' ') + ' ';
        
        // Check if filter already exists for this column
        const existsCheck = new RegExp(`(WHERE|AND)?\\s*\`?${fieldName}\`?\\s*(=|is|>=|<=|<>|LIKE|NOT LIKE)\\s*.+?\\s`, 'igm');
        
        if (value && value !== '(NULL)') {
            const condition = value.toLowerCase() === 'null' 
                ? `${fieldName} is null`
                : `${wrapFieldName(fieldName)} ${operator} '${value}'`;
                
            if (existsCheck.exec(filterSql)) {
                // Replace existing condition
                filterSql = filterSql.replace(existsCheck, `$1 ${condition} `);
            } else if (filterSql.match(/\bwhere\b/gi)) {
                // Add to existing WHERE clause
                filterSql = filterSql.replace(/\b(where)\b/gi, `$1 ${condition} AND `);
            } else {
                // Add new WHERE clause
                filterSql = filterSql.replace(new RegExp(`(from\\s*.+?)\\s`, 'ig'), `$1 WHERE ${condition} `);
            }
        }
        
        // Execute the filtered query
        executeSQL(filterSql + ';');
    }
    
    function wrapFieldName(fieldName) {
        // Wrap field names based on database type
        if (state.result.dbType === 'MySQL') {
            return `\`${fieldName}\``;
        }
        return fieldName;
    }

    function autoResizeTextarea() {
        if (!elements.queryInput) return;
        
        const textarea = elements.queryInput;
        const style = window.getComputedStyle(textarea);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
        const minLines = 2;
        const maxLines = 6;
        
        // Reset height to auto to get the scroll height
        textarea.style.height = 'auto';
        
        // Calculate number of lines needed
        const scrollHeight = textarea.scrollHeight;
        const paddingTop = parseFloat(style.paddingTop) || 0;
        const paddingBottom = parseFloat(style.paddingBottom) || 0;
        const borderTop = parseFloat(style.borderTopWidth) || 0;
        const borderBottom = parseFloat(style.borderBottomWidth) || 0;
        
        const contentHeight = scrollHeight - paddingTop - paddingBottom - borderTop - borderBottom;
        const lines = Math.ceil(contentHeight / lineHeight);
        
        // Constrain between min and max lines
        const constrainedLines = Math.max(minLines, Math.min(maxLines, lines));
        const newHeight = (constrainedLines * lineHeight) + paddingTop + paddingBottom;
        
        textarea.style.height = newHeight + 'px';
    }

    // Global functions for inline onclick
    window.openColumnSelector = openColumnSelector;
    window.updateEditModel = updateEditModel;
    window.editRow = editRow;
    window.copyRow = copyRow;
    window.handleCellEdit = handleCellEdit;
    window.copyCellValue = copyCellValue;
    window.filterByValue = filterByValue;
    window.toggleRowSelection = toggleRowSelection;

    // Export global functions for debugging
    window.resultsApp = {
        state,
        executeQuery,
        refresh,
        changePage,
        deleteSelected,
        openColumnSelector,
        selectAllColumns,
        deselectAllColumns,
        openEdit,
        openInsert,
        openCopy
    };
})();
