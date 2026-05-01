/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IContextViewDelegate, IContextViewService } from '../../../contextview/browser/contextView.js';
import { IHoverService } from '../../../hover/browser/hover.js';
import { NullHoverService } from '../../../hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { IOpenerService } from '../../../opener/common/opener.js';
import { NullOpenerService } from '../../../opener/test/common/nullOpenerService.js';
import { ActionListItemKind, IActionListItem } from '../../browser/actionList.js';
import { TabbedActionListWidget } from '../../browser/tabbedActionListWidget.js';

interface ITestItem {
	readonly id: string;
}

function action(id: string): IActionListItem<ITestItem> {
	return { kind: ActionListItemKind.Action, label: id, item: { id } };
}

/**
 * Minimal fake `IContextViewService` that captures the most recent delegate
 * and synchronously calls `render()` so we can drive the widget without a
 * real DOM-backed context view.
 */
class FakeContextViewService implements Partial<IContextViewService> {
	declare readonly _serviceBrand: undefined;

	private _container: HTMLElement | undefined;
	private _activeDelegate: IContextViewDelegate | undefined;
	private _activeRenderDisposables: { dispose(): void } | undefined;

	get isVisible(): boolean {
		return !!this._activeDelegate;
	}

	showContextView(delegate: IContextViewDelegate): { close: () => void } {
		// Tear down any previous render before showing a new one.
		this.hideContextView();
		this._activeDelegate = delegate;
		this._container = document.createElement('div');
		document.body.appendChild(this._container);
		const result = delegate.render(this._container);
		if (result && typeof (result as { dispose?: () => void }).dispose === 'function') {
			this._activeRenderDisposables = result as { dispose(): void };
		}
		return { close: () => this.hideContextView() };
	}

	hideContextView(): void {
		const delegate = this._activeDelegate;
		const renderDisposables = this._activeRenderDisposables;
		const container = this._container;
		this._activeDelegate = undefined;
		this._activeRenderDisposables = undefined;
		this._container = undefined;
		// Notify the delegate first so its `onHide` runs against the still-
		// mounted DOM, mirroring the real `ContextView` order. The widget
		// uses this to fire its consumer `onHide` callback.
		delegate?.onHide?.();
		renderDisposables?.dispose();
		container?.remove();
	}

	layout(): void { /* no-op */ }
	getContextViewElement(): HTMLElement {
		return this._container ?? document.body;
	}
}

function createWidget(disposables: DisposableStore): { widget: TabbedActionListWidget; contextView: FakeContextViewService } {
	const instantiationService = disposables.add(new TestInstantiationService());
	const contextView = new FakeContextViewService();
	instantiationService.stub(IContextViewService, contextView as IContextViewService);
	instantiationService.set(IKeybindingService, new MockKeybindingService());
	instantiationService.set(IHoverService, NullHoverService);
	instantiationService.set(IOpenerService, NullOpenerService);
	instantiationService.stub(ILayoutService, { getContainer: () => document.body, mainContainer: document.body, onDidChangeMainContainer: () => ({ dispose: () => { } }) } as unknown as ILayoutService);

	const widget = disposables.add(instantiationService.createInstance(TabbedActionListWidget));
	return { widget, contextView };
}

suite('TabbedActionListWidget', () => {

	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('construct + dispose without crashing', () => {
		const { widget } = createWidget(disposables);
		assert.strictEqual(widget.isVisible, false);
	});

	test('show() makes the popup visible and hide() dismisses it', () => {
		const { widget } = createWidget(disposables);
		const anchor = document.createElement('div');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });

		widget.show<ITestItem>({
			user: 'test',
			anchor,
			tabs: ['Local', 'Remote'],
			initialTab: 'Local',
			createActionList: () => ({ items: [action('a')] }),
			delegate: { onSelect: () => { }, onHide: () => { } },
		});
		assert.strictEqual(widget.isVisible, true);

		widget.hide();
		assert.strictEqual(widget.isVisible, false);
	});

	test('buildItems is called with the initial tab', () => {
		const { widget } = createWidget(disposables);
		const anchor = document.createElement('div');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });

		const calls: string[] = [];
		widget.show<ITestItem>({
			user: 'test',
			anchor,
			tabs: ['Local', 'Remote'],
			initialTab: 'Remote',
			createActionList: (tab) => {
				calls.push(tab);
				return { items: [action(tab)] };
			},
			delegate: { onSelect: () => { }, onHide: () => { } },
		});

		assert.deepStrictEqual(calls, ['Remote']);
	});

	test('hide() then show() resets visibility cleanly', () => {
		const { widget } = createWidget(disposables);
		const anchor = document.createElement('div');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });

		const showOnce = () => widget.show<ITestItem>({
			user: 'test',
			anchor,
			tabs: ['Local'],
			initialTab: 'Local',
			createActionList: () => ({ items: [action('a')] }),
			delegate: { onSelect: () => { }, onHide: () => { } },
		});

		showOnce();
		widget.hide();
		assert.strictEqual(widget.isVisible, false);
		showOnce();
		assert.strictEqual(widget.isVisible, true);
		widget.hide();
	});

	test('onDidHide fires when the popup dismisses', () => {
		const { widget, contextView } = createWidget(disposables);
		const anchor = document.createElement('div');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });

		let hidden = 0;
		disposables.add(widget.onDidHide(() => { hidden++; }));
		widget.show<ITestItem>({
			user: 'test',
			anchor,
			tabs: ['Local'],
			initialTab: 'Local',
			createActionList: () => ({ items: [action('a')] }),
			delegate: { onSelect: () => { }, onHide: () => { } },
		});

		// Simulate an external dismissal (e.g. user clicked outside).
		contextView.hideContextView();
		assert.strictEqual(hidden, 1, `expected onDidHide to fire once, got ${hidden}; widget visible: ${widget.isVisible}`);
		assert.strictEqual(widget.isVisible, false);
	});
});
