/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IMenu, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IContextViewDelegate, IContextViewService, IOpenContextView } from '../../../../../platform/contextview/browser/contextView.js';
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

	test('disposes the toolbar menu when the context view hides', () => {
		let disposeCount = 0;
		let delegate: IContextViewDelegate | undefined;
		const contextViewService = new class extends mock<IContextViewService>() {
			override showContextView(contextViewDelegate: IContextViewDelegate): IOpenContextView {
				delegate = contextViewDelegate;
				return { close: () => this.hideContextView() };
			}

			override hideContextView(): void {
				delegate?.onHide?.();
				delegate = undefined;
			}
		};
		const instantiationService = workbenchInstantiationService({}, disposables);
		instantiationService.stub(IContextViewService, contextViewService);
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
		const provider = disposables.add(new AccessibleContentProvider(
			AccessibleViewProviderId.Editor,
			{ type: AccessibleViewType.View },
			() => 'content',
			() => { },
			'test.verbosity'
		));

		const updateToolbar = (accessibleView as unknown as { _updateToolbar(): void })._updateToolbar.bind(accessibleView);
		updateToolbar();

		accessibleView.show(provider, undefined, true);
		assert.strictEqual(disposeCount, 0);

		contextViewService.hideContextView();
		assert.strictEqual(disposeCount, 1);

		accessibleView.dispose();
		assert.strictEqual(disposeCount, 1);
	});
});
