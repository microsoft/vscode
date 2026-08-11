/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { IDefaultChatAgent } from '../../../../base/common/product.js';
import { IRequestContext, IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { AuthInfo, Credentials, IRequestService } from '../../../request/common/request.js';
import { getAllowedManagedSettingsUrls, ManagedSettingsRequestChannel } from '../../common/managedSettingsRequestIpc.js';

suite('ManagedSettingsRequestChannel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('constructs a fixed request for an allowed endpoint', async () => {
		const requestService = new TestRequestService();
		const channel = new ManagedSettingsRequestChannel(
			requestService,
			() => ['https://api.github.com/copilot_internal/managed_settings'],
			'vscode/1.2.3',
		);

		await channel.call(undefined, 'request', [{
			url: 'https://api.github.com/copilot_internal/managed_settings',
			authorization: 'Bearer token',
		}]);

		assert.deepStrictEqual(requestService.lastOptions, {
			type: 'GET',
			url: 'https://api.github.com/copilot_internal/managed_settings',
			disableCache: true,
			followRedirects: 0,
			timeout: 5000,
			headers: {
				Authorization: 'Bearer token',
				'User-Agent': 'vscode/1.2.3',
			},
			callSite: 'defaultAccount.managedSettings',
		});
	});

	test('rejects renderer-controlled endpoints and commands', async () => {
		const channel = new ManagedSettingsRequestChannel(
			new TestRequestService(),
			() => ['https://api.github.com/copilot_internal/managed_settings'],
			'vscode/1.2.3',
		);

		await assert.rejects(channel.call(undefined, 'request', [{
			url: 'https://example.com/copilot_internal/managed_settings',
			authorization: 'Bearer token',
		}]), /URL is not allowed/);
		await assert.rejects(channel.call(undefined, 'resolveProxy'), /Invalid managed settings request/);
	});

	test('resolves default and configured enterprise endpoints', () => {
		const defaultChatAgent = new class extends mock<IDefaultChatAgent>() {
			override readonly managedSettingsUrl = 'https://api.github.com/copilot_internal/managed_settings';
			override readonly completionsAdvancedSetting = 'github.copilot.advanced';
			override readonly providerUriSetting = 'github-enterprise.uri';
			override readonly provider = {
				default: { id: 'github', name: 'GitHub' },
				enterprise: { id: 'github-enterprise', name: 'GitHub Enterprise' },
				google: { id: 'google', name: 'Google' },
				apple: { id: 'apple', name: 'Apple' },
			};
		}();
		const configurationService = new TestConfigurationService({
			'github.copilot.advanced.authProvider': 'github-enterprise',
			'github-enterprise.uri': 'https://ghe.example.com',
		});

		assert.deepStrictEqual(getAllowedManagedSettingsUrls(defaultChatAgent, configurationService, new NullLogService()), [
			'https://api.github.com/copilot_internal/managed_settings',
			'https://api.ghe.example.com/copilot_internal/managed_settings',
		]);
	});
});

class TestRequestService implements IRequestService {
	readonly _serviceBrand: undefined;
	readonly onDidCompleteRequest = Event.None;
	lastOptions: IRequestOptions | undefined;

	async request(options: IRequestOptions): Promise<IRequestContext> {
		this.lastOptions = options;
		return {
			res: { statusCode: 200, headers: {} },
			stream: bufferToStream(VSBuffer.fromString('{}')),
		};
	}

	async resolveProxy(): Promise<string | undefined> { return undefined; }
	async lookupAuthorization(_authInfo: AuthInfo): Promise<Credentials | undefined> { return undefined; }
	async lookupKerberosAuthorization(): Promise<string | undefined> { return undefined; }
	async loadCertificates(): Promise<string[]> { return []; }
}
