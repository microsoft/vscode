/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// VS Code communication layer - equivalent to Vue's vscode.ts utility
class VSCodeMessaging {
    constructor() {
        this.vscode = this.acquireVsCodeApi();
        this.events = {};
        this.init = false;
        
        this.tryInit();
    }
    
    acquireVsCodeApi() {
        if (typeof acquireVsCodeApi !== "undefined") {
            return acquireVsCodeApi();
        }
        return null;
    }
    
    tryInit() {
        if (this.init || !this.vscode) return;
        this.init = true;
        
        window.addEventListener('message', (event) => {
            const { data } = event;
            if (!data) return;
            
            if (this.events[data.type]) {
                this.events[data.type](data.content);
            }
        });
    }
    
    on(event, callback) {
        this.events[event] = callback;
        return this;
    }
    
    emit(event, data) {
        if (this.vscode) {
            this.vscode.postMessage({ type: event, content: data });
        }
    }
    
    destroy() {
        this.events = {};
        this.init = false;
    }
}

// Global instance
window.vscodeMessaging = new VSCodeMessaging();
