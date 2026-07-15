/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64 } from '../../../../base/common/buffer.js';
import { MCP } from '../../../../platform/mcp/common/modelContextProtocol.js';
import { IToolResult, stringifyPromptTsxPart } from '../../chat/common/tools/languageModelToolsService.js';

/**
 * Converts an internal {@link IToolResult} into an MCP-shaped
 * {@link MCP.CallToolResult} suitable for return through the MCP gateway.
 *
 * Conversion rules:
 *  - `text` parts become `TextContent`.
 *  - `data` parts with an `image/*` mime type become `ImageContent` with
 *    base64-encoded data.
 *  - `data` parts with an `audio/*` mime type become `AudioContent` with
 *    base64-encoded data.
 *  - `data` parts with any other mime type are dropped (with a warning text
 *    block) since MCP has no generic binary content type — the model would
 *    not be able to interpret raw bytes anyway.
 *  - `promptTsx` parts are flattened to text via {@link stringifyPromptTsxPart}.
 *
 * `toolResultError` (truthy) sets `isError: true` on the result so the model
 * can self-correct.
 */
export function toolResultToMcpCallToolResult(result: IToolResult): MCP.CallToolResult {
	const content: MCP.ContentBlock[] = [];
	for (const part of result.content) {
		switch (part.kind) {
			case 'text':
				content.push({ type: 'text', text: part.value });
				break;
			case 'data': {
				const { mimeType, data } = part.value;
				if (mimeType.startsWith('image/')) {
					content.push({ type: 'image', data: encodeBase64(data), mimeType });
				} else if (mimeType.startsWith('audio/')) {
					content.push({ type: 'audio', data: encodeBase64(data), mimeType });
				} else {
					content.push({ type: 'text', text: `[binary content of type ${mimeType} omitted (${data.byteLength} bytes)]` });
				}
				break;
			}
			case 'promptTsx':
				content.push({ type: 'text', text: stringifyPromptTsxPart(part) });
				break;
		}
	}

	const isError = result.toolResultError !== undefined && result.toolResultError !== false;
	return isError ? { content, isError: true } : { content };
}
