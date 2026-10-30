/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { registerChatFixtureServices } from '../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IFormState, IValidationState, renderForm } from '../../browser/automationDialog.js';
import '../../browser/media/automationDialog.css';

function renderAutomationForm({ container, disposableStore, theme }: ComponentFixtureContext, interval: 'daily' | 'cron', width: number): void {
	container.classList.add('automation-dialog');
	container.style.width = `${width}px`;
	container.style.backgroundColor = 'var(--vscode-editorWidget-background)';
	const formPane = DOM.append(container, DOM.$('.automation-form-pane'));
	const form = DOM.append(formPane, DOM.$('.automation-form'));
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registerChatFixtureServices(registration);
			registration.define(IMenuService, MenuService);
			registration.define(IContextKeyService, ContextKeyService);
			registration.define(IHoverService, class extends HoverService {
				override showInstantHover(options: Parameters<IHoverService['showInstantHover']>[0]) {
					return super.showInstantHover({ ...options, container }, false);
				}
			});
			registration.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
				override readonly mainContainer = container;
				override readonly activeContainer = container;
				override readonly mainContainerDimension = { width, height: 800 };
				override readonly onDidChangePartVisibility = Event.None;
				override readonly onDidChangeWindowMaximized = Event.None;
				override getContainer() { return container; }
				override isVisible() { return true; }
			}());
			registration.defineInstance(IQuickInputService, new class extends mock<IQuickInputService>() {
				override readonly onShow = Event.None;
				override readonly onHide = Event.None;
			}());
			registration.defineInstance(IGitService, new class extends mock<IGitService>() {
				override async openRepository() { return undefined; }
			}());
			registration.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly automationSession = constObservable(undefined);
				override readonly onDidChangeSessionTypes = Event.None;
				override getAllProviderSessionTypes() { return []; }
				override getQuickChatSessionTypes() { return []; }
				override getSessionTypesForFolder() { return []; }
				override isNewSessionTargetAvailable() { return false; }
				override isQuickChatTargetAvailable() { return false; }
				override discardAutomationSession() { }
			}());
			registration.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders() { return []; }
				override getProvider() { return undefined; }
			}());
			registration.defineInstance(ISessionsRecentWorkspacesService, new class extends mock<ISessionsRecentWorkspacesService>() {
				override readonly onDidChangeRecentWorkspaces = Event.None;
				override readonly historyLoadState = constObservable('loaded' as const);
				override getRecentWorkspaces() { return []; }
				override isNoWorkspaceChecked() { return false; }
				override clearCheckedWorkspace() { }
			}());
			registration.defineInstance(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
				override readonly onDidChange = Event.None;
				override readonly onDidChangeDiscovering = Event.None;
				override readonly hosts = [];
				override readonly isDiscovering = false;
				override async rediscover() { return false; }
			}());
		},
	});
	const contextKeyService = instantiationService.get(IContextKeyService);
	ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
	const state: IFormState = {
		name: 'Morning workspace review',
		interval,
		cronExpression: '0 9 * * 1-5',
		timezoneOffset: 0,
		hour: 9,
		minute: 0,
		day: 1,
		isQuickChat: false,
		folderUri: undefined,
		providerId: undefined,
		sessionTypeId: undefined,
		isolationMode: undefined,
		branch: undefined,
		enabled: true,
	};
	const validation: IValidationState = {
		nameError: undefined,
		promptError: undefined,
		folderError: undefined,
		sessionTypeError: undefined,
		branchError: undefined,
	};
	renderForm(
		form, state, disposableStore, validation, () => { }, instantiationService, contextKeyService,
		instantiationService.get(IContextViewService), instantiationService.get(IConfigurationService),
		instantiationService.get(IWorkbenchLayoutService), instantiationService.get(ILogService),
		instantiationService.get(ISessionsManagementService), instantiationService.get(IWorkspaceTrustRequestService),
		'Review recent changes and summarize anything that needs attention.', undefined, undefined, constObservable([]),
	);
	// Avoid shared chat's auto-margin/min-content sizing in the isolated form.
	form.querySelector<HTMLElement>('.automation-form-prompt-host')!.style.width = '100%';
}

export default defineThemedFixtureGroup({ path: 'sessions/automations/dialog/' }, {
	PresetNormal: defineComponentFixture({ render: context => renderAutomationForm(context, 'daily', 640) }),
	CronNormal: defineComponentFixture({ render: context => renderAutomationForm(context, 'cron', 640) }),
	PresetNarrow: defineComponentFixture({ render: context => renderAutomationForm(context, 'daily', 360) }),
	CronNarrow: defineComponentFixture({ render: context => renderAutomationForm(context, 'cron', 360) }),
});
