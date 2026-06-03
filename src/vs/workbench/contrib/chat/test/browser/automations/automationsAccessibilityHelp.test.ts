/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AccessibleViewProviderId, AccessibleViewType } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { AutomationsAccessibilityHelpProvider, AutomationsAccessibilityHelp } from '../../../browser/aiCustomization/automationsAccessibilityHelp.js';

class FakeKeybindingService extends mock<IKeybindingService>() {
	override lookupKeybinding(): undefined {
		return undefined;
	}
}

suite('AutomationsAccessibilityHelp', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('implementation declares the Help type and a when clause', () => {
		const impl = new AutomationsAccessibilityHelp();
		assert.strictEqual(impl.type, AccessibleViewType.Help);
		assert.strictEqual(impl.name, 'automations');
		assert.ok(impl.when, 'expected a when clause so the help only activates in the Automations section');
	});

	test('provider exposes the Automations id and verbosity setting', () => {
		const provider = new AutomationsAccessibilityHelpProvider(new FakeKeybindingService());
		assert.strictEqual(provider.id, AccessibleViewProviderId.Automations);
		assert.strictEqual(provider.verbositySettingKey, AccessibilityVerbositySettingId.Automations);
		assert.strictEqual(provider.options.type, AccessibleViewType.Help);
		provider.dispose();
	});

	test('help content covers actions, dialog, history and settings', () => {
		const provider = new AutomationsAccessibilityHelpProvider(new FakeKeybindingService());
		const content = provider.provideContent();
		assert.match(content, /Automations/);
		assert.match(content, /Run now/);
		assert.match(content, /Show history/);
		assert.match(content, /Create\/Edit Dialog/);
		assert.match(content, /Run History/);
		assert.match(content, /accessibility\.verbosity\.automations/);
		provider.dispose();
	});

	test('help content does not contain unresolved placeholders', () => {
		const provider = new AutomationsAccessibilityHelpProvider(upcastPartial<IKeybindingService>({ lookupKeybinding: () => undefined }));
		const content = provider.provideContent();
		// The string template uses {0} for keybinding insertion; if any
		// placeholder leaks through unresolved that is a content bug.
		assert.doesNotMatch(content, /\{0\}/);
		provider.dispose();
	});
});
