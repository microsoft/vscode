/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

interface PdfSection {
	readonly title: string;
	readonly level: number;
	readonly page: number | undefined;
}

type WebviewMessage =
	| { readonly type: 'ready' }
	| { readonly type: 'loaded'; readonly pageCount: number; readonly pageLabels: readonly string[] | null; readonly outline: readonly PdfSection[] }
	| { readonly type: 'view'; readonly page: number; readonly scale: number }
	| { readonly type: 'find'; readonly current: number; readonly total: number }
	| { readonly type: 'password'; readonly incorrect: boolean }
	| { readonly type: 'error' };

type ExtensionMessage =
	| { readonly type: 'load'; readonly data: Uint8Array }
	| { readonly type: 'message'; readonly text: string }
	| { readonly type: 'password'; readonly password: string }
	| { readonly type: 'zoom'; readonly value: number | string }
	| { readonly type: 'goToPage'; readonly page: string }
	| { readonly type: 'goToSection'; readonly index: number }
	| { readonly type: 'find'; readonly query: string; readonly again: boolean; readonly previous: boolean }
	| { readonly type: 'findClose' };

export function activate(context: vscode.ExtensionContext): void {
	new PdfPreviewManager(context.extensionUri, context.subscriptions);
}

/**
 * Opens PDF files in {@link PdfPreview previews}, and runs the commands and shows the status of the
 * preview that is active.
 */
class PdfPreviewManager implements vscode.CustomReadonlyEditorProvider {

	private readonly _pageEntry = vscode.window.createStatusBarItem('status.pdfPreview.page', vscode.StatusBarAlignment.Right, 102);
	private readonly _zoomEntry = vscode.window.createStatusBarItem('status.pdfPreview.zoom', vscode.StatusBarAlignment.Right, 101);
	private _active: PdfPreview | undefined;
	private _findInput: vscode.InputBox | undefined;
	private _findQuery = '';
	private _hasOutline = false;

	constructor(private readonly _extensionRoot: vscode.Uri, subscriptions: vscode.Disposable[]) {
		this._pageEntry.name = vscode.l10n.t("PDF Page");
		this._pageEntry.command = 'pdfPreview.goToPage';
		this._zoomEntry.name = vscode.l10n.t("PDF Zoom");
		this._zoomEntry.command = 'pdfPreview.selectZoom';

		const findAgain = (preview: PdfPreview, previous: boolean) => this._findQuery ? preview.post({ type: 'find', query: this._findQuery, again: true, previous }) : this._find(preview);
		const commands: Record<string, (preview: PdfPreview) => unknown> = {
			'pdfPreview.zoomIn': preview => preview.post({ type: 'zoom', value: 1 }),
			'pdfPreview.zoomOut': preview => preview.post({ type: 'zoom', value: -1 }),
			'pdfPreview.selectZoom': preview => this._selectZoom(preview),
			'pdfPreview.goToPage': preview => this._goToPage(preview),
			'pdfPreview.goToSection': preview => this._goToSection(preview),
			'pdfPreview.find': preview => this._find(preview),
			'pdfPreview.findNext': preview => findAgain(preview, false),
			'pdfPreview.findPrevious': preview => findAgain(preview, true),
			'pdfPreview.saveAs': () => vscode.commands.executeCommand('workbench.action.files.saveAs'),
		};
		subscriptions.push(
			this._pageEntry,
			this._zoomEntry,
			vscode.window.registerCustomEditorProvider('vscode.pdfPreview', this, { supportsMultipleEditorsPerDocument: true }),
			...Object.entries(commands).map(([id, run]) => vscode.commands.registerCommand(id, () => this._active && run(this._active))),
		);
	}

