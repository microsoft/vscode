/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The context a control runs a command with to name the window it is in, such as a toolbar of an auxiliary window, so
 * that the command acts on that window rather than on the window that has focus: a click in a window that is not
 * focused yet runs before it is.
 */
export interface IWindowCommandContext {
	readonly windowId: number;
}

export function isWindowCommandContext(context: unknown): context is IWindowCommandContext {
	return !!context && typeof context === 'object' && typeof (context as IWindowCommandContext).windowId === 'number';
}
