/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Channel name used by each renderer process to register a server channel
 * that exposes its file system operations. The main process routes calls
 * from other renderers to the right window.
 */
export const REMOTE_FILE_SYSTEM_PROXY_CHANNEL_NAME = 'remoteFileSystemProxy';

/**
 * Channel name registered by the main process handler that receives requests
 * from renderers and forwards them to the window that owns the remote
 * connection matching the URI's authority.
 */
export const REMOTE_FILE_SYSTEM_PROXY_HANDLER_CHANNEL_NAME = 'remoteFileSystemProxyHandler';
