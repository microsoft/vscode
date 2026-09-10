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

	ensureNoDisposablesAreLeakedInTestSuite();

	test('offers signed-out continuation only when allowed', () => {
		const commandService = new class extends mock<ICommandService>() { }();
		let continueCount = 0;
		const required = createSessionsSignInDialogOptions(commandService, false);
		const optional = createSessionsSignInDialogOptions(commandService, false, true, () => continueCount++);

		optional.onDidDismissDialog?.();

		assert.deepStrictEqual({
			required: {
				disableCloseButton: required.disableCloseButton,
				allowContinueWithoutSignIn: required.allowContinueWithoutSignIn,
				hasFooter: required.renderDialogFooter !== undefined,
				hasDismissHandler: required.onDidDismissDialog !== undefined,
			},
			optional: {
				disableCloseButton: optional.disableCloseButton,
				allowContinueWithoutSignIn: optional.allowContinueWithoutSignIn,
				hasFooter: optional.renderDialogFooter !== undefined,
				continueCount,
			},
		}, {
			required: {
				disableCloseButton: true,
				allowContinueWithoutSignIn: false,
				hasFooter: false,
				hasDismissHandler: false,
			},
			optional: {
				disableCloseButton: false,
				allowContinueWithoutSignIn: true,
				hasFooter: false,
				continueCount: 1,
			},
		});
	});
});
