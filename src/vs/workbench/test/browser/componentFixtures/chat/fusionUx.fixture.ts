/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Copilot Fusion design: how VS Code shows a Fusion turn today, how the GitHub app shows it, and
// the proposed change, drawn with the real chat components and example data. The proposed states
// are set through data; the product code does not produce them yet.

import * as dom from '../../../../../base/browser/dom.js';
import { HoverWidget } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ToolCallConfirmationReason, ToolCallStatus } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { MarkerService } from '../../../../../platform/markers/common/markerService.js';
import { editorBackground, editorForeground } from '../../../../../platform/theme/common/colors/editorColors.js';
import { AgentHostSubagentProgress } from '../../../../contrib/chat/browser/agentSessions/agentHost/agentHostSubagentProgress.js';
import { toolCallStateToInvocation } from '../../../../contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { IChatWidgetService } from '../../../../contrib/chat/browser/chat.js';
import { ChatListItemRenderer, formatResponseTokenStats } from '../../../../contrib/chat/browser/widget/chatListRenderer.js';
import { ChatEditorOptions } from '../../../../contrib/chat/browser/widget/chatOptions.js';
import { IChatProgress, IChatUsageModelTotal } from '../../../../contrib/chat/common/chatService/chatService.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, ChatAgentLocation, ChatConfiguration, ChatModeKind, CollapsedToolsDisplayMode } from '../../../../contrib/chat/common/constants.js';
import { ChatModel } from '../../../../contrib/chat/common/model/chatModel.js';
import { ChatViewModel, isResponseVM } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ChatRequestTextPart } from '../../../../contrib/chat/common/requestParser/chatParserTypes.js';
import { ILanguageModelToolsService } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { ILanguageModelToolsConfirmationService } from '../../../../contrib/chat/common/tools/languageModelToolsConfirmationService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { FixtureMenuService, registerChatFixtureServices, registerSubagentFixtureServices } from './chatFixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';
import '../../../../../platform/hover/browser/hover.css';

// #region Model

type Tag = 'Today' | 'GitHub app' | 'Proposed' | 'Fusion' | 'Not Fusion';

interface IRow {
	/** The row's title, as the host would send it. */
	readonly label: string;
	/** Shown dim after the title; empty hides it. */
	readonly model?: string;
	readonly status: 'running' | 'succeeded' | 'failed' | 'cancelled';
	readonly durationMs?: number;
	/** The running row's activity line. */
	readonly activity?: string;
}

interface INotice {
	readonly text: string;
	readonly icon: ThemeIcon;
}

interface ITurn {
	readonly caption: string;
	/** The live status line while Fusion works, before the answer starts. */
	readonly status?: string;
	readonly rows?: readonly IRow[];
	readonly notices?: readonly INotice[];
	/** A review outcome that stays visible next to the answer when the steps fold. */
	readonly outcome?: string;
	readonly answer?: string;
	/** The footer text; also shows the footer. */
	readonly footer?: string;
	/** Footer hovers to compare side by side under the turn, each drawn open with its label. */
	readonly compare?: readonly { readonly label: string; readonly content: MarkdownString }[];
	/** Leaves the response running, so rows and the status line show live. */
	readonly running?: boolean;
}

interface IVariant {
	readonly tag: Tag;
	readonly title: string;
	readonly note: string;
	readonly turns: readonly ITurn[];
	/** Shows a finished turn's steps instead of folding them, as `chat.agent.collapseCompletedResponses` does by default. */
	readonly expandSteps?: boolean;
}

// #endregion

// #region Rendering

const WIDTH = 460;

const tagColors: Record<Tag, string> = {
	'Today': 'var(--vscode-badge-background)',
	'GitHub app': 'var(--vscode-charts-green)',
	'Proposed': 'var(--vscode-charts-blue)',
	'Fusion': 'var(--vscode-charts-purple)',
	'Not Fusion': 'var(--vscode-badge-background)',
};

function renderCaption(container: HTMLElement, variant: IVariant): void {
	const caption = dom.append(container, dom.$('.fusion-ux-caption'));
	caption.style.cssText = `display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-editorWidget-border));`;
	const head = dom.append(caption, dom.$('div'));
	head.style.cssText = 'display: flex; align-items: center; gap: 8px;';
	const tag = dom.append(head, dom.$('span', undefined, variant.tag));
	tag.style.cssText = `background: ${tagColors[variant.tag]}; color: ${variant.tag === 'Today' || variant.tag === 'Not Fusion' ? 'var(--vscode-badge-foreground)' : '#fff'}; border-radius: 10px; padding: 1px 8px; font-size: 11px; font-weight: 600; white-space: nowrap;`;
	const title = dom.append(head, dom.$('span', undefined, variant.title));
	title.style.cssText = 'font-weight: 600; font-size: 13px;';
	const note = dom.append(caption, dom.$('div', undefined, variant.note));
	note.style.cssText = 'color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.4;';
}

