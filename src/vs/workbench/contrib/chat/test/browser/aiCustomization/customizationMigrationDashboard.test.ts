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
		store.add(toDisposable(() => parent.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() {
			override setupDelayedHover() { return Disposable.None; }
		});
		const dashboard = store.add(instantiationService.createInstance(CustomizationMigrationDashboard, parent, {
			actionClicked: (action, categoryId) => telemetryActions.push(categoryId ? `${action}:${categoryId}` : action),
			configureLocations: () => { },
			dismissResult: () => { },
			migrateCategory: () => { },
			setItemSelected: () => { },
			showItemActions: () => { },
			ignoreCategory: () => { },
			restoreIgnoredCategories: () => { },
			openCustomization: () => { },
			dismissActivity: () => { },
			...callbacks,
		}));
		dashboard.layout(1000);
		return { parent, dashboard, telemetryActions };
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
					storage: PromptsStorage.user, label: 'Your profile', count: 5, skipped: false, hasConfigurableDestinations: true,
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
					],
				},
				{
					storage: PromptsStorage.local, label: 'vscode', count: 3, skipped: false, hasConfigurableDestinations: true,
					categories: [
						{
							id: CustomizationMigrationCategoryId.PromptFiles, label: 'Convert Prompt to Skills', description: 'Convert prompts to skills.', count: 1, selectedCount: 1, countLabel: '1 prompt', highRisk: true,
							destinationLabel: '.github/skills',
							destinationAriaLabel: 'Change destination for workspace prompt migrations',
							items: [{ id: 'workspace-prompt', label: 'Build', scopeLabel: 'Workspace', sourceLabel: '.github/prompts/build.prompt.md' }],
						},
						{
							id: CustomizationMigrationCategoryId.McpServers, label: 'MCP Servers', description: 'Move supported servers.', count: 1, selectedCount: 1, countLabel: '1 server',
							destinationLabel: '.mcp.json',
							items: [{ id: 'workspace-mcp', label: 'Postgres', scopeLabel: 'Workspace', sourceLabel: '.vscode/mcp.json' }],
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
			activity: [],
		};
	}

	test('renders migration groups with destination paths and sends scoped actions', () => {
		const actions: string[] = [];
		const { parent, dashboard, telemetryActions } = createDashboard({
			configureLocations: (id, storage) => actions.push(`destinations:${id}:${storage}`),
			migrateCategory: (id, storage) => actions.push(`migrate:${id}:${storage}`),
		});
		dashboard.showOverview(overview());
		dashboard.focus();
		const initialFocus = document.activeElement?.getAttribute('aria-label');
		button(parent, 'Migrate Convert Prompt to Skills (Workspace)').click();
		button(parent, 'Migrate Convert Prompt to Skills (User)').click();
		button(parent, 'Migrate MCP Servers (Workspace)').click();
		button(parent, 'Migrate User Data (User)').click();
		button(parent, 'Migrate Custom location settings (Workspace)').click();
		button(parent, 'Change destination for user prompt migrations').click();
		dashboard.focusDestination(PromptsStorage.user);
		assert.deepStrictEqual({
			title: parent.querySelector('h1')?.textContent,
			groups: [...parent.querySelectorAll('.group-label')].map(element => element.textContent),
			counts: [...parent.querySelectorAll('.group-count')].map(element => element.textContent),
			items: [...parent.querySelectorAll('.migration-tree-item-label')].map(element => element.textContent),
			sources: [...parent.querySelectorAll('.migration-tree-item-source')].map(element => element.textContent),
			checklistCopy: parent.textContent?.includes('Your migration checklist'),
			initialFocus,
			focus: document.activeElement?.getAttribute('aria-label'),
			actions,
			telemetryActions,
		}, {
			title: 'Migrations',
			groups: ['Convert Prompt to Skills (Workspace)', 'Convert Prompt to Skills (User)', 'MCP Servers (Workspace)', 'User Data (User)', 'Custom location settings (Workspace)'],
			counts: ['1', '2', '1', '2', '1'],
			items: ['Build', 'Release', 'Triage', 'Postgres', 'Planner', 'Review', 'Team rules'],
			sources: ['.github/prompts/build.prompt.md', '~/.copilot/prompts/release.prompt.md', '~/.copilot/prompts/triage.prompt.md', '.vscode/mcp.json', '~/.copilot/agents/planner.agent.md', '~/.copilot/instructions/review.instructions.md', 'team/rules.instructions.md'],
			checklistCopy: false,
			initialFocus: 'Migrate Convert Prompt to Skills (Workspace)',
			focus: 'Change destination for user prompt migrations',
			actions: ['migrate:promptFiles:local', 'migrate:promptFiles:user', 'migrate:mcpServers:local', 'migrate:userData:user', 'migrate:configuredLocations:local', 'destinations:promptFiles:user'],
			telemetryActions: ['migrationCategoryClicked:promptFiles', 'migrationCategoryClicked:promptFiles', 'migrationCategoryClicked:mcpServers', 'migrationCategoryClicked:userData', 'migrationCategoryClicked:configuredLocations', 'destinationsClicked'],
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
			overviewFocus: 'Migrate Convert Prompt to Skills (Workspace)',
		});
	});

	test('updates group actions from item selection and exposes item, ignore, and restore actions', () => {
		const actions: string[] = [];
		const model = overview();
		const { parent, dashboard } = createDashboard({
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
			migrateLabel: button(parent, 'Migrate Convert Prompt to Skills (User)').textContent,
			actions,
		}, {
			migrateLabel: 'Migrate 1',
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
		const { parent, dashboard } = createDashboard({
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
		assert.deepStrictEqual({
			manualReviewCheckboxDisplay: DOM.getWindow(parent).getComputedStyle(parent.querySelector<HTMLElement>('.migration-tree-item.manual-review .migration-tree-item-checkbox')!).display,
			reviewButtons: [...parent.querySelectorAll('.migration-tree-item-review')].filter(element => (element as HTMLElement).style.display !== 'none').map(element => element.textContent),
		}, {
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
		dashboard.showOverview({ scopes: [], activity: [] });
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
		dashboard.showOverview({ scopes: [], activity: [] });
		dashboard.focus();
		assert.deepStrictEqual({
			description: parent.querySelector('.migration-intro')?.textContent,
			empty: parent.querySelector('.migration-empty')?.textContent,
			buttons: parent.querySelectorAll('[role="button"]').length,
			focus: document.activeElement?.tagName,
		}, {
			description: 'Your customizations use supported formats and locations.',
			empty: 'No migrations are needed.',
			buttons: 0,
			focus: 'BODY',
		});
	});

	test('View Changes expands newest activity and dismissals restore meaningful focus', () => {
		let model: ICustomizationMigrationDashboardOverview = {
			...overview(),
			result: { migratedCount: 1 },
			activity: ['latest', 'previous'].map(id => ({
				id, categoryLabel: 'Prompt to Skills', scopeLabel: id, storage: PromptsStorage.user,
				items: [{ label: 'release', sourceLabel: 'profile/release.prompt.md', targetLabel: '~/.agents/skills/release/SKILL.md', operation: 'converted' }],
			})),
		};
		let contentChanges = 0;
		const { parent, dashboard, telemetryActions } = createDashboard({
			dismissActivity: id => {
				model = { ...model, activity: model.activity.filter(entry => entry.id !== id) };
				dashboard.showOverview(model);
			},
			dismissResult: () => {
				model = { ...model, result: undefined };
				dashboard.showOverview(model);
			},
			onDidChangeContent: () => contentChanges++,
		});
		dashboard.showOverview(model);
		const viewChanges = button(parent, 'View migration changes');
		viewChanges.focus();
		viewChanges.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		const expanded = {
			open: [...parent.querySelectorAll('details')].map(element => element.open),
			focus: document.activeElement?.tagName,
			disclosureAriaHidden: parent.querySelector('.migration-activity-disclosure')?.getAttribute('aria-hidden'),
			disclosureLabels: [...parent.querySelectorAll('.migration-activity-disclosure')].map(element => element.textContent),
			operation: parent.querySelector('.migration-operation')?.textContent,
			paths: [...parent.querySelectorAll('.migration-paths dd')].slice(0, 2).map(element => element.textContent),
		};
		dashboard.showOverview(model);
		const remainedOpen = parent.querySelector('details')?.open;
		button(parent, 'Dismiss Prompt to Skills activity from latest').click();
		const nextFocus = document.activeElement?.textContent;
		button(parent, 'Dismiss Prompt to Skills activity from previous').click();
		const lastDismissFocus = document.activeElement?.textContent;
		button(parent, 'Dismiss migration result').click();
		assert.deepStrictEqual({
			expanded, remainedOpen,
			nextFocused: nextFocus?.includes('previous'),
			lastDismissFocus,
			result: !!parent.querySelector('.migration-result'),
			activity: !!parent.querySelector('.migration-activity'),
			focus: document.activeElement?.textContent,
			notified: contentChanges > 0,
			telemetryActions,
		}, {
			expanded: {
				open: [true, false],
				focus: 'SUMMARY',
				disclosureAriaHidden: 'true',
				disclosureLabels: ['', ''],
				operation: 'Converted to skill',
				paths: ['profile/release.prompt.md', '~/.agents/skills/release/SKILL.md'],
			},
			remainedOpen: true, nextFocused: true, lastDismissFocus: 'Migrate',
			result: false, activity: false, focus: 'Migrate', notified: true,
			telemetryActions: ['viewChangesClicked', 'activityDismissed', 'activityDismissed', 'resultDismissed'],
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
});
