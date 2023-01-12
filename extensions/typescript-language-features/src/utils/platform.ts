/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function isWeb(): boolean {
	return typeof navigator !== 'undefined' && vscode.env.uiKind === vscode.UIKind.Web;
}

export function isWebAndHasSharedArrayBuffers(): boolean {
	return isWeb() && globalThis['crossOriginIsolated'];
}
