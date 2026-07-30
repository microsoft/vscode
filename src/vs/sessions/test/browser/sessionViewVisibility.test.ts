/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { SessionView } from '../../browser/parts/sessionView.js';
import { SessionsPart } from '../../browser/parts/sessionsPart.js';

interface IVisibilityTarget {
	setVisible(visible: boolean): void;
}

interface ISessionViewVisibilityHarness {
	_gridVisible: boolean;
	_partVisible: boolean;
	_effectiveVisible: boolean;
	_currentView: { value: IVisibilityTarget | undefined };
	_updateVisibility(): void;
}

interface IHostedView extends IVisibilityTarget {
	readonly element: HTMLElement;
	setActive(active: boolean): void;
}

interface ITestSessionView extends IHostedView {
	setPartVisible(visible: boolean): void;
	dispose(): void;
}

interface IReplaceViewHarness {
	readonly _contentContainer: HTMLElement;
	readonly _currentView: { value: IHostedView | undefined };
	readonly _isActive: boolean;
	readonly _effectiveVisible: boolean;
}

interface ISessionsPartVisibilityHarness {
	_partVisible: boolean;
	readonly _slots: readonly { readonly view: { setPartVisible(visible: boolean): void } }[];
	readonly _onDidVisibilityChange: { fire(visible: boolean): void };
}

interface ICreateSlotHarness {
	readonly _partVisible: boolean;
	readonly instantiationService: {
		createInstance(): ITestSessionView;
	};
	readonly _onDidFocusSession: { fire(sessionId: string): void };
}

suite('Sessions - Session View Visibility', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const updateVisibility = Reflect.get(SessionView.prototype, '_updateVisibility') as (this: ISessionViewVisibilityHarness) => void;
	const setGridVisible = Reflect.get(SessionView.prototype, 'setVisible') as (this: ISessionViewVisibilityHarness, visible: boolean) => void;
	const setPartVisible = Reflect.get(SessionView.prototype, 'setPartVisible') as (this: ISessionViewVisibilityHarness, visible: boolean) => void;
	const replaceCurrentView = Reflect.get(SessionView.prototype, '_replaceCurrentView') as (this: IReplaceViewHarness, view: IHostedView) => void;
	const setSessionsPartVisible = Reflect.get(SessionsPart.prototype, 'setVisible') as (this: ISessionsPartVisibilityHarness, visible: boolean) => void;
	const createSlot = Reflect.get(SessionsPart.prototype, '_createSlot') as (this: ICreateSlotHarness) => { readonly disposables: { dispose(): void } };

	test('combines internal grid and containing part visibility', () => {
		const forwarded: boolean[] = [];
		const harness: ISessionViewVisibilityHarness = {
			_gridVisible: true,
			_partVisible: true,
			_effectiveVisible: true,
			_currentView: { value: { setVisible: visible => forwarded.push(visible) } },
			_updateVisibility: updateVisibility,
		};

		setGridVisible.call(harness, false);
		setPartVisible.call(harness, false);
		setGridVisible.call(harness, true);
		setPartVisible.call(harness, true);
		setPartVisible.call(harness, true);

		assert.deepStrictEqual({
			forwarded,
			gridVisible: harness._gridVisible,
			partVisible: harness._partVisible,
			effectiveVisible: harness._effectiveVisible,
		}, {
			forwarded: [false, true],
			gridVisible: true,
			partVisible: true,
			effectiveVisible: true,
		});
	});

	test('seeds a replacement view with the current effective visibility', () => {
		const calls: string[] = [];
		const contentContainer = document.createElement('div');
		contentContainer.appendChild(document.createElement('span'));
		const currentView: { value: IHostedView | undefined } = { value: undefined };
		const harness: IReplaceViewHarness = {
			_contentContainer: contentContainer,
			_currentView: currentView,
			_isActive: false,
			_effectiveVisible: false,
		};
		const element = document.createElement('div');
		const view: IHostedView = {
			element,
			setActive: active => calls.push(`active:${active}`),
			setVisible: visible => calls.push(`visible:${visible}`),
		};

		replaceCurrentView.call(harness, view);

		assert.deepStrictEqual({
			calls,
			currentView: currentView.value === view,
			content: contentContainer.firstElementChild === element,
		}, {
			calls: ['active:false', 'visible:false'],
			currentView: true,
			content: true,
		});
	});

	test('propagates containing part visibility to existing session views', () => {
		const forwarded: string[] = [];
		const events: boolean[] = [];
		const harness: ISessionsPartVisibilityHarness = {
			_partVisible: true,
			_slots: [
				{ view: { setPartVisible: visible => forwarded.push(`first:${visible}`) } },
				{ view: { setPartVisible: visible => forwarded.push(`second:${visible}`) } },
			],
			_onDidVisibilityChange: { fire: visible => events.push(visible) },
		};

		setSessionsPartVisible.call(harness, false);
		setSessionsPartVisible.call(harness, true);

		assert.deepStrictEqual({ forwarded, events }, {
			forwarded: ['first:false', 'second:false', 'first:true', 'second:true'],
			events: [false, true],
		});
	});

	test('seeds newly created slots with containing part visibility', () => {
		const forwarded: boolean[] = [];
		const harness: ICreateSlotHarness = {
			_partVisible: false,
			instantiationService: {
				createInstance: () => ({
					element: document.createElement('div'),
					setActive: () => { },
					setVisible: () => { },
					setPartVisible: (visible: boolean) => forwarded.push(visible),
					dispose: () => { },
				}),
			},
			_onDidFocusSession: { fire: () => { } },
		};

		const slot = createSlot.call(harness);
		slot.disposables.dispose();

		assert.deepStrictEqual(forwarded, [false]);
	});
});
