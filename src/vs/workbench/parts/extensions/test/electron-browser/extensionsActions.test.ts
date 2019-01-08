/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { assign } from 'vs/base/common/objects';
import { generateUuid } from 'vs/base/common/uuid';
import { IExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/common/extensions';
import * as ExtensionsActions from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import { ExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/node/extensionsWorkbenchService';
import {
	IExtensionManagementService, IExtensionGalleryService, IExtensionEnablementService, IExtensionTipsService, ILocalExtension, LocalExtensionType, IGalleryExtension,
	DidInstallExtensionEvent, DidUninstallExtensionEvent, InstallExtensionEvent, IExtensionIdentifier, EnablementState, InstallOperation, IExtensionManagementServerService, IExtensionManagementServer, IExtensionContributions
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionId, getGalleryExtensionIdFromLocal } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionManagementService, getLocalExtensionIdFromGallery, getLocalExtensionIdFromManifest } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionTipsService } from 'vs/workbench/parts/extensions/electron-browser/extensionTipsService';
import { TestExtensionEnablementService } from 'vs/platform/extensionManagement/test/electron-browser/extensionEnablementService.test';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { IURLService } from 'vs/platform/url/common/url';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Emitter } from 'vs/base/common/event';
import { IPager } from 'vs/base/common/paging';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TestContextService, TestWindowService } from 'vs/workbench/test/workbenchTestServices';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { URLService } from 'vs/platform/url/common/urlService';
import { URI } from 'vs/base/common/uri';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ExtensionManagementServerService } from 'vs/workbench/services/extensions/node/extensionManagementServerService';
import { IRemoteAgentService } from 'vs/workbench/services/remote/node/remoteAgentService';
import { RemoteAgentService } from 'vs/workbench/services/remote/electron-browser/remoteAgentServiceImpl';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

