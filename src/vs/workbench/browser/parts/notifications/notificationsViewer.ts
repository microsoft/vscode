/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { renderMarkdown } from 'vs/base/browser/htmlContentRenderer';
import { clearNode, addClass, removeClass, toggleClass } from 'vs/base/browser/dom';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import URI from 'vs/base/common/uri';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Severity } from 'vs/platform/message/common/message';
import { localize } from 'vs/nls';
import { Button } from 'vs/base/browser/ui/button/button';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { DropdownMenuActionItem } from 'vs/base/browser/ui/dropdown/dropdown';
import { INotificationViewItem, NotificationViewItem } from 'vs/workbench/common/notifications';
import { CloseNotificationAction, ExpandNotificationAction, CollapseNotificationAction, DoNotShowNotificationAgainAction, ConfigureNotificationAction } from 'vs/workbench/browser/parts/notifications/notificationsActions';

export class NotificationsListDelegate implements IDelegate<INotificationViewItem> {

	private static readonly ROW_HEIGHT = 42;
	private static readonly LINE_HEIGHT = 22;

	private offsetHelper: HTMLElement;

	constructor(container: HTMLElement) {
		this.offsetHelper = this.createOffsetHelper(container);
	}

	private createOffsetHelper(container: HTMLElement): HTMLElement {
		const offsetHelper = document.createElement('div');
		offsetHelper.style.opacity = '0';
		offsetHelper.style.position = 'absolute'; // do not mess with the visual layout
		offsetHelper.style.width = '100%'; // ensure to fill contauner to measure true width
		offsetHelper.style.overflow = 'hidden'; // do not overflow
		offsetHelper.style.whiteSpace = 'nowrap'; // do not wrap to measure true width

		container.appendChild(offsetHelper);

		return offsetHelper;
	}

	public getHeight(notification: INotificationViewItem): number {

		// First row: message and actions
		let expandedHeight = NotificationsListDelegate.ROW_HEIGHT;

		if (!notification.expanded) {
			return expandedHeight; // return early if there are no more rows to show
		}

		// Dynamic height: if message overflows
		const preferredMessageHeight = this.computePreferredRows(notification) * NotificationsListDelegate.LINE_HEIGHT;
		const messageOverflows = NotificationsListDelegate.LINE_HEIGHT < preferredMessageHeight;
		if (messageOverflows) {
			const overflow = preferredMessageHeight - NotificationsListDelegate.LINE_HEIGHT;
			expandedHeight += overflow;
		}

		// Last row: source and actions if we have any
		if (notification.source || notification.actions.length > 0) {
			expandedHeight += NotificationsListDelegate.ROW_HEIGHT;
		}

		return expandedHeight;
	}

	private computePreferredRows(notification: INotificationViewItem): number {

		// Render message markdown into offset helper
		const renderedMessage = NotificationMessageMarkdownRenderer.render(notification.message);
		this.offsetHelper.appendChild(renderedMessage);

		// Compute message width taking overflow into account
		const messageWidth = Math.max(renderedMessage.scrollWidth, renderedMessage.offsetWidth);

		// One row per exceeding the total width of the container
		const availableWidth = this.offsetHelper.offsetWidth - (20 /* paddings */ + 22 /* severity */ + (24 * 3) /* toolbar */);
		const preferredRows = Math.ceil(messageWidth / availableWidth);

		// Always clear offset helper after use
		clearNode(this.offsetHelper);

		return preferredRows;
	}

	public getTemplateId(element: INotificationViewItem): string {
		if (element instanceof NotificationViewItem) {
			return NotificationRenderer.TEMPLATE_ID;
		}

		return void 0;
	}
}

export interface INotificationTemplateData {
	container: HTMLElement;
	toDispose: IDisposable[];

	mainRow: HTMLElement;
	icon: HTMLElement;
	message: HTMLElement;
	toolbar: ActionBar;

	detailsRow: HTMLElement;
	source: HTMLElement;
	actionsContainer: HTMLElement;
}

class NotificationMessageMarkdownRenderer {

	private static readonly MARKED_NOOP = (text?: string) => text || '';
	private static readonly MARKED_NOOP_TARGETS = [
		'blockquote', 'br', 'code', 'codespan', 'del', 'em', 'heading', 'hr', 'html',
		'image', 'list', 'listitem', 'paragraph', 'strong', 'table', 'tablecell',
		'tablerow'
	];

	public static render(markdown: IMarkdownString, actionCallback?: (content: string) => void): HTMLElement {
		return renderMarkdown(markdown, {
			inline: true,
			joinRendererConfiguration: renderer => NotificationMessageMarkdownRenderer.MARKED_NOOP_TARGETS.forEach(fn => renderer[fn] = NotificationMessageMarkdownRenderer.MARKED_NOOP),
			actionCallback
		});
	}
}

export class NotificationRenderer implements IRenderer<INotificationViewItem, INotificationTemplateData> {

	public static readonly TEMPLATE_ID = 'notification';

	private static readonly SEVERITIES: ('info' | 'warning' | 'error')[] = ['info', 'warning', 'error'];

	private toDispose: IDisposable[];

	private closeNotificationAction: CloseNotificationAction;
	private expandNotificationAction: ExpandNotificationAction;
	private collapseNotificationAction: CollapseNotificationAction;
	private doNotShowNotificationAgainAction: DoNotShowNotificationAgainAction;

