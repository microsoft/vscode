/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { generateUuid } from 'vs/base/common/uuid';
import { IExtensionsWorkbenchService, ExtensionContainers } from 'vs/workbench/contrib/extensions/common/extensions';
import * as ExtensionsActions from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import { ExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/browser/extensionsWorkbenchService';
import {
	IExtensionManagementService, IExtensionGalleryService, ILocalExtension, IGalleryExtension,
	DidUninstallExtensionEvent, InstallExtensionEvent, IExtensionIdentifier, InstallOperation, IExtensionTipsService, InstallExtensionResult, getTargetPlatform, IExtensionsControlManifest, UninstallExtensionEvent, Metadata
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IExtensionManagementServer, ExtensionInstallLocation, IProfileAwareExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IExtensionRecommendationsService } from 'vs/workbench/services/extensionRecommendations/common/extensionRecommendations';
import { getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { TestExtensionEnablementService } from 'vs/workbench/services/extensionManagement/test/browser/extensionEnablementService.test';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { IURLService } from 'vs/platform/url/common/url';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Emitter, Event } from 'vs/base/common/event';
import { IPager } from 'vs/base/common/paging';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IExtensionService, toExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TestContextService } from 'vs/workbench/test/common/workbenchTestServices';
import { TestExtensionTipsService, TestSharedProcessService } from 'vs/workbench/test/electron-sandbox/workbenchTestServices';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { NativeURLService } from 'vs/platform/url/common/urlService';
import { URI } from 'vs/base/common/uri';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { RemoteAgentService } from 'vs/workbench/services/remote/electron-sandbox/remoteAgentService';
import { IExtensionContributions, ExtensionType, IExtensionDescription, IExtension } from 'vs/platform/extensions/common/extensions';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ILabelService, IFormatterChangeEvent } from 'vs/platform/label/common/label';
import { IProductService } from 'vs/platform/product/common/productService';
import { Schemas } from 'vs/base/common/network';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { ProgressService } from 'vs/workbench/services/progress/browser/progressService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { TestEnvironmentService, TestLifecycleService } from 'vs/workbench/test/browser/workbenchTestServices';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSyncEnablementService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { TestWorkspaceTrustManagementService } from 'vs/workbench/services/workspaces/test/common/testWorkspaceTrustService';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { platform } from 'vs/base/common/platform';
import { arch } from 'vs/base/common/process';

let instantiationService: TestInstantiationService;
let installEvent: Emitter<InstallExtensionEvent>,
	didInstallEvent: Emitter<readonly InstallExtensionResult[]>,
	uninstallEvent: Emitter<UninstallExtensionEvent>,
	didUninstallEvent: Emitter<DidUninstallExtensionEvent>;

let disposables: DisposableStore;

function setupTest() {
	disposables = new DisposableStore();
	installEvent = new Emitter<InstallExtensionEvent>();
	didInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
	uninstallEvent = new Emitter<UninstallExtensionEvent>();
	didUninstallEvent = new Emitter<DidUninstallExtensionEvent>();

	instantiationService = disposables.add(new TestInstantiationService());

	instantiationService.stub(IEnvironmentService, TestEnvironmentService);
	instantiationService.stub(IWorkbenchEnvironmentService, TestEnvironmentService);

	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(ILogService, NullLogService);

	instantiationService.stub(IWorkspaceContextService, new TestContextService());
	instantiationService.stub(IConfigurationService, new TestConfigurationService());
	instantiationService.stub(IProgressService, ProgressService);
	instantiationService.stub(IProductService, {});
	instantiationService.stub(IContextKeyService, new MockContextKeyService());

	instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);
	instantiationService.stub(ISharedProcessService, TestSharedProcessService);

	instantiationService.stub(IExtensionManagementService, <Partial<IExtensionManagementService>>{
		onInstallExtension: installEvent.event,
		onDidInstallExtensions: didInstallEvent.event,
		onUninstallExtension: uninstallEvent.event,
		onDidUninstallExtension: didUninstallEvent.event,
		onDidChangeProfile: Event.None,
		onDidUpdateExtensionMetadata: Event.None,
		async getInstalled() { return []; },
		async getExtensionsControlManifest() { return { malicious: [], deprecated: {}, search: [] }; },
		async updateMetadata(local: ILocalExtension, metadata: Partial<Metadata>) {
			local.identifier.uuid = metadata.id;
			local.publisherDisplayName = metadata.publisherDisplayName!;
			local.publisherId = metadata.publisherId!;
			return local;
		},
		async canInstall() { return true; },
		async getTargetPlatform() { return getTargetPlatform(platform, arch); },
	});

	instantiationService.stub(IRemoteAgentService, RemoteAgentService);

	const localExtensionManagementServer = { extensionManagementService: instantiationService.get(IExtensionManagementService) as IProfileAwareExtensionManagementService, label: 'local', id: 'vscode-local' };
	instantiationService.stub(IExtensionManagementServerService, <Partial<IExtensionManagementServerService>>{
		get localExtensionManagementServer(): IExtensionManagementServer {
			return localExtensionManagementServer;
		},
		getExtensionManagementServer(extension: IExtension): IExtensionManagementServer | null {
			if (extension.location.scheme === Schemas.file) {
				return localExtensionManagementServer;
			}
			throw new Error(`Invalid Extension ${extension.location}`);
		}
	});

	instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
	instantiationService.stub(ILabelService, { onDidChangeFormatters: new Emitter<IFormatterChangeEvent>().event });

	instantiationService.stub(ILifecycleService, new TestLifecycleService());
	instantiationService.stub(IExtensionTipsService, instantiationService.createInstance(TestExtensionTipsService));
	instantiationService.stub(IExtensionRecommendationsService, {});
	instantiationService.stub(IURLService, NativeURLService);

	instantiationService.stub(IExtensionGalleryService, 'isEnabled', true);
	instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage());
	instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', []);
	instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{ extensions: [], onDidChangeExtensions: Event.None, canAddExtension: (extension: IExtensionDescription) => false, canRemoveExtension: (extension: IExtensionDescription) => false, whenInstalledExtensionsRegistered: () => Promise.resolve(true) });
	(<TestExtensionEnablementService>instantiationService.get(IWorkbenchExtensionEnablementService)).reset();

	instantiationService.stub(IUserDataSyncEnablementService, instantiationService.createInstance(UserDataSyncEnablementService));

	instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
	instantiationService.stub(IWorkspaceTrustManagementService, new TestWorkspaceTrustManagementService());
}


