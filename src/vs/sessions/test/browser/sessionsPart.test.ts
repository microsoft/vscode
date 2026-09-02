/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventType } from '../../../base/browser/dom.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { SessionsPart } from '../../browser/parts/sessionsPart.js';

interface IViewSize {
	readonly width: number;
	readonly height: number;
}

interface ITestGridSlot {
	readonly view: TestSessionView;
	readonly disposables: IDisposable;
	boundSessionId: string | undefined;
}

interface ISessionsPartTestHarness {
	readonly _isPartVisible: boolean;
	readonly instantiationService: {
		createInstance(): TestSessionView;
	};
	readonly _gridWidget: {
		getViewSize(view: object): IViewSize;
		expandView(view: object): void;
	};
	readonly _onDidFocusSession: {
		fire(sessionId: string): void;
	};
}

class TestSessionView implements IDisposable {
	readonly element = document.createElement('div');
	readonly minimumWidth = 200;
	readonly partVisibility: boolean[] = [];

	setPartVisible(visible: boolean): void {
		this.partVisibility.push(visible);
	}
	dispose(): void { }
}

suite('Sessions - Sessions Part', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const createSlot = Reflect.get(SessionsPart.prototype, '_createSlot') as (this: ISessionsPartTestHarness) => ITestGridSlot;

	function assertActivation(eventFactory: () => Event): void {
		const minimizedView = new TestSessionView();
		const widerView = new TestSessionView();
		const widths = new Map<object, number>([
			[minimizedView, minimizedView.minimumWidth],
			[widerView, widerView.minimumWidth + 1],
		]);
		const expanded: object[] = [];
		const focused: string[] = [];
		let viewToCreate = minimizedView;
		const host = {
			_isPartVisible: true,
			instantiationService: {
				createInstance: () => viewToCreate,
			},
			_gridWidget: {
				getViewSize: (view: object) => ({ width: widths.get(view)!, height: 600 }),
				expandView: (view: object) => expanded.push(view),
			},
			_onDidFocusSession: {
				fire: (sessionId: string) => focused.push(sessionId),
			},
		};
		Object.setPrototypeOf(host, SessionsPart.prototype);

		const minimizedSlot = createSlot.call(host);
		minimizedSlot.boundSessionId = 'minimized';
		store.add(minimizedSlot.disposables);

		viewToCreate = widerView;
		const widerSlot = createSlot.call(host);
		widerSlot.boundSessionId = 'wider';
		store.add(widerSlot.disposables);

		minimizedView.element.dispatchEvent(eventFactory());
		widerView.element.dispatchEvent(eventFactory());

		assert.deepStrictEqual({ expanded, focused }, {
			expanded: [minimizedView],
			focused: ['minimized', 'wider'],
		});
	}

	test('focus activation expands only a minimum-width session', () => {
		assertActivation(() => new FocusEvent(EventType.FOCUS_IN, { bubbles: true }));
	});

	test('pointer activation expands only a minimum-width session', () => {
		assertActivation(() => new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, button: 0 }));
	});

	test('combines content and grid visibility for mounted session views', () => {
		const view = new TestSessionView();
		const partVisibilityEvents: boolean[] = [];
		const part: SessionsPart = Object.assign(Object.create(SessionsPart.prototype), {
			_isPartVisible: true,
			_contentVisible: true,
			_slots: [{ view }],
			_onDidVisibilityChange: { fire: (visible: boolean) => partVisibilityEvents.push(visible) },
		});

		part.setVisible(false);
		part.setContentVisible(false);
		part.setContentVisible(true);
		part.setVisible(true);

		assert.deepStrictEqual({
			sessionView: view.partVisibility,
			part: partVisibilityEvents,
		}, {
			sessionView: [false, false, false, true],
			part: [false, true],
		});
	});
});
