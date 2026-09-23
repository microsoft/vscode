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
import { getCustomizationsPresentation, SessionsView } from '../../browser/views/sessionsView.js';
import '../../browser/media/sessionsViewPane.css';

const registerEditorTabHeightClass = Reflect.get(Workbench.prototype, 'registerEditorTabHeightClass') as (this: {
	readonly mainContainer: HTMLElement;
	readonly editorGroupService: {
		readonly partOptions: { readonly tabHeight: 'default' | 'compact' };
		readonly onDidChangeEditorPartOptions: Event<void>;
	};
	_register<T extends IDisposable>(disposable: T): T;
}) => void;
const updateHeaderLayout = Reflect.get(SessionsView.prototype, 'updateHeaderLayout') as (this: {
	readonly headerRow: HTMLElement;
	readonly headerLabel: HTMLElement;
	readonly headerActions: HTMLElement;
	readonly layoutService: { readonly mainContainer: HTMLElement };
	readonly isFindWidgetOpen: boolean;
}) => void;

suite('Sessions - SessionsViewPane', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('selects control and treatment presentations only when AI UI is visible on desktop', () => {
		assert.deepStrictEqual({
			control: getCustomizationsPresentation(false, true, false, false),
			treatment: getCustomizationsPresentation(false, true, false, true),
			phone: getCustomizationsPresentation(true, true, false, true),
			aiDisabled: getCustomizationsPresentation(false, false, false, true),
			aiHidden: getCustomizationsPresentation(false, true, true, true),
		}, {
			control: 'control',
			treatment: 'treatment',
			phone: 'hidden',
			aiDisabled: 'hidden',
			aiHidden: 'hidden',
		});
	});

	test('preserves Customizations and Automations focus while switching presentations', () => {
		const updatePresentation = Reflect.get(SessionsView.prototype, 'updateCustomizationsPresentation') as
			(this: ReturnType<typeof createHost>, presentation: 'hidden' | 'control' | 'treatment') => void;

		function createHost(
			presentation: 'hidden' | 'control' | 'treatment',
			focused: 'customizations' | 'automations',
		) {
			const calls: string[] = [];
			const widget = {
				hasFocus: () => presentation === 'control' && focused === 'customizations',
				focus: () => calls.push('focusControlCustomizations'),
			};
			const sessionsControl = {
				isCustomizationsFocused: () => presentation === 'treatment' && focused === 'customizations',
				isAutomationsFocused: () => focused === 'automations',
				updateNavigationVisibility: () => calls.push('updateTreeNavigation'),
				focusCustomizations: () => calls.push('focusTreatmentCustomizations'),
				focusAutomations: () => calls.push('focusControlAutomations'),
				focus: () => calls.push('focusSessions'),
			};
			const host = {
				customizationsPresentation: presentation,
				_customizationsWidget: presentation === 'control' ? widget : undefined,
				sessionsControl,
				removeCustomizationsPane: () => {
					calls.push('removePane');
					host._customizationsWidget = undefined;
				},
				updateCustomizationsPane: () => {
					calls.push('createPane');
					host._customizationsWidget = widget;
				},
				layoutSidebarSplitView: () => calls.push('layout'),
				calls,
			};
			return host;
		}

		const controlCustomizations = createHost('control', 'customizations');
		updatePresentation.call(controlCustomizations, 'treatment');
		const treatmentAutomations = createHost('treatment', 'automations');
		updatePresentation.call(treatmentAutomations, 'control');
		const hiddenCustomizations = createHost('treatment', 'customizations');
		updatePresentation.call(hiddenCustomizations, 'hidden');

		assert.deepStrictEqual({
			controlCustomizations: controlCustomizations.calls,
			treatmentAutomations: treatmentAutomations.calls,
			hiddenCustomizations: hiddenCustomizations.calls,
		}, {
			controlCustomizations: [
				'updateTreeNavigation',
				'removePane',
				'focusTreatmentCustomizations',
				'layout',
			],
			treatmentAutomations: [
				'updateTreeNavigation',
				'removePane',
				'createPane',
				'focusControlAutomations',
				'layout',
			],
			hiddenCustomizations: [
				'updateTreeNavigation',
				'removePane',
				'focusSessions',
				'layout',
			],
		});
	});

	test('does not reserve customization space on phones and restores the pane on desktop', () => {
		const mainContainer = mainWindow.document.createElement('div');
		mainContainer.classList.add('phone-layout');
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
		let disposedWidgets = 0;
		let focusCalls = 0;
		instantiationService.stubInstance(AICustomizationShortcutsWidget, {
			collapsed: false,
			collapsedHeight: 30,
			desiredHeight: 200,
			onDidChangeHeight: Event.None,
			onDidToggleCollapsed: Event.None,
			layout: () => { },
			focus: () => focusCalls++,
			dispose: () => disposedWidgets++,
		});
		const host = {
			layoutService: { mainContainer },
			instantiationService,
			sidebarSplitViewContainer: container,
			sidebarSplitView: splitView,
			customizationsPaneDisposables,
			_customizationsWidget: undefined as AICustomizationShortcutsWidget | undefined,
			customizationsPresentation: 'control',
			currentBodyWidth: 300,
			currentBodyHeight: 600,
			didInitializePaneSizes: false,
			getCustomizationsPaneHeight: () => 200,
			layoutSidebarSplitView: (): void => layoutPane.call(host),
			removeCustomizationsPane: (): void => {
				if (!host._customizationsWidget) {
					return;
				}
				splitView.removeView(1, Sizing.Distribute);
				host._customizationsWidget = undefined;
				customizationsPaneDisposables.clear();
				host.didInitializePaneSizes = false;
			},
		};
		const updatePane = Reflect.get(SessionsView.prototype, 'updateCustomizationsPane') as (this: typeof host) => void;
		const layoutPane = Reflect.get(SessionsView.prototype, 'layoutSidebarSplitView') as (this: typeof host) => void;
		const focusCustomizations = SessionsView.prototype.focusCustomizations as (this: typeof host) => void;
		const snapshot = () => ({
			panes: splitView.length,
			sessionsHeight: splitView.getViewSize(0),
			customizations: container.querySelectorAll('.agent-sessions-customizations-section').length,
			hasWidget: !!host._customizationsWidget,
			disposedWidgets,
			focusCalls,
		});

		updatePane.call(host);
		host.layoutSidebarSplitView();
		focusCustomizations.call(host);
		const phone = snapshot();
		mainContainer.classList.remove('phone-layout');
		updatePane.call(host);
		updatePane.call(host);
		host.layoutSidebarSplitView();
		focusCustomizations.call(host);
		const desktop = snapshot();
		mainContainer.classList.add('phone-layout');
		focusCustomizations.call(host);
		updatePane.call(host);
		host.layoutSidebarSplitView();
		const phoneAgain = snapshot();
		mainContainer.classList.remove('phone-layout');
		updatePane.call(host);
		host.layoutSidebarSplitView();
		focusCustomizations.call(host);

		assert.deepStrictEqual({ phone, desktop, phoneAgain, desktopAgain: snapshot() }, {
			phone: { panes: 1, sessionsHeight: 600, customizations: 0, hasWidget: false, disposedWidgets: 0, focusCalls: 0 },
			desktop: { panes: 2, sessionsHeight: 400, customizations: 1, hasWidget: true, disposedWidgets: 0, focusCalls: 1 },
			phoneAgain: { panes: 1, sessionsHeight: 600, customizations: 0, hasWidget: false, disposedWidgets: 1, focusCalls: 1 },
			desktopAgain: { panes: 2, sessionsHeight: 400, customizations: 1, hasWidget: true, disposedWidgets: 1, focusCalls: 2 },
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
				flexShrink: mainWindow.getComputedStyle(headerRow).flexShrink,
				hasCompactClass: workbench.classList.contains('editor-tabs-compact-height'),
			}, {
				defaultHeight: '32px',
				compactHeight: '28px',
				restoredHeight: '32px',
				flexShrink: '0',
				hasCompactClass: false,
			});
		} finally {
			workbench.remove();
		}
	});

	test('keeps the Sessions title visible during a zero-width sticky header handoff', () => {
		const mainContainer = mainWindow.document.createElement('div');
		const headerRow = mainWindow.document.createElement('div');
		const headerLabel = mainWindow.document.createElement('div');
		const headerActions = mainWindow.document.createElement('div');
		headerLabel.style.display = 'none';
		headerRow.append(headerLabel, headerActions);
		Object.defineProperty(headerRow, 'clientWidth', { configurable: true, value: 0 });
		Object.defineProperty(headerLabel, 'clientWidth', { configurable: true, value: 0 });
		const host = {
			headerRow,
			headerLabel,
			headerActions,
			layoutService: { mainContainer },
			isFindWidgetOpen: false,
		};

		updateHeaderLayout.call(host);
		const transientDisplay = headerLabel.style.display;
		Object.defineProperty(headerRow, 'clientWidth', { configurable: true, value: 200 });
		updateHeaderLayout.call(host);

		assert.deepStrictEqual({
			transientDisplay,
			narrowDisplay: headerLabel.style.display,
		}, {
			transientDisplay: '',
			narrowDisplay: 'none',
		});
	});
});