function renderSectionCaption(container: HTMLElement, text: string): HTMLElement {
	const caption = dom.append(container, dom.$('div', undefined, text));
	caption.style.cssText = 'color: var(--vscode-descriptionForeground); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; margin: 14px 0 2px;';
	return caption;
}

async function renderVariant(context: ComponentFixtureContext, variant: IVariant): Promise<void> {
	const { container, disposableStore } = context;
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			registerSubagentFixtureServices(reg);
			reg.define(IMarkerService, MarkerService);
			reg.defineInstance(ILanguageModelToolsConfirmationService, new class extends mock<ILanguageModelToolsConfirmationService>() {
				override getPreConfirmActions() { return []; }
			}());
			reg.defineInstance(IChatWidgetService, new class extends mock<IChatWidgetService>() {
				override getWidgetBySessionResource() { return undefined; }
				override async openSession() { return undefined; }
			}());
		},
	});
	instantiationService.stub(ILanguageModelToolsService, instantiationService.get(ILanguageModelToolsService), 'getTool', () => undefined);
	const commandService = instantiationService.get(ICommandService);
	instantiationService.stub(ICommandService, {
		onWillExecuteCommand: commandService.onWillExecuteCommand,
		onDidExecuteCommand: commandService.onDidExecuteCommand,
		async executeCommand<R>(id: string, ...args: unknown[]): Promise<R | undefined> {
			return id === 'json.validate' ? undefined : commandService.executeCommand<R>(id, ...args);
		},
	});
	const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
	await configurationService.setUserConfiguration('editor', { fontFamily: 'monospace', fontLigatures: false });
	await configurationService.setUserConfiguration('chat', {
		editor: { fontSize: 13, fontFamily: 'default', fontWeight: 'normal', lineHeight: 20, wordWrap: 'off' },
	});
	configurationService.setUserConfiguration(ChatConfiguration.ThinkingGenerateTitles, false);
	configurationService.setUserConfiguration('chat.agent.thinking.collapsedTools', CollapsedToolsDisplayMode.Off);
	configurationService.setUserConfiguration(ChatConfiguration.CheckpointsEnabled, false);
	configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, !variant.expandSteps);

	const openChat = instantiationService.createInstance(MenuItemAction, { id: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, title: 'Open Subagent' }, undefined, { shouldForwardArgs: true }, undefined, undefined);
	instantiationService.stub(IMenuService, instantiationService.get(IMenuService), 'getMenuActions', (id: MenuId): ReturnType<IMenuService['getMenuActions']> =>
		id === MenuId.ChatSubagentContent ? [['navigation', [openChat]]] : []);
	const menuService = instantiationService.get(IMenuService);
	if (menuService instanceof FixtureMenuService) {
		menuService.addItem(MenuId.ChatMessageFooter, { command: { id: 'fixture.fusion.helpful', title: 'Helpful', icon: Codicon.thumbsup }, group: 'navigation', order: 1 });
		menuService.addItem(MenuId.ChatMessageFooter, { command: { id: 'fixture.fusion.unhelpful', title: 'Unhelpful', icon: Codicon.thumbsdown }, group: 'navigation', order: 2 });
		menuService.addItem(MenuId.ChatMessageFooter, { command: { id: 'fixture.fusion.copy', title: 'Copy', icon: Codicon.copy }, group: 'navigation', order: 3 });
		menuService.addItem(MenuId.ChatMessageFooter, { command: { id: 'fixture.fusion.retry', title: 'Retry', icon: Codicon.refresh }, group: 'navigation', order: 4 });
	}

	container.classList.add('monaco-workbench', 'interactive-session');
	container.style.width = variant.turns.some(turn => (turn.compare?.length ?? 0) > 1) ? '680px' : `${WIDTH}px`;
	container.style.padding = '12px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';
	container.style.position = 'relative';
	renderCaption(container, variant);

	for (const [turnIndex, turn] of variant.turns.entries()) {
		renderSectionCaption(container, turn.caption);
		await renderTurn(instantiationService, disposableStore, container, turn, `${turnIndex}`);
		if (turn.compare) {
			const row = dom.append(container, dom.$('div'));
			row.style.cssText = 'display: flex; gap: 12px; align-items: flex-start; margin-top: 12px;';
			for (const { label, content } of turn.compare) {
				const column = dom.append(row, dom.$('div'));
				column.style.cssText = 'flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 6px;';
				renderSectionCaption(column, label).style.margin = '0';
				column.appendChild(createStaticHover(instantiationService, disposableStore, content));
			}
		}
	}
}

/**
 * Draws a footer hover open, in place. A live hover closes as soon as its target scrolls out
 * of view or the page is clicked, which the explorer's folder view does. Uses the hover
 * widget's own DOM, styles and markdown renderer.
 */
