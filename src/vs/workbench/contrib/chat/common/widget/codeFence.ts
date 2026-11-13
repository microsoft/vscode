/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Returns the info string of a fenced code block whose closing fence has arrived, or `undefined`
 * while the block is still open. `raw` is the Markdown source of the block, including its fences.
 */
export function getClosedCodeFenceInfo(raw: string | undefined): string | undefined {
	if (!raw) {
		return undefined;
	}

	const opening = /^ {0,3}(?<fence>`{3,}|~{3,})(?<info>[^\n]*)/.exec(raw)?.groups;
	const closing = /\n {0,3}(?<fence>`{3,}|~{3,}) *(?:\r?\n)*$/.exec(raw)?.groups?.fence;
	if (!opening || !closing || closing.length < opening.fence.length || closing[0] !== opening.fence[0]) {
		return undefined;
	}
	return opening.info.trim();
}
