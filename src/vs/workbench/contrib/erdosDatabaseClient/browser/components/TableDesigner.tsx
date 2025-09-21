/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { DatabaseType } from '../../common/erdosDatabaseClientApi.js';

interface ColumnInfo {
    name: string;
    type: string;
    comment: string;
    maxLength: number;
    defaultValue: string;
    isPrimary: boolean;
    isUnique: boolean;
    nullable: string;
    isAutoIncrement: boolean;
}

interface IndexInfo {
    index_name: string;
    column_name: string;
    non_unique: boolean;
    index_type: string;
}

interface TableDesignerProps {
    tableName?: string;
    database?: string;
    onLoadTable: (table: string) => Promise<{ columns: ColumnInfo[]; indexes: IndexInfo[]; comment: string; dbType: DatabaseType }>;
    onUpdateTable: (newTableName: string, newComment: string) => Promise<void>;
    onAddColumn: (column: ColumnInfo) => Promise<void>;
    onUpdateColumn: (column: ColumnInfo & { originalName?: string }) => Promise<void>;
    onDeleteColumn: (columnName: string) => Promise<void>;
    onAddIndex: (index: { column: string; type: string }) => Promise<void>;
    onDeleteIndex: (indexName: string) => Promise<void>;
    onShowMessage: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const TableDesigner: React.FC<TableDesignerProps> = ({
    tableName: initialTableName = '',
    database = '',
    onLoadTable,
    onUpdateTable,
    onAddColumn,
    onUpdateColumn,
    onDeleteColumn,
    onAddIndex,
    onDeleteIndex,
    onShowMessage
}) => {
    // State - exactly matching original JavaScript state
    const [designData, setDesignData] = useState({
        table: '',
        columns: [] as ColumnInfo[],
        indexes: [] as IndexInfo[],
        comment: '',
        dbType: DatabaseType.MySQL
    });

    // Form state
    const [tableNameInput, setTableNameInput] = useState('');
    const [tableComment, setTableComment] = useState('');

    // Dialog states
    const [columnDialog, setColumnDialog] = useState({
        visible: false,
        isEdit: false,
        editingColumn: null as ColumnInfo | null,
        columnName: '',
        columnType: '',
        columnComment: '',
        columnNotNull: false
    });

    const [indexDialog, setIndexDialog] = useState({
        visible: false,
        selectedColumn: '',
        indexType: 'UNIQUE'
    });

    // Tab state
    const [activeTab, setActiveTab] = useState<'columns' | 'indexes'>('columns');

    // Initialize component
    useEffect(() => {
        if (initialTableName) {
            loadTable(initialTableName);
        }
    }, [initialTableName]);

    // Load table design - matching original requestTableDesign
    const loadTable = useCallback(async (table: string) => {
        try {
            const data = await onLoadTable(table);
            setDesignData({
                table,
                columns: data.columns,
                indexes: data.indexes,
                comment: data.comment,
                dbType: data.dbType
            });
            setTableNameInput(table);
            setTableComment(data.comment);
        } catch (error: any) {
            onShowMessage(error.message || 'Failed to load table design', 'error');
        }
    }, [onLoadTable, onShowMessage]);

    // Update table - matching original updateTable
    const updateTable = useCallback(async () => {
        const newTableName = tableNameInput.trim();
        const newComment = tableComment.trim();

        if (!newTableName) {
            onShowMessage('Table name is required', 'error');
            return;
        }

        try {
            await onUpdateTable(newTableName, newComment);
            onShowMessage('Table updated successfully', 'success');
            // Refresh table data
            await loadTable(newTableName);
        } catch (error: any) {
            onShowMessage(error.message || 'Failed to update table', 'error');
        }
    }, [tableNameInput, tableComment, onUpdateTable, onShowMessage, loadTable]);

    // Refresh table - matching original refresh
    const refreshTable = useCallback(async () => {
        if (designData.table) {
            await loadTable(designData.table);
        }
    }, [designData.table, loadTable]);

    // Add/Edit column - matching original addColumn/editColumn
    const openColumnDialog = useCallback((column: ColumnInfo | null = null) => {
        const isEdit = column !== null;
        setColumnDialog({
            visible: true,
            isEdit,
            editingColumn: column,
            columnName: column?.name || '',
            columnType: column?.type || '',
            columnComment: column?.comment || '',
            columnNotNull: column?.nullable === 'NO'
        });
    }, []);

    const closeColumnDialog = useCallback(() => {
        setColumnDialog({
            visible: false,
            isEdit: false,
            editingColumn: null,
            columnName: '',
            columnType: '',
            columnComment: '',
            columnNotNull: false
        });
    }, []);

    const saveColumn = useCallback(async () => {
        const { columnName, columnType, columnComment, columnNotNull, isEdit, editingColumn } = columnDialog;

        if (!columnName.trim() || !columnType.trim()) {
            onShowMessage('Column name and type are required', 'error');
            return;
        }

        const columnData: ColumnInfo & { originalName?: string } = {
            name: columnName.trim(),
            type: columnType.trim(),
            comment: columnComment.trim(),
            nullable: columnNotNull ? 'NO' : 'YES',
            maxLength: 0,
            defaultValue: '',
            isPrimary: false,
            isUnique: false,
            isAutoIncrement: false
        };

        try {
            if (isEdit && editingColumn) {
                columnData.originalName = editingColumn.name;
                await onUpdateColumn(columnData);
                onShowMessage('Column updated successfully', 'success');
            } else {
                await onAddColumn(columnData);
                onShowMessage('Column added successfully', 'success');
            }
            closeColumnDialog();
            await refreshTable();
        } catch (error: any) {
            onShowMessage(error.message || 'Failed to save column', 'error');
        }
    }, [columnDialog, onAddColumn, onUpdateColumn, onShowMessage, closeColumnDialog, refreshTable]);

    // Delete column - matching original deleteColumn
    const deleteColumn = useCallback(async (columnName: string) => {
        if (!window.confirm(`Are you sure you want to delete column "${columnName}"?`)) {
            return;
        }

        try {
            await onDeleteColumn(columnName);
            onShowMessage('Column deleted successfully', 'success');
            await refreshTable();
        } catch (error: any) {
            onShowMessage(error.message || 'Failed to delete column', 'error');
        }
    }, [onDeleteColumn, onShowMessage, refreshTable]);

    // Add index - matching original addIndex
    const openIndexDialog = useCallback(() => {
        setIndexDialog({
            visible: true,
            selectedColumn: designData.columns.length > 0 ? designData.columns[0].name : '',
            indexType: 'UNIQUE'
        });
    }, [designData.columns]);

    const closeIndexDialog = useCallback(() => {
        setIndexDialog({
            visible: false,
            selectedColumn: '',
            indexType: 'UNIQUE'
        });
    }, []);

    const saveIndex = useCallback(async () => {
        const { selectedColumn, indexType } = indexDialog;

        if (!selectedColumn) {
            onShowMessage('Column selection is required', 'error');
            return;
        }

        try {
            await onAddIndex({ column: selectedColumn, type: indexType });
            onShowMessage('Index created successfully', 'success');
            closeIndexDialog();
            await refreshTable();
        } catch (error: any) {
            onShowMessage(error.message || 'Failed to create index', 'error');
        }
    }, [indexDialog, onAddIndex, onShowMessage, closeIndexDialog, refreshTable]);

    // Delete index - matching original deleteIndex
    const deleteIndex = useCallback(async (indexName: string) => {
        if (!window.confirm(`Are you sure you want to delete index "${indexName}"?`)) {
            return;
        }

        try {
            await onDeleteIndex(indexName);
            onShowMessage('Index deleted successfully', 'success');
            await refreshTable();
        } catch (error: any) {
            onShowMessage(error.message || 'Failed to delete index', 'error');
        }
    }, [onDeleteIndex, onShowMessage, refreshTable]);

    // Render column row - matching original columns grid
    const renderColumnRow = useCallback((column: ColumnInfo, index: number) => (
        <tr key={index} className="data-row">
            <td>{column.name}</td>
            <td>{column.type}</td>
            <td>{column.comment}</td>
            <td>{column.maxLength || ''}</td>
            <td>{column.defaultValue}</td>
            <td>{column.isPrimary ? '✓' : ''}</td>
            <td>{column.isUnique ? '✓' : ''}</td>
            <td>{column.nullable === 'NO' ? '✓' : ''}</td>
            <td>{column.isAutoIncrement ? '✓' : ''}</td>
            <td className="action-cell">
                <button 
                    className="btn-icon" 
                    title="Edit"
                    onClick={() => openColumnDialog(column)}
                >
                    <i className="codicon codicon-edit"></i>
                </button>
                <button 
                    className="btn-icon" 
                    title="Delete"
                    onClick={() => deleteColumn(column.name)}
                >
                    <i className="codicon codicon-trash"></i>
                </button>
            </td>
        </tr>
    ), [openColumnDialog, deleteColumn]);

    // Render index row - matching original indexes grid
    const renderIndexRow = useCallback((indexInfo: IndexInfo, index: number) => (
        <tr key={index} className="data-row">
            <td>{indexInfo.index_name}</td>
            <td>{indexInfo.column_name}</td>
            <td>{indexInfo.non_unique ? 'Yes' : 'No'}</td>
            <td>{indexInfo.index_type}</td>
            <td className="action-cell">
                <button 
                    className="btn-icon" 
                    title="Delete"
                    onClick={() => deleteIndex(indexInfo.index_name)}
                >
                    <i className="codicon codicon-trash"></i>
                </button>
            </td>
        </tr>
    ), [deleteIndex]);

    return (
        <div className="design-container">
            {/* Table Info Panel - exactly matching original */}
            <div className="info-panel">
                <div className="form-group">
                    <label htmlFor="tableNameInput">Table <span className="text-red">*</span>:</label>
                    <input 
                        id="tableNameInput"
                        type="text" 
                        className="form-control"
                        value={tableNameInput}
                        onChange={(e) => setTableNameInput(e.target.value)}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="tableComment">Comment <span className="text-red">*</span>:</label>
                    <input 
                        id="tableComment"
                        type="text" 
                        className="form-control"
                        value={tableComment}
                        onChange={(e) => setTableComment(e.target.value)}
                    />
                </div>
                <button className="btn btn-success" onClick={updateTable}>Update</button>
                <button className="btn btn-success" onClick={refreshTable}>
                    <i className="codicon codicon-refresh"></i> Refresh
                </button>
            </div>
            
            {/* Tab Navigation - exactly matching original */}
            <div className="design-tabs">
                <button 
                    className={`tab-btn ${activeTab === 'columns' ? 'active' : ''}`}
                    onClick={() => setActiveTab('columns')}
                >
                    Columns
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'indexes' ? 'active' : ''}`}
                    onClick={() => setActiveTab('indexes')}
                >
                    Indexes
                </button>
            </div>
            
            {/* Columns Panel - exactly matching original */}
            {activeTab === 'columns' && (
                <div className="tab-panel">
                    <div className="panel-toolbar">
                        <button className="btn btn-primary" onClick={() => openColumnDialog()}>
                            <i className="codicon codicon-add"></i> Add Column
                        </button>
                    </div>
                    <div className="columns-grid">
                        <table className="design-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Type</th>
                                    <th>Comment</th>
                                    <th>Length</th>
                                    <th>Default</th>
                                    <th>Primary Key</th>
                                    <th>Unique</th>
                                    <th>Not Null</th>
                                    <th>Auto Increment</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {designData.columns.map(renderColumnRow)}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {/* Indexes Panel - exactly matching original */}
            {activeTab === 'indexes' && (
                <div className="tab-panel">
                    <div className="panel-toolbar">
                        <button className="btn btn-primary" onClick={openIndexDialog}>
                            <i className="codicon codicon-add"></i> Add Index
                        </button>
                    </div>
                    <div className="indexes-grid">
                        <table className="design-table">
                            <thead>
                                <tr>
                                    <th>Index Name</th>
                                    <th>Column Name</th>
                                    <th>Non Unique</th>
                                    <th>Index Type</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {designData.indexes.map(renderIndexRow)}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Add/Edit Column Dialog - exactly matching original */}
            {columnDialog.visible && (
                <div className="dialog">
                    <div className="dialog-content">
                        <h3>{columnDialog.isEdit ? 'Edit Column' : 'Add Column'}</h3>
                        <div className="dialog-body">
                            <div className="form-group">
                                <label htmlFor="columnName">Name:</label>
                                <input 
                                    id="columnName"
                                    type="text" 
                                    className="form-control"
                                    value={columnDialog.columnName}
                                    onChange={(e) => setColumnDialog(prev => ({ ...prev, columnName: e.target.value }))}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="columnType">Type:</label>
                                <input 
                                    id="columnType"
                                    type="text" 
                                    className="form-control"
                                    value={columnDialog.columnType}
                                    onChange={(e) => setColumnDialog(prev => ({ ...prev, columnType: e.target.value }))}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="columnComment">Comment:</label>
                                <input 
                                    id="columnComment"
                                    type="text" 
                                    className="form-control"
                                    value={columnDialog.columnComment}
                                    onChange={(e) => setColumnDialog(prev => ({ ...prev, columnComment: e.target.value }))}
                                />
                            </div>
                            <div className="form-group">
                                <label>
                                    <input 
                                        type="checkbox" 
                                        checked={columnDialog.columnNotNull}
                                        onChange={(e) => setColumnDialog(prev => ({ ...prev, columnNotNull: e.target.checked }))}
                                    /> Not Null
                                </label>
                            </div>
                        </div>
                        <div className="dialog-footer">
                            <button className="btn btn-primary" onClick={saveColumn}>Save</button>
                            <button className="btn btn-secondary" onClick={closeColumnDialog}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Index Dialog - exactly matching original */}
            {indexDialog.visible && (
                <div className="dialog">
                    <div className="dialog-content">
                        <h3>Add Index</h3>
                        <div className="dialog-body">
                            <div className="form-group">
                                <label htmlFor="indexColumn">Column:</label>
                                <select 
                                    id="indexColumn"
                                    className="form-control"
                                    value={indexDialog.selectedColumn}
                                    onChange={(e) => setIndexDialog(prev => ({ ...prev, selectedColumn: e.target.value }))}
                                >
                                    {designData.columns.map(column => (
                                        <option key={column.name} value={column.name}>
                                            {column.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label htmlFor="indexType">Index Type:</label>
                                <select 
                                    id="indexType"
                                    className="form-control"
                                    value={indexDialog.indexType}
                                    onChange={(e) => setIndexDialog(prev => ({ ...prev, indexType: e.target.value }))}
                                >
                                    <option value="UNIQUE">UNIQUE</option>
                                    <option value="INDEX">INDEX</option>
                                    <option value="PRIMARY KEY">PRIMARY KEY</option>
                                </select>
                            </div>
                        </div>
                        <div className="dialog-footer">
                            <button className="btn btn-primary" onClick={saveIndex}>Create</button>
                            <button className="btn btn-secondary" onClick={closeIndexDialog}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};