/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import { languages, ExtensionContext, IndentAction, Position, TextDocument, Range, CompletionItem, CompletionItemKind, SnippetString, workspace } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, RequestType, TextDocumentPositionParams } from 'vscode-languageclient';
import { EMPTY_ELEMENTS } from './htmlEmptyTagsShared';
import { activateTagClosing } from './tagClosing';
import TelemetryReporter from 'vscode-extension-telemetry';

namespace TagCloseRequest {
	export const type: RequestType<TextDocumentPositionParams, string, any, any> = new RequestType('html/tag');
}

interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

let telemetryReporter: TelemetryReporter | null;


export function activate(context: ExtensionContext) {
	let toDispose = context.subscriptions;

	let packageInfo = getPackageInfo(context);
	telemetryReporter = packageInfo && new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);

	let serverMain = readJSONFile(context.asAbsolutePath('./server/package.json')).main;
	let serverModule = context.asAbsolutePath(path.join('server', serverMain));

	// The debug options for the server
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6045'] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	let documentSelector = ['html', 'handlebars', 'razor'];
	let embeddedLanguages = { css: true, javascript: true };

	let tagPaths: string[] = workspace.getConfiguration('html').get('experimental.custom.tags', []);
	let attributePaths: string[] = workspace.getConfiguration('html').get('experimental.custom.attributes', []);

	if (tagPaths && tagPaths.length > 0) {
		if (!workspace.workspaceFolders) {
			tagPaths = [];
		} else {
			try {
				const workspaceRoot = workspace.workspaceFolders[0].uri.fsPath;
				tagPaths = tagPaths.map(d => {
					return path.resolve(workspaceRoot, d);
				});
			} catch (err) {
				tagPaths = [];
			}
		}
	}

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		documentSelector,
		synchronize: {
			configurationSection: ['html', 'css', 'javascript'], // the settings to synchronize
		},
		initializationOptions: {
			embeddedLanguages,
			tagPaths,
			attributePaths
		}
	};

	// Create the language client and start the client.
	let client = new LanguageClient('html', localize('htmlserver.name', 'HTML Language Server'), serverOptions, clientOptions);
	client.registerProposedFeatures();

	let disposable = client.start();
	toDispose.push(disposable);
	client.onReady().then(() => {
		let tagRequestor = (document: TextDocument, position: Position) => {
			let param = client.code2ProtocolConverter.asTextDocumentPositionParams(document, position);
			return client.sendRequest(TagCloseRequest.type, param);
		};
		disposable = activateTagClosing(tagRequestor, { html: true, handlebars: true, razor: true }, 'html.autoClosingTags');
		toDispose.push(disposable);

		disposable = client.onTelemetry(e => {
			if (telemetryReporter) {
				telemetryReporter.sendTelemetryEvent(e.key, e.data);
			}
		});
		toDispose.push(disposable);
	});

	languages.setLanguageConfiguration('html', {
		indentationRules: {
			increaseIndentPattern: /<(?!\?|(?:area|base|br|col|frame|hr|html|img|input|link|meta|param)\b|[^>]*\/>)([-_\.A-Za-z0-9]+)(?=\s|>)\b[^>]*>(?!.*<\/\1>)|<!--(?!.*-->)|\{[^}"']*$/,
			decreaseIndentPattern: /^\s*(<\/(?!html)[-_\.A-Za-z0-9]+\b[^>]*>|-->|\})/
		},
		wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g,
		onEnterRules: [
			{
				beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))([_:\\w][_:\\w-.\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
				afterText: /^<\/([_:\w][_:\w-.\d]*)\s*>/i,
				action: { indentAction: IndentAction.IndentOutdent }
			},
			{
				beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
				action: { indentAction: IndentAction.Indent }
			}
		],
	});

	languages.setLanguageConfiguration('handlebars', {
		wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g,
		onEnterRules: [
			{
				beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))([_:\\w][_:\\w-.\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
				afterText: /^<\/([_:\w][_:\w-.\d]*)\s*>/i,
				action: { indentAction: IndentAction.IndentOutdent }
			},
			{
				beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
				action: { indentAction: IndentAction.Indent }
			}
		],
	});

	languages.setLanguageConfiguration('razor', {
		wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g,
		onEnterRules: [
			{
				beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))([_:\\w][_:\\w-.\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
				afterText: /^<\/([_:\w][_:\w-.\d]*)\s*>/i,
				action: { indentAction: IndentAction.IndentOutdent }
			},
			{
				beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
				action: { indentAction: IndentAction.Indent }
			}
		],
	});

	const regionCompletionRegExpr = /^(\s*)(<(!(-(-\s*(#\w*)?)?)?)?)?$/;
	languages.registerCompletionItemProvider(documentSelector, {
		provideCompletionItems(doc, pos) {
			let lineUntilPos = doc.getText(new Range(new Position(pos.line, 0), pos));
			let match = lineUntilPos.match(regionCompletionRegExpr);
			if (match) {
				let range = new Range(new Position(pos.line, match[1].length), pos);
				let beginProposal = new CompletionItem('#region', CompletionItemKind.Snippet);
				beginProposal.range = range;
				beginProposal.insertText = new SnippetString('<!-- #region $1-->');
				beginProposal.documentation = localize('folding.start', 'Folding Region Start');
				beginProposal.filterText = match[2];
				beginProposal.sortText = 'za';
				let endProposal = new CompletionItem('#endregion', CompletionItemKind.Snippet);
				endProposal.range = range;
				endProposal.insertText = new SnippetString('<!-- #endregion -->');
				endProposal.documentation = localize('folding.end', 'Folding Region End');
				endProposal.filterText = match[2];
				endProposal.sortText = 'zb';
				return [beginProposal, endProposal];
			}
			return null;
		}
	});
}

function getPackageInfo(context: ExtensionContext): IPackageInfo | null {
	let extensionPackage = readJSONFile(context.asAbsolutePath('./package.json'));
	if (extensionPackage) {
		return {
			name: extensionPackage.name,
			version: extensionPackage.version,
			aiKey: extensionPackage.aiKey
		};
	}
	return null;
}


function readJSONFile(location: string) {
	try {
		return JSON.parse(fs.readFileSync(location).toString());
	} catch (e) {
		console.log(`Problems reading ${location}: ${e}`);
		return {};
	}
}

export function deactivate(): Promise<any> {
	return telemetryReporter ? telemetryReporter.dispose() : Promise.resolve(null);
}