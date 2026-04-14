/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IChatPromptSlashCommand, PromptsStorage } from '../../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { AICustomizationManagementSection, AI_CUSTOMIZATION_WELCOME_PAGE_VARIANT_SETTING, AICustomizationWelcomePageVariant } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { IAICustomizationWorkspaceService, IStorageSourceFilter } from '../../../../contrib/chat/common/aiCustomizationWorkspaceService.js';
import { PromptsType } from '../../../../contrib/chat/common/promptSyntax/promptTypes.js';
import { AICustomizationWelcomePage } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationWelcomePage.js';
import { ClassicAICustomizationWelcomePage } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationWelcomePageClassic.js';
import { PromptLaunchersAICustomizationWelcomePage } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationWelcomePagePromptLaunchers.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';

import '../../../../../platform/theme/common/colors/inputColors.js';
import '../../../../../platform/theme/common/colors/listColors.js';
import '../../../../contrib/chat/browser/aiCustomization/media/aiCustomizationManagement.css';

const visibleSections = new Set<AICustomizationManagementSection>([
	AICustomizationManagementSection.Agents,
	AICustomizationManagementSection.Skills,
	AICustomizationManagementSection.Instructions,
	AICustomizationManagementSection.Prompts,
	AICustomizationManagementSection.Hooks,
	AICustomizationManagementSection.McpServers,
	AICustomizationManagementSection.Plugins,
]);

const defaultFilter: IStorageSourceFilter = {
	sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension, PromptsStorage.plugin],
};

function createMockWorkspaceService(): IAICustomizationWorkspaceService {
	return new class extends mock<IAICustomizationWorkspaceService>() {
		override readonly isSessionsWindow = false;
		override readonly managementSections = Array.from(visibleSections);
		override readonly welcomePageFeatures = {
			showGettingStartedBanner: true,
		};
		override readonly activeProjectRoot = constObservable(URI.file('/workspace'));
		override readonly hasOverrideProjectRoot = constObservable(false);
		override getActiveProjectRoot(): URI {
			return URI.file('/workspace');
		}
		override getStorageSourceFilter(_type: PromptsType): IStorageSourceFilter {
			return defaultFilter;
		}
		override async commitFiles(): Promise<void> { }
		override async deleteFiles(): Promise<void> { }
		override async generateCustomization(): Promise<void> { }
		override setOverrideProjectRoot(): void { }
		override clearOverrideProjectRoot(): void { }
		override async getFilteredPromptSlashCommands(_token: CancellationToken): Promise<readonly IChatPromptSlashCommand[]> {
			return [];
		}
		override getSkillUIIntegrations(): ReadonlyMap<string, string> {
			return new Map();
		}
	}();
}

function createMockCommandService(): ICommandService {
	return new class extends mock<ICommandService>() {
		override async executeCommand<R = unknown>(_commandId: string, ..._args: unknown[]): Promise<R | undefined> {
			return undefined;
		}
	}();
}

function createHost(container: HTMLElement): HTMLElement {
	container.style.width = '1024px';
	container.style.height = '960px';
	const editor = DOM.append(container, DOM.$('.ai-customization-management-editor'));
	editor.style.height = '100%';
	const content = DOM.append(editor, DOM.$('.management-content'));
	return DOM.append(content, DOM.$('.content-inner'));
}

function renderClassicWelcomePage(ctx: ComponentFixtureContext): void {
	const host = createHost(ctx.container);
	const workspaceService = createMockWorkspaceService();
	const page = ctx.disposableStore.add(new ClassicAICustomizationWelcomePage(
		host,
		workspaceService.welcomePageFeatures,
		{
			selectSection: () => { },
			selectSectionWithMarketplace: () => { },
			closeEditor: () => { },
			prefillChat: () => { },
		},
		createMockCommandService(),
		workspaceService,
	));
	page.rebuildCards(visibleSections);
}

function renderPromptLaunchersWelcomePage(ctx: ComponentFixtureContext): void {
	const host = createHost(ctx.container);
	const workspaceService = createMockWorkspaceService();
	const page = ctx.disposableStore.add(new PromptLaunchersAICustomizationWelcomePage(
		host,
		workspaceService.welcomePageFeatures,
		{
			selectSection: () => { },
			selectSectionWithMarketplace: () => { },
			closeEditor: () => { },
			prefillChat: () => { },
		},
		createMockCommandService(),
		workspaceService,
		NullHoverService,
	));
	page.rebuildCards(visibleSections);
}

function renderSelectedWelcomePage(ctx: ComponentFixtureContext, variant: AICustomizationWelcomePageVariant): void {
	const host = createHost(ctx.container);
	const workspaceService = createMockWorkspaceService();
	const configService = new TestConfigurationService({
		[AI_CUSTOMIZATION_WELCOME_PAGE_VARIANT_SETTING]: variant,
	});
	const page = ctx.disposableStore.add(new AICustomizationWelcomePage(
		host,
		workspaceService.welcomePageFeatures,
		{
			selectSection: () => { },
			selectSectionWithMarketplace: () => { },
			closeEditor: () => { },
			prefillChat: () => { },
		},
		createMockCommandService(),
		workspaceService,
		configService,
		NullHoverService,
	));
	page.rebuildCards(visibleSections);
}

export default defineThemedFixtureGroup({ path: 'chat/aiCustomizations/' }, {
	WelcomePageClassic: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderClassicWelcomePage,
	}),
	WelcomePagePromptLaunchers: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderPromptLaunchersWelcomePage,
	}),
	WelcomePageSelectorClassic: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderSelectedWelcomePage(ctx, 'classic'),
	}),
	WelcomePageSelectorPromptLaunchers: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderSelectedWelcomePage(ctx, 'promptLaunchers'),
	}),
});
