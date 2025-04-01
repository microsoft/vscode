/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { IExtensionManagementService, DidUninstallExtensionEvent, ILocalExtension, InstallExtensionEvent, InstallExtensionResult, UninstallExtensionEvent, DidUpdateExtensionMetadata, InstallOperation, IAllowedExtensionsService, AllowedExtensionsConfigKey, IExtensionsControlManifest } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { EnablementState, IExtensionManagementServerService, IExtensionManagementServer, IWorkbenchExtensionManagementService, ExtensionInstallLocation, IProfileAwareExtensionManagementService, DidChangeProfileEvent } from '../../common/extensionManagement.js';
import { ExtensionEnablementService } from '../../browser/extensionEnablementService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IWorkspace, IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IExtensionContributions, ExtensionType, IExtension, IExtensionManifest, IExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { isUndefinedOrNull } from '../../../../../base/common/types.js';
import { areSameExtensions } from '../../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { URI } from '../../../../../base/common/uri.js';
import { Schemas } from '../../../../../base/common/network.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestLifecycleService } from '../../../../test/browser/workbenchTestServices.js';
import { GlobalExtensionEnablementService } from '../../../../../platform/extensionManagement/common/extensionEnablementService.js';
import { IUserDataSyncAccountService, UserDataSyncAccountService } from '../../../../../platform/userDataSync/common/userDataSyncAccount.js';
import { IUserDataSyncEnablementService } from '../../../../../platform/userDataSync/common/userDataSync.js';
import { ILifecycleService } from '../../../lifecycle/common/lifecycle.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IHostService } from '../../../host/browser/host.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IExtensionBisectService } from '../../browser/extensionBisect.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, WorkspaceTrustRequestOptions } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { ExtensionManifestPropertiesService, IExtensionManifestPropertiesService } from '../../../extensions/common/extensionManifestPropertiesService.js';
import { TestContextService, TestProductService, TestWorkspaceTrustEnablementService, TestWorkspaceTrustManagementService } from '../../../../test/common/workbenchTestServices.js';
import { TestWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { ExtensionManagementService } from '../../common/extensionManagementService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { AllowedExtensionsService } from '../../../../../platform/extensionManagement/common/allowedExtensionsService.js';

function createStorageService(instantiationService: TestInstantiationService, disposableStore: DisposableStore): IStorageService {
	let service = instantiationService.get(IStorageService);
	if (!service) {
		let workspaceContextService = instantiationService.get(IWorkspaceContextService);
		if (!workspaceContextService) {
			workspaceContextService = instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{
				getWorkbenchState: () => WorkbenchState.FOLDER,
				getWorkspace: () => TestWorkspace as IWorkspace
			});
		}
		service = instantiationService.stub(IStorageService, disposableStore.add(new InMemoryStorageService()));
	}
	return service;
}

export class TestExtensionEnablementService extends ExtensionEnablementService {
	constructor(instantiationService: TestInstantiationService) {
		const disposables = new DisposableStore();
		const storageService = createStorageService(instantiationService, disposables);
		const extensionManagementServerService = instantiationService.get(IExtensionManagementServerService) ||
			instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService({
				id: 'local',
				label: 'local',
				extensionManagementService: <IProfileAwareExtensionManagementService>{
					onInstallExtension: disposables.add(new Emitter<InstallExtensionEvent>()).event,
					onDidInstallExtensions: disposables.add(new Emitter<readonly InstallExtensionResult[]>()).event,
					onUninstallExtension: disposables.add(new Emitter<UninstallExtensionEvent>()).event,
					onDidUninstallExtension: disposables.add(new Emitter<DidUninstallExtensionEvent>()).event,
					onDidChangeProfile: disposables.add(new Emitter<DidChangeProfileEvent>()).event,
					onDidUpdateExtensionMetadata: disposables.add(new Emitter<DidUpdateExtensionMetadata>()).event,
					onProfileAwareDidInstallExtensions: Event.None,
				},
			}, null, null));
		const extensionManagementService = disposables.add(instantiationService.createInstance(ExtensionManagementService));
		const workbenchExtensionManagementService = instantiationService.get(IWorkbenchExtensionManagementService) || instantiationService.stub(IWorkbenchExtensionManagementService, extensionManagementService);
		const workspaceTrustManagementService = instantiationService.get(IWorkspaceTrustManagementService) || instantiationService.stub(IWorkspaceTrustManagementService, disposables.add(new TestWorkspaceTrustManagementService()));
		super(
			storageService,
			disposables.add(new GlobalExtensionEnablementService(storageService, extensionManagementService)),
			instantiationService.get(IWorkspaceContextService) || new TestContextService(),
			instantiationService.get(IWorkbenchEnvironmentService) || instantiationService.stub(IWorkbenchEnvironmentService, {}),
			workbenchExtensionManagementService,
			instantiationService.get(IConfigurationService),
			extensionManagementServerService,
			instantiationService.get(IUserDataSyncEnablementService) || instantiationService.stub(IUserDataSyncEnablementService, <Partial<IUserDataSyncEnablementService>>{ isEnabled() { return false; } }),
			instantiationService.get(IUserDataSyncAccountService) || instantiationService.stub(IUserDataSyncAccountService, UserDataSyncAccountService),
			instantiationService.get(ILifecycleService) || instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService())),
			instantiationService.get(INotificationService) || instantiationService.stub(INotificationService, new TestNotificationService()),
			instantiationService.get(IHostService),
			new class extends mock<IExtensionBisectService>() { override isDisabledByBisect() { return false; } },
			instantiationService.stub(IAllowedExtensionsService, disposables.add(new AllowedExtensionsService(instantiationService.get(IProductService), instantiationService.get(IConfigurationService)))),
			workspaceTrustManagementService,
			new class extends mock<IWorkspaceTrustRequestService>() { override requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Promise<boolean> { return Promise.resolve(true); } },
			instantiationService.get(IExtensionManifestPropertiesService) || instantiationService.stub(IExtensionManifestPropertiesService, disposables.add(new ExtensionManifestPropertiesService(TestProductService, new TestConfigurationService(), new TestWorkspaceTrustEnablementService(), new NullLogService()))),
			instantiationService,
			new NullLogService()
		);
		this._register(disposables);
	}

	public async waitUntilInitialized(): Promise<void> {
		await this.extensionsManager.whenInitialized();
	}

	public reset(): void {
		let extensions = this.globalExtensionEnablementService.getDisabledExtensions();
		for (const e of this._getWorkspaceDisabledExtensions()) {
			if (!extensions.some(r => areSameExtensions(r, e))) {
				extensions.push(e);
			}
		}
		const workspaceEnabledExtensions = this._getWorkspaceEnabledExtensions();
		if (workspaceEnabledExtensions.length) {
			extensions = extensions.filter(r => !workspaceEnabledExtensions.some(e => areSameExtensions(e, r)));
		}
		extensions.forEach(d => this.setEnablement([aLocalExtension(d.id)], EnablementState.EnabledGlobally));
	}
}

