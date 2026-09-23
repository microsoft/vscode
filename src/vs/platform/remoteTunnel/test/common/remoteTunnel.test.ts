/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MAX_TUNNEL_NAME_LENGTH, normalizeTunnelName, tunnelNameFromHostname } from '../../common/remoteTunnel.js';

suite('Remote tunnel name normalization', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// Mirrors `test_clean_hostname_for_tunnel` in the CLI's
	// `cli/src/tunnels/dev_tunnels.rs`; the two must agree or a machine ends
	// up with one dev tunnel per producer.
	test('derives host names the same way the CLI does', () => {
		assert.deepStrictEqual([
			tunnelNameFromHostname('hello123'),
			tunnelNameFromHostname('-cool-name-'),
			tunnelNameFromHostname('cool!name with_chars'),
			tunnelNameFromHostname('z'),
			tunnelNameFromHostname('Connor-PC'),
			tunnelNameFromHostname('a'.repeat(MAX_TUNNEL_NAME_LENGTH + 5)),
		], [
			'hello123',
			'cool-name',
			'coolname-with-chars',
			'remote-machine',
			'connor-pc',
			'a'.repeat(MAX_TUNNEL_NAME_LENGTH),
		]);
	});

	test('normalizes explicitly configured names', () => {
		assert.deepStrictEqual([
			normalizeTunnelName('Connor-PC'),
			normalizeTunnelName('---Connor-PC'),
			normalizeTunnelName('Connor!PC'),
			normalizeTunnelName('a'.repeat(MAX_TUNNEL_NAME_LENGTH + 1)),
			normalizeTunnelName('---!@#$'),
		], [
			'connor-pc',
			'connor-pc',
			'connorpc',
			'a'.repeat(MAX_TUNNEL_NAME_LENGTH),
			'',
		]);
	});
});
