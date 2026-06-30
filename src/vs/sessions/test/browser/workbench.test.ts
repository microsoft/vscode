/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
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
	_editorMaximized: boolean;
	_restoreAttachedEditorMaximizedOnShow: boolean;
	setEditorMaximized(maximized: boolean): void;
	setAuxiliaryBarHidden(hidden: boolean): void;
	_savePartVisibility(): void;
}

suite('Sessions - Workbench', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const rememberAttachedEditorMaximizedState = Reflect.get(Workbench.prototype, 'rememberAttachedEditorMaximizedState') as (this: IWorkbenchTestHarness) => void;
	const restoreAttachedEditorMaximizedState = Reflect.get(Workbench.prototype, 'restoreAttachedEditorMaximizedState') as (this: IWorkbenchTestHarness) => void;
	const setAuxiliaryBarHidden = Reflect.get(Workbench.prototype, 'setAuxiliaryBarHidden') as (this: IWorkbenchTestHarness, hidden: boolean) => void;
	const loadPartVisibility = Reflect.get(Workbench.prototype, '_loadPartVisibility') as (this: IWorkbenchTestHarness, storageService: { get(): string | undefined; remove(): void }) => { editor?: boolean; auxiliaryBar?: boolean; sidebar?: boolean };
	const savePartVisibility = Reflect.get(Workbench.prototype, '_savePartVisibility') as (this: IWorkbenchTestHarness) => void;
	const setEditorHidden = Reflect.get(Workbench.prototype, 'setEditorHidden') as (this: IEditorSplitTestHarness, hidden: boolean) => void;
	const applyEditorSplitSize = Reflect.get(Workbench.prototype, '_applyEditorSplitSize') as (this: IEditorSplitTestHarness, mainAreaWidth: number) => void;

	interface IEditorSplitTestHarness {
		readonly editorPartView: object;
		readonly sessionsPartView: object;
		readonly mainContainer: { classList: { toggle(name: string, force: boolean): void } };
		readonly workbenchGrid: {
			getViewSize(view: object): { width: number; height: number };
			setViewVisible(view: object, visible: boolean): void;
			resizeView(view: object, size: { width: number; height: number }): void;
		};
		readonly resizes: { width: number; height: number }[];
		readonly visibilityChanges: boolean[];
		partVisibility: { editor: boolean };
		_editorMaximized: boolean;
		_hasAppliedInitialEditorSplit: boolean;
		setEditorMaximized(maximized: boolean): void;
		_applyEditorSplitSize(mainAreaWidth: number): void;
		_savePartVisibility(): void;
	}

	function createEditorSplitHarness(sessionsWidth: number, overrides?: Partial<Pick<IEditorSplitTestHarness, 'partVisibility' | '_hasAppliedInitialEditorSplit'>>): IEditorSplitTestHarness {
		const editorPartView = {};
		const sessionsPartView = {};
		const resizes: { width: number; height: number }[] = [];
		const visibilityChanges: boolean[] = [];
		const editorSize = { width: 0, height: 800 };
		return {
			editorPartView,
			sessionsPartView,
			mainContainer: { classList: { toggle: () => { } } },
			workbenchGrid: {
				getViewSize: view => view === sessionsPartView ? { width: sessionsWidth, height: 800 } : editorSize,
				setViewVisible: (_view, visible) => visibilityChanges.push(visible),
				resizeView: (_view, size) => {
					resizes.push(size);
					editorSize.width = size.width;
				},
			},
			resizes,
			visibilityChanges,
			partVisibility: { editor: false },
			_editorMaximized: false,
			_hasAppliedInitialEditorSplit: false,
			setEditorMaximized: () => { },
			_applyEditorSplitSize: applyEditorSplitSize,
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
			_editorMaximized: false,
			_restoreAttachedEditorMaximizedOnShow: false,
			setEditorMaximized: () => { },
			setAuxiliaryBarHidden: () => { },
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
