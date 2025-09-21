/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';

// Data type validation and formatting utilities
export class TypeValidators {
    static wrapQuote(type: string, value: any): string {
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
    
    static formatCellValue(value: any, column?: { type?: string }): string {
        if (value === null || value === undefined) {
            return '(NULL)';
        }
        
        // Handle binary data
        if (value && value.hasOwnProperty && value.hasOwnProperty("type")) {
            return String.fromCharCode.apply(null, Array.from(new Uint16Array(value.data)));
        }
        
        if (column && column.type === 'datetime' && value instanceof Date) {
            return value.toISOString().replace('T', ' ').substring(0, 19);
        }
        
        return String(value);
    }
    
    static validateValue(type: string, value: any): { valid: boolean; value: any; error?: string } {
        if (!type || value === null || value === undefined || value === '') {
            return { valid: true, value };
        }
        
        type = type.toLowerCase();
        
        // Number validation
        if (['int', 'integer', 'bigint', 'smallint', 'tinyint'].includes(type)) {
            const num = parseInt(value, 10);
            if (isNaN(num)) {
                return { valid: false, value, error: 'Invalid integer value' };
            }
            return { valid: true, value: num };
        }
        
        if (['float', 'double', 'decimal', 'numeric'].includes(type)) {
            const num = parseFloat(value);
            if (isNaN(num)) {
                return { valid: false, value, error: 'Invalid decimal value' };
            }
            return { valid: true, value: num };
        }
        
        // Date validation
        if (['date', 'datetime', 'timestamp'].includes(type)) {
            const date = new Date(value);
            if (isNaN(date.getTime())) {
                return { valid: false, value, error: 'Invalid date format' };
            }
            return { valid: true, value };
        }
        
        // JSON validation
        if (type === 'json' || type === 'jsonb') {
            try {
                JSON.parse(value);
                return { valid: true, value };
            } catch {
                return { valid: false, value, error: 'Invalid JSON format' };
            }
        }
        
        return { valid: true, value };
    }
    
    static isDateTime(type: string): boolean {
        if (!type) return false;
        type = type.toUpperCase();
        return type === 'DATETIME' || 
               type === 'TIMESTAMP' || 
               type === 'TIMESTAMP WITHOUT TIME ZONE' ||
               type === 'TIMESTAMP WITH TIME ZONE';
    }
    
    static isBinary(type: string): boolean {
        if (!type) return false;
        type = type.toLowerCase();
        return type.indexOf('blob') !== -1 || 
               type.indexOf('binary') !== -1 ||
               type === 'bytea';
    }
    
    static isJSON(type: string): boolean {
        if (!type) return false;
        type = type.toLowerCase();
        return type === 'json' || type === 'jsonb';
    }
    
    static isBoolean(type: string): boolean {
        if (!type) return false;
        type = type.toLowerCase();
        return type === 'boolean' || type === 'bool' || type === 'bit';
    }
    
    static isNumeric(type: string): boolean {
        if (!type) return false;
        type = type.toLowerCase();
        return ['int', 'integer', 'bigint', 'smallint', 'tinyint', 
                'float', 'double', 'decimal', 'numeric'].includes(type);
    }
}

// Individual Editor Components
interface BaseEditorProps {
    value: any;
    type: string;
    onChange: (value: any) => void;
    onSave?: () => void;
    onCancel?: () => void;
    className?: string;
}

// Text Editor Component
const TextEditor: React.FC<BaseEditorProps> = ({ value, onChange, onSave, onCancel, className = '' }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, []);
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onSave?.();
        } else if (e.key === 'Escape') {
            onCancel?.();
        }
    };
    
    return (
        <input
            ref={inputRef}
            type="text"
            className={`cell-input ${className}`}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={onSave}
        />
    );
};

// Number Editor Component
const NumberEditor: React.FC<BaseEditorProps> = ({ value, type, onChange, onSave, onCancel, className = '' }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, []);
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onSave?.();
        } else if (e.key === 'Escape') {
            onCancel?.();
        }
    };
    
    const isInteger = ['int', 'integer', 'bigint', 'smallint', 'tinyint'].includes(type.toLowerCase());
    
    return (
        <input
            ref={inputRef}
            type="number"
            className={`cell-input ${className}`}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={onSave}
            step={isInteger ? '1' : 'any'}
        />
    );
};

