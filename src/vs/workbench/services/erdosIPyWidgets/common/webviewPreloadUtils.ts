/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageRuntimeMessageOutput } from '../../languageRuntime/common/languageRuntimeService.js';

const preloadRules = [
	{
		name: 'hvplot-preload',
		conditions: [
			(html: string) => html.includes('<script type="esms-options">'),
			(html: string) => html.includes('[data-root-id]'),
			(html: string) => html.includes('.cell-output-ipywidget-background'),
			(html: string) => !/<(img|svg|canvas)/i.test(html)
		]
	},
];

export function isWebviewPreloadMessage(htmlContent: string): boolean {
	for (const rule of preloadRules) {
		if (rule.conditions.every(condition => condition(htmlContent))) {
			return true;
		}
	}
	return false;
}

const MIME_TYPES = {
	HOLOVIEWS_LOAD: 'application/vnd.holoviews_load.v0+json',
	HOLOVIEWS_EXEC: 'application/vnd.holoviews_exec.v0+json',
	BOKEH_EXEC: 'application/vnd.bokehjs_exec.v0+json',
	BOKEH_LOAD: 'application/vnd.bokehjs_load.v0+json',
	ERDOS_WEBVIEW_FLAG: 'application/erdos-webview-load.v0+json',
	PLOTLY: 'application/vnd.plotly.v1+json',
	PLAIN: 'text/plain',
	HTML: 'text/html'
} as const;

const webviewReplayMimeTypes = new Set<string>([
	MIME_TYPES.HOLOVIEWS_LOAD,
	MIME_TYPES.HOLOVIEWS_EXEC,
	MIME_TYPES.BOKEH_EXEC,
	MIME_TYPES.BOKEH_LOAD,
	MIME_TYPES.ERDOS_WEBVIEW_FLAG
]);

export function isWebviewReplayMessage(mimeTypesOrMsg: ILanguageRuntimeMessageOutput | string[]): boolean {
	const mimeTypes = Array.isArray(mimeTypesOrMsg) ? mimeTypesOrMsg : Object.keys(mimeTypesOrMsg.data);
	return mimeTypes.some(key => webviewReplayMimeTypes.has(key));
}

function isHoloviewsDisplayBundle(mimeTypes: Set<string>): boolean {
	return mimeTypes.has(MIME_TYPES.HOLOVIEWS_EXEC) &&
		mimeTypes.has(MIME_TYPES.HTML) &&
		mimeTypes.has(MIME_TYPES.PLAIN);
}

export function isWebviewDisplayMessage(mimeTypesOrMsg: string[] | ILanguageRuntimeMessageOutput): boolean {
	const mimeTypeSet = new Set(Array.isArray(mimeTypesOrMsg) ? mimeTypesOrMsg : Object.keys(mimeTypesOrMsg.data));

	return isHoloviewsDisplayBundle(mimeTypeSet) ||
		mimeTypeSet.has(MIME_TYPES.BOKEH_EXEC) ||
		mimeTypeSet.has(MIME_TYPES.PLOTLY);
}

export function getWebviewMessageType(outputs: { mime: string }[]): 'display' | 'preload' | null {
	const mimeTypes = outputs.map(output => output.mime);
	if (isWebviewDisplayMessage(mimeTypes)) {
		return 'display';
	}
	if (isWebviewReplayMessage(mimeTypes)) {
		return 'preload';
	}

	return null;
}
