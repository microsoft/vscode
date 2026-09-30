/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatModelFeedbackSurveyWidget } from '../../../browser/feedbackSurvey/chatModelFeedbackSurveyWidget.js';
import { ChatModelFeedbackSurveyStatus, IChatModelFeedbackSurveyChangeEvent, IChatModelFeedbackSurveyService, IChatModelFeedbackSurveyState } from '../../../browser/feedbackSurvey/chatModelFeedbackSurveyService.js';
import { ChatModelFeedbackSurveyStepKind, IChatModelFeedbackSurveyConfig } from '../../../common/feedbackSurvey/chatModelFeedbackSurveyConfig.js';
import { IChatResponseViewModel } from '../../../common/model/chatViewModel.js';

suite('ChatModelFeedbackSurveyWidget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const config = {
		version: 1,
		id: 'auto-routing',
		match: { selectedModels: ['auto'], resolvedModels: [], modes: [], harnesses: [], sessionTypes: [] },
		prompt: { cooldownDays: 0, maxPerSession: 1, chance: { initial: 0, increment: 0, max: 1 }, triggers: { modelSwitchedAway: { enabled: false, bypassCooldown: false } } },
		steps: [{
			kind: ChatModelFeedbackSurveyStepKind.Choice,
			id: 'routing',
			title: 'Right model?',
			options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }, { id: 'maybe', label: 'Maybe' }],
		}],
	} as IChatModelFeedbackSurveyConfig;

	const response = {
		requestId: 'req-1',
		sessionResource: URI.parse('vscode-chat-editor://session-1'),
		isLast: true,
	} as IChatResponseViewModel;

	interface ISurveyHarness {
		readonly container: HTMLElement;
		readonly answers: { stepId: string; optionId: string }[];
		readonly dismissals: number;
		readonly focusRestores: number;
		readonly state: { current: IChatModelFeedbackSurveyState };
		rerender(): void;
	}

	function createWidget(options?: {
		openTrigger?: 'manual' | 'chance';
		isSubmitted?: boolean;
		onGetSurvey?: () => void;
		onDidChangeSurveyState?: Event<IChatModelFeedbackSurveyChangeEvent>;
	}): ISurveyHarness {
		const answers: { stepId: string; optionId: string }[] = [];
		const counts = { dismissals: 0, focusRestores: 0 };
		const state = {
			current: {
				config,
				instanceId: 'instance-1',
				status: ChatModelFeedbackSurveyStatus.Open,
				stepIndex: 0,
				answers: new Map<string, string>(),
				commentDraft: '',
				isSubmitted: options?.isSubmitted ?? false,
				openTrigger: options?.openTrigger ?? 'manual',
			} satisfies IChatModelFeedbackSurveyState,
		};

		const surveyService: IChatModelFeedbackSurveyService = {
			_serviceBrand: undefined,
			onDidChangeSurveyState: options?.onDidChangeSurveyState ?? Event.None,
			onDidChangeConfiguration: Event.None,
			getSurvey: () => {
				options?.onGetSurvey?.();
				return state.current;
			},
			toggle: () => { },
			notifyModelSwitchedAway: () => { },
			answerChoice: (_response, stepId, optionId) => { answers.push({ stepId, optionId }); },
			submit: () => { },
			dismiss: () => { counts.dismissals++; },
			setCommentDraft: () => { },
		};

		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IChatModelFeedbackSurveyService, surveyService);

		const container = dom.$('.chat-feedback-survey-widget');
		mainWindow.document.body.appendChild(container);
		store.add({ dispose: () => container.remove() });

		const widget = store.add(instantiationService.createInstance(ChatModelFeedbackSurveyWidget, container, () => { counts.focusRestores++; }));
		widget.render(response);
		return {
			container,
			answers,
			state,
			get dismissals() { return counts.dismissals; },
			get focusRestores() { return counts.focusRestores; },
			rerender: () => widget.render(response),
		};
	}

	/** Browser key codes, which is what `StandardKeyboardEvent` reads and maps. */
	const enum BrowserKey {
		Enter = 13,
		End = 35,
		Home = 36,
		ArrowUp = 38,
		ArrowDown = 40,
		Space = 32,
		Escape = 27,
	}

	function pressKey(target: HTMLElement, keyCode: BrowserKey, key: string): void {
		const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
		Object.defineProperty(event, 'keyCode', { get: () => keyCode });
		target.dispatchEvent(event);
	}

	function activeLabel(container: HTMLElement): string | undefined {
		return container.querySelector('.chat-feedback-survey-list-item.active')?.textContent ?? undefined;
	}

	test('moves the active option with the arrow keys and answers on Enter', () => {
		const { container, answers } = createWidget();
		const list = container.querySelector<HTMLElement>('.chat-feedback-survey-list')!;

		const initial = activeLabel(container);
		pressKey(list, BrowserKey.ArrowDown, 'ArrowDown');
		const afterDown = activeLabel(container);
		pressKey(list, BrowserKey.Enter, 'Enter');

		assert.deepStrictEqual({ initial, afterDown, answers }, {
			initial: 'Yes',
			afterDown: 'No',
			answers: [{ stepId: 'routing', optionId: 'no' }],
		});
	});

	test('wraps around the ends and supports Home and End', () => {
		const { container } = createWidget();
		const list = container.querySelector<HTMLElement>('.chat-feedback-survey-list')!;

		pressKey(list, BrowserKey.ArrowUp, 'ArrowUp');
		const afterUpFromFirst = activeLabel(container);
		pressKey(list, BrowserKey.Home, 'Home');
		const afterHome = activeLabel(container);
		pressKey(list, BrowserKey.End, 'End');

		assert.deepStrictEqual({ afterUpFromFirst, afterHome, afterEnd: activeLabel(container) }, {
			afterUpFromFirst: 'Maybe',
			afterHome: 'Yes',
			afterEnd: 'Maybe',
		});
	});

	test('keeps navigation keys away from the chat list once the survey has used them', () => {
		const { container } = createWidget();
		const list = container.querySelector<HTMLElement>('.chat-feedback-survey-list')!;

		let reachedAncestor = false;
		store.add(dom.addDisposableListener(container.parentElement!, dom.EventType.KEY_DOWN, () => { reachedAncestor = true; }));

		pressKey(list, BrowserKey.ArrowDown, 'ArrowDown');

		assert.deepStrictEqual({ reachedAncestor, active: activeLabel(container) }, { reachedAncestor: false, active: 'No' });
	});

	test('marks the active option as selected for screen readers', () => {
		const { container } = createWidget();
		const list = container.querySelector<HTMLElement>('.chat-feedback-survey-list')!;

		const initial = [...container.querySelectorAll('.chat-feedback-survey-list-item')].map(i => i.getAttribute('aria-selected'));
		pressKey(list, BrowserKey.ArrowDown, 'ArrowDown');
		const afterDown = [...container.querySelectorAll('.chat-feedback-survey-list-item')].map(i => i.getAttribute('aria-selected'));

		assert.deepStrictEqual({ initial, afterDown, activeDescendant: list.getAttribute('aria-activedescendant') }, {
			initial: ['true', 'false', 'false'],
			afterDown: ['false', 'true', 'false'],
			activeDescendant: 'chat-feedback-survey-instance-1-routing-option-1',
		});
	});

	test('keeps Space from reaching the chat list, which would toggle the row', () => {
		const { container } = createWidget();
		const list = container.querySelector<HTMLElement>('.chat-feedback-survey-list')!;

		let reachedAncestor = false;
		store.add(dom.addDisposableListener(container.parentElement!, dom.EventType.KEY_DOWN, () => { reachedAncestor = true; }));

		pressKey(list, BrowserKey.Space, ' ');

		assert.strictEqual(reachedAncestor, false);
	});

	test('hands focus back when the panel closes', () => {
		const harness = createWidget();

		harness.state.current = { ...harness.state.current, status: ChatModelFeedbackSurveyStatus.Collapsed };
		harness.rerender();

		assert.deepStrictEqual({
			focusRestores: harness.focusRestores,
			panels: harness.container.querySelectorAll('.chat-feedback-survey-container').length,
		}, {
			focusRestores: 1,
			panels: 0,
		});
	});

	test('shows an acknowledgement instead of questions once answered', () => {
		const { container } = createWidget({ isSubmitted: true });

		assert.deepStrictEqual({
			options: container.querySelectorAll('.chat-feedback-survey-list-item').length,
			hasCard: container.querySelectorAll('.chat-feedback-survey-container').length,
		}, {
			options: 0,
			hasCard: 1,
		});
	});

	test('escape dismisses the survey', () => {
		const harness = createWidget();
		const list = harness.container.querySelector<HTMLElement>('.chat-feedback-survey-list')!;

		pressKey(list, BrowserKey.Escape, 'Escape');

		assert.strictEqual(harness.dismissals, 1);
	});

	test('renders one panel when the survey opens itself while the row is rendering', () => {
		// Reading the survey can open it, which reports a change back while render is running.
		const changeEmitter = store.add(new Emitter<IChatModelFeedbackSurveyChangeEvent>());
		let fired = false;
		const harness = createWidget({
			openTrigger: 'chance',
			onDidChangeSurveyState: changeEmitter.event,
			onGetSurvey: () => {
				if (!fired) {
					fired = true;
					changeEmitter.fire({ sessionResource: response.sessionResource, requestId: response.requestId });
				}
			},
		});

		assert.strictEqual(harness.container.querySelectorAll('.chat-feedback-survey-container').length, 1);
	});
});
