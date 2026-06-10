/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolResultContentType, type ToolCallResult, type ToolResultContent, type ToolResultEmbeddedResourceContent } from '../../../common/state/protocol/channels-session/state.js';

/**
 * Stable URI scheme used when an `EmbeddedResource` content block must be
 * shipped to the MCP server as the `{ type: 'resource', resource: { uri, mimeType, blob } }`
 * shape. The MCP zod schema rejects resource blocks without a URI, and the
 * protocol's `{ data, contentType }` carries no URI of its own — so we mint
 * an ephemeral, per-call URI of the form
 * `claude-client://<toolUseId>/<index>`. This URI is opaque to both sides;
 * the model never dereferences it.
 */
const CLAUDE_CLIENT_RESOURCE_SCHEME = 'claude-client';

/**
 * Convert a protocol {@link ToolCallResult} into the MCP {@link CallToolResult}
 * shape the Anthropic SDK feeds back to the model. Mostly 1:1 mapping with
 * one shape transform: protocol `EmbeddedResource { data, contentType }` →
 * MCP `{ type: 'image', ... }` for `image/*`, or
 * `{ type: 'resource', resource: { uri, mimeType, blob } }` for everything
 * else (synthesized URI per the scheme above).
 *
 * Unknown content block kinds collapse to a synthesized text block + a
 * console warn — bounded blast radius (one bad call, not a crash).
 *
 * @param toolUseId The SDK `tool_use_id` for this call. Embedded into the
 * synthesized resource URI so the same call's blocks stay disambiguated
 * across parallel tool calls.
 */
export function convertToolCallResult(result: ToolCallResult, toolUseId: string): CallToolResult {
	const blocks = result.content ?? [];
	const content = blocks.map((block, index) => convertBlock(block, toolUseId, index));
	const out: CallToolResult = { content };
	if (result.structuredContent !== undefined) {
		out.structuredContent = result.structuredContent;
	}
	if (!result.success || result.error) {
		out.isError = true;
	}
	return out;
}

function convertBlock(block: ToolResultContent, toolUseId: string, index: number): CallToolResult['content'][number] {
	switch (block.type) {
		case ToolResultContentType.Text:
			return { type: 'text', text: block.text };
		case ToolResultContentType.EmbeddedResource:
			return convertEmbeddedResource(block, toolUseId, index);
		default: {
			// Unknown / unsupported block (Resource, FileEdit, Terminal, Subagent).
			// MCP doesn't model these client-tool-result shapes natively, so we
			// degrade to a stringified text block to keep the call observable.
			console.warn(`[Claude] convertToolCallResult: unsupported tool-result block kind '${(block as ToolResultContent).type}'; degrading to text`);
			let text: string;
			try {
				text = JSON.stringify(block);
			} catch {
				text = `[unserializable ${(block as ToolResultContent).type} block]`;
			}
			return { type: 'text', text };
		}
	}
}

function convertEmbeddedResource(
	block: ToolResultEmbeddedResourceContent,
	toolUseId: string,
	index: number
): CallToolResult['content'][number] {
	if (block.contentType.startsWith('image/')) {
		return { type: 'image', data: block.data, mimeType: block.contentType };
	}
	const uri = `${CLAUDE_CLIENT_RESOURCE_SCHEME}://${encodeURIComponent(toolUseId)}/${index}`;
	return {
		type: 'resource',
		resource: { uri, mimeType: block.contentType, blob: block.data },
	};
}
