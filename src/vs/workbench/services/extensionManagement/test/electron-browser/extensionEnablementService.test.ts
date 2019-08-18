/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as sinon from 'sinon';
import { IExtensionManagementService, DidUninstallExtensionEvent, ILocalExtension, DidInstallExtensionEvent, InstallOperation } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionEnablementService, EnablementState, IExtensionManagementServerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionEnablementService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Emitter } from 'vs/base/common/event';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IStorageService, InMemoryStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IExtensionContributions, ExtensionType, IExtension } from 'vs/platform/extensions/common/extensions';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { assign } from 'vs/base/common/objects';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { productService } from 'vs/workbench/test/workbenchTestServices';

function storageService(instantiationService: TestInstantiationService): IStorageService {
	let service = instantiationService.get(IStorageService);
	if (!service) {
		let workspaceContextService = instantiationService.get(IWorkspaceContextService);
		if (!workspaceContextService) {
			workspaceContextService = instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{
				getWorkbenchState: () => WorkbenchState.FOLDER,
			});
		}
		service = instantiationService.stub(IStorageService, new InMemoryStorageService());
	}
	return service;
}

export class TestExtensionEnablementService extends ExtensionEnablementService {
	constructor(instantiationService: TestInstantiationService) {
		super(
			storageService(instantiationService),
			instantiationService.get(IWorkspaceContextService),
			instantiationService.get(IWorkbenchEnvironmentService) || instantiationService.stub(IWorkbenchEnvironmentService, { configuration: Object.create(null) } as IWorkbenchEnvironmentService),
			instantiationService.get(IExtensionManagementService) || instantiationService.stub(IExtensionManagementService,
				{ onDidInstallExtension: new Emitter<DidInstallExtensionEvent>().event, onDidUninstallExtension: new Emitter<DidUninstallExtensionEvent>().event } as IExtensionManagementService),
			instantiationService.get(IConfigurationService), instantiationService.get(IExtensionManagementServerService),
			productService
		);
	}

	public reset(): void {
		let extensions = this._getDisabledExtensions(StorageScope.GLOBAL);
		for (const e of this._getDisabledExtensions(StorageScope.WORKSPACE)) {
			if (!extensions.some(r => areSameExtensions(r, e))) {
				extensions.push(e);
			}
		}
		const workspaceEnabledExtensions = this._getEnabledExtensions(StorageScope.WORKSPACE);
		if (workspaceEnabledExtensions.length) {
			extensions = extensions.filter(r => !workspaceEnabledExtensions.some(e => areSameExtensions(e, r)));
		}
		extensions.forEach(d => this.setEnablement([aLocalExtension(d.id)], EnablementState.EnabledGlobally));
	}
}

