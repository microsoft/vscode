/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { isMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { IChatInputNoticeFocusTarget } from './chatInputNoticeHost.js';
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from './chatInputNoticeWidget.js';
import { ChatInputStackSlot, setChatInputStackSlot } from './chatInputStack.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationAction, IChatInputNotificationCommandAction, IChatInputNotificationService, isChatInputNotificationApplicableToSession } from './chatInputNotificationService.js';
import './media/chatInputNotificationWidget.css';

const $ = dom.$;

type ChatInputNotificationTelemetryEvent = {
	id: string;
	telemetryId?: string;
};

type ChatInputNotificationTelemetryClassification = {
	id: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the chat input notification.' };
	telemetryId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The feature-provided identifier for the notification message that was shown or dismissed.' };
	owner: 'rfeltis';
	comment: 'Tracks chat input notification visibility and user dismissals.';
};

type ChatInputNotificationActionTelemetryEvent = ChatInputNotificationTelemetryEvent & {
	actionKind: ChatInputNotificationActionKind;
};

type ChatInputNotificationActionTelemetryClassification = {
	id: ChatInputNotificationTelemetryClassification['id'];
	telemetryId?: ChatInputNotificationTelemetryClassification['telemetryId'];
	actionKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The kind of notification action selected by the user.' };
	owner: 'rfeltis';
	comment: 'Tracks actions selected from chat input notifications.';
};

const severityToClass: Record<ChatInputNotificationSeverity, string> = {
	[ChatInputNotificationSeverity.Info]: 'severity-info',
	[ChatInputNotificationSeverity.Warning]: 'severity-warning',
	[ChatInputNotificationSeverity.Error]: 'severity-error',
};

const severityToIcon: Record<ChatInputNotificationSeverity, ThemeIcon> = {
	[ChatInputNotificationSeverity.Info]: Codicon.info,
	[ChatInputNotificationSeverity.Warning]: Codicon.warning,
	[ChatInputNotificationSeverity.Error]: Codicon.error,
};

/** Input-local capabilities used to filter and execute semantic notification actions. */
export interface IChatInputNotificationDelegate {
	readonly modelTargetChatSessionType?: IObservable<string | undefined>;
	readonly sessionResource?: IObservable<URI | undefined>;
	readonly deferredNotificationsEnabled?: IObservable<boolean>;
	readonly openModelPicker?: () => void;
	/** Returns false to open this input's model picker as a fallback. */
	readonly switchToModel?: (modelIdentifier: string) => boolean;
	/**
	 * Reports whether a notification is rendered. `focusTarget` is the widget
	 * itself, so a host can route notice-focus commands into it while it shows.
	 */
	readonly onDidChangeVisibility?: (visible: boolean, focusTarget: IChatInputNoticeFocusTarget) => void;
	/**
	 * Hands focus back to the input. Called when a notification that had keyboard
	 * focus goes away, so focus is not stranded on `<body>`.
	 */
	readonly focusInput?: () => void;
}

/**
 * Widget that renders a single notification banner above the chat input area.
 * Subscribes to {@link IChatInputNotificationService} and shows the highest-severity
 * active notification with severity-colored borders, action buttons, and a dismiss button.
 */
export class ChatInputNotificationWidget extends Disposable implements IChatInputNoticeFocusTarget {

	private readonly _notice: ChatInputNoticeWidget;

	get domNode(): HTMLElement {
		return this._notice.domNode;
	}

	private readonly _contentDisposables = this._register(new DisposableStore());
	private _lastShownTelemetryData: ChatInputNotificationTelemetryEvent | undefined;
	private _modelTargetChatSessionType: string | undefined;
	private _sessionResource: URI | undefined;
	private _deferredNotificationsEnabled = true;
	private _visible = false;
	private _slot: HTMLElement | undefined;

	constructor(
		private readonly _delegate: IChatInputNotificationDelegate | undefined,
		@IChatInputNotificationService private readonly _notificationService: IChatInputNotificationService,
		@ICommandService private readonly _commandService: ICommandService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
		@IHoverService private readonly _hoverService: IHoverService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// Built detached: the input part parents this widget itself, into the lane
		// it lays out above the input.
		this._notice = this._register(new ChatInputNoticeWidget({
			variant: ChatInputNoticeVariant.Notification,
			className: 'chat-input-notification-widget',
			ariaRoleDescription: localize('chatInputNotificationRoleDescription', "notification"),
		}));
		this._notice.setVisible(false);

		this._register(this._notificationService.onDidChange(() => this._render()));
		this._register(autorun(reader => {
			this._modelTargetChatSessionType = this._delegate?.modelTargetChatSessionType?.read(reader);
			this._sessionResource = this._delegate?.sessionResource?.read(reader);
			this._deferredNotificationsEnabled = this._delegate?.deferredNotificationsEnabled?.read(reader) ?? true;
			this._render();
		}));
	}

	private _render(): void {
		// Tearing the content down would strand keyboard focus on <body>, which also
		// drops the context keys the chat keybindings depend on. Hand it back to the
		// input instead, the same way an onboarding card does when it stands down.
		const hadFocus = this.hasFocus();
		this._contentDisposables.clear();
		dom.clearNode(this.domNode);
		this.domNode.classList.remove(...Object.values(severityToClass));

		const notification = this._notificationService.getActiveNotification(n => this._matchesSession(n));
		this._setVisible(!!notification);
		// Announce what this chat input actually renders, so session-scoped
		// notifications are only spoken in a matching session (de-duped by the service).
		this._notificationService.announceRendered(notification);
		if (!notification) {
			setChatInputStackSlot(this._slot, ChatInputStackSlot.Empty);
			this._lastShownTelemetryData = undefined;
			if (hadFocus) {
				this._delegate?.focusInput?.();
			}
			return;
		}

		setChatInputStackSlot(this._slot, ChatInputStackSlot.Docked);
		this._renderNotification(notification);
		this._logShownTelemetry(notification);
		if (hadFocus) {
			// The region is rebuilt on every render; keep focus inside it.
			this.focus();
		}
	}

	private _setVisible(visible: boolean): void {
		if (this._visible === visible) {
			return;
		}

		this._visible = visible;
		this._notice.setVisible(visible);
		this._delegate?.onDidChangeVisibility?.(visible, this);
	}

	hasFocus(): boolean {
		return this._notice.hasFocus();
	}

	/**
	 * Add the notification to its slot and report what the slot is showing.
	 *
	 * The widget is built detached and renders in its constructor, so an already
	 * active notification has no slot to report to at that point. Owners add it
	 * through here so the slot cannot end up marked empty while it has content.
	 */
	attachTo(slot: HTMLElement): void {
		this._slot = slot;
		slot.appendChild(this.domNode);
		setChatInputStackSlot(slot, this._visible ? ChatInputStackSlot.Docked : ChatInputStackSlot.Empty);
	}

	focus(): void {
		this._notice.focus();
	}

	private _matchesSession(notification: IChatInputNotification): boolean {
		return (!notification.deferForNewUsers || this._deferredNotificationsEnabled)
			&& isChatInputNotificationApplicableToSession(notification, this._modelTargetChatSessionType, this._sessionResource);
	}

	private _renderNotification(notification: IChatInputNotification): void {
		const container = this.domNode;
		container.classList.add(severityToClass[notification.severity]);

		// Header row: icon + title + mute + dismiss
		const headerRow = dom.append(container, $('.chat-input-notification-header'));

		// Severity icon
		const iconElement = dom.append(headerRow, $('.chat-input-notification-icon'));
		iconElement.appendChild(dom.$(ThemeIcon.asCSSSelector(severityToIcon[notification.severity])));

		// Title
		const titleElement = dom.append(headerRow, $('.chat-input-notification-title'));
		if (isMarkdownString(notification.message)) {
			const rendered = this._contentDisposables.add(this._markdownRendererService.render(notification.message));
			rendered.element.classList.add('chat-input-notification-title-markdown');
			titleElement.appendChild(rendered.element);
		} else {
			titleElement.textContent = notification.message;
		}
		const ariaTitle = isMarkdownString(notification.message) ? notification.message.value : notification.message;
		// Names the focusable region: `aria-roledescription` alone would have focus
		// land on something announced only as "notification".
		this._notice.setAriaLabel(ariaTitle);

		if (notification.mute) {
			const mute = notification.mute;

			// Defer to a microtask for the same reason as the dismiss button:
			// the command synchronously tears down the notification, and the
			// resulting re-render must happen after the click has propagated.
			const muteButton = this._notice.addAction({
				ariaLabel: mute.tooltip,
				icon: Codicon.bellSlash,
				parent: headerRow,
				store: this._contentDisposables,
				onActivate: () => queueMicrotask(() => {
					this._telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
						id: mute.commandId,
						from: 'chatInputNotification',
					});
					this._commandService.executeCommand(mute.commandId, ...(mute.commandArgs ?? []));
				}),
			});
			this._contentDisposables.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate('element'), muteButton, mute.tooltip));
		}

		// Dismiss button (in header row, pushed to the right)
		if (notification.dismissible) {
			// Defer the dismiss to a microtask so the synchronous re-render
			// (which clears all children of the widget) happens after the
			// browser has finished propagating the click event. Otherwise
			// blur handlers fired by removing the button from focus can
			// move/remove nodes that `clearNode` then trips over.
			this._notice.addDismissAction({
				className: 'chat-input-notification-dismiss',
				ariaLabel: localize('dismissNotification', "Dismiss notification"),
				parent: headerRow,
				store: this._contentDisposables,
				onActivate: () => queueMicrotask(() => {
					this._telemetryService.publicLog2<ChatInputNotificationTelemetryEvent, ChatInputNotificationTelemetryClassification>('chatInputNotificationDismissed', this._getTelemetryData(notification));
					this._notificationService.dismissNotification(notification.id);
				}),
			});
		}

		// Body row: description + actions on the same line
		const actions = notification.actions.filter(action => this._supportsAction(action));
		const hasBody = notification.description || actions.length > 0;
		if (hasBody) {
			const bodyRow = dom.append(container, $('.chat-input-notification-body'));

			if (notification.description) {
				const descriptionElement = dom.append(bodyRow, $('.chat-input-notification-description'));
				if (isMarkdownString(notification.description)) {
					const rendered = this._contentDisposables.add(this._markdownRendererService.render(notification.description));
					rendered.element.classList.add('chat-input-notification-description-markdown');
					descriptionElement.appendChild(rendered.element);
				} else {
					descriptionElement.textContent = notification.description;
				}
			}

			if (actions.length > 0) {
				const actionsContainer = dom.append(bodyRow, $('.chat-input-notification-actions'));

				for (let i = 0; i < actions.length; i++) {
					const action = actions[i];
					const isLast = i === actions.length - 1;

					const button = this._contentDisposables.add(new Button(actionsContainer, {
						...defaultButtonStyles,
						...(!isLast ? {
							buttonBackground: undefined,
							buttonHoverBackground: undefined,
							buttonForeground: undefined,
							buttonSecondaryBackground: undefined,
							buttonSecondaryHoverBackground: undefined,
							buttonSecondaryForeground: undefined,
							buttonSecondaryBorder: undefined,
						} : {}),
						supportIcons: true,
						secondary: !isLast,
					}));
					button.element.classList.add('chat-input-notification-action-button');
					button.label = action.label;
					button.element.ariaLabel = `${ariaTitle} ${action.label}`;

					this._contentDisposables.add(button.onDidClick(() => {
						void this._executeAction(notification, action);
					}));
				}
			}
		}
	}

	private _supportsAction(action: IChatInputNotificationAction): boolean {
		switch (action.kind) {
			case ChatInputNotificationActionKind.Command:
				return true;
			case ChatInputNotificationActionKind.OpenModelPicker:
				return !!this._delegate?.openModelPicker;
			case ChatInputNotificationActionKind.SwitchToModel:
				return !!this._delegate?.switchToModel;
		}
	}

	private async _executeAction(notification: IChatInputNotification, action: IChatInputNotificationAction): Promise<void> {
		this._telemetryService.publicLog2<ChatInputNotificationActionTelemetryEvent, ChatInputNotificationActionTelemetryClassification>('chatInputNotificationAction', {
			...this._getTelemetryData(notification),
			actionKind: action.kind,
		});
		switch (action.kind) {
			case ChatInputNotificationActionKind.Command:
				try {
					await this._executeCommandAction(action);
				} catch (error) {
					this._logActionError(error);
				}
				break;
			case ChatInputNotificationActionKind.OpenModelPicker:
				this._openModelPicker();
				break;
			case ChatInputNotificationActionKind.SwitchToModel:
				this._switchToModel(action.modelIdentifier);
				break;
		}
		if (!action.keepOpen) {
			this._notificationService.dismissNotification(notification.id);
		}
	}

	private _switchToModel(modelIdentifier: string): void {
		let switched = false;
		try {
			switched = this._delegate?.switchToModel?.(modelIdentifier) ?? false;
		} catch (error) {
			this._logActionError(error);
		}
		if (!switched) {
			this._openModelPicker();
		}
	}

	private _openModelPicker(): void {
		try {
			this._delegate?.openModelPicker?.();
		} catch (error) {
			this._logActionError(error);
		}
	}

	private _logActionError(error: unknown): void {
		this._logService.error('[ChatInputNotificationWidget] Failed to execute notification action', error);
	}

	private async _executeCommandAction(action: IChatInputNotificationCommandAction): Promise<void> {
		this._telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
			id: action.commandId,
			from: 'chatInputNotification',
		});
		await this._commandService.executeCommand(action.commandId, ...(action.commandArgs ?? []));
	}

	private _logShownTelemetry(notification: IChatInputNotification): void {
		const data = this._getTelemetryData(notification);
		if (this._lastShownTelemetryData?.id === data.id && this._lastShownTelemetryData.telemetryId === data.telemetryId) {
			return;
		}
		this._lastShownTelemetryData = data;
		this._telemetryService.publicLog2<ChatInputNotificationTelemetryEvent, ChatInputNotificationTelemetryClassification>('chatInputNotificationShown', data);
	}

	private _getTelemetryData(notification: IChatInputNotification): ChatInputNotificationTelemetryEvent {
		return {
			id: notification.id,
			telemetryId: notification.telemetryId,
		};
	}
}
