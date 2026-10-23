/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, isHTMLElement } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { withAsyncTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { AccessibleContentProvider, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IFeedbackPullRequest } from '../../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { ICodeReviewService, ICodeReviewSuggestion } from '../../../codeReview/browser/codeReviewService.js';
import { AgentFeedbackEditorWidget, IComposerDraftState } from '../../browser/agentFeedbackEditorWidget.js';
import { AgentFeedbackAccessibility } from '../../browser/agentFeedbackAccessibility.js';
import { IAgentFeedbackContext } from '../../browser/agentFeedbackEditorUtils.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { getNativeAnnotationEditorComments, ISessionEditorComment, SessionEditorCommentSource } from '../../browser/sessionEditorComments.js';

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
		readonly removedFeedbackIds: readonly string[];
		readonly dismissedPRCommentIds: readonly string[];
		readonly sourcePullRequests: readonly (IFeedbackPullRequest | undefined)[];
		readonly domNode: HTMLElement;
		readonly nativeActions: readonly { action: string; id: string; entryId?: string; text?: string; resolved?: boolean }[];
		readonly errors: readonly string[];
		setNativeResult(result: Promise<void>): void;
		accessibilityProvider(type: AccessibleViewType): AccessibleContentProvider | undefined;
		/** Tears the widget down and builds a new one, as the contribution does on any feedback change. */
		rebuild(comment?: ISessionEditorComment): HTMLElement;
		focusOutside(): HTMLElement;
	}

	function withWidget(callback: (harness: ITestHarness) => void | Promise<void>, testComment: ISessionEditorComment = comment): Promise<void> {
		let currentComment = testComment;
		const navigations: string[] = [];
		const hiddenFeedbackIds: string[] = [];
		const removedFeedbackIds: string[] = [];
		const dismissedPRCommentIds: string[] = [];
		const sourcePullRequests: (IFeedbackPullRequest | undefined)[] = [];
		const nativeActions: { action: string; id: string; entryId?: string; text?: string; resolved?: boolean }[] = [];
		const errors: string[] = [];
		let nativeResult = Promise.resolve();
		const services = new ServiceCollection();
		services.set(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() {
			override setNavigationAnchor(_sessionResource: URI, commentId: string): void { navigations.push(commentId); }
			override updateFeedback(): void { }
			override hideFeedbackInEditor(_sessionResource: URI, feedbackId: string): void { hiddenFeedbackIds.push(feedbackId); }
			override removeFeedback(_sessionResource: URI, feedbackId: string): void { removedFeedbackIds.push(feedbackId); }
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
			override updateAnnotationEntry(_resource: URI, id: string, entryId: string, text: string): Promise<void> {
				nativeActions.push({ action: 'edit', id, entryId, text });
				return nativeResult;
			}
			override addAnnotationReply(_resource: URI, id: string, entryId: string, text: string): Promise<void> {
				nativeActions.push({ action: 'reply', id, entryId, text });
				return nativeResult;
			}
			override setAnnotationResolved(_resource: URI, id: string, resolved: boolean): Promise<void> {
				nativeActions.push({ action: 'resolve', id, resolved });
				return nativeResult;
			}
			override removeAnnotation(_resource: URI, id: string): Promise<void> {
				nativeActions.push({ action: 'delete', id });
				return nativeResult;
			}
		});
		services.set(ICodeReviewService, new class extends mock<ICodeReviewService>() {
			override markPRReviewCommentConverted(): void { }
			override dismissPRReviewComment(_sessionResource: URI, commentId: string): void { dismissedPRCommentIds.push(commentId); }
		});
		services.set(IMarkdownRendererService, new SyncDescriptor(MarkdownRendererService));
		services.set(INotificationService, new class extends TestNotificationService {
			override error(error: string | Error) {
				errors.push(error instanceof Error ? error.message : error);
				return super.error(error);
			}
		}());

		return withAsyncTestCodeEditor(['first line', 'second line'], { serviceCollection: services }, async (editor, _viewModel, instantiationService) => {
			const store = new DisposableStore();
			const draftState: IComposerDraftState = { drafts: new Map(), focusedCommentId: undefined };
			let widget: AgentFeedbackEditorWidget | undefined;
			const outside = $('input');
			mainWindow.document.body.appendChild(outside);

			const createWidget = () => {
				widget = store.add(instantiationService.createInstance(AgentFeedbackEditorWidget, editor, [currentComment], currentComment.sessionResource, draftState));
				const domNode = widget.getDomNode();
				// The test editor has no real view, so attach the overlay ourselves for focus to work.
				mainWindow.document.body.appendChild(domNode);
				widget.restoreComposerFocus();
				widget.expand();
				return domNode;
			};

			const rebuild = (updatedComment = currentComment) => {
				currentComment = updatedComment;
				const previous = widget!;
				const activeElement = mainWindow.document.activeElement;
				draftState.focusedCommentId = isHTMLElement(activeElement) ? previous.findComposerCommentIdForElement(activeElement) : undefined;
				previous.getDomNode().remove();
				previous.dispose();
				return createWidget();
			};

			try {
				await callback({
					navigations, hiddenFeedbackIds, removedFeedbackIds, dismissedPRCommentIds, sourcePullRequests, nativeActions, errors, domNode: createWidget(), rebuild,
					focusOutside: () => { outside.focus(); return outside; },
					setNativeResult: result => nativeResult = result,
					accessibilityProvider: type => {
						const provider = instantiationService.invokeFunction(accessor => new AgentFeedbackAccessibility(type).getProvider(accessor));
						return provider ? store.add(provider) : undefined;
					},
				});
			} finally {
				outside.remove();
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
		return withWidget(({ domNode, navigations }) => {
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
		return withWidget(({ domNode, navigations }) => {
			domNode.querySelector<HTMLElement>('.agent-feedback-widget-text')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

			assert.deepStrictEqual([...navigations], [comment.id]);
		});
	});

	test('resolved feedback only has a hide action', () => {
		const resolvedComment: ISessionEditorComment = { ...comment, state: AgentFeedbackState.Resolved };
		return withWidget(({ domNode, hiddenFeedbackIds }) => {
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
		return withWidget(({ domNode }) => {
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

	test('deleting an Agent Host PR comment suppresses its raw source before removing it', () => {
		const prComment: ISessionEditorComment = {
			...comment,
			kind: AgentFeedbackKind.PRReview,
			state: AgentFeedbackState.Created,
			sourcePRReviewCommentId: 'thread-1',
		};
		return withWidget(({ domNode, dismissedPRCommentIds, removedFeedbackIds }) => {
			const deleteButton = [...domNode.querySelectorAll<HTMLElement>('.agent-feedback-widget-actions-bar .monaco-button')]
				.find(button => button.textContent === 'Delete');
			deleteButton?.click();

			assert.deepStrictEqual({
				dismissedPRCommentIds,
				removedFeedbackIds,
			}, {
				dismissedPRCommentIds: ['thread-1'],
				removedFeedbackIds: [prComment.sourceId],
			});
		}, prComment);
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
		return withWidget(({ domNode, sourcePullRequests }) => {
			triggerAction(domNode, 'codicon-edit');
			const textarea = composer(domNode)!;
			type(textarea, 'Edited PR comment');
			dispatchEnter(textarea);

			assert.deepStrictEqual(sourcePullRequests, [sourcePullRequest]);
		}, prReviewComment(sourcePullRequest));
	});

	test('preserves pull request identity when replying to a PR comment', () => {
		const sourcePullRequest = { owner: 'owner', repo: 'repo', number: 42 };
		return withWidget(({ domNode, sourcePullRequests }) => {
			triggerAction(domNode, 'codicon-comment-discussion');
			const textarea = composer(domNode)!;
			type(textarea, 'Reply to PR comment');
			dispatchEnter(textarea);

			assert.deepStrictEqual(sourcePullRequests, [sourcePullRequest]);
		}, prReviewComment(sourcePullRequest));
	});

	test('the edit composer survives losing focus and is closed by Escape from the widget', () => {
		return withWidget(({ domNode }) => {
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
		return withWidget(({ domNode }) => {
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
		return withWidget(harness => {
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
		return withWidget(harness => {
			triggerAction(harness.domNode, 'codicon-edit');
			const textarea = composer(harness.domNode)!;
			type(textarea, 'edited text');

			const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
			Object.defineProperty(event, 'keyCode', { get: () => 13 });
			textarea.dispatchEvent(event);

			assert.strictEqual(composer(harness.rebuild()), null);
		});
	});

	function nativeComment(resolved = false, canEdit = true): ISessionEditorComment {
		return getNativeAnnotationEditorComments(sessionResource, [{
			annotationsUri: URI.parse('review-channel:/opaque'),
			resourceUri: fileResource,
			annotation: {
				id: 'native', origin: { session: 'session-store:/opaque' }, resource: fileResource.toString(), resolved,
				entries: [
					{ id: 'first', text: 'Literal **text** <tag>' },
					{ id: 'second', text: { markdown: '**Reply** [command](command:example) ![remote](https://example.invalid/tracker.png)' } },
				],
			},
		}], canEdit)[0];
	}

	test('native comments distinguish plain text and safe Markdown without inventing authors or acceptance', () => {
		return withWidget(({ domNode }) => {
			assert.deepStrictEqual({
				text: domNode.querySelector('.agent-feedback-widget-text')?.textContent,
				plainMarkup: domNode.querySelector('.agent-feedback-widget-text strong'),
				reply: domNode.querySelector('.agent-feedback-widget-reply-text strong')?.textContent,
				unsafeContent: domNode.querySelector('img, a[data-href^="command:"], tag'),
				author: domNode.querySelector('.agent-feedback-widget-reply-author'),
				accept: domNode.querySelector('.agent-feedback-widget-actions-bar'),
				anchor: domNode.querySelector('.agent-feedback-widget-line-info')?.textContent,
			}, { text: 'Literal **text** <tag>', plainMarkup: null, reply: 'Reply', unsafeContent: null, author: null, accept: null, anchor: 'File' });
		}, nativeComment());
	});

	test('native drafts survive pending rebuilds, retain whitespace, and recover after host rejection', () => {
		return withWidget(async harness => {
			const pending = new DeferredPromise<void>();
			harness.setNativeResult(pending.p);
			triggerAction(harness.domNode, 'codicon-edit');
			type(composer(harness.domNode)!, '    Indented text\n');
			dispatchEnter(composer(harness.domNode)!);
			dispatchEnter(composer(harness.domNode)!);
			await timeout(0);
			const rebuilt = harness.rebuild();
			dispatchEscape(composer(rebuilt)!);
			assert.strictEqual(composer(rebuilt)?.readOnly, true);
			await pending.error(new Error('Host rejected the edit'));
			await timeout(0);
			assert.deepStrictEqual({
				actions: harness.nativeActions, errors: harness.errors,
				text: composer(rebuilt)?.value, readOnly: composer(rebuilt)?.readOnly, focused: mainWindow.document.activeElement === composer(rebuilt),
			}, {
				actions: [{ action: 'edit', id: 'native', entryId: 'first', text: '    Indented text\n' }], errors: ['Host rejected the edit'],
				text: '    Indented text\n', readOnly: false, focused: true,
			});
			harness.setNativeResult(Promise.resolve());
			const retry = harness.rebuild();
			dispatchEnter(composer(retry)!);
			await timeout(0);
			assert.strictEqual(composer(harness.rebuild()), null);
		}, nativeComment());
	});

	test('native reply, resolve and delete never convert feedback or resolve PR threads', () => {
		return withWidget(async harness => {
			triggerAction(harness.domNode, 'codicon-comment-discussion');
			type(composer(harness.domNode)!, 'Reply text');
			dispatchEnter(composer(harness.domNode)!);
			await timeout(0);
			triggerAction(harness.domNode, 'codicon-check');
			triggerAction(harness.domNode, 'codicon-close');
			await timeout(0);
			assert.deepStrictEqual({
				actions: harness.nativeActions, converted: harness.sourcePullRequests, removed: harness.removedFeedbackIds, dismissed: harness.dismissedPRCommentIds,
			}, {
				actions: [{ action: 'reply', id: 'native', entryId: harness.nativeActions[0].entryId, text: 'Reply text' }, { action: 'resolve', id: 'native', resolved: true }, { action: 'delete', id: 'native' }],
				converted: [], removed: [], dismissed: [],
			});
		}, nativeComment());
	});

	test('an edit draft keeps its original entry after that entry is removed', () => {
		const original = nativeComment();
		return withWidget(async harness => {
			triggerAction(harness.domNode, 'codicon-edit');
			type(composer(harness.domNode)!, 'Opening draft');
			const rebuilt = harness.rebuild({
				...original, text: 'Reply',
				annotation: { ...original.annotation!, entries: original.annotation!.entries.slice(1) },
			});
			dispatchEnter(composer(rebuilt)!);
			await timeout(0);
			assert.deepStrictEqual(harness.nativeActions, [{ action: 'edit', id: 'native', entryId: 'first', text: 'Opening draft' }]);
		}, original);
	});

	for (const owner of ['session', 'channel'] as const) {
		test(`native drafts do not survive a change of owning ${owner}`, () => {
			const original = nativeComment();
			return withWidget(harness => {
				triggerAction(harness.domNode, 'codicon-edit');
				type(composer(harness.domNode)!, 'Old owner draft');
				const replacement = {
					...original,
					...(owner === 'session' ? { sessionResource: URI.parse('session-store:/replacement') } : { annotationsUri: URI.parse('review-channel:/replacement') }),
				};
				const rebuilt = harness.rebuild(replacement);
				assert.deepStrictEqual({ composer: composer(rebuilt), actions: harness.nativeActions }, { composer: null, actions: [] });
			}, original);
		});
	}

	test('native reply retries retain their entry ID across failed saves and rebuilds', () => {
		return withWidget(async harness => {
			const pending = new DeferredPromise<void>();
			harness.setNativeResult(pending.p);
			triggerAction(harness.domNode, 'codicon-comment-discussion');
			type(composer(harness.domNode)!, 'Retryable reply');
			dispatchEnter(composer(harness.domNode)!);
			await timeout(0);
			harness.rebuild();
			await pending.error(new Error('Transport lost'));
			await timeout(0);
			harness.setNativeResult(Promise.resolve());
			const rebuilt = harness.rebuild();
			dispatchEnter(composer(rebuilt)!);
			await timeout(0);
			const entryId = harness.nativeActions[0].entryId;
			assert.ok(entryId);
			assert.deepStrictEqual(harness.nativeActions, [
				{ action: 'reply', id: 'native', entryId, text: 'Retryable reply' },
				{ action: 'reply', id: 'native', entryId, text: 'Retryable reply' },
			]);
		}, nativeComment());
	});

	for (const rebuild of [false, true]) {
		for (const rejected of [false, true]) {
			test(`native save does not steal focus (rebuild: ${rebuild}, rejected: ${rejected})`, () => {
				return withWidget(async harness => {
					const pending = new DeferredPromise<void>();
					harness.setNativeResult(pending.p);
					triggerAction(harness.domNode, 'codicon-edit');
					type(composer(harness.domNode)!, 'Draft');
					dispatchEnter(composer(harness.domNode)!);
					await timeout(0);
					const outside = harness.focusOutside();
					const domNode = rebuild ? harness.rebuild() : harness.domNode;
					if (rejected) {
						await pending.error(new Error('Host rejected the edit'));
					} else {
						await pending.complete();
					}
					await timeout(0);
					assert.deepStrictEqual({
						focusedOutside: mainWindow.document.activeElement === outside,
						draft: composer(domNode)?.value,
					}, { focusedOutside: true, draft: rejected ? 'Draft' : undefined });
				}, nativeComment());
			});
		}
	}

	test('native drafts stay read-only during reconnect and become editable on recovery', () => {
		const original = nativeComment();
		return withWidget(async harness => {
			triggerAction(harness.domNode, 'codicon-edit');
			type(composer(harness.domNode)!, 'Retained draft');
			const offline = harness.rebuild({ ...original, canEdit: false });
			dispatchEnter(composer(offline)!);
			await timeout(0);
			const before = { text: composer(offline)?.value, readOnly: composer(offline)?.readOnly, calls: harness.nativeActions.length };
			const recovered = harness.rebuild(original);
			dispatchEnter(composer(recovered)!);
			await timeout(0);
			assert.deepStrictEqual({ before, calls: harness.nativeActions }, {
				before: { text: 'Retained draft', readOnly: true, calls: 0 },
				calls: [{ action: 'edit', id: 'native', entryId: 'first', text: 'Retained draft' }],
			});
		}, original);
	});

	test('an offline draft can be cancelled when no save is pending', () => {
		const original = nativeComment();
		return withWidget(harness => {
			triggerAction(harness.domNode, 'codicon-edit');
			type(composer(harness.domNode)!, 'Offline draft');
			const offline = harness.rebuild({ ...original, canEdit: false });
			dispatchEscape(composer(offline)!);
			assert.deepStrictEqual({ composer: composer(offline), calls: harness.nativeActions }, { composer: null, calls: [] });
		}, original);
	});

	test('resolved native threads can be reopened', () => {
		return withWidget(async harness => {
			triggerAction(harness.domNode, 'codicon-discard');
			await timeout(0);
			assert.deepStrictEqual({
				label: harness.domNode.querySelector('.agent-feedback-widget-item-type')?.textContent, actions: harness.nativeActions,
			}, { label: 'Resolved Comment', actions: [{ action: 'resolve', id: 'native', resolved: false }] });
		}, nativeComment(true));
	});

	test('offline native comments remain readable with disabled actions', () => {
		return withWidget(async harness => {
			for (const icon of ['codicon-edit', 'codicon-comment-discussion', 'codicon-check', 'codicon-close']) {
				triggerAction(harness.domNode, icon);
			}
			await timeout(0);
			assert.deepStrictEqual({ actions: harness.nativeActions, composer: composer(harness.domNode) }, { actions: [], composer: null });
		}, nativeComment(false, false));
	});

	test('comment toggle and accessible views support keyboard navigation and restore focus', () => {
		return withWidget(harness => {
			assert.strictEqual(harness.accessibilityProvider(AccessibleViewType.Help), undefined);
			const toggle = harness.domNode.querySelector<HTMLElement>('.agent-feedback-widget-toggle')!;
			toggle.focus();
			dispatchEnter(toggle);
			const collapsed = toggle.getAttribute('aria-expanded');
			dispatchEnter(toggle);
			const help = harness.accessibilityProvider(AccessibleViewType.Help)!;
			const view = harness.accessibilityProvider(AccessibleViewType.View)!;
			toggle.blur();
			view.onClose();
			assert.deepStrictEqual({
				collapsed, expanded: toggle.getAttribute('aria-expanded'), focused: mainWindow.document.activeElement === toggle,
				help: help.provideContent().includes('Escape to cancel'), text: view.provideContent().includes('Literal **text** <tag>'),
			}, { collapsed: 'false', expanded: 'true', focused: true, help: true, text: true });
		}, nativeComment());
	});
});
