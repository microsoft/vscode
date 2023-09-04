/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getElementsForSourceLine } from './scroll-sync';

export class ActiveLineMarker {
	private _current: any;

	onDidChangeTextEditorSelection(line: number, documentVersion: number) {
		const { previous } = getElementsForSourceLine(line, documentVersion);
		this._update(previous && (previous.codeElement || previous.element));
	}

	_update(before: HTMLElement | undefined) {
		this._unmarkActiveElement(this._current);
		this._markActiveElement(before);
		this._current = before;
	}

	_unmarkActiveElement(element: HTMLElement | undefined) {
		if (!element) {
			return;
		}
		element.classList.toggle('code-active-line', false);
	}

	_markActiveElement(element: HTMLElement | undefined) {
		if (!element) {
			return;
		}

		element.classList.toggle('code-active-line', true);
	}
}
