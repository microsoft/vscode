/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeyCodeChord } from '../../../../../base/common/keybindings.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyValue } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ISSUE_WIZARD_ADD_SCREENSHOT_COMMAND_ID, IssueWizardCaptureBarActiveContext } from '../../browser/issueWizard.js';
import { IssueReporterOpenContext } from '../../electron-browser/issueReporterEditorPane.js';
import { ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID } from '../../electron-browser/issueReporterKeybindings.js';

suite('Issue Capture Keybindings', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('routes the screenshot shortcut to the visible Issue Wizard capture bar', () => {
		const keybindings = KeybindingsRegistry.getDefaultKeybindings();
		const issueWizardBinding = keybindings.find(binding => binding.command === ISSUE_WIZARD_ADD_SCREENSHOT_COMMAND_ID);
		const issueReporterBinding = keybindings.find(binding => binding.command === ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID);
		if (!issueWizardBinding?.keybinding || !issueWizardBinding.when || !issueReporterBinding?.when) {
			throw new Error('Issue capture keybindings are not registered');
		}

		const chord = issueWizardBinding.keybinding.chords[0];
		if (!(chord instanceof KeyCodeChord)) {
			throw new Error('Issue Wizard screenshot keybinding is not a key-code chord');
		}
		const context = (issueWizardActive: boolean, issueReporterOpen: boolean) => ({
			getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string) => {
				if (key === IssueWizardCaptureBarActiveContext.key) {
					return issueWizardActive as T;
				}
				if (key === IssueReporterOpenContext.key) {
					return issueReporterOpen as T;
				}
				if (key === ChatContextKeys.enabled.key) {
					return true as T;
				}
				return undefined as T;
			},
		});

		assert.deepStrictEqual({
			shortcut: { primaryModifier: chord.ctrlKey || chord.metaKey, shift: chord.shiftKey, alt: chord.altKey, keyCode: chord.keyCode },
			wizardWhenVisible: issueWizardBinding.when.evaluate(context(true, false)),
			wizardWhenHidden: issueWizardBinding.when.evaluate(context(false, false)),
			reporterWhenAlone: issueReporterBinding.when.evaluate(context(false, true)),
			reporterWhenWizardVisible: issueReporterBinding.when.evaluate(context(true, true)),
		}, {
			shortcut: { primaryModifier: true, shift: true, alt: false, keyCode: KeyCode.KeyS },
			wizardWhenVisible: true,
			wizardWhenHidden: false,
			reporterWhenAlone: true,
			reporterWhenWizardVisible: false,
		});
	});
});
