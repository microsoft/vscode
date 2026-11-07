/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IExtensionGalleryService, IExtensionManagementService, IGalleryExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IIgnoredExtensionsManagementService } from '../../../../../platform/userDataSync/common/ignoredExtensions.js';
import { IExtensionManagementServer, IExtensionManagementServerService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionManifestPropertiesService } from '../../../../services/extensions/common/extensionManifestPropertiesService.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IExtension, IExtensionsWorkbenchService } from '../../common/extensions.js';
import { InstallRemoteExtensionsContribution, RemoteExtensionsInitializer } from '../../electron-browser/remoteExtensionsInit.js';

suite('Remote extensions initialization', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
	});

	test('waits for locally installed extensions to finish installing remotely', async () => {
		const installation = new DeferredPromise<void>();
		const started = new DeferredPromise<void>();
		const localServer = {} as IExtensionManagementServer;
		const remoteServer = {} as IExtensionManagementServer;
		const extension = { identifier: { id: 'test.extension' } } as IExtension;
		instantiationService.stub(IRemoteAgentService, { getConnection: () => null });
		instantiationService.stub(IExtensionManagementServerService, { localExtensionManagementServer: localServer, remoteExtensionManagementServer: remoteServer });
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ 'remote.defaultExtensionsIfInstalledLocally': [extension.identifier.id] }));
		instantiationService.stub(IExtensionsWorkbenchService, {
			queryLocal: async server => server === localServer ? [extension] : [],
			installInServer: async () => {
				started.complete();
				await installation.p;
			}
		});
		const contribution = instantiationService.createInstance(InstallRemoteExtensionsContribution);
		instantiationService.stub(IRemoteAgentService, 'getConnection', () => ({}));
		let finished = false;
		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Await the private operation without changing the contribution's public API.
		const pending = contribution['installExtensionsIfInstalledLocallyInRemote']().then(() => { finished = true; });
		await started.p;
		// Allow the queries and allSettled to finish if installation promises were dropped.
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		try {
			assert.strictEqual(finished, false);
		} finally {
			await installation.complete();
			await pending;
		}
	});

	for (const firstPreRelease of [false, true]) {
		test(`preserves each synced extension's pre-release choice (first: ${firstPreRelease})`, async () => {
			const extensions = [
				{ identifier: { id: 'test.first' }, installed: true, preRelease: firstPreRelease },
				{ identifier: { id: 'test.second' }, installed: true, preRelease: !firstPreRelease }
			];
			const installed: { id: string; preRelease: boolean | undefined }[] = [];
			instantiationService.stub(IEnvironmentService, { userDataSyncHome: URI.file('/sync') });
			instantiationService.stub(IUriIdentityService, { extUri });
			instantiationService.stub(IIgnoredExtensionsManagementService, { hasToNeverSyncExtension: () => false });
			instantiationService.stub(IExtensionManagementService, {
				getInstalled: async () => [],
				getTargetPlatform: async () => undefined!,
				installFromGallery: async (extension, options) => {
					installed.push({ id: extension.identifier.id, preRelease: options?.installPreReleaseVersion });
					return undefined!;
				}
			});
			instantiationService.stub(IExtensionGalleryService, {
				getExtensions: async () => extensions.map(extension => ({ identifier: extension.identifier } as IGalleryExtension)).reverse(),
				getManifest: async () => ({ name: 'test', publisher: 'test', version: '1.0.0', engines: { vscode: '*' } })
			});
			instantiationService.stub(IExtensionManifestPropertiesService, { canExecuteOnWorkspace: () => true });
			const initializer = instantiationService.createInstance(RemoteExtensionsInitializer);
			await initializer.initialize({ ref: '1', content: JSON.stringify({ version: 6, machineId: 'test', content: JSON.stringify(extensions) }) });
			assert.deepStrictEqual(installed.sort((a, b) => a.id.localeCompare(b.id)), extensions.map(extension => ({ id: extension.identifier.id, preRelease: extension.preRelease })));
		});
	}
});
