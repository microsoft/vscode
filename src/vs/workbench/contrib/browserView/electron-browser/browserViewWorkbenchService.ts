/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserViewChangeEvent, BrowserViewEventData, BrowserViewCommandId, BrowserViewPresentation, BrowserViewSessionSelector, BrowserViewStorageScope, getBrowserViewRemoteFile, getBrowserViewSessionAffinity, getBrowserViewSessionNetwork, IBrowserViewEditorOpenOptions, IBrowserViewInfo, IBrowserViewNetwork, IBrowserViewOwner, IBrowserViewNetworkFileSystem, IBrowserViewRemoteNetwork, IBrowserViewService, IBrowserViewTheme, ipcBrowserViewChannelName, reviveBrowserViewInfo, IBrowserViewSessionOptions, toBrowserViewSessionOptions } from '../../../../platform/browserView/common/browserView.js';
import { matchesBrowserViewSandboxSession } from '../../../../platform/browserView/common/browserViewGroup.js';
import { BrowserRemoteProxyEnabledSettingId, BrowserViewEventEmitters, createBrowserViewEventEmitters, BrowserViewSharingState, IBrowserViewWorkbenchService, IBrowserViewModel, BrowserViewModel, IBrowserViewContextualFilter, IBrowserViewFilterContext, IBrowserViewOpenHandler, IBrowserViewWorkbenchCreateOptions, IBrowserViewNetworkProxyProvider, IBrowserViewNetworkResolver, IBrowserViewNetworkStatus, IBrowserViewSessionRequest, normalizeBrowserViewUrl } from '../common/browserView.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, IEditorService, PreferredGroup, SIDE_GROUP, USE_MODAL_EDITOR_SETTING, UseModalEditorMode } from '../../../services/editor/common/editorService.js';
import { getWindowById } from '../../../../base/browser/dom.js';
import { IUnattendedRestartService } from '../../../services/lifecycle/common/unattendedRestart.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { BrowserEditorInput, IBrowserEditorInputData } from '../common/browserEditorInput.js';
import { getWindowMainPart, GroupsOrder, IEditorGroup, IEditorGroupsService, preferredSideBySideGroupDirection } from '../../../services/editor/common/editorGroupsService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { ChatConfiguration } from '../../chat/common/constants.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { contrastBorder, descriptionForeground, focusBorder } from '../../../../platform/theme/common/colors/baseColors.js';
import { buttonForeground, buttonBackground, inputPlaceholderForeground } from '../../../../platform/theme/common/colors/inputColors.js';
import { editorWidgetBackground, editorWidgetBorder, editorWidgetForeground, toolbarHoverBackground, widgetShadow } from '../../../../platform/theme/common/colors/editorColors.js';
import { DEFAULT_FONT_FAMILY } from '../../../../base/browser/fonts.js';
import { findGroup, handOffFromSelfTitledEditor } from '../../../services/editor/common/editorGroupFinder.js';
import { ChatEditorInput } from '../../chat/browser/widgetHosts/editor/chatEditorInput.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { URI } from '../../../../base/common/uri.js';
import { extUri, isEqual } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { getCopilotRootPaths } from '../../../../platform/environment/common/copilotHome.js';
import { ICopilotHomeService } from '../../../services/environment/common/copilotHomeService.js';
import { localChatSessionType } from '../../chat/common/chatSessionsService.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { FileSystemProviderCapabilities, IFileService } from '../../../../platform/files/common/files.js';
import { AGENT_HOST_SCHEME } from '../../../../platform/agentHost/common/agentHostUri.js';
import { ITunnelProxyInfo } from '../../../../platform/tunnel/common/tunnelProxy.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { DeferredPromise, raceCancellationError, raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource, cancelOnDispose } from '../../../../base/common/cancellation.js';
import { AgentNetworkDomainSettingId } from '../../../../platform/networkFilter/common/settings.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { ILabelService } from '../../../../platform/label/common/label.js';

export const BrowserMaxHistoryEntriesSettingId = 'workbench.browser.maxHistoryEntries';
export const BrowserNewTabPlacementSettingId = 'workbench.browser.newTabPlacement';
const OPEN_BROWSER_NAVIGATION_TIMEOUT_MS = 30_000;
/** How long creation waits for the local extension host to provide network proxies. */
const NETWORK_PROXY_PROVIDER_TIMEOUT_MS = 30_000;

/** How long creation waits for a network's host to report whether it supports proxying. */
const NETWORK_SUPPORT_TIMEOUT_MS = 10_000;

/** A network in use, and its proxy once started. */
interface INetworkProxyEntry {
	readonly authority: string;
	/** How many views and holds need the network, whether or not its proxy is ready. */
	references: number;
	/** The proxy published to main. */
	info?: ITunnelProxyInfo;
	/** The pending start (or restart) of the proxy. */
	starting?: Promise<void>;
}

/**
 * Where new integrated browser tabs are opened.
 * - `activeGroup`: the currently active editor group (default).
 * - `sideGroup`: a dedicated editor group to the side, locked so that other editors are not opened into it.
 * - `window`: a dedicated auxiliary window, locked so that other editors are not opened into it.
 */
export type BrowserNewTabPlacement = 'activeGroup' | 'sideGroup' | 'window';

/** The placement kinds that resolve to a new group. */
type DedicatedGroupPlacement = Exclude<BrowserNewTabPlacement, 'activeGroup'>;

/** Command IDs whose accelerators are shown in browser view context menus. */
const browserViewContextMenuCommands = [
	BrowserViewCommandId.GoBack,
	BrowserViewCommandId.GoForward,
	BrowserViewCommandId.Reload,
];

export class BrowserViewWorkbenchService extends Disposable implements IBrowserViewWorkbenchService {
	declare readonly _serviceBrand: undefined;

