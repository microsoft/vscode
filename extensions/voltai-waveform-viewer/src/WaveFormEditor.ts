import * as vscode from 'vscode';
import * as path from 'path';

export class WaveformEditorProvider implements vscode.CustomTextEditorProvider {

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
    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {

        // Setup initial content for the webview
        webviewPanel.webview.options = {
            enableScripts: true,
        };

		const uridocstring = vscode.Uri.file(document.uri.fsPath).toString()
		const index_path = vscode.Uri.joinPath(this.context.extensionUri, 'surfer', 'index.html')
		const surfer_loc = vscode.Uri.joinPath(this.context.extensionUri, 'surfer')

		const html = await this.getHtmlForWebview(webviewPanel.webview, index_path, surfer_loc)
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

		//replace all the instances of manifest.json with suferloc + /manifest.json
		html = html.replaceAll("manifest.json", surferloc + "/manifest.json")
		//replace all the instances of surfer_bg.wasm with suferloc + /surfer_bg.wasm
		html = html.replaceAll("/surfer_bg.wasm", surferloc + "/surfer_bg.wasm")
		//replace all the instances of surfer.js with suferloc + /surfer.js
		html = html.replaceAll("/surfer.js", surferloc + "/surfer.js")
		//replace all the instances of sw.js with suferloc + /sw.js
		html = html.replaceAll("sw.js", surferloc + "/sw.js")
		//replace all the instances of integration.js with suferloc + /integration.js
		html = html.replaceAll("/integration.js", surferloc + "/integration.js")


		const load_notifier = `
			(function() {
				const vscode = acquireVsCodeApi();

				vscode.postMessage({
					command: 'loaded',
				})
			}())`
		html = html.replaceAll("/*SURFER_SETUP_HOOKS*/", `${load_notifier}`)

		return html
	}

}