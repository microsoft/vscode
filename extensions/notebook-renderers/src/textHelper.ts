/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { handleANSIOutput } from './ansi';

// const SIZE_LIMIT = 65535;

export function truncatedArrayOfString(outputs: string[], linesLimit: number, container: HTMLElement) {
	// const fullLen = outputs.reduce((p, c) => {
	// 	return p + c.length;
	// }, 0);

	let buffer = outputs.join('\n').split(/\r|\n|\r\n/g);
	let lineCount = buffer.length;

	if (lineCount < linesLimit) {
		const spanElement = handleANSIOutput(buffer.slice(0, linesLimit).join('\n'));
		container.appendChild(spanElement);
		return;
	}

	// container.appendChild(generateViewMoreElement(notebookUri, cellViewModel, outputId, disposables, openerService));

	const div = document.createElement('div');
	container.appendChild(div);
	div.appendChild(handleANSIOutput(buffer.slice(0, linesLimit - 5).join('\n')));

	// view more ...
	const viewMoreSpan = document.createElement('span');
	viewMoreSpan.innerText = '...';
	container.appendChild(viewMoreSpan);

	const div2 = document.createElement('div');
	container.appendChild(div2);
	div2.appendChild(handleANSIOutput(buffer.slice(linesLimit - 5).join('\n')));
}
