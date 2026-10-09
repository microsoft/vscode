/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isUUID } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITelemetryData } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { createTunnelServiceCorrelation, tunnelServiceHeaders } from '../../common/tunnelServiceHeaders.js';

suite('Tunnel service headers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('correlates service headers with telemetry and refreshes the request ID on every copy', () => {
		const events: { name: string | undefined; data: ITelemetryData | undefined }[] = [];
		const telemetry = new class extends NullTelemetryServiceShape {
			override publicLog2(name?: string, data?: ITelemetryData): void {
				events.push({ name, data });
			}
		}();
		const correlation = createTunnelServiceCorrelation(telemetry, 'connect');
		const headers = tunnelServiceHeaders(correlation);
		const first = { ...headers };
		const second = { ...headers };
		const next = createTunnelServiceCorrelation(telemetry, 'list');
		assert.deepStrictEqual({
			events,
			session: first['X-Tunnels-VSCode-Session-Id'],
			operation: first['X-Tunnels-VSCode-Client-Operation-Id'],
			stableOperation: first['X-Tunnels-VSCode-Client-Operation-Id'] === second['X-Tunnels-VSCode-Client-Operation-Id'],
			freshRequests: first['X-Tunnels-VSCode-Client-Request-Id'] !== second['X-Tunnels-VSCode-Client-Request-Id'],
			validRequestIds: [first, second].every(request => isUUID(request['X-Tunnels-VSCode-Client-Request-Id'])),
			differentOperations: correlation.operationId !== next.operationId,
		}, {
			events: [
				{ name: 'tunnelServiceOperation', data: { tunnelSessionId: correlation.sessionId, operationId: correlation.operationId, operation: 'connect' } },
				{ name: 'tunnelServiceOperation', data: { tunnelSessionId: next.sessionId, operationId: next.operationId, operation: 'list' } },
			],
			session: telemetry.sessionId,
			operation: correlation.operationId,
			stableOperation: true,
			freshRequests: true,
			validRequestIds: true,
			differentOperations: true,
		});
	});
});
