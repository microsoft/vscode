/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/openSubagentChat.css';
import { $, addDisposableListener, EventType, WindowIntervalTimer } from '../../../../../../base/browser/dom.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { createPixelSpinner } from '../../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { Action, IAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IReference, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuId, MenuItemAction, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { parseChatUri, parseSubagentSessionUri, SessionState, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID } from '../../../common/constants.js';
import { formatElapsedTime } from '../../../common/chatProgressFormatting.js';
import { ChatContentMarkdownRenderer } from '../../widget/chatContentMarkdownRenderer.js';
import { renderFileWidgets } from '../../widget/chatContentParts/chatInlineAnchorWidget.js';
import { IChatMarkdownAnchorService } from '../../widget/chatContentParts/chatMarkdownAnchorService.js';
import { openSessionByResource } from '../agentSessionsOpener.js';

interface IOpenSubagentChatContext {
	readonly chatResource: string;
	readonly parentSessionResource: string;
	readonly title?: string;
	readonly isActive?: boolean;
	readonly confirmationCount?: number;
	readonly confirmationActive?: boolean;
	readonly startedAt?: number;
	readonly duration?: number;
	readonly modelName?: string;
	readonly activeToolLabel?: string;
	readonly activeToolIcon?: ThemeIcon;
}

function asContext(context: unknown): IOpenSubagentChatContext | undefined {
	if (!context || typeof context !== 'object') {
		return undefined;
	}
	const value = context as IOpenSubagentChatContext;
	return typeof value.chatResource === 'string' && typeof value.parentSessionResource === 'string' ? value : undefined;
}

function chatIdFromResource(resource: string): string | undefined {
	const restored = parseSubagentSessionUri(resource);
	return parseChatUri(resource)?.chatId ?? (restored ? `subagent/${restored.toolCallId}` : undefined);
}

function peerResource(context: IOpenSubagentChatContext): URI | undefined {
	const chatId = chatIdFromResource(context.chatResource);
	if (!chatId) {
		return undefined;
	}
	try {
		return URI.parse(context.parentSessionResource).with({ fragment: chatId });
	} catch {
		return undefined;
	}
}

function createOpenSubagentAction(action: IAction): Action {
	const proxy = new Action(action.id, action.label, action.class, false, context => action.run(context));
	proxy.tooltip = action.tooltip;
	return proxy;
}

class OpenSubagentChatActionViewItem extends BaseActionViewItem {

	private readonly _spinner = this._register(new MutableDisposable<DisposableStore>());
	private readonly _durationTimer = this._register(new WindowIntervalTimer());
	private readonly _sessionSubscription = this._register(new MutableDisposable<IReference<IAgentSubscription<SessionState>>>());
	private readonly _sessionSubscriptionListener = this._register(new MutableDisposable());
	private readonly _toolTransition = this._register(new MutableDisposable<DisposableStore>());
	private readonly _activeToolRendered = this._register(new MutableDisposable());
	private readonly _activeToolFileWidgets = this._register(new DisposableStore());
	private _subscriptionKey: string | undefined;
	private _latestContext: IOpenSubagentChatContext | undefined;
	private _iconElement: HTMLElement | undefined;
	private _labelElement: HTMLElement | undefined;
	private _modelElement: HTMLElement | undefined;
	private _toolElement: HTMLElement | undefined;
	private _toolIconElement: HTMLElement | undefined;
	private _toolLabelElement: HTMLElement | undefined;
	private _confirmationElement: HTMLElement | undefined;
	private _durationElement: HTMLElement | undefined;
	private _displayedToolLabel: string | undefined;
	private _displayedToolIcon: ThemeIcon | undefined;
	private _displayedToolAccessibleLabel: string | undefined;
	private _targetToolLabel: string | undefined;
	private _targetToolIcon: ThemeIcon | undefined;
	private _toolTransitionPhase: 'idle' | 'out' | 'in' = 'idle';
	private readonly chatContentMarkdownRenderer: ChatContentMarkdownRenderer;

	constructor(
		context: unknown,
		action: IAction,
		options: IActionViewItemOptions,
		@IAgentHostConnectionsService private readonly agentHostConnectionsService: IAgentHostConnectionsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatMarkdownAnchorService private readonly chatMarkdownAnchorService: IChatMarkdownAnchorService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super(context, createOpenSubagentAction(action), options);
		if (this._action instanceof Action) {
			this._register(this._action);
		}
		this.chatContentMarkdownRenderer = this.instantiationService.createInstance(ChatContentMarkdownRenderer);
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

		this._iconElement = $('.chat-subagent-pill-icon');
		this._iconElement.appendChild($(`span.chat-subagent-pill-open-icon${ThemeIcon.asCSSSelector(Codicon.commentDiscussion)}`));
		this._labelElement = $('.chat-subagent-pill-label');
		this._modelElement = $('.chat-subagent-pill-model');
		this._confirmationElement = $('.chat-subagent-pill-confirmation-count');
		const content = $('.chat-subagent-pill-content');
		content.append(this._iconElement, this._labelElement, this._modelElement, this._confirmationElement);

		this._durationElement = $('.chat-subagent-pill-duration');
		this._durationElement.setAttribute('aria-hidden', 'true');
		const header = $('.chat-subagent-pill-header');
		header.append(content, this._durationElement);

		this._toolElement = $('.chat-subagent-pill-active-tool');
		this._toolElement.inert = true;
		const connector = $('.chat-subagent-pill-active-tool-connector');
		connector.setAttribute('aria-hidden', 'true');
		this._toolIconElement = $('.chat-subagent-pill-active-tool-icon');
		this._toolIconElement.setAttribute('aria-hidden', 'true');
		this._toolLabelElement = $('.chat-subagent-pill-active-tool-label');
		this._toolElement.append(connector, this._toolIconElement, this._toolLabelElement);
		container.append(header, this._toolElement);
		this._updateContext();
	}

	override setActionContext(newContext: unknown): void {
		super.setActionContext(newContext);
		this._updateContext();
	}

	private _updateContext(): void {
		const context = asContext(this._context);
		this._latestContext = context;
		const parentResource = context ? URI.parse(context.parentSessionResource) : undefined;
		const resolution = parentResource ? this.agentHostConnectionsService.resolveSessionResource(parentResource) : undefined;
		const subscriptionKey = resolution ? `${resolution.connection.clientId}:${resolution.backendSession.toString()}` : undefined;
		if (subscriptionKey !== this._subscriptionKey) {
			this._subscriptionKey = subscriptionKey;
			this._sessionSubscriptionListener.clear();
			this._sessionSubscription.clear();
			if (resolution) {
				const reference = resolution.connection.getSubscription(StateComponents.Session, resolution.backendSession, 'OpenSubagentChatActionViewItem');
				this._sessionSubscription.value = reference;
				this._sessionSubscriptionListener.value = reference.object.onDidChange(() => this._renderLatestContext());
			}
		}
		this._renderLatestContext();
	}

	private _renderLatestContext(): void {
		const context = this._latestContext;
		const resource = context ? peerResource(context) : undefined;
		const chatId = context ? chatIdFromResource(context.chatResource) : undefined;
		const value = this._sessionSubscription.value?.object.value;
		const canOpen = !!resource && !!chatId && !!value && !(value instanceof Error)
			&& value.chats.some(chat => parseChatUri(chat.resource)?.chatId === chatId);
		this._action.enabled = canOpen;
		this.element?.classList.toggle('hidden', !canOpen);
		this.element?.setAttribute('aria-hidden', String(!canOpen));
		if (!context) {
			return;
		}

		const confirmationCount = context.confirmationCount ?? 0;
		const waiting = confirmationCount > 0;
		this.element?.classList.toggle('chat-subagent-running', !!context.isActive && !waiting);
		this.element?.classList.toggle('chat-subagent-waiting', waiting);
		this.element?.classList.toggle('chat-subagent-confirmation-active', waiting && !!context.confirmationActive);
		this.element?.classList.toggle('chat-subagent-confirmation-pending', waiting && !context.confirmationActive);
		this.element?.classList.toggle('chat-subagent-has-multiple-confirmations', confirmationCount > 1);

		if (this._labelElement) {
			this._labelElement.textContent = context.title || this._action.label;
		}
		if (this._modelElement) {
			this._modelElement.textContent = context.modelName ?? '';
			this._modelElement.classList.toggle('hidden', !context.modelName);
		}
		if (this._confirmationElement) {
			this._confirmationElement.textContent = String(confirmationCount);
		}
		this._setActiveTool(context.activeToolLabel, context.activeToolIcon);

		this._spinner.clear();
		if (this._iconElement && (context.isActive || waiting)) {
			const store = new DisposableStore();
			const spinner = store.add(createPixelSpinner(this._iconElement, { variant: waiting ? 'ring' : 'grid' }));
			store.add(toDisposable(() => spinner.element.remove()));
			this._spinner.value = store;
		}
		this._updateDuration(context);
		this.updateAriaLabel();
		this.updateTooltip();
	}

	private _setActiveTool(label: string | undefined, icon: ThemeIcon | undefined): void {
		this._targetToolLabel = label;
		this._targetToolIcon = icon;
		if (!this._toolElement || !this._toolLabelElement) {
			return;
		}
		this._toolElement.classList.toggle('hidden', !label);
		if (!label) {
			this._toolTransition.clear();
			this._toolTransitionPhase = 'idle';
			this._clearToolTransitionClasses();
			this._activeToolRendered.clear();
			this._activeToolFileWidgets.clear();
			this._toolLabelElement.textContent = '';
			this._displayedToolLabel = undefined;
			this._displayedToolIcon = undefined;
			this._displayedToolAccessibleLabel = undefined;
			this._renderActiveToolIcon(undefined);
			return;
		}
		if (!this._displayedToolLabel || this.accessibilityService.isMotionReduced()) {
			this._finishToolTransition();
			return;
		}
		this._runToolTransition();
	}

	private _runToolTransition(): void {
		if (!this._toolLabelElement || this._toolTransitionPhase !== 'idle'
			|| (this._targetToolLabel === this._displayedToolLabel && this._targetToolIcon?.id === this._displayedToolIcon?.id)) {
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
			this._setDisplayedTool(this._targetToolLabel ?? '', this._targetToolIcon);
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
			this._setDisplayedTool(this._targetToolLabel, this._targetToolIcon);
		}
	}

	private _setDisplayedTool(label: string, icon: ThemeIcon | undefined): void {
		if (!this._toolLabelElement) {
			return;
		}
		this._activeToolRendered.clear();
		this._activeToolFileWidgets.clear();
		this._toolLabelElement.textContent = '';
		const rendered = this.chatContentMarkdownRenderer.render(new MarkdownString(label), undefined, this._toolLabelElement);
		renderFileWidgets(rendered.element, this.instantiationService, this.chatMarkdownAnchorService, this._activeToolFileWidgets);
		this._activeToolRendered.value = rendered;
		this._displayedToolLabel = label;
		this._displayedToolIcon = icon;
		this._displayedToolAccessibleLabel = rendered.element.textContent?.replace(/\s+/g, ' ').trim() || label;
		this._renderActiveToolIcon(icon);
		this.updateTooltip();
		this.updateAriaLabel();
	}

	private _renderActiveToolIcon(icon: ThemeIcon | undefined): void {
		if (!this._toolIconElement) {
			return;
		}
		this._toolIconElement.className = 'chat-subagent-pill-active-tool-icon';
		if (icon) {
			this._toolIconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
		}
	}

	private _clearToolTransitionClasses(): void {
		this._toolLabelElement?.classList.remove('chat-subagent-tool-fade-in', 'chat-subagent-tool-fade-out');
	}

	private _restartToolTransition(className: string): boolean {
		if (!this._toolLabelElement) {
			return false;
		}
		this._toolTransition.clear();
		this._clearToolTransitionClasses();
		const transition = new DisposableStore();
		const complete = (event: AnimationEvent) => {
			if (event.target === this._toolLabelElement) {
				this._completeToolTransition();
			}
		};
		transition.add(addDisposableListener(this._toolLabelElement, EventType.ANIMATION_END, complete));
		transition.add(addDisposableListener(this._toolLabelElement, 'animationcancel', complete));
		this._toolTransition.value = transition;
		void this._toolLabelElement.offsetWidth;
		this._toolLabelElement.classList.add(className);
		if (this._toolLabelElement.getAnimations().length === 0) {
			this._toolTransition.clear();
			this._clearToolTransitionClasses();
			return false;
		}
		return true;
	}

	private _updateDuration(context: IOpenSubagentChatContext): void {
		this._durationTimer.cancel();
		const update = () => {
			if (!this._durationElement || context.startedAt === undefined) {
				this._durationElement?.classList.add('hidden');
				return;
			}
			const end = context.duration === undefined ? Date.now() : context.startedAt + context.duration;
			const duration = formatElapsedTime(Math.max(0, end - context.startedAt));
			this._durationElement.textContent = context.duration === undefined
				? localize('chat.subagent.workingDuration', "Working for {0}", duration)
				: localize('chat.subagent.workedDuration', "Worked for {0}", duration);
			this._durationElement.classList.remove('hidden');
			this.updateAriaLabel();
		};
		update();
		if (context.startedAt !== undefined && context.duration === undefined) {
			this._durationTimer.cancelAndSet(update, 1000);
		}
	}

	protected override updateAriaLabel(): void {
		const context = this._latestContext;
		if (!this.element || !context) {
			return;
		}
		const confirmationCount = context.confirmationCount ?? 0;
		const title = context.title
			? localize('chat.subagent.openChat.aria', "Open subagent chat: {0}", context.title)
			: this._action.label;
		const confirmation = confirmationCount === 1
			? localize('chat.subagent.confirmationAria', "1 confirmation needed")
			: confirmationCount > 1
				? localize('chat.subagent.confirmationsAria', "{0} confirmations needed", confirmationCount)
				: undefined;
		const parts = [title, context.modelName ? localize('chat.subagent.modelAria', "Model {0}", context.modelName) : undefined, this._displayedToolAccessibleLabel ? localize('chat.subagent.activeToolAria', "Active tool {0}", this._displayedToolAccessibleLabel) : undefined, confirmation, this._durationElement?.textContent].filter(Boolean);
		this.element.setAttribute('aria-label', parts.join('. '));
	}

	protected override getTooltip(): string | undefined {
		const context = this._latestContext;
		if (!context) {
			return this._action.tooltip || this._action.label;
		}
		const details = [context.title || this._action.tooltip || this._action.label];
		if (context.modelName) {
			details.push(localize('chat.subagent.modelTooltip', "Model: {0}", context.modelName));
		}
		if (this._displayedToolAccessibleLabel) {
			details.push(localize('chat.subagent.activeToolTooltip', "Active tool: {0}", this._displayedToolAccessibleLabel));
		}
		return details.join('\n');
	}
}

class OpenSubagentChatContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openSubagentChat';

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();
		if (environmentService.isSessionsWindow) {
			return;
		}

		this._register(CommandsRegistry.registerCommand(CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, async (accessor, rawContext: unknown) => {
			const context = asContext(rawContext);
			const resource = context ? peerResource(context) : undefined;
			if (!context || !resource) {
				accessor.get(ILogService).warn('[AgentHost] Cannot open subagent chat: invalid action context');
				return;
			}
			await openSessionByResource(accessor, resource, {
				forceEditor: true,
				editorOptions: {
					revealIfOpened: true,
				},
			});
		}));
		this._register(MenuRegistry.appendMenuItem(MenuId.ChatSubagentContent, {
			group: 'navigation',
			command: {
				id: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID,
				title: localize('chat.subagent.openChat', "Open Subagent"),
				icon: Codicon.commentDiscussion,
			},
		}));
		const onDidRegisterViewItem = this._register(new Emitter<void>());
		this._register(actionViewItemService.register(MenuId.ChatSubagentContent, CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(OpenSubagentChatActionViewItem, undefined, action, options as IActionViewItemOptions);
		}, onDidRegisterViewItem.event));
		onDidRegisterViewItem.fire();
	}
}

registerWorkbenchContribution2(OpenSubagentChatContribution.ID, OpenSubagentChatContribution, WorkbenchPhase.BlockRestore);