function createStaticHover(instantiationService: ReturnType<typeof createEditorServices>, disposableStore: ComponentFixtureContext['disposableStore'], content: MarkdownString): HTMLElement {
	const hover = disposableStore.add(new HoverWidget(false));
	hover.containerDomNode.classList.add('workbench-hover');
	hover.containerDomNode.style.cssText = 'position: static; max-width: 100%;';
	const row = dom.$('div.hover-row.markdown-hover');
	const contents = dom.append(row, dom.$('div.hover-contents'));
	const rendered = disposableStore.add(instantiationService.get(IMarkdownRendererService).render(content));
	contents.appendChild(rendered.element);
	hover.contentsDomNode.appendChild(row);
	hover.onContentsChanged();
	return hover.containerDomNode;
}

async function renderTurn(instantiationService: ReturnType<typeof createEditorServices>, disposableStore: ComponentFixtureContext['disposableStore'], container: HTMLElement, turn: ITurn, id: string): Promise<void> {
	const transcript = dom.append(container, dom.$('.interactive-list'));
	transcript.style.width = `${WIDTH}px`;
	const sessionResource = URI.parse(`agent-host-copilotcli:/fusion-ux-${id}`);
	const model = disposableStore.add(instantiationService.createInstance(ChatModel, undefined, {
		initialLocation: ChatAgentLocation.Chat,
		canUseTools: true,
		resource: sessionResource,
	}));
	const request = model.addRequest({
		text: 'Fix it',
		parts: [new ChatRequestTextPart(new OffsetRange(0, 6), new Range(1, 1, 1, 7), 'Fix it')],
	}, { variables: [] }, 0);
	const viewModel = disposableStore.add(instantiationService.createInstance(ChatViewModel, model, undefined));
	const response = viewModel.getItems().find(isResponseVM);
	if (!response || !request.response) {
		throw new Error('Missing fixture response');
	}
	const editorOptions = disposableStore.add(instantiationService.createInstance(ChatEditorOptions, undefined, editorForeground, editorBackground, editorBackground));
	const renderer = disposableStore.add(instantiationService.createInstance(
		ChatListItemRenderer,
		editorOptions,
		{ noHeader: true, noFooter: false, restorable: false },
		{
			getListLength: () => 1,
			onDidScroll: () => ({ dispose() { } }),
			container: transcript,
			currentChatMode: () => ChatModeKind.Agent,
			isStickyScrollEnabled: () => false,
			refreshStickyScroll: () => { },
			stickyScrollTopPadding: 0,
		},
		undefined,
		viewModel,
	));
	renderer.layout(WIDTH);
	const template = renderer.renderTemplate(transcript);
	disposableStore.add({ dispose: () => renderer.disposeTemplate(template) });
	const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };
	const rerender = () => {
		renderer.disposeElement(node, 0, template);
		renderer.renderElement(node, 0, template);
	};
	const publisher = disposableStore.add(new AgentHostSubagentProgress(parts => {
		for (const part of parts) {
			model.acceptResponseProgress(request, part);
		}
		rerender();
	}));

	const parts: IChatProgress[] = [];
	for (const [index, row] of (turn.rows ?? []).entries()) {
		const durationMs = row.durationMs ?? 4000;
		const base = {
			toolCallId: `fusion:${id}:${index}`, toolName: 'hydrafusion_phase', displayName: row.label, invocationMessage: row.label,
			confirmed: ToolCallConfirmationReason.NotNeeded,
			_meta: {
				toolKind: 'fusionPhase', subagentDescription: row.label, progressMessage: row.activity,
				fusionPhase: { fusionId: id, phaseId: String(index), model: row.model ?? '', status: row.status, startedAt: Date.now() - durationMs, duration: row.status === 'running' ? undefined : durationMs },
			},
		};
		const invocation = toolCallStateToInvocation(row.status === 'running'
			? { ...base, status: ToolCallStatus.Running }
			: { ...base, status: ToolCallStatus.Completed, success: row.status === 'succeeded', pastTenseMessage: row.label, content: [] },
			undefined, sessionResource, 'local');
		parts.push(invocation);
	}
	for (const notice of turn.notices ?? []) {
		parts.push({ kind: 'systemNotification', content: new MarkdownString().appendText(notice.text), icon: notice.icon, collapsible: true });
	}
	if (turn.outcome) {
		parts.push({ kind: 'warning', content: new MarkdownString().appendText(turn.outcome), keepVisibleWhenCollapsed: true });
	}
	if (turn.answer) {
		parts.push({ kind: 'markdownContent', content: new MarkdownString(turn.answer) });
	}
	if (turn.status) {
		parts.push({ kind: 'progressMessage', content: new MarkdownString().appendText(turn.status), shimmer: true });
	}
	publisher.publish(parts);

	if (!turn.running) {
		if (turn.footer) {
			request.response.setResult({ details: turn.footer });
		}
		request.response.complete();
		rerender();
	}
	if (turn.footer) {
		// The footer shows on hover; keep it visible.
		template.rowContainer.classList.add('group-hovered');
	} else {
		template.footerToolbarContainer.style.display = 'none';
	}
}

