/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../../../platform/dialogs/test/common/testDialogService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IPlanReviewFeedbackService, PlanReviewFeedbackService } from '../../../../browser/planReviewFeedback/planReviewFeedbackService.js';
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

function createMockReviewWithPlan(overrides?: Partial<IChatPlanReview>): IChatPlanReview {
	return createMockReview({
		canProvideFeedback: true,
		planUri: URI.parse('file:///plan.md').toJSON(),
		...overrides,
	});
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

function getReviewButton(widget: ChatPlanReviewPart): HTMLElement | null {
	return widget.domNode.querySelector('.chat-plan-review-review-button') as HTMLElement | null;
}

function getFeedbackSection(widget: ChatPlanReviewPart): HTMLElement {
	return widget.domNode.querySelector('.chat-plan-review-feedback') as HTMLElement;
}

function tick(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}

suite('ChatPlanReviewPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let widget: ChatPlanReviewPart;
	let lastSubmitResult: IChatPlanReviewResult | undefined;
	let lastFeedbackService: IPlanReviewFeedbackService | undefined;

	function createWidget(review: IChatPlanReview, dialogService?: TestDialogService): ChatPlanReviewPart {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const feedbackService = store.add(new PlanReviewFeedbackService());
		instantiationService.stub(IPlanReviewFeedbackService, feedbackService);
		lastFeedbackService = feedbackService;
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
		lastFeedbackService = undefined;
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

		test('hides feedback section initially when canProvideFeedback and planUri are both set', () => {
			createWidget(createMockReviewWithPlan());

			const feedbackSection = getFeedbackSection(widget);
			assert.ok(feedbackSection);
			assert.strictEqual(feedbackSection.style.display, 'none');
		});

		test('shows feedback section by default when canProvideFeedback is true and there is no planUri', () => {
			createWidget(createMockReview({ canProvideFeedback: true }));

			const feedbackSection = getFeedbackSection(widget);
			assert.ok(feedbackSection);
			assert.notStrictEqual(feedbackSection.style.display, 'none');
		});

		test('renders Review button when planUri is provided', () => {
			createWidget(createMockReviewWithPlan());

			const reviewButton = getReviewButton(widget);
			assert.ok(reviewButton, 'Review button should exist');
		});

		test('does not render Review button when planUri is absent', () => {
			createWidget(createMockReview({ canProvideFeedback: true }));

			assert.strictEqual(getReviewButton(widget), null, 'Review button should not exist without planUri');
		});

		test('does not render Provide Feedback footer button (legacy entry removed)', () => {
			createWidget(createMockReviewWithPlan());

			const buttons = getFooterButtons(widget);
			assert.ok(!buttons.some(b => b.textContent?.includes('Provide Feedback')), 'should not have legacy Provide Feedback button');
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
		test('clicking Review button opens feedback section and shows Submit Feedback button', async () => {
			createWidget(createMockReviewWithPlan());

			const reviewButton = getReviewButton(widget)!;
			reviewButton.click();
			await tick();

			// Feedback section should now be visible.
			const feedbackSection = getFeedbackSection(widget);
			assert.notStrictEqual(feedbackSection.style.display, 'none', 'feedback section should be visible');

			// Footer should have Submit Feedback + Reject (no approve, no Provide Feedback).
			const buttons = getFooterButtons(widget);
			assert.ok(buttons.some(b => b.textContent?.includes('Submit Feedback')), 'should have Submit Feedback button');
			assert.ok(buttons.some(b => b.textContent?.includes('Reject')), 'should still have Reject button');
			assert.ok(!buttons.some(b => b.textContent?.includes('Autopilot')), 'approve button should be hidden');
		});

		test('reject button remains visible in feedback mode', async () => {
			createWidget(createMockReviewWithPlan());

			getReviewButton(widget)!.click();
			await tick();

			const buttons = getFooterButtons(widget);
			assert.ok(buttons.some(b => b.textContent?.includes('Reject')), 'reject button should still be visible');
		});

		test('submitting feedback sends feedback value with rejected=false', () => {
			// canProvideFeedback without planUri auto-shows the feedback section.
			createWidget(createMockReview({ canProvideFeedback: true }));

			// Type feedback
			const textarea = widget.domNode.querySelector('.chat-plan-review-feedback-textarea') as HTMLTextAreaElement;
			assert.ok(textarea);
			textarea.value = 'Please also add tests';
			textarea.dispatchEvent(new Event('input'));

			// Click submit
			const submitButton = getFooterButtons(widget).find(b => b.textContent?.includes('Submit Feedback'));
			assert.ok(submitButton, 'Submit Feedback button should exist');
			submitButton!.click();

			assert.deepStrictEqual(lastSubmitResult, {
				rejected: false,
				feedback: 'Please also add tests',
				feedbackOverall: 'Please also add tests',
				feedbackInlineMarkdown: undefined,
			});
		});

		test('clicking Back exits feedback mode but preserves textarea draft', async () => {
			const data = new ChatPlanReviewData('Title', 'Content', [{ label: 'Autopilot', default: true }], true, URI.parse('file:///plan.md').toJSON());
			createWidget(data);

			// Enter feedback mode via the Review button.
			getReviewButton(widget)!.click();
			await tick();

			// Type some draft feedback
			const textarea = widget.domNode.querySelector('.chat-plan-review-feedback-textarea') as HTMLTextAreaElement;
			textarea.value = 'draft feedback';
			textarea.dispatchEvent(new Event('input'));

			// Click Back inside the feedback header
			const backButton = widget.domNode.querySelector('.chat-plan-review-feedback-close') as HTMLElement;
			assert.ok(backButton, 'feedback Back button should exist');
			backButton.click();
			await tick();

			// Feedback section should be hidden
			const feedbackSection = getFeedbackSection(widget);
			assert.strictEqual(feedbackSection.style.display, 'none', 'feedback section should be hidden');

			// Footer buttons should be back to the normal set (Approve + Reject only).
			const buttons = getFooterButtons(widget);
			assert.ok(buttons.some(b => b.textContent?.includes('Autopilot')), 'approve button should be back');
			assert.ok(buttons.some(b => b.textContent?.includes('Reject')), 'reject button should be back');
			assert.ok(!buttons.some(b => b.textContent?.includes('Submit Feedback')), 'submit button should be gone');
			assert.ok(!buttons.some(b => b.textContent?.includes('Provide Feedback')), 'provide feedback button should not return');

			// Back is non-destructive: draft persists.
			assert.strictEqual(textarea.value, 'draft feedback', 'textarea draft should be preserved');
			assert.strictEqual(data.draftFeedback, 'draft feedback', 'draft feedback should be preserved');
		});

		test('submit is disabled when feedback textarea is empty and no inline comments', async () => {
			createWidget(createMockReviewWithPlan());

			getReviewButton(widget)!.click();
			await tick();

			const submitButton = getFooterButtons(widget).find(b => b.textContent?.includes('Submit Feedback'));
			assert.ok(submitButton);
			assert.ok(submitButton!.classList.contains('disabled'), 'Submit Feedback should be disabled when nothing to submit');
		});
	});

	suite('Inline comments list', () => {
		test('renders comments list and updates Submit Feedback count when service has items', async () => {
			const review = createMockReviewWithPlan();
			createWidget(review);

			// Enter feedback mode so the feedback section is visible.
			getReviewButton(widget)!.click();
			await tick();

			const service = lastFeedbackService!;
			const planUri = URI.revive(review.planUri!);
			service.addFeedback(planUri, 5, 1, 'Fix this step');
			service.addFeedback(planUri, 12, 1, 'Reword this');

			const rows = widget.domNode.querySelectorAll('.chat-plan-review-comment-row');
			assert.strictEqual(rows.length, 2, 'should render one row per inline comment');

			const submitButton = getFooterButtons(widget).find(b => b.textContent?.includes('Submit Feedback'));
			assert.ok(submitButton);
			assert.ok((submitButton!.textContent ?? '').includes('(2)'), 'Submit label should reflect inline count');
		});

		test('inline comments alone are enough to enable Submit Feedback', async () => {
			const review = createMockReviewWithPlan();
			createWidget(review);

			getReviewButton(widget)!.click();
			await tick();

			const service = lastFeedbackService!;
			const planUri = URI.revive(review.planUri!);
			service.addFeedback(planUri, 1, 1, 'Hi');

			const submitButton = getFooterButtons(widget).find(b => b.textContent?.includes('Submit Feedback'));
			assert.ok(submitButton);
			assert.ok(!submitButton!.classList.contains('disabled'), 'Submit Feedback should be enabled with one inline comment');
		});

		test('inline comments auto-promote into review mode even before Review button is clicked', () => {
			const review = createMockReviewWithPlan();
			createWidget(review);

			// Section starts hidden when planUri is present.
			assert.strictEqual(getFeedbackSection(widget).style.display, 'none');

			const service = lastFeedbackService!;
			const planUri = URI.revive(review.planUri!);
			service.addFeedback(planUri, 1, 1, 'Surprise comment');

			assert.notStrictEqual(getFeedbackSection(widget).style.display, 'none', 'section should auto-open when comments arrive');
		});

		test('per-row remove button removes only that comment from the service', async () => {
			const review = createMockReviewWithPlan();
			createWidget(review);

			getReviewButton(widget)!.click();
			await tick();

			const service = lastFeedbackService!;
			const planUri = URI.revive(review.planUri!);
			service.addFeedback(planUri, 5, 1, 'Fix this');
			service.addFeedback(planUri, 12, 1, 'Reword');
			service.addFeedback(planUri, 20, 1, 'Add detail');

			const removeButtons = widget.domNode.querySelectorAll('.chat-plan-review-comment-remove') as NodeListOf<HTMLElement>;
			assert.strictEqual(removeButtons.length, 3, 'should render one remove button per row');

			// Remove the middle one.
			removeButtons[1].click();

			const remaining = service.getFeedback(planUri);
			assert.deepStrictEqual(remaining.map(i => i.text), ['Fix this', 'Add detail'], 'middle comment should be removed');
		});

		test('Clear All button is hidden when there are no inline comments', async () => {
			const review = createMockReviewWithPlan();
			createWidget(review);

			getReviewButton(widget)!.click();
			await tick();

			const clearAll = widget.domNode.querySelector('.chat-plan-review-feedback-clear-all') as HTMLElement;
			assert.ok(clearAll, 'Clear All button should be in the DOM');
			assert.strictEqual(clearAll.style.display, 'none', 'Clear All should be hidden when list is empty');
		});

		test('Clear All button removes all inline comments after confirmation', async () => {
			const review = createMockReviewWithPlan();
			const dialogService = new TestDialogService({ confirmed: true });
			createWidget(review, dialogService);

			getReviewButton(widget)!.click();
			await tick();

			const service = lastFeedbackService!;
			const planUri = URI.revive(review.planUri!);
			service.addFeedback(planUri, 1, 1, 'a');
			service.addFeedback(planUri, 2, 1, 'b');

			const clearAll = widget.domNode.querySelector('.chat-plan-review-feedback-clear-all') as HTMLElement;
			assert.ok(clearAll, 'Clear All button should be present');
			assert.notStrictEqual(clearAll.style.display, 'none', 'Clear All should be visible when list has items');
			clearAll.click();
			await tick();

			assert.strictEqual(service.getFeedback(planUri).length, 0, 'all comments should be cleared');
		});

		test('Clear All cancellation keeps inline comments intact', async () => {
			const review = createMockReviewWithPlan();
			const dialogService = new TestDialogService({ confirmed: false });
			createWidget(review, dialogService);

			getReviewButton(widget)!.click();
			await tick();

			const service = lastFeedbackService!;
			const planUri = URI.revive(review.planUri!);
			service.addFeedback(planUri, 1, 1, 'a');
			service.addFeedback(planUri, 2, 1, 'b');

			const clearAll = widget.domNode.querySelector('.chat-plan-review-feedback-clear-all') as HTMLElement;
			clearAll.click();
			await tick();

			assert.strictEqual(service.getFeedback(planUri).length, 2, 'comments should be untouched when user cancels');
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

		test('collapsing preserves feedback mode and inline buttons keep Submit Feedback', async () => {
			createWidget(createMockReviewWithPlan());

			// Enter feedback mode via the Review button.
			getReviewButton(widget)!.click();
			await tick();

			// Now collapse.
			const collapseButton = widget.domNode.querySelector('.chat-plan-review-title-icon-button:last-child') as HTMLElement;
			collapseButton.click();

			// Inline action should be Submit Feedback (preserves the mode).
			const inlineButtons = getInlineButtons(widget);
			assert.ok(inlineButtons.some(b => b.textContent?.includes('Submit Feedback')), 'inline action should be Submit Feedback when feedback mode is active');

			// Expand again — still in feedback mode.
			collapseButton.click();
			const footerButtons = getFooterButtons(widget);
			assert.ok(footerButtons.some(b => b.textContent?.includes('Submit Feedback')), 'submit feedback button should remain after expand');
			assert.ok(!footerButtons.some(b => b.textContent?.includes('Autopilot')), 'approve should still be hidden in feedback mode');
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

			// Without planUri the feedback section is auto-shown; just type and submit.
			const textarea = widget.domNode.querySelector('.chat-plan-review-feedback-textarea') as HTMLTextAreaElement;
			textarea.value = 'some feedback';
			textarea.dispatchEvent(new Event('input'));

			const submitButton = getFooterButtons(widget).find(b => b.textContent?.includes('Submit Feedback'));
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
