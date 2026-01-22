/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-syntax */ // Tests legitimately need querySelector/querySelectorAll for DOM assertions

import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatQuestionCarouselPart, IChatQuestionCarouselOptions } from '../../../../browser/widget/chatContentParts/chatQuestionCarouselPart.js';
import { IChatQuestionCarousel } from '../../../../common/chatService/chatService.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';

function createMockCarousel(questions: IChatQuestionCarousel['questions'], allowSkip: boolean = true): IChatQuestionCarousel {
	return {
		kind: 'questionCarousel',
		questions,
		allowSkip,
	};
}

function createMockContext(): IChatContentPartRenderContext {
	return {} as IChatContentPartRenderContext;
}

suite('ChatQuestionCarouselPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let widget: ChatQuestionCarouselPart;
	let submittedAnswers: Map<string, unknown> | undefined | null = null;

	function createWidget(carousel: IChatQuestionCarousel): ChatQuestionCarouselPart {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const options: IChatQuestionCarouselOptions = {
			questions: carousel.questions,
			allowSkip: carousel.allowSkip,
			onSubmit: (answers) => {
				submittedAnswers = answers;
			}
		};
		widget = store.add(instantiationService.createInstance(ChatQuestionCarouselPart, carousel, createMockContext(), options));
		mainWindow.document.body.appendChild(widget.domNode);
		return widget;
	}

	teardown(() => {
		if (widget?.domNode?.parentNode) {
			widget.domNode.parentNode.removeChild(widget.domNode);
		}
		submittedAnswers = null;
	});

	suite('Basic Rendering', () => {
		test('renders carousel container with proper structure', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' }
			]);
			createWidget(carousel);

			assert.ok(widget.domNode.classList.contains('chat-question-carousel-container'));
			assert.ok(widget.domNode.querySelector('.chat-question-carousel-header'));
			assert.ok(widget.domNode.querySelector('.chat-question-carousel-content'));
			assert.ok(widget.domNode.querySelector('.chat-question-carousel-footer'));
		});

		test('renders question title', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'What is your name?' }
			]);
			createWidget(carousel);

			const title = widget.domNode.querySelector('.chat-question-title');
			assert.ok(title);
			assert.strictEqual(title?.textContent, 'What is your name?');
		});

		test('renders progress indicator correctly', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' },
				{ id: 'q2', type: 'text', title: 'Question 2' },
				{ id: 'q3', type: 'text', title: 'Question 3' }
			]);
			createWidget(carousel);

			const progress = widget.domNode.querySelector('.chat-question-carousel-progress');
			assert.ok(progress);
			assert.ok(progress?.textContent?.includes('1'));
			assert.ok(progress?.textContent?.includes('3'));
		});
	});

	suite('Question Types', () => {
		test('renders text input for text type questions', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Enter your name' }
			]);
			createWidget(carousel);

			const inputContainer = widget.domNode.querySelector('.chat-question-input-container');
			assert.ok(inputContainer);
			const inputBox = inputContainer?.querySelector('.monaco-inputbox');
			assert.ok(inputBox, 'Should have an input box for text questions');
		});

		test('renders radio buttons for singleSelect type questions', () => {
			const carousel = createMockCarousel([
				{
					id: 'q1',
					type: 'singleSelect',
					title: 'Choose one',
					options: [
						{ id: 'a', label: 'Option A', value: 'a' },
						{ id: 'b', label: 'Option B', value: 'b' }
					]
				}
			]);
			createWidget(carousel);

			const radioInputs = widget.domNode.querySelectorAll('input[type="radio"]');
			assert.strictEqual(radioInputs.length, 2, 'Should have 2 radio buttons');
		});

		test('renders checkboxes for multiSelect type questions', () => {
			const carousel = createMockCarousel([
				{
					id: 'q1',
					type: 'multiSelect',
					title: 'Choose multiple',
					options: [
						{ id: 'a', label: 'Option A', value: 'a' },
						{ id: 'b', label: 'Option B', value: 'b' },
						{ id: 'c', label: 'Option C', value: 'c' }
					]
				}
			]);
			createWidget(carousel);

			const checkboxInputs = widget.domNode.querySelectorAll('input[type="checkbox"]');
			assert.strictEqual(checkboxInputs.length, 3, 'Should have 3 checkboxes');
		});

		test('default options are pre-selected for singleSelect', () => {
			const carousel = createMockCarousel([
				{
					id: 'q1',
					type: 'singleSelect',
					title: 'Choose one',
					options: [
						{ id: 'a', label: 'Option A', value: 'a' },
						{ id: 'b', label: 'Option B', value: 'b' }
					],
					defaultValue: 'b'
				}
			]);
			createWidget(carousel);

			const radioInputs = widget.domNode.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
			assert.strictEqual(radioInputs[0].checked, false);
			assert.strictEqual(radioInputs[1].checked, true, 'Default option should be checked');
		});

		test('default options are pre-selected for multiSelect', () => {
			const carousel = createMockCarousel([
				{
					id: 'q1',
					type: 'multiSelect',
					title: 'Choose multiple',
					options: [
						{ id: 'a', label: 'Option A', value: 'a' },
						{ id: 'b', label: 'Option B', value: 'b' },
						{ id: 'c', label: 'Option C', value: 'c' }
					],
					defaultValue: ['a', 'c']
				}
			]);
			createWidget(carousel);

			const checkboxInputs = widget.domNode.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
			assert.strictEqual(checkboxInputs[0].checked, true, 'First default option should be checked');
			assert.strictEqual(checkboxInputs[1].checked, false);
			assert.strictEqual(checkboxInputs[2].checked, true, 'Third default option should be checked');
		});
	});

	suite('Navigation', () => {
		test('previous button is disabled on first question', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' },
				{ id: 'q2', type: 'text', title: 'Question 2' }
			]);
			createWidget(carousel);

			const buttons = widget.domNode.querySelectorAll('.chat-question-carousel-footer .monaco-button');
			// Button order: Skip, Previous, Next
			const prevButton = buttons[1] as HTMLButtonElement;
			assert.ok(prevButton.classList.contains('disabled') || prevButton.disabled, 'Previous button should be disabled on first question');
		});

		test('next button shows "Submit" on last question', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Only Question' }
			]);
			createWidget(carousel);

			const buttons = widget.domNode.querySelectorAll('.chat-question-carousel-footer .monaco-button');
			const nextButton = buttons[2]; // Skip, Previous, Next
			assert.ok(nextButton?.textContent?.toLowerCase().includes('submit'), 'Next button should show "Submit" on last question');
		});
	});

	suite('Skip Functionality', () => {
		test('skip button is enabled when allowSkip is true', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' }
			], true);
			createWidget(carousel);

			const buttons = widget.domNode.querySelectorAll('.chat-question-carousel-footer .monaco-button');
			const skipButton = buttons[0] as HTMLButtonElement;
			assert.ok(!skipButton.classList.contains('disabled') && !skipButton.disabled, 'Skip button should be enabled when allowSkip is true');
		});

		test('skip button is disabled when allowSkip is false', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' }
			], false);
			createWidget(carousel);

			const buttons = widget.domNode.querySelectorAll('.chat-question-carousel-footer .monaco-button');
			const skipButton = buttons[0] as HTMLButtonElement;
			assert.ok(skipButton.classList.contains('disabled') || skipButton.disabled, 'Skip button should be disabled when allowSkip is false');
		});

		test('clicking skip calls onSubmit with undefined', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' }
			], true);
			createWidget(carousel);

			const buttons = widget.domNode.querySelectorAll('.chat-question-carousel-footer .monaco-button');
			const skipButton = buttons[0] as HTMLButtonElement;
			skipButton.click();

			assert.strictEqual(submittedAnswers, undefined, 'Skip should call onSubmit with undefined');
		});
	});

	suite('Accessibility', () => {
		test('navigation area has proper role and aria-label', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' }
			]);
			createWidget(carousel);

			const footer = widget.domNode.querySelector('.chat-question-carousel-footer');
			assert.strictEqual(footer?.getAttribute('role'), 'navigation');
			assert.ok(footer?.getAttribute('aria-label'), 'Navigation should have aria-label');
		});

		test('radio buttons have proper name grouping', () => {
			const carousel = createMockCarousel([
				{
					id: 'q1',
					type: 'singleSelect',
					title: 'Choose one',
					options: [
						{ id: 'a', label: 'Option A', value: 'a' },
						{ id: 'b', label: 'Option B', value: 'b' }
					]
				}
			]);
			createWidget(carousel);

			const radioInputs = widget.domNode.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
			assert.strictEqual(radioInputs[0].name, radioInputs[1].name, 'Radio buttons should have the same name for grouping');
			assert.ok(radioInputs[0].name.includes('q1'), 'Radio button name should include question id');
		});

		test('labels are properly associated with inputs', () => {
			const carousel = createMockCarousel([
				{
					id: 'q1',
					type: 'singleSelect',
					title: 'Choose one',
					options: [
						{ id: 'a', label: 'Option A', value: 'a' }
					]
				}
			]);
			createWidget(carousel);

			const radioInput = widget.domNode.querySelector('input[type="radio"]') as HTMLInputElement;
			const label = widget.domNode.querySelector('label.chat-question-option-label') as HTMLLabelElement;
			assert.ok(radioInput.id, 'Input should have an id');
			assert.strictEqual(label.htmlFor, radioInput.id, 'Label should be associated with input');
		});
	});

	suite('hasSameContent', () => {
		test('returns true for same carousel instance', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' }
			]);
			createWidget(carousel);

			assert.strictEqual(widget.hasSameContent(carousel, [], {} as never), true);
		});

		test('returns false for different content type', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' }
			]);
			createWidget(carousel);

			const differentContent = { kind: 'markdown' as const } as never;
			assert.strictEqual(widget.hasSameContent(differentContent, [], {} as never), false);
		});
	});
});
