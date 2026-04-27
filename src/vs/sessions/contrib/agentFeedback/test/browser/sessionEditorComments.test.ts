/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getResourceEditorComments, getSessionEditorComments, groupNearbySessionEditorComments, hasAgentFeedbackComments, SessionEditorCommentSource } from '../../browser/sessionEditorComments.js';
import { ICodeReviewState, CodeReviewStateKind, IPRReviewState, PRReviewStateKind } from '../../../codeReview/browser/codeReviewService.js';

type ICodeReviewResultState = Extract<ICodeReviewState, { kind: CodeReviewStateKind.Result }>;

suite('SessionEditorComments', () => {
	const session = URI.parse('test://session/1');
	const fileA = URI.parse('file:///a.ts');
	const fileB = URI.parse('file:///b.ts');

	ensureNoDisposablesAreLeakedInTestSuite();

	function reviewState(comments: ICodeReviewResultState['comments']): ICodeReviewState {
		return {
			kind: CodeReviewStateKind.Result,
			version: 'v1',
			reviewCount: 1,
			comments,
			didProduceComments: comments.length > 0,
		};
	}

	test('merges and sorts feedback and review comments by resource and range', () => {
		const comments = getSessionEditorComments(session, [
			{ id: 'feedback-b', text: 'feedback b', resourceUri: fileB, range: new Range(8, 1, 8, 1), sessionResource: session },
			{ id: 'feedback-a', text: 'feedback a', resourceUri: fileA, range: new Range(12, 1, 12, 1), sessionResource: session },
		], reviewState([
			{ id: 'review-a', uri: fileA, range: new Range(3, 1, 3, 1), body: 'review a', kind: 'issue', severity: 'warning' },
			{ id: 'review-b', uri: fileB, range: new Range(2, 1, 2, 1), body: 'review b', kind: 'issue', severity: 'warning' },
		]));

		assert.deepStrictEqual(comments.map(comment => `${comment.resourceUri.path}:${comment.range.startLineNumber}:${comment.source}`), [
			'/a.ts:3:codeReview',
			'/a.ts:12:agentFeedback',
			'/b.ts:2:codeReview',
			'/b.ts:8:agentFeedback',
		]);
	});

	test('groups nearby comments only within the same resource', () => {
		const comments = getSessionEditorComments(session, [
			{ id: 'feedback-a', text: 'feedback a', resourceUri: fileA, range: new Range(10, 1, 10, 1), sessionResource: session },
		], reviewState([
			{ id: 'review-a', uri: fileA, range: new Range(13, 1, 13, 1), body: 'review a', kind: 'issue', severity: 'warning' },
			{ id: 'review-b', uri: fileB, range: new Range(11, 1, 11, 1), body: 'review b', kind: 'issue', severity: 'warning' },
		]));

		const groups = groupNearbySessionEditorComments(comments, 5);
		assert.strictEqual(groups.length, 2);
		assert.deepStrictEqual(groups[0].map(comment => `${comment.resourceUri.path}:${comment.range.startLineNumber}:${comment.source}`), [
			'/a.ts:10:agentFeedback',
			'/a.ts:13:codeReview',
		]);
		assert.deepStrictEqual(groups[1].map(comment => `${comment.resourceUri.path}:${comment.range.startLineNumber}:${comment.source}`), [
			'/b.ts:11:codeReview',
		]);
	});

	test('preserves review suggestion metadata and capability flags', () => {
		const comments = getSessionEditorComments(session, [], reviewState([
			{
				id: 'review-suggestion',
				uri: fileA,
				range: new Range(7, 1, 7, 1),
				body: 'prefer a constant',
				kind: 'suggestion',
				severity: 'info',
				suggestion: {
					edits: [{ range: new Range(7, 1, 7, 10), oldText: 'let value', newText: 'const value' }],
				},
			},
		]));

		assert.strictEqual(comments.length, 1);
		assert.strictEqual(comments[0].source, SessionEditorCommentSource.CodeReview);
		assert.strictEqual(comments[0].canConvertToAgentFeedback, true);
		assert.strictEqual(comments[0].suggestion?.edits[0].newText, 'const value');
	});

	test('filters resource comments and detects authored feedback presence', () => {
		const comments = getSessionEditorComments(session, [
			{ id: 'feedback-a', text: 'feedback a', resourceUri: fileA, range: new Range(1, 1, 1, 1), sessionResource: session },
		], reviewState([
			{ id: 'review-b', uri: fileB, range: new Range(2, 1, 2, 1), body: 'review b', kind: 'issue', severity: 'warning' },
		]));

		assert.strictEqual(hasAgentFeedbackComments(comments), true);
		assert.deepStrictEqual(getResourceEditorComments(fileA, comments).map(comment => comment.source), [SessionEditorCommentSource.AgentFeedback]);
		assert.deepStrictEqual(getResourceEditorComments(fileB, comments).map(comment => comment.source), [SessionEditorCommentSource.CodeReview]);
	});

	test('includes PR review comments when prReviewState is loaded', () => {
		const prState: IPRReviewState = {
			kind: PRReviewStateKind.Loaded,
			comments: [
				{ id: 'pr-thread-1', uri: fileA, range: new Range(5, 1, 5, 1), body: 'Please fix this', author: 'reviewer' },
				{ id: 'pr-thread-2', uri: fileB, range: new Range(1, 1, 1, 1), body: 'Looks wrong', author: 'reviewer' },
			],
		};

		const comments = getSessionEditorComments(session, [], reviewState([]), prState);
		assert.strictEqual(comments.length, 2);
		assert.deepStrictEqual(comments.map(c => `${c.resourceUri.path}:${c.range.startLineNumber}:${c.source}`), [
			'/a.ts:5:prReview',
			'/b.ts:1:prReview',
		]);
		assert.strictEqual(comments[0].canConvertToAgentFeedback, true);
	});

	test('merges PR review comments with other sources sorted correctly', () => {
		const prState: IPRReviewState = {
			kind: PRReviewStateKind.Loaded,
			comments: [
				{ id: 'pr-thread-1', uri: fileA, range: new Range(7, 1, 7, 1), body: 'PR comment', author: 'reviewer' },
			],
		};

		const comments = getSessionEditorComments(session, [
			{ id: 'feedback-a', text: 'feedback a', resourceUri: fileA, range: new Range(3, 1, 3, 1), sessionResource: session },
		], reviewState([
			{ id: 'review-a', uri: fileA, range: new Range(10, 1, 10, 1), body: 'review', kind: 'issue', severity: 'warning' },
		]), prState);

		assert.strictEqual(comments.length, 3);
		assert.deepStrictEqual(comments.map(c => `${c.range.startLineNumber}:${c.source}`), [
			'3:agentFeedback',
			'7:prReview',
			'10:codeReview',
		]);
	});

	test('omits PR review comments when prReviewState is not loaded', () => {
		const prState: IPRReviewState = { kind: PRReviewStateKind.None };
		const comments = getSessionEditorComments(session, [], reviewState([]), prState);
		assert.strictEqual(comments.length, 0);
	});
});
