/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatQuestionCarouselPart } from '../../../../browser/widget/chatContentParts/chatQuestionCarouselPart.js';
import { ChatQuestionCarouselData } from '../../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
function createMockCarousel(questions, allowSkip = true) {
    return {
        kind: 'questionCarousel',
        questions,
        allowSkip,
    };
}
function createMockContext() {
    return {};
}
suite('ChatQuestionCarouselPart', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let widget;
    let submittedAnswers = null;
    function createWidget(carousel) {
        const instantiationService = workbenchInstantiationService(undefined, store);
        const options = {
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
        test('renders markdown in question message', () => {
            const carousel = createMockCarousel([
                {
                    id: 'q1',
                    type: 'text',
                    title: 'Question',
                    message: new MarkdownString('Please review **details** in [docs](https://example.com)')
                }
            ]);
            createWidget(carousel);
            const title = widget.domNode.querySelector('.chat-question-title');
            assert.ok(title, 'title element should exist');
            assert.ok(title?.querySelector('.rendered-markdown'), 'markdown content should be rendered');
        });
        test('renders plain string question message as text', () => {
            const carousel = createMockCarousel([
                {
                    id: 'q1',
                    type: 'text',
                    title: 'Question',
                    message: 'Please review **details** in [docs](https://example.com)'
                }
            ]);
            createWidget(carousel);
            const title = widget.domNode.querySelector('.chat-question-title');
            assert.ok(title, 'title element should exist');
            assert.ok(title?.textContent?.includes('details'), 'content should be rendered');
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
        test('renders close button in title row for multi-question carousels', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Question 1' },
                { id: 'q2', type: 'text', title: 'Question 2' }
            ], true);
            createWidget(carousel);
            const titleRow = widget.domNode.querySelector('.chat-question-title-row');
            assert.ok(titleRow, 'title row should exist');
            const closeContainer = titleRow?.querySelector('.chat-question-close-container');
            assert.ok(closeContainer, 'close button container should be rendered in the title row');
            const directChildCloseContainer = widget.domNode.querySelector(':scope > .chat-question-close-container');
            assert.strictEqual(directChildCloseContainer, null, 'close button container should not be positioned as a direct child of the carousel container');
        });
        test('renders collapse button in title row even when skip is disabled', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Question 1' }
            ], false);
            createWidget(carousel);
            const titleRow = widget.domNode.querySelector('.chat-question-title-row');
            assert.ok(titleRow, 'title row should exist');
            const collapseButton = titleRow?.querySelector('.chat-question-collapse-toggle');
            assert.ok(collapseButton, 'collapse button should be rendered even when skip is disabled');
        });
        test('renders collapse button to the right of close button', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Question 1' },
                { id: 'q2', type: 'text', title: 'Question 2' }
            ], true);
            createWidget(carousel);
            const actionsContainer = widget.domNode.querySelector('.chat-question-header-actions');
            assert.ok(actionsContainer, 'actions container should exist');
            if (!actionsContainer) {
                return;
            }
            const actionButtons = Array.from(actionsContainer.querySelectorAll('.monaco-button'));
            const closeIndex = actionButtons.findIndex(button => button.classList.contains('chat-question-close'));
            const collapseIndex = actionButtons.findIndex(button => button.classList.contains('chat-question-collapse-toggle'));
            assert.ok(closeIndex >= 0, 'close button should exist');
            assert.ok(collapseIndex >= 0, 'collapse button should exist');
            assert.ok(collapseIndex > closeIndex, 'collapse button should be positioned to the right of close button');
        });
        test('toggles collapsed state and updates aria-expanded', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Question 1' },
                { id: 'q2', type: 'text', title: 'Question 2' }
            ], true);
            createWidget(carousel);
            const collapseButton = widget.domNode.querySelector('.chat-question-collapse-toggle');
            assert.ok(collapseButton, 'collapse button should exist');
            assert.strictEqual(collapseButton.getAttribute('aria-expanded'), 'true');
            collapseButton.click();
            assert.ok(widget.domNode.classList.contains('chat-question-carousel-collapsed'), 'widget should enter collapsed state');
            assert.strictEqual(collapseButton.getAttribute('aria-expanded'), 'false');
            const collapsedSummary = widget.domNode.querySelector('.chat-question-collapsed-summary');
            assert.strictEqual(collapsedSummary, null, 'collapsed mode should not render an additional summary section');
            const titleRow = widget.domNode.querySelector('.chat-question-title-row');
            assert.ok(titleRow, 'header should remain visible when collapsed');
            const inputScrollable = widget.domNode.querySelector('.chat-question-input-scrollable');
            assert.ok(inputScrollable, 'input section exists in DOM but is hidden while collapsed');
            collapseButton.click();
            assert.ok(!widget.domNode.classList.contains('chat-question-carousel-collapsed'), 'widget should exit collapsed state');
            assert.strictEqual(collapseButton.getAttribute('aria-expanded'), 'true');
        });
        test('restores draft collapsed state from carousel data', () => {
            const carousel = new ChatQuestionCarouselData([
                { id: 'q1', type: 'text', title: 'Question 1' },
                { id: 'q2', type: 'text', title: 'Question 2' }
            ], true);
            carousel.draftCollapsed = true;
            createWidget(carousel);
            assert.ok(widget.domNode.classList.contains('chat-question-carousel-collapsed'), 'widget should restore collapsed draft state');
            const collapseButton = widget.domNode.querySelector('.chat-question-collapse-toggle');
            assert.strictEqual(collapseButton?.getAttribute('aria-expanded'), 'false');
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
        test('freeform textarea is rendered for singleSelect by default', () => {
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
            assert.ok(freeformTextarea, 'Freeform textarea should be rendered by default for singleSelect');
        });
        test('freeform textarea is rendered for multiSelect by default', () => {
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
            assert.ok(freeformTextarea, 'Freeform textarea should be rendered by default for multiSelect');
        });
        test('freeform textarea is hidden when allowFreeformInput is false for singleSelect', () => {
            const carousel = createMockCarousel([
                {
                    id: 'q1',
                    type: 'singleSelect',
                    title: 'Choose one',
                    allowFreeformInput: false,
                    options: [
                        { id: 'a', label: 'Option A', value: 'a' },
                        { id: 'b', label: 'Option B', value: 'b' }
                    ]
                }
            ]);
            createWidget(carousel);
            const freeformTextarea = widget.domNode.querySelector('.chat-question-freeform-textarea');
            assert.strictEqual(freeformTextarea, null, 'Freeform textarea should not be rendered when allowFreeformInput is false');
        });
        test('freeform textarea is hidden when allowFreeformInput is false for multiSelect', () => {
            const carousel = createMockCarousel([
                {
                    id: 'q1',
                    type: 'multiSelect',
                    title: 'Choose multiple',
                    allowFreeformInput: false,
                    options: [
                        { id: 'a', label: 'Option A', value: 'a' },
                        { id: 'b', label: 'Option B', value: 'b' }
                    ]
                }
            ]);
            createWidget(carousel);
            const freeformTextarea = widget.domNode.querySelector('.chat-question-freeform-textarea');
            assert.strictEqual(freeformTextarea, null, 'Freeform textarea should not be rendered when allowFreeformInput is false');
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
            // Default option 'b' is re-sorted to appear first
            const listItems = widget.domNode.querySelectorAll('.chat-question-list-item');
            assert.strictEqual(listItems[0].classList.contains('selected'), true, 'Default option should be re-sorted to first and selected');
            assert.strictEqual(listItems[1].classList.contains('selected'), false);
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
            // Default options 'a' and 'c' are re-sorted to appear first
            const listItems = widget.domNode.querySelectorAll('.chat-question-list-item');
            assert.strictEqual(listItems[0].classList.contains('checked'), true, 'First default option should be checked');
            assert.strictEqual(listItems[1].classList.contains('checked'), true, 'Second default option should be checked (re-sorted from third)');
            assert.strictEqual(listItems[2].classList.contains('checked'), false, 'Non-default option should not be checked');
        });
        test('singleSelect keeps value mapping after default-first reordering', () => {
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
            ]);
            createWidget(carousel);
            const listItems = widget.domNode.querySelectorAll('.chat-question-list-item');
            assert.strictEqual(listItems.length, 2, 'Expected two options');
            listItems[1].click(); // Option A after default-first ordering
            const answer = submittedAnswers?.get('q1');
            assert.strictEqual(answer.selectedValue, 'value_a');
            assert.strictEqual(answer.freeformValue, undefined);
        });
        test('multiSelect keeps value mapping after default-first reordering', () => {
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
                    defaultValue: 'c'
                }
            ]);
            createWidget(carousel);
            const listItems = widget.domNode.querySelectorAll('.chat-question-list-item');
            assert.strictEqual(listItems.length, 3, 'Expected three options');
            listItems[1].click(); // Option A after default-first ordering
            const submitButton = widget.domNode.querySelector('.chat-question-submit-button');
            assert.ok(submitButton, 'Submit button should exist');
            submitButton.click();
            const answer = submittedAnswers?.get('q1');
            assert.ok(Array.isArray(answer.selectedValues));
            assert.ok(answer.selectedValues.includes('value_a'));
            assert.ok(answer.selectedValues.includes('value_c'));
            assert.strictEqual(answer.selectedValues.length, 2);
            assert.strictEqual(answer.freeformValue, undefined);
        });
    });
    suite('Navigation', () => {
        test('previous button is disabled on first question', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Question 1' },
                { id: 'q2', type: 'text', title: 'Question 2' }
            ]);
            createWidget(carousel);
            const navArrows = widget.domNode.querySelectorAll('.chat-question-nav-arrow');
            const prevButton = navArrows[0];
            assert.ok(prevButton, 'Previous button should exist');
            assert.ok(prevButton.classList.contains('disabled') || prevButton.disabled, 'Previous button should be disabled on first question');
        });
        test('next button stays as arrow and is disabled on last question', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Only Question' },
                { id: 'q2', type: 'text', title: 'Question 2' }
            ]);
            createWidget(carousel);
            // Navigate to last question
            widget.navigateToNextQuestion();
            const navArrows = widget.domNode.querySelectorAll('.chat-question-nav-arrow');
            const nextButton = navArrows[1];
            assert.ok(nextButton, 'Next button should exist');
            assert.ok(nextButton.classList.contains('disabled') || nextButton.disabled, 'Next button should be disabled on last question');
        });
        test('submit button is shown on last question', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Question 1' },
                { id: 'q2', type: 'text', title: 'Question 2' }
            ]);
            createWidget(carousel);
            // Navigate to last question
            widget.navigateToNextQuestion();
            const submitButton = widget.domNode.querySelector('.chat-question-submit-button');
            assert.ok(submitButton, 'Submit button should exist');
            assert.notStrictEqual(submitButton.style.display, 'none', 'Submit button should be visible on last question');
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
            const firstItem = listItems[0];
            assert.strictEqual(firstItem.getAttribute('role'), 'option');
            assert.ok(firstItem.id, 'List item should have an id');
            assert.strictEqual(firstItem.getAttribute('aria-selected'), 'true', 'First item should be auto-selected');
            // Second item should not be selected
            const secondItem = listItems[1];
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
            assert.strictEqual(widget.hasSameContent(carousel, [], {}), true);
        });
        test('returns false for different content type', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Question 1' }
            ]);
            createWidget(carousel);
            const differentContent = { kind: 'markdown' };
            assert.strictEqual(widget.hasSameContent(differentContent, [], {}), false);
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
            const answer = submittedAnswers?.get('q1');
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
            const answer = submittedAnswers?.get('q1');
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
            const answer = submittedAnswers?.get('q2');
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
        test('retains current question after navigation without editing', () => {
            const carousel = new ChatQuestionCarouselData([
                { id: 'q1', type: 'text', title: 'Question 1' },
                { id: 'q2', type: 'text', title: 'Question 2' }
            ], true);
            const firstWidget = createWidget(carousel);
            const nextButton = firstWidget.domNode.querySelector('.chat-question-nav-next');
            assert.ok(nextButton, 'next button should exist');
            nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            firstWidget.dispose();
            firstWidget.domNode.remove();
            const recreatedWidget = createWidget(carousel);
            const stepIndicator = recreatedWidget.domNode.querySelector('.chat-question-step-indicator');
            assert.strictEqual(stepIndicator?.textContent, '2/2', 'should restore the current question index after navigation');
            const title = recreatedWidget.domNode.querySelector('.chat-question-title');
            assert.ok(title?.textContent?.includes('Question 2'), 'should restore to the second question view');
        });
        test('retains draft answers and current question after widget recreation', () => {
            const carousel = new ChatQuestionCarouselData([
                { id: 'q1', type: 'text', title: 'Question 1' },
                { id: 'q2', type: 'text', title: 'Question 2' }
            ], true);
            const firstWidget = createWidget(carousel);
            const firstInput = firstWidget.domNode.querySelector('.monaco-inputbox input');
            assert.ok(firstInput, 'first question input should exist');
            firstInput.value = 'first draft answer';
            firstInput.dispatchEvent(new Event('input', { bubbles: true }));
            const nextButton = firstWidget.domNode.querySelector('.chat-question-nav-next');
            assert.ok(nextButton, 'next button should exist');
            nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            const secondInput = firstWidget.domNode.querySelector('.monaco-inputbox input');
            assert.ok(secondInput, 'second question input should exist');
            secondInput.value = 'second draft answer';
            secondInput.dispatchEvent(new Event('input', { bubbles: true }));
            firstWidget.dispose();
            firstWidget.domNode.remove();
            const recreatedWidget = createWidget(carousel);
            const stepIndicator = recreatedWidget.domNode.querySelector('.chat-question-step-indicator');
            assert.strictEqual(stepIndicator?.textContent, '2/2', 'should restore the current question index');
            const recreatedSecondInput = recreatedWidget.domNode.querySelector('.monaco-inputbox input');
            assert.ok(recreatedSecondInput, 'recreated second question input should exist');
            assert.strictEqual(recreatedSecondInput.value, 'second draft answer', 'should restore draft input for current question');
            const prevButton = recreatedWidget.domNode.querySelector('.chat-question-nav-prev');
            assert.ok(prevButton, 'previous button should exist');
            prevButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            const recreatedFirstInput = recreatedWidget.domNode.querySelector('.monaco-inputbox input');
            assert.ok(recreatedFirstInput, 'recreated first question input should exist');
            assert.strictEqual(recreatedFirstInput.value, 'first draft answer', 'should restore draft input for previous question');
        });
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
            const carousel = {
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
            const carousel = {
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
    suite('Description and Message', () => {
        test('renders question description when provided', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Email', description: 'Enter your email address' }
            ]);
            createWidget(carousel);
            const desc = widget.domNode.querySelector('.chat-question-description');
            assert.ok(desc, 'Description element should be rendered');
            assert.strictEqual(desc?.textContent, 'Enter your email address');
        });
        test('does not render description element when not provided', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Name' }
            ]);
            createWidget(carousel);
            const desc = widget.domNode.querySelector('.chat-question-description');
            assert.strictEqual(desc, null, 'Description element should not exist when not provided');
        });
        test('renders carousel-level message on first question', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Name' },
                { id: 'q2', type: 'text', title: 'Email' }
            ]);
            carousel.message = 'Please fill in the following:';
            createWidget(carousel);
            const message = widget.domNode.querySelector('.chat-question-carousel-message');
            assert.ok(message, 'Carousel message should be rendered');
            assert.ok(message?.textContent?.includes('Please fill in the following:'));
        });
        test('renders carousel-level message as markdown', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Name' }
            ]);
            carousel.message = new MarkdownString('**Important:** Fill this form');
            createWidget(carousel);
            const message = widget.domNode.querySelector('.chat-question-carousel-message');
            assert.ok(message, 'Carousel message should be rendered');
            assert.ok(message?.querySelector('.rendered-markdown'), 'Message should be rendered as markdown');
        });
        test('shows required indicator on required questions', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Name', required: true }
            ]);
            createWidget(carousel);
            const title = widget.domNode.querySelector('.chat-question-title');
            assert.ok(title?.textContent?.includes('*'), 'Required indicator (*) should be shown');
        });
        test('does not show required indicator on optional questions', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Nickname' }
            ]);
            createWidget(carousel);
            const title = widget.domNode.querySelector('.chat-question-title');
            assert.ok(title?.textContent);
            assert.ok(!title?.textContent?.includes('*'), 'Required indicator should not be shown');
        });
    });
    suite('Validation', () => {
        test('renders validation message element', () => {
            const carousel = createMockCarousel([
                {
                    id: 'q1',
                    type: 'text',
                    title: 'Email',
                    validation: { format: 'email' }
                }
            ]);
            createWidget(carousel);
            const validationMsg = widget.domNode.querySelector('.chat-question-validation-message');
            assert.ok(validationMsg, 'Validation message element should exist');
            assert.strictEqual(validationMsg?.style.display, 'none', 'Validation message should be hidden initially');
        });
        test('blocks submit on required empty text field', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Name', required: true }
            ]);
            createWidget(carousel);
            // Try to submit without entering a value
            const submitButton = widget.domNode.querySelector('.chat-question-submit-button');
            assert.ok(submitButton, 'Submit button should exist');
            submitButton.click();
            // Should show validation error and not submit
            const validationMsg = widget.domNode.querySelector('.chat-question-validation-message');
            assert.ok(validationMsg?.textContent, 'Validation error should be shown');
            assert.strictEqual(submittedAnswers, null, 'Should not have submitted');
        });
        test('next button is disabled when required text field is empty', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Name', required: true },
                { id: 'q2', type: 'text', title: 'Age' }
            ]);
            createWidget(carousel);
            // Next button should be disabled since required field has no answer
            const nextButton = widget.domNode.querySelector('.chat-question-nav-next');
            assert.ok(nextButton, 'Next button should exist');
            assert.ok(nextButton.classList.contains('disabled'), 'Next button should be disabled when required field is empty');
        });
        test('allows submit on required field with value', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Name', required: true }
            ]);
            createWidget(carousel);
            // Enter a value in the text input
            const inputBox = widget.domNode.querySelector('.monaco-inputbox input');
            assert.ok(inputBox, 'Input should exist');
            inputBox.value = 'John';
            inputBox.dispatchEvent(new Event('input', { bubbles: true }));
            // Submit
            const submitButton = widget.domNode.querySelector('.chat-question-submit-button');
            submitButton.click();
            assert.ok(submittedAnswers !== null, 'Should have submitted');
        });
        test('validates required field across questions on submit', () => {
            const carousel = createMockCarousel([
                { id: 'q1', type: 'text', title: 'Optional' },
                { id: 'q2', type: 'text', title: 'Required', required: true }
            ]);
            createWidget(carousel);
            // Navigate to q2 without filling q1 (optional, so allowed)
            widget.navigateToNextQuestion();
            // Go back to q1 and try to submit (q2 required but empty)
            widget.navigateToPreviousQuestion();
            // Cmd+Enter should check all required fields
            const submitButton = widget.domNode.querySelector('.chat-question-submit-button');
            if (submitButton) {
                submitButton.click();
            }
            // Should not submit because q2 is required but empty
            assert.strictEqual(submittedAnswers, null, 'Should not submit when required field is empty');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0UXVlc3Rpb25DYXJvdXNlbFBhcnQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN4RyxPQUFPLEVBQUUsd0JBQXdCLEVBQWdDLE1BQU0seUVBQXlFLENBQUM7QUFHakosT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFFbEgsU0FBUyxrQkFBa0IsQ0FBQyxTQUE2QyxFQUFFLFlBQXFCLElBQUk7SUFDbkcsT0FBTztRQUNOLElBQUksRUFBRSxrQkFBa0I7UUFDeEIsU0FBUztRQUNULFNBQVM7S0FDVCxDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsaUJBQWlCO0lBQ3pCLE9BQU8sRUFBbUMsQ0FBQztBQUM1QyxDQUFDO0FBRUQsS0FBSyxDQUFDLDBCQUEwQixFQUFFLEdBQUcsRUFBRTtJQUN0QyxNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksTUFBZ0MsQ0FBQztJQUNyQyxJQUFJLGdCQUFnQixHQUE2RCxJQUFJLENBQUM7SUFFdEYsU0FBUyxZQUFZLENBQUMsUUFBK0I7UUFDcEQsTUFBTSxvQkFBb0IsR0FBRyw2QkFBNkIsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0UsTUFBTSxPQUFPLEdBQWlDO1lBQzdDLFFBQVEsRUFBRSxDQUFDLE9BQU8sRUFBRSxFQUFFO2dCQUNyQixnQkFBZ0IsR0FBRyxPQUFPLENBQUM7WUFDNUIsQ0FBQztTQUNELENBQUM7UUFDRixNQUFNLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsd0JBQXdCLEVBQUUsUUFBUSxFQUFFLGlCQUFpQixFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUMxSCxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3JELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVELFFBQVEsQ0FBQyxHQUFHLEVBQUU7UUFDYixJQUFJLE1BQU0sRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLENBQUM7WUFDakMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2RCxDQUFDO1FBQ0QsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO0lBQ3pCLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtRQUM3QixJQUFJLENBQUMsa0RBQWtELEVBQUUsR0FBRyxFQUFFO1lBQzdELE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFO2FBQy9DLENBQUMsQ0FBQztZQUNILFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2QixNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDLENBQUM7WUFDakYsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUM7WUFDckUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDLENBQUM7UUFDNUUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO1lBQ25DLE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsT0FBTyxFQUFFLG9CQUFvQixFQUFFO2FBQ3RGLENBQUMsQ0FBQztZQUNILFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2QixNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1lBQ25FLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDakIsaUVBQWlFO1lBQ2pFLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRSxRQUFRLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQy9ELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHFEQUFxRCxFQUFFLEdBQUcsRUFBRTtZQUNoRSxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLHFCQUFxQixFQUFFO2FBQ3hELENBQUMsQ0FBQztZQUNILFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2QixNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1lBQ25FLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLHdEQUF3RCxDQUFDLENBQUM7WUFDM0Usd0VBQXdFO1lBQ3hFLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRSxRQUFRLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO1FBQ2hFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHNDQUFzQyxFQUFFLEdBQUcsRUFBRTtZQUNqRCxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkM7b0JBQ0MsRUFBRSxFQUFFLElBQUk7b0JBQ1IsSUFBSSxFQUFFLE1BQU07b0JBQ1osS0FBSyxFQUFFLFVBQVU7b0JBQ2pCLE9BQU8sRUFBRSxJQUFJLGNBQWMsQ0FBQywwREFBMEQsQ0FBQztpQkFDdkY7YUFDRCxDQUFDLENBQUM7WUFDSCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsc0JBQXNCLENBQUMsQ0FBQztZQUNuRSxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1lBQy9DLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLGFBQWEsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLHFDQUFxQyxDQUFDLENBQUM7UUFDOUYsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsK0NBQStDLEVBQUUsR0FBRyxFQUFFO1lBQzFELE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQztvQkFDQyxFQUFFLEVBQUUsSUFBSTtvQkFDUixJQUFJLEVBQUUsTUFBTTtvQkFDWixLQUFLLEVBQUUsVUFBVTtvQkFDakIsT0FBTyxFQUFFLDBEQUEwRDtpQkFDbkU7YUFDRCxDQUFDLENBQUM7WUFDSCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsc0JBQXNCLENBQUMsQ0FBQztZQUNuRSxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1lBQy9DLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRSxRQUFRLENBQUMsU0FBUyxDQUFDLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztRQUNsRixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxzQ0FBc0MsRUFBRSxHQUFHLEVBQUU7WUFDakQsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7Z0JBQ25DLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRTtnQkFDdEUsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFO2dCQUN0RSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUU7YUFDdEUsQ0FBQyxDQUFDO1lBQ0gsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLGlFQUFpRTtZQUNqRSxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1lBQ3BGLE1BQU0sQ0FBQyxFQUFFLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDekIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3JELE1BQU0sQ0FBQyxFQUFFLENBQUMsYUFBYSxFQUFFLFdBQVcsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN0RCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxnRUFBZ0UsRUFBRSxHQUFHLEVBQUU7WUFDM0UsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7Z0JBQ25DLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7Z0JBQy9DLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7YUFDL0MsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNULFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2QixNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1lBQzFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFFLHdCQUF3QixDQUFDLENBQUM7WUFFOUMsTUFBTSxjQUFjLEdBQUcsUUFBUSxFQUFFLGFBQWEsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO1lBQ2pGLE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYyxFQUFFLDREQUE0RCxDQUFDLENBQUM7WUFFeEYsTUFBTSx5QkFBeUIsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO1lBQzFHLE1BQU0sQ0FBQyxXQUFXLENBQUMseUJBQXlCLEVBQUUsSUFBSSxFQUFFLDZGQUE2RixDQUFDLENBQUM7UUFDcEosQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsaUVBQWlFLEVBQUUsR0FBRyxFQUFFO1lBQzVFLE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFO2FBQy9DLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDVixZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsMEJBQTBCLENBQUMsQ0FBQztZQUMxRSxNQUFNLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1lBRTlDLE1BQU0sY0FBYyxHQUFHLFFBQVEsRUFBRSxhQUFhLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztZQUNqRixNQUFNLENBQUMsRUFBRSxDQUFDLGNBQWMsRUFBRSwrREFBK0QsQ0FBQyxDQUFDO1FBQzVGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHNEQUFzRCxFQUFFLEdBQUcsRUFBRTtZQUNqRSxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTtnQkFDL0MsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTthQUMvQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ1QsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsK0JBQStCLENBQUMsQ0FBQztZQUN2RixNQUFNLENBQUMsRUFBRSxDQUFDLGdCQUFnQixFQUFFLGdDQUFnQyxDQUFDLENBQUM7WUFDOUQsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7Z0JBQ3ZCLE9BQU87WUFDUixDQUFDO1lBRUQsTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7WUFDdEYsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQztZQUN2RyxNQUFNLGFBQWEsR0FBRyxhQUFhLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDO1lBRXBILE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxJQUFJLENBQUMsRUFBRSwyQkFBMkIsQ0FBQyxDQUFDO1lBQ3hELE1BQU0sQ0FBQyxFQUFFLENBQUMsYUFBYSxJQUFJLENBQUMsRUFBRSw4QkFBOEIsQ0FBQyxDQUFDO1lBQzlELE1BQU0sQ0FBQyxFQUFFLENBQUMsYUFBYSxHQUFHLFVBQVUsRUFBRSxtRUFBbUUsQ0FBQyxDQUFDO1FBQzVHLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG1EQUFtRCxFQUFFLEdBQUcsRUFBRTtZQUM5RCxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTtnQkFDL0MsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTthQUMvQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ1QsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sY0FBYyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLGdDQUFnQyxDQUFnQixDQUFDO1lBQ3JHLE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYyxFQUFFLDhCQUE4QixDQUFDLENBQUM7WUFDMUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBRXpFLGNBQWMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUN2QixNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxrQ0FBa0MsQ0FBQyxFQUFFLHFDQUFxQyxDQUFDLENBQUM7WUFDeEgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzFFLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsa0NBQWtDLENBQUMsQ0FBQztZQUMxRixNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixFQUFFLElBQUksRUFBRSxnRUFBZ0UsQ0FBQyxDQUFDO1lBRTdHLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLDBCQUEwQixDQUFDLENBQUM7WUFDMUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsNkNBQTZDLENBQUMsQ0FBQztZQUVuRSxNQUFNLGVBQWUsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1lBQ3hGLE1BQU0sQ0FBQyxFQUFFLENBQUMsZUFBZSxFQUFFLDJEQUEyRCxDQUFDLENBQUM7WUFFeEYsY0FBYyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3ZCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsa0NBQWtDLENBQUMsRUFBRSxvQ0FBb0MsQ0FBQyxDQUFDO1lBQ3hILE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUMxRSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxtREFBbUQsRUFBRSxHQUFHLEVBQUU7WUFDOUQsTUFBTSxRQUFRLEdBQUcsSUFBSSx3QkFBd0IsQ0FBQztnQkFDN0MsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTtnQkFDL0MsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTthQUMvQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ1QsUUFBUSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUM7WUFDL0IsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLGtDQUFrQyxDQUFDLEVBQUUsNkNBQTZDLENBQUMsQ0FBQztZQUNoSSxNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO1lBQ3RGLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxFQUFFLFlBQVksQ0FBQyxlQUFlLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM1RSxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsRUFBRTtRQUM1QixJQUFJLENBQUMsNENBQTRDLEVBQUUsR0FBRyxFQUFFO1lBQ3ZELE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUU7YUFDcEQsQ0FBQyxDQUFDO1lBQ0gsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sY0FBYyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLGdDQUFnQyxDQUFDLENBQUM7WUFDdEYsTUFBTSxDQUFDLEVBQUUsQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUMxQixNQUFNLFFBQVEsR0FBRyxjQUFjLEVBQUUsYUFBYSxDQUFDLHdCQUF3QixDQUFDLENBQUM7WUFDekUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsNkNBQTZDLENBQUMsQ0FBQztRQUNwRSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxvREFBb0QsRUFBRSxHQUFHLEVBQUU7WUFDL0QsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7Z0JBQ25DO29CQUNDLEVBQUUsRUFBRSxJQUFJO29CQUNSLElBQUksRUFBRSxjQUFjO29CQUNwQixLQUFLLEVBQUUsWUFBWTtvQkFDbkIsT0FBTyxFQUFFO3dCQUNSLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUU7d0JBQzFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUU7cUJBQzFDO2lCQUNEO2FBQ0QsQ0FBQyxDQUFDO1lBQ0gsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsMEJBQTBCLENBQUMsQ0FBQztZQUM5RSxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLDBCQUEwQixDQUFDLENBQUM7UUFDckUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsbUVBQW1FLEVBQUUsR0FBRyxFQUFFO1lBQzlFLE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQztvQkFDQyxFQUFFLEVBQUUsSUFBSTtvQkFDUixJQUFJLEVBQUUsYUFBYTtvQkFDbkIsS0FBSyxFQUFFLGlCQUFpQjtvQkFDeEIsT0FBTyxFQUFFO3dCQUNSLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUU7d0JBQzFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUU7d0JBQzFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUU7cUJBQzFDO2lCQUNEO2FBQ0QsQ0FBQyxDQUFDO1lBQ0gsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsdUNBQXVDLENBQUMsQ0FBQztZQUMzRixNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLDBDQUEwQyxDQUFDLENBQUM7WUFDcEYsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1lBQ25GLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztRQUN0RSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywyREFBMkQsRUFBRSxHQUFHLEVBQUU7WUFDdEUsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7Z0JBQ25DO29CQUNDLEVBQUUsRUFBRSxJQUFJO29CQUNSLElBQUksRUFBRSxjQUFjO29CQUNwQixLQUFLLEVBQUUsWUFBWTtvQkFDbkIsT0FBTyxFQUFFO3dCQUNSLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUU7cUJBQzFDO2lCQUNEO2FBQ0QsQ0FBQyxDQUFDO1lBQ0gsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsa0NBQWtDLENBQUMsQ0FBQztZQUMxRixNQUFNLENBQUMsRUFBRSxDQUFDLGdCQUFnQixFQUFFLGtFQUFrRSxDQUFDLENBQUM7UUFDakcsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMERBQTBELEVBQUUsR0FBRyxFQUFFO1lBQ3JFLE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQztvQkFDQyxFQUFFLEVBQUUsSUFBSTtvQkFDUixJQUFJLEVBQUUsYUFBYTtvQkFDbkIsS0FBSyxFQUFFLGlCQUFpQjtvQkFDeEIsT0FBTyxFQUFFO3dCQUNSLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUU7cUJBQzFDO2lCQUNEO2FBQ0QsQ0FBQyxDQUFDO1lBQ0gsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsa0NBQWtDLENBQUMsQ0FBQztZQUMxRixNQUFNLENBQUMsRUFBRSxDQUFDLGdCQUFnQixFQUFFLGlFQUFpRSxDQUFDLENBQUM7UUFDaEcsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsK0VBQStFLEVBQUUsR0FBRyxFQUFFO1lBQzFGLE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQztvQkFDQyxFQUFFLEVBQUUsSUFBSTtvQkFDUixJQUFJLEVBQUUsY0FBYztvQkFDcEIsS0FBSyxFQUFFLFlBQVk7b0JBQ25CLGtCQUFrQixFQUFFLEtBQUs7b0JBQ3pCLE9BQU8sRUFBRTt3QkFDUixFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFO3dCQUMxQyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFO3FCQUMxQztpQkFDRDthQUNELENBQUMsQ0FBQztZQUNILFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2QixNQUFNLGdCQUFnQixHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLGtDQUFrQyxDQUFDLENBQUM7WUFDMUYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsMkVBQTJFLENBQUMsQ0FBQztRQUN6SCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw4RUFBOEUsRUFBRSxHQUFHLEVBQUU7WUFDekYsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7Z0JBQ25DO29CQUNDLEVBQUUsRUFBRSxJQUFJO29CQUNSLElBQUksRUFBRSxhQUFhO29CQUNuQixLQUFLLEVBQUUsaUJBQWlCO29CQUN4QixrQkFBa0IsRUFBRSxLQUFLO29CQUN6QixPQUFPLEVBQUU7d0JBQ1IsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRTt3QkFDMUMsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRTtxQkFDMUM7aUJBQ0Q7YUFDRCxDQUFDLENBQUM7WUFDSCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1lBQzFGLE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLDJFQUEyRSxDQUFDLENBQUM7UUFDekgsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsbURBQW1ELEVBQUUsR0FBRyxFQUFFO1lBQzlELE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQztvQkFDQyxFQUFFLEVBQUUsSUFBSTtvQkFDUixJQUFJLEVBQUUsY0FBYztvQkFDcEIsS0FBSyxFQUFFLFlBQVk7b0JBQ25CLE9BQU8sRUFBRTt3QkFDUixFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFO3dCQUMxQyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFO3FCQUMxQztvQkFDRCxZQUFZLEVBQUUsR0FBRztpQkFDakI7YUFDRCxDQUFDLENBQUM7WUFDSCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsa0RBQWtEO1lBQ2xELE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsMEJBQTBCLENBQTRCLENBQUM7WUFDekcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSxJQUFJLEVBQUUsMERBQTBELENBQUMsQ0FBQztZQUNsSSxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3hFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGtEQUFrRCxFQUFFLEdBQUcsRUFBRTtZQUM3RCxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkM7b0JBQ0MsRUFBRSxFQUFFLElBQUk7b0JBQ1IsSUFBSSxFQUFFLGFBQWE7b0JBQ25CLEtBQUssRUFBRSxpQkFBaUI7b0JBQ3hCLE9BQU8sRUFBRTt3QkFDUixFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFO3dCQUMxQyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFO3dCQUMxQyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFO3FCQUMxQztvQkFDRCxZQUFZLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO2lCQUN4QjthQUNELENBQUMsQ0FBQztZQUNILFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2Qiw0REFBNEQ7WUFDNUQsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQywwQkFBMEIsQ0FBNEIsQ0FBQztZQUN6RyxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksRUFBRSx3Q0FBd0MsQ0FBQyxDQUFDO1lBQy9HLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEVBQUUsSUFBSSxFQUFFLGdFQUFnRSxDQUFDLENBQUM7WUFDdkksTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsMENBQTBDLENBQUMsQ0FBQztRQUNuSCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxpRUFBaUUsRUFBRSxHQUFHLEVBQUU7WUFDNUUsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7Z0JBQ25DO29CQUNDLEVBQUUsRUFBRSxJQUFJO29CQUNSLElBQUksRUFBRSxjQUFjO29CQUNwQixLQUFLLEVBQUUsWUFBWTtvQkFDbkIsT0FBTyxFQUFFO3dCQUNSLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUU7d0JBQ2hELEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUU7cUJBQ2hEO29CQUNELFlBQVksRUFBRSxHQUFHO2lCQUNqQjthQUNELENBQUMsQ0FBQztZQUNILFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2QixNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLDBCQUEwQixDQUE0QixDQUFDO1lBQ3pHLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztZQUNoRSxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyx3Q0FBd0M7WUFFOUQsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBdUQsQ0FBQztZQUNqRyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDcEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3JELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGdFQUFnRSxFQUFFLEdBQUcsRUFBRTtZQUMzRSxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkM7b0JBQ0MsRUFBRSxFQUFFLElBQUk7b0JBQ1IsSUFBSSxFQUFFLGFBQWE7b0JBQ25CLEtBQUssRUFBRSxpQkFBaUI7b0JBQ3hCLE9BQU8sRUFBRTt3QkFDUixFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFO3dCQUNoRCxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFO3dCQUNoRCxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFO3FCQUNoRDtvQkFDRCxZQUFZLEVBQUUsR0FBRztpQkFDakI7YUFDRCxDQUFDLENBQUM7WUFDSCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQywwQkFBMEIsQ0FBNEIsQ0FBQztZQUN6RyxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLHdCQUF3QixDQUFDLENBQUM7WUFDbEUsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsd0NBQXdDO1lBRTlELE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLDhCQUE4QixDQUFzQixDQUFDO1lBQ3ZHLE1BQU0sQ0FBQyxFQUFFLENBQUMsWUFBWSxFQUFFLDRCQUE0QixDQUFDLENBQUM7WUFDdEQsWUFBWSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBRXJCLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQTBELENBQUM7WUFDcEcsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO1lBQ2hELE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNyRCxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNwRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDckQsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxZQUFZLEVBQUUsR0FBRyxFQUFFO1FBQ3hCLElBQUksQ0FBQywrQ0FBK0MsRUFBRSxHQUFHLEVBQUU7WUFDMUQsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7Z0JBQ25DLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7Z0JBQy9DLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7YUFDL0MsQ0FBQyxDQUFDO1lBQ0gsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsMEJBQTBCLENBQWtDLENBQUM7WUFDL0csTUFBTSxVQUFVLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hDLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxFQUFFLDhCQUE4QixDQUFDLENBQUM7WUFDdEQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxVQUFVLENBQUMsUUFBUSxFQUFFLHNEQUFzRCxDQUFDLENBQUM7UUFDckksQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNkRBQTZELEVBQUUsR0FBRyxFQUFFO1lBQ3hFLE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFO2dCQUNsRCxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFO2FBQy9DLENBQUMsQ0FBQztZQUNILFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2Qiw0QkFBNEI7WUFDNUIsTUFBTSxDQUFDLHNCQUFzQixFQUFFLENBQUM7WUFFaEMsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQywwQkFBMEIsQ0FBa0MsQ0FBQztZQUMvRyxNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztZQUNsRCxNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxRQUFRLEVBQUUsaURBQWlELENBQUMsQ0FBQztRQUNoSSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx5Q0FBeUMsRUFBRSxHQUFHLEVBQUU7WUFDcEQsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7Z0JBQ25DLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7Z0JBQy9DLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7YUFDL0MsQ0FBQyxDQUFDO1lBQ0gsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLDRCQUE0QjtZQUM1QixNQUFNLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztZQUVoQyxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyw4QkFBOEIsQ0FBc0IsQ0FBQztZQUN2RyxNQUFNLENBQUMsRUFBRSxDQUFDLFlBQVksRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1lBQ3RELE1BQU0sQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLGtEQUFrRCxDQUFDLENBQUM7UUFDL0csQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7UUFDaEMsSUFBSSxDQUFDLDJEQUEyRCxFQUFFLEdBQUcsRUFBRTtZQUN0RSxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsZ0JBQWdCLEVBQUU7YUFDL0UsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNULFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2QixNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDN0IsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLGtEQUFrRCxDQUFDLENBQUM7WUFDckYsTUFBTSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsWUFBWSxHQUFHLEVBQUUsc0NBQXNDLENBQUMsQ0FBQztZQUNuRixNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDO1FBQ3hHLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEdBQUcsRUFBRTtZQUMvQyxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTthQUMvQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ1YsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUM3QixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsb0RBQW9ELENBQUMsQ0FBQztZQUN4RixNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixFQUFFLElBQUksRUFBRSxzQ0FBc0MsQ0FBQyxDQUFDO1FBQ3BGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDhCQUE4QixFQUFFLEdBQUcsRUFBRTtZQUN6QyxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTthQUMvQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ1QsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNkLGdCQUFnQixHQUFHLElBQUksQ0FBQyxDQUFDLFFBQVE7WUFDakMsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQzdCLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDO1lBQ3ZFLE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLHFDQUFxQyxDQUFDLENBQUM7UUFDbkYsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7UUFDbEMsSUFBSSxDQUFDLDhEQUE4RCxFQUFFLEdBQUcsRUFBRTtZQUN6RSxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTthQUMvQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ1QsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMvQixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsb0RBQW9ELENBQUMsQ0FBQztZQUN2RixNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixFQUFFLFNBQVMsRUFBRSw0Q0FBNEMsQ0FBQyxDQUFDO1FBQy9GLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHNDQUFzQyxFQUFFLEdBQUcsRUFBRTtZQUNqRCxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTthQUMvQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ1YsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMvQixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsc0RBQXNELENBQUMsQ0FBQztZQUMxRixNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixFQUFFLElBQUksRUFBRSxzQ0FBc0MsQ0FBQyxDQUFDO1FBQ3BGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsRUFBRTtZQUMzQyxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTthQUMvQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ1QsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNoQixnQkFBZ0IsR0FBRyxJQUFJLENBQUMsQ0FBQyxRQUFRO1lBQ2pDLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMvQixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUscUNBQXFDLENBQUMsQ0FBQztZQUN6RSxNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixFQUFFLElBQUksRUFBRSxxQ0FBcUMsQ0FBQyxDQUFDO1FBQ25GLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHdDQUF3QyxFQUFFLEdBQUcsRUFBRTtZQUNuRCxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTthQUMvQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ1QsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNkLGdCQUFnQixHQUFHLElBQUksQ0FBQyxDQUFDLFFBQVE7WUFDakMsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQy9CLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSwyQ0FBMkMsQ0FBQyxDQUFDO1lBQy9FLE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLHFDQUFxQyxDQUFDLENBQUM7UUFDbkYsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFO1FBQzNCLElBQUksQ0FBQyxnREFBZ0QsRUFBRSxHQUFHLEVBQUU7WUFDM0QsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7Z0JBQ25DLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7YUFDL0MsQ0FBQyxDQUFDO1lBQ0gsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLDZCQUE2QixDQUFDLENBQUM7WUFDeEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUUsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDO1lBQzVELE1BQU0sQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLFlBQVksQ0FBQyxZQUFZLENBQUMsRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDO1FBQ2pGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG1EQUFtRCxFQUFFLEdBQUcsRUFBRTtZQUM5RCxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkM7b0JBQ0MsRUFBRSxFQUFFLElBQUk7b0JBQ1IsSUFBSSxFQUFFLGNBQWM7b0JBQ3BCLEtBQUssRUFBRSxZQUFZO29CQUNuQixPQUFPLEVBQUU7d0JBQ1IsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRTt3QkFDMUMsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRTtxQkFDMUM7aUJBQ0Q7YUFDRCxDQUFDLENBQUM7WUFDSCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMscUJBQXFCLENBQUMsQ0FBQztZQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDMUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsWUFBWSxDQUFDLFlBQVksQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQ3BFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEdBQUcsRUFBRTtZQUMxRCxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkM7b0JBQ0MsRUFBRSxFQUFFLElBQUk7b0JBQ1IsSUFBSSxFQUFFLGNBQWM7b0JBQ3BCLEtBQUssRUFBRSxZQUFZO29CQUNuQixPQUFPLEVBQUU7d0JBQ1IsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRTt3QkFDMUMsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRTtxQkFDMUM7aUJBQ0Q7YUFDRCxDQUFDLENBQUM7WUFDSCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1lBQzlFLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztZQUVwRSw4RUFBOEU7WUFDOUUsTUFBTSxTQUFTLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBZ0IsQ0FBQztZQUM5QyxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDN0QsTUFBTSxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLDZCQUE2QixDQUFDLENBQUM7WUFDdkQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxvQ0FBb0MsQ0FBQyxDQUFDO1lBRTFHLHFDQUFxQztZQUNyQyxNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFnQixDQUFDO1lBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUM5RCxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsZUFBZSxDQUFDLEVBQUUsT0FBTyxFQUFFLGlEQUFpRCxDQUFDLENBQUM7UUFDMUgsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLEVBQUU7UUFDNUIsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLEdBQUcsRUFBRTtZQUNwRCxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTthQUMvQyxDQUFDLENBQUM7WUFDSCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsRUFBVyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDNUUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMENBQTBDLEVBQUUsR0FBRyxFQUFFO1lBQ3JELE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFO2FBQy9DLENBQUMsQ0FBQztZQUNILFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2QixNQUFNLGdCQUFnQixHQUFHLEVBQUUsSUFBSSxFQUFFLFVBQW1CLEVBQVcsQ0FBQztZQUNoRSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxFQUFFLEVBQVcsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3JGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsMEJBQTBCLEVBQUUsR0FBRyxFQUFFO1FBQ3RDLElBQUksQ0FBQyxnREFBZ0QsRUFBRSxHQUFHLEVBQUU7WUFDM0QsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7Z0JBQ25DLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRTthQUM3RSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ1QsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNkLE1BQU0sQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLFlBQVksR0FBRyxDQUFDLENBQUM7WUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDakUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsd0RBQXdELEVBQUUsR0FBRyxFQUFFO1lBQ25FLE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQztvQkFDQyxFQUFFLEVBQUUsSUFBSTtvQkFDUixJQUFJLEVBQUUsY0FBYztvQkFDcEIsS0FBSyxFQUFFLFlBQVk7b0JBQ25CLE9BQU8sRUFBRTt3QkFDUixFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFO3dCQUNoRCxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFO3FCQUNoRDtvQkFDRCxZQUFZLEVBQUUsR0FBRztpQkFDakI7YUFDRCxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ1QsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNkLE1BQU0sQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLFlBQVksR0FBRyxDQUFDLENBQUM7WUFDM0MsbUVBQW1FO1lBQ25FLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQXVELENBQUM7WUFDakcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3BELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNyRCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1REFBdUQsRUFBRSxHQUFHLEVBQUU7WUFDbEUsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7Z0JBQ25DO29CQUNDLEVBQUUsRUFBRSxJQUFJO29CQUNSLElBQUksRUFBRSxhQUFhO29CQUNuQixLQUFLLEVBQUUsaUJBQWlCO29CQUN4QixPQUFPLEVBQUU7d0JBQ1IsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRTt3QkFDaEQsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRTt3QkFDaEQsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRTtxQkFDaEQ7b0JBQ0QsWUFBWSxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztpQkFDeEI7YUFDRCxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ1QsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNkLE1BQU0sQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLFlBQVksR0FBRyxDQUFDLENBQUM7WUFDM0Msa0VBQWtFO1lBQ2xFLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQTBELENBQUM7WUFDcEcsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO1lBQ2hELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDcEQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ3JELE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNyRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDckQsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsOENBQThDLEVBQUUsR0FBRyxFQUFFO1lBQ3pELE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxjQUFjLEVBQUU7Z0JBQ2hGO29CQUNDLEVBQUUsRUFBRSxJQUFJO29CQUNSLElBQUksRUFBRSxjQUFjO29CQUNwQixLQUFLLEVBQUUsZUFBZTtvQkFDdEIsT0FBTyxFQUFFO3dCQUNSLEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUU7cUJBQ3BEO29CQUNELFlBQVksRUFBRSxNQUFNO2lCQUNwQjthQUNELEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDVCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2QsTUFBTSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsWUFBWSxHQUFHLENBQUMsQ0FBQztZQUMzQyxNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxjQUFjLENBQUMsQ0FBQztZQUNoRSxtRUFBbUU7WUFDbkUsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBdUQsQ0FBQztZQUNqRyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3JELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHNEQUFzRCxFQUFFLEdBQUcsRUFBRTtZQUNqRSxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLDBCQUEwQixFQUFFO2FBQzdELEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDVCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2QsTUFBTSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsWUFBWSxHQUFHLENBQUMsQ0FBQztZQUMzQyxNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsMENBQTBDLENBQUMsQ0FBQztRQUMzRixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtRQUNuQyxJQUFJLENBQUMsMkRBQTJELEVBQUUsR0FBRyxFQUFFO1lBQ3RFLE1BQU0sUUFBUSxHQUFHLElBQUksd0JBQXdCLENBQUM7Z0JBQzdDLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7Z0JBQy9DLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7YUFDL0MsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUVULE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMzQyxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyx5QkFBeUIsQ0FBdUIsQ0FBQztZQUN0RyxNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO1lBQ2xELFVBQVUsQ0FBQyxhQUFhLENBQUMsSUFBSSxVQUFVLENBQUMsT0FBTyxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUVyRSxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDdEIsV0FBVyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUU3QixNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDL0MsTUFBTSxhQUFhLEdBQUcsZUFBZSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsK0JBQStCLENBQUMsQ0FBQztZQUM3RixNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLDREQUE0RCxDQUFDLENBQUM7WUFFcEgsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsc0JBQXNCLENBQUMsQ0FBQztZQUM1RSxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxXQUFXLEVBQUUsUUFBUSxDQUFDLFlBQVksQ0FBQyxFQUFFLDRDQUE0QyxDQUFDLENBQUM7UUFDckcsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsb0VBQW9FLEVBQUUsR0FBRyxFQUFFO1lBQy9FLE1BQU0sUUFBUSxHQUFHLElBQUksd0JBQXdCLENBQUM7Z0JBQzdDLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7Z0JBQy9DLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7YUFDL0MsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUVULE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMzQyxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBNEIsQ0FBQztZQUMxRyxNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDO1lBQzNELFVBQVUsQ0FBQyxLQUFLLEdBQUcsb0JBQW9CLENBQUM7WUFDeEMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRWhFLE1BQU0sVUFBVSxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLHlCQUF5QixDQUF1QixDQUFDO1lBQ3RHLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxFQUFFLDBCQUEwQixDQUFDLENBQUM7WUFDbEQsVUFBVSxDQUFDLGFBQWEsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRXJFLE1BQU0sV0FBVyxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUE0QixDQUFDO1lBQzNHLE1BQU0sQ0FBQyxFQUFFLENBQUMsV0FBVyxFQUFFLG9DQUFvQyxDQUFDLENBQUM7WUFDN0QsV0FBVyxDQUFDLEtBQUssR0FBRyxxQkFBcUIsQ0FBQztZQUMxQyxXQUFXLENBQUMsYUFBYSxDQUFDLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFakUsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3RCLFdBQVcsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7WUFFN0IsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQy9DLE1BQU0sYUFBYSxHQUFHLGVBQWUsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLCtCQUErQixDQUFDLENBQUM7WUFDN0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSwyQ0FBMkMsQ0FBQyxDQUFDO1lBRW5HLE1BQU0sb0JBQW9CLEdBQUcsZUFBZSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQTRCLENBQUM7WUFDeEgsTUFBTSxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsRUFBRSw4Q0FBOEMsQ0FBQyxDQUFDO1lBQ2hGLE1BQU0sQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsS0FBSyxFQUFFLHFCQUFxQixFQUFFLGlEQUFpRCxDQUFDLENBQUM7WUFFekgsTUFBTSxVQUFVLEdBQUcsZUFBZSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMseUJBQXlCLENBQXVCLENBQUM7WUFDMUcsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLEVBQUUsOEJBQThCLENBQUMsQ0FBQztZQUN0RCxVQUFVLENBQUMsYUFBYSxDQUFDLElBQUksVUFBVSxDQUFDLE9BQU8sRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFckUsTUFBTSxtQkFBbUIsR0FBRyxlQUFlLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBNEIsQ0FBQztZQUN2SCxNQUFNLENBQUMsRUFBRSxDQUFDLG1CQUFtQixFQUFFLDZDQUE2QyxDQUFDLENBQUM7WUFDOUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsa0RBQWtELENBQUMsQ0FBQztRQUN6SCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx5Q0FBeUMsRUFBRSxHQUFHLEVBQUU7WUFDcEQsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7Z0JBQ25DLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLGdCQUFnQixFQUFFO2FBQy9FLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDVCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1lBRWQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsNkJBQTZCLENBQUMsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1lBQ3RHLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLGlDQUFpQyxDQUFDLENBQUM7WUFDaEYsTUFBTSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsMENBQTBDLENBQUMsQ0FBQztZQUMvRCxNQUFNLFdBQVcsR0FBRyxPQUFPLEVBQUUsYUFBYSxDQUFDLDZCQUE2QixDQUFDLENBQUM7WUFDMUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsMkNBQTJDLENBQUMsQ0FBQztZQUNwRSxNQUFNLFlBQVksR0FBRyxXQUFXLEVBQUUsYUFBYSxDQUFDLHFDQUFxQyxDQUFDLENBQUM7WUFDdkYsTUFBTSxDQUFDLEVBQUUsQ0FBQyxZQUFZLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLHdDQUF3QyxDQUFDLENBQUM7UUFDNUcsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsc0NBQXNDLEVBQUUsR0FBRyxFQUFFO1lBQ2pELE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFO2FBQy9DLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDVCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBRWhCLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLDZCQUE2QixDQUFDLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztZQUN0RyxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1lBQ2hGLE1BQU0sQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLDRDQUE0QyxDQUFDLENBQUM7WUFDakUsTUFBTSxjQUFjLEdBQUcsT0FBTyxFQUFFLGFBQWEsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO1lBQ2hGLE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYyxFQUFFLDBDQUEwQyxDQUFDLENBQUM7UUFDdkUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdURBQXVELEVBQUUsR0FBRyxFQUFFO1lBQ2xFLE1BQU0sUUFBUSxHQUEwQjtnQkFDdkMsSUFBSSxFQUFFLGtCQUFrQjtnQkFDeEIsU0FBUyxFQUFFO29CQUNWLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7aUJBQy9DO2dCQUNELFNBQVMsRUFBRSxJQUFJO2dCQUNmLE1BQU0sRUFBRSxJQUFJO2dCQUNaLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxjQUFjLEVBQUU7YUFDNUIsQ0FBQztZQUNGLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2QixNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsQ0FBQyxFQUFFLHdCQUF3QixDQUFDLENBQUM7WUFDdEcsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsaUNBQWlDLENBQUMsQ0FBQztZQUNoRixNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxtREFBbUQsQ0FBQyxDQUFDO1lBQ3hFLE1BQU0sWUFBWSxHQUFHLE9BQU8sRUFBRSxhQUFhLENBQUMscUNBQXFDLENBQUMsQ0FBQztZQUNuRixNQUFNLENBQUMsRUFBRSxDQUFDLFlBQVksRUFBRSxXQUFXLEVBQUUsUUFBUSxDQUFDLGNBQWMsQ0FBQyxFQUFFLDRDQUE0QyxDQUFDLENBQUM7UUFDOUcsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZ0VBQWdFLEVBQUUsR0FBRyxFQUFFO1lBQzNFLE1BQU0sUUFBUSxHQUEwQjtnQkFDdkMsSUFBSSxFQUFFLGtCQUFrQjtnQkFDeEIsU0FBUyxFQUFFO29CQUNWLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7aUJBQy9DO2dCQUNELFNBQVMsRUFBRSxJQUFJO2dCQUNmLE1BQU0sRUFBRSxJQUFJO2FBQ1osQ0FBQztZQUNGLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2QixNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsQ0FBQyxFQUFFLHdCQUF3QixDQUFDLENBQUM7WUFDdEcsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsaUNBQWlDLENBQUMsQ0FBQztZQUNoRixNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSwrQkFBK0IsQ0FBQyxDQUFDO1lBQ3BELE1BQU0sY0FBYyxHQUFHLE9BQU8sRUFBRSxhQUFhLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztZQUNoRixNQUFNLENBQUMsRUFBRSxDQUFDLGNBQWMsRUFBRSwwQ0FBMEMsQ0FBQyxDQUFDO1FBQ3ZFLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO1FBQ3JDLElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxHQUFHLEVBQUU7WUFDdkQsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7Z0JBQ25DLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLDBCQUEwQixFQUFFO2FBQ25GLENBQUMsQ0FBQztZQUNILFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2QixNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1lBQ3hFLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLHdDQUF3QyxDQUFDLENBQUM7WUFDMUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsV0FBVyxFQUFFLDBCQUEwQixDQUFDLENBQUM7UUFDbkUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdURBQXVELEVBQUUsR0FBRyxFQUFFO1lBQ2xFLE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFO2FBQ3pDLENBQUMsQ0FBQztZQUNILFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2QixNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1lBQ3hFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSx3REFBd0QsQ0FBQyxDQUFDO1FBQzFGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGtEQUFrRCxFQUFFLEdBQUcsRUFBRTtZQUM3RCxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRTtnQkFDekMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRTthQUMxQyxDQUFDLENBQUM7WUFDSCxRQUFRLENBQUMsT0FBTyxHQUFHLCtCQUErQixDQUFDO1lBQ25ELFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2QixNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1lBQ2hGLE1BQU0sQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLHFDQUFxQyxDQUFDLENBQUM7WUFDMUQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDLENBQUM7UUFDNUUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNENBQTRDLEVBQUUsR0FBRyxFQUFFO1lBQ3ZELE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFO2FBQ3pDLENBQUMsQ0FBQztZQUNILFFBQVEsQ0FBQyxPQUFPLEdBQUcsSUFBSSxjQUFjLENBQUMsK0JBQStCLENBQUMsQ0FBQztZQUN2RSxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsaUNBQWlDLENBQUMsQ0FBQztZQUNoRixNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxxQ0FBcUMsQ0FBQyxDQUFDO1lBQzFELE1BQU0sQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLGFBQWEsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLHdDQUF3QyxDQUFDLENBQUM7UUFDbkcsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZ0RBQWdELEVBQUUsR0FBRyxFQUFFO1lBQzNELE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO2dCQUNuQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUU7YUFDekQsQ0FBQyxDQUFDO1lBQ0gsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLHNCQUFzQixDQUFDLENBQUM7WUFDbkUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ3hGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHdEQUF3RCxFQUFFLEdBQUcsRUFBRTtZQUNuRSxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRTthQUM3QyxDQUFDLENBQUM7WUFDSCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsc0JBQXNCLENBQUMsQ0FBQztZQUNuRSxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxXQUFXLENBQUMsQ0FBQztZQUM5QixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsd0NBQXdDLENBQUMsQ0FBQztRQUN6RixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLFlBQVksRUFBRSxHQUFHLEVBQUU7UUFDeEIsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEdBQUcsRUFBRTtZQUMvQyxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkM7b0JBQ0MsRUFBRSxFQUFFLElBQUk7b0JBQ1IsSUFBSSxFQUFFLE1BQU07b0JBQ1osS0FBSyxFQUFFLE9BQU87b0JBQ2QsVUFBVSxFQUFFLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRTtpQkFDL0I7YUFDRCxDQUFDLENBQUM7WUFDSCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsbUNBQW1DLENBQXVCLENBQUM7WUFDOUcsTUFBTSxDQUFDLEVBQUUsQ0FBQyxhQUFhLEVBQUUseUNBQXlDLENBQUMsQ0FBQztZQUNwRSxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSwrQ0FBK0MsQ0FBQyxDQUFDO1FBQzNHLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFLEdBQUcsRUFBRTtZQUN2RCxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFO2FBQ3pELENBQUMsQ0FBQztZQUNILFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2Qix5Q0FBeUM7WUFDekMsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsOEJBQThCLENBQXNCLENBQUM7WUFDdkcsTUFBTSxDQUFDLEVBQUUsQ0FBQyxZQUFZLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztZQUN0RCxZQUFZLENBQUMsS0FBSyxFQUFFLENBQUM7WUFFckIsOENBQThDO1lBQzlDLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLG1DQUFtQyxDQUFDLENBQUM7WUFDeEYsTUFBTSxDQUFDLEVBQUUsQ0FBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLGtDQUFrQyxDQUFDLENBQUM7WUFDMUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsMkJBQTJCLENBQUMsQ0FBQztRQUN6RSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywyREFBMkQsRUFBRSxHQUFHLEVBQUU7WUFDdEUsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7Z0JBQ25DLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRTtnQkFDekQsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRTthQUN4QyxDQUFDLENBQUM7WUFDSCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFdkIsb0VBQW9FO1lBQ3BFLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLHlCQUF5QixDQUFzQixDQUFDO1lBQ2hHLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxFQUFFLDBCQUEwQixDQUFDLENBQUM7WUFDbEQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSw2REFBNkQsQ0FBQyxDQUFDO1FBQ3JILENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFLEdBQUcsRUFBRTtZQUN2RCxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFO2FBQ3pELENBQUMsQ0FBQztZQUNILFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2QixrQ0FBa0M7WUFDbEMsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQXFCLENBQUM7WUFDNUYsTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztZQUMxQyxRQUFRLENBQUMsS0FBSyxHQUFHLE1BQU0sQ0FBQztZQUN4QixRQUFRLENBQUMsYUFBYSxDQUFDLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFOUQsU0FBUztZQUNULE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLDhCQUE4QixDQUFzQixDQUFDO1lBQ3ZHLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUVyQixNQUFNLENBQUMsRUFBRSxDQUFDLGdCQUFnQixLQUFLLElBQUksRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO1FBQy9ELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHFEQUFxRCxFQUFFLEdBQUcsRUFBRTtZQUNoRSxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRTtnQkFDN0MsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFO2FBQzdELENBQUMsQ0FBQztZQUNILFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV2QiwyREFBMkQ7WUFDM0QsTUFBTSxDQUFDLHNCQUFzQixFQUFFLENBQUM7WUFFaEMsMERBQTBEO1lBQzFELE1BQU0sQ0FBQywwQkFBMEIsRUFBRSxDQUFDO1lBRXBDLDZDQUE2QztZQUM3QyxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyw4QkFBOEIsQ0FBc0IsQ0FBQztZQUN2RyxJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUNsQixZQUFZLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDdEIsQ0FBQztZQUVELHFEQUFxRDtZQUNyRCxNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixFQUFFLElBQUksRUFBRSxnREFBZ0QsQ0FBQyxDQUFDO1FBQzlGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9