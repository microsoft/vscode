import { webviewApi } from "@pearai/common";
import * as vscode from "vscode";
import { generateNonce } from "./generateNonce";

export class WebviewContainer {
	private readonly webview: vscode.Webview;
	private readonly panelId: string;
	private readonly panelCssId: string;
	private readonly extensionUri: vscode.Uri;
	private readonly isStateReloadingEnabled: boolean;

	readonly onDidReceiveMessage;

	constructor({
		panelId,
		panelCssId = panelId,
		webview,
		extensionUri,
		isStateReloadingEnabled,
	}: {
		panelId: "chat" | "diff";
		panelCssId?: string;
		webview: vscode.Webview;
		extensionUri: vscode.Uri;
		isStateReloadingEnabled: boolean;
	}) {
		this.panelId = panelId;
		this.panelCssId = panelCssId;
		this.webview = webview;
		this.extensionUri = extensionUri;
		this.isStateReloadingEnabled = isStateReloadingEnabled;

		this.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri],
		};
		this.webview.html = this.createHtml();

		this.onDidReceiveMessage = this.webview.onDidReceiveMessage;
	}

	async updateState(state: webviewApi.PanelState) {
		return this.webview.postMessage({
			type: "updateState",
			state,
		} satisfies webviewApi.IncomingMessage["data"]);
	}

	private getUri(...paths: string[]) {
		const baseUri = this.extensionUri.fsPath.endsWith("dev")
			? this.extensionUri
			: vscode.Uri.joinPath(this.extensionUri, "lib");

		return this.webview.asWebviewUri(
			vscode.Uri.joinPath(baseUri, "webview", ...paths)
		);
	}

	private createHtml() {
		const baseCssUri = this.getUri("asset", "base.css");
		const codiconsCssUri = this.getUri("asset", "codicons.css");
		const panelCssUri = this.getUri("asset", `${this.panelCssId}.css`);
		const scriptUri = this.getUri("dist", "webview.js");
		const prismScriptUri = this.getUri("asset", "prism.js");

		// Use a nonce to only allow a specific script to be run.
		const nonce = generateNonce();
		const prismNonce = generateNonce();

		const cspSource = this.webview?.cspSource;

		return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; font-src ${cspSource}; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'nonce-${prismNonce}';" />
    <link href="${baseCssUri}" rel="stylesheet" />
    <link href="${codiconsCssUri}" rel="stylesheet" />
    <link href="${panelCssUri}" rel="stylesheet" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body>
    <div id="root" />

    <!-- Without the closing /script tag, the second script doesn't load -->
    <script nonce="${prismNonce}" src="${prismScriptUri}"></script>
    <script nonce="${nonce}"
            src="${scriptUri}"
            data-panel-id="${this.panelId}"
            data-state-reloading-enabled="${this.isStateReloadingEnabled}" />
  </body>
</html>`;
	}
}
