/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getConnectorRowPresentation } from '../../../browser/aiCustomization/connectorPresentation.js';
import { CopilotConnectorConnectionStatus, CopilotConnectorConnectionStatusDetail, ICopilotConnector } from '../../../browser/aiCustomization/copilotConnectorsService.js';

function connector(connectionStatus: CopilotConnectorConnectionStatus, connectionStatusDetail?: CopilotConnectorConnectionStatusDetail): ICopilotConnector {
	return {
		name: 'mail',
		displayName: 'Mail',
		description: 'Search mail',
		tags: [],
		keywords: [],
		capabilities: [],
		representativeQueries: [],
		agents: [],
		commands: [],
		skills: [],
		connectionStatus,
		connectionStatusDetail,
		scopes: [],
		mcpServers: [],
	};
}

suite('Connector presentation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps connection and recovery states to the designed actions', () => {
		assert.deepStrictEqual([
			getConnectorRowPresentation(connector('connected')),
			getConnectorRowPresentation(connector('not_connected')),
			getConnectorRowPresentation(connector('pending')),
			getConnectorRowPresentation(connector('error', 'sign_in_required')),
			getConnectorRowPresentation(connector('error', 'review_required')),
			getConnectorRowPresentation(connector('error', 'retryable_error')),
			getConnectorRowPresentation(connector('error', 'unavailable')),
		], [
			{ statusLabel: 'Connected', statusIcon: 'connected', action: 'more' },
			{ statusLabel: 'Not connected', action: 'connect', actionLabel: 'Connect' },
			{ statusLabel: 'Connection pending', statusIcon: 'pending' },
			{ statusLabel: 'Sign in required', statusIcon: 'attention', action: 'sign_in', actionLabel: 'Sign in' },
			{ statusLabel: 'Review required', statusIcon: 'attention', action: 'review', actionLabel: 'Review' },
			{ statusLabel: 'Connection failed', statusIcon: 'error', action: 'retry', actionLabel: 'Try Again' },
			{ statusLabel: 'Currently unavailable', statusIcon: 'info' },
		]);
	});
});
