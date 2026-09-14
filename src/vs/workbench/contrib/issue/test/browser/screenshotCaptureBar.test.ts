/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate, IContextMenuProvider } from '../../../../../base/browser/contextmenu.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ScreenshotCaptureBar } from '../../browser/screenshotCaptureBar.js';

suite('ScreenshotCaptureBar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a newer capture surface owns the shared floating-bar position', () => {
		const reporterBar = store.add(new ScreenshotCaptureBar(document.body));
		const recordButton = document.createElement('button');
		recordButton.classList.add('wizard-record-btn');
		reporterBar.element.appendChild(recordButton);

		const issueWizardBar = store.add(new ScreenshotCaptureBar(document.body));
		const afterIssueWizardLaunch = {
			reporterDisplay: reporterBar.element.style.display,
			issueWizardDisplay: issueWizardBar.element.style.display,
			reporterActive: reporterBar.active,
			issueWizardActive: issueWizardBar.active,
			issueWizardHasRecording: !!issueWizardBar.element.querySelector('.wizard-record-btn'),
		};
		reporterBar.activate();
		const afterReporterFocus = { reporterActive: reporterBar.active, issueWizardActive: issueWizardBar.active };
		issueWizardBar.activate();
		const afterIssueWizardFocus = { reporterActive: reporterBar.active, issueWizardActive: issueWizardBar.active };

		issueWizardBar.dispose();
		assert.deepStrictEqual({
			afterIssueWizardLaunch,
			afterReporterFocus,
			afterIssueWizardFocus,
			reporterDisplayAfterIssueWizardClose: reporterBar.element.style.display,
		}, {
			afterIssueWizardLaunch: {
				reporterDisplay: 'none',
				issueWizardDisplay: '',
				reporterActive: false,
				issueWizardActive: true,
				issueWizardHasRecording: false,
			},
			afterReporterFocus: { reporterActive: true, issueWizardActive: false },
			afterIssueWizardFocus: { reporterActive: false, issueWizardActive: true },
			reporterDisplayAfterIssueWizardClose: '',
		});
	});

	test('restoring visibility does not take capture ownership from the focused surface', () => {
		const reporterBar = store.add(new ScreenshotCaptureBar(document.body));
		const issueWizardBar = store.add(new ScreenshotCaptureBar(document.body));
		reporterBar.hide();
		reporterBar.show();

		assert.deepStrictEqual({
			reporterActive: reporterBar.active,
			reporterDisplay: reporterBar.element.style.display,
			issueWizardActive: issueWizardBar.active,
			issueWizardDisplay: issueWizardBar.element.style.display,
		}, {
			reporterActive: false,
			reporterDisplay: 'none',
			issueWizardActive: true,
			issueWizardDisplay: '',
		});
	});

	test('disposing during a delayed capture settles the trigger as cancelled', async () => {
		let menu: IContextMenuDelegate | undefined;
		const contextMenuProvider: IContextMenuProvider = {
			showContextMenu: delegate => menu = delegate,
		};
		const captureBar = store.add(new ScreenshotCaptureBar(document.body, contextMenuProvider));
		captureBar.element.querySelector<HTMLElement>('.wizard-segmented-dropdown')?.click();
		const threeSecondDelay = menu?.getActions().find(action => action.id === 'delay-3');
		await threeSecondDelay?.run();

		const capture = captureBar.triggerCapture();
		captureBar.dispose();
		assert.deepStrictEqual({
			delayConfigured: !!threeSecondDelay,
			captureRequested: await capture,
		}, {
			delayConfigured: true,
			captureRequested: false,
		});
	});

	test('disposing during a drag removes window-level drag listeners', () => {
		const captureBar = store.add(new ScreenshotCaptureBar(document.body));
		const dragArea = captureBar.element.querySelector<HTMLElement>('.wizard-floating-drag');
		dragArea?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
		captureBar.dispose();
		document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 100 }));

		assert.deepStrictEqual({
			dragAreaFound: !!dragArea,
			left: captureBar.element.style.left,
			top: captureBar.element.style.top,
		}, {
			dragAreaFound: true,
			left: '',
			top: '',
		});
	});

	test('reparenting binds drag listeners to the new window', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const frame = document.createElement('iframe');
		document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		const captureBar = store.add(new ScreenshotCaptureBar(container));
		const targetWindow = frame.contentWindow;
		const dragArea = captureBar.element.querySelector<HTMLElement>('.wizard-floating-drag');
		let positionAfterOldWindowMove: { left: string; top: string } | undefined;
		if (targetWindow) {
			targetWindow.document.body.appendChild(container);
			captureBar.reparent();
			dragArea?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
			document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 100 }));
			positionAfterOldWindowMove = { left: captureBar.element.style.left, top: captureBar.element.style.top };
			targetWindow.document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 100 }));
		}

		assert.deepStrictEqual({
			targetWindowFound: !!targetWindow,
			dragAreaFound: !!dragArea,
			positionAfterOldWindowMove,
			positionedAfterNewWindowMove: captureBar.element.style.left !== '' && captureBar.element.style.top !== '',
		}, {
			targetWindowFound: true,
			dragAreaFound: true,
			positionAfterOldWindowMove: { left: '', top: '' },
			positionedAfterNewWindowMove: true,
		});
	});
});
