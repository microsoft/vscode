/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range, IRange } from '../../../../../editor/common/core/range.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { addCommentToolName, deleteCommentsToolName, listCommentsToolName, registerAgentFeedbackTools, resolveCommentsToolName } from '../../browser/agentFeedbackTools.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { ILanguageModelToolsService, IToolData, IToolImpl, IToolInvocation, IToolResult } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

suite('AgentFeedbackTools', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.parse('agent-session:/session-1');
	const fileA = URI.file('/workspace/a.ts');
	const fileB = URI.file('/workspace/b.ts');

	class TestAgentFeedbackService extends mock<IAgentFeedbackService>() {
		items: IAgentFeedback[] = [
			{ id: 'comment-a', text: 'Fix this', resourceUri: fileA, range: new Range(3, 1, 3, 12), sessionResource, kind: AgentFeedbackKind.AgentReview, state: AgentFeedbackState.Accepted },
			{ id: 'comment-b', text: 'Consider rename', resourceUri: fileB, range: new Range(8, 2, 8, 20), sessionResource, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted },
		];

		override addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string, _suggestion?: unknown, _context?: unknown, _sourcePRReviewCommentId?: string, kind: AgentFeedbackKind = AgentFeedbackKind.UserReview, state: AgentFeedbackState = AgentFeedbackState.Accepted): IAgentFeedback {
			const feedback: IAgentFeedback = { id: `comment-${this.items.length + 1}`, text, resourceUri, range, sessionResource, kind, state };
			this.items.push(feedback);
			return feedback;
		}

		override getFeedback(resource: URI): readonly IAgentFeedback[] {
			return this.items.filter(item => item.sessionResource.toString() === resource.toString());
		}

		override removeFeedback(resource: URI, feedbackId: string): void {
			this.items = this.items.filter(item => item.sessionResource.toString() !== resource.toString() || item.id !== feedbackId);
		}

		override setFeedbackResolved(resource: URI, feedbackId: string, resolved: boolean): void {
			const nextState = resolved ? AgentFeedbackState.Resolved : AgentFeedbackState.Submitted;
			this.items = this.items.map(item =>
				item.sessionResource.toString() === resource.toString() && item.id === feedbackId
					? { ...item, state: nextState }
					: item);
		}
	}

	class TestSessionsManagementService extends mock<ISessionsManagementService>() {
		constructor(private readonly _sessions: readonly ISession[] = [createSession(sessionResource, [createChat(sessionResource)])]) {
			super();
		}

		override getSessionForChatResource(resource: URI): { session: ISession; chat: IChat } | undefined {
			for (const session of this._sessions) {
				const chat = session.chats.get().find(chat => chat.resource.toString() === resource.toString());
				if (chat) {
					return { session, chat };
				}
			}
			return undefined;
		}
	}

	function createChat(resource: URI): IChat {
		return upcastPartial<IChat>({ resource });
	}

	function createSession(resource: URI, chats: readonly IChat[]): ISession {
		return upcastPartial<ISession>({
			resource,
			chats: constObservable(chats),
			mainChat: constObservable(chats[0]),
		});
	}

	function createCommentTools(feedbackService = new TestAgentFeedbackService(), sessionsManagementService = new TestSessionsManagementService()): { addTool: IToolImpl; listTool: IToolImpl; deleteTool: IToolImpl; resolveTool: IToolImpl; feedbackService: TestAgentFeedbackService } {
		let addTool: IToolImpl | undefined;
		let listTool: IToolImpl | undefined;
		let deleteTool: IToolImpl | undefined;
		let resolveTool: IToolImpl | undefined;
		const toolsService = new class extends mock<ILanguageModelToolsService>() {
			override registerTool(toolData: IToolData, toolImpl: IToolImpl) {
				if (toolData.toolReferenceName === addCommentToolName) {
					addTool = toolImpl;
				} else if (toolData.toolReferenceName === listCommentsToolName) {
					listTool = toolImpl;
				} else if (toolData.toolReferenceName === deleteCommentsToolName) {
					deleteTool = toolImpl;
				} else if (toolData.toolReferenceName === resolveCommentsToolName) {
					resolveTool = toolImpl;
				}
				return toDisposable(() => { });
			}
		};
		disposables.add(registerAgentFeedbackTools(toolsService, feedbackService, sessionsManagementService));
		assert.ok(addTool, 'addComment tool should be registered');
		assert.ok(listTool, 'listComments tool should be registered');
		assert.ok(deleteTool, 'deleteComments tool should be registered');
		assert.ok(resolveTool, 'resolveComments tool should be registered');
		return { addTool, listTool, deleteTool, resolveTool, feedbackService };
	}

	async function invoke(tool: IToolImpl, toolId: string, parameters: Record<string, unknown>, chatResource = sessionResource): Promise<IToolResult> {
		const invocation: IToolInvocation = {
			callId: 'call-1',
			toolId,
			parameters,
			context: { sessionResource: chatResource },
		};
		return tool.invoke(invocation, async () => 0, { report: () => { } }, CancellationToken.None);
	}

	function textResult(result: IToolResult): string {
		assert.strictEqual(result.content.length, 1);
		const part = result.content[0];
		assert.strictEqual(part.kind, 'text');
		return part.value;
	}

	test('adds comments as created agent feedback', async () => {
		const { addTool, feedbackService } = createCommentTools();

		await invoke(addTool, addCommentToolName, {
			resourceUri: fileA.toString(),
			range: { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 12 },
			text: 'Needs a guard',
		});

		const created = feedbackService.items.find(item => item.text === 'Needs a guard');
		assert.deepStrictEqual(created && { kind: created.kind, state: created.state, resourceUri: created.resourceUri.toString() }, {
			kind: 'codeReview',
			state: AgentFeedbackState.Created,
			resourceUri: fileA.toString(),
		});
	});

	test('lists feedback comments for the current session', async () => {
		const { listTool } = createCommentTools();

		const result = await invoke(listTool, listCommentsToolName, {});
		const parsed = JSON.parse(textResult(result)) as { comments: Array<{ id: string; resourceUri: string; text: string; kind: string }> };

		assert.deepStrictEqual(parsed.comments.map(comment => ({ id: comment.id, resourceUri: comment.resourceUri, text: comment.text, kind: comment.kind })), [
			{ id: 'comment-a', resourceUri: fileA.toString(), text: 'Fix this', kind: 'codeReview' },
			{ id: 'comment-b', resourceUri: fileB.toString(), text: 'Consider rename', kind: 'user' },
		]);
	});

	test('omits created comments from the list', async () => {
		const { addTool, listTool, feedbackService } = createCommentTools();

		await invoke(addTool, addCommentToolName, {
			resourceUri: fileA.toString(),
			range: { startLineNumber: 5, startColumn: 1, endLineNumber: 5, endColumn: 2 },
			text: 'Pending suggestion',
		});

		const result = await invoke(listTool, listCommentsToolName, {});
		const parsed = JSON.parse(textResult(result)) as { comments: Array<{ id: string }> };

		assert.deepStrictEqual({
			created: feedbackService.items.some(item => item.text === 'Pending suggestion' && item.state === AgentFeedbackState.Created),
			listed: parsed.comments.map(comment => comment.id),
		}, {
			created: true,
			listed: ['comment-a', 'comment-b'],
		});
	});

	test('deletes requested feedback comments', async () => {
		const { deleteTool, feedbackService } = createCommentTools();

		const result = await invoke(deleteTool, deleteCommentsToolName, { commentIds: ['comment-a', 'missing'] });
		const parsed = JSON.parse(textResult(result)) as { deletedCommentIds: string[]; notFoundCommentIds: string[]; remainingComments: Array<{ id: string }> };

		assert.deepStrictEqual(parsed.deletedCommentIds, ['comment-a']);
		assert.deepStrictEqual(parsed.notFoundCommentIds, ['missing']);
		assert.deepStrictEqual(parsed.remainingComments.map(comment => comment.id), ['comment-b']);
		assert.deepStrictEqual(feedbackService.items.map(comment => comment.id), ['comment-b']);
	});

	test('resolves and unresolves requested feedback comments', async () => {
		const { resolveTool, feedbackService } = createCommentTools();

		const resolveResult = await invoke(resolveTool, resolveCommentsToolName, { commentIds: ['comment-a', 'missing'] });
		const parsedResolve = JSON.parse(textResult(resolveResult)) as { resolved: boolean; updatedCommentIds: string[]; notFoundCommentIds: string[]; comments: Array<{ id: string; resolved: boolean }> };

		assert.deepStrictEqual({
			resolved: parsedResolve.resolved,
			updated: parsedResolve.updatedCommentIds,
			notFound: parsedResolve.notFoundCommentIds,
			comments: parsedResolve.comments.map(comment => ({ id: comment.id, resolved: comment.resolved })),
		}, {
			resolved: true,
			updated: ['comment-a'],
			notFound: ['missing'],
			comments: [{ id: 'comment-a', resolved: true }, { id: 'comment-b', resolved: false }],
		});

		const unresolveResult = await invoke(resolveTool, resolveCommentsToolName, { commentIds: ['comment-a'], resolved: false });
		const parsedUnresolve = JSON.parse(textResult(unresolveResult)) as { resolved: boolean; comments: Array<{ id: string; resolved: boolean }> };

		assert.deepStrictEqual({
			resolved: parsedUnresolve.resolved,
			comments: parsedUnresolve.comments.map(comment => ({ id: comment.id, resolved: comment.resolved })),
		}, {
			resolved: false,
			comments: [{ id: 'comment-a', resolved: false }, { id: 'comment-b', resolved: false }],
		});
		assert.strictEqual(feedbackService.items.find(item => item.id === 'comment-a')?.state, AgentFeedbackState.Submitted);
	});

	test('routes tool calls from a chat to the session that owns that chat', async () => {
		const sessionAResource = URI.parse('agent-session:/session-a');
		const sessionBResource = URI.parse('agent-session:/session-b');
		const sessionAChat = createChat(URI.parse('agent-chat:/session-a/chat-1'));
		const sessionBChat1 = createChat(URI.parse('agent-chat:/session-b/chat-1'));
		const sessionBChat2 = createChat(URI.parse('agent-chat:/session-b/chat-2'));
		const feedbackService = new TestAgentFeedbackService();
		feedbackService.items = [
			{ id: 'session-a-comment', text: 'Wrong session', resourceUri: fileA, range: new Range(1, 1, 1, 1), sessionResource: sessionAResource, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted },
			{ id: 'session-b-comment', text: 'Right session', resourceUri: fileB, range: new Range(2, 1, 2, 1), sessionResource: sessionBResource, kind: AgentFeedbackKind.AgentReview, state: AgentFeedbackState.Accepted },
		];
		const sessionsManagementService = new TestSessionsManagementService([
			createSession(sessionAResource, [sessionAChat]),
			createSession(sessionBResource, [sessionBChat1, sessionBChat2]),
		]);
		const { addTool, listTool, deleteTool } = createCommentTools(feedbackService, sessionsManagementService);

		const listResult = await invoke(listTool, listCommentsToolName, {}, sessionBChat2.resource);
		const parsedList = JSON.parse(textResult(listResult)) as { comments: Array<{ id: string }> };
		await invoke(addTool, addCommentToolName, {
			resourceUri: fileB.toString(),
			range: { startLineNumber: 4, startColumn: 1, endLineNumber: 4, endColumn: 5 },
			text: 'From second chat',
		}, sessionBChat1.resource);
		const deleteResult = await invoke(deleteTool, deleteCommentsToolName, { commentIds: ['session-b-comment'] }, sessionBChat2.resource);
		const parsedDelete = JSON.parse(textResult(deleteResult)) as { deletedCommentIds: string[]; remainingComments: Array<{ id: string }> };

		const createdComment = feedbackService.items.find(comment => comment.text === 'From second chat');
		assert.deepStrictEqual({
			listed: parsedList.comments.map(comment => comment.id),
			addedSessionResource: createdComment?.sessionResource.toString(),
			createdState: createdComment?.state,
			deleted: parsedDelete.deletedCommentIds,
			remaining: parsedDelete.remainingComments.map(comment => comment.id),
			allFeedback: feedbackService.items.map(comment => comment.id),
		}, {
			listed: ['session-b-comment'],
			addedSessionResource: sessionBResource.toString(),
			createdState: AgentFeedbackState.Created,
			deleted: ['session-b-comment'],
			remaining: [],
			allFeedback: ['session-a-comment', 'comment-3'],
		});
	});
});
