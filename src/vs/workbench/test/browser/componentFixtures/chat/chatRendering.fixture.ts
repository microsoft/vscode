/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ChatProgressAnimation, ChatProgressVerbosity } from '../../../../contrib/chat/common/constants.js';
import { ChatToolInvocation } from '../../../../contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ToolConfirmKind } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { getToolInvocationSummaryFromInput } from '../../../../contrib/chat/common/tools/toolInvocationSummary.js';
import { ILanguageModelToolsConfirmationService } from '../../../../contrib/chat/common/tools/languageModelToolsConfirmationService.js';
import { MockLanguageModelToolsConfirmationService } from '../../../../contrib/chat/test/common/tools/mockLanguageModelToolsConfirmationService.js';
import { MockLanguageModelToolsService } from '../../../../contrib/chat/test/common/tools/mockLanguageModelToolsService.js';
import { MockChatEditingSession } from '../../../../contrib/chat/test/common/mockChatEditingSession.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup, waitForFixtureCondition } from '../fixtureUtils.js';
import { IChatWidgetFixtureHandle, IFixtureMessage, renderChatWidget } from './chatWidget.fixture.js';
import { TestFileService } from '../../../common/workbenchTestServices.js';
import { ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, type ICompletedToolCall } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { completedToolCallToSerialized } from '../../../../contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.js';

const messages: readonly IFixtureMessage[] = [{
	user: 'Check the chat rendering',
	assistant: [
		{
			kind: 'tool', toolId: 'search', displayName: 'Search',
			invocationMessage: 'Searched for **Manifestation preview before editing the shared collection** and `a_very_long_search_term_without_any_breaks_that_must_fit_inside_the_chat_panel`',
			complete: true,
			resultDetails: { input: '{}', output: [{ type: 'embed', value: 'Found the renderer', isText: true }] },
		},
		{ kind: 'markdown', text: 'The response must remain below the complete search title.' },
		{ kind: 'tool', toolId: 'read_file', displayName: 'Read file', invocationMessage: 'Read [renderer.ts](file:///workspace/renderer.ts?vscodeLinkType=file)', complete: true },
		{ kind: 'externalEdit', uri: URI.file('/workspace/renderer.ts'), editKind: 'edit', diff: { added: 14, removed: 3 } },
		...['first', 'second'].map(id => ({
			kind: 'questionCarousel' as const,
			questions: [{
				id, type: 'singleSelect' as const, title: 'Continue with the rendering changes?',
				options: [{ id: 'yes', label: 'Confirm (Recommended)', value: 'yes' }],
			}],
			data: { [id]: { selectedValue: 'yes' } },
			isUsed: true,
			answerPresentation: 'conversation' as const,
		})),
	],
}];

function renderSubagentProgress(context: ComponentFixtureContext, toolId: string, label: string, options: { confirmation?: boolean; inline?: boolean; progress?: ChatProgressAnimation } = {}): Promise<void> {
	return renderChatWidget(context, {
		additionalServices: reg => {
			reg.defineInstance(IFileService, context.disposableStore.add(new TestFileService()));
			reg.defineInstance(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
			reg.defineInstance(ILanguageModelToolsService, context.disposableStore.add(new MockLanguageModelToolsService()));
		},
		width: 620, height: options.inline ? 600 : 300, listHeight: options.inline ? 600 : 300, inputVisible: false,
		persistentProgress: options.progress ?? ChatProgressAnimation.Draw,
		messages: [{
			user: 'Review the rendering changes',
			assistant: [{ kind: 'subagent', id: 'rendering-agent', description: 'Check chat rendering' }],
			responseComplete: false,
		}],
		onRendered: ({ model }) => {
			const request = model.getRequests()[0];
			if (options.inline) {
				const parent = request.response?.response.value.find(part => part.kind === 'toolInvocation' && part.toolCallId === 'rendering-agent');
				if (!(parent instanceof ChatToolInvocation) || parent.toolSpecificData?.kind !== 'subagent') {
					throw new Error('Missing fixture subagent');
				}
				parent.toolSpecificData.chatResource = undefined;
				parent.toolSpecificData.isChatAvailable = false;
				parent.notifyToolSpecificDataChanged();
				model.acceptResponseProgress(request, {
					kind: 'toolInvocationSerialized', toolId: 'custom_tool', toolCallId: 'inspect', subAgentInvocationId: parent.toolCallId,
					invocationMessage: 'Inspect the component output', pastTenseMessage: 'Inspected the component output',
					isComplete: true, isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded }, source: ToolDataSource.Internal,
					presentation: undefined, originMessage: undefined,
				});
			}
			const tool = new ChatToolInvocation({
				invocationMessage: new MarkdownString(label),
				icon: Codicon.tools,
				confirmationMessages: options.confirmation ? { title: 'Run in terminal?', message: 'Run the rendering tests.' } : undefined,
			}, { id: toolId, displayName: toolId, modelDescription: toolId, source: ToolDataSource.Internal }, 'rendering-tool', 'rendering-agent', {});
			model.acceptResponseProgress(request, tool);
		},
	});
}

