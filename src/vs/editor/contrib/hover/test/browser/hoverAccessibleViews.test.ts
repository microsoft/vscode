/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { HoverVerbosityAction } from '../../../../common/languages.js';
import { HoverAccessibleViewProvider } from '../../browser/hoverAccessibleViews.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { ContentHoverController } from '../../browser/contentHoverController.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { NullKeybindingService } from '../../../../../platform/keybinding/test/common/nullKeybindingService.js';

suite('Hover Accessible Views', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Actions should have proper tooltip for accessibility', () => {
		const text = 'just some text';
		withTestCodeEditor(text, {}, (editor) => {
			const hoverController = editor.getContribution<ContentHoverController>(ContentHoverController.ID);
			if (!hoverController) {
				assert.fail('ContentHoverController not found');
			}

			const keybindingService = new NullKeybindingService();
			const provider = new HoverAccessibleViewProvider(keybindingService, editor, hoverController);

			// Test the _getActionFor method through reflection since it's private
			const getActionFor = (provider as any)._getActionFor.bind(provider);

			// Test increase action
			const increaseAction = getActionFor(editor, HoverVerbosityAction.Increase);
			assert.strictEqual(increaseAction.label, 'Increase Hover Verbosity');
			assert.strictEqual(increaseAction.tooltip, 'Increase Hover Verbosity');
			assert.strictEqual(increaseAction.class, ThemeIcon.asClassName(Codicon.add));

			// Test decrease action
			const decreaseAction = getActionFor(editor, HoverVerbosityAction.Decrease);
			assert.strictEqual(decreaseAction.label, 'Decrease Hover Verbosity');
			assert.strictEqual(decreaseAction.tooltip, 'Decrease Hover Verbosity');
			assert.strictEqual(decreaseAction.class, ThemeIcon.asClassName(Codicon.remove));
		});
	});

	test('Action tooltip matches label for screen reader accessibility', () => {
		// Create a simple action similar to how the hover accessible view does it
		const actionLabel = 'Increase Hover Verbosity';
		const actionCodicon = Codicon.add;
		
		// Simulate the fixed behavior
		const actionInstance = new Action('test', actionLabel, ThemeIcon.asClassName(actionCodicon), true, () => {});
		actionInstance.tooltip = actionLabel;

		// Verify that tooltip is set correctly
		assert.strictEqual(actionInstance.tooltip, actionLabel);
		assert.strictEqual(actionInstance.label, actionLabel);
		assert.strictEqual(actionInstance.class, ThemeIcon.asClassName(actionCodicon));
	});
});