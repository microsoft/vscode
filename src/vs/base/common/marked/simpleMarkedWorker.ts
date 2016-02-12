/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {WorkerServer} from 'vs/base/common/worker/workerServer';
import {marked} from 'vs/base/common/marked/marked';


function link(href, title, text): string {
	return `<a href="#" data-href="${href}" title="${title || text}">${text}</a>`;
}


export const value = {

	markdownToHtml(main: WorkerServer, resolve: Function, reject: Function, progress: Function, data: { source: string; highlight: boolean; }): void {

		// function highlight(code: string, lang: string, callback?: (error: Error, result: string) => void) {
		// 	main.request('highlight', { code, lang }).then(value => callback(void 0, value), err => callback(err, void 0));
		// }

		const renderer = new marked.Renderer();
		renderer.link = link;

		marked(data.source, {
			gfm: true,
			sanitize: true,
			renderer,
			// highlight
		}, function(err, html) {
			if (err) {
				reject(err);
			} else {
				resolve(html);
			}
		});
	}
};
