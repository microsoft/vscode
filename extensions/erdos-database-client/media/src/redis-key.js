/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Redis Key Viewer functionality - based on keyView.vue
class RedisKeyViewer {
    constructor() {
        this.currentKey = null;
        this.currentKeyType = null;
        this.keyData = null;
        this.editModel = false;
        
        this.init();
    }
    
    init() {
        this.initializeElements();
        this.setupEventListeners();
        this.setupVSCodeMessaging();
    }
    
    initializeElements() {
        // Key header elements
        this.keyNameInput = document.getElementById('keyName');
        this.keyTypeSpan = document.getElementById('keyType');
        this.keyTtlInput = document.getElementById('keyTtl');
        this.renameBtn = document.getElementById('renameBtn');
        this.deleteBtn = document.getElementById('deleteBtn');
        this.refreshBtn = document.getElementById('refreshBtn');
        
        // Content panels
        this.stringContent = document.getElementById('stringContent');
        this.collectionContent = document.getElementById('collectionContent');
        
        // String content elements
        this.viewFormat = document.getElementById('viewFormat');
        this.stringValue = document.getElementById('stringValue');
        this.saveStringBtn = document.getElementById('saveStringBtn');
        
        // Collection elements
        this.addItemBtn = document.getElementById('addItemBtn');
        this.collectionGrid = document.getElementById('collectionGrid');
        
        // Dialog elements
        this.editDialog = document.getElementById('editDialog');
        this.dialogTitle = document.getElementById('dialogTitle');
        this.itemKey = document.getElementById('itemKey');
        this.itemValue = document.getElementById('itemValue');
        this.confirmBtn = document.getElementById('confirmBtn');
        this.cancelBtn = document.getElementById('cancelBtn');
        
        if (!this.keyNameInput) {
            console.error('Required DOM elements not found');
            return;
        }
    }
    
