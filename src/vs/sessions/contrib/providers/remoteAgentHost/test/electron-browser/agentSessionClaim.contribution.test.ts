/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import type { RecordedTimerEvent } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { timeout } from '../../../../../../base/common/async.js';
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
import { observableValue, type ISettableObservable } from '../../../../../../base/common/observable.js';
import type { ISession } from '../../../../../services/sessions/common/session.js';
import { ISessionsManagementService, type IActiveSession, type ISessionsChangeEvent } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { AGENT_SESSION_CLAIM_BUDGET_MS, AgentSessionClaimContribution } from '../../electron-browser/agentSessionClaim.contribution.js';

const SESSION_TYPE = 'remote-127-0-0-1-9001-copilot';
const SESSION_URI = 'copilot:/session-abc';
const BRIDGE_ID = 'vscode.agent-host-eval-bridge';
const BRIDGE_VERSION = '0.0.1';

/** What the handler derives from the backend session and hands to the activation. */
const SESSION_RESOURCE = URI.from({ scheme: SESSION_TYPE, path: '/session-abc' });

const REQUEST: IAgentSessionClaimRequest = {
	nonce: 'FhV8bR2mQ1sX7dK0pT4uZg',
	sessionType: SESSION_TYPE,
	sessionUri: SESSION_URI,
	bridgeExtensionId: BRIDGE_ID,
	bridgeExtensionVersion: BRIDGE_VERSION,
};

interface IRecordedOpen {
	readonly resource: string;
	readonly options: { preserveFocus?: boolean } | undefined;
}

