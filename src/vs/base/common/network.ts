/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';

export namespace Schemas {

	/**
	 * A schema that is used for models that exist in memory
	 * only and that have no correspondence on a server or such.
	 */
	export const inMemory: string = 'inmemory';

	/**
	 * A schema that is used for setting files
	 */
	export const vscode: string = 'vscode';

	/**
	 * A schema that is used for internal private files
	 */
	export const internal: string = 'private';

	/**
	 * A walk-through document.
	 */
	export const walkThrough: string = 'walkThrough';

	/**
	 * An embedded code snippet.
	 */
	export const walkThroughSnippet: string = 'walkThroughSnippet';

	export const http: string = 'http';

	export const https: string = 'https';

	export const file: string = 'file';
}

export interface IXHROptions {
	type?: string;
	url?: string;
	user?: string;
	password?: string;
	responseType?: string;
	headers?: any;
	customRequestInitializer?: (req: any) => void;
	data?: any;
}

export function xhr(options: IXHROptions): TPromise<XMLHttpRequest> {
	let req: XMLHttpRequest = null;
	let canceled = false;

	return new TPromise<XMLHttpRequest>((c, e, p) => {
		req = new XMLHttpRequest();

		req.onreadystatechange = () => {
			if (canceled) {
				return;
			}

			if (req.readyState === 4) {
				// Handle 1223: http://bugs.jquery.com/ticket/1450
				if ((req.status >= 200 && req.status < 300) || req.status === 1223) {
					c(req);
				} else {
					e(req);
				}
				req.onreadystatechange = () => { };
			} else {
				p(req);
			}
		};

		req.open(
			options.type || 'GET',
			options.url,
			// Promise based XHR does not support sync.
			//
			true,
			options.user,
			options.password
		);
		req.responseType = options.responseType || '';

		Object.keys(options.headers || {}).forEach((k) => {
			req.setRequestHeader(k, options.headers[k]);
		});

		if (options.customRequestInitializer) {
			options.customRequestInitializer(req);
		}

		req.send(options.data);
	}, () => {
		canceled = true;
		req.abort();
	});
}
