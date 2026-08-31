/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionInfo, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { SessionInputRequestKind, ToolCallStatus } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { EvaluationSessionActiveClientPublicationState, EvaluationSessionAttachmentService } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/evaluationSessionAttachmentService.js';
import { ISession } from '../../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent } from '../../../../../services/sessions/common/sessionsManagement.js';
import { EvaluationSessionAttachmentLifecycle, IEvaluationSessionAttachmentStartupServices, parseEvaluationSessionResource, resolveEvaluationSessionIdentity, startEvaluationSessionAttachment } from '../../browser/evaluationSessionAttachment.js';

suite('EvaluationSessionAttachment', () => {
	const disposables = new DisposableStore();
	const resource = URI.parse('remote-eval_host-copilot:/session-1');
	const backendSession = URI.parse('ahp-session:/session-1');

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(): ISession {
		return { resource, backendUri: backendSession } as unknown as ISession;
	}

	function createServices(options?: {
		session?: ISession;
		restoreComplete?: boolean;
		trusted?: boolean;
		canOpen?: () => Promise<boolean>;
		open?: () => Promise<void>;
		whenWorkbenchRestored?: Promise<void>;
		reconcileClientToolSets?: () => void;
	}) {
		const changes = disposables.add(new Emitter<ISessionsChangeEvent>());
		const activeSession = observableValue<ISession | undefined>('activeSession', undefined);
		const initialRestoreComplete = observableValue('initialRestoreComplete', options?.restoreComplete ?? true);
		const attachmentService = new EvaluationSessionAttachmentService();
		const connection = {} as IAgentConnection;
		let session = options?.session;
		let opened = 0;
		let trustChecks = 0;
		const services: IEvaluationSessionAttachmentStartupServices = {
			sessionsManagementService: {
				getSession: candidate => session?.resource.toString() === candidate.toString() ? session : undefined,
				onDidChangeSessions: changes.event,
			},
			sessionsService: {
				activeSession,
				initialRestoreComplete,
				canOpenSession: async candidate => {
					assert.strictEqual(candidate, session);
					trustChecks++;
					return options?.canOpen ? options.canOpen() : options?.trusted ?? true;
				},
				openSession: async candidate => {
					assert.strictEqual(candidate.toString(), resource.toString());
					opened++;
					if (options?.open) {
						await options.open();
					} else if (session) {
						activeSession.set(session, undefined);
					}
				},
			},
			connectionsService: {
				connections: [{
					authority: 'eval_host',
					address: 'eval-host',
					name: 'Evaluation host',
					isAmbient: false,
					connection,
				}] satisfies IAgentHostConnectionInfo[],
				resolveSessionResource: candidate => candidate.toString() === resource.toString()
					? { connection, backendSession: URI.parse('copilot:/session-1') } satisfies IAgentHostSessionResolution
					: undefined,
			},
			attachmentService,
			whenWorkbenchRestored: options?.whenWorkbenchRestored ?? Promise.resolve(),
			reconcileClientToolSets: options?.reconcileClientToolSets ?? (() => { }),
		};
		return {
			services,
			attachmentService,
			activeSession,
			initialRestoreComplete,
			setSession(value: ISession) {
				session = value;
				changes.fire({ added: [value], removed: [], changed: [] });
			},
			get opened() { return opened; },
			get trustChecks() { return trustChecks; },
		};
	}

	const pendingRequest = (clientId = 'client-1', status = ToolCallStatus.PendingConfirmation) => ({
		kind: SessionInputRequestKind.ToolClientExecution,
		clientId,
		toolCall: { status },
	});

	function createContribution(services: IEvaluationSessionAttachmentStartupServices, errors: Error[]): EvaluationSessionAttachmentLifecycle {
		return new EvaluationSessionAttachmentLifecycle(resource.toString(), () => services, error => errors.push(error));
	}

	test('no flag returns before service access and service is empty', async () => {
		let accessed = false;
		const result = await startEvaluationSessionAttachment(undefined, () => {
			accessed = true;
			throw new Error('unreachable');
		}, CancellationToken.None);
		const service = new EvaluationSessionAttachmentService();

		assert.strictEqual(result, undefined);
		assert.strictEqual(accessed, false);
		assert.strictEqual(service.shouldDeferConfirmation({
			connectionAuthority: 'eval_host', backendSession, clientId: 'client-1',
		}, pendingRequest()), false);
	});

	test('rejects malformed and noncanonical remote session URIs before service access', async () => {
		for (const value of [
			'not a uri',
			'copilot:/session-1',
			'remote-eval_host-copilot://authority/session-1',
			'remote-eval_host-copilot:/session-1/child',
			'remote-eval_host-copilot:/session-1?query',
			'REMOTE-eval_host-copilot:/session-1',
		]) {
			let accessed = false;
			await assert.rejects(() => startEvaluationSessionAttachment(value, () => {
				accessed = true;
				throw new Error('unreachable');
			}, CancellationToken.None));
			assert.strictEqual(accessed, false, value);
		}
		assert.strictEqual(parseEvaluationSessionResource(resource.toString()).toString(), resource.toString());
	});

	test('waits for restore, exact listing, and trust before registering ahead of open and active', async () => {
		const session = createSession();
		let attachedDuringTrust = false;
		let attachedDuringOpen = false;
		const harness = createServices({
			restoreComplete: false,
			canOpen: async () => {
				attachedDuringTrust = harness.attachmentService.shouldDeferConfirmation({
					connectionAuthority: 'eval_host', backendSession, clientId: 'client-1',
				}, pendingRequest());
				return true;
			},
			open: async () => {
				attachedDuringOpen = harness.attachmentService.shouldDeferConfirmation({
					connectionAuthority: 'eval_host', backendSession, clientId: 'client-1',
				}, pendingRequest());
			},
		});

		const pending = startEvaluationSessionAttachment(resource.toString(), () => harness.services, CancellationToken.None);

		await timeout(0);
		assert.strictEqual(harness.trustChecks, 0);
		harness.initialRestoreComplete.set(true, undefined);
		await timeout(0);
		harness.setSession(session);
		await timeout(0);
		assert.deepStrictEqual({ trustChecks: harness.trustChecks, opened: harness.opened }, { trustChecks: 1, opened: 1 });
		assert.strictEqual(harness.attachmentService.shouldDeferConfirmation({
			connectionAuthority: 'eval_host', backendSession, clientId: 'client-1',
		}, pendingRequest()), true);
		assert.strictEqual(attachedDuringTrust, false);
		assert.strictEqual(attachedDuringOpen, true);

		harness.activeSession.set(session, undefined);
		const registration = await pending;
		assert.ok(registration);
		assert.strictEqual(harness.attachmentService.shouldDeferConfirmation({
			connectionAuthority: 'eval_host', backendSession, clientId: 'client-1',
		}, pendingRequest()), true);
		registration!.dispose();
		assert.strictEqual(harness.attachmentService.shouldDeferConfirmation({
			connectionAuthority: 'eval_host', backendSession, clientId: 'client-1',
		}, pendingRequest()), false);
	});

	test('attachment publication readiness is scoped to the exact generation', async () => {
		const service = new EvaluationSessionAttachmentService();
		const identity = { connectionAuthority: 'eval_host', backendSession };
		const otherIdentity = { connectionAuthority: 'eval_host', backendSession: URI.parse('ahp-session:/other') };
		const first = service.attach(identity);
		assert.strictEqual(service.getActiveClientPublicationState(identity), EvaluationSessionActiveClientPublicationState.Pending);
		assert.strictEqual(service.waitForActiveClientPublicationReady(otherIdentity, CancellationToken.None), undefined);

		const firstWait = service.waitForActiveClientPublicationReady(identity, CancellationToken.None);
		assert.ok(firstWait);
		first.markActiveClientPublicationReady();
		assert.strictEqual(await firstWait, true);
		assert.strictEqual(service.getActiveClientPublicationState(identity), EvaluationSessionActiveClientPublicationState.Ready);

		first.dispose();
		const second = service.attach(identity);
		first.markActiveClientPublicationReady();
		assert.strictEqual(service.getActiveClientPublicationState(identity), EvaluationSessionActiveClientPublicationState.Pending);
		const replacementWait = service.waitForActiveClientPublicationReady(identity, CancellationToken.None);
		second.dispose();
		assert.strictEqual(await replacementWait, false);

		const cancelled = service.attach(identity);
		const source = disposables.add(new CancellationTokenSource());
		const cancelledWait = service.waitForActiveClientPublicationReady(identity, source.token);
		source.cancel();
		assert.strictEqual(await cancelledWait, false);
		cancelled.dispose();
	});

	test('marks publication ready only after active session, restored contributions, and client tool-set reconciliation', async () => {
		const restored = new DeferredPromise<void>();
		const events: string[] = [];
		const harness = createServices({
			session: createSession(),
			whenWorkbenchRestored: restored.p,
			open: async () => {
				events.push('open');
				harness.activeSession.set(createSession(), undefined);
			},
			reconcileClientToolSets: () => events.push('reconcile'),
		});
		const pending = startEvaluationSessionAttachment(resource.toString(), () => harness.services, CancellationToken.None);
		await timeout(0);
		assert.deepStrictEqual(events, ['open']);
		assert.strictEqual(harness.attachmentService.getActiveClientPublicationState({
			connectionAuthority: 'eval_host', backendSession,
		}), EvaluationSessionActiveClientPublicationState.Pending);

		restored.complete();
		const registration = await pending;
		assert.deepStrictEqual(events, ['open', 'reconcile']);
		assert.strictEqual(harness.attachmentService.getActiveClientPublicationState({
			connectionAuthority: 'eval_host', backendSession,
		}), EvaluationSessionActiveClientPublicationState.Ready);
		registration?.dispose();
	});

	test('publication preparation failure releases the pending attachment', async () => {
		const harness = createServices({
			session: createSession(),
			reconcileClientToolSets: () => { throw new Error('reconcile failed'); },
		});
		await assert.rejects(startEvaluationSessionAttachment(resource.toString(), () => harness.services, CancellationToken.None), /reconcile failed/);
		assert.strictEqual(harness.attachmentService.getActiveClientPublicationState({
			connectionAuthority: 'eval_host', backendSession,
		}), undefined);
	});

	test('uses exact connection authority and provider-mapped backend identity', () => {
		const session = createSession();
		const harness = createServices({ session });
		const identity = resolveEvaluationSessionIdentity(resource, session, harness.services.connectionsService);
		assert.deepStrictEqual({
			connectionAuthority: identity.connectionAuthority,
			backendSession: identity.backendSession.toString(),
		}, {
			connectionAuthority: 'eval_host',
			backendSession: 'ahp-session:/session-1',
		});
		assert.throws(() => resolveEvaluationSessionIdentity(
			URI.parse('remote-other-copilot:/session-1'), session, harness.services.connectionsService,
		));
	});

	test('trust, open, cancellation, and active mismatch failures do not retain registration', async () => {
		const identity = { connectionAuthority: 'eval_host', backendSession, clientId: 'client-1' };
		const untrusted = createServices({ session: createSession(), trusted: false });
		await assert.rejects(startEvaluationSessionAttachment(resource.toString(), () => untrusted.services, CancellationToken.None), /not trusted/);
		assert.strictEqual(untrusted.attachmentService.shouldDeferConfirmation(identity, pendingRequest()), false);

		const failedOpen = createServices({ session: createSession(), open: async () => { throw new Error('open failed'); } });
		await assert.rejects(startEvaluationSessionAttachment(resource.toString(), () => failedOpen.services, CancellationToken.None), /open failed/);
		assert.strictEqual(failedOpen.attachmentService.shouldDeferConfirmation(identity, pendingRequest()), false);

		const cancelled = createServices();
		const source = disposables.add(new CancellationTokenSource());
		const waiting = startEvaluationSessionAttachment(resource.toString(), () => cancelled.services, source.token);
		source.cancel();
		await assert.rejects(waiting);
		assert.strictEqual(cancelled.attachmentService.shouldDeferConfirmation(identity, pendingRequest()), false);

		const mismatched = createServices({
			session: createSession(), open: async () => {
				mismatched.activeSession.set({ resource: URI.parse('remote-eval_host-copilot:/other') } as ISession, undefined);
			}
		});
		await assert.rejects(startEvaluationSessionAttachment(resource.toString(), () => mismatched.services, CancellationToken.None), /different session/);
		assert.strictEqual(mismatched.attachmentService.shouldDeferConfirmation(identity, pendingRequest()), false);
	});

	test('session listing wait has no product timeout', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const harness = createServices();
		const pending = startEvaluationSessionAttachment(resource.toString(), () => harness.services, CancellationToken.None);
		await timeout(30_001);
		harness.setSession(createSession());

		const registration = await pending;
		assert.ok(registration);
		registration!.dispose();
	}));

	test('active session change detaches and reports failure', async () => {
		const session = createSession();
		const harness = createServices({ session });
		let failure: Error | undefined;
		const registration = await startEvaluationSessionAttachment(
			resource.toString(), () => harness.services, CancellationToken.None, error => failure = error,
		);
		assert.ok(registration);

		harness.activeSession.set(undefined, undefined);
		assert.match(failure?.message ?? '', /active evaluation session changed/i);
		assert.strictEqual(harness.attachmentService.shouldDeferConfirmation({
			connectionAuthority: 'eval_host', backendSession, clientId: 'client-1',
		}, pendingRequest()), false);
	});

	test('contribution disposal cancels while waiting without later opening', async () => {
		const harness = createServices();
		const errors: Error[] = [];
		const contribution = createContribution(harness.services, errors);
		await timeout(0);

		contribution.dispose();
		harness.setSession(createSession());
		await timeout(0);

		assert.strictEqual(harness.opened, 0);
		assert.deepStrictEqual(errors, []);
		assert.strictEqual(harness.attachmentService.shouldDeferConfirmation({
			connectionAuthority: 'eval_host', backendSession, clientId: 'client-1',
		}, pendingRequest()), false);
	});

	test('contribution disposal clears provisional and resolved attachment', async () => {
		const open = new DeferredPromise<void>();
		const opening = createServices({ session: createSession(), open: async () => open.p });
		const openingContribution = createContribution(opening.services, []);
		await timeout(0);
		assert.strictEqual(opening.attachmentService.shouldDeferConfirmation({
			connectionAuthority: 'eval_host', backendSession, clientId: 'client-1',
		}, pendingRequest()), true);

		openingContribution.dispose();
		open.complete();
		await timeout(0);
		assert.strictEqual(opening.attachmentService.shouldDeferConfirmation({
			connectionAuthority: 'eval_host', backendSession, clientId: 'client-1',
		}, pendingRequest()), false);

		const resolved = createServices({ session: createSession() });
		const resolvedContribution = createContribution(resolved.services, []);
		await timeout(0);
		assert.strictEqual(resolved.attachmentService.shouldDeferConfirmation({
			connectionAuthority: 'eval_host', backendSession, clientId: 'client-1',
		}, pendingRequest()), true);
		resolvedContribution.dispose();
		assert.strictEqual(resolved.attachmentService.shouldDeferConfirmation({
			connectionAuthority: 'eval_host', backendSession, clientId: 'client-1',
		}, pendingRequest()), false);
	});

	test('predicate requires exact backend, authority, client, and pending status', () => {
		const service = new EvaluationSessionAttachmentService();
		disposables.add(service.attach({ connectionAuthority: 'eval_host', backendSession }));
		const identity = { connectionAuthority: 'eval_host', backendSession, clientId: 'client-1' };

		assert.strictEqual(service.shouldDeferConfirmation(identity, pendingRequest()), true);
		assert.strictEqual(service.shouldDeferConfirmation({ ...identity, connectionAuthority: 'other' }, pendingRequest()), false);
		assert.strictEqual(service.shouldDeferConfirmation({ ...identity, backendSession: URI.parse('ahp-session:/other') }, pendingRequest()), false);
		assert.strictEqual(service.shouldDeferConfirmation(identity, pendingRequest('other-client')), false);
		assert.strictEqual(service.shouldDeferConfirmation(identity, pendingRequest('client-1', ToolCallStatus.Running)), false);
	});
});
