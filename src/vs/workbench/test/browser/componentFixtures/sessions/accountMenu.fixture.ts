/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Action } from '../../../../../base/common/actions.js';
import { timeout } from '../../../../../base/common/async.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { AgentHostCodexAgentEnabledSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
// eslint-disable-next-line local/code-import-patterns
import { TitleBarAccountWidget } from '../../../../../sessions/contrib/accountMenu/browser/account.contribution.js';
import { ChatPetAchievementIds } from '../../../../contrib/chat/browser/chatPetAchievements.js';
import { IChatPetService } from '../../../../contrib/chat/browser/chatPetService.js';
import { IChatStatusItemService } from '../../../../contrib/chat/browser/chatStatus/chatStatusItemService.js';
import { ICodexAccountService, ICodexAccountViewInfo } from '../../../../services/agentHost/browser/codexAccountService.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { TestTextResourceConfigurationService } from '../../workbenchTestServices.js';
import { configureChatPetFixtureFileRoot, FixtureChatPetService } from '../chat/chatPetFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

type UsageState = 'both' | 'weeklyOnly' | 'fiveHourOnly' | 'unavailable' | 'withoutReset';

async function renderAccountMenu(context: ComponentFixtureContext, usageState: UsageState): Promise<void> {
	const { container, disposableStore } = context;
	container.classList.add('agent-sessions-workbench');
	container.style.width = '448px';
	container.style.height = '540px';
	container.style.padding = '24px';
	container.style.boxSizing = 'border-box';
	container.style.position = 'relative';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
	configureChatPetFixtureFileRoot(disposableStore);

	const now = Math.floor(Date.now() / 1000);
	const weekly = { usedPercent: 35, windowDurationMins: 7 * 24 * 60, resetsAt: now + 5 * 24 * 60 * 60 };
	const fiveHour = { usedPercent: 12, windowDurationMins: 5 * 60, resetsAt: now + 2 * 60 * 60 };
	const account: ICodexAccountViewInfo = {
		status: 'signedIn',
		email: 'alex@example.com',
		planType: 'plus',
		rateLimit: usageState === 'weeklyOnly' ? weekly : undefined,
		rateLimits: usageState === 'both' ? [weekly, fiveHour]
			: usageState === 'fiveHourOnly' ? [fiveHour]
				: usageState === 'withoutReset' ? [{ ...weekly, usedPercent: 100, resetsAt: undefined }, { ...fiveHour, usedPercent: 0, resetsAt: undefined }]
					: undefined,
	};
	const defaultAccount = new class extends mock<IDefaultAccount>() {
		override readonly accountName = 'Alex';
		override readonly sessionId = 'fixture-session';
		override readonly authenticationProvider = { id: 'github', name: 'GitHub', scopes: [], enterprise: false };
	}();
	const configurationService = new TestConfigurationService({ [AgentHostCodexAgentEnabledSettingId]: true });
	disposableStore.add(configurationService.onDidChangeConfigurationEmitter);
	const chatPetService = disposableStore.add(new FixtureChatPetService({
		enabled: true,
		unlockedAchievements: [ChatPetAchievementIds.FirstChatMessage, ChatPetAchievementIds.IntegratedBrowserShared, ChatPetAchievementIds.ModelSwitch],
	}));
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		fileIconTheme: context.fileIconTheme,
		additionalServices: registry => {
			registerWorkbenchServices(registry);
			registry.defineInstance(IConfigurationService, configurationService);
			registry.define(IContextKeyService, ContextKeyService);
			registry.define(IMenuService, MenuService);
			registry.define(IMarkdownRendererService, MarkdownRendererService);
			registry.defineInstance(ITextResourceConfigurationService, new TestTextResourceConfigurationService(configurationService));
			registry.defineInstance(IEditorService, new class extends mock<IEditorService>() { }());
			registry.defineInstance(IChatPetService, chatPetService);
			registry.definePartialInstance(IDefaultAccountService, {
				onDidChangeDefaultAccount: Event.None,
				currentDefaultAccount: defaultAccount,
				getDefaultAccount: async () => defaultAccount,
				resolveGitHubUrl: path => `https://github.com/${path}`,
			});
			registry.definePartialInstance(IAuthenticationService, {
				onDidChangeSessions: Event.None,
				getSessions: async () => [],
			});
			registry.definePartialInstance(ICodexAccountService, {
				agent: 'codex',
				account,
				onDidChangeAccount: Event.None,
				signIn: () => { },
				signOut: () => { },
			});
			registry.definePartialInstance(IChatEntitlementService, {
				entitlement: ChatEntitlement.Enterprise,
				sentiment: { completed: true, installed: true },
				quotas: {
					premiumChat: { unlimited: true, percentRemaining: 100, creditsUsed: 123456, resetAt: Date.UTC(2026, 5, 1) / 1000 },
				},
				anonymous: false,
				onDidChangeEntitlement: Event.None,
				onDidChangeSentiment: Event.None,
				onDidChangeQuotaExceeded: Event.None,
				onDidChangeQuotaRemaining: Event.None,
				update: async () => { },
			});
			registry.definePartialInstance(IChatStatusItemService, {
				onDidChange: Event.None,
				getEntries: () => [{ id: 'semantic-index', label: 'Codebase Semantic Index', description: 'Available', detail: undefined, tooltip: undefined }],
			});
			registry.definePartialInstance(ILayoutService, { getContainer: () => container });
			registry.define(IHoverService, class extends HoverService {
				override showInstantHover(options: Parameters<IHoverService['showInstantHover']>[0]) {
					return super.showInstantHover({ ...options, container }, false);
				}
			});
		},
	});
	instantiationService.invokeFunction(accessor => accessor.get(IContextKeyService).createKey('defaultAccountStatus', 'available'));

	const titleBar = DOM.append(container, DOM.$('div'));
	titleBar.style.display = 'flex';
	titleBar.style.justifyContent = 'flex-end';
	titleBar.style.height = '28px';
	const actionHost = DOM.append(titleBar, DOM.$('div'));
	const action = disposableStore.add(new Action('fixture.account', 'Account'));
	const widget = disposableStore.add(instantiationService.createInstance(TitleBarAccountWidget, action, undefined));
	widget.render(actionHost);
	// Let the normal asynchronous account lookup finish before opening the popover.
	await timeout(0);
	widget.onClick();
	const panel = container.querySelector<HTMLElement>('.sessions-account-titlebar-panel');
	if (!panel) {
		throw new Error('Account popover fixture did not open the account panel.');
	}
	container.style.height = `${Math.ceil(panel.getBoundingClientRect().bottom - container.getBoundingClientRect().top) + 24}px`;
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	WeeklyAndFiveHourLimits: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderAccountMenu(context, 'both'),
	}),
	WeeklyLimitOnly: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAccountMenu(context, 'weeklyOnly'),
	}),
	FiveHourLimitOnly: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAccountMenu(context, 'fiveHourOnly'),
	}),
	UsageUnavailable: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAccountMenu(context, 'unavailable'),
	}),
	LimitsWithoutReset: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAccountMenu(context, 'withoutReset'),
	}),
});