	public openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
		return { uri, dispose: () => { } };
	}

	public resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): void {
		const preview: PdfPreview = new PdfPreview(this._extensionRoot, document.uri, panel, () => this._update(preview));
		this._update(preview);
	}

	private _update(preview: PdfPreview): void {
		const active = preview.isActive ? preview : this._active === preview ? undefined : this._active;
		if (active !== this._active) {
			this._active = active;
			this._findInput?.hide();
		}
		if (this._hasOutline !== !!active?.outline.length) {
			this._hasOutline = !this._hasOutline;
			void vscode.commands.executeCommand('setContext', 'pdfPreview.hasOutline', this._hasOutline);
		}
		if (active?.pageCount) {
			this._pageEntry.text = vscode.l10n.t("Page {0} of {1}", active.page, active.pageCount);
			this._zoomEntry.text = `${Math.round(active.scale * 100)}%`;
			this._pageEntry.show();
			this._zoomEntry.show();
		} else {
			this._pageEntry.hide();
			this._zoomEntry.hide();
		}
		if (this._findInput && active?.findResult) {
			const { current, total } = active.findResult;
			this._findInput.prompt = !this._findInput.value ? undefined : total ? vscode.l10n.t("{0} of {1}", current, total) : vscode.l10n.t("No results");
		}
	}

	private async _selectZoom(preview: PdfPreview): Promise<void> {
		const pick = await vscode.window.showQuickPick([
			{ label: vscode.l10n.t("Fit Width"), value: 'page-width' },
			{ label: vscode.l10n.t("Fit Page"), value: 'page-fit' },
			...[0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map(scale => ({ label: `${scale * 100}%`, value: String(scale) })),
		], { placeHolder: vscode.l10n.t("Select zoom level") });
		if (pick) {
			preview.post({ type: 'zoom', value: pick.value });
		}
	}

	private async _goToPage(preview: PdfPreview): Promise<void> {
		const page = await vscode.window.showInputBox({
			prompt: vscode.l10n.t("Type a page number between 1 and {0}", preview.pageCount),
			// Page labels take precedence over page numbers, so start with the label of the current page
			value: preview.pageLabels?.[preview.page - 1] || String(preview.page),
			validateInput: value => preview.isPage(value) ? undefined : vscode.l10n.t("This document has no page {0}.", value),
		});
		if (page) {
			preview.post({ type: 'goToPage', page });
		}
	}

	private async _goToSection(preview: PdfPreview): Promise<void> {
		const pick = await vscode.window.showQuickPick(preview.outline.map((section, index) => ({
			label: '\u00a0'.repeat(section.level * 4) + section.title,
			description: section.page ? vscode.l10n.t("Page {0}", section.page) : undefined,
			index,
		})), { placeHolder: vscode.l10n.t("Go to a section of the document") });
		if (pick) {
			preview.post({ type: 'goToSection', index: pick.index });
		}
	}

	private _find(preview: PdfPreview): void {
		this._findInput?.dispose();
		const input = this._findInput = vscode.window.createInputBox();
		const previousButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('arrow-up'), tooltip: vscode.l10n.t("Previous Match") };
		const nextButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('arrow-down'), tooltip: vscode.l10n.t("Next Match") };
		const find = (again: boolean, previous: boolean) => preview.post({ type: 'find', query: this._findQuery = input.value, again, previous });
		input.title = vscode.l10n.t("Find in PDF");
		input.placeholder = vscode.l10n.t("Find");
		input.buttons = [previousButton, nextButton];
		input.value = this._findQuery;
		input.onDidChangeValue(() => find(false, false));
		input.onDidAccept(() => find(true, false));
		input.onDidTriggerButton(button => find(true, button === previousButton));
		input.onDidHide(() => {
			preview.post({ type: 'findClose' });
			input.dispose();
			if (this._findInput === input) {
				this._findInput = undefined;
			}
		});
		input.show();
		if (input.value) {
			find(false, false);
		}
	}
}

/**
 * Shows a PDF file in a webview with pdf.js, and reloads it when the file changes.
 */
class PdfPreview {

	public pageCount = 0;
	public pageLabels: readonly string[] | null = null;
	public outline: readonly PdfSection[] = [];
	public page = 1;
	public scale = 1;
	public findResult: { readonly current: number; readonly total: number } | undefined;

	private readonly _disposables: vscode.Disposable[] = [];
	private _reloadTimer: ReturnType<typeof setTimeout> | undefined;
	private _loads = 0;
	private _isDisposed = false;

