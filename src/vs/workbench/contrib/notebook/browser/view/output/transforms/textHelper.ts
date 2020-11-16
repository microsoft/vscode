/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { splitLines } from 'vs/base/common/strings';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

const SIZE_LIMIT = 65535;
const LINES_LIMIT = 500;

function generateViewMoreElement(outputs: string[], openerService: IOpenerService, textFileService: ITextFileService) {
	const md: IMarkdownString = {
		value: '[show more ...](command:workbench.action.openLargeOutput)',
		isTrusted: true,
		supportThemeIcons: true
	};

	const element = renderMarkdown(md, {
		actionHandler: {
			callback: (content) => {
				if (content === 'command:workbench.action.openLargeOutput') {
					return textFileService.untitled.resolve({
						associatedResource: undefined,
						mode: 'plaintext',
						initialValue: outputs.join('')
					}).then(model => {
						const resource = model.resource;
						openerService.open(resource);
					});
				}

				return;
			},
			disposeables: new DisposableStore()
		}
	});

	element.classList.add('output-show-more');
	return element;
}

export function truncatedArrayOfString(container: HTMLElement, outputs: string[], openerService: IOpenerService, textFileService: ITextFileService) {
	const fullLen = outputs.reduce((p, c) => {
		return p + c.length;
	}, 0);

	if (fullLen > SIZE_LIMIT) {
		// it's too large
		const pre = DOM.$('div');
		pre.innerText = outputs.join('').slice(0, SIZE_LIMIT);
		container.appendChild(pre);

		// view more ...
		container.appendChild(generateViewMoreElement(outputs, openerService, textFileService));
		return;
	}

	const fullLines = splitLines(outputs.join(''));
	if (fullLines.length < LINES_LIMIT) {
		container.innerText = fullLines.join('\n');
		return;
	}

	const pre = DOM.$('div');
	pre.innerText = fullLines.slice(0, LINES_LIMIT - 5).join('\n');
	container.appendChild(pre);

	// view more ...
	container.appendChild(generateViewMoreElement(outputs, openerService, textFileService));

	const post = DOM.$('div');
	post.innerText = fullLines.slice(fullLines.length - 5).join('\n');
	container.appendChild(post);
}
