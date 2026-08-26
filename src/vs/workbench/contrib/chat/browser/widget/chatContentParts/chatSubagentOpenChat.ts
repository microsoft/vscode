/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatSubagentOpenChat.css';
import { $, addDisposableListener, EventHelper, EventLike, EventType, isHTMLElement, WindowIntervalTimer } from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { createPixelSpinner } from '../../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { Action, IAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, MenuItemAction, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { parseChatUri } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { ACTIVE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { formatElapsedTime } from '../../../common/chatProgressFormatting.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, CHAT_SUBAGENT_RESOURCE_QUERY_PARAM } from '../../../common/constants.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { IChatWidgetService } from '../../chat.js';
import { getChatMarkdownRenderOptions } from '../chatContentMarkdownRenderer.js';
import { renderFileWidgets } from './chatInlineAnchorWidget.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { getCompactCodicon } from '../../chatIcons.js';

export interface IOpenSubagentChatContext {
	readonly chatResource: string;
	readonly parentSessionResource?: string;
	readonly title?: string;
	readonly agentType?: string;
	/** Open the subagent chat to the side (in a new group) rather than in place. */
	readonly toSide?: boolean;
	readonly confirmationCount?: number;
	readonly confirmationActive?: boolean;
	readonly startedAt?: number;
	readonly duration?: number;
	readonly modelName?: string;
	readonly parentModelId?: string;
	readonly parentModelName?: string;
	readonly parentResolvedModelId?: string;
	readonly isActive?: boolean;
	readonly activeToolCallId?: string;
	readonly activeToolLabel?: string;
	readonly activeToolIcon?: ThemeIcon;
}

export type SubagentChatStatus = 'running' | 'waiting' | 'completed';

export interface ISubagentChatOpener {
	open(context: IOpenSubagentChatContext): Promise<boolean>;
}

class SubagentChatOpenerRegistry {
	private readonly openers = new Set<ISubagentChatOpener>();

	register(opener: ISubagentChatOpener): IDisposable {
		this.openers.add(opener);
		return toDisposable(() => this.openers.delete(opener));
	}

	async open(context: IOpenSubagentChatContext): Promise<boolean> {
		for (const opener of this.openers) {
			if (await opener.open(context)) {
				return true;
			}
		}
		return false;
	}
}

export const subagentChatOpenerRegistry = new SubagentChatOpenerRegistry();

function asOpenSubagentChatContext(context: unknown): IOpenSubagentChatContext | undefined {
	if (typeof context === 'string') {
		return { chatResource: context };
	}
	if (context && typeof context === 'object' && typeof (context as IOpenSubagentChatContext).chatResource === 'string') {
		return context as IOpenSubagentChatContext;
	}
	return undefined;
}

export function getSubagentEditorResource(context: IOpenSubagentChatContext): URI | undefined {
	const parsed = parseChatUri(context.chatResource);
	if (!parsed || !context.parentSessionResource) {
		return undefined;
	}
	try {
		const parentSessionResource = URI.parse(context.parentSessionResource);
		const query = new URLSearchParams(parentSessionResource.query);
		query.set(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, context.chatResource);
		return parentSessionResource.with({ fragment: parsed.chatId, query: query.toString() });
	} catch {
		return undefined;
	}
}

export function shouldShowSubagentModel(subagentModelName: string | undefined, parentModelId: string | undefined, parentModelName: string | undefined, parentModelMetadataId: string | undefined): boolean {
	if (!subagentModelName) {
		return false;
	}
	const normalizedSubagentModel = subagentModelName.trim().toLowerCase();
	const parentModelIdSuffix = parentModelId?.slice(parentModelId.lastIndexOf(':') + 1);
	return ![parentModelId, parentModelIdSuffix, parentModelName, parentModelMetadataId]
		.some(candidate => candidate?.trim().toLowerCase() === normalizedSubagentModel);
}

export function formatCompactSubagentDuration(startedAt: number, duration: number | undefined, now: number = Date.now()): string {
	const end = duration === undefined ? now : startedAt + Math.max(0, duration);
	return formatElapsedTime(Math.max(0, end - startedAt));
}

