/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { createMarkdownCommandLink, IMarkdownString } from '../../../../base/common/htmlContent.js';
import Severity from '../../../../base/common/severity.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfirmation, IConfirmationResult, IDialogService, IInputResult, IPrompt, IPromptResult, IPromptResultWithCancel, IPromptWithCustomCancel, IPromptWithDefaultCancel } from '../../../dialogs/common/dialogs.js';
import {
	ChangeRemoteAgentHostLocationPreferenceCommandId,
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

	const productName = 'Test Product';

	test('presents the localized message with the host label substituted', async () => {
		const dialogService = new CapturingDialogService(0);
		await promptRemoteAgentHostLocationPreference(dialogService, 'my-remote-host', productName);

		assert.strictEqual(dialogService.lastPrompt?.message, 'How long should agents keep running on my-remote-host?');
	});

	test('exports the exact command id registered by the sessions-layer "Chat: Change Preferred Remote Agent Location" command', () => {
		// The sessions layer cannot be imported here (platform cannot depend
		// on it), so this literal is the contract the sessions-layer command
		// registration must match when it consumes this exported constant.
		assert.strictEqual(ChangeRemoteAgentHostLocationPreferenceCommandId, 'workbench.action.sessions.changeRemoteAgentHostLocationPreference');
	});

	test('reminder detail is a Markdown string with the exact source command name shown in bold as a command link', async () => {
		const dialogService = new CapturingDialogService(0);
		await promptRemoteAgentHostLocationPreference(dialogService, 'my-remote-host', productName);

		const detail = dialogService.lastPrompt?.detail as IMarkdownString;
		const changeCommandLabel = 'Chat: Change Preferred Remote Agent Location';
		const expectedLink = createMarkdownCommandLink({
			text: changeCommandLabel,
			id: ChangeRemoteAgentHostLocationPreferenceCommandId,
			tooltip: changeCommandLabel,
		});

		assert.strictEqual(typeof detail, 'object', 'detail should be an IMarkdownString, not a plain string');
		assert.strictEqual(detail.value, `You can change this later with the **${expectedLink}** command.`);
		// The command link is bold and only its own command id is trusted -
		// not a blanket `isTrusted: true` - so no other command can be invoked
		// from this detail text.
		assert.deepStrictEqual(detail.isTrusted, { enabledCommands: [ChangeRemoteAgentHostLocationPreferenceCommandId] });
	});

	test('offers exactly two buttons with the exact localized labels and details, a cancel button, the remote icon, and a vertical layout', async () => {
		const dialogService = new CapturingDialogService(0);
		await promptRemoteAgentHostLocationPreference(dialogService, 'my-remote-host', productName);

		const prompt = dialogService.lastPrompt!;
		assert.strictEqual(prompt.type, Severity.Info);
		assert.strictEqual(prompt.cancelButton, true);
		assert.strictEqual(prompt.buttons?.length, 2);
		assert.deepStrictEqual(prompt.buttons!.map(b => b.label), [
			'Keep My Agents Running in a Dedicated Process',
			'Stop My Agents if I Close Test Product',
		]);
		assert.deepStrictEqual((prompt as unknown as { custom: { buttonDetails: string[] } }).custom.buttonDetails, [
			'Agents continue after you close Test Product and stop when their work finishes.',
			'Agents are available only while the remote Test Product window is open.',
		]);
		assert.strictEqual((prompt as unknown as { custom: { icon: unknown } }).custom.icon, Codicon.remote);
		assert.strictEqual((prompt as unknown as { custom: { alignment: unknown } }).custom.alignment, 'vertical');
	});

	test('substitutes the given product name into the option copy, not a literal', async () => {
		const dialogService = new CapturingDialogService(0);
		await promptRemoteAgentHostLocationPreference(dialogService, 'my-remote-host', 'Other IDE');

		assert.deepStrictEqual({
			labels: dialogService.lastPrompt?.buttons?.map(button => button.label),
			details: (dialogService.lastPrompt as unknown as { custom: { buttonDetails: string[] } }).custom.buttonDetails,
		}, {
			labels: [
				'Keep My Agents Running in a Dedicated Process',
				'Stop My Agents if I Close Other IDE',
			],
			details: [
				'Agents continue after you close Other IDE and stop when their work finishes.',
				'Agents are available only while the remote Other IDE window is open.',
			],
		});
	});

	test('resolves to the chosen preference', async () => {
		const dedicated = new CapturingDialogService(0);
		assert.strictEqual(await promptRemoteAgentHostLocationPreference(dedicated, 'host', productName), 'dedicated');

		const editor = new CapturingDialogService(1);
		assert.strictEqual(await promptRemoteAgentHostLocationPreference(editor, 'host', productName), 'editor');
	});

	test('resolves to undefined when the user cancels', async () => {
		const dialogService = new CapturingDialogService(undefined);
		assert.strictEqual(await promptRemoteAgentHostLocationPreference(dialogService, 'host', productName), undefined);
	});

	test('forwards the provided cancellation token to the dialog prompt', async () => {
		const dialogService = new CapturingDialogService(0);
		const cts = new CancellationTokenSource();
		try {
			await promptRemoteAgentHostLocationPreference(dialogService, 'host', productName, undefined, cts.token);
			assert.strictEqual(dialogService.lastPrompt?.token, cts.token);
		} finally {
			cts.dispose();
		}
	});

	test('omits the token when none is provided', async () => {
		const dialogService = new CapturingDialogService(0);
		await promptRemoteAgentHostLocationPreference(dialogService, 'host', productName);
		assert.strictEqual(dialogService.lastPrompt?.token, undefined);
	});

	test('marks the current preference\'s detail with "(Current)", reordered first, when the host currently prefers "editor"', async () => {
		const dialogService = new CapturingDialogService(0);
		await promptRemoteAgentHostLocationPreference(dialogService, 'my-remote-host', productName, 'editor');

		const prompt = dialogService.lastPrompt!;
		assert.deepStrictEqual(prompt.buttons!.map(b => b.label), [
			'Stop My Agents if I Close Test Product',
			'Keep My Agents Running in a Dedicated Process',
		], 'the current preference is still reordered first');
		assert.deepStrictEqual((prompt as unknown as { custom: { buttonDetails: string[] } }).custom.buttonDetails, [
			'Agents are available only while the remote Test Product window is open. (Current)',
			'Agents continue after you close Test Product and stop when their work finishes.',
		]);
	});

	test('marks the current preference\'s detail with "(Current)" when the host currently prefers "dedicated"', async () => {
		const dialogService = new CapturingDialogService(0);
		await promptRemoteAgentHostLocationPreference(dialogService, 'my-remote-host', productName, 'dedicated');

		const prompt = dialogService.lastPrompt!;
		assert.deepStrictEqual((prompt as unknown as { custom: { buttonDetails: string[] } }).custom.buttonDetails, [
			'Agents continue after you close Test Product and stop when their work finishes. (Current)',
			'Agents are available only while the remote Test Product window is open.',
		]);
	});

	test('adds no "(Current)" marker to either option when there is no current preference', async () => {
		const dialogService = new CapturingDialogService(0);
		await promptRemoteAgentHostLocationPreference(dialogService, 'my-remote-host', productName, undefined);

		const prompt = dialogService.lastPrompt!;
		const details = (prompt as unknown as { custom: { buttonDetails: string[] } }).custom.buttonDetails;
		assert.ok(details.every(detail => !detail.includes('Current')), 'no detail should mention "Current" when there is no saved preference');
	});
});

