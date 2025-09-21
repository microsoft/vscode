/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export abstract class WebviewBase {
    protected _panel: vscode.WebviewPanel;
    protected _disposables: vscode.Disposable[] = [];
    
    constructor(
        protected extensionUri: vscode.Uri,
        viewType: string,
        title: string,
        options?: vscode.WebviewPanelOptions
    ) {
        this._panel = vscode.window.createWebviewPanel(
            viewType,
            title,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'resources')
                ],
                ...options
            }
        );
        
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            null,
            this._disposables
        );
        
        this.updateWebviewContent();
    }
    
    protected abstract getHtmlContent(): string;
    protected abstract handleMessage(message: any): void;
    
    protected updateWebviewContent(): void {
        this._panel.webview.html = this.getHtmlContent();
    }
    
    protected getWebviewUri(pathList: string[]): vscode.Uri {
        return this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, ...pathList)
        );
    }
    
    public reveal(column?: vscode.ViewColumn): void {
        this._panel.reveal(column);
    }
    
    public dispose(): void {
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}








