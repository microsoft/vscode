/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { $, AnimationFrameScheduler, DisposableResizeObserver } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { rcut } from '../../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { HiddenItemStrategy, WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID } from '../../../common/constants.js';
import { getSubagentIsActive, IChatHookPart, IChatToolInvocation, IChatToolInvocationSerialized, isLegacyChatTerminalToolInvocationData, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { IChatRendererContent, isResponseVM } from '../../../common/model/chatViewModel.js';
import { IRunSubagentToolInputParams } from '../../../common/tools/builtinTools/runSubagentTool.js';
import { ChatTreeItem } from '../../chat.js';
import { ChatCollapsibleMarkdownContentPart } from './chatCollapsibleMarkdownContentPart.js';
import { EditorPool } from './chatContentCodePools.js';
import { IChatContentPart, IChatContentPartDiffData, IChatContentPartDiffSource, IChatContentPartRenderContext } from './chatContentParts.js';
import { aggregateChatEditDiffs } from './chatEditStatsButton.js';
import { CollapsibleListPool } from './chatReferencesContentPart.js';
import { buildPhrasePool } from './chatThinkingContentPart.js';
import { ChatThinkingStyleContentPart, createThinkingIcon } from './chatThinkingStyleContentPart.js';
import { ChatToolInvocationPart } from './toolInvocationParts/chatToolInvocationPart.js';
import { getToolInvocationIcon } from './toolInvocationParts/chatToolPartUtilities.js';
import { FusionPhasePillActionViewItem, type ISubagentPhaseContext } from './fusionPhasePillActionViewItem.js';
import { IInlineSubagentDetailsContext, OpenSubagentChatActionViewItem } from './chatSubagentOpenChat.js';
import './media/chatSubagentContent.css';

const MAX_TITLE_LENGTH = 100;
const GENERIC_SUBAGENT_TYPES: ReadonlySet<string> = new Set(['default', 'general-purpose', 'task']);

const subagentWorkingMessages = [
	localize('chat.subagent.working.1', 'Processing'),
	localize('chat.subagent.working.2', 'Preparing'),
	localize('chat.subagent.working.3', 'Loading'),
	localize('chat.subagent.working.4', 'Analyzing'),
	localize('chat.subagent.working.5', 'Evaluating'),
];

/**
 * Represents a lazy tool item that will be created when the subagent section is expanded.
 */
interface ILazyToolItem {
	kind: 'tool';
	lazy: Lazy<ChatToolInvocationPart>;
	toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized;
	codeBlockStartIndex: number;
}

/**
 * Represents a lazy edit item that will be rendered when expanded.
 */
interface ILazyEditItem {
	kind: 'edit';
	lazy: Lazy<{ domNode: HTMLElement; disposable?: IDisposable }>;
	/** Identifies the part so a re-rendered replacement can retire this item. */
	partId?: string;
	/**
	 * True when the caller passed an eagerDisposable that has already been registered on this
	 * subagent part. In that case, materializeLazyItem must not register the factory's returned
	 * disposable again.
	 */
	eagerlyRegistered?: boolean;
}

/**
 * Represents a lazy hook item (blocked/warning) that will be rendered when expanded.
 */
interface ILazyHookItem {
	kind: 'hook';
	lazy: Lazy<{ domNode: HTMLElement; disposable?: IDisposable }>;
	hookPart: IChatHookPart;
}

type ILazyItem = ILazyToolItem | ILazyEditItem | ILazyHookItem;

/** Renders a subagent pill with inline details when the harness does not provide a child chat. */
export class ChatSubagentContentPart extends ChatThinkingStyleContentPart implements IChatContentPart {
	protected override get collapsibleKind(): string {
		return 'subagent';
	}

	protected override createCollapseButton(container: HTMLElement): undefined {
		this.headerContainer = container;
		return undefined;
	}

	protected override expansionDidChange(): void {
		this._updateOpenChatToolbarContext();
	}

	private wrapper!: HTMLElement;
	private headerContainer!: HTMLElement;
	private isActive: boolean;
	private isExternallyActive: boolean;
	private hasToolItems: boolean = false;
	private readonly isInitiallyComplete: boolean;
	private promptContainer: HTMLElement | undefined;
	private resultContainer: HTMLElement | undefined;
	private readonly layoutScheduler: AnimationFrameScheduler;
	private description: string;
	private agentDisplayName: string | undefined;
	private agentName: string | undefined;
	private prompt: string | undefined;

	// Lazy rendering support
	private readonly lazyItems: ILazyItem[] = [];
	private hasExpandedOnce: boolean = false;
	private pendingPromptRender: boolean = false;
	private pendingResultText: string | undefined;

	// Edits made by the subagent's own markdown items, so response-level totals can include them.
	private readonly diffDataByPartId = new Map<string, IChatContentPartDiffData>();
	private readonly diffSubscriptions = this._register(new DisposableMap<string>());
	private readonly renderedEditItems = new Map<string, HTMLElement>();
	private readonly _diffData = observableValue<IChatContentPartDiffData>(this, { added: 0, removed: 0, resources: [] });
	readonly diffData: IObservable<IChatContentPartDiffData> = this._diffData;

	// Current tool message for collapsed title (persists even after tool completes)
	private currentRunningToolMessage: string | undefined;
	private currentRunningToolCallId: string | undefined;
	private currentRunningToolIcon: ThemeIcon | undefined;
	private readonly activeToolPresentations = new Map<string, { label: string; icon: ThemeIcon }>();
	private mostRecentToolPresentation: { callId: string; label: string; icon: ThemeIcon } | undefined;
	private subagentActivity: 'markdown' | 'reasoning' | undefined;

	// Model name used by this subagent for hover tooltip
	private modelName: string | undefined;
	// Copilot credits (AIC) consumed by this subagent, shown in the hover tooltip
	private credits: number | undefined;
	private _isDefaultDescription: boolean;
	private readonly detailsId = `chat-subagent-details-${generateUuid()}`;
	private readonly toggleDetails = () => this.toggleExpanded();

	// The subagent tool invocation, kept so the "Open Subagent" action can re-read
	// the subagent chat resource as it arrives/changes.
	private readonly _subagentToolInvocation: IChatToolInvocation | IChatToolInvocationSerialized;
	private _openChatToolbar: WorkbenchToolBar | undefined;
	private readonly _openChatActionViewRegistration = this._register(new MutableDisposable());

	// Confirmation auto-expand tracking
	private toolsWaitingForConfirmation: number = 0;
	private userManuallyExpanded: boolean = false;
	private autoExpandedForConfirmation: boolean = false;

	// Carousel confirmation placeholder
	private _navigateToCarousel: ((subAgentInvocationId: string) => void) | undefined;
	private _addToolToCarousel: ((tool: IChatToolInvocation) => void) | undefined;
	private _shouldUseCarouselForTool: ((tool: IChatToolInvocation, state: IChatToolInvocation.State) => boolean) | undefined;
	private _confirmationPlaceholder: HTMLElement | undefined;
	private _confirmationPlaceholderLabel: HTMLElement | undefined;
	private readonly _confirmationPlaceholderDisposable = this._register(new MutableDisposable());
	private readonly _activeConfirmationTracker = this._register(new MutableDisposable());
	private _useCarouselForConfirmations: boolean = false;
	private toolsWaitingForCarouselConfirmation: number = 0;
	private _confirmationActive = false;

	/** Per-tool-invocation autoruns observing tool state; each is disposed once its tool reaches a terminal state so listeners don't accumulate for the widget's lifetime. */
	private readonly _toolStateTracking = this._register(new DisposableStore());
	private _toolPresentationBatchDepth = 0;
	private _toolPresentationDirty = false;

	// Working spinner elements for expanded state
	private workingSpinnerElement: HTMLElement | undefined;
	private availableMessages: string[] | undefined;

	/**
	 * Check if a tool invocation is the parent subagent tool (the tool that spawns a subagent).
	 * A parent subagent tool has subagent toolSpecificData but no subAgentInvocationId.
	 */
	private static isParentSubagentTool(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): boolean {
		return toolInvocation.toolSpecificData?.kind === 'subagent' && !toolInvocation.subAgentInvocationId;
	}

	/**
	 * Extracts subagent metadata from a tool invocation.
	 */
	private static extractSubagentInfo(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): { description: string; isDefaultDescription: boolean; agentDisplayName: string | undefined; agentName: string | undefined; prompt: string | undefined; modelName: string | undefined; credits: number | undefined } {
		const defaultDescription = localize('chat.subagent.defaultDescription', 'Running subagent');

		// Only parent subagent tools contain the full subagent info
		if (!ChatSubagentContentPart.isParentSubagentTool(toolInvocation)) {
			return { description: defaultDescription, isDefaultDescription: true, agentDisplayName: undefined, agentName: undefined, prompt: undefined, modelName: undefined, credits: undefined };
		}

		// Check toolSpecificData first (works for both live and serialized)
		if (toolInvocation.toolSpecificData?.kind === 'subagent') {
			const hasDescription = !!toolInvocation.toolSpecificData.description;
			return {
				description: toolInvocation.toolSpecificData.description ?? defaultDescription,
				isDefaultDescription: !hasDescription,
				agentDisplayName: toolInvocation.toolSpecificData.agentDisplayName,
				agentName: toolInvocation.toolSpecificData.agentName,
				prompt: toolInvocation.toolSpecificData.prompt,
				modelName: toolInvocation.toolSpecificData.modelName,
				credits: toolInvocation.toolSpecificData.credits,
			};
		}

		// Fallback to parameters for live invocations
		if (toolInvocation.kind === 'toolInvocation') {
			const state = toolInvocation.state.get();
			const params = state.type !== IChatToolInvocation.StateKind.Streaming ?
				state.parameters as IRunSubagentToolInputParams | undefined
				: undefined;
			const hasDescription = !!params?.description;
			return {
				description: params?.description ?? defaultDescription,
				isDefaultDescription: !hasDescription,
				agentDisplayName: undefined,
				agentName: params?.agentName,
				prompt: params?.prompt,
				modelName: undefined,
				credits: undefined,
			};
		}

		return { description: defaultDescription, isDefaultDescription: true, agentDisplayName: undefined, agentName: undefined, prompt: undefined, modelName: undefined, credits: undefined };
	}

	/** The subagent's own chat resource (URI string), when it runs as a distinct chat. */
	private _getChatResource(): string | undefined {
		const data = this._subagentToolInvocation.toolSpecificData;
		return data?.kind === 'subagent' ? data.chatResource : undefined;
	}

	private _isPhasePresentation(): boolean {
		const data = this._subagentToolInvocation.toolSpecificData;
		return data?.kind === 'subagent' && data.presentation === 'phase';
	}

	/**
	 * Hosts the compact subagent pill: real subagents use their chat menu action,
	 * while phase summaries have no navigation target. A subagent's chat resource
	 * can arrive later, so the tool-completion autorun also updates this presentation.
	 */
	private _updateOpenChatLink(): void {
		const resource = this._getChatResource();
		this.domNode.classList.toggle('chat-subagent-has-chat', !!resource);
		this._ensureOpenChatToolbar();
		this._updateOpenChatToolbarContext();
	}

	private _ensureOpenChatToolbar(): void {
		if (this._openChatToolbar) {
			return;
		}
		const isPhase = this._isPhasePresentation();
		const menuAction = this._getOpenChatMenuAction() ?? this._register(new Action(
			CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID,
			localize('chat.subagent.openChat', "Open Subagent"),
			undefined,
			false,
			context => this.commandService.executeCommand(CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, context),
		));
		const actionViewItemProvider = this.actionViewItemService.lookUp(MenuId.ChatSubagentContent, CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID);
		if (!isPhase && !actionViewItemProvider) {
			this._openChatActionViewRegistration.value = Event.once(Event.filter(
				this.actionViewItemService.onDidChange,
				menuId => menuId === MenuId.ChatSubagentContent
			))(() => {
				this._openChatActionViewRegistration.clear();
				this._openChatToolbar?.setActions([menuAction]);
				this._updateOpenChatToolbarContext();
			});
		}

		const container = $('.chat-subagent-open-chat-toolbar');
		this.headerContainer.appendChild(container);
		this._openChatToolbar = this._register(this.instantiationService.createInstance(WorkbenchToolBar, container, {
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			actionViewItemProvider: (action, options) => isPhase
				? this.instantiationService.createInstance(FusionPhasePillActionViewItem, undefined, action, { ...options, showElapsedOnly: true }, false)
				: this.actionViewItemService.lookUp(MenuId.ChatSubagentContent, CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID)?.(action, options, this.instantiationService, dom.getWindow(container).vscodeWindowId)
				?? this.instantiationService.createInstance(OpenSubagentChatActionViewItem, undefined, action, options, !this.environmentService.isSessionsWindow),
		}));
		this._openChatToolbar.setActions([menuAction]);
		this._updateOpenChatOnlyMode();
	}

	private _getOpenChatMenuAction(): MenuItemAction | undefined {
		for (const [, actions] of this.menuService.getMenuActions(MenuId.ChatSubagentContent, this.contextKeyService, { shouldForwardArgs: true })) {
			const action = actions.find(action => action.id === CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID);
			if (action instanceof MenuItemAction) {
				return action;
			}
		}
		return undefined;
	}

	private _updateOpenChatOnlyMode(): void {
		const openChatOnly = !!this._getChatResource() || this._isPhasePresentation();
		this.domNode.classList.toggle('chat-subagent-open-chat-only', openChatOnly);
		if (openChatOnly) {
			this.setExpanded(false);
		}
	}

	private _updateOpenChatToolbarContext(): void {
		const chatResource = this._getChatResource();
		if (this._openChatToolbar) {
			const data = this._subagentToolInvocation.toolSpecificData;
			const response = isResponseVM(this.context.element) ? this.context.element : undefined;
			const selectedModel = response?.session?.model.inputModel.state.get()?.selectedModel;
			const parentModelId = response?.model.request?.modelId ?? selectedModel?.identifier;
			const parentModelName = selectedModel?.metadata.name;
			const resolvedModel = response?.model.result?.metadata?.resolvedModel;
			const parentResolvedModelId = typeof resolvedModel === 'string' ? resolvedModel : selectedModel?.metadata.id;
			const activeTool = Array.from(this.activeToolPresentations.entries()).at(-1);
			const displayedTool = this.currentRunningToolMessage && !this.currentRunningToolCallId
				? { callId: undefined, label: this.currentRunningToolMessage, icon: this.currentRunningToolIcon }
				: activeTool
					? { callId: activeTool[0], ...activeTool[1] }
					: this.subagentActivity !== 'markdown'
						? this.mostRecentToolPresentation
						: undefined;
			const agentType = this.getAgentTypeLabel();
			const commonContext = {
				parentSessionResource: this.context.element.sessionResource.toString(),
				title: this.description,
				...(agentType ? { agentType } : {}),
				confirmationCount: this.toolsWaitingForConfirmation,
				confirmationActive: this._confirmationActive,
				startedAt: data?.kind === 'subagent' ? data.startedAt : undefined,
				duration: data?.kind === 'subagent' ? data.duration : undefined,
				isActive: this.isActive,
				...(this.credits ? { credits: this.credits } : {}),
				...(data?.kind === 'subagent' && data.modelId ? { modelId: data.modelId } : {}),
				...(this.modelName ? { modelName: this.modelName } : {}),
				...(parentModelId ? { parentModelId } : {}),
				...(parentModelName ? { parentModelName } : {}),
				...(parentResolvedModelId ? { parentResolvedModelId } : {}),
				...(this.isActive && displayedTool ? { activeToolCallId: displayedTool.callId, activeToolLabel: displayedTool.label, activeToolIcon: displayedTool.icon } : {}),
			};
			if (data?.kind === 'subagent' && data.presentation === 'phase') {
				this._openChatToolbar.context = {
					...commonContext,
					presentation: 'phase',
					phaseStatus: data.phaseStatus,
					activityLabel: data.activityDescription ? new MarkdownString().appendText(data.activityDescription).value : undefined,
					...(chatResource ? { chatResource, isChatAvailable: data.isChatAvailable } : {}),
				} satisfies ISubagentPhaseContext;
			} else if (chatResource) {
				this._openChatToolbar.context = { ...commonContext, chatResource, isChatAvailable: data?.kind === 'subagent' ? data.isChatAvailable : undefined };
			} else {
				this._openChatToolbar.context = {
					...commonContext,
					presentation: 'inline',
					expanded: this.isExpanded(),
					contentId: this.detailsId,
					toggleDetails: this.toggleDetails,
				} satisfies IInlineSubagentDetailsContext;
			}
			this._updateOpenChatOnlyMode();
		}
	}

	private _shouldKeepCollapsedForCarouselConfirmation(): boolean {
		return !!this._getChatResource();
	}

	private getAgentTypeLabel(): string | undefined {
		const agentName = this.agentName?.trim();
		if (!agentName) {
			return undefined;
		}
		const normalizedAgentName = agentName.toLowerCase();
		if (GENERIC_SUBAGENT_TYPES.has(normalizedAgentName) || normalizedAgentName === this._subagentToolInvocation.toolId.toLowerCase()) {
			return undefined;
		}
		return this.agentDisplayName?.trim() || agentName;
	}

	constructor(
		public readonly subAgentInvocationId: string,
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly context: IChatContentPartRenderContext,
		private readonly chatContentMarkdownRenderer: IMarkdownRenderer,
		private readonly listPool: CollapsibleListPool,
		private readonly editorPool: EditorPool,
		private readonly currentWidthDelegate: () => number,
		private readonly announcedToolProgressKeys: Set<string>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHoverService hoverService: IHoverService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IActionViewItemService private readonly actionViewItemService: IActionViewItemService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		// Extract subagent metadata from the tool invocation
		const { description, isDefaultDescription, agentDisplayName, agentName, prompt, modelName, credits } = ChatSubagentContentPart.extractSubagentInfo(toolInvocation);

		super(description, context, undefined, hoverService, configurationService, telemetryService);

		this.description = rcut(description, MAX_TITLE_LENGTH);
		this._isDefaultDescription = isDefaultDescription;
		this.agentDisplayName = agentDisplayName;
		this.agentName = agentName;
		this.prompt = prompt;
		this.modelName = modelName;
		this.credits = credits;
		this.isInitiallyComplete = IChatToolInvocation.isComplete(toolInvocation);
		this.isExternallyActive = toolInvocation.toolSpecificData?.kind === 'subagent' && getSubagentIsActive(toolInvocation.toolSpecificData) === true;
		this.isActive = toolInvocation.toolSpecificData?.kind === 'subagent'
			? getSubagentIsActive(toolInvocation.toolSpecificData) ?? !this.isInitiallyComplete
			: !this.isInitiallyComplete;
		this.subagentActivity = toolInvocation.toolSpecificData?.kind === 'subagent' ? toolInvocation.toolSpecificData.activity : undefined;
		this._subagentToolInvocation = toolInvocation;
		if (isResponseVM(context.element)) {
			const response = context.element;
			const finalizeOnTerminal = () => {
				if (!response.isComplete && !response.isCanceled) {
					return;
				}
				if (this.isActive) {
					this.markAsInactive(true);
				}
				// A child that outlived its parent takes over the progress signal the footer owned.
				if (this.isActive && this.wrapper && !this.hasToolsWaitingForConfirmation) {
					this.showWorkingSpinner();
				}
			};
			finalizeOnTerminal();
			if (!response.isComplete && !response.isCanceled) {
				this._register(Event.once(Event.filter(response.model.onDidChange, () => response.isComplete || response.isCanceled))(finalizeOnTerminal));
			}
		}

		const node = this.domNode;
		node.classList.add('chat-thinking-fixed-mode', 'chat-subagent-part');
		const animationContainer = this.contentAnimationContainer;
		if (animationContainer) {
			animationContainer.id = this.detailsId;
		}

		this._updateOpenChatLink();

		this.setThinkingActive(this.isActive);

		// Materialize lazy items when first expanded
		this._register(autorun(r => {
			if (this._isExpanded.read(r) && !this.hasExpandedOnce) {
				this.hasExpandedOnce = true;
				this.materializePendingContent();
			}
		}));

		this.setExpanded(false);

		// Track user manual expansion
		// If the user expands (not via auto-expand for confirmation), mark it as manual
		// Only clear autoExpandedForConfirmation when user collapses, so re-expand is detected as manual
		this._register(autorun(r => {
			const expanded = this._isExpanded.read(r);
			if (expanded) {
				if (!this.autoExpandedForConfirmation) {
					this.userManuallyExpanded = true;
				}
			} else {
				// User collapsed - reset flags so next confirmation cycle can auto-collapse again
				if (this.autoExpandedForConfirmation) {
					this.autoExpandedForConfirmation = false;
				}
				// Reset manual expansion flag when user collapses, so future confirmation cycles can auto-collapse
				if (this.userManuallyExpanded) {
					this.userManuallyExpanded = false;
				}
			}
		}));

		// Scheduler for coalescing layout operations
		this.layoutScheduler = this._register(new AnimationFrameScheduler(this.domNode, () => this.performLayout()));

		// Render the prompt section at the start if available (must be after wrapper is initialized)
		this.renderPromptSection();

		// Watch for completion and render result
		this.watchToolCompletion(toolInvocation);
	}

	private getRandomWorkingMessage(): string {
		if (!this.availableMessages || this.availableMessages.length === 0) {
			this.availableMessages = buildPhrasePool(subagentWorkingMessages, this.configurationService);
		}
		const index = Math.floor(Math.random() * this.availableMessages.length);
		return this.availableMessages.splice(index, 1)[0];
	}

	private createWorkingSpinner(): void {
		if (this.workingSpinnerElement || !this.wrapper) {
			return;
		}
		this.workingSpinnerElement = this.createThinkingSpinnerRow(this.getRandomWorkingMessage()).row;
		this.wrapper.appendChild(this.workingSpinnerElement);
	}

	private removeWorkingSpinner(): void {
		if (this.workingSpinnerElement) {
			this.workingSpinnerElement.remove();
			this.workingSpinnerElement = undefined;
		}
	}

	private showWorkingSpinner(): void {
		// While the response is in progress the persistent footer owns the only progress signal;
		// afterwards a still-running child shows its own row again.
		if (this.context.suppressProgressShimmer && !this.context.element.isComplete) {
			this.removeWorkingSpinner();
			return;
		}
		if (this.workingSpinnerElement) {
			this.workingSpinnerElement.style.display = '';
		} else {
			this.createWorkingSpinner();
		}
	}

	protected override initContent(): HTMLElement {
		this.wrapper = this.createThinkingBody();

		// Hide initially until there are tool calls
		if (!this.hasToolItems) {
			this.wrapper.style.display = 'none';
		}

		// Materialize any deferred content now that wrapper exists
		// This handles the case where the subclass autorun ran before this base class autorun
		this.materializePendingContent();
		// A background child's launch call completes immediately, so an explicitly active child
		// still shows its working row when it is first expanded.
		if (this.isActive && (!this.isInitiallyComplete || this.isExternallyActive) && !this.hasToolsWaitingForConfirmation) {
			this.showWorkingSpinner();
		}

		// Use ResizeObserver to trigger layout when wrapper content changes
		const resizeObserver = this._register(new DisposableResizeObserver('ChatSubagentContentPart.layout', () => this.layoutScheduler.schedule()));
		this._register(resizeObserver.observe(this.wrapper));

		return this.wrapper;
	}

	/**
	 * Renders the prompt as a collapsible section at the start of the content.
	 * If the wrapper doesn't exist yet (lazy init) or subagent is initially complete,
	 * this is deferred until expanded.
	 */
	private renderPromptSection(): void {
		if (!this.prompt || this.promptContainer) {
			return;
		}

		// Defer rendering when wrapper doesn't exist yet (lazy init) or for old completed subagents until expanded
		if (!this.wrapper || (this.isInitiallyComplete && !this.isExpanded() && !this.hasExpandedOnce)) {
			this.pendingPromptRender = true;
			return;
		}

		this.pendingPromptRender = false;
		this.doRenderPromptSection();
	}

	private doRenderPromptSection(): void {
		if (!this.prompt || this.promptContainer) {
			return;
		}

		// Split into first line and rest
		const lines = this.prompt.split('\n');
		const rawFirstLine = lines[0] || localize('chat.subagent.prompt', 'Prompt');
		const restOfLines = lines.slice(1).join('\n').trim();

		// Limit first line length, moving overflow to content
		const titleContent = rcut(rawFirstLine, MAX_TITLE_LENGTH);
		const wasTruncated = rawFirstLine.length > MAX_TITLE_LENGTH;
		const title = wasTruncated ? titleContent + '…' : titleContent;
		const titleRemainder = rawFirstLine.length > titleContent.length ? rawFirstLine.slice(titleContent.length).trim() : '';
		const content = titleRemainder
			? (titleRemainder + (restOfLines ? '\n' + restOfLines : ''))
			: (restOfLines || this.prompt);

		// Create collapsible prompt part
		const collapsiblePart = this._register(this.instantiationService.createInstance(
			ChatCollapsibleMarkdownContentPart,
			title,
			content,
			this.context,
			this.chatContentMarkdownRenderer
		));

		// Wrap in a container for chain of thought line styling
		this.promptContainer = $('.chat-thinking-tool-wrapper.chat-subagent-section');
		const promptIcon = createThinkingIcon(Codicon.comment);
		this.promptContainer.appendChild(promptIcon);
		this.promptContainer.appendChild(collapsiblePart.domNode);

		// Insert at the beginning of the wrapper
		// With lazy rendering, wrapper may not be created yet if content hasn't been expanded
		if (this.wrapper) {
			if (this.wrapper.firstChild) {
				this.wrapper.insertBefore(this.promptContainer, this.wrapper.firstChild);
			} else {
				dom.append(this.wrapper, this.promptContainer);
			}

			// Show the container if it was hidden (no tool items yet)
			if (this.wrapper.style.display === 'none') {
				this.wrapper.style.display = '';
			}
		}
	}

	public getIsActive(): boolean {
		return this.isActive;
	}

	public shouldRemainActive(): boolean {
		return this.isExternallyActive;
	}

	public get hasToolsWaitingForConfirmation(): boolean {
		return this.toolsWaitingForConfirmation > 0;
	}

	public beginToolPresentationBatch(): void {
		this._toolPresentationBatchDepth++;
	}

	public endToolPresentationBatch(): void {
		if (this._toolPresentationBatchDepth === 0) {
			return;
		}
		this._toolPresentationBatchDepth--;
		if (this._toolPresentationBatchDepth === 0 && this._toolPresentationDirty) {
			this._toolPresentationDirty = false;
			this._updateToolPresentation();
		}
	}

	private _updateToolPresentation(): void {
		if (this._toolPresentationBatchDepth > 0) {
			this._toolPresentationDirty = true;
			return;
		}
		this._updateOpenChatToolbarContext();
	}

	/** Routes this subagent's initial confirmations to the input carousel. */
	public enableCarouselMode(
		navigateToCarousel: (subAgentInvocationId: string) => void,
		addToolToCarousel: (tool: IChatToolInvocation) => void,
		shouldUseCarouselForTool: (tool: IChatToolInvocation, state: IChatToolInvocation.State) => boolean,
		onDidChangeActiveSubagent?: Event<string | undefined>,
	): void {
		this._useCarouselForConfirmations = true;
		this._navigateToCarousel = navigateToCarousel;
		this._addToolToCarousel = addToolToCarousel;
		this._shouldUseCarouselForTool = shouldUseCarouselForTool;
		this._activeConfirmationTracker.value = onDidChangeActiveSubagent?.(id => this.setConfirmationActive(id === this.subAgentInvocationId));
	}

	public getChatResource(): string | undefined {
		return this._getChatResource();
	}

	public setConfirmationActive(active: boolean): void {
		if (active !== this._confirmationActive) {
			this._confirmationActive = active;
			this._updateOpenChatToolbarContext();
		}
	}

	public getSubagentTitle(): string {
		return this.description;
	}

	public focus(): void {
		this._openChatToolbar?.focus();
	}

	public markAsInactive(force: boolean = false): void {
		if (force && this._subagentToolInvocation.toolSpecificData?.kind === 'subagent') {
			const data = this._subagentToolInvocation.toolSpecificData;
			// An independently observed child can outlive the completed parent response.
			if (data.hasStarted === true && getSubagentIsActive(data) === true) {
				return;
			}
			data.isActive = false;
			if (data.duration === undefined && data.startedAt !== undefined) {
				data.duration = Math.max(0, Date.now() - data.startedAt);
			}
		}
		this.isActive = false;
		this._updateOpenChatToolbarContext();
		this.setThinkingActive(false);

		this.removeWorkingSpinner();
		this.hideConfirmationPlaceholder();

		if (this._isDefaultDescription) {
			this.description = localize('chat.subagent.completedDefaultDescription', 'Ran subagent');
		}
		this._updateOpenChatToolbarContext();
		// Collapse when done
		this.setExpanded(false);
	}

	private markAsActive(): void {
		if (this.isActive) {
			return;
		}
		this.isActive = true;
		this.setThinkingActive(true);
		if (this.wrapper && !this.hasToolsWaitingForConfirmation) {
			this.showWorkingSpinner();
		}
		this._updateOpenChatToolbarContext();
	}

	private refreshActiveStateFromToolData(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): void {
		if (toolInvocation.toolSpecificData?.kind !== 'subagent') {
			return;
		}
		this._updateOpenChatToolbarContext();
		const isActive = getSubagentIsActive(toolInvocation.toolSpecificData);
		if (isActive === undefined) {
			return;
		}
		this.isExternallyActive = isActive;
		if (isActive) {
			this.markAsActive();
		} else {
			this.markAsInactive();
		}
	}

	/**
	 * Re-reads the subagent's credit (AIC) usage from `toolSpecificData` and
	 * refreshes the hover tooltip when it has changed. Credits can arrive
	 * incrementally while the subagent runs and continue updating until its
	 * child turns report their final usage.
	 */
	private refreshCreditsFromToolData(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): void {
		if (toolInvocation.toolSpecificData?.kind !== 'subagent') {
			return;
		}
		const credits = toolInvocation.toolSpecificData.credits;
		if (typeof credits === 'number' && credits !== this.credits) {
			this.credits = credits;
			this._updateOpenChatToolbarContext();
		}
	}

	/**
	 * Re-reads the subagent's model name from `toolSpecificData` and refreshes
	 * the hover when it changes. The model can arrive incrementally (e.g. agent
	 * host subagents report it via their child turns' usage events).
	 */
	private refreshModelFromToolData(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): void {
		if (toolInvocation.toolSpecificData?.kind !== 'subagent') {
			return;
		}
		const modelName = toolInvocation.toolSpecificData.modelName;
		if (modelName && modelName !== this.modelName) {
			this.modelName = modelName;
			this._updateOpenChatToolbarContext();
		}
	}

	private getToolLabel(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, state: IChatToolInvocation.State | undefined): string | undefined {
		if (state?.type === IChatToolInvocation.StateKind.Streaming) {
			return undefined;
		}
		if (toolInvocation.toolSpecificData?.kind === 'terminal' && !isLegacyChatTerminalToolInvocationData(toolInvocation.toolSpecificData)) {
			const intention = toolInvocation.toolSpecificData.intention?.replace(/\s+/g, ' ').trim();
			if (intention) {
				return intention;
			}
		}
		const confirmation = IChatToolInvocation.executionConfirmedOrDenied(toolInvocation);
		const wasCancelled = confirmation?.type === ToolConfirmKind.Denied || confirmation?.type === ToolConfirmKind.Skipped;
		const message = IChatToolInvocation.isComplete(toolInvocation) && !wasCancelled
			? toolInvocation.pastTenseMessage ?? toolInvocation.invocationMessage
			: toolInvocation.invocationMessage;
		const messageText = typeof message === 'string' ? message : message.value;
		const label = messageText.replace(/\s+/g, ' ').trim();
		if (!label) {
			return undefined;
		}
		const toolIdWords = toolInvocation.toolId
			.replace(/([a-z\d])([A-Z])/g, '$1 $2')
			.split(/[^a-zA-Z\d]+/)
			.filter(Boolean);
		const normalizedLabel = label.toLocaleLowerCase();
		const genericLabels = [toolIdWords[0], toolIdWords.join(' ')]
			.filter((candidate): candidate is string => !!candidate)
			.map(candidate => candidate.toLocaleLowerCase());
		return genericLabels.includes(normalizedLabel) ? undefined : label;
	}

	/**
	 * Tracks a tool invocation's state for:
	 * 1. Updating the title with the current tool message (persists even after completion)
	 * 2. Auto-expanding when a tool is waiting for confirmation
	 * 3. Auto-collapsing when the confirmation is addressed
	 * This method is public to support testing.
	 */
	public trackToolState(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): void {
		const initialState = toolInvocation.kind === 'toolInvocation' ? toolInvocation.state.get() : undefined;
		let wasStreamingForPresentation = initialState?.type === IChatToolInvocation.StateKind.Streaming;
		if (!wasStreamingForPresentation) {
			this.currentRunningToolCallId = toolInvocation.toolCallId;
			this.currentRunningToolMessage = this.getToolLabel(toolInvocation, initialState);
			this.currentRunningToolIcon = this.currentRunningToolMessage ? getToolInvocationIcon(toolInvocation.toolId, toolInvocation, this.currentRunningToolMessage) : undefined;
			this.updateActiveToolPresentation(toolInvocation.toolCallId, this.currentRunningToolMessage, this.currentRunningToolIcon, initialState);
			this._updateToolPresentation();
		}
		if (toolInvocation.kind !== 'toolInvocation' || IChatToolInvocation.isComplete(toolInvocation)) {
			return;
		}
		const addToolToCarousel = this._addToolToCarousel;
		const shouldUseCarouselForTool = this._shouldUseCarouselForTool;

		let wasWaitingForConfirmation = false;
		let wasWaitingForCarouselConfirmation = false;
		const toolStateAutorun = autorun(r => {
			const state = toolInvocation.state.read(r);
			if (wasStreamingForPresentation && state.type !== IChatToolInvocation.StateKind.Streaming) {
				wasStreamingForPresentation = false;
				this.currentRunningToolCallId = toolInvocation.toolCallId;
				this.currentRunningToolMessage = this.getToolLabel(toolInvocation, state);
				this.currentRunningToolIcon = this.currentRunningToolMessage ? getToolInvocationIcon(toolInvocation.toolId, toolInvocation, this.currentRunningToolMessage) : undefined;
				this.updateActiveToolPresentation(toolInvocation.toolCallId, this.currentRunningToolMessage, this.currentRunningToolIcon, state);
				this._updateToolPresentation();
			}
			if (this.currentRunningToolCallId === toolInvocation.toolCallId) {
				const toolLabel = this.getToolLabel(toolInvocation, state);
				if (toolLabel && toolLabel !== this.currentRunningToolMessage) {
					this.currentRunningToolMessage = toolLabel;
					this.currentRunningToolIcon = getToolInvocationIcon(toolInvocation.toolId, toolInvocation, this.currentRunningToolMessage);
					this.updateActiveToolPresentation(toolInvocation.toolCallId, this.currentRunningToolMessage, this.currentRunningToolIcon, state);
					this._updateToolPresentation();
				}
			}

			const isWaitingForConfirmation = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation
				|| state.type === IChatToolInvocation.StateKind.WaitingForPostApproval
				|| state.type === IChatToolInvocation.StateKind.WaitingForAuthentication;
			const isWaitingForCarouselConfirmation = !!addToolToCarousel && shouldUseCarouselForTool?.(toolInvocation, state) === true;

			if (isWaitingForConfirmation && !wasWaitingForConfirmation) {
				this.toolsWaitingForConfirmation++;
				if (!this.isExpanded() && !(isWaitingForCarouselConfirmation && this._shouldKeepCollapsedForCarouselConfirmation())) {
					this.autoExpandedForConfirmation = true;
					this.setExpanded(true);
				}
				// Remove the working spinner while confirmation is shown
				this.removeWorkingSpinner();
			} else if (!isWaitingForConfirmation && wasWaitingForConfirmation) {
				this.toolsWaitingForConfirmation--;
				if (this.toolsWaitingForConfirmation === 0 && this.autoExpandedForConfirmation && !this.userManuallyExpanded) {
					// Auto-collapse only if we auto-expanded and user didn't manually expand
					this.autoExpandedForConfirmation = false;
					this.setExpanded(false);
				}
				// Show the working spinner again if still active and no more confirmations
				if (this.toolsWaitingForConfirmation === 0 && this.isActive) {
					this.showWorkingSpinner();
				}
			}
			if (isWaitingForConfirmation !== wasWaitingForConfirmation) {
				this._updateToolPresentation();
			}

			if (isWaitingForCarouselConfirmation && !wasWaitingForCarouselConfirmation) {
				this.toolsWaitingForCarouselConfirmation++;
				this._updateToolPresentation();
				addToolToCarousel(toolInvocation);
				this.showConfirmationPlaceholder();
			} else if (!isWaitingForCarouselConfirmation && wasWaitingForCarouselConfirmation) {
				this.toolsWaitingForCarouselConfirmation--;
				this._updateToolPresentation();
				if (this.toolsWaitingForCarouselConfirmation === 0) {
					this.hideConfirmationPlaceholder();
				} else {
					this.updateConfirmationPlaceholderLabel();
				}
			}

			wasWaitingForConfirmation = isWaitingForConfirmation;
			wasWaitingForCarouselConfirmation = isWaitingForCarouselConfirmation;

			// On terminal state, dispose this autorun (deferred so we don't dispose it mid-run) to avoid leaking a listener per tool invocation.
			if (state.type === IChatToolInvocation.StateKind.Completed || state.type === IChatToolInvocation.StateKind.Cancelled) {
				if (this.activeToolPresentations.delete(toolInvocation.toolCallId)) {
					this._updateToolPresentation();
				}
				queueMicrotask(() => this._toolStateTracking.delete(toolStateAutorun));
			}
		});
		this._toolStateTracking.add(toolStateAutorun);
	}

	private updateActiveToolPresentation(toolCallId: string, label: string | undefined, icon: ThemeIcon | undefined, state: IChatToolInvocation.State | undefined): void {
		this.activeToolPresentations.delete(toolCallId);
		if (label && icon) {
			this.mostRecentToolPresentation = { callId: toolCallId, label, icon };
		}
		if (label && icon && state && state.type !== IChatToolInvocation.StateKind.Completed && state.type !== IChatToolInvocation.StateKind.Cancelled) {
			this.activeToolPresentations.set(toolCallId, { label, icon });
		}
	}

	private getConfirmationPlaceholderText(): string {
		const count = this.toolsWaitingForCarouselConfirmation;
		return count === 1
			? localize('chat.subagent.pendingConfirmation', '1 pending confirmation')
			: localize('chat.subagent.pendingConfirmations', '{0} pending confirmations', count);
	}

	private updateConfirmationPlaceholderLabel(): void {
		if (this._confirmationPlaceholderLabel) {
			this._confirmationPlaceholderLabel.textContent = this.getConfirmationPlaceholderText();
		}
	}

	/** Shows a placeholder that jumps back to the carousel. */
	private showConfirmationPlaceholder(): void {
		if (this._confirmationPlaceholder) {
			this.updateConfirmationPlaceholderLabel();
			return;
		}

		const placeholder = $('button.chat-subagent-confirmation-placeholder');
		const label = $('span.chat-subagent-placeholder-label');
		label.textContent = this.getConfirmationPlaceholderText();
		placeholder.appendChild(label);

		this._confirmationPlaceholder = placeholder;
		this._confirmationPlaceholderLabel = label;

		const placeholderDisposables = new DisposableStore();
		placeholderDisposables.add(dom.addDisposableListener(placeholder, 'click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._navigateToCarousel?.(this.subAgentInvocationId);
		}));
		this._confirmationPlaceholderDisposable.value = placeholderDisposables;

		if (!this.hasToolItems) {
			this.hasToolItems = true;
			if (this.wrapper) {
				this.wrapper.style.display = '';
			}
		}

		if (!this.isExpanded() && !this._shouldKeepCollapsedForCarouselConfirmation()) {
			this.autoExpandedForConfirmation = true;
			this.setExpanded(true);
		}

		if (this.wrapper) {
			this.wrapper.appendChild(placeholder);
		}
		this.layoutScheduler.schedule();
	}

	private hideConfirmationPlaceholder(): void {
		if (this._confirmationPlaceholder) {
			this._confirmationPlaceholder.remove();
			this._confirmationPlaceholder = undefined;
			this._confirmationPlaceholderLabel = undefined;
			this._confirmationPlaceholderDisposable.clear();
			this.layoutScheduler.schedule();
		}
	}

	/** Keeps the carousel placeholder after visible tool output. */
	private ensurePlaceholderAtBottom(): void {
		if (this._confirmationPlaceholder?.parentElement === this.wrapper) {
			this.wrapper.appendChild(this._confirmationPlaceholder);
		}
	}

	/**
	 * Watches the tool invocation for completion and renders the result.
	 * Handles both live and serialized invocations.
	 */
	private watchToolCompletion(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): void {
		// Only watch parent subagent tools for completion
		if (!ChatSubagentContentPart.isParentSubagentTool(toolInvocation)) {
			return;
		}

		if (toolInvocation.kind === 'toolInvocation') {
			// Watch for completion and render the result
			let wasStreaming = toolInvocation.state.get().type === IChatToolInvocation.StateKind.Streaming;
			this._register(autorun(r => {
				const state = toolInvocation.state.read(r);
				this.refreshActiveStateFromToolData(toolInvocation);
				this.refreshActivityFromToolData(toolInvocation);
				if (state.type === IChatToolInvocation.StateKind.Completed) {
					wasStreaming = false;
					// Extract text from result
					const textParts = (state.contentForModel || [])
						.filter((part): part is { kind: 'text'; value: string } => part.kind === 'text')
						.map(part => part.value);

					if (textParts.length > 0) {
						this.renderResultText(textParts.join('\n'));
					}

					// Update description and model name from toolSpecificData (set during invoke())
					if (toolInvocation.toolSpecificData?.kind === 'subagent') {
						if (toolInvocation.toolSpecificData.description) {
							this.description = toolInvocation.toolSpecificData.description;
							this._isDefaultDescription = false;
						}
						if (toolInvocation.toolSpecificData.agentDisplayName) {
							this.agentDisplayName = toolInvocation.toolSpecificData.agentDisplayName;
						}
						if (toolInvocation.toolSpecificData.modelName) {
							this.modelName = toolInvocation.toolSpecificData.modelName;
							this._updateOpenChatToolbarContext();
						}
					}
					// Credits (AIC) may arrive at or after completion as the
					// subagent's child turns report their final usage.
					this.refreshCreditsFromToolData(toolInvocation);

					// The subagent chat resource may have arrived with completion.
					this._updateOpenChatLink();

					if (!this.isExternallyActive) {
						this.markAsInactive();
					}
				} else if (wasStreaming && state.type !== IChatToolInvocation.StateKind.Streaming) {
					wasStreaming = false;
					// Update things that change when tool is done streaming
					const { description, isDefaultDescription, agentDisplayName, agentName, prompt, modelName } = ChatSubagentContentPart.extractSubagentInfo(toolInvocation);
					this.description = description;
					this._isDefaultDescription = isDefaultDescription;
					this.agentDisplayName = agentDisplayName;
					this.agentName = agentName;
					this.prompt = prompt;
					if (modelName) {
						this.modelName = modelName;
						this._updateOpenChatToolbarContext();
					}
					this.refreshCreditsFromToolData(toolInvocation);
					this.renderPromptSection();
					this._updateOpenChatToolbarContext();
					this._updateOpenChatLink();
				} else if (toolInvocation.toolSpecificData?.kind === 'subagent') {
					// toolSpecificData was updated after initial render (e.g.
					// subagent content arrived via ChatToolCallContentChanged
					// after the part was first constructed in PendingConfirmation).
					// Re-read metadata and update the title if real values are
					// now available that we didn't have before.
					const { description, isDefaultDescription, agentDisplayName, agentName } = ChatSubagentContentPart.extractSubagentInfo(toolInvocation);
					const descriptionChanged = this._isDefaultDescription && !isDefaultDescription;
					const agentDisplayNameChanged = !!agentDisplayName && agentDisplayName !== this.agentDisplayName;
					const agentNameChanged = !!agentName && agentName !== this.agentName;
					if (descriptionChanged || agentDisplayNameChanged || agentNameChanged) {
						if (descriptionChanged) {
							this.description = description;
							this._isDefaultDescription = isDefaultDescription;
						}
						if (agentDisplayNameChanged) {
							this.agentDisplayName = agentDisplayName;
						}
						if (agentNameChanged) {
							this.agentName = agentName;
						}
						this._updateOpenChatToolbarContext();
					}
					this.refreshCreditsFromToolData(toolInvocation);
					this.refreshModelFromToolData(toolInvocation);
					this._updateOpenChatLink();
				}
			}));
		} else if (toolInvocation.toolSpecificData?.kind === 'subagent' && toolInvocation.toolSpecificData.result) {
			// Render the persisted result for serialized invocations
			this.renderResultText(toolInvocation.toolSpecificData.result);
			// Already complete, mark as inactive
			this.markAsInactive();
		}
	}

	private refreshActivityFromToolData(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): void {
		const activity = toolInvocation.toolSpecificData?.kind === 'subagent' ? toolInvocation.toolSpecificData.activity : undefined;
		if (activity !== this.subagentActivity) {
			this.subagentActivity = activity;
			this._updateOpenChatToolbarContext();
		}
	}

	/**
	 * Renders the result text as a collapsible section.
	 * If the wrapper doesn't exist yet (lazy init) or subagent is initially complete,
	 * this is deferred until expanded.
	 */
	public renderResultText(resultText: string): void {
		if (this.resultContainer || !resultText) {
			return; // Already rendered or no content
		}

		// Defer rendering when wrapper doesn't exist yet (lazy init) or for old completed subagents until expanded
		if (!this.wrapper || (this.isInitiallyComplete && !this.isExpanded() && !this.hasExpandedOnce)) {
			this.pendingResultText = resultText;
			return;
		}

		this.pendingResultText = undefined;
		this.doRenderResultText(resultText);
	}

	private doRenderResultText(resultText: string): void {
		if (this.resultContainer || !resultText) {
			return;
		}

		// Split into first line and rest
		const lines = resultText.split('\n');
		const rawFirstLine = lines[0] || '';
		const restOfLines = lines.slice(1).join('\n').trim();

		// Limit first line length, moving overflow to content
		const titleContent = rcut(rawFirstLine, MAX_TITLE_LENGTH);
		const wasTruncated = rawFirstLine.length > MAX_TITLE_LENGTH;
		const title = wasTruncated ? titleContent + '…' : titleContent;
		const titleRemainder = rawFirstLine.length > titleContent.length ? rawFirstLine.slice(titleContent.length).trim() : '';
		const content = titleRemainder
			? (titleRemainder + (restOfLines ? '\n' + restOfLines : ''))
			: restOfLines;

		// Create collapsible result part
		const collapsiblePart = this._register(this.instantiationService.createInstance(
			ChatCollapsibleMarkdownContentPart,
			title,
			content,
			this.context,
			this.chatContentMarkdownRenderer
		));

		// Wrap in a container for chain of thought line styling
		this.resultContainer = $('.chat-thinking-tool-wrapper.chat-subagent-section');
		const resultIcon = createThinkingIcon(Codicon.check);
		this.resultContainer.appendChild(resultIcon);
		this.resultContainer.appendChild(collapsiblePart.domNode);

		// With lazy rendering, wrapper may not be created yet if content hasn't been expanded
		if (this.wrapper) {
			dom.append(this.wrapper, this.resultContainer);

			// Show the container if it was hidden
			if (this.wrapper.style.display === 'none') {
				this.wrapper.style.display = '';
			}
		}
	}

	/**
	 * Appends a tool invocation to the subagent group.
	 * The tool part is created lazily - only when the subagent section is expanded,
	 * unless it's actively streaming (not initially complete), in which case render immediately.
	 */
	public appendToolInvocation(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, codeBlockStartIndex: number): void {
		// Show the container when first tool item is added
		if (!this.hasToolItems) {
			this.hasToolItems = true;
			// With lazy rendering, wrapper may not be created yet if content hasn't been expanded
			if (this.wrapper) {
				this.wrapper.style.display = '';
			}
		}

		// Track tool state for title updates and auto-expand/collapse on confirmation
		this.trackToolState(toolInvocation);

		// Render immediately only if already expanded or has been expanded before
		if (this.isExpanded() || this.hasExpandedOnce) {
			const part = this.createToolPart(toolInvocation, codeBlockStartIndex);
			this.appendToolPartToDOM(part, toolInvocation);
		} else {
			// Defer rendering until expanded
			const item: ILazyToolItem = {
				kind: 'tool',
				lazy: new Lazy(() => this.createToolPart(toolInvocation, codeBlockStartIndex)),
				toolInvocation,
				codeBlockStartIndex,
			};
			this.lazyItems.push(item);
		}
	}

	/** Appends markdown or external edits lazily. Pass any already-created part as `eagerDisposable` to transfer ownership immediately. */
	public appendEditItem(
		factory: () => { domNode: HTMLElement; disposable?: IDisposable },
		partId: string | undefined,
		eagerDisposable?: IDisposable,
		diffSource?: IChatContentPartDiffSource,
	): void {
		// Register any caller-owned disposable up-front so it is always cleaned up
		// with this subagent part, even if the lazy item is never materialized.
		if (eagerDisposable) {
			this._register(eagerDisposable);
		}

		// Track edit-pill diffs, seeding from any value emitted before this subscription existed.
		if (diffSource && partId) {
			this.diffDataByPartId.set(partId, diffSource.diffData ?? { added: 0, removed: 0, resources: [] });
			this.diffSubscriptions.set(partId, diffSource.onDidChangeDiff(data => {
				this.diffDataByPartId.set(partId, data);
				this.updateAggregatedDiff();
			}));
			if (diffSource.diffData) {
				this.updateAggregatedDiff();
			}
		}

		// If expanded or has been expanded once, render immediately
		if (this.isExpanded() || this.hasExpandedOnce) {
			const result = factory();
			this.appendEditItemToDOM(result.domNode, partId);
			if (result.disposable && result.disposable !== eagerDisposable) {
				this._register(result.disposable);
			}
		} else {
			// Defer rendering until expanded
			const item: ILazyEditItem = {
				kind: 'edit',
				lazy: new Lazy(factory),
				partId,
				eagerlyRegistered: !!eagerDisposable,
			};
			this.lazyItems.push(item);
		}
	}

	/**
	 * Retires an edit item before its replacement is rendered, so revisions are not counted twice.
	 */
	public removeEditItemByPartId(partId: string): void {
		const lazyIndex = this.lazyItems.findIndex(item => item.kind === 'edit' && item.partId === partId);
		if (lazyIndex !== -1) {
			this.lazyItems.splice(lazyIndex, 1);
		}
		const rendered = this.renderedEditItems.get(partId);
		if (rendered) {
			rendered.remove();
			this.renderedEditItems.delete(partId);
		}
		this.diffSubscriptions.deleteAndDispose(partId);
		if (this.diffDataByPartId.delete(partId)) {
			this.updateAggregatedDiff();
		}
	}

	private updateAggregatedDiff(): void {
		this._diffData.set(aggregateChatEditDiffs(this.diffDataByPartId.values()), undefined);
	}

	/**
	 * Appends a hook item (blocked/warning) to the subagent content part.
	 */
	public appendHookItem(
		factory: () => { domNode: HTMLElement; disposable?: IDisposable },
		hookPart: IChatHookPart
	): void {
		// update title with hook message
		const hookMessage = hookPart.stopReason
			? (hookPart.toolDisplayName
				? localize('hook.subagent.blocked', 'Blocked {0}', hookPart.toolDisplayName)
				: localize('hook.subagent.blockedGeneric', 'Blocked by hook'))
			: (hookPart.toolDisplayName
				? localize('hook.subagent.warning', 'Warning for {0}', hookPart.toolDisplayName)
				: localize('hook.subagent.warningGeneric', 'Hook warning'));
		this.currentRunningToolMessage = hookMessage;
		this.currentRunningToolCallId = undefined;
		this.currentRunningToolIcon = hookPart.stopReason ? Codicon.error : Codicon.warning;
		this._updateToolPresentation();

		if (this.isExpanded() || this.hasExpandedOnce) {
			const result = factory();
			this.appendHookItemToDOM(result.domNode, hookPart);
			if (result.disposable) {
				this._register(result.disposable);
			}
		} else {
			const item: ILazyHookItem = {
				kind: 'hook',
				lazy: new Lazy(factory),
				hookPart,
			};
			this.lazyItems.push(item);
		}
	}

	/**
	 * Appends a hook item's DOM node to the wrapper.
	 */
	private appendHookItemToDOM(domNode: HTMLElement, hookPart: IChatHookPart): void {
		const itemWrapper = $('.chat-thinking-tool-wrapper');
		const icon = hookPart.stopReason ? Codicon.error : Codicon.warning;
		const iconElement = createThinkingIcon(icon);
		itemWrapper.appendChild(iconElement);
		itemWrapper.appendChild(domNode);

		// Treat hook items as tool items for visibility purposes
		if (!this.hasToolItems) {
			this.hasToolItems = true;
			if (this.wrapper) {
				this.wrapper.style.display = '';
			}
		}

		if (this.wrapper) {
			if (this.resultContainer) {
				this.wrapper.insertBefore(itemWrapper, this.resultContainer);
			} else {
				this.wrapper.appendChild(itemWrapper);
			}
		}
		this.layoutScheduler.schedule();
	}

	/**
	 * Appends an edit item's DOM node to the wrapper.
	 */
	private appendEditItemToDOM(domNode: HTMLElement, partId: string | undefined): void {
		if (!domNode.hasChildNodes() || domNode.textContent?.trim() === '') {
			return;
		}

		// Wrap with icon like other items
		const itemWrapper = $('.chat-thinking-tool-wrapper');
		const iconElement = createThinkingIcon(Codicon.edit);
		itemWrapper.appendChild(domNode);
		itemWrapper.insertBefore(iconElement, itemWrapper.firstChild);

		this.hasToolItems = true;
		// Insert before result container if it exists, otherwise append
		if (this.wrapper) {
			this.wrapper.style.display = '';
			if (this.resultContainer) {
				this.wrapper.insertBefore(itemWrapper, this.resultContainer);
			} else {
				this.wrapper.appendChild(itemWrapper);
			}
		}
		if (partId) {
			this.renderedEditItems.set(partId, itemWrapper);
		}
		this.layoutScheduler.schedule();
	}

	protected override shouldInitEarly(): boolean {
		// Never init early - subagent is collapsed while running, content only shown on expand
		return false;
	}

	/**
	 * Creates a ChatToolInvocationPart for the given tool invocation.
	 */
	private createToolPart(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, codeBlockStartIndex: number): ChatToolInvocationPart {
		const part = this.instantiationService.createInstance(
			ChatToolInvocationPart,
			toolInvocation,
			this.context,
			this.chatContentMarkdownRenderer,
			this.listPool,
			this.editorPool,
			this.currentWidthDelegate,
			this.announcedToolProgressKeys,
			codeBlockStartIndex
		);

		this._register(part);
		return part;
	}

	/**
	 * Appends a tool part's DOM node to the wrapper with appropriate icon wrapper.
	 */
	private appendToolPartToDOM(part: ChatToolInvocationPart, toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): void {
		const content = part.domNode;

		// Wrap with icon like thinking parts do
		const itemWrapper = $('.chat-thinking-tool-wrapper');
		const icon = getToolInvocationIcon(toolInvocation.toolId, toolInvocation, content.textContent ?? undefined);
		const iconElement = createThinkingIcon(icon);
		itemWrapper.appendChild(content);

		// Dynamically add/remove icon based on confirmation state
		if (toolInvocation.kind === 'toolInvocation') {
			const shouldUseCarouselForTool = this._shouldUseCarouselForTool;
			const iconAutorun = autorun(r => {
				const state = toolInvocation.state.read(r);
				const isVisible = part.isVisible.read(r);
				const hasConfirmation = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation ||
					state.type === IChatToolInvocation.StateKind.WaitingForPostApproval;
				const shouldHideInline = shouldUseCarouselForTool?.(toolInvocation, state) === true;
				if (hasConfirmation) {
					iconElement.remove();
				} else {
					if (!iconElement.parentElement) {
						itemWrapper.insertBefore(iconElement, itemWrapper.firstChild);
					}
					if (this._useCarouselForConfirmations) {
						// Re-position the confirmation placeholder to stay at the bottom
						this.ensurePlaceholderAtBottom();
					}
				}
				dom.setVisibility(isVisible && !shouldHideInline, itemWrapper);

				// Terminal state is final and settles into the non-confirmation branch above, so dispose (deferred so we don't dispose it mid-run) to avoid leaking a listener per tool invocation.
				if (state.type === IChatToolInvocation.StateKind.Completed || state.type === IChatToolInvocation.StateKind.Cancelled) {
					queueMicrotask(() => this._toolStateTracking.delete(iconAutorun));
				}
			});
			this._toolStateTracking.add(iconAutorun);
		} else {
			// For serialized invocations, always show icon (already completed)
			itemWrapper.insertBefore(iconElement, itemWrapper.firstChild);
			dom.setVisibility(part.isVisible.get(), itemWrapper);
		}

		// Keep newly-visible tool results above the placeholder/spinner.
		if (this.wrapper) {
			const anchor = this._confirmationPlaceholder ?? this.workingSpinnerElement ?? this.resultContainer;
			if (anchor) {
				this.wrapper.insertBefore(itemWrapper, anchor);
			} else {
				this.wrapper.appendChild(itemWrapper);
			}
		}
		this.layoutScheduler.schedule();
	}

	/**
	 * Materializes a lazy item by creating the content and adding it to the DOM.
	 */
	private materializeLazyItem(item: ILazyItem): void {
		if (item.lazy.hasValue) {
			return; // Already materialized
		}

		if (item.kind === 'tool') {
			const part = item.lazy.value;
			this.appendToolPartToDOM(part, item.toolInvocation);
		} else if (item.kind === 'edit') {
			const result = item.lazy.value;
			this.appendEditItemToDOM(result.domNode, item.partId);
			if (result.disposable && !item.eagerlyRegistered) {
				this._register(result.disposable);
			}
		} else if (item.kind === 'hook') {
			const result = item.lazy.value;
			this.appendHookItemToDOM(result.domNode, item.hookPart);
			if (result.disposable) {
				this._register(result.disposable);
			}
		}
	}

	/**
	 * Materializes all pending lazy content (prompt, tool items, result) when the section is expanded.
	 * This is called when first expanded, but the wrapper must exist (created by base class initContent).
	 */
	private materializePendingContent(): void {
		// Wrapper may not be created yet if this autorun runs before the base class autorun
		// that calls initContent(). In that case, initContent() will call this logic.
		if (!this.wrapper) {
			return;
		}

		// Render pending prompt section
		if (this.pendingPromptRender) {
			this.pendingPromptRender = false;
			this.doRenderPromptSection();
		}

		// Materialize lazy tool items
		for (const item of this.lazyItems) {
			this.materializeLazyItem(item);
		}

		// Render pending result text
		if (this.pendingResultText) {
			const resultText = this.pendingResultText;
			this.pendingResultText = undefined;
			this.doRenderResultText(resultText);
		}
	}

	private performLayout(): void {
		// Auto-scroll to bottom only when actively streaming (not for completed responses)
		if (this.isActive && !this.isInitiallyComplete && this.wrapper) {
			const scrollHeight = this.wrapper.scrollHeight;
			this.wrapper.scrollTop = scrollHeight;
		}
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return (other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized')
			&& ChatSubagentContentPart.isParentSubagentTool(other)
			&& this.subAgentInvocationId === other.toolCallId;
	}
}
