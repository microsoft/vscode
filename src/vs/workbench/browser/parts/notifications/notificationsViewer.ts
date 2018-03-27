/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { clearNode, addClass, removeClass, toggleClass, addDisposableListener } from 'vs/base/browser/dom';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import URI from 'vs/base/common/uri';
import { onUnexpectedError } from 'vs/base/common/errors';
import { localize } from 'vs/nls';
import { ButtonGroup } from 'vs/base/browser/ui/button/button';
import { attachButtonStyler, attachProgressBarStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { DropdownMenuActionItem } from 'vs/base/browser/ui/dropdown/dropdown';
import { INotificationViewItem, NotificationViewItem, NotificationViewItemLabelKind, INotificationMessage } from 'vs/workbench/common/notifications';
import { ClearNotificationAction, ExpandNotificationAction, CollapseNotificationAction, ConfigureNotificationAction } from 'vs/workbench/browser/parts/notifications/notificationsActions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { Severity } from 'vs/platform/notification/common/notification';

export class NotificationsListDelegate implements IDelegate<INotificationViewItem> {

	private static readonly ROW_HEIGHT = 42;
	private static readonly LINE_HEIGHT = 22;

	private offsetHelper: HTMLElement;

	constructor(container: HTMLElement) {
		this.offsetHelper = this.createOffsetHelper(container);
	}

	private createOffsetHelper(container: HTMLElement): HTMLElement {
		const offsetHelper = document.createElement('div');
		addClass(offsetHelper, 'notification-offset-helper');

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
		const preferredMessageHeight = this.computePreferredHeight(notification);
		const messageOverflows = NotificationsListDelegate.LINE_HEIGHT < preferredMessageHeight;
		if (messageOverflows) {
			const overflow = preferredMessageHeight - NotificationsListDelegate.LINE_HEIGHT;
			expandedHeight += overflow;
		}

		// Last row: source and buttons if we have any
		if (notification.source || notification.actions.primary.length > 0) {
			expandedHeight += NotificationsListDelegate.ROW_HEIGHT;
		}

		// If the expanded height is same as collapsed, unset the expanded state
		// but skip events because there is no change that has visual impact
		if (expandedHeight === NotificationsListDelegate.ROW_HEIGHT) {
			notification.collapse(true /* skip events, no change in height */);
		}

		return expandedHeight;
	}

	private computePreferredHeight(notification: INotificationViewItem): number {

		// Prepare offset helper depending on toolbar actions count
		let actions = 1; // close
		if (notification.canCollapse) {
			actions++; // expand/collapse
		}
		if (notification.actions.secondary.length > 0) {
			actions++; // secondary actions
		}
		this.offsetHelper.style.width = `calc(100% - ${10 /* padding */ + 24 /* severity icon */ + (actions * 24) /* 24px per action */}px)`;

		// Render message into offset helper
		const renderedMessage = NotificationMessageRenderer.render(notification.message);
		this.offsetHelper.appendChild(renderedMessage);

		// Compute height
		const preferredHeight = Math.max(this.offsetHelper.offsetHeight, this.offsetHelper.scrollHeight);

		// Always clear offset helper after use
		clearNode(this.offsetHelper);

		return preferredHeight;
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
	buttonsContainer: HTMLElement;
	progress: ProgressBar;

	renderer: NotificationTemplateRenderer;
}

interface IMessageActionHandler {
	callback: (href: string) => void;
	disposeables: IDisposable[];
}

class NotificationMessageRenderer {

	public static render(message: INotificationMessage, actionHandler?: IMessageActionHandler): HTMLElement {
		const messageContainer = document.createElement('span');

		// Message has no links
		if (message.links.length === 0) {
			messageContainer.textContent = message.value;
		}

		// Message has links
		else {
			let index = 0;
			for (let i = 0; i < message.links.length; i++) {
				const link = message.links[i];

				const textBefore = message.value.substring(index, link.offset);
				if (textBefore) {
					messageContainer.appendChild(document.createTextNode(textBefore));
				}

				const anchor = document.createElement('a');
				anchor.textContent = link.name;
				anchor.title = link.href;
				anchor.href = link.href;

				if (actionHandler) {
					actionHandler.disposeables.push(addDisposableListener(anchor, 'click', () => actionHandler.callback(link.href)));
				}

				messageContainer.appendChild(anchor);

				index = link.offset + link.length;
			}

			// Add text after links if any
			const textAfter = message.value.substring(index);
			if (textAfter) {
				messageContainer.appendChild(document.createTextNode(textAfter));
			}
		}

		return messageContainer;
	}
}

export class NotificationRenderer implements IRenderer<INotificationViewItem, INotificationTemplateData> {

	public static readonly TEMPLATE_ID = 'notification';

	constructor(
		private actionRunner: IActionRunner,
		@IThemeService private themeService: IThemeService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
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
				ariaLabel: localize('notificationActions', "Notification Actions"),
				actionItemProvider: action => {
					if (action instanceof ConfigureNotificationAction) {
						const item = new DropdownMenuActionItem(action, action.configurationActions, this.contextMenuService, null, this.actionRunner, null, action.class);
						data.toDispose.push(item);

						return item;
					}

					return null;
				},
				actionRunner: this.actionRunner
			}
		);
		data.toDispose.push(data.toolbar);

		// Details Row
		data.detailsRow = document.createElement('div');
		addClass(data.detailsRow, 'notification-list-item-details-row');

		// Source
		data.source = document.createElement('div');
		addClass(data.source, 'notification-list-item-source');

		// Buttons Container
		data.buttonsContainer = document.createElement('div');
		addClass(data.buttonsContainer, 'notification-list-item-buttons-container');

		container.appendChild(data.container);

		// the details row appears first in order for better keyboard access to notification buttons
		data.container.appendChild(data.detailsRow);
		data.detailsRow.appendChild(data.source);
		data.detailsRow.appendChild(data.buttonsContainer);

		// main row
		data.container.appendChild(data.mainRow);
		data.mainRow.appendChild(data.icon);
		data.mainRow.appendChild(data.message);
		data.mainRow.appendChild(toolbarContainer);

		// Progress: below the rows to span the entire width of the item
		data.progress = new ProgressBar(container);
		data.toDispose.push(attachProgressBarStyler(data.progress, this.themeService));
		data.toDispose.push(data.progress);

		// Renderer
		data.renderer = this.instantiationService.createInstance(NotificationTemplateRenderer, data, this.actionRunner);
		data.toDispose.push(data.renderer);

		return data;
	}

	public renderElement(notification: INotificationViewItem, index: number, data: INotificationTemplateData): void {
		data.renderer.setInput(notification);
	}

	public disposeTemplate(templateData: INotificationTemplateData): void {
		templateData.toDispose = dispose(templateData.toDispose);
	}
}

