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

/**
 * Extracts an extension ID from a file path if the path is inside either
 * an extension install directory (e.g. `~/.vscode/extensions/<id>-<version>/...`)
 * or an extension's globalStorage directory
 * (e.g. `~/<userdata>/User/globalStorage/<id>/...`). The latter is used by
 * extensions like Copilot Chat that materialize prompt files under their
 * own globalStorage and register them via the prompt-file provider API.
 *
 * Returns the extension ID (e.g. `github.copilot-chat`) or `undefined`
 * if the path is not inside an extension directory.
 */
export function extractExtensionIdFromPath(uriPath: string): string | undefined {
	const segments = uriPath.split('/');

	// `~/<userdata>/User/globalStorage/<extensionId>/...`
	// Require at least one segment after `<extensionId>` so we only match
	// files INSIDE an extension's storage, not the storage folder itself.
	const globalStorageIdx = segments.lastIndexOf('globalStorage');
	if (
		globalStorageIdx > 0
		&& segments[globalStorageIdx - 1] === 'User'
		&& globalStorageIdx + 2 < segments.length
	) {
		const candidate = segments[globalStorageIdx + 1];
		// Extension IDs are `<publisher>.<name>` (alphanumeric/hyphen each side).
		if (/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/i.test(candidate)) {
			return candidate;
		}
	}

	// `~/.vscode/extensions/<extensionId>-<version>/...`
	const extensionsIdx = segments.lastIndexOf('extensions');
	if (extensionsIdx < 0 || extensionsIdx + 1 >= segments.length) {
		return undefined;
	}
	const folderName = segments[extensionsIdx + 1];
	// Strip version suffix: the version starts with digits after the last hyphen
	// e.g. "github.copilot-chat-0.43.2026040602" → "github.copilot-chat"
	const versionMatch = folderName.match(/^(.+)-\d+\./);
	return versionMatch ? versionMatch[1] : undefined;
}
