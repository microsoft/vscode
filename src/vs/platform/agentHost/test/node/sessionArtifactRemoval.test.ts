/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { META_GITHUB_STATE, META_PENDING_RECORDED_PULL_REQUESTS } from '../../common/agentHostGitStateService.js';
import { SessionStateMirrorFlush } from '../../common/agentHostSessionStateStore.js';
import { ArtifactServerToolName } from '../../common/serverToolNames.js';
import { SessionArtifactCollection } from '../../common/sessionArtifactCollection.js';
import { readSessionArtifacts, SessionArtifactType, stringifySessionArtifacts, withSessionArtifacts, type ISessionArtifact } from '../../common/sessionArtifacts.js';
import type { ISessionCatalogSyncAcknowledgement, ISessionCatalogSyncPendingSnapshot, ISessionDatabase, SessionCatalogSyncWriteResult, SessionCatalogSyncWriteValidator } from '../../common/sessionDataService.js';
import { ActionType, type ActionEnvelope } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri } from '../../common/state/sessionState.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { createArtifactServerToolGroup, type IArtifactServerToolAccessor } from '../../node/shared/artifactServerTools.js';
import { SessionArtifacts } from '../../node/shared/sessionArtifacts.js';
import { SESSION_ARTIFACTS_KEY } from '../../node/shared/persistSessionMetadata.js';
import type { AgentService } from '../../node/agentService.js';
import { AgentHostDatabase, type IAgentHostDatabase } from '../../node/agentHostDatabase.js';
import { decodeAgentHostCatalogPayload } from '../../node/agentHostCatalogProjection.js';
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { createTestAgentService, getTestAgentStateManager, getTestSessionStateStore, registerTestAgentProvider } from './agentServiceTestUtils.js';
import { MockAgent } from './mockAgent.js';

