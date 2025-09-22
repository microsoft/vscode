/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/* REDIS COMPONENT COMMENTED OUT
import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { IRedisKey } from '../../common/erdosDatabaseClientApi.js';

interface RedisKeyViewerProps {
    connectionId: string;
    keyName?: string;
    onGetRedisKey: (connectionId: string, keyName: string) => Promise<IRedisKey>;
    onSetRedisKey: (connectionId: string, keyName: string, value: any, ttl?: number) => Promise<void>;
    onDeleteRedisKey: (connectionId: string, keyName: string) => Promise<void>;
    onRenameRedisKey: (connectionId: string, oldName: string, newName: string) => Promise<void>;
    onExecuteRedisCommand: (connectionId: string, command: string, args?: string[]) => Promise<any>;
    onShowMessage: (message: string, type: 'info' | 'warning' | 'error' | 'success') => void;
}

interface DialogState {
    visible: boolean;
    title: string;
    mode: 'add' | 'edit';
    itemKey: string;
    itemValue: string;
    editIndex?: number;
}

type ViewFormat = 'text' | 'json' | 'hex';

export const RedisKeyViewer: React.FC<RedisKeyViewerProps> = ({
    connectionId,
    keyName: initialKeyName,
    onGetRedisKey,
    onSetRedisKey,
    onDeleteRedisKey,
    onRenameRedisKey,
    onExecuteRedisCommand,
    onShowMessage
}) => {
    // Main state
    const [keyData, setKeyData] = useState<IRedisKey | null>(null);
    const [loading, setLoading] = useState(false);
    const [keyName, setKeyName] = useState(initialKeyName || '');
    const [keyTtl, setKeyTtl] = useState<number | string>('');
    const [viewFormat, setViewFormat] = useState<ViewFormat>('text');

    // String content state
    const [stringValue, setStringValue] = useState('');

    // Dialog state
    const [dialog, setDialog] = useState<DialogState>({
        visible: false,
        title: '',
        mode: 'add',
        itemKey: '',
        itemValue: ''
    });

    // Load key data
    const loadKeyData = useCallback(async (key: string) => {
        if (!key || !connectionId) return;

        setLoading(true);
        try {
            const data = await onGetRedisKey(connectionId, key);
            setKeyData(data);
            setKeyName(data.name);
            setKeyTtl(data.ttl > 0 ? data.ttl : '');

            // Set string content for string type
            if (data.type === 'string') {
                setStringValue(data.content || '');
                // Auto-detect JSON format
                if (data.content && typeof data.content === 'string') {
                    const trimmed = data.content.trim();
                    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                        setViewFormat('json');
                    }
                }
            }
        } catch (error: any) {
            onShowMessage(`Error loading key: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [connectionId, onGetRedisKey, onShowMessage]);

    // Handle key actions
    const handleRename = useCallback(async () => {
        if (!keyData || keyName === keyData.name) return;

        try {
            await onRenameRedisKey(connectionId, keyData.name, keyName);
            onShowMessage(`Key renamed from ${keyData.name} to ${keyName}`, 'success');
            setKeyData(prev => prev ? { ...prev, name: keyName } : null);
        } catch (error: any) {
            onShowMessage(`Error renaming key: ${error.message}`, 'error');
            setKeyName(keyData.name); // Reset to original name
        }
    }, [connectionId, keyData, keyName, onRenameRedisKey, onShowMessage]);

    const handleDelete = useCallback(async () => {
        if (!keyData) return;

        if (confirm(`Are you sure you want to delete key "${keyData.name}"?`)) {
            try {
                await onDeleteRedisKey(connectionId, keyData.name);
                onShowMessage(`Key ${keyData.name} deleted successfully`, 'success');
                setKeyData(null);
                setKeyName('');
            } catch (error: any) {
                onShowMessage(`Error deleting key: ${error.message}`, 'error');
            }
        }
    }, [connectionId, keyData, onDeleteRedisKey, onShowMessage]);

    const handleRefresh = useCallback(() => {
        if (keyData) {
            loadKeyData(keyData.name);
        }
    }, [keyData, loadKeyData]);

    const handleUpdateTtl = useCallback(async () => {
        if (!keyData) return;

        const ttl = parseInt(String(keyTtl)) || -1;
        try {
            await onExecuteRedisCommand(connectionId, 'EXPIRE', [keyData.name, String(ttl)]);
            onShowMessage(`TTL set to ${ttl} seconds for key ${keyData.name}`, 'success');
        } catch (error: any) {
            onShowMessage(`Error setting TTL: ${error.message}`, 'error');
        }
    }, [connectionId, keyData, keyTtl, onExecuteRedisCommand, onShowMessage]);

    // String content handlers
    const handleSaveString = useCallback(async () => {
        if (!keyData || keyData.type !== 'string') return;

        try {
            await onSetRedisKey(connectionId, keyData.name, stringValue);
            onShowMessage(`Key ${keyData.name} updated successfully`, 'success');
            setKeyData(prev => prev ? { ...prev, content: stringValue } : null);
        } catch (error: any) {
            onShowMessage(`Error updating key: ${error.message}`, 'error');
        }
    }, [connectionId, keyData, stringValue, onSetRedisKey, onShowMessage]);

    // Collection item handlers
    const handleAddItem = useCallback(() => {
        if (!keyData) return;

        setDialog({
            visible: true,
            title: getDialogTitle(keyData.type, 'add'),
            mode: 'add',
            itemKey: '',
            itemValue: ''
        });
    }, [keyData]);

    const handleEditItem = useCallback((index: number) => {
        if (!keyData) return;

        const rows = getCollectionRows(keyData);
        if (rows[index]) {
            const row = rows[index];
            setDialog({
                visible: true,
                title: getDialogTitle(keyData.type, 'edit'),
                mode: 'edit',
                itemKey: row.key || '',
                itemValue: row.value || row,
                editIndex: index
            });
        }
    }, [keyData]);

    const handleDeleteItem = useCallback(async (index: number) => {
        if (!keyData) return;

        const rows = getCollectionRows(keyData);
        if (rows[index]) {
            const row = rows[index];
            try {
                switch (keyData.type) {
                    case 'list':
                        await onExecuteRedisCommand(connectionId, 'LREM', [keyData.name, '1', String(row.value || row)]);
                        break;
                    case 'set':
                        await onExecuteRedisCommand(connectionId, 'SREM', [keyData.name, String(row.value || row)]);
                        break;
                    case 'hash':
                        await onExecuteRedisCommand(connectionId, 'HDEL', [keyData.name, String(row.key)]);
                        break;
                    case 'zset':
                        await onExecuteRedisCommand(connectionId, 'ZREM', [keyData.name, String(row.key)]);
                        break;
                }
                onShowMessage('Item deleted successfully', 'success');
                handleRefresh();
            } catch (error: any) {
                onShowMessage(`Error deleting item: ${error.message}`, 'error');
            }
        }
    }, [connectionId, keyData, onExecuteRedisCommand, onShowMessage, handleRefresh]);

    const handleConfirmDialog = useCallback(async () => {
        if (!keyData) return;

        try {
            const { itemKey, itemValue, mode } = dialog;

            switch (keyData.type) {
                case 'list':
                    await onExecuteRedisCommand(connectionId, 'RPUSH', [keyData.name, itemValue]);
                    break;
                case 'set':
                    await onExecuteRedisCommand(connectionId, 'SADD', [keyData.name, itemValue]);
                    break;
                case 'hash':
                    if (itemKey) {
                        await onExecuteRedisCommand(connectionId, 'HSET', [keyData.name, itemKey, itemValue]);
                    }
                    break;
                case 'zset':
                    const score = parseFloat(itemKey) || 0;
                    await onExecuteRedisCommand(connectionId, 'ZADD', [keyData.name, String(score), itemValue]);
                    break;
            }

            onShowMessage(`Item ${mode === 'add' ? 'added' : 'updated'} successfully`, 'success');
            setDialog(prev => ({ ...prev, visible: false }));
            handleRefresh();
        } catch (error: any) {
            onShowMessage(`Error ${dialog.mode === 'add' ? 'adding' : 'updating'} item: ${error.message}`, 'error');
        }
    }, [connectionId, keyData, dialog, onExecuteRedisCommand, onShowMessage, handleRefresh]);

    // Utility functions
    const getCollectionRows = (key: IRedisKey): Array<{ key?: string; value: any }> => {
        if (!key.content) return [];

        switch (key.type) {
            case 'list':
                return Array.isArray(key.content) 
                    ? key.content.map((item, index) => ({ key: index.toString(), value: item }))
                    : [];
            case 'set':
                return Array.isArray(key.content) 
                    ? key.content.map(item => ({ value: item }))
                    : [];
            case 'hash':
                return Array.isArray(key.content) 
                    ? key.content 
                    : Object.entries(key.content || {}).map(([k, v]) => ({ key: k, value: v }));
            case 'zset':
                return Array.isArray(key.content) ? key.content : [];
            default:
                return [];
        }
    };

    const getDialogTitle = (type: string, mode: 'add' | 'edit'): string => {
        const action = mode === 'edit' ? 'Edit' : 'Add to';
        switch (type) {
            case 'hash': return `${action} Hash`;
            case 'set': return `${action} Set`;
            case 'zset': return `${action} ZSet`;
            case 'list': return `${action} List`;
            default: return 'Add Item';
        }
    };

    const formatValue = (value: any): string => {
        if (value === null || value === undefined) return '';
        return String(value);
    };

    const convertToHex = (str: string): string => {
        return str.split('').map(char => 
            char.charCodeAt(0).toString(16).padStart(2, '0')
        ).join(' ');
    };

    const formatJsonContent = (content: string): string => {
        try {
            const parsed = JSON.parse(content);
            return JSON.stringify(parsed, null, 2);
        } catch {
            return content;
        }
    };

    // Effects
    useEffect(() => {
        if (initialKeyName) {
            loadKeyData(initialKeyName);
        }
    }, [initialKeyName, loadKeyData]);

    // Render content based on view format for strings
    const renderStringContent = () => {
        let displayValue = stringValue;
        
        switch (viewFormat) {
            case 'json':
                displayValue = formatJsonContent(stringValue);
                break;
            case 'hex':
                displayValue = convertToHex(stringValue);
                break;
            default:
                displayValue = stringValue;
        }

        return (
            <textarea 
                value={displayValue}
                onChange={(e) => setStringValue(e.target.value)}
                placeholder="String value"
                rows={10}
                className={viewFormat === 'json' ? 'format-json' : ''}
            />
        );
    };

    if (!keyData) {
        return (
            <div className="key-viewer">
                <div className="key-viewer-empty">
                    {loading ? 'Loading...' : 'No key selected'}
                </div>
            </div>
        );
    }

    return (
        <div className={`key-viewer ${loading ? 'loading' : ''}`}>
            <div className="key-header">
                <input 
                    type="text" 
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    onBlur={handleRename}
                    placeholder="Key name"
                />
                <span className={`key-type type-${keyData.type}`}>
                    {keyData.type.toUpperCase()}
                </span>
                <input 
                    type="number" 
                    value={keyTtl}
                    onChange={(e) => setKeyTtl(e.target.value)}
                    onBlur={handleUpdateTtl}
                    placeholder="TTL"
                />
                <button className="btn btn-secondary" onClick={handleRename}>
                    <i className="codicon codicon-edit"></i> Rename
                </button>
                <button className="btn btn-danger" onClick={handleDelete}>
                    <i className="codicon codicon-trash"></i> Delete
                </button>
                <button className="btn btn-success" onClick={handleRefresh}>
                    <i className="codicon codicon-refresh"></i> Refresh
                </button>
            </div>

            <div className="key-content">
                {keyData.type === 'string' && (
                    <div className="content-panel">
                        <div className="format-selector">
                            <select 
                                value={viewFormat}
                                onChange={(e) => setViewFormat(e.target.value as ViewFormat)}
                            >
                                <option value="text">Text</option>
                                <option value="json">JSON</option>
                                <option value="hex">Hex</option>
                            </select>
                        </div>
                        {renderStringContent()}
                        <button className="btn btn-primary" onClick={handleSaveString}>
                            Save
                        </button>
                    </div>
                )}

                {keyData.type !== 'string' && (
                    <div className="content-panel">
                        <div className="collection-toolbar">
                            <button className="btn btn-primary" onClick={handleAddItem}>
                                <i className="codicon codicon-add"></i> Add Item
                            </button>
                        </div>
                        <div className="data-grid">
                            <table className="collection-table">
                                <thead>
                                    <tr>
                                        {keyData.type === 'hash' && <th>Key</th>}
                                        {keyData.type === 'zset' && <th>Score</th>}
                                        {keyData.type === 'list' && <th>Index</th>}
                                        <th>Value</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {getCollectionRows(keyData).map((row, index) => (
                                        <tr key={index}>
                                            {(keyData.type === 'hash' || keyData.type === 'zset' || keyData.type === 'list') && (
                                                <td>{formatValue(row.key)}</td>
                                            )}
                                            <td>{formatValue(row.value)}</td>
                                            <td>
                                                <button 
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => handleEditItem(index)}
                                                >
                                                    <i className="codicon codicon-edit"></i>
                                                </button>
                                                <button 
                                                    className="btn btn-sm btn-danger"
                                                    onClick={() => handleDeleteItem(index)}
                                                >
                                                    <i className="codicon codicon-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {dialog.visible && (
                <div className="dialog">
                    <div className="dialog-content">
                        <h3>{dialog.title}</h3>
                        <div className="dialog-body">
                            {(keyData.type === 'hash' || keyData.type === 'zset') && (
                                <div className="form-group">
                                    <label htmlFor="itemKey">
                                        {keyData.type === 'hash' ? 'Key:' : 'Score:'}
                                    </label>
                                    <input 
                                        id="itemKey"
                                        type={keyData.type === 'zset' ? 'number' : 'text'}
                                        value={dialog.itemKey}
                                        onChange={(e) => setDialog(prev => ({ ...prev, itemKey: e.target.value }))}
                                    />
                                </div>
                            )}
                            <div className="form-group">
                                <label htmlFor="itemValue">
                                    {keyData.type === 'zset' ? 'Member:' : 'Value:'}
                                </label>
                                <textarea 
                                    id="itemValue"
                                    value={dialog.itemValue}
                                    onChange={(e) => setDialog(prev => ({ ...prev, itemValue: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="dialog-footer">
                            <button className="btn btn-primary" onClick={handleConfirmDialog}>
                                Confirm
                            </button>
                            <button 
                                className="btn btn-secondary" 
                                onClick={() => setDialog(prev => ({ ...prev, visible: false }))}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
END REDIS COMPONENT COMMENTED OUT */
