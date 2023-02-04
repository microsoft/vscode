/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { handleANSIOutput } from './ansi';

function generateViewMoreElement(outputId: string, adjustableSize: boolean) {
	const container = document.createElement('span');
	const first = document.createElement('span');

	if (adjustableSize) {
		first.textContent = 'Output exceeds the ';
		const second = document.createElement('a');
		second.textContent = 'size limit';
		second.href = `command:workbench.action.openSettings?%5B%22notebook.output.textLineLimit%22%5D`;
		container.appendChild(first);
		container.appendChild(second);
	} else {
		first.textContent = 'Output exceeds the maximium size limit';
		container.appendChild(first);
	}

	const third = document.createElement('span');
	third.textContent = '. Open the full output data ';
	const forth = document.createElement('a');
	forth.textContent = 'in a text editor';
	forth.href = `command:workbench.action.openLargeOutput?${outputId}`;
	container.appendChild(third);
	container.appendChild(forth);
	return container;
}

function truncatedArrayOfString(id: string, buffer: string[], linesLimit: number, container: HTMLElement, trustHtml: boolean) {
	const lineCount = buffer.length;
	container.appendChild(generateViewMoreElement(id, true));

	const div = document.createElement('div');
	container.appendChild(div);
	div.appendChild(handleANSIOutput(buffer.slice(0, linesLimit - 5).join('\n'), trustHtml));

	// view more ...
	const viewMoreSpan = document.createElement('span');
	viewMoreSpan.innerText = '...';
	container.appendChild(viewMoreSpan);

	const div2 = document.createElement('div');
	container.appendChild(div2);
	div2.appendChild(handleANSIOutput(buffer.slice(lineCount - 5).join('\n'), trustHtml));
}

function scrollableArrayOfString(id: string, buffer: string[], container: HTMLElement, trustHtml: boolean) {
	container.classList.add('scrollable');

	if (buffer.length > 5000) {
		container.appendChild(generateViewMoreElement(id, false));
	}
	const div = document.createElement('div');
	container.appendChild(div);
	div.appendChild(handleANSIOutput(buffer.slice(0, 5000).join('\n'), trustHtml));
}

export function insertOutput(id: string, outputs: string[], linesLimit: number, scrollable: boolean, container: HTMLElement, trustHtml: boolean) {
	const buffer = outputs.join('\n').split(/\r\n|\r|\n/g);
	const lineCount = buffer.length;

	if (lineCount < linesLimit) {
		const spanElement = handleANSIOutput(buffer.join('\n'), trustHtml);
		container.appendChild(spanElement);
		return;
	}

	if (scrollable) {
		scrollableArrayOfString(id, buffer, container, trustHtml);
	} else {
		truncatedArrayOfString(id, buffer, linesLimit, container, trustHtml);
	}
}
