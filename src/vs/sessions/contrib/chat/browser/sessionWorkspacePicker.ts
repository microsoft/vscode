/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import * as touch from '../../../../base/browser/touch.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem, IActionListOptions } from '../../../../platform/actionWidget/browser/actionList.js';
import { ITabDescriptor, TabbedActionListWidget } from '../../../../platform/actionWidget/browser/tabbedActionListWidget.js';
import { IMenuService, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TUNNEL_ADDRESS_PREFIX } from '../../../../platform/agentHost/common/tunnelAgentHost.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, IContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IGitHubInfo, ISessionWorkspace, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE } from '../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService, isWorktreeWorkspaceUri } from '../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { SessionWorkspacePickerGroupContext } from '../../../common/contextkeys.js';
// eslint-disable-next-line local/code-import-patterns -- TODO: move remote host options out of providers
import { getStatusHover, getStatusLabel, removeRemoteHost, showRemoteHostOptions } from '../../providers/remoteAgentHost/browser/remoteHostOptions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { reportNewChatPickerClosed } from './newChatPickerTelemetry.js';
import { Menus } from '../../../browser/menus.js';
import { markOnboardingTarget } from '../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { NewSessionWorkspacePreselectionSource } from './newSessionComposerService.js';
import { type IResolvedFolderWorkspace, SessionWorkspaceFallback } from './sessionWorkspaceFallback.js';

export type { IResolvedFolderWorkspace } from './sessionWorkspaceFallback.js';

const FILTER_THRESHOLD = 10;

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

/**
 * Item type used in the action list.
 */
export interface IWorkspacePickerItem {
	readonly folderUri?: URI;
	/** The resolved workspace (used for unavailable-provider checks). */
	readonly providerId?: string;
	readonly browseActionIndex?: number;
	readonly checked?: boolean;
	/** Command to execute when this item is selected. */
	readonly commandId?: string;
	/** Inline action to run when this item is selected. */
	readonly run?: () => void;
}

export interface IWorkspacePickerOptions {
	readonly canSelectWorkspace?: (folderUri: URI, providerId: string | undefined) => Promise<boolean>;
	readonly canRestoreWorkspace?: () => boolean;
	readonly restoreFromSessions?: boolean;
	readonly sessionWorkspaceProviderFilter?: (providerId: string) => boolean;
	readonly getWorkspaceGroupAction?: (group: string | undefined) => IWorkspacePickerGroupAction | undefined;
}

export interface IWorkspacePickerGroupAction {
	readonly label: string;
	readonly description?: string;
	readonly icon: ThemeIcon;
	readonly commandId: string;
	readonly hideWorkspaceItems?: boolean;
}

export interface IWorkspacePickerTrigger {
	readonly label?: string;
	readonly ariaLabel: string;
	readonly icon: ThemeIcon;
	readonly group?: string;
	readonly attachesContext?: boolean;
	readonly hideWhenWorkspaceSelected?: boolean;
	readonly hideWhenNoWorkspaceSelected?: boolean;
	readonly hideWhenNoGitHubRepository?: boolean;
	readonly selectedWorkspace?: ISessionWorkspace;
	readonly remove?: () => void;
	readonly removeAriaLabel?: string;
}

interface IResolvedBrowseSelection {
	readonly workspace: ISessionWorkspace;
	readonly providerId: string;
}

interface IBrowsedWorkspaceSelection extends IResolvedBrowseSelection {
	readonly action: ISessionWorkspaceBrowseAction;
}

interface IRestoredWorkspaceSelection {
	readonly resolved: IResolvedFolderWorkspace;
	readonly source: NewSessionWorkspacePreselectionSource;
}

interface IWorkspacePickerTriggerElements {
	icon?: HTMLElement;
	label?: HTMLElement;
}

type IWorkspacePickerAction = IAction & { icon?: ThemeIcon; hoverContent?: string; onRemove?: () => void };

/**
 * A unified workspace picker that shows workspaces from all registered session
 * providers in a single dropdown.
 *
 * Browse actions from providers are appended at the bottom of the list.
 */
export class WorkspacePicker extends Disposable {

	protected readonly _onDidSelectWorkspace = this._register(new Emitter<URI | undefined>());
	readonly onDidSelectWorkspace: Event<URI | undefined> = this._onDidSelectWorkspace.event;
	protected readonly _onDidChangeSelection = this._register(new Emitter<void>());
	readonly onDidChangeSelection: Event<void> = this._onDidChangeSelection.event;
	private readonly _onDidSelectContext = this._register(new Emitter<ISessionWorkspace>());
	readonly onDidSelectContext: Event<ISessionWorkspace> = this._onDidSelectContext.event;
	private readonly _onDidSelectFolderContext = this._register(new Emitter<URI>());
	readonly onDidSelectFolderContext: Event<URI> = this._onDidSelectFolderContext.event;