suite('ExtensionsActions', () => {

	setup(setupTest);
	teardown(() => disposables.dispose());

	test('Install action is disabled when there is no extension', () => {
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false });

		assert.ok(!testObject.enabled);
	});

	test('Test Install action when state is installed', () => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false });
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		return workbenchService.queryLocal()
			.then(() => {
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier })));
				return workbenchService.queryGallery(CancellationToken.None)
					.then((paged) => {
						testObject.extension = paged.firstPage[0];
						assert.ok(!testObject.enabled);
						assert.strictEqual('Install', testObject.label);
						assert.strictEqual('extension-action label prominent install', testObject.class);
					});
			});
	});

	test('Test InstallingLabelAction when state is installing', () => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallingLabelAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		return workbenchService.queryGallery(CancellationToken.None)
			.then((paged) => {
				testObject.extension = paged.firstPage[0];
				installEvent.fire({ identifier: gallery.identifier, source: gallery });

				assert.ok(!testObject.enabled);
				assert.strictEqual('Installing', testObject.label);
				assert.strictEqual('extension-action label install installing', testObject.class);
			});
	});

	test('Test Install action when state is uninstalled', async () => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false });
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const paged = await workbenchService.queryGallery(CancellationToken.None);
		const promise = Event.toPromise(testObject.onDidChange);
		testObject.extension = paged.firstPage[0];
		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual('Install', testObject.label);
	});

	test('Test Install action when extension is system action', () => {
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false });
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a', {}, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				uninstallEvent.fire({ identifier: local.identifier });
				didUninstallEvent.fire({ identifier: local.identifier });
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test Install action when extension doesnot has gallery', () => {
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false });
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				uninstallEvent.fire({ identifier: local.identifier });
				didUninstallEvent.fire({ identifier: local.identifier });
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Uninstall action is disabled when there is no extension', () => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		assert.ok(!testObject.enabled);
	});

	test('Test Uninstall action when state is uninstalling', () => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				uninstallEvent.fire({ identifier: local.identifier });
				assert.ok(!testObject.enabled);
				assert.strictEqual('Uninstalling', testObject.label);
				assert.strictEqual('extension-action label uninstall uninstalling', testObject.class);
			});
	});

	test('Test Uninstall action when state is installed and is user extension', () => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
				assert.strictEqual('Uninstall', testObject.label);
				assert.strictEqual('extension-action label uninstall', testObject.class);
			});
	});

	test('Test Uninstall action when state is installed and is system extension', () => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a', {}, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
				assert.strictEqual('Uninstall', testObject.label);
				assert.strictEqual('extension-action label uninstall', testObject.class);
			});
	});

	test('Test Uninstall action when state is installing and is user extension', () => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const gallery = aGalleryExtension('a');
				const extension = extensions[0];
				extension.gallery = gallery;
				installEvent.fire({ identifier: gallery.identifier, source: gallery });
				testObject.extension = extension;
				assert.ok(!testObject.enabled);
			});
	});

	test('Test Uninstall action after extension is installed', async () => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];

		installEvent.fire({ identifier: gallery.identifier, source: gallery });
		const promise = Event.toPromise(testObject.onDidChange);
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery) }]);

		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual('Uninstall', testObject.label);
		assert.strictEqual('extension-action label uninstall', testObject.class);
	});

	test('Test UpdateAction when there is no extension', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		assert.ok(!testObject.enabled);
	});

	test('Test UpdateAction when extension is uninstalled', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const gallery = aGalleryExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then((paged) => {
				testObject.extension = paged.firstPage[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test UpdateAction when extension is installed and not outdated', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier, version: local.manifest.version })));
				return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
					.then(extensions => assert.ok(!testObject.enabled));
			});
	});

	test('Test UpdateAction when extension is installed outdated and system extension', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a', { version: '1.0.0' }, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier, version: '1.0.1' })));
				return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
					.then(extensions => assert.ok(!testObject.enabled));
			});
	});

	test('Test UpdateAction when extension is installed outdated and user extension', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		return workbenchService.queryLocal()
			.then(async extensions => {
				testObject.extension = extensions[0];
				const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.1' });
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
				instantiationService.stubPromise(IExtensionGalleryService, 'getCompatibleExtension', gallery);
				instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', [gallery]);
				assert.ok(!testObject.enabled);
				return new Promise<void>(c => {
					testObject.onDidChange(() => {
						if (testObject.enabled) {
							c();
						}
					});
					instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
				});
			});
	});

	test('Test UpdateAction when extension is installing and outdated and user extension', async () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
		testObject.extension = extensions[0];
		const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.1' });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		instantiationService.stubPromise(IExtensionGalleryService, 'getCompatibleExtension', gallery);
		instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', [gallery]);
		await new Promise<void>(c => {
			testObject.onDidChange(() => {
				if (testObject.enabled) {
					c();
				}
			});
			instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		});
		await new Promise<void>(c => {
			testObject.onDidChange(() => {
				if (!testObject.enabled) {
					c();
				}
			});
			installEvent.fire({ identifier: local.identifier, source: gallery });
		});
	});

	test('Test ManageExtensionAction when there is no extension', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		assert.ok(!testObject.enabled);
	});

	test('Test ManageExtensionAction when extension is installed', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
				assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
				assert.strictEqual('', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is uninstalled', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				testObject.extension = page.firstPage[0];
				assert.ok(!testObject.enabled);
				assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage hide', testObject.class);
				assert.strictEqual('', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is installing', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				testObject.extension = page.firstPage[0];

				installEvent.fire({ identifier: gallery.identifier, source: gallery });
				assert.ok(!testObject.enabled);
				assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage hide', testObject.class);
				assert.strictEqual('', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is queried from gallery and installed', async () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];
		installEvent.fire({ identifier: gallery.identifier, source: gallery });
		const promise = Event.toPromise(testObject.onDidChange);
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery) }]);

		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
		assert.strictEqual('', testObject.tooltip);
	});

	test('Test ManageExtensionAction when extension is system extension', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a', {}, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
				assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
				assert.strictEqual('', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is uninstalling', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				uninstallEvent.fire({ identifier: local.identifier });

				assert.ok(!testObject.enabled);
				assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
				assert.strictEqual('Uninstalling', testObject.tooltip);
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
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
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
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace)
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
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace))
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
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace)
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
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
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
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace))
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

	test('Test EnableAction when there is no extension', () => {
		const testObject: ExtensionsActions.EnableDropDownAction = instantiationService.createInstance(ExtensionsActions.EnableDropDownAction);

		assert.ok(!testObject.enabled);
	});

	test('Test EnableDropDownAction when extension is installed and enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.EnableDropDownAction = instantiationService.createInstance(ExtensionsActions.EnableDropDownAction);
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableDropDownAction when extension is installed and disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableDropDownAction = instantiationService.createInstance(ExtensionsActions.EnableDropDownAction);
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableDropDownAction when extension is installed and disabled for workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableDropDownAction = instantiationService.createInstance(ExtensionsActions.EnableDropDownAction);
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableDropDownAction when extension is uninstalled', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.EnableDropDownAction = instantiationService.createInstance(ExtensionsActions.EnableDropDownAction);
				testObject.extension = page.firstPage[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableDropDownAction when extension is installing', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.EnableDropDownAction = instantiationService.createInstance(ExtensionsActions.EnableDropDownAction);
				testObject.extension = page.firstPage[0];
				instantiationService.createInstance(ExtensionContainers, [testObject]);

				installEvent.fire({ identifier: gallery.identifier, source: gallery });
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableDropDownAction when extension is uninstalling', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.EnableDropDownAction = instantiationService.createInstance(ExtensionsActions.EnableDropDownAction);
				testObject.extension = extensions[0];
				uninstallEvent.fire({ identifier: local.identifier });
				assert.ok(!testObject.enabled);
			});
	});

	test('Test DisableForWorkspaceAction when there is no extension', () => {
		const testObject: ExtensionsActions.DisableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction);

		assert.ok(!testObject.enabled);
	});

	test('Test DisableForWorkspaceAction when the extension is disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction);
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableForWorkspaceAction when the extension is disabled workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction);
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableForWorkspaceAction when extension is enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction);
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when there is no extension', () => {
		const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction);

		assert.ok(!testObject.enabled);
	});

	test('Test DisableGloballyAction when the extension is disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction);
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableGloballyAction when the extension is disabled for workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction);
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableGloballyAction when the extension is enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction);
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when extension is installed and enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction);
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when extension is installed and disabled globally', () => {
		const local = aLocalExtension('a');
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction);
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableGloballyAction when extension is uninstalled', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('a'))],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction);
				testObject.extension = page.firstPage[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when extension is installing', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('a'))],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction);
				testObject.extension = page.firstPage[0];
				instantiationService.createInstance(ExtensionContainers, [testObject]);
				installEvent.fire({ identifier: gallery.identifier, source: gallery });
				assert.ok(!testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when extension is uninstalling', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction);
				testObject.extension = extensions[0];
				instantiationService.createInstance(ExtensionContainers, [testObject]);
				uninstallEvent.fire({ identifier: local.identifier });
				assert.ok(!testObject.enabled);
			});
	});

});

