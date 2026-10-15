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
import * as DOM from '../../../../../base/browser/dom.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureCondition } from '../fixtureUtils.js';

function overview(): ICustomizationMigrationDashboardOverview {
	return {
		scopes: [
			{
				storage: PromptsStorage.user, label: 'Your profile', count: 4, hasConfigurableDestinations: true,
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
				storage: PromptsStorage.local, label: 'vscode', count: 4, hasConfigurableDestinations: true,
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
	MigrationsTooltip: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The prompt migration Migrate button shows its action tooltip.'],
		render: ctx => renderDashboard(ctx, 860, 'tooltip'),
	}),
	MigrationsPartialSelection: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860, 'partial'),
	}),
	MigrationsDisabled: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860, 'disabled'),
	}),
	MigrationsIgnored: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860, 'ignored'),
	}),
	MigrationsLoading: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860, 'loading'),
	}),
	MigrationsError: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860, 'error'),
	}),
	MigrationsZero: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860, 'zero'),
	}),
	MigrationsMarketplaceError: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['A marketplace-specific error card appears above otherwise usable migration groups with an error icon, localized guidance, and a Retry button.'],
		render: ctx => renderDashboard(ctx, 860, 'marketplaceError'),
	}),
});

async function renderDashboard(ctx: ComponentFixtureContext, width: number, state: 'overview' | 'tooltip' | 'partial' | 'disabled' | 'ignored' | 'loading' | 'error' | 'zero' | 'marketplaceError'): Promise<void> {
	const { container, disposableStore, theme } = ctx;
	const dashboardContainer = state === 'tooltip' ? DOM.append(container, DOM.$('.customization-migration-dashboard-fixture')) : container;
	container.style.width = `${state === 'tooltip' ? width + 300 : width}px`;
	const height = width < 500 ? 1000 : 740;
	container.style.height = `${height}px`;
	container.style.overflow = 'hidden';
	container.style.background = 'var(--vscode-editor-background)';
	if (state === 'tooltip') {
		dashboardContainer.style.width = `${width}px`;
		dashboardContainer.style.height = `${height}px`;
		dashboardContainer.style.overflow = 'hidden';
	}
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IListService, ListService);
			if (state === 'tooltip') {
				reg.definePartialInstance(ILayoutService, { getContainer: () => container });
				reg.define(IHoverService, class extends HoverService {
					override showDelayedHover(options: Parameters<IHoverService['showDelayedHover']>[0]) {
						const hover = this.showInstantHover({ ...options, container }, false);
						if (hover) {
							disposableStore.add(hover);
						}
						return hover;
					}
				});
				reg.define(IMarkdownRendererService, MarkdownRendererService);
			}
		},
	});
	let model = overview();
	if (state === 'zero') {
		model = { ...model, scopes: model.scopes.map(scope => ({ ...scope, count: 0, categories: [] })), manualReviewItems: [] };
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
	} else if (state === 'disabled') {
		model = {
			...model,
			scopes: model.scopes.map(scope => scope.storage === PromptsStorage.local ? {
				...scope,
				categories: scope.categories.map(category => category.id === CustomizationMigrationCategoryId.PromptFiles ? {
					...category,
					migrateDisabled: true,
					selectedCount: 0,
					items: category.items.map(item => ({ ...item, selected: false })),
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
	} else if (state === 'marketplaceError') {
		model = {
			...model,
			categoryErrors: [{
				id: CustomizationMigrationCategoryId.PluginMarketplaces,
				label: 'Plugin marketplaces could not be checked',
				description: 'Check the active agent connection, then try again.',
			}],
		};
	}
	const dashboard = disposableStore.add(instantiationService.createInstance(CustomizationMigrationDashboard, dashboardContainer, {
		actionClicked: () => { },
		configureLocations: () => { },
		migrateWithAgent: () => { },
		migrateCategory: () => { },
		setItemSelected: () => { },
		showItemActions: () => { },
		ignoreCategory: () => { },
		restoreIgnoredCategories: () => { },
		retryCategory: () => { },
		openCustomization: () => { },
	}));
	if (state === 'loading') {
		dashboard.showLoading('Migrations', 'Loading migrations');
		dashboard.layout(height);
		return;
	}
	if (state === 'error') {
		dashboard.showLoading('Migrations unavailable', 'Try again.', () => { });
		dashboard.layout(height);
		return;
	}
	dashboard.showOverview(model);
	dashboard.layout(height);
	if (state === 'tooltip') {
		const migrateButton = [...dashboardContainer.querySelectorAll<HTMLElement>('.migration-tree-group-actions .migration-secondary-button')]
			.find(element => element.textContent === 'Migrate');
		if (!migrateButton) {
			throw new Error('Prompt migration button was not rendered');
		}
		migrateButton.dispatchEvent(new (DOM.getWindow(migrateButton).MouseEvent)('mouseover', { bubbles: true }));
		await waitForFixtureCondition(
			() => Boolean(container.querySelector('.monaco-hover')?.textContent?.trim()),
			'Prompt migration tooltip did not render',
		);
	}
}
