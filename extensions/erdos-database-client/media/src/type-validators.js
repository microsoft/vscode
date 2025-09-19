/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Data type validation utilities - equivalent to util.ts mixin
class TypeValidators {
    static wrapQuote(type, value) {
        if (value === "") {
            return "null";
        }
        
        // Method call 
        if (/\(.*?\)/.exec(value)) {
            return value;
        }
        
        if (typeof value === "string") {
            value = value.replace(/'/g, "\\'");
        }
        
        if (!type) {
            return value;
        }
        
        type = type.toLowerCase();
        
        const stringTypes = [
            // SQL Server
            'nvarchar', 'nchar', 'datetimeoffset', 'smalldatetime', 'datetime2',
            // PostgreSQL
            'character', 'xml', 'uuid', 'jsonb', 'character varying', 'timestamp with time zone',
            // MySQL
            'varchar', 'char', 'date', 'time', 'timestamp', 'datetime', 'set', 'json'
        ];
        
        if (stringTypes.includes(type) || 
            type.indexOf('timestamp') !== -1 || 
            type.indexOf('text') !== -1 || 
            type.indexOf('blob') !== -1 || 
            type.indexOf('binary') !== -1) {
            return `'${value}'`;
        }
        
        return value;
    }
    
    static formatCellValue(value, column) {
        if (value === null || value === undefined) {
            return '(NULL)';
        }
        
        // Handle binary data
        if (value && value.hasOwnProperty && value.hasOwnProperty("type")) {
            return String.fromCharCode.apply(null, new Uint16Array(value.data));
        }
        
        if (column && column.type === 'datetime' && value instanceof Date) {
            return value.toISOString().replace('T', ' ').substring(0, 19);
        }
        
        return String(value);
    }
    
    static validateValue(type, value) {
        if (!type || value === null || value === undefined || value === '') {
            return { valid: true, value };
        }
        
        type = type.toLowerCase();
        
        // Number validation
        if (['int', 'integer', 'bigint', 'smallint', 'tinyint'].includes(type)) {
            const num = parseInt(value, 10);
            return { valid: !isNaN(num), value: num };
        }
        
        if (['float', 'double', 'decimal', 'numeric'].includes(type)) {
            const num = parseFloat(value);
            return { valid: !isNaN(num), value: num };
        }
        
        // Date validation
        if (['date', 'datetime', 'timestamp'].includes(type)) {
            const date = new Date(value);
            return { valid: !isNaN(date.getTime()), value };
        }
        
        return { valid: true, value };
    }
}

window.TypeValidators = TypeValidators;