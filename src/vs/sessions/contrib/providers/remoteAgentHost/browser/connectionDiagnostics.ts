/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITunnelInfo } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';

export const ShowConnectionDiagnosticsCommandId = 'sessions.showConnectionDiagnostics';
export const CopyConnectionDiagnosticsCommandId = 'sessions.copyConnectionDiagnostics';

export interface IConnectionDiagnosticsSection {
	readonly title: string;
	readonly description?: string;
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

export const IConnectionDiagnosticsService = createDecorator<IConnectionDiagnosticsService>('connectionDiagnosticsService');

/** Local, read-only diagnostics. Recording does not change connection or discovery policy. */
export interface IConnectionDiagnosticsService {
	readonly _serviceBrand: undefined;
	getSnapshot(): IConnectionDiagnosticsSnapshot;
	/** Observe an existing discovery operation without changing its result or error. */
	trackDiscovery(trigger: string, discover: () => Promise<ITunnelInfo[]>): Promise<ITunnelInfo[]>;
	recordHostAction(address: string, action: 'connect' | 'disconnect', userInitiated: boolean): void;
}