// #endregion

// #region Example data

const ANSWER = 'The bug is in `formatResponseTokenStats`: it reads the totals before they arrive. I moved the read into the render pass and added a test.';
const OPUS = 'Claude Opus 5.5';
const SOL = 'GPT-6 Sol';
const ARGON = 'Gemini 4 Argon';
const SOL61 = 'GPT-6.1 Sol';

const MINI = 'GPT-5.4 mini';
const COMPLETED_AT = new Date(2026, 10, 19, 12, 4).getTime();

const warn = Codicon.warning;
const stop = Codicon.circleSlash;

// #endregion

// #region 1. Pass rows

interface IRowWords {
	readonly running: IRow;
	readonly changesRequested: readonly IRow[];
	readonly approved: IRow;
	readonly draft: readonly IRow[];
	readonly failed: IRow;
}

function passRows(tag: Tag, title: string, note: string, words: IRowWords): IVariant {
	return {
		tag, title, note, expandSteps: true,
		turns: [
			{ caption: 'While a review runs', rows: [words.running], running: true },
			{ caption: 'Review asked for changes, then a fix', rows: words.changesRequested },
			{ caption: 'Review approved', rows: [words.approved] },
			{ caption: 'Draft, then a review of the draft, then a revision', rows: words.draft },
			{ caption: 'A review fails', rows: [words.failed] },
		],
	};
}

const passRowsToday = passRows('Today', 'Pass names + model',
	'What VS Code shows on main. The main pass (the answer) has no row. The check only means the pass ran: you can\'t see whether the review approved. A running row repeats its name.',
	{
		running: { label: 'Review pass', model: SOL, status: 'running', activity: 'Review pass running' },
		changesRequested: [{ label: 'Review pass', model: SOL, status: 'succeeded' }, { label: 'Fix-up pass', model: OPUS, status: 'succeeded', durationMs: 11_000 }],
		approved: { label: 'Review pass', model: SOL, status: 'succeeded' },
		draft: [{ label: 'Critique pass', model: ARGON, status: 'succeeded', durationMs: 5_000 }, { label: 'Revision pass', model: SOL61, status: 'succeeded', durationMs: 9_000 }],
		failed: { label: 'Review pass', model: SOL, status: 'failed', durationMs: 3_000 },
	});

const passRowsGh = passRows('GitHub app', '"Fusion reviewed with {model}"',
	'The GitHub app\'s wording table, drawn with VS Code\'s row: one sentence per pass, "Fusion" first, the verdict after. (Their wording has no failure case; the red "Failed" badge is VS Code\'s.)',
	{
		running: { label: `Fusion is reviewing with ${SOL}`, status: 'running', activity: `Fusion is reviewing with ${SOL}` },
		changesRequested: [{ label: `Fusion reviewed with ${SOL} · Changes requested`, status: 'succeeded' }, { label: `Fusion applied fixes with ${OPUS}`, status: 'succeeded', durationMs: 11_000 }],
		approved: { label: `Fusion reviewed with ${SOL} · Approved`, status: 'succeeded' },
		draft: [{ label: `Fusion reviewed the draft with ${ARGON}`, status: 'succeeded', durationMs: 5_000 }, { label: `Fusion revised with ${SOL61}`, status: 'succeeded', durationMs: 9_000 }],
		failed: { label: `Fusion review with ${SOL}`, status: 'failed', durationMs: 3_000 },
	});

const passRowsProposed = passRows('Proposed', '"Reviewed with {model}"',
	'The GitHub app\'s sentences without "Fusion": the row already sits inside a Copilot Fusion answer. The verdict follows the sentence. The running row says what it is doing instead of repeating its name.',
	{
		running: { label: `Reviewing with ${SOL}`, status: 'running', activity: 'Using a tool' },
		changesRequested: [{ label: `Reviewed with ${SOL} · Changes requested`, status: 'succeeded' }, { label: `Applied fixes with ${OPUS}`, status: 'succeeded', durationMs: 11_000 }],
		approved: { label: `Reviewed with ${SOL} · Approved`, status: 'succeeded' },
		draft: [{ label: `Reviewed the draft with ${ARGON}`, status: 'succeeded', durationMs: 5_000 }, { label: `Revised with ${SOL61}`, status: 'succeeded', durationMs: 9_000 }],
		failed: { label: `Review with ${SOL}`, status: 'failed', durationMs: 3_000 },
	});

// #endregion

// #region 2. Status line

