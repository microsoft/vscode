/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostCanvasJsonLimits, AgentHostCanvasesMetaKey, isAgentHostCanvasJson, readAgentHostCanvasState, withAgentHostCanvasState, type IAgentHostCanvasState } from '../../common/agentHostCanvases.js';
import { buildChatUri } from '../../common/state/sessionState.js';
import { getAgentHostExtensionInitializeResultMeta, readAgentHostLocalCanvasWorkspace, IAgentHostExtensionInitializeResult, IAgentHostExtensionInitializeResultMeta } from '../../common/agentHostExtensionProtocol.js';

suite('Agent Host canvas metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const first = buildChatUri('copilot:/session', 'first');
	const second = buildChatUri('copilot:/session', 'second');
	const state: IAgentHostCanvasState = { supported: true, catalog: [], instances: [{ instanceId: 'one', extensionId: 'fixture', canvasId: 'counter', availability: 'unavailable' }] };

	function initialize(meta?: IAgentHostExtensionInitializeResultMeta): IAgentHostExtensionInitializeResult {
		return { protocolVersion: '0.1.0', serverSeq: 0, snapshots: [], _meta: meta };
	}

	test('only exposes a prepared workspace when the host advertises the local canvas capability', () => {
		const workspace = URI.file('/canvas-demo/workspace').toString();
		assert.deepStrictEqual([
			readAgentHostLocalCanvasWorkspace(undefined),
			readAgentHostLocalCanvasWorkspace(initialize()),
			readAgentHostLocalCanvasWorkspace(initialize(getAgentHostExtensionInitializeResultMeta(false, workspace))),
			readAgentHostLocalCanvasWorkspace(initialize(getAgentHostExtensionInitializeResultMeta(true))),
			readAgentHostLocalCanvasWorkspace(initialize(getAgentHostExtensionInitializeResultMeta(true, workspace)))?.toString(),
			readAgentHostLocalCanvasWorkspace(initialize({ 'vscode.localCanvases.workspace': workspace })),
		], [undefined, undefined, undefined, undefined, workspace, undefined]);
	});

	test('rejects a recovery workspace that is not an absolute local file URI', () => {
		for (const workspace of ['https://example.com/demo', 'vscode-remote://host/demo', 'file:///demo?query', 'file:///demo#fragment', 'not a URI']) {
			assert.throws(() => readAgentHostLocalCanvasWorkspace(initialize(getAgentHostExtensionInitializeResultMeta(true, workspace))));
		}
	});

	test('merges chat states without erasing unrelated metadata or another chat', () => {
		const a = withAgentHostCanvasState({ unrelated: 'preserved' }, first, state);
		const b = withAgentHostCanvasState(a, second, { ...state, instances: [] });
		assert.deepStrictEqual({ a, b, first: readAgentHostCanvasState(b, first), second: readAgentHostCanvasState(b, second) }, {
			a: { unrelated: 'preserved', [AgentHostCanvasesMetaKey]: { [first]: state } },
			b: { unrelated: 'preserved', [AgentHostCanvasesMetaKey]: { [first]: state, [second]: { ...state, instances: [] } } },
			first: state, second: { ...state, instances: [] },
		});
	});

	test('rejects malformed metadata and URLs attached to unavailable identities', () => {
		assert.deepStrictEqual([
			readAgentHostCanvasState(undefined, first),
			readAgentHostCanvasState({ [AgentHostCanvasesMetaKey]: { [first]: { ...state, catalog: [{}] } } }, first),
			readAgentHostCanvasState({ [AgentHostCanvasesMetaKey]: { [first]: { ...state, instances: [{ ...state.instances[0], url: 'http://127.0.0.1/stale' }] } } }, first),
			readAgentHostCanvasState(withAgentHostCanvasState(undefined, first, state), second),
			isAgentHostCanvasJson({ x: [null, true, 3, 'text'] }),
			isAgentHostCanvasJson({ x: Infinity }),
			isAgentHostCanvasJson({ x: undefined }),
			isAgentHostCanvasJson(() => 1),
		], [undefined, undefined, undefined, undefined, true, false, false, false]);
	});

	test('bounds canvas JSON before recursion or serialization and refuses executable accessors', () => {
		const cyclic: Record<string, object> = {};
		cyclic.self = cyclic;
		let deep: object = {};
		for (let i = 0; i <= AgentHostCanvasJsonLimits.maxDepth; i++) {
			deep = { child: deep };
		}
		let accessorInvoked = false;
		const accessor = { get text() { accessorInvoked = true; return 'not JSON'; } };
		const arrayAccessor: string[] = [];
		Object.defineProperty(arrayAccessor, 0, { get: () => { accessorInvoked = true; return 'not JSON'; } });
		const arraySerializer = Object.assign([], { toJSON: () => { accessorInvoked = true; return []; } });
		assert.deepStrictEqual([
			isAgentHostCanvasJson(cyclic),
			isAgentHostCanvasJson(deep),
			isAgentHostCanvasJson(Array.from({ length: AgentHostCanvasJsonLimits.maxNodes }, () => null)),
			isAgentHostCanvasJson('x'.repeat(AgentHostCanvasJsonLimits.maxBytes)),
			isAgentHostCanvasJson('界'.repeat(AgentHostCanvasJsonLimits.maxBytes / 2)),
			isAgentHostCanvasJson(accessor),
			isAgentHostCanvasJson(arrayAccessor),
			isAgentHostCanvasJson(arraySerializer),
			accessorInvoked,
			isAgentHostCanvasJson({ left: { n: 1 }, right: { n: 2 } }),
		], [false, false, false, false, false, false, false, false, false, true]);
	});

	test('accepts the exact byte, depth and node budgets and rejects the first excess', () => {
		const bytes = 'π'.repeat((AgentHostCanvasJsonLimits.maxBytes - 2) / 2);
		let depth: object = {};
		for (let index = 0; index < AgentHostCanvasJsonLimits.maxDepth; index++) {
			depth = [depth];
		}
		const nodes = Array.from({ length: AgentHostCanvasJsonLimits.maxNodes - 1 }, () => 0);
		assert.deepStrictEqual({
			serializedBytes: new TextEncoder().encode(JSON.stringify(bytes)).byteLength,
			bytes: [isAgentHostCanvasJson(bytes), isAgentHostCanvasJson(bytes + 'a')],
			depth: [isAgentHostCanvasJson(depth), isAgentHostCanvasJson([depth])],
			nodes: [isAgentHostCanvasJson(nodes), isAgentHostCanvasJson([...nodes, 0])],
		}, {
			serializedBytes: 65536,
			bytes: [true, false],
			depth: [true, false],
			nodes: [true, false],
		});
	});
});
