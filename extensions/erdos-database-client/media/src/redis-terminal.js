/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Redis Terminal functionality - based on terminal.vue
class RedisTerminal {
    constructor() {
        this.commandHistory = [];
        this.historyIndex = 0;
        this.content = '';
        this.inputSuggestions = [
            "DEL ",
            "KEYS ",
            "TTL ",
            "PING ",
            "EXISTS ",
            // string
            "SET ",
            "SETNX ",
            "GET ",
            "STRLEN ",
            "INCR ",
            "DECR ",
            // hash
            "HKEYS ",
            "HDEL ",
            "HMSET ",
            "HGETALL ",
            // list
            "LPUSH ",
            "LINDEX ",
            "LLEN ",
            "LREM ",
            "RPOP ",
            "LPOP ",
            "LSET ",
            // set
            "SADD ",
            "SDIFF ",
            "SMEMBERS ",
            "SPOP ",
            // sorted set
            "ZADD ",
            // trans
            "MULTI ",
            "EXEC "
        ];
        
        this.init();
    }
    
    init() {
        this.cliContent = document.getElementById('cliContent');
        this.cliInput = document.getElementById('cliInput');
        
        if (!this.cliContent || !this.cliInput) {
            console.error('Required DOM elements not found');
            return;
        }
        
        this.setupEventListeners();
        this.setupVSCodeMessaging();
        this.focusInput();
    }
    
