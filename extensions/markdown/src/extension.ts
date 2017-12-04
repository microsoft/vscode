/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import TelemetryReporter from 'vscode-extension-telemetry';
import { MarkdownEngine } from './markdownEngine';
import LinkProvider from './documentLinkProvider';
import MDDocumentSymbolProvider from './documentSymbolProvider';
import { ExtensionContentSecurityPolicyArbiter, PreviewSecuritySelector } from './security';
import { MDDocumentContentProvider, getMarkdownUri, isMarkdownFile } from './previewContentProvider';
import { Logger } from './logger';
import { CommandManager } from './commandManager';
import * as commands from './commands';

interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

const resolveExtensionResources = (extension: vscode.Extension<any>, stylePath: string): vscode.Uri => {
	const resource = vscode.Uri.parse(stylePath);
	if (resource.scheme) {
		return resource;
	}
	return vscode.Uri.file(path.join(extension.extensionPath, stylePath));
};

export function activate(context: vscode.ExtensionContext) {
	const packageInfo = getPackageInfo();
	const telemetryReporter = packageInfo && new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);
	if (telemetryReporter) {
		context.subscriptions.push(telemetryReporter);
	}

	const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState);
	const engine = new MarkdownEngine();

	const logger = new Logger();

	const contentProvider = new MDDocumentContentProvider(engine, context, cspArbiter, logger);
	const contentProviderRegistration = vscode.workspace.registerTextDocumentContentProvider('markdown', contentProvider);
	const previewSecuritySelector = new PreviewSecuritySelector(cspArbiter, contentProvider);

	loadMarkdownExtensions(contentProvider, engine);

	const symbolsProvider = new MDDocumentSymbolProvider(engine);
	const symbolsProviderRegistration = vscode.languages.registerDocumentSymbolProvider({ language: 'markdown' }, symbolsProvider);
	context.subscriptions.push(contentProviderRegistration, symbolsProviderRegistration);


	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider('markdown', new LinkProvider()));

	const commandManager = new CommandManager();
	context.subscriptions.push(commandManager);
	commandManager.register(new commands.ShowPreviewCommand(cspArbiter, telemetryReporter));
	commandManager.register(new commands.ShowPreviewToSideCommand(cspArbiter, telemetryReporter));
	commandManager.register(new commands.ShowSourceCommand());
	commandManager.register(new commands.RefreshPreviewCommand(contentProvider));
	commandManager.register(new commands.RevealLineCommand(logger));
	commandManager.register(new commands.MoveCursorToPositionCommand());
	commandManager.register(new commands.ShowPreviewSecuritySelectorCommand(previewSecuritySelector));
	commandManager.register(new commands.OnPreviewStyleLoadErrorCommand());
	commandManager.register(new commands.DidClickCommand());
	commandManager.register(new commands.OpenDocumentLinkCommand(engine));

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

function loadMarkdownExtensions(
	contentProvider: MDDocumentContentProvider,
	engine: MarkdownEngine
) {
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
