/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CustomizationMigrationCategoryId, customizationMigrationGuidance } from '../../../../contrib/chat/browser/aiCustomization/customizationMigrationCategories.js';
import {
	CustomizationMigrationDashboard,
	ICustomizationMigrationDashboardOverview,
} from '../../../../contrib/chat/browser/aiCustomization/customizationMigrationDashboard.js';
import { PromptsStorage } from '../../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
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
	MigrationsGuidance: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['MCP migration retains its checkbox and Migrate action. Chat Participants and Tool Sets have Learn More links and Ignore actions, with read-only rows showing extension or user source information and no checkboxes or row menus.'],
		render: ctx => renderDashboard(ctx, 860, 'guidance'),
	}),
	MigrationsGuidanceOnly: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['A narrow migrations dashboard shows only Chat Participants and Tool Sets, with Learn More and Ignore actions and read-only rows. There is no Migrate with Agent action and no completed-state message.'],
		render: ctx => renderDashboard(ctx, 360, 'guidanceOnly'),
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
	MigrationsPending: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860, 'pending'),
	}),
	MigrationsActive: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['The workspace prompt migration group shows a disabled Migrating button while the page is marked busy. Other migration groups remain visible but unavailable until the active migration finishes.'],
		render: ctx => renderDashboard(ctx, 860, 'active'),
	}),
	MigrationsMarketplaceActive: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['The Plugin Marketplaces user group shows four selected marketplaces and a disabled Migrating button while the page is marked busy.'],
		render: ctx => renderDashboard(ctx, 860, 'marketplaceActive'),
	}),
	MigrationsMarketplaceActiveNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 360, 'marketplaceActive'),
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
		expectedVisualDescriptions: ['A compact marketplace-specific error card appears above the yellow prompt-to-skill warning and otherwise usable migration groups. Both cards keep their icons beside their title and description, and the Retry button is content-sized at the trailing edge.'],
		render: ctx => renderDashboard(ctx, 860, 'marketplaceError'),
	}),
	MigrationsMarketplaceErrorNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['In a narrow dashboard, the marketplace error icon stays beside its wrapped title and description while the content-sized Retry button moves below the text. The yellow prompt-to-skill warning below keeps its icon beside the wrapped warning text.'],
		render: ctx => renderDashboard(ctx, 360, 'marketplaceError'),
	}),
	MigrationsMcpWarnings: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The GitHub MCP server row grows to show every migration warning on its own line without clipping or overlapping the next row.'],
		render: ctx => renderDashboard(ctx, 860, 'mcpWarnings'),
	}),
	MigrationsMcpWarningsNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['In a narrow dashboard, the GitHub MCP server row grows to fit its wrapped migration warnings without clipping or overlapping the next row.'],
		render: ctx => renderDashboard(ctx, 360, 'mcpWarnings'),
	}),
});

