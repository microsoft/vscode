/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

(function() {
    const vscode = acquireVsCodeApi();
    
    // State
    let forwardList = [];
    let config = {};
    let isEditMode = false;
    let currentEditForward = null;
    
    // DOM elements
    const addForwardBtn = document.getElementById('addForwardBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const errorPanel = document.getElementById('errorPanel');
    const errorMessage = document.getElementById('errorMessage');
    const forwardsBody = document.getElementById('forwardsBody');
    
    // Dialog elements
    const forwardDialog = document.getElementById('forwardDialog');
    const forwardDialogTitle = document.getElementById('forwardDialogTitle');
    const forwardName = document.getElementById('forwardName');
    const localHost = document.getElementById('localHost');
    const localPort = document.getElementById('localPort');
    const remoteHost = document.getElementById('remoteHost');
    const remotePort = document.getElementById('remotePort');
    const saveForwardBtn = document.getElementById('saveForwardBtn');
    const cancelForwardBtn = document.getElementById('cancelForwardBtn');
    
    // Command dialog elements
    const commandDialog = document.getElementById('commandDialog');
    const sshCommand = document.getElementById('sshCommand');
    const copyCommandBtn = document.getElementById('copyCommandBtn');
    const closeCommandBtn = document.getElementById('closeCommandBtn');
    
    // Event listeners
    addForwardBtn.addEventListener('click', openCreateDialog);
    refreshBtn.addEventListener('click', loadForwards);
    saveForwardBtn.addEventListener('click', saveForward);
    cancelForwardBtn.addEventListener('click', closeForwardDialog);
    copyCommandBtn.addEventListener('click', copyCommand);
    closeCommandBtn.addEventListener('click', closeCommandDialog);
    
    // Message handler
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'forwardRules':
                loadForwardRules(message.rules);
                break;
            case 'config':
                config = message.config;
                break;
            case 'success':
                showSuccess(message.message);
                hideError();
                loadForwards();
                break;
            case 'error':
                showError(message.message);
                break;
            case 'tunnelStarted':
                updateTunnelState(message.id, true);
                break;
            case 'tunnelStopped':
                updateTunnelState(message.id, false);
                break;
            case 'sshCommand':
                showSSHCommand(message.command);
                break;
        }
    });
    
    function loadForwards() {
        vscode.postMessage({ type: 'load' });
    }
    
    function loadForwardRules(rules) {
        forwardList = rules || [];
        renderForwardList();
    }
    
    function renderForwardList() {
        forwardsBody.innerHTML = '';
        
        if (forwardList.length === 0) {
            const emptyRow = document.createElement('div');
            emptyRow.className = 'table-row';
            emptyRow.innerHTML = `
                <div class="table-cell" style="text-align: center; color: var(--vscode-descriptionForeground);" colspan="7">
                    No forwarding rules configured
                </div>
            `;
            forwardsBody.appendChild(emptyRow);
            return;
        }
        
        forwardList.forEach(forward => {
            const row = document.createElement('div');
            row.className = 'table-row';
            
            row.innerHTML = `
                <div class="table-cell">${escapeHtml(forward.name || '')}</div>
                <div class="table-cell">${escapeHtml(forward.localHost || '')}</div>
                <div class="table-cell">${forward.localPort || ''}</div>
                <div class="table-cell">${escapeHtml(forward.remoteHost || '')}</div>
                <div class="table-cell">${forward.remotePort || ''}</div>
                <div class="table-cell">${forward.state ? 'running' : 'stop'}</div>
                <div class="table-cell">
                    <div class="actions">
                        ${!forward.state ? 
                            `<button class="btn btn-success" onclick="startTunnel('${forward.id}')" title="Start">
                                <i class="codicon codicon-play"></i>
                            </button>` :
                            `<button class="btn btn-danger" onclick="stopTunnel('${forward.id}')" title="Stop">
                                <i class="codicon codicon-stop-circle"></i>
                            </button>`
                        }
                        <button class="btn btn-primary" onclick="editForward('${forward.id}')" title="Edit">
                            <i class="codicon codicon-edit"></i>
                        </button>
                        <button class="btn btn-secondary" onclick="showInfo('${forward.id}')" title="Show command">
                            <i class="codicon codicon-info"></i>
                        </button>
                        <button class="btn btn-danger" onclick="deleteForward('${forward.id}')" title="Delete">
                            <i class="codicon codicon-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            
            forwardsBody.appendChild(row);
        });
    }
    
    function openCreateDialog() {
        isEditMode = false;
        currentEditForward = null;
        
        forwardDialogTitle.textContent = 'Create Forward';
        forwardName.value = '';
        localHost.value = '127.0.0.1';
        localPort.value = '';
        remoteHost.value = '127.0.0.1';
        remotePort.value = '';
        
        showDialog(forwardDialog);
    }
    
    function openEditDialog(forward) {
        isEditMode = true;
        currentEditForward = forward;
        
        forwardDialogTitle.textContent = 'Edit Forward';
        forwardName.value = forward.name || '';
        localHost.value = forward.localHost || '';
        localPort.value = forward.localPort || '';
        remoteHost.value = forward.remoteHost || '';
        remotePort.value = forward.remotePort || '';
        
        showDialog(forwardDialog);
    }
    
    function saveForward() {
        const name = forwardName.value.trim();
        const lHost = localHost.value.trim();
        const lPort = parseInt(localPort.value);
        const rHost = remoteHost.value.trim();
        const rPort = parseInt(remotePort.value);
        
        if (!name || !lHost || !lPort || !rHost || !rPort) {
            alert('All fields are required');
            return;
        }
        
        const forwardData = {
            name,
            localHost: lHost,
            localPort: lPort,
            remoteHost: rHost,
            remotePort: rPort
        };
        
        if (isEditMode && currentEditForward) {
            forwardData.id = currentEditForward.id;
        }
        
        vscode.postMessage({
            type: isEditMode ? 'update' : 'create',
            forward: forwardData
        });
        
        closeForwardDialog();
    }
    
    function closeForwardDialog() {
        hideDialog(forwardDialog);
        isEditMode = false;
        currentEditForward = null;
    }
    
    function showSSHCommand(command) {
        sshCommand.textContent = command;
        showDialog(commandDialog);
    }
    
    function copyCommand() {
        navigator.clipboard.writeText(sshCommand.textContent).then(() => {
            // Show visual feedback
            const originalText = copyCommandBtn.textContent;
            copyCommandBtn.textContent = 'Copied!';
            copyCommandBtn.style.background = 'var(--vscode-testing-iconPassed)';
            
            setTimeout(() => {
                copyCommandBtn.textContent = originalText;
                copyCommandBtn.style.background = '';
                closeCommandDialog();
            }, 1000);
        }).catch(() => {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = sshCommand.textContent;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            closeCommandDialog();
        });
    }
    
    function closeCommandDialog() {
        hideDialog(commandDialog);
    }
    
    function updateTunnelState(id, state) {
        const forward = forwardList.find(f => f.id === id);
        if (forward) {
            forward.state = state;
            renderForwardList();
        }
    }
    
    function showError(message) {
        errorMessage.textContent = message;
        errorPanel.classList.remove('hidden');
    }
    
    function hideError() {
        errorPanel.classList.add('hidden');
    }
    
    function showSuccess(message) {
        // Show success notification
        const notification = document.createElement('div');
        notification.className = 'success-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--vscode-inputValidation-infoBackground);
            color: var(--vscode-inputValidation-infoForeground);
            border: 1px solid var(--vscode-inputValidation-infoBorder);
            padding: 12px 16px;
            border-radius: 4px;
            z-index: 1001;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        notification.innerHTML = `<i class="codicon codicon-check"></i> ${message}`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    function showDialog(dialog) {
        dialog.classList.remove('hidden');
    }
    
    function hideDialog(dialog) {
        dialog.classList.add('hidden');
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Global functions for inline event handlers
    window.startTunnel = function(id) {
        vscode.postMessage({ type: 'start', id });
    };
    
    window.stopTunnel = function(id) {
        vscode.postMessage({ type: 'stop', id });
    };
    
    window.editForward = function(id) {
        const forward = forwardList.find(f => f.id === id);
        if (forward) {
            openEditDialog(forward);
        }
    };
    
    window.showInfo = function(id) {
        const forward = forwardList.find(f => f.id === id);
        if (forward && config) {
            const command = `ssh -qTnN -L ${forward.localHost}:${forward.localPort}:${forward.remoteHost}:${forward.remotePort} ${config.username}@${config.host}`;
            vscode.postMessage({ type: 'cmd', command });
        }
    };
    
    window.deleteForward = function(id) {
        if (confirm('Are you sure you want to delete this forward?')) {
            vscode.postMessage({ type: 'remove', id });
        }
    };
    
    // Initialize
    loadForwards();
})();
