/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { OS } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { hasUnsubmittedAgentFeedback, registerAgentFeedbackEditorActions, submitFeedbackActionId } from '../../browser/agentFeedbackEditorActions.js';

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
