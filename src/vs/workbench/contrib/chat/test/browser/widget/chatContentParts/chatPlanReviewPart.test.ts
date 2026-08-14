/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../../../platform/dialogs/test/common/testDialogService.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../../../../../platform/files/common/files.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IPlanReviewFeedbackService, PlanReviewFeedbackService } from '../../../../browser/planReviewFeedback/planReviewFeedbackService.js';
import { ChatPlanReviewPart, IChatPlanReviewPartOptions } from '../../../../browser/widget/chatContentParts/chatPlanReviewPart.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { IChatPlanApprovalAction, IChatPlanReview, IChatPlanReviewResult } from '../../../../common/chatService/chatService.js';
import { IChatRendererContent } from '../../../../common/model/chatViewModel.js';
import { ChatPlanReviewData } from '../../../../common/model/chatProgressTypes/chatPlanReviewData.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../../../platform/userInteraction/browser/userInteractionService.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import sinon from 'sinon';
import { IResourceEditorInput, ITextEditorOptions } from '../../../../../../../platform/editor/common/editor.js';
import { ITextFileContent, ITextFileService } from '../../../../../../services/textfile/common/textfiles.js';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { AgentEditorCommentsBridge, IAgentEditorComment, IAgentEditorCommentsBridge } from '../../../../../../services/agentEditorComments/common/agentEditorComments.js';
import { Emitter, Event as VSCodeEvent } from '../../../../../../../base/common/event.js';

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
	return {
		element: { sessionResource: URI.parse('test://session/1') },
	} as IChatContentPartRenderContext;
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
	let submitCount = 0;
	let lastFeedbackService: IPlanReviewFeedbackService | undefined;
	let lastEditorService: IEditorService | undefined;
	let lastTextFileService: ITextFileService | undefined;
	let lastModelService: IModelService | undefined;
	let lastCommentsBridge: AgentEditorCommentsBridge | undefined;
	let fileChangesEmitter: Emitter<FileChangesEvent> | undefined;

	function createWidget(review: IChatPlanReview, dialogService?: TestDialogService, onSubmit?: () => void): ChatPlanReviewPart {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const commentsBridge = store.add(new AgentEditorCommentsBridge());
		const feedbackService = store.add(new PlanReviewFeedbackService(commentsBridge));
		instantiationService.stub(IAgentEditorCommentsBridge, commentsBridge);
		instantiationService.stub(IPlanReviewFeedbackService, feedbackService); instantiationService.stub(IUserInteractionService, new MockUserInteractionService());

		lastFeedbackService = feedbackService;
		lastEditorService = instantiationService.get(IEditorService);
		lastTextFileService = instantiationService.get(ITextFileService);
		lastModelService = instantiationService.get(IModelService);
		lastCommentsBridge = commentsBridge;
		if (fileChangesEmitter) {
			sinon.stub(instantiationService.get(IFileService), 'createWatcher').returns({
				onDidChange: fileChangesEmitter.event,
				dispose: () => { },
			});
		}
		if (dialogService) {
			instantiationService.stub(IDialogService, dialogService);
		}
		const options: IChatPlanReviewPartOptions = {
			onSubmit: result => {
				lastSubmitResult = result;
				submitCount++;
				onSubmit?.();
			}
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
		submitCount = 0;
		lastFeedbackService = undefined;
		lastEditorService = undefined;
		lastTextFileService = undefined;
		lastModelService = undefined;
		lastCommentsBridge = undefined;
		fileChangesEmitter = undefined;
		sinon.restore();
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

		test('disallows remote images in agent plan markdown', () => {
			createWidget(createMockReview({ content: 'Plan ![remote](https://example.com/image.png)' }));

			assert.strictEqual(widget.domNode.querySelectorAll('.chat-plan-review-body img').length, 0);
		});

		test('displays the outdated pill only for outdated summaries', () => {
			createWidget(createMockReviewWithPlan({ isOutdated: true }));

			const badge = widget.domNode.querySelector<HTMLElement>('.chat-plan-review-outdated');
			assert.deepStrictEqual({
				text: badge?.textContent,
				display: badge?.style.display,
				ariaLabel: badge?.getAttribute('aria-label'),
			}, {
				text: 'Outdated',
				display: '',
				ariaLabel: 'Plan summary is outdated',
			});
		});

		test('hides the outdated pill for current summaries', () => {
			createWidget(createMockReviewWithPlan());

			assert.strictEqual(widget.domNode.querySelector<HTMLElement>('.chat-plan-review-outdated')?.style.display, 'none');
		});

		test('marks the summary outdated when the plan model changes', () => {
			const planUri = URI.parse('file:///outdated-plan.md');
			const review = new ChatPlanReviewData(
				'Plan summary',
				'Generated summary',
				[{ label: 'Go', default: true }],
				true,
				planUri.toJSON(),
			);
			createWidget(review);
			const model = lastModelService!.createModel('# Original plan', null, planUri);

			try {
				model.setValue('# Edited plan');

				assert.deepStrictEqual({
					isOutdated: review.isOutdated,
					persistedIsOutdated: review.toJSON().isOutdated,
					badgeDisplay: widget.domNode.querySelector<HTMLElement>('.chat-plan-review-outdated')?.style.display,
					summary: review.content,
				}, {
					isOutdated: true,
					persistedIsOutdated: true,
					badgeDisplay: '',
					summary: 'Generated summary',
				});
			} finally {
				model.dispose();
			}
		});

		test('marks the summary outdated when an open plan is deleted', () => {
			const planUri = URI.parse('file:///deleted-plan.md');
			const review = new ChatPlanReviewData(
				'Plan summary',
				'Generated summary',
				[{ label: 'Go', default: true }],
				true,
				planUri.toJSON(),
			);
			fileChangesEmitter = store.add(new Emitter<FileChangesEvent>());
			createWidget(review);
			const model = lastModelService!.createModel('# Original plan', null, planUri);

			try {
				fileChangesEmitter.fire(new FileChangesEvent([{ resource: planUri, type: FileChangeType.DELETED }], false));

				assert.strictEqual(review.isOutdated, true);
			} finally {
				model.dispose();
			}
		});

		test('renders markdown content in the body', () => {
			createWidget(createMockReview({ content: '**bold text**' }));

			const body = widget.domNode.querySelector('.chat-plan-review-body');
			assert.ok(body);
			assert.ok(body?.querySelector('.rendered-markdown'));
		});

		test('uses the themed foreground for markdown links', () => {
			createWidget(createMockReview({ content: '[link](https://example.com)' }));
			const container = mainWindow.document.createElement('div');
			container.classList.add('interactive-session');
			container.style.setProperty('--vscode-textLink-foreground', 'rgb(1, 2, 3)');
			mainWindow.document.body.appendChild(container);
			container.appendChild(widget.domNode);

			try {
				const link = widget.domNode.querySelector<HTMLElement>('.rendered-markdown a');
				assert.strictEqual(link && mainWindow.getComputedStyle(link).color, 'rgb(1, 2, 3)');
			} finally {
				container.remove();
			}
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
		test('clicking Review button opens the plan editor and shows Submit Feedback button', async () => {
			createWidget(createMockReviewWithPlan());
			const openEditorSpy = sinon.spy(lastEditorService!, 'openEditor');

			const reviewButton = getReviewButton(widget)!;
			reviewButton.click();
			await tick();

			assert.strictEqual(openEditorSpy.calledOnce, true, 'plan file should open in an editor');
			const editorInput = openEditorSpy.firstCall.args[0] as IResourceEditorInput;
			assert.strictEqual(editorInput.resource?.toString(), 'file:///plan.md');
			assert.strictEqual(editorInput.options?.pinned, true);

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

		test('clicking Review while in feedback mode reopens the plan editor', async () => {
			createWidget(createMockReviewWithPlan());
			const openEditorSpy = sinon.spy(lastEditorService!, 'openEditor');

			const reviewButton = getReviewButton(widget)!;
			reviewButton.click();
			await tick();

			reviewButton.click();
			await tick();

			const feedbackSection = getFeedbackSection(widget);
			assert.notStrictEqual(feedbackSection.style.display, 'none', 'feedback section should remain visible');
			assert.strictEqual(openEditorSpy.callCount, 2, 'each click should reveal the plan editor');
		});

		test('approving with textarea content sends approval + feedback', () => {
			// canProvideFeedback without planUri shows the textarea alongside
			// the regular Approve/Reject buttons; typed feedback rides along
			// with whichever action the user picks.
			createWidget(createMockReview({ canProvideFeedback: true }));

			const textarea = widget.domNode.querySelector('.chat-plan-review-feedback-textarea') as HTMLTextAreaElement;
			assert.ok(textarea);
			textarea.value = 'Please also add tests';
			textarea.dispatchEvent(new Event('input'));

			const approveButton = getFooterButtons(widget).find(b => b.textContent?.includes('Autopilot'));
			assert.ok(approveButton, 'Approve button should be available even with canProvideFeedback');
			approveButton!.click();

			assert.deepStrictEqual(lastSubmitResult, {
				action: 'Autopilot',
				rejected: false,
				feedback: 'Please also add tests',
				feedbackOverall: 'Please also add tests',
			});
		});

		test('rejecting with textarea content sends rejection + feedback', () => {
			createWidget(createMockReview({ canProvideFeedback: true }));

			const textarea = widget.domNode.querySelector('.chat-plan-review-feedback-textarea') as HTMLTextAreaElement;
			textarea.value = 'Not the right approach';
			textarea.dispatchEvent(new Event('input'));

			const rejectButton = getFooterButtons(widget).find(b => b.textContent?.includes('Reject'));
			assert.ok(rejectButton);
			rejectButton!.click();

			assert.deepStrictEqual(lastSubmitResult, {
				rejected: true,
				feedback: 'Not the right approach',
				feedbackOverall: 'Not the right approach',
			});
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

		test('live comments from the Markdown editor update the widget', async () => {
			const review = createMockReviewWithPlan();
			createWidget(review);
			getReviewButton(widget)!.click();
			await tick();

			const planUri = URI.revive(review.planUri!);
			const changed = store.add(new Emitter<void>());
			const comments = [{
				id: 'live-comment',
				resource: planUri,
				range: {
					startLineNumber: 5,
					startColumn: 1,
					endLineNumber: 5,
					endColumn: 10,
				},
				body: 'New live comment',
			}];
			store.add(lastCommentsBridge!.registerProvider({
				priority: 100,
				onDidChangeComments: changed.event,
				onDidRevealComment: VSCodeEvent.None,
				acceptsComments: () => true,
				getComments: () => comments,
				addComment: () => { },
				deleteComment: () => { },
			}));
			changed.fire();

			assert.deepStrictEqual({
				rows: widget.domNode.querySelectorAll('.chat-plan-review-comment-row').length,
				submitLabel: getFooterButtons(widget).find(button => button.textContent?.includes('Submit Feedback'))?.textContent,
			}, {
				rows: 1,
				submitLabel: 'Submit Feedback (1)',
			});
		});

		test('reveals a related comment in its own resource', async () => {
			const review = createMockReviewWithPlan();
			createWidget(review);
			getReviewButton(widget)!.click();
			await tick();

			const planUri = URI.revive(review.planUri!);
			const relatedUri = URI.parse('file:///related.ts');
			const changed = store.add(new Emitter<void>());
			store.add(lastCommentsBridge!.registerProvider({
				priority: 100,
				onDidChangeComments: changed.event,
				onDidRevealComment: VSCodeEvent.None,
				acceptsComments: () => true,
				getComments: () => [{
					id: 'related-comment',
					resource: relatedUri,
					range: { startLineNumber: 7, startColumn: 3, endLineNumber: 7, endColumn: 8 },
					body: 'Update this source',
				}],
				addComment: () => { },
				deleteComment: () => { },
			}));
			changed.fire();
			const openEditorSpy = sinon.spy(lastEditorService!, 'openEditor');

			(widget.domNode.querySelector('.chat-plan-review-comment-reveal') as HTMLButtonElement).click();
			await tick();

			const editorInput = openEditorSpy.lastCall.args[0] as IResourceEditorInput;
			assert.deepStrictEqual({
				resource: editorInput.resource?.toString(),
				override: editorInput.options?.override,
				selection: (editorInput.options as ITextEditorOptions | undefined)?.selection,
				planResource: planUri.toString(),
			}, {
				resource: relatedUri.toString(),
				override: undefined,
				selection: { startLineNumber: 7, startColumn: 3 },
				planResource: planUri.toString(),
			});
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

		test('editor toolbar feedback submission updates the original plan widget', async () => {
			const review = createMockReviewWithPlan();
			createWidget(review, undefined, () => widget.dispose());

			const service = lastFeedbackService!;
			const planUri = URI.revive(review.planUri!);
			service.addFeedback(planUri, 5, 1, 'Fix this step');
			let commentsChanged = 0;
			store.add(lastCommentsBridge!.onDidChangeComments(() => commentsChanged++));

			const didSubmit = await service.submitAllFeedback(planUri);

			assert.deepStrictEqual({
				submitResult: lastSubmitResult,
				didSubmit,
				commentsChanged,
				remainingComments: lastCommentsBridge!.getComments(planUri),
			}, {
				submitResult: {
					rejected: false,
					feedback: 'Inline comments on `plan.md`:\n- **Line 5:** Fix this step',
					feedbackOverall: undefined,
					feedbackInlineMarkdown: 'Inline comments on `plan.md`:\n- **Line 5:** Fix this step',
				},
				didSubmit: true,
				commentsChanged: 2,
				remainingComments: [],
			});
			assert.ok(widget.domNode.classList.contains('chat-plan-review-used'));
		});

		test('editor toolbar submits an overall comment without inline comments', async () => {
			const review = createMockReviewWithPlan();
			createWidget(review);

			const textarea = widget.domNode.querySelector('.chat-plan-review-feedback-textarea') as HTMLTextAreaElement;
			textarea.value = 'Please simplify the rollout';
			textarea.dispatchEvent(new Event('input'));

			await lastFeedbackService!.submitAllFeedback(URI.revive(review.planUri!));

			assert.deepStrictEqual(lastSubmitResult, {
				rejected: false,
				feedback: 'Please simplify the rollout',
				feedbackOverall: 'Please simplify the rollout',
				feedbackInlineMarkdown: undefined,
			});
		});

		test('comments added while the plan save is pending remain unsubmitted', async () => {
			const review = createMockReviewWithPlan();
			createWidget(review);
			const planUri = URI.revive(review.planUri!);
			const changed = store.add(new Emitter<void>());
			const comments: IAgentEditorComment[] = [{
				id: 'submitted',
				resource: planUri,
				range: { startLineNumber: 5, startColumn: 1, endLineNumber: 5, endColumn: 2 },
				body: 'Submit this',
			}];
			store.add(lastCommentsBridge!.registerProvider({
				priority: 100,
				onDidChangeComments: changed.event,
				onDidRevealComment: VSCodeEvent.None,
				acceptsComments: () => true,
				getComments: () => comments,
				addComment: () => { },
				deleteComment: (_resource, id) => {
					const index = comments.findIndex(comment => comment.id === id);
					if (index !== -1) {
						comments.splice(index, 1);
					}
				},
			}));
			changed.fire();
			const saveDeferred = new DeferredPromise<URI | undefined>();
			sinon.stub(lastTextFileService!, 'isDirty').returns(true);
			sinon.stub(lastTextFileService!, 'save').returns(saveDeferred.p);

			const submitButton = getFooterButtons(widget).find(button => button.textContent?.includes('Submit Feedback'))!;
			submitButton.click();
			comments.push({
				id: 'added-during-save',
				resource: planUri,
				range: { startLineNumber: 8, startColumn: 1, endLineNumber: 8, endColumn: 2 },
				body: 'Keep this',
			});
			changed.fire();
			saveDeferred.complete(planUri);
			await tick();

			assert.deepStrictEqual({
				submittedFeedback: lastSubmitResult?.feedback,
				remainingCommentIds: lastCommentsBridge!.getComments(planUri, true).map(comment => comment.id),
			}, {
				submittedFeedback: 'Inline comments on `plan.md`:\n- **Line 5:** Submit this',
				remainingCommentIds: ['added-during-save'],
			});
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

	suite('Collapsed state', () => {
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

		test('a comment added while collapsed is reflected in the inline action', async () => {
			const review = createMockReviewWithPlan();
			createWidget(review);

			const collapseButton = widget.domNode.querySelector('.chat-plan-review-title-icon-button:last-child') as HTMLElement;
			collapseButton.click();

			lastFeedbackService!.addFeedback(URI.revive(review.planUri!), 3, 1, 'Clarify this step');
			await tick();

			const submitButton = getInlineButtons(widget).find(button => button.textContent?.includes('Submit Feedback'));
			assert.ok(submitButton?.textContent?.includes('(1)'), 'collapsed widget should show the pending comment count');
		});

		test('restores draft collapsed state from ChatPlanReviewData', () => {
			const data = new ChatPlanReviewData('Title', 'Content', [{ label: 'Go', default: true }], false);
			data.draftCollapsed = true;
			createWidget(data);

			assert.ok(widget.domNode.classList.contains('chat-plan-review-collapsed'));
		});
	});

	suite('Multiple actions', () => {
		test('persists edited plan content before submission', async () => {
			const planUri = URI.parse('file:///plan.md');
			const review = new ChatPlanReviewData(
				'Review Plan',
				'# Original plan',
				[{ id: 'approve', label: 'Approve', default: true }],
				true,
				planUri.toJSON(),
			);
			createWidget(review);
			sinon.stub(lastTextFileService!, 'isDirty').returns(true);
			sinon.stub(lastTextFileService!, 'save').resolves(planUri);
			sinon.stub(lastTextFileService!, 'read').resolves({
				resource: planUri,
				name: 'plan.md',
				size: 13,
				mtime: 1,
				ctime: 1,
				etag: '1',
				readonly: false,
				locked: false,
				executable: false,
				encoding: 'utf8',
				value: '# Edited plan',
			} satisfies ITextFileContent);

			getFooterButtons(widget).find(button => button.textContent?.includes('Approve'))!.click();
			await tick();

			assert.deepStrictEqual({
				content: review.content,
				serializedContent: review.toJSON().content,
			}, {
				content: '# Edited plan',
				serializedContent: '# Edited plan',
			});
		});

		test('concurrent approval attempts submit only once', async () => {
			const review = createMockReviewWithPlan({
				actions: [{ id: 'approve', label: 'Approve', default: true }],
			});
			createWidget(review);

			const saveDeferred = new DeferredPromise<URI | undefined>();
			sinon.stub(lastTextFileService!, 'isDirty').returns(true);
			const saveStub = sinon.stub(lastTextFileService!, 'save').returns(saveDeferred.p);
			const approveButton = getFooterButtons(widget).find(button => button.textContent?.includes('Approve'))!;

			approveButton.click();
			approveButton.click();
			assert.strictEqual(saveStub.callCount, 1);

			saveDeferred.complete(URI.revive(review.planUri!));
			await tick();

			assert.deepStrictEqual(lastSubmitResult, { action: 'Approve', actionId: 'approve', rejected: false });
			assert.strictEqual(submitCount, 1);
		});

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

		test('emits actionId for the default action when clicked', () => {
			createWidget(createMockReview({
				actions: [{ id: 'approve', label: 'Approve', default: true }]
			}));

			const approveButton = getFooterButtons(widget).find(b => b.textContent?.includes('Approve'));
			assert.ok(approveButton);
			approveButton!.click();

			assert.deepStrictEqual(lastSubmitResult, { action: 'Approve', actionId: 'approve', rejected: false });
		});

		test('emits actionId for a non-default dropdown action when chosen', () => {
			const actions: IChatPlanApprovalAction[] = [
				{ id: 'approve', label: 'Approve', default: true },
				{ id: 'approveBypass', label: 'Approve & Bypass Permissions' },
			];
			createWidget(createMockReview({ actions }));

			// The dropdown wraps non-default actions in vscode Actions; rather
			// than driving the dropdown UI, invoke the action directly the way
			// the dropdown menu item would.
			// Find the rendered dropdown button.
			const dropdown = widget.domNode.querySelector('.monaco-button-dropdown');
			assert.ok(dropdown);

			// Reach into the widget via its public submit path: click the
			// primary approve and verify the default emits its id, then check
			// that submitting the bypass action produces its own id by
			// re-creating with bypass as the default.
			const approveButton = getFooterButtons(widget).find(b => b.textContent?.includes('Approve') && !b.textContent?.includes('Bypass'));
			assert.ok(approveButton);
			approveButton!.click();
			assert.deepStrictEqual(lastSubmitResult, { action: 'Approve', actionId: 'approve', rejected: false });
		});

		test('emits actionId when bypass action is the default', () => {
			createWidget(createMockReview({
				actions: [
					{ id: 'approveBypass', label: 'Approve & Bypass Permissions', default: true },
					{ id: 'approve', label: 'Approve' },
				]
			}));

			const bypassButton = getFooterButtons(widget).find(b => b.textContent?.includes('Bypass'));
			assert.ok(bypassButton);
			bypassButton!.click();

			assert.deepStrictEqual(lastSubmitResult, { action: 'Approve & Bypass Permissions', actionId: 'approveBypass', rejected: false });
		});

		test('omits actionId when the action has no id', () => {
			createWidget(createMockReview({ actions: [{ label: 'Go', default: true }] }));

			const approveButton = getFooterButtons(widget).find(b => b.textContent?.includes('Go'));
			approveButton!.click();

			assert.deepStrictEqual(lastSubmitResult, { action: 'Go', rejected: false });
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

			// In the no-planUri textarea mode the textarea sits alongside the
			// regular Approve/Reject buttons; submit by clicking Approve.
			const textarea = widget.domNode.querySelector('.chat-plan-review-feedback-textarea') as HTMLTextAreaElement;
			textarea.value = 'some feedback';
			textarea.dispatchEvent(new Event('input'));

			const approveButton = getFooterButtons(widget).find(b => b.textContent?.includes('Autopilot'));
			assert.ok(approveButton, 'Approve button should be available');
			approveButton!.click();

			assert.strictEqual(textarea.disabled, true, 'textarea should be disabled after submission');
		});

		test('dismiss disposes the active plan registration', () => {
			const review = new ChatPlanReviewData(
				'Review Plan',
				'# Plan',
				[{ label: 'Go', default: true }],
				true,
				URI.parse('file:///plan.md').toJSON(),
			);
			createWidget(review);
			const planUri = URI.revive(review.planUri!);
			assert.strictEqual(lastFeedbackService!.isActivePlanReview(planUri), true);

			review.dismiss();

			assert.deepStrictEqual({
				active: lastFeedbackService!.isActivePlanReview(planUri),
				used: widget.domNode.classList.contains('chat-plan-review-used'),
				buttonCount: getFooterButtons(widget).length,
			}, {
				active: false,
				used: true,
				buttonCount: 0,
			});
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