	constructor(
		extensionRoot: vscode.Uri,
		private readonly _resource: vscode.Uri,
		private readonly _panel: vscode.WebviewPanel,
		private readonly _onDidChange: () => void,
	) {
		const root = vscode.Uri.joinPath(extensionRoot, 'preview-out');
		_panel.webview.options = { enableScripts: true, localResourceRoots: [root] };
		_panel.webview.html = getHtml(_panel.webview, root);

		const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(_resource, '*'));
		this._disposables.push(
			watcher,
			watcher.onDidChange(() => this._scheduleReload()),
			watcher.onDidCreate(() => this._scheduleReload()),
			_panel.webview.onDidReceiveMessage((message: WebviewMessage) => this._onMessage(message)),
			_panel.onDidChangeViewState(() => _onDidChange()),
			_panel.onDidDispose(() => this._dispose()),
		);
	}

	public get isActive(): boolean {
		return !this._isDisposed && this._panel.active;
	}

	/**
	 * Whether `value` is the number or the label of a page.
	 */
	public isPage(value: string): boolean {
		const page = Number(value);
		return !!this.pageLabels?.includes(value) || (Number.isInteger(page) && page >= 1 && page <= this.pageCount);
	}

	public post(message: ExtensionMessage): void {
		if (!this._isDisposed) {
			void this._panel.webview.postMessage(message);
		}
	}

	private async _onMessage(message: WebviewMessage): Promise<void> {
		switch (message.type) {
			case 'ready':
				return this._load();
			case 'loaded':
				({ pageCount: this.pageCount, pageLabels: this.pageLabels, outline: this.outline } = message);
				break;
			case 'view':
				({ page: this.page, scale: this.scale } = message);
				break;
			case 'find':
				this.findResult = message;
				break;
			case 'password': {
				const password = await vscode.window.showInputBox({
					password: true,
					ignoreFocusOut: true,
					prompt: message.incorrect
						? vscode.l10n.t("The password is incorrect. Enter the password of {0}.", basename(this._resource))
						: vscode.l10n.t("Enter the password of {0}.", basename(this._resource)),
				});
				return this.post(password === undefined ? { type: 'message', text: vscode.l10n.t("The PDF is protected with a password.") } : { type: 'password', password });
			}
			case 'error':
				return this.post({ type: 'message', text: invalidMessage() });
		}
		this._onDidChange();
	}

	private async _load(): Promise<void> {
		const load = ++this._loads;
		const data = await vscode.workspace.fs.readFile(this._resource).then(undefined, () => new Uint8Array());
		if (load !== this._loads) {
			return; // A newer read started meanwhile
		}
		if (isCompletePdf(data)) {
			// Node.js buffers would be sent as JSON, so send a plain view of their bytes
			this.post({ type: 'load', data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) });
		} else if (!this.pageCount) {
			// Otherwise keep showing the previous document, e.g. while the file is being written
			this.post({ type: 'message', text: invalidMessage() });
		}
	}

	private _scheduleReload(): void {
		clearTimeout(this._reloadTimer);
		this._reloadTimer = setTimeout(() => void this._load(), 100);
	}

	private _dispose(): void {
		this._isDisposed = true;
		clearTimeout(this._reloadTimer);
		vscode.Disposable.from(...this._disposables).dispose();
		this._onDidChange();
	}
}

/**
 * Whether `data` has the PDF signature in its first and the end of file marker in its last 1024
 * bytes, like PDF readers require. A file that is still being written lacks the marker.
 */
function isCompletePdf(data: Uint8Array): boolean {
	const text = (start: number, end?: number) => String.fromCharCode(...data.subarray(start, end));
	return text(0, 1024 + 5).includes('%PDF-') && text(-1024).includes('%%EOF');
}

function invalidMessage(): string {
	return vscode.l10n.t("The file is not a valid PDF document.");
}

function basename(resource: vscode.Uri): string {
	return resource.path.slice(resource.path.lastIndexOf('/') + 1);
}

function getHtml(webview: vscode.Webview, root: vscode.Uri): string {
	const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
	const rootUri = webview.asWebviewUri(root).toString();
	return `<!DOCTYPE html>
<html lang="${vscode.env.language}">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval'; worker-src blob:; connect-src ${webview.cspSource}; img-src ${webview.cspSource} blob: data:; style-src ${webview.cspSource}; font-src data:">
	<link rel="stylesheet" href="${rootUri}/index.css">
</head>
<body>
	<div id="viewerContainer" tabindex="0"><div class="pdfViewer"></div></div>
	<div id="message" role="alert"></div>
	<script type="module" src="${rootUri}/index.js" nonce="${nonce}"></script>
</body>
</html>`;
}
