/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LinkDetector } from 'vs/workbench/parts/debug/browser/linkDetector';

/**
 * @param text The content to stylize.
 * @returns An {@link HTMLSpanElement} that contains the potentially stylized text.
 */
export function handleANSIOutput(text: string, linkDetector: LinkDetector): HTMLSpanElement {

	const root: HTMLSpanElement = document.createElement('span');
	const textLength: number = text.length;

	let styleNames: string[] = [];
	let currentPos: number = 0;
	let buffer: string = '';

	while (currentPos < textLength) {

		// Potentially an ANSI escape sequence.
		// See http://ascii-table.com/ansi-escape-sequences.php & https://en.wikipedia.org/wiki/ANSI_escape_code
		if (text.charCodeAt(currentPos) === 27 && text.charAt(currentPos + 1) === '[') {

			const startPos: number = currentPos;
			currentPos += 2; // Ignore 'Esc[' as it's in every sequence.

			let ansiSequence: string = '';
			let sequenceFound: boolean = false;

			while (currentPos < textLength) {
				const char: string = text.charAt(currentPos);
				ansiSequence += char;

				currentPos++;

				// Look for a known sequence terminating character.
				if (char.match(/^[ABCDHIJKfhmpsu]$/)) {
					sequenceFound = true;
					break;
				}

			}

			if (sequenceFound) {

				// Flush buffer with previous styles.
				appendStylizedStringToContainer(root, buffer, styleNames, linkDetector);

				buffer = '';

				/*
					* Certain ranges that are matched here do not contain real graphics rendition sequences. For
					* the sake of having a simpler expression, they have been included anyway.
					*/
				if (ansiSequence.match(/^(?:[39][0-7]|[0-8]|39)(?:;(?:[39][0-7]|[0-8]|39))*;?m$/)) {

					const styleCodes: number[] = ansiSequence.slice(0, -1)	// Remove final 'm' character.
						.split(';')											// Separate style codes.
						.filter(elem => elem !== '')						// Filter empty elems as '34;m' -> ['34', ''].
						.map(elem => parseInt(elem, 10));					// Convert to numbers.

					for (let code of styleCodes) {
						if (code === 0) {
							styleNames = [];
						} else if (code === 1) {
							styleNames.push('code-bold');
						} else if (code === 4) {
							styleNames.push('code-underline');
						} else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
							styleNames.push('code-foreground-' + code);
						} else if (code === 39) {
							// Remove all foreground colour codes
							styleNames = styleNames.filter(style => !style.match(/^code-foreground-\d+$/));
						}
					}

				} else {
					// Unsupported sequence so simply hide it.
				}

			}

			if (sequenceFound === false) {
				/*
					* Reached end of text without ending the escape sequence,
					* or given sequence is currently unsupported. In either
					* case, treat sequence as regular text.
					*/
				currentPos = startPos + 1;
			}

		} else {
			buffer += text.charAt(currentPos);
			currentPos++;
		}

	}

	// Flush remaining text buffer if not empty.
	if (buffer) {
		appendStylizedStringToContainer(root, buffer, styleNames, linkDetector);
	}

	return root;

}

/**
 * @param root The {@link HTMLElement} to append the content to.
 * @param stringContent The text content to be appended.
 * @param cssClasses The list of CSS styles to apply to the text content.
 * @param linkDetector The {@link LinkDetector} responsible for generating links from {@param stringContent}.
 */
export function appendStylizedStringToContainer(root: HTMLElement, stringContent: string, cssClasses: string[], linkDetector: LinkDetector): void {
	if (!root || !stringContent) {
		return;
	}

	const content = linkDetector.handleLinks(stringContent);
	let container: HTMLElement;

	if (typeof content === 'string') {
		container = document.createElement('span');
		container.textContent = content;
	} else {
		container = content;
	}

	container.className = cssClasses.join(' ');
	root.appendChild(container);
}