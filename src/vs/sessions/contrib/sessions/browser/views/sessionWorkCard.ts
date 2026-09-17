/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionWorkCard.css';
import { $, addDisposableListener, AnimationFrameScheduler, Dimension, EventType, getActiveElement, getWindow, isAncestorOfActiveElement, isHTMLElement, trackFocus } from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { ResizableHTMLElement } from '../../../../../base/browser/ui/resizable/resizable.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableSignal, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { SessionsBoardCardExpandedContext, SessionsBoardCardFocusContext } from '../../../../common/contextkeys.js';
import { ARCHIVE_WORK_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionReviewService } from '../../../../services/sessions/browser/sessionReviewService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionWorkEntry } from '../../../../services/sessions/common/sessionWorkQuery.js';
import { SessionWorkCardContent, SessionWorkCardContentMode } from './sessionWorkCardContent.js';
import { canStopSessionResponse, SessionResponseStopAction } from '../sessionResponseStopAction.js';

export interface ISessionWorkCardData extends ISessionWorkEntry {
	readonly description: string;
	readonly archive: boolean;
}

export interface ISessionWorkCardSize {
	readonly width: number;
	readonly height: number;
	readonly expanded?: boolean;
}

export const SESSION_WORK_CARD_HEIGHT = 112;
export const SESSION_WORK_CARD_GAP = 8;
const CARD_HEADER_HEIGHT = 40;
const CARD_INPUT_HEIGHT = 72;
const MIN_CONVERSATION_HEIGHT = 40;

const statusColors = {
	input: 'list.warningForeground',
	connection: 'list.warningForeground',
	setup: 'list.warningForeground',
	working: 'textLink.foreground',
	error: 'errorForeground',
	review: 'charts.green',
	idle: 'descriptionForeground',
	archived: 'descriptionForeground',
};

