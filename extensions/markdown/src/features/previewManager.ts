/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

import * as nls from 'vscode-nls';
import { Logger } from '../logger';
import { MarkdownContentProvider, PreviewConfigManager, isMarkdownFile } from './previewContentProvider';
const localize = nls.loadMessageBundle();

class MarkdownPreview {

	public static previewScheme = 'vscode-markdown-preview';
	private static previewCount = 0;

	public isScrolling = false;
	public readonly uri: vscode.Uri;
	private readonly webview: vscode.Webview;
	private throttleTimer: any;
	private initialLine: number | undefined = undefined;
	private readonly disposables: vscode.Disposable[] = [];
	private firstUpdate = true;
	private currentVersion?: { resource: vscode.Uri, version: number };
	private _forceUpdate: boolean = false;

	constructor(
		private _resource: vscode.Uri,
		previewColumn: vscode.ViewColumn,
		public locked: boolean,
		private readonly contentProvider: MarkdownContentProvider,
		private readonly previewConfigurations: PreviewConfigManager,
		private readonly logger: Logger
	) {
		this.uri = vscode.Uri.parse(`${MarkdownPreview.previewScheme}:${MarkdownPreview.previewCount++}`);
		this.webview = vscode.window.createWebview(
			this.uri,
			this.getPreviewTitle(this._resource),
			previewColumn, {
				enableScripts: true,
				localResourceRoots: this.getLocalResourceRoots(_resource)
			});

		this.webview.onDidDispose(() => {
			this.dispose();
		}, null, this.disposables);

		this.webview.onDidChangeViewColumn(() => {
			this._onDidChangeViewColumnEmitter.fire();
		}, null, this.disposables);

		this.webview.onDidReceiveMessage(e => {
			vscode.commands.executeCommand(e.command, ...e.args);
		}, null, this.disposables);

		vscode.workspace.onDidChangeTextDocument(event => {
			if (isMarkdownFile(event.document) && this.isPreviewOf(event.document.uri)) {
				this.refresh();
			}
		}, null, this.disposables);

		vscode.window.onDidChangeTextEditorVisibleRanges(event => {
			if (isMarkdownFile(event.textEditor.document) && this.isPreviewOf(event.textEditor.document.uri)) {
				const resource = event.textEditor.document.uri;
				const line = getVisibleLine(event.textEditor);
				this.updateForView(resource, line);
			}
		}, null, this.disposables);
	}

	private readonly _onDisposeEmitter = new vscode.EventEmitter<void>();
	public readonly onDispose = this._onDisposeEmitter.event;

	private readonly _onDidChangeViewColumnEmitter = new vscode.EventEmitter<vscode.ViewColumn>();
	public readonly onDidChangeViewColumn = this._onDidChangeViewColumnEmitter.event;

	public get resource(): vscode.Uri {
		return this._resource;
	}

	public dispose() {
		this._onDisposeEmitter.fire();

		this._onDisposeEmitter.dispose();
		this._onDidChangeViewColumnEmitter.dispose();
		this.webview.dispose();

		disposeAll(this.disposables);
	}

	public update(resource: vscode.Uri) {
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.document.uri.fsPath === resource.fsPath) {
			this.initialLine = getVisibleLine(editor);
		} else {
			this.initialLine = undefined;
		}

		// Schedule update
		if (!this.throttleTimer) {
			this.throttleTimer = setTimeout(() => this.doUpdate(), resource.fsPath === this._resource.fsPath && !this.firstUpdate ? 300 : 0);
		}

		this.firstUpdate = false;
		this._resource = resource;
	}

	public refresh() {
		this._forceUpdate = true;
		this.update(this._resource);
	}

	public updateConfiguration() {
		if (this.previewConfigurations.shouldUpdateConfiguration(this._resource)) {
			this.refresh();
		}
	}

	public get viewColumn(): vscode.ViewColumn | undefined {
		return this.webview.viewColumn;
	}

	public isPreviewOf(resource: vscode.Uri): boolean {
		return this._resource.fsPath === resource.fsPath;
	}

	public matchesResource(
		otherResource: vscode.Uri,
		otherViewColumn: vscode.ViewColumn | undefined,
		otherLocked: boolean
	): boolean {
		if (this.viewColumn !== otherViewColumn) {
			return false;
		}

		if (this.locked) {
			return otherLocked && this.isPreviewOf(otherResource);
		} else {
			return !otherLocked;
		}
	}

	public matches(otherPreview: MarkdownPreview): boolean {
		return this.matchesResource(otherPreview._resource, otherPreview.viewColumn, otherPreview.locked);
	}

	public show(viewColumn: vscode.ViewColumn) {
		this.webview.show(viewColumn);
	}

	public toggleLock() {
		this.locked = !this.locked;
		this.webview.title = this.getPreviewTitle(this._resource);
	}

	private getPreviewTitle(resource: vscode.Uri): string {
		return this.locked
			? localize('lockedPreviewTitle', '[Preview] {0}', path.basename(resource.fsPath))
			: localize('previewTitle', 'Preview {0}', path.basename(resource.fsPath));
	}

	private updateForView(resource: vscode.Uri, topLine: number | undefined) {
		if (!this.isPreviewOf(resource)) {
			return;
		}

		if (this.isScrolling) {
			this.isScrolling = false;
			return;
		}

		if (typeof topLine === 'number') {
			this.logger.log('updateForView', { markdownFile: resource });
			this.initialLine = topLine;
			this.webview.postMessage({ line: topLine, source: resource.toString() });
		}
	}

	private async doUpdate(): Promise<void> {
		const resource = this._resource;
		this.throttleTimer = undefined;

		const document = await vscode.workspace.openTextDocument(resource);
		if (!this._forceUpdate && this.currentVersion && this.currentVersion.resource.fsPath === resource.fsPath && this.currentVersion.version === document.version) {
			if (this.initialLine) {
				this.updateForView(resource, this.initialLine);
			}
			return;
		}
		this._forceUpdate = false;

		this.currentVersion = { resource, version: document.version };
		this.contentProvider.provideTextDocumentContent(document, this.previewConfigurations, this.initialLine)
			.then(content => {
				if (this._resource === resource) {
					this.webview.title = this.getPreviewTitle(this._resource);
					this.webview.html = content;
				}
			});
	}

	private getLocalResourceRoots(resource: vscode.Uri): vscode.Uri[] {
		const folder = vscode.workspace.getWorkspaceFolder(resource);
		if (folder) {
			return [folder.uri];
		}

		if (!resource.scheme || resource.scheme === 'file') {
			return [vscode.Uri.parse(path.dirname(resource.fsPath))];
		}

		return [];
	}
}

