/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationMigrationDashboard, type ICustomizationMigrationDashboardItem } from '../../../browser/aiCustomization/customizationMigrationDashboard.js';

suite('CustomizationMigrationDashboard', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders migration context before opening a category', () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const openedCategories: string[] = [];
		const openedDocumentation: string[] = [];
		const dashboard = store.add(new CustomizationMigrationDashboard(
			parent,
			id => openedCategories.push(id),
			url => openedDocumentation.push(url),
		));
		const items: readonly ICustomizationMigrationDashboardItem[] = [{
			id: 'mcpServers',
			label: 'MCP Servers',
			description: 'Review server compatibility.',
			count: 3,
			operationLabel: 'Review and copy',
			sourceLabel: 'mcp.json',
			destinationLabel: '~/.copilot/mcp-config.json',
			itemSummary: '2 can migrate · 1 needs input',
			actionLabel: 'Review MCP Servers',
			actionAriaLabel: 'Review MCP servers that need migration',
		}];

		try {
			dashboard.setItems(items, 'Copilot');
			const action = parent.querySelector<HTMLAnchorElement>('.customization-migration-dashboard-card-footer .monaco-button');
			const architectureLink = parent.querySelector<HTMLAnchorElement>('.customization-migration-dashboard-summary-link');
			architectureLink?.click();
			action?.click();
			dashboard.focus();

			assert.deepStrictEqual({
				summary: parent.querySelector('.customization-migration-dashboard-summary-description')?.textContent,
				statusCount: parent.querySelectorAll('.customization-migration-dashboard-card-status').length,
				route: [...parent.querySelectorAll('.customization-migration-dashboard-route-label')].map(element => element.textContent),
				cardIconCount: parent.querySelectorAll('.customization-migration-dashboard-card-icon').length,
				actionAriaLabel: action?.getAttribute('aria-label'),
				actionFocused: document.activeElement === action,
				openedCategories,
				openedDocumentation,
			}, {
				summary: 'VS Code is moving agent sessions to Agent Host-based harnesses so sessions can persist across windows, run locally or remotely, and use a common foundation across harnesses. Some existing customizations use VS Code-specific formats or locations that Copilot does not discover. Review the customizations below to keep them available. Learn more about the Agent Host architecture',
				statusCount: 0,
				route: ['mcp.json', '~/.copilot/mcp-config.json'],
				cardIconCount: 0,
				actionAriaLabel: 'Review MCP servers that need migration',
				actionFocused: true,
				openedCategories: ['mcpServers'],
				openedDocumentation: ['https://code.visualstudio.com/blogs/2026/08/26/agent-host-architecture'],
			});
		} finally {
			parent.remove();
		}
	});
});
