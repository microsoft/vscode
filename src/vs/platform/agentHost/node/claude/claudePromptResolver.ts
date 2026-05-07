/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import { URI } from '../../../../base/common/uri.js';
import { AgentAttachmentType, IAgentAttachment } from '../../common/agentService.js';

/**
 * Build the {@link Anthropic.ContentBlockParam}[] payload for an
 * {@link SDKUserMessage} from a plain text prompt and the agent host's
 * normalized attachment list.
 *
 * Phase 6 keeps the resolver pure and minimal: a single `text` block
 * carrying the prompt, plus (when attachments are present) a second
 * `text` block wrapped in `<system-reminder>` tags listing the
 * referenced URIs. This mirrors the production extension's resolver
 * shape so a future phase that expands `IAgentAttachment` (binary
 * images, inline range substitution) can port the existing branches
 * without restructuring.
 *
 * Selections are rendered as URI references with an optional line suffix.
 * `IAgentAttachment` carries range metadata, but not inline selected text.
 */
export function resolvePromptToContentBlocks(
	prompt: string,
	attachments?: readonly IAgentAttachment[],
): Anthropic.ContentBlockParam[] {
	const blocks: Anthropic.ContentBlockParam[] = [{ type: 'text', text: prompt }];
	if (!attachments?.length) {
		return blocks;
	}
	const refLines: string[] = [];
	for (const att of attachments) {
		switch (att.type) {
			case AgentAttachmentType.File:
			case AgentAttachmentType.Directory:
				refLines.push(`- ${uriToString(att.uri)}`);
				break;
			case AgentAttachmentType.Selection: {
				const line = att.selection ? `:${att.selection.start.line + 1}` : '';
				refLines.push(`- ${uriToString(att.uri)}${line}`);
				break;
			}
		}
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
