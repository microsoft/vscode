/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { filterAndGroupConnectors, getConnectorPrimaryAction } from '../../../browser/aiCustomization/connectorsListWidget.js';
import { IConnectorPresentation } from '../../../common/connectorsManagementService.js';

const connectors: readonly IConnectorPresentation[] = [
	{
		id: 'mail',
		displayName: 'Work IQ Mail',
		description: 'Search Outlook mail',
		connectionStatus: 'not_connected',
	},
	{
		id: 'calendar',
		displayName: 'Work IQ Calendar',
		description: 'Use calendar events',
		connectionStatus: 'connected',
	},
];

suite('ConnectorsListWidget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('groups connected items before available items and filters content', () => {
		const allEntries = filterAndGroupConnectors(connectors, '');
		const searchEntries = filterAndGroupConnectors(connectors, 'outlook');

		assert.deepStrictEqual({
			all: allEntries.map(entry => entry.type === 'group-header' ? `${entry.label}:${entry.count}` : entry.connector.id),
			search: searchEntries.map(entry => entry.type === 'group-header' ? `${entry.label}:${entry.count}` : entry.connector.id),
		}, {
			all: ['Connected:1', 'calendar', 'Available:1', 'mail'],
			search: ['Available:1', 'mail'],
		});
	});

	test('maps connection states to primary actions', () => {
		assert.deepStrictEqual([
			getConnectorPrimaryAction('not_connected'),
			getConnectorPrimaryAction('pending'),
			getConnectorPrimaryAction('connected'),
			getConnectorPrimaryAction('error'),
		], ['connect', 'refresh', 'disconnect', 'reconnect']);
	});
});
