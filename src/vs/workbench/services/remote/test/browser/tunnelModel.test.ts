/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TunnelProtocol } from '../../../../../platform/tunnel/common/tunnel.js';
import { OnPortForward, PortsAttributes } from '../../common/tunnelModel.js';

suite('PortsAttributes', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createAttributes(portsAttributes: Record<string, { label?: string; requireLocalPort?: boolean; protocol?: TunnelProtocol }>, otherPortsAttributes = {}) {
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
		const fallback = {
			label: 'Fallback',
			onAutoForward: OnPortForward.Ignore,
			elevateIfNeeded: true,
			requireLocalPort: true,
			protocol: undefined
		};

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

		test(`does not merge fallback attributes into requireLocalPort-only ${name} rules`, () => {
			const actual = [true, false].map(requireLocalPort => {
				const attributes = createAttributes({ [key]: { requireLocalPort } }, fallback);
				return attributes.getAttributes(3000, host, commandLine);
			});

			assert.deepStrictEqual(actual, [true, false].map(requireLocalPort => ({
				label: undefined,
				onAutoForward: undefined,
				elevateIfNeeded: undefined,
				requireLocalPort,
				protocol: undefined
			})));
		});

		test(`uses fallback attributes when a matching ${name} rule has no defined attributes`, () => {
			const actual = [{}, { requireLocalPort: undefined }].map(rule => {
				const attributes = createAttributes({ [key]: rule }, fallback);
				return attributes.getAttributes(3000, host, commandLine);
			});

			assert.deepStrictEqual(actual, [fallback, fallback]);
		});

		test(`does not apply an unmatched ${name} rule`, () => {
			const attributes = createAttributes({ [key]: { label: 'Application', requireLocalPort: false } }, fallback);
			assert.deepStrictEqual(attributes.getAttributes(5000, 'localhost', 'node client.js'), fallback);
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

	for (const range of ['3000-4000', '3500-4000']) {
		test(`preserves ${range} protocol when an exact-port rule leaves it unset`, () => {
			const actual = [TunnelProtocol.Http, TunnelProtocol.Https].map(protocol => {
				const attributes = createAttributes({
					[range]: { protocol },
					'3500': { label: 'Exact' }
				});
				const result = attributes.getAttributes(3500, 'localhost');
				return { label: result?.label, protocol: result?.protocol };
			});

			assert.deepStrictEqual(actual, [
				{ label: 'Exact', protocol: TunnelProtocol.Http },
				{ label: 'Exact', protocol: TunnelProtocol.Https }
			]);
		});

		test(`preserves explicit exact-port protocol over ${range}`, () => {
			const actual = [TunnelProtocol.Http, TunnelProtocol.Https].map(protocol => {
				const attributes = createAttributes({
					[range]: { protocol: protocol === TunnelProtocol.Http ? TunnelProtocol.Https : TunnelProtocol.Http },
					'3500': { protocol }
				});
				return attributes.getAttributes(3500, 'localhost')?.protocol;
			});

			assert.deepStrictEqual(actual, [TunnelProtocol.Http, TunnelProtocol.Https]);
		});
	}

	test('does not use fallback attributes when an empty exact-port rule follows a protocol-only range', () => {
		const actual = [{}, { protocol: undefined }].map(rule => {
			const attributes = createAttributes({
				'3000-4000': { protocol: TunnelProtocol.Https },
				'3500': rule
			}, { label: 'Fallback', protocol: TunnelProtocol.Http });
			return attributes.getAttributes(3500, 'localhost');
		});
		const expected = {
			label: undefined,
			onAutoForward: undefined,
			elevateIfNeeded: undefined,
			requireLocalPort: undefined,
			protocol: TunnelProtocol.Https
		};

		assert.deepStrictEqual(actual, [expected, expected]);
	});
});
