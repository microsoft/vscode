/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { MessageAttachmentKind, type MessageAttachment } from '../../common/state/protocol/state.js';

/**
 * Build the final prompt string for the Codex SDK from the raw user
 * prompt and any protocol {@link MessageAttachment}s.
 *
 * The Codex SDK accepts a plain `string` prompt (unlike Claude's
 * `ContentBlockParam[]`), so attachments are rendered as inline text
 * appended to the prompt. The rendering matches the Claude prompt
 * resolver's conventions:
 *
 * - Simple attachments with `modelRepresentation` are injected as
 *   plain-text blocks separated by blank lines.
 * - Resource attachments are rendered as URI reference bullet lists
 *   wrapped in `<system-reminder>` tags, with optional line-number
 *   suffixes for selections.
 * - Embedded resource attachments are dropped (no Codex-side consumer).
 */
export function resolvePromptWithAttachments(
	prompt: string,
	attachments?: readonly MessageAttachment[],
): string {
	if (!attachments?.length) {
		return prompt;
	}
	const refLines: string[] = [];
	const simpleBlocks: string[] = [];
	for (const att of attachments) {
		if (att.type === MessageAttachmentKind.Simple) {
			if (att.modelRepresentation) {
				simpleBlocks.push(att.modelRepresentation);
			}
			continue;
		}
		if (att.type !== MessageAttachmentKind.Resource) {
			continue;
		}
		const uri = URI.parse(att.uri);
		if (att.displayKind === 'selection') {
			const startLine = att.selection ? `:${att.selection.range.start.line + 1}` : '';
			refLines.push(`- ${uriToString(uri)}${startLine}`);
		} else {
			refLines.push(`- ${uriToString(uri)}`);
		}
	}
	const parts: string[] = [prompt];
	if (simpleBlocks.length > 0) {
		parts.push(simpleBlocks.join('\n\n'));
	}
	if (refLines.length > 0) {
		parts.push(
			'<system-reminder>\nThe user provided the following references:\n' +
			refLines.join('\n') +
			'\n\nIMPORTANT: this context may or may not be relevant to your tasks. ' +
			'You should not respond to this context unless it is highly relevant to your task.\n' +
			'</system-reminder>',
		);
	}
	return parts.join('\n\n');
}

function uriToString(uri: URI): string {
	return uri.scheme === 'file' ? uri.fsPath : uri.toString();
}
