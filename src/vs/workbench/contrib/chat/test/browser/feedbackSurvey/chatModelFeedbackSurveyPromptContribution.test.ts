/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatModelFeedbackSurveyPromptContribution } from '../../../browser/feedbackSurvey/chatModelFeedbackSurveyPromptContribution.js';
import { IChatModelFeedbackSurveyService } from '../../../browser/feedbackSurvey/chatModelFeedbackSurveyService.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { MockChatModelFeedbackSurveyService } from './mockChatModelFeedbackSurveyService.js';

suite('ChatModelFeedbackSurveyPromptContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const sessionOne = URI.parse('vscode-chat-editor://session-1');
	const sessionTwo = URI.parse('vscode-chat-editor://session-2');

	function createHarness() {
		const switches: { from: string; to: string; session: string }[] = [];
		const selectedModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('selectedModel', undefined);
		const onDidChangeViewModel = store.add(new Emitter<void>());
		let sessionResource: URI | undefined;

		const widget = {
			input: { selectedLanguageModel: selectedModel },
			onDidChangeViewModel: onDidChangeViewModel.event,
			get viewModel() { return sessionResource ? { sessionResource } : undefined; },
		} as unknown as IChatWidget;

		const surveyService = new MockChatModelFeedbackSurveyService();
		surveyService.notifyModelSwitchedAway = (session, from, to) => {
			switches.push({ from, to, session: session.toString() });
		};

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatWidgetService, {
			getAllWidgets: () => [widget],
			onDidAddWidget: Event.None,
			onDidRemoveWidget: Event.None,
		} as unknown as IChatWidgetService);
		instantiationService.stub(IChatModelFeedbackSurveyService, surveyService);
		store.add(instantiationService.createInstance(ChatModelFeedbackSurveyPromptContribution));

		return {
			switches,
			selectModel: (identifier: string) => selectedModel.set({ identifier } as ILanguageModelChatMetadataAndIdentifier, undefined),
			loadSession: (resource: URI | undefined) => {
				sessionResource = resource;
				onDidChangeViewModel.fire();
			},
		};
	}

	test('reports the user moving from one model to another', () => {
		const harness = createHarness();
		harness.loadSession(sessionOne);

		harness.selectModel('copilot/auto');
		harness.selectModel('copilot/gpt-5.2');

		assert.deepStrictEqual(harness.switches, [{ from: 'copilot/auto', to: 'copilot/gpt-5.2', session: sessionOne.toString() }]);
	});

	test('reports a switch when the model resolved before the session finished loading', () => {
		// A widget registers, then resolves its model, then loads the session. The switch that
		// follows is still the user rejecting the model.
		const harness = createHarness();
		harness.selectModel('copilot/auto');
		harness.loadSession(sessionOne);

		harness.selectModel('copilot/gpt-5.2');

		assert.deepStrictEqual(harness.switches, [{ from: 'copilot/auto', to: 'copilot/gpt-5.2', session: sessionOne.toString() }]);
	});

	test('ignores the model that comes with a newly loaded session', () => {
		const harness = createHarness();
		harness.loadSession(sessionOne);
		harness.selectModel('copilot/auto');

		// Switching sessions restores that session's model, which is not the user rejecting one.
		harness.loadSession(sessionTwo);
		harness.selectModel('copilot/gpt-5.2');

		assert.deepStrictEqual(harness.switches, []);
	});

	test('keeps reporting switches made after a session change', () => {
		const harness = createHarness();
		harness.loadSession(sessionOne);
		harness.selectModel('copilot/auto');
		harness.loadSession(sessionTwo);
		harness.selectModel('copilot/auto');

		harness.selectModel('copilot/gpt-5.2');

		assert.deepStrictEqual(harness.switches, [{ from: 'copilot/auto', to: 'copilot/gpt-5.2', session: sessionTwo.toString() }]);
	});
});
