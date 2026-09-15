/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { agentCanvasesMetaKey, isAgentCanvasInput, readAgentCanvases, supportsAgentHostCanvasClose, supportsAgentHostCanvasOpen, withAgentCanvases } from '../../common/meta/agentCanvasMeta.js';

suite('Agent Canvas metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const first = { chat: 'copilot:/session/chat/first', instanceId: 'one', canvasTypeId: 'extension:counter', url: 'http://localhost:3000/' };
	const second = { ...first, chat: 'copilot:/session/chat/second', instanceId: 'two' };

	test('replaces and clears one chat without affecting peer chats or unrelated metadata', () => {
		const initial = withAgentCanvases({ unrelated: true }, first.chat, [first]);
		const withPeer = withAgentCanvases(initial, second.chat, [second]);
		assert.deepStrictEqual(withAgentCanvases(withPeer, first.chat, []), {
			unrelated: true,
			[agentCanvasesMetaKey]: [second],
		});
	});

	test('accepts pending URLs but rejects malformed entries', () => {
		assert.deepStrictEqual(readAgentCanvases({ _meta: {
			[agentCanvasesMetaKey]: [null, false, {}, first, { ...second, url: undefined }, { ...first, title: 1 }, { ...first, instanceId: '' }],
		} }), [first, { ...second, url: undefined }]);
	});

	test('validates optional runtime status and reopen revisions', () => {
		const canvas = { ...first, extensionId: 'project:counter', status: 'Ready', unavailable: true, revision: 'opened-event-id' };
		assert.deepStrictEqual(readAgentCanvases({ _meta: {
			[agentCanvasesMetaKey]: [canvas, { ...canvas, revision: 1 }, { ...canvas, extensionId: false }, { ...canvas, status: {} }, { ...canvas, unavailable: 'true' }],
		} }), [canvas]);
	});

	test('requires an explicit host close capability', () => {
		assert.deepStrictEqual([
			supportsAgentHostCanvasClose(undefined),
			supportsAgentHostCanvasClose({}),
			supportsAgentHostCanvasClose({ _meta: { 'vscode.closeCanvas': 'true' } }),
			supportsAgentHostCanvasClose({ _meta: { 'vscode.closeCanvas': true } }),
		], [false, false, false, true]);
	});

	test('requires the exact direct-management version and JSON input', () => {
		const cyclic: { self?: object } = {};
		cyclic.self = cyclic;
		assert.deepStrictEqual({
			versions: [undefined, true, 0, 1, 2, '1'].map(version => supportsAgentHostCanvasOpen({ _meta: { 'vscode.canvasManagement': version } })),
			inputs: [null, true, 2, '', [1, { count: 2 }], undefined, NaN, Infinity, new Date(), { count: undefined }, cyclic].map(value => isAgentCanvasInput(value)),
		}, {
			versions: [false, false, false, true, false, false],
			inputs: [true, true, true, true, true, false, false, false, false, false, false],
		});
	});
});
