/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfirmation, IConfirmationResult, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IAgentFeedbackService } from '../../../../../workbench/contrib/sessions/browser/agentFeedback.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback } from '../../../../../workbench/contrib/sessions/browser/agentFeedbackModel.js';
import { ICodeReviewService, IPRReviewState, PRReviewStateKind } from '../../../../../workbench/contrib/sessions/browser/codeReviewService.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IVisibleEditorPane } from '../../../../../workbench/common/editor.js';
import { clearAllFeedbackActionId, hasUnsubmittedAgentFeedback, registerAgentFeedbackEditorActions, submitFeedbackActionId } from '../../browser/agentFeedbackEditorActions.js';

// Fill the global registries the way the contribution does, so the assertions below
// inspect the rule that ships rather than a copy of its when clause.
registerAgentFeedbackEditorActions();

const CTRL_CMD_ENTER = decodeKeybinding(KeyMod.CtrlCmd | KeyCode.Enter, OS)!.getHashCode();

/** Minimal {@link IContext} over a plain record of context key values. */
function context(values: Record<string, boolean>): IContext {
	return { getValue: <T>(key: string) => values[key] as T | undefined };
}

suite('Agent Feedback - Submit Feedback keybinding', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('takes Ctrl/Cmd+Enter only in a focused editor holding submittable feedback', () => {
		const rule = KeybindingsRegistry.getDefaultKeybindings()
			.find(item => item.command === submitFeedbackActionId && item.keybinding?.getHashCode() === CTRL_CMD_ENTER);
		const submittable = {
			[ChatContextKeys.enabled.key]: true,
			[IsSessionsWindowContext.key]: true,
			[EditorContextKeys.editorTextFocus.key]: true,
			[hasUnsubmittedAgentFeedback.key]: true,
		};
		const evaluate = (overrides: Record<string, boolean> = {}) => rule?.when?.evaluate(context({ ...submittable, ...overrides })) ?? false;

		assert.deepStrictEqual({
			bound: !!rule,
			// A higher weight than the editor's Insert Line After, so this rule is consulted
			// first and that command keeps the chord everywhere the when clause misses.
			winsOverInsertLineAfter: rule?.weight1,
			submittableFeedback: evaluate(),
			normalWindow: evaluate({ [IsSessionsWindowContext.key]: false }),
			unfocusedEditor: evaluate({ [EditorContextKeys.editorTextFocus.key]: false }),
			fileWithoutFeedback: evaluate({ [hasUnsubmittedAgentFeedback.key]: false }),
			chatDisabled: evaluate({ [ChatContextKeys.enabled.key]: false }),
		}, {
			bound: true,
			winsOverInsertLineAfter: KeybindingWeight.SessionsContrib,
			submittableFeedback: true,
			normalWindow: false,
			unfocusedEditor: false,
			fileWithoutFeedback: false,
			chatDisabled: false,
		});
	});
});

suite('Agent Feedback - Clear All Feedback', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('asks for confirmation with the number of feedback comments, and clears only when confirmed', async () => {
		const sessionResource = URI.parse('agent-host-copilotcli:/session-1');
		const fileResource = URI.file('/workspace/math.ts');
		const feedback = (id: string, line: number, state: AgentFeedbackState): IAgentFeedback => ({
			id, text: `Comment ${id}`, resourceUri: fileResource, range: new Range(line, 1, line, 1), sessionResource, kind: AgentFeedbackKind.UserReview, state,
		});
		// The resolved item is hidden in the editor, so it is not part of the count.
		const items = [feedback('a', 3, AgentFeedbackState.Accepted), feedback('b', 5, AgentFeedbackState.Created), feedback('c', 7, AgentFeedbackState.Resolved)];
		const cleared: string[] = [];
		const confirmations: IConfirmation[] = [];
		let confirmResult = false;

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override readonly activeEditorPane = new class extends mock<IVisibleEditorPane>() {
				override readonly input = new class extends mock<EditorInput>() {
					override get typeId() { return 'test.feedbackInput'; }
					override get resource() { return fileResource; }
				}();
			}();
		}());
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() { }());
		instantiationService.stub(ICodeReviewService, new class extends mock<ICodeReviewService>() {
			override getPRReviewState() { return constObservable<IPRReviewState>({ kind: PRReviewStateKind.None }); }
		}());
		instantiationService.stub(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() {
			override getFeedbackSessionResource() { return sessionResource; }
			override getFeedback() { return items; }
			override getVisibleResolvedFeedbackIds() { return new Set<string>(); }
			override isAgentHostSession() { return true; }
			override hasLoadedFeedback() { return true; }
			override clearFeedback(resource: URI) { cleared.push(resource.toString()); }
		}());
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
				confirmations.push(confirmation);
				return { confirmed: confirmResult };
			}
		}());
		const clearAll = CommandsRegistry.getCommand(clearAllFeedbackActionId)?.handler;
		assert.ok(clearAll);

		await clearAll(instantiationService);
		const clearedAfterCancel = [...cleared];
		confirmResult = true;
		await clearAll(instantiationService);

		assert.deepStrictEqual({
			confirmations: confirmations.map(({ type, message, detail, primaryButton }) => ({ type, message, detail, primaryButton })),
			clearedAfterCancel,
			clearedAfterConfirm: cleared,
		}, {
			confirmations: Array(2).fill({
				type: 'warning',
				message: 'Clear all 2 feedback comments?',
				detail: 'This removes the feedback comments from all files in this session. This action cannot be undone.',
				primaryButton: '&&Clear All',
			}),
			clearedAfterCancel: [],
			clearedAfterConfirm: [sessionResource.toString()],
		});
	});
});
