/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import TelemetryReporter from 'vscode-extension-telemetry';
import { MarkdownEngine } from './markdownEngine';
import DocumentLinkProvider from './documentLinkProvider';
import MDDocumentSymbolProvider from './documentSymbolProvider';

interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

var telemetryReporter: TelemetryReporter | null;

export function activate(context: vscode.ExtensionContext) {
	const packageInfo = getPackageInfo();
	telemetryReporter = packageInfo && new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);

	const engine = new MarkdownEngine();

	const contentProvider = new MDDocumentContentProvider(engine, context);
	const contentProviderRegistration = vscode.workspace.registerTextDocumentContentProvider('markdown', contentProvider);

	const symbolsProvider = new MDDocumentSymbolProvider(engine);
	const symbolsProviderRegistration = vscode.languages.registerDocumentSymbolProvider({ language: 'markdown' }, symbolsProvider);
	context.subscriptions.push(contentProviderRegistration, symbolsProviderRegistration);

	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider('markdown', new DocumentLinkProvider()));

	context.subscriptions.push(vscode.commands.registerCommand('markdown.showPreview', showPreview));
	context.subscriptions.push(vscode.commands.registerCommand('markdown.showPreviewToSide', uri => showPreview(uri, true)));
	context.subscriptions.push(vscode.commands.registerCommand('markdown.showSource', showSource));

	context.subscriptions.push(vscode.commands.registerCommand('_markdown.revealLine', (uri, line) => {
		const sourceUri = vscode.Uri.parse(decodeURIComponent(uri));
		vscode.window.visibleTextEditors
			.filter(editor => isMarkdownFile(editor.document) && editor.document.uri.fsPath === sourceUri.fsPath)
			.forEach(editor => {
				const sourceLine = Math.floor(line);
				const text = editor.document.getText(new vscode.Range(sourceLine, 0, sourceLine + 1, 0));
				const fraction = line - Math.floor(line);
				const start = Math.floor(fraction * text.length);
				editor.revealRange(
					new vscode.Range(sourceLine, start, sourceLine + 1, 0),
					vscode.TextEditorRevealType.AtTop);
			});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('_markdown.didClick', (uri, line) => {
		const sourceUri = vscode.Uri.parse(decodeURIComponent(uri));
		return vscode.workspace.openTextDocument(sourceUri)
			.then(document => vscode.window.showTextDocument(document))
			.then(editor => vscode.commands.executeCommand('revealLine', { lineNumber: Math.floor(line), at: 'center' }).then(() => editor))
			.then(editor => {
				if (editor) {
					editor.selection = new vscode.Selection(
						new vscode.Position(Math.floor(line), 0),
						new vscode.Position(Math.floor(line), 0));
				}
			});
	}));

	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
		if (isMarkdownFile(document)) {
			const uri = getMarkdownUri(document.uri);
			contentProvider.update(uri);
		}
	}));

	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
		if (isMarkdownFile(event.document)) {
			const uri = getMarkdownUri(event.document.uri);
			contentProvider.update(uri);
		}
	}));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		vscode.workspace.textDocuments.forEach(document => {
			if (document.uri.scheme === 'markdown') {
				// update all generated md documents
				contentProvider.update(document.uri);
			}
		});
	}));

	context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(event => {
		if (isMarkdownFile(event.textEditor.document)) {
			vscode.commands.executeCommand('_workbench.htmlPreview.postMessage',
				getMarkdownUri(event.textEditor.document.uri),
				{
					line: event.selections[0].active.line
				});
		}
	}));
}

function isMarkdownFile(document: vscode.TextDocument) {
	return document.languageId === 'markdown'
		&& document.uri.scheme !== 'markdown'; // prevent processing of own documents
}

function getMarkdownUri(uri: vscode.Uri) {
	return uri.with({ scheme: 'markdown', path: uri.path + '.rendered', query: uri.toString() });
}

function showPreview(uri?: vscode.Uri, sideBySide: boolean = false) {

	let resource = uri;
	if (!(resource instanceof vscode.Uri)) {
		if (vscode.window.activeTextEditor) {
			// we are relaxed and don't check for markdown files
			resource = vscode.window.activeTextEditor.document.uri;
		}
	}

	if (!(resource instanceof vscode.Uri)) {
		if (!vscode.window.activeTextEditor) {
			// this is most likely toggling the preview
			return vscode.commands.executeCommand('markdown.showSource');
		}
		// nothing found that could be shown or toggled
		return;
	}

	let thenable = vscode.commands.executeCommand('vscode.previewHtml',
		getMarkdownUri(resource),
		getViewColumn(sideBySide),
		`Preview '${path.basename(resource.fsPath)}'`);

	if (telemetryReporter) {
		telemetryReporter.sendTelemetryEvent('openPreview', {
			where: sideBySide ? 'sideBySide' : 'inPlace',
			how: (uri instanceof vscode.Uri) ? 'action' : 'pallete'
		});
	}

	return thenable;
}

function getViewColumn(sideBySide: boolean): vscode.ViewColumn | undefined {
	const active = vscode.window.activeTextEditor;
	if (!active) {
		return vscode.ViewColumn.One;
	}

	if (!sideBySide) {
		return active.viewColumn;
	}

	switch (active.viewColumn) {
		case vscode.ViewColumn.One:
			return vscode.ViewColumn.Two;
		case vscode.ViewColumn.Two:
			return vscode.ViewColumn.Three;
	}

	return active.viewColumn;
}

