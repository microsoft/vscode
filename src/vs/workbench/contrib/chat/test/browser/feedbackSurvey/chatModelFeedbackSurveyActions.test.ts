/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IAction } from '../../../../../../base/common/actions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatModelFeedbackSurveyActionId, focusChatModelFeedbackSurveyAction, IFeedbackSurveyToolBar } from '../../../browser/actions/chatModelFeedbackSurveyActions.js';

suite('ChatModelFeedbackSurveyActions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createToolBar(actionIds: readonly string[]): IFeedbackSurveyToolBar & { focused: number | undefined } {
		return {
			focused: undefined,
			getItemsLength: () => actionIds.length,
			getItemAction: (index: number) => ({ id: actionIds[index] } as IAction),
			focus(index?: number) { this.focused = index; },
		};
	}

	test('focuses the feedback control rather than whichever action comes first', () => {
		// The copy action sits before the survey control in the response footer.
		const toolbar = createToolBar(['workbench.action.chat.copyItem', ChatModelFeedbackSurveyActionId, 'workbench.action.chat.reportIssueForBug']);

		focusChatModelFeedbackSurveyAction(toolbar);

		assert.strictEqual(toolbar.focused, 1);
	});

	test('falls back to the toolbar when the control is not shown', () => {
		const toolbar = createToolBar(['workbench.action.chat.copyItem']);

		focusChatModelFeedbackSurveyAction(toolbar);

		assert.strictEqual(toolbar.focused, undefined);
	});
});
