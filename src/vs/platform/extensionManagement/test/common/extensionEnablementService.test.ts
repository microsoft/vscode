/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as sinon from 'sinon';
import { IExtensionManagementService, IExtensionEnablementService, DidUninstallExtensionEvent, EnablementState, IExtensionContributions, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Emitter } from 'vs/base/common/event';
import { StorageService, InMemoryLocalStorage } from 'vs/platform/storage/common/storageService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { TPromise } from 'vs/base/common/winjs.base';

function storageService(instantiationService: TestInstantiationService): IStorageService {
	let service = instantiationService.get(IStorageService);
	if (!service) {
		let workspaceContextService = instantiationService.get(IWorkspaceContextService);
		if (!workspaceContextService) {
			workspaceContextService = instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{
				getWorkbenchState: () => WorkbenchState.FOLDER,
			});
		}
		service = instantiationService.stub(IStorageService, instantiationService.createInstance(StorageService, new InMemoryLocalStorage(), new InMemoryLocalStorage()));
	}
	return service;
}


export class TestExtensionEnablementService extends ExtensionEnablementService {
	constructor(instantiationService: TestInstantiationService) {
		super(storageService(instantiationService), instantiationService.get(IWorkspaceContextService),
			instantiationService.get(IEnvironmentService) || instantiationService.stub(IEnvironmentService, {} as IEnvironmentService),
			instantiationService.get(IExtensionManagementService) || instantiationService.stub(IExtensionManagementService, { onDidUninstallExtension: new Emitter() }));
	}

	public reset(): TPromise<void> {
		return this.getDisabledExtensions().then(extensions => extensions.forEach(d => this.setEnablement(aLocalExtension(d.id), EnablementState.Enabled)));
	}
}

suite('ExtensionEnablementService Test', () => {

	let instantiationService: TestInstantiationService;
	let testObject: IExtensionEnablementService;

	const didUninstallEvent: Emitter<DidUninstallExtensionEvent> = new Emitter<DidUninstallExtensionEvent>();

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IExtensionManagementService, { onDidUninstallExtension: didUninstallEvent.event });
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

	test('test disable an extension for workspace when there is no workspace throws error', (done) => {
		instantiationService.stub(IWorkspaceContextService, 'getWorkbenchState', WorkbenchState.EMPTY);
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.WorkspaceDisabled)
			.then(() => assert.fail('should throw an error'), error => assert.ok(error))
			.then(done, done);
	});

	test('test enable an extension globally', () => {
		return testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Enabled))
			.then(() => testObject.getDisabledExtensions())
			.then(extensions => assert.deepEqual([], extensions));
	});

	test('test enable an extension globally return truthy promise', (done) => {
		testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Enabled))
			.then(value => assert.ok(value))
			.then(done, done);
	});

	test('test enable an extension globally triggers change event', (done) => {
		const target = sinon.spy();
		testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Disabled)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Enabled))
			.then(() => assert.ok(target.calledWithExactly({ id: 'pub.a', uuid: void 0 })))
			.then(done, done);
	});

	test('test enable an extension globally when already enabled return falsy promise', (done) => {
		testObject.setEnablement(aLocalExtension('pub.a'), EnablementState.Enabled)
			.then(value => assert.ok(!value))
			.then(done, done);
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
});

function aLocalExtension(id: string, contributes?: IExtensionContributions): ILocalExtension {
	const [publisher, name] = id.split('.');
	return <ILocalExtension>Object.create({
		identifier: { id },
		manifest: {
			name,
			publisher,
			contributes
		}
	});
}
