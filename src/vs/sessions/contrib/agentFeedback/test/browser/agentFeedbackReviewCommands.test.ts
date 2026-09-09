/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { AgentFeedbackReviewCommandId } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ICodeReviewService } from '../../../codeReview/browser/codeReviewService.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { registerAgentFeedbackReviewCommands } from '../../browser/agentFeedbackReviewCommands.js';

suite('AgentFeedbackReviewCommands', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('routes peer chat review commands to the owning session and preserves session resources', async () => {
		const sessionResource = URI.parse('agent-host-copilotcli:/session-1');
		const peerChatResource = sessionResource.with({ fragment: 'peer-chat-1' });
		const fileResource = URI.file('/workspace/file.ts');
		const session = new class extends mock<ISession>() {
			override readonly resource = sessionResource;
		}();
		const chat = new class extends mock<IChat>() {
			override readonly resource = peerChatResource;
		}();
		const feedback: IAgentFeedback = {
			id: 'comment-1',
			text: 'Review this',
			resourceUri: fileResource,
			range: new Range(3, 1, 3, 5),
			sessionResource,
			kind: AgentFeedbackKind.AgentReview,
			state: AgentFeedbackState.Created,
		};

		const operations: string[] = [];
		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override getFeedback(resource: URI): readonly IAgentFeedback[] {
				operations.push(`get:${resource.toString()}`);
				return [feedback];
			}

			override async revealFeedback(resource: URI, feedbackId: string): Promise<void> {
				operations.push(`reveal:${resource.toString()}:${feedbackId}`);
			}

			override removeFeedback(resource: URI, feedbackId: string): void {
				operations.push(`remove:${resource.toString()}:${feedbackId}`);
			}

			override acceptFeedback(resource: URI, feedbackId: string, options?: { readonly revealToAgent?: boolean }): void {
				operations.push(`accept:${resource.toString()}:${feedbackId}:${options?.revealToAgent === true}`);
			}
		}();
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override getSessionForChatResource(resource: URI): { session: ISession; chat: IChat } | undefined {
				return resource.toString() === peerChatResource.toString() ? { session, chat } : undefined;
			}
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAgentFeedbackService, feedbackService);
		instantiationService.stub(ISessionsManagementService, sessionsManagementService);
		instantiationService.stub(ICodeReviewService, new class extends mock<ICodeReviewService>() { });
		store.add(registerAgentFeedbackReviewCommands());

		const getComments = CommandsRegistry.getCommand(AgentFeedbackReviewCommandId.GetComments)?.handler;
		const reveal = CommandsRegistry.getCommand(AgentFeedbackReviewCommandId.Reveal)?.handler;
		const remove = CommandsRegistry.getCommand(AgentFeedbackReviewCommandId.Delete)?.handler;
		const accept = CommandsRegistry.getCommand(AgentFeedbackReviewCommandId.Accept)?.handler;
		assert.ok(getComments && reveal && remove && accept);

		const peerChatComments = getComments(instantiationService, peerChatResource);
		const sessionComments = getComments(instantiationService, sessionResource);
		await reveal(instantiationService, peerChatResource, feedback.id);
		remove(instantiationService, peerChatResource, feedback.id);
		accept(instantiationService, peerChatResource, [feedback.id]);

		assert.deepStrictEqual({
			peerChatComments,
			sessionComments,
			operations,
		}, {
			peerChatComments: [{
				id: 'comment-1',
				kindLabel: 'Agent Review',
				text: 'Review this',
				fileUri: fileResource,
			}],
			sessionComments: [{
				id: 'comment-1',
				kindLabel: 'Agent Review',
				text: 'Review this',
				fileUri: fileResource,
			}],
			operations: [
				`get:${sessionResource.toString()}`,
				`get:${sessionResource.toString()}`,
				`reveal:${sessionResource.toString()}:comment-1`,
				`get:${sessionResource.toString()}`,
				`remove:${sessionResource.toString()}:comment-1`,
				`accept:${sessionResource.toString()}:comment-1:true`,
			],
		});
	});

	test('links pull request review threads to their mirrored comments in any state', () => {
		const sessionResource = URI.parse('agent-host-copilotcli:/session-2');
		const peerChatResource = sessionResource.with({ fragment: 'peer-chat-1' });
		const fileResource = URI.file('/workspace/file.ts');
		const session = new class extends mock<ISession>() {
			override readonly resource = sessionResource;
		}();
		const chat = new class extends mock<IChat>() {
			override readonly resource = peerChatResource;
		}();
		const feedbackItem = (id: string, kind: AgentFeedbackKind, state: AgentFeedbackState, sourcePRReviewCommentId?: string): IAgentFeedback => ({
			id,
			text: 'Review this',
			resourceUri: fileResource,
			range: new Range(3, 1, 3, 5),
			sessionResource,
			kind,
			state,
			...(sourcePRReviewCommentId ? { sourcePRReviewCommentId } : {}),
		});
		const feedback: IAgentFeedback[] = [
			feedbackItem('mirror-created', AgentFeedbackKind.PRReview, AgentFeedbackState.Created, 'PRRT_created'),
			// An addressed thread still links, unlike the `created`-only review list.
			feedbackItem('mirror-submitted', AgentFeedbackKind.PRReview, AgentFeedbackState.Submitted, 'PRRT_submitted'),
			// No pull request thread behind these, so neither is linkable.
			feedbackItem('mirror-without-source', AgentFeedbackKind.PRReview, AgentFeedbackState.Created),
			feedbackItem('agent-review', AgentFeedbackKind.AgentReview, AgentFeedbackState.Created),
		];

		const requestedResources: string[] = [];
		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override getFeedback(resource: URI): readonly IAgentFeedback[] {
				requestedResources.push(resource.toString());
				return feedback;
			}
		}();
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override getSessionForChatResource(resource: URI): { session: ISession; chat: IChat } | undefined {
				return resource.toString() === peerChatResource.toString() ? { session, chat } : undefined;
			}
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAgentFeedbackService, feedbackService);
		instantiationService.stub(ISessionsManagementService, sessionsManagementService);
		instantiationService.stub(ICodeReviewService, new class extends mock<ICodeReviewService>() { });
		store.add(registerAgentFeedbackReviewCommands());

		const getThreadLinks = CommandsRegistry.getCommand(AgentFeedbackReviewCommandId.GetPullRequestThreadLinks)?.handler;
		assert.ok(getThreadLinks);

		const links = getThreadLinks(instantiationService, peerChatResource);

		assert.deepStrictEqual({ links, requestedResources }, {
			links: [
				{ pullRequestThreadId: 'PRRT_created', commentId: 'mirror-created' },
				{ pullRequestThreadId: 'PRRT_submitted', commentId: 'mirror-submitted' },
			],
			requestedResources: [sessionResource.toString()],
		});
	});
});
