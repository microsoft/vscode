/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';

export interface ITunnelServiceCorrelation {
	readonly sessionId: string;
	readonly operationId: string;
}

type TunnelServiceOperation = 'list' | 'connect' | 'delete' | 'host';

type TunnelServiceOperationEvent = {
	tunnelSessionId: string;
	operationId: string;
	operation: TunnelServiceOperation;
};

type TunnelServiceOperationClassification = {
	owner: 'connor4312';
	comment: 'Correlates a tunnel service operation with management and relay requests.';
	tunnelSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The originating VS Code telemetry session ID.' };
	operationId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'A random ID shared by requests belonging to this tunnel operation.' };
	operation: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The kind of tunnel operation.' };
};

export function createTunnelServiceCorrelation(telemetryService: ITelemetryService, operation: TunnelServiceOperation | undefined): ITunnelServiceCorrelation {
	const correlation = { sessionId: telemetryService.sessionId, operationId: generateUuid() };
	if (operation !== undefined) {
		telemetryService.publicLog2<TunnelServiceOperationEvent, TunnelServiceOperationClassification>('tunnelServiceOperation', {
			tunnelSessionId: correlation.sessionId,
			operationId: correlation.operationId,
			operation,
		});
	}
	return correlation;
}

/** The SDK copies these headers separately for each management request and Node.js relay handshake. */
export function tunnelServiceHeaders(correlation: ITunnelServiceCorrelation): Record<string, string> {
	return {
		'X-Tunnels-VSCode-Session-Id': correlation.sessionId,
		'X-Tunnels-VSCode-Client-Operation-Id': correlation.operationId,
		get 'X-Tunnels-VSCode-Client-Request-Id'() { return generateUuid(); },
	};
}