function renderTranscript(context: ComponentFixtureContext, width: number, progress: ChatProgressAnimation): Promise<void> {
	return renderChatWidget(context, {
		messages, width, height: 900, listHeight: 900, inputVisible: false,
		additionalServices: reg => reg.defineInstance(IFileService, context.disposableStore.add(new TestFileService())),
		persistentProgress: progress,
		persistentProgressVerbosity: ChatProgressVerbosity.Verbose,
		collapseCompletedResponses: false,
	});
}

async function renderWrappedToolSummary(context: ComponentFixtureContext): Promise<void> {
	const title = 'Finished with 2 steps';
	await renderChatWidget(context, {
		width: 170, height: 360, listHeight: 360, inputVisible: false,
		persistentProgress: ChatProgressAnimation.Draw,
		persistentProgressVerbosity: ChatProgressVerbosity.Compact,
		collapseCompletedResponses: false,
		messages: [{
			user: 'Check the endpoint',
			responseComplete: false,
			assistant: ['order_header_update', 'invoice_print_address'].map(pattern => ({
				kind: 'tool', toolId: 'search', displayName: 'Search',
				invocationMessage: `Searched for ${pattern}`, complete: true,
			})),
		}],
		onRendered: ({ model }) => {
			const request = model.getRequests()[0];
			model.acceptResponseProgress(request, {
				kind: 'thinking', id: 'reasoning',
				value: '**Confirmed order_header_update endpoint accepted invoice_print_address**\nThe endpoint accepts the updated address.',
			});
			model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('The update is ready.') });
			request.response?.complete();
		},
	});
	await waitForFixtureCondition(() => {
		const chain = context.container.querySelector('.chat-tool-chain-preview.chat-used-context-collapsed');
		return chain?.querySelector('.monaco-button-mdlabel')?.textContent === title
			&& !!context.container.querySelector('.chat-persistent-reasoning')
			&& chain.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished');
	}, 'Wrapped tool summary did not finish collapsing');
}

