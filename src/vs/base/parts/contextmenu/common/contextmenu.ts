/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ICommonContextMenuItem {
	label?: string;

	/**
	 * A `header` is a non-interactive section header on macOS 14 and later. Other platforms show it as
	 * a normal item, so a header should also be disabled.
	 */
	type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio' | 'header';

	accelerator?: string;

	enabled?: boolean;
	visible?: boolean;
	checked?: boolean;
}

export interface ISerializableContextMenuItem extends ICommonContextMenuItem {
	id: number;
	submenu?: ISerializableContextMenuItem[];
}

export interface IContextMenuItem extends ICommonContextMenuItem {
	click?: (event: IContextMenuEvent) => void;
	submenu?: IContextMenuItem[];
}

export interface IContextMenuEvent {
	shiftKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	metaKey?: boolean;
}

export interface IPopupOptions {
	x?: number;
	y?: number;
	positioningItem?: number;
}

export const CONTEXT_MENU_CHANNEL = 'vscode:contextmenu';
export const CONTEXT_MENU_CLOSE_CHANNEL = 'vscode:onCloseContextMenu';
