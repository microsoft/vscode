/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, EventType } from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestAccessibilityService } from '../../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ChatActivityLabelTransition } from '../../../../browser/widget/chatContentParts/chatActivityLabelTransition.js';

suite('ChatActivityLabelTransition', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createLabel(options: { readonly motionReduced?: () => boolean; readonly onDidChangeReducedMotion?: Event<void>; readonly targetDocument?: Document } = {}) {
		const targetDocument = options.targetDocument ?? mainWindow.document;
		const container = targetDocument.createElement('div');
		container.classList.add('monaco-enable-motion');
		targetDocument.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const label = targetDocument.createElement('span');
		label.textContent = 'Reading';
		container.appendChild(label);
		let target = 'Reading';
		const shown: string[] = [];
		const didShowTarget = store.add(new Emitter<string>());
		const transition = store.add(new ChatActivityLabelTransition({
			getElement: () => label,
			shouldAnimate: () => label.textContent !== target,
			showTarget: () => {
				if (label.textContent !== target) {
					label.textContent = target;
					shown.push(target);
					didShowTarget.fire(target);
				}
			},
		}, new class extends TestAccessibilityService {
			override onDidChangeReducedMotion = options.onDidChangeReducedMotion ?? Event.None;
			override isMotionReduced(): boolean { return options.motionReduced?.() ?? false; }
		}));
		const wipe = () => label.classList.contains('chat-activity-label-wipe-out') ? 'out' : label.classList.contains('chat-activity-label-wipe-in') ? 'in' : undefined;
		return {
			label,
			shown,
			transition,
			onDidShowTarget: didShowTarget.event,
			request(next: string): void {
				target = next;
				transition.update();
			},
			state: () => ({ text: label.textContent, wipe: wipe() }),
			endWipe(): void {
				label.dispatchEvent(new AnimationEvent(EventType.ANIMATION_END, { animationName: `chat-activity-label-wipe-${wipe()}` }));
			},
		};
	}

	test('wipes to the latest requested label and catches up with one requested as it arrives', () => {
		const { request, state, endWipe, shown } = createLabel();
		request('Searching');
		const leaving = state();
		request('Editing');
		endWipe();
		const arriving = state();
		request('Running tests');
		endWipe();
		const catchingUp = state();
		endWipe();
		endWipe();

		assert.deepStrictEqual({ leaving, arriving, catchingUp, settled: state(), shown }, {
			leaving: { text: 'Reading', wipe: 'out' },
			arriving: { text: 'Editing', wipe: 'in' },
			catchingUp: { text: 'Editing', wipe: 'out' },
			settled: { text: 'Running tests', wipe: undefined },
			shown: ['Editing', 'Running tests'],
		});
	});

	test('swaps at once when motion is reduced or the wipe is finished early', () => {
		const reduced = createLabel({ motionReduced: () => true });
		reduced.request('Searching');
		const live = createLabel();
		live.request('Searching');
		live.transition.finish();

		assert.deepStrictEqual({ reduced: reduced.state(), finished: live.state() }, {
			reduced: { text: 'Searching', wipe: undefined },
			finished: { text: 'Searching', wipe: undefined },
		});
	});

	test('finishes a wipe when motion becomes reduced, and ignores animation events once stopped', () => {
		const reducedMotionChanged = store.add(new Emitter<void>());
		let motionReduced = false;
		const { label, request, state, transition } = createLabel({ motionReduced: () => motionReduced, onDidChangeReducedMotion: reducedMotionChanged.event });
		request('Searching');
		const leaving = state();
		motionReduced = true;
		reducedMotionChanged.fire();
		const reduced = state();
		motionReduced = false;
		request('Editing');
		transition.stop();
		label.dispatchEvent(new AnimationEvent(EventType.ANIMATION_END, { animationName: 'chat-activity-label-wipe-out' }));

		assert.deepStrictEqual({ leaving, reduced, stopped: state() }, {
			leaving: { text: 'Reading', wipe: 'out' },
			reduced: { text: 'Searching', wipe: undefined },
			stopped: { text: 'Searching', wipe: undefined },
		});
	});

	test('keeps inline code legible while a label shimmers in', () => {
		const { label, request, endWipe } = createLabel();
		request('Searching for ');
		endWipe();
		const code = label.appendChild($('code', undefined, 'formatDuration'));
		const codeStyle = mainWindow.getComputedStyle(code);

		assert.deepStrictEqual({
			wipingIn: label.classList.contains('chat-activity-label-wipe-in'),
			labelFill: mainWindow.getComputedStyle(label).webkitTextFillColor,
			codeFillMatchesColor: codeStyle.webkitTextFillColor === codeStyle.color,
		}, {
			wipingIn: true,
			labelFill: 'rgba(0, 0, 0, 0)',
			codeFillMatchesColor: true,
		});
	});

	test('wipes labels in auxiliary windows, whose animations come from another realm', () => {
		const frame = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		const frameDocument = frame.contentDocument!;
		const style = frameDocument.createElement('style');
		style.textContent = '.monaco-enable-motion .chat-activity-label-wipe-out { animation: chat-activity-label-wipe-out 220ms forwards; } @keyframes chat-activity-label-wipe-out { to { opacity: 0; } }';
		frameDocument.head.appendChild(style);
		const { request, state } = createLabel({ targetDocument: frameDocument });
		request('Searching');

		assert.deepStrictEqual(state(), { text: 'Reading', wipe: 'out' });
	});

	test('settles a wipe whose label leaves the document', async () => {
		const { label, request, state, onDidShowTarget } = createLabel();
		request('Searching');
		const leaving = state();
		// A detached label gets no animation events, so the wipe has to settle through its animations' promises.
		const wipedIn = Event.toPromise(onDidShowTarget);
		label.remove();
		await wipedIn;
		const settled = state();
		request('Editing');

		assert.deepStrictEqual({ leaving, settled, next: state() }, {
			leaving: { text: 'Reading', wipe: 'out' },
			settled: { text: 'Searching', wipe: undefined },
			next: { text: 'Editing', wipe: undefined },
		});
	});
});
