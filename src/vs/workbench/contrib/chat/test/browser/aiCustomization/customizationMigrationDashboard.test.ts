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
		store.add(toDisposable(() => parent.remove()));
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() {
			override setupDelayedHover() { return Disposable.None; }
		});
		const dashboard = store.add(instantiationService.createInstance(CustomizationMigrationDashboard, parent, {
			configureLocations: () => { },
			dismissResult: () => { },
			reviewCategory: () => { },
			setWorkspaceSkipped: () => { },
			dismissActivity: () => { },
			...callbacks,
		}));
		return { parent, dashboard };
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
						{ id: CustomizationMigrationCategoryId.PromptFiles, label: 'Prompts to skills', description: 'Convert prompts to skills.', count: 2, countLabel: '2 prompts', highRisk: true },
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
		const { parent, dashboard } = createDashboard({
			configureLocations: storage => actions.push(`destinations:${storage}`),
			reviewCategory: (id, storage) => actions.push(`review:${id}:${storage}`),
		});
		dashboard.showOverview(overview());
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
			focus: document.activeElement?.getAttribute('aria-label'),
			actions,
		}, {
			title: 'Migrations',
			categories: ['Prompts to skills', 'User Data', 'MCP Servers'],
			counts: ['2 prompts', '2 agents · 1 instruction', '1 server'],
			highRisk: 'High risk',
			progress: '0 of 2 complete',
			workspaceDescription: 'Workspace customizations. Skip this workspace if you do not own it.',
			focus: 'Change destinations for Your profile',
			workspaceDestinationButton: false,
			actions: ['review:promptFiles:user', 'review:userData:user', 'review:mcpServers:local', 'destinations:user'],
		});
	});

	test('skipping and including workspace preserves focus through loading and hides its categories', () => {
		let model = overview();
		const { parent, dashboard } = createDashboard({
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
		}, {
			skipped: { progress: '1 of 2 complete', state: 'Skipped', categories: 0, focus: 'Include workspace vscode' },
			included: false,
			categories: 3,
			focus: 'Skip workspace vscode',
		});
	});

	test('renders completed, in-progress and empty states without review controls', () => {
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
		}, { states: ['Migrated', 'In progress'], progress: '1 of 2 complete', completedDestinations: 0, empty: 'No migrations are needed.', buttons: 0, focus: 'H1' });
	});

	test('View Changes expands newest activity and dismissals restore meaningful focus', () => {
		let model: ICustomizationMigrationDashboardOverview = {
			...overview(),
			result: { migratedCount: 1 },
			activity: ['latest', 'previous'].map(id => ({
				id, categoryLabel: 'Prompts to skills', scopeLabel: id, storage: PromptsStorage.user,
				items: [{ label: 'release', sourceLabel: 'profile/release.prompt.md', targetLabel: '~/.agents/skills/release/SKILL.md', operation: 'converted' }],
			})),
		};
		let contentChanges = 0;
		const { parent, dashboard } = createDashboard({
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
		button(parent, 'Dismiss Prompts to skills activity from previous').click();
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
		}, {
			expanded: {
				open: [true, false],
				focus: 'SUMMARY',
				disclosureAriaHidden: 'true',
				disclosureLabels: ['', ''],
				operation: 'Converted to skill',
				paths: ['profile/release.prompt.md', '~/.agents/skills/release/SKILL.md'],
			},
			remainedOpen: true, nextFocused: true, lastDismissFocus: 'Your migration checklist',
			result: false, activity: false, focus: 'Your migration checklist', notified: true,
		});
	});

	test('retry loading uses standard keyboard-activated Button and focus remains usable', () => {
		let retries = 0;
		const { parent, dashboard } = createDashboard();
		dashboard.showLoading('Migrations unavailable', 'Try again.', () => retries++);
		const retry = button(parent, 'Retry loading migrations');
		retry.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		dashboard.focus();
		assert.deepStrictEqual({
			retries,
			busy: parent.querySelector('.migration-page')?.getAttribute('aria-busy'),
			focus: document.activeElement?.textContent,
		}, { retries: 1, busy: 'false', focus: 'Migrations unavailable' });
	});
});
