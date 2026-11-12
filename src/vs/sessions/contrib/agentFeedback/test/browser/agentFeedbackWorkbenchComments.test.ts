/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { CommentThreadChangedEvent, CommentThreadCollapsibleState } from '../../../../../editor/common/languages.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ICommentController, ICommentService } from '../../../../../workbench/contrib/comments/browser/commentService.js';
import { AGENTS_WINDOW_EDITOR_COMMENTS_SETTING } from '../../../../../workbench/contrib/comments/common/commentsConfiguration.js';
import { AgentFeedbackWorkbenchCommentsContribution } from '../../browser/agentFeedbackWorkbenchComments.js';
import { IAgentFeedbackChangeEvent, IAgentFeedbackCommentRevealEvent, IAgentFeedbackService } from '../../../../../workbench/contrib/sessions/browser/agentFeedback.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback } from '../../../../../workbench/contrib/sessions/browser/agentFeedbackModel.js';
import { ICodeReviewService, IPRReviewState, PRReviewStateKind } from '../../../../../workbench/contrib/sessions/browser/codeReviewService.js';

suite('Agent Feedback Workbench Comments', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const resource = URI.parse('file:///file.ts');
	const sessionResource = URI.parse('test://session/1');

	function createCommentService(log: string[] = []) {
		const onDidDeleteDataProvider = store.add(new Emitter<string | undefined>());
		const commentChanges: CommentThreadChangedEvent<Range>[] = [];
		let registeredController: ICommentController | undefined;
		let commentingRangesUpdates = 0;
		const commentService = new class extends mock<ICommentService>() {
			override readonly onDidDeleteDataProvider = onDidDeleteDataProvider.event;
			override registerCommentController(_owner: string, controller: ICommentController): void {
				log.push('register');
				registeredController = controller;
			}
			override unregisterCommentController(): void {
				log.push('unregister');
				registeredController = undefined;
			}
			override getCommentController(): ICommentController | undefined {
				return registeredController;
			}
			override updateCommentingRanges(): void {
				commentingRangesUpdates++;
			}
			override updateComments(_owner: string, event: CommentThreadChangedEvent<Range>): void {
				commentChanges.push(event);
			}
		}();
		const unregisterAll = () => {
			log.push('unregisterAll');
			registeredController = undefined;
			onDidDeleteDataProvider.fire(undefined);
		};
		return { commentService, commentChanges, unregisterAll, getCommentingRangesUpdates: () => commentingRangesUpdates };
	}

	function createFeedbackService(initialFeedback: readonly IAgentFeedback[] = [], visibleResolvedFeedbackIds: ReadonlySet<string> = new Set()) {
		let feedback = initialFeedback;
		let addedFeedbackText: string | undefined;
		const onDidChangeFeedback = store.add(new Emitter<IAgentFeedbackChangeEvent>());
		const onDidRevealSessionComment = store.add(new Emitter<IAgentFeedbackCommentRevealEvent>());
		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = onDidChangeFeedback.event;
			override readonly onDidChangeFeedbackVisibility = Event.None;
			override readonly onDidChangeFeedbackScope = Event.None;
			override readonly onDidRevealSessionComment = onDidRevealSessionComment.event;
			override getFeedbackSessionResource(): URI {
				return sessionResource;
			}
			override getFeedback(): readonly IAgentFeedback[] {
				return feedback;
			}
			override getVisibleResolvedFeedbackIds(): ReadonlySet<string> {
				return visibleResolvedFeedbackIds;
			}
			override isAgentHostSession(): boolean {
				return false;
			}
			override hasLoadedFeedback(): boolean {
				return true;
			}
			override addFeedback(_sessionResource: URI, _resource: URI, _range: IRange, text: string): IAgentFeedback {
				addedFeedbackText = text;
				return { id: 'added', text, resourceUri: resource, range: new Range(5, 1, 5, 5), sessionResource, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted };
			}
		}();
		const setFeedback = (newFeedback: readonly IAgentFeedback[]) => {
			feedback = newFeedback;
			onDidChangeFeedback.fire({ sessionResource, feedbackItems: newFeedback });
		};
		const reveal = (commentId: string) => onDidRevealSessionComment.fire({ sessionResource, commentId, resourceUri: resource });
		return { feedbackService, setFeedback, reveal, getAddedFeedbackText: () => addedFeedbackText };
	}

	function createCodeReviewService() {
		const prReviewState = observableValue<IPRReviewState>('prReviewState', { kind: PRReviewStateKind.None });
		const codeReviewService = new class extends mock<ICodeReviewService>() {
			override getPRReviewState() {
				return prReviewState;
			}
		}();
		return { codeReviewService, prReviewState };
	}

	const modelService = new class extends mock<IModelService>() {
		override getModel(): ITextModel {
			return new class extends mock<ITextModel>() {
				override getFullModelRange(): Range {
					return new Range(1, 1, 20, 1);
				}
			}();
		}
	}();

	test('registers the comment controller only while the setting is enabled', async () => {
		const log: string[] = [];
		const { commentService, unregisterAll } = createCommentService(log);
		const { feedbackService } = createFeedbackService();
		const { codeReviewService } = createCodeReviewService();
		const configurationService = new TestConfigurationService({ [AGENTS_WINDOW_EDITOR_COMMENTS_SETTING]: false });
		const setEnabled = (enabled: boolean) => {
			log.push(enabled ? 'enable' : 'disable');
			configurationService.setUserConfiguration(AGENTS_WINDOW_EDITOR_COMMENTS_SETTING, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: key => key === AGENTS_WINDOW_EDITOR_COMMENTS_SETTING }));
		};
		const contribution = store.add(new AgentFeedbackWorkbenchCommentsContribution(commentService, feedbackService, codeReviewService, modelService, configurationService));

		unregisterAll();
		setEnabled(true);
		await contribution.createCommentThreadTemplate(resource, new Range(1, 1, 1, 1));
		unregisterAll();
		setEnabled(false);
		setEnabled(true);
		const reenabledCommentInfo = await contribution.getDocumentComments(resource);

		assert.deepStrictEqual({
			log,
			reenabledThreads: reenabledCommentInfo.threads,
		}, {
			log: ['unregisterAll', 'enable', 'register', 'unregisterAll', 'register', 'disable', 'unregister', 'enable', 'register'],
			reenabledThreads: [],
		});
	});

	test('adapts agent feedback to comment threads', async () => {
		const { commentService, commentChanges } = createCommentService();
		const { feedbackService, getAddedFeedbackText } = createFeedbackService([
			{
				id: 'feedback',
				text: 'Please change this',
				resourceUri: resource,
				range: new Range(2, 1, 2, 5),
				sessionResource,
				kind: AgentFeedbackKind.UserReview,
				state: AgentFeedbackState.Accepted,
				replies: [{ text: 'Fixed', author: 'agent' }],
			},
			{
				id: 'resolved',
				text: 'Hidden',
				resourceUri: resource,
				range: new Range(3, 1, 3, 5),
				sessionResource,
				kind: AgentFeedbackKind.UserReview,
				state: AgentFeedbackState.Resolved,
			},
		]);
		const { codeReviewService } = createCodeReviewService();
		const configurationService = new TestConfigurationService({ [AGENTS_WINDOW_EDITOR_COMMENTS_SETTING]: true });
		const contribution = store.add(new AgentFeedbackWorkbenchCommentsContribution(commentService, feedbackService, codeReviewService, modelService, configurationService));

		const commentInfo = await contribution.getDocumentComments(resource);
		await contribution.createCommentThreadTemplate(resource, new Range(5, 1, 5, 5));
		const template = (await contribution.getDocumentComments(resource)).threads.find(thread => thread.isTemplate);
		assert.ok(template);
		await contribution.submitCommentThread(template, ' Local feedback ');

		assert.deepStrictEqual({
			commentingRanges: commentInfo.commentingRanges,
			templateCanReply: template.canReply,
			threads: commentInfo.threads.map(thread => ({
				range: thread.range,
				canReply: thread.canReply,
				comments: thread.comments?.map(comment => ({ body: comment.body, userName: comment.userName })),
			})),
			addedFeedbackText: getAddedFeedbackText(),
			commentChanges: commentChanges.map(change => ({
				added: change.added.map(thread => thread.threadId),
				removed: change.removed.map(thread => thread.threadId),
			})),
		}, {
			commentingRanges: {
				resource,
				ranges: [new Range(1, 1, 20, 1)],
				fileComments: false,
				showRangeBar: false,
			},
			templateCanReply: true,
			threads: [{
				range: new Range(2, 1, 2, 5),
				canReply: false,
				comments: [
					{ body: new MarkdownString('Please change this'), userName: 'You' },
					{ body: new MarkdownString('Fixed'), userName: 'Agent' },
				],
			}],
			addedFeedbackText: 'Local feedback',
			commentChanges: [
				{ added: ['agentFeedback-template-1'], removed: [] },
				{ added: [], removed: ['agentFeedback-template-1'] },
			],
		});
	});

	test('keeps a feedback thread and its collapsible state until the feedback is removed', async () => {
		const { commentService } = createCommentService();
		const feedback: IAgentFeedback = { id: 'feedback', text: 'Please change this', resourceUri: resource, range: new Range(2, 1, 2, 5), sessionResource, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted };
		const { feedbackService, setFeedback } = createFeedbackService([feedback]);
		const { codeReviewService } = createCodeReviewService();
		const configurationService = new TestConfigurationService({ [AGENTS_WINDOW_EDITOR_COMMENTS_SETTING]: true });
		const contribution = store.add(new AgentFeedbackWorkbenchCommentsContribution(commentService, feedbackService, codeReviewService, modelService, configurationService));

		const [thread] = (await contribution.getDocumentComments(resource)).threads;
		const initialCollapsibleState = thread.collapsibleState;
		const collapsibleStateChanges: (CommentThreadCollapsibleState | undefined)[] = [];
		store.add(thread.onDidChangeCollapsibleState(state => collapsibleStateChanges.push(state)));
		thread.collapsibleState = CommentThreadCollapsibleState.Collapsed;
		setFeedback([{ ...feedback, text: 'Please change this instead' }]);
		const [refreshedThread] = (await contribution.getDocumentComments(resource)).threads;
		const refreshed = {
			isSameThread: refreshedThread === thread,
			collapsibleState: refreshedThread.collapsibleState,
			comments: refreshedThread.comments?.map(comment => comment.body),
		};
		setFeedback([]);

		assert.deepStrictEqual({ initialCollapsibleState, collapsibleStateChanges, refreshed, isDisposed: thread.isDisposed }, {
			initialCollapsibleState: CommentThreadCollapsibleState.Expanded,
			collapsibleStateChanges: [CommentThreadCollapsibleState.Collapsed],
			refreshed: {
				isSameThread: true,
				collapsibleState: CommentThreadCollapsibleState.Collapsed,
				comments: [new MarkdownString('Please change this instead')],
			},
			isDisposed: true,
		});
	});

	test('shows pull request review comments and expands revealed threads', async () => {
		const { commentService, getCommentingRangesUpdates } = createCommentService();
		const { feedbackService, reveal } = createFeedbackService([
			{ id: 'open', text: 'Please change this', resourceUri: resource, range: new Range(2, 1, 2, 5), sessionResource, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted },
			{ id: 'resolved', text: 'Done', resourceUri: resource, range: new Range(3, 1, 3, 5), sessionResource, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Resolved },
		], new Set(['resolved']));
		const { codeReviewService, prReviewState } = createCodeReviewService();
		const configurationService = new TestConfigurationService({ [AGENTS_WINDOW_EDITOR_COMMENTS_SETTING]: true });
		const contribution = store.add(new AgentFeedbackWorkbenchCommentsContribution(commentService, feedbackService, codeReviewService, modelService, configurationService));

		// Navigation reveals a comment while its editor is still opening, before its thread exists.
		reveal('agentFeedback:resolved');
		const resolvedThread = (await contribution.getDocumentComments(resource)).threads[1];
		const revealedBeforeCreation = resolvedThread.collapsibleState;
		resolvedThread.collapsibleState = CommentThreadCollapsibleState.Collapsed;
		reveal('agentFeedback:resolved');
		const revealedAfterCreation = resolvedThread.collapsibleState;
		prReviewState.set({
			kind: PRReviewStateKind.Loaded,
			incompletePullRequests: [],
			comments: [{ id: 'review', pullRequest: { owner: 'owner', repo: 'repo', number: 1, uri: URI.parse('https://github.com/owner/repo/pull/1') }, uri: resource, range: new Range(4, 1, 4, 1), body: 'Use a constant', author: 'reviewer' }],
		}, undefined);
		const commentingRangesUpdates = getCommentingRangesUpdates();
		const threads = (await contribution.getDocumentComments(resource)).threads;

		assert.deepStrictEqual({
			revealedBeforeCreation,
			revealedAfterCreation,
			commentingRangesUpdates,
			threads: threads.map(thread => ({
				threadId: thread.threadId,
				label: thread.label,
				canReply: thread.canReply,
				collapsibleState: thread.collapsibleState,
				comments: thread.comments?.map(comment => ({ body: comment.body, userName: comment.userName })),
			})),
		}, {
			revealedBeforeCreation: CommentThreadCollapsibleState.Expanded,
			revealedAfterCreation: CommentThreadCollapsibleState.Expanded,
			commentingRangesUpdates: 1,
			threads: [
				{ threadId: 'agentFeedback:open', label: 'Agent Feedback', canReply: false, collapsibleState: CommentThreadCollapsibleState.Expanded, comments: [{ body: new MarkdownString('Please change this'), userName: 'You' }] },
				{ threadId: 'agentFeedback:resolved', label: 'Agent Feedback', canReply: false, collapsibleState: CommentThreadCollapsibleState.Expanded, comments: [{ body: new MarkdownString('Done'), userName: 'You' }] },
				{ threadId: 'prReview:review', label: 'Pull Request Review', canReply: false, collapsibleState: CommentThreadCollapsibleState.Expanded, comments: [{ body: new MarkdownString('Use a constant'), userName: 'reviewer' }] },
			],
		});
	});
});
