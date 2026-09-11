/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { META_GITHUB_STATE } from '../../common/agentHostGitStateService.js';
import { ArtifactServerToolName } from '../../common/serverToolNames.js';
import { readSessionArtifacts, SessionArtifactType, stringifySessionArtifacts, withSessionArtifacts, type ISessionArtifact } from '../../common/sessionArtifacts.js';
import type { ISessionCatalogSyncPendingSnapshot, ISessionDatabase, SessionCatalogSyncWriteResult } from '../../common/sessionDataService.js';
import { ActionType, type ActionEnvelope } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { createArtifactServerToolGroup, type IArtifactServerToolAccessor } from '../../node/shared/artifactServerTools.js';
import { SESSION_ARTIFACTS_KEY } from '../../node/shared/persistSessionMetadata.js';
import type { IAgentHostDatabase } from '../../node/agentHostDatabase.js';
import { decodeAgentHostCatalogPayload } from '../../node/agentHostCatalogProjection.js';
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { createTestAgentService, getTestAgentStateManager, registerTestAgentProvider } from './agentServiceTestUtils.js';
import { MockAgent } from './mockAgent.js';

suite('Session Artifact Removal', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const artifacts: readonly ISessionArtifact[] = [
		{ id: 'pr', type: SessionArtifactType.PullRequest, label: 'PR', isArtifact: true, link: 'https://github.com/microsoft/vscode/pull/1', isGitHub: true },
		{ id: 'file', type: SessionArtifactType.File, label: 'Report', isArtifact: true, uri: 'file:///report.md' },
		{ id: 'reference', type: SessionArtifactType.Website, label: 'Docs', isArtifact: false, link: 'https://example.com' },
	];

	async function createFixture(database: ISessionDatabase, logService = new NullLogService()) {
		const sessionDataService = createSessionDataService(database);
		const fileService = store.add(new FileService(logService));
		const service = store.add(createTestAgentService(logService, fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
		const agent = store.add(new MockAgent('copilot'));
		registerTestAgentProvider(service, agent);
		const session = await service.createSession({ provider: 'copilot' });
		const stateManager = getTestAgentStateManager(service);
		const meta = withSessionArtifacts({
			...stateManager.getSessionState(session.toString())?._meta,
			[META_GITHUB_STATE]: { owner: 'microsoft', repo: 'vscode', pullRequest: { number: 1, url: artifacts[0].link } },
			unrelated: { keep: true },
		}, artifacts);
		stateManager.setSessionMeta(session.toString(), meta);
		await database.setMetadata(SESSION_ARTIFACTS_KEY, stringifySessionArtifacts(artifacts));
		await service.whenCatalogReconciliationIdle();
		const internals = service as unknown as {
			_createArtifactServerToolAccessor(): IArtifactServerToolAccessor;
			_orchestratorDatabase: IAgentHostDatabase;
		};
		const readCentralArtifacts = async () => {
			const row = await internals._orchestratorDatabase.getSessionV2(session.toString());
			assert.ok(row);
			const decoded = decodeAgentHostCatalogPayload(row.payload);
			assert.ok(decoded.ok);
			return readSessionArtifacts(decoded.value.data._meta);
		};
		return { service, agent, session, stateManager, meta, artifactAccessor: internals._createArtifactServerToolAccessor(), readCentralArtifacts };
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
		const { service, agent, session, stateManager, meta, readCentralArtifacts } = await createFixture(database);
		await database.setMetadata('unrelated', 'preserved');
		const actions: ActionEnvelope[] = [];
		store.add(service.onDidAction(envelope => {
			if (envelope.action.type === ActionType.SessionMetaChanged) {
				actions.push(envelope);
			}
		}));

		await service.removeSessionArtifact(session, 'pr');

		const expectedMeta = withSessionArtifacts(meta, artifacts.slice(1));
		assert.deepStrictEqual({
			meta: stateManager.getSessionState(session.toString())?._meta,
			metadata: await database.getMetadataObject({ [SESSION_ARTIFACTS_KEY]: undefined, unrelated: undefined }),
			actions: actions.map(envelope => ({ channel: envelope.channel, action: envelope.action })),
			modelCalls: agent.sendMessageCalls,
			centralArtifacts: await readCentralArtifacts(),
		}, {
			meta: expectedMeta,
			metadata: { [SESSION_ARTIFACTS_KEY]: stringifySessionArtifacts(artifacts.slice(1)), unrelated: 'preserved' },
			actions: [{ channel: session.toString(), action: { type: ActionType.SessionMetaChanged, _meta: expectedMeta } }],
			modelCalls: [],
			centralArtifacts: artifacts.slice(1),
		});
	});

	test('retains a concurrent tool addition while removal is awaiting persistence', async () => {
		const writeStarted = new DeferredPromise<void>();
		const finishWrite = new DeferredPromise<void>();
		class DelayedDatabase extends TestSessionDatabase {
			delayNextArtifactWrite = false;
			override async setMetadataValuesAndCatalogSyncSnapshot(values: Readonly<Record<string, string>>, snapshot: ISessionCatalogSyncPendingSnapshot): Promise<SessionCatalogSyncWriteResult> {
				if (this.delayNextArtifactWrite && values[SESSION_ARTIFACTS_KEY] !== undefined) {
					this.delayNextArtifactWrite = false;
					await writeStarted.complete();
					await finishWrite.p;
				}
				return super.setMetadataValuesAndCatalogSyncSnapshot(values, snapshot);
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
			persisted: await database.getMetadata(SESSION_ARTIFACTS_KEY),
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
			override async setMetadataValuesAndCatalogSyncSnapshot(values: Readonly<Record<string, string>>, snapshot: ISessionCatalogSyncPendingSnapshot): Promise<SessionCatalogSyncWriteResult> {
				if (this.failNextArtifactWrite && values[SESSION_ARTIFACTS_KEY] !== undefined) {
					this.failNextArtifactWrite = false;
					await writeStarted.complete();
					await finishWrite.p;
					throw new Error('artifact write failed');
				}
				return super.setMetadataValuesAndCatalogSyncSnapshot(values, snapshot);
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
			persisted: await database.getMetadata(SESSION_ARTIFACTS_KEY),
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

	test('logs and propagates persistence failures without hiding the artifact and allows a durable retry', async () => {
		class FailingDatabase extends TestSessionDatabase {
			failArtifactWrites = false;
			override async setMetadataValuesAndCatalogSyncSnapshot(values: Readonly<Record<string, string>>, snapshot: ISessionCatalogSyncPendingSnapshot): Promise<SessionCatalogSyncWriteResult> {
				if (this.failArtifactWrites && values[SESSION_ARTIFACTS_KEY] !== undefined) {
					throw new Error('artifact write failed');
				}
				return super.setMetadataValuesAndCatalogSyncSnapshot(values, snapshot);
			}
		}
		const errors: string[] = [];
		class TestLogService extends NullLogService {
			override error(message: string): void { errors.push(message); }
		}
		const database = new FailingDatabase();
		const { service, session, stateManager, meta } = await createFixture(database, new TestLogService());
		database.failArtifactWrites = true;

		await assert.rejects(service.removeSessionArtifact(session, 'pr'), /artifact write failed/);
		const afterFailure = {
			meta: stateManager.getSessionState(session.toString())?._meta,
			persisted: await database.getMetadata(SESSION_ARTIFACTS_KEY),
		};
		database.failArtifactWrites = false;
		await service.removeSessionArtifact(session, 'pr');
		await service.removeSessionArtifact(session, 'pr');

		assert.deepStrictEqual({
			errors,
			afterFailure,
			persisted: await database.getMetadata(SESSION_ARTIFACTS_KEY),
		}, {
			errors: ['[AgentService] Failed to persist session artifacts'],
			afterFailure: { meta, persisted: stringifySessionArtifacts(artifacts) },
			persisted: stringifySessionArtifacts(artifacts.slice(1)),
		});
	});

	test('serializes overlapping user removals against the latest committed collection', async () => {
		const database = store.add(await SessionDatabase.open(':memory:'));
		const { service, session, stateManager, meta } = await createFixture(database);
		await Promise.all([
			service.removeSessionArtifact(session, 'pr'),
			service.removeSessionArtifact(session, 'file'),
		]);
		assert.deepStrictEqual({
			meta: stateManager.getSessionState(session.toString())?._meta,
			persisted: await database.getMetadata(SESSION_ARTIFACTS_KEY),
		}, {
			meta: withSessionArtifacts(meta, artifacts.slice(2)),
			persisted: stringifySessionArtifacts(artifacts.slice(2)),
		});
	});

	test('rejects empty ids without changing metadata', async () => {
		const database = new TestSessionDatabase();
		const { service, session, stateManager, meta } = await createFixture(database);
		await assert.rejects(service.removeSessionArtifact(session, ' '), /artifactId must be a non-empty string/);
		assert.deepStrictEqual(stateManager.getSessionState(session.toString())?._meta, meta);
	});
});
