/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { PromptLaunchersAICustomizationWelcomePage } from '../../../browser/aiCustomization/aiCustomizationWelcomePagePromptLaunchers.js';
import { ICustomizationMigrationCategorySummary, IWelcomePageCallbacks } from '../../../browser/aiCustomization/aiCustomizationWelcomePage.js';
import { CustomizationMigrationCategoryId } from '../../../browser/aiCustomization/customizationMigrationCategories.js';
import { IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';

suite('aiCustomizationWelcomePagePromptLaunchers', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('migration card has one native interactive target', () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const migratedCategories: CustomizationMigrationCategoryId[] = [];
		const callbacks: IWelcomePageCallbacks = {
			selectSection() { },
			selectSectionWithMarketplace() { },
			closeEditor() { },
			migrateCustomizations: categoryId => migratedCategories.push(categoryId),
			prefillChat() { },
		};
		const page = store.add(new PromptLaunchersAICustomizationWelcomePage(
			parent,
			{ showGettingStartedBanner: false },
			callbacks,
			{} as ICommandService,
			{ isSessionsWindow: true } as IAICustomizationWorkspaceService,
			{} as IHoverService,
			'Copilot [Agent Host]',
		));
		const category: ICustomizationMigrationCategorySummary = {
			id: CustomizationMigrationCategoryId.UserData,
			label: 'Migrate User Data Customizations',
			description: 'Move customizations.',
			actionLabel: 'Migrate...',
			actionAriaLabel: 'Migrate User Data customizations',
			count: 1,
		};

		try {
			page.setMigrationCategories([category]);
			const card = parent.querySelector<HTMLElement>('.welcome-prompts-migration-card');
			const action = card?.querySelector<HTMLButtonElement>('.welcome-prompts-card-action');
			card?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			action?.click();
			page.focus();

			assert.deepStrictEqual({
				cardRole: card?.getAttribute('role'),
				cardTabIndex: card?.getAttribute('tabindex'),
				buttonCount: card?.querySelectorAll('button').length,
				actionTagName: action?.tagName,
				focusedAction: document.activeElement === action,
				migratedCategories,
			}, {
				cardRole: null,
				cardTabIndex: null,
				buttonCount: 1,
				actionTagName: 'BUTTON',
				focusedAction: true,
				migratedCategories: [CustomizationMigrationCategoryId.UserData],
			});
		} finally {
			parent.remove();
		}
	});
});