export interface PreviewSettings {
	readonly resourceColumn: vscode.ViewColumn;
	readonly previewColumn: vscode.ViewColumn;
	readonly locked: boolean;
}

export class MarkdownPreviewManager {
	private static readonly markdownPreviewActiveContextKey = 'markdownPreviewFocus';

	private previews: MarkdownPreview[] = [];
	private readonly previewConfigurations = new PreviewConfigManager();

	private readonly disposables: vscode.Disposable[] = [];

	public constructor(
		private readonly contentProvider: MarkdownContentProvider,
		private readonly logger: Logger
	) {
		vscode.window.onDidChangeActiveEditor(editor => {
			vscode.commands.executeCommand('setContext', MarkdownPreviewManager.markdownPreviewActiveContextKey,
				editor && editor.editorType === 'webview' && editor.uri.scheme === MarkdownPreview.previewScheme);

			if (editor && editor.editorType === 'texteditor') {
				if (isMarkdownFile(editor.document)) {
					for (const preview of this.previews.filter(preview => !preview.locked)) {
						preview.update(editor.document.uri);
					}
				}
			}
		}, null, this.disposables);
	}

	public dispose(): void {
		disposeAll(this.disposables);
		disposeAll(this.previews);
	}

	public refresh() {
		for (const preview of this.previews) {
			preview.refresh();
		}
	}

	public updateConfiguration() {
		for (const preview of this.previews) {
			preview.updateConfiguration();
		}
	}

	public preview(
		resource: vscode.Uri,
		previewSettings: PreviewSettings
	): void {
		let preview = this.getExistingPreview(resource, previewSettings);
		if (preview) {
			preview.show(previewSettings.previewColumn);
		} else {
			preview = new MarkdownPreview(resource, previewSettings.previewColumn, previewSettings.locked, this.contentProvider, this.previewConfigurations, this.logger);
			preview.onDispose(() => {
				const existing = this.previews.indexOf(preview!);
				if (existing >= 0) {
					this.previews.splice(existing, 1);
				}
			});
			preview.onDidChangeViewColumn(() => {
				disposeAll(this.previews.filter(otherPreview => preview !== otherPreview && preview!.matches(otherPreview)));
			});
			this.previews.push(preview);
		}

		preview.update(resource);
	}

	public revealLine(
		resource: vscode.Uri,
		line: number
	) {
		for (const editor of vscode.window.visibleTextEditors) {
			if (!isMarkdownFile(editor.document) || editor.document.uri.fsPath !== resource.fsPath) {
				continue;
			}

			const sourceLine = Math.floor(line);
			const fraction = line - sourceLine;
			const text = editor.document.lineAt(sourceLine).text;
			const start = Math.floor(fraction * text.length);
			editor.revealRange(
				new vscode.Range(sourceLine, start, sourceLine + 1, 0),
				vscode.TextEditorRevealType.AtTop);
		}

		for (const preview of this.previews) {
			if (preview.isPreviewOf(resource)) {
				preview.isScrolling = true;
			}
		}
	}

	public getResourceForPreview(previewUri: vscode.Uri): vscode.Uri | undefined {
		const preview = this.getPreviewWithUri(previewUri);
		return preview && preview.resource;
	}

	public toggleLock(previewUri: vscode.Uri) {
		const preview = this.getPreviewWithUri(previewUri);
		if (preview) {
			preview.toggleLock();

			// Close any previews that are now redundant, such as having two dynamic previews in the same editor group
			for (const otherPreview of this.previews) {
				if (otherPreview !== preview && preview.matches(otherPreview)) {
					otherPreview.dispose();
				}
			}
		}
	}

	private getExistingPreview(
		resource: vscode.Uri,
		previewSettings: PreviewSettings
	): MarkdownPreview | undefined {
		return this.previews.find(preview =>
			preview.matchesResource(resource, previewSettings.previewColumn, previewSettings.locked));
	}

	private getPreviewWithUri(previewUri: vscode.Uri): MarkdownPreview | undefined {
		return this.previews.find(preview => preview.uri.toString() === previewUri.toString());
	}
}


function disposeAll(disposables: vscode.Disposable[]) {
	while (disposables.length) {
		const item = disposables.pop();
		if (item) {
			item.dispose();
		}
	}
}

function getVisibleLine(editor: vscode.TextEditor): number | undefined {
	if (!editor.visibleRanges.length) {
		return undefined;
	}

	const lineNumber = editor.visibleRanges[0].start.line;
	const line = editor.document.lineAt(lineNumber);
	const progress = Math.min(0.999, editor.visibleRanges[0].start.character / (line.text.length + 1));
	return lineNumber + progress;
}