/** A metadata card whose native content exists only while visible and needed. */
export class SessionWorkCard extends Disposable {
	readonly resizable = this._register(new ResizableHTMLElement());
	readonly element = this.resizable.domNode;
	private readonly header = $('.session-work-card-header');
	private readonly icon = $('.session-work-icon');
	private readonly title: Button;
	private readonly contentContainer = $('.session-work-card-transcript');
	private readonly reply = $('.session-work-card-reply');
	private readonly referenceLabel = $('.session-work-card-references');
	private readonly unavailable = $('.session-work-card-unavailable');
	private readonly input: InputBox;
	private readonly send: Button;
	private readonly toolbar: WorkbenchToolBar;
	private readonly stopAction: SessionResponseStopAction;
	private readonly archiveAction: Action;
	private actions: readonly IAction[] = [];
	private canStop = false;
	private canArchive = false;
	private readonly hover = this._register(new MutableDisposable());
	private readonly content = this._register(new MutableDisposable<SessionWorkCardContent>());
	private readonly contentStore = this._register(new DisposableStore());
	private readonly selectionStore = this._register(new DisposableStore());
	private selection: Checkbox | undefined;
	private readonly data = observableValue<ISessionWorkCardData | undefined>(this, undefined);
	private readonly visible = observableValue(this, false);
	private readonly expandedState = observableValue(this, false);
	private readonly sending = observableValue(this, false);
	private readonly pendingResolved = observableValue(this, false);
	private readonly focusChanged = observableValue(this, false);
	private readonly focusedElementChanged = observableSignal(this);
	private readonly scopedInstantiation: IInstantiationService;
	private readonly _onDidResize = this._register(new Emitter<{ size: ISessionWorkCardSize; done: boolean }>());
	readonly onDidResize = this._onDidResize.event;
	private readonly _onDidChangeHeight = this._register(new Emitter<number>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;
	private readonly _onDidChangePreferredHeight = this._register(new Emitter<number>());
	readonly onDidChangePreferredHeight = this._onDidChangePreferredHeight.event;
	private readonly _onDidChangeFocus = this._register(new Emitter<boolean>());
	readonly onDidChangeFocus = this._onDidChangeFocus.event;
	private readonly _onDidRequestOpen = this._register(new Emitter<void>());
	readonly onDidRequestOpen = this._onDidRequestOpen.event;
	private readonly _onDidChangeSelection = this._register(new Emitter<boolean>());
	readonly onDidChangeSelection = this._onDidChangeSelection.event;
	private chat: IChat | undefined;
	private contentChat: IChat | undefined;
	private contentMode: SessionWorkCardContentMode | undefined;
	private preferredContentHeight = 200;
	private pendingInput = false;
	private availableWidth = 0;
	private savedSize: ISessionWorkCardSize | undefined;
	private resizing = false;
	private externallyLaidOut = false;
	private lastPreferredHeight = SESSION_WORK_CARD_HEIGHT;
	private updatingInput = false;
	private focusedContentElement: HTMLElement | undefined;
	private readonly focusCleanup = this._register(new AnimationFrameScheduler(this.element, () => {
		if (this.focusedContentElement?.isConnected && !isAncestorOfActiveElement(this.contentContainer)) {
			this.focusedContentElement = undefined;
		}
	}));

	get expanded(): boolean { return this.expandedState.get(); }
	get hasFocus(): boolean { return isAncestorOfActiveElement(this.element); }
	get hasVisibleContent(): boolean { return this.visible.get() && !!this.content.value; }
	get height(): number { return this.resizable.size.height; }
	get dragHandle(): HTMLElement { return this.header; }

	setLayoutControlled(controlled: boolean): void {
		this.externallyLaidOut = controlled;
		this.resizable.enableSashes(false, !controlled, !controlled, false);
	}

	isDragHandle(target: EventTarget | null): boolean {
		return isHTMLElement(target) && (target === this.header || this.title.element.contains(target) || this.icon.contains(target));
	}

	setSelectionState(selected: boolean | undefined): void {
		if (selected === undefined) {
			this.selection?.domNode.remove();
			this.selectionStore.clear();
			this.selection = undefined;
		} else {
			if (!this.selection) {
				const selection = this.selectionStore.add(new Checkbox('', selected, defaultCheckboxStyles));
				this.selection = selection;
				selection.domNode.classList.add('session-work-card-selection');
				this.header.insertBefore(selection.domNode, this.icon);
				this.selectionStore.add(selection.onChange(() => this._onDidChangeSelection.fire(selection.checked)));
			}
			this.selection.checked = selected;
			this.selection.setTitle(localize('sessionWorkCard.select', "Select {0}", this.data.get()?.session.title.get() ?? ''));
		}
		this.element.classList.toggle('selected', selected === true);
	}

	constructor(
		@IInstantiationService instantiation: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService private readonly hoverService: IHoverService,
		@ISessionInputDraftService private readonly drafts: ISessionInputDraftService,
		@ISessionReviewService private readonly review: ISessionReviewService,
		@ISessionsService private readonly sessions: ISessionsService,
		@INotificationService private readonly notifications: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this.element.classList.add('session-work-card');
		this.element.setAttribute('role', 'group');
		this.header.tabIndex = 0;
		const context = this._register(contextKeyService.createScoped(this.element));
		this.scopedInstantiation = this._register(instantiation.createChild(new ServiceCollection([IContextKeyService, context])));
		const headerContext = this._register(context.createScoped(this.header));
		SessionsBoardCardFocusContext.bindTo(headerContext).set(true);
		const expandedKey = SessionsBoardCardExpandedContext.bindTo(context);
		const actions = $('.session-work-card-actions');
		this.title = this._register(new Button(this.header, {
			...defaultButtonStyles, secondary: true, buttonSecondaryBackground: 'transparent',
			buttonSecondaryHoverBackground: 'transparent', buttonSecondaryBorder: 'transparent',
			buttonSecondaryForeground: asCssVariable('foreground'),
		}));
		this.title.element.classList.add('session-work-title');
		this.title.element.tabIndex = -1;
		this._register(this.title.onDidClick(() => this._onDidRequestOpen.fire()));
		this.header.append(this.icon, this.title.element, actions);
		this.toolbar = this._register(this.scopedInstantiation.createInstance(WorkbenchToolBar, actions, {
			ariaLabel: localize('sessionWorkCard.actions', "Session Card Actions"),
		}));
		this.stopAction = this._register(this.scopedInstantiation.createInstance(SessionResponseStopAction, () => {
			const session = this.data.get()?.session;
			return session && this.chat ? { session, chat: this.chat } : undefined;
		}));
		this.archiveAction = this._register(new Action(ARCHIVE_WORK_SESSION_COMMAND_ID, localize('sessionWorkCard.archive', "Archive Session"), ThemeIcon.asClassName(Codicon.archive), true, () => this.archiveSession()));
		const inputContainer = $('.session-work-card-input');
		this.input = this._register(new InputBox(inputContainer, contextViewService, {
			inputBoxStyles: defaultInputBoxStyles,
			placeholder: localize('sessionWorkCard.reply', "Ask a follow-up..."),
			flexibleHeight: true,
			flexibleMaxHeight: 40,
		}));
		this.send = this._register(new Button(this.reply, {
			...defaultButtonStyles,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryBorder: 'transparent',
			secondary: true,
			ariaLabel: localize('sessionWorkCard.send', "Send Reply"),
			title: localize('sessionWorkCard.send', "Send Reply"),
		}));
		this.send.icon = Codicon.arrowUpCompact;
		this.reply.prepend(inputContainer);
		this.reply.append(this.referenceLabel);
		this.element.append(this.header, this.contentContainer, this.unavailable, this.reply);
		this._register(this.input.onDidChange(inputText => {
			if (!this.updatingInput && this.chat) {
				const draft = this.drafts.getDraft(this.chat.resource).get();
				this.drafts.setDraft(this.chat.resource, { inputText, attachments: draft.attachments });
			}
		}));
		this._register(this.send.onDidClick(() => void this.submit().catch(error => this.notifications.error(error))));
		this._register(addDisposableListener(this.input.inputElement, EventType.KEY_DOWN, event => {
			if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
				event.preventDefault();
				event.stopPropagation();
				void this.submit().catch(error => this.notifications.error(error));
			}
		}));
		for (const node of [this.reply, this.contentContainer, actions]) {
			for (const type of [EventType.MOUSE_DOWN, EventType.CLICK, EventType.DBLCLICK]) {
				this._register(addDisposableListener(node, type, event => event.stopPropagation()));
			}
		}
		this._register(addDisposableListener(this.element, EventType.DRAG_START, event => {
			if (!isHTMLElement(event.target) || !event.target.closest('.session-work-card-header') || event.target.closest('.session-work-card-actions')) {
				event.preventDefault();
				event.stopPropagation();
			}
		}));
		const focus = this._register(trackFocus(this.element));
		this._register(focus.onDidFocus(() => {
			this.focusChanged.set(true, undefined);
			this._onDidChangeFocus.fire(true);
		}));
		this._register(focus.onDidBlur(() => {
			this.focusCleanup.schedule();
			this.focusChanged.set(false, undefined);
			this._onDidChangeFocus.fire(false);
		}));
		this._register(addDisposableListener(this.element, EventType.FOCUS, event => {
			this.focusedContentElement = isHTMLElement(event.target) && this.contentContainer.contains(event.target) ? event.target : undefined;
			this.focusedElementChanged.trigger(undefined);
		}, true));
		this._register(this.resizable.onDidWillResize(() => { this.resizing = true; }));
		this._register(this.resizable.onDidResize(event => {
			if (event.south || event.north) {
				this.expandedState.set(event.dimension.height >= this.compactHeight() + MIN_CONVERSATION_HEIGHT, undefined);
			}
			const size = { width: event.dimension.width, height: event.dimension.height, expanded: this.expanded };
			this.savedSize = size;
			this.layoutContent();
			this._onDidResize.fire({ size, done: event.done });
			if (event.done) {
				this.resizing = false;
				this.updateLayout();
			}
		}));
		this._register(autorun(reader => {
			const data = this.data.read(reader);
			if (!data) { return; }
			this.focusedElementChanged.read(reader);
			const focused = this.focusChanged.read(reader);
			const { session, summary } = data;
			const title = session.title.read(reader);
			this.title.label = title;
			this.selection?.setTitle(localize('sessionWorkCard.select', "Select {0}", title));
			this.header.setAttribute('aria-label', localize('sessionWorkCard.header', "{0}. {1}", title, data.description));
			this.element.setAttribute('aria-label', title);
			this.input.setAriaLabel(localize('sessionWorkCard.inputLabel', "Reply to {0}", title));
			this.hover.value = this.hoverService.setupDelayedHover(this.header, { content: `${title}\n${data.description}` });
			const archived = session.isArchived.read(reader);
			const status = archived ? 'archived' : summary.attention ?? (summary.running ? 'working' : summary.hasResults ? 'review' : 'idle');
			const glyph = status === 'input' || status === 'setup' ? Codicon.question : status === 'error' ? Codicon.error
				: status === 'connection' ? Codicon.debugDisconnect : status === 'working' ? Codicon.sessionInProgress
					: status === 'review' ? Codicon.gitPullRequest : status === 'archived' ? Codicon.archive : Codicon.circleSmallFilled;
			const icon = renderIcon(glyph);
			icon.style.color = asCssVariable(statusColors[status]);
			icon.setAttribute('aria-hidden', 'true');
			this.icon.dataset.status = status;
			this.icon.replaceChildren(icon);
			const chats = session.chats.read(reader);
			const pendingChat = chats.find(chat => chat.status.read(reader) === SessionStatus.NeedsInput && chat.interactivity.read(reader) !== ChatInteractivity.Hidden);
			const active = this.sessions.visibleSessions.read(reader).find(candidate => candidate?.sessionId === session.sessionId);
			const selected = active?.activeChat.read(reader) ?? session.mainChat.read(reader);
			const chat = pendingChat ?? selected;
			this.chat = chat;
			const canStop = canStopSessionResponse(session, chat, reader);
			const canArchive = !archived && session.status.read(reader) !== SessionStatus.Untitled;
			const restoreReplyFocus = this.canStop && !canStop && isAncestorOfActiveElement(actions);
			if (canStop !== this.canStop || canArchive !== this.canArchive) {
				this.canStop = canStop;
				this.canArchive = canArchive;
				this.updateActions();
			}
			const draft = this.drafts.getDraft(chat.resource).read(reader);
			this.updatingInput = true;
			if (this.input.value !== draft.inputText) { this.input.value = draft.inputText; }
			this.updatingInput = false;
			const editable = !archived && chat.interactivity.read(reader) === ChatInteractivity.Full;
			const waiting = editable && !!pendingChat && summary.attention !== 'connection';
			const pending = waiting && !this.pendingResolved.read(reader);
			this.pendingInput = pending;
			this.element.classList.toggle('archive-inspection', data.archive);
			this.reply.hidden = data.archive || !editable || pending && !(focused && isAncestorOfActiveElement(this.reply));
			this.unavailable.hidden = !data.archive && (editable || pending);
			this.unavailable.textContent = data.description;
			this.input.setEnabled(editable && !this.sending.read(reader));
			this.send.enabled = editable && !pending && !this.sending.read(reader) && !!draft.inputText.trim();
			this.referenceLabel.hidden = draft.attachments.length === 0;
			this.referenceLabel.textContent = localize('sessionWorkCard.references', "{0} attached references", draft.attachments.length);
			const expanded = this.expandedState.read(reader);
			expandedKey.set(expanded);
			this.header.setAttribute('aria-expanded', String(expanded));
			this.element.classList.toggle('expanded', expanded);
			const visible = this.visible.read(reader);
			const mode = expanded ? 'conversation' : waiting ? 'pending' : undefined;
			if (visible && mode) {
				if (!this.content.value) {
					this.content.value = this.scopedInstantiation.createInstance(SessionWorkCardContent);
					this.contentContainer.appendChild(this.content.value.element);
					this.contentStore.add(this.content.value.onDidChangeHeight(height => {
						const previousFocus = this.focusedContentElement;
						this.preferredContentHeight = height === 0 ? 0 : Math.max(80, Math.min(320, height));
						this.pendingResolved.set(this.contentMode === 'pending' && height === 0, undefined);
						this.updateLayout();
						const active = getActiveElement();
						if (previousFocus && !previousFocus.isConnected && this.element.isConnected && (!active || active === getWindow(this.element).document.body)) {
							this.focusedContentElement = undefined;
							this.focus();
						}
					}));
				}
				if (this.contentChat !== chat || this.contentMode !== mode) {
					this.contentChat = chat;
					this.contentMode = mode;
					this.pendingResolved.set(false, undefined);
					this.content.value.setInput(session, chat, mode);
				}
			} else if (!focused || !visible || !this.content.value || !isAncestorOfActiveElement(this.content.value.element)) {
				this.contentStore.clear();
				this.content.clear();
				this.contentContainer.replaceChildren();
				this.contentChat = undefined;
				this.contentMode = undefined;
				this.focusedContentElement = undefined;
			}
			this.contentContainer.hidden = !this.content.value;
			this.updateLayout();
			if (restoreReplyFocus) { this.focus(); }
		}));
	}

