/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { AccesibleViewContentProvider, AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IMenu, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IContextViewDelegate, IContextViewService, IOpenContextView } from '../../../../../platform/contextview/browser/contextView.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
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

	test('releases the listeners of every render when the view hides', async () => {
		const contextViewService = new RenderingContextViewService();
		const instantiationService = workbenchInstantiationService({}, disposables);
		instantiationService.stub(IContextViewService, contextViewService);
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());

		const onDidChangeContent = disposables.add(new Emitter<void>());
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
			onDidChangeContent.event
		));

		const accessibleView = disposables.add(instantiationService.createInstance(AccessibleView));
		const modelService = instantiationService.get(IModelService);
		disposables.add(toDisposable(() => modelService.getModels().forEach(model => model.dispose())));
		const onKeyDown = (accessibleView.editorWidget as unknown as { _onKeyDown: { _size: number } })._onKeyDown;
		const baseline = onKeyDown._size;
		accessibleView.show(provider, undefined, true);
		onDidChangeContent.fire();
		onDidChangeContent.fire();
		const addedWhileShown = onKeyDown._size - baseline;
		contextViewService.hideContextView();
		await timeout(0);

		assert.deepStrictEqual({ addedWhileShown, addedAfterHide: onKeyDown._size - baseline }, { addedWhileShown: 1, addedAfterHide: 0 });
	});

	test('a last provider restored from accessibility help still honors clear requests', async () => {
		const contextViewService = new RenderingContextViewService();
		const instantiationService = workbenchInstantiationService({}, disposables);
		instantiationService.stub(IContextViewService, contextViewService);
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());

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
		const modelService = instantiationService.get(IModelService);
		disposables.add(toDisposable(() => modelService.getModels().forEach(model => model.dispose())));
		accessibleView.show(provider as AccesibleViewContentProvider, undefined, true);
		// Accessibility help shows a copy of the current provider again once it closes
		const restoredProvider = disposables.add((accessibleView as unknown as { _updateLastProvider(): AccesibleViewContentProvider })._updateLastProvider());
		contextViewService.hideContextView();
		accessibleView.show(restoredProvider, undefined, true);
		await timeout(0);
		contextViewService.hideContextView();
		const showsBeforeClear = contextViewService.showCount;

		onDidRequestClearLastProvider.fire(AccessibleViewProviderId.Terminal);
		accessibleView.showLastProvider(AccessibleViewProviderId.Terminal);

		assert.deepStrictEqual({ showsBeforeClear, showsAfterClear: contextViewService.showCount }, { showsBeforeClear: 2, showsAfterClear: 2 });
	});
});

/**
 * Renders into a detached container and disposes the render result on hide, like the real context view.
 */
class RenderingContextViewService extends mock<IContextViewService>() {
	showCount = 0;
	private _delegate: IContextViewDelegate | undefined;
	private _rendered: IDisposable | undefined;

	override showContextView(delegate: IContextViewDelegate): IOpenContextView {
		this.hideContextView();
		this.showCount++;
		this._delegate = delegate;
		this._rendered = delegate.render(document.createElement('div')) ?? undefined;
		return { close: () => this.hideContextView() };
	}

	override hideContextView(): void {
		const delegate = this._delegate;
		const rendered = this._rendered;
		this._delegate = undefined;
		this._rendered = undefined;
		delegate?.onHide?.();
		rendered?.dispose();
	}
}