export class NotificationTemplateRenderer {

	private static closeNotificationAction: ClearNotificationAction;
	private static expandNotificationAction: ExpandNotificationAction;
	private static collapseNotificationAction: CollapseNotificationAction;

	private static readonly SEVERITIES: ('info' | 'warning' | 'error')[] = ['info', 'warning', 'error'];

	private inputDisposeables: IDisposable[];

	constructor(
		private template: INotificationTemplateData,
		private actionRunner: IActionRunner,
		@IOpenerService private openerService: IOpenerService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		this.inputDisposeables = [];

		if (!NotificationTemplateRenderer.closeNotificationAction) {
			NotificationTemplateRenderer.closeNotificationAction = instantiationService.createInstance(ClearNotificationAction, ClearNotificationAction.ID, ClearNotificationAction.LABEL);
			NotificationTemplateRenderer.expandNotificationAction = instantiationService.createInstance(ExpandNotificationAction, ExpandNotificationAction.ID, ExpandNotificationAction.LABEL);
			NotificationTemplateRenderer.collapseNotificationAction = instantiationService.createInstance(CollapseNotificationAction, CollapseNotificationAction.ID, CollapseNotificationAction.LABEL);
		}
	}

	public setInput(notification: INotificationViewItem): void {
		this.inputDisposeables = dispose(this.inputDisposeables);

		this.render(notification);
	}

	private render(notification: INotificationViewItem): void {

		// Container
		toggleClass(this.template.container, 'expanded', notification.expanded);

		// Severity Icon
		this.renderSeverity(notification);

		// Message
		const messageOverflows = this.renderMessage(notification);

		// Secondary Actions
		this.renderSecondaryActions(notification, messageOverflows);

		// Source
		this.renderSource(notification);

		// Buttons
		this.renderButtons(notification);

		// Progress
		this.renderProgress(notification);

		// Label Change Events
		this.inputDisposeables.push(notification.onDidLabelChange(event => {
			switch (event.kind) {
				case NotificationViewItemLabelKind.SEVERITY:
					this.renderSeverity(notification);
					break;
				case NotificationViewItemLabelKind.PROGRESS:
					this.renderProgress(notification);
					break;
			}
		}));
	}

