/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import * as touch from '../../../../base/browser/touch.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { IAction, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { disposableTimeout, Limiter, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { autorun, IObservable, IReader, observableValue, waitForState } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem, IActionListOptions } from '../../../../platform/actionWidget/browser/actionList.js';
import { ITabDescriptor, TabbedActionListWidget } from '../../../../platform/actionWidget/browser/tabbedActionListWidget.js';
import { IMenuService, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { DevContainerSample, devContainerSamples, devContainerSampleUri, findDevContainerSample, getDevContainerSampleUrl } from '../../../../platform/agentHost/common/devContainerSamples.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpression, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IGitHubInfo, isActiveSessionStatus, ISessionWorkspace, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE } from '../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IAgentHostFilterService } from '../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsRecentWorkspacesService, isWorktreeWorkspaceUri } from '../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { IAgentHostSessionsProvider, isAgentHostEnvironmentAvailable, isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { SessionWorkspacePickerGroupContext } from '../../../common/contextkeys.js';
// eslint-disable-next-line local/code-import-patterns -- TODO: move remote host options out of providers
import { getStatusHover, getStatusLabel, removeRemoteHost, showRemoteHostOptions } from '../../providers/remoteAgentHost/browser/remoteHostOptions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles, defaultCountBadgeStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { areDevContainerSamplesEnabled, DevContainerAgentHostEnabledSettingId, DevContainerSamplesEnabledSettingId } from '../../../common/devContainerAgentHostService.js';
import { reportNewChatPickerClosed } from './newChatPickerTelemetry.js';
import { Menus } from '../../../browser/menus.js';
import { markOnboardingTarget } from '../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { NewSessionWorkspacePreselectionSource } from './newSessionComposerService.js';
import { IWorkspaceSelectionSnapshot, WorkspaceSelectionOrigin, WorkspaceSessionFallbackState } from '../../../common/workspaceSelection.js';
import { type IResolvedFolderWorkspace, SessionWorkspaceFallback } from './sessionWorkspaceFallback.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ADDITIONAL_FOLDER_CONTEXT_ID_PREFIX, ADDITIONAL_REPOSITORY_CONTEXT_ID_PREFIX, getAdditionalFolderContextId, getAdditionalRepositoryContextId } from '../common/newChatContextIds.js';
import { EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, UNIFIED_WORKSPACE_PICKER_SETTING } from '../common/constants.js';
import { registerPickerKeybindingPresentation } from './newChatPickerKeybinding.js';
import { createSessionPickerToolbar } from './sessionPickerToolbar.js';
import { getEnvironmentWorkspaceProvider, ISessionCreationEnvironment, resolveEnvironmentWorkspace } from './sessionEnvironmentPicker.js';

export type { IResolvedFolderWorkspace } from './sessionWorkspaceFallback.js';

type DevContainerSampleSelectedEvent = {
	sampleId: DevContainerSample['id'];
};

type DevContainerSampleSelectedClassification = {
	owner: 'chrmarti';
	comment: 'Records accepted user selections of Dev Container samples in the Agents workspace picker, not container provisioning or session creation.';
	sampleId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The selected built-in sample catalog identifier: go, dotnet, node, php, python, or rust. Does not contain a workspace path or repository URL.' };
};

const FILTER_THRESHOLD = 10;

/** How workspace picker rows are laid out: the folder name, then its location as a description that truncates first. */
export const WORKSPACE_PICKER_LIST_OPTIONS = {
	className: 'sessions-new-chat-picker-list',
	useFullHeight: true,
	reserveSubmenuSpace: false,
	inlineDescription: true,
	showGroupTitleOnFirstItem: true,
	hideDefaultKeybindingTooltip: true,
} as const satisfies IActionListOptions;

/**
 * Fixed picker width when the categorical tab bar is shown. Keeps the tab
 * row and the list aligned and prevents horizontal jitter when switching
 * tabs.
 */
const TABBED_PICKER_WIDTH = 360;

/**
 * Grace period for a restored remote workspace's provider to reach Connected
 * before we fall back to no selection. SSH tunnels typically connect within
 * a couple seconds; if it hasn't connected by then, we'd rather show no
 * selection than leave the user staring at an unreachable workspace.
 */
const RESTORE_CONNECT_GRACE_MS = 5000;
const MAX_NEW_PICKER_RECENT_WORKSPACES = 10;
/**
 * A touch tap fires a Gesture Tap and, shortly after, a browser "ghost" click at the same position.
 * The picker may render under that position before the click arrives, so the click can be retargeted
 * to a picker item rather than the trigger.
 */
const GHOST_CLICK_GUARD_MS = 500;
const GHOST_CLICK_GUARD_DISTANCE = 30;

/**
 * Item type used in the action list.
 */
export interface IWorkspacePickerItem {
	readonly id?: string;
	readonly folderUri?: URI;
	readonly ariaLabel?: string;
	/** The resolved workspace (used for unavailable-provider checks). */
	readonly providerId?: string;
	readonly browseActionIndex?: number;
	readonly browseAction?: ISessionWorkspaceBrowseAction;
	readonly attachAsContext?: boolean;
	readonly checked?: boolean;
	/** Whether selecting this folder should use its Dev Container. */
	preferDevContainer?: boolean;
	/** Command to execute when this item is selected. */
	readonly commandId?: string;
	/** Inline action to run when this item is selected. */
	readonly run?: () => void;
}

export interface IWorkspacePickerOptions {
	readonly environment?: IObservable<ISessionCreationEnvironment | undefined>;
	readonly environmentPickerEnabled?: IObservable<boolean>;
	readonly onUserSelection?: () => void;
	readonly whenSelectionAccepted?: () => Promise<boolean>;
	readonly canSelectWorkspace?: (folderUri: URI, providerId: string | undefined) => Promise<boolean>;
	readonly canRestoreWorkspace?: () => boolean;
	readonly restoreFromSessions?: boolean;
	readonly sessionWorkspaceProviderFilter?: (providerId: string) => boolean;
	readonly getWorkspaceGroupAction?: (group: string | undefined) => IWorkspacePickerGroupAction | undefined;
	readonly getNoWorkspaceOption?: () => IWorkspacePickerNoWorkspaceOption | undefined;
}

export interface IWorkspacePickerGroupAction {
	readonly label: string;
	readonly description?: string;
	readonly icon: ThemeIcon;
	readonly commandId: string;
	readonly hideWorkspaceItems?: boolean;
}

export interface IWorkspacePickerNoWorkspaceOption {
	readonly description: string;
	readonly isSelected: boolean;
	readonly selectedLabel?: string;
	readonly select: () => void;
	readonly submenuActions?: readonly IAction[];
}

export interface IWorkspacePickerTrigger {
	readonly label?: string;
	readonly ariaLabel: string;
	readonly tooltip?: string | (() => string);
	readonly focusCommand?: { readonly id: string; readonly when: ContextKeyExpression; readonly enabled: IObservable<boolean> };
	readonly icon?: ThemeIcon;
	readonly contextViewLayer?: number;
	readonly hideNoWorkspaceOption?: boolean;
	readonly hideIconWhenAttached?: boolean;
	readonly reflectsWorkspace?: boolean;
	readonly clearable?: IObservable<boolean>;
	readonly group?: string;
	readonly attachesContext?: boolean;
	readonly hideWhenWorkspaceSelected?: boolean;
	readonly hideWhenNoWorkspaceSelected?: boolean;
	readonly hideWhenNoGitHubRepository?: boolean;
}

export interface IResolvedBrowseSelection {
	readonly workspace: ISessionWorkspace;
	readonly providerId: string;
}

interface IBrowsedWorkspaceSelection extends IResolvedBrowseSelection {
	readonly action: ISessionWorkspaceBrowseAction;
}

interface IAttachedRepositorySelection extends IResolvedBrowseSelection {
	readonly attachmentId: string;
}

interface IRestoredWorkspaceSelection {
	readonly resolved: IResolvedFolderWorkspace;
	readonly source: NewSessionWorkspacePreselectionSource;
	readonly origin: WorkspaceSelectionOrigin;
}

interface IWorkspacePickerTriggerElements {
	readonly slot: HTMLElement;
	icon?: HTMLElement;
	label?: HTMLElement;
	badge?: CountBadge;
	chevron?: HTMLElement;
	clearButton?: Button;
}

type IWorkspacePickerAction = IAction & { ariaLabel?: string; icon?: ThemeIcon; hoverContent?: string; onRemove?: () => void };

function getWorkspacePickerItemAriaLabel(item: IActionListItem<IWorkspacePickerItem>): string {
	return item.item?.ariaLabel ?? item.label ?? '';
}

function getRemoteHostStatusDescription(provider: IAgentHostSessionsProvider, status: RemoteAgentHostConnectionStatus): string {
	if (provider.hostDescription) {
		const availability = provider.hostDescription.get();
		if (status.kind === 'disconnected') {
			return availability;
		}
		const connection = status.kind === 'connected' ? localize('workspacePicker.statusConnected', "Connected") : getStatusLabel(status);
		return localize('workspacePicker.hostDescription', "{0} · {1}", availability, connection);
	}
	const statusLabel = getStatusLabel(status);
	const activeSessionCount = provider.getSessions()
		.filter(session => !session.isArchived.get() && isActiveSessionStatus(session.status.get()))
		.length;
	if (activeSessionCount === 0) {
		return statusLabel;
	}

	return activeSessionCount === 1
		? localize('workspacePicker.statusWithActiveSession', "{0} · {1} active session", statusLabel, activeSessionCount)
		: localize('workspacePicker.statusWithActiveSessions', "{0} · {1} active sessions", statusLabel, activeSessionCount);
}

/**
 * A unified workspace picker that shows workspaces from all registered session
 * providers in a single dropdown.
 *
 * Browse actions from providers are appended at the bottom of the list.
 */
export class WorkspacePicker extends Disposable {

	protected readonly _onDidSelectWorkspace = this._register(new Emitter<URI | undefined>());
	readonly onDidSelectWorkspace: Event<URI | undefined> = this._onDidSelectWorkspace.event;
	private readonly _onDidSelectWorkspaceMode = this._register(new Emitter<{ readonly folderUri: URI; readonly preferDevContainer: boolean }>());
	readonly onDidSelectWorkspaceMode = this._onDidSelectWorkspaceMode.event;
	protected readonly _onDidChangeSelection = this._register(new Emitter<void>());
	readonly onDidChangeSelection: Event<void> = this._onDidChangeSelection.event;
	private readonly _onDidChangeChatPetPlatform = this._register(new Emitter<void>());
	readonly onDidChangeChatPetPlatform = Event.any(this.onDidChangeSelection, this._onDidChangeChatPetPlatform.event);
	private readonly _onDidSelectContext = this._register(new Emitter<ISessionWorkspace>());
	readonly onDidSelectContext: Event<ISessionWorkspace> = this._onDidSelectContext.event;
	private readonly _onDidSelectFolderContext = this._register(new Emitter<URI>());
	readonly onDidSelectFolderContext: Event<URI> = this._onDidSelectFolderContext.event;
	private readonly _onDidSelectRepositoryContext = this._register(new Emitter<IResolvedBrowseSelection>());
	readonly onDidSelectRepositoryContext: Event<IResolvedBrowseSelection> = this._onDidSelectRepositoryContext.event;
	private readonly _onDidRemoveAttachedContext = this._register(new Emitter<string>());
	readonly onDidRemoveAttachedContext: Event<string> = this._onDidRemoveAttachedContext.event;

	private _selectedFolderUri: URI | undefined;
	private _selectedResolved: IResolvedFolderWorkspace | undefined;
	private _selectedDevContainerFolderUri: URI | undefined;
	private _preselectionSource = NewSessionWorkspacePreselectionSource.None;
	private _selectionOrigin = WorkspaceSelectionOrigin.None;
	private _selectionGeneration = 0;
	private _sessionRestoreGeneration = 0;
	private readonly _sessionRestoreState = observableValue<{ readonly generation: number; readonly selectionGeneration: number; readonly state: WorkspaceSessionFallbackState } | undefined>(this, undefined);
	private readonly _sessionWorkspaceFallback: SessionWorkspaceFallback | undefined;

	/**
	 * Set to `true` once the user has explicitly picked or cleared a workspace.
	 * Until then, late-arriving provider registrations are allowed to upgrade
	 * the current (auto-restored) selection to the user's stored "checked"
	 * entry. After the user has acted, providers coming and going never move
	 * the selection out from under them.
	 */
	private _userHasPicked = false;

	/**
	 * Watches the connection status of a restored remote workspace. Cleared when
	 * the user explicitly picks, when the connection succeeds, or when it fails
	 * and we fall back.
	 */
	private readonly _connectionStatusWatch = this._register(new MutableDisposable());
	private readonly _gitHubInfoWatch = this._register(new MutableDisposable());
	private readonly _providerSessionTypesWatch = this._register(new MutableDisposable());
	private readonly _localBrowseAction: ISessionWorkspaceBrowseAction = {
		label: localize('workspacePicker.browseSelectLocal', "Select..."),
		group: SESSION_WORKSPACE_GROUP_LOCAL,
		icon: Codicon.folderOpened,
		providerId: '',
		run: async () => (await this._browseForLocalFolder())?.workspace,
	};
	/**
	 * "Primary" trigger. This is the most recently created entry. Preserved for subclass
	 * read access (e.g. {@link WebWorkspacePicker} anchors its mobile sheet here) and for
	 * {@link showPicker} calls that do not supply an anchor.
	 */
	protected _triggerElement: HTMLElement | undefined;
	/** All live trigger elements. Label updates fan out to every entry. */
	private readonly _triggerElements = new Set<HTMLElement>();
	private readonly _triggerOptions = new Map<HTMLElement, IWorkspacePickerTrigger>();
	private readonly _triggerContents = new Map<HTMLElement, IWorkspacePickerTriggerElements>();
	private readonly _contextSelections = new Map<string, ISessionWorkspace[]>();
	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _additionalRepositorySelections = new Map<string, IAttachedRepositorySelection>();
	private readonly _additionalFolderSelections = new Map<string, IResolvedFolderWorkspace>();
	private readonly _devContainerAvailability = new Map<string, boolean | 'error' | Promise<boolean | 'error'>>();
	private readonly _onDidChangeDevContainerAvailability = this._register(new Emitter<void>());
	readonly onDidChangeDevContainerAvailability = this._onDidChangeDevContainerAvailability.event;
	private readonly _devContainerAvailabilityLimiter = this._register(new Limiter<boolean>(4));
	private readonly _devContainerAvailabilityRefresh = this._register(new RunOnceScheduler(() => {
		const activeTrigger = this._activeTriggerElement;
		if (!activeTrigger || (!this.actionWidgetService.isVisible && !this._tabbedWidget.isVisible)) {
			return;
		}
		if (this._showTabs()) {
			this.showPicker(true, activeTrigger, this._directPickerGroup, this._directPickerAttachesContext);
		} else if (this._tabbedWidget.isVisible) {
			this._tabbedWidget.refreshActiveList();
		} else {
			this.actionWidgetService.updateItems(this._buildItems(), undefined, { preserveHover: true, preserveScrollPosition: true });
		}
	}, 50));
	private _attachedContext: readonly IChatRequestVariableEntry[] = [];
	private readonly _tabbedWidget: TabbedActionListWidget;
	private readonly _pickerGroupContext: IContextKey<string>;
	private _activeTriggerElement: HTMLElement | undefined;
	protected _directPickerGroup: string | undefined;
	protected _directPickerAttachesContext: boolean | undefined;

	/**
	 * Currently active workspace tab (a group label contributed by a
	 * provider, e.g. `"This Computer"` / `"Cloud"` / `"Remote"`).
	 */
	private _activeTab: string | undefined;

	/**
	 * Whether the user explicitly clicked a tab while the picker was open.
	 * Reset on each fresh open so the picker re-defaults to the selected
	 * workspace's group between opens.
	 */
	private _userPickedTab = false;

	get selectedFolderUri(): URI | undefined {
		return this._selectedFolderUri;
	}

	/**
	 * Returns the currently selected folder resolved to a workspace via the
	 * first provider that can resolve it. Used internally for rendering
	 * (label, icon, group). The provider association is not part of the
	 * picker's public contract — callers should use {@link selectedFolderUri}
	 * and let the management service rediscover the provider.
	 */
	get selectedResolved(): IResolvedFolderWorkspace | undefined {
		return this._selectedResolved;
	}

	get additionalFolderUris(): readonly URI[] {
		return Array.from(this._additionalFolderSelections.values(), selection => selection.workspace.folders[0].root);
	}

	get attachedContextWorkspaces(): readonly ISessionWorkspace[] {
		return Array.from(this._additionalRepositorySelections.values(), selection => selection.workspace);
	}

	clearAttachedContext(): void {
		if (this._additionalFolderSelections.size === 0 && this._additionalRepositorySelections.size === 0) {
			return;
		}
		this._additionalFolderSelections.clear();
		this._additionalRepositorySelections.clear();
		this._updateTriggerLabel();
		this._onDidChangeSelection.fire();
	}

	syncAttachedContext(attachments: readonly IChatRequestVariableEntry[]): void {
		this._attachedContext = attachments;
		if (!this._syncAttachedContext()) {
			this._updateTriggerLabel();
		}
	}

	private _syncAttachedContext(): boolean {
		const attachmentIds = new Set(this._attachedContext.map(attachment => attachment.id));
		let changed = false;
		for (const [key, contexts] of this._contextSelections) {
			const retained = contexts.filter(context => attachmentIds.has(`github-context:${context.uri.toString()}`));
			if (retained.length === contexts.length) {
				continue;
			}
			changed = true;
			if (retained.length > 0) {
				this._contextSelections.set(key, retained);
			} else {
				this._contextSelections.delete(key);
			}
		}
		for (const [key, selection] of this._additionalFolderSelections) {
			if (!attachmentIds.has(getAdditionalFolderContextId(selection.workspace.folders[0].root))) {
				this._additionalFolderSelections.delete(key);
				changed = true;
			}
		}
		for (const [key, selection] of this._additionalRepositorySelections) {
			if (!attachmentIds.has(selection.attachmentId)) {
				this._additionalRepositorySelections.delete(key);
				changed = true;
			}
		}
		for (const attachment of this._attachedContext) {
			if (attachment.id.startsWith(ADDITIONAL_FOLDER_CONTEXT_ID_PREFIX) && URI.isUri(attachment.value)) {
				const resolved = this._resolveFolder(attachment.value);
				if (resolved?.workspace.group === SESSION_WORKSPACE_GROUP_LOCAL) {
					const key = this.uriIdentityService.extUri.getComparisonKey(attachment.value);
					if (!this._additionalFolderSelections.has(key)) {
						this._additionalFolderSelections.set(key, resolved);
						changed = true;
					}
				}
			} else if (attachment.id.startsWith(ADDITIONAL_REPOSITORY_CONTEXT_ID_PREFIX) && URI.isUri(attachment.value)) {
				const resolved = this._resolveFolder(attachment.value);
				const repositoryId = resolved && this._getRepositoryIdForResolvedWorkspace(resolved);
				if (resolved?.workspace.group === SESSION_WORKSPACE_GROUP_GITHUB && repositoryId && !this._additionalRepositorySelections.has(repositoryId)) {
					this._additionalRepositorySelections.set(repositoryId, { ...resolved, attachmentId: attachment.id });
					changed = true;
				}
			}
		}
		if (changed) {
			this._updateTriggerLabel();
			this._onDidChangeSelection.fire();
		}
		return changed;
	}

	get preselectionSource(): NewSessionWorkspacePreselectionSource {
		return this._preselectionSource;
	}

	get selectionSnapshot(): IWorkspaceSelectionSnapshot {
		const restoreState = this._sessionRestoreState.get();
		return {
			folderUri: this._selectedFolderUri,
			origin: this._selectionOrigin,
			state: this.isNoWorkspaceSelected() ? 'noWorkspace' : !this._selectedFolderUri ? 'none' : this._selectedResolved ? 'selected' : 'unresolved',
			historyState: this.recentWorkspacesService.historyLoadState.get(),
			sessionFallbackState: !this._sessionWorkspaceFallback ? 'disabled'
				: restoreState?.generation === this._sessionRestoreGeneration && restoreState.selectionGeneration === this._selectionGeneration && !this._userHasPicked && this._canRestoreWorkspace()
					? restoreState.state : 'idle',
			registeredProviderCount: this.sessionsProvidersService.getProviders().length,
		};
	}

	matchesSelectedWorkspace(workspace: ISessionWorkspace, reader?: IReader): boolean {
		const folderUri = workspace.folders[0]?.root;
		if (folderUri && this._selectedFolderUri && this.uriIdentityService.extUri.isEqual(folderUri, this._selectedFolderUri)) {
			return true;
		}

		const selectedRepositoryId = this._getCurrentRepositoryId(reader);
		return selectedRepositoryId !== undefined && selectedRepositoryId === this._getRepositoryId(workspace, reader);
	}

	constructor(
		protected readonly options: IWorkspacePickerOptions,
		@IActionWidgetService protected readonly actionWidgetService: IActionWidgetService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ISessionsProvidersService protected readonly sessionsProvidersService: ISessionsProvidersService,
		@ISessionsRecentWorkspacesService private readonly recentWorkspacesService: ISessionsRecentWorkspacesService,
		@IRemoteAgentHostService private readonly remoteAgentHostService: IRemoteAgentHostService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INotificationService private readonly notificationService: INotificationService,
		@IHoverService _hoverService: IHoverService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IFileService private readonly fileService: IFileService,
		@IDialogService private readonly dialogService: IDialogService,
		@IAgentHostFilterService private readonly agentHostFilterService: IAgentHostFilterService,
	) {
		super();

		this._tabbedWidget = this._register(this.instantiationService.createInstance(TabbedActionListWidget));
		this._pickerGroupContext = SessionWorkspacePickerGroupContext.bindTo(this.contextKeyService);
		this._register(this._devContainerAvailabilityLimiter.onDrained(() => this._devContainerAvailabilityRefresh.schedule()));
		this._register(autorun(reader => {
			this.options.environment?.read(reader);
			this.options.environmentPickerEnabled?.read(reader);
			this._updateTriggerLabel();
			this._selectionGeneration++;
			this._devContainerAvailabilityRefresh.schedule();
		}));
		this._register(this._tabbedWidget.onDidChangeTab(tab => this._selectWorkspaceGroup(tab)));
		this._register(this._tabbedWidget.onDidHide(() => {
			this._pickerGroupContext.reset();
		}));
		this._sessionWorkspaceFallback = this.options.restoreFromSessions === false
			? undefined
			: this._register(this.instantiationService.createInstance(SessionWorkspaceFallback, {
				canUseProvider: providerId => this._canRestoreProviderWorkspace(providerId),
				isProviderUnavailable: providerId => this._isProviderUnavailable(providerId),
				resolveWorkspace: (folderUri, preferredProviderId) => this._resolveFolder(folderUri, preferredProviderId),
			}));
		this._watchProviderSessionTypes();
		if (this._sessionWorkspaceFallback) {
			this._register(this._sessionWorkspaceFallback.onDidChange(() => this._restoreAutomaticSelection()));
		}

		// Restore selected workspace from storage
		const restored = this._restoreSelectedWorkspace();
		this._applySelection(restored?.resolved, restored?.source, restored?.origin);
		if (this._selectedResolved) {
			this._watchForConnectionFailure(this._selectedResolved);
		} else {
			this._scheduleSessionWorkspaceRestore();
		}

		// React to provider registrations/removals: re-validate the current
		// selection, and if the user hasn't explicitly picked yet, re-restore
		// from storage so we upgrade from any fallback to the user's actual
		// stored selection once its provider arrives.
		this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
			this._watchProviderSessionTypes();
			this._clearDevContainerAvailability();
			this._sessionWorkspaceFallback?.refreshProviders();
			if (this._selectedFolderUri) {
				// Re-resolve in case the previous resolving provider was removed.
				const reresolved = this._resolveFolder(this._selectedFolderUri);
				if (!reresolved) {
					this._selectedFolderUri = undefined;
					this._selectedResolved = undefined;
					this._selectedDevContainerFolderUri = undefined;
					this._preselectionSource = NewSessionWorkspacePreselectionSource.None;
					this._selectionOrigin = WorkspaceSelectionOrigin.None;
					this._connectionStatusWatch.clear();
					this._gitHubInfoWatch.clear();
					this._updateTriggerLabel();
					this._onDidChangeSelection.fire();
					this._onDidSelectWorkspace.fire(undefined);
				} else {
					this._selectedResolved = reresolved;
					this._watchSelectedGitHubInfo();
				}
			}
			this._restoreAutomaticSelection();
			this._syncAttachedContext();
			this._refreshPickerItems();
		}));

		// VS Code's recent-workspace history is loaded asynchronously.
		this._register(this.recentWorkspacesService.onDidChangeRecentWorkspaces(() => {
			this._restoreAutomaticSelection();
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(DevContainerAgentHostEnabledSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)
				|| e.affectsConfiguration(DevContainerSamplesEnabledSettingId) || e.affectsConfiguration('chat.disableAIFeatures')) {
				this._clearDevContainerAvailability(true);
			}
		}));
		this._register(this.fileService.onDidFilesChange(e => {
			const changedResources = [...e.rawAdded, ...e.rawUpdated, ...e.rawDeleted];
			if (changedResources.some(resource => resource.path.endsWith('/.devcontainer')
				|| resource.path.endsWith('/.devcontainer.json')
				|| resource.path.endsWith('/.devcontainer/devcontainer.json'))) {
				this._clearDevContainerAvailability(true);
			}
		}));
		// Re-arm auto-tab whenever the workspace selection changes to a new
		// value, but only while the picker is closed. This way picking a tab
		// and then a workspace within the same open keeps that tab active for
		// the current session, while the next fresh open follows the latest
		// selection's category. Clears (`undefined`) are ignored so the
		// previously-active tab is preserved.
		this._register(this.onDidSelectWorkspace(selection => {
			if (selection && !this.actionWidgetService.isVisible && !this._tabbedWidget.isVisible) {
				this._userPickedTab = false;
			}
		}));
	}

	protected _selectWorkspaceGroup(group: string): void {
		this._activeTab = group;
		this._userPickedTab = true;
		this._pickerGroupContext.set(group);
	}

	/**
	 * Renders the project picker trigger button into the given container.
	 * Returns the container element.
	 *
	 * Calling it again replaces the trigger created by the previous
	 * {@link render} call.
	 */
	render(container: HTMLElement, hoverDelegate?: IHoverDelegate): HTMLElement {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-workspace-picker'));
		this._renderDisposables.add({ dispose: () => slot.remove() });
		this._renderDisposables.add(this._addTrigger(slot, undefined, hoverDelegate));

		return slot;
	}

	/**
	 * Renders another trigger without replacing the primary picker controls.
	 */
	renderAdditionalTrigger(container: HTMLElement, options: IWorkspacePickerTrigger): IDisposable {
		const disposables = new DisposableStore();
		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-workspace-picker'));
		disposables.add({ dispose: () => slot.remove() });
		disposables.add(this._addTrigger(slot, options));
		return disposables;
	}

	renderCategoryTriggers(container: HTMLElement, triggers: readonly IWorkspacePickerTrigger[], label?: string, hoverDelegate?: IHoverDelegate): HTMLElement {
		this._renderDisposables.clear();
		const row = dom.append(container, dom.$('.sessions-workspace-category-picker'));
		this._renderDisposables.add({ dispose: () => row.remove() });
		if (label) {
			const rowLabel = dom.append(row, dom.$('span.sessions-workspace-category-picker-label'));
			rowLabel.textContent = label;
		}
		for (const options of triggers) {
			const slot = dom.append(row, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot'));
			slot.classList.toggle('sessions-workspace-picker-trigger', options.reflectsWorkspace === true);
			this._renderDisposables.add(this._addTrigger(slot, options, hoverDelegate));
		}
		const platformObserver = this._renderDisposables.add(new dom.DisposableResizeObserver(
			'WorkspacePicker.chatPetPlatforms',
			() => this._onDidChangeChatPetPlatform.fire(),
			dom.getWindow(row),
		));
		for (const trigger of this._triggerElements) {
			this._renderDisposables.add(platformObserver.observe(trigger));
		}

		return row;
	}

	getChatPetPlatformElements(): readonly HTMLElement[] {
		return Array.from(this._triggerElements);
	}

	/**
	 * Shared trigger-creation core for {@link render}. Wires up the click /
	 * keyboard / touch handlers and the per-trigger lifecycle.
	 */
	private _addTrigger(slot: HTMLElement, options?: IWorkspacePickerTrigger, hoverDelegate?: IHoverDelegate): IDisposable {
		const triggerDisposables = new DisposableStore();

		const tooltip = options?.tooltip;
		const getTooltip = typeof tooltip === 'function' ? () => {
			const label = tooltip();
			return options?.focusCommand?.enabled.get() ? this.keybindingService.appendKeybinding(label, options.focusCommand.id) : label;
		} : undefined;
		const { trigger, action } = createSessionPickerToolbar(triggerDisposables, slot, this.instantiationService,
			options?.focusCommand?.id ?? 'sessions.workspacePicker', options?.ariaLabel ?? localize('workspacePicker.chooseWorkspace', "Choose Workspace"),
			() => this.showPicker(false, trigger, options?.group, options?.attachesContext), hoverDelegate, getTooltip);
		trigger.tabIndex = 0;
		trigger.role = 'button';
		trigger.setAttribute('aria-haspopup', 'listbox');
		trigger.setAttribute('aria-expanded', 'false');

		this._triggerElements.add(trigger);
		const contents: IWorkspacePickerTriggerElements = { slot };
		this._triggerContents.set(trigger, contents);
		if (options) {
			this._triggerOptions.set(trigger, options);
		}
		this._triggerElement = trigger;
		this._renderTriggerLabel(trigger);
		if (options?.clearable) {
			const clearButton = triggerDisposables.add(new Button(slot, {
				...defaultButtonStyles,
				hoverDelegate,
				buttonBackground: undefined,
				buttonHoverBackground: undefined,
				buttonForeground: undefined,
				buttonBorder: undefined,
			}));
			clearButton.element.classList.add('sessions-workspace-clear-button');
			clearButton.icon = Codicon.closeCompact;
			const clearLabel = localize('workspacePicker.clearWorkspace', "Chat without a workspace");
			clearButton.setAriaLabel(clearLabel);
			clearButton.setTitle(clearLabel);
			triggerDisposables.add(clearButton.onDidClick(() => {
				this.clearSelection();
				trigger.focus();
				status(localize('workspacePicker.workspaceCleared', "Workspace cleared. You can chat without a workspace or choose another workspace."));
			}));
			contents.clearButton = clearButton;
			triggerDisposables.add(autorun(reader => {
				options.clearable?.read(reader);
				this._renderTriggerLabel(trigger);
			}));
		}
		if (options?.tooltip) {
			if (options.focusCommand) {
				registerPickerKeybindingPresentation(
					triggerDisposables,
					trigger,
					typeof options.tooltip === 'function' ? options.ariaLabel : options.tooltip,
					options.focusCommand.id,
					options.focusCommand.when,
					options.focusCommand.enabled,
					this.commandService,
					this.contextMenuService,
					action,
					this.keybindingService,
				);
			} else if (typeof options.tooltip === 'string') {
				action.tooltip = options.tooltip;
			}
		}
		// Onboarding spotlight target — id is referenced by the "new session" tour
		// in vs/sessions/contrib/onboardingTours.
		triggerDisposables.add(markOnboardingTarget(trigger, 'sessions.newSession.workspacePicker', {
			open: () => this.showPicker(false, trigger, options?.group, options?.attachesContext),
			hasSelection: () => !!this._selectedFolderUri,
			onDidSelect: Event.map(Event.filter(this.onDidSelectWorkspace, uri => !!uri && this._selectionOrigin === WorkspaceSelectionOrigin.User), () => this.options.whenSelectionAccepted?.() ?? Promise.resolve(true)),
		}));

		triggerDisposables.add(touch.Gesture.addTarget(trigger));
		let pendingTap: { readonly at: number; readonly pageX: number; readonly pageY: number } | undefined;
		triggerDisposables.add(dom.addDisposableListener(dom.getWindow(trigger).document, dom.EventType.CLICK, e => {
			if (!pendingTap || this._now() - pendingTap.at >= GHOST_CLICK_GUARD_MS) {
				pendingTap = undefined;
				return;
			}
			if (e.detail > 0
				&& Math.abs(e.pageX - pendingTap.pageX) < GHOST_CLICK_GUARD_DISTANCE
				&& Math.abs(e.pageY - pendingTap.pageY) < GHOST_CLICK_GUARD_DISTANCE) {
				pendingTap = undefined;
				dom.EventHelper.stop(e, true);
			}
		}, true));
		triggerDisposables.add(dom.addDisposableListener(trigger, touch.EventType.Tap, (e) => {
			pendingTap = { at: this._now(), pageX: e.pageX, pageY: e.pageY };
			dom.EventHelper.stop(e, true);
			this.showPicker(false, trigger, options?.group, options?.attachesContext);
		}));
		triggerDisposables.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, (e) => {
			dom.EventHelper.stop(e, true);
			this.showPicker(false, trigger, options?.group, options?.attachesContext);
		}));
		triggerDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
				dom.EventHelper.stop(e, true);
				this.showPicker(false, trigger, options?.group, options?.attachesContext);
			}
		}));

		triggerDisposables.add({
			dispose: () => {
				this._triggerContents.get(trigger)?.badge?.dispose();
				this._triggerElements.delete(trigger);
				this._triggerOptions.delete(trigger);
				this._triggerContents.delete(trigger);
				if (this._triggerElement === trigger) {
					// Demote to any other live trigger so subclasses that read
					// `_triggerElement` (e.g. WebWorkspacePicker's mobile sheet
					// path) don't dereference a removed node.
					this._triggerElement = this._triggerElements.values().next().value;
				}
			},
		});

		return triggerDisposables;
	}

	/** Overridable clock so the ghost-click guard can be tested deterministically. */
	protected _now(): number {
		return Date.now();
	}

	/**
	 * Shows the workspace picker dropdown anchored to a trigger element.
	 *
	 * @param force When true, re-show even if the picker is already visible.
	 *              Used internally when swapping items in place after a tab
	 *              change.
	 * @param anchor The specific trigger element to anchor the popup to. When
	 *               omitted, defaults to the most-recently rendered trigger.
	 *               Pass through when more than one trigger is live and the
	 *               popup should align with the one the user actually clicked.
	 */
	showPicker(force = false, anchor?: HTMLElement, preferredGroup?: string, attachesContext?: boolean): void {
		const triggerElement = anchor ?? this._triggerElement;
		if (!triggerElement) {
			return;
		}
		const alreadyVisible = this.actionWidgetService.isVisible || this._tabbedWidget.isVisible;
		if (alreadyVisible) {
			if (this._activeTriggerElement === triggerElement) {
				if (!force) {
					this._hidePicker();
					return;
				}
			}
			this._hidePicker();
		}
		this._activeTriggerElement = triggerElement;
		this._setDirectPickerFilter(preferredGroup, attachesContext);
		if (preferredGroup === SESSION_WORKSPACE_GROUP_GITHUB && attachesContext === false && !this._getCurrentRepositoryId()) {
			const items = this._buildItems();
			const directBrowseItem = items.length === 1 && items[0].kind === ActionListItemKind.Action
				? items[0].item
				: undefined;
			if (directBrowseItem?.browseActionIndex !== undefined && !items[0].disabled) {
				this._activeTriggerElement = undefined;
				triggerElement.setAttribute('aria-expanded', 'false');
				void this._dispatchPickerItem(directBrowseItem).finally(() => {
					this._directPickerGroup = undefined;
					this._directPickerAttachesContext = undefined;
					triggerElement.focus();
				});
				return;
			}
		}

		const tabs = this._showTabs() ? this._getAvailableTabs() : [];

		// Default the active tab to the group of the currently selected
		// workspace. The user-pick latch is reset on every selection change,
		// so picking a tab during one open of the picker doesn't permanently
		// override auto-tab.
		if (preferredGroup === undefined && tabs.length > 0) {
			const selectedGroup = this._getTabGroup(this._selectedResolved?.workspace.group);
			if (!this._userPickedTab && selectedGroup && tabs.some(t => t.id === selectedGroup)) {
				this._activeTab = selectedGroup;
			}
			if (!this._activeTab || !tabs.some(t => t.id === this._activeTab)) {
				this._activeTab = tabs[0].id;
			}
		}

		if (preferredGroup !== undefined) {
			this._showFlatPicker(triggerElement);
		} else if (tabs.length > 1) {
			this._showTabbedPicker(tabs, triggerElement);
		} else {
			this._activeTab = undefined;
			this._showFlatPicker(triggerElement);
		}
		if (!alreadyVisible && (preferredGroup === undefined || preferredGroup === SESSION_WORKSPACE_GROUP_REMOTE)
			&& this.configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)
			&& !this.agentHostFilterService.isDiscovering) {
			void this.agentHostFilterService.rediscover().then(success => {
				if (!success) {
					this.notificationService.warn(localize('workspacePicker.refreshHostsFailed', "Could not refresh remote hosts. Showing the last known hosts."));
				}
			}, onUnexpectedError);
		}
	}

	protected _setDirectPickerFilter(group: string | undefined, attachesContext: boolean | undefined): void {
		this._directPickerGroup = group;
		this._directPickerAttachesContext = attachesContext;
		if (group !== undefined) {
			this._selectWorkspaceGroup(group);
		}
	}

	refreshPresentation(): void {
		this._updateTriggerLabel();
	}

	/**
	 * The consolidated workspace picker uses one unified list. Category-specific
	 * entry points still scope the list through `_setDirectPickerFilter`.
	 */
	protected _showTabs(): boolean {
		return !this._useConsolidatedRemoteWorkspaces();
	}

	protected _getAvailableTabs(): ITabDescriptor[] {
		const byLabel = new Map<string, ITabDescriptor>();
		const remoteAgentHostsEnabled = this.configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId);
		if (remoteAgentHostsEnabled) {
			byLabel.set(SESSION_WORKSPACE_GROUP_REMOTE, {
				id: SESSION_WORKSPACE_GROUP_REMOTE,
				icon: Codicon.beaker,
				tooltip: `${SESSION_WORKSPACE_GROUP_REMOTE} (${localize('workspacePicker.experimental', "Experimental")})`,
			});
		}
		for (const provider of this.sessionsProvidersService.getProviders()) {
			if (!this._isWorkspaceProviderVisible(provider.id)) {
				continue;
			}
			if (provider.supportsLocalWorkspaces && !byLabel.has(SESSION_WORKSPACE_GROUP_LOCAL)) {
				byLabel.set(SESSION_WORKSPACE_GROUP_LOCAL, { id: SESSION_WORKSPACE_GROUP_LOCAL });
			}
			for (const action of provider.browseActions) {
				if (action.group === SESSION_WORKSPACE_GROUP_REMOTE && !remoteAgentHostsEnabled) {
					continue;
				}
				const group = this._getTabGroup(action.group);
				if (group && !byLabel.has(group)) {
					byLabel.set(group, { id: group });
				}
			}
		}
		return Array.from(byLabel.values()).sort((a, b) =>
			a.id === SESSION_WORKSPACE_GROUP_LOCAL ? -1
				: b.id === SESSION_WORKSPACE_GROUP_LOCAL ? 1
					: a.id.localeCompare(b.id));
	}

	/**
	 * Builds the shared `IActionListDelegate` used by both the flat and
	 * tabbed presentations.
	 */
	private _buildDelegate(triggerElement: HTMLElement, hide: () => void): IActionListDelegate<IWorkspacePickerItem> {
		return {
			onSelect: (item) => {
				void this._dispatchPickerItem(item);
				hide();
			},
			onHide: () => {
				triggerElement.setAttribute('aria-expanded', 'false');
				if (this._activeTriggerElement === triggerElement) {
					this._activeTriggerElement = undefined;
					this._directPickerGroup = undefined;
					this._directPickerAttachesContext = undefined;
				}
				triggerElement.focus();
			},
		};
	}

	protected _buildListOptions(items: readonly IActionListItem<IWorkspacePickerItem>[], pickerWidth: number | undefined): IActionListOptions {
		const isConsolidatedWorkspacePicker = this._useConsolidatedRemoteWorkspaces() && this._directPickerAttachesContext !== true;
		const showFilter = isConsolidatedWorkspacePicker
			|| items.filter(i => i.kind === ActionListItemKind.Action).length > FILTER_THRESHOLD;
		return showFilter
			? { ...WORKSPACE_PICKER_LIST_OPTIONS, showFilter: true, focusFilterOnOpen: isConsolidatedWorkspacePicker, filterPlaceholder: isConsolidatedWorkspacePicker ? localize('workspacePicker.filter', "Search") : undefined, submenuPointerIntent: isConsolidatedWorkspacePicker || undefined, submenuHoverDelay: isConsolidatedWorkspacePicker ? 0 : undefined, minWidth: pickerWidth, maxWidth: pickerWidth }
			: { ...WORKSPACE_PICKER_LIST_OPTIONS, submenuHoverDelay: isConsolidatedWorkspacePicker ? 0 : undefined, minWidth: pickerWidth, maxWidth: pickerWidth };
	}

	/**
	 * Flat (no-tabs) presentation. Delegates rendering to the shared
	 * `IActionWidgetService` so we benefit from its keybindings, focus
	 * tracking and submenu chrome.
	 */
	private _showFlatPicker(triggerElement: HTMLElement): void {
		// Tear down any previous tabbed popup before delegating to the
		// shared service — the two presentations don't co-exist.
		this._tabbedWidget.hide();
		const items = this._buildItems();
		const delegate = this._buildDelegate(triggerElement, () => this._hidePicker());
		triggerElement.setAttribute('aria-expanded', 'true');

		this.actionWidgetService.show<IWorkspacePickerItem>(
			'workspacePicker',
			false,
			items,
			delegate,
			triggerElement,
			undefined,
			[],
			{
				getAriaLabel: getWorkspacePickerItemAriaLabel,
				getWidgetAriaLabel: () => localize('workspacePicker.ariaLabel', "Workspace Picker"),
			},
			this._buildListOptions(items, undefined),
			this._triggerOptions.get(triggerElement)?.contextViewLayer,
		);
	}

	/**
	 * Tabbed presentation. Delegates rendering and lifecycle to the
	 * platform `TabbedActionListWidget`; this picker only owns the data
	 * and selection logic.
	 */
	private _showTabbedPicker(tabs: readonly ITabDescriptor[], triggerElement: HTMLElement): void {
		// Hide the flat picker if it's visible — the two presentations
		// don't co-exist.
		if (this.actionWidgetService.isVisible) {
			this.actionWidgetService.hide();
		}

		const delegate = this._buildDelegate(triggerElement, () => this._hidePicker());
		const accessibilityProvider = {
			getAriaLabel: getWorkspacePickerItemAriaLabel,
			getWidgetAriaLabel: () => localize('workspacePicker.ariaLabel', "Workspace Picker"),
		};

		triggerElement.setAttribute('aria-expanded', 'true');
		this._pickerGroupContext.set(this._activeTab ?? tabs[0].id);
		this._tabbedWidget.show<IWorkspacePickerItem>({
			user: 'workspacePicker',
			anchor: triggerElement,
			tabs,
			initialTab: this._activeTab ?? tabs[0].id,
			createActionList: (tab) => {
				this._activeTab = tab;
				const items = this._buildItems();
				const listOptions = this._useConsolidatedRemoteWorkspaces()
					? this._buildListOptions(items, undefined)
					: { className: 'sessions-new-chat-picker-list', inlineDescription: true, showGroupTitleOnFirstItem: true, hideDefaultKeybindingTooltip: true };
				return { items, listOptions };
			},
			delegate,
			accessibilityProvider,
			width: TABBED_PICKER_WIDTH,
			contextViewLayer: this._triggerOptions.get(triggerElement)?.contextViewLayer,
			tabBarClassName: 'sessions-workspace-picker-tabbar',
		});
	}

	/**
	 * Dispatch logic for a picker item once the user picks it. Shared
	 * between the desktop action-widget delegate and any mobile sheet
	 * subclass that opts to render a different UI but reuse the
	 * selection semantics. Treats unavailable workspaces as a no-op.
	 */
	protected async _dispatchPickerItem(item: IWorkspacePickerItem): Promise<boolean> {
		const generation = ++this._selectionGeneration;
		this._reportPickerClosed(item);
		if (item.run) {
			item.run();
			return true;
		} else if (item.commandId) {
			void this.commandService.executeCommand(item.commandId);
			return true;
		} else if (item.folderUri && item.providerId && this._isProviderUnavailable(item.providerId)) {
			// Workspace belongs to an unavailable remote — ignore selection
			return false;
		}
		if (item.browseActionIndex !== undefined || item.browseAction) {
			const selection = await this._executeBrowseAction(item.browseActionIndex, item.browseAction);
			const folderUri = selection?.workspace.folders[0]?.root;
			if (!folderUri || generation !== this._selectionGeneration) {
				return false;
			}
			const attachesContext = selection.action?.attachesContext === true || item.attachAsContext === true;
			const environment = attachesContext ? undefined : this._getEnvironment();
			const selectsWorkspace = !attachesContext || !this._selectedFolderUri && !this.options.environment?.get();
			const relatedWorkspace = selectsWorkspace
				? environment
					? this._findRelatedEnvironmentWorkspace(selection.workspace, environment)
					: this._findRelatedLocalWorkspace(selection.workspace)
				: undefined;
			const selectedFolderUri = relatedWorkspace?.workspace.folders[0]?.root ?? folderUri;
			const selectedProviderId = relatedWorkspace?.providerId ?? selection.providerId;
			if (!await this._canSelectWorkspace(selectedFolderUri, selectedProviderId, attachesContext)) {
				return false;
			}
			if (generation !== this._selectionGeneration) {
				return false;
			}
			const action = selection.action;
			if (action?.attachesContext) {
				if (action.group) {
					const key = `${action.group}:context`;
					const contexts = this._contextSelections.get(key) ?? [];
					if (!contexts.some(context => context.uri.toString() === selection.workspace.uri.toString())) {
						this._contextSelections.set(key, [...contexts, selection.workspace]);
					}
					this._updateTriggerLabel();
				}
				this._onDidSelectContext.fire(selection.workspace);
				if (this._selectedFolderUri || this.options.environment?.get()) {
					return true;
				}
			}
			if (item.attachAsContext) {
				if (action?.group === SESSION_WORKSPACE_GROUP_GITHUB
					&& action.attachesContext !== true
					&& action.supportsContextAttachment === true) {
					return this._attachAdditionalRepository(selection.workspace, selection.providerId);
				}
				if (action === this._localBrowseAction) {
					return this._attachAdditionalFolder(folderUri, selection.providerId);
				}
				return false;
			}
			const preferDevContainer = environment?.kind === 'container';
			this._selectedDevContainerFolderUri = preferDevContainer ? selectedFolderUri : undefined;
			this._onDidSelectWorkspaceMode.fire({ folderUri: selectedFolderUri, preferDevContainer });
			this._selectFolder(
				selectedFolderUri,
				true,
				selectedProviderId,
			);
			return true;
		} else if (item.folderUri) {
			if (item.providerId && !await this._connectProviderOnDemand(item.providerId)) {
				return false;
			}
			if (generation !== this._selectionGeneration) {
				return false;
			}
			if (!await this._canSelectWorkspace(item.folderUri, item.providerId)) {
				return false;
			}
			if (generation !== this._selectionGeneration) {
				return false;
			}
			this._selectedDevContainerFolderUri = item.preferDevContainer ? item.folderUri : undefined;
			this._onDidSelectWorkspaceMode.fire({ folderUri: item.folderUri, preferDevContainer: item.preferDevContainer === true });
			this._selectFolder(item.folderUri, true, item.providerId);
			const sample = findDevContainerSample(item.folderUri);
			if (sample) {
				this.telemetryService.publicLog2<DevContainerSampleSelectedEvent, DevContainerSampleSelectedClassification>('devContainerSampleSelected', { sampleId: sample.id });
			}
			return true;
		}
		return false;
	}

	private _attachAdditionalFolder(folderUri: URI, providerId: string | undefined): boolean {
		if (!this._selectedFolderUri || this.uriIdentityService.extUri.isEqual(this._selectedFolderUri, folderUri)) {
			return false;
		}
		const resolved = this._resolveFolder(folderUri, providerId);
		if (resolved?.workspace.group !== SESSION_WORKSPACE_GROUP_LOCAL) {
			return false;
		}
		const key = this.uriIdentityService.extUri.getComparisonKey(folderUri);
		if (!this._additionalFolderSelections.has(key)) {
			this._additionalFolderSelections.set(key, resolved);
			this.recentWorkspacesService.addRecentWorkspace(folderUri, providerId, false);
			this._updateTriggerLabel();
			this._onDidSelectFolderContext.fire(folderUri);
		}
		return true;
	}

	private _attachAdditionalRepository(workspace: ISessionWorkspace, providerId: string): boolean {
		if (!this._selectedFolderUri || workspace.group !== SESSION_WORKSPACE_GROUP_GITHUB) {
			return false;
		}
		const repositoryId = this._getRepositoryId(workspace);
		if (!repositoryId) {
			return false;
		}
		if (!this._additionalRepositorySelections.has(repositoryId)) {
			const selection = { workspace, providerId };
			this._additionalRepositorySelections.set(repositoryId, {
				...selection,
				attachmentId: getAdditionalRepositoryContextId(workspace.uri),
			});
			this.recentWorkspacesService.addRecentWorkspace(workspace.folders[0].root, providerId, false);
			this._updateTriggerLabel();
			this._onDidSelectRepositoryContext.fire(selection);
			this._onDidChangeSelection.fire();
		}
		return true;
	}

	protected _findRelatedLocalWorkspace(workspace: ISessionWorkspace): IResolvedFolderWorkspace | undefined {
		const repositoryId = this._getRepositoryId(workspace);
		if (!repositoryId) {
			return undefined;
		}
		const matchesRepository = (candidate: IResolvedFolderWorkspace) =>
			candidate.workspace.group === SESSION_WORKSPACE_GROUP_LOCAL
			&& this._getRepositoryIdForResolvedWorkspace(candidate) === repositoryId;
		if (this._selectedResolved && matchesRepository(this._selectedResolved)) {
			return this._selectedResolved;
		}
		return this._getRecentWorkspaces().find(matchesRepository);
	}

	private _findRelatedEnvironmentWorkspace(workspace: ISessionWorkspace, environment: ISessionCreationEnvironment): IResolvedFolderWorkspace | undefined {
		const repositoryId = this._getRepositoryId(workspace);
		if (!repositoryId) {
			return undefined;
		}
		const providers = this.sessionsProvidersService.getProviders();
		const resolve = (candidate: IResolvedFolderWorkspace | undefined): IResolvedFolderWorkspace | undefined => {
			if (!candidate || this._getRepositoryIdForResolvedWorkspace(candidate) !== repositoryId) {
				return undefined;
			}
			const folderUri = candidate.workspace.folders[0]?.root;
			const resolved = folderUri && resolveEnvironmentWorkspace(environment, providers, folderUri);
			return resolved ? { providerId: resolved.provider.id, workspace: resolved.workspace } : undefined;
		};
		for (const candidate of [this._selectedResolved, ...this._getRecentWorkspaces()]) {
			const resolved = resolve(candidate);
			if (resolved) {
				return resolved;
			}
		}
		return undefined;
	}

	private _getRepositoryId(workspace: ISessionWorkspace, reader?: IReader): string | undefined {
		for (const folder of workspace.folders) {
			folder.gitRepository?.resolveGitHubInfo?.();
		}
		const info = workspace.folders
			.map(folder => folder.gitRepository?.gitHubInfo.read(reader))
			.find(candidate => candidate !== undefined);
		if (info) {
			return `${info.owner}/${info.repo}`.toLowerCase();
		}
		if (workspace.group !== SESSION_WORKSPACE_GROUP_GITHUB) {
			return undefined;
		}
		const pathSegments = workspace.folders[0]?.root.path.split('/').filter(Boolean);
		return pathSegments?.[0] && pathSegments[1]
			? `${pathSegments[0]}/${pathSegments[1]}`.toLowerCase()
			: undefined;
	}

	private _watchProviderSessionTypes(): void {
		const store = new DisposableStore();
		this._providerSessionTypesWatch.value = store;
		for (const provider of this.sessionsProvidersService.getProviders()) {
			store.add(provider.onDidChangeSessionTypes(() => this._refreshPickerItems()));
			if (isAgentHostProvider(provider) && provider.isVisibleInEnvironmentPicker) {
				const visibility = provider.isVisibleInEnvironmentPicker;
				let initialized = false;
				store.add(autorun(reader => {
					visibility.read(reader);
					if (initialized) {
						this._refreshPickerItems();
					}
					initialized = true;
				}));
			}
			if (isAgentHostProvider(provider) && provider.onDidChangeDevContainerAvailability) {
				store.add(provider.onDidChangeDevContainerAvailability(() => this._clearDevContainerAvailability(true)));
			}
		}
	}

	protected _refreshPickerItems(): void {
		const activeTrigger = this._activeTriggerElement;
		if (activeTrigger && (this.actionWidgetService.isVisible || this._tabbedWidget.isVisible)) {
			if (this._showTabs()) {
				this.showPicker(true, activeTrigger, this._directPickerGroup, this._directPickerAttachesContext);
			} else if (this._tabbedWidget.isVisible) {
				this._tabbedWidget.refreshActiveList();
			} else {
				this.actionWidgetService.updateItems(this._buildItems(), undefined, { preserveHover: true, preserveScrollPosition: true });
			}
		}
	}

	private _getCurrentRepositoryId(reader?: IReader): string | undefined {
		const workspace = this._getSelectedRepositoryWorkspace(reader);
		return workspace && this._getRepositoryId(workspace, reader);
	}

	/**
	 * Emits `newChatPickerClosed` telemetry on user selection. The
	 * "before" value is read from storage (the currently-checked recent
	 * workspace) if available, otherwise from the in-memory selection.
	 * The "after" value comes from the item the user picked — undefined
	 * when the item is a browse action or command rather than a workspace.
	 */
	private _reportPickerClosed(item: IWorkspacePickerItem): void {
		const beforeFromStorage = this._restoreCheckedWorkspace();
		const before = beforeFromStorage ?? this._selectedResolved;
		const afterUri = item.folderUri;
		const afterResolved = afterUri ? this._resolveFolder(afterUri) : undefined;
		reportNewChatPickerClosed(this.telemetryService, {
			id: 'NewChatWorkspacePicker',
			name: 'NewChatWorkspacePicker',
			optionIdBefore: before?.workspace?.uri.toString(),
			optionIdAfter: afterResolved?.workspace?.uri.toString(),
			optionLabelBefore: before?.workspace?.label,
			optionLabelAfter: afterResolved?.workspace?.label,
			isPII: true,
		});
	}

	/**
	 * Programmatically set the selected workspace by folder URI.
	 * @param folderUri The folder URI to select.
	 * @param options.fireEvent Whether to fire the onDidSelectWorkspace event. Defaults to true.
	 * @param options.providerId Optional providerId hint that wins over any historical
	 *        recent entry's provider. Use when the caller knows which provider should
	 *        own the resulting session (e.g. "New Session" invoked from a workspace
	 *        section in the sessions list, where the existing sessions for the
	 *        workspace were created by a specific provider).
	 * @param options.persist Whether to persist the selection as a recent workspace. Defaults to true.
	 */
	setSelectedWorkspace(folderUri: URI, options?: { fireEvent?: boolean; providerId?: string; persist?: boolean; preferDevContainer?: boolean; origin?: WorkspaceSelectionOrigin }): void {
		this._selectedDevContainerFolderUri = options?.preferDevContainer ? folderUri : undefined;
		const origin = options?.origin ?? WorkspaceSelectionOrigin.Programmatic;
		const preserveOrigin = (origin === WorkspaceSelectionOrigin.RestoredDraft || origin === WorkspaceSelectionOrigin.SessionSync)
			&& this._isSelectedFolder(folderUri);
		this._selectFolder(
			folderUri,
			options?.fireEvent ?? true,
			options?.providerId,
			options?.persist ?? true,
			NewSessionWorkspacePreselectionSource.ProvidedWorkspace,
			preserveOrigin ? this._selectionOrigin : origin,
		);
	}

	/**
	 * Hides whichever popup variant is currently visible — the shared
	 * action-widget-service flat picker or our own context-view-driven
	 * tabbed picker.
	 */
	private _hidePicker(): void {
		this._tabbedWidget.hide();
		if (this.actionWidgetService.isVisible) {
			this.actionWidgetService.hide();
		}
		this._activeTriggerElement?.setAttribute('aria-expanded', 'false');
		this._activeTriggerElement = undefined;
		this._directPickerGroup = undefined;
		this._directPickerAttachesContext = undefined;
	}

	/**
	 * Clears the selected project.
	 */
	clearSelection(): void {
		this.options.onUserSelection?.();
		this._selectionGeneration++;
		this._hidePicker();
		this._userHasPicked = true;
		this._connectionStatusWatch.clear();
		this._selectedFolderUri = undefined;
		this._selectedResolved = undefined;
		this._preselectionSource = NewSessionWorkspacePreselectionSource.None;
		this._selectionOrigin = WorkspaceSelectionOrigin.None;
		if (this._shouldPersistSelection()) {
			this.recentWorkspacesService.clearCheckedWorkspace();
		}
		this._updateTriggerLabel();
		this._onDidChangeSelection.fire();
		this._onDidSelectWorkspace.fire(undefined);
	}

	isNoWorkspaceSelected(): boolean {
		return !!this.options.getNoWorkspaceOption && this.recentWorkspacesService.isNoWorkspaceChecked();
	}

	selectNoWorkspace(userSelection = true): void {
		if (userSelection) {
			this.options.onUserSelection?.();
		}
		this._selectionGeneration++;
		this._sessionRestoreGeneration++;
		this._hidePicker();
		this._userHasPicked = true;
		this._connectionStatusWatch.clear();
		this._applySelection(undefined);
		this.recentWorkspacesService.checkNoWorkspace();
		this._updateTriggerLabel();
		this._onDidChangeSelection.fire();
	}

	/**
	 * Clears the selection if it matches the given URI.
	 */
	removeFromRecents(uri: URI): void {
		if (this._selectedFolderUri && this.uriIdentityService.extUri.isEqual(this._selectedFolderUri, uri)) {
			this.clearSelection();
		}
	}

	private _selectFolder(
		folderUri: URI,
		fireEvent = true,
		providerIdHint?: string,
		persist = true,
		source = NewSessionWorkspacePreselectionSource.User,
		origin = WorkspaceSelectionOrigin.User,
	): void {
		if (source === NewSessionWorkspacePreselectionSource.User) {
			this.options.onUserSelection?.();
		}
		this._selectionGeneration++;
		this._userHasPicked = true;
		this._connectionStatusWatch.clear();
		// Prefer the caller-supplied providerId hint, then the historical
		// providerId stored in the recents for this URI, so re-picking a
		// Local Agent Host folder restores the Local Agent Host association
		// even when another provider also resolves the URI.
		const storedProviderId = this.recentWorkspacesService.getRecentWorkspaces()
			.find(r => this.uriIdentityService.extUri.isEqual(r.workspace.folders[0]?.root, folderUri))
			?.providerId;
		const resolved = this._resolveFolder(folderUri, providerIdHint ?? storedProviderId);
		const additionalFolderKey = this.uriIdentityService.extUri.getComparisonKey(folderUri);
		const additionalFolder = this._additionalFolderSelections.get(additionalFolderKey);
		const removedAdditionalFolder = this._additionalFolderSelections.delete(additionalFolderKey);
		const repositoryId = resolved && this._getRepositoryIdForResolvedWorkspace(resolved);
		const additionalRepository = repositoryId ? this._additionalRepositorySelections.get(repositoryId) : undefined;
		const removedAdditionalRepository = repositoryId ? this._additionalRepositorySelections.delete(repositoryId) : false;
		if (removedAdditionalFolder && additionalFolder) {
			this._onDidRemoveAttachedContext.fire(getAdditionalFolderContextId(additionalFolder.workspace.folders[0].root));
		}
		if (removedAdditionalRepository && additionalRepository) {
			this._onDidRemoveAttachedContext.fire(additionalRepository.attachmentId);
		}
		this._selectedFolderUri = folderUri;
		this._selectedResolved = resolved;
		this._watchSelectedGitHubInfo();
		this._preselectionSource = source;
		this._selectionOrigin = origin;
		if (persist && this._shouldPersistSelection()) {
			this.recentWorkspacesService.addRecentWorkspace(folderUri, resolved?.providerId, true);
		}
		this._updateTriggerLabel();
		this._onDidChangeSelection.fire();
		if (fireEvent) {
			this._onDidSelectWorkspace.fire(folderUri);
		}
	}

	protected _shouldPersistSelection(): boolean {
		return true;
	}

	/**
	 * Apply a restored selection without firing events or persisting. Used
	 * during construction and after provider list changes.
	 */
	private _applySelection(resolved: IResolvedFolderWorkspace | undefined, source = NewSessionWorkspacePreselectionSource.None, origin = WorkspaceSelectionOrigin.None): void {
		this._selectedResolved = resolved;
		this._selectedFolderUri = resolved?.workspace.folders[0]?.root;
		this._watchSelectedGitHubInfo();
		this._preselectionSource = resolved ? source : NewSessionWorkspacePreselectionSource.None;
		this._selectionOrigin = resolved ? origin : WorkspaceSelectionOrigin.None;
	}

	private _watchSelectedGitHubInfo(): void {
		const store = new DisposableStore();
		this._gitHubInfoWatch.value = store;
		const observed = new Set<IObservable<IGitHubInfo | undefined>>();
		for (const workspace of this._getSelectedRepositoryWorkspaceCandidates()) {
			for (const folder of workspace.folders) {
				folder.gitRepository?.resolveGitHubInfo?.();
				const gitHubInfo = folder.gitRepository?.gitHubInfo;
				if (gitHubInfo && !observed.has(gitHubInfo)) {
					observed.add(gitHubInfo);
					store.add(autorun(reader => {
						gitHubInfo.read(reader);
						this._updateTriggerLabel();
					}));
				}
			}
		}
	}

	private _getSelectedRepositoryWorkspace(reader?: IReader): ISessionWorkspace | undefined {
		return this._getSelectedRepositoryWorkspaceCandidates().find(workspace => this._getRepositoryId(workspace, reader) !== undefined);
	}

	private _getSelectedRepositoryWorkspaceCandidates(): ISessionWorkspace[] {
		if (!this._selectedResolved || !this._selectedFolderUri) {
			return [];
		}
		return this._getRepositoryWorkspaceCandidates(this._selectedResolved);
	}

	private _getRepositoryIdForResolvedWorkspace(selection: IResolvedFolderWorkspace, reader?: IReader): string | undefined {
		for (const workspace of this._getRepositoryWorkspaceCandidates(selection)) {
			const repositoryId = this._getRepositoryId(workspace, reader);
			if (repositoryId) {
				return repositoryId;
			}
		}
		return undefined;
	}

	private _getRepositoryWorkspaceCandidates(selection: IResolvedFolderWorkspace): ISessionWorkspace[] {
		const folderUri = selection.workspace.folders[0]?.root;
		if (!folderUri) {
			return [selection.workspace];
		}
		const candidates = [selection.workspace];
		for (const provider of this.sessionsProvidersService.getProviders()) {
			if (provider.id === selection.providerId) {
				continue;
			}
			const workspace = provider.resolveWorkspace(folderUri);
			if (workspace?.group === SESSION_WORKSPACE_GROUP_LOCAL) {
				candidates.push(workspace);
			}
		}
		return candidates;
	}

	/**
	 * Iterate providers and return the first resolution of the folder URI.
	 * When `preferredProviderId` is given, that provider is tried first so a
	 * user's historical pick survives provider iteration order changes.
	 */
	private _resolveFolder(folderUri: URI, preferredProviderId?: string): IResolvedFolderWorkspace | undefined {
		if (preferredProviderId) {
			const preferred = this.sessionsProvidersService.getProvider(preferredProviderId);
			const workspace = preferred?.resolveWorkspace(folderUri);
			if (workspace) {
				return { providerId: preferredProviderId, workspace };
			}
		}
		for (const provider of this.sessionsProvidersService.getProviders()) {
			const workspace = provider.resolveWorkspace(folderUri);
			if (workspace) {
				return { providerId: provider.id, workspace };
			}
		}
		return undefined;
	}

	/**
	 * Executes a provider browse action referenced directly or by picker index.
	 */
	private async _executeBrowseAction(actionIndex: number | undefined, browseAction?: ISessionWorkspaceBrowseAction): Promise<IBrowsedWorkspaceSelection | undefined> {
		const action = browseAction ?? (actionIndex !== undefined ? this._getAllBrowseActions()[actionIndex] : undefined);
		if (!action) {
			return undefined;
		}

		// Let the action-list widget hide before a browse action opens another picker.
		await Promise.resolve();
		if (action.providerId && !this._isWorkspaceProviderVisible(action.providerId)) {
			return undefined;
		}
		try {
			if (action === this._localBrowseAction) {
				const selection = await this._browseForLocalFolder();
				return selection ? { ...selection, action } : undefined;
			}
			const actionProvider = this.sessionsProvidersService.getProvider(action.providerId);
			const currentWorkspace = action.attachesContext && this._selectedFolderUri
				? (actionProvider?.resolveWorkspace(this._selectedFolderUri) ?? this._selectedResolved?.workspace)
				: (this._getSelectedRepositoryWorkspace() ?? this._selectedResolved?.workspace);
			const workspace = await action.run(currentWorkspace);
			return workspace ? { workspace, providerId: action.providerId, action } : undefined;
		} catch {
			// browse action was cancelled or failed
		}
		return undefined;
	}

	private async _canSelectWorkspace(folderUri: URI, providerId: string | undefined, attachesContext = false): Promise<boolean> {
		if (folderUri.scheme === Schemas.file && this.fileService.hasProvider(folderUri)) {
			const generation = this._selectionGeneration;
			const exists = await this.fileService.exists(folderUri);
			if (generation !== this._selectionGeneration) {
				return false;
			}
			if (!exists) {
				this._removeRecentWorkspace(folderUri);
				await this.dialogService.info(
					localize('pathNotExistTitle', "Path does not exist"),
					localize('pathNotExistDetail', "The path '{0}' does not exist on this computer.", folderUri.fsPath),
				);
				return false;
			}
		}
		const environment = attachesContext ? undefined : this._getEnvironment();
		if (environment) {
			const provider = getEnvironmentWorkspaceProvider(environment, this.sessionsProvidersService.getProviders(), folderUri);
			if (!provider) {
				this.notificationService.warn(localize('workspacePicker.incompatibleEnvironment', "Choose a workspace available in {0}.", environment.label));
				return false;
			}
			if (environment.kind === 'container') {
				const available = await this.whenDevContainerWorkspaceAvailable(folderUri, provider.id);
				if (available !== true) {
					this.notificationService.warn(available === 'error'
						? localize('workspacePicker.containerCheckFailed', "Could not check Dev Container support. Try again or choose another environment.")
						: localize('workspacePicker.containerRequired', "Choose a folder with an available Dev Container configuration."));
					return false;
				}
			}
		}
		const canSelect = !this.options.canSelectWorkspace
			|| await this.options.canSelectWorkspace(folderUri, providerId);
		return canSelect && (!providerId || this._isWorkspaceProviderVisible(providerId));
	}

	/**
	 * Collects browse actions from all registered providers, scoped to the
	 * currently active tab when tabs are shown.
	 */
	protected _getAllBrowseActions(): ISessionWorkspaceBrowseAction[] {
		const environment = this._getEnvironment();
		// Local-capable providers can contribute repository sources that resolve through the selected environment.
		const providers = this.sessionsProvidersService.getProviders().filter(provider => this._isWorkspaceProviderVisible(provider.id)
			&& (!environment || environment.providerIds.includes(provider.id) || provider.supportsLocalWorkspaces));
		const all = providers.flatMap(p => p.browseActions);
		const hasLocalSupport = providers.some(provider => provider.supportsLocalWorkspaces
			&& (!environment || environment.providerIds.includes(provider.id)));
		if (hasLocalSupport) {
			all.unshift(this._localBrowseAction);
		}
		return all.filter(a =>
			(!this._isTabFiltered() || this._isGroupInActiveTab(a.group))
			&& (this._directPickerAttachesContext === undefined || Boolean(a.attachesContext) === this._directPickerAttachesContext)
		);
	}

	private _isWorkspaceProviderVisible(providerId: string): boolean {
		const provider = this.sessionsProvidersService.getProvider(providerId);
		return provider?.supportsWorkspaceSelection !== false
			&& (!provider || !isAgentHostProvider(provider) || provider.isVisibleInEnvironmentPicker?.get() !== false);
	}

	private _getEnvironment(): ISessionCreationEnvironment | undefined {
		return this._directPickerAttachesContext === true ? undefined : this.options.environment?.get();
	}

	getEnvironmentWorkspace(environment: ISessionCreationEnvironment, reader?: IReader): IResolvedFolderWorkspace | undefined {
		const resolve = (folderUri: URI): IResolvedFolderWorkspace | undefined => {
			const resolved = resolveEnvironmentWorkspace(environment, this.sessionsProvidersService.getProviders(), folderUri);
			if (!resolved || environment.kind === 'container' && this.getDevContainerWorkspaceAvailability(folderUri, resolved.provider.id) !== true) {
				return undefined;
			}
			return { providerId: resolved.provider.id, workspace: resolved.workspace };
		};
		if (!this._selectedFolderUri) {
			return undefined;
		}
		const direct = resolve(this._selectedFolderUri);
		if (direct) {
			return direct;
		}
		const repositoryId = this._getCurrentRepositoryId(reader);
		if (repositoryId) {
			for (const candidate of this._getRecentWorkspaces()) {
				for (const folder of candidate.workspace.folders) {
					const workspace = { ...candidate.workspace, folders: [folder] };
					if (this._getRepositoryIdForResolvedWorkspace({ providerId: candidate.providerId, workspace }, reader) === repositoryId) {
						const resolved = resolve(folder.root);
						if (resolved) {
							return resolved;
						}
					}
				}
			}
		}
		return undefined;
	}

	protected _useConsolidatedRemoteWorkspaces(): boolean {
		return this.configurationService.getValue<boolean>(UNIFIED_WORKSPACE_PICKER_SETTING);
	}

	private _getWorkspaceIcon(workspace: ISessionWorkspace): ThemeIcon {
		if (this._getEnvironment()?.kind === 'remote' && workspace.group === SESSION_WORKSPACE_GROUP_REMOTE && !workspace.isVirtualWorkspace) {
			return Codicon.folder;
		}
		if (this._useConsolidatedRemoteWorkspaces()) {
			if (workspace.group === SESSION_WORKSPACE_GROUP_LOCAL) {
				return Codicon.folder;
			}
			if (workspace.group === SESSION_WORKSPACE_GROUP_GITHUB) {
				return Codicon.repo;
			}
		}
		return workspace.icon;
	}

	private _getTabGroup(group: string | undefined): string | undefined {
		return this._useConsolidatedRemoteWorkspaces() && group === SESSION_WORKSPACE_GROUP_GITHUB
			? SESSION_WORKSPACE_GROUP_REMOTE
			: group;
	}

	private _isGroupInActiveTab(group: string | undefined): boolean {
		if (this._directPickerGroup !== undefined) {
			return group === this._directPickerGroup;
		}
		const availableTabs = this._getAvailableTabs();
		const activeTab = this._activeTab ?? (availableTabs.length === 1 ? availableTabs[0].id : undefined);
		return this._getTabGroup(group) === activeTab;
	}

	/**
	 * Opens a folder picker dialog and returns the chosen URI. The folder's
	 * provider is rediscovered later by the management service when the
	 * session is created — no provider quick-pick is needed here.
	 */
	private async _browseForLocalFolder(): Promise<IResolvedBrowseSelection | undefined> {
		const localProviders = this.sessionsProvidersService.getProviders().filter(p => p.supportsLocalWorkspaces);
		if (localProviders.length === 0) {
			return undefined;
		}

		const result = await this.fileDialogService.showOpenDialog({
			canSelectFolders: true,
			canSelectFiles: false,
			canSelectMany: false,
		});
		if (!result?.length) {
			return undefined;
		}

		// Resolve through any local provider so the returned ISessionWorkspace
		// carries a label/icon for the browse-action handshake; the actual
		// provider used to create the session is rediscovered at creation time.
		for (const provider of localProviders) {
			const workspace = provider.resolveWorkspace(result[0]);
			if (workspace) {
				return { workspace, providerId: provider.id };
			}
		}
		return undefined;
	}

	/** True when the picker is currently scoped to a single tab. */
	protected _isTabFiltered(): boolean {
		return this._directPickerGroup !== undefined
			|| (this._showTabs() && !!this._activeTab && this._getAvailableTabs().length > 1);
	}

	private _getActivePickerGroup(): string | undefined {
		return this._directPickerGroup ?? (this._directPickerAttachesContext !== undefined ? this._activeTab : undefined);
	}

	/**
	 * Builds the picker items list from recent workspaces.
	 *
	 * Items are shown in a flat recency-sorted list (most recently used first)
	 * without source grouping. Own recents come first, followed by VS Code
	 * recent folders.
	 */
	protected _buildItems(): IActionListItem<IWorkspacePickerItem>[] {
		const items: IActionListItem<IWorkspacePickerItem>[] = [];
		const environment = this._getEnvironment();
		const hasEnvironmentPicker = !!environment || this.options.environmentPickerEnabled?.get() === true;
		const environmentItems: IActionListItem<IWorkspacePickerItem>[] = [];
		let checkingContainers = false;
		let failedContainerChecks = false;

		// Collect recent workspaces from picker storage across all providers
		const allProviders = this.sessionsProvidersService.getProviders().filter(provider => this._isWorkspaceProviderVisible(provider.id));
		const providerIds = new Set(allProviders.map(p => p.id));
		const availableTabs = this._getAvailableTabs();
		const activeGroup = this._activeTab ?? (availableTabs.length === 1 ? availableTabs[0].id : undefined);
		let workspaceGroupAction = this.options.getWorkspaceGroupAction?.(activeGroup);
		let workspaceGroupActionGroup = activeGroup;
		if (!workspaceGroupAction && activeGroup === undefined) {
			workspaceGroupAction = this.options.getWorkspaceGroupAction?.(SESSION_WORKSPACE_GROUP_GITHUB);
			workspaceGroupActionGroup = workspaceGroupAction ? SESSION_WORKSPACE_GROUP_GITHUB : undefined;
		}
		if (!workspaceGroupAction && activeGroup === SESSION_WORKSPACE_GROUP_REMOTE && this._useConsolidatedRemoteWorkspaces()) {
			const gitHubGroupAction = this.options.getWorkspaceGroupAction?.(SESSION_WORKSPACE_GROUP_GITHUB);
			workspaceGroupAction = gitHubGroupAction ? { ...gitHubGroupAction, hideWorkspaceItems: false } : undefined;
			workspaceGroupActionGroup = workspaceGroupAction ? SESSION_WORKSPACE_GROUP_GITHUB : undefined;
		}
		const tabFilter = this._isTabFiltered()
			? (w: IResolvedFolderWorkspace) => this._isGroupInActiveTab(w.workspace.group)
			: undefined;
		const useRemoteSubmenu = !hasEnvironmentPicker && this._useConsolidatedRemoteWorkspaces() && this._directPickerGroup === undefined;
		const limitRecentWorkspaces = this._useConsolidatedRemoteWorkspaces()
			|| this.configurationService.getValue<boolean>(EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING);
		const remotePickerItem: { id: string; run?: () => void } = { id: 'workspacePicker.remote' };
		const remoteSubmenuActions: IAction[] = [];
		const remoteFilterItems: IActionListItem<IWorkspacePickerItem>[] = [];
		let devContainerActionIndex = 0;
		const setRemotePickerRun = (run: () => void): void => {
			remotePickerItem.run = run;
		};
		const createWorkspaceModeActions = (workspace: ISessionWorkspace, folderUri: URI, providerId: string, item: IWorkspacePickerItem): IAction[] | undefined => {
			if (environment || findDevContainerSample(folderUri)
				|| (workspace.group !== SESSION_WORKSPACE_GROUP_LOCAL && workspace.group !== SESSION_WORKSPACE_GROUP_REMOTE)
				|| this._isProviderUnavailable(providerId)
				|| !this._isDevContainerWorkspaceAvailable(folderUri, providerId)) {
				return undefined;
			}
			const usingDevContainer = !!this._selectedDevContainerFolderUri && this.uriIdentityService.extUri.isEqual(this._selectedDevContainerFolderUri, folderUri);
			const actionId = `workspacePicker.devContainer.${providerId}.${devContainerActionIndex++}`;
			const selectMode = (preferDevContainer: boolean): void => {
				item.preferDevContainer = preferDevContainer;
			};
			return [
				toAction({
					id: `${actionId}.host`,
					label: workspace.group === SESSION_WORKSPACE_GROUP_LOCAL
						? localize('workspacePicker.devContainer.local', "Use This Computer")
						: localize('workspacePicker.devContainer.remote', "Use Remote Host"),
					tooltip: '',
					checked: !usingDevContainer,
					run: () => selectMode(false),
				}),
				toAction({
					id: `${actionId}.container`,
					label: localize('workspacePicker.devContainer.use', "Use Dev Container"),
					tooltip: '',
					checked: usingDevContainer,
					run: () => selectMode(true),
				}),
			];
		};
		// Own recents first, then VS Code recents (merged and deduplicated by the service)
		const recentWorkspaces = this._directPickerAttachesContext === true
			? []
			: this._getRecentWorkspaces()
				.filter(w => providerIds.has(w.providerId))
				.filter(w => !tabFilter || tabFilter(w))
				.filter(w => !workspaceGroupAction?.hideWorkspaceItems || w.workspace.group !== workspaceGroupActionGroup)
				.filter(({ workspace }) => {
					if (!environment) {
						return true;
					}
					const folderUri = workspace.folders[0]?.root;
					const provider = folderUri && getEnvironmentWorkspaceProvider(environment, allProviders, folderUri);
					if (!folderUri || !provider) {
						return false;
					}
					if (environment.kind !== 'container') {
						return true;
					}
					const available = this.getDevContainerWorkspaceAvailability(folderUri, provider.id);
					checkingContainers ||= available === undefined;
					failedContainerChecks ||= available === 'error';
					return available === true;
				});
		const localRepositoryIds = this._useConsolidatedRemoteWorkspaces()
			? new Set(recentWorkspaces
				.filter(({ workspace }) => workspace.group === SESSION_WORKSPACE_GROUP_LOCAL)
				.map(workspace => this._getRepositoryIdForResolvedWorkspace(workspace))
				.filter(repositoryId => repositoryId !== undefined))
			: undefined;

		const recentWorkspaceEntries = recentWorkspaces
			.map(resolved => ({
				...resolved,
				repositoryId: this._getRepositoryIdForResolvedWorkspace(resolved),
			}))
			.filter(({ workspace, repositoryId }) =>
				workspace.group !== SESSION_WORKSPACE_GROUP_GITHUB
				|| !repositoryId
				|| !localRepositoryIds?.has(repositoryId));
		const orderByWorkspaceKind = (entries: typeof recentWorkspaceEntries) => this._useConsolidatedRemoteWorkspaces()
			? [
				...entries.filter(({ workspace }) => !ThemeIcon.isEqual(this._getWorkspaceIcon(workspace), Codicon.repo)),
				...entries.filter(({ workspace }) => ThemeIcon.isEqual(this._getWorkspaceIcon(workspace), Codicon.repo)),
			]
			: entries;
		const recentEntries = orderByWorkspaceKind(recentWorkspaceEntries.filter(entry => !entry.isSessionWorkspace));
		const orderedRecentWorkspaceEntries = [
			...recentEntries,
			...orderByWorkspaceKind(recentWorkspaceEntries.filter(entry => entry.isSessionWorkspace)),
		].slice(0, limitRecentWorkspaces ? MAX_NEW_PICKER_RECENT_WORKSPACES : undefined);

		let previousRecentWorkspaceIsRepository: boolean | undefined;
		for (const { workspace, providerId, repositoryId } of orderedRecentWorkspaceEntries) {
			const folderUri = workspace.folders[0]?.root;
			if (!folderUri) {
				continue;
			}
			const environmentProvider = environment && getEnvironmentWorkspaceProvider(environment, allProviders, folderUri);
			if (environment && !environmentProvider) {
				continue;
			}
			const icon = this._getWorkspaceIcon(workspace);
			const selected = this._isSelectedFolder(folderUri)
				|| (repositoryId !== undefined && repositoryId === this._getCurrentRepositoryId());
			const attached = this._additionalFolderSelections.has(this.uriIdentityService.extUri.getComparisonKey(folderUri))
				|| (repositoryId !== undefined && this._additionalRepositorySelections.has(repositoryId));
			const item: IWorkspacePickerItem = {
				id: `workspacePicker.workspace.${this.uriIdentityService.extUri.getComparisonKey(folderUri)}`,
				folderUri,
				providerId: environmentProvider ? environmentProvider.id : providerId,
				checked: selected || attached || undefined,
				preferDevContainer: environment?.kind === 'container' || !!findDevContainerSample(folderUri),
			};
			const modeActions = createWorkspaceModeActions(workspace, folderUri, providerId, item);
			const recentWorkspaceIsRepository = ThemeIcon.isEqual(icon, Codicon.repo);
			if (previousRecentWorkspaceIsRepository !== undefined && previousRecentWorkspaceIsRepository !== recentWorkspaceIsRepository) {
				items.push({ kind: ActionListItemKind.Separator, label: '' });
			}
			previousRecentWorkspaceIsRepository = recentWorkspaceIsRepository;
			const submenuActions = modeActions
				? [new SubmenuAction(
					`workspacePicker.devContainer.${providerId}.${devContainerActionIndex}.options`,
					'',
					modeActions,
				)]
				: undefined;
			items.push({
				kind: ActionListItemKind.Action,
				label: environmentProvider ? this._getWorkspaceLabel(workspace, environmentProvider.id) : workspace.label,
				description: workspace.description,
				group: { title: '', icon },
				disabled: this._isProviderUnavailable(providerId),
				item,
				submenuActions,
				onRemove: () => this._removeRecentWorkspace(folderUri),
			});
		}

		// Browse actions from all providers (filtered to the active tab)
		const remoteAgentHostsEnabled = this.configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId);
		const isEnvironmentFolderAction = (action: ISessionWorkspaceBrowseAction) => environment?.kind === 'remote'
			&& action.group === SESSION_WORKSPACE_GROUP_REMOTE
			&& environment.providerIds.includes(action.providerId);
		const allBrowseActions = this._getAllBrowseActions()
			.map((action, index) => ({ action, index }))
			.filter(({ action }) => remoteAgentHostsEnabled || action.group !== SESSION_WORKSPACE_GROUP_REMOTE)
			.filter(({ action }) => !workspaceGroupAction?.hideWorkspaceItems || action.group !== workspaceGroupActionGroup)
			.sort((a, b) => Number(isEnvironmentFolderAction(b.action)) - Number(isEnvironmentFolderAction(a.action)));
		// Remote providers with connection status — shown as dynamic rows in
		// the Remote tab or the unified picker.
		const remoteProviders = allProviders.filter(isAgentHostProvider).filter(p => p.connectionStatus !== undefined);
		const includeRemoteProviders = !hasEnvironmentPicker && remoteAgentHostsEnabled
			&& (activeGroup === undefined || activeGroup === SESSION_WORKSPACE_GROUP_REMOTE);
		if (items.length > 0 && (workspaceGroupAction || allBrowseActions.length > 0)) {
			items.push({ kind: ActionListItemKind.Separator, label: '' });
		}

		if (workspaceGroupAction) {
			items.push({
				kind: ActionListItemKind.Action,
				label: workspaceGroupAction.label,
				description: workspaceGroupAction.description,
				group: { title: '', icon: workspaceGroupAction.icon },
				item: { commandId: workspaceGroupAction.commandId },
			});
		}

		// Render each browse action individually. Within a tab, actions are
		// already constrained to a single category, so cross-provider
		// merging is no longer meaningful.
		let hasRepositoryAttachmentAction = false;
		allBrowseActions.forEach(({ action, index }) => {
			const isEnvironmentFolder = isEnvironmentFolderAction(action);
			const browseItems = hasEnvironmentPicker && action.group === SESSION_WORKSPACE_GROUP_REMOTE && !isEnvironmentFolder ? environmentItems : items;
			const actionIcon = isEnvironmentFolder || action === this._localBrowseAction && this._useConsolidatedRemoteWorkspaces()
				? Codicon.folder
				: action.icon;
			const actionLabel = isEnvironmentFolder || action === this._localBrowseAction
				&& this._useConsolidatedRemoteWorkspaces()
				&& this._directPickerAttachesContext !== true
				? localize('workspacePicker.openFolder', "Open Folder...")
				: this._useConsolidatedRemoteWorkspaces()
					? action.label.replace(/(?:\.\.\.|\u2026)$/, '')
					: action.label;
			const isPromotedRemoteBrowseAction = useRemoteSubmenu && action.group === SESSION_WORKSPACE_GROUP_REMOTE;
			const itemLabel = isPromotedRemoteBrowseAction ? action.description || actionLabel : actionLabel;
			const actionProvider = action.providerId ? this.sessionsProvidersService.getProvider(action.providerId) : undefined;
			const redundantEnvironmentDescription = actionProvider && environment?.providerIds.includes(actionProvider.id) && action.description === actionProvider.label;
			const browseDescription = isPromotedRemoteBrowseAction && action.description ? actionLabel : redundantEnvironmentDescription ? undefined : action.description;
			const hostDescription = actionProvider && isAgentHostProvider(actionProvider) ? actionProvider.hostDescription?.get() : undefined;
			const itemDescription = hostDescription
				? redundantEnvironmentDescription ? hostDescription : localize('workspacePicker.browseHostDescription', "{0} · {1}", browseDescription ?? actionLabel, hostDescription)
				: browseDescription;
			const isUnavailable = this._isProviderUnavailable(action.providerId);
			const isRepositoryAction = action.group === SESSION_WORKSPACE_GROUP_GITHUB && action.attachesContext !== true;
			browseItems.push({
				kind: ActionListItemKind.Action,
				label: itemLabel,
				description: itemDescription,
				group: { title: '', icon: actionIcon },
				disabled: isUnavailable,
				item: { browseActionIndex: index },
			});
			const canAttachFolder = action === this._localBrowseAction
				&& !!this._selectedFolderUri
				&& this._getActivePickerGroup() === SESSION_WORKSPACE_GROUP_LOCAL
				&& (!this._useConsolidatedRemoteWorkspaces() || this._directPickerAttachesContext === true);
			const canAttachRepository = isRepositoryAction
				&& action.supportsContextAttachment === true
				&& !!this._selectedFolderUri
				&& this._isGroupInActiveTab(SESSION_WORKSPACE_GROUP_GITHUB)
				&& !hasRepositoryAttachmentAction;
			if (canAttachFolder || canAttachRepository) {
				hasRepositoryAttachmentAction ||= canAttachRepository;
				browseItems.push({
					kind: ActionListItemKind.Action,
					label: canAttachFolder
						? this._useConsolidatedRemoteWorkspaces()
							? localize('workspacePicker.attachFolder', "Attach Folder")
							: localize('workspacePicker.attachFolderWithEllipsis', "Attach Folder...")
						: this._useConsolidatedRemoteWorkspaces()
							? localize('workspacePicker.attachRepository', "Attach Repository")
							: localize('workspacePicker.attachRepositoryWithEllipsis', "Attach Repository..."),
					description: action.description,
					group: { title: '', icon: actionIcon },
					disabled: isUnavailable,
					item: { browseActionIndex: index, attachAsContext: true },
				});
			}
		});

		if (this._directPickerAttachesContext !== true
			&& (!environment || environment.providerIds.includes(LOCAL_AGENT_HOST_PROVIDER_ID) && environment.kind !== 'cloud')
			&& (!activeGroup || activeGroup === SESSION_WORKSPACE_GROUP_LOCAL)
			&& areDevContainerSamplesEnabled(this.configurationService)
			&& allProviders.some(provider => provider.id === LOCAL_AGENT_HOST_PROVIDER_ID && isAgentHostProvider(provider))) {
			const sampleItem: { folderUri?: URI; providerId: string; preferDevContainer: boolean } = {
				providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
				preferDevContainer: true,
			};
			const filterItems = devContainerSamples.map(sample => ({
				kind: ActionListItemKind.Action,
				label: sample.name,
				description: getDevContainerSampleUrl(sample),
				group: { title: '', icon: Codicon.remote },
				item: { folderUri: devContainerSampleUri(sample), providerId: LOCAL_AGENT_HOST_PROVIDER_ID, preferDevContainer: true },
			}));
			(hasEnvironmentPicker ? environmentItems : items).push({
				kind: ActionListItemKind.Action,
				label: localize('workspacePicker.devContainer.samples', "Dev Container Sample"),
				group: { title: '', icon: Codicon.remote },
				item: sampleItem,
				submenuActions: [new SubmenuAction('workspacePicker.devContainer.samples', '', devContainerSamples.map(sample => toAction({
					id: `workspacePicker.devContainer.sample.${sample.id}`,
					label: sample.name,
					tooltip: getDevContainerSampleUrl(sample),
					run: () => { sampleItem.folderUri = devContainerSampleUri(sample); },
				})))],
				filterItems,
				openSubmenuOnClick: true,
			});
		}

		if (environmentItems.length > 0) {
			if (items.length > 0 && items[items.length - 1].kind !== ActionListItemKind.Separator) {
				items.push({ kind: ActionListItemKind.Separator, label: '' });
			}
			items.push(...environmentItems);
		}

		// Inline "Manage" entries: dynamic remote provider rows + menu-contributed
		// actions filtered by the `sessionWorkspacePickerGroup` context key.
		const manageActions: IAction[] = [];
		if (includeRemoteProviders) {
			for (const provider of remoteProviders) {
				const status = provider.connectionStatus!.get();
				const statusDescription = getRemoteHostStatusDescription(provider, status);
				const action = toAction({
					id: `workspacePicker.remote.${provider.id}`,
					label: provider.label,
					tooltip: statusDescription,
					enabled: true,
					run: () => {
						this._hidePicker();
						this._showRemoteHostOptionsDelayed(provider);
					},
				});
				const extended = action as IWorkspacePickerAction;
				extended.ariaLabel = localize('workspacePicker.remoteAriaLabel', "{0}, {1}", provider.label, statusDescription);
				extended.icon = RemoteAgentHostConnectionStatus.isIncompatible(status)
					? Codicon.warning
					: Codicon.remote;
				const lastConnectionError = this.remoteAgentHostService.connections.find(connection => connection.address === provider.remoteAddress)?.lastConnectionError;
				extended.hoverContent = getStatusHover(status, provider.remoteAddress, lastConnectionError);
				if (provider.remoteAddress && provider.canRemove !== false) {
					extended.onRemove = async () => {
						await removeRemoteHost(provider, this.remoteAgentHostService, this.configurationService);
					};
				}
				if (useRemoteSubmenu) {
					const submenuAction = toAction({
						id: action.id,
						label: localize('workspacePicker.manageRemoteHost', "Manage {0}", action.label),
						tooltip: action.tooltip,
						enabled: action.enabled,
						run: () => setRemotePickerRun(() => action.run()),
					});
					Object.assign(submenuAction, {
						icon: extended.icon,
						hoverContent: extended.hoverContent,
						onRemove: extended.onRemove,
					});
					remoteSubmenuActions.push(submenuAction);
					remoteFilterItems.push({
						kind: ActionListItemKind.Action,
						label: submenuAction.label,
						description: submenuAction.tooltip || undefined,
						group: { title: '', icon: extended.icon },
						item: { run: () => action.run(), ariaLabel: extended.ariaLabel },
						onRemove: extended.onRemove,
					});
				} else {
					manageActions.push(action);
				}
			}
		}

		const menuContextKeyService = useRemoteSubmenu
			? this.contextKeyService.createOverlay([[SessionWorkspacePickerGroupContext.key, SESSION_WORKSPACE_GROUP_REMOTE]])
			: this.contextKeyService;
		const menuActions = hasEnvironmentPicker ? [] : this.menuService.getMenuActions(Menus.SessionWorkspaceManage, menuContextKeyService, { renderShortTitle: true });
		for (const [, actions] of menuActions) {
			for (const menuAction of actions) {
				if (menuAction instanceof MenuItemAction) {
					const icon = ThemeIcon.isThemeIcon(menuAction.item.icon) ? menuAction.item.icon : undefined;
					if (useRemoteSubmenu) {
						const submenuAction = toAction({
							id: menuAction.id,
							label: menuAction.label,
							tooltip: menuAction.tooltip,
							enabled: menuAction.enabled,
							run: () => setRemotePickerRun(() => menuAction.run()),
						});
						Object.assign(submenuAction, { icon });
						remoteSubmenuActions.push(submenuAction);
						remoteFilterItems.push({
							kind: ActionListItemKind.Action,
							label: submenuAction.label,
							description: submenuAction.tooltip || undefined,
							group: { title: '', icon },
							disabled: !submenuAction.enabled,
							item: { run: () => menuAction.run() },
						});
					} else {
						manageActions.push(Object.assign(menuAction, { icon }));
					}
				}
			}
		}

		if (remoteSubmenuActions.length > 0) {
			if (items.length > 0 && items[items.length - 1].kind !== ActionListItemKind.Separator) {
				items.push({ kind: ActionListItemKind.Separator, label: '' });
			}
			items.push({
				kind: ActionListItemKind.Action,
				label: localize('workspacePicker.remote', "Remote"),
				group: { title: '', icon: Codicon.remote },
				item: remotePickerItem,
				hover: { preserveVerticalPosition: true, alignToAnchorTop: true },
				submenuActions: [new SubmenuAction('workspacePicker.remote.options', '', remoteSubmenuActions)],
				filterItems: remoteFilterItems,
				openSubmenuOnClick: true,
				submenuOptions: {
					showFilter: true,
					filterPlaceholder: localize('workspacePicker.remoteFilter', "Search Remote"),
					filterAsCombobox: true,
					focusFilterOnOpen: true,
					minWidth: 180,
					hideDefaultKeybindingTooltip: true,
					stopToolbarPointerPropagation: true,
				},
			});
		}

		if (manageActions.length > 0) {
			if (items.length > 0 && items[items.length - 1].kind !== ActionListItemKind.Separator) {
				items.push({ kind: ActionListItemKind.Separator, label: '' });
			}
			for (const action of manageActions) {
				const extended = action as IWorkspacePickerAction;
				items.push({
					kind: ActionListItemKind.Action,
					label: action.label,
					description: extended.onRemove || extended.ariaLabel ? action.tooltip || undefined : undefined,
					group: { title: '', icon: extended.icon ?? Codicon.settingsGear },
					item: { run: () => action.run(), commandId: action.id, ariaLabel: extended.ariaLabel },
					onRemove: extended.onRemove,
				});
			}
		}

		if (items.length === 0 && this._getActivePickerGroup() === SESSION_WORKSPACE_GROUP_GITHUB) {
			items.push({
				kind: ActionListItemKind.Action,
				label: localize('workspacePicker.githubLoading', "GitHub repositories are still loading"),
				group: { title: '', icon: Codicon.loading },
				disabled: true,
				item: {},
			});
		}

		if (environment?.kind === 'container' && !items.some(item => item.item?.folderUri)) {
			items.unshift({
				kind: ActionListItemKind.Action,
				label: checkingContainers
					? localize('workspacePicker.checkingContainers', "Checking Dev Container Folders...")
					: failedContainerChecks
						? localize('workspacePicker.containerChecksFailed', "Could Not Check Dev Container Folders")
						: localize('workspacePicker.noContainerFolders', "No Compatible Dev Container Folders"),
				description: localize('workspacePicker.containerFoldersHint', "Open a folder with a Dev Container configuration, or choose another environment."),
				disabled: true,
				item: {},
			});
		}
		const noWorkspaceOption = this._getNoWorkspaceOption();
		const hideNoWorkspaceOption = this._activeTriggerElement
			? this._triggerOptions.get(this._activeTriggerElement)?.hideNoWorkspaceOption === true
			: false;
		if (!noWorkspaceOption || this._directPickerAttachesContext === true || hideNoWorkspaceOption) {
			return items;
		}

		const noWorkspaceAriaDescription = this._useConsolidatedRemoteWorkspaces()
			? localize('workspacePicker.noFolderDescription', "Start the session in a temporary directory.")
			: undefined;
		const noWorkspace: IActionListItem<IWorkspacePickerItem> = {
			kind: ActionListItemKind.Action,
			label: this._getNoWorkspaceLabel(),
			description: this._useConsolidatedRemoteWorkspaces() ? undefined : noWorkspaceOption.description,
			ariaDescription: noWorkspaceAriaDescription,
			group: { title: '', icon: this._useConsolidatedRemoteWorkspaces() ? Codicon.comment : Codicon.commentDiscussion },
			item: {
				id: 'workspacePicker.chat',
				checked: noWorkspaceOption.isSelected || undefined,
				run: noWorkspaceOption.submenuActions?.length ? undefined : () => {
					noWorkspaceOption.select();
					this._updateTriggerLabel();
					this._onDidChangeSelection.fire();
				},
			},
			submenuActions: noWorkspaceOption.submenuActions ? [...noWorkspaceOption.submenuActions] : undefined,
			openSubmenuOnClick: !!noWorkspaceOption.submenuActions?.length,
			hover: this._useConsolidatedRemoteWorkspaces() && noWorkspaceOption.submenuActions?.length
				? { preserveVerticalPosition: true, alignToAnchorTop: true }
				: undefined,
		};
		return items.length > 0
			? [noWorkspace, { kind: ActionListItemKind.Separator, label: '' }, ...items]
			: [noWorkspace];
	}

	protected _getNoWorkspaceOption(): IWorkspacePickerNoWorkspaceOption | undefined {
		return this.options.getNoWorkspaceOption?.();
	}

	protected _getNoWorkspaceLabel(): string {
		return this._useConsolidatedRemoteWorkspaces()
			? localize('workspacePicker.chat', "Chat")
			: localize('workspacePicker.noWorkspace', "No workspace");
	}

	private _getSelectedNoWorkspaceLabel(): string {
		return this._getNoWorkspaceOption()?.selectedLabel ?? this._getNoWorkspaceLabel();
	}

	getEnvironmentActions(environment: ISessionCreationEnvironment): IAction[] {
		const provider = environment.kind === 'remote' && this.sessionsProvidersService.getProvider(environment.providerIds[0]);
		return provider && isAgentHostProvider(provider) ? [toAction({
			id: `environmentPicker.manage.${provider.id}`,
			label: localize('workspacePicker.manageRemoteHost', "Manage {0}", provider.label),
			run: () => {
				this.actionWidgetService.hide();
				this._showRemoteHostOptionsDelayed(provider);
			},
		})] : [];
	}

	private _showRemoteHostOptionsDelayed(provider: IAgentHostSessionsProvider): void {
		// Defer one tick so the action widget fully tears down (focus/DOM cleanup)
		// before the QuickPick opens and claims focus.
		const timeout = setTimeout(() => {
			this.instantiationService.invokeFunction(accessor => showRemoteHostOptions(accessor, provider));
		}, 1);
		this._renderDisposables.add({ dispose: () => clearTimeout(timeout) });
	}

	protected _updateTriggerLabel(): void {
		for (const trigger of this._triggerElements) {
			this._renderTriggerLabel(trigger);
		}
	}

	refreshTriggerLabel(): void {
		this._updateTriggerLabel();
	}

	protected _renderTriggerLabel(trigger: HTMLElement): void {
		const options = this._triggerOptions.get(trigger);
		const contents = this._triggerContents.get(trigger);
		if (!contents) {
			return;
		}
		if (options) {
			const reflectsWorkspace = options.reflectsWorkspace === true;
			const noWorkspaceSelected = reflectsWorkspace && this._getNoWorkspaceOption()?.isSelected === true;
			const workspace = noWorkspaceSelected ? undefined : this._selectedResolved?.workspace;
			const clearable = reflectsWorkspace && options.clearable?.get() === true;
			const canClear = clearable && workspace !== undefined;
			contents.slot.classList.toggle('workspace-clearable', canClear);
			if (contents.clearButton) {
				contents.clearButton.element.hidden = !canClear;
			}
			const isSelectedCategory = options.attachesContext !== true
				&& options.group !== undefined
				&& options.group === workspace?.group;
			const contextCount = options.group && options.attachesContext
				? Math.max(
					this._contextSelections.get(`${options.group}:context`)?.length ?? 0,
					options.group === SESSION_WORKSPACE_GROUP_GITHUB
						? this._attachedContext.filter(attachment => attachment.id.startsWith('github-context:')).length
						: 0,
				)
				: 0;
			const additionalWorkspaceCount = options.attachesContext !== true && (reflectsWorkspace || isSelectedCategory)
				? this._additionalFolderSelections.size + this._additionalRepositorySelections.size
				: 0;
			const badgeCount = Math.max(contextCount, additionalWorkspaceCount);
			const repositoryWorkspace = this._getSelectedRepositoryWorkspace();
			const relatedGitHubInfo = options.group === SESSION_WORKSPACE_GROUP_GITHUB && options.attachesContext === false
				? repositoryWorkspace?.folders.map(folder => folder.gitRepository?.gitHubInfo.get()).find(info => info !== undefined)
				: undefined;
			const hideForSelectedWorkspace = workspace !== undefined
				&& options.hideWhenWorkspaceSelected === true
				&& options.group !== workspace.group;
			const hideForMissingWorkspace = workspace === undefined && options.hideWhenNoWorkspaceSelected === true;
			const hideForMissingGitHubRepository = options.hideWhenNoGitHubRepository === true
				&& this._getCurrentRepositoryId() === undefined;
			contents.slot.toggleAttribute('hidden', hideForSelectedWorkspace || hideForMissingWorkspace || hideForMissingGitHubRepository);
			trigger.classList.toggle('selected', noWorkspaceSelected || (reflectsWorkspace && workspace !== undefined) || isSelectedCategory || badgeCount > 0 || relatedGitHubInfo !== undefined);
			const workspaceIcon = workspace ? this._getWorkspaceIcon(workspace) : undefined;
			const icon = noWorkspaceSelected
				? this._useConsolidatedRemoteWorkspaces() ? Codicon.comment : Codicon.commentDiscussion
				: (reflectsWorkspace ? workspaceIcon : undefined)
				?? (relatedGitHubInfo ? Codicon.repo : (isSelectedCategory && workspace ? workspaceIcon : options.icon));
			if (!icon || (options.hideIconWhenAttached === true && badgeCount > 0)) {
				contents.icon?.remove();
				contents.icon = undefined;
			} else {
				if (!contents.icon) {
					contents.icon = renderIcon(icon);
					trigger.prepend(contents.icon);
				}
				contents.icon.className = ThemeIcon.asClassName(icon);
			}
			const emptyLabel = reflectsWorkspace && (clearable || this.options.environment?.get())
				? localize('workspacePicker.chooseWorkspace', "Choose Workspace")
				: options.label;
			const label = noWorkspaceSelected
				? this._getSelectedNoWorkspaceLabel()
				: (reflectsWorkspace && workspace
					? this._getWorkspaceLabel(workspace, this._selectedResolved?.providerId)
					: undefined)
				?? (relatedGitHubInfo ? `${relatedGitHubInfo.owner}/${relatedGitHubInfo.repo}` : (isSelectedCategory && workspace ? this._getWorkspaceLabel(workspace, this._selectedResolved?.providerId) : emptyLabel));
			trigger.setAttribute('aria-label', badgeCount > 0
				? localize('workspacePicker.attachedContextCountAriaLabel', "{0}, {1} attached", options.ariaLabel, badgeCount)
				: label && label !== emptyLabel
					? localize('workspacePicker.categorySelectionAriaLabel', "{0}: {1}", options.label ?? options.ariaLabel, label)
					: options.ariaLabel);
			if (label) {
				contents.label ??= dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
				contents.label.textContent = label;
			} else {
				contents.label?.remove();
				contents.label = undefined;
			}
			if (badgeCount > 0) {
				contents.badge ??= new CountBadge(trigger, { count: badgeCount }, defaultCountBadgeStyles);
				contents.badge.setCount(badgeCount);
			} else {
				contents.badge?.dispose();
				contents.badge = undefined;
			}
			if (!contents.chevron) {
				contents.chevron = renderIcon(Codicon.chevronDownCompact);
				contents.chevron.classList.add('sessions-chat-dropdown-chevron');
				contents.chevron.setAttribute('aria-hidden', 'true');
			}
			trigger.append(contents.chevron);
			return;
		}

		dom.clearNode(trigger);
		const noWorkspaceSelected = this._getNoWorkspaceOption()?.isSelected === true;
		const workspace = noWorkspaceSelected ? undefined : this._selectedResolved?.workspace;
		const label = noWorkspaceSelected
			? this._getSelectedNoWorkspaceLabel()
			: workspace ? this._getWorkspaceLabel(workspace, this._selectedResolved?.providerId) : localize('pickWorkspace', "workspace");
		const icon = noWorkspaceSelected ? Codicon.commentDiscussion : workspace?.icon ?? Codicon.project;

		trigger.setAttribute('aria-label', noWorkspaceSelected
			? localize('workspacePicker.noWorkspaceSelectedAriaLabel', "New session with no workspace")
			: workspace
				? localize('workspacePicker.selectedAriaLabel', "New session in {0}", label)
				: localize('workspacePicker.pickAriaLabel', "Start by picking a workspace"));

		contents.icon = dom.append(trigger, renderIcon(icon));
		contents.label = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
		contents.label.textContent = label;
		dom.append(trigger, renderIcon(Codicon.chevronDownCompact)).classList.add('sessions-chat-dropdown-chevron');
	}

	private _getWorkspaceLabel(workspace: ISessionWorkspace, providerId: string | undefined): string {
		const environment = this.options.environment?.get();
		if (environment && providerId && environment.providerIds.includes(providerId) && !workspace.isVirtualWorkspace) {
			return workspace.folders[0]?.name ?? workspace.label;
		}
		return !this.options.environment?.get() && this._selectedDevContainerFolderUri && this.uriIdentityService.extUri.isEqual(this._selectedDevContainerFolderUri, workspace.folders[0]?.root)
			? localize('workspacePicker.devContainer.label', "{0} - Dev Container", workspace.label)
			: workspace.label;
	}

	private _isDevContainerWorkspaceAvailable(folderUri: URI, providerId: string): boolean {
		return this.getDevContainerWorkspaceAvailability(folderUri, providerId) === true;
	}

	async whenDevContainerWorkspaceAvailable(folderUri: URI, providerId: string): Promise<boolean | 'error'> {
		const provider = this._getDevContainerProvider(folderUri, providerId);
		if (!provider) {
			return false;
		}
		const key = `${provider.id}:${this.uriIdentityService.extUri.getComparisonKey(folderUri)}`;
		if (this._devContainerAvailability.get(key) === 'error') {
			this._devContainerAvailability.delete(key);
		}
		const available = this.getDevContainerWorkspaceAvailability(folderUri, provider.id);
		return available ?? await this._devContainerAvailability.get(key) ?? false;
	}

	private _getDevContainerProvider(folderUri: URI, providerId: string): IAgentHostSessionsProvider | undefined {
		let provider = this.sessionsProvidersService.getProvider(providerId);
		if (!provider || !isAgentHostProvider(provider) || !provider.isDevContainerWorkspaceAvailable) {
			provider = this.sessionsProvidersService.getProviders().find(candidate =>
				isAgentHostProvider(candidate)
				&& !!candidate.isDevContainerWorkspaceAvailable
				&& candidate.resolveWorkspace(folderUri)?.group === SESSION_WORKSPACE_GROUP_LOCAL
			);
		}
		return provider && isAgentHostProvider(provider) && provider.isDevContainerWorkspaceAvailable ? provider : undefined;
	}

	getDevContainerWorkspaceAvailability(folderUri: URI, providerId: string): boolean | 'error' | undefined {
		const provider = this._getDevContainerProvider(folderUri, providerId);
		if (!provider) {
			return false;
		}
		const key = `${provider.id}:${this.uriIdentityService.extUri.getComparisonKey(folderUri)}`;
		const cached = this._devContainerAvailability.get(key);
		if (typeof cached === 'boolean' || cached === 'error') {
			return cached;
		}
		if (cached) {
			return undefined;
		}
		const availability = this._devContainerAvailabilityLimiter.queue(() => provider.isDevContainerWorkspaceAvailable!(folderUri))
			.catch(error => {
				onUnexpectedError(error);
				return 'error' as const;
			});
		this._devContainerAvailability.set(key, availability);
		void availability.then(available => {
			if (this._devContainerAvailability.get(key) !== availability) {
				return;
			}
			this._devContainerAvailability.set(key, available);
			this._onDidChangeDevContainerAvailability.fire();
			this._devContainerAvailabilityRefresh.schedule();
		});
		return undefined;
	}

	private _clearDevContainerAvailability(refreshVisiblePicker = false): void {
		this._devContainerAvailability.clear();
		this._devContainerAvailabilityLimiter.clear();
		this._devContainerAvailabilityRefresh.cancel();
		this._onDidChangeDevContainerAvailability.fire();
		if (refreshVisiblePicker) {
			this._devContainerAvailabilityRefresh.schedule();
		}
	}

	/**
	 * Returns whether the given provider is a remote that is currently unavailable
	 * (incompatible, or disconnected/still connecting without on-demand connect).
	 * Returns false for providers without connection status (e.g. local providers).
	 */
	protected _isProviderUnavailable(providerId: string): boolean {
		const provider = this.sessionsProvidersService.getProvider(providerId);
		if (!provider || !isAgentHostProvider(provider) || !provider.connectionStatus) {
			return false;
		}
		const connectionStatus = provider.connectionStatus.get();
		return !isAgentHostEnvironmentAvailable(provider)
			|| RemoteAgentHostConnectionStatus.isIncompatible(connectionStatus)
			|| (!RemoteAgentHostConnectionStatus.isConnected(connectionStatus) && !provider.canConnectOnDemand);
	}

	private async _connectProviderOnDemand(providerId: string): Promise<boolean> {
		const provider = this.sessionsProvidersService.getProvider(providerId);
		if (!provider || !isAgentHostProvider(provider) || !provider.connectionStatus) {
			return true;
		}
		const connectionStatus = provider.connectionStatus.get();
		if (RemoteAgentHostConnectionStatus.isConnected(connectionStatus)) {
			return true;
		}
		if (RemoteAgentHostConnectionStatus.isIncompatible(connectionStatus) || !provider.canConnectOnDemand || !provider.connect) {
			return false;
		}
		const initialMessage = localize('workspacePicker.connectingRemoteAgentHost', "Connecting to {0}...", provider.label);
		const handle = this.notificationService.notify({
			severity: Severity.Info,
			message: initialMessage,
			progress: { infinite: true },
		});
		status(initialMessage);
		const progressListener = provider.onDidReportConnectProgress?.(progress => {
			if (!provider.remoteAddress || progress.connectionKey === provider.remoteAddress) {
				handle.updateMessage(progress.message);
				status(progress.message);
			}
		});
		let connected = false;
		try {
			await provider.connect();
			connected = RemoteAgentHostConnectionStatus.isConnected(provider.connectionStatus.get());
		} catch {
		} finally {
			progressListener?.dispose();
			handle.close();
		}
		if (connected) {
			return true;
		}
		const message = localize('workspacePicker.connectRemoteAgentHostFailed', "Failed to connect to {0}.", provider.label);
		this.notificationService.error(message);
		status(message);
		return false;
	}

	protected _isSelectedFolder(folderUri: URI | undefined): boolean {
		if (this._getNoWorkspaceOption()?.isSelected || !this._selectedFolderUri || !folderUri) {
			return false;
		}
		return this.uriIdentityService.extUri.isEqual(this._selectedFolderUri, folderUri);
	}

	private _restoreSelectedWorkspace(): IRestoredWorkspaceSelection | undefined {
		if (!this._canRestoreWorkspace()) {
			return undefined;
		}

		// Try the checked entry first
		const checked = this._restoreCheckedWorkspace();
		if (checked && this._canRestoreProviderWorkspace(checked.providerId)) {
			return {
				resolved: checked,
				source: NewSessionWorkspacePreselectionSource.CheckedWorkspace,
				origin: WorkspaceSelectionOrigin.CheckedWorkspace,
			};
		}

		// Agents-owned recents are ordered before VS Code's general recents.
		try {
			for (const recent of this.recentWorkspacesService.getRecentWorkspaces()) {
				const folderUri = recent.workspace.folders[0]?.root;
				if (!folderUri || !this._canRestoreProviderWorkspace(recent.providerId) || isWorktreeWorkspaceUri(folderUri) || this._isProviderUnavailable(recent.providerId)) {
					continue;
				}
				return {
					resolved: recent,
					source: NewSessionWorkspacePreselectionSource.RecentWorkspace,
					origin: recent.source === 'agents' ? WorkspaceSelectionOrigin.AgentsRecent
						: recent.source === 'vscodeWorkspace' ? WorkspaceSelectionOrigin.VSCodeWorkspace : WorkspaceSelectionOrigin.VSCodeRecent,
				};
			}
			return undefined;
		} catch {
			return undefined;
		}
	}

	protected _resetAutomaticSelection(): void {
		this._selectionGeneration++;
		this._sessionRestoreGeneration++;
		this._userHasPicked = false;
		this._connectionStatusWatch.clear();
		this._applySelection(undefined);
		this._updateTriggerLabel();
		this._onDidChangeSelection.fire();
		this._onDidSelectWorkspace.fire(undefined);
		this._sessionWorkspaceFallback?.refreshProviders();
		this._restoreAutomaticSelection();
	}

	/** Re-runs automatic selection and reports whether it changed synchronously. */
	refreshAutomaticSelection(): boolean {
		return this._restoreAutomaticSelection();
	}

	/** Waits for history and the latest session-workspace lookup and reports whether both completed successfully. */
	async whenWorkspaceRestored(token: CancellationToken): Promise<boolean> {
		if (!this._userHasPicked) {
			await waitForState(this.recentWorkspacesService.historyLoadState, state => state !== 'loading', undefined, token);
			while (!this._userHasPicked && this._sessionRestoreState.get()?.state === 'pending') {
				await waitForState(this._sessionRestoreState, state => state?.state !== 'pending', undefined, token);
			}
		}
		return this.recentWorkspacesService.historyLoadState.get() === 'loaded'
			&& this._sessionRestoreState.get()?.state === 'completed';
	}

	private _restoreAutomaticSelection(): boolean {
		if (this._userHasPicked || !this._canRestoreWorkspace()) {
			return false;
		}
		const restored = this._restoreSelectedWorkspace();
		if (!restored) {
			if (!this._selectedFolderUri || this._preselectionSource === NewSessionWorkspacePreselectionSource.ExistingSessions) {
				this._scheduleSessionWorkspaceRestore();
			}
			return false;
		}
		this._sessionRestoreGeneration++;
		if (this._isSelectedFolder(restored.resolved.workspace.folders[0]?.root)) {
			this._selectedResolved = restored.resolved;
			this._preselectionSource = restored.source;
			return false;
		}
		this._applySelection(restored.resolved, restored.source, restored.origin);
		this._updateTriggerLabel();
		this._onDidChangeSelection.fire();
		this._onDidSelectWorkspace.fire(this._selectedFolderUri);
		this._watchForConnectionFailure(restored.resolved);
		return true;
	}

	private _scheduleSessionWorkspaceRestore(): void {
		if (!this._sessionWorkspaceFallback || this._userHasPicked || !this._canRestoreWorkspace()) {
			return;
		}
		const restoreGeneration = ++this._sessionRestoreGeneration;
		const selectionGeneration = this._selectionGeneration;
		this._sessionRestoreState.set({ generation: restoreGeneration, selectionGeneration, state: 'pending' }, undefined);
		void this._sessionWorkspaceFallback.findWorkspace().then(restored => {
			if (this._sessionRestoreState.get()?.generation === restoreGeneration) {
				this._sessionRestoreState.set({ generation: restoreGeneration, selectionGeneration, state: 'completed' }, undefined);
			}
			if (restoreGeneration !== this._sessionRestoreGeneration
				|| selectionGeneration !== this._selectionGeneration
				|| this._userHasPicked
				|| !this._canRestoreWorkspace()) {
				return;
			}
			if (this._restoreSelectedWorkspace()) {
				this._restoreAutomaticSelection();
				return;
			}
			if (!restored) {
				if (this._preselectionSource === NewSessionWorkspacePreselectionSource.ExistingSessions) {
					this._applySelection(undefined);
					this._updateTriggerLabel();
					this._onDidChangeSelection.fire();
					this._onDidSelectWorkspace.fire(undefined);
				}
				return;
			}
			const folderUri = restored.workspace.folders[0]?.root;
			if (this._isSelectedFolder(folderUri)) {
				this._selectedResolved = restored;
				this._preselectionSource = NewSessionWorkspacePreselectionSource.ExistingSessions;
				return;
			}
			this._applySelection(restored, NewSessionWorkspacePreselectionSource.ExistingSessions, WorkspaceSelectionOrigin.ExistingSessions);
			this._updateTriggerLabel();
			this._onDidChangeSelection.fire();
			this._onDidSelectWorkspace.fire(this._selectedFolderUri);
			this._watchForConnectionFailure(restored);
		}).catch(error => {
			if (this._sessionRestoreState.get()?.generation === restoreGeneration) {
				this._sessionRestoreState.set({ generation: restoreGeneration, selectionGeneration, state: 'error' }, undefined);
			}
			onUnexpectedError(error);
		});
	}

	private _canRestoreProviderWorkspace(providerId: string): boolean {
		return this._isWorkspaceProviderVisible(providerId)
			&& (!this.options.sessionWorkspaceProviderFilter || this.options.sessionWorkspaceProviderFilter(providerId));
	}

	private _canRestoreWorkspace(): boolean {
		return !this.isNoWorkspaceSelected() && (this.options.canRestoreWorkspace?.() ?? true);
	}

	/**
	 * Restore only the checked (previously selected) workspace if any
	 * provider can resolve its URI. The provider's connection status is
	 * intentionally NOT checked — we honor the user's explicit pick even
	 * if the remote is still connecting or currently disconnected. The
	 * trigger label reflects the connection state separately
	 * (spinner / grayed).
	 */
	private _restoreCheckedWorkspace(): IResolvedFolderWorkspace | undefined {
		try {
			return this.recentWorkspacesService.getRecentWorkspaces(false).find(recent => {
				const folderUri = recent.workspace.folders[0]?.root;
				return recent.checked && !!folderUri && !isWorktreeWorkspaceUri(folderUri);
			});
		} catch {
			return undefined;
		}
	}

	/**
	 * When restoring a workspace whose provider isn't currently Connected,
	 * watch the connection status. Fires `onDidSelectWorkspace(undefined)`
	 * (which the view pane converts to `unsetNewSession()`) if:
	 *   - the status transitions to Disconnected after we start watching, or
	 *   - the status is still not Connected after a short grace period.
	 *
	 * The grace period covers a race: provider state can transition synchronously
	 * inside provider registration before our autorun's first read, so we may
	 * never observe an explicit Disconnected transition. The timer ensures we
	 * eventually fall back instead of leaving the picker showing an unreachable
	 * remote with no session.
	 *
	 * Has no effect once the user makes an explicit pick (`_userHasPicked`).
	 */
	private _watchForConnectionFailure(resolved: IResolvedFolderWorkspace): void {
		const provider = this.sessionsProvidersService.getProvider(resolved.providerId);
		if (!provider || !isAgentHostProvider(provider) || !provider.connectionStatus) {
			return;
		}
		const connStatus = provider.connectionStatus;
		if (RemoteAgentHostConnectionStatus.isConnected(connStatus.get())) {
			return;
		}

		const folderUri = resolved.workspace.folders[0]?.root;
		if (!folderUri) {
			return;
		}

		const store = new DisposableStore();
		this._connectionStatusWatch.value = store;

		const fallback = () => {
			this._connectionStatusWatch.clear();
			if (!this._userHasPicked && this._isSelectedFolder(folderUri)) {
				this._selectedFolderUri = undefined;
				this._selectedResolved = undefined;
				this._preselectionSource = NewSessionWorkspacePreselectionSource.None;
				this._selectionOrigin = WorkspaceSelectionOrigin.None;
				this._updateTriggerLabel();
				this._onDidChangeSelection.fire();
				this._onDidSelectWorkspace.fire(undefined);
			}
		};

		let isFirstRun = true;
		store.add(autorun(reader => {
			const status = connStatus.read(reader);
			const isBusy = RemoteAgentHostConnectionStatus.isConnecting(status)
				|| RemoteAgentHostConnectionStatus.isReconnecting(status);
			if (RemoteAgentHostConnectionStatus.isConnected(status)) {
				this._connectionStatusWatch.clear();
			} else if (!isBusy && !isFirstRun) {
				fallback();
			}
			isFirstRun = false;
		}));

		// Safety net: if the connection hasn't succeeded by the grace period,
		// fall back. Catches the case where the provider's status flips before
		// our autorun subscribes (so we never observe a transition).
		disposableTimeout(() => {
			if (!RemoteAgentHostConnectionStatus.isConnected(connStatus.get())) {
				fallback();
			}
		}, RESTORE_CONNECT_GRACE_MS, store);
	}

	// -- Recent workspaces (sessions' own history) --

	protected _getRecentWorkspaces(): IResolvedFolderWorkspace[] {
		const recentWorkspaces = this.recentWorkspacesService.getRecentWorkspaces(true, this._useConsolidatedRemoteWorkspaces())
			.filter(workspace => this._isWorkspaceProviderVisible(workspace.providerId));
		const seen = new Set(recentWorkspaces.map(({ workspace }) =>
			this.uriIdentityService.extUri.getComparisonKey(workspace.folders[0]?.root ?? workspace.uri)));
		const sessionWorkspaces = (this._sessionWorkspaceFallback?.getWorkspaces() ?? []).filter(({ workspace }) => {
			const key = this.uriIdentityService.extUri.getComparisonKey(workspace.folders[0]?.root ?? workspace.uri);
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});
		return [...recentWorkspaces, ...sessionWorkspaces];
	}

	protected _removeRecentWorkspace(folderUri: URI): void {
		this.recentWorkspacesService.removeRecentWorkspace(folderUri, this._useConsolidatedRemoteWorkspaces());

		// Clear current selection if it was the removed workspace
		if (this._isSelectedFolder(folderUri)) {
			this.options.onUserSelection?.();
			this._hidePicker();
			this._selectedFolderUri = undefined;
			this._selectedResolved = undefined;
			this._preselectionSource = NewSessionWorkspacePreselectionSource.None;
			this._selectionOrigin = WorkspaceSelectionOrigin.None;
			this._updateTriggerLabel();
			this._onDidSelectWorkspace.fire(undefined);
		}
	}

}
