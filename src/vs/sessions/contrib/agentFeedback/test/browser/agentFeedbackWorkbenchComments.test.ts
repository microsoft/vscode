/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
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
import { IAgentFeedbackChangeEvent, IAgentFeedbackService } from '../../../../../workbench/contrib/sessions/browser/agentFeedback.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback } from '../../../../../workbench/contrib/sessions/browser/agentFeedbackModel.js';

suite('Agent Feedback Workbench Comments', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const resource = URI.parse('file:///file.ts');
	const sessionResource = URI.parse('test://session/1');

	function createCommentService(log: string[] = []) {
		const onDidDeleteDataProvider = store.add(new Emitter<string | undefined>());
		const commentChanges: CommentThreadChangedEvent<Range>[] = [];
		let registeredController: ICommentController | undefined;
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
			override updateCommentingRanges(): void { }
			override updateComments(_owner: string, event: CommentThreadChangedEvent<Range>): void {
				commentChanges.push(event);
			}
		}();
		const unregisterAll = () => {
			log.push('unregisterAll');
			registeredController = undefined;
			onDidDeleteDataProvider.fire(undefined);
		};
		return { commentService, commentChanges, unregisterAll };
	}

	function createFeedbackService(initialFeedback: readonly IAgentFeedback[] = []) {
		let feedback = initialFeedback;
		let addedFeedbackText: string | undefined;
		const onDidChangeFeedback = store.add(new Emitter<IAgentFeedbackChangeEvent>());
		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = onDidChangeFeedback.event;
			override readonly onDidChangeFeedbackVisibility = Event.None;
			override readonly onDidChangeFeedbackScope = Event.None;
			override getFeedbackSessionResource(): URI {
				return sessionResource;
			}
			override getFeedback(): readonly IAgentFeedback[] {
				return feedback;
			}
			override getVisibleResolvedFeedbackIds(): ReadonlySet<string> {
				return new Set();
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
		return { feedbackService, setFeedback, getAddedFeedbackText: () => addedFeedbackText };
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
		const configurationService = new TestConfigurationService({ [AGENTS_WINDOW_EDITOR_COMMENTS_SETTING]: false });
		const setEnabled = (enabled: boolean) => {
			log.push(enabled ? 'enable' : 'disable');
			configurationService.setUserConfiguration(AGENTS_WINDOW_EDITOR_COMMENTS_SETTING, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: key => key === AGENTS_WINDOW_EDITOR_COMMENTS_SETTING }));
		};
		const contribution = store.add(new AgentFeedbackWorkbenchCommentsContribution(commentService, feedbackService, modelService, configurationService));

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
		const configurationService = new TestConfigurationService({ [AGENTS_WINDOW_EDITOR_COMMENTS_SETTING]: true });
		const contribution = store.add(new AgentFeedbackWorkbenchCommentsContribution(commentService, feedbackService, modelService, configurationService));

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
					{ body: 'Please change this', userName: 'You' },
					{ body: 'Fixed', userName: 'Agent' },
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
		const configurationService = new TestConfigurationService({ [AGENTS_WINDOW_EDITOR_COMMENTS_SETTING]: true });
		const contribution = store.add(new AgentFeedbackWorkbenchCommentsContribution(commentService, feedbackService, modelService, configurationService));

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
				comments: ['Please change this instead'],
			},
			isDisposed: true,
		});
	});
});
