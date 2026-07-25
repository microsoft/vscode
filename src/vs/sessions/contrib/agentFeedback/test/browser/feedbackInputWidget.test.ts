/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { FeedbackInputWidget } from '../../browser/feedbackInputWidget.js';

suite('FeedbackInputWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createWidget(ariaLabel?: string) {
		const store = disposables.add(new DisposableStore());
		const widget = store.add(new FeedbackInputWidget({
			placeholder: 'Ask Question',
			ariaLabel,
			getMaxContentWidth: () => 400,
			primaryAction: { label: 'Ask', icon: Codicon.send, keybindingLabel: 'Enter' },
		}));
		return widget;
	}

	function actionsContainer(widget: FeedbackInputWidget): HTMLElement {
		return widget.domNode.querySelector('.agent-feedback-input-actions')!;
	}

	function busyIndicator(widget: FeedbackInputWidget): HTMLElement {
		return widget.domNode.querySelector('.agent-feedback-input-busy-indicator')!;
	}

	test('setBusy(true) disables the input, hides the action bar, and shows the spinner', () => {
		const widget = createWidget();

		widget.setBusy(true);

		assert.strictEqual(widget.isBusy, true);
		assert.strictEqual(widget.inputElement.disabled, true);
		assert.strictEqual(widget.inputElement.getAttribute('aria-busy'), 'true');
		assert.strictEqual(actionsContainer(widget).style.display, 'none');
		assert.notStrictEqual(busyIndicator(widget).style.display, 'none');
	});

	test('setBusy(false) restores the input and action bar', () => {
		const widget = createWidget();
		widget.setBusy(true);

		widget.setBusy(false);

		assert.strictEqual(widget.isBusy, false);
		assert.strictEqual(widget.inputElement.disabled, false);
		assert.strictEqual(widget.inputElement.getAttribute('aria-busy'), 'false');
		assert.strictEqual(actionsContainer(widget).style.display, '');
		assert.strictEqual(busyIndicator(widget).style.display, 'none');
	});

	test('setBusy is idempotent and does not toggle disabled state again on a repeated call', () => {
		const widget = createWidget();
		widget.setBusy(true);
		widget.inputElement.disabled = false; // simulate external state to detect a redundant re-apply

		widget.setBusy(true);

		assert.strictEqual(widget.inputElement.disabled, false, 'a no-op setBusy call must not re-apply state');
	});

	test('disables the primary action while busy even with text present', () => {
		const widget = createWidget();
		widget.inputElement.value = 'hello';
		widget.updateActionEnabled();

		widget.setBusy(true);

		// Re-invoking updateActionEnabled (as callers do on 'input') must keep it disabled while busy.
		widget.updateActionEnabled();
		assert.strictEqual((widget as unknown as { _primaryAction: { enabled: boolean } })._primaryAction.enabled, false);
	});

	test('sizes the action bar and busy spinner to the shared single-line height for optical vertical centering', () => {
		const widget = createWidget();
		document.body.appendChild(widget.domNode);
		disposables.add(toDisposable(() => widget.domNode.remove()));
		widget.show();

		const lineHeight = widget.inputElement.style.lineHeight;
		assert.ok(lineHeight.length > 0, 'the input line height must be configured');

		// Neither box is positioned via a one-off JS transform/top hack; alignment
		// comes entirely from the shared flex/line-height CSS pattern below.
		assert.strictEqual(actionsContainer(widget).style.transform, '');
		assert.strictEqual(actionsContainer(widget).style.top, '');
		assert.strictEqual(busyIndicator(widget).style.transform, '');
		assert.strictEqual(busyIndicator(widget).style.top, '');

		// Both boxes resolve to the shared line-height (not the smaller 16px icon size) so they center identically.
		const win = document.defaultView!;
		assert.strictEqual(win.getComputedStyle(actionsContainer(widget)).height, lineHeight);
		const actionsRect = actionsContainer(widget).getBoundingClientRect();

		widget.setBusy(true);
		assert.strictEqual(win.getComputedStyle(busyIndicator(widget)).height, lineHeight);

		// The spinner occupies the exact same box (same top and height) that the
		// action bar it replaces did — the optical-centering fix reported as "the
		// busy spinner is slightly too low" — not a smaller box flush to the bottom.
		const busyRect = busyIndicator(widget).getBoundingClientRect();
		assert.ok(actionsRect.height > 0, 'sanity: the action bar must have measured a non-zero height while visible');
		assert.strictEqual(busyRect.top, actionsRect.top);
		assert.strictEqual(busyRect.height, actionsRect.height);
	});

	test('setPlaceholder does not overwrite an explicitly configured aria-label', () => {
		const widget = createWidget('Ask a question about the selected response text');

		widget.setPlaceholder('New Placeholder');

		assert.strictEqual(widget.inputElement.placeholder, 'New Placeholder');
		assert.strictEqual(widget.inputElement.getAttribute('aria-label'), 'Ask a question about the selected response text');
	});

	test('setPlaceholder keeps the aria-label derived from the placeholder when none was configured', () => {
		const widget = createWidget();
		assert.strictEqual(widget.inputElement.getAttribute('aria-label'), 'Ask Question');

		widget.setPlaceholder('New Placeholder');

		assert.strictEqual(widget.inputElement.getAttribute('aria-label'), 'New Placeholder');
	});
});
