/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { PolicyCategory } from '../../../../base/common/policy.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../configuration/common/configurationRegistry.js';
import { Registry } from '../../../registry/common/platform.js';
import '../../common/request.js';

suite('http.proxyPacUrl setting', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const property = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()['http.proxyPacUrl'];

	test('is a restricted application setting backed by the ProxyPacUrl policy', () => {
		assert.deepStrictEqual({
			type: property.type,
			default: property.default,
			scope: property.scope ?? ConfigurationScope.APPLICATION,
			restricted: property.restricted,
			policy: property.policy?.name,
			policyCategory: property.policy?.category,
		}, {
			type: 'string',
			default: '',
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
			policy: 'ProxyPacUrl',
			policyCategory: PolicyCategory.Network,
		});
	});

	test('accepts only empty, http and https values', () => {
		const pattern = new RegExp(property.pattern!);
		const values = ['', 'http://127.0.0.1:8080/proxy.pac', 'https://proxy.example.com/proxy.pac', 'file:///C:/proxy.pac', 'ftp://proxy.example.com/proxy.pac', 'proxy.pac'];

		assert.deepStrictEqual(values.map(value => pattern.test(value)), [true, true, true, false, false, false]);
	});
});
