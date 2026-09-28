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
			'- The Agent Host is disconnected on these providers: Host 1, Host 4.',
			'- Automations are disabled on these providers: Host 2.',
			'- These providers do not support automations: Host 3.',
			'- These providers require an Agent Host update to use automations: Host 5.',
			'- The Agent Host is still connecting on these providers: Host 6.',
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
			'- Custom failure. Providers: Host 1, Host 3.',
			'- The Agent Host is disconnected on these providers: Host 2.',
			'- disconnected Providers: Host 4.',
			'- Automations are unavailable on these providers: Host 5.',
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
			'- Automations are unavailable on these providers: Host 1.',
			'- Automations are unavailable on these providers: Host 1, Host 2.',
			'- The Agent Host is disconnected on these providers: Host 1.',
		]);
	});
});
