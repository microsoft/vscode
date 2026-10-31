/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, isHTMLElement } from '../../../../../base/browser/dom.js';
import { IRenderedMarkdown, MarkdownRenderOptions } from '../../../../../base/browser/markdownRenderer.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Event as BaseEvent } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { ScrollType } from '../../../../../editor/common/editorCommon.js';
import { withTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { IFeedbackPullRequest } from '../../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { getIconRegistry, IconContribution } from '../../../../../platform/theme/common/iconRegistry.js';
import { ICodeReviewService, ICodeReviewSuggestion } from '../../../codeReview/browser/codeReviewService.js';
import { AgentFeedbackEditorWidget, IComposerDraftState } from '../../browser/agentFeedbackEditorWidget.js';
import { IAgentFeedbackContext } from '../../browser/agentFeedbackEditorUtils.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { ISessionEditorComment, SessionEditorCommentSource } from '../../browser/sessionEditorComments.js';

suite('AgentFeedbackEditorWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();
	const contextMenuActions = new WeakMap<HTMLElement, readonly IAction[]>();

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
		readonly sourceAuthors: readonly (string | undefined)[];
		readonly acceptedFeedbackIds: readonly string[];
		readonly domNode: HTMLElement;
		readonly editor: ICodeEditor;
		readonly widget: AgentFeedbackEditorWidget;
		/** Tears the widget down and builds a new one, as the contribution does on any feedback change. */
		rebuild(): HTMLElement;
	}

	interface ITestWidgetOptions {
		readonly expanded?: boolean;
		readonly accountName?: string;
		readonly comments?: readonly ISessionEditorComment[];
		readonly markdownRenderer?: IMarkdownRendererService;
		readonly renderEditor?: boolean;
		readonly editorWidth?: number;
		readonly lines?: string[];
	}

	function withWidget(callback: (harness: ITestHarness) => void, testComment: ISessionEditorComment = comment, options: ITestWidgetOptions = {}): void {
		const navigations: string[] = [];
		const hiddenFeedbackIds: string[] = [];
		const removedFeedbackIds: string[] = [];
		const dismissedPRCommentIds: string[] = [];
		const sourcePullRequests: (IFeedbackPullRequest | undefined)[] = [];
		const sourceAuthors: (string | undefined)[] = [];
		const acceptedFeedbackIds: string[] = [];
		let widget: AgentFeedbackEditorWidget | undefined;
		const services = new ServiceCollection();
		services.set(IContextMenuService, new class extends mock<IContextMenuService>() {
			override showContextMenu(delegate: Parameters<IContextMenuService['showContextMenu']>[0]): void {
				if (widget && delegate.getActions) {
					contextMenuActions.set(widget.getDomNode(), delegate.getActions());
				}
			}
		});
		services.set(IDefaultAccountService, new class extends mock<IDefaultAccountService>() {
			override readonly onDidChangeDefaultAccount = BaseEvent.None;
			override readonly currentDefaultAccount = options.accountName ? {
				accountName: options.accountName,
				authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
				sessionId: 'test',
				enterprise: false,
			} : null;
		});
		services.set(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() {
			override setNavigationAnchor(_sessionResource: URI, commentId: string): void { navigations.push(commentId); }
			override acceptFeedback(_sessionResource: URI, feedbackId: string): void { acceptedFeedbackIds.push(feedbackId); }
			override updateFeedback(): void { }
			override hideFeedbackInEditor(_sessionResource: URI, feedbackId: string): void { hiddenFeedbackIds.push(feedbackId); }
			override removeFeedback(_sessionResource: URI, feedbackId: string): void { removedFeedbackIds.push(feedbackId); }
			override addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion, _context?: IAgentFeedbackContext, sourcePRReviewCommentId?: string, kind: AgentFeedbackKind = AgentFeedbackKind.UserReview, state: AgentFeedbackState = AgentFeedbackState.Accepted, sourcePullRequest?: IFeedbackPullRequest, sourcePRReviewCommentAuthor?: string): IAgentFeedback {
				sourcePullRequests.push(sourcePullRequest);
				sourceAuthors.push(sourcePRReviewCommentAuthor);
				return {
					id: 'converted',
					text,
					resourceUri,
					range,
					sessionResource,
					suggestion,
					kind,
					sourcePRReviewCommentId,
					sourcePRReviewCommentAuthor,
					sourcePullRequest,
					state,
				};
			}
			override addReply(): void { }
		});
		services.set(ICodeReviewService, new class extends mock<ICodeReviewService>() {
			override markPRReviewCommentConverted(): void { }
			override dismissPRReviewComment(_sessionResource: URI, commentId: string): void { dismissedPRCommentIds.push(commentId); }
		});
		services.set(IMarkdownRendererService, options.markdownRenderer ?? new SyncDescriptor(MarkdownRendererService));

		withTestCodeEditor(options.lines ?? ['first line', 'second line'], { serviceCollection: services, envConfig: { outerWidth: 760, outerHeight: 420 } }, (testEditor, _viewModel, instantiationService) => {
			const store = new DisposableStore();
			let editor: ICodeEditor = testEditor;
			const editorContainer = options.renderEditor ? append(mainWindow.document.body, $('div')) : undefined;
			const draftState: IComposerDraftState = { drafts: new Map(), focusedCommentId: undefined };
			const createWidget = () => {
				widget = store.add(instantiationService.createInstance(AgentFeedbackEditorWidget, editor, options.comments ?? [testComment], sessionResource, draftState));
				const domNode = widget.getDomNode();
				if (!editorContainer) {
					// The test editor has no real view, so attach the overlay ourselves for focus to work.
					append(mainWindow.document.body, domNode);
				}
				widget.restoreComposerFocus();
				if (options.expanded !== false) {
					widget.expand();
				} else {
					widget.layout(testComment.range.startLineNumber);
				}
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
				if (editorContainer) {
					const width = options.editorWidth ?? 760;
					editorContainer.style.width = `${width}px`;
					editorContainer.style.height = '420px';
					editor = store.add(instantiationService.createInstance(CodeEditorWidget, editorContainer, {
						dimension: { width, height: 420 },
						fontSize: 13,
						lineHeight: 20,
						minimap: { enabled: false },
						wordWrap: 'off',
						scrollBeyondLastLine: false,
						scrollBeyondLastColumn: 0,
					}, { contributions: [] }));
					editor.setModel(testEditor.getModel());
					editor.render();
				}
				const domNode = createWidget();
				callback({ navigations, hiddenFeedbackIds, removedFeedbackIds, dismissedPRCommentIds, sourcePullRequests, sourceAuthors, acceptedFeedbackIds, domNode, editor, widget: widget!, rebuild });
			} finally {
				widget?.dispose();
				widget?.getDomNode().remove();
				store.dispose();
				editorContainer?.remove();
			}
		});
	}

	function triggerAction(domNode: HTMLElement, codiconClass: string): void {
		const iconClass = codiconClass === 'codicon-edit' ? 'codicon-agent-feedback-edit' : 'codicon-agent-feedback-reply';
		const inlineAction = domNode.querySelector<HTMLElement>(`.agent-feedback-widget-item-actions .action-label.${iconClass}`);
		if (inlineAction) {
			inlineAction.click();
		} else {
			dispatchEnter(domNode.querySelector<HTMLElement>('.action-label.codicon-agent-feedback-more')!);
			const action = contextMenuActions.get(domNode)?.find(action => action.class?.includes(iconClass));
			assert.ok(action);
			void action.run();
		}
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

	function getScrollState(domNode: HTMLElement, editor: ICodeEditor) {
		editor.render();
		const body = domNode.querySelector<HTMLElement>('.agent-feedback-widget-body')!;
		body.scrollTop = body.scrollHeight;
		const editorBounds = editor.getDomNode()!.getBoundingClientRect();
		const widgetBounds = domNode.getBoundingClientRect();
		const layout = editor.getLayoutInfo();
		const viewportBottom = editorBounds.top + layout.height - layout.horizontalScrollbarHeight;
		return {
			fitsEditor: widgetBounds.top >= editorBounds.top - 1 && widgetBounds.bottom <= viewportBottom + 1,
			scrolls: body.scrollTop > 0 && body.scrollHeight > body.clientHeight,
			endVisible: body.lastElementChild!.getBoundingClientRect().bottom <= viewportBottom + 1,
			overflow: mainWindow.getComputedStyle(body).overflowY,
			role: body.getAttribute('role'),
			label: body.getAttribute('aria-label'),
			tabIndex: body.tabIndex,
		};
	}

	test('renders an author header and quiet line metadata instead of a summary header', () => {
		withWidget(({ domNode }) => {
			assert.deepStrictEqual({
				author: domNode.querySelector('.agent-feedback-widget-author')?.textContent,
				line: domNode.querySelector('.agent-feedback-widget-line-info')?.textContent,
				summary: domNode.querySelector('.agent-feedback-widget-header'),
				badge: domNode.querySelector('.agent-feedback-widget-item-type'),
				actions: [...domNode.querySelectorAll('.agent-feedback-widget-item-actions .action-label')].map(action => action.getAttribute('aria-label')),
				expandHidden: domNode.querySelector<HTMLElement>('.agent-feedback-widget-expand')?.hidden,
			}, {
				author: '@reviewer', line: 'Line 1', summary: null, badge: null,
				actions: ['More Actions...', 'Edit', 'Delete'], expandHidden: true,
			});
		}, comment, { accountName: 'reviewer', expanded: false });
	});

	for (const { kind, author, agentAuthored } of [
		{ kind: AgentFeedbackKind.UserReview, author: undefined, agentAuthored: false },
		{ kind: AgentFeedbackKind.PRReview, author: 'reviewer', agentAuthored: false },
		{ kind: AgentFeedbackKind.AgentReview, author: undefined, agentAuthored: true },
		{ kind: AgentFeedbackKind.PRReview, author: 'copilot-pull-request-reviewer', agentAuthored: true },
		{ kind: AgentFeedbackKind.PRReview, author: 'copilot-pull-request-reviewer[bot]', agentAuthored: true },
	]) {
		test(`preserves image policy by authorship for ${kind} comments from ${author ?? 'the session'}`, () => {
			const policies: { text: string; externalImagesAllowed: boolean; hasRelayoutCallback: boolean; trusted: boolean }[] = [];
			const markdownRenderer = new class extends mock<IMarkdownRendererService>() {
				override render(markdown: IMarkdownString, options?: MarkdownRenderOptions): IRenderedMarkdown {
					policies.push({
						text: markdown.value,
						externalImagesAllowed: options?.sanitizerConfig?.remoteImageIsAllowed?.(URI.parse('https://example.com/review.png')) ?? true,
						hasRelayoutCallback: typeof options?.asyncRenderCallback === 'function',
						trusted: markdown.isTrusted === true,
					});
					const element = $('div.rendered-markdown');
					element.textContent = markdown.value;
					return { element, dispose() { } };
				}
			}();

			withWidget(({ domNode }) => {
				triggerAction(domNode, 'codicon-edit');
				dispatchEscape(composer(domNode)!);
				assert.deepStrictEqual(policies, [
					{ text: comment.text, externalImagesAllowed: !agentAuthored, hasRelayoutCallback: true, trusted: false },
					{ text: 'User reply', externalImagesAllowed: true, hasRelayoutCallback: true, trusted: false },
					{ text: 'Agent reply', externalImagesAllowed: false, hasRelayoutCallback: true, trusted: false },
					{ text: 'Reviewer reply', externalImagesAllowed: true, hasRelayoutCallback: true, trusted: false },
					{ text: 'Unknown reply', externalImagesAllowed: true, hasRelayoutCallback: true, trusted: false },
					{ text: comment.text, externalImagesAllowed: !agentAuthored, hasRelayoutCallback: true, trusted: false },
				]);
			}, {
				...comment,
				kind,
				author,
				replies: [
					{ text: 'User reply', author: 'user' },
					{ text: 'Agent reply', author: 'agent' },
					{ text: 'Reviewer reply', author: 'prReviewer' },
					{ text: 'Unknown reply', author: 'unknown' },
				],
			}, { markdownRenderer });
		});
	}

	test('refreshes horizontal scroll reservation when a narrow editor widens', () => {
		let result: {
			measuredLine: boolean;
			responsiveWidth: boolean;
			narrowReservationCorrect: boolean;
			wideReservationCorrect: boolean;
			endOfLineUnobscured: boolean;
		} | undefined;
		withWidget(({ editor, widget, domNode }) => {
			editor.render();
			widget.layout(2);
			const measure = () => ({
				width: domNode.offsetWidth,
				reservation: widget.getMinContentWidthInPx(),
				lineWidth: editor.getWidthOfLine(2),
				scrollbarWidth: editor.getLayoutInfo().verticalScrollbarWidth,
			});
			const narrow = measure();
			editor.getContainerDomNode().style.width = '760px';
			editor.layout({ width: 760, height: 420 });
			editor.render();
			widget.relayout();
			editor.render();
			const wide = measure();
			editor.setScrollLeft(editor.getScrollWidth(), ScrollType.Immediate);
			editor.render();
			const end = editor.getScrolledVisiblePosition({ lineNumber: 2, column: editor.getModel()!.getLineMaxColumn(2) });
			const cardLeft = domNode.getBoundingClientRect().left - editor.getDomNode()!.getBoundingClientRect().left;

			result = {
				measuredLine: narrow.lineWidth > 0,
				responsiveWidth: wide.width > narrow.width,
				narrowReservationCorrect: Math.abs(narrow.reservation - (narrow.lineWidth + narrow.width + 2 * narrow.scrollbarWidth)) <= 1,
				wideReservationCorrect: Math.abs(wide.reservation - (wide.lineWidth + wide.width + 2 * wide.scrollbarWidth)) <= 1,
				endOfLineUnobscured: end !== null && end.left <= cardLeft + 1,
			};
		}, { ...comment, range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 } }, {
			renderEditor: true,
			editorWidth: 360,
			expanded: false,
			lines: ['header', `const value = "${'x'.repeat(240)}";`],
		});

		assert.deepStrictEqual(result, {
			measuredLine: true,
			responsiveWidth: true,
			narrowReservationCorrect: true,
			wideReservationCorrect: true,
			endOfLineUnobscured: true,
		});
	});

	for (const { name, expanded, comments } of [
		{
			name: 'an expanded comment',
			expanded: true,
			comments: [{
				...comment,
				range: { ...comment.range, startLineNumber: 10, endLineNumber: 10 },
				text: Array.from({ length: 30 }, () => 'This long comment must remain readable inside the editor.').join('\n\n'),
			}],
		},
		{
			name: 'a collapsed stack of comment cards',
			expanded: false,
			comments: Array.from({ length: 10 }, (_, index) => ({
				...comment,
				id: `agentFeedback:feedback-${index}`,
				sourceId: `feedback-${index}`,
				range: { ...comment.range, startLineNumber: 10, endLineNumber: 10 },
			})),
		},
	]) {
		test(`keeps ${name} scrollable inside the editor after resizing`, () => {
			const states: ReturnType<typeof getScrollState>[] = [];
			withWidget(({ domNode, editor, widget }) => {
				widget.layout(10);
				states.push(getScrollState(domNode, editor));
				editor.layout({ width: 760, height: 220 });
				widget.relayout();
				states.push(getScrollState(domNode, editor));
			}, comment, {
				renderEditor: true,
				expanded,
				comments,
				lines: Array.from({ length: 80 }, (_, index) => `Line ${index + 1}`),
			});
			const expected = {
				fitsEditor: true, scrolls: true, endVisible: true, overflow: 'auto',
				role: 'region', label: 'Scrollable comments', tabIndex: 0,
			};
			assert.deepStrictEqual(states, [expected, expected]);
		});
	}

	test('keeps a short stack inside the viewport when its anchor is near the bottom', () => {
		const comments = Array.from({ length: 3 }, (_, index) => ({
			...comment,
			id: `agentFeedback:feedback-${index}`,
			sourceId: `feedback-${index}`,
			range: { ...comment.range, startLineNumber: 16, endLineNumber: 16 },
		}));
		let result: { anchorVisible: boolean; shorterThanViewport: boolean; fitsEditor: boolean; scrollable: boolean } | undefined;
		withWidget(({ domNode, editor, widget }) => {
			widget.layout(16);
			editor.render();
			const editorBounds = editor.getDomNode()!.getBoundingClientRect();
			const widgetBounds = domNode.getBoundingClientRect();
			const layout = editor.getLayoutInfo();
			const availableHeight = layout.height - layout.horizontalScrollbarHeight;
			const anchorTop = editor.getTopForLineNumber(16) - editor.getScrollTop();
			result = {
				anchorVisible: anchorTop >= 0 && anchorTop < availableHeight,
				shorterThanViewport: widgetBounds.height < availableHeight,
				fitsEditor: widgetBounds.top >= editorBounds.top && widgetBounds.bottom <= editorBounds.top + availableHeight + 1,
				scrollable: domNode.querySelector('.agent-feedback-widget-body')!.classList.contains('scrollable'),
			};
		}, comments[0], {
			renderEditor: true,
			expanded: false,
			comments,
			lines: Array.from({ length: 80 }, (_, index) => `Line ${index + 1}`),
		});
		assert.deepStrictEqual(result, { anchorVisible: true, shorterThanViewport: true, fitsEditor: true, scrollable: false });
	});

	test('preserves the reading position when relayouting or resizing an expanded card', () => {
		const positions: number[] = [];
		withWidget(({ domNode, editor, widget }) => {
			const body = domNode.querySelector<HTMLElement>('.agent-feedback-widget-body')!;
			body.scrollTop = 100;
			widget.relayout();
			positions.push(body.scrollTop);
			body.scrollTop = 100;
			editor.getContainerDomNode().style.width = '360px';
			editor.layout({ width: 360, height: 420 });
			widget.relayout();
			positions.push(body.scrollTop);
		}, {
			...comment,
			text: Array.from({ length: 40 }, () => 'A paragraph of review feedback that needs scrolling.').join('\n\n'),
		}, { renderEditor: true });
		assert.deepStrictEqual(positions, [100, 100]);
	});

	test('refreshes preview overflow after width and asynchronous content changes', () => {
		const text = 'Review feedback '.repeat(7);
		let renderedText: HTMLElement | undefined;
		let onAsyncRender: (() => void) | undefined;
		const markdownRenderer = new class extends mock<IMarkdownRendererService>() {
			override render(markdown: IMarkdownString, options?: MarkdownRenderOptions): IRenderedMarkdown {
				const element = $('div.rendered-markdown');
				element.textContent = markdown.value;
				renderedText = element;
				onAsyncRender = options?.asyncRenderCallback;
				return { element, dispose() { } };
			}
		}();
		const hidden: boolean[] = [];
		let readingPosition: number | undefined;
		withWidget(({ domNode, editor, widget }) => {
			const button = domNode.querySelector<HTMLElement>('.agent-feedback-widget-expand')!;
			hidden.push(Boolean(button.hidden));
			for (const width of [240, 760]) {
				editor.getContainerDomNode().style.width = `${width}px`;
				editor.layout({ width, height: 420 });
				widget.relayout();
				hidden.push(Boolean(button.hidden));
			}
			for (const value of ['Review feedback '.repeat(50), text]) {
				renderedText!.textContent = value;
				onAsyncRender!();
				hidden.push(Boolean(button.hidden));
			}
			renderedText!.textContent = 'Review feedback '.repeat(200);
			onAsyncRender!();
			widget.expand();
			const body = domNode.querySelector<HTMLElement>('.agent-feedback-widget-body')!;
			body.scrollTop = 100;
			onAsyncRender!();
			readingPosition = body.scrollTop;
		}, { ...comment, text }, { renderEditor: true, expanded: false, markdownRenderer });
		assert.deepStrictEqual({ hidden, readingPosition }, { hidden: [true, false, true, false, true], readingPosition: 100 });
	});

	test('reveals navigated cards within an overflowing stack', () => {
		const comments = Array.from({ length: 10 }, (_, index) => ({
			...comment,
			id: `agentFeedback:feedback-${index}`,
			sourceId: `feedback-${index}`,
		}));
		let result: { movedToLast: boolean; lastCardVisible: boolean; returnedToFirst: boolean; editorUnchanged: boolean } | undefined;
		withWidget(({ domNode, editor, widget }) => {
			const body = domNode.querySelector<HTMLElement>('.agent-feedback-widget-body')!;
			const editorScrollTop = editor.getScrollTop();
			widget.focusFeedback(comments[9].id);
			editor.render();
			const bounds = body.getBoundingClientRect();
			const last = body.lastElementChild!.getBoundingClientRect();
			const movedToLast = body.scrollTop > 0;
			const lastCardVisible = last.top >= bounds.top - 1 && last.bottom <= bounds.bottom + 1;
			widget.focusFeedback(comments[0].id);
			result = { movedToLast, lastCardVisible, returnedToFirst: body.scrollTop === 0, editorUnchanged: editor.getScrollTop() === editorScrollTop };
		}, comment, {
			renderEditor: true,
			expanded: false,
			comments,
			lines: Array.from({ length: 80 }, (_, index) => `Line ${index + 1}`),
		});
		assert.deepStrictEqual(result, { movedToLast: true, lastCardVisible: true, returnedToFirst: true, editorUnchanged: true });
	});

	test('preserves the reading position when focusing an already-visible long card', () => {
		let scrollTop: number | undefined;
		withWidget(({ domNode, editor, widget }) => {
			editor.render();
			const body = domNode.querySelector<HTMLElement>('.agent-feedback-widget-body')!;
			body.scrollTop = 100;
			widget.focusFeedback(comment.id);
			scrollTop = body.scrollTop;
		}, {
			...comment,
			text: Array.from({ length: 40 }, () => 'A paragraph of review feedback that needs scrolling.').join('\n\n'),
		}, { renderEditor: true });
		assert.strictEqual(scrollTop, 100);
	});

	test('updates scrollability as a composer grows and shrinks', () => {
		const states: ReturnType<typeof getScrollState>[] = [];
		withWidget(({ domNode, editor }) => {
			triggerAction(domNode, 'codicon-edit');
			const textarea = composer(domNode)!;
			type(textarea, Array.from({ length: 50 }, () => 'A line of draft feedback.').join('\n'));
			states.push(getScrollState(domNode, editor));
			type(textarea, 'A short edit');
			states.push(getScrollState(domNode, editor));
		}, comment, { renderEditor: true });
		assert.deepStrictEqual(states, [{
			fitsEditor: true, scrolls: true, endVisible: true, overflow: 'auto',
			role: 'region', label: 'Scrollable comments', tabIndex: 0,
		}, {
			fitsEditor: true, scrolls: false, endVisible: true, overflow: 'visible',
			role: null, label: null, tabIndex: -1,
		}]);
	});

	test('spaces header action buttons on the spacing ramp', () => {
		withWidget(({ domNode }) => {
			domNode.style.setProperty('--vscode-spacing-size40', '4px');
			const container = domNode.querySelector<HTMLElement>('.agent-feedback-widget-item-actions .actions-container')!;
			const bounds = Array.from(container.children, action => action.getBoundingClientRect());

			assert.deepStrictEqual({
				columnGap: mainWindow.getComputedStyle(container).columnGap,
				buttonGaps: bounds.slice(1).map((current, index) => current.left - bounds[index].right),
			}, { columnGap: '4px', buttonGaps: [4, 4] });
		});
	});

	test('keeps overflow controls visible without hover or focus', () => {
		const variants = [
			{ kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted },
			{ kind: AgentFeedbackKind.AgentReview, state: AgentFeedbackState.Created },
			{ kind: AgentFeedbackKind.AgentReview, state: AgentFeedbackState.Accepted },
			{ kind: AgentFeedbackKind.PRReview, state: AgentFeedbackState.Created },
			{ kind: AgentFeedbackKind.PRReview, state: AgentFeedbackState.Accepted },
		];
		const presentations = variants.map(variant => {
			let presentation: Pick<CSSStyleDeclaration, 'opacity' | 'visibility' | 'pointerEvents'> | undefined;
			withWidget(({ domNode }) => {
				// Position away from the pointer so hover cannot reveal the action.
				domNode.style.left = '-10000px';
				const overflow = domNode.querySelector<HTMLElement>('.codicon-agent-feedback-more')!;
				const style = mainWindow.getComputedStyle(overflow);
				presentation = { opacity: style.opacity, visibility: style.visibility, pointerEvents: style.pointerEvents };
			}, { ...comment, ...variant }, { expanded: false });
			return { ...variant, ...presentation };
		});

		assert.deepStrictEqual(presentations, variants.map(variant => ({
			...variant, opacity: '1', visibility: 'visible', pointerEvents: 'auto',
		})));
	});

	test('uses the PR-comment glyph for pull request review cards', () => {
		let presentation: { defaultIcon: IconContribution['defaults'] | undefined; semanticIcon: boolean; ariaHidden: string | null } | undefined;
		withWidget(({ domNode }) => {
			const icon = domNode.querySelector('.agent-feedback-widget-review-icon')!;
			presentation = {
				defaultIcon: getIconRegistry().getIcon('agent-feedback-pr-review')?.defaults,
				semanticIcon: icon.classList.contains('codicon-agent-feedback-pr-review'),
				ariaHidden: icon.getAttribute('aria-hidden'),
			};
		}, { ...comment, kind: AgentFeedbackKind.PRReview });
		assert.deepStrictEqual(presentation, {
			defaultIcon: { id: 'git-pull-request-comment' },
			semanticIcon: true,
			ariaHidden: 'true',
		});
	});

	for (const { kind, author, state, expectedAuthor, expectedStatus, expectedActions } of [
		{ kind: AgentFeedbackKind.PRReview, author: 'copilot-pull-request-reviewer[bot]', state: AgentFeedbackState.Created, expectedAuthor: 'Copilot (AI)', expectedStatus: '', expectedActions: ['More Actions...', 'Share Comment with Agent', 'Delete'] },
		{ kind: AgentFeedbackKind.PRReview, author: 'reviewer', state: AgentFeedbackState.Accepted, expectedAuthor: '@reviewer', expectedStatus: 'Accepted', expectedActions: ['More Actions...', 'Delete'] },
		{ kind: AgentFeedbackKind.AgentReview, author: undefined, state: AgentFeedbackState.Accepted, expectedAuthor: 'Agent (AI)', expectedStatus: '', expectedActions: ['More Actions...', 'Delete'] },
		{ kind: AgentFeedbackKind.UserReview, author: undefined, state: AgentFeedbackState.Submitted, expectedAuthor: 'You', expectedStatus: 'Investigating', expectedActions: [] },
	]) {
		test(`renders ${kind} comment in the ${state} state`, () => {
			withWidget(({ domNode }) => {
				assert.deepStrictEqual({
					author: domNode.querySelector('.agent-feedback-widget-author')?.textContent,
					status: domNode.querySelector('.agent-feedback-widget-status')?.textContent,
					actions: [...domNode.querySelectorAll('.agent-feedback-widget-item-actions .action-label')].map(action => action.getAttribute('aria-label')),
					reviewIcon: domNode.querySelector('.agent-feedback-widget-review-icon')?.getAttribute('aria-hidden') ?? null,
				}, {
					author: expectedAuthor, status: expectedStatus, actions: expectedActions,
					reviewIcon: kind === AgentFeedbackKind.PRReview ? 'true' : null,
				});
			}, { ...comment, kind, author, state });
		});
	}

	test('expands and collapses a long preview without navigating or truncating its full text', () => {
		const longComment = { ...comment, text: 'A detailed review comment that wraps over several lines. '.repeat(12) };
		withWidget(({ domNode, widget, navigations }) => {
			const text = domNode.querySelector<HTMLElement>('.agent-feedback-widget-text')!;
			const button = domNode.querySelector<HTMLElement>('.agent-feedback-widget-expand')!;
			const collapsedHeight = text.clientHeight;
			const before = {
				hidden: button.hidden,
				expanded: button.getAttribute('aria-expanded'),
				truncated: text.scrollHeight > text.clientHeight,
				lineClamp: mainWindow.getComputedStyle(text).webkitLineClamp,
				threeLines: Math.abs(text.clientHeight - parseFloat(mainWindow.getComputedStyle(text).lineHeight) * 3) <= 1,
				label: button.textContent,
			};
			dispatchEnter(button);
			const after = {
				expanded: button.getAttribute('aria-expanded'),
				truncated: text.scrollHeight > text.clientHeight,
				heightIncreased: text.clientHeight > collapsedHeight,
				label: button.textContent,
				widgetExpanded: widget.isExpanded,
			};
			button.click();

			assert.deepStrictEqual({
				before,
				after,
				collapsedAgain: text.clientHeight === collapsedHeight && button.getAttribute('aria-expanded') === 'false',
				content: text.textContent,
				navigations,
			}, {
				before: { hidden: false, expanded: 'false', truncated: true, lineClamp: '3', threeLines: true, label: 'See more' },
				after: { expanded: 'true', truncated: false, heightIncreased: true, label: 'See less', widgetExpanded: true },
				collapsedAgain: true, content: longComment.text, navigations: [],
			});
		}, longComment, { expanded: false });
	});

	test('expands grouped comment previews independently', () => {
		const longText = 'This review explains the issue in enough detail to wrap. '.repeat(8);
		withWidget(({ domNode }) => {
			const buttons = [...domNode.querySelectorAll<HTMLElement>('.agent-feedback-widget-expand')];
			buttons[0].click();
			assert.deepStrictEqual(buttons.map(button => button.getAttribute('aria-expanded')), ['true', 'false']);
		}, comment, {
			expanded: false,
			comments: [{ ...comment, text: longText }, { ...comment, id: 'agentFeedback:feedback-2', sourceId: 'feedback-2', text: longText }],
		});
	});

	test('keeps short comments free of expansion chrome when revealed', () => {
		withWidget(({ domNode }) => {
			assert.strictEqual(domNode.querySelector<HTMLElement>('.agent-feedback-widget-expand')?.hidden, true);
		});
	});

	test('expands suggestions and replies with a trailing control describing every content region', () => {
		withWidget(({ domNode }) => {
			const item = domNode.querySelector<HTMLElement>('.agent-feedback-widget-item')!;
			const button = domNode.querySelector<HTMLElement>('.agent-feedback-widget-expand')!;
			const text = domNode.querySelector<HTMLElement>('.agent-feedback-widget-text')!;
			const suggestion = domNode.querySelector<HTMLElement>('.agent-feedback-widget-suggestion')!;
			const replies = domNode.querySelector<HTMLElement>('.agent-feedback-widget-replies')!;
			const before = [suggestion, replies].map(element => mainWindow.getComputedStyle(element).display);
			button.click();

			assert.deepStrictEqual({
				before,
				after: [suggestion, replies].map(element => mainWindow.getComputedStyle(element).display),
				controls: button.getAttribute('aria-controls')?.split(' '),
				trailingControl: item.lastElementChild === button,
				expanded: button.getAttribute('aria-expanded'),
			}, {
				before: ['none', 'none'],
				after: ['flex', 'flex'],
				controls: [text.id, suggestion.id, replies.id],
				trailingControl: true,
				expanded: 'true',
			});
		}, {
			...comment,
			suggestion: { edits: [{ range: comment.range, oldText: 'old', newText: 'new' }] },
			replies: [{ text: 'An agent reply', author: 'agent' }],
		}, { expanded: false });
	});

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
			const hideAction = domNode.querySelector<HTMLElement>('.agent-feedback-widget-item-actions .action-label.codicon-agent-feedback-hide');
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

	test('accepting a PR comment uses its header action and restores focus', () => {
		const createdComment: ISessionEditorComment = { ...comment, kind: AgentFeedbackKind.PRReview, state: AgentFeedbackState.Created };
		withWidget(({ domNode, acceptedFeedbackIds }) => {
			domNode.querySelector<HTMLElement>('.action-label.codicon-agent-feedback-accept')!.click();
			assert.deepStrictEqual({
				acceptedFeedbackIds,
				status: domNode.querySelector('.agent-feedback-widget-status')?.textContent,
				acceptAction: domNode.querySelector('.action-label.codicon-agent-feedback-accept'),
				footer: domNode.querySelector('.agent-feedback-widget-actions-bar'),
				focused: mainWindow.document.activeElement === domNode.querySelector('.agent-feedback-widget-item'),
			}, {
				acceptedFeedbackIds: [comment.sourceId], status: 'Accepted', acceptAction: null, footer: null, focused: true,
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
		withWidget(({ domNode, dismissedPRCommentIds, removedFeedbackIds }) => {
			const deleteButton = domNode.querySelector<HTMLElement>('.action-label.codicon-agent-feedback-delete');
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
			author: 'reviewer',
		};
	}

	test('preserves pull request identity when editing a PR comment', () => {
		const sourcePullRequest = { owner: 'owner', repo: 'repo', number: 42 };
		withWidget(({ domNode, sourcePullRequests, sourceAuthors }) => {
			triggerAction(domNode, 'codicon-edit');
			const textarea = composer(domNode)!;
			type(textarea, 'Edited PR comment');
			dispatchEnter(textarea);

			assert.deepStrictEqual({ sourcePullRequests, sourceAuthors }, { sourcePullRequests: [sourcePullRequest], sourceAuthors: ['reviewer'] });
		}, prReviewComment(sourcePullRequest));
	});

	test('preserves pull request identity when replying to a PR comment', () => {
		const sourcePullRequest = { owner: 'owner', repo: 'repo', number: 42 };
		withWidget(({ domNode, sourcePullRequests, sourceAuthors }) => {
			triggerAction(domNode, 'codicon-comment-discussion');
			const textarea = composer(domNode)!;
			type(textarea, 'Reply to PR comment');
			dispatchEnter(textarea);

			assert.deepStrictEqual({ sourcePullRequests, sourceAuthors }, { sourcePullRequests: [sourcePullRequest], sourceAuthors: ['reviewer'] });
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
