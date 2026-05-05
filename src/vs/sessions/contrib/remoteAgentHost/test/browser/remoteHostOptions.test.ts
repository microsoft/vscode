/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { getStatusHover, getStatusLabel } from '../../browser/remoteHostOptions.js';

suite('remoteHostOptions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('getStatusLabel covers every connection status variant', () => {
		assert.ok(getStatusLabel(RemoteAgentHostConnectionStatus.connected).length > 0);
		assert.ok(getStatusLabel(RemoteAgentHostConnectionStatus.connecting).length > 0);
		assert.ok(getStatusLabel(RemoteAgentHostConnectionStatus.disconnected).length > 0);

		const incompatibleLabel = getStatusLabel(
			RemoteAgentHostConnectionStatus.incompatible('any reason', ['0.1.0']),
		);
		assert.ok(incompatibleLabel.length > 0);
		// Sanity-check that the incompatible label is distinct from the other
		// statuses so the workspace picker can visually call it out.
		assert.notStrictEqual(incompatibleLabel, getStatusLabel(RemoteAgentHostConnectionStatus.disconnected));
	});

	test('getStatusHover surfaces the host-supplied message for incompatible status', () => {
		const status = RemoteAgentHostConnectionStatus.incompatible(
			'Client offered protocol versions [0.1.0], but this server only supports 0.2.0.',
			['0.1.0'],
			['0.2.0'],
		);

		const hover = getStatusHover(status, 'host.example:1234');
		assert.ok(hover.includes('0.1.0'), 'hover should mention the offered version');
		assert.ok(hover.includes('only supports 0.2.0'), 'hover should include the host-supplied message');
		assert.ok(hover.includes('host.example:1234'), 'hover should include the address when provided');
	});

	test('getStatusHover omits the address line when address is undefined', () => {
		const status = RemoteAgentHostConnectionStatus.incompatible('Some reason', ['0.1.0']);
		const hover = getStatusHover(status);
		assert.ok(hover.includes('Some reason'));
		assert.ok(!hover.includes('Address'), 'hover should not include an address line when none is given');
	});
});
