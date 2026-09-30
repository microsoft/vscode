/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { createUnknownAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import type { IAgentHostChatContributions } from '../../common/agentHostChatContributionsService.js';
import { readSessionIsPromoted, SESSION_IS_PROMOTED_METADATA_KEY, withSessionIsPromoted } from '../../common/meta/agentSessionPromotionMeta.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { withMessageRetryOf } from '../../common/meta/agentMessageRetryMeta.js';
import { IAgentHostSessionMetadataPersistence } from '../../node/shared/persistSessionMetadata.js';
import { ActionType, type ClientChatAction } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, PendingMessageKind, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostChatContributions } from '../../node/agentHostChatContributionsService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { SessionPromotionContribution } from '../../node/chatContributions/sessionPromotion/sessionPromotionContribution.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

suite('Session promotion', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(database = new TestSessionDatabase(), logService = new NullLogService()) {
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const session = 'copilot:/automation-run';
		const chat = buildDefaultChatUri(session);
		stateManager.createSession({
			resource: session, provider: 'copilot', title: 'Automation', status: SessionStatus.Idle,
			createdAt: '2026-09-29T00:00:00Z', modifiedAt: '2026-09-29T00:00:00Z',
			_meta: { retained: 'original' },
		});
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
			[ILogService, logService],
			[IAgentHostStateManager, stateManager],
			[ISessionDataService, createSessionDataService(database)],
			[IAgentHostSessionMetadataPersistence, { _serviceBrand: undefined, persist: async (_session, values) => database.setMetadataValues(values) } satisfies IAgentHostSessionMetadataPersistence],
		), true));
		const contributions: IAgentHostChatContributions = disposables.add(new AgentHostChatContributions(logService, instantiationService));
		disposables.add(contributions.registerContribution(SessionPromotionContribution));
		const dispatch = (action: ClientChatAction, channel = chat) => {
			stateManager.dispatchClientAction(channel, action, { clientId: 'another-client', clientSeq: 1 });
			contributions.didApplyClientAction({
				session, channel, action, clientId: 'another-client',
				clientContext: createUnknownAgentHostClientTelemetryContext(AgentHostClientType.Unknown),
			});
		};
		const promoted = () => new Promise<void>(resolve => {
			const listener = stateManager.onDidEmitEnvelope(envelope => {
				if (envelope.action.type === ActionType.SessionMetaChanged && readSessionIsPromoted(envelope.action)) {
					listener.dispose();
					resolve();
				}
			});
			disposables.add(listener);
		});
		return { session, chat, stateManager, database, dispatch, promoted };
	}

	test('metadata reader accepts only the optional boolean marker', () => {
		assert.deepStrictEqual([
			readSessionIsPromoted(undefined),
			readSessionIsPromoted({ _meta: {} }),
			readSessionIsPromoted({ _meta: { [SESSION_IS_PROMOTED_METADATA_KEY]: 'true' } }),
			readSessionIsPromoted({ _meta: withSessionIsPromoted({ retained: 1 }) }),
		], [false, false, false, true]);
	});

	for (const kind of ['direct', PendingMessageKind.Queued, PendingMessageKind.Steering] as const) {
		test(`promotes after an accepted ${kind} human message in a peer chat`, async () => {
			const h = setup();
			const peer = buildChatUri(h.session, 'peer');
			h.stateManager.addChat(h.session, peer, { title: 'Peer' });
			const promoted = h.promoted();
			const message = { text: 'Follow-up', origin: { kind: MessageKind.User } };
			h.dispatch(kind === 'direct'
				? { type: ActionType.ChatTurnStarted, turnId: 'user-turn', startedAt: '2026-09-29T00:00:00Z', message }
				: { type: ActionType.ChatPendingMessageSet, kind, id: 'user-pending', message }, peer);
			await promoted;
			h.stateManager.setSessionMeta(h.session, { replacement: 'metadata' });
			assert.deepStrictEqual({
				persisted: await h.database.getMetadata(SESSION_IS_PROMOTED_METADATA_KEY),
				session: h.stateManager.getSessionState(h.session)?._meta,
				summary: h.stateManager.getSessionSummary(h.session)?._meta,
			}, {
				persisted: 'true',
				session: { replacement: 'metadata', [SESSION_IS_PROMOTED_METADATA_KEY]: true },
				summary: { replacement: 'metadata', [SESSION_IS_PROMOTED_METADATA_KEY]: true },
			});
		});
	}

	test('waits for persistence and merges concurrent metadata before publishing promotion', async () => {
		const persisted = new DeferredPromise<void>();
		class DelayedDatabase extends TestSessionDatabase {
			override async setMetadataValues(values: Readonly<Record<string, string>>): Promise<void> {
				await persisted.p;
				await super.setMetadataValues(values);
			}
		}
		const h = setup(new DelayedDatabase());
		const promoted = h.promoted();
		const message = { text: 'Queued', origin: { kind: MessageKind.User } };
		h.dispatch({ type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: 'queued', message });
		h.dispatch({ type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Steering, id: 'steering', message });
		h.stateManager.setSessionMeta(h.session, { retained: 'updated' });
		const before = readSessionIsPromoted(h.stateManager.getSessionSummary(h.session));
		await persisted.complete();
		await promoted;
		h.dispatch({ type: ActionType.ChatPendingMessageRemoved, kind: PendingMessageKind.Queued, id: 'queued' });
		h.dispatch({ type: ActionType.ChatTruncated });
		assert.deepStrictEqual({
			before,
			meta: h.stateManager.getSessionSummary(h.session)?._meta,
			writes: h.database.setMetadataCalls,
		}, {
			before: false,
			meta: { retained: 'updated', [SESSION_IS_PROMOTED_METADATA_KEY]: true },
			writes: [{ key: SESSION_IS_PROMOTED_METADATA_KEY, value: 'true' }],
		});
	});

	test('automation seeds, agent messages, drafts and queue drains do not promote', async () => {
		const h = setup();
		for (const kind of [MessageKind.Automation, MessageKind.Agent, MessageKind.SystemNotification]) {
			h.dispatch({ type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: kind, message: { text: kind, origin: { kind } } });
		}
		const message = { text: 'User', origin: { kind: MessageKind.User } };
		h.dispatch({ type: ActionType.ChatDraftChanged, draft: message });
		h.dispatch({ type: ActionType.ChatTurnStarted, turnId: 'drained', startedAt: '2026-09-29T00:00:00Z', queuedMessageId: 'legacy-queued', message });
		h.dispatch({ type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: 'retry', message: { ...message, _meta: withMessageRetryOf(undefined, 'legacy') } });
		assert.deepStrictEqual({
			promoted: readSessionIsPromoted(h.stateManager.getSessionSummary(h.session)),
			persisted: await h.database.getMetadata(SESSION_IS_PROMOTED_METADATA_KEY),
		}, { promoted: false, persisted: undefined });
	});

	test('logs persistence failures and retries across eviction without another user message', async () => {
		const failure = new DeferredPromise<void>();
		const recovered = new DeferredPromise<void>();
		const logService = new class extends NullLogService {
			override error(): void {
				void failure.complete();
			}
		};
		const database = new class extends TestSessionDatabase {
			private _fail = true;
			override async setMetadataValues(values: Readonly<Record<string, string>>): Promise<void> {
				if (this._fail) {
					this._fail = false;
					throw new Error('Database unavailable');
				}
				await super.setMetadataValues(values);
				void recovered.complete();
			}
		};
		const h = setup(database, logService);
		const message = { text: 'User', origin: { kind: MessageKind.User } };
		h.dispatch({ type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: 'first', message });
		await failure.p;
		const afterFailure = readSessionIsPromoted(h.stateManager.getSessionSummary(h.session));
		h.stateManager.removeSession(h.session);
		await recovered.p;
		const persistedAfterEviction = await h.database.getMetadata(SESSION_IS_PROMOTED_METADATA_KEY);
		h.stateManager.createSession({
			resource: h.session, provider: 'copilot', title: 'Restored', status: SessionStatus.Idle,
			createdAt: '2026-09-29T00:00:00Z', modifiedAt: '2026-09-29T00:00:00Z',
			_meta: persistedAfterEviction === 'true' ? withSessionIsPromoted(undefined) : undefined,
		});
		assert.deepStrictEqual({
			afterFailure,
			afterRetry: readSessionIsPromoted(h.stateManager.getSessionSummary(h.session)),
			persisted: persistedAfterEviction,
		}, { afterFailure: false, afterRetry: true, persisted: 'true' });
	});
});
