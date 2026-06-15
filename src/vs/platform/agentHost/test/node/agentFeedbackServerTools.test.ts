/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { FEEDBACK_ANNOTATION_META_KEY } from '../../common/agentFeedbackAnnotations.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import { Annotation, AnnotationsState, SessionStatus, SessionSummary } from '../../common/state/sessionState.js';
import { buildAnnotationsUri } from '../../common/annotationsUri.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentServerToolHost } from '../../node/shared/agentServerToolHost.js';
import {
	addCommentToolName,
	applyFeedbackTool,
	deleteCommentsToolName,
	feedbackServerToolDefinitions,
	feedbackServerToolGroup,
	listCommentsToolName,
	resolveCommentsToolName,
} from '../../node/shared/agentFeedbackServerTools.js';

suite('AgentFeedbackServerTools', () => {

	const sessionResource = 'copilot:/test-session';
	const fileUri = 'file:///workspace/app.ts';

	function annotation(id: string, state: string, resolved = false, text = 'comment'): Annotation {
		return {
			id,
			turnId: '',
			resource: fileUri,
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
			resolved,
			entries: [{ id: `${id}:0`, text }],
			_meta: { [FEEDBACK_ANNOTATION_META_KEY]: { kind: 'codeReview', state, sessionResource } },
		};
	}

	function stateWith(...annotations: Annotation[]): AnnotationsState {
		return { annotations };
	}

	test('addComment produces an AnnotationsSet in the created state with a converted range', () => {
		const outcome = applyFeedbackTool(stateWith(), sessionResource, addCommentToolName, {
			resourceUri: fileUri,
			range: { startLineNumber: 3, startColumn: 2, endLineNumber: 3, endColumn: 10 },
			text: 'please rename',
		});
		assert.strictEqual(outcome.result, 'Comment added.');
		assert.strictEqual(outcome.actions.length, 1);
		const action = outcome.actions[0];
		assert.strictEqual(action.type, ActionType.AnnotationsSet);
		const set = action as Extract<typeof action, { type: ActionType.AnnotationsSet }>;
		assert.deepStrictEqual(set.annotation.range, { start: { line: 2, character: 1 }, end: { line: 2, character: 9 } });
		assert.strictEqual(set.annotation.entries.length, 1);
		assert.strictEqual(set.annotation.entries[0].text, 'please rename');
		assert.deepStrictEqual(set.annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY], { kind: 'codeReview', state: 'created', sessionResource });
	});

	test('listComments hides created items and serializes the rest', () => {
		const state = stateWith(
			annotation('a', 'created', false, 'hidden'),
			annotation('b', 'accepted', false, 'visible'),
		);
		const outcome = applyFeedbackTool(state, sessionResource, listCommentsToolName, {});
		assert.strictEqual(outcome.actions.length, 0);
		assert.deepStrictEqual(JSON.parse(outcome.result), {
			comments: [{
				id: 'b',
				resourceUri: fileUri,
				range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 },
				text: 'visible',
				kind: 'codeReview',
				resolved: false,
			}],
		});
	});

	test('deleteComments removes listable items and reports unknown ids', () => {
		const state = stateWith(
			annotation('a', 'accepted'),
			annotation('b', 'created'),
		);
		const outcome = applyFeedbackTool(state, sessionResource, deleteCommentsToolName, { commentIds: ['a', 'b', 'missing'] });
		// 'b' is in the created state (not listable) so it is treated as not found.
		assert.deepStrictEqual(outcome.actions, [{ type: ActionType.AnnotationsRemoved, annotationId: 'a' }]);
		const parsed = JSON.parse(outcome.result);
		assert.deepStrictEqual(parsed.deletedCommentIds, ['a']);
		assert.deepStrictEqual(parsed.notFoundCommentIds, ['b', 'missing']);
		assert.deepStrictEqual(parsed.remainingComments, []);
	});

	test('resolveComments marks items resolved via AnnotationsSet', () => {
		const state = stateWith(annotation('a', 'accepted'));
		const outcome = applyFeedbackTool(state, sessionResource, resolveCommentsToolName, { commentIds: ['a'] });
		assert.strictEqual(outcome.actions.length, 1);
		const set = outcome.actions[0] as Extract<typeof outcome.actions[0], { type: ActionType.AnnotationsSet }>;
		assert.strictEqual(set.type, ActionType.AnnotationsSet);
		assert.strictEqual(set.annotation.resolved, true);
		assert.deepStrictEqual(set.annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY], { kind: 'codeReview', state: 'resolved', sessionResource });
		const parsed = JSON.parse(outcome.result);
		assert.deepStrictEqual(parsed.updatedCommentIds, ['a']);
		assert.strictEqual(parsed.resolved, true);
	});

	test('resolveComments with resolved=false re-opens the item', () => {
		const state = stateWith(annotation('a', 'resolved', true));
		const outcome = applyFeedbackTool(state, sessionResource, resolveCommentsToolName, { commentIds: ['a'], resolved: false });
		const set = outcome.actions[0] as Extract<typeof outcome.actions[0], { type: ActionType.AnnotationsSet }>;
		assert.strictEqual(set.annotation.resolved, false);
		assert.deepStrictEqual(set.annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY], { kind: 'codeReview', state: 'submitted', sessionResource });
	});

	test('unknown tool name throws', () => {
		assert.throws(() => applyFeedbackTool(stateWith(), sessionResource, 'nope', {}), /Unknown feedback server tool/);
	});

	test('addComment rejects invalid arguments', () => {
		assert.throws(() => applyFeedbackTool(stateWith(), sessionResource, addCommentToolName, { resourceUri: fileUri, text: 'x' }), /range must be an object/);
		assert.throws(() => applyFeedbackTool(stateWith(), sessionResource, addCommentToolName, { resourceUri: '', range: {}, text: 'x' }), /resourceUri must be a non-empty string/);
	});

	test('ignores annotations that do not carry feedback metadata', () => {
		// A non-feedback annotation produced by another feature sharing the
		// generic annotations channel must be invisible to the feedback tools:
		// it is never listed, and delete/resolve treat it as not found rather
		// than mutating it.
		const foreign: Annotation = {
			id: 'foreign',
			turnId: '',
			resource: fileUri,
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
			resolved: false,
			entries: [{ id: 'foreign:0', text: 'not feedback' }],
		};
		const state = stateWith(foreign, annotation('a', 'accepted', false, 'real feedback'));

		const listed = applyFeedbackTool(state, sessionResource, listCommentsToolName, {});
		const deleted = applyFeedbackTool(state, sessionResource, deleteCommentsToolName, { commentIds: ['foreign'] });
		const resolved = applyFeedbackTool(state, sessionResource, resolveCommentsToolName, { commentIds: ['foreign'] });

		assert.deepStrictEqual({
			listedIds: JSON.parse(listed.result).comments.map((c: { id: string }) => c.id),
			deleteActions: deleted.actions,
			deleteNotFound: JSON.parse(deleted.result).notFoundCommentIds,
			resolveActions: resolved.actions,
			resolveNotFound: JSON.parse(resolved.result).notFoundCommentIds,
		}, {
			listedIds: ['a'],
			deleteActions: [],
			deleteNotFound: ['foreign'],
			resolveActions: [],
			resolveNotFound: ['foreign'],
		});
	});

	suite('AgentServerToolHost', () => {

		let disposables: DisposableStore;
		let manager: AgentHostStateManager;
		let host: AgentServerToolHost;

		function makeSummary(): SessionSummary {
			return {
				resource: sessionResource,
				provider: 'copilot',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
			};
		}

		setup(() => {
			disposables = new DisposableStore();
			manager = disposables.add(new AgentHostStateManager(new NullLogService()));
			host = new AgentServerToolHost(manager, [feedbackServerToolGroup]);
		});

		teardown(() => disposables.dispose());

		test('executeTool round-trips a comment into the annotation state', () => {
			host.executeTool(sessionResource, addCommentToolName, {
				resourceUri: fileUri,
				range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 },
				text: 'hello',
			});
			const snapshot = manager.getSnapshot(buildAnnotationsUri(sessionResource));
			const state = snapshot!.state as AnnotationsState;
			assert.strictEqual(state.annotations.length, 1);
			assert.strictEqual(state.annotations[0].entries[0].text, 'hello');
		});

		test('advertise publishes the server tools as server tools', () => {
			manager.createSession(makeSummary());
			host.advertise(sessionResource);
			const state = manager.getSessionState(sessionResource);
			assert.deepStrictEqual(state?.serverTools, feedbackServerToolDefinitions);
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
