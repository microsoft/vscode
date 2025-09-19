/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Import xterm dependencies for bundling
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';

(function() {
    const vscode = acquireVsCodeApi();
    
    // Terminal state
    let terminal = null;
    let fitAddon = null;
    let searchAddon = null;
    let searchBarAddon = null;
    let webLinksAddon = null;
    let isConnected = false;
    let errorExists = false;
    
    // DOM elements
    const statusElement = document.getElementById('status');
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const clearBtn = document.getElementById('clearBtn');
    const terminalContainer = document.getElementById('terminal-container');
    
    // Terminal configuration matching Vue implementation
    const terminalConfig = {
        theme: {
            background: '#000000',
            foreground: '#ffffff',
            cursor: '#ffffff',
            cursorAccent: '#000000',
            selection: 'rgba(255, 255, 255, 0.3)',
            black: '#000000',
            red: '#cd3131',
            green: '#0dbc79',
            yellow: '#e5e510',
            blue: '#2472c8',
            magenta: '#bc3fbc',
            cyan: '#11a8cd',
            white: '#e5e5e5',
            brightBlack: '#666666',
            brightRed: '#f14c4c',
            brightGreen: '#23d18b',
            brightYellow: '#f5f543',
            brightBlue: '#3b8eea',
            brightMagenta: '#d670d6',
            brightCyan: '#29b8db',
            brightWhite: '#e5e5e5'
        },
        cursorStyle: 'bar',
        fontSize: 14,
        fontFamily: "'Consolas', 'Courier New', monospace",
        disableStdin: false,
        lineHeight: 1.1,
        rightClickSelectsWord: true,
        cursorBlink: true,
        scrollback: 10000,
        tabStopWidth: 8,
        bellStyle: 'sound',
        allowTransparency: false,
        convertEol: true
    };
    
    // Event listeners
    connectBtn.addEventListener('click', handleConnect);
    disconnectBtn.addEventListener('click', handleDisconnect);
    clearBtn.addEventListener('click', handleClear);
    
    // Message handler
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'terminalReady':
                initializeTerminal(message.connection);
                break;
            case 'terminalConfig':
                updateTerminalConfig(message.data);
                break;
            case 'connected':
                handleConnected(message.message);
                break;
            case 'disconnected':
                handleDisconnected();
                break;
            case 'connecting':
                handleConnecting(message.content);
                break;
            case 'data':
                handleTerminalData(message.content || message.result);
                break;
            case 'commandResult':
                handleCommandResult(message.result);
                break;
            case 'status':
                handleStatus(message.data);
                break;
            case 'ssherror':
                handleSSHError(message.data);
                break;
            case 'error':
                handleError(message.message || message.data);
                break;
            case 'resize':
                handleResize();
                break;
        }
    });
    
    function initializeTerminal(connectionInfo) {
        if (terminal) {
            terminal.dispose();
        }
        
        // Create terminal with configuration
        terminal = new Terminal(terminalConfig);
        
        // Load addons
        if (typeof window.FitAddon !== 'undefined') {
            fitAddon = new window.FitAddon();
            terminal.loadAddon(fitAddon);
        }
        
        // Search functionality
        if (typeof window.SearchAddon !== 'undefined') {
            searchAddon = new window.SearchAddon();
            terminal.loadAddon(searchAddon);
            
            // Custom search bar implementation
            createSearchBar();
        }
        
        // Web links addon
        if (typeof window.WebLinksAddon !== 'undefined') {
            webLinksAddon = new window.WebLinksAddon((event, uri) => {
                setTimeout(() => {
                    vscode.postMessage({
                        type: 'openLink',
                        uri: uri
                    });
                }, 100);
            });
            terminal.loadAddon(webLinksAddon);
        }
        
        // Terminal event handlers
        terminal.onKey(handleTerminalKey);
        terminal.onData(handleTerminalInput);
        terminal.onResize(handleTerminalResize);
        
        // Open terminal in container
        terminal.open(terminalContainer);
        fitAddon.fit();
        terminal.focus();
        
        // Setup window event listeners
        setupWindowEvents();
        
        // Update connection status
        if (connectionInfo) {
            updateStatus(`Ready to connect to ${connectionInfo.host}:${connectionInfo.port}`, 'ready');
        }
        
        // Initialize terminal
        vscode.postMessage({
            type: 'initTerminal',
            cols: terminal.cols,
            rows: terminal.rows
        });
    }
    
    function updateTerminalConfig(config) {
        if (config.fontSize) {
            terminalConfig.fontSize = config.fontSize;
        }
        if (config.fontFamily) {
            terminalConfig.fontFamily = config.fontFamily;
        }
        
        // Reinitialize if terminal exists
        if (terminal) {
            const currentConnectionInfo = statusText.textContent;
            initializeTerminal({ host: 'current', port: 'connection' });
        }
    }
    
    function handleTerminalKey(e) {
        const event = e.domEvent;
        
        // Ctrl+C - Copy if selection exists
        if (event.code === "KeyC" && event.ctrlKey && !event.altKey && !event.shiftKey) {
            if (terminal.hasSelection()) {
                document.execCommand('copy');
                return;
            }
        }
        
        // Ctrl+V - Paste (handled in keyup)
        if (event.code === "KeyV" && event.ctrlKey && !event.altKey && !event.shiftKey) {
            return;
        }
        
        // Ctrl+F - Search
        if (event.code === "KeyF" && event.ctrlKey && !event.altKey && !event.shiftKey) {
            return;
        }
        
        // Forward other key events
        const newEvent = new event.constructor(event.type, event);
        document.dispatchEvent(newEvent);
    }
    
    function handleTerminalInput(data) {
        vscode.postMessage({
            type: 'sendData',
            data: data
        });
    }
    
    function handleTerminalResize(size) {
        vscode.postMessage({
            type: 'resize',
            cols: size.cols,
            rows: size.rows
        });
    }
    
    function setupWindowEvents() {
        // Window resize handler
        const resizeHandler = () => {
            if (fitAddon && terminal) {
                fitAddon.fit();
                vscode.postMessage({
                    type: 'resize',
                    cols: terminal.cols,
                    rows: terminal.rows
                });
            }
        };
        
        window.addEventListener('resize', resizeHandler, false);
        
        // Global keyboard handlers
        window.addEventListener('keyup', async (event) => {
            // Ctrl+V - Paste
            if (event.code === "KeyV" && event.ctrlKey && !event.altKey && !event.shiftKey) {
                try {
                    const text = await navigator.clipboard.readText();
                    vscode.postMessage({
                        type: 'sendData',
                        data: text
                    });
                } catch (err) {
                    console.warn('Failed to read clipboard:', err);
                }
            }
            
            // Ctrl+F - Show search
            if (event.code === "KeyF" && event.ctrlKey && !event.altKey && !event.shiftKey) {
                showSearchBar();
            }
            
            // Escape - Hide search
            if (event.code === "Escape") {
                hideSearchBar();
            }
        });
        
        // Focus handler
        window.addEventListener('focus', () => {
            if (terminal) {
                terminal.focus();
            }
        });
        
        // Context menu handler for terminal
        if (terminalContainer) {
            terminalContainer.addEventListener('contextmenu', async (event) => {
                event.stopPropagation();
                event.preventDefault();
                
                if (terminal.hasSelection()) {
                    // Copy selection
                    document.execCommand('copy');
                    terminal.clearSelection();
                } else {
                    // Paste from clipboard
                    try {
                        const text = await navigator.clipboard.readText();
                        vscode.postMessage({
                            type: 'sendData',
                            data: text
                        });
                    } catch (err) {
                        console.warn('Failed to read clipboard:', err);
                    }
                }
            });
        }
    }
    
    function createSearchBar() {
        // Create search bar element
        const searchBar = document.createElement('div');
        searchBar.id = 'terminal-search-bar';
        searchBar.className = 'terminal-search-bar hidden';
        searchBar.innerHTML = `
            <div class="search-input-container">
                <input type="text" id="search-input" placeholder="Search..." />
                <button id="search-prev" title="Previous">↑</button>
                <button id="search-next" title="Next">↓</button>
                <button id="search-close" title="Close">×</button>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .terminal-search-bar {
                position: absolute;
                top: 10px;
                right: 10px;
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-widget-border);
                border-radius: 4px;
                padding: 8px;
                z-index: 1000;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }
            .terminal-search-bar.hidden {
                display: none;
            }
            .search-input-container {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .terminal-search-bar input {
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 2px;
                padding: 4px 8px;
                font-size: 12px;
                width: 200px;
            }
            .terminal-search-bar button {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 2px;
                padding: 4px 8px;
                cursor: pointer;
                font-size: 12px;
            }
            .terminal-search-bar button:hover {
                background: var(--vscode-button-hoverBackground);
            }
        `;
        document.head.appendChild(style);
        
        // Add to terminal container
        terminalContainer.parentElement.appendChild(searchBar);
        
        // Event listeners
        const searchInput = searchBar.querySelector('#search-input');
        const searchPrev = searchBar.querySelector('#search-prev');
        const searchNext = searchBar.querySelector('#search-next');
        const searchClose = searchBar.querySelector('#search-close');
        
        searchInput.addEventListener('input', (e) => {
            if (searchAddon && e.target.value) {
                searchAddon.findNext(e.target.value);
            }
        });
        
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    searchAddon.findPrevious(e.target.value);
                } else {
                    searchAddon.findNext(e.target.value);
                }
            }
            if (e.key === 'Escape') {
                hideSearchBar();
            }
        });
        
        searchPrev.addEventListener('click', () => {
            if (searchAddon && searchInput.value) {
                searchAddon.findPrevious(searchInput.value);
            }
        });
        
        searchNext.addEventListener('click', () => {
            if (searchAddon && searchInput.value) {
                searchAddon.findNext(searchInput.value);
            }
        });
        
        searchClose.addEventListener('click', hideSearchBar);
    }
    
    function showSearchBar() {
        const searchBar = document.getElementById('terminal-search-bar');
        if (searchBar) {
            searchBar.classList.remove('hidden');
            const searchInput = searchBar.querySelector('#search-input');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
    }
    
    function hideSearchBar() {
        const searchBar = document.getElementById('terminal-search-bar');
        if (searchBar) {
            searchBar.classList.add('hidden');
            if (terminal) {
                terminal.focus();
            }
        }
    }
    
    // Connection handlers
    function handleConnect() {
        vscode.postMessage({
            type: 'connect',
            config: {}
        });
    }
    
    function handleDisconnect() {
        vscode.postMessage({
            type: 'disconnect'
        });
    }
    
    function handleClear() {
        if (terminal) {
            terminal.clear();
        }
    }
    
    // Status and data handlers
    function handleConnected(message) {
        isConnected = true;
        errorExists = false;
        updateStatus(message || 'Connected', 'connected');
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        
        if (terminal) {
            terminal.writeln('\r\n' + message + '\r\n');
            fitAddon.fit();
            terminal.focus();
        }
    }
    
    function handleDisconnected() {
        isConnected = false;
        updateStatus('Disconnected', 'disconnected');
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        
        if (terminal) {
            terminal.writeln('\r\nDisconnected\r\n');
        }
    }
    
    function handleConnecting(content) {
        updateStatus('Connecting...', 'connecting');
        if (terminal && content) {
            terminal.write(content);
        }
    }
    
    function handleTerminalData(content) {
        if (terminal && content) {
            terminal.write(content);
        }
    }
    
    function handleCommandResult(result) {
        if (terminal && result !== undefined) {
            const output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            terminal.writeln('\r\n' + output + '\r\n');
        }
    }
    
    function handleStatus(data) {
        updateStatus(data, 'connected');
        if (fitAddon) {
            fitAddon.fit();
        }
    }
    
    function handleSSHError(data) {
        errorExists = true;
        updateStatus(data, 'error');
    }
    
    function handleError(message) {
        if (!errorExists) {
            updateStatus('ERROR: ' + message, 'error');
        }
    }
    
    function handleResize() {
        if (fitAddon) {
            fitAddon.fit();
        }
    }
    
    function updateStatus(message, type) {
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `status-${type}`;
        }
        
        // Update status colors based on type
        const colors = {
            ready: '#338c33',
            connecting: '#e5e510',
            connected: '#338c33',
            disconnected: '#666666',
            error: '#cd3131'
        };
        
        if (statusElement && colors[type]) {
            statusElement.style.backgroundColor = colors[type];
        }
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            vscode.postMessage({ type: 'ready' });
        });
    } else {
        vscode.postMessage({ type: 'ready' });
    }
})();
