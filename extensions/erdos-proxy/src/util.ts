/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProxyServerHtml } from './types';

export class PromiseHandles<T> {
	resolve!: (value: T | Promise<T>) => void;

	reject!: (error: unknown) => void;

	promise: Promise<T>;

	constructor() {
		this.promise = new Promise((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}

export async function htmlContentRewriter(
	_serverOrigin: string,
	proxyPath: string,
	_url: string,
	contentType: string,
	responseBuffer: Buffer,
	htmlConfig?: ProxyServerHtml
) {
	if (!contentType.includes('text/html')) {
		return responseBuffer;
	}

	let response = responseBuffer.toString('utf8');

	if (vscode.env.uiKind === vscode.UIKind.Web && htmlConfig) {
		response = injectPreviewResources(response, htmlConfig);
	}

	response = rewriteUrlsWithProxyPath(response, proxyPath);

	return response;
}

export function injectPreviewResources(content: string, htmlConfig: ProxyServerHtml) {
	if (content.includes('<head>')) {
		content = content.replace(
			'<head>',
			`<head>\n
			${htmlConfig.styleDefaults || ''}`
		);

		content = content.replace(
			'</head>',
			`${htmlConfig.styleOverrides || ''}
			${htmlConfig.script || ''}
			</head>`
		);
	} else {
		content = `${htmlConfig.styleDefaults || ''}
			${htmlConfig.styleOverrides || ''}
			${htmlConfig.script || ''}
			${content}`;
	}
	return content;
}

export async function helpContentRewriter(
	_serverOrigin: string,
	proxyPath: string,
	_url: string,
	contentType: string,
	responseBuffer: Buffer,
	htmlConfig?: ProxyServerHtml
) {
	if (!contentType.includes('text/html')) {
		return responseBuffer;
	}

	let response = responseBuffer.toString('utf8');

	if (htmlConfig) {
		let helpVars = '';

		const {
			styleDefaults,
			styleOverrides,
			script: helpScript,
			styles: helpStyles
		} = htmlConfig;

		if (helpStyles) {
			helpVars += '<style id="help-vars">\n';
			helpVars += '    body {\n';
			for (const style in helpStyles) {
				helpVars += `        --${style}: ${helpStyles[style]};\n`;
			}
			helpVars += '    }\n';
			helpVars += '</style>\n';
		}

		response = response.replace(
			'<head>',
			`<head>\n
			${helpVars}\n
			${styleDefaults}`
		);

		response = response.replace(
			'</head>',
			`${styleOverrides}\n
			${helpScript}\n
			</head>`
		);
	}

	response = rewriteUrlsWithProxyPath(response, proxyPath);

	return response;
}

export function rewriteUrlsWithProxyPath(content: string, proxyPath: string): string {
	if (vscode.env.uiKind === vscode.UIKind.Web) {
		return content.replace(
			/(src|href)="\/([^"]+)"/g,
			(match, p1, p2, _offset, _string, _groups) => {
				const matchedPath = '/' + p2;

				if (matchedPath.startsWith(proxyPath)) {
					return match;
				}

				return `${p1}="${proxyPath}/${p2}"`;
			}
		);
	}

	return content;
}