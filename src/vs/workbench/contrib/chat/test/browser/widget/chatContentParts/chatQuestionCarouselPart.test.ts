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
			assert.ok(widget.domNode.querySelector('.chat-question-header-row'));
			assert.ok(widget.domNode.querySelector('.chat-question-carousel-content'));
			assert.ok(widget.domNode.querySelector('.chat-question-carousel-nav'));
		});

		test('renders question title', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'What is your name?', message: 'What is your name?' }
			]);
			createWidget(carousel);

			const title = widget.domNode.querySelector('.chat-question-title');
			assert.ok(title);
			// Title includes progress prefix like "(1/1) What is your name?"
			assert.ok(title?.textContent?.includes('What is your name?'));
		});

		test('renders question title when message is not provided', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Fallback title text' }
			]);
			createWidget(carousel);

			const title = widget.domNode.querySelector('.chat-question-title');
			assert.ok(title, 'title element should exist when only title is provided');
			// Title should fall back to title property when message is not provided
			assert.ok(title?.textContent?.includes('Fallback title text'));
		});

		test('renders progress indicator correctly', () => {
			const carousel = createMockCarousel([
				{ id: 'q1', type: 'text', title: 'Question 1', message: 'Question 1' },
				{ id: 'q2', type: 'text', title: 'Question 2', message: 'Question 2' },
				{ id: 'q3', type: 'text', title: 'Question 3', message: 'Question 3' }
			]);
			createWidget(carousel);

			// Progress is shown in the step indicator in the footer as "1/3"
			const stepIndicator = widget.domNode.querySelector('.chat-question-step-indicator');
			assert.ok(stepIndicator);
			assert.ok(stepIndicator?.textContent?.includes('1'));
			assert.ok(stepIndicator?.textContent?.includes('3'));
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
			const inputBox = inputContainer?.querySelector('.monaco-inputbox input');
			assert.ok(inputBox, 'Should have an input box for text questions');
		});

		test('renders list items for singleSelect type questions', () => {
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

			const listItems = widget.domNode.querySelectorAll('.chat-question-list-item');
			assert.strictEqual(listItems.length, 2, 'Should have 2 list items');
		});

		test('renders list items with checkboxes for multiSelect type questions', () => {
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

			const listItems = widget.domNode.querySelectorAll('.chat-question-list-item.multi-select');
			assert.strictEqual(listItems.length, 3, 'Should have 3 list items for multiSelect');
			const checkboxes = widget.domNode.querySelectorAll('.chat-question-list-checkbox');
			assert.strictEqual(checkboxes.length, 3, 'Should have 3 checkboxes');
		});

		test('freeform textarea is always rendered for singleSelect', () => {
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

			const freeformTextarea = widget.domNode.querySelector('.chat-question-freeform-textarea');
			assert.ok(freeformTextarea, 'Freeform textarea should always be rendered for singleSelect');
		});

		test('freeform textarea is always rendered for multiSelect', () => {
			const carousel = createMockCarousel([
				{
					id: 'q1',
					type: 'multiSelect',
					title: 'Choose multiple',
					options: [
						{ id: 'a', label: 'Option A', value: 'a' }
					]
				}
			]);
			createWidget(carousel);

			const freeformTextarea = widget.domNode.querySelector('.chat-question-freeform-textarea');
			assert.ok(freeformTextarea, 'Freeform textarea should always be rendered for multiSelect');
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

			const listItems = widget.domNode.querySelectorAll('.chat-question-list-item') as NodeListOf<HTMLElement>;
			assert.strictEqual(listItems[0].classList.contains('selected'), false);
			assert.strictEqual(listItems[1].classList.contains('selected'), true, 'Default option should be selected');
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

			const listItems = widget.domNode.querySelectorAll('.chat-question-list-item') as NodeListOf<HTMLElement>;
			assert.strictEqual(listItems[0].classList.contains('checked'), true, 'First default option should be checked');
			assert.strictEqual(listItems[1].classList.contains('checked'), false);
			assert.strictEqual(listItems[2].classList.contains('checked'), true, 'Third default option should be checked');
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

		test('single select list has proper role and aria-label', () => {
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

			const list = widget.domNode.querySelector('.chat-question-list');
			assert.strictEqual(list?.getAttribute('role'), 'listbox');
			assert.strictEqual(list?.getAttribute('aria-label'), 'Choose one');
		});

		test('list items have proper role and aria-selected', () => {
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

			const listItems = widget.domNode.querySelectorAll('.chat-question-list-item');
			assert.strictEqual(listItems.length, 2, 'Should have 2 list items');

			// First item should be auto-selected (no default value, so first is selected)
			const firstItem = listItems[0] as HTMLElement;
			assert.strictEqual(firstItem.getAttribute('role'), 'option');
			assert.ok(firstItem.id, 'List item should have an id');
			assert.strictEqual(firstItem.getAttribute('aria-selected'), 'true', 'First item should be auto-selected');

			// Second item should not be selected
			const secondItem = listItems[1] as HTMLElement;
			assert.strictEqual(secondItem.getAttribute('role'), 'option');
			assert.strictEqual(secondItem.getAttribute('aria-selected'), 'false', 'Unselected item should have aria-selected=false');
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
			// singleSelect always returns structured format with freeformValue
			const answer = submittedAnswers?.get('q1') as { selectedValue: unknown; freeformValue: unknown };
			assert.strictEqual(answer.selectedValue, 'value_b');
			assert.strictEqual(answer.freeformValue, undefined);
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
			// multiSelect always returns structured format with freeformValue
			const answer = submittedAnswers?.get('q1') as { selectedValues: unknown[]; freeformValue: unknown };
			assert.ok(Array.isArray(answer.selectedValues));
			assert.strictEqual(answer.selectedValues.length, 2);
			assert.ok(answer.selectedValues.includes('value_a'));
			assert.ok(answer.selectedValues.includes('value_c'));
			assert.strictEqual(answer.freeformValue, undefined);
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
			// singleSelect always returns structured format with freeformValue
			const answer = submittedAnswers?.get('q2') as { selectedValue: unknown; freeformValue: unknown };
			assert.strictEqual(answer.selectedValue, 'first_value');
			assert.strictEqual(answer.freeformValue, undefined);
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
			const summaryValue = summaryItem?.querySelector('.chat-question-summary-answer-title');
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
			const summaryValue = summary?.querySelector('.chat-question-summary-answer-title');
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
