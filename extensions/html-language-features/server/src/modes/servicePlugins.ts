/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageServiceContext, LanguageServicePlugin, ProviderResult } from '@volar/language-service';
import * as ts from 'typescript';
import { create as createCssPlugin } from 'volar-service-css';
import { create as createHtmlPlugin } from 'volar-service-html';
import { create as createJsonPlugin } from 'volar-service-json';
import { create as createTypeScriptPlugins } from 'volar-service-typescript';
import { IHTMLDataProvider, TextDocument, TextEdit } from 'vscode-html-languageservice';
import type { Emitter } from 'vscode-jsonrpc';

export function getLanguageServicePlugins(options: {
	supportedLanguages: { [languageId: string]: boolean },
	getCustomData: (context: LanguageServiceContext) => ProviderResult<IHTMLDataProvider[]>,
	customDataEmitter?: Emitter<void>,
	formatterMaxNumberOfEdits?: number,
}) {
	const plugins: LanguageServicePlugin[] = [
		{
			capabilities: {},
			create() {
				return {
					resolveEmbeddedCodeFormattingOptions(_sourceScript, embeddedCode, options) {
						if (embeddedCode.id.startsWith('css_')) {
							options.initialIndentLevel++;
						}
						return options;
					},
				};
			},
		},
	];
	const baseHtmlPlugin = createHtmlPlugin({
		async isFormattingEnabled(_document, context) {
			return await context.env.getConfiguration?.('html.format.enable') ?? true;
		},
		getCustomData: options.getCustomData,
		onDidChangeCustomData: options.customDataEmitter
			? listener => options.customDataEmitter!.event(listener)
			: undefined,
	});
	plugins.push({
		...baseHtmlPlugin,
		create(context) {
			const base = baseHtmlPlugin.create(context);
			return {
				...base,
				async provideDocumentFormattingEdits(document, ...args) {
					const edits = await base.provideDocumentFormattingEdits?.(document, ...args);
					if (edits && options.formatterMaxNumberOfEdits !== undefined && edits.length > options.formatterMaxNumberOfEdits) {
						const newText = TextDocument.applyEdits(document, edits);
						return [TextEdit.replace({ start: document.positionAt(0), end: document.positionAt(document.getText().length) }, newText)];
					}
					return edits;
				},
			};
		},
	})
	if (options.supportedLanguages['css']) {
		plugins.push(
			createCssPlugin({
				async isFormattingEnabled(_document, context) {
					return await context.env.getConfiguration?.('html.format.enable') ?? true;
				},
				async getLanguageSettings(document, context) {
					return {
						...await context.env.getConfiguration?.(document.languageId),
						validate: await context.env.getConfiguration?.('html.validate.styles') ?? true,
					};
				},
			}),
		);
	}
	if (options.supportedLanguages['javascript']) {
		plugins.push(
			...createTypeScriptPlugins(ts, {
				async isFormattingEnabled(_document, context) {
					return await context.env.getConfiguration?.('html.format.enable') ?? true;
				},
				async isValidationEnabled(_document, context) {
					return await context.env.getConfiguration?.('html.validate.scripts') ?? true;
				},
			}),
		);
		plugins.push(
			createJsonPlugin({
				async isFormattingEnabled(_document, context) {
					return await context.env.getConfiguration?.('html.format.enable') ?? true;
				},
				async getLanguageSettings(context) {
					return {
						...await context.env.getConfiguration?.('json'),
						validate: await context.env.getConfiguration?.('html.validate.scripts') ?? true,
					};
				},
			}),
		);
	}
	return plugins;
}
