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
import { MDDocumentContentProvider, getMarkdownUri, isMarkdownFile, ContentSecurityPolicyArbiter } from './previewContentProvider';
import { TableOfContentsProvider } from './tableOfContentsProvider';

import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();


interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

interface OpenDocumentLinkArgs {
	path: string;
	fragment: string;
}

enum PreviewSecuritySelection {
	None,
	DisableEnhancedSecurityForWorkspace,
	EnableEnhancedSecurityForWorkspace
}

interface PreviewSecurityPickItem extends vscode.QuickPickItem {
	id: PreviewSecuritySelection;
}

class ExtensionContentSecurityProlicyArbiter implements ContentSecurityPolicyArbiter {
	private readonly key = 'trusted_preview_workspace:';

	constructor(
		private globalState: vscode.Memento
	) { }

	public isEnhancedSecurityDisableForWorkspace(): boolean {
		return this.globalState.get<boolean>(this.key + vscode.workspace.rootPath, false);
	}

	public addTrustedWorkspace(rootPath: string): Thenable<void> {
		return this.globalState.update(this.key + rootPath, true);
	}

	public removeTrustedWorkspace(rootPath: string): Thenable<void> {
		return this.globalState.update(this.key + rootPath, false);
	}

}

var telemetryReporter: TelemetryReporter | null;

export function activate(context: vscode.ExtensionContext) {
	const packageInfo = getPackageInfo();
	telemetryReporter = packageInfo && new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);
	if (telemetryReporter) {
		context.subscriptions.push(telemetryReporter);
	}

	const cspArbiter = new ExtensionContentSecurityProlicyArbiter(context.globalState);
	const engine = new MarkdownEngine();

	const contentProvider = new MDDocumentContentProvider(engine, context, cspArbiter);
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

	context.subscriptions.push(vscode.commands.registerCommand('_markdown.didClick', (uri: string, line) => {
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

	context.subscriptions.push(vscode.commands.registerCommand('_markdown.openDocumentLink', (args: OpenDocumentLinkArgs) => {
		const tryRevealLine = (editor: vscode.TextEditor) => {
			if (editor && args.fragment) {
				const toc = new TableOfContentsProvider(engine, editor.document);
				const line = toc.lookup(args.fragment);
				if (!isNaN(line)) {
					return editor.revealRange(
						new vscode.Range(line, 0, line, 0),
						vscode.TextEditorRevealType.AtTop);
				}
			}
		};
		if (vscode.window.activeTextEditor && isMarkdownFile(vscode.window.activeTextEditor.document) && vscode.window.activeTextEditor.document.uri.fsPath === args.path) {
			return tryRevealLine(vscode.window.activeTextEditor);
		} else {
			const resource = vscode.Uri.file(args.path);
			vscode.workspace.openTextDocument(resource)
				.then(vscode.window.showTextDocument)
				.then(tryRevealLine, _ => vscode.commands.executeCommand('vscode.open', resource));
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('markdown.showPreviewSecuritySelector', (resource: string | undefined) => {
		const workspacePath = vscode.workspace.rootPath || resource;
		if (!workspacePath) {
			return;
		}

		let sourceUri: vscode.Uri | null = null;
		if (resource) {
			sourceUri = vscode.Uri.parse(decodeURIComponent(resource));
		}

		if (!sourceUri && vscode.window.activeTextEditor) {
			const activeDocument = vscode.window.activeTextEditor.document;
			if (activeDocument.uri.scheme === 'markdown') {
				sourceUri = activeDocument.uri;
			} else {
				sourceUri = getMarkdownUri(activeDocument.uri);
			}
		}

		vscode.window.showQuickPick<PreviewSecurityPickItem>(
			[
				{
					id: PreviewSecuritySelection.EnableEnhancedSecurityForWorkspace,
					label: localize(
						'preview.showPreviewSecuritySelector.disallowScriptsForWorkspaceTitle',
						'Disable script execution in markdown previews for this workspace'),
					description: '',
					detail: cspArbiter.isEnhancedSecurityDisableForWorkspace()
						? ''
						: localize('preview.showPreviewSecuritySelector.currentSelection', 'Current setting')
				}, {
					id: PreviewSecuritySelection.DisableEnhancedSecurityForWorkspace,
					label: localize(
						'preview.showPreviewSecuritySelector.allowScriptsForWorkspaceTitle',
						'Enable script execution in markdown previews for this workspace'),
					description: '',
					detail: cspArbiter.isEnhancedSecurityDisableForWorkspace()
						? localize('preview.showPreviewSecuritySelector.currentSelection', 'Current setting')
						: ''
				},
			], {
				placeHolder: localize('preview.showPreviewSecuritySelector.title', 'Change security settings for the Markdown preview'),
			}).then(selection => {
				if (!workspacePath) {
					return false;
				}
				switch (selection && selection.id) {
					case PreviewSecuritySelection.DisableEnhancedSecurityForWorkspace:
						return cspArbiter.addTrustedWorkspace(workspacePath).then(() => true);

					case PreviewSecuritySelection.EnableEnhancedSecurityForWorkspace:
						return cspArbiter.removeTrustedWorkspace(workspacePath).then(() => true);
				}
				return false;
			}).then(shouldUpdate => {
				if (shouldUpdate && sourceUri) {
					contentProvider.update(sourceUri);
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

	if (vscode.workspace.getConfiguration('markdown').get('enableExperimentalExtensionApi', false)) {
		vscode.commands.executeCommand('_markdown.onActivateExtensions')
			.then(() => void 0, () => void 0);

		return {
			addPlugin(factory: (md: any) => any) {
				engine.addPlugin(factory);
			}
		};
	}
	return undefined;
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

	const thenable = vscode.commands.executeCommand('vscode.previewHtml',
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
	for (const editor of vscode.window.visibleTextEditors) {
		if (editor.document.uri.toString() === docUri.toString()) {
			return vscode.window.showTextDocument(editor.document, editor.viewColumn);
		}
	}

	return vscode.workspace.openTextDocument(docUri)
		.then(vscode.window.showTextDocument);
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


