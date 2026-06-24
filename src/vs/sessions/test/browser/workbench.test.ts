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
