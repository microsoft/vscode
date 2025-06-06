/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function isWeb(): boolean {
	return 'navigator' in globalThis && vscode.env.uiKind === vscode.UIKind.Web;
}

export function isWebAndHasSharedArrayBuffers(): boolean {
	return isWeb() && (globalThis as any)['crossOriginIsolated'];
}

export function supportsReadableByteStreams(): boolean {
	return isWeb() && 'ReadableByteStreamController' in globalThis;
}