suite('ExtensionEnablementService Test', () => {

	let instantiationService: TestInstantiationService;
	let testObject: IExtensionEnablementService;

	const didUninstallEvent = new Emitter<DidUninstallExtensionEvent>();
	const didInstallEvent = new Emitter<DidInstallExtensionEvent>();

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IExtensionManagementService, { onDidUninstallExtension: didUninstallEvent.event, onDidInstallExtension: didInstallEvent.event, getInstalled: () => Promise.resolve([] as ILocalExtension[]) } as IExtensionManagementService);
		instantiationService.stub(IExtensionManagementServerService, <IExtensionManagementServerService>{
			localExtensionManagementServer: {
				extensionManagementService: instantiationService.get(IExtensionManagementService)
			}
		});
		testObject = new TestExtensionEnablementService(instantiationService);
	});

	teardown(() => {
		(<ExtensionEnablementService>testObject).dispose();
	});

	test('test disable an extension globally', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.DisabledGlobally);
		assert.ok(!testObject.isEnabled(extension));
		assert.equal(testObject.getEnablementState(extension), EnablementState.DisabledGlobally);
	});

	test('test disable an extension globally should return truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(value => assert.ok(value));
	});

	test('test disable an extension globally triggers the change event', () => {
		const target = sinon.spy();
		testObject.onEnablementChanged(target);
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => {
				assert.ok(target.calledOnce);
				assert.deepEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.a' });
			});
	});

	test('test disable an extension globally again should return a falsy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally))
			.then(value => assert.ok(!value[0]));
	});

	test('test state of globally disabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.DisabledGlobally));
	});

	test('test state of globally enabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledGlobally))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.EnabledGlobally));
	});

	test('test disable an extension for workspace', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.DisabledWorkspace);
		assert.ok(!testObject.isEnabled(extension));
		assert.equal(testObject.getEnablementState(extension), EnablementState.DisabledWorkspace);
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
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.DisabledWorkspace));
	});

	test('test state of workspace and globally disabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.DisabledWorkspace));
	});

	test('test state of workspace enabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledWorkspace))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.EnabledWorkspace));
	});

	test('test state of globally disabled and workspace enabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledWorkspace))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.EnabledWorkspace));
	});

	test('test state of an extension when disabled for workspace from workspace enabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledWorkspace))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.DisabledWorkspace));
	});

	test('test state of an extension when disabled globally from workspace enabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledWorkspace))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.DisabledGlobally));
	});

	test('test state of an extension when disabled globally from workspace disabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.DisabledGlobally));
	});

	test('test state of an extension when enabled globally from workspace enabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledWorkspace))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledGlobally))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.EnabledGlobally));
	});

	test('test state of an extension when enabled globally from workspace disabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledGlobally))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.EnabledGlobally));
	});

	test('test disable an extension for workspace and then globally', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.DisabledWorkspace);
		await testObject.setEnablement([extension], EnablementState.DisabledGlobally);
		assert.ok(!testObject.isEnabled(extension));
		assert.equal(testObject.getEnablementState(extension), EnablementState.DisabledGlobally);
	});

	test('test disable an extension for workspace and then globally return a truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally))
			.then(value => assert.ok(value));
	});

	test('test disable an extension for workspace and then globally trigger the change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally))
			.then(() => {
				assert.ok(target.calledOnce);
				assert.deepEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.a' });
			});
	});

	test('test disable an extension globally and then for workspace', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.DisabledGlobally);
		await testObject.setEnablement([extension], EnablementState.DisabledWorkspace);
		assert.ok(!testObject.isEnabled(extension));
		assert.equal(testObject.getEnablementState(extension), EnablementState.DisabledWorkspace);
	});

	test('test disable an extension globally and then for workspace return a truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace))
			.then(value => assert.ok(value));
	});

	test('test disable an extension globally and then for workspace triggers the change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace))
			.then(() => {
				assert.ok(target.calledOnce);
				assert.deepEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.a' });
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
		assert.equal(testObject.getEnablementState(extension), EnablementState.EnabledGlobally);
	});

	test('test enable an extension globally return truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledGlobally))
			.then(value => assert.ok(value));
	});

	test('test enable an extension globally triggers change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledGlobally)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledGlobally))
			.then(() => {
				assert.ok(target.calledOnce);
				assert.deepEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.a' });
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
		assert.equal(testObject.getEnablementState(extension), EnablementState.EnabledWorkspace);
	});

	test('test enable an extension for workspace return truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.DisabledWorkspace)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.EnabledWorkspace))
			.then(value => assert.ok(value));
	});

	test('test enable an extension for workspace triggers change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement([aLocalExtension('pub.b')], EnablementState.DisabledWorkspace)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement([aLocalExtension('pub.b')], EnablementState.EnabledWorkspace))
			.then(() => {
				assert.ok(target.calledOnce);
				assert.deepEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.b' });
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
		assert.equal(testObject.getEnablementState(extension), EnablementState.EnabledWorkspace);
	});

	test('test enable an extension globally when disabled in workspace and gloablly', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.EnabledWorkspace);
		await testObject.setEnablement([extension], EnablementState.DisabledWorkspace);
		await testObject.setEnablement([extension], EnablementState.DisabledGlobally);
		await testObject.setEnablement([extension], EnablementState.EnabledGlobally);
		assert.ok(testObject.isEnabled(extension));
		assert.equal(testObject.getEnablementState(extension), EnablementState.EnabledGlobally);
	});

	test('test installing an extension re-eanbles it when disabled globally', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement([local], EnablementState.DisabledGlobally);
		didInstallEvent.fire({ local, identifier: local.identifier, operation: InstallOperation.Install });
		assert.ok(testObject.isEnabled(local));
		assert.equal(testObject.getEnablementState(local), EnablementState.EnabledGlobally);
	});

	test('test updating an extension does not re-eanbles it when disabled globally', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement([local], EnablementState.DisabledGlobally);
		didInstallEvent.fire({ local, identifier: local.identifier, operation: InstallOperation.Update });
		assert.ok(!testObject.isEnabled(local));
		assert.equal(testObject.getEnablementState(local), EnablementState.DisabledGlobally);
	});

	test('test installing an extension fires enablement change event when disabled globally', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement([local], EnablementState.DisabledGlobally);
		return new Promise((c, e) => {
			testObject.onEnablementChanged(([e]) => {
				if (e.identifier.id === local.identifier.id) {
					c();
				}
			});
			didInstallEvent.fire({ local, identifier: local.identifier, operation: InstallOperation.Install });
		});
	});

	test('test updating an extension does not fires enablement change event when disabled globally', async () => {
		const target = sinon.spy();
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement([local], EnablementState.DisabledGlobally);
		testObject.onEnablementChanged(target);
		didInstallEvent.fire({ local, identifier: local.identifier, operation: InstallOperation.Update });
		assert.ok(!target.called);
	});

	test('test installing an extension re-eanbles it when workspace disabled', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement([local], EnablementState.DisabledWorkspace);
		didInstallEvent.fire({ local, identifier: local.identifier, operation: InstallOperation.Install });
		assert.ok(testObject.isEnabled(local));
		assert.equal(testObject.getEnablementState(local), EnablementState.EnabledGlobally);
	});

	test('test updating an extension does not re-eanbles it when workspace disabled', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement([local], EnablementState.DisabledWorkspace);
		didInstallEvent.fire({ local, identifier: local.identifier, operation: InstallOperation.Update });
		assert.ok(!testObject.isEnabled(local));
		assert.equal(testObject.getEnablementState(local), EnablementState.DisabledWorkspace);
	});

	test('test installing an extension fires enablement change event when workspace disabled', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement([local], EnablementState.DisabledWorkspace);
		return new Promise((c, e) => {
			testObject.onEnablementChanged(([e]) => {
				if (e.identifier.id === local.identifier.id) {
					c();
				}
			});
			didInstallEvent.fire({ local, identifier: local.identifier, operation: InstallOperation.Install });
		});
	});

	test('test updating an extension does not fires enablement change event when workspace disabled', async () => {
		const target = sinon.spy();
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement([local], EnablementState.DisabledWorkspace);
		testObject.onEnablementChanged(target);
		didInstallEvent.fire({ local, identifier: local.identifier, operation: InstallOperation.Update });
		assert.ok(!target.called);
	});

	test('test installing an extension should not fire enablement change event when extension is not disabled', async () => {
		const target = sinon.spy();
		const local = aLocalExtension('pub.a');
		testObject.onEnablementChanged(target);
		didInstallEvent.fire({ local, identifier: local.identifier, operation: InstallOperation.Install });
		assert.ok(!target.called);
	});

	test('test remove an extension from disablement list when uninstalled', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.DisabledWorkspace);
		await testObject.setEnablement([extension], EnablementState.DisabledGlobally);
		didUninstallEvent.fire({ identifier: { id: 'pub.a' } });
		assert.ok(testObject.isEnabled(extension));
		assert.equal(testObject.getEnablementState(extension), EnablementState.EnabledGlobally);
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
		assert.equal(testObject.canChangeEnablement(aLocalExtension('pub.a', { localizations: [{ languageId: 'gr', translations: [{ id: 'vscode', path: 'path' }] }] })), false);
	});

	test('test canChangeEnablement return false when extensions are disabled in environment', () => {
		instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: true } as IWorkbenchEnvironmentService);
		testObject = new TestExtensionEnablementService(instantiationService);
		assert.equal(testObject.canChangeEnablement(aLocalExtension('pub.a')), false);
	});

	test('test canChangeEnablement return false when the extension is disabled in environment', () => {
		instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: ['pub.a'] } as IWorkbenchEnvironmentService);
		testObject = new TestExtensionEnablementService(instantiationService);
		assert.equal(testObject.canChangeEnablement(aLocalExtension('pub.a')), false);
	});

	test('test canChangeEnablement return true for system extensions when extensions are disabled in environment', () => {
		instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: true } as IWorkbenchEnvironmentService);
		testObject = new TestExtensionEnablementService(instantiationService);
		const extension = aLocalExtension('pub.a', undefined, ExtensionType.System);
		assert.equal(testObject.canChangeEnablement(extension), true);
	});

	test('test canChangeEnablement return false for system extension when extension is disabled in environment', () => {
		instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: ['pub.a'] } as IWorkbenchEnvironmentService);
		testObject = new TestExtensionEnablementService(instantiationService);
		const extension = aLocalExtension('pub.a', undefined, ExtensionType.System);
		assert.ok(!testObject.canChangeEnablement(extension));
	});

	test('test extension is disabled when disabled in enviroment', async () => {
		const extension = aLocalExtension('pub.a');
		instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: ['pub.a'] } as IWorkbenchEnvironmentService);
		instantiationService.stub(IExtensionManagementService, { onDidUninstallExtension: didUninstallEvent.event, onDidInstallExtension: didInstallEvent.event, getInstalled: () => Promise.resolve([extension, aLocalExtension('pub.b')]) } as IExtensionManagementService);
		testObject = new TestExtensionEnablementService(instantiationService);
		assert.ok(!testObject.isEnabled(extension));
		assert.deepEqual(testObject.getEnablementState(extension), EnablementState.DisabledByEnvironemt);
	});

	test('test local workspace extension is disabled by kind', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: 'workspace' }, { location: URI.file(`pub.a`) });
		testObject = new TestExtensionEnablementService(instantiationService);
		assert.ok(!testObject.isEnabled(localWorkspaceExtension));
		assert.deepEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.DisabledByExtensionKind);
	});

	test('test local ui extension is not disabled by kind', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: 'ui' }, { location: URI.file(`pub.a`) });
		testObject = new TestExtensionEnablementService(instantiationService);
		assert.ok(testObject.isEnabled(localWorkspaceExtension));
		assert.deepEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.EnabledGlobally);
	});

	test('test canChangeEnablement return false when the local workspace extension is disabled by kind', () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: 'workspace' }, { location: URI.file(`pub.a`) });
		testObject = new TestExtensionEnablementService(instantiationService);
		assert.equal(testObject.canChangeEnablement(localWorkspaceExtension), false);
	});

	test('test canChangeEnablement return true for local ui extension', () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: 'ui' }, { location: URI.file(`pub.a`) });
		testObject = new TestExtensionEnablementService(instantiationService);
		assert.equal(testObject.canChangeEnablement(localWorkspaceExtension), true);
	});

	test('test remote ui extension is disabled by kind', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: 'ui' }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		testObject = new TestExtensionEnablementService(instantiationService);
		assert.ok(!testObject.isEnabled(localWorkspaceExtension));
		assert.deepEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.DisabledByExtensionKind);
	});

	test('test remote workspace extension is not disabled by kind', async () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: 'workspace' }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		testObject = new TestExtensionEnablementService(instantiationService);
		assert.ok(testObject.isEnabled(localWorkspaceExtension));
		assert.deepEqual(testObject.getEnablementState(localWorkspaceExtension), EnablementState.EnabledGlobally);
	});

	test('test canChangeEnablement return false when the remote ui extension is disabled by kind', () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: 'ui' }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		testObject = new TestExtensionEnablementService(instantiationService);
		assert.equal(testObject.canChangeEnablement(localWorkspaceExtension), false);
	});

	test('test canChangeEnablement return true for remote workspace extension', () => {
		instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
		const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: 'workspace' }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
		testObject = new TestExtensionEnablementService(instantiationService);
		assert.equal(testObject.canChangeEnablement(localWorkspaceExtension), true);
	});

});

