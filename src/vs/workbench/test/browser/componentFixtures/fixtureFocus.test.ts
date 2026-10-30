/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { applyFixtureFocus, createFixtureUserInteractionService } from './fixtureFocus.js';

suite('Component fixture focus', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('defaults to deterministic focus and leaves focus natural when disabled', () => {
		const first = $('button');
		const second = $('button');
		mainWindow.document.body.append(first, second);
		disposables.add(toDisposable(() => {
			first.remove();
			second.remove();
		}));

		applyFixtureFocus(true, first);
		const defaultActiveElement = mainWindow.document.activeElement;
		applyFixtureFocus(false, second);

		assert.deepStrictEqual({
			defaultFocused: defaultActiveElement === first,
			focusUnchangedWhenDisabled: mainWindow.document.activeElement === first,
		}, {
			defaultFocused: true,
			focusUnchangedWhenDisabled: true,
		});
	});

	test('uses fake focus by default and tracks real DOM focus for the fixture lifetime', async () => {
		const first = $('button');
		const second = $('button');
		mainWindow.document.body.append(first, second);
		disposables.add(toDisposable(() => {
			first.remove();
			second.remove();
		}));

		const fakeStore = disposables.add(new DisposableStore());
		const fakeFocus = createFixtureUserInteractionService().createFocusTracker(first, fakeStore);
		const realStore = disposables.add(new DisposableStore());
		const realService = createFixtureUserInteractionService(false, true);
		first.focus();
		const realFocused = realService.createFocusTracker(first, realStore);
		const realUnfocused = realService.createFocusTracker(second, realStore);
		const simulatedHover = realService.createHoverTracker(first, realStore);
		const duringLifetime = {
			focused: realFocused.get(),
			unfocused: realUnfocused.get(),
		};
		realStore.dispose();
		second.focus();
		await new Promise(resolve => mainWindow.setTimeout(resolve, 0));

		assert.deepStrictEqual({
			fakeFocus: fakeFocus.get(),
			duringLifetime,
			afterLifetime: {
				focused: realFocused.get(),
				unfocused: realUnfocused.get(),
			},
			simulatedHover: simulatedHover.get(),
		}, {
			fakeFocus: true,
			duringLifetime: {
				focused: true,
				unfocused: false,
			},
			afterLifetime: {
				focused: true,
				unfocused: false,
			},
			simulatedHover: true,
		});
	});
});
