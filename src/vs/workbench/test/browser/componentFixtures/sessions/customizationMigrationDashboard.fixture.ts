/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
import {
	CustomizationMigrationDashboard,
	type ICustomizationMigrationDashboardReviewItem,
} from '../../../../contrib/chat/browser/aiCustomization/customizationMigrationDashboard.js';
import { PromptFileSource, PromptsType } from '../../../../contrib/chat/common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

const reviewItems: readonly ICustomizationMigrationDashboardReviewItem[] = [
	{
		customization: {
			uri: URI.file('/user-data/prompts/release-manager.agent.md'),
			type: PromptsType.agent,
			storage: PromptsStorage.user,
			source: PromptFileSource.UserData,
		},
		label: 'release-manager',
		sourceLabel: 'VS Code profile',
		targetLabel: '~/.agents/agents/release-manager.agent.md',
		selected: true,
	},
	{
		customization: {
			uri: URI.file('/user-data/prompts/typescript-style.instructions.md'),
			type: PromptsType.instructions,
			storage: PromptsStorage.user,
			source: PromptFileSource.UserData,
		},
		label: 'typescript-style',
		sourceLabel: 'VS Code profile',
		targetLabel: '~/.agents/instructions/typescript-style.instructions.md',
		selected: true,
	},
	{
		customization: {
			uri: URI.file('/user-data/prompts/prepare-release.prompt.md'),
			type: PromptsType.prompt,
			storage: PromptsStorage.user,
			source: PromptFileSource.UserData,
		},
		label: 'prepare-release',
		sourceLabel: 'VS Code profile',
		targetLabel: '~/.agents/skills/prepare-release/SKILL.md',
		selected: true,
		metadataPreview: {
			unsupportedHeaderKeys: ['model', 'tools'],
			sourceMetadata: '---\nname: prepare-release\ndescription: Prepare a release\nmodel: GPT-5\ntools: [search, edit]\n---',
			targetMetadata: '---\nname: prepare-release\ndescription: Prepare a release\ndisable-model-invocation: true\n---',
		},
	},
];

export default defineThemedFixtureGroup({ path: 'chat/aiCustomizations/' }, {
	HealthCheck: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderDashboard(ctx, 860, 'overview'),
	}),
	HealthCheckNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 420, 'overview'),
	}),
	HealthCheckReview: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderDashboard(ctx, 860, 'review'),
	}),
	HealthCheckMetadata: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderDashboard(ctx, 860, 'metadata'),
	}),
});

function renderDashboard(
	{ container, disposableStore }: ComponentFixtureContext,
	width: number,
	view: 'overview' | 'review' | 'metadata',
): void {
	container.classList.add('ai-customization-management-editor');
	container.style.width = `${width}px`;
	container.style.height = '620px';
	container.style.boxSizing = 'border-box';
	container.style.overflow = 'auto';

	const host = DOM.append(container, DOM.$('.prompt-migration-content-container'));
	host.classList.toggle('narrow-layout', width < 500);
	const dashboard = disposableStore.add(new CustomizationMigrationDashboard(host, {
		configureLocations: () => { },
		dismissResult: () => { },
		migrate: () => { },
		reviewScope: () => { },
		reviewWithAgent: () => { },
		setItemSelected: () => { },
		setWorkspaceSkipped: () => { },
		showOverview: () => { },
	}));
	if (view === 'overview') {
		dashboard.showOverview({
			scopes: [
				{ storage: PromptsStorage.user, label: 'Your profile', count: 20, skipped: false },
				{ storage: PromptsStorage.local, label: 'vscode', count: 9, skipped: false },
			],
		});
		return;
	}
	dashboard.showReview({ title: 'Review your profile migration', items: reviewItems });
	if (view === 'metadata') {
		const metadataButton = [...container.querySelectorAll<HTMLElement>('.monaco-button')]
			.find(button => button.textContent?.includes('View Metadata Changes'));
		metadataButton?.click();
	}
}
