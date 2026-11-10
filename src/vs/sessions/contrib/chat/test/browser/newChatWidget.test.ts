/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { $, addDisposableListener, append, EventType } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { getBaseLayerHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { DeferredPromise, raceCancellationError, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { createErrorWithActions, isErrorWithActions } from '../../../../../base/common/errorMessage.js';
import { toAction } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { combinedDisposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, IReader, ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ChatModelSource, GITHUB_REMOTE_FILE_SCHEME, IChat, ISession, ISessionAgentRef, ISessionGitRepository, ISessionWorkspace, SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_LOCAL, SessionStatus, SessionTypeAuthRequirement } from '../../../../../workbench/services/sessions/common/session.js';
import { ICreateNewSessionOptions, INewSessionDraftSlot, INewSessionRequestEndedEvent, ISendRequestOptions, ISendRequestSentEvent, ISessionsManagementService, trackNewSessionRequestEnd, WorkspaceNotTrustedError } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { INewSessionBackgroundSend, INewSessionDraftHost, INewSessionTarget } from '../../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { ISessionModelsSnapshot, ISessionsProvider, ISessionsProviderCreateSessionOptions } from '../../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { IOpenNewSessionOptions, IOpenNewSessionResult, IOpenSessionOptions } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { SessionsManagementService } from '../../../../../workbench/contrib/sessions/browser/sessionsManagementService.js';
import { ISessionsProvidersService, SessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { IPickedSessionType, IPreferredSessionType } from '../../../../../workbench/contrib/sessions/browser/chat/sessionTypePicker.js';
import { NewChatWidget, shouldShowNewSessionChatTip } from '../../../../../workbench/contrib/sessions/browser/chat/newChatWidget.js';
import { WelcomeName } from '../../../../../workbench/contrib/sessions/browser/chat/welcomeName.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING, COMPARE_AGENTS_OPEN_IN_GRID_SETTING, ENVIRONMENT_PICKER_SETTING, NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING, WORKSPACE_OPT_OUT_SETTING } from '../../../../../workbench/contrib/sessions/common/chatConstants.js';
import type { ISessionOptionsIconOnlyPickers } from '../../../../../workbench/contrib/sessions/browser/chat/iconOnlySessionPickers.js';
import { getNewSessionWelcomePhrases } from '../../../../../workbench/contrib/sessions/common/welcomePhrases.js';
import { SessionInputPickerVisibility } from '../../../../../workbench/contrib/sessions/common/sessionPickerVisibility.js';
import { IChatRequestVariableEntry, toFileVariableEntry, toPasteVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getAdditionalFolderContextId, getAdditionalRepositoryContextId } from '../../../../../workbench/contrib/sessions/common/newChatContextIds.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_PREFIX } from '../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { AgentCustomization } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { NewSessionComposerService } from '../../../../../workbench/contrib/sessions/browser/newSessionComposerService.js';
import { ComposerInputSnapshot } from '../../../../../workbench/contrib/sessions/common/newChatDraftState.js';
import { IWorkspacePickerNoWorkspaceOption, WorkspacePicker } from '../../../../../workbench/contrib/sessions/browser/chat/sessionWorkspacePicker.js';
import { IWorkspaceSelectionSnapshot, WorkspaceSelectionOrigin, ISelectNoWorkspaceOptions, ISelectWorkspaceOptions } from '../../../../../workbench/services/sessions/common/workspaceSelection.js';
import { TOTAL_SESSIONS_KEY } from '../../../sessions/browser/sessionsLifecycleTracker.js';
import { SharedChatInputComposer } from '../../../../../workbench/contrib/sessions/browser/chat/sharedChatInputComposer.js';
import { ISessionComparisonAttemptConfiguration, IStartSessionComparisonOptions, SessionComparisonParticipantRole } from '../../../../../workbench/contrib/sessions/common/sessionComparison.js';
import { IChatDraft, serializeChatDraft } from '../../../../../workbench/contrib/chat/common/attachments/chatDraft.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { AgentsWindowUsage } from '../../../../../workbench/contrib/chat/common/agentsWindowUsage.js';
import { SessionComparisonModelSelection } from '../../../../../workbench/contrib/sessions/browser/chat/sessionComparisonModelSelection.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { SessionView } from '../../../../../workbench/contrib/sessions/browser/parts/sessionView.js';
import { createSessionViewTestServices, createTestActiveSession, testPaneOf } from '../../../../test/browser/sessionViewTestUtils.js';
import { getDefaultSessionCreationEnvironment, getSessionCreationEnvironments, ISessionCreationEnvironment } from '../../../../../workbench/contrib/sessions/browser/chat/sessionEnvironmentPicker.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { SessionConfigSchema } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ISessionHost, ISessionHostService } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { stubSessionsHostLayout } from '../../../../test/browser/sessionsHostLayoutTestUtils.js';
import { ITestSessionWithChat, withCreatedStatus } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';

/** The part of the active session `_recreateOnProviderChange` actually reads. */
interface IActiveDraft {
	readonly sessionId: string;
	readonly isCreated: IObservable<boolean>;
	readonly status: IObservable<SessionStatus>;
	readonly providerId: string;
	readonly sessionType: string;
	readonly workspace?: IObservable<{ readonly folders: readonly { readonly root: URI; readonly gitRepository?: ISessionGitRepository }[]; readonly group?: string } | undefined>;
}

interface IRecreateHarness {
	readonly _pendingPreferredUpgrade: MutableDisposable<IDisposable>;
	readonly _workspacePicker: Pick<WorkspacePicker, 'isWorkspaceOfFolder'>;
	readonly _session: IObservable<IActiveDraft | undefined>;
	readonly _newChatInput: {
		readonly sessionTypePicker: {
			getPreferredSessionType(folderUri: URI): IPreferredSessionType | undefined;
		};
	};
	_isPreferredServable(folderUri: URI, pick: IPreferredSessionType): boolean;
	_createNewSession(folderUri: URI, userPick?: IPreferredSessionType): Promise<IOpenNewSessionResult>;
}

/** The collaborators `_createSessionNow` reads while assembling the `openNewSession` options. */
interface ICreateSessionNowHarness {
	readonly _preserveCustomView?: boolean;
	readonly _draftHost?: Partial<INewSessionDraftHost>;
	_applyRequestedSelection?(session: ISession | undefined): void;
	readonly _environment: IObservable<ISessionCreationEnvironment | undefined>;
	readonly _newChatInput: {
		readonly sessionTypePicker: {
			getPreferredSessionType(folderUri: URI): IPreferredSessionType | undefined;
		};
	};
	readonly _workspacePicker: { readonly selectedResolved: { readonly providerId: string } | undefined };
	readonly sessionsService: { openNewSession(options: IOpenNewSessionOptions, token: CancellationToken): Promise<IOpenNewSessionResult> };
	readonly logService: { error(message: string, ...args: unknown[]): void };
	_isPreferredServable(folderUri: URI, pick: IPreferredSessionType): boolean;
	_requestsDevContainer(folderUri: URI | undefined): boolean;
}

interface INewChatWidgetHarness extends IRecreateHarness {
	readonly _newSessionCreation: MutableDisposable<IDisposable>;
	_pendingWorkspaceCreation?: Promise<IOpenNewSessionResult>;
	_createdSessionId: string | undefined;
	readonly sessionsManagementService: { readonly onDidChangeSessionTypes: Event<void> };
	readonly _newChatInput: {
		readonly sessionTypePicker: {
			getUserPickedSessionType(): IPreferredSessionType | undefined;
			getPreferredSessionType(folderUri: URI): IPreferredSessionType | undefined;
		};
	};
	_createSessionNow(folderUri: URI, userPick: IPreferredSessionType | undefined, token: CancellationToken): Promise<IOpenNewSessionResult>;
	_applyPreferredDevContainer(session: ISession | undefined, folderUri: URI): void;
	_scheduleRecreateOnProviderChange(folderUri: URI, userPick: IPreferredSessionType | undefined, created: ISession | undefined, replayMissedChange: boolean): void;
	_recreateOnProviderChange(folderUri: URI, userPick: IPreferredSessionType | undefined, created: ISession | undefined): void;
}

const createNewSession = Reflect.get(NewChatWidget.prototype, '_createNewSession') as (
	this: INewChatWidgetHarness,
	folderUri: URI,
	userPick?: IPreferredSessionType,
	handoff?: { readonly token: CancellationToken; readonly providerId?: string; readonly preferDevContainer?: boolean },
) => Promise<IOpenNewSessionResult>;
const createSessionNow = Reflect.get(NewChatWidget.prototype, '_createSessionNow') as (
	this: ICreateSessionNowHarness,
	folderUri: URI,
	userPick: IPreferredSessionType | undefined,
	token: CancellationToken,
) => Promise<IOpenNewSessionResult>;
const canApplyWorkspaceDefault = Reflect.get(NewChatWidget.prototype, '_canApplyWorkspaceDefault') as (this: NewChatWidget) => boolean;
const takesGlobalComposerActions = Reflect.get(NewChatWidget.prototype, '_takesGlobalComposerActions') as (this: {
	readonly _draftHost?: object;
	readonly options: { readonly hostVisible?: IObservable<boolean>; readonly inputVisible?: IObservable<boolean> };
}, reader: IReader | undefined) => boolean;
const isPreferredServable = Reflect.get(NewChatWidget.prototype, '_isPreferredServable') as (
	this: {
		readonly _environment: IObservable<ISessionCreationEnvironment | undefined>;
		readonly agentHostFilterService: { readonly selectedHost: { readonly sessionCreationProviderId: string } };
		readonly sessionsManagementService: { getSessionTypesForFolder(folderUri: URI): readonly { readonly providerId: string; readonly sessionType: { readonly id: string } }[] };
	},
	folderUri: URI,
	pick: IPreferredSessionType,
) => boolean;
const prepareSessionTypeSelection = Reflect.get(NewChatWidget.prototype, '_prepareSessionTypeSelection') as (
	this: {
		readonly _workspacePicker: {
			readonly selectedFolderUri: URI | undefined;
			readonly selectedResolved: { readonly workspace: ISessionWorkspace } | undefined;
			setSelectedWorkspace(folderUri: URI, options: { fireEvent: false; providerId: string }): void;
		};
		readonly commandService: { executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> };
		readonly logService: { error(message: string): void };
		_isPreferredServable(folderUri: URI, pick: IPreferredSessionType): boolean;
	},
	pick: IPickedSessionType,
) => Promise<boolean>;
const applyPreferredDevContainer = Reflect.get(NewChatWidget.prototype, '_applyPreferredDevContainer') as (
	this: {
		readonly _environment: IObservable<ISessionCreationEnvironment | undefined>;
		_preferredDevContainerFolderUri: URI | undefined;
		readonly uriIdentityService: { readonly extUri: typeof extUri };
		readonly sessionsProvidersService: {
			getProvider(providerId: string): { readonly id: string; preferDevContainer?(sessionId: string, options?: { required?: boolean }): void } | undefined;
		};
	},
	session: ISession | undefined,
	folderUri: URI,
) => void;
const syncWorkspacePickerDevContainerMode = Reflect.get(NewChatWidget.prototype, '_syncWorkspacePickerDevContainerMode') as (
	this: {
		_reconcileWorkspaceEnvironment(options: ISelectWorkspaceOptions): void;
		readonly uriIdentityService: { readonly extUri: typeof extUri };
		readonly sessionsProvidersService: {
			getProvider(providerId: string): { readonly id: string; isDevContainerEnabled?(sessionId: string): boolean } | undefined;
		};
		readonly _workspacePicker: {
			readonly selectedFolderUri: URI | undefined;
			setSelectedWorkspace(folderUri: URI, options: { fireEvent: boolean; providerId: string; persist: boolean; preferDevContainer: boolean; origin: WorkspaceSelectionOrigin }): void;
		};
	},
	activeSession: ITestSessionWithChat,
	persist: boolean,
	origin: WorkspaceSelectionOrigin,
) => URI | undefined;
const scheduleRecreateOnProviderChange = Reflect.get(NewChatWidget.prototype, '_scheduleRecreateOnProviderChange') as INewChatWidgetHarness['_scheduleRecreateOnProviderChange'];
const recreateOnProviderChange = Reflect.get(NewChatWidget.prototype, '_recreateOnProviderChange') as (
	this: IRecreateHarness,
	folderUri: URI,
	userPick: IPreferredSessionType | undefined,
	created: { readonly sessionId: string } | undefined,
) => void;
const handlePromptOptionsWorkspaceChange = Reflect.get(NewChatWidget.prototype, '_handlePromptOptionsWorkspaceChange') as (this: IPromptOptionsWorkspaceHarness, previousFolderUri: URI | undefined, folderUri: URI | undefined) => void;
const syncWorkspacePickerFromSessionWorkspace = Reflect.get(NewChatWidget.prototype, '_syncWorkspacePickerFromSessionWorkspace') as (this: ISyncWorkspacePickerHarness, workspace: ISessionWorkspace | undefined) => void;
const hasEnoughSessionsForFirstRunNotices = Reflect.get(NewChatWidget.prototype, '_hasEnoughSessionsForFirstRunNotices') as (this: ISessionCountHarness) => boolean;
const prepareChatTipSession = Reflect.get(NewChatWidget.prototype, '_prepareChatTipSession') as (this: IChatTipSessionHarness) => void;
const updateChatTip = Reflect.get(NewChatWidget.prototype, '_updateChatTip') as (this: { _renderChatTip(): void; focusInput(): void }, isShowing: boolean, container: HTMLElement) => void;
const restoreSessionOptionsExpanded = Reflect.get(NewChatWidget.prototype, '_restoreSessionOptionsExpanded') as (this: ISessionOptionsPersistenceHarness) => void;
const setSessionOptionsExpandedFromUser = Reflect.get(NewChatWidget.prototype, '_setSessionOptionsExpandedFromUser') as (this: ISessionOptionsPersistenceHarness, expanded: boolean) => void;
const send = Reflect.get(NewChatWidget.prototype, '_send') as (this: ISendHarness, query: string, attachedContext?: IChatRequestVariableEntry[], background?: boolean) => Promise<boolean>;
const seedRequestedTarget = Reflect.get(NewChatWidget.prototype, '_seedRequestedTarget') as (this: object, target: INewSessionTarget) => void;
const seedWorkspaceDraft = Reflect.get(NewChatWidget.prototype, '_seedWorkspaceDraft') as (this: object) => void;
/** The widget's methods that `methods` names, called on `harness`, which then has them. */
function withWidgetMethods<T extends object, M extends string>(harness: T, methods: readonly M[]): T & { [K in M]: (...args: unknown[]) => unknown } {
	for (const method of methods) {
		const implementation = Reflect.get(NewChatWidget.prototype, method) as (...args: unknown[]) => unknown;
		Reflect.set(harness, method, (...args: unknown[]) => implementation.apply(harness, args));
	}
	return harness as T & { [K in M]: (...args: unknown[]) => unknown };
}
/** The workspace picker's identity of a draft's workspace and a folder, as it resolves it with `providers`; no folder is selected. */
function workspaceIdentity(providers: { getProviders(): readonly ISessionsProvider[]; getProvider(id: string): ISessionsProvider | undefined } = { getProviders: () => [], getProvider: () => undefined }): Pick<WorkspacePicker, 'isWorkspaceOfFolder'> {
	const picker = { uriIdentityService: { extUri }, sessionsProvidersService: providers, _selectedResolved: undefined, _isSelectedFolder: () => false };
	for (const method of ['isWorkspaceOfFolder', '_resolveFolder', '_getRepositoryIdForResolvedWorkspace', '_getRepositoryWorkspaceCandidates', '_getRepositoryId']) {
		const implementation = Reflect.get(WorkspacePicker.prototype, method) as (...args: unknown[]) => unknown;
		Reflect.set(picker, method, (...args: unknown[]) => implementation.apply(picker, args));
	}
	return picker as unknown as Pick<WorkspacePicker, 'isWorkspaceOfFolder'>;
}
const clearBackgroundSendOnFailure = Reflect.get(NewChatWidget.prototype, '_clearBackgroundSendOnFailure') as (this: ISendHarness, slot: INewSessionDraftSlot, session: ISession, sendOptions: ISendRequestOptions) => IDisposable;
const backgroundReseedTarget = Reflect.get(NewChatWidget.prototype, '_backgroundReseedTarget') as (this: { readonly _environment: IObservable<ISessionCreationEnvironment | undefined>; _requestsDevContainer(folderUri: URI | undefined): boolean }, session: ISession, folderUri: URI | undefined) => INewSessionTarget;
const updateWelcomeMessage = Reflect.get(NewChatWidget.prototype, '_updateWelcomeMessage') as (container: HTMLElement, title: HTMLElement, visible: boolean, phrases: readonly string[], phraseIndex: number) => string | undefined;
const getComparisonBranch = Reflect.get(NewChatWidget.prototype, '_getComparisonBranch') as (this: IGetComparisonBranchHarness, session?: ISession, reader?: IReader) => string | undefined;
const getComparisonModelIds = Reflect.get(NewChatWidget.prototype, '_getComparisonModelIds') as (this: {
	readonly _newChatInput: { getComparisonModels(): readonly ILanguageModelChatMetadataAndIdentifier[] };
}) => Set<string>;
const shouldShowComparisonAction = Reflect.get(NewChatWidget.prototype, '_shouldShowComparisonAction') as (this: IComparisonActionVisibilityHarness, reader?: IReader) => boolean;
const announceWelcomeMessage = Reflect.get(NewChatWidget.prototype, '_announceWelcomeMessage') as (this: IWelcomeAnnouncementHarness, phrase: string | undefined, inputVisible: boolean) => void;
const getWelcomeName = Reflect.get(WelcomeName.prototype, '_getWelcomeName') as (this: { _getFirstName(name: string | undefined): string | undefined }, gitHubName: string | undefined, configuredName?: string) => string | undefined;
const getFirstName = Reflect.get(WelcomeName.prototype, '_getFirstName') as (name: string | undefined) => string | undefined;
const takeNextWelcomePhraseIndex = Reflect.get(NewChatWidget, '_takeNextWelcomePhraseIndex') as (storageService: IStorageService) => number;

interface IWelcomeAnnouncementHarness {
	_welcomePhraseAnnounced: boolean;
	readonly accessibilityService: {
		isScreenReaderOptimized(): boolean;
		status(message: string): void;
	};
	readonly configurationService: {
		getValue<T>(key: string): T;
	};
}
const refreshGitHubProfileName = Reflect.get(WelcomeName.prototype, '_refreshGitHubProfileName') as (this: {
	readonly enabled: { get(): boolean };
	readonly _store: { readonly isDisposed: boolean };
	_githubProfileAccountKey: string | undefined;
	readonly _githubProfileName: ReturnType<typeof observableValue<string | undefined>>;
	readonly configurationService: { getValue<T>(key: string): T };
	readonly defaultAccountService: {
		currentDefaultAccount: { readonly authenticationProvider: { readonly id: string; readonly enterprise: boolean }; readonly sessionId: string } | null;
		getDefaultAccount(): Promise<{ readonly authenticationProvider: { readonly id: string; readonly enterprise: boolean }; readonly sessionId: string } | null>;
	};
	_fetchGitHubProfileName(providerId: string, enterprise: boolean, sessionId: string): Promise<string | undefined>;
}) => Promise<void>;
const fetchGitHubProfileName = Reflect.get(WelcomeName.prototype, '_fetchGitHubProfileName') as (this: {
	readonly authenticationService: { getSessions(): Promise<readonly never[]> };
	readonly defaultAccountService: { resolveGitHubUrl(path: string): URI | undefined };
	readonly requestService: { request(): Promise<never> };
	readonly logService: { warn(message: string): void };
}, providerId: string, enterprise: boolean, sessionId: string) => Promise<string | undefined>;

interface IPromptOptionsWorkspaceHarness {
	readonly uriIdentityService: { readonly extUri: typeof extUri };
	readonly _newChatInput: { clearPromptOptions(): void };
	_refreshPromptOptions(): Promise<void>;
}

interface ISyncWorkspacePickerHarness {
	readonly _workspacePicker: {
		matchesSelectedWorkspace(workspace: ISessionWorkspace): boolean;
		setSelectedWorkspace(folderUri: URI, options: { fireEvent: false; origin: WorkspaceSelectionOrigin }): void;
	};
}

interface ISessionCountHarness {
	readonly _usage: { readonly createdSessionCount: number };
}

interface IChatTipSessionHarness {
	_isChatTipSessionInitialized: boolean;
	readonly contextKeyService: {
		getContextKeyValue(key: string): number | undefined;
	};
	readonly chatTipService: {
		resetSession(): void;
	};
}

interface ISessionOptionsPersistenceHarness {
	readonly storageService: IStorageService;
	readonly _usage: AgentsWindowUsage;
	readonly configurationService: {
		getValue<T>(key: string): T;
	};
	readonly telemetryService: ITelemetryService;
	readonly _sessionOptionsExpanded: ReturnType<typeof observableValue<boolean>>;
}

interface ISendHarness {
	readonly configurationService?: IConfigurationService;
	readonly _backgroundSend?: boolean;
	readonly _draftHost?: INewSessionDraftHost;
	readonly _backgroundSendStatus?: ISettableObservable<string | undefined>;
	_lastBackgroundSentSessionResource?: URI;
	_lastBackgroundSendOptions?: ISendRequestOptions;
	readonly _newChatInput?: Pick<SharedChatInputComposer, 'hasInput'>;
	readonly notificationService: { error(message: string | Error): void; info?(message: string): void };
	readonly _pendingBackgroundSends: { set(key: object, value: IDisposable): void; deleteAndDispose(key: object): void };
	readonly recentWorkspacesService: { restoreDismissedWorkspace(folderUri: URI): void };
	readonly newSessionComposerService: { notifyWillSendRequest(options: ISendRequestOptions, selection: IWorkspaceSelectionSnapshot | undefined): void };
	readonly _session: IObservable<ISession | undefined>;
	readonly _feedbackItems: IObservable<readonly never[]>;
	readonly _comparisonSelection: { readonly enabled: IObservable<boolean> };
	_comparisonSubmitArmed?: boolean;
	readonly _comparisonJudgeHarness?: IObservable<ISessionComparisonAttemptConfiguration['harness'] | undefined>;
	readonly _comparisonSynthesisHarness?: IObservable<ISessionComparisonAttemptConfiguration['harness'] | undefined>;
	readonly _comparisonBranch?: IObservable<string | undefined>;
	readonly _workspacePicker: {
		readonly selectedFolderUri: URI | undefined;
		readonly selectionSnapshot?: IWorkspaceSelectionSnapshot;
		validateSelectedWorkspace(): Promise<boolean>;
		clearAttachedContext(): void;
		showPicker(): void;
	};
	readonly _isQuickChatComposer: IObservable<boolean>;
	readonly agentFeedbackService: { removeFeedback(resource: URI, id: string): void };
	readonly sessionsManagementService: {
		readonly onDidSendRequest: Event<ISendRequestSentEvent>;
		readonly onDidReplaceNewDraftSession?: Event<{ readonly from: ISession; readonly to: ISession }>;
		readonly onDidReplaceSession?: Event<{ readonly from: ISession; readonly to: ISession }>;
		readonly onDidEndNewSessionRequest?: Event<INewSessionRequestEndedEvent>;
		sendNewChatRequest(session: ISession, options: ISendRequestOptions): Promise<void>;
		getSessionTypesForFolder?(workspace: URI): readonly { readonly providerId: string; readonly sessionType: { readonly id: string; readonly label: string; readonly supportsWorktreeConfiguration?: boolean } }[];
	};
	readonly sessionsProvidersService?: {
		getProvider(providerId: string): {
			getModelsSnapshotForCreation(workspace: URI, sessionTypeId: string, desiredModelId?: string): {
				readonly desiredModelResolution: { readonly kind: 'available'; readonly model: { readonly identifier: string; readonly metadata: { readonly name: string } } };
			};
		} | undefined;
	};
	readonly sessionComparisonService?: { startComparison(options: IStartSessionComparisonOptions): Promise<{ readonly id: string; readonly participants: readonly { readonly role: SessionComparisonParticipantRole; readonly sessionResource?: URI }[] }> };
	readonly sessionsService?: { unsetNewSession(): void; openSession(resource: URI, options: { readonly source: 'chat' }): Promise<void> };
	readonly commandService?: { executeCommand(commandId: string, ...args: unknown[]): Promise<unknown> };
	readonly logService: { error(message: string, ...args: unknown[]): void };
	_getComparisonBranch?(session: ISession): string | undefined;
	_getWorkspaceRoots(session: ISession): readonly URI[];
	_createNewSession?(folderUri: URI, pick?: IPreferredSessionType): Promise<void>;
	_openQuickChat?(): void;
	_backgroundReseedTarget?(session: ISession, folderUri: URI | undefined): INewSessionTarget;
	_clearBackgroundSendOnFailure?(slot: INewSessionDraftSlot, session: ISession, sendOptions: ISendRequestOptions): IDisposable;
}

interface IGetComparisonBranchHarness {
	readonly _session: IObservable<ISession | undefined>;
	readonly _workspacePicker: {
		readonly selectedFolderUri?: URI;
		readonly selectedResolved: { readonly workspace: ISessionWorkspace } | undefined;
	};
	readonly sessionsProvidersService: {
		getProvider(providerId: string): {
			readonly id: string;
			getCreateSessionConfig(sessionId: string): Record<string, unknown> | undefined;
			getSessionConfig?: IAgentHostSessionsProvider['getSessionConfig'];
		} | undefined;
	};
}

interface IComparisonActionVisibilityHarness extends IGetComparisonBranchHarness {
	readonly _draftHost?: INewSessionDraftHost;
	readonly sessionsManagementService?: { getSessionTypesForFolder(): readonly { providerId: string; sessionType: { id: string; label: string; supportsWorktreeConfiguration: boolean } }[] };
	readonly _environment: IObservable<ISessionCreationEnvironment | undefined>;
	readonly _compareAgentsEnabled: IObservable<boolean>;
	readonly _pendingPreferredUpgrade: { readonly value: IDisposable | undefined };
	readonly _newSessionCreation: { readonly value: IDisposable | undefined };
	_getComparisonBranch(session?: ISession, reader?: IReader): string | undefined;
}

interface IRenderSessionTypePickerHarness {
	readonly _newChatInput: {
		readonly sessionTypePicker: {
			render(container: HTMLElement, options?: { className?: string }): void;
		};
	};
}

interface IRenderWorkspacePickerHarness extends IRenderSessionTypePickerHarness {
	readonly _environment: ReturnType<typeof observableValue<ISessionCreationEnvironment | undefined>>;
	readonly _environmentPicker: { readonly isVisible: IObservable<boolean>; render(container: HTMLElement): IDisposable & { readonly element: HTMLElement } };
	readonly agentHostFilterService: { readonly selectedHost: { readonly sessionCreationProviderId: string } };
	readonly _newChatInput: IRenderSessionTypePickerHarness['_newChatInput'] & {
		readonly pickerHoverDelegate?: ReturnType<typeof getDefaultHoverDelegate>;
		readonly pickerVisibility: SessionInputPickerVisibility;
		placeRepositoryControls(container?: HTMLElement): void;
	};
	readonly _workspacePicker: {
		readonly selectedFolderUri: URI | undefined;
		readonly onDidChangeSelection: Event<void>;
		renderCategoryTriggers(container: HTMLElement, triggers: readonly { readonly label?: string; readonly tooltip?: string; readonly icon?: { readonly id: string }; readonly attachesContext?: boolean; readonly clearable?: IObservable<boolean> }[]): HTMLElement;
	};
	_renderSessionTypePicker(container: HTMLElement, isQuickChat: boolean): void;
	_renderPlaceRow(container: HTMLElement, chipRow: HTMLElement): IDisposable;
	_workspacePickerRow: HTMLElement | undefined;
	_workspaceSessionOptionsHost: HTMLElement | undefined;
	readonly _sessionOptionsExpanded: ReturnType<typeof observableValue<boolean>>;
	_setSessionOptionsExpandedFromUser(expanded: boolean): void;
	readonly _workspaceOptOutTarget: IObservable<ICreateNewSessionOptions | undefined>;
	readonly _workspaceOptOutEnabled: ReturnType<typeof observableValue<boolean>>;
	readonly _screenReaderOptimized: ReturnType<typeof observableValue<boolean>>;
	readonly _collapsedSessionOptionsShowIcons: ReturnType<typeof observableValue<boolean>>;
	readonly _iconOnlyPickers: ISessionOptionsIconOnlyPickers;
	readonly _onDidChangeChatPetPlatform: Emitter<void>;
	readonly telemetryService: ITelemetryService;
}

interface ISelectNoWorkspaceHarness {
	readonly _detached?: boolean;
	readonly _draftSlot?: Pick<INewSessionDraftSlot, 'createQuickChat'>;
	readonly _session?: IObservable<ITestSessionWithChat | undefined>;
	readonly _environment: IObservable<ISessionCreationEnvironment | undefined>;
	readonly _workspaceOptOutTarget: IObservable<ICreateNewSessionOptions | undefined>;
	readonly _pendingPreferredUpgrade: MutableDisposable<IDisposable>;
	readonly _newSessionCreation: MutableDisposable<IDisposable>;
	readonly _workspacePicker: { selectNoWorkspace(userSelection?: boolean): void };
	readonly sessionsService: { openQuickChat(options?: ICreateNewSessionOptions, preserveNavigation?: boolean, preserveFocus?: boolean): { readonly sessionId: string } };
	readonly logService: Pick<ILogService, 'trace' | 'error'>;
	_openQuickChat(options?: ICreateNewSessionOptions, preserveNavigation?: boolean): { readonly sessionId: string } | undefined;
	_createQuickChat(options?: ICreateNewSessionOptions, preserveNavigation?: boolean): { readonly sessionId: string } | undefined;
	_reconcileWorkspaceEnvironment?(options: { providerId: string }): void;
}

interface INoWorkspaceOptionHarness {
	readonly _environment: IObservable<ISessionCreationEnvironment | undefined>;
	readonly _isWorkspacePickerQuickChat: IObservable<boolean>;
	readonly _session: IObservable<{ readonly providerId: string } | undefined>;
	readonly sessionsProvidersService: { getProviders(): ISessionsProvider[] };
	readonly sessionsManagementService: { isQuickChatTargetAvailable(options?: ICreateNewSessionOptions): boolean };
	selectNoWorkspace(options?: ICreateNewSessionOptions): void;
}

interface IWorkspaceRootsHarness {
	readonly _isQuickChatComposer: IObservable<boolean>;
	readonly _workspacePicker: { readonly selectedFolderUri: URI | undefined };
}

interface ICanSendRequestToWorkspaceHarness {
	readonly _workspacePicker: Pick<WorkspacePicker, 'selectedFolderUri' | 'matchesSelectedWorkspace' | 'getDevContainerWorkspaceAvailability'>;
	readonly sessionsProvidersService: Pick<ISessionsProvidersService, 'getProviders'>;
	readonly sessionsManagementService: Pick<ISessionsManagementService, 'isQuickChatTargetAvailable'>;
}

interface IRestoreNoWorkspaceDraftHarness {
	readonly configurationService: IConfigurationService;
	_workspaceSelectionCleared: boolean;
	readonly _environment: IObservable<ISessionCreationEnvironment | undefined>;
	readonly _pickedEnvironment: IObservable<ISessionCreationEnvironment | undefined>;
	readonly _workspaceOptOutTarget: IObservable<ICreateNewSessionOptions | undefined>;
	readonly _noWorkspaceRestore: MutableDisposable<IDisposable>;
	readonly _newSessionCreation: MutableDisposable<IDisposable>;
	_createdSessionId: string | undefined;
	readonly _workspacePicker: Pick<WorkspacePicker, 'isNoWorkspaceSelected' | 'selectedFolderUri' | 'whenWorkspaceRestored'>;
	readonly _paneSession: IObservable<ITestSessionWithChat | undefined>;
	readonly sessionsService: {
		readonly activeSession: IObservable<ITestSessionWithChat | undefined>;
		readonly initialRestoreComplete: IObservable<boolean>;
		openQuickChat(options?: ICreateNewSessionOptions, preserveNavigation?: boolean): ITestSessionWithChat | undefined;
	};
	readonly sessionsManagementService: { isQuickChatTargetAvailable(): boolean };
	selectNoWorkspace(options?: ICreateNewSessionOptions, selectionOptions?: ISelectNoWorkspaceOptions): void;
}

interface IHandleWorkspaceSelectionHarness {
	readonly _draftHost?: Partial<INewSessionDraftHost>;
	readonly _environment: IObservable<ISessionCreationEnvironment | undefined>;
	readonly _workspaceOptOutEnabled: IObservable<boolean>;
	readonly _newChatInput: Pick<SharedChatInputComposer, 'focus'>;
	_isCurrentWorkspaceSelection(folderUri: URI | undefined): boolean;
	_onWorkspaceSelected(folderUri: URI | undefined): Promise<void>;
}

interface IClearWorkspaceHarness {
	readonly _detached?: boolean;
	readonly _draftSlot?: Pick<INewSessionDraftSlot, 'discardNewSession'>;
	_workspaceSelectionCleared: boolean;
	readonly _workspaceOptOutTarget: IObservable<ICreateNewSessionOptions | undefined>;
	readonly _noWorkspaceRestore: MutableDisposable<IDisposable>;
	readonly _pendingPreferredUpgrade: MutableDisposable<IDisposable>;
	readonly _newSessionCreation: MutableDisposable<IDisposable>;
	_preferredDevContainerFolderUri: URI | undefined;
	readonly _session: IObservable<ISession | undefined>;
	readonly _workspaceOptOutEnabled: IObservable<boolean>;
	readonly sessionsService: { unsetNewSession(): void };
	readonly notificationService: { error(message: string): void };
	selectNoWorkspace(options?: ICreateNewSessionOptions, selectionOptions?: ISelectNoWorkspaceOptions): ITestSessionWithChat | undefined;
	_restoreNoWorkspaceDraft(): Promise<void>;
}

const renderWorkspacePicker = Reflect.get(NewChatWidget.prototype, '_renderWorkspacePicker') as (this: IRenderWorkspacePickerHarness, container: HTMLElement) => IDisposable;
const noIconOnlyPickers: IRenderWorkspacePickerHarness['_iconOnlyPickers'] = {
	iconOnlyPickerIds: constObservable(new Set<string>()),
	showOptionsToggle: constObservable(true),
	getPickerId: () => undefined,
	showContextMenu: () => { },
};
const renderSessionTypePicker = Reflect.get(NewChatWidget.prototype, '_renderSessionTypePicker') as (this: IRenderSessionTypePickerHarness, container: HTMLElement, isQuickChat: boolean) => void;
const selectNoWorkspace = NewChatWidget.prototype.selectNoWorkspace as (this: ISelectNoWorkspaceHarness, options?: ICreateNewSessionOptions, selectionOptions?: ISelectNoWorkspaceOptions) => void;
const openQuickChat = Reflect.get(NewChatWidget.prototype, '_openQuickChat') as ISelectNoWorkspaceHarness['_openQuickChat'];
const createQuickChat = Reflect.get(NewChatWidget.prototype, '_createQuickChat') as ISelectNoWorkspaceHarness['_createQuickChat'];
const getNoWorkspaceOption = Reflect.get(NewChatWidget.prototype, '_getNoWorkspaceOption') as (this: INoWorkspaceOptionHarness) => IWorkspacePickerNoWorkspaceOption | undefined;
const getWorkspaceRoots = Reflect.get(NewChatWidget.prototype, '_getWorkspaceRoots') as (this: IWorkspaceRootsHarness, session: ISession) => readonly URI[];
const canSendRequestToWorkspace = Reflect.get(NewChatWidget.prototype, '_canSendRequestToWorkspace') as (this: ICanSendRequestToWorkspaceHarness, session: ISession, environment: ISessionCreationEnvironment, reader: IReader) => boolean;
const restoreNoWorkspaceDraft = Reflect.get(NewChatWidget.prototype, '_restoreNoWorkspaceDraft') as (this: IRestoreNoWorkspaceDraftHarness) => Promise<void>;
const handleWorkspaceSelection = Reflect.get(NewChatWidget.prototype, '_handleWorkspaceSelection') as (this: IHandleWorkspaceSelectionHarness, folderUri: URI | undefined) => Promise<void>;
const onWorkspaceSelected = Reflect.get(NewChatWidget.prototype, '_onWorkspaceSelected') as (this: IClearWorkspaceHarness, folderUri: URI | undefined) => Promise<void>;
const getWorkspaceOptOutTarget = Reflect.get(NewChatWidget.prototype, '_getWorkspaceOptOutTarget') as (
	this: { readonly sessionsManagementService: Pick<ISessionsManagementService, 'isQuickChatTargetAvailable' | 'getQuickChatSessionTypes'> },
	environment: ISessionCreationEnvironment | undefined, session: ISession | undefined,
) => ICreateNewSessionOptions | undefined;

function createHarness(
	pendingPreferredUpgrade: MutableDisposable<IDisposable>,
	newSessionCreation: MutableDisposable<IDisposable>,
	onDidChangeSessionTypes: Event<void>,
	stubCreateSessionNow: (token: CancellationToken) => Promise<IOpenNewSessionResult>,
): INewChatWidgetHarness {
	const harness: INewChatWidgetHarness = {
		_pendingPreferredUpgrade: pendingPreferredUpgrade,
		_workspacePicker: workspaceIdentity(),
		_newSessionCreation: newSessionCreation,
		_createdSessionId: undefined,
		sessionsManagementService: { onDidChangeSessionTypes },
		_session: observableValue<IActiveDraft | undefined>('session', undefined),
		_newChatInput: {
			sessionTypePicker: {
				getUserPickedSessionType: () => undefined,
				getPreferredSessionType: () => undefined,
			},
		},
		_isPreferredServable: () => false,
		_createSessionNow: (_folderUri, _userPick, token) => stubCreateSessionNow(token),
		_applyPreferredDevContainer: () => { },
		_createNewSession: (folderUri, userPick) => createNewSession.call(harness, folderUri, userPick),
		_scheduleRecreateOnProviderChange: (folderUri, userPick, created, replayMissedChange) => scheduleRecreateOnProviderChange.call(harness, folderUri, userPick, created, replayMissedChange),
		_recreateOnProviderChange: (folderUri, userPick, created) => recreateOnProviderChange.call(harness, folderUri, userPick, created),
	};
	return harness;
}

suite('NewChatWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('revealing the Inbox composer restores a consumed draft without replacing an existing or pending draft', () => {
		const session = observableValue<ITestSessionWithChat | undefined>('draft', createTestActiveSession('draft', false));
		const creation = disposables.add(new MutableDisposable<IDisposable>());
		const seeded: (ITestSessionWithChat | undefined)[] = [];
		const harness = {
			_detached: true,
			_session: session,
			_newSessionCreation: creation,
			_seedWorkspaceDraft: () => { seeded.push(session.get()); },
		};
		const setHostVisible = Reflect.get(NewChatWidget.prototype, 'setHostVisible') as (this: typeof harness, visible: boolean) => void;
		setHostVisible.call(harness, true);
		session.set(undefined, undefined);
		setHostVisible.call(harness, false);
		creation.value = toDisposable(() => { });
		setHostVisible.call(harness, true);
		creation.clear();
		setHostVisible.call(harness, true);
		harness._detached = false;
		setHostVisible.call(harness, true);
		assert.deepStrictEqual(seeded, [undefined]);
	});

	test('forwards nonempty composing intent to the current draft provider, but not after Send', () => {
		const changed = disposables.add(new Emitter<void>());
		let input = '';
		const current = observableValue<ITestSessionWithChat | undefined>('draft', undefined);
		const created = observableValue('created', false);
		const sending = observableValue('sending', false);
		const calls: string[] = [];
		const draft = (providerId: string) => upcastPartial<ITestSessionWithChat>({
			providerId, sessionId: `${providerId}:draft`,
			...withCreatedStatus(created), isNewSessionRequestInProgress: sending,
		});
		const harness = {
			_session: current,
			_newChatInput: { onDidChangeInput: changed.event, getInputValue: () => input },
			sessionsProvidersService: {
				getProvider: (id: string) => upcastPartial<ISessionsProvider>({
					id, prepareNewSessionWhileComposing: id === 'unsupported' ? undefined : sessionId => calls.push(sessionId),
				}),
			},
		};
		const track = Reflect.get(NewChatWidget.prototype, '_trackSessionPreparation') as (this: typeof harness) => IDisposable;
		const tracking = disposables.add(track.call(harness));
		current.set(draft('first'), undefined);
		input = '   ';
		changed.fire();
		input = 'private draft text';
		changed.fire();
		current.set(draft('second'), undefined);
		sending.set(true, undefined);
		changed.fire();
		created.set(true, undefined);
		sending.set(false, undefined);
		current.set(draft('unsupported'), undefined);
		tracking.dispose();
		current.set(draft('first'), undefined);
		created.set(false, undefined);
		changed.fire();

		assert.deepStrictEqual(calls, ['first:draft', 'second:draft']);
	});

	for (const modernUI of [false, true]) {
		test(`overlapping composer controls remain clickable in short new-session panes (modern UI: ${modernUI})`, () => {
			const store = disposables.add(new DisposableStore());
			const { instantiationService, chatViews } = createSessionViewTestServices(store);
			stubSessionsHostLayout(instantiationService);
			const view = store.add(instantiationService.createInstance(SessionView, undefined));
			const workbench = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
			if (modernUI) {
				workbench.classList.add('modern-ui-tabs', 'modern-ui-connected-editor-tabs');
			}
			append(append(workbench, $('.part.sessionspart')), view.element);
			store.add(toDisposable(() => workbench.remove()));
			view.openPane(testPaneOf(createTestActiveSession('draft', false)), {});
			view.layout(400, 200, 0, 0);
			const widget = append(chatViews[0].element, $('.sessions-chat-widget'));
			chatViews[0].element.replaceChildren(widget);
			const container = append(widget, $('.new-chat-widget-container'));
			const composer = append(container, $('.new-chat-widget-content'));
			composer.style.cssText = 'position: absolute; top: 8px; left: 40px; width: 340px;';
			const controls = append(composer, $('div'));
			const workspace = append(controls, $('button', undefined, 'Workspace'));
			const provider = append(controls, $('button', undefined, 'Provider'));
			const input = append(composer, $('textarea'));
			input.style.height = '200px';
			const clicks: string[] = [];
			store.add(addDisposableListener(workspace, EventType.CLICK, () => clicks.push('workspace')));
			store.add(addDisposableListener(provider, EventType.CLICK, () => clicks.push('provider')));
			const dragArea = view.element.querySelector<HTMLElement>('.chat-composite-bar-toolbar-floating')!;
			const toolbar = dragArea.querySelector<HTMLElement>('.chat-composite-bar-toolbar')!;
			const action = append(toolbar, $('button', undefined, 'Action'));
			store.add(addDisposableListener(action, EventType.CLICK, () => clicks.push('action')));
			const bounds = view.element.getBoundingClientRect();
			const targets = [workspace, provider, action].map(control => {
				const rect = control.getBoundingClientRect();
				const target = mainWindow.document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
				target?.dispatchEvent(new MouseEvent(EventType.CLICK, { bubbles: true }));
				return { overlapsDragArea: rect.top < bounds.top + dragArea.offsetHeight, receivesClick: target === control };
			});
			assert.deepStrictEqual({
				targets,
				clicks,
				blankSpaceDraggable: mainWindow.document.elementFromPoint(bounds.left + 16, bounds.top + 16) === dragArea,
			}, {
				targets: Array.from({ length: 3 }, () => ({ overlapsDragArea: true, receivesClick: true })),
				clicks: ['workspace', 'provider', 'action'],
				blankSpaceDraggable: true,
			});
		});
	}

	suite('environment transitions', () => {
		const local: ISessionCreationEnvironment = { id: 'local', kind: 'local', label: 'This Computer', icon: Codicon.deviceDesktop, providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID] };
		const cloud: ISessionCreationEnvironment = { id: 'cloud', kind: 'cloud', label: 'Cloud', icon: Codicon.cloud, providerIds: ['cloud'] };
		const container: ISessionCreationEnvironment = { ...local, id: 'container:local', kind: 'container' };
		const folder = URI.file('/project');

		test('legacy environment reconciliation keeps provider ordering and container metadata unchanged', () => {
			const first = { ...local, id: 'first-local' };
			const second = { ...local, id: 'second-local' };
			const picked = observableValue<ISessionCreationEnvironment | undefined>('picked', second);
			const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
				_environment: picked,
				_environments: constObservable([first, second]),
				_pickedEnvironment: picked,
			});
			const reconcile = Reflect.get(NewChatWidget.prototype, '_reconcileWorkspaceEnvironment') as (this: NewChatWidget, options: ISelectWorkspaceOptions) => void;
			reconcile.call(widget, { providerId: LOCAL_AGENT_HOST_PROVIDER_ID });
			const localSelection = picked.get();
			reconcile.call(widget, { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, preferDevContainer: true });
			assert.deepStrictEqual({ localSelection, containerSelection: picked.get() }, {
				localSelection: first,
				containerSelection: { ...first, id: 'container:first-local', kind: 'container', label: 'Dev Container', icon: Codicon.remote },
			});
		});

		test('automatic workspace restoration does not pin Cloud before This Computer registers', async () => {
			const environments = observableValue<readonly ISessionCreationEnvironment[]>('environments', [cloud]);
			const picked = observableValue<ISessionCreationEnvironment | undefined>('pickedEnvironment', undefined);
			const environment = derived(reader => picked.read(reader)
				?? getDefaultSessionCreationEnvironment(environments.read(reader), folder, 'cloud'));
			const widget = Object.assign(Object.create(NewChatWidget.prototype), {
				_environment: environment,
				_environments: environments,
				_pickedEnvironment: picked,
				_workspaceOptOutEnabled: constObservable(false),
				uriIdentityService: { extUri },
				_workspacePicker: {
					selectedResolved: { providerId: 'cloud' },
					getEnvironmentWorkspace: () => undefined,
				},
				_isCurrentWorkspaceSelection: () => false,
				_onWorkspaceSelected: async () => { },
				_newChatInput: { focus: () => { } },
			});
			const initialEnvironment = environment.get()?.id;

			await handleWorkspaceSelection.call(widget, folder);
			environments.set([cloud, local], undefined);

			assert.deepStrictEqual({ initialEnvironment, selected: environment.get()?.id, picked: picked.get()?.id }, {
				initialEnvironment: 'cloud',
				selected: 'local',
				picked: undefined,
			});
		});

		test('workspace selection preserves an explicit environment selection', async () => {
			const updatedCloud: ISessionCreationEnvironment = { ...cloud, label: 'Updated Cloud', providerIds: ['new-cloud-provider'] };
			const picked = observableValue<ISessionCreationEnvironment | undefined>('pickedEnvironment', cloud);
			const widget = Object.assign(Object.create(NewChatWidget.prototype), {
				_environment: constObservable(cloud),
				_environments: constObservable([updatedCloud]),
				_pickedEnvironment: picked,
				_workspaceOptOutEnabled: constObservable(false),
				uriIdentityService: { extUri },
				_workspacePicker: {
					selectedResolved: { providerId: 'new-cloud-provider' },
					getEnvironmentWorkspace: () => undefined,
				},
				_isCurrentWorkspaceSelection: () => false,
				_onWorkspaceSelected: async () => { },
				_newChatInput: { focus: () => { } },
			});

			await handleWorkspaceSelection.call(widget, folder);

			assert.strictEqual(picked.get(), cloud);
		});

		function createHarness(compatible: boolean, onSelect: () => Promise<void> = async () => { }) {
			const calls: string[] = [];
			let selectedFolder: URI | undefined = folder;
			const picked = observableValue<ISessionCreationEnvironment | undefined>('pickedEnvironment', undefined);
			const workspace = upcastPartial<ISessionWorkspace>({ folders: [{ root: folder, workingDirectory: folder, name: 'project', description: undefined }] });
			const providers = [LOCAL_AGENT_HOST_PROVIDER_ID, 'cloud'].map(id => upcastPartial<ISessionsProvider>({
				id,
				resolveWorkspace: uri => id === 'cloud' && !compatible ? undefined : {
					...workspace,
					folders: workspace.folders.map(folder => ({ ...folder, root: uri, workingDirectory: uri })),
				},
				getSessionTypes: () => [{ id: 'copilot', label: 'Copilot', icon: Codicon.copilot, authRequirement: SessionTypeAuthRequirement.GitHub, supportsWorktreeConfiguration: true }],
				setIsolationMode: async (_sessionId, isolation) => { calls.push(`isolation:${isolation}`); },
			}));
			const cancellable = (name: string) => {
				const value = disposables.add(new MutableDisposable<IDisposable>());
				value.value = toDisposable(() => calls.push(name));
				return value;
			};
			const harness = {
				_environment: derived(reader => picked.read(reader) ?? local),
				_environmentWorkspaces: new Map<string, URI>(),
				_environmentWorkspaceChanged: { trigger: () => { } },
				_pickedEnvironment: picked,
				_session: constObservable({ sessionId: 'draft', providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionType: 'copilot', ...withCreatedStatus(constObservable(false)) }),
				_workspaceOptOutEnabled: constObservable(false),
				_workspaceOptOutTarget: constObservable(undefined),
				_preferredDevContainerFolderUri: undefined as URI | undefined,
				_pendingPreferredUpgrade: cancellable('cancelUpgrade'),
				_newSessionCreation: cancellable('cancelCreation'),
				_noWorkspaceRestore: cancellable('cancelRestore'),
				_newChatInput: { saveState: () => calls.push('saveDraft') },
				newSessionComposerService: { notifyUserWorkspaceSelection: () => calls.push('userSelection') },
				_workspacePicker: {
					get selectedFolderUri() { return selectedFolder; },
					getEnvironmentWorkspace: (environment: ISessionCreationEnvironment, _reader?: IReader, preferredFolderUri?: URI) => {
						const provider = providers.find(provider => environment.providerIds.includes(provider.id));
						const folderUri = preferredFolderUri ?? selectedFolder;
						const workspace = folderUri && provider?.resolveWorkspace(folderUri);
						return workspace && provider ? { workspace, providerId: provider.id } : undefined;
					},
					clearSelection: () => { selectedFolder = undefined; calls.push('clearWorkspace'); },
					setSelectedWorkspace: (uri: URI, options: { providerId: string; preferDevContainer: boolean }): void => { selectedFolder = uri; calls.push(`workspace:${options.providerId}:${options.preferDevContainer}`); },
				},
				sessionsProvidersService: { getProviders: () => providers, getProvider: (id: string) => providers.find(provider => provider.id === id) },
				_isPreferredServable: () => false,
				_onWorkspaceSelected: async () => { calls.push('createDraft'); await onSelect(); },
				accessibilityService: { status: (message: string) => calls.push(message) },
				focusWorkspacePicker: () => calls.push('openWorkspacePicker'),
				logService: { error: () => assert.fail('unexpected connection failure') },
				notificationService: { error: () => assert.fail('unexpected connection failure notification') },
				/** The host of a composer outside the main window, if it is one. */
				_draftHost: undefined as Partial<INewSessionDraftHost> | undefined,
				_requestTarget(change: (target: INewSessionTarget) => INewSessionTarget) { (Reflect.get(NewChatWidget.prototype, '_requestTarget') as (this: unknown, change: (target: INewSessionTarget) => INewSessionTarget) => void).call(this, change); },
			};
			const select = Reflect.get(NewChatWidget.prototype, '_selectEnvironment') as (this: typeof harness, environment: ISessionCreationEnvironment) => Promise<void>;
			return { harness, calls, select: (environment: ISessionCreationEnvironment) => select.call(harness, environment) };
		}

		test('a composer outside the main window requests the Dev Container of the environment the user picks, and no longer once the user picks another environment', async () => {
			const { harness, select } = createHarness(true);
			const target = observableValue<INewSessionTarget | undefined>('target', { folderUri: folder, requireDevContainer: true });
			harness._draftHost = { requestedTarget: target, setRequestedTarget: next => target.set(next, undefined) };
			await select(cloud);
			const inCloud = target.get()?.requireDevContainer;
			await select(container);

			assert.deepStrictEqual({ inCloud, inContainer: target.get()?.requireDevContainer }, { inCloud: undefined, inContainer: true });
		});

		test('does not open the workspace picker after changing or reselecting an environment', async () => {
			const { calls, select } = createHarness(true);
			await select(cloud);
			const afterChange = [...calls];
			await select(cloud);
			assert.deepStrictEqual({ afterChange, afterReselection: calls }, {
				afterChange: ['saveDraft', 'cancelUpgrade', 'cancelCreation', 'cancelRestore', 'userSelection', 'workspace:cloud:false', 'createDraft', 'Environment: Cloud'],
				afterReselection: afterChange,
			});
		});

		test('saves the draft and cancels pending work before clearing an incompatible workspace', async () => {
			const { harness, calls, select } = createHarness(false);
			await select(cloud);
			assert.deepStrictEqual({ environment: harness._pickedEnvironment.get()?.id, folder: harness._workspacePicker.selectedFolderUri, calls }, {
				environment: 'cloud', folder: undefined,
				calls: ['saveDraft', 'cancelUpgrade', 'cancelCreation', 'cancelRestore', 'userSelection', 'clearWorkspace', 'Environment: Cloud'],
			});
		});

		test('retains a supported Cloud workspace and creates a draft without sending', async () => {
			const { harness, calls, select } = createHarness(true);
			await select(cloud);
			assert.deepStrictEqual({ environment: harness._pickedEnvironment.get()?.id, folder: harness._workspacePicker.selectedFolderUri, calls }, {
				environment: 'cloud', folder,
				calls: ['saveDraft', 'cancelUpgrade', 'cancelCreation', 'cancelRestore', 'userSelection', 'workspace:cloud:false', 'createDraft', 'Environment: Cloud'],
			});

		});

		test('restores the previous project after an incompatible environment clears it', async () => {
			const { harness, select } = createHarness(false);
			const remote: ISessionCreationEnvironment = { id: 'wsl', kind: 'remote', label: 'WSL', icon: Codicon.remote, providerIds: ['wsl'] };
			await select(remote);
			const remoteFolder = harness._workspacePicker.selectedFolderUri;
			await select(local);
			assert.deepStrictEqual({
				remoteFolder,
				environment: harness._pickedEnvironment.get()?.id,
				folder: harness._workspacePicker.selectedFolderUri,
			}, { remoteFolder: undefined, environment: 'local', folder });
		});

		test('remembers each environment project independently and updates it after a new selection', async () => {
			const { harness, select } = createHarness(true);
			const cloudFolder = URI.file('/cloud-project');
			const updatedLocalFolder = URI.file('/updated-project');
			await select(cloud);
			harness._workspacePicker.setSelectedWorkspace(cloudFolder, { providerId: 'cloud', preferDevContainer: false });
			await select(local);
			const restoredLocal = harness._workspacePicker.selectedFolderUri;
			harness._workspacePicker.setSelectedWorkspace(updatedLocalFolder, { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, preferDevContainer: false });
			await select(cloud);
			const restoredCloud = harness._workspacePicker.selectedFolderUri;
			await select(local);
			assert.deepStrictEqual({
				restoredLocal, restoredCloud, updatedLocal: harness._workspacePicker.selectedFolderUri,
			}, { restoredLocal: folder, restoredCloud: cloudFolder, updatedLocal: updatedLocalFolder });
		});

		test('does not announce or open the workspace picker for a superseded destination after late draft creation', async () => {
			const pending = new DeferredPromise<void>();
			let selections = 0;
			const { harness, calls, select } = createHarness(true, async () => {
				if (++selections === 1) {
					await pending.p;
				}
			});
			const first = select(cloud);
			await select(local);
			await pending.complete();
			await first;
			assert.deepStrictEqual({
				environment: harness._pickedEnvironment.get()?.id,
				announcements: calls.filter(call => call.startsWith('Environment:')),
				openedPickers: calls.filter(call => call === 'openWorkspacePicker').length,
			}, { environment: 'local', announcements: ['Environment: This Computer'], openedPickers: 0 });
		});

		function createFolderlessHarness(quickChat = true, optOutEnabled = true) {
			const remote: ISessionCreationEnvironment = { id: 'agenthost-ssh', kind: 'remote', label: 'SSH', icon: Codicon.remote, providerIds: ['agenthost-ssh'] };
			const tunnel: ISessionCreationEnvironment = { id: 'agenthost-tunnel', kind: 'remote', label: 'Dead Tunnel', icon: Codicon.remote, providerIds: ['agenthost-tunnel'] };
			const picked = observableValue<ISessionCreationEnvironment | undefined>('picked', remote);
			const createDraft = (providerId: string, sessionType: string, isQuickChat = true) => upcastPartial<ITestSessionWithChat>({
				sessionId: `${providerId}:${sessionType}`,
				providerId, sessionType,
				...withCreatedStatus(constObservable(false)),
				isQuickChat: constObservable(isQuickChat),
				workspace: constObservable(isQuickChat ? undefined : upcastPartial<ISessionWorkspace>({ folders: [{ root: folder, workingDirectory: folder, name: 'project', description: undefined }] })),
			});
			const session = observableValue<ITestSessionWithChat | undefined>('session', createDraft(remote.id, 'copilotcli', quickChat));
			const type = { id: 'copilotcli', label: 'Copilot', icon: Codicon.copilot, authRequirement: SessionTypeAuthRequirement.GitHub };
			const remoteTarget = { providerId: remote.id, sessionType: type };
			const localTarget = { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionType: type };
			const cloudTarget = { providerId: 'cloud', sessionType: { ...type, id: 'cloud' } };
			const targets = observableValue('targets', [remoteTarget, localTarget]);
			let selectedFolder: URI | undefined = quickChat ? undefined : folder;
			let noWorkspaceSelected = quickChat;
			let pendingSelection = Promise.resolve();
			const opened: (ICreateNewSessionOptions | undefined)[] = [];
			const errors: string[] = [];
			const announcements: string[] = [];
			const traces: string[] = [];
			const management = {
				getQuickChatSessionTypes: () => targets.get(),
				isQuickChatTargetAvailable: (options?: ICreateNewSessionOptions) => targets.get().some(target =>
					(!options?.providerId || target.providerId === options.providerId) && (!options?.sessionTypeId || target.sessionType.id === options.sessionTypeId)),
			};
			const targetHarness = { sessionsManagementService: management };
			const handleClear = Reflect.get(NewChatWidget.prototype, '_onWorkspaceSelected') as (this: NewChatWidget, folderUri: URI | undefined) => Promise<void>;
			const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
				_environment: picked,
				_environments: constObservable([local, cloud, container, remote, tunnel]),
				_environmentWorkspaces: new Map<string, URI>(),
				_pickedEnvironment: picked,
				_session: session,
				_workspaceOptOutEnabled: constObservable(optOutEnabled),
				_pendingPreferredUpgrade: disposables.add(new MutableDisposable()),
				_newSessionCreation: disposables.add(new MutableDisposable()),
				_noWorkspaceRestore: disposables.add(new MutableDisposable()),
				_workspaceOptOutTarget: derived(reader => {
					targets.read(reader);
					return getWorkspaceOptOutTarget.call(targetHarness, picked.read(reader), session.read(reader));
				}),
				_comparisonSelection: { reset: () => { } },
				_newChatInput: { saveState: () => { }, preparePromptOptionsRefresh: () => false },
				newSessionComposerService: { notifyUserWorkspaceSelection: () => { } },
				uriIdentityService: { extUri },
				_workspacePicker: {
					get selectedFolderUri() { return selectedFolder; },
					isNoWorkspaceSelected: () => noWorkspaceSelected,
					whenWorkspaceRestored: async () => true,
					getEnvironmentWorkspace: () => undefined,
					selectNoWorkspace: () => { selectedFolder = undefined; noWorkspaceSelected = true; },
					clearSelection: () => {
						selectedFolder = undefined;
						noWorkspaceSelected = false;
						pendingSelection = handleClear.call(widget, undefined);
					},
				},
				sessionsManagementService: management,
				sessionsProvidersService: {
					getProvider: (id: string) => id === tunnel.id ? {
						id,
						connectionStatus: constObservable({ kind: 'disconnected' }),
						connect: async () => { throw new Error('tunnel relay connect timed out after 30000ms'); },
					} : undefined,
				},
				_paneSession: session,
				sessionsService: {
					activeSession: session,
					initialRestoreComplete: constObservable(true),
					openQuickChat: (options?: ICreateNewSessionOptions) => {
						opened.push(options);
						const target = targets.get().find(target => !options?.providerId || target.providerId === options.providerId);
						if (!target) {
							return undefined;
						}
						const draft = createDraft(target.providerId, options?.sessionTypeId ?? target.sessionType.id);
						session.set(draft, undefined);
						return draft;
					},
					unsetNewSession: () => session.set(undefined, undefined),
				},
				accessibilityService: { status: (message: string) => announcements.push(message) },
				logService: { error: (_message: string, error: Error) => errors.push(error.message), trace: (message: string) => traces.push(message) },
				notificationService: { error: () => { } },
			});
			const select = Reflect.get(NewChatWidget.prototype, '_selectEnvironment') as (this: NewChatWidget, environment: ISessionCreationEnvironment) => Promise<void>;
			const restore = Reflect.get(NewChatWidget.prototype, '_restoreNoWorkspaceDraft') as (this: NewChatWidget) => Promise<void>;
			return {
				widget, targetHarness, session, picked, remote, tunnel, targets, remoteTarget, localTarget, cloudTarget, opened, errors, announcements, traces,
				select: async (environment: ISessionCreationEnvironment) => {
					await select.call(widget, environment);
					await pendingSelection;
				},
				restore: () => restore.call(widget),
				get noWorkspaceSelected() { return noWorkspaceSelected; },
			};
		}

		for (const { quickChat, optOutEnabled } of [
			{ quickChat: true, optOutEnabled: true },
			{ quickChat: false, optOutEnabled: true },
			{ quickChat: true, optOutEnabled: false },
		]) {
			test(`switches the folderless draft to This Computer (quick chat: ${quickChat}, workspace opt-out: ${optOutEnabled})`, async () => {
				const state = createFolderlessHarness(quickChat, optOutEnabled);
				await state.select(local);
				await state.restore();
				assert.deepStrictEqual({
					providerId: state.session.get()?.providerId,
					sessionType: state.session.get()?.sessionType,
					noWorkspaceSelected: state.noWorkspaceSelected,
					opened: state.opened,
				}, {
					providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionType: 'copilotcli', noWorkspaceSelected: true,
					opened: [{ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, ...(optOutEnabled ? { sessionTypeId: 'copilotcli' } : undefined) }],
				});
			});
		}

		test('recovers This Computer after selecting a failed tunnel without keeping the SSH draft', async () => {
			const state = createFolderlessHarness();
			await state.select(state.tunnel);
			const afterFailure = state.session.get()?.providerId;
			await state.select(local);
			assert.deepStrictEqual({ afterFailure, providerId: state.session.get()?.providerId, errors: state.errors }, {
				afterFailure: undefined, providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
				errors: ['tunnel relay connect timed out after 30000ms'],
			});
		});

		test('does not open the workspace picker or announce success after an environment connection fails', async () => {
			const state = createFolderlessHarness();
			const open = sinon.stub(state.widget, 'focusWorkspacePicker');
			await state.select(state.tunnel);
			assert.deepStrictEqual({ opened: open.callCount, announcements: state.announcements, errors: state.errors }, {
				opened: 0, announcements: [], errors: ['tunnel relay connect timed out after 30000ms'],
			});
		});

		test('waits for the selected environment instead of falling back to another quick-chat provider', async () => {
			const state = createFolderlessHarness(false);
			state.targets.set([state.remoteTarget], undefined);
			await state.select(local);
			await state.restore();
			const beforeAvailable = { providerId: state.session.get()?.providerId, opened: [...state.opened], noWorkspaceSelected: state.noWorkspaceSelected };
			state.targets.set([state.remoteTarget, state.localTarget], undefined);
			await state.restore();
			assert.deepStrictEqual({ beforeAvailable, providerId: state.session.get()?.providerId, opened: state.opened }, {
				beforeAvailable: { providerId: undefined, opened: [], noWorkspaceSelected: true },
				providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
				opened: [{ providerId: LOCAL_AGENT_HOST_PROVIDER_ID }],
			});
		});

		test('switching from Cloud without a workspace starts a local quick chat', async () => {
			const state = createFolderlessHarness();
			await state.select(cloud);
			const inCloud = state.session.get()?.providerId;
			await state.select(local);
			assert.deepStrictEqual({ inCloud, providerId: state.session.get()?.providerId }, {
				inCloud: undefined, providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			});
		});

		for (const { quickChat, optOutEnabled } of [
			{ quickChat: true, optOutEnabled: true },
			{ quickChat: false, optOutEnabled: true },
			{ quickChat: true, optOutEnabled: false },
		]) {
			test(`switches to a supported Cloud quick chat (quick chat: ${quickChat}, workspace opt-out: ${optOutEnabled})`, async () => {
				const state = createFolderlessHarness(quickChat, optOutEnabled);
				state.targets.set([state.remoteTarget, state.localTarget, state.cloudTarget], undefined);
				await state.select(cloud);
				await state.restore();

				assert.deepStrictEqual({
					providerId: state.session.get()?.providerId,
					sessionType: state.session.get()?.sessionType,
					workspace: state.session.get()?.workspace.get(),
					noWorkspaceSelected: state.noWorkspaceSelected,
					opened: state.opened,
				}, {
					providerId: 'cloud', sessionType: 'cloud', workspace: undefined, noWorkspaceSelected: true,
					opened: [{ providerId: 'cloud' }],
				});
			});
		}

		test('explicit Chat selection stays in Cloud when repository-less chats become available', async () => {
			const state = createFolderlessHarness();
			await state.select(cloud);
			state.targets.set([state.remoteTarget, state.localTarget, state.cloudTarget], undefined);
			state.widget.selectNoWorkspace();

			assert.deepStrictEqual({
				providerId: state.session.get()?.providerId,
				environment: state.picked.get()?.id,
				noWorkspaceSelected: state.noWorkspaceSelected,
				opened: state.opened,
			}, {
				providerId: 'cloud', environment: 'cloud', noWorkspaceSelected: true,
				opened: [{ providerId: 'cloud' }],
			});
		});

		test('restores a repository-less Cloud draft without choosing another environment', async () => {
			const state = createFolderlessHarness();
			state.targets.set([state.remoteTarget, state.localTarget, state.cloudTarget], undefined);
			await state.select(cloud);
			state.session.set(undefined, undefined);
			state.opened.length = 0;
			await state.restore();

			assert.deepStrictEqual({
				providerId: state.session.get()?.providerId,
				environment: state.picked.get()?.id,
				opened: state.opened,
			}, {
				providerId: 'cloud', environment: 'cloud', opened: [{ providerId: 'cloud' }],
			});
		});

		test('reseeds a Cloud quick chat after a background send and stops when support is withdrawn', async () => {
			const state = createFolderlessHarness();
			state.targets.set([state.remoteTarget, state.localTarget, state.cloudTarget], undefined);
			await state.select(cloud);
			state.opened.length = 0;
			const open = Reflect.get(NewChatWidget.prototype, '_openQuickChat') as (this: NewChatWidget) => ITestSessionWithChat | undefined;
			const reseeded = open.call(state.widget);
			state.targets.set([state.remoteTarget, state.localTarget], undefined);
			const unavailable = open.call(state.widget);

			assert.deepStrictEqual({
				providerId: reseeded?.providerId,
				unavailable,
				opened: state.opened,
				traces: state.traces,
			}, {
				providerId: 'cloud',
				unavailable: undefined,
				opened: [{ providerId: 'cloud', sessionTypeId: 'cloud' }],
				traces: ['Waiting for a compatible quick-chat harness in environment \'cloud\' (providers: cloud).'],
			});
		});

		for (const environment of [cloud, container]) {
			test(`explicit quick-chat selection leaves ${environment.kind} while automatic restoration stays scoped`, async () => {
				const state = createFolderlessHarness();
				await state.select(environment);
				await state.restore();
				const beforeExplicitSelection = [...state.opened];
				state.widget.selectNoWorkspace();
				assert.deepStrictEqual({
					beforeExplicitSelection, providerId: state.session.get()?.providerId,
					environment: state.picked.get()?.id, noWorkspaceSelected: state.noWorkspaceSelected,
				}, {
					beforeExplicitSelection: [], providerId: state.remote.id,
					environment: state.remote.id, noWorkspaceSelected: true,
				});
			});
		}

		test('an explicitly requested quick-chat provider updates the selected environment', async () => {
			const state = createFolderlessHarness();
			await state.select(local);
			state.widget.selectNoWorkspace({ providerId: state.remote.id });
			assert.deepStrictEqual({ providerId: state.session.get()?.providerId, environment: state.picked.get()?.id }, {
				providerId: state.remote.id, environment: state.remote.id,
			});
		});

		test('defaults folderless reseeding to the selected environment, not provider registration order', async () => {
			const state = createFolderlessHarness();
			await state.select(local);
			state.opened.length = 0;
			const open = Reflect.get(NewChatWidget.prototype, '_openQuickChat') as (this: NewChatWidget) => ITestSessionWithChat | undefined;
			open.call(state.widget);
			assert.deepStrictEqual(state.opened, [{ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'copilotcli' }]);
		});

		test('reseeding a draft whose harness disappeared uses another harness on the same provider', async () => {
			const state = createFolderlessHarness();
			await state.select(local);
			state.opened.length = 0;
			state.targets.set([state.remoteTarget, { ...state.localTarget, sessionType: { ...state.localTarget.sessionType, id: 'claude' } }], undefined);
			const open = Reflect.get(NewChatWidget.prototype, '_openQuickChat') as (this: NewChatWidget) => ITestSessionWithChat | undefined;
			open.call(state.widget);
			assert.deepStrictEqual({
				providerId: state.session.get()?.providerId, sessionType: state.session.get()?.sessionType, opened: state.opened, traces: state.traces,
			}, {
				providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionType: 'claude',
				opened: [{ providerId: LOCAL_AGENT_HOST_PROVIDER_ID }], traces: [],
			});
		});

		test('an unavailable quick-chat target logs the selected environment and providers', async () => {
			const state = createFolderlessHarness();
			await state.select(local);
			state.opened.length = 0;
			state.targets.set([state.remoteTarget], undefined);
			const open = Reflect.get(NewChatWidget.prototype, '_openQuickChat') as (this: NewChatWidget) => ITestSessionWithChat | undefined;
			const session = open.call(state.widget);
			assert.deepStrictEqual({ session, opened: state.opened, traces: state.traces }, {
				session: undefined, opened: [],
				traces: ['Waiting for a compatible quick-chat harness in environment \'local\' (providers: local-agent-host).'],
			});
		});

		test('a provider with no remaining quick-chat harness falls back only within the selected environment', () => {
			const state = createFolderlessHarness();
			const environment = { ...local, providerIds: [state.remote.id, LOCAL_AGENT_HOST_PROVIDER_ID] };
			state.targets.set([state.localTarget], undefined);
			assert.deepStrictEqual({
				replacement: getWorkspaceOptOutTarget.call(state.targetHarness, environment, state.session.get()),
				legacy: getWorkspaceOptOutTarget.call(state.targetHarness, undefined, state.session.get()),
			}, {
				replacement: { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'copilotcli' }, legacy: undefined,
			});
		});

		test('retains the previous harness only when the selected environment supports it', () => {
			const state = createFolderlessHarness();
			const alternateTarget = { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionType: { ...state.localTarget.sessionType, id: 'claude' } };
			state.targets.set([alternateTarget, state.localTarget], undefined);
			const preferred = getWorkspaceOptOutTarget.call(state.targetHarness, local, state.session.get());
			state.targets.set([alternateTarget], undefined);
			const fallback = getWorkspaceOptOutTarget.call(state.targetHarness, local, state.session.get());
			const unsupported = getWorkspaceOptOutTarget.call(state.targetHarness, state.remote, state.session.get());
			assert.deepStrictEqual({
				preferred, fallback, unsupported,
				cloud: getWorkspaceOptOutTarget.call(state.targetHarness, cloud, undefined),
				container: getWorkspaceOptOutTarget.call(state.targetHarness, container, undefined),
			}, {
				preferred: { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'copilotcli' },
				fallback: { providerId: LOCAL_AGENT_HOST_PROVIDER_ID },
				unsupported: undefined, cloud: undefined, container: undefined,
			});
		});

		for (const previousHarness of [undefined, 'removed-harness']) {
			test(`restoring a folderless draft preserves the remembered non-first harness (previous: ${previousHarness})`, () => {
				const { instantiationService } = createSessionViewTestServices(disposables);
				let requestedType: string | undefined;
				const provider = new class extends mock<ISessionsProvider>() {
					override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
					override readonly supportsQuickChats = true;
					override readonly sessionTypes = ['copilotcli', 'claude'].map(id => ({
						id, label: id, icon: Codicon.copilot, authRequirement: SessionTypeAuthRequirement.GitHub,
					}));
					override readonly onDidChangeSessions = Event.None;
					override readonly onDidMoveChat = Event.None;
					override getSessions(): ISession[] { return []; }
					override createQuickChat(sessionTypeId: string): ISession {
						requestedType = sessionTypeId;
						return upcastPartial<ISession>({ sessionId: 'draft', providerId: this.id });
					}
					override deleteNewSession(): void { }
				}();
				instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
				instantiationService.stub(IUriIdentityService, { extUri });
				const providers = disposables.add(instantiationService.createInstance(SessionsProvidersService));
				disposables.add(providers.registerProvider(provider));
				instantiationService.stub(ISessionsProvidersService, providers);
				instantiationService.stub(IChatService, new class extends mock<IChatService>() {
					override readonly onDidSubmitRequest = Event.None;
				}());
				const management = disposables.add(instantiationService.createInstance(SessionsManagementService));
				management.createQuickChat({ providerId: provider.id, sessionTypeId: 'claude' });
				management.discardNewSession();

				const previousSession = previousHarness ? upcastPartial<ISession>({ providerId: provider.id, sessionType: previousHarness }) : undefined;
				const target = getWorkspaceOptOutTarget.call({ sessionsManagementService: management }, local, previousSession);
				management.createQuickChat(target);
				assert.deepStrictEqual({ target, requestedType }, {
					target: { providerId: LOCAL_AGENT_HOST_PROVIDER_ID }, requestedType: 'claude',
				});
			});
		}

		test('switching environments uses the matching checkout rather than the source device path', async () => {
			const { harness, calls, select } = createHarness(true);
			const remote: ISessionCreationEnvironment = { id: 'remote', kind: 'remote', label: 'Remote', icon: Codicon.remote, providerIds: ['remote'] };
			const remoteFolder = URI.parse('vscode-agent-host://remote/project');
			harness._workspacePicker.getEnvironmentWorkspace = () => ({
				providerId: 'remote',
				workspace: upcastPartial<ISessionWorkspace>({ folders: [{ root: remoteFolder, workingDirectory: remoteFolder, name: 'project', description: undefined }] }),
			});
			let selectedUri: URI | undefined;
			harness._workspacePicker.setSelectedWorkspace = uri => { selectedUri = uri; };
			await select(remote);
			assert.deepStrictEqual({ selectedUri, calls }, {
				selectedUri: remoteFolder,
				calls: ['saveDraft', 'cancelUpgrade', 'cancelCreation', 'cancelRestore', 'userSelection', 'createDraft', 'Environment: Remote'],
			});
		});

		test('restoring a Cloud draft preserves its explicitly restored environment for a local folder', () => {
			const picked = observableValue<ISessionCreationEnvironment | undefined>('environment', undefined);
			const widget = Object.assign(Object.create(NewChatWidget.prototype), {
				_environment: constObservable(local),
				_environments: constObservable([local, cloud]),
				_pickedEnvironment: picked,
				sessionsProvidersService: { getProvider: () => undefined },
				_workspacePicker: { setSelectedWorkspace: () => { } },
			});
			syncWorkspacePickerDevContainerMode.call(widget, upcastPartial<ITestSessionWithChat>({
				providerId: 'cloud',
				workspace: constObservable(upcastPartial<ISessionWorkspace>({
					folders: [{ root: folder, workingDirectory: folder, name: 'project', description: undefined }],
				})),
			}), true, WorkspaceSelectionOrigin.RestoredDraft);
			assert.strictEqual(picked.get()?.id, cloud.id);
		});

		test('restores a hidden remote Dev Container draft without choosing This Computer or unhiding the host', () => {
			const folder = URI.parse('vscode-agent-host://ssh__host/project');
			const workspace = upcastPartial<ISessionWorkspace>({ folders: [{ root: folder, workingDirectory: folder, name: 'project', description: undefined }] });
			const provider = upcastPartial<IAgentHostSessionsProvider>({
				id: 'agenthost-hidden', label: 'Hidden host', icon: Codicon.remote, environment: { id: 'remote', label: 'Remote' },
				isVisibleInEnvironmentPicker: constObservable(false), isAvailableInEnvironmentPicker: constObservable(true),
				connectionStatus: constObservable(RemoteAgentHostConnectionStatus.connected),
				isDevContainerEnabled: () => true, resolveWorkspace: () => workspace,
			});
			const picked = observableValue<ISessionCreationEnvironment | undefined>('picked', undefined);
			const selections: { providerId: string | undefined; preferDevContainer: boolean | undefined }[] = [];
			const session = upcastPartial<ITestSessionWithChat>({ providerId: provider.id, sessionId: 'draft', workspace: constObservable(workspace) });
			const widget = Object.assign(Object.create(NewChatWidget.prototype), {
				_environment: derived(reader => picked.read(reader) ?? local),
				_environments: constObservable([local]),
				_pickedEnvironment: picked,
				sessionsProvidersService: { getProvider: () => provider, getProviders: () => [provider] },
				sessionsManagementService: { isQuickChatTargetAvailable: () => false },
				_workspacePicker: {
					selectedFolderUri: folder, getDevContainerWorkspaceAvailability: () => true,
					setSelectedWorkspace: (_folder: URI, options: { providerId?: string; preferDevContainer?: boolean }) => selections.push({ providerId: options.providerId, preferDevContainer: options.preferDevContainer }),
				},
			});
			syncWorkspacePickerDevContainerMode.call(widget, session, true, WorkspaceSelectionOrigin.RestoredDraft);
			const environment = picked.get()!;
			assert.deepStrictEqual({
				environment: { id: environment.id, kind: environment.kind, providerIds: environment.providerIds },
				canSend: derived(reader => canSendRequestToWorkspace.call(widget, session, environment, reader)).get(),
				selection: selections.map(({ providerId, preferDevContainer }) => ({ providerId, preferDevContainer })),
				picker: getSessionCreationEnvironments([provider]), hidden: provider.isVisibleInEnvironmentPicker?.get() === false,
			}, {
				environment: { id: `container:${provider.id}`, kind: 'container', providerIds: [provider.id] }, canSend: true,
				selection: [{ providerId: provider.id, preferDevContainer: true }], picker: [], hidden: true,
			});
		});

		for (const initial of [undefined, local, cloud, container]) {
			test(`reconciles a provider-targeted workspace before harness selection with ${initial?.id ?? 'a restored local draft'}`, async () => {
				const remote: ISessionCreationEnvironment = { id: 'agenthost-remote', kind: 'remote', label: 'Remote', icon: Codicon.remote, providerIds: ['agenthost-remote'] };
				const picked = observableValue<ISessionCreationEnvironment | undefined>('pickedEnvironment', initial);
				const environment = derived(reader => picked.read(reader) ?? local);
				const remoteFolder = URI.parse('vscode-remote://ssh-remote+host/project');
				const requests: IOpenNewSessionOptions[] = [];
				let creation: Promise<IOpenNewSessionResult> | undefined;
				const harness = {
					_environment: environment,
					_environments: constObservable([local, cloud, remote]),
					_pickedEnvironment: picked,
					_session: constObservable({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID }),
					uriIdentityService: { extUri },
					sessionsManagementService: {
						getSessionTypesForFolder: () => [{ providerId: remote.providerIds[0], sessionType: { id: 'copilot' } }],
					},
					agentHostFilterService: { selectedHost: { sessionCreationProviderId: remote.providerIds[0] } },
					_isPreferredServable: (folderUri: URI, pick: IPreferredSessionType): boolean => isPreferredServable.call(harness, folderUri, pick),
					_requestsDevContainer: () => false,
					_newChatInput: {
						sessionTypePicker: {
							getPreferredSessionType: () => ({ providerId: environment.get().providerIds[0], sessionTypeId: 'copilot' }),
						},
					},
					sessionsService: {
						openNewSession: async (options: IOpenNewSessionOptions) => {
							requests.push(options);
							return { session: undefined, trustDeclined: false };
						},
					},
					logService: { trace: () => { }, error: () => assert.fail('unexpected creation error') },
					_workspacePicker: {
						selectedResolved: { providerId: LOCAL_AGENT_HOST_PROVIDER_ID },
						selectionSnapshot: { state: 'selected', folderUri: remoteFolder },
						setSelectedWorkspace: () => {
							creation = createSessionNow.call(harness, remoteFolder, { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'copilot' }, CancellationToken.None);
						},
					},
				};
				const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), harness);
				const result = widget.selectWorkspace(remoteFolder, { providerId: remote.providerIds[0] });
				await creation;
				assert.deepStrictEqual({ result, environment: picked.get()?.id, requests }, {
					result: 'applied', environment: remote.id,
					requests: [{ folderUri: remoteFolder, preserveNavigation: true, providerId: remote.providerIds[0], sessionTypeId: 'copilot' }],
				});
			});
		}

		test('reconciles a container draft handoff before creation and applies its input only afterwards', async () => {
			const picked = observableValue<ISessionCreationEnvironment | undefined>('pickedEnvironment', cloud);
			const calls: string[] = [];
			const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
				_store: disposables.add(new DisposableStore()),
				_environment: derived(reader => picked.read(reader)),
				_environments: constObservable([local, cloud]),
				_pickedEnvironment: picked,
				_feedbackItems: constObservable([]),
				_newChatInput: {
					isInputReady: true, hasInput: false, onDidChangeInput: Event.None,
					sessionTypePicker: { getUserPickedSessionType: () => undefined },
					applyDraft: (draft: IChatDraft) => { calls.push(`input:${draft.inputText}`); return true; },
				},
				_createNewSession: async () => {
					calls.push(`create:${picked.get()?.id}`);
					return { session: upcastPartial<ITestSessionWithChat>({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID }), trustDeclined: false };
				},
				_workspacePicker: { setSelectedWorkspace: () => calls.push('workspace') },
			});
			const result = await widget.applyDraft(serializeChatDraft({ inputText: 'Keep this prompt', attachments: [] }), folder, {
				providerId: LOCAL_AGENT_HOST_PROVIDER_ID, preferDevContainer: true,
			}, CancellationToken.None);
			assert.deepStrictEqual({ result, environment: picked.get()?.id, calls }, {
				result: 'applied', environment: container.id, calls: ['create:container:local', 'workspace', 'input:Keep this prompt'],
			});
		});
	});

	test('applies the session options experiment only before the first created session', () => {
		const restore = (storageService: IStorageService, telemetryService: ITelemetryService, initial: boolean, expandedByDefault: boolean | undefined) => {
			const expanded = observableValue('sessionOptionsExpanded', initial);
			const harness: ISessionOptionsPersistenceHarness = {
				storageService,
				_usage: new AgentsWindowUsage(storageService),
				configurationService: {
					getValue: <T>(key: string) => ({
						[NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING]: expandedByDefault,
					})[key] as T,
				},
				telemetryService,
				_sessionOptionsExpanded: expanded,
			};
			restoreSessionOptionsExpanded.call(harness);
			return { expanded, harness };
		};

		const firstTimeStorage = disposables.add(new InMemoryStorageService());
		const firstTimeTelemetry = new TestExperimentTriggerTelemetryService();
		const first = restore(firstTimeStorage, firstTimeTelemetry, true, false);
		const configuredDefault = first.expanded.get();
		const defaultBeforeInteraction = restore(firstTimeStorage, firstTimeTelemetry, true, false).expanded.get();
		setSessionOptionsExpandedFromUser.call(first.harness, true);
		const restoredUserChoice = restore(firstTimeStorage, firstTimeTelemetry, false, false).expanded.get();

		const returningStorage = disposables.add(new InMemoryStorageService());
		returningStorage.store(TOTAL_SESSIONS_KEY, 1, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const returningTelemetry = new TestExperimentTriggerTelemetryService();
		const returningDefault = restore(returningStorage, returningTelemetry, false, false).expanded.get();

		const fallbackStorage = disposables.add(new InMemoryStorageService());
		const fallbackTelemetry = new TestExperimentTriggerTelemetryService();
		const fallbackDefault = restore(fallbackStorage, fallbackTelemetry, false, undefined).expanded.get();

		assert.deepStrictEqual({
			configuredDefault,
			defaultBeforeInteraction,
			restoredUserChoice,
			returningDefault,
			fallbackDefault,
			firstTimeTriggers: firstTimeTelemetry.triggers,
			returningTriggers: returningTelemetry.triggers,
			fallbackTriggers: fallbackTelemetry.triggers,
		}, {
			configuredDefault: false,
			defaultBeforeInteraction: false,
			restoredUserChoice: true,
			returningDefault: true,
			fallbackDefault: true,
			firstTimeTriggers: [`config.${NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING}`],
			returningTriggers: [],
			fallbackTriggers: [`config.${NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING}`],
		});
	});

	test('workspace opt-out triggers in both experiment arms only for an eligible workspace and updates live', () => {
		const results = [];
		for (const enabled of [false, true]) {
			const container = append(mainWindow.document.body, $('div'));
			disposables.add(toDisposable(() => container.remove()));
			const selectionChanged = disposables.add(new Emitter<void>());
			const target = observableValue<IPreferredSessionType | undefined>('target', undefined);
			let selectedFolderUri: URI | undefined;
			let clearable: IObservable<boolean> | undefined;
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const harness: IRenderWorkspacePickerHarness = {
				_environment: observableValue('environment', undefined),
				_environmentPicker: { isVisible: constObservable(false), render: () => assert.fail('No environment picker expected') },
				agentHostFilterService: { selectedHost: { sessionCreationProviderId: 'creation' } },
				_workspacePicker: {
					get selectedFolderUri() { return selectedFolderUri; },
					onDidChangeSelection: selectionChanged.event,
					renderCategoryTriggers: (parent, triggers) => {
						clearable = triggers[0].clearable;
						return append(parent, $('div'));
					},
				},
				_newChatInput: {
					pickerVisibility: disposables.add(new SessionInputPickerVisibility()),
					placeRepositoryControls: () => { },
					sessionTypePicker: { render: () => { } },
				},
				_renderSessionTypePicker: () => { },
				_renderPlaceRow: () => toDisposable(() => { }),
				_workspacePickerRow: undefined,
				_workspaceSessionOptionsHost: undefined,
				_sessionOptionsExpanded: observableValue('expanded', true),
				_setSessionOptionsExpandedFromUser: () => { },
				_workspaceOptOutTarget: target,
				_workspaceOptOutEnabled: observableValue('optOut', enabled),
				_screenReaderOptimized: observableValue('screenReader', false),
				_collapsedSessionOptionsShowIcons: observableValue('icons', false),
				_iconOnlyPickers: noIconOnlyPickers,
				_onDidChangeChatPetPlatform: disposables.add(new Emitter<void>()),
				telemetryService,
			};
			disposables.add(renderWorkspacePicker.call(harness, container));
			const snapshot = () => ({ clearable: clearable?.get(), triggers: [...telemetryService.triggers] });
			const states = [snapshot()];
			selectedFolderUri = URI.file('/workspace');
			selectionChanged.fire();
			states.push(snapshot());
			target.set({ providerId: 'local', sessionTypeId: 'copilot' }, undefined);
			states.push(snapshot());
			harness._workspaceOptOutEnabled.set(!enabled, undefined);
			selectionChanged.fire();
			states.push(snapshot());
			selectedFolderUri = undefined;
			selectionChanged.fire();
			states.push(snapshot());
			results.push(states);
		}
		const trigger = `config.${WORKSPACE_OPT_OUT_SETTING}`;
		assert.deepStrictEqual(results, [false, true].map(enabled => [
			{ clearable: false, triggers: [] },
			{ clearable: false, triggers: [] },
			{ clearable: enabled, triggers: [trigger] },
			{ clearable: !enabled, triggers: [trigger] },
			{ clearable: false, triggers: [trigger] },
		]));
	});

	test('workspace remains visible while repository and harness controls expand without being recreated', () => {
		const setupManagedHover = sinon.spy(getBaseLayerHoverDelegate(), 'setupManagedHover');
		disposables.add(toDisposable(() => setupManagedHover.restore()));
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const harnessLabels = ['Copilot', 'Claude'];
		const workspaceTriggers: { readonly tooltip: string | undefined; readonly icon: string | undefined; readonly attachesContext: boolean | undefined }[] = [];
		const pickerVisibility = disposables.add(new SessionInputPickerVisibility());
		const workspaceVisibility: boolean[] = [];
		const telemetryService = new TestExperimentTriggerTelemetryService();
		let environmentRenderCount = 0;
		const harness: IRenderWorkspacePickerHarness = {
			_environment: observableValue<ISessionCreationEnvironment | undefined>('environment', undefined),
			_environmentPicker: {
				isVisible: constObservable(true),
				render: target => {
					environmentRenderCount++;
					const element = document.createElement('div');
					const trigger = document.createElement('a');
					trigger.role = 'button';
					trigger.tabIndex = 0;
					trigger.textContent = 'Environment';
					element.appendChild(trigger);
					target.prepend(element);
					return { element, dispose: () => element.remove() };
				},
			},
			agentHostFilterService: { selectedHost: { sessionCreationProviderId: 'creation' } },
			_workspacePicker: {
				selectedFolderUri: undefined,
				onDidChangeSelection: Event.None,
				renderCategoryTriggers: (target, triggers) => {
					workspaceVisibility.push(pickerVisibility.visibility.get().workspace);
					const row = document.createElement('div');
					target.appendChild(row);
					for (const trigger of triggers) {
						const item = document.createElement('a');
						item.role = 'button';
						item.tabIndex = 0;
						item.textContent = trigger.label ?? 'More';
						row.appendChild(item);
						workspaceTriggers.push({ tooltip: trigger.tooltip, icon: trigger.icon?.id, attachesContext: trigger.attachesContext });
					}
					return row;
				},
			},
			_newChatInput: {
				pickerVisibility,
				pickerHoverDelegate: getDefaultHoverDelegate('element'),
				placeRepositoryControls: target => {
					if (target) {
						for (const label of ['Worktree', 'Branch']) {
							const item = document.createElement('a');
							item.role = 'button';
							item.tabIndex = label === 'Branch' ? -1 : 0;
							item.textContent = label;
							target.appendChild(item);
						}
					}
				},
				sessionTypePicker: {
					render: (target, options) => {
						if (harnessLabels.length <= 1) {
							return;
						}
						const item = document.createElement('a');
						item.role = 'button';
						item.tabIndex = 0;
						item.className = options?.className ?? '';
						item.textContent = harnessLabels[0];
						target.appendChild(item);
					},
				},
			},
			_renderSessionTypePicker: (target, isQuickChat) => renderSessionTypePicker.call(harness, target, isQuickChat),
			_renderPlaceRow: (target, chipRow) => {
				const placeRow = document.createElement('div');
				placeRow.className = 'sessions-new-session-place-row';
				placeRow.textContent = 'Cloud';
				target.insertBefore(placeRow, chipRow);
				return toDisposable(() => placeRow.remove());
			},
			_workspacePickerRow: undefined,
			_workspaceSessionOptionsHost: undefined,
			_sessionOptionsExpanded: observableValue('sessionOptionsExpanded', false),
			_setSessionOptionsExpandedFromUser: expanded => harness._sessionOptionsExpanded.set(expanded, undefined),
			_workspaceOptOutTarget: constObservable(undefined),
			_workspaceOptOutEnabled: observableValue('workspaceOptOutEnabled', false),
			_screenReaderOptimized: observableValue('screenReaderOptimized', false),
			// Keep this test focused on the fully-hidden collapse; the icon rail has its own test.
			_collapsedSessionOptionsShowIcons: observableValue('collapsedSessionOptionsShowIcons', false),
			_iconOnlyPickers: noIconOnlyPickers,
			_onDidChangeChatPetPlatform: disposables.add(new Emitter<void>()),
			telemetryService,
		};

		disposables.add(renderWorkspacePicker.call(harness, container));
		workspaceVisibility.push(pickerVisibility.visibility.get().workspace);
		const details = harness._workspaceSessionOptionsHost!;
		const toggle = container.querySelector<HTMLElement>('.new-chat-session-options-toggle')!;
		assert.strictEqual(setupManagedHover.getCalls().find(call => call.args[1] === toggle)?.args[0], harness._newChatInput.pickerHoverDelegate);
		const snapshot = () => ({
			hidden: details.hidden,
			inert: details.inert,
			expanded: toggle.getAttribute('aria-expanded'),
			label: toggle.getAttribute('aria-label'),
			chevron: toggle.classList.contains('codicon-chevron-right-compact') ? 'right' : toggle.classList.contains('codicon-chevron-left-compact') ? 'left' : undefined,
		});
		const collapsed = snapshot();
		toggle.click();
		const expanded = snapshot();
		toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		const collapsedAgain = snapshot();

		assert.deepStrictEqual({
			placeRow: container.firstElementChild?.className,
			workspace: harness._workspacePickerRow?.firstElementChild?.textContent,
			items: Array.from(details.children, element => ({
				label: element.textContent,
				className: element.className,
			})),
			workspaceTriggers,
			workspaceVisibility,
			collapsed,
			expanded,
			collapsedAgain,
			controlsTarget: toggle.getAttribute('aria-controls') === details.id,
			sameDetails: details === harness._workspaceSessionOptionsHost,
		}, {
			placeRow: 'sessions-new-session-place-row',
			workspace: isWeb ? 'Select Repository' : 'Workspace',
			items: [
				{ label: 'WorktreeBranch', className: 'new-chat-repository-controls-host' },
				{ label: 'Copilot', className: 'sessions-chat-session-type-picker sessions-workspace-category-picker-slot' },
			],
			workspaceTriggers: [{ tooltip: 'Project for the agent to work on', icon: isWeb ? 'repo' : 'project', attachesContext: false }],
			workspaceVisibility: [false, true],
			collapsed: { hidden: true, inert: true, expanded: 'false', label: 'Show Session Options', chevron: 'right' },
			expanded: { hidden: false, inert: false, expanded: 'true', label: 'Hide Session Options', chevron: 'left' },
			collapsedAgain: { hidden: true, inert: true, expanded: 'false', label: 'Show Session Options', chevron: 'right' },
			controlsTarget: true,
			sameDetails: true,
		});

		const workspace = container.querySelector<HTMLElement>('[role="button"]')!;
		const focused: (string | null | undefined)[] = [];
		const press = (key: string, shiftKey = false) => {
			const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
			document.activeElement?.dispatchEvent(event);
			focused.push(document.activeElement?.textContent || document.activeElement?.getAttribute('aria-label'));
			return event.defaultPrevented;
		};
		workspace.focus();
		press('Tab');
		toggle.click();
		workspace.focus();
		for (let i = 0; i < 4; i++) {
			press('Tab');
		}
		const exitsTray = !press('Tab');
		press('Tab', true);
		press('ArrowLeft');
		press('ArrowRight');
		assert.deepStrictEqual({ focused, exitsTray }, {
			focused: ['Show Session Options', 'Worktree', 'Branch', 'Copilot', 'Hide Session Options', 'Hide Session Options', 'Copilot', 'Branch', 'Copilot'],
			exitsTray: true,
		});

		const harnessTrigger = details.querySelector<HTMLElement>('.sessions-chat-session-type-picker[role="button"]')!;
		const branchTrigger = Array.from(details.querySelectorAll<HTMLElement>('[role="button"]')).find(element => element.textContent === 'Branch')!;
		harnessTrigger.setAttribute('aria-disabled', 'true');
		harnessTrigger.tabIndex = -1;
		harnessTrigger.classList.add('disabled');
		focused.length = 0;
		branchTrigger.focus();
		press('ArrowRight');
		press('ArrowRight');
		press('ArrowLeft');
		branchTrigger.focus();
		press('Tab');
		press('Tab', true);
		assert.deepStrictEqual(focused, ['Copilot', 'Hide Session Options', 'Copilot', 'Hide Session Options', 'Branch']);
		harnessTrigger.removeAttribute('aria-disabled');
		harnessTrigger.tabIndex = 0;
		harnessTrigger.classList.remove('disabled');

		// While a screen reader is active the options never collapse: the toggle is removed and the
		// details stay in the accessibility tree even though the persisted preference is collapsed.
		harness._sessionOptionsExpanded.set(false, undefined);
		harness._screenReaderOptimized.set(true, undefined);
		assert.deepStrictEqual({
			toggleHidden: toggle.hidden,
			hidden: details.hidden,
			inert: details.inert,
			storedPreference: harness._sessionOptionsExpanded.get(),
		}, {
			toggleHidden: true,
			hidden: false,
			inert: false,
			storedPreference: false,
		});

		// The icon rail keeps the collapsed options interactive with the disclosure toggle still
		// available; a class hides only their labels while the pickers stay in the tree.
		harness._screenReaderOptimized.set(false, undefined);
		harness._collapsedSessionOptionsShowIcons.set(true, undefined);
		harness._sessionOptionsExpanded.set(false, undefined);
		assert.deepStrictEqual({
			toggleHidden: toggle.hidden,
			hidden: details.hidden,
			inert: details.inert,
			iconRailClass: details.classList.contains('collapsed-icon-rail'),
			expanded: toggle.getAttribute('aria-expanded'),
		}, {
			toggleHidden: false,
			hidden: false,
			inert: false,
			iconRailClass: true,
			expanded: 'false',
		});

		// Reaching the collapsed state logs the icons experiment trigger exactly once, regardless
		// of the assigned icons value, so the scorecard only counts users who actually collapse.
		assert.deepStrictEqual(telemetryService.triggers, [`config.${COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING}`]);

		harness._collapsedSessionOptionsShowIcons.set(false, undefined);
		const gated = container.textContent?.includes('Environment') ?? false;
		harness._environment.set({ id: 'local', kind: 'local', label: 'This Computer', icon: Codicon.deviceDesktop, providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID] }, undefined);
		const environment = harness._workspacePickerRow!.firstElementChild!;
		const environmentTrigger = environment.querySelector<HTMLElement>('[role="button"]')!;
		const collapsedEnvironment = { outsideOptions: !details.contains(environment), visible: environmentTrigger.checkVisibility() };
		environmentTrigger.focus();
		press('Tab');
		const nextControl = document.activeElement?.textContent;
		press('ArrowLeft');
		const previousControl = document.activeElement === environmentTrigger;
		harness._sessionOptionsExpanded.set(true, undefined);
		const expandedEnvironment = { first: harness._workspacePickerRow?.firstElementChild === environment, focused: document.activeElement === environmentTrigger };
		harness._sessionOptionsExpanded.set(false, undefined);
		const focusedAfterCollapse = document.activeElement === environmentTrigger;
		harness._environment.set(undefined, undefined);
		assert.deepStrictEqual({
			gated, collapsedEnvironment, nextControl, previousControl, expandedEnvironment, focusedAfterCollapse, environmentRenderCount, removed: !container.contains(environment),
		}, {
			gated: false,
			collapsedEnvironment: { outsideOptions: true, visible: true },
			nextControl: isWeb ? 'Select Repository' : 'Workspace',
			previousControl: true,
			expandedEnvironment: { first: true, focused: true },
			focusedAfterCollapse: true,
			environmentRenderCount: 1,
			removed: true,
		});
	});

	test('harness focus command expands session options before opening the picker', () => {
		const expanded = observableValue('sessionOptionsExpanded', false);
		let expandedWhenOpened = false;
		const harness = {
			_sessionOptionsExpanded: expanded,
			_newChatInput: { sessionTypePicker: { showPicker: () => expandedWhenOpened = expanded.get() } },
		};
		const focusHarnessPicker = NewChatWidget.prototype.focusHarnessPicker as (this: typeof harness) => void;
		focusHarnessPicker.call(harness);
		assert.strictEqual(expandedWhenOpened, true);
	});

	test('restores workspace, harness, context DOM and tab order after quick chat', () => {
		const workspaceRow = document.createElement('div');
		const quickChatHeader = document.createElement('div');
		for (const label of ['Workspace', 'Issue/PR']) {
			const item = document.createElement('a');
			item.tabIndex = 0;
			item.textContent = label;
			workspaceRow.appendChild(item);
		}
		let renderedPicker: HTMLElement | undefined;
		const harness: IRenderSessionTypePickerHarness = {
			_newChatInput: {
				sessionTypePicker: {
					render: (target, options) => {
						renderedPicker?.remove();
						const item = document.createElement('a');
						item.tabIndex = 0;
						item.className = options?.className ?? '';
						item.textContent = 'Copilot';
						target.appendChild(item);
						renderedPicker = item;
					},
				},
			},
		};

		const isQuickChat = observableValue('isQuickChat', false);
		disposables.add(autorun(reader => {
			const value = isQuickChat.read(reader);
			renderSessionTypePicker.call(harness, value ? quickChatHeader : workspaceRow, value);
		}));
		isQuickChat.set(true, undefined);
		isQuickChat.set(false, undefined);

		assert.deepStrictEqual({
			domOrder: Array.from(workspaceRow.children, element => element.textContent),
			tabOrder: Array.from(workspaceRow.querySelectorAll<HTMLElement>('[tabindex="0"]'), element => element.textContent),
			quickChatHeader: Array.from(quickChatHeader.children, element => element.textContent),
		}, {
			domOrder: ['Workspace', 'Copilot', 'Issue/PR'],
			tabOrder: ['Workspace', 'Copilot', 'Issue/PR'],
			quickChatHeader: [],
		});
	});

	test('selecting No workspace cancels pending workspace creation', () => {
		let pendingUpgradeDisposed = false;
		let sessionCreationDisposed = false;
		let quickChatOpenCount = 0;
		let quickChatOptions: ICreateNewSessionOptions | undefined;
		let noWorkspaceSelectCount = 0;
		const pendingPreferredUpgrade = disposables.add(new MutableDisposable<IDisposable>());
		const newSessionCreation = disposables.add(new MutableDisposable<IDisposable>());
		pendingPreferredUpgrade.value = toDisposable(() => pendingUpgradeDisposed = true);
		newSessionCreation.value = toDisposable(() => sessionCreationDisposed = true);

		const harness: ISelectNoWorkspaceHarness = {
			_environment: constObservable(undefined),
			_workspaceOptOutTarget: constObservable(undefined),
			_pendingPreferredUpgrade: pendingPreferredUpgrade,
			_newSessionCreation: newSessionCreation,
			_workspacePicker: { selectNoWorkspace: () => noWorkspaceSelectCount++ },
			sessionsService: {
				openQuickChat: options => {
					quickChatOpenCount++;
					quickChatOptions = options;
					return { sessionId: 'quick-chat' };
				},
			},
			_openQuickChat: (options, preserveNavigation) => openQuickChat.call(harness, options, preserveNavigation),
			_createQuickChat: createQuickChat,
			logService: { trace: () => { }, error: () => assert.fail('Unexpected quick-chat preparation error') },
		};
		selectNoWorkspace.call(harness, { providerId: 'agenthost-remote-test' });

		assert.deepStrictEqual({
			pendingUpgradeDisposed,
			sessionCreationDisposed,
			noWorkspaceSelectCount,
			quickChatOpenCount,
			quickChatOptions,
		}, {
			pendingUpgradeDisposed: true,
			sessionCreationDisposed: true,
			noWorkspaceSelectCount: 1,
			quickChatOpenCount: 1,
			quickChatOptions: { providerId: 'agenthost-remote-test' },
		});
	});

	test('programmatic No workspace selection preserves navigation', () => {
		const userSelections: boolean[] = [];
		const preserveNavigation: (boolean | undefined)[] = [];
		const harness: ISelectNoWorkspaceHarness = {
			_environment: constObservable(undefined),
			_workspaceOptOutTarget: constObservable(undefined),
			_pendingPreferredUpgrade: disposables.add(new MutableDisposable()),
			_newSessionCreation: disposables.add(new MutableDisposable()),
			_workspacePicker: { selectNoWorkspace: userSelection => userSelections.push(userSelection ?? true) },
			sessionsService: {
				openQuickChat: (_options, preserve) => {
					preserveNavigation.push(preserve);
					return { sessionId: 'quick-chat' };
				},
			},
			_openQuickChat: (options, preserve) => openQuickChat.call(harness, options, preserve),
			_createQuickChat: createQuickChat,
			logService: { trace: () => { }, error: () => assert.fail('Unexpected quick-chat preparation error') },
		};

		selectNoWorkspace.call(harness, undefined, { userSelection: false, preserveNavigation: true });

		assert.deepStrictEqual({ userSelections, preserveNavigation }, {
			userSelections: [false],
			preserveNavigation: [true],
		});
	});

	for (const kind of ['cloud', 'container'] as const) {
		for (const preserveCustomView of [false, true]) {
			test(`explicit No workspace can leave ${kind} without a compatible target (custom view: ${preserveCustomView})`, () => {
				const draft = upcastPartial<ITestSessionWithChat>({ sessionId: 'quick', providerId: 'fallback' });
				const prepared: (ICreateNewSessionOptions | undefined)[] = [];
				const opened: (ICreateNewSessionOptions | undefined)[] = [];
				const reconciled: string[] = [];
				const harness: ISelectNoWorkspaceHarness = {
					_detached: preserveCustomView,
					_session: constObservable(draft),
					_environment: constObservable<ISessionCreationEnvironment>({ id: kind, kind, label: kind, icon: Codicon.remote, providerIds: ['original'] }),
					_workspaceOptOutTarget: constObservable(undefined),
					_pendingPreferredUpgrade: disposables.add(new MutableDisposable()),
					_newSessionCreation: disposables.add(new MutableDisposable()),
					_workspacePicker: { selectNoWorkspace: () => { } },
					_draftSlot: {
						createQuickChat: options => {
							prepared.push(options);
							return draft;
						},
					},
					sessionsService: {
						openQuickChat: options => {
							opened.push(options);
							return draft;
						},
					},
					_openQuickChat: openQuickChat,
					_createQuickChat: createQuickChat,
					_reconcileWorkspaceEnvironment: options => reconciled.push(options.providerId),
					logService: { trace: () => { }, error: () => assert.fail('Unexpected quick-chat preparation error') },
				};
				selectNoWorkspace.call(harness);
				assert.deepStrictEqual({ prepared, opened, reconciled }, {
					prepared: preserveCustomView ? [undefined] : [],
					opened: preserveCustomView ? [] : [undefined],
					reconciled: ['fallback'],
				});
			});
		}
	}

	suite('workspace-less fallback', () => {
		function createRestoreHarness(environmentPickerEnabled = false) {
			const activeSession = observableValue<ITestSessionWithChat | undefined>('activeSession', undefined);
			const initialRestoreComplete = observableValue('initialRestoreComplete', true);
			const opened: string[] = [];
			const openedTargets: (ICreateNewSessionOptions | undefined)[] = [];
			const noWorkspaceSelections: (ISelectNoWorkspaceOptions | undefined)[] = [];
			let quickChatAvailable = true;
			let noWorkspaceSelected = false;
			let selectedFolderUri: URI | undefined;
			let workspaceRestored = Promise.resolve(true);
			const open = (kind: string, options?: ICreateNewSessionOptions): ITestSessionWithChat => {
				opened.push(kind);
				openedTargets.push(options);
				const session = upcastPartial<ITestSessionWithChat>({ sessionId: `quick-chat-${opened.length}`, providerId: options?.providerId ?? 'cloud' });
				activeSession.set(session, undefined);
				return session;
			};
			const harness: IRestoreNoWorkspaceDraftHarness = {
				configurationService: new TestConfigurationService({ [ENVIRONMENT_PICKER_SETTING]: environmentPickerEnabled }),
				_workspaceSelectionCleared: false,
				_environment: constObservable(undefined),
				_pickedEnvironment: constObservable(undefined),
				_workspaceOptOutTarget: constObservable(undefined),
				_noWorkspaceRestore: disposables.add(new MutableDisposable<IDisposable>()),
				_newSessionCreation: disposables.add(new MutableDisposable<IDisposable>()),
				_createdSessionId: undefined,
				_workspacePicker: {
					isNoWorkspaceSelected: () => noWorkspaceSelected,
					get selectedFolderUri() { return selectedFolderUri; },
					whenWorkspaceRestored: token => raceCancellationError(workspaceRestored, token),
				},
				_paneSession: activeSession,
				sessionsService: {
					activeSession,
					initialRestoreComplete,
					openQuickChat: (options, preserveNavigation) => open(preserveNavigation ? 'automatic' : 'explicit', options),
				},
				sessionsManagementService: { isQuickChatTargetAvailable: () => quickChatAvailable },
				selectNoWorkspace: (options, selectionOptions) => {
					noWorkspaceSelections.push(selectionOptions);
					open('checked', options);
				},
			};
			return {
				harness, activeSession, initialRestoreComplete, opened, openedTargets, noWorkspaceSelections,
				set quickChatAvailable(value: boolean) { quickChatAvailable = value; },
				set noWorkspaceSelected(value: boolean) { noWorkspaceSelected = value; },
				set selectedFolderUri(value: URI | undefined) { selectedFolderUri = value; },
				set workspaceRestored(value: Promise<boolean>) { workspaceRestored = value; },
				restore: () => restoreNoWorkspaceDraft.call(harness),
			};
		}

		for (const previouslySelected of [false, true]) {
			test(`waits for This Computer when Cloud registers first (previously selected Chat: ${previouslySelected})`, async () => {
				if (isWeb) {
					return;
				}
				const state = createRestoreHarness(true);
				state.noWorkspaceSelected = previouslySelected;
				const local: ISessionCreationEnvironment = { id: 'local', kind: 'local', label: 'This Computer', icon: Codicon.deviceDesktop, providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID] };
				const cloud: ISessionCreationEnvironment = { id: 'cloud', kind: 'cloud', label: 'Cloud', icon: Codicon.cloud, providerIds: ['cloud'] };
				const environments = observableValue('environments', [cloud]);
				const environment = derived(reader => getDefaultSessionCreationEnvironment(environments.read(reader), undefined, state.activeSession.read(reader)?.providerId));
				Object.assign(state.harness, {
					_environment: environment,
					_workspaceOptOutTarget: derived(reader => {
						const selected = environment.read(reader);
						return selected ? { providerId: selected.providerIds[0] } : undefined;
					}),
				});

				await state.restore();
				const afterCloud = [...state.openedTargets];
				environments.set([cloud, local], undefined);
				await state.restore();

				assert.deepStrictEqual({ afterCloud, afterLocal: state.openedTargets, environment: environment.get()?.id }, {
					afterCloud: [],
					afterLocal: [{ providerId: LOCAL_AGENT_HOST_PROVIDER_ID }],
					environment: 'local',
				});
			});
		}

		test('restores an explicitly selected Cloud quick chat without waiting for This Computer', async () => {
			const state = createRestoreHarness(true);
			state.noWorkspaceSelected = true;
			const cloud: ISessionCreationEnvironment = { id: 'cloud', kind: 'cloud', label: 'Cloud', icon: Codicon.cloud, providerIds: ['cloud'] };
			Object.assign(state.harness, {
				_environment: constObservable(cloud),
				_pickedEnvironment: constObservable(cloud),
				_workspaceOptOutTarget: constObservable({ providerId: 'cloud' }),
			});

			await state.restore();

			assert.deepStrictEqual(state.openedTargets, [{ providerId: 'cloud' }]);
		});

		test('does not select Chat after explicitly clearing the workspace, including later provider changes', async () => {
			const state = createRestoreHarness();
			state.harness._workspaceSelectionCleared = true;
			state.quickChatAvailable = false;
			await state.restore();
			state.quickChatAvailable = true;
			await state.restore();
			assert.deepStrictEqual(state.opened, []);
		});

		test('allows explicit Chat selection after clearing the workspace', async () => {
			const state = createRestoreHarness();
			state.harness._workspaceSelectionCleared = true;
			state.noWorkspaceSelected = true;
			await state.restore();
			assert.deepStrictEqual(state.opened, ['checked']);
		});

		test('restores a previous Chat selection without reporting a user choice or navigation', async () => {
			// Either would cancel the workspace of a window-open handoff that is still resolving.
			const state = createRestoreHarness();
			state.noWorkspaceSelected = true;
			await state.restore();
			assert.deepStrictEqual({ opened: state.opened, selections: state.noWorkspaceSelections }, {
				opened: ['checked'],
				selections: [{ userSelection: false, preserveNavigation: true }],
			});
		});

		test('cancels pending discovery on workspace clear and ignores subsequent automatic restores', async () => {
			const state = createRestoreHarness();
			const discovery = new DeferredPromise<boolean>();
			state.workspaceRestored = discovery.p;
			const restoring = state.restore();
			await timeout(0);

			state.harness._workspaceSelectionCleared = true;
			state.harness._noWorkspaceRestore.clear();
			await restoring;
			await discovery.complete(true);
			await state.restore();

			assert.deepStrictEqual(state.opened, []);
		});

		test('selects Chat without a previous Chat selection and without persisting a user choice', async () => {
			const { harness, opened, restore } = createRestoreHarness();

			await restore();
			await restore();

			assert.deepStrictEqual({
				opened,
				checked: harness._workspacePicker.isNoWorkspaceSelected(),
				createdSessionId: harness._createdSessionId,
			}, {
				opened: ['automatic'],
				checked: false,
				createdSessionId: 'quick-chat-1',
			});
		});

		for (const previouslySelected of [false, true]) {
			test(`does not infer Chat from failed workspace restoration (previously selected: ${previouslySelected})`, async () => {
				const state = createRestoreHarness();
				state.noWorkspaceSelected = previouslySelected;
				state.workspaceRestored = Promise.resolve(false);

				await state.restore();

				assert.deepStrictEqual(state.opened, previouslySelected ? ['checked'] : []);
			});

			test(`retries when a quick-chat provider becomes available (previously selected: ${previouslySelected})`, async () => {
				const state = createRestoreHarness();
				state.noWorkspaceSelected = previouslySelected;
				state.quickChatAvailable = false;
				await state.restore();
				const beforeAvailable = [...state.opened];

				state.quickChatAvailable = true;
				await state.restore();

				assert.deepStrictEqual({ beforeAvailable, afterAvailable: state.opened }, {
					beforeAvailable: [],
					afterAvailable: [previouslySelected ? 'checked' : 'automatic'],
				});
			});
		}

		test('allows automatic Chat fallback after workspace restoration recovers', async () => {
			const state = createRestoreHarness();
			state.workspaceRestored = Promise.resolve(false);
			await state.restore();
			const afterFailure = [...state.opened];

			state.workspaceRestored = Promise.resolve(true);
			await state.restore();

			assert.deepStrictEqual({ afterFailure, afterRecovery: state.opened }, {
				afterFailure: [],
				afterRecovery: ['automatic'],
			});
		});

		test('waits for workspace discovery before selecting Chat', async () => {
			const state = createRestoreHarness();
			const discovery = new DeferredPromise<boolean>();
			state.workspaceRestored = discovery.p;
			const restoring = state.restore();
			await timeout(0);
			const whileDiscovering = [...state.opened];

			await discovery.complete(true);
			await restoring;

			assert.deepStrictEqual({ whileDiscovering, afterDiscovery: state.opened }, {
				whileDiscovering: [],
				afterDiscovery: ['automatic'],
			});
		});

		for (const target of ['workspace', 'activeSession', 'pendingWorkspaceCreation'] as const) {
			test(`preserves a ${target} that arrives while discovering workspaces`, async () => {
				const state = createRestoreHarness();
				const discovery = new DeferredPromise<boolean>();
				state.workspaceRestored = discovery.p;
				const restoring = state.restore();
				await timeout(0);

				if (target === 'workspace') {
					state.selectedFolderUri = URI.file('/from-window');
				} else if (target === 'activeSession') {
					state.activeSession.set(upcastPartial<ITestSessionWithChat>({ sessionId: 'restored-session' }), undefined);
				} else {
					state.harness._newSessionCreation.value = toDisposable(() => { });
				}
				await discovery.complete(true);
				await restoring;

				assert.deepStrictEqual(state.opened, []);
			});
		}

		test('waits for initial session restoration before selecting Chat', async () => {
			const state = createRestoreHarness();
			state.initialRestoreComplete.set(false, undefined);
			const restoring = state.restore();
			await timeout(0);
			const beforeRestore = [...state.opened];

			state.initialRestoreComplete.set(true, undefined);
			await restoring;

			assert.deepStrictEqual({ beforeRestore, afterRestore: state.opened }, {
				beforeRestore: [],
				afterRestore: ['automatic'],
			});
		});

		test('cancels pending restoration when the composer is disposed', async () => {
			const state = createRestoreHarness();
			state.initialRestoreComplete.set(false, undefined);
			const restoring = state.restore();
			state.harness._noWorkspaceRestore.dispose();
			await restoring;
			state.initialRestoreComplete.set(true, undefined);

			assert.deepStrictEqual(state.opened, []);
		});
	});

	test('offers Chat when quick chats are available', () => {
		const cases = [
			{ available: false, isWorkspacePickerQuickChat: false },
			{ available: true, isWorkspacePickerQuickChat: false },
			{ available: false, isWorkspacePickerQuickChat: true },
		];

		const options = cases.map(testCase => {
			const option = getNoWorkspaceOption.call({
				_environment: constObservable(undefined),
				_isWorkspacePickerQuickChat: constObservable(testCase.isWorkspacePickerQuickChat),
				_session: constObservable(undefined),
				sessionsProvidersService: { getProviders: () => [] },
				sessionsManagementService: { isQuickChatTargetAvailable: () => testCase.available },
				selectNoWorkspace: () => { },
			});
			return option && { description: option.description, isSelected: option.isSelected };
		});

		assert.deepStrictEqual(options, isWeb
			? [undefined, undefined, undefined]
			: [
				undefined,
				{ description: 'Start without a backing workspace', isSelected: false },
				{ description: 'Start without a backing workspace', isSelected: true },
			]);
	});

	test('offers quick chat providers as a host submenu and forwards the selection', async () => {
		const selections: Array<ICreateNewSessionOptions | undefined> = [];
		const providers = [
			upcastPartial<ISessionsProvider>({
				id: LOCAL_AGENT_HOST_PROVIDER_ID,
				label: 'Local Agent Host',
				icon: Codicon.vm,
				supportsQuickChats: true,
			}),
			upcastPartial<ISessionsProvider>({
				id: 'agenthost-remote-test',
				label: 'Test Remote',
				icon: Codicon.remote,
				supportsQuickChats: true,
			}),
		];
		const option = getNoWorkspaceOption.call({
			_environment: constObservable(undefined),
			_isWorkspacePickerQuickChat: constObservable(false),
			_session: constObservable(undefined),
			sessionsProvidersService: { getProviders: () => providers },
			sessionsManagementService: { isQuickChatTargetAvailable: options => !options?.providerId || providers.some(provider => provider.id === options.providerId) },
			selectNoWorkspace: options => selections.push(options),
		});
		await option?.submenuActions?.[1].run();

		assert.deepStrictEqual({
			labels: option?.submenuActions?.map(action => action.label),
			icons: option?.submenuActions?.map(action => (action as { readonly icon?: { readonly id: string } }).icon?.id),
			selections,
		}, isWeb
			? {
				labels: undefined,
				icons: undefined,
				selections: [],
			}
			: {
				labels: ['This Computer', 'Test Remote'],
				icons: [Codicon.vm.id, Codicon.remote.id],
				selections: [{ providerId: 'agenthost-remote-test' }],
			});
	});

	test('offers repository-less Cloud chats only while the selected provider supports them', () => {
		let supportsQuickChats = true;
		const provider = upcastPartial<ISessionsProvider>({
			id: 'default-copilot',
			label: 'Cloud',
			get supportsQuickChats() { return supportsQuickChats; },
		});
		const localProvider = upcastPartial<ISessionsProvider>({
			id: LOCAL_AGENT_HOST_PROVIDER_ID, label: 'This Computer', supportsQuickChats: true,
		});
		const selections: (ICreateNewSessionOptions | undefined)[] = [];
		const harness: INoWorkspaceOptionHarness = {
			_environment: constObservable({
				id: 'cloud', kind: 'cloud', label: 'Cloud', icon: Codicon.cloud, providerIds: [provider.id],
			}),
			_isWorkspacePickerQuickChat: constObservable(false),
			_session: constObservable(undefined),
			sessionsProvidersService: { getProviders: () => [localProvider, provider] },
			sessionsManagementService: { isQuickChatTargetAvailable: () => true },
			selectNoWorkspace: options => selections.push(options),
		};
		const option = getNoWorkspaceOption.call(harness);
		option?.select();
		supportsQuickChats = false;
		option?.select();
		const disabledOption = getNoWorkspaceOption.call(harness);
		supportsQuickChats = true;
		const restoredOption = getNoWorkspaceOption.call(harness);

		assert.deepStrictEqual({
			available: !!option,
			hasSubmenu: !!option?.submenuActions,
			disabled: !!disabledOption,
			restored: !!restoredOption,
			selections,
		}, {
			available: !isWeb, hasSubmenu: false, disabled: false, restored: !isWeb,
			selections: isWeb ? [] : [{ providerId: provider.id }],
		});
	});

	test('does not offer repository-less chats for Dev Containers even when their provider supports quick chats', () => {
		const provider = upcastPartial<ISessionsProvider>({
			id: LOCAL_AGENT_HOST_PROVIDER_ID, label: 'This Computer', supportsQuickChats: true,
		});
		const option = getNoWorkspaceOption.call({
			_environment: constObservable<ISessionCreationEnvironment>({
				id: 'container:local', kind: 'container', label: 'Dev Container', icon: Codicon.remote, providerIds: [provider.id],
			}),
			_isWorkspacePickerQuickChat: constObservable(false),
			_session: constObservable(undefined),
			sessionsProvidersService: { getProviders: () => [provider] },
			sessionsManagementService: { isQuickChatTargetAvailable: () => true },
			selectNoWorkspace: () => assert.fail('Dev Containers require a workspace'),
		});

		assert.strictEqual(option, undefined);
	});

	test('labels selected remote quick chats with their provider', () => {
		const providers = [
			upcastPartial<ISessionsProvider>({
				id: LOCAL_AGENT_HOST_PROVIDER_ID,
				label: 'Local Agent Host',
				supportsQuickChats: true,
			}),
			upcastPartial<ISessionsProvider>({
				id: 'agenthost-remote-test',
				label: 'Test Remote',
				supportsQuickChats: true,
			}),
		];
		const selectedLabels = [
			LOCAL_AGENT_HOST_PROVIDER_ID,
			'agenthost-remote-test',
			'agenthost-missing',
		].map(providerId => getNoWorkspaceOption.call({
			_environment: constObservable(undefined),
			_isWorkspacePickerQuickChat: constObservable(true),
			_session: constObservable({ providerId }),
			sessionsProvidersService: { getProviders: () => providers },
			sessionsManagementService: { isQuickChatTargetAvailable: () => true },
			selectNoWorkspace: () => { },
		})?.selectedLabel);

		assert.deepStrictEqual(selectedLabels, isWeb
			? [undefined, undefined, undefined]
			: [undefined, 'Chat [Test Remote]', undefined]);
	});

	test('keeps Chat unqualified after selecting it in an explicit remote environment', () => {
		const provider = upcastPartial<ISessionsProvider>({
			id: 'agenthost-remote-test', label: 'benbox1', supportsQuickChats: true,
		});
		const selections: (ICreateNewSessionOptions | undefined)[] = [];
		const isQuickChat = observableValue('isQuickChat', false);
		const harness: INoWorkspaceOptionHarness = {
			_environment: constObservable({
				id: provider.id, kind: 'remote', label: provider.label, icon: Codicon.remote, providerIds: [provider.id],
			}),
			_isWorkspacePickerQuickChat: isQuickChat,
			_session: constObservable({ providerId: provider.id }),
			sessionsProvidersService: { getProviders: () => [provider] },
			sessionsManagementService: { isQuickChatTargetAvailable: () => true },
			selectNoWorkspace: options => {
				selections.push(options);
				isQuickChat.set(true, undefined);
			},
		};
		const before = getNoWorkspaceOption.call(harness);
		before?.select();
		const after = getNoWorkspaceOption.call(harness);
		assert.deepStrictEqual({
			before: before && { selected: before.isSelected, selectedLabel: before.selectedLabel },
			after: after && { selected: after.isSelected, selectedLabel: after.selectedLabel, submenuActions: after.submenuActions },
			selections,
		}, isWeb ? { before: undefined, after: undefined, selections: [] } : {
			before: { selected: false, selectedLabel: undefined },
			after: { selected: true, selectedLabel: undefined, submenuActions: undefined },
			selections: [{ providerId: provider.id }],
		});
	});

	test('hides offline Mission Control hosts from Chat while preserving the active chat label', () => {
		const visibility = observableValue('environmentVisibility', false);
		const providers = [
			upcastPartial<IAgentHostSessionsProvider>({
				id: LOCAL_AGENT_HOST_PROVIDER_ID,
				label: 'Local Agent Host',
				supportsQuickChats: true,
			}),
			upcastPartial<IAgentHostSessionsProvider>({
				id: 'agenthost-remote-test',
				label: 'Test Remote',
				supportsQuickChats: true,
			}),
			upcastPartial<IAgentHostSessionsProvider>({
				id: 'agenthost-mission-control',
				label: 'Old Environment',
				supportsQuickChats: true,
				isVisibleInEnvironmentPicker: visibility,
			}),
		];
		const harness: INoWorkspaceOptionHarness = {
			_environment: constObservable(undefined),
			_isWorkspacePickerQuickChat: constObservable(true),
			_session: constObservable({ providerId: 'agenthost-mission-control' }),
			sessionsProvidersService: { getProviders: () => providers },
			sessionsManagementService: { isQuickChatTargetAvailable: () => true },
			selectNoWorkspace: () => assert.fail('Existing quick chat must be preserved'),
		};
		const snapshot = () => {
			const option = getNoWorkspaceOption.call(harness);
			return {
				hosts: option?.submenuActions?.map(action => action.label),
				selectedLabel: option?.selectedLabel,
				isSelected: option?.isSelected,
			};
		};
		const states = [snapshot()];
		visibility.set(true, undefined);
		states.push(snapshot());
		visibility.set(false, undefined);
		states.push(snapshot());

		const offline = { hosts: ['This Computer', 'Test Remote'], selectedLabel: 'Chat [Old Environment]', isSelected: true };
		assert.deepStrictEqual(states, isWeb
			? Array.from({ length: 3 }, () => ({ hosts: undefined, selectedLabel: undefined, isSelected: undefined }))
			: [offline, { ...offline, hosts: ['This Computer', 'Test Remote', 'Old Environment'] }, offline]);
	});

	for (const hasLocalProvider of [false, true]) {
		test(`rejects a stale Chat ${hasLocalProvider ? 'submenu action' : 'direct selection'} after a Mission Control host goes offline`, async () => {
			const visibility = observableValue('environmentVisibility', true);
			const environment = upcastPartial<IAgentHostSessionsProvider>({
				id: 'agenthost-mission-control',
				label: 'Old Environment',
				supportsQuickChats: true,
				isVisibleInEnvironmentPicker: visibility,
			});
			const providers = hasLocalProvider
				? [upcastPartial<IAgentHostSessionsProvider>({
					id: LOCAL_AGENT_HOST_PROVIDER_ID,
					label: 'Local Agent Host',
					supportsQuickChats: true,
				}), environment]
				: [environment];
			const selections: Array<ICreateNewSessionOptions | undefined> = [];
			const harness: INoWorkspaceOptionHarness = {
				_environment: constObservable(undefined),
				_isWorkspacePickerQuickChat: constObservable(false),
				_session: constObservable(undefined),
				sessionsProvidersService: { getProviders: () => providers },
				sessionsManagementService: { isQuickChatTargetAvailable: () => true },
				selectNoWorkspace: options => selections.push(options),
			};
			const option = getNoWorkspaceOption.call(harness);
			visibility.set(false, undefined);
			if (hasLocalProvider) {
				await option?.submenuActions?.[1].run();
			} else {
				option?.select();
			}
			const offlineOption = getNoWorkspaceOption.call(harness);
			assert.deepStrictEqual({
				selections,
				chatAvailable: !!offlineOption,
				hasSubmenu: !!offlineOption?.submenuActions,
			}, {
				selections: [],
				chatAvailable: !isWeb && hasLocalProvider,
				hasSubmenu: false,
			});
		});
	}

	test('reselecting Chat or its current host preserves the quick chat draft', async () => {
		const selections: Array<ICreateNewSessionOptions | undefined> = [];
		const providers = [LOCAL_AGENT_HOST_PROVIDER_ID, 'agenthost-remote-test'].map(id => upcastPartial<ISessionsProvider>({
			id, label: id, supportsQuickChats: true,
		}));
		const option = getNoWorkspaceOption.call({
			_environment: constObservable(undefined),
			_isWorkspacePickerQuickChat: constObservable(true),
			_session: constObservable({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID }),
			sessionsProvidersService: { getProviders: () => providers },
			sessionsManagementService: { isQuickChatTargetAvailable: () => true },
			selectNoWorkspace: options => selections.push(options),
		});
		option?.select();
		await option?.submenuActions?.[0].run();
		const afterReselection = [...selections];
		await option?.submenuActions?.[1].run();

		assert.deepStrictEqual({ afterReselection, selections }, {
			afterReselection: [],
			selections: isWeb ? [] : [{ providerId: 'agenthost-remote-test' }],
		});
	});

	test('selects the sole quick chat provider directly', () => {
		const selections: Array<ICreateNewSessionOptions | undefined> = [];
		const provider = upcastPartial<ISessionsProvider>({
			id: 'agenthost-remote-test',
			label: 'Test Remote',
			icon: Codicon.remote,
			supportsQuickChats: true,
		});
		const option = getNoWorkspaceOption.call({
			_environment: constObservable(undefined),
			_isWorkspacePickerQuickChat: constObservable(false),
			_session: constObservable(undefined),
			sessionsProvidersService: { getProviders: () => [provider] },
			sessionsManagementService: { isQuickChatTargetAvailable: () => true },
			selectNoWorkspace: options => selections.push(options),
		});
		option?.select();

		assert.deepStrictEqual({
			hasSubmenu: !!option?.submenuActions,
			selections,
		}, {
			hasSubmenu: false,
			selections: isWeb ? [] : [{ providerId: 'agenthost-remote-test' }],
		});
	});

	test('includes remote quick chat hosts even when availability is still resolving', async () => {
		const providers = [
			upcastPartial<ISessionsProvider>({
				id: LOCAL_AGENT_HOST_PROVIDER_ID,
				label: 'Local Agent Host',
				icon: Codicon.vm,
				supportsQuickChats: true,
			}),
			upcastPartial<ISessionsProvider>({
				id: 'agenthost-remote-test',
				label: 'Test Remote',
				icon: Codicon.remote,
				supportsQuickChats: true,
			}),
		];
		const option = getNoWorkspaceOption.call({
			_isWorkspacePickerQuickChat: constObservable(false),
			_session: constObservable(undefined),
			sessionsProvidersService: { getProviders: () => providers },
			sessionsManagementService: {
				isQuickChatTargetAvailable: options => options?.providerId === LOCAL_AGENT_HOST_PROVIDER_ID,
			},
			_environment: constObservable(undefined),
			selectNoWorkspace: () => { },
		});
		await option?.submenuActions?.[1].run();

		assert.deepStrictEqual(option?.submenuActions?.map(action => action.label), isWeb ? undefined : ['This Computer', 'Test Remote']);
	});

	test('workspace-less chats do not inherit the previous picker workspace', () => {
		const staleFolder = URI.file('/previous-workspace');
		const session = upcastPartial<ISession>({ workspace: constObservable(undefined) });

		assert.deepStrictEqual({
			quickChat: getWorkspaceRoots.call({
				_isQuickChatComposer: constObservable(true),
				_workspacePicker: { selectedFolderUri: staleFolder },
			}, session).map(uri => uri.toString()),
			workspaceDraft: getWorkspaceRoots.call({
				_isQuickChatComposer: constObservable(false),
				_workspacePicker: { selectedFolderUri: staleFolder },
			}, session).map(uri => uri.toString()),
		}, {
			quickChat: [],
			workspaceDraft: [staleFolder.toString()],
		});
	});

	test('rotates welcome phrase indices across composers and reloads', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		assert.deepStrictEqual(
			Array.from({ length: 6 }, () => takeNextWelcomePhraseIndex(storageService)),
			[0, 1, 2, 3, 4, 5],
		);
	});

	test('renders and personalizes new session welcome phrases', () => {
		const render = (visible: boolean, phrases: readonly string[], phraseIndex: number) => {
			const container = document.createElement('div');
			const title = document.createElement('h2');
			container.append(title);
			updateWelcomeMessage(container, title, visible, phrases, phraseIndex);
			return { text: container.textContent, hidden: container.hidden };
		};
		const phrases = Array.from({ length: 5 }, (_, phraseIndex) => render(true, getNewSessionWelcomePhrases(undefined, undefined), phraseIndex).text);
		const namedPhrases = Array.from({ length: 5 }, (_, phraseIndex) => render(true, getNewSessionWelcomePhrases(undefined, 'Megan'), phraseIndex).text);

		assert.deepStrictEqual({
			phrases,
			namedPhrases,
			hidden: render(false, getNewSessionWelcomePhrases(undefined, 'Megan'), 0),
			wrapped: render(true, ['One', 'Two'], 5).text,
			empty: render(true, [], 0),
		}, {
			phrases: [
				'What are we building?',
				'What\u2019s the move?',
				'Let\u2019s cook',
				'Time to lock in',
				'Let\u2019s ship something',
			],
			namedPhrases: [
				'What are we building, Megan?',
				'What\u2019s the move, Megan?',
				'Let\u2019s cook, Megan',
				'Time to lock in, Megan',
				'Let\u2019s ship something, Megan',
			],
			hidden: { text: '', hidden: true },
			wrapped: 'Two',
			empty: { text: '', hidden: true },
		});
	});

	test('announces the welcome phrase once and identifies the opt-out setting', () => {
		const announcements: string[] = [];
		const createHarness = (screenReaderOptimized: boolean, announcementEnabled: boolean): IWelcomeAnnouncementHarness => ({
			_welcomePhraseAnnounced: false,
			accessibilityService: {
				isScreenReaderOptimized: () => screenReaderOptimized,
				status: message => announcements.push(message),
			},
			configurationService: {
				getValue: <T>(key: string): T => {
					assert.strictEqual(key, AccessibilityVerbositySettingId.NewSessionWelcome);
					return announcementEnabled as T;
				},
			},
		});

		const enabledHarness = createHarness(true, true);
		announceWelcomeMessage.call(enabledHarness, 'What are we building?', false);
		announceWelcomeMessage.call(enabledHarness, 'What are we building?', true);
		announceWelcomeMessage.call(enabledHarness, 'What are we building, Megan?', true);
		announceWelcomeMessage.call(createHarness(false, true), 'What’s the move?', true);
		announceWelcomeMessage.call(createHarness(true, false), 'Let’s cook', true);
		announceWelcomeMessage.call(createHarness(true, true), undefined, true);

		assert.deepStrictEqual(announcements, [
			'What are we building?\nTo disable this announcement, set accessibility.verbosity.newSessionWelcome to false.',
		]);
	});

	test('uses the full configured name or the first GitHub name', () => {
		const harness = { _getFirstName: getFirstName };
		const configuredName = getWelcomeName.call(harness, 'Octo Cat', '  Megan Rogge  ');
		const gitHubName = getWelcomeName.call(harness, '  Octo   Cat  ', '');
		const missingName = getWelcomeName.call(harness, undefined, '');

		assert.deepStrictEqual({ configuredName, gitHubName, missingName }, {
			configuredName: 'Megan Rogge',
			gitHubName: 'Octo',
			missingName: undefined,
		});
	});

	test('fetches a GitHub profile only when enabled and no name is configured', async () => {
		let welcomePhrasesEnabled = false;
		let configuredName = '';
		let currentDefaultAccount: { readonly authenticationProvider: { readonly id: string; readonly enterprise: boolean }; readonly sessionId: string } | null = null;
		let accountRequests = 0;
		const profileRequests: string[] = [];
		const githubProfileName = observableValue<string | undefined>('githubProfileName', 'stale');
		const harness = {
			_githubProfileAccountKey: 'github:stale',
			_githubProfileName: githubProfileName,
			enabled: { get: () => welcomePhrasesEnabled },
			_store: { isDisposed: false },
			configurationService: {
				getValue: <T>(key: string): T => (key.endsWith('welcomePhrases') ? welcomePhrasesEnabled : configuredName) as T,
			},
			defaultAccountService: {
				get currentDefaultAccount() { return currentDefaultAccount; },
				async getDefaultAccount() {
					accountRequests++;
					currentDefaultAccount = { authenticationProvider: { id: 'github', enterprise: false }, sessionId: 'initial-session' };
					return currentDefaultAccount;
				},
			},
			async _fetchGitHubProfileName(providerId: string, _enterprise: boolean, sessionId: string) {
				profileRequests.push(`${providerId}:${sessionId}`);
				return 'Octo Cat';
			},
		};

		await refreshGitHubProfileName.call(harness);
		configuredName = 'Megan';
		welcomePhrasesEnabled = true;
		await refreshGitHubProfileName.call(harness);
		configuredName = '';
		await refreshGitHubProfileName.call(harness);

		assert.deepStrictEqual({
			accountRequests,
			profileRequests,
			accountKey: harness._githubProfileAccountKey,
			profileName: githubProfileName.get(),
		}, {
			accountRequests: 1,
			profileRequests: ['github:initial-session'],
			accountKey: 'github:initial-session',
			profileName: 'Octo Cat',
		});
	});

	test('distinguishes providers when profile requests complete out of order', async () => {
		const githubProfile = new DeferredPromise<string | undefined>();
		const enterpriseProfile = new DeferredPromise<string | undefined>();
		let currentDefaultAccount = { authenticationProvider: { id: 'github', enterprise: false }, sessionId: 'shared-session' };
		const githubProfileName = observableValue<string | undefined>('githubProfileName', undefined);
		const harness = {
			_githubProfileAccountKey: undefined,
			_githubProfileName: githubProfileName,
			enabled: constObservable(true),
			_store: { isDisposed: false },
			configurationService: {
				getValue: <T>(key: string): T => (key.endsWith('welcomePhrases') ? true : '') as T,
			},
			defaultAccountService: {
				get currentDefaultAccount() { return currentDefaultAccount; },
				async getDefaultAccount() { return currentDefaultAccount; },
			},
			_fetchGitHubProfileName(providerId: string) {
				return providerId === 'github' ? githubProfile.p : enterpriseProfile.p;
			},
		};

		const publicRefresh = refreshGitHubProfileName.call(harness);
		currentDefaultAccount = { authenticationProvider: { id: 'github-enterprise', enterprise: true }, sessionId: 'shared-session' };
		const enterpriseRefresh = refreshGitHubProfileName.call(harness);
		githubProfile.complete('Public Name');
		await publicRefresh;
		enterpriseProfile.complete('Enterprise Name');
		await enterpriseRefresh;

		assert.deepStrictEqual({
			accountKey: harness._githubProfileAccountKey,
			profileName: githubProfileName.get(),
		}, {
			accountKey: 'github-enterprise:shared-session',
			profileName: 'Enterprise Name',
		});
	});

	test('does not request a public GitHub endpoint for an unresolved enterprise account', async () => {
		let authenticationRequests = 0;
		let profileRequests = 0;
		const warnings: string[] = [];
		const profileName = await fetchGitHubProfileName.call({
			authenticationService: {
				async getSessions() {
					authenticationRequests++;
					return [];
				},
			},
			defaultAccountService: { resolveGitHubUrl: () => undefined },
			requestService: {
				async request() {
					profileRequests++;
					throw new Error('Unexpected profile request');
				},
			},
			logService: { warn: message => warnings.push(message) },
		}, 'github-enterprise', true, 'session');

		assert.deepStrictEqual({ profileName, authenticationRequests, profileRequests, warnings }, {
			profileName: undefined,
			authenticationRequests: 0,
			profileRequests: 0,
			warnings: ['Failed to fetch GitHub profile name because the enterprise URL is unavailable.'],
		});
	});

	test('replays a provider change that arrives while creating the draft', async () => {
		const sessionTypesChanged = disposables.add(new Emitter<void>());
		const pendingPreferredUpgrade = disposables.add(new MutableDisposable<IDisposable>());
		const newSessionCreation = disposables.add(new MutableDisposable<IDisposable>());
		const folder = URI.file('/project');
		const firstCreation = new DeferredPromise<IOpenNewSessionResult>();
		let createCount = 0;
		const harness = createHarness(pendingPreferredUpgrade, newSessionCreation, sessionTypesChanged.event, () => {
			createCount++;
			return createCount === 1
				? firstCreation.p
				: Promise.resolve({ session: undefined, trustDeclined: true });
		});

		const creating = harness._createNewSession(folder);
		sessionTypesChanged.fire();
		firstCreation.complete({ session: undefined, trustDeclined: false });
		await creating;

		assert.strictEqual(createCount, 2);
	});

	test('tracks pending workspace creation until trust and draft creation settle', async () => {
		const creation = new DeferredPromise<IOpenNewSessionResult>();
		const harness = createHarness(
			disposables.add(new MutableDisposable<IDisposable>()),
			disposables.add(new MutableDisposable<IDisposable>()),
			Event.None,
			() => creation.p,
		);
		const creating = harness._createNewSession(URI.file('/project'));
		const pending = harness._pendingWorkspaceCreation === creation.p;
		await creation.complete({ session: undefined, trustDeclined: true });
		await creating;
		assert.deepStrictEqual({ pending, settled: harness._pendingWorkspaceCreation }, { pending: true, settled: undefined });
	});

	test('a cancelled handoff does not retry creation or apply its pending Dev Container preference', async () => {
		const changed = disposables.add(new Emitter<void>());
		const creation = new DeferredPromise<IOpenNewSessionResult>();
		const cancellation = disposables.add(new CancellationTokenSource());
		let calls = 0;
		let preferences = 0;
		const harness = createHarness(
			disposables.add(new MutableDisposable<IDisposable>()),
			disposables.add(new MutableDisposable<IDisposable>()),
			changed.event,
			async () => { calls++; return creation.p; },
		);
		harness._applyPreferredDevContainer = () => { preferences++; };
		const opening = createNewSession.call(harness, URI.file('/source'), undefined, { token: cancellation.token, preferDevContainer: true });
		cancellation.cancel();
		await creation.complete({ session: undefined, trustDeclined: false });
		await opening;
		changed.fire();
		assert.deepStrictEqual({ calls, preferences, pending: harness._pendingWorkspaceCreation }, { calls: 1, preferences: 0, pending: undefined });
	});

	test('applies the Dev Container preference when a late provider creates the draft', async () => {
		const sessionTypesChanged = disposables.add(new Emitter<void>());
		const pendingPreferredUpgrade = disposables.add(new MutableDisposable<IDisposable>());
		const newSessionCreation = disposables.add(new MutableDisposable<IDisposable>());
		let createCount = 0;
		const applied: string[] = [];
		const session = upcastPartial<ISession>({ sessionId: 'draft', providerId: LOCAL_AGENT_HOST_PROVIDER_ID });
		const harness = createHarness(pendingPreferredUpgrade, newSessionCreation, sessionTypesChanged.event, async () => {
			createCount++;
			return { session: createCount === 1 ? undefined : session, trustDeclined: false };
		});
		harness._applyPreferredDevContainer = created => {
			if (created) {
				applied.push(created.sessionId);
			}
		};

		await harness._createNewSession(URI.file('/project'));
		const countBeforeChange = createCount;
		sessionTypesChanged.fire();
		await timeout(0);

		assert.deepStrictEqual({
			countBeforeChange,
			countAfterChange: createCount,
			applied,
		}, {
			countBeforeChange: 1,
			countAfterChange: 2,
			applied: ['draft'],
		});
	});

	test('applies the Dev Container preference after the composer creates the requested draft', async () => {
		const sessionTypesChanged = disposables.add(new Emitter<void>());
		const pendingPreferredUpgrade = disposables.add(new MutableDisposable<IDisposable>());
		const newSessionCreation = disposables.add(new MutableDisposable<IDisposable>());
		const folder = URI.file('/project');
		const session = upcastPartial<ISession>({ sessionId: 'draft', providerId: LOCAL_AGENT_HOST_PROVIDER_ID });
		const applied: Array<{ sessionId: string; folder: string }> = [];
		const harness = createHarness(pendingPreferredUpgrade, newSessionCreation, sessionTypesChanged.event, async () => ({
			session,
			trustDeclined: false,
		}));
		harness._applyPreferredDevContainer = (created, createdFolder) => {
			if (created) {
				applied.push({ sessionId: created.sessionId, folder: createdFolder.toString() });
			}
		};

		await harness._createNewSession(folder);

		assert.deepStrictEqual(applied, [{ sessionId: 'draft', folder: folder.toString() }]);
	});

	test('applies a pending Dev Container preference only to a matching Agent Host draft', () => {
		const folder = URI.file('/project');
		const preferred: string[] = [];
		const harness = {
			_environment: constObservable(undefined),
			_preferredDevContainerFolderUri: folder,
			uriIdentityService: { extUri },
			sessionsProvidersService: {
				getProvider: (providerId: string) => providerId === LOCAL_AGENT_HOST_PROVIDER_ID
					? { id: providerId, preferDevContainer: (sessionId: string) => preferred.push(sessionId) }
					: { id: providerId },
			},
		};
		applyPreferredDevContainer.call(
			harness,
			upcastPartial<ISession>({ sessionId: 'other', providerId: 'other-provider' }),
			folder,
		);
		const pendingAfterOtherProvider = harness._preferredDevContainerFolderUri?.toString();
		applyPreferredDevContainer.call(
			harness,
			upcastPartial<ISession>({ sessionId: 'local', providerId: LOCAL_AGENT_HOST_PROVIDER_ID }),
			URI.file('/other-project'),
		);
		const pendingAfterOtherFolder = harness._preferredDevContainerFolderUri?.toString();
		applyPreferredDevContainer.call(
			harness,
			upcastPartial<ISession>({ sessionId: 'local', providerId: LOCAL_AGENT_HOST_PROVIDER_ID }),
			folder,
		);

		assert.deepStrictEqual({
			preferred,
			pendingAfterOtherProvider,
			pendingAfterOtherFolder,
			pendingAfterMatch: harness._preferredDevContainerFolderUri,
		}, {
			preferred: ['local'],
			pendingAfterOtherProvider: folder.toString(),
			pendingAfterOtherFolder: folder.toString(),
			pendingAfterMatch: undefined,
		});
	});

	test('leaves local isolation to the repository picker when creating a draft', async () => {
		const folder = URI.file('/project');
		const calls: string[] = [];
		const session = upcastPartial<ITestSessionWithChat>({ sessionId: 'draft', providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionType: 'copilot' });
		const harness = {
			_environment: constObservable<ISessionCreationEnvironment>({ id: 'local', kind: 'local', label: 'This Computer', icon: Codicon.deviceDesktop, providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID] }),
			_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => ({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'copilot' }) } },
			_workspacePicker: { selectedResolved: { providerId: LOCAL_AGENT_HOST_PROVIDER_ID } },
			sessionsService: { openNewSession: async () => ({ session, trustDeclined: false }) },
			sessionsProvidersService: {
				getProvider: () => upcastPartial<ISessionsProvider>({
					getSessionTypes: () => [{ id: 'copilot', label: 'Copilot', icon: Codicon.copilot, authRequirement: SessionTypeAuthRequirement.GitHub, supportsWorktreeConfiguration: true }],
					setIsolationMode: async (id, mode) => { calls.push(`${id}:${mode}`); },
				}),
			},
			_isPreferredServable: () => true,
			_requestsDevContainer: () => false,
			logService: { error: () => assert.fail('unexpected creation error') },
		};
		await createSessionNow.call(harness, folder, undefined, CancellationToken.None);
		assert.deepStrictEqual(calls, []);
	});

	test('a custom-view composer preserves its host when preparing workspace and quick-chat drafts', async () => {
		const folder = URI.file('/project');
		const requests: IOpenNewSessionOptions[] = [];
		const prepared: (ICreateNewSessionOptions | undefined)[] = [];
		const draft = upcastPartial<ITestSessionWithChat>({ sessionId: 'quick' });
		const harness: ICreateSessionNowHarness = {
			_preserveCustomView: true,
			_environment: constObservable(undefined),
			_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => undefined } },
			_workspacePicker: { selectedResolved: { providerId: 'local' } },
			sessionsService: {
				openNewSession: async options => {
					requests.push(options);
					return { session: undefined, trustDeclined: false };
				},
			},
			_isPreferredServable: () => true,
			_requestsDevContainer: () => false,
			logService: { error: () => assert.fail('unexpected creation error') },
		};
		await createSessionNow.call(harness, folder, undefined, CancellationToken.None);
		openQuickChat.call(upcastPartial<ISelectNoWorkspaceHarness>({
			_detached: true,
			_createQuickChat: createQuickChat,
			_environment: constObservable(undefined),
			_session: constObservable(draft),
			_draftSlot: {
				createQuickChat: options => {
					prepared.push(options);
					return draft;
				},
			},
			sessionsService: {
				openQuickChat: () => assert.fail('Preparing a custom-view draft must not navigate'),
			},
		}));
		assert.deepStrictEqual({ requests, prepared }, {
			requests: [{ folderUri: folder, preserveNavigation: true, preserveCustomView: true, providerId: 'local' }],
			prepared: [undefined],
		});
	});

	test('requires container execution for every draft after harness changes and provider discovery', async () => {
		const folder = URI.file('/project');
		const requests: IOpenNewSessionOptions[] = [];
		const harness: ICreateSessionNowHarness = {
			_environment: constObservable<ISessionCreationEnvironment>({ id: 'container:local', kind: 'container', label: 'Dev Container', icon: Codicon.remote, providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID] }),
			_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => ({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'copilot' }) } },
			_workspacePicker: { selectedResolved: { providerId: LOCAL_AGENT_HOST_PROVIDER_ID } },
			sessionsService: {
				openNewSession: async options => {
					requests.push(options);
					return { session: undefined, trustDeclined: false };
				},
			},
			_isPreferredServable: () => true,
			_requestsDevContainer: () => false,
			logService: { error: () => assert.fail('unexpected creation error') },
		};
		for (const sessionTypeId of ['copilot', 'claude', 'copilot']) {
			await createSessionNow.call(harness, folder, { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId }, CancellationToken.None);
		}
		assert.deepStrictEqual(requests, ['copilot', 'claude', 'copilot'].map(sessionTypeId => ({
			folderUri: folder, preserveNavigation: true, requireDevContainer: true, providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId,
		})));
	});

	test('resynchronizes Dev Container mode with the selection origin when updating and restoring a draft', () => {
		const folder = URI.file('/project');
		let selectedFolderUri: URI | undefined = folder;
		let enabled = true;
		const selections: Array<{ readonly folderUri: string; readonly providerId: string; readonly persist: boolean; readonly preferDevContainer: boolean; readonly origin: WorkspaceSelectionOrigin }> = [];
		const harness = {
			_reconcileWorkspaceEnvironment: () => { },
			uriIdentityService: { extUri },
			sessionsProvidersService: {
				getProvider: () => ({
					id: LOCAL_AGENT_HOST_PROVIDER_ID,
					isDevContainerEnabled: () => enabled,
				}),
			},
			_workspacePicker: {
				get selectedFolderUri() { return selectedFolderUri; },
				setSelectedWorkspace: (folderUri: URI, options: { providerId: string; persist: boolean; preferDevContainer: boolean; origin: WorkspaceSelectionOrigin }) => selections.push({
					folderUri: folderUri.toString(),
					providerId: options.providerId,
					persist: options.persist,
					preferDevContainer: options.preferDevContainer,
					origin: options.origin,
				}),
			},
		};
		const activeSession = upcastPartial<ITestSessionWithChat>({
			sessionId: 'draft',
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			workspace: constObservable<ISessionWorkspace | undefined>(upcastPartial<ISessionWorkspace>({
				uri: folder,
				label: 'project',
				folders: [{ root: folder, workingDirectory: folder, name: 'project', description: undefined }],
			})),
		});

		syncWorkspacePickerDevContainerMode.call(harness, activeSession, false, WorkspaceSelectionOrigin.SessionSync);
		enabled = false;
		syncWorkspacePickerDevContainerMode.call(harness, activeSession, false, WorkspaceSelectionOrigin.SessionSync);
		selectedFolderUri = undefined;
		syncWorkspacePickerDevContainerMode.call(harness, activeSession, false, WorkspaceSelectionOrigin.SessionSync);
		selectedFolderUri = URI.file('/other-project');
		syncWorkspacePickerDevContainerMode.call(harness, activeSession, false, WorkspaceSelectionOrigin.SessionSync);
		syncWorkspacePickerDevContainerMode.call(harness, activeSession, true, WorkspaceSelectionOrigin.RestoredDraft);

		assert.deepStrictEqual(selections, [
			{ folderUri: folder.toString(), providerId: LOCAL_AGENT_HOST_PROVIDER_ID, persist: false, preferDevContainer: true, origin: WorkspaceSelectionOrigin.SessionSync },
			{ folderUri: folder.toString(), providerId: LOCAL_AGENT_HOST_PROVIDER_ID, persist: false, preferDevContainer: false, origin: WorkspaceSelectionOrigin.SessionSync },
			{ folderUri: folder.toString(), providerId: LOCAL_AGENT_HOST_PROVIDER_ID, persist: true, preferDevContainer: false, origin: WorkspaceSelectionOrigin.RestoredDraft },
		]);
	});

	test('reuses the selected workspace draft only when the folder, provider and mode are unchanged', () => {
		const folder = URI.file('/project');
		const isCurrentWorkspaceSelection = Reflect.get(NewChatWidget.prototype, '_isCurrentWorkspaceSelection') as (
			this: {
				readonly _session: IObservable<ITestSessionWithChat | undefined>;
				readonly _workspacePicker: { readonly selectedResolved: { readonly providerId: string } };
				readonly _preferredDevContainerFolderUri: URI | undefined;
				readonly _pendingWorkspaceCreation?: Promise<IOpenNewSessionResult>;
				readonly uriIdentityService: { readonly extUri: typeof extUri };
				readonly sessionsProvidersService: { getProvider(): { readonly id: string; isDevContainerEnabled(): boolean } };
			},
			folderUri: URI | undefined,
		) => boolean;
		const cases = [
			{ name: 'same folder', folderUri: URI.file('/project'), reuse: true },
			{ name: 'different folder', folderUri: URI.file('/other'), reuse: false },
			{ name: 'cleared folder', folderUri: undefined, reuse: false },
			{ name: 'different provider', folderUri: folder, providerId: 'other', reuse: false },
			{ name: 'enable container', folderUri: folder, preferDevContainer: true, reuse: false },
			{ name: 'disable container', folderUri: folder, devContainerEnabled: true, reuse: false },
			{ name: 'same container', folderUri: folder, preferDevContainer: true, devContainerEnabled: true, reuse: true },
			{ name: 'pending selection', folderUri: folder, pending: true, reuse: false },
			{ name: 'created session', folderUri: folder, isCreated: true, reuse: false },
			{ name: 'no draft', folderUri: folder, noDraft: true, reuse: false },
		];
		const results = cases.map(options => ({
			name: options.name,
			reuse: isCurrentWorkspaceSelection.call({
				_session: constObservable(options.noDraft ? undefined : upcastPartial<ITestSessionWithChat>({
					sessionId: 'draft',
					providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
					...withCreatedStatus(constObservable(!!options.isCreated)),
					workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [{ root: folder, workingDirectory: folder, name: 'project', description: undefined }] })),
				})),
				_workspacePicker: { selectedResolved: { providerId: options.providerId ?? LOCAL_AGENT_HOST_PROVIDER_ID } },
				_preferredDevContainerFolderUri: options.preferDevContainer ? folder : undefined,
				_pendingWorkspaceCreation: options.pending ? Promise.resolve({ session: undefined, trustDeclined: false }) : undefined,
				uriIdentityService: { extUri },
				sessionsProvidersService: { getProvider: () => ({ id: LOCAL_AGENT_HOST_PROVIDER_ID, isDevContainerEnabled: () => !!options.devContainerEnabled }) },
			}, options.folderUri),
		}));

		assert.deepStrictEqual(results, cases.map(({ name, reuse }) => ({ name, reuse })));
	});

	test('cancels an in-flight creation and keeps the newer draft ownership', async () => {
		const sessionTypesChanged = disposables.add(new Emitter<void>());
		const pendingPreferredUpgrade = disposables.add(new MutableDisposable<IDisposable>());
		const newSessionCreation = disposables.add(new MutableDisposable<IDisposable>());
		const firstCreation = new DeferredPromise<IOpenNewSessionResult>();
		const tokens: CancellationToken[] = [];
		const harness = createHarness(pendingPreferredUpgrade, newSessionCreation, sessionTypesChanged.event, token => {
			tokens.push(token);
			return tokens.length === 1
				? firstCreation.p
				: Promise.resolve({ session: upcastPartial<ISession>({ sessionId: 'second' }), trustDeclined: false });
		});

		const first = harness._createNewSession(URI.file('/first'));
		const second = harness._createNewSession(URI.file('/second'));
		const firstCancelledWhenSecondStarted = tokens[0].isCancellationRequested;
		firstCreation.complete({ session: upcastPartial<ISession>({ sessionId: 'first' }), trustDeclined: false });
		await Promise.all([first, second]);

		assert.deepStrictEqual({
			tokenCount: tokens.length, firstCancelledWhenSecondStarted, createdSessionId: harness._createdSessionId,
		}, {
			tokenCount: 2, firstCancelledWhenSecondStarted: true, createdSessionId: 'second',
		});
	});

	test('restricts saved harness preferences to the explicit creation destination on web', () => {
		const folder = URI.parse('github-remote-file://github/microsoft/vscode/HEAD');
		const picks = [
			{ providerId: 'cloud', sessionTypeId: 'cloud' },
			{ sessionTypeId: 'cloud' },
			{ providerId: 'creation', sessionTypeId: 'sandbox' },
		];

		assert.deepStrictEqual(picks.map(pick => isPreferredServable.call({
			_environment: constObservable(undefined),
			agentHostFilterService: { selectedHost: { sessionCreationProviderId: 'creation' } },
			sessionsManagementService: {
				getSessionTypesForFolder: () => [
					{ providerId: 'cloud', sessionType: { id: 'cloud' } },
					{ providerId: 'creation', sessionType: { id: 'sandbox' } },
				],
			},
		}, folder, pick)), isWeb ? [false, false, true] : [true, true, true]);
	});

	test('sends the user pick to openNewSession, falling back to the preferred type', async () => {
		const folder = URI.file('/project');
		const userPick: IPreferredSessionType = { providerId: 'agent-host', sessionTypeId: 'claude' };
		const preferredType: IPreferredSessionType = { providerId: 'copilot', sessionTypeId: 'copilot-cli' };
		const cases: { pick: IPreferredSessionType | undefined; servable: boolean; preferred: IPreferredSessionType | undefined }[] = [
			{ pick: userPick, servable: true, preferred: preferredType },
			{ pick: userPick, servable: false, preferred: preferredType },
			{ pick: undefined, servable: true, preferred: preferredType },
			{ pick: undefined, servable: true, preferred: undefined },
		];

		const requested = await Promise.all(cases.map(async ({ pick, servable, preferred }) => {
			let options: IOpenNewSessionOptions | undefined;
			await createSessionNow.call({
				_environment: constObservable(undefined),
				_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => preferred } },
				_workspacePicker: { selectedResolved: { providerId: 'workspace-provider' } },
				sessionsService: {
					openNewSession: async opts => {
						options = opts;
						return { session: undefined, trustDeclined: false };
					},
				},
				logService: { error: () => { } },
				_isPreferredServable: () => servable,
				_requestsDevContainer: () => false,
			}, folder, pick, CancellationToken.None);
			return { providerId: options?.providerId, sessionTypeId: options?.sessionTypeId, preserveNavigation: options?.preserveNavigation };
		}));

		assert.deepStrictEqual(requested, [
			{ providerId: 'agent-host', sessionTypeId: 'claude', preserveNavigation: true },
			{ providerId: 'copilot', sessionTypeId: 'copilot-cli', preserveNavigation: true },
			{ providerId: 'copilot', sessionTypeId: 'copilot-cli', preserveNavigation: true },
			{ providerId: 'workspace-provider', sessionTypeId: undefined, preserveNavigation: true },
		]);
	});

	test('clones a cloud repository only when switching to a local harness', async () => {
		const repository = URI.parse('github-remote-file://github/microsoft/vscode/HEAD');
		const localRepository = URI.file('/repos/vscode');
		const calls: { commandId: string; args: unknown[] }[] = [];
		const selections: { folderUri: string; providerId: string }[] = [];
		const pick = { providerId: 'local-agent-host', sessionTypeId: 'claude' };

		const prepared = await prepareSessionTypeSelection.call({
			_workspacePicker: {
				selectedFolderUri: repository,
				selectedResolved: {
					workspace: upcastPartial<ISessionWorkspace>({
						group: SESSION_WORKSPACE_GROUP_GITHUB,
					}),
				},
				setSelectedWorkspace: (folderUri, options) => selections.push({ folderUri: folderUri.toString(), providerId: options.providerId }),
			},
			commandService: {
				executeCommand: async <T>(commandId: string, ...args: unknown[]) => {
					calls.push({ commandId, args });
					return localRepository.fsPath as T;
				},
			},
			logService: { error: () => { } },
			_isPreferredServable: folderUri => folderUri.scheme === 'file',
		}, pick);

		assert.deepStrictEqual({
			prepared,
			calls,
			selections,
		}, {
			prepared: true,
			calls: [{
				commandId: 'git.clone',
				args: [
					'https://github.com/microsoft/vscode.git',
					undefined,
					{ postCloneAction: 'none', returnRepositoryPath: true },
				],
			}],
			selections: [{
				folderUri: localRepository.toString(),
				providerId: 'local-agent-host',
			}],
		});
	});

	test('creates the cloned repository draft with the explicitly selected harness', async () => {
		const pendingPreferredUpgrade = disposables.add(new MutableDisposable<IDisposable>());
		const newSessionCreation = disposables.add(new MutableDisposable<IDisposable>());
		const pick = { providerId: 'local-agent-host', sessionTypeId: 'copilot' };
		let receivedPick: IPreferredSessionType | undefined;
		const harness = createHarness(
			pendingPreferredUpgrade,
			newSessionCreation,
			Event.None,
			async () => ({ session: undefined, trustDeclined: true }),
		);
		harness._createSessionNow = async (_folderUri, userPick) => {
			receivedPick = userPick;
			return { session: undefined, trustDeclined: true };
		};

		await harness._createNewSession(URI.file('/repos/vscode'), pick);

		assert.deepStrictEqual(receivedPick, pick);
	});

	test('a provider change only recreates the draft when the pick differs from it, or the draft is of another workspace than the folder; a cloud agent\'s draft of the folder\'s repository is of the folder', () => {
		const folder = URI.file('/project');
		const draftIn = (root: URI, group?: string, gitRepository?: ISessionGitRepository): IActiveDraft => ({ sessionId: 's1', ...withCreatedStatus(constObservable(false)), providerId: 'agent-host', sessionType: 'claude', workspace: constObservable({ folders: [{ root, gitRepository }], group }) });
		const ofRepository = upcastPartial<ISessionGitRepository>({ gitHubInfo: constObservable({ owner: 'owner', repo: 'repo' }) });
		// A cloud agent's draft of a local clone is of the clone's GitHub repository, as the Copilot provider maps it.
		const repository = (owner: string, repo: string) => URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: `/${owner}/${repo}/HEAD` });
		const clones = upcastPartial<ISessionsProvider>({
			id: 'local',
			resolveWorkspace: (folderUri: URI) => upcastPartial<ISessionWorkspace>({
				uri: folderUri, group: SESSION_WORKSPACE_GROUP_LOCAL,
				folders: [{ root: folderUri, workingDirectory: folderUri, name: folderUri.path, description: undefined, gitRepository: ofRepository }],
			}),
		});
		const identity = workspaceIdentity({ getProviders: () => [clones], getProvider: id => id === clones.id ? clones : undefined });
		const cases: { name: string; pick: IPreferredSessionType | undefined; servable: boolean; draft?: IActiveDraft }[] = [
			{ name: 'pick matches the draft', pick: { providerId: 'agent-host', sessionTypeId: 'claude' }, servable: true },
			{ name: 'pick names no provider, type matches', pick: { sessionTypeId: 'claude' }, servable: true },
			{ name: 'pick names another provider', pick: { providerId: 'other', sessionTypeId: 'claude' }, servable: true },
			{ name: 'pick names another type', pick: { providerId: 'agent-host', sessionTypeId: 'codex' }, servable: true },
			{ name: 'pick cannot be served yet', pick: { providerId: 'other', sessionTypeId: 'codex' }, servable: false },
			{ name: 'pick matches a draft of another folder', pick: { providerId: 'agent-host', sessionTypeId: 'claude' }, servable: true, draft: draftIn(URI.file('/other')) },
			{ name: 'no pick, the preferred type matches the draft', pick: undefined, servable: true },
			{ name: 'no pick, the preferred type matches a draft of another folder', pick: undefined, servable: true, draft: draftIn(URI.file('/other')) },
			{ name: 'no pick, the preferred type matches the cloud draft of the folder\'s repository', pick: undefined, servable: true, draft: draftIn(repository('Owner', 'repo'), SESSION_WORKSPACE_GROUP_GITHUB) },
			{ name: 'pick matches the cloud draft of the folder\'s repository', pick: { providerId: 'agent-host', sessionTypeId: 'claude' }, servable: true, draft: draftIn(repository('owner', 'repo'), SESSION_WORKSPACE_GROUP_GITHUB) },
			{ name: 'no pick, the preferred type matches the cloud draft of another repository', pick: undefined, servable: true, draft: draftIn(repository('owner', 'other'), SESSION_WORKSPACE_GROUP_GITHUB) },
			{ name: 'no pick, the preferred type matches a draft of another clone of the folder\'s repository', pick: undefined, servable: true, draft: draftIn(URI.file('/clone'), SESSION_WORKSPACE_GROUP_LOCAL, ofRepository) },
		];

		const outcomes = cases.map(({ name, pick, servable, draft = draftIn(folder) }) => {
			let recreated = false;
			const watcher = disposables.add(new MutableDisposable<IDisposable>());
			watcher.value = toDisposable(() => { });
			recreateOnProviderChange.call({
				_pendingPreferredUpgrade: watcher,
				_session: constObservable(draft),
				_workspacePicker: identity,
				_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => ({ providerId: 'agent-host', sessionTypeId: 'claude' }) } },
				_isPreferredServable: () => servable,
				_createNewSession: async () => {
					recreated = true;
					return { session: undefined, trustDeclined: false };
				},
			}, folder, pick, { sessionId: 's1' });
			return `${name}: ${recreated ? 'recreated' : watcher.value ? 'still watching' : 'settled'}`;
		});

		assert.deepStrictEqual(outcomes, [
			'pick matches the draft: settled',
			'pick names no provider, type matches: settled',
			'pick names another provider: recreated',
			'pick names another type: recreated',
			'pick cannot be served yet: still watching',
			'pick matches a draft of another folder: recreated',
			'no pick, the preferred type matches the draft: still watching',
			'no pick, the preferred type matches a draft of another folder: recreated',
			'no pick, the preferred type matches the cloud draft of the folder\'s repository: still watching',
			'pick matches the cloud draft of the folder\'s repository: settled',
			'no pick, the preferred type matches the cloud draft of another repository: recreated',
			'no pick, the preferred type matches a draft of another clone of the folder\'s repository: recreated',
		]);
	});

	test('provider-change recreation preserves the selected harness', () => {
		const folder = URI.file('/project');
		const draft: IActiveDraft = { sessionId: 's1', ...withCreatedStatus(constObservable(false)), providerId: 'cloud', sessionType: 'cloud', workspace: constObservable({ folders: [{ root: folder }] }) };
		const pick = { providerId: 'local-agent-host', sessionTypeId: 'copilot' };
		let recreatedWith: IPreferredSessionType | undefined;

		recreateOnProviderChange.call({
			_pendingPreferredUpgrade: disposables.add(new MutableDisposable<IDisposable>()),
			_session: constObservable(draft),
			_workspacePicker: workspaceIdentity(),
			_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => undefined } },
			_isPreferredServable: () => true,
			_createNewSession: async (_folderUri, userPick) => {
				recreatedWith = userPick;
				return { session: undefined, trustDeclined: false };
			},
		}, folder, pick, { sessionId: 's1' });

		assert.deepStrictEqual(recreatedWith, pick);
	});

	test('refreshes prompt options when the draft workspace changes', () => {
		const changes: string[] = [];
		const harness: IPromptOptionsWorkspaceHarness = {
			uriIdentityService: { extUri },
			_newChatInput: { clearPromptOptions: () => changes.push('cleared') },
			_refreshPromptOptions: async () => { changes.push('refreshed'); },
		};
		const first = URI.file('/first');
		const second = URI.file('/second');

		handlePromptOptionsWorkspaceChange.call(harness, first, second);
		handlePromptOptionsWorkspaceChange.call(harness, second, second);
		handlePromptOptionsWorkspaceChange.call(harness, second, undefined);
		handlePromptOptionsWorkspaceChange.call(harness, undefined, first);

		assert.deepStrictEqual(changes, ['refreshed', 'cleared', 'refreshed']);
	});

	test('preserves the selected local workspace when a cloud draft represents the same repository', () => {
		const localFolder = URI.file('/project');
		const cloudFolder = URI.parse('github-remote-file://github/owner/project/HEAD');
		const otherCloudFolder = URI.parse('github-remote-file://github/owner/other/HEAD');
		const selected: { folder: string; origin: WorkspaceSelectionOrigin }[] = [];
		const harness: ISyncWorkspacePickerHarness = {
			_workspacePicker: {
				matchesSelectedWorkspace: workspace => workspace.folders[0].root.toString() === cloudFolder.toString(),
				setSelectedWorkspace: (folderUri, options) => selected.push({ folder: folderUri.toString(), origin: options.origin }),
			},
		};
		const workspace = (root: URI): ISessionWorkspace => upcastPartial<ISessionWorkspace>({
			uri: root,
			folders: [{
				root,
				workingDirectory: root,
				name: root.path,
				description: undefined,
			}],
		});

		syncWorkspacePickerFromSessionWorkspace.call(harness, workspace(cloudFolder));
		syncWorkspacePickerFromSessionWorkspace.call(harness, workspace(otherCloudFolder));
		syncWorkspacePickerFromSessionWorkspace.call(harness, workspace(localFolder));

		assert.deepStrictEqual(selected, [
			{ folder: otherCloudFolder.toString(), origin: WorkspaceSelectionOrigin.SessionSync },
			{ folder: localFolder.toString(), origin: WorkspaceSelectionOrigin.SessionSync },
		]);
	});

	test('cloud submission accepts the selected repository without requiring the local folder URI', () => {
		const localFolder = URI.file('/project');
		const cloudFolder = URI.parse('github-remote-file://github/owner/project/HEAD');
		const workspace = upcastPartial<ISessionWorkspace>({
			folders: [{ root: cloudFolder, workingDirectory: cloudFolder, name: 'project', description: undefined }],
		});
		const session = upcastPartial<ISession>({ providerId: 'cloud', workspace: constObservable(workspace) });
		const environment: ISessionCreationEnvironment = { id: 'cloud', kind: 'cloud', label: 'Cloud', icon: Codicon.cloud, providerIds: ['cloud'] };
		const provider = upcastPartial<ISessionsProvider>({
			id: 'cloud',
			resolveWorkspace: () => workspace,
			getSessionTypes: () => [{ id: 'cloud', label: 'Cloud', icon: Codicon.cloud, authRequirement: SessionTypeAuthRequirement.GitHub }],
		});
		const results = [
			{ kind: 'cloud', matches: true, supported: true },
			{ kind: 'cloud', matches: false, supported: true },
			{ kind: 'cloud', matches: true, supported: false },
			{ kind: 'local', matches: true, supported: true },
			{ kind: 'remote', matches: true, supported: true },
			{ kind: 'container', matches: true, supported: true },
		].map(({ kind, matches, supported }) => derived(reader => canSendRequestToWorkspace.call({
			_workspacePicker: {
				selectedFolderUri: localFolder,
				matchesSelectedWorkspace: (candidate, candidateReader) => {
					assert.strictEqual(candidate, workspace);
					assert.strictEqual(candidateReader, reader);
					return matches;
				},
				getDevContainerWorkspaceAvailability: () => true,
			},
			sessionsProvidersService: { getProviders: () => supported ? [provider] : [] },
			sessionsManagementService: { isQuickChatTargetAvailable: () => false },
		}, session, { ...environment, kind: kind as ISessionCreationEnvironment['kind'] }, reader)).get());

		assert.deepStrictEqual(results, [true, false, false, false, false, false]);
	});

	for (const quickChat of [false, true]) {
		test(`hiding a selected remote preserves submission but offline and disconnected hosts remain blocked (quick chat: ${quickChat})`, () => {
			const folder = URI.parse('vscode-agent-host://remote/project');
			const workspace = upcastPartial<ISessionWorkspace>({
				folders: [{ root: folder, workingDirectory: folder, name: 'project', description: undefined }],
			});
			const visible = observableValue('visible', true);
			const available = observableValue('available', true);
			const connection = observableValue<RemoteAgentHostConnectionStatus>('connection', RemoteAgentHostConnectionStatus.connected);
			const provider = upcastPartial<IAgentHostSessionsProvider>({
				id: 'agenthost-selected', isAvailableInEnvironmentPicker: available,
				isVisibleInEnvironmentPicker: visible, connectionStatus: connection, resolveWorkspace: () => workspace,
			});
			const session = upcastPartial<ISession>({
				providerId: provider.id, workspace: constObservable(quickChat ? undefined : workspace), isQuickChat: constObservable(quickChat),
			});
			const environment: ISessionCreationEnvironment = {
				id: provider.id, kind: 'remote', label: 'Remote', icon: Codicon.remote, providerIds: [provider.id],
			};
			const canSend = derived(reader => canSendRequestToWorkspace.call({
				_workspacePicker: {
					selectedFolderUri: quickChat ? undefined : folder, matchesSelectedWorkspace: () => true,
					getDevContainerWorkspaceAvailability: () => true,
				},
				sessionsProvidersService: { getProviders: () => [provider] },
				sessionsManagementService: { isQuickChatTargetAvailable: () => true },
			}, session, environment, reader));
			const states: boolean[] = [];
			disposables.add(autorun(reader => states.push(canSend.read(reader))));
			visible.set(false, undefined);
			const hiddenCanSend = canSend.get();
			available.set(false, undefined);
			available.set(true, undefined);
			connection.set(RemoteAgentHostConnectionStatus.disconnected, undefined);
			connection.set(RemoteAgentHostConnectionStatus.connected, undefined);
			assert.deepStrictEqual({ hiddenCanSend, states, remainsHidden: !visible.get() }, {
				hiddenCanSend: true, states: [true, false, true, false, true], remainsHidden: true,
			});
		});
	}

	test('workspace-less submission requires an available quick-chat target, including in Cloud', () => {
		const session = upcastPartial<ISession>({
			providerId: 'default-copilot', sessionType: 'cloud',
			isQuickChat: constObservable(true), workspace: constObservable(undefined),
		});
		const environment: ISessionCreationEnvironment = {
			id: 'cloud', kind: 'cloud', label: 'Cloud', icon: Codicon.cloud, providerIds: [session.providerId],
		};
		const kinds: ISessionCreationEnvironment['kind'][] = ['cloud', 'local', 'remote', 'container'];
		const results = kinds.map(kind => {
			const available = observableValue('available', true);
			const isQuickChat = observableValue('isQuickChat', true);
			const canSend = derived(reader => {
				const supportsQuickChats = available.read(reader);
				return canSendRequestToWorkspace.call({
					_workspacePicker: {
						selectedFolderUri: undefined,
						matchesSelectedWorkspace: () => assert.fail('A quick chat has no repository to resolve'),
						getDevContainerWorkspaceAvailability: () => true,
					},
					sessionsProvidersService: { getProviders: () => [upcastPartial<ISessionsProvider>({ id: session.providerId })] },
					sessionsManagementService: {
						isQuickChatTargetAvailable: options => supportsQuickChats
							&& options?.providerId === session.providerId && options.sessionTypeId === session.sessionType,
					},
				}, { ...session, isQuickChat }, { ...environment, kind }, reader);
			});
			const states = [canSend.get()];
			available.set(false, undefined);
			states.push(canSend.get());
			available.set(true, undefined);
			states.push(canSend.get());
			isQuickChat.set(false, undefined);
			states.push(canSend.get());
			return { kind, states };
		});

		assert.deepStrictEqual(results, [
			{ kind: 'cloud', states: [true, false, true, false] },
			{ kind: 'local', states: [true, false, true, false] },
			{ kind: 'remote', states: [true, false, true, false] },
			{ kind: 'container', states: [false, false, false, false] },
		]);
	});

	test('only allows first-run notices once the session count threshold is reached', () => {
		const eligibility = [0, 1, 2, 5].map(sessionCount => hasEnoughSessionsForFirstRunNotices.call({
			_usage: { createdSessionCount: sessionCount },
		}));

		assert.deepStrictEqual(eligibility, [false, false, true, true]);
	});

	test('shows a tip only when the new-session composer is the sole foreground chat widget', () => {
		assert.deepStrictEqual([
			shouldShowNewSessionChatTip(true, undefined),
			shouldShowNewSessionChatTip(true, 0),
			shouldShowNewSessionChatTip(true, 1),
			shouldShowNewSessionChatTip(true, 2),
			shouldShowNewSessionChatTip(false, 1),
		], [false, false, true, false, false]);
	});

	test('returns focus to the input when the tip makes way for another banner while focused', () => {
		const update = (isShowing: boolean, focusTip: boolean) => {
			const container = mainWindow.document.body.appendChild(document.createElement('div'));
			disposables.add(toDisposable(() => container.remove()));
			const tipAction = container.appendChild(document.createElement('button'));
			if (focusTip) {
				tipAction.focus();
			}
			const calls: string[] = [];
			updateChatTip.call({
				// Like the tip presenter, takes the tip out of its container once it is not the banner that shows.
				_renderChatTip: () => {
					calls.push('renderChatTip');
					if (!isShowing) {
						container.replaceChildren();
					}
				},
				focusInput: () => calls.push('focusInput'),
			}, isShowing, container);
			return calls;
		};

		assert.deepStrictEqual({
			showing: update(true, true),
			outrankedWhileFocused: update(false, true),
			outranked: update(false, false),
		}, {
			showing: ['renderChatTip'],
			outrankedWhileFocused: ['renderChatTip', 'focusInput'],
			outranked: ['renderChatTip'],
		});
	});

	test('resets the tip session when the composer returns from multiple foreground chats', () => {
		let foregroundSessionCount = 2;
		let resetCount = 0;
		const harness: IChatTipSessionHarness = {
			_isChatTipSessionInitialized: true,
			contextKeyService: {
				getContextKeyValue: () => foregroundSessionCount,
			},
			chatTipService: {
				resetSession: () => resetCount++,
			},
		};

		const states = [2, 1, 1, 2, 1].map(count => {
			foregroundSessionCount = count;
			prepareChatTipSession.call(harness);
			return { count, initialized: harness._isChatTipSessionInitialized, resetCount };
		});

		assert.deepStrictEqual(states, [
			{ count: 2, initialized: false, resetCount: 0 },
			{ count: 1, initialized: true, resetCount: 1 },
			{ count: 1, initialized: true, resetCount: 1 },
			{ count: 2, initialized: false, resetCount: 1 },
			{ count: 1, initialized: true, resetCount: 2 },
		]);
	});

	test('forwards every composer context pill to the first chat request', async () => {
		const primaryFolder = URI.file('/primary');
		const attachedFolder = URI.file('/additional');
		const session = upcastPartial<ISession>({
			workspace: constObservable({
				uri: primaryFolder,
				label: 'primary',
				icon: Codicon.folder,
				folders: [{
					root: primaryFolder,
					workingDirectory: primaryFolder,
					name: 'primary',
					description: undefined,
					gitRepository: undefined,
				}],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
			}),
		});
		const composerAttachment = toFileVariableEntry(URI.file('/explicit-file'));
		const duplicateRepositoryAttachment = toPasteVariableEntry(
			'explicit repository context',
			'Explicit repository context',
			{ id: `github-context:https://github.com/microsoft/vscode` },
		);
		const repositoryRoot = URI.parse('vscode-vfs://github/microsoft/vscode/HEAD');
		const repositoryContext = upcastPartial<ISessionWorkspace>({
			uri: URI.parse('https://github.com/microsoft/vscode'),
			label: 'microsoft/vscode',
			icon: Codicon.repo,
			folders: [{
				root: repositoryRoot,
				workingDirectory: repositoryRoot,
				name: 'vscode',
				description: undefined,
			}],
		});
		const issueContext = upcastPartial<ISessionWorkspace>({
			uri: URI.parse('https://github.com/microsoft/vscode/issues/332805'),
			label: 'microsoft/vscode#332805',
			icon: Codicon.issues,
		});
		const attachedFolderContext: IChatRequestVariableEntry = {
			kind: 'directory',
			id: getAdditionalFolderContextId(attachedFolder),
			name: 'additional',
			value: attachedFolder,
		};
		const additionalRepositoryContext: IChatRequestVariableEntry = {
			kind: 'generic',
			id: getAdditionalRepositoryContextId(repositoryContext.uri),
			name: repositoryContext.label,
			value: repositoryRoot,
			icon: repositoryContext.icon,
		};
		const issueAttachment = toPasteVariableEntry(
			issueContext.label,
			`GitHub context: ${issueContext.uri.toString()}`,
			{ id: `github-context:${issueContext.uri.toString()}`, icon: issueContext.icon },
		);
		let sentOptions: ISendRequestOptions | undefined;
		let preparedOptions: ISendRequestOptions | undefined;
		let preparedSelection: IWorkspaceSelectionSnapshot | undefined;
		const stages: string[] = [];
		const selectionSnapshot: IWorkspaceSelectionSnapshot = {
			folderUri: primaryFolder, state: 'selected', origin: WorkspaceSelectionOrigin.WindowOpen,
			historyState: 'loaded', sessionFallbackState: 'idle', registeredProviderCount: 1,
		};
		let clearAttachedContextCount = 0;

		const result = await send.call({
			notificationService: { error: () => { } },
			_pendingBackgroundSends: { set: () => { }, deleteAndDispose: () => { } },
			recentWorkspacesService: { restoreDismissedWorkspace: uri => stages.push(`restore:${uri.toString()}`) },
			_session: constObservable(session),
			_feedbackItems: constObservable([]),
			_workspacePicker: {
				selectedFolderUri: primaryFolder,
				selectionSnapshot,
				validateSelectedWorkspace: async () => true,
				clearAttachedContext: () => clearAttachedContextCount++,
				showPicker: () => { },
			},
			_isQuickChatComposer: constObservable(false),
			_comparisonSelection: { enabled: constObservable(false) },
			agentFeedbackService: { removeFeedback: () => { } },
			newSessionComposerService: {
				notifyWillSendRequest: (options, selection) => {
					stages.push('prepare');
					preparedOptions = options;
					preparedSelection = selection;
				}
			},
			sessionsManagementService: {
				onDidSendRequest: Event.None,
				sendNewChatRequest: async (_session, options) => {
					sentOptions = options;
					stages.push('send');
				},
			},
			logService: { error: () => { } },
			_getWorkspaceRoots: () => [primaryFolder],
		}, 'work across contexts', [
			composerAttachment,
			duplicateRepositoryAttachment,
			attachedFolderContext,
			additionalRepositoryContext,
			issueAttachment,
		]);

		assert.deepStrictEqual({
			result,
			stages,
			preparedExactOptions: preparedOptions === sentOptions,
			preparedExactSelection: preparedSelection === selectionSnapshot,
			clearAttachedContextCount,
			attachments: sentOptions?.attachedContext?.map(attachment => ({
				kind: attachment.kind,
				id: attachment.id,
				value: URI.isUri(attachment.value) ? attachment.value.toString() : attachment.value,
			})),
		}, {
			result: true,
			stages: ['prepare', 'send', `restore:${primaryFolder.toString()}`],
			preparedExactOptions: true,
			preparedExactSelection: true,
			clearAttachedContextCount: 1,
			attachments: [
				{ kind: 'file', id: composerAttachment.id, value: URI.file('/explicit-file').toString() },
				{ kind: 'paste', id: duplicateRepositoryAttachment.id, value: duplicateRepositoryAttachment.value },
				{ kind: 'directory', id: attachedFolderContext.id, value: attachedFolder.toString() },
				{ kind: 'generic', id: additionalRepositoryContext.id, value: repositoryRoot.toString() },
				{ kind: 'paste', id: issueAttachment.id, value: issueAttachment.value },
			],
		});
	});

	test('opens the workspace picker without sending when no workspace is selected', async () => {
		let pickerOpenCount = 0;
		let sendCount = 0;

		const result = await send.call({
			notificationService: { error: () => { } },
			_pendingBackgroundSends: { set: () => { }, deleteAndDispose: () => { } },
			recentWorkspacesService: { restoreDismissedWorkspace: () => assert.fail('No session was sent') },
			_session: constObservable(undefined),
			_feedbackItems: constObservable([]),
			_workspacePicker: {
				selectedFolderUri: undefined,
				validateSelectedWorkspace: async () => true,
				clearAttachedContext: () => { },
				showPicker: () => pickerOpenCount++,
			},
			_isQuickChatComposer: constObservable(false),
			_comparisonSelection: { enabled: constObservable(false) },
			agentFeedbackService: { removeFeedback: () => { } },
			newSessionComposerService: { notifyWillSendRequest: () => { } },
			sessionsManagementService: {
				onDidSendRequest: Event.None,
				sendNewChatRequest: async () => {
					sendCount++;
				},
			},
			logService: { error: () => { } },
			_getWorkspaceRoots: () => [],
		}, 'work across contexts');

		assert.deepStrictEqual({ result, pickerOpenCount, sendCount }, {
			result: false,
			pickerOpenCount: 1,
			sendCount: 0,
		});
	});

	for (const outcome of ['missing', 'error', 'changed'] as const) {
		test(`does not send or consume the draft when workspace validation is ${outcome}`, async () => {
			const session = upcastPartial<ISession>({ sessionId: 'draft' });
			const activeSession = observableValue<ISession | undefined>('session', session);
			const calls: string[] = [];
			const result = await send.call({
				_session: activeSession,
				_workspacePicker: {
					selectedFolderUri: URI.file('/project.worktrees/deleted'),
					validateSelectedWorkspace: async () => {
						calls.push('validate');
						if (outcome === 'error') {
							throw new Error('Cannot check workspace');
						}
						if (outcome === 'changed') {
							activeSession.set(undefined, undefined);
							return true;
						}
						return false;
					},
					clearAttachedContext: () => calls.push('clearContext'),
					showPicker: () => calls.push('showPicker'),
				},
				_comparisonSelection: { enabled: constObservable(true) },
				_isQuickChatComposer: constObservable(false),
				_feedbackItems: constObservable([]),
				notificationService: { error: () => calls.push('error') },
				logService: { error: () => calls.push('log') },
				_pendingBackgroundSends: { set: () => calls.push('track'), deleteAndDispose: () => { } },
				recentWorkspacesService: { restoreDismissedWorkspace: () => calls.push('restore') },
				agentFeedbackService: { removeFeedback: () => calls.push('clearFeedback') },
				newSessionComposerService: { notifyWillSendRequest: () => calls.push('prepare') },
				sessionsManagementService: {
					onDidSendRequest: Event.None,
					sendNewChatRequest: async () => { calls.push('send'); },
				},
				_getWorkspaceRoots: () => [],
			}, 'keep this prompt');

			assert.deepStrictEqual({ result, calls }, { result: false, calls: outcome === 'error' ? ['validate', 'log', 'error'] : ['validate'] });
		});
	}

	test('clearing a workspace starts the same harness without a project when supported and preserves legacy fallback', async () => {
		const results: string[][] = [];
		for (const { workspaceOptOutEnabled, supported, succeeds } of [
			{ workspaceOptOutEnabled: false, supported: true, succeeds: true },
			{ workspaceOptOutEnabled: true, supported: false, succeeds: true },
			{ workspaceOptOutEnabled: true, supported: true, succeeds: true },
			{ workspaceOptOutEnabled: true, supported: true, succeeds: false },
		]) {
			const events: string[] = [];
			const pendingUpgrade = disposables.add(new MutableDisposable());
			pendingUpgrade.value = toDisposable(() => events.push('cancelUpgrade'));
			const creation = disposables.add(new MutableDisposable());
			creation.value = toDisposable(() => events.push('cancelCreation'));
			const restore = disposables.add(new MutableDisposable());
			restore.value = toDisposable(() => events.push('cancelRestore'));
			await onWorkspaceSelected.call({
				_workspaceSelectionCleared: false,
				_workspaceOptOutTarget: constObservable(supported ? { providerId: 'local', sessionTypeId: 'copilot' } : undefined),
				_noWorkspaceRestore: restore,
				_pendingPreferredUpgrade: pendingUpgrade,
				_newSessionCreation: creation,
				_preferredDevContainerFolderUri: undefined,
				_session: constObservable(undefined),
				_workspaceOptOutEnabled: constObservable(workspaceOptOutEnabled),
				sessionsService: { unsetNewSession: () => events.push('unsetSession') },
				notificationService: { error: () => events.push('error') },
				selectNoWorkspace: (options, selectionOptions) => {
					events.push(`chat:${options?.providerId}:${options?.sessionTypeId}:${selectionOptions?.userSelection}:${selectionOptions?.preserveNavigation}`);
					return succeeds ? upcastPartial<ITestSessionWithChat>({ sessionId: 'quick-chat' }) : undefined;
				},
				_restoreNoWorkspaceDraft: async () => { events.push('restoreChat'); },
			}, undefined);
			results.push(events);
		}
		assert.deepStrictEqual(results, [
			['cancelUpgrade', 'cancelRestore', 'cancelCreation', 'unsetSession', 'restoreChat'],
			['cancelUpgrade', 'cancelRestore', 'cancelCreation', 'unsetSession'],
			['cancelUpgrade', 'cancelRestore', 'cancelCreation', 'chat:local:copilot:false:true'],
			['cancelUpgrade', 'cancelRestore', 'cancelCreation', 'chat:local:copilot:false:true', 'unsetSession', 'error'],
		]);
	});

	test('workspace selection retains picker focus after workspace clearing settles and preserves other input focus', async () => {
		const container = append(mainWindow.document.body, $('div'));
		disposables.add(toDisposable(() => container.remove()));
		const picker = append(container, $('button', { type: 'button' }, 'Workspace'));
		const input = append(container, $('textarea'));
		const results: { pickerFocused: boolean; inputFocused: boolean; selections: number }[] = [];
		for (const { workspaceOptOutEnabled, folderUri, current } of [
			{ workspaceOptOutEnabled: false, folderUri: undefined, current: false },
			{ workspaceOptOutEnabled: true, folderUri: undefined, current: false },
			{ workspaceOptOutEnabled: true, folderUri: URI.file('/workspace'), current: false },
			{ workspaceOptOutEnabled: true, folderUri: URI.file('/workspace'), current: true },
		]) {
			const selected = new DeferredPromise<void>();
			let selections = 0;
			const harness: IHandleWorkspaceSelectionHarness = {
				_environment: constObservable(undefined),
				_workspaceOptOutEnabled: constObservable(workspaceOptOutEnabled),
				_newChatInput: { focus: () => input.focus() },
				_isCurrentWorkspaceSelection: () => current,
				_onWorkspaceSelected: async () => {
					selections++;
					await selected.p;
				},
			};
			picker.focus();
			const selecting = handleWorkspaceSelection.call(harness, folderUri);
			await selected.complete();
			await selecting;
			results.push({
				pickerFocused: mainWindow.document.activeElement === picker,
				inputFocused: mainWindow.document.activeElement === input,
				selections,
			});
		}
		assert.deepStrictEqual(results, [
			{ pickerFocused: false, inputFocused: true, selections: 1 },
			{ pickerFocused: true, inputFocused: false, selections: 1 },
			{ pickerFocused: false, inputFocused: true, selections: 1 },
			{ pickerFocused: false, inputFocused: true, selections: 0 },
		]);
	});

	test('reports setup failures without clearing context or notifying on cancellation', async () => {
		const notifications: (string | Error)[] = [];
		const errors: unknown[] = [];
		let cleared = 0;
		let detailsShown = 0;
		const actionable = createErrorWithActions('Could not start the session', [
			toAction({ id: 'test.details', label: 'Show Details', run: () => { detailsShown++; } }),
		]);
		const session = upcastPartial<ISession>({ sessionId: 'draft' });
		const results: boolean[] = [];
		for (const error of [new Error('Container build failed'), actionable, new CancellationError(), new WorkspaceNotTrustedError()]) {
			const harness: ISendHarness & { send: typeof send } = {
				send,
				notificationService: { error: message => notifications.push(message) },
				_pendingBackgroundSends: { set: () => { }, deleteAndDispose: () => { } },
				recentWorkspacesService: { restoreDismissedWorkspace: () => assert.fail('Failed sends must not restore dismissed workspaces') },
				_session: constObservable(session),
				_feedbackItems: constObservable([]),
				_comparisonSelection: { enabled: constObservable(false) },
				_workspacePicker: { selectedFolderUri: URI.file('/dismissed'), validateSelectedWorkspace: async () => true, clearAttachedContext: () => cleared++, showPicker: () => { } },
				_isQuickChatComposer: constObservable(false),
				agentFeedbackService: { removeFeedback: () => { } },
				newSessionComposerService: { notifyWillSendRequest: () => { } },
				sessionsManagementService: { onDidSendRequest: Event.None, sendNewChatRequest: async () => { throw error; } },
				logService: { error: (_message, error) => errors.push(error) },
				_getWorkspaceRoots: () => [],
			};
			results.push(await harness.send('hello'));
		}
		const shown = notifications[1];
		assert.ok(isErrorWithActions(shown));
		await shown.actions[0].run();
		assert.deepStrictEqual({ results, notifications, detailsShown, cleared, errors: errors.length }, {
			results: [false, false, false, false],
			notifications: ['Failed to start session: Container build failed', actionable],
			detailsShown: 1,
			cleared: 0,
			errors: 2,
		});
	});

	for (const [backgroundSend, inboxEnabled] of [[false, false], [false, true], [true, false]]) {
		test(`confirms opted-in background sends and reseeds the workspace (always background: ${backgroundSend}, Inbox enabled: ${inboxEnabled})`, async () => {
			const onDidSendRequest = disposables.add(new Emitter<ISendRequestSentEvent>());
			const pendingSends = disposables.add(new DisposableMap<object, IDisposable>());
			const folderUri = URI.file('/dismissed');
			const restored: URI[] = [];
			const session = upcastPartial<ISession>({ sessionId: 'draft' });
			const sentSession = upcastPartial<ISession>({ resource: URI.parse('test-session:/started') });
			let sentOptions: ISendRequestOptions | undefined;
			const picker = { selectedFolderUri: folderUri, validateSelectedWorkspace: async () => true, clearAttachedContext: () => { }, showPicker: () => { } };
			const harness: ISendHarness = {
				configurationService: new TestConfigurationService({ 'sessions.list.inboxEnabled': inboxEnabled }),
				_backgroundSend: backgroundSend,
				_backgroundSendStatus: observableValue<string | undefined>('sendStatus', undefined),
				_newChatInput: { hasInput: false },
				notificationService: { error: () => assert.fail('Unexpected error') },
				_pendingBackgroundSends: pendingSends,
				recentWorkspacesService: { restoreDismissedWorkspace: uri => restored.push(uri) },
				_session: constObservable(session),
				_feedbackItems: constObservable([]),
				_comparisonSelection: { enabled: constObservable(false) },
				_workspacePicker: picker,
				_isQuickChatComposer: constObservable(false),
				agentFeedbackService: { removeFeedback: () => { } },
				newSessionComposerService: { notifyWillSendRequest: () => { } },
				sessionsManagementService: {
					onDidSendRequest: onDidSendRequest.event,
					sendNewChatRequest: async (_session, options) => { sentOptions = options; },
				},
				logService: { error: () => assert.fail('Unexpected error') },
				_getWorkspaceRoots: () => [folderUri],
				_createNewSession: async () => { picker.selectedFolderUri = URI.file('/different-workspace'); },
			};
			await send.call(harness, 'hello', undefined, backgroundSend ? undefined : true);
			const beforeSuccess = { restored: [...restored], status: harness._backgroundSendStatus?.get() };
			onDidSendRequest.fire(upcastPartial<ISendRequestSentEvent>({ options: { query: 'unrelated' } }));
			const afterUnrelatedSend = { restored: [...restored], status: harness._backgroundSendStatus?.get() };
			assert.ok(sentOptions);
			onDidSendRequest.fire(upcastPartial<ISendRequestSentEvent>({ options: sentOptions, session: sentSession }));
			assert.deepStrictEqual({ beforeSuccess, afterUnrelatedSend, restored, pending: pendingSends.size, background: sentOptions.background, status: harness._backgroundSendStatus?.get(), resource: harness._lastBackgroundSentSessionResource }, {
				beforeSuccess: { restored: [], status: undefined }, afterUnrelatedSend: { restored: [], status: undefined },
				restored: [folderUri], pending: 0, background: true,
				status: backgroundSend || inboxEnabled ? 'Message sent' : undefined,
				resource: backgroundSend || inboxEnabled ? sentSession.resource : undefined,
			});
		});
	}

	for (const outcome of ['failed', 'new draft', 'superseded', 'disposed'] as const) {
		test(`Inbox does not confirm a background send that is ${outcome}`, async () => {
			const sent = disposables.add(new Emitter<ISendRequestSentEvent>());
			const pending = disposables.add(new DisposableMap<object, IDisposable>());
			const status = observableValue<string | undefined>('status', undefined);
			const options: ISendRequestOptions[] = [];
			const errors: (string | Error)[] = [];
			let hasInput = false;
			const harness: ISendHarness = {
				_backgroundSend: true,
				_backgroundSendStatus: status,
				_newChatInput: { get hasInput() { return hasInput; } },
				notificationService: { error: error => errors.push(error) },
				_pendingBackgroundSends: pending,
				recentWorkspacesService: { restoreDismissedWorkspace: () => { } },
				newSessionComposerService: { notifyWillSendRequest: () => { } },
				_session: constObservable(upcastPartial<ISession>({ sessionId: 'draft' })),
				_feedbackItems: constObservable([]),
				_comparisonSelection: { enabled: constObservable(false) },
				_workspacePicker: { selectedFolderUri: URI.file('/workspace'), validateSelectedWorkspace: async () => true, clearAttachedContext: () => { }, showPicker: () => { } },
				_isQuickChatComposer: constObservable(false),
				agentFeedbackService: { removeFeedback: () => { } },
				sessionsManagementService: {
					onDidSendRequest: sent.event,
					sendNewChatRequest: async (_session, sendOptions) => {
						options.push(sendOptions);
						if (outcome === 'failed') {
							throw new Error('test failure');
						}
					},
				},
				logService: { error: () => { } },
				_getWorkspaceRoots: () => [],
				_createNewSession: async () => { },
			};
			const result = await send.call(harness, 'hello');
			if (outcome === 'new draft') {
				hasInput = true;
			} else if (outcome === 'superseded') {
				await send.call(harness, 'next request');
			} else if (outcome === 'disposed') {
				pending.dispose();
			}
			sent.fire(upcastPartial<ISendRequestSentEvent>({ options: options[0] }));
			assert.deepStrictEqual({ result, status: status.get(), errors: errors.length }, {
				result: outcome !== 'failed', status: undefined, errors: outcome === 'failed' ? 1 : 0,
			});
		});
	}

	test('Inbox send confirmation announces once, has a trailing decorative checkmark, and clears on editing', () => {
		const changed = disposables.add(new Emitter<void>());
		const status = observableValue<string | undefined>('status', undefined);
		const announcements: string[] = [];
		let hasInput = false;
		const harness = {
			_backgroundSend: true,
			_backgroundSendStatus: status,
			_lastBackgroundSendOptions: { query: 'sent' } as ISendRequestOptions | undefined,
			_newChatInput: { onDidChangeInput: changed.event, get hasInput() { return hasInput; } },
			accessibilityService: { status: (message: string) => announcements.push(message) },
			_register: <T extends IDisposable>(value: T) => disposables.add(value),
		};
		const container = $('div');
		const render = Reflect.get(NewChatWidget.prototype, '_renderBackgroundSendStatus') as (this: typeof harness, container: HTMLElement) => void;
		render.call(harness, container);
		const element = container.firstElementChild;
		status.set('Message sent', undefined);
		changed.fire();
		const confirmation = element?.textContent;
		const checkmark = element?.lastElementChild;
		const trailingCheckmark = checkmark?.classList.contains('codicon-check');
		const decorative = checkmark?.getAttribute('aria-hidden');
		hasInput = true;
		changed.fire();
		assert.deepStrictEqual({ confirmation, trailingCheckmark, decorative, announcements, cleared: element?.textContent, pending: harness._lastBackgroundSendOptions }, {
			confirmation: 'Message sent', trailingCheckmark: true, decorative: 'true', announcements: ['Message sent'], cleared: '', pending: undefined,
		});
	});

	test('Inbox send confirmation expires after five seconds and a later confirmation gets a fresh timeout', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const store = disposables.add(new DisposableStore());
		const status = observableValue<string | undefined>('status', undefined);
		const announcements: string[] = [];
		const harness = {
			_backgroundSend: true,
			_backgroundSendStatus: status,
			_newChatInput: { onDidChangeInput: Event.None, hasInput: false },
			accessibilityService: { status: (message: string) => announcements.push(message) },
			_register: <T extends IDisposable>(value: T) => store.add(value),
		};
		const container = $('div');
		const render = Reflect.get(NewChatWidget.prototype, '_renderBackgroundSendStatus') as (this: typeof harness, container: HTMLElement) => void;
		render.call(harness, container);
		status.set('Message sent', undefined);
		await timeout(4999);
		const beforeTimeout = container.textContent;
		await timeout(1);
		const afterTimeout = container.textContent;
		status.set('Message sent', undefined);
		await timeout(1000);
		status.set(undefined, undefined);
		status.set('Message sent', undefined);
		await timeout(4000);
		const beforeRenewedTimeout = container.textContent;
		await timeout(1000);
		const afterRenewedTimeout = container.textContent;
		status.set('Message sent', undefined);
		store.dispose();
		await timeout(5000);
		assert.deepStrictEqual({ beforeTimeout, afterTimeout, beforeRenewedTimeout, afterRenewedTimeout, disposedStatus: status.get(), announcements }, {
			beforeTimeout: 'Message sent', afterTimeout: '', beforeRenewedTimeout: 'Message sent', afterRenewedTimeout: '',
			disposedStatus: 'Message sent', announcements: ['Message sent', 'Message sent', 'Message sent', 'Message sent'],
		});
	}));

	for (const activation of ['click', 'Enter'] as const) {
		test(`Inbox sent-session link opens the sent session on ${activation} before expiring`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IHoverService, NullHoverService);
			instantiationService.stub(IOpenerService, {});
			const changed = disposables.add(new Emitter<void>());
			const status = observableValue<string | undefined>('status', undefined);
			const resource = URI.parse('test-session:/started');
			const opened: { resource: URI; options?: IOpenSessionOptions }[] = [];
			let hasInput = false;
			const harness = {
				_backgroundSend: true,
				_backgroundSendStatus: status,
				_lastBackgroundSentSessionResource: resource as URI | undefined,
				_newChatInput: { onDidChangeInput: changed.event, get hasInput() { return hasInput; } },
				accessibilityService: { status: () => { } },
				instantiationService,
				sessionsService: { openSession: async (resource: URI, options?: IOpenSessionOptions) => { opened.push({ resource, options }); } },
				_register: <T extends IDisposable>(value: T) => disposables.add(value),
			};
			const container = $('div');
			const render = Reflect.get(NewChatWidget.prototype, '_renderBackgroundSendStatus') as (this: typeof harness, container: HTMLElement) => void;
			render.call(harness, container);
			status.set('Message sent', undefined);
			await timeout(6000);
			const link = container.querySelector('a')!;
			if (activation === 'click') {
				link.click();
			} else {
				link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			}
			const confirmation = container.textContent;
			hasInput = true;
			changed.fire();
			assert.deepStrictEqual({ confirmation, opened, cleared: container.textContent, resource: harness._lastBackgroundSentSessionResource }, {
				confirmation: 'Message sentOpen Session', opened: [{ resource, options: { source: 'inbox', forceMainChat: true } }], cleared: '', resource: undefined,
			});
		}));
	}

	suite('a composer with a draft host', () => {
		test('only the main window\'s composers take the global composer actions, such as tours or the folder picker, while they show; a composer of a host of its own, such as a chat window\'s, never does', () => {
			const takes = (draftHost: boolean, hostVisible?: boolean, inputVisible?: boolean) => takesGlobalComposerActions.call(Object.assign(Object.create(NewChatWidget.prototype), {
				_draftHost: draftHost ? {} : undefined,
				options: { hostVisible: hostVisible === undefined ? undefined : constObservable(hostVisible), inputVisible: inputVisible === undefined ? undefined : constObservable(inputVisible) },
			}), undefined);

			assert.deepStrictEqual({ main: takes(false), hostHidden: takes(false, false), inputHidden: takes(false, true, false), hosted: takes(true), hostedShowing: takes(true, true, true) }, {
				main: true,
				hostHidden: false,
				inputHidden: false,
				hosted: false,
				hostedShowing: false,
			});
		});

		test('only the main window\'s composers can be the target of Voice Mode; a composer of a host of its own, such as a chat window\'s, tells its input it cannot', () => {
			const options = (draftHost: boolean) => Reflect.get(NewChatWidget.prototype, '_globalTargetOptions').call(Object.assign(Object.create(NewChatWidget.prototype), { _draftHost: draftHost ? {} : undefined }));

			assert.deepStrictEqual({ main: options(false), hosted: options(true) }, { main: { voiceTarget: true }, hosted: { voiceTarget: false } });
		});


		function host(slot: INewSessionDraftSlot, opened: ISession[] = [], tracked: { send: INewSessionBackgroundSend; cancelled: boolean }[] = []): INewSessionDraftHost {
			return {
				slot,
				openStartedSession: async session => { opened.push(session); },
				trackBackgroundSend: send => {
					const entry = { send, cancelled: false };
					tracked.push(entry);
					// The host keeps its tracking until the request ends; the suite disposes what is left.
					return disposables.add(toDisposable(() => entry.cancelled = true));
				},
			};
		}

		test('prepares and discards its drafts in the host\'s slot, without changing the grid', async () => {
			const folder = URI.file('/project');
			const requests: IOpenNewSessionOptions[] = [];
			let discarded = 0;
			const slot = upcastPartial<INewSessionDraftSlot>({ id: 'slot', discardNewSession: () => discarded++ });
			const harness: ICreateSessionNowHarness = {
				_draftHost: host(slot),
				_applyRequestedSelection: () => { },
				_environment: constObservable(undefined),
				_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => undefined } },
				_workspacePicker: { selectedResolved: { providerId: 'local' } },
				sessionsService: { openNewSession: async options => { requests.push(options); return { session: undefined, trustDeclined: false }; } },
				_isPreferredServable: () => true,
				_requestsDevContainer: () => false,
				logService: { error: () => assert.fail('unexpected creation error') },
			};
			await createSessionNow.call(harness, folder, undefined, CancellationToken.None);
			await onWorkspaceSelected.call(upcastPartial<IClearWorkspaceHarness>({
				_detached: true,
				_draftSlot: slot,
				_workspaceSelectionCleared: false,
				_workspaceOptOutTarget: constObservable(undefined),
				_noWorkspaceRestore: disposables.add(new MutableDisposable()),
				_pendingPreferredUpgrade: disposables.add(new MutableDisposable()),
				_newSessionCreation: disposables.add(new MutableDisposable()),
				_preferredDevContainerFolderUri: undefined,
				_session: constObservable(undefined),
				_workspaceOptOutEnabled: constObservable(true),
				sessionsService: { unsetNewSession: () => assert.fail('A hosted composer must not change the grid') },
			}), undefined);

			assert.deepStrictEqual({ requests, discarded }, {
				requests: [{ folderUri: folder, preserveNavigation: true, draftSlot: slot, providerId: 'local' }],
				discarded: 1,
			});
		});

		test('hides Compare Agents and refuses a stale comparison send with its reason', async () => {
			const slot = upcastPartial<INewSessionDraftSlot>({ id: 'slot' });
			const infos: string[] = [];
			let sent = 0;
			const shown = shouldShowComparisonAction.call(upcastPartial<IComparisonActionVisibilityHarness>({ _draftHost: host(slot) }));
			const result = await send.call({
				_draftHost: host(slot),
				_backgroundSendStatus: observableValue<string | undefined>('status', undefined),
				notificationService: { error: () => assert.fail('Unexpected error'), info: message => infos.push(message) },
				_pendingBackgroundSends: { set: () => { }, deleteAndDispose: () => { } },
				recentWorkspacesService: { restoreDismissedWorkspace: () => { } },
				newSessionComposerService: { notifyWillSendRequest: () => { } },
				_session: constObservable(upcastPartial<ISession>({ sessionId: 'draft' })),
				_feedbackItems: constObservable([]),
				_comparisonSelection: { enabled: constObservable(true) },
				_workspacePicker: { selectedFolderUri: URI.file('/workspace'), validateSelectedWorkspace: async () => true, clearAttachedContext: () => { }, showPicker: () => { } },
				_isQuickChatComposer: constObservable(false),
				agentFeedbackService: { removeFeedback: () => { } },
				sessionsManagementService: { onDidSendRequest: Event.None, sendNewChatRequest: async () => { sent++; } },
				logService: { error: () => { } },
				_getWorkspaceRoots: () => [],
			} satisfies ISendHarness, 'hello');

			assert.deepStrictEqual({ shown, result, sent, infos }, {
				shown: false, result: false, sent: 0, infos: ['Compare Agents is available from the new session in the main window.'],
			});
		});

		for (const outcome of ['dispatched', 'rejected'] as const) {
			test(`hands an Alt+Enter send to its host before sending it, and ${outcome === 'dispatched' ? 'clears its own status when the request fails' : 'cancels that when the send is rejected'}`, async () => {
				const replaced = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
				const ended = disposables.add(new Emitter<INewSessionRequestEndedEvent>());
				const pending = disposables.add(new DisposableMap<object, IDisposable>());
				const status = observableValue<string | undefined>('status', undefined);
				const slot = upcastPartial<INewSessionDraftSlot>({ id: 'slot' });
				const tracked: { send: INewSessionBackgroundSend; cancelled: boolean }[] = [];
				const errors: (string | Error)[] = [];
				const draft = upcastPartial<ISession>({ sessionId: 'draft' });
				const prepared = upcastPartial<ISession>({ sessionId: 'prepared' });
				const attachment = upcastPartial<IChatRequestVariableEntry>({ id: 'file', name: 'file' });
				let trackedWhenSent: number | undefined;
				const harness: ISendHarness = {
					_draftHost: host(slot, [], tracked),
					_backgroundSendStatus: status,
					_newChatInput: { hasInput: false },
					notificationService: { error: error => errors.push(error) },
					_pendingBackgroundSends: pending,
					recentWorkspacesService: { restoreDismissedWorkspace: () => { } },
					newSessionComposerService: { notifyWillSendRequest: () => { } },
					_session: constObservable(draft),
					_feedbackItems: constObservable([]),
					_comparisonSelection: { enabled: constObservable(false) },
					_workspacePicker: { selectedFolderUri: URI.file('/workspace'), validateSelectedWorkspace: async () => true, clearAttachedContext: () => { }, showPicker: () => { } },
					_isQuickChatComposer: constObservable(false),
					agentFeedbackService: { removeFeedback: () => { } },
					sessionsManagementService: {
						onDidSendRequest: Event.None,
						onDidReplaceNewDraftSession: replaced.event,
						onDidReplaceSession: Event.None,
						onDidEndNewSessionRequest: ended.event,
						sendNewChatRequest: async () => {
							trackedWhenSent = tracked.length;
							if (outcome === 'rejected') {
								throw new Error('rejected');
							}
						},
					},
					logService: { error: () => { } },
					_getWorkspaceRoots: () => [],
					_createNewSession: async () => { },
					_clearBackgroundSendOnFailure: (...args) => clearBackgroundSendOnFailure.apply(harness, args),
				};

				const result = await send.call(harness, 'hello', [attachment], true);
				status.set('Pending', undefined);
				const latest = tracked[0]?.send.isLatest();
				replaced.fire({ from: draft, to: prepared });
				ended.fire({ session: prepared, owner: upcastPartial<INewSessionDraftSlot>({ id: 'other' }), started: false, readopted: false, error: new Error('other') });
				const statusAfterOther = status.get();
				ended.fire({ session: prepared, owner: slot, started: false, readopted: false, error: new Error('setup failed') });

				assert.deepStrictEqual({
					result,
					trackedWhenSent,
					tracked: tracked.map(({ send, cancelled }) => ({ session: send.session.sessionId, query: send.query, attachedContext: send.attachedContext, cancelled })),
					latest,
					statusAfterOther,
					status: status.get(),
					pending: pending.size,
					errors: errors.length,
				}, outcome === 'dispatched' ? {
					result: true,
					trackedWhenSent: 1,
					tracked: [{ session: 'draft', query: 'hello', attachedContext: [attachment], cancelled: false }],
					latest: true,
					statusAfterOther: 'Pending',
					status: undefined,
					pending: 0,
					errors: 0,
				} : {
					result: false,
					trackedWhenSent: 1,
					tracked: [{ session: 'draft', query: 'hello', attachedContext: [attachment], cancelled: true }],
					latest: true,
					statusAfterOther: 'Pending',
					status: 'Pending',
					pending: 0,
					errors: 1,
				});
			});
		}

		test('reports each Alt+Enter request to its host once when it ends, as the latest send only while it is, also after the composer is gone, and nothing for a rejected send', async () => {
			const replaced = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
			const ended = disposables.add(new Emitter<INewSessionRequestEndedEvent>());
			const pending = disposables.add(new DisposableMap<object, IDisposable>());
			const status = observableValue<string | undefined>('status', undefined);
			const slot = upcastPartial<INewSessionDraftSlot>({ id: 'slot' });
			const managementEvents = {
				onDidReplaceNewDraftSession: replaced.event,
				onDidReplaceSession: Event.None,
				onDidEndNewSessionRequest: ended.event,
			};
			// A host as a chat window's composer model is: it follows each request for as long as the request runs, and
			// decides on recovery in its own end listener, which runs after the composer's.
			const outcomes: string[] = [];
			const hostTracking = disposables.add(new DisposableStore());
			const draftHost: INewSessionDraftHost = {
				slot,
				openStartedSession: async () => { },
				trackBackgroundSend: send => hostTracking.add(trackNewSessionRequestEnd(upcastPartial<ISessionsManagementService>(managementEvents), slot, send.session, event =>
					outcomes.push(`${send.query}: ${event.started ? 'started' : 'failed'}, latest ${send.isLatest()}`))),
			};
			let draft = upcastPartial<ISession>({ sessionId: 'first' });
			let reject = false;
			const harness: ISendHarness = {
				_draftHost: draftHost,
				_backgroundSendStatus: status,
				_newChatInput: { hasInput: false },
				notificationService: { error: () => { } },
				_pendingBackgroundSends: pending,
				recentWorkspacesService: { restoreDismissedWorkspace: () => { } },
				newSessionComposerService: { notifyWillSendRequest: () => { } },
				get _session() { return constObservable(draft); },
				_feedbackItems: constObservable([]),
				_comparisonSelection: { enabled: constObservable(false) },
				_workspacePicker: { selectedFolderUri: URI.file('/workspace'), validateSelectedWorkspace: async () => true, clearAttachedContext: () => { }, showPicker: () => { } },
				_isQuickChatComposer: constObservable(false),
				agentFeedbackService: { removeFeedback: () => { } },
				sessionsManagementService: {
					...managementEvents,
					onDidSendRequest: Event.None,
					sendNewChatRequest: async () => {
						if (reject) {
							throw new CancellationError();
						}
					},
				},
				logService: { error: () => { } },
				_getWorkspaceRoots: () => [],
				_createNewSession: async () => { },
				_clearBackgroundSendOnFailure: (...args) => clearBackgroundSendOnFailure.apply(harness, args),
			};
			const end = (sessionId: string, started: boolean, owner = slot) => ended.fire({ session: upcastPartial<ISession>({ sessionId }), owner, started, readopted: false });

			// The composer's latest send fails while the composer is alive and idle.
			await send.call(harness, 'first prompt', undefined, true);
			status.set('Pending', undefined);
			replaced.fire({ from: upcastPartial<ISession>({ sessionId: 'first' }), to: upcastPartial<ISession>({ sessionId: 'first-prepared' }) });
			end('first', false);
			end('first-prepared', false, upcastPartial<INewSessionDraftSlot>({ id: 'other' }));
			end('first-prepared', false);
			end('first-prepared', false);
			const statusAfterFailure = status.get();

			// A newer send, rejected before it is dispatched, then another one: the earlier sends are no longer the latest.
			draft = upcastPartial<ISession>({ sessionId: 'second' });
			await send.call(harness, 'second prompt', undefined, true);
			draft = upcastPartial<ISession>({ sessionId: 'rejected' });
			reject = true;
			await send.call(harness, 'rejected prompt', undefined, true);
			reject = false;
			draft = upcastPartial<ISession>({ sessionId: 'third' });
			await send.call(harness, 'third prompt', undefined, true);
			end('second', false);

			// The composer is gone: its own listeners go with it, and none of its sends is its latest anymore.
			pending.dispose();
			harness._lastBackgroundSendOptions = undefined;
			end('rejected', false);
			end('third', false);

			assert.deepStrictEqual({ outcomes, statusAfterFailure }, {
				outcomes: [
					'first prompt: failed, latest true',
					'second prompt: failed, latest false',
					'third prompt: failed, latest false',
				],
				statusAfterFailure: undefined,
			});
		});

		test('typing in the composer ends the eligibility of its latest Alt+Enter send', () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IHoverService, NullHoverService);
			instantiationService.stub(IOpenerService, {});
			const changed = disposables.add(new Emitter<void>());
			let hasInput = false;
			const sendOptions: ISendRequestOptions = { query: 'sent' };
			const harness = {
				_draftHost: upcastPartial<INewSessionDraftHost>({}),
				_backgroundSendStatus: observableValue<string | undefined>('status', undefined),
				_lastBackgroundSendOptions: sendOptions as ISendRequestOptions | undefined,
				_newChatInput: { onDidChangeInput: changed.event, get hasInput() { return hasInput; } },
				accessibilityService: { status: () => { } },
				instantiationService,
				_register: <T extends IDisposable>(value: T) => disposables.add(value),
			};
			const render = Reflect.get(NewChatWidget.prototype, '_renderBackgroundSendStatus') as (this: typeof harness, container: HTMLElement) => void;
			render.call(harness, $('div'));
			changed.fire();
			const whileEmpty = harness._lastBackgroundSendOptions === sendOptions;
			hasInput = true;
			changed.fire();

			assert.deepStrictEqual({ whileEmpty, afterTyping: harness._lastBackgroundSendOptions === sendOptions }, { whileEmpty: true, afterTyping: false });
		});

		suite('requested target', () => {

			/** A provider that offers only the model `available`. */
			const sessionsProvidersService = {
				getProvider: () => ({ getModelsSnapshotForCreation: (_workspace: URI | undefined, _sessionTypeId: string, modelId?: string) => ({ desiredModelResolution: { kind: modelId === 'available' ? 'available' : 'unavailable' } }) }),
			};

			function seedHarness(target: INewSessionTarget | undefined) {
				const calls: unknown[] = [];
				const harness = {
					_workspacePicker: {
						selectedFolderUri: URI.file('/last'),
						setSelectedWorkspace: (folderUri: URI, options: object) => calls.push({ select: folderUri.path, options }),
					},
					_syncWorkspacePickerFromActiveSession: () => false,
					_draftHost: target && { requestedTarget: constObservable(target) },
					sessionsProvidersService,
					_createNewSession: async (folderUri: URI, pick?: IPreferredSessionType) => { calls.push({ create: folderUri.path, pick }); },
					_selectRequestedNoWorkspace: (requested: INewSessionTarget) => { calls.push({ noWorkspace: requested }); },
					_restoreNoWorkspaceDraft: async () => { calls.push('restore no workspace'); },
					_seedRequestedTarget: (requested: INewSessionTarget) => seedRequestedTarget.call(harness, requested),
				};
				seedWorkspaceDraft.call(harness);
				return calls;
			}

			test('a draft starts from the requested target, not from the main composer\'s last workspace', () => {
				assert.deepStrictEqual({
					folder: seedHarness({ folderUri: URI.file('/inherited'), providerId: 'p', sessionTypeId: 't', modelId: 'available', modeId: 'ask' }),
					noWorkspace: seedHarness({ providerId: 'p', sessionTypeId: 't', modelId: 'available', modeId: 'ask' }),
					notHosted: seedHarness(undefined),
				}, {
					folder: [
						{ select: '/inherited', options: { fireEvent: false, providerId: 'p', persist: false, origin: WorkspaceSelectionOrigin.RestoredDraft } },
						{ create: '/inherited', pick: { providerId: 'p', sessionTypeId: 't' } },
					],
					noWorkspace: [{ noWorkspace: { providerId: 'p', sessionTypeId: 't', modelId: 'available', modeId: 'ask' } }],
					notHosted: [{ create: '/last', pick: undefined }],
				});
			});

			/** An agent whose drafts start on the model `default` and offer the model `available`; its log names what it creates and is set. */
			class ModelProvider extends mock<IAgentHostSessionsProvider>() {
				override readonly label = 'Agent';
				override readonly icon = Codicon.copilot;
				override readonly order = 0;
				override readonly supportsQuickChats = true;
				override readonly sessionTypes: ISessionsProvider['sessionTypes'];
				override readonly onDidChangeSessions = Event.None;
				/** Announces that the folders it serves changed ({@link served}). */
				readonly typesChanged = new Emitter<void>();
				override readonly onDidChangeSessionTypes = this.typesChanged.event;
				override readonly onDidMoveChat = Event.None;
				/** Whether it can serve a folder, as an agent host can only once it connected; all folders by default. */
				served: (folderUri: URI) => boolean = () => true;
				/** The GitHub repository (`owner/repo`) of the folders it serves, whose drafts it makes of that repository, as the Copilot provider's cloud agent does. */
				repository: string | undefined;
				readonly log: string[] = [];
				private _count = 0;
				private readonly _models = new Map<string, { readonly modelId: ISettableObservable<string | undefined>; readonly source: ISettableObservable<ChatModelSource | undefined>; readonly mode: ISettableObservable<{ readonly id: string; readonly kind: string } | undefined> }>();
				/** The custom agents its drafts offer; {@link agentsChanged} announces a change, as an agent host does once it publishes them. */
				agents: readonly string[] = [];
				/** Other URIs of its custom agents, such as the client's URI of an agent it published. */
				readonly aliases = new Map<string, string>();
				readonly agentsChanged = new Emitter<void>();
				override readonly onDidChangeCustomAgents = this.agentsChanged.event;

				constructor(override readonly id: string, types: readonly string[]) {
					super();
					this.sessionTypes = types.map(type => ({ id: type, label: type, icon: Codicon.copilot, authRequirement: SessionTypeAuthRequirement.GitHub }));
				}

				override getSessions(): ISession[] { return []; }
				override getSessionTypes(folderUri: URI): ISessionsProvider['sessionTypes'][number][] { return this.served(folderUri) ? [...this.sessionTypes] : []; }
				override resolveWorkspace(folderUri: URI): ISessionWorkspace | undefined {
					if (!this.served(folderUri)) {
						return undefined;
					}
					const [owner, repo] = this.repository?.split('/') ?? [];
					const gitRepository = owner ? upcastPartial<ISessionGitRepository>({ gitHubInfo: constObservable({ owner, repo }) }) : undefined;
					return upcastPartial<ISessionWorkspace>({ uri: folderUri, label: 'folder', group: SESSION_WORKSPACE_GROUP_LOCAL, folders: gitRepository ? [{ root: folderUri, workingDirectory: folderUri, name: folderUri.path, description: undefined, gitRepository }] : [], requiresWorkspaceTrust: false });
				}
				override getModelsSnapshotForCreation(_folderUri: URI | undefined, _sessionTypeId: string, modelId?: string): ISessionModelsSnapshot {
					return { models: [], modelTarget: undefined, desiredModelResolution: { kind: modelId === 'available' ? 'available' : 'notRequested' } as ISessionModelsSnapshot['desiredModelResolution'] };
				}
				override createNewSession(folderUri: URI, sessionTypeId: string, options?: ISessionsProviderCreateSessionOptions): ISession { return this._draft(sessionTypeId, false, options, folderUri); }
				override createQuickChat(sessionTypeId: string, options?: ISessionsProviderCreateSessionOptions): ISession { return this._draft(sessionTypeId, true, options); }
				override deleteNewSession(): void { }
				override preferDevContainer(sessionId: string, options?: { readonly required?: boolean }): void { this.log.push(`devContainer ${sessionId}${options?.required ? ' required' : ''}`); }
				/** The drafts that run in a Dev Container. */
				readonly inDevContainer = new Set<string>();
				override isDevContainerRequested(sessionId: string): boolean { return this.inDevContainer.has(sessionId); }
				/** Holds the chat of a send until it settles, which fails it by default, as an agent that cannot start it does. */
				chatOfSend: () => Promise<IChat> = () => Promise.reject(new Error('no agent'));
				override createNewChat(): Promise<IChat> { return this.chatOfSend(); }
				override getCustomAgents(): readonly AgentCustomization[] { return this.agents.map(uri => upcastPartial<AgentCustomization>({ uri, name: `name of ${uri}` })); }
				override resolveCustomAgent(_sessionId: string, uri: string): AgentCustomization | undefined { return this.getCustomAgents().find(agent => agent.uri === (this.aliases.get(uri) ?? uri)); }
				/** Binds the selected custom agent of `sessionId` again under `uri`, as an agent host does once it publishes it. */
				rebind(sessionId: string, uri: string): void { this._models.get(sessionId)!.mode.set({ id: uri, kind: 'agent' }, undefined); }
				override setAgent(sessionId: string, agent: ISessionAgentRef | undefined): void {
					this.log.push(`setAgent ${sessionId} ${agent ? `${agent.uri} (${agent.name})` : 'none'}`);
					this._models.get(sessionId)!.mode.set(agent ? { id: agent.uri, kind: 'agent' } : undefined, undefined);
				}
				override setModel(sessionId: string, _chat: URI, modelId: string, source: ChatModelSource): void {
					this.log.push(`setModel ${sessionId} ${modelId} ${source}`);
					const model = this._models.get(sessionId)!;
					transaction(tx => {
						model.modelId.set(modelId, tx);
						model.source.set(source, tx);
					});
				}

				private _workspaceOfDraft(folderUri: URI): ISessionWorkspace {
					const root = this.repository ? URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: `/${this.repository}/HEAD` }) : folderUri;
					return upcastPartial<ISessionWorkspace>({ uri: root, group: this.repository ? SESSION_WORKSPACE_GROUP_GITHUB : SESSION_WORKSPACE_GROUP_LOCAL, folders: [{ root, workingDirectory: root, name: root.path, description: undefined }] });
				}

				private _draft(sessionTypeId: string, isQuickChat: boolean, options: ISessionsProviderCreateSessionOptions | undefined, folderUri?: URI): ISession {
					const sessionId = `${sessionTypeId}${++this._count}`;
					this.log.push(`create ${sessionId}${options?.modelId ? ` model ${options.modelId}` : ''}${options?.modeId ? ` mode ${options.modeId}` : ''}`);
					const modelId = observableValue<string | undefined>('modelId', 'default');
					const source = observableValue<ChatModelSource | undefined>('modelSource', ChatModelSource.CarriedOver);
					const mode = observableValue<{ readonly id: string; readonly kind: string } | undefined>('mode', undefined);
					this._models.set(sessionId, { modelId, source, mode });
					const chat = upcastPartial<IChat>({ resource: URI.parse(`test-chat:/${sessionId}`), modelId, modelSource: source });
					return upcastPartial<ISession>({
						sessionId, resource: URI.parse(`test-session:/${sessionId}`), providerId: this.id, sessionType: sessionTypeId, status: constObservable(SessionStatus.Untitled),
						mainChat: constObservable(chat), modelId, mode, isQuickChat: constObservable(isQuickChat),
						workspace: constObservable(folderUri && this._workspaceOfDraft(folderUri)),
					});
				}
			}

			/** The real management of drafts, with the agents `initial`; an agent registered later changes the session types. */
			function createAgents(initial: readonly ModelProvider[]) {
				const { instantiationService } = createSessionViewTestServices(disposables);
				instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
				instantiationService.stub(IUriIdentityService, { extUri });
				const providers = disposables.add(instantiationService.createInstance(SessionsProvidersService));
				for (const provider of initial) {
					disposables.add(provider.agentsChanged);
					disposables.add(provider.typesChanged);
					disposables.add(providers.registerProvider(provider));
				}
				instantiationService.stub(ISessionsProvidersService, providers);
				instantiationService.stub(IChatService, new class extends mock<IChatService>() {
					override readonly onDidSubmitRequest = Event.None;
				}());
				const management = disposables.add(instantiationService.createInstance(SessionsManagementService));
				const slot = disposables.add(management.createNewSessionSlot());
				const composerService = disposables.add(new NewSessionComposerService());
				const modelSelections = disposables.add(new Emitter<string>());
				/** The user selects `modelId` for `session` in the model picker, as `SessionModelSelection.selectModel` applies and reports it. */
				const userSelectsModel = (provider: ModelProvider, session: ISession, modelId: string) => {
					provider.setModel(session.sessionId, session.mainChat.get().resource, modelId, ChatModelSource.Chosen);
					modelSelections.fire(modelId);
				};
				/** The user selects `agent` for `session` in the agent picker, or clears it, as `AgentHostAgentPickerContribution` reports and applies it. */
				const userSelectsAgent = (provider: ModelProvider, session: ISession, agent: ISessionAgentRef | undefined) => {
					composerService.notifyUserAgentSelection({ sessionId: session.sessionId, agent });
					provider.setAgent(session.sessionId, agent);
				};
				return { management, providers, slot, composerService, userSelectsAgent, modelSelections, userSelectsModel, register: (provider: ModelProvider) => { disposables.add(provider.agentsChanged); disposables.add(provider.typesChanged); disposables.add(providers.registerProvider(provider)); } };
			}

			/** A hosted composer of the agents' slot, which creates its drafts through the real management as its widget does. */
			function hostedComposer(agents: ReturnType<typeof createAgents>, target: ISettableObservable<INewSessionTarget | undefined>, requested: string[] = []) {
				return withWidgetMethods({
					_detached: true,
					_draftSlot: agents.slot,
					_draftHost: {
						slot: agents.slot,
						requestedTarget: target,
						setRequestedTarget: (next: INewSessionTarget, reason: string) => {
							requested.push(`${reason}: ${next.folderUri?.path ?? 'no workspace'} ${next.providerId}/${next.sessionTypeId} ${next.modelId} ${next.modeId}`);
							target.set(next, undefined);
						},
					},
					_session: agents.slot.newSession,
					_environment: constObservable(undefined),
					_workspaceOptOutTarget: constObservable(undefined),
					_pendingPreferredUpgrade: disposables.add(new MutableDisposable()),
					_pendingRequestedAgent: disposables.add(new MutableDisposable()),
					_applyingRequestedSelection: undefined,
					_newSessionCreation: disposables.add(new MutableDisposable()),
					_isWorkspacePickerQuickChat: constObservable(false),
					_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => undefined }, onDidSelectModel: agents.modelSelections.event },
					_workspacePicker: { selectedResolved: undefined, selectedFolderUri: undefined as URI | undefined, selectNoWorkspace: () => { }, ...workspaceIdentity(agents.providers) },
					sessionsManagementService: agents.management,
					sessionsProvidersService: agents.providers,
					newSessionComposerService: agents.composerService,
					// On the web, no agent host restricts which agents create drafts.
					agentHostFilterService: { selectedHost: undefined },
					// As the sessions service creates a draft of a slot (`openNewSession`).
					sessionsService: { openNewSession: async (options: IOpenNewSessionOptions) => ({ session: options.draftSlot!.createNewSession(options.folderUri!, options), trustDeclined: false }) },
					_isPreferredServable: () => true,
					_requestsDevContainer: () => false,
					logService: { error: (message: string) => assert.fail(message), trace: () => { } },
				}, ['_trackUserModelSelections', '_trackUserAgentSelections', '_applyRequestedSelection', '_isSameCustomAgent', '_applyRequestedAgent', '_waitForRequestedAgent', '_applyRequestedModel', '_isRequestedAgent', 'selectNoWorkspace', '_selectNoWorkspaceByUser', '_openQuickChat', '_createQuickChat', '_selectRequestedNoWorkspace', '_scheduleRequestedNoWorkspaceUpgrade', '_resumeRequestedTargetUpgrade', '_requestTarget']);
			}

			const modelOf = (session: ISession | undefined) => session && `${session.sessionId} ${session.mainChat.get().modelId.get()} ${session.mainChat.get().modelSource.get()}`;

			test('a draft of the requested agent gets the requested model through its agent, for a folder and for No Workspace, and a draft of another agent its default model', async () => {
				const provider = new ModelProvider('p', ['t', 'other']);
				const agents = createAgents([provider]);
				const folder = URI.file('/project');
				const target = observableValue<INewSessionTarget | undefined>('target', { folderUri: folder, providerId: 'p', sessionTypeId: 't', modelId: 'available', modeId: 'ask' });
				const composer = hostedComposer(agents, target);

				const folderDraft = (await createSessionNow.call(composer as unknown as ICreateSessionNowHarness, folder, { providerId: 'p', sessionTypeId: 't' }, CancellationToken.None)).session;
				const folderModel = modelOf(folderDraft);
				const otherAgent = (await createSessionNow.call(composer as unknown as ICreateSessionNowHarness, folder, { providerId: 'p', sessionTypeId: 'other' }, CancellationToken.None)).session;
				const otherModel = modelOf(otherAgent);
				target.set({ providerId: 'p', sessionTypeId: 't', modelId: 'available', modeId: 'ask' }, undefined);
				composer._selectRequestedNoWorkspace(target.get());

				assert.deepStrictEqual({ models: [folderModel, otherModel, modelOf(agents.slot.newSession.get())], log: provider.log }, {
					models: ['t1 available chosen', 'other2 default carriedOver', 't3 available chosen'],
					log: ['create t1', 'setModel t1 available chosen', 'create other2', 'create t3', 'setModel t3 available chosen'],
				});
			});

			test('a composer whose requested No Workspace agent is unavailable uses the agent available instead, and creates the requested draft once its agent arrives, with what was requested since; the main composer\'s restore leaves it alone', async () => {
				const fallback = new ModelProvider('fallback', ['f']);
				const agents = createAgents([fallback]);
				const target = observableValue<INewSessionTarget | undefined>('target', { providerId: 'p', sessionTypeId: 't', modelId: 'available', modeId: 'ask' });
				const composer = hostedComposer(agents, target);
				const tracking = combinedDisposable(composer._trackUserModelSelections() as IDisposable, composer._trackUserAgentSelections() as IDisposable);

				composer._selectRequestedNoWorkspace(target.get());
				const waiting = agents.slot.newSession.get()?.sessionId;
				// The stand-in's picker selects the agent it remembers, whose own model its agent then chooses: no user's choice.
				fallback.setAgent('f1', { uri: 'agent:/remembered', name: 'remembered' });
				fallback.setModel('f1', URI.parse('test-chat:/f1'), 'remembered-model', ChatModelSource.Chosen);
				const stillRequested = target.get();
				await restoreNoWorkspaceDraft.call({ _draftHost: composer._draftHost } as unknown as IRestoreNoWorkspaceDraftHarness);
				const afterRestore = agents.slot.newSession.get()?.sessionId;
				// The user asks for another agent of the same host meanwhile.
				target.set({ providerId: 'p', sessionTypeId: 'u' }, undefined);
				const requestedAgent = new ModelProvider('p', ['t', 'u']);
				agents.register(requestedAgent);
				tracking.dispose();

				assert.deepStrictEqual({ waiting, stillRequested, afterRestore, arrived: agents.slot.newSession.get()?.sessionId, watching: !!composer._pendingPreferredUpgrade.value, log: [...fallback.log, ...requestedAgent.log] }, {
					waiting: 'f1', stillRequested: { providerId: 'p', sessionTypeId: 't', modelId: 'available', modeId: 'ask' }, afterRestore: 'f1', arrived: 'u1', watching: false,
					log: ['create f1', 'setAgent f1 agent:/remembered (remembered)', 'setModel f1 remembered-model chosen', 'create u1'],
				});
			});

			test('the user\'s model and custom agent picks replace the requested ones, also on a draft of the agent used instead of the requested one, which then stops waiting for it; what its agent selects on its own, such as its default or its custom agent\'s model, is no pick', () => {
				const provider = new ModelProvider('fallback', ['f']);
				const agents = createAgents([provider]);
				const requested: string[] = [];
				const target = observableValue<INewSessionTarget | undefined>('target', { providerId: 'p', sessionTypeId: 't', modelId: 'available', modeId: 'ask' });
				const composer = hostedComposer(agents, target, requested);
				composer._selectRequestedNoWorkspace(target.get());
				const draft = agents.slot.newSession.get()!;
				provider.setAgent(draft.sessionId, { uri: 'agent', name: 'agent' });
				const tracking = combinedDisposable(composer._trackUserModelSelections() as IDisposable, composer._trackUserAgentSelections() as IDisposable);
				const watchingBefore = !!composer._pendingPreferredUpgrade.value;
				// The draft's agent reports another default model, and chooses its custom agent's model: no picks.
				provider.setModel(draft.sessionId, draft.mainChat.get().resource, 'other-default', ChatModelSource.CarriedOver);
				provider.setModel(draft.sessionId, draft.mainChat.get().resource, 'agent-model', ChatModelSource.Chosen);
				const afterDefault = [...requested];
				agents.userSelectsModel(provider, draft, 'picked');
				agents.userSelectsAgent(provider, draft, { uri: 'plan', name: 'plan' });
				const watchingAfter = !!composer._pendingPreferredUpgrade.value;
				agents.register(new ModelProvider('p', ['t']));
				tracking.dispose();

				assert.deepStrictEqual({ watchingBefore, afterDefault, requested, watchingAfter, draft: agents.slot.newSession.get()?.sessionId }, {
					watchingBefore: true,
					afterDefault: [],
					requested: ['user: no workspace fallback/f picked agent', 'user: no workspace fallback/f picked plan'],
					watchingAfter: false,
					draft: 'f1',
				});
			});

			const draftOf = (session: ISession | undefined) => session && `${session.sessionId} ${session.mainChat.get().modelId.get()} ${session.mode.get()?.id ?? 'no agent'}`;

			test('the user\'s No Workspace choices, from its option and its agents, are what a composer requests: with the agent of the draft it then has, and that draft gets the model and custom agent requested before of the same agent', () => {
				const local = new ModelProvider(LOCAL_AGENT_HOST_PROVIDER_ID, ['t']);
				local.agents = ['agent:/x'];
				const remote = Object.assign(new ModelProvider(`${REMOTE_AGENT_HOST_PROVIDER_PREFIX}remote`, ['r']), { order: 1 });
				const agents = createAgents([local, remote]);
				const requested: string[] = [];
				const target = observableValue<INewSessionTarget | undefined>('target', { folderUri: URI.file('/inherited'), providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 't', modelId: 'available', modeId: 'agent:/x' });
				const composer = withWidgetMethods(hostedComposer(agents, target, requested), ['_getNoWorkspaceOption']);
				const option = composer._getNoWorkspaceOption() as IWorkspacePickerNoWorkspaceOption | undefined;
				if (isWeb) {
					// The web offers no No Workspace option.
					assert.deepStrictEqual({ option, requested }, { option: undefined, requested: [] });
					return;
				}
				option!.select();
				const sameAgent = draftOf(agents.slot.newSession.get());
				option!.submenuActions![1].run();

				assert.deepStrictEqual({ requested, sameAgent, otherAgent: draftOf(agents.slot.newSession.get()) }, {
					requested: [
						`user: no workspace ${LOCAL_AGENT_HOST_PROVIDER_ID}/t available agent:/x`,
						`user: no workspace ${REMOTE_AGENT_HOST_PROVIDER_PREFIX}remote/r undefined undefined`,
					],
					sameAgent: 't1 available agent:/x',
					otherAgent: 'r1 default no agent',
				});
			});

			test('the custom agent of the requested target is the chat\'s mode: it is selected on a draft of the requested agent once the agent offers it, never sent as the session mode of its creation, and the requested model stays; an agent that is not offered leaves the draft as it starts', () => {
				const provider = new ModelProvider(LOCAL_AGENT_HOST_PROVIDER_ID, ['t']);
				const agents = createAgents([provider]);
				const requested: string[] = [];
				const target = observableValue<INewSessionTarget | undefined>('target', { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 't', modelId: 'available', modeId: 'agent:/x' });
				const composer = hostedComposer(agents, target, requested);
				const tracking = combinedDisposable(composer._trackUserModelSelections() as IDisposable, composer._trackUserAgentSelections() as IDisposable);

				// Offered when the draft is created.
				provider.agents = ['agent:/x'];
				composer._selectRequestedNoWorkspace(target.get());
				const offered = draftOf(agents.slot.newSession.get());
				// Offered only once the agent lists its custom agents: what the draft selects meanwhile, such as the picker's
				// remembered agent, is what it starts with.
				provider.agents = [];
				composer._selectRequestedNoWorkspace(target.get());
				const waiting = agents.slot.newSession.get()!;
				provider.setAgent(waiting.sessionId, { uri: 'agent:/remembered', name: 'remembered' });
				provider.agents = ['agent:/remembered', 'agent:/x'];
				provider.agentsChanged.fire();
				const late = draftOf(waiting);
				// Not offered by the agent: the draft keeps what it starts with.
				provider.agents = [];
				composer._selectRequestedNoWorkspace(target.get());
				const unoffered = agents.slot.newSession.get()!;
				provider.agents = ['agent:/other'];
				provider.agentsChanged.fire();
				tracking.dispose();

				assert.deepStrictEqual({ offered, late, unoffered: draftOf(unoffered), requested, log: provider.log }, {
					offered: 't1 available agent:/x',
					late: 't2 available agent:/x',
					unoffered: 't3 available no agent',
					requested: [],
					log: [
						'create t1', 'setAgent t1 agent:/x (name of agent:/x)', 'setModel t1 available chosen',
						'create t2', 'setModel t2 available chosen', 'setAgent t2 agent:/remembered (remembered)', 'setAgent t2 agent:/x (name of agent:/x)',
						'create t3', 'setModel t3 available chosen',
					],
				});
			});

			test('clearing the custom agent of a draft is the user\'s pick of the agent\'s default, which its next draft keeps; the model stays; the same custom agent bound again under another URI is no pick', () => {
				const provider = new ModelProvider(LOCAL_AGENT_HOST_PROVIDER_ID, ['t']);
				provider.agents = ['agent:/x'];
				provider.aliases.set('client:/x', 'agent:/x');
				const agents = createAgents([provider]);
				const requested: string[] = [];
				const target = observableValue<INewSessionTarget | undefined>('target', { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 't', modelId: 'available', modeId: 'agent:/x' });
				const composer = hostedComposer(agents, target, requested);
				const tracking = combinedDisposable(composer._trackUserModelSelections() as IDisposable, composer._trackUserAgentSelections() as IDisposable);
				composer._selectRequestedNoWorkspace(target.get());
				const draft = agents.slot.newSession.get()!;
				const selected = draftOf(draft);
				provider.rebind(draft.sessionId, 'client:/x');
				const afterRebind = [...requested];
				agents.userSelectsAgent(provider, draft, undefined);
				composer._selectRequestedNoWorkspace(target.get());
				tracking.dispose();

				assert.deepStrictEqual({ selected, afterRebind, requested, next: draftOf(agents.slot.newSession.get()) }, {
					selected: 't1 available agent:/x',
					afterRebind: [],
					requested: [`user: no workspace ${LOCAL_AGENT_HOST_PROVIDER_ID}/t available undefined`],
					next: 't2 available no agent',
				});
			});

			test('the user\'s custom agent pick or clear while the composer waits for the requested custom agent is the user\'s: the wait ends, and the requested agent arriving later changes nothing', () => {
				const provider = new ModelProvider(LOCAL_AGENT_HOST_PROVIDER_ID, ['t']);
				const agents = createAgents([provider]);
				const requested: string[] = [];
				const target = observableValue<INewSessionTarget | undefined>('target', { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 't', modelId: 'available', modeId: 'agent:/x' });
				const composer = hostedComposer(agents, target, requested);
				const tracking = combinedDisposable(composer._trackUserModelSelections() as IDisposable, composer._trackUserAgentSelections() as IDisposable);
				provider.agents = ['agent:/y'];

				composer._selectRequestedNoWorkspace(target.get());
				const picking = agents.slot.newSession.get()!;
				agents.userSelectsAgent(provider, picking, { uri: 'agent:/y', name: 'y' });
				provider.agents = ['agent:/x', 'agent:/y'];
				provider.agentsChanged.fire();
				const picked = { draft: draftOf(picking), requested: [...requested] };

				provider.agents = ['agent:/y'];
				target.set({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 't', modelId: 'available', modeId: 'agent:/x' }, undefined);
				requested.length = 0;
				composer._selectRequestedNoWorkspace(target.get());
				const clearing = agents.slot.newSession.get()!;
				// The picker selects the agent it remembers on its own, then the user clears it.
				provider.setAgent(clearing.sessionId, { uri: 'agent:/y', name: 'y' });
				agents.userSelectsAgent(provider, clearing, undefined);
				provider.agents = ['agent:/x', 'agent:/y'];
				provider.agentsChanged.fire();
				tracking.dispose();

				assert.deepStrictEqual({ picked, cleared: { draft: draftOf(clearing), requested } }, {
					picked: { draft: 't1 available agent:/y', requested: [`user: no workspace ${LOCAL_AGENT_HOST_PROVIDER_ID}/t available agent:/y`] },
					cleared: { draft: 't2 available no agent', requested: [`user: no workspace ${LOCAL_AGENT_HOST_PROVIDER_ID}/t available undefined`] },
				});
			});

			for (const listedBy of ['remount', 'later'] as const) {
				test(`a composer shown again with its kept draft of the requested agent applies the requested custom agent it waited for, once its agent lists it (${listedBy}), without replacing the draft`, () => {
					const provider = new ModelProvider(LOCAL_AGENT_HOST_PROVIDER_ID, ['t']);
					const agents = createAgents([provider]);
					const target = observableValue<INewSessionTarget | undefined>('target', { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 't', modelId: 'available', modeId: 'agent:/x' });
					const first = hostedComposer(agents, target);
					first._selectRequestedNoWorkspace(target.get());
					// Its view goes, and with it what it waited for; a new view shows the draft its slot kept.
					first._pendingRequestedAgent.clear();
					if (listedBy === 'remount') {
						provider.agents = ['agent:/x'];
						provider.agentsChanged.fire();
					}
					const remounted = Object.assign(hostedComposer(agents, target), { _syncWorkspacePickerFromActiveSession: () => true });
					seedWorkspaceDraft.call(remounted);
					if (listedBy === 'later') {
						provider.agents = ['agent:/x'];
						provider.agentsChanged.fire();
					}

					assert.deepStrictEqual({ draft: draftOf(agents.slot.newSession.get()), log: provider.log }, {
						draft: 't1 available agent:/x',
						log: ['create t1', 'setModel t1 available chosen', 'setAgent t1 agent:/x (name of agent:/x)'],
					});
				});
			}

			test('a composer shown again with the No Workspace draft of the agent used instead of the requested one waits for the requested agent again, without replacing its draft meanwhile', () => {
				const fallback = new ModelProvider('fallback', ['f']);
				const agents = createAgents([fallback]);
				const target = observableValue<INewSessionTarget | undefined>('target', { providerId: 'p', sessionTypeId: 't' });
				const first = hostedComposer(agents, target);
				first._selectRequestedNoWorkspace(target.get());
				// Its view goes, and with it what it waited for; a new view shows the draft its slot kept.
				first._pendingPreferredUpgrade.clear();
				const remounted = Object.assign(hostedComposer(agents, target), { _syncWorkspacePickerFromActiveSession: () => true });
				seedWorkspaceDraft.call(remounted);
				const kept = agents.slot.newSession.get()?.sessionId;
				const requestedAgent = new ModelProvider('p', ['t']);
				agents.register(requestedAgent);

				assert.deepStrictEqual({ kept, upgraded: agents.slot.newSession.get()?.sessionId, log: [...fallback.log, ...requestedAgent.log] }, {
					kept: 'f1', upgraded: 't1', log: ['create f1', 'create t1'],
				});
			});

			for (const granted of [true, false]) {
				test(`a composer shown again with the draft of another workspace than the one the user chose, as its first view went while its trust was asked, ${granted ? 'creates the chosen workspace\'s draft once trusted, rather than sending to the kept one' : 'stays with the kept draft, which it requests again, once its trust is declined'}`, async () => {
					const provider = new ModelProvider('p', ['t']);
					const agents = createAgents([provider]);
					const a = URI.file('/a');
					const b = URI.file('/b');
					const requested: string[] = [];
					const target = observableValue<INewSessionTarget | undefined>('target', { folderUri: a, providerId: 'p', sessionTypeId: 't' });
					// The trust of a folder, which the sessions service asks before it creates its draft, and the user answers.
					const trusted = new Set<string>([a.path]);
					const trustRequests: DeferredPromise<boolean>[] = [];
					// The input its host keeps for it across its views.
					const input = new ComposerInputSnapshot({ input: { inputText: 'keep me', attachments: [] } });
					const composerOf = () => withWidgetMethods(Object.assign(hostedComposer(agents, target, requested), {
						_workspaceOptOutEnabled: constObservable(false),
						_preferredDevContainerFolderUri: undefined,
						_pendingWorkspaceCreation: undefined,
						_createdSessionId: undefined,
						_store: { isDisposed: false },
						uriIdentityService: { extUri },
						_isCurrentWorkspaceSelection: () => false,
						_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => undefined, getUserPickedSessionType: () => undefined }, onDidSelectModel: agents.modelSelections.event, preparePromptOptionsRefresh: () => false, showPromptOptions: () => { }, focus: () => { } },
						_workspacePicker: { selectedResolved: undefined, selectedFolderUri: a, selections: [] as string[], setSelectedWorkspace(folderUri: URI, options: { readonly persist?: boolean }) { this.selections.push(`${folderUri.path}${options.persist === false ? '' : ' persisted'}`); }, removeFromRecents: () => { }, ...workspaceIdentity(agents.providers) },
						sessionsService: {
							// As `SessionsService.openNewSession`: a cancelled open creates nothing, also once trusted.
							openNewSession: async (options: IOpenNewSessionOptions, token: CancellationToken) => {
								const folderUri = options.folderUri!;
								if (!trusted.has(folderUri.path)) {
									const request = new DeferredPromise<boolean>();
									trustRequests.push(request);
									if (!await request.p) {
										return token.isCancellationRequested ? { session: undefined, trustDeclined: false } : { session: undefined, trustDeclined: true };
									}
									trusted.add(folderUri.path);
								}
								return token.isCancellationRequested ? { session: undefined, trustDeclined: false } : { session: options.draftSlot!.createNewSession(folderUri, options), trustDeclined: false };
							},
						},
					}), ['_handleWorkspaceSelection', '_onWorkspaceSelected', '_createNewSession', '_createSessionNow', '_applyPreferredDevContainer', '_seedWorkspaceDraft', '_reopenRequestedWorkspace']);

					const first = composerOf();
					Object.assign(first._draftHost, { input });
					await first._createNewSession(a, { providerId: 'p', sessionTypeId: 't' });
					// The user picks B; its view goes while B's trust is asked, which the user answers only then.
					const picking = first._handleWorkspaceSelection(b) as Promise<void>;
					await timeout(0);
					first._newSessionCreation.clear();
					first._pendingPreferredUpgrade.clear();
					trustRequests[0].complete(granted);
					await picking;
					const kept = agents.slot.newSession.get()?.workspace.get()?.folders[0]?.root.path;
					// A new view of the composer, with the draft its slot kept.
					const remounted = Object.assign(composerOf(), { _syncWorkspacePickerFromActiveSession: () => true });
					Object.assign(remounted._draftHost, { input });
					remounted._seedWorkspaceDraft();
					await timeout(0);
					trustRequests[1]?.complete(granted);
					await timeout(0);
					// Agents change later: a declined trust is not asked again.
					agents.register(new ModelProvider('q', ['t']));
					await timeout(0);

					assert.deepStrictEqual({ kept, trustAsked: trustRequests.length, draft: agents.slot.newSession.get()?.workspace.get()?.folders[0]?.root.path, requested, selections: remounted._workspacePicker.selections, input: input.get() }, granted ? {
						kept: '/a', trustAsked: 1, draft: '/b', requested: ['user: /b p/t undefined undefined'], selections: ['/b'], input: { input: { inputText: 'keep me', attachments: [] } },
					} : {
						kept: '/a', trustAsked: 2, draft: '/a', requested: ['user: /b p/t undefined undefined', 'user: /a p/t undefined undefined'], selections: ['/b', '/a'], input: { input: { inputText: 'keep me', attachments: [] } },
					});
				});
			}

			test('a composer shown again with the draft of another workspace than the one the user chose, which its agent cannot serve yet, keeps the kept draft only until the agent serves the chosen workspace, then creates its draft', async () => {
				const provider = new ModelProvider('p', ['t']);
				const a = URI.file('/a');
				const b = URI.file('/b');
				let servesB = false;
				provider.served = folderUri => folderUri.path === a.path || servesB;
				const agents = createAgents([provider]);
				const target = observableValue<INewSessionTarget | undefined>('target', { folderUri: a, providerId: 'p', sessionTypeId: 't' });
				const input = new ComposerInputSnapshot({ input: { inputText: 'keep me', attachments: [] } });
				const composerOf = () => withWidgetMethods(Object.assign(hostedComposer(agents, target), {
					_preferredDevContainerFolderUri: undefined,
					_pendingWorkspaceCreation: undefined,
					_createdSessionId: undefined,
					uriIdentityService: { extUri },
					_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => undefined, getUserPickedSessionType: () => undefined }, onDidSelectModel: agents.modelSelections.event },
					_workspacePicker: { selectedResolved: undefined, selectedFolderUri: a, selections: [] as string[], setSelectedWorkspace(folderUri: URI, options: { readonly persist?: boolean }) { this.selections.push(`${folderUri.path}${options.persist === false ? '' : ' persisted'}`); }, ...workspaceIdentity(agents.providers) },
					sessionsService: {
						// As `SessionsService.openNewSession` for a draft slot: a folder no provider can serve leaves the slot's draft.
						openNewSession: async (options: IOpenNewSessionOptions) => {
							try {
								return { session: options.draftSlot!.createNewSession(options.folderUri!, options), trustDeclined: false };
							} catch {
								return { session: options.draftSlot!.newSession.get(), trustDeclined: false };
							}
						},
						openSession: async () => assert.fail('A hosted composer must not change the grid'),
					},
				}), ['_createNewSession', '_createSessionNow', '_applyPreferredDevContainer', '_seedWorkspaceDraft', '_reopenRequestedWorkspace', '_isPreferredServable', '_scheduleRecreateOnProviderChange', '_recreateOnProviderChange']);

				const first = composerOf();
				Object.assign(first._draftHost, { input });
				await first._createNewSession(a, { providerId: 'p', sessionTypeId: 't' });
				// The user chose B, whose draft its first view did not get to create.
				first._pendingPreferredUpgrade.clear();
				target.set({ folderUri: b, providerId: 'p', sessionTypeId: 't' }, undefined);
				const remounted = Object.assign(composerOf(), { _syncWorkspacePickerFromActiveSession: () => true });
				Object.assign(remounted._draftHost, { input });
				remounted._seedWorkspaceDraft();
				await timeout(0);
				const whileUnserved = agents.slot.newSession.get()?.workspace.get()?.folders[0]?.root.path;
				servesB = true;
				provider.typesChanged.fire();
				await timeout(0);

				assert.deepStrictEqual({ whileUnserved, draft: agents.slot.newSession.get()?.workspace.get()?.folders[0]?.root.path, requested: target.get()?.folderUri?.path, selections: remounted._workspacePicker.selections, input: input.get(), log: provider.log }, {
					whileUnserved: '/a', draft: '/b', requested: '/b', selections: ['/b'], input: { input: { inputText: 'keep me', attachments: [] } }, log: ['create t1', 'create t2'],
				});
			});

			test('a composer shown again with a cloud agent\'s draft of the requested folder, which is of the folder\'s GitHub repository, keeps it, also when its agent changes', async () => {
				const provider = new ModelProvider('cloud', ['t']);
				provider.repository = 'owner/repo';
				const agents = createAgents([provider]);
				const folder = URI.file('/project');
				const target = observableValue<INewSessionTarget | undefined>('target', { folderUri: folder, providerId: 'cloud', sessionTypeId: 't' });
				const composerOf = () => withWidgetMethods(Object.assign(hostedComposer(agents, target), {
					_preferredDevContainerFolderUri: undefined,
					_pendingWorkspaceCreation: undefined,
					_createdSessionId: undefined,
					uriIdentityService: { extUri },
					_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => undefined, getUserPickedSessionType: () => undefined }, onDidSelectModel: agents.modelSelections.event },
					_workspacePicker: { selectedResolved: undefined, selectedFolderUri: folder, selections: [] as string[], setSelectedWorkspace(folderUri: URI) { this.selections.push(folderUri.path); }, ...workspaceIdentity(agents.providers) },
					sessionsService: {
						openNewSession: async (options: IOpenNewSessionOptions) => ({ session: options.draftSlot!.createNewSession(options.folderUri!, options), trustDeclined: false }),
						openSession: async () => assert.fail('A hosted composer must not change the grid'),
					},
				}), ['_createNewSession', '_createSessionNow', '_applyPreferredDevContainer', '_seedWorkspaceDraft', '_reopenRequestedWorkspace', '_isPreferredServable', '_scheduleRecreateOnProviderChange', '_recreateOnProviderChange']);

				const first = composerOf();
				await first._createNewSession(folder, { providerId: 'cloud', sessionTypeId: 't' });
				first._pendingPreferredUpgrade.clear();
				const remounted = Object.assign(composerOf(), { _syncWorkspacePickerFromActiveSession: () => true });
				remounted._seedWorkspaceDraft();
				await timeout(0);
				provider.typesChanged.fire();
				await timeout(0);

				assert.deepStrictEqual({ draft: agents.slot.newSession.get()?.workspace.get()?.folders[0]?.root.toString(), selections: remounted._workspacePicker.selections, log: provider.log }, {
					draft: 'github-remote-file://github/owner/repo/HEAD', selections: [], log: ['create t1'],
				});
			});

			test('a composer whose requested folder runs in a Dev Container creates its drafts of that folder in one, also when seeded again after its view went and for the next draft after a background send; not for another folder, nor once the user picks the folder in another environment', async () => {
				const provider = new ModelProvider('local-agent-host', ['t']);
				const agents = createAgents([provider]);
				const a = URI.file('/a');
				const b = URI.file('/b');
				const target = observableValue<INewSessionTarget | undefined>('target', { folderUri: a, providerId: 'local-agent-host', sessionTypeId: 't', requireDevContainer: true });
				const composerOf = () => withWidgetMethods(Object.assign(hostedComposer(agents, target), {
					_preferredDevContainerFolderUri: undefined,
					_pendingWorkspaceCreation: undefined,
					_createdSessionId: undefined,
					uriIdentityService: { extUri },
					_isCurrentWorkspaceSelection: () => true,
					_workspaceOptOutEnabled: constObservable(false),
					_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => undefined, getUserPickedSessionType: () => undefined }, onDidSelectModel: agents.modelSelections.event, focus: () => { } },
					_workspacePicker: { selectedResolved: undefined, selectedFolderUri: a, setSelectedWorkspace: () => { }, ...workspaceIdentity(agents.providers) },
					sessionsService: {
						// As `SessionsService.openNewSession`: a draft that requires a Dev Container is created in one.
						openNewSession: async (options: IOpenNewSessionOptions) => {
							const session = options.draftSlot!.createNewSession(options.folderUri!, options);
							if (options.requireDevContainer) {
								provider.preferDevContainer(session.sessionId, { required: true });
							}
							return { session, trustDeclined: false };
						},
						openSession: async () => assert.fail('A hosted composer must not change the grid'),
					},
				}), ['_createNewSession', '_createSessionNow', '_applyPreferredDevContainer', '_seedRequestedTarget', '_reconcileWorkspaceEnvironment', '_requestsDevContainer', '_backgroundReseedTarget', '_handleWorkspaceSelection', '_isPreferredServable', '_scheduleRecreateOnProviderChange', '_recreateOnProviderChange']);

				const first = composerOf();
				first._seedRequestedTarget(target.get());
				await timeout(0);
				await first._createNewSession(b, { providerId: 'local-agent-host', sessionTypeId: 't' });
				// Its view goes; the next one seeds again from what its host requests.
				const remounted = composerOf();
				remounted._seedRequestedTarget(target.get());
				await timeout(0);
				const sent = agents.slot.newSession.get()!;
				const reseed = { a: (remounted._backgroundReseedTarget(sent, a) as INewSessionTarget).requireDevContainer, b: (remounted._backgroundReseedTarget(sent, b) as INewSessionTarget).requireDevContainer };
				// The user picks the folder again, in the environment shown: not a Dev Container.
				await remounted._handleWorkspaceSelection(a);
				await remounted._createNewSession(a, { providerId: 'local-agent-host', sessionTypeId: 't' });

				assert.deepStrictEqual({ log: provider.log, reseed, requested: target.get()?.requireDevContainer }, {
					log: ['create t1', 'devContainer t1 required', 'create t2', 'create t3', 'devContainer t3 required', 'create t4'],
					reseed: { a: true, b: undefined },
					requested: undefined,
				});
			});

			test('a composer whose chosen folder\'s trust is declined goes back to its kept draft in the Dev Container that draft runs in, not as the declined folder was requested', async () => {
				const outcomes: (boolean | undefined)[] = [];
				for (const keptInDevContainer of [true, false]) {
					const provider = new ModelProvider('local-agent-host', ['t']);
					const agents = createAgents([provider]);
					const a = URI.file('/a');
					const b = URI.file('/b');
					const target = observableValue<INewSessionTarget | undefined>('target', { folderUri: a, providerId: 'local-agent-host', sessionTypeId: 't' });
					const composer = withWidgetMethods(Object.assign(hostedComposer(agents, target), {
						_workspaceOptOutEnabled: constObservable(false),
						_preferredDevContainerFolderUri: undefined,
						_pendingWorkspaceCreation: undefined,
						_createdSessionId: undefined,
						_store: { isDisposed: false },
						uriIdentityService: { extUri },
						_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => undefined, getUserPickedSessionType: () => undefined }, onDidSelectModel: agents.modelSelections.event, preparePromptOptionsRefresh: () => false, showPromptOptions: () => { }, focus: () => { } },
						_workspacePicker: { selectedResolved: undefined, selectedFolderUri: a, setSelectedWorkspace: () => { }, removeFromRecents: () => { }, selectNoWorkspace: () => { }, ...workspaceIdentity(agents.providers) },
						sessionsService: {
							// The user declines the trust of B.
							openNewSession: async (options: IOpenNewSessionOptions) => options.folderUri!.path === b.path
								? { session: undefined, trustDeclined: true }
								: { session: options.draftSlot!.createNewSession(options.folderUri!, options), trustDeclined: false },
						},
					}), ['_createNewSession', '_createSessionNow', '_applyPreferredDevContainer', '_requestsDevContainer', '_reopenRequestedWorkspace', '_isPreferredServable', '_scheduleRecreateOnProviderChange', '_recreateOnProviderChange']);
					await composer._createNewSession(a, { providerId: 'local-agent-host', sessionTypeId: 't' });
					const kept = agents.slot.newSession.get()!;
					if (keptInDevContainer) {
						provider.inDevContainer.add(kept.sessionId);
					}
					// The user chose B, in a Dev Container unless A runs in one.
					target.set({ folderUri: b, providerId: 'local-agent-host', sessionTypeId: 't', requireDevContainer: !keptInDevContainer || undefined }, undefined);
					composer._pendingPreferredUpgrade.clear();
					await composer._reopenRequestedWorkspace(b, target.get(), kept, a);
					composer._pendingPreferredUpgrade.clear();
					outcomes.push(target.get()?.folderUri?.path === a.path ? target.get()?.requireDevContainer : false);
				}

				assert.deepStrictEqual(outcomes, [true, undefined]);
			});

			test('a composer whose foreground send failed without its slot taking its draft back creates a fresh draft of what it aims for, and sending again waits for that draft rather than asking for a workspace; never over a draft its slot holds', async () => {
				const provider = new ModelProvider('p', ['t']);
				const agents = createAgents([provider]);
				const folder = URI.file('/project');
				const target = observableValue<INewSessionTarget | undefined>('target', { folderUri: folder, providerId: 'p', sessionTypeId: 't' });
				const asked: string[] = [];
				/** Holds the creation of drafts, as a provider can take a while. */
				let creating: DeferredPromise<void> | undefined;
				const composer = withWidgetMethods(Object.assign(hostedComposer(agents, target), {
					_preferredDevContainerFolderUri: undefined,
					_pendingWorkspaceCreation: undefined as Promise<IOpenNewSessionResult> | undefined,
					_createdSessionId: undefined,
					_backgroundSend: false,
					uriIdentityService: { extUri },
					_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => undefined, getUserPickedSessionType: () => undefined }, onDidSelectModel: agents.modelSelections.event },
					_backgroundSendStatus: observableValue<string | undefined>('status', undefined),
					_workspacePicker: {
						selectedResolved: undefined, selectedFolderUri: folder, setSelectedWorkspace: () => { }, ...workspaceIdentity(agents.providers),
						showPicker: () => asked.push('picker'),
						validateSelectedWorkspace: async () => { asked.push(`send ${agents.slot.newSession.get()?.sessionId}`); return false; },
					},
					sessionsService: {
						openNewSession: async (options: IOpenNewSessionOptions) => {
							await creating?.p;
							return { session: options.draftSlot!.createNewSession(options.folderUri!, options), trustDeclined: false };
						},
						openSession: async () => assert.fail('A hosted composer must not change the grid'),
					},
				}), ['_createNewSession', '_createSessionNow', '_applyPreferredDevContainer', '_seedRequestedTarget', '_reseedAfterFailedSend', '_isPreferredServable', '_scheduleRecreateOnProviderChange', '_recreateOnProviderChange', '_send']);
				const reseeding = composer._reseedAfterFailedSend(composer._draftHost) as IDisposable;
				await composer._createNewSession(folder, { providerId: 'p', sessionTypeId: 't' });

				// The send fails; its slot does not take its draft back.
				creating = new DeferredPromise<void>();
				const failure = await agents.management.sendNewChatRequest(agents.slot.newSession.get()!, { query: 'fix it' }).then(() => 'sent', (error: Error) => error.message);
				// Sending again while the fresh draft is created waits for it.
				const sending = composer._send('again');
				await timeout(0);
				const whileCreating = [...asked];
				creating.complete();
				creating = undefined;
				await sending;
				const fresh = agents.slot.newSession.get()?.sessionId;
				// A send that fails while the slot holds another draft leaves that one.
				const chat = new DeferredPromise<IChat>();
				provider.chatOfSend = () => chat.p;
				const failing = agents.management.sendNewChatRequest(agents.slot.newSession.get()!, { query: 'fix it' }).catch(() => { });
				await timeout(0);
				await composer._createNewSession(folder, { providerId: 'p', sessionTypeId: 't' });
				chat.error(new Error('no agent'));
				await failing;
				await timeout(0);
				reseeding.dispose();

				assert.deepStrictEqual({ failure, whileCreating, asked, fresh, kept: agents.slot.newSession.get()?.sessionId, log: provider.log }, {
					failure: 'no agent', whileCreating: [], asked: ['send t2'], fresh: 't2', kept: 't3', log: ['create t1', 'create t2', 'create t3'],
				});
			});

			test('a composer shown again with the cloud agent\'s draft of the requested folder\'s repository, used instead of the requested agent, creates the requested agent\'s draft of the folder once that agent arrives', async () => {
				const cloud = new ModelProvider('cloud', ['c']);
				cloud.repository = 'owner/repo';
				const agents = createAgents([cloud]);
				const folder = URI.file('/project');
				const target = observableValue<INewSessionTarget | undefined>('target', { folderUri: folder, providerId: 'p', sessionTypeId: 't' });
				const input = new ComposerInputSnapshot({ input: { inputText: 'keep me', attachments: [] } });
				const composerOf = () => withWidgetMethods(Object.assign(hostedComposer(agents, target), {
					_preferredDevContainerFolderUri: undefined,
					_pendingWorkspaceCreation: undefined,
					_createdSessionId: undefined,
					uriIdentityService: { extUri },
					_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => undefined, getUserPickedSessionType: () => undefined }, onDidSelectModel: agents.modelSelections.event },
					_workspacePicker: { selectedResolved: undefined, selectedFolderUri: folder, selections: [] as string[], setSelectedWorkspace(folderUri: URI, options: { readonly persist?: boolean }) { this.selections.push(`${folderUri.path}${options.persist === false ? '' : ' persisted'}`); }, ...workspaceIdentity(agents.providers) },
					sessionsService: {
						openNewSession: async (options: IOpenNewSessionOptions) => ({ session: options.draftSlot!.createNewSession(options.folderUri!, options), trustDeclined: false }),
						openSession: async () => assert.fail('A hosted composer must not change the grid'),
					},
				}), ['_createNewSession', '_createSessionNow', '_applyPreferredDevContainer', '_seedWorkspaceDraft', '_reopenRequestedWorkspace', '_isPreferredServable', '_scheduleRecreateOnProviderChange', '_recreateOnProviderChange']);

				// The requested agent is not there: its first view created the cloud agent's draft instead, then went.
				const first = composerOf();
				Object.assign(first._draftHost, { input });
				await first._createNewSession(folder, { providerId: 'cloud', sessionTypeId: 'c' });
				first._pendingPreferredUpgrade.clear();
				const remounted = Object.assign(composerOf(), { _syncWorkspacePickerFromActiveSession: () => true });
				Object.assign(remounted._draftHost, { input });
				remounted._seedWorkspaceDraft();
				await timeout(0);
				const whileMissing = agents.slot.newSession.get()?.workspace.get()?.folders[0]?.root.toString();
				const requested = new ModelProvider('p', ['t']);
				agents.register(requested);
				await timeout(0);

				const draft = agents.slot.newSession.get();
				assert.deepStrictEqual({ whileMissing, draft: `${draft?.providerId}/${draft?.sessionType} ${draft?.workspace.get()?.folders[0]?.root.toString()}`, selections: remounted._workspacePicker.selections, input: input.get(), log: [...cloud.log, ...requested.log] }, {
					whileMissing: 'github-remote-file://github/owner/repo/HEAD', draft: 'p/t file:///project', selections: [], input: { input: { inputText: 'keep me', attachments: [] } }, log: ['create c1', 'create t1'],
				});
			});

			test('a composer shown again with a folder draft of the agent used instead of the requested one recreates it for the requested agent once that serves the folder, not before', () => {
				const folder = URI.file('/project');
				const changes = disposables.add(new Emitter<void>());
				const created: string[] = [];
				let servable = false;
				const draft = upcastPartial<ISession>({
					sessionId: 'fallback', providerId: 'fallback', sessionType: 'f', status: constObservable(SessionStatus.Untitled), isQuickChat: constObservable(false),
					workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [{ root: folder, workingDirectory: folder, name: 'project', description: undefined }] })),
				});
				const harness = withWidgetMethods({
					_draftHost: { requestedTarget: constObservable({ folderUri: folder, providerId: 'p', sessionTypeId: 't' }) },
					_session: constObservable(draft),
					_workspacePicker: { selectedFolderUri: folder, ...workspaceIdentity() },
					_syncWorkspacePickerFromActiveSession: () => true,
					_pendingPreferredUpgrade: disposables.add(new MutableDisposable()),
					sessionsManagementService: { onDidChangeSessionTypes: changes.event },
					uriIdentityService: { extUri },
					_isPreferredServable: () => servable,
					_createNewSession: async (folderUri: URI, pick?: IPreferredSessionType) => { created.push(`${folderUri.path} ${pick?.providerId}/${pick?.sessionTypeId}`); },
				}, ['_isRequestedAgent', '_resumeRequestedTargetUpgrade', '_scheduleRecreateOnProviderChange', '_recreateOnProviderChange']);
				seedWorkspaceDraft.call(harness);
				const beforeArrival = [...created];
				changes.fire();
				const unservable = [...created];
				servable = true;
				changes.fire();

				assert.deepStrictEqual({ beforeArrival, unservable, created }, { beforeArrival: [], unservable: [], created: ['/project p/t'] });
			});

			test('the user\'s workspace and model picks on a draft of the requested agent replace the requested ones, until it is sent', async () => {
				const requested: { target: INewSessionTarget; reason: string }[] = [];
				const target = observableValue<INewSessionTarget | undefined>('target', { folderUri: URI.file('/inherited'), providerId: 'p', sessionTypeId: 't', modelId: 'm1', modeId: 'agent' });
				const draftHost: Partial<INewSessionDraftHost> = {
					requestedTarget: target,
					setRequestedTarget: (next, reason) => { requested.push({ target: next, reason }); target.set(next, undefined); },
				};
				await handleWorkspaceSelection.call(upcastPartial<IHandleWorkspaceSelectionHarness>({
					_draftHost: draftHost,
					_environment: constObservable(undefined),
					_workspaceOptOutEnabled: constObservable(false),
					_newChatInput: { focus: () => { } },
					_isCurrentWorkspaceSelection: () => true,
				}), URI.file('/picked'));
				const status = observableValue('status', SessionStatus.Untitled);
				const draft = upcastPartial<ISession>({ sessionId: 'draft', providerId: 'p', sessionType: 't', status, mode: constObservable({ id: 'agent', kind: 'agent' }) });
				const modelSelections = disposables.add(new Emitter<string>());
				const tracking = withWidgetMethods({ _session: constObservable(draft), _draftHost: draftHost, _newChatInput: { onDidSelectModel: modelSelections.event }, _pendingPreferredUpgrade: disposables.add(new MutableDisposable()) }, ['_isRequestedAgent', '_trackUserModelSelections'])
					._trackUserModelSelections() as IDisposable;
				modelSelections.fire('m2');
				status.set(SessionStatus.InProgress, undefined);
				modelSelections.fire('m3');
				tracking.dispose();

				assert.deepStrictEqual(requested.map(({ target, reason }) => `${reason}: ${target.folderUri?.path} ${target.modelId} ${target.modeId}`), [
					'user: /picked m1 agent',
					'user: /picked m2 agent',
				]);
			});

			test('an Alt+Enter send reseeds toward its own selection', async () => {
				const requested: { target: INewSessionTarget; reason: string }[] = [];
				const created: { folder: string; pick?: IPreferredSessionType }[] = [];
				const folder = URI.file('/workspace');
				const draft = upcastPartial<ISession>({ sessionId: 'draft', providerId: 'p', sessionType: 't', modelId: constObservable('m2'), mode: constObservable({ id: 'ask', kind: 'ask' }) });
				const harness: ISendHarness = {
					_draftHost: { ...host(upcastPartial<INewSessionDraftSlot>({ id: 'slot' })), requestedTarget: constObservable(undefined), setRequestedTarget: (target, reason) => requested.push({ target, reason }) },
					_backgroundSendStatus: observableValue<string | undefined>('status', undefined),
					_newChatInput: { hasInput: false },
					notificationService: { error: () => assert.fail('Unexpected error') },
					_pendingBackgroundSends: disposables.add(new DisposableMap<object, IDisposable>()),
					recentWorkspacesService: { restoreDismissedWorkspace: () => { } },
					newSessionComposerService: { notifyWillSendRequest: () => { } },
					_session: constObservable(draft),
					_feedbackItems: constObservable([]),
					_comparisonSelection: { enabled: constObservable(false) },
					_workspacePicker: { selectedFolderUri: folder, validateSelectedWorkspace: async () => true, clearAttachedContext: () => { }, showPicker: () => { } },
					_isQuickChatComposer: constObservable(false),
					agentFeedbackService: { removeFeedback: () => { } },
					sessionsManagementService: { onDidSendRequest: Event.None, onDidReplaceNewDraftSession: Event.None, onDidReplaceSession: Event.None, onDidEndNewSessionRequest: Event.None, sendNewChatRequest: async () => { } },
					logService: { error: () => { } },
					_getWorkspaceRoots: () => [],
					_createNewSession: async (folderUri: URI, pick?: IPreferredSessionType) => { created.push({ folder: folderUri.path, pick }); },
					_clearBackgroundSendOnFailure: (...args) => clearBackgroundSendOnFailure.apply(harness, args),
					_backgroundReseedTarget: (session, folderUri) => backgroundReseedTarget.call({ _environment: constObservable(undefined), _requestsDevContainer: () => false }, session, folderUri),
				};

				await send.call(harness, 'hello', undefined, true);

				assert.deepStrictEqual({ requested, created }, {
					requested: [{ target: { folderUri: folder, providerId: 'p', sessionTypeId: 't', modelId: 'm2', modeId: 'ask' }, reason: 'background' }],
					created: [{ folder: '/workspace', pick: { providerId: 'p', sessionTypeId: 't' } }],
				});
			});
		});

		test('opens the session an Alt+Enter send started through its host, not in the main window', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IHoverService, NullHoverService);
			instantiationService.stub(IOpenerService, {});
			const changed = disposables.add(new Emitter<void>());
			const status = observableValue<string | undefined>('status', undefined);
			const started = upcastPartial<ISession>({ sessionId: 'started', resource: URI.parse('test-session:/started') });
			const opened: ISession[] = [];
			const harness = {
				_draftHost: host(upcastPartial<INewSessionDraftSlot>({ id: 'slot' }), opened),
				_backgroundSendStatus: status,
				_lastBackgroundSentSessionResource: started.resource as URI | undefined,
				_lastBackgroundSentSession: started as ISession | undefined,
				_newChatInput: { onDidChangeInput: changed.event, hasInput: false },
				accessibilityService: { status: () => { } },
				instantiationService,
				sessionsService: { openSession: async () => assert.fail('A hosted composer must not open sessions in the main window') },
				_register: <T extends IDisposable>(value: T) => disposables.add(value),
			};
			const container = $('div');
			const render = Reflect.get(NewChatWidget.prototype, '_renderBackgroundSendStatus') as (this: typeof harness, container: HTMLElement) => void;
			render.call(harness, container);
			status.set('Message sent', undefined);
			container.querySelector('a')!.click();
			await timeout(0);

			assert.deepStrictEqual({ confirmation: container.textContent, opened: opened.map(session => session.sessionId) }, { confirmation: 'Message sentOpen Session', opened: ['started'] });
		}));
	});

	test('Inbox sent-session confirmation reserves its height and expires after eight seconds, pausing for hover and focus', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(IOpenerService, {});
		const status = observableValue<string | undefined>('status', undefined);
		const harness = {
			_backgroundSend: true,
			_backgroundSendStatus: status,
			_lastBackgroundSentSessionResource: URI.parse('test-session:/started') as URI | undefined,
			_newChatInput: { onDidChangeInput: Event.None, hasInput: false },
			accessibilityService: { status: () => { } },
			instantiationService,
			_register: <T extends IDisposable>(value: T) => disposables.add(value),
		};
		const host = mainWindow.document.body.appendChild($('div'));
		disposables.add(toDisposable(() => host.remove()));
		const render = Reflect.get(NewChatWidget.prototype, '_renderBackgroundSendStatus') as (this: typeof harness, container: HTMLElement) => void;
		render.call(harness, host);
		const reservedHeight = host.firstElementChild!.getBoundingClientRect().height;
		status.set('Message sent', undefined);
		const shownHeight = host.firstElementChild!.getBoundingClientRect().height;
		await timeout(7999);
		const beforeTimeout = host.textContent;
		await timeout(1);
		const afterTimeout = host.textContent;
		harness._lastBackgroundSentSessionResource = URI.parse('test-session:/next');
		status.set('Message sent', undefined);
		await timeout(3000);
		const confirmation = host.firstElementChild!;
		const link = host.querySelector('a')!;
		confirmation.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(8000);
		const hovered = host.textContent;
		link.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		confirmation.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(8000);
		const focused = host.textContent;
		link.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
		await timeout(4999);
		const beforeResumedTimeout = host.textContent;
		await timeout(1);
		assert.deepStrictEqual({ beforeTimeout, afterTimeout, hovered, focused, beforeResumedTimeout, afterResumedTimeout: host.textContent, resource: harness._lastBackgroundSentSessionResource, preservesHeight: reservedHeight > 0 && shownHeight === reservedHeight && host.firstElementChild!.getBoundingClientRect().height === reservedHeight }, {
			beforeTimeout: 'Message sentOpen Session', afterTimeout: '', hovered: 'Message sentOpen Session', focused: 'Message sentOpen Session',
			beforeResumedTimeout: 'Message sentOpen Session', afterResumedTimeout: '', resource: undefined, preservesHeight: true,
		});
	}));

	for (const origin of [
		WorkspaceSelectionOrigin.None, WorkspaceSelectionOrigin.CheckedWorkspace, WorkspaceSelectionOrigin.AgentsRecent,
		WorkspaceSelectionOrigin.VSCodeRecent, WorkspaceSelectionOrigin.VSCodeWorkspace, WorkspaceSelectionOrigin.ExistingSessions, WorkspaceSelectionOrigin.WindowContext,
		WorkspaceSelectionOrigin.User, WorkspaceSelectionOrigin.WindowOpen, WorkspaceSelectionOrigin.RestoredDraft,
		WorkspaceSelectionOrigin.SessionSync, WorkspaceSelectionOrigin.Programmatic,
	]) {
		test(`the target composer handles an inferred default over ${origin}`, () => {
			const folderUri = URI.file('/from-editor');
			let selection: IWorkspaceSelectionSnapshot = {
				folderUri: URI.file('/previous'), state: 'selected', origin,
				historyState: 'loaded', sessionFallbackState: 'idle', registeredProviderCount: 1,
			};
			const selected: URI[] = [];
			const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
				_newSessionCreation: disposables.add(new MutableDisposable<IDisposable>()),
				_newChatInput: { canApplyWorkspaceDefault: true },
				_isQuickChatComposer: constObservable(false),
				uriIdentityService: { extUri },
				_workspacePicker: {
					get selectionSnapshot() { return selection; },
					setSelectedWorkspace: (folder: URI) => {
						selected.push(folder);
						selection = { ...selection, folderUri: folder };
					},
				},
			});
			const preserved = [
				WorkspaceSelectionOrigin.User, WorkspaceSelectionOrigin.WindowOpen, WorkspaceSelectionOrigin.RestoredDraft,
				WorkspaceSelectionOrigin.SessionSync, WorkspaceSelectionOrigin.Programmatic,
			].includes(origin);
			assert.deepStrictEqual({ result: widget.selectWorkspace(folderUri, { isDefault: true }), selected }, {
				result: preserved ? 'preserved' : 'applied', selected: preserved ? [] : [folderUri],
			});
		});

		test(`the target composer starts without a workspace for an inferred default over ${origin}`, () => {
			let selection: IWorkspaceSelectionSnapshot = {
				folderUri: URI.file('/previous'), state: 'selected', origin,
				historyState: 'loaded', sessionFallbackState: 'idle', registeredProviderCount: 1,
			};
			const noWorkspaceSelections: (ISelectNoWorkspaceOptions | undefined)[] = [];
			const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
				_newSessionCreation: disposables.add(new MutableDisposable<IDisposable>()),
				_newChatInput: { canApplyWorkspaceDefault: true },
				_workspacePicker: { get selectionSnapshot() { return selection; } },
				selectNoWorkspace: (_options: ICreateNewSessionOptions | undefined, selectionOptions?: ISelectNoWorkspaceOptions) => {
					noWorkspaceSelections.push(selectionOptions);
					selection = { ...selection, folderUri: undefined, state: 'noWorkspace' };
					return upcastPartial<ITestSessionWithChat>({ sessionId: 'quick-chat' });
				},
			});
			const preserved = [
				WorkspaceSelectionOrigin.User, WorkspaceSelectionOrigin.WindowOpen, WorkspaceSelectionOrigin.RestoredDraft,
				WorkspaceSelectionOrigin.SessionSync, WorkspaceSelectionOrigin.Programmatic,
			].includes(origin);
			const options = { userSelection: false, isDefault: true };
			assert.deepStrictEqual({ result: widget.applyNoWorkspace(options), noWorkspaceSelections }, {
				result: preserved ? 'preserved' : 'applied', noWorkspaceSelections: preserved ? [] : [options],
			});
		});
	}

	test('the target composer is not ready without a workspace until a quick chat opens', () => {
		// The environment may not have a compatible quick-chat target yet, leaving the previous draft as the session.
		const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
			_workspacePicker: { selectionSnapshot: { state: 'noWorkspace', origin: WorkspaceSelectionOrigin.None, historyState: 'loaded', sessionFallbackState: 'idle', registeredProviderCount: 1 } },
			selectNoWorkspace: () => undefined,
		});
		assert.strictEqual(widget.applyNoWorkspace({ userSelection: false }), 'notReady');
	});

	for (const protectedState of ['input', 'attachments', 'restoredDraft', 'noWorkspace', 'quickChat'] as const) {
		test(`an inferred workspace preserves the target composer's ${protectedState}`, () => {
			const input: SharedChatInputComposer = Object.assign(Object.create(SharedChatInputComposer.prototype), {
				_widget: {
					getInput: () => protectedState === 'input' ? 'unsent input' : '',
					attachmentModel: { attachments: protectedState === 'attachments' ? [toFileVariableEntry(URI.file('/attached'))] : [] },
				},
				options: { canApplyWorkspaceDefault: () => canApplyWorkspaceDefault.call(widget) },
			});
			const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
				_session: constObservable(protectedState === 'restoredDraft' || protectedState === 'quickChat' ? upcastPartial<ITestSessionWithChat>({ sessionId: protectedState }) : undefined),
				_newSessionCreation: disposables.add(new MutableDisposable<IDisposable>()),
				_newChatInput: input,
				_isQuickChatComposer: constObservable(protectedState === 'quickChat'),
				_workspacePicker: {
					selectionSnapshot: { state: protectedState === 'noWorkspace' ? 'noWorkspace' : 'none', origin: WorkspaceSelectionOrigin.None },
					setSelectedWorkspace: () => assert.fail('must preserve the composer'),
				},
			});
			assert.strictEqual(widget.selectWorkspace(URI.file('/default'), { isDefault: true }), 'preserved');
		});
	}

	for (const { createdSessionId, quickChat } of [false, true].flatMap(quickChat => [undefined, 'late-draft', 'another-draft'].map(createdSessionId => ({ createdSessionId, quickChat })))) {
		test(`checks late draft ownership before applying a default (created: ${createdSessionId}, quick chat: ${quickChat})`, () => {
			const session = observableValue<ITestSessionWithChat | undefined>('session', undefined);
			const creation = disposables.add(new MutableDisposable<IDisposable>());
			const selected: URI[] = [];
			let selection: IWorkspaceSelectionSnapshot = {
				folderUri: undefined, state: 'none', origin: WorkspaceSelectionOrigin.None,
				historyState: 'loaded', sessionFallbackState: 'idle', registeredProviderCount: 1,
			};
			const input: SharedChatInputComposer = Object.assign(Object.create(SharedChatInputComposer.prototype), {
				_widget: { getInput: () => '', attachmentModel: { attachments: [] } },
				options: { canApplyWorkspaceDefault: () => canApplyWorkspaceDefault.call(widget) },
			});
			const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
				_session: session,
				_createdSessionId: createdSessionId,
				_newSessionCreation: creation,
				_newChatInput: input,
				_isQuickChatComposer: constObservable(quickChat),
				uriIdentityService: { extUri },
				_workspacePicker: {
					get selectionSnapshot() { return selection; },
					setSelectedWorkspace: (folderUri: URI) => {
						selected.push(folderUri);
						selection = { ...selection, state: 'selected', folderUri };
					},
				},
			});
			const initiallyEligible = input.canApplyWorkspaceDefault;
			session.set(upcastPartial<ITestSessionWithChat>({
				sessionId: 'late-draft', workspace: constObservable(undefined), isQuickChat: constObservable(quickChat),
			}), undefined);
			creation.value = toDisposable(() => { });
			const folderUri = URI.file('/from-editor');
			const whileCreating = widget.selectWorkspace(folderUri, { isDefault: true });
			creation.clear();
			const result = widget.selectWorkspace(folderUri, { isDefault: true });
			const ownsDraft = createdSessionId === 'late-draft';
			assert.deepStrictEqual({ initiallyEligible, whileCreating, result, selected }, {
				initiallyEligible: true, whileCreating: 'notReady',
				result: ownsDraft ? 'applied' : 'preserved', selected: ownsDraft ? [folderUri] : [],
			});
		});
	}

	test('forwards Dev Container mode and selection origin while acknowledging only the resolved target folder', () => {
		const folder = URI.file('/requested');
		let selection: Pick<IWorkspaceSelectionSnapshot, 'folderUri' | 'state'> = { folderUri: folder, state: 'unresolved' };
		const forwarded: Parameters<WorkspacePicker['setSelectedWorkspace']>[1][] = [];
		const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
			_environment: constObservable(undefined),
			uriIdentityService: { extUri },
			_workspacePicker: {
				get selectionSnapshot() { return selection; },
				setSelectedWorkspace: (_folder: URI, options: Parameters<WorkspacePicker['setSelectedWorkspace']>[1]) => forwarded.push(options),
			},
		});

		const options: ISelectWorkspaceOptions = { providerId: 'provider', preferDevContainer: true, selectionOrigin: WorkspaceSelectionOrigin.WindowOpen };
		const results = [widget.selectWorkspace(folder, options)];
		selection = { folderUri: URI.file('/unrelated'), state: 'selected' };
		results.push(widget.selectWorkspace(folder, options));
		selection = { folderUri: folder, state: 'selected' };
		results.push(widget.selectWorkspace(folder, options));
		assert.deepStrictEqual({ results, forwarded }, {
			results: ['notReady', 'notReady', 'applied'],
			forwarded: Array.from({ length: 3 }, () => ({ providerId: 'provider', preferDevContainer: true, origin: WorkspaceSelectionOrigin.WindowOpen })),
		});
	});

	test('retains comparison models from every harness and Fusion, but not legacy routing models, during model refresh', () => {
		const model = (identifier: string) => upcastPartial<ILanguageModelChatMetadataAndIdentifier>({
			identifier,
			metadata: upcastPartial<ILanguageModelChatMetadata>({ id: identifier, name: identifier }),
		});
		const harness = {
			_newChatInput: {
				getComparisonModels: () => [
					model('copilot-model'),
					model('claude-model'),
					model('codex-model'),
					{ ...model('fusion'), metadata: { ...model('auto').metadata, autoModelFusion: true } },
					model('auto'),
					{ ...model('hydrafusion'), metadata: { ...model('hydrafusion').metadata, modelGroup: { id: 'copilotcli' } } },
				],
			},
		};

		assert.deepStrictEqual([...getComparisonModelIds.call(harness)], [
			'copilot-model',
			'claude-model',
			'codex-model',
			'fusion',
		]);
	});

	for (const committed of [false, true]) {
		test(`preserves comparison choices across workspace draft replacement and clearing (committed: ${committed})`, () => {
			const available = observableValue('available', true);
			const enabled = observableValue('enabled', true);
			const resolving = observableValue('resolving', false);
			const loading = observableValue('loading', false);
			const models = observableValue('models', ['one', 'two']);
			const draft = (sessionId: string, isQuickChat = false) => upcastPartial<ISession>({
				sessionId, providerId: 'provider', sessionType: 'copilotcli', loading,
				isQuickChat: constObservable(isQuickChat),
			});
			const session = observableValue<ISession | undefined>('session', draft('first-workspace'));
			const selection = disposables.add(new SessionComparisonModelSelection(available, undefined, undefined, undefined, undefined, disposables.add(new InMemoryStorageService()), disposables.add(new TestInstantiationService())));
			const harness = {
				_session: session,
				_compareAgentsEnabled: enabled,
				_comparisonSelection: selection,
				_newChatInput: { selectedModelState: models },
				_getComparisonModelIds: () => new Set(models.get()),
			};
			const track = Reflect.get(NewChatWidget.prototype, '_trackComparisonSelection') as (this: typeof harness, resolving: IObservable<boolean>) => IDisposable;
			disposables.add(track.call(harness, resolving));
			const configure = () => {
				selection.start();
				selection.select('one');
				selection.select('two');
				selection.addVariant('one', { effort: 'high' }, 'High');
				if (committed) {
					selection.finish();
				}
			};
			configure();
			const snapshot = () => ({
				enabled: selection.enabled.get(),
				attempts: selection.attempts.get(),
				selected: selection.state.get()?.selectedModelIds,
				variants: selection.getVariants('one'),
			});
			const before = snapshot();
			const snapshots = [];
			for (const [sessionId, quickChat] of [['second-workspace', false], ['no-workspace', true], ['third-workspace', false]] as const) {
				available.set(false, undefined);
				session.set(undefined, undefined);
				models.set([], undefined);
				loading.set(true, undefined);
				session.set(draft(sessionId, quickChat), undefined);
				loading.set(false, undefined);
				resolving.set(true, undefined);
				available.set(true, undefined);
				models.set(['one', 'two'], undefined);
				resolving.set(false, undefined);
				snapshots.push(snapshot());
			}
			session.set(upcastPartial<ISession>({ ...draft('other-harness'), sessionType: 'claude' }), undefined);
			const afterHarnessChange = snapshot();
			configure();
			enabled.set(false, undefined);
			assert.deepStrictEqual({ snapshots, afterHarnessChange, afterDisable: snapshot() }, {
				snapshots: [before, before, before],
				afterHarnessChange: { enabled: false, attempts: [], selected: undefined, variants: [] },
				afterDisable: { enabled: false, attempts: [], selected: undefined, variants: [] },
			});
		});
	}

	for (const { runs, navigationFails, openInGrid, quickChat, backgroundSend, interruption } of [
		{ runs: 2, navigationFails: false, openInGrid: true, quickChat: false, backgroundSend: false, interruption: 'none' },
		{ runs: 10, navigationFails: true, openInGrid: true, quickChat: false, backgroundSend: false, interruption: 'none' },
		{ runs: 3, navigationFails: false, openInGrid: false, quickChat: false, backgroundSend: false, interruption: 'none' },
		{ runs: 2, navigationFails: false, openInGrid: true, quickChat: true, backgroundSend: false, interruption: 'none' },
		{ runs: 2, navigationFails: false, openInGrid: true, quickChat: false, backgroundSend: true, interruption: 'none' },
		{ runs: 2, navigationFails: false, openInGrid: true, quickChat: true, backgroundSend: true, interruption: 'none' },
		{ runs: 2, navigationFails: false, openInGrid: true, quickChat: false, backgroundSend: true, interruption: 'draft' },
		{ runs: 2, navigationFails: false, openInGrid: true, quickChat: true, backgroundSend: true, interruption: 'draft' },
		{ runs: 2, navigationFails: false, openInGrid: true, quickChat: false, backgroundSend: true, interruption: 'navigation' },
		{ runs: 2, navigationFails: false, openInGrid: true, quickChat: false, backgroundSend: true, interruption: 'workspace' },
		{ runs: 2, navigationFails: false, openInGrid: true, quickChat: false, backgroundSend: true, interruption: 'pending' },
		{ runs: 2, navigationFails: false, openInGrid: true, quickChat: false, backgroundSend: true, interruption: 'disposal' },
	]) {
		test(`launches ${runs} repeated attempts with independent IDs and the draft permissions (quick chat: ${quickChat}, Inbox: ${backgroundSend}, interruption: ${interruption})`, async () => {
			const resolving = observableValue('resolving', false);
			const environment = observableValue<ISessionCreationEnvironment | undefined>('environment', undefined);
			const selection = disposables.add(new SessionComparisonModelSelection(derived(reader => !resolving.read(reader)), undefined, undefined, undefined, resolving, disposables.add(new InMemoryStorageService()), disposables.add(new TestInstantiationService())));
			selection.start();
			selection.select('claude-model');
			for (let i = 1; i < runs; i++) {
				selection.addVariant('claude-model', {
					testAttempt: i,
					...(i === 1 ? { serviceTier: 'priority' } : {}),
				}, `Attempt ${i + 1}`);
			}
			selection.next();
			selection.select('codex-judge');
			selection.next();
			selection.select('copilot-synthesizer');
			selection.finish();
			const workspace = URI.file('/workspace');
			const session = upcastPartial<ITestSessionWithChat>({
				sessionId: 'draft', sessionType: 'copilotcli', providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
				mode: constObservable({ id: 'file:///agents/reviewer.agent.md', kind: 'agent' }),
				isQuickChat: constObservable(quickChat),
			});
			const currentDraft = observableValue<ISession | undefined>('draft', session);
			const activeSession = observableValue<ITestSessionWithChat | undefined>('activeSession', session);
			const nextDraft = upcastPartial<ITestSessionWithChat>({ ...session, sessionId: 'next-draft' });
			const widgetStore = disposables.add(new DisposableStore());
			let pendingCreation: Promise<IOpenNewSessionResult> | undefined;
			let options: IStartSessionComparisonOptions | undefined;
			let fail = true;
			let permissionLocked = false;
			let containerRequested = false;
			const navigation: string[] = [];
			const selectionStatesDuringNavigation: { stage: string; enabled: boolean }[] = [];
			const errors: Error[] = [];
			const harness = {
				_backgroundSend: backgroundSend,
				_store: widgetStore,
				get _pendingWorkspaceCreation() { return pendingCreation; },
				_environment: environment,
				_comparisonSelection: selection,
				configurationService: {
					getValue: (key: string) => {
						assert.strictEqual(key, COMPARE_AGENTS_OPEN_IN_GRID_SETTING);
						return openInGrid;
					}
				},
				_workspacePicker: {
					selectedFolderUri: workspace,
					selectedResolved: {
						workspace: upcastPartial<ISessionWorkspace>({
							folders: [{ root: workspace, workingDirectory: workspace, name: 'workspace', description: undefined, gitRepository: upcastPartial<ISessionGitRepository>({ hasGitRemote: false }) }],
						})
					},
				},
				_getComparisonBranch: () => 'feature',
				_newChatInput: {
					resolveComparisonModel: (id: string) => {
						const sessionType = id.startsWith('claude') ? 'claude' : id.startsWith('codex') ? 'codex' : 'copilotcli';
						return {
							sessionType: {
								id: sessionType,
								label: sessionType === 'copilotcli' ? 'Copilot' : sessionType === 'claude' ? 'Claude' : 'Codex',
								icon: Codicon.robot,
								authRequirement: SessionTypeAuthRequirement.None,
								supportsWorktreeConfiguration: !quickChat,
							},
							model: upcastPartial<ILanguageModelChatMetadataAndIdentifier>({
								identifier: id,
								metadata: upcastPartial<ILanguageModelChatMetadata>({
									name: id,
									configurationSchema: {
										properties: {
											thinkingLevel: { type: 'string', enum: ['medium'] },
											contextSize: { type: 'number' },
											testAttempt: { type: 'number' },
											...(id.startsWith('copilot') ? { serviceTier: { type: 'string' as const, enum: ['priority'] } } : {}),
										},
									},
								}),
							}),
						};
					},
				},
				sessionsProvidersService: {
					getProvider: () => upcastPartial<IAgentHostSessionsProvider>({
						id: LOCAL_AGENT_HOST_PROVIDER_ID,
						isDevContainerRequested: () => containerRequested,
						getPermissionOptionForSession: () => ({ id: 'autoApprove', label: 'Allow all', description: '', comparisonModeId: 'autopilot', locked: permissionLocked }),
						getComparisonPermissionOptionForSession: (_sessionId, sessionTypeId) => sessionTypeId === 'claude'
							? { id: 'bypassPermissions', label: 'Bypass Permissions', description: '', locked: permissionLocked }
							: sessionTypeId === 'codex'
								? { id: 'full-access', label: 'Full Access', description: '', locked: permissionLocked }
								: { id: 'autoApprove', label: 'Allow all', description: '', comparisonModeId: 'autopilot', locked: permissionLocked },
						getSessionTypes: () => [
							{ id: 'copilotcli', label: 'Copilot', icon: Codicon.copilot, authRequirement: SessionTypeAuthRequirement.GitHub, supportsWorktreeConfiguration: true },
							{ id: 'claude', label: 'Claude', icon: Codicon.commentDiscussion, authRequirement: SessionTypeAuthRequirement.None, supportsWorktreeConfiguration: true },
							{ id: 'codex', label: 'Codex', icon: Codicon.code, authRequirement: SessionTypeAuthRequirement.None, supportsWorktreeConfiguration: true },
						],
						getModelsSnapshotForCreation: (_workspace, type, id) => {
							const expectedType = id?.startsWith('claude') ? 'claude' : id?.startsWith('codex') ? 'codex' : 'copilotcli';
							return {
								models: [],
								modelTarget: type,
								desiredModelResolution: type === expectedType
									? { kind: 'available', model: upcastPartial<ILanguageModelChatMetadataAndIdentifier>({ identifier: id!, metadata: upcastPartial<ILanguageModelChatMetadata>({ name: id! }) }) }
									: { kind: 'notRequested' },
							};
						},
						getAutomationModelConfiguration: () => ({
							getModelConfiguration: () => ({ thinkingLevel: 'medium', contextSize: 1_000_000, serviceTier: 'priority' }),
							getModelConfigurationActions: () => [],
							setModelConfiguration: async () => { },
							onDidChange: Event.None,
						}),
					})
				},
				sessionsManagementService: {
					newSession: currentDraft,
					getQuickChatSessionTypes: () => [{ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionType: { id: 'copilotcli' } }],
					getSessionTypesForFolder: () => [{ providerId: session.providerId, sessionType: { id: session.sessionType, label: 'Copilot', supportsWorktreeConfiguration: true } }],
					discardNewSession: (draft: ITestSessionWithChat) => {
						assert.strictEqual(draft, session);
						selectionStatesDuringNavigation.push({ stage: 'discardDraft', enabled: selection.enabled.get() });
						navigation.push('discardDraft');
					},
				},
				sessionComparisonService: {
					startComparison: async (value: IStartSessionComparisonOptions): Promise<{ id: string }> => {
						if (fail) {
							throw new Error('Provider unavailable');
						}
						options = value;
						if (interruption === 'draft') {
							currentDraft.set(nextDraft, undefined);
							activeSession.set(nextDraft, undefined);
						} else if (interruption === 'navigation') {
							activeSession.set(undefined, undefined);
						} else if (interruption === 'workspace') {
							harness._workspacePicker.selectedFolderUri = URI.file('/other-workspace');
						} else if (interruption === 'pending') {
							pendingCreation = Promise.resolve({ session: undefined, trustDeclined: false });
						} else if (interruption === 'disposal') {
							widgetStore.dispose();
						}
						return { id: 'comparison' };
					}
				},
				sessionsService: { activeSession, unsetNewSession: () => navigation.push('activateEmptyComposer') },
				sessionHostService: upcastPartial<ISessionHostService>({ getHostOfWindow: () => upcastPartial<ISessionHost>({ session: activeSession }) }),
				_createNewSession: async (folderUri: URI) => {
					assert.strictEqual(folderUri, workspace);
					navigation.push('reseedWorkspace');
					currentDraft.set(nextDraft, undefined);
					activeSession.set(nextDraft, undefined);
				},
				_openQuickChat: () => {
					navigation.push('reseedQuickChat');
					currentDraft.set(nextDraft, undefined);
					activeSession.set(nextDraft, undefined);
				},
				commandService: {
					executeCommand: async (id: string, comparisonId: string) => {
						assert.deepStrictEqual([id, comparisonId], ['sessions.openComparison', 'comparison']);
						selectionStatesDuringNavigation.push({ stage: 'openGrid', enabled: selection.enabled.get() });
						navigation.push('openGrid');
						if (navigationFails) {
							throw new Error('Navigation unavailable');
						}
					}
				},
				logService: { error: () => { } },
				notificationService: { error: (error: Error) => errors.push(error) },
			};
			const launch = Reflect.get(NewChatWidget.prototype, '_sendComparison') as (this: object, session: ITestSessionWithChat, request: string, context: ReadonlyMap<string, IChatRequestVariableEntry>) => Promise<boolean>;
			const attachment = toFileVariableEntry(URI.file('/workspace/file.ts'));
			const context = new Map([[attachment.id, attachment]]);
			assert.strictEqual(await launch.call(harness, session, 'Implement', context), false);
			assert.deepStrictEqual({ configured: selection.configured.get(), navigation, error: errors[0]?.message }, { configured: true, navigation: [], error: 'Provider unavailable' });
			fail = false;
			environment.set({ id: 'container:local', kind: 'container', label: 'Dev Container', icon: Codicon.remote, providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID] }, undefined);
			assert.strictEqual(await launch.call(harness, session, 'Implement', context), false);
			assert.deepStrictEqual({
				error: errors.at(-1)?.message, available: selection.available.get(), configured: selection.configured.get(), options, navigation,
			}, { error: 'Compare Agents is not available for Dev Container sessions.', available: true, configured: true, options: undefined, navigation: [] });
			environment.set(undefined, undefined);
			containerRequested = true;
			assert.strictEqual(await launch.call(harness, session, 'Implement', context), false);
			assert.deepStrictEqual({
				error: errors.at(-1)?.message, options, navigation,
			}, { error: 'Compare Agents is not available for Dev Container sessions.', options: undefined, navigation: [] });
			containerRequested = false;
			resolving.set(true, undefined);
			assert.strictEqual(await launch.call(harness, session, 'Implement', context), false);
			assert.deepStrictEqual({
				enabled: selection.enabled.get(), configured: selection.configured.get(), options, navigation,
			}, { enabled: true, configured: true, options: undefined, navigation: [] });
			resolving.set(false, undefined);
			permissionLocked = true;
			assert.strictEqual(await launch.call(harness, session, 'Implement', context), false);
			assert.deepStrictEqual({ options, configured: selection.configured.get(), navigation }, { options: undefined, configured: true, navigation: [] });
			permissionLocked = false;
			assert.strictEqual(await launch.call(harness, session, 'Implement', context), true);
			assert.ok(options);
			assert.strictEqual(errors.some(error => error.message === 'Navigation unavailable'), navigationFails);
			assert.deepStrictEqual({
				models: options.attempts.map(attempt => attempt.harness.modelId),
				harnesses: options.attempts.map(attempt => attempt.harness.sessionTypeId),
				uniqueIds: new Set(options.attempts.map(attempt => attempt.id)).size,
				permissions: options.attempts.map(attempt => attempt.harness.permissionId),
				modes: options.attempts.map(attempt => attempt.harness.modeId),
				configurations: options.attempts.map(attempt => attempt.harness.modelConfiguration),
				evaluatorConfigurations: [options.judgeHarness?.modelConfiguration, options.synthesisHarness?.modelConfiguration],
				judge: options.judgeHarness?.modelId, synthesizer: options.synthesisHarness?.modelId,
				evaluatorHarnesses: [options.judgeHarness?.sessionTypeId, options.synthesisHarness?.sessionTypeId],
				evaluatorModes: [options.judgeHarness?.modeId, options.synthesisHarness?.modeId],
				workspace: options.workspace?.toString(), branch: options.branch, attachments: options.attachedContext,
				enabled: selection.enabled.get(), selectionStatesDuringNavigation, navigation,
				currentDraft: currentDraft.get()?.sessionId,
			}, {
				models: Array(runs).fill('claude-model'), harnesses: Array(runs).fill('claude'), uniqueIds: runs, permissions: Array(runs).fill('bypassPermissions'),
				modes: Array(runs).fill(undefined),
				configurations: [
					{ thinkingLevel: 'medium', contextSize: 1_000_000 },
					...Array.from({ length: runs - 1 }, (_, index) => ({ thinkingLevel: 'medium', contextSize: 1_000_000, testAttempt: index + 1 })),
				],
				evaluatorConfigurations: [
					{ thinkingLevel: 'medium', contextSize: 1_000_000 },
					{ thinkingLevel: 'medium', contextSize: 1_000_000, serviceTier: 'priority' },
				],
				evaluatorModes: [undefined, 'autopilot'],
				judge: 'codex-judge', synthesizer: 'copilot-synthesizer',
				evaluatorHarnesses: ['codex', 'copilotcli'], workspace: quickChat ? undefined : workspace.toString(), branch: quickChat ? undefined : 'feature',
				attachments: [attachment], enabled: backgroundSend && interruption !== 'none',
				selectionStatesDuringNavigation: backgroundSend ? [] : !openInGrid
					? [{ stage: 'discardDraft', enabled: true }]
					: navigationFails
						? [{ stage: 'openGrid', enabled: true }]
						: [{ stage: 'openGrid', enabled: true }, { stage: 'discardDraft', enabled: true }],
				navigation: backgroundSend
					? interruption === 'none' ? [quickChat ? 'reseedQuickChat' : 'reseedWorkspace'] : []
					: !openInGrid ? ['discardDraft'] : navigationFails ? ['openGrid'] : ['openGrid', 'discardDraft'],
				currentDraft: backgroundSend && (interruption === 'none' || interruption === 'draft') ? 'next-draft' : 'draft',
			});
		});
	}

	test('offers folderless comparison only for quick-chat-capable, ready agent hosts while enabled', () => {
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/session') })),
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			isQuickChat: constObservable(true),
		});
		const enabled = observableValue('enabled', true);
		const resolving = observableValue('resolving', false);
		let supportsQuickChats = true;
		const harness: IComparisonActionVisibilityHarness = {
			_environment: constObservable(undefined),
			_compareAgentsEnabled: enabled,
			_pendingPreferredUpgrade: { value: undefined },
			_newSessionCreation: { value: undefined },
			_session: constObservable(session),
			_workspacePicker: { selectedResolved: undefined },
			sessionsProvidersService: {
				getProvider: () => ({
					id: LOCAL_AGENT_HOST_PROVIDER_ID,
					get supportsQuickChats() { return supportsQuickChats; },
					getCreateSessionConfig: () => undefined,
					isSessionConfigResolving: () => resolving,
				}),
			},
			_getComparisonBranch: getComparisonBranch,
		};
		const ready = shouldShowComparisonAction.call(harness);
		resolving.set(true, undefined);
		const pending = shouldShowComparisonAction.call(harness);
		resolving.set(false, undefined);
		supportsQuickChats = false;
		const unsupported = shouldShowComparisonAction.call(harness);
		supportsQuickChats = true;
		enabled.set(false, undefined);
		assert.deepStrictEqual({ ready, pending, unsupported, disabled: shouldShowComparisonAction.call(harness) }, {
			ready: true, pending: false, unsupported: false, disabled: false,
		});
	});

	test('hides comparison despite default branch configuration until the folder is initialized as a repository', () => {
		const isRepository = observableValue('isRepository', false);
		const workspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
				description: undefined,
				gitRepository: upcastPartial<ISessionGitRepository>({
					isRepository,
					hasGitRemote: false,
				}),
			}],
		});
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/session') })),
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			sessionType: 'copilotcli',
			workspace: constObservable(workspace),
		});
		const values = { isolation: 'folder', branch: 'main' };
		const harness: IComparisonActionVisibilityHarness = {
			_environment: constObservable(undefined),
			_compareAgentsEnabled: constObservable(true),
			_pendingPreferredUpgrade: { value: undefined },
			_newSessionCreation: { value: undefined },
			_session: constObservable(session),
			_workspacePicker: { selectedFolderUri: URI.file('/workspace'), selectedResolved: { workspace } },
			sessionsManagementService: {
				getSessionTypesForFolder: () => [{
					providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
					sessionType: { id: 'copilotcli', label: 'Copilot', supportsWorktreeConfiguration: true },
				}],
			},
			sessionsProvidersService: {
				getProvider: () => ({
					id: LOCAL_AGENT_HOST_PROVIDER_ID,
					getCreateSessionConfig: () => values,
					getSessionConfig: () => ({
						schema: {
							type: 'object',
							properties: {
								isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'] },
								branch: { type: 'string', title: 'Branch', enumDynamic: true },
							},
						},
						values,
					}),
					isSessionConfigResolving: () => constObservable(false),
				}),
			},
			_getComparisonBranch: getComparisonBranch,
		};

		const states: boolean[] = [];
		disposables.add(autorun(reader => {
			states.push(shouldShowComparisonAction.call(harness, reader));
		}));
		isRepository.set(true, undefined);
		isRepository.set(false, undefined);
		assert.deepStrictEqual(states, [false, true, false]);
	});

	test('sends a single-model request while a retained comparison is unavailable', async () => {
		const available = observableValue('available', true);
		const selection = disposables.add(new SessionComparisonModelSelection(available, undefined, undefined, undefined, undefined, disposables.add(new InMemoryStorageService()), disposables.add(new TestInstantiationService())));
		selection.start();
		selection.select('one');
		selection.select('two');
		selection.finish();
		available.set(false, undefined);
		const folder = URI.file('/plain-folder');
		const session = upcastPartial<ISession>({ sessionId: 'draft' });
		let sentOptions: ISendRequestOptions | undefined;
		const result = await send.call({
			notificationService: { error: () => assert.fail('Unexpected send failure') },
			_pendingBackgroundSends: { set: () => { }, deleteAndDispose: () => { } },
			_session: constObservable(session),
			_feedbackItems: constObservable([]),
			_workspacePicker: {
				selectedFolderUri: folder,
				validateSelectedWorkspace: async () => true,
				clearAttachedContext: () => { },
				showPicker: () => { },
			},
			_isQuickChatComposer: constObservable(false),
			_comparisonSelection: selection,
			agentFeedbackService: { removeFeedback: () => { } },
			recentWorkspacesService: { restoreDismissedWorkspace: () => { } },
			newSessionComposerService: { notifyWillSendRequest: () => { } },
			sessionsManagementService: {
				onDidSendRequest: Event.None,
				sendNewChatRequest: async (_session, options) => { sentOptions = options; },
			},
			logService: { error: () => assert.fail('Unexpected send failure') },
			_getWorkspaceRoots: () => [folder],
		}, 'hello');
		assert.deepStrictEqual({
			result,
			query: sentOptions?.query,
			enabled: selection.enabled.get(),
			summary: selection.summary.get(),
			retainedAttempts: selection.attemptModelIds.get(),
		}, {
			result: true,
			query: 'hello',
			enabled: false,
			summary: undefined,
			retainedAttempts: ['one', 'two'],
		});
	});

	test('hides comparison action when selected folder differs from draft repository', () => {
		const draftWorkspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/repo'),
				workingDirectory: URI.file('/repo'),
				name: 'repo',
				description: undefined,
				gitRepository: upcastPartial<ISessionGitRepository>({
					isRepository: constObservable(true),
					branchName: 'main',
					hasGitRemote: true,
				}),
			}],
		});
		const selectedWorkspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/scratch'),
				workingDirectory: URI.file('/scratch'),
				name: 'scratch',
				description: undefined,
				gitRepository: upcastPartial<ISessionGitRepository>({
					isRepository: constObservable(false),
				}),
			}],
		});
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/session') })),
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			workspace: constObservable(draftWorkspace),
		});
		const harness: IComparisonActionVisibilityHarness = {
			_environment: constObservable(undefined),
			_compareAgentsEnabled: constObservable(true),
			_pendingPreferredUpgrade: { value: undefined },
			_newSessionCreation: { value: undefined },
			_session: constObservable(session),
			_workspacePicker: { selectedFolderUri: URI.file('/scratch'), selectedResolved: { workspace: selectedWorkspace } },
			sessionsProvidersService: {
				getProvider: () => ({
					id: LOCAL_AGENT_HOST_PROVIDER_ID,
					getCreateSessionConfig: () => undefined,
					isSessionConfigResolving: () => constObservable(false),
				}),
			},
			_getComparisonBranch: getComparisonBranch,
		};

		assert.deepStrictEqual({
			branch: getComparisonBranch.call(harness),
			visible: shouldShowComparisonAction.call(harness),
		}, {
			branch: undefined,
			visible: false,
		});
	});

	test('hides comparison action while draft creation is pending for a different folder', () => {
		const draftWorkspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/repo'),
				workingDirectory: URI.file('/repo'),
				name: 'repo',
				description: undefined,
				gitRepository: upcastPartial<ISessionGitRepository>({
					isRepository: constObservable(true),
					branchName: 'main',
					hasGitRemote: true,
				}),
			}],
		});
		const selectedWorkspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/scratch'),
				workingDirectory: URI.file('/scratch'),
				name: 'scratch',
				description: undefined,
			}],
		});
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/session') })),
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			workspace: constObservable(draftWorkspace),
		});
		const harness: IComparisonActionVisibilityHarness = {
			_environment: constObservable(undefined),
			_compareAgentsEnabled: constObservable(true),
			_pendingPreferredUpgrade: { value: { dispose() { } } },
			_newSessionCreation: { value: undefined },
			_session: constObservable(session),
			_workspacePicker: { selectedFolderUri: URI.file('/scratch'), selectedResolved: { workspace: selectedWorkspace } },
			sessionsProvidersService: {
				getProvider: () => ({
					id: LOCAL_AGENT_HOST_PROVIDER_ID,
					getCreateSessionConfig: () => undefined,
					isSessionConfigResolving: () => constObservable(false),
				}),
			},
			_getComparisonBranch: getComparisonBranch,
		};

		assert.strictEqual(shouldShowComparisonAction.call(harness), false);
	});

	test('offers comparison without a remote outside selected or draft-requested Dev Containers', () => {
		const environment = observableValue<ISessionCreationEnvironment | undefined>('environment', undefined);
		let containerRequested = false;
		const workspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
				description: undefined,
				gitRepository: upcastPartial<ISessionGitRepository>({
					isRepository: constObservable(true),
					branchName: 'main',
					hasGitRemote: false,
				}),
			}],
		});
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/session') })),
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			sessionType: 'copilotcli',
			workspace: constObservable(workspace),
		});
		const harness: IComparisonActionVisibilityHarness = {
			_environment: environment,
			_compareAgentsEnabled: constObservable(true),
			sessionsManagementService: {
				getSessionTypesForFolder: () => [{
					providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
					sessionType: { id: 'copilotcli', label: 'Copilot', supportsWorktreeConfiguration: true },
				}]
			},
			_pendingPreferredUpgrade: { value: undefined },
			_newSessionCreation: { value: undefined },
			_session: constObservable(session),
			_workspacePicker: { selectedFolderUri: URI.file('/workspace'), selectedResolved: { workspace } },
			sessionsProvidersService: {
				getProvider: () => ({
					id: LOCAL_AGENT_HOST_PROVIDER_ID,
					isDevContainerRequested: () => containerRequested,
					getCreateSessionConfig: () => undefined,
					getSessionConfig: () => ({
						schema: {
							type: 'object',
							properties: {
								isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'] },
							},
						},
						values: {},
					}),
					isSessionConfigResolving: () => constObservable(false),
				}),
			},
			_getComparisonBranch: getComparisonBranch,
		};

		const available = derived(reader => {
			environment.read(reader);
			return shouldShowComparisonAction.call(harness);
		});
		const selection = disposables.add(new SessionComparisonModelSelection(available, undefined, undefined, undefined, undefined, disposables.add(new InMemoryStorageService()), disposables.add(new TestInstantiationService())));
		selection.start();
		selection.select('model-a');
		selection.select('model-b');
		selection.finish();
		const snapshot = () => ({ available: available.get(), configured: selection.configured.get() });
		const states = [snapshot()];
		environment.set({ id: 'container:local', kind: 'container', label: 'Dev Container', icon: Codicon.remote, providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID] }, undefined);
		states.push(snapshot());
		environment.set({ id: 'local', kind: 'local', label: 'This Computer', icon: Codicon.deviceDesktop, providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID] }, undefined);
		states.push(snapshot());
		environment.set(undefined, undefined);
		containerRequested = true;
		assert.deepStrictEqual({ states, draftContainer: shouldShowComparisonAction.call(harness) }, {
			states: [{ available: true, configured: true }, { available: false, configured: true }, { available: true, configured: true }],
			draftContainer: false,
		});
	});

	for (const configuration of ['VS Code', 'native', 'native with a new branch']) {
		test(`offers comparison in an unborn repository with ${configuration} workspace configuration`, () => {
			const native = configuration !== 'VS Code';
			const folder = URI.file('/workspace');
			const workspace = upcastPartial<ISessionWorkspace>({
				folders: [{ root: folder, workingDirectory: folder, name: 'workspace', description: undefined }],
			});
			const session = upcastPartial<ISession>({
				sessionId: 'session',
				mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/session') })),
				providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
				sessionType: 'copilotcli',
				workspace: constObservable(workspace),
			});
			const resolving = observableValue('resolving', false);
			const enabled = observableValue('enabled', true);
			const values: Record<string, unknown> = native ? { target: 'workspace', baseBranch: 'main' } : { isolation: 'folder', branch: 'main' };
			if (configuration === 'native with a new branch') {
				values.branch = 'new-attempt';
			}
			const schema: SessionConfigSchema = native ? {
				type: 'object',
				properties: {
					target: { type: 'string', title: 'Target', enum: ['workspace', 'worktree'] },
					baseBranch: { type: 'string', title: 'Base Branch', enumDynamic: true },
					branch: { type: 'string', title: 'New Branch' },
				},
			} : {
				type: 'object',
				properties: {
					isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'] },
					branch: { type: 'string', title: 'Branch', enumDynamic: true },
				},
			};
			const harness: IComparisonActionVisibilityHarness = {
				_environment: constObservable(undefined),
				_compareAgentsEnabled: enabled,
				_pendingPreferredUpgrade: { value: undefined },
				_newSessionCreation: { value: undefined },
				_session: constObservable(session),
				_workspacePicker: { selectedFolderUri: folder, selectedResolved: { workspace } },
				sessionsManagementService: {
					getSessionTypesForFolder: () => [{
						providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
						sessionType: { id: 'copilotcli', label: 'Copilot', supportsWorktreeConfiguration: true },
					}],
				},
				sessionsProvidersService: {
					getProvider: () => ({
						id: LOCAL_AGENT_HOST_PROVIDER_ID,
						getCreateSessionConfig: () => values,
						getSessionConfig: () => ({
							schema,
							values,
						}),
						isSessionConfigResolving: () => resolving,
					}),
				},
				_getComparisonBranch: getComparisonBranch,
			};

			const branch = getComparisonBranch.call(harness);
			const ready = shouldShowComparisonAction.call(harness);
			resolving.set(true, undefined);
			const pending = shouldShowComparisonAction.call(harness);
			resolving.set(false, undefined);
			enabled.set(false, undefined);
			assert.deepStrictEqual({ branch, ready, pending, disabled: shouldShowComparisonAction.call(harness) }, {
				branch: 'main', ready: true, pending: false, disabled: false,
			});
		});
	}

	test('uses the workspace branch while Agent Host creation config is unresolved', () => {
		const workspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
				description: undefined,
				gitRepository: upcastPartial<ISessionGitRepository>({ branchName: 'main' }),
			}],
		});
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/session') })),
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			workspace: constObservable(workspace),
		});
		const harness: IGetComparisonBranchHarness = {
			_session: constObservable(session),
			_workspacePicker: { selectedResolved: { workspace } },
			sessionsProvidersService: {
				getProvider: () => ({
					id: LOCAL_AGENT_HOST_PROVIDER_ID,
					getCreateSessionConfig: () => undefined,
				}),
			},
		};

		assert.strictEqual(getComparisonBranch.call(harness), 'main');
	});

	test('hides comparison action when draft does not advertise worktree isolation', () => {
		const draftWorkspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
				description: undefined,
				gitRepository: upcastPartial<ISessionGitRepository>({
					isRepository: constObservable(true),
					hasGitRemote: true,
				}),
			}],
		});
		const selectedWorkspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
				description: undefined,
				gitRepository: upcastPartial<ISessionGitRepository>({
					baseBranchName: 'main',
				}),
			}],
		});
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/session') })),
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			sessionType: 'copilotcli',
			workspace: constObservable(draftWorkspace),
		});
		const harness: IComparisonActionVisibilityHarness = {
			_environment: constObservable(undefined),
			_compareAgentsEnabled: constObservable(true),
			sessionsManagementService: {
				getSessionTypesForFolder: () => [{
					providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
					sessionType: { id: 'copilotcli', label: 'Copilot', supportsWorktreeConfiguration: true },
				}]
			},
			_pendingPreferredUpgrade: { value: undefined },
			_newSessionCreation: { value: undefined },
			_session: constObservable(session),
			_workspacePicker: { selectedFolderUri: URI.file('/workspace'), selectedResolved: { workspace: selectedWorkspace } },
			sessionsProvidersService: {
				getProvider: () => ({
					id: LOCAL_AGENT_HOST_PROVIDER_ID,
					getCreateSessionConfig: () => undefined,
					getSessionConfig: () => undefined,
					isSessionConfigResolving: () => constObservable(false),
				}),
			},
			_getComparisonBranch: getComparisonBranch,
		};

		assert.deepStrictEqual({
			branch: getComparisonBranch.call(harness),
			visible: shouldShowComparisonAction.call(harness),
		}, {
			branch: 'main',
			visible: false,
		});
	});

	test('hides the comparison action while Git branch metadata is resolving', () => {
		const workspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
				description: undefined,
			}],
		});
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/session') })),
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			workspace: constObservable(workspace),
		});
		const harness: IComparisonActionVisibilityHarness = {
			_environment: constObservable(undefined),
			_compareAgentsEnabled: constObservable(true),
			_pendingPreferredUpgrade: { value: undefined },
			_newSessionCreation: { value: undefined },
			_session: constObservable(session),
			_workspacePicker: { selectedFolderUri: URI.file('/workspace'), selectedResolved: { workspace } },
			sessionsProvidersService: {
				getProvider: () => ({
					id: LOCAL_AGENT_HOST_PROVIDER_ID,
					getCreateSessionConfig: () => undefined,
					isSessionConfigResolving: () => constObservable(true),
				}),
			},
			_getComparisonBranch: () => undefined,
		};

		assert.strictEqual(shouldShowComparisonAction.call(harness), false);
	});

	test('hides the comparison action while a preferred provider upgrade has unresolved Git metadata', () => {
		const workspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
				description: undefined,
			}],
		});
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/session') })),
			providerId: 'provisional',
			workspace: constObservable(workspace),
		});
		const harness: IComparisonActionVisibilityHarness = {
			_environment: constObservable(undefined),
			_compareAgentsEnabled: constObservable(true),
			_pendingPreferredUpgrade: { value: { dispose() { } } },
			_newSessionCreation: { value: undefined },
			_session: constObservable(session),
			_workspacePicker: { selectedFolderUri: URI.file('/workspace'), selectedResolved: { workspace } },
			sessionsProvidersService: {
				getProvider: () => ({
					id: 'provisional',
					getCreateSessionConfig: () => undefined,
					isSessionConfigResolving: () => constObservable(false),
				}),
			},
			_getComparisonBranch: () => undefined,
		};

		assert.strictEqual(shouldShowComparisonAction.call(harness), false);
	});
	for (const existing of ['empty', 'emptyChange', 'text', 'attachments', 'lateEdit', 'cancelled'] as const) {
		test(`draft handoff preserves ownership for ${existing} destination input`, async () => {
			const changed = disposables.add(new Emitter<void>());
			const cancellation = disposables.add(new CancellationTokenSource());
			const ready = new DeferredPromise<void>();
			const sourceFolder = URI.file('/source');
			const originalFolder = URI.file('/destination');
			let selectedFolder = originalFolder;
			let content: IChatDraft = {
				inputText: existing === 'text' ? 'Keep destination' : '',
				attachments: existing === 'attachments' ? [toFileVariableEntry(URI.file('/destination/context'))] : [],
			};
			let creations = 0;
			const incoming = { inputText: 'Incoming', attachments: [toFileVariableEntry(URI.file('/source/context'))] };
			const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
				_store: disposables.add(new DisposableStore()),
				_feedbackItems: constObservable([]),
				_environment: constObservable(undefined),
				_newChatInput: {
					isInputReady: true,
					get hasInput() { return !!content.inputText || content.attachments.length > 0; },
					onDidChangeInput: changed.event,
					sessionTypePicker: { getUserPickedSessionType: () => undefined },
					applyDraft: (draft: IChatDraft) => { content = draft; return true; },
				},
				_createNewSession: async (_folder: URI, _pick: IPreferredSessionType | undefined, handoff: { token: CancellationToken }): Promise<IOpenNewSessionResult> => {
					await ready.p;
					if (handoff.token.isCancellationRequested) {
						return { session: undefined, trustDeclined: false };
					}
					creations++;
					return { session: upcastPartial<ITestSessionWithChat>({ providerId: 'source-provider' }), trustDeclined: false };
				},
				_workspacePicker: {
					selectionSnapshot: { state: 'selected', folderUri: originalFolder, origin: WorkspaceSelectionOrigin.User },
					setSelectedWorkspace: (folder: URI) => { selectedFolder = folder; },
				},
			});
			const opening = widget.applyDraft(serializeChatDraft(incoming), sourceFolder, {
				providerId: 'source-provider', selectionOrigin: WorkspaceSelectionOrigin.WindowOpen,
			}, cancellation.token);
			if (existing === 'lateEdit') {
				content = { inputText: 'Typed while workspace trust was pending', attachments: [] };
				changed.fire();
			} else if (existing === 'emptyChange') {
				changed.fire();
			} else if (existing === 'cancelled') {
				cancellation.cancel();
			}
			await ready.complete();
			const result = await opening;
			const expectedApplied = existing === 'empty' || existing === 'emptyChange';
			assert.deepStrictEqual({
				result, selectedFolder, creations, content,
			}, {
				result: expectedApplied ? 'applied' : 'preserved',
				selectedFolder: expectedApplied ? sourceFolder : originalFolder,
				creations: expectedApplied ? 1 : 0,
				content: expectedApplied ? incoming : {
					inputText: existing === 'text' ? 'Keep destination' : existing === 'lateEdit' ? 'Typed while workspace trust was pending' : '',
					attachments: existing === 'attachments' ? [toFileVariableEntry(URI.file('/destination/context'))] : [],
				},
			});
		});
	}

});
