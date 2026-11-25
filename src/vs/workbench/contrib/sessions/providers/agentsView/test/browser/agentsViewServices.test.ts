/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { getSingletonServiceDescriptors } from '../../../../../../../platform/instantiation/common/extensions.js';
import { _util, createDecorator, ServiceIdentifier } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { isDisposable } from '../../../../../../../base/common/lifecycle.js';
import { SyncDescriptor } from '../../../../../../../platform/instantiation/common/descriptors.js';
import { InstantiationService } from '../../../../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../../../../platform/instantiation/common/serviceCollection.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { getEditorWindowSessionsSingletons, IEditorWindowSessionsSingleton } from '../../../../browser/editorWindow/editorWindowSessionsServices.js';
import { ISessionAttentionService } from '../../../../common/sessionAttentionService.js';
import { IDevContainerAgentHostService } from '../../../../common/devContainerAgentHostService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { EditorWindowMainSessionHost, EditorWindowShownChatService } from '../../../../browser/agentsView/editorWindowMainSessionHost.js';
import { AgentsChatViewHost } from '../../../../browser/agentsView/agentsChatViewHost.js';
import { EditorWindowChatPartService } from '../../../../browser/agentsView/agentsChatPartContribution.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { IChat, ISession, SessionStatus } from '../../../../../../services/sessions/common/session.js';
import { ChatView, NewChatView } from '../../../../browser/chat/chatView.js';
import { NewChatInSessionWidget } from '../../../../browser/chat/newChatInSessionWidget.js';
import { NewChatWidget } from '../../../../browser/chat/newChatWidget.js';
import { SharedChatInputComposer } from '../../../../browser/chat/sharedChatInputComposer.js';
import { ChatEditorView } from '../../../../browser/chatEditor/chatEditor.js';
import { ChatEditorContent } from '../../../../browser/chatEditor/chatEditorContent.js';
import { ChatGroupView } from '../../../../browser/parts/chatGroupView.js';
import { SessionsList } from '../../../../browser/views/sessionsList.js';
import { ISessionsViewLocator, SessionsView } from '../../../../browser/views/sessionsView.js';
import { SessionArchiveNudge } from '../../../../browser/chat/sessionArchiveNudge.js';
import { SessionChatInputToolbar } from '../../../../browser/chat/sessionChatInputToolbar.js';
import { SessionInputBanners } from '../../../../browser/sessionInputBanners/sessionInputBanners.js';
import { SessionStatusIcon } from '../../../../browser/sessionStatusIcon.js';
import { ChatCompositeBar } from '../../../../browser/parts/chatCompositeBar.js';
import { ChatHeader } from '../../../../browser/parts/chatHeader.js';
import { RemoteHostUnavailableEmptyState } from '../../../../browser/parts/remoteHostUnavailableEmptyState.js';
import { ChatViewSessionActivityBar } from '../../../../browser/parts/sessionActivityBar.js';
import { SessionHeader } from '../../../../browser/parts/sessionHeader.js';
import { ChatReadOnlyBanner } from '../../../../../chat/browser/widget/chatReadOnlyBanner.js';
import { SessionRemoteConnection } from '../../../../browser/parts/sessionRemoteConnection.js';
import { SessionsInboxScope } from '../../../../browser/views/sessionsInboxScope.js';
import { SessionsListFilters } from '../../../../browser/views/sessionsListFilters.js';
import { SessionsListNotification } from '../../../../browser/views/sessionsListNotification.js';
import { SessionStorageCleanupNotice } from '../../../../browser/views/sessionStorageCleanupNotice.js';
import { ResponseSelectionSideChatController } from '../../../../../chat/browser/responseSelectionSideChatController.js';
import { ISessionChatPillsDebugService } from '../../../../browser/chat/sessionChatInputToolbarDebug.js';
import { INewSessionWorktreeSendChoiceService } from '../../../../browser/chat/newSessionWorktreeSendChoice.js';
// What an editor window registers for its sessions: the shared editor-window services and the Agents view's
import '../../../../browser/editorWindow/editorWindowSessions.contribution.js';
import '../../browser/agentsViewProviders.contribution.js';

/**
 * The services that an editor window provides without registering them here: those of the workbench's main service
 * collection, and those that core modules register, such as chat's. Named, as the global registry of this test process
 * also has what only the Agents window registers.
 */
