/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import type { Database } from '@vscode/sqlite3';
import { join } from '../../../../base/common/path.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostDatabase, IAgentHostDatabase, IAgentHostDatabaseSessionV2Projection } from '../../node/agentHostDatabase.js';

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

function createProjection(
	session: string,
	sessionGeneration: string,
	sourceRevision: number,
	overrides: Partial<IAgentHostDatabaseSessionV2Projection> = {},
): IAgentHostDatabaseSessionV2Projection {
	return {
		session,
		sessionGeneration,
		modifiedTime: 100 + sourceRevision,
		title: `Title ${sourceRevision}`,
		titleSource: 'user',
		isRead: true,
		isArchived: false,
		projectUri: 'file:///project',
		projectDisplayName: 'Project',
		workspaceless: false,
		isChatBacking: false,
		ehcliAdoptable: true,
		workingDirectoriesJson: '["file:///project","file:///project/packages/app"]',
		chatsJson: `[{"kind":"default","order":0,"title":"Default","titleSource":"auto","uri":"${session}#default"},{"kind":"peer","order":1,"originJson":"{\\"type\\":\\"subagent\\"}","title":"Peer","titleSource":"agent","uri":"${session}#peer"}]`,
		multiRootJson: '{"workspaceFile":"file:///project.code-workspace"}',
		folderPickerJson: '{"hidden":false,"primary":"file:///project"}',
		changesSummaryJson: '{"files":2}',
		githubSummaryJson: '{"owner":"microsoft","repo":"vscode"}',
		gitSummaryJson: '{"branchName":"main"}',
		sourceControlSummaryJson: '{"latestOutcome":"merge"}',
		artifactsJson: '[{"id":"artifact","label":"Artifact","type":"file"}]',
		orchestrationJson: '{"coordinateWithCreator":true,"creatorSession":"session://parent","parentSession":"session://parent"}',
		sourceRevision,
		projectionVersion: 4,
		sourceHash: `hash-${sourceRevision}`,
		verified: true,
		...overrides,
	};
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
		await database.registerSession('session://fresh', {
			provider: 'copilot',
			startTime: 1,
			source: 'explicit',
		}, { checkTombstone: false });
		await database.close();
		database = undefined;

		const rawDatabase = await openDatabase(path);
		try {
			const [version, tables, sessionColumns, sessionV2Columns] = await Promise.all([
				all(rawDatabase, 'PRAGMA user_version'),
				all(rawDatabase, `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`),
				all(rawDatabase, 'PRAGMA table_info(sessions)'),
				all(rawDatabase, 'PRAGMA table_info(sessions_v2)'),
			]);
			assert.deepStrictEqual({
				version,
				tables: tables.map(row => row.name),
				sessionColumns: sessionColumns.map(row => row.name),
				sessionV2Columns: sessionV2Columns.map(row => row.name),
			}, {
				version: [{ user_version: 5 }],
				tables: ['metadata', 'sessions', 'sessions_v2'],
				sessionColumns: ['session_uri', 'provider', 'start_time', 'external', 'registration_source'],
				sessionV2Columns: [
					'session_uri', 'provider', 'start_time', 'external', 'registration_source', 'modified_time',
					'title', 'title_source', 'is_read', 'is_archived', 'project_uri', 'project_display_name',
					'workspaceless', 'ehcli_adoptable', 'working_directories_json', 'chats_json', 'multi_root_json',
					'folder_picker_json', 'changes_summary_json', 'github_summary_json', 'git_summary_json',
					'source_control_summary_json', 'artifacts_json', 'orchestration_json', 'session_generation',
					'source_revision', 'projection_version', 'source_hash', 'verified', 'is_chat_backing',
				],
			});
		} finally {
			await close(rawDatabase);
		}
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
				session: { session: 'session://upgrade-1', provider: 'copilot', startTime: 1, external: undefined, source: 'explicit' },
				sessionV2: undefined,
				migratedRows: [{ session_uri: 'session://upgrade-1', provider: 'copilot', start_time: 1, external: null, registration_source: 'explicit', verified: 0 }],
			},
			{
				version: 2,
				session: { session: 'session://upgrade-2', provider: 'copilot', startTime: 2, external: true, source: 'discovery' },
				sessionV2: undefined,
				migratedRows: [{ session_uri: 'session://upgrade-2', provider: 'copilot', start_time: 2, external: 1, registration_source: 'discovery', verified: 0 }],
			},
			{
				version: 3,
				session: { session: 'session://upgrade-3', provider: 'copilot', startTime: 3, external: false, source: 'restore' },
				sessionV2: undefined,
				migratedRows: [{ session_uri: 'session://upgrade-3', provider: 'copilot', start_time: 3, external: 0, registration_source: 'restore', verified: 0 }],
			},
		]);
	});

	test('round trips one complete verified row', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://round-trip';
		await database.registerSession(session, {
			provider: 'copilot',
			startTime: 42,
			source: 'restore',
		}, { checkTombstone: false });
		const projection = createProjection(session, 'generation-1', 7);

		const result = await database.upsertSessionV2(projection, undefined);

		assert.deepStrictEqual({
			result,
			row: await database.getSessionV2(session),
			rows: await database.listSessionsV2(),
		}, {
			result: 'applied',
			row: {
				...projection,
				provider: 'copilot',
				startTime: 42,
				external: false,
				source: 'restore',
			},
			rows: [{
				...projection,
				provider: 'copilot',
				startTime: 42,
				external: false,
				source: 'restore',
			}],
		});
	});

	test('guards revisions and generation transitions', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://ordering';
		await database.registerSession(session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.upsertSessionV2(createProjection(session, 'generation-1', 2), undefined);

		const results = {
			stale: await database.upsertSessionV2(createProjection(session, 'generation-1', 1), 'generation-1'),
			conflict: await database.upsertSessionV2(createProjection(session, 'generation-1', 2, { sourceHash: 'conflict' }), 'generation-1'),
			replayed: await database.upsertSessionV2(createProjection(session, 'generation-1', 2), 'generation-1'),
			wrongGeneration: await database.upsertSessionV2(createProjection(session, 'generation-2', 0), 'unknown-generation'),
			transitioned: await database.upsertSessionV2(createProjection(session, 'generation-2', 0), 'generation-1'),
			delayedOldGeneration: await database.upsertSessionV2(createProjection(session, 'generation-1', 3), 'generation-1'),
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
			row: {
				...createProjection(session, 'generation-2', 0),
				provider: 'copilot',
				startTime: 1,
				external: false,
				source: 'explicit',
			},
		});
	});

	test('serializes concurrent upserts and an upsert racing deletion', async () => {
		database = new AgentHostDatabase(':memory:');
		const sessions = Array.from({ length: 20 }, (_, index) => `session://concurrent-${index}`);
		for (const session of sessions) {
			await database.registerSession(session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		}

		const upsertResults = await Promise.all(sessions.map(session => database!.upsertSessionV2(createProjection(session, 'generation-1', 1), undefined)));
		const racingSession = sessions[0];
		const [racingUpsert] = await Promise.all([
			database.upsertSessionV2(createProjection(racingSession, 'generation-1', 2), 'generation-1'),
			database.unregisterSession(racingSession),
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

	test('mirrors registration provenance changes without a catalog revision', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://provenance';
		await database.registerSession(session, { provider: 'copilot', startTime: 1, source: 'discovery' }, { checkTombstone: true });
		await database.upsertSessionV2(createProjection(session, 'generation-1', 1), undefined);
		const discovered = await database.getSessionV2(session);

		await database.registerSession(session, { provider: 'ignored-provider', startTime: 2, source: 'restore' }, { checkTombstone: false });
		const restored = await database.getSessionV2(session);
		await database.registerSession(session, { provider: 'claude', startTime: 3, source: 'explicit' }, { checkTombstone: false });
		const explicit = await database.getSessionV2(session);

		assert.deepStrictEqual({
			discovered: discovered && { provider: discovered.provider, startTime: discovered.startTime, external: discovered.external, source: discovered.source, sourceRevision: discovered.sourceRevision },
			restored: restored && { provider: restored.provider, startTime: restored.startTime, external: restored.external, source: restored.source, sourceRevision: restored.sourceRevision },
			explicit: explicit && { provider: explicit.provider, startTime: explicit.startTime, external: explicit.external, source: explicit.source, sourceRevision: explicit.sourceRevision },
		}, {
			discovered: { provider: 'copilot', startTime: 1, external: true, source: 'discovery', sourceRevision: 1 },
			restored: { provider: 'copilot', startTime: 1, external: false, source: 'restore', sourceRevision: 1 },
			explicit: { provider: 'claude', startTime: 1, external: false, source: 'explicit', sourceRevision: 1 },
		});
	});

	test('mirrors legacy external provenance backfill without a catalog revision', async () => {
		const path = join(temporaryDirectory!, 'external-backfill.db');
		const session = 'session://external-backfill';
		database = new AgentHostDatabase(path);
		await database.registerSession(session, { provider: 'copilot', startTime: 1, source: 'restore' }, { checkTombstone: false });
		await database.upsertSessionV2(createProjection(session, 'generation-1', 1), undefined);
		await database.close();
		database = undefined;

		const rawDatabase = await openDatabase(path);
		await exec(rawDatabase, `UPDATE sessions SET external = NULL WHERE session_uri = '${session}';
			UPDATE sessions_v2 SET external = NULL WHERE session_uri = '${session}'`);
		await close(rawDatabase);

		database = new AgentHostDatabase(path);
		await database.updateSessionExternal([{ session, external: true }]);
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

	test('legacy deletion cascades and legacy insertion needs no new columns', async () => {
		const path = join(temporaryDirectory!, 'old-build.db');
		database = new AgentHostDatabase(path);
		await database.registerSession('session://deleted', { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.upsertSessionV2(createProjection('session://deleted', 'generation-1', 1), undefined);
		await database.unregisterSession('session://deleted');
		await database.close();
		database = undefined;

		const oldBuildDatabase = await openDatabase(path);
		await exec(oldBuildDatabase, `INSERT INTO sessions (session_uri, provider, start_time, external, registration_source)
			VALUES ('session://old-build', 'copilot', 2, 1, 'discovery')`);
		const deletedRows = await all(oldBuildDatabase, `SELECT session_uri FROM sessions_v2 WHERE session_uri = 'session://deleted'`);
		await close(oldBuildDatabase);

		database = new AgentHostDatabase(path);
		assert.deepStrictEqual({
			deletedRows,
			oldBuildSession: await database.getSession('session://old-build'),
			oldBuildSessionV2: await database.getSessionV2('session://old-build'),
		}, {
			deletedRows: [],
			oldBuildSession: { session: 'session://old-build', provider: 'copilot', startTime: 2, external: true, source: 'discovery' },
			oldBuildSessionV2: undefined,
		});
	});

	test('does not surface v2 orphans deleted by an old connection with foreign keys disabled', async () => {
		const path = join(temporaryDirectory!, 'old-build-orphan.db');
		const session = 'session://old-build-orphan';
		database = new AgentHostDatabase(path);
		await database.registerSession(session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.upsertSessionV2(createProjection(session, 'generation-1', 1), undefined);
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
			get: undefined,
			list: [],
		});
	});

	test('does not surface a verified row while its legacy session is tombstoned', async () => {
		database = new AgentHostDatabase(':memory:');
		const session = 'session://tombstoned-read';
		await database.registerSession(session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.upsertSessionV2(createProjection(session, 'generation-1', 1), undefined);
		await database.markSessionTombstoned(session);

		assert.deepStrictEqual({
			get: await database.getSessionV2(session),
			list: await database.listSessionsV2(),
		}, {
			get: undefined,
			list: [],
		});
	});
});
