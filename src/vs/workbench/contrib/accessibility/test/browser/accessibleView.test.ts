/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IMenu, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { AccessibleView } from '../../browser/accessibleView.js';

suite('AccessibleView', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('disposes toolbar menus when they are replaced and when the view is disposed', () => {
		let disposeCount = 0;
		const instantiationService = workbenchInstantiationService({}, disposables);
		instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
			override createMenu(): IMenu {
				return new class extends mock<IMenu>() {
					override readonly onDidChange = Event.None;
					override getActions() { return []; }
					override dispose() { disposeCount++; }
				};
			}
		});

		const accessibleView = disposables.add(instantiationService.createInstance(AccessibleView));
		const updateToolbar = (accessibleView as unknown as { _updateToolbar(): void })._updateToolbar.bind(accessibleView);

		updateToolbar();
		updateToolbar();
		assert.strictEqual(disposeCount, 1);

		accessibleView.dispose();
		assert.strictEqual(disposeCount, 2);
	});
});
