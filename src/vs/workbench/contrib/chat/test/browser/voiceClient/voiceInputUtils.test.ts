/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IChatWidget } from '../../../browser/chat.js';
import { acceptVoiceInput, combineVoiceInput } from '../../../browser/voiceClient/voiceInputUtils.js';

suite('combineVoiceInput', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps typed input and appends the transcript', () => {
		assert.deepStrictEqual(
			[
				combineVoiceInput('', 'hello world'),
				combineVoiceInput('please', 'run the tests'),
				combineVoiceInput('please ', 'run the tests'),
				combineVoiceInput('please\n', 'run the tests'),
				combineVoiceInput('draft', ''),
			],
			[
				'hello world',
				'please run the tests',
				'please run the tests',
				'please\nrun the tests',
				'draft',
			]
		);
	});

});

suite('acceptVoiceInput', () => {
		ensureNoDisposablesAreLeakedInTestSuite();

		test('preserves typed input, focus and voice-progress options in the owning widget', async () => {
			const sent: { text: string | undefined; options: Parameters<IChatWidget['acceptInput']>[1] }[] = [];
			const widget = new class extends mock<IChatWidget>() {
				override readonly viewModel = new class extends mock<NonNullable<IChatWidget['viewModel']>>() { }();
				override getInput(): string { return 'Typed draft'; }
				override async acceptInput(text?: string, options?: Parameters<IChatWidget['acceptInput']>[1]) {
					sent.push({ text, options });
					return undefined;
				}
			}();
			await acceptVoiceInput(widget, 'spoken request', true);
			assert.deepStrictEqual(sent, [{ text: 'Typed draft spoken request', options: { preserveFocus: true, isVoiceModeInput: true } }]);
		});

		test('populates an edited request for review rather than submitting it', async () => {
			const populated: { text: string; transient: boolean }[] = [];
			const widget = new class extends mock<IChatWidget>() {
				override readonly viewModel = new class extends mock<NonNullable<IChatWidget['viewModel']>>() {
					override readonly editing = new class extends mock<NonNullable<NonNullable<IChatWidget['viewModel']>['editing']>>() { }();
				}();
				override readonly input = new class extends mock<IChatWidget['input']>() {
					override setValue(text: string, transient: boolean): void { populated.push({ text, transient }); }
				}();
			}();
			const accepted = await acceptVoiceInput(widget, 'replacement', false);
			assert.deepStrictEqual({ accepted, populated, empty: acceptVoiceInput(widget, '', false), missing: acceptVoiceInput(undefined, 'spoken', false) }, {
				accepted: true, populated: [{ text: 'replacement', transient: false }], empty: false, missing: false,
		});
	});
});
