import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class WaveformEditorProvider implements vscode.CustomTextEditorProvider {

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new WaveformEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            WaveformEditorProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            }
        );
        return providerRegistration;
    }

    private static readonly viewType = 'waveform-viewer-voltai.waveformViewer';

    constructor(
        private readonly context: vscode.ExtensionContext
    ) { }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Setup initial content for the webview
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'artifacts'),
                vscode.Uri.joinPath(this.context.extensionUri, 'media')
            ]
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);

        function updateWebview() {
            webviewPanel.webview.postMessage({
                type: 'update',
                text: document.getText(),
                filename: path.basename(document.uri.fsPath),
                filePath: document.uri.fsPath
            });
        }

        // Hook up event handlers so that we can synchronize the webview with the text document.
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });

        // Make sure we get rid of the listener when our editor is closed.
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });

        // Receive message from the webview
        webviewPanel.webview.onDidReceiveMessage(e => {
            switch (e.type) {
                case 'surferLoaded':
                    console.log('Surfer has loaded successfully');
                    // Load the current document in Surfer
                    updateWebview();
                    return;
                case 'surferError':
                    vscode.window.showErrorMessage(`Surfer Error: ${e.message}`);
                    return;
                case 'error':
                    vscode.window.showErrorMessage(`Waveform Viewer Error: ${e.message}`);
                    return;
                case 'info':
                    vscode.window.showInformationMessage(`Waveform Viewer: ${e.message}`);
                    return;
            }
        });

        updateWebview();
    }

        /**
     * Get the static html used for the editor webviews.
     */
    private getHtmlForWebview(webview: vscode.Webview, document: vscode.TextDocument): string {
        // Get the URI to the VSCode-specific Surfer HTML for iframe
        const surferIndexUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'artifacts', 'pages_build', 'index_vscode.html')
        );

        // Verify the Surfer HTML exists
        const surferHtmlPath = vscode.Uri.joinPath(this.context.extensionUri, 'artifacts', 'pages_build', 'index_vscode.html');
        try {
            if (!fs.existsSync(surferHtmlPath.fsPath)) {
                return this.getErrorHtml(`Surfer HTML not found at: ${surferHtmlPath.fsPath}`);
            }
        } catch (error) {
            console.error('Failed to check Surfer HTML:', error);
            return this.getErrorHtml('Failed to access Surfer HTML');
        }

        // Create wrapper HTML with iframe
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${webview.cspSource} 'self' data: blob:; script-src 'nonce-${nonce}' ${webview.cspSource} 'unsafe-inline' 'wasm-unsafe-eval'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data: blob:; connect-src blob: data: ${webview.cspSource}; worker-src blob: ${webview.cspSource}; child-src ${webview.cspSource};">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Waveform Viewer</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        overflow: hidden;
                    }

                    #toolbar {
                        display: flex;
                        gap: 10px;
                        padding: 8px;
                        background-color: var(--vscode-panel-background);
                        border-bottom: 1px solid var(--vscode-panel-border);
                        z-index: 1000;
                        position: relative;
                    }

                    #toolbar button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: 1px solid var(--vscode-button-border);
                        padding: 4px 8px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
                    }

                    #toolbar button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }

                    #surfer-iframe {
                        width: 100%;
                        height: calc(100vh - 40px);
                        border: none;
                        display: block;
                    }

                    #status {
                        padding: 4px 8px;
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        flex: 1;
                    }
                </style>
            </head>
            <body>
                <div id="toolbar">
                    <button onclick="toggleMenu()">Toggle Menu</button>
                    <button onclick="reloadWaveform()">Reload</button>
                    <div id="status">Loading waveform viewer...</div>
                </div>

                <iframe id="surfer-iframe"
                        src="${surferIndexUri}"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups-to-escape-sandbox"
                        allow="wasm-unsafe-eval">
                </iframe>

                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                    let surferFrame = null;
                    let surferReady = false;

                    document.addEventListener('DOMContentLoaded', function() {
                        surferFrame = document.getElementById('surfer-iframe');

                        // Update status when iframe loads
                        surferFrame.onload = function() {
                            document.getElementById('status').textContent = 'Waveform viewer loading...';

                            // Wait a bit for Surfer to initialize
                            setTimeout(() => {
                                if (surferReady) {
                                    document.getElementById('status').textContent = 'Waveform viewer ready';
                                } else {
                                    document.getElementById('status').textContent = 'Waiting for Surfer to initialize...';
                                }
                            }, 2000);
                        };
                    });

                    function toggleMenu() {
                        if (surferFrame && surferFrame.contentWindow && surferReady) {
                            surferFrame.contentWindow.postMessage({
                                command: 'ToggleMenu'
                            }, '*');
                        }
                    }

                    function reloadWaveform() {
                        vscode.postMessage({
                            type: 'info',
                            message: 'Reloading waveform viewer...'
                        });

                        // Reload the iframe
                        surferFrame.src = surferFrame.src;
                        surferReady = false;
                    }

                                        // Listen for messages from the iframe (Surfer)
                    window.addEventListener('message', function(event) {
                        if (event.source === surferFrame.contentWindow) {
                            console.log('Message from Surfer iframe:', event.data);

                            // Check if Surfer is signaling it's ready
                            if (event.data.type === 'surferReady') {
                                surferReady = true;
                                document.getElementById('status').textContent = 'Waveform viewer ready';
                            } else if (event.data.type === 'surferError') {
                                document.getElementById('status').textContent = 'Surfer error: ' + event.data.message;
                                vscode.postMessage({
                                    type: 'surferError',
                                    message: event.data.message
                                });
                            } else if (event.data.type === 'surferLoaded') {
                                document.getElementById('status').textContent = 'Surfer loaded, initializing...';
                            }
                        }
                    });

                    // Listen for messages from VSCode
                    window.addEventListener('message', function(event) {
                        const message = event.data;
                        if (message.type === 'update' && message.filename) {
                            document.getElementById('status').textContent = 'Loading: ' + message.filename;

                            if (surferFrame && surferFrame.contentWindow && surferReady) {
                                // Convert file content to blob URL for Surfer
                                const blob = new Blob([message.text], { type: 'text/plain' });
                                const url = URL.createObjectURL(blob);

                                // Tell Surfer to load the waveform
                                try {
                                    surferFrame.contentWindow.postMessage({
                                        command: 'LoadUrl',
                                        url: url
                                    }, '*');
                                    document.getElementById('status').textContent = 'Loaded: ' + message.filename;
                                } catch (error) {
                                    console.error('Error loading waveform:', error);
                                    document.getElementById('status').textContent = 'Error loading: ' + message.filename;
                                }
                            } else {
                                document.getElementById('status').textContent = 'Waiting for Surfer to be ready...';

                                // Retry when Surfer is ready
                                const retryInterval = setInterval(() => {
                                    if (surferReady && surferFrame.contentWindow) {
                                        clearInterval(retryInterval);
                                        const blob = new Blob([message.text], { type: 'text/plain' });
                                        const url = URL.createObjectURL(blob);

                                        surferFrame.contentWindow.postMessage({
                                            command: 'LoadUrl',
                                            url: url
                                        }, '*');
                                        document.getElementById('status').textContent = 'Loaded: ' + message.filename;
                                    }
                                }, 500);

                                // Stop retrying after 10 seconds
                                setTimeout(() => clearInterval(retryInterval), 10000);
                            }
                        }
                    });
                </script>
            </body>
            </html>`;
    }

    private getErrorHtml(error: string): string {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Error</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-errorForeground);
                        background-color: var(--vscode-editor-background);
                        padding: 20px;
                    }
                </style>
            </head>
            <body>
                <h1>Error Loading Waveform Viewer</h1>
                <p>${this.escapeHtml(error)}</p>
                <p>Please ensure the Surfer artifacts are properly installed in the artifacts/pages_build directory.</p>
            </body>
            </html>`;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
