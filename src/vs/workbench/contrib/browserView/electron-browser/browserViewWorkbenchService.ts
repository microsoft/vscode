/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserViewChangeEvent, BrowserViewEventData, BrowserViewCommandId, BrowserViewPresentation, BrowserViewSessionSelector, BrowserViewStorageScope, getBrowserViewSessionNetwork, IBrowserViewEditorOpenOptions, IBrowserViewInfo, IBrowserViewNetwork, IBrowserViewOwner, IBrowserViewService, IBrowserViewTheme, ipcBrowserViewChannelName, reviveBrowserViewInfo } from '../../../../platform/browserView/common/browserView.js';
import { matchesBrowserViewSandboxSession } from '../../../../platform/browserView/common/browserViewGroup.js';
import { BrowserViewEventEmitters, createBrowserViewEventEmitters, BrowserViewSharingState, IBrowserViewWorkbenchService, IBrowserViewModel, BrowserViewModel, IBrowserViewContextualFilter, IBrowserViewFilterContext, IBrowserViewOpenHandler, IBrowserViewWorkbenchCreateOptions, IBrowserViewNetworkProxyProvider, IBrowserViewNetworkResolver } from '../common/browserView.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, IEditorService, PreferredGroup, SIDE_GROUP, USE_MODAL_EDITOR_SETTING, UseModalEditorMode } from '../../../services/editor/common/editorService.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { BrowserEditorInput, IBrowserEditorInputData } from '../common/browserEditorInput.js';
import { IEditorGroup, IEditorGroupsService, preferredSideBySideGroupDirection } from '../../../services/editor/common/editorGroupsService.js';
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
import { findGroup } from '../../../services/editor/common/editorGroupFinder.js';
import { ChatEditorInput } from '../../chat/browser/widgetHosts/editor/chatEditorInput.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { getCopilotRootPaths } from '../../../../platform/environment/common/copilotHome.js';
import { ICopilotHomeService } from '../../../services/environment/common/copilotHomeService.js';
import { localChatSessionType } from '../../chat/common/chatSessionsService.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { ITunnelProxyInfo } from '../../../../platform/tunnel/common/tunnelProxy.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { DeferredPromise, raceCancellationError, raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource, cancelOnDispose } from '../../../../base/common/cancellation.js';
import { AgentNetworkDomainSettingId } from '../../../../platform/networkFilter/common/settings.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';

