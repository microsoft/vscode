/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ServicePlugin } from '@volar/language-service';
import { create as createCssServicePlugin } from 'volar-service-css';
import { create as createHtmlServicePlugin } from 'volar-service-html';
import { create as createTypeScriptServicePlugin } from 'volar-service-typescript';
import * as ts from 'typescript';

export function getServicePlugins() {
	const html1ServicePlugins: ServicePlugin[] = [
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
		createTypeScriptServicePlugin(ts, {
			async isFormattingEnabled(_document, context) {
				return await context.env.getConfiguration?.('html.format.enable') ?? true;
			},
		}),
		{
			create() {
				return {
					resolveEmbeddedCodeFormattingOptions(code, options) {
						if (code.id.startsWith('css_')) {
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