async function renderAgentHostToolOutcomes(context: ComponentFixtureContext, scenario: 'commands' | 'failedCommands' | 'mixedFailures' | 'rawShell' | 'manyTools', width = 500, expanded = false): Promise<void> {
	const mixed = scenario === 'mixedFailures';
	const rawShell = scenario === 'rawShell';
	const completed = (toolCallId: string, toolName: string, success: boolean, toolInput?: string): ICompletedToolCall => ({
		status: ToolCallStatus.Completed, toolCallId, toolName, success, toolInput, confirmed: ToolCallConfirmationReason.NotNeeded,
		displayName: toolName, invocationMessage: toolName, pastTenseMessage: toolName,
		_meta: { 'vscode.toolInputContract': 'copilot-cli-v1' },
	});
	const calls: ICompletedToolCall[] = scenario === 'manyTools' ? [
		...['first', 'second', 'third'].map(id => completed(id, 'grep', true, '{"pattern":"layout"}')),
		completed('read', 'view', true, '{"path":"/workspace/File.ts","view_range":[1,100]}'),
		completed('glob', 'glob', true, '{"pattern":"*.ts"}'),
		completed('edit', 'edit', true, '{"path":"/workspace/File.ts"}'),
		completed('command-first', 'bash', true, '{"command":"pwd","mode":"sync"}'),
		completed('list', 'list_dir', true, '{"path":"/workspace/src"}'),
		completed('diagnostics', 'get_errors', true, '{"filePaths":["/workspace/First.ts","/workspace/Second.ts"]}'),
		completed('command-second', 'bash', true, '{"command":"git --version","mode":"sync"}'),
		completed('failed', 'grep', false, '{"pattern":"summary"}'),
	] : mixed ? [
		completed('rename-first', 'rename_chat', false),
		completed('search', 'grep', false, '{"pattern":"chatListRenderer"}'),
		completed('search-tools', 'tool_search', true),
		{ status: ToolCallStatus.Cancelled, toolCallId: 'find-files', toolName: 'glob', displayName: 'Find files', invocationMessage: 'Find files', reason: ToolCallCancellationReason.Skipped },
		completed('rename-last', 'rename_chat', false),
	] : ['pwd', 'git --version', 'node --version'].map((command, index) => ({
		...completed(`command-${index}`, rawShell ? 'shell' : 'bash', scenario === 'commands' || index === 0, rawShell ? command : JSON.stringify({ command, mode: 'sync' })),
		...(rawShell ? {
			_meta: { toolKind: 'terminal' },
			content: index === 0 ? [{ type: ToolResultContentType.Text, text: '/workspace/project\r\n' }] : [],
		} : {}),
	}));
	const expected = scenario === 'manyTools' ? 'Edited File.ts, ran 2 commands, read File.ts, 7 other steps (1 failed)'
		: mixed ? '3 tool calls failed, 1 tool call skipped, 1 other step'
			: scenario === 'commands' ? 'Ran 3 commands' : 'Ran 1 command, 2 tool calls failed';
	await renderChatWidget(context, {
		width, height: 300, listHeight: 300, inputVisible: false,
		persistentProgress: ChatProgressAnimation.Draw,
		persistentProgressVerbosity: ChatProgressVerbosity.Compact,
		realTerminalOutput: rawShell,
		simpleTerminalCollapsible: rawShell,
		terminalToolsInThinking: rawShell,
		collapseCompletedResponses: false, thinkingPhrases: ['Working'],
		messages: [{ user: scenario === 'manyTools' ? 'Review the implementation' : mixed ? 'Read the first 500 lines of chatListRenderer.ts' : 'Run the three commands in order', responseComplete: false, assistant: [] }],
		onRendered: ({ model }) => {
			const request = model.getRequests()[0];
			for (const call of calls) {
				model.acceptResponseProgress(request, completedToolCallToSerialized(call, undefined, model.sessionResource, 'local'));
			}
			model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(scenario === 'commands' ? 'The three commands completed.' : 'Some tool calls failed. Expand the summary to inspect them.') });
			request.response?.complete();
		},
	});
	await waitForFixtureCondition(() =>
		context.container.querySelector('.chat-tool-chain-collapsible > .chat-used-context-label .monaco-button-mdlabel')?.textContent === expected,
		'Agent Host outcome summary did not render');
	if (expanded) {
		context.container.querySelector<HTMLElement>('.chat-tool-chain-collapsible > .chat-used-context-label .monaco-button')!.click();
		if (rawShell) {
			await waitForFixtureCondition(() => !!context.container.querySelector('.chat-terminal-thinking-collapsible .monaco-button'), 'Native terminal row did not render');
			context.container.querySelector<HTMLElement>('.chat-terminal-thinking-collapsible .monaco-button')!.click();
			await waitForFixtureCondition(() => !!context.container.querySelector('.chat-terminal-output-container.expanded .xterm-screen'), 'Native terminal output did not expand');
		}
		await waitForFixtureCondition(() => {
			const animating = context.container.getAnimations({ subtree: true }).some(animation =>
				(animation.playState === 'running' || animation.pending) && animation.effect?.getComputedTiming().endTime !== Infinity);
			const scrollbarWillHide = !context.container.matches(':hover') && context.container.querySelector('.scrollbar.visible');
			return !animating && !scrollbarWillHide;
		}, 'Expanded group layout did not settle');
	}
}

