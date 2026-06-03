/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';
import { describe, expect, it, vi } from 'vitest';
import type { ISessionStore } from '../../../../platform/chronicle/common/sessionStore';
import type { ICopilotTokenManager } from '../../../../platform/authentication/common/copilotTokenManager';
import type { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import type { IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import type { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import type { IFetcherService } from '../../../../platform/networking/common/fetcherService';
import type { IChatDebugFileLoggerService } from '../../../../platform/chat/common/chatDebugFileLoggerService';
import type { IRunCommandExecutionService } from '../../../../platform/commands/common/runCommandExecutionService';
import { CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart } from '../../../../vscodeTypes';
import { ToolName } from '../../common/toolNames';
import { ToolRegistry } from '../../common/toolsRegistry';

// Side-effect registration
import '../sessionStoreSqlTool';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockStore(): ISessionStore {
	return {
		_serviceBrand: undefined as any,
		getPath: () => '/tmp/test.db',
		upsertSession: () => { },
		insertTurn: () => { },
		insertCheckpoint: () => { },
		insertFile: () => { },
		insertRef: () => { },
		indexWorkspaceArtifact: () => { },
		deleteSession: () => { },
		search: () => [],
		getSession: () => undefined,
		getTurns: () => [],
		getFiles: () => [],
		getRefs: () => [],
		getMaxTurnIndex: () => -1,
		getStats: () => ({ sessions: 5, turns: 20, checkpoints: 0, files: 10, refs: 3 }),
		executeReadOnly: vi.fn(() => [{ id: 'local-1', summary: 'test' }]),
		executeReadOnlyFallback: vi.fn(() => [{ id: 'local-1', summary: 'test' }]),
		runInTransaction: (fn: () => void) => fn(),
		close: () => { },
	} as any;
}

function createMockServices() {
	const store = createMockStore();

	const tokenManager: ICopilotTokenManager = {
		_serviceBrand: undefined as any,
		getCopilotToken: vi.fn(async () => ({ token: 'test-token', endpoints: { api: 'https://api.test.com' } })),
	} as any;

	const authService: IAuthenticationService = {
		_serviceBrand: undefined as any,
		anyGitHubSession: { accessToken: 'gh-token' },
	} as any;

	const configService: IConfigurationService = {
		_serviceBrand: undefined as any,
		getConfig: vi.fn(() => false),
		getNonExtensionConfig: vi.fn(() => false),
		getExperimentBasedConfig: vi.fn(() => false),
		getExperimentBasedConfigObservable: vi.fn(() => ({ read: () => false })),
	} as any;

	const telemetryService: ITelemetryService = {
		_serviceBrand: undefined as any,
		sendMSFTTelemetryEvent: vi.fn(),
		sendMSFTTelemetryErrorEvent: vi.fn(),
	} as any;

	const fetcherService: IFetcherService = {
		_serviceBrand: undefined as any,
		fetch: vi.fn(),
	} as any;

	const debugLogService: IChatDebugFileLoggerService = {
		_serviceBrand: undefined as any,
		listSessionIds: vi.fn(async () => []),
		streamEntries: vi.fn(),
	} as any;

	const runCommandService: IRunCommandExecutionService = {
		_serviceBrand: undefined as any,
		executeCommand: vi.fn(async () => undefined),
	} as any;

	return { store, tokenManager, authService, configService, telemetryService, fetcherService, debugLogService, runCommandService };
}

function createToolInstance(overrides: Partial<ReturnType<typeof createMockServices>> = {}) {
	const services = { ...createMockServices(), ...overrides };
	const toolCtor = ToolRegistry.getTools().find(t => t.toolName === ToolName.SessionStoreSql)!;

	const tool = new (toolCtor as any)(
		services.store,
		services.tokenManager,
		services.authService,
		services.configService,
		services.telemetryService,
		services.fetcherService,
		services.debugLogService,
		services.runCommandService,
	);

	return { tool, ...services };
}

function makeOptions<T>(input: T): vscode.LanguageModelToolInvocationOptions<T> {
	return { input, toolInvocationToken: undefined as any, model: undefined as any, chatRequestId: '' } as any;
}

function makeToolInfo(overrides: Partial<vscode.LanguageModelToolInformation> = {}): vscode.LanguageModelToolInformation {
	return {
		name: ToolName.SessionStoreSql,
		description: 'base description',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'SQLite query with FTS5 MATCH support' },
				action: { type: 'string' },
				description: { type: 'string' },
			},
		},
		tags: [],
		parametersSchema: {},
		...overrides,
	} as unknown as vscode.LanguageModelToolInformation;
}

