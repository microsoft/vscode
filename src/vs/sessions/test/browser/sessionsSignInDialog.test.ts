/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { createSessionsSignInDialogOptions } from '../../browser/sessionsSignInDialog.js';

suite('Sessions - Sign-In Dialog', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('offers signed-out continuation only when allowed', () => {
		const commandService = new class extends mock<ICommandService>() { }();
		let continueCount = 0;
		const required = createSessionsSignInDialogOptions(commandService, false);
		const optional = createSessionsSignInDialogOptions(commandService, false, true, () => continueCount++);
		const footer = document.createElement('div');
		const footerDisposable = optional.renderDialogFooter?.(footer);
		if (footerDisposable) {
			store.add(footerDisposable);
		}

		optional.onDidDismissDialog?.();
		(footer.lastElementChild as HTMLElement | null)?.click();

		assert.deepStrictEqual({
			required: {
				disableCloseButton: required.disableCloseButton,
				hasFooter: required.renderDialogFooter !== undefined,
				hasDismissHandler: required.onDidDismissDialog !== undefined,
			},
			optional: {
				disableCloseButton: optional.disableCloseButton,
				footerLabels: Array.from(footer.children, child => child.textContent),
				continueCount,
			},
		}, {
			required: {
				disableCloseButton: true,
				hasFooter: false,
				hasDismissHandler: false,
			},
			optional: {
				disableCloseButton: false,
				footerLabels: ['Continue without signing in'],
				continueCount: 2,
			},
		});
	});
});
