/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserViewCommandId, BrowserViewStorageScope, IBrowserViewEditorOpenOptions, IBrowserViewInfo, IBrowserViewOwner, IBrowserViewService, IBrowserViewTheme, ipcBrowserViewChannelName } from '../../../../platform/browserView/common/browserView.js';
import { IBrowserViewWorkbenchService, IBrowserViewModel, BrowserViewModel, IBrowserViewContextualFilter, IBrowserViewFilterContext, IBrowserViewOpenHandler, IBrowserViewWorkbenchCreateOptions } from '../common/browserView.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { process } from '../../../../base/parts/sandbox/electron-browser/globals.js';
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
import { getCopilotRootPaths } from '../../../../platform/agentHost/common/copilotHome.js';
import { localChatSessionType } from '../../chat/common/chatSessionsService.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { ITunnelProxyInfo } from '../../../../platform/tunnel/common/tunnelProxy.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { raceTimeout } from '../../../../base/common/async.js';

export const BrowserMaxHistoryEntriesSettingId = 'workbench.browser.maxHistoryEntries';
export const BrowserRemoteProxyEnabledSettingId = 'workbench.browser.enableRemoteProxy';
export const BrowserNewTabPlacementSettingId = 'workbench.browser.newTabPlacement';
const OPEN_BROWSER_NAVIGATION_TIMEOUT_MS = 30_000;

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
	private readonly _contextualFilters = new Set<IBrowserViewContextualFilter>();
	private readonly _openHandlers = new Set<IBrowserViewOpenHandler>();
	private readonly _mainWindowId: number;

	/** Latest tunnel-proxy credentials pushed from the local extension host. */
	private _remoteProxyInfo: ITunnelProxyInfo | undefined;

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
		@IThemeService private readonly themeService: IThemeService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super();
		const channel = mainProcessService.getChannel(ipcBrowserViewChannelName);
		this._browserViewService = ProxyChannel.toService<IBrowserViewService>(channel);
		this._mainWindowId = mainWindow.vscodeWindowId;

		// Send the full per-window configuration as a single unit, and resend it
		// whenever any of its inputs change.
		this._updateWindowConfiguration();
		const chatEnabledKeys = new Set(ChatContextKeys.enabled.keys());
		this._register(this.keybindingService.onDidUpdateKeybindings(() => this._updateWindowConfiguration()));
		this._register(this.themeService.onDidColorThemeChange(() => this._updateWindowConfiguration()));
		this._register(this.accessibilityService.onDidChangeReducedMotion(() => this._updateWindowConfiguration()));
		this._register(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => this._updateWindowConfiguration()));
		this._register(this.workspaceTrustManagementService.onDidChangeTrust(() => this._updateWindowConfiguration()));
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this._updateWindowConfiguration()));
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(chatEnabledKeys)) {
				this._updateWindowConfiguration();
			}
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(BrowserMaxHistoryEntriesSettingId) || e.affectsConfiguration(BrowserRemoteProxyEnabledSettingId)) {
				this._updateWindowConfiguration();
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

		// Start asynchronously creating models for all views we already own.
		void this._initializeExistingViews().catch(e => {
			this.logService.error('[BrowserViewWorkbenchService] Failed to initialize existing browser views.', e);
		});

		// Listen for new browser views
		this._register(this._browserViewService.onDidCreateBrowserView(e => {
			if (e.info.host.windowId !== this._mainWindowId) {
				return; // Not for this window
			}

			// Eagerly create the model from the state we already have
			this._createModel(e.info, e.initialUrl);

			const editor = this._known.get(e.info.id);
			if (editor && e.editorOpenRequest) {
				void this._openEditorForCreatedView(editor, e.info.owner, e.editorOpenRequest).catch(error => {
					this.logService.error('[BrowserViewWorkbenchService] Failed to open editor for created browser view.', error);
				});
			}
		}));
	}

	willUseRemoteProxy(): boolean {
		if (!this.environmentService.remoteAuthority) {
			return false;
		}
		if (!this.configurationService.getValue<boolean>(BrowserRemoteProxyEnabledSettingId)) {
			return false;
		}
		return true;
	}

	setRemoteProxyInfo(info: ITunnelProxyInfo | undefined): void {
		this._remoteProxyInfo = info;
		this._updateWindowConfiguration();
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
		if (this._contextualFilters.size === 0) {
			return this._known;
		}
		const filters = [...this._contextualFilters];
		const result = new Map<string, BrowserEditorInput>();
		for (const [id, input] of this._known) {
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
		const model = await input.resolve();
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

	getOrCreateLazy(data: IBrowserEditorInputData): BrowserEditorInput {
		return this._getOrCreateLazy(data);
	}

	private _getOrCreateLazy(data: IBrowserEditorInputData, model?: IBrowserViewModel, createOptions?: IBrowserViewWorkbenchCreateOptions): BrowserEditorInput {
		const { id, associatedResource } = data;
		if (!this._known.has(id)) {
			const input = this.instantiationService.createInstance(BrowserEditorInput, data, async () => {
				const info = await this._browserViewService.getOrCreateBrowserView(
					id,
					{
						host: {
							windowId: this._mainWindowId
						},
						owner: createOptions?.owner ?? { type: 'user' },
						associatedResource,
						session: createOptions?.session ?? { scope: await this._resolveStorageScope() },
						initialAudiences: createOptions?.initialAudiences,
						initialUrl: createOptions ? createOptions.initialUrl : data.url,
						openSource: createOptions?.openSource
					}
				);
				return this._createModel(info);
			});
			input.onWillDispose(() => {
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

	private async _resolveStorageScope(): Promise<BrowserViewStorageScope> {
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
			// Workspace-scoped for remote workspaces.
			dataStorage = this.environmentService.remoteAuthority
				? BrowserViewStorageScope.Workspace
				: BrowserViewStorageScope.Global;
		}

		return dataStorage;
	}

	/**
	 * Fetch all views owned by this window from the main service and create
	 * models for them so they are available synchronously.
	 */
	private async _initializeExistingViews(): Promise<void> {
		const views = await this._browserViewService.getBrowserViews(this._mainWindowId);
		for (const info of views) {
			this._createModel(info);
		}
	}

	private _createModel(info: IBrowserViewInfo, initialUrl?: string): IBrowserViewModel {
		const associatedResource = URI.revive(info.associatedResource);
		// Don't double-create
		const input = this._known.get(info.id);
		const existing = input?.model;
		if (existing) {
			return existing;
		}

		const state = input
			? {
				...info.state,
				url: input.url ?? info.state.url,
				title: input.title ?? info.state.title,
				lastFavicon: input.favicon ?? info.state.lastFavicon
			}
			: initialUrl
				? { ...info.state, url: initialUrl }
				: info.state;
		const model = this.instantiationService.createInstance(BrowserViewModel, info.id, info.host, info.owner, associatedResource, state, this._browserViewService);

		// Sanity: both pass and assign the model to be sure. It will no-op if already set.
		this._getOrCreateLazy({ id: info.id, associatedResource, url: initialUrl }, model).model = model;

		this._onDidChangeBrowserViews.fire();

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

	private _updateWindowConfiguration(): void {
		void this._browserViewService.updateWindowConfiguration(this._mainWindowId, {
			theme: this._getTheme(),
			keybindings: this._getKeybindings(),
			aiFeaturesDisabled: !this.contextKeyService.contextMatchesRules(ChatContextKeys.enabled),
			maxHistoryEntries: this.configurationService.getValue<number>(BrowserMaxHistoryEntriesSettingId),
			proxyInfo: this._remoteProxyInfo,
			trustedFileRoots: this._getTrustedFileRoots(),
			trustAllFiles: !this.workspaceTrustEnablementService.isWorkspaceTrustEnabled(),
		});
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
		const roots = new Set(getCopilotRootPaths(this.environmentService.userHome.fsPath, process.env));
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
