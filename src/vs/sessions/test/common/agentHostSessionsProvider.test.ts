/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { buildMutableConfigSchema, unscopeCustomizationId } from '../../common/agentHostSessionsProvider.js';
import { ChatInteractivity, effectiveChatInteractivity } from '../../services/sessions/common/session.js';

suite('buildMutableConfigSchema', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('derives per-value schema entries and special-cases autoApprove', () => {
		const actual = buildMutableConfigSchema({
			autoApprove: 'default',
			mode: 'worktree',
			timeout: 5000,
			enabled: true,
			tags: ['a', 'b'],
			permissions: { allow: ['Tool'], deny: [] },
			nothing: undefined,
			missing: null,
		});

		assert.deepStrictEqual(actual, {
			autoApprove: {
				type: 'string',
				title: 'autoApprove',
				sessionMutable: true,
				enum: ['default', 'autoApprove', 'autopilot'],
			},
			mode: {
				type: 'string',
				title: 'mode',
				sessionMutable: true,
				enum: ['worktree'],
			},
			timeout: { type: 'number', title: 'timeout', sessionMutable: true },
			enabled: { type: 'boolean', title: 'enabled', sessionMutable: true },
			tags: { type: 'array', title: 'tags', sessionMutable: true },
			permissions: { type: 'object', title: 'permissions', sessionMutable: true },
			// `undefined` and `null` are omitted — they aren't representable in
			// the config schema.
		});
	});
});

suite('effectiveChatInteractivity', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('archived sessions force interactive chats read-only, preserve hidden, and leave active chats unchanged', () => {
		const actual = {
			archivedFull: effectiveChatInteractivity(true, ChatInteractivity.Full),
			archivedReadOnly: effectiveChatInteractivity(true, ChatInteractivity.ReadOnly),
			archivedHidden: effectiveChatInteractivity(true, ChatInteractivity.Hidden),
			activeFull: effectiveChatInteractivity(false, ChatInteractivity.Full),
			activeReadOnly: effectiveChatInteractivity(false, ChatInteractivity.ReadOnly),
			activeHidden: effectiveChatInteractivity(false, ChatInteractivity.Hidden),
		};
		assert.deepStrictEqual(actual, {
			archivedFull: ChatInteractivity.ReadOnly,
			archivedReadOnly: ChatInteractivity.ReadOnly,
			archivedHidden: ChatInteractivity.Hidden,
			activeFull: ChatInteractivity.Full,
			activeReadOnly: ChatInteractivity.ReadOnly,
			activeHidden: ChatInteractivity.Hidden,
		});
	});

	// Regression: stripping a leading segment unconditionally corrupted unscoped
	// plugin ids (`file:///p` -> `//p`), so the host silently found nothing to
	// toggle and plugin disable did nothing in the Agents window.
	test('unscopes only ids that resolved to an MCP server', () => {
		assert.deepStrictEqual({
			scopedServer: unscopeCustomizationId('auth/file:///p/.mcp.json#mcp=slack', 'auth/file:///p/.mcp.json#mcp=slack'),
			plugin: unscopeCustomizationId('file:///Users/me/plugin', undefined),
			pluginWithNoSlash: unscopeCustomizationId('plugin-1', undefined),
		}, {
			scopedServer: 'file:///p/.mcp.json#mcp=slack',
			plugin: 'file:///Users/me/plugin',
			pluginWithNoSlash: 'plugin-1',
		});
	});
});