export function shouldAnimateSubagentToolTransition(displayedToolCallId: string | undefined, displayedIsTool: boolean, targetToolCallId: string | undefined, targetIsTool: boolean): boolean {
	if (!displayedIsTool && !targetIsTool) {
		return false;
	}
	return displayedIsTool !== targetIsTool || displayedToolCallId !== targetToolCallId;
}

function createOpenSubagentAction(action: IAction): Action {
	const proxy = new Action(action.id, action.label, action.class, false, context => action.run(context));
	proxy.tooltip = action.tooltip;
	return proxy;
}

function createEditorOpenSubagentAction(action: IAction, chatWidgetService: IChatWidgetService, notificationService: INotificationService): Action {
	const proxy = new Action(action.id, action.label, action.class, false, async rawContext => {
		const context = asOpenSubagentChatContext(rawContext);
		const resource = context && getSubagentEditorResource(context);
		if (!resource) {
			notificationService.error(localize('chat.subagent.openChat.invalidResource', "The subagent chat could not be opened."));
			return;
		}
		await chatWidgetService.openSession(resource, ACTIVE_GROUP, {
			pinned: true,
			revealIfOpened: true,
			title: context.title ? { preferred: context.title } : undefined,
		});
	});
	proxy.tooltip = action.tooltip;
	return proxy;
}

class OpenSubagentChatAction extends Action2 {
	constructor() {
		super({
			id: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID,
			title: localize2('chat.subagent.openChat', "Open Subagent"),
			icon: Codicon.commentDiscussion,
			f1: false,
			menu: { id: MenuId.ChatSubagentContent, group: 'navigation' },
		});
	}

	override async run(accessor: ServicesAccessor, rawContext?: unknown): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const context = asOpenSubagentChatContext(rawContext);
		if (!context) {
			throw new Error('Cannot open a subagent chat without a chat resource');
		}
		if (await subagentChatOpenerRegistry.open(context)) {
			return;
		}
		const resource = getSubagentEditorResource(context);
		if (!resource) {
			notificationService.error(localize('chat.subagent.openChat.invalidResource', "The subagent chat could not be opened."));
			return;
		}
		await chatWidgetService.openSession(resource, ACTIVE_GROUP, {
			pinned: true,
			revealIfOpened: true,
			title: context.title ? { preferred: context.title } : undefined,
		});
	}
}
registerAction2(OpenSubagentChatAction);

export class OpenSubagentChatActionViewItem extends BaseActionViewItem {
	private readonly _sourceAction: IAction;
	private readonly _showElapsedOnly: boolean;
	private _resolvedTitle: string | undefined;
	private _trackedEnabled: boolean | undefined;
	private _reportedAgentType: string | undefined;
	private _reportedModelName: string | undefined;
	private _renderedStatus: SubagentChatStatus | undefined;
	private _confirmationCount = 0;
	private readonly _spinner = this._register(new MutableDisposable<DisposableStore>());
	private readonly _durationTimer = this._register(new WindowIntervalTimer());
	private readonly _toolTransition = this._register(new MutableDisposable<DisposableStore>());
	private readonly _activeToolRendered = this._register(new MutableDisposable());
	private readonly _activeToolFileWidgets = this._register(new DisposableStore());
	private readonly _pillHover = this._register(new MutableDisposable());
	private readonly _enabledTracker = this._register(new MutableDisposable());
	private _enabledTrackerFactory: ((context: IOpenSubagentChatContext, update: (enabled: boolean) => void) => IDisposable) | undefined;
	private _dragDataProvider: ((context: IOpenSubagentChatContext, event: DragEvent) => boolean) | undefined;
	private _labelElement: HTMLElement | undefined;
	private _agentTypeElement: HTMLElement | undefined;
	private _pillContentElement: HTMLElement | undefined;
	private _modelElement: HTMLElement | undefined;
	private _durationElement: HTMLElement | undefined;
	private _activeToolElement: HTMLElement | undefined;
	private _activeToolIconElement: HTMLElement | undefined;
	private _activeToolLabelElement: HTMLElement | undefined;
	private _confirmationCountElement: HTMLElement | undefined;
	private _iconElement: HTMLElement | undefined;
	private _displayedToolLabel: string | undefined;
	private _displayedToolIcon: ThemeIcon | undefined;
	private _displayedToolCallId: string | undefined;
	private _displayedToolAccessibleLabel: string | undefined;
	private _targetToolLabel: string | undefined;
	private _targetToolIcon: ThemeIcon | undefined;
	private _targetToolCallId: string | undefined;
	private _targetActivityIsTool: boolean = false;
	private _displayedActivityIsTool: boolean = false;
	private _toolTransitionPhase: 'idle' | 'out' | 'in' = 'idle';

