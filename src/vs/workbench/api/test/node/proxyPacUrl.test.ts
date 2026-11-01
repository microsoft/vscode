/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isLinux } from '../../../../base/common/platform.js';
import { ConfigurationModel } from '../../../../platform/configuration/common/configurationModels.js';
import { FileSystemProviderCapabilities } from '../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ExtHostConfigProvider } from '../../common/extHostConfiguration.js';
import { IConfigurationInitData, MainThreadConfigurationShape } from '../../common/extHost.protocol.js';
import { IExtHostFileSystemInfo } from '../../common/extHostFileSystemInfo.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';
import { IURITransformerService } from '../../common/extHostUriTransformerService.js';
import { ExtHostWorkspace } from '../../common/extHostWorkspace.js';
import { hasProxyPacUrl } from '../../node/proxyPacUrl.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';

suite('hasProxyPacUrl', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createModel(contents: Record<string, unknown>): ConfigurationModel {
		return new ConfigurationModel(contents, ['http.proxyPacUrl'], [], undefined, new NullLogService());
	}

	function createConfigProvider(data: { defaults?: Record<string, unknown>; policy?: Record<string, unknown>; userLocal?: Record<string, unknown> }): ExtHostConfigProvider {
		const empty = ConfigurationModel.createEmptyModel(new NullLogService());
		const initData: IConfigurationInitData = {
			defaults: data.defaults ? createModel(data.defaults) : empty,
			policy: data.policy ? createModel(data.policy) : empty,
			application: empty,
			userLocal: data.userLocal ? createModel(data.userLocal) : empty,
			userRemote: empty,
			workspace: empty,
			folders: [],
			configurationScopes: []
		};
		const workspace = new ExtHostWorkspace(new TestRPCProtocol(), new class extends mock<IExtHostInitDataService>() { }, new class extends mock<IExtHostFileSystemInfo>() { override getCapabilities() { return isLinux ? FileSystemProviderCapabilities.PathCaseSensitive : undefined; } }, new NullLogService(), new class extends mock<IURITransformerService>() { });
		return new ExtHostConfigProvider(new class extends mock<MainThreadConfigurationShape>() { }, workspace, initData, new NullLogService());
	}

	const pacUrl = 'https://pac.example/proxy.pac';

	test('is set by a user value, a policy value, and not by an empty or whitespace value', () => {
		assert.deepStrictEqual({
			unset: hasProxyPacUrl(createConfigProvider({ defaults: { http: { proxyPacUrl: '' } } })),
			user: hasProxyPacUrl(createConfigProvider({ defaults: { http: { proxyPacUrl: '' } }, userLocal: { http: { proxyPacUrl: pacUrl } } })),
			policy: hasProxyPacUrl(createConfigProvider({ defaults: { http: { proxyPacUrl: '' } }, policy: { http: { proxyPacUrl: pacUrl } } })),
			whitespace: hasProxyPacUrl(createConfigProvider({ userLocal: { http: { proxyPacUrl: '  ' } } })),
		}, { unset: false, user: true, policy: true, whitespace: false });
	});

	test('a policy value wins over an explicit empty user value', () => {
		const configProvider = createConfigProvider({
			defaults: { http: { proxyPacUrl: '' } },
			policy: { http: { proxyPacUrl: pacUrl } },
			userLocal: { http: { proxyPacUrl: '' } },
		});

		assert.strictEqual(hasProxyPacUrl(configProvider), true);
	});
});
