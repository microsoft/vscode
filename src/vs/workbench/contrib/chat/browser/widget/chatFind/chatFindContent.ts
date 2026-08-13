/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { canceledName } from '../../../../../../base/common/errors.js';
import { isMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { basename } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isLocation, Location } from '../../../../../../editor/common/languages.js';
import { IWorkspaceSymbol } from '../../../../search/common/search.js';
import { IChatResponseViewModel } from '../../../common/model/chatViewModel.js';

/**
 * A unit of searchable text from a chat response, keyed to the content part it came from.
 * `partIndex` indexes {@link IChatResponseViewModel.response.value}; `-1` marks row-level
 * text with no content part of its own, such as error details.
 */
export interface IChatFindTextPart {
	readonly partIndex: number;
	readonly text: string;
}

function inlineReferenceLabel(part: { inlineReference: URI | Location | IWorkspaceSymbol; name?: string }): string | undefined {
	const ref = part.inlineReference;
	if (URI.isUri(ref)) {
		return part.name || basename(ref);
	}
	if (isLocation(ref)) {
		return part.name || basename(ref.uri);
	}
	return ref.name;
}

/**
 * Whether the response renders its error message verbatim. Mirrors the renderer, which drops the
 * error part for canceled or non-final responses, and replaces the message with fixed copy for the
 * quota and anonymous rate-limit variants.
 */
function isErrorDetailsRendered(item: IChatResponseViewModel): boolean {
	const errorDetails = item.errorDetails;
	if (!errorDetails?.message || errorDetails.isQuotaExceeded || errorDetails.isRateLimited) {
		return false;
	}
	return item.model.response === item.model.entireResponse
		&& !item.isCanceled
		&& errorDetails.message !== canceledName;
}

/**
 * Extracts the text a response actually *renders*, for Find to index.
 *
 * Deliberately not the accessible view's extraction: that one describes a response to a screen
 * reader and synthesizes strings with no on-screen equivalent (result payloads, "Input:",
 * "Errored", authentication prompts). Indexing those produces matches Find counts but can never
 * scroll to or highlight, because the DOM has no such text.
 *
 * Only content whose rendering can be predicted from the model alone is indexed. Reasoning and
 * tool invocations are excluded: where they render is decided during rendering, so indexing them
 * makes the match count depend on how far the transcript has been drawn.
 */
export function getChatFindTextParts(item: IChatResponseViewModel): IChatFindTextPart[] {
	const parts: IChatFindTextPart[] = [];

	if (isErrorDetailsRendered(item)) {
		// The message is rendered as markdown, so index its plaintext form rather than the raw
		// source; otherwise syntax characters would be counted but absent from the DOM.
		parts.push({ partIndex: -1, text: renderAsPlaintext(new MarkdownString(item.errorDetails!.message)) });
	}

	item.response.value.forEach((part, partIndex) => {
		switch (part.kind) {
			case 'markdownContent': {
				// No code fences or link formatting: the ``` markers are consumed by the code
				// block, and an empty link renders as an empty anchor, so both would contribute
				// text that is counted here but absent from the DOM.
				const text = renderAsPlaintext(part.content);
				if (text.trim()) {
					parts.push({ partIndex, text });
				}
				break;
			}
			case 'inlineReference': {
				// Only the label is rendered; the resolved path lives in the hover.
				const label = inlineReferenceLabel(part);
				if (label?.trim()) {
					parts.push({ partIndex, text: label });
				}
				break;
			}
			case 'toolInvocation':
			case 'toolInvocationSerialized': {
				// Tool invocations are not indexed. Whether one renders as its own pill or inside
				// a thinking/subagent part is decided during rendering (`isAttachedToThinking` is
				// assigned by the renderer), so indexing them makes the match count depend on how
				// much has rendered: a row that has not been drawn yet contributes matches that
				// disappear once it is. Those are the "ghost" results that navigate nowhere.
				break;
			}
			case 'elicitation2':
			case 'elicitationSerialized': {
				const title = isMarkdownString(part.title) ? renderAsPlaintext(part.title) : part.title;
				const message = isMarkdownString(part.message) ? renderAsPlaintext(part.message) : part.message;
				const text = [title, message].filter(value => typeof value === 'string' && value.trim()).join('\n');
				if (text.trim()) {
					parts.push({ partIndex, text });
				}
				break;
			}
		}
	});

	return parts;
}
