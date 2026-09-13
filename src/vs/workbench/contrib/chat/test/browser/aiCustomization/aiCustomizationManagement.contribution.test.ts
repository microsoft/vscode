/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isIMenuItem, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME } from '../../../../../../platform/agentHost/common/agentHostCustomizationUri.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import '../../../browser/aiCustomization/aiCustomizationManagement.contribution.js';
import {
	AICustomizationManagementItemMenuId,
	AICustomizationManagementSyntheticItemMenuId,
	getAICustomizationManagementItemMenuId,
} from '../../../browser/aiCustomization/aiCustomizationManagement.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('AI customization management contribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const fileActionIds = new Set([
		'aiCustomizationManagement.openFile',
		'aiCustomizationManagement.runPrompt',
		'aiCustomizationManagement.copyPath',
		'aiCustomizationManagement.delete',
		'aiCustomizationManagement.installChatCustomizationExtension',
	]);

	test('isolates synthetic items from extension-contributed item actions', () => {
		const disposables = new DisposableStore();
		try {
			disposables.add(MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
				command: {
					id: 'test.extensionContributedAction',
					title: 'Extension Action',
				},
			}));

			const syntheticUri = toAgentHostUri(
				URI.from({ scheme: AGENT_BUILTIN_CUSTOMIZATION_SCHEME, path: '/skill/code-review' }),
				'remote'
			);
			const selectedMenuId = getAICustomizationManagementItemMenuId(syntheticUri);
			const syntheticActionIds = MenuRegistry.getMenuItems(selectedMenuId)
				.filter(isIMenuItem)
				.map(item => item.command.id);
			const regularActionIds = MenuRegistry.getMenuItems(AICustomizationManagementItemMenuId)
				.filter(isIMenuItem)
				.map(item => item.command.id);

			assert.deepStrictEqual({
				usesSyntheticMenu: selectedMenuId === AICustomizationManagementSyntheticItemMenuId,
				syntheticFileActions: syntheticActionIds.filter(id => fileActionIds.has(id)),
				syntheticExtensionActions: syntheticActionIds.filter(id => id === 'test.extensionContributedAction'),
				regularHasFileActions: [...fileActionIds].every(id => regularActionIds.includes(id)),
				readableUsesExtensibleMenu: getAICustomizationManagementItemMenuId(URI.file('/workspace/SKILL.md')) === AICustomizationManagementItemMenuId,
			}, {
				usesSyntheticMenu: true,
				syntheticFileActions: [],
				syntheticExtensionActions: [],
				regularHasFileActions: true,
				readableUsesExtensibleMenu: true,
			});
		} finally {
			disposables.dispose();
		}
	});
});
