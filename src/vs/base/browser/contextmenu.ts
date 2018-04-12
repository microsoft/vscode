/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IAction, IActionRunner, Action } from 'vs/base/common/actions';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { TPromise } from 'vs/base/common/winjs.base';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';

export interface IEvent {
	shiftKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	metaKey?: boolean;
}

export class ContextSubMenu extends Action {
	constructor(label: string, public entries: (ContextSubMenu | IAction)[]) {
		super('contextsubmenu', label, '', true);
	}
}

export interface IContextMenuDelegate {
	getAnchor(): HTMLElement | { x: number; y: number; };
	getActions(): TPromise<(IAction | ContextSubMenu)[]>;
	getActionItem?(action: IAction): IActionItem;
	getActionsContext?(event?: IEvent): any;
	getKeyBinding?(action: IAction): ResolvedKeybinding;
	getMenuClassName?(): string;
	onHide?(didCancel: boolean): void;
	actionRunner?: IActionRunner;
	autoSelectFirstItem?: boolean;
}