// Date Editor Component
const DateEditor: React.FC<BaseEditorProps> = ({ value, onChange, onSave, onCancel, className = '' }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onSave?.();
        } else if (e.key === 'Escape') {
            onCancel?.();
        }
    };
    
    return (
        <input
            ref={inputRef}
            type="date"
            className={`cell-input ${className}`}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={onSave}
        />
    );
};

// Time Editor Component
const TimeEditor: React.FC<BaseEditorProps> = ({ value, onChange, onSave, onCancel, className = '' }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onSave?.();
        } else if (e.key === 'Escape') {
            onCancel?.();
        }
    };
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const timeValue = e.target.value;
        // Add seconds if not present
        const formattedValue = timeValue.length === 5 ? `${timeValue}:00` : timeValue;
        onChange(formattedValue);
    };
    
    return (
        <input
            ref={inputRef}
            type="time"
            step="1"
            className={`cell-input ${className}`}
            value={value ? value.substring(0, 8) : ''}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={onSave}
        />
    );
};

// DateTime Editor Component
const DateTimeEditor: React.FC<BaseEditorProps> = ({ value, onChange, onSave, onCancel, className = '' }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onSave?.();
        } else if (e.key === 'Escape') {
            onCancel?.();
        }
    };
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const datetimeValue = e.target.value;
        const formattedValue = datetimeValue.replace('T', ' ') + ':00';
        onChange(formattedValue);
    };
    
    const displayValue = value ? value.replace(' ', 'T').substring(0, 19) : '';
    
    return (
        <input
            ref={inputRef}
            type="datetime-local"
            className={`cell-input ${className}`}
            value={displayValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={onSave}
        />
    );
};

// Boolean Editor Component
const BooleanEditor: React.FC<BaseEditorProps> = ({ value, onChange, onSave, onCancel, className = '' }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onChange(!value);
            onSave?.();
        } else if (e.key === 'Escape') {
            onCancel?.();
        }
    };
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.checked);
        onSave?.();
    };
    
    return (
        <input
            ref={inputRef}
            type="checkbox"
            className={`cell-checkbox ${className}`}
            checked={!!value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
        />
    );
};

// JSON Editor Component
const JSONEditor: React.FC<BaseEditorProps> = ({ value, onChange, onSave, onCancel, className = '' }) => {
    const [jsonError, setJsonError] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
        }
    }, []);
    
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        onChange(newValue);
        
        // Validate JSON
        if (newValue.trim()) {
            try {
                JSON.parse(newValue);
                setJsonError(null);
            } catch (error: any) {
                setJsonError(error.message);
            }
        } else {
            setJsonError(null);
        }
    };
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onCancel?.();
        } else if (e.key === 'Enter' && e.ctrlKey) {
            onSave?.();
        }
    };
    
    return (
        <>
            <textarea
                ref={textareaRef}
                className={`cell-textarea ${className}`}
                value={value || ''}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onBlur={onSave}
                placeholder="Enter valid JSON..."
            />
            {jsonError && (
                <div className="json-error">
                    <i className="codicon codicon-error"></i>
                    {jsonError}
                </div>
            )}
        </>
    );
};

// Binary Data Viewer Component
const BinaryEditor: React.FC<BaseEditorProps> = ({ value, onChange, onSave, onCancel, className = '' }) => {
    const [format, setFormat] = useState<'hex' | 'text'>('hex');
    
    const formatBinaryData = useCallback((data: any, displayFormat: 'hex' | 'text'): string => {
        if (!data) return '';
        
        if (data && data.hasOwnProperty && data.hasOwnProperty("type")) {
            const bytes = new Uint8Array(data.data);
            
            if (displayFormat === 'hex') {
                return Array.from(bytes)
                    .map(byte => byte.toString(16).padStart(2, '0'))
                    .join(' ')
                    .replace(/(.{48})/g, '$1\n'); // Line break every 16 bytes
            } else {
                return String.fromCharCode.apply(null, Array.from(bytes));
            }
        }
        
        return String(data);
    }, []);
    
    const displayValue = formatBinaryData(value, format);
    
    return (
        <>
            <div className="binary-toolbar">
                <button
                    className={`binary-format-btn ${format === 'hex' ? 'active' : ''}`}
                    onClick={() => setFormat('hex')}
                >
                    Hex
                </button>
                <button
                    className={`binary-format-btn ${format === 'text' ? 'active' : ''}`}
                    onClick={() => setFormat('text')}
                >
                    Text
                </button>
                <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>
                    {value?.data?.length || 0} bytes
                </span>
            </div>
            <div className={`binary-content ${format}-format`}>
                {displayValue || '(No data)'}
            </div>
        </>
    );
};

