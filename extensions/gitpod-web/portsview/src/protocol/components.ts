/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export interface MenuOptionI {
	command: string;
	label: string;
	desc?: string;
}

export type MenuOption = MenuOptionI | null;

export interface HoverOption {
	// icon name in codicons
	icon: string;
	title: string;
	command: string;
}
