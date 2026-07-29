/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeReviewService } from '../../../codeReview/browser/codeReviewService.js';
import { AgentFeedbackPRThreadResolverContribution } from '../../browser/agentFeedbackPRThreadResolver.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackChangeEvent, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';

suite('AgentFeedbackPRThreadResolverContribution', () => {

	const store = new DisposableStore();
	const session = URI.parse('agent-host-copilot:/session-1');
	const file = URI.file('/workspace/a.ts');

	let onDidChangeFeedback: Emitter<IAgentFeedbackChangeEvent>;
	let resolvedThreads: string[];

	function pr(id: string, state: AgentFeedbackState, threadId: string | undefined = `thread-${id}`): IAgentFeedback {
		return {
			id,
			text: `comment ${id}`,
			resourceUri: file,
			range: new Range(1, 1, 1, 5),
			sessionResource: session,
			kind: AgentFeedbackKind.PRReview,
			sourcePRReviewCommentId: threadId,
			state,
		};
	}

	function fire(...feedbackItems: IAgentFeedback[]): void {
		onDidChangeFeedback.fire({ sessionResource: session, feedbackItems });
	}

	setup(() => {
		onDidChangeFeedback = store.add(new Emitter<IAgentFeedbackChangeEvent>());
		resolvedThreads = [];

		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override onDidChangeFeedback = onDidChangeFeedback.event;
		};
		const codeReviewService = new class extends mock<ICodeReviewService>() {
			override async resolvePRReviewThread(_sessionResource: URI, threadId: string): Promise<void> {
				resolvedThreads.push(threadId);
			}
		};

		store.add(new AgentFeedbackPRThreadResolverContribution(feedbackService, codeReviewService, new NullLogService()));
	});

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves the GitHub thread when a submitted PR comment transitions to resolved', () => {
		fire(pr('1', AgentFeedbackState.Submitted));
		fire(pr('1', AgentFeedbackState.Resolved));

		assert.deepStrictEqual(resolvedThreads, ['thread-1']);
	});

	test('resolves the GitHub thread when a submitted PR comment is deleted', () => {
		fire(pr('1', AgentFeedbackState.Submitted));
		fire(); // deleted

		assert.deepStrictEqual(resolvedThreads, ['thread-1']);
	});

	test('does not resolve when an already-resolved PR comment is first observed (history replay)', () => {
		fire(pr('1', AgentFeedbackState.Resolved));

		assert.deepStrictEqual(resolvedThreads, []);
	});

	test('does not resolve when an unsubmitted PR comment is cleared or discarded', () => {
		fire(pr('1', AgentFeedbackState.Accepted));
		fire(); // cleared

		assert.deepStrictEqual(resolvedThreads, []);
	});

	test('ignores feedback that is not a PR review comment', () => {
		const userComment: IAgentFeedback = {
			id: 'u1',
			text: 'user comment',
			resourceUri: file,
			range: new Range(1, 1, 1, 5),
			sessionResource: session,
			kind: AgentFeedbackKind.UserReview,
			state: AgentFeedbackState.Submitted,
		};
		onDidChangeFeedback.fire({ sessionResource: session, feedbackItems: [userComment] });
		onDidChangeFeedback.fire({ sessionResource: session, feedbackItems: [] });

		assert.deepStrictEqual(resolvedThreads, []);
	});

	test('resolves each thread at most once', () => {
		fire(pr('1', AgentFeedbackState.Submitted));
		fire(pr('1', AgentFeedbackState.Resolved));
		fire(); // deleted after resolve

		assert.deepStrictEqual(resolvedThreads, ['thread-1']);
	});
});
