/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { DEFAULT_LOCAL_TRANSCRIPTION_MODEL } from '../../../../../platform/localTranscription/common/localTranscription.js';
import { DICTATION_MAI_MODEL_ID, DICTATION_MODEL_SETTING } from '../../browser/speechToText/chatSpeechToTextService.js';
import { getDictationDownloadHoverMarkdown } from '../../browser/speechToText/dictationDownloadRing.js';
import { getDictationHoverMarkdown, getVoiceModeHoverContent } from '../../browser/speechToText/micButtonHovers.js';

suite('MicButtonHovers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses user-facing names for supported dictation models', () => {
		const onDevice = new TestConfigurationService({ [DICTATION_MODEL_SETTING]: DEFAULT_LOCAL_TRANSCRIPTION_MODEL });
		const cloud = new TestConfigurationService({ [DICTATION_MODEL_SETTING]: DICTATION_MAI_MODEL_ID });
		const webFallback = new TestConfigurationService({ [DICTATION_MODEL_SETTING]: DEFAULT_LOCAL_TRANSCRIPTION_MODEL });

		assert.deepStrictEqual({
			onDevice: getDictationHoverMarkdown('Dictate', onDevice, false).value,
			cloud: getDictationHoverMarkdown('Dictate', cloud, false).value,
			webFallback: getDictationHoverMarkdown('Dictate', webFallback, true).value,
		}, {
			onDevice: '**Dictate**\n\nTypes what you say into the input. Transcribes on-device with the Nemotron 3.5 ASR multilingual model.',
			cloud: '**Dictate**\n\nTypes what you say into the input. Transcribes in the cloud with the MAI speech model.',
			webFallback: '**Dictate**\n\nTypes what you say into the input. Transcribes in the cloud with the MAI speech model.',
		});
	});

	test('describes the model download while dictation is preparing', () => {
		assert.strictEqual(getDictationDownloadHoverMarkdown({ currentBackend: 'nemo' }).value, '**Downloading local model**\n\nThis happens only the first time you dictate. Click to cancel.');
	});

	test('identifies GPT Live in the voice hover only when it is in use', () => {
		assert.deepStrictEqual(
			[false, true, false].map(isUsingGptLive => getVoiceModeHoverContent('Voice Mode', isUsingGptLive)),
			[false, true, false].map(isUsingGptLive => {
				const description = isUsingGptLive
					? 'Talk with the agent and hear it reply. Uses OpenAI GPT Live for real-time voice.'
					: 'Talk with the agent and hear it reply. Uses the online real-time voice model.';
				return {
					markdown: new MarkdownString(`**Voice Mode**\n\n${description}`, { supportThemeIcons: true }),
					markdownNotSupportedFallback: `Voice Mode\n${description}`,
				};
			}),
		);
	});
});
