/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { DeferredPromise, timeout } from 'vs/base/common/async';
import { debounce } from 'vs/base/common/decorators';
import { DynamicListEventMultiplexer, Emitter, Event, IDynamicListEventMultiplexer } from 'vs/base/common/event';
import { Disposable, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isMacintosh, isWeb } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IKeyMods } from 'vs/platform/quickinput/common/quickInput';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ICreateContributedTerminalProfileOptions, IPtyHostAttachTarget, IRawTerminalInstanceLayoutInfo, IRawTerminalTabLayoutInfo, IShellLaunchConfig, ITerminalBackend, ITerminalLaunchError, ITerminalLogService, ITerminalsLayoutInfo, ITerminalsLayoutInfoById, TerminalExitReason, TerminalLocation, TerminalLocationString, TitleEventSource } from 'vs/platform/terminal/common/terminal';
import { formatMessageForTerminal } from 'vs/platform/terminal/common/terminalStrings';
import { iconForeground } from 'vs/platform/theme/common/colorRegistry';
import { getIconRegistry } from 'vs/platform/theme/common/iconRegistry';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { VirtualWorkspaceContext } from 'vs/workbench/common/contextkeys';
import { IEditableData, IViewsService } from 'vs/workbench/common/views';
import { ICreateTerminalOptions, IDetachedTerminalInstance, IDetachedXTermOptions, IRequestAddInstanceToGroupEvent, ITerminalEditorService, ITerminalGroup, ITerminalGroupService, ITerminalInstance, ITerminalInstanceHost, ITerminalInstanceService, ITerminalLocationOptions, ITerminalService, ITerminalServiceNativeDelegate, IXtermTerminal, TerminalConnectionState, TerminalEditorLocation } from 'vs/workbench/contrib/terminal/browser/terminal';
import { getCwdForSplit } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { TerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorInput';
import { getColorStyleContent, getUriClasses } from 'vs/workbench/contrib/terminal/browser/terminalIcon';
import { TerminalProfileQuickpick } from 'vs/workbench/contrib/terminal/browser/terminalProfileQuickpick';
import { getInstanceFromResource, getTerminalUri, parseTerminalUri } from 'vs/workbench/contrib/terminal/browser/terminalUri';
import { TerminalViewPane } from 'vs/workbench/contrib/terminal/browser/terminalView';
import { IRemoteTerminalAttachTarget, IStartExtensionTerminalRequest, ITerminalConfigHelper, ITerminalProcessExtHostProxy, ITerminalProfileService, TERMINAL_VIEW_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { columnToEditorGroup } from 'vs/workbench/services/editor/common/editorGroupColumn';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ILifecycleService, ShutdownReason, StartupKind, WillShutdownEvent } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { XtermTerminal } from 'vs/workbench/contrib/terminal/browser/xterm/xtermTerminal';
import { TerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { ITimerService } from 'vs/workbench/services/timer/browser/timerService';
import { mark } from 'vs/base/common/performance';
import { DeatachedTerminal } from 'vs/workbench/contrib/terminal/browser/detachedTerminal';
import { ITerminalCapabilityImplMap, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { createInstanceCapabilityEventMultiplexer } from 'vs/workbench/contrib/terminal/browser/terminalEvents';

export class TerminalService extends Disposable implements ITerminalService {
	declare _serviceBrand: undefined;

	private _hostActiveTerminals: Map<ITerminalInstanceHost, ITerminalInstance | undefined> = new Map();

	private _detachedXterms = new Set<IXtermTerminal>();
	private _terminalEditorActive: IContextKey<boolean>;
	private readonly _terminalShellTypeContextKey: IContextKey<string>;

	private _isShuttingDown: boolean = false;
	private _backgroundedTerminalInstances: ITerminalInstance[] = [];
	private _backgroundedTerminalDisposables: Map<number, IDisposable[]> = new Map();
	private _processSupportContextKey: IContextKey<boolean>;

	private _primaryBackend?: ITerminalBackend;
	private _terminalHasBeenCreated: IContextKey<boolean>;
	private _terminalCountContextKey: IContextKey<number>;
	private _configHelper: TerminalConfigHelper;
	private _nativeDelegate?: ITerminalServiceNativeDelegate;
	private _shutdownWindowCount?: number;

	private _editable: { instance: ITerminalInstance; data: IEditableData } | undefined;

	get isProcessSupportRegistered(): boolean { return !!this._processSupportContextKey.get(); }

	private _connectionState: TerminalConnectionState = TerminalConnectionState.Connecting;
	get connectionState(): TerminalConnectionState { return this._connectionState; }

	private readonly _whenConnected = new DeferredPromise<void>();
	get whenConnected(): Promise<void> { return this._whenConnected.p; }

	private _restoredGroupCount: number = 0;
	get restoredGroupCount(): number { return this._restoredGroupCount; }

	get configHelper(): ITerminalConfigHelper { return this._configHelper; }
	get instances(): ITerminalInstance[] {
		return this._terminalGroupService.instances.concat(this._terminalEditorService.instances);
	}
	get detachedXterms(): Iterable<IXtermTerminal> {
		return this._detachedXterms;
	}

	private _reconnectedTerminalGroups: Promise<ITerminalGroup[]> | undefined;

	private _reconnectedTerminals: Map<string, ITerminalInstance[]> = new Map();
	getReconnectedTerminals(reconnectionOwner: string): ITerminalInstance[] | undefined {
		return this._reconnectedTerminals.get(reconnectionOwner);
	}

	get defaultLocation(): TerminalLocation { return this.configHelper.config.defaultLocation === TerminalLocationString.Editor ? TerminalLocation.Editor : TerminalLocation.Panel; }

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

	private _editingTerminal: ITerminalInstance | undefined;

	private readonly _onDidChangeActiveGroup = this._register(new Emitter<ITerminalGroup | undefined>());
	get onDidChangeActiveGroup(): Event<ITerminalGroup | undefined> { return this._onDidChangeActiveGroup.event; }
	private readonly _onDidCreateInstance = this._register(new Emitter<ITerminalInstance>());
	get onDidCreateInstance(): Event<ITerminalInstance> { return this._onDidCreateInstance.event; }
	private readonly _onDidDisposeInstance = this._register(new Emitter<ITerminalInstance>());
	get onDidDisposeInstance(): Event<ITerminalInstance> { return this._onDidDisposeInstance.event; }
	private readonly _onDidFocusInstance = this._register(new Emitter<ITerminalInstance>());
	get onDidFocusInstance(): Event<ITerminalInstance> { return this._onDidFocusInstance.event; }
	private readonly _onDidReceiveProcessId = this._register(new Emitter<ITerminalInstance>());
	get onDidReceiveProcessId(): Event<ITerminalInstance> { return this._onDidReceiveProcessId.event; }
	private readonly _onDidRequestStartExtensionTerminal = this._register(new Emitter<IStartExtensionTerminalRequest>());
	get onDidRequestStartExtensionTerminal(): Event<IStartExtensionTerminalRequest> { return this._onDidRequestStartExtensionTerminal.event; }
	private readonly _onDidChangeInstanceDimensions = this._register(new Emitter<ITerminalInstance>());
	get onDidChangeInstanceDimensions(): Event<ITerminalInstance> { return this._onDidChangeInstanceDimensions.event; }
	private readonly _onDidMaxiumumDimensionsChange = this._register(new Emitter<ITerminalInstance>());
	get onDidMaximumDimensionsChange(): Event<ITerminalInstance> { return this._onDidMaxiumumDimensionsChange.event; }
	private readonly _onDidChangeInstanceCapability = this._register(new Emitter<ITerminalInstance>());
	get onDidChangeInstanceCapability(): Event<ITerminalInstance> { return this._onDidChangeInstanceCapability.event; }
	private readonly _onDidChangeInstances = this._register(new Emitter<void>());
	get onDidChangeInstances(): Event<void> { return this._onDidChangeInstances.event; }
	private readonly _onDidChangeInstanceTitle = this._register(new Emitter<ITerminalInstance | undefined>());
	get onDidChangeInstanceTitle(): Event<ITerminalInstance | undefined> { return this._onDidChangeInstanceTitle.event; }
	private readonly _onDidChangeInstanceIcon = this._register(new Emitter<{ instance: ITerminalInstance; userInitiated: boolean }>());
	get onDidChangeInstanceIcon(): Event<{ instance: ITerminalInstance; userInitiated: boolean }> { return this._onDidChangeInstanceIcon.event; }
	private readonly _onDidChangeInstanceColor = this._register(new Emitter<{ instance: ITerminalInstance; userInitiated: boolean }>());
	get onDidChangeInstanceColor(): Event<{ instance: ITerminalInstance; userInitiated: boolean }> { return this._onDidChangeInstanceColor.event; }
	private readonly _onDidChangeActiveInstance = this._register(new Emitter<ITerminalInstance | undefined>());
	get onDidChangeActiveInstance(): Event<ITerminalInstance | undefined> { return this._onDidChangeActiveInstance.event; }
	private readonly _onDidChangeInstancePrimaryStatus = this._register(new Emitter<ITerminalInstance>());
	get onDidChangeInstancePrimaryStatus(): Event<ITerminalInstance> { return this._onDidChangeInstancePrimaryStatus.event; }
	private readonly _onDidInputInstanceData = this._register(new Emitter<ITerminalInstance>());
	get onDidInputInstanceData(): Event<ITerminalInstance> { return this._onDidInputInstanceData.event; }
	private readonly _onDidChangeSelection = this._register(new Emitter<ITerminalInstance>());
	get onDidChangeSelection(): Event<ITerminalInstance> { return this._onDidChangeSelection.event; }
	private readonly _onDidDisposeGroup = this._register(new Emitter<ITerminalGroup>());
	get onDidDisposeGroup(): Event<ITerminalGroup> { return this._onDidDisposeGroup.event; }
	private readonly _onDidChangeGroups = this._register(new Emitter<void>());
	get onDidChangeGroups(): Event<void> { return this._onDidChangeGroups.event; }
	private readonly _onDidRegisterProcessSupport = this._register(new Emitter<void>());
	get onDidRegisterProcessSupport(): Event<void> { return this._onDidRegisterProcessSupport.event; }
	private readonly _onDidChangeConnectionState = this._register(new Emitter<void>());
	get onDidChangeConnectionState(): Event<void> { return this._onDidChangeConnectionState.event; }

	constructor(
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@IDialogService private _dialogService: IDialogService,
		@IInstantiationService private _instantiationService: IInstantiationService,
		@IRemoteAgentService private _remoteAgentService: IRemoteAgentService,
		@IViewsService private _viewsService: IViewsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
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

		this._configHelper = this._register(this._instantiationService.createInstance(TerminalConfigHelper));
		// the below avoids having to poll routinely.
		// we update detected profiles when an instance is created so that,
		// for example, we detect if you've installed a pwsh
		this.onDidCreateInstance(() => this._terminalProfileService.refreshAvailableProfiles());
		this._forwardInstanceHostEvents(this._terminalGroupService);
		this._forwardInstanceHostEvents(this._terminalEditorService);
		this._terminalGroupService.onDidChangeActiveGroup(this._onDidChangeActiveGroup.fire, this._onDidChangeActiveGroup);
		this._terminalInstanceService.onDidCreateInstance(instance => {
			this._initInstanceListeners(instance);
			this._onDidCreateInstance.fire(instance);
		});

		// Hide the panel if there are no more instances, provided that VS Code is not shutting
		// down. When shutting down the panel is locked in place so that it is restored upon next
		// launch.
		this._terminalGroupService.onDidChangeActiveInstance(instance => {
			if (!instance && !this._isShuttingDown) {
				this._terminalGroupService.hidePanel();
			}
			if (instance?.shellType) {
				this._terminalShellTypeContextKey.set(instance.shellType.toString());
			} else if (!instance) {
				this._terminalShellTypeContextKey.reset();
			}
		});

		this._handleInstanceContextKeys();
		this._terminalShellTypeContextKey = TerminalContextKeys.shellType.bindTo(this._contextKeyService);
		this._processSupportContextKey = TerminalContextKeys.processSupported.bindTo(this._contextKeyService);
		this._processSupportContextKey.set(!isWeb || this._remoteAgentService.getConnection() !== null);
		this._terminalHasBeenCreated = TerminalContextKeys.terminalHasBeenCreated.bindTo(this._contextKeyService);
		this._terminalCountContextKey = TerminalContextKeys.count.bindTo(this._contextKeyService);
		this._terminalEditorActive = TerminalContextKeys.terminalEditorActive.bindTo(this._contextKeyService);

		this.onDidChangeActiveInstance(instance => {
			this._terminalEditorActive.set(!!instance?.target && instance.target === TerminalLocation.Editor);
		});

		_lifecycleService.onBeforeShutdown(async e => e.veto(this._onBeforeShutdown(e.reason), 'veto.terminal'));
		_lifecycleService.onWillShutdown(e => this._onWillShutdown(e));

		this.initializePrimaryBackend();

		// Create async as the class depends on `this`
		timeout(0).then(() => this._register(this._instantiationService.createInstance(TerminalEditorStyle, document.head)));
	}

	async showProfileQuickPick(type: 'setDefault' | 'createInstance', cwd?: string | URI): Promise<ITerminalInstance | undefined> {
		const quickPick = this._instantiationService.createInstance(TerminalProfileQuickpick);
		const result = await quickPick.showAndGetResult(type);
		if (!result) {
			return;
		}
		if (typeof result === 'string') {
			return;
		}
		const keyMods: IKeyMods | undefined = result.keyMods;
		if (type === 'createInstance') {
			const activeInstance = this.getDefaultInstanceHost().activeInstance;
			let instance;

			if (result.config && 'id' in result?.config) {
				await this.createContributedTerminalProfile(result.config.extensionIdentifier, result.config.id, {
					icon: result.config.options?.icon,
					color: result.config.options?.color,
					location: !!(keyMods?.alt && activeInstance) ? { splitActiveTerminal: true } : this.defaultLocation
				});
				return;
			} else if (result.config && 'profileName' in result.config) {
				if (keyMods?.alt && activeInstance) {
					// create split, only valid if there's an active instance
					instance = await this.createTerminal({ location: { parentTerminal: activeInstance }, config: result.config, cwd });
				} else {
					instance = await this.createTerminal({ location: this.defaultLocation, config: result.config, cwd });
				}
			}

			if (instance && this.defaultLocation !== TerminalLocation.Editor) {
				this._terminalGroupService.showPanel(true);
				this.setActiveInstance(instance);
				return instance;
			}
		}
		return undefined;
	}

	async initializePrimaryBackend() {
		mark('code/terminal/willGetTerminalBackend');
		this._primaryBackend = await this._terminalInstanceService.getBackend(this._environmentService.remoteAuthority);
		mark('code/terminal/didGetTerminalBackend');
		const enableTerminalReconnection = this.configHelper.config.enablePersistentSessions;

		// Connect to the extension host if it's there, set the connection state to connected when
		// it's done. This should happen even when there is no extension host.
		this._connectionState = TerminalConnectionState.Connecting;

		const isPersistentRemote = !!this._environmentService.remoteAuthority && enableTerminalReconnection;

		this._primaryBackend?.onDidRequestDetach(async (e) => {
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
		});

		mark('code/terminal/willReconnect');
		let reconnectedPromise: Promise<any>;
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

	private _forwardInstanceHostEvents(host: ITerminalInstanceHost) {
		host.onDidChangeInstances(this._onDidChangeInstances.fire, this._onDidChangeInstances);
		host.onDidDisposeInstance(this._onDidDisposeInstance.fire, this._onDidDisposeInstance);
		host.onDidChangeActiveInstance(instance => this._evaluateActiveInstance(host, instance));
		host.onDidFocusInstance(instance => {
			this._onDidFocusInstance.fire(instance);
			this._evaluateActiveInstance(host, instance);
		});
		host.onDidChangeInstanceCapability((instance) => {
			this._onDidChangeInstanceCapability.fire(instance);
		});
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

	setActiveInstance(value: ITerminalInstance) {
		// If this was a hideFromUser terminal created by the API this was triggered by show,
		// in which case we need to create the terminal group
		if (value.shellLaunchConfig.hideFromUser) {
			this._showBackgroundTerminal(value);
		}
		if (value.target === TerminalLocation.Editor) {
			this._terminalEditorService.setActiveInstance(value);
		} else {
			this._terminalGroupService.setActiveInstance(value);
		}
	}

	async focusActiveInstance(): Promise<void> {
		if (!this._activeInstance) {
			return;
		}
		if (this._activeInstance.target === TerminalLocation.Editor) {
			return this._terminalEditorService.focusActiveInstance();
		}
		return this._terminalGroupService.focusActiveInstance();
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
			(this.configHelper.config.confirmOnKill === 'panel' || this.configHelper.config.confirmOnKill === 'always')) {

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
		if (layoutInfo && layoutInfo.tabs.length > 0) {
			mark('code/terminal/willRecreateTerminalGroups');
			this._reconnectedTerminalGroups = this._recreateTerminalGroups(layoutInfo);
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
		this.onDidChangeActiveGroup(() => this._saveState());
		this.onDidChangeActiveInstance(() => this._saveState());
		this.onDidChangeInstances(() => this._saveState());
		// The state must be updated when the terminal is relaunched, otherwise the persistent
		// terminal ID will be stale and the process will be leaked.
		this.onDidReceiveProcessId(() => this._saveState());
		this.onDidChangeInstanceTitle(instance => this._updateTitle(instance));
		this.onDidChangeInstanceIcon(e => this._updateIcon(e.instance, e.userInitiated));
	}

	private _handleInstanceContextKeys(): void {
		const terminalIsOpenContext = TerminalContextKeys.isOpen.bindTo(this._contextKeyService);
		const updateTerminalContextKeys = () => {
			terminalIsOpenContext.set(this.instances.length > 0);
			this._terminalCountContextKey.set(this.instances.length);
		};
		this.onDidChangeInstances(() => updateTerminalContextKeys());
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

	async revealActiveTerminal(): Promise<void> {
		const instance = this.activeInstance;
		if (!instance) {
			return;
		}
		if (instance.target === TerminalLocation.Editor) {
			await this._terminalEditorService.revealActiveEditor();
		} else {
			await this._terminalGroupService.showPanel();
		}
	}

	setEditable(instance: ITerminalInstance, data?: IEditableData | null): void {
		if (!data) {
			this._editable = undefined;
		} else {
			this._editable = { instance: instance, data };
		}
		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		const isEditing = this.isEditable(instance);
		pane?.terminalTabbedView?.setEditable(isEditing);
	}

	isEditable(instance: ITerminalInstance | undefined): boolean {
		return !!this._editable && (this._editable.instance === instance || !instance);
	}

	getEditableData(instance: ITerminalInstance): IEditableData | undefined {
		return this._editable && this._editable.instance === instance ? this._editable.data : undefined;
	}

	requestStartExtensionTerminal(proxy: ITerminalProcessExtHostProxy, cols: number, rows: number): Promise<ITerminalLaunchError | undefined> {
		// The initial request came from the extension host, no need to wait for it
		return new Promise<ITerminalLaunchError | undefined>(callback => {
			this._onDidRequestStartExtensionTerminal.fire({ proxy, cols, rows, callback });
		});
	}

	private _onBeforeShutdown(reason: ShutdownReason): boolean | Promise<boolean> {
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
			const shouldPersistProcesses = this._configHelper.config.enablePersistentSessions && reason === ShutdownReason.RELOAD;
			if (!shouldPersistProcesses) {
				const hasDirtyInstances = (
					(this.configHelper.config.confirmOnExit === 'always' && this.instances.length > 0) ||
					(this.configHelper.config.confirmOnExit === 'hasChildProcesses' && this.instances.some(e => e.hasChildProcesses))
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
		if (!this._configHelper.config.enablePersistentSessions) {
			return false;
		}
		switch (this.configHelper.config.persistentSessionReviveProcess) {
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
		const shouldPersistTerminals = this._configHelper.config.enablePersistentSessions && e.reason === ShutdownReason.RELOAD;

		for (const instance of [...this._terminalGroupService.instances, ...this._backgroundedTerminalInstances]) {
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
		if (!this.configHelper.config.enablePersistentSessions) {
			return;
		}
		const tabs = this._terminalGroupService.groups.map(g => g.getLayoutInfo(g === this._terminalGroupService.activeGroup));
		const state: ITerminalsLayoutInfoById = { tabs };
		this._primaryBackend?.setTerminalLayoutInfo(state);
	}

	@debounce(500)
	private _updateTitle(instance: ITerminalInstance | undefined): void {
		if (!this.configHelper.config.enablePersistentSessions || !instance || !instance.persistentProcessId || !instance.title || instance.isDisposed) {
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
		if (!this.configHelper.config.enablePersistentSessions || !instance || !instance.persistentProcessId || !instance.icon || instance.isDisposed) {
			return;
		}
		this._primaryBackend?.updateIcon(instance.persistentProcessId, userInitiated, instance.icon, instance.color);
	}

	refreshActiveGroup(): void {
		this._onDidChangeActiveGroup.fire(this._terminalGroupService.activeGroup);
	}

	getInstanceFromId(terminalId: number): ITerminalInstance | undefined {
		let bgIndex = -1;
		this._backgroundedTerminalInstances.forEach((terminalInstance, i) => {
			if (terminalInstance.instanceId === terminalId) {
				bgIndex = i;
			}
		});
		if (bgIndex !== -1) {
			return this._backgroundedTerminalInstances[bgIndex];
		}
		try {
			return this.instances[this._getIndexFromId(terminalId)];
		} catch {
			return undefined;
		}
	}

	getInstanceFromIndex(terminalIndex: number): ITerminalInstance {
		return this.instances[terminalIndex];
	}

	getInstanceFromResource(resource: URI | undefined): ITerminalInstance | undefined {
		return getInstanceFromResource(this.instances, resource);
	}

	isAttachedToTerminal(remoteTerm: IRemoteTerminalAttachTarget): boolean {
		return this.instances.some(term => term.processId === remoteTerm.pid);
	}

	moveToEditor(source: ITerminalInstance): void {
		if (source.target === TerminalLocation.Editor) {
			return;
		}
		const sourceGroup = this._terminalGroupService.getGroupForInstance(source);
		if (!sourceGroup) {
			return;
		}
		sourceGroup.removeInstance(source);
		this._terminalEditorService.openEditor(source);
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
			group.moveInstance(source, index);
		}

		// Fire events
		this._onDidChangeInstances.fire();
		this._onDidChangeActiveGroup.fire(this._terminalGroupService.activeGroup);
	}

	protected _initInstanceListeners(instance: ITerminalInstance): void {
		const instanceDisposables: IDisposable[] = [
			instance.onTitleChanged(this._onDidChangeInstanceTitle.fire, this._onDidChangeInstanceTitle),
			instance.onIconChanged(this._onDidChangeInstanceIcon.fire, this._onDidChangeInstanceIcon),
			instance.onIconChanged(this._onDidChangeInstanceColor.fire, this._onDidChangeInstanceColor),
			instance.onProcessIdReady(this._onDidReceiveProcessId.fire, this._onDidReceiveProcessId),
			instance.statusList.onDidChangePrimaryStatus(() => this._onDidChangeInstancePrimaryStatus.fire(instance)),
			instance.onDimensionsChanged(() => {
				this._onDidChangeInstanceDimensions.fire(instance);
				if (this.configHelper.config.enablePersistentSessions && this.isProcessSupportRegistered) {
					this._saveState();
				}
			}),
			instance.onMaximumDimensionsChanged(() => this._onDidMaxiumumDimensionsChange.fire(instance)),
			instance.onDidInputData(this._onDidInputInstanceData.fire, this._onDidInputInstanceData),
			instance.onDidFocus(this._onDidChangeActiveInstance.fire, this._onDidChangeActiveInstance),
			instance.onRequestAddInstanceToGroup(async e => await this._addInstanceToGroup(instance, e)),
			instance.onDidChangeSelection(this._onDidChangeSelection.fire, this._onDidChangeSelection)
		];
		instance.onDisposed(() => dispose(instanceDisposables));
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
		if (this.instances.length === 1 || singleTerminal) {
			message = nls.localize('terminalService.terminalCloseConfirmationSingular', "Do you want to terminate the active terminal session?");
		} else {
			message = nls.localize('terminalService.terminalCloseConfirmationPlural', "Do you want to terminate the {0} active terminal sessions?", this.instances.length);
		}
		const { confirmed } = await this._dialogService.confirm({
			type: 'warning',
			message,
			primaryButton: nls.localize({ key: 'terminate', comment: ['&& denotes a mnemonic'] }, "&&Terminate")
		});
		return !confirmed;
	}

	getDefaultInstanceHost(): ITerminalInstanceHost {
		if (this.defaultLocation === TerminalLocation.Editor) {
			return this._terminalEditorService;
		}
		return this._terminalGroupService;
	}

	async getInstanceHost(location: ITerminalLocationOptions | undefined): Promise<ITerminalInstanceHost> {
		if (location) {
			if (location === TerminalLocation.Editor) {
				return this._terminalEditorService;
			} else if (typeof location === 'object') {
				if ('viewColumn' in location) {
					return this._terminalEditorService;
				} else if ('parentTerminal' in location) {
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
		if (this._terminalProfileService.availableProfiles.length === 0) {
			const isPtyTerminal = options?.config && 'customPtyImplementation' in options.config;
			const isLocalInRemoteTerminal = this._remoteAgentService.getConnection() && URI.isUri(options?.cwd) && options?.cwd.scheme === Schemas.vscodeFileResource;
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

		const config = options?.config || this._terminalProfileService.getDefaultProfile();
		const shellLaunchConfig = config && 'extensionIdentifier' in config ? {} : this._terminalInstanceService.convertProfileToShellLaunchConfig(config || {});

		// Get the contributed profile if it was provided
		let contributedProfile = config && 'extensionIdentifier' in config ? config : undefined;

		// Get the default profile as a contributed profile if it exists
		if (!contributedProfile && (!options || !options.config)) {
			contributedProfile = await this._terminalProfileService.getContributedDefaultProfile(shellLaunchConfig);
		}

		const splitActiveTerminal = typeof options?.location === 'object' && 'splitActiveTerminal' in options.location ? options.location.splitActiveTerminal : typeof options?.location === 'object' ? 'parentTerminal' in options.location : false;

		await this._resolveCwd(shellLaunchConfig, splitActiveTerminal, options);

		// Launch the contributed profile
		if (contributedProfile) {
			const resolvedLocation = await this.resolveLocation(options?.location);
			let location: TerminalLocation | { viewColumn: number; preserveState?: boolean } | { splitActiveTerminal: boolean } | undefined;
			if (splitActiveTerminal) {
				location = resolvedLocation === TerminalLocation.Editor ? { viewColumn: SIDE_GROUP } : { splitActiveTerminal: true };
			} else {
				location = typeof options?.location === 'object' && 'viewColumn' in options.location ? options.location : resolvedLocation;
			}
			await this.createContributedTerminalProfile(contributedProfile.extensionIdentifier, contributedProfile.id, {
				icon: contributedProfile.icon,
				color: contributedProfile.color,
				location
			});
			const instanceHost = resolvedLocation === TerminalLocation.Editor ? this._terminalEditorService : this._terminalGroupService;
			const instance = instanceHost.instances[instanceHost.instances.length - 1];
			await instance.focusWhenReady();
			this._terminalHasBeenCreated.set(true);
			return instance;
		}

		if (!shellLaunchConfig.customPtyImplementation && !this.isProcessSupportRegistered) {
			throw new Error('Could not create terminal when process support is not registered');
		}
		if (shellLaunchConfig.hideFromUser) {
			const instance = this._terminalInstanceService.createInstance(shellLaunchConfig, TerminalLocation.Panel);
			this._backgroundedTerminalInstances.push(instance);
			this._backgroundedTerminalDisposables.set(instance.instanceId, [
				instance.onDisposed(this._onDidDisposeInstance.fire, this._onDidDisposeInstance)
			]);
			this._terminalHasBeenCreated.set(true);
			return instance;
		}

		this._evaluateLocalCwd(shellLaunchConfig);
		const location = await this.resolveLocation(options?.location) || this.defaultLocation;
		const parent = await this._getSplitParent(options?.location);
		this._terminalHasBeenCreated.set(true);
		if (parent) {
			return this._splitTerminal(shellLaunchConfig, location, parent);
		}
		return this._createTerminal(shellLaunchConfig, location, options);
	}

	async createDetachedTerminal(options: IDetachedXTermOptions): Promise<IDetachedTerminalInstance> {
		const ctor = await TerminalInstance.getXtermConstructor(this._keybindingService, this._contextKeyService);
		const xterm = this._instantiationService.createInstance(
			XtermTerminal,
			ctor,
			this._configHelper,
			options.cols,
			options.rows,
			options.colorProvider,
			options.capabilities || new TerminalCapabilityStore(),
			'',
			undefined,
			false,
		);

		if (options.readonly) {
			xterm.raw.attachCustomKeyEventHandler(() => false);
		}

		this._detachedXterms.add(xterm);
		const l = xterm.onDidDispose(() => {
			this._detachedXterms.delete(xterm);
			l.dispose();
		});

		return new DeatachedTerminal(xterm, options, this._instantiationService);
	}

	private async _resolveCwd(shellLaunchConfig: IShellLaunchConfig, splitActiveTerminal: boolean, options?: ICreateTerminalOptions): Promise<void> {
		const cwd = shellLaunchConfig.cwd;
		if (!cwd) {
			if (options?.cwd) {
				shellLaunchConfig.cwd = options.cwd;
			} else if (splitActiveTerminal && options?.location) {
				let parent = this.activeInstance;
				if (typeof options.location === 'object' && 'parentTerminal' in options.location) {
					parent = await options.location.parentTerminal;
				}
				if (!parent) {
					throw new Error('Cannot split without an active instance');
				}
				shellLaunchConfig.cwd = await getCwdForSplit(this.configHelper, parent, this._workspaceContextService.getWorkspace().folders, this._commandService);
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
				throw new Error(`Cannot split a terminal without a group ${parent}`);
			}
			shellLaunchConfig.parentTerminalId = parent.instanceId;
			instance = group.split(shellLaunchConfig);
		}
		this._addToReconnected(instance);
		return instance;
	}

	private _addToReconnected(instance: ITerminalInstance): void {
		if (!instance.reconnectionProperties?.ownerId) {
			return;
		}
		const reconnectedTerminals = this._reconnectedTerminals.get(instance.reconnectionProperties.ownerId);
		if (reconnectedTerminals) {
			reconnectedTerminals.push(instance);
		} else {
			this._reconnectedTerminals.set(instance.reconnectionProperties.ownerId, [instance]);
		}
	}

	private _createTerminal(shellLaunchConfig: IShellLaunchConfig, location: TerminalLocation, options?: ICreateTerminalOptions): ITerminalInstance {
		let instance;
		const editorOptions = this._getEditorOptions(options?.location);
		if (location === TerminalLocation.Editor) {
			instance = this._terminalInstanceService.createInstance(shellLaunchConfig, TerminalLocation.Editor);
			this._terminalEditorService.openEditor(instance, editorOptions);
		} else {
			// TODO: pass resource?
			const group = this._terminalGroupService.createGroup(shellLaunchConfig);
			instance = group.terminalInstances[0];
		}
		this._addToReconnected(instance);
		return instance;
	}

	async resolveLocation(location?: ITerminalLocationOptions): Promise<TerminalLocation | undefined> {
		if (location && typeof location === 'object') {
			if ('parentTerminal' in location) {
				// since we don't set the target unless it's an editor terminal, this is necessary
				const parentTerminal = await location.parentTerminal;
				return !parentTerminal.target ? TerminalLocation.Panel : parentTerminal.target;
			} else if ('viewColumn' in location) {
				return TerminalLocation.Editor;
			} else if ('splitActiveTerminal' in location) {
				// since we don't set the target unless it's an editor terminal, this is necessary
				return !this._activeInstance?.target ? TerminalLocation.Panel : this._activeInstance?.target;
			}
		}
		return location;
	}

	private async _getSplitParent(location?: ITerminalLocationOptions): Promise<ITerminalInstance | undefined> {
		if (location && typeof location === 'object' && 'parentTerminal' in location) {
			return location.parentTerminal;
		} else if (location && typeof location === 'object' && 'splitActiveTerminal' in location) {
			return this.activeInstance;
		}
		return undefined;
	}

	private _getEditorOptions(location?: ITerminalLocationOptions): TerminalEditorLocation | undefined {
		if (location && typeof location === 'object' && 'viewColumn' in location) {
			location.viewColumn = columnToEditorGroup(this._editorGroupsService, this._configurationService, location.viewColumn);
			return location;
		}
		return undefined;
	}

	private _evaluateLocalCwd(shellLaunchConfig: IShellLaunchConfig) {
		// Add welcome message and title annotation for local terminals launched within remote or
		// virtual workspaces
		if (typeof shellLaunchConfig.cwd !== 'string' && shellLaunchConfig.cwd?.scheme === Schemas.file) {
			if (VirtualWorkspaceContext.getValue(this._contextKeyService)) {
				shellLaunchConfig.initialText = formatMessageForTerminal(nls.localize('localTerminalVirtualWorkspace', "This shell is open to a {0}local{1} folder, NOT to the virtual folder", '\x1b[3m', '\x1b[23m'), { excludeLeadingNewLine: true, loudFormatting: true });
				shellLaunchConfig.type = 'Local';
			} else if (this._remoteAgentService.getConnection()) {
				shellLaunchConfig.initialText = formatMessageForTerminal(nls.localize('localTerminalRemote', "This shell is running on your {0}local{1} machine, NOT on the connected remote machine", '\x1b[3m', '\x1b[23m'), { excludeLeadingNewLine: true, loudFormatting: true });
				shellLaunchConfig.type = 'Local';
			}
		}
	}

	protected _showBackgroundTerminal(instance: ITerminalInstance): void {
		this._backgroundedTerminalInstances.splice(this._backgroundedTerminalInstances.indexOf(instance), 1);
		const disposables = this._backgroundedTerminalDisposables.get(instance.instanceId);
		if (disposables) {
			dispose(disposables);
		}
		this._backgroundedTerminalDisposables.delete(instance.instanceId);
		instance.shellLaunchConfig.hideFromUser = false;
		this._terminalGroupService.createGroup(instance);

		// Make active automatically if it's the first instance
		if (this.instances.length === 1) {
			this._terminalGroupService.setActiveInstanceByIndex(0);
		}

		this._onDidChangeInstances.fire();
		this._onDidChangeGroups.fire();
	}

	async setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): Promise<void> {
		this._configHelper.panelContainer = panelContainer;
		this._terminalGroupService.setContainer(terminalContainer);
	}

	getEditingTerminal(): ITerminalInstance | undefined {
		return this._editingTerminal;
	}

	setEditingTerminal(instance: ITerminalInstance | undefined) {
		this._editingTerminal = instance;
	}

	onInstanceEvent<T>(getEvent: (instance: ITerminalInstance) => Event<T>): IDynamicListEventMultiplexer<T> {
		return new DynamicListEventMultiplexer(this.instances, this.onDidCreateInstance, this.onDidDisposeInstance, getEvent);
	}

	onInstanceCapabilityEvent<T extends TerminalCapability, K>(capabilityId: T, getEvent: (capability: ITerminalCapabilityImplMap[T]) => Event<K>): IDynamicListEventMultiplexer<{ instance: ITerminalInstance; data: K }> {
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
		this._styleElement = document.createElement('style');
		container.appendChild(this._styleElement);
		this._register(toDisposable(() => container.removeChild(this._styleElement)));
		this.updateStyles();
	}

	private _registerListeners(): void {
		this._register(this._terminalService.onDidChangeInstanceIcon(() => this.updateStyles()));
		this._register(this._terminalService.onDidChangeInstanceColor(() => this.updateStyles()));
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
			} else if (icon instanceof Object && 'light' in icon && 'dark' in icon) {
				uri = colorTheme.type === ColorScheme.LIGHT ? icon.light : icon.dark;
			}
			const iconClasses = getUriClasses(instance, colorTheme.type);
			if (uri instanceof URI && iconClasses && iconClasses.length > 1) {
				css += (
					`.monaco-workbench .terminal-tab.${iconClasses[0]}::before` +
					`{background-image: ${dom.asCSSUrl(uri)};}`
				);
			}
			if (ThemeIcon.isThemeIcon(icon)) {
				const iconRegistry = getIconRegistry();
				const iconContribution = iconRegistry.getIcon(icon.id);
				if (iconContribution) {
					const def = productIconTheme.getIcon(iconContribution);
					if (def) {
						css += (
							`.monaco-workbench .terminal-tab.codicon-${icon.id}::before` +
							`{content: '${def.fontCharacter}' !important; font-family: ${dom.asCSSPropertyValue(def.font?.id ?? 'codicon')} !important;}`
						);
					}
				}
			}
		}

		// Add colors
		const iconForegroundColor = colorTheme.getColor(iconForeground);
		if (iconForegroundColor) {
			css += `.monaco-workbench .show-file-icons .file-icon.terminal-tab::before { color: ${iconForegroundColor}; }`;
		}

		css += getColorStyleContent(colorTheme, true);
		this._styleElement.textContent = css;
	}
}
