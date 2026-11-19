/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IChatWidget } from '../../../browser/chat.js';
import { getPromptTimelineRailStyle, isStickyPromptHeaderShown } from '../../../browser/promptTimeline/promptTimelineWidgetContrib.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../common/constants.js';
import { PromptTimelineRailStyle, PROMPT_TIMELINE_DISPLAY_SETTING, PROMPT_TIMELINE_STICKY_SCROLL_SETTING } from '../../../common/promptTimeline.js';

suite('PromptTimeline visibility', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function widget(location: ChatAgentLocation, rendersInputOnTop: boolean): IChatWidget {
		return { location, rendersInputOnTop } as unknown as IChatWidget;
	}

	test('is shown only for enabled transcript hosts that render their input below the transcript', () => {
		const enabled = new TestConfigurationService({
			[PROMPT_TIMELINE_STICKY_SCROLL_SETTING]: true,
			[ChatConfiguration.ExperimentalStickyScrollEnabled]: false,
		});
		const pendingTreeStickyScroll = new TestConfigurationService({ [PROMPT_TIMELINE_STICKY_SCROLL_SETTING]: true });
		const disabled = new TestConfigurationService({ [PROMPT_TIMELINE_STICKY_SCROLL_SETTING]: false });
		const experimentalTreeStickyScroll = new TestConfigurationService({
			[PROMPT_TIMELINE_STICKY_SCROLL_SETTING]: true,
			[ChatConfiguration.ExperimentalStickyScrollEnabled]: true,
		});

		assert.deepStrictEqual({
			chatTranscript: isStickyPromptHeaderShown(widget(ChatAgentLocation.Chat, false), enabled),
			pendingTreeStickyScroll: isStickyPromptHeaderShown(widget(ChatAgentLocation.Chat, false), pendingTreeStickyScroll),
			settingOff: isStickyPromptHeaderShown(widget(ChatAgentLocation.Chat, false), disabled),
			experimentalTreeStickyScroll: isStickyPromptHeaderShown(widget(ChatAgentLocation.Chat, false), experimentalTreeStickyScroll),
			// Quick chat and the new-session composer render their input on top, so no header is mounted.
			inputOnTop: isStickyPromptHeaderShown(widget(ChatAgentLocation.Chat, true), enabled),
			otherLocation: isStickyPromptHeaderShown(widget(ChatAgentLocation.EditorInline, false), enabled),
		}, {
			chatTranscript: true,
			pendingTreeStickyScroll: false,
			settingOff: false,
			experimentalTreeStickyScroll: false,
			inputOnTop: false,
			otherLocation: false,
		});
	});

	test('rail style: the Agents window shows the chosen style, other windows show the gutter unless off', () => {
		const transcript = widget(ChatAgentLocation.Chat, false);
		const config = (display: PromptTimelineRailStyle) => new TestConfigurationService({ [PROMPT_TIMELINE_DISPLAY_SETTING]: display });

		assert.deepStrictEqual({
			sessionsRuler: getPromptTimelineRailStyle(transcript, config('ruler'), true),
			sessionsOff: getPromptTimelineRailStyle(transcript, config('off'), true),
			editorGutter: getPromptTimelineRailStyle(transcript, config('gutter'), false),
			editorRuler: getPromptTimelineRailStyle(transcript, config('ruler'), false),
			editorOff: getPromptTimelineRailStyle(transcript, config('off'), false),
			inputOnTop: getPromptTimelineRailStyle(widget(ChatAgentLocation.Chat, true), config('gutter'), false),
			otherLocation: getPromptTimelineRailStyle(widget(ChatAgentLocation.EditorInline, false), config('gutter'), true),
		}, {
			sessionsRuler: 'ruler',
			sessionsOff: 'off',
			editorGutter: 'gutter',
			editorRuler: 'gutter',
			editorOff: 'off',
			inputOnTop: 'off',
			otherLocation: 'off',
		});
	});
});