suite('orderRemoteAgentHostLocationOptions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const productName = 'Test Product';

	test('keeps the default order when there is no current preference', () => {
		const options = orderRemoteAgentHostLocationOptions(productName, undefined);
		assert.deepStrictEqual(options.map(o => o.preference), ['dedicated', 'editor']);
	});

	test('puts the current preference first when it is "editor"', () => {
		const options = orderRemoteAgentHostLocationOptions(productName, 'editor');
		assert.deepStrictEqual(options.map(o => o.preference), ['editor', 'dedicated']);
	});

	test('keeps the default order when the current preference is already first', () => {
		const options = orderRemoteAgentHostLocationOptions(productName, 'dedicated');
		assert.deepStrictEqual(options.map(o => o.preference), ['dedicated', 'editor']);
	});

	test('never drops or duplicates an option regardless of current preference', () => {
		for (const current of [undefined, 'dedicated', 'editor'] as const) {
			const options = orderRemoteAgentHostLocationOptions(productName, current);
			assert.strictEqual(options.length, 2);
			assert.deepStrictEqual(new Set(options.map(o => o.preference)), new Set(['dedicated', 'editor']));
		}
	});

	test('marks the current option\'s detail with "(Current)" after reordering, for both "dedicated" and "editor"', () => {
		const dedicatedFirst = orderRemoteAgentHostLocationOptions(productName, 'dedicated');
		assert.strictEqual(dedicatedFirst[0].preference, 'dedicated');
		assert.ok(dedicatedFirst[0].detail.endsWith('(Current)'));
		assert.ok(!dedicatedFirst[1].detail.includes('Current'));

		const editorFirst = orderRemoteAgentHostLocationOptions(productName, 'editor');
		assert.strictEqual(editorFirst[0].preference, 'editor');
		assert.ok(editorFirst[0].detail.endsWith('(Current)'));
		assert.ok(!editorFirst[1].detail.includes('Current'));
	});

	test('adds no "(Current)" marker to any option when there is no current preference', () => {
		const options = orderRemoteAgentHostLocationOptions(productName, undefined);
		assert.ok(options.every(option => !option.detail.includes('Current')));
	});
});
