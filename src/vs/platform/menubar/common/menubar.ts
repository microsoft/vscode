/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IMenubarService = createDecorator<IMenubarService>('menubarService');

export interface IMenubarService {
	_serviceBrand: any;

	updateMenubar(windowId: number, menus: IMenubarData): TPromise<void>;
}

export interface IMenubarData {
	'Files'?: IMenubarMenu;
	'Edit'?: IMenubarMenu;
	[id: string]: IMenubarMenu;
}

export interface IMenubarMenu {
	items: Array<IMenubarMenuItemAction | IMenubarMenuItemSeparator>;
}

export interface IMenubarMenuItemAction {
	id: string;
	label: string;
	checked: boolean;
	enabled: boolean;
}

export interface IMenubarMenuItemSeparator {
	id: 'vscode.menubar.separator';
}