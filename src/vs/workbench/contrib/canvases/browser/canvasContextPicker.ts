/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, Separator } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { observableFromEvent } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IMenu, IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { IChatContextPicker, IChatContextPickerItem, IChatContextPickerPickItem, IChatContextPickService } from '../../chat/browser/attachments/chatContextPickService.js';
import { ChatViewId, IChatWidget, isIChatViewViewContext } from '../../chat/browser/chat.js';

export function registerCanvasContextPicker(
	contextPickService: IChatContextPickService,
	menuService: IMenuService,
	notificationService: INotificationService,
	canvasMenuId: MenuId,
	supportsWidget: (widget: IChatWidget) => boolean = () => true,
): IDisposable {
	return contextPickService.registerChatContextItem(new CanvasContextPickerPick(menuService, notificationService, canvasMenuId, supportsWidget));
}

export function isChatViewCanvasContextPickerWidget(widget: IChatWidget): boolean {
	return isIChatViewViewContext(widget.viewContext) && widget.viewContext.viewId === ChatViewId;
}

class CanvasContextPickerPick implements IChatContextPickerItem {

	readonly type = 'pickerPick';
	readonly icon = Codicon.preview;
	readonly label = localize('chatContext.canvases', "Canvas...");
	readonly ordinal = -401;

	constructor(
		private readonly menuService: IMenuService,
		private readonly notificationService: INotificationService,
		private readonly canvasMenuId: MenuId,
		private readonly supportsWidget: (widget: IChatWidget) => boolean,
	) { }

	isEnabled(widget: IChatWidget): boolean {
		if (widget.location !== ChatAgentLocation.Chat || !this.supportsWidget(widget)) {
			return false;
		}
		const menu = this.menuService.createMenu(this.canvasMenuId, widget.scopedContextKeyService);
		try {
			return this.getActions(menu).length > 0;
		} finally {
			menu.dispose();
		}
	}

	asPicker(widget: IChatWidget): IChatContextPicker {
		const menu = this.menuService.createMenu(this.canvasMenuId, widget.scopedContextKeyService);
		return {
			placeholder: localize('chatContext.canvases.placeholder', "Select a canvas"),
			picks: () => observableFromEvent(menu, menu.onDidChange, () => ({
				busy: false,
				picks: this.getActions(menu).map(action => this.toPick(action)),
			})),
			dispose: () => menu.dispose(),
		};
	}

	private getActions(menu: IMenu): IAction[] {
		return menu.getActions().flatMap(([, actions]) => actions).filter(action => action.id !== Separator.ID);
	}

	private toPick(action: IAction): IChatContextPickerPickItem {
		return {
			label: action.label,
			iconClass: ThemeIcon.asClassName(Codicon.preview),
			disabled: !action.enabled,
			asAttachment: async () => {
				try {
					await action.run();
				} catch (error) {
					this.notificationService.error(error);
				}
				return 'noop' as const;
			},
		};
	}
}
