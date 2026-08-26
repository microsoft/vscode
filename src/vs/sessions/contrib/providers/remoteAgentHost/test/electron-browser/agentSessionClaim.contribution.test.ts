/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import type { NativeParsedArgs } from '../../../../../../platform/environment/common/argv.js';
import {
	AGENT_SESSION_CLAIM_COMMAND_ID,
	AGENT_SESSION_CLAIM_HASH_ARG,
	agentSessionClaimTargets,
	computeAgentSessionClaimCommitment,
	type IAgentSessionClaimRequest,
} from '../../../../../../workbench/contrib/chat/common/agentHostSessionClaim.js';
import { INativeWorkbenchEnvironmentService } from '../../../../../../workbench/services/environment/electron-browser/environmentService.js';
import { AgentSessionClaimContribution } from '../../electron-browser/agentSessionClaim.contribution.js';

const SESSION_TYPE = 'remote-127-0-0-1-9001-copilot';
const SESSION_URI = 'copilot:/session-abc';
const BRIDGE_ID = 'vscode.agent-host-eval-bridge';
const BRIDGE_VERSION = '0.0.1';

const REQUEST: IAgentSessionClaimRequest = {
	nonce: 'FhV8bR2mQ1sX7dK0pT4uZg',
	sessionType: SESSION_TYPE,
	sessionUri: SESSION_URI,
	bridgeExtensionId: BRIDGE_ID,
	bridgeExtensionVersion: BRIDGE_VERSION,
};

