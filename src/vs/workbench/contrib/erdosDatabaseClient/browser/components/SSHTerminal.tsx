/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useCallback } from 'react';
import { ISSHTerminalConfig } from '../../common/erdosDatabaseClientApi.js';

interface SSHTerminalProps {
    config: ISSHTerminalConfig;
    onCreateSSHTerminal: (config: ISSHTerminalConfig) => Promise<string>;
    onShowMessage: (message: string, type: 'info' | 'warning' | 'error' | 'success') => void;
}

export const SSHTerminal: React.FC<SSHTerminalProps> = ({
    config,
    onCreateSSHTerminal,
    onShowMessage
}) => {
    const [isOpening, setIsOpening] = useState(false);
    const [lastTerminalId, setLastTerminalId] = useState<string | null>(null);

    // Handle opening SSH terminal - this creates the real xterm.js terminal in a webview
    const handleOpenTerminal = useCallback(async () => {
        if (isOpening) return;

        setIsOpening(true);
        
        try {
            // This calls the extension's API which:
            // 1. Creates a new XtermTerminal instance
            // 2. Calls XtermTerminal.openMethod(sshConfig) 
            // 3. Opens a webview panel with real xterm.js terminal
            // 4. Establishes actual SSH connection using ssh2.Client
            // 5. Returns terminal ID for reference
            const terminalId = await onCreateSSHTerminal(config);
            
            setLastTerminalId(terminalId);
            onShowMessage(`SSH Terminal opened for ${config.username}@${config.host}:${config.port}`, 'success');
            
        } catch (error: any) {
            onShowMessage(`Failed to open SSH Terminal: ${error.message}`, 'error');
        } finally {
            setIsOpening(false);
        }
    }, [config, isOpening, onCreateSSHTerminal, onShowMessage]);

    return (
        <div className="ssh-terminal-launcher">
            <div className="terminal-info">
                <h3>SSH Terminal</h3>
                <div className="connection-details">
                    <div className="detail-row">
                        <span className="label">Host:</span>
                        <span className="value">{config.host}:{config.port}</span>
                    </div>
                    <div className="detail-row">
                        <span className="label">Username:</span>
                        <span className="value">{config.username}</span>
                    </div>
                    {config.privateKeyPath && (
                        <div className="detail-row">
                            <span className="label">Key:</span>
                            <span className="value">{config.privateKeyPath}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="terminal-actions">
                <button 
                    className="btn btn-primary"
                    onClick={handleOpenTerminal}
                    disabled={isOpening}
                >
                    {isOpening ? (
                        <>
                            <i className="codicon codicon-loading codicon-modifier-spin"></i>
                            Opening Terminal...
                        </>
                    ) : (
                        <>
                            <i className="codicon codicon-terminal"></i>
                            Open SSH Terminal
                        </>
                    )}
                </button>
                
                {lastTerminalId && (
                    <div className="terminal-status">
                        <i className="codicon codicon-check"></i>
                        Terminal opened (ID: {lastTerminalId})
                    </div>
                )}
            </div>

            <div className="terminal-description">
                <p>
                    Click "Open SSH Terminal" to launch a new terminal window with a real SSH connection.
                    The terminal will open in a separate panel with full xterm.js functionality including:
                </p>
                <ul>
                    <li>Full SSH shell access with real command execution</li>
                    <li>Terminal emulation with colors and formatting</li>
                    <li>Copy/paste support (Ctrl+C/Ctrl+V)</li>
                    <li>Search functionality (Ctrl+F)</li>
                    <li>Resizable terminal window</li>
                    <li>Link detection and opening</li>
                </ul>
            </div>

        </div>
    );
};