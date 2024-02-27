import type { ServicePlugin } from '@volar/language-service';
import { create as createCssServicePlugin } from 'volar-service-css';
import { create as createHtmlServicePlugin } from 'volar-service-html';
import { create as createTypeScriptServicePlugin } from 'volar-service-typescript';
import * as ts from 'typescript';

export function getServicePlugins() {
	const html1ServicePlugins: ServicePlugin[] = [
		createCssServicePlugin(),
		createHtmlServicePlugin(),
		createTypeScriptServicePlugin(ts),
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
