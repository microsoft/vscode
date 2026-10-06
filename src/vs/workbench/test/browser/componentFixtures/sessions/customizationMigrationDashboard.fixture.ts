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
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

function overview(): ICustomizationMigrationDashboardOverview {
	return {
		scopes: [
			{
				storage: PromptsStorage.user, label: 'Your profile', count: 4, skipped: false, hasConfigurableDestinations: true,
				categories: [
					{
						id: CustomizationMigrationCategoryId.PromptFiles, label: 'Convert Prompt to Skills', description: 'Convert prompts to skills so they can be invoked by supported agents.', count: 2, selectedCount: 2, countLabel: '2 prompts', highRisk: true,
						destinationLabel: '~/.agents/skills',
						destinationAriaLabel: 'Change destination for user prompt migrations',
						items: [
							{ id: 'profile-release', label: 'prepare-release', scopeLabel: 'User', sourceLabel: '~/.copilot/prompts/prepare-release.prompt.md' },
							{ id: 'profile-review', label: 'review-pr', scopeLabel: 'User', sourceLabel: '~/.copilot/prompts/review-pr.prompt.md' },
						],
					},
					{
						id: CustomizationMigrationCategoryId.UserData, label: 'User Data', description: 'Move agents and instructions to shared locations so they remain available to supported agent experiences.', count: 2, selectedCount: 2, countLabel: '1 agent · 1 instruction',
						destinationLabel: '~/.agents',
						items: [
							{ id: 'profile-agent', label: 'release-manager', scopeLabel: 'User', sourceLabel: '~/.copilot/agents/release-manager.agent.md' },
							{ id: 'profile-instructions', label: 'typescript-style', scopeLabel: 'User', sourceLabel: '~/.copilot/instructions/typescript-style.instructions.md' },
						],
					},
				],
			},
			{
				storage: PromptsStorage.local, label: 'vscode', count: 4, skipped: false, hasConfigurableDestinations: true,
				categories: [
					{
						id: CustomizationMigrationCategoryId.PromptFiles, label: 'Convert Prompt to Skills', description: 'Convert prompts to skills so they can be invoked by supported agents.', count: 2, selectedCount: 2, countLabel: '2 prompts', highRisk: true,
						destinationLabel: '.github/skills',
						destinationAriaLabel: 'Change destination for workspace prompt migrations',
						items: [
							{ id: 'workspace-build', label: 'build', scopeLabel: 'Workspace', sourceLabel: '.github/prompts/build.prompt.md' },
							{ id: 'workspace-test', label: 'test', scopeLabel: 'Workspace', sourceLabel: '.github/prompts/test.prompt.md' },
						],
					},
					{
						id: CustomizationMigrationCategoryId.McpServers, label: 'MCP Servers', description: 'Move eligible workspace servers to the root .mcp.json so agents can discover them directly.', count: 1, selectedCount: 1, countLabel: '1 server',
						destinationLabel: '.mcp.json',
						items: [
							{ id: 'workspace-github', label: 'GitHub', scopeLabel: 'Workspace', sourceLabel: '.vscode/mcp.json' },
						],
					},
				],
			},
		],
		manualReviewItems: [{
			id: 'workspace-postgres',
			label: 'Postgres',
			scopeLabel: 'Workspace',
			sourceLabel: '.vscode/mcp.json',
			manualReviewReason: 'This server uses unsupported configuration fields.',
			storage: PromptsStorage.local,
		}],
		hasIgnoredGroups: false,
		activity: [],
	};
}

export default defineThemedFixtureGroup({ path: 'chat/aiCustomizations/' }, {
	Migrations: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['A flat tree groups migrations by Workspace or User without numbering. Group headers show destination paths, Migrate and Ignore actions, and expanded rows show selected checkboxes, source paths, and three-dot menus. A Needs manual review group appears last.'],
		render: ctx => renderDashboard(ctx, 860, 'overview'),
	}),
	MigrationsNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 360, 'overview'),
	}),
	MigrationsPartialSelection: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860, 'partial'),
	}),
	MigrationsIgnored: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860, 'ignored'),
	}),
	MigrationsActivity: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860, 'activity'),
	}),
	MigrationsActivityNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 360, 'activity'),
	}),
	MigrationsZero: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860, 'zero'),
	}),
});

function renderDashboard(ctx: ComponentFixtureContext, width: number, state: 'overview' | 'partial' | 'ignored' | 'activity' | 'zero'): void {
	const { container, disposableStore, theme } = ctx;
	container.style.width = `${width}px`;
	const height = state === 'activity' ? 900 : width < 500 ? 1000 : 740;
	container.style.height = `${height}px`;
	container.style.overflow = 'hidden';
	container.style.background = 'var(--vscode-editor-background)';
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IListService, ListService);
		},
	});
	let model = overview();
	if (state === 'zero') {
		model = { ...model, scopes: model.scopes.map(scope => ({ ...scope, count: 0, categories: [] })) };
	} else if (state === 'partial') {
		model = {
			...model,
			scopes: model.scopes.map(scope => scope.storage === PromptsStorage.user ? {
				...scope,
				categories: scope.categories.map(category => category.id === CustomizationMigrationCategoryId.PromptFiles ? {
					...category,
					selectedCount: 1,
					items: category.items.map((item, index) => ({ ...item, selected: index !== 0 })),
				} : category),
			} : scope),
		};
	} else if (state === 'ignored') {
		model = {
			...model,
			hasIgnoredGroups: true,
			scopes: model.scopes.map(scope => scope.storage === PromptsStorage.local ? {
				...scope,
				categories: scope.categories.filter(category => category.id !== CustomizationMigrationCategoryId.PromptFiles),
			} : scope),
		};
	} else if (state === 'activity') {
		model = {
			scopes: [
				{ ...model.scopes[0], count: 0, categories: [], started: true },
				{ ...model.scopes[1], started: true },
			],
			result: { migratedCount: 3 },
			activity: [{
				id: 'profile-prompts', categoryLabel: 'Prompt to Skills', scopeLabel: 'Your profile', storage: PromptsStorage.user,
				items: [
					{ label: 'prepare-release', sourceLabel: 'VS Code profile/prepare-release.prompt.md', targetLabel: '~/.agents/skills/prepare-release/SKILL.md', operation: 'converted' },
					{ label: 'release-manager', sourceLabel: 'VS Code profile/release-manager.agent.md', targetLabel: '~/.agents/agents/release-manager.agent.md', operation: 'moved' },
					{ label: 'typescript-style', sourceLabel: 'VS Code profile/typescript-style.instructions.md', targetLabel: '~/.agents/instructions/typescript-style.instructions.md', operation: 'copied' },
				],
			}],
		};
	}
	const dashboard = disposableStore.add(instantiationService.createInstance(CustomizationMigrationDashboard, container, {
		actionClicked: () => { },
		configureLocations: () => { },
		migrateWithAgent: () => { },
		migrateCategory: () => { },
		setItemSelected: () => { },
		showItemActions: () => { },
		ignoreCategory: () => { },
		restoreIgnoredCategories: () => { },
		openCustomization: () => { },
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
	dashboard.layout(height);
	if (state === 'activity') {
		container.querySelector<HTMLElement>('.migration-result .migration-link-button')?.click();
		dashboard.layout(height);
	}
}
