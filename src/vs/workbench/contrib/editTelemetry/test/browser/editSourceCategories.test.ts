/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ProviderId } from '../../../../../editor/common/languages.js';
import { EditSources } from '../../../../../editor/common/textModelEditSource.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditSourceBase } from '../../browser/helpers/documentWithAnnotatedEdits.js';
import { getEditTelemetryCategory } from '../../browser/telemetry/editSourceTrackingImpl.js';

suite('Edit Telemetry Source Categories', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps every edit source category', () => {
		const sources = {
			chat: EditSources.chatApplyEdits({
				modelId: undefined,
				sessionId: undefined,
				requestId: undefined,
				languageId: 'typescript',
				mode: 'agent',
				extensionId: undefined,
				codeBlockSuggestionId: undefined,
			}),
			copilotCompletion: EditSources.inlineCompletionAccept({
				nes: false,
				requestUuid: 'request-1',
				languageId: 'typescript',
				providerId: new ProviderId('github.copilot', '1.0.0', 'completions'),
				correlationId: undefined,
			}),
			copilotChatCompletion: EditSources.inlineCompletionAccept({
				nes: false,
				requestUuid: 'request-2',
				languageId: 'typescript',
				providerId: new ProviderId('github.copilot-chat', '1.0.0', 'completions'),
				correlationId: undefined,
			}),
			nes: EditSources.inlineCompletionAccept({
				nes: true,
				requestUuid: 'request-3',
				languageId: 'typescript',
				providerId: new ProviderId('github.copilot-chat', '1.0.0', 'nes'),
				correlationId: undefined,
			}),
			inlineNesProvider: EditSources.inlineCompletionAccept({
				nes: false,
				requestUuid: 'request-4',
				languageId: 'typescript',
				providerId: new ProviderId('github.copilot-chat', '1.0.0', 'nes'),
				correlationId: undefined,
			}),
			otherCompletion: EditSources.inlineCompletionAccept({
				nes: false,
				requestUuid: 'request-5',
				languageId: 'typescript',
				providerId: new ProviderId('other.extension', '1.0.0', 'other'),
				correlationId: undefined,
			}),
			user: EditSources.cursor({ kind: 'type' }),
			snippet: EditSources.snippet(),
			format: EditSources.unknown({ name: 'formatEditsCommand' }),
			external: EditSources.reloadFromDisk(),
			unknown: EditSources.unknown({}),
		};

		assert.deepStrictEqual(Object.fromEntries(Object.entries(sources).map(([key, source]) => [
			key,
			getEditTelemetryCategory(EditSourceBase.create(source)),
		])), {
			chat: 'otherAI',
			copilotCompletion: 'inlineCompletionsCopilot',
			copilotChatCompletion: 'inlineCompletionsCopilot',
			nes: 'nes',
			inlineNesProvider: 'inlineCompletionsNES',
			otherCompletion: 'inlineCompletionsOther',
			user: 'user',
			snippet: 'ide',
			format: 'ide',
			external: 'external',
			unknown: 'unknown',
		});
	});
});