	update(data: ISessionWorkCardData): void { this.data.set(data, undefined); }
	setActions(actions: readonly IAction[]): void { this.actions = actions; this.updateActions(); }
	private updateActions(): void {
		this.toolbar.setActions(
			[...this.actions.slice(0, 2), ...this.canStop ? [this.stopAction] : this.canArchive ? [this.archiveAction] : []],
			[...this.canStop && this.canArchive ? [this.archiveAction] : [], ...this.actions.slice(2)],
		);
	}
	private async archiveSession(): Promise<void> {
		const session = this.data.get()?.session;
		if (!session) {
			this.notifications.error(localize('sessionWorkCard.archiveUnavailable', "This session is no longer available."));
			return;
		}
		if (session.isArchived.get() || !this.archiveAction.enabled) { return; }
		this.archiveAction.enabled = false;
		try {
			await this.commandService.executeCommand(ARCHIVE_WORK_SESSION_COMMAND_ID, session);
		} catch (error) {
			this.notifications.error(error);
		} finally {
			if (!this._store.isDisposed) { this.archiveAction.enabled = true; }
		}
	}
	setVisible(visible: boolean): void { this.visible.set(visible, undefined); }

	layout(availableWidth: number, size?: ISessionWorkCardSize): void {
		this.availableWidth = Math.max(0, availableWidth);
		if (!this.resizing) {
			this.savedSize = size;
			this.expandedState.set(size?.expanded ?? (!!size && size.height >= SESSION_WORK_CARD_HEIGHT + MIN_CONVERSATION_HEIGHT), undefined);
			this.updateLayout();
		}
	}