function showSource(mdUri: vscode.Uri) {
	if (!mdUri) {
		return vscode.commands.executeCommand('workbench.action.navigateBack');
	}

	const docUri = vscode.Uri.parse(mdUri.query);

	for (let editor of vscode.window.visibleTextEditors) {
		if (editor.document.uri.toString() === docUri.toString()) {
			return vscode.window.showTextDocument(editor.document, editor.viewColumn);
		}
	}

	return vscode.workspace.openTextDocument(docUri).then(doc => {
		return vscode.window.showTextDocument(doc);
	});
}

function getPackageInfo(): IPackageInfo | null {
	const extention = vscode.extensions.getExtension('Microsoft.vscode-markdown');
	if (extention && extention.packageJSON) {
		return {
			name: extention.packageJSON.name,
			version: extention.packageJSON.version,
			aiKey: extention.packageJSON.aiKey
		};
	}
	return null;
}

class MDDocumentContentProvider implements vscode.TextDocumentContentProvider {
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	private _waiting: boolean;

	constructor(
		private engine: MarkdownEngine,
		private context: vscode.ExtensionContext
	) {
		this._waiting = false;
	}

	private getMediaPath(mediaFile: string): string {
		return this.context.asAbsolutePath(path.join('media', mediaFile));
	}

	private isAbsolute(p: string): boolean {
		return path.normalize(p + '/') === path.normalize(path.resolve(p) + '/');
	}

	private fixHref(resource: vscode.Uri, href: string): string {
		if (href) {
			// Use href if it is already an URL
			if (vscode.Uri.parse(href).scheme) {
				return href;
			}

			// Use href as file URI if it is absolute
			if (this.isAbsolute(href)) {
				return vscode.Uri.file(href).toString();
			}

			// use a workspace relative path if there is a workspace
			let rootPath = vscode.workspace.rootPath;
			if (rootPath) {
				return vscode.Uri.file(path.join(rootPath, href)).toString();
			}

			// otherwise look relative to the markdown file
			return vscode.Uri.file(path.join(path.dirname(resource.fsPath), href)).toString();
		}
		return href;
	}

	private computeCustomStyleSheetIncludes(uri: vscode.Uri): string {
		const styles = vscode.workspace.getConfiguration('markdown')['styles'];
		if (styles && Array.isArray(styles) && styles.length > 0) {
			return styles.map((style) => {
				return `<link rel="stylesheet" href="${this.fixHref(uri, style)}" type="text/css" media="screen">`;
			}).join('\n');
		}
		return '';
	}

	private getSettingsOverrideStyles(): string {
		const previewSettings = vscode.workspace.getConfiguration('markdown')['preview'];
		if (!previewSettings) {
			return '';
		}
		const {fontFamily, fontSize, lineHeight} = previewSettings;
		return `<style>
			body {
				${fontFamily ? `font-family: ${fontFamily};` : ''}
				${+fontSize > 0 ? `font-size: ${fontSize}px;` : ''}
				${+lineHeight > 0 ? `line-height: ${lineHeight};` : ''}
			}
		</style>`;
	}

	public provideTextDocumentContent(uri: vscode.Uri): Thenable<string> {
		const sourceUri = vscode.Uri.parse(uri.query);
		return vscode.workspace.openTextDocument(sourceUri).then(document => {
			const scrollBeyondLastLine = vscode.workspace.getConfiguration('editor')['scrollBeyondLastLine'];
			const wordWrap = vscode.workspace.getConfiguration('editor')['wordWrap'];

			const markdownConfig = vscode.workspace.getConfiguration('markdown');
			const previewFrontMatter = markdownConfig.get('previewFrontMatter', 'hide');

			let initialLine = 0;
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.uri.path === sourceUri.path) {
				initialLine = editor.selection.active.line;
			}

			const body = this.engine.render(sourceUri, previewFrontMatter === 'hide', document.getText());

			return `<!DOCTYPE html>
				<html>
				<head>
					<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
					<link rel="stylesheet" type="text/css" href="${this.getMediaPath('markdown.css')}">
					<link rel="stylesheet" type="text/css" href="${this.getMediaPath('tomorrow.css')}">
					${this.getSettingsOverrideStyles()}
					${this.computeCustomStyleSheetIncludes(uri)}
					<base href="${document.uri.toString(true)}">
				</head>
				<body class="${scrollBeyondLastLine ? 'scrollBeyondLastLine' : ''} ${wordWrap ? 'wordWrap' : ''} ${!!markdownConfig.get('preview.markEditorSelection') ? 'showEditorSelection' : ''}">
					${body}
					<script>
						window.initialData = {
							source: "${encodeURIComponent(sourceUri.toString(true))}",
							line: ${initialLine},
							scrollPreviewWithEditorSelection: ${!!markdownConfig.get('preview.scrollPreviewWithEditorSelection', true)},
							scrollEditorWithPreview: ${!!markdownConfig.get('preview.scrollEditorWithPreview', true)},
							doubleClickToSwitchToEditor: ${!!markdownConfig.get('preview.doubleClickToSwitchToEditor', true)},
						};
					</script>
					<script src="${this.getMediaPath('main.js')}"></script>
				</body>
				</html>`;
		});
	}

	get onDidChange(): vscode.Event<vscode.Uri> {
		return this._onDidChange.event;
	}

	public update(uri: vscode.Uri) {
		if (!this._waiting) {
			this._waiting = true;
			setTimeout(() => {
				this._waiting = false;
				this._onDidChange.fire(uri);
			}, 300);
		}
	}
}
