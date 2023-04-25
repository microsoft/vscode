/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { handleANSIOutput } from './ansi';

export const scrollableClass = 'scrollable';

/**
 * Output is Truncated. View as a [scrollable element] or open in a [text editor]. Adjust cell output [settings...]
 */
function generateViewMoreElement(outputId: string) {

	const container = document.createElement('div');
	container.classList.add('truncation-message');
	const first = document.createElement('span');
	first.textContent = 'Output is truncated. View as a ';
	container.appendChild(first);

	const viewAsScrollableLink = document.createElement('a');
	viewAsScrollableLink.textContent = 'scrollable element';
	viewAsScrollableLink.href = `command:cellOutput.enableScrolling?${outputId}`;
	viewAsScrollableLink.ariaLabel = 'enable scrollable output';
	container.appendChild(viewAsScrollableLink);

	const second = document.createElement('span');
	second.textContent = ' or open in a ';
	container.appendChild(second);

	const openInTextEditorLink = document.createElement('a');
	openInTextEditorLink.textContent = 'text editor';
	openInTextEditorLink.href = `command:workbench.action.openLargeOutput?${outputId}`;
	openInTextEditorLink.ariaLabel = 'open output in text editor';
	container.appendChild(openInTextEditorLink);

	const third = document.createElement('span');
	third.textContent = '. Adjust cell output ';
	container.appendChild(third);

	const layoutSettingsLink = document.createElement('a');
	layoutSettingsLink.textContent = 'settings';
	layoutSettingsLink.href = `command:workbench.action.openSettings?%5B%22%40tag%3AnotebookOutputLayout%22%5D`;
	layoutSettingsLink.ariaLabel = 'notebook output settings';
	container.appendChild(layoutSettingsLink);

	const fourth = document.createElement('span');
	fourth.textContent = '...';
	container.appendChild(fourth);

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

	container.appendChild(handleANSIOutput(buffer.slice(0, linesLimit - 5).join('\n'), trustHtml));

	// truncated piece
	const elipses = document.createElement('div');
	elipses.innerText = '...';
	container.appendChild(elipses);

	container.appendChild(handleANSIOutput(buffer.slice(lineCount - 5).join('\n'), trustHtml));

	container.appendChild(generateViewMoreElement(id));

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
