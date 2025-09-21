/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { IForwardRule, ISSHTerminalConfig } from '../../common/erdosDatabaseClientApi.js';

interface PortForwardingProps {
    connectionId: string;
    sshConfig?: ISSHTerminalConfig;
    onGetForwardingRules: (connectionId: string) => Promise<IForwardRule[]>;
    onCreateForwardingRule: (connectionId: string, rule: Omit<IForwardRule, 'id' | 'state'>) => Promise<string>;
    onStartForwarding: (ruleId: string) => Promise<void>;
    onStopForwarding: (ruleId: string) => Promise<void>;
    onDeleteForwardingRule: (ruleId: string) => Promise<void>;
    onShowMessage: (message: string, type: 'info' | 'warning' | 'error' | 'success') => void;
}

interface ForwardDialogState {
    visible: boolean;
    mode: 'create' | 'edit';
    rule: Partial<IForwardRule>;
}

interface CommandDialogState {
    visible: boolean;
    command: string;
}

export const PortForwarding: React.FC<PortForwardingProps> = ({
    connectionId,
    sshConfig,
    onGetForwardingRules,
    onCreateForwardingRule,
    onStartForwarding,
    onStopForwarding,
    onDeleteForwardingRule,
    onShowMessage
}) => {
    // State
    const [forwardingRules, setForwardingRules] = useState<IForwardRule[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Dialog states
    const [forwardDialog, setForwardDialog] = useState<ForwardDialogState>({
        visible: false,
        mode: 'create',
        rule: {}
    });

    const [commandDialog, setCommandDialog] = useState<CommandDialogState>({
        visible: false,
        command: ''
    });

    // Load forwarding rules
    const loadForwardingRules = useCallback(async () => {
        if (!connectionId) return;

        setLoading(true);
        setError(null);
        try {
            const rules = await onGetForwardingRules(connectionId);
            setForwardingRules(rules);
        } catch (error: any) {
            const errorMessage = error.message || 'Failed to load forwarding rules';
            setError(errorMessage);
            onShowMessage(errorMessage, 'error');
        } finally {
            setLoading(false);
        }
    }, [connectionId, onGetForwardingRules, onShowMessage]);

    // Handle create/edit forward
    const handleSaveForward = useCallback(async () => {
        const { rule, mode } = forwardDialog;
        
        // Validate required fields
        if (!rule.name || !rule.localHost || !rule.localPort || !rule.remoteHost || !rule.remotePort) {
            onShowMessage('All fields are required', 'error');
            return;
        }

        setLoading(true);
        try {
            if (mode === 'create') {
                await onCreateForwardingRule(connectionId, {
                    name: rule.name,
                    localHost: rule.localHost,
                    localPort: rule.localPort,
                    remoteHost: rule.remoteHost,
                    remotePort: rule.remotePort,
                    sshConfig
                });
                onShowMessage('Forwarding rule created successfully', 'success');
            } else {
                // For edit mode, we would need an update method in the API
                onShowMessage('Edit functionality not yet implemented', 'warning');
            }
            
            setForwardDialog({ visible: false, mode: 'create', rule: {} });
            loadForwardingRules();
        } catch (error: any) {
            onShowMessage(`Failed to save forwarding rule: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [forwardDialog, connectionId, sshConfig, onCreateForwardingRule, onShowMessage, loadForwardingRules]);

    // Handle start tunnel
    const handleStartTunnel = useCallback(async (ruleId: string) => {
        setLoading(true);
        try {
            await onStartForwarding(ruleId);
            onShowMessage('Tunnel started successfully', 'success');
            
            // Update rule state locally
            setForwardingRules(prev => prev.map(rule => 
                rule.id === ruleId ? { ...rule, state: true } : rule
            ));
        } catch (error: any) {
            onShowMessage(`Failed to start tunnel: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [onStartForwarding, onShowMessage]);

    // Handle stop tunnel
    const handleStopTunnel = useCallback(async (ruleId: string) => {
        setLoading(true);
        try {
            await onStopForwarding(ruleId);
            onShowMessage('Tunnel stopped successfully', 'success');
            
            // Update rule state locally
            setForwardingRules(prev => prev.map(rule => 
                rule.id === ruleId ? { ...rule, state: false } : rule
            ));
        } catch (error: any) {
            onShowMessage(`Failed to stop tunnel: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [onStopForwarding, onShowMessage]);

    // Handle delete forward
    const handleDeleteForward = useCallback(async (ruleId: string, ruleName: string) => {
        if (!confirm(`Are you sure you want to delete the forwarding rule "${ruleName}"?`)) {
            return;
        }

        setLoading(true);
        try {
            await onDeleteForwardingRule(ruleId);
            onShowMessage('Forwarding rule deleted successfully', 'success');
            loadForwardingRules();
        } catch (error: any) {
            onShowMessage(`Failed to delete forwarding rule: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [onDeleteForwardingRule, onShowMessage, loadForwardingRules]);

    // Show SSH command
    const handleShowCommand = useCallback((rule: IForwardRule) => {
        if (!sshConfig) {
            onShowMessage('SSH configuration not available', 'warning');
            return;
        }

        const command = `ssh -qTnN -L ${rule.localHost}:${rule.localPort}:${rule.remoteHost}:${rule.remotePort} ${sshConfig.username}@${sshConfig.host}`;
        setCommandDialog({ visible: true, command });
    }, [sshConfig, onShowMessage]);

    // Copy command to clipboard
    const handleCopyCommand = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(commandDialog.command);
            onShowMessage('Command copied to clipboard', 'success');
            setCommandDialog({ visible: false, command: '' });
        } catch (error) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = commandDialog.command;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            onShowMessage('Command copied to clipboard', 'success');
            setCommandDialog({ visible: false, command: '' });
        }
    }, [commandDialog.command, onShowMessage]);

    // Open create dialog
    const openCreateDialog = useCallback(() => {
        setForwardDialog({
            visible: true,
            mode: 'create',
            rule: {
                name: '',
                localHost: '127.0.0.1',
                localPort: undefined,
                remoteHost: '127.0.0.1',
                remotePort: undefined
            }
        });
    }, []);

    // Open edit dialog
    const openEditDialog = useCallback((rule: IForwardRule) => {
        setForwardDialog({
            visible: true,
            mode: 'edit',
            rule: { ...rule }
        });
    }, []);

    // Close dialogs
    const closeForwardDialog = useCallback(() => {
        setForwardDialog({ visible: false, mode: 'create', rule: {} });
    }, []);

    const closeCommandDialog = useCallback(() => {
        setCommandDialog({ visible: false, command: '' });
    }, []);

    // Effects
    useEffect(() => {
        loadForwardingRules();
    }, [loadForwardingRules]);

    return (
        <div className={`forward-container ${loading ? 'loading' : ''}`}>
            {/* Toolbar */}
            <div className="toolbar">
                <button 
                    className="btn btn-primary" 
                    onClick={openCreateDialog}
                    disabled={loading}
                >
                    <i className="codicon codicon-add"></i> Add Forward
                </button>
                <button 
                    className="btn btn-secondary" 
                    onClick={loadForwardingRules}
                    disabled={loading}
                >
                    <i className="codicon codicon-refresh"></i> Refresh
                </button>
            </div>

            {/* Error Panel */}
            {error && (
                <div className="error-panel">
                    <p>Connection error! <span>{error}</span></p>
                    <button 
                        className="btn btn-secondary error-panel-dismiss"
                        onClick={() => setError(null)}
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Forwards Table */}
            <div className="forwards-table">
                <div className="table-header">
                    <div className="table-cell">Name</div>
                    <div className="table-cell">Local Host</div>
                    <div className="table-cell">Local Port</div>
                    <div className="table-cell">Remote Host</div>
                    <div className="table-cell">Remote Port</div>
                    <div className="table-cell">State</div>
                    <div className="table-cell">Actions</div>
                </div>
                <div className="table-body">
                    {forwardingRules.length === 0 ? (
                        <div className="table-row">
                            <div className="table-cell empty-message">
                                No forwarding rules configured
                            </div>
                        </div>
                    ) : (
                        forwardingRules.map(rule => (
                            <div key={rule.id} className="table-row">
                                <div className="table-cell">{rule.name}</div>
                                <div className="table-cell">{rule.localHost}</div>
                                <div className="table-cell">{rule.localPort}</div>
                                <div className="table-cell">{rule.remoteHost}</div>
                                <div className="table-cell">{rule.remotePort}</div>
                                <div className="table-cell">
                                    <span className={`status-badge ${rule.state ? 'running' : 'stopped'}`}>
                                        {rule.state ? 'Running' : 'Stopped'}
                                    </span>
                                </div>
                                <div className="table-cell">
                                    <div className="actions">
                                        {!rule.state ? (
                                            <button 
                                                className="btn btn-success"
                                                onClick={() => handleStartTunnel(rule.id)}
                                                disabled={loading}
                                                title="Start"
                                            >
                                                <i className="codicon codicon-play"></i>
                                            </button>
                                        ) : (
                                            <button 
                                                className="btn btn-danger"
                                                onClick={() => handleStopTunnel(rule.id)}
                                                disabled={loading}
                                                title="Stop"
                                            >
                                                <i className="codicon codicon-stop-circle"></i>
                                            </button>
                                        )}
                                        <button 
                                            className="btn btn-primary"
                                            onClick={() => openEditDialog(rule)}
                                            disabled={loading}
                                            title="Edit"
                                        >
                                            <i className="codicon codicon-edit"></i>
                                        </button>
                                        <button 
                                            className="btn btn-secondary"
                                            onClick={() => handleShowCommand(rule)}
                                            disabled={loading}
                                            title="Show SSH command"
                                        >
                                            <i className="codicon codicon-info"></i>
                                        </button>
                                        <button 
                                            className="btn btn-danger"
                                            onClick={() => handleDeleteForward(rule.id, rule.name)}
                                            disabled={loading}
                                            title="Delete"
                                        >
                                            <i className="codicon codicon-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Add/Edit Forward Dialog */}
            {forwardDialog.visible && (
                <div className="dialog">
                    <div className="dialog-content">
                        <h3>{forwardDialog.mode === 'create' ? 'Create Forward' : 'Edit Forward'}</h3>
                        <div className="dialog-body">
                            <div className="form-group">
                                <label htmlFor="forwardName">Name:</label>
                                <input 
                                    id="forwardName"
                                    type="text" 
                                    className="form-control"
                                    value={forwardDialog.rule.name || ''}
                                    onChange={(e) => setForwardDialog(prev => ({
                                        ...prev,
                                        rule: { ...prev.rule, name: e.target.value }
                                    }))}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="localHost">Local Host:</label>
                                <input 
                                    id="localHost"
                                    type="text" 
                                    className="form-control"
                                    value={forwardDialog.rule.localHost || ''}
                                    onChange={(e) => setForwardDialog(prev => ({
                                        ...prev,
                                        rule: { ...prev.rule, localHost: e.target.value }
                                    }))}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="localPort">Local Port:</label>
                                <input 
                                    id="localPort"
                                    type="number" 
                                    className="form-control"
                                    value={forwardDialog.rule.localPort || ''}
                                    onChange={(e) => setForwardDialog(prev => ({
                                        ...prev,
                                        rule: { ...prev.rule, localPort: parseInt(e.target.value) || undefined }
                                    }))}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="remoteHost">Remote Host:</label>
                                <input 
                                    id="remoteHost"
                                    type="text" 
                                    className="form-control"
                                    value={forwardDialog.rule.remoteHost || ''}
                                    onChange={(e) => setForwardDialog(prev => ({
                                        ...prev,
                                        rule: { ...prev.rule, remoteHost: e.target.value }
                                    }))}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="remotePort">Remote Port:</label>
                                <input 
                                    id="remotePort"
                                    type="number" 
                                    className="form-control"
                                    value={forwardDialog.rule.remotePort || ''}
                                    onChange={(e) => setForwardDialog(prev => ({
                                        ...prev,
                                        rule: { ...prev.rule, remotePort: parseInt(e.target.value) || undefined }
                                    }))}
                                    required
                                />
                            </div>
                        </div>
                        <div className="dialog-footer">
                            <button 
                                className="btn btn-primary" 
                                onClick={handleSaveForward}
                                disabled={loading}
                            >
                                Save
                            </button>
                            <button 
                                className="btn btn-secondary" 
                                onClick={closeForwardDialog}
                                disabled={loading}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Command Info Dialog */}
            {commandDialog.visible && (
                <div className="dialog">
                    <div className="dialog-content">
                        <h3>SSH Command</h3>
                        <div className="dialog-body">
                            <div className="command-display">
                                <code>{commandDialog.command}</code>
                            </div>
                        </div>
                        <div className="dialog-footer">
                            <button 
                                className="btn btn-primary" 
                                onClick={handleCopyCommand}
                            >
                                Copy
                            </button>
                            <button 
                                className="btn btn-secondary" 
                                onClick={closeCommandDialog}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
