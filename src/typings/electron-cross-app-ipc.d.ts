/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Type definitions for Electron's crossAppIPC module (custom build).
 *
 * This module provides secure IPC between an Electron host app and an
 * embedded Electron app (MiniApp) within nested bundles. Communication
 * is authenticated via code-signature verification (macOS: Mach ports,
 * Windows: named pipes).
 */

declare namespace Electron {

	interface CrossAppIPCMessageEvent {
		/** The deserialized message data sent by the peer app. */
		data: any;
		/** Array of transferred MessagePortMain objects (if any). */
		ports: Electron.MessagePortMain[];
	}

	type CrossAppIPCDisconnectReason =
		| 'peer-disconnected'
		| 'handshake-failed'
		| 'connection-failed'
		| 'connection-timeout';

	interface CrossAppIPC extends NodeJS.EventEmitter {
		on(event: 'connected', listener: () => void): this;
		once(event: 'connected', listener: () => void): this;
		removeListener(event: 'connected', listener: () => void): this;

		on(event: 'message', listener: (messageEvent: CrossAppIPCMessageEvent) => void): this;
		once(event: 'message', listener: (messageEvent: CrossAppIPCMessageEvent) => void): this;
		removeListener(event: 'message', listener: (messageEvent: CrossAppIPCMessageEvent) => void): this;

		on(event: 'disconnected', listener: (reason: CrossAppIPCDisconnectReason) => void): this;
		once(event: 'disconnected', listener: (reason: CrossAppIPCDisconnectReason) => void): this;
		removeListener(event: 'disconnected', listener: (reason: CrossAppIPCDisconnectReason) => void): this;

		connect(): void;
		close(): void;
		postMessage(message: any, transferables?: Electron.MessagePortMain[]): void;
		readonly connected: boolean;
		readonly isServer: boolean;
	}

	interface CrossAppIPCModule {
		createCrossAppIPC(): CrossAppIPC;
	}

	namespace Main {
		const crossAppIPC: CrossAppIPCModule | undefined;
	}

	namespace CrossProcessExports {
		const crossAppIPC: CrossAppIPCModule | undefined;
	}
}
