/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { Toggle } from '../../../../../base/browser/ui/toggle/toggle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { defaultToggleStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { createAgentsBanner } from '../../../../contrib/chat/browser/agentSessions/agentSessionsBanner.js';
import { AgentsWindowGraphic } from '../../../../contrib/chat/browser/agentSessions/agentsWindowGraphic.js';
import { AgentsWindowGraphicVariant, AgentsWindowSectionStyle, ChatConfiguration, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from '../../../../contrib/chat/common/constants.js';
import '../../../../contrib/welcomeGettingStarted/browser/media/gettingStarted.css';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IOpenedMainWindow } from '../../../../../platform/window/common/window.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

// The Agents window button only shows when its command is registered.
CommandsRegistry.registerCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, () => { });

const themes = ['darkModern', 'darkHighContrast', 'lightHighContrast'] as const;
const highContrastThemes = ['darkHighContrast', 'lightHighContrast'] as const;

export default defineThemedFixtureGroup({ path: 'welcome/' }, {
	None: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: themes,
		render: context => renderWelcomePageFooter(context, AgentsWindowGraphicVariant.None, 800),
	}),
	WindowComparison: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: themes,
		render: context => renderWelcomePageFooter(context, AgentsWindowGraphicVariant.WindowComparison, 800),
	}),
	WindowComparisonNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWelcomePageFooter(context, AgentsWindowGraphicVariant.WindowComparison, 420),
	}),
	ManyWindowsToOne: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: themes,
		render: context => renderWelcomePageFooter(context, AgentsWindowGraphicVariant.ManyWindowsToOne, 800),
	}),
	ManyWindowsToOneNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWelcomePageFooter(context, AgentsWindowGraphicVariant.ManyWindowsToOne, 420),
	}),
	AutoOneEditorWindow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWelcomePageFooter(context, AgentsWindowGraphicVariant.Auto, 800, 1),
	}),
	AutoMultipleEditorWindows: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWelcomePageFooter(context, AgentsWindowGraphicVariant.Auto, 800, 2),
	}),
	SectionCard: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: highContrastThemes,
		render: context => renderWelcomePageFooter(context, AgentsWindowGraphicVariant.WindowComparison, 800, 1, AgentsWindowSectionStyle.Card),
	}),
	SectionNone: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: highContrastThemes,
		render: context => renderWelcomePageFooter(context, AgentsWindowGraphicVariant.WindowComparison, 800, 1, AgentsWindowSectionStyle.None),
	}),
	SectionTint: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: highContrastThemes,
		render: context => renderWelcomePageFooter(context, AgentsWindowGraphicVariant.WindowComparison, 800, 1, AgentsWindowSectionStyle.Tint),
	}),
	SectionBand: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: highContrastThemes,
		render: context => renderWelcomePageFooter(context, AgentsWindowGraphicVariant.WindowComparison, 800, 1, AgentsWindowSectionStyle.Band),
	}),
	SectionSeparator: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: highContrastThemes,
		render: context => renderWelcomePageFooter(context, AgentsWindowGraphicVariant.WindowComparison, 800, 1, AgentsWindowSectionStyle.Separator),
	}),
});

/**
 * Renders the Welcome page footer (graphic, Agents window button and startup checkbox) within the Welcome page's DOM structure.
 * Without a section style, the section is styled like the setting's default.
 */
async function renderWelcomePageFooter({ container, disposableStore, theme }: ComponentFixtureContext, variant: AgentsWindowGraphicVariant, width: number, editorWindowCount = 1, sectionStyle?: AgentsWindowSectionStyle): Promise<void> {
	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	const configurationService = new TestConfigurationService({
		[ChatConfiguration.WelcomePageAgentsWindowGraphic]: variant,
		...(sectionStyle ? { [ChatConfiguration.WelcomePageAgentsWindowSectionStyle]: sectionStyle } : {}),
	});
	const chatEntitlementService = new class extends mock<IChatEntitlementService>() {
		override sentiment = {};
		override onDidChangeSentiment = Event.None;
	}();
	const editorWindows: IOpenedMainWindow[] = Array.from({ length: editorWindowCount }, (_, index) => ({ id: index + 1, title: '', dirty: false }));
	const hostService = new class extends mock<IHostService>() {
		override async getWindows() { return editorWindows; }
	}();
	const environmentService = new class extends mock<IWorkbenchEnvironmentService>() {
		override agentSessionsWorkspace = URI.file('/agent-sessions.code-workspace');
	}();

	const graphic = disposableStore.add(new AgentsWindowGraphic(configurationService, hostService, environmentService));
	if (variant !== AgentsWindowGraphicVariant.None) {
		await waitForState(graphic.shownDesign);
	}
	const banner = createAgentsBanner(
		{
			cssClass: 'getting-started-category.agents-banner',
			source: 'welcomePage',
			graphic: { element: graphic.element, shownDesign: graphic.shownDesign, isExposed: constObservable(true) },
		},
		instantiationService.get(ICommandService),
		NullTelemetryService,
		configurationService,
		chatEntitlementService,
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

	const footer = $('.footer', {},
		banner.element,
		$('p.showOnStartup', {}, showOnStartup.domNode, $('label.caption', { for: 'showOnStartup' }, 'Show welcome page on startup')),
	);
	const categoriesContainer = $('.gettingStartedCategoriesContainer', { 'data-agents-window-section-style': graphic.sectionStyle.get() }, footer);
	if (graphic.shownDesign.get()) {
		// The Welcome page's layout when the graphic fits with room to spare
		categoriesContainer.classList.add('agents-window-graphic-shown', 'agents-window-graphic-spacious');
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

	// The Welcome page slides are absolutely positioned, so size the page to the footer.
	content.style.height = `${footer.offsetHeight + 24}px`;
}
