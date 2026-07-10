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
import { DockedEditorSizeMemento, SinglePaneWorkbench } from '../../browser/singlePaneWorkbench.js';
import { SinglePaneMainEditorPart } from '../../browser/parts/singlePaneEditorPart.js';

interface IViewSize { width: number; height: number }

suite('Sessions - Workbench', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// Real Workbench methods invoked against a prototype-chained fake harness so
	// the protected layout hooks dispatch to the base (grid) or SinglePaneWorkbench
	// (docked) override, exactly as at runtime.
	const setEditorHidden = Reflect.get(Workbench.prototype, 'setEditorHidden') as (this: ITestWorkbench, hidden: boolean, explicit?: boolean) => void;
	const setAuxiliaryBarHidden = Reflect.get(Workbench.prototype, 'setAuxiliaryBarHidden') as (this: ITestWorkbench, hidden: boolean) => void;
	const setSideBarHidden = Reflect.get(Workbench.prototype, 'setSideBarHidden') as (this: ITestWorkbench, hidden: boolean) => void;
	const handleDidCloseEditor = Reflect.get(Workbench.prototype, 'handleDidCloseEditor') as (this: ITestWorkbench) => void;
	const setEditorMaximized = Reflect.get(Workbench.prototype, 'setEditorMaximized') as (this: IMaximizeTestHarness, maximized: boolean) => void;
	const onEditorNodeResized = Reflect.get(SinglePaneWorkbench.prototype, '_onEditorNodeResized') as (this: ITestWorkbench, nodeWidth: number) => void;
	const onGridDidChange = Reflect.get(SinglePaneWorkbench.prototype, '_onGridDidChange') as (this: ITestWorkbench) => void;
	const persistedAuxiliaryBarWidth = Reflect.get(SinglePaneWorkbench.prototype, '_persistedGridViewSize') as (this: ITestWorkbench, view: object, dimension: 'width' | 'height', visible: boolean) => number | undefined;
	const persistedEditorWidth = Reflect.get(SinglePaneWorkbench.prototype, '_persistedEditorWidth') as (this: ITestWorkbench, editorGridWidth: number | undefined) => number | undefined;
	const rememberAttachedEditorMaximizedState = Reflect.get(Workbench.prototype, 'rememberAttachedEditorMaximizedState') as (this: IWorkbenchTestHarness) => void;
	const restoreAttachedEditorMaximizedState = Reflect.get(Workbench.prototype, 'restoreAttachedEditorMaximizedState') as (this: IWorkbenchTestHarness) => void;
	const loadPartVisibility = Reflect.get(Workbench.prototype, '_loadPartVisibility') as (this: IWorkbenchTestHarness, storageService: { get(): string | undefined; remove(): void }) => { editor?: boolean; auxiliaryBar?: boolean; sidebar?: boolean };
	const savePartVisibility = Reflect.get(Workbench.prototype, '_savePartVisibility') as (this: IWorkbenchTestHarness) => void;
	const handleWillOpenEditor = Reflect.get(Workbench.prototype, '_handleWillOpenEditor') as (this: IWillOpenTestHarness, e: { groupId: number; editor: { typeId: string } }) => void;
	const createDesktopGridDescriptor = Reflect.get(Workbench.prototype, 'createDesktopGridDescriptor') as (this: IGridDescriptorTestHarness, width: number, height: number) => { root: { data: readonly unknown[] } };
	const savePartSizes = Reflect.get(Workbench.prototype, '_savePartSizes') as (this: ISavePartSizesTestHarness) => void;

	// --- Harness ------------------------------------------------------------

	interface ITestWorkbench {
		partVisibility: { sidebar: boolean; auxiliaryBar: boolean; editor: boolean; panel: boolean; sessions: boolean };
		auxiliaryBarPartView: object;
		_savedPartSizes: { sidebar?: number; auxiliaryBar?: number; editor?: number; sessions?: number; panel?: number };
		_editorMaximized: boolean;
		_editorRevealedExplicitly: boolean;
		_editorPartAutoVisibilitySuppressionCount: number;
		_restoreAttachedEditorMaximizedOnShow: boolean;
		_hasAppliedInitialEditorSplit: boolean;
		_dockedAuxiliaryBarWidth: number;
		_memento: DockedEditorSizeMemento;
		readonly resizes: IViewSize[];
		readonly visibilityChanges: boolean[];
		readonly events: IPartVisibilityChangeEvent[];
		readonly classToggles: { name: string; force: boolean }[];
		readonly counts: { save: number; layout: number };
		setEditorHidden(hidden: boolean, explicit?: boolean): void;
		setAuxiliaryBarHidden(hidden: boolean): void;
	}

	interface IGridDescriptorTestHarness extends ITestWorkbench {
		_savedPartSizes: { sidebar?: number; auxiliaryBar?: number; editor?: number; sessions?: number; panel?: number };
		layoutPolicy: {
			getPartSizes(width: number, height: number): { sideBarSize: number; auxiliaryBarSize: number; panelSize: number };
			viewportClass: { get(): string };
		};
		titleBarPartView: { minimumHeight: number };
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
		dockedWidth?: number;
		hasAppliedInitialEditorSplit?: boolean;
		suppressionCount?: number;
		editorGroupService?: { mainPart: { groups: readonly { isEmpty: boolean }[] } };
		viewDescriptorService?: {
			getDefaultViewContainer(...args: unknown[]): { id: string } | undefined;
			getViewContainerById?(id: string): { hideIfEmpty: boolean } | null;
			getViewContainerModel?(container: object): { activeViewDescriptors: readonly object[] };
		};
	}

	function createHost(options: IHostOptions = {}): ITestWorkbench {
		const editorPartView = {};
		const sessionsPartView = {};
		const sideBarPartView = {};
		const auxiliaryBarPartView = {};
		const resizes: IViewSize[] = [];
		const visibilityChanges: boolean[] = [];
		const events: IPartVisibilityChangeEvent[] = [];
		const classToggles: { name: string; force: boolean }[] = [];
		const counts = { save: 0, layout: 0 };
		const viewSizes = new Map<object, IViewSize>([
			[editorPartView, { width: options.editorWidth ?? 0, height: 800 }],
			[sessionsPartView, { width: options.sessionsWidth ?? 1000, height: 800 }],
			[sideBarPartView, { width: options.sideBarWidth ?? 280, height: 800 }],
			[auxiliaryBarPartView, { width: 300, height: 800 }],
		]);

		const host = {
			editorPartView,
			sessionsPartView,
			sideBarPartView,
			auxiliaryBarPartView,
			_editorPartContainer: undefined,
			mainContainer: { classList: { toggle: (name: string, force: boolean) => { classToggles.push({ name, force }); } } },
			partVisibility: { sidebar: true, auxiliaryBar: true, editor: false, panel: false, sessions: true, ...options.partVisibility },
			workbenchGrid: {
				width: options.windowWidth ?? 1000,
				getViewSize: (view: object) => viewSizes.get(view) ?? { width: 0, height: 0 },
				setViewVisible: (_view: object, visible: boolean) => { visibilityChanges.push(visible); },
				resizeView: (view: object, size: IViewSize) => { resizes.push(size); viewSizes.set(view, size); },
			},
			_hasAppliedInitialEditorSplit: options.hasAppliedInitialEditorSplit ?? false,
			_savedPartSizes: {},
			_editorRevealedExplicitly: false,
			_editorMaximized: false,
			_editorPartAutoVisibilitySuppressionCount: options.suppressionCount ?? 0,
			_restoreAttachedEditorMaximizedOnShow: false,
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
			_syncingEditorVisibility: false,
			_memento: new DockedEditorSizeMemento(),
			// stubs for the heavy base helpers the hooks call
			_savePartVisibility: () => { counts.save++; },
			_fireDidChangePartVisibility: (partId: Parts, visible: boolean) => { events.push({ partId, visible }); },
			_notifyContainerDidLayout: () => { },
			_layoutDockedAuxBar: () => { counts.layout++; },
			layoutMobileSidebar: () => { },
			setEditorMaximized: () => { },
			// captures
			resizes,
			visibilityChanges,
			events,
			classToggles,
			counts,
		};

		Object.setPrototypeOf(host, options.single ? SinglePaneWorkbench.prototype : Workbench.prototype);
		return host as unknown as ITestWorkbench;
	}

	// --- Editor split / reveal ---------------------------------------------

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

	test('docked sidebar hide grows the editor by the freed sidebar width and show restores it', () => {
		const host = createHost({ single: true, sideBarWidth: 280, editorWidth: 620, partVisibility: { sidebar: true, editor: true, auxiliaryBar: true } });

		setSideBarHidden.call(host, true);
		setSideBarHidden.call(host, false);

		assert.deepStrictEqual({
			sidebarVisible: host.partVisibility.sidebar,
			visibilityChanges: host.visibilityChanges,
			resizes: host.resizes,
			layoutCount: host.counts.layout,
			snapshot: host._memento.editorSizeGrownForSidebarHide,
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

	test('docked sidebar hide grows the detail panel (not the editor node) when the editor is hidden and show restores it', () => {
		const host = createHost({ single: true, sideBarWidth: 280, editorWidth: 620, dockedWidth: 300, partVisibility: { sidebar: true, editor: false, auxiliaryBar: true } });

		setSideBarHidden.call(host, true);
		const afterHide = {
			editorVisible: host.partVisibility.editor,
			detailWidth: host._dockedAuxiliaryBarWidth,
			resizes: [...host.resizes],
			detailSnapshot: host._memento.detailWidthGrownForSidebarHide,
			editorSnapshot: host._memento.editorSizeGrownForSidebarHide,
		};

		setSideBarHidden.call(host, false);

		assert.deepStrictEqual({
			afterHide,
			editorVisible: host.partVisibility.editor,
			detailWidth: host._dockedAuxiliaryBarWidth,
			resizes: host.resizes,
			detailSnapshot: host._memento.detailWidthGrownForSidebarHide,
			layoutCount: host.counts.layout,
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
			[editorView, { width: 864, height: 700 }],
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
			partVisibility: { sidebar: true, auxiliaryBar: false, editor: true, panel: false, sessions: true },
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
		assert.deepStrictEqual({ editor: sizes.editor, sessions: sizes.sessions, auxiliaryBar: sizes.auxiliaryBar }, { editor: 864, sessions: 618, auxiliaryBar: 300 });
	});

	test('_savePartSizes preserves the last valid editor width when the editor is hidden with the detail visible (single-pane)', () => {
		// Regression: with the editor hidden and only the detail showing, the editor
		// grid node is the detail-only node, so the pure editor-content width measures
		// as ~0 (below the minimum). That sub-minimum value must NOT be persisted (it
		// would rebuild the side pane at its 300px minimum on reload); the last valid
		// global width is kept instead.
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
			partVisibility: { sidebar: true, auxiliaryBar: true, editor: false, panel: false, sessions: true },
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

	test('persists the user detail width instead of a temporary sidebar-collapse grow width', () => {
		const host = createHost({ single: true, dockedWidth: 580 });
		host._memento.detailWidthGrownForSidebarHide = 300;

		assert.strictEqual(persistedAuxiliaryBarWidth.call(host, host.auxiliaryBarPartView, 'width', false), 300);
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

	test('clears stale sidebar-grow snapshots when hiding the editor with the detail visible', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, hasAppliedInitialEditorSplit: true, dockedWidth: 320, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });
		// Captured while the editor was visible and the sessions list was hidden.
		host._memento.editorSizeGrownForSidebarHide = { width: 900, height: 800 };
		host._memento.detailWidthGrownForSidebarHide = 500;

		setEditorHidden.call(host, true);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			resizes: host.resizes,
			editorSizeGrownForSidebarHide: host._memento.editorSizeGrownForSidebarHide,
			detailWidthGrownForSidebarHide: host._memento.detailWidthGrownForSidebarHide,
		}, {
			editorVisible: false,
			resizes: [{ width: 320, height: 800 }],
			editorSizeGrownForSidebarHide: undefined,
			detailWidthGrownForSidebarHide: undefined,
		});
	});

	// --- [Scenario 5] editor auto-reveal on open ---------------------------

	interface IWillOpenTestHarness {
		_editorPartAutoVisibilitySuppressionCount: number;
		_editorRevealOnOpenExclusion?: (editor: { typeId: string }) => boolean;
		partVisibility: { editor: boolean };
		editorGroupService: { mainPart: { groups: { id: number }[] } };
		setEditorHidden(hidden: boolean, explicit?: boolean): void;
		restoreAttachedEditorMaximizedState(): void;
	}

	function createWillOpenHarness(overrides?: Partial<IWillOpenTestHarness>): { harness: IWillOpenTestHarness; setEditorHiddenCalls: { hidden: boolean; explicit?: boolean }[] } {
		const setEditorHiddenCalls: { hidden: boolean; explicit?: boolean }[] = [];
		const harness: IWillOpenTestHarness = {
			_editorPartAutoVisibilitySuppressionCount: 0,
			// Mirrors the predicate the single-pane layout controller registers for the
			// managed Changes and Files tabs (their content lives in the detail panel).
			_editorRevealOnOpenExclusion: editor =>
				editor.typeId === 'workbench.editors.agentSessions.emptyFile' ||
				editor.typeId === 'workbench.input.agentSessions.sessionChanges',
			partVisibility: { editor: false },
			editorGroupService: { mainPart: { groups: [{ id: 1 }] } },
			setEditorHidden: (hidden, explicit) => setEditorHiddenCalls.push({ hidden, explicit }),
			restoreAttachedEditorMaximizedState: () => { },
			...overrides,
		};
		return { harness, setEditorHiddenCalls };
	}

	test('[Scenario 5] does not reveal a hidden editor when the managed empty Files tab is activated', () => {
		const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false } });

		// Closing the Changes tab activates the managed empty Files placeholder.
		handleWillOpenEditor.call(harness, { groupId: 1, editor: { typeId: 'workbench.editors.agentSessions.emptyFile' } });

		assert.deepStrictEqual(setEditorHiddenCalls, []);
	});

	test('[Scenario 5] does not reveal a hidden editor when the managed Changes tab is activated', () => {
		const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false } });

		// Clicking the Changes tab activates the managed Changes multi-diff editor.
		handleWillOpenEditor.call(harness, { groupId: 1, editor: { typeId: 'workbench.input.agentSessions.sessionChanges' } });

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

	test('restores the remembered global editor width on reveal instead of the default split (cross-session)', () => {
		// Session A had the side pane at a user-chosen width; another session closed the
		// whole pane. Part sizes are workbench-global, so switching back must restore that
		// width, not reset to the 60% default. The width is remembered in `_savedPartSizes`.
		const host = createHost({ single: true, sessionsWidth: 1000, windowWidth: 1000, hasAppliedInitialEditorSplit: true, dockedWidth: 300, editorWidth: 520, partVisibility: { editor: true, auxiliaryBar: false } });

		// Close the whole side pane (aux already hidden) — this captures 520 as the
		// remembered global width and collapses the node.
		setEditorHidden.call(host, true);
		const rememberedWidth = host._savedPartSizes.editor;
		const resizesBeforeReveal = host.resizes.length;

		// Reveal (switch back): restores the remembered 520, not the 60% split (600).
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

	test('single-pane editor part preferredWidth is 60% of the window (drives sash double-click reset)', () => {
		// The grid resets a view to its `preferredWidth` on sash double-click, so the
		// side-pane↔chat sash double-click resets the side pane to 60% of the window.
		// Scoped to single-pane; the classic editor part has no `preferredWidth` override.
		const preferredWidthGetter = Object.getOwnPropertyDescriptor(SinglePaneMainEditorPart.prototype, 'preferredWidth')!.get!;
		const call = (windowWidth: number) => preferredWidthGetter.call({ layoutService: { mainContainerDimension: { width: windowWidth, height: 800 } } });

		assert.deepStrictEqual({
			wide: call(2000),
			narrow: call(400),
		}, {
			wide: 1200,
			narrow: 300,
		});
	});

	test('applies an even split when revealing the docked editor with no captured width even after the initial split', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, windowWidth: 1000, hasAppliedInitialEditorSplit: true, dockedWidth: 300, partVisibility: { editor: false, auxiliaryBar: true } });

		setEditorHidden.call(host, false);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			visibilityChanges: host.visibilityChanges,
			resizes: host.resizes,
		}, {
			editorVisible: true,
			visibilityChanges: [true],
			resizes: [{ width: 600, height: 800 }],
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

	test('reopening the whole side pane while the sidebar is collapsed even-splits instead of restoring a cramped width', () => {
		// Simulates toggle-close order (auxiliary bar already hidden, editor about
		// to hide) while the sidebar is collapsed: the editor grid node collapses to
		// a tiny width and a stale sidebar-grow snapshot is present. Closing must not
		// capture the collapsed width, and must clear the stale snapshots so the
		// reopen applies a comfortable even split of the wide main area.
		const host = createHost({ single: true, sessionsWidth: 1360, windowWidth: 1360, hasAppliedInitialEditorSplit: true, dockedWidth: 300, editorWidth: 40, partVisibility: { editor: true, auxiliaryBar: false } });
		host._memento.editorSizeGrownForSidebarHide = { width: 620, height: 800 };
		host._memento.detailWidthGrownForSidebarHide = 300;

		setEditorHidden.call(host, true);
		const afterClose = {
			snapshot: host._memento.dockedEditorSizeBeforeHide,
			grownEditor: host._memento.editorSizeGrownForSidebarHide,
			grownDetail: host._memento.detailWidthGrownForSidebarHide,
			resizes: [...host.resizes],
		};

		setEditorHidden.call(host, false);

		assert.deepStrictEqual({
			afterClose,
			editorVisible: host.partVisibility.editor,
			resizes: host.resizes,
			snapshot: host._memento.dockedEditorSizeBeforeHide,
		}, {
			afterClose: {
				snapshot: undefined,
				grownEditor: undefined,
				grownDetail: undefined,
				resizes: [],
			},
			editorVisible: true,
			resizes: [{ width: 816, height: 800 }],
			snapshot: undefined,
		});
	});

	// --- Docked editor hide/reveal-sync (grid sash / editor part layout) ----
	// Width-based visibility is symmetric: squeezing the node down to the detail
	// width hides the editor, and widening it far enough to fit the editor at its
	// minimum content width beside the detail reveals it again. A small widen (below
	// that threshold) resizes the detail panel and must not reveal.

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

	test('reveals the docked editor when the sash widens the node enough to fit the editor beside the detail', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 500, partVisibility: { editor: false, auxiliaryBar: true } });

		// Detail width 300 + reveal margin 200 = 500 reveal threshold; the node is at it.
		onEditorNodeResized.call(host, 500);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			events: host.events,
			layoutCount: host.counts.layout,
			saveCount: host.counts.save,
			classToggles: host.classToggles,
		}, {
			editorVisible: true,
			events: [{ partId: Parts.EDITOR_PART, visible: true }],
			layoutCount: 1,
			saveCount: 1,
			classToggles: [{ name: 'nomaineditorarea', force: false }],
		});
	});

	test('does not reveal the docked editor while widening below the editor-fits threshold', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 499, partVisibility: { editor: false, auxiliaryBar: true } });

		// One px short of detail (300) + reveal margin (200).
		onEditorNodeResized.call(host, 499);

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
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 300 });

		onEditorNodeResized.call(host, 304);

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
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 300 });

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

	test('hides docked editor when sash squeezes node down to detail width', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 600, partVisibility: { editor: true, auxiliaryBar: true } });

		onEditorNodeResized.call(host, 304);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			events: host.events,
			layoutCount: host.counts.layout,
			saveCount: host.counts.save,
			classToggles: host.classToggles,
		}, {
			editorVisible: false,
			events: [{ partId: Parts.EDITOR_PART, visible: false }],
			layoutCount: 1,
			saveCount: 1,
			classToggles: [{ name: 'nomaineditorarea', force: true }],
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

	test('clears stale snapshots and explicit-reveal flag when sash-collapse hides the editor', () => {
		const host = createHost({ single: true, sessionsWidth: 1000, dockedWidth: 300, editorWidth: 600, partVisibility: { editor: true, auxiliaryBar: true } });
		host._memento.editorSizeGrownForSidebarHide = { width: 800, height: 600 };
		host._memento.detailWidthGrownForSidebarHide = 400;
		host._editorRevealedExplicitly = true;

		onEditorNodeResized.call(host, 300);

		assert.deepStrictEqual({
			editorVisible: host.partVisibility.editor,
			editorSizeGrownForSidebarHide: host._memento.editorSizeGrownForSidebarHide,
			detailWidthGrownForSidebarHide: host._memento.detailWidthGrownForSidebarHide,
			editorRevealedExplicitly: host._editorRevealedExplicitly,
		}, {
			editorVisible: false,
			editorSizeGrownForSidebarHide: undefined,
			detailWidthGrownForSidebarHide: undefined,
			editorRevealedExplicitly: false,
		});
	});

	// --- DockedAuxiliaryBarController --------------------------------------

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
			hideAuxiliaryBar: () => { },
			setEditorContentRightInset: px => insets.push(px),
			getHeaderHeight: () => 0,
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
				{ width: 260, height: 565, top: 35, left: 540 },
				{ width: 260, height: 565, top: 35, left: 0 },
			],
			style: {
				top: '35px',
				right: '0px',
				width: '260px',
				height: '565px',
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
			hideAuxiliaryBar: () => { },
			setEditorContentRightInset: px => insets.push(px),
			getHeaderHeight: () => 0,
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

	test('hides the docked detail panel when its sash collapses to zero width', () => {
		const editorContainer = document.createElement('div');
		const auxiliaryBarContainer = document.createElement('div');
		const persistedWidths: number[] = [];
		let hideCount = 0;

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
			getHeaderHeight: () => 0,
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

	test('docked last editor close hides the whole side pane under suppression', () => {
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
			auxHiddenCalls: [{ hidden: true, suppression: 1 }],
			editorVisible: false,
			auxiliaryBarVisible: false,
		});
	});

	// --- Attached editor maximized state -----------------------------------

	interface IWorkbenchTestHarness {
		partVisibility: { sidebar: boolean; auxiliaryBar: boolean; editor: boolean; panel: boolean; sessions: boolean };
		layoutPolicy: { viewportClass: { get(): 'phone' | 'tablet' | 'desktop' } };
		storageService: { store(...args: unknown[]): void };
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
});
