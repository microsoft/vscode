/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IChannelServer, IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionGalleryManifestIPCService } from '../../common/extensionGalleryManifestServiceIpc.js';
import { ExtensionGalleryResourceType, IExtensionGalleryManifest } from '../../common/extensionGalleryManifest.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';

suite('ExtensionGalleryManifestIPCService', () => {

	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	const MARKETPLACE_URL = 'https://marketplace.example.com';

	const manifest: IExtensionGalleryManifest = {
		version: '1.0',
		resources: [{ id: `${MARKETPLACE_URL}/extensionquery`, type: ExtensionGalleryResourceType.ExtensionQueryService }],
		capabilities: { extensionQuery: {} }
	};

	/**
	 * Stands in for the window process, which is the only one that negotiates with the marketplace.
	 * The channel is the sole route by which this process learns what it may authenticate with, so
	 * these tests pin the shape of that call.
	 */
	function createService(): { service: ExtensionGalleryManifestIPCService; push: (...args: unknown[]) => Promise<void> } {
		let channel: IServerChannel<unknown> | undefined;
		const server: IChannelServer<unknown> = {
			registerChannel: (_name: string, serverChannel: IServerChannel<unknown>) => { channel = serverChannel; }
		};

		const service = disposableStore.add(new ExtensionGalleryManifestIPCService(
			server,
			new NullLogService(),
			{ extensionsGallery: undefined } as IProductService
		));
		return {
			service,
			push: async (...args: unknown[]) => { await channel!.call(undefined, 'setExtensionGalleryManifest', args); }
		};
	}

	test('a pushed token authenticates the marketplace it was pushed for', async () => {
		const { service, push } = createService();

		await push(manifest, 'resource-token', MARKETPLACE_URL);

		assert.deepStrictEqual(await service.getAuthorizationHeaders(`${MARKETPLACE_URL}/vsix`), { Authorization: 'Bearer resource-token' });
	});

	test('a pushed token is withheld from every other origin', async () => {
		const { service, push } = createService();

		await push(manifest, 'resource-token', MARKETPLACE_URL);

		// Upstreamed extensions are downloaded from the public marketplace, which must never be
		// handed a private marketplace's bearer.
		assert.deepStrictEqual(await service.getAuthorizationHeaders('https://marketplace.visualstudio.com/x.vsix'), {});
		assert.deepStrictEqual(await service.getAuthorizationHeaders('http://marketplace.example.com/x.vsix'), {});
	});

	test('an open marketplace pushes no token and authenticates nothing', async () => {
		const { service, push } = createService();

		await push(manifest, undefined, undefined);

		assert.deepStrictEqual(await service.getAuthorizationHeaders(`${MARKETPLACE_URL}/vsix`), {});
	});

	test('retracting the marketplace retracts what it could be reached with', async () => {
		const { service, push } = createService();
		await push(manifest, 'resource-token', MARKETPLACE_URL);

		await push(null, undefined, undefined);

		assert.deepStrictEqual(await service.getAuthorizationHeaders(`${MARKETPLACE_URL}/vsix`), {});
	});
});
