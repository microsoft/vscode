/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SashState } from '../../../base/browser/ui/sash/sash.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { Part } from '../../../workbench/browser/part.js';
import { IPartVisibilityChangeEvent, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { DockedAuxiliaryBarController, IDockedAuxiliaryBarHost } from '../../browser/dockedAuxiliaryBarController.js';
import { Workbench } from '../../browser/workbench.js';

interface IWorkbenchTestHarness {
	partVisibility: {
		sidebar: boolean;
		auxiliaryBar: boolean;
		editor: boolean;
		panel: boolean;
		sessions: boolean;
	};
	layoutPolicy: {
		viewportClass: {
			get(): 'phone' | 'tablet' | 'desktop';
		};
	};
	storageService: {
		store(...args: unknown[]): void;
	};
	readonly _dockDetailPanel?: boolean;
	_editorPartAutoVisibilitySuppressionCount: number;
	_editorMaximized: boolean;
	_restoreAttachedEditorMaximizedOnShow: boolean;
	setEditorMaximized(maximized: boolean): void;
	setAuxiliaryBarHidden(hidden: boolean): void;
	setEditorHidden(hidden: boolean): void;
	suppressEditorPartAutoVisibility(): { dispose(): void };
	areAllGroupsInMainPartEmpty(): boolean;
	rememberAttachedEditorMaximizedState(): void;
	_savePartVisibility(): void;
}

suite('Sessions - Workbench', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const rememberAttachedEditorMaximizedState = Reflect.get(Workbench.prototype, 'rememberAttachedEditorMaximizedState') as (this: IWorkbenchTestHarness) => void;
	const restoreAttachedEditorMaximizedState = Reflect.get(Workbench.prototype, 'restoreAttachedEditorMaximizedState') as (this: IWorkbenchTestHarness) => void;
	const setAuxiliaryBarHidden = Reflect.get(Workbench.prototype, 'setAuxiliaryBarHidden') as (this: IWorkbenchTestHarness, hidden: boolean) => void;
	const isAuxViewContainerActive = Reflect.get(Workbench.prototype, '_isAuxViewContainerActive') as (this: { viewDescriptorService: unknown }, containerId: string) => boolean;
	const handleDidCloseEditor = Reflect.get(Workbench.prototype, 'handleDidCloseEditor') as (this: IWorkbenchTestHarness) => void;
	const areAllGroupsInMainPartEmpty = Reflect.get(Workbench.prototype, 'areAllGroupsInMainPartEmpty') as (this: IWorkbenchTestHarness) => boolean;
	const loadPartVisibility = Reflect.get(Workbench.prototype, '_loadPartVisibility') as (this: IWorkbenchTestHarness, storageService: { get(): string | undefined; remove(): void }) => { editor?: boolean; auxiliaryBar?: boolean; sidebar?: boolean };
	const savePartVisibility = Reflect.get(Workbench.prototype, '_savePartVisibility') as (this: IWorkbenchTestHarness) => void;
	const setSideBarHidden = Reflect.get(Workbench.prototype, 'setSideBarHidden') as (this: ISideBarResizeTestHarness, hidden: boolean) => void;
	const resizeDockedEditorAfterSidebarChange = Reflect.get(Workbench.prototype, '_resizeDockedEditorAfterSidebarChange') as (this: ISideBarResizeTestHarness, size: { width: number; height: number }) => void;
	const growDockedDetailAfterSidebarChange = Reflect.get(Workbench.prototype, '_growDockedDetailAfterSidebarChange') as (this: ISideBarResizeTestHarness, width: number) => void;
	const setEditorHidden = Reflect.get(Workbench.prototype, 'setEditorHidden') as (this: IEditorSplitTestHarness, hidden: boolean) => void;
	const suppressEditorPartAutoVisibility = Workbench.prototype.suppressEditorPartAutoVisibility as (this: IWorkbenchTestHarness) => { dispose(): void };
	const applyEditorSplitSize = Reflect.get(Workbench.prototype, '_applyEditorSplitSize') as (this: IEditorSplitTestHarness, mainAreaWidth: number) => void;
	const syncDockedEditorVisibility = Reflect.get(Workbench.prototype, '_syncDockedEditorVisibility') as (this: IEditorSplitTestHarness, nodeWidth: number) => void;
	const syncDockedEditorVisibilityFromGrid = Reflect.get(Workbench.prototype, '_syncDockedEditorVisibilityFromGrid') as (this: IEditorSplitTestHarness) => void;
	const handleDockedEditorPartLayout = Workbench.prototype.handleDockedEditorPartLayout as (this: IEditorSplitTestHarness, nodeWidth: number) => void;
	const handleWillOpenEditor = Reflect.get(Workbench.prototype, '_handleWillOpenEditor') as (this: IWillOpenTestHarness, e: { groupId: number; editor: { typeId: string } }) => void;

	interface IWillOpenTestHarness {
		_editorPartAutoVisibilitySuppressionCount: number;
		partVisibility: { editor: boolean };
		editorGroupService: { mainPart: { groups: { id: number }[] } };
		setEditorHidden(hidden: boolean, explicit?: boolean): void;
		restoreAttachedEditorMaximizedState(): void;
	}

	function createWillOpenHarness(overrides?: Partial<IWillOpenTestHarness>): { harness: IWillOpenTestHarness; setEditorHiddenCalls: { hidden: boolean; explicit?: boolean }[] } {
		const setEditorHiddenCalls: { hidden: boolean; explicit?: boolean }[] = [];
		const harness: IWillOpenTestHarness = {
			_editorPartAutoVisibilitySuppressionCount: 0,
			partVisibility: { editor: false },
			editorGroupService: { mainPart: { groups: [{ id: 1 }] } },
			setEditorHidden: (hidden, explicit) => setEditorHiddenCalls.push({ hidden, explicit }),
			restoreAttachedEditorMaximizedState: () => { },
			...overrides,
		};
		return { harness, setEditorHiddenCalls };
	}


	interface IEditorSplitTestHarness {
		readonly editorPartView: object;
		readonly sessionsPartView: object;
		readonly mainContainer: { classList: { toggle(name: string, force: boolean): void } };
		readonly _dockDetailPanel: boolean;
		readonly _dockedAuxBar?: { layout(): void };
		readonly _onDidChangePartVisibility: { fire(e: IPartVisibilityChangeEvent): void };
		readonly workbenchGrid: {
			getViewSize(view: object): { width: number; height: number };
			setViewVisible(view: object, visible: boolean): void;
			resizeView(view: object, size: { width: number; height: number }): void;
		};
		readonly resizes: { width: number; height: number }[];
		readonly visibilityChanges: boolean[];
		partVisibility: { editor: boolean; auxiliaryBar: boolean };
		_editorMaximized: boolean;
		_hasAppliedInitialEditorSplit: boolean;
		_dockedAuxiliaryBarWidth: number;
		_dockedEditorSizeBeforeHide?: { width: number; height: number };
		_editorSizeGrownForSidebarHide?: { width: number; height: number };
		_detailWidthGrownForSidebarHide?: number;
		_editorRevealedExplicitly?: boolean;
		_syncingDockedEditorVisibility: boolean;
		_syncDockedEditorVisibility(nodeWidth: number): void;
		setEditorMaximized(maximized: boolean): void;
		_applyEditorSplitSize(mainAreaWidth: number): void;
		handleContainerDidLayout(): void;
		_savePartVisibility(): void;
	}

	interface ISideBarResizeTestHarness {
		readonly sideBarPartView: object;
		readonly editorPartView: object;
		readonly mainContainer: { classList: { toggle(name: string, force: boolean): void } };
		readonly _dockDetailPanel: boolean;
		readonly _dockedAuxBar?: { layout(): void };
		readonly workbenchGrid: {
			getViewSize(view: object): { width: number; height: number };
			setViewVisible(view: object, visible: boolean): void;
			resizeView(view: object, size: { width: number; height: number }): void;
		};
		readonly paneCompositeService: {
			getActivePaneComposite(...args: unknown[]): undefined;
			hideActivePaneComposite(...args: unknown[]): void;
			getLastActivePaneCompositeId(...args: unknown[]): string | undefined;
			openPaneComposite(...args: unknown[]): void;
		};
		readonly viewDescriptorService: {
			getDefaultViewContainer(...args: unknown[]): { id: string } | undefined;
		};
		readonly resizes: { width: number; height: number }[];
		readonly visibilityChanges: boolean[];
		partVisibility: { sidebar: boolean; editor: boolean; auxiliaryBar: boolean };
		_editorSizeGrownForSidebarHide?: { width: number; height: number };
		_detailWidthGrownForSidebarHide?: number;
		_dockedAuxiliaryBarWidth: number;
		_syncingDockedEditorVisibility: boolean;
		_resizeDockedEditorAfterSidebarChange(size: { width: number; height: number }): void;
		_growDockedDetailAfterSidebarChange(width: number): void;
		layoutMobileSidebar(): void;
		_savePartVisibility(): void;
	}

	function createSideBarResizeHarness(dockDetailPanel: boolean): ISideBarResizeTestHarness {
		const sideBarPartView = {};
		const editorPartView = {};
		const resizes: { width: number; height: number }[] = [];
		const visibilityChanges: boolean[] = [];
		const viewSizes = new Map<object, { width: number; height: number }>([
			[sideBarPartView, { width: 280, height: 800 }],
			[editorPartView, { width: 620, height: 800 }],
		]);
		return {
			sideBarPartView,
			editorPartView,
			mainContainer: { classList: { toggle: () => { } } },
			_dockDetailPanel: dockDetailPanel,
			_dockedAuxBar: { layout: () => { } },
			workbenchGrid: {
				getViewSize: view => viewSizes.get(view) ?? { width: 0, height: 0 },
				setViewVisible: (_view, visible) => visibilityChanges.push(visible),
				resizeView: (view, size) => {
					resizes.push(size);
					viewSizes.set(view, size);
				},
			},
			paneCompositeService: {
				getActivePaneComposite: () => undefined,
				hideActivePaneComposite: () => { },
				getLastActivePaneCompositeId: () => undefined,
				openPaneComposite: () => { },
			},
			viewDescriptorService: {
				getDefaultViewContainer: () => undefined,
			},
			resizes,
			visibilityChanges,
			partVisibility: { sidebar: true, editor: true, auxiliaryBar: true },
			_dockedAuxiliaryBarWidth: 300,
			_syncingDockedEditorVisibility: false,
			_resizeDockedEditorAfterSidebarChange: resizeDockedEditorAfterSidebarChange,
			_growDockedDetailAfterSidebarChange: growDockedDetailAfterSidebarChange,
			layoutMobileSidebar: () => { },
			_savePartVisibility: () => { },
		};
	}

	function createEditorSplitHarness(sessionsWidth: number, overrides?: Partial<IEditorSplitTestHarness>, editorWidth = 0): IEditorSplitTestHarness {
		const editorPartView = {};
		const sessionsPartView = {};
		const resizes: { width: number; height: number }[] = [];
		const visibilityChanges: boolean[] = [];
		const editorSize = { width: editorWidth, height: 800 };
		return {
			editorPartView,
			sessionsPartView,
			mainContainer: { classList: { toggle: () => { } } },
			_dockDetailPanel: false,
			_onDidChangePartVisibility: { fire: () => { } },
			workbenchGrid: {
				getViewSize: view => view === sessionsPartView ? { width: sessionsWidth, height: 800 } : { ...editorSize },
				setViewVisible: (_view, visible) => visibilityChanges.push(visible),
				resizeView: (_view, size) => {
					resizes.push(size);
					editorSize.width = size.width;
				},
			},
			resizes,
			visibilityChanges,
			partVisibility: { editor: false, auxiliaryBar: true },
			_editorMaximized: false,
			_hasAppliedInitialEditorSplit: false,
			_dockedAuxiliaryBarWidth: 300,
			_syncingDockedEditorVisibility: false,
			_syncDockedEditorVisibility: syncDockedEditorVisibility,
			setEditorMaximized: () => { },
			_applyEditorSplitSize: applyEditorSplitSize,
			handleContainerDidLayout: () => { },
			_savePartVisibility: () => { },
			...overrides,
		};
	}

	test('applies an even editor split the first time the editor is revealed', () => {
		const workbench = createEditorSplitHarness(1000);

		setEditorHidden.call(workbench, false);

		assert.deepStrictEqual({
			editorVisible: workbench.partVisibility.editor,
			appliedSplit: workbench._hasAppliedInitialEditorSplit,
			visibilityChanges: workbench.visibilityChanges,
			resizes: workbench.resizes,
		}, {
			editorVisible: true,
			appliedSplit: true,
			visibilityChanges: [true],
			resizes: [{ width: 500, height: 800 }],
		});
	});

	test('docked sidebar hide grows the editor by the freed sidebar width and show restores it', () => {
		let layoutCount = 0;
		const workbench = createSideBarResizeHarness(true);
		(workbench as ISideBarResizeTestHarness & { _dockedAuxBar: { layout(): void } })._dockedAuxBar = { layout: () => layoutCount++ };

		setSideBarHidden.call(workbench, true);
		setSideBarHidden.call(workbench, false);

		assert.deepStrictEqual({
			sidebarVisible: workbench.partVisibility.sidebar,
			visibilityChanges: workbench.visibilityChanges,
			resizes: workbench.resizes,
			layoutCount,
			snapshot: workbench._editorSizeGrownForSidebarHide,
		}, {
			sidebarVisible: true,
			visibilityChanges: [false, true],
			resizes: [
				{ width: 900, height: 800 },
				{ width: 620, height: 800 },
			],
			layoutCount: 2,
			snapshot: undefined,
		});
	});

	test('standard layout sidebar hide does not grow the editor', () => {
		const workbench = createSideBarResizeHarness(false);

		setSideBarHidden.call(workbench, true);

		assert.deepStrictEqual({
			sidebarVisible: workbench.partVisibility.sidebar,
			visibilityChanges: workbench.visibilityChanges,
			resizes: workbench.resizes,
		}, {
			sidebarVisible: false,
			visibilityChanges: [false],
			resizes: [],
		});
	});

	test('docked sidebar hide grows the detail panel (not the editor node) when the editor is hidden and show restores it', () => {
		let layoutCount = 0;
		const workbench = createSideBarResizeHarness(true);
		workbench.partVisibility.editor = false;
		workbench._dockedAuxiliaryBarWidth = 300;
		(workbench as ISideBarResizeTestHarness & { _dockedAuxBar: { layout(): void } })._dockedAuxBar = { layout: () => layoutCount++ };

		setSideBarHidden.call(workbench, true);
		const afterHide = {
			editorVisible: workbench.partVisibility.editor,
			detailWidth: workbench._dockedAuxiliaryBarWidth,
			resizes: [...workbench.resizes],
			detailSnapshot: workbench._detailWidthGrownForSidebarHide,
			editorSnapshot: workbench._editorSizeGrownForSidebarHide,
		};

		setSideBarHidden.call(workbench, false);

		assert.deepStrictEqual({
			afterHide,
			editorVisible: workbench.partVisibility.editor,
			detailWidth: workbench._dockedAuxiliaryBarWidth,
			resizes: workbench.resizes,
			detailSnapshot: workbench._detailWidthGrownForSidebarHide,
			layoutCount,
		}, {
			afterHide: {
				editorVisible: false,
				detailWidth: 580,
				resizes: [{ width: 580, height: 800 }],
				detailSnapshot: 300,
				editorSnapshot: undefined,
			},
			editorVisible: false,
			detailWidth: 300,
			resizes: [
				{ width: 580, height: 800 },
				{ width: 300, height: 800 },
			],
			detailSnapshot: undefined,
			layoutCount: 2,
		});
	});

	test('does not re-apply the even split on later editor reveals', () => {
		const workbench = createEditorSplitHarness(1000, { _hasAppliedInitialEditorSplit: true });

		setEditorHidden.call(workbench, false);

		assert.deepStrictEqual({
			editorVisible: workbench.partVisibility.editor,
			visibilityChanges: workbench.visibilityChanges,
			resizes: workbench.resizes,
		}, {
			editorVisible: true,
			visibilityChanges: [true],
			resizes: [],
		});
	});

	test('clamps the even editor split to a minimum width', () => {
		const workbench = createEditorSplitHarness(400);

		setEditorHidden.call(workbench, false);

		assert.deepStrictEqual(workbench.resizes, [{ width: 300, height: 800 }]);
	});

	test('relayouts the docked detail panel when the editor visibility changes', () => {
		let layoutCount = 0;
		const workbench = createEditorSplitHarness(1000, { _hasAppliedInitialEditorSplit: true });
		(workbench as IEditorSplitTestHarness & { _dockDetailPanel: boolean })._dockDetailPanel = true;
		(workbench as IEditorSplitTestHarness & { _dockedAuxBar: { layout(): void } })._dockedAuxBar = { layout: () => layoutCount++ };

		setEditorHidden.call(workbench, false);
		setEditorHidden.call(workbench, true);

		assert.deepStrictEqual({
			layoutCount,
			visibilityChanges: workbench.visibilityChanges,
		}, {
			layoutCount: 2,
			visibilityChanges: [true, true],
		});
	});

	test('fires editor visibility changes when docked editor content is hidden or shown', () => {
		const events: IPartVisibilityChangeEvent[] = [];
		const workbench = createEditorSplitHarness(1000, {
			partVisibility: { editor: true, auxiliaryBar: true },
			_hasAppliedInitialEditorSplit: true,
			_dockDetailPanel: true,
			_onDidChangePartVisibility: { fire: e => events.push(e) },
		});

		setEditorHidden.call(workbench, true);
		setEditorHidden.call(workbench, false);

		assert.deepStrictEqual(events, [
			{ partId: Parts.EDITOR_PART, visible: false },
			{ partId: Parts.EDITOR_PART, visible: true },
		]);
	});

	test('shrinks the docked editor node to the detail width when hiding the editor', () => {
		const workbench = createEditorSplitHarness(1000, {
			partVisibility: { editor: true, auxiliaryBar: true },
			_hasAppliedInitialEditorSplit: true,
			_dockDetailPanel: true,
			_dockedAuxiliaryBarWidth: 320,
		}, 900);

		setEditorHidden.call(workbench, true);

		assert.deepStrictEqual({
			editorVisible: workbench.partVisibility.editor,
			visibilityChanges: workbench.visibilityChanges,
			resizes: workbench.resizes,
		}, {
			editorVisible: false,
			visibilityChanges: [true],
			resizes: [{ width: 320, height: 800 }],
		});
	});

	test('clears stale sidebar-grow snapshots when hiding the editor with the detail visible', () => {
		const workbench = createEditorSplitHarness(1000, {
			partVisibility: { editor: true, auxiliaryBar: true },
			_hasAppliedInitialEditorSplit: true,
			_dockDetailPanel: true,
			_dockedAuxiliaryBarWidth: 320,
			// Captured while the editor was visible and the sessions list was hidden.
			_editorSizeGrownForSidebarHide: { width: 900, height: 800 },
			_detailWidthGrownForSidebarHide: 500,
		}, 900);

		setEditorHidden.call(workbench, true);

		assert.deepStrictEqual({
			editorVisible: workbench.partVisibility.editor,
			resizes: workbench.resizes,
			editorSizeGrownForSidebarHide: workbench._editorSizeGrownForSidebarHide,
			detailWidthGrownForSidebarHide: workbench._detailWidthGrownForSidebarHide,
		}, {
			editorVisible: false,
			resizes: [{ width: 320, height: 800 }],
			editorSizeGrownForSidebarHide: undefined,
			detailWidthGrownForSidebarHide: undefined,
		});
	});

	test('[Scenario 5] does not reveal a hidden editor when the managed empty Files tab is activated', () => {
		const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false } });

		// Closing the Changes tab activates the managed empty Files placeholder.
		handleWillOpenEditor.call(harness, { groupId: 1, editor: { typeId: 'workbench.editors.agentSessions.emptyFile' } });

		assert.deepStrictEqual(setEditorHiddenCalls, []);
	});

	test('[Scenario 5] reveals a hidden editor when a real editor is opened', () => {
		const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false } });

		handleWillOpenEditor.call(harness, { groupId: 1, editor: { typeId: 'workbench.editors.files.fileEditorInput' } });

		assert.deepStrictEqual(setEditorHiddenCalls, [{ hidden: false, explicit: true }]);
	});

	test('[Scenario 5] does not reveal when the open targets a non-main-part group', () => {
		const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false } });

		handleWillOpenEditor.call(harness, { groupId: 99, editor: { typeId: 'workbench.editors.files.fileEditorInput' } });

		assert.deepStrictEqual(setEditorHiddenCalls, []);
	});

	test('suppresses docked editor reveal sync while hiding the editor', () => {
		const events: IPartVisibilityChangeEvent[] = [];
		const workbench = createEditorSplitHarness(1000, {
			partVisibility: { editor: true, auxiliaryBar: true },
			_hasAppliedInitialEditorSplit: true,
			_dockDetailPanel: true,
			_dockedAuxiliaryBarWidth: 320,
			_onDidChangePartVisibility: { fire: e => events.push(e) },
		}, 900);
		const setViewVisible = workbench.workbenchGrid.setViewVisible;
		workbench.workbenchGrid.setViewVisible = (view, visible) => {
			setViewVisible(view, visible);
			handleDockedEditorPartLayout.call(workbench, 900);
		};

		setEditorHidden.call(workbench, true);

		assert.deepStrictEqual({
			editorVisible: workbench.partVisibility.editor,
			syncing: workbench._syncingDockedEditorVisibility,
			events,
			resizes: workbench.resizes,
			snapshot: workbench._dockedEditorSizeBeforeHide,
		}, {
			editorVisible: false,
			syncing: false,
			events: [{ partId: Parts.EDITOR_PART, visible: false }],
			resizes: [{ width: 320, height: 800 }],
			snapshot: { width: 900, height: 800 },
		});
	});

	test('restores the docked editor node size when showing after hide', () => {
		const workbench = createEditorSplitHarness(1000, {
			partVisibility: { editor: true, auxiliaryBar: true },
			_hasAppliedInitialEditorSplit: true,
			_dockDetailPanel: true,
			_dockedAuxiliaryBarWidth: 320,
		}, 900);

		setEditorHidden.call(workbench, true);
		setEditorHidden.call(workbench, false);

		assert.deepStrictEqual({
			editorVisible: workbench.partVisibility.editor,
			visibilityChanges: workbench.visibilityChanges,
			resizes: workbench.resizes,
			snapshot: workbench._dockedEditorSizeBeforeHide,
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

	test('applies an even split when revealing the docked editor with no captured width even after the initial split', () => {
		const workbench = createEditorSplitHarness(1000, {
			partVisibility: { editor: false, auxiliaryBar: true },
			_hasAppliedInitialEditorSplit: true,
			_dockDetailPanel: true,
			_dockedAuxiliaryBarWidth: 300,
			_dockedAuxBar: { layout: () => { } },
		});

		setEditorHidden.call(workbench, false);

		assert.deepStrictEqual({
			editorVisible: workbench.partVisibility.editor,
			visibilityChanges: workbench.visibilityChanges,
			resizes: workbench.resizes,
		}, {
			editorVisible: true,
			visibilityChanges: [true],
			resizes: [{ width: 500, height: 800 }],
		});
	});

	test('restores a captured docked editor width instead of applying an even split', () => {
		const workbench = createEditorSplitHarness(1000, {
			partVisibility: { editor: false, auxiliaryBar: true },
			_hasAppliedInitialEditorSplit: true,
			_dockDetailPanel: true,
			_dockedAuxiliaryBarWidth: 300,
			_dockedEditorSizeBeforeHide: { width: 720, height: 800 },
			_dockedAuxBar: { layout: () => { } },
		});

		setEditorHidden.call(workbench, false);

		assert.deepStrictEqual({
			editorVisible: workbench.partVisibility.editor,
			visibilityChanges: workbench.visibilityChanges,
			resizes: workbench.resizes,
			snapshot: workbench._dockedEditorSizeBeforeHide,
		}, {
			editorVisible: true,
			visibilityChanges: [true],
			resizes: [{ width: 720, height: 800 }],
			snapshot: undefined,
		});
	});

	test('reopening the whole side pane while the sidebar is collapsed even-splits instead of restoring a cramped width', () => {
		// Simulates toggle-close order (auxiliary bar already hidden, editor about
		// to hide) while the sidebar is collapsed: the editor grid node collapses to
		// a tiny width and a stale sidebar-grow snapshot is present. Closing must not
		// capture the collapsed width, and must clear the stale snapshots so the
		// reopen applies a comfortable even split of the wide main area.
		const workbench = createEditorSplitHarness(1360, {
			partVisibility: { editor: true, auxiliaryBar: false },
			_hasAppliedInitialEditorSplit: true,
			_dockDetailPanel: true,
			_dockedAuxiliaryBarWidth: 300,
			_editorSizeGrownForSidebarHide: { width: 620, height: 800 },
			_detailWidthGrownForSidebarHide: 300,
			_dockedAuxBar: { layout: () => { } },
		}, 40);

		setEditorHidden.call(workbench, true);
		const afterClose = {
			snapshot: workbench._dockedEditorSizeBeforeHide,
			grownEditor: workbench._editorSizeGrownForSidebarHide,
			grownDetail: workbench._detailWidthGrownForSidebarHide,
			resizes: [...workbench.resizes],
		};

		setEditorHidden.call(workbench, false);

		assert.deepStrictEqual({
			afterClose,
			editorVisible: workbench.partVisibility.editor,
			resizes: workbench.resizes,
			snapshot: workbench._dockedEditorSizeBeforeHide,
		}, {
			afterClose: {
				snapshot: undefined,
				grownEditor: undefined,
				grownDetail: undefined,
				resizes: [],
			},
			editorVisible: true,
			resizes: [{ width: 680, height: 800 }],
			snapshot: undefined,
		});
	});

	test('marks docked editor visible when grid sash reveals editor content', () => {
		const events: IPartVisibilityChangeEvent[] = [];
		let layoutCount = 0;
		let saveCount = 0;
		const classToggles: { name: string; force: boolean }[] = [];
		const workbench = createEditorSplitHarness(1000, {
			_dockDetailPanel: true,
			_dockedAuxiliaryBarWidth: 300,
			_dockedEditorSizeBeforeHide: { width: 900, height: 800 },
			_dockedAuxBar: { layout: () => layoutCount++ },
			_onDidChangePartVisibility: { fire: e => events.push(e) },
			mainContainer: { classList: { toggle: (name, force) => classToggles.push({ name, force }) } },
			_savePartVisibility: () => { saveCount++; },
		}, 305);

		syncDockedEditorVisibilityFromGrid.call(workbench);

		assert.deepStrictEqual({
			editorVisible: workbench.partVisibility.editor,
			events,
			layoutCount,
			saveCount,
			classToggles,
			resizes: workbench.resizes,
			snapshot: workbench._dockedEditorSizeBeforeHide,
		}, {
			editorVisible: true,
			events: [{ partId: Parts.EDITOR_PART, visible: true }],
			layoutCount: 1,
			saveCount: 1,
			classToggles: [{ name: 'nomaineditorarea', force: false }],
			resizes: [],
			snapshot: undefined,
		});
	});

	test('marks docked editor visible from editor part layout width', () => {
		const events: IPartVisibilityChangeEvent[] = [];
		let layoutCount = 0;
		let saveCount = 0;
		const workbench = createEditorSplitHarness(1000, {
			_dockDetailPanel: true,
			_dockedAuxiliaryBarWidth: 300,
			_dockedEditorSizeBeforeHide: { width: 900, height: 800 },
			_dockedAuxBar: { layout: () => layoutCount++ },
			_onDidChangePartVisibility: { fire: e => events.push(e) },
			_savePartVisibility: () => { saveCount++; },
		}, 300);

		handleDockedEditorPartLayout.call(workbench, 305);

		assert.deepStrictEqual({
			editorVisible: workbench.partVisibility.editor,
			events,
			layoutCount,
			saveCount,
			snapshot: workbench._dockedEditorSizeBeforeHide,
		}, {
			editorVisible: true,
			events: [{ partId: Parts.EDITOR_PART, visible: true }],
			layoutCount: 1,
			saveCount: 1,
			snapshot: undefined,
		});
	});

	test('keeps docked editor hidden when editor part layout width leaves only detail width', () => {
		const events: IPartVisibilityChangeEvent[] = [];
		let layoutCount = 0;
		let saveCount = 0;
		const workbench = createEditorSplitHarness(1000, {
			_dockDetailPanel: true,
			_dockedAuxiliaryBarWidth: 300,
			_dockedAuxBar: { layout: () => layoutCount++ },
			_onDidChangePartVisibility: { fire: e => events.push(e) },
			_savePartVisibility: () => { saveCount++; },
		}, 300);

		handleDockedEditorPartLayout.call(workbench, 304);

		assert.deepStrictEqual({
			editorVisible: workbench.partVisibility.editor,
			events,
			layoutCount,
			saveCount,
		}, {
			editorVisible: false,
			events: [],
			layoutCount: 0,
			saveCount: 0,
		});
	});

	test('keeps docked editor hidden when grid sash leaves only detail width', () => {
		const events: IPartVisibilityChangeEvent[] = [];
		let layoutCount = 0;
		let saveCount = 0;
		const workbench = createEditorSplitHarness(1000, {
			_dockDetailPanel: true,
			_dockedAuxiliaryBarWidth: 300,
			_dockedAuxBar: { layout: () => layoutCount++ },
			_onDidChangePartVisibility: { fire: e => events.push(e) },
			_savePartVisibility: () => { saveCount++; },
		}, 300);

		syncDockedEditorVisibilityFromGrid.call(workbench);

		assert.deepStrictEqual({
			editorVisible: workbench.partVisibility.editor,
			events,
			layoutCount,
			saveCount,
		}, {
			editorVisible: false,
			events: [],
			layoutCount: 0,
			saveCount: 0,
		});
	});

	test('hides docked editor when sash squeezes node down to detail width', () => {
		const events: IPartVisibilityChangeEvent[] = [];
		let layoutCount = 0;
		let saveCount = 0;
		const classToggles: { name: string; force: boolean }[] = [];
		const workbench = createEditorSplitHarness(1000, {
			partVisibility: { editor: true, auxiliaryBar: true },
			_dockDetailPanel: true,
			_dockedAuxiliaryBarWidth: 300,
			_dockedAuxBar: { layout: () => layoutCount++ },
			_onDidChangePartVisibility: { fire: e => events.push(e) },
			mainContainer: { classList: { toggle: (name, force) => classToggles.push({ name, force }) } },
			_savePartVisibility: () => { saveCount++; },
		}, 600);

		handleDockedEditorPartLayout.call(workbench, 304);

		assert.deepStrictEqual({
			editorVisible: workbench.partVisibility.editor,
			events,
			layoutCount,
			saveCount,
			classToggles,
		}, {
			editorVisible: false,
			events: [{ partId: Parts.EDITOR_PART, visible: false }],
			layoutCount: 1,
			saveCount: 1,
			classToggles: [{ name: 'nomaineditorarea', force: true }],
		});
	});

	test('does not hide docked editor when node is squeezed but detail is also hidden', () => {
		const events: IPartVisibilityChangeEvent[] = [];
		let layoutCount = 0;
		let saveCount = 0;
		const workbench = createEditorSplitHarness(1000, {
			partVisibility: { editor: true, auxiliaryBar: false },
			_dockDetailPanel: true,
			_dockedAuxiliaryBarWidth: 300,
			_dockedAuxBar: { layout: () => layoutCount++ },
			_onDidChangePartVisibility: { fire: e => events.push(e) },
			_savePartVisibility: () => { saveCount++; },
		}, 600);

		handleDockedEditorPartLayout.call(workbench, 304);

		assert.deepStrictEqual({
			editorVisible: workbench.partVisibility.editor,
			events,
			layoutCount,
			saveCount,
		}, {
			editorVisible: true,
			events: [],
			layoutCount: 0,
			saveCount: 0,
		});
	});

	test('clears stale snapshots and explicit-reveal flag when sash-collapse hides the editor', () => {
		const workbench = createEditorSplitHarness(1000, {
			partVisibility: { editor: true, auxiliaryBar: true },
			_dockDetailPanel: true,
			_dockedAuxiliaryBarWidth: 300,
			_editorSizeGrownForSidebarHide: { width: 800, height: 600 },
			_detailWidthGrownForSidebarHide: 400,
			_editorRevealedExplicitly: true,
			_dockedAuxBar: { layout: () => { } },
			_savePartVisibility: () => { },
		}, 600);

		handleDockedEditorPartLayout.call(workbench, 300);

		assert.deepStrictEqual({
			editorVisible: workbench.partVisibility.editor,
			editorSizeGrownForSidebarHide: workbench._editorSizeGrownForSidebarHide,
			detailWidthGrownForSidebarHide: workbench._detailWidthGrownForSidebarHide,
			editorRevealedExplicitly: workbench._editorRevealedExplicitly,
		}, {
			editorVisible: false,
			editorSizeGrownForSidebarHide: undefined,
			detailWidthGrownForSidebarHide: undefined,
			editorRevealedExplicitly: false,
		});
	});

	test('fills the narrowed docked detail node when editor content is hidden', () => {

		const editorContainer = document.createElement('div');
		const auxiliaryBarContainer = document.createElement('div');
		const layouts: { width: number; height: number; top: number; left: number }[] = [];
		const insets: number[] = [];
		const persistedWidths: number[] = [];
		let editorVisible = true;
		let editorWidth = 800;

		Object.defineProperty(editorContainer, 'clientWidth', { get: () => editorWidth });
		Object.defineProperty(editorContainer, 'clientHeight', { value: 600 });
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
			setEditorContentRightInset: px => insets.push(px),
		};
		const controller = new DockedAuxiliaryBarController(editorContainer, auxiliaryBarPart, host);

		controller.layout();
		editorWidth = 260;
		editorVisible = false;
		controller.layout();

		const sash = Reflect.get(controller, '_sash') as { state: SashState } | undefined;
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
			sashState: SashState.Disabled,
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
			setEditorContentRightInset: px => insets.push(px),
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
			layouts: [{ width: 260, height: 566, top: 34, left: 540 }],
			style: {
				width: '260px',
				height: '566px',
			},
			sashState: SashState.Enabled,
		});

		controller.dispose();
	});

	function createWorkbenchHarness(): IWorkbenchTestHarness {
		return {
			partVisibility: {
				sidebar: true,
				auxiliaryBar: true,
				editor: true,
				panel: false,
				sessions: true,
			},
			layoutPolicy: {
				viewportClass: {
					get: () => 'desktop',
				},
			},
			storageService: {
				store: () => { },
			},
			_editorPartAutoVisibilitySuppressionCount: 0,
			_editorMaximized: false,
			_restoreAttachedEditorMaximizedOnShow: false,
			setEditorMaximized: () => { },
			setAuxiliaryBarHidden: () => { },
			setEditorHidden: () => { },
			suppressEditorPartAutoVisibility,
			areAllGroupsInMainPartEmpty,
			rememberAttachedEditorMaximizedState,
			_savePartVisibility: () => { },
		};
	}

	test('docked last editor close hides the whole side pane under suppression', () => {
		const editorHiddenCalls: { hidden: boolean; suppression: number }[] = [];
		const auxHiddenCalls: { hidden: boolean; suppression: number }[] = [];
		const workbench = createWorkbenchHarness() as IWorkbenchTestHarness & {
			editorGroupService: { mainPart: { groups: readonly { isEmpty: boolean }[] } };
		};
		Object.defineProperty(workbench, '_dockDetailPanel', { get: () => true });
		workbench.editorGroupService = { mainPart: { groups: [{ isEmpty: true }] } };
		workbench.setEditorHidden = hidden => {
			editorHiddenCalls.push({ hidden, suppression: workbench._editorPartAutoVisibilitySuppressionCount });
			workbench.partVisibility.editor = !hidden;
		};
		workbench.setAuxiliaryBarHidden = hidden => {
			auxHiddenCalls.push({ hidden, suppression: workbench._editorPartAutoVisibilitySuppressionCount });
			if (hidden && !workbench.partVisibility.editor && workbench._editorPartAutoVisibilitySuppressionCount === 0) {
				workbench.setEditorHidden(false);
			}
			workbench.partVisibility.auxiliaryBar = !hidden;
		};

		handleDidCloseEditor.call(workbench);

		assert.deepStrictEqual({
			editorHiddenCalls,
			auxHiddenCalls,
			visibility: workbench.partVisibility,
			suppression: workbench._editorPartAutoVisibilitySuppressionCount,
		}, {
			editorHiddenCalls: [{ hidden: true, suppression: 1 }],
			auxHiddenCalls: [{ hidden: true, suppression: 1 }],
			visibility: {
				sidebar: true,
				auxiliaryBar: false,
				editor: false,
				panel: false,
				sessions: true,
			},
			suppression: 0,
		});
	});

	test('docked last editor close hides lingering detail when editor is already hidden', () => {
		const editorHiddenCalls: boolean[] = [];
		const auxHiddenCalls: { hidden: boolean; suppression: number }[] = [];
		const workbench = createWorkbenchHarness() as IWorkbenchTestHarness & {
			editorGroupService: { mainPart: { groups: readonly { isEmpty: boolean }[] } };
		};
		Object.defineProperty(workbench, '_dockDetailPanel', { get: () => true });
		workbench.partVisibility.editor = false;
		workbench.editorGroupService = { mainPart: { groups: [{ isEmpty: true }] } };
		workbench.setEditorHidden = hidden => {
			editorHiddenCalls.push(hidden);
			workbench.partVisibility.editor = !hidden;
		};
		workbench.setAuxiliaryBarHidden = hidden => {
			auxHiddenCalls.push({ hidden, suppression: workbench._editorPartAutoVisibilitySuppressionCount });
			if (hidden && !workbench.partVisibility.editor && workbench._editorPartAutoVisibilitySuppressionCount === 0) {
				workbench.setEditorHidden(false);
			}
			workbench.partVisibility.auxiliaryBar = !hidden;
		};

		handleDidCloseEditor.call(workbench);

		assert.deepStrictEqual({
			editorHiddenCalls,
			auxHiddenCalls,
			editorVisible: workbench.partVisibility.editor,
			auxiliaryBarVisible: workbench.partVisibility.auxiliaryBar,
		}, {
			editorHiddenCalls: [],
			auxHiddenCalls: [{ hidden: true, suppression: 1 }],
			editorVisible: false,
			auxiliaryBarVisible: false,
		});
	});

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
		const workbench = createWorkbenchHarness();
		workbench._editorMaximized = true;
		workbench.setEditorMaximized = maximized => maximizedStates.push(maximized);
		workbench.setAuxiliaryBarHidden = hidden => {
			workbench.partVisibility.auxiliaryBar = !hidden;
		};
		(workbench as IWorkbenchTestHarness & {
			mainContainer: { classList: { toggle(): void } };
			workbenchGrid: { setViewVisible(): void };
			auxiliaryBarPartView: {};
			paneCompositeService: { getActivePaneComposite(): undefined; hideActivePaneComposite(): void; openPaneComposite(): void; getLastActivePaneCompositeId(): undefined };
			viewDescriptorService: { getDefaultViewContainer(): undefined };
		}).mainContainer = { classList: { toggle: () => { } } };
		(workbench as IWorkbenchTestHarness & {
			workbenchGrid: { setViewVisible(): void };
			auxiliaryBarPartView: {};
		}).workbenchGrid = { setViewVisible: () => { } };
		(workbench as IWorkbenchTestHarness & { auxiliaryBarPartView: {} }).auxiliaryBarPartView = {};
		(workbench as IWorkbenchTestHarness & {
			paneCompositeService: { getActivePaneComposite(): undefined; hideActivePaneComposite(): void; openPaneComposite(): void; getLastActivePaneCompositeId(): undefined };
		}).paneCompositeService = {
			getActivePaneComposite: () => undefined,
			hideActivePaneComposite: () => { },
			openPaneComposite: () => { },
			getLastActivePaneCompositeId: () => undefined,
		};
		(workbench as IWorkbenchTestHarness & {
			viewDescriptorService: { getDefaultViewContainer(): undefined };
		}).viewDescriptorService = {
			getDefaultViewContainer: () => undefined,
		};

		rememberAttachedEditorMaximizedState.call(workbench);
		setAuxiliaryBarHidden.call(workbench, true);
		setAuxiliaryBarHidden.call(workbench, false);

		workbench._editorMaximized = false;
		restoreAttachedEditorMaximizedState.call(workbench);

		assert.deepStrictEqual(maximizedStates, []);
		assert.strictEqual(workbench._restoreAttachedEditorMaximizedOnShow, false);
	});

	test('docked auxiliary bar hide reveals hidden editor content', () => {
		const editorHiddenCalls: boolean[] = [];
		const gridVisible: boolean[] = [];
		const workbench = createWorkbenchHarness() as IWorkbenchTestHarness & {
			mainContainer: { classList: { toggle(): void } };
			workbenchGrid: { setViewVisible(_view: object, visible: boolean): void };
			editorPartView: {};
			paneCompositeService: { getActivePaneComposite(): undefined; hideActivePaneComposite(): void; openPaneComposite(): void; getLastActivePaneCompositeId(): undefined };
			viewDescriptorService: { getDefaultViewContainer(): undefined };
			_onDidChangePartVisibility: { fire(_event: IPartVisibilityChangeEvent): void };
			handleContainerDidLayout(): void;
		};
		Object.defineProperty(workbench, '_dockDetailPanel', { get: () => true });
		workbench.partVisibility.editor = false;
		workbench.partVisibility.auxiliaryBar = true;
		workbench.setEditorHidden = hidden => {
			editorHiddenCalls.push(hidden);
			workbench.partVisibility.editor = !hidden;
		};
		workbench.mainContainer = { classList: { toggle: () => { } } };
		workbench.workbenchGrid = { setViewVisible: (_view, visible) => { gridVisible.push(visible); } };
		workbench.editorPartView = {};
		workbench.paneCompositeService = {
			getActivePaneComposite: () => undefined,
			hideActivePaneComposite: () => { },
			openPaneComposite: () => { },
			getLastActivePaneCompositeId: () => undefined,
		};
		workbench.viewDescriptorService = {
			getDefaultViewContainer: () => undefined,
		};
		workbench._onDidChangePartVisibility = { fire: () => { } };
		workbench.handleContainerDidLayout = () => { };

		setAuxiliaryBarHidden.call(workbench, true);

		assert.deepStrictEqual({
			editorHiddenCalls,
			editorVisible: workbench.partVisibility.editor,
			auxiliaryBarVisible: workbench.partVisibility.auxiliaryBar,
			gridVisible,
		}, {
			editorHiddenCalls: [false],
			editorVisible: true,
			auxiliaryBarVisible: false,
			gridVisible: [true],
		});
	});

	test('docked auxiliary bar hide does not reveal editor while side pane toggle is suppressed', () => {
		const editorHiddenCalls: boolean[] = [];
		const gridVisible: boolean[] = [];
		const workbench = createWorkbenchHarness() as IWorkbenchTestHarness & {
			mainContainer: { classList: { toggle(): void } };
			workbenchGrid: { setViewVisible(_view: object, visible: boolean): void };
			editorPartView: {};
			paneCompositeService: { getActivePaneComposite(): undefined; hideActivePaneComposite(): void; openPaneComposite(): void; getLastActivePaneCompositeId(): undefined };
			viewDescriptorService: { getDefaultViewContainer(): undefined };
			_onDidChangePartVisibility: { fire(_event: IPartVisibilityChangeEvent): void };
			handleContainerDidLayout(): void;
		};
		Object.defineProperty(workbench, '_dockDetailPanel', { get: () => true });
		workbench.partVisibility.editor = false;
		workbench.partVisibility.auxiliaryBar = true;
		workbench._editorPartAutoVisibilitySuppressionCount = 1;
		workbench.setEditorHidden = hidden => {
			editorHiddenCalls.push(hidden);
			workbench.partVisibility.editor = !hidden;
		};
		workbench.mainContainer = { classList: { toggle: () => { } } };
		workbench.workbenchGrid = { setViewVisible: (_view, visible) => { gridVisible.push(visible); } };
		workbench.editorPartView = {};
		workbench.paneCompositeService = {
			getActivePaneComposite: () => undefined,
			hideActivePaneComposite: () => { },
			openPaneComposite: () => { },
			getLastActivePaneCompositeId: () => undefined,
		};
		workbench.viewDescriptorService = {
			getDefaultViewContainer: () => undefined,
		};
		workbench._onDidChangePartVisibility = { fire: () => { } };
		workbench.handleContainerDidLayout = () => { };

		setAuxiliaryBarHidden.call(workbench, true);

		assert.deepStrictEqual({
			editorHiddenCalls,
			editorVisible: workbench.partVisibility.editor,
			auxiliaryBarVisible: workbench.partVisibility.auxiliaryBar,
			gridVisible,
		}, {
			editorHiddenCalls: [],
			editorVisible: false,
			auxiliaryBarVisible: false,
			gridVisible: [false],
		});
	});

	test('docked auxiliary bar show does not force-open an empty (gated-off) container', () => {
		const openedContainers: string[] = [];
		const workbench = createWorkbenchHarness() as IWorkbenchTestHarness & {
			mainContainer: { classList: { toggle(): void } };
			workbenchGrid: { setViewVisible(_view: object, visible: boolean): void };
			editorPartView: {};
			paneCompositeService: {
				getActivePaneComposite(): undefined;
				hideActivePaneComposite(): void;
				openPaneComposite(id: string): void;
				getLastActivePaneCompositeId(): string | undefined;
			};
			viewDescriptorService: {
				getDefaultViewContainer(): { id: string };
				getViewContainerById(id: string): { hideIfEmpty: boolean } | null;
				getViewContainerModel(container: object): { activeViewDescriptors: readonly object[] };
			};
			_onDidChangePartVisibility: { fire(_event: IPartVisibilityChangeEvent): void };
			handleContainerDidLayout(): void;
			_isAuxViewContainerActive(containerId: string): boolean;
		};
		Object.defineProperty(workbench, '_dockDetailPanel', { get: () => true });
		workbench.partVisibility.editor = true;
		workbench.partVisibility.auxiliaryBar = false;
		workbench.mainContainer = { classList: { toggle: () => { } } };
		workbench.workbenchGrid = { setViewVisible: () => { } };
		workbench.editorPartView = {};
		workbench.paneCompositeService = {
			getActivePaneComposite: () => undefined,
			hideActivePaneComposite: () => { },
			openPaneComposite: (id: string) => { openedContainers.push(id); },
			getLastActivePaneCompositeId: () => undefined,
		};
		// The resolved default container is `hideIfEmpty` with no active views
		// (e.g. Changes/Files gated off for a workspace-less quick chat).
		workbench.viewDescriptorService = {
			getDefaultViewContainer: () => ({ id: 'empty.container' }),
			getViewContainerById: () => ({ hideIfEmpty: true }),
			getViewContainerModel: () => ({ activeViewDescriptors: [] }),
		};
		workbench._onDidChangePartVisibility = { fire: () => { } };
		workbench.handleContainerDidLayout = () => { };
		workbench._isAuxViewContainerActive = isAuxViewContainerActive;

		setAuxiliaryBarHidden.call(workbench, false);

		assert.deepStrictEqual(openedContainers, [], 'must not force-open an empty container in docked mode');
	});

	test('docked auxiliary bar show opens a container that has active views', () => {
		const openedContainers: string[] = [];
		const workbench = createWorkbenchHarness() as IWorkbenchTestHarness & {
			mainContainer: { classList: { toggle(): void } };
			workbenchGrid: { setViewVisible(_view: object, visible: boolean): void };
			editorPartView: {};
			paneCompositeService: {
				getActivePaneComposite(): undefined;
				hideActivePaneComposite(): void;
				openPaneComposite(id: string): void;
				getLastActivePaneCompositeId(): string | undefined;
			};
			viewDescriptorService: {
				getDefaultViewContainer(): { id: string };
				getViewContainerById(id: string): { hideIfEmpty: boolean } | null;
				getViewContainerModel(container: object): { activeViewDescriptors: readonly object[] };
			};
			_onDidChangePartVisibility: { fire(_event: IPartVisibilityChangeEvent): void };
			handleContainerDidLayout(): void;
			_isAuxViewContainerActive(containerId: string): boolean;
		};
		Object.defineProperty(workbench, '_dockDetailPanel', { get: () => true });
		workbench.partVisibility.editor = true;
		workbench.partVisibility.auxiliaryBar = false;
		workbench.mainContainer = { classList: { toggle: () => { } } };
		workbench.workbenchGrid = { setViewVisible: () => { } };
		workbench.editorPartView = {};
		workbench.paneCompositeService = {
			getActivePaneComposite: () => undefined,
			hideActivePaneComposite: () => { },
			openPaneComposite: (id: string) => { openedContainers.push(id); },
			getLastActivePaneCompositeId: () => undefined,
		};
		// The resolved default container has an active view descriptor, so it has
		// content to render and must be opened normally.
		workbench.viewDescriptorService = {
			getDefaultViewContainer: () => ({ id: 'active.container' }),
			getViewContainerById: () => ({ hideIfEmpty: true }),
			getViewContainerModel: () => ({ activeViewDescriptors: [{}] }),
		};
		workbench._onDidChangePartVisibility = { fire: () => { } };
		workbench.handleContainerDidLayout = () => { };
		workbench._isAuxViewContainerActive = isAuxViewContainerActive;

		setAuxiliaryBarHidden.call(workbench, false);

		assert.deepStrictEqual(openedContainers, ['active.container'], 'must open a container that has active views');
	});

	interface IMaximizeTestHarness {
		partVisibility: { sidebar: boolean; auxiliaryBar: boolean; editor: boolean; panel: boolean; sessions: boolean };
		readonly editorPartView: object;
		readonly workbenchGrid: {
			getViewSize(view: object): { width: number; height: number };
			resizeView(view: object, size: { width: number; height: number }): void;
		};
		_editorMaximized: boolean;
		_editorLastNonMaximizedVisibility?: object;
		_editorLastNonMaximizedSize?: { width: number; height: number };
		readonly _onDidChangeEditorMaximized: { fire(): void };
		setEditorHidden(hidden: boolean): void;
		setSideBarHidden(hidden: boolean): void;
		setSessionsHidden(hidden: boolean): void;
		setAuxiliaryBarHidden(hidden: boolean): void;
	}

	const setEditorMaximized = Reflect.get(Workbench.prototype, 'setEditorMaximized') as (this: IMaximizeTestHarness, maximized: boolean) => void;

	test('restores editor size and auxiliary bar visibility when un-maximizing', () => {
		const editorPartView = {};
		const resizes: { width: number; height: number }[] = [];
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
});
