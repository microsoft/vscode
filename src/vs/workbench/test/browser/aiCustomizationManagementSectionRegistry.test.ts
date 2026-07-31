/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { Codicon } from '../../../base/common/codicons.js';
import { aiCustomizationManagementSectionRegistry } from '../../contrib/chat/browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';
import { AICustomizationManagementSection } from '../../contrib/chat/common/aiCustomizationWorkspaceService.js';

suite('AI Customization Management Section Registry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves contributions by active harness', () => {
		const registrations = store.add(new DisposableStore());
		const codex = {
			id: AICustomizationManagementSection.HarnessSettings,
			label: 'Codex Settings',
			icon: Codicon.openai,
			description: 'Codex settings',
			supportsHarness: (harnessId: string) => harnessId === 'codex',
			create: () => ({ dispose() { } }),
		};
		const claude = {
			...codex,
			label: 'Claude Settings',
			supportsHarness: (harnessId: string) => harnessId === 'claude',
		};
		registrations.add(aiCustomizationManagementSectionRegistry.register(codex));
		registrations.add(aiCustomizationManagementSectionRegistry.register(claude));

		assert.strictEqual(aiCustomizationManagementSectionRegistry.get(AICustomizationManagementSection.HarnessSettings, 'codex'), codex);
		assert.strictEqual(aiCustomizationManagementSectionRegistry.get(AICustomizationManagementSection.HarnessSettings, 'claude'), claude);
		assert.strictEqual(aiCustomizationManagementSectionRegistry.get(AICustomizationManagementSection.HarnessSettings, 'other'), undefined);

		registrations.dispose();
	});
});
