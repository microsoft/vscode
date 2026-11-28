/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { ICodeEditor, IDiffEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';
import { Comment, CommentMode, CommentThread, CommentThreadChangedEvent, CommentThreadCollapsibleState } from '../../../../../editor/common/languages.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ICommentController, ICommentService } from '../../../../../workbench/contrib/comments/browser/commentService.js';
import { CommentController } from '../../../../../workbench/contrib/comments/browser/commentsController.js';
import { CommentContextKeys } from '../../../../../workbench/contrib/comments/common/commentContextKeys.js';
import { AGENTS_WINDOW_EDITOR_COMMENTS_SETTING } from '../../../../../workbench/contrib/comments/common/commentsConfiguration.js';
import { AgentFeedbackWorkbenchCommentsContribution, registerAgentFeedbackWorkbenchCommentActions } from '../../browser/agentFeedbackWorkbenchComments.js';
import { AGENTS_WINDOW_PR_COMMENTS_SETTING } from '../../browser/agentFeedbackEditorUtils.js';
import { IAgentFeedbackChangeEvent, IAgentFeedbackCommentRevealEvent, IAgentFeedbackContext, IAgentFeedbackService } from '../../../../../workbench/contrib/sessions/browser/agentFeedback.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback } from '../../../../../workbench/contrib/sessions/browser/agentFeedbackModel.js';
import { ICodeReviewService, ICodeReviewSuggestion, IPRReviewCommentTarget, IPRReviewState, PRReviewStateKind } from '../../../../../workbench/contrib/sessions/browser/codeReviewService.js';
import { IGitHubPullRequestRef } from '../../../../../workbench/services/sessions/common/session.js';

suite('Agent Feedback Workbench Comments', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

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

	function createFeedbackService(initialFeedback: readonly IAgentFeedback[] = [], visibleResolvedFeedbackIds: ReadonlySet<string> = new Set(), calls: string[] = []) {
		let feedback = initialFeedback;
		let isAgentHostSession = false;
		let addedFeedbackText: string | undefined;
		let addedFeedback: { readonly range: IRange; readonly context: IAgentFeedbackContext | undefined } | undefined;
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
				return isAgentHostSession;
			}
			override hasLoadedFeedback(): boolean {
				return true;
			}
			override addFeedback(_sessionResource: URI, _resource: URI, range: IRange, text: string, _suggestion?: ICodeReviewSuggestion, context?: IAgentFeedbackContext): IAgentFeedback {
				addedFeedbackText = text;
				addedFeedback = { range, context };
				calls.push(`addFeedback:${text}`);
				return { id: 'added', text, resourceUri: resource, range: new Range(5, 1, 5, 5), sessionResource, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted };
			}
			override acceptFeedback(_sessionResource: URI, feedbackId: string): void {
				calls.push(`acceptFeedback:${feedbackId}`);
			}
			override updateFeedback(_sessionResource: URI, feedbackId: string, text: string): void {
				calls.push(`updateFeedback:${feedbackId}:${text}`);
			}
			override addReply(_sessionResource: URI, feedbackId: string, text: string): void {
				calls.push(`addReply:${feedbackId}:${text}`);
			}
			override removeFeedback(_sessionResource: URI, feedbackId: string): void {
				calls.push(`removeFeedback:${feedbackId}`);
			}
			override hideFeedbackInEditor(_sessionResource: URI, feedbackId: string): void {
				calls.push(`hideFeedbackInEditor:${feedbackId}`);
			}
			override setNavigationAnchor(_sessionResource: URI, itemId: string | undefined): void {
				calls.push(`setNavigationAnchor:${itemId}`);
			}
		}();
		const setFeedback = (newFeedback: readonly IAgentFeedback[]) => {
			feedback = newFeedback;
			onDidChangeFeedback.fire({ sessionResource, feedbackItems: newFeedback });
		};
		const reveal = (commentId: string) => onDidRevealSessionComment.fire({ sessionResource, commentId, resourceUri: resource });
		const setAgentHostSession = (value: boolean) => {
			isAgentHostSession = value;
		};
		return { feedbackService, setFeedback, reveal, setAgentHostSession, getAddedFeedbackText: () => addedFeedbackText, getAddedFeedback: () => addedFeedback };
	}

	function createCodeReviewService(calls: string[] = [], initialPullRequests: readonly IGitHubPullRequestRef[] = []) {
		const prReviewState = observableValue<IPRReviewState>('prReviewState', { kind: PRReviewStateKind.None });
		let pullRequests = initialPullRequests;
		let isNextTargetsRequestCancelled = false;
		const codeReviewService = new class extends mock<ICodeReviewService>() {
			override getPRReviewState() {
				return prReviewState;
			}
			override getPRReviewCommentPullRequests(): readonly IGitHubPullRequestRef[] {
				return pullRequests;
			}
			override async getPRReviewCommentTargets(_sessionResource: URI, _resource: URI, range: IRange, _currentContent: string, pullRequest?: Pick<IGitHubPullRequestRef, 'owner' | 'repo' | 'number'>): Promise<readonly IPRReviewCommentTarget[]> {
				calls.push(`getPRReviewCommentTargets:${Range.lift(range)}:#${pullRequest?.number ?? 'any'}`);
				if (isNextTargetsRequestCancelled) {
					isNextTargetsRequestCancelled = false;
					throw new CancellationError();
				}
				// Only the second line is part of the pull request's diff.
				return range.startLineNumber === 2
					? pullRequests
						.filter(candidate => !pullRequest || candidate.number === pullRequest.number)
						.map(target => ({ pullRequest: target, commitId: 'commit', path: 'file.ts', startLine: undefined, line: 2, pendingReview: undefined }))
					: [];
			}
			override async createPRReviewComment(target: IPRReviewCommentTarget, body: string): Promise<void> {
				calls.push(`createPRReviewComment:#${target.pullRequest.number}:${target.line}:${body}`);
			}
			override async resolvePRReviewThread(_sessionResource: URI, commentId: string): Promise<void> {
				calls.push(`resolvePRReviewThread:${commentId}`);
			}
			override markPRReviewCommentConverted(_sessionResource: URI, commentId: string): void {
				calls.push(`markPRReviewCommentConverted:${commentId}`);
			}
		}();
		const cancelNextTargetsRequest = () => {
			isNextTargetsRequestCancelled = true;
		};
		const setPullRequests = (value: readonly IGitHubPullRequestRef[]) => {
			pullRequests = value;
		};
		return { codeReviewService, prReviewState, cancelNextTargetsRequest, setPullRequests };
	}

	const codeEditorService = new class extends mock<ICodeEditorService>() {
		override getFocusedCodeEditor(): ICodeEditor | null {
			return null;
		}
		override listCodeEditors(): readonly ICodeEditor[] {
			return [];
		}
	}();

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
		const contribution = store.add(new AgentFeedbackWorkbenchCommentsContribution(commentService, feedbackService, codeReviewService, modelService, codeEditorService, configurationService));

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
		const contribution = store.add(new AgentFeedbackWorkbenchCommentsContribution(commentService, feedbackService, codeReviewService, modelService, codeEditorService, configurationService));

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
				canReply: true,
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
		const contribution = store.add(new AgentFeedbackWorkbenchCommentsContribution(commentService, feedbackService, codeReviewService, modelService, codeEditorService, configurationService));

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
		const { feedbackService, reveal, setAgentHostSession } = createFeedbackService([
			{ id: 'open', text: 'Please change this', resourceUri: resource, range: new Range(2, 1, 2, 5), sessionResource, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted },
			{ id: 'resolved', text: 'Done', resourceUri: resource, range: new Range(3, 1, 3, 5), sessionResource, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Resolved },
			// An Agent Host mirrors pull request review comments as agent feedback.
			{ id: 'mirrored', text: 'Use a helper', resourceUri: resource, range: new Range(5, 1, 5, 5), sessionResource, kind: AgentFeedbackKind.PRReview, sourcePRReviewCommentId: 'mirroredReview', sourcePRReviewCommentAuthor: 'reviewer', state: AgentFeedbackState.Created },
		], new Set(['resolved']));
		const { codeReviewService, prReviewState } = createCodeReviewService();
		const configurationService = new TestConfigurationService({ [AGENTS_WINDOW_EDITOR_COMMENTS_SETTING]: true });
		const contribution = store.add(new AgentFeedbackWorkbenchCommentsContribution(commentService, feedbackService, codeReviewService, modelService, codeEditorService, configurationService));

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
		// The editor doesn't show the review comments of an Agent Host session whose feedback has loaded, which mirrors them.
		setAgentHostSession(true);
		prReviewState.set({ kind: PRReviewStateKind.Loading }, undefined);

		assert.deepStrictEqual({
			revealedBeforeCreation,
			revealedAfterCreation,
			commentingRangesUpdates,
			commentingRangesUpdatesInAgentHostSession: getCommentingRangesUpdates(),
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
			commentingRangesUpdatesInAgentHostSession: 1,
			threads: [
				{ threadId: 'agentFeedback:open', label: 'Agent Feedback', canReply: true, collapsibleState: CommentThreadCollapsibleState.Expanded, comments: [{ body: new MarkdownString('Please change this'), userName: 'You' }] },
				{ threadId: 'agentFeedback:resolved', label: 'Agent Feedback', canReply: false, collapsibleState: CommentThreadCollapsibleState.Expanded, comments: [{ body: new MarkdownString('Done'), userName: 'You' }] },
				{ threadId: 'prReview:review', label: 'Pull Request Review', canReply: true, collapsibleState: CommentThreadCollapsibleState.Expanded, comments: [{ body: new MarkdownString('Use a constant'), userName: 'reviewer' }] },
				{ threadId: 'agentFeedback:mirrored', label: 'Pull Request Review', canReply: true, collapsibleState: CommentThreadCollapsibleState.Expanded, comments: [{ body: new MarkdownString('Use a helper'), userName: 'reviewer' }] },
			],
		});
	});

	test('offers the actions of the agent feedback widget on each comment', async () => {
		store.add(registerAgentFeedbackWorkbenchCommentActions());
		const calls: string[] = [];
		const { commentService } = createCommentService();
		const feedback = (id: string, line: number, kind: AgentFeedbackKind, state: AgentFeedbackState): IAgentFeedback => ({ id, text: id, resourceUri: resource, range: new Range(line, 1, line, 5), sessionResource, kind, state });
		const { feedbackService } = createFeedbackService([
			{ ...feedback('created', 2, AgentFeedbackKind.AgentReview, AgentFeedbackState.Created), replies: [{ text: 'More', author: 'user' }] },
			feedback('accepted', 3, AgentFeedbackKind.UserReview, AgentFeedbackState.Accepted),
			feedback('resolved', 4, AgentFeedbackKind.UserReview, AgentFeedbackState.Resolved),
			feedback('submitted', 5, AgentFeedbackKind.UserReview, AgentFeedbackState.Submitted),
		], new Set(['resolved']), calls);
		const { codeReviewService, prReviewState } = createCodeReviewService(calls);
		prReviewState.set({
			kind: PRReviewStateKind.Loaded,
			incompletePullRequests: [],
			comments: [{ id: 'review', pullRequest: { owner: 'owner', repo: 'repo', number: 1, uri: URI.parse('https://github.com/owner/repo/pull/1') }, uri: resource, range: new Range(6, 1, 6, 1), body: 'Use a constant', author: 'reviewer' }],
		}, undefined);
		const configurationService = new TestConfigurationService({ [AGENTS_WINDOW_EDITOR_COMMENTS_SETTING]: true });
		const contribution = store.add(new AgentFeedbackWorkbenchCommentsContribution(commentService, feedbackService, codeReviewService, modelService, codeEditorService, configurationService));
		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection([ICommentService, commentService])));

		const threads = new Map((await contribution.getDocumentComments(resource)).threads.map(thread => [thread.threadId, thread]));
		const getMenu = (menuId: MenuId, comment: Comment | undefined) => {
			const values: Record<string, unknown> = {
				[ChatContextKeys.enabled.key]: true,
				[CommentContextKeys.commentControllerContext.key]: 'vscode.agentFeedback',
				[CommentContextKeys.commentContext.key]: comment?.contextValue,
			};
			const context: IContext = { getValue: <T>(key: string) => values[key] as T | undefined };
			return MenuRegistry.getMenuItems(menuId)
				.filter(isIMenuItem)
				.filter(item => item.command.id.startsWith('agentFeedback.comment.') && (item.when?.evaluate(context) ?? true))
				.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || (a.order ?? 0) - (b.order ?? 0))
				.map(item => `${item.group}: ${typeof item.command.title === 'string' ? item.command.title : item.command.title.value}`);
		};
		const menus = Object.fromEntries([...threads].map(([threadId, thread]) => [threadId, (thread.comments ?? []).map(comment => getMenu(MenuId.CommentTitle, comment))]));
		const editMenu = getMenu(MenuId.CommentActions, threads.get('agentFeedback:accepted')?.comments?.[0]);

		const run = (id: string, threadId: string, text?: string) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, { thread: threads.get(threadId), commentUniqueId: 1, text }));
		const getMode = () => threads.get('agentFeedback:accepted')?.comments?.[0].mode;
		await run('agentFeedback.comment.share', 'agentFeedback:created');
		await run('agentFeedback.comment.edit', 'agentFeedback:accepted');
		const modeWhileEditing = getMode();
		await run('agentFeedback.comment.saveEdit', 'agentFeedback:accepted', ' Edited ');
		const modeAfterSaving = getMode();
		await contribution.submitCommentThread(threads.get('agentFeedback:accepted')!, ' Added ');
		await run('agentFeedback.comment.delete', 'agentFeedback:accepted');
		await run('agentFeedback.comment.hide', 'agentFeedback:resolved');
		await run('agentFeedback.comment.resolvePullRequestComment', 'prReview:review');
		await run('agentFeedback.comment.share', 'prReview:review');

		assert.deepStrictEqual({
			menus,
			editMenu,
			modeWhileEditing,
			modeAfterSaving,
			replyLabel: contribution.getSubmitCommentThreadLabel(threads.get('agentFeedback:accepted')!),
			calls,
		}, {
			menus: {
				'agentFeedback:created': [
					['1_modify: Edit', '2_share: Share Comment with Agent', '2_share: Delete', 'inline: Share Comment with Agent', 'inline: Delete'],
					[],
				],
				'agentFeedback:accepted': [['1_modify: Edit', '2_share: Delete', 'inline: Edit', 'inline: Delete']],
				'agentFeedback:resolved': [['inline: Hide']],
				'agentFeedback:submitted': [[]],
				'prReview:review': [['1_modify: Edit', '2_share: Share Comment with Agent', '2_share: Resolve PR Comment', 'inline: Share Comment with Agent', 'inline: Resolve PR Comment']],
			},
			editMenu: ['inline: Save', 'inline: Cancel'],
			modeWhileEditing: CommentMode.Editing,
			modeAfterSaving: CommentMode.Preview,
			replyLabel: 'Add to Comment',
			calls: [
				'acceptFeedback:created',
				'setNavigationAnchor:agentFeedback:created',
				'updateFeedback:accepted:Edited',
				'addReply:accepted:Added',
				'removeFeedback:accepted',
				'hideFeedbackInEditor:resolved',
				'resolvePRReviewThread:review',
				'addFeedback:Use a constant',
				'setNavigationAnchor:agentFeedback:added',
				'markPRReviewCommentConverted:review',
			],
		});
	});

	test('gives the agent the code of a new comment from the editor it was written in', async () => {
		const { commentService } = createCommentService();
		const { feedbackService, getAddedFeedback } = createFeedbackService();
		const { codeReviewService } = createCodeReviewService();
		const model = store.add(createTextModel('const first = 1;\nconst second = 2;\n', null, undefined, resource));
		const textModelService = new class extends mock<IModelService>() {
			override getModel(): ITextModel {
				return model;
			}
		}();
		const editor = new class extends mock<ICodeEditor>() {
			override getId(): string {
				return 'editor';
			}
			override getModel(): ITextModel {
				return model;
			}
		}();
		const editorService = new class extends mock<ICodeEditorService>() {
			override getFocusedCodeEditor(): ICodeEditor | null {
				return null;
			}
			override listCodeEditors(): readonly ICodeEditor[] {
				return [editor];
			}
			override listDiffEditors(): readonly IDiffEditor[] {
				return [];
			}
		}();
		const configurationService = new TestConfigurationService({ [AGENTS_WINDOW_EDITOR_COMMENTS_SETTING]: true });
		const contribution = store.add(new AgentFeedbackWorkbenchCommentsContribution(commentService, feedbackService, codeReviewService, textModelService, editorService, configurationService));

		// Clicking the gutter of a line without a selection comments on an empty range at its start.
		await contribution.createCommentThreadTemplate(resource, new Range(2, 1, 2, 1), 'editor');
		const template = (await contribution.getDocumentComments(resource)).threads.find(thread => thread.isTemplate);
		assert.ok(template);
		await contribution.submitCommentThread(template, 'Use a constant');

		assert.deepStrictEqual(getAddedFeedback(), {
			range: new Range(2, 1, 2, 18),
			context: { codeSelection: 'const second = 2;', diffHunks: undefined },
		});
	});

	test('offers adding a new comment to a pull request on the lines of its changes when the setting offers it and no other comment provider does', async () => {
		store.add(registerAgentFeedbackWorkbenchCommentActions());
		const calls: string[] = [];
		const { commentService, commentChanges } = createCommentService();
		const { feedbackService } = createFeedbackService([], new Set(), calls);
		const pullRequest: IGitHubPullRequestRef = { owner: 'owner', repo: 'repo', number: 1, uri: URI.parse('https://github.com/owner/repo/pull/1') };
		const { codeReviewService, prReviewState, cancelNextTargetsRequest, setPullRequests } = createCodeReviewService(calls, [pullRequest]);
		const model = store.add(createTextModel('const first = 1;\nconst second = 2;\n', null, undefined, resource));
		const textModelService = new class extends mock<IModelService>() {
			override getModel(): ITextModel {
				return model;
			}
		}();
		let commentingOwners = ['vscode.agentFeedback'];
		const editor = new class extends mock<ICodeEditor>() {
			override getId(): string {
				return 'editor';
			}
			override getModel(): ITextModel {
				return model;
			}
			override getContribution<T extends IEditorContribution>(): T | null {
				return null;
			}
		}();
		sinon.stub(editor, 'getContribution').returns(new class extends mock<CommentController>() {
			override getCommentingOwners(): string[] {
				return commentingOwners;
			}
		}());
		const editorService = new class extends mock<ICodeEditorService>() {
			override getFocusedCodeEditor(): ICodeEditor | null {
				return null;
			}
			override listCodeEditors(): readonly ICodeEditor[] {
				return [editor];
			}
		}();
		const configurationService = new TestConfigurationService({ [AGENTS_WINDOW_EDITOR_COMMENTS_SETTING]: true, [AGENTS_WINDOW_PR_COMMENTS_SETTING]: false });
		const contribution = store.add(new AgentFeedbackWorkbenchCommentsContribution(commentService, feedbackService, codeReviewService, textModelService, editorService, configurationService));
		const notificationService = new class extends mock<INotificationService>() {
			override warn(message: string): void {
				calls.push(`warn:${message}`);
			}
			override error(message: string): void {
				calls.push(`error:${message}`);
			}
		}();
		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[ICommentService, commentService],
			[INotificationService, notificationService],
			[IQuickInputService, new class extends mock<IQuickInputService>() { }()],
		)));

		const createTemplate = async (line: number) => {
			const changeCount = commentChanges.length;
			await contribution.createCommentThreadTemplate(resource, new Range(line, 1, line, 1));
			// GitHub is asked whether the changes of the pull request include the line once the thread is shown.
			await timeout(0);
			return commentChanges[changeCount].added[0];
		};
		const isOffered = (thread: CommentThread) => {
			const values: Record<string, unknown> = {
				[ChatContextKeys.enabled.key]: true,
				[CommentContextKeys.commentControllerContext.key]: 'vscode.agentFeedback',
				[CommentContextKeys.commentThreadContext.key]: thread.contextValue,
			};
			const context: IContext = { getValue: <T>(key: string) => values[key] as T | undefined };
			return MenuRegistry.getMenuItems(MenuId.CommentThreadActions)
				.filter(isIMenuItem)
				.some(item => item.command.id === 'agentFeedback.commentThread.addPullRequestComment' && (item.when?.evaluate(context) ?? true));
		};
		// The comment widget keeps what was written when the action is cancelled.
		const addPRComment = async (thread: CommentThread, text: string) => {
			try {
				await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('agentFeedback.commentThread.addPullRequestComment')!.handler(accessor, { thread, text }));
				return 'added';
			} catch (error) {
				return isCancellationError(error) ? 'kept' : String(error);
			}
		};

		const getTemplateState = (thread: CommentThread) => ({ label: thread.label, isOffered: isOffered(thread) });

		// The editor asks for the comments of the file before a new comment is written in it.
		await contribution.getDocumentComments(resource);
		const withoutSetting = await createTemplate(2);
		const templateWithoutSetting = getTemplateState(withoutSetting);
		contribution.deleteCommentThreadMain(withoutSetting.threadId);
		configurationService.setUserConfiguration(AGENTS_WINDOW_PR_COMMENTS_SETTING, true);
		// Right after the window loads, the session's pull request may not be known yet.
		setPullRequests([]);
		const inDiff = await createTemplate(2);
		const outsideDiff = await createTemplate(1);
		const templateBeforePullRequestIsKnown = getTemplateState(inDiff);
		// Once it is, signing in to GitHub replaces its client, which cancels the requests that it was making.
		setPullRequests([pullRequest]);
		cancelNextTargetsRequest();
		prReviewState.set({ kind: PRReviewStateKind.Loading }, undefined);
		await timeout(0);
		const templateWhileSigningIn = getTemplateState(inDiff);
		// The review comments load once GitHub answers with its new client.
		prReviewState.set({ kind: PRReviewStateKind.Loaded, comments: [], incompletePullRequests: [] }, undefined);
		await timeout(0);
		// The user picks between agent feedback and another comment provider, such as the GitHub Pull Requests extension.
		commentingOwners = ['github', 'vscode.agentFeedback'];
		const commentableByOthers = await createTemplate(2);
		const templateCommentableByOthers = getTemplateState(commentableByOthers);
		contribution.deleteCommentThreadMain(commentableByOthers.threadId);
		commentingOwners = ['vscode.agentFeedback'];
		// The comment widget updates the range of a new comment before each of its actions runs, even when it hasn't moved.
		await contribution.updateCommentThreadTemplate(inDiff.commentThreadHandle, new Range(2, 1, 2, 1));
		await timeout(0);

		assert.deepStrictEqual({
			templateWithoutSetting,
			templateBeforePullRequestIsKnown,
			templateWhileSigningIn,
			templateOutsideDiff: getTemplateState(outsideDiff),
			templateInDiff: getTemplateState(inDiff),
			templateCommentableByOthers,
			changedTemplates: commentChanges.flatMap(change => change.changed).map(thread => thread.threadId),
			inDiff: await addPRComment(inDiff, ' Use a constant '),
			remainingTemplates: (await contribution.getDocumentComments(resource)).threads.filter(thread => thread.isTemplate).map(thread => thread.threadId),
			calls,
		}, {
			templateWithoutSetting: { label: 'Agent Feedback', isOffered: false },
			templateBeforePullRequestIsKnown: { label: 'Agent Feedback', isOffered: false },
			templateWhileSigningIn: { label: 'Agent Feedback', isOffered: false },
			templateOutsideDiff: { label: 'Agent Feedback', isOffered: false },
			templateInDiff: { label: 'New Comment', isOffered: true },
			templateCommentableByOthers: { label: 'Agent Feedback', isOffered: false },
			changedTemplates: [inDiff.threadId, inDiff.threadId],
			inDiff: 'added',
			remainingTemplates: [outsideDiff.threadId],
			calls: [
				// The review comments load again after the client is replaced, which cancels the check of the comment in the diff.
				'getPRReviewCommentTargets:[2,1 -> 2,18]:#any',
				'getPRReviewCommentTargets:[1,1 -> 1,17]:#any',
				// They have loaded.
				'getPRReviewCommentTargets:[2,1 -> 2,18]:#any',
				'getPRReviewCommentTargets:[1,1 -> 1,17]:#any',
				'getPRReviewCommentTargets:[2,1 -> 2,18]:#1',
				'createPRReviewComment:#1:2:Use a constant',
			],
		});
	});
});
