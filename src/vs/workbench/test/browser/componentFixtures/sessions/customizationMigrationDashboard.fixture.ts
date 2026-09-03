/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CustomizationMigrationDashboard, type ICustomizationMigrationDashboardItem } from '../../../../contrib/chat/browser/aiCustomization/customizationMigrationDashboard.js';
import { PromptsType } from '../../../../contrib/chat/common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

const dashboardItems: readonly ICustomizationMigrationDashboardItem[] = [
	{
		id: 'promptFiles',
		label: 'Prompt Files',
		description: 'Copilot will ignore these prompt files. Convert them to skills to keep them available.',
		count: 4,
		destinations: [{
			targetType: PromptsType.skill,
			storage: PromptsStorage.local,
			contextLabel: 'Workspace skills',
			label: '.github/skills',
			ariaLabel: 'Change destination for workspace skills',
		}],
		itemSummary: '2 workspace · 2 user',
		actionLabel: 'Review Migration',
		actionAriaLabel: 'Review prompt file migration',
	},
	{
		id: 'userData',
		label: 'VS Code-only Customizations',
		description: 'Copilot will ignore these agents and instruction files. Move them to portable Copilot folders to keep them available.',
		count: 3,
		destinations: [
			{
				targetType: PromptsType.agent,
				storage: PromptsStorage.user,
				contextLabel: 'User agents',
				label: '~/.copilot/agents',
				ariaLabel: 'Change destination for user agents',
			},
			{
				targetType: PromptsType.instructions,
				storage: PromptsStorage.user,
				contextLabel: 'User instructions',
				label: '~/.copilot/instructions',
				ariaLabel: 'Change destination for user instructions',
			},
		],
		itemSummary: '1 agent · 2 instructions',
		actionLabel: 'Review Migration',
		actionAriaLabel: 'Review VS Code-only customization migration',
	},
	{
		id: 'mcpServers',
		label: 'MCP Servers',
		description: 'Some VS Code MCP configuration is not supported by Copilot. Copy compatible servers and update the others to keep them available.',
		count: 3,
		destinations: [{
			targetType: PromptsType.instructions,
			storage: PromptsStorage.user,
			contextLabel: 'User MCP servers',
			label: '~/.copilot/mcp-config.json',
			ariaLabel: 'Change destination for user MCP servers',
		}],
		itemSummary: '2 can migrate · 1 needs input',
		actionLabel: 'Review Migration',
		actionAriaLabel: 'Review MCP server migration',
	},
];

export default defineThemedFixtureGroup({ path: 'chat/aiCustomizations/' }, {
	WithMcp: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860),
	}),
	WithMcpNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 420),
	}),
});

function renderDashboard({ container, disposableStore }: ComponentFixtureContext, width: number): void {
	container.classList.add('ai-customization-management-editor');
	container.style.width = `${width}px`;
	container.style.height = '620px';
	container.style.padding = '24px';
	container.style.boxSizing = 'border-box';
	container.style.overflow = 'auto';

	const host = document.createElement('div');
	host.classList.add('prompt-migration-content-container');
	host.classList.toggle('narrow-layout', width < 500);
	container.appendChild(host);

	const dashboard = disposableStore.add(new CustomizationMigrationDashboard(host, () => { }, () => { }, () => { }));
	dashboard.setItems(dashboardItems, 'Copilot');
}