const CORE_SERVICES = new Set([
	'accessibilityService', 'accessibilitySignalService', 'accountPolicyGateService', 'actionWidgetService', 'actionViewItemService', 'agentHostConnectionsService',
	'agentHostEnablementService', 'agentHostService', 'agentPluginService', 'agentSessions', 'assignmentService', 'chatAgentNameService', 'chatAgentService', 'chatAttachmentResolveService',
	'chatEditingService', 'chatEntitlementService', 'chatModeService', 'chatOpenDiagnosticsService', 'chatPetService', 'chatService', 'chatSessionsService', 'chatSideChatService',
	'chatSlashCommandService', 'chatSubmitRequestHandlerService', 'chatTipService', 'chatViewHostService', 'chatWidgetHistoryService',
	'chatWidgetService', 'clipboardService', 'commandService', 'configurationService', 'contextKeyService', 'contextMenuService', 'contextService',
	'contextViewService', 'defaultAccountService', 'dialogService', 'editorGroupsService', 'editorService', 'environmentService', 'extensionService', 'externalUriOpenerService',
	'fileDialogService', 'fileService', 'IFileDecorationsService', 'hostService', 'hoverService', 'IAuthenticationService', 'IChatService', 'IChatWidgetHistoryService',
	'ILanguageModelsService', 'ILanguageModelToolsService', 'instantiationService', 'IPromptsService', 'IUriIdentityService', 'IUserDataProfileService', 'IUserDataProfilesService', 'keybindingService',
	'labelService', 'languageModelsService', 'languageModelToolsService', 'layoutService', 'lifecycleService', 'listService', 'loggerService', 'logService',
	'managedSettingsService', 'markdownRendererService', 'menuService', 'micCaptureService', 'modelService', 'notificationService', 'onboardingScenarioService', 'openerService', 'paneCompositePartService', 'pathService', 'productService', 'progressService',
	'quickInputService', 'remoteAgentHostService', 'remoteAgentService', 'requestService', 'sessionChatPillVisibilityService', 'speechService', 'storageService', 'telemetryService', 'textModelService',
	'themeService', 'ttsPlaybackService', 'uriIdentityService', 'viewDescriptorService', 'viewsService', 'voiceClientService', 'voicePlaybackService', 'voiceSessionController', 'workingCopyService',
	'workspaceContextService', 'workspacesService', 'workspaceTrustManagementService', 'workspaceTrustRequestService',
]);

/**
 * The services that an editor window provides without its sessions code, which the workbench test services do not: those
 * of core features, such as chat, MCP and extensions. Each is an inert stub; the sessions services only need them to exist.
 */
const STUBBED_CORE_SERVICES = [
	'IChatService', 'IChatWidgetHistoryService', 'IMcpService', 'IUserDataProfileStorageService', 'agentHostCustomizationService', 'chatSessionsService', 'chatViewHostService',
	'commandService', 'customizationHarnessService', 'extensionManifestPropertiesService', 'extensionsWorkbenchService', 'gitHubService', 'onboardingScenarioService',
	'remoteAgentHostService', 'viewsService',
];

/** The sessions services that an editor window registers, also those that their modules register in every window. */
function editorWindowSessionsSingletons(): readonly IEditorWindowSessionsSingleton[] {
	const registered = getSingletonServiceDescriptors();
	const descriptorOf = (id: unknown) => registered.find(([candidate]) => candidate === id)?.[1];
	return [
		...getEditorWindowSessionsSingletons(),
		// Registered by their modules, which the Agents window loads too
		{ id: ISessionAttentionService, ctor: descriptorOf(ISessionAttentionService)!.ctor },
		{ id: IDevContainerAgentHostService, ctor: descriptorOf(IDevContainerAgentHostService)!.ctor },
		{ id: INewSessionWorktreeSendChoiceService, ctor: descriptorOf(INewSessionWorktreeSendChoiceService)!.ctor },
		{ id: ISessionsViewLocator, ctor: descriptorOf(ISessionsViewLocator)!.ctor },
	];
}

/**
 * The views of an editor window's sessions and its chat part, and what they create as they show a session, such as a chat's input toolbar:
 * their services are checked as they are created, not as the views that create them are.
 */
const SESSIONS_UI = [
	SessionsView, SessionsList, ChatView, ChatGroupView, ChatEditorView, ChatEditorContent, NewChatWidget, NewChatInSessionWidget, SharedChatInputComposer, AgentsChatViewHost, EditorWindowChatPartService,
	NewChatView, SessionChatInputToolbar, SessionInputBanners, SessionArchiveNudge, SessionStatusIcon, ResponseSelectionSideChatController,
	SessionHeader, ChatCompositeBar, ChatHeader, ChatViewSessionActivityBar, RemoteHostUnavailableEmptyState, ChatReadOnlyBanner, SessionRemoteConnection,
	SessionsListNotification, SessionsInboxScope, SessionStorageCleanupNotice, SessionsListFilters,
];

/**
 * The services that `roots` depend on, also through the services they depend on, that neither `registered` nor the
 * window's core provides. Only what an editor window registers counts, not the global
 * registry, which this test process shares with the Agents window.
 */
function missingServices(roots: readonly unknown[], registered: readonly IEditorWindowSessionsSingleton[]): string[] {
	const registeredByName = new Map(registered.map(({ id, ctor }) => [id.toString(), ctor]));
	const provided = new Set([...CORE_SERVICES, ...STUBBED_CORE_SERVICES]);
	const missing = new Set<string>();
	const seen = new Set<unknown>();
	const visit = (ctor: unknown) => {
		if (!ctor || seen.has(ctor)) {
			return;
		}
		seen.add(ctor);
		for (const { id } of _util.getServiceDependencies(ctor as _util.DI_TARGET_OBJ)) {
			const name = (id as ServiceIdentifier<unknown>).toString();
			const registeredCtor = registeredByName.get(name);
			if (registeredCtor) {
				visit(registeredCtor);
			} else if (!provided.has(name)) {
				missing.add(name);
			}
		}
	};
	for (const root of roots) {
		visit(root);
	}
	return [...missing].sort();
}

