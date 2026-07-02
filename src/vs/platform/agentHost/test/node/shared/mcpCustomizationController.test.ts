/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ActionType } from '../../../common/state/protocol/common/actions.js';
import { CustomizationType, McpAuthRequiredReason, McpServerStatus, type Customization, type McpServerState } from '../../../common/state/protocol/channels-session/state.js';
import type { SessionAction } from '../../../common/state/sessionActions.js';
import { McpCustomizationController, findMcpChildId, parseMcpChannelUri, type ISdkMcpServer } from '../../../node/shared/mcpCustomizationController.js';

function harness(opts: { customizations?: readonly Customization[] } = {}) {
	const actions: SessionAction[] = [];
	const controller = new McpCustomizationController({
		providerId: 'copilot',
		sessionId: 'session-1',
		resolveChildId: name => findMcpChildId(opts.customizations ?? [], name),
		emit: a => actions.push(a),
	});
	return { controller, actions };
}

function server(name: string, state: McpServerState): ISdkMcpServer {
	return { name, state };
}

function ready(): McpServerState { return { kind: McpServerStatus.Ready }; }
function starting(): McpServerState { return { kind: McpServerStatus.Starting }; }
function stopped(): McpServerState { return { kind: McpServerStatus.Stopped }; }
function authRequired(): McpServerState {
	return {
		kind: McpServerStatus.AuthRequired,
		reason: McpAuthRequiredReason.Required,
		resource: {
			resource: 'https://mcp.example.com',
			authorization_servers: ['https://auth.example.com'],
		},
		requiredScopes: ['repo'],
	};
}
function errored(message: string): McpServerState {
	return { kind: McpServerStatus.Error, error: { errorType: 'test-error', message } };
}

const PLUGIN_CUSTOMIZATIONS: readonly Customization[] = [
	{
		type: CustomizationType.Plugin,
		id: 'plugin:demo',
		uri: 'file:///plugins/demo',
		name: 'demo-plugin',
		enabled: true,
		children: [
			{
				type: CustomizationType.McpServer,
				id: 'mcp-child:demo:fs',
				uri: 'mcp-child:demo:fs',
				name: 'fs',
				enabled: true,
				state: { kind: McpServerStatus.Starting },
			},
		],
	},
];