    setupEventListeners() {
        // Enter key to execute command
        this.cliInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.executeCommand();
            }
        });
        
        // Arrow keys for history navigation
        this.cliInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateHistory(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateHistory(1);
            }
        });
        
        // Input suggestions (basic implementation)
        this.cliInput.addEventListener('input', (e) => {
            this.handleInputSuggestions(e.target.value);
        });
    }
    
    setupVSCodeMessaging() {
        // Listen for messages from VS Code extension
        window.addEventListener('message', (event) => {
            const message = event.data;
            
            switch (message.type) {
                case 'config':
                    this.handleConnected(message.config);
                    break;
                case 'result':
                    this.handleCommandResult('', message.result);
                    break;
                case 'clearTerminal':
                    this.clearTerminal();
                    break;
                case 'exit':
                    this.handleExit();
                    break;
                case 'changeDb':
                    this.handleDbChange(message.database);
                    break;
                case 'removePreTab':
                    // Tab will be closed by the extension, no simulation needed
                    break;
            }
        });
    }
    
    executeCommand() {
        const command = this.cliInput.value.trim();
        if (!command) return;
        
        // Clear input
        this.cliInput.value = '';
        
        // Add command to display
        this.appendToTerminal(`> ${command}`);
        
        // Add to history
        this.addToHistory(command);
        
        // Handle special commands locally
        if (command === 'clear') {
            this.clearTerminal();
            return;
        }
        
        if (command === 'exit' || command === 'quit') {
            vscode.postMessage({
                type: 'ext'
            });
            return;
        }
        
        // Send command to extension for execution
        vscode.postMessage({
            type: 'exec',
            command: command
        });
    }
    
    handleConnected(config) {
        this.appendToTerminal(`> ${config.host}@${config.port} connected!`);
        this.focusInput();
    }
    
    handleCommandResult(command, result) {
        this.appendToTerminal(this.resolveResult(result));
        this.scrollToBottom();
    }
    
    handleCommandError(command, error) {
        this.appendToTerminal(`Error: ${error}`);
        this.scrollToBottom();
    }
    
    handleDbChange(database) {
        this.appendToTerminal(`Switched to database ${database}`);
        this.scrollToBottom();
    }
    
    
    handleExit() {
        this.appendToTerminal('> Connection closed');
        this.cliInput.disabled = true;
    }
    
    clearTerminal() {
        this.content = '';
        this.cliContent.value = '';
    }
    
    appendToTerminal(text) {
        this.content += text + '\n';
        this.cliContent.value = this.content;
        this.scrollToBottom();
    }
    
    scrollToBottom() {
        this.cliContent.scrollTop = this.cliContent.scrollHeight;
    }
    
    focusInput() {
        this.cliInput.focus();
    }
    
    addToHistory(command) {
        if (!command || !command.length) return;
        
        // Don't add duplicate consecutive commands
        if (this.commandHistory[this.commandHistory.length - 1] !== command) {
            this.commandHistory.push(command);
        }
        
        // Reset history index to end
        this.historyIndex = this.commandHistory.length;
    }
    
    navigateHistory(direction) {
        if (this.suggesttionShowing()) {
            return; // Don't navigate history if suggestions are showing
        }
        
        if (direction === -1) { // Up arrow
            --this.historyIndex < 0 && (this.historyIndex = 0);
            
            if (!this.commandHistory[this.historyIndex]) {
                this.cliInput.value = '';
                return;
            }
            
            this.cliInput.value = this.commandHistory[this.historyIndex];
        } else if (direction === 1) { // Down arrow
            if (++this.historyIndex > this.commandHistory.length) {
                this.historyIndex = this.commandHistory.length;
            }
            
            if (!this.commandHistory[this.historyIndex]) {
                this.cliInput.value = '';
                return;
            }
            
            this.cliInput.value = this.commandHistory[this.historyIndex];
        }
        
        // Move cursor to end
        setTimeout(() => {
            this.cliInput.setSelectionRange(this.cliInput.value.length, this.cliInput.value.length);
        }, 0);
    }
    
    handleInputSuggestions(input) {
        // Enhanced suggestion implementation matching Vue behavior
        if (!input) {
            this.hideSuggestions();
            return;
        }
        
        const matches = this.inputSuggestions.filter(suggestion => 
            suggestion.toLowerCase().indexOf(input.toLowerCase()) !== -1
        );
        
        if (matches.length > 0) {
            this.showSuggestions([...new Set(matches)].map(item => ({ value: item })));
        } else {
            this.hideSuggestions();
        }
    }
    resolveResult(result) {
        let append = '';
        
        if (result === null) {
            append = `${null}\n`;
        } else if (typeof result === 'object') {
            const isArray = !isNaN(result.length);
            
            for (const i in result) {
                if (typeof result[i] === 'object') {
                    // fix ioredis pipeline result such as [[null, "v1"], [null, "v2"]]
                    // null is the result, and v1 is the value
                    if (result[i][0] === null) {
                        append += this.resolveResult(result[i][1]);
                    } else {
                        append += this.resolveResult(result[i]);
                    }
                } else {
                    append += `${(isArray ? '' : `${i}\n`) + result[i]}\n`;
                }
            }
        } else {
            append = `${result}\n`;
        }
        
        return append;
    }
    
    showSuggestions(suggestions) {
        // Create or update suggestion dropdown
        let dropdown = document.querySelector('.cli-console-suggestion');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.className = 'cli-console-suggestion';
            dropdown.style.cssText = `
                position: absolute;
                background: var(--vscode-dropdown-background);
                border: 1px solid var(--vscode-dropdown-border);
                border-radius: 4px;
                max-height: 200px;
                overflow-y: auto;
                z-index: 1000;
                display: none;
            `;
            document.body.appendChild(dropdown);
        }
        
        dropdown.innerHTML = '';
        suggestions.forEach(suggestion => {
            const item = document.createElement('div');
            item.textContent = suggestion.value;
            item.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                border-bottom: 1px solid var(--vscode-dropdown-border);
            `;
            item.addEventListener('click', () => {
                this.cliInput.value = suggestion.value;
                this.hideSuggestions();
                this.cliInput.focus();
            });
            dropdown.appendChild(item);
        });
        
        // Position dropdown below input
        const inputRect = this.cliInput.getBoundingClientRect();
        dropdown.style.left = inputRect.left + 'px';
        dropdown.style.top = (inputRect.bottom + 2) + 'px';
        dropdown.style.width = inputRect.width + 'px';
        dropdown.style.display = 'block';
    }
    
    hideSuggestions() {
        const dropdown = document.querySelector('.cli-console-suggestion');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    }
    
    suggesttionShowing() {
        const dropdown = document.querySelector('.cli-console-suggestion');
        return dropdown && dropdown.style.display !== 'none';
    }
}

// Initialize VS Code messaging
const vscode = acquireVsCodeApi();

// Initialize terminal when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new RedisTerminal();
});