interface IStatusWords {
	readonly live: readonly (readonly [caption: string, text: string])[];
	readonly problems: readonly INotice[];
}

function statusLine(tag: Tag, title: string, note: string, words: IStatusWords): IVariant {
	return {
		tag, title, note,
		turns: [
			...words.live.map(([caption, status]): ITurn => ({ caption, status, running: true })),
			...(words.problems.length ? [{ caption: 'When something goes wrong', notices: words.problems }] : []),
		],
	};
}

const statusToday = statusLine('Today', 'Workflow jargon',
	'What VS Code shows on main while Fusion works, before the answer starts. "Cascade" is the internal pattern name; "Main pass" is the internal pass name. The last warning shows a raw model id.',
	{
		live: [['Getting started', 'Preparing the Cascade workflow...'], ['Writing the answer', 'Main pass running'], ['Using a tool', 'Main pass: running a tool'], ['Between passes', 'Continuing the Copilot Fusion workflow...']],
		problems: [{ text: 'Copilot Fusion workflow interrupted', icon: stop }, { text: 'Copilot Fusion workflow completed with a fallback', icon: warn }, { text: 'Copilot Fusion routing failed; continuing with gpt-6-sol', icon: warn }],
	});

const statusGh = statusLine('GitHub app', '"Fusion is responding with {model}"',
	'The GitHub app\'s running wording for the main and follow-up passes. Its table doesn\'t cover starting, tools or problems.',
	{
		live: [['Writing the answer', `Fusion is responding with ${OPUS}`], ['Follow-up pass', `Fusion is continuing with ${OPUS}`]],
		problems: [],
	});

const statusProposed = statusLine('Proposed', '"Responding with {model}…"',
	'Plain verbs that say which model is working, without internal workflow names. Warnings say what happened to the answer. Needs readable model names from the host.',
	{
		live: [['Getting started', 'Copilot Fusion is choosing models…'], ['Writing the answer', `Responding with ${OPUS}…`], ['Using a tool', `${OPUS} is using a tool…`], ['Between passes', `Handing off to ${SOL} for review…`]],
		problems: [{ text: `Copilot Fusion stopped while ${SOL} was reviewing`, icon: stop }, { text: `Review by ${SOL} failed; kept the answer from ${OPUS}`, icon: warn }, { text: `Copilot Fusion couldn't start, so ${OPUS} answered`, icon: warn }],
	});

// #endregion


// #region 3 and 4. Footer, hover and edge cases

/** What a model did in a Copilot Fusion turn, and what it cost. */
interface IModelRole {
	readonly roles: readonly string[];
	readonly credits: number;
}
type Roles = Readonly<Record<string, IModelRole>>;

