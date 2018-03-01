/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

import { Logger } from '../logger';
import { MarkdownContentProvider, PreviewConfigManager, isMarkdownFile } from './previewContentProvider';
import { disposeAll } from '../util/dispose';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export class MarkdownFileTopmostLineMonitor {
	private readonly disposables: vscode.Disposable[] = [];

	private readonly pendingUpdates = new Map<string, number>();

	constructor() {
		vscode.window.onDidChangeTextEditorVisibleRanges(event => {
			if (isMarkdownFile(event.textEditor.document)) {
				const line = getVisibleLine(event.textEditor);
				if (line) {
					this.updateLine(event.textEditor.document.uri, line);
				}
			}
		}, null, this.disposables);
	}

	dispose() {
		disposeAll(this.disposables);
	}

	private readonly _onDidChangeTopmostLineEmitter = new vscode.EventEmitter<{ resource: vscode.Uri, line: number }>();
	public readonly onDidChangeTopmostLine = this._onDidChangeTopmostLineEmitter.event;

	private updateLine(
		resource: vscode.Uri,
		line: number
	) {
		const key = resource.toString();
		if (!this.pendingUpdates.has(key)) {
			// schedule update
			setTimeout(() => {
				if (this.pendingUpdates.has(key)) {
					this._onDidChangeTopmostLineEmitter.fire({
						resource,
						line: this.pendingUpdates.get(key) as number
					});
					this.pendingUpdates.delete(key);
				}
			}, 50);
		}

		this.pendingUpdates.set(key, line);
	}
}

export class MarkdownPreview {

	public static previewScheme = 'vscode-markdown-preview';
	private static previewCount = 0;

	public readonly uri: vscode.Uri;
	private readonly webview: vscode.Webview;
	private throttleTimer: any;
	private initialLine: number | undefined = undefined;
	private readonly disposables: vscode.Disposable[] = [];
	private firstUpdate = true;
	private currentVersion?: { resource: vscode.Uri, version: number };
	private forceUpdate = false;
	private isScrolling = false;

	constructor(
		private _resource: vscode.Uri,
		previewColumn: vscode.ViewColumn,
		public locked: boolean,
		private readonly contentProvider: MarkdownContentProvider,
		private readonly previewConfigurations: PreviewConfigManager,
		private readonly logger: Logger,
		topmostLineMonitor: MarkdownFileTopmostLineMonitor
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
			if (e.source !== this._resource.toString()) {
				return;
			}

			switch (e.type) {
				case 'command':
					vscode.commands.executeCommand(e.body.command, ...e.body.args);
					break;

				case 'revealLine':
					this.onDidScrollPreview(e.body.line);
					break;

				case 'didClick':
					this.onDidClickPreview(e.body.line);
					break;

			}
		}, null, this.disposables);

		vscode.workspace.onDidChangeTextDocument(event => {
			if (this.isPreviewOf(event.document.uri)) {
				this.refresh();
			}
		}, null, this.disposables);

		topmostLineMonitor.onDidChangeTopmostLine(event => {
			if (this.isPreviewOf(event.resource)) {
				this.updateForView(event.resource, event.line);
			}
		}, null, this.disposables);

		vscode.window.onDidChangeTextEditorSelection(event => {
			if (this.isPreviewOf(event.textEditor.document.uri)) {
				this.webview.postMessage({
					type: 'onDidChangeTextEditorSelection',
					line: event.selections[0].active.line,
					source: this.resource.toString()
				});
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

		// If we have changed resources, cancel any pending updates
		const isResourceChange = resource.fsPath !== this._resource.fsPath;
		if (isResourceChange) {
			clearTimeout(this.throttleTimer);
			this.throttleTimer = undefined;
		}

		this._resource = resource;

		// Schedule update if none is pending
		if (!this.throttleTimer) {
			if (isResourceChange || this.firstUpdate) {
				this.doUpdate();
			} else {
				this.throttleTimer = setTimeout(() => this.doUpdate(), 300);
			}
		}

		this.firstUpdate = false;
	}

	public refresh() {
		this.forceUpdate = true;
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
			this.webview.postMessage({
				type: 'updateView',
				line: topLine,
				source: resource.toString()
			});
		}
	}

	private async doUpdate(): Promise<void> {
		const resource = this._resource;

		clearTimeout(this.throttleTimer);
		this.throttleTimer = undefined;

		const document = await vscode.workspace.openTextDocument(resource);
		if (!this.forceUpdate && this.currentVersion && this.currentVersion.resource.fsPath === resource.fsPath && this.currentVersion.version === document.version) {
			if (this.initialLine) {
				this.updateForView(resource, this.initialLine);
			}
			return;
		}
		this.forceUpdate = false;

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

	private onDidScrollPreview(line: number) {
		for (const editor of vscode.window.visibleTextEditors) {
			if (!this.isPreviewOf(editor.document.uri)) {
				continue;
			}

			this.isScrolling = true;
			const sourceLine = Math.floor(line);
			const fraction = line - sourceLine;
			const text = editor.document.lineAt(sourceLine).text;
			const start = Math.floor(fraction * text.length);
			editor.revealRange(
				new vscode.Range(sourceLine, start, sourceLine + 1, 0),
				vscode.TextEditorRevealType.AtTop);
		}
	}

	private async onDidClickPreview(line: number): Promise<void> {
		for (const visibleEditor of vscode.window.visibleTextEditors) {
			if (this.isPreviewOf(visibleEditor.document.uri)) {
				const editor = await vscode.window.showTextDocument(visibleEditor.document, visibleEditor.viewColumn);
				const position = new vscode.Position(line, 0);
				editor.selection = new vscode.Selection(position, position);
				return;
			}
		}
	}
}

export interface PreviewSettings {
	readonly resourceColumn: vscode.ViewColumn;
	readonly previewColumn: vscode.ViewColumn;
	readonly locked: boolean;
}

/**
 * Get the top-most visible range of `editor`.
 *
 * Returns a fractional line number based the visible character within the line.
 * Floor to get real line number
 */
function getVisibleLine(editor: vscode.TextEditor): number | undefined {
	if (!editor.visibleRanges.length) {
		return undefined;
	}

	const firstVisiblePosition = editor.visibleRanges[0].start;
	const lineNumber = firstVisiblePosition.line;
	const line = editor.document.lineAt(lineNumber);
	const progress = firstVisiblePosition.character / (line.text.length + 2);
	return lineNumber + progress;
}
