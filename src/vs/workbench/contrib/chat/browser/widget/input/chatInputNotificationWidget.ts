/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { isMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
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

	constructor(
		@IChatInputNotificationService private readonly _notificationService: IChatInputNotificationService,
		@ICommandService private readonly _commandService: ICommandService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
	) {
		super();

		this.domNode = $('.chat-input-notification-widget');
		this.domNode.setAttribute('role', 'status');
		this.domNode.setAttribute('aria-live', 'polite');

		this._register(this._notificationService.onDidChange(() => this._render()));
		this._render();
	}

	private _render(): void {
		this._contentDisposables.clear();
		dom.clearNode(this.domNode);

		const notification = this._notificationService.getActiveNotification();
		if (!notification) {
			this.domNode.parentElement?.classList.remove('has-notification');
			return;
		}

		this.domNode.parentElement?.classList.add('has-notification');
		this._renderNotification(notification);
	}

	private _renderNotification(notification: IChatInputNotification): void {
		const container = dom.append(this.domNode, $('.chat-input-notification'));

		// Apply severity class
		container.classList.add(severityToClass[notification.severity]);

		// Header row: icon + title + dismiss
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

		// Dismiss button (in header row, pushed to the right)
		if (notification.dismissible) {
			const dismissButton = dom.append(headerRow, $('.chat-input-notification-dismiss'));
			dismissButton.appendChild(dom.$(ThemeIcon.asCSSSelector(Codicon.close)));
			dismissButton.tabIndex = 0;
			dismissButton.role = 'button';
			dismissButton.ariaLabel = localize('dismissNotification', "Dismiss notification");

			this._contentDisposables.add(dom.addDisposableListener(dismissButton, dom.EventType.CLICK, () => {
				this._notificationService.dismissNotification(notification.id);
			}));
			this._contentDisposables.add(dom.addDisposableListener(dismissButton, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this._notificationService.dismissNotification(notification.id);
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
