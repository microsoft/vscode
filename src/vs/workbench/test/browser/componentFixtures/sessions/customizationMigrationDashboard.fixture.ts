/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CustomizationMigrationCategoryId } from '../../../../contrib/chat/browser/aiCustomization/customizationMigrationCategories.js';
import {
	CustomizationMigrationDashboard,
	ICustomizationMigrationDashboardOverview,
} from '../../../../contrib/chat/browser/aiCustomization/customizationMigrationDashboard.js';
import { PromptsStorage } from '../../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

function overview(): ICustomizationMigrationDashboardOverview {
	return {
		scopes: [
			{
				storage: PromptsStorage.user, label: 'Your profile', count: 20, skipped: false, hasConfigurableDestinations: true,
				categories: [
					{ id: CustomizationMigrationCategoryId.PromptFiles, label: 'Prompts to skills', description: 'Convert prompts to skills so they can be invoked by supported agents.', count: 5, countLabel: '5 prompts', highRisk: true },
					{ id: CustomizationMigrationCategoryId.UserData, label: 'User Data', description: 'Move agents and instructions to shared locations so they remain available to supported agent experiences.', count: 15, countLabel: '8 agents · 7 instructions' },
				],
			},
			{
				storage: PromptsStorage.local, label: 'vscode', count: 9, skipped: false, hasConfigurableDestinations: true,
				categories: [
					{ id: CustomizationMigrationCategoryId.PromptFiles, label: 'Prompts to skills', description: 'Convert prompts to skills so they can be invoked by supported agents.', count: 7, countLabel: '7 prompts', highRisk: true },
					{ id: CustomizationMigrationCategoryId.McpServers, label: 'MCP Servers', description: 'Move supported workspace servers to the root .mcp.json so agents can discover them directly.', count: 2, countLabel: '2 servers' },
				],
			},
		],
		activity: [],
	};
}

export default defineThemedFixtureGroup({ path: 'chat/aiCustomizations/' }, {
	Migrations: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: ctx => renderDashboard(ctx, 860, 'overview'),
	}),
	MigrationsNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 360, 'overview'),
	}),
	MigrationsActivity: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860, 'activity'),
	}),
	MigrationsActivityNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 360, 'activity'),
	}),
	MigrationsSkipped: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860, 'skipped'),
	}),
	MigrationsZero: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860, 'zero'),
	}),
});

function renderDashboard(ctx: ComponentFixtureContext, width: number, state: 'overview' | 'activity' | 'skipped' | 'zero'): void {
	const { container, disposableStore, theme } = ctx;
	container.style.width = `${width}px`;
	container.style.height = state === 'activity' ? '900px' : width < 500 ? '1000px' : '740px';
	container.style.overflow = 'auto';
	container.style.background = 'var(--vscode-editor-background)';
	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	let model = overview();
	if (state === 'skipped') {
		model = { ...model, scopes: model.scopes.map(scope => ({ ...scope, skipped: scope.storage === PromptsStorage.local })) };
	} else if (state === 'zero') {
		model = { ...model, scopes: model.scopes.map(scope => ({ ...scope, count: 0, categories: [] })) };
	} else if (state === 'activity') {
		model = {
			scopes: [
				{ ...model.scopes[0], count: 0, categories: [], started: true },
				{ ...model.scopes[1], started: true },
			],
			result: { migratedCount: 3 },
			activity: [{
				id: 'profile-prompts', categoryLabel: 'Prompts to skills', scopeLabel: 'Your profile', storage: PromptsStorage.user,
				items: [
					{ label: 'prepare-release', sourceLabel: 'VS Code profile/prepare-release.prompt.md', targetLabel: '~/.agents/skills/prepare-release/SKILL.md', operation: 'converted' },
					{ label: 'release-manager', sourceLabel: 'VS Code profile/release-manager.agent.md', targetLabel: '~/.agents/agents/release-manager.agent.md', operation: 'moved' },
					{ label: 'typescript-style', sourceLabel: 'VS Code profile/typescript-style.instructions.md', targetLabel: '~/.agents/instructions/typescript-style.instructions.md', operation: 'copied' },
				],
			}],
		};
	}
	const dashboard = disposableStore.add(instantiationService.createInstance(CustomizationMigrationDashboard, container, {
		configureLocations: () => { },
		reviewCategory: () => { },
		setWorkspaceSkipped: skipped => {
			model = { ...model, scopes: model.scopes.map(scope => scope.storage === PromptsStorage.local ? { ...scope, skipped } : scope) };
			dashboard.showOverview(model);
		},
		dismissResult: () => {
			model = { ...model, result: undefined };
			dashboard.showOverview(model);
		},
		dismissActivity: id => {
			model = { ...model, activity: model.activity.filter(entry => entry.id !== id) };
			dashboard.showOverview(model);
		},
	}));
	dashboard.showOverview(model);
	if (state === 'activity') {
		container.querySelector<HTMLElement>('.migration-result .migration-link-button')?.click();
		container.scrollTop = 0;
	}
}
