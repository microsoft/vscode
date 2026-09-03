/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationMigrationDashboard, type ICustomizationMigrationDashboardItem } from '../../../browser/aiCustomization/customizationMigrationDashboard.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';

suite('CustomizationMigrationDashboard', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders migration context before opening a category', () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const openedCategories: string[] = [];
		const openedDocumentation: string[] = [];
		const selectedDestinations: string[] = [];
		const dashboard = store.add(new CustomizationMigrationDashboard(
			parent,
			id => openedCategories.push(id),
			url => openedDocumentation.push(url),
			destination => selectedDestinations.push(destination.label),
		));
		const items: readonly ICustomizationMigrationDashboardItem[] = [{
			id: 'mcpServers',
			label: 'MCP Servers',
			description: 'Review server compatibility.',
			count: 3,
			destinations: [{
				targetType: PromptsType.instructions,
				storage: PromptsStorage.user,
				contextLabel: 'User MCP servers',
				label: '~/.copilot/mcp-config.json',
				ariaLabel: 'Change MCP server destination',
			}],
			itemSummary: '2 can migrate · 1 needs input',
			actionLabel: 'Review Migration',
			actionAriaLabel: 'Review MCP server migration',
		}];

		try {
			dashboard.setItems(items, 'Copilot');
			const action = parent.querySelector<HTMLAnchorElement>('.customization-migration-dashboard-card-footer .monaco-button');
			const architectureLink = parent.querySelector<HTMLAnchorElement>('.customization-migration-dashboard-summary-link');
			const destinationButton = parent.querySelector<HTMLAnchorElement>('.customization-migration-dashboard-plan-control');
			architectureLink?.click();
			destinationButton?.click();
			action?.click();
			dashboard.focus();

			assert.deepStrictEqual({
				summary: parent.querySelector('.customization-migration-dashboard-summary-description')?.textContent,
				statusCount: parent.querySelectorAll('.customization-migration-dashboard-card-status').length,
				destinationHeading: parent.querySelector('.customization-migration-dashboard-plan-heading')?.textContent,
				destinationScopes: [...parent.querySelectorAll('.customization-migration-dashboard-plan-label')].map(element => element.textContent),
				oldRouteCount: parent.querySelectorAll('.customization-migration-dashboard-route').length,
				destinationLabel: destinationButton?.textContent?.includes('~/.copilot/mcp-config.json'),
				destinationPopupRole: destinationButton?.getAttribute('aria-haspopup'),
				destinationKey: destinationButton?.dataset.migrationDestinationKey,
				cardIconCount: parent.querySelectorAll('.customization-migration-dashboard-card-icon').length,
				actionAriaLabel: action?.getAttribute('aria-label'),
				actionFocused: document.activeElement === action,
				headerButtonCount: parent.querySelectorAll('.customization-migration-dashboard-summary > .monaco-button').length,
				openedCategories,
				openedDocumentation,
				selectedDestinations,
			}, {
				summary: 'Some customizations need to move for Agent Host compatibility. Review or migrate them below. Learn more about the Agent Host architecture',
				statusCount: 0,
				destinationHeading: 'Migration destinations',
				destinationScopes: ['User MCP servers'],
				oldRouteCount: 0,
				destinationLabel: true,
				destinationPopupRole: 'listbox',
				destinationKey: `${PromptsType.instructions}:${PromptsStorage.user}`,
				cardIconCount: 0,
				actionAriaLabel: 'Review MCP server migration',
				actionFocused: true,
				headerButtonCount: 0,
				openedCategories: ['mcpServers'],
				openedDocumentation: ['https://code.visualstudio.com/blogs/2026/08/26/agent-host-architecture'],
				selectedDestinations: ['~/.copilot/mcp-config.json'],
			});
		} finally {
			parent.remove();
		}
	});
});
