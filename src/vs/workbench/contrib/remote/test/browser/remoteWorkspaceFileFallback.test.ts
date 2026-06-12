/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../../services/environment/browser/environmentService.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { RemoteWorkspaceFileFallbackNotifier } from '../../browser/remoteWorkspaceFileFallback.js';

suite('RemoteWorkspaceFileFallbackNotifier', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let notifySpy: sinon.SinonSpy;

	setup(() => {
		instantiationService = ds.add(new TestInstantiationService());
	});

	function createEnvironmentService(remoteAuthority: string | undefined, workspaceFileFallback: boolean | undefined): IBrowserWorkbenchEnvironmentService {
		return new class extends mock<IBrowserWorkbenchEnvironmentService>() {
			override readonly remoteAuthority = remoteAuthority;
			override readonly options = { workspaceFileFallback } as IBrowserWorkbenchEnvironmentService['options'];
		};
	}

	function createAndRegisterNotificationService(): TestNotificationService {
		const service = new TestNotificationService();
		notifySpy = sinon.spy(service, 'notify');
		instantiationService.stub(INotificationService, service);
		return service;
	}

	test('shows warning when remoteAuthority is set and workspaceFileFallback is true', () => {
		instantiationService.stub(IBrowserWorkbenchEnvironmentService, createEnvironmentService('test-remote', true));
		createAndRegisterNotificationService();

		const contribution = ds.add(instantiationService.createInstance(RemoteWorkspaceFileFallbackNotifier));
		assert.ok(contribution);
		assert.strictEqual(notifySpy.calledOnce, true, 'notify should be called once');
		assert.strictEqual(notifySpy.firstCall.args[0].severity, Severity.Warning, 'should be a warning');
	});

	test('does not show warning when workspaceFileFallback is false', () => {
		instantiationService.stub(IBrowserWorkbenchEnvironmentService, createEnvironmentService('test-remote', false));
		createAndRegisterNotificationService();

		const contribution = ds.add(instantiationService.createInstance(RemoteWorkspaceFileFallbackNotifier));
		assert.ok(contribution);
		assert.strictEqual(notifySpy.called, false, 'notify should not be called');
	});

	test('does not show warning when workspaceFileFallback is undefined', () => {
		instantiationService.stub(IBrowserWorkbenchEnvironmentService, createEnvironmentService('test-remote', undefined));
		createAndRegisterNotificationService();

		const contribution = ds.add(instantiationService.createInstance(RemoteWorkspaceFileFallbackNotifier));
		assert.ok(contribution);
		assert.strictEqual(notifySpy.called, false, 'notify should not be called');
	});

	test('does not show warning when remoteAuthority is not set', () => {
		instantiationService.stub(IBrowserWorkbenchEnvironmentService, createEnvironmentService(undefined, true));
		createAndRegisterNotificationService();

		const contribution = ds.add(instantiationService.createInstance(RemoteWorkspaceFileFallbackNotifier));
		assert.ok(contribution);
		assert.strictEqual(notifySpy.called, false, 'notify should not be called without remote authority');
	});

	test('does not show warning when both are unset', () => {
		instantiationService.stub(IBrowserWorkbenchEnvironmentService, createEnvironmentService(undefined, undefined));
		createAndRegisterNotificationService();

		const contribution = ds.add(instantiationService.createInstance(RemoteWorkspaceFileFallbackNotifier));
		assert.ok(contribution);
		assert.strictEqual(notifySpy.called, false, 'notify should not be called');
	});
});
