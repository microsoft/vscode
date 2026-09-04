/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	CustomizationMigrationDashboard,
	type ICustomizationMigrationDashboardReviewItem,
} from '../../../browser/aiCustomization/customizationMigrationDashboard.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';

suite('CustomizationMigrationDashboard', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders scope overview and mixed migration review', () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const actions: string[] = [];
		const dashboard = store.add(new CustomizationMigrationDashboard(parent, {
			configureLocations: () => actions.push('configure'),
			dismissResult: () => actions.push('dismiss'),
			migrate: items => actions.push(`migrate:${items.map(item => item.label).join(',')}`),
			reviewScope: storage => actions.push(`review:${storage}`),
			reviewWithAgent: () => actions.push('agent'),
			setItemSelected: (item, selected) => actions.push(`select:${item.label}:${selected}`),
			setWorkspaceSkipped: skipped => actions.push(`skip:${skipped}`),
			showOverview: () => actions.push('overview'),
		}));

		try {
			dashboard.showOverview({
				scopes: [
					{ storage: PromptsStorage.user, label: 'Your profile', count: 2, skipped: false },
					{ storage: PromptsStorage.local, label: 'vscode', count: 1, skipped: false },
				],
			});
			const overviewButtons = [...parent.querySelectorAll<HTMLElement>('.monaco-button')];
			const overviewSummary = parent.querySelector('.customization-health-summary-pill')?.textContent;
			overviewButtons[0].click();
			overviewButtons.at(-2)?.click();
			overviewButtons.at(-1)?.click();
			dashboard.focus();

			const reviewItems: readonly ICustomizationMigrationDashboardReviewItem[] = [
				{
					customization: {
						uri: URI.file('/user-data/legacy.agent.md'),
						type: PromptsType.agent,
						storage: PromptsStorage.user,
					},
					label: 'legacy',
					sourceLabel: 'VS Code profile',
					targetLabel: '~/.agents/agents/legacy.agent.md',
					selected: true,
				},
				{
					customization: {
						uri: URI.file('/user-data/release.prompt.md'),
						type: PromptsType.prompt,
						storage: PromptsStorage.user,
					},
					label: 'release',
					sourceLabel: 'VS Code profile',
					targetLabel: '~/.agents/skills/release/SKILL.md',
					selected: true,
					metadataPreview: {
						unsupportedHeaderKeys: ['model'],
						sourceMetadata: '---\nname: release\nmodel: GPT-5\n---',
						targetMetadata: '---\nname: release\ndisable-model-invocation: true\n---',
					},
				},
			];
			dashboard.showReview({ title: 'Review your profile migration', items: reviewItems });
			const selection = parent.querySelector<HTMLElement>('.customization-health-review-row [role="checkbox"]');
			selection?.click();
			const metadataButton = [...parent.querySelectorAll<HTMLElement>('.monaco-button')]
				.find(button => button.textContent?.includes('View Metadata Changes'));
			metadataButton?.click();
			const metadataBackButton = parent.querySelector<HTMLElement>('.customization-health-back');
			metadataBackButton?.click();
			const migrateButton = [...parent.querySelectorAll<HTMLElement>('.monaco-button')]
				.find(button => button.textContent?.includes('Migrate'));
			migrateButton?.click();

			assert.deepStrictEqual({
				overviewSummary,
				scopeLabels: [...parent.querySelectorAll('.customization-health-review-section h2')].map(element => element.textContent),
				metricValues: [...parent.querySelectorAll('.customization-health-metric strong')].map(element => element.textContent),
				metadataButtonRestoredFocus: document.activeElement?.textContent?.includes('View Metadata Changes'),
				actions,
			}, {
				overviewSummary: '3 supported migrations',
				scopeLabels: ['Agents', 'Prompts to skills'],
				metricValues: ['0', '1', '1'],
				metadataButtonRestoredFocus: true,
				actions: [
					'configure',
					'skip:true',
					`review:${PromptsStorage.local}`,
					'select:legacy:false',
					'migrate:release',
				],
			});
		} finally {
			parent.remove();
		}
	});
});
