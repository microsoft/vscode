/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as domStylesheets from '../../../../base/browser/domStylesheets.js';
import * as cssValue from '../../../../base/browser/cssValue.js';
import { DeferredPromise, timeout, type MaybePromise } from '../../../../base/common/async.js';
import { debounce, memoize } from '../../../../base/common/decorators.js';
import { DynamicListEventMultiplexer, Emitter, Event, IDynamicListEventMultiplexer } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, dispose, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isMacintosh, isWeb } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { IKeyMods } from '../../../../platform/quickinput/common/quickInput.js';
import * as nls from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ICreateContributedTerminalProfileOptions, IExtensionTerminalProfile, IPtyHostAttachTarget, IRawTerminalInstanceLayoutInfo, IRawTerminalTabLayoutInfo, IShellLaunchConfig, ITerminalBackend, ITerminalLaunchError, ITerminalLogService, ITerminalsLayoutInfo, ITerminalsLayoutInfoById, TerminalExitReason, TerminalLocation, TitleEventSource } from '../../../../platform/terminal/common/terminal.js';
import { formatMessageForTerminal } from '../../../../platform/terminal/common/terminalStrings.js';
import { iconForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { getIconRegistry } from '../../../../platform/theme/common/iconRegistry.js';
import { isDark } from '../../../../platform/theme/common/theme.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { VirtualWorkspaceContext } from '../../../common/contextkeys.js';
import { ICreateTerminalOptions, IDetachedTerminalInstance, IDetachedXTermOptions, IRequestAddInstanceToGroupEvent, ITerminalConfigurationService, ITerminalEditorService, ITerminalGroup, ITerminalGroupService, ITerminalInstance, ITerminalInstanceHost, ITerminalInstanceService, ITerminalLocationOptions, ITerminalService, ITerminalServiceNativeDelegate, TerminalConnectionState, TerminalEditorLocation } from './terminal.js';
import { getCwdForSplit } from './terminalActions.js';
import { TerminalEditorInput } from './terminalEditorInput.js';
import { getColorStyleContent, getUriClasses } from './terminalIcon.js';
import { TerminalProfileQuickpick } from './terminalProfileQuickpick.js';
import { getInstanceFromResource, getTerminalUri, parseTerminalUri } from './terminalUri.js';
import { IRemoteTerminalAttachTarget, IStartExtensionTerminalRequest, ITerminalProcessExtHostProxy, ITerminalProfileService } from '../common/terminal.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { columnToEditorGroup } from '../../../services/editor/common/editorGroupColumn.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, ACTIVE_GROUP_TYPE, AUX_WINDOW_GROUP, AUX_WINDOW_GROUP_TYPE, IEditorService, SIDE_GROUP, SIDE_GROUP_TYPE } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ILifecycleService, ShutdownReason, StartupKind, WillShutdownEvent } from '../../../services/lifecycle/common/lifecycle.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { XtermTerminal } from './xterm/xtermTerminal.js';
import { TerminalInstance } from './terminalInstance.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { TerminalCapabilityStore } from '../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { ITimerService } from '../../../services/timer/browser/timerService.js';
import { mark } from '../../../../base/common/performance.js';
import { DetachedTerminal } from './detachedTerminal.js';
import { ITerminalCapabilityImplMap, TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { createInstanceCapabilityEventMultiplexer } from './terminalEvents.js';
import { isAuxiliaryWindow, mainWindow } from '../../../../base/browser/window.js';
import { GroupIdentifier } from '../../../common/editor.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { hasKey, isString } from '../../../../base/common/types.js';

interface IBackgroundTerminal {
	instance: ITerminalInstance;
	terminalLocationOptions?: ITerminalLocationOptions;
}

export class TerminalService extends Disposable implements ITerminalService {
	declare _serviceBrand: undefined;

	private _hostActiveTerminals: Map<ITerminalInstanceHost, ITerminalInstance | undefined> = new Map();

	private _detachedXterms = new Set<IDetachedTerminalInstance>();
	private _terminalEditorActive: IContextKey<boolean>;
	private readonly _terminalShellTypeContextKey: IContextKey<string>;

	private _isShuttingDown: boolean = false;
	private _backgroundedTerminalInstances: IBackgroundTerminal[] = [];
	private _backgroundedTerminalDisposables: Map<number, IDisposable[]> = new Map();
	private _processSupportContextKey: IContextKey<boolean>;

	private _primaryBackend?: ITerminalBackend;
	private _terminalHasBeenCreated: IContextKey<boolean>;
	private _terminalCountContextKey: IContextKey<number>;
	private _nativeDelegate?: ITerminalServiceNativeDelegate;
	private _shutdownWindowCount?: number;

	get isProcessSupportRegistered(): boolean { return !!this._processSupportContextKey.get(); }

	private _connectionState: TerminalConnectionState = TerminalConnectionState.Connecting;
	get connectionState(): TerminalConnectionState { return this._connectionState; }

	private readonly _whenConnected = new DeferredPromise<void>();
	get whenConnected(): Promise<void> { return this._whenConnected.p; }

	private _restoredGroupCount: number = 0;
	get restoredGroupCount(): number { return this._restoredGroupCount; }

	get instances(): ITerminalInstance[] {
		return this._terminalGroupService.instances.concat(this._terminalEditorService.instances).concat(this._backgroundedTerminalInstances.map(bg => bg.instance));
	}
	/** Gets all non-background terminals. */
	get foregroundInstances(): ITerminalInstance[] {
		return this._terminalGroupService.instances.concat(this._terminalEditorService.instances);
	}
	get detachedInstances(): Iterable<IDetachedTerminalInstance> {
		return this._detachedXterms;
	}

	private _reconnectedTerminalGroups: Promise<ITerminalGroup[]> | undefined;

	private _reconnectedTerminals: Map<string, ITerminalInstance[]> = new Map();
	getReconnectedTerminals(reconnectionOwner: string): ITerminalInstance[] | undefined {
		return this._reconnectedTerminals.get(reconnectionOwner);
	}

	private _activeInstance: ITerminalInstance | undefined;
	get activeInstance(): ITerminalInstance | undefined {
		// Check if either an editor or panel terminal has focus and return that, regardless of the
		// value of _activeInstance. This avoids terminals created in the panel for example stealing
		// the active status even when it's not focused.
		for (const activeHostTerminal of this._hostActiveTerminals.values()) {
			if (activeHostTerminal?.hasFocus) {
				return activeHostTerminal;
			}
		}
		// Fallback to the last recorded active terminal if neither have focus
		return this._activeInstance;
	}

	private readonly _onDidCreateInstance = this._register(new Emitter<ITerminalInstance>());
	get onDidCreateInstance(): Event<ITerminalInstance> { return this._onDidCreateInstance.event; }
	private readonly _onDidChangeInstanceDimensions = this._register(new Emitter<ITerminalInstance>());
	get onDidChangeInstanceDimensions(): Event<ITerminalInstance> { return this._onDidChangeInstanceDimensions.event; }
	private readonly _onDidRegisterProcessSupport = this._register(new Emitter<void>());
	get onDidRegisterProcessSupport(): Event<void> { return this._onDidRegisterProcessSupport.event; }
	private readonly _onDidChangeConnectionState = this._register(new Emitter<void>());
	get onDidChangeConnectionState(): Event<void> { return this._onDidChangeConnectionState.event; }
	private readonly _onDidRequestStartExtensionTerminal = this._register(new Emitter<IStartExtensionTerminalRequest>());
	get onDidRequestStartExtensionTerminal(): Event<IStartExtensionTerminalRequest> { return this._onDidRequestStartExtensionTerminal.event; }

	// ITerminalInstanceHost events
	private readonly _onDidDisposeInstance = this._register(new Emitter<ITerminalInstance>());
	get onDidDisposeInstance(): Event<ITerminalInstance> { return this._onDidDisposeInstance.event; }
	private readonly _onDidFocusInstance = this._register(new Emitter<ITerminalInstance>());
	get onDidFocusInstance(): Event<ITerminalInstance> { return this._onDidFocusInstance.event; }
	private readonly _onDidChangeActiveInstance = this._register(new Emitter<ITerminalInstance | undefined>());
	get onDidChangeActiveInstance(): Event<ITerminalInstance | undefined> { return this._onDidChangeActiveInstance.event; }
	private readonly _onDidChangeInstances = this._register(new Emitter<void>());
	get onDidChangeInstances(): Event<void> { return this._onDidChangeInstances.event; }
	private readonly _onDidChangeInstanceCapability = this._register(new Emitter<ITerminalInstance>());
	get onDidChangeInstanceCapability(): Event<ITerminalInstance> { return this._onDidChangeInstanceCapability.event; }

	// Terminal view events
	private readonly _onDidChangeActiveGroup = this._register(new Emitter<ITerminalGroup | undefined>());
	get onDidChangeActiveGroup(): Event<ITerminalGroup | undefined> { return this._onDidChangeActiveGroup.event; }

	// Lazily initialized events that fire when the specified event fires on _any_ terminal
	// TODO: Batch events
	@memoize get onAnyInstanceData() { return this._register(this.createOnInstanceEvent(instance => Event.map(instance.onData, data => ({ instance, data })))).event; }
	@memoize get onAnyInstanceDataInput() { return this._register(this.createOnInstanceEvent(e => Event.map(e.onDidInputData, () => e, e.store))).event; }
	@memoize get onAnyInstanceIconChange() { return this._register(this.createOnInstanceEvent(e => e.onIconChanged)).event; }
	@memoize get onAnyInstanceMaximumDimensionsChange() { return this._register(this.createOnInstanceEvent(e => Event.map(e.onMaximumDimensionsChanged, () => e, e.store))).event; }
	@memoize get onAnyInstancePrimaryStatusChange() { return this._register(this.createOnInstanceEvent(e => Event.map(e.statusList.onDidChangePrimaryStatus, () => e, e.store))).event; }
	@memoize get onAnyInstanceProcessIdReady() { return this._register(this.createOnInstanceEvent(e => e.onProcessIdReady)).event; }
	@memoize get onAnyInstanceSelectionChange() { return this._register(this.createOnInstanceEvent(e => e.onDidChangeSelection)).event; }
	@memoize get onAnyInstanceTitleChange() { return this._register(this.createOnInstanceEvent(e => e.onTitleChanged)).event; }
	@memoize get onAnyInstanceShellTypeChanged() { return this._register(this.createOnInstanceEvent(e => Event.map(e.onDidChangeShellType, () => e))).event; }
	@memoize get onAnyInstanceAddedCapabilityType() { return this._register(this.createOnInstanceEvent(e => Event.map(e.capabilities.onDidAddCapability, e => e.id))).event; }

	constructor(
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@IDialogService private _dialogService: IDialogService,
		@IInstantiationService private _instantiationService: IInstantiationService,
		@IRemoteAgentService private _remoteAgentService: IRemoteAgentService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService,
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@ITerminalInstanceService private readonly _terminalInstanceService: ITerminalInstanceService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ICommandService private readonly _commandService: ICommandService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ITimerService private readonly _timerService: ITimerService
	) {
		super();

		// the below avoids having to poll routinely.
		// we update detected profiles when an instance is created so that,
		// for example, we detect if you've installed a pwsh
		this._register(this.onDidCreateInstance(() => this._terminalProfileService.refreshAvailableProfiles()));
		this._forwardInstanceHostEvents(this._terminalGroupService);
		this._forwardInstanceHostEvents(this._terminalEditorService);
		this._register(this._terminalGroupService.onDidChangeActiveGroup(this._onDidChangeActiveGroup.fire, this._onDidChangeActiveGroup));
		this._register(this._terminalInstanceService.onDidCreateInstance(instance => {
			this._initInstanceListeners(instance);
			this._onDidCreateInstance.fire(instance);
		}));

		// Hide the panel if there are no more instances, provided that VS Code is not shutting
		// down. When shutting down the panel is locked in place so that it is restored upon next
		// launch.
		this._register(this._terminalGroupService.onDidChangeActiveInstance(instance => {
			if (!instance && !this._isShuttingDown && this._terminalConfigurationService.config.hideOnLastClosed) {
				this._terminalGroupService.hidePanel();
			}
			if (instance?.shellType) {
				this._terminalShellTypeContextKey.set(instance.shellType.toString());
			} else if (!instance || !(instance.shellType)) {
				this._terminalShellTypeContextKey.reset();
			}
		}));

		this._handleInstanceContextKeys();
		this._terminalShellTypeContextKey = TerminalContextKeys.shellType.bindTo(this._contextKeyService);
		this._processSupportContextKey = TerminalContextKeys.processSupported.bindTo(this._contextKeyService);
		this._processSupportContextKey.set(!isWeb || this._remoteAgentService.getConnection() !== null);
		this._terminalHasBeenCreated = TerminalContextKeys.terminalHasBeenCreated.bindTo(this._contextKeyService);
		this._terminalCountContextKey = TerminalContextKeys.count.bindTo(this._contextKeyService);
		this._terminalEditorActive = TerminalContextKeys.terminalEditorActive.bindTo(this._contextKeyService);

		this._register(this.onDidChangeActiveInstance(instance => {
			this._terminalEditorActive.set(!!instance?.target && instance.target === TerminalLocation.Editor);
		}));

		this._register(_lifecycleService.onBeforeShutdown(async e => e.veto(this._onBeforeShutdown(e.reason), 'veto.terminal')));
		this._register(_lifecycleService.onWillShutdown(e => this._onWillShutdown(e)));

		this._initializePrimaryBackend();

		// Create async as the class depends on `this`
		timeout(0).then(() => this._register(this._instantiationService.createInstance(TerminalEditorStyle, mainWindow.document.head)));
	}

	async showProfileQuickPick(type: 'setDefault' | 'createInstance', cwd?: string | URI): Promise<ITerminalInstance | undefined> {
		const quickPick = this._instantiationService.createInstance(TerminalProfileQuickpick);
		const result = await quickPick.showAndGetResult(type);
		if (!result) {
			return;
		}
		if (isString(result)) {
			return;
		}
		const keyMods: IKeyMods | undefined = result.keyMods;
		if (type === 'createInstance') {
			const activeInstance = this.getDefaultInstanceHost().activeInstance;
			const defaultLocation = this._terminalConfigurationService.defaultLocation;
			let instance;

			if (result.config && hasKey(result.config, { id: true })) {
				await this.createContributedTerminalProfile(result.config.extensionIdentifier, result.config.id, {
					icon: result.config.options?.icon,
					color: result.config.options?.color,
					location: !!(keyMods?.alt && activeInstance) ? { splitActiveTerminal: true } : defaultLocation
				});
				return;
			} else if (result.config && hasKey(result.config, { profileName: true })) {
				if (keyMods?.alt && activeInstance) {
					// create split, only valid if there's an active instance
					instance = await this.createTerminal({ location: { parentTerminal: activeInstance }, config: result.config, cwd });
				} else {
					instance = await this.createTerminal({ location: defaultLocation, config: result.config, cwd });
				}
			}

			if (instance && defaultLocation !== TerminalLocation.Editor) {
				this._terminalGroupService.showPanel(true);
				this.setActiveInstance(instance);
				return instance;
			}
		}
		return undefined;
	}

	private async _initializePrimaryBackend() {
		mark('code/terminal/willGetTerminalBackend');
		this._primaryBackend = await this._terminalInstanceService.getBackend(this._environmentService.remoteAuthority);
		mark('code/terminal/didGetTerminalBackend');
		const enableTerminalReconnection = this._terminalConfigurationService.config.enablePersistentSessions;

		// Connect to the extension host if it's there, set the connection state to connected when
		// it's done. This should happen even when there is no extension host.
		this._connectionState = TerminalConnectionState.Connecting;

		const isPersistentRemote = !!this._environmentService.remoteAuthority && enableTerminalReconnection;

		if (this._primaryBackend) {
			this._register(this._primaryBackend.onDidRequestDetach(async (e) => {
				const instanceToDetach = this.getInstanceFromResource(getTerminalUri(e.workspaceId, e.instanceId));
				if (instanceToDetach) {
					const persistentProcessId = instanceToDetach?.persistentProcessId;
					if (persistentProcessId && !instanceToDetach.shellLaunchConfig.isFeatureTerminal && !instanceToDetach.shellLaunchConfig.customPtyImplementation) {
						if (instanceToDetach.target === TerminalLocation.Editor) {
							this._terminalEditorService.detachInstance(instanceToDetach);
						} else {
							this._terminalGroupService.getGroupForInstance(instanceToDetach)?.removeInstance(instanceToDetach);
						}
						await instanceToDetach.detachProcessAndDispose(TerminalExitReason.User);
						await this._primaryBackend?.acceptDetachInstanceReply(e.requestId, persistentProcessId);
					} else {
						// will get rejected without a persistentProcessId to attach to
						await this._primaryBackend?.acceptDetachInstanceReply(e.requestId, undefined);
					}
				}
			}));
		}

		mark('code/terminal/willReconnect');
		let reconnectedPromise: Promise<unknown>;
		if (isPersistentRemote) {
			reconnectedPromise = this._reconnectToRemoteTerminals();
		} else if (enableTerminalReconnection) {
			reconnectedPromise = this._reconnectToLocalTerminals();
		} else {
			reconnectedPromise = Promise.resolve();
		}
		reconnectedPromise.then(async () => {
			this._setConnected();
			mark('code/terminal/didReconnect');
			mark('code/terminal/willReplay');
			const instances = await this._reconnectedTerminalGroups?.then(groups => groups.map(e => e.terminalInstances).flat()) ?? [];
			await Promise.all(instances.map(e => new Promise<void>(r => Event.once(e.onProcessReplayComplete)(r))));
			mark('code/terminal/didReplay');
			mark('code/terminal/willGetPerformanceMarks');
			await Promise.all(Array.from(this._terminalInstanceService.getRegisteredBackends()).map(async backend => {
				this._timerService.setPerformanceMarks(backend.remoteAuthority === undefined ? 'localPtyHost' : 'remotePtyHost', await backend.getPerformanceMarks());
				backend.setReady();
			}));
			mark('code/terminal/didGetPerformanceMarks');
			this._whenConnected.complete();
		});
	}

	getPrimaryBackend(): ITerminalBackend | undefined {
		return this._primaryBackend;
	}

	async setNextCommandId(id: number, commandLine: string, commandId: string): Promise<void> {
		if (!this._primaryBackend || id <= 0) {
			return;
		}
		await this._primaryBackend.setNextCommandId(id, commandLine, commandId);
	}

	private _forwardInstanceHostEvents(host: ITerminalInstanceHost) {
		this._register(host.onDidChangeInstances(this._onDidChangeInstances.fire, this._onDidChangeInstances));
		this._register(host.onDidDisposeInstance(this._onDidDisposeInstance.fire, this._onDidDisposeInstance));
		this._register(host.onDidChangeActiveInstance(instance => this._evaluateActiveInstance(host, instance)));
		this._register(host.onDidFocusInstance(instance => {
			this._onDidFocusInstance.fire(instance);
			this._evaluateActiveInstance(host, instance);
		}));
		this._register(host.onDidChangeInstanceCapability((instance) => {
			this._onDidChangeInstanceCapability.fire(instance);
		}));
		this._hostActiveTerminals.set(host, undefined);
	}

	private _evaluateActiveInstance(host: ITerminalInstanceHost, instance: ITerminalInstance | undefined) {
		// Track the latest active terminal for each host so that when one becomes undefined, the
		// TerminalService's active terminal is set to the last active terminal from the other host.
		// This means if the last terminal editor is closed such that it becomes undefined, the last
		// active group's terminal will be used as the active terminal if available.
		this._hostActiveTerminals.set(host, instance);
		if (instance === undefined) {
			for (const active of this._hostActiveTerminals.values()) {
				if (active) {
					instance = active;
				}
			}
		}
		this._activeInstance = instance;
		this._onDidChangeActiveInstance.fire(instance);
	}

	setActiveInstance(value: ITerminalInstance | undefined) {
		// TODO@meganrogge: Is this the right logic for when instance is undefined?
		if (!value) {
			return;
		}
		// If this was a hideFromUser terminal created by the API this was triggered by show,
		// in which case we need to create the terminal group
		if (value.shellLaunchConfig.hideFromUser) {
			this.showBackgroundTerminal(value);
		}
		if (value.target === TerminalLocation.Editor) {
			this._terminalEditorService.setActiveInstance(value);
		} else {
			this._terminalGroupService.setActiveInstance(value);
		}
	}

	async focusInstance(instance: ITerminalInstance): Promise<void> {
		if (this._activeInstance !== instance) {
			this.setActiveInstance(instance);
		}
		if (instance.target === TerminalLocation.Editor) {
			await this._terminalEditorService.focusInstance(instance);
			return;
		}
		await this._terminalGroupService.focusInstance(instance);
	}

	async focusActiveInstance(): Promise<void> {
		if (!this._activeInstance) {
			return;
		}
		return this.focusInstance(this._activeInstance);
	}

	async createContributedTerminalProfile(extensionIdentifier: string, id: string, options: ICreateContributedTerminalProfileOptions): Promise<void> {
		await this._extensionService.activateByEvent(`onTerminalProfile:${id}`);

		const profileProvider = this._terminalProfileService.getContributedProfileProvider(extensionIdentifier, id);
		if (!profileProvider) {
			this._notificationService.error(`No terminal profile provider registered for id "${id}"`);
			return;
		}
		try {
			await profileProvider.createContributedTerminalProfile(options);
			this._terminalGroupService.setActiveInstanceByIndex(this._terminalGroupService.instances.length - 1);
			await this._terminalGroupService.activeInstance?.focusWhenReady();
		} catch (e) {
			this._notificationService.error(e.message);
		}
	}

	async safeDisposeTerminal(instance: ITerminalInstance): Promise<void> {
		// Confirm on kill in the editor is handled by the editor input
		if (instance.target !== TerminalLocation.Editor &&
			instance.hasChildProcesses &&
			(this._terminalConfigurationService.config.confirmOnKill === 'panel' || this._terminalConfigurationService.config.confirmOnKill === 'always')) {
			const veto = await this._showTerminalCloseConfirmation(true);
			if (veto) {
				return;
			}
		}
		return new Promise<void>(r => {
			Event.once(instance.onExit)(() => r());
			instance.dispose(TerminalExitReason.User);
		});
	}

	private _setConnected() {
		this._connectionState = TerminalConnectionState.Connected;
		this._onDidChangeConnectionState.fire();
		this._logService.trace('Pty host ready');
	}

	private async _reconnectToRemoteTerminals(): Promise<void> {
		const remoteAuthority = this._environmentService.remoteAuthority;
		if (!remoteAuthority) {
			return;
		}
		const backend = await this._terminalInstanceService.getBackend(remoteAuthority);
		if (!backend) {
			return;
		}
		mark('code/terminal/willGetTerminalLayoutInfo');
		const layoutInfo = await backend.getTerminalLayoutInfo();
		mark('code/terminal/didGetTerminalLayoutInfo');
		backend.reduceConnectionGraceTime();
		mark('code/terminal/willRecreateTerminalGroups');
		await this._recreateTerminalGroups(layoutInfo);
		mark('code/terminal/didRecreateTerminalGroups');
		// now that terminals have been restored,
		// attach listeners to update remote when terminals are changed
		this._attachProcessLayoutListeners();

		this._logService.trace('Reconnected to remote terminals');
	}

	private async _reconnectToLocalTerminals(): Promise<void> {
		const localBackend = await this._terminalInstanceService.getBackend();
		if (!localBackend) {
			return;
		}
		mark('code/terminal/willGetTerminalLayoutInfo');
		const layoutInfo = await localBackend.getTerminalLayoutInfo();
		mark('code/terminal/didGetTerminalLayoutInfo');
		if (layoutInfo && (layoutInfo.tabs.length > 0 || layoutInfo?.background?.length)) {
			mark('code/terminal/willRecreateTerminalGroups');
			this._reconnectedTerminalGroups = this._recreateTerminalGroups(layoutInfo);
			const revivedInstances = await this._reviveBackgroundTerminalInstances(layoutInfo.background || []);
			this._backgroundedTerminalInstances = revivedInstances.map(instance => ({ instance }));
			mark('code/terminal/didRecreateTerminalGroups');
		}
		// now that terminals have been restored,
		// attach listeners to update local state when terminals are changed
		this._attachProcessLayoutListeners();

		this._logService.trace('Reconnected to local terminals');
	}

	private _recreateTerminalGroups(layoutInfo?: ITerminalsLayoutInfo): Promise<ITerminalGroup[]> {
		const groupPromises: Promise<ITerminalGroup | undefined>[] = [];
		let activeGroup: Promise<ITerminalGroup | undefined> | undefined;
		if (layoutInfo) {
			for (const tabLayout of layoutInfo.tabs) {
				const terminalLayouts = tabLayout.terminals.filter(t => t.terminal && t.terminal.isOrphan);
				if (terminalLayouts.length) {
					this._restoredGroupCount += terminalLayouts.length;
					const promise = this._recreateTerminalGroup(tabLayout, terminalLayouts);
					groupPromises.push(promise);
					if (tabLayout.isActive) {
						activeGroup = promise;
					}
					const activeInstance = this.instances.find(t => t.shellLaunchConfig.attachPersistentProcess?.id === tabLayout.activePersistentProcessId);
					if (activeInstance) {
						this.setActiveInstance(activeInstance);
					}
				}
			}
			if (layoutInfo.tabs.length) {
				activeGroup?.then(group => this._terminalGroupService.activeGroup = group);
			}
		}
		return Promise.all(groupPromises).then(result => result.filter(e => !!e) as ITerminalGroup[]);
	}

	private async _reviveBackgroundTerminalInstances(bgTerminals: (IPtyHostAttachTarget | null)[]): Promise<ITerminalInstance[]> {
		const instances: ITerminalInstance[] = [];
		for (const bg of bgTerminals) {
			const attachPersistentProcess = bg;
			if (!attachPersistentProcess) {
				continue;
			}
			const instance = await this.createTerminal({ config: { attachPersistentProcess, hideFromUser: true, forcePersist: true }, location: TerminalLocation.Panel });
			instances.push(instance);
		}
		return instances;
	}

	private async _recreateTerminalGroup(tabLayout: IRawTerminalTabLayoutInfo<IPtyHostAttachTarget | null>, terminalLayouts: IRawTerminalInstanceLayoutInfo<IPtyHostAttachTarget | null>[]): Promise<ITerminalGroup | undefined> {
		let lastInstance: Promise<ITerminalInstance> | undefined;
		for (const terminalLayout of terminalLayouts) {
			const attachPersistentProcess = terminalLayout.terminal!;
			if (this._lifecycleService.startupKind !== StartupKind.ReloadedWindow && attachPersistentProcess.type === 'Task') {
				continue;
			}
			mark(`code/terminal/willRecreateTerminal/${attachPersistentProcess.id}-${attachPersistentProcess.pid}`);
			lastInstance = this.createTerminal({
				config: { attachPersistentProcess },
				location: lastInstance ? { parentTerminal: lastInstance } : TerminalLocation.Panel
			});
			lastInstance.then(() => mark(`code/terminal/didRecreateTerminal/${attachPersistentProcess.id}-${attachPersistentProcess.pid}`));
		}
		const group = lastInstance?.then(instance => {
			const g = this._terminalGroupService.getGroupForInstance(instance);
			g?.resizePanes(tabLayout.terminals.map(terminal => terminal.relativeSize));
			return g;
		});
		return group;
	}

	private _attachProcessLayoutListeners(): void {
		this._register(this.onDidChangeActiveGroup(() => this._saveState()));
		this._register(this.onDidChangeActiveInstance(() => this._saveState()));
		this._register(this.onDidChangeInstances(() => this._saveState()));
		// The state must be updated when the terminal is relaunched, otherwise the persistent
		// terminal ID will be stale and the process will be leaked.
		this._register(this.onAnyInstanceProcessIdReady(() => this._saveState()));
		this._register(this.onAnyInstanceTitleChange(instance => this._updateTitle(instance)));
		this._register(this.onAnyInstanceIconChange(e => this._updateIcon(e.instance, e.userInitiated)));
	}

	private _handleInstanceContextKeys(): void {
		const terminalIsOpenContext = TerminalContextKeys.isOpen.bindTo(this._contextKeyService);
		const updateTerminalContextKeys = () => {
			terminalIsOpenContext.set(this.instances.length > 0);
			this._terminalCountContextKey.set(this.instances.length);
		};
		this._register(this.onDidChangeInstances(() => updateTerminalContextKeys()));
	}

	async getActiveOrCreateInstance(options?: { acceptsInput?: boolean }): Promise<ITerminalInstance> {
		const activeInstance = this.activeInstance;
		// No instance, create
		if (!activeInstance) {
			return this.createTerminal();
		}
		// Active instance, ensure accepts input
		if (!options?.acceptsInput || activeInstance.xterm?.isStdinDisabled !== true) {
			return activeInstance;
		}
		// Active instance doesn't accept input, create and focus
		const instance = await this.createTerminal();
		this.setActiveInstance(instance);
		await this.revealActiveTerminal();
		return instance;
	}

	async revealTerminal(source: ITerminalInstance, preserveFocus?: boolean): Promise<void> {
		if (source.target === TerminalLocation.Editor) {
			await this._terminalEditorService.revealActiveEditor(preserveFocus);
		} else {
			await this._terminalGroupService.showPanel();
		}
	}

	async revealActiveTerminal(preserveFocus?: boolean): Promise<void> {
		const instance = this.activeInstance;
		if (!instance) {
			return;
		}
		await this.revealTerminal(instance, preserveFocus);
	}



	requestStartExtensionTerminal(proxy: ITerminalProcessExtHostProxy, cols: number, rows: number): Promise<ITerminalLaunchError | undefined> {
		// The initial request came from the extension host, no need to wait for it
		return new Promise<ITerminalLaunchError | undefined>(callback => {
			this._onDidRequestStartExtensionTerminal.fire({ proxy, cols, rows, callback });
		});
	}

	private _onBeforeShutdown(reason: ShutdownReason): MaybePromise<boolean> {
		// Never veto on web as this would block all windows from being closed. This disables
		// process revive as we can't handle it on shutdown.
		if (isWeb) {
			this._isShuttingDown = true;
			return false;
		}
		return this._onBeforeShutdownAsync(reason);
	}

	private async _onBeforeShutdownAsync(reason: ShutdownReason): Promise<boolean> {
		if (this.instances.length === 0) {
			// No terminal instances, don't veto
			return false;
		}

		// Persist terminal _buffer state_, note that even if this happens the dirty terminal prompt
		// still shows as that cannot be revived
		try {
			this._shutdownWindowCount = await this._nativeDelegate?.getWindowCount();
			const shouldReviveProcesses = this._shouldReviveProcesses(reason);
			if (shouldReviveProcesses) {
				// Attempt to persist the terminal state but only allow 2000ms as we can't block
				// shutdown. This can happen when in a remote workspace but the other side has been
				// suspended and is in the process of reconnecting, the message will be put in a
				// queue in this case for when the connection is back up and running. Aborting the
				// process is preferable in this case.
				await Promise.race([
					this._primaryBackend?.persistTerminalState(),
					timeout(2000)
				]);
			}

			// Persist terminal _processes_
			const shouldPersistProcesses = this._terminalConfigurationService.config.enablePersistentSessions && reason === ShutdownReason.RELOAD;
			if (!shouldPersistProcesses) {
				const hasDirtyInstances = (
					(this._terminalConfigurationService.config.confirmOnExit === 'always' && this.foregroundInstances.length > 0) ||
					(this._terminalConfigurationService.config.confirmOnExit === 'hasChildProcesses' && this.foregroundInstances.some(e => e.hasChildProcesses))
				);
				if (hasDirtyInstances) {
					return this._onBeforeShutdownConfirmation(reason);
				}
			}
		} catch (err: unknown) {
			// Swallow as exceptions should not cause a veto to prevent shutdown
			this._logService.warn('Exception occurred during terminal shutdown', err);
		}

		this._isShuttingDown = true;

		return false;
	}

	setNativeDelegate(nativeDelegate: ITerminalServiceNativeDelegate): void {
		this._nativeDelegate = nativeDelegate;
	}

	private _shouldReviveProcesses(reason: ShutdownReason): boolean {
		if (!this._terminalConfigurationService.config.enablePersistentSessions) {
			return false;
		}
		switch (this._terminalConfigurationService.config.persistentSessionReviveProcess) {
			case 'onExit': {
				// Allow on close if it's the last window on Windows or Linux
				if (reason === ShutdownReason.CLOSE && (this._shutdownWindowCount === 1 && !isMacintosh)) {
					return true;
				}
				return reason === ShutdownReason.LOAD || reason === ShutdownReason.QUIT;
			}
			case 'onExitAndWindowClose': return reason !== ShutdownReason.RELOAD;
			default: return false;
		}
	}

	private async _onBeforeShutdownConfirmation(reason: ShutdownReason): Promise<boolean> {
		// veto if configured to show confirmation and the user chose not to exit
		const veto = await this._showTerminalCloseConfirmation();
		if (!veto) {
			this._isShuttingDown = true;
		}

		return veto;
	}

	private _onWillShutdown(e: WillShutdownEvent): void {
		// Don't touch processes if the shutdown was a result of reload as they will be reattached
		const shouldPersistTerminals = this._terminalConfigurationService.config.enablePersistentSessions && e.reason === ShutdownReason.RELOAD;

		for (const instance of [...this._terminalGroupService.instances, ...this._backgroundedTerminalInstances.map(bg => bg.instance)]) {
			if (shouldPersistTerminals && instance.shouldPersist) {
				instance.detachProcessAndDispose(TerminalExitReason.Shutdown);
			} else {
				instance.dispose(TerminalExitReason.Shutdown);
			}
		}

		// Clear terminal layout info only when not persisting
		if (!shouldPersistTerminals && !this._shouldReviveProcesses(e.reason)) {
			this._primaryBackend?.setTerminalLayoutInfo(undefined);
		}
	}

	@debounce(500)
	private _saveState(): void {
		// Avoid saving state when shutting down as that would override process state to be revived
		if (this._isShuttingDown) {
			return;
		}
		if (!this._terminalConfigurationService.config.enablePersistentSessions) {
			return;
		}
		const tabs = this._terminalGroupService.groups.map(g => g.getLayoutInfo(g === this._terminalGroupService.activeGroup));
		const state: ITerminalsLayoutInfoById = { tabs, background: this._backgroundedTerminalInstances.map(bg => bg.instance).filter(i => i.shellLaunchConfig.forcePersist).map(i => i.persistentProcessId).filter((e): e is number => e !== undefined) };
		this._primaryBackend?.setTerminalLayoutInfo(state);
	}

	@debounce(500)
	private _updateTitle(instance: ITerminalInstance | undefined): void {
		if (!this._terminalConfigurationService.config.enablePersistentSessions || !instance || !instance.persistentProcessId || !instance.title || instance.isDisposed) {
			return;
		}
		if (instance.staticTitle) {
			this._primaryBackend?.updateTitle(instance.persistentProcessId, instance.staticTitle, TitleEventSource.Api);
		} else {
			this._primaryBackend?.updateTitle(instance.persistentProcessId, instance.title, instance.titleSource);
		}
	}

	@debounce(500)
	private _updateIcon(instance: ITerminalInstance, userInitiated: boolean): void {
		if (!this._terminalConfigurationService.config.enablePersistentSessions || !instance || !instance.persistentProcessId || !instance.icon || instance.isDisposed) {
			return;
		}
		this._primaryBackend?.updateIcon(instance.persistentProcessId, userInitiated, instance.icon, instance.color);
	}

	refreshActiveGroup(): void {
		this._onDidChangeActiveGroup.fire(this._terminalGroupService.activeGroup);
	}

	getInstanceFromId(terminalId: number): ITerminalInstance | undefined {
		let bgIndex = -1;
		this._backgroundedTerminalInstances.forEach((bg, i) => {
			if (bg.instance.instanceId === terminalId) {
				bgIndex = i;
			}
		});
		if (bgIndex !== -1) {
			return this._backgroundedTerminalInstances[bgIndex].instance;
		}
		try {
			return this.instances[this._getIndexFromId(terminalId)];
		} catch {
			return undefined;
		}
	}

	getInstanceFromResource(resource: URI | undefined): ITerminalInstance | undefined {
		return getInstanceFromResource(this.instances, resource);
	}

	openResource(resource: URI): void {
		const instance = this.getInstanceFromResource(resource);
		if (instance) {
			this.setActiveInstance(instance);
			this.revealTerminal(instance);
			const commands = instance.capabilities.get(TerminalCapability.CommandDetection)?.commands;
			const params = new URLSearchParams(resource.query);
			const relevantCommand = commands?.find(c => c.id === params.get('command'));
			if (relevantCommand) {
				instance.xterm?.markTracker.revealCommand(relevantCommand);
			}
		}
	}

	isAttachedToTerminal(remoteTerm: IRemoteTerminalAttachTarget): boolean {
		return this.instances.some(term => term.processId === remoteTerm.pid);
	}

	moveToEditor(source: ITerminalInstance, group?: GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE | AUX_WINDOW_GROUP_TYPE): void {
		if (source.target === TerminalLocation.Editor) {
			return;
		}
		const sourceGroup = this._terminalGroupService.getGroupForInstance(source);
		if (!sourceGroup) {
			return;
		}
		sourceGroup.removeInstance(source);
		this._terminalEditorService.openEditor(source, group ? { viewColumn: group } : undefined);

	}

	moveIntoNewEditor(source: ITerminalInstance): void {
		this.moveToEditor(source, AUX_WINDOW_GROUP);
	}

	async moveToTerminalView(source?: ITerminalInstance | URI, target?: ITerminalInstance, side?: 'before' | 'after'): Promise<void> {
		if (URI.isUri(source)) {
			source = this.getInstanceFromResource(source);
		}

		if (!source) {
			return;
		}

		this._terminalEditorService.detachInstance(source);

		if (source.target !== TerminalLocation.Editor) {
			await this._terminalGroupService.showPanel(true);
			return;
		}
		source.target = TerminalLocation.Panel;

		let group: ITerminalGroup | undefined;
		if (target) {
			group = this._terminalGroupService.getGroupForInstance(target);
		}

		if (!group) {
			group = this._terminalGroupService.createGroup();
		}

		group.addInstance(source);
		this.setActiveInstance(source);
		await this._terminalGroupService.showPanel(true);

		if (target && side) {
			const index = group.terminalInstances.indexOf(target) + (side === 'after' ? 1 : 0);
			group.moveInstance(source, index, side);
		}

		// Fire events
		this._onDidChangeInstances.fire();
		this._onDidChangeActiveGroup.fire(this._terminalGroupService.activeGroup);
	}

	protected _initInstanceListeners(instance: ITerminalInstance): void {
		const instanceDisposables = new DisposableStore();
		instanceDisposables.add(instance.onDimensionsChanged(() => {
			this._onDidChangeInstanceDimensions.fire(instance);
			if (this._terminalConfigurationService.config.enablePersistentSessions && this.isProcessSupportRegistered) {
				this._saveState();
			}
		}));
		instanceDisposables.add(instance.onDidFocus(this._onDidChangeActiveInstance.fire, this._onDidChangeActiveInstance));
		instanceDisposables.add(instance.onRequestAddInstanceToGroup(async e => await this._addInstanceToGroup(instance, e)));
		instanceDisposables.add(instance.onDidChangeShellType(() => this._extensionService.activateByEvent(`onTerminal:${instance.shellType}`)));
		instanceDisposables.add(Event.runAndSubscribe(instance.capabilities.onDidAddCapability, (() => {
			if (instance.capabilities.has(TerminalCapability.CommandDetection)) {
				this._extensionService.activateByEvent(`onTerminalShellIntegration:${instance.shellType}`);
			}
		})));
		const disposeListener = this._register(instance.onDisposed(() => {
			instanceDisposables.dispose();
			this._store.delete(disposeListener);
		}));
	}

	private async _addInstanceToGroup(instance: ITerminalInstance, e: IRequestAddInstanceToGroupEvent): Promise<void> {
		const terminalIdentifier = parseTerminalUri(e.uri);
		if (terminalIdentifier.instanceId === undefined) {
			return;
		}

		let sourceInstance: ITerminalInstance | undefined = this.getInstanceFromResource(e.uri);

		// Terminal from a different window
		if (!sourceInstance) {
			const attachPersistentProcess = await this._primaryBackend?.requestDetachInstance(terminalIdentifier.workspaceId, terminalIdentifier.instanceId);
			if (attachPersistentProcess) {
				sourceInstance = await this.createTerminal({ config: { attachPersistentProcess }, resource: e.uri });
				this._terminalGroupService.moveInstance(sourceInstance, instance, e.side);
				return;
			}
		}

		// View terminals
		sourceInstance = this._terminalGroupService.getInstanceFromResource(e.uri);
		if (sourceInstance) {
			this._terminalGroupService.moveInstance(sourceInstance, instance, e.side);
			return;
		}

		// Terminal editors
		sourceInstance = this._terminalEditorService.getInstanceFromResource(e.uri);
		if (sourceInstance) {
			this.moveToTerminalView(sourceInstance, instance, e.side);
			return;
		}
		return;
	}

	registerProcessSupport(isSupported: boolean): void {
		if (!isSupported) {
			return;
		}
		this._processSupportContextKey.set(isSupported);
		this._onDidRegisterProcessSupport.fire();
	}

	// TODO: Remove this, it should live in group/editor servioce
	private _getIndexFromId(terminalId: number): number {
		let terminalIndex = -1;
		this.instances.forEach((terminalInstance, i) => {
			if (terminalInstance.instanceId === terminalId) {
				terminalIndex = i;
			}
		});
		if (terminalIndex === -1) {
			throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
		}
		return terminalIndex;
	}

	protected async _showTerminalCloseConfirmation(singleTerminal?: boolean): Promise<boolean> {
		let message: string;
		const foregroundInstances = this.foregroundInstances;
		if (foregroundInstances.length === 1 || singleTerminal) {
			message = nls.localize('terminalService.terminalCloseConfirmationSingular', "Do you want to terminate the active terminal session?");
		} else {
			message = nls.localize('terminalService.terminalCloseConfirmationPlural', "Do you want to terminate the {0} active terminal sessions?", foregroundInstances.length);
		}
		const { confirmed } = await this._dialogService.confirm({
			type: 'warning',
			message,
			primaryButton: nls.localize({ key: 'terminate', comment: ['&& denotes a mnemonic'] }, "&&Terminate")
		});
		return !confirmed;
	}

	getDefaultInstanceHost(): ITerminalInstanceHost {
		if (this._terminalConfigurationService.defaultLocation === TerminalLocation.Editor) {
			return this._terminalEditorService;
		}
		return this._terminalGroupService;
	}

	async getInstanceHost(location: ITerminalLocationOptions | undefined): Promise<ITerminalInstanceHost> {
		if (location) {
			if (location === TerminalLocation.Editor) {
				return this._terminalEditorService;
			} else if (typeof location === 'object') {
				if (hasKey(location, { viewColumn: true })) {
					return this._terminalEditorService;
				} else if (hasKey(location, { parentTerminal: true })) {
					return (await location.parentTerminal).target === TerminalLocation.Editor ? this._terminalEditorService : this._terminalGroupService;
				}
			} else {
				return this._terminalGroupService;
			}
		}
		return this;
	}

	async createTerminal(options?: ICreateTerminalOptions): Promise<ITerminalInstance> {
		// Await the initialization of available profiles as long as this is not a pty terminal or a
		// local terminal in a remote workspace as profile won't be used in those cases and these
		// terminals need to be launched before remote connections are established.
		const isLocalInRemoteTerminal = this._remoteAgentService.getConnection() && URI.isUri(options?.cwd) && options?.cwd.scheme === Schemas.file;
		if (this._terminalProfileService.availableProfiles.length === 0) {
			const isPtyTerminal = options?.config && hasKey(options.config, { customPtyImplementation: true });
			if (!isPtyTerminal && !isLocalInRemoteTerminal) {
				if (this._connectionState === TerminalConnectionState.Connecting) {
					mark(`code/terminal/willGetProfiles`);
				}
				await this._terminalProfileService.profilesReady;
				if (this._connectionState === TerminalConnectionState.Connecting) {
					mark(`code/terminal/didGetProfiles`);
				}
			}
		}

		let config = options?.config;
		if (!config && isLocalInRemoteTerminal) {
			const backend = await this._terminalInstanceService.getBackend(undefined);
			const executable = await backend?.getDefaultSystemShell();
			if (executable) {
				config = { executable };
			}
		}

		if (!config) {
			config = this._terminalProfileService.getDefaultProfile();
		}
		const shellLaunchConfig = config && hasKey(config, { extensionIdentifier: true }) ? {} : this._terminalInstanceService.convertProfileToShellLaunchConfig(config || {});

		// Get the contributed profile if it was provided
		const contributedProfile = options?.skipContributedProfileCheck ? undefined : await this._getContributedProfile(shellLaunchConfig, options);

		const splitActiveTerminal = typeof options?.location === 'object' && hasKey(options.location, { splitActiveTerminal: true })
			? options.location.splitActiveTerminal
			: typeof options?.location === 'object' ? hasKey(options.location, { parentTerminal: true }) : false;

		await this._resolveCwd(shellLaunchConfig, splitActiveTerminal, options);

		// Launch the contributed profile
		// If it's a custom pty implementation, we did not await the profiles ready, so
		// we cannot launch the contributed profile and doing so would cause an error
		if (!shellLaunchConfig.customPtyImplementation && contributedProfile) {
			const resolvedLocation = await this.resolveLocation(options?.location);
			let location: TerminalLocation | { viewColumn: number; preserveState?: boolean } | { splitActiveTerminal: boolean } | undefined;
			if (splitActiveTerminal) {
				location = resolvedLocation === TerminalLocation.Editor ? { viewColumn: SIDE_GROUP } : { splitActiveTerminal: true };
			} else {
				location = typeof options?.location === 'object' && hasKey(options.location, { viewColumn: true }) ? options.location : resolvedLocation;
			}
			await this.createContributedTerminalProfile(contributedProfile.extensionIdentifier, contributedProfile.id, {
				icon: contributedProfile.icon,
				color: contributedProfile.color,
				location,
				cwd: shellLaunchConfig.cwd,
			});
			const instanceHost = resolvedLocation === TerminalLocation.Editor ? this._terminalEditorService : this._terminalGroupService;
			// TODO@meganrogge: This returns undefined in the remote & web smoke tests but the function
			// does not return undefined. This should be handled correctly.
			const instance = instanceHost.instances[instanceHost.instances.length - 1];
			await instance?.focusWhenReady();
			this._terminalHasBeenCreated.set(true);
			return instance;
		}

		if (!shellLaunchConfig.customPtyImplementation && !this.isProcessSupportRegistered) {
			throw new Error('Could not create terminal when process support is not registered');
		}

		this._evaluateLocalCwd(shellLaunchConfig);
		const location = await this.resolveLocation(options?.location) || this._terminalConfigurationService.defaultLocation;

		if (shellLaunchConfig.hideFromUser) {
			const instance = this._terminalInstanceService.createInstance(shellLaunchConfig, location);
			this._backgroundedTerminalInstances.push({ instance, terminalLocationOptions: options?.location });
			this._backgroundedTerminalDisposables.set(instance.instanceId, [
				instance.onDisposed(instance => {
					const idx = this._backgroundedTerminalInstances.findIndex(bg => bg.instance === instance);
					if (idx !== -1) {
						this._backgroundedTerminalInstances.splice(idx, 1);
					}
					this._onDidDisposeInstance.fire(instance);
				})
			]);
			this._onDidChangeInstances.fire();
			return instance;
		}

		const parent = await this._getSplitParent(options?.location);
		this._terminalHasBeenCreated.set(true);
		this._extensionService.activateByEvent('onTerminal:*');
		let instance;
		if (parent) {
			instance = this._splitTerminal(shellLaunchConfig, location, parent);
		} else {
			instance = this._createTerminal(shellLaunchConfig, location, options);
		}
		if (instance.shellType) {
			this._extensionService.activateByEvent(`onTerminal:${instance.shellType}`);
		}

		return instance;
	}

	async createAndFocusTerminal(options?: ICreateTerminalOptions): Promise<ITerminalInstance> {
		const instance = await this.createTerminal(options);
		this.setActiveInstance(instance);
		await instance.focusWhenReady();
		return instance;
	}

	private async _getContributedProfile(shellLaunchConfig: IShellLaunchConfig, options?: ICreateTerminalOptions): Promise<IExtensionTerminalProfile | undefined> {
		if (options?.config && hasKey(options.config, { extensionIdentifier: true })) {
			return options.config;
		}

		return this._terminalProfileService.getContributedDefaultProfile(shellLaunchConfig);
	}

	async createDetachedTerminal(options: IDetachedXTermOptions): Promise<IDetachedTerminalInstance> {
		const ctor = await TerminalInstance.getXtermConstructor(this._keybindingService, this._contextKeyService);
		const capabilities = options.capabilities ?? new TerminalCapabilityStore();
		const xterm = this._instantiationService.createInstance(XtermTerminal, undefined, ctor, {
			cols: options.cols,
			rows: options.rows,
			xtermColorProvider: options.colorProvider,
			capabilities,
			disableOverviewRuler: options.disableOverviewRuler,
		}, undefined);

		if (options.readonly) {
			xterm.raw.attachCustomKeyEventHandler(() => false);
		}

		const instance = new DetachedTerminal(xterm, { ...options, capabilities }, this._instantiationService);
		this._detachedXterms.add(instance);
		const l = xterm.onDidDispose(() => {
			this._detachedXterms.delete(instance);
			l.dispose();
		});

		return instance;
	}

	private async _resolveCwd(shellLaunchConfig: IShellLaunchConfig, splitActiveTerminal: boolean, options?: ICreateTerminalOptions): Promise<void> {
		const cwd = shellLaunchConfig.cwd;
		if (!cwd) {
			if (options?.cwd) {
				shellLaunchConfig.cwd = options.cwd;
			} else if (splitActiveTerminal && options?.location) {
				let parent = this.activeInstance;
				if (typeof options.location === 'object' && hasKey(options.location, { parentTerminal: true })) {
					parent = await options.location.parentTerminal;
				}
				if (!parent) {
					throw new Error('Cannot split without an active instance');
				}
				shellLaunchConfig.cwd = await getCwdForSplit(parent, this._workspaceContextService.getWorkspace().folders, this._commandService, this._terminalConfigurationService);
			}
		}
	}

	private _splitTerminal(shellLaunchConfig: IShellLaunchConfig, location: TerminalLocation, parent: ITerminalInstance): ITerminalInstance {
		let instance;
		// Use the URI from the base instance if it exists, this will correctly split local terminals
		if (typeof shellLaunchConfig.cwd !== 'object' && typeof parent.shellLaunchConfig.cwd === 'object') {
			shellLaunchConfig.cwd = URI.from({
				scheme: parent.shellLaunchConfig.cwd.scheme,
				authority: parent.shellLaunchConfig.cwd.authority,
				path: shellLaunchConfig.cwd || parent.shellLaunchConfig.cwd.path
			});
		}
		if (location === TerminalLocation.Editor || parent.target === TerminalLocation.Editor) {
			instance = this._terminalEditorService.splitInstance(parent, shellLaunchConfig);
		} else {
			const group = this._terminalGroupService.getGroupForInstance(parent);
			if (!group) {
				throw new Error(`Cannot split a terminal without a group (instanceId: ${parent.instanceId}, title: ${parent.title})`);
			}
			shellLaunchConfig.parentTerminalId = parent.instanceId;
			instance = group.split(shellLaunchConfig);
		}
		return instance;
	}

	private _createTerminal(shellLaunchConfig: IShellLaunchConfig, location: TerminalLocation, options?: ICreateTerminalOptions): ITerminalInstance {
		let instance;
		if (location === TerminalLocation.Editor) {
			instance = this._terminalInstanceService.createInstance(shellLaunchConfig, TerminalLocation.Editor);
			if (!shellLaunchConfig.hideFromUser) {
				const editorOptions = this._getEditorOptions(options?.location);
				this._terminalEditorService.openEditor(instance, editorOptions);
			}
		} else {
			// TODO: pass resource?
			const group = this._terminalGroupService.createGroup(shellLaunchConfig);
			instance = group.terminalInstances[0];
		}
		return instance;
	}

	async resolveLocation(location?: ITerminalLocationOptions): Promise<TerminalLocation | undefined> {
		if (location && typeof location === 'object') {
			if (hasKey(location, { parentTerminal: true })) {
				// since we don't set the target unless it's an editor terminal, this is necessary
				const parentTerminal = await location.parentTerminal;
				return !parentTerminal.target ? TerminalLocation.Panel : parentTerminal.target;
			} else if (hasKey(location, { viewColumn: true })) {
				return TerminalLocation.Editor;
			} else if (hasKey(location, { splitActiveTerminal: true })) {
				// since we don't set the target unless it's an editor terminal, this is necessary
				return !this._activeInstance?.target ? TerminalLocation.Panel : this._activeInstance?.target;
			}
		}
		return location;
	}

	private async _getSplitParent(location?: ITerminalLocationOptions): Promise<ITerminalInstance | undefined> {
		if (location && typeof location === 'object' && hasKey(location, { parentTerminal: true })) {
			return location.parentTerminal;
		} else if (location && typeof location === 'object' && hasKey(location, { splitActiveTerminal: true })) {
			return this.activeInstance;
		}
		return undefined;
	}

	private _getEditorOptions(location?: ITerminalLocationOptions): TerminalEditorLocation | undefined {
		if (location && typeof location === 'object' && hasKey(location, { viewColumn: true })) {
			// Terminal-specific workaround to resolve the active group in auxiliary windows to
			// override the locked editor behavior.
			if (location.viewColumn === ACTIVE_GROUP && isAuxiliaryWindow(getActiveWindow())) {
				location.viewColumn = this._editorGroupsService.activeGroup.id;
				return location;
			}
			location.viewColumn = columnToEditorGroup(this._editorGroupsService, this._configurationService, location.viewColumn);
			return location;
		}
		return undefined;
	}

	private _evaluateLocalCwd(shellLaunchConfig: IShellLaunchConfig) {
		// Add welcome message and title annotation for local terminals launched within remote or
		// virtual workspaces
		if (!isString(shellLaunchConfig.cwd) && shellLaunchConfig.cwd?.scheme === Schemas.file) {
			if (VirtualWorkspaceContext.getValue(this._contextKeyService)) {
				shellLaunchConfig.initialText = formatMessageForTerminal(nls.localize('localTerminalVirtualWorkspace', "This shell is open to a {0}local{1} folder, NOT to the virtual folder", '\x1b[3m', '\x1b[23m'), { excludeLeadingNewLine: true, loudFormatting: true });
				shellLaunchConfig.type = 'Local';
			} else if (this._remoteAgentService.getConnection()) {
				shellLaunchConfig.initialText = formatMessageForTerminal(nls.localize('localTerminalRemote', "This shell is running on your {0}local{1} machine, NOT on the connected remote machine", '\x1b[3m', '\x1b[23m'), { excludeLeadingNewLine: true, loudFormatting: true });
				shellLaunchConfig.type = 'Local';
			}
		}
	}

	public async showBackgroundTerminal(instance: ITerminalInstance, suppressSetActive?: boolean): Promise<void> {
		const index = this._backgroundedTerminalInstances.findIndex(bg => bg.instance === instance);
		if (index === -1) {
			return;
		}
		const backgroundTerminal = this._backgroundedTerminalInstances[index];
		this._backgroundedTerminalInstances.splice(index, 1);
		const disposables = this._backgroundedTerminalDisposables.get(instance.instanceId);
		if (disposables) {
			dispose(disposables);
		}
		this._backgroundedTerminalDisposables.delete(instance.instanceId);
		if (instance.target === TerminalLocation.Panel) {
			this._terminalGroupService.createGroup(instance);

			// Make active automatically if it's the first instance
			if (this.instances.length === 1 && !suppressSetActive) {
				this._terminalGroupService.setActiveInstanceByIndex(0);
			}
		} else {
			const editorOptions = backgroundTerminal.terminalLocationOptions ? this._getEditorOptions(backgroundTerminal.terminalLocationOptions) : this._getEditorOptions(instance.target);
			this._terminalEditorService.openEditor(instance, editorOptions);
		}

		this._onDidChangeInstances.fire();
	}

	async setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): Promise<void> {
		this._terminalConfigurationService.setPanelContainer(panelContainer);
		this._terminalGroupService.setContainer(terminalContainer);
	}



	createOnInstanceEvent<T>(getEvent: (instance: ITerminalInstance) => Event<T>): DynamicListEventMultiplexer<ITerminalInstance, T> {
		return new DynamicListEventMultiplexer(this.instances, this.onDidCreateInstance, this.onDidDisposeInstance, getEvent);
	}

	createOnInstanceCapabilityEvent<T extends TerminalCapability, K>(capabilityId: T, getEvent: (capability: ITerminalCapabilityImplMap[T]) => Event<K>): IDynamicListEventMultiplexer<{ instance: ITerminalInstance; data: K }> {
		return createInstanceCapabilityEventMultiplexer(this.instances, this.onDidCreateInstance, this.onDidDisposeInstance, capabilityId, getEvent);
	}
}