	private readonly _browserViewService: IBrowserViewService;
	private readonly _known = new Map<string, BrowserEditorInput>();
	private readonly _remoteEvents = this._register(new DisposableMap<string, IDisposable & { emitters: BrowserViewEventEmitters }>());
	private readonly _contextualFilters = new Set<IBrowserViewContextualFilter>();
	private readonly _openHandlers = new Set<IBrowserViewOpenHandler>();
	private readonly _mainWindowId: number;
	private readonly _browserViewsReady = new DeferredPromise<void>();

	private _networkResolver: IBrowserViewNetworkResolver | undefined;
	private readonly _onDidChangeNetworkStatus = this._register(new Emitter<void>());
	readonly onDidChangeNetworkStatus: Event<void> = this._onDidChangeNetworkStatus.event;
	private _networkProxyProvider: IBrowserViewNetworkProxyProvider | undefined;
	private readonly _onDidRegisterNetworkProxyProvider = this._register(new Emitter<void>());
	/** Proxies of the remote networks in use, keyed by authority. */
	private readonly _networkProxies = new Map<string, INetworkProxyEntry>();
	private readonly _disposeToken = cancelOnDispose(this._store);

	/**
	 * In-flight creation of the dedicated browser window group, used to coalesce
	 * concurrent requests so we don't spawn multiple auxiliary windows. The group
	 * itself is not tracked in memory: it is rediscovered dynamically via
	 * {@link _findDedicatedGroup} so that it survives window reloads.
	 */
	private _dedicatedWindowGroupPromise: Promise<IEditorGroup> | undefined;

	private readonly _onDidChangeBrowserViews = this._register(new Emitter<void>());
	readonly onDidChangeBrowserViews: Event<void> = this._onDidChangeBrowserViews.event;

