/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AGENT_WORKSPACE_CONVERSION_CAPABILITY, AGENT_WORKSPACE_SETUP_META_KEY, readAgentWorkspaceConversionCapability, readAgentWorkspaceSetup, restoreAgentWorkspaceSetup, withAgentWorkspaceConversionCapability, withAgentWorkspaceSetup, type IAgentWorkspaceSetup } from '../../common/meta/agentWorkspaceConversionMeta.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';

suite('Agent workspace conversion metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const setup: IAgentWorkspaceSetup = {
		version: 1,
		operationId: 'operation-1',
		chat: buildDefaultChatUri('copilot:/intake'),
		turnId: 'turn-1',
		requestedWorkspace: 'file:///workspace/project',
		isolation: 'worktree',
		phase: 'preparing',
		continuation: 'pending',
		continuationTurnId: 'continuation-1',
	};

	test('capability requires an explicit supported version, independently of provider identity', () => {
		assert.deepStrictEqual([
			readAgentWorkspaceConversionCapability({}),
			readAgentWorkspaceConversionCapability({ capabilities: { multipleChats: {} } }),
			readAgentWorkspaceConversionCapability({ capabilities: withAgentWorkspaceConversionCapability(undefined, false) }),
			readAgentWorkspaceConversionCapability({ capabilities: withAgentWorkspaceConversionCapability(undefined, true) }),
			readAgentWorkspaceConversionCapability({ capabilities: { multipleChats: undefined, ...{ [AGENT_WORKSPACE_CONVERSION_CAPABILITY]: { version: 2, supported: true } } } }),
			readAgentWorkspaceConversionCapability({ capabilities: { multipleChats: undefined, ...{ [AGENT_WORKSPACE_CONVERSION_CAPABILITY]: { version: 1, supported: 'true' } } } }),
		], [false, false, false, true, false, false]);
	});

	test('validates every metadata field before projection', () => {
		const invalid = [
			{ version: 2 }, { operationId: '' }, { chat: 'not a chat' }, { turnId: 1 },
			{ requestedWorkspace: 'https://example.com/project' }, { isolation: true },
			{ phase: 'success' }, { phase: 'attached' }, { phase: 'attached', actualWorkspace: setup.requestedWorkspace }, { actualWorkspace: {} },
			{ attachmentError: 1 }, { continuation: true }, { continuationTurnId: 1 },
			{ continuationError: {} },
		];
		assert.deepStrictEqual(invalid.map(patch => readAgentWorkspaceSetup({
			_meta: { [AGENT_WORKSPACE_SETUP_META_KEY]: { ...setup, ...patch } },
		})), invalid.map(() => undefined));
	});

	test('restores interrupted setup as unknown without inventing a completed attachment', () => {
		const restored = restoreAgentWorkspaceSetup(JSON.stringify(setup));
		assert.deepStrictEqual({
			phase: restored?.phase,
			continuation: restored?.continuation,
			operationId: restored?.operationId,
			actualWorkspace: restored?.actualWorkspace,
		}, { phase: 'unknown', continuation: 'unknown', operationId: 'operation-1', actualWorkspace: undefined });
	});

	test('retains attached workspace when only continuation is unresolved or failed', () => {
		const attached: IAgentWorkspaceSetup = { ...setup, phase: 'attached', actualWorkspace: 'file:///worktrees/project', continuation: 'running' };
		const failed: IAgentWorkspaceSetup = { ...attached, continuation: 'failed', continuationError: 'Provider disconnected' };
		assert.deepStrictEqual([
			restoreAgentWorkspaceSetup(JSON.stringify(attached)),
			restoreAgentWorkspaceSetup(JSON.stringify(failed)),
		], [
			{ ...readAgentWorkspaceSetup({ _meta: withAgentWorkspaceSetup(undefined, attached) }), continuation: 'unknown' },
			readAgentWorkspaceSetup({ _meta: withAgentWorkspaceSetup(undefined, failed) }),
		]);
	});

	test('rejects invalid persisted metadata rather than reporting success', () => {
		assert.throws(() => restoreAgentWorkspaceSetup('{'));
		assert.throws(() => restoreAgentWorkspaceSetup(JSON.stringify({ ...setup, version: 2 })));
	});
});