suite('ReloadAction', () => {

	setup(setupTest);
	teardown(() => disposables.dispose());

	test('Test ReloadAction when there is no extension', () => {
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when extension state is installing', async () => {
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const paged = await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];
		installEvent.fire({ identifier: gallery.identifier, source: gallery });

		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when extension state is uninstalling', async () => {
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
		testObject.extension = extensions[0];
		uninstallEvent.fire({ identifier: local.identifier });
		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when extension is newly installed', async () => {
		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];
		assert.ok(!testObject.enabled);

		installEvent.fire({ identifier: gallery.identifier, source: gallery });
		const promise = Event.toPromise(testObject.onDidChange);
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery) }]);
		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual(testObject.tooltip, 'Please reload Visual Studio Code to enable this extension.');
	});

	test('Test ReloadAction when extension is newly installed and reload is not required', async () => {
		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => true,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];
		assert.ok(!testObject.enabled);

		installEvent.fire({ identifier: gallery.identifier, source: gallery });
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery) }]);
		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when extension is installed and uninstalled', async () => {
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);

		testObject.extension = paged.firstPage[0];
		const identifier = gallery.identifier;
		installEvent.fire({ identifier, source: gallery });
		didInstallEvent.fire([{ identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, { identifier }) }]);
		uninstallEvent.fire({ identifier });
		didUninstallEvent.fire({ identifier });

		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when extension is uninstalled', async () => {
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.0' }))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, instantiationService.createInstance(ExtensionsWorkbenchService));
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
		testObject.extension = extensions[0];

		uninstallEvent.fire({ identifier: local.identifier });
		didUninstallEvent.fire({ identifier: local.identifier });
		assert.ok(testObject.enabled);
		assert.strictEqual(testObject.tooltip, 'Please reload Visual Studio Code to complete the uninstallation of this extension.');
	});

	test('Test ReloadAction when extension is uninstalled and can be removed', async () => {
		const local = aLocalExtension('a');
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => true,
			canAddExtension: (extension) => true,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
		testObject.extension = extensions[0];

		uninstallEvent.fire({ identifier: local.identifier });
		didUninstallEvent.fire({ identifier: local.identifier });
		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when extension is uninstalled and installed', async () => {
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.0' }))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();

		testObject.extension = extensions[0];
		uninstallEvent.fire({ identifier: local.identifier });
		didUninstallEvent.fire({ identifier: local.identifier });

		const gallery = aGalleryExtension('a');
		const identifier = gallery.identifier;
		installEvent.fire({ identifier, source: gallery });
		didInstallEvent.fire([{ identifier, source: gallery, operation: InstallOperation.Install, local }]);

		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when extension is updated while running', async () => {
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.1' }))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => true,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, instantiationService.createInstance(ExtensionsWorkbenchService));
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a', { version: '1.0.1' });
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];

		return new Promise<void>(c => {
			testObject.onDidChange(() => {
				if (testObject.enabled && testObject.tooltip === 'Please reload Visual Studio Code to enable the updated extension.') {
					c();
				}
			});
			const gallery = aGalleryExtension('a', { uuid: local.identifier.id, version: '1.0.2' });
			installEvent.fire({ identifier: gallery.identifier, source: gallery });
			didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery) }]);
		});
	});

	test('Test ReloadAction when extension is updated when not running', async () => {
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const local = aLocalExtension('a', { version: '1.0.1' });
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];

		const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.2' });
		installEvent.fire({ identifier: gallery.identifier, source: gallery });
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Update, local: aLocalExtension('a', gallery, gallery) }]);

		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when extension is disabled when running', async () => {
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('a'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, instantiationService.createInstance(ExtensionsWorkbenchService));
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a');
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];
		await workbenchService.setEnablement(extensions[0], EnablementState.DisabledGlobally);
		await testObject.update();

		assert.ok(testObject.enabled);
		assert.strictEqual('Please reload Visual Studio Code to disable this extension.', testObject.tooltip);
	});

	test('Test ReloadAction when extension enablement is toggled when running', async () => {
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.0' }))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, instantiationService.createInstance(ExtensionsWorkbenchService));
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a');
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];
		await workbenchService.setEnablement(extensions[0], EnablementState.DisabledGlobally);
		await workbenchService.setEnablement(extensions[0], EnablementState.EnabledGlobally);
		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when extension is enabled when not running', async () => {
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const local = aLocalExtension('a');
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];
		await workbenchService.setEnablement(extensions[0], EnablementState.EnabledGlobally);
		await testObject.update();
		assert.ok(testObject.enabled);
		assert.strictEqual('Please reload Visual Studio Code to enable this extension.', testObject.tooltip);
	});

	test('Test ReloadAction when extension enablement is toggled when not running', async () => {
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const local = aLocalExtension('a');
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];
		await workbenchService.setEnablement(extensions[0], EnablementState.EnabledGlobally);
		await workbenchService.setEnablement(extensions[0], EnablementState.DisabledGlobally);
		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when extension is updated when not running and enabled', async () => {
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('a'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const local = aLocalExtension('a', { version: '1.0.1' });
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];

		const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.2' });
		installEvent.fire({ identifier: gallery.identifier, source: gallery });
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery) }]);
		await workbenchService.setEnablement(extensions[0], EnablementState.EnabledGlobally);
		await testObject.update();
		assert.ok(testObject.enabled);
		assert.strictEqual('Please reload Visual Studio Code to enable this extension.', testObject.tooltip);
	});

	test('Test ReloadAction when a localization extension is newly installed', async () => {
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];
		assert.ok(!testObject.enabled);

		installEvent.fire({ identifier: gallery.identifier, source: gallery });
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', { ...gallery, ...{ contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } } }, gallery) }]);
		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when a localization extension is updated while running', async () => {
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.1' }))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		const local = aLocalExtension('a', { version: '1.0.1', contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } });
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];

		const gallery = aGalleryExtension('a', { uuid: local.identifier.id, version: '1.0.2' });
		installEvent.fire({ identifier: gallery.identifier, source: gallery });
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', { ...gallery, ...{ contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } } }, gallery) }]);
		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when extension is not installed but extension from different server is installed and running', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a') });
		const remoteExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(remoteExtension)],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when extension is uninstalled but extension from different server is installed and running', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a') });
		const remoteExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const localExtensionManagementService = createExtensionManagementService([localExtension]);
		const uninstallEvent = new Emitter<UninstallExtensionEvent>();
		const onDidUninstallEvent = new Emitter<{ identifier: IExtensionIdentifier }>();
		localExtensionManagementService.onUninstallExtension = uninstallEvent.event;
		localExtensionManagementService.onDidUninstallExtension = onDidUninstallEvent.event;
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(remoteExtension)],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);

		uninstallEvent.fire({ identifier: localExtension.identifier });
		didUninstallEvent.fire({ identifier: localExtension.identifier });

		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when workspace extension is disabled on local server and installed in remote server', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const remoteExtensionManagementService = createExtensionManagementService([]);
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		remoteExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const localExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a') });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), remoteExtensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);

		const remoteExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const promise = Event.toPromise(testObject.onDidChange);
		onDidInstallEvent.fire([{ identifier: remoteExtension.identifier, local: remoteExtension, operation: InstallOperation.Install }]);

		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual(testObject.tooltip, 'Please reload Visual Studio Code to enable this extension.');
	});

	test('Test ReloadAction when ui extension is disabled on remote server and installed in local server', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtensionManagementService = createExtensionManagementService([]);
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		localExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const remoteExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);

		const localExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file('pub.a') });
		const promise = Event.toPromise(Event.filter(testObject.onDidChange, () => testObject.enabled));
		onDidInstallEvent.fire([{ identifier: localExtension.identifier, local: localExtension, operation: InstallOperation.Install }]);

		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual(testObject.tooltip, 'Please reload Visual Studio Code to enable this extension.');
	});

	test('Test ReloadAction for remote ui extension is disabled when it is installed and enabled in local server', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file('pub.a') });
		const localExtensionManagementService = createExtensionManagementService([localExtension]);
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		localExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const remoteExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(localExtension)],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction for remote workspace+ui extension is enabled when it is installed and enabled in local server', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file('pub.a') });
		const localExtensionManagementService = createExtensionManagementService([localExtension]);
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		localExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const remoteExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(localExtension)],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(testObject.enabled);
	});

	test('Test ReloadAction for local ui+workspace extension is enabled when it is installed and enabled in remote server', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file('pub.a') });
		const remoteExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const remoteExtensionManagementService = createExtensionManagementService([remoteExtension]);
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		remoteExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), remoteExtensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(remoteExtension)],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(testObject.enabled);
	});

	test('Test ReloadAction for local workspace+ui extension is enabled when it is installed in both servers but running in local server', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file('pub.a') });
		const localExtensionManagementService = createExtensionManagementService([localExtension]);
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		localExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const remoteExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(localExtension)],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(testObject.enabled);
	});

	test('Test ReloadAction for remote ui+workspace extension is enabled when it is installed on both servers but running in remote server', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const localExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file('pub.a') });
		const remoteExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const remoteExtensionManagementService = createExtensionManagementService([remoteExtension]);
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		remoteExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), remoteExtensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(remoteExtension)],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(testObject.enabled);
	});

	test('Test ReloadAction when ui+workspace+web extension is installed in web and remote and running in remote', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const webExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'], 'browser': 'browser.js' }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeUserData }) });
		const remoteExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'], 'browser': 'browser.js' }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, null, createExtensionManagementService([remoteExtension]), createExtensionManagementService([webExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(remoteExtension)],
			onDidChangeExtensions: Event.None,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when workspace+ui+web extension is installed in web and local and running in local', async () => {
		// multi server setup
		const gallery = aGalleryExtension('a');
		const webExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'], 'browser': 'browser.js' }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeUserData }) });
		const localExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'], 'browser': 'browser.js' }, { location: URI.file('pub.a') });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), null, createExtensionManagementService([webExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			extensions: [toExtensionDescription(localExtension)],
			onDidChangeExtensions: Event.None,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		await workbenchService.queryGallery(CancellationToken.None);
		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});
});

