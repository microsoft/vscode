/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import type { Database } from '@vscode/sqlite3';
import { DeferredPromise } from '../../../../base/common/async.js';
import { stableStringify } from '../../../../base/common/objects.js';
import { join } from '../../../../base/common/path.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AGENT_HOST_CATALOG_SNAPSHOT_SESSION_LIMIT, AgentHostDatabase, IAgentHostDatabase, IAgentHostDatabaseChatV2NormalizationCandidate, IAgentHostDatabaseSessionV2Envelope } from '../../node/agentHostDatabase.js';
import { AGENT_HOST_CATALOG_CHILD_LIMIT, AGENT_HOST_CATALOG_PAYLOAD_VERSION, AgentHostCatalogData, decodeAgentHostCatalogPayload, projectAgentHostCatalogChatOrigin } from '../../node/agentHostCatalogProjection.js';
import { ChatInteractivity, ChatOriginKind } from '../../common/state/protocol/channels-chat/state.js';
import { encodeChatV2Metadata } from '../../node/agentHostChatCatalogV2.js';

function openDatabase(path: string): Promise<Database> {
	return new Promise((resolve, reject) => {
		import('@vscode/sqlite3').then(sqlite3 => {
			const database = new sqlite3.default.Database(path, error => error ? reject(error) : resolve(database));
		}, reject);
	});
}

function exec(database: Database, sql: string): Promise<void> {
	return new Promise((resolve, reject) => database.exec(sql, error => error ? reject(error) : resolve()));
}

function all(database: Database, sql: string, parameters: string[] = []): Promise<readonly Record<string, unknown>[]> {
	return new Promise((resolve, reject) => {
		database.all(sql, parameters, (error: Error | null, rows: Record<string, unknown>[]) => error ? reject(error) : resolve(rows));
	});
}

/** The pre-chat-V2 schema-13 reader, without any normalized-authority dispatch. */
function readLegacySessionChatCatalog(database: Database, session: string): Promise<readonly Record<string, unknown>[]> {
	return all(database, `SELECT
		catalog.revision,
		catalog.legacy_mirrored_revision,
		(SELECT value FROM metadata WHERE key = ?) AS legacy_mirrored_payload,
		chat.chat_uri,
		chat.chat_order,
		chat.is_read,
		chat.archived,
		chat.provider_data,
		chat.origin,
		chat.inherited_turn_id
	FROM session_chat_catalogs AS catalog
	LEFT JOIN session_chats AS chat ON chat.session_uri = catalog.session_uri
	WHERE catalog.session_uri = ?
	ORDER BY chat.chat_order`, [`sessionChatCatalogLegacyMirror:${session}`, session]);
}

function readLegacySessionV2Registrations(database: Database): Promise<readonly Record<string, unknown>[]> {
	return all(database, `SELECT session_uri, provider, start_time, modified_time, external, registration_source
		FROM sessions_v2
		WHERE NOT EXISTS (
			SELECT 1 FROM metadata
			WHERE key = 'sessionTombstone:' || sessions_v2.session_uri AND value = 'true'
		)
			AND NOT EXISTS (
				SELECT 1 FROM metadata
				WHERE key = 'sessionsV2Excluded:' || sessions_v2.provider || ':' || sessions_v2.session_uri
			)
		ORDER BY session_uri`);
}

function close(database: Database): Promise<void> {
	return new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
}

function createPayload(session: string, sourceRevision: number, isChatBacking = false): string {
	return stableStringify({
		payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
		data: {
			modifiedTime: 100 + sourceRevision,
			summary: `Title ${sourceRevision}`,
			isRead: true,
			isArchived: false,
			isChatBacking,
			project: { uri: 'file:///project', displayName: 'Project' },
			_meta: { ehcliAdoptable: true },
			workingDirectories: ['file:///project', 'file:///project/packages/app'],
			changes: { files: 2 },
			chats: [
				{ kind: 'default', order: 0, summary: 'Default', titleSource: 'auto', uri: `${session}#default` },
				{ kind: 'peer', order: 1, origin: { type: 'subagent' }, summary: 'Peer', titleSource: 'agent', uri: `${session}#peer` },
			],
		},
	});
}

function createEnvelope(
	session: string,
	sessionGeneration: string,
	sourceRevision: number,
	overrides: Partial<IAgentHostDatabaseSessionV2Envelope> = {},
): IAgentHostDatabaseSessionV2Envelope {
	const payload = overrides.payload ?? createPayload(session, sourceRevision);
	return {
		session,
		sessionGeneration,
		sourceRevision,
		payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
		payloadHash: createHash('sha256').update(payload, 'utf8').digest('hex'),
		verified: true,
		payload,
		...overrides,
	};
}

/** The stored row a verified envelope produces for a session registered with `registration`. */
function storedRow(envelope: IAgentHostDatabaseSessionV2Envelope, registration: object, isChatBacking = false) {
	return { ...envelope, ...registration, isChatBacking, payloadDirty: 0 };
}

async function createPublishedSessionsV2Database(path: string, version: 4 | 5 | 6): Promise<void> {
	const database = await openDatabase(path);
	try {
		await exec(database, `
			CREATE TABLE sessions (
				session_uri TEXT PRIMARY KEY NOT NULL,
				provider TEXT NOT NULL,
				start_time INTEGER NOT NULL,
				external INTEGER,
				registration_source TEXT NOT NULL DEFAULT 'explicit'
			);
			CREATE TABLE metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
			CREATE TABLE sessions_v2 (
				session_uri TEXT PRIMARY KEY NOT NULL REFERENCES sessions(session_uri) ON DELETE CASCADE,
				provider TEXT NOT NULL,
				start_time INTEGER NOT NULL,
				external INTEGER,
				registration_source TEXT NOT NULL,
				modified_time INTEGER,
				title TEXT,
				title_source TEXT CHECK (title_source IN ('user', 'agent', 'auto')),
				is_read INTEGER CHECK (is_read IN (0, 1)),
				is_archived INTEGER CHECK (is_archived IN (0, 1)),
				project_uri TEXT,
				project_display_name TEXT,
				workspaceless INTEGER CHECK (workspaceless IN (0, 1)),
				ehcli_adoptable INTEGER CHECK (ehcli_adoptable IN (0, 1)),
				working_directories_json TEXT,
				chats_json TEXT,
				multi_root_json TEXT,
				folder_picker_json TEXT,
				changes_summary_json TEXT,
				github_summary_json TEXT,
				git_summary_json TEXT,
				source_control_summary_json TEXT,
				artifacts_json TEXT,
				orchestration_json TEXT,
				session_generation TEXT,
				source_revision INTEGER CHECK (source_revision >= 0),
				projection_version INTEGER CHECK (projection_version >= 0),
				source_hash TEXT,
				verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1))
			);
			INSERT INTO sessions VALUES ('session://published-${version}', 'copilot', ${version}, 1, 'discovery');
		`);
		if (version >= 5) {
			await exec(database, 'ALTER TABLE sessions_v2 ADD COLUMN is_chat_backing INTEGER NOT NULL DEFAULT 0 CHECK (is_chat_backing IN (0, 1))');
		}
		if (version >= 6) {
			await exec(database, 'ALTER TABLE sessions_v2 ADD COLUMN ehcli_adopted INTEGER CHECK (ehcli_adopted IN (0, 1))');
		}
		const laterColumns = version === 4 ? '' : version === 5 ? ', is_chat_backing' : ', is_chat_backing, ehcli_adopted';
		const laterValues = version === 4 ? '' : version === 5 ? ', 1' : ', 1, 1';
		await exec(database, `
			INSERT INTO sessions_v2 (
				session_uri, provider, start_time, external, registration_source, modified_time, title, title_source,
				is_read, is_archived, project_uri, project_display_name, workspaceless, ehcli_adoptable,
				working_directories_json, chats_json, multi_root_json, folder_picker_json, changes_summary_json,
				github_summary_json, git_summary_json, source_control_summary_json, artifacts_json, orchestration_json,
				session_generation, source_revision, projection_version, source_hash, verified${laterColumns}
			) VALUES (
				'session://published-${version}', 'copilot', ${version}, 1, 'discovery', 100, 'Published', 'user',
				1, 0, 'file:///project', 'Project', 0, 1,
				'["file:///project"]', '[]', '{}', '{}', '{}',
				'{}', '{}', '{}', '[]', '{}',
				'generation-${version}', 7, 4, 'published-hash', 1${laterValues}
			);
			PRAGMA user_version = ${version};
		`);
	} finally {
		await close(database);
	}
}

async function createUpstreamVersion4Database(path: string): Promise<void> {
	const database = await openDatabase(path);
	try {
		await exec(database, `
			CREATE TABLE sessions (
				session_uri TEXT PRIMARY KEY NOT NULL,
				provider TEXT NOT NULL,
				start_time INTEGER NOT NULL,
				external INTEGER NOT NULL DEFAULT 0,
				registration_source TEXT NOT NULL DEFAULT 'explicit',
				modified_time INTEGER NOT NULL DEFAULT 0
			);
			CREATE TABLE metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
			INSERT INTO sessions VALUES ('copilotcli:/upstream-v4', 'copilotcli', 10, 0, 'explicit', 20);
			PRAGMA user_version = 4;
		`);
	} finally {
		await close(database);
	}
}

