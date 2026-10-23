/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { CustomizationMigrationCategoryId } from '../../../browser/aiCustomization/customizationMigrationCategories.js';
import {
	CustomizationMigrationDashboard,
	ICustomizationMigrationDashboardCallbacks,
	ICustomizationMigrationDashboardOverview,
} from '../../../browser/aiCustomization/customizationMigrationDashboard.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';

suite('CustomizationMigrationDashboard', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createDashboard(callbacks: Partial<ICustomizationMigrationDashboardCallbacks> = {}) {
		const parent = DOM.append(document.body, DOM.$('div'));
		const telemetryActions: string[] = [];
		const hoverContents = new Map<HTMLElement, string>();
		const openedLinks: string[] = [];
		store.add(toDisposable(() => parent.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(resource: Parameters<IOpenerService['open']>[0]) {
				openedLinks.push(resource.toString());
				return true;
			}
		});
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() {
			override setupDelayedHover(...args: Parameters<IHoverService['setupDelayedHover']>) {
				const options = typeof args[1] === 'function' ? args[1]() : args[1];
				if (typeof options.content === 'string') {
					hoverContents.set(args[0], options.content);
				}
				return Disposable.None;
			}
		});
		const dashboard = store.add(instantiationService.createInstance(CustomizationMigrationDashboard, parent, {
			actionClicked: (action, categoryId) => telemetryActions.push(categoryId ? `${action}:${categoryId}` : action),
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
			...callbacks,
		}));
		dashboard.layout(1000);
		return { parent, dashboard, hoverContents, telemetryActions, openedLinks };
	}

	function button(parent: HTMLElement, label: string): HTMLElement {
		const element = [...parent.querySelectorAll<HTMLElement>('[role="button"]')].find(element => element.getAttribute('aria-label') === label);
		assert.ok(element, `Missing button: ${label}`);
		return element;
	}

	function overview(): ICustomizationMigrationDashboardOverview {
		return {
			scopes: [
				{
					storage: PromptsStorage.user, label: 'Your profile', count: 6, hasConfigurableDestinations: true,
					categories: [
						{
							id: CustomizationMigrationCategoryId.UserData, label: 'User Data', description: 'Move personal customizations.', count: 2, selectedCount: 2, countLabel: '1 agent · 1 instruction',
							items: [
								{ id: 'user-agent', label: 'Planner', scopeLabel: 'User', sourceLabel: '~/.copilot/agents/planner.agent.md' },
								{ id: 'user-instructions', label: 'Review', scopeLabel: 'User', sourceLabel: '~/.copilot/instructions/review.instructions.md' },
							],
						},
						{
							id: CustomizationMigrationCategoryId.PromptFiles, label: 'Convert Prompt to Skills', description: 'Convert prompts to skills.', count: 2, selectedCount: 2, countLabel: '2 prompts', highRisk: true,
							destinationLabel: '~/.agents/skills',
							destinationAriaLabel: 'Change destination for user prompt migrations',
							items: [
								{ id: 'user-prompt-1', label: 'Release', scopeLabel: 'User', sourceLabel: '~/.copilot/prompts/release.prompt.md' },
								{ id: 'user-prompt-2', label: 'Triage', scopeLabel: 'User', sourceLabel: '~/.copilot/prompts/triage.prompt.md' },
							],
						},
						{
							id: CustomizationMigrationCategoryId.PluginMarketplaces, label: 'Plugin Marketplaces', description: 'Move marketplaces to Copilot settings.', count: 1, selectedCount: 1, countLabel: '1 marketplace',
							actionLabel: 'Migrate',
							destinationLabel: '~/.copilot/settings.json',
							items: [
								{ id: 'user-marketplace', label: 'vscode-team-kit', scopeLabel: 'User', sourceLabel: 'Configured in VS Code settings' },
							],
						},
					],
				},
				{
					storage: PromptsStorage.local, label: 'vscode', count: 3, hasConfigurableDestinations: true,
					categories: [
						{
							id: CustomizationMigrationCategoryId.PromptFiles, label: 'Convert Prompt to Skills', description: 'Convert prompts to skills.', count: 1, selectedCount: 1, countLabel: '1 prompt', highRisk: true,
							destinationLabel: '.github/skills',
							destinationAriaLabel: 'Change destination for workspace prompt migrations',
							items: [{
								id: 'workspace-prompt',
								label: 'Build',
								scopeLabel: 'Workspace',
								sourceLabel: '.github/prompts/build.prompt.md',
							}],
						},
						{
							id: CustomizationMigrationCategoryId.McpServers, label: 'MCP Servers', description: 'Move supported servers.', count: 1, selectedCount: 1, countLabel: '1 server',
							destinationLabel: '.mcp.json',
							items: [{ id: 'workspace-mcp', label: 'Postgres', scopeLabel: 'Workspace', sourceLabel: '.vscode/mcp.json', changesLabel: 'The gallery property will be removed.' }],
						},
						{
							id: CustomizationMigrationCategoryId.ConfiguredLocations, label: 'Custom location settings', description: 'Update locations.', count: 1, selectedCount: 1, countLabel: '1 customization',
							items: [{ id: 'workspace-configured', label: 'Team rules', scopeLabel: 'Workspace', sourceLabel: 'team/rules.instructions.md' }],
						},
					],
				},
			],
			manualReviewItems: [],
			hasIgnoredGroups: false,
		};
	}

	test('renders migration groups with destination paths and sends scoped actions', () => {
		const actions: string[] = [];
		const { parent, dashboard, hoverContents, telemetryActions } = createDashboard({
			configureLocations: (id, storage) => actions.push(`destinations:${id}:${storage}`),
			migrateWithAgent: () => actions.push('agent'),
			migrateCategory: (id, storage) => actions.push(`migrate:${id}:${storage}`),
		});
		dashboard.showOverview(overview());
		dashboard.focus();
		const initialFocus = document.activeElement?.getAttribute('aria-label');
		const agentMigrationButton = button(parent, 'Start a guided migration of all customization files that need migration');
		const migrateButton = button(parent, 'Migrate: Convert Prompt to Skills (Workspace)');
		agentMigrationButton.click();
		migrateButton.click();
		button(parent, 'Migrate: Convert Prompt to Skills (User)').click();
		button(parent, 'Migrate: MCP Servers (Workspace)').click();
		button(parent, 'Migrate: Plugin Marketplaces (User)').click();
		button(parent, 'Migrate: User Data (User)').click();
		button(parent, 'Migrate: Custom location settings (Workspace)').click();
		button(parent, 'Change destination for user prompt migrations').click();
		dashboard.focusDestination(PromptsStorage.user);
		assert.deepStrictEqual({
			title: parent.querySelector('h1')?.textContent,
			groups: [...parent.querySelectorAll('.group-label')].map(element => element.textContent),
			counts: [...parent.querySelectorAll('.group-count')].map(element => element.textContent),
			items: [...parent.querySelectorAll('.migration-tree-item-label')].map(element => element.textContent),
			sources: [...parent.querySelectorAll('.migration-tree-item-source')].map(element => element.textContent),
			changes: [...parent.querySelectorAll('.migration-tree-item-changes')].filter(element => (element as HTMLElement).style.display !== 'none').map(element => element.textContent),
			warning: parent.querySelector('.migration-warning-banner')?.textContent,
			checklistCopy: parent.textContent?.includes('Your migration checklist'),
			intro: parent.querySelector('.migration-intro')?.textContent,
			agentButtonInTitleRow: agentMigrationButton.parentElement?.classList.contains('migration-page-title-actions'),
			agentButtonIsSecondary: agentMigrationButton.classList.contains('migration-secondary-button'),
			agentTooltip: hoverContents.get(agentMigrationButton),
			agentDescription: agentMigrationButton.getAttribute('aria-description'),
			migrateButtonIsSecondary: migrateButton.classList.contains('migration-secondary-button'),
			migrateTooltips: [...parent.querySelectorAll<HTMLElement>('.migration-tree-group-actions .migration-secondary-button')]
				.filter(element => element.textContent?.startsWith('Migrate'))
				.map(element => hoverContents.get(element)),
			initialFocus,
			focus: document.activeElement?.getAttribute('aria-label'),
			actions,
			telemetryActions,
		}, {
			title: 'Keep your customizations working',
			groups: ['Convert Prompt to Skills (Workspace)', 'Convert Prompt to Skills (User)', 'MCP Servers (Workspace)', 'Plugin Marketplaces (User)', 'User Data (User)', 'Custom location settings (Workspace)'],
			counts: ['1', '2', '1', '1', '2', '1'],
			items: ['Build', 'Release', 'Triage', 'Postgres', 'vscode-team-kit', 'Planner', 'Review', 'Team rules'],
			sources: ['.github/prompts/build.prompt.md', '~/.copilot/prompts/release.prompt.md', '~/.copilot/prompts/triage.prompt.md', '.vscode/mcp.json', 'Configured in VS Code settings', '~/.copilot/agents/planner.agent.md', '~/.copilot/instructions/review.instructions.md', 'team/rules.instructions.md'],
			changes: [
				'The gallery property will be removed.',
			],
			warning: 'Prompt-to-skill conversion changesConvert prompts to skills.',
			checklistCopy: false,
			intro: 'Copilot\'s new agent runtime uses different formats and locations for some customizations. Review and migrate the affected items below.',
			agentButtonInTitleRow: true,
			agentButtonIsSecondary: true,
			agentTooltip: 'Open a new chat with an agent to review and migrate your customizations. This uses Copilot credits.',
			agentDescription: 'Open a new chat with an agent to review and migrate your customizations. This uses Copilot credits.',
			migrateButtonIsSecondary: true,
			migrateTooltips: [
				'Convert prompt files to skills (Workspace)',
				'Convert prompt files to skills (User)',
				'Migrate eligible MCP servers (Workspace)',
				'Migrate plugin marketplaces to Copilot settings (User)',
				'Migrate user data customizations to the active harness (User)',
				'Migrate customizations from VS Code-configured locations (Workspace)',
			],
			initialFocus: 'Migrate: Convert Prompt to Skills (Workspace)',
			focus: 'Change destination for user prompt migrations',
			actions: ['agent', 'migrate:promptFiles:local', 'migrate:promptFiles:user', 'migrate:mcpServers:local', 'migrate:pluginMarketplaces:user', 'migrate:userData:user', 'migrate:configuredLocations:local', 'destinations:promptFiles:user'],
			telemetryActions: ['agentMigrationClicked', 'migrationCategoryClicked:promptFiles', 'migrationCategoryClicked:promptFiles', 'migrationCategoryClicked:mcpServers', 'migrationCategoryClicked:pluginMarketplaces', 'migrationCategoryClicked:userData', 'migrationCategoryClicked:configuredLocations', 'destinationsClicked'],
		});
	});

	test('hides agent migration for unsupported harnesses while retaining the migration introduction', () => {
		const { parent, dashboard } = createDashboard();
		dashboard.showOverview({ ...overview(), supportsAgentMigration: false });

		assert.deepStrictEqual({
			agentButton: parent.querySelector('[aria-label="Start a guided migration of all customization files that need migration"]'),
			title: parent.querySelector('h1')?.textContent,
			intro: parent.querySelector('.migration-intro')?.textContent,
			learnMore: parent.querySelector('.monaco-link')?.textContent,
		}, {
			agentButton: null,
			title: 'Keep your customizations working',
			intro: 'Copilot\'s new agent runtime uses different formats and locations for some customizations. Review and migrate the affected items below.',
			learnMore: 'Learn About Migrations',
		});
	});

	test('opens migration documentation by mouse and keyboard and restores link focus after refresh', () => {
		const { parent, dashboard, openedLinks } = createDashboard();
		dashboard.showOverview(overview());
		const link = parent.querySelector<HTMLAnchorElement>('.monaco-link');
		assert.ok(link);
		link.click();
		link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		link.focus();
		dashboard.showLoading('Migrations', 'Loading migrations');
		dashboard.showOverview(overview());

		assert.deepStrictEqual({
			label: link.textContent,
			href: link.getAttribute('href'),
			role: link.getAttribute('role'),
			tabIndex: link.tabIndex,
			openedLinks,
			focusedLink: document.activeElement === parent.querySelector('.monaco-link'),
		}, {
			label: 'Learn About Migrations',
			href: 'https://aka.ms/vscode-migrate-customizations',
			role: 'link',
			tabIndex: 0,
			openedLinks: ['https://aka.ms/vscode-migrate-customizations', 'https://aka.ms/vscode-migrate-customizations'],
			focusedLink: true,
		});
	});

	test('moves initial loading focus to the first migrate action when the overview loads', () => {
		const { dashboard } = createDashboard();
		dashboard.showLoading('Migrations', 'Loading migrations');
		dashboard.focus();
		const loadingFocus = document.activeElement?.textContent;
		dashboard.showOverview(overview());
		assert.deepStrictEqual({
			loadingFocus,
			overviewFocus: document.activeElement?.getAttribute('aria-label'),
		}, {
			loadingFocus: 'Migrations',
			overviewFocus: 'Migrate: Convert Prompt to Skills (Workspace)',
		});
	});

	test('updates group actions from item selection and exposes item, ignore, and restore actions', () => {
		const actions: string[] = [];
		const model = overview();
		const { parent, dashboard, hoverContents } = createDashboard({
			setItemSelected: (item, selected) => actions.push(`selected:${item.id}:${selected}`),
			showItemActions: item => actions.push(`actions:${item.id}`),
			ignoreCategory: (id, storage) => actions.push(`ignore:${id}:${storage}`),
			restoreIgnoredCategories: () => actions.push('restore'),
		});
		dashboard.showOverview({ ...model, hasIgnoredGroups: true });

		const releaseCheckbox = parent.querySelector<HTMLElement>('[role="checkbox"][aria-label="Select Release for migration"]');
		assert.ok(releaseCheckbox);
		releaseCheckbox.click();
		button(parent, 'More actions for Release').click();
		button(parent, 'Ignore Convert Prompt to Skills (User)').click();
		button(parent, 'Show and restore ignored migrations').click();

		assert.deepStrictEqual({
			migrateLabel: button(parent, 'Migrate 1: Convert Prompt to Skills (User)').textContent,
			migrateAriaLabel: button(parent, 'Migrate 1: Convert Prompt to Skills (User)').getAttribute('aria-label'),
			migrateTooltip: hoverContents.get(button(parent, 'Migrate 1: Convert Prompt to Skills (User)')),
			actions,
		}, {
			migrateLabel: 'Migrate 1',
			migrateAriaLabel: 'Migrate 1: Convert Prompt to Skills (User)',
			migrateTooltip: 'Convert prompt files to skills (User)',
			actions: [
				'selected:user-prompt-1:false',
				'actions:user-prompt-1',
				`ignore:${CustomizationMigrationCategoryId.PromptFiles}:${PromptsStorage.user}`,
				'restore',
			],
		});
	});

	test('opens customization rows and manual review rows through the same details callback', () => {
		const opened: string[] = [];
		const { parent, dashboard, hoverContents } = createDashboard({
			openCustomization: (item, storage) => opened.push(`${item.id}:${storage}`),
		});
		const model = overview();
		dashboard.showOverview({
			...model,
			manualReviewItems: [{
				id: 'workspace-mcp-manual',
				label: 'Legacy',
				scopeLabel: 'Workspace',
				sourceLabel: '.vscode/mcp.json',
				manualReviewReason: 'Unsupported field.',
				storage: PromptsStorage.local,
			}],
		});

		[...parent.querySelectorAll<HTMLElement>('.migration-tree-item-label')]
			.find(element => element.textContent === 'Postgres')?.click();
		button(parent, 'Review Legacy').click();

		assert.deepStrictEqual(opened, [
			`workspace-mcp:${PromptsStorage.local}`,
			`workspace-mcp-manual:${PromptsStorage.local}`,
		]);
		const manualReviewGroup = [...parent.querySelectorAll<HTMLElement>('.group-label')]
			.find(element => element.textContent === 'Needs manual review');
		assert.deepStrictEqual({
			manualReviewGuidance: manualReviewGroup && hoverContents.get(manualReviewGroup),
			manualReviewCheckboxDisplay: DOM.getWindow(parent).getComputedStyle(parent.querySelector<HTMLElement>('.migration-tree-item.manual-review .migration-tree-item-checkbox')!).display,
			reviewButtons: [...parent.querySelectorAll('.migration-tree-item-review')].filter(element => (element as HTMLElement).style.display !== 'none').map(element => element.textContent),
		}, {
			manualReviewGuidance: 'These customizations cannot be migrated automatically. Select Review to see what needs to change.',
			manualReviewCheckboxDisplay: 'none',
			reviewButtons: ['Review'],
		});
	});

	test('sizes the migration tree to the available height so it owns scrolling', () => {
		const { parent, dashboard } = createDashboard();
		dashboard.showOverview(overview());
		dashboard.layout(400);
		const treeContainer = parent.querySelector<HTMLElement>('.migration-tree');
		assert.ok(treeContainer);

		const height = parseInt(treeContainer.style.height, 10);
		assert.ok(height > 0 && height <= 400, `Unexpected tree height: ${treeContainer.style.height}`);
	});

	test('restores documentation link focus when refreshing a completed overview', () => {
		const { parent, dashboard } = createDashboard();
		dashboard.showOverview({ scopes: [] });
		const link = parent.querySelector<HTMLAnchorElement>('.monaco-link');
		assert.ok(link);
		link.focus();
		dashboard.showOverview({ scopes: [] });
		const focusedAfterRefresh = document.activeElement === parent.querySelector('.monaco-link');

		dashboard.showLoading('Migrations', 'Loading migrations');
		dashboard.showOverview({ scopes: [] });
		assert.deepStrictEqual({
			focusedAfterRefresh,
			focusedAfterLoading: document.activeElement === parent.querySelector('.monaco-link'),
		}, {
			focusedAfterRefresh: true,
			focusedAfterLoading: true,
		});
	});

	test('does not move focus into a completed overview', () => {
		const { parent, dashboard } = createDashboard();
		const model = overview();
		const outside = DOM.append(document.body, DOM.$('button'));
		store.add(toDisposable(() => outside.remove()));
		outside.focus();
		dashboard.showOverview({
			...model,
			scopes: model.scopes.map(scope => ({ ...scope, count: 0, categories: [] })),
		});
		dashboard.focus();
		assert.deepStrictEqual({
			focusRemainedOutside: document.activeElement === outside,
			dashboardContainsFocus: parent.contains(document.activeElement),
		}, {
			focusRemainedOutside: true,
			dashboardContainsFocus: false,
		});
	});

	test('does not restore loading focus into a completed overview', () => {
		const { parent, dashboard } = createDashboard();
		dashboard.showLoading('Migrations', 'Loading migrations');
		dashboard.focus();
		dashboard.showOverview({ scopes: [] });
		assert.deepStrictEqual({
			focus: document.activeElement?.tagName,
			dashboardContainsFocus: parent.contains(document.activeElement),
		}, {
			focus: 'BODY',
			dashboardContainsFocus: false,
		});
	});

	test('renders an empty completed state without review controls', () => {
		const { parent, dashboard } = createDashboard();
		dashboard.showOverview({ scopes: [] });
		dashboard.focus();
		assert.deepStrictEqual({
			description: parent.querySelector('.migration-intro')?.textContent,
			empty: parent.querySelector('.migration-empty')?.textContent,
			buttons: parent.querySelectorAll('[role="button"]').length,
			focus: document.activeElement?.tagName,
		}, {
			description: 'Your customizations are ready.',
			empty: 'No migrations are needed.',
			buttons: 0,
			focus: 'BODY',
		});
	});

	test('renders agent migration recovery actions', () => {
		const actions: string[] = [];
		const { parent, dashboard } = createDashboard({
			restoreAgentMigration: recovery => actions.push(`restore:${recovery.id}`),
			deleteAgentMigrationRecovery: recovery => actions.push(`delete:${recovery.id}`),
		});
		dashboard.showOverview({
			scopes: [],
			recoveries: [{
				id: 'flow-1',
				label: 'Copilot migration',
				description: '2 original sources backed up. Status: completed.',
				canModify: true,
			}],
		});

		button(parent, 'Restore original sources for Copilot migration').click();
		button(parent, 'Delete backup for Copilot migration').click();

		assert.deepStrictEqual({
			heading: parent.querySelector('.migration-recoveries h2')?.textContent,
			description: parent.querySelector('.migration-recovery-content p')?.textContent,
			actions,
		}, {
			heading: 'Agent Migration Recovery',
			description: '2 original sources backed up. Status: completed.',
			actions: ['restore:flow-1', 'delete:flow-1'],
		});
	});

	test('retry loading uses standard keyboard-activated Button and focus remains usable', () => {
		let retries = 0;
		const { parent, dashboard, telemetryActions } = createDashboard();
		dashboard.showLoading('Migrations unavailable', 'Try again.', () => retries++);
		const retry = button(parent, 'Retry loading migrations');
		retry.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		dashboard.focus();
		assert.deepStrictEqual({
			retries,
			busy: parent.querySelector('.migration-page')?.getAttribute('aria-busy'),
			focus: document.activeElement?.textContent,
			telemetryActions,
		}, { retries: 1, busy: 'false', focus: 'Retry', telemetryActions: ['retryClicked'] });
	});

	test('keeps category discovery errors scoped and retryable alongside valid migrations', () => {
		const retried: string[] = [];
		const { parent, dashboard, telemetryActions } = createDashboard({
			retryCategory: id => retried.push(id),
		});
		dashboard.showOverview({
			...overview(),
			categoryErrors: [{
				id: CustomizationMigrationCategoryId.PluginMarketplaces,
				label: 'Couldn\'t load Copilot\'s plugin marketplaces',
				description: 'Check the Copilot connection, then try again.',
			}],
		});

		button(parent, 'Retry loading Couldn\'t load Copilot\'s plugin marketplaces').click();

		const error = parent.querySelector('.migration-category-error');
		const retryParent = error?.querySelector('[aria-label="Retry loading Couldn\'t load Copilot\'s plugin marketplaces"]')?.parentElement;
		assert.deepStrictEqual({
			title: error?.querySelector('h2')?.textContent?.trim(),
			description: error?.querySelector('p')?.textContent?.trim(),
			hasRetryActionsContainer: retryParent?.classList.contains('migration-category-error-actions'),
			hasPromptMigration: parent.textContent?.includes('Convert Prompt to Skills (Workspace)'),
			retried,
			telemetryActions,
		}, {
			title: 'Couldn\'t load Copilot\'s plugin marketplaces',
			description: 'Check the Copilot connection, then try again.',
			hasRetryActionsContainer: true,
			hasPromptMigration: true,
			retried: [CustomizationMigrationCategoryId.PluginMarketplaces],
			telemetryActions: ['retryClicked:pluginMarketplaces'],
		});
	});

	test('focuses refresh errors and restores the prior overview target after retry', () => {
		let retries = 0;
		const { parent, dashboard } = createDashboard();
		dashboard.showOverview(overview());
		dashboard.focusDestination(PromptsStorage.user);
		const overviewFocus = document.activeElement?.getAttribute('aria-label');
		dashboard.showLoading('Migrations', 'Loading migrations');
		dashboard.showLoading('Migrations unavailable', 'Try again.', () => {
			retries++;
			dashboard.showLoading('Migrations', 'Loading migrations');
		});
		const errorFocus = document.activeElement?.getAttribute('aria-label');
		button(parent, 'Retry loading migrations').click();
		dashboard.showOverview(overview());

		assert.deepStrictEqual({
			overviewFocus,
			errorFocus,
			retries,
			restoredFocus: document.activeElement?.getAttribute('aria-label'),
		}, {
			overviewFocus: 'Change destination for user prompt migrations',
			errorFocus: 'Retry loading migrations',
			retries: 1,
			restoredFocus: 'Change destination for user prompt migrations',
		});
	});
});
