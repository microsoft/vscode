/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWidget.css';
import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { Action, toAction } from '../../../../base/common/actions.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { isCancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedObservableWithCache, disposableObservableValue, IObservable, observableFromEvent, observableSignalFromEvent, observableValue, waitForState } from '../../../../base/common/observable.js';
import { isWeb } from '../../../../base/common/platform.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMenu, IMenuService } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { deriveGitHubEndpoints } from '../../../../platform/github/common/githubEndpoints.js';
import { asJson, IRequestService, isSuccess } from '../../../../platform/request/common/request.js';
import { localize } from '../../../../nls.js';
import { IActiveSession, ICreateNewSessionOptions, ISessionsManagementService, WorkspaceNotTrustedError } from '../../../services/sessions/common/sessionsManagement.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISession, ISessionWorkspace, SESSION_WORKSPACE_GROUP_GITHUB } from '../../../services/sessions/common/session.js';
import { IOpenNewSessionResult, ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { isAllowSignedOutWhenUsableEnabled, shouldShowGitHubWorkspaceGroupSignIn } from '../../../browser/sessionsAuthGate.js';
import { AGENTIC_SIGN_IN_COMMAND_ID, FOCUS_NEW_SESSION_HARNESS_PICKER_COMMAND_ID, FOCUS_NEW_SESSION_WORKSPACE_PICKER_COMMAND_ID } from '../../../common/sessionCommands.js';
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { IsPhoneLayoutContext, NewSessionCreationProviderIdContext } from '../../../common/contextkeys.js';
import { IAquariumService, IMountedToggleHandle } from '../../aquarium/browser/aquariumOverlay.js';
import { IWorkspacePickerContextAction, IWorkspacePickerNoWorkspaceOption, IWorkspacePickerTrigger, WorkspacePicker } from './sessionWorkspacePicker.js';
import { WebWorkspacePicker } from './webWorkspacePicker.js';
import { IPickedSessionType, IPreferredSessionType } from './sessionTypePicker.js';
import { getLabeledPickerResponsiveItems, NEW_SESSION_PROMPT_PLACEHOLDER, NewChatInputWidget } from './newChatInput.js';
import { ChatInputPickerResponsiveLayout } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerResponsiveLayout.js';
import { NoAgentHostEmptyState } from './noAgentHostEmptyState.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IAgentHostFilterService } from '../../../services/agentHostFilter/common/agentHostFilter.js';
import { IChatViewOptions, ISelectNoWorkspaceOptions, ISelectWorkspaceOptions, WorkspaceSelectionResult } from '../../../browser/parts/chatView.js';
import { NewChatUserInteraction } from './newChatUserInteraction.js';
import { WorkspaceSelectionOrigin } from '../../../common/workspaceSelection.js';
import { ISessionPickerVisibility, noSessionPickerVisibility } from '../../../services/sessions/common/sessionPickerVisibility.js';
import { AGENT_FEEDBACK_NEW_SESSION_RESOURCE, AgentFeedbackState, IAgentFeedback, IAgentFeedbackService } from '../../agentFeedback/browser/agentFeedbackService.js';
import { buildNewSessionPrompt } from '../../agentFeedback/browser/agentFeedbackAttachmentEntry.js';
import { SessionInputBannerWidget } from '../../sessionInputBanners/browser/sessionInputBannerWidget.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ChatInputTipPresenter } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputTipPresenter.js';
import { chatInputStackClass, ChatInputStackSlot, setChatInputStackSlot } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputStack.js';
import { IChatPetService } from '../../../../workbench/contrib/chat/browser/chatPetService.js';
import { IChatTipService } from '../../../../workbench/contrib/chat/browser/chatTipService.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { AgentsWindowUsage } from '../../../../workbench/contrib/chat/common/agentsWindowUsage.js';
import { INewSessionComposerService, NewSessionWorkspacePreselectionSource } from './newSessionComposerService.js';
import { Menus } from '../../../browser/menus.js';
import { getAdditionalFolderContextId, getAdditionalRepositoryContextId } from '../common/newChatContextIds.js';
import { AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING, COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING, COMPARE_AGENTS_ENABLED_SETTING, COMPARE_AGENTS_OPEN_IN_GRID_SETTING, EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING, NEW_SESSION_WELCOME_MESSAGES_SETTING, NEW_SESSION_WELCOME_NAME_SETTING, NEW_SESSION_WELCOME_PHRASES_SETTING, UNIFIED_WORKSPACE_PICKER_SETTING } from '../common/constants.js';
import { getNewSessionWelcomePhrases, INewSessionWelcomeMessagesConfiguration } from '../common/welcomePhrases.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { getSessionComparisonWorkspaceError, ISessionComparisonHarness, ISessionComparisonService } from '../../../services/sessions/common/sessionComparison.js';
import { OPEN_SESSION_COMPARISON_COMMAND_ID } from '../../sessionComparison/common/sessionComparison.js';
import { SessionComparisonModelSelection } from './sessionComparisonModelSelection.js';
import { TABBED_MODEL_PICKER_SETTING_ID } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerWidget.js';
import { isAutoModel, isHydraFusionModel } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerPresentation.js';
import { IAgentsWindowDraft } from '../../../../platform/window/common/window.js';
import { reviveChatDraft } from '../../../../workbench/contrib/chat/common/attachments/chatDraft.js';
import { NewChatMigrationNotice } from './newChatMigrationNotice.js';
import { FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN, FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN } from './newChatPickerKeybinding.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ISessionsRecentWorkspacesService } from '../../../services/sessions/browser/sessionsRecentWorkspacesService.js';

// #region --- New Chat Widget ---

/** Minimum number of started sessions required before showing tips and promotions. */
const MIN_SESSIONS_FOR_FIRST_RUN_NOTICES = 2;
/** Persists whether the user explicitly chose to expand the new-session options tray. */
const SESSION_OPTIONS_EXPANDED_STORAGE_KEY = 'agentSessions.newSession.sessionOptionsExpanded2';
let sessionOptionsIdPool = 0;
let nextNewSessionWelcomePhraseIndex = 0;
const githubProfileNames = new Map<string, Promise<string | undefined>>();

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

function getComparisonHasGitRemote(session: ISession | undefined, selectedWorkspace: ISessionWorkspace | undefined, selectedFolderUri: URI | undefined): boolean | undefined {
	const selectedWorkspaceHasGitRemote = getComparisonSelectedWorkspaceFolder(selectedWorkspace, selectedFolderUri)?.gitRepository?.hasGitRemote;
	if (selectedWorkspaceHasGitRemote !== undefined) {
		return selectedWorkspaceHasGitRemote;
	}
	return getComparisonSessionFolder(session, selectedFolderUri)?.gitRepository?.hasGitRemote;
}

export function isExperimentalSessionComposerLayoutEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(UNIFIED_WORKSPACE_PICKER_SETTING)
		&& configurationService.getValue<boolean>(EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING);
}

export function areNewSessionWelcomePhrasesEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(NEW_SESSION_WELCOME_PHRASES_SETTING);
}

export class NewChatWidget extends Disposable {

	private readonly _usage: AgentsWindowUsage;
	private readonly _workspacePicker: WorkspacePicker;
	private readonly _newChatInput: NewChatInputWidget;
	private readonly _chatTipPresenter = this._register(new MutableDisposable<ChatInputTipPresenter>());
	private _isChatTipSessionInitialized = false;
	private _aquariumToggle: IMountedToggleHandle | undefined;

