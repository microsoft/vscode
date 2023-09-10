/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IAction } from 'vs/base/common/actions';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenu } from 'vs/platform/actions/common/actions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';

export function openContextMenu(event: MouseEvent, parent: HTMLElement, menu: IMenu, contextMenuService: IContextMenuService, extraActions?: IAction[]): void {
	const standardEvent = new StandardMouseEvent(event);

	const actions: IAction[] = [];

	createAndFillInContextMenuActions(menu, undefined, actions);

	if (extraActions) {
		actions.push(...extraActions);
	}

	contextMenuService.showContextMenu({
		getAnchor: () => standardEvent,
		getActions: () => actions,
		getActionsContext: () => parent,
	});
}
