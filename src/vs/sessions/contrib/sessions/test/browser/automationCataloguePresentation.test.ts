/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { formatUnavailableAutomationsMessage } from '../../browser/views/automationCataloguePresentation.js';

suite('Automation catalogue presentation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('puts distinct reasons on separate lines in first-seen order', () => {
		assert.strictEqual(formatUnavailableAutomationsMessage([
			{ id: 'host1', label: 'Host 1', unavailableReasonCode: 'disconnected', unavailableReason: 'Reconnect to Host 1.' },
			{ id: 'host2', label: 'Host 2', unavailableReasonCode: 'disabled' },
			{ id: 'host3', label: 'Host 3', unavailableReasonCode: 'unsupported' },
			{ id: 'host4', label: 'Host 4', unavailableReasonCode: 'disconnected', unavailableReason: 'Reconnect to Host 4.' },
			{ id: 'host5', label: 'Host 5', unavailableReasonCode: 'incompatible' },
			{ id: 'host6', label: 'Host 6', unavailableReasonCode: 'initializing' },
		]), [
			'- The agent host is disconnected on Host 1, Host 4.',
			'- Automations are disabled on Host 2.',
			'- Automations are not supported on Host 3.',
			'- The agent host needs to be updated to use automations on Host 5.',
			'- The agent host is still connecting on Host 6.',
		].join('\n'));
	});

	test('groups custom explanations without confusing them with reason codes', () => {
		assert.strictEqual(formatUnavailableAutomationsMessage([
			{ id: 'host1', label: 'Host 1', unavailableReason: 'Custom failure.' },
			{ id: 'host2', label: 'Host 2', unavailableReasonCode: 'disconnected' },
			{ id: 'host3', label: 'Host 3', unavailableReason: 'Custom failure.' },
			{ id: 'host4', label: 'Host 4', unavailableReason: 'disconnected' },
			{ id: 'host5', label: 'Host 5' },
		]), [
			'- Automations are unavailable on Host 1, Host 3. Custom failure.',
			'- The agent host is disconnected on Host 2.',
			'- Automations are unavailable on Host 4. disconnected',
			'- Automations are unavailable on Host 5.',
		].join('\n'));
	});

	test('handles a single provider and absent reasons', () => {
		assert.deepStrictEqual([
			formatUnavailableAutomationsMessage([]),
			formatUnavailableAutomationsMessage([{ id: 'host1', label: 'Host 1' }]),
			formatUnavailableAutomationsMessage([{ id: 'host1', label: 'Host 1' }, { id: 'host2', label: 'Host 2' }]),
			formatUnavailableAutomationsMessage([{ id: 'host1', label: 'Host 1', unavailableReasonCode: 'disconnected' }]),
		], [
			'Some automations are unavailable.',
			'Automations are unavailable on Host 1.',
			'Automations are unavailable on Host 1, Host 2.',
			'The agent host is disconnected on Host 1.',
		]);
	});

	test('omits the bullet for multiple providers sharing one reason', () => {
		assert.strictEqual(formatUnavailableAutomationsMessage([
			{ id: 'host1', label: 'Host 1', unavailableReasonCode: 'disconnected' },
			{ id: 'host2', label: 'Host 2', unavailableReasonCode: 'disconnected' },
		]), 'The agent host is disconnected on Host 1, Host 2.');
	});
});
