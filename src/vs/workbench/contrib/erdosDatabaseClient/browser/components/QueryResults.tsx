/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { IQueryResult, IFieldInfo, DatabaseType, IDatabaseConnection } from '../../common/erdosDatabaseClientApi.js';
import { SQLMonacoEditor } from './SQLMonacoEditor.js';

interface QueryResultsProps {
    connectionId?: string;
    connection?: IDatabaseConnection;
    breadcrumbPath?: string[];
    initialQuery?: string;
    initialResults?: IQueryResult;
    onExecuteQuery: (sql: string, options?: { pageSize?: number; pageNum?: number; recordHistory?: boolean }) => Promise<IQueryResult>;
    onExportData: (options: { type: 'csv' | 'json' | 'xlsx' | 'sql'; withOutLimit: boolean; sql: string; table?: string }) => Promise<{ success: boolean; filename?: string; message?: string }>;
    onSaveModify: (sql: string) => Promise<void>;
    onCount: (sql: string) => Promise<number>;
    onCopyToClipboard: (value: string) => Promise<void>;
    onShowMessage: (message: string, type: 'info' | 'warning' | 'error' | 'success') => void;
    onShowProgress: (title: string, task: () => Promise<void>) => Promise<void>;
    onSaveCellModify: (sql: string) => Promise<void>;
    onEsSort: (originalSql: string, sort: any[]) => Promise<IQueryResult>;
}

