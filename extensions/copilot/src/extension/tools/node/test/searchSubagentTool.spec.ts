/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { expect, suite, test } from 'vitest';
import * as path from 'path';
import { ConfigKey } from '../../../../platform/configuration/common/configurationService';
import { URI } from '../../../../util/vs/base/common/uri';
import { toolCategories, ToolCategory, ToolName } from '../../common/toolNames';
import { ToolRegistry } from '../../common/toolsRegistry';

// Ensure side-effect registration
import '../searchSubagentTool';

/** Minimal stub for LanguageModelToolInformation */
function makeToolInfo(overrides: Partial<vscode.LanguageModelToolInformation> = {}): vscode.LanguageModelToolInformation {
	return {
		name: ToolName.SearchSubagent,
		description: 'base description',
		inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
		tags: [],
		parametersSchema: {},
		...overrides,
	} as unknown as vscode.LanguageModelToolInformation;
}

/** Returns an instance of the (private) SearchSubagentTool via the registry */
function makeToolInstance(thoroughnessEnabled: boolean, toolCallLimit: number = 4) {
	const toolCtor = ToolRegistry.getTools().find(t => t.toolName === ToolName.SearchSubagent)!;

	const configService = {
		getExperimentBasedConfig(key: { id: string }) {
			if (key.id === ConfigKey.Advanced.SearchSubagentThoroughnessEnabled.id) {
				return thoroughnessEnabled;
			}
			if (key.id === ConfigKey.Advanced.SearchSubagentToolCallLimit.id) {
				return toolCallLimit;
			}
			return undefined;
		},
	};
	const experimentationService = {};

	// instantiationService just passes through createInstance calls with the remaining args
	const capturedLoopOptions: { toolCallLimit?: number; thoroughness?: string }[] = [];
	const sharedAccessorService = {
		getWorkspaceFolders: () => [],
		getWorkspaceFolder: () => undefined,
		tabs: [],
		getFilePath: (uri: { fsPath?: string }) => uri.fsPath ?? '',
		getExtensionSkillInfo: () => undefined,
		isExternalInstructionsFile: async () => false,
		isSessionResourceUri: () => false,
		getConfig: () => [],
		isDebugLogUri: () => false,
		isTranscriptUri: () => false,
		isCopilotIgnored: async () => false,
	};
	const instantiationService = {
		createInstance(_ctor: unknown, options: { toolCallLimit: number; thoroughness?: string }) {
			capturedLoopOptions.push({ toolCallLimit: options.toolCallLimit, thoroughness: options.thoroughness });
			// Return a minimal stub that exposes run()
			return { run: async () => ({ response: { type: 'error', reason: 'stub' }, toolCallRounds: [], round: { response: '' } }) };
		},
		invokeFunction: async (fn: (accessor: { get: () => unknown }) => unknown) => fn({ get: () => sharedAccessorService }),
	};

	const tool = new (toolCtor as any)(
		instantiationService,
		{ captureInvocation: async (_token: unknown, fn: () => unknown) => fn() }, // requestLogger
		{ getWorkspaceFolders: () => [], openTextDocument: async () => { throw new Error('stub'); } }, // workspaceService
		configService,
		experimentationService,
	);

	return { tool, capturedLoopOptions };
}

