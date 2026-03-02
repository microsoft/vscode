/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

/**
 * Data representing a pending tool confirmation that needs user approval.
 */
export interface IRemoteControlConfirmation {
	readonly toolCallId: string;
	readonly toolId: string;
	readonly command: string;
	readonly cwd: string;
	readonly language: string;
	readonly title: string;
	readonly timestamp: number;
}

/**
 * Event fired when a confirmation is resolved via the remote web client.
 */
export interface IRemoteControlConfirmationResponse {
	readonly toolCallId: string;
	readonly approved: boolean;
	readonly editedCommand?: string;
}

/**
 * Status info about the remote control HTTP server.
 */
export interface IRemoteControlServerInfo {
	readonly port: number;
	readonly url: string;
}

export const IRemoteControlMainService = createDecorator<IRemoteControlMainService>('remoteControlMainService');

/**
 * Main process service that runs a lightweight HTTP server for remote
 * approval/denial of agent tool invocations from a phone or browser.
 */
export interface IRemoteControlMainService {
	readonly _serviceBrand: undefined;

	/**
	 * Start the HTTP server on a local port.
	 */
	startServer(port?: number): Promise<IRemoteControlServerInfo>;

	/**
	 * Stop the HTTP server.
	 */
	stopServer(): Promise<void>;

	/**
	 * Returns whether the server is currently running.
	 */
	isRunning(): Promise<boolean>;

	/**
	 * Push the current set of pending confirmations to the server.
	 * Called by the workbench whenever the set changes.
	 */
	updatePendingConfirmations(confirmations: IRemoteControlConfirmation[]): Promise<void>;

	/**
	 * Fired when the remote web client approves or denies a confirmation.
	 */
	readonly onDidReceiveConfirmation: Event<IRemoteControlConfirmationResponse>;
}

export const remoteControlIpcChannelName = 'remoteControl';