suite('ExtensionsActions Test', () => {

	let instantiationService: TestInstantiationService;

	let installEvent: Emitter<InstallExtensionEvent>,
		didInstallEvent: Emitter<DidInstallExtensionEvent>,
		uninstallEvent: Emitter<IExtensionIdentifier>,
		didUninstallEvent: Emitter<DidUninstallExtensionEvent>;


	suiteSetup(() => {
		installEvent = new Emitter<InstallExtensionEvent>();
		didInstallEvent = new Emitter<DidInstallExtensionEvent>();
		uninstallEvent = new Emitter<IExtensionIdentifier>();
		didUninstallEvent = new Emitter<DidUninstallExtensionEvent>();

		instantiationService = new TestInstantiationService();
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(ILogService, NullLogService);
		instantiationService.stub(IWindowService, TestWindowService);

		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());

		instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);


		instantiationService.stub(IExtensionManagementService, ExtensionManagementService);
		instantiationService.stub(IExtensionManagementService, 'onInstallExtension', installEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onDidInstallExtension', didInstallEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onUninstallExtension', uninstallEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onDidUninstallExtension', didUninstallEvent.event);
		instantiationService.stub(IRemoteAgentService, RemoteAgentService);

		instantiationService.stub(IExtensionManagementServerService, instantiationService.createInstance(ExtensionManagementServerService, <IExtensionManagementServer>{ authority: 'vscode-local', extensionManagementService: instantiationService.get(IExtensionManagementService), label: 'local' }));

		instantiationService.stub(IExtensionEnablementService, new TestExtensionEnablementService(instantiationService));

		instantiationService.set(IExtensionTipsService, instantiationService.createInstance(ExtensionTipsService));
		instantiationService.stub(IURLService, URLService);
	});

	setup(async () => {
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', []);
		instantiationService.stubPromise(IExtensionManagementService, 'getExtensionsReport', []);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage());
		instantiationService.stub(IExtensionService, { getExtensions: () => Promise.resolve([]) });
		await (<TestExtensionEnablementService>instantiationService.get(IExtensionEnablementService)).reset();

		instantiationService.set(IExtensionsWorkbenchService, instantiationService.createInstance(ExtensionsWorkbenchService));
	});

	teardown(() => {
		(<ExtensionsWorkbenchService>instantiationService.get(IExtensionsWorkbenchService)).dispose();
	});

	test('Install action is disabled when there is no extension', () => {
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction);

		assert.ok(!testObject.enabled);
	});

	test('Test Install action when state is installed', () => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		return workbenchService.queryLocal()
			.then(() => {
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier })));
				return workbenchService.queryGallery()
					.then((paged) => {
						testObject.extension = paged.firstPage[0];
						assert.ok(!testObject.enabled);
						assert.equal('Install', testObject.label);
						assert.equal('extension-action prominent install', testObject.class);
					});
			});
	});

	test('Test Install action when state is installing', () => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		return workbenchService.queryGallery()
			.then((paged) => {
				testObject.extension = paged.firstPage[0];
				installEvent.fire({ identifier: gallery.identifier, gallery });

				assert.ok(!testObject.enabled);
				assert.equal('Installing', testObject.label);
				assert.equal('extension-action install installing', testObject.class);
			});
	});

	test('Test Install action when state is uninstalled', () => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		return workbenchService.queryGallery()
			.then((paged) => {
				testObject.extension = paged.firstPage[0];
				assert.ok(testObject.enabled);
				assert.equal('Install', testObject.label);
			});
	});

	test('Test Install action when extension is system action', () => {
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a', {}, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				uninstallEvent.fire(local.identifier);
				didUninstallEvent.fire({ identifier: local.identifier });
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test Install action when extension doesnot has gallery', () => {
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				uninstallEvent.fire(local.identifier);
				didUninstallEvent.fire({ identifier: local.identifier });
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Uninstall action is disabled when there is no extension', () => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());

		assert.ok(!testObject.enabled);
	});

	test('Test Uninstall action when state is uninstalling', () => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				uninstallEvent.fire(local.identifier);
				assert.ok(!testObject.enabled);
				assert.equal('Uninstalling', testObject.label);
				assert.equal('extension-action uninstall uninstalling', testObject.class);
			});
	});

	test('Test Uninstall action when state is installed and is user extension', () => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
				assert.equal('Uninstall', testObject.label);
				assert.equal('extension-action uninstall', testObject.class);
			});
	});

	test('Test Uninstall action when state is installed and is system extension', () => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a', {}, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
				assert.equal('Uninstall', testObject.label);
				assert.equal('extension-action uninstall', testObject.class);
			});
	});

	test('Test Uninstall action when state is installing and is user extension', () => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const gallery = aGalleryExtension('a');
				const extension = extensions[0];
				extension.gallery = gallery;
				installEvent.fire({ identifier: gallery.identifier, gallery });
				testObject.extension = extension;
				assert.ok(!testObject.enabled);
			});
	});

	test('Test Uninstall action after extension is installed', () => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery()
			.then(paged => {
				testObject.extension = paged.firstPage[0];

				installEvent.fire({ identifier: gallery.identifier, gallery });
				didInstallEvent.fire({ identifier: gallery.identifier, gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery) });

				assert.ok(testObject.enabled);
				assert.equal('Uninstall', testObject.label);
				assert.equal('extension-action uninstall', testObject.class);
			});
	});

	test('Test CombinedInstallAction when there is no extension', () => {
		const testObject: ExtensionsActions.CombinedInstallAction = instantiationService.createInstance(ExtensionsActions.CombinedInstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());

		assert.ok(!testObject.enabled);
		assert.equal('extension-action prominent install no-extension', testObject.class);
	});

	test('Test CombinedInstallAction when extension is system extension', () => {
		const testObject: ExtensionsActions.CombinedInstallAction = instantiationService.createInstance(ExtensionsActions.CombinedInstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a', {}, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
				assert.equal('extension-action prominent install no-extension', testObject.class);
			});
	});

	test('Test CombinedInstallAction when installAction is enabled', () => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.CombinedInstallAction = instantiationService.createInstance(ExtensionsActions.CombinedInstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return workbenchService.queryGallery()
			.then((paged) => {
				testObject.extension = paged.firstPage[0];
				assert.ok(testObject.enabled);
				assert.equal('Install', testObject.label);
				assert.equal('extension-action prominent install', testObject.class);
			});
	});

	test('Test CombinedInstallAction when unInstallAction is enabled', () => {
		const testObject: ExtensionsActions.CombinedInstallAction = instantiationService.createInstance(ExtensionsActions.CombinedInstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
				assert.equal('Uninstall', testObject.label);
				assert.equal('extension-action uninstall', testObject.class);
			});
	});

	test('Test CombinedInstallAction when state is installing', () => {
		const testObject: ExtensionsActions.CombinedInstallAction = instantiationService.createInstance(ExtensionsActions.CombinedInstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		return workbenchService.queryGallery()
			.then((paged) => {
				testObject.extension = paged.firstPage[0];
				installEvent.fire({ identifier: gallery.identifier, gallery });

				assert.ok(!testObject.enabled);
				assert.equal('Installing', testObject.label);
				assert.equal('extension-action install installing', testObject.class);
			});
	});

	test('Test CombinedInstallAction when state is installing during update', () => {
		const testObject: ExtensionsActions.CombinedInstallAction = instantiationService.createInstance(ExtensionsActions.CombinedInstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const gallery = aGalleryExtension('a');
				const extension = extensions[0];
				extension.gallery = gallery;
				testObject.extension = extension;
				installEvent.fire({ identifier: gallery.identifier, gallery });
				assert.ok(!testObject.enabled);
				assert.equal('Installing', testObject.label);
				assert.equal('extension-action install installing', testObject.class);
			});
	});

	test('Test CombinedInstallAction when state is uninstalling', () => {
		const testObject: ExtensionsActions.CombinedInstallAction = instantiationService.createInstance(ExtensionsActions.CombinedInstallAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				uninstallEvent.fire(local.identifier);
				assert.ok(!testObject.enabled);
				assert.equal('Uninstalling', testObject.label);
				assert.equal('extension-action uninstall uninstalling', testObject.class);
			});
	});

	test('Test UpdateAction when there is no extension', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());

		assert.ok(!testObject.enabled);
	});

	test('Test UpdateAction when extension is uninstalled', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const gallery = aGalleryExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		return instantiationService.get(IExtensionsWorkbenchService).queryGallery()
			.then((paged) => {
				testObject.extension = paged.firstPage[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test UpdateAction when extension is installed and not outdated', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier, version: local.manifest.version })));
				return instantiationService.get(IExtensionsWorkbenchService).queryGallery()
					.then(extensions => assert.ok(!testObject.enabled));
			});
	});

	test('Test UpdateAction when extension is installed outdated and system extension', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a', { version: '1.0.0' }, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier, version: '1.0.1' })));
				return instantiationService.get(IExtensionsWorkbenchService).queryGallery()
					.then(extensions => assert.ok(!testObject.enabled));
			});
	});

	test('Test UpdateAction when extension is installed outdated and user extension', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		return workbenchService.queryLocal()
			.then(async extensions => {
				testObject.extension = extensions[0];
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier, version: '1.0.1' })));
				assert.ok(!testObject.enabled);
				return new Promise(c => {
					testObject.onDidChange(() => {
						if (testObject.enabled) {
							c();
						}
					});
					instantiationService.get(IExtensionsWorkbenchService).queryGallery();
				});
			});
	});

	test('Test UpdateAction when extension is installing and outdated and user extension', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.1' });
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
				return instantiationService.get(IExtensionsWorkbenchService).queryGallery()
					.then(extensions => {
						installEvent.fire({ identifier: local.identifier, gallery });
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test ManageExtensionAction when there is no extension', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());

		assert.ok(!testObject.enabled);
	});

	test('Test ManageExtensionAction when extension is installed', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
				assert.equal('extension-action manage', testObject.class);
				assert.equal('', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is uninstalled', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery()
			.then(page => {
				testObject.extension = page.firstPage[0];
				assert.ok(!testObject.enabled);
				assert.equal('extension-action manage hide', testObject.class);
				assert.equal('', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is installing', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery()
			.then(page => {
				testObject.extension = page.firstPage[0];

				installEvent.fire({ identifier: gallery.identifier, gallery });
				assert.ok(!testObject.enabled);
				assert.equal('extension-action manage hide', testObject.class);
				assert.equal('', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is queried from gallery and installed', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery()
			.then(page => {
				testObject.extension = page.firstPage[0];
				installEvent.fire({ identifier: gallery.identifier, gallery });
				didInstallEvent.fire({ identifier: gallery.identifier, gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery) });

				assert.ok(testObject.enabled);
				assert.equal('extension-action manage', testObject.class);
				assert.equal('', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is system extension', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a', {}, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
				assert.equal('extension-action manage', testObject.class);
				assert.equal('', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is uninstalling', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				uninstallEvent.fire(local.identifier);

				assert.ok(!testObject.enabled);
				assert.equal('extension-action manage', testObject.class);
				assert.equal('Uninstalling', testObject.tooltip);
			});
	});

	test('Test EnableForWorkspaceAction when there is no extension', () => {
		const testObject: ExtensionsActions.EnableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction);

		assert.ok(!testObject.enabled);
	});

	test('Test EnableForWorkspaceAction when there extension is not disabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.EnableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction);
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableForWorkspaceAction when the extension is disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.Disabled)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction);
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableForWorkspaceAction when extension is disabled for workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.WorkspaceDisabled)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction);
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableForWorkspaceAction when the extension is disabled globally and workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.Disabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.WorkspaceDisabled))
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction);
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableGloballyAction when there is no extension', () => {
		const testObject: ExtensionsActions.EnableGloballyAction = instantiationService.createInstance(ExtensionsActions.EnableGloballyAction);

		assert.ok(!testObject.enabled);
	});

	test('Test EnableGloballyAction when the extension is not disabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.EnableGloballyAction = instantiationService.createInstance(ExtensionsActions.EnableGloballyAction);
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableGloballyAction when the extension is disabled for workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.WorkspaceDisabled)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableGloballyAction = instantiationService.createInstance(ExtensionsActions.EnableGloballyAction);
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test EnableGloballyAction when the extension is disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.Disabled)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableGloballyAction = instantiationService.createInstance(ExtensionsActions.EnableGloballyAction);
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableGloballyAction when the extension is disabled in both', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.Disabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.WorkspaceDisabled))
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableGloballyAction = instantiationService.createInstance(ExtensionsActions.EnableGloballyAction);
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test EnableAction when there is no extension', () => {
		const testObject: ExtensionsActions.EnableDropDownAction = instantiationService.createInstance(ExtensionsActions.EnableDropDownAction, []);

		assert.ok(!testObject.enabled);
	});

	test('Test EnableDropDownAction when extension is installed and enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.EnableDropDownAction = instantiationService.createInstance(ExtensionsActions.EnableDropDownAction, []);
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableDropDownAction when extension is installed and disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.Disabled)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableDropDownAction = instantiationService.createInstance(ExtensionsActions.EnableDropDownAction, []);
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableDropDownAction when extension is installed and disabled for workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.WorkspaceDisabled)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableDropDownAction = instantiationService.createInstance(ExtensionsActions.EnableDropDownAction, []);
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableDropDownAction when extension is uninstalled', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery()
			.then(page => {
				const testObject: ExtensionsActions.EnableDropDownAction = instantiationService.createInstance(ExtensionsActions.EnableDropDownAction, []);
				testObject.extension = page.firstPage[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableDropDownAction when extension is installing', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery()
			.then(page => {
				const testObject: ExtensionsActions.EnableDropDownAction = instantiationService.createInstance(ExtensionsActions.EnableDropDownAction, []);
				testObject.extension = page.firstPage[0];
				instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());

				installEvent.fire({ identifier: gallery.identifier, gallery });
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableDropDownAction when extension is uninstalling', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.EnableDropDownAction = instantiationService.createInstance(ExtensionsActions.EnableDropDownAction, []);
				testObject.extension = extensions[0];
				uninstallEvent.fire(local.identifier);
				assert.ok(!testObject.enabled);
			});
	});

	test('Test DisableForWorkspaceAction when there is no extension', () => {
		const testObject: ExtensionsActions.DisableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction, []);

		assert.ok(!testObject.enabled);
	});

	test('Test DisableForWorkspaceAction when the extension is disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.Disabled)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction, []);
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableForWorkspaceAction when the extension is disabled workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.Disabled)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction, []);
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableForWorkspaceAction when extension is enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction, [{ identifier: new ExtensionIdentifier('pub.a'), extensionLocation: URI.file('pub.a') }]);
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when there is no extension', () => {
		const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction, []);

		assert.ok(!testObject.enabled);
	});

	test('Test DisableGloballyAction when the extension is disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.Disabled)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction, []);
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableGloballyAction when the extension is disabled for workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.WorkspaceDisabled)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction, []);
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableGloballyAction when the extension is enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction, [{ identifier: new ExtensionIdentifier('pub.a'), extensionLocation: URI.file('pub.a') }]);
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
			});
	});

	test('Test DisableDropDownAction when there is no extension', () => {
		const testObject: ExtensionsActions.DisableDropDownAction = instantiationService.createInstance(ExtensionsActions.DisableDropDownAction, []);

		assert.ok(!testObject.enabled);
	});

	test('Test DisableDropDownAction when extension is installed and enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableDropDownAction = instantiationService.createInstance(ExtensionsActions.DisableDropDownAction, [{ identifier: new ExtensionIdentifier('pub.a'), extensionLocation: URI.file('pub.a') }]);
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
			});
	});

	test('Test DisableDropDownAction when extension is installed and disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.Disabled)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableDropDownAction = instantiationService.createInstance(ExtensionsActions.DisableDropDownAction, [{ identifier: new ExtensionIdentifier('pub.a'), extensionLocation: URI.file('pub.a') }]);
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableDropDownAction when extension is installed and disabled for workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.WorkspaceDisabled)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableDropDownAction = instantiationService.createInstance(ExtensionsActions.DisableDropDownAction, [{ identifier: new ExtensionIdentifier('pub.a'), extensionLocation: URI.file('pub.a') }]);
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableDropDownAction when extension is uninstalled', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery()
			.then(page => {
				const testObject: ExtensionsActions.DisableDropDownAction = instantiationService.createInstance(ExtensionsActions.DisableDropDownAction, [{ identifier: new ExtensionIdentifier('pub.a'), extensionLocation: URI.file('pub.a') }]);
				testObject.extension = page.firstPage[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test DisableDropDownAction when extension is installing', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery()
			.then(page => {
				const testObject: ExtensionsActions.DisableDropDownAction = instantiationService.createInstance(ExtensionsActions.DisableDropDownAction, [{ identifier: new ExtensionIdentifier('pub.a'), extensionLocation: URI.file('pub.a') }]);
				testObject.extension = page.firstPage[0];
				instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
				installEvent.fire({ identifier: gallery.identifier, gallery });
				assert.ok(!testObject.enabled);
			});
	});

	test('Test DisableDropDownAction when extension is uninstalling', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableDropDownAction = instantiationService.createInstance(ExtensionsActions.DisableDropDownAction, [{ identifier: new ExtensionIdentifier('pub.a'), extensionLocation: URI.file('pub.a') }]);
				testObject.extension = extensions[0];
				instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
				uninstallEvent.fire(local.identifier);
				assert.ok(!testObject.enabled);
			});
	});

	test('Test UpdateAllAction when no installed extensions', () => {
		const testObject: ExtensionsActions.UpdateAllAction = instantiationService.createInstance(ExtensionsActions.UpdateAllAction, 'id', 'label');

		assert.ok(!testObject.enabled);
	});

	test('Test UpdateAllAction when installed extensions are not outdated', () => {
		const testObject: ExtensionsActions.UpdateAllAction = instantiationService.createInstance(ExtensionsActions.UpdateAllAction, 'id', 'label');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a'), aLocalExtension('b')]);
		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => assert.ok(!testObject.enabled));
	});

	test('Test UpdateAllAction when some installed extensions are outdated', () => {
		const testObject: ExtensionsActions.UpdateAllAction = instantiationService.createInstance(ExtensionsActions.UpdateAllAction, 'id', 'label');
		const local = [aLocalExtension('a', { version: '1.0.1' }), aLocalExtension('b', { version: '1.0.1' }), aLocalExtension('c', { version: '1.0.1' })];
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', local);
		return workbenchService.queryLocal()
			.then(async () => {
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local[0].identifier, version: '1.0.2' }), aGalleryExtension('b', { identifier: local[1].identifier, version: '1.0.2' }), aGalleryExtension('c', local[2].manifest)));
				assert.ok(!testObject.enabled);
				return new Promise(c => {
					testObject.onDidChange(() => {
						if (testObject.enabled) {
							c();
						}
					});
					workbenchService.queryGallery();
				});
			});
	});

	test('Test UpdateAllAction when some installed extensions are outdated and some outdated are being installed', () => {
		const testObject: ExtensionsActions.UpdateAllAction = instantiationService.createInstance(ExtensionsActions.UpdateAllAction, 'id', 'label');
		const local = [aLocalExtension('a', { version: '1.0.1' }), aLocalExtension('b', { version: '1.0.1' }), aLocalExtension('c', { version: '1.0.1' })];
		const gallery = [aGalleryExtension('a', { identifier: local[0].identifier, version: '1.0.2' }), aGalleryExtension('b', { identifier: local[1].identifier, version: '1.0.2' }), aGalleryExtension('c', local[2].manifest)];
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', local);
		return workbenchService.queryLocal()
			.then(async () => {
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(...gallery));
				assert.ok(!testObject.enabled);
				return new Promise(c => {
					installEvent.fire({ identifier: local[0].identifier, gallery: gallery[0] });
					testObject.onDidChange(() => {
						if (testObject.enabled) {
							c();
						}
					});
					workbenchService.queryGallery();
				});
			});
	});

	test('Test UpdateAllAction when some installed extensions are outdated and all outdated are being installed', () => {
		const testObject: ExtensionsActions.UpdateAllAction = instantiationService.createInstance(ExtensionsActions.UpdateAllAction, 'id', 'label');
		const local = [aLocalExtension('a', { version: '1.0.1' }), aLocalExtension('b', { version: '1.0.1' }), aLocalExtension('c', { version: '1.0.1' })];
		const gallery = [aGalleryExtension('a', { identifier: local[0].identifier, version: '1.0.2' }), aGalleryExtension('b', { identifier: local[1].identifier, version: '1.0.2' }), aGalleryExtension('c', local[2].manifest)];
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', local);
		return workbenchService.queryLocal()
			.then(() => {
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(...gallery));
				return workbenchService.queryGallery()
					.then(() => {
						installEvent.fire({ identifier: local[0].identifier, gallery: gallery[0] });
						installEvent.fire({ identifier: local[1].identifier, gallery: gallery[1] });
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test ReloadAction when there is no extension', () => {
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());

		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when extension state is installing', () => {
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		return workbenchService.queryGallery()
			.then((paged) => {
				testObject.extension = paged.firstPage[0];
				installEvent.fire({ identifier: gallery.identifier, gallery });

				assert.ok(!testObject.enabled);
			});
	});

	test('Test ReloadAction when extension state is uninstalling', () => {
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				uninstallEvent.fire(local.identifier);
				assert.ok(!testObject.enabled);
			});
	});

	test('Test ReloadAction when extension is newly installed', async () => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ identifier: new ExtensionIdentifier('pub.b'), extensionLocation: URI.file('pub.b') }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery();
		testObject.extension = paged.firstPage[0];
		assert.ok(!testObject.enabled);

		return new Promise(c => {
			testObject.onDidChange(() => {
				if (testObject.enabled && testObject.tooltip === 'Please reload Visual Studio Code to complete the installation of this extension.') {
					c();
				}
			});
			installEvent.fire({ identifier: gallery.identifier, gallery });
			didInstallEvent.fire({ identifier: gallery.identifier, gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery) });
		});
	});

	test('Test ReloadAction when extension is installed and uninstalled', () => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ identifier: new ExtensionIdentifier('pub.b'), extensionLocation: URI.file('pub.b') }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		return instantiationService.get(IExtensionsWorkbenchService).queryGallery()
			.then((paged) => {
				testObject.extension = paged.firstPage[0];
				const identifier = { id: getLocalExtensionIdFromGallery(gallery, gallery.version) };
				installEvent.fire({ identifier: identifier, gallery });
				didInstallEvent.fire({ identifier: identifier, gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, { identifier }) });
				uninstallEvent.fire(identifier);
				didUninstallEvent.fire({ identifier: identifier });

				assert.ok(!testObject.enabled);
			});
	});

	test('Test ReloadAction when extension is uninstalled', async () => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ identifier: new ExtensionIdentifier('pub.a'), extensionLocation: URI.file('pub.a') }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
		testObject.extension = extensions[0];

		return new Promise(c => {
			testObject.onDidChange(() => {
				if (testObject.enabled && testObject.tooltip === 'Please reload Visual Studio Code to complete the uninstallation of this extension.') {
					c();
				}
			});
			uninstallEvent.fire(local.identifier);
			didUninstallEvent.fire({ identifier: local.identifier });
		});
	});

	test('Test ReloadAction when extension is uninstalled and installed', () => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ identifier: new ExtensionIdentifier('pub.a'), version: '1.0.0', extensionLocation: URI.file('pub.a') }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				uninstallEvent.fire(local.identifier);
				didUninstallEvent.fire({ identifier: local.identifier });

				const gallery = aGalleryExtension('a');
				const id = getLocalExtensionIdFromGallery(gallery, gallery.version);
				installEvent.fire({ identifier: { id }, gallery });
				didInstallEvent.fire({ identifier: { id }, gallery, operation: InstallOperation.Install, local });

				assert.ok(!testObject.enabled);
			});
	});

	test('Test ReloadAction when extension is updated while running', async () => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ identifier: new ExtensionIdentifier('pub.a'), version: '1.0.1', extensionLocation: URI.file('pub.a') }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a', { version: '1.0.1' });
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];

		return new Promise(c => {
			testObject.onDidChange(() => {
				if (testObject.enabled && testObject.tooltip === 'Please reload Visual Studio Code to complete the updating of this extension.') {
					c();
				}
			});
			const gallery = aGalleryExtension('a', { uuid: local.identifier.id, version: '1.0.2' });
			installEvent.fire({ identifier: gallery.identifier, gallery });
			didInstallEvent.fire({ identifier: gallery.identifier, gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery) });
		});
	});

	test('Test ReloadAction when extension is updated when not running', () => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ identifier: new ExtensionIdentifier('pub.b'), extensionLocation: URI.file('pub.b') }]);
		const local = aLocalExtension('a', { version: '1.0.1' });
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.Disabled)
			.then(() => {
				const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
				instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
				const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
				return workbenchService.queryLocal()
					.then(extensions => {
						testObject.extension = extensions[0];

						const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.2' });
						installEvent.fire({ identifier: gallery.identifier, gallery });
						didInstallEvent.fire({ identifier: gallery.identifier, gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery) });

						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test ReloadAction when extension is disabled when running', () => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ identifier: new ExtensionIdentifier('pub.a'), extensionLocation: URI.file('pub.a') }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a');
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		return workbenchService.queryLocal().then(extensions => {
			testObject.extension = extensions[0];
			return workbenchService.setEnablement(extensions[0], EnablementState.Disabled)
				.then(() => {
					assert.ok(testObject.enabled);
					assert.equal('Please reload Visual Studio Code to complete the disabling of this extension.', testObject.tooltip);
				});
		});
	});

	test('Test ReloadAction when extension enablement is toggled when running', () => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ identifier: new ExtensionIdentifier('pub.a'), version: '1.0.0', extensionLocation: URI.file('pub.a') }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a');
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		return workbenchService.queryLocal().
			then(extensions => {
				testObject.extension = extensions[0];
				return workbenchService.setEnablement(extensions[0], EnablementState.Disabled)
					.then(() => workbenchService.setEnablement(extensions[0], EnablementState.Enabled))
					.then(() => assert.ok(!testObject.enabled));
			});
	});

	test('Test ReloadAction when extension is enabled when not running', () => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ identifier: new ExtensionIdentifier('pub.b'), extensionLocation: URI.file('pub.b') }]);
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.Disabled)
			.then(() => {
				const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
				instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
				const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
				return workbenchService.queryLocal()
					.then(extensions => {
						testObject.extension = extensions[0];
						return workbenchService.setEnablement(extensions[0], EnablementState.Enabled)
							.then(() => {
								assert.ok(testObject.enabled);
								assert.equal('Please reload Visual Studio Code to complete the enabling of this extension.', testObject.tooltip);
							});
					});
			});
	});

	test('Test ReloadAction when extension enablement is toggled when not running', () => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ identifier: new ExtensionIdentifier('pub.b'), extensionLocation: URI.file('pub.b') }]);
		const local = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.Disabled)
			.then(() => {
				const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
				instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
				const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
				return workbenchService.queryLocal()
					.then(extensions => {
						testObject.extension = extensions[0];
						return workbenchService.setEnablement(extensions[0], EnablementState.Enabled)
							.then(() => workbenchService.setEnablement(extensions[0], EnablementState.Disabled))
							.then(() => assert.ok(!testObject.enabled));
					});
			});
	});

	test('Test ReloadAction when extension is updated when not running and enabled', () => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ identifier: new ExtensionIdentifier('pub.b'), extensionLocation: URI.file('pub.b') }]);
		const local = aLocalExtension('a', { version: '1.0.1' });
		return instantiationService.get(IExtensionEnablementService).setEnablement(local, EnablementState.Disabled)
			.then(() => {
				const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
				instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
				const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
				return workbenchService.queryLocal()
					.then(extensions => {
						testObject.extension = extensions[0];

						const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.2' });
						installEvent.fire({ identifier: gallery.identifier, gallery });
						didInstallEvent.fire({ identifier: gallery.identifier, gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery) });
						return workbenchService.setEnablement(extensions[0], EnablementState.Enabled)
							.then(() => {
								assert.ok(testObject.enabled);
								assert.equal('Please reload Visual Studio Code to complete the enabling of this extension.', testObject.tooltip);
							});

					});
			});
	});

	test('Test ReloadAction when a localization extension is newly installed', async () => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ identifier: new ExtensionIdentifier('pub.b'), extensionLocation: URI.file('pub.b') }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery();
		testObject.extension = paged.firstPage[0];
		assert.ok(!testObject.enabled);

		installEvent.fire({ identifier: gallery.identifier, gallery });
		didInstallEvent.fire({ identifier: gallery.identifier, gallery, operation: InstallOperation.Install, local: aLocalExtension('a', { ...gallery, ...{ contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } } }, gallery) });
		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when a localization extension is updated while running', async () => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ identifier: new ExtensionIdentifier('pub.a'), version: '1.0.1', extensionLocation: URI.file('pub.a') }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.get(IExtensionsWorkbenchService).onChange(() => testObject.update());
		const local = aLocalExtension('a', { version: '1.0.1', contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } });
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];

		const gallery = aGalleryExtension('a', { uuid: local.identifier.id, version: '1.0.2' });
		installEvent.fire({ identifier: gallery.identifier, gallery });
		didInstallEvent.fire({ identifier: gallery.identifier, gallery, operation: InstallOperation.Install, local: aLocalExtension('a', { ...gallery, ...{ contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } } }, gallery) });
		assert.ok(!testObject.enabled);
	});


	test(`RecommendToFolderAction`, () => {
		// TODO: Implement test
	});

	function aLocalExtension(name: string = 'someext', manifest: any = {}, properties: any = {}): ILocalExtension {
		const localExtension = <ILocalExtension>Object.create({ manifest: {} });
		assign(localExtension, { type: LocalExtensionType.User, manifest: {}, location: URI.file(`pub.${name}`) }, properties);
		assign(localExtension.manifest, { name, publisher: 'pub', version: '1.0.0' }, manifest);
		localExtension.identifier = { id: getLocalExtensionIdFromManifest(localExtension.manifest) };
		localExtension.metadata = { id: localExtension.identifier.id, publisherId: localExtension.manifest.publisher, publisherDisplayName: 'somename' };
		localExtension.galleryIdentifier = { id: getGalleryExtensionIdFromLocal(localExtension), uuid: undefined };
		return localExtension;
	}

	function aGalleryExtension(name: string, properties: any = {}, galleryExtensionProperties: any = {}, assets: any = {}): IGalleryExtension {
		const galleryExtension = <IGalleryExtension>Object.create({});
		assign(galleryExtension, { name, publisher: 'pub', version: '1.0.0', properties: {}, assets: {} }, properties);
		assign(galleryExtension.properties, { dependencies: [] }, galleryExtensionProperties);
		assign(galleryExtension.assets, assets);
		galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
		return <IGalleryExtension>galleryExtension;
	}

	function aPage<T>(...objects: T[]): IPager<T> {
		return { firstPage: objects, total: objects.length, pageSize: objects.length, getPage: () => null! };
	}

});
