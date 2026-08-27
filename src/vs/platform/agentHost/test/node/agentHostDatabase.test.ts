/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import type { Database } from '@vscode/sqlite3';
import { stableStringify } from '../../../../base/common/objects.js';
import { join } from '../../../../base/common/path.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostDatabase, IAgentHostDatabase, IAgentHostDatabaseSessionV2Envelope } from '../../node/agentHostDatabase.js';

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

function all(database: Database, sql: string): Promise<readonly Record<string, unknown>[]> {
	return new Promise((resolve, reject) => {
		database.all(sql, (error: Error | null, rows: Record<string, unknown>[]) => error ? reject(error) : resolve(rows));
	});
}

function close(database: Database): Promise<void> {
	return new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
}

function createPayload(session: string, sourceRevision: number, isChatBacking = false): string {
	return stableStringify({
		payloadVersion: 1,
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
		payloadVersion: 1,
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

	test('creates the single-table schema without changing the legacy registry', async () => {
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
			const [version, tables, sessionColumns, sessionV2Columns, sessionV2ForeignKeys] = await Promise.all([
				all(rawDatabase, 'PRAGMA user_version'),
				all(rawDatabase, `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`),
				all(rawDatabase, 'PRAGMA table_info(sessions)'),
				all(rawDatabase, 'PRAGMA table_info(sessions_v2)'),
				all(rawDatabase, 'PRAGMA foreign_key_list(sessions_v2)'),
			]);
			assert.deepStrictEqual({
				version,
				tables: tables.map(row => row.name),
				sessionColumns: sessionColumns.map(row => row.name),
				sessionV2Columns: sessionV2Columns.map(row => row.name),
				sessionV2ForeignKeys,
			}, {
				version: [{ user_version: 10 }],
				tables: ['metadata', 'sessions', 'sessions_v2'],
				sessionColumns: ['session_uri', 'provider', 'start_time', 'external', 'registration_source', 'modified_time'],
				sessionV2Columns: [
					'session_uri', 'provider', 'start_time', 'external', 'registration_source', 'session_generation',
					'source_revision', 'payload_version', 'payload_hash', 'verified', 'payload', 'is_chat_backing', 'modified_time',
				],
				sessionV2ForeignKeys: [],
			});

		} finally {
			await close(rawDatabase);
		}
	});

	test('upgrades published v4 through v6 rows through v8 and invalidates old projections', async () => {
		const results: object[] = [];
		for (const version of [4, 5, 6] as const) {
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
				results.push({
					version,
					schemaVersion,
					foreignKeys,
					published: await upgraded.getSessionV2(session),
					directLegacy: await upgraded.getSession(direct),
					directCurrent: await upgraded.getSessionV2Registration(direct),
				});
			} finally {
				await upgraded.close();
			}
		}

		assert.deepStrictEqual(results, [4, 5, 6].map(version => ({
			version,
			schemaVersion: [{ user_version: 10 }],
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
		})));
	});

	test('migrates v7 registry rows to the v8 envelope and requires payload reseeding', async () => {
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
				session_generation: 'generation-6',
				source_revision: 7,
				payload_version: 4,
				payload_hash: 'published-hash',
				verified: 0,
				payload: null,
				is_chat_backing: 1,
			}],
		});
	});

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
	});

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
			database.upsertSessionV2(createEnvelope(session, 'generation-1', 3, { payload: '{"payloadVersion":1,"data":{}}' }), 'generation-1'),
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

	test('runtime mutations atomically mirror current identity and provenance to legacy', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://runtime-mirror';
		await database.excludeSessionV2({
			provider: 'copilot',
			session,
			reason: 'providerAbsent',
			fingerprint: 'enumeration-v1',
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
	});

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
	});

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
});
