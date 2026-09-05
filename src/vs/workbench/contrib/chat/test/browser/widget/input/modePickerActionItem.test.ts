/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { getCustomAgentAriaDescription, getCustomAgentCategory } from '../../../../browser/widget/input/modePickerActionItem.js';
import { PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';

suite('getCustomAgentCategory', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('groups custom agents by the storage they are defined in', () => {
		const categoryOf = (storage: PromptsStorage | undefined) => {
			const category = getCustomAgentCategory(storage);
			return { label: category?.label, order: category?.order, showHeader: category?.showHeader };
		};

		assert.deepStrictEqual(
			{
				local: categoryOf(PromptsStorage.local),
				user: categoryOf(PromptsStorage.user),
				plugin: categoryOf(PromptsStorage.plugin),
				extension: categoryOf(PromptsStorage.extension),
				builtIn: categoryOf(PromptsStorage.builtIn),
				undefined: categoryOf(undefined),
			},
			{
				local: { label: 'Workspace', order: 1, showHeader: true },
				user: { label: 'User', order: 2, showHeader: true },
				plugin: { label: 'Plugins', order: 3, showHeader: true },
				extension: { label: 'Extensions', order: 4, showHeader: true },
				builtIn: { label: 'Built-in', order: 0, showHeader: true },
				undefined: { label: 'Custom', order: 5, showHeader: true },
			}
		);
	});

	test('orders workspace agents ahead of the ones shared across workspaces', () => {
		const workspace = getCustomAgentCategory(PromptsStorage.local);
		const user = getCustomAgentCategory(PromptsStorage.user);

		assert.ok(workspace!.order < user!.order, 'workspace agents should be listed before user agents');
	});
});

suite('getCustomAgentAriaDescription', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('tells same-named agents apart by folding the category into the accessible description', () => {
		const workspace = getCustomAgentCategory(PromptsStorage.local);
		const user = getCustomAgentCategory(PromptsStorage.user);

		assert.deepStrictEqual(
			{
				workspaceAgent: getCustomAgentAriaDescription(workspace, 'Reviews code'),
				userAgent: getCustomAgentAriaDescription(user, 'Reviews code'),
				withoutDescription: getCustomAgentAriaDescription(workspace, undefined),
				withoutCategory: getCustomAgentAriaDescription(undefined, 'Reviews code'),
				withoutBoth: getCustomAgentAriaDescription(undefined, undefined),
			},
			{
				workspaceAgent: 'Workspace, Reviews code',
				userAgent: 'User, Reviews code',
				withoutDescription: 'Workspace',
				withoutCategory: 'Reviews code',
				withoutBoth: undefined,
			}
		);
	});
});
