/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable } from 'vs/base/common/lifecycle';
import { IAction } from 'vs/base/common/actions';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { TPromise } from 'vs/base/common/winjs.base';
import { Keybinding } from 'vs/base/common/keyCodes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IContextViewService = createDecorator<IContextViewService>('contextViewService');

export interface IContextViewService {
	_serviceBrand: any;
	showContextView(delegate: IContextViewDelegate): void;
	hideContextView(data?: any): void;
	layout(): void;
}

export interface IContextViewDelegate {
	getAnchor(): HTMLElement | { x: number; y: number; };
	render(container: HTMLElement): IDisposable;
	canRelayout?: boolean; // Default: true
	onDOMEvent?(e: Event, activeElement: HTMLElement): void;
	onHide?(data?: any): void;
}

export const IContextMenuService = createDecorator<IContextMenuService>('contextMenuService');

export interface IContextMenuService {
	_serviceBrand: any;
	showContextMenu(delegate: IContextMenuDelegate): void;
}

export interface IEvent {
	shiftKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	metaKey?: boolean;
}

export interface IContextMenuDelegate {
	getAnchor(): HTMLElement | { x: number; y: number; };
	getActions(): TPromise<(IAction | ContextSubMenu)[]>;
	getActionItem?(action: IAction): IActionItem;
	getActionsContext?(event?: IEvent): any;
	getKeyBinding?(action: IAction): Keybinding;
	getMenuClassName?(): string;
	onHide?(didCancel: boolean): void;
}

export class ContextSubMenu {
	constructor(public label: string, public entries: (ContextSubMenu | IAction)[]) {
		// noop
	}
}
