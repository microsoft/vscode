/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';

import { languages, ExtensionContext, IndentAction, Position, TextDocument, Color, ColorInformation, ColorPresentation } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, RequestType, TextDocumentPositionParams } from 'vscode-languageclient';
import { EMPTY_ELEMENTS } from './htmlEmptyTagsShared';
import { activateTagClosing } from './tagClosing';
import TelemetryReporter from 'vscode-extension-telemetry';

import { ConfigurationFeature } from 'vscode-languageclient/lib/configuration.proposed';
import { DocumentColorRequest, DocumentColorParams, ColorPresentationRequest, ColorPresentationParams } from 'vscode-languageserver-protocol/lib/protocol.colorProvider.proposed';

import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();

namespace TagCloseRequest {
	export const type: RequestType<TextDocumentPositionParams, string, any, any> = new RequestType('html/tag');
}

interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

export function activate(context: ExtensionContext) {
	let toDispose = context.subscriptions;

	let packageInfo = getPackageInfo(context);
	let telemetryReporter: TelemetryReporter = packageInfo && new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);
	if (telemetryReporter) {
		toDispose.push(telemetryReporter);
	}

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('server', 'out', 'htmlServerMain.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6004'] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	let documentSelector = ['html', 'handlebars', 'razor'];
	let embeddedLanguages = { css: true, javascript: true };

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		documentSelector,
		synchronize: {
			configurationSection: ['html', 'css', 'javascript'], // the settings to synchronize
		},
		initializationOptions: {
			embeddedLanguages
		}
	};

	// Create the language client and start the client.
	let client = new LanguageClient('html', localize('htmlserver.name', 'HTML Language Server'), serverOptions, clientOptions);
	client.registerFeature(new ConfigurationFeature(client));

	let disposable = client.start();
	toDispose.push(disposable);
	client.onReady().then(() => {
		disposable = languages.registerColorProvider(documentSelector, {
			provideDocumentColors(document: TextDocument): Thenable<ColorInformation[]> {
				let params: DocumentColorParams = {
					textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document)
				};
				return client.sendRequest(DocumentColorRequest.type, params).then(symbols => {
					return symbols.map(symbol => {
						let range = client.protocol2CodeConverter.asRange(symbol.range);
						let color = new Color(symbol.color.red, symbol.color.green, symbol.color.blue, symbol.color.alpha);
						return new ColorInformation(range, color);
					});
				});
			},
			provideColorPresentations(document: TextDocument, colorInfo: ColorInformation): Thenable<ColorPresentation[]> {
				let params: ColorPresentationParams = {
					textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document),
					colorInfo: { range: client.code2ProtocolConverter.asRange(colorInfo.range), color: colorInfo.color }
				};
				return client.sendRequest(ColorPresentationRequest.type, params).then(presentations => {
					return presentations.map(p => {
						let presentation = new ColorPresentation(p.label);
						presentation.textEdit = p.textEdit && client.protocol2CodeConverter.asTextEdit(p.textEdit);
						presentation.additionalTextEdits = p.additionalTextEdits && client.protocol2CodeConverter.asTextEdits(p.additionalTextEdits);
						return presentation;
					});
				});
			}
		});
		toDispose.push(disposable);

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
				afterText: /^<\/([_:\w][_:\w-.\d]*)\s*>$/i,
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
				afterText: /^<\/([_:\w][_:\w-.\d]*)\s*>$/i,
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
				afterText: /^<\/([_:\w][_:\w-.\d]*)\s*>$/i,
				action: { indentAction: IndentAction.IndentOutdent }
			},
			{
				beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
				action: { indentAction: IndentAction.Indent }
			}
		],
	});
}

function getPackageInfo(context: ExtensionContext): IPackageInfo {
	let extensionPackage = require(context.asAbsolutePath('./package.json'));
	if (extensionPackage) {
		return {
			name: extensionPackage.name,
			version: extensionPackage.version,
			aiKey: extensionPackage.aiKey
		};
	}
	return null;
}