function aMultiExtensionManagementServerService(instantiationService: TestInstantiationService): IExtensionManagementServerService {
	const localExtensionManagementServer = {
		authority: 'vscode-local',
		label: 'local',
		extensionManagementService: instantiationService.get(IExtensionManagementService)
	};
	const remoteExtensionManagementServer = {
		authority: 'vscode-remote',
		label: 'remote',
		extensionManagementService: instantiationService.get(IExtensionManagementService)
	};
	return {
		_serviceBrand: {},
		localExtensionManagementServer,
		remoteExtensionManagementServer,
		getExtensionManagementServer: (location: URI) => {
			if (location.scheme === Schemas.file) {
				return localExtensionManagementServer;
			}
			if (location.scheme === REMOTE_HOST_SCHEME) {
				return remoteExtensionManagementServer;
			}
			return null;
		}
	};
}

function aLocalExtension(id: string, contributes?: IExtensionContributions, type?: ExtensionType): ILocalExtension {
	return aLocalExtension2(id, contributes ? { contributes } : {}, isUndefinedOrNull(type) ? {} : { type });
}

function aLocalExtension2(id: string, manifest: any = {}, properties: any = {}): ILocalExtension {
	const [publisher, name] = id.split('.');
	properties = assign({
		identifier: { id },
		galleryIdentifier: { id, uuid: undefined },
		type: ExtensionType.User
	}, properties);
	manifest = assign({ name, publisher }, manifest);
	return <ILocalExtension>Object.create({ manifest, ...properties });
}