	/** Recreates the draft once a better/late-registering provider can serve the folder (see {@link _createNewSession}). */
	private readonly _pendingPreferredUpgrade = new MutableDisposable<IDisposable>();
	private readonly _newSessionCreation = new MutableDisposable<IDisposable>();
	private readonly _noWorkspaceRestore = this._register(new MutableDisposable<IDisposable>());
	private _pendingWorkspaceCreation: Promise<IOpenNewSessionResult> | undefined;
	private _createdSessionId: string | undefined;
	private _preferredDevContainerFolderUri: URI | undefined;

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
	private _quickChatHeaderPickerHost: HTMLElement | undefined;

	private readonly _session: IObservable<IActiveSession | undefined>;

	/** Whether the active draft is a workspace-less quick chat. */
	private readonly _isQuickChatComposer: IObservable<boolean>;
	private readonly _isWorkspacePickerQuickChat: IObservable<boolean>;
	private readonly _useConsolidatedRemoteWorkspaces: IObservable<boolean>;
	private readonly _compareAgentsEnabled: IObservable<boolean>;
	private readonly _useExperimentalComposerLayout: IObservable<boolean>;
	private readonly _agentsPickerInAttachContextMenu: IObservable<boolean>;
	private readonly _screenReaderOptimized: IObservable<boolean>;
	private readonly _collapsedSessionOptionsShowIcons: IObservable<boolean>;
	private readonly _showWelcomePhrases: IObservable<boolean>;
	private readonly _newSessionAttachContextMenu: IMenu;

	/** Draft comments shared by every uncreated new-session composer. */
	private readonly _feedbackItems: IObservable<readonly IAgentFeedback[]>;

	/** In-flight background sends awaiting confirmation before their comments are cleared. */
	private readonly _pendingBackgroundSends = this._register(new DisposableMap<object>());

	readonly pickerVisibility: IObservable<ISessionPickerVisibility>;
	private readonly _comparisonSelection: SessionComparisonModelSelection;
	private readonly _welcomePhraseIndex = NewChatWidget._takeNextWelcomePhraseIndex();
	private readonly _githubProfileName = observableValue<string | undefined>(this, undefined);
	private _githubProfileAccountKey: string | undefined;
	private _welcomePhraseAnnounced = false;

	private static _takeNextWelcomePhraseIndex(): number {
		const index = nextNewSessionWelcomePhraseIndex;
		nextNewSessionWelcomePhraseIndex = index + 1 < Number.MAX_SAFE_INTEGER ? index + 1 : 0;
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
		@IMenuService menuService: IMenuService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@ILogService private readonly logService: ILogService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
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
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IRequestService private readonly requestService: IRequestService,
		@IStorageService private readonly storageService: IStorageService,
		@INewSessionComposerService private readonly newSessionComposerService: INewSessionComposerService,
		@ICommandService private readonly commandService: ICommandService,
		@ISessionComparisonService private readonly sessionComparisonService: ISessionComparisonService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this._newSessionAttachContextMenu = this._register(menuService.createMenu(Menus.NewSessionAttachContext, this.contextKeyService));
		this._usage = new AgentsWindowUsage(storageService);
		this._register(this._pendingPreferredUpgrade);
		this._register(this._newSessionCreation);

		this._restoreSessionOptionsExpanded();

		// TODO: @sandy081 The session/chat should be passed down. There should not be sessionsService.activeSession read in the widget.
		this._session = derivedObservableWithCache<IActiveSession | undefined>(this, (reader, prev) => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			if (activeSession && activeSession.isCreated.read(reader)) {
				return prev;
			}

			return activeSession;
		});

