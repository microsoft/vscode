/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { handleANSIOutput } from './ansi';

export const scrollableClass = 'scrollable';

function generateViewMoreElement(outputId: string) {
	const container = document.createElement('span');
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

	return container;
}

function generateNestedViewAllElement(outputId: string) {
	const container = document.createElement('span');
	const prefix = document.createElement('span');
	prefix.innerText = '... (View full content in a ';
	container.append(prefix);

	const link = document.createElement('a');
	link.textContent = 'text editor';
	link.href = `command:workbench.action.openLargeOutput?${outputId}`;
	container.append(link);

	const postfix = document.createElement('span');
	prefix.innerText = ')\n';
	container.append(postfix);

	return container;
}

function truncatedArrayOfString(id: string, buffer: string[], linesLimit: number, container: HTMLElement, trustHtml: boolean) {
	const lineCount = buffer.length;
	container.appendChild(generateViewMoreElement(id));

	container.appendChild(handleANSIOutput(buffer.slice(0, linesLimit - 5).join('\n'), trustHtml));

	// view more ...
	const viewMoreSpan = document.createElement('span');
	viewMoreSpan.innerText = '...';
	container.appendChild(viewMoreSpan);

	container.appendChild(handleANSIOutput(buffer.slice(lineCount - 5).join('\n'), trustHtml));
}

function scrollableArrayOfString(id: string, buffer: string[], container: HTMLElement, trustHtml: boolean) {
	if (buffer.length > 5000) {
		container.parentNode!.append(generateNestedViewAllElement(id));
	}

	container.appendChild(handleANSIOutput(buffer.slice(-5000).join('\n'), trustHtml));
}

export function insertOutput(id: string, outputs: string[], linesLimit: number, scrollable: boolean, trustHtml: boolean) {
	const element = document.createElement('div');
	const buffer = outputs.join('\n').split(/\r\n|\r|\n/g);

	if (scrollable) {
		scrollableArrayOfString(id, buffer, element, trustHtml);
	}

	const lineCount = buffer.length;

	if (lineCount <= linesLimit) {
		const spanElement = handleANSIOutput(buffer.join('\n'), trustHtml);
		element.appendChild(spanElement);
	} else {
		truncatedArrayOfString(id, buffer, linesLimit, element, trustHtml);
	}

	return element;
}
