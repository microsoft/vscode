/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { AccesibleViewContentProvider, AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider } from '../../../../../platform/accessibility/browser/accessibleView.js';
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

	test('releases provider listeners when the context view hides', () => {
		let delegate: IContextViewDelegate | undefined;
		const contextViewService = new class extends mock<IContextViewService>() {
			override showContextView(contextViewDelegate: IContextViewDelegate): IOpenContextView {
				delegate?.onHide?.();
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

		let listenerCount = 0;
		const onDidChangeContent = disposables.add(new Emitter<void>());
		const countingEvent: Event<void> = listener => {
			listenerCount++;
			const listenerDisposable = onDidChangeContent.event(listener);
			return toDisposable(() => {
				listenerCount--;
				listenerDisposable.dispose();
			});
		};
		const provider = disposables.add(new AccessibleContentProvider(
			AccessibleViewProviderId.Editor,
			{ type: AccessibleViewType.View },
			() => 'content',
			() => { },
			'test.verbosity',
			undefined,
			undefined,
			undefined,
			undefined,
			countingEvent
		));

		const accessibleView = disposables.add(instantiationService.createInstance(AccessibleView));
		const counts: number[] = [];
		accessibleView.show(provider, undefined, true);
		counts.push(listenerCount);
		accessibleView.show(provider, undefined, true);
		counts.push(listenerCount);
		contextViewService.hideContextView();
		counts.push(listenerCount);

		assert.deepStrictEqual(counts, [1, 1, 0]);
	});

	test('forgets a directly implemented last provider when it requests to be cleared', () => {
		let showCount = 0;
		let delegate: IContextViewDelegate | undefined;
		const contextViewService = new class extends mock<IContextViewService>() {
			override showContextView(contextViewDelegate: IContextViewDelegate): IOpenContextView {
				showCount++;
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

		const onDidRequestClearLastProvider = disposables.add(new Emitter<AccessibleViewProviderId>());
		const provider: IAccessibleViewContentProvider = {
			id: AccessibleViewProviderId.Terminal,
			options: { type: AccessibleViewType.View, id: AccessibleViewProviderId.Terminal },
			verbositySettingKey: 'test.verbosity',
			provideContent: () => 'content',
			onClose: () => { },
			onDidRequestClearLastProvider: onDidRequestClearLastProvider.event,
			dispose: () => { },
		};

		const accessibleView = disposables.add(instantiationService.createInstance(AccessibleView));
		accessibleView.show(provider as AccesibleViewContentProvider, undefined, true);
		contextViewService.hideContextView();
		accessibleView.showLastProvider(AccessibleViewProviderId.Terminal);
		const showsBeforeClear = showCount;

		onDidRequestClearLastProvider.fire(AccessibleViewProviderId.Terminal);
		accessibleView.showLastProvider(AccessibleViewProviderId.Terminal);

		assert.deepStrictEqual({ showsBeforeClear, showsAfterClear: showCount }, { showsBeforeClear: 2, showsAfterClear: 2 });
	});
});
