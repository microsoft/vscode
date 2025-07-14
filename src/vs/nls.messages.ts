/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * This module exists so that the AMD build of the monaco editor can replace this with an async loader plugin.
 * If you add new functions to this module make sure that they are also provided in the AMD build of the monaco editor.
 *
 * TODO@esm remove me once we no longer ship an AMD build.
 */

export function getNLSMessages(): string[] {
	return globalThis._VSCODE_NLS_MESSAGES;
}

export function getNLSLanguage(): string | undefined {
	return globalThis._VSCODE_NLS_LANGUAGE;
}
