/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { handleANSIOutput } from './ansi';

export const scrollableClass = 'scrollable';

function generateViewMoreElement(outputId: string) {
	const container = document.createElement('div');
	const first = document.createElement('span');
	first.textContent = 'Output exceeds the ';

	const second = document.createElement('a');
	second.textContent = 'size limit';
	second.href = `command:workbench.action.openSettings?%5B%22notebook.output.textLineLimit%22%5D`;
	container.appendChild(first);
	container.appendChild(second);

	const third = document.createElement('span');
	third.textContent = '. Open the full output data ';

	const forth = document.createElement('a');
	forth.textContent = 'in a text editor';
	forth.href = `command:workbench.action.openLargeOutput?${outputId}`;
	container.appendChild(third);
	container.appendChild(forth);

	const refreshSpan = document.createElement('span');
	refreshSpan.classList.add('scroll-refresh');
	const fifth = document.createElement('span');
	fifth.textContent = '. Refresh to view ';

	const sixth = document.createElement('a');
	sixth.textContent = 'scrollable element';
	sixth.href = `command:cellOutput.enableScrolling?${outputId}`;
	refreshSpan.appendChild(fifth);
	refreshSpan.appendChild(sixth);
	container.appendChild(refreshSpan);

	return container;
}

function generateNestedViewAllElement(outputId: string) {
	const container = document.createElement('div');

	const link = document.createElement('a');
	link.textContent = '...';
	link.href = `command:workbench.action.openLargeOutput?${outputId}`;
	link.ariaLabel = 'Open full output in text editor';
	link.title = 'Open full output in text editor';
	link.style.setProperty('text-decoration', 'none');
	container.appendChild(link);

	return container;
}

function truncatedArrayOfString(id: string, buffer: string[], linesLimit: number, trustHtml: boolean) {
	const container = document.createElement('div');
	const lineCount = buffer.length;

	if (lineCount <= linesLimit) {
		const spanElement = handleANSIOutput(buffer.join('\n'), trustHtml);
		container.appendChild(spanElement);
		return container;
	}

	container.appendChild(generateViewMoreElement(id));
	container.appendChild(handleANSIOutput(buffer.slice(0, linesLimit - 5).join('\n'), trustHtml));

	// truncated piece
	const elipses = document.createElement('div');
	elipses.innerText = '...';
	container.appendChild(elipses);

	container.appendChild(handleANSIOutput(buffer.slice(lineCount - 5).join('\n'), trustHtml));

	return container;
}

function scrollableArrayOfString(id: string, buffer: string[], trustHtml: boolean) {
	const element = document.createElement('div');
	if (buffer.length > 5000) {
		element.appendChild(generateNestedViewAllElement(id));
	}

	element.appendChild(handleANSIOutput(buffer.slice(-5000).join('\n'), trustHtml));

	return element;
}

export function createOutputContent(id: string, outputs: string[], linesLimit: number, scrollable: boolean, trustHtml: boolean): HTMLElement {

	const buffer = outputs.join('\n').split(/\r\n|\r|\n/g);

	if (scrollable) {
		return scrollableArrayOfString(id, buffer, trustHtml);
	} else {
		return truncatedArrayOfString(id, buffer, linesLimit, trustHtml);
	}
}