    setupEventListeners() {
        // Key actions
        if (this.renameBtn) {
            this.renameBtn.addEventListener('click', () => this.renameKey());
        }
        
        if (this.deleteBtn) {
            this.deleteBtn.addEventListener('click', () => this.deleteKey());
        }
        
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.refreshKey());
        }
        
        // TTL change
        if (this.keyTtlInput) {
            this.keyTtlInput.addEventListener('blur', () => this.updateTtl());
        }
        
        // String value save
        if (this.saveStringBtn) {
            this.saveStringBtn.addEventListener('click', () => this.saveStringValue());
        }
        
        // View format change
        if (this.viewFormat) {
            this.viewFormat.addEventListener('change', (e) => this.changeViewFormat(e.target.value));
        }
        
        // Add item for collections
        if (this.addItemBtn) {
            this.addItemBtn.addEventListener('click', () => this.showAddItemDialog());
        }
        
        // Dialog buttons
        if (this.confirmBtn) {
            this.confirmBtn.addEventListener('click', () => this.confirmDialog());
        }
        
        if (this.cancelBtn) {
            this.cancelBtn.addEventListener('click', () => this.cancelDialog());
        }
        
        // Close dialog on outside click
        if (this.editDialog) {
            this.editDialog.addEventListener('click', (e) => {
                if (e.target === this.editDialog) {
                    this.cancelDialog();
                }
            });
        }
    }
    
    setupVSCodeMessaging() {
        // Listen for messages from VS Code extension
        window.addEventListener('message', (event) => {
            const message = event.data;
            
            switch (message.type) {
                case 'detail':
                    this.displayKeyData(message.res);
                    break;
                case 'msg':
                    this.showSuccess(message.content);
                    break;
                case 'error':
                    this.showError(message.message);
                    break;
                case 'refresh':
                    this.refreshKey();
                    break;
            }
        });
    }
    
    displayKeyData(data) {
        this.keyData = data;
        this.currentKey = data.name;
        this.currentKeyType = data.type;
        
        // Update header
        if (this.keyNameInput) {
            this.keyNameInput.value = data.name;
        }
        
        if (this.keyTypeSpan) {
            this.keyTypeSpan.textContent = data.type.toUpperCase();
            this.keyTypeSpan.className = `key-type type-${data.type}`;
        }
        
        if (this.keyTtlInput) {
            this.keyTtlInput.value = data.ttl > 0 ? data.ttl : '';
        }
        
        // Show appropriate content panel
        this.showContentPanel(data.type);
        
        // Display content based on type
        switch (data.type) {
            case 'string':
                this.displayStringContent(data.content);
                // Auto-detect JSON format
                if (data.content && typeof data.content === 'string') {
                    const trimmed = data.content.trim();
                    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                        this.viewFormat.value = 'json';
                        this.changeViewFormat('json');
                    }
                }
                break;
            case 'list':
            case 'set':
            case 'hash':
            case 'zset':
                this.displayCollectionContent(data.content, data.type);
                break;
        }
    }
    
    showContentPanel(type) {
        // Hide all panels
        if (this.stringContent) {
            this.stringContent.style.display = 'none';
        }
        if (this.collectionContent) {
            this.collectionContent.style.display = 'none';
        }
        
        // Show appropriate panel
        if (type === 'string') {
            if (this.stringContent) {
                this.stringContent.style.display = 'block';
            }
        } else {
            if (this.collectionContent) {
                this.collectionContent.style.display = 'block';
            }
        }
    }
    
    displayStringContent(content) {
        if (this.stringValue) {
            this.stringValue.value = content || '';
        }
    }
    
    displayCollectionContent(content, type) {
        if (!this.collectionGrid) return;
        
        this.collectionGrid.innerHTML = '';
        
        // Create a simple table for collection data
        const table = document.createElement('table');
        table.className = 'collection-table';
        
        let rows = [];
        
        switch (type) {
            case 'list':
                rows = content.map((item, index) => ({
                    key: index.toString(),
                    value: item,
                    type: 'list'
                }));
                break;
            case 'set':
                rows = content.map(item => ({
                    key: item,
                    value: item,
                    type: 'set'
                }));
                break;
            case 'hash':
                rows = Object.entries(content).map(([key, value]) => ({
                    key: key,
                    value: value,
                    type: 'hash'
                }));
                break;
            case 'zset':
                // Assuming content is array with alternating members and scores
                for (let i = 0; i < content.length; i += 2) {
                    rows.push({
                        key: content[i],
                        value: content[i + 1],
                        type: 'zset'
                    });
                }
                break;
        }
        
        // Create table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Key</th>
                <th>Value</th>
                <th>Actions</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        rows.forEach((row, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${this.escapeHtml(row.key)}</td>
                <td>${this.escapeHtml(row.value)}</td>
                <td>
                    <button class="btn btn-sm btn-secondary edit-item" data-index="${index}">
                        <i class="codicon codicon-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger delete-item" data-index="${index}">
                        <i class="codicon codicon-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        
        this.collectionGrid.appendChild(table);
        
        // Add event listeners for item actions
        this.setupItemActions();
    }
    
    setupItemActions() {
        // Edit item buttons
        document.querySelectorAll('.edit-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                this.editItem(index);
            });
        });
        
        // Delete item buttons
        document.querySelectorAll('.delete-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                this.deleteItem(index);
            });
        });
    }
    
    renameKey() {
        const newName = this.keyNameInput.value;
        if (newName && newName !== this.currentKey) {
            vscode.postMessage({
                type: 'rename',
                key: { name: this.currentKey, newName: newName }
            });
        }
    }
    
    deleteKey() {
        if (confirm(`Are you sure you want to delete key "${this.currentKey}"?`)) {
            vscode.postMessage({
                type: 'del',
                key: { name: this.currentKey }
            });
        }
    }
    
    refreshKey() {
        if (this.currentKey) {
            vscode.postMessage({
                type: 'refresh',
                key: { name: this.currentKey }
            });
        }
    }
    
    updateTtl() {
        const ttl = parseInt(this.keyTtlInput.value) || -1;
        vscode.postMessage({
            type: 'ttl',
            key: { name: this.currentKey, ttl: ttl }
        });
    }
    
    saveStringValue() {
        const value = this.stringValue.value;
        vscode.postMessage({
            type: 'update',
            key: {
                name: this.currentKey,
                type: this.currentKeyType,
                content: value
            }
        });
    }
    
    changeViewFormat(format) {
        // Handle different view formats for string content
        const currentValue = this.stringValue.value;
        
        switch (format) {
            case 'json':
                try {
                    const parsed = JSON.parse(currentValue);
                    // Create formatted JSON with syntax highlighting
                    this.displayFormattedJson(parsed);
                } catch (e) {
                    // Keep original value if not valid JSON
                    this.stringValue.style.display = 'block';
                    this.hideJsonPanel();
                }
                break;
            case 'hex':
                // Convert to hex representation
                this.stringValue.value = this.stringToHex(currentValue);
                this.stringValue.style.display = 'block';
                this.hideJsonPanel();
                break;
            case 'text':
            default:
                // Keep as text
                this.stringValue.style.display = 'block';
                this.hideJsonPanel();
                break;
        }
    }
    
    
    editItem(index) {
        // Implementation for editing collection items
        const rows = this.getCollectionRows();
        if (rows[index]) {
            const row = rows[index];
            this.editModel = true;
            this.itemKey.value = row.key || '';
            this.itemValue.value = row.value || row;
            this.dialogTitle.textContent = this.getEditDialogTitle();
            this.editDialog.style.display = 'block';
        }
    }
    
    deleteItem(index) {
        // Implementation for deleting collection items
        const rows = this.getCollectionRows();
        if (rows[index]) {
            vscode.postMessage({
                type: 'deleteLine',
                row: rows[index]
            });
        }
    }
    
    confirmDialog() {
        // Handle dialog confirmation
        const key = this.itemKey.value;
        const value = this.itemValue.value;
        
        // Send to extension based on current key type
        vscode.postMessage({
            type: 'add',
            key: key,
            value: value,
            editModel: this.editModel || false
        });
        
        this.cancelDialog();
    }
    
    cancelDialog() {
        if (this.editDialog) {
            this.editDialog.style.display = 'none';
        }
    }
    
    showSuccess(message) {
        // Vue uses this.$message.success(content) - send to VS Code extension for real notifications
        vscode.postMessage({
            type: 'showMessage',
            level: 'info',
            message: message
        });
    }
    
    showError(message) {
        // Vue shows error messages - send to VS Code extension for real notifications  
        vscode.postMessage({
            type: 'showMessage',
            level: 'error',
            message: message
        });
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    stringToHex(str) {
        return str.split('').map(char => 
            char.charCodeAt(0).toString(16).padStart(2, '0')
        ).join(' ');
    }
    
    displayFormattedJson(jsonObj) {
        // Create or get JSON display panel
        let jsonPanel = document.querySelector('.json-panel');
        if (!jsonPanel) {
            jsonPanel = document.createElement('div');
            jsonPanel.className = 'json-panel';
            jsonPanel.contentEditable = 'true';
            jsonPanel.style.cssText = `
                line-height: 1.3;
                background: #292a2b;
                font-family: var(--vscode-editor-font-family);
                color: #f8f8f2;
                padding: 10px;
                border-radius: 4px;
                white-space: pre;
            `;
            this.stringContent.appendChild(jsonPanel);
        }
        
        // Format JSON with basic syntax highlighting
        const formatted = JSON.stringify(jsonObj, null, 2);
        jsonPanel.innerHTML = this.highlightJson(formatted);
        
        // Hide textarea, show JSON panel
        this.stringValue.style.display = 'none';
        jsonPanel.style.display = 'block';
        
        // Handle content changes
        jsonPanel.addEventListener('input', (e) => {
            this.stringValue.value = e.target.innerText;
        });
    }
    
    hideJsonPanel() {
        const jsonPanel = document.querySelector('.json-panel');
        if (jsonPanel) {
            jsonPanel.style.display = 'none';
        }
    }
    
    highlightJson(json) {
        // Basic JSON syntax highlighting
        return json
            .replace(/"([^"]+)":/g, '<span style="color: #C792EA">"$1":</span>')
            .replace(/: "([^"]*)"/g, ': <span style="color: #92D69E">"$1"</span>')
            .replace(/: (\d+)/g, ': <span style="color: #CE9178">$1</span>')
            .replace(/: (true|false)/g, ': <span style="color: #569cD6">$1</span>')
            .replace(/: null/g, ': <span style="color: #569cD6">null</span>');
    }
    
    getCollectionRows() {
        // Helper to get current collection data as rows
        if (!this.keyData || !this.keyData.content) return [];
        
        switch (this.currentKeyType) {
            case 'list':
                return this.keyData.content.map((item, index) => ({
                    key: index.toString(),
                    value: item
                }));
            case 'set':
                return this.keyData.content.map(item => ({
                    key: item,
                    value: item
                }));
            case 'hash':
                return this.keyData.content; // Already in {key, value} format
            case 'zset':
                return this.keyData.content; // Already in {member, score} format
            default:
                return [];
        }
    }
    
    getEditDialogTitle() {
        const edit = this.editModel;
        switch (this.currentKeyType) {
            case 'hash':
                return edit ? 'Edit Hash' : 'Add to hash';
            case 'set':
                return edit ? 'Edit Set' : 'Add to set';
            case 'zset':
                return edit ? 'Edit ZSet' : 'Add to zset';
            case 'list':
                return edit ? 'Edit List' : 'Add to list';
            default:
                return 'Add Item';
        }
    }
    
    showAddItemDialog() {
        this.editModel = false;
        if (this.editDialog) {
            this.dialogTitle.textContent = this.getEditDialogTitle();
            this.itemKey.value = '';
            this.itemValue.value = '';
            // Show/hide key field based on type
            const keyGroup = this.itemKey.closest('.form-group');
            if (keyGroup) {
                keyGroup.style.display = this.currentKeyType === 'hash' ? 'block' : 'none';
            }
            this.editDialog.style.display = 'block';
        }
    }
}

// Initialize VS Code messaging
const vscode = acquireVsCodeApi();

// Initialize Redis Key Viewer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new RedisKeyViewer();
});
