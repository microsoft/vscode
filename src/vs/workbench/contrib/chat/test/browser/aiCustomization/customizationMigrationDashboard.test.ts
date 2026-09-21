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
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
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
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() {
			override setupDelayedHover() { return Disposable.None; }
		});
		const dashboard = store.add(instantiationService.createInstance(CustomizationMigrationDashboard, parent, {
			actionClicked: (action, categoryId) => telemetryActions.push(categoryId ? `${action}:${categoryId}` : action),
			configureLocations: () => { },
			dismissResult: () => { },
			reviewCategory: () => { },
			setWorkspaceSkipped: () => { },
			dismissActivity: () => { },
			...callbacks,
		}));
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
						{ id: CustomizationMigrationCategoryId.UserData, label: 'User Data', description: 'Move personal customizations.', count: 3, countLabel: '2 agents · 1 instruction' },
						{ id: CustomizationMigrationCategoryId.PromptFiles, label: 'Prompts to skills', description: 'Convert prompts to skills.', count: 2, countLabel: '2 prompts', highRisk: true, highRiskDescription: 'Conversion can remove prompt-only metadata and change how prompts are invoked.' },
					],
				},
				{
					storage: PromptsStorage.local, label: 'vscode', count: 1, skipped: false, hasConfigurableDestinations: false,
					categories: [
						{ id: CustomizationMigrationCategoryId.McpServers, label: 'MCP Servers', description: 'Move supported servers.', count: 1, countLabel: '1 server' },
						{ id: CustomizationMigrationCategoryId.ConfiguredLocations, label: 'Configured locations', description: 'Update locations.', count: 0, countLabel: '0 locations' },
					],
				},
			],
			activity: [],
		};
	}

	test('orders high-risk categories first and sends scoped review and destination callbacks', () => {
		const actions: string[] = [];
		const { parent, dashboard, telemetryActions } = createDashboard({
			configureLocations: storage => actions.push(`destinations:${storage}`),
			reviewCategory: (id, storage) => actions.push(`review:${id}:${storage}`),
		});
		dashboard.showOverview(overview());
		dashboard.focus();
		const initialFocus = document.activeElement?.getAttribute('aria-label');
		button(parent, 'Review Prompts to skills from Your profile').click();
		button(parent, 'Review User Data from Your profile').click();
		button(parent, 'Review MCP Servers from vscode').click();
		button(parent, 'Change destinations for Your profile').click();
		dashboard.focusDestination(PromptsStorage.user);
		assert.deepStrictEqual({
			title: parent.querySelector('h1')?.textContent,
			categories: [...parent.querySelectorAll('h4')].map(element => element.textContent),
			counts: [...parent.querySelectorAll('.migration-count')].map(element => element.textContent),
			highRisk: parent.querySelector('.migration-risk')?.textContent,
			progress: parent.querySelector('.migration-checklist-progress')?.textContent,
			workspaceDescription: parent.querySelector('[data-storage="local"] .migration-scope-description')?.textContent,
			workspaceDestinationButton: parent.querySelector('[aria-label="Change destinations for vscode"]') !== null,
			initialFocus,
			focus: document.activeElement?.getAttribute('aria-label'),
			actions,
			telemetryActions,
		}, {
			title: 'Migrations',
			categories: ['Prompts to skills', 'User Data', 'MCP Servers'],
			counts: ['2 prompts', '2 agents · 1 instruction', '1 server'],
			highRisk: 'High risk',
			progress: '0 of 2 complete',
			workspaceDescription: 'Workspace customizations. Skip this workspace if you do not own it.',
			initialFocus: 'Review Prompts to skills from Your profile',
			focus: 'Change destinations for Your profile',
			workspaceDestinationButton: false,
			actions: ['review:promptFiles:user', 'review:userData:user', 'review:mcpServers:local', 'destinations:user'],
			telemetryActions: ['migrationCategoryClicked:promptFiles', 'migrationCategoryClicked:userData', 'migrationCategoryClicked:mcpServers', 'destinationsClicked'],
		});
	});

	test('moves initial loading focus to the first review action when the overview loads', () => {
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
			overviewFocus: 'Review Prompts to skills from Your profile',
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
			checklistContainsFocus: parent.querySelector('.migration-checklist-section')?.contains(document.activeElement),
		}, {
			focusRemainedOutside: true,
			checklistContainsFocus: false,
		});
	});

	test('does not restore loading focus into a completed overview', () => {
		const { parent, dashboard } = createDashboard();
		dashboard.showLoading('Migrations', 'Loading migrations');
		dashboard.focus();
		dashboard.showOverview({ scopes: [], activity: [] });
		assert.deepStrictEqual({
			focus: document.activeElement?.tagName,
			checklistContainsFocus: parent.querySelector('.migration-checklist-section')?.contains(document.activeElement),
		}, {
			focus: 'BODY',
			checklistContainsFocus: false,
		});
	});

	test('high-risk explanation is persistent and described on the keyboard-accessible review button', () => {
		const { parent, dashboard } = createDashboard();
		dashboard.showOverview(overview());
		const review = button(parent, 'Review Prompts to skills from Your profile');
		review.focus();
		assert.deepStrictEqual({
			descriptions: [...parent.querySelectorAll('.migration-category:first-child .migration-category-description')].map(element => element.textContent),
			description: review.getAttribute('aria-description'),
			tabIndex: review.tabIndex,
			focused: document.activeElement === review,
		}, {
			descriptions: [
				'Convert prompts to skills.',
				'Conversion can remove prompt-only metadata and change how prompts are invoked.',
				'Move supported servers.',
			],
			description: 'Conversion can remove prompt-only metadata and change how prompts are invoked.',
			tabIndex: 0,
			focused: true,
		});
	});

	test('skipping and including workspace preserves focus through loading and hides its categories', () => {
		let model = overview();
		const { parent, dashboard, telemetryActions } = createDashboard({
			setWorkspaceSkipped: skipped => {
				model = { ...model, scopes: model.scopes.map(scope => scope.storage === PromptsStorage.local ? { ...scope, skipped } : scope) };
				dashboard.showLoading('Migrations', 'Loading migrations');
				dashboard.showOverview(model);
			},
		});
		dashboard.showOverview(model);
		const skip = button(parent, 'Skip workspace vscode');
		skip.focus();
		skip.click();
		const skipped = {
			progress: parent.querySelector('.migration-checklist-progress')?.textContent,
			state: parent.querySelector('.is-skipped .migration-scope-state')?.textContent,
			categories: parent.querySelectorAll('.is-skipped .migration-category').length,
			focus: document.activeElement?.getAttribute('aria-label'),
		};
		button(parent, 'Include workspace vscode').click();
		assert.deepStrictEqual({
			skipped,
			included: model.scopes[1].skipped,
			categories: parent.querySelectorAll('.migration-category').length,
			focus: document.activeElement?.getAttribute('aria-label'),
			telemetryActions,
		}, {
			skipped: { progress: '0 of 2 complete · 1 skipped', state: 'Skipped', categories: 0, focus: 'Include workspace vscode' },
			included: false,
			categories: 3,
			focus: 'Skip workspace vscode',
			telemetryActions: ['workspaceSkipped', 'workspaceIncluded'],
		});
	});

	test('skipped scopes are not complete and only included pending scopes determine the introduction', () => {
		const { parent, dashboard } = createDashboard();
		const model = overview();
		const snapshots = [5, 0].map(profileCount => {
			dashboard.showOverview({
				...model,
				scopes: [
					{ ...model.scopes[0], count: profileCount, categories: profileCount ? model.scopes[0].categories : [] },
					{ ...model.scopes[1], skipped: true },
				],
			});
			return {
				intro: parent.querySelector('.migration-intro')?.textContent,
				progress: parent.querySelector('.migration-checklist-progress')?.textContent,
				workspaceDescription: parent.querySelector('[data-storage="local"] .migration-scope-description')?.textContent,
				states: [...parent.querySelectorAll('.migration-scope-state')].map(element => element.textContent),
			};
		});
		dashboard.showOverview({ scopes: [{ ...model.scopes[1], skipped: true, count: 0, categories: [] }], activity: [] });
		assert.deepStrictEqual({
			snapshots,
			skippedEmpty: {
				intro: parent.querySelector('.migration-intro')?.textContent,
				progress: parent.querySelector('.migration-checklist-progress')?.textContent,
				state: parent.querySelector('.migration-scope-state')?.textContent,
				include: !!parent.querySelector('[aria-label="Include workspace vscode"]'),
			},
		}, {
			snapshots: [
				{
					intro: 'Some of your agent customizations need an update to keep working. Review and migrate them to the new formats and locations.',
					progress: '0 of 2 complete · 1 skipped',
					workspaceDescription: 'This workspace is excluded from migration. Include it to review its customizations.',
					states: ['Skipped'],
				},
				{
					intro: 'No migrations remain in included locations. Skipped locations are excluded from migration.',
					progress: '1 of 2 complete · 1 skipped',
					workspaceDescription: 'This workspace is excluded from migration. Include it to review its customizations.',
					states: ['Migrated', 'Skipped'],
				},
			],
			skippedEmpty: {
				intro: 'No migrations remain in included locations. Skipped locations are excluded from migration.',
				progress: '0 of 1 complete · 1 skipped',
				state: 'Skipped',
				include: true,
			},
		});
	});

	test('renders completed, migrations remaining and empty states', () => {
		const { parent, dashboard } = createDashboard();
		const model = overview();
		dashboard.showOverview({
			...model, scopes: [
				{ ...model.scopes[0], count: 0, categories: [] },
				{ ...model.scopes[1], started: true },
			]
		});
		const states = [...parent.querySelectorAll('.migration-scope-state')].map(element => element.textContent);
		const progress = parent.querySelector('.migration-checklist-progress')?.textContent;
		const completedDestinations = parent.querySelectorAll('[aria-label="Change destinations for Your profile"]').length;
		dashboard.showOverview({ scopes: [], activity: [] });
		dashboard.focus();
		assert.deepStrictEqual({
			states, progress, completedDestinations,
			empty: parent.querySelector('.migration-empty')?.textContent,
			buttons: parent.querySelectorAll('[role="button"]').length,
			focus: document.activeElement?.tagName,
		}, { states: ['Migrated', 'Migrations remaining'], progress: '1 of 2 complete', completedDestinations: 0, empty: 'No migrations are needed.', buttons: 0, focus: 'BODY' });
	});

	test('persisted started scopes show neutral migrations remaining text rather than active progress', () => {
		const { parent, dashboard } = createDashboard();
		parent.style.setProperty('--vscode-descriptionForeground', 'rgb(17, 34, 51)');
		parent.style.setProperty('--vscode-textLink-foreground', 'rgb(170, 187, 204)');
		const model = overview();
		dashboard.showOverview({ ...model, scopes: model.scopes.map(scope => ({ ...scope, started: true })) });
		assert.deepStrictEqual({
			states: [...parent.querySelectorAll<HTMLElement>('.migration-scope-state')].map(element => ({
				label: element.textContent,
				color: DOM.getWindow(element).getComputedStyle(element).color,
			})),
			busy: parent.querySelector('.migration-page')?.getAttribute('aria-busy'),
			reviewAvailable: !!parent.querySelector('[aria-label="Review User Data from Your profile"]'),
		}, {
			states: [
				{ label: 'Migrations remaining', color: 'rgb(17, 34, 51)' },
				{ label: 'Migrations remaining', color: 'rgb(17, 34, 51)' },
			],
			busy: null,
			reviewAvailable: true,
		});
	});

	test('activity path values remain selectable inside non-selectable workbench content', () => {
		const { parent, dashboard } = createDashboard();
		parent.style.userSelect = 'none';
		parent.style.setProperty('-webkit-user-select', 'none');
		dashboard.showOverview({
			scopes: [],
			result: { migratedCount: 1, activityIds: ['profile-prompts'] },
			activity: [{
				id: 'profile-prompts', categoryLabel: 'Prompts to skills', scopeLabel: 'Your profile', storage: PromptsStorage.user,
				items: [{ label: 'release', sourceLabel: 'profile/release.prompt.md', targetLabel: '~/.agents/skills/release/SKILL.md', operation: 'converted' }],
			}],
		});
		button(parent, 'View migration changes').click();
		assert.deepStrictEqual([...parent.querySelectorAll<HTMLElement>('.migration-paths dd')].map(element => {
			const style = DOM.getWindow(element).getComputedStyle(element);
			return {
				path: element.textContent,
				userSelect: style.userSelect,
				webkitUserSelect: style.getPropertyValue('-webkit-user-select'),
			};
		}), [
			{ path: 'profile/release.prompt.md', userSelect: 'text', webkitUserSelect: 'text' },
			{ path: '~/.agents/skills/release/SKILL.md', userSelect: 'text', webkitUserSelect: 'text' },
		]);
	});

	test('View Changes expands result activity and dismissals restore meaningful focus', () => {
		let model: ICustomizationMigrationDashboardOverview = {
			...overview(),
			result: { migratedCount: 1, activityIds: ['latest'] },
			activity: ['latest', 'previous'].map(id => ({
				id, categoryLabel: 'Prompts to skills', scopeLabel: id, storage: PromptsStorage.user,
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
		button(parent, 'Dismiss Prompts to skills activity from latest').click();
		const nextFocus = document.activeElement?.textContent;
		const viewChangesAfterDismissal = !!parent.querySelector('[aria-label="View migration changes"]');
		button(parent, 'Dismiss Prompts to skills activity from previous').click();
		const lastDismissFocus = document.activeElement?.textContent;
		button(parent, 'Dismiss migration result').click();
		assert.deepStrictEqual({
			expanded, remainedOpen, viewChangesAfterDismissal,
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
			remainedOpen: true, viewChangesAfterDismissal: false, nextFocused: true, lastDismissFocus: 'Your migration checklist',
			result: false, activity: false, focus: 'Your migration checklist', notified: true,
			telemetryActions: ['viewChangesClicked', 'activityDismissed', 'activityDismissed', 'resultDismissed'],
		});
	});

	test('View Changes expands only available result activities, never unrelated newer activity', () => {
		const { parent, dashboard } = createDashboard();
		const model: ICustomizationMigrationDashboardOverview = {
			...overview(),
			result: { migratedCount: 2, activityIds: ['missing', 'result-first', 'result-second'] },
			activity: ['unrelated-newest', 'result-second', 'result-first'].map(id => ({
				id, categoryLabel: 'User Data', scopeLabel: id, storage: PromptsStorage.user,
				items: [{ label: 'agent', sourceLabel: 'profile/agent.agent.md', targetLabel: '~/.agents/agents/agent.agent.md', operation: 'moved' }],
			})),
		};
		dashboard.showOverview(model);
		button(parent, 'View migration changes').click();
		const expanded = {
			open: [...parent.querySelectorAll('details')].map(element => element.open),
			focus: document.activeElement?.textContent?.includes('result-first'),
		};
		const available = [[], ['missing']].map(activityIds => {
			dashboard.showOverview({ ...model, result: { migratedCount: 2, activityIds } });
			return !!parent.querySelector('[aria-label="View migration changes"]');
		});
		assert.deepStrictEqual({ expanded, available }, {
			expanded: { open: [false, true, true], focus: true },
			available: [false, false],
		});
	});

	test('loading errors focus Retry and successful retry restores the original control', () => {
		const { parent, dashboard } = createDashboard();
		const model = overview();
		dashboard.showOverview(model);
		button(parent, 'Review User Data from Your profile').focus();
		dashboard.showLoading('Migrations', 'Loading migrations');
		dashboard.showLoading('Migrations unavailable', 'Try again.', () => {
			dashboard.showLoading('Migrations', 'Loading migrations');
			dashboard.showOverview(model);
		});
		const errorFocus = document.activeElement?.getAttribute('aria-label');
		button(parent, 'Retry loading migrations').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		assert.deepStrictEqual({
			errorFocus,
			retriedFocus: document.activeElement?.getAttribute('aria-label'),
		}, {
			errorFocus: 'Retry loading migrations',
			retriedFocus: 'Review User Data from Your profile',
		});
	});

	test('loading error and success do not steal focus after leaving the dashboard', () => {
		const { parent, dashboard } = createDashboard();
		const external = DOM.append(parent, DOM.$('button', {}, 'External control'));
		const snapshots = [false, true].map(fail => {
			dashboard.showOverview(overview());
			button(parent, 'Review User Data from Your profile').focus();
			dashboard.showLoading('Migrations', 'Loading migrations');
			external.focus();
			if (fail) {
				dashboard.showLoading('Migrations unavailable', 'Try again.', () => { });
			} else {
				dashboard.showOverview(overview());
			}
			const focusAfterUpdate = document.activeElement === external;
			dashboard.showOverview(overview());
			return { focusAfterUpdate, focusAfterOverview: document.activeElement === external };
		});
		assert.deepStrictEqual(snapshots, [
			{ focusAfterUpdate: true, focusAfterOverview: true },
			{ focusAfterUpdate: true, focusAfterOverview: true },
		]);
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
