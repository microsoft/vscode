/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable } from 'vs/base/common/lifecycle';
import Event from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IContextMenuDelegate } from 'vs/base/browser/contextmenu';

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
	onDOMEvent?(e: any, activeElement: HTMLElement): void;
	onHide?(data?: any): void;
}

export const IContextMenuService = createDecorator<IContextMenuService>('contextMenuService');

export interface IContextMenuService {
	_serviceBrand: any;
	showContextMenu(delegate: IContextMenuDelegate): void;
	// TODO@isidor these event should be removed once we get async context menus
	onDidContextMenu: Event<void>;
}