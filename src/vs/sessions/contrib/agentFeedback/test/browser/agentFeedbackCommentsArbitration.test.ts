/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { CommentThread } from '../../../../../editor/common/languages.js';
import { ICommentInfo, ICommentService } from '../../../../../workbench/contrib/comments/browser/commentService.js';
import { ICommentThreadChangedEvent } from '../../../../../workbench/contrib/comments/common/commentModel.js';
import { AgentFeedbackCommentsArbitrationService, IAgentFeedbackCommentsArbitrationService } from '../../browser/agentFeedbackCommentsArbitration.js';
import { AgentFeedbackWorkbenchCommentsContribution } from '../../browser/agentFeedbackWorkbenchComments.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';

suite('Agent Feedback Comments Arbitration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses one comment UI for a resource', async () => {
		const resource = URI.parse('file:///file.ts');
		const onDidSetDataProvider = store.add(new Emitter<void>());
		const onDidDeleteDataProvider = store.add(new Emitter<string | undefined>());
		const onDidUpdateCommentingRanges = store.add(new Emitter<{ uniqueOwner: string }>());
		const onDidUpdateCommentThreads = store.add(new Emitter<ICommentThreadChangedEvent>());
		const onDidFetchDocumentComments = store.add(new Emitter<{ resource: URI; commentInfos: readonly (ICommentInfo | null)[] }>());
		let commentInfos: ICommentInfo[] = [{
			uniqueOwner: 'extension',
			threads: [],
			commentingRanges: { resource, ranges: [], fileComments: false },
		}];
		const commentService = new class extends mock<ICommentService>() {
			override readonly onDidSetDataProvider = onDidSetDataProvider.event;
			override readonly onDidDeleteDataProvider = onDidDeleteDataProvider.event;
			override readonly onDidUpdateCommentingRanges = onDidUpdateCommentingRanges.event;
			override readonly onDidUpdateCommentThreads = onDidUpdateCommentThreads.event;
			override readonly onDidFetchDocumentComments = onDidFetchDocumentComments.event;
			override getDocumentComments(requestedResource: URI): Promise<ICommentInfo[]> {
				onDidFetchDocumentComments.fire({ resource: requestedResource, commentInfos });
				return Promise.resolve(commentInfos);
			}
			override updateCommentingRanges(): void { }
		}();
		const service = store.add(new AgentFeedbackCommentsArbitrationService(commentService));

		await service.resolve(resource);
		const nativeMode = {
			native: service.usesNativeComments(resource),
			workbench: service.usesWorkbenchComments(resource),
		};

		commentInfos = [{
			uniqueOwner: 'extension',
			threads: [],
			commentingRanges: { resource, ranges: [new Range(1, 1, 2, 1)], fileComments: false },
		}];
		onDidUpdateCommentingRanges.fire({ uniqueOwner: 'extension' });
		const unresolvedMode = {
			native: service.usesNativeComments(resource),
			workbench: service.usesWorkbenchComments(resource),
		};
		await service.resolve(resource);
		const workbenchMode = {
			native: service.usesNativeComments(resource),
			workbench: service.usesWorkbenchComments(resource),
		};
		let modeChanges = 0;
		store.add(service.onDidChange(() => modeChanges++));
		onDidUpdateCommentThreads.fire({
			uniqueOwner: 'extension',
			owner: 'extension',
			ownerLabel: 'Extension',
			added: [],
			removed: [],
			changed: [new class extends mock<CommentThread>() {
				override readonly resource = resource.toString();
			}()],
			pending: [],
		});
		const stableWorkbenchMode = {
			native: service.usesNativeComments(resource),
			workbench: service.usesWorkbenchComments(resource),
			modeChanges,
		};

		commentInfos = [];
		onDidDeleteDataProvider.fire('extension');
		await service.resolve(resource);

		assert.deepStrictEqual({
			nativeMode,
			unresolvedMode,
			workbenchMode,
			stableWorkbenchMode,
			restoredNativeMode: {
				native: service.usesNativeComments(resource),
				workbench: service.usesWorkbenchComments(resource),
			},
		}, {
			nativeMode: { native: true, workbench: false },
			unresolvedMode: { native: false, workbench: false },
			workbenchMode: { native: false, workbench: true },
			stableWorkbenchMode: { native: false, workbench: true, modeChanges: 0 },
			restoredNativeMode: { native: true, workbench: false },
		});
	});

	test('adapts agent feedback only in workbench comments mode', async () => {
		const resource = URI.parse('file:///file.ts');
		const sessionResource = URI.parse('test://session/1');
		const commentService = new class extends mock<ICommentService>() {
			override registerCommentController(): void { }
			override unregisterCommentController(): void { }
			override updateCommentingRanges(): void { }
		}();
		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = Event.None;
			override readonly onDidChangeFeedbackVisibility = Event.None;
			override readonly onDidChangeFeedbackScope = Event.None;
			override getFeedbackSessionResource(): URI {
				return sessionResource;
			}
			override getFeedback() {
				return [
					{
						id: 'feedback',
						text: 'Please change this',
						resourceUri: resource,
						range: new Range(2, 1, 2, 5),
						sessionResource,
						kind: AgentFeedbackKind.UserReview,
						state: AgentFeedbackState.Accepted,
						replies: [{ text: 'Fixed', author: 'agent' as const }],
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
				];
			}
			override getVisibleResolvedFeedbackIds(): ReadonlySet<string> {
				return new Set();
			}
		}();
		let usesWorkbenchComments = true;
		const arbitrationService = new class extends mock<IAgentFeedbackCommentsArbitrationService>() {
			override usesWorkbenchComments(): boolean {
				return usesWorkbenchComments;
			}
		}();
		const contribution = store.add(new AgentFeedbackWorkbenchCommentsContribution(commentService, feedbackService, arbitrationService));

		const workbenchCommentInfo = await contribution.getDocumentComments(resource);
		usesWorkbenchComments = false;
		const nativeCommentInfo = await contribution.getDocumentComments(resource);

		assert.deepStrictEqual({
			workbenchThreads: workbenchCommentInfo.threads.map(thread => ({
				range: thread.range,
				canReply: thread.canReply,
				comments: thread.comments?.map(comment => ({ body: comment.body, userName: comment.userName })),
			})),
			nativeThreads: nativeCommentInfo.threads,
		}, {
			workbenchThreads: [{
				range: new Range(2, 1, 2, 5),
				canReply: false,
				comments: [
					{ body: 'Please change this', userName: 'You' },
					{ body: 'Fixed', userName: 'Agent' },
				],
			}],
			nativeThreads: [],
		});
	});
});