		// A quick chat is workspace-less; the composer hides the workspace picker
		// (nothing to pick) and surfaces the session-type picker in the controls.
		this._isQuickChatComposer = derived(this, reader => {
			const session = this._session.read(reader);
			return session?.isQuickChat?.read(reader) ?? false;
		});
		this._useConsolidatedRemoteWorkspaces = observableFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(UNIFIED_WORKSPACE_PICKER_SETTING)),
			() => this.configurationService.getValue<boolean>(UNIFIED_WORKSPACE_PICKER_SETTING),
		);
		this._compareAgentsEnabled = observableFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(COMPARE_AGENTS_ENABLED_SETTING)),
			() => this.configurationService.getValue<boolean>(COMPARE_AGENTS_ENABLED_SETTING),
		);
		this._useExperimentalComposerLayout = observableFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event =>
				event.affectsConfiguration(UNIFIED_WORKSPACE_PICKER_SETTING)
				|| event.affectsConfiguration(EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING)),
			() => isExperimentalSessionComposerLayoutEnabled(this.configurationService),
		);
		this._agentsPickerInAttachContextMenu = observableFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event =>
				event.affectsConfiguration(AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING)),
			() => this.configurationService.getValue<boolean>(AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING),
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
		this._showWelcomePhrases = observableFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(NEW_SESSION_WELCOME_PHRASES_SETTING)),
			() => areNewSessionWelcomePhrasesEnabled(this.configurationService),
		);
		this._isWorkspacePickerQuickChat = derived(this, reader => {
			const session = this._session.read(reader);
			return this._useConsolidatedRemoteWorkspaces.read(reader) && !!session?.isQuickChat?.read(reader);
		});

		// On web (vscode.dev / insiders.vscode.dev), use {@link WebWorkspacePicker}
		// which scopes recents to the active host and renders as a bottom
		// sheet on phone-layout viewports. On Electron desktop, the regular
		// {@link WorkspacePicker} is fine — phones never run there.
		const PickerCtor = isWeb ? WebWorkspacePicker : WorkspacePicker;
		this._workspacePicker = this._register(this.instantiationService.createInstance(PickerCtor, {
			canRestoreWorkspace: () => !this._isQuickChatComposer.get() || this._newChatInput?.canApplyWorkspaceDefault === true,
			onUserSelection: () => newSessionComposerService.notifyUserWorkspaceSelection(),
			whenSelectionAccepted: async () => {
				const session = this._pendingWorkspaceCreation ? (await this._pendingWorkspaceCreation).session : this._session.get();
				return !!session && this._session.get()?.sessionId === session.sessionId;
			},
			getWorkspaceGroupAction: group => {
				if (group === SESSION_WORKSPACE_GROUP_GITHUB && shouldShowGitHubWorkspaceGroupSignIn(
					this.defaultAccountService.currentDefaultAccount !== null,
					isAllowSignedOutWhenUsableEnabled(this.configurationService),
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
		}));
		const providersChanged = observableSignalFromEvent(this, this.sessionsProvidersService.onDidChangeProviders);
		this._register(autorun(reader => {
			providersChanged.read(reader);
			const activeSession = this._session.read(reader);
			activeSession?.isQuickChat?.read(reader);
			this._workspacePicker.refreshTriggerLabel();
			if (!activeSession) {
				return;
			}
			const provider = this.sessionsProvidersService.getProvider(activeSession.providerId);
			if (!provider || !isAgentHostProvider(provider)) {
				return;
			}
			reader.store.add(Event.filter(
				provider.onDidChangeSessionConfig,
				sessionId => sessionId === activeSession.sessionId,
			)(() => this._syncWorkspacePickerDevContainerMode(activeSession, false, WorkspaceSelectionOrigin.SessionSync)));
		}));

		const feedbackChanged = observableSignalFromEvent(this, this.agentFeedbackService.onDidChangeFeedback);
		this._feedbackItems = derived(this, reader => {
			feedbackChanged.read(reader);
			return this.agentFeedbackService.getFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE)
				.filter(item => item.state === AgentFeedbackState.Accepted);
		});

		const pickerSetting = observableFromEvent(this, this.configurationService.onDidChangeConfiguration,
			() => this.configurationService.getValue<boolean>(TABBED_MODEL_PICKER_SETTING_ID));
		const comparisonWorkspaceChanged = observableSignalFromEvent(this, this._workspacePicker.onDidChangeSelection);
		const comparisonConfigResolving = derived(this, reader => {
			const session = this._session.read(reader);
			const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
			return !!session && !!provider && isAgentHostProvider(provider) && provider.isSessionConfigResolving(session.sessionId).read(reader);
		});
		this._comparisonSelection = this._register(new SessionComparisonModelSelection(derived(this, reader => {
			comparisonWorkspaceChanged.read(reader);
			comparisonConfigResolving.read(reader);
			this._compareAgentsEnabled.read(reader);
			const session = this._session.read(reader);
			session?.workspace.read(reader);
			session?.loading.read(reader);
			return pickerSetting.read(reader) && !this._isQuickChatComposer.read(reader) && this._shouldShowComparisonAction();
		}), comparisonConfigResolving));
		const canSendRequest = derived(reader => {
			const session = this._session.read(reader);
			if (!session) {
				return false;
			}
			if (session.loading.read(reader)) {
				return false;
			}
			return !this._comparisonSelection.enabled.read(reader)
				|| this._comparisonSelection.available.read(reader) && this._comparisonSelection.configured.read(reader);
		});

		const loading = derived(reader => {
			const session = this._session.read(reader);
			return session?.loading.read(reader) ?? false;
		});
		const hasFeedback = derived(this, reader => this._feedbackItems.read(reader).length > 0);
		const canSubmitWithoutSession = derived(this, reader => !this._session.read(reader));
		const deferredNotificationsEnabled = observableFromEvent(
			this,
			this._usage.onDidChangeCreatedSessionCount(this._store),
			() => this._hasEnoughSessionsForFirstRunNotices(),
		);

		const creationProviderId = observableFromEvent(this, this.agentHostFilterService.onDidChange, () => isWeb ? this.agentHostFilterService.selectedHost?.sessionCreationProviderId : undefined);
		const creationProviderKey = NewSessionCreationProviderIdContext.bindTo(contextKeyService);
		this._register(autorun(reader => creationProviderKey.set(creationProviderId.read(reader) ?? '')));
		this._register(toDisposable(() => creationProviderKey.reset()));

		const newChatInput = this.instantiationService.createInstance(NewChatInputWidget, {
			session: this._session,
			getContextFolderUri: () => this._getContextFolderUri(),
			showDevContainerSamples: () => this._workspacePicker.showDevContainerSamples(),
			getContextPickerActions: () => this._getContextPickerActions(),
			getWorkspacePreselectionSource: () => this._isQuickChatComposer.get()
				? NewSessionWorkspacePreselectionSource.None
				: this._workspacePicker.preselectionSource,
			getWorkspaceSelection: () => this._isQuickChatComposer.get()
				? { ...this._workspacePicker.selectionSnapshot, folderUri: undefined, origin: WorkspaceSelectionOrigin.None, state: 'noWorkspace' }
				: this._workspacePicker.selectionSnapshot,
			onDidChangeWorkspaceSelection: Event.any(this._workspacePicker.onDidChangeSelection, Event.fromObservableLight(this._isQuickChatComposer)),
			canApplyWorkspaceDefault: () => this._canApplyWorkspaceDefault(),
			sendRequest: async ({ query, attachments, background, userInteraction }) => this._send(query, attachments, background, userInteraction),
			clearInputOnSendStart: () => this._comparisonSelection.enabled.get(),
			modelPickerWorkflow: this._comparisonSelection,
			sendButtonLabel: derived(this, reader => this._comparisonSelection.enabled.read(reader)
				? localize('comparisonPicker.runAttempts', "Run {0} Attempts", this._comparisonSelection.attemptModelIds.read(reader).length)
				: undefined),
			inputVisible: this.options.inputVisible,
			hostVisible: this.options.hostVisible,
			canSendRequest,
			canSubmitWithoutSession,
			hasAdditionalSendContent: hasFeedback,
			loading,
			useExperimentalLayout: this._useExperimentalComposerLayout,
			historyKey: constObservable(undefined), // no persisted history for the new-session view
			placeholder: NEW_SESSION_PROMPT_PLACEHOLDER,
			supportsBackground: true,
			deferredNotificationsEnabled,
			petHostPreferred: this.options.petHostPreferred,
			getChatPetPlatformElements: () => this._workspacePicker.getChatPetPlatformElements(),
			onDidChangeChatPetPlatform: this._workspacePicker.onDidChangeChatPetPlatform,
			sessionTypePickerOptions: {
				providerId: creationProviderId,
				prepareSessionTypeSelection: pick => this._prepareSessionTypeSelection(pick),
				focusCommand: {
					id: FOCUS_NEW_SESSION_HARNESS_PICKER_COMMAND_ID,
					label: localize('newSessionHarnessPicker.tooltip', "Choose the harness for the new session"),
					when: FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN,
					enabled: this._useConsolidatedRemoteWorkspaces,
				},
			},
		});
		this._register(toDisposable(() => newChatInput.saveState()));
		this._newChatInput = this._register(newChatInput);
		let comparisonHarness: string | undefined;
		this._register(autorun(reader => {
			const session = this._session.read(reader);
			const harness = session ? JSON.stringify([session.providerId, session.sessionType]) : undefined;
			if (harness !== comparisonHarness) {
				this._comparisonSelection.reset();
				comparisonHarness = harness;
			}
			const state = newChatInput.selectedModelState.read(reader);
			if (!session?.loading.read(reader) && !comparisonConfigResolving.read(reader)) {
				this._comparisonSelection.retainModels(new Set(state.models
					.filter(model => !isAutoModel(model) && !isHydraFusionModel(model))
					.map(model => model.identifier)));
			}
		}));
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

		this._register(newSessionComposerService.registerComposer(this._newChatInput));

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

		this._register(this._workspacePicker.onDidSelectWorkspace(async folderUri => {
			if (!this._isCurrentWorkspaceSelection(folderUri)) {
				await this._onWorkspaceSelected(folderUri);
			}
			this._newChatInput.focus();
		}));
		this._register(this._workspacePicker.onDidSelectWorkspaceMode(({ folderUri, preferDevContainer }) => {
			this._preferredDevContainerFolderUri = preferDevContainer ? folderUri : undefined;
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
			// A quick chat has no folder: re-create the draft with the picked
			// type via openQuickChat (mirrors the folder path's draft recreation).
			if (this._isQuickChatComposer.get()) {
				this._openQuickChat(pick ? { providerId: pick.providerId, sessionTypeId: pick.sessionTypeId } : undefined);
				this._newChatInput.focus();
				return;
			}
			await this._onWorkspaceSelected(this._workspacePicker.selectedFolderUri, pick);
			this._newChatInput.focus();
		}));
		this._register(this.sessionsManagementService.onDidChangeSessionTypes(() => this._restoreNoWorkspaceDraft()));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (!e.affectsConfiguration('chat.tips.enabled')) {
				return;
			}
			if (this.configurationService.getValue<boolean>('chat.tips.enabled')) {
				this._renderChatTip();
			} else {
				this._clearChatTip();
			}
		}));
		this._register(this._usage.onDidChangeCreatedSessionCount(this._store)(() => this._renderChatTip()));
		const foregroundSessionCountContextKeys = new Set([ChatContextKeys.foregroundSessionCount.key]);
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(foregroundSessionCountContextKeys)) {
				this._renderChatTip();
			}
		}));

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

	private _getContextPickerActions(): readonly IWorkspacePickerContextAction[] {
		const actions = this._workspacePicker.getContextPickerActions();
		const session = this._session.get();
		const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
		if (!session || !provider || !isAgentHostProvider(provider) || this.contextKeyService.getContextKeyValue<boolean>(IsPhoneLayoutContext.key)) {
			return actions;
		}
		logSettingExperimentTrigger(this.telemetryService, AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING);
		if (!this._agentsPickerInAttachContextMenu.get()) {
			return actions;
		}
		const agentAction = this._newSessionAttachContextMenu.getActions({ shouldForwardArgs: true })
			.flatMap(([, menuActions]) => menuActions)
			.find(action => action.id === 'sessions.agentHost.agentPicker');
		if (!agentAction) {
			return actions;
		}
		return [{
			label: localize('newSession.agentContextAction', "Agent..."),
			icon: Codicon.agent,
			placement: 'top',
			run: async () => this._newChatInput.runAttachContextAction(agentAction),
		}, ...actions];
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

	render(parent: HTMLElement): void {
		const element = dom.append(parent, dom.$('.sessions-chat-widget'));
		const chatWidgetContainer = dom.append(element, dom.$('.new-chat-widget-container'));
		const chatWidgetContent = dom.append(chatWidgetContainer, dom.$(`.new-chat-widget-content.${chatInputStackClass}`));
		const welcomeMessage = dom.append(chatWidgetContent, dom.$('.new-session-welcome-message'));
		const welcomeMessageTitle = dom.append(welcomeMessage, dom.$('h2.new-session-welcome-message-title'));
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

		const configuredWelcomeNameChanged = observableSignalFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(NEW_SESSION_WELCOME_NAME_SETTING)),
		);
		const configuredWelcomeMessagesChanged = observableSignalFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(NEW_SESSION_WELCOME_MESSAGES_SETTING)),
		);
		this._register(autorun(reader => {
			configuredWelcomeNameChanged.read(reader);
			this._showWelcomePhrases.read(reader);
			void this._refreshGitHubProfileName();
		}));
		this._register(autorun(reader => {
			configuredWelcomeNameChanged.read(reader);
			configuredWelcomeMessagesChanged.read(reader);
			const profileName = this._githubProfileName.read(reader);
			const inputVisible = this.options.inputVisible?.read(reader) ?? true;
			const phrases = getNewSessionWelcomePhrases(
				this.configurationService.getValue<INewSessionWelcomeMessagesConfiguration | undefined>(NEW_SESSION_WELCOME_MESSAGES_SETTING),
				this._getWelcomeName(profileName),
			);
			const phrase = this._updateWelcomeMessage(
				welcomeMessage,
				welcomeMessageTitle,
				this._showWelcomePhrases.read(reader),
				phrases,
				this._welcomePhraseIndex,
			);
			chatWidgetContent.classList.toggle('welcome-phrases-visible', !!phrase);
			this._announceWelcomeMessage(phrase, inputVisible);
		}));
		this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => void this._refreshGitHubProfileName()));

		this._aquariumToggle = this._register(this.aquariumService.mountToggle(element));
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
				getActions: () => [aquariumAction, petAction],
				getCheckedActionsRepresentation: () => 'checkbox',
			});
		}));

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
			const useExperimentalLayout = this._useExperimentalComposerLayout.read(reader);
			const isQuickChat = this._isQuickChatComposer.read(reader);
			const isWorkspacePickerQuickChat = this._isWorkspacePickerQuickChat.read(reader);
			chatWidgetContent.classList.toggle('experimental-new-session-composer', useExperimentalLayout);
			this._newChatInput.placeRepositoryControls(
				useExperimentalLayout && (!isQuickChat || isWorkspacePickerQuickChat)
					? this._workspaceRepositoryControlsHost
					: undefined
			);
		}));
		this._register(this.instantiationService.createInstance(NewChatMigrationNotice, chatWidgetContent, this._session, () => this.focusInput()));

		// In the experimental composer the getting-started tip is demoted to a standalone
		// notice below the input (like the migration notice) so it never sits between the
		// option pickers and the field. Otherwise it uses the input's canonical notice slot
		// directly above the input. The tip container is reparented reactively so toggling the
		// experimental layout (which requires the unified workspace picker) moves the tip without
		// recreating the presenter.
		const inputTipSlot = this._newChatInput.gettingStartedTipContainerElement;
		// The below host carries the tip container class so the shared tip styling applies in the
		// demoted position exactly as it does in the input's own slot.
		const tipBelowHost = dom.append(chatWidgetContent, dom.$('.new-session-getting-started-tip-below.chat-getting-started-tip-container'));
		const chatTipContainer = dom.$('.new-session-getting-started-tip');
		this._register(autorun(reader => {
			(this._useExperimentalComposerLayout.read(reader) ? tipBelowHost : inputTipSlot)?.appendChild(chatTipContainer);
		}));
		this._chatTipPresenter.value = this.instantiationService.createInstance(
			ChatInputTipPresenter,
			{
				container: chatTipContainer,
				// Reset tip rotation the first time this composer becomes the only
				// foreground surface, so a returning user gets a fresh tip.
				onBeforeUpdate: () => {
					if (this.contextKeyService.getContextKeyValue<number>(ChatContextKeys.foregroundSessionCount.key) !== 0) {
						this._isChatTipSessionInitialized = false;
					} else if (!this._isChatTipSessionInitialized) {
						this._isChatTipSessionInitialized = true;
						this.chatTipService.resetSession();
					}
				},
				// No tip in the no-agent-host empty state: there is no usable composer.
				// Tips also stay away until the user has actually started a couple of
				// sessions, so a first-run composer is not busy.
				isEligible: () => !chatWidgetContent.classList.contains('no-agent-host')
					&& this._hasEnoughSessionsForFirstRunNotices()
					&& this.contextKeyService.getContextKeyValue<number>(ChatContextKeys.foregroundSessionCount.key) === 0,
				focusInput: () => this.focusInput(),
			},
			this._newChatInput.noticeHost,
		);

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
				const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
				if (session && provider && isAgentHostProvider(provider)) {
					provider.isSessionConfigResolving(session.sessionId).read(reader);
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

	private _getWelcomeName(gitHubName: string | undefined, configuredName = this.configurationService.getValue<string>(NEW_SESSION_WELCOME_NAME_SETTING).trim()): string | undefined {
		return configuredName.trim() || this._getFirstName(gitHubName);
	}

	private _getFirstName(name: string | undefined): string | undefined {
		return name?.trim().split(/\s+/u)[0] || undefined;
	}

	private async _refreshGitHubProfileName(): Promise<void> {
		if (!areNewSessionWelcomePhrasesEnabled(this.configurationService) || this.configurationService.getValue<string>(NEW_SESSION_WELCOME_NAME_SETTING).trim()) {
			this._githubProfileAccountKey = undefined;
			this._githubProfileName.set(undefined, undefined);
			return;
		}

		const account = this.defaultAccountService.currentDefaultAccount ?? await this.defaultAccountService.getDefaultAccount();
		if (!areNewSessionWelcomePhrasesEnabled(this.configurationService) || this.configurationService.getValue<string>(NEW_SESSION_WELCOME_NAME_SETTING).trim()) {
			this._githubProfileAccountKey = undefined;
			this._githubProfileName.set(undefined, undefined);
			return;
		}
		if (account?.authenticationProvider.id !== 'github' && account?.authenticationProvider.id !== 'github-enterprise') {
			this._githubProfileAccountKey = undefined;
			this._githubProfileName.set(undefined, undefined);
			return;
		}

		const accountKey = `${account.authenticationProvider.id}:${account.sessionId}`;
		if (this._githubProfileAccountKey !== accountKey) {
			this._githubProfileAccountKey = accountKey;
			this._githubProfileName.set(undefined, undefined);
		}

		let profileName = githubProfileNames.get(accountKey);
		if (!profileName) {
			profileName = this._fetchGitHubProfileName(account.authenticationProvider.id, account.authenticationProvider.enterprise, account.sessionId);
			githubProfileNames.set(accountKey, profileName);
		}
		const resolvedProfileName = await profileName;
		const currentAccount = this.defaultAccountService.currentDefaultAccount;
		if (
			this._githubProfileAccountKey === accountKey
			&& currentAccount?.authenticationProvider.id === account.authenticationProvider.id
			&& currentAccount.sessionId === account.sessionId
			&& areNewSessionWelcomePhrasesEnabled(this.configurationService)
			&& !this.configurationService.getValue<string>(NEW_SESSION_WELCOME_NAME_SETTING).trim()
		) {
			this._githubProfileName.set(resolvedProfileName, undefined);
		}
	}

	private async _fetchGitHubProfileName(providerId: string, enterprise: boolean, sessionId: string): Promise<string | undefined> {
		try {
			const enterpriseUri = enterprise ? this.defaultAccountService.resolveGitHubUrl('') : undefined;
			if (enterprise && !enterpriseUri) {
				this.logService.warn('Failed to fetch GitHub profile name because the enterprise URL is unavailable.');
				return undefined;
			}
			const sessions = await this.authenticationService.getSessions(providerId, [], { silent: true });
			const session = sessions.find(candidate => candidate.id === sessionId);
			if (!session) {
				return undefined;
			}
			const response = await this.requestService.request({
				type: 'GET',
				url: `${deriveGitHubEndpoints(enterpriseUri).apiBaseUri}/user`,
				disableCache: true,
				callSite: 'newChatWidget.fetchGitHubProfileName',
				headers: {
					'Authorization': `token ${session.accessToken}`,
					'Accept': 'application/vnd.github.v3+json',
					'User-Agent': 'VSCode-Sessions',
				},
			}, CancellationToken.None);
			if (!isSuccess(response)) {
				this.logService.warn(`Failed to fetch GitHub profile name: ${response.res.statusCode ?? 'unknown status'}`);
				return undefined;
			}
			const profile = await asJson<{ readonly name?: string | null }>(response);
			return profile?.name?.trim() || undefined;
		} catch (error) {
			this.logService.warn('Failed to fetch GitHub profile name:', error);
			return undefined;
		}
	}

	private _updateWelcomeMessage(container: HTMLElement, title: HTMLElement, visible: boolean, phrases: readonly string[], phraseIndex: number): string | undefined {
		container.hidden = !visible;
		if (!visible || phrases.length === 0) {
			title.textContent = '';
			return undefined;
		}

		const phrase = phrases[phraseIndex % phrases.length];
		title.textContent = phrase;
		return phrase;
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

	private _clearChatTip(): void {
		this._chatTipPresenter.value?.clear();
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
			return;
		}
		if (restoredFolderUri) {
			void this._createNewSession(restoredFolderUri);
		} else {
			void this._restoreNoWorkspaceDraft();
		}
	}

	private async _restoreNoWorkspaceDraft(): Promise<void> {
		const cancellation = new CancellationTokenSource();
		const lifetime = toDisposable(() => cancellation.dispose(true));
		this._noWorkspaceRestore.value = lifetime;
		try {
			await waitForState(this.sessionsService.initialRestoreComplete, complete => complete, undefined, cancellation.token);
			if (!this._workspacePicker.isNoWorkspaceSelected()
				&& !await this._workspacePicker.whenWorkspaceRestored(cancellation.token)) {
				return;
			}
			if (cancellation.token.isCancellationRequested || this.sessionsService.activeSession.get()
				|| this._newSessionCreation.value || this._workspacePicker.selectedFolderUri) {
				return;
			}
			if (this.sessionsManagementService.isQuickChatTargetAvailable()) {
				if (this._workspacePicker.isNoWorkspaceSelected()) {
					this.selectNoWorkspace();
				} else {
					// An automatic fallback must not persist a user choice or supersede a window-open workspace.
					this._createdSessionId = this.sessionsService.openQuickChat(undefined, true)?.sessionId;
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

		const folderUri = this._syncWorkspacePickerDevContainerMode(activeSession, true, WorkspaceSelectionOrigin.RestoredDraft);
		if (folderUri) {
			this._replaceDraftOnUnservableHarness(folderUri, activeSession);
		}

		return true;
	}

	private _syncWorkspacePickerDevContainerMode(activeSession: IActiveSession, persist: boolean, origin: WorkspaceSelectionOrigin): URI | undefined {
		const folderUri = activeSession.workspace.get()?.folders[0]?.root;
		if (!folderUri) {
			return undefined;
		}
		const provider = this.sessionsProvidersService.getProvider(activeSession.providerId);
		const preferDevContainer = !!provider && isAgentHostProvider(provider) && provider.isDevContainerEnabled?.(activeSession.sessionId) === true;
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
	private _replaceDraftOnUnservableHarness(folderUri: URI, draft: IActiveSession): void {
		if (draft.isCreated.get()) {
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
		return this.sessionsManagementService.getSessionTypesForFolder(folderUri).some(t =>
			(!creationProviderId || t.providerId === creationProviderId)
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
		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider) || !provider.preferDevContainer) {
			return;
		}
		provider.preferDevContainer(session.sessionId);
		this._preferredDevContainerFolderUri = undefined;
	}

	private async _createSessionNow(folderUri: URI, userPick: IPreferredSessionType | undefined, token: CancellationToken, providerId?: string): Promise<IOpenNewSessionResult> {
		// Prefer the user's explicit pick when its provider can serve the
		// folder; otherwise fall back to the preferred (first) session type.
		const preferredPick = userPick && this._isPreferredServable(folderUri, userPick)
			? userPick
			: this._newChatInput.sessionTypePicker.getPreferredSessionType(folderUri);
		const fallbackProviderId = providerId ?? this._workspacePicker.selectedResolved?.providerId;
		try {
			return await this.sessionsService.openNewSession({
				folderUri,
				preserveNavigation: true,
				...(preferredPick
					? { providerId: preferredPick.providerId, sessionTypeId: preferredPick.sessionTypeId }
					: fallbackProviderId
						? { providerId: fallbackProviderId }
						: undefined),
			}, token);
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
			if (active?.sessionId !== created.sessionId || active.isCreated.get()) {
				return; // the draft was sent or is no longer the active session
			}
			if (userPick) {
				if (!this._isPreferredServable(folderUri, userPick)) {
					return; // the preferred provider still cannot serve the folder
				}
				// Already running the pick: nothing left to upgrade to, so stop watching.
				if (userPick.sessionTypeId === active.sessionType
					&& (userPick.providerId === undefined || userPick.providerId === active.providerId)) {
					this._pendingPreferredUpgrade.clear();
					return;
				}
			} else {
				// No explicit pick: keep the draft on the preferred (first)
				// type. Recreate only when that preferred actually changed.
				const preferred = this._newChatInput.sessionTypePicker.getPreferredSessionType(folderUri);
				if (!preferred || (preferred.providerId === active.providerId && preferred.sessionTypeId === active.sessionType)) {
					return;
				}
			}
		}
		void this._createNewSession(folderUri, userPick);
	}

	/**
	 * Returns the workspace URI for the context picker based on the current workspace selection.
	 */
	private _getContextFolderUri(): URI | undefined {
		return this._isQuickChatComposer.get() ? undefined : this._workspacePicker.selectedFolderUri;
	}

	selectNoWorkspace(options?: ICreateNewSessionOptions, selectionOptions?: ISelectNoWorkspaceOptions): void {
		this._pendingPreferredUpgrade.clear();
		this._newSessionCreation.clear();
		this._workspacePicker.selectNoWorkspace(selectionOptions?.userSelection !== false);
		this._openQuickChat(options, selectionOptions?.preserveNavigation);
	}

	private _openQuickChat(options?: ICreateNewSessionOptions, preserveNavigation?: boolean): IActiveSession | undefined {
		return this.sessionsService.openQuickChat(options, preserveNavigation);
	}

	private _getNoWorkspaceOption(): IWorkspacePickerNoWorkspaceOption | undefined {
		const isWorkspacePickerQuickChat = this._isWorkspacePickerQuickChat.get();
		if (isWeb
			|| !this._useConsolidatedRemoteWorkspaces.get()) {
			return undefined;
		}
		const providers = this.sessionsProvidersService.getProviders()
			.filter(provider => isAgentHostProvider(provider)
				&& !provider.hostGroup
				&& provider.supportsQuickChats);
		if (!isWorkspacePickerQuickChat
			&& !this.sessionsManagementService.isQuickChatTargetAvailable()
			&& providers.length === 0) {
			return undefined;
		}
		const activeProviderId = isWorkspacePickerQuickChat ? this._session.get()?.providerId : undefined;
		const activeProvider = activeProviderId ? providers.find(provider => provider.id === activeProviderId) : undefined;
		const submenuActions = providers.length > 1
			? providers.map(provider => {
				const label = provider.id === LOCAL_AGENT_HOST_PROVIDER_ID
					? localize('newSessionWorkspacePicker.localQuickChat', "Local")
					: provider.label;
				const action = toAction({
					id: `newSessionWorkspacePicker.quickChat.${provider.id}`,
					label,
					checked: provider.id === activeProviderId,
					run: () => {
						if (provider.id !== activeProviderId) {
							this.selectNoWorkspace({ providerId: provider.id });
						}
					},
				});
				return Object.assign(action, { icon: provider.icon });
			})
			: undefined;
		return {
			description: localize('newSessionWorkspacePicker.noWorkspaceDescription', "Start without a backing workspace"),
			isSelected: isWorkspacePickerQuickChat,
			selectedLabel: activeProvider && activeProvider.id !== LOCAL_AGENT_HOST_PROVIDER_ID
				? localize('newSessionWorkspacePicker.remoteQuickChat', "Chat [{0}]", activeProvider.label)
				: undefined,
			select: () => {
				if (!isWorkspacePickerQuickChat) {
					this.selectNoWorkspace(providers.length === 1 ? { providerId: providers[0].id } : undefined);
				}
			},
			submenuActions,
		};
	}

	private _renderWorkspacePicker(container: HTMLElement): IDisposable {
		const store = new DisposableStore();
		const selectsRepository = isWeb && !!this.agentHostFilterService.selectedHost?.sessionCreationProviderId;
		const workspaceTrigger: IWorkspacePickerTrigger = {
			label: selectsRepository ? localize('newSessionWorkspacePicker.repository', "Select Repository") : localize('newSessionWorkspacePicker.workspace', "Workspace"),
			ariaLabel: selectsRepository ? localize('newSessionWorkspacePicker.repositoryAriaLabel', "Choose a repository for the new session") : localize('newSessionWorkspacePicker.workspaceAriaLabel', "Choose a workspace for the new session"),
			tooltip: localize('newSessionWorkspacePicker.workspaceTooltip', "Choose where the new session runs"),
			focusCommand: {
				id: FOCUS_NEW_SESSION_WORKSPACE_PICKER_COMMAND_ID,
				when: FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN,
				enabled: this._useConsolidatedRemoteWorkspaces,
			},
			icon: selectsRepository ? Codicon.repo : Codicon.project,
			reflectsWorkspace: true,
			attachesContext: false,
		};
		const row = this._workspacePicker.renderCategoryTriggers(container, [
			workspaceTrigger,
		]);
		const sessionOptions = dom.append(row, dom.$('.new-chat-session-options-details'));
		sessionOptions.id = `new-chat-session-options-${++sessionOptionsIdPool}`;
		const repositoryControlsHost = dom.append(sessionOptions, dom.$('.new-chat-repository-controls-host'));
		this._workspacePickerRow = row;
		this._workspaceRepositoryControlsHost = repositoryControlsHost;
		this._workspaceSessionOptionsHost = sessionOptions;
		this._renderSessionTypePicker(sessionOptions, false);
		this._newChatInput.placeRepositoryControls(repositoryControlsHost);
		const toggle = store.add(new Button(row, {
			...defaultButtonStyles,
			buttonBackground: undefined,
			buttonHoverBackground: undefined,
			buttonForeground: undefined,
			buttonBorder: undefined,
		}));
		toggle.element.classList.add('new-chat-session-options-toggle');
		toggle.element.setAttribute('aria-controls', sessionOptions.id);
		store.add(toggle.onDidClick(() => this._setSessionOptionsExpandedFromUser(!this._sessionOptionsExpanded.get())));
		store.add(dom.addDisposableListener(row, dom.EventType.KEY_DOWN, event => {
			if (!this._useExperimentalComposerLayout.get() || event.altKey || event.ctrlKey || event.metaKey || !['Tab', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
				return;
			}
			const controls: HTMLElement[] = [];
			const walker = row.ownerDocument.createTreeWalker(row, NodeFilter.SHOW_ELEMENT);
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				if (dom.isHTMLElement(node) && node.role === 'button'
					&& node.getAttribute('aria-disabled') !== 'true'
					&& !node.closest('[hidden], [inert], .disabled, .loading, .resolving')
					&& node.checkVisibility()) {
					controls.push(node);
				}
			}
			const activeElement = dom.getActiveElement();
			const index = controls.findIndex(control => control === activeElement);
			if (index < 0) {
				return;
			}
			const previous = event.key === 'ArrowLeft' || (event.key === 'Tab' && event.shiftKey);
			const nextIndex = index + (previous ? -1 : 1);
			if (event.key === 'Tab' && (nextIndex < 0 || nextIndex >= controls.length)) {
				return;
			}
			dom.EventHelper.stop(event, true);
			controls[(nextIndex + controls.length) % controls.length].focus();
		}, true));
		const responsiveLayout = store.add(new ChatInputPickerResponsiveLayout('NewChatWidget.sessionOptions', container, {
			usePreferredWidth: true,
			getItems: () => getLabeledPickerResponsiveItems(row).map(item =>
				item.element && sessionOptions.contains(item.element) ? item : {
					...item,
					// Include the workspace's full label in the width budget, but never compact it.
					setCompact: () => { },
				}),
		}));
		store.add(autorun(reader => {
			const useExperimentalLayout = this._useExperimentalComposerLayout.read(reader);
			const screenReaderOptimized = this._screenReaderOptimized.read(reader);
			// Screen reader users should never have the options collapsed out of the accessibility
			// tree: keep the tray expanded and drop the disclosure toggle entirely.
			const disclosureAvailable = useExperimentalLayout && !screenReaderOptimized;
			const expanded = this._sessionOptionsExpanded.read(reader);
			// The icons-vs-hidden setting only changes what a collapsed tray shows, so log the
			// experiment trigger when the composer actually reaches that collapsed state — before
			// reading the setting, so both arms count and users who never collapse don't dilute it.
			const collapsed = disclosureAvailable && !expanded;
			if (collapsed) {
				logSettingExperimentTrigger(this.telemetryService, COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING);
			}
			// When collapsed, keep the repository and harness pickers as an always-available icon
			// rail (labels hidden) unless the user has opted to hide them entirely.
			const iconRail = collapsed && this._collapsedSessionOptionsShowIcons.read(reader);
			const showDetails = !disclosureAvailable || expanded || iconRail;
			row.classList.toggle('new-chat-session-options', useExperimentalLayout);
			sessionOptions.classList.toggle('legacy-session-options-details', !useExperimentalLayout);
			sessionOptions.classList.toggle('collapsed-icon-rail', iconRail);
			toggle.element.hidden = !disclosureAvailable;
			if (!showDetails && sessionOptions.contains(dom.getActiveElement())) {
				toggle.focus();
			}
			sessionOptions.inert = !showDetails;
			sessionOptions.hidden = !showDetails;
			toggle.icon = expanded ? Codicon.chevronLeftCompact : Codicon.chevronRightCompact;
			toggle.element.setAttribute('aria-expanded', String(expanded));
			const label = expanded
				? localize('newSessionOptions.collapse', "Hide Session Options")
				: localize('newSessionOptions.expand', "Show Session Options");
			toggle.setAriaLabel(label);
			toggle.setTitle(label);
			// Re-measure so labels compact or restore for the new expanded/rail state.
			responsiveLayout.layout();
		}));
		responsiveLayout.layout();
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

	private _getComparisonBranch(session = this._session.get()): string | undefined {
		const selectedFolderUri = this._workspacePicker.selectedFolderUri;
		const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
		const matchesSelectedFolder = !selectedFolderUri || !!session?.workspace.get()?.folders.some(folder => isEqual(folder.root, selectedFolderUri));
		if (session && provider && isAgentHostProvider(provider) && matchesSelectedFolder) {
			const branch = provider.getCreateSessionConfig(session.sessionId)?.[SessionConfigKey.Branch];
			if (typeof branch === 'string' && branch.trim()) {
				return branch;
			}
		}
		const selectedWorkspaceRepository = getComparisonSelectedWorkspaceFolder(this._workspacePicker.selectedResolved?.workspace, selectedFolderUri)?.gitRepository;
		const selectedWorkspaceBranch = selectedWorkspaceRepository?.branchName?.trim() || selectedWorkspaceRepository?.baseBranchName?.trim();
		if (selectedWorkspaceBranch) {
			return selectedWorkspaceBranch;
		}
		const sessionRepository = getComparisonSessionFolder(session, selectedFolderUri)?.gitRepository;
		const workspaceBranch = sessionRepository?.branchName?.trim() || sessionRepository?.baseBranchName?.trim();
		if (workspaceBranch) {
			return workspaceBranch;
		}
		return undefined;
	}

	private _shouldShowComparisonAction(): boolean {
		const session = this._session.get();
		const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
		const selectedFolderUri = this._workspacePicker.selectedFolderUri;
		const providerIsAgentHost = !!provider && isAgentHostProvider(provider);
		const resolvingConfig = session && providerIsAgentHost ? provider.isSessionConfigResolving(session.sessionId).get() : false;
		const sessionMatchesSelectedFolder = !!selectedFolderUri && !!session?.workspace.get()?.folders.some(folder => isEqual(folder.root, selectedFolderUri));
		if (!sessionMatchesSelectedFolder) {
			return false;
		}
		const hasGitRemote = getComparisonHasGitRemote(session, this._workspacePicker.selectedResolved?.workspace, selectedFolderUri);
		if (hasGitRemote !== true) {
			return false;
		}
		return this._compareAgentsEnabled.get()
			&& selectedFolderUri !== undefined
			&& !!session
			&& hasGitRemote
			&& providerIsAgentHost
			&& this.sessionsManagementService.getSessionTypesForFolder(selectedFolderUri).some(type =>
				type.providerId === session.providerId && type.sessionType.id === session.sessionType && type.sessionType.supportsWorktreeConfiguration)
			&& !resolvingConfig
			&& this._getComparisonBranch(session) !== undefined;
	}

	private _renderSessionTypePicker(container: HTMLElement, prependBeforeSiblings: boolean): void {
		this._newChatInput.sessionTypePicker.render(container, {
			className: 'sessions-chat-session-type-picker sessions-workspace-category-picker-slot',
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

	focusHarnessPicker(): void {
		this._sessionOptionsExpanded.set(true, undefined);
		this._newChatInput.sessionTypePicker.showPicker();
	}

	/** Restores an explicit user choice, or uses the experiment-controlled initial state. */
	private _restoreSessionOptionsExpanded(): void {
		const storedExpanded = this.storageService.getBoolean(SESSION_OPTIONS_EXPANDED_STORAGE_KEY, StorageScope.PROFILE);
		let initialExpanded = storedExpanded ?? true;
		const hasCreatedSession = this._usage.createdSessionCount > 0;
		if (storedExpanded === undefined && !hasCreatedSession && isExperimentalSessionComposerLayoutEnabled(this.configurationService)) {
			logSettingExperimentTrigger(this.telemetryService, NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING);
			initialExpanded = this.configurationService.getValue<boolean>(NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING) ?? true;
		}
		this._sessionOptionsExpanded.set(initialExpanded, undefined);
	}

	private _setSessionOptionsExpandedFromUser(expanded: boolean): void {
		this._sessionOptionsExpanded.set(expanded, undefined);
		this.storageService.store(SESSION_OPTIONS_EXPANDED_STORAGE_KEY, expanded, StorageScope.PROFILE, StorageTarget.USER);
	}

	private _renderEmptyState(container: HTMLElement): IDisposable {
		this._newChatInput.pickerVisibility.setVisible('workspace', false);
		const emptyState = this.instantiationService.createInstance(NoAgentHostEmptyState);
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
			this._renderChatTip();
		};

		const showEmptyState = () => {
			chatWidgetContent.classList.add('no-agent-host');
			dom.clearNode(pickerSlot);
			stateDisposables.value = this._renderEmptyState(pickerSlot);
			this._clearChatTip();
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
			filter.rediscover();
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

	private async _sendComparison(session: IActiveSession, request: string, requestContext: ReadonlyMap<string, IChatRequestVariableEntry>): Promise<boolean> {
		try {
			if (!this._comparisonSelection.available.get()) {
				throw new Error(localize('comparisonPicker.unavailable', "Comparison is no longer available for this draft. Check its workspace and agent configuration."));
			}
			if (!this._comparisonSelection.configured.get()) {
				throw new Error(localize('comparisonPicker.finishSetup', "Finish configuring the comparison in the model picker."));
			}
			const workspace = this._workspacePicker.selectedFolderUri;
			if (!workspace) {
				throw new Error(localize('comparisonPicker.workspaceRequired', "Select a workspace for the comparison."));
			}
			const branch = this._getComparisonBranch(session);
			const workspaceError = getSessionComparisonWorkspaceError(branch, getComparisonHasGitRemote(session, this._workspacePicker.selectedResolved?.workspace, workspace));
			if (workspaceError) {
				throw new Error(workspaceError);
			}
			const provider = this.sessionsProvidersService.getProvider(session.providerId);
			const type = this.sessionsManagementService.getSessionTypesForFolder(workspace).find(type =>
				type.providerId === session.providerId && type.sessionType.id === session.sessionType && type.sessionType.supportsWorktreeConfiguration);
			if (!provider || !type) {
				throw new Error(localize('comparisonPicker.worktreesRequired', "The selected agent no longer supports worktree comparisons."));
			}
			const permission = provider.getPermissionOptionForSession?.(session.sessionId);
			if (!permission || permission.locked) {
				throw new Error(localize('comparisonPicker.permissionsUnavailable', "The current permissions are unavailable for comparison. Update the draft permissions and try again."));
			}
			const resolveHarness = (modelId: string): ISessionComparisonHarness => {
				const resolution = provider.getModelsSnapshotForCreation?.(workspace, session.sessionType, modelId).desiredModelResolution;
				if (resolution?.kind !== 'available') {
					throw new Error(localize('comparisonPicker.modelUnavailable', "A selected comparison model is no longer available. Update the model picker selection."));
				}
				const modelConfiguration: Record<string, string | number | boolean | null> = {};
				for (const [key, value] of Object.entries(provider.getAutomationModelConfiguration?.(session.sessionId)?.getModelConfiguration(resolution.model.identifier) ?? {})) {
					if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) {
						modelConfiguration[key] = value;
					}
				}
				return {
					providerId: session.providerId,
					sessionTypeId: session.sessionType,
					label: type.sessionType.label,
					modelId: resolution.model.identifier,
					modelLabel: resolution.model.metadata.name,
					modelConfiguration: Object.keys(modelConfiguration).length ? modelConfiguration : undefined,
					permissionId: permission?.id,
					permissionLabel: permission?.label,
					modeId: permission.comparisonModeId,
				};
			};
			const judgeModelId = this._comparisonSelection.judgeModelId.get();
			const synthesisModelId = this._comparisonSelection.synthesizerModelId.get();
			const comparison = await this.sessionComparisonService.startComparison({
				workspace,
				prompt: request,
				attachedContext: requestContext.size ? [...requestContext.values()] : undefined,
				attempts: this._comparisonSelection.attemptModelIds.get().map(modelId => ({ id: generateUuid(), harness: resolveHarness(modelId) })),
				judgeHarness: judgeModelId ? resolveHarness(judgeModelId) : undefined,
				synthesisHarness: synthesisModelId ? resolveHarness(synthesisModelId) : undefined,
				branch,
			});
			this._comparisonSelection.reset();
			try {
				if (this.configurationService.getValue<boolean>(COMPARE_AGENTS_OPEN_IN_GRID_SETTING)) {
					// An empty composer would create a new draft and cancel the grid navigation.
					await this.commandService.executeCommand(OPEN_SESSION_COMPARISON_COMMAND_ID, comparison.id);
				}
				this.sessionsManagementService.discardNewSession(session);
			} catch (error) {
				this.logService.error('Failed to open session comparison:', error);
				this.notificationService.error(error);
			}
			return true;
		} catch (error) {
			this.logService.error('Failed to start session comparison:', error);
			this.notificationService.error(error);
			return false;
		}
	}

	private async _send(query: string, attachedContext?: IChatRequestVariableEntry[], background?: boolean, userInteraction?: NewChatUserInteraction): Promise<boolean> {
		const session = this._session.get();
		if (!session) {
			this._workspacePicker.showPicker();
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
			return this._sendComparison(session, request, requestContext);
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
			this._pendingBackgroundSends.set(sendOptions, Event.once(
				Event.filter(this.sessionsManagementService.onDidSendRequest, event => event.options === sendOptions)
			)(() => {
				clearFeedback();
				restoreWorkspace();
				this._pendingBackgroundSends.deleteAndDispose(sendOptions);
			}));
		}

		try {
			userInteraction?.handoff(session, session.activeChat.get());
			this.newSessionComposerService.notifyWillSendRequest(sendOptions, wasQuickChat ? undefined : this._workspacePicker.selectionSnapshot);
			await this.sessionsManagementService.sendNewChatRequest(session, sendOptions);
		} catch (e) {
			userInteraction?.cancel(isCancellationError(e) || e instanceof WorkspaceNotTrustedError ? 'cancelled' : 'error');
			this._pendingBackgroundSends.deleteAndDispose(sendOptions);
			if (!isCancellationError(e) && !(e instanceof WorkspaceNotTrustedError)) {
				this.logService.error('Failed to send request:', e);
				this.notificationService.error(localize('newSession.sendFailed', "Failed to start session: {0}", toErrorMessage(e)));
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
			if (wasQuickChat) {
				this._openQuickChat();
			} else if (reseedFolderUri) {
				await this._createNewSession(reseedFolderUri);
			}
		}
		return true;
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

	private _isCurrentWorkspaceSelection(folderUri: URI | undefined): boolean {
		const session = this._session.get();
		if (!folderUri || !session || session.isCreated.get() || this._pendingWorkspaceCreation
			|| !this.uriIdentityService.extUri.isEqual(session.workspace.get()?.folders[0]?.root, folderUri)
			|| this._workspacePicker.selectedResolved?.providerId !== session.providerId) {
			return false;
		}
		const provider = this.sessionsProvidersService.getProvider(session.providerId);
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
		// Cancel any in-flight upgrade for a previous selection.
		this._pendingPreferredUpgrade.clear();
		if (!folderUri || !this._preferredDevContainerFolderUri || !this.uriIdentityService.extUri.isEqual(this._preferredDevContainerFolderUri, folderUri)) {
			this._preferredDevContainerFolderUri = undefined;
		}
		const currentFolderUri = this._session.get()?.workspace.get()?.folders[0]?.root;
		if (!folderUri || !currentFolderUri || !this.uriIdentityService.extUri.isEqual(currentFolderUri, folderUri)) {
			this._comparisonSelection.reset();
		}
		const refreshingPromptOptions = !!currentFolderUri
			&& (!folderUri || !this.uriIdentityService.extUri.isEqual(currentFolderUri, folderUri))
			&& this._newChatInput.preparePromptOptionsRefresh();

		if (!folderUri) {
			this._newSessionCreation.clear();
			this.sessionsService.unsetNewSession();
			void this._restoreNoWorkspaceDraft();
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
	}

	sendQuery(text: string): void {
		this._newChatInput.sendQuery(text);
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

	selectWorkspace(folderUri: URI, options?: ISelectWorkspaceOptions): WorkspaceSelectionResult {
		if (options?.isDefault) {
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
		}
		this._preferredDevContainerFolderUri = options?.preferDevContainer ? folderUri : undefined;
		this._workspacePicker.setSelectedWorkspace(folderUri, { providerId: options?.providerId, preferDevContainer: options?.preferDevContainer, origin: options?.selectionOrigin });
		const selection = this._workspacePicker.selectionSnapshot;
		return selection.state === 'selected' && this.uriIdentityService.extUri.isEqual(selection.folderUri, folderUri) ? 'applied' : 'notReady';
	}
}

// #endregion
