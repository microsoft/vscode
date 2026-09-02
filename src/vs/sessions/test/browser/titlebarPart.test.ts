/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../base/common/async.js';
import { mainWindow } from '../../../base/browser/window.js';
import { ModifierKeyEmitter } from '../../../base/browser/dom.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService } from '../../../platform/actions/common/actions.js';
import { MenuService } from '../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../platform/telemetry/common/telemetryUtils.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../platform/theme/test/common/testThemeService.js';
import { SideBarVisibleContext } from '../../../workbench/common/contextkeys.js';
import { IHostService } from '../../../workbench/services/host/browser/host.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { TestContextMenuService, TestHostService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { TestStorageService } from '../../../workbench/test/common/workbenchTestServices.js';
import { TitlebarPart } from '../../browser/parts/titlebarPart.js';
import '../../browser/layoutActions.js';

suite('Sessions - Titlebar Part', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const updateTitleBarToolBarOverflow = Reflect.get(TitlebarPart.prototype, 'updateTitleBarToolBarOverflow') as (this: TitlebarPart) => void;

	test('hides optional toolbar groups when a titlebar section overflows', () => {
		let centerClientWidth = 100;
		let rightClientWidth = 100;
		const root = createMeasuredElement(() => 100, () => 100);
		const left = createMeasuredElement(() => 20, () => 20);
		const toolBars = [20, 20, 20, 20, 20, 20].map(() => mainWindow.document.createElement('div'));
		toolBars[0].classList.add('titlebar-screen-reader-container');
		const center = createMeasuredElement(
			() => centerClientWidth,
			() => 40 + visibleWidth(toolBars[1], 20) + visibleWidth(toolBars[2], 20)
		);
		const right = createMeasuredElement(
			() => rightClientWidth,
			() => 40 + visibleWidth(toolBars[0], 20) + visibleWidth(toolBars[3], 20) + visibleWidth(toolBars[4], 20) + visibleWidth(toolBars[5], 20)
		);
		const titlebarPart = Object.create(TitlebarPart.prototype) as TitlebarPart;
		Reflect.set(titlebarPart, 'rootContainer', root);
		Reflect.set(titlebarPart, 'leftContent', left);
		Reflect.set(titlebarPart, 'centerContent', center);
		Reflect.set(titlebarPart, 'rightContent', right);
		Reflect.set(titlebarPart, 'overflowManagedToolBarElements', toolBars);

		updateTitleBarToolBarOverflow.call(titlebarPart);
		const prioritized = toolBars.map(element => element.classList.contains('overflowing'));

		centerClientWidth = 200;
		rightClientWidth = 200;
		updateTitleBarToolBarOverflow.call(titlebarPart);
		const expanded = toolBars.map(element => element.classList.contains('overflowing'));

		assert.deepStrictEqual({ prioritized, expanded }, {
			prioritized: [true, false, false, false, false, false],
			expanded: [false, false, false, false, false, false],
		});
	});

	test('left toolbar sidebar-toggle icon tracks layout visibility without the default menu debounce', async () => {
		// `MenuEntryActionViewItem` lazily creates a process-wide `ModifierKeyEmitter`
		// singleton on first use; dispose it so the leak tracker doesn't attribute it
		// to whichever test happens to render a menu-driven action item first.
		store.add(toDisposable(() => ModifierKeyEmitter.disposeInstance()));

		const configurationService = new TestConfigurationService();
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IContextMenuService, new TestContextMenuService());
		instantiationService.stub(IKeybindingService, new MockKeybindingService());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { }());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IActionViewItemService, new NullActionViewItemService());
		instantiationService.stub(IStorageService, store.add(new TestStorageService()));
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IHostService, new TestHostService());
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));

		// A minimal layout service standing in for the sidebar part: visibility
		// flips synchronously, exactly like the real `IWorkbenchLayoutService`.
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			private _sidebarHidden = false;
			private readonly _onDidChangePartVisibility = new Emitter<IPartVisibilityChangeEvent>();
			override readonly onDidChangePartVisibility = this._onDidChangePartVisibility.event;
			override registerPart(): IDisposable { return Disposable.None; }
			override isVisible(part: Parts): boolean {
				return part !== Parts.SIDEBAR_PART || !this._sidebarHidden;
			}
			override setPartHidden(hidden: boolean, part: Parts): void {
				if (part !== Parts.SIDEBAR_PART || this._sidebarHidden === hidden) {
					return;
				}
				this._sidebarHidden = hidden;
				this._onDidChangePartVisibility.fire({ partId: part, visible: !hidden });
			}
		}();
		instantiationService.stub(IWorkbenchLayoutService, layoutService);

		// Mirrors `workbench/browser/contextkeys.ts`: keeps `SideBarVisibleContext`
		// in sync with the layout service's own part-visibility events.
		const sideBarVisibleContext = SideBarVisibleContext.bindTo(contextKeyService);
		sideBarVisibleContext.set(layoutService.isVisible(Parts.SIDEBAR_PART));
		store.add(layoutService.onDidChangePartVisibility(() => {
			sideBarVisibleContext.set(layoutService.isVisible(Parts.SIDEBAR_PART));
		}));

		// Constructs the real `TitlebarPart` and renders its real content area, so
		// a regression in the production `eventDebounceDelay` option (not just in
		// the general toolbar/menu mechanism) fails this test.
		const titlebarPart = store.add(instantiationService.createInstance(TitlebarPart, 'test.titlebar', mainWindow));
		const container = mainWindow.document.createElement('div');
		titlebarPart.create(container);

		const getToggleIcon = () => container.querySelector<HTMLElement>('.left-toolbar-container .action-label');
		assert.ok(getToggleIcon()?.className.includes('agent-sidebar-toggle-open'), 'expected the open icon while the sidebar is visible');
		assert.strictEqual(getToggleIcon()?.getAttribute('aria-pressed'), 'true', 'expected the toggle to report pressed (checked) while the sidebar is visible');

		layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
		// A short, bounded wait: with the left toolbar's `eventDebounceDelay: 0`
		// the menu re-evaluates on the very next tick. Without it, `MenuImpl`'s
		// debounced change event falls back to `DebounceEmitter`'s 100ms internal
		// default (`MenuWorkbenchToolBar` always forwards the `eventDebounceDelay`
		// key even when `undefined`, which defeats `MenuService.createMenu`'s own
		// 50ms default), and this assertion would still observe the stale, open icon.
		await timeout(20);

		assert.ok(getToggleIcon()?.className.includes('agent-sidebar-toggle-closed'), 'expected the closed icon promptly after the sidebar hides');
		assert.ok(!getToggleIcon()?.className.includes('checked'), 'expected the checked class to clear promptly after the sidebar hides');
		assert.strictEqual(getToggleIcon()?.getAttribute('aria-pressed'), 'false', 'expected the accessible pressed state to clear promptly after the sidebar hides');
	});
});

function createMeasuredElement(clientWidth: () => number, scrollWidth: () => number): HTMLElement {
	const element = mainWindow.document.createElement('div');
	Object.defineProperties(element, {
		clientWidth: { get: clientWidth },
		scrollWidth: { get: scrollWidth },
	});
	return element;
}

function visibleWidth(element: HTMLElement, width: number): number {
	return element.classList.contains('overflowing') || element.classList.contains('has-no-actions') ? 0 : width;
}
