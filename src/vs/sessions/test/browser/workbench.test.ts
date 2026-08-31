/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../base/common/observable.js';
import { SashState } from '../../../base/browser/ui/sash/sash.js';
import { mainWindow } from '../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { Part } from '../../../workbench/browser/part.js';
import { IPartVisibilityChangeEvent, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { DockedAuxiliaryBarController, IDockedAuxiliaryBarHost } from '../../browser/dockedAuxiliaryBarController.js';
import { ISidePaneToggleEvent, Workbench } from '../../browser/workbench.js';
import { DockedEditorSizeMemento, SinglePaneWorkbench } from '../../browser/singlePaneWorkbench.js';
import { SinglePaneMainEditorPart } from '../../browser/parts/singlePaneEditorPart.js';
import { EditorParts } from '../../browser/parts/editorParts.js';
import { DockedEditorInput } from '../../common/dockedEditorInput.js';
import { EditorInputCapabilities } from '../../../workbench/common/editor.js';
import { GroupDirection, GroupOrientation } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { SESSIONS_LIST_MINIMUM_WIDTH } from '../../browser/parts/sidebarPart.js';
import { Menus } from '../../browser/menus.js';
import { DEFAULT_NOTIFICATION_ROW_HEIGHT, onDidChangeNotificationRowHeight, setNotificationRowHeight } from '../../../workbench/browser/parts/notifications/notificationsViewer.js';

interface IViewSize { width: number; height: number }

/** Minimal docked editor input for testing the single-pane reveal policy. */
class TestDockedEditorInput extends DockedEditorInput {
	override get typeId(): string { return 'test.dockedEditor'; }
	override get resource(): undefined { return undefined; }
}

suite('Sessions - Workbench', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// Real Workbench methods invoked against a prototype-chained fake harness so
	// the protected layout hooks dispatch to the base (grid) or SinglePaneWorkbench
	// (docked) override, exactly as at runtime.
	const setEditorHidden = Reflect.get(Workbench.prototype, 'setEditorHidden') as (this: ITestWorkbench, hidden: boolean, explicit?: boolean) => void;
	const setAuxiliaryBarHidden = Reflect.get(Workbench.prototype, 'setAuxiliaryBarHidden') as (this: ITestWorkbench, hidden: boolean) => void;
	const setAuxiliaryBarHiddenForResize = Reflect.get(Workbench.prototype, 'setAuxiliaryBarHiddenForResize') as (this: ITestWorkbench, hidden: boolean) => void;
	const setSideBarHidden = Reflect.get(Workbench.prototype, 'setSideBarHidden') as (this: ITestWorkbench, hidden: boolean) => void;
	const handleDidCloseEditor = Reflect.get(Workbench.prototype, 'handleDidCloseEditor') as (this: ITestWorkbench) => void;
	const setEditorMaximized = Reflect.get(Workbench.prototype, 'setEditorMaximized') as (this: IMaximizeTestHarness, maximized: boolean) => void;
	const onEditorNodeResized = Reflect.get(SinglePaneWorkbench.prototype, '_onEditorNodeResized') as (this: ITestWorkbench, nodeWidth: number) => void;
	const onGridDidChange = Reflect.get(SinglePaneWorkbench.prototype, '_onGridDidChange') as (this: ITestWorkbench) => void;
	const onEditorPartGridVisibilityChange = Reflect.get(SinglePaneWorkbench.prototype, '_onEditorPartGridVisibilityChange') as (this: ITestWorkbench, visible: boolean) => void;
	const persistedEditorWidth = Reflect.get(SinglePaneWorkbench.prototype, '_persistedEditorWidth') as (this: ITestWorkbench, editorGridWidth: number | undefined) => number | undefined;
	const rememberAttachedEditorMaximizedState = Reflect.get(Workbench.prototype, 'rememberAttachedEditorMaximizedState') as (this: IWorkbenchTestHarness) => void;
	const restoreAttachedEditorMaximizedState = Reflect.get(Workbench.prototype, 'restoreAttachedEditorMaximizedState') as (this: IWorkbenchTestHarness) => void;
	const loadPartVisibility = Reflect.get(Workbench.prototype, '_loadPartVisibility') as (this: IWorkbenchTestHarness, storageService: { get(): string | undefined; remove(): void }) => { editor?: boolean; auxiliaryBar?: boolean; sidebar?: boolean };
	const savePartVisibility = Reflect.get(Workbench.prototype, '_savePartVisibility') as (this: IWorkbenchTestHarness) => void;
	const applyPersistedPartVisibility = Reflect.get(Workbench.prototype, '_applyPersistedPartVisibility') as (this: IWorkbenchTestHarness) => void;
	const revealEditorOnOpen = Reflect.get(Workbench.prototype, 'revealEditorOnOpen') as (this: IWillOpenTestHarness, e: { groupId: number; editor: unknown }) => void;
	const revealEditorOnOpenSinglePane = Reflect.get(SinglePaneWorkbench.prototype, 'revealEditorOnOpen') as (this: IWillOpenTestHarness, e: { groupId: number; editor: unknown }) => void;
	const createDesktopGridDescriptor = Reflect.get(Workbench.prototype, 'createDesktopGridDescriptor') as (this: IGridDescriptorTestHarness, width: number, height: number) => { root: { data: readonly unknown[] } };
	const savePartSizes = Reflect.get(Workbench.prototype, '_savePartSizes') as (this: ISavePartSizesTestHarness) => void;
	const isEditorPaneVisible = Workbench.prototype.isEditorPaneVisible as (this: ITestWorkbench) => boolean;
	const isSinglePaneEditorPaneVisible = SinglePaneWorkbench.prototype.isEditorPaneVisible as (this: ITestWorkbench) => boolean;
	const toggleSecondarySideBarSinglePane = SinglePaneWorkbench.prototype.toggleSecondarySideBar as (this: ITestWorkbench) => void;
	const isSecondarySideBarVisibleSinglePane = SinglePaneWorkbench.prototype.isSecondarySideBarVisible as (this: ITestWorkbench) => boolean;
	const toggleSidePane = SinglePaneWorkbench.prototype.toggleSidePane as (this: ITestWorkbench) => boolean;
	const hideSidePane = Workbench.prototype.hideSidePane as (this: ITestWorkbench) => void;
	const applyCustomViewGridVisibility = Reflect.get(Workbench.prototype, '_applyCustomViewGridVisibility') as (this: ITestWorkbench, descriptor: object | undefined) => void;
	const setSessionsHidden = Reflect.get(Workbench.prototype, 'setSessionsHidden') as (this: ITestWorkbench, hidden: boolean) => void;
	const setPanelHidden = Reflect.get(Workbench.prototype, 'setPanelHidden') as (this: ITestWorkbench, hidden: boolean) => void;
	const updateMobileCustomViewNavigation = Reflect.get(Workbench.prototype, '_updateMobileCustomViewNavigation') as (this: ITestWorkbench) => void;
	const isVisible = Workbench.prototype.isVisible as (this: ITestWorkbench, part: Parts) => boolean;
	const toggleSecondarySideBar = Workbench.prototype.toggleSecondarySideBar as (this: ITestWorkbench) => void;
	const restoreSessionsPartOnActivation = Reflect.get(Workbench.prototype, '_restoreSessionsPartOnActivation') as (this: ITestWorkbench) => void;
	const restoreEditorPartOnActivation = Reflect.get(Workbench.prototype, '_restoreEditorPartOnActivation') as (this: ITestWorkbench) => void;
	const layoutSinglePaneGrid = Reflect.get(SinglePaneWorkbench.prototype, '_layoutGrid') as (this: IContainerResizeTestHarness) => void;
	const preserveSessionsEditorRatio = Reflect.get(SinglePaneWorkbench.prototype, '_preserveSessionsEditorRatio') as (this: IProportionalResizeTestHarness, previousSessionsWidth: number, previousEditorWidth: number) => void;
	const registerNotificationRowHeight = Reflect.get(Workbench.prototype, 'registerNotificationRowHeight') as (this: {
		layoutPolicy: { isPhoneLayout: IObservable<boolean> };
		_register<T extends IDisposable>(disposable: T): T;
	}) => void;

	// --- Harness ------------------------------------------------------------

	interface ITestWorkbench {
		partVisibility: { sidebar: boolean; auxiliaryBar: boolean; editor: boolean; panel: boolean; sessions: boolean; customViewGrid: boolean };
		auxiliaryBarPartView: object;
		_savedPartSizes: { sidebar?: number; auxiliaryBar?: number; editor?: number; sessions?: number; panel?: number };
		_editorMaximized: boolean;
		_editorRevealedExplicitly: boolean;
		_editorPartAutoVisibilitySuppressionCount: number;
		_restoreAttachedEditorMaximizedOnShow: boolean;
		_restoreSidePaneEditorMaximizedOnShow: boolean;
		_hasAppliedInitialEditorSplit: boolean;
		_dockedAuxiliaryBarWidth: number;
		_restoreEqualSplitOnDetailsHide: boolean;
		_memento: DockedEditorSizeMemento;
		readonly resizes: IViewSize[];
		readonly distributions: object[];
		readonly visibilityChanges: boolean[];
		readonly events: IPartVisibilityChangeEvent[];
		readonly classToggles: { name: string; force: boolean }[];
		readonly counts: { save: number; layout: number };
		readonly sidePaneReveals: boolean[];
		readonly focusedParts: Parts[];
		readonly renderedCustomViews: (object | undefined)[];
		readonly gridVisibility: Map<object, boolean>;
		readonly mobileNavLayers: string[];
		readonly focusedSessions: number;
		readonly sidePaneToggleEvents: ('will' | { readonly did: ISidePaneToggleEvent })[];
		layoutPolicy: { viewportClass: { get(): string } };
		sessionsPartView: object;
		panelPartView: object;
		customViewGridPartView: object;
		editorPartView: object;
		workbenchGrid: {
			getViewSize(view: object): IViewSize;
			isViewVisible(view: object): boolean;
			resizeView(view: object, size: IViewSize): void;
		};
		setEditorHidden(hidden: boolean, explicit?: boolean): void;
		setAuxiliaryBarHidden(hidden: boolean): void;
		setEditorMaximized(maximized: boolean): void;
	}

	interface IGridDescriptorTestHarness extends ITestWorkbench {
		_savedPartSizes: { sidebar?: number; auxiliaryBar?: number; editor?: number; sessions?: number; panel?: number };
		layoutPolicy: {
			getPartSizes(width: number, height: number): { sideBarSize: number; auxiliaryBarSize: number; panelSize: number };
			viewportClass: { get(): string };
		};
		titleBarPartView: { minimumHeight: number };
	}

	interface IProportionalResizeTestHarness {
		partVisibility: { auxiliaryBar: boolean };
		sessionsPartView: { minimumWidth: number };
		editorPartView: { minimumWidth: number };
		workbenchGrid: {
			getViewSize(view: object): IViewSize;
			resizeView(view: object, size: IViewSize): void;
		};
		_runWithEditorResizeSyncSuspended(fn: () => void): void;
	}

	interface IContainerResizeTestHarness extends IProportionalResizeTestHarness {
		partVisibility: { sidebar: boolean; editor: boolean; auxiliaryBar: boolean };
		mobileTopBarElement: undefined;
		layoutPolicy: { viewportClass: { get(): string } };
		_mainContainerDimension: IViewSize;
		workbenchGrid: IProportionalResizeTestHarness['workbenchGrid'] & {
			isViewVisible(view: object): boolean;
			layout(width: number, height: number): void;
		};
	}

	interface ISavePartSizesTestHarness {
		editorPartView: object;
		sessionsPartView: object;
		sideBarPartView: object;
		auxiliaryBarPartView: object;
		panelPartView: object;
		partVisibility: { sidebar: boolean; auxiliaryBar: boolean; editor: boolean; panel: boolean; sessions: boolean };
		_savedPartSizes: { editor?: number };
		_dockedAuxiliaryBarWidth: number;
		_memento: DockedEditorSizeMemento;
		logService: undefined;
		workbenchGrid: {
			getViewSize(view: object): IViewSize;
			getViewCachedVisibleSize(view: object): number | undefined;
		};
		storageService: { store(key: string, value: string, ...rest: unknown[]): void };
	}

	interface IHostOptions {
		single?: boolean;
		partVisibility?: Partial<ITestWorkbench['partVisibility']>;
		sessionsWidth?: number;
		windowWidth?: number;
		editorWidth?: number;
		sideBarWidth?: number;
		panelHeight?: number;
		panelHeightOnEditorShow?: number;
		dockedWidth?: number;
		customViewEditorSize?: IViewSize;
		customViewAuxiliaryBarSize?: IViewSize;
		hasAppliedInitialEditorSplit?: boolean;
		/** Use the real `setEditorMaximized` instead of the no-op stub. */
		editorMaximize?: boolean;
		suppressionCount?: number;
		focusedPart?: Parts;
		editorGroupService?: { mainPart: { groups: readonly { isEmpty: boolean }[] } };
		viewDescriptorService?: {
			getDefaultViewContainer(...args: unknown[]): { id: string } | undefined;
			getViewContainerById?(id: string): { hideIfEmpty: boolean } | null;
			getViewContainerModel?(container: object): { activeViewDescriptors: readonly object[] };
		};
	}

	function createHost(options: IHostOptions = {}): ITestWorkbench {
		const editorPartView = { minimumWidth: 300 };
		const sessionsPartView = { minimumWidth: 300 };
		const sideBarPartView = {};
		const auxiliaryBarPartView = {};
		const panelPartView = {};
		const customViewGridPartView = {};
		const resizes: IViewSize[] = [];
		const distributions: object[] = [];
		const visibilityChanges: boolean[] = [];
		const events: IPartVisibilityChangeEvent[] = [];
		const classToggles: { name: string; force: boolean }[] = [];
		const counts = { save: 0, layout: 0 };
		const sidePaneReveals: boolean[] = [];
		const focusedParts: Parts[] = [];
		const renderedCustomViews: (object | undefined)[] = [];
		const gridVisibility = new Map<object, boolean>();
		const mobileNavLayers: string[] = [];
		let focusedSessions = 0;
		const sidePaneToggleEvents: ('will' | { did: ISidePaneToggleEvent })[] = [];
		const notifyPartVisibility = (view: object, visible: boolean) => notifyPartVisibilityOn(host as unknown as ITestWorkbench, view, visible);
		let editorNodeVisible = (options.partVisibility?.editor ?? false) || (options.partVisibility?.auxiliaryBar ?? true);
		let sideBarNodeVisible = options.partVisibility?.sidebar ?? true;
		const viewSizes = new Map<object, IViewSize>([
			[editorPartView, { width: options.editorWidth ?? 0, height: 800 }],
			[sessionsPartView, { width: options.sessionsWidth ?? 1000, height: 800 }],
			[sideBarPartView, { width: options.sideBarWidth ?? 280, height: 800 }],
			[auxiliaryBarPartView, { width: 300, height: 800 }],
			[panelPartView, { width: 1000, height: options.panelHeight ?? 300 }],
		]);

		const partVisibility = { sidebar: true, auxiliaryBar: true, editor: false, panel: false, sessions: true, customViewGrid: false, ...options.partVisibility };
		const host = {
			editorPartView,
			sessionsPartView,
			sideBarPartView,
			auxiliaryBarPartView,
			panelPartView,
			customViewGridPartView,
			_editorPartContainer: undefined,
			mainContainer: { classList: { toggle: (name: string, force: boolean) => { classToggles.push({ name, force }); } } },
			partVisibility,
			workbenchGrid: {
				width: options.windowWidth ?? 1000,
				layout: () => { },
				getViewSize: (view: object) => viewSizes.get(view) ?? { width: 0, height: 0 },
				isViewVisible: (view: object) => view === editorPartView ? editorNodeVisible : true,
				hasMaximizedView: () => false,
				exitMaximizedView: () => { },
				setViewVisible: (view: object, visible: boolean, sizing?: { type: string }) => {
					if (view === editorPartView) {
						editorNodeVisible = visible;
						if (visible && partVisibility.editor && options.panelHeightOnEditorShow !== undefined) {
							viewSizes.set(panelPartView, { width: 1000, height: options.panelHeightOnEditorShow });
						}
					} else if (view === sideBarPartView && sideBarNodeVisible !== visible) {
						const sideBarWidth = viewSizes.get(sideBarPartView)!.width;
						const sessionsSize = viewSizes.get(sessionsPartView)!;
						viewSizes.set(sessionsPartView, {
							width: sessionsSize.width + (visible ? -sideBarWidth : sideBarWidth),
							height: sessionsSize.height,
						});
						sideBarNodeVisible = visible;
					} else if (view === customViewGridPartView && visible) {
						if (options.customViewEditorSize) {
							viewSizes.set(editorPartView, options.customViewEditorSize);
						}
						if (options.customViewAuxiliaryBarSize) {
							viewSizes.set(auxiliaryBarPartView, options.customViewAuxiliaryBarSize);
						}
					}
					gridVisibility.set(view, visible);
					visibilityChanges.push(visible);
					if (visible && sizing?.type === 'distribute') {
						distributions.push(view);
					}
					notifyPartVisibility(view, visible);
				},
				resizeView: (view: object, size: IViewSize) => {
					resizes.push(size);
					viewSizes.set(view, size);
					if (view === editorPartView && partVisibility.editor && options.panelHeightOnEditorShow !== undefined) {
						viewSizes.set(panelPartView, { width: 1000, height: options.panelHeightOnEditorShow });
					}
				},
			},
			_mainContainerDimension: { width: options.windowWidth ?? 1000, height: 800 },
			layoutPolicy: { viewportClass: { get: () => 'desktop' } },
			_hasAppliedInitialEditorSplit: options.hasAppliedInitialEditorSplit ?? false,
			_savedPartSizes: {},
			_editorRevealedExplicitly: false,
			_editorMaximized: false,
			_editorPartAutoVisibilitySuppressionCount: options.suppressionCount ?? 0,
			_restoreAttachedEditorMaximizedOnShow: false,
			_restoreSidePaneEditorMaximizedOnShow: false,
			editorGroupService: options.editorGroupService,
			paneCompositeService: {
				getActivePaneComposite: () => undefined,
				hideActivePaneComposite: () => { },
				getLastActivePaneCompositeId: () => undefined,
				openPaneComposite: () => { },
			},
			viewDescriptorService: options.viewDescriptorService ?? { getDefaultViewContainer: () => undefined },
			// docked bookkeeping
			_dockedAuxiliaryBarWidth: options.dockedWidth ?? DockedAuxiliaryBarController.DEFAULT_WIDTH,
			_restoreEqualSplitOnDetailsHide: false,
			_syncingEditorVisibility: false,
			_memento: new DockedEditorSizeMemento(),
			// stubs for the heavy base helpers the hooks call
			_savePartVisibility: () => { counts.save++; },
			_fireDidChangePartVisibility: (partId: Parts, visible: boolean, source?: 'resize') => { events.push({ partId, visible, ...(source ? { source } : {}) }); },
			_onDidRevealSidePane: { fire: () => { sidePaneReveals.push(true); } },
			_onDidChangeEditorMaximized: { fire: () => { } },
			_onWillToggleSidePane: { fire: () => { sidePaneToggleEvents.push('will'); } },
			_onDidToggleSidePane: { fire: (event: ISidePaneToggleEvent) => { sidePaneToggleEvents.push({ did: event }); } },
			_notifyContainerDidLayout: () => { },
			_layoutDockedAuxBar: () => { counts.layout++; },
			layoutMobileSidebar: () => { },
			...(options.editorMaximize ? {} : { setEditorMaximized: () => { } }),
			hasFocus: (part: Parts) => options.focusedPart === part,
			focusPart: (part: Parts) => { focusedParts.push(part); },
			layout: () => { },
			mobileNavStack: {
				has: (layer: string) => mobileNavLayers.includes(layer),
				push: (layer: string) => { mobileNavLayers.push(layer); },
				popSilently: (layer: string) => { mobileNavLayers.splice(mobileNavLayers.indexOf(layer), 1); },
			},
			customViewGridPartService: { setView: (descriptor: object | undefined) => { renderedCustomViews.push(descriptor); }, focusActiveView: () => { } },
			_customViewVisibleKey: { set: () => { } },
			sessionsPartService: { focusSession: () => { focusedSessions++; } },
			sessionsService: { activeSession: { get: () => undefined } },
			// captures
			resizes,
			distributions,
			visibilityChanges,
			events,
			classToggles,
			counts,
			sidePaneReveals,
			focusedParts,
			renderedCustomViews,
			gridVisibility,
			mobileNavLayers,
			sidePaneToggleEvents,
			get focusedSessions() { return focusedSessions; },
		};

		Object.setPrototypeOf(host, options.single ? SinglePaneWorkbench.prototype : Workbench.prototype);
		return host as unknown as ITestWorkbench;
	}

	// The real SplitView calls `Part.setVisible` when a view's grid visibility
	// changes, which the workbench maps back onto the desired part visibility.
	// Reproduce that feedback so tests catch state being overwritten by it.
	function notifyPartVisibilityOn(host: ITestWorkbench, view: object, visible: boolean): void {
		if ((host as unknown as { _applyingCustomViewGridVisibility: boolean })._applyingCustomViewGridVisibility) {
			return;
		}
		if (view === host.sessionsPartView) {
			setSessionsHidden.call(host, !visible);
		} else if (view === host.panelPartView) {
			setPanelHidden.call(host, !visible);
		} else if (view === host.auxiliaryBarPartView) {
			host.setAuxiliaryBarHidden(!visible);
		}
	}

	// --- Notifications ------------------------------------------------------

	test('uses touch-sized notification rows on phone layouts', () => {
		setNotificationRowHeight(DEFAULT_NOTIFICATION_ROW_HEIGHT);
		const registeredDisposables = new DisposableStore();
		const isPhoneLayout = observableValue('isPhoneLayout', false);
		const rowHeights: number[] = [];
		const listener = onDidChangeNotificationRowHeight(height => rowHeights.push(height));

		try {
			registerNotificationRowHeight.call({
				layoutPolicy: { isPhoneLayout },
				_register: disposable => registeredDisposables.add(disposable),
			});

			isPhoneLayout.set(true, undefined);
			isPhoneLayout.set(false, undefined);
			registeredDisposables.dispose();

			assert.deepStrictEqual(rowHeights, [34, 44, 34, 42]);
		} finally {
			listener.dispose();
			registeredDisposables.dispose();
			setNotificationRowHeight(DEFAULT_NOTIFICATION_ROW_HEIGHT);
		}
	});

	test('centers notification content in touch-sized phone rows', () => {
		const root = document.createElement('div');
		root.className = 'agent-sessions-workbench phone-layout';
		const list = document.createElement('div');
		list.className = 'notifications-list-container';
		const item = document.createElement('div');
		item.className = 'notification-list-item';
		const mainRow = document.createElement('div');
		mainRow.className = 'notification-list-item-main-row';
		item.appendChild(mainRow);
		list.appendChild(item);
		root.appendChild(list);
		document.body.appendChild(root);

		try {
			assert.strictEqual(mainWindow.getComputedStyle(mainRow).alignItems, 'center');
		} finally {
			root.remove();
		}
	});

	// --- Editor split / reveal ---------------------------------------------

	test('activating a minimized Sessions or Editor Part resizes its sibling to minimum width', () => {
		const sessionsMinimized = createHost({ sessionsWidth: 300, editorWidth: 700, partVisibility: { editor: true } });
		const editorMinimized = createHost({ sessionsWidth: 700, editorWidth: 300, partVisibility: { editor: true } });
		const singlePaneSessionsMinimized = createHost({ single: true, sessionsWidth: 300, editorWidth: 800, dockedWidth: 250, partVisibility: { editor: true, auxiliaryBar: true } });
		const singlePaneEditorMinimized = createHost({ single: true, sessionsWidth: 700, editorWidth: 550, dockedWidth: 250, partVisibility: { editor: true, auxiliaryBar: true } });
		const neitherMinimized = createHost({ sessionsWidth: 301, editorWidth: 301, partVisibility: { editor: true } });
		const editorHidden = createHost({ sessionsWidth: 300, editorWidth: 700, partVisibility: { editor: false } });

		restoreSessionsPartOnActivation.call(sessionsMinimized);
		restoreEditorPartOnActivation.call(editorMinimized);
		restoreSessionsPartOnActivation.call(singlePaneSessionsMinimized);
		restoreEditorPartOnActivation.call(singlePaneEditorMinimized);
		restoreSessionsPartOnActivation.call(neitherMinimized);
		restoreEditorPartOnActivation.call(neitherMinimized);
		restoreSessionsPartOnActivation.call(editorHidden);

		assert.deepStrictEqual([
			sessionsMinimized.resizes,
			editorMinimized.resizes,
			singlePaneSessionsMinimized.resizes,
			singlePaneEditorMinimized.resizes,
			neitherMinimized.resizes,
			editorHidden.resizes,
		], [
			[{ width: 300, height: 800 }],
			[{ width: 300, height: 800 }],
			[{ width: 550, height: 800 }],
			[{ width: 300, height: 800 }],
			[],
			[],
		]);
	});

	test('tracks editor pane visibility across editor and auxiliary bar changes', () => {
		const host = createHost({ partVisibility: { editor: false, auxiliaryBar: true } });

		setAuxiliaryBarHidden.call(host, true);
		const hidden = isEditorPaneVisible.call(host);
		setEditorHidden.call(host, false);
		const editorVisible = isEditorPaneVisible.call(host);
		setEditorHidden.call(host, true);
		const closed = isEditorPaneVisible.call(host);

		assert.deepStrictEqual({
			hidden,
			editorVisible,
			closed,
			noEditorPaneClasses: host.classToggles.filter(toggle => toggle.name === 'noeditorpane'),
		}, {
			hidden: false,
			editorVisible: true,
			closed: false,
			noEditorPaneClasses: [
				{ name: 'noeditorpane', force: true },
				{ name: 'noeditorpane', force: false },
				{ name: 'noeditorpane', force: true },
			],
		});
	});

	test('reads the single-pane editor grid node visibility', () => {
		const host = createHost({ single: true, partVisibility: { editor: false, auxiliaryBar: true } }) as ITestWorkbench & {
			workbenchGrid: { isViewVisible(view: object): boolean };
		};
		host.workbenchGrid.isViewVisible = () => false;

		assert.strictEqual(isSinglePaneEditorPaneVisible.call(host), false);
	});

	test('single-pane secondary sidebar toggle controls the whole side pane', () => {
		const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: true }, focusedPart: Parts.EDITOR_PART });

		toggleSecondarySideBarSinglePane.call(host);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
			secondarySideBarVisible: isSecondarySideBarVisibleSinglePane.call(host),
			focusedParts: host.focusedParts,
			toggleEvents: host.sidePaneToggleEvents,
		}, {
			editorVisible: false,
			auxiliaryBarVisible: false,
			secondarySideBarVisible: false,
			focusedParts: [Parts.SESSIONS_PART],
			toggleEvents: [
				'will',
				{ did: { before: { editor: true, auxiliaryBar: true }, after: { editor: false, auxiliaryBar: false } } },
			],
		});
	});

	test('side pane toggle restores the editor and auxiliary bar visibility from before hide', () => {
		const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: false } });

		toggleSidePane.call(host);
		toggleSidePane.call(host);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
			revealCount: host.sidePaneReveals.length,
		}, {
			editorVisible: true,
			auxiliaryBarVisible: false,
			revealCount: 1,
		});
	});

	test('single-pane side pane toggle closes the whole side pane and restores maximization when reopened', () => {
		const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: true } });
		const maximizedStates: boolean[] = [];
		host._editorMaximized = true;
		host.setEditorMaximized = maximized => {
			maximizedStates.push(maximized);
			host._editorMaximized = maximized;
		};

		const visibleAfterHide = toggleSidePane.call(host);
		const hiddenState = {
			visible: visibleAfterHide,
			editorVisible: host.partVisibility.editor,
			auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
			editorMaximized: host._editorMaximized,
		};
		const visibleAfterShow = toggleSidePane.call(host);

		assert.deepStrictEqual({
			hiddenState,
			visibleAfterShow,
			restoredEditorVisible: host.partVisibility.editor,
			restoredAuxiliaryBarVisible: host.partVisibility.auxiliaryBar,
			editorMaximized: host._editorMaximized,
			maximizedStates,
		}, {
			hiddenState: {
				visible: false,
				editorVisible: false,
				auxiliaryBarVisible: false,
				editorMaximized: false,
			},
			visibleAfterShow: true,
			restoredEditorVisible: true,
			restoredAuxiliaryBarVisible: true,
			editorMaximized: true,
			maximizedStates: [false, true],
		});
	});

	test('updates the single-pane editor pane class after the grid node visibility changes', () => {
		const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: false } });

		setEditorHidden.call(host, true);

		assert.deepStrictEqual(
			host.classToggles.filter(toggle => toggle.name === 'noeditorpane'),
			[{ name: 'noeditorpane', force: true }]
		);
	});

	test('applies an even editor split the first time the editor is revealed', () => {
		const host = createHost({ sessionsWidth: 1000, windowWidth: 1000 });

		setEditorHidden.call(host, false);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			appliedSplit: host._hasAppliedInitialEditorSplit,
			visibilityChanges: host.visibilityChanges,
			resizes: host.resizes,
		}, {
			editorVisible: true,
			appliedSplit: true,
			visibilityChanges: [true],
			resizes: [{ width: 500, height: 800 }],
		});
	});

	test('single-pane sidebar visibility leaves the editor width unchanged', () => {
		const host = createHost({ single: true, sideBarWidth: 280, editorWidth: 620, partVisibility: { sidebar: true, editor: true, auxiliaryBar: true } });

		setSideBarHidden.call(host, true);
		const widthsAfterHide = {
			sessions: host.workbenchGrid.getViewSize(host.sessionsPartView).width,
			editor: host.workbenchGrid.getViewSize(host.editorPartView).width,
		};
		setSideBarHidden.call(host, false);

		assert.deepStrictEqual({
			sidebarVisible: host.partVisibility.sidebar,
			visibilityChanges: host.visibilityChanges,
			widthsAfterHide,
			sessionsWidth: host.workbenchGrid.getViewSize(host.sessionsPartView).width,
			editorWidth: host.workbenchGrid.getViewSize(host.editorPartView).width,
			resizes: host.resizes,
			layoutCount: host.counts.layout,
		}, {
			sidebarVisible: true,
			visibilityChanges: [false, true],
			widthsAfterHide: { sessions: 1280, editor: 620 },
			sessionsWidth: 1000,
			editorWidth: 620,
			resizes: [],
			layoutCount: 0,
		});
	});

	test('standard layout sidebar hide does not grow the editor', () => {
		const host = createHost({ sideBarWidth: 280, editorWidth: 620, partVisibility: { sidebar: true, editor: true, auxiliaryBar: true } });

		setSideBarHidden.call(host, true);

		assert.deepStrictEqual({
			sidebarVisible: host.partVisibility.sidebar,
			visibilityChanges: host.visibilityChanges,
			resizes: host.resizes,
		}, {
			sidebarVisible: false,
			visibilityChanges: [false],
			resizes: [],
		});
	});

	test('single-pane sidebar visibility leaves a detail-only pane width unchanged', () => {
		const host = createHost({ single: true, sideBarWidth: 280, editorWidth: 620, dockedWidth: 300, partVisibility: { sidebar: true, editor: false, auxiliaryBar: true } });

		setSideBarHidden.call(host, true);
		setSideBarHidden.call(host, false);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			detailWidth: host._dockedAuxiliaryBarWidth,
			resizes: host.resizes,
			layoutCount: host.counts.layout,
		}, {
			editorVisible: false,
			detailWidth: 300,
			resizes: [],
			layoutCount: 0,
		});
	});

	test('single-pane descriptor uses the docked detail width for a detail-only first open', () => {
		const host = createHost({ single: true, dockedWidth: 300, partVisibility: { editor: false, auxiliaryBar: true } }) as IGridDescriptorTestHarness;
		host.layoutPolicy = {
			getPartSizes: () => ({ sideBarSize: 280, auxiliaryBarSize: 340, panelSize: 300 }),
			viewportClass: { get: () => 'desktop' },
		};
		host.titleBarPartView = { minimumHeight: 30 };

		const descriptor = createDesktopGridDescriptor.call(host, 1200, 800);
		const contentSection = descriptor.root.data[1] as { data: readonly unknown[] };
		const rightSection = contentSection.data[1] as { data: readonly unknown[] };
		const topRightSection = rightSection.data[0] as { data: readonly unknown[] };
		const editorNode = topRightSection.data[1] as { size: number; visible: boolean };

		assert.deepStrictEqual({ size: editorNode.size, visible: editorNode.visible }, { size: 300, visible: true });
	});

	test('single-pane container resize preserves the sessions/editor ratio', () => {
		const sessionsPartView = { minimumWidth: 300 };
		const editorPartView = { minimumWidth: 300 };
		const sizes = new Map<object, IViewSize>([
			[sessionsPartView, { width: 900, height: 700 }],
			[editorPartView, { width: 600, height: 700 }],
		]);
		const resizes: IViewSize[] = [];
		const host: IProportionalResizeTestHarness = {
			partVisibility: { auxiliaryBar: false },
			sessionsPartView,
			editorPartView,
			workbenchGrid: {
				getViewSize: view => sizes.get(view)!,
				resizeView: (view, size) => {
					const previousEditorWidth = sizes.get(view)!.width;
					resizes.push(size);
					sizes.set(view, size);
					sizes.set(sessionsPartView, {
						width: sizes.get(sessionsPartView)!.width - (size.width - previousEditorWidth),
						height: size.height,
					});
				},
			},
			_runWithEditorResizeSyncSuspended: fn => fn(),
		};
		Object.setPrototypeOf(host, SinglePaneWorkbench.prototype);

		preserveSessionsEditorRatio.call(host, 600, 600);

		assert.deepStrictEqual({
			sessions: sizes.get(sessionsPartView),
			editor: sizes.get(editorPartView),
			resizes,
		}, {
			sessions: { width: 750, height: 700 },
			editor: { width: 750, height: 700 },
			resizes: [{ width: 750, height: 700 }],
		});
	});

	test('single-pane detail-only container resize preserves the detail width', () => {
		const sessionsPartView = { minimumWidth: 300 };
		const editorPartView = { minimumWidth: 300 };
		const sizes = new Map<object, IViewSize>([
			[sessionsPartView, { width: 900, height: 700 }],
			[editorPartView, { width: 300, height: 700 }],
		]);
		const resizes: IViewSize[] = [];
		const host: IContainerResizeTestHarness = {
			partVisibility: { sidebar: true, editor: false, auxiliaryBar: true },
			mobileTopBarElement: undefined,
			layoutPolicy: { viewportClass: { get: () => 'desktop' } },
			_mainContainerDimension: { width: 1800, height: 800 },
			sessionsPartView,
			editorPartView,
			workbenchGrid: {
				getViewSize: view => sizes.get(view)!,
				isViewVisible: () => true,
				layout: () => sizes.set(sessionsPartView, { width: 1200, height: 700 }),
				resizeView: (_view, size) => resizes.push(size),
			},
			_runWithEditorResizeSyncSuspended: fn => fn(),
		};
		Object.setPrototypeOf(host, SinglePaneWorkbench.prototype);

		layoutSinglePaneGrid.call(host);

		assert.deepStrictEqual({
			sessions: sizes.get(sessionsPartView),
			detail: sizes.get(editorPartView),
			resizes,
		}, {
			sessions: { width: 1200, height: 700 },
			detail: { width: 300, height: 700 },
			resizes: [],
		});
	});

	test('single-pane descriptor retains a persisted detail-only width below the default', () => {
		const host = createHost({ single: true, dockedWidth: 220, partVisibility: { editor: false, auxiliaryBar: true } }) as IGridDescriptorTestHarness;
		host.layoutPolicy = {
			getPartSizes: () => ({ sideBarSize: 280, auxiliaryBarSize: 340, panelSize: 300 }),
			viewportClass: { get: () => 'desktop' },
		};
		host.titleBarPartView = { minimumHeight: 30 };

		const descriptor = createDesktopGridDescriptor.call(host, 1200, 800);
		const contentSection = descriptor.root.data[1] as { data: readonly unknown[] };
		const rightSection = contentSection.data[1] as { data: readonly unknown[] };
		const topRightSection = rightSection.data[0] as { data: readonly unknown[] };
		const editorNode = topRightSection.data[1] as { size: number; visible: boolean };

		assert.deepStrictEqual({ size: editorNode.size, visible: editorNode.visible }, { size: 220, visible: true });
	});

	test('single-pane descriptor restores an editor-only side pane at its saved width (no detail subtraction)', () => {
		// Round-trip guard for the compounding-shrink bug: an Editor-only session
		// (detail closed) persists its pure editor-content width, and the descriptor
		// must reconstruct the node at exactly that width (no detail added, none lost).
		const host = createHost({ single: true, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: false } }) as IGridDescriptorTestHarness;
		host._savedPartSizes = { editor: 900 };
		host.layoutPolicy = {
			getPartSizes: () => ({ sideBarSize: 280, auxiliaryBarSize: 340, panelSize: 300 }),
			viewportClass: { get: () => 'desktop' },
		};
		host.titleBarPartView = { minimumHeight: 30 };

		const descriptor = createDesktopGridDescriptor.call(host, 1600, 800);
		const contentSection = descriptor.root.data[1] as { data: readonly unknown[] };
		const rightSection = contentSection.data[1] as { data: readonly unknown[] };
		const topRightSection = rightSection.data[0] as { data: readonly unknown[] };
		const editorNode = topRightSection.data[1] as { size: number; visible: boolean };

		assert.deepStrictEqual({ size: editorNode.size, visible: editorNode.visible }, { size: 900, visible: true });
	});

	test('single-pane descriptor falls back to the default when the saved editor width is corrupt (0 / sub-minimum)', () => {
		// Regression for the reload-300 bug: a `0` (or sub-minimum) editor width could be
		// persisted when the high-priority sessions part squeezed the editor node. The
		// descriptor must treat it as missing and use the default, not build a 0-width
		// node that the grid then clamps to its 300px minimum.
		const build = (savedEditor: number | undefined) => {
			const host = createHost({ single: true, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: false } }) as IGridDescriptorTestHarness;
			host._savedPartSizes = savedEditor === undefined ? {} : { editor: savedEditor };
			host.layoutPolicy = {
				getPartSizes: () => ({ sideBarSize: 280, auxiliaryBarSize: 340, panelSize: 300 }),
				viewportClass: { get: () => 'desktop' },
			};
			host.titleBarPartView = { minimumHeight: 30 };
			const descriptor = createDesktopGridDescriptor.call(host, 1600, 800);
			const contentSection = descriptor.root.data[1] as { data: readonly unknown[] };
			const rightSection = contentSection.data[1] as { data: readonly unknown[] };
			const topRightSection = rightSection.data[0] as { data: readonly unknown[] };
			return (topRightSection.data[1] as { size: number }).size;
		};

		assert.deepStrictEqual({
			corruptZero: build(0),
			subMinimum: build(120),
			missing: build(undefined),
			validSaved: build(750),
		}, {
			corruptZero: 600,
			subMinimum: 600,
			missing: 600,
			validSaved: 750,
		});
	});

	test('_savePartSizes persists the editor width without reading the docked aux bar from the grid (single-pane)', () => {
		// Regression for the reload-losing-resize bug: in single-pane the docked
		// auxiliary bar is NOT a grid view (it lives inside the editor node), so its
		// width must come from the docked layout state, never the grid. The grid here
		// throws "View not found" for the aux view to prove `_savePartSizes` never
		// reads it — otherwise the save would abort and the editor width would be lost.
		const stored: Record<string, string> = {};
		const editorView = {}, sessionsView = {}, sideBarView = {}, auxView = {}, panelView = {};
		const viewSizes = new Map<object, IViewSize>([
			[editorView, { width: 1164, height: 700 }],
			[sessionsView, { width: 618, height: 700 }],
			[sideBarView, { width: 300, height: 700 }],
			[panelView, { width: 1000, height: 200 }],
		]);
		const host = {
			editorPartView: editorView,
			sessionsPartView: sessionsView,
			sideBarPartView: sideBarView,
			auxiliaryBarPartView: auxView,
			panelPartView: panelView,
			partVisibility: { sidebar: true, auxiliaryBar: true, editor: true, panel: false, sessions: true },
			_savedPartSizes: { editor: 500 },
			_dockedAuxiliaryBarWidth: 300,
			_memento: new DockedEditorSizeMemento(),
			logService: undefined,
			workbenchGrid: {
				getViewSize: (view: object) => {
					const size = viewSizes.get(view);
					if (!size) { throw new Error('View not found'); }
					return size;
				},
				getViewCachedVisibleSize: (view: object) => {
					if (view === auxView) { throw new Error('View not found'); }
					return viewSizes.get(view)?.width;
				},
			},
			storageService: { store: (key: string, value: string) => { stored[key] = value; } },
		};
		Object.setPrototypeOf(host, SinglePaneWorkbench.prototype);

		savePartSizes.call(host as unknown as ISavePartSizesTestHarness);

		const sizes = JSON.parse(stored['workbench.sessions.partSizes']);
		assert.deepStrictEqual({
			editor: sizes.editor,
			sessions: sizes.sessions,
			auxiliaryBar: sizes.auxiliaryBar,
		}, {
			editor: 864,
			sessions: 618,
			auxiliaryBar: 300,
		});
	});

	test('_savePartSizes preserves the last valid editor width after the detail-only node closes (single-pane)', () => {
		// The cached detail-only node width must not replace the last valid Editor-content width.
		const stored: Record<string, string> = {};
		const editorView = {}, sessionsView = {}, sideBarView = {}, auxView = {}, panelView = {};
		const viewSizes = new Map<object, IViewSize>([
			[editorView, { width: 300, height: 700 }],
			[sessionsView, { width: 1182, height: 700 }],
			[sideBarView, { width: 300, height: 700 }],
			[panelView, { width: 1000, height: 200 }],
		]);
		const host = {
			editorPartView: editorView,
			sessionsPartView: sessionsView,
			sideBarPartView: sideBarView,
			auxiliaryBarPartView: auxView,
			panelPartView: panelView,
			partVisibility: { sidebar: true, auxiliaryBar: false, editor: false, panel: false, sessions: true },
			_savedPartSizes: { editor: 520 },
			_dockedAuxiliaryBarWidth: 300,
			_memento: new DockedEditorSizeMemento(),
			logService: undefined,
			workbenchGrid: {
				getViewSize: (view: object) => {
					const size = viewSizes.get(view);
					if (!size) { throw new Error('View not found'); }
					return size;
				},
				getViewCachedVisibleSize: (view: object) => {
					if (view === auxView) { throw new Error('View not found'); }
					return viewSizes.get(view)?.width;
				},
			},
			storageService: { store: (key: string, value: string) => { stored[key] = value; } },
		};
		Object.setPrototypeOf(host, SinglePaneWorkbench.prototype);

		savePartSizes.call(host as unknown as ISavePartSizesTestHarness);

		const sizes = JSON.parse(stored['workbench.sessions.partSizes']);
		assert.strictEqual(sizes.editor, 520);
	});

	test('_savePartSizes uses the cached hidden Editor width in classic layout', () => {
		const stored: Record<string, string> = {};
		const editorView = {}, sessionsView = {}, sideBarView = {}, auxView = {}, panelView = {};
		const viewSizes = new Map<object, IViewSize>([
			[editorView, { width: 850, height: 700 }],
			[sessionsView, { width: 632, height: 700 }],
			[sideBarView, { width: 300, height: 700 }],
			[auxView, { width: 300, height: 700 }],
			[panelView, { width: 1000, height: 200 }],
		]);
		const host = {
			editorPartView: editorView,
			sessionsPartView: sessionsView,
			sideBarPartView: sideBarView,
			auxiliaryBarPartView: auxView,
			panelPartView: panelView,
			partVisibility: { sidebar: true, auxiliaryBar: false, editor: false, panel: false, sessions: true },
			_savedPartSizes: { editor: 520 },
			_dockedAuxiliaryBarWidth: 0,
			_memento: new DockedEditorSizeMemento(),
			logService: undefined,
			workbenchGrid: {
				getViewSize: (view: object) => viewSizes.get(view) ?? { width: 0, height: 0 },
				getViewCachedVisibleSize: (view: object) => viewSizes.get(view)?.width,
			},
			storageService: { store: (key: string, value: string) => { stored[key] = value; } },
		};
		Object.setPrototypeOf(host, Workbench.prototype);

		savePartSizes.call(host as unknown as ISavePartSizesTestHarness);

		const sizes = JSON.parse(stored['workbench.sessions.partSizes']);
		assert.strictEqual(sizes.editor, 850);
	});


	test('showing docked detail with hidden editor restores the preferred detail width instead of cached node width', () => {
		const host = createHost({ single: true, editorWidth: 640, dockedWidth: 300, partVisibility: { editor: false, auxiliaryBar: false } });

		setAuxiliaryBarHidden.call(host, false);

		assert.deepStrictEqual({
			auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
			editorVisible: host.partVisibility.editor,
			resizes: host.resizes,
			visibilityChanges: host.visibilityChanges,
			events: host.events,
			layoutCount: host.counts.layout,
		}, {
			auxiliaryBarVisible: true,
			editorVisible: false,
			resizes: [{ width: 300, height: 800 }],
			visibilityChanges: [true],
			events: [{ partId: Parts.AUXILIARYBAR_PART, visible: true }],
			layoutCount: 1,
		});
	});

	test('reapplying a docked width retains the exact user width in a detail-only node', () => {
		const host = createHost({ single: true, dockedWidth: 220, editorWidth: 220, partVisibility: { editor: false, auxiliaryBar: true } });
		const setDockedAuxiliaryBarWidth = SinglePaneWorkbench.prototype.setDockedAuxiliaryBarWidth as (this: ITestWorkbench, width: number) => void;

		setDockedAuxiliaryBarWidth.call(host, 220);

		assert.deepStrictEqual({
			dockedWidth: host._dockedAuxiliaryBarWidth,
			resizes: host.resizes,
			layoutCount: host.counts.layout,
		}, {
			dockedWidth: 220,
			resizes: [{ width: 220, height: 800 }],
			layoutCount: 1,
		});
	});

	test('persisted editor width excludes the detail only when the detail is visible', () => {
		// Editor + detail visible: the node includes the detail, so it is excluded
		// to store the pure editor-content width (reconstructed by adding it back).
		const withDetail = createHost({ single: true, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: true } });
		// Editor-only (detail closed): the node is pure editor content, so nothing
		// is subtracted — otherwise the side pane would shrink by the detail width
		// on every reload (compounding toward zero).
		const editorOnly = createHost({ single: true, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: false } });

		assert.deepStrictEqual({
			withDetail: persistedEditorWidth.call(withDetail, 900),
			editorOnly: persistedEditorWidth.call(editorOnly, 900),
		}, {
			withDetail: 600,
			editorOnly: 900,
		});
	});

	test('does not re-apply the even split on later editor reveals', () => {
		const host = createHost({ sessionsWidth: 1000, hasAppliedInitialEditorSplit: true });

		setEditorHidden.call(host, false);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			visibilityChanges: host.visibilityChanges,
			resizes: host.resizes,
		}, {
			editorVisible: true,
			visibilityChanges: [true],
			resizes: [],
		});
	});

	test('clamps the even editor split to a minimum width', () => {
		const host = createHost({ sessionsWidth: 400, windowWidth: 400 });

		setEditorHidden.call(host, false);

		assert.deepStrictEqual(host.resizes, [{ width: 300, height: 800 }]);
	});

	test('relayouts the docked detail panel when the editor visibility changes', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, hasAppliedInitialEditorSplit: true });

		setEditorHidden.call(host, false);
		setEditorHidden.call(host, true);

		assert.deepStrictEqual({
			layoutCount: host.counts.layout,
			visibilityChanges: host.visibilityChanges,
		}, {
			layoutCount: 2,
			visibilityChanges: [true, true],
		});
	});

	test('fires editor visibility changes when docked editor content is hidden or shown', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, hasAppliedInitialEditorSplit: true, partVisibility: { editor: true, auxiliaryBar: true } });

		setEditorHidden.call(host, true);
		setEditorHidden.call(host, false);

		assert.deepStrictEqual(host.events, [
			{ partId: Parts.EDITOR_PART, visible: false },
			{ partId: Parts.EDITOR_PART, visible: true },
		]);
	});

	test('maps a native sash-drag collapse of the detail-only node onto hiding the auxiliary bar, like the sessions list', () => {
		const host = createHost({ single: true, partVisibility: { editor: false, auxiliaryBar: true } });

		onEditorPartGridVisibilityChange.call(host, false);

		assert.deepStrictEqual({
			auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
			events: host.events,
		}, {
			auxiliaryBarVisible: false,
			events: [{ partId: Parts.AUXILIARYBAR_PART, visible: false, source: 'resize' }],
		});
	});

	test('reveals the detail-only panel again when the collapsed node is dragged back open', () => {
		const host = createHost({ single: true, partVisibility: { editor: false, auxiliaryBar: true } });

		onEditorPartGridVisibilityChange.call(host, false);
		onEditorPartGridVisibilityChange.call(host, true);

		assert.deepStrictEqual({
			auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
			events: host.events,
		}, {
			auxiliaryBarVisible: true,
			events: [
				{ partId: Parts.AUXILIARYBAR_PART, visible: false, source: 'resize' },
				{ partId: Parts.AUXILIARYBAR_PART, visible: true, source: 'resize' },
			],
		});
	});

	test('ignores the shared node grid visibility while editor content is visible', () => {
		const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: true } });

		onEditorPartGridVisibilityChange.call(host, false);

		assert.deepStrictEqual({ auxiliaryBarVisible: host.partVisibility.auxiliaryBar, events: host.events }, { auxiliaryBarVisible: true, events: [] });
	});

	test('fires onDidRevealSidePane only when the side pane transitions from fully hidden to visible', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, partVisibility: { editor: false, auxiliaryBar: false } });
		const counts: number[] = [];

		// From fully closed, revealing the editor fires the reveal.
		setEditorHidden.call(host, false);
		counts.push(host.sidePaneReveals.length);
		// The aux bar then also showing does NOT fire again — the pane is already visible.
		setAuxiliaryBarHidden.call(host, false);
		counts.push(host.sidePaneReveals.length);
		// Fully close the pane (hide the aux first while the editor is still visible, then
		// the editor) so it reaches the fully-hidden state without an auto-reveal.
		setAuxiliaryBarHidden.call(host, true);
		setEditorHidden.call(host, true);
		counts.push(host.sidePaneReveals.length);
		// Revealing again from fully hidden fires a second time.
		setEditorHidden.call(host, false);
		counts.push(host.sidePaneReveals.length);

		assert.deepStrictEqual(counts, [1, 1, 1, 2]);
	});

	test('fires onDidRevealSidePane once in the base layout when the side pane becomes visible', () => {
		const host = createHost({ sessionsWidth: 1000, partVisibility: { editor: false, auxiliaryBar: false } });

		setAuxiliaryBarHidden.call(host, false);
		setEditorHidden.call(host, false);

		assert.strictEqual(host.sidePaneReveals.length, 1);
	});

	test('shrinks the docked editor node to the detail width when hiding the editor', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, hasAppliedInitialEditorSplit: true, dockedWidth: 320, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });

		setEditorHidden.call(host, true);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			visibilityChanges: host.visibilityChanges,
			resizes: host.resizes,
		}, {
			editorVisible: false,
			visibilityChanges: [true],
			resizes: [{ width: 320, height: 800 }],
		});
	});

	test('retains the exact dragged detail width when hiding Editor', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, hasAppliedInitialEditorSplit: true, dockedWidth: 220, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });

		setEditorHidden.call(host, true);

		assert.deepStrictEqual(host.resizes, [{ width: 220, height: 800 }]);
	});

	// --- [Scenario 5] editor auto-reveal on open ---------------------------

	interface IWillOpenTestHarness {
		_editorPartAutoVisibilitySuppressionCount: number;
		partVisibility: { editor: boolean; auxiliaryBar: boolean };
		editorGroupService: { mainPart: { groups: { id: number }[] } };
		isRestored(): boolean;
		setEditorHidden(hidden: boolean, explicit?: boolean): void;
		restoreAttachedEditorMaximizedState(): void;
	}

	function createWillOpenHarness(overrides?: Partial<IWillOpenTestHarness>): { harness: IWillOpenTestHarness; setEditorHiddenCalls: { hidden: boolean; explicit?: boolean }[] } {
		const setEditorHiddenCalls: { hidden: boolean; explicit?: boolean }[] = [];
		const harness: IWillOpenTestHarness = {
			_editorPartAutoVisibilitySuppressionCount: 0,
			partVisibility: { editor: false, auxiliaryBar: false },
			editorGroupService: { mainPart: { groups: [{ id: 1 }] } },
			isRestored: () => true,
			setEditorHidden: (hidden, explicit) => setEditorHiddenCalls.push({ hidden, explicit }),
			restoreAttachedEditorMaximizedState: () => { },
			...overrides,
		};
		return { harness, setEditorHiddenCalls };
	}

	test('[Scenario 5] base revealEditorOnOpen reveals a hidden editor on open', () => {
		const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false, auxiliaryBar: true } });

		revealEditorOnOpen.call(harness, { groupId: 1, editor: { typeId: 'workbench.editors.files.fileEditorInput' } });

		assert.deepStrictEqual(setEditorHiddenCalls, [{ hidden: false, explicit: true }]);
	});

	test('[Scenario 5] base revealEditorOnOpen does not reveal when the open targets a non-main-part group', () => {
		const { harness, setEditorHiddenCalls } = createWillOpenHarness();

		revealEditorOnOpen.call(harness, { groupId: 99, editor: { typeId: 'workbench.editors.files.fileEditorInput' } });

		assert.deepStrictEqual(setEditorHiddenCalls, []);
	});

	test('[Scenario 5] base revealEditorOnOpen does not reveal while editor-part auto-visibility is suppressed', () => {
		const { harness, setEditorHiddenCalls } = createWillOpenHarness({ _editorPartAutoVisibilitySuppressionCount: 1 });

		revealEditorOnOpen.call(harness, { groupId: 1, editor: { typeId: 'workbench.editors.files.fileEditorInput' } });

		assert.deepStrictEqual(setEditorHiddenCalls, []);
	});

	test('docked editors are excluded from the editor limit (prevents managed-tab open/close loop)', () => {
		// The managed Changes/Files tabs are pinned but not sticky, so a per-group
		// editor limit of 1 would otherwise evict them and the managed-tab
		// reconciliation would reopen them, hanging the renderer. Docked inputs opt
		// out of the limit so they are never auto-closed.
		const dockedEditor = new TestDockedEditorInput();

		try {
			assert.strictEqual(dockedEditor.hasCapability(EditorInputCapabilities.ExcludeFromEditorLimit), true);
		} finally {
			dockedEditor.dispose();
		}
	});

	test('[Scenario 5] single-pane does not reveal a docked editor while the detail panel is open and the editor is closed', () => {
		// Re-activating a docked-detail editor (closing a neighbouring tab, or
		// clicking the tab) while the detail panel already shows its content must
		// not reveal the closed editor area.
		const dockedEditor = new TestDockedEditorInput();
		const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false, auxiliaryBar: true } });

		try {
			revealEditorOnOpenSinglePane.call(harness, { groupId: 1, editor: dockedEditor });
			assert.deepStrictEqual(setEditorHiddenCalls, []);
		} finally {
			dockedEditor.dispose();
		}
	});

	test('[Scenario 5] single-pane reveals a docked editor when the detail panel is closed', () => {
		// With the whole side pane closed (detail panel hidden), opening a docked
		// editor must reveal the editor area so its content becomes visible.
		const dockedEditor = new TestDockedEditorInput();
		const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false, auxiliaryBar: false } });

		try {
			revealEditorOnOpenSinglePane.call(harness, { groupId: 1, editor: dockedEditor });
			assert.deepStrictEqual(setEditorHiddenCalls, [{ hidden: false, explicit: true }]);
		} finally {
			dockedEditor.dispose();
		}
	});

	test('[Scenario 5] single-pane reveals a non-docked editor even while the detail panel is open', () => {
		const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false, auxiliaryBar: true } });

		revealEditorOnOpenSinglePane.call(harness, { groupId: 1, editor: { typeId: 'workbench.editors.files.fileEditorInput' } });

		assert.deepStrictEqual(setEditorHiddenCalls, [{ hidden: false, explicit: true }]);
	});

	test('[reload] single-pane does not reveal Editor for restored tabs before workbench restore completes', () => {
		const { harness, setEditorHiddenCalls } = createWillOpenHarness({
			partVisibility: { editor: false, auxiliaryBar: true },
			isRestored: () => false,
		});

		revealEditorOnOpenSinglePane.call(harness, { groupId: 1, editor: { typeId: 'workbench.editors.files.fileEditorInput' } });

		assert.deepStrictEqual(setEditorHiddenCalls, []);
	});

	test('restores the docked editor node size when showing after hide', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, hasAppliedInitialEditorSplit: true, dockedWidth: 320, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });

		setEditorHidden.call(host, true);
		setEditorHidden.call(host, false);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			visibilityChanges: host.visibilityChanges,
			resizes: host.resizes,
			snapshot: host._memento.dockedEditorSizeBeforeHide,
		}, {
			editorVisible: true,
			visibilityChanges: [true, true],
			resizes: [
				{ width: 320, height: 800 },
				{ width: 900, height: 800 },
			],
			snapshot: undefined,
		});
	});

	test('preserves side pane width when hiding editor before details and restoring both', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, hasAppliedInitialEditorSplit: true, dockedWidth: 300, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });
		host._editorPartAutoVisibilitySuppressionCount++;

		setEditorHidden.call(host, true);
		setAuxiliaryBarHidden.call(host, true);
		setAuxiliaryBarHidden.call(host, false);
		setEditorHidden.call(host, false);

		assert.deepStrictEqual({
			persistedEditorWidth: host._savedPartSizes.editor,
			resizes: host.resizes,
			snapshot: host._memento.dockedEditorSizeBeforeHide,
		}, {
			persistedEditorWidth: 600,
			resizes: [
				{ width: 300, height: 800 },
				{ width: 300, height: 800 },
				{ width: 900, height: 800 },
			],
			snapshot: undefined,
		});
	});

	test('hideSidePane hides Editor before Details and preserves the editor width', () => {
		const host = createHost({ single: true, dockedWidth: 300, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });

		hideSidePane.call(host);

		assert.deepStrictEqual({
			visibility: {
				editor: host.partVisibility.editor,
				auxiliaryBar: host.partVisibility.auxiliaryBar,
			},
			hideOrder: host.events.filter(event => !event.visible).map(event => event.partId),
			persistedEditorWidth: host._savedPartSizes.editor,
		}, {
			visibility: {
				editor: false,
				auxiliaryBar: false,
			},
			hideOrder: [Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART],
			persistedEditorWidth: 600,
		});
	});

	test('suppresses docked editor reveal sync while hiding the editor', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, hasAppliedInitialEditorSplit: true, dockedWidth: 320, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });
		// Any grid mutation re-enters reveal-sync; it must be a no-op while suspended.
		const grid = (host as unknown as { workbenchGrid: { setViewVisible(view: object, visible: boolean): void } }).workbenchGrid;
		const setViewVisible = grid.setViewVisible;
		grid.setViewVisible = (view, visible) => {
			setViewVisible(view, visible);
			onEditorNodeResized.call(host, 900);
		};

		setEditorHidden.call(host, true);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			events: host.events,
			resizes: host.resizes,
			snapshot: host._memento.dockedEditorSizeBeforeHide,
		}, {
			editorVisible: false,
			events: [{ partId: Parts.EDITOR_PART, visible: false }],
			resizes: [{ width: 320, height: 800 }],
			snapshot: { width: 900, height: 800 },
		});
	});

	test('reset width survives whole-pane close, New Session Files-only, and file open', () => {
		const host = createHost({
			single: true,
			dockedWidth: 300,
			editorWidth: 908,
			partVisibility: { editor: true, auxiliaryBar: true }
		});

		hideSidePane.call(host);
		toggleSidePane.call(host);

		host._editorPartAutoVisibilitySuppressionCount++;
		setEditorHidden.call(host, true);
		host._editorPartAutoVisibilitySuppressionCount--;
		const filesOnlyWidth = host.workbenchGrid.getViewSize(host.editorPartView).width;

		setEditorHidden.call(host, false);

		assert.deepStrictEqual({
			persistedEditorWidth: host._savedPartSizes.editor,
			filesOnlyWidth,
			fileOpenWidth: host.workbenchGrid.getViewSize(host.editorPartView).width,
			editorVisible: host.partVisibility.editor,
			detailsVisible: host.partVisibility.auxiliaryBar,
			snapshot: host._memento.dockedEditorSizeBeforeHide,
		}, {
			persistedEditorWidth: 608,
			filesOnlyWidth: 300,
			fileOpenWidth: 908,
			editorVisible: true,
			detailsVisible: true,
			snapshot: undefined,
		});
	});

	test('Existing Editor-only width survives repeated New Session Files-only transitions', () => {
		const host = createHost({
			single: true,
			sessionsWidth: 754,
			editorWidth: 758,
			dockedWidth: 300,
			hasAppliedInitialEditorSplit: true,
			partVisibility: { editor: true, auxiliaryBar: false }
		});
		const existingWidths: number[] = [];

		for (let i = 0; i < 2; i++) {
			hideSidePane.call(host);
			toggleSidePane.call(host);
			setAuxiliaryBarHidden.call(host, false);

			host._editorPartAutoVisibilitySuppressionCount++;
			setEditorHidden.call(host, true);
			host._editorPartAutoVisibilitySuppressionCount--;

			host._editorPartAutoVisibilitySuppressionCount++;
			setAuxiliaryBarHidden.call(host, true);
			setEditorHidden.call(host, false);
			host._editorPartAutoVisibilitySuppressionCount--;

			existingWidths.push(host.workbenchGrid.getViewSize(host.editorPartView).width);
		}

		assert.deepStrictEqual({
			existingWidths,
			editorVisible: host.partVisibility.editor,
			detailsVisible: host.partVisibility.auxiliaryBar,
			persistedEditorWidth: host._savedPartSizes.editor,
			snapshot: host._memento.dockedEditorSizeBeforeHide,
		}, {
			existingWidths: [758, 758],
			editorVisible: true,
			detailsVisible: false,
			persistedEditorWidth: 758,
			snapshot: undefined,
		});
	});

	test('restores the remembered global editor width on reveal instead of the default split (cross-session)', () => {
		// Session A had the side pane at a user-chosen width; another session closed the
		// whole pane. Part sizes are workbench-global, so switching back must restore that
		// width, not reset to the equal split. The width is remembered in `_savedPartSizes`.
		const host = createHost({ single: true, sessionsWidth: 1000, windowWidth: 1000, hasAppliedInitialEditorSplit: true, dockedWidth: 300, editorWidth: 520, partVisibility: { editor: true, auxiliaryBar: false } });

		// Close the whole side pane (aux already hidden) — this captures 520 as the
		// remembered global width and collapses the node.
		setEditorHidden.call(host, true);
		const rememberedWidth = host._savedPartSizes.editor;
		const resizesBeforeReveal = host.resizes.length;

		// Reveal (switch back): restores the remembered 520, not the equal split (500).
		setEditorHidden.call(host, false);
		const revealResizes = host.resizes.slice(resizesBeforeReveal);

		assert.deepStrictEqual({
			rememberedWidth,
			editorVisible: host.partVisibility.editor,
			revealResizes,
		}, {
			rememberedWidth: 520,
			editorVisible: true,
			revealResizes: [{ width: 520, height: 800 }],
		});
	});

	test('single-pane editor part delegates sash reset width to the layout service', () => {
		const preferredWidthGetter = Object.getOwnPropertyDescriptor(SinglePaneMainEditorPart.prototype, 'preferredWidth')!.get!;
		const preferredWidth = preferredWidthGetter.call({ agentWorkbenchLayoutService: { getPreferredEditorPartWidth: () => 850 } });

		assert.strictEqual(preferredWidth, 850);
	});

	test('single-pane sash reset balances Sessions and editor content after reserving Details', () => {
		const medium = createHost({ single: true, sessionsWidth: 700, editorWidth: 700, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: true } });
		const wide = createHost({ single: true, sessionsWidth: 900, editorWidth: 700, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: true } });
		const wideDetails = createHost({ single: true, sessionsWidth: 750, editorWidth: 750, dockedWidth: 600, partVisibility: { editor: true, auxiliaryBar: true } });
		const constrained = createHost({ single: true, sessionsWidth: 350, editorWidth: 350, dockedWidth: 600, partVisibility: { editor: true, auxiliaryBar: true } });
		const tooNarrow = createHost({ single: true, sessionsWidth: 250, editorWidth: 250, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: true } });
		const comfortableEditor = createHost({ single: true, sessionsWidth: 500, editorWidth: 900, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: true } });
		const detailsHidden = createHost({ single: true, sessionsWidth: 700, editorWidth: 700, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: false } });
		const editorHidden = createHost({ single: true, sessionsWidth: 1100, editorWidth: 300, dockedWidth: 420, partVisibility: { editor: false, auxiliaryBar: true } });

		assert.deepStrictEqual({
			medium: SinglePaneWorkbench.prototype.getPreferredEditorPartWidth.call(medium),
			mediumRestoreEqualSplitOnHide: medium._restoreEqualSplitOnDetailsHide,
			wide: SinglePaneWorkbench.prototype.getPreferredEditorPartWidth.call(wide),
			wideDetails: SinglePaneWorkbench.prototype.getPreferredEditorPartWidth.call(wideDetails),
			constrained: SinglePaneWorkbench.prototype.getPreferredEditorPartWidth.call(constrained),
			tooNarrow: SinglePaneWorkbench.prototype.getPreferredEditorPartWidth.call(tooNarrow),
			comfortableEditor: SinglePaneWorkbench.prototype.getPreferredEditorPartWidth.call(comfortableEditor),
			detailsHidden: SinglePaneWorkbench.prototype.getPreferredEditorPartWidth.call(detailsHidden),
			editorHidden: SinglePaneWorkbench.prototype.getPreferredEditorPartWidth.call(editorHidden),
		}, {
			medium: 850,
			mediumRestoreEqualSplitOnHide: true,
			wide: 950,
			wideDetails: 1050,
			constrained: 650,
			tooNarrow: 400,
			comfortableEditor: 850,
			detailsHidden: undefined,
			editorHidden: DockedAuxiliaryBarController.DEFAULT_WIDTH,
		});
	});

	test('closing Details after a no-op balanced sash reset restores an equal Sessions and Editor split', () => {
		const host = createHost({ single: true, sessionsWidth: 560, editorWidth: 840, dockedWidth: 280, partVisibility: { editor: true, auxiliaryBar: true } });

		const resetWidth = SinglePaneWorkbench.prototype.getPreferredEditorPartWidth.call(host);
		setAuxiliaryBarHidden.call(host, true);

		assert.deepStrictEqual({
			resetWidth,
			restoreEqualSplitOnHide: host._restoreEqualSplitOnDetailsHide,
			resizes: host.resizes,
		}, {
			resetWidth: 840,
			restoreEqualSplitOnHide: false,
			resizes: [{ width: 700, height: 800 }],
		});
	});

	test('hiding Details after a balanced reset uses the live width for an equal split', () => {
		const host = createHost({ single: true, sessionsWidth: 560, editorWidth: 840, dockedWidth: 280, partVisibility: { editor: true, auxiliaryBar: true } });
		SinglePaneWorkbench.prototype.getPreferredEditorPartWidth.call(host);
		host.workbenchGrid.resizeView(host.sessionsPartView, { width: 800, height: 800 });
		host.workbenchGrid.resizeView(host.editorPartView, { width: 1200, height: 800 });
		host.resizes.length = 0;

		setAuxiliaryBarHidden.call(host, true);

		assert.deepStrictEqual({
			restoreEqualSplitOnHide: host._restoreEqualSplitOnDetailsHide,
			resizes: host.resizes,
		}, {
			restoreEqualSplitOnHide: false,
			resizes: [{ width: 1000, height: 800 }],
		});
	});

	test('manual sash resize preserves the pending Details-hide reset behavior', () => {
		const host = createHost({ single: true, sessionsWidth: 560, editorWidth: 840, dockedWidth: 280, partVisibility: { editor: true, auxiliaryBar: true } });
		SinglePaneWorkbench.prototype.getPreferredEditorPartWidth.call(host);
		host.workbenchGrid.resizeView(host.sessionsPartView, { width: 700, height: 800 });
		host.workbenchGrid.resizeView(host.editorPartView, { width: 700, height: 800 });
		host.resizes.length = 0;

		onEditorNodeResized.call(host, 700);
		setAuxiliaryBarHidden.call(host, true);

		assert.deepStrictEqual({
			restoreEqualSplitOnHide: host._restoreEqualSplitOnDetailsHide,
			resizes: host.resizes,
		}, {
			restoreEqualSplitOnHide: false,
			resizes: [{ width: 700, height: 800 }],
		});
	});

	test('hiding Editor clears the pending Details-hide reset behavior', () => {
		const host = createHost({ single: true, sessionsWidth: 560, editorWidth: 840, dockedWidth: 280, partVisibility: { editor: true, auxiliaryBar: true } });
		SinglePaneWorkbench.prototype.getPreferredEditorPartWidth.call(host);

		setEditorHidden.call(host, true, true);
		setAuxiliaryBarHidden.call(host, true);

		assert.deepStrictEqual({
			restoreEqualSplitOnHide: host._restoreEqualSplitOnDetailsHide,
			resizes: host.resizes,
		}, {
			restoreEqualSplitOnHide: false,
			resizes: [
				{ width: 280, height: 800 },
				{ width: 840, height: 800 },
				{ width: 560, height: 800 },
			],
		});
	});

	test('single-pane editor part is a snap view only while editor content is hidden (docked detail-only)', () => {
		const snapGetter = Object.getOwnPropertyDescriptor(SinglePaneMainEditorPart.prototype, 'snap')!.get!;
		const call = (editorVisible: boolean) => snapGetter.call({ agentWorkbenchLayoutService: { isVisible: () => editorVisible } });

		assert.deepStrictEqual({ editorHidden: call(false), editorVisible: call(true) }, { editorHidden: true, editorVisible: false });
	});

	test('single-pane editor part minimumWidth matches the sessions-list minimum while editor content is hidden (docked detail-only)', () => {
		const minimumWidthGetter = Object.getOwnPropertyDescriptor(SinglePaneMainEditorPart.prototype, 'minimumWidth')!.get!;
		const minimumWidth = minimumWidthGetter.call({ agentWorkbenchLayoutService: { isVisible: () => false } });

		assert.strictEqual(minimumWidth, SESSIONS_LIST_MINIMUM_WIDTH);
	});

	test('single-pane editor part hosts breadcrumbs in the group header (scoped to the Agents Window)', () => {
		// Breadcrumbs render inside the full-width header row between the tab bar
		// and the editor content only in the single-pane Agents Window. The classic
		// editor part must keep its default (below-tabs) placement.
		const getOptions = Reflect.get(SinglePaneMainEditorPart.prototype, 'getGroupViewOptions') as () => {
			showHeader?: boolean;
			menuIds?: { headerPrimary?: object; headerSecondary?: object; headerLayout?: object };
		};
		const options = getOptions.call({});

		assert.deepStrictEqual({
			showHeader: options.showHeader,
			headerPrimary: options.menuIds?.headerPrimary,
			headerSecondary: options.menuIds?.headerSecondary,
			headerLayout: options.menuIds?.headerLayout,
		}, {
			showHeader: true,
			headerPrimary: Menus.SessionsEditorHeaderPrimary,
			headerSecondary: undefined,
			headerLayout: Menus.SessionsEditorHeaderLayout,
		});
	});

	test('single-pane editor part chooses the tab override from the visible composition', () => {
		const getOverride = Reflect.get(SinglePaneMainEditorPart.prototype, '_getShowTabsOverride') as (
			configuredShowTabs: 'multiple' | 'single' | 'none',
			editorVisible: boolean,
			auxiliaryBarVisible: boolean
		) => 'multiple' | 'single' | undefined;

		assert.deepStrictEqual({
			auxiliaryBarOnlyMultiple: getOverride('multiple', false, true),
			auxiliaryBarOnlySingle: getOverride('single', false, true),
			auxiliaryBarOnlyNone: getOverride('none', false, true),
			editorAndAuxiliaryBarSingle: getOverride('single', true, true),
			editorOnlyNone: getOverride('none', true, false),
			fullyHiddenMultiple: getOverride('multiple', false, false),
		}, {
			auxiliaryBarOnlyMultiple: 'multiple',
			auxiliaryBarOnlySingle: 'multiple',
			auxiliaryBarOnlyNone: 'multiple',
			editorAndAuxiliaryBarSingle: undefined,
			editorOnlyNone: 'single',
			fullyHiddenMultiple: undefined,
		});
	});

	test('single-pane editor part rejects editor group creation and multi-group layouts', () => {
		const group = {};
		const addGroup = Reflect.get(SinglePaneMainEditorPart.prototype, 'addGroup') as (location: object, direction: GroupDirection) => object;
		const applyLayout = Reflect.get(SinglePaneMainEditorPart.prototype, 'applyLayout') as (layout: { orientation: GroupOrientation; groups: object[] }) => void;

		assert.deepStrictEqual({
			addGroupResult: addGroup.call({ assertGroupView: () => group }, group, GroupDirection.RIGHT),
			multiGroupLayoutRejected: (() => {
				applyLayout.call({}, { orientation: GroupOrientation.HORIZONTAL, groups: [{}, {}] });
				return true;
			})(),
		}, {
			addGroupResult: group,
			multiGroupLayoutRejected: true,
		});
	});

	test('single-pane editor parts reject cross-part group moves and copies', () => {
		const mainPart = Object.create(SinglePaneMainEditorPart.prototype) as SinglePaneMainEditorPart;
		const auxiliaryPart = {};
		const mainGroup = {};
		const auxiliaryGroup = {};
		const involvesSinglePaneMainPart = Reflect.get(EditorParts.prototype, 'involvesSinglePaneMainPart') as (group: object, location: object) => boolean;
		const host = {
			mainPart,
			getPart: (group: object) => group === mainGroup ? mainPart : auxiliaryPart,
			resolveGroup: (group: object) => group,
			involvesSinglePaneMainPart,
		};
		const moveGroup = Reflect.get(EditorParts.prototype, 'moveGroup') as (group: object, location: object, direction: GroupDirection) => object;
		const copyGroup = Reflect.get(EditorParts.prototype, 'copyGroup') as (group: object, location: object, direction: GroupDirection) => object;

		assert.deepStrictEqual({
			moveFromMain: moveGroup.call(host, mainGroup, auxiliaryGroup, GroupDirection.RIGHT),
			moveToMain: moveGroup.call(host, auxiliaryGroup, mainGroup, GroupDirection.RIGHT),
			copyFromMain: copyGroup.call(host, mainGroup, auxiliaryGroup, GroupDirection.RIGHT),
			copyToMain: copyGroup.call(host, auxiliaryGroup, mainGroup, GroupDirection.RIGHT),
		}, {
			moveFromMain: mainGroup,
			moveToMain: auxiliaryGroup,
			copyFromMain: mainGroup,
			copyToMain: auxiliaryGroup,
		});
	});

	test('single-pane editor retains restored editors when collapsing restored groups', () => {
		const firstEditor = { id: 'first' };
		const secondEditor = { id: 'second' };
		const activeGroup = { editors: [secondEditor], activeEditor: secondEditor };
		const sourceGroup = { editors: [firstEditor], activeEditor: firstEditor };
		const host = {
			count: 2,
			activeGroup,
			groups: [sourceGroup, activeGroup],
			mergeAllGroups(target: typeof activeGroup) {
				target.editors.unshift(...sourceGroup.editors);
				this.groups = [target];
				this.count = 1;
			},
		};
		const ensureSingleEditorGroup = Reflect.get(SinglePaneMainEditorPart.prototype, '_ensureSingleEditorGroup') as () => void;

		ensureSingleEditorGroup.call(host);

		assert.deepStrictEqual({
			groupCount: host.count,
			editors: host.activeGroup.editors.map(editor => editor.id),
			activeEditor: host.activeGroup.activeEditor.id,
		}, {
			groupCount: 1,
			editors: ['first', 'second'],
			activeEditor: 'second',
		});
	});

	test('applies an even split when revealing the docked editor with no captured width even after the initial split', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, windowWidth: 1300, hasAppliedInitialEditorSplit: true, dockedWidth: 300, editorWidth: 300, partVisibility: { editor: false, auxiliaryBar: true } });

		setEditorHidden.call(host, false);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			visibilityChanges: host.visibilityChanges,
			distributions: host.distributions,
		}, {
			editorVisible: true,
			visibilityChanges: [true],
			distributions: [host.editorPartView],
		});
	});

	test('restores a captured docked editor width instead of applying an even split', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, hasAppliedInitialEditorSplit: true, dockedWidth: 300, partVisibility: { editor: false, auxiliaryBar: true } });
		host._memento.dockedEditorSizeBeforeHide = { width: 720, height: 800 };

		setEditorHidden.call(host, false);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			visibilityChanges: host.visibilityChanges,
			resizes: host.resizes,
			snapshot: host._memento.dockedEditorSizeBeforeHide,
		}, {
			editorVisible: true,
			visibilityChanges: [true],
			resizes: [{ width: 720, height: 800 }],
			snapshot: undefined,
		});
	});

	test('reopening the whole side pane even-splits instead of restoring a cramped width', () => {
		const host = createHost({ single: true, sessionsWidth: 1360, windowWidth: 1360, hasAppliedInitialEditorSplit: true, dockedWidth: 300, editorWidth: 40, partVisibility: { editor: true, auxiliaryBar: false } });

		setEditorHidden.call(host, true);
		const afterClose = {
			snapshot: host._memento.dockedEditorSizeBeforeHide,
			resizes: [...host.resizes],
		};

		setEditorHidden.call(host, false);

		assert.deepStrictEqual({
			afterClose,
			editorVisible: host.partVisibility.editor,
			distributions: host.distributions,
			snapshot: host._memento.dockedEditorSizeBeforeHide,
		}, {
			afterClose: {
				snapshot: undefined,
				resizes: [],
			},
			editorVisible: true,
			distributions: [host.editorPartView],
			snapshot: undefined,
		});
	});

	// --- Docked editor hide-sync (grid sash / editor part layout) -----------

	test('does not reveal the docked editor when the grid sash widens the node while only the detail is shown', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 305 });
		host._memento.dockedEditorSizeBeforeHide = { width: 900, height: 800 };

		onGridDidChange.call(host);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			events: host.events,
			layoutCount: host.counts.layout,
			saveCount: host.counts.save,
			classToggles: host.classToggles,
			resizes: host.resizes,
			snapshot: host._memento.dockedEditorSizeBeforeHide,
		}, {
			editorVisible: false,
			events: [],
			layoutCount: 0,
			saveCount: 0,
			classToggles: [],
			resizes: [],
			snapshot: { width: 900, height: 800 },
		});
	});

	test('does not reveal the docked editor from editor part layout width while only the detail is shown', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 300 });
		host._memento.dockedEditorSizeBeforeHide = { width: 900, height: 800 };

		onEditorNodeResized.call(host, 305);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			events: host.events,
			layoutCount: host.counts.layout,
			saveCount: host.counts.save,
			snapshot: host._memento.dockedEditorSizeBeforeHide,
		}, {
			editorVisible: false,
			events: [],
			layoutCount: 0,
			saveCount: 0,
			snapshot: { width: 900, height: 800 },
		});
	});

	test('does not reveal the docked editor when the sash widens the node enough to fit the editor beside the detail', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 500, partVisibility: { editor: false, auxiliaryBar: true } });

		onEditorNodeResized.call(host, 500);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			events: host.events,
			layoutCount: host.counts.layout,
			saveCount: host.counts.save,
			classToggles: host.classToggles,
		}, {
			editorVisible: false,
			events: [],
			layoutCount: 0,
			saveCount: 0,
			classToggles: [],
		});
	});

	test('does not reveal the docked editor while widening the node from a grid layout change', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 499, partVisibility: { editor: false, auxiliaryBar: true } });

		onGridDidChange.call(host);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			events: host.events,
			layoutCount: host.counts.layout,
			saveCount: host.counts.save,
		}, {
			editorVisible: false,
			events: [],
			layoutCount: 0,
			saveCount: 0,
		});
	});

	test('does not reveal the docked editor from a widen while the detail is also hidden', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 650, partVisibility: { editor: false, auxiliaryBar: false } });

		onEditorNodeResized.call(host, 650);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			events: host.events,
			layoutCount: host.counts.layout,
			saveCount: host.counts.save,
		}, {
			editorVisible: false,
			events: [],
			layoutCount: 0,
			saveCount: 0,
		});
	});

	test('keeps docked editor hidden when editor part layout width leaves only detail width', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 220 });

		onEditorNodeResized.call(host, 224);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			events: host.events,
			layoutCount: host.counts.layout,
			saveCount: host.counts.save,
		}, {
			editorVisible: false,
			events: [],
			layoutCount: 0,
			saveCount: 0,
		});
	});

	test('keeps docked editor hidden when grid sash leaves only detail width', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 224 });

		onGridDidChange.call(host);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			events: host.events,
			layoutCount: host.counts.layout,
			saveCount: host.counts.save,
		}, {
			editorVisible: false,
			events: [],
			layoutCount: 0,
			saveCount: 0,
		});
	});

	test('keeps details visible when window or sash resize leaves too little room for both panes', () => {
		const windowResize = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 600, partVisibility: { editor: true, auxiliaryBar: true } });
		const sashResize = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 599, partVisibility: { editor: true, auxiliaryBar: true } });

		onEditorNodeResized.call(windowResize, 599);
		onGridDidChange.call(sashResize);

		assert.deepStrictEqual({
			windowResize: {
				editorVisible: windowResize.partVisibility.editor,
				detailVisible: windowResize.partVisibility.auxiliaryBar,
				events: windowResize.events,
				layoutCount: windowResize.counts.layout,
				saveCount: windowResize.counts.save,
			},
			sashResize: {
				editorVisible: sashResize.partVisibility.editor,
				detailVisible: sashResize.partVisibility.auxiliaryBar,
				events: sashResize.events,
				layoutCount: sashResize.counts.layout,
				saveCount: sashResize.counts.save,
			},
		}, {
			windowResize: {
				editorVisible: true,
				detailVisible: true,
				events: [],
				layoutCount: 0,
				saveCount: 0,
			},
			sashResize: {
				editorVisible: true,
				detailVisible: true,
				events: [],
				layoutCount: 0,
				saveCount: 0,
			},
		});
	});

	test('keeps editor content visible when a wide Details preference is constrained', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 600, editorWidth: 600, partVisibility: { editor: true, auxiliaryBar: true } });

		onEditorNodeResized.call(host, 600);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			detailVisible: host.partVisibility.auxiliaryBar,
			events: host.events,
			layoutCount: host.counts.layout,
		}, {
			editorVisible: true,
			detailVisible: true,
			events: [],
			layoutCount: 0,
		});
	});

	test('does not hide docked editor when node is squeezed but detail is also hidden', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 600, partVisibility: { editor: true, auxiliaryBar: false } });

		onEditorNodeResized.call(host, 304);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			events: host.events,
			layoutCount: host.counts.layout,
			saveCount: host.counts.save,
		}, {
			editorVisible: true,
			events: [],
			layoutCount: 0,
			saveCount: 0,
		});
	});

	test('collapses the editor without hiding details when the outer sash reaches the detail width', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 600, partVisibility: { editor: true, auxiliaryBar: true } });
		host._editorRevealedExplicitly = true;

		onEditorNodeResized.call(host, 224);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			detailVisible: host.partVisibility.auxiliaryBar,
			editorRevealedExplicitly: host._editorRevealedExplicitly,
		}, {
			editorVisible: false,
			detailVisible: true,
			editorRevealedExplicitly: false,
		});
	});

	// --- DockedAuxiliaryBarController --------------------------------------

	test('aligns docked details with the editor title boundary', () => {
		const editorContainer = document.createElement('div');
		const auxiliaryBarContainer = document.createElement('div');
		const layouts: { height: number; top: number }[] = [];
		let titleHeight = 33;

		Object.defineProperties(editorContainer, {
			clientHeight: { value: 600 },
			clientTop: { value: 1 },
		});
		editorContainer.getBoundingClientRect = () => ({
			width: 800,
			height: 600,
			top: 0,
			right: 800,
			bottom: 600,
			left: 0,
			x: 0,
			y: 0,
			toJSON: () => undefined,
		});

		const auxiliaryBarPart = {
			getContainer: () => auxiliaryBarContainer,
			layout: (_width: number, height: number, top: number) => layouts.push({ height, top }),
		} as unknown as Part;
		const host: IDockedAuxiliaryBarHost = {
			getWidth: () => 260,
			setWidth: () => { },
			isEditorAreaVisible: () => true,
			isEditorVisible: () => true,
			isAuxiliaryBarVisible: () => true,
			hideAuxiliaryBar: () => { },
			setEditorContentRightInset: () => { },
			getTitleHeight: () => titleHeight,
		};
		const controller = new DockedAuxiliaryBarController(editorContainer, auxiliaryBarPart, host);

		controller.layout();
		titleHeight = 62;
		controller.layout();

		assert.deepStrictEqual({
			layouts,
			style: {
				top: auxiliaryBarContainer.style.top,
				height: auxiliaryBarContainer.style.height,
			},
			visualTop: editorContainer.clientTop + Number.parseInt(auxiliaryBarContainer.style.top, 10),
		}, {
			layouts: [
				{ height: 567, top: 33 },
				{ height: 538, top: 62 },
			],
			style: {
				top: '62px',
				height: '538px',
			},
			visualTop: 63,
		});

		controller.dispose();
	});

	test('fills the narrowed docked detail node and disables its overlay sash when editor content is hidden', () => {

		const editorContainer = document.createElement('div');
		const auxiliaryBarContainer = document.createElement('div');
		const layouts: { width: number; height: number; top: number; left: number }[] = [];
		const insets: number[] = [];
		const persistedWidths: number[] = [];
		let editorVisible = true;
		let editorWidth = 800;

		Object.defineProperty(editorContainer, 'clientWidth', { get: () => editorWidth });
		Object.defineProperty(editorContainer, 'clientHeight', { value: 600 });
		Object.defineProperty(editorContainer, 'clientTop', { value: 1 });
		editorContainer.getBoundingClientRect = () => ({
			width: editorWidth,
			height: 600,
			top: 0,
			right: editorWidth,
			bottom: 600,
			left: 0,
			x: 0,
			y: 0,
			toJSON: () => undefined,
		});

		const auxiliaryBarPart = {
			getContainer: () => auxiliaryBarContainer,
			layout: (width: number, height: number, top: number, left: number) => {
				layouts.push({ width, height, top, left });
			},
		} as unknown as Part;
		const host: IDockedAuxiliaryBarHost = {
			getWidth: () => 260,
			setWidth: width => persistedWidths.push(width),
			isEditorAreaVisible: () => true,
			isEditorVisible: () => editorVisible,
			isAuxiliaryBarVisible: () => true,
			hideAuxiliaryBar: () => { },
			setEditorContentRightInset: px => insets.push(px),
			getTitleHeight: () => 34,
		};
		const controller = new DockedAuxiliaryBarController(editorContainer, auxiliaryBarPart, host);

		controller.layout();
		editorWidth = 260;
		editorVisible = false;
		controller.layout();

		const sash = Reflect.get(controller, '_sash') as { state: SashState };
		const sashLayoutProvider = Reflect.get(sash, 'layoutProvider') as { getVerticalSashLeft(): number };
		assert.deepStrictEqual({
			insets,
			persistedWidths,
			layouts,
			style: {
				top: auxiliaryBarContainer.style.top,
				right: auxiliaryBarContainer.style.right,
				width: auxiliaryBarContainer.style.width,
				height: auxiliaryBarContainer.style.height,
			},
			sashState: sash?.state,
			sashLeft: sashLayoutProvider.getVerticalSashLeft(),
		}, {
			insets: [260, 260],
			persistedWidths: [],
			layouts: [
				{ width: 260, height: 566, top: 34, left: 540 },
				{ width: 260, height: 566, top: 34, left: 0 },
			],
			style: {
				top: '34px',
				right: '0px',
				width: '260px',
				height: '566px',
			},
			// The grid sash owns resizing/collapsing here; the overlay sash must be disabled.
			sashState: SashState.Disabled,
			sashLeft: 0,
		});

		controller.dispose();
	});

	test('uses persisted docked detail width when editor content is visible', () => {
		const editorContainer = document.createElement('div');
		const auxiliaryBarContainer = document.createElement('div');
		const layouts: { width: number; height: number; top: number; left: number }[] = [];
		const insets: number[] = [];

		Object.defineProperty(editorContainer, 'clientWidth', { value: 800 });
		Object.defineProperty(editorContainer, 'clientHeight', { value: 600 });
		editorContainer.getBoundingClientRect = () => ({
			width: 800,
			height: 600,
			top: 0,
			right: 800,
			bottom: 600,
			left: 0,
			x: 0,
			y: 0,
			toJSON: () => undefined,
		});

		const auxiliaryBarPart = {
			getContainer: () => auxiliaryBarContainer,
			layout: (width: number, height: number, top: number, left: number) => {
				layouts.push({ width, height, top, left });
			},
		} as unknown as Part;
		const host: IDockedAuxiliaryBarHost = {
			getWidth: () => 260,
			setWidth: () => { },
			isEditorAreaVisible: () => true,
			isEditorVisible: () => true,
			isAuxiliaryBarVisible: () => true,
			hideAuxiliaryBar: () => { },
			setEditorContentRightInset: px => insets.push(px),
			getTitleHeight: () => 35,
		};
		const controller = new DockedAuxiliaryBarController(editorContainer, auxiliaryBarPart, host);

		controller.layout();

		const sash = Reflect.get(controller, '_sash') as { state: SashState } | undefined;
		assert.deepStrictEqual({
			insets,
			layouts,
			style: {
				width: auxiliaryBarContainer.style.width,
				height: auxiliaryBarContainer.style.height,
			},
			sashState: sash?.state,
		}, {
			insets: [260],
			layouts: [{ width: 260, height: 565, top: 35, left: 540 }],
			style: {
				width: '260px',
				height: '565px',
			},
			sashState: SashState.Enabled,
		});

		controller.dispose();
	});

	test('keeps the docked detail at its minimum width while editor content yields', () => {
		assert.deepStrictEqual({
			comfortable: DockedAuxiliaryBarController.getEffectiveWidth(300, 800),
			constrained: DockedAuxiliaryBarController.getEffectiveWidth(300, 500),
			containerBelowMinimum: DockedAuxiliaryBarController.getEffectiveWidth(300, 180),
		}, {
			comfortable: 300,
			constrained: DockedAuxiliaryBarController.MIN_WIDTH,
			containerBelowMinimum: 180,
		});
	});

	test('hides the docked detail panel when its sash collapses to zero width', () => {
		const editorContainer = document.createElement('div');
		const auxiliaryBarContainer = document.createElement('div');
		let hideCount = 0;
		const persistedWidths: number[] = [];

		Object.defineProperty(editorContainer, 'clientWidth', { value: 800 });
		Object.defineProperty(editorContainer, 'clientHeight', { value: 600 });
		editorContainer.getBoundingClientRect = () => ({
			width: 800,
			height: 600,
			top: 0,
			right: 800,
			bottom: 600,
			left: 0,
			x: 0,
			y: 0,
			toJSON: () => undefined,
		});

		const auxiliaryBarPart = {
			getContainer: () => auxiliaryBarContainer,
			layout: () => { },
		} as unknown as Part;
		const host: IDockedAuxiliaryBarHost = {
			getWidth: () => 260,
			setWidth: width => persistedWidths.push(width),
			isEditorAreaVisible: () => true,
			isEditorVisible: () => true,
			isAuxiliaryBarVisible: () => true,
			hideAuxiliaryBar: () => hideCount++,
			setEditorContentRightInset: () => { },
			getTitleHeight: () => 35,
		};
		const controller = new DockedAuxiliaryBarController(editorContainer, auxiliaryBarPart, host);

		controller.layout();
		const sash = Reflect.get(controller, '_sash');
		const start = Reflect.get(sash, '_onDidStart') as { fire(e: unknown): void };
		const change = Reflect.get(sash, '_onDidChange') as { fire(e: unknown): void };
		start.fire({ startX: 0, currentX: 0, startY: 0, currentY: 0, altKey: false });
		change.fire({ startX: 0, currentX: 270, startY: 0, currentY: 0, altKey: false });

		assert.deepStrictEqual({ hideCount, persistedWidths }, { hideCount: 1, persistedWidths: [] });

		controller.dispose();
	});

	// --- Last-editor close ---------------------------------------------------

	test('docked last editor close is delegated to the lifecycle strategy', () => {
		const editorHiddenCalls: { hidden: boolean; suppression: number }[] = [];
		const auxHiddenCalls: { hidden: boolean; suppression: number }[] = [];
		const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: true }, editorGroupService: { mainPart: { groups: [{ isEmpty: true }] } } });
		host.setEditorHidden = hidden => {
			editorHiddenCalls.push({ hidden, suppression: host._editorPartAutoVisibilitySuppressionCount });
			host.partVisibility.editor = !hidden;
		};
		host.setAuxiliaryBarHidden = hidden => {
			auxHiddenCalls.push({ hidden, suppression: host._editorPartAutoVisibilitySuppressionCount });
			host.partVisibility.auxiliaryBar = !hidden;
		};

		handleDidCloseEditor.call(host);

		assert.deepStrictEqual({
			editorHiddenCalls,
			auxHiddenCalls,
			visibility: host.partVisibility,
			suppression: host._editorPartAutoVisibilitySuppressionCount,
		}, {
			editorHiddenCalls: [],
			auxHiddenCalls: [],
			visibility: {
				sidebar: true,
				auxiliaryBar: true,
				editor: true,
				panel: false,
				sessions: true,
				customViewGrid: false,
			},
			suppression: 0,
		});
	});

	test('docked last editor close leaves a detail-only composition to the lifecycle strategy', () => {
		const editorHiddenCalls: boolean[] = [];
		const auxHiddenCalls: { hidden: boolean; suppression: number }[] = [];
		const host = createHost({ single: true, partVisibility: { editor: false, auxiliaryBar: true }, editorGroupService: { mainPart: { groups: [{ isEmpty: true }] } } });
		host.setEditorHidden = hidden => {
			editorHiddenCalls.push(hidden);
			host.partVisibility.editor = !hidden;
		};
		host.setAuxiliaryBarHidden = hidden => {
			auxHiddenCalls.push({ hidden, suppression: host._editorPartAutoVisibilitySuppressionCount });
			host.partVisibility.auxiliaryBar = !hidden;
		};

		handleDidCloseEditor.call(host);

		assert.deepStrictEqual({
			editorHiddenCalls,
			auxHiddenCalls,
			editorVisible: host.partVisibility.editor,
			auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
		}, {
			editorHiddenCalls: [],
			auxHiddenCalls: [],
			editorVisible: false,
			auxiliaryBarVisible: true,
		});
	});

	// --- Attached editor maximized state -----------------------------------

	interface IWorkbenchTestHarness {
		partVisibility: { sidebar: boolean; auxiliaryBar: boolean; editor: boolean; panel: boolean; sessions: boolean };
		layoutPolicy: { viewportClass: { get(): 'phone' | 'tablet' | 'desktop' } };
		storageService: { store(...args: unknown[]): void };
		isSinglePaneLayoutEnabled: boolean;
		_loadPartVisibility(storageService: unknown): { editor?: boolean; auxiliaryBar?: boolean; sidebar?: boolean; panel?: boolean };
		_editorPartAutoVisibilitySuppressionCount: number;
		_editorMaximized: boolean;
		_restoreAttachedEditorMaximizedOnShow: boolean;
		setEditorMaximized(maximized: boolean): void;
		_savePartVisibility(): void;
	}

	function createWorkbenchHarness(): IWorkbenchTestHarness {
		return {
			partVisibility: { sidebar: true, auxiliaryBar: true, editor: true, panel: false, sessions: true },
			layoutPolicy: { viewportClass: { get: () => 'desktop' } },
			storageService: { store: () => { } },
			isSinglePaneLayoutEnabled: false,
			_loadPartVisibility: () => ({}),
			_editorPartAutoVisibilitySuppressionCount: 0,
			_editorMaximized: false,
			_restoreAttachedEditorMaximizedOnShow: false,
			setEditorMaximized: () => { },
			_savePartVisibility: () => { },
		};
	}

	test('restores attached editor maximized state when the auxiliary bar stays visible', () => {
		const maximizedStates: boolean[] = [];
		const workbench = createWorkbenchHarness();
		workbench._editorMaximized = true;
		workbench.setEditorMaximized = maximized => maximizedStates.push(maximized);

		rememberAttachedEditorMaximizedState.call(workbench);

		workbench._editorMaximized = false;
		restoreAttachedEditorMaximizedState.call(workbench);

		assert.deepStrictEqual(maximizedStates, [true]);
		assert.strictEqual(workbench._restoreAttachedEditorMaximizedOnShow, false);
	});

	test('does not restore attached editor maximized state once the auxiliary bar is hidden', () => {
		const maximizedStates: boolean[] = [];
		const workbench = createWorkbenchHarness();
		workbench._editorMaximized = true;
		workbench.setEditorMaximized = maximized => maximizedStates.push(maximized);

		rememberAttachedEditorMaximizedState.call(workbench);

		workbench._editorMaximized = false;
		workbench.partVisibility.auxiliaryBar = false;
		restoreAttachedEditorMaximizedState.call(workbench);

		assert.deepStrictEqual(maximizedStates, []);
		assert.strictEqual(workbench._restoreAttachedEditorMaximizedOnShow, false);
	});

	test('does not restore after the auxiliary bar is hidden and shown again before reopen', () => {
		const maximizedStates: boolean[] = [];
		const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: true } });
		host._editorMaximized = true;
		(host as unknown as IWorkbenchTestHarness).setEditorMaximized = maximized => maximizedStates.push(maximized);

		rememberAttachedEditorMaximizedState.call(host as unknown as IWorkbenchTestHarness);
		setAuxiliaryBarHidden.call(host, true);
		setAuxiliaryBarHidden.call(host, false);

		host._editorMaximized = false;
		restoreAttachedEditorMaximizedState.call(host as unknown as IWorkbenchTestHarness);

		assert.deepStrictEqual(maximizedStates, []);
		assert.strictEqual(host._restoreAttachedEditorMaximizedOnShow, false);
	});

	// --- Docked auxiliary bar visibility -----------------------------------

	test('docked auxiliary bar takes its toggle width from the Sessions pane', () => {
		const host = createHost({ single: true, editorWidth: 640, dockedWidth: 280, partVisibility: { editor: true, auxiliaryBar: false } });

		setAuxiliaryBarHidden.call(host, false);
		setAuxiliaryBarHidden.call(host, true);

		assert.deepStrictEqual({
			auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
			resizes: host.resizes,
		}, {
			auxiliaryBarVisible: false,
			resizes: [
				{ width: 920, height: 800 },
				{ width: 640, height: 800 },
			],
		});
	});

	test('docked auxiliary bar takes its toggle width from Sessions even when the editor is wide', () => {
		const host = createHost({ single: true, editorWidth: 900, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: false } });

		setAuxiliaryBarHidden.call(host, false);
		setAuxiliaryBarHidden.call(host, true);

		assert.deepStrictEqual(host.resizes, [
			{ width: 1200, height: 800 },
			{ width: 900, height: 800 },
		]);
	});

	test('[reload] restoring docked auxiliary bar uses the persisted combined width without cumulative growth', () => {
		const host = createHost({
			single: true,
			editorWidth: 900,
			dockedWidth: 300,
			suppressionCount: 1,
			partVisibility: { editor: true, auxiliaryBar: false }
		});
		host._savedPartSizes.editor = 600;

		setAuxiliaryBarHidden.call(host, false);
		setAuxiliaryBarHiddenForResize.call(host, true);
		setAuxiliaryBarHidden.call(host, false);

		assert.deepStrictEqual(host.resizes, [
			{ width: 900, height: 800 },
			{ width: 900, height: 800 },
		]);
	});

	test('docked auxiliary bar returns its full width to Sessions when hidden', () => {
		const host = createHost({ single: true, editorWidth: 420, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: false } });

		setAuxiliaryBarHidden.call(host, false);
		setAuxiliaryBarHidden.call(host, true);

		assert.deepStrictEqual(host.resizes, [
			{ width: 720, height: 800 },
			{ width: 420, height: 800 },
		]);
	});

	test('docked auxiliary bar hide reveals hidden editor content', () => {
		const editorHiddenCalls: boolean[] = [];
		const host = createHost({ single: true, partVisibility: { editor: false, auxiliaryBar: true } });
		host.setEditorHidden = hidden => {
			editorHiddenCalls.push(hidden);
			host.partVisibility.editor = !hidden;
		};

		setAuxiliaryBarHidden.call(host, true);

		assert.deepStrictEqual({
			editorHiddenCalls,
			editorVisible: host.partVisibility.editor,
			auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
			gridVisible: host.visibilityChanges,
		}, {
			editorHiddenCalls: [false],
			editorVisible: true,
			auxiliaryBarVisible: false,
			gridVisible: [true],
		});
	});

	test('docked auxiliary bar hide does not reveal editor while side pane toggle is suppressed', () => {
		const editorHiddenCalls: boolean[] = [];
		const host = createHost({ single: true, suppressionCount: 1, partVisibility: { editor: false, auxiliaryBar: true } });
		host.setEditorHidden = hidden => {
			editorHiddenCalls.push(hidden);
			host.partVisibility.editor = !hidden;
		};

		setAuxiliaryBarHidden.call(host, true);

		assert.deepStrictEqual({
			editorHiddenCalls,
			editorVisible: host.partVisibility.editor,
			auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
			gridVisible: host.visibilityChanges,
		}, {
			editorHiddenCalls: [],
			editorVisible: false,
			auxiliaryBarVisible: false,
			gridVisible: [false],
		});
	});

	test('docked auxiliary bar show does not force-open an empty (gated-off) container', () => {
		const openedContainers: string[] = [];
		// The resolved default container is `hideIfEmpty` with no active views
		// (e.g. Changes/Files gated off for a workspace-less quick chat).
		const host = createHost({
			single: true,
			partVisibility: { editor: true, auxiliaryBar: false },
			viewDescriptorService: {
				getDefaultViewContainer: () => ({ id: 'empty.container' }),
				getViewContainerById: () => ({ hideIfEmpty: true }),
				getViewContainerModel: () => ({ activeViewDescriptors: [] }),
			},
		});
		(host as unknown as { paneCompositeService: { openPaneComposite(id: string): void } }).paneCompositeService.openPaneComposite = (id: string) => { openedContainers.push(id); };

		setAuxiliaryBarHidden.call(host, false);

		assert.deepStrictEqual(openedContainers, [], 'must not force-open an empty container in docked mode');
	});

	test('docked auxiliary bar show opens a container that has active views', () => {
		const openedContainers: string[] = [];
		// The resolved default container has an active view descriptor, so it has
		// content to render and must be opened normally.
		const host = createHost({
			single: true,
			partVisibility: { editor: true, auxiliaryBar: false },
			viewDescriptorService: {
				getDefaultViewContainer: () => ({ id: 'active.container' }),
				getViewContainerById: () => ({ hideIfEmpty: true }),
				getViewContainerModel: () => ({ activeViewDescriptors: [{}] }),
			},
		});
		(host as unknown as { paneCompositeService: { openPaneComposite(id: string): void } }).paneCompositeService.openPaneComposite = (id: string) => { openedContainers.push(id); };

		setAuxiliaryBarHidden.call(host, false);

		assert.deepStrictEqual(openedContainers, ['active.container'], 'must open a container that has active views');
	});

	// --- Editor maximize/un-maximize ---------------------------------------

	interface IMaximizeTestHarness {
		partVisibility: { sidebar: boolean; auxiliaryBar: boolean; editor: boolean; panel: boolean; sessions: boolean };
		readonly editorPartView: object;
		readonly workbenchGrid: {
			getViewSize(view: object): IViewSize;
			resizeView(view: object, size: IViewSize): void;
		};
		_editorMaximized: boolean;
		_editorLastNonMaximizedVisibility?: object;
		_editorLastNonMaximizedSize?: IViewSize;
		readonly _onDidChangeEditorMaximized: { fire(): void };
		_layoutSidePane(): void;
		setEditorHidden(hidden: boolean): void;
		setSideBarHidden(hidden: boolean): void;
		setSessionsHidden(hidden: boolean): void;
		setAuxiliaryBarHidden(hidden: boolean): void;
	}

	test('restores editor size and auxiliary bar visibility when un-maximizing', () => {
		const editorPartView = {};
		const resizes: IViewSize[] = [];
		const auxiliaryBarHiddenCalls: boolean[] = [];
		let editorSize = { width: 700, height: 800 };
		const harness: IMaximizeTestHarness = {
			partVisibility: { sidebar: true, auxiliaryBar: false, editor: true, panel: false, sessions: true },
			editorPartView,
			workbenchGrid: {
				getViewSize: () => editorSize,
				resizeView: (_view, size) => { resizes.push(size); editorSize = size; },
			},
			_editorMaximized: false,
			_onDidChangeEditorMaximized: { fire: () => { } },
			_layoutSidePane: () => { },
			setEditorHidden: () => { },
			setSideBarHidden: hidden => { harness.partVisibility.sidebar = !hidden; },
			setSessionsHidden: hidden => { harness.partVisibility.sessions = !hidden; },
			setAuxiliaryBarHidden: hidden => { auxiliaryBarHiddenCalls.push(hidden); harness.partVisibility.auxiliaryBar = !hidden; },
		};

		setEditorMaximized.call(harness, true);

		// While maximized the layout controller forces the Changes view (auxiliary
		// bar) visible, which shrinks the editor.
		harness.partVisibility.auxiliaryBar = true;
		editorSize = { width: 500, height: 800 };

		setEditorMaximized.call(harness, false);

		assert.deepStrictEqual({
			auxiliaryBarHiddenCalls,
			resizes,
			auxiliaryBarVisible: harness.partVisibility.auxiliaryBar,
			sidebarVisible: harness.partVisibility.sidebar,
			sessionsVisible: harness.partVisibility.sessions,
		}, {
			auxiliaryBarHiddenCalls: [true],
			resizes: [{ width: 700, height: 800 }],
			auxiliaryBarVisible: false,
			sidebarVisible: true,
			sessionsVisible: true,
		});
	});

	// --- Panel visibility ---------------------------------------------------

	test('single-pane restores the bottom panel height after navigating through Quick Chat', () => {
		const singlePane = createHost({ single: true, panelHeight: 520, panelHeightOnEditorShow: 77, partVisibility: { panel: true, editor: true, auxiliaryBar: true } });

		singlePane._editorPartAutoVisibilitySuppressionCount = 1;
		setPanelHidden.call(singlePane, true);
		setEditorHidden.call(singlePane, true);
		singlePane.setAuxiliaryBarHidden(true);
		singlePane._editorPartAutoVisibilitySuppressionCount = 0;
		setPanelHidden.call(singlePane, false);
		singlePane.setAuxiliaryBarHidden(false);
		setEditorHidden.call(singlePane, false);

		assert.strictEqual(singlePane.workbenchGrid.getViewSize(singlePane.panelPartView).height, 520);
	});

	// --- Custom view grid ---------------------------------------------------

	test('showing a custom view hides the sessions grid, editor, side panel and panel', () => {
		const host = createHost({ partVisibility: { editor: true, auxiliaryBar: true, panel: true, sessions: true } });
		const descriptor = {};

		applyCustomViewGridVisibility.call(host, descriptor);

		assert.deepStrictEqual({
			renderedCustomViews: host.renderedCustomViews,
			customViewGridVisible: isVisible.call(host, Parts.CUSTOM_VIEW_GRID_PART),
			sessions: isVisible.call(host, Parts.SESSIONS_PART),
			editor: isVisible.call(host, Parts.EDITOR_PART),
			auxiliaryBar: isVisible.call(host, Parts.AUXILIARYBAR_PART),
			panel: isVisible.call(host, Parts.PANEL_PART),
			sideBar: isVisible.call(host, Parts.SIDEBAR_PART),
			gridNodes: {
				customViewGrid: host.gridVisibility.get(host.customViewGridPartView),
				sessions: host.gridVisibility.get(host.sessionsPartView),
				editor: host.gridVisibility.get(host.editorPartView),
				panel: host.gridVisibility.get(host.panelPartView),
			},
			events: host.events,
			focusedParts: host.focusedParts,
		}, {
			renderedCustomViews: [descriptor],
			customViewGridVisible: true,
			sessions: false,
			editor: false,
			auxiliaryBar: false,
			panel: false,
			sideBar: true,
			gridNodes: {
				customViewGrid: true,
				sessions: false,
				editor: false,
				panel: false,
			},
			events: [
				{ partId: Parts.CUSTOM_VIEW_GRID_PART, visible: true },
				{ partId: Parts.SESSIONS_PART, visible: false },
				{ partId: Parts.EDITOR_PART, visible: false },
				{ partId: Parts.AUXILIARYBAR_PART, visible: false },
				{ partId: Parts.PANEL_PART, visible: false },
			],
			focusedParts: [Parts.CUSTOM_VIEW_GRID_PART],
		});
	});

	test('hiding the custom view restores the desired part visibility, including changes made while it was shown', () => {
		const host = createHost({ partVisibility: { editor: true, auxiliaryBar: true, panel: false, sessions: true } });

		applyCustomViewGridVisibility.call(host, {});

		// The layout controller reacts to a session switch while the custom view is
		// up: the desired state changes but nothing is rendered.
		setEditorHidden.call(host, true);
		const whileShown = {
			editor: isVisible.call(host, Parts.EDITOR_PART),
			editorNode: host.gridVisibility.get(host.editorPartView),
		};

		applyCustomViewGridVisibility.call(host, undefined);

		assert.deepStrictEqual({
			whileShown,
			customViewGridVisible: isVisible.call(host, Parts.CUSTOM_VIEW_GRID_PART),
			renderedCustomViewCount: host.renderedCustomViews.length,
			lastRenderedCustomView: host.renderedCustomViews[host.renderedCustomViews.length - 1],
			sessions: isVisible.call(host, Parts.SESSIONS_PART),
			editor: isVisible.call(host, Parts.EDITOR_PART),
			auxiliaryBar: isVisible.call(host, Parts.AUXILIARYBAR_PART),
			panel: isVisible.call(host, Parts.PANEL_PART),
			focusedSessions: host.focusedSessions,
		}, {
			whileShown: { editor: false, editorNode: false },
			customViewGridVisible: false,
			renderedCustomViewCount: 2,
			lastRenderedCustomView: undefined,
			sessions: true,
			editor: false,
			auxiliaryBar: true,
			panel: false,
			focusedSessions: 1,
		});
	});

	test('hiding the custom view restores the user-sized side pane', () => {
		const host = createHost({
			editorWidth: 694,
			customViewEditorSize: { width: 300, height: 600 },
			customViewAuxiliaryBarSize: { width: 150, height: 600 },
			partVisibility: { editor: true, auxiliaryBar: true, sessions: true }
		});

		applyCustomViewGridVisibility.call(host, {});
		const sizesWhileShown = {
			editor: host.workbenchGrid.getViewSize(host.editorPartView),
			auxiliaryBar: host.workbenchGrid.getViewSize(host.auxiliaryBarPartView),
		};
		applyCustomViewGridVisibility.call(host, undefined);

		assert.deepStrictEqual({
			sizesWhileShown,
			restoredEditorSize: host.workbenchGrid.getViewSize(host.editorPartView),
			restoredAuxiliaryBarSize: host.workbenchGrid.getViewSize(host.auxiliaryBarPartView),
			resizes: host.resizes,
		}, {
			sizesWhileShown: {
				editor: { width: 300, height: 600 },
				auxiliaryBar: { width: 150, height: 600 },
			},
			restoredEditorSize: { width: 694, height: 600 },
			restoredAuxiliaryBarSize: { width: 300, height: 600 },
			resizes: [
				{ width: 300, height: 600 },
				{ width: 694, height: 600 },
			],
		});
	});

	test('swapping to another custom view re-renders it without touching the layout', () => {
		const host = createHost({ partVisibility: { editor: true, auxiliaryBar: true, sessions: true } });
		const first = {};
		const second = {};

		applyCustomViewGridVisibility.call(host, first);
		const eventsAfterShow = host.events.length;
		applyCustomViewGridVisibility.call(host, second);

		assert.deepStrictEqual({
			renderedCustomViews: host.renderedCustomViews,
			customViewGridVisible: isVisible.call(host, Parts.CUSTOM_VIEW_GRID_PART),
			sessions: isVisible.call(host, Parts.SESSIONS_PART),
			eventsAfterSwap: host.events.length - eventsAfterShow,
		}, {
			renderedCustomViews: [first, second],
			customViewGridVisible: true,
			sessions: false,
			eventsAfterSwap: 0,
		});
	});

	test('tracks the custom view in the phone navigation stack and drops it when leaving phone layout', () => {
		const host = createHost();
		host.layoutPolicy.viewportClass.get = () => 'phone';

		applyCustomViewGridVisibility.call(host, {});
		const onPhone = [...host.mobileNavLayers];

		// Rotating back to a desktop-class viewport must not leave a stale entry behind.
		host.layoutPolicy.viewportClass.get = () => 'desktop';
		updateMobileCustomViewNavigation.call(host);

		assert.deepStrictEqual({ onPhone, afterLeavingPhone: host.mobileNavLayers }, {
			onPhone: ['customView'],
			afterLeavingPhone: [],
		});
	});

	test('the secondary side bar toggle is inert while a custom view is shown', () => {
		const host = createHost({ partVisibility: { auxiliaryBar: true } });

		applyCustomViewGridVisibility.call(host, {});
		toggleSecondarySideBar.call(host);

		assert.strictEqual(host.partVisibility.auxiliaryBar, true);
	});

	test('showing a custom view un-maximizes the editor so the sessions grid owns the row again on hide', () => {
		const host = createHost({ editorMaximize: true, partVisibility: { editor: true, auxiliaryBar: true, sessions: true } });
		setEditorMaximized.call(host as unknown as IMaximizeTestHarness, true);

		applyCustomViewGridVisibility.call(host, {});
		const whileShown = {
			editorMaximized: host._editorMaximized,
			sessions: isVisible.call(host, Parts.SESSIONS_PART),
			customViewGrid: isVisible.call(host, Parts.CUSTOM_VIEW_GRID_PART),
		};

		applyCustomViewGridVisibility.call(host, undefined);

		assert.deepStrictEqual({
			whileShown,
			sessions: isVisible.call(host, Parts.SESSIONS_PART),
			customViewGrid: isVisible.call(host, Parts.CUSTOM_VIEW_GRID_PART),
		}, {
			whileShown: { editorMaximized: false, sessions: false, customViewGrid: true },
			sessions: true,
			customViewGrid: false,
		});
	});

	// --- Persistence gating -------------------------------------------------

	test('does not restore saved desktop part visibility on phone layout', () => {
		let getCalled = false;
		const workbench = createWorkbenchHarness();
		workbench.layoutPolicy.viewportClass.get = () => 'phone';
		const storageService = {
			get: () => {
				getCalled = true;
				return JSON.stringify({ editor: true, auxiliaryBar: true, sidebar: true });
			},
			remove: () => { },
		};

		const restored = loadPartVisibility.call(workbench, storageService);

		assert.deepStrictEqual(restored, {});
		assert.strictEqual(getCalled, false);
	});

	test('restores saved desktop part visibility outside phone layout', () => {
		const workbench = createWorkbenchHarness();
		workbench.layoutPolicy.viewportClass.get = () => 'desktop';
		const storageService = {
			get: () => JSON.stringify({ editor: true, auxiliaryBar: false, sidebar: false }),
			remove: () => { },
		};

		const restored = loadPartVisibility.call(workbench, storageService);

		assert.deepStrictEqual(restored, { editor: true, auxiliaryBar: false, sidebar: false });
	});

	test('does not persist part visibility on phone layout', () => {
		let storeCalled = false;
		const workbench = createWorkbenchHarness();
		workbench.layoutPolicy.viewportClass.get = () => 'phone';
		workbench.storageService.store = () => {
			storeCalled = true;
		};

		savePartVisibility.call(workbench);

		assert.strictEqual(storeCalled, false);
	});

	test('restores saved panel visibility only in single-pane mode', () => {
		function restoredPanel(isSinglePaneLayoutEnabled: boolean): boolean {
			const workbench = createWorkbenchHarness();
			workbench.isSinglePaneLayoutEnabled = isSinglePaneLayoutEnabled;
			workbench.partVisibility.panel = false;
			workbench._loadPartVisibility = () => ({ panel: true });

			applyPersistedPartVisibility.call(workbench);
			return workbench.partVisibility.panel;
		}

		assert.deepStrictEqual(
			{ singlePane: restoredPanel(true), classic: restoredPanel(false) },
			{ singlePane: true, classic: false }
		);
	});

	test('persists panel visibility only in single-pane mode', () => {
		function persistedPanel(isSinglePaneLayoutEnabled: boolean): boolean | undefined {
			const workbench = createWorkbenchHarness();
			workbench.isSinglePaneLayoutEnabled = isSinglePaneLayoutEnabled;
			workbench.partVisibility.panel = true;
			let stored: { panel?: boolean } | undefined;
			workbench.storageService.store = (_key, value) => { stored = JSON.parse(String(value)); };

			savePartVisibility.call(workbench);
			return stored?.panel;
		}

		assert.deepStrictEqual(
			{ singlePane: persistedPanel(true), classic: persistedPanel(false) },
			{ singlePane: true, classic: undefined }
		);
	});
});
