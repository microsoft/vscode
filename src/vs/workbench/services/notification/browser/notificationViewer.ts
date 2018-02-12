/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notificationList';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { INotificationViewItem, NotificationViewItem } from 'vs/workbench/services/notification/common/notificationsModel';
import { renderMarkdown } from 'vs/base/browser/htmlContentRenderer';
import { clearNode, addClass, removeClass } from 'vs/base/browser/dom';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import URI from 'vs/base/common/uri';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Severity } from 'vs/platform/message/common/message';

export class NotificationsDelegate implements IDelegate<INotificationViewItem> {

	public getHeight(element: INotificationViewItem): number {
		return 44;
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
	icon: HTMLElement;
	message: HTMLElement;
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
		@IOpenerService private openerService: IOpenerService
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

		// Icon
		data.icon = document.createElement('div');
		addClass(data.icon, 'notification-list-item-icon');

		// Message
		data.message = document.createElement('div');
		addClass(data.message, 'notification-list-item-message');

		container.appendChild(data.container);
		data.container.appendChild(data.icon);
		data.container.appendChild(data.message);

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
	}

	public disposeTemplate(templateData: INotificationTemplateData): void {
		// Method not implemented
	}
}