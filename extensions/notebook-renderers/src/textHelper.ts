/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { handleANSIOutput } from './ansi';
import { LinkOptions } from './linkify';
import { OutputElementOptions, OutputWithAppend } from './rendererTypes';
export const scrollableClass = 'scrollable';

const softScrollableLineLimit = 5000;
const hardScrollableLineLimit = 8000;

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

function truncatedArrayOfString(id: string, buffer: string[], linesLimit: number, linkOptions: LinkOptions) {
	const container = document.createElement('div');
	container.setAttribute('data-vscode-context', JSON.stringify({
		webviewSection: 'text',
		outputId: id,
		'preventDefaultContextMenuItems': true
	}));
	const lineCount = buffer.length;

	if (lineCount <= linesLimit) {
		const spanElement = handleANSIOutput(buffer.join('\n'), linkOptions);
		container.appendChild(spanElement);
		return container;
	}

	container.appendChild(handleANSIOutput(buffer.slice(0, linesLimit - 5).join('\n'), linkOptions));

	// truncated piece
	const elipses = document.createElement('div');
	elipses.innerText = '...';
	container.appendChild(elipses);

	container.appendChild(handleANSIOutput(buffer.slice(lineCount - 5).join('\n'), linkOptions));

	container.appendChild(generateViewMoreElement(id));

	return container;
}

function scrollableArrayOfString(id: string, buffer: string[], linkOptions: LinkOptions) {
	const element = document.createElement('div');
	element.setAttribute('data-vscode-context', JSON.stringify({
		webviewSection: 'text',
		outputId: id,
		'preventDefaultContextMenuItems': true
	}));
	if (buffer.length > softScrollableLineLimit) {
		element.appendChild(generateNestedViewAllElement(id));
	}

	element.appendChild(handleANSIOutput(buffer.slice(-1 * softScrollableLineLimit).join('\n'), linkOptions));

	return element;
}

const outputLengths: Record<string, number> = {};

function appendScrollableOutput(element: HTMLElement, id: string, appended: string, linkOptions: LinkOptions) {
	if (!outputLengths[id]) {
		outputLengths[id] = 0;
	}

	const buffer = appended.split(/\r\n|\r|\n/g);
	const appendedLength = buffer.length + outputLengths[id];
	// Only append outputs up to the hard limit of lines, then replace it with the last softLimit number of lines
	if (appendedLength > hardScrollableLineLimit) {
		return false;
	}
	else {
		element.appendChild(handleANSIOutput(buffer.join('\n'), linkOptions));
		outputLengths[id] = appendedLength;
	}
	return true;
}

export function createOutputContent(id: string, outputText: string, options: OutputElementOptions): HTMLElement {
	const { linesLimit, error, scrollable, trustHtml, linkifyFilePaths } = options;
	const linkOptions: LinkOptions = { linkifyFilePaths, trustHtml };
	const buffer = outputText.split(/\r\n|\r|\n/g);
	outputLengths[id] = outputLengths[id] = Math.min(buffer.length, softScrollableLineLimit);

	let outputElement: HTMLElement;
	if (scrollable) {
		outputElement = scrollableArrayOfString(id, buffer, linkOptions);
	} else {
		outputElement = truncatedArrayOfString(id, buffer, linesLimit, linkOptions);
	}

	outputElement.setAttribute('output-item-id', id);
	if (error) {
		outputElement.classList.add('error');
	}

	return outputElement;
}

export function appendOutput(outputInfo: OutputWithAppend, existingContent: HTMLElement, options: OutputElementOptions) {
	const appendedText = outputInfo.appendedText?.();
	const linkOptions = { linkifyFilePaths: options.linkifyFilePaths, trustHtml: options.trustHtml };
	// appending output only supported for scrollable ouputs currently
	if (appendedText && options.scrollable) {
		if (appendScrollableOutput(existingContent, outputInfo.id, appendedText, linkOptions)) {
			return;
		}
	}

	const newContent = createOutputContent(outputInfo.id, outputInfo.text(), options);
	existingContent.replaceWith(newContent);
	while (newContent.nextSibling) {
		// clear out any stale content if we had previously combined streaming outputs into this one
		newContent.nextSibling.remove();
	}

}

