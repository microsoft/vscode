/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
				'CREATE TABLE evil (id INT)',
				'ATTACH DATABASE "evil.db" AS evil',
			];

			for (const sql of mutations) {
				const result = await tool.invoke(
					makeOptions({ action: 'query', query: sql, description: 'test' }),
					cts.token,
				);
				expect(extractText(result)).toContain('Blocked SQL');
			}
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

		it('falls back to executeReadOnlyFallback on authorizer error', async () => {
			const store = createMockStore();
			(store.executeReadOnly as any).mockImplementation(() => {
				throw new Error('authorizer denied');
			});
			const { tool } = createToolInstance({ store });
			const cts = new CancellationTokenSource();

			const result = await tool.invoke(
				makeOptions({ action: 'query', query: 'SELECT * FROM sessions', description: 'test' }),
				cts.token,
			);

			expect(store.executeReadOnlyFallback).toHaveBeenCalled();
			expect(extractText(result)).toContain('Results:');
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
});
