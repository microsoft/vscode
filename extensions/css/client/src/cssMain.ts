/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import * as parse from 'parse-color';

import { languages, window, commands, workspace, ExtensionContext, DocumentColorProvider, Color, ColorFormat, CancellationToken, TextDocument, ColorInfo } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, RequestType, Range, TextEdit } from 'vscode-languageclient';
import { activateColorDecorations } from './colorDecorators';

import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();

namespace ColorSymbolRequest {
	export const type: RequestType<string, Range[], any, any> = new RequestType('css/colorSymbols');
}

const CSSColorFormats = {
	Hex: '#{red:X}{green:X}{blue:X}',
	RGB: {
		opaque: 'rgb({red}, {green}, {blue})',
		transparent: 'rgba({red}, {green}, {blue}, {alpha:2f[0-1]})'
	},
	HSL: {
		opaque: 'hsl({hue:d[0-360]}, {saturation:d[0-100]}%, {luminosity:d[0-100]}%)',
		transparent: 'hsla({hue:d[0-360]}, {saturation:d[0-100]}%, {luminosity:d[0-100]}%, {alpha:2f[0-1]})'
	}
};

function detectFormat(value: string): ColorFormat {
	if (/^rgb/i.test(value)) {
		return CSSColorFormats.RGB;
	} else if (/^hsl/i.test(value)) {
		return CSSColorFormats.HSL;
	} else {
		return CSSColorFormats.Hex;
	}
}

class ColorProvider implements DocumentColorProvider {

	constructor(private client: LanguageClient) { }

	async provideDocumentColors(document: TextDocument, token: CancellationToken): Promise<ColorInfo[]> {
		const ranges = await this.client.sendRequest(ColorSymbolRequest.type, document.uri.toString());

		return ranges.reduce((result, r) => {
			const range = this.client.protocol2CodeConverter.asRange(r);
			const value = document.getText(range);
			const parsedColor = parse(value);

			if (!parsedColor || !parsedColor.rgba) {
				return result;
			}

			const [red, green, blue, alpha] = parsedColor.rgba;
			const color = new Color(red, green, blue, alpha);
			const format = detectFormat(value);

			return [...result, new ColorInfo(range, color, format, [CSSColorFormats.Hex, CSSColorFormats.RGB, CSSColorFormats.HSL])];
		}, []);
	}
}

// this method is called when vs code is activated
export function activate(context: ExtensionContext) {

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('server', 'out', 'cssServerMain.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ['--nolazy', '--debug=6004'] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		documentSelector: ['css', 'scss', 'less'],
		synchronize: {
			configurationSection: ['css', 'scss', 'less']
		},
		initializationOptions: {
		}
	};

	// Create the language client and start the client.
	let client = new LanguageClient('css', localize('cssserver.name', 'CSS Language Server'), serverOptions, clientOptions);

	let disposable = client.start();
	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);

	client.onReady().then(_ => {
		let colorRequestor = (uri: string) => {
			return client.sendRequest(ColorSymbolRequest.type, uri).then(ranges => ranges.map(client.protocol2CodeConverter.asRange));
		};
		let isDecoratorEnabled = (languageId: string) => {
			return workspace.getConfiguration().get<boolean>(languageId + '.colorDecorators.enable');
		};

		const colorProvider = new ColorProvider(client);
		context.subscriptions.push(languages.registerColorProvider(['css', 'scss', 'less'], colorProvider));

		disposable = activateColorDecorations(colorRequestor, { css: true, scss: true, less: true }, isDecoratorEnabled);
		context.subscriptions.push(disposable);
	});

	let indentationRules = {
		increaseIndentPattern: /(^.*\{[^}]*$)/,
		decreaseIndentPattern: /^\s*\}/
	};

	languages.setLanguageConfiguration('css', {
		wordPattern: /(#?-?\d*\.\d\w*%?)|(::?[\w-]*(?=[^,{;]*[,{]))|(([@#.!])?[\w-?]+%?|[@#!.])/g,
		indentationRules: indentationRules
	});

	languages.setLanguageConfiguration('less', {
		wordPattern: /(#?-?\d*\.\d\w*%?)|(::?[\w-]+(?=[^,{;]*[,{]))|(([@#.!])?[\w-?]+%?|[@#!.])/g,
		indentationRules: indentationRules
	});

	languages.setLanguageConfiguration('scss', {
		wordPattern: /(#?-?\d*\.\d\w*%?)|(::?[\w-]*(?=[^,{;]*[,{]))|(([@$#.!])?[\w-?]+%?|[@#!$.])/g,
		indentationRules: indentationRules
	});

	commands.registerCommand('_css.applyCodeAction', applyCodeAction);

	function applyCodeAction(uri: string, documentVersion: number, edits: TextEdit[]) {
		let textEditor = window.activeTextEditor;
		if (textEditor && textEditor.document.uri.toString() === uri) {
			if (textEditor.document.version !== documentVersion) {
				window.showInformationMessage(`CSS fix is outdated and can't be applied to the document.`);
			}
			textEditor.edit(mutator => {
				for (let edit of edits) {
					mutator.replace(client.protocol2CodeConverter.asRange(edit.range), edit.newText);
				}
			}).then(success => {
				if (!success) {
					window.showErrorMessage('Failed to apply CSS fix to the document. Please consider opening an issue with steps to reproduce.');
				}
			});
		}
	}
}

