/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../../../platform/dialogs/test/common/testDialogService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatPlanReviewPart, IChatPlanReviewPartOptions } from '../../../../browser/widget/chatContentParts/chatPlanReviewPart.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { IChatPlanApprovalAction, IChatPlanReview, IChatPlanReviewResult } from '../../../../common/chatService/chatService.js';
import { IChatRendererContent } from '../../../../common/model/chatViewModel.js';
import { ChatPlanReviewData } from '../../../../common/model/chatProgressTypes/chatPlanReviewData.js';

function createMockReview(overrides?: Partial<IChatPlanReview>): IChatPlanReview {
	return {
		kind: 'planReview',
		title: 'Review Plan',
		content: '# Plan\n- step 1\n- step 2',
		actions: [{ label: 'Autopilot', default: true }],
		canProvideFeedback: false,
		...overrides,
	};
}

function createMockContext(): IChatContentPartRenderContext {
	return {} as IChatContentPartRenderContext;
}

/** Query all `.monaco-button` elements inside the footer `.chat-buttons` container. */
function getFooterButtons(widget: ChatPlanReviewPart): HTMLElement[] {
	const container = widget.domNode.querySelector('.chat-plan-review-footer .chat-buttons');
	return container ? Array.from(container.querySelectorAll('.monaco-button')) : [];
}

/** Query all `.monaco-button` elements inside the inline-actions container (collapsed title bar). */
function getInlineButtons(widget: ChatPlanReviewPart): HTMLElement[] {
	const container = widget.domNode.querySelector('.chat-plan-review-inline-actions');
	return container ? Array.from(container.querySelectorAll('.monaco-button')) : [];
}

