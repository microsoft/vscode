/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { SplitView, Sizing } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../workbench/common/views.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { Workbench } from '../../../../browser/workbench.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AICustomizationShortcutsWidget } from '../../browser/aiCustomizationShortcutsWidget.js';
import { SessionsList, SessionsSorting } from '../../browser/views/sessionsList.js';
import { SESSIONS_LIST_DEFAULT_SORT_ORDER_SETTING, SessionsView, SessionsViewId, SessionsViewSortingContext } from '../../browser/views/sessionsView.js';
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
			currentBodyWidth: 300,
			currentBodyHeight: 600,
			didInitializePaneSizes: false,
			getCustomizationsPaneHeight: () => 200,
			layoutSidebarSplitView: (): void => layoutPane.call(host),
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

	suite('sorting', () => {
		function createHarness(defaultSorting?: SessionsSorting, storedSorting?: string) {
			const configurationService = new TestConfigurationService({ [SESSIONS_LIST_DEFAULT_SORT_ORDER_SETTING]: defaultSorting });
			disposables.add(configurationService.onDidChangeConfigurationEmitter);
			const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, disposables);
			instantiationService.stub(IViewDescriptorService, upcastPartial<IViewDescriptorService>({
				onDidChangeLocation: Event.None,
				getViewLocationById: () => ViewContainerLocation.Sidebar,
			}));
			instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({}));
			instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({}));

			const storageService = instantiationService.get(IStorageService);
			if (storedSorting !== undefined) {
				storageService.store('sessionsViewPane.sorting', storedSorting, StorageScope.PROFILE, StorageTarget.USER);
			}
			const contextKeyService = instantiationService.get(IContextKeyService);
			const getSorting = () => contextKeyService.getContextKeyValue<SessionsSorting>(SessionsViewSortingContext.key);
			const updates: (SessionsSorting | undefined)[] = [];
			const createView = () => {
				const view = disposables.add(instantiationService.createInstance(SessionsView, { id: SessionsViewId, title: 'Sessions' }));
				view.sessionsControl = upcastPartial<SessionsList>({
					update: () => { updates.push(getSorting()); },
				});
				return view;
			};

			return {
				view: createView(),
				createView,
				getState: () => ({
					sorting: getSorting(),
					storedSorting: storageService.get('sessionsViewPane.sorting', StorageScope.PROFILE),
					updates: [...updates],
				}),
				async setDefaultSorting(sorting: SessionsSorting) {
					await configurationService.setUserConfiguration(SESSIONS_LIST_DEFAULT_SORT_ORDER_SETTING, sorting);
					configurationService.onDidChangeConfigurationEmitter.fire({
						source: ConfigurationTarget.DEFAULT,
						affectedKeys: new Set([SESSIONS_LIST_DEFAULT_SORT_ORDER_SETTING]),
						change: { keys: [SESSIONS_LIST_DEFAULT_SORT_ORDER_SETTING], overrides: [] },
						affectsConfiguration: section => section === SESSIONS_LIST_DEFAULT_SORT_ORDER_SETTING,
					});
				},
			};
		}

		for (const defaultSorting of [undefined, SessionsSorting.Created, SessionsSorting.Updated]) {
			test(`uses the ${defaultSorting ?? 'unset'} default without persisting it`, () => {
				const harness = createHarness(defaultSorting);

				assert.deepStrictEqual(harness.getState(), {
					sorting: defaultSorting ?? SessionsSorting.Created,
					storedSorting: undefined,
					updates: [],
				});
			});
		}

		for (const sorting of [SessionsSorting.Created, SessionsSorting.Updated]) {
			const defaultSorting = sorting === SessionsSorting.Created ? SessionsSorting.Updated : SessionsSorting.Created;

			test(`restores a saved ${sorting} sort order instead of the default`, () => {
				const harness = createHarness(defaultSorting, sorting);

				assert.deepStrictEqual(harness.getState(), {
					sorting,
					storedSorting: sorting,
					updates: [],
				});
			});

			test(`remembers a user's ${sorting} selection across default changes and view recreation`, async () => {
				const harness = createHarness(defaultSorting);
				harness.view.setSorting(sorting);
				const selectedState = harness.getState();

				await harness.setDefaultSorting(sorting);
				await harness.setDefaultSorting(defaultSorting);
				harness.view.dispose();
				harness.createView();

				const expectedState = { sorting, storedSorting: sorting, updates: [sorting] };
				assert.deepStrictEqual({
					selected: selectedState,
					restored: harness.getState(),
				}, {
					selected: expectedState,
					restored: expectedState,
				});
			});
		}

		test('uses the configured default when the stored sort order is invalid', () => {
			const harness = createHarness(SessionsSorting.Updated, 'invalid');

			assert.deepStrictEqual(harness.getState(), {
				sorting: SessionsSorting.Updated,
				storedSorting: 'invalid',
				updates: [],
			});
		});

		test('applies default changes without saving a user preference', async () => {
			const harness = createHarness(SessionsSorting.Created);
			await harness.setDefaultSorting(SessionsSorting.Updated);
			const updatedState = harness.getState();
			await harness.setDefaultSorting(SessionsSorting.Created);

			assert.deepStrictEqual({
				updated: updatedState,
				restored: harness.getState(),
			}, {
				updated: {
					sorting: SessionsSorting.Updated,
					storedSorting: undefined,
					updates: [SessionsSorting.Updated],
				},
				restored: {
					sorting: SessionsSorting.Created,
					storedSorting: undefined,
					updates: [SessionsSorting.Updated, SessionsSorting.Created],
				},
			});
		});

		test('remembers an explicit selection even when it matches the default', async () => {
			const harness = createHarness(SessionsSorting.Updated);
			harness.view.setSorting(SessionsSorting.Updated);
			await harness.setDefaultSorting(SessionsSorting.Created);

			assert.deepStrictEqual(harness.getState(), {
				sorting: SessionsSorting.Updated,
				storedSorting: SessionsSorting.Updated,
				updates: [],
			});
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