// Main Cell Editor Component
interface CellEditorProps {
    value: any;
    type: string;
    isVisible: boolean;
    position?: { top: number; left: number; width: number; height: number };
    onChange: (value: any) => void;
    onSave: () => void;
    onCancel: () => void;
    showActions?: boolean;
}

export const CellEditor: React.FC<CellEditorProps> = ({
    value,
    type,
    isVisible,
    position,
    onChange,
    onSave,
    onCancel,
    showActions = true
}) => {
    const [currentValue, setCurrentValue] = useState(value);
    const [validation, setValidation] = useState<{ valid: boolean; error?: string }>({ valid: true });
    const containerRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        setCurrentValue(value);
    }, [value]);
    
    useEffect(() => {
        if (isVisible && type) {
            const validationResult = TypeValidators.validateValue(type, currentValue);
            setValidation(validationResult);
        }
    }, [currentValue, type, isVisible]);
    
    const handleChange = useCallback((newValue: any) => {
        setCurrentValue(newValue);
        onChange(newValue);
    }, [onChange]);
    
    const handleSave = useCallback(() => {
        if (validation.valid) {
            onSave();
        }
    }, [validation.valid, onSave]);
    
    const getEditorType = (): string => {
        if (TypeValidators.isBoolean(type)) return 'boolean';
        if (TypeValidators.isNumeric(type)) return 'number';
        if (type.toLowerCase() === 'date') return 'date';
        if (type.toLowerCase() === 'time') return 'time';
        if (TypeValidators.isDateTime(type)) return 'datetime';
        if (TypeValidators.isJSON(type)) return 'json';
        if (TypeValidators.isBinary(type)) return 'binary';
        return 'text';
    };
    
    const renderEditor = () => {
        const editorType = getEditorType();
        const commonProps = {
            value: currentValue,
            type,
            onChange: handleChange,
            onSave: handleSave,
            onCancel,
            className: validation.valid ? '' : 'invalid'
        };
        
        switch (editorType) {
            case 'boolean':
                return <BooleanEditor {...commonProps} />;
            case 'number':
                return <NumberEditor {...commonProps} />;
            case 'date':
                return <DateEditor {...commonProps} />;
            case 'time':
                return <TimeEditor {...commonProps} />;
            case 'datetime':
                return <DateTimeEditor {...commonProps} />;
            case 'json':
                return <JSONEditor {...commonProps} />;
            case 'binary':
                return <BinaryEditor {...commonProps} />;
            default:
                return <TextEditor {...commonProps} />;
        }
    };
    
    if (!isVisible) {
        return null;
    }
    
    const editorType = getEditorType();
    const editorClassName = `cell-editor ${editorType}-editor ${validation.valid ? '' : 'invalid'}`;
    
    const style: React.CSSProperties = position ? {
        position: 'absolute',
        top: position.top,
        left: position.left,
        width: position.width,
        minHeight: position.height,
        zIndex: 1000
    } : {};
    
    return (
        <div className="cell-editor-container">
            <div
                ref={containerRef}
                className={editorClassName}
                style={style}
            >
                {renderEditor()}
                
                {!validation.valid && validation.error && (
                    <div className="validation-error">
                        <i className="codicon codicon-error"></i>
                        {validation.error}
                    </div>
                )}
                
                {showActions && editorType !== 'boolean' && (
                    <div className="cell-editor-actions">
                        <button
                            className="cell-editor-btn save"
                            onClick={handleSave}
                            disabled={!validation.valid}
                            title="Save (Enter)"
                        >
                            <i className="codicon codicon-check"></i>
                        </button>
                        <button
                            className="cell-editor-btn cancel"
                            onClick={onCancel}
                            title="Cancel (Escape)"
                        >
                            <i className="codicon codicon-close"></i>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// Cell Display Component for read-only values
interface CellDisplayProps {
    value: any;
    type?: string;
    className?: string;
}

export const CellDisplay: React.FC<CellDisplayProps> = ({ value, type, className = '' }) => {
    if (value === null || value === undefined) {
        return <span className={`cell-null-value ${className}`}>(NULL)</span>;
    }
    
    const displayValue = type ? TypeValidators.formatCellValue(value, { type }) : String(value);
    
    return <span className={className}>{displayValue}</span>;
};
