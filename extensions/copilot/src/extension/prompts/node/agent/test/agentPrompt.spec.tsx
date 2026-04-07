/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, beforeEach, expect, suite, test } from 'vitest';
import { IChatMLFetcher } from '../../../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../../../platform/chat/common/commonTypes';
import { StaticChatMLFetcher } from '../../../../../platform/chat/test/common/staticChatMLFetcher';
import { CodeGenerationTextInstruction, ConfigKey, IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { MockEndpoint } from '../../../../../platform/endpoint/test/node/mockEndpoint';
import { messageToMarkdown } from '../../../../../platform/log/common/messageStringify';
import { IResponseDelta } from '../../../../../platform/networking/common/fetch';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { createTextDocumentData } from '../../../../../util/common/test/shims/textDocument';
import { URI } from '../../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatRequestEditedFileEventKind, LanguageModelTextPart, LanguageModelToolResult } from '../../../../../vscodeTypes';
import { addCacheBreakpoints } from '../../../../intents/node/cacheBreakpoints';
import { ChatVariablesCollection } from '../../../../prompt/common/chatVariablesCollection';
import { Conversation, ICopilotChatResultIn, Turn, TurnStatus } from '../../../../prompt/common/conversation';
import { IBuildPromptContext, IToolCall } from '../../../../prompt/common/intents';
import { ToolCallRound } from '../../../../prompt/common/toolCallRound';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ToolName } from '../../../../tools/common/toolNames';
import { IToolsService } from '../../../../tools/common/toolsService';
import { PromptRenderer } from '../../base/promptRenderer';
import { AgentPrompt, AgentPromptProps } from '../agentPrompt';
import { PromptRegistry } from '../promptRegistry';

const testFamilies = [
	'default',
	'gpt-4.1',
	'gpt-5',
	'gpt-5-mini',
	'gpt-5-codex',
	'gpt-5.1',
	'gpt-5.1-codex',
	'gpt-5.1-codex-mini',
	'claude-haiku-4.5',
	'claude-sonnet-4.5',
	'claude-opus-4.5',
	'claude-sonnet-4.6',
	'claude-opus-4.6',
	'gemini-2.0-flash',
	'grok-code-fast-1'
];

