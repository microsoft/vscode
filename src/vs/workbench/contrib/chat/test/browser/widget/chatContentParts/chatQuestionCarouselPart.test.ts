/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
			assert.ok(widget.domNode.querySelector('.chat-question-carousel-nav'));
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

			// Use dedicated class selectors for stability
			const prevButton = widget.domNode.querySelector('.chat-question-nav-prev') as HTMLButtonElement;
			assert.ok(prevButton, 'Previous button should exist');
			assert.ok(prevButton.classList.contains('disabled') || prevButton.disabled, 'Previous button should be disabled on first question');
		});

		test('next button shows submit icon on last question', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Only Question' }
			]);
			createWidget(carousel);

			// Use dedicated class selector for stability
			const nextButton = widget.domNode.querySelector('.chat-question-nav-next') as HTMLElement;
			assert.ok(nextButton, 'Next button should exist');
			assert.strictEqual(nextButton.title, 'Submit', 'Next button should have Submit title on last question');
		});
	});

	suite('Skip Functionality', () => {
		test('skip succeeds when allowSkip is true and returns defaults', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1', defaultValue: 'default answer' }
			], true);
			createWidget(carousel);

			const result = widget.skip();
			assert.strictEqual(result, true, 'skip() should return true when allowSkip is true');
			assert.ok(submittedAnswers instanceof Map, 'Skip should call onSubmit with a Map');
			assert.strictEqual(submittedAnswers?.get('q1'), 'default answer', 'Skip should return default values');
		});

		test('skip fails when allowSkip is false', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' }
			], false);
			createWidget(carousel);

			const result = widget.skip();
			assert.strictEqual(result, false, 'skip() should return false when allowSkip is false');
			assert.strictEqual(submittedAnswers, null, 'onSubmit should not have been called');
		});

		test('skip can only be called once', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' }
			], true);
			createWidget(carousel);

			widget.skip();
			submittedAnswers = null; // reset
			const result = widget.skip();
			assert.strictEqual(result, false, 'Second skip() should return false');
			assert.strictEqual(submittedAnswers, null, 'onSubmit should not be called again');
		});
	});

	suite('Ignore Functionality', () => {
		test('ignore succeeds when allowSkip is true and returns undefined', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' }
			], true);
			createWidget(carousel);

			const result = widget.ignore();
			assert.strictEqual(result, true, 'ignore() should return true when allowSkip is true');
			assert.strictEqual(submittedAnswers, undefined, 'Ignore should call onSubmit with undefined');
		});

		test('ignore fails when allowSkip is false', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' }
			], false);
			createWidget(carousel);

			const result = widget.ignore();
			assert.strictEqual(result, false, 'ignore() should return false when allowSkip is false');
			assert.strictEqual(submittedAnswers, null, 'onSubmit should not have been called');
		});

		test('ignore can only be called once', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' }
			], true);
			createWidget(carousel);

			widget.ignore();
			submittedAnswers = null; // reset
			const result = widget.ignore();
			assert.strictEqual(result, false, 'Second ignore() should return false');
			assert.strictEqual(submittedAnswers, null, 'onSubmit should not be called again');
		});

		test('skip and ignore are mutually exclusive', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' }
			], true);
			createWidget(carousel);

			widget.skip();
			submittedAnswers = null; // reset
			const result = widget.ignore();
			assert.strictEqual(result, false, 'ignore() should return false after skip()');
			assert.strictEqual(submittedAnswers, null, 'onSubmit should not be called again');
		});
	});

	suite('Accessibility', () => {
		test('navigation area has proper role and aria-label', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' }
			]);
			createWidget(carousel);

			const nav = widget.domNode.querySelector('.chat-question-carousel-nav');
			assert.strictEqual(nav?.getAttribute('role'), 'navigation');
			assert.ok(nav?.getAttribute('aria-label'), 'Navigation should have aria-label');
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

	suite('Auto-Approve (Yolo Mode)', () => {
		test('skip returns default values for text questions', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1', defaultValue: 'default text' }
			], true);
			createWidget(carousel);

			widget.skip();
			assert.ok(submittedAnswers instanceof Map);
			assert.strictEqual(submittedAnswers?.get('q1'), 'default text');
		});

		test('skip returns default values for singleSelect questions', () => {
			const carousel = createMockCarousel([
				{
					id: 'q1',
					type: 'singleSelect',
					title: 'Choose one',
					options: [
						{ id: 'a', label: 'Option A', value: 'value_a' },
						{ id: 'b', label: 'Option B', value: 'value_b' }
					],
					defaultValue: 'b'
				}
			], true);
			createWidget(carousel);

			widget.skip();
			assert.ok(submittedAnswers instanceof Map);
			assert.strictEqual(submittedAnswers?.get('q1'), 'value_b');
		});

		test('skip returns default values for multiSelect questions', () => {
			const carousel = createMockCarousel([
				{
					id: 'q1',
					type: 'multiSelect',
					title: 'Choose multiple',
					options: [
						{ id: 'a', label: 'Option A', value: 'value_a' },
						{ id: 'b', label: 'Option B', value: 'value_b' },
						{ id: 'c', label: 'Option C', value: 'value_c' }
					],
					defaultValue: ['a', 'c']
				}
			], true);
			createWidget(carousel);

			widget.skip();
			assert.ok(submittedAnswers instanceof Map);
			const values = submittedAnswers?.get('q1') as unknown[];
			assert.ok(Array.isArray(values));
			assert.strictEqual(values.length, 2);
			assert.ok(values.includes('value_a'));
			assert.ok(values.includes('value_c'));
		});

		test('skip returns defaults for multiple questions', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Text Question', defaultValue: 'text default' },
				{
					id: 'q2',
					type: 'singleSelect',
					title: 'Single Select',
					options: [
						{ id: 'opt1', label: 'First', value: 'first_value' }
					],
					defaultValue: 'opt1'
				}
			], true);
			createWidget(carousel);

			widget.skip();
			assert.ok(submittedAnswers instanceof Map);
			assert.strictEqual(submittedAnswers?.get('q1'), 'text default');
			assert.strictEqual(submittedAnswers?.get('q2'), 'first_value');
		});

		test('skip returns empty map when no defaults are provided', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question without default' }
			], true);
			createWidget(carousel);

			widget.skip();
			assert.ok(submittedAnswers instanceof Map);
			assert.strictEqual(submittedAnswers?.size, 0, 'Should return empty map when no defaults');
		});
	});

	suite('Used Carousel Summary', () => {
		test('shows summary with answers after skip()', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1', defaultValue: 'default answer' }
			], true);
			createWidget(carousel);

			widget.skip();

			assert.ok(widget.domNode.classList.contains('chat-question-carousel-used'), 'Should have used class');
			const summary = widget.domNode.querySelector('.chat-question-carousel-summary');
			assert.ok(summary, 'Should show summary container after skip');
			const summaryItem = summary?.querySelector('.chat-question-summary-item');
			assert.ok(summaryItem, 'Should have summary item for the question');
			const summaryValue = summaryItem?.querySelector('.chat-question-summary-value');
			assert.ok(summaryValue?.textContent?.includes('default answer'), 'Summary should show the default answer');
		});

		test('shows skipped message after ignore()', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1' }
			], true);
			createWidget(carousel);

			widget.ignore();

			assert.ok(widget.domNode.classList.contains('chat-question-carousel-used'), 'Should have used class');
			const summary = widget.domNode.querySelector('.chat-question-carousel-summary');
			assert.ok(summary, 'Should show summary container after ignore');
			const skippedMessage = summary?.querySelector('.chat-question-summary-skipped');
			assert.ok(skippedMessage, 'Should show skipped message when ignored');
		});

		test('renders summary when constructed with isUsed and data', () => {
			const carousel: IChatQuestionCarousel = {
				kind: 'questionCarousel',
				questions: [
					{ id: 'q1', type: 'text', title: 'Question 1' }
				],
				allowSkip: true,
				isUsed: true,
				data: { q1: 'saved answer' }
			};
			createWidget(carousel);

			assert.ok(widget.domNode.classList.contains('chat-question-carousel-used'), 'Should have used class');
			const summary = widget.domNode.querySelector('.chat-question-carousel-summary');
			assert.ok(summary, 'Should show summary container when isUsed is true');
			const summaryValue = summary?.querySelector('.chat-question-summary-value');
			assert.ok(summaryValue?.textContent?.includes('saved answer'), 'Summary should show saved answer from data');
		});

		test('shows skipped message when constructed with isUsed but no data', () => {
			const carousel: IChatQuestionCarousel = {
				kind: 'questionCarousel',
				questions: [
					{ id: 'q1', type: 'text', title: 'Question 1' }
				],
				allowSkip: true,
				isUsed: true
			};
			createWidget(carousel);

			assert.ok(widget.domNode.classList.contains('chat-question-carousel-used'), 'Should have used class');
			const summary = widget.domNode.querySelector('.chat-question-carousel-summary');
			assert.ok(summary, 'Should show summary container');
			const skippedMessage = summary?.querySelector('.chat-question-summary-skipped');
			assert.ok(skippedMessage, 'Should show skipped message when no data');
		});
	});
});
