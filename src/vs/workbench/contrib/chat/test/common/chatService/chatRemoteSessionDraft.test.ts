/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { buildRestoredRemoteSessionDraft } from '../../../common/chatService/chatServiceImpl.js';
import { ChatModeKind } from '../../../common/constants.js';
import { ILanguageModelChatMetadata } from '../../../common/languageModels.js';
import { ISerializableChatModelInputState } from '../../../common/model/chatModel.js';

const METADATA = {} as ILanguageModelChatMetadata;

function storedInputState(selectedModel: ISerializableChatModelInputState['selectedModel']): ISerializableChatModelInputState {
	return {
		attachments: [],
		mode: { id: 'agent', kind: ChatModeKind.Agent },
		selectedModel,
		inputText: 'unsent draft',
		selections: [],
		contrib: {},
	};
}

suite('buildRestoredRemoteSessionDraft', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns undefined when there is no persisted draft', () => {
		assert.strictEqual(buildRestoredRemoteSessionDraft(undefined, { identifier: 'm', metadata: METADATA }), undefined);
	});

	test('carries the persisted per-model configuration onto the history-derived model of the same id (regression for #320393)', () => {
		// The agent-host reload bug: replacing the persisted selectedModel with the
		// history-derived one must NOT drop the nested context-size configuration.
		const stored = storedInputState({ identifier: 'copilot:opus', metadata: METADATA, modelConfiguration: { contextSize: 936_000, thinkingLevel: 'low' } });

		const result = buildRestoredRemoteSessionDraft(stored, { identifier: 'copilot:opus', metadata: METADATA });

		assert.deepStrictEqual(result, {
			...stored,
			selectedModel: { identifier: 'copilot:opus', metadata: METADATA, modelConfiguration: { contextSize: 936_000, thinkingLevel: 'low' } },
		});
	});

	test('drops the configuration when the history-derived model is a different model', () => {
		// Config is model-specific: a stale persisted model from another pool must not
		// leak its configuration onto a different resolved model.
		const stored = storedInputState({ identifier: 'copilot:opus', metadata: METADATA, modelConfiguration: { contextSize: 936_000 } });

		const result = buildRestoredRemoteSessionDraft(stored, { identifier: 'agent-host:opus', metadata: METADATA });

		assert.deepStrictEqual(result?.selectedModel, { identifier: 'agent-host:opus', metadata: METADATA, modelConfiguration: undefined });
	});

	test('keeps the unsent draft but clears the model when no history model is available', () => {
		const stored = storedInputState({ identifier: 'copilot:opus', metadata: METADATA, modelConfiguration: { contextSize: 936_000 } });

		const result = buildRestoredRemoteSessionDraft(stored, undefined);

		assert.deepStrictEqual(
			{ selectedModel: result?.selectedModel, inputText: result?.inputText },
			{ selectedModel: undefined, inputText: 'unsent draft' },
		);
	});

	test('does not throw when the persisted draft has no selectedModel', () => {
		const stored = storedInputState(undefined);

		const result = buildRestoredRemoteSessionDraft(stored, { identifier: 'copilot:opus', metadata: METADATA });

		assert.deepStrictEqual(result?.selectedModel, { identifier: 'copilot:opus', metadata: METADATA, modelConfiguration: undefined });
	});
});
