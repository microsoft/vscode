/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getMsalFlows, ExtensionHost, IMsalFlowQuery } from '../flows';

suite('getMsalFlows', () => {
	test('should return all flows for local extension host with supported client and no broker', () => {
		const query: IMsalFlowQuery = {
			extensionHost: ExtensionHost.Local,
			supportedClient: true,
			isBrokerSupported: false
		};
		const flows = getMsalFlows(query);
		assert.strictEqual(flows.length, 3);
		assert.strictEqual(flows[0].label, 'default');
		assert.strictEqual(flows[1].label, 'protocol handler');
		assert.strictEqual(flows[2].label, 'device code');
	});

	test('should return only default flow for local extension host with supported client and broker', () => {
		const query: IMsalFlowQuery = {
			extensionHost: ExtensionHost.Local,
			supportedClient: true,
			isBrokerSupported: true
		};
		const flows = getMsalFlows(query);
		assert.strictEqual(flows.length, 1);
		assert.strictEqual(flows[0].label, 'default');
	});

	test('should return protocol handler and device code flows for remote extension host with supported client and no broker', () => {
		const query: IMsalFlowQuery = {
			extensionHost: ExtensionHost.Remote,
			supportedClient: true,
			isBrokerSupported: false
		};
		const flows = getMsalFlows(query);
		assert.strictEqual(flows.length, 2);
		assert.strictEqual(flows[0].label, 'protocol handler');
		assert.strictEqual(flows[1].label, 'device code');
	});

	test('should return no flows for web worker extension host', () => {
		const query: IMsalFlowQuery = {
			extensionHost: ExtensionHost.WebWorker,
			supportedClient: true,
			isBrokerSupported: false
		};
		const flows = getMsalFlows(query);
		assert.strictEqual(flows.length, 0);
	});

	test('should return only default and device code flows for local extension host with unsupported client and no broker', () => {
		const query: IMsalFlowQuery = {
			extensionHost: ExtensionHost.Local,
			supportedClient: false,
			isBrokerSupported: false
		};
		const flows = getMsalFlows(query);
		assert.strictEqual(flows.length, 2);
		assert.strictEqual(flows[0].label, 'default');
		assert.strictEqual(flows[1].label, 'device code');
	});

	test('should return only device code flow for remote extension host with unsupported client and no broker', () => {
		const query: IMsalFlowQuery = {
			extensionHost: ExtensionHost.Remote,
			supportedClient: false,
			isBrokerSupported: false
		};
		const flows = getMsalFlows(query);
		assert.strictEqual(flows.length, 1);
		assert.strictEqual(flows[0].label, 'device code');
	});

	test('should return default flow for local extension host with unsupported client and broker', () => {
		const query: IMsalFlowQuery = {
			extensionHost: ExtensionHost.Local,
			supportedClient: false,
			isBrokerSupported: true
		};
		const flows = getMsalFlows(query);
		assert.strictEqual(flows.length, 1);
		assert.strictEqual(flows[0].label, 'default');
	});
});
