/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { Action, IAction } from 'vs/base/common/actions';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenu } from 'vs/platform/actions/common/actions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';

export function openContextMenu(event: MouseEvent, parent: HTMLElement, menu: IMenu, contextMenuService: IContextMenuService, extraActions?: Action[]): void {
	const standardEvent = new StandardMouseEvent(event);

	const anchor: { x: number, y: number } = { x: standardEvent.posx, y: standardEvent.posy };
	const actions: IAction[] = [];

	const actionsDisposable = createAndFillInContextMenuActions(menu, undefined, actions);

	if (extraActions) {
		actions.push(...extraActions);
	}

	contextMenuService.showContextMenu({
		getAnchor: () => anchor,
		getActions: () => actions,
		getActionsContext: () => parent,
		onHide: () => actionsDisposable.dispose()
	});
}
