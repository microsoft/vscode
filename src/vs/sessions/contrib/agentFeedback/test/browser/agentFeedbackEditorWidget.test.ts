/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isHTMLElement } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { withTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { IFeedbackPullRequest } from '../../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ICodeReviewService, ICodeReviewSuggestion } from '../../../codeReview/browser/codeReviewService.js';
import { AgentFeedbackEditorWidget, IComposerDraftState } from '../../browser/agentFeedbackEditorWidget.js';
import { IAgentFeedbackContext } from '../../browser/agentFeedbackEditorUtils.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { ISessionEditorComment, SessionEditorCommentSource } from '../../browser/sessionEditorComments.js';

suite('AgentFeedbackEditorWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.parse('vscode-agent-session://test/session-1');
	const fileResource = URI.parse('inmemory://model/agent-feedback-widget-test.ts');

	const comment: ISessionEditorComment = {
		id: 'agentFeedback:feedback-1',
		sourceId: 'feedback-1',
		source: SessionEditorCommentSource.AgentFeedback,
		kind: AgentFeedbackKind.UserReview,
		sessionResource,
		resourceUri: fileResource,
		range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
		text: 'Original comment',
		canConvertToAgentFeedback: false,
	};

	interface ITestHarness {
		/** Comment ids passed to `setNavigationAnchor`, in call order. */
		readonly navigations: readonly string[];
		readonly hiddenFeedbackIds: readonly string[];
		readonly sourcePullRequests: readonly (IFeedbackPullRequest | undefined)[];
		readonly domNode: HTMLElement;
		/** Tears the widget down and builds a new one, as the contribution does on any feedback change. */
		rebuild(): HTMLElement;
	}

	function withWidget(callback: (harness: ITestHarness) => void, testComment: ISessionEditorComment = comment): void {
		const navigations: string[] = [];
		const hiddenFeedbackIds: string[] = [];
		const sourcePullRequests: (IFeedbackPullRequest | undefined)[] = [];
		const services = new ServiceCollection();
		services.set(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() {
			override setNavigationAnchor(_sessionResource: URI, commentId: string): void { navigations.push(commentId); }
			override updateFeedback(): void { }
			override hideFeedbackInEditor(_sessionResource: URI, feedbackId: string): void { hiddenFeedbackIds.push(feedbackId); }
			override addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion, _context?: IAgentFeedbackContext, sourcePRReviewCommentId?: string, kind: AgentFeedbackKind = AgentFeedbackKind.UserReview, state: AgentFeedbackState = AgentFeedbackState.Accepted, sourcePullRequest?: IFeedbackPullRequest): IAgentFeedback {
				sourcePullRequests.push(sourcePullRequest);
				return {
					id: 'converted',
					text,
					resourceUri,
					range,
					sessionResource,
					suggestion,
					kind,
					sourcePRReviewCommentId,
					sourcePullRequest,
					state,
				};
			}
			override addReply(): void { }
		});
		services.set(ICodeReviewService, new class extends mock<ICodeReviewService>() {
			override markPRReviewCommentConverted(): void { }
		});
		services.set(IMarkdownRendererService, new SyncDescriptor(MarkdownRendererService));

		withTestCodeEditor(['first line', 'second line'], { serviceCollection: services }, (editor, _viewModel, instantiationService) => {
			const store = new DisposableStore();
			const draftState: IComposerDraftState = { drafts: new Map(), focusedCommentId: undefined };
			let widget: AgentFeedbackEditorWidget | undefined;

			const createWidget = () => {
				widget = store.add(instantiationService.createInstance(AgentFeedbackEditorWidget, editor, [testComment], sessionResource, draftState));
				const domNode = widget.getDomNode();
				// The test editor has no real view, so attach the overlay ourselves for focus to work.
				mainWindow.document.body.appendChild(domNode);
				widget.restoreComposerFocus();
				widget.expand();
				return domNode;
			};

			const rebuild = () => {
				const previous = widget!;
				const activeElement = mainWindow.document.activeElement;
				draftState.focusedCommentId = isHTMLElement(activeElement) ? previous.findComposerCommentIdForElement(activeElement) : undefined;
				previous.getDomNode().remove();
				previous.dispose();
				return createWidget();
			};

			try {
				callback({ navigations, hiddenFeedbackIds, sourcePullRequests, domNode: createWidget(), rebuild });
			} finally {
				widget?.getDomNode().remove();
				store.dispose();
			}
		});
	}

	function triggerAction(domNode: HTMLElement, codiconClass: string): void {
		domNode.querySelector<HTMLElement>(`.agent-feedback-widget-item-actions .action-label.${codiconClass}`)!.click();
	}

	function composer(domNode: HTMLElement): HTMLTextAreaElement | null {
		return domNode.querySelector<HTMLTextAreaElement>('textarea.agent-feedback-widget-edit-textarea');
	}

	function type(textarea: HTMLTextAreaElement, text: string): void {
		textarea.value = text;
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
	}

	function dispatchEscape(target: HTMLElement): void {
		const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		Object.defineProperty(event, 'keyCode', { get: () => 27 });
		target.dispatchEvent(event);
	}

	function dispatchEnter(target: HTMLElement): void {
		const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		Object.defineProperty(event, 'keyCode', { get: () => 13 });
		target.dispatchEvent(event);
	}

	test('clicking inside the edit composer keeps it open and focused without navigating', () => {
		withWidget(({ domNode, navigations }) => {
			triggerAction(domNode, 'codicon-edit');
			const textarea = composer(domNode)!;

			textarea.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			textarea.dispatchEvent(new MouseEvent('click', { bubbles: true }));

			assert.deepStrictEqual({
				stillOpen: composer(domNode) === textarea,
				focused: mainWindow.document.activeElement === textarea,
				navigations: [...navigations],
			}, { stillOpen: true, focused: true, navigations: [] });
		});
	});

	test('clicking the comment text navigates', () => {
		withWidget(({ domNode, navigations }) => {
			domNode.querySelector<HTMLElement>('.agent-feedback-widget-text')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

			assert.deepStrictEqual([...navigations], [comment.id]);
		});
	});

	test('resolved feedback only has a hide action', () => {
		const resolvedComment: ISessionEditorComment = { ...comment, state: AgentFeedbackState.Resolved };
		withWidget(({ domNode, hiddenFeedbackIds }) => {
			const actions = [...domNode.querySelectorAll<HTMLElement>('.agent-feedback-widget-item-actions .action-label')];
			const hideAction = domNode.querySelector<HTMLElement>('.agent-feedback-widget-item-actions .action-label.codicon-close');
			hideAction?.click();

			assert.deepStrictEqual({
				actionCount: actions.length,
				hasEdit: actions.some(action => action.classList.contains('codicon-edit')),
				hasReply: actions.some(action => action.classList.contains('codicon-comment-discussion')),
				hideLabel: hideAction?.ariaLabel || hideAction?.title,
				hiddenFeedbackIds: [...hiddenFeedbackIds],
			}, {
				actionCount: 1,
				hasEdit: false,
				hasReply: false,
				hideLabel: 'Hide',
				hiddenFeedbackIds: [resolvedComment.sourceId],
			});

		}, resolvedComment);
	});

	test('created feedback uses the standard primary button colors', () => {
		const createdComment: ISessionEditorComment = { ...comment, state: AgentFeedbackState.Created };
		withWidget(({ domNode }) => {
			const acceptButton = domNode.querySelector<HTMLElement>('.agent-feedback-widget-actions-bar .monaco-button:not(.secondary)')!;

			assert.deepStrictEqual({
				backgroundColor: acceptButton.style.backgroundColor,
				color: acceptButton.style.color,
			}, {
				backgroundColor: 'var(--vscode-button-background)',
				color: 'var(--vscode-button-foreground)',
			});
		}, createdComment);
	});

	function prReviewComment(sourcePullRequest: IFeedbackPullRequest): ISessionEditorComment {
		return {
			...comment,
			id: 'prReview:thread-1',
			sourceId: 'thread-1',
			source: SessionEditorCommentSource.PRReview,
			kind: AgentFeedbackKind.PRReview,
			canConvertToAgentFeedback: true,
			sourcePullRequest,
		};
	}

	test('preserves pull request identity when editing a PR comment', () => {
		const sourcePullRequest = { owner: 'owner', repo: 'repo', number: 42 };
		withWidget(({ domNode, sourcePullRequests }) => {
			triggerAction(domNode, 'codicon-edit');
			const textarea = composer(domNode)!;
			type(textarea, 'Edited PR comment');
			dispatchEnter(textarea);

			assert.deepStrictEqual(sourcePullRequests, [sourcePullRequest]);
		}, prReviewComment(sourcePullRequest));
	});

	test('preserves pull request identity when replying to a PR comment', () => {
		const sourcePullRequest = { owner: 'owner', repo: 'repo', number: 42 };
		withWidget(({ domNode, sourcePullRequests }) => {
			triggerAction(domNode, 'codicon-comment-discussion');
			const textarea = composer(domNode)!;
			type(textarea, 'Reply to PR comment');
			dispatchEnter(textarea);

			assert.deepStrictEqual(sourcePullRequests, [sourcePullRequest]);
		}, prReviewComment(sourcePullRequest));
	});

	test('the edit composer survives losing focus and is closed by Escape from the widget', () => {
		withWidget(({ domNode }) => {
			triggerAction(domNode, 'codicon-edit');
			const textarea = composer(domNode)!;
			type(textarea, 'edited text');

			// Clicking the comment text pulls focus to the widget so the DOM selection can be copied.
			domNode.querySelector<HTMLElement>('.agent-feedback-widget-text')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			textarea.blur();
			const openAfterBlur = composer(domNode) === textarea;

			dispatchEscape(domNode);

			assert.deepStrictEqual({
				openAfterBlur,
				openAfterEscape: composer(domNode) !== null,
			}, { openAfterBlur: true, openAfterEscape: false });
		});
	});

	test('the empty reply composer survives losing focus and is closed by Escape', () => {
		withWidget(({ domNode }) => {
			triggerAction(domNode, 'codicon-comment-discussion');
			const textarea = composer(domNode)!;

			textarea.blur();
			const openAfterBlur = composer(domNode) === textarea;

			dispatchEscape(textarea);

			assert.deepStrictEqual({
				openAfterBlur,
				openAfterEscape: composer(domNode) !== null,
			}, { openAfterBlur: true, openAfterEscape: false });
		});
	});

	test('an edit draft survives a widget rebuild', () => {
		withWidget(harness => {
			triggerAction(harness.domNode, 'codicon-edit');
			type(composer(harness.domNode)!, 'edited text');

			const rebuilt = harness.rebuild();
			const restored = composer(rebuilt);

			assert.deepStrictEqual({
				text: restored?.value,
				editing: rebuilt.querySelector('.agent-feedback-widget-text.editing') !== null,
				focused: mainWindow.document.activeElement === restored,
			}, { text: 'edited text', editing: true, focused: true });
		});
	});

	test('a saved edit does not reopen the composer after the rebuild', () => {
		withWidget(harness => {
			triggerAction(harness.domNode, 'codicon-edit');
			const textarea = composer(harness.domNode)!;
			type(textarea, 'edited text');

			const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
			Object.defineProperty(event, 'keyCode', { get: () => 13 });
			textarea.dispatchEvent(event);

			assert.strictEqual(composer(harness.rebuild()), null);
		});
	});
});