suite('AgentSessionClaimContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let claimedSessions: URI[];
	let activatedSessions: URI[];
	let claimDisposeCount: number;
	let storageService: InMemoryStorageService;
	let targetRegistration: IDisposable | undefined;
	let openedSessions: IRecordedOpen[];
	let listedSessions: Set<string>;
	let sessionsChanged: Emitter<ISessionsChangeEvent>;
	let activeSession: ISettableObservable<IActiveSession | undefined>;
	/** Whether the stubbed `openSession` also makes the session active. */
	let activatesOnOpen: boolean;
	/** Resolves when the stubbed `openSession` has been called. */
	let whenOpened: Promise<void>;
	let signalOpened: () => void;

	setup(() => {
		claimedSessions = [];
		activatedSessions = [];
		claimDisposeCount = 0;
		openedSessions = [];
		listedSessions = new Set([SESSION_RESOURCE.toString()]);
		sessionsChanged = store.add(new Emitter<ISessionsChangeEvent>());
		activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		activatesOnOpen = true;
		whenOpened = new Promise<void>(resolve => { signalOpened = resolve; });
		storageService = store.add(new InMemoryStorageService());
		targetRegistration = store.add(registerTarget());
	});

	function registerTarget(sessionType = SESSION_TYPE): IDisposable {
		return agentSessionClaimTargets.register(sessionType, async (backendSession, activate, token) => {
			claimedSessions.push(backendSession);
			await activate(SESSION_RESOURCE, token);
			activatedSessions.push(SESSION_RESOURCE);
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
		// Only the members the claim may touch are implemented, so anything else
		// throws rather than passing silently.
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
			override async openSession(resource: URI, options?: { preserveFocus?: boolean }): Promise<void> {
				openedSessions.push({ resource: resource.toString(), options });
				signalOpened();
				if (activatesOnOpen) {
					activeSession.set({ resource } as IActiveSession, undefined);
				}
			}
		});
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = sessionsChanged.event;
			override getSession(resource: URI): ISession | undefined {
				return listedSessions.has(resource.toString()) ? {} as ISession : undefined;
			}
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

	test('waits for the registration event when the handler is not ready yet', async () => {
		targetRegistration?.dispose();
		await gated();
		const claimed = claimCommand().run({ ...REQUEST });
		// Registration is the only thing that can let this proceed.
		store.add(registerTarget());
		await claimed;
		assert.deepStrictEqual(claimedSessions.map(uri => uri.toString()), [SESSION_URI]);
	});

	test('an unrelated handler registration does not satisfy the claim', async () => {
		targetRegistration?.dispose();
		await gated();
		const claimed = claimCommand().run({ ...REQUEST });
		store.add(registerTarget('remote-unrelated-copilot'));
		assert.strictEqual(claimedSessions.length, 0, 'a different session type must not settle the wait');

		store.add(registerTarget());
		await claimed;
		assert.deepStrictEqual(claimedSessions.map(uri => uri.toString()), [SESSION_URI]);
	});

	test('a successful claim requires no timer to fire', async () => {
		await gated();
		let history: readonly RecordedTimerEvent[] = [];
		await runWithFakedTimers({ useFakeTimers: false, onHistory: recorded => { history = recorded; } }, async () => {
			await claimCommand().run({ ...REQUEST });
		});
		assert.deepStrictEqual(claimedSessions.map(uri => uri.toString()), [SESSION_URI]);
		assert.deepStrictEqual(history, [], 'the budget guard must never be a success condition');
	});

	test('reports budgetExceeded when the budget fires waiting for a handler', async () => {
		targetRegistration?.dispose();
		await gated();
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			await assert.rejects(
				() => claimCommand().run({ ...REQUEST }),
				/budgetExceeded: remote-127-0-0-1-9001-copilot did not become claimable/);
		});
		assert.deepStrictEqual(claimedSessions, []);
	});

	test('reports budgetExceeded when the budget fires during the claim itself', async () => {
		targetRegistration?.dispose();
		// Registered, but only ends when cancelled: the guard has to interrupt
		// the claim itself rather than the readiness wait.
		store.add(agentSessionClaimTargets.register(SESSION_TYPE, (_session, _activate, token) =>
			new Promise((_resolve, reject) => store.add(token.onCancellationRequested(() => reject(new CancellationError()))))));
		await gated();
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			await assert.rejects(
				() => claimCommand().run({ ...REQUEST }),
				/budgetExceeded: remote-127-0-0-1-9001-copilot did not become claimable/);
		});
	});

	test('the budget guard is released once the claim succeeds', async () => {
		await gated();
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			await claimCommand().run({ ...REQUEST });
			// Draining proves the guard was disposed rather than still armed.
			await timeout(AGENT_SESSION_CLAIM_BUDGET_MS * 2);
		});
		assert.strictEqual(claimDisposeCount, 0, 'a released guard must not tear the claim down');
	});

	test('releases the claim when the window is torn down', async () => {
		const { disposables } = await gated();
		await claimCommand().run({ ...REQUEST });
		assert.strictEqual(claimDisposeCount, 0);
		disposables.dispose();
		assert.strictEqual(claimDisposeCount, 1);
	});

	suite('active session', () => {

		test('opens the exact claimed session on the ordinary sessions path', async () => {
			await gated();
			await claimCommand().run({ ...REQUEST });

			assert.deepStrictEqual(openedSessions, [{
				resource: SESSION_RESOURCE.toString(),
				options: { preserveFocus: false },
			}]);
		});

		test('opens it once, from inside the claim', async () => {
			await gated();
			await claimCommand().run({ ...REQUEST });

			assert.strictEqual(openedSessions.length, 1, 'the claim must open the session exactly once');
			assert.deepStrictEqual(activatedSessions.map(uri => uri.toString()), [SESSION_RESOURCE.toString()],
				'the activation has to complete before the claim publishes');
		});

		test('waits for the session to be listed, on the change event alone', async () => {
			// `openSession` throws for an unlisted resource.
			listedSessions.clear();
			await gated();
			const claimed = claimCommand().run({ ...REQUEST });
			await Promise.resolve();
			assert.strictEqual(openedSessions.length, 0, 'an unlisted session must not be opened');

			// The event is the only thing that can let this proceed.
			listedSessions.add(SESSION_RESOURCE.toString());
			sessionsChanged.fire({ added: [], removed: [], changed: [] });
			await claimed;
			assert.deepStrictEqual(openedSessions.map(entry => entry.resource), [SESSION_RESOURCE.toString()]);
		});

		test('a change that does not list this session does not open anything', async () => {
			listedSessions.clear();
			await gated();
			const claimed = claimCommand().run({ ...REQUEST });
			sessionsChanged.fire({ added: [], removed: [], changed: [] });
			await Promise.resolve();
			assert.strictEqual(openedSessions.length, 0, 'an unrelated change must not settle the wait');

			listedSessions.add(SESSION_RESOURCE.toString());
			sessionsChanged.fire({ added: [], removed: [], changed: [] });
			await claimed;
			assert.strictEqual(openedSessions.length, 1);
		});

		test('an already-listed session needs no event and no timer', async () => {
			await gated();
			let history: readonly RecordedTimerEvent[] = [];
			await runWithFakedTimers({ useFakeTimers: false, onHistory: recorded => { history = recorded; } }, async () => {
				await claimCommand().run({ ...REQUEST });
			});
			assert.strictEqual(openedSessions.length, 1);
			assert.deepStrictEqual(history, [], 'the budget guard must never be a success condition');
		});

		test('waits for the session to become active, not just for the open', async () => {
			// `openSession` resolving is not the signal: session-scoped tools are
			// registered off the active-session observable, so a claim that
			// returned here would publish an inventory that is about to change.
			activatesOnOpen = false;
			await gated();
			const claimed = claimCommand().run({ ...REQUEST });
			await whenOpened;
			assert.strictEqual(openedSessions.length, 1, 'the open itself must still happen');
			assert.strictEqual(activatedSessions.length, 0, 'the claim must not proceed past the open');

			activeSession.set({ resource: SESSION_RESOURCE } as IActiveSession, undefined);
			await claimed;
			assert.deepStrictEqual(activatedSessions.map(uri => uri.toString()), [SESSION_RESOURCE.toString()]);
		});

		test('another session becoming active does not satisfy the claim', async () => {
			activatesOnOpen = false;
			await gated();
			const claimed = claimCommand().run({ ...REQUEST });
			await whenOpened;
			activeSession.set({ resource: URI.from({ scheme: SESSION_TYPE, path: '/other' }) } as IActiveSession, undefined);
			assert.strictEqual(activatedSessions.length, 0, 'a different active session must not settle the wait');

			activeSession.set({ resource: SESSION_RESOURCE } as IActiveSession, undefined);
			await claimed;
			assert.strictEqual(activatedSessions.length, 1);
		});

		test('reports budgetExceeded when the session never becomes active', async () => {
			activatesOnOpen = false;
			await gated();
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				await assert.rejects(
					() => claimCommand().run({ ...REQUEST }),
					/budgetExceeded: remote-127-0-0-1-9001-copilot did not become claimable/);
			});
			assert.strictEqual(claimDisposeCount, 0);
		});

		test('reports budgetExceeded when the session is never listed', async () => {
			listedSessions.clear();
			await gated();
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				await assert.rejects(
					() => claimCommand().run({ ...REQUEST }),
					/budgetExceeded: remote-127-0-0-1-9001-copilot did not become claimable/);
			});
			assert.strictEqual(openedSessions.length, 0, 'nothing may be opened once the budget is spent');
			assert.strictEqual(claimDisposeCount, 0);
		});
	});
});