suite('ExtensionEnablementService Test', () => {

	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let testObject: TestExtensionEnablementService;

	const didInstallEvent = new Emitter<readonly InstallExtensionResult[]>();
	const didUninstallEvent = new Emitter<DidUninstallExtensionEvent>();
	const didChangeProfileExtensionsEvent = new Emitter<DidChangeProfileEvent>();
	const installed: ILocalExtension[] = [];
	const malicious: IExtensionIdentifier[] = [];

	setup(() => {
		installed.splice(0, installed.length);
		instantiationService = disposableStore.add(new TestInstantiationService());
		instantiationService.stub(IFileService, disposableStore.add(new FileService(new NullLogService())));
		instantiationService.stub(IProductService, TestProductService);
		const testConfigurationService = new TestConfigurationService();
		testConfigurationService.setUserConfiguration(AllowedExtensionsConfigKey, { '*': true, 'unallowed': false });
		instantiationService.stub(IConfigurationService, testConfigurationService);
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService({
			id: 'local',
			label: 'local',
			extensionManagementService: <IProfileAwareExtensionManagementService>{
				onDidInstallExtensions: didInstallEvent.event,
				onDidUninstallExtension: didUninstallEvent.event,
				onDidChangeProfile: didChangeProfileExtensionsEvent.event,
				onProfileAwareDidInstallExtensions: Event.None,
				getInstalled: () => Promise.resolve(installed),
				async getExtensionsControlManifest(): Promise<IExtensionsControlManifest> {
					return {
						malicious,
						deprecated: {},
						search: []
					};
				}
			},
		}, null, null));
		instantiationService.stub(ILogService, NullLogService);
		instantiationService.stub(IWorkbenchExtensionManagementService, disposableStore.add(instantiationService.createInstance(ExtensionManagementService)));
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
	});

	test('test disable an extension globally', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.DisabledGlobally);
		assert.ok(!testObject.isEnabled(extension));
		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.DisabledGlobally);
	});

	test('test disable an extension globally should return truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(value => assert.ok(value));
	});

	test('test disable an extension globally triggers the change event', async () => {
		const target = sinon.spy();
		disposableStore.add(testObject.onEnablementChanged(target));
		await testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally);
		assert.ok(target.calledOnce);
		assert.deepStrictEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.a' });
	});

	test('test disable an extension globally again should return a falsy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally))
			.then(value => assert.ok(!value[0]));
	});

	test('test state of globally disabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.DisabledGlobally));
	});

	test('test state of globally enabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledGlobally))
			.then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.EnabledGlobally));
	});

	test('test disable an extension for workspace', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.DisabledWorkspace);
		assert.ok(!testObject.isEnabled(extension));
		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.DisabledWorkspace);
	});

	test('test disable an extension for workspace returns a truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(value => assert.ok(value));
	});

	test('test disable an extension for workspace again should return a falsy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace))
			.then(value => assert.ok(!value[0]));
	});

	test('test state of workspace disabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.DisabledWorkspace));
	});

	test('test state of workspace and globally disabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace))
			.then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.DisabledWorkspace));
	});

	test('test state of workspace enabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledWorkspace))
			.then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.EnabledWorkspace));
	});

	test('test state of globally disabled and workspace enabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledWorkspace))
			.then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.EnabledWorkspace));
	});

	test('test state of an extension when disabled for workspace from workspace enabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledWorkspace))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace))
			.then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.DisabledWorkspace));
	});

	test('test state of an extension when disabled globally from workspace enabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledWorkspace))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally))
			.then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.DisabledGlobally));
	});

	test('test state of an extension when disabled globally from workspace disabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally))
			.then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.DisabledGlobally));
	});

	test('test state of an extension when enabled globally from workspace enabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledWorkspace))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledGlobally))
			.then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.EnabledGlobally));
	});

	test('test state of an extension when enabled globally from workspace disabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledGlobally))
			.then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.EnabledGlobally));
	});

	test('test disable an extension for workspace and then globally', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.DisabledWorkspace);
		await testObject.setEnablement([extension], EnablementState.DisabledGlobally);
		assert.ok(!testObject.isEnabled(extension));
		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.DisabledGlobally);
	});

	test('test disable an extension for workspace and then globally return a truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally))
			.then(value => assert.ok(value));
	});

	test('test disable an extension for workspace and then globally trigger the change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => disposableStore.add(testObject.onEnablementChanged(target)))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally))
			.then(() => {
				assert.ok(target.calledOnce);
				assert.deepStrictEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.a' });
			});
	});

	test('test disable an extension globally and then for workspace', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.DisabledGlobally);
		await testObject.setEnablement([extension], EnablementState.DisabledWorkspace);
		assert.ok(!testObject.isEnabled(extension));
		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.DisabledWorkspace);
	});

	test('test disable an extension globally and then for workspace return a truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace))
			.then(value => assert.ok(value));
	});

	test('test disable an extension globally and then for workspace triggers the change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => disposableStore.add(testObject.onEnablementChanged(target)))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace))
			.then(() => {
				assert.ok(target.calledOnce);
				assert.deepStrictEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.a' });
			});
	});

	test('test disable an extension for workspace when there is no workspace throws error', () => {
		instantiationService.stub(IWorkspaceContextService, 'getWorkbenchState', WorkbenchState.EMPTY);
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => assert.fail('should throw an error'), error => assert.ok(error));
	});

	test('test enable an extension globally', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.DisabledGlobally);
		await testObject.setEnablement([extension], EnablementState.EnabledGlobally);
		assert.ok(testObject.isEnabled(extension));
		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.EnabledGlobally);
	});

	test('test enable an extension globally return truthy promise', async () => {
		await testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally);
		const value = await testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledGlobally);
		assert.strictEqual(value[0], true);
	});

	test('test enable an extension globally triggers change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => disposableStore.add(testObject.onEnablementChanged(target)))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledGlobally))
			.then(() => {
				assert.ok(target.calledOnce);
				assert.deepStrictEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.a' });
			});
	});

	test('test enable an extension globally when already enabled return falsy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledGlobally)
			.then(value => assert.ok(!value[0]));
	});

	test('test enable an extension for workspace', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.DisabledWorkspace);
		await testObject.setEnablement([extension], EnablementState.EnabledWorkspace);
		assert.ok(testObject.isEnabled(extension));
		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.EnabledWorkspace);
	});

	test('test enable an extension for workspace return truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledWorkspace))
			.then(value => assert.ok(value));
	});

	test('test enable an extension for workspace triggers change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement([aLocalExtension('pub.b')], EnablementState.DisabledWorkspace)
			.then(() => disposableStore.add(testObject.onEnablementChanged(target)))
			.then(() => testObject.setEnablement([aLocalExtension('pub.b')], EnablementState.EnabledWorkspace))
			.then(() => {
				assert.ok(target.calledOnce);
				assert.deepStrictEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.b' });
			});
	});

	test('test enable an extension for workspace when already enabled return truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledWorkspace)
			.then(value => assert.ok(value));
	});

	test('test enable an extension for workspace when disabled in workspace and gloablly', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.DisabledWorkspace);
		await testObject.setEnablement([extension], EnablementState.DisabledGlobally);
		await testObject.setEnablement([extension], EnablementState.EnabledWorkspace);
		assert.ok(testObject.isEnabled(extension));
		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.EnabledWorkspace);
	});

	test('test enable an extension globally when disabled in workspace and gloablly', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.EnabledWorkspace);
		await testObject.setEnablement([extension], EnablementState.DisabledWorkspace);
		await testObject.setEnablement([extension], EnablementState.DisabledGlobally);
		await testObject.setEnablement([extension], EnablementState.EnabledGlobally);
		assert.ok(testObject.isEnabled(extension));
		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.EnabledGlobally);
	});

	test('test enable an extension also enables dependencies', async () => {
		installed.push(...[aLocalExtension2('pub.a', { extensionDependencies: ['pub.b'] }), aLocalExtension('pub.b')]);
		const target = installed[0];
		const dep = installed[1];
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();
		await testObject.setEnablement([dep, target], EnablementState.DisabledGlobally);
		await testObject.setEnablement([target], EnablementState.EnabledGlobally);
		assert.ok(testObject.isEnabled(target));
		assert.ok(testObject.isEnabled(dep));
		assert.strictEqual(testObject.getEnablementState(target), EnablementState.EnabledGlobally);
		assert.strictEqual(testObject.getEnablementState(dep), EnablementState.EnabledGlobally);
	});

	test('test enable an extension in workspace with a dependency extension that has auth providers', async () => {
		installed.push(...[aLocalExtension2('pub.a', { extensionDependencies: ['pub.b'] }), aLocalExtension('pub.b', { authentication: [{ id: 'a', label: 'a' }] })]);
		const target = installed[0];
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();
		await testObject.setEnablement([target], EnablementState.DisabledWorkspace);
		await testObject.setEnablement([target], EnablementState.EnabledWorkspace);
		assert.ok(testObject.isEnabled(target));
		assert.strictEqual(testObject.getEnablementState(target), EnablementState.EnabledWorkspace);
	});

	test('test enable an extension with a dependency extension that cannot be enabled', async () => {
		instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), null));
		const localWorkspaceDepExtension = aLocalExtension2('pub.b', { extensionKind: ['workspace'] }, { location: URI.file(`pub.b`) });
		const remoteWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['workspace'], extensionDependencies: ['pub.b'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const remoteWorkspaceDepExtension = aLocalExtension2('pub.b', { extensionKind: ['workspace'] }, { location: URI.file(`pub.b`).with({ scheme: Schemas.vscodeRemote }) });
		installed.push(localWorkspaceDepExtension, remoteWorkspaceExtension, remoteWorkspaceDepExtension);

		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();

		await testObject.setEnablement([remoteWorkspaceExtension], EnablementState.DisabledGlobally);
		await testObject.setEnablement([remoteWorkspaceExtension], EnablementState.EnabledGlobally);
		assert.ok(testObject.isEnabled(remoteWorkspaceExtension));
		assert.strictEqual(testObject.getEnablementState(remoteWorkspaceExtension), EnablementState.EnabledGlobally);
	});

	test('test enable an extension also enables packed extensions', async () => {
		installed.push(...[aLocalExtension2('pub.a', { extensionPack: ['pub.b'] }), aLocalExtension('pub.b')]);
		const target = installed[0];
		const dep = installed[1];
		await testObject.setEnablement([dep, target], EnablementState.DisabledGlobally);
		await testObject.setEnablement([target], EnablementState.EnabledGlobally);
		assert.ok(testObject.isEnabled(target));
		assert.ok(testObject.isEnabled(dep));
		assert.strictEqual(testObject.getEnablementState(target), EnablementState.EnabledGlobally);
		assert.strictEqual(testObject.getEnablementState(dep), EnablementState.EnabledGlobally);
	});

	test('test remove an extension from disablement list when uninstalled', async () => {
		const extension = aLocalExtension('pub.a');
		installed.push(extension);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));

		await testObject.setEnablement([extension], EnablementState.DisabledWorkspace);
		await testObject.setEnablement([extension], EnablementState.DisabledGlobally);
		didUninstallEvent.fire({ identifier: { id: 'pub.a' }, profileLocation: null! });

		assert.ok(testObject.isEnabled(extension));
		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.EnabledGlobally);
	});

	test('test isEnabled return false extension is disabled globally', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => assert.ok(!testObject.isEnabled(aLocalExtension('pub.a'))));
	});

	test('test isEnabled return false extension is disabled in workspace', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => assert.ok(!testObject.isEnabled(aLocalExtension('pub.a'))));
	});

	test('test isEnabled return true extension is not disabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.c')], EnablementState.DisabledGlobally))
			.then(() => assert.ok(testObject.isEnabled(aLocalExtension('pub.b'))));
	});

	test('test canChangeEnablement return false for language packs', () => {
		assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a', { localizations: [{ languageId: 'gr', translations: [{ id: 'vscode', path: 'path' }] }] })), false);
	});

	test('test canChangeEnablement return true for auth extension', () => {
		assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a', { authentication: [{ id: 'a', label: 'a' }] })), true);
	});

	test('test canChangeEnablement return true for auth extension when user data sync account does not depends on it', () => {
		instantiationService.stub(IUserDataSyncAccountService, <Partial<IUserDataSyncAccountService>>{
			account: { authenticationProviderId: 'b' }
		});
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a', { authentication: [{ id: 'a', label: 'a' }] })), true);
	});

	test('test canChangeEnablement return true for auth extension when user data sync account depends on it but auto sync is off', () => {
		instantiationService.stub(IUserDataSyncAccountService, <Partial<IUserDataSyncAccountService>>{
			account: { authenticationProviderId: 'a' }
		});
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a', { authentication: [{ id: 'a', label: 'a' }] })), true);
	});

	test('test canChangeEnablement return false for auth extension and user data sync account depends on it and auto sync is on', () => {
		instantiationService.stub(IUserDataSyncEnablementService, <Partial<IUserDataSyncEnablementService>>{ isEnabled() { return true; } });
		instantiationService.stub(IUserDataSyncAccountService, <Partial<IUserDataSyncAccountService>>{
			account: { authenticationProviderId: 'a' }
		});
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a', { authentication: [{ id: 'a', label: 'a' }] })), false);
	});

	test('test canChangeWorkspaceEnablement return true', () => {
		assert.strictEqual(testObject.canChangeWorkspaceEnablement(aLocalExtension('pub.a')), true);
	});

	test('test canChangeWorkspaceEnablement return false if there is no workspace', () => {
		instantiationService.stub(IWorkspaceContextService, 'getWorkbenchState', WorkbenchState.EMPTY);
		assert.strictEqual(testObject.canChangeWorkspaceEnablement(aLocalExtension('pub.a')), false);
	});

	test('test canChangeWorkspaceEnablement return false for auth extension', () => {
		assert.strictEqual(testObject.canChangeWorkspaceEnablement(aLocalExtension('pub.a', { authentication: [{ id: 'a', label: 'a' }] })), false);
	});

	test('test canChangeEnablement return false when extensions are disabled in environment', () => {
		instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: true });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a')), false);
	});

	test('test canChangeEnablement return false when the extension is disabled in environment', () => {
		instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: ['pub.a'] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a')), false);
	});

	test('test canChangeEnablement return true for system extensions when extensions are disabled in environment', () => {
		instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: true });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		const extension = aLocalExtension('pub.a', undefined, ExtensionType.System);
		assert.strictEqual(testObject.canChangeEnablement(extension), true);
	});

	test('test canChangeEnablement return false for system extension when extension is disabled in environment', () => {
		instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: ['pub.a'] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		const extension = aLocalExtension('pub.a', undefined, ExtensionType.System);
		assert.ok(!testObject.canChangeEnablement(extension));
	});

	test('test extension is disabled when disabled in environment', async () => {
		const extension = aLocalExtension('pub.a');
		installed.push(extension);

		instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: ['pub.a'] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));

		assert.ok(!testObject.isEnabled(extension));
		assert.deepStrictEqual(testObject.getEnablementState(extension), EnablementState.DisabledByEnvironment);
	});

	test('test extension is enabled globally when enabled in environment', async () => {
		const extension = aLocalExtension('pub.a');
		installed.push(extension);

		instantiationService.stub(IWorkbenchEnvironmentService, { enableExtensions: <readonly string[]>['pub.a'] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));

		assert.ok(testObject.isEnabled(extension));
		assert.deepStrictEqual(testObject.getEnablementState(extension), EnablementState.EnabledGlobally);
	});

	test('test extension is enabled workspace when enabled in environment', async () => {
		const extension = aLocalExtension('pub.a');
		installed.push(extension);

		await testObject.setEnablement([extension], EnablementState.EnabledWorkspace);
		instantiationService.stub(IWorkbenchEnvironmentService, { enableExtensions: <readonly string[]>['pub.a'] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));

		assert.ok(testObject.isEnabled(extension));
		assert.deepStrictEqual(testObject.getEnablementState(extension), EnablementState.EnabledWorkspace);
	});

	test('test extension is enabled by environment when disabled globally', async () => {
		const extension = aLocalExtension('pub.a');
		installed.push(extension);

		await testObject.setEnablement([extension], EnablementState.DisabledGlobally);
		instantiationService.stub(IWorkbenchEnvironmentService, { enableExtensions: <readonly string[]>['pub.a'] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));

		assert.ok(testObject.isEnabled(extension));
		assert.deepStrictEqual(testObject.getEnablementState(extension), EnablementState.EnabledByEnvironment);
	});

	test('test extension is enabled by environment when disabled workspace', async () => {
		const extension = aLocalExtension('pub.a');
		installed.push(extension);

		await testObject.setEnablement([extension], EnablementState.DisabledWorkspace);
		instantiationService.stub(IWorkbenchEnvironmentService, { enableExtensions: <readonly string[]>['pub.a'] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));

		assert.ok(testObject.isEnabled(extension));
		assert.deepStrictEqual(testObject.getEnablementState(extension), EnablementState.EnabledByEnvironment);
	});

	test('test extension is disabled by environment when also enabled in environment', async () => {
		const extension = aLocalExtension('pub.a');
		installed.push(extension);

		testObject.setEnablement([extension], EnablementState.DisabledWorkspace);
		instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: true, enableExtensions: <readonly string[]>['pub.a'] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));

		assert.ok(!testObject.isEnabled(extension));
		assert.deepStrictEqual(testObject.getEnablementState(extension), EnablementState.DisabledByEnvironment);
	});

	test('test canChangeEnablement return false when the extension is enabled in environment', () => {
		instantiationService.stub(IWorkbenchEnvironmentService, { enableExtensions: <readonly string[]>['pub.a'] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a')), false);
	});

	test('test extension does not support vitrual workspace is not enabled in virtual workspace', async () => {
		const extension = aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: false } });
		instantiationService.stub(IWorkspaceContextService, 'getWorkspace', <IWorkspace>{ folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.ok(!testObject.isEnabled(extension));
		assert.deepStrictEqual(testObject.getEnablementState(extension), EnablementState.DisabledByVirtualWorkspace);
	});

	test('test web extension from web extension management server and does not support vitrual workspace is enabled in virtual workspace', async () => {
		instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(null, anExtensionManagementServer('vscode-remote', instantiationService), anExtensionManagementServer('web', instantiationService)));
		const extension = aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: false }, browser: 'browser.js' }, { location: URI.file(`pub.a`).with({ scheme: 'web' }) });
		instantiationService.stub(IWorkspaceContextService, 'getWorkspace', <IWorkspace>{ folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.ok(testObject.isEnabled(extension));
		assert.deepStrictEqual(testObject.getEnablementState(extension), EnablementState.EnabledGlobally);
	});

	test('test web extension from remote extension management server and does not support vitrual workspace is disabled in virtual workspace', async () => {
		instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(null, anExtensionManagementServer('vscode-remote', instantiationService), anExtensionManagementServer('web', instantiationService)));
		const extension = aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: false }, browser: 'browser.js' }, { location: URI.file(`pub.a`).with({ scheme: 'vscode-remote' }) });
		instantiationService.stub(IWorkspaceContextService, 'getWorkspace', <IWorkspace>{ folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.ok(!testObject.isEnabled(extension));
		assert.deepStrictEqual(testObject.getEnablementState(extension), EnablementState.DisabledByVirtualWorkspace);
	});

	test('test enable a remote workspace extension and local ui extension that is a dependency of remote', async () => {
		instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), null));
		const localUIExtension = aLocalExtension2('pub.a', { main: 'main.js', extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		const remoteUIExtension = aLocalExtension2('pub.a', { main: 'main.js', extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: 'vscode-remote' }) });
		const target = aLocalExtension2('pub.b', { main: 'main.js', extensionDependencies: ['pub.a'] }, { location: URI.file(`pub.b`).with({ scheme: 'vscode-remote' }) });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));

		installed.push(localUIExtension, remoteUIExtension, target);
		await testObject.setEnablement([target, localUIExtension], EnablementState.DisabledGlobally);
		await testObject.setEnablement([target, localUIExtension], EnablementState.EnabledGlobally);
		assert.ok(testObject.isEnabled(target));
		assert.ok(testObject.isEnabled(localUIExtension));
		assert.strictEqual(testObject.getEnablementState(target), EnablementState.EnabledGlobally);
		assert.strictEqual(testObject.getEnablementState(localUIExtension), EnablementState.EnabledGlobally);
	});

	test('test enable a remote workspace extension also enables its dependency in local', async () => {
		instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), null));
		const localUIExtension = aLocalExtension2('pub.a', { main: 'main.js', extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		const remoteUIExtension = aLocalExtension2('pub.a', { main: 'main.js', extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: 'vscode-remote' }) });
		const target = aLocalExtension2('pub.b', { main: 'main.js', extensionDependencies: ['pub.a'] }, { location: URI.file(`pub.b`).with({ scheme: 'vscode-remote' }) });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));

		installed.push(localUIExtension, remoteUIExtension, target);
		await testObject.setEnablement([target, localUIExtension], EnablementState.DisabledGlobally);
		await testObject.setEnablement([target], EnablementState.EnabledGlobally);
		assert.ok(testObject.isEnabled(target));
		assert.ok(testObject.isEnabled(localUIExtension));
		assert.strictEqual(testObject.getEnablementState(target), EnablementState.EnabledGlobally);
		assert.strictEqual(testObject.getEnablementState(localUIExtension), EnablementState.EnabledGlobally);
	});

	test('test canChangeEnablement return false when extension is disabled in virtual workspace', () => {
		const extension = aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: false } });
		instantiationService.stub(IWorkspaceContextService, 'getWorkspace', <IWorkspace>{ folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.ok(!testObject.canChangeEnablement(extension));
	});

	test('test extension does not support vitrual workspace is enabled in normal workspace', async () => {
		const extension = aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: false } });
		instantiationService.stub(IWorkspaceContextService, 'getWorkspace', <IWorkspace>{ folders: [{ uri: URI.file('worskapceA') }] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.ok(testObject.isEnabled(extension));
		assert.deepStrictEqual(testObject.getEnablementState(extension), EnablementState.EnabledGlobally);
	});

	test('test extension supports virtual workspace is enabled in virtual workspace', async () => {
		const extension = aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: true } });
		instantiationService.stub(IWorkspaceContextService, 'getWorkspace', <IWorkspace>{ folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.ok(testObject.isEnabled(extension));
		assert.deepStrictEqual(testObject.getEnablementState(extension), EnablementState.EnabledGlobally);
	});

	test('test extension does not support untrusted workspaces is disabled in untrusted workspace', () => {
		const extension = aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: false, description: 'hello' } } });
		instantiationService.stub(IWorkspaceTrustManagementService, <Partial<IWorkspaceTrustManagementService>>{ isWorkspaceTrusted() { return false; } });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.DisabledByTrustRequirement);
	});

	test('test canChangeEnablement return true when extension is disabled by workspace trust', () => {
		const extension = aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: false, description: 'hello' } } });
		instantiationService.stub(IWorkspaceTrustManagementService, <Partial<IWorkspaceTrustManagementService>>{ isWorkspaceTrusted() { return false; } });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.ok(testObject.canChangeEnablement(extension));
	});

	test('test extension supports untrusted workspaces is enabled in untrusted workspace', () => {
		const extension = aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: true } } });
		instantiationService.stub(IWorkspaceTrustManagementService, <Partial<IWorkspaceTrustManagementService>>{ isWorkspaceTrusted() { return false; } });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.EnabledGlobally);
	});

	test('test extension does not support untrusted workspaces is enabled in trusted workspace', () => {
		const extension = aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: false, description: '' } } });
		instantiationService.stub(IWorkspaceTrustManagementService, <Partial<IWorkspaceTrustManagementService>>{ isWorkspaceTrusted() { return true; } });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.EnabledGlobally);
	});

	test('test extension supports untrusted workspaces is enabled in trusted workspace', () => {
		const extension = aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: true } } });
		instantiationService.stub(IWorkspaceTrustManagementService, <Partial<IWorkspaceTrustManagementService>>{ isWorkspaceTrusted() { return true; } });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.EnabledGlobally);
	});

	test('test extension without any value for virtual worksapce is enabled in virtual workspace', async () => {
		const extension = aLocalExtension2('pub.a');
		instantiationService.stub(IWorkspaceContextService, 'getWorkspace', <IWorkspace>{ folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.ok(testObject.isEnabled(extension));
		assert.deepStrictEqual(testObject.getEnablementState(extension), EnablementState.EnabledGlobally);
	});

	test('test local workspace extension is disabled by kind', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.ok(!testObject.isEnabled(localWorkspaceExtension));
		assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.DisabledByExtensionKind);
	});

	test('test local workspace + ui extension is enabled by kind', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file(`pub.a`) });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.ok(testObject.isEnabled(localWorkspaceExtension));
		assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.EnabledGlobally);
	});

	test('test local ui extension is not disabled by kind', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.ok(testObject.isEnabled(localWorkspaceExtension));
		assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.EnabledGlobally);
	});

	test('test canChangeEnablement return true when the local workspace extension is disabled by kind', () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.canChangeEnablement(localWorkspaceExtension), false);
	});

	test('test canChangeEnablement return true for local ui extension', () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.canChangeEnablement(localWorkspaceExtension), true);
	});

	test('test remote ui extension is disabled by kind', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.ok(!testObject.isEnabled(localWorkspaceExtension));
		assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.DisabledByExtensionKind);
	});

	test('test remote ui+workspace extension is disabled by kind', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.ok(testObject.isEnabled(localWorkspaceExtension));
		assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.EnabledGlobally);
	});

	test('test remote ui extension is disabled by kind when there is no local server', async () => {
		instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(null, anExtensionManagementServer('vscode-remote', instantiationService), null));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.ok(!testObject.isEnabled(localWorkspaceExtension));
		assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.DisabledByExtensionKind);
	});

	test('test remote workspace extension is not disabled by kind', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.ok(testObject.isEnabled(localWorkspaceExtension));
		assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.EnabledGlobally);
	});

	test('test canChangeEnablement return true when the remote ui extension is disabled by kind', () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.canChangeEnablement(localWorkspaceExtension), false);
	});

	test('test canChangeEnablement return true for remote workspace extension', () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.canChangeEnablement(localWorkspaceExtension), true);
	});

	test('test web extension on local server is disabled by kind when web worker is not enabled', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { browser: 'browser.js' }, { location: URI.file(`pub.a`) });
		(<TestConfigurationService>instantiationService.get(IConfigurationService)).setUserConfiguration('extensions', { webWorker: false });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.isEnabled(localWorkspaceExtension), false);
		assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.DisabledByExtensionKind);
	});

	test('test web extension on local server is not disabled by kind when web worker is enabled', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { browser: 'browser.js' }, { location: URI.file(`pub.a`) });
		(<TestConfigurationService>instantiationService.get(IConfigurationService)).setUserConfiguration('extensions', { webWorker: true });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.isEnabled(localWorkspaceExtension), true);
		assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.EnabledGlobally);
	});

	test('test web extension on remote server is disabled by kind when web worker is not enabled', async () => {
		instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), null));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { browser: 'browser.js' }, { location: URI.file(`pub.a`).with({ scheme: 'vscode-remote' }) });
		(<TestConfigurationService>instantiationService.get(IConfigurationService)).setUserConfiguration('extensions', { webWorker: false });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.isEnabled(localWorkspaceExtension), false);
		assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.DisabledByExtensionKind);
	});

	test('test web extension on remote server is disabled by kind when web worker is enabled', async () => {
		instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), null));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { browser: 'browser.js' }, { location: URI.file(`pub.a`).with({ scheme: 'vscode-remote' }) });
		(<TestConfigurationService>instantiationService.get(IConfigurationService)).setUserConfiguration('extensions', { webWorker: true });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.isEnabled(localWorkspaceExtension), false);
		assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.DisabledByExtensionKind);
	});

	test('test web extension on remote server is enabled in web', async () => {
		instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), anExtensionManagementServer('web', instantiationService)));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { browser: 'browser.js' }, { location: URI.file(`pub.a`).with({ scheme: 'vscode-remote' }) });
		(<TestConfigurationService>instantiationService.get(IConfigurationService)).setUserConfiguration('extensions', { webWorker: false });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.isEnabled(localWorkspaceExtension), true);
		assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.EnabledGlobally);
	});

	test('test web extension on web server is not disabled by kind', async () => {
		instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), anExtensionManagementServer('web', instantiationService)));
		const webExtension = aLocalExtension2('pub.a', { browser: 'browser.js' }, { location: URI.file(`pub.a`).with({ scheme: 'web' }) });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.isEnabled(webExtension), true);
		assert.deepStrictEqual(testObject.getEnablementState(webExtension), EnablementState.EnabledGlobally);
	});

	test('test state of multipe extensions', async () => {
		installed.push(...[aLocalExtension('pub.a'), aLocalExtension('pub.b'), aLocalExtension('pub.c'), aLocalExtension('pub.d'), aLocalExtension('pub.e')]);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();

		await testObject.setEnablement([installed[0]], EnablementState.DisabledGlobally);
		await testObject.setEnablement([installed[1]], EnablementState.DisabledWorkspace);
		await testObject.setEnablement([installed[2]], EnablementState.EnabledWorkspace);
		await testObject.setEnablement([installed[3]], EnablementState.EnabledGlobally);

		assert.deepStrictEqual(testObject.getEnablementStates(installed), [EnablementState.DisabledGlobally, EnablementState.DisabledWorkspace, EnablementState.EnabledWorkspace, EnablementState.EnabledGlobally, EnablementState.EnabledGlobally]);
	});

	test('test extension is disabled by dependency if it has a dependency that is disabled', async () => {
		installed.push(...[aLocalExtension2('pub.a'), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] })]);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();

		await testObject.setEnablement([installed[0]], EnablementState.DisabledGlobally);

		assert.strictEqual(testObject.getEnablementState(installed[1]), EnablementState.DisabledByExtensionDependency);
	});

	test('test extension is disabled by dependency if it has a dependency that is disabled by virtual workspace', async () => {
		installed.push(...[aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: false } }), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'], capabilities: { virtualWorkspaces: true } })]);
		instantiationService.stub(IWorkspaceContextService, 'getWorkspace', <IWorkspace>{ folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();

		assert.strictEqual(testObject.getEnablementState(installed[0]), EnablementState.DisabledByVirtualWorkspace);
		assert.strictEqual(testObject.getEnablementState(installed[1]), EnablementState.DisabledByExtensionDependency);
	});

	test('test canChangeEnablement return false when extension is disabled by dependency if it has a dependency that is disabled by virtual workspace', async () => {
		installed.push(...[aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: false } }), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'], capabilities: { virtualWorkspaces: true } })]);
		instantiationService.stub(IWorkspaceContextService, 'getWorkspace', <IWorkspace>{ folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();

		assert.ok(!testObject.canChangeEnablement(installed[1]));
	});

	test('test extension is disabled by dependency if it has a dependency that is disabled by workspace trust', async () => {
		installed.push(...[aLocalExtension2('pub.a', { main: 'hello.js', capabilities: { untrustedWorkspaces: { supported: false, description: '' } } }), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'], capabilities: { untrustedWorkspaces: { supported: true } } })]);
		instantiationService.stub(IWorkspaceTrustManagementService, <Partial<IWorkspaceTrustManagementService>>{ isWorkspaceTrusted() { return false; } });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();

		assert.strictEqual(testObject.getEnablementState(installed[0]), EnablementState.DisabledByTrustRequirement);
		assert.strictEqual(testObject.getEnablementState(installed[1]), EnablementState.DisabledByExtensionDependency);
	});

	test('test extension is not disabled by dependency if it has a dependency that is disabled by extension kind', async () => {
		instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), null));
		const localUIExtension = aLocalExtension2('pub.a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		const remoteUIExtension = aLocalExtension2('pub.a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const remoteWorkspaceExtension = aLocalExtension2('pub.n', { extensionKind: ['workspace'], extensionDependencies: ['pub.a'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		installed.push(localUIExtension, remoteUIExtension, remoteWorkspaceExtension);

		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();

		assert.strictEqual(testObject.getEnablementState(localUIExtension), EnablementState.EnabledGlobally);
		assert.strictEqual(testObject.getEnablementState(remoteUIExtension), EnablementState.DisabledByExtensionKind);
		assert.strictEqual(testObject.getEnablementState(remoteWorkspaceExtension), EnablementState.EnabledGlobally);
	});

	test('test canChangeEnablement return false when extension is disabled by dependency if it has a dependency that is disabled by workspace trust', async () => {
		installed.push(...[aLocalExtension2('pub.a', { main: 'hello.js', capabilities: { untrustedWorkspaces: { supported: false, description: '' } } }), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'], capabilities: { untrustedWorkspaces: { supported: true } } })]);
		instantiationService.stub(IWorkspaceTrustManagementService, <Partial<IWorkspaceTrustManagementService>>{ isWorkspaceTrusted() { return false; } });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();

		assert.deepEqual(testObject.canChangeEnablement(installed[1]), false);
	});

	test('test canChangeEnablement return false when extension is disabled by dependency if it has a dependency that is disabled globally', async () => {
		installed.push(...[aLocalExtension2('pub.a', {}), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] })]);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();

		await testObject.setEnablement([installed[0]], EnablementState.DisabledGlobally);

		assert.deepEqual(testObject.canChangeEnablement(installed[1]), false);
	});

	test('test canChangeEnablement return false when extension is disabled by dependency if it has a dependency that is disabled workspace', async () => {
		installed.push(...[aLocalExtension2('pub.a', {}), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] })]);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();

		await testObject.setEnablement([installed[0]], EnablementState.DisabledWorkspace);

		assert.deepEqual(testObject.canChangeEnablement(installed[1]), false);
	});

	test('test extension is not disabled by dependency even if it has a dependency that is disabled when installed extensions are not set', async () => {
		await testObject.setEnablement([aLocalExtension2('pub.a')], EnablementState.DisabledGlobally);

		assert.strictEqual(testObject.getEnablementState(aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] })), EnablementState.EnabledGlobally);
	});

	test('test extension is disabled by dependency if it has a dependency that is disabled when all extensions are passed', async () => {
		installed.push(...[aLocalExtension2('pub.a'), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] })]);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();

		await testObject.setEnablement([installed[0]], EnablementState.DisabledGlobally);

		assert.deepStrictEqual(testObject.getEnablementStates(installed), [EnablementState.DisabledGlobally, EnablementState.DisabledByExtensionDependency]);
	});

	test('test extension is not disabled when it has a missing dependency', async () => {
		const target = aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] });
		installed.push(target);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();

		assert.strictEqual(testObject.getEnablementState(target), EnablementState.EnabledGlobally);
	});

	test('test extension is not disabled when it has a dependency in another server', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const target = aLocalExtension2('pub.a', { extensionDependencies: ['pub.b'], extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		const depdencyOnAnotherServer = aLocalExtension2('pub.b', {}, { location: URI.file(`pub.b`).with({ scheme: Schemas.vscodeRemote }) });
		installed.push(...[target, depdencyOnAnotherServer]);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();

		assert.strictEqual(testObject.getEnablementState(target), EnablementState.EnabledGlobally);
	});

	test('test extension is enabled when it has a dependency in another server which is disabled', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const target = aLocalExtension2('pub.a', { extensionDependencies: ['pub.b'], extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		const depdencyOnAnotherServer = aLocalExtension2('pub.b', {}, { location: URI.file(`pub.b`).with({ scheme: Schemas.vscodeRemote }) });
		installed.push(...[target, depdencyOnAnotherServer]);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();
		await testObject.setEnablement([depdencyOnAnotherServer], EnablementState.DisabledGlobally);

		assert.strictEqual(testObject.getEnablementState(target), EnablementState.EnabledGlobally);
	});

	test('test extension is enabled when it has a dependency in another server which is disabled and with no exports and no main and no browser entrypoints', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const target = aLocalExtension2('pub.a', { extensionDependencies: ['pub.b'], extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		const depdencyOnAnotherServer = aLocalExtension2('pub.b', { api: 'none' }, { location: URI.file(`pub.b`).with({ scheme: Schemas.vscodeRemote }) });
		installed.push(...[target, depdencyOnAnotherServer]);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();
		await testObject.setEnablement([depdencyOnAnotherServer], EnablementState.DisabledGlobally);

		assert.strictEqual(testObject.getEnablementState(target), EnablementState.EnabledGlobally);
	});

	test('test extension is disabled by dependency when it has a dependency in another server  which is disabled and with no exports and has main entry point', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const target = aLocalExtension2('pub.a', { extensionDependencies: ['pub.b'], extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
		const depdencyOnAnotherServer = aLocalExtension2('pub.b', { api: 'none', main: 'main.js' }, { location: URI.file(`pub.b`).with({ scheme: Schemas.vscodeRemote }) });
		installed.push(...[target, depdencyOnAnotherServer]);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();
		await testObject.setEnablement([depdencyOnAnotherServer], EnablementState.DisabledGlobally);

		assert.strictEqual(testObject.getEnablementState(target), EnablementState.DisabledByExtensionDependency);
	});

	test('test extension is disabled by dependency when it has a dependency in another server  which is disabled and with no exports and has browser entry point', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const target = aLocalExtension2('pub.a', { extensionDependencies: ['pub.b'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		const depdencyOnAnotherServer = aLocalExtension2('pub.b', { api: 'none', browser: 'browser.js', extensionKind: 'ui' }, { location: URI.file(`pub.b`) });
		installed.push(...[target, depdencyOnAnotherServer]);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();
		await testObject.setEnablement([depdencyOnAnotherServer], EnablementState.DisabledGlobally);

		assert.strictEqual(testObject.getEnablementState(target), EnablementState.DisabledByExtensionDependency);
	});

	test('test extension is disabled by invalidity', async () => {
		const target = aLocalExtension2('pub.b', {}, { isValid: false });
		assert.strictEqual(testObject.getEnablementState(target), EnablementState.DisabledByInvalidExtension);
	});

	test('test extension is disabled by dependency when it has a dependency that is invalid', async () => {
		const target = aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] });
		installed.push(...[target, aLocalExtension2('pub.a', {}, { isValid: false })]);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();

		assert.strictEqual(testObject.getEnablementState(target), EnablementState.DisabledByExtensionDependency);
	});

	test('test extension is enabled when its dependency becomes valid', async () => {
		const extension = aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] });
		installed.push(...[extension, aLocalExtension2('pub.a', {}, { isValid: false })]);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();

		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.DisabledByExtensionDependency);

		const target = sinon.spy();
		disposableStore.add(testObject.onEnablementChanged(target));

		const validExtension = aLocalExtension2('pub.a');
		didInstallEvent.fire([{
			identifier: validExtension.identifier,
			operation: InstallOperation.Install,
			source: validExtension.location,
			profileLocation: validExtension.location,
			local: validExtension,
		}]);

		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.EnabledGlobally);
		assert.deepStrictEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.b' });
	});

	test('test override workspace to trusted when getting extensions enablements', async () => {
		const extension = aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: false, description: 'hello' } } });
		instantiationService.stub(IWorkspaceTrustManagementService, <Partial<IWorkspaceTrustManagementService>>{ isWorkspaceTrusted() { return false; } });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));

		assert.strictEqual(testObject.getEnablementStates([extension], { trusted: true })[0], EnablementState.EnabledGlobally);
	});

	test('test override workspace to not trusted when getting extensions enablements', async () => {
		const extension = aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: false, description: 'hello' } } });
		instantiationService.stub(IWorkspaceTrustManagementService, <Partial<IWorkspaceTrustManagementService>>{ isWorkspaceTrusted() { return true; } });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));

		assert.strictEqual(testObject.getEnablementStates([extension], { trusted: false })[0], EnablementState.DisabledByTrustRequirement);
	});

	test('test update extensions enablements on trust change triggers change events for extensions depending on workspace trust', async () => {
		installed.push(...[
			aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: false, description: 'hello' } } }),
			aLocalExtension2('pub.b', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: true } } }),
			aLocalExtension2('pub.c', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: false, description: 'hello' } } }),
			aLocalExtension2('pub.d', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: true } } }),
		]);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		const target = sinon.spy();
		disposableStore.add(testObject.onEnablementChanged(target));

		await testObject.updateExtensionsEnablementsWhenWorkspaceTrustChanges();
		assert.strictEqual(target.args[0][0].length, 2);
		assert.deepStrictEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.a' });
		assert.deepStrictEqual((<IExtension>target.args[0][0][1]).identifier, { id: 'pub.c' });
	});

	test('test adding an extension that was disabled', async () => {
		const extension = aLocalExtension('pub.a');
		installed.push(extension);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await testObject.setEnablement([extension], EnablementState.DisabledGlobally);

		const target = sinon.spy();
		disposableStore.add(testObject.onEnablementChanged(target));
		didChangeProfileExtensionsEvent.fire({ added: [extension], removed: [] });

		assert.ok(!testObject.isEnabled(extension));
		assert.strictEqual(testObject.getEnablementState(extension), EnablementState.DisabledGlobally);
		assert.strictEqual(target.args[0][0].length, 1);
		assert.deepStrictEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.a' });
	});

	test('test extension is disabled by allowed list', async () => {
		const target = aLocalExtension2('unallowed.extension');
		assert.strictEqual(testObject.getEnablementState(target), EnablementState.DisabledByAllowlist);
	});

	test('test extension is disabled by malicious', async () => {
		malicious.push({ id: 'malicious.extensionA' });
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		await (<TestExtensionEnablementService>testObject).waitUntilInitialized();
		const target = aLocalExtension2('malicious.extensionA');
		assert.strictEqual(testObject.getEnablementState(target), EnablementState.DisabledByMalicious);
	});

	test('test installed malicious extension triggers change event', async () => {
		testObject.dispose();
		malicious.push({ id: 'malicious.extensionB' });
		const local = aLocalExtension2('malicious.extensionB');
		installed.push(local);
		testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
		assert.strictEqual(testObject.getEnablementState(local), EnablementState.EnabledGlobally);
		const promise = Event.toPromise(testObject.onEnablementChanged);

		const result = await promise;
		assert.deepStrictEqual(result[0], local);
		assert.strictEqual(testObject.getEnablementState(local), EnablementState.DisabledByMalicious);
	});

});