suite('SearchSubagentTool', () => {
	test('is registered and categorized as Core', () => {
		const isRegistered = ToolRegistry.getTools().some(t => t.toolName === ToolName.SearchSubagent);
		expect(isRegistered).toBe(true);
		expect(toolCategories[ToolName.SearchSubagent]).toBe(ToolCategory.Core);
	});

	suite('alternativeDefinition', () => {
		test('returns tool unchanged when thoroughness is disabled', () => {
			const { tool } = makeToolInstance(false);
			const base = makeToolInfo();
			const result = tool.alternativeDefinition(base);
			expect(result).toBe(base);
		});

		test('appends thoroughness description when enabled', () => {
			const { tool } = makeToolInstance(true);
			const result = tool.alternativeDefinition(makeToolInfo());
			expect(result.description).toContain('thoroughness');
			expect(result.description).toContain('normal');
			expect(result.description).toContain('deep');
		});

		test('adds thoroughness enum to inputSchema when enabled', () => {
			const { tool } = makeToolInstance(true);
			const result = tool.alternativeDefinition(makeToolInfo());
			const props = (result.inputSchema as { properties: Record<string, unknown> }).properties;
			expect(props).toHaveProperty('thoroughness');
			expect((props['thoroughness'] as { enum: string[] }).enum).toEqual(['normal', 'deep']);
		});

		test('preserves existing schema properties when enabled', () => {
			const { tool } = makeToolInstance(true);
			const result = tool.alternativeDefinition(makeToolInfo());
			const props = (result.inputSchema as { properties: Record<string, unknown> }).properties;
			expect(props).toHaveProperty('query');
		});
	});

	suite('thoroughness tool-call limit', () => {
		test('deep doubles the base toolCallLimit', async () => {
			const baseLimit = 4;
			const { tool, capturedLoopOptions } = makeToolInstance(true, baseLimit);
			tool['_inputContext'] = {
				request: { location: 1 },
				conversation: { sessionId: 'test-session' },
				stream: undefined,
			};

			await tool.invoke({
				input: { query: 'test', description: 'desc', details: 'details', thoroughness: 'deep' },
				chatStreamToolCallId: undefined,
			}, { isCancellationRequested: true } as vscode.CancellationToken).catch(() => { /* stub errors expected */ });

			expect(capturedLoopOptions[0]?.toolCallLimit).toBe(baseLimit * 2);
		});

		test('normal uses base toolCallLimit unchanged', async () => {
			const baseLimit = 4;
			const { tool, capturedLoopOptions } = makeToolInstance(true, baseLimit);
			tool['_inputContext'] = {
				request: { location: 1 },
				conversation: { sessionId: 'test-session' },
				stream: undefined,
			};

			await tool.invoke({
				input: { query: 'test', description: 'desc', details: 'details', thoroughness: 'normal' },
				chatStreamToolCallId: undefined,
			}, { isCancellationRequested: true } as vscode.CancellationToken).catch(() => { /* stub errors expected */ });

			expect(capturedLoopOptions[0]?.toolCallLimit).toBe(baseLimit);
		});

		test('thoroughness disabled: omitted thoroughness uses base limit', async () => {
			const baseLimit = 4;
			const { tool, capturedLoopOptions } = makeToolInstance(false, baseLimit);
			tool['_inputContext'] = {
				request: { location: 1 },
				conversation: { sessionId: 'test-session' },
				stream: undefined,
			};

			await tool.invoke({
				input: { query: 'test', description: 'desc', details: 'details' },
				chatStreamToolCallId: undefined,
			}, { isCancellationRequested: true } as vscode.CancellationToken).catch(() => { /* stub errors expected */ });

			expect(capturedLoopOptions[0]?.toolCallLimit).toBe(baseLimit);
		});

		test('thoroughness disabled: deep is ignored and base limit is used', async () => {
			const baseLimit = 4;
			const { tool, capturedLoopOptions } = makeToolInstance(false, baseLimit);
			tool['_inputContext'] = {
				request: { location: 1 },
				conversation: { sessionId: 'test-session' },
				stream: undefined,
			};

			await tool.invoke({
				input: { query: 'test', description: 'desc', details: 'details', thoroughness: 'deep' },
				chatStreamToolCallId: undefined,
			}, { isCancellationRequested: true } as vscode.CancellationToken).catch(() => { /* stub errors expected */ });

			expect(capturedLoopOptions[0]?.toolCallLimit).toBe(baseLimit);
		});
	});

	suite('parseFinalAnswerAndHydrate workspace boundaries', () => {
		test('does not hydrate absolute paths outside workspace', async () => {
			let openTextDocumentCalled = false;
			const workspaceRoot = path.resolve('/workspace');
			const outsidePath = path.resolve('/outside/secret.txt');

			const { tool } = makeToolInstance(true);
			(tool as any).workspaceService = {
				getWorkspaceFolders: () => [URI.file(workspaceRoot)],
				getWorkspaceFolder: (uri: { fsPath: string }) => uri.fsPath.startsWith(workspaceRoot) ? URI.file(workspaceRoot) : undefined,
				openTextDocument: async () => {
					openTextDocumentCalled = true;
					throw new Error('should not be called for out-of-workspace path');
				},
			};

			const response = await (tool as any).parseFinalAnswerAndHydrate(`${outsidePath}:1-1`, workspaceRoot, URI.file(workspaceRoot), { isCancellationRequested: false });

			expect(openTextDocumentCalled).toBe(false);
			expect(response).toContain('outside of the workspace');
		});

		test('hydrates absolute paths inside workspace', async () => {
			const workspaceRoot = path.resolve('/workspace');
			const insidePath = path.resolve('/workspace/src/file.ts');
			const fileText = 'first line\nsecond line\nthird line';

			const { tool } = makeToolInstance(true);
			(tool as any).workspaceService = {
				getWorkspaceFolders: () => [URI.file(workspaceRoot)],
				getWorkspaceFolder: (uri: { fsPath: string }) => uri.fsPath.startsWith(workspaceRoot) ? URI.file(workspaceRoot) : undefined,
				openTextDocument: async () => ({
					uri: URI.file(insidePath),
					languageId: 'typescript',
					eol: 1,
					version: 1,
					getText: (range?: { start: { line: number; character: number }; end: { line: number; character: number } }) => {
						if (!range) {
							return fileText;
						}

						const lines = fileText.split(/\r\n|\r|\n/g);
						const startLine = range.start.line;
						const endLine = range.end.line;
						return lines.slice(startLine, endLine + 1).join('\n');
					},
				}),
			};

			const response = await (tool as any).parseFinalAnswerAndHydrate(`${insidePath}:2-3`, workspaceRoot, URI.file(workspaceRoot), { isCancellationRequested: false });

			expect(response).toContain('second line');
			expect(response).toContain('third line');
		});
	});
});
