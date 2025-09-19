/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

class DataGrid {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            sortable: true,
            filterable: true,
            editable: false,
            contextMenu: true,
            pageSize: 100,
            ...options
        };
        this.data = [];
        this.columns = [];
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.filters = {};
        this.selectedRows = new Set();
        
        this.init();
    }
    
    init() {
        this.container.className = 'data-grid';
        this.createHeader();
        this.createBody();
        this.createFooter();
        
        if (this.options.contextMenu) {
            this.initContextMenu();
        }
    }
    
    setData(data, columns) {
        this.data = data;
        this.columns = columns;
        this.render();
    }
    
    render() {
        this.renderHeader();
        this.renderBody();
        this.renderFooter();
    }
    
    renderHeader() {
        this.header.innerHTML = '';
        
        // Checkbox column
        const checkboxCell = document.createElement('div');
        checkboxCell.className = 'grid-header-cell checkbox-cell';
        checkboxCell.innerHTML = '<input type="checkbox" class="select-all">';
        this.header.appendChild(checkboxCell);
        
        // Data columns
        this.columns.forEach(column => {
            const cell = document.createElement('div');
            cell.className = 'grid-header-cell';
            cell.innerHTML = `
                <span class="column-title">${column.title}</span>
                ${this.options.sortable ? '<span class="sort-indicator"></span>' : ''}
                ${this.options.filterable ? '<input type="text" class="column-filter" placeholder="Filter...">' : ''}
            `;
            
            if (this.options.sortable) {
                cell.addEventListener('click', () => this.sort(column.field));
            }
            
            this.header.appendChild(cell);
        });
    }
    
    renderBody() {
        this.body.innerHTML = '';
        
        const filteredData = this.getFilteredData();
        const sortedData = this.getSortedData(filteredData);
        
        sortedData.forEach((row, index) => {
            const rowElement = document.createElement('div');
            rowElement.className = 'grid-row';
            rowElement.dataset.index = index;
            
            // Checkbox cell
            const checkboxCell = document.createElement('div');
            checkboxCell.className = 'grid-cell checkbox-cell';
            checkboxCell.innerHTML = '<input type="checkbox" class="row-select">';
            rowElement.appendChild(checkboxCell);
            
            // Data cells
            this.columns.forEach(column => {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.dataset.field = column.field;
                
                const value = row[column.field];
                if (this.options.editable && column.editable !== false) {
                    cell.contentEditable = true;
                    cell.addEventListener('blur', () => this.onCellEdit(row, column.field, cell.textContent));
                }
                
                cell.textContent = this.formatCellValue(value, column);
                rowElement.appendChild(cell);
            });
            
            this.body.appendChild(rowElement);
        });
    }
    
    renderFooter() {
        const totalRows = this.data.length;
        const filteredRows = this.getFilteredData().length;
        const selectedRows = this.selectedRows.size;
        
        this.footer.innerHTML = `
            <div class="grid-stats">
                <span>Total: ${totalRows}</span>
                <span>Filtered: ${filteredRows}</span>
                <span>Selected: ${selectedRows}</span>
            </div>
        `;
    }
    
    sort(field) {
        if (this.sortColumn === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = field;
            this.sortDirection = 'asc';
        }
        this.render();
    }
    
    getSortedData(data) {
        if (!this.sortColumn) return data;
        
        return [...data].sort((a, b) => {
            const aVal = a[this.sortColumn];
            const bVal = b[this.sortColumn];
            
            let comparison = 0;
            if (aVal > bVal) comparison = 1;
            if (aVal < bVal) comparison = -1;
            
            return this.sortDirection === 'asc' ? comparison : -comparison;
        });
    }
    
    getFilteredData() {
        return this.data.filter(row => {
            return Object.keys(this.filters).every(field => {
                const filter = this.filters[field];
                const value = String(row[field]).toLowerCase();
                return value.includes(filter.toLowerCase());
            });
        });
    }
    
    formatCellValue(value, column) {
        if (value === null || value === undefined) {
            return '(NULL)';
        }
        
        if (column.render) {
            return column.render(value);
        }
        
        if (column.type === 'datetime' && value instanceof Date) {
            return value.toISOString();
        }
        
        return String(value);
    }
    
    onCellEdit(row, field, newValue) {
        row[field] = newValue;
        this.emit('cellEdit', { row, field, newValue });
    }
    
    initContextMenu() {
        this.body.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const row = e.target.closest('.grid-row');
            if (row) {
                this.showContextMenu(e.clientX, e.clientY, row);
            }
        });
    }
    
    showContextMenu(x, y, row) {
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        
        menu.innerHTML = `
            <div class="menu-item" data-action="copy">
                <i class="codicon codicon-copy"></i> Copy
            </div>
            <div class="menu-item" data-action="edit">
                <i class="codicon codicon-edit"></i> Edit
            </div>
            <div class="menu-item" data-action="delete">
                <i class="codicon codicon-trash"></i> Delete
            </div>
        `;
        
        document.body.appendChild(menu);
        
        // Handle menu item clicks
        menu.addEventListener('click', (e) => {
            const action = e.target.closest('.menu-item')?.dataset.action;
            if (action) {
                this.emit('contextAction', { action, row: row.dataset.index });
            }
            menu.remove();
        });
        
        // Remove menu on click outside
        setTimeout(() => {
            document.addEventListener('click', () => {
                menu.remove();
            }, { once: true });
        }, 0);
    }
    
    createHeader() {
        this.header = document.createElement('div');
        this.header.className = 'grid-header';
        this.container.appendChild(this.header);
    }
    
    createBody() {
        this.body = document.createElement('div');
        this.body.className = 'grid-body';
        this.container.appendChild(this.body);
    }
    
    createFooter() {
        this.footer = document.createElement('div');
        this.footer.className = 'grid-footer';
        this.container.appendChild(this.footer);
    }
    
    emit(event, data) {
        if (this.options[`on${event.charAt(0).toUpperCase() + event.slice(1)}`]) {
            this.options[`on${event.charAt(0).toUpperCase() + event.slice(1)}`](data);
        }
    }
}

window.DataGrid = DataGrid;