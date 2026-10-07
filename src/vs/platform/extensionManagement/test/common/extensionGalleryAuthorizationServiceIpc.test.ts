/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IChannelServer, IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionGalleryAuthorizationIPCService } from '../../common/extensionGalleryAuthorizationServiceIpc.js';

suite('ExtensionGalleryAuthorizationIPCService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const MARKETPLACE_URL = 'https://marketplace.example.com';

	function createService(): { service: ExtensionGalleryAuthorizationIPCService; push: (...args: unknown[]) => Promise<void> } {
		let channel: IServerChannel<unknown> | undefined;
		const server: IChannelServer<unknown> = {
			registerChannel: (_name: string, serverChannel: IServerChannel<unknown>) => { channel = serverChannel; }
		};

		const service = disposables.add(new ExtensionGalleryAuthorizationIPCService(server));
		return {
			service,
			push: async (...args: unknown[]) => { await channel!.call(undefined, 'setAuthorization', args); }
		};
	}

	test('a pushed token authenticates the marketplace it was pushed for', async () => {
		const { service, push } = createService();

		await push('resource-token', MARKETPLACE_URL);

		assert.strictEqual(await service.getAccessToken(`${MARKETPLACE_URL}/vsix`), 'resource-token');
	});

	test('a pushed token is withheld from every other origin', async () => {
		const { service, push } = createService();

		await push('resource-token', MARKETPLACE_URL);

		// Upstreamed extensions are downloaded from the public marketplace, which must never be
		// handed a private marketplace's bearer.
		assert.deepStrictEqual(await Promise.all([
			'https://marketplace.visualstudio.com/x.vsix',
			'http://marketplace.example.com/x.vsix',
			'https://marketplace.example.com:8443/x.vsix',
			'https://child.marketplace.example.com/x.vsix',
			'https://marketplace.example.com.attacker.test/x.vsix',
			'not a url',
		].map(url => service.getAccessToken(url))), Array(6).fill(undefined));
	});

	test('an open marketplace pushes no token and authenticates nothing', async () => {
		const { service, push } = createService();

		await push(undefined, undefined);

		assert.strictEqual(await service.getAccessToken(`${MARKETPLACE_URL}/vsix`), undefined);
	});

	test('tokens require a secure marketplace origin', async () => {
		const { service, push } = createService();
		const tokens: (string | undefined)[] = [];
		for (const serviceUrl of ['http://marketplace.example.com', 'not a url', undefined]) {
			await push('resource-token', serviceUrl);
			tokens.push(await service.getAccessToken(`${MARKETPLACE_URL}/vsix`));
		}

		assert.deepStrictEqual(tokens, [undefined, undefined, undefined]);
	});

	test('secure origin matching is case insensitive', async () => {
		const { service, push } = createService();
		await push('resource-token', MARKETPLACE_URL);

		assert.strictEqual(await service.getAccessToken('https://MARKETPLACE.EXAMPLE.COM/vsix'), 'resource-token');
	});

	test('retracting the marketplace retracts what it could be reached with', async () => {
		const { service, push } = createService();
		await push('resource-token', MARKETPLACE_URL);

		await push(undefined, undefined);

		assert.strictEqual(await service.getAccessToken(`${MARKETPLACE_URL}/vsix`), undefined);
	});
});