class TerminalEditorStyle extends Themable {
	private _styleElement: HTMLElement;

	constructor(
		container: HTMLElement,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IThemeService private readonly _themeService: IThemeService,
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		@IEditorService private readonly _editorService: IEditorService
	) {
		super(_themeService);
		this._registerListeners();
		this._styleElement = domStylesheets.createStyleSheet(container);
		this._register(toDisposable(() => this._styleElement.remove()));
		this.updateStyles();
	}

	private _registerListeners(): void {
		this._register(this._terminalService.onAnyInstanceIconChange(() => this.updateStyles()));
		this._register(this._terminalService.onDidCreateInstance(() => this.updateStyles()));
		this._register(this._editorService.onDidActiveEditorChange(() => {
			if (this._editorService.activeEditor instanceof TerminalEditorInput) {
				this.updateStyles();
			}
		}));
		this._register(this._editorService.onDidCloseEditor(() => {
			if (this._editorService.activeEditor instanceof TerminalEditorInput) {
				this.updateStyles();
			}
		}));
		this._register(this._terminalProfileService.onDidChangeAvailableProfiles(() => this.updateStyles()));
	}

	override updateStyles(): void {
		super.updateStyles();
		const colorTheme = this._themeService.getColorTheme();

		// TODO: add a rule collector to avoid duplication
		let css = '';

		const productIconTheme = this._themeService.getProductIconTheme();

		// Add icons
		for (const instance of this._terminalService.instances) {
			const icon = instance.icon;
			if (!icon) {
				continue;
			}
			let uri = undefined;
			if (icon instanceof URI) {
				uri = icon;
			} else if (icon instanceof Object && hasKey(icon, { light: true, dark: true })) {
				uri = isDark(colorTheme.type) ? icon.dark : icon.light;
			}
			const iconClasses = getUriClasses(instance, colorTheme.type);
			if (uri instanceof URI && iconClasses && iconClasses.length > 1) {
				css += (
					cssValue.inline`.monaco-workbench .terminal-tab.${cssValue.className(iconClasses[0])}::before
					{content: ''; background-image: ${cssValue.asCSSUrl(uri)};}`
				);
			}
			if (ThemeIcon.isThemeIcon(icon)) {
				const iconRegistry = getIconRegistry();
				const iconContribution = iconRegistry.getIcon(icon.id);
				if (iconContribution) {
					const def = productIconTheme.getIcon(iconContribution);
					if (def) {
						css += cssValue.inline`.monaco-workbench .terminal-tab.codicon-${cssValue.className(icon.id)}::before
							{content: ${cssValue.stringValue(def.fontCharacter)} !important; font-family: ${cssValue.stringValue(def.font?.id ?? 'codicon')} !important;}`;
					}
				}
			}
		}

		// Add colors
		const iconForegroundColor = colorTheme.getColor(iconForeground);
		if (iconForegroundColor) {
			css += cssValue.inline`.monaco-workbench .show-file-icons .file-icon.terminal-tab::before { color: ${iconForegroundColor}; }`;
		}

		css += getColorStyleContent(colorTheme, true);
		this._styleElement.textContent = css;
	}
}