	constructor(
		private actionRunner: IActionRunner,
		@IOpenerService private openerService: IOpenerService,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextMenuService private contextMenuService: IContextMenuService
	) {
		this.toDispose = [];

		this.closeNotificationAction = instantiationService.createInstance(CloseNotificationAction, CloseNotificationAction.ID, CloseNotificationAction.LABEL);
		this.expandNotificationAction = instantiationService.createInstance(ExpandNotificationAction, ExpandNotificationAction.ID, ExpandNotificationAction.LABEL);
		this.collapseNotificationAction = instantiationService.createInstance(CollapseNotificationAction, CollapseNotificationAction.ID, CollapseNotificationAction.LABEL);
		this.doNotShowNotificationAgainAction = this.instantiationService.createInstance(DoNotShowNotificationAgainAction, DoNotShowNotificationAgainAction.ID, DoNotShowNotificationAgainAction.LABEL);

		this.toDispose.push(this.closeNotificationAction, this.expandNotificationAction, this.collapseNotificationAction, this.doNotShowNotificationAgainAction);
	}

	public get templateId() {
		return NotificationRenderer.TEMPLATE_ID;
	}

	public renderTemplate(container: HTMLElement): INotificationTemplateData {
		const data: INotificationTemplateData = Object.create(null);
		data.toDispose = [];

		// Container
		data.container = document.createElement('div');
		addClass(data.container, 'notification-list-item');

		// Main Row
		data.mainRow = document.createElement('div');
		addClass(data.mainRow, 'notification-list-item-main-row');

		// Icon
		data.icon = document.createElement('div');
		addClass(data.icon, 'notification-list-item-icon');

		// Message
		data.message = document.createElement('div');
		addClass(data.message, 'notification-list-item-message');

		// Toolbar
		const toolbarContainer = document.createElement('div');
		addClass(toolbarContainer, 'notification-list-item-toolbar-container');
		data.toolbar = new ActionBar(
			toolbarContainer,
			{
				ariaLabel: localize('notificationActions', "Notification actions"),
				actionItemProvider: action => {
					if (action instanceof ConfigureNotificationAction) {
						const item = new DropdownMenuActionItem(action, action.configurationActions, this.contextMenuService, null, null, null, action.class);
						data.toDispose.push(item);

						return item;
					}

					return null;
				}
			},
		);

		// Details Row
		data.detailsRow = document.createElement('div');
		addClass(data.detailsRow, 'notification-list-item-details-row');

		// Source
		data.source = document.createElement('div');
		addClass(data.source, 'notification-list-item-source');

		// Buttons Container
		data.actionsContainer = document.createElement('div');
		addClass(data.actionsContainer, 'notification-list-item-actions-container');

		container.appendChild(data.container);

		data.container.appendChild(data.mainRow);
		data.mainRow.appendChild(data.icon);
		data.mainRow.appendChild(data.message);
		data.mainRow.appendChild(toolbarContainer);

		data.container.appendChild(data.detailsRow);
		data.detailsRow.appendChild(data.source);
		data.detailsRow.appendChild(data.actionsContainer);

		return data;
	}

	private toSeverity(severity: 'info' | 'warning' | 'error'): Severity {
		switch (severity) {
			case 'info':
				return Severity.Info;
			case 'warning':
				return Severity.Warning;
			case 'error':
				return Severity.Error;
		}
	}

	public renderElement(notification: INotificationViewItem, index: number, data: INotificationTemplateData): void {

		// Container
		toggleClass(data.container, 'expanded', notification.expanded);

		// Icon
		NotificationRenderer.SEVERITIES.forEach(severity => {
			const domAction = notification.severity === this.toSeverity(severity) ? addClass : removeClass;
			domAction(data.icon, `icon-${severity}`);
		});

		// Message (simple markdown with links support)
		clearNode(data.message);
		data.message.appendChild(NotificationMessageMarkdownRenderer.render(notification.message, (content: string) => this.openerService.open(URI.parse(content)).then(void 0, onUnexpectedError)));

		// Actions
		const actions: IAction[] = [];

		const configureNotificationAction = this.instantiationService.createInstance(ConfigureNotificationAction, ConfigureNotificationAction.ID, ConfigureNotificationAction.LABEL, [this.doNotShowNotificationAgainAction]);
		actions.push(configureNotificationAction);
		data.toDispose.push(configureNotificationAction);

		let showExpandCollapseAction = false;
		if (notification.canCollapse) {
			if (notification.expanded) {
				showExpandCollapseAction = true; // allow to collapse an expanded message
			} else if (notification.source || notification.actions.length > 0) {
				showExpandCollapseAction = true; // allow to expand to details row
			} else if (data.message.scrollWidth > data.message.clientWidth) {
				showExpandCollapseAction = true; // allow to expand if message overflows
			}
		}

		if (showExpandCollapseAction) {
			actions.push(notification.expanded ? this.collapseNotificationAction : this.expandNotificationAction);
		}

		actions.push(this.closeNotificationAction);

		// Toolbar
		data.toolbar.clear();
		data.toolbar.context = notification;
		data.toolbar.push(actions, { icon: true, label: false });

		// Source
		if (notification.expanded && notification.source) {
			data.source.innerText = localize('notificationSource', "Source: {0}", notification.source);
		} else {
			data.source.innerText = '';
		}

		// Actions
		clearNode(data.actionsContainer);
		if (notification.expanded) {
			notification.actions.forEach(action => this.createButton(notification, action, data));
		}
	}

	private createButton(notification: INotificationViewItem, action: IAction, data: INotificationTemplateData): Button {
		const button = new Button(data.actionsContainer);
		data.toDispose.push(attachButtonStyler(button, this.themeService));

		button.label = action.label;
		button.onDidClick(() => {

			// Run action
			this.actionRunner.run(action);

			// Hide notification
			notification.dispose();
		});

		return button;
	}

	public disposeTemplate(templateData: INotificationTemplateData): void {
		templateData.toolbar.dispose();
		templateData.toDispose = dispose(templateData.toDispose);
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}