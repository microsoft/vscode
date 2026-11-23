/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMissionControlEnvironmentService } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureDomCondition } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { AutomationsModalWidget } from '../../browser/automationsModalWidget.js';
import { TableAutomationService, TableEnvironmentService, TableRemoteService, registerAutomationHistoryFixtureMenus, setupModalHistoryServices } from './automationsTableTestUtils.js';
import { createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';

registerAutomationHistoryFixtureMenus();

async function render(ctx: ComponentFixtureContext, state: 'ready' | 'empty' | 'unavailable' | 'history' = 'ready', width = 1100): Promise<void> {
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = '560px';
	const automations = new TableAutomationService();
	if (state === 'empty') {
		automations.automations.set([], undefined);
	}
	if (state === 'unavailable') {
		automations.mutable = false;
		automations.runnable = false;
		automations.catalogueState.set('unavailable', undefined);
		automations.unavailableProviders.set([{ id: 'local', label: 'This Computer', unavailableReasonCode: 'disconnected' }], undefined);
	}
	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IContextKeyService, ContextKeyService);
			reg.define(IMenuService, MenuService);
			reg.defineInstance(IConfigurationService, new TestConfigurationService({ chat: { automations: { cloud: { enabled: true } } } }));
			reg.define(IListService, ListService);
			reg.defineInstance(IAutomationService, automations);
			reg.defineInstance(IRemoteAgentHostService, new TableRemoteService());
			reg.defineInstance(IMissionControlEnvironmentService, new TableEnvironmentService());
		},
	});
	ChatContextKeys.enabled.bindTo(instantiationService.get(IContextKeyService)).set(true);
	ChatAutomationsEnabledContext.bindTo(instantiationService.get(IContextKeyService)).set(true);
	const historyServices = setupModalHistoryServices(instantiationService, ctx.disposableStore);
	if (state === 'history') {
		const session = createTestSession('Daily review completed', { status: SessionStatus.Completed }).session;
		historyServices.sessions.sessions = [session];
		automations.runs.set(automations.runs.get().map(run => ({ ...run, sessionResource: session.resource })), undefined);
	}
	const widget = ctx.disposableStore.add(instantiationService.createInstance(AutomationsModalWidget, ctx.container, async () => { }, async () => { }));
	widget.layout();
	if (state === 'history') {
		ctx.container.querySelectorAll<HTMLElement>('.automations-modal-table .monaco-list-row')[1].click();
		await waitForFixtureDomCondition(ctx.container, () => !!ctx.container.querySelector('.automations-modal-history .session-title'), ctx.disposableStore);
		widget.layout();
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/automations/modal/' }, {
	ThreeAutomations: defineComponentFixture({ render: ctx => render(ctx) }),
	Empty: defineComponentFixture({ render: ctx => render(ctx, 'empty') }),
	UnavailableProvider: defineComponentFixture({ render: ctx => render(ctx, 'unavailable') }),
	SelectedHistory: defineComponentFixture({ render: ctx => render(ctx, 'history') }),
	NarrowHistory: defineComponentFixture({ render: ctx => render(ctx, 'history', 400) }),
});
