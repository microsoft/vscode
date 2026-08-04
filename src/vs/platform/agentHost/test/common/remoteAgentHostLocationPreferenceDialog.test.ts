/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import Severity from '../../../../base/common/severity.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfirmation, IConfirmationResult, IDialogService, IInputResult, IPrompt, IPromptResult, IPromptResultWithCancel, IPromptWithCustomCancel, IPromptWithDefaultCancel } from '../../../dialogs/common/dialogs.js';
import {
	orderRemoteAgentHostLocationOptions,
	promptRemoteAgentHostLocationPreference,
} from '../../common/remoteAgentHostLocationPreferenceDialog.js';

/** Captures the last `prompt()` call so tests can assert its exact shape without a real dialog UI. */
class CapturingDialogService implements IDialogService {
	declare readonly _serviceBrand: undefined;
	readonly onWillShowDialog = Event.None;
	readonly onDidShowDialog = Event.None;

	lastPrompt: IPrompt<unknown> | undefined;

	/** Index of the button to invoke, or `undefined` to invoke the cancel button (simulating a user cancel). */
	constructor(private readonly buttonIndexToInvoke: number | undefined) { }

	async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		throw new Error('not implemented');
	}

	prompt<T>(prompt: IPromptWithCustomCancel<T>): Promise<IPromptResultWithCancel<T>>;
	prompt<T>(prompt: IPromptWithDefaultCancel<T>): Promise<IPromptResult<T>>;
	prompt<T>(prompt: IPrompt<T>): Promise<IPromptResult<T>>;
	async prompt<T>(prompt: IPrompt<T> | IPromptWithCustomCancel<T>): Promise<IPromptResult<T> | IPromptResultWithCancel<T>> {
		this.lastPrompt = prompt;
		if (this.buttonIndexToInvoke === undefined) {
			return { result: undefined };
		}
		const button = prompt.buttons?.[this.buttonIndexToInvoke];
		return { result: await button?.run({ checkboxChecked: false }) };
	}

	async info(): Promise<void> { }
	async warn(): Promise<void> { }
	async error(): Promise<void> { }
	async input(): Promise<IInputResult> { return { confirmed: true, values: [] }; }
	async about(): Promise<void> { }
}

suite('promptRemoteAgentHostLocationPreference', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('presents the localized message with the host label substituted', async () => {
		const dialogService = new CapturingDialogService(0);
		await promptRemoteAgentHostLocationPreference(dialogService, 'my-remote-host');

		assert.strictEqual(dialogService.lastPrompt?.message, 'Where should agents run on my-remote-host?');
	});

	test('reminder detail contains the exact source command name', async () => {
		const dialogService = new CapturingDialogService(0);
		await promptRemoteAgentHostLocationPreference(dialogService, 'my-remote-host');

		assert.strictEqual(
			dialogService.lastPrompt?.detail,
			'You can change this later with the Chat: Change Preferred Remote Agent Location command.',
		);
	});

	test('offers exactly two buttons with the exact localized labels and details, a cancel button, and the remote icon', async () => {
		const dialogService = new CapturingDialogService(0);
		await promptRemoteAgentHostLocationPreference(dialogService, 'my-remote-host');

		const prompt = dialogService.lastPrompt!;
		assert.strictEqual(prompt.type, Severity.Info);
		assert.strictEqual(prompt.cancelButton, true);
		assert.strictEqual(prompt.buttons?.length, 2);
		assert.deepStrictEqual(prompt.buttons!.map(b => b.label), ['Dedicated Agent Host', 'VS Code Editor']);
		assert.deepStrictEqual((prompt as unknown as { custom: { buttonDetails: string[] } }).custom.buttonDetails, [
			'Runs independently and stays available while agents are active.',
			'Runs in a remote VS Code window and stops when that window closes.',
		]);
		assert.strictEqual((prompt as unknown as { custom: { icon: unknown } }).custom.icon, Codicon.remote);
	});

	test('resolves to the chosen preference', async () => {
		const dedicated = new CapturingDialogService(0);
		assert.strictEqual(await promptRemoteAgentHostLocationPreference(dedicated, 'host'), 'dedicated');

		const editor = new CapturingDialogService(1);
		assert.strictEqual(await promptRemoteAgentHostLocationPreference(editor, 'host'), 'editor');
	});

	test('resolves to undefined when the user cancels', async () => {
		const dialogService = new CapturingDialogService(undefined);
		assert.strictEqual(await promptRemoteAgentHostLocationPreference(dialogService, 'host'), undefined);
	});

	test('forwards the provided cancellation token to the dialog prompt', async () => {
		const dialogService = new CapturingDialogService(0);
		const cts = new CancellationTokenSource();
		try {
			await promptRemoteAgentHostLocationPreference(dialogService, 'host', undefined, cts.token);
			assert.strictEqual(dialogService.lastPrompt?.token, cts.token);
		} finally {
			cts.dispose();
		}
	});

	test('omits the token when none is provided', async () => {
		const dialogService = new CapturingDialogService(0);
		await promptRemoteAgentHostLocationPreference(dialogService, 'host');
		assert.strictEqual(dialogService.lastPrompt?.token, undefined);
	});
});

suite('orderRemoteAgentHostLocationOptions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the default order when there is no current preference', () => {
		const options = orderRemoteAgentHostLocationOptions(undefined);
		assert.deepStrictEqual(options.map(o => o.preference), ['dedicated', 'editor']);
	});

	test('puts the current preference first when it is "editor"', () => {
		const options = orderRemoteAgentHostLocationOptions('editor');
		assert.deepStrictEqual(options.map(o => o.preference), ['editor', 'dedicated']);
	});

	test('keeps the default order when the current preference is already first', () => {
		const options = orderRemoteAgentHostLocationOptions('dedicated');
		assert.deepStrictEqual(options.map(o => o.preference), ['dedicated', 'editor']);
	});

	test('never drops or duplicates an option regardless of current preference', () => {
		for (const current of [undefined, 'dedicated', 'editor'] as const) {
			const options = orderRemoteAgentHostLocationOptions(current);
			assert.strictEqual(options.length, 2);
			assert.deepStrictEqual(new Set(options.map(o => o.preference)), new Set(['dedicated', 'editor']));
		}
	});
});
