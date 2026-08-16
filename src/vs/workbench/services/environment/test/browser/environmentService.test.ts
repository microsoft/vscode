/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LogLevel } from '../../../../../platform/log/common/log.js';
import { BrowserWorkbenchEnvironmentService } from '../../browser/environmentService.js';
import { TestProductService } from '../../../../test/common/workbenchTestServices.js';

suite('BrowserWorkbenchEnvironmentService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('gets enabled extension proposed API from workbench options', () => {
		const empty = new BrowserWorkbenchEnvironmentService('', URI.file('logs'), { enabledExtensionProposedApi: [] }, TestProductService);
		const populated = new BrowserWorkbenchEnvironmentService('', URI.file('logs'), { enabledExtensionProposedApi: ['publisher.extension'] }, TestProductService);

		assert.deepStrictEqual({
			empty: empty.extensionEnabledProposedApi,
			populated: populated.extensionEnabledProposedApi
		}, {
			empty: [],
			populated: ['publisher.extension']
		});
	});

	const privilegedPayload: [string, string][] = [
		['extensionDevelopmentPath', 'file:///extension'],
		['extensionDevelopmentKind', 'workspace'],
		['extensionTestsPath', 'file:///extension/test.js'],
		['debugRenderer', 'true'],
		['debugId', 'debug-id'],
		['inspect-brk-extensions', '1234'],
		['extensionEnvironment', JSON.stringify({ NODE_OPTIONS: '--import=data:text/javascript,' })],
		['enableProposedApi', '']
	];

	test('ignores extension host options from payload in production', () => {
		const environmentService = new BrowserWorkbenchEnvironmentService('', URI.file('/logs'), {
			developmentOptions: { logLevel: LogLevel.Info },
			workspaceProvider: {
				workspace: undefined,
				trusted: true,
				payload: privilegedPayload,
				open: async () => true
			}
		}, { ...TestProductService, commit: 'built' });

		assert.deepStrictEqual({
			debugExtensionHost: environmentService.debugExtensionHost,
			debugRenderer: environmentService.debugRenderer,
			isExtensionDevelopment: environmentService.isExtensionDevelopment,
			extensionDevelopmentLocationURI: environmentService.extensionDevelopmentLocationURI,
			extensionDevelopmentLocationKind: environmentService.extensionDevelopmentLocationKind,
			extensionTestsLocationURI: environmentService.extensionTestsLocationURI,
			extensionEnabledProposedApi: environmentService.extensionEnabledProposedApi
		}, {
			debugExtensionHost: { port: null, break: false },
			debugRenderer: false,
			isExtensionDevelopment: false,
			extensionDevelopmentLocationURI: undefined,
			extensionDevelopmentLocationKind: undefined,
			extensionTestsLocationURI: undefined,
			extensionEnabledProposedApi: undefined
		});
	});

	test('accepts extension host options from payload in development', () => {
		const environmentService = new BrowserWorkbenchEnvironmentService('', URI.file('/logs'), {
			workspaceProvider: {
				workspace: undefined,
				trusted: true,
				payload: privilegedPayload,
				open: async () => true
			}
		}, TestProductService);

		assert.deepStrictEqual({
			debugExtensionHost: environmentService.debugExtensionHost,
			debugRenderer: environmentService.debugRenderer,
			isExtensionDevelopment: environmentService.isExtensionDevelopment,
			extensionDevelopmentLocationURI: environmentService.extensionDevelopmentLocationURI,
			extensionDevelopmentLocationKind: environmentService.extensionDevelopmentLocationKind,
			extensionTestsLocationURI: environmentService.extensionTestsLocationURI,
			extensionEnabledProposedApi: environmentService.extensionEnabledProposedApi
		}, {
			debugExtensionHost: {
				port: 1234,
				break: true,
				debugId: 'debug-id',
				env: { NODE_OPTIONS: '--import=data:text/javascript,' }
			},
			debugRenderer: true,
			isExtensionDevelopment: true,
			extensionDevelopmentLocationURI: [URI.parse('file:///extension')],
			extensionDevelopmentLocationKind: ['workspace'],
			extensionTestsLocationURI: URI.parse('file:///extension/test.js'),
			extensionEnabledProposedApi: []
		});
	});

	test('accepts extension host options from payload in production smoke tests', () => {
		const environmentService = new BrowserWorkbenchEnvironmentService('', URI.file('/logs'), {
			developmentOptions: { enableSmokeTestDriver: true, logLevel: LogLevel.Info },
			workspaceProvider: {
				workspace: undefined,
				trusted: true,
				payload: privilegedPayload,
				open: async () => true
			}
		}, { ...TestProductService, commit: 'built' });

		assert.deepStrictEqual({
			debugExtensionHost: environmentService.debugExtensionHost,
			debugRenderer: environmentService.debugRenderer,
			isExtensionDevelopment: environmentService.isExtensionDevelopment,
			extensionDevelopmentLocationURI: environmentService.extensionDevelopmentLocationURI,
			extensionDevelopmentLocationKind: environmentService.extensionDevelopmentLocationKind,
			extensionTestsLocationURI: environmentService.extensionTestsLocationURI,
			extensionEnabledProposedApi: environmentService.extensionEnabledProposedApi
		}, {
			debugExtensionHost: {
				port: 1234,
				break: true,
				debugId: 'debug-id',
				env: { NODE_OPTIONS: '--import=data:text/javascript,' }
			},
			debugRenderer: true,
			isExtensionDevelopment: true,
			extensionDevelopmentLocationURI: [URI.parse('file:///extension')],
			extensionDevelopmentLocationKind: ['workspace'],
			extensionTestsLocationURI: URI.parse('file:///extension/test.js'),
			extensionEnabledProposedApi: []
		});
	});
});