suite('AgentHostDatabase sessions_v2', () => {

	let database: IAgentHostDatabase | undefined;
	let temporaryDirectory: string | undefined;

	setup(async () => {
		temporaryDirectory = await fs.mkdtemp(join(tmpdir(), `agent-host-sessions-v2-${generateUuid()}`));
	});

	teardown(async () => {
		await database?.close();
		database = undefined;
		if (temporaryDirectory) {
			await fs.rm(temporaryDirectory, { recursive: true, force: true });
			temporaryDirectory = undefined;
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('creates the central catalog schema without changing the legacy registry', async () => {
		const path = join(temporaryDirectory!, 'agent-host.db');
		database = new AgentHostDatabase(path);
		await database.registerSessionV2('session://fresh', {
			provider: 'copilot',
			startTime: 1,
			source: 'explicit',
		}, { checkTombstone: false });
		assert.deepStrictEqual({
			legacy: await database.getSession('session://fresh'),
			current: await database.getSessionV2Registration('session://fresh'),
			complete: await database.getSessionV2('session://fresh'),
		}, {
			legacy: undefined,
			current: { session: 'session://fresh', provider: 'copilot', startTime: 1, modifiedTime: 1, external: false, source: 'explicit' },
			complete: undefined,
		});
		await database.close();
		database = undefined;

		const rawDatabase = await openDatabase(path);
		try {
			const [version, tables, sessionColumns, sessionV2Columns, sessionV2ForeignKeys, sessionChatColumns] = await Promise.all([
				all(rawDatabase, 'PRAGMA user_version'),
				all(rawDatabase, `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`),
				all(rawDatabase, 'PRAGMA table_info(sessions)'),
				all(rawDatabase, 'PRAGMA table_info(sessions_v2)'),
				all(rawDatabase, 'PRAGMA foreign_key_list(sessions_v2)'),
				all(rawDatabase, 'PRAGMA table_info(session_chats)'),
			]);
			assert.deepStrictEqual({
				version,
				tables: tables.map(row => row.name),
				sessionColumns: sessionColumns.map(row => row.name),
				sessionV2Columns: sessionV2Columns.map(row => row.name),
				sessionV2ForeignKeys,
				sessionChatColumns: sessionChatColumns.map(row => row.name),
			}, {
				version: [{ user_version: 14 }],
				tables: ['chats_v2', 'metadata', 'session_chat_catalogs', 'session_chats', 'sessions', 'sessions_v2'],
				sessionColumns: ['session_uri', 'provider', 'start_time', 'external', 'registration_source', 'modified_time'],
				sessionV2Columns: [
					'session_uri', 'provider', 'start_time', 'external', 'registration_source', 'session_generation',
					'source_revision', 'payload_version', 'payload_hash', 'verified', 'payload', 'is_chat_backing', 'modified_time',
				],
				sessionV2ForeignKeys: [],
				sessionChatColumns: ['session_uri', 'chat_uri', 'chat_order', 'provider_data', 'origin', 'inherited_turn_id', 'archived', 'is_read'],
			});

		} finally {
			await close(rawDatabase);
		}
	});

	test('stores revisioned authoritative peer-chat membership', async () => {
		database = new AgentHostDatabase(join(temporaryDirectory!, 'agent-host.db'));
		const session = 'session://chat-catalog';
		await database.registerRuntimeSession(session, {
			provider: 'copilot',
			startTime: 1,
			source: 'explicit',
		}, { checkTombstone: false });

		const before = await database.getSessionChatCatalog(session);
		const firstResult = await database.replaceSessionChatCatalog(session, [
			{ chat: 'ahp-chat://first', order: 0, isRead: false, providerData: 'first', origin: '{"kind":"user"}' },
			{ chat: 'ahp-chat://second', order: 1, inheritedTurnId: 'turn-1' },
		], undefined);
		if (firstResult.status !== 'applied') {
			throw new Error('Expected the initial chat catalog write to succeed');
		}
		const firstRevision = firstResult.revision;
		const first = await database.getSessionChatCatalog(session);
		const firstAcknowledged = await database.markSessionChatCatalogLegacyMirrored(session, firstRevision, '[{"uri":"ahp-chat://first"}]');
		const secondResult = await database.replaceSessionChatCatalog(session, [
			{ chat: 'ahp-chat://second', order: 0, inheritedTurnId: 'turn-1' },
		], firstRevision);
		if (secondResult.status !== 'applied') {
			throw new Error('Expected the second chat catalog write to succeed');
		}
		const secondRevision = secondResult.revision;
		const conflictingRevision = await database.replaceSessionChatCatalog(session, [], firstRevision);
		const staleAcknowledgement = await database.markSessionChatCatalogLegacyMirrored(session, firstRevision, 'stale-mirror-payload');
		const afterStaleAcknowledgement = await database.getSessionChatCatalog(session);
		const baseRecorded = await database.recordSessionChatCatalogLegacyMirrorPayload(session, secondRevision, 'observed-legacy-payload');
		const second = await database.getSessionChatCatalog(session);

		assert.deepStrictEqual({
			before,
			firstRevision,
			first,
			firstAcknowledged,
			secondRevision,
			conflictingRevision,
			staleAcknowledgement,
			afterStaleAcknowledgement,
			baseRecorded,
			second,
		}, {
			before: undefined,
			firstRevision: 1,
			first: {
				revision: 1,
				legacyMirroredRevision: 0,
				chats: [
					{ chat: 'ahp-chat://first', order: 0, isRead: false, providerData: 'first', origin: '{"kind":"user"}' },
					{ chat: 'ahp-chat://second', order: 1, inheritedTurnId: 'turn-1' },
				],
			},
			firstAcknowledged: true,
			secondRevision: 2,
			conflictingRevision: { status: 'conflict' },
			staleAcknowledgement: false,
			afterStaleAcknowledgement: {
				revision: 2,
				legacyMirroredRevision: 1,
				legacyMirroredPayload: 'stale-mirror-payload',
				chats: [
					{ chat: 'ahp-chat://second', order: 0, inheritedTurnId: 'turn-1' },
				],
			},
			baseRecorded: true,
			second: {
				revision: 2,
				legacyMirroredRevision: 1,
				legacyMirroredPayload: 'observed-legacy-payload',
				chats: [
					{ chat: 'ahp-chat://second', order: 0, inheritedTurnId: 'turn-1' },
				],
			},
		});
	});

	test('sequences chat catalog reads behind queued replacements', async () => {
		const sequencedDatabase = new AgentHostDatabase(':memory:');
		database = sequencedDatabase;
		const session = 'session://sequenced-chat-catalog';
		await sequencedDatabase.registerRuntimeSession(session, {
			provider: 'copilot',
			startTime: 1,
			source: 'explicit',
		}, { checkTombstone: false });
		const release = new DeferredPromise<void>();
		const queued = new DeferredPromise<void>();
		const transactionSequencer = (sequencedDatabase as unknown as {
			readonly _transactionSequencer: { queue<T>(task: () => Promise<T>): Promise<T> };
		})._transactionSequencer;
		const blocker = transactionSequencer.queue(async () => {
			await queued.complete();
			await release.p;
		});
		await queued.p;
		const replacement = sequencedDatabase.replaceSessionChatCatalog(session, [
			{ chat: 'ahp-chat://first', order: 0 },
			{ chat: 'ahp-chat://second', order: 1 },
		], undefined);
		let readSettled = false;
		const read = sequencedDatabase.getSessionChatCatalog(session).finally(() => readSettled = true);
		await new Promise(resolve => setTimeout(resolve, 0));
		const settledWhileWriteQueued = readSettled;
		await release.complete();
		await blocker;

		assert.deepStrictEqual({
			settledWhileWriteQueued,
			replacement: await replacement,
			catalog: await read,
		}, {
			settledWhileWriteQueued: false,
			replacement: { status: 'applied', revision: 1 },
			catalog: {
				revision: 1,
				legacyMirroredRevision: 0,
				chats: [
					{ chat: 'ahp-chat://first', order: 0 },
					{ chat: 'ahp-chat://second', order: 1 },
				],
			},
		});
	});

	test('bulk inserts a large chat catalog with bounded SQL calls', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://bulk-chat-catalog';
		await database.registerRuntimeSession(session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const rawDatabase = await (database as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
		const inserts: string[] = [];
		const trace = (sql: string) => {
			if (sql.startsWith('INSERT INTO session_chats (')) {
				inserts.push(sql);
			}
		};
		rawDatabase.on('trace', trace);
		const chats = Array.from({ length: 1001 }, (_, order) => ({
			chat: `ahp-chat://peer-${order}`,
			order,
			...(order % 2 === 0 ? { providerData: `backing '${order}'`, origin: '{"kind":"user"}', inheritedTurnId: `turn-${order}` } : {}),
		}));
		try {
			const replacement = await database.replaceSessionChatCatalog(session, chats, undefined);
			const catalog = await database.getSessionChatCatalog(session);
			assert.deepStrictEqual({
				replacement,
				catalog,
				insertStatements: inserts.length,
			}, {
				replacement: { status: 'applied', revision: 1 },
				catalog: { revision: 1, legacyMirroredRevision: 0, chats },
				insertStatements: 7,
			});
		} finally {
			rawDatabase.removeListener('trace', trace);
		}
	});

	test('rolls back every chat batch and its revision when a later insert fails', async () => {
		const path = join(temporaryDirectory!, 'chat-batch-rollback.db');
		const session = 'session://chat-batch-rollback';
		database = new AgentHostDatabase(path);
		await database.registerRuntimeSession(session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.replaceSessionChatCatalog(session, [{ chat: 'ahp-chat://original', order: 0, providerData: 'original' }], undefined);
		await database.markSessionChatCatalogLegacyMirrored(session, 1, 'original-mirror');
		const before = await database.getSessionChatCatalog(session);
		await database.close();
		const rawDatabase = await openDatabase(path);
		try {
			await exec(rawDatabase, `CREATE TRIGGER fail_late_chat_batch
				BEFORE INSERT ON session_chats WHEN NEW.chat_order = 900
				BEGIN SELECT RAISE(ABORT, 'late chat batch failed'); END`);
		} finally {
			await close(rawDatabase);
		}
		database = new AgentHostDatabase(path);
		const chats = Array.from({ length: 1001 }, (_, order) => ({ chat: `ahp-chat://replacement-${order}`, order }));

		await assert.rejects(database.replaceSessionChatCatalog(session, chats, 1), /late chat batch failed/);
		assert.deepStrictEqual(await database.getSessionChatCatalog(session), before);
	});

	test('rejects chat catalog replacement after session tombstoning', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://deleted-chat-catalog';
		await database.registerRuntimeSession(session, {
			provider: 'copilot',
			startTime: 1,
			source: 'explicit',
		}, { checkTombstone: false });
		const initial = await database.replaceSessionChatCatalog(session, [
			{ chat: 'ahp-chat://peer', order: 0 },
		], undefined);
		await database.tombstoneAndUnregisterSession(session);

		const afterTombstone = await database.replaceSessionChatCatalog(session, [
			{ chat: 'ahp-chat://late-peer', order: 0 },
		], undefined);
		const missing = await database.replaceSessionChatCatalog('session://missing-chat-catalog', [], undefined);

		assert.deepStrictEqual({
			initial,
			afterTombstone,
			missing,
			catalog: await database.getSessionChatCatalog(session),
		}, {
			initial: { status: 'applied', revision: 1 },
			afterTombstone: { status: 'tombstoned' },
			missing: { status: 'missingSession' },
			catalog: undefined,
		});
	});

	for (const version of [4, 5, 6] as const) {
		test(`upgrades published v${version} rows and invalidates old projections`, async () => {
			const path = join(temporaryDirectory!, `agent-host-published-v${version}.db`);
			await createPublishedSessionsV2Database(path, version);
			const upgraded = new AgentHostDatabase(path);
			try {
				const session = `session://published-${version}`;
				const direct = `session://direct-${version}`;
				await upgraded.registerSessionV2(direct, { provider: 'claude', startTime: 200 + version, source: 'explicit' }, { checkTombstone: false });
				await upgraded.unregisterSession(session);
				const rawDatabase = await openDatabase(path);
				const [schemaVersion, foreignKeys] = await Promise.all([
					all(rawDatabase, 'PRAGMA user_version'),
					all(rawDatabase, 'PRAGMA foreign_key_list(sessions_v2)'),
				]);
				await close(rawDatabase);
				assert.deepStrictEqual({
					version,
					schemaVersion,
					foreignKeys,
					published: await upgraded.getSessionV2(session),
					directLegacy: await upgraded.getSession(direct),
					directCurrent: await upgraded.getSessionV2Registration(direct),
				}, {
					version,
					schemaVersion: [{ user_version: 14 }],
					foreignKeys: [],
					published: undefined,
					directLegacy: undefined,
					directCurrent: {
						session: `session://direct-${version}`,
						provider: 'claude',
						startTime: 200 + version,
						modifiedTime: 200 + version,
						external: false,
						source: 'explicit',
					},
				});
			} finally {
				await upgraded.close();
			}
		}).timeout(10_000);
	}

	test('applies the catalog migration after upstream v4', async () => {
		const path = join(temporaryDirectory!, 'agent-host-upstream-v4.db');
		await createUpstreamVersion4Database(path);
		database = new AgentHostDatabase(path);

		assert.deepStrictEqual({
			registration: await database.getSessionV2Registration('copilotcli:/upstream-v4'),
			catalog: await database.getSessionV2('copilotcli:/upstream-v4'),
		}, {
			registration: {
				session: 'copilotcli:/upstream-v4',
				provider: 'copilotcli',
				startTime: 10,
				modifiedTime: 20,
				external: false,
				source: 'explicit',
			},
			catalog: undefined,
		});
		await database.close();
		database = undefined;

		const rawDatabase = await openDatabase(path);
		try {
			assert.deepStrictEqual({
				version: await all(rawDatabase, 'PRAGMA user_version'),
				tables: (await all(rawDatabase, `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)).map(row => row.name),
			}, {
				version: [{ user_version: 14 }],
				tables: ['chats_v2', 'metadata', 'session_chat_catalogs', 'session_chats', 'sessions', 'sessions_v2'],
			});
		} finally {
			await close(rawDatabase);
		}
	});

	test('normalizes a pre-release v7 catalog and requires payload reseeding', async () => {
		const path = join(temporaryDirectory!, 'agent-host-v7.db');
		await createPublishedSessionsV2Database(path, 6);
		const v7Database = await openDatabase(path);
		await exec(v7Database, 'PRAGMA user_version = 7');
		await close(v7Database);

		database = new AgentHostDatabase(path);
		const registration = await database.getSessionV2Registration('session://published-6');
		const projection = await database.getSessionV2('session://published-6');
		await database.close();
		database = undefined;

		const migratedDatabase = await openDatabase(path);
		const rows = await all(migratedDatabase, `SELECT
			session_uri, provider, start_time, external, registration_source, session_generation,
			source_revision, payload_version, payload_hash, verified, payload, is_chat_backing
			FROM sessions_v2`);
		await close(migratedDatabase);

		assert.deepStrictEqual({ registration, projection, rows }, {
			registration: {
				session: 'session://published-6',
				provider: 'copilot',
				startTime: 6,
				modifiedTime: 6,
				external: true,
				source: 'discovery',
			},
			projection: undefined,
			rows: [{
				session_uri: 'session://published-6',
				provider: 'copilot',
				start_time: 6,
				external: 1,
				registration_source: 'discovery',
				session_generation: null,
				source_revision: null,
				payload_version: null,
				payload_hash: null,
				verified: 0,
				payload: null,
				is_chat_backing: 0,
			}],
		});
	});

	test('normalizes the pre-release v11 version without rebuilding its final catalog', async () => {
		const path = join(temporaryDirectory!, 'agent-host-v11.db');
		database = new AgentHostDatabase(path);
		await database.registerSessionV2('session://v11', { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.replaceSessionChatCatalog('session://v11', [
			{ chat: 'ahp-chat://peer', order: 0, providerData: 'peer' },
		], undefined);
		await database.close();
		database = undefined;

		const preReleaseDatabase = await openDatabase(path);
		await exec(preReleaseDatabase, 'PRAGMA user_version = 11');
		await close(preReleaseDatabase);

		database = new AgentHostDatabase(path);
		const registration = await database.getSessionV2Registration('session://v11');
		const catalog = await database.getSessionChatCatalog('session://v11');
		await database.close();
		database = undefined;

		const normalizedDatabase = await openDatabase(path);
		const version = await all(normalizedDatabase, 'PRAGMA user_version');
		await close(normalizedDatabase);

		assert.deepStrictEqual({ registration, catalog, version }, {
			registration: {
				session: 'session://v11',
				provider: 'copilot',
				startTime: 1,
				modifiedTime: 1,
				external: false,
				source: 'explicit',
			},
			catalog: {
				revision: 1,
				legacyMirroredRevision: 0,
				chats: [{ chat: 'ahp-chat://peer', order: 0, providerData: 'peer' }],
			},
			version: [{ user_version: 14 }],
		});
	});

	test('repairs missing chat columns without lowering a future schema version', async () => {
		const path = join(temporaryDirectory!, 'agent-host-future-v17.db');
		database = new AgentHostDatabase(path);
		await database.registerSessionV2('session://future-v17', { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.replaceSessionChatCatalog('session://future-v17', [
			{ chat: 'ahp-chat://peer', order: 0, providerData: 'peer' },
		], undefined);
		await database.close();
		database = undefined;

		const futureDatabase = await openDatabase(path);
		await exec(futureDatabase, `ALTER TABLE session_chats DROP COLUMN is_read;
			ALTER TABLE session_chats ADD COLUMN parent_chat TEXT;
			ALTER TABLE session_chats ADD COLUMN storage_resource TEXT;
			PRAGMA user_version = 17`);
		await close(futureDatabase);

		database = new AgentHostDatabase(path);
		const catalog = await database.getSessionChatCatalog('session://future-v17');
		await database.close();
		database = undefined;

		const repairedDatabase = await openDatabase(path);
		const version = await all(repairedDatabase, 'PRAGMA user_version');
		const columns = (await all(repairedDatabase, 'PRAGMA table_info(session_chats)')).map(row => row.name);
		await close(repairedDatabase);

		assert.deepStrictEqual({ catalog, version, columns }, {
			catalog: {
				revision: 1,
				legacyMirroredRevision: 0,
				chats: [{ chat: 'ahp-chat://peer', order: 0, providerData: 'peer' }],
			},
			version: [{ user_version: 17 }],
			columns: ['session_uri', 'chat_uri', 'chat_order', 'provider_data', 'origin', 'inherited_turn_id', 'archived', 'parent_chat', 'storage_resource', 'is_read'],
		});
	});

	test('upgrades a pre-release v6 catalog while preserving unknown tables', async () => {
		const path = join(temporaryDirectory!, 'agent-host-future-v6.db');
		database = new AgentHostDatabase(path);
		await database.registerSessionV2('session://future-v6', { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.close();
		database = undefined;

		const futureDatabase = await openDatabase(path);
		await exec(futureDatabase, 'CREATE TABLE future_v6_marker (value INTEGER); PRAGMA user_version = 6');
		await close(futureDatabase);

		database = new AgentHostDatabase(path);
		const registration = await database.getSessionV2Registration('session://future-v6');
		await database.close();
		database = undefined;

		const preservedDatabase = await openDatabase(path);
		const version = await all(preservedDatabase, 'PRAGMA user_version');
		const marker = await all(preservedDatabase, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'future_v6_marker'`);
		await close(preservedDatabase);

		assert.deepStrictEqual({
			registration,
			version,
			marker,
		}, {
			registration: {
				session: 'session://future-v6',
				provider: 'copilot',
				startTime: 1,
				modifiedTime: 1,
				external: false,
				source: 'explicit',
			},
			version: [{ user_version: 14 }],
			marker: [{ name: 'future_v6_marker' }],
		});
	}).timeout(10_000);

	test('increments dirty markers and clears only the observed marker', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://dirty-marker';
		await database.registerSessionV2(session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.upsertSessionV2(createEnvelope(session, 'generation-1', 1), undefined);

		const first = await database.markSessionV2PayloadDirty(session);
		const second = await database.markSessionV2PayloadDirty(session);
		const staleClear = await database.markSessionV2PayloadClean(session, first!);
		const currentClear = await database.markSessionV2PayloadClean(session, second!);
		const receipt = (await database.listSessionsV2Receipts())[0];
		const { payload: _payload, ...expectedReceipt } = storedRow(
			createEnvelope(session, 'generation-1', 1),
			{ provider: 'copilot', startTime: 1, modifiedTime: 1, external: false, source: 'explicit' },
		);
		void _payload;
		await database.unregisterSessionV2(session);
		await database.registerSessionV2(session, { provider: 'copilot', startTime: 2, source: 'explicit' }, { checkTombstone: false });
		const recreatedDirty = await database.markSessionV2PayloadDirty(session);

		assert.deepStrictEqual({
			first,
			second,
			staleClear,
			currentClear,
			receipt,
			recreatedDirty,
		}, {
			first: 1,
			second: 2,
			staleClear: false,
			currentClear: true,
			receipt: {
				...expectedReceipt,
				payloadDirty: 0,
			},
			recreatedDirty: 1,
		});
	});

	test('batches modified-time advances and payload dirty markers in one transaction', async () => {
		database = new AgentHostDatabase(':memory:');
		for (const session of ['session://first', 'session://second']) {
			await database.registerRuntimeSession(session, {
				provider: 'copilot',
				startTime: 1,
				source: 'explicit',
			}, { checkTombstone: false });
			await database.upsertSessionV2(createEnvelope(session, `${session}-generation`, 1), undefined);
		}

		await database.updateSessionModifiedTimes([
			{ session: 'session://first', modifiedTime: 10 },
			{ session: 'session://second', modifiedTime: 20 },
			...Array.from({ length: 401 }, (_, index) => ({ session: `session://missing-${index}`, modifiedTime: 30 + index })),
		]);

		assert.deepStrictEqual(
			(await database.listSessionsV2Receipts()).map(receipt => ({
				session: receipt.session,
				modifiedTime: receipt.modifiedTime,
				payloadDirty: receipt.payloadDirty,
			})).toSorted((first, second) => first.session.localeCompare(second.session)),
			[
				{ session: 'session://first', modifiedTime: 10, payloadDirty: 1 },
				{ session: 'session://second', modifiedTime: 20, payloadDirty: 1 },
			],
		);
	});

	test('upgrades published v1 through v3 schemas with incomplete v2 rows', async () => {
		const results: object[] = [];
		for (const version of [1, 2, 3]) {
			const path = join(temporaryDirectory!, `agent-host-v${version}.db`);
			const rawDatabase = await openDatabase(path);
			const externalColumn = version >= 2 ? ', external INTEGER' : '';
			const sourceColumn = version >= 3 ? `, registration_source TEXT NOT NULL DEFAULT 'explicit'` : '';
			const insertColumns = version === 1 ? '' : version === 2 ? ', external' : ', external, registration_source';
			const insertValues = version === 1 ? '' : version === 2 ? ', 1' : `, 0, 'restore'`;
			await exec(rawDatabase, `
				CREATE TABLE sessions (
					session_uri TEXT PRIMARY KEY NOT NULL,
					provider TEXT NOT NULL,
					start_time INTEGER NOT NULL${externalColumn}${sourceColumn}
				);
				CREATE TABLE metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
				INSERT INTO sessions (session_uri, provider, start_time${insertColumns})
					VALUES ('session://upgrade-${version}', 'copilot', ${version}${insertValues});
				PRAGMA user_version = ${version};
			`);
			await close(rawDatabase);

			const upgraded = new AgentHostDatabase(path);
			try {
				const session = await upgraded.getSession(`session://upgrade-${version}`);
				const migratedDatabase = await openDatabase(path);
				const migratedRows = await all(migratedDatabase, 'SELECT session_uri, provider, start_time, external, registration_source, verified FROM sessions_v2');
				await close(migratedDatabase);
				results.push({
					version,
					session,
					sessionV2: await upgraded.getSessionV2(`session://upgrade-${version}`),
					migratedRows,
				});
			} finally {
				await upgraded.close();
			}
		}

		assert.deepStrictEqual(results, [
			{
				version: 1,
				session: { session: 'session://upgrade-1', provider: 'copilot', startTime: 1, modifiedTime: 1, external: undefined, source: 'explicit' },
				sessionV2: undefined,
				migratedRows: [{ session_uri: 'session://upgrade-1', provider: 'copilot', start_time: 1, external: null, registration_source: 'explicit', verified: 0 }],
			},
			{
				version: 2,
				session: { session: 'session://upgrade-2', provider: 'copilot', startTime: 2, modifiedTime: 2, external: true, source: 'discovery' },
				sessionV2: undefined,
				migratedRows: [{ session_uri: 'session://upgrade-2', provider: 'copilot', start_time: 2, external: 1, registration_source: 'discovery', verified: 0 }],
			},
			{
				version: 3,
				session: { session: 'session://upgrade-3', provider: 'copilot', startTime: 3, modifiedTime: 3, external: false, source: 'restore' },
				sessionV2: undefined,
				migratedRows: [{ session_uri: 'session://upgrade-3', provider: 'copilot', start_time: 3, external: 0, registration_source: 'restore', verified: 0 }],
			},
		]);
	}).timeout(10_000);

	test('round trips one complete verified row', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://round-trip';
		await database.registerSessionV2(session, {
			provider: 'copilot',
			startTime: 42,
			source: 'restore',
		}, { checkTombstone: false });
		const registration = { provider: 'copilot', startTime: 42, modifiedTime: 42, external: false, source: 'restore' };
		const envelope = createEnvelope(session, 'generation-1', 7);

		const result = await database.upsertSessionV2(envelope, undefined);
		const { payload, ...receipt } = storedRow(envelope, registration);

		assert.deepStrictEqual({
			result,
			row: await database.getSessionV2(session),
			rows: await database.listSessionsV2(),
			receipts: await database.listSessionsV2Receipts(),
		}, {
			result: 'applied',
			row: storedRow(envelope, registration),
			rows: [storedRow(envelope, registration)],
			receipts: [receipt],
		});
	});

	test('lists only requested verified rows and skips empty requests', async () => {
		database = new AgentHostDatabase(':memory:');
		const first = 'session://first';
		const second = 'session://second';
		for (const session of [first, second]) {
			await database.registerSessionV2(session, {
				provider: 'copilot',
				startTime: 42,
				source: 'restore',
			}, { checkTombstone: false });
			await database.upsertSessionV2(createEnvelope(session, 'generation-1', 1), undefined);
		}

		assert.deepStrictEqual({
			subset: (await database.listSessionsV2([second])).map(row => row.session),
			empty: await database.listSessionsV2([]),
		}, {
			subset: [second],
			empty: [],
		});
	});

	test('derives is_chat_backing from the validated payload and rejects payloads the envelope does not describe', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://derived';
		await database.registerSessionV2(session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const backing = createEnvelope(session, 'generation-1', 1, { payload: createPayload(session, 1, true) });
		await database.upsertSessionV2(backing, undefined);
		const backingRow = await database.getSessionV2(session);

		await database.upsertSessionV2(createEnvelope(session, 'generation-1', 2), 'generation-1');
		const clearedRow = await database.getSessionV2(session);

		await assert.rejects(
			database.upsertSessionV2({ ...createEnvelope(session, 'generation-1', 3), payloadHash: 'wrong' }, 'generation-1'),
			/payloadHash must match payload/,
		);
		await assert.rejects(
			database.upsertSessionV2(createEnvelope(session, 'generation-1', 3, { payload: `{"payloadVersion":${AGENT_HOST_CATALOG_PAYLOAD_VERSION},"data":{}}` }), 'generation-1'),
			/Catalog payload is invalid/,
		);
		await assert.rejects(
			database.upsertSessionV2(createEnvelope(session, 'generation-1', 3, { payload: `{"data":{},"payloadVersion":0}` }), 'generation-1'),
			/Catalog payload is outdated/,
		);

		assert.deepStrictEqual({
			backing: backingRow?.isChatBacking,
			cleared: clearedRow?.isChatBacking,
			receipts: (await database.listSessionsV2Receipts()).map(receipt => receipt.isChatBacking),
		}, {
			backing: true,
			cleared: false,
			receipts: [false],
		});
	});

	test('guards revisions and generation transitions', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://ordering';
		await database.registerSessionV2(session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.upsertSessionV2(createEnvelope(session, 'generation-1', 2), undefined);

		const results = {
			stale: await database.upsertSessionV2(createEnvelope(session, 'generation-1', 1), 'generation-1'),
			conflict: await database.upsertSessionV2(createEnvelope(session, 'generation-1', 2, { payload: createPayload(session, 99) }), 'generation-1'),
			replayed: await database.upsertSessionV2(createEnvelope(session, 'generation-1', 2), 'generation-1'),
			wrongGeneration: await database.upsertSessionV2(createEnvelope(session, 'generation-2', 0), 'unknown-generation'),
			transitioned: await database.upsertSessionV2(createEnvelope(session, 'generation-2', 0), 'generation-1'),
			delayedOldGeneration: await database.upsertSessionV2(createEnvelope(session, 'generation-1', 3), 'generation-1'),
		};

		assert.deepStrictEqual({
			results,
			row: await database.getSessionV2(session),
		}, {
			results: {
				stale: 'stale',
				conflict: 'conflict',
				replayed: 'replayed',
				wrongGeneration: 'generationMismatch',
				transitioned: 'applied',
				delayedOldGeneration: 'generationMismatch',
			},
			row: storedRow(createEnvelope(session, 'generation-2', 0), { provider: 'copilot', startTime: 1, modifiedTime: 1, external: false, source: 'explicit' }),
		});
	});

	test('serializes concurrent upserts and an upsert racing deletion', async () => {
		database = new AgentHostDatabase(':memory:');
		const sessions = Array.from({ length: 20 }, (_, index) => `session://concurrent-${index}`);
		for (const session of sessions) {
			await database.registerSessionV2(session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		}

		const upsertResults = await Promise.all(sessions.map(session => database!.upsertSessionV2(createEnvelope(session, 'generation-1', 1), undefined)));
		const racingSession = sessions[0];
		const [racingUpsert] = await Promise.all([
			database.upsertSessionV2(createEnvelope(racingSession, 'generation-1', 2), 'generation-1'),
			database.unregisterSessionV2(racingSession),
		]);

		assert.deepStrictEqual({
			upsertResults,
			racingUpsert,
			deletedRow: await database.getSessionV2(racingSession),
			remainingRows: (await database.listSessionsV2()).length,
		}, {
			upsertResults: sessions.map(() => 'applied'),
			racingUpsert: 'applied',
			deletedRow: undefined,
			remainingRows: sessions.length - 1,
		});
	});

	test('updates current registration provenance without a catalog revision', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://provenance';
		await database.registerSessionV2(session, { provider: 'copilot', startTime: 1, source: 'discovery' }, { checkTombstone: true });
		await database.upsertSessionV2(createEnvelope(session, 'generation-1', 1), undefined);
		const discovered = await database.getSessionV2(session);

		await database.registerSessionV2(session, { provider: 'ignored-provider', startTime: 2, source: 'restore' }, { checkTombstone: false });
		const restored = await database.getSessionV2(session);
		await database.registerSessionV2(session, { provider: 'claude', startTime: 3, source: 'explicit' }, { checkTombstone: false });
		const explicit = await database.getSessionV2(session);

		assert.deepStrictEqual({
			discovered: discovered && { provider: discovered.provider, startTime: discovered.startTime, modifiedTime: discovered.startTime, external: discovered.external, source: discovered.source, sourceRevision: discovered.sourceRevision },
			restored: restored && { provider: restored.provider, startTime: restored.startTime, modifiedTime: restored.startTime, external: restored.external, source: restored.source, sourceRevision: restored.sourceRevision },
			explicit: explicit && { provider: explicit.provider, startTime: explicit.startTime, modifiedTime: explicit.startTime, external: explicit.external, source: explicit.source, sourceRevision: explicit.sourceRevision },
		}, {
			discovered: { provider: 'copilot', startTime: 1, modifiedTime: 1, external: true, source: 'discovery', sourceRevision: 1 },
			restored: { provider: 'copilot', startTime: 1, modifiedTime: 1, external: false, source: 'restore', sourceRevision: 1 },
			explicit: { provider: 'claude', startTime: 1, modifiedTime: 1, external: false, source: 'explicit', sourceRevision: 1 },
		});
	});

	test('updates incomplete current provenance without changing the projection revision', async () => {
		const path = join(temporaryDirectory!, 'external-backfill.db');
		const session = 'session://external-backfill';
		database = new AgentHostDatabase(path);
		await database.registerSessionV2(session, { provider: 'copilot', startTime: 1, source: 'restore' }, { checkTombstone: false });
		await database.upsertSessionV2(createEnvelope(session, 'generation-1', 1), undefined);
		await database.close();
		database = undefined;

		const rawDatabase = await openDatabase(path);
		await exec(rawDatabase, `UPDATE sessions_v2 SET external = NULL WHERE session_uri = '${session}'`);
		await close(rawDatabase);

		database = new AgentHostDatabase(path);
		await database.updateSessionV2External([{ session, external: true }]);
		const row = await database.getSessionV2(session);

		assert.deepStrictEqual(row && {
			external: row.external,
			source: row.source,
			sourceRevision: row.sourceRevision,
		}, {
			external: true,
			source: 'discovery',
			sourceRevision: 1,
		});
	});

	test('legacy reconciliation returns the exact identity after merging modified time', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://legacy-reconciliation-identity';
		await database.registerSessionV2(session, {
			provider: 'copilot',
			startTime: 20,
			modifiedTime: 40,
			source: 'restore',
		}, { checkTombstone: true });

		const reconciled = await database.reconcileSessionV2RegistrationFromLegacy(session, {
			session,
			provider: 'copilot',
			startTime: 10,
			modifiedTime: 30,
			external: true,
			source: 'discovery',
		});

		assert.deepStrictEqual({
			reconciled,
			stored: await database.getSessionV2Registration(session),
		}, {
			reconciled: { session, provider: 'copilot', startTime: 10, modifiedTime: 40, external: true, source: 'discovery' },
			stored: { session, provider: 'copilot', startTime: 10, modifiedTime: 40, external: true, source: 'discovery' },
		});
	});

	test('runtime mutations atomically mirror current identity and provenance to legacy', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://runtime-mirror';
		await database.excludeSessionV2({
			provider: 'copilot',
			session,
			reason: 'providerAbsent',
			fingerprint: 'enumeration-v1',
		}, {
			identity: undefined,
			catalog: undefined,
		});

		await database.registerRuntimeSession(session, { provider: 'copilot', startTime: 10, source: 'restore' }, { checkTombstone: true });
		await database.registerRuntimeSession(session, { provider: 'copilot', startTime: 20, source: 'discovery' }, { checkTombstone: true });

		assert.deepStrictEqual({
			legacy: await database.getSession(session),
			current: await database.getSessionV2Registration(session),
			exclusion: await database.getSessionsV2Exclusion('copilot', session),
		}, {
			legacy: { session, provider: 'copilot', startTime: 10, modifiedTime: 20, external: true, source: 'discovery' },
			current: { session, provider: 'copilot', startTime: 10, modifiedTime: 20, external: true, source: 'discovery' },
			exclusion: undefined,
		});

		await database.unregisterRuntimeSession(session);
		assert.deepStrictEqual({
			legacy: await database.getSession(session),
			current: await database.getSessionV2Registration(session),
		}, {
			legacy: undefined,
			current: undefined,
		});
	});

	test('runtime registration seeds legacy identity before applying discovery conflicts', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://legacy-first-runtime';
		await database.registerSession(session, { provider: 'claude', startTime: 10, source: 'explicit' }, { checkTombstone: false });

		await database.registerRuntimeSession(session, { provider: 'copilot', startTime: 20, source: 'discovery' }, { checkTombstone: true });

		assert.deepStrictEqual({
			legacy: await database.getSession(session),
			current: await database.getSessionV2Registration(session),
			keys: await database.listRuntimeCompatibleSessionKeys(),
		}, {
			legacy: { session, provider: 'claude', startTime: 10, modifiedTime: 20, external: false, source: 'explicit' },
			current: { session, provider: 'claude', startTime: 10, modifiedTime: 20, external: false, source: 'explicit' },
			keys: [session],
		});
	});

	test('runtime provenance resolution mirrors both registries without changing catalog revision', async () => {
		const path = join(temporaryDirectory!, 'runtime-provenance.db');
		const session = 'session://runtime-provenance';
		database = new AgentHostDatabase(path);
		await database.registerRuntimeSession(session, { provider: 'copilot', startTime: 1, source: 'restore' }, { checkTombstone: false });
		await database.upsertSessionV2(createEnvelope(session, 'generation-1', 3), undefined);
		await database.close();
		database = undefined;

		const rawDatabase = await openDatabase(path);
		await exec(rawDatabase, `UPDATE sessions_v2 SET external = NULL WHERE session_uri = '${session}';
			UPDATE sessions SET external = NULL WHERE session_uri = '${session}'`);
		await close(rawDatabase);

		database = new AgentHostDatabase(path);
		await database.updateRuntimeSessionExternal([{ session, external: true }]);
		const current = await database.getSessionV2(session);
		assert.deepStrictEqual({
			legacy: await database.getSession(session),
			current: current && {
				session: current.session,
				provider: current.provider,
				startTime: current.startTime,
				modifiedTime: current.modifiedTime,
				external: current.external,
				source: current.source,
			},
			sourceRevision: current?.sourceRevision,
		}, {
			legacy: { session, provider: 'copilot', startTime: 1, modifiedTime: 1, external: true, source: 'discovery' },
			current: { session, provider: 'copilot', startTime: 1, modifiedTime: 1, external: true, source: 'discovery' },
			sourceRevision: 3,
		});
	}).timeout(10_000);

	test('runtime legacy mirror failure rolls back current registration', async () => {
		const path = join(temporaryDirectory!, 'runtime-rollback.db');
		database = new AgentHostDatabase(path);
		await database.listSessions();
		await database.close();
		database = undefined;

		const rawDatabase = await openDatabase(path);
		await exec(rawDatabase, `CREATE TRIGGER fail_legacy_runtime_insert
			BEFORE INSERT ON sessions
			BEGIN
				SELECT RAISE(ABORT, 'legacy mirror failed');
			END`);
		await close(rawDatabase);

		database = new AgentHostDatabase(path);
		const session = 'session://runtime-rollback';
		await assert.rejects(
			database.registerRuntimeSession(session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false }),
			/legacy mirror failed/,
		);
		assert.deepStrictEqual({
			legacy: await database.getSession(session),
			current: await database.getSessionV2Registration(session),
		}, {
			legacy: undefined,
			current: undefined,
		});
	});

	test('legacy and current rows diverge independently', async () => {
		const path = join(temporaryDirectory!, 'old-build.db');
		database = new AgentHostDatabase(path);
		const currentOnly = 'session://current-only';
		await database.registerSessionV2(currentOnly, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.upsertSessionV2(createEnvelope(currentOnly, 'generation-1', 1), undefined);
		await database.registerSession(currentOnly, { provider: 'claude', startTime: 99, source: 'discovery' }, { checkTombstone: true });
		await database.unregisterSession(currentOnly);
		await database.close();
		database = undefined;

		const oldBuildDatabase = await openDatabase(path);
		await exec(oldBuildDatabase, `INSERT INTO sessions (session_uri, provider, start_time, external, registration_source)
			VALUES ('session://old-build', 'copilot', 2, 1, 'discovery')`);
		await close(oldBuildDatabase);

		database = new AgentHostDatabase(path);
		assert.deepStrictEqual({
			currentOnlyLegacy: await database.getSession(currentOnly),
			currentOnlyV2: await database.getSessionV2(currentOnly),
			oldBuildSession: await database.getSession('session://old-build'),
			oldBuildSessionV2: await database.getSessionV2Registration('session://old-build'),
		}, {
			currentOnlyLegacy: undefined,
			currentOnlyV2: storedRow(createEnvelope(currentOnly, 'generation-1', 1), { provider: 'copilot', startTime: 1, modifiedTime: 1, external: false, source: 'explicit' }),
			oldBuildSession: { session: 'session://old-build', provider: 'copilot', startTime: 2, modifiedTime: 0, external: true, source: 'discovery' },
			oldBuildSessionV2: undefined,
		});
	}).timeout(10_000);

	test('legacy row absence is not current deletion', async () => {
		const path = join(temporaryDirectory!, 'old-build-orphan.db');
		const session = 'session://old-build-orphan';
		database = new AgentHostDatabase(path);
		await database.registerSessionV2(session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.upsertSessionV2(createEnvelope(session, 'generation-1', 1), undefined);
		await database.close();
		database = undefined;

		const oldBuildDatabase = await openDatabase(path);
		await exec(oldBuildDatabase, `PRAGMA foreign_keys = OFF; DELETE FROM sessions WHERE session_uri = '${session}'`);
		const orphanRows = await all(oldBuildDatabase, `SELECT session_uri FROM sessions_v2 WHERE session_uri = '${session}'`);
		await close(oldBuildDatabase);

		database = new AgentHostDatabase(path);
		assert.deepStrictEqual({
			orphanRows,
			get: await database.getSessionV2(session),
			list: await database.listSessionsV2(),
		}, {
			orphanRows: [{ session_uri: session }],
			get: storedRow(createEnvelope(session, 'generation-1', 1), { provider: 'copilot', startTime: 1, modifiedTime: 1, external: false, source: 'explicit' }),
			list: [storedRow(createEnvelope(session, 'generation-1', 1), { provider: 'copilot', startTime: 1, modifiedTime: 1, external: false, source: 'explicit' })],
		});
	});

	test('tombstone prevents current import and explicit recreation clears it', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://tombstoned-read';
		await database.registerSessionV2(session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.upsertSessionV2(createEnvelope(session, 'generation-1', 1), undefined);
		await database.tombstoneAndUnregisterSession(session);
		const imported = await database.registerSessionV2(session, { provider: 'copilot', startTime: 2, source: 'discovery' }, { checkTombstone: true });
		const explicit = await database.registerSessionV2(session, { provider: 'claude', startTime: 3, source: 'explicit' }, { checkTombstone: false });

		assert.deepStrictEqual({
			imported,
			explicit,
			tombstoned: await database.isSessionTombstoned(session),
			registration: await database.getSessionV2Registration(session),
			complete: await database.getSessionV2(session),
		}, {
			imported: false,
			explicit: true,
			tombstoned: false,
			registration: { session, provider: 'claude', startTime: 3, modifiedTime: 3, external: false, source: 'explicit' },
			complete: undefined,
		});
	});

	test('discovery cannot claim a current identity owned by another provider', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'ahp-session:/shared-backing';
		const first = await database.registerRuntimeSession(session, { provider: 'claude', startTime: 1, source: 'discovery' }, { checkTombstone: true, discoveryBackingSession: 'claude:/shared-backing' });
		const second = await database.registerRuntimeSession(session, { provider: 'codex', startTime: 2, modifiedTime: 3, source: 'discovery' }, { checkTombstone: true, discoveryBackingSession: 'codex:/shared-backing' });

		assert.deepStrictEqual({
			first,
			second,
			registration: await database.getSessionV2Registration(session),
		}, {
			first: true,
			second: false,
			registration: { session, provider: 'claude', startTime: 1, modifiedTime: 1, external: true, source: 'discovery' },
		});
	});

	test('discovery cannot claim an identity reserved by another provider exclusion', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'ahp-session:/excluded-backing';
		await database.markSessionsV2Excluded({
			provider: 'claude',
			session,
			reason: 'staleExternal',
			fingerprint: 'test',
		});

		const registered = await database.registerRuntimeSession(session, {
			provider: 'codex',
			startTime: 1,
			source: 'discovery',
		}, {
			checkTombstone: true,
			discoveryBackingSession: 'codex:/excluded-backing',
		});

		assert.deepStrictEqual({
			registered,
			registration: await database.getSessionV2Registration(session),
			exclusions: await database.listAllSessionsV2Exclusions(),
		}, {
			registered: false,
			registration: undefined,
			exclusions: [{ provider: 'claude', session, reason: 'staleExternal', fingerprint: 'test' }],
		});
	});

	test('canonical discovery cannot bypass backing identity ownership', async () => {
		database = new AgentHostDatabase(':memory:');
		const backing = 'claude:/owned-backing';
		const canonical = 'ahp-session:/owned-backing';
		await database.registerRuntimeSession(backing, { provider: 'claude', startTime: 1, source: 'discovery' }, { checkTombstone: true, discoveryBackingSession: backing });

		const claimed = await database.registerRuntimeSession(canonical, {
			provider: 'claude',
			startTime: 2,
			source: 'discovery',
		}, {
			checkTombstone: true,
			discoveryBackingSession: backing,
		});
		await database.markSessionsV2Excluded({
			provider: 'claude',
			session: canonical,
			reason: 'staleExternal',
			fingerprint: 'test',
		});

		assert.deepStrictEqual({
			claimed,
			backing: await database.getSessionV2Registration(backing),
			canonical: await database.getSessionV2Registration(canonical),
			exclusions: await database.listAllSessionsV2Exclusions(),
		}, {
			claimed: false,
			backing: { session: backing, provider: 'claude', startTime: 1, modifiedTime: 1, external: true, source: 'discovery' },
			canonical: undefined,
			exclusions: [],
		});
	});

	test('canonical discovery cannot bypass a backing identity exclusion', async () => {
		database = new AgentHostDatabase(':memory:');
		const backing = 'claude:/excluded-backing-alias';
		const canonical = 'ahp-session:/excluded-backing-alias';
		await database.markSessionsV2Excluded({
			provider: 'claude',
			session: backing,
			reason: 'staleExternal',
			fingerprint: 'test',
		});

		const claimed = await database.registerRuntimeSession(canonical, {
			provider: 'claude',
			startTime: 1,
			source: 'discovery',
		}, {
			checkTombstone: true,
			discoveryBackingSession: backing,
		});

		assert.deepStrictEqual({
			claimed,
			canonical: await database.getSessionV2Registration(canonical),
			exclusions: await database.listAllSessionsV2Exclusions(),
		}, {
			claimed: false,
			canonical: undefined,
			exclusions: [{ provider: 'claude', session: backing, reason: 'staleExternal', fingerprint: 'test' }],
		});
	});

	test('non-native provider exclusions do not alias standard session identities', async () => {
		database = new AgentHostDatabase(':memory:');
		const standard = 'ahp-session:/shared';
		const custom = 'custom-provider:/shared';
		await database.registerRuntimeSession(standard, { provider: 'claude', startTime: 1, source: 'explicit' }, { checkTombstone: false });

		await database.markSessionsV2Excluded({
			provider: 'custom-provider',
			session: custom,
			reason: 'staleExternal',
			fingerprint: 'test',
		});

		assert.deepStrictEqual(await database.listAllSessionsV2Exclusions(), [{
			provider: 'custom-provider',
			session: custom,
			reason: 'staleExternal',
			fingerprint: 'test',
		}]);
	});

	test('discovery ignores exclusion keys whose session only has a matching suffix', async () => {
		database = new AgentHostDatabase(':memory:');
		const canonical = 'ahp-session:/x';
		await database.markSessionsV2Excluded({
			provider: 'custom-provider',
			session: 'custom:/prefixahp-session:/x',
			reason: 'staleExternal',
			fingerprint: 'test',
		});

		const registered = await database.registerRuntimeSession(canonical, {
			provider: 'codex',
			startTime: 1,
			source: 'discovery',
		}, {
			checkTombstone: true,
			discoveryBackingSession: 'codex:/x',
		});

		assert.deepStrictEqual({
			registered,
			registration: await database.getSessionV2Registration(canonical),
		}, {
			registered: true,
			registration: { session: canonical, provider: 'codex', startTime: 1, modifiedTime: 1, external: true, source: 'discovery' },
		});
	});

	test('payload-versioned markers do not alter old marker semantics', async () => {
		database = new AgentHostDatabase(':memory:');
		await database.markSessionRegistryBackfilled();
		await database.markProviderBackfilled('copilot');
		await database.markSessionsV2Backfilled('copilot', 5);

		assert.deepStrictEqual({
			global: await database.isSessionRegistryBackfilled(),
			provider: await database.isProviderBackfilled('copilot'),
			currentV4: await database.isSessionsV2Backfilled('copilot', 4),
			currentV5: await database.isSessionsV2Backfilled('copilot', 5),
			claudeV5: await database.isSessionsV2Backfilled('claude', 5),
		}, {
			global: true,
			provider: true,
			currentV4: false,
			currentV5: true,
			claudeV5: false,
		});
	});

	test('repeated current registration keeps one incomplete row', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://incomplete';
		await Promise.all(Array.from({ length: 20 }, () => database!.registerSessionV2(
			session,
			{ provider: 'copilot', startTime: 1, source: 'discovery' },
			{ checkTombstone: true },
		)));

		assert.deepStrictEqual({
			registrations: await database.listSessionV2Registrations(),
			complete: await database.listSessionsV2(),
		}, {
			registrations: [{ session, provider: 'copilot', startTime: 1, modifiedTime: 1, external: true, source: 'discovery' }],
			complete: [],
		});
	});

	test('current-v2 exclusions are durable, hide rows, and clear on eligible registration', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'copilot:/excluded';
		await database.registerSessionV2(session, { provider: 'copilot', startTime: 1, source: 'discovery' }, { checkTombstone: true });
		await database.upsertSessionV2(createEnvelope(session, 'generation-1', 1), undefined);
		await database.excludeSessionV2({
			provider: 'copilot',
			session,
			reason: 'staleExternal',
			fingerprint: '123',
		}, {
			identity: await database.getSessionV2Registration(session),
			catalog: {
				sessionGeneration: 'generation-1',
				sourceRevision: 1,
				payloadHash: createEnvelope(session, 'generation-1', 1).payloadHash,
			},
		});

		const excluded = {
			single: await database.getSessionsV2Exclusion('copilot', session),
			list: await database.listSessionsV2Exclusions('copilot'),
			registration: await database.getSessionV2Registration(session),
			projection: await database.getSessionV2(session),
		};
		await database.registerSessionV2(session, { provider: 'copilot', startTime: 2, source: 'discovery' }, { checkTombstone: true });

		assert.deepStrictEqual({
			excluded,
			revivedExclusion: await database.getSessionsV2Exclusion('copilot', session),
			revivedRegistration: await database.getSessionV2Registration(session),
		}, {
			excluded: {
				single: { provider: 'copilot', session, reason: 'staleExternal', fingerprint: '123' },
				list: [{ provider: 'copilot', session, reason: 'staleExternal', fingerprint: '123' }],
				registration: undefined,
				projection: undefined,
			},
			revivedExclusion: undefined,
			revivedRegistration: { session, provider: 'copilot', startTime: 2, modifiedTime: 2, external: true, source: 'discovery' },
		});
	});

	test('batches provider exclusions and lists only the indexed provider range', async () => {
		database = new AgentHostDatabase(':memory:');
		await database.markSessionsV2ExcludedBatch?.([
			{ provider: 'copilot', session: 'copilot:/a', reason: 'staleExternal', fingerprint: '1' },
			{ provider: 'copilot', session: 'copilot:/b', reason: 'backing', fingerprint: 'backing-v1' },
			{ provider: 'claude', session: 'claude:/c', reason: 'subagent', fingerprint: 'uri-v1' },
		]);

		assert.deepStrictEqual(await database.listSessionsV2Exclusions('copilot'), [
			{ provider: 'copilot', session: 'copilot:/a', reason: 'staleExternal', fingerprint: '1' },
			{ provider: 'copilot', session: 'copilot:/b', reason: 'backing', fingerprint: 'backing-v1' },
		]);
		assert.deepStrictEqual(await database.listAllSessionsV2Exclusions(), [
			{ provider: 'claude', session: 'claude:/c', reason: 'subagent', fingerprint: 'uri-v1' },
			{ provider: 'copilot', session: 'copilot:/a', reason: 'staleExternal', fingerprint: '1' },
			{ provider: 'copilot', session: 'copilot:/b', reason: 'backing', fingerprint: 'backing-v1' },
		]);
	});

	test('atomically excludes identities and ignores stale discovery exclusions after registration', async () => {
		database = new AgentHostDatabase(':memory:');
		const excluded = 'copilot:/atomic-exclusion';
		const registered = 'copilot:/registered-before-batch';
		await database.registerSessionV2(excluded, { provider: 'copilot', startTime: 1, source: 'discovery' }, { checkTombstone: true });
		await database.upsertSessionV2(createEnvelope(excluded, 'generation-1', 1), undefined);

		await database.excludeSessionV2({
			provider: 'copilot',
			session: excluded,
			reason: 'staleExternal',
			fingerprint: '1',
		}, {
			identity: await database.getSessionV2Registration(excluded),
			catalog: {
				sessionGeneration: 'generation-1',
				sourceRevision: 1,
				payloadHash: createEnvelope(excluded, 'generation-1', 1).payloadHash,
			},
		});
		const excludedUpsert = await database.upsertSessionV2(createEnvelope(excluded, 'generation-1', 2), 'generation-1');

		await database.registerSessionV2(registered, { provider: 'copilot', startTime: 2, source: 'discovery' }, { checkTombstone: true });
		await database.markSessionsV2ExcludedBatch?.([{
			provider: 'copilot',
			session: registered,
			reason: 'staleExternal',
			fingerprint: '2',
		}]);

		assert.deepStrictEqual({
			excludedRegistration: await database.getSessionV2Registration(excluded),
			excludedMarker: await database.getSessionsV2Exclusion('copilot', excluded),
			excludedUpsert,
			registeredIdentity: await database.getSessionV2Registration(registered),
			staleMarker: await database.getSessionsV2Exclusion('copilot', registered),
		}, {
			excludedRegistration: undefined,
			excludedMarker: { provider: 'copilot', session: excluded, reason: 'staleExternal', fingerprint: '1' },
			excludedUpsert: 'missingSession',
			registeredIdentity: { session: registered, provider: 'copilot', startTime: 2, modifiedTime: 2, external: true, source: 'discovery' },
			staleMarker: undefined,
		});
	});

	test('discovery registration racing exclusion preserves the newly registered identity and payload', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'copilot:/exclusion-registration-race';
		const observed = {
			identity: await database.getSessionV2Registration(session),
			catalog: undefined,
		};
		const envelope = createEnvelope(session, 'discovery-generation', 1);

		await database.registerSessionV2(session, {
			provider: 'copilot',
			startTime: 10,
			modifiedTime: 20,
			source: 'discovery',
		}, { checkTombstone: true });
		await database.upsertSessionV2(envelope, undefined);
		const exclusion = await database.excludeSessionV2({
			provider: 'copilot',
			session,
			reason: 'staleExternal',
			fingerprint: '1',
		}, observed);

		assert.deepStrictEqual({
			exclusion,
			identity: await database.getSessionV2Registration(session),
			payload: (await database.getSessionV2(session))?.payloadHash,
			marker: await database.getSessionsV2Exclusion('copilot', session),
		}, {
			exclusion: 'stale',
			identity: { session, provider: 'copilot', startTime: 10, modifiedTime: 20, external: true, source: 'discovery' },
			payload: envelope.payloadHash,
			marker: undefined,
		});
	});

	suite('catalog-only normalized authority', () => {
		const session = 'session://normalized';
		const defaultChat = `${session}#default`;
		const peer = `${session}#peer`;
		const privateChat = `${session}#private`;

		function candidate(): IAgentHostDatabaseChatV2NormalizationCandidate {
			return {
				defaultChat: { chat: defaultChat, order: 1, storageResource: 'storage://default' },
				peers: [{ chat: peer, order: 0, storageResource: 'storage://peer' }],
				privateDescendants: [{ chat: privateChat, parentChat: peer, storageResource: 'storage://private' }],
			};
		}

		function envelope(): IAgentHostDatabaseSessionV2Envelope {
			return createEnvelope(session, 'catalog-generation', 10, {
				payload: stableStringify({
					payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
					data: {
						modifiedTime: 110, isRead: false, isArchived: true, workingDirectories: [],
						chats: [
							{
								uri: peer, kind: 'peer', order: 0, summary: 'User title', titleSource: 'user', isRead: false,
								archived: true, inheritedTurnId: 't'.repeat(4096), workingDirectories: ['file:///first', 'file:///second'],
								origin: { kind: 'subagent' }, interactivity: ChatInteractivity.ReadOnly, changes: { additions: 1, deletions: 2, files: 3 }
							},
							{
								uri: privateChat, kind: 'peer', order: 1, summary: 'Private', isRead: true,
								archived: true, inheritedTurnId: 'private-turn', workingDirectories: [], interactivity: ChatInteractivity.Hidden
							},
							{
								uri: defaultChat, kind: 'default', order: 2, summary: 'Default', titleSource: 'auto',
								isRead: true, archived: true, inheritedTurnId: 'default-turn', changes: { files: 4 }
							},
						],
					},
				}),
			});
		}

		async function seed(target = database!): Promise<void> {
			await target.registerSessionV2(session, { provider: 'copilot', startTime: 100, source: 'explicit' }, { checkTombstone: true });
			await target.upsertSessionV2(envelope(), undefined);
		}

		function expectation(catalogRevision = 0) {
			const source = envelope();
			return { sessionGeneration: source.sessionGeneration, sourceRevision: source.sourceRevision, payloadHash: source.payloadHash, catalogRevision };
		}

		suite('one-way legacy SQL projection', () => {
			async function seedNormalized(): Promise<{ instance: AgentHostDatabase; raw: Database }> {
				const instance = new AgentHostDatabase(':memory:');
				database = instance;
				await seed(instance);
				await instance.ensureChatCatalogV2(session, expectation(), candidate());
				// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Query the actual legacy SQL tables, not the V2-aware API.
				return { instance, raw: await instance['_ensureDatabase']() };
			}

			test('activation projects exact schema13 columns without default/private rows or mirror acknowledgements', async () => {
				const instance = new AgentHostDatabase(':memory:');
				database = instance;
				await seed(instance);
				await instance.replaceSessionChatCatalog(session, [{
					chat: peer, order: 0, providerData: 'opaque \'provider\'', origin: '{"kind":"subagent"}',
					isRead: false, archived: true, inheritedTurnId: 't'.repeat(4096),
				}], undefined);
				await instance.markSessionChatCatalogLegacyMirrored(session, 1, 'unchanged-backing-mirror');
				const aggregate = await instance.getSessionV2(session);
				const result = await instance.ensureChatCatalogV2(session, expectation(1), candidate());
				// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Exercise the unchanged schema13 SQL reader.
				const raw = await instance['_ensureDatabase']();
				assert.deepStrictEqual({
					result, rows: await readLegacySessionChatCatalog(raw, session),
					aggregate: await instance.getSessionV2(session),
				}, {
					result: { status: 'applied', catalogRevision: 2 },
					rows: [{
						revision: 2, legacy_mirrored_revision: 1, legacy_mirrored_payload: 'unchanged-backing-mirror',
						chat_uri: peer, chat_order: 0, is_read: 0, archived: 1, provider_data: 'opaque \'provider\'',
						origin: '{"kind":"subagent"}', inherited_turn_id: 't'.repeat(4096),
					}],
					aggregate,
				});
			});

			test('direct registration replaces stale retained peers and projects compact order around a nonzero exact default', async () => {
				const instance = new AgentHostDatabase(':memory:');
				database = instance;
				await instance.registerRuntimeSession(session, { provider: 'copilot', startTime: 100, source: 'explicit' }, { checkTombstone: true });
				// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Seed an orphaned retained legacy row to exercise full snapshot replacement.
				const raw = await instance['_ensureDatabase']();
				await exec(raw, `PRAGMA foreign_keys = OFF;
					INSERT INTO session_chats (session_uri, chat_uri, chat_order) VALUES ('${session}', 'chat://stale-retained', 0);
					PRAGMA foreign_keys = ON;`);
				const second = `${session}#default-shaped-peer`;
				const result = await instance.registerChatCatalogV2(session, {
					...candidate(), peers: [...candidate().peers, { chat: second, order: 2 }],
				});
				assert.deepStrictEqual({
					result,
					rows: (await readLegacySessionChatCatalog(raw, session)).map(row => [row.chat_uri, row.chat_order, row.revision]),
					default: (await instance.readCatalogSnapshot([session]))[0].header?.defaultChatUri,
				}, { result: { status: 'applied', catalogRevision: 1 }, rows: [[peer, 0, 1], [second, 1, 1]], default: defaultChat });
			});

			test('add reorder removal and private closure tombstones project final membership with one header advance', async () => {
				const { instance, raw } = await seedNormalized();
				const added = `${session}#added`;
				const initial = (await instance.getSessionChatCatalog(session))!.chats[0];
				const add = await instance.replaceSessionChatCatalog(session, [initial, { chat: added, order: 1 }], 1);
				const afterAdd = (await readLegacySessionChatCatalog(raw, session)).map(row => [row.chat_uri, row.chat_order, row.revision]);
				const reorder = await instance.replaceSessionChatCatalog(session, [{ chat: added, order: 0 }, { ...initial, order: 1 }], 2);
				const afterReorder = (await readLegacySessionChatCatalog(raw, session)).map(row => [row.chat_uri, row.chat_order, row.revision]);
				const remove = await instance.replaceSessionChatCatalog(session, [{ chat: added, order: 0 }], 3);
				const recreate = await instance.replaceSessionChatCatalog(session, [{ chat: added, order: 0 }, { chat: peer, order: 1 }], 4);
				assert.deepStrictEqual({
					add, afterAdd, reorder, afterReorder, remove, recreate,
					final: (await readLegacySessionChatCatalog(raw, session)).map(row => [row.chat_uri, row.chat_order, row.revision]),
					deleted: await all(raw, 'SELECT chat_uri, tombstoned FROM chats_v2 WHERE chat_uri IN (?, ?) ORDER BY chat_uri', [peer, privateChat]),
				}, {
					add: { status: 'applied', revision: 2 }, afterAdd: [[peer, 0, 2], [added, 1, 2]],
					reorder: { status: 'applied', revision: 3 }, afterReorder: [[added, 0, 3], [peer, 1, 3]],
					remove: { status: 'applied', revision: 4 }, recreate: { status: 'conflict' }, final: [[added, 0, 4]],
					deleted: [{ chat_uri: peer, tombstoned: 1 }, { chat_uri: privateChat, tombstoned: 1 }],
				});
			});

			test('public legacy metadata updates and clears preserve immutable storage and unrelated aggregate payload', async () => {
				const { instance, raw } = await seedNormalized();
				const aggregate = await instance.getSessionV2(session);
				const update = await instance.updateChatV2Metadata(peer, { ownershipRevision: 0, metadataRevision: 0 }, {
					providerData: 'opaque', origin: '{"kind":"fork"}', inheritedTurnId: 'updated-turn', isRead: true, archived: false,
				});
				const updated = (await readLegacySessionChatCatalog(raw, session))[0];
				const cleared = await instance.updateChatV2Metadata(peer, { ownershipRevision: 0, metadataRevision: 1 }, {
					providerData: null, origin: null, inheritedTurnId: null, isRead: false, archived: true,
				});
				assert.deepStrictEqual({
					update, updated, cleared, rows: await readLegacySessionChatCatalog(raw, session),
					storage: (await instance.readChatV2(session, peer)).chat?.storageResource,
					aggregateUnchanged: stableStringify(await instance.getSessionV2(session)) === stableStringify(aggregate),
				}, {
					update: { status: 'applied', catalogRevision: 2 },
					updated: {
						revision: 2, legacy_mirrored_revision: 0, legacy_mirrored_payload: null, chat_uri: peer, chat_order: 0,
						is_read: 1, archived: 0, provider_data: 'opaque', origin: '{"kind":"fork"}', inherited_turn_id: 'updated-turn',
					},
					cleared: { status: 'applied', catalogRevision: 3 },
					rows: [{
						revision: 3, legacy_mirrored_revision: 0, legacy_mirrored_payload: null, chat_uri: peer, chat_order: 0,
						is_read: 0, archived: 1, provider_data: null, origin: null, inherited_turn_id: null,
					}],
					storage: 'storage://peer', aggregateUnchanged: true,
				});
			});

			test('private lifecycle and default-only metadata advance the header without rewriting peer projection', async () => {
				const { instance, raw } = await seedNormalized();
				await exec(raw, `CREATE TRIGGER reject_unnecessary_projection BEFORE DELETE ON session_chats
					BEGIN SELECT RAISE(ABORT, 'unnecessary public projection'); END`);
				const inserted = await instance.insertPrivateChatV2(session, {
					chat: 'chat://nested-private', parentChat: privateChat, metadata: { interactivity: ChatInteractivity.Hidden },
				}, 1);
				const metadata = await instance.updateChatV2Metadata(privateChat, { ownershipRevision: 0, metadataRevision: 0 }, { providerData: 'private-only' });
				const defaultUpdated = await instance.updateChatV2Metadata(defaultChat, { ownershipRevision: 0, metadataRevision: 0 }, { isRead: false });
				const removed = await instance.removePrivateChatV2(session, privateChat, 4);
				assert.deepStrictEqual({
					inserted, metadata, defaultUpdated, removed,
					rows: (await readLegacySessionChatCatalog(raw, session)).map(row => [row.chat_uri, row.chat_order, row.revision]),
					tombstones: await all(raw, 'SELECT tombstoned FROM chats_v2 WHERE chat_uri = ?', ['chat://nested-private']),
				}, {
					inserted: { status: 'applied', catalogRevision: 2 }, metadata: { status: 'applied', catalogRevision: 3 },
					defaultUpdated: { status: 'applied', catalogRevision: 4 }, removed: { status: 'applied', catalogRevision: 5 },
					rows: [[peer, 0, 5]], tombstones: [{ tombstoned: 1 }],
				});
			});

			for (const activation of [true, false]) {
				test(`${activation ? 'activated' : 'directly registered'} single-default sessions preserve both registries with zero legacy peers`, async () => {
					const instance = new AgentHostDatabase(':memory:');
					database = instance;
					await instance.registerRuntimeSession(session, { provider: 'copilot', startTime: 100, source: 'explicit' }, { checkTombstone: true });
					const singleDefault = { defaultChat: { chat: defaultChat, order: 0 }, peers: [], privateDescendants: [] };
					if (activation) {
						const source = createEnvelope(session, 'single-default', 1, {
							payload: stableStringify({
								payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
								data: { modifiedTime: 100, isRead: false, isArchived: false, workingDirectories: [], chats: [{ uri: defaultChat, kind: 'default', order: 0 }] },
							}),
						});
						await instance.upsertSessionV2(source, undefined);
						await instance.ensureChatCatalogV2(session, {
							sessionGeneration: source.sessionGeneration, sourceRevision: source.sourceRevision, payloadHash: source.payloadHash, catalogRevision: 0,
						}, singleDefault);
					} else {
						await instance.registerChatCatalogV2(session, singleDefault);
					}
					// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Inspect both old identity and peer surfaces.
					const raw = await instance['_ensureDatabase']();
					const aggregate = await instance.getSessionV2(session);
					const before = {
						registry: await all(raw, 'SELECT session_uri FROM sessions'),
						v2Registry: (await readLegacySessionV2Registrations(raw)).map(row => row.session_uri),
						aggregate,
						header: await all(raw, 'SELECT session_uri, revision, default_chat_uri FROM session_chat_catalogs'),
						legacy: await readLegacySessionChatCatalog(raw, session),
					};
					await instance.tombstoneAndUnregisterSession(session);
					assert.deepStrictEqual({
						before,
						after: {
							registry: await all(raw, 'SELECT session_uri FROM sessions'),
							v2Registry: await readLegacySessionV2Registrations(raw),
							aggregate: await instance.getSessionV2(session),
							legacy: await readLegacySessionChatCatalog(raw, session),
							tombstoned: await instance.isSessionTombstoned(session),
							chat: await all(raw, 'SELECT chat_uri, tombstoned FROM chats_v2'),
						},
					}, {
						before: {
							registry: [{ session_uri: session }], v2Registry: [session], aggregate,
							header: [{ session_uri: session, revision: 1, default_chat_uri: defaultChat }],
							legacy: [{
								revision: 1, legacy_mirrored_revision: 0, legacy_mirrored_payload: null,
								chat_uri: null, chat_order: null, is_read: null, archived: null, provider_data: null, origin: null, inherited_turn_id: null,
							}],
						},
						after: { registry: [], v2Registry: [], aggregate: undefined, legacy: [], tombstoned: true, chat: [{ chat_uri: defaultChat, tombstoned: 1 }] },
					});
				});
			}

			test('schema13 registration reader excludes explicit tombstones and provider exclusions without changing authority', async () => {
				const { instance, raw } = await seedNormalized();
				const before = (await readLegacySessionV2Registrations(raw)).map(row => row.session_uri);
				await exec(raw, `INSERT INTO metadata (key, value) VALUES ('sessionTombstone:${session}', 'true')`);
				const tombstoned = await readLegacySessionV2Registrations(raw);
				await exec(raw, `DELETE FROM metadata WHERE key = 'sessionTombstone:${session}';
					INSERT INTO metadata (key, value) VALUES ('sessionsV2Excluded:copilot:${session}', 'excluded')`);
				const excluded = await readLegacySessionV2Registrations(raw);
				await exec(raw, `DELETE FROM metadata WHERE key = 'sessionsV2Excluded:copilot:${session}'`);
				assert.deepStrictEqual({
					before, tombstoned, excluded, restored: (await readLegacySessionV2Registrations(raw)).map(row => row.session_uri),
					authority: (await instance.readCatalogSnapshot([session]))[0].authorityVersion,
				}, { before: [session], tombstoned: [], excluded: [], restored: [session], authority: 2 });
			});

			for (const operation of ['tombstone', 'unregister', 'exclude'] as const) {
				test(`${operation} cascades projected peers and leaves globally tombstoned identities`, async () => {
					const { instance, raw } = await seedNormalized();
					const before = (await readLegacySessionChatCatalog(raw, session)).map(row => row.chat_uri);
					if (operation === 'tombstone') {
						await instance.tombstoneAndUnregisterSession(session);
					} else if (operation === 'unregister') {
						await instance.unregisterRuntimeSession(session);
					} else {
						await instance.excludeSessionV2({ provider: 'copilot', session, reason: 'staleExternal', fingerprint: '1' }, {
							identity: await instance.getSessionV2Registration(session), catalog: await instance.getSessionV2(session),
						});
					}
					assert.deepStrictEqual({
						before, rows: await readLegacySessionChatCatalog(raw, session),
						chats: (await all(raw, 'SELECT tombstoned FROM chats_v2')).map(row => row.tombstoned),
						stale: await instance.updateChatV2Metadata(peer, { ownershipRevision: 0, metadataRevision: 0 }, { isRead: true }),
					}, { before: [peer], rows: [], chats: [1, 1, 1], stale: { status: 'conflict' } });
				});
			}

			test('projection insert failure rolls back authoritative membership metadata closure and header after legacy DELETE', async () => {
				const { instance, raw } = await seedNormalized();
				const before = {
					normalized: await instance.readCatalogSnapshot([session]), legacy: await readLegacySessionChatCatalog(raw, session),
				};
				await exec(raw, `CREATE TRIGGER reject_projection BEFORE INSERT ON session_chats
					BEGIN SELECT RAISE(ABORT, 'projection failed'); END`);
				await assert.rejects(instance.replaceSessionChatCatalog(session, [{ chat: 'chat://replacement', order: 0 }], 1), /projection failed/);
				await assert.rejects(instance.updateChatV2Metadata(peer, { ownershipRevision: 0, metadataRevision: 0 }, { providerData: 'must-roll-back' }), /projection failed/);
				assert.deepStrictEqual({
					normalized: await instance.readCatalogSnapshot([session]), legacy: await readLegacySessionChatCatalog(raw, session),
				}, before);
			});

			for (const activation of [true, false]) {
				test(`${activation ? 'activation' : 'direct registration'} projection failure rolls back header and normalized rows`, async () => {
					const instance = new AgentHostDatabase(':memory:');
					database = instance;
					if (activation) {
						await seed(instance);
					} else {
						await instance.registerRuntimeSession(session, { provider: 'copilot', startTime: 100, source: 'explicit' }, { checkTombstone: true });
					}
					// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Inject a failure in the actual SQL projection.
					const raw = await instance['_ensureDatabase']();
					const aggregate = await instance.getSessionV2(session);
					await exec(raw, `CREATE TRIGGER reject_projection BEFORE INSERT ON session_chats
						BEGIN SELECT RAISE(ABORT, 'projection failed'); END`);
					await assert.rejects(activation
						? instance.ensureChatCatalogV2(session, expectation(), candidate())
						: instance.registerChatCatalogV2(session, candidate()), /projection failed/);
					assert.deepStrictEqual({
						normalized: await all(raw, 'SELECT chat_uri FROM chats_v2'),
						legacy: await readLegacySessionChatCatalog(raw, session),
						aggregate: await instance.getSessionV2(session),
					}, { normalized: [], legacy: [], aggregate });
				});
			}

			test('legacy-only old writer edits are never imported and the next V2 mutation restores full SQL membership', async () => {
				const { instance, raw } = await seedNormalized();
				const normalized = await instance.readCatalogSnapshot([session]);
				await exec(raw, `DELETE FROM session_chats WHERE session_uri = '${session}';
					INSERT INTO session_chats (session_uri, chat_uri, chat_order, provider_data) VALUES ('${session}', 'chat://old-only', 0, 'old-write');
					UPDATE session_chat_catalogs SET revision = 2 WHERE session_uri = '${session}';`);
				const stale = await instance.replaceSessionChatCatalog(session, [], 1);
				const replay = await instance.ensureChatCatalogV2(session, expectation(), candidate());
				const unchanged = (await instance.readCatalogSnapshot([session]))[0].chats;
				const restored = await instance.replaceSessionChatCatalog(session, (await instance.getSessionChatCatalog(session))!.chats, 2);
				assert.deepStrictEqual({
					stale, replay, unchanged, restored,
					legacy: (await readLegacySessionChatCatalog(raw, session)).map(row => [row.chat_uri, row.chat_order, row.revision]),
					oldIdentities: await all(raw, 'SELECT chat_uri FROM chats_v2 WHERE chat_uri = ?', ['chat://old-only']),
					importResult: await instance.upsertSessionV2(envelope(), 'catalog-generation'),
				}, {
					stale: { status: 'conflict' }, replay: { status: 'replayed', catalogRevision: 2 },
					unchanged: normalized[0].chats, restored: { status: 'applied', revision: 3 },
					legacy: [[peer, 0, 3]], oldIdentities: [], importResult: 'conflict',
				});
			});

			test('1000-chat projection uses two bounded SQL writes and retains one-SELECT list and point reads', async () => {
				const instance = new AgentHostDatabase(':memory:');
				database = instance;
				await instance.registerRuntimeSession(session, { provider: 'copilot', startTime: 100, source: 'explicit' }, { checkTombstone: true });
				const peers = Array.from({ length: AGENT_HOST_CATALOG_CHILD_LIMIT - 1 }, (_, order) => ({ chat: `chat://sql-projection-${order}`, order }));
				await instance.registerChatCatalogV2(session, {
					defaultChat: { chat: defaultChat, order: peers.length }, peers, privateDescendants: [],
				});
				// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Count actual SQL statements at the maximum supported normalized size.
				const raw = await instance['_ensureDatabase']();
				const statements: string[] = [];
				const committed = new DeferredPromise<void>();
				const trace = (sql: string) => {
					statements.push(sql);
					if (sql === 'COMMIT') {
						void committed.complete();
					}
				};
				raw.on('trace', trace);
				try {
					await instance.replaceSessionChatCatalog(session, [...peers].reverse().map((chat, order) => ({ ...chat, order })), 1);
					await committed.p;
				} finally {
					raw.removeListener('trace', trace);
				}
				const reads: string[] = [];
				const readTraced = new DeferredPromise<void>();
				const readTrace = (sql: string) => {
					reads.push(sql);
					if (/^\s*SELECT h\.authority_version\b/.test(sql)) {
						void readTraced.complete();
					}
				};
				raw.on('trace', readTrace);
				try {
					await instance.readSessionListCatalogs([session]);
					await instance.readChatV2(session, peers[0].chat);
					await readTraced.p;
				} finally {
					raw.removeListener('trace', readTrace);
				}
				const rows = await readLegacySessionChatCatalog(raw, session);
				assert.deepStrictEqual({
					projectionWrites: statements.filter(sql => /^(?:DELETE FROM|INSERT INTO) session_chats\b/.test(sql)).map(sql => sql.split(/\s+/).slice(0, 3).join(' ')),
					readSelects: {
						total: reads.filter(sql => /^\s*SELECT\b/i.test(sql)).length,
						list: reads.filter(sql => /^\s*SELECT s\.session_uri, s\.provider\b/.test(sql)).length,
						point: reads.filter(sql => /^\s*SELECT h\.authority_version\b/.test(sql)).length,
					},
					rows: rows.map(row => [row.chat_uri, row.chat_order]),
				}, {
					projectionWrites: ['DELETE FROM session_chats', 'INSERT INTO session_chats'], readSelects: { total: 2, list: 1, point: 1 },
					rows: [...peers].reverse().map((chat, order) => [chat.chat, order]),
				});
			});
		});

		test('activation derives every lightweight field losslessly, including explicit private roles and default semantics', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			const activated = await database.ensureChatCatalogV2(session, expectation(), candidate());
			const [snapshot] = await database.readCatalogSnapshot([session]);
			const byUri = new Map(snapshot.chats.map(chat => [chat.chat, chat]));
			assert.deepStrictEqual({
				activated, header: snapshot.header,
				peer: byUri.get(peer), private: byUri.get(privateChat), default: byUri.get(defaultChat),
				detail: await database.getChatV2ProviderDetail(peer),
				privateDetail: await database.getChatV2ProviderDetail(privateChat),
			}, {
				activated: { status: 'applied', catalogRevision: 1 },
				header: {
					session, authorityVersion: 2, revision: 1, defaultChatUri: defaultChat,
					sessionGeneration: 'catalog-generation', normalizationSourceRevision: 10, normalizationPayloadHash: envelope().payloadHash
				},
				peer: {
					chat: peer, ownerSession: session, order: 0, storageResource: 'storage://peer',
					origin: '{"kind":"subagent"}', workingDirectories: ['file:///first', 'file:///second'],
					isRead: false, archived: true, inheritedTurnId: 't'.repeat(4096), ownershipRevision: 0, metadataRevision: 0,
					metadata: { summary: 'User title', titleSource: 'user', interactivity: ChatInteractivity.ReadOnly, changes: { additions: 1, deletions: 2, files: 3 } }
				},
				private: {
					chat: privateChat, ownerSession: session, storageResource: 'storage://private', parentChat: peer,
					workingDirectories: [],
					isRead: true, archived: true, inheritedTurnId: 'private-turn', ownershipRevision: 0, metadataRevision: 0,
					metadata: { summary: 'Private', interactivity: ChatInteractivity.Hidden }
				},
				default: {
					chat: defaultChat, ownerSession: session, order: 1, storageResource: 'storage://default',
					isRead: true, archived: true, inheritedTurnId: 'default-turn', ownershipRevision: 0, metadataRevision: 0,
					metadata: { summary: 'Default', titleSource: 'auto', interactivity: ChatInteractivity.Full, changes: { files: 4 } }
				},
				detail: {},
				privateDetail: {},
			});
		});

		test('rejects conflicting private interactivity, source read/archive/lineage, changes and ordered directories before cutover', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			const original = candidate();
			const conflicts: IAgentHostDatabaseChatV2NormalizationCandidate[] = [
				{ ...original, privateDescendants: [{ ...original.privateDescendants[0], metadata: { interactivity: ChatInteractivity.Full } }] },
				{ ...original, defaultChat: { ...original.defaultChat, isRead: false } },
				{ ...original, defaultChat: { ...original.defaultChat, archived: false } },
				{ ...original, defaultChat: { ...original.defaultChat, inheritedTurnId: 'wrong' } },
				{ ...original, peers: [{ ...original.peers[0], workingDirectories: ['file:///second', 'file:///first'] }] },
				{ ...original, peers: [{ ...original.peers[0], metadata: { summary: 'Lost title', changes: { files: 0 } } }] },
				{ ...original, privateDescendants: [] },
			];
			for (const input of conflicts) {
				await assert.rejects(database.ensureChatCatalogV2(session, expectation(), input));
			}
			assert.deepStrictEqual((await database.readCatalogSnapshot([session])).map(entry => ({ header: entry.header, chats: entry.chats })), [
				{ header: undefined, chats: [] },
			]);
		});

		test('source generation, revision, hash, dirty marker and central revision fence activation', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			const current = expectation();
			const results = [];
			for (const stale of [
				{ ...current, sessionGeneration: 'other' }, { ...current, sourceRevision: 9 },
				{ ...current, payloadHash: 'stale' }, { ...current, catalogRevision: 1 },
			]) {
				results.push(await database.ensureChatCatalogV2(session, stale, candidate()));
			}
			await database.markSessionV2PayloadDirty(session);
			results.push(await database.ensureChatCatalogV2(session, current, candidate()));
			assert.deepStrictEqual(results, [{ status: 'conflict' }, { status: 'conflict' }, { status: 'conflict' }, { status: 'conflict' }, { status: 'notReady' }]);
		});

		test('activation and first mutation roll back together on stale CAS and late SQL failure', async () => {
			const path = join(temporaryDirectory!, 'normalized-rollback.db');
			database = new AgentHostDatabase(path);
			await seed();
			const stale = await database.ensureChatCatalogV2(session, expectation(), candidate(), {
				chat: peer, expected: { ownershipRevision: 0, metadataRevision: 1 }, patch: { isRead: true },
			});
			const raw = await openDatabase(path);
			try {
				await exec(raw, `CREATE TRIGGER reject_normalized_patch BEFORE UPDATE ON chats_v2
					BEGIN SELECT RAISE(ABORT, 'late normalized failure'); END`);
				await assert.rejects(database.ensureChatCatalogV2(session, expectation(), candidate(), {
					chat: peer, expected: { ownershipRevision: 0, metadataRevision: 0 }, patch: { isRead: true },
				}), /late normalized failure/);
				assert.deepStrictEqual({
					stale, headers: await all(raw, 'SELECT * FROM session_chat_catalogs'), chats: await all(raw, 'SELECT * FROM chats_v2'),
				}, { stale: { status: 'conflict' }, headers: [], chats: [] });
			} finally {
				await close(raw);
			}
		});

		test('terminal import cannot overwrite normalized state and provider-only CAS preserves summaries', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			await database.ensureChatCatalogV2(session, expectation(), candidate(), {
				chat: peer, expected: { ownershipRevision: 0, metadataRevision: 0 }, patch: { providerData: 'new provider', isRead: true },
			});
			const before = await database.readCatalogSnapshot([session]);
			const replay = await database.ensureChatCatalogV2(session, expectation(), candidate());
			const importer = await database.upsertSessionV2(createEnvelope(session, 'catalog-generation', 11), 'catalog-generation');
			const [snapshot] = await database.readCatalogSnapshot([session]);
			assert.deepStrictEqual({
				replay, importer, unchanged: stableStringify(before) === stableStringify([snapshot]),
				peer: snapshot.chats.find(chat => chat.chat === peer)?.metadata,
				detail: (await database.getChatV2ProviderDetail(peer))?.providerData,
			}, {
				replay: { status: 'replayed', catalogRevision: 2 }, importer: 'conflict', unchanged: true,
				peer: { summary: 'User title', titleSource: 'user', interactivity: ChatInteractivity.ReadOnly, changes: { additions: 1, deletions: 2, files: 3 } },
				detail: 'new provider',
			});
		});

		test('dual revisions, true private role, owner boundary and cycles fence lineage CAS', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			await database.ensureChatCatalogV2(session, expectation(), candidate());
			const zero = { ownershipRevision: 0, metadataRevision: 0 };
			const stale = await database.updateChatV2Metadata(privateChat, { ...zero, ownershipRevision: 1 }, { parentChat: defaultChat });
			await assert.rejects(database.updateChatV2Metadata(peer, zero, { parentChat: defaultChat }), /Only private/);
			await assert.rejects(database.updateChatV2Metadata(privateChat, zero, { parentChat: privateChat }), /cyclic/);
			await assert.rejects(database.updateChatV2Metadata(privateChat, zero, { parentChat: 'session://foreign#chat' }), /live owner/);
			const applied = await database.updateChatV2Metadata(privateChat, zero, { parentChat: defaultChat });
			const oldMetadata = await database.updateChatV2Metadata(privateChat, zero, { isRead: false });
			const [snapshot] = await database.readCatalogSnapshot([session]);
			assert.deepStrictEqual({
				stale, applied, oldMetadata,
				private: snapshot.chats.find(chat => chat.chat === privateChat),
			}, {
				stale: { status: 'conflict' }, applied: { status: 'applied', catalogRevision: 2 }, oldMetadata: { status: 'conflict' },
				private: {
					chat: privateChat, ownerSession: session, parentChat: defaultChat, storageResource: 'storage://private',
					workingDirectories: [],
					isRead: true, archived: true, inheritedTurnId: 'private-turn', ownershipRevision: 0, metadataRevision: 1,
					metadata: { summary: 'Private', interactivity: ChatInteractivity.Hidden }
				},
			});
		});

		test('existing peer APIs dispatch normalized state, preserving non-first default, private chats and summary metadata', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			await database.ensureChatCatalogV2(session, expectation(), candidate());
			const read = await database.getSessionChatCatalog(session);
			const result = await database.replaceSessionChatCatalog(session, [
				{ ...read!.chats[0], providerData: 'compat provider', isRead: true },
				{ chat: `${session}#new`, order: 1 },
			], read!.revision);
			const [snapshot] = await database.readCatalogSnapshot([session]);
			assert.deepStrictEqual({
				result, header: snapshot.header?.defaultChatUri,
				orders: snapshot.chats.filter(chat => chat.order !== undefined).sort((a, b) => a.order! - b.order!).map(chat => [chat.chat, chat.order]),
				peerMetadata: snapshot.chats.find(chat => chat.chat === peer)?.metadata,
				private: snapshot.chats.find(chat => chat.chat === privateChat)?.parentChat,
				provider: (await database.getSessionChatCatalog(session))?.chats[0].providerData,
			}, {
				result: { status: 'applied', revision: 2 }, header: defaultChat,
				orders: [[peer, 0], [defaultChat, 1], [`${session}#new`, 2]],
				peerMetadata: { summary: 'User title', titleSource: 'user', interactivity: ChatInteractivity.ReadOnly, changes: { additions: 1, deletions: 2, files: 3 } },
				private: peer, provider: 'compat provider',
			});
		});

		test('lossless central peer provider/origin import requires actual verified source equivalence', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			await database.replaceSessionChatCatalog(session, [{
				chat: peer, order: 0, providerData: 'opaque provider', origin: '{ "kind": "subagent" }',
				isRead: false, archived: true, inheritedTurnId: 't'.repeat(4096),
			}], undefined);
			await database.ensureChatCatalogV2(session, expectation(1), candidate());
			assert.deepStrictEqual(await database.getChatV2ProviderDetail(peer), {
				providerData: 'opaque provider',
			});
		});

		test('concurrent activation plus mutation has a single winner and no intervening write-through gap', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			const results = await Promise.all(['first', 'second'].map(providerData => database!.ensureChatCatalogV2(session, expectation(), candidate(), {
				chat: peer, expected: { ownershipRevision: 0, metadataRevision: 0 }, patch: { providerData },
			})));
			assert.deepStrictEqual({
				results, provider: (await database.getChatV2ProviderDetail(peer))?.providerData,
			}, { results: [{ status: 'applied', catalogRevision: 2 }, { status: 'conflict' }], provider: 'first' });
		});

		test('new session writes direct normalized authority and lifecycle deletion fences all owned chats', async () => {
			database = new AgentHostDatabase(':memory:');
			await database.registerRuntimeSession(session, { provider: 'copilot', startTime: 100, source: 'explicit' }, { checkTombstone: true });
			const created = await database.registerChatCatalogV2(session, candidate());
			await database.tombstoneAndUnregisterSession(session);
			const stale = await database.updateChatV2Metadata(peer, { ownershipRevision: 0, metadataRevision: 0 }, { isRead: true });
			assert.deepStrictEqual({
				created, stale, snapshot: await database.readCatalogSnapshot([session]), detail: await database.getChatV2ProviderDetail(peer),
			}, { created: { status: 'applied', catalogRevision: 1 }, stale: { status: 'conflict' }, snapshot: [], detail: undefined });
		});

		test('actual physical schema13 upgrades additively and survives activation, restart and legacy dispatch', async () => {
			const path = join(temporaryDirectory!, 'physical-schema13.db');
			const raw = await openDatabase(path);
			try {
				await exec(raw, `PRAGMA user_version = 13;
					CREATE TABLE metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
					CREATE TABLE sessions (session_uri TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, start_time INTEGER NOT NULL,
						external INTEGER, registration_source TEXT NOT NULL, modified_time INTEGER NOT NULL DEFAULT 0);
					CREATE TABLE sessions_v2 (session_uri TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, start_time INTEGER NOT NULL,
						external INTEGER, registration_source TEXT NOT NULL, session_generation TEXT, source_revision INTEGER,
						payload_version INTEGER, payload_hash TEXT, verified INTEGER NOT NULL DEFAULT 0, payload TEXT,
						is_chat_backing INTEGER NOT NULL DEFAULT 0, modified_time INTEGER NOT NULL DEFAULT 0);
					CREATE TABLE session_chat_catalogs (session_uri TEXT PRIMARY KEY NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
						legacy_mirrored_revision INTEGER NOT NULL DEFAULT 0);
					CREATE TABLE session_chats (session_uri TEXT NOT NULL REFERENCES session_chat_catalogs(session_uri) ON DELETE CASCADE,
						chat_uri TEXT NOT NULL, chat_order INTEGER NOT NULL, provider_data TEXT, origin TEXT, inherited_turn_id TEXT,
						archived INTEGER NOT NULL DEFAULT 0, is_read INTEGER, PRIMARY KEY (session_uri, chat_uri), UNIQUE (session_uri, chat_order));`);
				assert.deepStrictEqual((await all(raw, 'PRAGMA table_info(session_chat_catalogs)')).map(row => row.name), ['session_uri', 'revision', 'legacy_mirrored_revision']);
			} finally {
				await close(raw);
			}
			database = new AgentHostDatabase(path);
			await seed();
			await database.ensureChatCatalogV2(session, expectation(), candidate());
			const before = await database.readCatalogSnapshot([session]);
			await database.close();
			database = new AgentHostDatabase(path);
			const inspect = await openDatabase(path);
			try {
				assert.deepStrictEqual({
					restarted: await database.readCatalogSnapshot([session]), before,
					version: await all(inspect, 'PRAGMA user_version'),
					retained: (await all(inspect, `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('session_chats', 'sessions_v2') ORDER BY name`)).map(row => row.name),
					legacy: (await database.getSessionChatCatalog(session))?.chats.map(chat => chat.chat),
				}, {
					restarted: before, before, version: [{ user_version: 14 }],
					retained: ['session_chats', 'sessions_v2'], legacy: [peer],
				});
			} finally {
				await close(inspect);
			}
		});

		test('bounded metadata uses existing changes validator and rejects unsafe measurements', () => {
			assert.throws(() => encodeChatV2Metadata({ changes: { files: -1 } }), /Invalid chat metadata/);
			assert.throws(() => encodeChatV2Metadata({ summary: 'x'.repeat(1025) }), /Invalid chat metadata/);
			assert.throws(() => encodeChatV2Metadata({ changes: { additions: Number.MAX_SAFE_INTEGER + 1 } }), /Invalid chat metadata/);
		});

		test('session list projection uses one SELECT and keeps legacy payloads while omitting normalized embedded chats and private detail', async () => {
			const instance = new AgentHostDatabase(':memory:');
			database = instance;
			await seed();
			await instance.ensureChatCatalogV2(session, expectation(), candidate());
			const legacy = 'copilot:/legacy-list';
			await instance.registerRuntimeSession(legacy, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			const original = (await instance.getSessionV2(session))!;
			await instance.upsertSessionV2({ ...original, session: legacy }, undefined);
			// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Test-only access retains the private method's type.
			const raw = await instance['_ensureDatabase']();
			const statements: string[] = [];
			const traced = new DeferredPromise<void>();
			const trace = (sql: string) => {
				statements.push(sql);
				if (/^\s*SELECT s\.session_uri, s\.provider\b/.test(sql)) {
					void traced.complete();
				}
			};
			raw.on('trace', trace);
			let listed;
			try {
				listed = await instance.readSessionListCatalogs([session, legacy]);
				await traced.p;
			} finally {
				raw.removeListener('trace', trace);
			}
			const normalized = listed.find(entry => entry.session === session)!;
			const retained = listed.find(entry => entry.session === legacy)!;
			const payload = decodeAgentHostCatalogPayload(normalized.payload);
			if (!payload.ok) {
				throw new Error(payload.error);
			}
			assert.deepStrictEqual({
				selects: statements.filter(sql => /^\s*SELECT\b/i.test(sql)).length,
				operationalDetail: statements.some(sql => /\bc\.(?:provider_data|storage_resource|parent_chat|ownership_revision|metadata_revision)\b/.test(sql)),
				default: normalized.chatCatalog?.header.defaultChatUri,
				chatIds: normalized.chatCatalog?.chats.map(chat => chat.uri),
				privateIncluded: normalized.chatCatalog?.chats.some(chat => chat.uri === privateChat),
				embeddedChats: payload.value.data.chats,
				legacy: { payload: retained.payload, chatCatalog: retained.chatCatalog },
				sourceUnchanged: (await instance.getSessionV2(session))?.payload,
			}, {
				selects: 1, operationalDetail: false, default: defaultChat, chatIds: [peer, defaultChat],
				privateIncluded: false, embeddedChats: [],
				legacy: { payload: original.payload, chatCatalog: undefined }, sourceUnchanged: original.payload,
			});
		});

		test('session list projection rejects corrupted public metadata and a missing default without reading private metadata', async () => {
			const instance = new AgentHostDatabase(':memory:');
			database = instance;
			await seed();
			await instance.ensureChatCatalogV2(session, expectation(), candidate());
			// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Test-only access retains the private method's type.
			const raw = await instance['_ensureDatabase']();
			await exec(raw, `UPDATE chats_v2 SET metadata_hash = 'damaged' WHERE chat_uri = '${privateChat}'`);
			const listed = await instance.readSessionListCatalogs([session]);
			await exec(raw, `UPDATE chats_v2 SET metadata_hash = 'damaged' WHERE chat_uri = '${peer}'`);
			await assert.rejects(instance.readSessionListCatalogs([session]), /metadata hash mismatch/);
			await exec(raw, `UPDATE chats_v2 SET tombstoned = 1 WHERE chat_uri = '${defaultChat}'`);
			await assert.rejects(instance.readSessionListCatalogs([session]), /missing its visible default/);
			assert.deepStrictEqual(listed[0].chatCatalog?.chats.map(chat => chat.uri), [peer, defaultChat]);
		});

		test('session list projection bounds selectors and rejects inconsistent generation and directories', async () => {
			const instance = new AgentHostDatabase(':memory:');
			database = instance;
			await seed();
			await instance.ensureChatCatalogV2(session, expectation(), candidate());
			assert.deepStrictEqual({
				empty: await instance.readSessionListCatalogs([]),
				bounded: (await instance.readSessionListCatalogs(Array.from({ length: 400 }, () => session))).length,
			}, { empty: [], bounded: 1 });
			await assert.rejects(instance.readSessionListCatalogs(Array.from({ length: 401 }, () => session)), /exceeds 400 sessions/);
			// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Test-only access retains the private method's type.
			const raw = await instance['_ensureDatabase']();
			await exec(raw, `UPDATE session_chat_catalogs SET session_generation = 'stale' WHERE session_uri = '${session}'`);
			await assert.rejects(instance.readSessionListCatalogs([session]), /identity does not match/);
			await exec(raw, `UPDATE session_chat_catalogs SET session_generation = 'catalog-generation' WHERE session_uri = '${session}';
				UPDATE chats_v2 SET working_directories = '["file:///same","file:///same"]' WHERE chat_uri = '${peer}'`);
			await assert.rejects(instance.readSessionListCatalogs([session]), /duplicates/);
		});

		test('session list projection waits for queued metadata writes before observing the public summary', async () => {
			const instance = new AgentHostDatabase(':memory:');
			database = instance;
			await seed();
			await instance.ensureChatCatalogV2(session, expectation(), candidate());
			const release = new DeferredPromise<void>();
			// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Test-only access retains the private member's type.
			const blocker = instance['_transactionSequencer'].queue(() => release.p);
			const update = instance.updateChatV2Metadata(peer, { ownershipRevision: 0, metadataRevision: 0 }, {
				metadata: { summary: 'Latest', interactivity: ChatInteractivity.ReadOnly },
			});
			let readSettled = false;
			const read = instance.readSessionListCatalogs([session]).finally(() => readSettled = true);
			await new Promise(resolve => setTimeout(resolve, 0));
			const settledWhileWriteQueued = readSettled;
			await release.complete();
			await blocker;
			assert.deepStrictEqual({
				settledWhileWriteQueued,
				update: await update,
				summary: (await read)[0].chatCatalog?.chats.find(chat => chat.uri === peer)?.summary,
			}, { settledWhileWriteQueued: false, update: { status: 'applied', catalogRevision: 2 }, summary: 'Latest' });
		});

		test('complete snapshot uses exactly two SELECTs including origin and directories but excluding provider detail and session payloads', async () => {
			const instance = new AgentHostDatabase(':memory:');
			database = instance;
			await seed();
			await instance.ensureChatCatalogV2(session, expectation(), candidate());
			// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Test-only access retains the private method's type.
			const raw = await instance['_ensureDatabase']();
			const statements: string[] = [];
			const committed = new DeferredPromise<void>();
			const trace = (sql: string) => {
				statements.push(sql);
				if (sql === 'COMMIT') {
					void committed.complete();
				}
			};
			raw.on('trace', trace);
			try {
				const [snapshot] = await instance.readCatalogSnapshot([session]);
				await committed.p;
				const selects = statements.filter(sql => /^\s*SELECT\b/i.test(sql));
				assert.deepStrictEqual({
					selects: selects.length,
					readsLargeFields: selects.some(sql => /\b(?:payload|provider_data)\b/.test(sql)),
					readsOriginAndDirectories: selects.some(sql => /\bc\.origin\b/.test(sql) && /\bc\.working_directories\b/.test(sql)),
					chats: snapshot.chats.length,
				}, { selects: 2, readsLargeFields: false, readsOriginAndDirectories: true, chats: 3 });
			} finally {
				raw.removeListener('trace', trace);
			}
		});

		test('single-chat lookup uses one SELECT, validates only its row and is scoped to the current owner', async () => {
			const instance = new AgentHostDatabase(':memory:');
			database = instance;
			await seed();
			await instance.ensureChatCatalogV2(session, expectation(), candidate());
			const [snapshot] = await instance.readCatalogSnapshot([session]);
			// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Inspect and damage actual persisted metadata.
			const raw = await instance['_ensureDatabase']();
			await exec(raw, `UPDATE chats_v2 SET metadata_hash = 'damaged' WHERE chat_uri = '${privateChat}'`);
			const statements: string[] = [];
			const traced = new DeferredPromise<void>();
			const trace = (sql: string) => {
				statements.push(sql);
				if (/^\s*SELECT h\.authority_version\b/.test(sql)) {
					void traced.complete();
				}
			};
			raw.on('trace', trace);
			let result;
			try {
				result = await instance.readChatV2(session, peer);
				await traced.p;
			} finally {
				raw.removeListener('trace', trace);
			}
			const other = 'session://other-owner';
			await instance.registerSessionV2(other, { provider: 'claude', startTime: 1, source: 'explicit' }, { checkTombstone: true });
			await instance.registerChatCatalogV2(other, { defaultChat: { chat: 'chat://other-default', order: 0 }, peers: [], privateDescendants: [] });
			assert.deepStrictEqual({
				result,
				selects: statements.filter(sql => /^\s*SELECT\b/i.test(sql)).length,
				readsLargeFields: statements.some(sql => /\b(?:payload|provider_data)\b/.test(sql)),
				foreign: await instance.readChatV2(other, peer),
				missing: await instance.readChatV2(session, 'chat://missing'),
				legacy: await instance.readChatV2('session://missing', peer),
			}, {
				result: { normalized: true, chat: snapshot.chats.find(chat => chat.chat === peer) },
				selects: 1, readsLargeFields: false,
				foreign: { normalized: true }, missing: { normalized: true }, legacy: { normalized: false },
			});
			await assert.rejects(instance.readChatV2(session, privateChat), /metadata hash mismatch/);
			await exec(raw, `UPDATE chats_v2 SET working_directories = '["file:///same","file:///same"]' WHERE chat_uri = '${peer}'`);
			await assert.rejects(instance.readChatV2(session, peer), /duplicates/);
			await exec(raw, `UPDATE chats_v2 SET tombstoned = 1 WHERE chat_uri = '${defaultChat}'`);
			await assert.rejects(instance.readChatV2(session, peer), /missing its visible default/);
			await instance.tombstoneAndUnregisterSession(session);
			assert.deepStrictEqual(await instance.readChatV2(session, peer), { normalized: false });
		});

		test('migration selection reads only live legacy headers with bounded selectors', async () => {
			const instance = new AgentHostDatabase(':memory:');
			database = instance;
			await seed();
			await instance.ensureChatCatalogV2(session, expectation(), candidate());
			const names = ['legacy', 'provisional', 'backing', 'tombstoned', 'excluded'];
			const owners = names.map(name => `session://${name}`);
			for (const owner of owners) {
				await instance.registerSessionV2(owner, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: true });
			}
			await instance.setSessionProvisional(owners[1], true);
			// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Exercise stored eligibility markers and damaged unrelated metadata.
			const raw = await instance['_ensureDatabase']();
			await exec(raw, `UPDATE chats_v2 SET metadata_hash = 'damaged' WHERE chat_uri = '${privateChat}';
				UPDATE sessions_v2 SET is_chat_backing = 1 WHERE session_uri = '${owners[2]}'`);
			await instance.tombstoneAndUnregisterSession(owners[3]);
			await instance.excludeSessionV2({ provider: 'copilot', session: owners[4], reason: 'staleExternal', fingerprint: '1' }, {
				identity: await instance.getSessionV2Registration(owners[4]), catalog: undefined,
			});
			const statements: string[] = [];
			const traced = new DeferredPromise<void>();
			const trace = (sql: string) => {
				statements.push(sql);
				if (/^\s*SELECT s\.session_uri\b/.test(sql)) {
					void traced.complete();
				}
			};
			raw.on('trace', trace);
			let selected;
			try {
				selected = await instance.listLegacyChatCatalogSessions([session, ...owners, 'session://missing']);
				await traced.p;
			} finally {
				raw.removeListener('trace', trace);
			}
			assert.deepStrictEqual({
				selected,
				selects: statements.filter(sql => /^\s*SELECT\b/i.test(sql)).length,
				readsChats: statements.some(sql => /\bchats_v2\b/.test(sql)),
				empty: await instance.listLegacyChatCatalogSessions([]),
				bounded: await instance.listLegacyChatCatalogSessions(Array.from({ length: 400 }, () => owners[0])),
			}, { selected: [owners[0], owners[1]], selects: 1, readsChats: false, empty: [], bounded: [owners[0]] });
			await assert.rejects(instance.listLegacyChatCatalogSessions(Array.from({ length: 401 }, () => owners[0])), /exceeds 400 sessions/);
		});

		test('snapshot authority is chosen per session without merging frozen legacy peers', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			await database.replaceSessionChatCatalog(session, [{
				chat: peer, order: 0, isRead: false, archived: true, inheritedTurnId: 't'.repeat(4096), origin: '{"kind":"subagent"}',
			}], undefined);
			await database.ensureChatCatalogV2(session, expectation(1), candidate());
			await database.replaceSessionChatCatalog(session, [], 2);
			const legacySession = 'session://legacy';
			await database.registerSessionV2(legacySession, { provider: 'copilot', startTime: 100, source: 'explicit' }, { checkTombstone: true });
			await database.replaceSessionChatCatalog(legacySession, [{ chat: 'chat://legacy-peer', order: 0 }], undefined);
			const snapshots = await database.readCatalogSnapshot();
			assert.deepStrictEqual(snapshots.map(entry => ({
				session: entry.session, authority: entry.header?.authorityVersion, chats: entry.chats.map(chat => chat.chat),
			})), [
				{ session: legacySession, authority: 1, chats: [] },
				{ session, authority: 2, chats: [defaultChat] },
			]);
		});

		test('file-backed independent connections serialize activation and typed write-through CAS', async () => {
			const path = join(temporaryDirectory!, 'independent-connections.db');
			const first = new AgentHostDatabase(path);
			const second = new AgentHostDatabase(path);
			database = first;
			try {
				await seed(first);
				await second.getSessionV2Registration(session);
				const results = await Promise.all([first, second].map((target, index) => target.ensureChatCatalogV2(session, expectation(), candidate(), {
					chat: peer, expected: { ownershipRevision: 0, metadataRevision: 0 }, patch: { providerData: `connection-${index}` },
				})));
				const [snapshot] = await second.readCatalogSnapshot([session]);
				assert.deepStrictEqual({
					statuses: results.map(result => result.status).sort(),
					revision: snapshot.header?.revision,
					metadataRevision: snapshot.chats.find(chat => chat.chat === peer)?.metadataRevision,
				}, { statuses: ['applied', 'conflict'], revision: 2, metadataRevision: 1 });
			} finally {
				await second.close();
			}
		});

		test('the exact 1000-chat limit includes private chats and compatibility writes cannot exceed it', async () => {
			database = new AgentHostDatabase(':memory:');
			await database.registerRuntimeSession(session, { provider: 'copilot', startTime: 100, source: 'explicit' }, { checkTombstone: true });
			const peers = Array.from({ length: 998 }, (_, index) => ({ chat: `chat://bounded-${index}`, order: index + 1 }));
			await database.registerChatCatalogV2(session, {
				defaultChat: { chat: defaultChat, order: 0, metadata: { summary: 'x'.repeat(1024), changes: { files: 1 } } },
				peers,
				privateDescendants: [{ chat: privateChat, parentChat: defaultChat }],
			});
			const before = await database.readCatalogSnapshot([session]);
			await assert.rejects(database.replaceSessionChatCatalog(session, [
				...peers.map((chat, order) => ({ ...chat, order })), { chat: 'chat://one-too-many', order: 998 },
			], 1), /exceeds 1000/);
			assert.deepStrictEqual({
				count: before[0].chats.length, unchanged: stableStringify(before) === stableStringify(await database.readCatalogSnapshot([session])),
			}, { count: 1000, unchanged: true });
		});

		test('provider and directory clear semantics preserve unrelated summaries and validate ordered pins', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			await database.ensureChatCatalogV2(session, expectation(), candidate());
			await database.updateChatV2Metadata(peer, { ownershipRevision: 0, metadataRevision: 0 }, {
				providerData: 'detail', workingDirectories: [], inheritedTurnId: null,
			});
			const pinned = await database.getChatV2ProviderDetail(peer);
			const [pinnedSnapshot] = await database.readCatalogSnapshot([session]);
			await database.updateChatV2Metadata(peer, { ownershipRevision: 0, metadataRevision: 1 }, {
				providerData: null, workingDirectories: null,
			});
			const cleared = await database.getChatV2ProviderDetail(peer);
			const [snapshot] = await database.readCatalogSnapshot([session]);
			assert.deepStrictEqual({
				pinned, cleared, inherited: snapshot.chats.find(chat => chat.chat === peer)?.inheritedTurnId,
				pinnedDirectories: pinnedSnapshot.chats.find(chat => chat.chat === peer)?.workingDirectories,
				clearedDirectories: snapshot.chats.find(chat => chat.chat === peer)?.workingDirectories,
				metadata: snapshot.chats.find(chat => chat.chat === peer)?.metadata,
			}, {
				pinned: { providerData: 'detail' },
				cleared: {}, inherited: undefined, pinnedDirectories: [], clearedDirectories: undefined,
				metadata: { summary: 'User title', titleSource: 'user', interactivity: ChatInteractivity.ReadOnly, changes: { additions: 1, deletions: 2, files: 3 } },
			});
		});

		test('origin update and explicit clear use dual CAS without falling back to frozen legacy origin', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			await database.ensureChatCatalogV2(session, expectation(), candidate());
			const updated = await database.updateChatV2Metadata(peer, { ownershipRevision: 0, metadataRevision: 0 }, { origin: '{"kind":"user"}' });
			const stale = await database.updateChatV2Metadata(peer, { ownershipRevision: 0, metadataRevision: 0 }, { origin: null });
			const cleared = await database.updateChatV2Metadata(peer, { ownershipRevision: 0, metadataRevision: 1 }, { origin: null });
			const [snapshot] = await database.readCatalogSnapshot([session]);
			assert.deepStrictEqual({
				updated, stale, cleared, origin: snapshot.chats.find(chat => chat.chat === peer)?.origin,
				summary: snapshot.chats.find(chat => chat.chat === peer)?.metadata?.summary,
			}, {
				updated: { status: 'applied', catalogRevision: 2 }, stale: { status: 'conflict' },
				cleared: { status: 'applied', catalogRevision: 3 }, origin: undefined, summary: 'User title',
			});
		});

		test('default provider detail and absent pinned directories can be explicitly enriched at activation', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			const input = candidate();
			await database.ensureChatCatalogV2(session, expectation(), {
				...input, defaultChat: { ...input.defaultChat, providerData: 'default-provider', workingDirectories: ['file:///default-primary', 'file:///default-secondary'] },
			});
			const [snapshot] = await database.readCatalogSnapshot([session]);
			assert.deepStrictEqual({
				default: snapshot.header?.defaultChatUri,
				directories: snapshot.chats.find(chat => chat.chat === defaultChat)?.workingDirectories,
				detail: await database.getChatV2ProviderDetail(defaultChat),
			}, { default: defaultChat, directories: ['file:///default-primary', 'file:///default-secondary'], detail: { providerData: 'default-provider' } });
		});

		test('explicit Hidden roles preserve absent upstream parent facts without inventing default lineage', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			await database.ensureChatCatalogV2(session, expectation(), {
				...candidate(), privateDescendants: [{ chat: privateChat }],
			});
			const [snapshot] = await database.readCatalogSnapshot([session]);
			const hidden = snapshot.chats.find(chat => chat.chat === privateChat)!;
			assert.deepStrictEqual({
				parent: hidden.parentChat, order: hidden.order, interactivity: hidden.metadata?.interactivity,
				summary: hidden.metadata?.summary,
			}, { parent: undefined, order: undefined, interactivity: ChatInteractivity.Hidden, summary: 'Private' });
		});

		test('explicit legacy both-empty deletion facts preserve global tombstones before legacy keys are cleaned', async () => {
			const path = join(temporaryDirectory!, 'legacy-deleted-identity.db');
			const deletedChat = 'chat://deleted-legacy';
			database = new AgentHostDatabase(path);
			await seed();
			await database.replaceSessionChatCatalog(session, [
				{ chat: peer, order: 0, isRead: false, archived: true, inheritedTurnId: 't'.repeat(4096), origin: '{"kind":"subagent"}' },
				{ chat: deletedChat, order: 1, providerData: 'leftover-backing' },
			], undefined);
			await database.ensureChatCatalogV2(session, expectation(1), {
				...candidate(), deletedChats: [{ chat: deletedChat, summary: '', titleSource: '' }],
			});
			await database.close();
			database = new AgentHostDatabase(path);
			const raw = await openDatabase(path);
			try {
				const current = (await database.getSessionChatCatalog(session))!;
				const replacement = await database.replaceSessionChatCatalog(session, [...current.chats, { chat: deletedChat, order: 1 }], current.revision);
				assert.deepStrictEqual({
					replacement, detail: await database.getChatV2ProviderDetail(deletedChat),
					tombstone: await all(raw, `SELECT chat_uri, tombstoned, ownership_revision FROM chats_v2 WHERE chat_uri = '${deletedChat}'`),
				}, {
					replacement: { status: 'conflict' }, detail: undefined,
					tombstone: [{ chat_uri: deletedChat, tombstoned: 1, ownership_revision: 1 }],
				});
			} finally {
				await close(raw);
			}
		});

		test('activation and requested peer membership commit together while preserving default and private metadata', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			const chats = [
				{ chat: peer, order: 0, origin: '{"kind":"subagent"}', isRead: false, archived: true, inheritedTurnId: 't'.repeat(4096) },
				{ chat: 'chat://requested-new', order: 1 },
			];
			const result = await database.ensureChatCatalogV2(session, expectation(), candidate(), { kind: 'replacePeers', expectedRevision: 0, chats });
			const before = await database.readCatalogSnapshot([session]);
			const stale = await database.ensureChatCatalogV2(session, expectation(), candidate(), { kind: 'replacePeers', expectedRevision: 0, chats: [] });
			assert.deepStrictEqual({
				result, stale, count: before[0].chats.length, default: before[0].header?.defaultChatUri,
				title: before[0].chats.find(chat => chat.chat === peer)?.metadata?.summary,
				private: before[0].chats.find(chat => chat.chat === privateChat)?.parentChat,
				unchanged: stableStringify(before) === stableStringify(await database.readCatalogSnapshot([session])),
			}, {
				result: { status: 'applied', catalogRevision: 2 }, stale: { status: 'conflict' }, count: 4, default: defaultChat,
				title: 'User title', private: peer, unchanged: true,
			});
		});

		test('late requested membership failure rolls back activation and every normalized row', async () => {
			const path = join(temporaryDirectory!, 'activation-membership-rollback.db');
			database = new AgentHostDatabase(path);
			await seed();
			const raw = await openDatabase(path);
			try {
				await exec(raw, `CREATE TRIGGER reject_requested_peer BEFORE INSERT ON chats_v2
					WHEN NEW.chat_uri = 'chat://requested-new' BEGIN SELECT RAISE(ABORT, 'membership failure'); END`);
				await assert.rejects(database.ensureChatCatalogV2(session, expectation(), candidate(), {
					kind: 'replacePeers', expectedRevision: 0, chats: [{ chat: 'chat://requested-new', order: 0 }],
				}), /membership failure/);
				assert.deepStrictEqual({
					header: await all(raw, 'SELECT * FROM session_chat_catalogs'), chats: await all(raw, 'SELECT * FROM chats_v2'),
				}, { header: [], chats: [] });
			} finally {
				await close(raw);
			}
		});

		test('snapshot selector accepts exactly the exported limit and legacy empty catalogs retain an authority discriminator', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			const sessions = [session, ...Array.from({ length: AGENT_HOST_CATALOG_SNAPSHOT_SESSION_LIMIT - 1 }, (_, index) => `session://absent-${index}`)];
			const entries = await database.readCatalogSnapshot(sessions);
			await assert.rejects(database.readCatalogSnapshot([...sessions, 'session://overflow']), /selector exceeds 400/);
			assert.deepStrictEqual(entries.map(entry => ({
				session: entry.session, authority: entry.authorityVersion, header: entry.header, chats: entry.chats,
			})), [{ session, authority: 1, header: undefined, chats: [] }]);
		});

		async function aggregateEnvelope(sourceRevision: number, changes: Partial<Omit<AgentHostCatalogData, 'chats'>> = {}) {
			const [snapshot] = await database!.readCatalogSnapshot([session]);
			const source = decodeAgentHostCatalogPayload(envelope().payload);
			assert.ok(source.ok);
			const chats: AgentHostCatalogData['chats'] = snapshot.chats.filter(chat => chat.order !== undefined)
				.sort((a, b) => a.order! - b.order!).map(chat => ({
					uri: chat.chat, kind: chat.chat === snapshot.header?.defaultChatUri ? 'default' : 'peer', order: chat.order!,
					...chat.metadata, origin: chat.origin === undefined ? undefined : projectAgentHostCatalogChatOrigin(JSON.parse(chat.origin)), workingDirectories: chat.workingDirectories,
					isRead: chat.isRead, archived: chat.archived, inheritedTurnId: chat.inheritedTurnId,
				}));
			return {
				envelope: createEnvelope(session, 'catalog-generation', sourceRevision, {
					payload: stableStringify({ payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION, data: { ...source.value.data, ...changes, chats } }),
				}),
				catalogRevision: snapshot.header!.revision,
			};
		}

		test('normalized aggregate writes update session title/status/git while preserving all central chats and header', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			await database.ensureChatCatalogV2(session, expectation(), candidate());
			const before = await database.readCatalogSnapshot([session]);
			const request = await aggregateEnvelope(11, {
				summary: 'Session aggregate title', titleSource: 'user', isRead: true, isArchived: false,
				_meta: { git: { branchName: 'feature', hasGitRemote: true } },
			});
			const applied = await database.upsertSessionV2FromChatCatalog(request.envelope, 'catalog-generation', request.catalogRevision);
			const replay = await database.upsertSessionV2FromChatCatalog(request.envelope, 'catalog-generation', request.catalogRevision);
			const stored = (await database.getSessionV2(session))!;
			assert.deepStrictEqual({
				applied, replay, payload: stored.payload, revision: stored.sourceRevision,
				unchanged: stableStringify(before) === stableStringify(await database.readCatalogSnapshot([session])),
				legacyImport: await database.upsertSessionV2(request.envelope, 'catalog-generation'),
			}, {
				applied: 'applied', replay: 'replayed', payload: request.envelope.payload, revision: 11,
				unchanged: true, legacyImport: 'conflict',
			});
		});

		for (const knownLegacyDetail of [false, true]) {
			test(`normalization retains explicit origin detail while verifying bounded provenance (known legacy detail: ${knownLegacyDetail})`, async () => {
				database = new AgentHostDatabase(':memory:');
				await seed();
				const decoded = decodeAgentHostCatalogPayload(envelope().payload);
				assert.ok(decoded.ok);
				const origin = {
					kind: ChatOriginKind.SideChat, chat: defaultChat, turnId: 'source-turn',
					selection: { text: 'selected '.repeat(600) },
				};
				const source = createEnvelope(session, 'catalog-generation', 11, {
					payload: stableStringify({
						payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
						data: {
							...decoded.value.data,
							chats: decoded.value.data.chats.map(chat => chat.uri === peer
								? { ...chat, origin: projectAgentHostCatalogChatOrigin(origin) } : chat),
						},
					}),
				});
				await database.upsertSessionV2(source, 'catalog-generation');
				if (knownLegacyDetail) {
					await database.replaceSessionChatCatalog(session, [{
						chat: peer, order: 0, origin: JSON.stringify(origin), isRead: false,
						archived: true, inheritedTurnId: 't'.repeat(4096),
					}], undefined);
				}
				const expected = { ...expectation(knownLegacyDetail ? 1 : 0), sourceRevision: 11, payloadHash: source.payloadHash };
				const original = candidate();
				const prepare = (detail: typeof origin) => ({
					...original, peers: [{ ...original.peers[0], origin: JSON.stringify(detail) }],
				});
				await assert.rejects(database.ensureChatCatalogV2(session, expected, prepare({ ...origin, turnId: 'different-turn' })), /Normalization conflicts with verified per-chat source/);
				if (knownLegacyDetail) {
					await assert.rejects(database.ensureChatCatalogV2(session, expected, prepare({ ...origin, selection: { text: 'conflicting detail' } })), /Normalization conflicts with central origin detail/);
				}
				const activated = await database.ensureChatCatalogV2(session, expected, prepare(origin));
				const [snapshot] = await database.readCatalogSnapshot([session]);
				assert.deepStrictEqual({
					activated, origin: JSON.parse(snapshot.chats.find(chat => chat.chat === peer)!.origin!),
				}, {
					activated: { status: 'applied', catalogRevision: knownLegacyDetail ? 2 : 1 }, origin,
				});
			});
		}

		test('aggregate origin comparison uses bounded public provenance and preserves the full selection', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			await database.ensureChatCatalogV2(session, expectation(), candidate());
			const origin = JSON.stringify({
				kind: ChatOriginKind.SideChat, chat: defaultChat, turnId: 'source-turn',
				selection: { text: 'selected '.repeat(600) },
			});
			await database.updateChatV2Metadata(peer, { ownershipRevision: 0, metadataRevision: 0 }, { origin });
			const before = await database.readCatalogSnapshot([session]);
			const request = await aggregateEnvelope(11, { summary: 'Updated aggregate' });
			const applied = await database.upsertSessionV2FromChatCatalog(request.envelope, 'catalog-generation', request.catalogRevision);
			const decoded = decodeAgentHostCatalogPayload(request.envelope.payload);
			assert.ok(decoded.ok);
			assert.deepStrictEqual({
				applied,
				publicOrigin: decoded.value.data.chats.find(chat => chat.uri === peer)?.origin,
				unchanged: stableStringify(before) === stableStringify(await database.readCatalogSnapshot([session])),
			}, {
				applied: 'applied',
				publicOrigin: { kind: ChatOriginKind.SideChat, chat: defaultChat, turnId: 'source-turn' },
				unchanged: true,
			});
		});

		test('concurrent normalized chat patch fences a stale aggregate header and stale public projection', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			await database.ensureChatCatalogV2(session, expectation(), candidate());
			const stale = await aggregateEnvelope(11, { summary: 'stale aggregate' });
			await database.updateChatV2Metadata(peer, { ownershipRevision: 0, metadataRevision: 0 }, {
				metadata: { summary: 'Fresh peer', titleSource: 'user', interactivity: ChatInteractivity.ReadOnly, changes: { files: 20 } },
			});
			const oldHeader = await database.upsertSessionV2FromChatCatalog(stale.envelope, 'catalog-generation', stale.catalogRevision);
			const oldProjection = await database.upsertSessionV2FromChatCatalog(stale.envelope, 'catalog-generation', 2);
			const current = await aggregateEnvelope(11, { summary: 'fresh aggregate' });
			const refreshed = await database.upsertSessionV2FromChatCatalog(current.envelope, 'catalog-generation', current.catalogRevision);
			assert.deepStrictEqual({
				oldHeader, oldProjection, refreshed, revision: (await database.getSessionV2(session))?.sourceRevision,
				privateSummary: (await database.readCatalogSnapshot([session]))[0].chats.find(chat => chat.chat === privateChat)?.metadata?.summary,
			}, { oldHeader: 'conflict', oldProjection: 'conflict', refreshed: 'applied', revision: 11, privateSummary: 'Private' });
		});

		test('normalized aggregate generation, source revisions, missing sessions and deletion use existing CAS dispositions', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			await database.ensureChatCatalogV2(session, expectation(), candidate());
			const request = await aggregateEnvelope(11);
			const generation = await database.upsertSessionV2FromChatCatalog(request.envelope, 'other', 1);
			const newLifetime = await database.upsertSessionV2FromChatCatalog({ ...request.envelope, sessionGeneration: 'different' }, 'catalog-generation', 1);
			const stale = await database.upsertSessionV2FromChatCatalog({ ...request.envelope, sourceRevision: 9 }, 'catalog-generation', 1);
			const sameRevision = await database.upsertSessionV2FromChatCatalog({ ...request.envelope, sourceRevision: 10 }, 'catalog-generation', 1);
			const missing = await database.upsertSessionV2FromChatCatalog({ ...request.envelope, session: 'session://missing' }, undefined, 1);
			await database.tombstoneAndUnregisterSession(session);
			const deleted = await database.upsertSessionV2FromChatCatalog(request.envelope, 'catalog-generation', 1);
			assert.deepStrictEqual({ generation, newLifetime, stale, sameRevision, missing, deleted }, {
				generation: 'generationMismatch', newLifetime: 'generationMismatch', stale: 'stale', sameRevision: 'conflict', missing: 'missingSession', deleted: 'tombstoned',
			});
		});

		test('new direct normalized sessions can establish their first aggregate generation without rewriting their header', async () => {
			database = new AgentHostDatabase(':memory:');
			await database.registerSessionV2(session, { provider: 'copilot', startTime: 100, source: 'explicit' }, { checkTombstone: true });
			await database.registerChatCatalogV2(session, { defaultChat: { chat: defaultChat, order: 0 }, peers: [], privateDescendants: [] });
			const before = await database.readCatalogSnapshot([session]);
			const request = await aggregateEnvelope(0);
			const applied = await database.upsertSessionV2FromChatCatalog(request.envelope, undefined, 1);
			assert.deepStrictEqual({
				applied, generation: (await database.getSessionV2(session))?.sessionGeneration,
				unchanged: stableStringify(before) === stableStringify(await database.readCatalogSnapshot([session])),
			}, { applied: 'applied', generation: 'catalog-generation', unchanged: true });
		});

		test('private lifecycle insertion preserves complete data and only exact current revision replays', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			await database.ensureChatCatalogV2(session, expectation(), candidate());
			const spawned = {
				chat: 'chat://spawned-private', parentChat: privateChat, storageResource: 'storage://spawned',
				providerData: 'opaque', origin: '{"kind":"tool"}', workingDirectories: ['file:///primary', 'file:///secondary'],
				isRead: true, archived: true, inheritedTurnId: 'spawn-turn',
				metadata: { summary: 'Spawned', titleSource: 'agent' as const, interactivity: ChatInteractivity.Hidden, changes: { files: 2 } },
			};
			const applied = await database.insertPrivateChatV2(session, spawned, 1);
			const stale = await database.insertPrivateChatV2(session, spawned, 1);
			const replay = await database.insertPrivateChatV2(session, spawned, 2);
			const mismatch = await database.insertPrivateChatV2(session, { ...spawned, providerData: 'different' }, 2);
			const [snapshot] = await database.readCatalogSnapshot([session]);
			assert.deepStrictEqual({
				applied, stale, replay, mismatch, row: snapshot.chats.find(chat => chat.chat === spawned.chat),
				detail: await database.getChatV2ProviderDetail(spawned.chat),
				sourceRevision: (await database.getSessionV2(session))?.sourceRevision,
			}, {
				applied: { status: 'applied', catalogRevision: 2 }, stale: { status: 'conflict' },
				replay: { status: 'replayed', catalogRevision: 2 }, mismatch: { status: 'conflict' },
				row: {
					chat: spawned.chat, ownerSession: session, parentChat: privateChat, storageResource: 'storage://spawned',
					origin: spawned.origin, workingDirectories: spawned.workingDirectories, isRead: true, archived: true,
					inheritedTurnId: 'spawn-turn', metadata: spawned.metadata, ownershipRevision: 0, metadataRevision: 0
				},
				detail: { providerData: 'opaque' }, sourceRevision: 10,
			});
		});

		test('private lifecycle rejects visible, cyclic and foreign identities while preserving absent parent facts', async () => {
			database = new AgentHostDatabase(':memory:');
			await seed();
			await database.ensureChatCatalogV2(session, expectation(), candidate());
			const hidden = { chat: 'chat://unparented', metadata: { interactivity: ChatInteractivity.Hidden } };
			await assert.rejects(database.insertPrivateChatV2(session, { ...hidden, order: 0 }, 1), /ordering slot/);
			await assert.rejects(database.insertPrivateChatV2(session, { ...hidden, metadata: { interactivity: ChatInteractivity.Full } }, 1), /Hidden/);
			await assert.rejects(database.insertPrivateChatV2(session, { ...hidden, parentChat: hidden.chat }, 1), /cyclic/);
			await assert.rejects(database.insertPrivateChatV2(session, { ...hidden, parentChat: 'chat://absent' }, 1), /live owner/);
			const publicConflict = await database.insertPrivateChatV2(session, { ...hidden, chat: defaultChat }, 1);
			const foreign = 'session://foreign-owner';
			await database.registerSessionV2(foreign, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: true });
			await database.registerChatCatalogV2(foreign, { defaultChat: { chat: 'chat://foreign-default', order: 0 }, peers: [], privateDescendants: [hidden] });
			const foreignConflict = await database.insertPrivateChatV2(session, hidden, 1);
			const absentParent = await database.insertPrivateChatV2(session, { ...hidden, chat: 'chat://parentless-new' }, 1);
			assert.deepStrictEqual({
				publicConflict, foreignConflict, absentParent,
				parent: (await database.readCatalogSnapshot([session]))[0].chats.find(chat => chat.chat === 'chat://parentless-new')?.parentChat,
			}, { publicConflict: { status: 'conflict' }, foreignConflict: { status: 'conflict' }, absentParent: { status: 'applied', catalogRevision: 2 }, parent: undefined });
		});

		test('private lifecycle deletion tombstones only private closure and survives restart without resurrection', async () => {
			const path = join(temporaryDirectory!, 'private-lifecycle.db');
			database = new AgentHostDatabase(path);
			await seed();
			const input = candidate();
			await database.ensureChatCatalogV2(session, expectation(), {
				...input, peers: [{ ...input.peers[0], parentChat: privateChat }], privateDescendants: [{ chat: privateChat }],
			});
			const child = { chat: 'chat://private-child', parentChat: privateChat, metadata: { interactivity: ChatInteractivity.Hidden } };
			await database.insertPrivateChatV2(session, child, 1);
			const publicTarget = await database.removePrivateChatV2(session, peer, 2);
			const removed = await database.removePrivateChatV2(session, privateChat, 2);
			await database.close();
			database = new AgentHostDatabase(path);
			const reinsert = await database.insertPrivateChatV2(session, child, 3);
			const stale = await database.removePrivateChatV2(session, privateChat, 2);
			const unrelated = await database.insertPrivateChatV2(session, { chat: 'chat://new-unrelated', metadata: { interactivity: ChatInteractivity.Hidden } }, 3);
			const raw = await openDatabase(path);
			try {
				assert.deepStrictEqual({
					publicTarget, removed, reinsert, stale, unrelated,
					live: (await database.readCatalogSnapshot([session]))[0].chats.map(chat => chat.chat).sort(),
					deleted: await all(raw, `SELECT chat_uri, tombstoned, ownership_revision FROM chats_v2 WHERE chat_order IS NULL ORDER BY chat_uri`),
				}, {
					publicTarget: { status: 'conflict' }, removed: { status: 'applied', catalogRevision: 3 },
					reinsert: { status: 'conflict' }, stale: { status: 'conflict' },
					unrelated: { status: 'applied', catalogRevision: 4 },
					live: ['chat://new-unrelated', defaultChat, peer].sort(),
					deleted: [{ chat_uri: 'chat://new-unrelated', tombstoned: 0, ownership_revision: 0 }, { chat_uri: child.chat, tombstoned: 1, ownership_revision: 1 }, { chat_uri: privateChat, tombstoned: 1, ownership_revision: 1 }],
				});
			} finally {
				await close(raw);
			}
		});

		test('private lifecycle applies the exact total bound and stale writers cannot race insertion', async () => {
			database = new AgentHostDatabase(':memory:');
			await database.registerSessionV2(session, { provider: 'copilot', startTime: 100, source: 'explicit' }, { checkTombstone: true });
			await database.registerChatCatalogV2(session, {
				defaultChat: { chat: defaultChat, order: 0 },
				peers: Array.from({ length: 998 }, (_, index) => ({ chat: `chat://private-bound-${index}`, order: index + 1 })),
				privateDescendants: [],
			});
			const hidden = { metadata: { interactivity: ChatInteractivity.Hidden } };
			const results = await Promise.all(['chat://last-slot', 'chat://racing-slot'].map(chat => database!.insertPrivateChatV2(session, { ...hidden, chat }, 1)));
			await assert.rejects(database.insertPrivateChatV2(session, { ...hidden, chat: 'chat://overflow' }, 2), /exceeds the limit/);
			assert.deepStrictEqual({ results, count: (await database.readCatalogSnapshot([session]))[0].chats.length }, {
				results: [{ status: 'applied', catalogRevision: 2 }, { status: 'conflict' }], count: 1000,
			});
		});

		test('private lifecycle late SQL failures roll back insertion, closure tombstones and header revision', async () => {
			const path = join(temporaryDirectory!, 'private-lifecycle-rollback.db');
			database = new AgentHostDatabase(path);
			await seed();
			await database.ensureChatCatalogV2(session, expectation(), candidate());
			const raw = await openDatabase(path);
			try {
				const before = await database.readCatalogSnapshot([session]);
				await exec(raw, `CREATE TRIGGER reject_private_revision BEFORE UPDATE ON session_chat_catalogs
					BEGIN SELECT RAISE(ABORT, 'private revision failure'); END`);
				await assert.rejects(database.insertPrivateChatV2(session, { chat: 'chat://rollback-private', metadata: { interactivity: ChatInteractivity.Hidden } }, 1), /private revision failure/);
				await assert.rejects(database.removePrivateChatV2(session, privateChat, 1), /private revision failure/);
				assert.deepStrictEqual({
					unchanged: stableStringify(before) === stableStringify(await database.readCatalogSnapshot([session])),
					inserted: await all(raw, `SELECT chat_uri FROM chats_v2 WHERE chat_uri = 'chat://rollback-private'`),
					tombstones: await all(raw, 'SELECT chat_uri FROM chats_v2 WHERE tombstoned = 1'),
				}, { unchanged: true, inserted: [], tombstones: [] });
			} finally {
				await close(raw);
			}
		});

		test('private lifecycle checks session registration, authority and tombstones before insertion or deletion', async () => {
			database = new AgentHostDatabase(':memory:');
			const hidden = { chat: 'chat://lifecycle-fenced', metadata: { interactivity: ChatInteractivity.Hidden } };
			const missing = await database.insertPrivateChatV2(session, hidden, 0);
			await seed();
			const legacyAuthority = await database.insertPrivateChatV2(session, hidden, 0);
			await database.ensureChatCatalogV2(session, expectation(), candidate());
			await database.tombstoneAndUnregisterSession(session);
			const deletedInsert = await database.insertPrivateChatV2(session, hidden, 1);
			const deletedRemove = await database.removePrivateChatV2(session, privateChat, 1);
			assert.deepStrictEqual({ missing, legacyAuthority, deletedInsert, deletedRemove }, {
				missing: { status: 'missingSession' }, legacyAuthority: { status: 'conflict' },
				deletedInsert: { status: 'tombstoned' }, deletedRemove: { status: 'tombstoned' },
			});
		});
	});
});