testFamilies.forEach(family => {
	suite(`AgentPrompt - ${family}`, () => {
		let accessor: ITestingServicesAccessor;
		let chatResponse: (string | IResponseDelta[])[] = [];
		const fileTsUri = URI.file('/workspace/file.ts');

		function getSnapshotFile(name: string): string {
			return `./__snapshots__/agentPrompts-${family}/${name}.spec.snap`;
		}

		let conversation: Conversation;

		beforeAll(() => {
			const testDoc = createTextDocumentData(fileTsUri, 'line 1\nline 2\n\nline 4\nline 5', 'ts').document;

			const services = createExtensionUnitTestingServices();
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[
					[URI.file('/workspace')],
					[testDoc]
				]
			));
			chatResponse = [];
			services.define(IChatMLFetcher, new StaticChatMLFetcher(chatResponse));
			accessor = services.createTestingAccessor();
			accessor.get(IConfigurationService).setConfig(ConfigKey.CodeGenerationInstructions, [{
				text: 'This is a test custom instruction file',
			} satisfies CodeGenerationTextInstruction]);
		});

		beforeEach(() => {
			const turn = new Turn('turnId', { type: 'user', message: 'hello' });
			conversation = new Conversation('sessionId', [turn]);
		});

		afterAll(() => {
			accessor.dispose();
		});

		async function agentPromptToString(accessor: ITestingServicesAccessor, promptContext: IBuildPromptContext, otherProps?: Partial<AgentPromptProps>): Promise<string> {
			const instaService = accessor.get(IInstantiationService);
			const endpoint = family === 'default'
				? instaService.createInstance(MockEndpoint, undefined)
				: instaService.createInstance(MockEndpoint, family);
			if (!promptContext.conversation) {
				promptContext = { ...promptContext, conversation };
			}

			const customizations = await PromptRegistry.resolveAllCustomizations(instaService, endpoint);
			const baseProps = {
				priority: 1,
				endpoint,
				location: ChatLocation.Panel,
				promptContext,
				...otherProps,
				customizations
			};

			const props: AgentPromptProps = baseProps;
			const renderer = PromptRenderer.create(instaService, endpoint, AgentPrompt, props);

			const r = await renderer.render();
			addCacheBreakpoints(r.messages);
			return r.messages
				.map(m => messageToMarkdown(m))
				.join('\n\n')
				.replace(/\\+/g, '/')
				.replace(/The current date is.*/g, '(Date removed from snapshot)');
		}

		function createEditFileToolCall(idx: number): IToolCall {
			return {
				id: `tooluse_${idx}`,
				name: ToolName.EditFile,
				arguments: JSON.stringify({
					filePath: fileTsUri.fsPath, code: `// existing code...\nconsole.log('hi')`
				})
			};
		}

		function createEditFileToolResult(...idxs: number[]): Record<string, LanguageModelToolResult> {
			const result: Record<string, LanguageModelToolResult> = {};
			for (const idx of idxs) {
				result[`tooluse_${idx}`] = new LanguageModelToolResult([new LanguageModelTextPart('success')]);
			}
			return result;
		}

		test('simple case', async () => {
			await expect(await agentPromptToString(accessor, {
				chatVariables: new ChatVariablesCollection(),
				history: [],
				query: 'hello',
			}, undefined)).toMatchFileSnapshot(getSnapshotFile('simple_case'));
		});

		test('all tools', async () => {
			const toolsService = accessor.get(IToolsService);
			await expect(await agentPromptToString(accessor, {
				chatVariables: new ChatVariablesCollection(),
				history: [],
				query: 'hello',
				tools: {
					availableTools: toolsService.tools,
					toolInvocationToken: null as never,
					toolReferences: [],
				}
			}, undefined)).toMatchFileSnapshot(getSnapshotFile('all_tools'));
		});

		test('all non-edit tools', async () => {
			const toolsService = accessor.get(IToolsService);
			const editTools: Set<string> = new Set([ToolName.ApplyPatch, ToolName.EditFile, ToolName.ReplaceString, ToolName.MultiReplaceString]);
			await expect(await agentPromptToString(accessor, {
				chatVariables: new ChatVariablesCollection(),
				history: [],
				query: 'hello',
				tools: {
					availableTools: toolsService.tools.filter(t => !editTools.has(t.name)),
					toolInvocationToken: null as never,
					toolReferences: [],
				}
			}, undefined)).toMatchFileSnapshot(getSnapshotFile('all_non_edit_tools'));
		});

		test('one attachment', async () => {
			await expect(await agentPromptToString(accessor, {
				chatVariables: new ChatVariablesCollection([{ id: 'vscode.file', name: 'file', value: fileTsUri }]),
				history: [],
				query: 'hello',
			}, undefined)).toMatchFileSnapshot(getSnapshotFile('one_attachment'));
		});

		const tools: IBuildPromptContext['tools'] = {
			availableTools: [],
			toolInvocationToken: null as never,
			toolReferences: [],
		};

		test('tool use', async () => {
			await expect(await agentPromptToString(
				accessor,
				{
					chatVariables: new ChatVariablesCollection([{ id: 'vscode.file', name: 'file', value: fileTsUri }]),
					history: [],
					query: 'edit this file',
					toolCallRounds: [
						new ToolCallRound('ok', [createEditFileToolCall(1)]),
					],
					toolCallResults: createEditFileToolResult(1),
					tools,
				}, undefined)).toMatchFileSnapshot(getSnapshotFile('tool_use'));
		});

		test('cache BPs', async () => {
			await expect(await agentPromptToString(
				accessor,
				{
					chatVariables: new ChatVariablesCollection([{ id: 'vscode.file', name: 'file', value: fileTsUri }]),
					history: [],
					query: 'edit this file',
				},
				{
					enableCacheBreakpoints: true,
				})).toMatchFileSnapshot(getSnapshotFile('cache_BPs'));
		});

		test('cache BPs with multi tool call rounds', async () => {
			let toolIdx = 0;
			const previousTurn = new Turn('id', { type: 'user', message: 'previous turn' });
			const previousTurnResult: ICopilotChatResultIn = {
				metadata: {
					toolCallRounds: [
						new ToolCallRound('response', [
							createEditFileToolCall(toolIdx++),
							createEditFileToolCall(toolIdx++),
						], undefined, 'toolCallRoundId1'),
						new ToolCallRound('response 2', [
							createEditFileToolCall(toolIdx++),
							createEditFileToolCall(toolIdx++),
						], undefined, 'toolCallRoundId1'),
					],
					toolCallResults: createEditFileToolResult(0, 1, 2, 3),
				}
			};
			previousTurn.setResponse(TurnStatus.Success, { type: 'user', message: 'response' }, 'responseId', previousTurnResult);

			await expect(await agentPromptToString(
				accessor,
				{
					chatVariables: new ChatVariablesCollection([]),
					history: [previousTurn],
					query: 'edit this file',
					toolCallRounds: [
						new ToolCallRound('ok', [
							createEditFileToolCall(toolIdx++),
							createEditFileToolCall(toolIdx++),
						]),
						new ToolCallRound('ok', [
							createEditFileToolCall(toolIdx++),
							createEditFileToolCall(toolIdx++),
						]),
					],
					toolCallResults: createEditFileToolResult(4, 5, 6, 7),
					tools,
				},
				{
					enableCacheBreakpoints: true,
				})).toMatchFileSnapshot(getSnapshotFile('cache_BPs_multi_round'));
		});

		test('custom instructions not in system message', async () => {
			accessor.get(IConfigurationService).setConfig(ConfigKey.CustomInstructionsInSystemMessage, false);
			await expect(await agentPromptToString(accessor, {
				chatVariables: new ChatVariablesCollection(),
				history: [],
				query: 'hello',
				modeInstructions: { name: 'Plan', content: 'custom mode instructions' },
			}, undefined)).toMatchFileSnapshot(getSnapshotFile('custom_instructions_not_in_system_message'));
		});

		test('omit base agent instructions', async () => {
			accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.OmitBaseAgentInstructions, true);
			await expect(await agentPromptToString(accessor, {
				chatVariables: new ChatVariablesCollection(),
				history: [],
				query: 'hello',
			}, undefined)).toMatchFileSnapshot(getSnapshotFile('omit_base_agent_instructions'));
		});

		test('edited file events are grouped by kind', async () => {
			const otherUri = URI.file('/workspace/other.ts');

			await expect((await agentPromptToString(accessor, {
				chatVariables: new ChatVariablesCollection(),
				history: [],
				query: 'hello',
				editedFileEvents: [
					{ eventKind: ChatRequestEditedFileEventKind.Undo, uri: fileTsUri },
					{ eventKind: ChatRequestEditedFileEventKind.UserModification, uri: otherUri },
					// duplicate to ensure deduplication within a group
					{ eventKind: ChatRequestEditedFileEventKind.Undo, uri: fileTsUri },
				],
			}, undefined))).toMatchFileSnapshot(getSnapshotFile('edited_file_events_grouped_by_kind'));
		});
	});
});
