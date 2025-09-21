/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';

interface RedisTerminalProps {
    connectionId: string;
    config?: {
        host: string;
        port: number;
        database?: number;
    };
    onExecuteRedisCommand: (connectionId: string, command: string, args?: string[]) => Promise<any>;
    onShowMessage: (message: string, type: 'info' | 'warning' | 'error') => void;
}

interface CommandSuggestion {
    value: string;
}

export const RedisTerminal: React.FC<RedisTerminalProps> = ({
    connectionId,
    config,
    onExecuteRedisCommand,
    onShowMessage
}) => {
    // State
    const [terminalContent, setTerminalContent] = useState('');
    const [currentInput, setCurrentInput] = useState('');
    const [commandHistory, setCommandHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [suggestions, setSuggestions] = useState<CommandSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [currentDatabase, setCurrentDatabase] = useState(config?.database || 0);

    // Refs
    const terminalRef = useRef<HTMLTextAreaElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Redis command suggestions
    const commandSuggestions = [
        "DEL ", "KEYS ", "TTL ", "PING ", "EXISTS ",
        // string
        "SET ", "SETNX ", "GET ", "STRLEN ", "INCR ", "DECR ",
        // hash
        "HKEYS ", "HDEL ", "HMSET ", "HGETALL ",
        // list
        "LPUSH ", "LINDEX ", "LLEN ", "LREM ", "RPOP ", "LPOP ", "LSET ",
        // set
        "SADD ", "SDIFF ", "SMEMBERS ", "SPOP ",
        // sorted set
        "ZADD ",
        // transaction
        "MULTI ", "EXEC "
    ];

    // Append content to terminal
    const appendToTerminal = useCallback((text: string) => {
        setTerminalContent(prev => prev + text + '\n');
    }, []);

    // Scroll terminal to bottom
    const scrollToBottom = useCallback(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, []);

    // Focus input
    const focusInput = useCallback(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    // Add command to history
    const addToHistory = useCallback((command: string) => {
        if (!command || !command.trim()) return;

        setCommandHistory(prev => {
            // Don't add duplicate consecutive commands
            if (prev[prev.length - 1] === command) {
                return prev;
            }
            return [...prev, command];
        });
        setHistoryIndex(0); // Reset to end
    }, []);

    // Navigate command history
    const navigateHistory = useCallback((direction: 'up' | 'down') => {
        if (showSuggestions) return; // Don't navigate if suggestions are showing

        setCommandHistory(prev => {
            if (prev.length === 0) return prev;

            let newIndex = historyIndex;
            
            if (direction === 'up') {
                newIndex = Math.min(historyIndex + 1, prev.length);
            } else {
                newIndex = Math.max(historyIndex - 1, 0);
            }

            setHistoryIndex(newIndex);

            // Set input value
            if (newIndex === 0) {
                setCurrentInput('');
            } else {
                setCurrentInput(prev[prev.length - newIndex] || '');
            }

            return prev;
        });
    }, [historyIndex, showSuggestions]);

    // Handle input suggestions
    const handleInputSuggestions = useCallback((input: string) => {
        if (!input) {
            setShowSuggestions(false);
            setSuggestions([]);
            return;
        }

        const matches = commandSuggestions.filter(suggestion => 
            suggestion.toLowerCase().indexOf(input.toLowerCase()) !== -1
        );

        if (matches.length > 0) {
            const uniqueMatches = [...new Set(matches)].map(item => ({ value: item }));
            setSuggestions(uniqueMatches);
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
            setSuggestions([]);
        }
    }, [commandSuggestions]);

    // Parse command into command and arguments
    const parseCommand = useCallback((command: string): { cmd: string; args: string[] } => {
        const parts = command.trim().split(/\s+/);
        const cmd = parts[0] || '';
        const args = parts.slice(1);
        return { cmd, args };
    }, []);

    // Resolve result for display
    const resolveResult = useCallback((result: any): string => {
        if (result === null) {
            return 'null';
        }
        
        if (typeof result === 'object') {
            const isArray = Array.isArray(result);
            let output = '';
            
            for (const i in result) {
                if (typeof result[i] === 'object') {
                    // Handle ioredis pipeline result format [[null, "v1"], [null, "v2"]]
                    if (Array.isArray(result[i]) && result[i][0] === null) {
                        output += resolveResult(result[i][1]);
                    } else {
                        output += resolveResult(result[i]);
                    }
                } else {
                    output += `${isArray ? '' : `${i}\n`}${result[i]}\n`;
                }
            }
            return output;
        }
        
        return String(result);
    }, []);

    // Execute command
    const executeCommand = useCallback(async () => {
        const command = currentInput.trim();
        if (!command) return;

        // Clear input and hide suggestions
        setCurrentInput('');
        setShowSuggestions(false);
        setHistoryIndex(0);

        // Add command to display
        appendToTerminal(`> ${command}`);

        // Add to history
        addToHistory(command);

        // Handle special commands locally
        if (command === 'clear') {
            setTerminalContent('');
            return;
        }

        if (command === 'exit' || command === 'quit') {
            appendToTerminal('> Connection closed');
            return;
        }

        try {
            // Parse command
            const { cmd, args } = parseCommand(command);

            // Execute Redis command
            const result = await onExecuteRedisCommand(connectionId, cmd, args);

            // Handle special commands that affect state
            if (cmd.toLowerCase() === 'select' && args.length > 0) {
                const database = parseInt(args[0]);
                if (!isNaN(database)) {
                    setCurrentDatabase(database);
                    appendToTerminal(`Switched to database ${database}`);
                }
            }

            // Display result
            const output = resolveResult(result);
            appendToTerminal(output);
        } catch (error: any) {
            appendToTerminal(`Error: ${error.message}`);
        }

        // Scroll to bottom after command execution
        setTimeout(scrollToBottom, 0);
    }, [currentInput, connectionId, onExecuteRedisCommand, appendToTerminal, addToHistory, parseCommand, resolveResult, scrollToBottom]);

    // Handle key press
    const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (showSuggestions && suggestions.length > 0) {
                // If suggestions are showing, use the first suggestion
                setCurrentInput(suggestions[0].value);
                setShowSuggestions(false);
            } else {
                executeCommand();
            }
        }
    }, [showSuggestions, suggestions, executeCommand]);

    // Handle key down for history navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigateHistory('up');
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigateHistory('down');
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    }, [navigateHistory]);

    // Handle input change
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setCurrentInput(value);
        handleInputSuggestions(value);
        setHistoryIndex(0); // Reset history index when typing
    }, [handleInputSuggestions]);

    // Handle suggestion click
    const handleSuggestionClick = useCallback((suggestion: CommandSuggestion) => {
        setCurrentInput(suggestion.value);
        setShowSuggestions(false);
        focusInput();
    }, [focusInput]);

    // Clear terminal
    const clearTerminal = useCallback(() => {
        setTerminalContent('');
    }, []);

    // Initialize terminal
    useEffect(() => {
        if (config) {
            appendToTerminal(`> ${config.host}:${config.port} connected!`);
        }
        focusInput();
        
        // Acknowledge unused variables for potential future features
        console.debug('Terminal initialized with history and database tracking:', { 
            historyLength: commandHistory.length, 
            currentDb: currentDatabase 
        });
    }, [config, appendToTerminal, focusInput, commandHistory.length, currentDatabase]);

    // Auto-scroll when content changes
    useEffect(() => {
        scrollToBottom();
    }, [terminalContent, scrollToBottom]);

    return (
        <div className="redis-terminal">
            {/* Terminal Header */}
            <div className="terminal-header">
                <span className="terminal-header-text">
                    Redis Terminal - Database {currentDatabase}
                </span>
                <button 
                    onClick={clearTerminal}
                    className="terminal-clear-btn"
                    title="Clear Terminal"
                >
                    Clear
                </button>
            </div>
            
            {/* Terminal Content */}
            <div className="terminal-content">
                <textarea
                    ref={terminalRef}
                    value={terminalContent}
                    readOnly
                    rows={20}
                />
            </div>

            {/* Terminal Input */}
            <div className="terminal-input">
                <input
                    ref={inputRef}
                    type="text"
                    value={currentInput}
                    onChange={handleInputChange}
                    onKeyPress={handleKeyPress}
                    onKeyDown={handleKeyDown}
                    placeholder="Press Enter To Exec Commands, Up and Down To Switch History"
                    autoComplete="off"
                />
            </div>

            {/* Command Suggestions */}
            {showSuggestions && suggestions.length > 0 && (
                <div className="cli-console-suggestion">
                    {suggestions.map((suggestion, index) => (
                        <div
                            key={index}
                            onClick={() => handleSuggestionClick(suggestion)}
                            className="suggestion-item"
                        >
                            {suggestion.value}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
