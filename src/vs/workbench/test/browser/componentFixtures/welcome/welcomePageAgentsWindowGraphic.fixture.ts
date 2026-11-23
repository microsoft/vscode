/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { Toggle } from '../../../../../base/browser/ui/toggle/toggle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { defaultToggleStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { createAgentsBanner } from '../../../../contrib/chat/browser/agentSessions/agentSessionsBanner.js';
import { AgentsWindowGraphic } from '../../../../contrib/chat/browser/agentSessions/agentsWindowGraphic.js';
import { AgentsWindowGraphicVariant, AgentsWindowSectionStyle, ChatConfiguration, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from '../../../../contrib/chat/common/constants.js';
import '../../../../contrib/welcomeGettingStarted/browser/media/gettingStarted.css';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

// The Agents window button only shows when its command is registered.
CommandsRegistry.registerCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, () => { });

const themes = ['darkModern', 'darkHighContrast', 'lightHighContrast'] as const;
const highContrastThemes = ['darkHighContrast', 'lightHighContrast'] as const;

export default defineThemedFixtureGroup({ path: 'welcome/' }, {
	None: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: themes,
		render: context => renderWelcomePageAgentsSection(context, AgentsWindowGraphicVariant.None, 800),
	}),
	WindowComparison: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: themes,
		render: context => renderWelcomePageAgentsSection(context, AgentsWindowGraphicVariant.WindowComparison, 800),
	}),
	WindowComparisonNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWelcomePageAgentsSection(context, AgentsWindowGraphicVariant.WindowComparison, 420),
	}),
	Banner: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: themes,
		render: context => renderWelcomePageAgentsSection(context, AgentsWindowGraphicVariant.Banner, 1000),
	}),
	BannerCompact: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWelcomePageAgentsSection(context, AgentsWindowGraphicVariant.Banner, 800, { layout: 'compact' }),
	}),
	BannerNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWelcomePageAgentsSection(context, AgentsWindowGraphicVariant.Banner, 420),
	}),
	SectionCard: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: highContrastThemes,
		render: context => renderWelcomePageAgentsSection(context, AgentsWindowGraphicVariant.WindowComparison, 800, { sectionStyle: AgentsWindowSectionStyle.Card }),
	}),
	SectionNone: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: highContrastThemes,
		render: context => renderWelcomePageAgentsSection(context, AgentsWindowGraphicVariant.WindowComparison, 800, { sectionStyle: AgentsWindowSectionStyle.None }),
	}),
	SectionTint: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: highContrastThemes,
		render: context => renderWelcomePageAgentsSection(context, AgentsWindowGraphicVariant.WindowComparison, 800, { sectionStyle: AgentsWindowSectionStyle.Tint }),
	}),
	SectionBand: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: highContrastThemes,
		render: context => renderWelcomePageAgentsSection(context, AgentsWindowGraphicVariant.WindowComparison, 800, { sectionStyle: AgentsWindowSectionStyle.Band }),
	}),
	SectionSeparator: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: highContrastThemes,
		render: context => renderWelcomePageAgentsSection(context, AgentsWindowGraphicVariant.WindowComparison, 800, { sectionStyle: AgentsWindowSectionStyle.Separator }),
	}),
});

/**
 * Renders the Welcome page's Agents window section within the Welcome page's DOM structure: the banner below the page's
 * title, or the footer with the graphic, Agents window button and startup checkbox. Without a section style, the
 * window comparison is styled like the setting's default. Without a layout, the graphic fits with room to spare.
 */
function renderWelcomePageAgentsSection({ container, disposableStore, theme }: ComponentFixtureContext, variant: AgentsWindowGraphicVariant, width: number, options: { sectionStyle?: AgentsWindowSectionStyle; layout?: 'spacious' | 'compact' } = {}): void {
	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	const configurationService = new TestConfigurationService({
		[ChatConfiguration.WelcomePageAgentsWindowGraphic]: variant,
		...(options.sectionStyle ? { [ChatConfiguration.WelcomePageAgentsWindowSectionStyle]: options.sectionStyle } : {}),
	});
	// Graphics are only shown to signed-in users.
	const chatEntitlementService = new class extends mock<IChatEntitlementService>() {
		override sentiment = {};
		override onDidChangeSentiment = Event.None;
		override entitlementObs = constObservable(ChatEntitlement.Pro);
	}();
	const account = new class extends mock<IDefaultAccount>() { }();
	const defaultAccountService = new class extends mock<IDefaultAccountService>() {
		override currentDefaultAccount = account;
		override onDidChangeDefaultAccount = Event.None;
		override async getDefaultAccount(): Promise<IDefaultAccount | null> {
			return account;
		}
	}();

	const graphic = disposableStore.add(new AgentsWindowGraphic(configurationService, instantiationService.get(IStorageService), new NullWorkbenchAssignmentService(), instantiationService.get(ILogService), chatEntitlementService, defaultAccountService));
	const banner = createAgentsBanner(
		{
			cssClass: 'getting-started-category.agents-banner',
			graphic: { element: graphic.element, design: graphic.design, shownDesign: graphic.shownDesign, signedIn: graphic.signedIn, isExposed: constObservable(true), bannerCopyResolved: graphic.bannerCopyResolved, hide: () => graphic.hide() },
		},
		instantiationService.get(ICommandService),
		NullTelemetryService,
		configurationService,
		chatEntitlementService,
		defaultAccountService,
		instantiationService.get(IContextMenuService),
	);
	disposableStore.add(banner.disposables);

	const showOnStartup = disposableStore.add(new Toggle({
		icon: Codicon.check,
		actionClassName: 'getting-started-checkbox',
		isChecked: true,
		title: 'When checked, this page will be shown on startup.',
		...defaultToggleStyles,
	}));
	showOnStartup.domNode.id = 'showOnStartup';

	// The banner leads the page below its title, while the other graphic sits above the button in the footer.
	const isBanner = variant === AgentsWindowGraphicVariant.Banner;
	const footer = $('.footer', {},
		...(isBanner ? [] : [banner.element]),
		$('p.showOnStartup', {}, showOnStartup.domNode, $('label.caption', { for: 'showOnStartup' }, 'Show welcome page on startup')),
	);
	const categoriesContainer = $('.gettingStartedCategoriesContainer', {
		'data-agents-window-graphic': variant,
		'data-agents-window-section-style': graphic.sectionStyle.get(),
	}, ...(isBanner ? [banner.element] : []), footer);
	if (graphic.shownDesign.get()) {
		categoriesContainer.classList.add('agents-window-graphic-shown', ...(options.layout === 'compact' ? [] : ['agents-window-graphic-spacious']));
	}
	const content = $('.content', {},
		$('.gettingStartedContainer.height-constrained', {},
			$('.gettingStarted.showCategories', {},
				$('.gettingStartedSlideCategories.gettingStartedSlide', {}, categoriesContainer),
			),
		),
	);
	content.style.background = 'var(--vscode-editor-background)';
	container.style.width = `${width}px`;
	container.appendChild($('.part.editor', {}, content));

	// The Welcome page slides are absolutely positioned, so size the page to its content, which ends with the footer and the slide's padding.
	content.style.height = `${footer.offsetTop + footer.offsetHeight + 12}px`;
}
