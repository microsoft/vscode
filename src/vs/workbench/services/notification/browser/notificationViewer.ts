/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notificationList';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { INotificationViewItem, NotificationViewItem } from 'vs/workbench/services/notification/common/notificationsModel';
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

export class NotificationsDelegate implements IDelegate<INotificationViewItem> {

	public getHeight(element: INotificationViewItem): number {
		return element.expanded ? 70 : 32;
	}

	public getTemplateId(element: INotificationViewItem): string {
		if (element instanceof NotificationViewItem) {
			return NotificationRenderer.ID;
		}

		return void 0;
	}
}

export interface INotificationTemplateData {
	container: HTMLElement;

	mainRow: HTMLElement;
	icon: HTMLElement;
	message: HTMLElement;

	detailsRow: HTMLElement;
	source: HTMLElement;
	actionsContainer: HTMLElement;
}

export class NotificationRenderer implements IRenderer<INotificationViewItem, INotificationTemplateData> {

	public static readonly ID = 'notification';

	private static readonly SEVERITIES: ('info' | 'warning' | 'error')[] = ['info', 'warning', 'error'];
	private static readonly MARKED_NOOP = (text?: string) => text || '';
	private static readonly MARKED_NOOP_TARGETS = [
		'blockquote', 'br', 'code', 'codespan', 'del', 'em', 'heading', 'hr', 'html',
		'image', 'list', 'listitem', 'paragraph', 'strong', 'table', 'tablecell',
		'tablerow'
	];

	constructor(
		@IOpenerService private openerService: IOpenerService,
		@IThemeService private themeService: IThemeService
	) {
	}

	public get templateId() {
		return NotificationRenderer.ID;
	}

	public renderTemplate(container: HTMLElement): INotificationTemplateData {
		const data: INotificationTemplateData = Object.create(null);

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

		// Details Row
		data.detailsRow = document.createElement('div');
		addClass(data.detailsRow, 'notification-list-item-details-row');

		// Source
		data.source = document.createElement('div');
		addClass(data.source, 'notification-list-item-source');

		// Actions Container
		data.actionsContainer = document.createElement('div');
		addClass(data.actionsContainer, 'notification-list-item-actions-container');

		container.appendChild(data.container);

		data.container.appendChild(data.mainRow);
		data.mainRow.appendChild(data.icon);
		data.mainRow.appendChild(data.message);

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

	public renderElement(element: INotificationViewItem, index: number, data: INotificationTemplateData): void {

		// Container
		toggleClass(data.container, 'expanded', element.expanded);

		// Icon
		NotificationRenderer.SEVERITIES.forEach(severity => {
			const domAction = element.severity === this.toSeverity(severity) ? addClass : removeClass;
			domAction(data.icon, `icon-${severity}`);
		});

		// Message (simple markdown with links support)
		clearNode(data.message);
		data.message.appendChild(renderMarkdown(element.message, {
			inline: true,
			joinRendererConfiguration: renderer => NotificationRenderer.MARKED_NOOP_TARGETS.forEach(fn => renderer[fn] = NotificationRenderer.MARKED_NOOP),
			actionCallback: (content: string) => this.openerService.open(URI.parse(content)).then(void 0, onUnexpectedError)
		}));

		// Source
		if (element.expanded) {
			data.source.innerText = localize('notificationSource', "Source: {0}", element.source);
		} else {
			data.source.innerText = '';
		}

		// Actions
		clearNode(data.actionsContainer);
		if (element.expanded) {
			element.actions.forEach(action => {
				const button = new Button(data.actionsContainer);
				attachButtonStyler(button, this.themeService); // TODO dispose

				button.label = action.label;
				button.onDidClick(() => action.run());
			});
		}
	}

	public disposeTemplate(templateData: INotificationTemplateData): void {
		// Method not implemented
	}
}