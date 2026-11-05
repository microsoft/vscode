/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Preserves element order while sharing a forward scan across nondecreasing source line queries.
 */
export class SourceLineMap<T extends { readonly line: number }> {
	#previousLine = -Infinity;
	#index = 0;

	constructor(
		readonly elements: readonly [T, ...T[]],
	) { }

	getElementsForSourceLine(targetLine: number): { previous: T; next?: T } {
		const lineNumber = Math.floor(targetLine);
		if (!(lineNumber >= this.#previousLine)) {
			this.#index = 0;
		}
		this.#previousLine = lineNumber;

		let previous = this.elements[Math.max(0, this.#index - 1)];
		for (; this.#index < this.elements.length; ++this.#index) {
			const entry = this.elements[this.#index];
			if (entry.line === lineNumber) {
				return { previous: entry, next: undefined };
			} else if (entry.line > lineNumber) {
				return { previous, next: entry };
			}
			previous = entry;
		}
		return { previous };
	}
}

interface SourceLineElement {
	getAttribute(name: string): string | null;
	setAttribute(name: string, value: string): void;
	querySelectorAll(selector: string): ArrayLike<SourceLineElement>;
}

export function updateSourceLineAttributes(from: SourceLineElement, to: SourceLineElement): void {
	const update = (from: SourceLineElement, to: SourceLineElement) => {
		const line = to.getAttribute('data-line');
		if (line !== null && from.getAttribute('data-line') !== line) {
			from.setAttribute('data-line', line);
		}
	};
	update(from, to);
	const fromLines = from.querySelectorAll('[data-line]');
	const toLines = to.querySelectorAll('[data-line]');
	if (fromLines.length !== toLines.length) {
		console.log('unexpected line number change');
	}
	for (let i = 0; i < fromLines.length; ++i) {
		if (toLines[i]) {
			update(fromLines[i], toLines[i]);
		}
	}
}