function anExtensionManagementServer(authority: string, instantiationService: TestInstantiationService): IExtensionManagementServer {
	return {
		id: authority,
		label: authority,
		extensionManagementService: instantiationService.get(IExtensionManagementService) as IProfileAwareExtensionManagementService,
	};
}

function aMultiExtensionManagementServerService(instantiationService: TestInstantiationService): IExtensionManagementServerService {
	const localExtensionManagementServer = anExtensionManagementServer('vscode-local', instantiationService);
	const remoteExtensionManagementServer = anExtensionManagementServer('vscode-remote', instantiationService);
	return anExtensionManagementServerService(localExtensionManagementServer, remoteExtensionManagementServer, null);
}

export function anExtensionManagementServerService(localExtensionManagementServer: IExtensionManagementServer | null, remoteExtensionManagementServer: IExtensionManagementServer | null, webExtensionManagementServer: IExtensionManagementServer | null): IExtensionManagementServerService {
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
			return webExtensionManagementServer;
		},
		getExtensionInstallLocation(extension: IExtension): ExtensionInstallLocation | null {
			const server = this.getExtensionManagementServer(extension);
			return server === remoteExtensionManagementServer ? ExtensionInstallLocation.Remote
				: server === webExtensionManagementServer ? ExtensionInstallLocation.Web
					: ExtensionInstallLocation.Local;
		}
	};
}

function aLocalExtension(id: string, contributes?: IExtensionContributions, type?: ExtensionType): ILocalExtension {
	return aLocalExtension2(id, contributes ? { contributes } : {}, isUndefinedOrNull(type) ? {} : { type });
}

function aLocalExtension2(id: string, manifest: Partial<IExtensionManifest> = {}, properties: any = {}): ILocalExtension {
	const [publisher, name] = id.split('.');
	manifest = { name, publisher, ...manifest };
	properties = {
		identifier: { id },
		location: URI.file(`pub.${name}`),
		galleryIdentifier: { id, uuid: undefined },
		type: ExtensionType.User,
		...properties,
		isValid: properties.isValid ?? true,
	};
	properties.isBuiltin = properties.type === ExtensionType.System;
	return <ILocalExtension>Object.create({ manifest, ...properties });
}
