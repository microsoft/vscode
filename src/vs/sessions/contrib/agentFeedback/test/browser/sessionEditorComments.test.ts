/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getResourceEditorComments, getSessionEditorComments, groupNearbySessionEditorComments, hasAcceptedAgentFeedbackComments, SessionEditorCommentSource } from '../../browser/sessionEditorComments.js';
import { AgentFeedbackKind, AgentFeedbackState } from '../../browser/agentFeedbackService.js';
import { IPRReviewState, PRReviewStateKind } from '../../../codeReview/browser/codeReviewService.js';

suite('SessionEditorComments', () => {
	const session = URI.parse('test://session/1');
	const fileA = URI.parse('file:///a.ts');
	const fileB = URI.parse('file:///b.ts');

	ensureNoDisposablesAreLeakedInTestSuite();

	test('merges and sorts feedback and PR review comments by resource and range', () => {
		const prState: IPRReviewState = {
			kind: PRReviewStateKind.Loaded,
			comments: [
				{ id: 'review-a', uri: fileA, range: new Range(3, 1, 3, 1), body: 'review a', author: 'reviewer' },
				{ id: 'review-b', uri: fileB, range: new Range(2, 1, 2, 1), body: 'review b', author: 'reviewer' },
			],
		};
		const comments = getSessionEditorComments(session, [
			{ id: 'feedback-b', text: 'feedback b', resourceUri: fileB, range: new Range(8, 1, 8, 1), sessionResource: session, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted },
			{ id: 'feedback-a', text: 'feedback a', resourceUri: fileA, range: new Range(12, 1, 12, 1), sessionResource: session, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted },
		], prState);

		assert.deepStrictEqual(comments.map(comment => `${comment.resourceUri.path}:${comment.range.startLineNumber}:${comment.source}`), [
			'/a.ts:3:prReview',
			'/a.ts:12:agentFeedback',
			'/b.ts:2:prReview',
			'/b.ts:8:agentFeedback',
		]);
	});

	test('groups nearby comments only within the same resource', () => {
		const prState: IPRReviewState = {
			kind: PRReviewStateKind.Loaded,
			comments: [
				{ id: 'review-a', uri: fileA, range: new Range(13, 1, 13, 1), body: 'review a', author: 'reviewer' },
				{ id: 'review-b', uri: fileB, range: new Range(11, 1, 11, 1), body: 'review b', author: 'reviewer' },
			],
		};
		const comments = getSessionEditorComments(session, [
			{ id: 'feedback-a', text: 'feedback a', resourceUri: fileA, range: new Range(10, 1, 10, 1), sessionResource: session, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted },
		], prState);

		const groups = groupNearbySessionEditorComments(comments, 5);
		assert.strictEqual(groups.length, 2);
		assert.deepStrictEqual(groups[0].map(comment => `${comment.resourceUri.path}:${comment.range.startLineNumber}:${comment.source}`), [
			'/a.ts:10:agentFeedback',
			'/a.ts:13:prReview',
		]);
		assert.deepStrictEqual(groups[1].map(comment => `${comment.resourceUri.path}:${comment.range.startLineNumber}:${comment.source}`), [
			'/b.ts:11:prReview',
		]);
	});

	test('filters resource comments and detects authored feedback presence', () => {
		const prState: IPRReviewState = {
			kind: PRReviewStateKind.Loaded,
			comments: [
				{ id: 'review-b', uri: fileB, range: new Range(2, 1, 2, 1), body: 'review b', author: 'reviewer' },
			],
		};
		const comments = getSessionEditorComments(session, [
			{ id: 'feedback-a', text: 'feedback a', resourceUri: fileA, range: new Range(1, 1, 1, 1), sessionResource: session, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted },
		], prState);

		assert.strictEqual(hasAcceptedAgentFeedbackComments(comments), true);
		assert.deepStrictEqual(getResourceEditorComments(fileA, comments).map(comment => comment.source), [SessionEditorCommentSource.AgentFeedback]);
		assert.deepStrictEqual(getResourceEditorComments(fileB, comments).map(comment => comment.source), [SessionEditorCommentSource.PRReview]);
	});

	test('includes PR review comments when prReviewState is loaded', () => {
		const prState: IPRReviewState = {
			kind: PRReviewStateKind.Loaded,
			comments: [
				{ id: 'pr-thread-1', uri: fileA, range: new Range(5, 1, 5, 1), body: 'Please fix this', author: 'reviewer' },
				{ id: 'pr-thread-2', uri: fileB, range: new Range(1, 1, 1, 1), body: 'Looks wrong', author: 'reviewer' },
			],
		};

		const comments = getSessionEditorComments(session, [], prState);
		assert.strictEqual(comments.length, 2);
		assert.deepStrictEqual(comments.map(c => `${c.resourceUri.path}:${c.range.startLineNumber}:${c.source}`), [
			'/a.ts:5:prReview',
			'/b.ts:1:prReview',
		]);
		assert.strictEqual(comments[0].canConvertToAgentFeedback, true);
	});

	test('merges PR review comments with feedback sorted correctly', () => {
		const prState: IPRReviewState = {
			kind: PRReviewStateKind.Loaded,
			comments: [
				{ id: 'pr-thread-1', uri: fileA, range: new Range(7, 1, 7, 1), body: 'PR comment', author: 'reviewer' },
			],
		};

		const comments = getSessionEditorComments(session, [
			{ id: 'feedback-a', text: 'feedback a', resourceUri: fileA, range: new Range(3, 1, 3, 1), sessionResource: session, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted },
		], prState);

		assert.strictEqual(comments.length, 2);
		assert.deepStrictEqual(comments.map(c => `${c.range.startLineNumber}:${c.source}`), [
			'3:agentFeedback',
			'7:prReview',
		]);
	});

	test('omits PR review comments when prReviewState is not loaded', () => {
		const prState: IPRReviewState = { kind: PRReviewStateKind.None };
		const comments = getSessionEditorComments(session, [], prState);
		assert.strictEqual(comments.length, 0);
	});

	test('excludes resolved feedback from the editor comments', () => {
		const comments = getSessionEditorComments(session, [
			{ id: 'feedback-accepted', text: 'accepted', resourceUri: fileA, range: new Range(2, 1, 2, 1), sessionResource: session, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted },
			{ id: 'feedback-resolved', text: 'resolved', resourceUri: fileA, range: new Range(4, 1, 4, 1), sessionResource: session, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Resolved },
		]);

		assert.deepStrictEqual(comments.map(comment => comment.sourceId), ['feedback-accepted']);
	});

	test('hides a created PR-review mirror and shows the raw PR comment instead', () => {
		const prState: IPRReviewState = {
			kind: PRReviewStateKind.Loaded,
			comments: [
				{ id: 'pr-thread-1', uri: fileA, range: new Range(5, 1, 5, 1), body: 'Please fix this', author: 'reviewer' },
			],
		};
		const comments = getSessionEditorComments(session, [
			{ id: 'mirror-1', text: 'Please fix this', resourceUri: fileA, range: new Range(5, 1, 5, 1), sessionResource: session, kind: AgentFeedbackKind.PRReview, sourcePRReviewCommentId: 'pr-thread-1', state: AgentFeedbackState.Created },
		], prState);

		assert.deepStrictEqual(comments.map(c => `${c.source}:${c.sourceId}`), ['prReview:pr-thread-1']);
	});

	test('shows an accepted PR-review mirror and hides the superseded raw PR comment', () => {
		const prState: IPRReviewState = {
			kind: PRReviewStateKind.Loaded,
			comments: [
				{ id: 'pr-thread-1', uri: fileA, range: new Range(5, 1, 5, 1), body: 'Please fix this', author: 'reviewer' },
			],
		};
		const comments = getSessionEditorComments(session, [
			{ id: 'mirror-1', text: 'Please fix this', resourceUri: fileA, range: new Range(5, 1, 5, 1), sessionResource: session, kind: AgentFeedbackKind.PRReview, sourcePRReviewCommentId: 'pr-thread-1', state: AgentFeedbackState.Accepted },
		], prState);

		assert.deepStrictEqual(comments.map(c => `${c.source}:${c.sourceId}`), ['agentFeedback:mirror-1']);
	});
});
