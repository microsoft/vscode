/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IAgentSessionStatusMainService = createDecorator<IAgentSessionStatusMainService>('agentSessionStatusMainService');

export enum AgentSessionNativeStatusMode {
	/** Default mode showing workspace name + session stats */
	Default = 'default',
	/** Session ready mode showing session title (before entering projection) */
	SessionReady = 'sessionReady',
	/** Session mode showing session title (inside projection) */
	Session = 'session',
}

export interface IAgentSessionNativeStatusInfo {
	readonly mode: AgentSessionNativeStatusMode;
	readonly sessionTitle?: string;
	readonly activeSessionsCount: number;
	readonly unreadSessionsCount: number;
	readonly attentionNeededCount: number;
}

/**
 * Service for managing native menu bar/system tray status for agent sessions.
 * This runs in the main process and updates native OS UI elements.
 */
export interface IAgentSessionStatusMainService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when the status should be updated.
	 */
	readonly onDidChangeStatus: Event<IAgentSessionNativeStatusInfo>;

	/**
	 * Update the native menu bar/system tray with new status information.
	 */
	updateStatus(info: IAgentSessionNativeStatusInfo): void;
}
