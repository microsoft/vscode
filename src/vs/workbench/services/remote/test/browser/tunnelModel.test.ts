/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { PortsAttributes } from '../../common/tunnelModel.js';

suite('PortsAttributes', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createAttributes(portsAttributes: Record<string, { label?: string; requireLocalPort?: boolean }>, otherPortsAttributes = {}) {
		const configurationService = new TestConfigurationService({
			'remote.portsAttributes': portsAttributes,
			'remote.otherPortsAttributes': otherPortsAttributes
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		return store.add(new PortsAttributes(configurationService));
	}

	const selectors = [
		{ name: 'range', key: '3000-4000', host: 'localhost', commandLine: undefined },
		{ name: 'regex', key: 'server\\.js', host: 'localhost', commandLine: 'node server.js' },
		{ name: 'host-and-port', key: 'db:3000', host: 'db', commandLine: undefined }
	];

	for (const { name, key, host, commandLine } of selectors) {
		test(`applies requireLocalPort from ${name} rules`, () => {
			const actual = [true, false, undefined].map(requireLocalPort => {
				const attributes = createAttributes({ [key]: { label: 'Application', requireLocalPort } });
				const result = attributes.getAttributes(3000, host, commandLine);
				return { label: result?.label, requireLocalPort: result?.requireLocalPort };
			});

			assert.deepStrictEqual(actual, [
				{ label: 'Application', requireLocalPort: true },
				{ label: 'Application', requireLocalPort: false },
				{ label: 'Application', requireLocalPort: undefined }
			]);
		});

		test(`does not apply an unmatched ${name} rule`, () => {
			const attributes = createAttributes({ [key]: { label: 'Application', requireLocalPort: true } }, { requireLocalPort: false });
			assert.strictEqual(attributes.getAttributes(5000, 'localhost', 'node client.js')?.requireLocalPort, false);
		});
	}

	test('preserves exact-port requireLocalPort over matching range and regex rules', () => {
		const actual = [true, false].map(requireLocalPort => {
			const attributes = createAttributes({
				'3000': { requireLocalPort },
				'3000-4000': { requireLocalPort: !requireLocalPort },
				'server\\.js': { requireLocalPort: !requireLocalPort }
			});
			return attributes.getAttributes(3000, 'localhost', 'node server.js')?.requireLocalPort;
		});

		assert.deepStrictEqual(actual, [true, false]);
	});

	test('preserves range requireLocalPort when an exact-port rule leaves it unset', () => {
		const actual = [true, false].map(requireLocalPort => {
			const attributes = createAttributes({
				'3000-4000': { requireLocalPort },
				'3500': { label: 'Exact' }
			});
			const result = attributes.getAttributes(3500, 'localhost');
			return { label: result?.label, requireLocalPort: result?.requireLocalPort };
		});

		assert.deepStrictEqual(actual, [
			{ label: 'Exact', requireLocalPort: true },
			{ label: 'Exact', requireLocalPort: false }
		]);
	});

	test('preserves an explicit range value over a later matching regex rule', () => {
		const actual = [true, false].map(requireLocalPort => {
			const attributes = createAttributes({
				'3000-4000': { requireLocalPort },
				'server\\.js': { requireLocalPort: !requireLocalPort }
			});
			return attributes.getAttributes(3000, 'localhost', 'node server.js')?.requireLocalPort;
		});

		assert.deepStrictEqual(actual, [true, false]);
	});
});