export const QueryResults: React.FC<QueryResultsProps> = ({
    connectionId,
    connection,
    breadcrumbPath,
    initialQuery = '',
    initialResults,
    onExecuteQuery,
    onExportData,
    onSaveModify,
    onCount,
    onCopyToClipboard,
    onShowMessage,
    onShowProgress,
    onSaveCellModify,
    onEsSort
}) => {
    // State - exactly matching original JavaScript state
    const [result, setResult] = useState<IQueryResult>({
        sql: '',
        data: [],
        fields: [],
        duration: 0,
        dbType: DatabaseType.MySQL,
        database: undefined,
        table: undefined,
        primaryKey: undefined,
        primaryKeyList: undefined,
        tableCount: undefined,
        transId: undefined
    });

    const [_, setPage] = useState({
        pageNum: 1,
        pageSize: -1,
        total: null as number | null
    });

    const [table, setTable] = useState({
        search: '',
        loading: true,
        widthItem: {} as Record<string, number>
    });

    // Resize state management
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
    const [rowHeights, setRowHeights] = useState<Record<number, number>>({});
    const [isResizing, setIsResizing] = useState<{
        type: 'column' | 'row' | null;
        index: string | number | null;
        startX: number;
        startY: number;
        startWidth: number;
        startHeight: number;
    }>({
        type: null,
        index: null,
        startX: 0,
        startY: 0,
        startWidth: 0,
        startHeight: 0
    });

    const [toolbar, setToolbar] = useState({
        sql: null as string | null,
        filter: {} as Record<string, any>,
        showColumns: [] as string[]
    });

    const [editDialog, setEditDialog] = useState({
        visible: false,
        loading: false,
        mode: 'insert' as 'insert' | 'update' | 'copy',
        originModel: {} as any,
        editModel: {} as any,
        columnList: [] as any[],
        primaryKey: null as string | null,
        primaryKeyList: [] as any[],
        dbType: null as DatabaseType | null,
        database: null as string | null,
        table: null as string | null
    });

    const [exportOption, setExportOption] = useState({
        visible: false
    });

    // Cell editing state - matching original update object
    const [editList, setEditList] = useState<Record<number, any>>({});
    const [editLock, setEditLock] = useState(false);

    // Additional state for dialogs
    const [showColumnSelector, setShowColumnSelector] = useState(false);
    const [exportType, setExportType] = useState('xlsx');
    const [removeLimit, setRemoveLimit] = useState(true);
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

    // Query input state
    const [queryInput, setQueryInput] = useState(initialQuery);

    // Sorting state - for chevron indicators
    const [sortField, setSortField] = useState<{ field: string | null; direction: 'asc' | 'desc' }>({ 
        field: null, 
        direction: 'asc' 
    });
    
    // Track when we initiated a sort operation to avoid resetting sort state
    const [sortOperationInProgress, setSortOperationInProgress] = useState<boolean>(false);


    // Initialize component - matching original init function
    useEffect(() => {
        if (initialResults) {
            handleDataReceived(initialResults);
        }
    }, [initialResults]);


    // Execute query - matching original executeQuery function
    const executeQuery = useCallback(async () => {
        if (!queryInput.trim()) return;

        const sql = queryInput.trim();
        setTable(prev => ({ ...prev, loading: true }));
        
        // This is a manual query execution, not a sort operation
        setSortOperationInProgress(false);

        try {
            const queryResult = await onExecuteQuery(sql, { recordHistory: true });
            handleDataReceived(queryResult);
            // Update the query input to show the actual executed query
            setQueryInput(sql);
        } catch (error: any) {
            onShowMessage(error.message || 'Query execution failed', 'error');
            setTable(prev => ({ ...prev, loading: false }));
        }
    }, [queryInput, onExecuteQuery, onShowMessage]);

    // Handle data received - matching original handleDataReceived
    const handleDataReceived = useCallback((queryResult: IQueryResult) => {
        setResult(queryResult);
        setToolbar(prev => ({ ...prev, sql: queryResult.sql }));
        
        // Initialize show columns
        if (queryResult.fields && queryResult.fields.length > 0) {
            setToolbar(prev => ({
                ...prev,
                showColumns: queryResult.fields?.map(f => f.name.toLowerCase()) || []
            }));
        }

        // Set pagination
        if (queryResult.total != null) {
            setPage(prev => ({ ...prev, total: queryResult.total || null }));
        } else {
            setPage(prev => ({ ...prev, total: queryResult.data.length }));
        }

        // Clear edit state
        setSelectedRows(new Set());
        setEditList({});
        setEditLock(false);
        
        // Only reset sort state if this data is NOT the result of our own sort operation
        if (!sortOperationInProgress) {
            setSortField({ field: null, direction: 'asc' });
        } else {
            // Clear the flag now that we've received the sorted results
            setSortOperationInProgress(false);
        }
        
        setTable(prev => ({ ...prev, loading: false }));
    }, [sortOperationInProgress]);

    // Handle sorted data received - preserves sort state correctly
    const handleSortedDataReceived = useCallback((queryResult: IQueryResult, fieldName: string, direction: 'asc' | 'desc') => {
        setResult(queryResult);
        setToolbar(prev => ({ ...prev, sql: queryResult.sql }));
        
        // Initialize show columns
        if (queryResult.fields && queryResult.fields.length > 0) {
            setToolbar(prev => ({
                ...prev,
                showColumns: queryResult.fields?.map(f => f.name.toLowerCase()) || []
            }));
        }

        // Set pagination
        if (queryResult.total != null) {
            setPage(prev => ({ ...prev, total: queryResult.total || null }));
        } else {
            setPage(prev => ({ ...prev, total: queryResult.data.length }));
        }

        // Clear edit state
        setSelectedRows(new Set());
        setEditList({});
        setEditLock(false);
        
        // Set the correct sort state based on the actual sort operation
        setSortField({ field: fieldName, direction });
        setSortOperationInProgress(false);
        
        setTable(prev => ({ ...prev, loading: false }));
    }, []);

    // Filter data based on search - matching original
    const getFilteredData = useCallback(() => {
        if (!table.search) return result.data;
        return result.data.filter(row => 
            JSON.stringify(row).toLowerCase().includes(table.search.toLowerCase())
        );
    }, [result.data, table.search]);

    // Handle row selection - matching original
    const toggleRowSelection = useCallback((index: number) => {
        setSelectedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            } else {
                newSet.add(index);
            }
            return newSet;
        });
    }, []);

    // Get selected rows data - matching original
    const getSelectedRowsData = useCallback(() => {
        const filteredData = getFilteredData();
        const selectedData: any[] = [];
        selectedRows.forEach(index => {
            if (filteredData[index]) {
                selectedData.push(filteredData[index]);
            }
        });
        return selectedData;
    }, [getFilteredData, selectedRows]);

    // Delete selected rows - matching original
    const deleteSelectedRows = useCallback(async () => {
        const selectedData = getSelectedRowsData();
        if (selectedData.length === 0) {
            onShowMessage('You need to select at least one row of data.', 'warning');
            return;
        }

        if (!window.confirm('Are you sure you want to delete this data?')) {
            return;
        }

        try {
            // Build delete SQL based on database type
            let deleteSql = '';
            const primaryKeyValues = selectedData
                .filter(row => row[result.primaryKey || ''] != null)
                .map(row => formatValue(getColumnType(result.primaryKey || ''), row[result.primaryKey || '']));

            if (result.dbType === DatabaseType.ElasticSearch) {
                if (primaryKeyValues.length > 1) {
                    deleteSql = `POST /_bulk\n${primaryKeyValues.map(id => 
                        `{ "delete" : { "_index" : "${result.table}", "_id" : "${id}" } }`
                    ).join('\n')}`;
                } else {
                    deleteSql = `DELETE /${result.table}/_doc/${primaryKeyValues[0]}`;
                }
            } else if (result.dbType === DatabaseType.MongoDB) {
                deleteSql = `db('${result.database}').collection("${result.table}")
                    .deleteMany({_id:{$in:[${primaryKeyValues.join(',')}]}})`;
            } else {
                const tableName = escapeTableName(result.table || '', result.dbType || DatabaseType.MySQL);
                if (primaryKeyValues.length > 1) {
                    deleteSql = `DELETE FROM ${tableName} WHERE ${result.primaryKey} in (${primaryKeyValues.join(',')})`;
                } else {
                    deleteSql = `DELETE FROM ${tableName} WHERE ${result.primaryKey}=${primaryKeyValues[0]}`;
                }
            }

            await onExecuteQuery(deleteSql);
            onShowMessage('Rows deleted successfully', 'success');
        } catch (error: any) {
            onShowMessage(error.message || 'Delete failed', 'error');
        }
    }, [getSelectedRowsData, result, onExecuteQuery, onShowMessage]);

    // Export data - matching original
    const handleExport = useCallback(async () => {
        try {
            const exportResult = await onExportData({
                type: exportType as any,
                withOutLimit: removeLimit,
                sql: result.sql,
                table: result.table
            });
            
            if (exportResult.success) {
                onShowMessage('Export completed successfully', 'success');
            } else {
                onShowMessage(exportResult.message || 'Export failed', 'error');
            }
        } catch (error: any) {
            onShowMessage(error.message || 'Export failed', 'error');
        }
        setExportOption({ visible: false });
    }, [exportType, removeLimit, result, onExportData, onShowMessage]);

    // Helper functions - matching original
    const formatValue = useCallback((columnType: string | null, value: any): string => {
        if (value == null) return 'NULL';
        
        const type = columnType ? columnType.toUpperCase() : '';
        if (type.includes('INT') || type.includes('DECIMAL') || 
            type.includes('FLOAT') || type.includes('DOUBLE') || 
            type.includes('NUMERIC') || type.includes('NUMBER')) {
            return value.toString();
        }
        if (type.includes('BOOL')) {
            return value ? 'true' : 'false';
        }
        return `'${value.toString().replace(/'/g, "''")}'`;
    }, []);

    const getColumnType = useCallback((columnName: string): string | null => {
        // Use result.fields for column type lookup - matching original getTypeByColumn
        if (!result.fields) return null;
        const column = result.fields.find(col => col.name === columnName);
        return column ? column.type : null;
    }, [result.fields]);

    const escapeTableName = useCallback((tableName: string, dbType: DatabaseType): string => {
        switch (dbType) {
            case DatabaseType.MySQL:
                return `\`${tableName}\``;
            case DatabaseType.PostgreSQL:
                return `"${tableName}"`;
            case DatabaseType.SqlServer:
                return `[${tableName}]`;
            default:
                return tableName;
        }
    }, []);

    // Render cell content - matching original
    const renderCellContent = useCallback((value: any, field: IFieldInfo, dbType: DatabaseType) => {
        if (value == null) {
            return <span className="null-column">(NULL)</span>;
        }
        
        if (dbType === DatabaseType.ElasticSearch) {
            return value && typeof value === 'object' && value.hasOwnProperty('type')
                ? String.fromCharCode.apply(null, Array.from(new Uint16Array(value.data)))
                : value;
        }
        
        return value && typeof value === 'object' && value.hasOwnProperty('type')
            ? String.fromCharCode.apply(null, Array.from(new Uint16Array(value.data)))
            : value.toString();
    }, []);

    // Handle query input change - works with both textarea and Monaco editor
    const handleQueryInputChange = useCallback((e: { target: { value: string } }) => {
        setQueryInput(e.target.value);
    }, []);

    // Handle keyboard shortcuts - matching original
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.ctrlKey && e.key === 'Enter') {
            executeQuery();
            e.preventDefault();
        }
    }, [executeQuery]);

    // Handle inline cell editing - exactly matching original handleCellEdit
    const handleCellEdit = useCallback((e: React.FocusEvent<HTMLTableCellElement>) => {
        const cell = e.target as HTMLTableCellElement;
        const field = cell.dataset.field;
        const rowIndex = parseInt(cell.dataset.rowIndex || '0');
        const newValue = cell.textContent || '';
        const filteredData = getFilteredData();
        const originalData = filteredData[rowIndex];
        
        if (!field || !originalData) {
            return;
        }
        
        // Track the edit - exactly matching original logic
        setEditList(prev => {
            const newEditList = { ...prev };
            if (!newEditList[rowIndex]) {
                newEditList[rowIndex] = { ...originalData };
                // Remove _XID if it exists (matching original)
                delete newEditList[rowIndex]._XID;
            }
            newEditList[rowIndex][field] = newValue;
            return newEditList;
        });
        
        // Send data modification event (matching original)
        // This adds * to title to indicate unsaved changes
        onShowMessage('Data modified - press Ctrl+S to save', 'info');
        
        // Show visual feedback (matching original)
        cell.classList.add('cell-edited');
        setTimeout(() => cell.classList.remove('cell-edited'), 2000);
    }, [getFilteredData, onShowMessage]);

    // Save cell modifications - exactly matching original save function
    const saveCellModifications = useCallback(async () => {
        if (Object.keys(editList).length === 0 || editLock) return;
        
        setEditLock(true);
        
        try {
            let sql = '';
            for (const index in editList) {
                const editedRow = editList[index];
                const originalRow = result.data[parseInt(index)];
                sql += buildUpdateSQL(editedRow, originalRow);
            }
            
            if (sql) {
                await onSaveCellModify(sql);
                // Clear edit list after successful save
                setEditList({});
                onShowMessage('Changes saved successfully', 'success');
            }
        } catch (error) {
            onShowMessage(`Save failed: ${error.message}`, 'error');
        } finally {
            setEditLock(false);
        }
    }, [editList, editLock, result.data, onSaveCellModify, onShowMessage]);

    // Add keyboard shortcut for saving cell modifications - matching original
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 's' && Object.keys(editList).length > 0) {
                e.preventDefault();
                saveCellModifications();
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editList, saveCellModifications]);

    // Check if a cell is editable - matching original logic
    const isCellEditable = useCallback((field?: IFieldInfo) => {
        return result.primaryKey && result.tableCount === 1;
    }, [result.primaryKey, result.tableCount]);

    // Handle column sorting - matching original tmp_database_client X function
    const handleSort = useCallback((fieldName: string) => {
        // Calculate the new direction BEFORE updating state
        const newDirection = sortField.field === fieldName && sortField.direction === 'desc' ? 'asc' : 'desc';
        
        // Mark that we're initiating a sort operation
        setSortOperationInProgress(true);
        
        // Update chevron state
        setSortField({
            field: fieldName,
            direction: newDirection
        });

        // Handle ElasticSearch differently (as in original)
        if (result.dbType === DatabaseType.ElasticSearch) {
            // Use the dedicated ElasticSearch sort handler
            onEsSort(result.sql, [{ [fieldName]: { order: newDirection } }]).then((sortResult) => {
                // Process the received data to update the table with sort info preserved
                handleSortedDataReceived(sortResult, fieldName, newDirection);
                // Update the query input to show the sorted query (ElasticSearch keeps original SQL)
                setQueryInput(result.sql);
            });
            return;
        }

        // Build ORDER BY SQL - fixed to prevent progressive spacing
        let sql = result.sql
            .replace(/\n/g, ' ')
            .replace(';', '')
            .replace(/order by .+? (desc|asc)?/gi, '');
        
        // Handle LIMIT clause separately to avoid progressive spacing
        const limitMatch = sql.match(/\s*(limit.+)$/i);
        if (limitMatch) {
            sql = sql.replace(/\s*(limit.+)$/i, '');
            sql = `${sql.trim()} ORDER BY ${fieldName} ${newDirection.toUpperCase()} ${limitMatch[1]}`;
        } else {
            sql = `${sql.trim()} ORDER BY ${fieldName} ${newDirection.toUpperCase()}`;
        }
        
        // Execute the sorted query using existing mechanism
        const sortedSql = sql + ';';
        
        onExecuteQuery(sortedSql).then((queryResult) => {
            // Process the received data to update the table with sort info preserved
            handleSortedDataReceived(queryResult, fieldName, newDirection);
            // Update the query input to show the actual executed query
            setQueryInput(sortedSql);
        });
    }, [result.dbType, result.sql, sortField, onExecuteQuery, onEsSort, handleSortedDataReceived]);



    // Build UPDATE SQL - exactly matching original buildUpdateSql function
    const buildUpdateSQL = useCallback((editedRow: any, originalRow: any): string => {
        const updates: string[] = [];
        
        for (const field in editedRow) {
            const originalValue = originalRow[field];
            const editedValue = editedRow[field];
            
            if (originalValue !== editedValue) {
                const columnType = getColumnType(field);
                updates.push(`${field} = ${formatValue(columnType, editedValue)}`);
            }
        }
        
        if (updates.length === 0) return '';
        
        const tableName = escapeTableName(result.table || '', result.dbType || DatabaseType.MySQL);
        const primaryKeyValue = formatValue(
            getColumnType(result.primaryKey || ''), 
            originalRow[result.primaryKey || '']
        );
        
        return `UPDATE ${tableName} SET ${updates.join(', ')} WHERE ${result.primaryKey} = ${primaryKeyValue};\n`;
    }, [result, formatValue, getColumnType, escapeTableName]);

    // Save edited cells - matching original saveModify functionality
    const saveEditedCells = useCallback(async () => {
        if (Object.keys(editList).length === 0 || editLock) return;
        
        setEditLock(true);
        
        try {
            let sql = '';
            const filteredData = getFilteredData();
            
            for (const rowIndex in editList) {
                const editedRow = editList[rowIndex];
                const originalRow = filteredData[parseInt(rowIndex)];
                sql += buildUpdateSQL(editedRow, originalRow);
            }
            
            if (sql) {
                await onSaveModify(sql);
                onShowMessage('Update successful', 'success');
                setEditList({});
            }
        } catch (error: any) {
            onShowMessage(error.message || 'Update failed', 'error');
        } finally {
            setEditLock(false);
        }
    }, [editList, editLock, getFilteredData, buildUpdateSQL, onSaveModify, onShowMessage]);

    // Add keyboard shortcut for saving changes
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 's' && Object.keys(editList).length > 0) {
                e.preventDefault();
                saveEditedCells();
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editList, saveEditedCells]);

    // Resize handlers
    const handleResizeStart = useCallback((
        type: 'column' | 'row',
        index: string | number,
        e: React.MouseEvent
    ) => {
        e.preventDefault();
        e.stopPropagation();

        const startWidth = type === 'column' ? (columnWidths[index as string] || 150) : 0;
        const startHeight = type === 'row' ? (rowHeights[index as number] || 35) : 0;

        setIsResizing({
            type,
            index,
            startX: e.clientX,
            startY: e.clientY,
            startWidth,
            startHeight
        });
    }, [columnWidths, rowHeights]);

    const handleResizeMove = useCallback((e: MouseEvent) => {
        if (!isResizing.type || isResizing.index === null) return;

        e.preventDefault();
        
        if (isResizing.type === 'column') {
            const deltaX = e.clientX - isResizing.startX;
            const newWidth = Math.max(0, isResizing.startWidth + deltaX);
            
            setColumnWidths(prev => ({
                ...prev,
                [isResizing.index as string]: newWidth
            }));
        } else if (isResizing.type === 'row') {
            const deltaY = e.clientY - isResizing.startY;
            const newHeight = Math.max(0, isResizing.startHeight + deltaY);
            
            setRowHeights(prev => ({
                ...prev,
                [isResizing.index as number]: newHeight
            }));
        }
    }, [isResizing]);

    const handleResizeEnd = useCallback(() => {
        setIsResizing({
            type: null,
            index: null,
            startX: 0,
            startY: 0,
            startWidth: 0,
            startHeight: 0
        });
    }, []);

    // Mouse event listeners for resizing
    useEffect(() => {
        if (isResizing.type) {
            document.addEventListener('mousemove', handleResizeMove);
            document.addEventListener('mouseup', handleResizeEnd);
            document.body.style.cursor = isResizing.type === 'column' ? 'col-resize' : 'row-resize';
            document.body.style.userSelect = 'none';
            
            return () => {
                document.removeEventListener('mousemove', handleResizeMove);
                document.removeEventListener('mouseup', handleResizeEnd);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            };
        }
        
        return () => {
            // Cleanup function for when isResizing.type is null
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing.type, handleResizeMove, handleResizeEnd]);

    // Get column width helper
    const getColumnWidth = useCallback((fieldName: string): number => {
        return columnWidths[fieldName] || 150; // Default width of 150px
    }, [columnWidths]);

    // Get row height helper
    const getRowHeight = useCallback((rowIndex: number): number => {
        return rowHeights[rowIndex] || 35; // Default height of 35px
    }, [rowHeights]);

    return (
        <div className="results-container">
            {/* Breadcrumb Navigation - displaying parent chain path */}
            <div className="breadcrumb-container">
                <div className="breadcrumb-path">
                    {breadcrumbPath && breadcrumbPath.length > 0 ? (
                        breadcrumbPath.map((segment, index) => (
                            <React.Fragment key={index}>
                                {index > 0 && (
                                    <span className="breadcrumb-separator">/</span>
                                )}
                                <span className="breadcrumb-item">
                                    {index === 0 && <i className="codicon codicon-database"></i>}
                                    <span>{segment}</span>
                                </span>
                            </React.Fragment>
                        ))
                    ) : (
                        <span className="breadcrumb-item">
                            <i className="codicon codicon-database"></i>
                            <span>{connection?.name || 'Connection'}</span>
                        </span>
                    )}
                </div>
            </div>

            {/* Main Table Actions Toolbar - exactly matching original */}
            <div className="table-actions-toolbar">
                <div className="toolbar-left">
                    <button 
                        className="btn btn-icon" 
                        title="Insert (Add)"
                        onClick={() => setEditDialog(prev => ({ ...prev, visible: true, mode: 'insert' }))}
                    >
                        <i className="codicon codicon-add"></i>
                    </button>
                    <button 
                        className="btn btn-icon" 
                        title="Delete"
                        onClick={deleteSelectedRows}
                    >
                        <i className="codicon codicon-trash"></i>
                    </button>
                    <button 
                        className="btn btn-icon" 
                        title="Export"
                        onClick={() => setExportOption({ visible: true })}
                    >
                        <i className="codicon codicon-go-to-file"></i>
                    </button>
                    <button 
                        className="btn btn-icon" 
                        title="Execute (Run/Play)"
                        onClick={executeQuery}
                    >
                        <i className="codicon codicon-play"></i>
                    </button>
                    <button 
                        className="btn btn-icon" 
                        title="Select columns to show"
                        onClick={() => setShowColumnSelector(true)}
                    >
                        <i className="codicon codicon-filter"></i>
                    </button>
                    {Object.keys(editList).length > 0 && (
                        <button 
                            className="btn btn-icon" 
                            title="Save changes (Ctrl+S)"
                            onClick={saveEditedCells}
                            disabled={editLock}
                        >
                            <i className="codicon codicon-save"></i>
                        </button>
                    )}
                </div>
                
                <div className="toolbar-right">
                    <input 
                        type="text" 
                        className="search-input" 
                        placeholder="Search table data..."
                        value={table.search}
                        onChange={(e) => setTable(prev => ({ ...prev, search: e.target.value }))}
                    />
                </div>
            </div>

            {/* Query Editor - Monaco SQL Editor */}
            <SQLMonacoEditor
                value={queryInput}
                onChange={handleQueryInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Enter your SQL query here..."
            />

            {/* Results Content - exactly matching original */}
            <div className="results-content">
                <div className={`data-table-container ${table.loading ? 'loading' : ''}`}>
                    {table.loading ? (
                        <div className="loading">Loading...</div>
                    ) : (result.data && result.data.length > 0 && result.fields && result.fields.length > 0) ? (
                        <table className="results-table">
                            <thead>
                                <tr>
                                    <th className="index-col">
                                        <span>#</span>
                                    </th>
                                    {result.fields?.filter(field => 
                                        toolbar.showColumns.includes(field.name.toLowerCase())
                                    ).map((field, index) => {
                                        const isCurrentSort = sortField.field === field.name;
                                        const sortClass = isCurrentSort ? `sorted-${sortField.direction}` : '';
                                        return (
                                            <th 
                                                key={field.name} 
                                                className={`sortable column-header ${sortClass}`}
                                                onClick={() => handleSort(field.name)}
                                                title={`Click to sort by ${field.name}`}
                                                style={{ 
                                                    width: `${getColumnWidth(field.name)}px`,
                                                    position: 'relative'
                                                }}
                                            >
                                                <div className="column-header-content">
                                                    <span className="column-name">{field.name}</span>
                                                    <span className="column-type">{field.type || ''}</span>
                                                    <div className="sort-indicators">
                                                        <i className={`codicon codicon-chevron-up sort-chevron ${
                                                            isCurrentSort && sortField.direction === 'asc' ? 'active' : 
                                                            isCurrentSort ? 'hidden' : ''
                                                        }`}></i>
                                                        <i className={`codicon codicon-chevron-down sort-chevron ${
                                                            isCurrentSort && sortField.direction === 'desc' ? 'active' : 
                                                            isCurrentSort ? 'hidden' : ''
                                                        }`}></i>
                                                    </div>
                                                </div>
                                                <div 
                                                    className="column-resize-handle"
                                                    onMouseDown={(e) => handleResizeStart('column', field.name, e)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    title="Drag to resize column"
                                                />
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {getFilteredData().map((row, rowIndex) => (
                                    <tr 
                                        key={rowIndex} 
                                        className={selectedRows.has(rowIndex) ? 'selected-row' : ''}
                                        style={{ 
                                            height: `${getRowHeight(rowIndex)}px`,
                                            position: 'relative'
                                        }}
                                    >
                                        <td 
                                            className="row-number-cell" 
                                            onClick={() => toggleRowSelection(rowIndex)}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation(); // Prevent any bubbling
                                                setEditDialog(prev => ({
                                                    ...prev,
                                                    visible: true,
                                                    mode: 'update',
                                                    originModel: row,
                                                    editModel: { ...row }
                                                }));
                                            }}
                                            title="Click to select row, double-click to edit"
                                            style={{ position: 'relative' }}
                                        >
                                            {rowIndex + 1}
                                            <div 
                                                className="row-resize-handle"
                                                onMouseDown={(e) => handleResizeStart('row', rowIndex, e)}
                                                onClick={(e) => e.stopPropagation()}
                                                title="Drag to resize row"
                                            />
                                        </td>
                                        {result.fields?.filter(field => 
                                            toolbar.showColumns.includes(field.name.toLowerCase())
                                        ).map(field => {
                                            const isEditable = isCellEditable(field);
                                            return (
                                                <td 
                                                    key={field.name} 
                                                    className={`data-cell ${isEditable ? 'editable-cell' : ''}`}
                                                    data-field={field.name}
                                                    data-row-index={rowIndex}
                                                    contentEditable={isEditable ? true : false}
                                                    onBlur={isEditable ? handleCellEdit : undefined}
                                                    onDoubleClick={isEditable ? (e) => {
                                                        e.stopPropagation(); // Prevent row double-click from firing
                                                        // Cell is already contentEditable, just focus it
                                                        (e.target as HTMLElement).focus();
                                                    } : undefined}
                                                    suppressContentEditableWarning={true}
                                                    title={isEditable ? undefined : String(renderCellContent(row[field.name], field, result.dbType || DatabaseType.MySQL) || '')}
                                                    style={{ 
                                                        width: `${getColumnWidth(field.name)}px`
                                                    }}
                                                >
                                                    {renderCellContent(row[field.name], field, result.dbType || DatabaseType.MySQL)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="message-panel">
                            <div className="message info">No data to display</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Export Dialog - exactly matching original */}
            {exportOption.visible && (
                <div className="dialog">
                    <div className="dialog-content">
                        <h3>Export Options</h3>
                        <div className="dialog-body">
                            <div className="form-group">
                                <label htmlFor="exportType">Export File Type:</label>
                                <select 
                                    id="exportType" 
                                    className="form-control"
                                    value={exportType}
                                    onChange={(e) => setExportType(e.target.value)}
                                >
                                    <option value="csv">CSV</option>
                                    <option value="json">JSON</option>
                                    <option value="xlsx">Excel (XLSX)</option>
                                    <option value="sql">SQL</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>
                                    <input 
                                        type="checkbox" 
                                        checked={removeLimit}
                                        onChange={(e) => setRemoveLimit(e.target.checked)}
                                    /> Remove Limit
                                </label>
                            </div>
                        </div>
                        <div className="dialog-footer">
                            <button className="btn btn-primary" onClick={handleExport}>Export</button>
                            <button 
                                className="btn btn-secondary" 
                                onClick={() => setExportOption({ visible: false })}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Column Selector Dialog - exactly matching original */}
            {showColumnSelector && (
                <div className="dialog">
                    <div className="dialog-content">
                        <h3>Select columns to show</h3>
                        <div className="dialog-body">
                            <div className="column-checkboxes">
                                {result.fields?.map((field, index) => (
                                    <div key={field.name} className="checkbox-container">
                                        <input 
                                            type="checkbox" 
                                            id={`column_${index}`}
                                            checked={toolbar.showColumns.includes(field.name.toLowerCase())}
                                            onChange={(e) => {
                                                const columnName = field.name.toLowerCase();
                                                if (e.target.checked) {
                                                    setToolbar(prev => ({
                                                        ...prev,
                                                        showColumns: [...prev.showColumns, columnName]
                                                    }));
                                                } else {
                                                    setToolbar(prev => ({
                                                        ...prev,
                                                        showColumns: prev.showColumns.filter(col => col !== columnName)
                                                    }));
                                                }
                                            }}
                                        />
                                        <label htmlFor={`column_${index}`}>{field.name}</label>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="dialog-footer">
                            <button 
                                className="btn btn-secondary"
                                onClick={() => setToolbar(prev => ({
                                    ...prev,
                                    showColumns: result.fields?.map(f => f.name.toLowerCase()) || []
                                }))}
                            >
                                Select All
                            </button>
                            <button 
                                className="btn btn-secondary"
                                onClick={() => setToolbar(prev => ({ ...prev, showColumns: [] }))}
                            >
                                Deselect All
                            </button>
                            <button 
                                className="btn btn-primary" 
                                onClick={() => setShowColumnSelector(false)}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Row Dialog - exactly matching original */}
            {editDialog.visible && (
                <div className="dialog">
                    <div className="dialog-content">
                        <h3>
                            {editDialog.mode === 'insert' ? `Insert To ${editDialog.table || result.table}` :
                             editDialog.mode === 'update' ? `Edit For ${editDialog.table || result.table}` :
                             `Copy To ${editDialog.table || result.table}`}
                        </h3>
                        <div className="dialog-body">
                            {result.fields?.map(field => (
                                <div key={field.name} className="form-group">
                                    <label htmlFor={`edit_${field.name}`}>
                                        {field.name} : {field.type}
                                        <span className="text-red"> *</span>
                                    </label>
                                    <input 
                                        type="text" 
                                        id={`edit_${field.name}`}
                                        className="form-control"
                                        value={editDialog.editModel[field.name] || ''}
                                        onChange={(e) => setEditDialog(prev => ({
                                            ...prev,
                                            editModel: { ...prev.editModel, [field.name]: e.target.value }
                                        }))}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="dialog-footer">
                            <button 
                                className="btn btn-primary"
                                onClick={async () => {
                                    // Handle save logic here
                                    setEditDialog(prev => ({ ...prev, visible: false }));
                                }}
                            >
                                {editDialog.mode === 'update' ? 'Update' : 'Insert'}
                            </button>
                            <button 
                                className="btn btn-secondary" 
                                onClick={() => setEditDialog(prev => ({ ...prev, visible: false }))}
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