async function renderDeterministicToolSummaries(context: ComponentFixtureContext, width: number): Promise<void> {
	let handle: IChatWidgetFixtureHandle | undefined;
	await renderChatWidget(context, {
		width, height: 680, listHeight: 680, inputVisible: false,
		persistentProgress: ChatProgressAnimation.Draw,
		persistentProgressVerbosity: ChatProgressVerbosity.Compact,
		collapseCompletedResponses: false,
		thinkingPhrases: ['Working'],
		messages: [{ user: 'Inspect and update the implementation', responseComplete: false, assistant: [] }],
		onRendered: value => handle = value,
	});
	if (!handle) {
		throw new Error('Tool summary fixture did not initialize');
	}
	const { model, listWidget } = handle;
	const request = model.getRequests()[0];
	const groups = [
		{
			title: 'Searched for 4 phrases',
			message: 'Found the progress rendering paths.',
			tools: ['progress', 'rendering', 'layout', 'summary'].map(query => ({ id: 'grep_search', input: { query } })),
		},
		{
			title: 'Ran 3 commands',
			message: 'Build, tests, and lint passed.',
			tools: ['build', 'test', 'lint'].map(command => ({ id: 'bash', input: { command } })),
		},
		{
			title: 'Read summary.ts',
			message: 'Headers are finalized after tool completion.',
			tools: [[1, 60], [40, 100]].map(([startLine, endLine]) => ({
				id: 'view', input: { path: '/workspace/summary.ts', view_range: [startLine, endLine] },
			})),
		},
		{
			title: 'Listed 1 directory, checked 2 paths for problems',
			message: 'No problems found.',
			tools: [
				{ id: 'list_dir', input: { path: '/workspace/src' } },
				{ id: 'get_errors', input: { filePaths: ['/workspace/first.ts', '/workspace/second.ts'] } },
			],
		},
	];
	for (const [groupIndex, group] of groups.entries()) {
		for (const [toolIndex, input] of group.tools.entries()) {
			const tool = new ChatToolInvocation(
				{ invocationMessage: input.id },
				{ id: input.id, displayName: input.id, modelDescription: input.id, source: ToolDataSource.Internal },
				`tool-${groupIndex}-${toolIndex}`, undefined, input.input,
			);
			tool.summary = getToolInvocationSummaryFromInput(input.id, input.input);
			await tool.didExecuteTool({ content: [] });
			model.acceptResponseProgress(request, tool);
		}
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(group.message) });
	}
	const editGroups = [
		{ title: 'Edited 5 files', files: Array.from({ length: 5 }, (_, index) => `/workspace/file${index}.ts`), diff: { added: 2, removed: 1 }, message: 'Updated the implementation.' },
		{ title: 'Edited added.ts', files: ['/workspace/added.ts'], diff: { added: 10, removed: 0 }, message: 'Added regression coverage.' },
		{ title: 'Edited removed.ts', files: ['/workspace/removed.ts'], diff: { added: 0, removed: 3 }, message: 'Removed the old workaround.' },
	];
	for (const [index, group] of editGroups.entries()) {
		for (const file of group.files) {
			model.acceptResponseProgress(request, { kind: 'externalEdit', uri: URI.file(file), editKind: 'edit', diff: group.diff, undoStopId: `edit-${index}` });
		}
		if (group.files.length === 1) {
			model.acceptResponseProgress(request, { kind: 'externalEdit', uri: URI.file(group.files[0]), editKind: 'edit', undoStopId: `followup-edit-${index}` });
		}
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(group.message) });
	}
	request.response?.complete();
	const expected = [...groups, ...editGroups].map(group => group.title);
	await waitForFixtureCondition(() => {
		const titles = [...context.container.querySelectorAll('.chat-tool-chain-collapsible > .chat-used-context-label .monaco-button-mdlabel')].map(label => label.textContent);
		const scrollbarWillHide = !listWidget.domNode.matches(':hover') && listWidget.domNode.querySelector('.scrollbar.visible');
		const animating = context.container.getAnimations({ subtree: true }).some(animation =>
			(animation.playState === 'running' || animation.pending) && animation.effect?.getComputedTiming().endTime !== Infinity);
		return titles.length === expected.length && titles.every((title, index) => title === expected[index]) && !scrollbarWillHide && !animating;
	}, 'Deterministic tool summaries did not settle');
}

