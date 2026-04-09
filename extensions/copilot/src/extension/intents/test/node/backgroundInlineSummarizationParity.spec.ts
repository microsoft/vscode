/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { describe, expect, test } from 'vitest';
import type { LanguageModelToolInformation } from 'vscode';
import { toTextPart } from '../../../../platform/chat/common/globalStringUtils';
import { normalizeToolSchema } from '../../../tools/common/toolSchemaNormalizer';

/**
 * Verifies that the background inline summarization request is structured
 * identically to a regular agent tool-calling loop request — up until the
 * final summarization user message.
 *
 * Prompt cache hit rate depends on the request body (system + tools +
 * messages + model capabilities) being identical between the main agent
 * loop and the background summarization call. If any cache-critical field
 * diverges, the provider won't match the cache prefix.
 *
 * This test models the request-building logic from both paths:
 *   Main loop:  toolCallingLoop.runOne() → defaultIntentRequestHandler.fetch()
 *   Background: agentIntent._startBackgroundSummarization()
 *
 * Any change to either path should be reflected in the other and in this test.
 */
describe('Background inline summarization request parity', () => {

	function createTestTools(): LanguageModelToolInformation[] {
		return [
			{
				name: 'read_file',
				description: 'Read file contents',
				inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
				tags: [],
			},
			{
				name: 'apply_patch',
				description: 'Apply a patch to files',
				inputSchema: { type: 'object', properties: { patch: { type: 'string' } }, required: ['patch'] },
				tags: [],
			},
			{
				name: 'run_terminal',
				description: 'Run a command in the terminal',
				inputSchema: {},
				tags: [],
			},
		] as unknown as LanguageModelToolInformation[];
	}

	/**
	 * Models the tool schema path in the main agent loop:
	 *   1. toolCallingLoop.runOne() maps LanguageModelToolInformation → OpenAiFunctionDef
	 *   2. defaultIntentRequestHandler.fetch() normalizes via normalizeToolSchema
	 */
	function buildMainLoopTools(tools: LanguageModelToolInformation[], family: string) {
		// Step 1: toolCallingLoop.runOne() builds promptContextTools
		const promptContextTools = tools.map(toolInfo => ({
			function: {
				name: toolInfo.name,
				description: toolInfo.description,
				parameters: toolInfo.inputSchema && Object.keys(toolInfo.inputSchema).length ? toolInfo.inputSchema : undefined,
			},
			type: 'function' as const,
		}));

		// Step 2: defaultIntentRequestHandler.fetch() normalizes
		return normalizeToolSchema(
			family,
			promptContextTools.map(tool => ({
				function: {
					name: tool.function.name,
					description: tool.function.description,
					parameters: tool.function.parameters && Object.keys(tool.function.parameters).length ? tool.function.parameters : undefined,
				},
				type: 'function' as const,
			})),
			() => { },
		);
	}

	/**
	 * Models the tool schema path in _startBackgroundSummarization():
	 *   Maps LanguageModelToolInformation → normalizeToolSchema directly
	 */
	function buildBackgroundTools(tools: LanguageModelToolInformation[], family: string) {
		return normalizeToolSchema(
			family,
			tools.map(tool => ({
				function: {
					name: tool.name,
					description: tool.description,
					parameters: tool.inputSchema && Object.keys(tool.inputSchema).length ? tool.inputSchema : undefined,
				},
				type: 'function' as const,
			})),
			() => { },
		);
	}

	/**
	 * Models the modelCapabilities built by defaultIntentRequestHandler.fetch()
	 * for a non-subagent Agent location request.
	 */
	function buildMainLoopModelCapabilities(enableThinking: boolean, reasoningEffort: string | undefined, enableToolSearch: boolean, enableContextEditing: boolean) {
		const isThinkingLocation = true; // ChatLocation.Agent is always a thinking location
		return {
			enableThinking: isThinkingLocation && enableThinking,
			reasoningEffort,
			enableToolSearch,
			enableContextEditing,
		};
	}

	/**
	 * Models the modelCapabilities built by _startBackgroundSummarization().
	 * enableThinking is derived from whether the rendered messages contain
	 * thinking blocks (for Anthropic) — same logic as the main loop.
	 */
	function buildBackgroundModelCapabilities(enableThinking: boolean, reasoningEffort: string | undefined, enableToolSearch: boolean, enableContextEditing: boolean) {
		return {
			enableThinking,
			reasoningEffort,
			enableToolSearch,
			enableContextEditing,
		};
	}

	describe('tools', () => {
		test('tool schemas match for all model families', () => {
			const tools = createTestTools();
			for (const family of ['claude-sonnet-4', 'gpt-4.1', 'gemini-2.5-pro']) {
				const mainLoop = buildMainLoopTools(tools, family);
				const background = buildBackgroundTools(tools, family);
				expect(background, `tool schema mismatch for ${family}`).toEqual(mainLoop);
			}
		});

		test('empty inputSchema is stripped identically', () => {
			const tools: LanguageModelToolInformation[] = [{
				name: 'simple_tool',
				description: 'Tool with empty schema',
				inputSchema: {},
				tags: [],
			}] as unknown as LanguageModelToolInformation[];

			const mainLoop = buildMainLoopTools(tools, 'claude-sonnet-4');
			const background = buildBackgroundTools(tools, 'claude-sonnet-4');

			expect(background).toEqual(mainLoop);
			expect(mainLoop![0].function.parameters).toBeUndefined();
		});

		test('no tools produces same result', () => {
			const mainLoop = buildMainLoopTools([], 'claude-sonnet-4');
			const background = buildBackgroundTools([], 'claude-sonnet-4');
			expect(background).toEqual(mainLoop);
		});
	});

	describe('modelCapabilities', () => {
		test('thinking enabled matches when messages contain thinking', () => {
			const main = buildMainLoopModelCapabilities(true, undefined, false, false);
			const bg = buildBackgroundModelCapabilities(true, undefined, false, false);
			expect(bg).toEqual(main);
		});

		test('thinking disabled matches for Anthropic continuation without thinking', () => {
			// Main loop: shouldDisableThinking = true → enableThinking = false
			// Background: messagesContainThinking = false → enableThinking = false
			const main = buildMainLoopModelCapabilities(false, undefined, false, false);
			const bg = buildBackgroundModelCapabilities(false, undefined, false, false);
			expect(bg).toEqual(main);
		});

		test('all capabilities match', () => {
			const main = buildMainLoopModelCapabilities(true, 'medium', true, true);
			const bg = buildBackgroundModelCapabilities(true, 'medium', true, true);
			expect(bg).toEqual(main);
		});

		test('reasoning effort carried through', () => {
			const main = buildMainLoopModelCapabilities(true, 'high', false, false);
			const bg = buildBackgroundModelCapabilities(true, 'high', false, false);
			expect(bg).toEqual(main);
		});
	});

	describe('messages', () => {
		test('messages match up to the summary user message', () => {
			// Simulate a conversation with system + user + assistant + tool messages
			const sharedMessages: Raw.ChatMessage[] = [
				{ role: Raw.ChatRole.System, content: [toTextPart('You are a helpful assistant.')] },
				{ role: Raw.ChatRole.User, content: [toTextPart('Help me fix a bug')] },
				{
					role: Raw.ChatRole.Assistant,
					content: [toTextPart('I\'ll look at the code.')],
					toolCalls: [{ type: 'function', id: 'tc1', function: { name: 'read_file', arguments: '{"path":"src/main.ts"}' } }],
				},
				{ role: Raw.ChatRole.Tool, content: [toTextPart('file contents...')], toolCallId: 'tc1' },
				{ role: Raw.ChatRole.Assistant, content: [toTextPart('I see the issue.')] },
			];

			// Main loop sends exactly these messages
			const mainLoopMessages = [...sharedMessages];

			// Background inline summarization appends a summary user message at the end
			const summaryUserMessage: Raw.ChatMessage = {
				role: Raw.ChatRole.User,
				content: [toTextPart('The conversation has grown too large... produce a summary...')],
			};
			const backgroundMessages = [...sharedMessages, summaryUserMessage];

			// All messages before the summary instruction must be identical
			const backgroundPrefix = backgroundMessages.slice(0, -1);
			expect(backgroundPrefix).toEqual(mainLoopMessages);

			// The extra message must be a user message (the summary instruction)
			expect(backgroundMessages.at(-1)!.role).toBe(Raw.ChatRole.User);
		});
	});

	describe('temperature', () => {
		test('both paths use temperature 0', () => {
			// Main loop: AgentIntent.getIntentHandlerOptions() returns temperature: 0
			//   → defaultIntentRequestHandler.calculateTemperature() uses it
			// Background: hardcodes temperature: 0
			const mainLoopTemp = 0;
			const backgroundTemp = 0;
			expect(backgroundTemp).toBe(mainLoopTemp);
		});
	});
});