	private static readonly _sharingAvailableContext = ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ContextKeyExpr.has(`config.${ChatConfiguration.AgentEnabled}`),
		ContextKeyExpr.has(`config.workbench.browser.enableChatTools`),
		// If we're in Sessions Window, we require some additional conditions.
		ContextKeyExpr.or(
			IsSessionsWindowContext.negate(),
			ContextKeyExpr.or(
				ContextKeyExpr.equals('sessionType', localChatSessionType),
				ContextKeyExpr.equals('sessions.isAgentHostSession', true),
			),
		),
	)!;

	private _isSharingAvailable: boolean = false;

	private readonly _onDidChangeSharingAvailable = this._register(new Emitter<boolean>());
	readonly onDidChangeSharingAvailable: Event<boolean> = this._onDidChangeSharingAvailable.event;

	get isSharingAvailable(): boolean {
		return this._isSharingAvailable;
	}

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceTrustEnablementService private readonly workspaceTrustEnablementService: IWorkspaceTrustEnablementService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@ICopilotHomeService private readonly copilotHomeService: ICopilotHomeService,
		@IThemeService private readonly themeService: IThemeService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILabelService private readonly labelService: ILabelService,
		@IFileService private readonly fileService: IFileService,
		@IUnattendedRestartService unattendedRestartService: IUnattendedRestartService,
	) {
		super();
		const channel = mainProcessService.getChannel(ipcBrowserViewChannelName);
		this._browserViewService = ProxyChannel.toService<IBrowserViewService>(channel);
		this._mainWindowId = mainWindow.vscodeWindowId;

		// A restart reloads every live page, which loses its state (e.g. form input or an ephemeral login)
		this._register(unattendedRestartService.registerParticipant({
			check: () => this._remoteEvents.size > 0 ? 'browser.livePage' : undefined
		}));

		// Send the full per-window configuration as a single unit, and resend it
		// whenever any of its inputs change.
		void this._updateWindowConfiguration();
		const chatEnabledKeys = new Set(ChatContextKeys.enabled.keys());
		this._register(this.keybindingService.onDidUpdateKeybindings(() => void this._updateWindowConfiguration()));
		this._register(this.themeService.onDidColorThemeChange(() => void this._updateWindowConfiguration()));
		this._register(this.accessibilityService.onDidChangeReducedMotion(() => void this._updateWindowConfiguration()));
		this._register(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => void this._updateWindowConfiguration()));
		this._register(this.workspaceTrustManagementService.onDidChangeTrust(() => void this._updateWindowConfiguration()));
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => void this._updateWindowConfiguration()));
		this._register(Event.any<{ readonly scheme: string }>(this.fileService.onDidChangeFileSystemProviderRegistrations, this.fileService.onDidChangeFileSystemProviderCapabilities)(e => {
			if (e.scheme === Schemas.vscodeRemote) {
				void this._updateWindowConfiguration();
			}
		}));
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(chatEnabledKeys)) {
				void this._updateWindowConfiguration();
			}
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(AgentNetworkDomainSettingId.NetworkFilter)
				&& this.configurationService.getValue<boolean>(AgentNetworkDomainSettingId.NetworkFilter)
				&& [...this._known.values()].some(input => input.model?.sharingState === BrowserViewSharingState.Shared && !input.model.isDirectlyShareable)
			) {
				this.notificationService.info(localize('browser.networkFilteringEnabled', "Agent access to browser tabs was revoked because network filtering was enabled."));
			}
			if (e.affectsConfiguration(BrowserMaxHistoryEntriesSettingId) || e.affectsConfiguration(BrowserRemoteProxyEnabledSettingId)) {
				void this._updateWindowConfiguration();
			}
		}));

		// Track sharing availability from context keys
		this._isSharingAvailable = this.contextKeyService.contextMatchesRules(BrowserViewWorkbenchService._sharingAvailableContext);
		const sharingKeys = new Set(BrowserViewWorkbenchService._sharingAvailableContext.keys());
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(sharingKeys)) {
				const was = this._isSharingAvailable;
				this._isSharingAvailable = this.contextKeyService.contextMatchesRules(BrowserViewWorkbenchService._sharingAvailableContext);
				if (was !== this._isSharingAvailable) {
					this._onDidChangeSharingAvailable.fire(this._isSharingAvailable);
				}
			}
		}));

		this._register(this._browserViewService.onDynamicBrowserViewEvent(this._mainWindowId)(([event, screenshots]) => {
			if (event.type === 'snapshot') {
				try {
					for (const [index, info] of event.views.entries()) {
						if (info.presentation === BrowserViewPresentation.Listed) {
							this._createModel(reviveBrowserViewInfo(info, screenshots[index]));
						}
					}
					void this._browserViewsReady.complete();
				} catch (error) {
					void this._browserViewsReady.error(error);
				}
				return;
			}
			if (event.type === 'created') {
				const e = event.data;
				if (e.info.presentation === BrowserViewPresentation.Unlisted) {
					return;
				}
				this._createModel(reviveBrowserViewInfo(e.info, screenshots[0]), e.initialUrl ?? this._known.get(e.info.id)?.url);
				const editor = this._known.get(e.info.id);
				if (editor && e.editorOpenRequest) {
					void this._openEditorForCreatedView(editor, e.info.owner, e.editorOpenRequest).catch(error => {
						this.logService.error('[BrowserViewWorkbenchService] Failed to open editor for created browser view.', error);
					});
				}
			} else {
				this._dispatchEvent(event);
			}
		}));
		void this._browserViewsReady.p.catch(error => {
			this.logService.error('[BrowserViewWorkbenchService] Failed to initialize browser view event stream.', error);
		});
	}

	resolveNetwork(owner: IBrowserViewOwner): IBrowserViewNetwork | undefined {
		if (!this._isNetworkProxyEnabled()) {
			return undefined;
		}
		return this._resolveNetwork(owner) ?? undefined;
	}

	/** The owner's network, whether or not views may use it; `null` when the owner is unknown. */
	private _resolveNetwork(owner: IBrowserViewOwner): IBrowserViewNetwork | null | undefined {
		if (this._networkResolver) {
			return this._networkResolver.resolveNetwork(owner);
		}
		const remoteAuthority = this.environmentService.remoteAuthority;
		return remoteAuthority ? { authority: remoteAuthority } : undefined;
	}

	async acquireNetwork(network: IBrowserViewNetwork): Promise<IReference<IBrowserViewNetwork | undefined>> {
		if (!await this._isNetworkSupported(network)) {
			return { object: undefined, dispose: () => { } };
		}
		const reference = this._acquireNetworkReference(network.authority);
		try {
			await this._whenNetworkProxyReady(reference.object);
		} catch (error) {
			this.logService.error(`[BrowserViewWorkbenchService] Failed to start proxy for network ${network.authority}.`, error);
		}
		return { object: network, dispose: () => reference.dispose() };
	}

	getNetworkStatus(network: IBrowserViewNetwork): IBrowserViewNetworkStatus {
		if (network.authority === this.environmentService.remoteAuthority) {
			// The window's remote connection always supports proxying.
			return { label: this.labelService.getHostLabel(Schemas.vscodeRemote, network.authority) || network.authority, connected: true, proxySupported: true };
		}
		return this._networkResolver?.getNetworkStatus(network) ?? { label: network.authority, connected: false, proxySupported: undefined };
	}

	registerNetworkResolver(resolver: IBrowserViewNetworkResolver): IDisposable {
		if (this._networkResolver) {
			throw new Error('A browser network resolver is already registered');
		}
		this._networkResolver = resolver;
		const statusListener = resolver.onDidChangeNetworkStatus(() => this._onDidChangeNetworkStatus.fire());
		const fileAccessListener = resolver.onDidChangeFileAccess?.(() => void this._updateWindowConfiguration());
		this._onDidChangeNetworkStatus.fire();
		void this._updateWindowConfiguration();
		return toDisposable(() => {
			statusListener.dispose();
			fileAccessListener?.dispose();
			if (this._networkResolver === resolver) {
				this._networkResolver = undefined;
				this._onDidChangeNetworkStatus.fire();
				void this._updateWindowConfiguration();
			}
		});
	}

	registerNetworkProxyProvider(provider: IBrowserViewNetworkProxyProvider): IDisposable {
		this._networkProxyProvider = provider;
		this._onDidRegisterNetworkProxyProvider.fire();
		// A new provider (e.g. a restarted extension host) has none of the
		// running proxies; restart them, including ones that failed or are
		// still starting. Views keep the previous proxy until the new one is
		// applied, so they never fall back to the local network.
		for (const entry of this._networkProxies.values()) {
			void this._startNetworkProxy(entry).catch(error => {
				this.logService.error(`[BrowserViewWorkbenchService] Failed to restart proxy for network ${entry.authority}.`, error);
			});
		}
		return toDisposable(() => {
			if (this._networkProxyProvider === provider) {
				this._networkProxyProvider = undefined;
			}
		});
	}

	getKnownBrowserViews(): Map<string, BrowserEditorInput> {
		return this._known;
	}

	registerContextualFilter(filter: IBrowserViewContextualFilter): IDisposable {
		this._contextualFilters.add(filter);
		const changeListener = filter.onDidChange?.(() => this._onDidChangeBrowserViews.fire());
		this._onDidChangeBrowserViews.fire();
		return toDisposable(() => {
			this._contextualFilters.delete(filter);
			changeListener?.dispose();
			this._onDidChangeBrowserViews.fire();
		});
	}

	getContextualBrowserViews(context?: IBrowserViewFilterContext): Map<string, BrowserEditorInput> {
		if (this._contextualFilters.size === 0 && context?.sandboxSessionId === undefined) {
			return this._known;
		}
		const filters = [...this._contextualFilters];
		const result = new Map<string, BrowserEditorInput>();
		for (const [id, input] of this._known) {
			if (!matchesBrowserViewSandboxSession(input.model?.owner, input.model?.sandboxSessionId, context?.sandboxSessionId)) {
				continue;
			}
			if (filters.every(filter => filter.include(input, { ...context }))) {
				result.set(id, input);
			}
		}
		return result;
	}

	async getPreferredGroup(preferredGroup?: PreferredGroup, sourceWindowId?: number): Promise<PreferredGroup | undefined> {
		// "Open to side" requests are routed into the dedicated side group.
		if (preferredGroup === SIDE_GROUP) {
			return this._getOrCreateDedicatedGroup('sideGroup');
		}

		// Other explicit placements are always honored as-is.
		if (preferredGroup !== undefined && preferredGroup !== ACTIVE_GROUP) {
			return preferredGroup;
		}

		// Honor the user-configured default for new browser tabs.
		const placement = this.configurationService.getValue<BrowserNewTabPlacement>(BrowserNewTabPlacementSettingId);
		if (placement === 'sideGroup' || placement === 'window') {
			return this._getOrCreateDedicatedGroup(placement);
		}

		// When editors are forced modal via `workbench.editor.useModal: 'all'`,
		// redirect active/unspecified browser opens to the main editor area so the
		// browser docks instead of opening as a modal overlay.
		if (this.configurationService.getValue<UseModalEditorMode>(USE_MODAL_EDITOR_SETTING) === 'all') {
			return this.editorGroupsService.mainPart.activeGroup;
		}

		// The active group of the window the open was requested from, rather than of the window that appears to have focus.
		return this._getActiveGroupOfWindow(sourceWindowId) ?? preferredGroup;
	}

	/**
	 * The active group of the window `windowId`, among the editor parts of that window. As for the active group when the
	 * editor group finder chooses it: not one that shows only a view with its own title, such as a chat, whose window's
	 * main part takes the editor instead, nor a locked one.
	 */
	private _getActiveGroupOfWindow(windowId: number | undefined): IEditorGroup | undefined {
		const window = windowId === undefined ? undefined : getWindowById(windowId)?.window;
		return window ? this._avoidLockedGroup(handOffFromSelfTitledEditor(this.editorGroupsService.getPart(window.document.body).activeGroup, this.editorGroupsService)) : undefined;
	}

	/**
	 * An explicit group is not checked for locks when editors open in it, so a locked group is replaced the way the
	 * editor group finder does for the active group: by an unlocked group of its part, or else a new group beside it.
	 */
	private _avoidLockedGroup(group: IEditorGroup): IEditorGroup {
		if (!group.isLocked) {
			return group;
		}
		const part = this.editorGroupsService.getPart(group);
		const unlocked = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).find(candidate => !candidate.isLocked);
		if (unlocked) {
			return unlocked;
		}
		// A part of locked groups other than the main part of its window, such as one that holds terminals, is not split
		// for it: the main part of the window takes it.
		const windowMainPart = getWindowMainPart(this.editorGroupsService, group.windowId);
		return windowMainPart !== part ? this._avoidLockedGroup(windowMainPart.activeGroup) : part.addGroup(group, preferredSideBySideGroupDirection(this.configurationService));
	}

	/**
	 * Resolve the dedicated editor group for the given placement, reusing an
	 * existing locked browser group if one is found (so it survives window
	 * reloads) or creating and locking a new one otherwise. Side-group creation
	 * is synchronous; window creation is asynchronous.
	 */
	private _getOrCreateDedicatedGroup(placement: DedicatedGroupPlacement): IEditorGroup | Promise<IEditorGroup> {
		const existing = this._findDedicatedGroup(placement);
		if (existing) {
			return existing;
		}

		if (placement === 'sideGroup') {
			// Beside the active group, or beside the group it hands editors off to, such as while a chat is active.
			const direction = preferredSideBySideGroupDirection(this.configurationService);
			const group = this.editorGroupsService.addGroup(handOffFromSelfTitledEditor(this.editorGroupsService.activeGroup, this.editorGroupsService), direction);
			// Lock the group so that other (non-browser) editors are not opened
			// into it. Browser tabs still open here because we target it directly.
			group.lock(true);
			return group;
		}

		// Auxiliary-window creation is async; coalesce concurrent requests so we don't spawn multiple windows.
		if (!this._dedicatedWindowGroupPromise) {
			this._dedicatedWindowGroupPromise = this.editorGroupsService.createAuxiliaryEditorPart()
				.then(part => {
					part.activeGroup.lock(true);
					return part.activeGroup;
				})
				.finally(() => this._dedicatedWindowGroupPromise = undefined);
		}
		return this._dedicatedWindowGroupPromise;
	}

	/**
	 * Find an existing dedicated browser group for the given placement. A group
	 * qualifies when it is locked and contains a browser editor (or is empty),
	 * which lets us rediscover the dedicated group after a window reload
	 * without tracking it in memory. Side groups live in the main editor part;
	 * window groups live in an auxiliary editor part.
	 */
	private _findDedicatedGroup(placement: DedicatedGroupPlacement): IEditorGroup | undefined {
		const mainPart = this.editorGroupsService.mainPart;
		for (const group of this.editorGroupsService.groups) {
			if (!group.isLocked) {
				continue;
			}
			if (group.editors.length > 0 && !group.editors.some(editor => editor instanceof BrowserEditorInput)) {
				continue;
			}
			const inMainPart = this.editorGroupsService.getPart(group) === mainPart;
			const matchesPlacement = placement === 'sideGroup' ? inMainPart : !inMainPart;
			if (matchesPlacement) {
				return group;
			}
		}
		return undefined;
	}

	registerOpenHandler(handler: IBrowserViewOpenHandler): IDisposable {
		this._openHandlers.add(handler);
		return toDisposable(() => {
			this._openHandlers.delete(handler);
		});
	}

	async createBrowserView(options: IBrowserViewWorkbenchCreateOptions, editorOpenOptions?: IBrowserViewEditorOpenOptions): Promise<BrowserEditorInput> {
		const input = this._getOrCreateLazy({
			id: generateUuid(),
			associatedResource: options.associatedResource,
			url: options.initialUrl
		}, undefined, { ...options, initialUrl: undefined });
		let model: IBrowserViewModel;
		try {
			model = await input.resolve();
		} catch (error) {
			// No editor shows the input yet, so a failed creation leaves nothing open.
			input.dispose();
			throw error;
		}
		if (editorOpenOptions) {
			void this._openEditorForCreatedView(input, options.owner, editorOpenOptions).catch(error => {
				this.logService.error('[BrowserViewWorkbenchService] Failed to open editor for created browser view.', error);
			});
		}
		const initialUrl = options.initialUrl;
		if (initialUrl) {
			const didNavigate = await raceTimeout((async () => {
				await model.loadURL(initialUrl);
				return true;
			})(), OPEN_BROWSER_NAVIGATION_TIMEOUT_MS);
			if (!didNavigate) {
				throw new Error(`Navigation to ${initialUrl} timed out after ${OPEN_BROWSER_NAVIGATION_TIMEOUT_MS} ms. The page (ID: ${input.id}) is open and can be reused.`);
			}
		}
		return input;
	}

	async createExternalBrowserView(initialUrl: string, openSource?: IBrowserViewWorkbenchCreateOptions['openSource'], networkOwner?: IBrowserViewOwner): Promise<IBrowserViewModel> {
		// Embedded pages have no network indicator, so they require their owner's network, resolved even while
		// proxying is disabled, rather than silently load from the local network. It is resolved before any
		// asynchronous work, so an owner that goes away meanwhile cannot leave the view on the local network.
		const requestedNetwork = networkOwner && this._resolveNetwork(networkOwner);
		const unavailable = () => new Error(localize('browser.requiredNetworkUnavailable', "The required remote network is unavailable."));
		if (requestedNetwork === null) {
			throw unavailable();
		}
		await this.workspaceTrustManagementService.workspaceTrustInitialized;
		await this._updateWindowConfiguration();
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		const { session, network } = await this._resolveViewSession({ scope: BrowserViewStorageScope.Ephemeral, network: requestedNetwork });
		if (requestedNetwork && !network) {
			throw unavailable();
		}
		const hold = network && await this._holdNetworkProxy(network, this._disposeToken);
		let model: IBrowserViewModel;
		try {
			const info = await this._browserViewService.getOrCreateBrowserView(generateUuid(), {
				host: { windowId: this._mainWindowId },
				owner: { type: 'user' },
				presentation: BrowserViewPresentation.Unlisted,
				session,
				initialAudiences: [],
				openSource,
			});
			if (this._store.isDisposed) {
				await this._browserViewService.destroyBrowserView(info.id);
				throw new CancellationError();
			}
			model = this._createModel(info, undefined, false);
		} finally {
			hold?.dispose();
		}
		try {
			await model.loadURL(initialUrl);
			return model;
		} catch (error) {
			model.dispose();
			throw error;
		}
	}

	getOrCreateLazy(data: IBrowserEditorInputData): BrowserEditorInput {
		return this._getOrCreateLazy(data);
	}

	private _getOrCreateLazy(data: IBrowserEditorInputData, model?: IBrowserViewModel, createOptions?: IBrowserViewWorkbenchCreateOptions): BrowserEditorInput {
		const { id, associatedResource } = data;
		if (!this._known.has(id)) {
			// Capture the opening context before any asynchronous work.
			const owner = createOptions?.owner ?? { type: 'user' };
			const requested = createOptions?.session ?? this._resolveSessionRequest(owner, data.session, associatedResource);
			data = { ...data, session: typeof requested === 'string' ? undefined : requested };
			const cancellation = new CancellationTokenSource();
			const input = this.instantiationService.createInstance(BrowserEditorInput, data, async () => {
				await this._browserViewsReady.p;
				const { session, network } = await this._resolveViewSession(requested);
				if (cancellation.token.isCancellationRequested) {
					throw new CancellationError();
				}
				const hold = network && await this._holdNetworkProxy(network, cancellation.token);
				try {
					await this._browserViewService.getOrCreateBrowserView(id, {
						host: {
							windowId: this._mainWindowId
						},
						owner,
						associatedResource,
						session,
						initialAudiences: createOptions?.initialAudiences,
						sandboxNetworkRestrictions: createOptions?.sandboxNetworkRestrictions,
						initialUrl: createOptions ? createOptions.initialUrl : input.url && normalizeBrowserViewUrl(input.url),
						openSource: createOptions?.openSource
					});
				} finally {
					hold?.dispose();
				}
				const model = this._known.get(id)?.model;
				if (!model) {
					throw new Error(`Browser view ${id} closed during creation`);
				}
				return model;
			});
			Event.once(input.onWillDispose)(() => {
				cancellation.dispose(true);
				this._known.delete(id);
				this._onDidChangeBrowserViews.fire();
			});
			if (model) {
				input.model = model;
			}
			this._known.set(id, input);
			this._onDidChangeBrowserViews.fire();
		}

		return this._known.get(id)!;
	}

	async clearGlobalStorage(): Promise<void> {
		return this._browserViewService.clearGlobalStorage();
	}

	async clearWorkspaceStorage(): Promise<void> {
		const workspaceId = this.workspaceContextService.getWorkspace().id;
		return this._browserViewService.clearWorkspaceStorage(workspaceId);
	}

	/** Fill missing session options from the opening context and configured storage. */
	private _resolveSessionRequest(owner: IBrowserViewOwner, request?: IBrowserViewSessionRequest, associatedResource?: URI): IBrowserViewSessionOptions {
		if (request?.scope !== undefined) {
			return request;
		}
		if (!request) {
			const network = this.resolveNetwork(owner);
			// A local file can't be read through a remote network, so it opens in an isolated session on the local network.
			if (network && associatedResource?.scheme === Schemas.file) {
				return toBrowserViewSessionOptions(BrowserViewStorageScope.Ephemeral, undefined, undefined);
			}
			request = { network, affinity: network && this._networkResolver?.resolveStorageAffinity?.(owner) };
		}
		const configured = this.configurationService.getValue<BrowserViewStorageScope | 'default'>('workbench.browser.dataStorage') ?? 'default';
		const scope = configured !== 'default' ? configured
			: this.environmentService.remoteAuthority || request.network ? BrowserViewStorageScope.Workspace : BrowserViewStorageScope.Global;
		return toBrowserViewSessionOptions(scope, request.affinity, request.network);
	}

	/** Apply workspace trust, proxy availability (including hosts that cannot proxy browsers), and workspace storage isolation to a requested session. */
	private async _resolveViewSession(requested: BrowserViewSessionSelector): Promise<{ session: BrowserViewSessionSelector; network: IBrowserViewNetwork | undefined }> {
		if (typeof requested === 'string') {
			return { session: requested, network: undefined };
		}
		const requestedNetwork = getBrowserViewSessionNetwork(requested);
		const network = requestedNetwork && this._isNetworkProxyEnabled() && await this._isNetworkSupported(requestedNetwork) ? requestedNetwork : undefined;
		let affinity = getBrowserViewSessionAffinity(requested);
		let scope = requested.scope;
		if (scope === BrowserViewStorageScope.Global || scope === BrowserViewStorageScope.Workspace) {
			await this.workspaceTrustManagementService.workspaceTrustInitialized;
			if (this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY && !this.workspaceTrustManagementService.isWorkspaceTrusted()) {
				scope = BrowserViewStorageScope.Ephemeral;
			}
		}
		if (scope === BrowserViewStorageScope.Workspace) {
			if (!network || network.authority === this.environmentService.remoteAuthority) {
				affinity = undefined;
			} else if (affinity === undefined) {
				scope = BrowserViewStorageScope.Ephemeral;
			}
		}
		return { session: toBrowserViewSessionOptions(scope, affinity, network), network };
	}

	/**
	 * Whether a network's host can proxy browsers. Hosts known not to support
	 * it use the local network; hosts whose support is not yet known (for
	 * example, still connecting) are given time to report it, and are
	 * otherwise used, so a view never silently uses the local network.
	 */
	private async _isNetworkSupported(network: IBrowserViewNetwork): Promise<boolean> {
		if (!this._networkResolver && network.authority !== this.environmentService.remoteAuthority) {
			// Without a resolver, the window's remote is the only network it can reach, and nothing would report on others.
			throw new Error(localize('browser.unknownNetwork', "This page was opened for another remote ({0}). Open it again from a window connected to that remote.", network.authority));
		}
		if (this.getNetworkStatus(network).proxySupported === undefined) {
			const reported = Event.toPromise(Event.filter(this.onDidChangeNetworkStatus, () => this.getNetworkStatus(network).proxySupported !== undefined));
			try {
				await raceTimeout(reported, NETWORK_SUPPORT_TIMEOUT_MS);
			} finally {
				reported.cancel();
			}
		}
		return this.getNetworkStatus(network).proxySupported !== false;
	}

	private _isNetworkProxyEnabled(): boolean {
		return !!this.configurationService.getValue<boolean>(BrowserRemoteProxyEnabledSettingId);
	}

	/**
	 * Hold a network's proxy for a view being created, once main has it. The
	 * view's model holds it for the view's lifetime once it exists.
	 */
	private async _holdNetworkProxy(network: IBrowserViewNetwork, token: CancellationToken): Promise<IDisposable> {
		const reference = this._acquireNetworkReference(network.authority);
		try {
			await raceCancellationError(this._whenNetworkProxyReady(reference.object), token);
			return reference;
		} catch (error) {
			reference.dispose();
			throw error;
		}
	}

	/** Record that a view or hold needs a network until the reference is disposed. */
	private _acquireNetworkReference(authority: string): IReference<INetworkProxyEntry> {
		let entry = this._networkProxies.get(authority);
		if (!entry) {
			entry = { authority, references: 0 };
			this._networkProxies.set(authority, entry);
		}
		const object = entry;
		object.references++;
		const release = toDisposable(() => {
			// A starting proxy is disposed once it settles.
			if (--object.references === 0 && !object.starting) {
				this._disposeNetworkProxy(object);
			}
		});
		return { object, dispose: () => release.dispose() };
	}

	/** Wait until main has a network's proxy, starting it if needed. */
	private _whenNetworkProxyReady(entry: INetworkProxyEntry): Promise<void> {
		// A starting proxy (including a restart) is not usable until main has it.
		if (entry.info && !entry.starting) {
			return Promise.resolve();
		}
		return entry.starting ?? this._startNetworkProxy(entry);
	}

	private _disposeNetworkProxy(entry: INetworkProxyEntry): void {
		if (this._networkProxies.get(entry.authority) !== entry) {
			return;
		}
		this._networkProxies.delete(entry.authority);
		if (entry.info) {
			this._networkProxyProvider?.release(entry.authority);
			void this._updateWindowConfiguration();
		}
	}

	/**
	 * Start a network's proxy and publish it to main. A new provider (e.g. after
	 * an extension host restart) restarts every proxy; a start superseded that
	 * way waits for its replacement instead.
	 */
	private _startNetworkProxy(entry: INetworkProxyEntry): Promise<void> {
		const starting: Promise<void> = (async () => {
			const isSuperseded = () => entry.starting !== starting;
			let info: ITunnelProxyInfo;
			try {
				const provider = await this._getNetworkProxyProvider();
				info = await provider.acquire(entry.authority);
			} catch (error) {
				if (isSuperseded()) {
					return entry.starting;
				}
				// Drop a dead proxy so the next start retries; views keep it in main until a new one is published.
				entry.info = undefined;
				throw error;
			}
			if (isSuperseded()) {
				return entry.starting;
			}
			entry.info = info;
			// Every reference may have been released while the proxy started.
			if (entry.references === 0) {
				return;
			}
			await this._updateWindowConfiguration();
			if (isSuperseded()) {
				return entry.starting;
			}
		})();
		entry.starting = starting;
		const settle = () => {
			if (entry.starting !== starting) {
				return;
			}
			entry.starting = undefined;
			if (entry.references === 0) {
				this._disposeNetworkProxy(entry);
			}
		};
		starting.then(settle, settle);
		return starting;
	}

	private async _getNetworkProxyProvider(): Promise<IBrowserViewNetworkProxyProvider> {
		if (!this._networkProxyProvider) {
			const registered = Event.toPromise(this._onDidRegisterNetworkProxyProvider.event);
			try {
				await raceTimeout(registered, NETWORK_PROXY_PROVIDER_TIMEOUT_MS);
			} finally {
				registered.cancel();
			}
		}
		if (!this._networkProxyProvider) {
			throw new Error(localize('browser.networkProxyUnavailable', "The browser network proxy did not start. Reload the window and try again."));
		}
		return this._networkProxyProvider;
	}

	private _dispatchEvent<K extends keyof BrowserViewEventData>(event: BrowserViewChangeEvent<K>): void {
		this._remoteEvents.get(event.id)?.emitters[event.event].fire(event.data);
	}

	private _createModel(info: IBrowserViewInfo, initialUrl?: string, registerInput = true): IBrowserViewModel {
		const associatedResource = URI.revive(info.associatedResource);
		// Don't double-create
		const input = this._known.get(info.id);
		const existing = input?.model;
		if (existing) {
			return existing;
		}

		const state = {
			...info.state,
			url: initialUrl ?? info.state.url,
			title: info.state.title || input?.title || '',
			lastFavicon: info.state.lastFavicon ?? input?.favicon
		};
		const store = new DisposableStore();
		const emitters = createBrowserViewEventEmitters(store);
		const eventLifetime = Object.assign(toDisposable(() => store.dispose()), { emitters });
		this._remoteEvents.set(info.id, eventLifetime);
		let model: BrowserViewModel;
		try {
			model = this.instantiationService.createInstance(BrowserViewModel, info.id, info.host, info.owner, associatedResource, state, this._browserViewService, emitters);
		} catch (error) {
			this._remoteEvents.deleteAndDispose(info.id);
			throw error;
		}
		// The view holds its network's proxy for its lifetime, including views
		// created by main (popups, CDP targets) and views that survived a window reload.
		const viewNetwork = getBrowserViewSessionNetwork(state.session);
		const networkReference = viewNetwork && this._acquireNetworkReference(viewNetwork.authority);
		if (networkReference) {
			store.add(networkReference);
			void this._whenNetworkProxyReady(networkReference.object).catch(error => {
				this.logService.error(`[BrowserViewWorkbenchService] Failed to start proxy for network ${networkReference.object.authority}.`, error);
			});
		}
		store.add(Event.once(model.onWillDispose)(() => {
			networkReference?.dispose();
			if (this._remoteEvents.get(info.id)?.emitters === emitters) {
				this._remoteEvents.deleteAndLeak(info.id);
			}
			// Let an in-flight close event reach the remaining model consumers.
			queueMicrotask(() => eventLifetime.dispose());
		}));

		if (registerInput) {
			this._getOrCreateLazy({ id: info.id, associatedResource, url: initialUrl, session: state.session }, model).model = model;
			this._onDidChangeBrowserViews.fire();
		}

		return model;
	}

	/**
	 * Open an editor tab for a newly created browser view.
	 */
	private async _openEditorForCreatedView(view: BrowserEditorInput, owner: IBrowserViewOwner, options: IBrowserViewEditorOpenOptions): Promise<void> {
		// Give registered handlers a chance to prevent the editor from opening.
		for (const handler of this._openHandlers) {
			if (!handler.shouldOpenEditor(view, owner, options)) {
				return;
			}
		}

		// Resolve target group: auxiliary window, parent's group, or default
		let targetGroup: PreferredGroup | undefined;
		if (options.auxiliaryWindow) {
			targetGroup = AUX_WINDOW_GROUP;
		} else if (options.parentViewId) {
			targetGroup = this._findEditorGroupForView(options.parentViewId);
			if (targetGroup === undefined) {
				return; // If the parent isn't open, don't open the child either
			}
		} else {
			// Keep the browser docked in the main editor area even when editors
			// are forced modal via `workbench.editor.useModal: 'all'`.
			targetGroup = await this.getPreferredGroup();
		}

		const editorOptions = {
			inactive: options.background,
			preserveFocus: options.preserveFocus,
			pinned: options.pinned,
			auxiliary: options.auxiliaryWindow
				? { bounds: options.auxiliaryWindow, compact: true }
				: undefined,
		};

		// If the browser is opened by a chat session,
		// only open in the foreground if the session's widget is currently visible
		// and not the active editor in the target group.
		const [group] = await this.instantiationService.invokeFunction(findGroup, { editor: view, options: editorOptions }, targetGroup);
		if (owner.type === 'agent') {
			const sessionResource = URI.parse(owner.sessionId);
			const widget = this.chatWidgetService.getWidgetBySessionResource(sessionResource);
			const isWidgetVisible = !!widget && widget.domNode.offsetParent !== null;
			const activeIsSameSession = group.activeEditor instanceof ChatEditorInput
				&& isEqual(group.activeEditor.sessionResource, sessionResource);
			if (!isWidgetVisible || activeIsSameSession) {
				editorOptions.inactive = true;
			}
		}

		void this.editorService.openEditor(view, editorOptions, group);
	}

	/**
	 * Find the editor group that currently contains a browser view with the
	 * given ID, or undefined if not open in any group.
	 */
	private _findEditorGroupForView(viewId: string): number | undefined {
		for (const group of this.editorGroupsService.groups) {
			for (const editor of group.editors) {
				if (editor instanceof BrowserEditorInput && editor.id === viewId) {
					return group.id;
				}
			}
		}
		return undefined;
	}

	private _updateWindowConfiguration(): Promise<void> {
		const trustedRoots = this._getTrustedFileRoots();
		const trustAllFiles = !this.workspaceTrustEnablementService.isWorkspaceTrustEnabled();
		return this._browserViewService.updateWindowConfiguration(this._mainWindowId, {
			theme: this._getTheme(),
			keybindings: this._getKeybindings(),
			aiFeaturesDisabled: !this.contextKeyService.contextMatchesRules(ChatContextKeys.enabled),
			maxHistoryEntries: this.configurationService.getValue<number>(BrowserMaxHistoryEntriesSettingId),
			remoteNetworks: this._getRemoteNetworks(trustedRoots, trustAllFiles),
			trustedLocalFileRoots: trustedRoots.filter(root => root.scheme === Schemas.file).map(root => root.fsPath),
			trustAllLocalFiles: trustAllFiles,
		});
	}

	/** The remote networks with a published proxy, each with the trusted folders on its file system. */
	private _getRemoteNetworks(trustedRoots: readonly URI[], trustAllFiles: boolean): { [authority: string]: IBrowserViewRemoteNetwork } {
		const remoteRoots = trustedRoots.flatMap(root => getBrowserViewRemoteFile(root) ?? []);
		const remoteNetworks: { [authority: string]: IBrowserViewRemoteNetwork } = {};
		for (const [authority, entry] of this._networkProxies) {
			if (!entry.info) {
				continue;
			}
			const fileSystem = this.getNetworkFileSystem({ authority });
			const { scheme } = fileSystem;
			remoteNetworks[authority] = {
				proxy: entry.info,
				...fileSystem,
				trustedRoots: remoteRoots.filter(root => root.scheme === scheme && extUri.isEqualAuthority(root.authority, authority)).map(root => root.fileUri.path),
				trustAllFiles: scheme === Schemas.vscodeRemote && trustAllFiles,
			};
		}
		return remoteNetworks;
	}

	getNetworkFileSystem(network: IBrowserViewNetwork): IBrowserViewNetworkFileSystem {
		if (network.authority === this.environmentService.remoteAuthority) {
			// Defaults to case-sensitive, which is the strict choice, until the remote's file system is registered.
			const root = URI.from({ scheme: Schemas.vscodeRemote, authority: network.authority, path: '/' });
			return {
				scheme: Schemas.vscodeRemote,
				caseSensitive: !this.fileService.hasProvider(root) || this.fileService.hasCapability(root, FileSystemProviderCapabilities.PathCaseSensitive)
			};
		}
		return { scheme: AGENT_HOST_SCHEME, caseSensitive: this._networkResolver?.isPathCaseSensitive?.(network) ?? true };
	}

	private _getKeybindings(): { [commandId: string]: string } {
		const keybindings: { [commandId: string]: string } = Object.create(null);
		for (const commandId of browserViewContextMenuCommands) {
			const binding = this.keybindingService.lookupKeybinding(commandId);
			const accelerator = binding?.getElectronAccelerator();
			if (accelerator) {
				keybindings[commandId] = accelerator;
			}
		}
		return keybindings;
	}

	private _getTheme(): IBrowserViewTheme {
		const theme = this.themeService.getColorTheme();
		return {
			focusBorder: theme.getColor(focusBorder)?.toString(),
			buttonBackground: theme.getColor(buttonBackground)?.toString(),
			buttonForeground: theme.getColor(buttonForeground)?.toString(),
			widgetBackground: theme.getColor(editorWidgetBackground)?.toString(),
			widgetForeground: theme.getColor(editorWidgetForeground)?.toString(),
			widgetBorder: theme.getColor(editorWidgetBorder)?.toString(),
			widgetShadow: theme.getColor(widgetShadow)?.toString(),
			contrastBorder: theme.getColor(contrastBorder)?.toString(),
			descriptionForeground: theme.getColor(descriptionForeground)?.toString(),
			inputPlaceholderForeground: theme.getColor(inputPlaceholderForeground)?.toString(),
			toolbarHoverBackground: theme.getColor(toolbarHoverBackground)?.toString(),
			font: DEFAULT_FONT_FAMILY,
			reducedMotion: this.accessibilityService.isMotionReduced(),
		};
	}

	/** The candidate trusted roots on any file system. Local ones go to the window configuration as paths; remote ones are matched to the network of their scheme and authority. */
	private _getTrustedFileRoots(): URI[] {
		// Trust Copilot roots so agents can create HTML files and open them in the browser.
		const roots = getCopilotRootPaths(this.environmentService.userHome.fsPath, this.copilotHomeService.home.fsPath).map(path => URI.file(path));
		if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
			for (const folder of this.workspaceContextService.getWorkspace().folders) {
				roots.push(folder.uri);
			}
		}
		// The resolver applies workspace trust to each session folder itself.
		roots.push(...this._networkResolver?.getTrustedFileRoots?.() ?? []);
		roots.push(...this.workspaceTrustManagementService.getTrustedUris());
		return roots;
	}
}