function renderReadPills(context: ComponentFixtureContext, complete: boolean): Promise<void> {
	const resource = URI.file('/workspace/chatListRenderer.ts');
	const diff = {
		originalURI: URI.file('/snapshots/chatListRenderer.ts'), modifiedURI: resource,
		added: 14, removed: 3, identical: false, quitEarly: false, isFinal: true, isBusy: false,
	};
	return renderChatWidget(context, {
		width: 380, height: 440, listHeight: 440, inputVisible: false,
		additionalServices: reg => reg.defineInstance(IFileService, context.disposableStore.add(new TestFileService())),
		persistentProgress: ChatProgressAnimation.Draw,
		persistentProgressVerbosity: ChatProgressVerbosity.Verbose,
		thinkingPhrases: ['Working'],
		collapseCompletedResponses: false,
		editingSession: complete ? new MockChatEditingSession([diff], { synchronousDiffs: true }) : undefined,
		messages: [{
			user: 'Review the renderer',
			responseComplete: complete,
			assistant: [
				...Array.from({ length: 4 }, (_, index) => ({
					kind: 'tool' as const, toolId: 'read_file', displayName: 'Read file', streaming: !complete, complete,
					invocationMessage: complete
						? `Read [chatListRenderer.ts](file:///workspace/chatListRenderer.ts?vscodeLinkType=file), lines ${10 * index + 1} to ${10 * (index + 1)}`
						: 'Reading file',
				})),
				...(complete ? [
					{ kind: 'markdown' as const, text: '```typescript\n<vscode_codeblock_uri isEdit>file:///workspace/chatListRenderer.ts</vscode_codeblock_uri>\nexport const edited = true;\n```' },
					{ kind: 'externalEdit' as const, uri: URI.file('/workspace/renderer.ts'), editKind: 'edit' as const, diff },
				] : []),
			],
		}],
	});
}

