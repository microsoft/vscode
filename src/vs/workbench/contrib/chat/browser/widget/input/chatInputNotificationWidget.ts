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
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationAction, IChatInputNotificationCommandAction, IChatInputNotificationService, isChatInputNotificationApplicableToSessionType } from './chatInputNotificationService.js';
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
	readonly openModelPicker?: () => void;
	/** Returns false to open this input's model picker as a fallback. */
	readonly switchToModel?: (modelIdentifier: string) => boolean;
}

/**
 * Widget that renders a single notification banner above the chat input area.
 * Subscribes to {@link IChatInputNotificationService} and shows the highest-severity
 * active notification with severity-colored borders, action buttons, and a dismiss button.
 */
export class ChatInputNotificationWidget extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _contentDisposables = this._register(new DisposableStore());
	private _lastShownTelemetryData: ChatInputNotificationTelemetryEvent | undefined;
	private _modelTargetChatSessionType: string | undefined;

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

		this.domNode = $('.chat-input-notification-widget');

		this._register(this._notificationService.onDidChange(() => this._render()));
		this._register(autorun(reader => {
			this._modelTargetChatSessionType = this._delegate?.modelTargetChatSessionType?.read(reader);
			this._render();
		}));
	}

	private _render(): void {
		this._contentDisposables.clear();
		dom.clearNode(this.domNode);

		const notification = this._notificationService.getActiveNotification(n => this._matchesSession(n));
		// Announce what this chat input actually renders, so session-scoped
		// notifications are only spoken in a matching session (de-duped by the service).
		this._notificationService.announceRendered(notification);
		if (!notification) {
			this.domNode.parentElement?.classList.remove('has-notification');
			this._lastShownTelemetryData = undefined;
			return;
		}

		this.domNode.parentElement?.classList.add('has-notification');
		this._renderNotification(notification);
		this._logShownTelemetry(notification);
	}

	private _matchesSession(notification: IChatInputNotification): boolean {
		return isChatInputNotificationApplicableToSessionType(notification, this._modelTargetChatSessionType);
	}

	private _renderNotification(notification: IChatInputNotification): void {
		const container = dom.append(this.domNode, $('.chat-input-notification'));

		// Apply severity class
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

		if (notification.mute) {
			const mute = notification.mute;
			const muteButton = dom.append(headerRow, $('.chat-input-notification-mute'));
			muteButton.appendChild(dom.$(ThemeIcon.asCSSSelector(Codicon.bellSlash)));
			muteButton.tabIndex = 0;
			muteButton.role = 'button';
			muteButton.ariaLabel = mute.tooltip;
			this._contentDisposables.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate('element'), muteButton, mute.tooltip));

			// Defer to a microtask for the same reason as the dismiss button:
			// the command synchronously tears down the notification, and the
			// resulting re-render must happen after the click has propagated.
			const doMute = () => queueMicrotask(() => {
				this._telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
					id: mute.commandId,
					from: 'chatInputNotification',
				});
				this._commandService.executeCommand(mute.commandId, ...(mute.commandArgs ?? []));
			});
			this._contentDisposables.add(dom.addDisposableListener(muteButton, dom.EventType.CLICK, doMute));
			this._contentDisposables.add(dom.addDisposableListener(muteButton, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					doMute();
				}
			}));
		}

		// Dismiss button (in header row, pushed to the right)
		if (notification.dismissible) {
			const dismissButton = dom.append(headerRow, $('.chat-input-notification-dismiss'));
			dismissButton.appendChild(dom.$(ThemeIcon.asCSSSelector(Codicon.close)));
			dismissButton.tabIndex = 0;
			dismissButton.role = 'button';
			dismissButton.ariaLabel = localize('dismissNotification', "Dismiss notification");

			// Defer the dismiss to a microtask so the synchronous re-render
			// (which clears all children of the widget) happens after the
			// browser has finished propagating the click event. Otherwise
			// blur handlers fired by removing the button from focus can
			// move/remove nodes that `clearNode` then trips over.
			const dismiss = () => queueMicrotask(() => {
				this._telemetryService.publicLog2<ChatInputNotificationTelemetryEvent, ChatInputNotificationTelemetryClassification>('chatInputNotificationDismissed', this._getTelemetryData(notification));
				this._notificationService.dismissNotification(notification.id);
			});
			this._contentDisposables.add(dom.addDisposableListener(dismissButton, dom.EventType.CLICK, dismiss));
			this._contentDisposables.add(dom.addDisposableListener(dismissButton, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					dismiss();
				}
			}));
		}

		// Body row: description + actions on the same line
		const actions = notification.actions.filter(action => this._supportsAction(action));
		const hasBody = notification.description || actions.length > 0;
		if (hasBody) {
			const bodyRow = dom.append(container, $('.chat-input-notification-body'));

			if (notification.description) {
				const descriptionElement = dom.append(bodyRow, $('.chat-input-notification-description'));
				descriptionElement.textContent = notification.description;
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
		this._notificationService.dismissNotification(notification.id);
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
