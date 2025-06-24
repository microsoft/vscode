import * as vscode from 'vscode';
import * as path from 'path';

export class WaveformEditorProvider implements vscode.CustomReadonlyEditorProvider {

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new WaveformEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            WaveformEditorProvider.viewType,
            provider
        );
        return providerRegistration;
    }

    private static readonly viewType = 'voltai.waveformEditor';

    constructor(
        private readonly context: vscode.ExtensionContext
    ) {}

    /**
     * Called when our custom editor is opened.
     */
    public async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return {
            uri,
            dispose: () => {
                // Clean up resources if needed
            }
        };
    }

    /**
     * Called to resolve the custom editor for a document.
     */
    public async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Add the folder that the document lives in as a localResourceRoot
        const uriString = document.uri.toString()
        // TODO: this probably doesn't play well with windows
        const dirPath = uriString.substring(0, uriString.lastIndexOf('/'))

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'surfer'),
                vscode.Uri.parse(dirPath, true),
            ],
        }

        const uridocstring = vscode.Uri.file(document.uri.fsPath).toString()
        const index_path = vscode.Uri.joinPath(this.context.extensionUri, 'surfer', 'index.html')
        const surfer_loc = vscode.Uri.joinPath(this.context.extensionUri, 'surfer')

        webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview, index_path, surfer_loc)

        const documentUri = webviewPanel.webview.asWebviewUri(document.uri).toString()

    }

    /**
     * Get the static html used for the editor webview.
     */
    // Get the static html used for the editor webviews.
    private async getHtmlForWebview(webview: vscode.Webview, indexpath: vscode.Uri, surferloc: vscode.Uri): Promise<string> {
        // Read index.html from disk
        const filecontents = await vscode.workspace.fs.readFile(indexpath)
        // Replace local paths with paths derived from WebView URIs
        let html = new TextDecoder().decode(filecontents)

        // Convert surfer location to webview URI
        const surferWebviewUri = webview.asWebviewUri(surferloc).toString()

        //replace all the instances of manifest.json with suferloc + /manifest.json
        html = this.replaceAll(html, "manifest.json", surferWebviewUri + "/manifest.json")
        //replace all the instances of surfer_bg.wasm with suferloc + /surfer_bg.wasm
        html = this.replaceAll(html, "/surfer_bg.wasm", surferWebviewUri + "/surfer_bg.wasm")
        //replace all the instances of surfer.js with suferloc + /surfer.js
        html = this.replaceAll(html, "/surfer.js", surferWebviewUri + "/surfer.js")
        //replace all the instances of sw.js with suferloc + /sw.js
        html = this.replaceAll(html, "sw.js", surferWebviewUri + "/sw.js")
        //replace all the instances of integration.js with suferloc + /integration.js
        html = this.replaceAll(html, "/integration.js", surferWebviewUri + "/integration.js")


        return html
    }

    /**
     * Replace all occurrences of a string with another string
     */
    private replaceAll(input: string, search: string, replacement: string): string {
        return input.replace(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement)
    }
}