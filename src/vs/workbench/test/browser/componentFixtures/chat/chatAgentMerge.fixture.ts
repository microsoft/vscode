/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { EditorMarkdownCodeBlockRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { AgentMergePromptContext, AgentMergeRepairAction } from '../../../../../platform/agentHost/common/agentMerge.js';
import { buildAgentMergePrompt, IAgentMergePromptSummary, parseAgentMergePrompt } from '../../../../../platform/agentHost/common/agentMergePrompt.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ChatContentMarkdownRenderer } from '../../../../contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { ChatAgentMergeContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatAgentMergeContentPart.js';
import { AgentFeedbackReviewCommandId, IChatAgentFeedbackPullRequestThreadLink } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { renderChatWidget } from './chatWidget.fixture.js';

// ============================================================================
// Sample data
// ============================================================================

const sessionResource = URI.parse('agent-host://session/1');

const reviewThreads: AgentMergePromptContext['reviewThreads'] = [
	{
		id: 'PRRT_kwDOAn8RLM6brOX1',
		path: 'src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatTurnPillsPart.ts',
		line: 68,
		comments: [{
			author: 'copilot-pull-request-reviewer',
			body: 'This long in-constructor narrative obscures a simple retention rule and duplicates the provider-level explanation. Please keep the non-obvious constraint as a single concise comment.',
		}],
	},
	{
		id: 'PRRT_kwDOAn8RLM6brOYV',
		path: 'src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostResponseFileChanges.ts',
		line: 169,
		comments: [{
			author: 'copilot-pull-request-reviewer',
			body: 'This nine-line inline explanation duplicates the class contract and interrupts the selection logic. Condense it to the single non-obvious invariant.',
		}],
	},
	{
		id: 'PRRT_kwDOAn8RLM6brOYe',
		path: 'src/vs/workbench/contrib/chat/test/browser/widget/chatContentParts/chatTurnPillsPart.test.ts',
		line: 59,
		comments: [{
			author: 'copilot-pull-request-reviewer',
			body: 'This multi-line comment narrates the immediately following test step. Keep the scenario note concise so the test remains easy to scan.',
		}],
	},
	{
		id: 'PRRT_kwDOAn8RLM6brOYr',
		path: 'src/vs/workbench/contrib/chat/test/browser/agentHost/agentHostResponseFileChanges.test.ts',
		line: 251,
		comments: [{
			author: 'copilot-pull-request-reviewer',
			body: 'This multi-line comment restates the two state transitions directly below it. A short scenario label is sufficient.',
		}],
	},
];

/** Two `chatWidget.ts` files, so the label disambiguation has to kick in. */
const duplicateNameThreads: AgentMergePromptContext['reviewThreads'] = [
	{
		id: 'PRRT_duplicate_1',
		path: 'src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts',
		line: 412,
		comments: [{ author: 'octocat', body: 'Prefer `IEditorService` over reaching into the group directly.' }],
	},
	{
		id: 'PRRT_duplicate_2',
		path: 'src/vs/sessions/contrib/chat/browser/chatWidget.ts',
		line: 88,
		comments: [{ author: 'octocat', body: 'This copy drifted from the workbench one — extract the shared part.' }],
	},
	{
		id: 'PRRT_duplicate_3',
		path: 'src/vs/workbench/contrib/chat/browser/chatEditor.ts',
		line: 24,
		comments: [{ author: 'hubot', body: 'Unique name, so this one keeps a bare label.' }],
	},
];

const markdownThreads: AgentMergePromptContext['reviewThreads'] = [
	{
		id: 'PRRT_markdown_1',
		path: 'src/vs/platform/agentHost/common/agentMergePrompt.ts',
		line: 141,
		comments: [{
			author: 'copilot-pull-request-reviewer',
			body: [
				'`readSections` scans **backwards**, which is worth calling out:',
				'',
				'- untrusted bodies come first',
				'- a forward scan would let them shift a later field',
				'',
				'```ts',
				'const sections = readSections(stateLines);',
				'```',
				'',
				'See [the parser contract](https://github.com/microsoft/vscode) for the full rules.',
			].join('\n'),
		}],
	},
];

const failedChecks = ['Compile / Compile (ubuntu-latest)', 'Linux Unit Tests (Electron)'];
const fixtureTimestamp = new Date().setHours(15, 33, 0, 0);

function createContext(overrides?: Partial<AgentMergePromptContext>): AgentMergePromptContext {
	return {
		pullRequestUrl: 'https://github.com/microsoft/vscode/pull/332297',
		title: `chat: keep an agent turn's changes summary from flickering`,
		headRef: 'benibenj/agent-turn-changes-no-flicker',
		headSha: '1dd23747a306c10416d6f8a4a6ef032d541b310e',
		baseRef: 'main',
		reviewThreads: [],
		reviewSummaries: [],
		newComments: [],
		failedChecks: [],
		behind: false,
		conflicting: false,
		commentWatermark: '2026-08-24T10:00:00.000Z',
		...overrides,
	};
}

/**
 * Builds the summary the way production does — through the prompt the agent
 * host sends — so the fixtures render exactly what the parser recovers.
 */
function createSummary(actions: readonly AgentMergeRepairAction[], overrides?: Partial<AgentMergePromptContext>): IAgentMergePromptSummary {
	const summary = parseAgentMergePrompt(buildAgentMergePrompt(actions, createContext(overrides)));
	if (!summary) {
		throw new Error('Agent Merge prompt fixture data failed to parse');
	}
	return summary;
}

// ============================================================================
// Render helper
// ============================================================================

interface IRenderAgentMergeOptions {
	readonly summary: IAgentMergePromptSummary;
	/** Expands the widget by clicking its header, the way a user would. */
	readonly expanded?: boolean;
	/** Shows the agent message instead of the merge details. */
	readonly agentMessageVisible?: boolean;
	/** Review thread ids the session mirrored into agent feedback. */
	readonly mirroredThreadIds?: readonly string[];
}

function renderAgentMerge({ container, disposableStore, theme }: ComponentFixtureContext, options: IRenderAgentMergeOptions): void {
	container.style.width = '640px';
	container.style.padding = '8px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';

	// The widget only looks up mirrors where the Agents window registered the
	// feedback commands, so a fixture with mirrors registers them for real; the
	// stub command service below serves the lookup.
	const links: IChatAgentFeedbackPullRequestThreadLink[] = (options.mirroredThreadIds ?? []).map(threadId => ({
		pullRequestThreadId: threadId,
		commentId: `feedback-${threadId}`,
	}));
	if (links.length > 0) {
		disposableStore.add(CommandsRegistry.registerCommand(AgentFeedbackReviewCommandId.GetPullRequestThreadLinks, () => links));
		disposableStore.add(CommandsRegistry.registerCommand(AgentFeedbackReviewCommandId.Reveal, () => { }));
	}

	const commandService = new class extends mock<ICommandService>() {
		override async executeCommand<T>(id: string): Promise<T | undefined> {
			return id === AgentFeedbackReviewCommandId.GetPullRequestThreadLinks ? links as T : undefined;
		}
	}();

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: (reg) => {
			reg.defineInstance(ILabelService, new class extends mock<ILabelService>() {
				override getUriLabel(uri: URI): string { return uri.path; }
			}());
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.defineInstance(ICommandService, commandService);
		},
	});

	// Without a default code block renderer the markdown pipeline emits empty
	// code-block spans, so fenced code in review feedback would render blank.
	(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration('editor', { fontFamily: 'monospace' });
	instantiationService.get(IMarkdownRendererService).setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));

	const markdownRenderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
	const part = disposableStore.add(instantiationService.createInstance(ChatAgentMergeContentPart, options.summary, sessionResource, markdownRenderer, fixtureTimestamp));
	container.appendChild(part.domNode);

	if (options.expanded) {
		part.domNode.querySelector<HTMLElement>('.chat-agent-merge-header-disclosure')?.click();
	}
	if (options.agentMessageVisible) {
		part.domNode.querySelector<HTMLElement>('.chat-agent-merge-message-toggle')?.click();
	}
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	Comments: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderAgentMerge(ctx, {
			summary: createSummary(['addressReviews'], { reviewThreads }),
		}),
	}),

	SingleComment: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderAgentMerge(ctx, {
			summary: createSummary(['addressReviews'], { reviewThreads: reviewThreads.slice(0, 1) }),
		}),
	}),

	FailingChecks: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		render: (ctx) => renderAgentMerge(ctx, {
			summary: createSummary(['fixCI'], { failedChecks }),
		}),
	}),

	CommentsAndFailingChecks: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderAgentMerge(ctx, {
			summary: createSummary(['addressReviews', 'fixCI'], { reviewThreads, failedChecks }),
		}),
	}),

	Conflicting: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderAgentMerge(ctx, {
			summary: createSummary(['resolveConflicts'], { conflicting: true }),
		}),
	}),

	BehindBase: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderAgentMerge(ctx, {
			summary: createSummary(['resolveConflicts'], { behind: true }),
		}),
	}),

	Expanded: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderAgentMerge(ctx, {
			summary: createSummary(['addressReviews', 'fixCI'], { reviewThreads, failedChecks }),
			expanded: true,
		}),
	}),

	ExpandedWithReviewSummary: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderAgentMerge(ctx, {
			summary: createSummary(['addressReviews'], {
				reviewSummaries: [{ author: 'octocat', body: 'Please split the parser out of the renderer before this lands.' }],
				newComments: [{ author: 'hubot', body: 'Rebase needed once #332000 merges.' }],
			}),
			expanded: true,
		}),
	}),

	ExpandedAgentMessage: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderAgentMerge(ctx, {
			summary: createSummary(['addressReviews', 'fixCI'], { reviewThreads: reviewThreads.slice(0, 1), failedChecks }),
			agentMessageVisible: true,
		}),
	}),

	ExpandedDuplicateFileNames: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderAgentMerge(ctx, {
			summary: createSummary(['addressReviews'], { reviewThreads: duplicateNameThreads }),
			expanded: true,
		}),
	}),

	ExpandedMarkdownComment: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderAgentMerge(ctx, {
			summary: createSummary(['addressReviews'], { reviewThreads: markdownThreads }),
			expanded: true,
		}),
	}),

	ExpandedWithLinkedComments: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderAgentMerge(ctx, {
			summary: createSummary(['addressReviews'], { reviewThreads }),
			expanded: true,
			mirroredThreadIds: [reviewThreads[0].id, reviewThreads[2].id],
		}),
	}),

	InChat: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderChatWidget(ctx, {
			width: 720,
			height: 600,
			inputVisible: false,
			messages: [
				{
					user: 'Polish the Agent Merge widget',
					assistant: [{
						kind: 'markdown',
						text: 'I updated the widget to make its status easier to scan and keep secondary controls quiet until they are needed.',
					}],
				},
				{
					user: buildAgentMergePrompt(['addressReviews', 'fixCI'], createContext({
						reviewThreads: reviewThreads.slice(0, 1),
						failedChecks,
					})),
					isSystemInitiated: true,
					timestamp: fixtureTimestamp,
					assistant: [{
						kind: 'markdown',
						text: 'I addressed the review feedback and fixed the failing checks. The branch is ready for another review.',
					}],
				},
			],
		}),
	}),
});
