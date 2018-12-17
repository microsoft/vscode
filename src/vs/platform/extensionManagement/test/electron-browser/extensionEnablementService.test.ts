/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as sinon from 'sinon';
import { IExtensionManagementService, IExtensionEnablementService, DidUninstallExtensionEvent, EnablementState, IExtensionContributions, ILocalExtension, LocalExtensionType, DidInstallExtensionEvent, InstallOperation } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Emitter } from 'vs/base/common/event';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { TestStorageService } from 'vs/workbench/test/workbenchTestServices';

function storageService(instantiationService: TestInstantiationService): IStorageService {
	let service = instantiationService.get(IStorageService);
	if (!service) {
		let workspaceContextService = instantiationService.get(IWorkspaceContextService);
		if (!workspaceContextService) {
			workspaceContextService = instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{
				getWorkbenchState: () => WorkbenchState.FOLDER,
			});
		}
		service = instantiationService.stub(IStorageService, new TestStorageService());
	}
	return service;
}

export class TestExtensionEnablementService extends ExtensionEnablementService {
	constructor(instantiationService: TestInstantiationService) {
		super(storageService(instantiationService), instantiationService.get(IWorkspaceContextService),
			instantiationService.get(IEnvironmentService) || instantiationService.stub(IEnvironmentService, {} as IEnvironmentService),
			instantiationService.get(IExtensionManagementService) || instantiationService.stub(IExtensionManagementService,
				{ onDidInstallExtension: new Emitter<DidInstallExtensionEvent>().event, onDidUninstallExtension: new Emitter<DidUninstallExtensionEvent>().event } as IExtensionManagementService));
	}

	public async reset(): Promise<void> {
		return this.getDisabledExtensions().then(extensions => extensions.forEach(d => this.setEnablement(aLocalExtension(d.id), EnablementState.Enabled)));
	}
}

