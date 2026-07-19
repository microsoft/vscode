/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { AutomationsAccessibilityHelp, buildAutomationsHelpContent } from '../../../browser/aiCustomization/automationsAccessibilityHelp.js';

class FakeKeybindingService extends mock<IKeybindingService>() {
	override lookupKeybinding(): undefined {
		return undefined;
	}
}

suite('AutomationsAccessibilityHelp', () => {

	const teardown = ensureNoDisposablesAreLeakedInTestSuite();

	test('implementation declares the Help type and a when clause', () => {
		const impl = new AutomationsAccessibilityHelp();
		assert.strictEqual(impl.type, AccessibleViewType.Help);
		assert.strictEqual(impl.name, 'automations');
		assert.ok(impl.when, 'expected a when clause so the help only activates in the Automations section');
	});

	test('getProvider returns an AccessibleContentProvider with the Automations id and verbosity setting', () => {
		// Regression: the provider must be an actual `AccessibleContentProvider`
		// instance so the accessible-view service's `instanceof` branches
		// (e.g. `_updateLastProvider`, `showAccessibleViewHelp`) take the
		// correct path and propagate `verbositySettingKey` properly.
		const instantiationService = teardown.add(new TestInstantiationService());
		instantiationService.stub(IKeybindingService, new FakeKeybindingService());

		const impl = new AutomationsAccessibilityHelp();
		const provider = instantiationService.invokeFunction(accessor => impl.getProvider(accessor));
		teardown.add(provider);

		assert.ok(provider instanceof AccessibleContentProvider, 'provider must be an AccessibleContentProvider instance');
		assert.strictEqual(provider.id, AccessibleViewProviderId.Automations);
		assert.strictEqual(provider.verbositySettingKey, AccessibilityVerbositySettingId.Automations);
		assert.strictEqual(provider.options.type, AccessibleViewType.Help);
	});

	test('help content covers actions, dialog, history and settings', () => {
		const content = buildAutomationsHelpContent(new FakeKeybindingService());
		assert.match(content, /Automations/);
		assert.match(content, /Run now/);
		assert.match(content, /Show history/);
		assert.match(content, /Create\/Edit Dialog/);
		assert.match(content, /Workspace folder/);
		assert.match(content, /No workspace/);
		assert.match(content, /Workspace target selector/);
		assert.match(content, /workspace-less-capable session types/);
		assert.match(content, /Run History/);
		assert.match(content, /accessibility\.verbosity\.automations/);
	});

	test('help content does not contain unresolved placeholders', () => {
		const content = buildAutomationsHelpContent(upcastPartial<IKeybindingService>({ lookupKeybinding: () => undefined }));
		// The string template uses {0} for keybinding insertion; if any
		// placeholder leaks through unresolved that is a content bug.
		assert.doesNotMatch(content, /\{0\}/);
	});
});
