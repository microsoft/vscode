/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageServicePlugin } from '@volar/language-service';
import { create as createCssServicePlugin } from 'volar-service-css';
import { create as createHtmlServicePlugin } from 'volar-service-html';
import { create as createTypeScriptServicePlugins } from 'volar-service-typescript';
import * as ts from 'typescript';

export function getLanguageServicePlugins() {
	const html1ServicePlugins: LanguageServicePlugin[] = [
		createCssServicePlugin({
			async isFormattingEnabled(_document, context) {
				return await context.env.getConfiguration?.('html.format.enable') ?? true;
			},
		}),
		createHtmlServicePlugin({
			documentSelector: ['html', 'handlebars'],
			async isFormattingEnabled(_document, context) {
				return await context.env.getConfiguration?.('html.format.enable') ?? true;
			},
		}),
		...createTypeScriptServicePlugins(ts, {
			async isFormattingEnabled(_document, context) {
				return await context.env.getConfiguration?.('html.format.enable') ?? true;
			},
		}),
		{
			capabilities: {
				semanticTokensProvider: {
					legend: {
						tokenTypes: [],
						// fill missing modifiers from standard modifiers
						tokenModifiers: ['local'],
					},
				},
			},
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
	return html1ServicePlugins;
}