	private compactHeight(): number {
		return this.pendingInput || this.contentMode === 'pending'
			? CARD_HEADER_HEIGHT + this.preferredContentHeight + (this.reply.hidden ? 0 : CARD_INPUT_HEIGHT)
			: SESSION_WORK_CARD_HEIGHT;
	}

	private updateLayout(): void {
		if (this.resizing) { return; }
		const previous = this.height;
		const width = Math.min(this.availableWidth, this.savedSize?.width ?? this.availableWidth);
		const preferredHeight = this.expanded ? Math.max(SESSION_WORK_CARD_HEIGHT + MIN_CONVERSATION_HEIGHT, this.savedSize?.height ?? 420) : this.compactHeight();
		const height = this.externallyLaidOut && this.savedSize ? this.savedSize.height : preferredHeight;
		this.resizable.minSize = new Dimension(Math.min(280, this.availableWidth), SESSION_WORK_CARD_HEIGHT);
		this.resizable.maxSize = new Dimension(this.availableWidth, Number.MAX_SAFE_INTEGER);
		this.resizable.preferredSize = new Dimension(this.availableWidth, SESSION_WORK_CARD_HEIGHT);
		this.resizable.enableSashes(false, !this.externallyLaidOut, !this.externallyLaidOut, false);
		this.resizable.layout(height, width);
		this.layoutContent();
		if (previous !== this.height) { this._onDidChangeHeight.fire(this.height); }
		if (this.lastPreferredHeight !== preferredHeight) {
			this.lastPreferredHeight = preferredHeight;
			this._onDidChangePreferredHeight.fire(preferredHeight);
		}
	}

