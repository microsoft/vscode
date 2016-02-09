/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Lifecycle = require('vs/base/common/lifecycle');
import { IAction } from 'vs/base/common/actions';
import ActionBar = require('vs/base/browser/ui/actionbar/actionbar');
import { TPromise } from 'vs/base/common/winjs.base';
import {Keybinding} from 'vs/base/common/keyCodes';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

export const IContextViewService = createDecorator<IContextViewService>('contextViewService');

export interface IContextViewService {
	serviceId: ServiceIdentifier<any>;
	showContextView(delegate: IContextViewDelegate): void;
	hideContextView(data?: any): void;
	layout(): void;
}

export interface IContextViewDelegate {
	getAnchor(): HTMLElement | { x: number; y: number; };
	render(container: HTMLElement): Lifecycle.IDisposable;
	canRelayout?: boolean; // Default: true
	onDOMEvent?(e: Event, activeElement: HTMLElement): void;
	onHide?(data?: any): void;
}

export const IContextMenuService = createDecorator<IContextMenuService>('contextMenuService');

export interface IContextMenuService {
	serviceId: ServiceIdentifier<any>;
	showContextMenu(delegate: IContextMenuDelegate): void;
}

export interface IContextMenuDelegate {
	getAnchor(): HTMLElement | { x: number; y: number; };
	getActions(): TPromise<IAction[]>;
	getActionItem?(action: IAction): ActionBar.IActionItem;
	getActionsContext?(): any;
	getKeyBinding?(action: IAction): Keybinding;
	getMenuClassName?(): string;
	onHide?(didCancel: boolean): void;
}
