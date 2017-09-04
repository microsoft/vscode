/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vscode-nls';
const localize = nls.config(process.env.VSCODE_NLS_CONFIG)();
import * as vscode from 'vscode';
import * as path from 'path';
import TelemetryReporter from 'vscode-extension-telemetry';
import { MarkdownEngine } from './markdownEngine';
import DocumentLinkProvider from './documentLinkProvider';
import MDDocumentSymbolProvider from './documentSymbolProvider';
import { ExtensionContentSecurityPolicyArbiter, PreviewSecuritySelector } from './security';
import { MDDocumentContentProvider, getMarkdownUri, isMarkdownFile } from './previewContentProvider';
import { TableOfContentsProvider } from './tableOfContentsProvider';
import { Logger } from './logger';

interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

interface OpenDocumentLinkArgs {
	path: string;
	fragment: string;
}

const resolveExtensionResources = (extension: vscode.Extension<any>, stylePath: string): vscode.Uri => {
	const resource = vscode.Uri.parse(stylePath);
	if (resource.scheme) {
		return resource;
	}
	return vscode.Uri.file(path.join(extension.extensionPath, stylePath));
};

var telemetryReporter: TelemetryReporter | null;

export function activate(context: vscode.ExtensionContext) {
	const packageInfo = getPackageInfo();
	telemetryReporter = packageInfo && new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);
	if (telemetryReporter) {
		context.subscriptions.push(telemetryReporter);
	}

	const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState);
	const engine = new MarkdownEngine();

	const logger = new Logger();

	const contentProvider = new MDDocumentContentProvider(engine, context, cspArbiter, logger);
	const contentProviderRegistration = vscode.workspace.registerTextDocumentContentProvider('markdown', contentProvider);
	const previewSecuritySelector = new PreviewSecuritySelector(cspArbiter, contentProvider);

	for (const extension of vscode.extensions.all) {
		const contributes = extension.packageJSON && extension.packageJSON.contributes;
		if (!contributes) {
			continue;
		}

		const styles = contributes['markdown.previewStyles'];
		if (styles && Array.isArray(styles)) {
			for (const style of styles) {
				try {
					contentProvider.addStyle(resolveExtensionResources(extension, style));
				} catch (e) {
					// noop
				}
			}
		}

		const scripts = contributes['markdown.previewScripts'];
		if (scripts && Array.isArray(scripts)) {
			for (const script of scripts) {
				try {
					contentProvider.addScript(resolveExtensionResources(extension, script));
				} catch (e) {
					// noop
				}
			}
		}

		if (contributes['markdown.markdownItPlugins']) {
			extension.activate().then(() => {
				if (extension.exports && extension.exports.extendMarkdownIt) {
					engine.addPlugin((md: any) => extension.exports.extendMarkdownIt(md));
				}
			});
		}
	}

	const symbolsProvider = new MDDocumentSymbolProvider(engine);
	const symbolsProviderRegistration = vscode.languages.registerDocumentSymbolProvider({ language: 'markdown' }, symbolsProvider);
	context.subscriptions.push(contentProviderRegistration, symbolsProviderRegistration);

	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider('markdown', new DocumentLinkProvider()));

	context.subscriptions.push(vscode.commands.registerCommand('markdown.showPreview', (uri) => showPreview(cspArbiter, uri, false)));
	context.subscriptions.push(vscode.commands.registerCommand('markdown.showPreviewToSide', uri => showPreview(cspArbiter, uri, true)));
	context.subscriptions.push(vscode.commands.registerCommand('markdown.showSource', showSource));

	context.subscriptions.push(vscode.commands.registerCommand('_markdown.revealLine', (uri, line) => {
		const sourceUri = vscode.Uri.parse(decodeURIComponent(uri));
		logger.log('revealLine', { uri, sourceUri: sourceUri.toString(), line });

		vscode.window.visibleTextEditors
			.filter(editor => isMarkdownFile(editor.document) && editor.document.uri.fsPath === sourceUri.fsPath)
			.forEach(editor => {
				const sourceLine = Math.floor(line);
				const fraction = line - sourceLine;
				const text = editor.document.lineAt(sourceLine).text;
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
			.then(editor =>
				vscode.commands.executeCommand('revealLine', { lineNumber: Math.floor(line), at: 'center' })
					.then(() => editor))
			.then(editor => {
				if (editor) {
					editor.selection = new vscode.Selection(
						new vscode.Position(Math.floor(line), 0),
						new vscode.Position(Math.floor(line), 0));
				}
			});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('_markdown.openDocumentLink', (args: OpenDocumentLinkArgs) => {
		const tryRevealLine = async (editor: vscode.TextEditor) => {
			if (editor && args.fragment) {
				const toc = new TableOfContentsProvider(engine, editor.document);
				const line = await toc.lookup(args.fragment);
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
			return vscode.workspace.openTextDocument(resource)
				.then(vscode.window.showTextDocument)
				.then(tryRevealLine, _ => vscode.commands.executeCommand('vscode.open', resource));
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('markdown.showPreviewSecuritySelector', (resource: string | undefined) => {
		if (resource) {
			const source = vscode.Uri.parse(resource).query;
			previewSecuritySelector.showSecutitySelectorForResource(vscode.Uri.parse(source));
		} else {
			if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'markdown') {
				previewSecuritySelector.showSecutitySelectorForResource(vscode.window.activeTextEditor.document.uri);
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('markdown.refreshPreview', (resource: string | undefined) => {
		if (resource) {
			const source = vscode.Uri.parse(resource);
			contentProvider.update(source);
		} else if (vscode.window.activeTextEditor && isMarkdownFile(vscode.window.activeTextEditor.document)) {
			contentProvider.update(getMarkdownUri(vscode.window.activeTextEditor.document.uri));
		} else {
			// update all generated md documents
			for (const document of vscode.workspace.textDocuments) {
				if (document.uri.scheme === 'markdown') {
					contentProvider.update(document.uri);
				}
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('_markdown.onPreviewStyleLoadError', (resources: string[]) => {
		vscode.window.showWarningMessage(localize('onPreviewStyleLoadError', "Could not load 'markdown.styles': {0}", resources.join(', ')));
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
		logger.updateConfiguration();
		contentProvider.updateConfiguration();
	}));

	context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(event => {
		if (isMarkdownFile(event.textEditor.document)) {
			const markdownFile = getMarkdownUri(event.textEditor.document.uri);
			logger.log('updatePreviewForSelection', { markdownFile: markdownFile.toString() });

			vscode.commands.executeCommand('_workbench.htmlPreview.postMessage',
				markdownFile,
				{
					line: event.selections[0].active.line
				});
		}
	}));
}


function showPreview(cspArbiter: ExtensionContentSecurityPolicyArbiter, uri?: vscode.Uri, sideBySide: boolean = false) {
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
		`Preview '${path.basename(resource.fsPath)}'`,
		{
			allowScripts: true,
			allowSvgs: cspArbiter.shouldAllowSvgsForResource(resource)
		});

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
		if (editor.document.uri.scheme === docUri.scheme && editor.document.uri.fsPath === docUri.fsPath) {
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
