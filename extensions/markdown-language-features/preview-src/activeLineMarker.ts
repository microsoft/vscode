/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getElementsForSourceLine } from './scroll-sync';

export class ActiveLineMarker {
	#current: HTMLElement | undefined;

	onDidChangeTextEditorSelection(line: number, documentVersion: number) {
		const { previous } = getElementsForSourceLine(line, documentVersion);
		this.#update(previous && (previous.codeElement || previous.element));
	}

	#update(before: HTMLElement | undefined) {
		this.#unmarkActiveElement(this.#current);
		this.#markActiveElement(before);
		this.#current = before;
	}

	#unmarkActiveElement(element: HTMLElement | undefined) {
		if (!element) {
			return;
		}
		element.classList.toggle('code-active-line', false);
	}

	#markActiveElement(element: HTMLElement | undefined) {
		if (!element) {
			return;
		}

		element.classList.toggle('code-active-line', true);
	}
}
