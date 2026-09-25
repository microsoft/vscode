/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../../platform/contextview/browser/contextViewService.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../../workbench/services/views/common/viewsService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { IAgentWorkbenchLayoutService } from '../../../../../browser/workbench.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IChat } from '../../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { ISessionChangesService } from '../../../../changes/browser/sessionChangesService.js';
import { AgentHostSessionConfigPicker } from '../../browser/agentHostSessionConfigPicker.js';
import '../../../../chat/browser/media/chatWidget.css';
import '../../../../../browser/media/style.css';

async function renderIsolationPicker({ container, disposableStore, theme }: ComponentFixtureContext, value: 'worktree' | 'folder', devContainer = false): Promise<void> {
	container.classList.add('monaco-workbench', 'agent-sessions-workbench');
	container.style.width = '480px';
	container.style.height = '220px';
	container.style.padding = 'var(--vscode-spacing-size160)';
	const changed = disposableStore.add(new Emitter<string>());
	const config: ResolveSessionConfigResult = {
		schema: {
			type: 'object',
			properties: {
				[SessionConfigKey.Isolation]: {
					type: 'string',
					title: 'Where to run this session',
					enum: ['folder', 'worktree'],
				},
			},
		},
		values: { [SessionConfigKey.Isolation]: value },
	};
	const provider = new class extends mock<IAgentHostSessionsProvider>() {
		override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
		override readonly onDidChangeSessionConfig = changed.event;
		override getSessionConfig() { return config; }
		override getCreateSessionConfig() { return {}; }
		override isSessionConfigResolving() { return constObservable(false); }
		override isDevContainerEnabled() { return devContainer; }
		override async setSessionConfigValue(sessionId: string, property: string, nextValue: unknown) {
			config.values[property] = nextValue;
			changed.fire(sessionId);
		}
		override trackSessionConfigOperation(): void { }
	}();
	const session = constObservable<IActiveSession | undefined>(new class extends mock<IActiveSession>() {
		override readonly sessionId = 'fixture';
		override readonly providerId = provider.id;
		override readonly activeChat = constObservable(new class extends mock<IChat>() {
			override readonly changesets = constObservable(undefined);
		}());
	}());
	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme, additionalServices: registerWorkbenchServices });
	const providers: ISessionsProvider[] = [provider];
	instantiationService.stub(ISessionsProvidersService, {
		onDidChangeProviders: Event.None,
		getProviders: () => providers,
		getProvider: <T extends ISessionsProvider>(id: string) => providers.find(candidate => candidate.id === id) as T | undefined,
	});
	instantiationService.stub(IAgentWorkbenchLayoutService, { mainContainer: container });
	instantiationService.stub(ISessionChangesService, {});
	instantiationService.stub(IViewsService, {});
	instantiationService.set(ILayoutService, new class extends mock<ILayoutService>() {
		override readonly mainContainer = container;
		override readonly activeContainer = container;
		override readonly onDidLayoutContainer = Event.None;
		override getContainer() { return container; }
	}());
	instantiationService.set(IContextViewService, disposableStore.add(instantiationService.createInstance(ContextViewService)));
	instantiationService.set(IActionWidgetService, disposableStore.add(instantiationService.createInstance(ActionWidgetService)));
	const row = dom.append(container, dom.$('.new-chat-session-options'));
	const picker = disposableStore.add(instantiationService.createInstance(AgentHostSessionConfigPicker, session, SessionConfigKey.Isolation));
	const trigger = picker.render(row);
	picker.setFocusable(true);
	trigger?.click();
	await new Promise<void>(resolve => dom.getWindow(container).requestAnimationFrame(() => resolve()));
}

export default defineThemedFixtureGroup({ path: 'sessions/chat/isolationPicker/' }, {
	NewWorktree: defineComponentFixture({
		render: context => renderIsolationPicker(context, 'worktree'),
	}),
	Branch: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderIsolationPicker(context, 'folder'),
	}),
	DevContainer: defineComponentFixture({
		render: context => renderIsolationPicker(context, 'folder', true),
	}),
});