/** A stand-in that answers every member with itself, called or not: events and observables of it never fire or change. */
function inertStub(): object {
	const stub: object = new Proxy(function () { }, {
		get: (_target, property) => property === Symbol.iterator ? function* () { }
			: property === Symbol.toPrimitive ? () => 0
				: property === 'then' ? undefined
					: stub,
		apply: () => stub,
	});
	return stub;
}

suite('Editor window sessions services', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('creates every sessions service an editor window registers, with the services the window provides and none only the Agents window registers', () => {
		// What an editor window provides besides its sessions services; the services that other test files load, such as
		// the Agents window's, are not provided, so a service the editor window lacks fails as it would in the window
		const base = workbenchInstantiationService(undefined, disposables);
		for (const name of STUBBED_CORE_SERVICES) {
			base.stub(createDecorator(name), inertStub());
		}
		const singletons = editorWindowSessionsSingletons();
		// Created as they are injected, not as they are first used, so that none is created after the test ends
		const services = new ServiceCollection();
		for (const { id, ctor } of singletons) {
			services.set(id, new SyncDescriptor(ctor, [], false));
		}
		const instantiationService = disposables.add(new InstantiationService(services, true, base));

		const failures: string[] = [];
		for (const { id, ctor } of singletons) {
			try {
				const instance = instantiationService.createInstance(ctor as new () => unknown);
				if (isDisposable(instance)) {
					instance.dispose();
				}
			} catch (error) {
				failures.push(`${id}: ${(error as Error).message}`);
			}
		}

		assert.deepStrictEqual(failures, []);
	});

	test('an editor window registers every sessions service that its sessions list, chats and chat part depend on', () => {
		assert.deepStrictEqual(missingServices(SESSIONS_UI, editorWindowSessionsSingletons()), []);
	});

	test('a sessions service that its sessions list, chats or chat part depend on is missing when the editor window does not register it, also when the Agents window does', () => {
		// The Agents window registers it too, in the registry that this test process shares
		const competing = getSingletonServiceDescriptors().some(([id]) => id === ISessionChatPillsDebugService);
		const withoutIt = editorWindowSessionsSingletons().filter(({ id }) => id !== ISessionChatPillsDebugService);

		assert.deepStrictEqual({ competing, missing: missingServices(SESSIONS_UI, withoutIt) }, { competing: true, missing: [ISessionChatPillsDebugService.toString()] });
	});

	test('the session host of an editor window, created as the window starts, does nothing until a feature binds what it shows', () => {
		// Records every use of its only service: it neither listens to it nor reads it until something reads the host
		const used: string[] = [];
		const contextKeyService = new Proxy({}, { get: (_target, property) => { used.push(String(property)); return undefined; } }) as IContextKeyService;
		const host = new EditorWindowMainSessionHost(contextKeyService, new EditorWindowShownChatService());

		assert.deepStrictEqual({ used, content: host.content.get(), session: host.session.get(), chat: host.chat.get() }, { used: [], content: { kind: 'empty' }, session: undefined, chat: undefined });
	});

	test('the session host of an editor window shows the chat of the binding that wins: an override over the others, else the one bound last; releasing one shows the one it was bound over again', () => {
		const shownChatService = new EditorWindowShownChatService();
		const host = new EditorWindowMainSessionHost(upcastPartial<IContextKeyService>({}), shownChatService);
		const chat = (id: string) => ({ session: upcastPartial<ISession>({ sessionId: id, status: constObservable(SessionStatus.Completed), mainChat: constObservable(upcastPartial<IChat>({})) }), chat: upcastPartial<IChat>({}) });
		const shownId = () => host.session.get()?.sessionId;
		const steps: Record<string, string | undefined> = {};

		const first = shownChatService.bind(constObservable(chat('first')));
		const second = shownChatService.bind(constObservable(chat('second')));
		steps.latestOfTwo = shownId();
		second.dispose();
		steps.firstAgain = shownId();
		const third = shownChatService.bind(constObservable(chat('third')));
		const override = shownChatService.bind(constObservable(chat('override')), { override: true });
		const afterOverride = shownChatService.bind(constObservable(chat('after override')));
		steps.overrideWins = shownId();
		override.dispose();
		steps.latestAfterOverride = shownId();
		afterOverride.dispose();
		third.dispose();
		first.dispose();
		steps.none = shownId();

		assert.deepStrictEqual(steps, { latestOfTwo: 'second', firstAgain: 'first', overrideWins: 'override', latestAfterOverride: 'after override', none: undefined });
	});
});
