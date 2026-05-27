/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { expect, suite, test } from 'vitest';
import { ConfigKey } from '../../../../platform/configuration/common/configurationService';
import { URI } from '../../../../util/vs/base/common/uri';
import { toolCategories, ToolCategory, ToolName } from '../../common/toolNames';
import { ToolRegistry } from '../../common/toolsRegistry';

// Ensure side-effect registration
import '../searchSubagentTool';

/**
 * Returns an invokeFunction stub that dequeues outcomes in call order.
 * Each outcome is either a value to resolve with, or a thunk that throws.
 */
function sequencedInvokeFunction(...outcomes: Array<unknown | (() => never)>) {
	let i = 0;
	return async (_fn: unknown) => {
		const outcome = outcomes[i++];
		if (typeof outcome === 'function') {
			return (outcome as () => unknown)();
		}
		return outcome;
	};
}

/** Minimal vscode.TextDocument-shaped object that satisfies TextDocumentSnapshot.create. */
function makeFakeDocument(uri: URI, text: string) {
	return {
		uri,
		getText: () => text,
		languageId: 'typescript',
		eol: 1,
		version: 0,
	} as unknown as vscode.TextDocument;
}

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
function makeToolInstance(
	thoroughnessEnabled: boolean,
	toolCallLimit: number = 4,
	overrides: {
		invokeFunction?: (fn: unknown) => Promise<unknown>;
		openTextDocument?: (uri: URI) => Promise<vscode.TextDocument>;
	} = {},
) {
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
	const instantiationService = {
		createInstance(_ctor: unknown, options: { toolCallLimit: number; thoroughness?: string }) {
			capturedLoopOptions.push({ toolCallLimit: options.toolCallLimit, thoroughness: options.thoroughness });
			// Return a minimal stub that exposes run()
			return { run: async () => ({ response: { type: 'error', reason: 'stub' }, toolCallRounds: [], round: { response: '' } }) };
		},
		invokeFunction: overrides.invokeFunction ?? (async () => { throw new Error('invokeFunction not stubbed'); }),
	};

	const workspaceService = {
		getWorkspaceFolders: () => [],
		openTextDocument: overrides.openTextDocument ?? (async () => { throw new Error('openTextDocument not stubbed'); }),
	};

	const tool = new (toolCtor as any)(
		instantiationService,
		{ captureInvocation: async (_token: unknown, fn: () => unknown) => fn() }, // requestLogger
		workspaceService,
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

	suite('parseFinalAnswerAndHydrate', () => {
		const notCancelled = { isCancellationRequested: false } as vscode.CancellationToken;

		test('preserves non-matching lines verbatim when the model uses a different format', async () => {
			const { tool } = makeToolInstance(false);
			const response = [
				'Here are the relevant snippets:',
				'- /workspace/file.ts (lines 10-20): test1',
				'- /workspace/other.ts (lines 30-40): test2',
			].join('\n');

			const result = await tool['parseFinalAnswerAndHydrate'](response, '/workspace', undefined, notCancelled);

			expect(result).toBe(response);
		});

		test('drops the line when the path is outside the workspace', async () => {
			const { tool } = makeToolInstance(false, 4, {
				invokeFunction: sequencedInvokeFunction(
					() => { throw new Error('outside workspace'); },
					true,
				),
			});

			const response = '/external/secret.ts:5-10';
			const result = await tool['parseFinalAnswerAndHydrate'](response, '/workspace', undefined, notCancelled);

			expect(result).toBe('');
		});

		test('keeps the original line when an inside-workspace path fails to open', async () => {
			const { tool } = makeToolInstance(false, 4, {
				invokeFunction: sequencedInvokeFunction(
					undefined,
					false,
				),
				openTextDocument: async () => { throw new Error('file not found'); },
			});

			const response = 'inside/file.ts:5-10';
			const result = await tool['parseFinalAnswerAndHydrate'](response, '/workspace', undefined, notCancelled);

			expect(result).toBe(response);
		});

		test('hydrates the line with code when an inside-workspace path opens', async () => {
			const cwd = '/workspace';
			const filePath = 'inside/file.ts';
			const fileText = 'line1\nline2';
			const uri = URI.joinPath(URI.file(cwd), filePath);

			const { tool } = makeToolInstance(false, 4, {
				invokeFunction: sequencedInvokeFunction(undefined),
				openTextDocument: async () => makeFakeDocument(uri, fileText),
			});

			const result = await tool['parseFinalAnswerAndHydrate'](`${filePath}:1-2`, cwd, undefined, notCancelled);

			expect(result).toBe(`File: \`${uri.fsPath}\`, lines 1-2:\n\`\`\`\n${fileText}\n\`\`\``);
		});
	});
});