function renderCompletedSummary(context: ComponentFixtureContext, width: number, withEdits = false): Promise<void> {
	return renderChatWidget(context, {
		width, height: 220, listHeight: 220, inputVisible: false,
		persistentProgress: ChatProgressAnimation.Draw,
		persistentProgressVerbosity: ChatProgressVerbosity.Verbose,
		collapseCompletedResponses: true,
		messages: [{
			user: 'Review the changes',
			responseComplete: false,
			assistant: [
				...Array.from({ length: 4 }, () => ({
					kind: 'tool' as const, toolId: 'read_file', displayName: 'Read file', complete: true, invocationMessage: 'Read the renderer',
				})),
				...(withEdits ? [{ kind: 'externalEdit' as const, uri: URI.file('/workspace/renderer.ts'), editKind: 'edit' as const, diff: { added: 14, removed: 3 } }] : []),
				{ kind: 'markdown', text: 'The task is complete. The final response remains below the completed steps.' },
			],
		}],
		onRendered: ({ model, listWidget }) => {
			const response = model.getRequests()[0].response;
			response?.setElapsedMs(48_000);
			response?.complete();
			listWidget.refresh();
		},
	});
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	ReadPillsStreaming: defineComponentFixture({
		render: context => renderReadPills(context, false),
	}),
	ReadAndEditPillsCompleted: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderReadPills(context, true),
	}),
	CompletedSummary: defineComponentFixture({
		render: context => renderCompletedSummary(context, 900),
	}),
	CompletedSummaryNarrow: defineComponentFixture({
		render: context => renderCompletedSummary(context, 180),
	}),
	CompletedSummaryWithEdits: defineComponentFixture({
		render: context => renderCompletedSummary(context, 320, true),
	}),
	Narrow: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderTranscript(context, 280, ChatProgressAnimation.Draw),
	}),
	WrappedToolSummary: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		virtualTime: { enabled: false },
		deferPaint: true,
		render: renderWrappedToolSummary,
	}),
	DeterministicToolSummaries: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		virtualTime: { enabled: false },
		deferPaint: true,
		render: context => renderDeterministicToolSummaries(context, 500),
	}),
	DeterministicToolSummariesNarrow: defineComponentFixture({
		virtualTime: { enabled: false },
		deferPaint: true,
		render: context => renderDeterministicToolSummaries(context, 280),
	}),
	SuccessfulCommands: defineComponentFixture({
		virtualTime: { enabled: false },
		deferPaint: true,
		render: context => renderAgentHostToolOutcomes(context, 'commands'),
	}),
	FailedCommands: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		virtualTime: { enabled: false },
		deferPaint: true,
		render: context => renderAgentHostToolOutcomes(context, 'failedCommands'),
	}),
	NativeShellOutput: defineComponentFixture({
		virtualTime: { enabled: false },
		deferPaint: true,
		render: context => renderAgentHostToolOutcomes(context, 'rawShell'),
	}),
	NativeShellOutputExpanded: defineComponentFixture({
		virtualTime: { enabled: false },
		deferPaint: true,
		render: context => renderAgentHostToolOutcomes(context, 'rawShell', 500, true),
	}),
	NativeShellOutputExpandedNarrow: defineComponentFixture({
		virtualTime: { enabled: false },
		deferPaint: true,
		render: context => renderAgentHostToolOutcomes(context, 'rawShell', 280, true),
	}),
	CappedToolGroups: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		virtualTime: { enabled: false },
		deferPaint: true,
		render: context => renderAgentHostToolOutcomes(context, 'manyTools'),
	}),
	CappedToolGroupsNarrow: defineComponentFixture({
		virtualTime: { enabled: false },
		deferPaint: true,
		render: context => renderAgentHostToolOutcomes(context, 'manyTools', 280),
	}),
	CappedToolGroupsExpanded: defineComponentFixture({
		virtualTime: { enabled: false },
		deferPaint: true,
		render: context => renderAgentHostToolOutcomes(context, 'manyTools', 500, true),
	}),
	MixedToolFailures: defineComponentFixture({
		virtualTime: { enabled: false },
		deferPaint: true,
		render: context => renderAgentHostToolOutcomes(context, 'mixedFailures'),
	}),
	MixedToolFailuresNarrow: defineComponentFixture({
		virtualTime: { enabled: false },
		deferPaint: true,
		render: context => renderAgentHostToolOutcomes(context, 'mixedFailures', 280),
	}),
	Wide: defineComponentFixture({
		render: context => renderTranscript(context, 720, ChatProgressAnimation.Draw),
	}),
	LegacyNarrow: defineComponentFixture({
		render: context => renderTranscript(context, 280, ChatProgressAnimation.Off),
	}),
	SubagentRead: defineComponentFixture({
		render: context => renderSubagentProgress(context, 'view', 'Read [renderer.ts](file:///workspace/renderer.ts?vscodeLinkType=file), lines 1200 to 1270'),
	}),
	SubagentTerminal: defineComponentFixture({
		render: context => renderSubagentProgress(context, 'bash', 'Run the rendering tests'),
	}),
	SubagentSearch: defineComponentFixture({
		render: context => renderSubagentProgress(context, 'rg', 'Find fixture references'),
	}),
	SubagentGeneric: defineComponentFixture({
		render: context => renderSubagentProgress(context, 'custom_tool', 'Inspect the component output'),
	}),
	SubagentConfirmation: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderSubagentProgress(context, 'bash', 'Run the rendering tests', { confirmation: true }),
	}),
	InlineSubagentConfirmation: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderSubagentProgress(context, 'bash', 'Run the rendering tests', { confirmation: true, inline: true }),
	}),
	LegacyInlineSubagentConfirmation: defineComponentFixture({
		render: context => renderSubagentProgress(context, 'bash', 'Run the rendering tests', { confirmation: true, inline: true, progress: ChatProgressAnimation.Off }),
	}),
});