suite('ExtensionEnablementService Test', () => {

	let instantiationService: TestInstantiationService;
	let testObject: IExtensionEnablementService;

	const didUninstallEvent: Emitter<DidUninstallExtensionEvent> = new Emitter<DidUninstallExtensionEvent>();
	const didInstallEvent: Emitter<DidInstallExtensionEvent> = new Emitter<DidInstallExtensionEvent>();

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IExtensionManagementService, { onDidUninstallExtension: didUninstallEvent.event, onDidInstallExtension: didInstallEvent.event, getInstalled: () => Promise.resolve([]) } as IExtensionManagementService);
		testObject = new TestExtensionEnablementService(instantiationService);
	});

	teardown(() => {
		(<ExtensionEnablementService>testObject).dispose();
	});

	test('test when no extensions are disabled', () => {
		return testObject.getDisabledExtensions().then(extensions => assert.deepEqual([], extensions));
	});

	test('test when no extensions are disabled for workspace when there is no workspace', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => {
				instantiationService.stub(IWorkspaceContextService, 'getWorkbenchState', WorkbenchState.EMPTY);
				return testObject.getDisabledExtensions().then(extensions => assert.deepEqual([], extensions));
			});
	});

	test('test disable an extension globally', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => testObject.getDisabledExtensions())
			.then(extensions => assert.deepEqual([{ id: 'pub.a' }], extensions));
	});

	test('test disable an extension globally should return truthy promise', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(value => assert.ok(value));
	});

	test('test disable an extension globally triggers the change event', () => {
		const target = sinon.spy();
		testObject.onEnablementChanged(target);
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => assert.ok(target.calledWithExactly({ id: 'pub.a', uuid: void 0 })));
	});

	test('test disable an extension globally again should return a falsy promise', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled))
			.then(value => assert.ok(!value));
	});

	test('test state of globally disabled extension', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.Disabled));
	});

	test('test state of globally enabled extension', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Enabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.Enabled));
	});

	test('test disable an extension for workspace', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.getDisabledExtensions())
			.then(extensions => assert.deepEqual([{ id: 'pub.a' }], extensions));
	});

	test('test disable an extension for workspace returns a truthy promise', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(value => assert.ok(value));
	});

	test('test disable an extension for workspace again should return a falsy promise', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled))
			.then(value => assert.ok(!value));
	});

	test('test state of workspace disabled extension', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.WorkspaceDisabled));
	});

	test('test state of workspace and globally disabled extension', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.WorkspaceDisabled));
	});

	test('test state of workspace enabled extension', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceEnabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.WorkspaceEnabled));
	});

	test('test state of globally disabled and workspace enabled extension', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled))
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceEnabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.WorkspaceEnabled));
	});

	test('test state of an extension when disabled for workspace from workspace enabled', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceEnabled))
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.WorkspaceDisabled));
	});

	test('test state of an extension when disabled globally from workspace enabled', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceEnabled))
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.Disabled));
	});

	test('test state of an extension when disabled globally from workspace disabled', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.Disabled));
	});

	test('test state of an extension when enabled globally from workspace enabled', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceEnabled))
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Enabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.Enabled));
	});

	test('test state of an extension when enabled globally from workspace disabled', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Enabled))
			.then(() => assert.equal(testObject.getEnablementState(aLocalExtension('pub.a')), EnablementState.Enabled));
	});

	test('test disable an extension for workspace and then globally', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled))
			.then(() => testObject.getDisabledExtensions())
			.then(extensions => assert.deepEqual([{ id: 'pub.a' }], extensions));
	});

	test('test disable an extension for workspace and then globally return a truthy promise', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled))
			.then(value => assert.ok(value));
	});

	test('test disable an extension for workspace and then globally trigger the change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled))
			.then(() => assert.ok(target.calledWithExactly({ id: 'pub.a', uuid: void 0 })));
	});

	test('test disable an extension globally and then for workspace', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled))
			.then(() => testObject.getDisabledExtensions())
			.then(extensions => assert.deepEqual([{ id: 'pub.a' }], extensions));
	});

	test('test disable an extension globally and then for workspace return a truthy promise', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled))
			.then(value => assert.ok(value));
	});

	test('test disable an extension globally and then for workspace triggers the change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled))
			.then(() => assert.ok(target.calledWithExactly({ id: 'pub.a', uuid: void 0 })));
	});

	test('test disable an extension for workspace when there is no workspace throws error', () => {
		instantiationService.stub(IWorkspaceContextService, 'getWorkbenchState', WorkbenchState.EMPTY);
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => assert.fail('should throw an error'), error => assert.ok(error));
	});

	test('test enable an extension globally', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Enabled))
			.then(() => testObject.getDisabledExtensions())
			.then(extensions => assert.deepEqual([], extensions));
	});

	test('test enable an extension globally return truthy promise', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Enabled))
			.then(value => assert.ok(value));
	});

	test('test enable an extension globally triggers change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Enabled))
			.then(() => assert.ok(target.calledWithExactly({ id: 'pub.a', uuid: void 0 })));
	});

	test('test enable an extension globally when already enabled return falsy promise', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Enabled)
			.then(value => assert.ok(!value));
	});

	test('test enable an extension for workspace', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceEnabled))
			.then(() => testObject.getDisabledExtensions())
			.then(extensions => assert.deepEqual([], extensions));
	});

	test('test enable an extension for workspace return truthy promise', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceEnabled))
			.then(value => assert.ok(value));
	});

	test('test enable an extension for workspace triggers change event', () => {
		const target = sinon.spy();
		return testObject.setEnablement(aLocalExtension('pub.b'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement(aLocalExtension('pub.b'), EnablementState.WorkspaceEnabled))
			.then(() => assert.ok(target.calledWithExactly({ id: 'pub.b', uuid: void 0 })));
	});

	test('test enable an extension for workspace when already enabled return truthy promise', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceEnabled)
			.then(value => assert.ok(value));
	});

	test('test enable an extension for workspace when disabled in workspace and gloablly', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled))
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceEnabled))
			.then(() => testObject.getDisabledExtensions())
			.then(extensions => assert.deepEqual([], extensions));
	});

	test('test enable an extension globally when disabled in workspace and gloablly', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled))
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Enabled))
			.then(() => testObject.getDisabledExtensions())
			.then(extensions => assert.deepEqual([], extensions));
	});

	test('test installing an extension re-eanbles it when disabled globally', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement(local, EnablementState.Disabled);
		didInstallEvent.fire({ local, identifier: local.galleryIdentifier, operation: InstallOperation.Install });
		const extensions = await testObject.getDisabledExtensions();
		assert.deepEqual([], extensions);
	});

	test('test updating an extension does not re-eanbles it when disabled globally', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement(local, EnablementState.Disabled);
		didInstallEvent.fire({ local, identifier: local.galleryIdentifier, operation: InstallOperation.Update });
		const extensions = await testObject.getDisabledExtensions();
		assert.deepEqual([{ id: 'pub.a' }], extensions);
	});

	test('test installing an extension fires enablement change event when disabled globally', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement(local, EnablementState.Disabled);
		return new Promise((c, e) => {
			testObject.onEnablementChanged(e => {
				if (e.id === local.galleryIdentifier.id) {
					c();
				}
			});
			didInstallEvent.fire({ local, identifier: local.galleryIdentifier, operation: InstallOperation.Install });
		});
	});

	test('test updating an extension does not fires enablement change event when disabled globally', async () => {
		const target = sinon.spy();
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement(local, EnablementState.Disabled);
		testObject.onEnablementChanged(target);
		didInstallEvent.fire({ local, identifier: local.galleryIdentifier, operation: InstallOperation.Update });
		assert.ok(!target.called);
	});

	test('test installing an extension re-eanbles it when workspace disabled', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement(local, EnablementState.WorkspaceDisabled);
		didInstallEvent.fire({ local, identifier: local.galleryIdentifier, operation: InstallOperation.Install });
		const extensions = await testObject.getDisabledExtensions();
		assert.deepEqual([], extensions);
	});

	test('test updating an extension does not re-eanbles it when workspace disabled', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement(local, EnablementState.WorkspaceDisabled);
		didInstallEvent.fire({ local, identifier: local.galleryIdentifier, operation: InstallOperation.Update });
		const extensions = await testObject.getDisabledExtensions();
		assert.deepEqual([{ id: 'pub.a' }], extensions);
	});

	test('test installing an extension fires enablement change event when workspace disabled', async () => {
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement(local, EnablementState.WorkspaceDisabled);
		return new Promise((c, e) => {
			testObject.onEnablementChanged(e => {
				if (e.id === local.galleryIdentifier.id) {
					c();
				}
			});
			didInstallEvent.fire({ local, identifier: local.galleryIdentifier, operation: InstallOperation.Install });
		});
	});

	test('test updating an extension does not fires enablement change event when workspace disabled', async () => {
		const target = sinon.spy();
		const local = aLocalExtension('pub.a');
		await testObject.setEnablement(local, EnablementState.WorkspaceDisabled);
		testObject.onEnablementChanged(target);
		didInstallEvent.fire({ local, identifier: local.galleryIdentifier, operation: InstallOperation.Update });
		assert.ok(!target.called);
	});

	test('test installing an extension should not fire enablement change event when extension is not disabled', async () => {
		const target = sinon.spy();
		const local = aLocalExtension('pub.a');
		testObject.onEnablementChanged(target);
		didInstallEvent.fire({ local, identifier: local.galleryIdentifier, operation: InstallOperation.Install });
		assert.ok(!target.called);
	});

	test('test remove an extension from disablement list when uninstalled', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled))
			.then(() => didUninstallEvent.fire({ identifier: { id: 'pub.a-1.0.0' } }))
			.then(() => testObject.getDisabledExtensions())
			.then(extensions => assert.deepEqual([], extensions));
	});

	test('test isEnabled return false extension is disabled globally', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => assert.ok(!testObject.isEnabled(aLocalExtension('pub.a'))));
	});

	test('test isEnabled return false extension is disabled in workspace', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => assert.ok(!testObject.isEnabled(aLocalExtension('pub.a'))));
	});

	test('test isEnabled return true extension is not disabled', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.c'), EnablementState.Disabled))
			.then(() => assert.ok(testObject.isEnabled(aLocalExtension('pub.b'))));
	});

	test('test canChangeEnablement return false for language packs', () => {
		assert.equal(testObject.canChangeEnablement(aLocalExtension('pub.a', { localizations: [{ languageId: 'gr', translations: [{ id: 'vscode', path: 'path' }] }] })), false);
	});

	test('test canChangeEnablement return false when extensions are disabled in environment', () => {
		instantiationService.stub(IEnvironmentService, { disableExtensions: true } as IEnvironmentService);
		testObject = new TestExtensionEnablementService(instantiationService);
		assert.equal(testObject.canChangeEnablement(aLocalExtension('pub.a')), false);
	});

	test('test canChangeEnablement return false when the extension is disabled in environment', () => {
		instantiationService.stub(IEnvironmentService, { disableExtensions: ['pub.a'] } as IEnvironmentService);
		testObject = new TestExtensionEnablementService(instantiationService);
		assert.equal(testObject.canChangeEnablement(aLocalExtension('pub.a')), false);
	});

	test('test canChangeEnablement return true for system extensions when extensions are disabled in environment', () => {
		instantiationService.stub(IEnvironmentService, { disableExtensions: true } as IEnvironmentService);
		testObject = new TestExtensionEnablementService(instantiationService);
		const extension = aLocalExtension('pub.a');
		extension.type = LocalExtensionType.System;
		assert.equal(testObject.canChangeEnablement(extension), true);
	});

	test('test canChangeEnablement return false for system extensions when extension is disabled in environment', () => {
		instantiationService.stub(IEnvironmentService, { disableExtensions: ['pub.a'] } as IEnvironmentService);
		testObject = new TestExtensionEnablementService(instantiationService);
		const extension = aLocalExtension('pub.a');
		extension.type = LocalExtensionType.System;
		assert.equal(testObject.canChangeEnablement(extension), true);
	});

	test('test getDisabledExtensions include extensions disabled in enviroment', () => {
		instantiationService.stub(IEnvironmentService, { disableExtensions: ['pub.a'] } as IEnvironmentService);
		instantiationService.stub(IExtensionManagementService, { onDidUninstallExtension: didUninstallEvent.event, onDidInstallExtension: didInstallEvent.event, getInstalled: () => Promise.resolve([aLocalExtension('pub.a'), aLocalExtension('pub.b')]) } as IExtensionManagementService);
		testObject = new TestExtensionEnablementService(instantiationService);
		return testObject.getDisabledExtensions()
			.then(actual => {
				assert.equal(actual.length, 1);
				assert.equal(actual[0].id, 'pub.a');
			});
	});

});

function aLocalExtension(id: string, contributes?: IExtensionContributions): ILocalExtension {
	const [publisher, name] = id.split('.');
	return <ILocalExtension>Object.create({
		identifier: { id },
		galleryIdentifier: { id, uuid: void 0 },
		manifest: {
			name,
			publisher,
			contributes
		},
		type: LocalExtensionType.User
	});
}
