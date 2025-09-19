/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Cell editors for different data types - equivalent to CellEditor.vue
class CellEditorManager {
    static createEditor(type, value, container) {
        const editor = document.createElement('div');
        editor.className = 'cell-editor';
        
        if (type === 'date') {
            return this.createDateEditor(value, container);
        } else if (type === 'time') {
            return this.createTimeEditor(value, container);
        } else if (this.isDateTime(type)) {
            return this.createDateTimeEditor(value, container);
        } else {
            return this.createTextEditor(value, container);
        }
    }
    
    static createDateEditor(value, container) {
        const input = document.createElement('input');
        input.type = 'date';
        input.value = value || '';
        input.className = 'form-control cell-input';
        
        input.addEventListener('change', (e) => {
            container.dispatchEvent(new CustomEvent('cellValueChanged', {
                detail: { value: e.target.value }
            }));
        });
        
        return input;
    }
    
    static createTimeEditor(value, container) {
        const input = document.createElement('input');
        input.type = 'time';
        input.value = value || '';
        input.className = 'form-control cell-input';
        input.step = '1'; // Include seconds
        
        input.addEventListener('change', (e) => {
            container.dispatchEvent(new CustomEvent('cellValueChanged', {
                detail: { value: e.target.value + ':00' }
            }));
        });
        
        return input;
    }
    
    static createDateTimeEditor(value, container) {
        const input = document.createElement('input');
        input.type = 'datetime-local';
        input.value = value ? value.replace(' ', 'T').substring(0, 19) : '';
        input.className = 'form-control cell-input';
        
        input.addEventListener('change', (e) => {
            const formattedValue = e.target.value.replace('T', ' ') + ':00';
            container.dispatchEvent(new CustomEvent('cellValueChanged', {
                detail: { value: formattedValue }
            }));
        });
        
        return input;
    }
    
    static createTextEditor(value, container) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value || '';
        input.className = 'form-control cell-input';
        
        input.addEventListener('input', (e) => {
            container.dispatchEvent(new CustomEvent('cellValueChanged', {
                detail: { value: e.target.value }
            }));
        });
        
        return input;
    }
    
    static isDateTime(type) {
        if (!type) return false;
        type = type.toUpperCase();
        return type === 'DATETIME' || 
               type === 'TIMESTAMP' || 
               type === 'TIMESTAMP WITHOUT TIME ZONE' ||
               type === 'TIMESTAMP WITH TIME ZONE';
    }
}

window.CellEditorManager = CellEditorManager;
