/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notificationList';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { INotificationViewItem, NotificationViewItem } from 'vs/workbench/services/notification/common/notificationsModel';
import { renderMarkdown } from 'vs/base/browser/htmlContentRenderer';
import { clearNode } from 'vs/base/browser/dom';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import URI from 'vs/base/common/uri';
import { onUnexpectedError } from 'vs/base/common/errors';

export class NotificationsDelegate implements IDelegate<INotificationViewItem> {

	public getHeight(element: INotificationViewItem): number {
		return 22;
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
	message: HTMLElement;
}

export class NotificationRenderer implements IRenderer<INotificationViewItem, INotificationTemplateData> {

	public static readonly ID = 'notification';

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
		container.appendChild(data.container);

		// Message
		data.message = document.createElement('span');
		container.appendChild(data.message);

		return data;
	}

	public renderElement(element: INotificationViewItem, index: number, data: INotificationTemplateData): void {

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