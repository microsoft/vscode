/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { CLOSE_MODAL_EDITOR_COMMAND_ID, setup as setupEditorCommands, TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID, TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID } from '../../../../../workbench/browser/parts/editor/editorCommands.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../../workbench/common/editor.js';
import { IChatDebugService } from '../../../../../workbench/contrib/chat/common/chatDebugService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatGoalSummaryService } from '../../../../../workbench/contrib/chat/browser/chatGoalSummaryService.js';
import { ChatLayoutService } from '../../../../../workbench/contrib/chat/browser/widget/chatLayoutService.js';
import { IChatTipService } from '../../../../../workbench/contrib/chat/browser/chatTipService.js';
import { IChatLayoutService } from '../../../../../workbench/contrib/chat/common/widget/chatLayoutService.js';
import { ChatAgentService, IChatAgentService } from '../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { IPromptsService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { ILanguageModelToolsService } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { EditorService } from '../../../../../workbench/services/editor/browser/editorService.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { ComponentFixtureContext, ServiceRegistration } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { createEditorParts, TestLayoutService, TestLifecycleService, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { IChatViewFactory } from '../../../../services/chatView/browser/chatViewFactory.js';
import { ISessionsChatBackgroundService } from '../../../../services/chatBackground/browser/chatBackgroundService.js';
import { ISessionOpenTelemetryService } from '../../../../services/sessions/browser/sessionOpenTelemetryService.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IAgentFeedbackService } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { ChatView } from '../../../chat/browser/chatView.js';
import { ISessionsChatViewStateService, SessionsChatViewStateService } from '../../../chat/browser/chatViewStateService.js';
import { ISessionArchiveNudgeService } from '../../../chat/browser/sessionArchiveNudge.js';
import { ISessionChatPillsDebugService } from '../../../chat/browser/sessionChatInputToolbarDebug.js';
import { IGitHubService } from '../../../github/browser/githubService.js';

if (!CommandsRegistry.getCommand(CLOSE_MODAL_EDITOR_COMMAND_ID)) {
	setupEditorCommands();
}

export function registerSessionReviewConversationServices(registration: ServiceRegistration, container: HTMLElement, dimension: { readonly width: number; readonly height: number }): void {
	registration.define(ILifecycleService, TestLifecycleService);
	registration.define(IChatAgentService, ChatAgentService);
	registration.define(IChatLayoutService, ChatLayoutService);
	registration.definePartialInstance(IChatDebugService, { onDidAddEvent: Event.None, getEvents: () => [] });
	registration.definePartialInstance(IChatGoalSummaryService, {});
	registration.definePartialInstance(IChatTipService, {
		onDidDismissTip: Event.None, onDidNavigateTip: Event.None, onDidHideTip: Event.None, onDidDisableTips: Event.None,
		getWelcomeTip: () => undefined, resetSession: () => { }, hasMultipleTips: () => false,
	});
	registration.definePartialInstance(ILanguageModelToolsService, {
		onDidChangeTools: Event.None, onDidPrepareToolCallBecomeUnresponsive: Event.None, onDidInvokeTool: Event.None,
		getTools: () => [], observeTools: () => constObservable([]), getToolSetsForModel: () => [],
	});
	registration.define(ISessionsChatViewStateService, SessionsChatViewStateService);
	registration.definePartialInstance(ISessionChatPillsDebugService, { register: () => Disposable.None, clear: () => { } });
	registration.definePartialInstance(ISessionOpenTelemetryService, {
		modelBound: () => { }, modelUnbound: () => { },
		modelBindFailed: () => { throw new Error('Native fixture conversation failed to bind'); },
	});
	registration.definePartialInstance(ISessionsChatBackgroundService, { onDidChangeBackground: Event.None, getBackground: () => undefined });
	registration.definePartialInstance(ISessionsPartService, {});
	registration.definePartialInstance(ISessionArchiveNudgeService, {});
	registration.definePartialInstance(IGitHubService, {});
	registration.definePartialInstance(ISessionChangesService, { activeSessionUncommittedChangesCountObs: constObservable(undefined) });
	registration.definePartialInstance(IAgentWorkbenchLayoutService, {
		isSinglePaneLayoutEnabled: false, mainContainer: container, mainContainerDimension: dimension,
		getContainer: () => container, onDidChangePartVisibility: Event.None, onDidChangeWindowMaximized: Event.None,
		isVisible: () => true,
	});
	registration.definePartialInstance(IAgentFeedbackService, {
		onDidChangeFeedback: Event.None, onDidChangeFeedbackVisibility: Event.None, onDidChangeFeedbackScope: Event.None,
		getFeedback: () => [],
	});
}

export function configureSessionReviewConversationServices(instantiation: TestInstantiationService): void {
	// Initialize agent context keys before the fixture applies its enabled state.
	instantiation.get(IChatAgentService);
	instantiation.stub(IChatSessionsService, instantiation.get(IChatSessionsService), 'onDidChangeContentProviderSchemes', Event.None);
	instantiation.stub(IChatSessionsService, instantiation.get(IChatSessionsService), 'getChatSessionContribution', () => undefined);
	instantiation.stub(IChatSessionsService, instantiation.get(IChatSessionsService), 'sessionSupportsFork', () => false);
	instantiation.stub(IChatSessionsService, instantiation.get(IChatSessionsService), 'sessionSupportsRename', () => false);
	instantiation.stub(IPromptsService, instantiation.get(IPromptsService), 'listAgentInstructions', async () => []);
}

export async function createNativeSessionReviewFixture(context: ComponentFixtureContext, instantiation: TestInstantiationService, options: { readonly width: number; readonly height: number; readonly conversation?: boolean }) {
	const { container, disposableStore } = context;
	container.style.position = 'relative';
	const nativeDisposables = disposableStore.add(new DisposableStore());
	const editors = workbenchInstantiationService(undefined, nativeDisposables);
	editors.stub(ILogService, instantiation.get(ILogService));
	const layoutService = new TestLayoutService();
	layoutService.mainContainer = container;
	layoutService.activeContainer = container;
	layoutService.containers = [container];
	layoutService.mainContainerDimension = { width: options.width, height: options.height };
	const layoutChanged = nativeDisposables.add(new Emitter<{ readonly width: number; readonly height: number }>());
	layoutService.onDidLayoutMainContainer = layoutChanged.event;
	editors.stub(IWorkbenchLayoutService, layoutService);
	const keys = instantiation.get(IContextKeyService);
	editors.stub(IContextKeyService, keys);
	editors.stub(IChatAgentService, instantiation.get(IChatAgentService));
	editors.stub(IThemeService, instantiation.get(IThemeService));
	editors.stub(ISessionsService, instantiation.get(ISessionsService));
	editors.stub(IChatViewFactory, {
		createChatView: scope => {
			if (!options.conversation) { throw new Error('Artifact review must not load the conversation'); }
			const context = scope?.invokeFunction(accessor => accessor.get(IContextKeyService)) ?? keys;
			const scoped = nativeDisposables.add(instantiation.createChild(new ServiceCollection([IContextKeyService, context])));
			return scoped.createInstance(ChatView);
		}
	});
	editors.stub(ICommandService, new class extends mock<ICommandService>() {
		override readonly onWillExecuteCommand = Event.None;
		override readonly onDidExecuteCommand = Event.None;
		override async executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T | undefined> {
			const command = CommandsRegistry.getCommand(id);
			if (!command || ![CLOSE_MODAL_EDITOR_COMMAND_ID, TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID, TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID].includes(id)) {
				throw new Error(`The native review fixture cannot run command ${id}`);
			}
			await editors.invokeFunction(command.handler, ...args);
			return undefined;
		}
	}());
	editors.stub(IMenuService, nativeDisposables.add(editors.createInstance(MenuService)));
	editors.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
	const parts = await createEditorParts(editors, nativeDisposables);
	editors.stub(IEditorGroupsService, parts);
	const editorService = nativeDisposables.add(editors.createInstance(EditorService, undefined));
	editors.stub(IEditorService, editorService);
	return { nativeDisposables, editors, parts, editorService, layoutService, layoutChanged };
}