	constructor(
		context: unknown,
		action: IAction,
		options: IActionViewItemOptions,
		openInEditor: boolean = false,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatMarkdownAnchorService private readonly chatMarkdownAnchorService: IChatMarkdownAnchorService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@INotificationService notificationService: INotificationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(context, openInEditor ? createEditorOpenSubagentAction(action, chatWidgetService, notificationService) : createOpenSubagentAction(action), options);
		this._sourceAction = action;
		this._showElapsedOnly = openInEditor;
		if (this._action instanceof Action) {
			this._register(this._action);
		}
		this._register(this.accessibilityService.onDidChangeReducedMotion(() => {
			if (this.accessibilityService.isMotionReduced()) {
				this._finishToolTransition();
			}
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-subagent-pill-widget');
		container.setAttribute('role', 'button');

		this._iconElement = $('span.chat-subagent-pill-icon');
		this._iconElement.appendChild($(`span.chat-subagent-pill-open-icon${ThemeIcon.asCSSSelector(Codicon.commentDiscussion)}`));
		this._agentTypeElement = $('span.chat-subagent-pill-agent-type.hidden');
		this._labelElement = $('span.chat-subagent-pill-label');
		this._modelElement = $('span.chat-subagent-pill-model.hidden');
		this._confirmationCountElement = $('span.chat-subagent-pill-confirmation-count');
		const pillContent = $('span.chat-subagent-pill-content');
		this._pillContentElement = pillContent;
		const pillHeader = $('span.chat-subagent-pill-header');
		this._durationElement = $('span.chat-subagent-pill-duration.hidden');
		this._activeToolElement = $('span.chat-subagent-pill-active-tool.hidden');
		this._activeToolElement.inert = true;
		const connector = $('span.chat-subagent-pill-active-tool-connector');
		connector.setAttribute('aria-hidden', 'true');
		this._activeToolIconElement = $('span.chat-subagent-pill-active-tool-icon');
		this._activeToolIconElement.setAttribute('aria-hidden', 'true');
		this._activeToolLabelElement = $('.chat-subagent-pill-active-tool-label');
		this._activeToolElement.append(connector, this._activeToolIconElement, this._activeToolLabelElement);
		pillContent.append(this._iconElement, this._agentTypeElement, this._labelElement, this._modelElement, this._confirmationCountElement);
		pillHeader.append(pillContent, this._durationElement);
		container.append(pillHeader, this._activeToolElement);
		this._pillHover.value = this.hoverService.setupDelayedHover(pillContent, () => ({ content: this.getTooltip() ?? '' }));
		if (this.options.draggable) {
			this._register(addDisposableListener(container, EventType.DRAG_START, (event: DragEvent) => {
				const context = asOpenSubagentChatContext(this._context);
				if (!this.action.enabled || !context || !this._dragDataProvider?.(context, event)) {
					event.preventDefault();
				}
			}));
			this._register(addDisposableListener(container, EventType.KEY_DOWN, event => {
				const keyboardEvent = new StandardKeyboardEvent(event);
				if (keyboardEvent.altKey && keyboardEvent.keyCode === KeyCode.Enter) {
					EventHelper.stop(event, true);
					this._openToSide();
				}
			}));
		}
		this._update();
	}

	override onClick(event: EventLike, preserveFocus: boolean = false): void {
		const target = (event as MouseEvent).target;
		if (!this._pillContentElement || !isHTMLElement(target) || !this._pillContentElement.contains(target)) {
			EventHelper.stop(event, true);
			return;
		}
		// Alt-click opens the subagent chat to the side (in a new group) rather
		// than in place. Thread the intent through the action context.
		if ((event as MouseEvent).altKey) {
			if (this._openToSide()) {
				EventHelper.stop(event, true);
				return;
			}
		}
		super.onClick(event, preserveFocus);
	}

	private _openToSide(): boolean {
		const context = asOpenSubagentChatContext(this._context);
		if (!this.action.enabled || !context) {
			return false;
		}
		this.actionRunner.run(this.action, { ...context, toSide: true });
		return true;
	}

	override setActionContext(newContext: unknown): void {
		const previousResource = asOpenSubagentChatContext(this._context)?.chatResource;
		super.setActionContext(newContext);
		const resource = asOpenSubagentChatContext(newContext)?.chatResource;
		if (resource !== previousResource) {
			this._trackedEnabled = undefined;
			this._resolvedTitle = undefined;
			this._reportedModelName = undefined;
			this._restartEnabledTracker();
		}
		this._update();
	}

	private _update(): void {
		if (!this.element) {
			return;
		}
		const context = asOpenSubagentChatContext(this._context);
		const enabled = this._trackedEnabled ?? (!!context && !!getSubagentEditorResource(context));
		this._setEnabled(enabled);
		this._setResolvedTitle(context?.title || this._resolvedTitle);
		this._setAgentType(context?.agentType);
		this._reportedModelName = context?.modelName;
		const parentModel = context?.parentModelId ? this.languageModelsService.lookupLanguageModel(context.parentModelId) : undefined;
		const contextModelName = shouldShowSubagentModel(context?.modelName, context?.parentModelId, context?.parentModelName ?? parentModel?.name, context?.parentResolvedModelId ?? parentModel?.id)
			? context?.modelName
			: undefined;
		this._setModelName(contextModelName);
		this._updateConfirmationCount(context);
		this._updateStatus(context);
		this._updateDuration(context);
		const showActivity = context?.isActive === true && (context.confirmationCount ?? 0) === 0;
		const activeToolLabel = showActivity ? context.activeToolLabel : undefined;
		this._setActiveTool(
			showActivity ? activeToolLabel ?? localize('chat.subagent.working', "Working on it...") : undefined,
			showActivity ? context.activeToolIcon ?? (activeToolLabel ? undefined : Codicon.comment) : undefined,
			showActivity ? context.activeToolCallId : undefined,
			!!activeToolLabel,
		);
		this.updateTooltip();
		this.updateEnabled();
		this.updateAriaLabel();
	}

	trackEnabled(tracker: (context: IOpenSubagentChatContext, update: (enabled: boolean) => void) => IDisposable): void {
		this._enabledTrackerFactory = tracker;
		this._restartEnabledTracker();
	}

	setDragDataProvider(provider: (context: IOpenSubagentChatContext, event: DragEvent) => boolean): void {
		this._dragDataProvider = provider;
	}

	private _restartEnabledTracker(): void {
		const context = asOpenSubagentChatContext(this._context);
		if (!context || !this._enabledTrackerFactory) {
			this._enabledTracker.clear();
			return;
		}
		this._enabledTracker.value = this._enabledTrackerFactory(context, enabled => {
			this._trackedEnabled = enabled;
			this._setEnabled(enabled);
		});
	}

	private _setEnabled(enabled: boolean): void {
		this._action.enabled = enabled;
		this._sourceAction.enabled = enabled;
		this.updateEnabled();
	}

	private _setModelName(modelName: string | undefined): void {
		if (this._modelElement) {
			this._modelElement.textContent = modelName ?? '';
			this._modelElement.classList.toggle('hidden', !modelName);
		}
	}

	private _setAgentType(agentType: string | undefined): void {
		this._reportedAgentType = agentType;
		if (this._agentTypeElement) {
			this._agentTypeElement.textContent = agentType ?? '';
			this._agentTypeElement.classList.toggle('hidden', !agentType);
		}
	}

	private _updateStatus(context: IOpenSubagentChatContext | undefined): void {
		const status = (context?.confirmationCount ?? 0) > 0
			? 'waiting'
			: context?.isActive === true
				? 'running'
				: context?.isActive === false
					? 'completed'
					: undefined;
		if (status === this._renderedStatus) {
			return;
		}
		this._renderedStatus = status;
		const waiting = status === 'waiting';
		const running = status === 'running';
		this.element?.classList.toggle('chat-subagent-running', running);
		this.element?.classList.toggle('chat-subagent-waiting', waiting);
		this._spinner.clear();
		if ((running || waiting) && this._iconElement) {
			const store = new DisposableStore();
			const spinner = store.add(createPixelSpinner(this._iconElement, { variant: waiting ? 'ring' : 'grid' }));
			store.add(toDisposable(() => spinner.element.remove()));
			this._spinner.value = store;
		}
	}

	private _updateConfirmationCount(context: IOpenSubagentChatContext | undefined): void {
		const count = context?.confirmationCount ?? 0;
		const confirmationActive = !!context?.confirmationActive;
		this._confirmationCount = count;
		this.element?.classList.toggle('chat-subagent-needs-confirmation', count > 0);
		this.element?.classList.toggle('chat-subagent-has-multiple-confirmations', count > 1);
		this.element?.classList.toggle('chat-subagent-confirmation-active', count > 0 && confirmationActive);
		this.element?.classList.toggle('chat-subagent-confirmation-pending', count > 0 && !confirmationActive);
		if (this._confirmationCountElement) {
			this._confirmationCountElement.textContent = String(count);
		}
	}

	private _updateDuration(context: IOpenSubagentChatContext | undefined): void {
		this._durationTimer.cancel();
		const startedAt = context?.startedAt;
		const durationValue = context?.duration;
		if (!this._durationElement || startedAt === undefined) {
			this._durationElement?.classList.add('hidden');
			return;
		}
		const update = () => {
			const duration = formatCompactSubagentDuration(startedAt, durationValue);
			this._durationElement!.textContent = this._showElapsedOnly
				? duration
				: durationValue === undefined
					? localize('chat.subagent.workingDuration', "Working for {0}", duration)
					: localize('chat.subagent.workedDuration', "Worked for {0}", duration);
			this.updateAriaLabel();
		};
		update();
		this._durationElement.classList.remove('hidden');
		if (durationValue === undefined) {
			this._durationTimer.cancelAndSet(update, 1000);
		}
	}

	private _setActiveTool(label: string | undefined, icon: ThemeIcon | undefined, toolCallId: string | undefined, isTool: boolean): void {
		this._targetToolLabel = label;
		this._targetToolIcon = icon;
		this._targetToolCallId = toolCallId;
		this._targetActivityIsTool = isTool;
		if (!this._activeToolElement || !this._activeToolLabelElement || !this._activeToolIconElement) {
			return;
		}
		this._activeToolElement.classList.toggle('hidden', !label);
		if (!label) {
			this._toolTransition.clear();
			this._toolTransitionPhase = 'idle';
			this._clearToolTransitionClasses();
			this._activeToolRendered.clear();
			this._activeToolFileWidgets.clear();
			this._activeToolLabelElement.textContent = '';
			this._displayedToolLabel = undefined;
			this._displayedToolIcon = undefined;
			this._displayedToolCallId = undefined;
			this._displayedToolAccessibleLabel = undefined;
			this._displayedActivityIsTool = false;
			this._renderActiveToolIcon(undefined);
			return;
		}
		if (!this._displayedToolLabel || this.accessibilityService.isMotionReduced()) {
			this._finishToolTransition();
			return;
		}
		if (this._toolTransitionPhase === 'idle' && !shouldAnimateSubagentToolTransition(this._displayedToolCallId, this._displayedActivityIsTool, toolCallId, isTool)) {
			this._setDisplayedTool(label, icon, toolCallId, isTool);
			return;
		}
		this._runToolTransition();
	}

	private _runToolTransition(): void {
		if (!this._activeToolLabelElement || this._toolTransitionPhase !== 'idle') {
			return;
		}
		if (!shouldAnimateSubagentToolTransition(this._displayedToolCallId, this._displayedActivityIsTool, this._targetToolCallId, this._targetActivityIsTool)) {
			if (this._targetToolLabel !== this._displayedToolLabel
				|| this._targetToolIcon?.id !== this._displayedToolIcon?.id
				|| this._targetToolCallId !== this._displayedToolCallId
				|| this._targetActivityIsTool !== this._displayedActivityIsTool) {
				this._setDisplayedTool(this._targetToolLabel ?? '', this._targetToolIcon, this._targetToolCallId, this._targetActivityIsTool);
			}
			return;
		}
		this._toolTransitionPhase = 'out';
		if (!this._restartToolTransition('chat-subagent-tool-fade-out')) {
			this._completeToolTransition();
		}
	}

	private _completeToolTransition(): void {
		this._toolTransition.clear();
		if (this._toolTransitionPhase === 'out') {
			this._toolTransitionPhase = 'in';
			this._setDisplayedTool(this._targetToolLabel ?? '', this._targetToolIcon, this._targetToolCallId, this._targetActivityIsTool);
			if (!this._restartToolTransition('chat-subagent-tool-fade-in')) {
				this._completeToolTransition();
			}
			return;
		}
		if (this._toolTransitionPhase === 'in') {
			this._clearToolTransitionClasses();
			this._toolTransitionPhase = 'idle';
			this._runToolTransition();
		}
	}

	private _finishToolTransition(): void {
		this._toolTransition.clear();
		this._toolTransitionPhase = 'idle';
		this._clearToolTransitionClasses();
		if (this._targetToolLabel) {
			this._setDisplayedTool(this._targetToolLabel, this._targetToolIcon, this._targetToolCallId, this._targetActivityIsTool);
		}
	}

	private _setDisplayedTool(label: string, icon: ThemeIcon | undefined, toolCallId: string | undefined, isTool: boolean): void {
		if (!this._activeToolLabelElement) {
			return;
		}
		this._activeToolRendered.clear();
		this._activeToolFileWidgets.clear();
		this._activeToolLabelElement.textContent = '';
		const rendered = this.markdownRendererService.render(new MarkdownString(label), getChatMarkdownRenderOptions(), this._activeToolLabelElement);
		renderFileWidgets(rendered.element, this.instantiationService, this.chatMarkdownAnchorService, this._activeToolFileWidgets);
		this._activeToolRendered.value = rendered;
		this._displayedToolLabel = label;
		this._displayedToolIcon = icon;
		this._displayedToolCallId = toolCallId;
		this._displayedToolAccessibleLabel = rendered.element.textContent?.replace(/\s+/g, ' ').trim() || label;
		this._displayedActivityIsTool = isTool;
		this._renderActiveToolIcon(icon);
		this.updateTooltip();
		this.updateAriaLabel();
	}

	private _renderActiveToolIcon(icon: ThemeIcon | undefined): void {
		if (!this._activeToolIconElement) {
			return;
		}
		this._activeToolIconElement.className = 'chat-subagent-pill-active-tool-icon';
		if (icon) {
			this._activeToolIconElement.classList.add(...ThemeIcon.asClassNameArray(getCompactCodicon(icon)));
		}
	}

	private _clearToolTransitionClasses(): void {
		this._activeToolLabelElement?.classList.remove('chat-subagent-tool-fade-in', 'chat-subagent-tool-fade-out');
	}

	private _restartToolTransition(className: string): boolean {
		if (!this._activeToolLabelElement) {
			return false;
		}
		this._toolTransition.clear();
		this._clearToolTransitionClasses();
		const transition = new DisposableStore();
		const complete = (event: AnimationEvent) => {
			if (event.target === this._activeToolLabelElement) {
				this._completeToolTransition();
			}
		};
		transition.add(addDisposableListener(this._activeToolLabelElement, EventType.ANIMATION_END, complete));
		transition.add(addDisposableListener(this._activeToolLabelElement, 'animationcancel', complete));
		this._toolTransition.value = transition;
		void this._activeToolLabelElement.offsetWidth;
		this._activeToolLabelElement.classList.add(className);
		if (this._activeToolLabelElement.getAnimations().length === 0) {
			this._toolTransition.clear();
			this._clearToolTransitionClasses();
			return false;
		}
		return true;
	}

	private _setResolvedTitle(title: string | undefined): void {
		this._resolvedTitle = title;
		if (this._labelElement) {
			this._labelElement.textContent = title || this._action.label;
		}
	}

	protected override getTooltip(): string | undefined {
		const details: string[] = [];
		if (this._confirmationCount > 0) {
			details.push(this._confirmationCount === 1
				? localize('chat.subagent.openChat.confirmationTooltip', "Open subagent chat (1 confirmation needed)")
				: localize('chat.subagent.openChat.confirmationsTooltip', "Open subagent chat ({0} confirmations needed)", this._confirmationCount));
		} else {
			details.push(this._resolvedTitle ? localize('chat.subagent.openChat.aria', "Open subagent chat: {0}", this._resolvedTitle) : this._action.label);
		}
		if (this._reportedAgentType) {
			details.push(localize('chat.subagent.agentTypeTooltip', "Subagent type: {0}", this._reportedAgentType));
		}
		if (this._reportedModelName) {
			details.push(localize('chat.subagent.modelTooltip', "Model: {0}", this._reportedModelName));
		}
		if (this._displayedToolAccessibleLabel && this._displayedActivityIsTool) {
			details.push(localize('chat.subagent.activeToolTooltip', "Active tool: {0}", this._displayedToolAccessibleLabel));
		}
		return details.join('\n');
	}

	protected override updateTooltip(): void {
		this.updateAriaLabel();
	}

	protected override updateEnabled(): void {
		if (!this.element) {
			return;
		}
		const enabled = this._action.enabled;
		this.element.classList.toggle('disabled', !enabled);
		this.element.classList.toggle('hidden', !enabled);
		this.element.setAttribute('aria-disabled', String(!enabled));
		this.element.setAttribute('aria-hidden', String(!enabled));
	}

	protected override updateAriaLabel(): void {
		if (!this.element) {
			return;
		}
		const label = this._resolvedTitle
			? localize('chat.subagent.openChat.aria', "Open subagent chat: {0}", this._resolvedTitle)
			: this._action.label;
		const status = this._renderedStatus === 'running'
			? localize('chat.subagent.status.working', "Subagent is working")
			: this._renderedStatus === 'waiting'
				? localize('chat.subagent.status.waiting', "Subagent is waiting for input")
				: this._renderedStatus === 'completed'
					? localize('chat.subagent.status.completed', "Subagent completed")
					: undefined;
		const agentType = this._reportedAgentType ? localize('chat.subagent.agentTypeAria', "Subagent type {0}", this._reportedAgentType) : undefined;
		const model = this._reportedModelName ? localize('chat.subagent.modelAria', "Model {0}", this._reportedModelName) : undefined;
		const activeTool = this._displayedToolAccessibleLabel && this._displayedActivityIsTool
			? localize('chat.subagent.activeToolAria', "Active tool {0}", this._displayedToolAccessibleLabel)
			: undefined;
		const duration = this._durationElement?.textContent;
		this.element.setAttribute('aria-label', [label, agentType, status, model, activeTool, duration].filter(Boolean).join('. '));
	}
}

class EditorOpenSubagentChatActionViewItemContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.editorOpenSubagentChatActionViewItem';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		if (environmentService.isSessionsWindow) {
			return;
		}
		const onDidRegister = this._register(new Emitter<void>());
		this._register(actionViewItemService.register(MenuId.ChatSubagentContent, CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(OpenSubagentChatActionViewItem, undefined, action, options, true);
		}, onDidRegister.event));
		onDidRegister.fire();
	}
}
registerWorkbenchContribution2(EditorOpenSubagentChatActionViewItemContribution.ID, EditorOpenSubagentChatActionViewItemContribution, WorkbenchPhase.BlockStartup);
