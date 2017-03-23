/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as sinon from 'sinon';
import * as assert from 'assert';
import { IExtensionManagementService, IExtensionEnablementService, DidUninstallExtensionEvent } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Emitter } from 'vs/base/common/event';
import { StorageService, InMemoryLocalStorage } from 'vs/platform/storage/common/storageService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService, WorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { TestWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';

function storageService(instantiationService: TestInstantiationService): IStorageService {
	let service = instantiationService.get(IStorageService);
	if (!service) {
		let workspaceContextService = instantiationService.get(IWorkspaceContextService);
		if (!workspaceContextService) {
			workspaceContextService = instantiationService.stub(IWorkspaceContextService, WorkspaceContextService);
			instantiationService.stub(IWorkspaceContextService, 'getWorkspace', TestWorkspace);
		}
		service = instantiationService.stub(IStorageService, instantiationService.createInstance(StorageService, new InMemoryLocalStorage(), new InMemoryLocalStorage()));
	}
	return service;
}

export class TestExtensionEnablementService extends ExtensionEnablementService {
	constructor(instantiationService: TestInstantiationService) {
		super(storageService(instantiationService), instantiationService.get(IWorkspaceContextService),
			instantiationService.get(IEnvironmentService) || instantiationService.stub(IEnvironmentService, <IEnvironmentService>{}),
			instantiationService.get(IExtensionManagementService) || instantiationService.stub(IExtensionManagementService, { onDidUninstallExtension: new Emitter() }));
	}

	public reset(): void {
		this.getGloballyDisabledExtensions().forEach(d => this.setEnablement(d, true));
		this.getWorkspaceDisabledExtensions().forEach(d => this.setEnablement(d, true, true));
	}
}

