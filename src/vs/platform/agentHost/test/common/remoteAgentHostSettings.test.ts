/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService, IConfigurationValue } from '../../../configuration/common/configuration.js';
import { RemoteAgentHostEntryType, readWebSocketRemoteAgentHostEntries } from '../../common/remoteAgentHostService.js';

function createConfigurationService(inspectValue: IConfigurationValue<unknown>): IConfigurationService {
	return {
		inspect: <T>(_key: string) => inspectValue as IConfigurationValue<T>,
		getValue: () => inspectValue.value ?? inspectValue.workspaceValue,
	} as IConfigurationService;
}

suite('readWebSocketRemoteAgentHostEntries', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('ignores hosts configured only in workspace settings', () => {
		const workspaceEntries = [{ address: '192.168.48.1:9492', name: 'Workspace Host' }];
		const configurationService = createConfigurationService({
			value: workspaceEntries,
			workspaceValue: workspaceEntries,
			workspaceFolderValue: workspaceEntries,
		});

		assert.deepStrictEqual(readWebSocketRemoteAgentHostEntries(configurationService), []);
	});

	test('uses user-configured hosts and ignores a workspace override', () => {
		const userEntries = [{ address: 'localhost:3000', name: 'Local Host' }];
		const workspaceEntries = [{ address: '192.168.48.1:9492', name: 'Workspace Host' }];
		const configurationService = createConfigurationService({
			value: workspaceEntries,
			userValue: userEntries,
			workspaceValue: workspaceEntries,
		});

		assert.deepStrictEqual(readWebSocketRemoteAgentHostEntries(configurationService), [{
			name: 'Local Host',
			connectionToken: undefined,
			connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'localhost:3000' },
		}]);
	});
});
