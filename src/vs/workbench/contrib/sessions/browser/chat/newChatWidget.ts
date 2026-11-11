/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWidget.css';
import * as dom from '../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Action, toAction } from '../../../../../base/common/actions.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isErrorWithActions, toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { isCancellationError, onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedObservableWithCache, disposableObservableValue, IObservable, IReader, observableFromEvent, observableSignal, observableSignalFromEvent, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { getSessionWorkspaceProperties } from '../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { localize } from '../../../../../nls.js';
import { ICreateNewSessionOptions, INewSessionDraftSlot, ISendRequestOptions, ISessionsManagementService, trackNewSessionRequestEnd, WorkspaceNotTrustedError } from '../../common/sessionsManagement.js';
import { ChatModelSource, GITHUB_REMOTE_FILE_SCHEME, ISession, ISessionWorkspace, isSessionCreated, SESSION_WORKSPACE_GROUP_GITHUB } from '../../../../services/sessions/common/session.js';
import { IOpenNewSessionResult, ISessionsService } from '../sessionsService.js';
import { getMainWindowHost, ISessionHostService } from '../../../../services/sessions/browser/sessionHost.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { ISessionsProvider } from '../../common/sessionsProvider.js';
import { getNoWorkspaceDescription, getQuickChatProviderLabel, getRemoteQuickChatSelectedLabel } from './noWorkspaceChoice.js';
import { shouldShowGitHubWorkspaceGroupSignIn } from '../../../../services/sessions/browser/sessionsAuthGate.js';
import { AGENTIC_SIGN_IN_COMMAND_ID, FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_COMMAND_ID, FOCUS_NEW_SESSION_HARNESS_PICKER_COMMAND_ID, FOCUS_NEW_SESSION_WORKSPACE_PICKER_COMMAND_ID } from '../../common/sessionCommands.js';
import { IAgentHostSessionsProvider, isAgentHostEnvironmentAvailable, isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../common/agentHostSessionsProvider.js';
import { NewSessionComposerFocusContext, NewSessionCreationProviderIdContext } from '../../common/contextkeys.js';
import { IAquariumService, IMountedToggleHandle } from '../aquarium.js';
import { IWorkspacePickerNoWorkspaceOption, IWorkspacePickerTrigger, WorkspacePicker } from './sessionWorkspacePicker.js';
import { WebWorkspacePicker } from './webWorkspacePicker.js';
import { getStoredSessionOptionsExpanded, SessionOptionsRow, storeSessionOptionsExpanded } from './sessionOptionsRow.js';
import { IconOnlySessionPickers } from './iconOnlySessionPickers.js';
import { IPickedSessionType, IPreferredSessionType } from './sessionTypePicker.js';
import { INewChatComposerInputOptions, NEW_SESSION_PROMPT_PLACEHOLDER } from './newChatComposerInput.js';
import { SharedChatInputComposer } from './sharedChatInputComposer.js';
import { getDefaultSessionCreationEnvironment, getEnvironmentWorkspaceProvider, getRemoteSessionCreationEnvironment, getSessionCreationEnvironments, ISessionCreationEnvironment, SessionEnvironmentPicker } from './sessionEnvironmentPicker.js';
import { NoAgentHostEmptyState } from './noAgentHostEmptyState.js';
import { IChatRequestVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import { IAgentHostFilterService } from '../../common/agentHostFilter.js';
import { IChatViewOptions, INewSessionDraftHost, INewSessionTarget } from '../parts/chatView.js';
import { NewChatUserInteraction } from './newChatUserInteraction.js';
import { WorkspaceSelectionOrigin, ISelectNoWorkspaceOptions, ISelectWorkspaceOptions, WorkspaceSelectionResult } from '../../../../services/sessions/common/workspaceSelection.js';
import { ISessionPickerFocusOptions, ISessionPickerVisibility, noSessionPickerVisibility } from '../../common/sessionPickerVisibility.js';
import { AGENT_FEEDBACK_NEW_SESSION_RESOURCE, IAgentFeedbackService } from '../agentFeedback.js';
import { AgentFeedbackState, IAgentFeedback } from '../agentFeedbackModel.js';
import { buildNewSessionPrompt } from '../agentFeedbackAttachmentEntry.js';
import { SessionInputBannerWidget } from '../sessionInputBanners/sessionInputBannerWidget.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ChatInputTipPresenter } from '../../../chat/browser/widget/input/chatInputTipPresenter.js';
import { chatInputStackClass, chatInputStackSlotClass, chatInputSurfaceStackClass, ChatInputStackSlot, setChatInputStackSlot } from '../../../chat/browser/widget/input/chatInputStack.js';
import { IChatPetService } from '../../../chat/browser/chatPetService.js';
import type { IChatPetPlatformOccupation } from '../../../chat/browser/widget/chatPetWidget.js';
import { IChatTipService } from '../../../chat/browser/chatTipService.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ChatModeKind } from '../../../chat/common/constants.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { Link } from '../../../../../platform/opener/browser/link.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { AgentsWindowUsage } from '../../../chat/common/agentsWindowUsage.js';
import { INewSessionComposerService, NewSessionWorkspacePreselectionSource } from '../newSessionComposerService.js';
import { Menus } from '../menus.js';
import { getAdditionalFolderContextId, getAdditionalRepositoryContextId } from '../../common/newChatContextIds.js';
import { NewSessionBannerPriority, NewSessionBanners } from '../../common/newSessionBanners.js';
import { COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING, COMPARE_AGENTS_ENABLED_SETTING, COMPARE_AGENTS_OPEN_IN_GRID_SETTING, COMPARE_AGENTS_SHOW_PICKER_HINT_SETTING, ENVIRONMENT_PICKER_SETTING, NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING, NEW_SESSION_WELCOME_MESSAGES_SETTING, NEW_SESSION_WELCOME_PHRASES_SETTING, WORKSPACE_OPT_OUT_SETTING } from '../../common/chatConstants.js';
import { getNewSessionWelcomePhrases, INewSessionWelcomeMessagesConfiguration } from '../../common/welcomePhrases.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { getSessionComparisonWorkspaceError, ISessionComparisonHarness, ISessionComparisonService } from '../../common/sessionComparison.js';
import { OPEN_SESSION_COMPARISON_COMMAND_ID } from '../../common/sessionComparisonConstants.js';
import { SessionComparisonModelSelection } from './sessionComparisonModelSelection.js';
import { isModelComparisonSupported } from '../../../chat/browser/widget/input/modelPicker/modelPickerPresentation.js';
import { IAgentsWindowDraft } from '../../../../../platform/window/common/window.js';
import { reviveChatDraft } from '../../../chat/common/attachments/chatDraft.js';
import { NewChatMigrationNotice } from './newChatMigrationNotice.js';
import { WorktreeSuggestionController } from '../worktreeSuggestion/worktreeSuggestionController.js';
import { NewChatConnectorRecommendations } from './newChatConnectorRecommendations.js';
import { FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_WHEN, FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN, FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN } from './newChatPickerKeybinding.js';
import { WelcomeName } from './welcomeName.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ISessionsRecentWorkspacesService } from '../sessionsRecentWorkspacesService.js';
import { filterConfigurationToSchema } from '../../../chat/browser/widget/input/chatModelConfigurationLogic.js';
import { createSessionComparisonHarness } from '../sessionComparisonConfiguration.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { SessionsView, SessionsViewId } from '../views/sessionsView.js';
import { SessionsGrouping } from '../views/sessionsList.js';

// #region --- New Chat Widget ---

/**
 * Minimum number of started sessions required before showing promotions and other notifications above the
 * input. The banners below the input, tips included, wait for `NEW_SESSION_BANNERS_MIN_CREATED_SESSIONS`.
 */
const MIN_SESSIONS_FOR_FIRST_RUN_NOTICES = 2;

export function shouldShowNewSessionChatTip(hasAgentHost: boolean, foregroundSessionCount: number | undefined): boolean {
	return hasAgentHost && foregroundSessionCount === 1;
}

const WELCOME_PHRASE_INDEX_STORAGE_KEY = 'agentSessions.newSession.welcomePhraseIndex';

function getComparisonSelectedWorkspaceFolder(selectedWorkspace: ISessionWorkspace | undefined, selectedFolderUri: URI | undefined): ISessionWorkspace['folders'][number] | undefined {
	if (!selectedFolderUri) {
		return selectedWorkspace?.folders[0];
	}
	return selectedWorkspace?.folders.find(folder => isEqual(folder.root, selectedFolderUri));
}

function getComparisonSessionFolder(session: ISession | undefined, selectedFolderUri: URI | undefined): ISessionWorkspace['folders'][number] | undefined {
	if (!selectedFolderUri) {
		return session?.workspace.get()?.folders[0];
	}
	return session?.workspace.get()?.folders.find(folder => isEqual(folder.root, selectedFolderUri));
}

export function areNewSessionWelcomePhrasesEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(NEW_SESSION_WELCOME_PHRASES_SETTING);
}

export function isSessionWorkspaceOptOutEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(WORKSPACE_OPT_OUT_SETTING) === true;
}

export function isSessionEnvironmentPickerEnabled(configurationService: IConfigurationService): boolean {
	return !isWeb
		&& configurationService.getValue<boolean>(ENVIRONMENT_PICKER_SETTING) === true;
}

export class NewChatWidget extends Disposable {

	private readonly _usage: AgentsWindowUsage;
	private readonly _workspacePicker: WorkspacePicker;
	private readonly _newChatInput: SharedChatInputComposer;
	private _inputContentElement: HTMLElement | undefined;
	private readonly _preserveCustomView: boolean;
	/** The host of a composer outside the main window's grid, which holds its drafts ({@link IChatViewOptions.newSessionDraft}). */
	private readonly _draftHost: INewSessionDraftHost | undefined;
	/** Whether the composer prepares drafts without changing the grid: for a custom view, or for a {@link _draftHost}. */
	private readonly _detached: boolean;
	/** The slot of a {@link _detached} composer's drafts. */
	private readonly _draftSlot: INewSessionDraftSlot;
	private readonly _backgroundSend: boolean;
	private readonly _backgroundSendStatus = observableValue<string | undefined>(this, undefined);
	private _lastBackgroundSentSessionResource: URI | undefined;
	private _lastBackgroundSentSession: ISession | undefined;
	private _lastBackgroundSendOptions: ISendRequestOptions | undefined;
	private readonly _pickedEnvironment = observableValue<ISessionCreationEnvironment | undefined>(this, undefined);
	private readonly _environmentWorkspaces = new Map<string, URI>();
	private readonly _environmentWorkspaceChanged = observableSignal(this);
	private readonly _environment: IObservable<ISessionCreationEnvironment | undefined>;
	private readonly _environments: IObservable<readonly ISessionCreationEnvironment[]>;
	private readonly _environmentPicker: SessionEnvironmentPicker;
	private _changingEnvironment = false;
	private readonly _chatTipPresenter = this._register(new MutableDisposable<ChatInputTipPresenter>());
	private _worktreeSuggestion: WorktreeSuggestionController | undefined;
	private _isChatTipSessionInitialized = false;
	private _aquariumToggle: IMountedToggleHandle | undefined;

	/** Recreates the draft once a better/late-registering provider can serve the folder (see {@link _createNewSession}). */
	private readonly _pendingPreferredUpgrade = new MutableDisposable<IDisposable>();
	private readonly _newSessionCreation = new MutableDisposable<IDisposable>();
	/** Waits until a hosted composer's draft offers the requested custom agent ({@link _applyRequestedSelection}). */
	private readonly _pendingRequestedAgent = this._register(new MutableDisposable<IDisposable>());
	private readonly _noWorkspaceRestore = this._register(new MutableDisposable<IDisposable>());
	private _pendingWorkspaceCreation: Promise<IOpenNewSessionResult> | undefined;
	private _createdSessionId: string | undefined;
	private _preferredDevContainerFolderUri: URI | undefined;
	private _workspaceSelectionCleared = false;

	/**
	 * The currently mounted no-agent-host empty state, if any. Set by
	 * {@link _renderEmptyStateGate} while the empty state replaces the
	 * workspace picker; consulted by {@link focusInput} to route focus to
	 * the visible heading instead of the (hidden) chat input.
	 */
	private readonly _activeEmptyState = this._register(disposableObservableValue<NoAgentHostEmptyState | undefined>(this, undefined));
	private _workspacePickerRow: HTMLElement | undefined;
	private _workspaceRepositoryControlsHost: HTMLElement | undefined;
	private _workspaceSessionOptionsHost: HTMLElement | undefined;
	private readonly _sessionOptionsExpanded = observableValue(this, true);
	private readonly _iconOnlyPickers: IconOnlySessionPickers;
	private _quickChatHeaderPickerHost: HTMLElement | undefined;
	private _welcomeMessageTitle: HTMLElement | undefined;
	private _welcomePetPlatform: HTMLElement | undefined;
	private readonly _onDidChangeChatPetPlatform = this._register(new Emitter<void>());

	/** The draft the composer shows: the provider's session, which it does not own. */
	private readonly _session: IObservable<ISession | undefined>;
	private readonly _paneSession: IObservable<ISession | undefined>;

	/** Whether the active draft is a workspace-less quick chat. */
	private readonly _isQuickChatComposer: IObservable<boolean>;
	private readonly _isWorkspacePickerQuickChat: IObservable<boolean>;
	private readonly _workspaceOptOutTarget: IObservable<ICreateNewSessionOptions | undefined>;
	private readonly _workspaceOptOutEnabled: IObservable<boolean>;
	private readonly _compareAgentsEnabled: IObservable<boolean>;
	private readonly _screenReaderOptimized: IObservable<boolean>;
	private readonly _collapsedSessionOptionsShowIcons: IObservable<boolean>;
	private readonly _showWelcomePhrases: IObservable<boolean>;

	/** Draft comments shared by every uncreated new-session composer. */
	private readonly _feedbackItems: IObservable<readonly IAgentFeedback[]>;

	/** In-flight background sends awaiting confirmation before their comments are cleared. */
	private readonly _pendingBackgroundSends = this._register(new DisposableMap<object>());

	readonly pickerVisibility: IObservable<ISessionPickerVisibility>;
	private readonly _comparisonSelection: SessionComparisonModelSelection;
	private readonly _welcomePhraseIndex: number;
	private _welcomePhraseAnnounced = false;

	private static _takeNextWelcomePhraseIndex(storageService: IStorageService): number {
		const index = storageService.getNumber(WELCOME_PHRASE_INDEX_STORAGE_KEY, StorageScope.PROFILE, 0);
		const nextIndex = index + 1 < Number.MAX_SAFE_INTEGER ? index + 1 : 0;
		storageService.store(WELCOME_PHRASE_INDEX_STORAGE_KEY, nextIndex, StorageScope.PROFILE, StorageTarget.MACHINE);
		return index;
	}

	constructor(
		private readonly options: IChatViewOptions & {
			readonly inputVisible?: IObservable<boolean>;
			readonly petHostPreferred?: IObservable<boolean>;
			readonly initialAttachments?: readonly IChatRequestVariableEntry[];
		},
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IViewsService private readonly viewsService: IViewsService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@ILogService private readonly logService: ILogService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionHostService private readonly sessionHostService: ISessionHostService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ISessionsRecentWorkspacesService private readonly recentWorkspacesService: ISessionsRecentWorkspacesService,
		@IAquariumService private readonly aquariumService: IAquariumService,
		@IAgentHostFilterService private readonly agentHostFilterService: IAgentHostFilterService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IAgentFeedbackService private readonly agentFeedbackService: IAgentFeedbackService,
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IChatTipService private readonly chatTipService: IChatTipService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IStorageService private readonly storageService: IStorageService,
		@INewSessionComposerService private readonly newSessionComposerService: INewSessionComposerService,
		@ICommandService private readonly commandService: ICommandService,
		@ISessionComparisonService private readonly sessionComparisonService: ISessionComparisonService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
	) {
		super();
		this._preserveCustomView = options.preserveCustomView === true;
		this._draftHost = options.newSessionDraft;
		this._detached = this._preserveCustomView || !!this._draftHost;
		this._draftSlot = this._draftHost?.slot ?? this.sessionsManagementService.defaultNewSessionSlot;
		this._backgroundSend = options.backgroundSend === true;
		this._welcomePhraseIndex = NewChatWidget._takeNextWelcomePhraseIndex(storageService);
		this._usage = new AgentsWindowUsage(storageService);
		this._register(this._pendingPreferredUpgrade);
		this._register(this._newSessionCreation);
		// A send outlives the composer, which is then no longer the latest place of any send.
		this._register(toDisposable(() => this._lastBackgroundSendOptions = undefined));

		this._restoreSessionOptionsExpanded();

		// The session of the pane that hosts the composer, which shows its draft.
		this._paneSession = options.session ?? constObservable(undefined);
		this._session = this._detached ? this._draftSlot.newSession : this._paneSession;

		// A quick chat is workspace-less; the composer hides the workspace picker
		// (nothing to pick) and surfaces the session-type picker in the controls.
		this._isQuickChatComposer = derived(this, reader => {
			const session = this._session.read(reader);
			return session?.isQuickChat?.read(reader) ?? false;
		});
		this._compareAgentsEnabled = observableFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(COMPARE_AGENTS_ENABLED_SETTING)),
			() => this.configurationService.getValue<boolean>(COMPARE_AGENTS_ENABLED_SETTING),
		);
		this._workspaceOptOutEnabled = observableFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event =>
				event.affectsConfiguration(WORKSPACE_OPT_OUT_SETTING)),
			() => isSessionWorkspaceOptOutEnabled(this.configurationService),
		);
		const environmentPickerEnabled = observableFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event =>
				event.affectsConfiguration(ENVIRONMENT_PICKER_SETTING)),
			() => isSessionEnvironmentPickerEnabled(this.configurationService),
		);
		this._screenReaderOptimized = observableFromEvent(
			this,
			this.accessibilityService.onDidChangeScreenReaderOptimized,
			() => this.accessibilityService.isScreenReaderOptimized(),
		);
		this._collapsedSessionOptionsShowIcons = observableFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING)),
			() => this.configurationService.getValue<boolean>(COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING),
		);
		this._iconOnlyPickers = this._register(this.instantiationService.createInstance(IconOnlySessionPickers, element => this._newChatInput.getRepositoryControlId(element)));
		this._showWelcomePhrases = observableFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(NEW_SESSION_WELCOME_PHRASES_SETTING)),
			() => areNewSessionWelcomePhrasesEnabled(this.configurationService),
		);
		this._isWorkspacePickerQuickChat = derived(this, reader => {
			const session = this._session.read(reader);
			return !!session?.isQuickChat?.read(reader);
		});
		const providersChanged = observableSignalFromEvent(this, this.sessionsProvidersService.onDidChangeProviders);
		const sessionTypesChanged = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessionTypes);
		this._environments = derived(this, reader => {
			providersChanged.read(reader);
			sessionTypesChanged.read(reader);
			this._environmentWorkspaceChanged.read(reader);
			const providers = this.sessionsProvidersService.getProviders();
			for (const provider of providers) {
				if (isAgentHostProvider(provider)) {
					provider.isVisibleInEnvironmentPicker?.read(reader);
					provider.connectionStatus?.read(reader);
				}
			}
			const environments = getSessionCreationEnvironments(providers);
			const picked = this._pickedEnvironment.read(reader);
			const session = this._session.read(reader);
			const folderUri = this._workspacePicker?.selectedFolderUri;
			const providerId = this._workspacePicker?.selectedResolved?.providerId ?? session?.providerId;
			const source = getDefaultSessionCreationEnvironment(environments, folderUri, providerId);
			const sourceProvider = source?.kind !== 'cloud' && source && folderUri && getEnvironmentWorkspaceProvider(source, providers, folderUri);
			if (source && folderUri && sourceProvider && this._workspacePicker.getDevContainerWorkspaceAvailability(folderUri, sourceProvider.id) === true) {
				environments.push({ id: `container:${source.id}`, kind: 'container', label: localize('environmentPicker.container', "Dev Container"), icon: Codicon.remote, providerIds: source.providerIds });
			} else if (picked?.kind === 'container' && environments.some(environment => environment.providerIds.some(id => picked.providerIds.includes(id)))) {
				environments.push(picked);
			}
			return environments;
		});
		this._environment = derivedObservableWithCache<ISessionCreationEnvironment | undefined>(this, (reader, previous) => {
			if (!environmentPickerEnabled.read(reader)) {
				return undefined;
			}
			const environments = this._environments.read(reader);
			const picked = this._pickedEnvironment.read(reader);
			const session = this._session.read(reader);
			const provider = session && this.sessionsProvidersService.getProvider(session.providerId, session.sessionId);
			const containerRequested = provider && isAgentHostProvider(provider) && provider.isDevContainerRequested?.(session.sessionId);
			this._environmentWorkspaceChanged.read(reader);
			const providerId = this._workspacePicker?.selectedResolved?.providerId ?? session?.providerId;
			const selectedProvider = providerId ? this.sessionsProvidersService.getProvider(providerId) : undefined;
			const selected = picked
				? environments.find(environment => environment.id === picked.id) ?? picked
				: getDefaultSessionCreationEnvironment(environments, this._workspacePicker?.selectedFolderUri, providerId, !!containerRequested, selectedProvider,
					this._workspacePicker?.preselectionSource === NewSessionWorkspacePreselectionSource.CheckedWorkspace);
			return selected && previous?.id === selected.id && previous.label === selected.label
				&& previous.providerIds.length === selected.providerIds.length && previous.providerIds.every((id, index) => id === selected.providerIds[index])
				? previous : selected;
		});
		this._workspaceOptOutTarget = derived(this, reader => {
			sessionTypesChanged.read(reader);
			return this._getWorkspaceOptOutTarget(this._environment.read(reader), this._session.read(reader));
		});
		this._environmentPicker = this._register(this.instantiationService.createInstance(SessionEnvironmentPicker, this._environments, this._environment, environment => this._selectEnvironment(environment), environment => this._workspacePicker.getEnvironmentActions(environment)));

		// On web (vscode.dev / insiders.vscode.dev), use {@link WebWorkspacePicker}
		// which scopes recents to the active host and renders as a bottom
		// sheet on phone-layout viewports. On Electron desktop, the regular
		// {@link WorkspacePicker} is fine — phones never run there.
		const PickerCtor = isWeb ? WebWorkspacePicker : WorkspacePicker;
		this._workspacePicker = this._register(this.instantiationService.createInstance(PickerCtor, {
			environment: this._environment,
			environmentPickerEnabled,
			canRestoreWorkspace: () => !this._isQuickChatComposer.get() || this._newChatInput?.canApplyWorkspaceDefault === true,
			onUserSelection: () => newSessionComposerService.notifyUserWorkspaceSelection(),
			whenSelectionAccepted: async () => {
				const session = this._pendingWorkspaceCreation ? (await this._pendingWorkspaceCreation).session : this._session.get();
				return !!session && this._session.get()?.sessionId === session.sessionId;
			},
			getWorkspaceGroupAction: group => {
				if (group === SESSION_WORKSPACE_GROUP_GITHUB && shouldShowGitHubWorkspaceGroupSignIn(
					this.defaultAccountService.currentDefaultAccount !== null,
				)) {
					return {
						label: localize('workspacePicker.signInGitHub', "Sign in to GitHub"),
						icon: Codicon.signIn,
						commandId: AGENTIC_SIGN_IN_COMMAND_ID,
						hideWorkspaceItems: true,
					};
				}
				return undefined;
			},
			getNoWorkspaceOption: () => this._getNoWorkspaceOption(),
			ownNoWorkspaceSelection: !!this._draftHost,
		}));
		this._register(this._workspacePicker.onDidChangeSelection(() => this._environmentWorkspaceChanged.trigger(undefined)));
		this._register(this._workspacePicker.onDidChangeDevContainerAvailability(() => this._environmentWorkspaceChanged.trigger(undefined)));
		this._environmentWorkspaceChanged.trigger(undefined);
		this._register(autorun(reader => {
			providersChanged.read(reader);
			const activeSession = this._session.read(reader);
			activeSession?.isQuickChat?.read(reader);
			this._workspacePicker.refreshTriggerLabel();
			if (!activeSession) {
				return;
			}
			const provider = this.sessionsProvidersService.getProvider(activeSession.providerId, activeSession.sessionId);
			if (!provider || !isAgentHostProvider(provider)) {
				return;
			}
			reader.store.add(Event.filter(
				provider.onDidChangeSessionConfig,
				sessionId => sessionId === activeSession.sessionId,
			)(() => {
				this._syncWorkspacePickerDevContainerMode(activeSession, false, WorkspaceSelectionOrigin.SessionSync);
				this._environmentWorkspaceChanged.trigger(undefined);
			}));
		}));

		const feedbackChanged = observableSignalFromEvent(this, this.agentFeedbackService.onDidChangeFeedback);
		// Accepted feedback belongs to the main window's composer, so a hosted composer neither sends nor clears it.
		this._feedbackItems = this._draftHost ? constObservable([]) : derived(this, reader => {
			feedbackChanged.read(reader);
			return this.agentFeedbackService.getFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE)
				.filter(item => item.state === AgentFeedbackState.Accepted);
		});

		const comparisonWorkspaceChanged = observableSignalFromEvent(this, this._workspacePicker.onDidChangeSelection);
		const comparisonConfigResolving = derived(this, reader => {
			const session = this._session.read(reader);
			const provider = session ? this.sessionsProvidersService.getProvider(session.providerId, session.sessionId) : undefined;
			return !!session && !!provider && isAgentHostProvider(provider) && provider.isSessionConfigResolving(session.sessionId, session.mainChat.read(reader).resource).read(reader);
		});
		this._comparisonSelection = this._register(this.instantiationService.createInstance(SessionComparisonModelSelection, derived(this, reader => {
			comparisonWorkspaceChanged.read(reader);
			comparisonConfigResolving.read(reader);
			this._compareAgentsEnabled.read(reader);
			this._environment.read(reader);
			this._environmentWorkspaceChanged.read(reader);
			const session = this._session.read(reader);
			session?.workspace.read(reader);
			session?.loading.read(reader);
			session?.isQuickChat?.read(reader);
			return this._shouldShowComparisonAction(reader);
		}), modelId => this.languageModelsService.lookupLanguageModel(modelId)?.name,
			constObservable(true),
			observableFromEvent(this, Event.filter(this.configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(COMPARE_AGENTS_SHOW_PICKER_HINT_SETTING)),
				() => this.configurationService.getValue<boolean>(COMPARE_AGENTS_SHOW_PICKER_HINT_SETTING)),
			derived(this, reader => {
				comparisonWorkspaceChanged.read(reader);
				return this._isComparisonPending(reader, comparisonConfigResolving);
			})));
		const canSendRequest = derived(reader => {
			const session = this._session.read(reader);
			if (!session) {
				return false;
			}
			if (session.loading.read(reader)) {
				return false;
			}
			const environment = this._environment.read(reader);
			if (environment) {
				providersChanged.read(reader);
				sessionTypesChanged.read(reader);
				this._environmentWorkspaceChanged.read(reader);
				if (!environment.providerIds.includes(session.providerId)) {
					return false;
				}
				if (!this._canSendRequestToWorkspace(session, environment, reader)) {
					return false;
				}
			}
			return !this._comparisonSelection.enabled.read(reader)
				|| this._comparisonSelection.available.read(reader) && this._comparisonSelection.configured.read(reader);
		});

		const loading = derived(reader => {
			const session = this._session.read(reader);
			return session?.loading.read(reader) ?? false;
		});
		const hasFeedback = derived(this, reader => this._feedbackItems.read(reader).length > 0);
		const canSubmitWithoutSession = derived(this, reader => !this._environment.read(reader) && !this._session.read(reader));
		const deferredNotificationsEnabled = observableFromEvent(
			this,
			this._usage.onDidChangeCreatedSessionCount(this._store),
			() => this._hasEnoughSessionsForFirstRunNotices(),
		);

		const hostCreationProviderId = observableFromEvent(this, this.agentHostFilterService.onDidChange, () => isWeb ? this.agentHostFilterService.selectedHost?.sessionCreationProviderId : undefined);
		const creationProviderId = derived(this, reader => {
			const environment = this._environment.read(reader);
			return environment?.providerIds.length === 1 ? environment.providerIds[0] : hostCreationProviderId.read(reader);
		});
		const creationProviderKey = NewSessionCreationProviderIdContext.bindTo(contextKeyService);
		this._register(autorun(reader => creationProviderKey.set(creationProviderId.read(reader) ?? '')));
		this._register(toDisposable(() => creationProviderKey.reset()));

		const backgroundSend = this._backgroundSend;
		const newChatInput = this.instantiationService.createInstance(SharedChatInputComposer, {
			inputEditorOptions: this.options.inputEditorOptions,
			session: this._session,
			getWorkspacePreselectionSource: () => this._isQuickChatComposer.get()
				? NewSessionWorkspacePreselectionSource.None
				: this._workspacePicker.preselectionSource,
			getWorkspaceSelection: () => this._isQuickChatComposer.get()
				? { ...this._workspacePicker.selectionSnapshot, folderUri: undefined, origin: WorkspaceSelectionOrigin.None, state: 'noWorkspace' }
				: this._workspacePicker.selectionSnapshot,
			onDidChangeWorkspaceSelection: Event.any(this._workspacePicker.onDidChangeSelection, Event.fromObservableLight(this._isQuickChatComposer)),
			canApplyWorkspaceDefault: () => this._canApplyWorkspaceDefault(),
			sendRequest: async ({ query, attachments, background, userInteraction }) => this._send(query, attachments, background, userInteraction),
			inputSnapshot: this._draftHost?.input,
			get preserveInputFocusOnSend() { return backgroundSend || viewsService.getViewWithId<SessionsView>(SessionsViewId)?.grouping === SessionsGrouping.Inbox; },
			confirmSend: async query => this._comparisonSelection.enabled.get() || !this._worktreeSuggestion || this._worktreeSuggestion.confirmBeforeSend(query),
			modelPickerComparison: this._comparisonSelection,
			sendButtonLabel: derived(this, reader => this._comparisonSelection.enabled.read(reader)
				? localize('comparisonPicker.runAttempts', "Run {0} Attempts", this._comparisonSelection.attemptModelIds.read(reader).length)
				: undefined),
			inputVisible: this.options.inputVisible,
			hostVisible: this.options.hostVisible,
			canSendRequest,
			canSubmitWithoutSession,
			hasAdditionalSendContent: hasFeedback,
			loading,
			placeholder: NEW_SESSION_PROMPT_PLACEHOLDER,
			onboardingTargetId: 'sessions.newSession.input',
			supportsBackground: true,
			...this._globalTargetOptions(),
			deferredNotificationsEnabled,
			petHostPreferred: this.options.petHostPreferred,
			renderChatPet: this.options.renderChatPet,
			getChatPetPlatformElements: () => [
				...(this._welcomeMessageTitle ? [this._welcomeMessageTitle] : []),
				...this._workspacePicker.getChatPetPlatformElements(),
			],
			getChatPetBasePlatformElement: () => this._workspacePickerRow?.classList.contains('new-chat-session-options') ? this._workspacePickerRow : undefined,
			getChatPetJumpGameElement: () => this._welcomeMessageTitle,
			onDidChangeChatPetPlatform: Event.any(this._workspacePicker.onDidChangeChatPetPlatform, this._onDidChangeChatPetPlatform.event),
			setChatPetPlatformOccupation: occupation => this._setChatPetPlatformOccupation(occupation),
			sessionTypePickerOptions: {
				providerId: creationProviderId,
				allowedProviders: derived(this, reader => {
					providersChanged.read(reader);
					return this._environment.read(reader)?.providerIds ?? this.sessionsProvidersService.getProviders().map(provider => provider.id);
				}),
				presentation: derived(this, reader => this._environment.read(reader)?.kind === 'cloud' ? { label: localize('environmentPicker.copilot', "Copilot"), icon: Codicon.copilot } : undefined),
				prepareSessionTypeSelection: pick => this._prepareSessionTypeSelection(pick),
				focusCommand: {
					id: FOCUS_NEW_SESSION_HARNESS_PICKER_COMMAND_ID,
					label: localize('newSessionHarnessPicker.tooltip', "Agent harness for the new session"),
					when: FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN,
					enabled: constObservable(true),
				},
			},
		});
		this._register(toDisposable(() => newChatInput.saveState()));
		this._newChatInput = this._register(newChatInput);
		this._register(this._trackSessionPreparation());
		this._register(this._trackComparisonSelection(comparisonConfigResolving));
		this.pickerVisibility = derived(this, reader => this._activeEmptyState.read(reader)
			? noSessionPickerVisibility
			: newChatInput.pickerVisibility.visibility.read(reader));
		const workspacePickerSelectionChanged = observableSignalFromEvent(this, this._workspacePicker.onDidChangeSelection);
		this._newChatInput.sessionTypePicker.setSessionWorkspaceFolderSource(derived(this, reader => {
			workspacePickerSelectionChanged.read(reader);
			return this._isQuickChatComposer.read(reader) ? undefined : this._workspacePicker.selectedFolderUri;
		}));
		if (this.options.initialAttachments?.length) {
			this._newChatInput.addAttachments(...this.options.initialAttachments);
		}

		this._register(newSessionComposerService.registerComposer(this._newChatInput, derived(this, reader => this._takesGlobalComposerActions(reader))));

		// Comment 3: Bind Agent mode in the scoped context so that Agent-only tips
		// (messageQueueing, subagents, etc.) are eligible and chatModeKind-based
		// when-clauses evaluate correctly against this composer's actual mode.
		const chatModeKindKey = ChatContextKeys.chatModeKind.bindTo(contextKeyService);
		chatModeKindKey.set(ChatModeKind.Agent);
		this._register(toDisposable(() => chatModeKindKey.reset()));

		// Comment 4: Route tip command links to this composer's own pickers
		// so they do not fall through to IChatWidgetService.lastFocusedWidget
		// (which this composer is not registered with).
		this._register(this.openerService.registerOpener({
			open: async (resource: URI | string): Promise<boolean> => {
				if (!this._chatTipPresenter.value?.current) {
					return false;
				}
				const link = typeof resource === 'string' ? resource : resource.toString();
				if (link === 'command:workbench.action.chat.openModelPicker') {
					this._newChatInput.openModelPicker();
					return true;
				}
				if (link === 'command:workbench.action.chat.openPlan') {
					// Plan mode is not available in the new-session composer; consume
					// the link without action so it does not misfire on a stale widget.
					return true;
				}
				return false;
			}
		}));

		this._register(this._workspacePicker.onDidSelectWorkspace(folderUri => this._handleWorkspaceSelection(folderUri)));
		this._register(this._workspacePicker.onDidSelectWorkspaceMode(({ folderUri, preferDevContainer }) => {
			const environment = this._environment.get();
			this._preferredDevContainerFolderUri = preferDevContainer || environment?.kind === 'container' ? folderUri : undefined;
			if (preferDevContainer && environment && environment.kind !== 'container') {
				this._pickedEnvironment.set({ ...environment, id: `container:${environment.id}`, kind: 'container', label: localize('environmentPicker.container', "Dev Container"), icon: Codicon.remote }, undefined);
			}
		}));
		this._register(this._workspacePicker.onDidSelectContext(context => {
			const contextUri = context.uri.toString();
			this._newChatInput.attachTextContext(
				context.label,
				`GitHub context: ${contextUri}`,
				context.icon,
				`github-context:${contextUri}`,
			);
			this._newChatInput.focus();
		}));
		this._register(this._workspacePicker.onDidSelectFolderContext(folderUri => {
			this._newChatInput.addAttachments({
				kind: 'directory',
				id: getAdditionalFolderContextId(folderUri),
				name: basename(folderUri),
				value: folderUri,
			});
			this._newChatInput.focus();
		}));
		this._register(this._workspacePicker.onDidSelectRepositoryContext(({ workspace }) => {
			const folderUri = workspace.folders[0].root;
			this._newChatInput.addAttachments({
				kind: 'generic',
				id: getAdditionalRepositoryContextId(workspace.uri),
				name: workspace.label,
				value: folderUri,
				icon: workspace.icon,
			});
			this._newChatInput.focus();
		}));
		this._register(this._workspacePicker.onDidRemoveAttachedContext(id => this._newChatInput.removeAttachment(id)));
		const syncAttachedContext = () => this._workspacePicker.syncAttachedContext(this._newChatInput.attachments);
		syncAttachedContext();
		this._register(this._newChatInput.onDidChangeAttachments(() => {
			syncAttachedContext();
		}));
		this._register(this._newChatInput.sessionTypePicker.onDidSelectSessionType(async pick => {
			this.newSessionComposerService.notifyUserWorkspaceSelection();
			this._requestTarget(target => ({ ...target, providerId: pick?.providerId, sessionTypeId: pick?.sessionTypeId }));
			// A quick chat has no folder: re-create the draft with the picked
			// type via openQuickChat (mirrors the folder path's draft recreation).
			if (this._isQuickChatComposer.get()) {
				this._pendingPreferredUpgrade.clear();
				this._openQuickChat(pick ? { providerId: pick.providerId, sessionTypeId: pick.sessionTypeId } : undefined);
				this._newChatInput.focus();
				return;
			}
			await this._onWorkspaceSelected(this._workspacePicker.selectedFolderUri, pick);
			this._newChatInput.focus();
		}));
		this._register(this.sessionsManagementService.onDidChangeSessionTypes(() => this._restoreNoWorkspaceDraft()));
		if (this._draftHost?.setRequestedTarget) {
			this._register(this._trackUserModelSelections());
			this._register(this._trackUserAgentSelections());
		}
		if (this._draftHost) {
			this._register(this._reseedAfterFailedSend(this._draftHost));
		}

		// Comment 2: Re-evaluate the tip when the selected model changes, because
		// some tips (e.g. tip.switchToAuto) are only eligible for specific models.
		let previousModelId: string | undefined;
		this._register(autorun(reader => {
			const modelId = this._newChatInput.selectedModelState.read(reader).currentModel?.identifier;
			if (previousModelId !== undefined && previousModelId !== modelId) {
				this._renderChatTip();
			}
			previousModelId = modelId;
		}));

		// Re-sync the picker's displayed selection when the session's workspace
		// changes externally (e.g. sessionsService.openNewSession({ folderUri })).
		let previousFolderUri = this._session.get()?.workspace.get()?.folders[0]?.root;
		this._register(autorun(reader => {
			const session = this._session.read(reader);
			const workspace = session?.workspace.read(reader);
			const folderUri = workspace?.folders[0]?.root;
			this._handlePromptOptionsWorkspaceChange(previousFolderUri, folderUri);
			previousFolderUri = folderUri;
			this._syncWorkspacePickerFromSessionWorkspace(workspace);
		}));
	}

	private _trackSessionPreparation(): IDisposable {
		const changed = observableSignalFromEvent(this, this._newChatInput.onDidChangeInput);
		return autorun(reader => {
			changed.read(reader);
			const session = this._session.read(reader);
			if (session && !isSessionCreated(session, reader) && !session.isNewSessionRequestInProgress?.read(reader)
				&& this._newChatInput.getInputValue().trim()) {
				this.sessionsProvidersService.getProvider(session.providerId, session.sessionId)?.prepareNewSessionWhileComposing?.(session.sessionId);
			}
		});
	}

	private _trackComparisonSelection(configurationResolving: IObservable<boolean>): IDisposable {
		let comparisonHarness: string | undefined;
		return autorun(reader => {
			const session = this._session.read(reader);
			const harness = session ? JSON.stringify([session.providerId, session.sessionType]) : undefined;
			if (!this._compareAgentsEnabled.read(reader) || harness !== undefined && comparisonHarness !== undefined && harness !== comparisonHarness) {
				this._comparisonSelection.reset();
			}
			if (harness !== undefined) {
				comparisonHarness = harness;
			}
			this._newChatInput.selectedModelState.read(reader);
			if (session && !session.loading.read(reader) && !configurationResolving.read(reader) && this._comparisonSelection.available.read(reader)) {
				this._comparisonSelection.retainModels(this._getComparisonModelIds());
			}
		});
	}

	private _syncWorkspacePickerFromSessionWorkspace(workspace: ISessionWorkspace | undefined): void {
		const folderUri = workspace?.folders[0]?.root;
		if (folderUri && !this._workspacePicker.matchesSelectedWorkspace(workspace)) {
			this._workspacePicker.setSelectedWorkspace(folderUri, { fireEvent: false, origin: WorkspaceSelectionOrigin.SessionSync });
		}
	}

	private _handlePromptOptionsWorkspaceChange(previousFolderUri: URI | undefined, folderUri: URI | undefined): void {
		const workspaceChanged = previousFolderUri
			? !folderUri || !this.uriIdentityService.extUri.isEqual(previousFolderUri, folderUri)
			: !!folderUri;
		if (!workspaceChanged) {
			return;
		}
		if (folderUri) {
			void this._refreshPromptOptions();
		} else {
			this._newChatInput.clearPromptOptions();
		}
	}

	// --- Rendering ---

	get inputContentElement(): HTMLElement | undefined {
		return this._inputContentElement;
	}

	render(parent: HTMLElement): void {
		const element = dom.append(parent, dom.$('.sessions-chat-widget'));
		const composerFocus = NewSessionComposerFocusContext.bindTo(this.contextKeyService);
		const focusTracker = this._register(dom.trackFocus(element));
		this._register(focusTracker.onDidFocus(() => composerFocus.set(true)));
		this._register(focusTracker.onDidBlur(() => composerFocus.set(false)));
		this._register(toDisposable(() => composerFocus.reset()));
		const chatWidgetContainer = dom.append(element, dom.$('.new-chat-widget-container'));
		const chatWidgetContent = this._inputContentElement = dom.append(chatWidgetContainer, dom.$(`.new-chat-widget-content.${chatInputStackClass}`));
		const welcomeMessage = dom.append(chatWidgetContent, dom.$('.new-session-welcome-message'));
		const welcomeMessageTitle = dom.append(welcomeMessage, dom.$('h2.new-session-welcome-message-title'));
		this._welcomeMessageTitle = welcomeMessageTitle;
		this._welcomePetPlatform = dom.append(welcomeMessage, dom.$('span.new-session-welcome-pet-platform', { 'aria-hidden': 'true' }));
		const welcomeMessageActions = dom.append(welcomeMessage, dom.$('.new-session-welcome-message-actions'));
		this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, welcomeMessageActions, Menus.NewSessionWelcome, {
			ariaLabel: localize('newSession.welcome.actions', "Welcome message actions"),
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: { primaryGroup: () => true },
			telemetrySource: 'newSessionWelcome',
			menuOptions: { arg: welcomeMessageActions },
		}));
		this._register(dom.addDisposableListener(welcomeMessage, dom.EventType.CONTEXT_MENU, event => {
			event.preventDefault();
			event.stopPropagation();
			const mouseEvent = new StandardMouseEvent(dom.getWindow(welcomeMessage), event);
			this.contextMenuService.showContextMenu({
				getAnchor: () => mouseEvent,
				menuId: Menus.NewSessionWelcomeContext,
				contextKeyService: this.contextKeyService,
			});
		}));

		const welcomeName = this._register(this.instantiationService.createInstance(WelcomeName, this._showWelcomePhrases));
		const configuredWelcomeMessagesChanged = observableSignalFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(NEW_SESSION_WELCOME_MESSAGES_SETTING)),
		);
		this._register(autorun(reader => {
			configuredWelcomeMessagesChanged.read(reader);
			const inputVisible = this.options.inputVisible?.read(reader) ?? true;
			const phrases = getNewSessionWelcomePhrases(
				this.configurationService.getValue<INewSessionWelcomeMessagesConfiguration | undefined>(NEW_SESSION_WELCOME_MESSAGES_SETTING),
				welcomeName.name.read(reader),
			);
			const phrase = this._updateWelcomeMessage(
				welcomeMessage,
				welcomeMessageTitle,
				this._showWelcomePhrases.read(reader),
				phrases,
				this._welcomePhraseIndex,
			);
			chatWidgetContent.classList.toggle('welcome-phrases-visible', !!phrase);
			this._onDidChangeChatPetPlatform.fire();
			this._announceWelcomeMessage(phrase, inputVisible);
		}));

		if (this.options.renderAquarium !== false) {
			this._aquariumToggle = this._register(this.aquariumService.mountToggle(element));
		}
		const aquariumAction = this._register(new Action(
			'sessions.aquarium.showAction',
			localize('aquariumAction', "Aquarium"),
			undefined,
			true,
			() => this.aquariumService.toggleActionVisibility()
		));
		const petAction = this._register(new Action(
			'sessions.chatPet.toggle',
			localize('petAction', "Pet (/vscode-pet)"),
			undefined,
			true,
			() => this.chatPetService.toggle()
		));
		this._register(dom.addDisposableListener(element, dom.EventType.CONTEXT_MENU, (e: MouseEvent) => {
			const target = e.target as Node | null;
			if (target && chatWidgetContent.contains(target)) {
				return;
			}

			e.preventDefault();
			e.stopPropagation();
			aquariumAction.checked = this.aquariumService.actionVisible.get();
			petAction.checked = this.chatPetService.enabled.get();
			const anchor = new StandardMouseEvent(dom.getWindow(element), e);
			this.contextMenuService.showContextMenu({
				menuId: Menus.SessionChatBackgroundContext,
				contextKeyService: this.contextKeyService,
				getAnchor: () => anchor,
				getActions: () => [
					...(this.options.renderAquarium !== false ? [aquariumAction] : []),
					...(this.options.renderChatPet !== false ? [petAction] : []),
				],
				getCheckedActionsRepresentation: () => 'checkbox',
			});
		}));

		this._renderBackgroundSendStatus(chatWidgetContent);
		const workspacePickerContainer = dom.append(chatWidgetContent, dom.$('.new-session-workspace-picker-container'));
		// On web (vscode.dev / insiders.vscode.dev) the workspace picker is
		// scoped to the currently selected agent host. When no hosts are
		// known there is nothing for the user to pick, so swap the picker
		// out for the no-agent-host empty state. On Electron desktop the
		// regular picker is always functional (the local Copilot provider
		// is always available) so this branch is web-only.
		this._register(isWeb
			? this._renderEmptyStateGate(workspacePickerContainer, chatWidgetContent)
			: this._renderWorkspacePicker(workspacePickerContainer));

		if (!isWeb) {
			this._quickChatHeaderPickerHost = dom.append(chatWidgetContent, dom.$('.new-session-quick-chat-header.sessions-workspace-category-picker'));
		}

		this._renderFeedbackBanner(chatWidgetContent);
		this._newChatInput.render(chatWidgetContent, parent);
		this._register(autorun(reader => {
			const isQuickChat = this._isQuickChatComposer.read(reader);
			const isWorkspacePickerQuickChat = this._isWorkspacePickerQuickChat.read(reader);
			chatWidgetContent.classList.add('experimental-new-session-composer');
			this._newChatInput.placeRepositoryControls(
				!isQuickChat || isWorkspacePickerQuickChat
					? this._workspaceRepositoryControlsHost
					: undefined
			);
		}));
		const belowInputSurfaces = dom.append(chatWidgetContent, dom.$(`.new-session-below-input-surfaces.${chatInputSurfaceStackClass}`));
		const updateBelowInputSurfacesHeight = () => {
			if (chatWidgetContainer.closest('.phone-layout')) {
				belowInputSurfaces.style.removeProperty('max-height');
				return;
			}
			const availableHeight = chatWidgetContainer.getBoundingClientRect().bottom - belowInputSurfaces.getBoundingClientRect().top;
			belowInputSurfaces.style.maxHeight = `${Math.max(0, availableHeight)}px`;
		};
		const belowInputSurfacesResizeObserver = this._register(new dom.DisposableResizeObserver(
			'NewChatWidget.belowInputSurfaces',
			updateBelowInputSurfacesHeight,
			dom.getWindow(belowInputSurfaces),
		));
		this._register(belowInputSurfacesResizeObserver.observe(chatWidgetContainer));
		this._register(belowInputSurfacesResizeObserver.observe(chatWidgetContent));
		this._register(toDisposable(() => belowInputSurfaces.style.removeProperty('max-height')));
		this._register(this.instantiationService.createInstance(NewChatConnectorRecommendations, {
			getInputValue: () => this._newChatInput.getInputValue(),
			onDidChangeInputValue: this._newChatInput.onDidChangeInput,
		}, undefined));

		// The tip, migration notice and worktree suggestion below the input show one at a time, by priority,
		// and only once the user started enough sessions.
		const banners = this._register(this.instantiationService.createInstance(NewSessionBanners));
		const chatTipContainer = dom.$(`.new-session-getting-started-tip.new-session-getting-started-tip-below.chat-getting-started-tip-container.${chatInputStackSlotClass}`);
		belowInputSurfaces.prepend(chatTipContainer);
		this._register(this.instantiationService.createInstance(NewChatMigrationNotice, belowInputSurfaces, banners, this._session, () => this.focusInput()));
		this._worktreeSuggestion = this._register(this.instantiationService.createInstance(WorktreeSuggestionController, belowInputSurfaces, {
			session: this._session,
			pickerVisibility: this._newChatInput.pickerVisibility,
			visible: derived(this, reader => (this.options.hostVisible?.read(reader) ?? true) && (this.options.inputVisible?.read(reader) ?? true)),
			getInputValue: () => this._newChatInput.getInputValue(),
			onDidChangeInput: this._newChatInput.onDidChangeInput,
			focusInput: () => this.focusInput(),
			revealIsolationPicker: () => this._sessionOptionsExpanded.set(true, undefined),
			openIsolationPicker: () => this.focusWorktreePicker({ focusValue: 'worktree' }),
			banners,
		}));
		const foregroundSessionCountKeys = new Set([ChatContextKeys.foregroundSessionCount.key]);
		const foregroundSessionCount = observableFromEvent(this,
			Event.filter(this.contextKeyService.onDidChangeContext, e => e.affectsSome(foregroundSessionCountKeys)),
			() => this.contextKeyService.getContextKeyValue<number>(ChatContextKeys.foregroundSessionCount.key));
		const tipsEnabled = observableConfigValue<boolean>('chat.tips.enabled', true, this.configurationService);
		// The composer owns one foreground chat widget itself. Another foreground widget raises the count
		// above one and suppresses the tip, as does the no-agent-host empty state.
		const chatTipBanner = this._register(banners.register(NewSessionBannerPriority.Tip, derived(this, reader => tipsEnabled.read(reader) && shouldShowNewSessionChatTip(
			!this._activeEmptyState.read(reader),
			foregroundSessionCount.read(reader),
		))));
		this._chatTipPresenter.value = this.instantiationService.createInstance(
			ChatInputTipPresenter,
			{
				container: chatTipContainer,
				// Reset tip rotation the first time this composer becomes the only
				// foreground surface, so a returning user gets a fresh tip.
				onBeforeUpdate: () => this._prepareChatTipSession(),
				isEligible: () => chatTipBanner.isShowing.get(),
				focusInput: () => this.focusInput(),
			},
			this._newChatInput.noticeHost,
		);
		// Re-evaluates the tip as its conditions change, and as other banners take or free the space. Every
		// change of the foreground count does, so returning from other foreground chats resets tip rotation.
		this._register(autorun(reader => {
			foregroundSessionCount.read(reader);
			this._updateChatTip(chatTipBanner.isShowing.read(reader), chatTipContainer);
		}));

		// Quick chat composer: retain the picker only when it created the
		// workspace-less draft, so the user can switch back to a workspace.
		// Quick chats are only created on desktop (the local agent host), so
		// leave the web empty-state gate's key management untouched.
		this._register(autorun(reader => {
			const isQuickChat = this._isQuickChatComposer.read(reader);
			const isWorkspacePickerQuickChat = this._isWorkspacePickerQuickChat.read(reader);
			chatWidgetContent.classList.toggle('quick-chat', isQuickChat && !isWorkspacePickerQuickChat);
			this._workspacePicker.refreshPresentation();
			if (!isWeb) {
				this._newChatInput.pickerVisibility.setVisible('workspace', !isQuickChat || isWorkspacePickerQuickChat);
			}
		}));

		if (!isWeb) {
			this._register(autorun(reader => {
				const isQuickChat = this._isQuickChatComposer.read(reader);
				const isWorkspacePickerQuickChat = this._isWorkspacePickerQuickChat.read(reader);
				this._compareAgentsEnabled.read(reader);
				const session = this._session.read(reader);
				session?.loading.read(reader);
				const provider = session ? this.sessionsProvidersService.getProvider(session.providerId, session.sessionId) : undefined;
				if (session && provider && isAgentHostProvider(provider)) {
					provider.isSessionConfigResolving(session.sessionId, session.mainChat.read(reader).resource).read(reader);
				}
				const useHeaderHost = isQuickChat && !isWorkspacePickerQuickChat;
				const target = useHeaderHost ? this._quickChatHeaderPickerHost : this._workspaceSessionOptionsHost;
				if (!target) {
					return;
				}
				this._renderSessionTypePicker(target, useHeaderHost);
			}));
		}

		// Create initial session for any workspace already selected at construct time.
		// If the selection arrives later (provider registers asynchronously), the
		// picker fires onDidSelectWorkspace and our listener handles it.
		// Skip if an active session already exists (restored by openNewSession
		// from a new-session draft when navigating back from another session).
		this._seedWorkspaceDraft();

		// Re-seed the selected target when the composer swaps out of quick-chat
		// mode without another active draft.
		if (!isWeb) {
			let wasQuickChat = this._isQuickChatComposer.get();
			this._register(autorun(reader => {
				const isQuickChat = this._isQuickChatComposer.read(reader);
				if (wasQuickChat && !isQuickChat && !this._session.read(reader)) {
					if (!this._workspacePicker.refreshAutomaticSelection()) {
						this._seedWorkspaceDraft();
					}
				}
				wasQuickChat = isQuickChat;
			}));
		}

		chatWidgetContainer.classList.add('revealed');
	}

	private async _prepareSessionTypeSelection(pick: IPickedSessionType): Promise<boolean> {
		const folderUri = this._workspacePicker.selectedFolderUri;
		if (!folderUri || this._isPreferredServable(folderUri, pick)) {
			return true;
		}
		const workspace = this._workspacePicker.selectedResolved?.workspace;
		if (folderUri.scheme !== GITHUB_REMOTE_FILE_SCHEME || workspace?.group !== SESSION_WORKSPACE_GROUP_GITHUB) {
			return false;
		}
		const [owner, repository] = folderUri.path.split('/').filter(Boolean);
		if (!owner || !repository) {
			return false;
		}
		try {
			const repositoryPath = await this.commandService.executeCommand<string>(
				'git.clone',
				`https://github.com/${owner}/${repository}.git`,
				undefined,
				{ postCloneAction: 'none', returnRepositoryPath: true },
			);
			if (!repositoryPath || repositoryPath.endsWith('.code-workspace')) {
				return false;
			}
			const localFolderUri = URI.file(repositoryPath);
			if (!this._isPreferredServable(localFolderUri, pick)) {
				this.logService.error(`Selected session type '${pick.sessionTypeId}' cannot use cloned repository '${localFolderUri.toString()}'`);
				return false;
			}
			this._workspacePicker.setSelectedWorkspace(localFolderUri, { fireEvent: false, providerId: pick.providerId });
			return true;
		} catch (error) {
			if (!isCancellationError(error)) {
				onUnexpectedError(error);
			}
			return false;
		}
	}

	private _updateWelcomeMessage(container: HTMLElement, title: HTMLElement, visible: boolean, phrases: readonly string[], phraseIndex: number): string | undefined {
		container.hidden = !visible || phrases.length === 0;
		if (!visible || phrases.length === 0) {
			title.textContent = '';
			return undefined;
		}

		const phrase = phrases[phraseIndex % phrases.length];
		title.textContent = phrase;
		return phrase;
	}

	private _setChatPetPlatformOccupation(occupation: IChatPetPlatformOccupation | undefined): void {
		const title = this._welcomeMessageTitle;
		if (!title) {
			return;
		}
		const bounds = title.getBoundingClientRect();
		const platform = this._welcomePetPlatform;
		const occupied = !!occupation
			&& !!platform
			&& bounds.width > 0
			&& bounds.height > 0
			&& occupation.centerX >= bounds.left
			&& occupation.centerX <= bounds.right
			&& Math.abs(occupation.top - bounds.top) < 1;
		title.classList.toggle('chat-pet-platform-occupied', occupied);
		if (occupied && platform) {
			const platformParentBounds = platform.parentElement?.getBoundingClientRect() ?? bounds;
			platform.style.left = `${occupation.centerX - platformParentBounds.left}px`;
			platform.style.width = `${occupation.width}px`;
		} else {
			platform?.style.removeProperty('left');
			platform?.style.removeProperty('width');
		}
	}

	private _announceWelcomeMessage(phrase: string | undefined, inputVisible: boolean): void {
		if (
			!phrase
			|| !inputVisible
			|| this._welcomePhraseAnnounced
			|| !this.accessibilityService.isScreenReaderOptimized()
			|| !this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.NewSessionWelcome)
		) {
			return;
		}

		this._welcomePhraseAnnounced = true;
		this.accessibilityService.status(localize(
			'newSession.welcome.announcement',
			"{0}\nTo disable this announcement, set {1} to false.",
			phrase,
			AccessibilityVerbositySettingId.NewSessionWelcome,
		));
	}

	private _renderChatTip(): void {
		this._chatTipPresenter.value?.update();
	}

	/** Re-evaluates the tip in `container`. Focus inside it returns to the input as it makes way for another banner. */
	private _updateChatTip(isShowing: boolean, container: HTMLElement): void {
		const tipFocused = !isShowing && dom.isAncestorOfActiveElement(container);
		this._renderChatTip();
		if (tipFocused) {
			this.focusInput();
		}
	}

	private _prepareChatTipSession(): void {
		if (this.contextKeyService.getContextKeyValue<number>(ChatContextKeys.foregroundSessionCount.key) !== 1) {
			this._isChatTipSessionInitialized = false;
		} else if (!this._isChatTipSessionInitialized) {
			this._isChatTipSessionInitialized = true;
			this.chatTipService.resetSession();
		}
	}

	private _hasEnoughSessionsForFirstRunNotices(): boolean {
		return this._usage.createdSessionCount >= MIN_SESSIONS_FOR_FIRST_RUN_NOTICES;
	}

	/**
	 * Seed the new-session draft from the workspace picker's restored folder,
	 * unless an active session already exists (then just sync the picker to it).
	 */
	private _seedWorkspaceDraft(): void {
		const restoredFolderUri = this._workspacePicker.selectedFolderUri;
		if (this._syncWorkspacePickerFromActiveSession()) {
			if (this._draftHost) {
				this._resumeRequestedTargetUpgrade();
			}
			return;
		}
		// A hosted composer starts from what its host requests, such as another chat's defaults, not from the main
		// composer's last workspace.
		const requested = this._draftHost?.requestedTarget?.get();
		if (requested) {
			this._seedRequestedTarget(requested);
			return;
		}
		if (restoredFolderUri) {
			void this._createNewSession(restoredFolderUri);
		} else {
			void this._restoreNoWorkspaceDraft();
		}
	}

	/**
	 * A hosted composer whose foreground request ended without starting its session, and without its slot taking the
	 * draft back, such as one its provider removed, creates a fresh draft of what it aims for, so that sending again does
	 * not ask for a workspace. Never over a draft its slot already holds, nor while it creates one.
	 */
	private _reseedAfterFailedSend(host: INewSessionDraftHost): IDisposable {
		return this.sessionsManagementService.onDidEndNewSessionRequest(({ owner, started, readopted }) => {
			if (owner !== host.slot || started || readopted || host.slot.newSession.get() || this._pendingWorkspaceCreation) {
				return;
			}
			const target = host.requestedTarget?.get();
			const folderUri = this._workspacePicker.selectedFolderUri;
			if (target) {
				this._seedRequestedTarget(target);
			} else if (folderUri) {
				void this._createNewSession(folderUri);
			} else {
				this.selectNoWorkspace(undefined, { userSelection: false });
			}
		});
	}

	private _seedRequestedTarget(target: INewSessionTarget): void {
		const pick = target.sessionTypeId ? { providerId: target.providerId, sessionTypeId: target.sessionTypeId } : undefined;
		if (target.folderUri) {
			// In a Dev Container, as the session it inherits from runs, its environment shows that.
			if (target.requireDevContainer) {
				this._reconcileWorkspaceEnvironment({ providerId: target.providerId, preferDevContainer: true });
			}
			// Not persisted: the main composer's last workspace stays its own.
			this._workspacePicker.setSelectedWorkspace(target.folderUri, { fireEvent: false, providerId: target.providerId, ...(target.requireDevContainer ? { preferDevContainer: true } : {}), persist: false, origin: WorkspaceSelectionOrigin.RestoredDraft });
			void this._createNewSession(target.folderUri, pick);
		} else {
			this._selectRequestedNoWorkspace(target);
		}
	}

	/** Whether `session` is a draft of the agent `target` requests. */
	private _isRequestedAgent(session: ISession, target: INewSessionTarget): boolean {
		return (target.providerId === undefined || session.providerId === target.providerId)
			&& (target.sessionTypeId === undefined || session.sessionType === target.sessionTypeId);
	}

	/**
	 * Creates the workspace-less draft of the requested agent, with its model and mode; while that agent is unavailable, a
	 * draft of the agent available instead, which is replaced once the requested agent becomes available.
	 */
	private _selectRequestedNoWorkspace(target: INewSessionTarget): void {
		const requested: ICreateNewSessionOptions | undefined = target.sessionTypeId
			? { providerId: target.providerId, sessionTypeId: target.sessionTypeId }
			: target.providerId ? { providerId: target.providerId } : undefined;
		const available = !requested || this.sessionsManagementService.isQuickChatTargetAvailable({ providerId: requested.providerId, sessionTypeId: requested.sessionTypeId });
		const session = this.selectNoWorkspace(available ? requested : undefined, { userSelection: false, preserveNavigation: true });
		if (!session || !this._isRequestedAgent(session, target)) {
			this._scheduleRequestedNoWorkspaceUpgrade();
		}
	}

	/**
	 * Watches for the requested agent of a workspace-less draft as agents change, and creates its draft once it is
	 * available, or a draft of the agent available instead while there is none. What it creates follows the requested
	 * target at that time, so a choice the user made since wins; the user's own choices stop it.
	 */
	private _scheduleRequestedNoWorkspaceUpgrade(): void {
		const store = new DisposableStore();
		store.add(this.sessionsManagementService.onDidChangeSessionTypes(() => {
			const target = this._draftHost?.requestedTarget?.get();
			const session = this._session.get();
			if (!target || target.folderUri || (session && (isSessionCreated(session) || this._isRequestedAgent(session, target)))) {
				if (this._pendingPreferredUpgrade.value === store) {
					this._pendingPreferredUpgrade.clear();
				}
				return;
			}
			const available = this.sessionsManagementService.isQuickChatTargetAvailable({ providerId: target.providerId, sessionTypeId: target.sessionTypeId });
			// A draft of another agent stays until the requested one is available.
			if (available || !session) {
				this._selectRequestedNoWorkspace(target);
			}
		}));
		this._pendingPreferredUpgrade.value = store;
	}

	/**
	 * Resumes waiting for the requested agent when the composer shows again with the draft of another agent it kept, such
	 * as after its view was recreated: its draft stays until that agent is available. A kept draft of the requested agent
	 * gets what it still lacks of the requested selection, such as a custom agent that its agent lists only now or later.
	 * A kept draft of another workspace than the requested one is replaced first.
	 */
	private _resumeRequestedTargetUpgrade(): void {
		const target = this._draftHost?.requestedTarget?.get();
		const session = this._session.get();
		if (!target || !session || isSessionCreated(session)) {
			return;
		}
		const keptWorkspace = session.isQuickChat?.get() ? undefined : session.workspace.get();
		const keptFolderUri = keptWorkspace?.folders[0]?.root;
		if (target.folderUri && (!keptWorkspace || !this._workspacePicker.isWorkspaceOfFolder(keptWorkspace, target.folderUri))) {
			void this._reopenRequestedWorkspace(target.folderUri, target, session, keptFolderUri);
			return;
		}
		if (this._isRequestedAgent(session, target)) {
			// What the composer still applies to it, such as a custom agent its agent did not list yet.
			this._applyRequestedSelection(session);
			return;
		}
		if (!target.folderUri) {
			if (session.isQuickChat?.get()) {
				this._scheduleRequestedNoWorkspaceUpgrade();
				if (this.sessionsManagementService.isQuickChatTargetAvailable({ providerId: target.providerId, sessionTypeId: target.sessionTypeId })) {
					this._selectRequestedNoWorkspace(target);
				}
			}
			return;
		}
		// The kept draft is of the requested folder, maybe as its repository, such as a cloud agent's: the requested agent
		// creates its draft of the requested folder.
		if (target.sessionTypeId) {
			this._scheduleRecreateOnProviderChange(target.folderUri, { providerId: target.providerId, sessionTypeId: target.sessionTypeId }, session, true);
		}
	}

	/**
	 * Applies what the host requests to a new draft of the requested agent: its custom agent, the mode its chat shows,
	 * and its model, each only when the draft's agent offers it, so that it otherwise starts as the agent's default. A
	 * draft is created without them: a creation's mode is the agent's session mode, not its custom agent, and a model
	 * is taken only with its configuration. The custom agent goes first, as selecting it can choose its own model.
	 */
	private _applyRequestedSelection(session: ISession | undefined): void {
		const target = this._draftHost?.requestedTarget?.get();
		this._pendingRequestedAgent.clear();
		if (!session || !target || isSessionCreated(session) || !this._isRequestedAgent(session, target)) {
			return;
		}
		const provider = this.sessionsProvidersService.getProvider(session.providerId, session.sessionId);
		if (!provider) {
			return;
		}
		try {
			if (target.modeId && isAgentHostProvider(provider) && !this._isSameCustomAgent(session, session.mode.get()?.id, target.modeId)) {
				if (!this._applyRequestedAgent(provider, session, target.modeId)) {
					this._waitForRequestedAgent(provider, session, target.modeId);
				}
			}
			this._applyRequestedModel(provider, session, target.modelId);
		} catch (error) {
			this.logService.error('Failed to apply the requested selection:', error);
		}
	}

	/** Whether `a` and `b` name the same custom agent of `session`, such as in the client's and its agent host's URIs. */
	private _isSameCustomAgent(session: ISession, a: string | undefined, b: string | undefined): boolean {
		if (a === b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		const provider = this.sessionsProvidersService.getProvider(session.providerId, session.sessionId);
		if (!provider || !isAgentHostProvider(provider)) {
			return false;
		}
		const agentOf = (uri: string) => provider.resolveCustomAgent?.(session.sessionId, uri)?.uri;
		const agent = agentOf(a);
		return !!agent && agent === agentOf(b);
	}

	/** Selects the custom agent `uri` for `session` when its agent offers it; whether it did. */
	private _applyRequestedAgent(provider: IAgentHostSessionsProvider, session: ISession, uri: string): boolean {
		const agent = provider.resolveCustomAgent?.(session.sessionId, uri) ?? provider.getCustomAgents(session.sessionId).find(candidate => candidate.uri === uri);
		if (!agent) {
			return false;
		}
		provider.setAgent?.(session.sessionId, { uri, name: agent.name });
		return true;
	}

	/**
	 * Applies the requested custom agent once the draft's agent lists it, as its customizations arrive after the draft is
	 * created. What the draft selects meanwhile is what it starts with. The first list without it means it is not
	 * offered, and the draft keeps its selection; so it also stops once the draft is replaced, sent or created.
	 */
	private _waitForRequestedAgent(provider: IAgentHostSessionsProvider, session: ISession, uri: string): void {
		const store = new DisposableStore();
		store.add(provider.onDidChangeCustomAgents(() => {
			const current = this._session.get();
			if (current?.sessionId !== session.sessionId || isSessionCreated(current) || this._draftHost?.requestedTarget?.get()?.modeId !== uri) {
				this._pendingRequestedAgent.clear();
				return;
			}
			if (provider.getCustomAgents(session.sessionId).length === 0) {
				return;
			}
			this._pendingRequestedAgent.clear();
			try {
				if (this._applyRequestedAgent(provider, session, uri)) {
					// Selecting the agent can choose its own model: the requested model stays.
					this._applyRequestedModel(provider, session, this._draftHost?.requestedTarget?.get()?.modelId);
				}
			} catch (error) {
				this.logService.error('Failed to apply the requested custom agent:', error);
			}
		}));
		this._pendingRequestedAgent.value = store;
	}

	/** Applies the requested model to `session`, as chosen for its chat, when the draft's agent offers it. */
	private _applyRequestedModel(provider: ISessionsProvider, session: ISession, modelId: string | undefined): void {
		const chat = session.mainChat.get();
		if (!modelId || chat.modelId.get() === modelId) {
			return;
		}
		const folderUri = session.workspace.get()?.folders[0]?.root;
		if (provider.getModelsSnapshotForCreation?.(folderUri, session.sessionType, modelId).desiredModelResolution.kind !== 'available') {
			return;
		}
		provider.setModel(session.sessionId, chat.resource, modelId, ChatModelSource.Chosen);
	}

	/** Replaces the host's requested target with what `change` makes of it, for a change by the user. */
	private _requestTarget(change: (target: INewSessionTarget) => INewSessionTarget): void {
		const host = this._draftHost;
		if (host?.setRequestedTarget) {
			host.setRequestedTarget(change(host.requestedTarget?.get() ?? {}), 'user');
		}
	}

	/**
	 * Keeps the model the user selects for a draft as the requested one, with the draft's agent, also when that is not the
	 * requested agent, such as one available instead of it: the composer then stops waiting for the requested agent. Only
	 * the composer's report of the user's choice counts, not the draft's model changing, which its agent also does on its
	 * own, such as with the model of a custom agent it selects.
	 */
	private _trackUserModelSelections(): IDisposable {
		return this._newChatInput.onDidSelectModel(modelId => {
			const session = this._session.get();
			if (!session || isSessionCreated(session)) {
				return;
			}
			const target = this._draftHost?.requestedTarget?.get() ?? {};
			const sameAgent = this._isRequestedAgent(session, target);
			const next: INewSessionTarget = {
				...target,
				providerId: session.providerId,
				sessionTypeId: session.sessionType,
				modelId,
				modeId: sameAgent ? target.modeId : session.mode.get()?.id,
			};
			if (next.providerId === target.providerId && next.sessionTypeId === target.sessionTypeId && next.modelId === target.modelId && next.modeId === target.modeId) {
				return;
			}
			this._pendingPreferredUpgrade.clear();
			this._draftHost?.setRequestedTarget?.(next, 'user');
		});
	}

	/**
	 * Keeps the custom agent the user selects for a draft in a picker as the requested one, also the agent's default when
	 * the user clears it, with the draft's agent: the composer then stops waiting for the requested custom agent, or for
	 * the requested agent. Only the picker's report of the user's choice counts, not the draft's agent changing, which a
	 * picker or the draft's agent also do on their own.
	 */
	private _trackUserAgentSelections(): IDisposable {
		return this.newSessionComposerService.onDidSelectAgent(({ sessionId, agent }) => {
			const session = this._session.get();
			if (!session || session.sessionId !== sessionId || isSessionCreated(session)) {
				return;
			}
			this._pendingRequestedAgent.clear();
			this._pendingPreferredUpgrade.clear();
			const target = this._draftHost?.requestedTarget?.get() ?? {};
			const sameAgent = this._isRequestedAgent(session, target);
			const modelId = session.modelId.get();
			const chosen = session.mainChat.get().modelSource.get() === ChatModelSource.Chosen;
			this._draftHost?.setRequestedTarget?.({
				...target,
				providerId: session.providerId,
				sessionTypeId: session.sessionType,
				modelId: sameAgent ? target.modelId : chosen ? modelId : undefined,
				modeId: agent?.uri,
			}, 'user');
		});
	}

	/**
	 * Creates the draft of the requested workspace `folderUri` for a composer that kept a draft of another workspace, such
	 * as when its view went while the trust of the workspace the user chose was asked. The trust is asked again; when the
	 * user declines it, the composer stays with its draft, which it requests again, rather than asking once more.
	 */
	private async _reopenRequestedWorkspace(folderUri: URI, target: INewSessionTarget, kept: ISession, keptFolderUri: URI | undefined): Promise<void> {
		this._workspacePicker.setSelectedWorkspace(folderUri, { fireEvent: false, providerId: target.providerId, persist: false, origin: WorkspaceSelectionOrigin.RestoredDraft });
		const result = await this._createNewSession(folderUri, target.sessionTypeId ? { providerId: target.providerId, sessionTypeId: target.sessionTypeId } : undefined);
		if (!result.trustDeclined || this._session.get()?.sessionId !== kept.sessionId) {
			return;
		}
		const requested = this._draftHost?.requestedTarget?.get();
		if (requested?.folderUri && this.uriIdentityService.extUri.isEqual(requested.folderUri, folderUri)) {
			// In a Dev Container as the kept draft is, not as the declined folder's was requested.
			const keptProvider = this.sessionsProvidersService.getProvider(kept.providerId, kept.sessionId);
			const keptInDevContainer = !!keptProvider && isAgentHostProvider(keptProvider) && keptProvider.isDevContainerRequested?.(kept.sessionId) === true;
			this._draftHost?.setRequestedTarget?.({ ...requested, folderUri: keptFolderUri, requireDevContainer: keptInDevContainer || undefined }, 'user');
		}
		if (keptFolderUri) {
			this._workspacePicker.setSelectedWorkspace(keptFolderUri, { fireEvent: false, providerId: kept.providerId, persist: false, origin: WorkspaceSelectionOrigin.RestoredDraft });
		} else {
			this._workspacePicker.selectNoWorkspace(false, false);
		}
	}

	private async _restoreNoWorkspaceDraft(): Promise<void> {
		// A hosted composer creates the drafts of what its host requests, and waits for its agent itself.
		if (this._draftHost?.requestedTarget?.get()) {
			return;
		}
		if (this._workspaceSelectionCleared && !this._workspacePicker.isNoWorkspaceSelected()) {
			return;
		}
		if (this._environment.get() && this._pickedEnvironment.get() && !this._workspacePicker.isNoWorkspaceSelected()) {
			return;
		}
		if (this._environment.get()?.kind === 'container') {
			return;
		}
		const cancellation = new CancellationTokenSource();
		const lifetime = toDisposable(() => cancellation.dispose(true));
		this._noWorkspaceRestore.value = lifetime;
		try {
			await waitForState(this.sessionsService.initialRestoreComplete, complete => complete, undefined, cancellation.token);
			if (!this._workspacePicker.isNoWorkspaceSelected()
				&& !await this._workspacePicker.whenWorkspaceRestored(cancellation.token)) {
				return;
			}
			if (cancellation.token.isCancellationRequested || (this._detached ? this._session.get() : this._paneSession.get())
				|| this._newSessionCreation.value || this._workspacePicker.selectedFolderUri) {
				return;
			}
			const environment = this._environment.get();
			// Wait for the default environment instead of pinning a temporary Cloud-only provider.
			if (!environment && isSessionEnvironmentPickerEnabled(this.configurationService)) {
				return;
			}
			const target = environment ? this._workspaceOptOutTarget.get() : undefined;
			if (environment ? !!target : this.sessionsManagementService.isQuickChatTargetAvailable()) {
				if (this._workspacePicker.isNoWorkspaceSelected()) {
					// Restoring the previous choice is not a new user choice, so it must not supersede a window-open workspace either.
					this.selectNoWorkspace(target, { userSelection: false, preserveNavigation: true });
				} else {
					// An automatic fallback must not persist a user choice or supersede a window-open workspace.
					this._createdSessionId = (this._detached ? this._openQuickChat(target, true) : this.sessionsService.openQuickChat(target, true))?.sessionId;
				}
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				onUnexpectedError(error);
			}
		} finally {
			if (this._noWorkspaceRestore.value === lifetime) {
				this._noWorkspaceRestore.clear();
			}
		}
	}

	/**
	 * If a new-session draft was restored by {@link openNewSession}, sync
	 * the workspace picker to match the session's workspace. The picker may
	 * have restored a workspace from a different provider (e.g. remote vs
	 * local), so overwrite it with the session's actual workspace without
	 * firing the event (which would trigger {@link _onWorkspaceSelected} and
	 * create a new session).
	 *
	 * @returns `true` if an active session was found and the picker was synced.
	 */
	private _syncWorkspacePickerFromActiveSession(): boolean {
		const activeSession = this._session.get();
		if (!activeSession) {
			return false;
		}

		// A hosted composer's draft does not become the main composer's workspace.
		const folderUri = this._syncWorkspacePickerDevContainerMode(activeSession, !this._draftHost, WorkspaceSelectionOrigin.RestoredDraft);
		if (folderUri) {
			this._replaceDraftOnUnservableHarness(folderUri, activeSession);
		} else if (this._draftHost && activeSession.isQuickChat?.get()) {
			this._workspacePicker.selectNoWorkspace(false, false);
		}

		return true;
	}

	private _syncWorkspacePickerDevContainerMode(activeSession: ISession, persist: boolean, origin: WorkspaceSelectionOrigin): URI | undefined {
		const folderUri = activeSession.workspace.get()?.folders[0]?.root;
		if (!folderUri || (origin === WorkspaceSelectionOrigin.SessionSync
			&& !this.uriIdentityService.extUri.isEqual(folderUri, this._workspacePicker.selectedFolderUri))) {
			return undefined;
		}
		const provider = this.sessionsProvidersService.getProvider(activeSession.providerId, activeSession.sessionId);
		const preferDevContainer = !!provider && isAgentHostProvider(provider) && provider.isDevContainerEnabled?.(activeSession.sessionId) === true;
		if (origin === WorkspaceSelectionOrigin.RestoredDraft) {
			this._reconcileWorkspaceEnvironment({ providerId: activeSession.providerId, preferDevContainer });
		}
		this._workspacePicker.setSelectedWorkspace(folderUri, { fireEvent: false, providerId: activeSession.providerId, persist, preferDevContainer, origin });
		return folderUri;
	}

	/**
	 * Replaces a restored draft whose harness the folder can no longer serve.
	 * A draft outlives navigation, so it can name a session type that has since
	 * stopped being advertised. Keeping it would leave the composer showing, and
	 * sending to, an agent the harness picker doesn't list. An empty type list
	 * means the folder's providers haven't reported yet (a late-connecting agent
	 * host), so the draft is left alone.
	 */
	private _replaceDraftOnUnservableHarness(folderUri: URI, draft: ISession): void {
		if (isSessionCreated(draft)) {
			return;
		}
		const pick = { providerId: draft.providerId, sessionTypeId: draft.sessionType };
		if (this.sessionsManagementService.getSessionTypesForFolder(folderUri).length === 0 || this._isPreferredServable(folderUri, pick)) {
			return;
		}
		void this._createNewSession(folderUri);
	}

	private _isPreferredServable(folderUri: URI, pick: IPreferredSessionType): boolean {
		const creationProviderId = isWeb ? this.agentHostFilterService.selectedHost?.sessionCreationProviderId : undefined;
		const environment = this._environment.get();
		return this.sessionsManagementService.getSessionTypesForFolder(folderUri).some(t =>
			(!creationProviderId || t.providerId === creationProviderId)
			&& (!environment || environment.providerIds.includes(t.providerId))
			&& (pick.providerId === undefined || t.providerId === pick.providerId)
			&& t.sessionType.id === pick.sessionTypeId);
	}

	private async _createNewSession(
		folderUri: URI,
		userPick = this._newChatInput.sessionTypePicker.getUserPickedSessionType(),
		handoff?: { readonly token: CancellationToken; readonly providerId?: string; readonly preferDevContainer?: boolean },
	): Promise<IOpenNewSessionResult> {
		this._pendingPreferredUpgrade.clear();
		const creationCts = new CancellationTokenSource(handoff?.token);
		const creationLifecycle = toDisposable(() => creationCts.dispose(true));
		this._newSessionCreation.value = creationLifecycle;
		// Session creation is async, so a provider can start serving the folder
		// (e.g. the local agent host finishing its handshake) between the call
		// below and the listener installed after it. That change would land in
		// the gap and be lost, leaving the composer without a draft — and with
		// the harness picker hidden — until the user re-picks the workspace.
		// Record it here so the listener can replay it.
		const pendingChange = new DisposableStore();
		let changedWhilePending = false;
		pendingChange.add(this.sessionsManagementService.onDidChangeSessionTypes(() => changedWhilePending = true));
		let result: IOpenNewSessionResult;
		const creation = this._createSessionNow(folderUri, userPick, creationCts.token, handoff?.providerId);
		this._pendingWorkspaceCreation = creation;
		try {
			result = await creation;
		} finally {
			pendingChange.dispose();
			if (this._pendingWorkspaceCreation === creation) {
				this._pendingWorkspaceCreation = undefined;
			}
		}
		const isCurrentCreation = this._newSessionCreation.value === creationLifecycle;
		const cancelled = creationCts.token.isCancellationRequested;
		if (isCurrentCreation) {
			if (result.session) {
				this._createdSessionId = result.session.sessionId;
			}
			this._newSessionCreation.clear();
		} else {
			return result;
		}
		if (cancelled) {
			return result;
		}
		if (handoff) {
			this._preferredDevContainerFolderUri = handoff.preferDevContainer ? folderUri : undefined;
		}
		this._applyPreferredDevContainer(result.session, folderUri);
		if (result.trustDeclined) {
			this._preferredDevContainerFolderUri = undefined;
			// The user explicitly declined trust: don't schedule a retry, which
			// would silently recreate (and possibly re-prompt) the draft once a
			// provider registers/changes without any further user action.
			this._pendingPreferredUpgrade.clear();
			return result;
		}

		// Keep the draft in sync with late-registering providers. Agent hosts
		// connect lazily, so there is no timeout — the listener lives until the
		// draft is sent or replaced. We watch when:
		//  - no provider can serve the folder yet (!result.session),
		//  - the user's explicit pick isn't servable yet (created with a
		//    fallback, upgrade once its provider connects), or
		//  - there is no explicit pick, so the draft tracks the preferred
		//    (first) type, which can change as the folder's session-type list
		//    grows.
		if (!result.session || !userPick || !this._isPreferredServable(folderUri, userPick)) {
			this._scheduleRecreateOnProviderChange(folderUri, userPick, result.session, changedWhilePending);
		}
		return result;
	}

	private _applyPreferredDevContainer(session: ISession | undefined, folderUri: URI): void {
		if (!session || !this._preferredDevContainerFolderUri || !this.uriIdentityService.extUri.isEqual(this._preferredDevContainerFolderUri, folderUri)) {
			return;
		}
		const provider = this.sessionsProvidersService.getProvider(session.providerId, session.sessionId);
		if (!provider || !isAgentHostProvider(provider) || !provider.preferDevContainer) {
			return;
		}
		if (this._environment.get()?.kind !== 'container') {
			provider.preferDevContainer(session.sessionId);
		}
		this._preferredDevContainerFolderUri = undefined;
	}

	/** Whether the host of a hosted composer requests the drafts of `folderUri` in a Dev Container. */
	/**
	 * Whether it takes the global composer actions, such as tours or the folder picker, and gives the workspace selection,
	 * while it shows: not a composer of a host of its own, such as a chat window's, whose drafts are still tracked; those
	 * apply to the main window's.
	 */
	private _takesGlobalComposerActions(reader: IReader): boolean {
		return this._isMainWindowComposer() && (this.options.hostVisible?.read(reader) ?? true) && (this.options.inputVisible?.read(reader) ?? true);
	}

	/** Whether it is not a composer of a host of its own, such as a chat window's: those take neither the global composer actions nor Voice Mode. */
	private _isMainWindowComposer(): boolean {
		return !this._draftHost;
	}

	/** What its input composer is a global target of: Voice Mode only for a composer of the main window. */
	private _globalTargetOptions(): Pick<INewChatComposerInputOptions, 'voiceTarget'> {
		return { voiceTarget: this._isMainWindowComposer() };
	}

	private _requestsDevContainer(folderUri: URI | undefined): boolean {
		const target = this._draftHost?.requestedTarget?.get();
		return !!folderUri && !!target?.requireDevContainer && !!target.folderUri && this.uriIdentityService.extUri.isEqual(target.folderUri, folderUri);
	}

	private async _createSessionNow(folderUri: URI, userPick: IPreferredSessionType | undefined, token: CancellationToken, providerId?: string): Promise<IOpenNewSessionResult> {
		// Prefer the user's explicit pick when its provider can serve the
		// folder; otherwise fall back to the preferred (first) session type.
		const preferredPick = userPick && this._isPreferredServable(folderUri, userPick)
			? userPick
			: this._newChatInput.sessionTypePicker.getPreferredSessionType(folderUri);
		const fallbackProviderId = providerId ?? this._workspacePicker.selectedResolved?.providerId;
		const environment = this._environment.get();
		if (environment && (!preferredPick || !this._isPreferredServable(folderUri, preferredPick))) {
			this.logService.trace('Waiting for a compatible harness in the selected environment.');
			return { session: undefined, trustDeclined: false };
		}
		try {
			const result = await this.sessionsService.openNewSession({
				folderUri,
				preserveNavigation: true,
				...(this._draftHost ? { draftSlot: this._draftHost.slot } : this._preserveCustomView ? { preserveCustomView: true } : {}),
				...(environment?.kind === 'container' || this._requestsDevContainer(folderUri) ? { requireDevContainer: true } : undefined),
				...(preferredPick
					? { providerId: preferredPick.providerId, sessionTypeId: preferredPick.sessionTypeId }
					: fallbackProviderId
						? { providerId: fallbackProviderId }
						: undefined),
			}, token);
			if (this._draftHost) {
				this._applyRequestedSelection(result.session);
			}
			return result;
		} catch (e) {
			this.logService.error('Failed to create new session:', e);
			return { session: undefined, trustDeclined: false };
		}
	}

	private _scheduleRecreateOnProviderChange(folderUri: URI, userPick: IPreferredSessionType | undefined, created: ISession | undefined, replayMissedChange: boolean): void {
		const store = new DisposableStore();
		store.add(this.sessionsManagementService.onDidChangeSessionTypes(() => this._recreateOnProviderChange(folderUri, userPick, created)));
		this._pendingPreferredUpgrade.value = store;
		if (replayMissedChange) {
			this._recreateOnProviderChange(folderUri, userPick, created);
		}
	}

	private _recreateOnProviderChange(folderUri: URI, userPick: IPreferredSessionType | undefined, created: ISession | undefined): void {
		if (created) {
			const active = this._session.get();
			if (active?.sessionId !== created.sessionId || isSessionCreated(active)) {
				return; // the draft was sent or is no longer the active session
			}
			// The draft can be of another folder, such as the one a composer kept while no provider could serve this one:
			// it is not a draft of this folder, whatever it runs. A draft of the folder's repository, such as a cloud
			// agent's, is.
			const activeWorkspace = active.workspace.get();
			const inFolder = !!activeWorkspace && this._workspacePicker.isWorkspaceOfFolder(activeWorkspace, folderUri);
			if (userPick) {
				if (!this._isPreferredServable(folderUri, userPick)) {
					return; // the preferred provider still cannot serve the folder
				}
				// Already running the pick: nothing left to upgrade to, so stop watching.
				if (inFolder && userPick.sessionTypeId === active.sessionType
					&& (userPick.providerId === undefined || userPick.providerId === active.providerId)) {
					this._pendingPreferredUpgrade.clear();
					return;
				}
			} else {
				// No explicit pick: keep the draft on the preferred (first)
				// type. Recreate only when that preferred actually changed.
				const preferred = this._newChatInput.sessionTypePicker.getPreferredSessionType(folderUri);
				if (!preferred || (inFolder && preferred.providerId === active.providerId && preferred.sessionTypeId === active.sessionType)) {
					return;
				}
			}
		}
		void this._createNewSession(folderUri, userPick);
	}

	selectNoWorkspace(options?: ICreateNewSessionOptions, selectionOptions?: ISelectNoWorkspaceOptions): ISession | undefined {
		this._pendingPreferredUpgrade.clear();
		this._newSessionCreation.clear();
		const userSelection = selectionOptions?.userSelection !== false;
		// What a hosted composer selects on its own is not the main composer's selection.
		this._workspacePicker.selectNoWorkspace(userSelection, userSelection || !this._draftHost);
		const environment = this._environment.get();
		const session = environment?.kind === 'cloud' || environment?.kind === 'container'
			? this._createQuickChat(options ?? this._workspaceOptOutTarget.get(), selectionOptions?.preserveNavigation)
			: this._openQuickChat(options, selectionOptions?.preserveNavigation);
		if (session && environment && (environment.kind === 'container' || !environment.providerIds.includes(session.providerId))) {
			this._reconcileWorkspaceEnvironment({ providerId: session.providerId });
		}
		return session;
	}

	private _openQuickChat(options?: ICreateNewSessionOptions, preserveNavigation?: boolean): ISession | undefined {
		const environment = this._environment.get();
		if (!options && environment) {
			options = this._workspaceOptOutTarget.get();
			if (!options) {
				this.logService.trace(`Waiting for a compatible quick-chat harness in environment '${environment.id}' (providers: ${environment.providerIds.join(', ')}).`);
				return undefined;
			}
		}
		return this._createQuickChat(options, preserveNavigation);
	}

	private _createQuickChat(options?: ICreateNewSessionOptions, preserveNavigation?: boolean): ISession | undefined {
		if (this._detached) {
			try {
				const session = this._draftSlot.createQuickChat(options);
				if (this._draftHost) {
					this._applyRequestedSelection(session);
				}
				return this._session.get();
			} catch (error) {
				this.logService.error('Failed to prepare quick chat:', error);
				return undefined;
			}
		}
		return this.sessionsService.openQuickChat(options, preserveNavigation);
	}

	/**
	 * The user selects No Workspace, of the given agent: a hosted composer requests it, with the agent its draft has, and
	 * with the model and custom agent requested before when that is the same agent, which its draft got as it was created.
	 */
	private _selectNoWorkspaceByUser(options: ICreateNewSessionOptions | undefined): void {
		const session = this.selectNoWorkspace(options);
		this._requestTarget(target => {
			const agent = session ? { providerId: session.providerId, sessionTypeId: session.sessionType } : { providerId: options?.providerId, sessionTypeId: options?.sessionTypeId };
			const sameAgent = agent.providerId === target.providerId && agent.sessionTypeId === target.sessionTypeId;
			return { ...(sameAgent ? target : {}), ...agent, folderUri: undefined };
		});
	}

	private _getWorkspaceOptOutTarget(environment: ISessionCreationEnvironment | undefined, session: ISession | undefined): ICreateNewSessionOptions | undefined {
		if (environment?.kind === 'container') {
			return undefined;
		}
		if (!environment || (session && environment.providerIds.includes(session.providerId))) {
			const target = session && { providerId: session.providerId, sessionTypeId: session.sessionType };
			if (target && this.sessionsManagementService.isQuickChatTargetAvailable(target)) {
				return target;
			}
			if (!environment) {
				return undefined;
			}
			const providerTarget = session && { providerId: session.providerId };
			if (providerTarget && this.sessionsManagementService.isQuickChatTargetAvailable(providerTarget)) {
				return providerTarget;
			}
		}
		const targets = this.sessionsManagementService.getQuickChatSessionTypes().filter(target => environment.providerIds.includes(target.providerId));
		const preferred = session && targets.find(target => target.sessionType.id === session.sessionType);
		return preferred ? { providerId: preferred.providerId, sessionTypeId: preferred.sessionType.id }
			: targets[0] && { providerId: targets[0].providerId };
	}

	private _getNoWorkspaceOption(): IWorkspacePickerNoWorkspaceOption | undefined {
		const isWorkspacePickerQuickChat = this._isWorkspacePickerQuickChat.get();
		const environment = this._environment.get();
		if (environment?.kind === 'container') {
			return undefined;
		}
		if (isWeb) {
			return undefined;
		}
		const quickChatProviders = this.sessionsProvidersService.getProviders()
			.filter(provider => !environment || environment.providerIds.includes(provider.id))
			.filter(provider => isAgentHostProvider(provider) ? !provider.hostGroup : !!environment)
			.filter(provider => provider.supportsQuickChats);
		const isAvailable = (provider: ISessionsProvider) => provider.supportsQuickChats
			&& (!isAgentHostProvider(provider) || provider.isVisibleInEnvironmentPicker?.get() !== false);
		const providers = quickChatProviders.filter(isAvailable);
		if (!isWorkspacePickerQuickChat
			&& providers.length === 0
			&& (environment || quickChatProviders.length > 0 || !this.sessionsManagementService.isQuickChatTargetAvailable())) {
			return undefined;
		}
		const activeProviderId = isWorkspacePickerQuickChat ? this._session.get()?.providerId : undefined;
		const activeProvider = activeProviderId ? quickChatProviders.find(provider => provider.id === activeProviderId) : undefined;
		const submenuActions = providers.length > 1
			? providers.map(provider => {
				const action = toAction({
					id: `newSessionWorkspacePicker.quickChat.${provider.id}`,
					label: getQuickChatProviderLabel(provider),
					checked: provider.id === activeProviderId,
					run: () => {
						if (isAvailable(provider) && provider.id !== activeProviderId) {
							const options = { providerId: provider.id };
							if (this._draftHost) {
								this._selectNoWorkspaceByUser(options);
							} else {
								this.selectNoWorkspace(options);
							}
						}
					},
				});
				return Object.assign(action, { icon: provider.icon });
			})
			: undefined;
		return {
			description: getNoWorkspaceDescription(),
			isSelected: isWorkspacePickerQuickChat,
			selectedLabel: activeProvider && activeProvider.id !== LOCAL_AGENT_HOST_PROVIDER_ID && !environment?.providerIds.includes(activeProvider.id)
				? getRemoteQuickChatSelectedLabel(activeProvider)
				: undefined,
			select: () => {
				if (!isWorkspacePickerQuickChat) {
					const provider = providers.length === 1 ? providers[0] : undefined;
					if (!provider || isAvailable(provider)) {
						const options = provider ? { providerId: provider.id } : undefined;
						if (this._draftHost) {
							this._selectNoWorkspaceByUser(options);
						} else {
							this.selectNoWorkspace(options);
						}
					}
				}
			},
			submenuActions,
		};
	}

	private _renderWorkspacePicker(container: HTMLElement): IDisposable {
		const store = new DisposableStore();
		const selectionChanged = observableSignalFromEvent(this, this._workspacePicker.onDidChangeSelection);
		const canOptOut = derived(this, reader => {
			selectionChanged.read(reader);
			return !!this._workspaceOptOutTarget.read(reader)
				&& !!this._workspacePicker.selectedFolderUri;
		});
		const selectsRepository = isWeb && !!this.agentHostFilterService.selectedHost?.sessionCreationProviderId;
		const workspaceTrigger: IWorkspacePickerTrigger = {
			label: selectsRepository ? localize('newSessionWorkspacePicker.repository', "Select Repository") : localize('newSessionWorkspacePicker.workspace', "Workspace"),
			ariaLabel: selectsRepository ? localize('newSessionWorkspacePicker.repositoryAriaLabel', "Choose a repository for the new session") : localize('newSessionWorkspacePicker.workspaceAriaLabel', "Choose a workspace for the new session"),
			tooltip: localize('newSessionWorkspacePicker.workspaceTooltip', "Project for the agent to work on"),
			focusCommand: {
				id: FOCUS_NEW_SESSION_WORKSPACE_PICKER_COMMAND_ID,
				when: FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN,
				enabled: constObservable(true),
			},
			icon: selectsRepository ? Codicon.repo : Codicon.project,
			reflectsWorkspace: true,
			clearable: derived(this, reader => canOptOut.read(reader) && this._workspaceOptOutEnabled.read(reader)),
			attachesContext: false,
		};
		const row = this._workspacePicker.renderCategoryTriggers(container, [
			workspaceTrigger,
		], undefined, this._newChatInput.pickerHoverDelegate);
		store.add(this._renderPlaceRow(container, row));
		store.add(autorun(reader => {
			if (canOptOut.read(reader)) {
				logSettingExperimentTrigger(this.telemetryService, WORKSPACE_OPT_OUT_SETTING);
			}
		}));
		const sessionOptionsRow = store.add(new SessionOptionsRow(row, container, {
			user: 'NewChatWidget.sessionOptions',
			hoverDelegate: this._newChatInput.pickerHoverDelegate,
			screenReaderOptimized: this._screenReaderOptimized,
			expanded: this._sessionOptionsExpanded,
			collapsedShowIcons: this._collapsedSessionOptionsShowIcons,
			setExpanded: expanded => this._setSessionOptionsExpandedFromUser(expanded),
			// The icons-vs-hidden setting only changes what a collapsed tray shows, so log the
			// experiment trigger when the composer actually reaches that collapsed state — before
			// the setting is read, so both arms count and users who never collapse don't dilute it.
			onDidCollapse: () => logSettingExperimentTrigger(this.telemetryService, COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING),
			onDidChangeLayout: () => this._onDidChangeChatPetPlatform.fire(),
			iconOnlyPickers: this._iconOnlyPickers,
		}));
		const sessionOptions = sessionOptionsRow.details;
		const environmentPicker = store.add(new MutableDisposable<ReturnType<SessionEnvironmentPicker['render']>>());
		const repositoryControlsHost = sessionOptionsRow.repositoryControlsHost;
		this._workspacePickerRow = row;
		this._workspaceRepositoryControlsHost = repositoryControlsHost;
		this._workspaceSessionOptionsHost = sessionOptions;
		this._renderSessionTypePicker(sessionOptions, false);
		this._newChatInput.placeRepositoryControls(repositoryControlsHost);
		store.add(autorun(reader => {
			const environment = this._environment.read(reader);
			if (environment) {
				environmentPicker.value ??= this._environmentPicker.render(row, {
					hoverDelegate: this._newChatInput.pickerHoverDelegate,
					focusCommand: {
						id: FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_COMMAND_ID,
						when: FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_WHEN,
						enabled: derived(this, reader => this._environment.read(reader) !== undefined),
					},
				});
			} else {
				environmentPicker.clear();
			}
			sessionOptionsRow.layout();
		}));
		store.add(autorun(reader => {
			const isVisible = this._environmentPicker.isVisible.read(reader);
			this._newChatInput.pickerVisibility.setVisible('environment', isVisible);
		}));
		sessionOptionsRow.layout();
		this._newChatInput.pickerVisibility.setVisible('workspace', true);
		store.add(toDisposable(() => {
			if (this._workspacePickerRow === row) {
				this._workspacePickerRow = undefined;
				this._workspaceRepositoryControlsHost = undefined;
				this._workspaceSessionOptionsHost = undefined;
				this._newChatInput.placeRepositoryControls();
				this._newChatInput.pickerVisibility.setVisible('workspace', false);
			}
		}));
		return store;
	}

	get preserveOnSessionClear(): boolean {
		return this._changingEnvironment || (this._workspaceOptOutEnabled.get() && !this._workspacePicker.selectedFolderUri);
	}

	private async _selectEnvironment(environment: ISessionCreationEnvironment): Promise<void> {
		const previousEnvironment = this._environment.get();
		if (environment.id === previousEnvironment?.id) {
			return;
		}
		this._newChatInput.saveState();
		this._pendingPreferredUpgrade.clear();
		this._newSessionCreation.clear();
		this._noWorkspaceRestore.clear();
		this.newSessionComposerService.notifyUserWorkspaceSelection();
		const session = this._session.get();
		const selectedFolderUri = this._workspacePicker.selectedFolderUri;
		if (previousEnvironment) {
			if (selectedFolderUri) {
				this._environmentWorkspaces.set(previousEnvironment.id, selectedFolderUri);
			} else {
				this._environmentWorkspaces.delete(previousEnvironment.id);
			}
		}
		const workspace = this._workspacePicker.getEnvironmentWorkspace(environment, undefined, this._environmentWorkspaces.get(environment.id));
		const folderUri = workspace?.workspace.folders[0]?.root;
		this._pickedEnvironment.set(environment, undefined);
		this._requestTarget(target => ({ ...target, requireDevContainer: environment.kind === 'container' || undefined }));
		if (!folderUri || !workspace) {
			this._changingEnvironment = true;
			try {
				if ((environment.kind === 'local' || environment.kind === 'remote' || this._workspaceOptOutTarget.get())
					&& (session?.isQuickChat?.get() || this._workspaceOptOutEnabled.get())) {
					this._workspacePicker.selectNoWorkspace(false);
					await this._onWorkspaceSelected(undefined);
				} else {
					this._workspacePicker.clearSelection();
				}
			} finally {
				this._changingEnvironment = false;
			}
		} else {
			this._preferredDevContainerFolderUri = environment.kind === 'container' ? folderUri : undefined;
			this._workspacePicker.setSelectedWorkspace(folderUri, { fireEvent: false, providerId: workspace.providerId, preferDevContainer: environment.kind === 'container' });
			const pick = session && this._isPreferredServable(folderUri, { sessionTypeId: session.sessionType })
				? { sessionTypeId: session.sessionType }
				: undefined;
			await this._onWorkspaceSelected(folderUri, pick);
		}
		if (this._pickedEnvironment.get() !== environment) {
			return;
		}
		const host = environment.kind === 'remote' && this.sessionsProvidersService.getProvider(environment.providerIds[0]);
		if (host && isAgentHostProvider(host) && host.connectionStatus?.get().kind === 'disconnected' && host.connect) {
			try {
				await host.connect();
			} catch (error) {
				this.logService.error('Failed to connect to the selected environment', error);
				this.notificationService.error(localize('environmentPicker.connectionFailed', "Failed to connect to {0}: {1}", environment.label, toErrorMessage(error)));
				return;
			}
		}
		if (this._pickedEnvironment.get() === environment) {
			this.accessibilityService.status(localize('environmentPicker.selected', "Environment: {0}", environment.label));
		}
	}

	private _getComparisonBranch(session = this._session.get(), reader?: IReader): string | undefined {
		const selectedFolderUri = this._workspacePicker.selectedFolderUri;
		const sessionRepository = getComparisonSessionFolder(session, selectedFolderUri)?.gitRepository;
		const selectedWorkspaceRepository = getComparisonSelectedWorkspaceFolder(this._workspacePicker.selectedResolved?.workspace, selectedFolderUri)?.gitRepository;
		const repository = sessionRepository ?? selectedWorkspaceRepository;
		if (repository?.isRepository?.read(reader) === false) {
			return undefined;
		}
		const provider = session ? this.sessionsProvidersService.getProvider(session.providerId, session.sessionId) : undefined;
		const matchesSelectedFolder = !selectedFolderUri || !!session?.workspace.get()?.folders.some(folder => isEqual(folder.root, selectedFolderUri));
		if (session && provider && isAgentHostProvider(provider) && matchesSelectedFolder) {
			const values = provider.getCreateSessionConfig(session.sessionId);
			const config = values && provider.getSessionConfig(session.sessionId, session.mainChat.get().resource);
			const branchProperty = config && getSessionWorkspaceProperties(config.schema).baseBranch;
			const branch = branchProperty && values?.[branchProperty.key];
			if (typeof branch === 'string' && branch.trim()) {
				return branch;
			}
		}
		const selectedWorkspaceBranch = selectedWorkspaceRepository?.branchName?.trim() || selectedWorkspaceRepository?.baseBranchName?.trim();
		if (selectedWorkspaceBranch) {
			return selectedWorkspaceBranch;
		}
		const workspaceBranch = sessionRepository?.branchName?.trim() || sessionRepository?.baseBranchName?.trim();
		if (workspaceBranch) {
			return workspaceBranch;
		}
		return undefined;
	}

	private _isComparisonPending(reader: IReader, configurationResolving: IObservable<boolean>): boolean {
		const session = this._session.read(reader);
		if (!session || session.loading.read(reader) || configurationResolving.read(reader)) {
			return true;
		}
		const selectedFolder = this._workspacePicker.selectedFolderUri;
		const workspace = session.workspace.read(reader);
		if (!selectedFolder) {
			return workspace !== undefined;
		}
		const folder = workspace?.folders.find(folder => isEqual(folder.root, selectedFolder));
		if (!folder) {
			return true;
		}
		const provider = this.sessionsProvidersService.getProvider(session.providerId, session.sessionId);
		const config = provider && isAgentHostProvider(provider) ? provider.getSessionConfig(session.sessionId, session.mainChat.read(reader).resource) : undefined;
		// The host resolves worktree support before publishing the draft's Git metadata.
		return !!config && getSessionWorkspaceProperties(config.schema).isolation?.schema.enum?.includes('worktree') === true
			&& folder.gitRepository?.isRepository?.read(reader) !== true;
	}

	private _getComparisonModelIds(): Set<string> {
		return new Set(this._newChatInput.getComparisonModels()
			.filter(isModelComparisonSupported)
			.map(model => model.identifier));
	}

	private _shouldShowComparisonAction(reader?: IReader): boolean {
		// A comparison opens in the main window, so only its composer offers it.
		if (this._draftHost) {
			return false;
		}
		const session = this._session.get();
		const provider = session ? this.sessionsProvidersService.getProvider(session.providerId, session.sessionId) : undefined;
		const selectedFolderUri = this._workspacePicker.selectedFolderUri;
		const providerIsAgentHost = !!provider && isAgentHostProvider(provider);
		if (this._environment.get()?.kind === 'container' || session && providerIsAgentHost && provider.isDevContainerRequested?.(session.sessionId)) {
			return false;
		}
		const resolvingConfig = session && providerIsAgentHost ? provider.isSessionConfigResolving(session.sessionId, session.mainChat.get().resource).get() : false;
		if (session?.isQuickChat?.get()) {
			return this._compareAgentsEnabled.get() && providerIsAgentHost && provider.supportsQuickChats === true && !resolvingConfig;
		}
		const sessionMatchesSelectedFolder = !!selectedFolderUri && !!session?.workspace.get()?.folders.some(folder => isEqual(folder.root, selectedFolderUri));
		if (!sessionMatchesSelectedFolder) {
			return false;
		}
		if (this._getComparisonBranch(session, reader) === undefined) {
			return false;
		}
		const sessionConfig = session && providerIsAgentHost && !resolvingConfig ? provider.getSessionConfig(session.sessionId, session.mainChat.get().resource) : undefined;
		const supportsWorktreeIsolation = !!sessionConfig
			&& getSessionWorkspaceProperties(sessionConfig.schema).isolation?.schema.enum?.includes('worktree') === true;
		return this._compareAgentsEnabled.get()
			&& selectedFolderUri !== undefined
			&& !!session
			&& providerIsAgentHost
			&& this.sessionsManagementService.getSessionTypesForFolder(selectedFolderUri).some(type =>
				type.providerId === session.providerId && type.sessionType.id === session.sessionType && type.sessionType.supportsWorktreeConfiguration)
			&& !resolvingConfig
			&& supportsWorktreeIsolation;
	}

	private _renderPlaceRow(container: HTMLElement, chipRow: HTMLElement): IDisposable {
		return this.options.renderNewSessionHeader?.(container, chipRow) ?? Disposable.None;
	}

	private _renderSessionTypePicker(container: HTMLElement, prependBeforeSiblings: boolean): void {
		this._newChatInput.sessionTypePicker.render(container, {
			className: 'sessions-chat-session-type-picker sessions-workspace-category-picker-slot',
			hoverDelegate: this._newChatInput.pickerHoverDelegate,
		});
		const sessionTypePicker = container.lastElementChild;
		if (prependBeforeSiblings && sessionTypePicker) {
			container.prepend(sessionTypePicker);
		} else if (sessionTypePicker) {
			const workspaceTrigger = container.firstElementChild;
			const insertionAnchor = container === this._workspaceSessionOptionsHost
				? this._workspaceRepositoryControlsHost ?? workspaceTrigger
				: workspaceTrigger;
			insertionAnchor?.after(sessionTypePicker);
		}
	}

	focusWorkspacePicker(): void {
		this._workspacePicker.showPicker();
	}

	focusEnvironmentPicker(): void {
		this._sessionOptionsExpanded.set(true, undefined);
		this._environmentPicker.showPicker();
	}

	focusHarnessPicker(): void {
		this._sessionOptionsExpanded.set(true, undefined);
		this._newChatInput.sessionTypePicker.showPicker();
	}

	focusBranchPicker(): void {
		this._sessionOptionsExpanded.set(true, undefined);
		this._newChatInput.pickerVisibility.focusPicker('branch');
	}

	focusWorktreePicker(options?: ISessionPickerFocusOptions): void {
		this._sessionOptionsExpanded.set(true, undefined);
		this._newChatInput.pickerVisibility.focusPicker('worktree', options);
	}

	focusSyncAction(): void {
		this._sessionOptionsExpanded.set(true, undefined);
		this._newChatInput.pickerVisibility.focusPicker('sync');
	}

	openModelComparison(): void {
		this._newChatInput.modelPicker?.openComparison?.();
	}

	/** Restores an explicit user choice, or uses the experiment-controlled initial state. */
	private _restoreSessionOptionsExpanded(): void {
		const storedExpanded = getStoredSessionOptionsExpanded(this.storageService);
		let initialExpanded = storedExpanded ?? true;
		const hasCreatedSession = this._usage.createdSessionCount > 0;
		if (storedExpanded === undefined && !hasCreatedSession) {
			logSettingExperimentTrigger(this.telemetryService, NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING);
			initialExpanded = this.configurationService.getValue<boolean>(NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING) ?? true;
		}
		this._sessionOptionsExpanded.set(initialExpanded, undefined);
	}

	private _setSessionOptionsExpandedFromUser(expanded: boolean): void {
		this._sessionOptionsExpanded.set(expanded, undefined);
		storeSessionOptionsExpanded(this.storageService, expanded);
	}

	private _renderEmptyState(container: HTMLElement): IDisposable {
		this._newChatInput.pickerVisibility.setVisible('workspace', false);
		const emptyState = this.instantiationService.createInstance(NoAgentHostEmptyState, this.options.showEmptyStateIcon);
		this._activeEmptyState.set(emptyState, undefined);
		emptyState.render(container);
		return toDisposable(() => {
			if (this._activeEmptyState.get() === emptyState) {
				this._activeEmptyState.set(undefined, undefined);
			}
		});
	}

	/**
	 * Web-only: hosts the workspace picker, but swaps it out for the
	 * no-agent-host empty state once we are *sure* there are no hosts —
	 * i.e. after a discovery cycle has completed. Rendering the empty
	 * state before discovery has run would briefly flash it at users who
	 * actually have hosts that just haven't been discovered yet (e.g.
	 * cached tunnels resolved on startup). Until then we keep the regular
	 * workspace picker, which has its own loading affordance.
	 */
	private _renderEmptyStateGate(container: HTMLElement, chatWidgetContent: HTMLElement): IDisposable {
		const store = new DisposableStore();
		const pickerSlot = dom.append(container, dom.$('.session-workspace-picker-slot'));
		const stateDisposables = store.add(new MutableDisposable());

		const showPicker = () => {
			chatWidgetContent.classList.remove('no-agent-host');
			dom.clearNode(pickerSlot);
			stateDisposables.value = this._renderWorkspacePicker(pickerSlot);
		};

		const showEmptyState = () => {
			chatWidgetContent.classList.add('no-agent-host');
			dom.clearNode(pickerSlot);
			stateDisposables.value = this._renderEmptyState(pickerSlot);
		};

		const filter = this.agentHostFilterService;
		let hasCompletedDiscovery = filter.hosts.length > 0;

		// If no discovery cycle is in flight or has completed yet, kick one
		// off so the empty state can resolve in a bounded time. The
		// `tunnelAgentHost.contribution` already triggers a startup
		// rediscover, but in the (rare) case the view mounts before the
		// contribution gets a chance, this prevents the user from being
		// stuck on a picker that never gets populated.
		if (!hasCompletedDiscovery && !filter.isDiscovering) {
			filter.rediscover('automatic');
		}

		const update = () => {
			if (hasCompletedDiscovery && !filter.isDiscovering && filter.hosts.length === 0) {
				showEmptyState();
			} else {
				showPicker();
			}
		};

		update();

		// `onDidChange` fires when the host list changes — entering or
		// leaving the empty state if the last host disconnects or the
		// first host appears.
		store.add(filter.onDidChange(() => {
			if (filter.hosts.length > 0) {
				hasCompletedDiscovery = true;
			}
			update();
		}));
		// `onDidChangeDiscovering` fires on discovery start *and* end; we
		// treat any transition out of discovering as having completed at
		// least one cycle.
		store.add(filter.onDidChangeDiscovering(() => {
			if (!filter.isDiscovering) {
				hasCompletedDiscovery = true;
			}
			update();
		}));

		return store;
	}

	// --- Send ---

	private async _sendComparison(session: ISession, request: string, requestContext: ReadonlyMap<string, IChatRequestVariableEntry>, background = this._backgroundSend): Promise<boolean> {
		try {
			const provider = this.sessionsProvidersService.getProvider(session.providerId, session.sessionId);
			if (this._environment.get()?.kind === 'container' || provider && isAgentHostProvider(provider) && provider.isDevContainerRequested?.(session.sessionId)) {
				throw new Error(localize('comparisonPicker.devContainerUnavailable', "Compare Agents is not available for Dev Container sessions."));
			}
			if (!this._comparisonSelection.available.get()) {
				throw new Error(localize('comparisonPicker.unavailable', "Comparison is no longer available for this draft. Check its workspace and agent configuration."));
			}
			if (!this._comparisonSelection.configured.get()) {
				throw new Error(localize('comparisonPicker.finishSetup', "Finish configuring the comparison in the model picker."));
			}
			const isQuickChat = session.isQuickChat?.get() === true;
			const workspace = isQuickChat ? undefined : this._workspacePicker.selectedFolderUri;
			if (!isQuickChat && !workspace) {
				throw new Error(localize('comparisonPicker.workspaceRequired', "Select a workspace for the comparison."));
			}
			const branch = workspace ? this._getComparisonBranch(session) : undefined;
			const workspaceError = workspace ? getSessionComparisonWorkspaceError(branch) : undefined;
			if (workspaceError) {
				throw new Error(workspaceError);
			}
			const types = workspace ? this.sessionsManagementService.getSessionTypesForFolder(workspace) : this.sessionsManagementService.getQuickChatSessionTypes();
			const type = types.find(type =>
				type.providerId === session.providerId && type.sessionType.id === session.sessionType && (!workspace || type.sessionType.supportsWorktreeConfiguration));
			if (!provider || !type) {
				throw new Error(localize('comparisonPicker.worktreesRequired', "The selected agent no longer supports worktree comparisons."));
			}
			const permission = provider.getPermissionOptionForSession?.(session.sessionId);
			if (!permission || permission.locked) {
				throw new Error(localize('comparisonPicker.permissionsUnavailable', "The current permissions are unavailable for comparison. Update the draft permissions and try again."));
			}
			const resolveHarness = (modelId: string, configurationOverride?: Readonly<Record<string, string | number | boolean | null>>): ISessionComparisonHarness => {
				const resolved = this._newChatInput.resolveComparisonModel(modelId);
				if (!resolved || workspace && !resolved.sessionType.supportsWorktreeConfiguration) {
					throw new Error(localize('comparisonPicker.modelUnavailable', "A selected comparison model is no longer available. Update the model picker selection."));
				}
				const harnessPermission = provider.getComparisonPermissionOptionForSession?.(session.sessionId, resolved.sessionType.id)
					?? (resolved.sessionType.id === session.sessionType ? permission : undefined);
				if (!harnessPermission || harnessPermission.locked) {
					throw new Error(localize('comparisonPicker.permissionsUnavailable', "The current permissions are unavailable for comparison. Update the draft permissions and try again."));
				}
				const requestedConfiguration = {
					...provider.getAutomationModelConfiguration?.(session.sessionId)?.getModelConfiguration(resolved.model.identifier),
					...configurationOverride,
				};
				const modelConfiguration: Record<string, string | number | boolean | null> = {};
				for (const [key, value] of Object.entries(filterConfigurationToSchema(requestedConfiguration, resolved.model.metadata.configurationSchema))) {
					if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) {
						modelConfiguration[key] = value;
					}
				}
				return createSessionComparisonHarness(session.providerId, resolved.sessionType, resolved.model, modelConfiguration, harnessPermission);
			};
			const judgeModelId = this._comparisonSelection.judgeModelId.get();
			const synthesisModelId = this._comparisonSelection.synthesizerModelId.get();
			const comparison = await this.sessionComparisonService.startComparison({
				workspace,
				prompt: request,
				attachedContext: requestContext.size ? [...requestContext.values()] : undefined,
				attempts: this._comparisonSelection.attempts.get().map(attempt => ({ id: generateUuid(), harness: resolveHarness(attempt.modelId, attempt.configuration) })),
				judgeHarness: judgeModelId ? resolveHarness(judgeModelId) : undefined,
				synthesisHarness: synthesisModelId ? resolveHarness(synthesisModelId) : undefined,
				branch,
			});
			try {
				if (background) {
					if (!this._store.isDisposed && !this._pendingWorkspaceCreation
						&& this.sessionsManagementService.newSession.get()?.sessionId === session.sessionId
						&& (this._preserveCustomView || getMainWindowHost(this.sessionHostService).session.get()?.sessionId === session.sessionId)
						&& (isQuickChat || isEqual(workspace, this._workspacePicker.selectedFolderUri))) {
						this._comparisonSelection.reset();
						// Creating the replacement releases the old draft without an empty-composer handoff.
						if (isQuickChat) {
							this._openQuickChat();
						} else if (workspace) {
							await this._createNewSession(workspace);
						}
					}
				} else {
					if (this.configurationService.getValue<boolean>(COMPARE_AGENTS_OPEN_IN_GRID_SETTING)) {
						// An empty composer would create a new draft and cancel the grid navigation.
						await this.commandService.executeCommand(OPEN_SESSION_COMPARISON_COMMAND_ID, comparison.id);
					}
					this.sessionsManagementService.discardNewSession(session);
				}
			} catch (error) {
				this.logService.error('Failed to open session comparison:', error);
				this.notificationService.error(error);
			} finally {
				if (!background) {
					this._comparisonSelection.reset();
				}
			}
			return true;
		} catch (error) {
			this.logService.error('Failed to start session comparison:', error);
			this.notificationService.error(error);
			return false;
		}
	}

	private async _send(query: string, attachedContext?: IChatRequestVariableEntry[], background?: boolean, userInteraction?: NewChatUserInteraction): Promise<boolean> {
		background = this._backgroundSend || background;
		// A composer of a host of its own, such as a chat window's, shows the status of its background sends.
		const showBackgroundSendStatus = this._backgroundSend || !!background && (!!this._draftHost || this.viewsService.getViewWithId<SessionsView>(SessionsViewId)?.grouping === SessionsGrouping.Inbox);
		if (showBackgroundSendStatus) {
			this._lastBackgroundSentSessionResource = undefined;
			this._lastBackgroundSentSession = undefined;
			this._backgroundSendStatus.set(undefined, undefined);
			this._lastBackgroundSendOptions = undefined;
		}
		let session = this._session.get();
		// A hosted composer creating its draft again, such as after a send that failed, sends once it has it.
		if (!session && this._draftHost && this._pendingWorkspaceCreation) {
			await this._pendingWorkspaceCreation;
			session = this._session.get();
		}
		if (!session) {
			this._workspacePicker.showPicker();
			return false;
		}
		const workspaceValid = await this._workspacePicker.validateSelectedWorkspace().catch(error => {
			this.logService.error('Failed to validate workspace:', error);
			this.notificationService.error(localize('newSession.workspaceValidationFailed', "Could not check the session's workspace: {0}", toErrorMessage(error)));
			return false;
		});
		if (!workspaceValid || session !== this._session.get()) {
			return false;
		}
		const feedbackItems = [...this._feedbackItems.get()];
		const workspaceRoots = this._getWorkspaceRoots(session);
		const request = buildNewSessionPrompt(query, feedbackItems, workspaceRoots);
		const requestContext = new Map<string, IChatRequestVariableEntry>();
		for (const context of attachedContext ?? []) {
			if (!requestContext.has(context.id)) {
				requestContext.set(context.id, context);
			}
		}

		if (this._comparisonSelection.enabled.get()) {
			if (this._draftHost) {
				// Only a stale command gets here: the comparison is not offered outside the main window.
				this.notificationService.info(localize('newSession.comparisonInMainWindow', "Compare Agents is available from the new session in the main window."));
				return false;
			}
			const started = await this._sendComparison(session, request, requestContext, showBackgroundSendStatus);
			if (showBackgroundSendStatus && started && !this._newChatInput.hasInput) {
				this._backgroundSendStatus.set(localize('newSession.comparisonStarted', "Comparison started"), undefined);
			}
			return started;
		}

		// Capture the composer's workspace selection before the send: a
		// background send consumes the in-flight new session and resets the
		// new-session view, so we re-seed a fresh pending session afterwards
		// (see below) to keep the composer's pickers functional. Quick chats
		// have no workspace, so they re-seed via openQuickChat instead.
		const wasQuickChat = this._isQuickChatComposer.get();
		const folderUri = wasQuickChat ? undefined : this._workspacePicker.selectedFolderUri;
		const reseedFolderUri = background ? folderUri : undefined;
		const sendOptions = {
			query: request,
			attachedContext: requestContext.size > 0 ? [...requestContext.values()] : undefined,
			background,
			...(userInteraction ? { onDidCreateResponse: userInteraction.onDidCreateResponse } : {}),
		};
		const clearFeedback = () => {
			for (const item of feedbackItems) {
				this.agentFeedbackService.removeFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, item.id);
			}
		};
		const restoreWorkspace = () => {
			if (folderUri) {
				this.recentWorkspacesService.restoreDismissedWorkspace(folderUri);
			}
		};
		// A background send is fire-and-forget and the composer immediately reseeds
		// for the next one, so several can be in flight at once. Each is tracked
		// separately, keyed by the options object it was started with, so one
		// send's outcome never clears another's comments.
		if (background) {
			if (showBackgroundSendStatus) {
				this._lastBackgroundSendOptions = sendOptions;
			}
			const pending = new DisposableStore();
			pending.add(Event.once(
				Event.filter(this.sessionsManagementService.onDidSendRequest, event => event.options === sendOptions)
			)(event => {
				clearFeedback();
				restoreWorkspace();
				if (showBackgroundSendStatus && this._lastBackgroundSendOptions === sendOptions && !this._newChatInput.hasInput) {
					this._lastBackgroundSentSessionResource = event.session.resource;
					this._lastBackgroundSentSession = event.session;
					this._backgroundSendStatus.set(localize('newSession.messageSent', "Message sent"), undefined);
				}
				this._pendingBackgroundSends.deleteAndDispose(sendOptions);
			}));
			if (this._draftHost) {
				pending.add(this._clearBackgroundSendOnFailure(this._draftHost.slot, session, sendOptions));
			}
			this._pendingBackgroundSends.set(sendOptions, pending);
		}
		// The host follows the request, also after this composer is gone; registered before the send so it cannot miss its end.
		// It holds the composer weakly, so a request that outlives the composer does not keep it alive.
		const composer = new WeakRef(this);
		const hostTracking = background && this._draftHost
			? this._draftHost.trackBackgroundSend({ session, query, attachedContext: attachedContext?.slice(), isLatest: () => composer.deref()?._lastBackgroundSendOptions === sendOptions })
			: undefined;

		try {
			userInteraction?.handoff(session, session.mainChat.get());
			this.newSessionComposerService.notifyWillSendRequest(sendOptions, wasQuickChat ? undefined : this._workspacePicker.selectionSnapshot);
			await this.sessionsManagementService.sendNewChatRequest(session, sendOptions);
		} catch (e) {
			userInteraction?.cancel(isCancellationError(e) || e instanceof WorkspaceNotTrustedError ? 'cancelled' : 'error');
			hostTracking?.dispose();
			this._pendingBackgroundSends.deleteAndDispose(sendOptions);
			if (!isCancellationError(e) && !(e instanceof WorkspaceNotTrustedError)) {
				this.logService.error('Failed to send request:', e);
				this.notificationService.error(isErrorWithActions(e) ? e : localize('newSession.sendFailed', "Failed to start session: {0}", toErrorMessage(e)));
			}
			return false;
		}

		if (!background) {
			clearFeedback();
			restoreWorkspace();
		}
		this._workspacePicker.clearAttachedContext();

		// A background send graduated the composer's in-flight session and
		// returned the view to a fresh (but session-less) new-session composer.
		// The send now commits in the background, so reseed a replacement draft
		// immediately — providers are multi-new-session aware, so the graduating
		// session and this new draft coexist. This restores the
		// session-type/model pickers for the next message.
		if (background) {
			// A hosted composer's next draft aims for the selection the send had, also once a provider arrives later.
			const reseed = this._draftHost?.setRequestedTarget ? this._backgroundReseedTarget(session, reseedFolderUri) : undefined;
			if (reseed) {
				this._draftHost?.setRequestedTarget?.(reseed, 'background');
			}
			const reseedPick = reseed && { providerId: reseed.providerId, sessionTypeId: reseed.sessionTypeId };
			if (wasQuickChat) {
				this._openQuickChat(reseedPick);
			} else if (reseedFolderUri) {
				await this._createNewSession(reseedFolderUri, reseedPick);
			}
		}
		return true;
	}

	/**
	 * What a hosted composer's next draft aims for after a background send of `session`: the send's folder, agent, model
	 * and custom agent, and its Dev Container, so that the next draft runs where the sent one does.
	 */
	private _backgroundReseedTarget(session: ISession, folderUri: URI | undefined): INewSessionTarget & IPreferredSessionType {
		return {
			folderUri, providerId: session.providerId, sessionTypeId: session.sessionType, modelId: session.modelId.get(), modeId: session.mode.get()?.id,
			...(this._environment.get()?.kind === 'container' || this._requestsDevContainer(folderUri) ? { requireDevContainer: true } : {}),
		};
	}

	/**
	 * Clears the status and pending entry of a hosted composer's background send that does not start its session. Its
	 * host reports the failure, whenever its own listener runs, so the send stays the composer's latest (the `isLatest`
	 * its host reads) until a newer send, typing or the composer's disposal.
	 */
	private _clearBackgroundSendOnFailure(slot: INewSessionDraftSlot, session: ISession, sendOptions: ISendRequestOptions): IDisposable {
		return trackNewSessionRequestEnd(this.sessionsManagementService, slot, session, event => {
			if (event.started) {
				return;
			}
			if (this._lastBackgroundSendOptions === sendOptions) {
				this._backgroundSendStatus.set(undefined, undefined);
			}
			this._pendingBackgroundSends.deleteAndDispose(sendOptions);
		});
	}

	private _canSendRequestToWorkspace(session: ISession, environment: ISessionCreationEnvironment, reader: IReader): boolean {
		const provider = this.sessionsProvidersService.getProviders().find(provider => provider.id === session.providerId);
		if (!provider || isAgentHostProvider(provider) && (!isAgentHostEnvironmentAvailable(provider, reader)
			|| provider.connectionStatus && !RemoteAgentHostConnectionStatus.isConnected(provider.connectionStatus.read(reader)))) {
			return false;
		}
		const folderUri = this._workspacePicker.selectedFolderUri;
		if (!folderUri) {
			return environment.kind !== 'container' && !!session.isQuickChat?.read(reader)
				&& this.sessionsManagementService.isQuickChatTargetAvailable({ providerId: session.providerId, sessionTypeId: session.sessionType });
		}
		const workspace = session.workspace.read(reader);
		const matchesWorkspace = workspace && (environment.kind === 'cloud'
			? this._workspacePicker.matchesSelectedWorkspace(workspace, reader)
			: workspace.folders.some(folder => isEqual(folder.root, folderUri)));
		return !!matchesWorkspace
			&& !!getEnvironmentWorkspaceProvider(environment, this.sessionsProvidersService.getProviders(), folderUri)
			&& (environment.kind !== 'container' || this._workspacePicker.getDevContainerWorkspaceAvailability(folderUri, session.providerId) === true);
	}

	private _getWorkspaceRoots(session: ISession): readonly URI[] {
		const sessionWorkspace = session.workspace.get();
		if (sessionWorkspace) {
			return sessionWorkspace.folders.map(folder => folder.root);
		}
		const selectedFolderUri = this._isQuickChatComposer.get() ? undefined : this._workspacePicker.selectedFolderUri;
		return selectedFolderUri ? [selectedFolderUri] : [];
	}

	private _renderFeedbackBanner(container: HTMLElement): void {
		const host = dom.append(container, dom.$('.session-input-banners.new-session-feedback-banners'));
		const content = this._register(new MutableDisposable<DisposableStore>());
		this._register(autorun(reader => {
			const feedbackItems = this._feedbackItems.read(reader);
			content.clear();
			dom.clearNode(host);
			if (!feedbackItems.length) {
				setChatInputStackSlot(host, ChatInputStackSlot.Empty);
				return;
			}

			const count = feedbackItems.length;
			const text = count === 1
				? localize('newSessionFeedback.one', "1 comment")
				: localize('newSessionFeedback.many', "{0} comments", count);
			const store = new DisposableStore();
			content.value = store;
			const banner = store.add(this.instantiationService.createInstance(SessionInputBannerWidget, {
				icon: Codicon.commentDiscussion,
				accent: false,
				text,
				ariaLabel: text,
				actions: [{
					label: localize('newSessionFeedback.reveal', "Reveal"),
					run: () => this.agentFeedbackService.revealFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, feedbackItems[0].id),
				}],
			}));
			host.appendChild(banner.domNode);
			// Docks to the composer below it.
			setChatInputStackSlot(host, ChatInputStackSlot.Docked);
		}));
	}

	private _renderBackgroundSendStatus(container: HTMLElement): void {
		const status = dom.append(container, dom.$('.new-session-send-status'));
		this._register(autorun(reader => {
			const message = this._backgroundSendStatus.read(reader);
			dom.clearNode(status);
			status.style.visibility = message ? '' : 'hidden';
			status.style.display = this._backgroundSend || message ? '' : 'none';
			if (message) {
				const checkmark = renderIcon(Codicon.check);
				checkmark.setAttribute('aria-hidden', 'true');
				dom.append(status, dom.$('span.new-session-send-status-message', undefined, message), checkmark);
				this.accessibilityService.status(message);
				const sessionResource = this._lastBackgroundSentSessionResource;
				const sentSession = this._lastBackgroundSentSession;
				const draftHost = this._draftHost;
				if (sessionResource) {
					reader.store.add(this.instantiationService.createInstance(Link, status, {
						label: localize('newSession.openSentSession', "Open Session"),
						href: sessionResource.toString(),
					}, {
						opener: () => {
							// A hosted composer opens the session in its own window, never in the main window.
							const opened = draftHost && sentSession
								? draftHost.openStartedSession(sentSession)
								: this.sessionsService.openSession(sessionResource, { source: this._backgroundSend ? 'inbox' : 'link', forceMainChat: true });
							void opened.catch(onUnexpectedError);
						},
					}));
					const dismissal = reader.store.add(new MutableDisposable<IDisposable>());
					let remaining = 8000;
					let startedAt = Date.now();
					let hovered = false;
					let focused = false;
					const updateDismissal = () => {
						if (hovered || focused) {
							if (dismissal.value) {
								remaining -= Date.now() - startedAt;
								dismissal.clear();
							}
						} else if (!dismissal.value) {
							startedAt = Date.now();
							dismissal.value = disposableTimeout(() => {
								this._lastBackgroundSentSessionResource = undefined;
								this._lastBackgroundSentSession = undefined;
								this._backgroundSendStatus.set(undefined, undefined);
							}, Math.max(0, remaining));
						}
					};
					reader.store.add(dom.addDisposableListener(status, dom.EventType.MOUSE_ENTER, () => { hovered = true; updateDismissal(); }));
					reader.store.add(dom.addDisposableListener(status, dom.EventType.MOUSE_LEAVE, () => { hovered = false; updateDismissal(); }));
					reader.store.add(dom.addDisposableListener(status, dom.EventType.FOCUS_IN, () => { focused = true; updateDismissal(); }));
					reader.store.add(dom.addDisposableListener(status, dom.EventType.FOCUS_OUT, () => { focused = false; updateDismissal(); }));
					updateDismissal();
				} else {
					reader.store.add(disposableTimeout(() => this._backgroundSendStatus.set(undefined, undefined), 5000));
				}
			}
		}));
		this._register(this._newChatInput.onDidChangeInput(() => {
			if (this._newChatInput.hasInput) {
				this._lastBackgroundSentSessionResource = undefined;
				this._lastBackgroundSentSession = undefined;
				this._backgroundSendStatus.set(undefined, undefined);
				this._lastBackgroundSendOptions = undefined;
			}
		}));
	}

	saveState(): void {
		this._newChatInput.saveState();
	}

	layout(_height: number, _width: number): void {
		this._newChatInput.layout(_height, _width);
	}

	focusInput(): void {
		// While the empty state is mounted, the chat input is hidden via
		// CSS (`.no-agent-host` on `.new-chat-widget-content`) so focusing
		// it would just send focus to <body>. Land on the empty state's
		// heading instead so the user has a visible focus target.
		const emptyState = this._activeEmptyState.get();
		if (emptyState) {
			emptyState.focus();
			return;
		}
		this._newChatInput.focus();
	}

	private async _handleWorkspaceSelection(folderUri: URI | undefined): Promise<void> {
		const host = this._draftHost;
		if (host?.setRequestedTarget) {
			// In a Dev Container only as the user picked it, in the environment the folder was picked in.
			host.setRequestedTarget({ ...host.requestedTarget?.get(), folderUri, requireDevContainer: this._environment.get()?.kind === 'container' || undefined }, 'user');
		}
		if (!this._isCurrentWorkspaceSelection(folderUri)) {
			await this._onWorkspaceSelected(folderUri);
		}
		if (folderUri || !this._workspaceOptOutEnabled.get()) {
			this._newChatInput.focus();
		}
	}

	private _isCurrentWorkspaceSelection(folderUri: URI | undefined): boolean {
		const session = this._session.get();
		if (!folderUri || !session || isSessionCreated(session) || this._pendingWorkspaceCreation
			|| !this.uriIdentityService.extUri.isEqual(session.workspace.get()?.folders[0]?.root, folderUri)
			|| this._workspacePicker.selectedResolved?.providerId !== session.providerId) {
			return false;
		}
		const provider = this.sessionsProvidersService.getProvider(session.providerId, session.sessionId);
		const devContainerEnabled = !!provider && isAgentHostProvider(provider) && provider.isDevContainerEnabled?.(session.sessionId) === true;
		return devContainerEnabled === this.uriIdentityService.extUri.isEqual(this._preferredDevContainerFolderUri, folderUri);
	}

	/**
	 * Handles a workspace selection from the workspace picker and creates a
	 * new session for it. Workspace trust (when required) is requested by
	 * {@link ISessionsService.openNewSession} itself — a single gate shared
	 * by every path that creates a concrete session for a folder.
	 */
	private async _onWorkspaceSelected(folderUri: URI | undefined, userPick?: IPreferredSessionType): Promise<void> {
		this._workspaceSelectionCleared = !folderUri && this._workspaceOptOutEnabled.get();
		const workspaceOptOutTarget = this._workspaceSelectionCleared ? this._workspaceOptOutTarget.get() : undefined;
		// Cancel any in-flight upgrade for a previous selection.
		this._pendingPreferredUpgrade.clear();
		if (!folderUri || !this._preferredDevContainerFolderUri || !this.uriIdentityService.extUri.isEqual(this._preferredDevContainerFolderUri, folderUri)) {
			this._preferredDevContainerFolderUri = undefined;
		}
		const currentFolderUri = this._session.get()?.workspace.get()?.folders[0]?.root;
		const refreshingPromptOptions = !!currentFolderUri
			&& (!folderUri || !this.uriIdentityService.extUri.isEqual(currentFolderUri, folderUri))
			&& this._newChatInput.preparePromptOptionsRefresh();

		if (!folderUri) {
			this._noWorkspaceRestore.clear();
			this._newSessionCreation.clear();
			if (workspaceOptOutTarget) {
				if (!this.selectNoWorkspace(workspaceOptOutTarget, { userSelection: false, preserveNavigation: true })) {
					if (this._detached) {
						this._draftSlot.discardNewSession();
					} else {
						this.sessionsService.unsetNewSession();
					}
					this.notificationService.error(localize('newSession.workspaceOptOutFailed', "Unable to start a chat without a workspace. Choose a workspace to continue."));
				}
				return;
			}
			if (this._detached) {
				this._draftSlot.discardNewSession();
			} else {
				this.sessionsService.unsetNewSession();
			}
			if (!this._workspaceOptOutEnabled.get()) {
				void this._restoreNoWorkspaceDraft();
			}
			return;
		}

		if (this._store.isDisposed) {
			return;
		}

		const result = await this._createNewSession(folderUri, userPick);
		if (refreshingPromptOptions && !result.session) {
			this._newChatInput.showPromptOptions(undefined);
		}
		if (result.trustDeclined) {
			// Don't leave the picker showing the declined folder as selected.
			this._workspacePicker.removeFromRecents(folderUri);
		}
	}

	private async _refreshPromptOptions(): Promise<void> {
		try {
			await this._newChatInput.refreshPromptOptions();
		} catch (error) {
			this.logService.error('Failed to refresh new-session prompt options:', error);
			this._newChatInput.showPromptOptions(undefined);
		}
	}

	prefillInput(text: string): void {
		this._newChatInput.prefillInput(text);
	}

	setHostVisible(visible: boolean): void {
		this._aquariumToggle?.setHostVisible(visible);
		// Another composer can consume the shared draft while this host is hidden.
		if (visible && this._detached && !this._session.get() && !this._newSessionCreation.value) {
			this._seedWorkspaceDraft();
		}
	}

	sendQuery(text: string): Promise<boolean> {
		return this._newChatInput.sendQuery(text);
	}

	submitInput(): Promise<boolean> {
		if (!this._session.get()) {
			this._workspacePicker.showPicker();
			return Promise.resolve(false);
		}
		return this._newChatInput.submit();
	}

	attach(uris: URI[]): void {
		this._newChatInput.attach(uris);
	}

	private _canApplyWorkspaceDefault(): boolean {
		const session = this._session.get();
		return !session || session.sessionId === this._createdSessionId;
	}

	async applyDraft(draft: IAgentsWindowDraft, folderUri: URI | undefined, options: ISelectWorkspaceOptions, token: CancellationToken): Promise<WorkspaceSelectionResult> {
		if (!this._newChatInput.isInputReady) {
			return 'notReady';
		}
		if (token.isCancellationRequested || this._newChatInput.hasInput || this._feedbackItems.get().length > 0) {
			return 'preserved';
		}
		const input = reviveChatDraft(draft);
		const store = new DisposableStore();
		const cancellation = new CancellationTokenSource(token);
		store.add(toDisposable(() => cancellation.dispose(true)));
		store.add(this._newChatInput.onDidChangeInput(() => {
			if (this._newChatInput.hasInput) {
				cancellation.cancel();
			}
		}));
		try {
			if (folderUri) {
				this._reconcileWorkspaceEnvironment(options);
				const result = await this._createNewSession(folderUri, this._newChatInput.sessionTypePicker.getUserPickedSessionType(), {
					token: cancellation.token, providerId: options.providerId, preferDevContainer: options.preferDevContainer,
				});
				if (cancellation.token.isCancellationRequested || this._store.isDisposed || this._newChatInput.hasInput || result.trustDeclined) {
					return 'preserved';
				}
				if (!result.session) {
					return 'notReady';
				}
				this._workspacePicker.setSelectedWorkspace(folderUri, {
					fireEvent: false,
					providerId: result.session.providerId,
					preferDevContainer: options.preferDevContainer,
					origin: options.selectionOrigin,
				});
			}
			if (cancellation.token.isCancellationRequested || this._store.isDisposed) {
				return 'preserved';
			}
			return this._newChatInput.applyDraft(input) ? 'applied' : 'preserved';
		} finally {
			store.dispose();
		}
	}

	private _reconcileWorkspaceEnvironment(options: ISelectWorkspaceOptions): void {
		const providerId = options.providerId;
		if (!providerId || !this._environment.get()) {
			return;
		}
		const environments = this._environments.get();
		let environment = environments.find(environment => environment.kind !== 'container' && environment.providerIds.includes(providerId));
		if (!environment) {
			const provider = this.sessionsProvidersService.getProvider(providerId);
			environment = provider && getRemoteSessionCreationEnvironment(provider);
		}
		if (environment) {
			this._pickedEnvironment.set(options.preferDevContainer
				? { ...environment, id: `container:${environment.id}`, kind: 'container', label: localize('environmentPicker.container', "Dev Container"), icon: Codicon.remote }
				: environment, undefined);
		}
	}

	selectWorkspace(folderUri: URI, options?: ISelectWorkspaceOptions): WorkspaceSelectionResult {
		const blocked = options?.isDefault ? this._getWorkspaceDefaultBlocker() : undefined;
		if (blocked) {
			return blocked;
		}
		if (options) {
			this._reconcileWorkspaceEnvironment(options);
		}
		this._preferredDevContainerFolderUri = options?.preferDevContainer ? folderUri : undefined;
		this._workspacePicker.setSelectedWorkspace(folderUri, { providerId: options?.providerId, preferDevContainer: options?.preferDevContainer, origin: options?.selectionOrigin });
		const selection = this._workspacePicker.selectionSnapshot;
		return selection.state === 'selected' && this.uriIdentityService.extUri.isEqual(selection.folderUri, folderUri) ? 'applied' : 'notReady';
	}

	/** Starts without a workspace for the window opening intent, acknowledging application or preservation of an existing choice. */
	applyNoWorkspace(options?: ISelectNoWorkspaceOptions): WorkspaceSelectionResult {
		const blocked = options?.isDefault ? this._getWorkspaceDefaultBlocker() : undefined;
		if (blocked) {
			return blocked;
		}
		// Without a quick chat, for example while the environment has no compatible target yet, the previous draft is still the session.
		const session = this.selectNoWorkspace(undefined, options);
		return session && this._workspacePicker.selectionSnapshot.state === 'noWorkspace' ? 'applied' : 'notReady';
	}

	/** Why an inferred default must not replace the current workspace choice, if it must not. */
	private _getWorkspaceDefaultBlocker(): WorkspaceSelectionResult | undefined {
		if (this._newSessionCreation.value) {
			return 'notReady';
		}
		const selection = this._workspacePicker.selectionSnapshot;
		if (!this._newChatInput.canApplyWorkspaceDefault
			|| selection.state === 'noWorkspace'
			|| selection.origin === WorkspaceSelectionOrigin.User
			|| selection.origin === WorkspaceSelectionOrigin.WindowOpen
			|| selection.origin === WorkspaceSelectionOrigin.RestoredDraft
			|| selection.origin === WorkspaceSelectionOrigin.SessionSync
			|| selection.origin === WorkspaceSelectionOrigin.Programmatic) {
			return 'preserved';
		}
		return undefined;
	}
}

// #endregion