	private layoutContent(): void {
		this.input.layout();
		const height = Math.max(0, this.height - CARD_HEADER_HEIGHT - (this.reply.hidden ? 0 : CARD_INPUT_HEIGHT));
		this.contentContainer.style.height = `${height}px`;
		this.content.value?.layout(Math.max(0, this.resizable.size.width - 16), height);
	}

	private async submit(): Promise<void> {
		const data = this.data.get();
		const chat = this.chat;
		if (!data || !chat || this.sending.get() || this.pendingInput) { return; }
		const draft = this.drafts.getDraft(chat.resource).get();
		if (!draft.inputText.trim()) { return; }
		this.sending.set(true, undefined);
		try {
			if (await this.review.send(data.session, chat, draft.inputText, draft.attachments)
				&& this.drafts.getDraft(chat.resource).get() === draft) {
				this.drafts.setDraft(chat.resource, { inputText: '', attachments: [] });
			}
		} finally {
			if (!this._store.isDisposed) { this.sending.set(false, undefined); }
		}
	}

	focus(): void {
		if (!this.reply.hidden) { this.input.focus(); }
		else if (this.content.value) { this.content.value.focus(); }
		else { this.header.focus(); }
	}

	getAccessibleContent(): string {
		const data = this.data.get();
		if (!data) { return ''; }
		const content = this.content.value?.getAccessibleContent();
		const draft = this.chat && this.drafts.getDraft(this.chat.resource).get();
		return [
			data.session.title.get(),
			data.description,
			content,
			draft?.inputText ? localize('sessionWorkCard.accessibleDraft', "Unsent reply: {0}", draft.inputText) : undefined,
			draft?.attachments.length ? localize('sessionWorkCard.accessibleReferences', "Reply references: {0}", draft.attachments.map(attachment => attachment.name).join(', ')) : undefined,
		].filter(Boolean).join('\n');
	}
}
