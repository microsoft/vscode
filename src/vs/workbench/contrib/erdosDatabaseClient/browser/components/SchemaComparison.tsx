/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/*
import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { DatabaseType } from '../../common/erdosDatabaseClientApi.js';

interface ComparisonOption {
    from: {
        connection: string;
        database: string;
        db?: any;
    };
    to: {
        connection: string;
        database: string;
        db?: any;
    };
}

interface SqlStatement {
    type: string;
    sql: string;
    selected: boolean;
}

interface ComparisonResult {
    sqlList: SqlStatement[];
}

interface ConnectionNode {
    uid: string;
    label: string;
    dbType: DatabaseType;
}

interface DatabaseNode {
    label: string;
    uid: string;
}

interface SchemaComparisonProps {
    onLoadConnections: () => Promise<{ nodes: ConnectionNode[]; databaseList: Record<string, DatabaseNode[]> }>;
    onStartComparison: (option: ComparisonOption) => Promise<ComparisonResult>;
    onSyncChanges: (sqlList: SqlStatement[], option: ComparisonOption) => Promise<void>;
    onShowMessage: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const SchemaComparison: React.FC<SchemaComparisonProps> = ({
    onLoadConnections,
    onStartComparison,
    onSyncChanges,
    onShowMessage
}) => {
    // State - exactly matching original JavaScript state
    const [structDiffData, setStructDiffData] = useState({
        nodes: [] as ConnectionNode[],
        databaseList: {} as Record<string, DatabaseNode[]>
    });

    const [comparisonOption, setComparisonOption] = useState<ComparisonOption>({
        from: {
            connection: '',
            database: '',
            db: null
        },
        to: {
            connection: '',
            database: '',
            db: null
        }
    });

    const [comparisonResults, setComparisonResults] = useState<ComparisonResult>({
        sqlList: []
    });

    // UI state
    const [loading, setLoading] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [showError, setShowError] = useState(false);

    // Form state
    const [fromConnection, setFromConnection] = useState('');
    const [fromDatabase, setFromDatabase] = useState('');
    const [toConnection, setToConnection] = useState('');
    const [toDatabase, setToDatabase] = useState('');

    // Initialize component - matching original init
    useEffect(() => {
        initializeView();
    }, []);

    const initializeView = useCallback(async () => {
        try {
            const data = await onLoadConnections();
            setStructDiffData(data);
        } catch (error: any) {
            showErrorMessage(error.message || 'Failed to load connections');
        }
    }, [onLoadConnections]);

    // Handle connection changes - matching original
    const handleFromConnectionChange = useCallback((connectionId: string) => {
        setFromConnection(connectionId);
        setFromDatabase('');
        setComparisonOption(prev => ({
            ...prev,
            from: {
                connection: connectionId,
                database: '',
                db: null
            }
        }));
    }, []);

    const handleToConnectionChange = useCallback((connectionId: string) => {
        setToConnection(connectionId);
        setToDatabase('');
        setComparisonOption(prev => ({
            ...prev,
            to: {
                connection: connectionId,
                database: '',
                db: null
            }
        }));
    }, []);

    // Handle database changes - matching original
    const handleDatabaseChange = useCallback((databaseName: string, isFrom: boolean) => {
        const connectionId = isFrom ? fromConnection : toConnection;
        if (connectionId && structDiffData.databaseList[connectionId]) {
            const dbNode = structDiffData.databaseList[connectionId].find(db => db.label === databaseName);
            if (dbNode) {
                if (isFrom) {
                    setFromDatabase(databaseName);
                    setComparisonOption(prev => ({
                        ...prev,
                        from: {
                            connection: connectionId,
                            database: databaseName,
                            db: dbNode
                        }
                    }));
                } else {
                    setToDatabase(databaseName);
                    setComparisonOption(prev => ({
                        ...prev,
                        to: {
                            connection: connectionId,
                            database: databaseName,
                            db: dbNode
                        }
                    }));
                }
            }
        }
    }, [fromConnection, toConnection, structDiffData.databaseList]);

    // Start comparison - matching original
    const startComparison = useCallback(async () => {
        if (!comparisonOption.from.connection || !comparisonOption.from.database || 
            !comparisonOption.to.connection || !comparisonOption.to.database) {
            showErrorMessage('Please select both source and target connections and databases');
            return;
        }

        setLoading(true);
        hideErrorMessage();

        try {
            const result = await onStartComparison(comparisonOption);
            setComparisonResults(result);
            setLoading(false);

            if (!result.sqlList || result.sqlList.length === 0) {
                showErrorMessage('No differences found between the selected schemas');
                return;
            }

            setShowResults(true);
        } catch (error: any) {
            showErrorMessage(error.message || 'Comparison failed');
            setLoading(false);
        }
    }, [comparisonOption, onStartComparison]);

    // Sync changes - matching original
    const syncChanges = useCallback(async () => {
        const selectedStatements = comparisonResults.sqlList.filter(sql => sql.selected);
        
        if (selectedStatements.length === 0) {
            showErrorMessage('Need to select at least one SQL statement!');
            return;
        }

        setLoading(true);

        try {
            await onSyncChanges(selectedStatements, comparisonOption);
            onShowMessage('Sync completed successfully', 'success');
            setShowResults(false);
            setComparisonResults({ sqlList: [] });
            setLoading(false);
        } catch (error: any) {
            showErrorMessage(error.message || 'Sync failed');
            setLoading(false);
        }
    }, [comparisonResults.sqlList, comparisonOption, onSyncChanges, onShowMessage]);

    // Select all/none - matching original
    const selectAllStatements = useCallback(() => {
        setComparisonResults(prev => ({
            ...prev,
            sqlList: prev.sqlList.map(sql => ({ ...sql, selected: true }))
        }));
    }, []);

    const selectNoneStatements = useCallback(() => {
        setComparisonResults(prev => ({
            ...prev,
            sqlList: prev.sqlList.map(sql => ({ ...sql, selected: false }))
        }));
    }, []);

    // Toggle individual statement selection
    const toggleStatementSelection = useCallback((index: number) => {
        setComparisonResults(prev => ({
            ...prev,
            sqlList: prev.sqlList.map((sql, i) => 
                i === index ? { ...sql, selected: !sql.selected } : sql
            )
        }));
    }, []);

    // Error handling - matching original
    const showErrorMessage = useCallback((message: string) => {
        setErrorMessage(message);
        setShowError(true);
    }, []);

    const hideErrorMessage = useCallback(() => {
        setShowError(false);
    }, []);

    // Get databases for connection - matching original
    const getDatabasesForConnection = useCallback((connectionId: string): DatabaseNode[] => {
        return connectionId && structDiffData.databaseList[connectionId] 
            ? structDiffData.databaseList[connectionId] 
            : [];
    }, [structDiffData.databaseList]);

    return (
        <div className="struct-diff-container">
            <div className="comparison-options">
                <div className="option-panel">
                    <h4>Target</h4>
                    <div className="form-group">
                        <label htmlFor="fromConnection">Connection:</label>
                        <select 
                            id="fromConnection" 
                            className="form-control"
                            value={fromConnection}
                            onChange={(e) => handleFromConnectionChange(e.target.value)}
                        >
                            <option value="">Select connection...</option>
                            {structDiffData.nodes.map(node => (
                                <option key={node.uid} value={node.uid}>
                                    {node.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="fromDatabase">Database:</label>
                        <select 
                            id="fromDatabase" 
                            className="form-control"
                            value={fromDatabase}
                            onChange={(e) => handleDatabaseChange(e.target.value, true)}
                        >
                            <option value="">Select database...</option>
                            {getDatabasesForConnection(fromConnection).map(db => (
                                <option key={db.label} value={db.label}>
                                    {db.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                
                <div className="option-panel">
                    <h4>Sync From</h4>
                    <div className="form-group">
                        <label htmlFor="toConnection">Connection:</label>
                        <select 
                            id="toConnection" 
                            className="form-control"
                            value={toConnection}
                            onChange={(e) => handleToConnectionChange(e.target.value)}
                        >
                            <option value="">Select connection...</option>
                            {structDiffData.nodes.map(node => (
                                <option key={node.uid} value={node.uid}>
                                    {node.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="toDatabase">Database:</label>
                        <select 
                            id="toDatabase" 
                            className="form-control"
                            value={toDatabase}
                            onChange={(e) => handleDatabaseChange(e.target.value, false)}
                        >
                            <option value="">Select database...</option>
                            {getDatabasesForConnection(toConnection).map(db => (
                                <option key={db.label} value={db.label}>
                                    {db.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
            
            <div className="comparison-actions">
                <button 
                    className="btn btn-danger" 
                    onClick={startComparison}
                    disabled={loading}
                >
                    <i className="codicon codicon-compare-changes"></i> Compare
                </button>
            </div>
            
            {showResults && (
                <div className="comparison-results">
                    <div className="results-toolbar">
                        <button 
                            className="btn btn-success" 
                            onClick={syncChanges}
                            disabled={loading}
                        >
                            <i className="codicon codicon-sync"></i> Sync
                        </button>
                        <button className="btn btn-secondary" onClick={selectAllStatements}>
                            Select All
                        </button>
                        <button className="btn btn-secondary" onClick={selectNoneStatements}>
                            Select None
                        </button>
                    </div>
                    
                    <div className="results-grid">
                        <table className="schema-comparison-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={comparisonResults.sqlList.every(sql => sql.selected)}
                                            onChange={(e) => e.target.checked ? selectAllStatements() : selectNoneStatements()}
                                        />
                                    </th>
                                    <th style={{ width: '80px' }}>Type</th>
                                    <th>SQL Statement</th>
                                </tr>
                            </thead>
                            <tbody>
                                {comparisonResults.sqlList.map((sqlStatement, index) => (
                                    <tr key={index} className="sql-row">
                                        <td>
                                            <input 
                                                type="checkbox" 
                                                checked={sqlStatement.selected}
                                                onChange={() => toggleStatementSelection(index)}
                                            />
                                        </td>
                                        <td className={`sql-type sql-type-${sqlStatement.type}`}>
                                            {sqlStatement.type.toUpperCase()}
                                        </td>
                                        <td className="sql-statement">
                                            <code>{sqlStatement.sql}</code>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {loading && (
                <div className="loading">
                    <div className="spinner"></div>
                    <span>Comparing schemas...</span>
                </div>
            )}
            
            {showError && (
                <div className="error-message">
                    <span>{errorMessage}</span>
                </div>
            )}
        </div>
    );
};
*/