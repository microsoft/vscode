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
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from './chatInputNotificationService.js';
import './media/chatInputNotificationWidget.css';

const $ = dom.$;

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

/**
 * Widget that renders a single notification banner above the chat input area.
 * Subscribes to {@link IChatInputNotificationService} and shows the highest-severity
 * active notification with severity-colored borders, action buttons, and a dismiss button.
 */
export class ChatInputNotificationWidget extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _contentDisposables = this._register(new DisposableStore());

	/**
	 * Optional provider that returns the current session type of the owning
	 * chat input part. When set and a notification specifies a `sessionTypes`
	 * allow-list, the widget will only render the notification if the current
	 * session type matches.
	 */
	private readonly _sessionTypeProvider: (() => string | undefined) | undefined;

	constructor(
		sessionTypeProvider: (() => string | undefined) | undefined,
		@IChatInputNotificationService private readonly _notificationService: IChatInputNotificationService,
		@ICommandService private readonly _commandService: ICommandService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super();
		this._sessionTypeProvider = sessionTypeProvider;

		this.domNode = $('.chat-input-notification-widget');

		this._register(this._notificationService.onDidChange(() => this._render()));
		this._render();
	}

	/** Re-evaluates which notification (if any) to display. Safe to call externally when the owner's session type changes. */
	rerender(): void {
		this._render();
	}

	private _render(): void {
		this._contentDisposables.clear();
		dom.clearNode(this.domNode);

		const notification = this._notificationService.getActiveNotification(n => this._matchesSession(n));
		if (!notification) {
			this.domNode.parentElement?.classList.remove('has-notification');
			return;
		}

		this.domNode.parentElement?.classList.add('has-notification');
		this._renderNotification(notification);
	}

	private _matchesSession(notification: IChatInputNotification): boolean {
		if (!notification.sessionTypes || notification.sessionTypes.length === 0) {
			return true;
		}
		const currentType = this._sessionTypeProvider?.();
		return !!currentType && notification.sessionTypes.includes(currentType);
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
			const dismiss = () => queueMicrotask(() => this._notificationService.dismissNotification(notification.id));
			this._contentDisposables.add(dom.addDisposableListener(dismissButton, dom.EventType.CLICK, dismiss));
			this._contentDisposables.add(dom.addDisposableListener(dismissButton, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					dismiss();
				}
			}));
		}

		// Body row: description + actions on the same line
		const hasBody = notification.description || notification.actions.length > 0;
		if (hasBody) {
			const bodyRow = dom.append(container, $('.chat-input-notification-body'));

			if (notification.description) {
				const descriptionElement = dom.append(bodyRow, $('.chat-input-notification-description'));
				descriptionElement.textContent = notification.description;
			}

			if (notification.actions.length > 0) {
				const actionsContainer = dom.append(bodyRow, $('.chat-input-notification-actions'));

				for (let i = 0; i < notification.actions.length; i++) {
					const action = notification.actions[i];
					const isLast = i === notification.actions.length - 1;

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

					this._contentDisposables.add(button.onDidClick(async () => {
						this._telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
							id: action.commandId,
							from: 'chatInputNotification',
						});
						await this._commandService.executeCommand(action.commandId, ...(action.commandArgs ?? []));
					}));
				}
			}
		}
	}
}