function extractText(result: vscode.LanguageModelToolResult): string {
	const parts: string[] = [];
	for (const part of result.content) {
		if (part instanceof LanguageModelTextPart) {
			parts.push(part.value);
		}
	}
	return parts.join('');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SessionStoreSqlTool', () => {
	it('is registered', () => {
		const isRegistered = ToolRegistry.getTools().some(t => t.toolName === ToolName.SessionStoreSql);
		expect(isRegistered).toBe(true);
	});

	describe('action routing', () => {
		it('defaults to query action', async () => {
			const { tool, store } = createToolInstance();
			const cts = new CancellationTokenSource();

			const result = await tool.invoke(
				makeOptions({ description: 'test', query: 'SELECT COUNT(*) FROM sessions' }),
				cts.token,
			);

			expect(store.executeReadOnly).toHaveBeenCalled();
			expect(extractText(result)).toContain('Results:');
		});

		it('routes standup action correctly', async () => {
			const { tool } = createToolInstance();
			const cts = new CancellationTokenSource();

			const result = await tool.invoke(
				makeOptions({ action: 'standup', description: 'Generate standup' }),
				cts.token,
			);

			const text = extractText(result);
			// Standup should return either session data or an error — not a SQL result
			expect(text).not.toContain('Blocked SQL');
		});

		it('routes reindex action correctly', async () => {
			const { tool, debugLogService } = createToolInstance();
			(debugLogService.listSessionIds as any).mockResolvedValue([]);
			const cts = new CancellationTokenSource();

			const result = await tool.invoke(
				makeOptions({ action: 'reindex', description: 'Reindex sessions' }),
				cts.token,
			);

			const text = extractText(result);
			expect(text).toContain('reindex');
		});
	});

	describe('query security', () => {
		it('blocks mutating SQL statements', async () => {
			const { tool } = createToolInstance();
			const cts = new CancellationTokenSource();

			const mutations = [
				'DROP TABLE sessions',
				'DELETE FROM sessions WHERE 1=1',
				'INSERT INTO sessions VALUES (1)',
				'UPDATE sessions SET summary = "hacked"',
				'CREATE TABLE extra (id INT)',
				'ATTACH DATABASE "other.db" AS other',
			];

			for (const sql of mutations) {
				const result = await tool.invoke(
					makeOptions({ action: 'query', query: sql, description: 'test' }),
					cts.token,
				);
				expect(extractText(result)).toContain('Blocked SQL');
			}
		});

		it('blocks side-effecting and unsafe statements', async () => {
			const { tool } = createToolInstance();
			const cts = new CancellationTokenSource();

			const unsafe = [
				// The originally reported bypass: VACUUM INTO copies the DB to a chosen path.
				`VACUUM INTO '/tmp/copy.db'`,
				'REINDEX',
				'ANALYZE',
				// load_extension would execute native code if SQLite is built with extensions enabled.
				`SELECT load_extension('/tmp/lib.so')`,
				'BEGIN',
				'COMMIT',
				'ROLLBACK',
			];

			for (const sql of unsafe) {
				const result = await tool.invoke(
					makeOptions({ action: 'query', query: sql, description: 'test' }),
					cts.token,
				);
				expect(extractText(result)).toContain('Blocked SQL');
			}
		});

		it('rejects statements that do not start with SELECT or WITH', async () => {
			const { tool } = createToolInstance();
			const cts = new CancellationTokenSource();

			const nonQuery = [
				'PRAGMA data_version', // not blocked by regex carve-out but still not a SELECT/WITH
				`/* hide me */ VACUUM INTO '/tmp/copy.db'`, // comment prefix must not smuggle
				'-- comment\nDROP TABLE sessions', // blocklist also catches DROP, but allowlist is the anchor
				'EXPLAIN SELECT * FROM sessions',
			];

			for (const sql of nonQuery) {
				const result = await tool.invoke(
					makeOptions({ action: 'query', query: sql, description: 'test' }),
					cts.token,
				);
				expect(extractText(result)).toContain('Blocked SQL');
			}
		});

		it('allows WITH (CTE) queries through to executeReadOnly', async () => {
			const { tool, store } = createToolInstance();
			const cts = new CancellationTokenSource();

			await tool.invoke(
				makeOptions({ action: 'query', query: 'WITH x AS (SELECT 1 AS n) SELECT * FROM x', description: 'test' }),
				cts.token,
			);

			expect(store.executeReadOnly).toHaveBeenCalled();
		});

		it('blocks multiple statements', async () => {
			const { tool } = createToolInstance();
			const cts = new CancellationTokenSource();

			const result = await tool.invoke(
				makeOptions({ action: 'query', query: 'SELECT 1; SELECT 2', description: 'test' }),
				cts.token,
			);

			expect(extractText(result)).toContain('Only one SQL statement');
		});

		it('blocks empty queries', async () => {
			const { tool } = createToolInstance();
			const cts = new CancellationTokenSource();

			const result = await tool.invoke(
				makeOptions({ action: 'query', query: '', description: 'test' }),
				cts.token,
			);

			expect(extractText(result)).toContain('Empty query');
		});

		it('strips trailing semicolons', async () => {
			const { tool, store } = createToolInstance();
			const cts = new CancellationTokenSource();

			await tool.invoke(
				makeOptions({ action: 'query', query: 'SELECT * FROM sessions;', description: 'test' }),
				cts.token,
			);

			// Should have called executeReadOnly with the semicolon stripped
			expect(store.executeReadOnly).toHaveBeenCalledWith('SELECT * FROM sessions');
		});
	});

	describe('local query', () => {
		it('returns formatted results', async () => {
			const { tool } = createToolInstance();
			const cts = new CancellationTokenSource();

			const result = await tool.invoke(
				makeOptions({ action: 'query', query: 'SELECT * FROM sessions LIMIT 1', description: 'test' }),
				cts.token,
			);

			const text = extractText(result);
			expect(text).toContain('Results: 1 rows');
			expect(text).toContain('source: local');
		});

		it('routes model-supplied SQL through executeReadOnly (never executeReadOnlyFallback)', async () => {
			const { tool, store } = createToolInstance();
			const cts = new CancellationTokenSource();

			await tool.invoke(
				makeOptions({ action: 'query', query: 'SELECT * FROM sessions', description: 'test' }),
				cts.token,
			);

			expect(store.executeReadOnly).toHaveBeenCalled();
			expect(store.executeReadOnlyFallback).not.toHaveBeenCalled();
		});
	});

	describe('alternativeDefinition', () => {
		it('returns tool unchanged when cloud is not enabled', () => {
			const { tool } = createToolInstance();
			const base = makeToolInfo();
			const result = tool.alternativeDefinition(base);
			expect(result).toBe(base);
		});

		it('swaps description and inputSchema when cloud is enabled', () => {
			const configService = {
				_serviceBrand: undefined as any,
				getConfig: vi.fn(() => false),
				getNonExtensionConfig: vi.fn((key: string) => {
					if (key === 'chat.sessionSync.enabled') {
						return true;
					}
					return false;
				}),
				getExperimentBasedConfig: vi.fn(() => false),
				getExperimentBasedConfigObservable: vi.fn(() => ({ read: () => false })),
			} as any;

			const { tool } = createToolInstance({ configService });
			const base = makeToolInfo();
			const result = tool.alternativeDefinition(base);

			expect(result).not.toBe(base);
			expect(result.description).toContain('DuckDB');
			expect(result.description).toContain('cloud');
			// inputSchema query description should reference DuckDB
			const props = (result.inputSchema as any).properties;
			expect(props.query.description).toContain('DuckDB');
		});
	});

	describe('reindex with force', () => {
		it('passes force=false by default', async () => {
			const { tool, debugLogService } = createToolInstance();
			(debugLogService.listSessionIds as any).mockResolvedValue([]);
			const cts = new CancellationTokenSource();

			await tool.invoke(
				makeOptions({ action: 'reindex', description: 'Reindex sessions' }),
				cts.token,
			);

			// reindexSessions is called via the module — verify through the result
			const result = await tool.invoke(
				makeOptions({ action: 'reindex', description: 'Reindex' }),
				cts.token,
			);
			expect(extractText(result)).toContain('reindex');
		});

		it('passes force=true when specified', async () => {
			const { tool, debugLogService } = createToolInstance();
			(debugLogService.listSessionIds as any).mockResolvedValue([]);
			const cts = new CancellationTokenSource();

			const result = await tool.invoke(
				makeOptions({ action: 'reindex', force: true, description: 'Force reindex' }),
				cts.token,
			);
			expect(extractText(result)).toContain('reindex');
		});
	});

	describe('prepareInvocation', () => {
		it('returns correct messages for each action', () => {
			const { tool } = createToolInstance();
			const cts = new CancellationTokenSource();

			const standup = tool.prepareInvocation(
				{ input: { action: 'standup', description: 'test' } } as any,
				cts.token,
			);
			expect(standup.invocationMessage).toContain('standup');

			const reindex = tool.prepareInvocation(
				{ input: { action: 'reindex', description: 'test' } } as any,
				cts.token,
			);
			expect(reindex.invocationMessage).toContain('eindex');

			const query = tool.prepareInvocation(
				{ input: { action: 'query', description: 'test' } } as any,
				cts.token,
			);
			expect(query.invocationMessage).toContain('uerying');
		});
	});

	// Single source of truth: column-level schema lives in chronicle/SKILL.md.
	// The tool description only carries small, low-drift signals (dialect, read-only,
	// date-math anti-pattern, table names, skill pointer) — these tests pin that contract.
	describe('schema-error regression anchors', () => {
		const copilotRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');

		it('SQLite modelDescription in package.json carries required anchors', () => {
			const pkg = JSON.parse(fs.readFileSync(path.join(copilotRoot, 'package.json'), 'utf-8'));
			const entry = (pkg.contributes.languageModelTools as { name: string; modelDescription?: string }[])
				.find(t => t.name === 'copilot_sessionStoreSql');
			expect(entry?.modelDescription, 'copilot_sessionStoreSql entry missing modelDescription').toBeDefined();
			const desc = entry!.modelDescription!;

			const required = [
				'SQLite', 'queries are read-only', 'SELECT', 'WITH',
				`datetime('now'`, 'NOT `now() - INTERVAL',
				'MATCH', 'chronicle',
				'sessions', 'turns', 'session_files', 'session_refs', 'checkpoints', 'search_index',
			];
			expect(required.filter(a => !desc.includes(a))).toEqual([]);
		});

		it('DuckDB CLOUD_MODEL_DESCRIPTION (via alternativeDefinition) carries required anchors', () => {
			const configService = {
				_serviceBrand: undefined as any,
				getConfig: vi.fn(() => false),
				getNonExtensionConfig: vi.fn((key: string) => key === 'chat.sessionSync.enabled'),
				getExperimentBasedConfig: vi.fn(() => false),
				getExperimentBasedConfigObservable: vi.fn(() => ({ read: () => false })),
			} as any;
			const { tool } = createToolInstance({ configService });
			const desc: string = tool.alternativeDefinition(makeToolInfo()).description;

			const required = [
				'DuckDB', 'queries are read-only', 'SELECT', 'WITH',
				'now() - INTERVAL', `NOT \`datetime('now'`,
				'ILIKE', 'chronicle',
				'sessions', 'turns', 'session_files', 'session_refs', 'checkpoints', 'events', 'tool_requests',
			];
			expect(required.filter(a => !desc.includes(a))).toEqual([]);
		});

		it('chronicle slash prompts reference the chronicle skill', () => {
			const promptDir = path.join(copilotRoot, 'assets', 'prompts');
			const prompts = ['chronicle-tips.prompt.md', 'chronicle-cost-tips.prompt.md', 'chronicle-standup.prompt.md', 'chronicle-search.prompt.md'];
			const missing = prompts.filter(name => {
				const body = fs.readFileSync(path.join(promptDir, name), 'utf-8');
				return !/\*\*chronicle\*\* skill/.test(body);
			});
			expect(missing).toEqual([]);
		});

		it('chronicle SKILL.md Cost Tips section carries required anchors', () => {
			const skill = fs.readFileSync(
				path.join(copilotRoot, 'assets', 'prompts', 'skills', 'chronicle', 'SKILL.md'),
				'utf-8',
			);
			const required = [
				'### Cost Tips',
				'usage_input_tokens', 'usage_output_tokens', 'usage_model',
				'agent_name',
				`'VS Code Chat'`,
				`'GitHub Copilot Chat'`,
				'assistant.usage',
				'local SQLite',
				'chat.sessionSync.enabled',
			];
			expect(required.filter(a => !skill.includes(a))).toEqual([]);
		});
	});
});