export const BrowserMaxHistoryEntriesSettingId = 'workbench.browser.maxHistoryEntries';
export const BrowserRemoteProxyEnabledSettingId = 'workbench.browser.enableRemoteProxy';
export const BrowserNewTabPlacementSettingId = 'workbench.browser.newTabPlacement';
const OPEN_BROWSER_NAVIGATION_TIMEOUT_MS = 30_000;
/** How long creation waits for the local extension host to provide network proxies. */
const NETWORK_PROXY_PROVIDER_TIMEOUT_MS = 30_000;

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
	) {
		super();
		const channel = mainProcessService.getChannel(ipcBrowserViewChannelName);
		this._browserViewService = ProxyChannel.toService<IBrowserViewService>(channel);
		this._mainWindowId = mainWindow.vscodeWindowId;

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
		if (this._networkResolver) {
			return this._networkResolver.resolveNetwork(owner);
		}
		const remoteAuthority = this.environmentService.remoteAuthority;
		return remoteAuthority ? { authority: remoteAuthority } : undefined;
	}

	async acquireNetwork(network: IBrowserViewNetwork): Promise<IDisposable> {
		const reference = this._acquireNetworkReference(network.authority);
		try {
			await this._whenNetworkProxyReady(reference.object);
		} catch (error) {
			this.logService.error(`[BrowserViewWorkbenchService] Failed to start proxy for network ${network.authority}.`, error);
		}
		return reference;
	}

	registerNetworkResolver(resolver: IBrowserViewNetworkResolver): IDisposable {
		if (this._networkResolver) {
			throw new Error('A browser network resolver is already registered');
		}
		this._networkResolver = resolver;
		return toDisposable(() => {
			if (this._networkResolver === resolver) {
				this._networkResolver = undefined;
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

	async getPreferredGroup(preferredGroup?: PreferredGroup): Promise<PreferredGroup | undefined> {
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

		return preferredGroup;
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
			const direction = preferredSideBySideGroupDirection(this.configurationService);
			const group = this.editorGroupsService.addGroup(this.editorGroupsService.activeGroup, direction);
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
		await this.workspaceTrustManagementService.workspaceTrustInitialized;
		await this._updateWindowConfiguration();
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		const { session, network } = await this._resolveViewSession({ scope: BrowserViewStorageScope.Ephemeral }, networkOwner && this.resolveNetwork(networkOwner));
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
			// Capture the network synchronously so it reflects where the view was opened from.
			const owner = createOptions?.owner ?? { type: 'user' };
			const requestedNetwork = createOptions ? typeof createOptions.session === 'string' ? undefined : getBrowserViewSessionNetwork(createOptions.session)
				: data.network === undefined ? this.resolveNetwork(owner) : data.network ?? undefined;
			data = { ...data, network: requestedNetwork ?? null };
			const cancellation = new CancellationTokenSource();
			const input = this.instantiationService.createInstance(BrowserEditorInput, data, async () => {
				await this._browserViewsReady.p;
				const { session, network } = await this._resolveViewSession(createOptions?.session, requestedNetwork);
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
						initialUrl: createOptions ? createOptions.initialUrl : data.url,
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

	/**
	 * The storage and network of a new view, from the requested storage
	 * (`undefined` for the configured default) and the network it was opened
	 * for. Views use the local network while proxying is disabled, and global
	 * storage, which every window shares, always does. The window's workspace
	 * storage belongs to its own remote, so views on other networks get
	 * in-memory storage instead.
	 */
	private async _resolveViewSession(requested: BrowserViewSessionSelector | undefined, network: IBrowserViewNetwork | undefined): Promise<{ session: BrowserViewSessionSelector; network: IBrowserViewNetwork | undefined }> {
		const wanted = this._isNetworkProxyEnabled() ? network : undefined;
		const session: BrowserViewSessionSelector = requested ?? { scope: await this._resolveStorageScope(!!wanted) };
		if (typeof session === 'string' || session.scope === BrowserViewStorageScope.Global) {
			return { session, network: undefined };
		}
		if (!wanted) {
			return { session: session.network ? { ...session, network: undefined } : session, network: undefined };
		}
		if (session.scope === BrowserViewStorageScope.Workspace && wanted.authority !== this.environmentService.remoteAuthority) {
			return { session: { scope: BrowserViewStorageScope.Ephemeral, network: wanted }, network: wanted };
		}
		return { session: { ...session, network: wanted }, network: wanted };
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

	private async _resolveStorageScope(usesNetwork: boolean): Promise<BrowserViewStorageScope> {
		let dataStorage = this.configurationService.getValue<BrowserViewStorageScope | 'default'>(
			'workbench.browser.dataStorage'
		) ?? 'default';

		await this.workspaceTrustManagementService.workspaceTrustInitialized;

		const isWorkspaceUntrusted =
			this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY &&
			!this.workspaceTrustManagementService.isWorkspaceTrusted();

		if (isWorkspaceUntrusted) {
			// Always use ephemeral sessions for untrusted workspaces
			dataStorage = BrowserViewStorageScope.Ephemeral;
		} else if (dataStorage === 'default') {
			// Workspace-scoped for remote workspaces. Views on a remote network in
			// a local window cannot use global storage, so they are ephemeral.
			dataStorage = this.environmentService.remoteAuthority
				? BrowserViewStorageScope.Workspace
				: usesNetwork ? BrowserViewStorageScope.Ephemeral : BrowserViewStorageScope.Global;
		}

		return dataStorage;
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
		const networkReference = state.network && this._acquireNetworkReference(state.network.authority);
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
			this._getOrCreateLazy({ id: info.id, associatedResource, url: initialUrl, network: state.network ?? null }, model).model = model;
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
		return this._browserViewService.updateWindowConfiguration(this._mainWindowId, {
			theme: this._getTheme(),
			keybindings: this._getKeybindings(),
			aiFeaturesDisabled: !this.contextKeyService.contextMatchesRules(ChatContextKeys.enabled),
			maxHistoryEntries: this.configurationService.getValue<number>(BrowserMaxHistoryEntriesSettingId),
			networkProxies: this._getNetworkProxies(),
			trustedFileRoots: this._getTrustedFileRoots(),
			trustAllFiles: !this.workspaceTrustEnablementService.isWorkspaceTrustEnabled(),
		});
	}

	private _getNetworkProxies(): { [authority: string]: ITunnelProxyInfo } {
		const networkProxies: { [authority: string]: ITunnelProxyInfo } = {};
		for (const [authority, entry] of this._networkProxies) {
			if (entry.info) {
				networkProxies[authority] = entry.info;
			}
		}
		return networkProxies;
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

	private _getTrustedFileRoots(): string[] {
		// Trust Copilot roots so agents can create HTML files and open them in the browser.
		const roots = new Set(getCopilotRootPaths(this.environmentService.userHome.fsPath, this.copilotHomeService.home.fsPath));
		if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
			for (const folder of this.workspaceContextService.getWorkspace().folders) {
				if (folder.uri.scheme === Schemas.file) {
					roots.add(folder.uri.fsPath);
				}
			}
		}
		for (const uri of this.workspaceTrustManagementService.getTrustedUris()) {
			if (uri.scheme === Schemas.file) {
				roots.add(uri.fsPath);
			}
		}
		return [...roots];
	}
}