	private renderSeverity(notification: INotificationViewItem): void {
		NotificationTemplateRenderer.SEVERITIES.forEach(severity => {
			const domAction = notification.severity === this.toSeverity(severity) ? addClass : removeClass;
			domAction(this.template.icon, `icon-${severity}`);
		});
	}

	private renderMessage(notification: INotificationViewItem): boolean {
		clearNode(this.template.message);
		this.template.message.appendChild(NotificationMessageRenderer.render(notification.message, {
			callback: link => this.openerService.open(URI.parse(link)).then(void 0, onUnexpectedError),
			disposeables: this.inputDisposeables
		}));

		const messageOverflows = notification.canCollapse && !notification.expanded && this.template.message.scrollWidth > this.template.message.clientWidth;
		if (messageOverflows) {
			this.template.message.title = this.template.message.textContent;
		} else {
			this.template.message.removeAttribute('title');
		}

		const links = this.template.message.querySelectorAll('a');
		for (let i = 0; i < links.length; i++) {
			links.item(i).tabIndex = -1; // prevent keyboard navigation to links to allow for better keyboard support within a message
		}

		return messageOverflows;
	}

	private renderSecondaryActions(notification: INotificationViewItem, messageOverflows: boolean): void {
		const actions: IAction[] = [];

		// Secondary Actions
		if (notification.actions.secondary.length > 0) {
			const configureNotificationAction = this.instantiationService.createInstance(ConfigureNotificationAction, ConfigureNotificationAction.ID, ConfigureNotificationAction.LABEL, notification.actions.secondary);
			actions.push(configureNotificationAction);
			this.inputDisposeables.push(configureNotificationAction);
		}

		// Expand / Collapse
		let showExpandCollapseAction = false;
		if (notification.canCollapse) {
			if (notification.expanded) {
				showExpandCollapseAction = true; // allow to collapse an expanded message
			} else if (notification.source) {
				showExpandCollapseAction = true; // allow to expand to details row
			} else if (messageOverflows) {
				showExpandCollapseAction = true; // allow to expand if message overflows
			}
		}

		if (showExpandCollapseAction) {
			actions.push(notification.expanded ? NotificationTemplateRenderer.collapseNotificationAction : NotificationTemplateRenderer.expandNotificationAction);
		}

		// Close
		actions.push(NotificationTemplateRenderer.closeNotificationAction);

		this.template.toolbar.clear();
		this.template.toolbar.context = notification;
		actions.forEach(action => this.template.toolbar.push(action, { icon: true, label: false, keybinding: this.getKeybindingLabel(action) }));
	}

	private renderSource(notification): void {
		if (notification.expanded && notification.source) {
			this.template.source.innerText = localize('notificationSource', "Source: {0}", notification.source);
			this.template.source.title = notification.source;
		} else {
			this.template.source.innerText = '';
			this.template.source.removeAttribute('title');
		}
	}

	private renderButtons(notification: INotificationViewItem): void {
		clearNode(this.template.buttonsContainer);

		if (notification.expanded) {
			const buttonGroup = new ButtonGroup(this.template.buttonsContainer, notification.actions.primary.length, { title: true /* assign titles to buttons in case they overflow */ });
			buttonGroup.buttons.forEach((button, index) => {
				const action = notification.actions.primary[index];
				button.label = action.label;

				this.inputDisposeables.push(button.onDidClick(e => {
					e.preventDefault();
					e.stopPropagation();

					// Run action
					this.actionRunner.run(action, notification);

					// Hide notification
					notification.dispose();
				}));

				this.inputDisposeables.push(attachButtonStyler(button, this.themeService));
			});

			this.inputDisposeables.push(buttonGroup);
		}
	}

	private renderProgress(notification: INotificationViewItem): void {

		// Return early if the item has no progress
		if (!notification.hasProgress()) {
			this.template.progress.stop().getContainer().hide();

			return;
		}

		// Infinite
		const state = notification.progress.state;
		if (state.infinite) {
			this.template.progress.infinite().getContainer().show();
		}

		// Total / Worked
		else if (typeof state.total === 'number' || typeof state.worked === 'number') {
			if (typeof state.total === 'number' && !this.template.progress.hasTotal()) {
				this.template.progress.total(state.total);
			}

			if (typeof state.worked === 'number') {
				this.template.progress.worked(state.worked).getContainer().show();
			}
		}

		// Done
		else {
			this.template.progress.done().getContainer().hide();
		}
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

	private getKeybindingLabel(action: IAction): string {
		const keybinding = this.keybindingService.lookupKeybinding(action.id);

		return keybinding ? keybinding.getLabel() : void 0;
	}

	public dispose(): void {
		this.inputDisposeables = dispose(this.inputDisposeables);
	}
}