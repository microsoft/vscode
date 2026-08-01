/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/openSubagentChat.css';
import { $, addDisposableListener, EventType, WindowIntervalTimer } from '../../../../../base/browser/dom.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { createPixelSpinner } from '../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, MenuItemAction, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { parseChatUri, parseSubagentSessionUri } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID } from '../../../../../workbench/contrib/chat/common/constants.js';
import { formatElapsedTime } from '../../../../../workbench/contrib/chat/common/chatProgressFormatting.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { renderFileWidgets } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatInlineAnchorWidget.js';
import { IChatMarkdownAnchorService } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat, SessionStatus } from '../../../../services/sessions/common/session.js';

// "Open Subagent" affordance for agent host worker (subagent) chats.
//
// The chat widget renders the inline subagent block in the lead chat's
// transcript and anchors the `MenuId.ChatSubagentContent` menu in its header,
// forwarding the subagent's chat resource (a URI string) as the action context.
// The widget is provider-agnostic and lives in a lower layer, so it cannot
// resolve that resource to an Agents-window tab itself. This action is
// contributed by the AGENT HOST PROVIDER — which owns the subagent chat URI
// format (see `parseChatUri`/`parseSubagentSessionUri`) — so parsing those URIs
// and mapping them to a surfaced peer chat is a natural provider concern. It is
// rendered as a pill and activates the matching tab in the active session.

/**
 * Recovers the surfaced peer chat's chatId (e.g. `subagent/<toolCallId>`) from a
 * subagent's backend chat resource. The resource arrives in one of two canonical
 * forms — a live AHP chat URI or a restored subagent session URI — each with its
 * own inverse parser; the surfaced tab's chatId is `subagent/<toolCallId>` in
 * both cases.
 */
function chatIdFromResource(resource: string): string | undefined {
	// Live AHP chat URI: `ahp-chat://subagent/<base64-session>/<toolCallId>`.
	const fromChatUri = parseChatUri(resource)?.chatId;
	if (fromChatUri) {
		return fromChatUri;
	}
	// Restored subagent session URI: `<scheme>:/<parentPath>/subagent/<toolCallId>`.
	const fromSessionUri = parseSubagentSessionUri(resource);
	return fromSessionUri ? `subagent/${fromSessionUri.toolCallId}` : undefined;
}

function matchesResource(chat: IChat, resource: string, chatId: string | undefined): boolean {
	if (chat.resource.toString() === resource) {
		return true;
	}
	return !!chatId && chat.resource.fragment === chatId;
}

/**
 * The owning session's id path (e.g. `/<sessionId>`) for a subagent chat
 * resource, recovered from whichever canonical form it takes. The UI session
 * resource and the backend session URI differ only in scheme (e.g.
 * `agent-host-copilotcli:/<id>` vs `copilotcli:/<id>`), so the path is a stable
 * cross-form session key. Used to constrain matching to the owning session so a
 * `subagent/<toolCallId>` chatId that collides across visible sessions can't
 * open the wrong tab.
 */
function ownerSessionPath(resource: string): string | undefined {
	const fromChatUri = parseChatUri(resource)?.session;
	if (fromChatUri) {
		try {
			return URI.parse(fromChatUri).path;
		} catch {
			return undefined;
		}
	}
	return parseSubagentSessionUri(resource)?.parentSession.path;
}

/**
 * Finds the surfaced peer chat (and its owning session) for a subagent chat
 * resource across the active + visible sessions, constrained to the owning
 * session when derivable so a `chatId` that collides across visible sessions
 * can't match the wrong tab. Reactive when a {@link IReader} is provided.
 */
function findSubagentChat(sessionsService: ISessionsService, resource: string, reader: IReader | undefined): { readonly session: IActiveSession; readonly chat: IChat } | undefined {
	const chatId = chatIdFromResource(resource);
	const ownerPath = ownerSessionPath(resource);
	const allSessions = [sessionsService.activeSession.read(reader), ...sessionsService.visibleSessions.read(reader)]
		.filter((s): s is IActiveSession => !!s);
	const candidates = ownerPath
		? allSessions.filter(s => s.resource.path === ownerPath)
		: allSessions;
	for (const session of candidates) {
		const chat = session.chats.read(reader).find(c => matchesResource(c, resource, chatId));
		if (chat) {
			return { session, chat };
		}
	}
	return undefined;
}

/**
 * Toolbar context forwarded by the subagent header (`ChatSubagentContentPart`).
 * A bare resource string is also accepted for backwards compatibility.
 */
