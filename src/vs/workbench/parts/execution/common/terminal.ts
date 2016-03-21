/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export const defaultLinuxTerm = process.env.DESKTOP_SESSION === 'gnome' ?
	'gnome-terminal' : 'x-terminal-emulator';

export const defaultWindowsTerm = 'cmd';