/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { setARIAContainer } from '../../../../../base/browser/ui/aria/aria.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ResolvedKeybinding } from '../../../../../base/common/keybindings.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ISessionsListNotice, SessionsListNotification } from '../../browser/views/sessionsListNotification.js';

suite('Sessions - List notification', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function notice(message: string, undo: () => Promise<void> = async () => { }): ISessionsListNotice {
		return { message, help: 'Undo restores the change.', undo };
	}

	function focus(element: HTMLElement): void {
		const previous = DOM.getActiveElement();
		element.focus();
		// Hidden Electron windows update activeElement without emitting native focus events.
		if (!mainWindow.document.hasFocus()) {
			previous?.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: element }));
			element.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: previous }));
		}
	}

	function setup(stub?: (instantiationService: TestInstantiationService) => void) {
		const container = DOM.append(mainWindow.document.body, DOM.$('div'));
		store.add(toDisposable(() => container.remove()));
		const focusTarget = DOM.append(container, DOM.$('button'));
		const errors: Error[] = [];
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(error: Error) { errors.push(error); }
		});
		stub?.(instantiationService);
		const notification = store.add(instantiationService.createInstance(SessionsListNotification, container, () => focusTarget.focus()));
		const element = () => container.querySelector<HTMLElement>('.sessions-list-notification');
		const undoButton = () => container.querySelector<HTMLElement>('.monaco-button')!;
		return { container, focusTarget, notification, errors, element, undoButton };
	}

	test('shows a single-line message with secondary Undo, close, and a ten-second countdown', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		test.notification.show(notice('3 marked done'));
		assert.deepStrictEqual({
			message: test.container.querySelector('.sessions-list-notification-label')?.textContent,
			secondary: test.undoButton().classList.contains('secondary'),
			close: !!test.container.querySelector('.codicon-close'),
			duration: test.container.querySelector<HTMLElement>('.sessions-list-notification-progress')?.style.animationDuration,
		}, { message: '3 marked done', secondary: true, close: true, duration: '10000ms' });
		await timeout(9999);
		assert.ok(test.element());
		await timeout(1);
		assert.strictEqual(test.element(), null);
	}));

	test('pauses the countdown on hover and resumes with the remaining time', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		test.notification.show(notice('3 marked done'));
		await timeout(4000);
		test.element()!.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(15000);
		assert.strictEqual(test.container.querySelector<HTMLElement>('.sessions-list-notification-progress')?.style.animationPlayState, 'paused');
		test.element()!.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(5999);
		assert.ok(test.element());
		await timeout(1);
		assert.strictEqual(test.element(), null);
	}));

	test('countdown stays clear of the banner corners and shrinks without scaling its rounded ends', () => {
		const test = setup();
		test.container.style.width = '320px';
		test.container.style.position = 'relative';
		test.container.style.setProperty('--vscode-strokeThickness', '1px');
		test.container.style.setProperty('--vscode-cornerRadius-large', '8px');
		test.container.style.setProperty('--vscode-cornerRadius-circle', '9999px');
		test.container.style.setProperty('--vscode-spacing-size100', '10px');
		test.container.style.setProperty('--vscode-spacing-size120', '12px');
		test.notification.show(notice('3 marked done'));
		const clip = test.container.querySelector<HTMLElement>('.sessions-list-notification-progress-clip')!;
		const progress = test.container.querySelector<HTMLElement>('.sessions-list-notification-progress')!;
		const clipStyle = mainWindow.getComputedStyle(clip);
		const animation = progress.getAnimations()[0];
		animation.pause();
		const widths = [0, 5000, 10000].map(time => {
			animation.currentTime = time;
			return Math.round(progress.getBoundingClientRect().width / clip.clientWidth * 100);
		});
		assert.deepStrictEqual({
			inset: [clipStyle.left, clipStyle.right, clipStyle.bottom],
			height: clipStyle.height,
			radius: clipStyle.borderBottomLeftRadius,
			overflow: clipStyle.overflow,
			pointerEvents: clipStyle.pointerEvents,
			ariaHidden: clip.getAttribute('aria-hidden'),
			progressRadius: mainWindow.getComputedStyle(progress).borderRadius,
			widths,
		}, {
			inset: ['10px', '10px', '1px'],
			height: '2px',
			radius: '9999px',
			overflow: 'hidden',
			pointerEvents: 'none',
			ariaHidden: 'true',
			progressRadius: '9999px',
			widths: [100, 50, 0],
		});
	});

	test('keyboard focus pauses expiry and Escape dismisses and returns focus to the list', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		test.notification.show(notice('3 marked done'));
		focus(test.undoButton());
		await timeout(15000);
		assert.ok(test.element());
		test.undoButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		assert.deepStrictEqual({ dismissed: !test.element(), focusRestored: DOM.getActiveElement() === test.focusTarget }, { dismissed: true, focusRestored: true });
	}));

	test('close dismisses without undoing', async () => {
		const test = setup();
		let undoCalls = 0;
		test.notification.show(notice('3 marked done', async () => { undoCalls++; }));
		test.container.querySelector<HTMLElement>('.action-label')!.click();
		assert.deepStrictEqual({ dismissed: !test.element(), undoCalls }, { dismissed: true, undoCalls: 0 });
	});

	test('Undo runs once and dismisses on success', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		const undo = new DeferredPromise<void>();
		let undoCalls = 0;
		test.notification.show(notice('3 marked done', () => { undoCalls++; return undo.p; }));
		test.undoButton().click();
		test.undoButton().click();
		await timeout(15000);
		assert.ok(test.element());
		await undo.complete();
		await timeout(0);
		assert.deepStrictEqual({ dismissed: !test.element(), undoCalls }, { dismissed: true, undoCalls: 1 });
	}));

	test('an undo failure is reported and allows retry', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		const error = new Error('restore failed');
		let calls = 0;
		test.notification.show(notice('3 marked done', async () => {
			if (++calls === 1) {
				throw error;
			}
		}));
		test.undoButton().click();
		await timeout(0);
		assert.deepStrictEqual({ errors: test.errors, disabled: test.undoButton().getAttribute('aria-disabled') }, { errors: [error], disabled: 'false' });
		test.undoButton().click();
		await timeout(0);
		assert.strictEqual(test.element(), null);
	}));

	test('a new notice replaces the old countdown and is not dismissed by an old undo', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		const undo = new DeferredPromise<void>();
		test.notification.show(notice('3 marked done', () => undo.p));
		test.undoButton().click();
		await timeout(5000);
		test.notification.show(notice('2 marked done'));
		await undo.complete();
		await timeout(9999);
		assert.strictEqual(test.container.querySelector('.sessions-list-notification-label')?.textContent, '2 marked done');
		await timeout(1);
		assert.strictEqual(test.element(), null);
	}));

	test('accessibility help describes the change and what Undo restores', () => {
		const test = setup();
		test.notification.show(notice('Filters reset'));
		const help = store.add(test.notification.getAccessibilityHelp()!);
		assert.deepStrictEqual(help.provideContent().split('\n').slice(0, 2), ['Filters reset', 'Undo restores the change.']);
	});

	for (const action of ['Undo', 'Dismiss']) {
		test(`accessibility help pauses expiry and returns focus to ${action}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const test = setup();
			test.notification.show(notice('3 marked done'));
			const initiatingElement = action === 'Undo' ? test.undoButton() : test.container.querySelector<HTMLElement>('.action-label')!;
			focus(initiatingElement);
			const help = store.add(test.notification.getAccessibilityHelp()!);
			focus(test.focusTarget);
			await timeout(15000);
			assert.ok(test.element());
			help.onClose();
			assert.strictEqual(DOM.getActiveElement(), initiatingElement);
		}));
	}

	test('disposing accessibility help without closing resumes the remaining countdown without moving focus', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		test.notification.show(notice('3 marked done'));
		await timeout(4000);
		focus(test.undoButton());
		const help = store.add(test.notification.getAccessibilityHelp()!);
		focus(test.focusTarget);
		await timeout(15000);
		help.dispose();
		await timeout(5999);
		const visibleBeforeExpiry = !!test.element();
		await timeout(1);
		assert.deepStrictEqual({
			visibleBeforeExpiry,
			dismissed: !test.element(),
			focusUnchanged: DOM.getActiveElement() === test.focusTarget,
		}, { visibleBeforeExpiry: true, dismissed: true, focusUnchanged: true });
	}));

	test('disposing help for a replaced notice does not change the new countdown', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		test.notification.show(notice('3 marked done'));
		const help = store.add(test.notification.getAccessibilityHelp()!);
		test.notification.show(notice('2 marked done'));
		await timeout(4000);
		help.dispose();
		await timeout(5999);
		assert.ok(test.element());
		await timeout(1);
		assert.strictEqual(test.element(), null);
	}));

	/** What the notice shows: its message, whether it is in progress or a warning, its buttons, and when it expires. */
	function describeNotice(test: ReturnType<typeof setup>) {
		const element = test.element();
		return element && {
			message: element.querySelector('.sessions-list-notification-label')?.textContent,
			inProgress: element.classList.contains('in-progress'),
			warning: !!element.querySelector('.sessions-list-notification-icon.codicon-warning') && element.classList.contains('warning'),
			undo: !!element.querySelector('.monaco-button'),
			dismiss: !!element.querySelector('.codicon-close'),
			duration: element.querySelector<HTMLElement>('.sessions-list-notification-progress')?.style.animationDuration,
		};
	}

	/** Records what screen readers hear while `run` runs, politely (status) or assertively (alert). */
	async function announcements(run: () => Promise<void>): Promise<string[]> {
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		setARIAContainer(container);
		const heard: string[] = [];
		const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.length && heard.push(`${(record.target as HTMLElement).classList.contains('monaco-alert') ? 'alert' : 'status'}: ${record.target.textContent}`)));
		container.querySelectorAll('.monaco-status, .monaco-alert').forEach(region => observer.observe(region, { childList: true }));
		try {
			await run();
			await timeout(0);
		} finally {
			observer.disconnect();
			// Later announcements must not go to the removed container.
			setARIAContainer(mainWindow.document.body);
			container.remove();
		}
		return heard;
	}

	test('progress stays without Undo or expiry until its result replaces it, and only the result is announced', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		let progress: ReturnType<typeof describeNotice> = null;
		let result: ReturnType<typeof describeNotice> = null;
		const heard = await announcements(async () => {
			test.notification.showProgress({ message: 'Moving \'Fix tests\'...', help: 'Moving.' });
			await timeout(60_000);
			progress = describeNotice(test);
			test.notification.show({ message: 'Moved \'Fix tests\' into \'Release\'', help: 'Moved.' });
			result = describeNotice(test);
		});
		await timeout(9999);
		const visibleBeforeExpiry = !!test.element();
		await timeout(1);
		assert.deepStrictEqual({ progress, result, heard, visibleBeforeExpiry, expired: !test.element() }, {
			progress: { message: 'Moving \'Fix tests\'...', inProgress: true, warning: false, undo: false, dismiss: true, duration: '' },
			// A result without Undo only reports, for ten seconds.
			result: { message: 'Moved \'Fix tests\' into \'Release\'', inProgress: false, warning: false, undo: false, dismiss: true, duration: '10000ms' },
			heard: ['status: Moved \'Fix tests\' into \'Release\''],
			visibleBeforeExpiry: true,
			expired: true,
		});
	}));

	test('a warning shows its icon and is announced assertively', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		const heard = await announcements(async () => {
			test.notification.show({ message: 'Could not move \'Fix tests\'. The session is archived.', help: 'Refused.', warning: true });
		});
		assert.deepStrictEqual({ notice: describeNotice(test), heard }, {
			notice: { message: 'Could not move \'Fix tests\'. The session is archived.', inProgress: false, warning: true, undo: false, dismiss: true, duration: '10000ms' },
			heard: ['alert: Could not move \'Fix tests\'. The session is archived.'],
		});
		test.notification.dispose();
	}));

	test('Undo can replace the notice with its own progress and result', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		test.notification.show(notice('Moved \'Fix tests\' into \'Release\'', async () => {
			test.notification.showProgress({ message: 'Moving \'Fix tests\' back...', help: '' });
			await timeout(1000);
			test.notification.show({ message: 'Moved \'Fix tests\' back', help: '' });
		}));
		test.undoButton().click();
		await timeout(0);
		const progress = describeNotice(test);
		await timeout(1000);
		assert.deepStrictEqual({ progress, result: describeNotice(test), errors: test.errors }, {
			progress: { message: 'Moving \'Fix tests\' back...', inProgress: true, warning: false, undo: false, dismiss: true, duration: '' },
			// Not dismissed by the Undo that showed it.
			result: { message: 'Moved \'Fix tests\' back', inProgress: false, warning: false, undo: false, dismiss: true, duration: '10000ms' },
			errors: [],
		});
		test.notification.dispose();
	}));

	test('the hint to open accessibility help is on the control that gets focus: Undo, or Dismiss without it', () => {
		const test = setup(instantiationService => {
			instantiationService.stub(IConfigurationService, new TestConfigurationService({ [AccessibilityVerbositySettingId.SessionsListNotification]: true }));
			instantiationService.stub(IKeybindingService, new class extends mock<IKeybindingService>() {
				override lookupKeybinding() { return upcastPartial<ResolvedKeybinding>({ getAriaLabel: () => 'Alt+F1' }); }
			});
		});
		const hinted = () => {
			const dismiss = test.container.querySelector<HTMLElement>('.action-label')!;
			dismiss.focus();
			const undo = test.element()!.querySelector<HTMLElement>('.monaco-button');
			return { undo: undo?.getAttribute('aria-description') ?? null, dismiss: DOM.getActiveElement() === dismiss ? dismiss.getAttribute('aria-description') : 'not focused' };
		};
		test.notification.showProgress({ message: 'Moving \'Fix tests\'...', help: '' });
		const progress = hinted();
		test.notification.show({ message: 'Moved \'Fix tests\'', help: '' });
		const result = hinted();
		test.notification.show(notice('3 marked done'));
		const withUndo = hinted();
		assert.deepStrictEqual({ progress, result, withUndo }, {
			progress: { undo: null, dismiss: 'Press Alt+F1 for accessibility help.' },
			result: { undo: null, dismiss: 'Press Alt+F1 for accessibility help.' },
			withUndo: { undo: 'Press Alt+F1 for accessibility help.', dismiss: null },
		});
		test.notification.dispose();
	});

	test('accessibility help of progress and of a result without Undo mention only Dismiss, and return focus to it', () => {
		const test = setup();
		test.notification.showProgress({ message: 'Moving \'Fix tests\'...', help: 'A chat is being moved.' });
		const dismiss = () => test.container.querySelector<HTMLElement>('.action-label')!;
		const progressHelp = store.add(test.notification.getAccessibilityHelp()!);
		const progressContent = progressHelp.provideContent().split('\n');
		progressHelp.onClose();
		const progressFocus = DOM.getActiveElement() === dismiss();
		test.notification.show({ message: 'Moved \'Fix tests\'', help: 'A chat was moved.' });
		const resultHelp = store.add(test.notification.getAccessibilityHelp()!);
		const resultContent = resultHelp.provideContent().split('\n');
		resultHelp.onClose();
		assert.deepStrictEqual({ progressContent, progressFocus, resultContent: resultContent.slice(0, 3), resultFocus: DOM.getActiveElement() === dismiss() }, {
			progressContent: [
				'Moving \'Fix tests\'...',
				'A chat is being moved.',
				'The result replaces this notice when the operation finishes. Use Tab and Shift+Tab to reach Dismiss. Press Enter or Space to activate it, or Escape to dismiss the notice.',
			],
			progressFocus: true,
			resultContent: ['Moved \'Fix tests\'', 'A chat was moved.', 'Use Tab and Shift+Tab to reach Dismiss. Press Enter or Space to activate it, or Escape to dismiss the notice.'],
			resultFocus: true,
		});
	});

	test('disposal removes the notice and cancels expiry', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		test.notification.show(notice('3 marked done'));
		test.notification.dispose();
		await timeout(10000);
		assert.strictEqual(test.element(), null);
	}));
});
