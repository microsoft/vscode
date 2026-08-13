/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	AbstractDialogHandler, IAsyncPromptResult, IConfirmation, IConfirmationResult,
	IInput, IInputResult, IPrompt, IPromptButton
} from '../../common/dialogs.js';

class TestDialogHandler extends AbstractDialogHandler {

	async confirm(_confirmation: IConfirmation): Promise<IConfirmationResult> {
		throw new Error('not implemented');
	}

	async input(_input: IInput): Promise<IInputResult> {
		throw new Error('not implemented');
	}

	async prompt<T>(_prompt: IPrompt<T>): Promise<IAsyncPromptResult<T>> {
		throw new Error('not implemented');
	}

	async about(): Promise<void> {
		throw new Error('not implemented');
	}

	testGetPromptResult<T>(prompt: IPrompt<T>, buttonIndex: number): IAsyncPromptResult<T> {
		return this.getPromptResult(prompt, buttonIndex, undefined);
	}
}

suite('AbstractDialogHandler', () => {

	test('getPromptResult runs the button addressed by a valid index', async () => {
		const handler = new TestDialogHandler();

		let ranPrimary = false;
		let ranCancel = false;

		const primary: IPromptButton<void> = { label: 'Primary', run: () => { ranPrimary = true; } };
		const prompt: IPrompt<void> = {
			message: 'message',
			buttons: [primary],
			cancelButton: { run: () => { ranCancel = true; } }
		};

		await handler.testGetPromptResult(prompt, 0).result!;

		strictEqual(ranPrimary, true);
		strictEqual(ranCancel, false);
	});

	test('getPromptResult falls back to the cancel button for an out-of-range index instead of running nothing', async () => {
		// Regression test for https://github.com/microsoft/vscode/issues/329901:
		// an out-of-range button index (for example forwarded from a native
		// dialog handler that received an unexpected Electron response) must
		// not silently resolve with no button's action having run.
		const handler = new TestDialogHandler();

		let ranPrimary = false;
		let ranCancel = false;

		const primary: IPromptButton<void> = { label: 'Primary', run: () => { ranPrimary = true; } };
		const prompt: IPrompt<void> = {
			message: 'message',
			buttons: [primary],
			cancelButton: { run: () => { ranCancel = true; } }
		};

		await handler.testGetPromptResult(prompt, 420).result!;

		strictEqual(ranPrimary, false);
		strictEqual(ranCancel, true);
	});

	test('getPromptResult with an out-of-range index and no cancel button resolves without running any action', async () => {
		// When the prompt has no dedicated cancel button there is nothing
		// safe to fall back to; this preserves today's behavior rather than
		// running an unrelated (and potentially destructive) button.
		const handler = new TestDialogHandler();

		let ranPrimary = false;
		const primary: IPromptButton<void> = { label: 'Primary', run: () => { ranPrimary = true; } };
		const prompt: IPrompt<void> = {
			message: 'message',
			buttons: [primary]
		};

		const result = await handler.testGetPromptResult(prompt, 420).result!;

		strictEqual(ranPrimary, false);
		strictEqual(result, undefined);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
