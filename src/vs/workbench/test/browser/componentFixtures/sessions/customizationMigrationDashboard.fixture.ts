/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CustomizationMigrationDashboard, type ICustomizationMigrationDashboardItem } from '../../../../contrib/chat/browser/aiCustomization/customizationMigrationDashboard.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

const dashboardItems: readonly ICustomizationMigrationDashboardItem[] = [
	{
		id: 'promptFiles',
		label: 'Prompt Files',
		description: 'Prompt files are now deprecated. Found 4 prompt files that Copilot will ignore. Convert them to skills to keep them available.',
		count: 4,
		operationLabel: 'Convert',
		sourceLabel: '.prompt.md files',
		destinationLabel: 'Skill folders',
		itemSummary: '2 workspace · 2 user',
		actionLabel: 'Review Prompt Files',
		actionAriaLabel: 'Review prompt files that need migration',
	},
	{
		id: 'userData',
		label: 'VS Code Profile Customizations',
		description: 'Agent Host harnesses do not discover customizations stored in your VS Code profile. Found 3 files that Copilot will ignore. Move them to portable Copilot folders to keep them available.',
		count: 3,
		operationLabel: 'Move',
		sourceLabel: 'VS Code profile',
		destinationLabel: '~/.copilot',
		itemSummary: '1 agent · 2 instructions',
		actionLabel: 'Review Profile Files',
		actionAriaLabel: 'Review VS Code profile customizations that need migration',
	},
	{
		id: 'mcpServers',
		label: 'MCP Servers',
		description: 'Some VS Code MCP configuration is not supported by Copilot. Found 3 servers that need review. Copy compatible servers and update the others to keep them available.',
		count: 3,
		operationLabel: 'Review and copy',
		sourceLabel: 'mcp.json',
		destinationLabel: '~/.copilot/mcp-config.json',
		itemSummary: '2 can migrate · 1 needs input',
		actionLabel: 'Review MCP Servers',
		actionAriaLabel: 'Review MCP servers that need migration',
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

	const dashboard = disposableStore.add(new CustomizationMigrationDashboard(host, () => { }, () => { }));
	dashboard.setItems(dashboardItems, 'Copilot');
}