interface IOpenSubagentChatContext {
	readonly chatResource: string;
	readonly confirmationCount?: number;
	readonly confirmationActive?: boolean;
	readonly startedAt?: number;
	readonly duration?: number;
	readonly modelName?: string;
	readonly activeToolLabel?: string;
	readonly activeToolIcon?: ThemeIcon;
}

function contextChatResource(context: unknown): string | undefined {
	if (typeof context === 'string') {
		return context;
	}
	if (context && typeof context === 'object' && typeof (context as IOpenSubagentChatContext).chatResource === 'string') {
		return (context as IOpenSubagentChatContext).chatResource;
	}
	return undefined;
}

function contextSubagentTiming(context: unknown): { startedAt: number | undefined; duration: number | undefined } {
	if (!context || typeof context !== 'object') {
		return { startedAt: undefined, duration: undefined };
	}
	const value = context as IOpenSubagentChatContext;
	return {
		startedAt: typeof value.startedAt === 'number' && Number.isFinite(value.startedAt) ? value.startedAt : undefined,
		duration: typeof value.duration === 'number' && Number.isFinite(value.duration) ? Math.max(0, value.duration) : undefined,
	};
}

function contextConfirmationCount(context: unknown): number {
	if (!context || typeof context !== 'object') {
		return 0;
	}
	const count = (context as IOpenSubagentChatContext).confirmationCount;
	return typeof count === 'number' && count > 0 ? count : 0;
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

function createOpenSubagentAction(action: IAction): Action {
	const proxy = new Action(action.id, action.label, action.class, false, context => action.run(context));
	proxy.tooltip = action.tooltip;
	return proxy;
}

class OpenSubagentChatAction extends Action2 {
	constructor() {
		super({
			id: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID,
			title: localize2('chat.subagent.openChat', "Open Subagent"),
			icon: Codicon.commentDiscussion,
			// Contextual: invoked from a specific subagent's header toolbar, which
			// forwards that subagent's chat resource. Not a palette command.
			f1: false,
			menu: { id: MenuId.ChatSubagentContent, group: 'navigation' },
		});
	}

	override async run(accessor: ServicesAccessor, context?: string | IOpenSubagentChatContext): Promise<void> {
		const resource = contextChatResource(context);
		if (!resource) {
			return;
		}
		const logService = accessor.get(ILogService);
		const sessionsService = accessor.get(ISessionsService);

		// The pill is clicked from within the lead chat's transcript, so the
		// subagent peer normally lives in the currently active session; the finder
		// falls back to scanning all visible sessions in case the active slot
		// differs.
		const match = findSubagentChat(sessionsService, resource, undefined);
		if (match) {
			await sessionsService.openChat(match.session, match.chat.resource);
			return;
		}

		const active = sessionsService.activeSession.get();
		const available = active?.chats.get().map(c => c.resource.toString()).join(', ') ?? '(none)';
		logService.warn(`[Sessions] Cannot open subagent chat for resource '${resource}' (chatId='${chatIdFromResource(resource)}'). Available chats: ${available}`);
	}
}
registerAction2(OpenSubagentChatAction);

/**
 * Renders the "Open Subagent" pill as a standalone chip (styled like the chat
 * file/diff pill). See SESSIONS.md and `./media/openSubagentChat.css` for details.
 */
export class OpenSubagentChatActionViewItem extends BaseActionViewItem {

	private readonly _sourceAction: IAction;
	private _resolvedTitle: string | undefined;
	private _confirmationCount = 0;
	private _confirmationActive = false;
	private _status: SessionStatus | undefined;
	private readonly _titleTracker = this._register(new MutableDisposable());
	private readonly _spinner = this._register(new MutableDisposable<DisposableStore>());
	private readonly _durationTimer = this._register(new WindowIntervalTimer());
	private readonly _toolTransition = this._register(new MutableDisposable<DisposableStore>());
	private readonly _activeToolRendered = this._register(new MutableDisposable());
	private readonly _activeToolFileWidgets = this._register(new DisposableStore());
	private _labelElement: HTMLElement | undefined;
	private _modelElement: HTMLElement | undefined;
	private _activeToolElement: HTMLElement | undefined;
	private _activeToolIconElement: HTMLElement | undefined;
	private _activeToolLabelElement: HTMLElement | undefined;
	private _confirmationCountElement: HTMLElement | undefined;
	private _iconElement: HTMLElement | undefined;
	private _durationElement: HTMLElement | undefined;
	private _startedAt: number | undefined;
	private _endedAt: number | undefined;
	private _reportedModelName: string | undefined;
	private _modelName: string | undefined;
	private _displayedToolLabel: string | undefined;
	private _displayedToolIcon: ThemeIcon | undefined;
	private _displayedToolAccessibleLabel: string | undefined;
	private _targetToolLabel: string | undefined;
	private _targetToolIcon: ThemeIcon | undefined;
	private _toolTransitionPhase: 'idle' | 'out' | 'in' = 'idle';

	constructor(
		context: unknown,
		action: IAction,
		options: IActionViewItemOptions,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatMarkdownAnchorService private readonly chatMarkdownAnchorService: IChatMarkdownAnchorService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
	) {
		super(context, createOpenSubagentAction(action), options);
		this._sourceAction = action;
		if (this._action instanceof Action) {
			this._register(this._action);
		}
		this._register(this.accessibilityService.onDidChangeReducedMotion(() => {
			if (this.accessibilityService.isMotionReduced()) {
				this._finishToolTransition();
			}
		}));
		this._register(this.languageModelsService.onDidChangeLanguageModels(() => this._updateTitleTracker()));
	}

	override render(container: HTMLElement): void {
		// Base render wires mouse click on the container; the actionbar wires
		// keyboard (Enter/Space) via `doTrigger`, so both dispatch the action.
		super.render(container);
		container.classList.add('chat-subagent-pill-widget');
		// The ActionBar creates the `<li>` with role="presentation"; mark it as an
		// actionable control for screen readers.
		container.setAttribute('role', 'button');

		this._iconElement = $('span.chat-subagent-pill-icon');
		this._iconElement.appendChild($(`span.chat-subagent-pill-open-icon${ThemeIcon.asCSSSelector(Codicon.commentDiscussion)}`));
		this._labelElement = $('span.chat-subagent-pill-label');
		this._modelElement = $('span.chat-subagent-pill-model.hidden');
		this._confirmationCountElement = $('span.chat-subagent-pill-confirmation-count');
		const pillContent = $('span.chat-subagent-pill-content');
		const pillHeader = $('span.chat-subagent-pill-header');
		this._durationElement = $('span.chat-subagent-pill-duration');
		this._activeToolElement = $('span.chat-subagent-pill-active-tool');
		this._activeToolElement.inert = true;
		const connector = $('span.chat-subagent-pill-active-tool-connector');
		connector.setAttribute('aria-hidden', 'true');
		this._activeToolIconElement = $('span.chat-subagent-pill-active-tool-icon');
		this._activeToolIconElement.setAttribute('aria-hidden', 'true');
		this._activeToolLabelElement = $('.chat-subagent-pill-active-tool-label');
		this._activeToolElement.append(connector, this._activeToolIconElement, this._activeToolLabelElement);
		pillContent.append(this._iconElement, this._labelElement, this._modelElement, this._confirmationCountElement);
		pillHeader.append(pillContent, this._durationElement);
		container.append(pillHeader, this._activeToolElement);
		this._labelElement.textContent = this._labelText();

		this._updateConfirmationCount();
		this._updateDuration();
		this._updateMetadata();
		this._updateTitleTracker();
		this.updateTooltip();
		this.updateEnabled();
	}

	override setActionContext(newContext: unknown): void {
		super.setActionContext(newContext);
		this._updateConfirmationCount();
		this._updateDuration();
		this._updateMetadata();
		this._updateTitleTracker();
	}

	private _updateMetadata(): void {
		const context = this._context && typeof this._context === 'object' ? this._context as IOpenSubagentChatContext : undefined;
		this._reportedModelName = context?.modelName;
		this._setActiveTool(context?.activeToolLabel, context?.activeToolIcon);
	}

	private _setActiveTool(label: string | undefined, icon: ThemeIcon | undefined): void {
		this._targetToolLabel = label;
		this._targetToolIcon = icon;
		if (!this._activeToolElement || !this._activeToolLabelElement) {
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
			this._displayedToolAccessibleLabel = undefined;
			this._renderActiveToolIcon(undefined);
			this.updateTooltip();
			this.updateAriaLabel();
			return;
		}
		if (!this._displayedToolLabel || this.accessibilityService.isMotionReduced()) {
			this._finishToolTransition();
			return;
		}
		this._runToolTransition();
	}

	private _runToolTransition(): void {
		if (!this._activeToolLabelElement || this._toolTransitionPhase !== 'idle'
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
		if (this._activeToolLabelElement) {
			this._activeToolRendered.clear();
			this._activeToolFileWidgets.clear();
			this._activeToolLabelElement.textContent = '';
			const rendered = this.markdownRendererService.render(new MarkdownString(label), undefined, this._activeToolLabelElement);
			renderFileWidgets(rendered.element, this.instantiationService, this.chatMarkdownAnchorService, this._activeToolFileWidgets);
			this._activeToolRendered.value = rendered;
			this._displayedToolLabel = label;
			this._displayedToolIcon = icon;
			this._displayedToolAccessibleLabel = rendered.element.textContent?.replace(/\s+/g, ' ').trim() || label;
			this._renderActiveToolIcon(icon);
			this.updateTooltip();
			this.updateAriaLabel();
		}
	}

	private _renderActiveToolIcon(icon: ThemeIcon | undefined): void {
		if (!this._activeToolIconElement) {
			return;
		}
		this._activeToolIconElement.className = 'chat-subagent-pill-active-tool-icon';
		if (icon) {
			this._activeToolIconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
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

	private _updateConfirmationCount(): void {
		const count = contextConfirmationCount(this._context);
		const confirmationActive = !!(this._context && typeof this._context === 'object' && (this._context as IOpenSubagentChatContext).confirmationActive);
		if (count === this._confirmationCount && confirmationActive === this._confirmationActive) {
			return;
		}
		this._confirmationCount = count;
		this._confirmationActive = confirmationActive;
		this.element?.classList.toggle('chat-subagent-needs-confirmation', count > 0);
		this.element?.classList.toggle('chat-subagent-has-multiple-confirmations', count > 1);
		this.element?.classList.toggle('chat-subagent-confirmation-active', count > 0 && confirmationActive);
		this.element?.classList.toggle('chat-subagent-confirmation-pending', count > 0 && !confirmationActive);
		if (this._confirmationCountElement) {
			this._confirmationCountElement.textContent = String(count);
		}
		this.updateTooltip();
		this.updateAriaLabel();
	}

	/** Tracks the resolved subagent chat's title and active state. */
	private _updateTitleTracker(): void {
		const resource = contextChatResource(this._context);
		if (!resource) {
			this._titleTracker.clear();
			this._setEnabled(false);
			this._setResolvedTitle(undefined);
			this._setModelName(undefined);
			this._setStatus(undefined);
			return;
		}
		this._titleTracker.value = autorun(reader => {
			const match = findSubagentChat(this.sessionsService, resource, reader);
			const chat = match?.chat;
			const parentChat = chat?.origin?.parentChat
				? match?.session.chats.read(reader).find(candidate => isEqual(candidate.resource, chat.origin?.parentChat))
				: undefined;
			const parentModelId = parentChat?.modelId.read(reader);
			const parentModel = parentModelId ? this.languageModelsService.lookupLanguageModel(parentModelId) : undefined;
			this._setEnabled(!!chat);
			this._setResolvedTitle(chat?.title.read(reader) || undefined);
			this._setModelName(shouldShowSubagentModel(this._reportedModelName, parentModelId, parentModel?.name, parentModel?.id) ? this._reportedModelName : undefined);
			this._setStatus(chat?.status.read(reader));
		});
	}

	private _setModelName(modelName: string | undefined): void {
		if (modelName === this._modelName) {
			return;
		}
		this._modelName = modelName;
		if (this._modelElement) {
			this._modelElement.textContent = modelName ?? '';
			this._modelElement.classList.toggle('hidden', !modelName);
		}
		this.updateTooltip();
		this.updateAriaLabel();
	}

	private _setEnabled(enabled: boolean): void {
		this._action.enabled = enabled;
		this._sourceAction.enabled = enabled;
	}

	private _updateDuration(): void {
		this._durationTimer.cancel();
		const timing = contextSubagentTiming(this._context);
		this._startedAt = timing.startedAt;
		this._endedAt = timing.startedAt !== undefined && timing.duration !== undefined ? timing.startedAt + timing.duration : undefined;
		this._updateDurationLabel();
		if (this._startedAt !== undefined && this._endedAt === undefined) {
			this._durationTimer.cancelAndSet(() => this._updateDurationLabel(), 1000);
		}
	}

	private _updateDurationLabel(): void {
		if (!this._durationElement || this._startedAt === undefined) {
			this._durationElement?.classList.add('hidden');
			this.updateAriaLabel();
			return;
		}
		const end = this._endedAt ?? Date.now();
		const duration = formatElapsedTime(Math.max(0, end - this._startedAt));
		this._durationElement.textContent = this._endedAt === undefined
			? localize('chat.subagent.workingDuration', "Working for {0}", duration)
			: localize('chat.subagent.workedDuration', "Worked for {0}", duration);
		this._durationElement.classList.remove('hidden');
		this.updateAriaLabel();
	}

	private _setStatus(status: SessionStatus | undefined): void {
		if (status === this._status) {
			return;
		}
		this._status = status;
		const running = status === SessionStatus.InProgress;
		const waiting = status === SessionStatus.NeedsInput;
		this.element?.classList.toggle('chat-subagent-running', running);
		this.element?.classList.toggle('chat-subagent-waiting', waiting);
		this._spinner.clear();
		if ((running || waiting) && this._iconElement) {
			const store = new DisposableStore();
			const spinner = store.add(createPixelSpinner(this._iconElement, { variant: waiting ? 'ring' : 'grid' }));
			store.add(toDisposable(() => spinner.element.remove()));
			this._spinner.value = store;
		}
		this.updateAriaLabel();
	}

	private _setResolvedTitle(title: string | undefined): void {
		if (title !== this._resolvedTitle) {
			this._resolvedTitle = title;
			if (this._labelElement) {
				this._labelElement.textContent = this._labelText();
			}
			this.updateTooltip();
			this.updateAriaLabel();
		}
	}

	private _labelText(): string {
		return this._resolvedTitle || this._action.label;
	}

	protected override getTooltip(): string | undefined {
		const details: string[] = [];
		if (this._confirmationCount > 0) {
			details.push(this._confirmationCount === 1
				? localize('chat.subagent.openChat.confirmationTooltip', "Open subagent chat (1 confirmation needed)")
				: localize('chat.subagent.openChat.confirmationsTooltip', "Open subagent chat ({0} confirmations needed)", this._confirmationCount));
		} else {
			const actionLabel = this._action.tooltip || this._action.label;
			if (actionLabel) {
				details.push(actionLabel);
			}
		}
		if (this._modelName) {
			details.push(localize('chat.subagent.modelTooltip', "Model: {0}", this._modelName));
		}
		if (this._displayedToolAccessibleLabel) {
			details.push(localize('chat.subagent.activeToolTooltip', "Active tool: {0}", this._displayedToolAccessibleLabel));
		}
		return details.filter(Boolean).join('\n') || undefined;
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
		const openLabel = this._resolvedTitle
			? localize('chat.subagent.openChat.aria', "Open subagent chat: {0}", this._resolvedTitle)
			: this._action.label;
		const statusLabel = this._status === SessionStatus.InProgress
			? localize('chat.subagent.status.working', "Subagent is working")
			: this._status === SessionStatus.NeedsInput
				? localize('chat.subagent.status.waiting', "Subagent is waiting for input")
				: this._status === SessionStatus.Completed
					? localize('chat.subagent.status.completed', "Subagent completed")
					: undefined;
		const confirmationLabel = this._confirmationCount > 0
			? this._confirmationCount === 1
				? localize('chat.subagent.confirmationAria', "1 confirmation needed")
				: localize('chat.subagent.confirmationsAria', "{0} confirmations needed", this._confirmationCount)
			: undefined;
		const modelLabel = this._modelName ? localize('chat.subagent.modelAria', "Model {0}", this._modelName) : undefined;
		const activeToolLabel = this._displayedToolAccessibleLabel ? localize('chat.subagent.activeToolAria', "Active tool {0}", this._displayedToolAccessibleLabel) : undefined;
		const ariaLabel = [openLabel, statusLabel, modelLabel, activeToolLabel, confirmationLabel, this._durationElement?.textContent || undefined].filter(value => !!value).join('. ');
		if (ariaLabel) {
			this.element.setAttribute('aria-label', ariaLabel);
		} else {
			this.element.removeAttribute('aria-label');
		}
	}
}

/**
 * Renders the "Open Subagent" action contributed into the subagent header
 * ({@link MenuId.ChatSubagentContent}) as the same compact secondary-button pill
 * used in the session header meta row. Registered for every agent host session
 * (local and remote): the file is imported for side effect by both the desktop
 * and web Agents-window entry points. Because it is contributed only in the
 * Agents window, the regular chat view's subagent header stays empty.
 */
class OpenSubagentChatActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openSubagentChatActionViewItem';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		// The action view item service only notifies toolbars of a factory via
		// the event passed to register(), not on registration itself. Announce
		// the factory once right after registering so any subagent header toolbar
		// created earlier re-renders and picks up the pill.
		const onDidRegister = this._register(new Emitter<void>());
		this._register(actionViewItemService.register(MenuId.ChatSubagentContent, CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(OpenSubagentChatActionViewItem, undefined, action, options);
		}, onDidRegister.event));
		onDidRegister.fire();
	}
}
registerWorkbenchContribution2(OpenSubagentChatActionViewItemContribution.ID, OpenSubagentChatActionViewItemContribution, WorkbenchPhase.BlockRestore);