/** "Answer", "Answer and fix", "Answer, review and fix". */
function joinRoles(roles: readonly string[]): string {
	const text = roles.length > 1 ? `${roles.slice(0, -1).join(', ')} and ${roles.at(-1)}` : roles[0];
	return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/** Today's real hover, with each model line relabeled as "Role: model · N credits". */
function pickedHover(totals: readonly IChatUsageModelTotal[], roles: Roles): MarkdownString {
	let value = formatResponseTokenStats(totals, COMPLETED_AT)!.markdown.value;
	for (const { model } of totals) {
		const role = roles[model];
		if (role) {
			const credits = role.credits === 1 ? '1 credit' : `${role.credits.toFixed(1)} credits`;
			value = value.replace(escapeMarkdownSyntaxTokens(`Model: ${model}`), escapeMarkdownSyntaxTokens(`${joinRoles(role.roles)}: ${model} · ${credits}`));
		}
	}
	return new MarkdownString(value);
}

interface IHoverCase {
	readonly tag: Tag;
	readonly title: string;
	readonly note: string;
	readonly turn: Omit<ITurn, 'caption' | 'compare' | 'footer'>;
	readonly footerToday: string;
	/** The proposed footer; unchanged from today when omitted. */
	readonly footerPicked?: string;
	readonly totals: readonly IChatUsageModelTotal[];
	/** Roles for the proposed hover; unchanged from today when omitted. */
	readonly roles?: Roles;
}

function hoverCase(c: IHoverCase): IVariant {
	const changed = !!c.roles || !!c.footerPicked;
	return {
		tag: c.tag, title: c.title, note: c.note,
		turns: [{
			caption: changed ? `Footer today: ${c.footerToday}` : 'The answer and its footer (unchanged)',
			...c.turn,
			answer: ANSWER,
			footer: c.footerPicked ?? c.footerToday,
			compare: [
				{ label: 'Hover today', content: formatResponseTokenStats(c.totals, COMPLETED_AT)!.markdown },
				{ label: changed ? 'Hover proposed' : 'Hover proposed (same as today)', content: c.roles ? pickedHover(c.totals, c.roles) : formatResponseTokenStats(c.totals, COMPLETED_AT)!.markdown },
			],
		}],
	};
}

// Edge cases show the proposed transcript, so their rows use the proposed wording.
const approvedRow: IRow = { label: `Reviewed with ${SOL} · Approved`, status: 'succeeded' };
const changesRow: IRow = { label: `Reviewed with ${SOL} · Changes requested`, status: 'succeeded' };

const answerReviewTotals: IChatUsageModelTotal[] = [
	{ model: OPUS, inputTokens: 182_000, cachedTokens: 151_000, outputTokens: 4_200 },
	{ model: SOL, inputTokens: 41_000, cachedTokens: 0, outputTokens: 312 },
];
const answerReviewRoles: Roles = { [OPUS]: { roles: ['Answer'], credits: 29.1 }, [SOL]: { roles: ['Review'], credits: 0.3 } };

function footerAndHover(tag: Tag, title: string, note: string, row: IRow, several: string, hover: MarkdownString, one: string): IVariant {
	return {
		tag, title, note,
		turns: [
			{ caption: 'Two models worked on it', rows: [row], answer: ANSWER, footer: several, compare: [{ label: 'Hover on the footer text', content: hover }] },
			{ caption: 'Only one model ran', answer: ANSWER, footer: one },
		],
	};
}

const footerToday = footerAndHover('Today', 'Fusion level + credits; tokens per model',
	'What VS Code shows on main: the Fusion level you picked (Standard, High, Max) and the turn\'s credits. The hover lists tokens per model, but not what each model did or what it cost.',
	{ label: 'Review pass', model: SOL, status: 'succeeded' }, 'Copilot Fusion Max • 29.4 credits', formatResponseTokenStats(answerReviewTotals, COMPLETED_AT)!.markdown,
	'Copilot Fusion Max • 3.1 credits');

const footerGh = footerAndHover('GitHub app', '"Multiple models"; role and credits per model',
	'The GitHub app\'s footer and (i) hover, drawn with VS Code\'s components. "AIC" is its credits unit.',
	{ label: `Fusion reviewed with ${SOL} · Approved`, status: 'succeeded' }, 'Copilot Fusion · Multiple models', new MarkdownString([
		'| | |', '|---|---|',
		`| Answer | ${OPUS} · 29.1 AIC |`,
		`| Review | ${SOL} · 0.3 AIC |`,
		'| Total time | 15s |',
		'| AI credits | 29.4 |',
		'| Context | 1% cached |',
	].join('\n')),
	`Copilot Fusion · ${OPUS}`);

const footerProposed = footerAndHover('Proposed', 'Model count; role and credits per model',
	'Keeps the level and the credits, and counts the models that ran a Copilot Fusion pass (only when 2 or more). The hover keeps today\'s details and puts each model\'s role and credits first.',
	approvedRow, 'Copilot Fusion Max • 2 models • 29.4 credits', pickedHover(answerReviewTotals, answerReviewRoles),
	'Copilot Fusion Max • 3.1 credits');

const hoverFusionSameModelTwice = hoverCase({
	tag: 'Fusion', title: 'Copilot Fusion: one model did two jobs',
	note: 'Claude Opus 5.5 answered, GPT-6 Sol asked for changes, and Claude Opus 5.5 applied them. Tokens are counted per model, so Claude Opus 5.5 gets one line naming both jobs, with both jobs\' credits.',
	turn: { rows: [changesRow, { label: `Applied fixes with ${OPUS}`, status: 'succeeded', durationMs: 11_000 }] },
	footerToday: 'Copilot Fusion Max • 34.2 credits', footerPicked: 'Copilot Fusion Max • 2 models • 34.2 credits',
	totals: [
		{ model: OPUS, inputTokens: 278_000, cachedTokens: 230_000, outputTokens: 6_300 },
		{ model: SOL, inputTokens: 41_000, cachedTokens: 0, outputTokens: 312 },
	],
	roles: { [OPUS]: { roles: ['Answer', 'Fix'], credits: 33.9 }, [SOL]: { roles: ['Review'], credits: 0.3 } },
});

const hoverFusionWithHelpers = hoverCase({
	tag: 'Fusion', title: 'Copilot Fusion with a subagent and a summary',
	note: 'Edge case: the answer started a subagent on GPT-6.1 Sol, and older messages were summarized on GPT-5.4 mini. Those lines are labeled too, but the footer still counts only the 2 models that ran a Fusion pass.',
	turn: { rows: [approvedRow] },
	footerToday: 'Copilot Fusion Max • 31.0 credits', footerPicked: 'Copilot Fusion Max • 2 models • 31.0 credits',
	totals: [
		{ model: OPUS, inputTokens: 182_000, cachedTokens: 151_000, outputTokens: 4_200 },
		{ model: SOL, inputTokens: 41_000, cachedTokens: 0, outputTokens: 312 },
		{ model: SOL61, inputTokens: 52_000, cachedTokens: 0, outputTokens: 1_800 },
		{ model: MINI, inputTokens: 120_000, cachedTokens: 0, outputTokens: 3_100 },
	],
	roles: {
		[OPUS]: { roles: ['Answer'], credits: 29.1 }, [SOL]: { roles: ['Review'], credits: 0.3 },
		[SOL61]: { roles: ['Subagent'], credits: 1.2 }, [MINI]: { roles: ['Summary'], credits: 0.4 },
	},
});

const hoverFusionCritique = hoverCase({
	tag: 'Fusion', title: 'Copilot Fusion: draft, review, revision',
	note: 'Edge case: in this workflow the final text comes from the revision, not the first model. So the first model is the "Draft", not the "Answer".',
	turn: { rows: [{ label: `Reviewed the draft with ${ARGON}`, status: 'succeeded', durationMs: 5_000 }, { label: `Revised with ${SOL61}`, status: 'succeeded', durationMs: 9_000 }] },
	footerToday: 'Copilot Fusion Max • 18.5 credits', footerPicked: 'Copilot Fusion Max • 3 models • 18.5 credits',
	totals: [
		{ model: OPUS, inputTokens: 96_000, cachedTokens: 80_000, outputTokens: 2_400 },
		{ model: ARGON, inputTokens: 38_000, cachedTokens: 0, outputTokens: 600 },
		{ model: SOL61, inputTokens: 101_000, cachedTokens: 60_000, outputTokens: 2_900 },
	],
	roles: { [OPUS]: { roles: ['Draft'], credits: 12.0 }, [ARGON]: { roles: ['Draft review'], credits: 0.4 }, [SOL61]: { roles: ['Revision'], credits: 6.1 } },
});

const hoverFusionReviewFailed = hoverCase({
	tag: 'Fusion', title: 'Copilot Fusion: the review failed',
	note: 'Edge case: today a failed review folds into "Completed N steps", so the turn looks like a clean success. Proposed: a warning stays visible next to the answer.',
	turn: { rows: [{ label: `Review with ${SOL}`, status: 'failed', durationMs: 3_000 }], outcome: `Not reviewed: ${SOL}'s review failed` },
	footerToday: 'Copilot Fusion Max • 29.2 credits', footerPicked: 'Copilot Fusion Max • 2 models • 29.2 credits',
	totals: [
		{ model: OPUS, inputTokens: 182_000, cachedTokens: 151_000, outputTokens: 4_200 },
		{ model: SOL, inputTokens: 12_000, cachedTokens: 0, outputTokens: 0 },
	],
	roles: { [OPUS]: { roles: ['Answer'], credits: 29.1 }, [SOL]: { roles: ['Review (failed)'], credits: 0.1 } },
});

const hoverFusionChangesNotApplied = hoverCase({
	tag: 'Fusion', title: 'Copilot Fusion: changes requested, not applied',
	note: 'Edge case: the review asked for changes but no fix ran (for example, the turn was stopped). Proposed: say so next to the answer instead of hiding it in the steps.',
	turn: { rows: [changesRow], outcome: `${SOL} asked for changes that were not applied` },
	footerToday: 'Copilot Fusion Max • 29.4 credits', footerPicked: 'Copilot Fusion Max • 2 models • 29.4 credits',
	totals: [
		{ model: OPUS, inputTokens: 182_000, cachedTokens: 151_000, outputTokens: 4_200 },
		{ model: SOL, inputTokens: 41_000, cachedTokens: 0, outputTokens: 312 },
	],
	roles: { [OPUS]: { roles: ['Answer'], credits: 29.1 }, [SOL]: { roles: ['Review'], credits: 0.3 } },
});

const hoverFusionOneModel = hoverCase({
	tag: 'Fusion', title: 'Copilot Fusion: only one model ran',
	note: 'Copilot Fusion Standard sent the whole turn to one model. Nothing to tell apart, so footer and hover stay as today.',
	turn: {},
	footerToday: 'Copilot Fusion Standard • 0.4 credits',
	totals: [{ model: MINI, inputTokens: 36_000, cachedTokens: 30_000, outputTokens: 900 }],
});

const hoverNotFusionOneModel = hoverCase({
	tag: 'Not Fusion', title: 'Normal chat: one model',
	note: 'Most chats. Roles only appear on Copilot Fusion turns, so nothing changes.',
	turn: {},
	footerToday: 'Claude Opus 5.5 • 2.1 credits',
	totals: [{ model: OPUS, inputTokens: 48_000, cachedTokens: 40_000, outputTokens: 1_100 }],
});

const hoverNotFusionSeveralModels = hoverCase({
	tag: 'Not Fusion', title: 'Normal chat: several models',
	note: 'Claude Opus 5.5 ran the chat, a subagent ran on GPT-6.1 Sol, and older messages were summarized on GPT-5.4 mini. Not Copilot Fusion, so nothing changes.',
	turn: {},
	footerToday: 'Claude Opus 5.5 • 6.4 credits',
	totals: [
		{ model: OPUS, inputTokens: 96_000, cachedTokens: 80_000, outputTokens: 2_400 },
		{ model: SOL61, inputTokens: 52_000, cachedTokens: 0, outputTokens: 1_800 },
		{ model: MINI, inputTokens: 120_000, cachedTokens: 0, outputTokens: 3_100 },
	],
});

// #endregion

// #region 0. Start here

function renderStartHere({ container }: ComponentFixtureContext): void {
	container.style.cssText = 'width: 760px; padding: 16px; font-size: 13px; line-height: 1.45; background: var(--vscode-editor-background); color: var(--vscode-foreground);';
	const h = dom.append(container, dom.$('div', undefined, 'Copilot Fusion: the GitHub app\'s 4 changes, and VS Code today'));
	h.style.cssText = 'font-weight: 600; font-size: 15px; margin-bottom: 10px;';
	const rows: [string, string, string, string, string][] = [
		['GitHub app change', 'GitHub app before', 'GitHub app now', 'VS Code today', 'See'],
		['1. Who did what', 'Footer named only the last model', 'Hover: "Answer: Claude Opus 5.5, Review: GPT-6 Sol"; footer "Copilot Fusion · Multiple models"', 'Review/Fix rows name their model, but the answer has no row. Footer "Copilot Fusion Max • 29.4 credits"; its hover lists only tokens per model. Partly there.', '3 Footer and hover, 4 Edge cases'],
		['2. Credits per model', 'Only the total', '"29.1 AIC" per model, plus the total', 'Only the total. Missing.', '3 Footer and hover'],
		['3. "Switched to X…" only in Standard', 'Shown in High and Max too', 'Only in Standard', 'Already only in Standard. Nothing to do.', '—'],
		['4. No jargon', '"Main pass", "Review pass"', '"Fusion responded with {model}", "Fusion reviewed with {model}"', '"Review pass", "Fix-up pass", and "Preparing the Cascade workflow..." while it works. Missing.', '1 Pass rows, 2 Status line'],
	];
	const table = dom.append(container, dom.$('table'));
	table.style.cssText = 'border-collapse: collapse; width: 100%;';
	for (const [index, cells] of rows.entries()) {
		const tr = dom.append(table, dom.$('tr'));
		for (const cell of cells) {
			const td = dom.append(tr, dom.$(index === 0 ? 'th' : 'td', undefined, cell));
			td.style.cssText = `text-align: left; vertical-align: top; padding: 6px 8px; border: 1px solid var(--vscode-editorWidget-border); ${index === 0 ? 'background: var(--vscode-editorWidget-background);' : ''}`;
		}
	}
	const how = dom.append(container, dom.$('div', undefined, 'Each folder is one part of the screen. In each, "Today" is what VS Code shows now, "GitHub app" is what the GitHub app does, drawn with VS Code\'s components, and "Proposed" is the change. Model names, times and credits are examples.'));
	how.style.cssText = 'margin-top: 12px; color: var(--vscode-descriptionForeground);';
}

// #endregion

const fixture = (variant: IVariant) => defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderVariant(context, variant) });

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	'0_StartHere': defineComponentFixture({ render: renderStartHere }),
	'1_PassRows': defineThemedFixtureGroup({
		'1_Today': fixture(passRowsToday),
		'2_GitHubApp': fixture(passRowsGh),
		'3_Proposed': fixture(passRowsProposed),
	}),
	'2_StatusLine': defineThemedFixtureGroup({
		'1_Today': fixture(statusToday),
		'2_GitHubApp': fixture(statusGh),
		'3_Proposed': fixture(statusProposed),
	}),
	'3_FooterAndHover': defineThemedFixtureGroup({
		'1_Today': fixture(footerToday),
		'2_GitHubApp': fixture(footerGh),
		'3_Proposed': fixture(footerProposed),
	}),
	'4_EdgeCases': defineThemedFixtureGroup({
		'1_OneModelTwoJobs': fixture(hoverFusionSameModelTwice),
		'2_WithSubagentAndSummary': fixture(hoverFusionWithHelpers),
		'3_DraftReviewRevision': fixture(hoverFusionCritique),
		'4_ReviewFailed': fixture(hoverFusionReviewFailed),
		'5_ChangesNotApplied': fixture(hoverFusionChangesNotApplied),
		'6_FusionOneModel': fixture(hoverFusionOneModel),
		'7_NormalChatOneModel': fixture(hoverNotFusionOneModel),
		'8_NormalChatSeveralModels': fixture(hoverNotFusionSeveralModels),
	}),
});
