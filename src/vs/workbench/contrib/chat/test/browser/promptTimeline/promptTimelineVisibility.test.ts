/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IChatWidget } from '../../../browser/chat.js';
import { isStickyPromptHeaderShown } from '../../../browser/promptTimeline/promptTimelineWidgetContrib.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { PROMPT_TIMELINE_STICKY_HEADER_SETTING } from '../../../common/promptTimeline.js';

suite('PromptTimeline visibility', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function widget(location: ChatAgentLocation, rendersInputOnTop: boolean): IChatWidget {
		return { location, rendersInputOnTop } as unknown as IChatWidget;
	}

	test('is shown only for enabled transcript hosts that render their input below the transcript', () => {
		const enabled = new TestConfigurationService({ [PROMPT_TIMELINE_STICKY_HEADER_SETTING]: true });
		const disabled = new TestConfigurationService({ [PROMPT_TIMELINE_STICKY_HEADER_SETTING]: false });

		assert.deepStrictEqual({
			chatTranscript: isStickyPromptHeaderShown(widget(ChatAgentLocation.Chat, false), enabled),
			settingOff: isStickyPromptHeaderShown(widget(ChatAgentLocation.Chat, false), disabled),
			// Quick chat and the new-session composer render their input on top, so no header is mounted.
			inputOnTop: isStickyPromptHeaderShown(widget(ChatAgentLocation.Chat, true), enabled),
			otherLocation: isStickyPromptHeaderShown(widget(ChatAgentLocation.EditorInline, false), enabled),
		}, {
			chatTranscript: true,
			settingOff: false,
			inputOnTop: false,
			otherLocation: false,
		});
	});
});