suite('Session Artifact Removal', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const artifacts: readonly ISessionArtifact[] = [
		{ id: 'pr', type: SessionArtifactType.PullRequest, label: 'PR', isArtifact: true, link: 'https://github.com/microsoft/vscode/pull/1', isGitHub: true },
		{ id: 'file', type: SessionArtifactType.File, label: 'Report', isArtifact: true, uri: 'file:///report.md' },
		{ id: 'reference', type: SessionArtifactType.Website, label: 'Docs', isArtifact: false, link: 'https://example.com' },
	];
	const withChat = (entries: readonly ISessionArtifact[], chat: string) => entries.map(artifact => ({
		id: artifact.id,
		chat,
		type: artifact.type,
		label: artifact.label,
		isArtifact: artifact.isArtifact,
		...(artifact.link ? { link: artifact.link } : {}),
		...(artifact.uri ? { uri: artifact.uri } : {}),
		...(artifact.commitHash ? { commitHash: artifact.commitHash } : {}),
		...(artifact.isGitHub !== undefined ? { isGitHub: artifact.isGitHub } : {}),
	}));

	function createService(database: ISessionDatabase, logService: ILogService, orchestratorDatabase?: IAgentHostDatabase): AgentService {
		const fileService = store.add(new FileService(logService));
		return store.add(createTestAgentService(logService, fileService, createSessionDataService(database), { _serviceBrand: undefined } as IProductService, createNoopGitService(),
			undefined, undefined, undefined, undefined, undefined, [], undefined, undefined, orchestratorDatabase));
	}

	async function createFixture(database: ISessionDatabase, logService: ILogService = new NullLogService(), orchestratorDatabase?: IAgentHostDatabase) {
		const service = createService(database, logService, orchestratorDatabase);
		const agent = store.add(new MockAgent('copilot'));
		registerTestAgentProvider(service, agent);
		const session = await service.createSession({ legacyChatUris: true, provider: 'copilot' });
		const stateManager = getTestAgentStateManager(service);
		const meta = withSessionArtifacts({
			...stateManager.getSessionState(session.toString())?._meta,
			[META_GITHUB_STATE]: { owner: 'microsoft', repo: 'vscode', pullRequest: { number: 1, url: artifacts[0].link } },
			unrelated: { keep: true },
		}, artifacts);
		const internals = service as unknown as {
			_createArtifactServerToolAccessor(): IArtifactServerToolAccessor;
			_orchestratorDatabase: IAgentHostDatabase;
			_whenBackgroundCatalogStateWritesIdle(session: string): Promise<void>;
		};
		const sessionStateStore = getTestSessionStateStore(service);
		// The seeded summary change is flushed and persisted before the test starts, so its background catalog write
		// never lands during the test's own writes. Tests that need that interleaving force it.
		const summaryFlushed = Event.toPromise(Event.filter(stateManager.onDidChangeSessionSummary, e => e.session === session.toString()));
		stateManager.setSessionMeta(session.toString(), meta);
		await database.setMetadata(SESSION_ARTIFACTS_KEY, stringifySessionArtifacts(artifacts));
		await summaryFlushed;
		await internals._whenBackgroundCatalogStateWritesIdle(session.toString());
		await service.whenCatalogReconciliationIdle();
		await sessionStateStore.whenIdle(session);
		/** Reads a session.db key once the session state store, which owns the key, has mirrored it there. */
		const readPersisted = async (key: string) => {
			await sessionStateStore.whenIdle(session);
			return database.getMetadata(key);
		};
		const readCentralArtifacts = async () => {
			const row = await internals._orchestratorDatabase.getSessionV2(session.toString());
			assert.ok(row);
			const decoded = decodeAgentHostCatalogPayload(row.payload);
			assert.ok(decoded.ok);
			return readSessionArtifacts(decoded.value.data._meta);
		};
		/** The artifacts as published, in central state, in session.db and in the session catalog. */
		const readStates = async () => ({
			published: stateManager.getSessionState(session.toString())?._meta,
			central: sessionStateStore.peek(session)?.values.get(SESSION_ARTIFACTS_KEY),
			persisted: await readPersisted(SESSION_ARTIFACTS_KEY),
			catalog: await readCentralArtifacts(),
		});
		return { service, agent, session, stateManager, meta, artifactAccessor: internals._createArtifactServerToolAccessor(), readCentralArtifacts, readPersisted, readStates };
	}

	/** Seeds through the session state store, the owner of the key once the session is open. */
	function seedPending(service: AgentService, session: URI, value: string): Promise<void> {
		return getTestSessionStateStore(service).writeMetadata(session, session, { [META_PENDING_RECORDED_PULL_REQUESTS]: value }, SessionStateMirrorFlush.Immediate);
	}

	function addConcurrentReference({ stateManager, session, artifactAccessor }: Awaited<ReturnType<typeof createFixture>>): Promise<string> {
		const group = createArtifactServerToolGroup({
			isEnabled: () => true,
			persist: artifactAccessor.persist,
		});
		return Promise.resolve(group.execute(stateManager, { sessionUri: session.toString(), chatUri: buildDefaultChatUri(session), turnId: 'turn' }, ArtifactServerToolName.AddArtifactOrReference, {
			type: 'website', label: 'Concurrent', isArtifact: false, link: 'https://example.com/concurrent',
		}));
	}

	test('persists removal and publishes metadata without removing independent associations or references', async () => {
		const database = store.add(await SessionDatabase.open(':memory:'));
		const { service, agent, session, stateManager, meta, readCentralArtifacts, readPersisted } = await createFixture(database);
		await database.setMetadata('unrelated', 'preserved');
		const actions: ActionEnvelope[] = [];
		store.add(service.onDidAction(envelope => {
			if (envelope.action.type === ActionType.SessionMetaChanged) {
				actions.push(envelope);
			}
		}));

		await service.removeSessionArtifact(session, 'pr');

		const remaining = withChat(artifacts.slice(1), buildDefaultChatUri(session));
		const expectedMeta = withSessionArtifacts(meta, remaining);
		assert.deepStrictEqual({
			meta: stateManager.getSessionState(session.toString())?._meta,
			metadata: { [SESSION_ARTIFACTS_KEY]: await readPersisted(SESSION_ARTIFACTS_KEY), unrelated: await database.getMetadata('unrelated') },
			actions: actions.map(envelope => ({ channel: envelope.channel, action: envelope.action })),
			modelCalls: agent.sendMessageCalls,
			centralArtifacts: await readCentralArtifacts(),
		}, {
			meta: expectedMeta,
			metadata: { [SESSION_ARTIFACTS_KEY]: stringifySessionArtifacts(remaining), unrelated: 'preserved' },
			actions: [{ channel: session.toString(), action: { type: ActionType.SessionMetaChanged, _meta: expectedMeta } }],
			modelCalls: [],
			centralArtifacts: withChat(artifacts.slice(1), buildDefaultChatUri(session)),
		});
	});

	test('removing a recorded PR cancels its pending folder association', async () => {
		const database = store.add(await SessionDatabase.open(':memory:'));
		const { service, session, readPersisted } = await createFixture(database);
		const peerChat = buildChatUri(session, 'peer');
		const peerPending = {
			chat: peerChat, folderKey: 'file:///work', workingDirectory: 'file:///work',
			url: artifacts[0].link, owner: 'microsoft', repo: 'vscode', branchName: 'feature',
		};
		await seedPending(service, session, JSON.stringify([
			{ ...peerPending, chat: buildDefaultChatUri(session) },
			peerPending,
		]));

		await service.removeSessionArtifact(session, 'pr');

		assert.deepStrictEqual({
			pending: await readPersisted(META_PENDING_RECORDED_PULL_REQUESTS),
			artifacts: readSessionArtifacts(getTestAgentStateManager(service).getSessionState(session.toString())?._meta).map(artifact => artifact.id),
		}, {
			pending: JSON.stringify([peerPending]),
			artifacts: ['file', 'reference'],
		});
	});

	test('a queued removal does not cancel the association of a replacement artifact', async () => {
		const writeStarted = new DeferredPromise<void>();
		const finishWrite = new DeferredPromise<void>();
		class DelayedDatabase extends TestSessionDatabase {
			override async setMetadataValuesAndCatalogSyncSnapshot(values: Readonly<Record<string, string>>, snapshot: ISessionCatalogSyncPendingSnapshot, validate?: SessionCatalogSyncWriteValidator): Promise<SessionCatalogSyncWriteResult> {
				if (values[SESSION_ARTIFACTS_KEY]?.includes('"replacement"')) {
					await writeStarted.complete();
					await finishWrite.p;
				}
				return super.setMetadataValuesAndCatalogSyncSnapshot(values, snapshot, validate);
			}
		}
		const database = new DelayedDatabase();
		const fixture = await createFixture(database);
		const { service, session, stateManager, artifactAccessor, readPersisted } = fixture;
		const pending = JSON.stringify([{
			chat: 'recording-chat', folderKey: 'file:///work', workingDirectory: 'file:///work',
			url: artifacts[0].link, owner: 'microsoft', repo: 'vscode', branchName: 'feature',
		}]);
		await seedPending(service, session, pending);
		const replacement = new SessionArtifacts(stateManager, session.toString(), buildDefaultChatUri(session), artifactAccessor.persist).mutate(collection =>
			new SessionArtifactCollection(collection.remove('pr').artifacts).add({
				type: SessionArtifactType.PullRequest, label: 'Replacement', isArtifact: true, link: artifacts[0].link,
			}, () => 'replacement'));
		await writeStarted.p;
		const removal = service.removeSessionArtifact(session, 'pr');
		await finishWrite.complete();
		await Promise.all([replacement, removal]);

		assert.deepStrictEqual({
			artifacts: readSessionArtifacts(stateManager.getSessionState(session.toString())?._meta).map(artifact => artifact.id),
			pending: await readPersisted(META_PENDING_RECORDED_PULL_REQUESTS),
		}, {
			artifacts: ['file', 'reference', 'replacement'],
			pending,
		});
	});

	test('reports successful removal when pending-association cleanup fails', async () => {
		class FailingCleanupDatabase extends TestSessionDatabase {
			override async applyMetadataChanges(set: Readonly<Record<string, string>>, remove: readonly string[]): Promise<void> {
				if (remove.includes(META_PENDING_RECORDED_PULL_REQUESTS)) {
					throw new Error('cleanup unavailable');
				}
				return super.applyMetadataChanges(set, remove);
			}
		}
		const warnings: string[] = [];
		class TestLogService extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}
		const database = new FailingCleanupDatabase();
		const { service, session, stateManager, readPersisted } = await createFixture(database, new TestLogService());
		const pending = {
			chat: buildDefaultChatUri(session), folderKey: 'file:///work', workingDirectory: 'file:///work',
			url: artifacts[0].link, owner: 'microsoft', repo: 'vscode', branchName: 'feature',
		};
		await seedPending(service, session, JSON.stringify([pending]));

		await service.removeSessionArtifact(session, 'pr');

		assert.deepStrictEqual({
			artifacts: readSessionArtifacts(stateManager.getSessionState(session.toString())?._meta).map(artifact => artifact.id),
			pending: await readPersisted(META_PENDING_RECORDED_PULL_REQUESTS),
			warnings,
		}, {
			artifacts: ['file', 'reference'],
			pending: JSON.stringify([pending]),
			warnings: ['[AgentService] Failed to remove pending pull request association'],
		});
	});

	test('retains a concurrent tool addition while removal is awaiting persistence', async () => {
		const writeStarted = new DeferredPromise<void>();
		const finishWrite = new DeferredPromise<void>();
		class DelayedDatabase extends TestSessionDatabase {
			delayNextArtifactWrite = false;
			override async setMetadataValuesAndCatalogSyncSnapshot(values: Readonly<Record<string, string>>, snapshot: ISessionCatalogSyncPendingSnapshot, validate?: SessionCatalogSyncWriteValidator): Promise<SessionCatalogSyncWriteResult> {
				if (this.delayNextArtifactWrite && values[SESSION_ARTIFACTS_KEY] !== undefined) {
					this.delayNextArtifactWrite = false;
					await writeStarted.complete();
					await finishWrite.p;
				}
				return super.setMetadataValuesAndCatalogSyncSnapshot(values, snapshot, validate);
			}
		}
		const database = new DelayedDatabase();
		const fixture = await createFixture(database);
		database.delayNextArtifactWrite = true;
		const { service, session, stateManager, meta } = fixture;
		let completed = false;
		const removal = service.removeSessionArtifact(session, 'pr').then(() => { completed = true; });
		await writeStarted.p;
		const latestMeta = { ...meta, unrelated: { keep: true, updated: true } };
		stateManager.setSessionMeta(session.toString(), latestMeta);
		const addition = addConcurrentReference(fixture);
		try {
			assert.deepStrictEqual({
				completed,
				meta: stateManager.getSessionState(session.toString())?._meta,
			}, {
				completed: false,
				meta: latestMeta,
			});
		} finally {
			await finishWrite.complete();
			await Promise.all([removal, addition]);
		}

		const remaining = readSessionArtifacts(stateManager.getSessionState(session.toString())?._meta);
		assert.deepStrictEqual({
			labels: remaining.map(artifact => artifact.label),
			meta: stateManager.getSessionState(session.toString())?._meta,
			persisted: await fixture.readPersisted(SESSION_ARTIFACTS_KEY),
			centralArtifacts: await fixture.readCentralArtifacts(),
		}, {
			labels: ['Report', 'Docs', 'Concurrent'],
			meta: withSessionArtifacts(latestMeta, remaining),
			persisted: stringifySessionArtifacts(remaining),
			centralArtifacts: remaining,
		});
	});

	test('keeps a rejected removal visible while preserving a queued addition and independent metadata', async () => {
		const writeStarted = new DeferredPromise<void>();
		const finishWrite = new DeferredPromise<void>();
		class FailingDelayedDatabase extends TestSessionDatabase {
			failNextArtifactWrite = false;
			override async setMetadataValuesAndCatalogSyncSnapshot(values: Readonly<Record<string, string>>, snapshot: ISessionCatalogSyncPendingSnapshot, validate?: SessionCatalogSyncWriteValidator): Promise<SessionCatalogSyncWriteResult> {
				if (this.failNextArtifactWrite && values[SESSION_ARTIFACTS_KEY] !== undefined) {
					this.failNextArtifactWrite = false;
					await writeStarted.complete();
					await finishWrite.p;
					throw new Error('artifact write failed');
				}
				return super.setMetadataValuesAndCatalogSyncSnapshot(values, snapshot, validate);
			}
		}
		const database = new FailingDelayedDatabase();
		const fixture = await createFixture(database);
		database.failNextArtifactWrite = true;
		const { service, session, stateManager, meta } = fixture;
		const publishedLabels: string[][] = [];
		store.add(service.onDidAction(envelope => {
			if (envelope.action.type === ActionType.SessionMetaChanged) {
				publishedLabels.push(readSessionArtifacts(envelope.action._meta).map(artifact => artifact.label));
			}
		}));

		const rejectedRemoval = assert.rejects(service.removeSessionArtifact(session, 'pr'), /artifact write failed/);
		await writeStarted.p;
		const latestMeta = { ...meta, unrelated: { keep: true, updated: true } };
		stateManager.setSessionMeta(session.toString(), latestMeta);
		const addition = addConcurrentReference(fixture);
		try {
			assert.deepStrictEqual(stateManager.getSessionState(session.toString())?._meta, latestMeta);
		} finally {
			await finishWrite.complete();
			await Promise.all([rejectedRemoval, addition]);
		}

		const remaining = readSessionArtifacts(stateManager.getSessionState(session.toString())?._meta);
		assert.deepStrictEqual({
			labels: remaining.map(artifact => artifact.label),
			meta: stateManager.getSessionState(session.toString())?._meta,
			persisted: await fixture.readPersisted(SESSION_ARTIFACTS_KEY),
			publishedLabels,
			centralArtifacts: await fixture.readCentralArtifacts(),
		}, {
			labels: ['PR', 'Report', 'Docs', 'Concurrent'],
			meta: withSessionArtifacts(latestMeta, remaining),
			persisted: stringifySessionArtifacts(remaining),
			publishedLabels: [['PR', 'Report', 'Docs'], ['PR', 'Report', 'Docs', 'Concurrent']],
			centralArtifacts: remaining,
		});
	});

	class FailingDatabase extends TestSessionDatabase {
		failArtifactWrites = false;
		/** Runs before the next artifact write, e.g. to interleave other work while it is in flight. */
		beforeNextArtifactWrite: (() => Promise<void>) | undefined;
		failNextAcknowledgement = false;
		override async acknowledgeCatalogSyncSnapshot(acknowledgement: ISessionCatalogSyncAcknowledgement): Promise<boolean> {
			if (this.failNextAcknowledgement) {
				this.failNextAcknowledgement = false;
				throw new Error('acknowledgement failed');
			}
			return super.acknowledgeCatalogSyncSnapshot(acknowledgement);
		}
		override async setMetadataValuesAndCatalogSyncSnapshot(values: Readonly<Record<string, string>>, snapshot: ISessionCatalogSyncPendingSnapshot, validate?: SessionCatalogSyncWriteValidator): Promise<SessionCatalogSyncWriteResult> {
			if (values[SESSION_ARTIFACTS_KEY] !== undefined) {
				const before = this.beforeNextArtifactWrite;
				this.beforeNextArtifactWrite = undefined;
				await before?.();
				if (this.failArtifactWrites) {
					throw new Error('artifact write failed');
				}
			}
			return super.setMetadataValuesAndCatalogSyncSnapshot(values, snapshot, validate);
		}
	}

	function createErrorLog() {
		const errors: string[] = [];
		class TestLogService extends NullLogService {
			override error(message: string): void { errors.push(message); }
		}
		return { errors, logService: new TestLogService() };
	}

	test('logs and propagates persistence failures without hiding the artifact and allows a durable retry', async () => {
		const { errors, logService } = createErrorLog();
		const database = new FailingDatabase();
		const { service, session, meta, readStates } = await createFixture(database, logService);
		const before = await readStates();
		database.failArtifactWrites = true;

		await assert.rejects(service.removeSessionArtifact(session, 'pr'), /artifact write failed/);
		const afterFailure = await readStates();
		database.failArtifactWrites = false;
		await service.removeSessionArtifact(session, 'pr');
		await service.removeSessionArtifact(session, 'pr');

		const remaining = withChat(artifacts.slice(1), buildDefaultChatUri(session));
		assert.deepStrictEqual({ errors, afterFailure, afterRetry: await readStates() }, {
			errors: ['[AgentService] Failed to persist session artifacts'],
			// The failed removal is rolled back: central state, session.db and the catalog still match what is published.
			afterFailure: before,
			afterRetry: {
				published: withSessionArtifacts(meta, remaining),
				central: stringifySessionArtifacts(remaining),
				persisted: stringifySessionArtifacts(remaining),
				catalog: remaining,
			},
		});
	});

	test('a failed removal stays consistent when a background write lands while it is persisting', async () => {
		const { errors, logService } = createErrorLog();
		const database = new FailingDatabase();
		const { service, session, stateManager, meta, readStates } = await createFixture(database, logService);
		const latestMeta = { ...meta, unrelated: { keep: true, updated: true } };
		database.failArtifactWrites = true;
		// A summary change is flushed while the removal is persisting, queueing a background write behind it.
		database.beforeNextArtifactWrite = async () => {
			const summaryFlushed = Event.toPromise(stateManager.onDidChangeSessionSummary);
			stateManager.setSessionMeta(session.toString(), latestMeta);
			await summaryFlushed;
		};

		await assert.rejects(service.removeSessionArtifact(session, 'pr'), /artifact write failed/);
		const afterFailure = await readStates();
		database.failArtifactWrites = false;
		await service.removeSessionArtifact(session, 'pr');

		const all = withChat(artifacts, buildDefaultChatUri(session));
		const remaining = withChat(artifacts.slice(1), buildDefaultChatUri(session));
		assert.deepStrictEqual({
			errors,
			afterFailure: {
				published: afterFailure.published,
				central: JSON.parse(afterFailure.central ?? 'null'),
				mirrorsCentral: afterFailure.persisted === afterFailure.central,
				catalog: afterFailure.catalog,
			},
			afterRetry: await readStates(),
		}, {
			errors: ['[AgentService] Failed to persist session artifacts'],
			afterFailure: { published: latestMeta, central: all, mirrorsCentral: true, catalog: all },
			afterRetry: {
				published: withSessionArtifacts(latestMeta, remaining),
				central: stringifySessionArtifacts(remaining),
				persisted: stringifySessionArtifacts(remaining),
				catalog: remaining,
			},
		});
	});

	/** Starts a new service on the same databases, as a host does after a restart, and reads the artifacts it recovers. */
	async function restartAndRead(database: ISessionDatabase, orchestratorDatabase: IAgentHostDatabase, agent: MockAgent, session: URI) {
		const restarted = createService(database, new NullLogService(), orchestratorDatabase);
		// The provider keeps its sessions across the restart.
		registerTestAgentProvider(restarted, agent);
		// The pass a host schedules once its startup settles.
		await (restarted as unknown as { _catalogReconciliationService: { runPass(): Promise<unknown> } })._catalogReconciliationService.runPass();
		await restarted.whenCatalogReconciliationIdle();
		const listed = (await restarted.listSessions()).find(candidate => candidate.session.toString() === session.toString());
		await restarted.restoreSession(session);
		const restartedStore = getTestSessionStateStore(restarted);
		await restartedStore.whenIdle(session);
		const row = await orchestratorDatabase.getSessionV2(session.toString());
		const decoded = row && decodeAgentHostCatalogPayload(row.payload);
		return {
			listed: readSessionArtifacts(listed?._meta),
			restored: readSessionArtifacts(getTestAgentStateManager(restarted).getSessionState(session.toString())?._meta),
			central: JSON.parse(restartedStore.peek(session)?.values.get(SESSION_ARTIFACTS_KEY) ?? 'null'),
			persisted: JSON.parse(await database.getMetadata(SESSION_ARTIFACTS_KEY) ?? 'null'),
			catalog: decoded?.ok ? readSessionArtifacts(decoded.value.data._meta) : undefined,
		};
	}

	test('a crash between the owned write and its rollback recovers to one consistent state', async () => {
		const database = new FailingDatabase();
		const orchestratorDatabase = store.add(new AgentHostDatabase(':memory:'));
		const { service, agent, session } = await createFixture(database, new NullLogService(), orchestratorDatabase);
		const crashed = new DeferredPromise<void>();
		const writeStarted = new DeferredPromise<void>();
		database.failArtifactWrites = true;
		// The process dies while the removal's catalog write is in flight: its owned write is durable, no rollback runs.
		database.beforeNextArtifactWrite = async () => {
			await writeStarted.complete();
			await crashed.p;
		};
		const removal = service.removeSessionArtifact(session, 'pr');
		await writeStarted.p;

		database.failArtifactWrites = false;
		const recovered = await restartAndRead(database, orchestratorDatabase, agent, session);
		crashed.error(new Error('artifact write failed'));
		await assert.rejects(removal, /artifact write failed/);

		// The owned write marked the catalog payload dirty in the same agent-host.db transaction as central state, and
		// session.db's mirror is repaired from central state: recovery rolls the removal forward everywhere.
		const remaining = withChat(artifacts.slice(1), buildDefaultChatUri(session));
		assert.deepStrictEqual(recovered, { listed: remaining, restored: remaining, central: remaining, persisted: remaining, catalog: remaining });
	});

	test('rolls back a failed removal whose owned write failed only to record its mirror', async () => {
		class MirrorAcknowledgementFailingDatabase extends AgentHostDatabase {
			failNextMirrorAcknowledgement = false;
			override async markSessionStateLegacyMirrored(...args: Parameters<AgentHostDatabase['markSessionStateLegacyMirrored']>): Promise<boolean> {
				if (this.failNextMirrorAcknowledgement) {
					this.failNextMirrorAcknowledgement = false;
					throw new Error('mirror acknowledgement failed');
				}
				return super.markSessionStateLegacyMirrored(...args);
			}
		}
		const { errors, logService } = createErrorLog();
		const database = new FailingDatabase();
		const orchestratorDatabase = store.add(new MirrorAcknowledgementFailingDatabase(':memory:'));
		const { service, session, meta, readStates } = await createFixture(database, logService, orchestratorDatabase);
		const before = await readStates();
		// The owned write commits central state and session.db, then fails to record that the mirror is current.
		orchestratorDatabase.failNextMirrorAcknowledgement = true;
		database.failArtifactWrites = true;

		await assert.rejects(service.removeSessionArtifact(session, 'pr'), /artifact write failed/);
		const afterFailure = await readStates();
		database.failArtifactWrites = false;
		await service.removeSessionArtifact(session, 'pr');

		const remaining = withChat(artifacts.slice(1), buildDefaultChatUri(session));
		assert.deepStrictEqual({ errors, afterFailure, afterRetry: await readStates() }, {
			errors: ['[AgentService] Failed to persist session artifacts'],
			afterFailure: before,
			afterRetry: {
				published: withSessionArtifacts(meta, remaining),
				central: stringifySessionArtifacts(remaining),
				persisted: stringifySessionArtifacts(remaining),
				catalog: remaining,
			},
		});
	});

	test('a removal whose catalog committed but whose receipt acknowledgement failed is persisted, also across a restart', async () => {
		const { errors, logService } = createErrorLog();
		const database = new FailingDatabase();
		const orchestratorDatabase = store.add(new AgentHostDatabase(':memory:'));
		const { service, agent, session, meta, readStates } = await createFixture(database, logService, orchestratorDatabase);
		// The catalog row is upserted; only recording that in session.db's receipt fails.
		database.failNextAcknowledgement = true;

		const outcome = await service.removeSessionArtifact(session, 'pr').then(() => 'persisted', error => `failed: ${error.message}`);
		const afterRemoval = await readStates();
		const recovered = await restartAndRead(database, orchestratorDatabase, agent, session);

		// Every state, before and after the restart, agrees with the outcome the caller saw.
		const remaining = withChat(artifacts.slice(1), buildDefaultChatUri(session));
		assert.deepStrictEqual({ outcome, errors, afterRemoval, recovered, receipt: (await database.getCatalogSyncSnapshot())?.state }, {
			outcome: 'persisted',
			errors: [],
			afterRemoval: {
				published: withSessionArtifacts(meta, remaining),
				central: stringifySessionArtifacts(remaining),
				persisted: stringifySessionArtifacts(remaining),
				catalog: remaining,
			},
			recovered: { listed: remaining, restored: remaining, central: remaining, persisted: remaining, catalog: remaining },
			receipt: 'acknowledged',
		});
	});

	test('serializes overlapping user removals against the latest committed collection', async () => {
		const database = store.add(await SessionDatabase.open(':memory:'));
		const { service, session, stateManager, meta, readPersisted } = await createFixture(database);
		await Promise.all([
			service.removeSessionArtifact(session, 'pr'),
			service.removeSessionArtifact(session, 'file'),
		]);
		assert.deepStrictEqual({
			meta: stateManager.getSessionState(session.toString())?._meta,
			persisted: await readPersisted(SESSION_ARTIFACTS_KEY),
		}, {
			meta: withSessionArtifacts(meta, withChat(artifacts.slice(2), buildDefaultChatUri(session))),
			persisted: stringifySessionArtifacts(withChat(artifacts.slice(2), buildDefaultChatUri(session))),
		});
	});

	test('removing an already-absent id is idempotent and leaves the collection unchanged', async () => {
		const database = store.add(await SessionDatabase.open(':memory:'));
		const { service, session, stateManager, meta, readPersisted } = await createFixture(database);
		await service.removeSessionArtifact(session, 'pr');
		const afterFirstRemoval = stateManager.getSessionState(session.toString())?._meta;
		// The same id removed again, and one that was never recorded, are both no-ops.
		await service.removeSessionArtifact(session, 'pr');
		await service.removeSessionArtifact(session, 'never-recorded');
		assert.deepStrictEqual({
			meta: stateManager.getSessionState(session.toString())?._meta,
			persisted: await readPersisted(SESSION_ARTIFACTS_KEY),
		}, {
			meta: afterFirstRemoval,
			persisted: stringifySessionArtifacts(withChat(artifacts.slice(1), buildDefaultChatUri(session))),
		});
		assert.deepStrictEqual(stateManager.getSessionState(session.toString())?._meta, withSessionArtifacts(meta, withChat(artifacts.slice(1), buildDefaultChatUri(session))));
	});

	test('keeps a removal durable when a summary change is flushed while it is persisting', async () => {
		const writeStarted = new DeferredPromise<void>();
		const finishWrite = new DeferredPromise<void>();
		class DelayedDatabase extends TestSessionDatabase {
			delayNextArtifactWrite = false;
			override async setMetadataValuesAndCatalogSyncSnapshot(values: Readonly<Record<string, string>>, snapshot: ISessionCatalogSyncPendingSnapshot, validate?: SessionCatalogSyncWriteValidator): Promise<SessionCatalogSyncWriteResult> {
				if (this.delayNextArtifactWrite && values[SESSION_ARTIFACTS_KEY] !== undefined) {
					this.delayNextArtifactWrite = false;
					await writeStarted.complete();
					await finishWrite.p;
				}
				return super.setMetadataValuesAndCatalogSyncSnapshot(values, snapshot, validate);
			}
		}
		const warnings: string[] = [];
		class TestLogService extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}
		const database = new DelayedDatabase();
		const fixture = await createFixture(database, new TestLogService());
		database.delayNextArtifactWrite = true;
		const { service, session, stateManager, meta } = fixture;
		const removal = service.removeSessionArtifact(session, 'pr');
		await writeStarted.p;
		// The flushed summary still lists the removed artifact, because the removal is published only once persisted.
		const latestMeta = { ...meta, unrelated: { keep: true, updated: true } };
		const summaryFlushed = Event.toPromise(stateManager.onDidChangeSessionSummary);
		stateManager.setSessionMeta(session.toString(), latestMeta);
		await summaryFlushed;
		await finishWrite.complete();
		await removal;

		const remaining = withChat(artifacts.slice(1), buildDefaultChatUri(session));
		assert.deepStrictEqual({
			meta: stateManager.getSessionState(session.toString())?._meta,
			persisted: await fixture.readPersisted(SESSION_ARTIFACTS_KEY),
			centralArtifacts: await fixture.readCentralArtifacts(),
			warnings,
		}, {
			meta: withSessionArtifacts(latestMeta, remaining),
			persisted: stringifySessionArtifacts(remaining),
			centralArtifacts: remaining,
			warnings: [],
		});
	});

	test('rejects empty ids without changing metadata', async () => {
		const database = new TestSessionDatabase();
		const { service, session, stateManager, meta } = await createFixture(database);
		await assert.rejects(service.removeSessionArtifact(session, ' '), /artifactId must be a non-empty string/);
		assert.deepStrictEqual(stateManager.getSessionState(session.toString())?._meta, meta);
	});
});