suite('RemoteInstallAction', () => {

	setup(setupTest);
	teardown(() => disposables.dispose());

	test('Test remote install action is enabled for local workspace extension', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);
		assert.strictEqual('extension-action label prominent install', testObject.class);
	});

	test('Test remote install action when installing local workspace extension', async () => {
		// multi server setup
		const remoteExtensionManagementService = createExtensionManagementService();
		const onInstallExtension = new Emitter<InstallExtensionEvent>();
		remoteExtensionManagementService.onInstallExtension = onInstallExtension.event;
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]), remoteExtensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const gallery = aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);
		assert.strictEqual('extension-action label prominent install', testObject.class);

		onInstallExtension.fire({ identifier: localWorkspaceExtension.identifier, source: gallery });
		assert.ok(testObject.enabled);
		assert.strictEqual('Installing', testObject.label);
		assert.strictEqual('extension-action label install installing', testObject.class);
	});

	test('Test remote install action when installing local workspace extension is finished', async () => {
		// multi server setup
		const remoteExtensionManagementService = createExtensionManagementService();
		const onInstallExtension = new Emitter<InstallExtensionEvent>();
		remoteExtensionManagementService.onInstallExtension = onInstallExtension.event;
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		remoteExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]), remoteExtensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const gallery = aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);
		assert.strictEqual('extension-action label prominent install', testObject.class);

		onInstallExtension.fire({ identifier: localWorkspaceExtension.identifier, source: gallery });
		assert.ok(testObject.enabled);
		assert.strictEqual('Installing', testObject.label);
		assert.strictEqual('extension-action label install installing', testObject.class);

		const installedExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const promise = Event.toPromise(testObject.onDidChange);
		onDidInstallEvent.fire([{ identifier: installedExtension.identifier, local: installedExtension, operation: InstallOperation.Install }]);
		await promise;
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is enabled for disabled local workspace extension', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const remoteWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([remoteWorkspaceExtension], EnablementState.DisabledGlobally);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);
		assert.strictEqual('extension-action label prominent install', testObject.class);
	});

	test('Test remote install action is enabled local workspace+ui extension', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localWorkspaceExtension], EnablementState.DisabledGlobally);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);
		assert.strictEqual('extension-action label prominent install', testObject.class);
	});

	test('Test remote install action is enabled for local ui+workapace extension if can install is true', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localWorkspaceExtension], EnablementState.DisabledGlobally);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, true);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);
		assert.strictEqual('extension-action label prominent install', testObject.class);
	});

	test('Test remote install action is disabled for local ui+workapace extension if can install is false', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localWorkspaceExtension], EnablementState.DisabledGlobally);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled when extension is not set', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled for extension which is not installed', async () => {
		// multi server setup
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a')));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const pager = await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = pager.firstPage[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled for local workspace extension which is disabled in env', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		const environmentService = { disableExtensions: true } as INativeWorkbenchEnvironmentService;
		instantiationService.stub(IEnvironmentService, environmentService);
		instantiationService.stub(INativeEnvironmentService, environmentService);
		instantiationService.stub(IWorkbenchEnvironmentService, environmentService);
		instantiationService.stub(INativeWorkbenchEnvironmentService, environmentService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled when remote server is not available', async () => {
		// single server setup
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const extensionManagementServerService = instantiationService.get(IExtensionManagementServerService);
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localWorkspaceExtension]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled for local workspace extension if it is uninstalled locally', async () => {
		// multi server setup
		const extensionManagementService = instantiationService.get(IExtensionManagementService) as IProfileAwareExtensionManagementService;
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, extensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localWorkspaceExtension]);
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);

		uninstallEvent.fire({ identifier: localWorkspaceExtension.identifier });
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled for local workspace extension if it is installed in remote', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const remoteWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]), createExtensionManagementService([remoteWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is enabled for local workspace extension if it has not gallery', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(testObject.enabled);
	});

	test('Test remote install action is disabled for local workspace system extension', async () => {
		// multi server setup
		const localWorkspaceSystemExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`), type: ExtensionType.System });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceSystemExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceSystemExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled for local ui extension if it is not installed in remote', async () => {
		// multi server setup
		const localUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localUIExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is disabled for local ui extension if it is also installed in remote', async () => {
		// multi server setup
		const localUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localUIExtension]), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localUIExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test remote install action is enabled for locally installed language pack extension', async () => {
		// multi server setup
		const languagePackExtension = aLocalExtension('a', { contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } }, { location: URI.file(`pub.a`) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([languagePackExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: languagePackExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);
		assert.strictEqual('extension-action label prominent install', testObject.class);
	});

	test('Test remote install action is disabled if local language pack extension is uninstalled', async () => {
		// multi server setup
		const extensionManagementService = instantiationService.get(IExtensionManagementService) as IProfileAwareExtensionManagementService;
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, extensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const languagePackExtension = aLocalExtension('a', { contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } }, { location: URI.file(`pub.a`) });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [languagePackExtension]);
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: languagePackExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install in remote', testObject.label);

		uninstallEvent.fire({ identifier: languagePackExtension.identifier });
		assert.ok(!testObject.enabled);
	});
});

suite('LocalInstallAction', () => {

	setup(setupTest);
	teardown(() => disposables.dispose());

	test('Test local install action is enabled for remote ui extension', async () => {
		// multi server setup
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);
		assert.strictEqual('extension-action label prominent install', testObject.class);
	});

	test('Test local install action is enabled for remote ui+workspace extension', async () => {
		// multi server setup
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);
		assert.strictEqual('extension-action label prominent install', testObject.class);
	});

	test('Test local install action when installing remote ui extension', async () => {
		// multi server setup
		const localExtensionManagementService = createExtensionManagementService();
		const onInstallExtension = new Emitter<InstallExtensionEvent>();
		localExtensionManagementService.onInstallExtension = onInstallExtension.event;
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const gallery = aGalleryExtension('a', { identifier: remoteUIExtension.identifier });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);
		assert.strictEqual('extension-action label prominent install', testObject.class);

		onInstallExtension.fire({ identifier: remoteUIExtension.identifier, source: gallery });
		assert.ok(testObject.enabled);
		assert.strictEqual('Installing', testObject.label);
		assert.strictEqual('extension-action label install installing', testObject.class);
	});

	test('Test local install action when installing remote ui extension is finished', async () => {
		// multi server setup
		const localExtensionManagementService = createExtensionManagementService();
		const onInstallExtension = new Emitter<InstallExtensionEvent>();
		localExtensionManagementService.onInstallExtension = onInstallExtension.event;
		const onDidInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
		localExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const gallery = aGalleryExtension('a', { identifier: remoteUIExtension.identifier });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);
		assert.strictEqual('extension-action label prominent install', testObject.class);

		onInstallExtension.fire({ identifier: remoteUIExtension.identifier, source: gallery });
		assert.ok(testObject.enabled);
		assert.strictEqual('Installing', testObject.label);
		assert.strictEqual('extension-action label install installing', testObject.class);

		const installedExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		const promise = Event.toPromise(testObject.onDidChange);
		onDidInstallEvent.fire([{ identifier: installedExtension.identifier, local: installedExtension, operation: InstallOperation.Install }]);
		await promise;
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is enabled for disabled remote ui extension', async () => {
		// multi server setup
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		const localUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localUIExtension], EnablementState.DisabledGlobally);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);
		assert.strictEqual('extension-action label prominent install', testObject.class);
	});

	test('Test local install action is disabled when extension is not set', async () => {
		// multi server setup
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is disabled for extension which is not installed', async () => {
		// multi server setup
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a')));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const pager = await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = pager.firstPage[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is disabled for remote ui extension which is disabled in env', async () => {
		// multi server setup
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const environmentService = { disableExtensions: true } as INativeWorkbenchEnvironmentService;
		instantiationService.stub(IEnvironmentService, environmentService);
		instantiationService.stub(INativeEnvironmentService, environmentService);
		instantiationService.stub(IWorkbenchEnvironmentService, environmentService);
		instantiationService.stub(INativeWorkbenchEnvironmentService, environmentService);
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is disabled when local server is not available', async () => {
		// single server setup
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aSingleRemoteExtensionManagementServerService(instantiationService, createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is disabled for remote ui extension if it is installed in local', async () => {
		// multi server setup
		const localUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localUIExtension]), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localUIExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is disabled for remoteUI extension if it is uninstalled locally', async () => {
		// multi server setup
		const extensionManagementService = instantiationService.get(IExtensionManagementService) as IProfileAwareExtensionManagementService;
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), extensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [remoteUIExtension]);
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);

		uninstallEvent.fire({ identifier: remoteUIExtension.identifier });
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is enabled for remote UI extension if it has gallery', async () => {
		// multi server setup
		const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(testObject.enabled);
	});

	test('Test local install action is disabled for remote UI system extension', async () => {
		// multi server setup
		const remoteUISystemExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }), type: ExtensionType.System });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUISystemExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUISystemExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is disabled for remote workspace extension if it is not installed in local', async () => {
		// multi server setup
		const remoteWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteWorkspaceExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is disabled for remote workspace extension if it is also installed in local', async () => {
		// multi server setup
		const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspae'] }, { location: URI.file(`pub.a`) });
		const remoteWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]), createExtensionManagementService([remoteWorkspaceExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		testObject.extension = extensions[0];
		assert.ok(testObject.extension);
		assert.ok(!testObject.enabled);
	});

	test('Test local install action is enabled for remotely installed language pack extension', async () => {
		// multi server setup
		const languagePackExtension = aLocalExtension('a', { contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([languagePackExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: languagePackExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);
		assert.strictEqual('extension-action label prominent install', testObject.class);
	});

	test('Test local install action is disabled if remote language pack extension is uninstalled', async () => {
		// multi server setup
		const extensionManagementService = instantiationService.get(IExtensionManagementService) as IProfileAwareExtensionManagementService;
		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), extensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		const languagePackExtension = aLocalExtension('a', { contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [languagePackExtension]);
		const workbenchService: IExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.set(IExtensionsWorkbenchService, workbenchService);

		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: languagePackExtension.identifier })));
		const testObject = instantiationService.createInstance(ExtensionsActions.LocalInstallAction);
		instantiationService.createInstance(ExtensionContainers, [testObject]);

		const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer!);
		await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = extensions[0];
		assert.ok(testObject.enabled);
		assert.strictEqual('Install Locally', testObject.label);

		uninstallEvent.fire({ identifier: languagePackExtension.identifier });
		assert.ok(!testObject.enabled);
	});

});

function aLocalExtension(name: string = 'someext', manifest: any = {}, properties: any = {}): ILocalExtension {
	manifest = { name, publisher: 'pub', version: '1.0.0', ...manifest };
	properties = {
		type: ExtensionType.User,
		location: URI.file(`pub.${name}`),
		identifier: { id: getGalleryExtensionId(manifest.publisher, manifest.name) },
		...properties
	};
	properties.isBuiltin = properties.type === ExtensionType.System;
	return <ILocalExtension>Object.create({ manifest, ...properties });
}

function aGalleryExtension(name: string, properties: any = {}, galleryExtensionProperties: any = {}, assets: any = {}): IGalleryExtension {
	const targetPlatform = getTargetPlatform(platform, arch);
	const galleryExtension = <IGalleryExtension>Object.create({ name, publisher: 'pub', version: '1.0.0', allTargetPlatforms: [targetPlatform], properties: {}, assets: {}, ...properties });
	galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], targetPlatform, ...galleryExtensionProperties };
	galleryExtension.assets = { ...galleryExtension.assets, ...assets };
	galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
	galleryExtension.hasReleaseVersion = true;
	return <IGalleryExtension>galleryExtension;
}

function aPage<T>(...objects: T[]): IPager<T> {
	return { firstPage: objects, total: objects.length, pageSize: objects.length, getPage: () => null! };
}

function aSingleRemoteExtensionManagementServerService(instantiationService: TestInstantiationService, remoteExtensionManagementService?: IProfileAwareExtensionManagementService): IExtensionManagementServerService {
	const remoteExtensionManagementServer: IExtensionManagementServer = {
		id: 'vscode-remote',
		label: 'remote',
		extensionManagementService: remoteExtensionManagementService || createExtensionManagementService(),
	};
	return {
		_serviceBrand: undefined,
		localExtensionManagementServer: null,
		remoteExtensionManagementServer,
		webExtensionManagementServer: null,
		getExtensionManagementServer: (extension: IExtension) => {
			if (extension.location.scheme === Schemas.vscodeRemote) {
				return remoteExtensionManagementServer;
			}
			return null;
		},
		getExtensionInstallLocation(extension: IExtension): ExtensionInstallLocation | null {
			const server = this.getExtensionManagementServer(extension);
			return server === remoteExtensionManagementServer ? ExtensionInstallLocation.Remote : ExtensionInstallLocation.Local;
		}
	};
}

function aMultiExtensionManagementServerService(instantiationService: TestInstantiationService, localExtensionManagementService?: IProfileAwareExtensionManagementService | null, remoteExtensionManagementService?: IProfileAwareExtensionManagementService | null, webExtensionManagementService?: IProfileAwareExtensionManagementService): IExtensionManagementServerService {
	const localExtensionManagementServer: IExtensionManagementServer | null = localExtensionManagementService === null ? null : {
		id: 'vscode-local',
		label: 'local',
		extensionManagementService: localExtensionManagementService || createExtensionManagementService(),
	};
	const remoteExtensionManagementServer: IExtensionManagementServer | null = remoteExtensionManagementService === null ? null : {
		id: 'vscode-remote',
		label: 'remote',
		extensionManagementService: remoteExtensionManagementService || createExtensionManagementService(),
	};
	const webExtensionManagementServer: IExtensionManagementServer | null = webExtensionManagementService ? {
		id: 'vscode-web',
		label: 'web',
		extensionManagementService: webExtensionManagementService,
	} : null;
	return {
		_serviceBrand: undefined,
		localExtensionManagementServer,
		remoteExtensionManagementServer,
		webExtensionManagementServer,
		getExtensionManagementServer: (extension: IExtension) => {
			if (extension.location.scheme === Schemas.file) {
				return localExtensionManagementServer;
			}
			if (extension.location.scheme === Schemas.vscodeRemote) {
				return remoteExtensionManagementServer;
			}
			if (extension.location.scheme === Schemas.vscodeUserData) {
				return webExtensionManagementServer;
			}
			throw new Error('');
		},
		getExtensionInstallLocation(extension: IExtension): ExtensionInstallLocation | null {
			const server = this.getExtensionManagementServer(extension);
			if (server === null) {
				return null;
			}
			if (server === remoteExtensionManagementServer) {
				return ExtensionInstallLocation.Remote;
			}
			if (server === webExtensionManagementServer) {
				return ExtensionInstallLocation.Web;
			}
			return ExtensionInstallLocation.Local;
		}
	};
}

function createExtensionManagementService(installed: ILocalExtension[] = []): IProfileAwareExtensionManagementService {
	return <IProfileAwareExtensionManagementService>{
		onInstallExtension: Event.None,
		onDidInstallExtensions: Event.None,
		onUninstallExtension: Event.None,
		onDidUninstallExtension: Event.None,
		onDidChangeProfile: Event.None,
		onDidUpdateExtensionMetadata: Event.None,
		getInstalled: () => Promise.resolve<ILocalExtension[]>(installed),
		canInstall: async (extension: IGalleryExtension) => { return true; },
		installFromGallery: (extension: IGalleryExtension) => Promise.reject(new Error('not supported')),
		updateMetadata: async (local: ILocalExtension, metadata: Partial<Metadata>) => {
			local.identifier.uuid = metadata.id;
			local.publisherDisplayName = metadata.publisherDisplayName!;
			local.publisherId = metadata.publisherId!;
			return local;
		},
		async getTargetPlatform() { return getTargetPlatform(platform, arch); },
		async getExtensionsControlManifest() { return <IExtensionsControlManifest>{ malicious: [], deprecated: {}, search: [] }; },
	};
}


