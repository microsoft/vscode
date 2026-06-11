/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ProgressService } from '../../browser/progressService.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IActivityService } from '../../../activity/common/activity.js';
import { IPaneCompositePartService } from '../../../panecomposite/browser/panecomposite.js';
import { IViewsService } from '../../../views/common/viewsService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStatusbarService } from '../../../statusbar/browser/statusbar.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IUserActivityService } from '../../../userActivity/common/userActivityService.js';
import { IHostService } from '../../../host/browser/host.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';

suite('ProgressService', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createProgressService(): ProgressService {
		const instantiationService = disposables.add(new TestInstantiationService());

		instantiationService.stub(IActivityService, {});
		instantiationService.stub(IPaneCompositePartService, {});
		instantiationService.stub(IViewDescriptorService, {
			getViewContainerById: () => null,
			getViewDescriptorById: () => null,
		});
		instantiationService.stub(IViewsService, {});
		instantiationService.stub(INotificationService, {});
		instantiationService.stub(IStatusbarService, {});
		instantiationService.stub(ILayoutService, {});
		instantiationService.stub(IKeybindingService, {});
		instantiationService.stub(IUserActivityService, {
			markActive: () => ({ dispose() { } } as IDisposable),
		});
		instantiationService.stub(IHostService, {});

		return disposables.add(instantiationService.createInstance(ProgressService));
	}

	test('withProgress - empty string location should not throw', async () => {
		const progressService = createProgressService();

		let taskExecuted = false;
		const result = await progressService.withProgress(
			{ location: '' as any },
			async () => {
				taskExecuted = true;
				return 42;
			}
		);

		assert.ok(taskExecuted, 'Task should have been executed');
		assert.strictEqual(result, 42, 'Task result should be returned');
	});

	test('withProgress - unknown string location should throw', async () => {
		const progressService = createProgressService();

		await assert.rejects(
			() => progressService.withProgress(
				{ location: 'some.unknown.view' },
				async () => 'result'
			),
			/Bad progress location/
		);
	});
});
