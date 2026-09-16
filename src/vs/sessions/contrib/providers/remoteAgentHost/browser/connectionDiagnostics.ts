/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { ITunnelInfo } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const ShowConnectionDiagnosticsCommandId = 'sessions.showConnectionDiagnostics';
export const CopyConnectionDiagnosticsCommandId = 'sessions.copyConnectionDiagnostics';

export interface IConnectionDiagnosticsSection {
	readonly title: string;
	readonly description?: string;
	/** Associates a host section with current management state without adding it to exports. */
	readonly hostAddress?: string;
	/** Presentation only; exports always include the complete section. */
	readonly collapsed?: boolean;
	readonly entries: readonly { readonly label: string; readonly value: string }[];
}

export interface IConnectionDiagnosticsSnapshot {
	readonly capturedAt: string;
	readonly sections: readonly IConnectionDiagnosticsSection[];
	/** Plain-text equivalent of the displayed snapshot, suitable for copying and accessible views. */
	readonly text: string;
}

export type ConnectionHostManagementAction = 'disconnect' | 'reconnect' | 'restore';

export interface IConnectionHostManagementEntry {
	readonly id: string;
	readonly label: string;
	readonly address: string | undefined;
	readonly status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'incompatible';
	readonly selectable: boolean;
	readonly selected: boolean;
	readonly hidden: boolean;
	readonly autoConnectSuppressed: boolean;
	readonly connectable: boolean;
}

export interface IConnectionHostManagementState {
	readonly hosts: readonly IConnectionHostManagementEntry[];
	readonly isDiscovering: boolean;
}

export const IConnectionDiagnosticsService = createDecorator<IConnectionDiagnosticsService>('connectionDiagnosticsService');

/** Owns the live host-management model and the separately captured local diagnostics snapshot. */
export interface IConnectionDiagnosticsService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeHostManagement: Event<void>;
	getSnapshot(): IConnectionDiagnosticsSnapshot;
	getHostManagementState(): IConnectionHostManagementState;
	runHostAction(hostId: string, action: ConnectionHostManagementAction): Promise<void>;
	rediscover(): Promise<boolean>;
	/** Observe an existing discovery operation without changing its result or error. */
	trackDiscovery(trigger: string, discover: () => Promise<ITunnelInfo[]>): Promise<ITunnelInfo[]>;
	recordHostAction(address: string, action: 'connect' | 'disconnect', userInitiated: boolean): void;
}