suite('McpCustomizationController', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('empty inventory dispatches nothing', () => {
		const { controller, actions } = harness();
		store.add(controller);

		controller.applyAll([]);

		assert.deepStrictEqual(actions, []);
		assert.deepStrictEqual(controller.topLevelCustomizations(), []);
	});

	test('child-backed server: ready/error/ready transitions only update state+channel', () => {
		const { controller, actions } = harness({ customizations: PLUGIN_CUSTOMIZATIONS });
		store.add(controller);

		controller.applyOne(server('fs', ready()));
		controller.applyOne(server('fs', errored('boom')));
		controller.applyOne(server('fs', ready()));

		assert.deepStrictEqual(actions, [
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: { kind: McpServerStatus.Ready },
				channel: 'mcp://copilot/session-1/fs',
			},
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: { kind: McpServerStatus.Error, error: { errorType: 'test-error', message: 'boom' } },
				channel: undefined,
			},
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: { kind: McpServerStatus.Ready },
				channel: 'mcp://copilot/session-1/fs',
			},
		]);
		assert.deepStrictEqual(controller.topLevelCustomizations(), []);
	});

	test('bare server (no child match) is surfaced as a full top-level customization', () => {
		const { controller, actions } = harness();
		store.add(controller);

		controller.applyOne(server('search', ready()));

		const expectedId = 'mcp-top-level:copilot:session-1:search';
		assert.deepStrictEqual(actions, [
			{
				type: ActionType.SessionCustomizationUpdated,
				customization: {
					type: CustomizationType.McpServer,
					id: expectedId,
					uri: expectedId,
					name: 'search',
					enabled: true,
					state: { kind: McpServerStatus.Ready },
					channel: 'mcp://copilot/session-1/search',
					mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } },
				},
			},
		]);
		assert.deepStrictEqual(controller.topLevelCustomizations(), [
			{
				type: CustomizationType.McpServer,
				id: expectedId,
				uri: expectedId,
				name: 'search',
				enabled: true,
				state: { kind: McpServerStatus.Ready },
				channel: 'mcp://copilot/session-1/search',
				mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } },
			},
		]);
	});

	test('non-ready bare server has no channel but still advertises mcpApp (static capability)', () => {
		const { controller, actions } = harness();
		store.add(controller);

		controller.applyOne(server('search', starting()));

		const expectedId = 'mcp-top-level:copilot:session-1:search';
		assert.deepStrictEqual(actions, [
			{
				type: ActionType.SessionCustomizationUpdated,
				customization: {
					type: CustomizationType.McpServer,
					id: expectedId,
					uri: expectedId,
					name: 'search',
					enabled: true,
					state: { kind: McpServerStatus.Starting },
					channel: undefined,
					mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } },
				},
			},
		]);
	});

	test('removing a bare top-level server emits SessionCustomizationRemoved', () => {
		const { controller, actions } = harness();
		store.add(controller);

		controller.applyOne(server('search', ready()));
		actions.length = 0;
		controller.remove('search');

		const expectedId = 'mcp-top-level:copilot:session-1:search';
		assert.deepStrictEqual(actions, [
			{
				type: ActionType.SessionCustomizationRemoved,
				id: expectedId,
			},
		]);
		assert.deepStrictEqual(controller.topLevelCustomizations(), []);
	});

	test('applyAll removes servers no longer present (child) and emits Stopped', () => {
		const { controller, actions } = harness({ customizations: PLUGIN_CUSTOMIZATIONS });
		store.add(controller);

		controller.applyAll([server('fs', ready())]);
		controller.applyAll([]);

		assert.deepStrictEqual(actions, [
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: { kind: McpServerStatus.Ready },
				channel: 'mcp://copilot/session-1/fs',
			},
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: { kind: McpServerStatus.Stopped },
			},
		]);
	});

	test('runtimeStates snapshots child and top-level servers by customization id', () => {
		const { controller } = harness({ customizations: PLUGIN_CUSTOMIZATIONS });
		store.add(controller);

		controller.applyOne(server('fs', ready()));
		controller.applyOne(server('search', starting()));

		assert.deepStrictEqual(controller.runtimeStates.get(), new Map([
			['mcp-child:demo:fs', { state: { kind: McpServerStatus.Ready }, channel: 'mcp://copilot/session-1/fs' }],
			['mcp-top-level:copilot:session-1:search', { state: { kind: McpServerStatus.Starting }, channel: undefined }],
		]));

		controller.remove('fs');
		assert.deepStrictEqual([...controller.runtimeStates.get().keys()], ['mcp-top-level:copilot:session-1:search']);
	});

	test('top-level entry stays top-level across updates (id stable)', () => {
		const { controller, actions } = harness();
		store.add(controller);

		controller.applyOne(server('search', starting()));
		controller.applyOne(server('search', ready()));
		controller.applyOne(server('search', stopped()));

		const expectedId = 'mcp-top-level:copilot:session-1:search';
		const ids = actions
			.filter(a => a.type === ActionType.SessionCustomizationUpdated)
			.map(a => (a as { customization: { id: string } }).customization.id);
		assert.deepStrictEqual(ids, [expectedId, expectedId, expectedId]);
	});

	test('authRequired state is preserved across coarse starting updates', () => {
		const { controller, actions } = harness({ customizations: PLUGIN_CUSTOMIZATIONS });
		store.add(controller);

		const authState = authRequired();
		controller.applyOne(server('fs', authState));
		controller.applyOne(server('fs', starting()));
		controller.applyOne(server('fs', ready()));

		assert.deepStrictEqual(actions, [
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: authState,
				channel: undefined,
			},
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: authState,
				channel: undefined,
			},
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: { kind: McpServerStatus.Ready },
				channel: 'mcp://copilot/session-1/fs',
			},
		]);
	});

	test('parseMcpChannelUri round-trips the controller-minted channel URI', () => {
		const channel = 'mcp://copilot/session-1/fs';
		assert.deepStrictEqual(parseMcpChannelUri(channel), {
			providerId: 'copilot',
			sessionId: 'session-1',
			serverName: 'fs',
		});
	});

	test('parseMcpChannelUri decodes URL-encoded path segments', () => {
		const channel = 'mcp://copilot/session%2F1/my%20server';
		assert.deepStrictEqual(parseMcpChannelUri(channel), {
			providerId: 'copilot',
			sessionId: 'session/1',
			serverName: 'my server',
		});
	});

	test('parseMcpChannelUri rejects malformed inputs', () => {
		assert.strictEqual(parseMcpChannelUri('https://copilot/x/y'), undefined);
		assert.strictEqual(parseMcpChannelUri('mcp://'), undefined);
		assert.strictEqual(parseMcpChannelUri('mcp:///session/server'), undefined);
		assert.strictEqual(parseMcpChannelUri('mcp://copilot/session-only'), undefined);
		assert.strictEqual(parseMcpChannelUri('mcp://copilot/session/'), undefined);
		// Bad percent escapes must not throw — caller turns undefined
		// into a clean Method not found, not an internal error.
		assert.strictEqual(parseMcpChannelUri('mcp://copilot/bad%/server'), undefined);
		assert.strictEqual(parseMcpChannelUri('mcp://copilot/session/bad%2'), undefined);
	});

	test('findMcpChildId finds bare top-level entries and plugin children', () => {
		const customizations: readonly Customization[] = [
			...PLUGIN_CUSTOMIZATIONS,
			{
				type: CustomizationType.McpServer,
				id: 'mcp-top-level:test:search',
				uri: 'mcp-top-level:test:search',
				name: 'search',
				enabled: true,
				state: { kind: McpServerStatus.Ready },
			},
		];

		assert.strictEqual(findMcpChildId(customizations, 'fs'), 'mcp-child:demo:fs');
		assert.strictEqual(findMcpChildId(customizations, 'search'), 'mcp-top-level:test:search');
		assert.strictEqual(findMcpChildId(customizations, 'missing'), undefined);
	});
});
