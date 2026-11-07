/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../../../base/common/async.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { InlineCompletionTriggerKind } from '../../../../../../../../editor/common/languages.js';
import { MockInlineCompletionsProvider, withAsyncTestCodeEditorAndInlineCompletionsModel } from '../../../../../../../../editor/contrib/inlineCompletions/test/browser/utils.js';
import { IConfigurationChangeEvent } from '../../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { bindChatInputInlineSuggestions, chatInputInlineCompletionsSetting } from '../../../../../browser/widget/input/editor/chatInputInlineSuggestions.js';

suite('Chat input inline suggestions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('requests inline suggestions automatically only while inline completions in chat are enabled', async () => {
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const setEnabled = async (enabled: boolean) => {
			await configurationService.setUserConfiguration(chatInputInlineCompletionsSetting, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
				affectedKeys: new Set([chatInputInlineCompletionsSetting]),
				affectsConfiguration: key => key === chatInputInlineCompletionsSetting,
			}));
		};
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('', { fakeClock: true, provider }, async ({ editor, model, context }) => {
			const binding = bindChatInputInlineSuggestions(editor, configurationService);
			try {
				const getRequests = async (action: () => void) => {
					action();
					await timeout(1000);
					return provider.getAndClearCallHistory();
				};

				const byDefault = await getRequests(() => context.keyboardType('fix '));
				await setEnabled(true);
				const whenEnabled = await getRequests(() => context.keyboardType('the '));
				// Changing the setting moves focus out of the chat input, which ends the active request session.
				model.stop();
				await setEnabled(false);
				const whenDisabledAgain = await getRequests(() => context.keyboardType('bug'));
				const whenTriggeredExplicitly = await getRequests(() => model.triggerExplicitly());

				assert.deepStrictEqual({ byDefault, whenEnabled, whenDisabledAgain, whenTriggeredExplicitly }, {
					byDefault: [],
					whenEnabled: [{ position: '(1,9)', triggerKind: InlineCompletionTriggerKind.Automatic, text: 'fix the ' }],
					whenDisabledAgain: [],
					whenTriggeredExplicitly: [{ position: '(1,12)', triggerKind: InlineCompletionTriggerKind.Explicit, text: 'fix the bug' }],
				});
			} finally {
				binding.dispose();
			}
		});
	});
});