suite('ExtensionEnablementService Test', () => {

	let instantiationService: TestInstantiationService;
	let testObject: IExtensionEnablementService;

	const didUninstallEvent: Emitter<DidUninstallExtensionEvent> = new Emitter();

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IExtensionManagementService, { onDidUninstallExtension: didUninstallEvent.event, });
		testObject = new TestExtensionEnablementService(instantiationService);
	});

	teardown(() => {
		(<ExtensionEnablementService>testObject).dispose();
	});

	test('test when no extensions are disabled globally', () => {
		assert.deepEqual([], testObject.getGloballyDisabledExtensions());
	});

	test('test when no extensions are disabled for workspace', () => {
		assert.deepEqual([], testObject.getWorkspaceDisabledExtensions());
	});

	test('test when no extensions are disabled for workspace when there is no workspace', (done) => {
		testObject.setEnablement('pub.a', false, true)
			.then(() => {
				instantiationService.stub(IWorkspaceContextService, 'getWorkspace', null);
				assert.deepEqual([], testObject.getWorkspaceDisabledExtensions());
			})
			.then(done, done);
	});

	test('test disable an extension globally', (done) => {
		testObject.setEnablement('pub.a', false)
			.then(() => assert.deepEqual(['pub.a'], testObject.getGloballyDisabledExtensions()))
			.then(done, done);
	});

	test('test disable an extension globally should return truthy promise', (done) => {
		testObject.setEnablement('pub.a', false)
			.then(value => assert.ok(value))
			.then(done, done);
	});

	test('test disable an extension globally triggers the change event', (done) => {
		const target = sinon.spy();
		testObject.onEnablementChanged(target);
		testObject.setEnablement('pub.a', false)
			.then(() => assert.ok(target.calledWithExactly('pub.a')))
			.then(done, done);
	});

	test('test disable an extension globally again should return a falsy promise', (done) => {
		testObject.setEnablement('pub.a', false)
			.then(() => testObject.setEnablement('pub.a', false))
			.then(value => assert.ok(!value))
			.then(done, done);
	});

	test('test disable an extension for workspace', (done) => {
		testObject.setEnablement('pub.a', false, true)
			.then(() => assert.deepEqual(['pub.a'], testObject.getWorkspaceDisabledExtensions()))
			.then(done, done);
	});

	test('test disable an extension for workspace returns a truthy promise', (done) => {
		testObject.setEnablement('pub.a', false, true)
			.then(value => assert.ok(value))
			.then(done, done);
	});

	test('test disable an extension for workspace again should return a falsy promise', (done) => {
		testObject.setEnablement('pub.a', false, true)
			.then(() => testObject.setEnablement('pub.a', false, true))
			.then(value => assert.ok(!value))
			.then(done, done);
	});

	test('test disable an extension for workspace and then globally', (done) => {
		testObject.setEnablement('pub.a', false, true)
			.then(() => testObject.setEnablement('pub.a', false))
			.then(() => {
				assert.deepEqual(['pub.a'], testObject.getWorkspaceDisabledExtensions());
				assert.deepEqual(['pub.a'], testObject.getGloballyDisabledExtensions());
			})
			.then(done, done);
	});

	test('test disable an extension for workspace and then globally return a truthy promise', (done) => {
		testObject.setEnablement('pub.a', false, true)
			.then(() => testObject.setEnablement('pub.a', false))
			.then(value => assert.ok(value))
			.then(done, done);
	});

	test('test disable an extension for workspace and then globally triggers the change event', (done) => {
		const target = sinon.spy();
		testObject.setEnablement('pub.a', false, true)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement('pub.a', false))
			.then(() => assert.ok(target.calledWithExactly('pub.a')))
			.then(done, done);
	});

	test('test disable an extension globally and then for workspace', (done) => {
		testObject.setEnablement('pub.a', false)
			.then(() => testObject.setEnablement('pub.a', false, true))
			.then(() => {
				assert.deepEqual(['pub.a'], testObject.getWorkspaceDisabledExtensions());
				assert.deepEqual(['pub.a'], testObject.getGloballyDisabledExtensions());
			})
			.then(done, done);
	});

	test('test disable an extension globally and then for workspace return a truthy promise', (done) => {
		testObject.setEnablement('pub.a', false)
			.then(() => testObject.setEnablement('pub.a', false, true))
			.then(value => assert.ok(value))
			.then(done, done);
	});

	test('test disable an extension globally and then for workspace triggers the change event', (done) => {
		const target = sinon.spy();
		testObject.setEnablement('pub.a', false)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement('pub.a', false, true))
			.then(() => assert.ok(target.calledWithExactly('pub.a')))
			.then(done, done);
	});

	test('test disable an extension for workspace when there is no workspace throws error', (done) => {
		instantiationService.stub(IWorkspaceContextService, 'getWorkspace', null);
		testObject.setEnablement('pub.a', false, true)
			.then(() => assert.fail('should throw an error'), error => assert.ok(error))
			.then(done, done);
	});

	test('test enable an extension globally', (done) => {
		testObject.setEnablement('pub.a', false)
			.then(() => testObject.setEnablement('pub.a', true))
			.then(() => assert.deepEqual([], testObject.getGloballyDisabledExtensions()))
			.then(done, done);
	});

	test('test enable an extension globally return truthy promise', (done) => {
		testObject.setEnablement('pub.a', false)
			.then(() => testObject.setEnablement('pub.a', true))
			.then(value => assert.ok(value))
			.then(done, done);
	});

	test('test enable an extension globally triggers change event', (done) => {
		const target = sinon.spy();
		testObject.setEnablement('pub.a', false)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement('pub.a', true))
			.then(() => assert.ok(target.calledWithExactly('pub.a')))
			.then(done, done);
	});

	test('test enable an extension globally when already enabled return falsy promise', (done) => {
		testObject.setEnablement('pub.a', true)
			.then(value => assert.ok(!value))
			.then(done, done);
	});

	test('test enable an extension for workspace', (done) => {
		testObject.setEnablement('pub.a', false, true)
			.then(() => testObject.setEnablement('pub.a', true, true))
			.then(() => assert.deepEqual([], testObject.getWorkspaceDisabledExtensions()))
			.then(done, done);
	});

	test('test enable an extension for workspace return truthy promise', (done) => {
		testObject.setEnablement('pub.a', false, true)
			.then(() => testObject.setEnablement('pub.a', true, true))
			.then(value => assert.ok(value))
			.then(done, done);
	});

	test('test enable an extension for workspace triggers change event', (done) => {
		const target = sinon.spy();
		testObject.setEnablement('pub.b', false, true)
			.then(() => testObject.onEnablementChanged(target))
			.then(() => testObject.setEnablement('pub.b', true, true))
			.then(() => assert.ok(target.calledWithExactly('pub.b')))
			.then(done, done);
	});

	test('test enable an extension for workspace when already enabled return falsy promise', (done) => {
		testObject.setEnablement('pub.a', true, true)
			.then(value => assert.ok(!value))
			.then(done, done);
	});

	test('test enable an extension for workspace when disabled in workspace and gloablly', (done) => {
		testObject.setEnablement('pub.a', false, true)
			.then(() => testObject.setEnablement('pub.a', false))
			.then(() => testObject.setEnablement('pub.a', true, true))
			.then(() => {
				assert.deepEqual(['pub.a'], testObject.getGloballyDisabledExtensions());
				assert.deepEqual([], testObject.getWorkspaceDisabledExtensions());
			})
			.then(done, done);
	});

	test('test enable an extension globally when disabled in workspace and gloablly', (done) => {
		testObject.setEnablement('pub.a', false, true)
			.then(() => testObject.setEnablement('pub.a', false))
			.then(() => testObject.setEnablement('pub.a', true))
			.then(() => {
				assert.deepEqual(['pub.a'], testObject.getWorkspaceDisabledExtensions());
				assert.deepEqual([], testObject.getGloballyDisabledExtensions());
			})
			.then(done, done);
	});

	test('test remove an extension from disablement list when uninstalled', (done) => {
		testObject.setEnablement('pub.a', false, true)
			.then(() => testObject.setEnablement('pub.a', false))
			.then(() => didUninstallEvent.fire({ id: 'pub.a-1.0.0' }))
			.then(() => {
				assert.deepEqual([], testObject.getWorkspaceDisabledExtensions());
				assert.deepEqual([], testObject.getGloballyDisabledExtensions());
			})
			.then(done, done);
	});
});