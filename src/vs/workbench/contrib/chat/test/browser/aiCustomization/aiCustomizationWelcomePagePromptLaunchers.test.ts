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
import { AICustomizationManagementSection } from '../../../browser/aiCustomization/aiCustomizationManagement.js';

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
			'Copilot',
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
			const card = parent.querySelector<HTMLButtonElement>('.welcome-prompts-migration-card');
			card?.click();
			page.focus();

			assert.deepStrictEqual({
				cardTagName: card?.tagName,
				buttonCount: card?.querySelectorAll('button').length,
				focusedCard: document.activeElement === card,
				migratedCategories,
			}, {
				cardTagName: 'BUTTON',
				buttonCount: 0,
				focusedCard: true,
				migratedCategories: [CustomizationMigrationCategoryId.UserData],
			});
		} finally {
			parent.remove();
		}
	});

	test('category cards are single native navigation targets', () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const selectedSections: AICustomizationManagementSection[] = [];
		const page = store.add(new PromptLaunchersAICustomizationWelcomePage(
			parent,
			{ showGettingStartedBanner: false },
			{
				selectSection: section => selectedSections.push(section),
				selectSectionWithMarketplace() { },
				closeEditor() { },
				migrateCustomizations() { },
				prefillChat() { },
			},
			{} as ICommandService,
			{ isSessionsWindow: true } as IAICustomizationWorkspaceService,
			{} as IHoverService,
			'Copilot',
		));

		try {
			page.rebuildCards(new Set([AICustomizationManagementSection.Agents]));
			const card = parent.querySelector<HTMLButtonElement>('.welcome-prompts-navigation-card');
			card?.click();
			assert.deepStrictEqual({
				tagName: card?.tagName,
				nestedButtons: card?.querySelectorAll('button').length,
				selectedSections,
			}, {
				tagName: 'BUTTON',
				nestedButtons: 0,
				selectedSections: [AICustomizationManagementSection.Agents],
			});
		} finally {
			parent.remove();
		}
	});
});
