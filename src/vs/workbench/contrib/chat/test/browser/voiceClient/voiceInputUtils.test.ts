/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { IChatWidget } from '../../../browser/chat.js';
import { acceptVoiceInput, combineVoiceInput } from '../../../browser/voiceClient/voiceInputUtils.js';
import { ChatRequestQueueKind } from '../../../common/chatService/chatService.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { IChatModel } from '../../../common/model/chatModel.js';

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

	for (const inProgress of [false, true]) {
		test(`preserves typed input, focus and voice-progress options and ${inProgress ? 'steers an active request' : 'sends normally when idle'}`, async () => {
			const sent: { text: string | undefined; options: Parameters<IChatWidget['acceptInput']>[1] }[] = [];
			const widget = new class extends mock<IChatWidget>() {
				override readonly viewModel = new class extends mock<NonNullable<IChatWidget['viewModel']>>() {
					override readonly model = new class extends mock<IChatModel>() {
						override readonly requestInProgress = constObservable(inProgress);
					}();
				}();
				override getInput(): string { return 'Typed draft'; }
				override async acceptInput(text?: string, options?: Parameters<IChatWidget['acceptInput']>[1]) {
					sent.push({ text, options });
					return undefined;
				}
			}();
			await acceptVoiceInput(widget, 'spoken request', true);
			assert.deepStrictEqual(sent, [{
				text: 'Typed draft spoken request',
				options: { preserveFocus: true, isVoiceModeInput: true, ...(inProgress ? { queue: ChatRequestQueueKind.Steering } : {}) },
			}]);
		});
	}

	for (const hasModel of [false, true]) {
		test(`submits normally when ${hasModel ? 'request progress' : 'the model'} is unavailable`, async () => {
			const sent: { text: string | undefined; options: Parameters<IChatWidget['acceptInput']>[1] }[] = [];
			const widget = new class extends mock<IChatWidget>() {
				override readonly viewModel = upcastPartial<NonNullable<IChatWidget['viewModel']>>({
					...(hasModel ? { model: upcastPartial<IChatModel>({}) } : {}),
				});
				override getInput(): string { return 'Typed draft'; }
				override async acceptInput(text?: string, options?: Parameters<IChatWidget['acceptInput']>[1]) {
					sent.push({ text, options });
					return undefined;
				}
			}();
			await acceptVoiceInput(widget, 'spoken request', true);
			assert.deepStrictEqual(sent, [{
				text: 'Typed draft spoken request',
				options: { preserveFocus: true, isVoiceModeInput: true },
			}]);
		});
	}

	test('rejects input when the widget has no view model', () => {
		const widget = new class extends mock<IChatWidget>() { }();
		assert.strictEqual(acceptVoiceInput(widget, 'spoken request', true), false);
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
			accepted: false, populated: [{ text: 'replacement', transient: false }], empty: false, missing: false,
		});
	});
});