suite('AgentSessionClaimContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let claimedSessions: URI[];
	let claimDisposeCount: number;
	let storageService: InMemoryStorageService;
	let targetRegistration: IDisposable | undefined;

	setup(() => {
		claimedSessions = [];
		claimDisposeCount = 0;
		storageService = store.add(new InMemoryStorageService());
		targetRegistration = store.add(registerTarget());
	});

	function registerTarget(sessionType = SESSION_TYPE): IDisposable {
		return agentSessionClaimTargets.register(sessionType, async backendSession => {
			claimedSessions.push(backendSession);
			return toDisposable(() => { claimDisposeCount++; });
		});
	}

	function createContribution(commitment: string | undefined): { readonly disposables: DisposableStore } {
		const disposables = store.add(new DisposableStore());
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(INativeWorkbenchEnvironmentService, new class extends mock<INativeWorkbenchEnvironmentService>() {
			override readonly args = { [AGENT_SESSION_CLAIM_HASH_ARG]: commitment } as NativeParsedArgs;
		});
		disposables.add(instantiationService.createInstance(AgentSessionClaimContribution));
		return { disposables };
	}

	function claimCommand(): IDisposable & { run(request: unknown): Promise<void> } {
		const command = CommandsRegistry.getCommand(AGENT_SESSION_CLAIM_COMMAND_ID);
		assert.ok(command, 'the claim command should be registered for a gated launch');
		return {
			run: async (request: unknown) => { await command.handler({} as never, request); },
			dispose: () => { },
		};
	}

	async function gated(request: IAgentSessionClaimRequest = REQUEST) {
		return createContribution(await computeAgentSessionClaimCommitment(request));
	}

	test('registers no command without a launch commitment', () => {
		createContribution(undefined);
		assert.strictEqual(CommandsRegistry.getCommand(AGENT_SESSION_CLAIM_COMMAND_ID), undefined);
	});

	test('registers no command for a malformed launch commitment', () => {
		createContribution('not-a-digest');
		assert.strictEqual(CommandsRegistry.getCommand(AGENT_SESSION_CLAIM_COMMAND_ID), undefined);
	});

	test('removes the command when the window is torn down', async () => {
		const { disposables } = await gated();
		assert.ok(CommandsRegistry.getCommand(AGENT_SESSION_CLAIM_COMMAND_ID));
		disposables.dispose();
		assert.strictEqual(CommandsRegistry.getCommand(AGENT_SESSION_CLAIM_COMMAND_ID), undefined);
	});

	test('claims the exact session named by the matching pre-image', async () => {
		await gated();
		await claimCommand().run({ ...REQUEST });
		assert.deepStrictEqual(claimedSessions.map(uri => uri.toString()), [SESSION_URI]);
	});

	test('rejects a request that does not hash to the launch commitment', async () => {
		await gated();
		await assert.rejects(
			() => claimCommand().run({ ...REQUEST, nonce: 'FhV8bR2mQ1sX7dK0pT4uZh' }),
			/does not match this launch/);
		assert.deepStrictEqual(claimedSessions, []);
	});

	test('rejects a request for another session or session type', async () => {
		await gated();
		await assert.rejects(() => claimCommand().run({ ...REQUEST, sessionUri: 'copilot:/session-other' }), /does not match this launch/);
		assert.deepStrictEqual(claimedSessions, []);
	});

	test('rejects unknown or missing request fields', async () => {
		await gated();
		await assert.rejects(() => claimCommand().run({ ...REQUEST, prompt: 'go' }), /malformed request/);
		assert.deepStrictEqual(claimedSessions, []);
	});

	test('burns the claim on a successful use', async () => {
		await gated();
		const command = claimCommand();
		await command.run({ ...REQUEST });
		await assert.rejects(() => command.run({ ...REQUEST }), /no unused claim/);
		assert.strictEqual(claimedSessions.length, 1, 'a replay must not claim again');
	});

	test('burns the claim even when the attempt fails', async () => {
		await gated();
		const command = claimCommand();
		await assert.rejects(() => command.run({ ...REQUEST, nonce: 'wrong-nonce-value-000' }), /does not match this launch/);
		await assert.rejects(() => command.run({ ...REQUEST }), /no unused claim/);
		assert.deepStrictEqual(claimedSessions, []);
	});

	test('burns the claim even when the request is malformed', async () => {
		await gated();
		const command = claimCommand();
		await assert.rejects(() => command.run(undefined), /malformed request/);
		await assert.rejects(() => command.run({ ...REQUEST }), /no unused claim/);
	});

	test('a reload cannot replay a spent commitment', async () => {
		const first = await gated();
		await claimCommand().run({ ...REQUEST });
		first.disposables.dispose();

		// Same argv, fresh contribution: the spent marker is what stops it.
		await gated();
		assert.strictEqual(CommandsRegistry.getCommand(AGENT_SESSION_CLAIM_COMMAND_ID), undefined);
		assert.strictEqual(claimedSessions.length, 1);
	});

	test('a reload cannot replay a commitment spent by a failed attempt', async () => {
		const first = await gated();
		await assert.rejects(() => claimCommand().run(undefined), /malformed request/);
		first.disposables.dispose();

		await gated();
		assert.strictEqual(CommandsRegistry.getCommand(AGENT_SESSION_CLAIM_COMMAND_ID), undefined);
	});

	test('a different commitment is unaffected by a spent one', async () => {
		const first = await gated();
		await claimCommand().run({ ...REQUEST });
		first.disposables.dispose();

		const other = { ...REQUEST, nonce: 'FhV8bR2mQ1sX7dK0pT4uZh' };
		await gated(other);
		await claimCommand().run(other);
		assert.strictEqual(claimedSessions.length, 2);
	});

	test('waits for a handler registered after the request', async () => {
		targetRegistration?.dispose();
		await gated();
		const claimed = claimCommand().run({ ...REQUEST });
		store.add(registerTarget());
		await claimed;
		assert.deepStrictEqual(claimedSessions.map(uri => uri.toString()), [SESSION_URI]);
	});

	test('times out deterministically when no handler ever registers', async () => {
		const request = { ...REQUEST, sessionType: 'remote-unregistered-copilot' };
		await gated(request);
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			await assert.rejects(
				() => claimCommand().run(request),
				/timed out: no handler for remote-unregistered-copilot/);
		});
		assert.deepStrictEqual(claimedSessions, []);
	});

	test('releases the claim when the window is torn down', async () => {
		const { disposables } = await gated();
		await claimCommand().run({ ...REQUEST });
		assert.strictEqual(claimDisposeCount, 0);
		disposables.dispose();
		assert.strictEqual(claimDisposeCount, 1);
	});
});