suite('ChatPlanReviewPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let widget: ChatPlanReviewPart;
	let lastSubmitResult: IChatPlanReviewResult | undefined;

	function createWidget(review: IChatPlanReview, dialogService?: TestDialogService): ChatPlanReviewPart {
		const instantiationService = workbenchInstantiationService(undefined, store);
		if (dialogService) {
			instantiationService.stub(IDialogService, dialogService);
		}
		const options: IChatPlanReviewPartOptions = {
			onSubmit: (result) => { lastSubmitResult = result; }
		};
		widget = store.add(instantiationService.createInstance(ChatPlanReviewPart, review, createMockContext(), options));
		mainWindow.document.body.appendChild(widget.domNode);
		return widget;
	}

	teardown(() => {
		if (widget?.domNode?.parentNode) {
			widget.domNode.parentNode.removeChild(widget.domNode);
		}
		lastSubmitResult = undefined;
	});

	suite('Basic rendering', () => {
		test('renders container with proper structure', () => {
			createWidget(createMockReview());

			assert.ok(widget.domNode.classList.contains('chat-plan-review-container'));
			assert.ok(widget.domNode.querySelector('.chat-plan-review-title'));
			assert.ok(widget.domNode.querySelector('.chat-plan-review-body'));
			assert.ok(widget.domNode.querySelector('.chat-plan-review-footer'));
		});

		test('displays the review title', () => {
			createWidget(createMockReview({ title: 'My Plan Title' }));

			const label = widget.domNode.querySelector('.chat-plan-review-title-label');
			assert.strictEqual(label?.textContent, 'My Plan Title');
		});

		test('renders markdown content in the body', () => {
			createWidget(createMockReview({ content: '**bold text**' }));

			const body = widget.domNode.querySelector('.chat-plan-review-body');
			assert.ok(body);
			assert.ok(body?.querySelector('.rendered-markdown'));
		});

		test('renders approve and reject buttons in footer', () => {
			createWidget(createMockReview());

			const buttons = getFooterButtons(widget);
			assert.ok(buttons.length >= 2, 'should have at least approve and reject buttons');
			assert.ok(buttons.some(b => b.textContent?.includes('Autopilot')), 'should have approve button');
			assert.ok(buttons.some(b => b.textContent?.includes('Reject')), 'should have reject button');
		});

		test('hides feedback section initially even when canProvideFeedback is true', () => {
			createWidget(createMockReview({ canProvideFeedback: true }));

			const feedbackSection = widget.domNode.querySelector('.chat-plan-review-feedback') as HTMLElement;
			assert.ok(feedbackSection);
			assert.strictEqual(feedbackSection.style.display, 'none');
		});

		test('renders Provide Feedback button when canProvideFeedback is true', () => {
			createWidget(createMockReview({ canProvideFeedback: true }));

			const buttons = getFooterButtons(widget);
			assert.ok(buttons.some(b => b.textContent?.includes('Provide Feedback')), 'should have Provide Feedback button');
		});

		test('does not render Provide Feedback button when canProvideFeedback is false', () => {
			createWidget(createMockReview({ canProvideFeedback: false }));

			const buttons = getFooterButtons(widget);
			assert.ok(!buttons.some(b => b.textContent?.includes('Provide Feedback')), 'should not have Provide Feedback button');
		});
	});

	suite('Submit results', () => {
		test('clicking approve submits action with label and rejected=false', () => {
			createWidget(createMockReview({ actions: [{ label: 'Go', default: true }] }));

			const approveButton = getFooterButtons(widget).find(b => b.textContent?.includes('Go'));
			assert.ok(approveButton);
			approveButton!.click();

			assert.deepStrictEqual(lastSubmitResult, { action: 'Go', rejected: false });
		});

		test('clicking reject submits rejected=true', () => {
			createWidget(createMockReview());

			const rejectButton = getFooterButtons(widget).find(b => b.textContent?.includes('Reject'));
			assert.ok(rejectButton);
			rejectButton!.click();

			assert.deepStrictEqual(lastSubmitResult, { rejected: true });
		});

		test('double-click does not submit twice', () => {
			let submitCount = 0;
			const instantiationService = workbenchInstantiationService(undefined, store);
			const options: IChatPlanReviewPartOptions = {
				onSubmit: () => { submitCount++; }
			};
			widget = store.add(instantiationService.createInstance(
				ChatPlanReviewPart,
				createMockReview(),
				createMockContext(),
				options
			));
			mainWindow.document.body.appendChild(widget.domNode);

			const approveButton = getFooterButtons(widget).find(b => b.textContent?.includes('Autopilot'));
			approveButton!.click();
			approveButton!.click();

			assert.strictEqual(submitCount, 1);
		});

		test('buttons are removed after submission', () => {
			createWidget(createMockReview());

			const approveButton = getFooterButtons(widget).find(b => b.textContent?.includes('Autopilot'));
			approveButton!.click();

			assert.ok(widget.domNode.classList.contains('chat-plan-review-used'));
			assert.strictEqual(getFooterButtons(widget).length, 0, 'footer buttons should be cleared');
		});
	});

	suite('Feedback mode', () => {
		test('clicking Provide Feedback shows feedback section and Submit button', () => {
			createWidget(createMockReview({ canProvideFeedback: true }));

			const feedbackButton = getFooterButtons(widget).find(b => b.textContent?.includes('Provide Feedback'));
			assert.ok(feedbackButton);
			feedbackButton!.click();

			// Feedback section should now be visible
			const feedbackSection = widget.domNode.querySelector('.chat-plan-review-feedback') as HTMLElement;
			assert.notStrictEqual(feedbackSection.style.display, 'none', 'feedback section should be visible');

			// Should have Submit button
			const buttons = getFooterButtons(widget);
			assert.ok(buttons.some(b => b.textContent?.includes('Submit')), 'should have Submit button');

			// Autopilot / Provide Feedback buttons should be gone
			assert.ok(!buttons.some(b => b.textContent?.includes('Autopilot')), 'approve button should be hidden');
			assert.ok(!buttons.some(b => b.textContent?.includes('Provide Feedback')), 'feedback button should be hidden');
		});

		test('reject button remains visible in feedback mode', () => {
			createWidget(createMockReview({ canProvideFeedback: true }));

			const feedbackButton = getFooterButtons(widget).find(b => b.textContent?.includes('Provide Feedback'));
			feedbackButton!.click();

			const buttons = getFooterButtons(widget);
			assert.ok(buttons.some(b => b.textContent?.includes('Reject')), 'reject button should still be visible');
		});

		test('submitting feedback sends feedback value with rejected=false', () => {
			createWidget(createMockReview({ canProvideFeedback: true }));

			// Enter feedback mode
			const feedbackButton = getFooterButtons(widget).find(b => b.textContent?.includes('Provide Feedback'));
			feedbackButton!.click();

			// Type feedback
			const textarea = widget.domNode.querySelector('.chat-plan-review-feedback-textarea') as HTMLTextAreaElement;
			assert.ok(textarea);
			textarea.value = 'Please also add tests';
			textarea.dispatchEvent(new Event('input'));

			// Click submit
			const submitButton = getFooterButtons(widget).find(b => b.textContent?.includes('Submit'));
			submitButton!.click();

			assert.deepStrictEqual(lastSubmitResult, { rejected: false, feedback: 'Please also add tests' });
		});

		test('clicking feedback close button exits feedback mode, hides section, restores buttons, and clears draft', () => {
			const data = new ChatPlanReviewData('Title', 'Content', [{ label: 'Autopilot', default: true }], true);
			createWidget(data);

			// Enter feedback mode
			const feedbackButton = getFooterButtons(widget).find(b => b.textContent?.includes('Provide Feedback'));
			feedbackButton!.click();

			// Type some draft feedback
			const textarea = widget.domNode.querySelector('.chat-plan-review-feedback-textarea') as HTMLTextAreaElement;
			textarea.value = 'draft feedback';
			textarea.dispatchEvent(new Event('input'));

			// Click the close button inside the feedback header
			const closeButton = widget.domNode.querySelector('.chat-plan-review-feedback-close') as HTMLElement;
			assert.ok(closeButton, 'feedback close button should exist');
			closeButton.click();

			// Feedback section should be hidden
			const feedbackSection = widget.domNode.querySelector('.chat-plan-review-feedback') as HTMLElement;
			assert.strictEqual(feedbackSection.style.display, 'none', 'feedback section should be hidden');

			// Footer buttons should be back to the normal set
			const buttons = getFooterButtons(widget);
			assert.ok(buttons.some(b => b.textContent?.includes('Autopilot')), 'approve button should be back');
			assert.ok(buttons.some(b => b.textContent?.includes('Provide Feedback')), 'provide feedback button should be back');
			assert.ok(buttons.some(b => b.textContent?.includes('Reject')), 'reject button should be back');
			assert.ok(!buttons.some(b => b.textContent?.includes('Submit')), 'submit button should be gone');

			// Draft feedback should be cleared
			assert.strictEqual(textarea.value, '', 'textarea should be cleared');
			assert.strictEqual(data.draftFeedback, '', 'draft feedback should be cleared');
		});

		test('submit does nothing when feedback textarea is empty', () => {
			createWidget(createMockReview({ canProvideFeedback: true }));

			// Enter feedback mode
			const feedbackButton = getFooterButtons(widget).find(b => b.textContent?.includes('Provide Feedback'));
			feedbackButton!.click();

			// Click submit without typing anything
			const submitButton = getFooterButtons(widget).find(b => b.textContent?.includes('Submit'));
			submitButton!.click();

			assert.strictEqual(lastSubmitResult, undefined, 'should not submit with empty feedback');
		});
	});

	suite('Collapsed / expanded state', () => {
		test('toggles collapsed state via chevron button', () => {
			createWidget(createMockReview());

			const collapseButton = widget.domNode.querySelector('.chat-plan-review-title-icon-button:last-child') as HTMLElement;
			assert.ok(collapseButton);
			assert.strictEqual(collapseButton.getAttribute('aria-expanded'), 'true');

			collapseButton.click();
			assert.ok(widget.domNode.classList.contains('chat-plan-review-collapsed'));
			assert.strictEqual(collapseButton.getAttribute('aria-expanded'), 'false');

			collapseButton.click();
			assert.ok(!widget.domNode.classList.contains('chat-plan-review-collapsed'));
			assert.strictEqual(collapseButton.getAttribute('aria-expanded'), 'true');
		});

		test('collapsed view shows inline actions and hides footer', () => {
			createWidget(createMockReview());

			const collapseButton = widget.domNode.querySelector('.chat-plan-review-title-icon-button:last-child') as HTMLElement;
			collapseButton.click();

			const inlineButtons = getInlineButtons(widget);
			assert.ok(inlineButtons.length > 0, 'should have inline action buttons when collapsed');

			const footerButtons = getFooterButtons(widget);
			assert.strictEqual(footerButtons.length, 0, 'footer buttons should be empty when collapsed');
		});

		test('collapsed view does not show reject button', () => {
			createWidget(createMockReview());

			const collapseButton = widget.domNode.querySelector('.chat-plan-review-title-icon-button:last-child') as HTMLElement;
			collapseButton.click();

			const inlineButtons = getInlineButtons(widget);
			assert.ok(!inlineButtons.some(b => b.textContent?.includes('Reject')), 'reject should be omitted in collapsed view');
		});

		test('toggles expanded state via expand/restore button', () => {
			createWidget(createMockReview());

			// The expand button is the first icon-only button in title actions
			const expandButton = widget.domNode.querySelector('.chat-plan-review-title-icon-button:first-child') as HTMLElement;
			assert.ok(expandButton);

			expandButton.click();
			assert.ok(widget.domNode.classList.contains('chat-plan-review-expanded'));

			expandButton.click();
			assert.ok(!widget.domNode.classList.contains('chat-plan-review-expanded'));
		});

		test('collapsing resets feedback mode', () => {
			createWidget(createMockReview({ canProvideFeedback: true }));

			// Enter feedback mode
			const feedbackButton = getFooterButtons(widget).find(b => b.textContent?.includes('Provide Feedback'));
			feedbackButton!.click();

			// Now collapse
			const collapseButton = widget.domNode.querySelector('.chat-plan-review-title-icon-button:last-child') as HTMLElement;
			collapseButton.click();

			// Expand again
			collapseButton.click();

			// Should be back to normal mode with approve + feedback + reject
			const buttons = getFooterButtons(widget);
			assert.ok(buttons.some(b => b.textContent?.includes('Autopilot')), 'approve button should be back');
			assert.ok(!buttons.some(b => b.textContent?.includes('Submit')), 'submit button should be gone');
		});

		test('restores draft collapsed state from ChatPlanReviewData', () => {
			const data = new ChatPlanReviewData('Title', 'Content', [{ label: 'Go', default: true }], false);
			data.draftCollapsed = true;
			createWidget(data);

			assert.ok(widget.domNode.classList.contains('chat-plan-review-collapsed'));
		});
	});

	suite('Multiple actions', () => {
		test('renders dropdown when multiple actions exist', () => {
			const actions: IChatPlanApprovalAction[] = [
				{ label: 'Autopilot', default: true },
				{ label: 'Interactive' },
			];
			createWidget(createMockReview({ actions }));

			const dropdown = widget.domNode.querySelector('.monaco-button-dropdown');
			assert.ok(dropdown, 'should render a button-with-dropdown for multiple actions');
		});

		test('renders plain button when single action exists', () => {
			createWidget(createMockReview({ actions: [{ label: 'Go', default: true }] }));

			const dropdown = widget.domNode.querySelector('.monaco-button-dropdown');
			assert.strictEqual(dropdown, null, 'should not render dropdown for a single action');
		});
	});

	suite('Autopilot confirmation dialog', () => {
		test('shows confirmation dialog for autopilot permission level and proceeds on confirm', async () => {
			// Default TestDialogService runs the first button (Enable → true)
			createWidget(createMockReview({
				actions: [{ label: 'Autopilot', default: true, permissionLevel: 'autopilot' }]
			}));

			const approveButton = getFooterButtons(widget).find(b => b.textContent?.includes('Autopilot'));
			approveButton!.click();

			// Wait for the async dialog to resolve
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(lastSubmitResult, { action: 'Autopilot', rejected: false });
		});

		test('cancels autopilot when dialog is dismissed', async () => {
			const dialogService = new TestDialogService(undefined, { result: false });
			createWidget(createMockReview({
				actions: [{ label: 'Autopilot', default: true, permissionLevel: 'autopilot' }]
			}), dialogService);

			const approveButton = getFooterButtons(widget).find(b => b.textContent?.includes('Autopilot'));
			approveButton!.click();

			await new Promise(resolve => setTimeout(resolve, 0));

			assert.strictEqual(lastSubmitResult, undefined, 'should not submit when dialog is cancelled');
			assert.ok(!widget.domNode.classList.contains('chat-plan-review-used'), 'should not mark as used');
		});

		test('no confirmation dialog for actions without permissionLevel', () => {
			createWidget(createMockReview({
				actions: [{ label: 'Interactive', default: true }]
			}));

			const approveButton = getFooterButtons(widget).find(b => b.textContent?.includes('Interactive'));
			approveButton!.click();

			assert.deepStrictEqual(lastSubmitResult, { action: 'Interactive', rejected: false });
		});
	});

	suite('Used / submitted state', () => {
		test('marks widget as used when review.isUsed is true', () => {
			createWidget(createMockReview({ isUsed: true }));

			assert.ok(widget.domNode.classList.contains('chat-plan-review-used'));
		});

		test('disables feedback textarea after submission', () => {
			createWidget(createMockReview({ canProvideFeedback: true }));

			// Enter feedback mode and submit
			const feedbackButton = getFooterButtons(widget).find(b => b.textContent?.includes('Provide Feedback'));
			feedbackButton!.click();

			const textarea = widget.domNode.querySelector('.chat-plan-review-feedback-textarea') as HTMLTextAreaElement;
			textarea.value = 'some feedback';
			textarea.dispatchEvent(new Event('input'));

			const submitButton = getFooterButtons(widget).find(b => b.textContent?.includes('Submit'));
			submitButton!.click();

			assert.strictEqual(textarea.disabled, true, 'textarea should be disabled after submission');
		});
	});

	suite('hasSameContent', () => {
		test('returns false for different kind', () => {
			createWidget(createMockReview());
			const other: IChatRendererContent = { kind: 'disabledClaudeHooks' };
			assert.strictEqual(widget.hasSameContent(other, [], {} as never), false);
		});

		test('returns true for same resolveId', () => {
			createWidget(createMockReview({ resolveId: 'abc-123' }));
			const other = createMockReview({ resolveId: 'abc-123' });
			assert.strictEqual(widget.hasSameContent(other, [], {} as never), true);
		});

		test('returns false for different resolveId', () => {
			createWidget(createMockReview({ resolveId: 'abc-123' }));
			const other = createMockReview({ resolveId: 'def-456' });
			assert.strictEqual(widget.hasSameContent(other, [], {} as never), false);
		});

		test('returns false when isUsed mismatch', () => {
			createWidget(createMockReview({ isUsed: false }));
			const other = createMockReview({ isUsed: true });
			assert.strictEqual(widget.hasSameContent(other, [], {} as never), false);
		});
	});
});
