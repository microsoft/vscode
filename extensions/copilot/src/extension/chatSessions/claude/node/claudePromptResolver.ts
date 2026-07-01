/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Anthropic from '@anthropic-ai/sdk';
import type * as vscode from 'vscode';
import { isLocation } from '../../../../util/common/types';
import { URI } from '../../../../util/vs/base/common/uri';
import { ChatReferenceBinaryData } from '../../../../vscodeTypes';
import { toAnthropicImageMediaType } from './sessionParser/claudeSessionSchema';

// #region Prompt Resolution

function uriToString(uri: URI): string {
	return uri.scheme === 'file' ? uri.fsPath : uri.toString();
}

/**
 * Converts a `vscode.ChatRequest` into an array of Anthropic content blocks.
 *
 * - Inline references (`ref.range`) are substituted directly into the prompt text.
 * - Non-inline references are appended as a `<system-reminder>` text block.
 * - Binary image references become `image` content blocks.
 * - Slash-command prompts (starting with `/`) are passed through unmodified.
 */
export async function resolvePromptToContentBlocks(request: vscode.ChatRequest): Promise<Anthropic.ContentBlockParam[]> {
	if (request.prompt.startsWith('/')) {
		return [{ type: 'text', text: request.prompt }];
	}

	let prompt = request.prompt;
	const imageBlocks: Anthropic.ContentBlockParam[] = [];
	const extraRefsTexts: string[] = [];

	// Sort references with inline ranges by descending start position so that
	// earlier replacements don't shift the indices of later ones.
	const sortedRefs = [...request.references].sort((a, b) => {
		const aStart = a.range?.[0] ?? -1;
		const bStart = b.range?.[0] ?? -1;
		return bStart - aStart;
	});

	for (const ref of sortedRefs) {
		let refValue = ref.value;
		if (refValue instanceof ChatReferenceBinaryData) {
			const mediaType = toAnthropicImageMediaType(refValue.mimeType);
			if (mediaType) {
				const data = await refValue.data();
				imageBlocks.push({
					type: 'image',
					source: {
						type: 'base64',
						data: Buffer.from(data).toString('base64'),
						media_type: mediaType
					}
				});
				continue;
			}
			if (!refValue.reference) {
				continue;
			}
			refValue = refValue.reference;
		}

		const valueText = URI.isUri(refValue)
			? uriToString(refValue)
			: isLocation(refValue)
				? `${uriToString(refValue.uri)}:${refValue.range.start.line + 1}`
				: undefined;
		if (valueText) {
			if (ref.range) {
				prompt = prompt.slice(0, ref.range[0]) + valueText + prompt.slice(ref.range[1]);
			} else {
				extraRefsTexts.push(`- ${valueText}`);
			}
		}
	}

	const contentBlocks: Anthropic.ContentBlockParam[] = [
		{ type: 'text', text: request.command ? `/${request.command} ${prompt}` : prompt },
		...imageBlocks,
	];

	if (extraRefsTexts.length > 0) {
		contentBlocks.push({
			type: 'text',
			text: `<system-reminder>\nThe user provided the following references:\n${extraRefsTexts.join('\n')}\n\nIMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.\n</system-reminder>`
		});
	}

	return contentBlocks;
}

// #endregion