async function renderDashboard(ctx: ComponentFixtureContext, width: number, state: 'overview' | 'tooltip' | 'partial' | 'disabled' | 'pending' | 'active' | 'marketplaceActive' | 'ignored' | 'loading' | 'error' | 'zero' | 'marketplaceError' | 'mcpWarnings' | 'guidance' | 'guidanceOnly'): Promise<void> {
	const { container, disposableStore, theme } = ctx;
	container.classList.add('ai-customization-management-editor');
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
	if (state === 'guidance' || state === 'guidanceOnly') {
		const toolSetGuidance = customizationMigrationGuidance.find(category => category.id === CustomizationMigrationCategoryId.ToolSets)!;
		const participantGuidance = customizationMigrationGuidance.find(category => category.id === CustomizationMigrationCategoryId.ChatParticipants)!;
		model = {
			...model,
			manualReviewItems: [],
			scopes: [
				{
					storage: PromptsStorage.user,
					label: 'Your profile',
					count: 1,
					hasConfigurableDestinations: false,
					categories: [{
						...toolSetGuidance,
						count: 1,
						countLabel: '1 customization',
						items: [{
							id: 'tool-set',
							label: 'review-tools',
							scopeLabel: 'User',
							sourceLabel: '~/.config/Code/User/prompts/review.toolsets.jsonc',
							resource: URI.file('/profile/prompts/review.toolsets.jsonc'),
						}],
					}],
				},
				{
					storage: PromptsStorage.extension,
					label: 'Extensions',
					count: 2,
					hasConfigurableDestinations: false,
					categories: [
						{
							...participantGuidance,
							count: 1,
							countLabel: '1 customization',
							items: [{
								id: 'participant',
								label: '@code-review',
								scopeLabel: 'Extension',
								sourceLabel: 'Code Review Extension',
								extensionId: 'example.code-review',
							}],
						},
						{
							...toolSetGuidance,
							count: 1,
							countLabel: '1 customization',
							items: [{
								id: 'extension-tool-set',
								label: 'deployment-tools',
								scopeLabel: 'Extension',
								sourceLabel: 'Deployment Extension',
								extensionId: 'example.deployment',
							}],
						},
					],
				},
				...(state === 'guidance' ? model.scopes
					.filter(scope => scope.storage === PromptsStorage.local)
					.map(scope => ({
						...scope,
						categories: scope.categories.filter(category => category.id === CustomizationMigrationCategoryId.McpServers),
						count: scope.categories.filter(category => category.id === CustomizationMigrationCategoryId.McpServers).reduce((total, category) => total + category.count, 0),
						hasConfigurableDestinations: false,
					})) : []),
			],
		};
	}
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
	} else if (state === 'pending' || state === 'active') {
		model = {
			...model,
			migrationInProgress: state === 'active',
			scopes: model.scopes.map(scope => scope.storage === PromptsStorage.local ? {
				...scope,
				categories: scope.categories.map(category => category.id === CustomizationMigrationCategoryId.PromptFiles ? {
					...category,
					...(state === 'active' ? { actionLabel: 'Migrating...', migrationInProgress: true } : {}),
					migrateDisabled: true,
				} : { ...category, migrateDisabled: true }),
			} : {
				...scope,
				categories: scope.categories.map(category => ({ ...category, migrateDisabled: true })),
			}),
		};
	} else if (state === 'marketplaceActive') {
		model = {
			...model,
			migrationInProgress: true,
			manualReviewItems: [],
			scopes: [{
				storage: PromptsStorage.user,
				label: 'Your profile',
				count: 4,
				hasConfigurableDestinations: false,
				categories: [{
					id: CustomizationMigrationCategoryId.PluginMarketplaces,
					label: 'Plugin Marketplaces',
					description: 'Migrate plugin marketplaces to Copilot settings while keeping them available to the Local agent.',
					actionLabel: 'Migrating...',
					count: 4,
					selectedCount: 4,
					countLabel: '4 marketplaces',
					migrationInProgress: true,
					migrateDisabled: true,
					destinationLabel: '~/.copilot/settings.json',
					items: [
						{ id: 'marketplace-team-kit', label: 'microsoft/vscode-team-kit', scopeLabel: 'User', sourceLabel: 'Configured in VS Code settings' },
						{ id: 'marketplace-engineering', label: 'contoso/engineering-plugins', scopeLabel: 'User', sourceLabel: 'Configured in VS Code settings' },
						{ id: 'marketplace-data', label: 'contoso/data-agents', scopeLabel: 'User', sourceLabel: 'Configured in VS Code settings' },
						{ id: 'marketplace-security', label: 'contoso/security-tools', scopeLabel: 'User', sourceLabel: 'Configured in VS Code settings' },
					],
				}],
			}],
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
				label: 'Couldn\'t load Copilot\'s plugin marketplaces',
				description: 'Check the Copilot connection, then try again.',
			}],
		};
	} else if (state === 'mcpWarnings') {
		// Omit prompt groups so the MCP rows are in view.
		model = {
			...model,
			scopes: model.scopes.map(scope => ({
				...scope,
				categories: scope.categories
					.filter(category => category.id !== CustomizationMigrationCategoryId.PromptFiles)
					.map(category => category.id === CustomizationMigrationCategoryId.McpServers ? {
						...category,
						count: 2,
						selectedCount: 2,
						countLabel: '2 servers',
						items: [
							{
								id: 'workspace-github', label: 'GitHub', scopeLabel: 'Workspace', sourceLabel: '.vscode/mcp.json',
								changesLabel: [
									'Inputs will become environment variables. Configure them in the MCP server details after migrating.',
									'Configs will become environment variables. Later changes won\'t apply.',
									'You may need to sign in again after migration.',
									'Migrating will stop auto-updates from the MCP registry.',
									'Removes \'dev\'. Development mode will stop.',
								].join('\n'),
							},
							{ id: 'workspace-playwright', label: 'Playwright', scopeLabel: 'Workspace', sourceLabel: '.vscode/mcp.json', changesLabel: 'Migrating will stop auto-updates from the MCP registry.' },
						],
					} : category),
			})),
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
		restoreAgentMigration: () => { },
		deleteAgentMigrationRecovery: () => { },
		retryCategory: () => { },
		openCustomization: () => { },
		openGuidanceSource: () => { },
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
			.find(element => element.textContent === 'Migrate...');
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
