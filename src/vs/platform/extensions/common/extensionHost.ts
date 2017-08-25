/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// Broadcast communication constants

export const EXTENSION_LOG_BROADCAST_CHANNEL = 'vscode:extensionLog';
export const EXTENSION_ATTACH_BROADCAST_CHANNEL = 'vscode:extensionAttach';
export const EXTENSION_TERMINATE_BROADCAST_CHANNEL = 'vscode:extensionTerminate';
export const EXTENSION_RELOAD_BROADCAST_CHANNEL = 'vscode:extensionReload';
export const EXTENSION_CLOSE_EXTHOST_BROADCAST_CHANNEL = 'vscode:extensionCloseExtensionHost';

export interface ILogEntry {
	type: string;
	severity: string;
	arguments: any;
}