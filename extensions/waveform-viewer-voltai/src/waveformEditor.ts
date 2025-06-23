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
        // Get the local path to the Surfer build
        const surferPath = vscode.Uri.joinPath(this.context.extensionUri, 'artifacts', 'pages_build');
        const surferUri = webview.asWebviewUri(surferPath);

        // Read the original Surfer HTML
        const surferHtmlPath = vscode.Uri.joinPath(this.context.extensionUri, 'artifacts', 'pages_build', 'index.html');
        let surferHtml = '';

        try {
            surferHtml = fs.readFileSync(surferHtmlPath.fsPath, 'utf8');
        } catch (error) {
            console.error('Failed to read Surfer HTML:', error);
            return this.getErrorHtml('Failed to load Surfer HTML');
        }

        // Modify the Surfer HTML to add VSCode communication
        const loadNotifier = `
            (function() {
                const vscode = acquireVsCodeApi();

                // Notify VSCode that Surfer has loaded
                vscode.postMessage({
                    type: 'surferLoaded'
                });

                // Listen for messages from VSCode
                window.addEventListener('message', (event) => {
                    const message = event.data;
                    if (message.type === 'update' && message.filename) {
                        // Load the waveform file
                        const fileUri = vscode.asWebviewUri(vscode.Uri.file(message.filePath));

                        // Tell Surfer to load the waveform
                        const surferFrame = document.getElementById('surfer-iframe');
                        if (surferFrame && surferFrame.contentWindow) {
                            surferFrame.contentWindow.postMessage({
                                command: 'LoadUrl',
                                url: fileUri.toString()
                            }, '*');
                        }
                    }
                });
            })();
        `;

        // Add the load notifier to the Surfer HTML
        surferHtml = surferHtml.replace('</body>', `<script>${loadNotifier}</script></body>`);

        // Create wrapper HTML that contains the Surfer iframe
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; iframe-src ${webview.cspSource} data:; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};">
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
                    }
                </style>
            </head>
            <body>
                <div id="toolbar">
                    <button onclick="toggleMenu()">Toggle Menu</button>
                    <button onclick="reloadWaveform()">Reload</button>
                    <div id="status">Loading waveform viewer...</div>
                </div>

                <iframe id="surfer-iframe" src="data:text/html;base64,${Buffer.from(surferHtml).toString('base64')}"
                        sandbox="allow-scripts allow-same-origin allow-forms">
                </iframe>

                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                    let surferFrame = null;

                    document.addEventListener('DOMContentLoaded', function() {
                        surferFrame = document.getElementById('surfer-iframe');

                        // Update status when iframe loads
                        surferFrame.onload = function() {
                            document.getElementById('status').textContent = 'Waveform viewer ready';
                        };
                    });

                    function toggleMenu() {
                        if (surferFrame && surferFrame.contentWindow) {
                            surferFrame.contentWindow.postMessage({
                                command: 'ToggleMenu'
                            }, '*');
                        }
                    }

                    function reloadWaveform() {
                        vscode.postMessage({
                            type: 'info',
                            message: 'Reloading waveform...'
                        });

                        // Reload the iframe
                        surferFrame.src = surferFrame.src;
                    }

                    // Listen for messages from the iframe
                    window.addEventListener('message', function(event) {
                        if (event.source === surferFrame.contentWindow) {
                            // Handle messages from Surfer if needed
                            console.log('Message from Surfer:', event.data);
                        }
                    });

                    // Listen for messages from VSCode
                    window.addEventListener('message', function(event) {
                        const message = event.data;
                        if (message.type === 'update' && message.filename) {
                            document.getElementById('status').textContent = 'Loading: ' + message.filename;

                            // Convert file content to blob URL for Surfer
                            const blob = new Blob([message.text], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);

                            // Tell Surfer to load the waveform
                            if (surferFrame && surferFrame.contentWindow) {
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