	private _selectedFolderUri: URI | undefined;
	private _selectedResolved: IResolvedFolderWorkspace | undefined;
	private _preselectionSource = NewSessionWorkspacePreselectionSource.None;
	private _selectionGeneration = 0;
	private _sessionRestoreGeneration = 0;
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
	private readonly _localBrowseAction: ISessionWorkspaceBrowseAction = {
		label: localize('workspacePicker.browseSelectLocal', "Select..."),
		group: SESSION_WORKSPACE_GROUP_LOCAL,
		icon: Codicon.folderOpened,
		providerId: '',
		run: async () => (await this._browseForLocalFolder())?.workspace,
	};
	private readonly _localAddBrowseAction: ISessionWorkspaceBrowseAction = {
		...this._localBrowseAction,
		label: localize('workspacePicker.browseAddLocal', "Add Folder..."),
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
	private readonly _additionalRepositoryTriggerDisposables = this._register(new DisposableStore());
	private readonly _additionalRepositorySelections = new Map<string, ISessionWorkspace>();
	private readonly _additionalFolderTriggerDisposables = this._register(new DisposableStore());
	private readonly _additionalFolderSelections = new Map<string, IResolvedFolderWorkspace>();
	private readonly _tabbedWidget: TabbedActionListWidget;
	private readonly _pickerGroupContext: IContextKey<string>;
	private _activeTriggerElement: HTMLElement | undefined;
	private _categoryRow: HTMLElement | undefined;
	private _folderTriggerOptions: IWorkspacePickerTrigger | undefined;
	private _repositoryTriggerOptions: IWorkspacePickerTrigger | undefined;
	private _repositoryTriggerSlot: HTMLElement | undefined;
	private _repositoryContextTriggerSlot: HTMLElement | undefined;
	protected _directPickerGroup: string | undefined;
	protected _directPickerAttachesContext: boolean | undefined;

	/**
	 * Currently active workspace tab (a group label contributed by a
	 * provider, e.g. `"Local"` / `"Cloud"` / `"Remote"`).
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
		return [...this._additionalRepositorySelections.values()];
	}

	clearAttachedContext(): void {
		if (this._additionalFolderSelections.size === 0 && this._additionalRepositorySelections.size === 0) {
			return;
		}
		this._additionalFolderSelections.clear();
		this._additionalRepositorySelections.clear();
		this._renderAdditionalFolderTriggers();
		this._renderAdditionalRepositoryTriggers();
		this._onDidChangeSelection.fire();
	}

	syncAttachedContextIds(attachmentIds: ReadonlySet<string>): void {
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
		if (changed) {
			this._updateTriggerLabel();
			this._onDidChangeSelection.fire();
		}
	}

	get preselectionSource(): NewSessionWorkspacePreselectionSource {
		return this._preselectionSource;
	}

	constructor(
		private readonly options: IWorkspacePickerOptions,
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
	) {
		super();

		this._tabbedWidget = this._register(this.instantiationService.createInstance(TabbedActionListWidget));
		this._pickerGroupContext = SessionWorkspacePickerGroupContext.bindTo(this.contextKeyService);
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
		if (this._sessionWorkspaceFallback) {
			this._register(this._sessionWorkspaceFallback.onDidChange(() => this._restoreAutomaticSelection()));
		}

		// Restore selected workspace from storage
		const restored = this._restoreSelectedWorkspace();
		this._applySelection(restored?.resolved, restored?.source);
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
			this._sessionWorkspaceFallback?.refreshProviders();
			if (this._selectedFolderUri) {
				// Re-resolve in case the previous resolving provider was removed.
				const reresolved = this._resolveFolder(this._selectedFolderUri);
				if (!reresolved) {
					this._selectedFolderUri = undefined;
					this._selectedResolved = undefined;
					this._preselectionSource = NewSessionWorkspacePreselectionSource.None;
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
			const activeTrigger = this._activeTriggerElement;
			if (activeTrigger && (this.actionWidgetService.isVisible || this._tabbedWidget.isVisible)) {
				this.showPicker(true, activeTrigger, this._directPickerGroup, this._directPickerAttachesContext);
			}
		}));

		// VS Code's recent-workspace history is loaded asynchronously.
		this._register(this.recentWorkspacesService.onDidChangeRecentWorkspaces(() => {
			this._restoreAutomaticSelection();
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
	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-workspace-picker'));
		this._renderDisposables.add({ dispose: () => slot.remove() });
		this._renderDisposables.add(this._addTrigger(slot));

		return slot;
	}

	renderCategoryTriggers(container: HTMLElement, triggers: readonly IWorkspacePickerTrigger[], label?: string): HTMLElement {
		this._renderDisposables.clear();
		this._additionalRepositoryTriggerDisposables.clear();
		this._additionalFolderTriggerDisposables.clear();
		const row = dom.append(container, dom.$('.sessions-workspace-category-picker'));
		this._categoryRow = row;
		this._renderDisposables.add({ dispose: () => row.remove() });
		this._renderDisposables.add({
			dispose: () => {
				this._categoryRow = undefined;
				this._folderTriggerOptions = undefined;
				this._repositoryTriggerOptions = undefined;
				this._repositoryTriggerSlot = undefined;
				this._repositoryContextTriggerSlot = undefined;
			},
		});
		if (label) {
			const rowLabel = dom.append(row, dom.$('span.sessions-workspace-category-picker-label'));
			rowLabel.textContent = label;
		}
		for (const options of triggers) {
			const slot = dom.append(row, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot'));
			if (options.group === SESSION_WORKSPACE_GROUP_LOCAL) {
				this._folderTriggerOptions = options;
			} else if (options.group === SESSION_WORKSPACE_GROUP_GITHUB && options.attachesContext === false) {
				this._repositoryTriggerOptions = options;
				this._repositoryTriggerSlot = slot;
			} else if (options.group === SESSION_WORKSPACE_GROUP_GITHUB && options.attachesContext === true) {
				this._repositoryContextTriggerSlot = slot;
			}
			this._renderDisposables.add(this._addTrigger(slot, options));
		}
		this._renderAdditionalFolderTriggers();
		this._renderAdditionalRepositoryTriggers();

		return row;
	}

	/**
	 * Shared trigger-creation core for {@link render}. Wires up the click /
	 * keyboard / touch handlers and the per-trigger lifecycle.
	 */
	private _addTrigger(slot: HTMLElement, options?: IWorkspacePickerTrigger): IDisposable {
		const triggerDisposables = new DisposableStore();

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		trigger.setAttribute('aria-haspopup', 'listbox');
		trigger.setAttribute('aria-expanded', 'false');

		this._triggerElements.add(trigger);
		this._triggerContents.set(trigger, {});
		if (options) {
			this._triggerOptions.set(trigger, options);
		}
		this._triggerElement = trigger;
		this._renderTriggerLabel(trigger);
		if (options?.remove && options.removeAriaLabel) {
			slot.classList.add('has-remove-action');
			const removeButton = dom.append(slot, dom.$<HTMLButtonElement>('button.sessions-workspace-picker-remove'));
			removeButton.type = 'button';
			removeButton.setAttribute('aria-label', options.removeAriaLabel);
			const removeIcon = dom.append(removeButton, renderIcon(Codicon.closeCompact));
			removeIcon.setAttribute('aria-hidden', 'true');
			triggerDisposables.add(dom.addDisposableListener(removeButton, dom.EventType.CLICK, e => {
				dom.EventHelper.stop(e, true);
				options.remove?.();
			}));
		}
		// Onboarding spotlight target — id is referenced by the "new session" tour
		// in vs/sessions/contrib/onboardingTours.
		triggerDisposables.add(markOnboardingTarget(trigger, 'sessions.newSession.workspacePicker', {
			open: () => this.showPicker(false, trigger, options?.group, options?.attachesContext),
		}));

		triggerDisposables.add(touch.Gesture.addTarget(trigger));
		[dom.EventType.CLICK, touch.EventType.Tap].forEach(eventType => {
			triggerDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
				dom.EventHelper.stop(e, true);
				this.showPicker(false, trigger, options?.group, options?.attachesContext);
			}));
		});
		triggerDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this.showPicker(false, trigger, options?.group, options?.attachesContext);
			}
		}));

		triggerDisposables.add({
			dispose: () => {
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
			const selectedGroup = this._selectedResolved?.workspace.group;
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
	}

	protected _setDirectPickerFilter(group: string | undefined, attachesContext: boolean | undefined): void {
		this._directPickerGroup = group;
		this._directPickerAttachesContext = attachesContext;
		if (group !== undefined) {
			this._selectWorkspaceGroup(group);
		}
	}

	/**
	 * Subclasses may opt out of the categorical tab bar (e.g. when scoped to
	 * a single host).
	 */
	protected _showTabs(): boolean {
		return true;
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
			if (provider.supportsLocalWorkspaces && !byLabel.has(SESSION_WORKSPACE_GROUP_LOCAL)) {
				byLabel.set(SESSION_WORKSPACE_GROUP_LOCAL, { id: SESSION_WORKSPACE_GROUP_LOCAL });
			}
			for (const action of provider.browseActions) {
				if (action.group === SESSION_WORKSPACE_GROUP_REMOTE && !remoteAgentHostsEnabled) {
					continue;
				}
				if (action.group && !byLabel.has(action.group)) {
					byLabel.set(action.group, { id: action.group });
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

	private _buildListOptions(items: readonly IActionListItem<IWorkspacePickerItem>[], pickerWidth: number | undefined): IActionListOptions {
		const showFilter = items.filter(i => i.kind === ActionListItemKind.Action).length > FILTER_THRESHOLD;
		return showFilter
			? { showFilter: true, filterPlaceholder: localize('workspacePicker.filter', "Search Workspaces..."), reserveSubmenuSpace: false, inlineDescription: true, showGroupTitleOnFirstItem: true, minWidth: pickerWidth, maxWidth: pickerWidth, hideDefaultKeybindingTooltip: true }
			: { reserveSubmenuSpace: false, inlineDescription: true, showGroupTitleOnFirstItem: true, minWidth: pickerWidth, maxWidth: pickerWidth, hideDefaultKeybindingTooltip: true };
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
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('workspacePicker.ariaLabel', "Workspace Picker"),
			},
			this._buildListOptions(items, undefined),
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
			getAriaLabel: (item: IActionListItem<IWorkspacePickerItem>) => item.label ?? '',
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
				return { items, listOptions: { inlineDescription: true, showGroupTitleOnFirstItem: true, hideDefaultKeybindingTooltip: true } };
			},
			delegate,
			accessibilityProvider,
			width: TABBED_PICKER_WIDTH,
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
		if (item.browseActionIndex !== undefined) {
			const selection = await this._executeBrowseAction(item.browseActionIndex);
			const folderUri = selection?.workspace.folders[0]?.root;
			if (!folderUri || generation !== this._selectionGeneration) {
				return false;
			}
			if (!await this._canSelectWorkspace(folderUri, selection.providerId)) {
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
				if (this._selectedFolderUri) {
					return true;
				}
			}
			if (action?.group === SESSION_WORKSPACE_GROUP_GITHUB
				&& action.attachesContext !== true
				&& this._attachAdditionalRepository(selection.workspace, selection.providerId)) {
				return true;
			}
			if (action === this._localAddBrowseAction) {
				this._attachAdditionalFolder(folderUri, selection.providerId);
				return true;
			}
			const relatedWorkspace = this._findRelatedLocalWorkspace(selection.workspace);
			this._selectFolder(
				relatedWorkspace?.workspace.folders[0]?.root ?? folderUri,
				true,
				relatedWorkspace?.providerId ?? selection.providerId,
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
			const resolved = this._resolveFolder(item.folderUri, item.providerId);
			if (resolved?.workspace.group === SESSION_WORKSPACE_GROUP_GITHUB
				&& this._attachAdditionalRepository(resolved.workspace, resolved.providerId)) {
				return true;
			}
			this._selectFolder(item.folderUri, true, item.providerId);
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
			this._renderAdditionalFolderTriggers();
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
		if (repositoryId !== this._getCurrentRepositoryId() && !this._additionalRepositorySelections.has(repositoryId)) {
			this._additionalRepositorySelections.set(repositoryId, workspace);
			this.recentWorkspacesService.addRecentWorkspace(workspace.folders[0].root, providerId, false);
			this._renderAdditionalRepositoryTriggers();
			this._onDidChangeSelection.fire();
		}
		return true;
	}

	private _findRelatedLocalWorkspace(workspace: ISessionWorkspace): IResolvedFolderWorkspace | undefined {
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

	private _getRepositoryId(workspace: ISessionWorkspace): string | undefined {
		const info = workspace.folders
			.map(folder => folder.gitRepository?.gitHubInfo.get())
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

	private _getCurrentRepositoryId(): string | undefined {
		const workspace = this._getSelectedRepositoryWorkspace();
		return workspace && this._getRepositoryId(workspace);
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
	setSelectedWorkspace(folderUri: URI, options?: { fireEvent?: boolean; providerId?: string; persist?: boolean }): void {
		this._selectFolder(
			folderUri,
			options?.fireEvent ?? true,
			options?.providerId,
			options?.persist ?? true,
			NewSessionWorkspacePreselectionSource.ProvidedWorkspace,
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
		this._selectionGeneration++;
		this._hidePicker();
		this._userHasPicked = true;
		this._connectionStatusWatch.clear();
		this._selectedFolderUri = undefined;
		this._selectedResolved = undefined;
		this._preselectionSource = NewSessionWorkspacePreselectionSource.None;
		if (this._shouldPersistSelection()) {
			this.recentWorkspacesService.clearCheckedWorkspace();
		}
		this._updateTriggerLabel();
		this._onDidChangeSelection.fire();
		this._onDidSelectWorkspace.fire(undefined);
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
	): void {
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
		const removedAdditionalFolder = this._additionalFolderSelections.delete(this.uriIdentityService.extUri.getComparisonKey(folderUri));
		const repositoryId = resolved && this._getRepositoryIdForResolvedWorkspace(resolved);
		const removedAdditionalRepository = repositoryId ? this._additionalRepositorySelections.delete(repositoryId) : false;
		if (removedAdditionalFolder) {
			this._renderAdditionalFolderTriggers();
		}
		if (removedAdditionalRepository) {
			this._renderAdditionalRepositoryTriggers();
		}
		this._selectedFolderUri = folderUri;
		this._selectedResolved = resolved;
		this._watchSelectedGitHubInfo();
		this._preselectionSource = source;
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
	private _applySelection(resolved: IResolvedFolderWorkspace | undefined, source = NewSessionWorkspacePreselectionSource.None): void {
		this._selectedResolved = resolved;
		this._selectedFolderUri = resolved?.workspace.folders[0]?.root;
		this._watchSelectedGitHubInfo();
		this._preselectionSource = resolved ? source : NewSessionWorkspacePreselectionSource.None;
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

	private _getSelectedRepositoryWorkspace(): ISessionWorkspace | undefined {
		return this._getSelectedRepositoryWorkspaceCandidates().find(workspace => this._getRepositoryId(workspace) !== undefined);
	}

	private _getSelectedRepositoryWorkspaceCandidates(): ISessionWorkspace[] {
		if (!this._selectedResolved || !this._selectedFolderUri) {
			return [];
		}
		return this._getRepositoryWorkspaceCandidates(this._selectedResolved);
	}

	private _getRepositoryIdForResolvedWorkspace(selection: IResolvedFolderWorkspace): string | undefined {
		for (const workspace of this._getRepositoryWorkspaceCandidates(selection)) {
			const repositoryId = this._getRepositoryId(workspace);
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
	 * Executes a browse action from a provider, identified by index.
	 */
	private async _executeBrowseAction(actionIndex: number): Promise<IBrowsedWorkspaceSelection | undefined> {
		const allActions = this._getAllBrowseActions();
		const action = allActions[actionIndex];
		if (!action) {
			return undefined;
		}

		try {
			if (action === this._localBrowseAction || action === this._localAddBrowseAction) {
				const selection = await this._browseForLocalFolder();
				return selection ? { ...selection, action } : undefined;
			}
			const workspace = await action.run(this._getSelectedRepositoryWorkspace() ?? this._selectedResolved?.workspace);
			return workspace ? { workspace, providerId: action.providerId, action } : undefined;
		} catch {
			// browse action was cancelled or failed
		}
		return undefined;
	}

	private async _canSelectWorkspace(folderUri: URI, providerId: string | undefined): Promise<boolean> {
		return !this.options.canSelectWorkspace
			|| await this.options.canSelectWorkspace(folderUri, providerId);
	}

	/**
	 * Collects browse actions from all registered providers, scoped to the
	 * currently active tab when tabs are shown.
	 */
	protected _getAllBrowseActions(): ISessionWorkspaceBrowseAction[] {
		const all = this.sessionsProvidersService.getProviders().flatMap(p => p.browseActions);
		const hasLocalSupport = this.sessionsProvidersService.getProviders().some(p => p.supportsLocalWorkspaces);
		if (hasLocalSupport) {
			all.unshift(...(this._selectedFolderUri && this._directPickerGroup === SESSION_WORKSPACE_GROUP_LOCAL
				? [this._localAddBrowseAction]
				: [this._localBrowseAction]));
		}
		if (!this._isTabFiltered()) {
			return all;
		}
		return all.filter(a =>
			a.group === this._activeTab
			&& (this._directPickerAttachesContext === undefined || Boolean(a.attachesContext) === this._directPickerAttachesContext)
		);
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

	/**
	 * Builds the picker items list from recent workspaces.
	 *
	 * Items are shown in a flat recency-sorted list (most recently used first)
	 * without source grouping. Own recents come first, followed by VS Code
	 * recent folders.
	 */
	protected _buildItems(): IActionListItem<IWorkspacePickerItem>[] {
		const items: IActionListItem<IWorkspacePickerItem>[] = [];

		// Collect recent workspaces from picker storage across all providers
		const allProviders = this.sessionsProvidersService.getProviders();
		const providerIds = new Set(allProviders.map(p => p.id));
		const availableTabs = this._getAvailableTabs();
		const activeGroup = this._activeTab ?? (availableTabs.length === 1 ? availableTabs[0].id : undefined);
		const workspaceGroupAction = this.options.getWorkspaceGroupAction?.(activeGroup);
		const tabFilter = this._isTabFiltered()
			? (w: IResolvedFolderWorkspace) => w.workspace.group === this._activeTab
			: undefined;
		// Own recents first, then VS Code recents (merged and deduplicated by the service)
		const recentWorkspaces = workspaceGroupAction?.hideWorkspaceItems
			? []
			: this._directPickerAttachesContext === true
				? []
				: this._getRecentWorkspaces()
					.filter(w => providerIds.has(w.providerId))
					.filter(w => !tabFilter || tabFilter(w));

		// Build flat list in recency order (no source grouping)
		for (const { workspace, providerId } of recentWorkspaces) {
			const folderUri = workspace.folders[0]?.root;
			if (!folderUri) {
				continue;
			}
			const repositoryId = this._getRepositoryIdForResolvedWorkspace({ workspace, providerId });
			const selected = this._isSelectedFolder(folderUri)
				|| (repositoryId !== undefined && repositoryId === this._getCurrentRepositoryId());
			const attached = this._additionalFolderSelections.has(this.uriIdentityService.extUri.getComparisonKey(folderUri))
				|| (repositoryId !== undefined && this._additionalRepositorySelections.has(repositoryId));
			items.push({
				kind: ActionListItemKind.Action,
				label: workspace.label,
				description: workspace.description,
				group: { title: '', icon: workspace.icon },
				disabled: this._isProviderUnavailable(providerId),
				item: { folderUri, providerId, checked: selected || attached || undefined },
				onRemove: () => this._removeRecentWorkspace(folderUri),
			});
		}

		// Browse actions from all providers (filtered to the active tab)
		const allBrowseActions = workspaceGroupAction?.hideWorkspaceItems ? [] : this._getAllBrowseActions();
		// Remote providers with connection status — shown as dynamic rows
		// in the Manage submenu on the Remote tab.
		const remoteProviders = allProviders.filter(isAgentHostProvider).filter(p => p.connectionStatus !== undefined);
		const includeRemoteProviders = this._activeTab === SESSION_WORKSPACE_GROUP_REMOTE;
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
		allBrowseActions.forEach((action, index) => {
			const provider = allProviders.find(p => p.id === action.providerId);
			const agentHostProvider = provider && isAgentHostProvider(provider) ? provider : undefined;
			const connectionStatus = agentHostProvider?.connectionStatus?.get();
			// `incompatible` always disables the action — the user can't fix
			// a protocol mismatch by clicking. Otherwise, if the provider
			// supports connect-on-demand (e.g. WSL boots the distro on first
			// browse), keep the action live even while disconnected.
			const isIncompatible = RemoteAgentHostConnectionStatus.isIncompatible(connectionStatus);
			const isUnavailable = isIncompatible
				|| (!!connectionStatus
					&& !RemoteAgentHostConnectionStatus.isConnected(connectionStatus)
					&& !agentHostProvider?.canConnectOnDemand);
			const isRepositoryAction = action.group === SESSION_WORKSPACE_GROUP_GITHUB && action.attachesContext !== true;
			if (isRepositoryAction && this._selectedFolderUri && this._directPickerGroup === SESSION_WORKSPACE_GROUP_GITHUB) {
				items.push({
					kind: ActionListItemKind.Action,
					label: localize('workspacePicker.addRepository', "Add Repository..."),
					description: action.description,
					group: { title: '', icon: action.icon },
					disabled: isUnavailable,
					item: { browseActionIndex: index },
				});
			} else {
				items.push({
					kind: ActionListItemKind.Action,
					label: action.label,
					description: action.description,
					group: { title: '', icon: action.icon },
					disabled: isUnavailable,
					item: { browseActionIndex: index },
				});
			}
		});

		// Inline "Manage" entries: dynamic remote provider rows (scoped to
		// the Remote tab) + menu-contributed actions (filtered by the
		// `sessionWorkspacePickerGroup` context key).
		const manageActions: IAction[] = [];
		if (includeRemoteProviders) {
			for (const provider of remoteProviders) {
				const status = provider.connectionStatus!.get();
				const isTunnel = provider.remoteAddress?.startsWith(TUNNEL_ADDRESS_PREFIX);
				const action = toAction({
					id: `workspacePicker.remote.${provider.id}`,
					label: provider.label,
					tooltip: getStatusLabel(status),
					enabled: true,
					run: () => {
						this._hidePicker();
						this._showRemoteHostOptionsDelayed(provider);
					},
				});
				const extended = action as IWorkspacePickerAction;
				extended.icon = RemoteAgentHostConnectionStatus.isIncompatible(status)
					? Codicon.warning
					: (isTunnel ? Codicon.cloud : Codicon.remote);
				extended.hoverContent = getStatusHover(status, provider.remoteAddress);
				if (provider.remoteAddress) {
					extended.onRemove = async () => {
						await removeRemoteHost(provider, this.remoteAgentHostService);
					};
				}
				manageActions.push(action);
			}
		}

		const menuActions = this.menuService.getMenuActions(Menus.SessionWorkspaceManage, this.contextKeyService, { renderShortTitle: true });
		for (const [, actions] of menuActions) {
			for (const menuAction of actions) {
				if (menuAction instanceof MenuItemAction) {
					const icon = ThemeIcon.isThemeIcon(menuAction.item.icon) ? menuAction.item.icon : undefined;
					manageActions.push(Object.assign(menuAction, { icon }));
				}
			}
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
					description: extended.onRemove ? action.tooltip || undefined : undefined,
					group: { title: '', icon: extended.icon ?? Codicon.settingsGear },
					item: { run: () => action.run(), commandId: action.id },
					onRemove: extended.onRemove,
				});
			}
		}

		if (items.length === 0 && this._directPickerGroup === SESSION_WORKSPACE_GROUP_GITHUB) {
			items.push({
				kind: ActionListItemKind.Action,
				label: localize('workspacePicker.githubLoading', "GitHub repositories are still loading"),
				group: { title: '', icon: Codicon.loading },
				disabled: true,
				item: {},
			});
		}

		return items;
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

	private _renderAdditionalRepositoryTriggers(): void {
		this._additionalRepositoryTriggerDisposables.clear();
		if (!this._categoryRow || !this._repositoryTriggerOptions) {
			return;
		}
		for (const workspace of this._additionalRepositorySelections.values()) {
			const slot = dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot');
			this._categoryRow.insertBefore(slot, this._repositoryContextTriggerSlot ?? null);
			this._additionalRepositoryTriggerDisposables.add({ dispose: () => slot.remove() });
			this._additionalRepositoryTriggerDisposables.add(this._addTrigger(slot, {
				...this._repositoryTriggerOptions,
				label: workspace.label,
				ariaLabel: localize('workspacePicker.attachedRepositoryAriaLabel', "Attached repository {0}", workspace.label),
				selectedWorkspace: workspace,
				remove: () => this._removeAdditionalRepository(workspace),
				removeAriaLabel: localize('workspacePicker.removeAttachedRepository', "Remove attached repository {0}", workspace.label),
			}));
		}
	}

	private _removeAdditionalRepository(workspace: ISessionWorkspace): void {
		const repositoryId = this._getRepositoryId(workspace);
		if (!repositoryId || !this._additionalRepositorySelections.delete(repositoryId)) {
			return;
		}
		this._renderAdditionalRepositoryTriggers();
		this._updateTriggerLabel();
		this._onDidChangeSelection.fire();
		this._focusCategoryTrigger(this._repositoryTriggerOptions);
	}

	private _renderAdditionalFolderTriggers(): void {
		this._additionalFolderTriggerDisposables.clear();
		if (!this._categoryRow || !this._folderTriggerOptions) {
			return;
		}
		for (const selection of this._additionalFolderSelections.values()) {
			const slot = dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot');
			this._categoryRow.insertBefore(slot, this._repositoryTriggerSlot ?? null);
			this._additionalFolderTriggerDisposables.add({ dispose: () => slot.remove() });
			this._additionalFolderTriggerDisposables.add(this._addTrigger(slot, {
				...this._folderTriggerOptions,
				label: selection.workspace.label,
				ariaLabel: localize('workspacePicker.attachedFolderAriaLabel', "Attached folder {0}", selection.workspace.label),
				selectedWorkspace: selection.workspace,
				remove: () => this._removeAdditionalFolder(selection.workspace.folders[0].root),
				removeAriaLabel: localize('workspacePicker.removeAttachedFolder', "Remove attached folder {0}", selection.workspace.label),
			}));
		}
	}

	private _removeAdditionalFolder(folderUri: URI): void {
		const key = this.uriIdentityService.extUri.getComparisonKey(folderUri);
		if (!this._additionalFolderSelections.delete(key)) {
			return;
		}
		this._renderAdditionalFolderTriggers();
		this._onDidChangeSelection.fire();
		this._focusCategoryTrigger(this._folderTriggerOptions);
	}

	private _focusCategoryTrigger(options: IWorkspacePickerTrigger | undefined): void {
		for (const [trigger, triggerOptions] of this._triggerOptions) {
			if (triggerOptions === options) {
				trigger.focus();
				return;
			}
		}
	}

	protected _renderTriggerLabel(trigger: HTMLElement): void {
		const options = this._triggerOptions.get(trigger);
		const contents = this._triggerContents.get(trigger);
		if (!contents) {
			return;
		}
		if (options) {
			const workspace = this._selectedResolved?.workspace;
			const isSelectedCategory = options.attachesContext !== true
				&& options.group !== undefined
				&& options.group === workspace?.group;
			const contextCount = options.group && options.attachesContext
				? this._contextSelections.get(`${options.group}:context`)?.length ?? 0
				: 0;
			const repositoryWorkspace = this._getSelectedRepositoryWorkspace();
			const relatedGitHubInfo = options.group === SESSION_WORKSPACE_GROUP_GITHUB && options.attachesContext === false
				? repositoryWorkspace?.folders.map(folder => folder.gitRepository?.gitHubInfo.get()).find(info => info !== undefined)
				: undefined;
			const selectedWorkspace = options.selectedWorkspace;
			const hideForSelectedWorkspace = workspace !== undefined
				&& options.hideWhenWorkspaceSelected === true
				&& options.group !== workspace.group;
			const hideForMissingWorkspace = workspace === undefined && options.hideWhenNoWorkspaceSelected === true;
			const hideForMissingGitHubRepository = workspace !== undefined
				&& options.hideWhenNoGitHubRepository === true
				&& this._getCurrentRepositoryId() === undefined;
			trigger.parentElement?.toggleAttribute('hidden', hideForSelectedWorkspace || hideForMissingWorkspace || hideForMissingGitHubRepository);
			trigger.classList.toggle('selected', selectedWorkspace !== undefined || isSelectedCategory || contextCount > 0 || relatedGitHubInfo !== undefined);
			const icon = selectedWorkspace?.icon
				?? (contextCount > 0 ? Codicon.attach : undefined)
				?? (relatedGitHubInfo ? Codicon.repo : (isSelectedCategory && workspace ? workspace.icon : options.icon));
			if (!contents.icon) {
				contents.icon = renderIcon(icon);
				trigger.prepend(contents.icon);
			}
			contents.icon.className = ThemeIcon.asClassName(icon);
			const label = selectedWorkspace?.label
				?? (contextCount > 0 ? localize('workspacePicker.attachedContextCount', "Attached {0}", contextCount) : undefined)
				?? (relatedGitHubInfo ? `${relatedGitHubInfo.owner}/${relatedGitHubInfo.repo}` : (isSelectedCategory && workspace ? workspace.label : options.label));
			trigger.setAttribute('aria-label', label && label !== options.label && !selectedWorkspace
				? localize('workspacePicker.categorySelectionAriaLabel', "{0}: {1}", options.label ?? options.ariaLabel, label)
				: options.ariaLabel);
			if (label) {
				contents.label ??= dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
				contents.label.textContent = label;
			} else {
				contents.label?.remove();
				contents.label = undefined;
			}
			return;
		}

		dom.clearNode(trigger);
		const workspace = this._selectedResolved?.workspace;
		const label = workspace ? workspace.label : localize('pickWorkspace', "workspace");
		const icon = workspace ? workspace.icon : Codicon.project;

		trigger.setAttribute('aria-label', workspace
			? localize('workspacePicker.selectedAriaLabel', "New session in {0}", label)
			: localize('workspacePicker.pickAriaLabel', "Start by picking a workspace"));

		contents.icon = dom.append(trigger, renderIcon(icon));
		contents.label = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
		contents.label.textContent = label;
		dom.append(trigger, renderIcon(Codicon.chevronDownCompact)).classList.add('sessions-chat-dropdown-chevron');
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
		return RemoteAgentHostConnectionStatus.isIncompatible(connectionStatus)
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
		if (!this._selectedFolderUri || !folderUri) {
			return false;
		}
		return this.uriIdentityService.extUri.isEqual(this._selectedFolderUri, folderUri);
	}

	private _restoreSelectedWorkspace(): IRestoredWorkspaceSelection | undefined {
		// Try the checked entry first
		const checked = this._restoreCheckedWorkspace();
		if (checked && this._canRestoreProviderWorkspace(checked.providerId)) {
			return {
				resolved: checked,
				source: NewSessionWorkspacePreselectionSource.CheckedWorkspace,
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
		this._applySelection(restored.resolved, restored.source);
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
		void this._sessionWorkspaceFallback.findWorkspace().then(restored => {
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
			this._applySelection(restored, NewSessionWorkspacePreselectionSource.ExistingSessions);
			this._updateTriggerLabel();
			this._onDidChangeSelection.fire();
			this._onDidSelectWorkspace.fire(this._selectedFolderUri);
			this._watchForConnectionFailure(restored);
		}).catch(onUnexpectedError);
	}

	private _canRestoreProviderWorkspace(providerId: string): boolean {
		return !this.options.sessionWorkspaceProviderFilter || this.options.sessionWorkspaceProviderFilter(providerId);
	}

	private _canRestoreWorkspace(): boolean {
		return this.options.canRestoreWorkspace?.() ?? true;
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
				this._updateTriggerLabel();
				this._onDidChangeSelection.fire();
				this._onDidSelectWorkspace.fire(undefined);
			}
		};

		let isFirstRun = true;
		store.add(autorun(reader => {
			const status = connStatus.read(reader);
			if (RemoteAgentHostConnectionStatus.isConnected(status)) {
				this._connectionStatusWatch.clear();
			} else if ((RemoteAgentHostConnectionStatus.isDisconnected(status) || RemoteAgentHostConnectionStatus.isIncompatible(status)) && !isFirstRun) {
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
		return this.recentWorkspacesService.getRecentWorkspaces();
	}

	protected _removeRecentWorkspace(folderUri: URI): void {
		this.recentWorkspacesService.removeRecentWorkspace(folderUri);

		// Clear current selection if it was the removed workspace
		if (this._isSelectedFolder(folderUri)) {
			this._hidePicker();
			this._selectedFolderUri = undefined;
			this._selectedResolved = undefined;
			this._preselectionSource = NewSessionWorkspacePreselectionSource.None;
			this._updateTriggerLabel();
			this._onDidSelectWorkspace.fire(undefined);
		}
	}

}
