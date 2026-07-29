/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { convertToolCallResult } from '../../../node/claude/clientTools/claudeClientToolResult.js';
import { ToolResultContentType, type ToolCallResult, type ToolResultContent } from '../../../common/state/protocol/channels-chat/state.js';

function makeResult(over: Partial<ToolCallResult>): ToolCallResult {
	return {
		success: true,
		pastTenseMessage: 'did the thing',
		...over,
	};
}

suite('claudeClientToolResult / convertToolCallResult', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('text-only result maps to MCP text blocks; no isError when success', () => {
		const out = convertToolCallResult(makeResult({
			content: [{ type: ToolResultContentType.Text, text: 'hello' }],
		}), 'tu_1');
		assert.deepStrictEqual(out.content, [{ type: 'text', text: 'hello' }]);
		assert.strictEqual(out.isError, undefined);
	});

	test('error result carries isError=true', () => {
		const out = convertToolCallResult(makeResult({
			success: false,
			error: { message: 'boom' },
			content: [{ type: ToolResultContentType.Text, text: 'failed' }],
		}), 'tu_2');
		assert.strictEqual(out.isError, true);
	});

	test('image embedded resource → MCP image block (field rename + repackage)', () => {
		const out = convertToolCallResult(makeResult({
			content: [{
				type: ToolResultContentType.EmbeddedResource,
				data: 'BASE64PNG',
				contentType: 'image/png',
			}],
		}), 'tu_3');
		assert.deepStrictEqual(out.content[0], {
			type: 'image',
			data: 'BASE64PNG',
			mimeType: 'image/png',
		});
	});

	test('non-image embedded resource → MCP resource block with synthesized claude-client:// URI', () => {
		const out = convertToolCallResult(makeResult({
			content: [
				{ type: ToolResultContentType.EmbeddedResource, data: 'BASE64PDF', contentType: 'application/pdf' },
				{ type: ToolResultContentType.EmbeddedResource, data: 'BASE64ZIP', contentType: 'application/zip' },
			],
		}), 'tu/with-slash');
		// Per-call URI carries the tool_use_id (encoded) and the block index, so
		// parallel calls with the same shape stay disambiguated.
		assert.deepStrictEqual(out.content[0], {
			type: 'resource',
			resource: { uri: 'claude-client://tu%2Fwith-slash/0', mimeType: 'application/pdf', blob: 'BASE64PDF' },
		});
		assert.deepStrictEqual(out.content[1], {
			type: 'resource',
			resource: { uri: 'claude-client://tu%2Fwith-slash/1', mimeType: 'application/zip', blob: 'BASE64ZIP' },
		});
	});

	test('unknown block kind collapses to a stringified text block (warn logged, no throw)', () => {
		const originalWarn = console.warn;
		let warned = false;
		console.warn = () => { warned = true; };
		try {
			const malformedBlock = { type: 'not-a-real-kind', ref: 'r1', mimeType: 'text/plain' } as unknown as ToolResultContent;
			const out = convertToolCallResult(makeResult({
				content: [malformedBlock],
			}), 'tu_5');
			assert.strictEqual(out.content[0].type, 'text');
			assert.ok(typeof (out.content[0] as { text: string }).text === 'string');
			assert.strictEqual(warned, true);
		} finally {
			console.warn = originalWarn;
		}
	});

	test('structuredContent passes through unchanged', () => {
		const out = convertToolCallResult(makeResult({
			structuredContent: { k: 'v' },
		}), 'tu_6');
		assert.deepStrictEqual(out.structuredContent, { k: 'v' });
	});
});
