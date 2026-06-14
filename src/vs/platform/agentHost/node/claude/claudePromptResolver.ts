/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import { URI } from '../../../../base/common/uri.js';
import { MessageAttachmentKind, type MessageAttachment } from '../../common/state/protocol/state.js';

/**
 * Build the {@link Anthropic.ContentBlockParam}[] payload for an
 * {@link SDKUserMessage} from a plain text prompt and the protocol
 * attachments accompanying the user message.
 *
 * Phase 6 keeps the resolver pure and minimal: a single `text` block
 * carrying the prompt, plus additional text blocks for attachments. This
 * mirrors the production extension's resolver shape so a future phase that
 * adds image rendering or inline range substitution can extend without
 * restructuring.
 *
 * Selections are rendered as URI references with an optional line
 * suffix. The protocol's {@link TextSelection} carries range metadata
 * only; the selected text is not included inline.
 *
 * Resource attachments and simple attachments with model representations
 * are honoured today. Embedded resources are dropped because the current
 * Claude path does not have a place to consume them.
 */
export function resolvePromptToContentBlocks(
	prompt: string,
	attachments?: readonly MessageAttachment[],
): Anthropic.ContentBlockParam[] {
	const blocks: Anthropic.ContentBlockParam[] = [{ type: 'text', text: prompt }];
	if (!attachments?.length) {
		return blocks;
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
	if (simpleBlocks.length > 0) {
		blocks.push({
			type: 'text',
			text: simpleBlocks.join('\n\n'),
		});
	}
	if (refLines.length === 0) {
		return blocks;
	}
	blocks.push({
		type: 'text',
		text: '<system-reminder>\nThe user provided the following references:\n' +
			refLines.join('\n') +
			'\n\nIMPORTANT: this context may or may not be relevant to your tasks. ' +
			'You should not respond to this context unless it is highly relevant to your task.\n' +
			'</system-reminder>',
	});
	return blocks;
}

function uriToString(uri: URI): string {
	return uri.scheme === 'file' ? uri.fsPath : uri.toString();
}
