/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IInlineCompletionsService } from '../../../../../editor/browser/services/inlineCompletionsService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../test/browser/componentFixtures/fixtureUtils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatStatusDashboard } from '../../browser/chatStatus/chatStatusDashboard.js';
import { IChatStatusItemService } from '../../browser/chatStatus/chatStatusItemService.js';
import '../../browser/chatStatus/media/chatStatus.css';

async function renderDashboard({ container, disposableStore }: ComponentFixtureContext, variant: 'control' | 'treatment'): Promise<void> {
	container.style.width = '360px';
	container.style.padding = '12px';
	container.style.background = 'var(--vscode-editorHoverWidget-background)';
	const accountChanged = disposableStore.add(new Emitter<IDefaultAccount | null>());
	let account: IDefaultAccount = {
		authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
		accountName: 'example',
		sessionId: 'fixture-session',
		enterprise: false,
		entitlementsDataFetchedAt: Date.now() - 1000,
		entitlementsData: {
			access_type_sku: 'free_limited_copilot',
			chat_enabled: true,
			assigned_date: '',
			can_signup_for_limited: false,
			copilot_plan: '',
			organization_login_list: [],
			analytics_tracking_id: 'fixture-identity',
			can_request_copilot_access: true,
			copilot_access_request_assignment: { variant, assignment_context: 'fixture-assignment', data_version: 1 }
		}
	};
	const entitlementService = new class extends mock<IChatEntitlementService>() {
		override readonly entitlement = ChatEntitlement.Free;
		override readonly sentiment = { completed: true };
		override readonly quotas = {
			chat: { percentRemaining: 70, unlimited: false },
			completions: { percentRemaining: 85, unlimited: false },
			canUpgradePlan: true,
		};
		override readonly onDidChangeQuotaRemaining = Event.None;
		override readonly onDidChangeQuotaExceeded = Event.None;
		override readonly onDidChangeSentiment = Event.None;
		override async update(): Promise<void> {
			await timeout(1);
			account = { ...account, entitlementsDataFetchedAt: Date.now() };
			accountChanged.fire(account);
		}
	}();
	const configurationService = new TestConfigurationService({ 'telemetry.telemetryLevel': 'all' });
	disposableStore.add(configurationService.onDidChangeConfigurationEmitter);
	const instantiation = workbenchInstantiationService({ configurationService: () => configurationService }, disposableStore);
	instantiation.stub(IChatEntitlementService, entitlementService);
	instantiation.stub(IDefaultAccountService, upcastPartial<IDefaultAccountService>({
		get currentDefaultAccount() { return account; },
		onDidChangeDefaultAccount: accountChanged.event,
		resolveGitHubUrl: path => `https://github.com/${path}`,
	}));
	instantiation.stub(IAuthenticationService, upcastPartial<IAuthenticationService>({ onDidChangeSessions: Event.None }));
	instantiation.stub(IChatStatusItemService, upcastPartial<IChatStatusItemService>({ getEntries: () => [], onDidChange: Event.None }));
	instantiation.stub(IInlineCompletionsService, upcastPartial<IInlineCompletionsService>({ onDidChangeIsSnoozing: Event.None }));
	instantiation.stub(IMarkdownRendererService, upcastPartial<IMarkdownRendererService>({}));
	const dashboard = disposableStore.add(instantiation.createInstance(ChatStatusDashboard, {
		disableInlineSuggestionsSettings: true,
		disableModelSelection: true,
		disableProviderOptions: true,
		disableCompletionsSnooze: true,
	}));
	container.appendChild(dashboard.element);
	await timeout(10);
}

export default defineThemedFixtureGroup({ path: 'chat/accessRequest/' }, {
	Control: defineComponentFixture({ render: context => renderDashboard(context, 'control') }),
	Treatment: defineComponentFixture({ render: context => renderDashboard(context, 'treatment') }),
});
