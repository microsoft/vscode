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

interface ICodiconActivationTestHarness {
	readonly accessibilityService: {
		isMotionReduced(): boolean;
		status(message: string): void;
	};
	readonly telemetryService: {
		publicLog2(eventName: string, data: object): void;
	};
}

interface ISubmitConfettiTestHarness {
	readonly _slots: readonly ITestGridSlot[];
	readonly configurationService: {
		getValue(setting: string): boolean;
	};
	readonly accessibilityService: {
		isMotionReduced(): boolean;
	};
}

class TestSessionView implements IDisposable {
	readonly element = document.createElement('div');
	readonly minimumWidth = 200;
	readonly partVisibility: boolean[] = [];
	submitButtonElement: HTMLElement | undefined;

	setPartVisible(visible: boolean): void {
		this.partVisibility.push(visible);
	}
	dispose(): void { }
}

suite('Sessions - Sessions Part', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const createSlot = Reflect.get(SessionsPart.prototype, '_createSlot') as (this: ISessionsPartTestHarness) => ITestGridSlot;
	const activateCodicon = Reflect.get(SessionsPart.prototype, 'activateCodicon') as (this: ICodiconActivationTestHarness, element: HTMLElement) => void;
	const showSubmitConfetti = Reflect.get(SessionsPart.prototype, 'showSubmitConfetti') as (this: ISubmitConfettiTestHarness, sessionId: string, isNewSession: boolean) => void;

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

	test('announces and logs Codicon confetti activation', () => {
		const statuses: string[] = [];
		const telemetryEvents: { name: string; data: object }[] = [];
		const host: ICodiconActivationTestHarness = {
			accessibilityService: {
				isMotionReduced: () => true,
				status: message => statuses.push(message),
			},
			telemetryService: {
				publicLog2: (name, data) => telemetryEvents.push({ name, data }),
			},
		};

		activateCodicon.call(host, document.createElement('span'));

		assert.deepStrictEqual({
			statuses,
			telemetryEvents,
		}, {
			statuses: ['Confetti!'],
			telemetryEvents: [{ name: 'vscodeAgents.codiconBackground/confetti', data: {} }],
		});
	});

	test('shows submit confetti only when enabled and motion is allowed', () => {
		const workbench = document.createElement('div');
		workbench.className = 'monaco-workbench';
		const sessionView = new TestSessionView();
		const submitButton = document.createElement('button');
		submitButton.getBoundingClientRect = () => ({
			x: 900,
			y: 700,
			top: 700,
			right: 932,
			bottom: 732,
			left: 900,
			width: 32,
			height: 32,
			toJSON() { },
		});
		sessionView.submitButtonElement = submitButton;
		sessionView.element.appendChild(submitButton);
		workbench.appendChild(sessionView.element);
		document.body.appendChild(workbench);
		const overlaysBefore = document.querySelectorAll('.animation-overlay').length;
		store.add({
			dispose: () => {
				workbench.remove();
				Array.from(document.querySelectorAll('.animation-overlay')).slice(overlaysBefore).forEach(overlay => overlay.remove());
			},
		});

		let enabled = false;
		let reducedMotion = false;
		const host: ISubmitConfettiTestHarness = {
			_slots: [{ view: sessionView, disposables: { dispose() { } }, boundSessionId: 'session' }],
			configurationService: {
				getValue: () => enabled,
			},
			accessibilityService: {
				isMotionReduced: () => reducedMotion,
			},
		};

		showSubmitConfetti.call(host, 'session', false);
		enabled = true;
		reducedMotion = true;
		showSubmitConfetti.call(host, 'session', false);
		reducedMotion = false;
		showSubmitConfetti.call(host, 'session', false);

		const overlays = Array.from(document.querySelectorAll<HTMLElement>('.animation-overlay')).slice(overlaysBefore);
		assert.deepStrictEqual({
			overlayCount: overlays.length,
			particleCount: overlays[0]?.querySelectorAll('.animation-confetti-particle').length,
			overlayBounds: overlays[0] ? {
				left: overlays[0].style.left,
				top: overlays[0].style.top,
				width: overlays[0].style.width,
				height: overlays[0].style.height,
			} : undefined,
			targetAnimations: submitButton.getAnimations().length,
		}, {
			overlayCount: 1,
			particleCount: 24,
			overlayBounds: {
				left: '900px',
				top: '700px',
				width: '32px',
				height: '32px',
			},
			targetAnimations: 0,
		});
	});
});
