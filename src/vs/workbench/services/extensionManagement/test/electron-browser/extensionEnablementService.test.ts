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
import { ProductService } from 'vs/platform/product/node/productService';

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
			new ProductService()
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
		extensions.forEach(d => this.setEnablement([aLocalExtension(d.id)], EnablementState.Enabled));
	}
}

suite('ExtensionEnablementService Test', () => {

	let instantiationService: TestInstantiationService;
	let testObject: IExtensionEnablementService;

	const didUninstallEvent = new Emitter<DidUninstallExtensionEvent>();
	const didInstallEvent = new Emitter<DidInstallExtensionEvent>();

	setup(() => {
		instantiationService = new TestInstantiationService();
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
		await testObject.setEnablement([extension], EnablementState.Disabled);
		assert.ok(!testObject.isEnabled(extension));
		assert.equal(testObject.getEnablementState(extension), EnablementState.Disabled);
	});

	test('test disable an extension globally should return truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled)
			.then(value => assert.ok(value));
	});

	test('test disable an extension globally triggers the change event', () => {
		const target = sinon.spy();
		testObject.onEnablementChanged(target);
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled)
			.then(() => {
				assert.ok(target.calledOnce);
				assert.deepEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.a' });
			});
	});

	test('test disable an extension globally again should return a falsy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled))
			.then(value => assert.ok(!value[0]));
	});

	test('test state of globally disabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled)
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.Disabled));
	});

	test('test state of globally enabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Enabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.Enabled));
	});

	test('test disable an extension for workspace', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.WorkspaceDisabled);
		assert.ok(!testObject.isEnabled(extension));
		assert.equal(testObject.getEnablementState(extension), EnablementState.WorkspaceDisabled);
	});

	test('test disable an extension for workspace returns a truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled)
			.then(value => assert.ok(value));
	});

	test('test disable an extension for workspace again should return a falsy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled))
			.then(value => assert.ok(!value[0]));
	});

	test('test state of workspace disabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled)
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.WorkspaceDisabled));
	});

	test('test state of workspace and globally disabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.WorkspaceDisabled));
	});

	test('test state of workspace enabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceEnabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.WorkspaceEnabled));
	});

	test('test state of globally disabled and workspace enabled extension', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceEnabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.WorkspaceEnabled));
	});

	test('test state of an extension when disabled for workspace from workspace enabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceEnabled))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.WorkspaceDisabled));
	});

	test('test state of an extension when disabled globally from workspace enabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceEnabled))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.Disabled));
	});

	test('test state of an extension when disabled globally from workspace disabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.Disabled));
	});

	test('test state of an extension when enabled globally from workspace enabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceEnabled))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Enabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.Enabled));
	});

	test('test state of an extension when enabled globally from workspace disabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Enabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.Enabled));
	});

	test('test disable an extension for workspace and then globally', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.WorkspaceDisabled);
		await testObject.setEnablement([extension], EnablementState.Disabled);
		assert.ok(!testObject.isEnabled(extension));
		assert.equal(testObject.getEnablementState(extension), EnablementState.Disabled);
	});

	test('test disable an extension for workspace and then globally return a truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled))
			.then(value => assert.ok(value));
	});

	test('test disable an extension for workspace and then globally trigger the change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled))
			.then(() => {
				assert.ok(target.calledOnce);
				assert.deepEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.a' });
			});
	});

	test('test disable an extension globally and then for workspace', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.Disabled);
		await testObject.setEnablement([extension], EnablementState.WorkspaceDisabled);
		assert.ok(!testObject.isEnabled(extension));
		assert.equal(testObject.getEnablementState(extension), EnablementState.WorkspaceDisabled);
	});

	test('test disable an extension globally and then for workspace return a truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled))
			.then(value => assert.ok(value));
	});

	test('test disable an extension globally and then for workspace triggers the change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled))
			.then(() => {
				assert.ok(target.calledOnce);
				assert.deepEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.a' });
			});
	});

	test('test disable an extension for workspace when there is no workspace throws error', () => {
		instantiationService.stub(IWorkspaceContextService, 'getWorkbenchState', WorkbenchState.EMPTY);
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled)
			.then(() => assert.fail('should throw an error'), error => assert.ok(error));
	});

	test('test enable an extension globally', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.Disabled);
		await testObject.setEnablement([extension], EnablementState.Enabled);
		assert.ok(testObject.isEnabled(extension));
		assert.equal(testObject.getEnablementState(extension), EnablementState.Enabled);
	});

	test('test enable an extension globally return truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Enabled))
			.then(value => assert.ok(value));
	});

	test('test enable an extension globally triggers change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Enabled))
			.then(() => {
				assert.ok(target.calledOnce);
				assert.deepEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.a' });
			});
	});

	test('test enable an extension globally when already enabled return falsy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Enabled)
			.then(value => assert.ok(!value[0]));
	});

	test('test enable an extension for workspace', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.WorkspaceDisabled);
		await testObject.setEnablement([extension], EnablementState.WorkspaceEnabled);
		assert.ok(testObject.isEnabled(extension));
		assert.equal(testObject.getEnablementState(extension), EnablementState.WorkspaceEnabled);
	});

	test('test enable an extension for workspace return truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceEnabled))
			.then(value => assert.ok(value));
	});

	test('test enable an extension for workspace triggers change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement([aLocalExtension('pub.b')], EnablementState.WorkspaceDisabled)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement([aLocalExtension('pub.b')], EnablementState.WorkspaceEnabled))
			.then(() => {
				assert.ok(target.calledOnce);
				assert.deepEqual((<IExtension>target.args[0][0][0]).identifier, { id: 'pub.b' });
			});
	});

	test('test enable an extension for workspace when already enabled return truthy promise', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceEnabled)
			.then(value => assert.ok(value));
	});

	test('test enable an extension for workspace when disabled in workspace and gloablly', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.WorkspaceDisabled);
		await testObject.setEnablement([extension], EnablementState.Disabled);
		await testObject.setEnablement([extension], EnablementState.WorkspaceEnabled);
		assert.ok(testObject.isEnabled(extension));
		assert.equal(testObject.getEnablementState(extension), EnablementState.WorkspaceEnabled);
	});

	test('test enable an extension globally when disabled in workspace and gloablly', async () => {
		const extension = aLocalExtension('pub.a');
		await testObject.setEnablement([extension], EnablementState.WorkspaceEnabled);
		await testObject.setEnablement([extension], EnablementState.WorkspaceDisabled);
		await testObject.setEnablement([extension], EnablementState.Disabled);
		await testObject.setEnablement([extension], EnablementState.Enabled);
		assert.ok(testObject.isEnabled(extension));
		assert.equal(testObject.getEnablementState(extension), EnablementState.Enabled);
	});

	test('test installing an extension re-eanbles it when disabled globally', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement([local], EnablementState.Disabled);
		didInstallEvent.fire({ local, identifier: local.identifier, operation: InstallOperation.Install });
		assert.ok(testObject.isEnabled(local));
		assert.equal(testObject.getEnablementState(local), EnablementState.Enabled);
	});

	test('test updating an extension does not re-eanbles it when disabled globally', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement([local], EnablementState.Disabled);
		didInstallEvent.fire({ local, identifier: local.identifier, operation: InstallOperation.Update });
		assert.ok(!testObject.isEnabled(local));
		assert.equal(testObject.getEnablementState(local), EnablementState.Disabled);
	});

	test('test installing an extension fires enablement change event when disabled globally', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement([local], EnablementState.Disabled);
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
		await testObject.setEnablement([local], EnablementState.Disabled);
		testObject.onEnablementChanged(target);
		didInstallEvent.fire({ local, identifier: local.identifier, operation: InstallOperation.Update });
		assert.ok(!target.called);
	});

	test('test installing an extension re-eanbles it when workspace disabled', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement([local], EnablementState.WorkspaceDisabled);
		didInstallEvent.fire({ local, identifier: local.identifier, operation: InstallOperation.Install });
		assert.ok(testObject.isEnabled(local));
		assert.equal(testObject.getEnablementState(local), EnablementState.Enabled);
	});

	test('test updating an extension does not re-eanbles it when workspace disabled', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement([local], EnablementState.WorkspaceDisabled);
		didInstallEvent.fire({ local, identifier: local.identifier, operation: InstallOperation.Update });
		assert.ok(!testObject.isEnabled(local));
		assert.equal(testObject.getEnablementState(local), EnablementState.WorkspaceDisabled);
	});

	test('test installing an extension fires enablement change event when workspace disabled', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement([local], EnablementState.WorkspaceDisabled);
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
		await testObject.setEnablement([local], EnablementState.WorkspaceDisabled);
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
		await testObject.setEnablement([extension], EnablementState.WorkspaceDisabled);
		await testObject.setEnablement([extension], EnablementState.Disabled);
		didUninstallEvent.fire({ identifier: { id: 'pub.a' } });
		assert.ok(testObject.isEnabled(extension));
		assert.equal(testObject.getEnablementState(extension), EnablementState.Enabled);
	});

	test('test isEnabled return false extension is disabled globally', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.Disabled)
			.then(() => assert.ok(!testObject.isEnabled(aLocalExtension('pub.a'))));
	});

	test('test isEnabled return false extension is disabled in workspace', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled)
			.then(() => assert.ok(!testObject.isEnabled(aLocalExtension('pub.a'))));
	});

	test('test isEnabled return true extension is not disabled', () => {
		return testObject.setEnablement([aLocalExtension('pub.a')], EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement([aLocalExtension('pub.c')], EnablementState.Disabled))
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
		assert.deepEqual(testObject.getEnablementState(extension), EnablementState.Disabled);
	});

});

function aLocalExtension(id: string, contributes?: IExtensionContributions, type?: ExtensionType): ILocalExtension {
	const [publisher, name] = id.split('.');
	type = isUndefinedOrNull(type) ? ExtensionType.User : type;
	return <ILocalExtension>Object.create({
		identifier: { id },
		galleryIdentifier: { id, uuid: undefined },
		manifest: {
			name,
			publisher,
			contributes
		},
		type
	});
}
