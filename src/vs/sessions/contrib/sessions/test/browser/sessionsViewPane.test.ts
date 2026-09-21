/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { SplitView, Sizing } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Workbench } from '../../../../browser/workbench.js';
import { AICustomizationShortcutsWidget } from '../../browser/aiCustomizationShortcutsWidget.js';
import { SESSIONS_CUSTOMIZATIONS_IN_LIST_SETTING } from '../../browser/customizationsConstants.js';
import { SessionsView } from '../../browser/views/sessionsView.js';
import '../../browser/media/sessionsViewPane.css';

const registerEditorTabHeightClass = Reflect.get(Workbench.prototype, 'registerEditorTabHeightClass') as (this: {
	readonly mainContainer: HTMLElement;
	readonly editorGroupService: {
		readonly partOptions: { readonly tabHeight: 'default' | 'compact' };
		readonly onDidChangeEditorPartOptions: Event<void>;
	};
	_register<T extends IDisposable>(disposable: T): T;
}) => void;

suite('Sessions - SessionsViewPane', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('switches customization variants with sizing, gating, disposal, and focus preserved', () => {
		const mainContainer = mainWindow.document.createElement('div');
		const container = mainWindow.document.createElement('div');
		const instantiationService = disposables.add(new TestInstantiationService());
		const customizationsPaneDisposables = disposables.add(new MutableDisposable<DisposableStore>());
		const splitView = disposables.add(new SplitView(container));
		splitView.addView({
			element: mainWindow.document.createElement('div'),
			minimumSize: 120,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None,
			layout: () => { },
		}, Sizing.Distribute);
		splitView.layout(600);

		let customizationsInList = false;
		let chatEnabled = true;
		let widgetFocused = false;
		let listFocused = false;
		let disposedWidgets = 0;
		let widgetFocusCalls = 0;
		let listFocusCalls = 0;
		let sessionsFocusCalls = 0;
		let listUpdateCalls = 0;
		instantiationService.stubInstance(AICustomizationShortcutsWidget, {
			collapsed: false,
			collapsedHeight: 30,
			desiredHeight: 200,
			onDidChangeHeight: Event.None,
			onDidToggleCollapsed: Event.None,
			layout: () => { },
			focus: () => {
				widgetFocused = true;
				widgetFocusCalls++;
			},
			hasFocus: () => widgetFocused,
			dispose: () => {
				widgetFocused = false;
				disposedWidgets++;
			},
		});

		type TestHost = {
			layoutService: { mainContainer: HTMLElement };
			instantiationService: TestInstantiationService;
			sidebarSplitViewContainer: HTMLElement;
			sidebarSplitView: SplitView;
			customizationsPaneDisposables: MutableDisposable<DisposableStore>;
			customizationsWidget: AICustomizationShortcutsWidget | undefined;
			sessionsControl: {
				updateCustomizationsVisibility(): void;
				isCustomizationsFocused(): boolean;
				focusCustomizations(): void;
				focus(): void;
			};
			configurationService: { getValue<T>(key: string): T };
			contextKeyService: { getContextKeyValue<T>(key: string): T | undefined };
			chatEntitlementService: { sentiment: { hidden: boolean } };
			currentBodyWidth: number;
			currentBodyHeight: number;
			didInitializePaneSizes: boolean;
			areCustomizationsEnabled(): boolean;
			hasCustomizationsFocus(): boolean;
			updateCustomizationsPane(): void;
			layoutSidebarSplitView(): void;
			getCustomizationsPaneHeight(): number;
			focusCustomizations(): void;
		};

		const updatePane = Reflect.get(SessionsView.prototype, 'updateCustomizationsPane') as (this: TestHost) => void;
		const layoutPane = Reflect.get(SessionsView.prototype, 'layoutSidebarSplitView') as (this: TestHost) => void;
		const focusCustomizations = SessionsView.prototype.focusCustomizations as (this: TestHost) => void;
		const areCustomizationsEnabled = Reflect.get(SessionsView.prototype, 'areCustomizationsEnabled') as (this: TestHost) => boolean;
		const hasCustomizationsFocus = Reflect.get(SessionsView.prototype, 'hasCustomizationsFocus') as (this: TestHost) => boolean;
		const getCustomizationsPaneHeight = Reflect.get(SessionsView.prototype, 'getCustomizationsPaneHeight') as (this: TestHost) => number;
		const updateVariant = Reflect.get(SessionsView.prototype, 'updateCustomizationsVariant') as (this: TestHost, preserveFocus: boolean) => void;
		const host: TestHost = {
			layoutService: { mainContainer },
			instantiationService,
			sidebarSplitViewContainer: container,
			sidebarSplitView: splitView,
			customizationsPaneDisposables,
			customizationsWidget: undefined,
			sessionsControl: {
				updateCustomizationsVisibility: () => {
					listUpdateCalls++;
					if (!customizationsInList) {
						listFocused = false;
					}
				},
				isCustomizationsFocused: () => listFocused,
				focusCustomizations: () => {
					listFocused = true;
					listFocusCalls++;
				},
				focus: () => sessionsFocusCalls++,
			},
			configurationService: {
				getValue: <T>(key: string) => (key === SESSIONS_CUSTOMIZATIONS_IN_LIST_SETTING ? customizationsInList : undefined) as T,
			},
			contextKeyService: {
				getContextKeyValue: <T>() => chatEnabled as T,
			},
			chatEntitlementService: { sentiment: { hidden: false } },
			currentBodyWidth: 300,
			currentBodyHeight: 600,
			didInitializePaneSizes: false,
			areCustomizationsEnabled: () => areCustomizationsEnabled.call(host),
			hasCustomizationsFocus: () => hasCustomizationsFocus.call(host),
			updateCustomizationsPane: () => updatePane.call(host),
			layoutSidebarSplitView: () => layoutPane.call(host),
			getCustomizationsPaneHeight: () => getCustomizationsPaneHeight.call(host),
			focusCustomizations: () => focusCustomizations.call(host),
		};
		const snapshot = () => ({
			panes: splitView.length,
			sessionsHeight: splitView.getViewSize(0),
			hasWidget: !!host.customizationsWidget,
			disposedWidgets,
			widgetFocusCalls,
			listFocusCalls,
			sessionsFocusCalls,
			listUpdateCalls,
		});

		updateVariant.call(host, false);
		widgetFocused = true;
		customizationsInList = true;
		updateVariant.call(host, true);
		const treatment = snapshot();

		listFocused = true;
		customizationsInList = false;
		updateVariant.call(host, true);
		const restoredControl = snapshot();

		chatEnabled = false;
		updateVariant.call(host, true);
		const chatDisabled = snapshot();

		assert.deepStrictEqual({ treatment, restoredControl, chatDisabled }, {
			treatment: {
				panes: 1,
				sessionsHeight: 600,
				hasWidget: false,
				disposedWidgets: 1,
				widgetFocusCalls: 0,
				listFocusCalls: 1,
				sessionsFocusCalls: 0,
				listUpdateCalls: 2,
			},
			restoredControl: {
				panes: 2,
				sessionsHeight: 400,
				hasWidget: true,
				disposedWidgets: 1,
				widgetFocusCalls: 1,
				listFocusCalls: 1,
				sessionsFocusCalls: 0,
				listUpdateCalls: 3,
			},
			chatDisabled: {
				panes: 1,
				sessionsHeight: 600,
				hasWidget: false,
				disposedWidgets: 2,
				widgetFocusCalls: 1,
				listFocusCalls: 1,
				sessionsFocusCalls: 1,
				listUpdateCalls: 4,
			},
		});
	});

	test('matches the default and compact editor tab heights', () => {
		const editorPartOptionsChanged = disposables.add(new Emitter<void>());
		let tabHeight: 'default' | 'compact' = 'default';
		const workbench = mainWindow.document.createElement('div');
		workbench.className = 'agent-sessions-workbench';
		workbench.style.setProperty('--vscode-spacing-size280', '28px');
		workbench.style.setProperty('--vscode-spacing-size320', '32px');
		const viewPane = mainWindow.document.createElement('div');
		viewPane.className = 'agent-sessions-viewpane';
		const headerRow = mainWindow.document.createElement('div');
		headerRow.className = 'agent-sessions-header-row';
		viewPane.appendChild(headerRow);
		workbench.appendChild(viewPane);
		mainWindow.document.body.appendChild(workbench);

		const host = {
			mainContainer: workbench,
			editorGroupService: {
				get partOptions() { return { tabHeight }; },
				onDidChangeEditorPartOptions: editorPartOptionsChanged.event,
			},
			_register: <T extends IDisposable>(disposable: T) => disposables.add(disposable),
		};

		try {
			registerEditorTabHeightClass.call(host);
			const defaultHeight = mainWindow.getComputedStyle(headerRow).height;

			tabHeight = 'compact';
			editorPartOptionsChanged.fire();
			const compactHeight = mainWindow.getComputedStyle(headerRow).height;

			tabHeight = 'default';
			editorPartOptionsChanged.fire();
			const restoredHeight = mainWindow.getComputedStyle(headerRow).height;

			assert.deepStrictEqual({
				defaultHeight,
				compactHeight,
				restoredHeight,
				hasCompactClass: workbench.classList.contains('editor-tabs-compact-height'),
			}, {
				defaultHeight: '32px',
				compactHeight: '28px',
				restoredHeight: '32px',
				hasCompactClass: false,
			});
		} finally {
			workbench.remove();
		}
	});
});
