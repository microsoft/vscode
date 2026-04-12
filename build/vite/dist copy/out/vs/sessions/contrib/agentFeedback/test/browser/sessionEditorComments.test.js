/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getResourceEditorComments, getSessionEditorComments, groupNearbySessionEditorComments, hasAgentFeedbackComments } from '../../browser/sessionEditorComments.js';
suite('SessionEditorComments', () => {
    const session = URI.parse('test://session/1');
    const fileA = URI.parse('file:///a.ts');
    const fileB = URI.parse('file:///b.ts');
    ensureNoDisposablesAreLeakedInTestSuite();
    function reviewState(comments) {
        return {
            kind: "result" /* CodeReviewStateKind.Result */,
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
        assert.strictEqual(comments[0].source, "codeReview" /* SessionEditorCommentSource.CodeReview */);
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
        assert.deepStrictEqual(getResourceEditorComments(fileA, comments).map(comment => comment.source), ["agentFeedback" /* SessionEditorCommentSource.AgentFeedback */]);
        assert.deepStrictEqual(getResourceEditorComments(fileB, comments).map(comment => comment.source), ["codeReview" /* SessionEditorCommentSource.CodeReview */]);
    });
    test('includes PR review comments when prReviewState is loaded', () => {
        const prState = {
            kind: "loaded" /* PRReviewStateKind.Loaded */,
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
        const prState = {
            kind: "loaded" /* PRReviewStateKind.Loaded */,
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
        const prState = { kind: "none" /* PRReviewStateKind.None */ };
        const comments = getSessionEditorComments(session, [], reviewState([]), prState);
        assert.strictEqual(comments.length, 0);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbkVkaXRvckNvbW1lbnRzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2FnZW50RmVlZGJhY2svdGVzdC9icm93c2VyL3Nlc3Npb25FZGl0b3JDb21tZW50cy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSx3QkFBd0IsRUFBRSxnQ0FBZ0MsRUFBRSx3QkFBd0IsRUFBOEIsTUFBTSx3Q0FBd0MsQ0FBQztBQUtyTSxLQUFLLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFO0lBQ25DLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUM5QyxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ3hDLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7SUFFeEMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxTQUFTLFdBQVcsQ0FBQyxRQUE0QztRQUNoRSxPQUFPO1lBQ04sSUFBSSwyQ0FBNEI7WUFDaEMsT0FBTyxFQUFFLElBQUk7WUFDYixXQUFXLEVBQUUsQ0FBQztZQUNkLFFBQVE7WUFDUixrQkFBa0IsRUFBRSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUM7U0FDdkMsQ0FBQztJQUNILENBQUM7SUFFRCxJQUFJLENBQUMscUVBQXFF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