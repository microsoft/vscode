/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { HighlightedLabel, IHighlight } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';

/**
 * Truncates a description string to the first line.
 * The UI applies CSS text-overflow ellipsis for width overflow.
 */
export function truncateToFirstLine(text: string): string {
	const newlineIndex = text.search(/[\r\n]/);
	if (newlineIndex !== -1) {
		return text.substring(0, newlineIndex);
	}
	return text;
}

/**
 * Returns the secondary text shown for a customization item.
 */
export function getCustomizationSecondaryText(description: string | undefined, filename: string, promptType: PromptsType): string {
	return promptType === PromptsType.hook && description ? description : filename;
}

interface IPathLabelParts {
	readonly prefix: string;
	readonly suffix: string;
	readonly suffixOffset: number;
}

export function splitPathLabel(path: string): IPathLabelParts {
	const separatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
	if (separatorIndex === -1) {
		return { prefix: '', suffix: path, suffixOffset: 0 };
	}

	return {
		prefix: path.substring(0, separatorIndex),
		suffix: path.substring(separatorIndex),
		suffixOffset: separatorIndex,
	};
}

function getPartHighlights(highlights: readonly IHighlight[] | undefined, start: number, end: number): IHighlight[] | undefined {
	if (!highlights) {
		return undefined;
	}

	const result: IHighlight[] = [];
	for (const highlight of highlights) {
		const highlightStart = Math.max(start, highlight.start);
		const highlightEnd = Math.min(end, highlight.end);
		if (highlightEnd > highlightStart) {
			result.push({
				start: highlightStart - start,
				end: highlightEnd - start,
				extraClasses: highlight.extraClasses,
			});
		}
	}
	return result.length ? result : undefined;
}

export class MiddleEllipsisPathLabel extends Disposable {
	private readonly prefixElement: HTMLElement;
	private readonly suffixElement: HTMLElement;
	private readonly prefixLabel: HighlightedLabel;
	private readonly suffixLabel: HighlightedLabel;

	constructor(readonly element: HTMLElement) {
		super();
		element.classList.add('middle-ellipsis-path-label');
		this.prefixElement = DOM.append(element, DOM.$('span.middle-ellipsis-path-prefix'));
		this.suffixElement = DOM.append(element, DOM.$('span.middle-ellipsis-path-suffix'));
		this.prefixLabel = this._register(new HighlightedLabel(this.prefixElement));
		this.suffixLabel = this._register(new HighlightedLabel(this.suffixElement));
	}

	set(path: string, highlights?: readonly IHighlight[]): void {
		const parts = splitPathLabel(path);
		this.element.classList.toggle('single-segment', !parts.prefix);
		this.prefixElement.style.display = parts.prefix ? '' : 'none';
		this.prefixLabel.set(parts.prefix, getPartHighlights(highlights, 0, parts.suffixOffset));
		this.suffixLabel.set(parts.suffix, getPartHighlights(highlights, parts.suffixOffset, path.length));
	}
}
