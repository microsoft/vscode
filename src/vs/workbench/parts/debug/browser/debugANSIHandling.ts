/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LinkDetector } from 'vs/workbench/parts/debug/browser/linkDetector';

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