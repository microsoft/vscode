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
import { DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChat, ISession, ISessionGitRepository, ISessionWorkspace, SESSION_WORKSPACE_GROUP_GITHUB, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ICreateNewSessionOptions, ISendRequestSentEvent, ISessionsManagementService, WorkspaceNotTrustedError } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISendRequestOptions, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { IOpenNewSessionOptions, IOpenNewSessionResult } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionsManagementService } from '../../../../services/sessions/browser/sessionsManagementService.js';
import { ISessionsProvidersService, SessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IPickedSessionType, IPreferredSessionType } from '../../browser/sessionTypePicker.js';
import { NewChatWidget } from '../../browser/newChatWidget.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING, COMPARE_AGENTS_OPEN_IN_GRID_SETTING, ENVIRONMENT_PICKER_ICON_ONLY_SETTING, EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING, UNIFIED_WORKSPACE_PICKER_SETTING, WORKSPACE_OPT_OUT_SETTING } from '../../common/constants.js';
import type { IconOnlySessionPickers, ISessionOptionsIconOnlyPickers } from '../../browser/iconOnlySessionPickers.js';
import { getNewSessionWelcomePhrases } from '../../common/welcomePhrases.js';
import { SessionInputPickerVisibility } from '../../../../services/sessions/common/sessionPickerVisibility.js';
import { IChatRequestVariableEntry, toFileVariableEntry, toPasteVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getAdditionalFolderContextId, getAdditionalRepositoryContextId } from '../../common/newChatContextIds.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { IWorkspacePickerNoWorkspaceOption, WorkspacePicker } from '../../browser/sessionWorkspacePicker.js';
import { IWorkspaceSelectionSnapshot, WorkspaceSelectionOrigin } from '../../../../common/workspaceSelection.js';
import { ISelectNoWorkspaceOptions, ISelectWorkspaceOptions } from '../../../../browser/parts/chatView.js';
import { TOTAL_SESSIONS_KEY } from '../../../sessions/browser/sessionsLifecycleTracker.js';
import { SharedChatInputComposer } from '../../browser/sharedChatInputComposer.js';
import { ISessionComparisonAttemptConfiguration, IStartSessionComparisonOptions, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { IChatDraft, serializeChatDraft } from '../../../../../workbench/contrib/chat/common/attachments/chatDraft.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { AgentsWindowUsage } from '../../../../../workbench/contrib/chat/common/agentsWindowUsage.js';
import { SessionComparisonModelSelection } from '../../browser/sessionComparisonModelSelection.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { SessionView } from '../../../../browser/parts/sessionView.js';
import { createSessionViewTestServices, createTestActiveSession } from '../../../../test/browser/sessionViewTestUtils.js';
import { getDefaultSessionCreationEnvironment, ISessionCreationEnvironment } from '../../browser/sessionEnvironmentPicker.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';

/** The part of the active session `_recreateOnProviderChange` actually reads. */
interface IActiveDraft {
	readonly sessionId: string;
	readonly isCreated: IObservable<boolean>;
	readonly providerId: string;
	readonly sessionType: string;
}

interface IRecreateHarness {
	readonly _pendingPreferredUpgrade: MutableDisposable<IDisposable>;
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
	activeSession: IActiveSession,
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
const restoreSessionOptionsExpanded = Reflect.get(NewChatWidget.prototype, '_restoreSessionOptionsExpanded') as (this: ISessionOptionsPersistenceHarness) => void;
const setSessionOptionsExpandedFromUser = Reflect.get(NewChatWidget.prototype, '_setSessionOptionsExpandedFromUser') as (this: ISessionOptionsPersistenceHarness, expanded: boolean) => void;
const send = Reflect.get(NewChatWidget.prototype, '_send') as (this: ISendHarness, query: string, attachedContext?: IChatRequestVariableEntry[], background?: boolean) => Promise<boolean>;
const updateWelcomeMessage = Reflect.get(NewChatWidget.prototype, '_updateWelcomeMessage') as (container: HTMLElement, title: HTMLElement, visible: boolean, phrases: readonly string[], phraseIndex: number) => string | undefined;
const getComparisonBranch = Reflect.get(NewChatWidget.prototype, '_getComparisonBranch') as (this: IGetComparisonBranchHarness, session?: ISession) => string | undefined;
const getComparisonModelIds = Reflect.get(NewChatWidget.prototype, '_getComparisonModelIds') as (this: {
	readonly _newChatInput: { getComparisonModels(): readonly ILanguageModelChatMetadataAndIdentifier[] };
}) => Set<string>;
const shouldShowComparisonAction = Reflect.get(NewChatWidget.prototype, '_shouldShowComparisonAction') as (this: IComparisonActionVisibilityHarness) => boolean;
const announceWelcomeMessage = Reflect.get(NewChatWidget.prototype, '_announceWelcomeMessage') as (this: IWelcomeAnnouncementHarness, phrase: string | undefined, inputVisible: boolean) => void;
const getWelcomeName = Reflect.get(NewChatWidget.prototype, '_getWelcomeName') as (this: { _getFirstName(name: string | undefined): string | undefined }, gitHubName: string | undefined, configuredName?: string) => string | undefined;
const getFirstName = Reflect.get(NewChatWidget.prototype, '_getFirstName') as (name: string | undefined) => string | undefined;
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
const refreshGitHubProfileName = Reflect.get(NewChatWidget.prototype, '_refreshGitHubProfileName') as (this: {
	_githubProfileAccountKey: string | undefined;
	readonly _githubProfileName: ReturnType<typeof observableValue<string | undefined>>;
	readonly configurationService: { getValue<T>(key: string): T };
	readonly defaultAccountService: {
		currentDefaultAccount: { readonly authenticationProvider: { readonly id: string; readonly enterprise: boolean }; readonly sessionId: string } | null;
		getDefaultAccount(): Promise<{ readonly authenticationProvider: { readonly id: string; readonly enterprise: boolean }; readonly sessionId: string } | null>;
	};
	_fetchGitHubProfileName(providerId: string, enterprise: boolean, sessionId: string): Promise<string | undefined>;
}) => Promise<void>;
const fetchGitHubProfileName = Reflect.get(NewChatWidget.prototype, '_fetchGitHubProfileName') as (this: {
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
	readonly notificationService: { error(message: string | Error): void };
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
		clearAttachedContext(): void;
		showPicker(): void;
	};
	readonly _isQuickChatComposer: IObservable<boolean>;
	readonly agentFeedbackService: { removeFeedback(resource: URI, id: string): void };
	readonly sessionsManagementService: {
		readonly onDidSendRequest: Event<ISendRequestSentEvent>;
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
	_createNewSession?(folderUri: URI): Promise<void>;
	_openQuickChat?(): void;
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
		} | undefined;
	};
}

interface IComparisonActionVisibilityHarness extends IGetComparisonBranchHarness {
	readonly sessionsManagementService?: { getSessionTypesForFolder(): readonly { providerId: string; sessionType: { id: string; label: string; supportsWorktreeConfiguration: boolean } }[] };
	readonly _environment: IObservable<ISessionCreationEnvironment | undefined>;
	readonly _compareAgentsEnabled: IObservable<boolean>;
	readonly _pendingPreferredUpgrade: { readonly value: IDisposable | undefined };
	readonly _newSessionCreation: { readonly value: IDisposable | undefined };
	_getComparisonBranch(session?: ISession): string | undefined;
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
	readonly _environmentPickerBeforeWorkspace: ReturnType<typeof observableValue<boolean>>;
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
	_workspacePickerRow: HTMLElement | undefined;
	_workspaceSessionOptionsHost: HTMLElement | undefined;
	readonly _sessionOptionsExpanded: ReturnType<typeof observableValue<boolean>>;
	_setSessionOptionsExpandedFromUser(expanded: boolean): void;
	readonly _useExperimentalComposerLayout: ReturnType<typeof observableValue<boolean>>;
	readonly _workspaceOptOutTarget: IObservable<ICreateNewSessionOptions | undefined>;
	readonly _workspaceOptOutEnabled: ReturnType<typeof observableValue<boolean>>;
	readonly _screenReaderOptimized: ReturnType<typeof observableValue<boolean>>;
	readonly _collapsedSessionOptionsShowIcons: ReturnType<typeof observableValue<boolean>>;
	readonly _iconOnlyPickers: ISessionOptionsIconOnlyPickers & Pick<IconOnlySessionPickers, 'hasChoice'>;
	readonly _onDidChangeChatPetPlatform: Emitter<void>;
	readonly telemetryService: ITelemetryService;
}

interface ISelectNoWorkspaceHarness {
	readonly _environment: IObservable<ISessionCreationEnvironment | undefined>;
	readonly _workspaceOptOutTarget: IObservable<ICreateNewSessionOptions | undefined>;
	readonly _pendingPreferredUpgrade: MutableDisposable<IDisposable>;
	readonly _newSessionCreation: MutableDisposable<IDisposable>;
	readonly _workspacePicker: { selectNoWorkspace(userSelection?: boolean): void };
	readonly sessionsService: { openQuickChat(options?: ICreateNewSessionOptions, preserveNavigation?: boolean): { readonly sessionId: string } };
	readonly logService: { trace(message: string): void };
	_openQuickChat(options?: ICreateNewSessionOptions, preserveNavigation?: boolean): { readonly sessionId: string } | undefined;
}

interface INoWorkspaceOptionHarness {
	readonly _environment: IObservable<ISessionCreationEnvironment | undefined>;
	readonly _useConsolidatedRemoteWorkspaces: IObservable<boolean>;
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

interface IRestoreNoWorkspaceDraftHarness {
	_workspaceSelectionCleared: boolean;
	readonly _environment: IObservable<ISessionCreationEnvironment | undefined>;
	readonly _pickedEnvironment: IObservable<ISessionCreationEnvironment | undefined>;
	readonly _workspaceOptOutTarget: IObservable<ICreateNewSessionOptions | undefined>;
	readonly _noWorkspaceRestore: MutableDisposable<IDisposable>;
	readonly _newSessionCreation: MutableDisposable<IDisposable>;
	_createdSessionId: string | undefined;
	readonly _workspacePicker: Pick<WorkspacePicker, 'isNoWorkspaceSelected' | 'selectedFolderUri' | 'whenWorkspaceRestored'>;
	readonly sessionsService: {
		readonly activeSession: IObservable<IActiveSession | undefined>;
		readonly initialRestoreComplete: IObservable<boolean>;
		openQuickChat(options?: ICreateNewSessionOptions, preserveNavigation?: boolean): IActiveSession | undefined;
	};
	readonly sessionsManagementService: { isQuickChatTargetAvailable(): boolean };
	selectNoWorkspace(options?: ICreateNewSessionOptions): void;
}

interface IHandleWorkspaceSelectionHarness {
	readonly _environment: IObservable<ISessionCreationEnvironment | undefined>;
	readonly _workspaceOptOutEnabled: IObservable<boolean>;
	readonly _newChatInput: Pick<SharedChatInputComposer, 'focus'>;
	_isCurrentWorkspaceSelection(folderUri: URI | undefined): boolean;
	_onWorkspaceSelected(folderUri: URI | undefined): Promise<void>;
}

interface IClearWorkspaceHarness {
	_workspaceSelectionCleared: boolean;
	readonly _workspaceOptOutTarget: IObservable<ICreateNewSessionOptions | undefined>;
	readonly _noWorkspaceRestore: MutableDisposable<IDisposable>;
	readonly _pendingPreferredUpgrade: MutableDisposable<IDisposable>;
	readonly _newSessionCreation: MutableDisposable<IDisposable>;
	_preferredDevContainerFolderUri: URI | undefined;
	readonly _session: IObservable<ISession | undefined>;
	readonly _comparisonSelection: { reset(): void };
	readonly _workspaceOptOutEnabled: IObservable<boolean>;
	readonly sessionsService: { unsetNewSession(): void };
	readonly notificationService: { error(message: string): void };
	selectNoWorkspace(options?: ICreateNewSessionOptions, selectionOptions?: ISelectNoWorkspaceOptions): IActiveSession | undefined;
	_restoreNoWorkspaceDraft(): Promise<void>;
}

const renderWorkspacePicker = Reflect.get(NewChatWidget.prototype, '_renderWorkspacePicker') as (this: IRenderWorkspacePickerHarness, container: HTMLElement) => IDisposable;
const noIconOnlyPickers: IRenderWorkspacePickerHarness['_iconOnlyPickers'] = {
	iconOnlyPickerIds: constObservable(new Set<string>()),
	hasChoice: () => false,
	getPickerId: () => undefined,
	showContextMenu: () => { },
};
const renderSessionTypePicker = Reflect.get(NewChatWidget.prototype, '_renderSessionTypePicker') as (this: IRenderSessionTypePickerHarness, container: HTMLElement, isQuickChat: boolean) => void;
const selectNoWorkspace = NewChatWidget.prototype.selectNoWorkspace as (this: ISelectNoWorkspaceHarness, options?: ICreateNewSessionOptions, selectionOptions?: ISelectNoWorkspaceOptions) => void;
const openQuickChat = Reflect.get(NewChatWidget.prototype, '_openQuickChat') as ISelectNoWorkspaceHarness['_openQuickChat'];
const getNoWorkspaceOption = Reflect.get(NewChatWidget.prototype, '_getNoWorkspaceOption') as (this: INoWorkspaceOptionHarness) => IWorkspacePickerNoWorkspaceOption | undefined;
const getWorkspaceRoots = Reflect.get(NewChatWidget.prototype, '_getWorkspaceRoots') as (this: IWorkspaceRootsHarness, session: ISession) => readonly URI[];
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

	test('forwards nonempty composing intent to the current draft provider, but not after Send', () => {
		const changed = disposables.add(new Emitter<void>());
		let input = '';
		const current = observableValue<IActiveSession | undefined>('draft', undefined);
		const created = observableValue('created', false);
		const sending = observableValue('sending', false);
		const calls: string[] = [];
		const draft = (providerId: string) => upcastPartial<IActiveSession>({
			providerId, sessionId: `${providerId}:draft`,
			isCreated: created, isNewSessionRequestInProgress: sending,
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
			const view = store.add(instantiationService.createInstance(SessionView));
			const workbench = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
			if (modernUI) {
				workbench.classList.add('modern-ui-tabs', 'modern-ui-connected-editor-tabs');
			}
			append(append(workbench, $('.part.sessionspart')), view.element);
			store.add(toDisposable(() => workbench.remove()));
			view.openSession(createTestActiveSession('draft', false), {});
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

		test('automatic workspace restoration does not pin Cloud before This Computer registers', async () => {
			const environments = observableValue<readonly ISessionCreationEnvironment[]>('environments', [cloud]);
			const picked = observableValue<ISessionCreationEnvironment | undefined>('pickedEnvironment', undefined);
			const environment = derived(reader => picked.read(reader)
				?? getDefaultSessionCreationEnvironment(environments.read(reader), folder, 'cloud'));
			const widget = Object.assign(Object.create(NewChatWidget.prototype), {
				_environment: environment,
				_environments: environments,
				_pickedEnvironment: picked,
				_environmentPickerBeforeWorkspace: constObservable(false),
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

		test('refreshes an explicit environment selection when its metadata changes without changing its id', async () => {
			const updatedCloud: ISessionCreationEnvironment = { ...cloud, label: 'Updated Cloud', providerIds: ['new-cloud-provider'] };
			const picked = observableValue<ISessionCreationEnvironment | undefined>('pickedEnvironment', cloud);
			const widget = Object.assign(Object.create(NewChatWidget.prototype), {
				_environment: constObservable(cloud),
				_environments: constObservable([updatedCloud]),
				_pickedEnvironment: picked,
				_environmentPickerBeforeWorkspace: constObservable(false),
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

			assert.strictEqual(picked.get(), updatedCloud);
		});

		function createHarness(compatible: boolean, onSelect: () => Promise<void> = async () => { }) {
			const calls: string[] = [];
			let selectedFolder: URI | undefined = folder;
			const picked = observableValue<ISessionCreationEnvironment | undefined>('pickedEnvironment', undefined);
			const workspace = upcastPartial<ISessionWorkspace>({ folders: [{ root: folder, workingDirectory: folder, name: 'project', description: undefined }] });
			const providers = [LOCAL_AGENT_HOST_PROVIDER_ID, 'cloud'].map(id => upcastPartial<ISessionsProvider>({
				id,
				resolveWorkspace: () => id === 'cloud' && !compatible ? undefined : workspace,
				getSessionTypes: () => [{ id: 'copilot', label: 'Copilot', icon: Codicon.copilot, authRequirement: SessionTypeAuthRequirement.GitHub }],
			}));
			const cancellable = (name: string) => {
				const value = disposables.add(new MutableDisposable<IDisposable>());
				value.value = toDisposable(() => calls.push(name));
				return value;
			};
			const harness = {
				_environment: derived(reader => picked.read(reader) ?? local),
				_pickedEnvironment: picked,
				_session: constObservable({ sessionType: 'copilot' }),
				_workspaceOptOutEnabled: constObservable(false),
				_preferredDevContainerFolderUri: undefined as URI | undefined,
				_pendingPreferredUpgrade: cancellable('cancelUpgrade'),
				_newSessionCreation: cancellable('cancelCreation'),
				_noWorkspaceRestore: cancellable('cancelRestore'),
				_newChatInput: { saveState: () => calls.push('saveDraft') },
				newSessionComposerService: { notifyUserWorkspaceSelection: () => calls.push('userSelection') },
				_workspacePicker: {
					get selectedFolderUri() { return selectedFolder; },
					getEnvironmentWorkspace: (environment: ISessionCreationEnvironment) => {
						const provider = providers.find(provider => environment.providerIds.includes(provider.id));
						const workspace = selectedFolder && provider?.resolveWorkspace(selectedFolder);
						return workspace && provider ? { workspace, providerId: provider.id } : undefined;
					},
					clearSelection: () => { selectedFolder = undefined; calls.push('clearWorkspace'); },
					setSelectedWorkspace: (_uri: URI, options: { providerId: string; preferDevContainer: boolean }): void => { calls.push(`workspace:${options.providerId}:${options.preferDevContainer}`); },
				},
				sessionsProvidersService: { getProviders: () => providers, getProvider: (id: string) => providers.find(provider => provider.id === id) },
				_isPreferredServable: () => false,
				_onWorkspaceSelected: async () => { calls.push('createDraft'); await onSelect(); },
				accessibilityService: { status: (message: string) => calls.push(message) },
				logService: { error: () => assert.fail('unexpected connection failure') },
				notificationService: { error: () => assert.fail('unexpected connection failure notification') },
			};
			const select = Reflect.get(NewChatWidget.prototype, '_selectEnvironment') as (this: typeof harness, environment: ISessionCreationEnvironment) => Promise<void>;
			return { harness, calls, select: (environment: ISessionCreationEnvironment) => select.call(harness, environment) };
		}

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

		test('does not announce a superseded destination after late draft creation', async () => {
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
			}, { environment: 'local', announcements: ['Environment: This Computer'] });
		});

		function createFolderlessHarness(quickChat = true, optOutEnabled = true) {
			const remote: ISessionCreationEnvironment = { id: 'agenthost-ssh', kind: 'remote', label: 'SSH', icon: Codicon.remote, providerIds: ['agenthost-ssh'] };
			const tunnel: ISessionCreationEnvironment = { id: 'agenthost-tunnel', kind: 'remote', label: 'Dead Tunnel', icon: Codicon.remote, providerIds: ['agenthost-tunnel'] };
			const picked = observableValue<ISessionCreationEnvironment | undefined>('picked', remote);
			const createDraft = (providerId: string, sessionType: string, isQuickChat = true) => upcastPartial<IActiveSession>({
				sessionId: `${providerId}:${sessionType}`,
				providerId, sessionType,
				isCreated: constObservable(false),
				isQuickChat: constObservable(isQuickChat),
				workspace: constObservable(isQuickChat ? undefined : upcastPartial<ISessionWorkspace>({ folders: [{ root: folder, workingDirectory: folder, name: 'project', description: undefined }] })),
			});
			const session = observableValue<IActiveSession | undefined>('session', createDraft(remote.id, 'copilotcli', quickChat));
			const type = { id: 'copilotcli', label: 'Copilot', icon: Codicon.copilot, authRequirement: SessionTypeAuthRequirement.GitHub };
			const remoteTarget = { providerId: remote.id, sessionType: type };
			const localTarget = { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionType: type };
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
				widget, targetHarness, session, picked, remote, tunnel, targets, remoteTarget, localTarget, opened, errors, announcements, traces,
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
			const open = Reflect.get(NewChatWidget.prototype, '_openQuickChat') as (this: NewChatWidget) => IActiveSession | undefined;
			open.call(state.widget);
			assert.deepStrictEqual(state.opened, [{ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'copilotcli' }]);
		});

		test('reseeding a draft whose harness disappeared uses another harness on the same provider', async () => {
			const state = createFolderlessHarness();
			await state.select(local);
			state.opened.length = 0;
			state.targets.set([state.remoteTarget, { ...state.localTarget, sessionType: { ...state.localTarget.sessionType, id: 'claude' } }], undefined);
			const open = Reflect.get(NewChatWidget.prototype, '_openQuickChat') as (this: NewChatWidget) => IActiveSession | undefined;
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
			const open = Reflect.get(NewChatWidget.prototype, '_openQuickChat') as (this: NewChatWidget) => IActiveSession | undefined;
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

		test('switches to the selected workspace environment before creating a workspace-first draft', async () => {
			const remote: ISessionCreationEnvironment = { id: 'remote', kind: 'remote', label: 'Remote', icon: Codicon.remote, providerIds: ['remote'] };
			const picked = observableValue<ISessionCreationEnvironment | undefined>('environment', cloud);
			const folderUri = URI.parse('vscode-agent-host://remote/project');
			const calls: string[] = [];
			const widget = Object.assign(Object.create(NewChatWidget.prototype), {
				_environment: picked,
				_environments: constObservable([local, cloud, remote]),
				_environmentPickerBeforeWorkspace: constObservable(false),
				_pickedEnvironment: picked,
				uriIdentityService: { extUri },
				_workspaceOptOutEnabled: constObservable(false),
				_workspacePicker: {
					selectedResolved: { providerId: remote.providerIds[0] },
					getEnvironmentWorkspace: () => undefined,
				},
				_isCurrentWorkspaceSelection: () => false,
				_onWorkspaceSelected: async () => calls.push(`create:${picked.get()?.id}`),
				_newChatInput: { focus: () => calls.push('focus') },
			});
			await handleWorkspaceSelection.call(widget, folderUri);
			assert.deepStrictEqual({ environment: picked.get()?.id, calls }, { environment: remote.id, calls: ['create:remote', 'focus'] });
		});

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
			syncWorkspacePickerDevContainerMode.call(widget, upcastPartial<IActiveSession>({
				providerId: 'cloud',
				workspace: constObservable(upcastPartial<ISessionWorkspace>({
					folders: [{ root: folder, workingDirectory: folder, name: 'project', description: undefined }],
				})),
			}), true, WorkspaceSelectionOrigin.RestoredDraft);
			assert.strictEqual(picked.get()?.id, cloud.id);
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
					return { session: upcastPartial<IActiveSession>({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID }), trustDeclined: false };
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
						[UNIFIED_WORKSPACE_PICKER_SETTING]: true,
						[EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING]: true,
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
				_environmentPickerBeforeWorkspace: observableValue('beforeWorkspace', false),
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
				_workspacePickerRow: undefined,
				_workspaceSessionOptionsHost: undefined,
				_sessionOptionsExpanded: observableValue('expanded', true),
				_setSessionOptionsExpandedFromUser: () => { },
				_useExperimentalComposerLayout: observableValue('layout', false),
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
			harness._useExperimentalComposerLayout.set(true, undefined);
			states.push(snapshot());
			selectedFolderUri = URI.file('/workspace');
			selectionChanged.fire();
			states.push(snapshot());
			harness._useExperimentalComposerLayout.set(false, undefined);
			target.set({ providerId: 'local', sessionTypeId: 'copilot' }, undefined);
			states.push(snapshot());
			harness._useExperimentalComposerLayout.set(true, undefined);
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
			_environmentPickerBeforeWorkspace: observableValue('environmentBeforeWorkspace', false),
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
			_workspacePickerRow: undefined,
			_workspaceSessionOptionsHost: undefined,
			_sessionOptionsExpanded: observableValue('sessionOptionsExpanded', false),
			_setSessionOptionsExpandedFromUser: expanded => harness._sessionOptionsExpanded.set(expanded, undefined),
			_useExperimentalComposerLayout: observableValue('experimentalComposerLayout', false),
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
		const legacy = {
			rowClass: harness._workspacePickerRow?.classList.contains('new-chat-session-options'),
			detailsClass: details.classList.contains('legacy-session-options-details'),
			hidden: details.hidden,
			inert: details.inert,
			toggleHidden: toggle.hidden,
		};
		harness._useExperimentalComposerLayout.set(true, undefined);
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
			workspace: harness._workspacePickerRow?.firstElementChild?.textContent,
			items: Array.from(details.children, element => ({
				label: element.textContent,
				className: element.className,
			})),
			workspaceTriggers,
			workspaceVisibility,
			legacy,
			collapsed,
			expanded,
			collapsedAgain,
			controlsTarget: toggle.getAttribute('aria-controls') === details.id,
			sameDetails: details === harness._workspaceSessionOptionsHost,
		}, {
			workspace: isWeb ? 'Select Repository' : 'Workspace',
			items: [
				{ label: 'WorktreeBranch', className: 'new-chat-repository-controls-host' },
				{ label: 'Copilot', className: 'sessions-chat-session-type-picker sessions-workspace-category-picker-slot' },
			],
			workspaceTriggers: [{ tooltip: 'Choose where the new session runs', icon: isWeb ? 'repo' : 'project', attachesContext: false }],
			workspaceVisibility: [false, true],
			legacy: {
				rowClass: false,
				detailsClass: true,
				hidden: false,
				inert: false,
				toggleHidden: true,
			},
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
		harness._environmentPickerBeforeWorkspace.set(true, undefined);
		const gated = container.textContent?.includes('Environment') ?? false;
		harness._environmentPickerBeforeWorkspace.set(false, undefined);
		harness._environment.set({ id: 'local', kind: 'local', label: 'This Computer', icon: Codicon.deviceDesktop, providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID] }, undefined);
		const environment = details.firstElementChild!;
		const environmentTrigger = environment.querySelector<HTMLElement>('[role="button"]')!;
		const afterWorkspace = { insideOptions: details.contains(environment), hidden: details.hidden, inert: details.inert };
		harness._environmentPickerBeforeWorkspace.set(true, undefined);
		const beforeWorkspace = { first: harness._workspacePickerRow?.firstElementChild === environment, visible: environmentTrigger.checkVisibility() };
		environmentTrigger.focus();
		press('Tab');
		const nextControl = document.activeElement?.textContent;
		press('ArrowLeft');
		const previousControl = document.activeElement === environmentTrigger;
		harness._sessionOptionsExpanded.set(true, undefined);
		harness._environmentPickerBeforeWorkspace.set(false, undefined);
		const restored = { insideOptions: details.firstElementChild === environment, focused: document.activeElement === environmentTrigger };
		harness._environmentPickerBeforeWorkspace.set(true, undefined);
		harness._sessionOptionsExpanded.set(false, undefined);
		environmentTrigger.focus();
		harness._environmentPickerBeforeWorkspace.set(false, undefined);
		const focusAfterHiding = document.activeElement === toggle;
		harness._environmentPickerBeforeWorkspace.set(true, undefined);
		harness._environment.set(undefined, undefined);
		assert.deepStrictEqual({
			gated, afterWorkspace, beforeWorkspace, nextControl, previousControl, restored, focusAfterHiding, environmentRenderCount, removed: !container.contains(environment),
		}, {
			gated: false,
			afterWorkspace: { insideOptions: true, hidden: true, inert: true },
			beforeWorkspace: { first: true, visible: true },
			nextControl: isWeb ? 'Select Repository' : 'Workspace',
			previousControl: true,
			restored: { insideOptions: true, focused: true },
			focusAfterHiding: true,
			environmentRenderCount: 1,
			removed: true,
		});
	});

	test('environment icon-only experiment triggers where the environment label would show until the user chooses its presentation', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const telemetryService = new TestExperimentTriggerTelemetryService();
		const hasChoice = observableValue('hasChoice', true);
		const harness: IRenderWorkspacePickerHarness = {
			_environment: observableValue<ISessionCreationEnvironment | undefined>('environment', undefined),
			_environmentPickerBeforeWorkspace: observableValue('beforeWorkspace', false),
			_environmentPicker: {
				isVisible: constObservable(true),
				render: target => {
					const element = append(target, $('div'));
					return { element, dispose: () => element.remove() };
				},
			},
			agentHostFilterService: { selectedHost: { sessionCreationProviderId: 'creation' } },
			_workspacePicker: { selectedFolderUri: undefined, onDidChangeSelection: Event.None, renderCategoryTriggers: parent => append(parent, $('div')) },
			_newChatInput: {
				pickerVisibility: disposables.add(new SessionInputPickerVisibility()),
				placeRepositoryControls: () => { },
				sessionTypePicker: { render: () => { } },
			},
			_renderSessionTypePicker: () => { },
			_workspacePickerRow: undefined,
			_workspaceSessionOptionsHost: undefined,
			_sessionOptionsExpanded: observableValue('expanded', false),
			_setSessionOptionsExpandedFromUser: () => { },
			_useExperimentalComposerLayout: observableValue('layout', true),
			_workspaceOptOutTarget: constObservable(undefined),
			_workspaceOptOutEnabled: observableValue('optOut', false),
			_screenReaderOptimized: observableValue('screenReader', false),
			_collapsedSessionOptionsShowIcons: observableValue('icons', false),
			_iconOnlyPickers: { ...noIconOnlyPickers, hasChoice: (_pickerId, reader) => hasChoice.read(reader) },
			_onDidChangeChatPetPlatform: disposables.add(new Emitter<void>()),
			telemetryService,
		};
		disposables.add(renderWorkspacePicker.call(harness, container));
		const triggered = () => telemetryService.triggers.includes(`config.${ENVIRONMENT_PICKER_ICON_ONLY_SETTING}`);
		const states: Record<string, boolean> = {};
		harness._environment.set({ id: 'local', kind: 'local', label: 'This Computer', icon: Codicon.deviceDesktop, providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID] }, undefined);
		states.collapsedWithChoice = triggered();
		harness._sessionOptionsExpanded.set(true, undefined);
		states.expandedWithChoice = triggered();
		harness._sessionOptionsExpanded.set(false, undefined);
		hasChoice.set(false, undefined);
		states.collapsedWithoutChoice = triggered();
		harness._environmentPickerBeforeWorkspace.set(true, undefined);
		states.beforeWorkspaceWithoutChoice = triggered();
		assert.deepStrictEqual(states, {
			collapsedWithChoice: false,
			expandedWithChoice: false,
			collapsedWithoutChoice: false,
			beforeWorkspaceWithoutChoice: true,
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
			logService: { trace: () => { } },
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
			logService: { trace: () => { } },
		};

		selectNoWorkspace.call(harness, undefined, { userSelection: false, preserveNavigation: true });

		assert.deepStrictEqual({ userSelections, preserveNavigation }, {
			userSelections: [false],
			preserveNavigation: [true],
		});
	});

	suite('workspace-less fallback', () => {
		function createRestoreHarness() {
			const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
			const initialRestoreComplete = observableValue('initialRestoreComplete', true);
			const opened: string[] = [];
			let quickChatAvailable = true;
			let noWorkspaceSelected = false;
			let selectedFolderUri: URI | undefined;
			let workspaceRestored = Promise.resolve(true);
			const open = (kind: string): IActiveSession => {
				opened.push(kind);
				const session = upcastPartial<IActiveSession>({ sessionId: `quick-chat-${opened.length}` });
				activeSession.set(session, undefined);
				return session;
			};
			const harness: IRestoreNoWorkspaceDraftHarness = {
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
				sessionsService: {
					activeSession,
					initialRestoreComplete,
					openQuickChat: (_options, preserveNavigation) => open(preserveNavigation ? 'automatic' : 'explicit'),
				},
				sessionsManagementService: { isQuickChatTargetAvailable: () => quickChatAvailable },
				selectNoWorkspace: () => { open('checked'); },
			};
			return {
				harness, activeSession, initialRestoreComplete, opened,
				set quickChatAvailable(value: boolean) { quickChatAvailable = value; },
				set noWorkspaceSelected(value: boolean) { noWorkspaceSelected = value; },
				set selectedFolderUri(value: URI | undefined) { selectedFolderUri = value; },
				set workspaceRestored(value: Promise<boolean>) { workspaceRestored = value; },
				restore: () => restoreNoWorkspaceDraft.call(harness),
			};
		}

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
					state.activeSession.set(upcastPartial<IActiveSession>({ sessionId: 'restored-session' }), undefined);
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

	test('offers No workspace only when enabled and quick chats are available', () => {
		const cases = [
			{ enabled: false, available: true, isWorkspacePickerQuickChat: false },
			{ enabled: true, available: false, isWorkspacePickerQuickChat: false },
			{ enabled: true, available: true, isWorkspacePickerQuickChat: false },
			{ enabled: true, available: false, isWorkspacePickerQuickChat: true },
		];

		const options = cases.map(testCase => {
			const option = getNoWorkspaceOption.call({
				_environment: constObservable(undefined),
				_useConsolidatedRemoteWorkspaces: constObservable(testCase.enabled),
				_isWorkspacePickerQuickChat: constObservable(testCase.isWorkspacePickerQuickChat),
				_session: constObservable(undefined),
				sessionsProvidersService: { getProviders: () => [] },
				sessionsManagementService: { isQuickChatTargetAvailable: () => testCase.available },
				selectNoWorkspace: () => { },
			});
			return option && { description: option.description, isSelected: option.isSelected };
		});

		assert.deepStrictEqual(options, isWeb
			? [undefined, undefined, undefined, undefined]
			: [
				undefined,
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
			_useConsolidatedRemoteWorkspaces: constObservable(true),
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
			_useConsolidatedRemoteWorkspaces: constObservable(true),
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
			_useConsolidatedRemoteWorkspaces: constObservable(true),
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
			_useConsolidatedRemoteWorkspaces: constObservable(true),
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
				_useConsolidatedRemoteWorkspaces: constObservable(true),
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
			_useConsolidatedRemoteWorkspaces: constObservable(true),
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
			_useConsolidatedRemoteWorkspaces: constObservable(true),
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
			_useConsolidatedRemoteWorkspaces: constObservable(true),
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
		const activeSession = upcastPartial<IActiveSession>({
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
				readonly _session: IObservable<IActiveSession | undefined>;
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
				_session: constObservable(options.noDraft ? undefined : upcastPartial<IActiveSession>({
					sessionId: 'draft',
					providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
					isCreated: constObservable(!!options.isCreated),
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

	test('a provider change only recreates the draft when the pick differs from it', () => {
		const folder = URI.file('/project');
		const draft: IActiveDraft = { sessionId: 's1', isCreated: constObservable(false), providerId: 'agent-host', sessionType: 'claude' };
		const cases: { name: string; pick: IPreferredSessionType; servable: boolean }[] = [
			{ name: 'pick matches the draft', pick: { providerId: 'agent-host', sessionTypeId: 'claude' }, servable: true },
			{ name: 'pick names no provider, type matches', pick: { sessionTypeId: 'claude' }, servable: true },
			{ name: 'pick names another provider', pick: { providerId: 'other', sessionTypeId: 'claude' }, servable: true },
			{ name: 'pick names another type', pick: { providerId: 'agent-host', sessionTypeId: 'codex' }, servable: true },
			{ name: 'pick cannot be served yet', pick: { providerId: 'other', sessionTypeId: 'codex' }, servable: false },
		];

		const outcomes = cases.map(({ name, pick, servable }) => {
			let recreated = false;
			const watcher = disposables.add(new MutableDisposable<IDisposable>());
			watcher.value = toDisposable(() => { });
			recreateOnProviderChange.call({
				_pendingPreferredUpgrade: watcher,
				_session: constObservable(draft),
				_newChatInput: { sessionTypePicker: { getPreferredSessionType: () => undefined } },
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
		]);
	});

	test('provider-change recreation preserves the selected harness', () => {
		const folder = URI.file('/project');
		const draft: IActiveDraft = { sessionId: 's1', isCreated: constObservable(false), providerId: 'cloud', sessionType: 'cloud' };
		const pick = { providerId: 'local-agent-host', sessionTypeId: 'copilot' };
		let recreatedWith: IPreferredSessionType | undefined;

		recreateOnProviderChange.call({
			_pendingPreferredUpgrade: disposables.add(new MutableDisposable<IDisposable>()),
			_session: constObservable(draft),
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

	test('only allows first-run notices once the session count threshold is reached', () => {
		const eligibility = [0, 1, 2, 5].map(sessionCount => hasEnoughSessionsForFirstRunNotices.call({
			_usage: { createdSessionCount: sessionCount },
		}));

		assert.deepStrictEqual(eligibility, [false, false, true, true]);
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

	test('clearing a workspace starts the same harness without a project when supported and preserves legacy fallback', async () => {
		const results: string[][] = [];
		for (const { experimentalLayout, supported, succeeds } of [
			{ experimentalLayout: false, supported: true, succeeds: true },
			{ experimentalLayout: true, supported: false, succeeds: true },
			{ experimentalLayout: true, supported: true, succeeds: true },
			{ experimentalLayout: true, supported: true, succeeds: false },
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
				_comparisonSelection: { reset: () => events.push('resetComparison') },
				_workspaceOptOutEnabled: constObservable(experimentalLayout),
				sessionsService: { unsetNewSession: () => events.push('unsetSession') },
				notificationService: { error: () => events.push('error') },
				selectNoWorkspace: (options, selectionOptions) => {
					events.push(`chat:${options?.providerId}:${options?.sessionTypeId}:${selectionOptions?.userSelection}:${selectionOptions?.preserveNavigation}`);
					return succeeds ? upcastPartial<IActiveSession>({ sessionId: 'quick-chat' }) : undefined;
				},
				_restoreNoWorkspaceDraft: async () => { events.push('restoreChat'); },
			}, undefined);
			results.push(events);
		}
		assert.deepStrictEqual(results, [
			['cancelUpgrade', 'resetComparison', 'cancelRestore', 'cancelCreation', 'unsetSession', 'restoreChat'],
			['cancelUpgrade', 'resetComparison', 'cancelRestore', 'cancelCreation', 'unsetSession'],
			['cancelUpgrade', 'resetComparison', 'cancelRestore', 'cancelCreation', 'chat:local:copilot:false:true'],
			['cancelUpgrade', 'resetComparison', 'cancelRestore', 'cancelCreation', 'chat:local:copilot:false:true', 'unsetSession', 'error'],
		]);
	});

	test('workspace selection retains picker focus after experimental clearing settles and preserves other input focus', async () => {
		const container = append(mainWindow.document.body, $('div'));
		disposables.add(toDisposable(() => container.remove()));
		const picker = append(container, $('button', { type: 'button' }, 'Workspace'));
		const input = append(container, $('textarea'));
		const results: { pickerFocused: boolean; inputFocused: boolean; selections: number }[] = [];
		for (const { experimentalLayout, folderUri, current } of [
			{ experimentalLayout: false, folderUri: undefined, current: false },
			{ experimentalLayout: true, folderUri: undefined, current: false },
			{ experimentalLayout: true, folderUri: URI.file('/workspace'), current: false },
			{ experimentalLayout: true, folderUri: URI.file('/workspace'), current: true },
		]) {
			const selected = new DeferredPromise<void>();
			let selections = 0;
			const harness: IHandleWorkspaceSelectionHarness = {
				_environment: constObservable(undefined),
				_workspaceOptOutEnabled: constObservable(experimentalLayout),
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
				_workspacePicker: { selectedFolderUri: URI.file('/dismissed'), clearAttachedContext: () => cleared++, showPicker: () => { } },
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

	test('restores only the captured workspace after its background send succeeds', async () => {
		const onDidSendRequest = disposables.add(new Emitter<ISendRequestSentEvent>());
		const pendingSends = disposables.add(new DisposableMap<object, IDisposable>());
		const folderUri = URI.file('/dismissed');
		const restored: URI[] = [];
		const session = upcastPartial<ISession>({ sessionId: 'draft' });
		let sentOptions: ISendRequestOptions | undefined;
		const picker = { selectedFolderUri: folderUri, clearAttachedContext: () => { }, showPicker: () => { } };
		const harness: ISendHarness = {
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
		await send.call(harness, 'hello', undefined, true);
		const beforeSuccess = [...restored];
		onDidSendRequest.fire(upcastPartial<ISendRequestSentEvent>({ options: { query: 'unrelated' } }));
		const afterUnrelatedSend = [...restored];
		assert.ok(sentOptions);
		onDidSendRequest.fire(upcastPartial<ISendRequestSentEvent>({ options: sentOptions }));
		assert.deepStrictEqual({ beforeSuccess, afterUnrelatedSend, restored, pending: pendingSends.size }, {
			beforeSuccess: [], afterUnrelatedSend: [], restored: [folderUri], pending: 0,
		});
	});

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
	}

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
				_session: constObservable(protectedState === 'restoredDraft' || protectedState === 'quickChat' ? upcastPartial<IActiveSession>({ sessionId: protectedState }) : undefined),
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
			const session = observableValue<IActiveSession | undefined>('session', undefined);
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
			session.set(upcastPartial<IActiveSession>({
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

	test('retains comparison models from every harness during model refresh', () => {
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
				],
			},
		};

		assert.deepStrictEqual([...getComparisonModelIds.call(harness)], [
			'copilot-model',
			'claude-model',
			'codex-model',
		]);
	});

	for (const { runs, navigationFails, openInGrid, quickChat } of [
		{ runs: 2, navigationFails: false, openInGrid: true, quickChat: false },
		{ runs: 10, navigationFails: true, openInGrid: true, quickChat: false },
		{ runs: 3, navigationFails: false, openInGrid: false, quickChat: false },
		{ runs: 2, navigationFails: false, openInGrid: true, quickChat: true },
	]) {
		test(`launches ${runs} repeated attempts with independent IDs and the draft permissions (quick chat: ${quickChat})`, async () => {
			const resolving = observableValue('resolving', false);
			const environment = observableValue<ISessionCreationEnvironment | undefined>('environment', undefined);
			const selection = disposables.add(new SessionComparisonModelSelection(derived(reader => !resolving.read(reader)), resolving, undefined, undefined, undefined, disposables.add(new InMemoryStorageService())));
			selection.start();
			selection.select('claude-model');
			for (let i = 1; i < runs; i++) {
				selection.addVariant('claude-model', {
					testAttempt: i,
					...(i === 1 ? { serviceTier: 'priority' } : {}),
				}, `Attempt ${i + 1}`);
			}
			if (!quickChat) {
				selection.next();
				selection.select('codex-judge');
				selection.next();
				selection.select('copilot-synthesizer');
			}
			selection.finish();
			const workspace = URI.file('/workspace');
			const session = upcastPartial<IActiveSession>({
				sessionId: 'draft', sessionType: 'copilotcli', providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
				mode: constObservable({ id: 'file:///agents/reviewer.agent.md', kind: 'agent' }),
				isQuickChat: constObservable(quickChat),
			});
			let options: IStartSessionComparisonOptions | undefined;
			let fail = true;
			let permissionLocked = false;
			let containerRequested = false;
			const navigation: string[] = [];
			const errors: Error[] = [];
			const harness = {
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
							folders: [{ root: workspace, workingDirectory: workspace, name: 'workspace', description: undefined, gitRepository: upcastPartial<ISessionGitRepository>({ hasGitRemote: true }) }],
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
					getQuickChatSessionTypes: () => [{ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionType: { id: 'copilotcli' } }],
					getSessionTypesForFolder: () => [{ providerId: session.providerId, sessionType: { id: session.sessionType, label: 'Copilot', supportsWorktreeConfiguration: true } }],
					discardNewSession: (draft: IActiveSession) => {
						assert.strictEqual(draft, session);
						navigation.push('discardDraft');
					},
				},
				sessionComparisonService: {
					startComparison: async (value: IStartSessionComparisonOptions) => {
						if (fail) {
							throw new Error('Provider unavailable');
						}
						options = value;
						return { id: 'comparison' };
					}
				},
				sessionsService: { unsetNewSession: () => navigation.push('activateEmptyComposer') },
				commandService: {
					executeCommand: async (id: string, comparisonId: string) => {
						assert.deepStrictEqual([id, comparisonId], ['sessions.openComparison', 'comparison']);
						navigation.push('openGrid');
						if (navigationFails) {
							throw new Error('Navigation unavailable');
						}
					}
				},
				logService: { error: () => { } },
				notificationService: { error: (error: Error) => errors.push(error) },
			};
			const launch = Reflect.get(NewChatWidget.prototype, '_sendComparison') as (this: object, session: IActiveSession, request: string, context: ReadonlyMap<string, IChatRequestVariableEntry>) => Promise<boolean>;
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
				enabled: selection.enabled.get(), navigation,
			}, {
				models: Array(runs).fill('claude-model'), harnesses: Array(runs).fill('claude'), uniqueIds: runs, permissions: Array(runs).fill('bypassPermissions'),
				modes: Array(runs).fill(undefined),
				configurations: [
					{ thinkingLevel: 'medium', contextSize: 1_000_000 },
					...Array.from({ length: runs - 1 }, (_, index) => ({ thinkingLevel: 'medium', contextSize: 1_000_000, testAttempt: index + 1 })),
				],
				evaluatorConfigurations: quickChat ? [undefined, undefined] : [
					{ thinkingLevel: 'medium', contextSize: 1_000_000 },
					{ thinkingLevel: 'medium', contextSize: 1_000_000, serviceTier: 'priority' },
				],
				evaluatorModes: quickChat ? [undefined, undefined] : [undefined, 'autopilot'],
				judge: quickChat ? undefined : 'codex-judge', synthesizer: quickChat ? undefined : 'copilot-synthesizer',
				evaluatorHarnesses: quickChat ? [undefined, undefined] : ['codex', 'copilotcli'], workspace: quickChat ? undefined : workspace.toString(), branch: quickChat ? undefined : 'feature',
				attachments: [attachment], enabled: false, navigation: !openInGrid ? ['discardDraft'] : navigationFails ? ['openGrid'] : ['openGrid', 'discardDraft'],
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

	test('hides comparison action when selected folder has no git repository', () => {
		const workspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
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
					isSessionConfigResolving: () => constObservable(false),
				}),
			},
			_getComparisonBranch: getComparisonBranch,
		};

		assert.strictEqual(shouldShowComparisonAction.call(harness), false);
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

	test('hides comparison action when selected repository has no Git remote', () => {
		const sessionWorkspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
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
			workspace: constObservable(sessionWorkspace),
		});
		const harness: IComparisonActionVisibilityHarness = {
			_environment: constObservable(undefined),
			_compareAgentsEnabled: constObservable(true),
			_pendingPreferredUpgrade: { value: undefined },
			_newSessionCreation: { value: undefined },
			_session: constObservable(session),
			_workspacePicker: { selectedFolderUri: URI.file('/workspace'), selectedResolved: { workspace: selectedWorkspace } },
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

	test('hides comparison action when selected workspace omits remote and session metadata says no remote', () => {
		const sessionWorkspace = upcastPartial<ISessionWorkspace>({
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
		const selectedWorkspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
				description: undefined,
				gitRepository: upcastPartial<ISessionGitRepository>({
					isRepository: constObservable(true),
					branchName: 'main',
				}),
			}],
		});
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/session') })),
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			workspace: constObservable(sessionWorkspace),
		});
		const harness: IComparisonActionVisibilityHarness = {
			_environment: constObservable(undefined),
			_compareAgentsEnabled: constObservable(true),
			_pendingPreferredUpgrade: { value: undefined },
			_newSessionCreation: { value: undefined },
			_session: constObservable(session),
			_workspacePicker: { selectedFolderUri: URI.file('/workspace'), selectedResolved: { workspace: selectedWorkspace } },
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

	test('hides comparison action until Git remote metadata resolves', () => {
		const workspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
				description: undefined,
				gitRepository: upcastPartial<ISessionGitRepository>({
					isRepository: constObservable(true),
					branchName: 'main',
				}),
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
					isSessionConfigResolving: () => constObservable(false),
				}),
			},
			_getComparisonBranch: getComparisonBranch,
		};

		assert.strictEqual(shouldShowComparisonAction.call(harness), false);
	});

	test('offers comparison only outside selected or draft-requested Dev Containers', () => {
		const environment = observableValue<ISessionCreationEnvironment | undefined>('environment', undefined);
		let containerRequested = false;
		const workspace = upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
				description: undefined,
				gitRepository: upcastPartial<ISessionGitRepository>({
					isRepository: constObservable(false),
					branchName: 'main',
					hasGitRemote: true,
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
					getSessionConfig: () => upcastPartial({
						schema: {
							properties: {
								isolation: { type: 'string', enum: ['folder', 'worktree'] },
							},
						},
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
		const selection = disposables.add(new SessionComparisonModelSelection(available, undefined, undefined, undefined, undefined, disposables.add(new InMemoryStorageService())));
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
			states: [{ available: true, configured: true }, { available: false, configured: false }, { available: true, configured: false }],
			draftContainer: false,
		});
	});

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
					isRepository: constObservable(false),
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

	test('hides the comparison action while Git remote metadata is resolving', () => {
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
					return { session: upcastPartial<IActiveSession>({ providerId: 'source-provider' }), trustDeclined: false };
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
