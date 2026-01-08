/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isFirefox } from '../../../../base/browser/browser.js';
import { BrowserFeatures } from '../../../../base/browser/canIUse.js';
import { DataTransfers } from '../../../../base/browser/dnd.js';
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { AutoOpenBarrier, Promises, disposableTimeout, timeout } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { debounce } from '../../../../base/common/decorators.js';
import { BugIndicatingError, onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { ISeparator, template } from '../../../../base/common/labels.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, ImmortalReference, MutableDisposable, dispose, toDisposable, type IReference } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import * as path from '../../../../base/common/path.js';
import { OS, OperatingSystem, isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { URI } from '../../../../base/common/uri.js';
import { TabFocus } from '../../../../editor/browser/config/tabFocus.js';
import * as nls from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { CodeDataTransfers, containsDragType, getPathForFile } from '../../../../platform/dnd/browser/dnd.js';
import { FileSystemProviderCapabilities, IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResultKind } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IQuickInputService, IQuickPickItem, QuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IMarkProperties, TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalCapabilityStoreMultiplexer } from '../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { IEnvironmentVariableCollection, IMergedEnvironmentVariableCollection } from '../../../../platform/terminal/common/environmentVariable.js';
import { deserializeEnvironmentVariableCollections } from '../../../../platform/terminal/common/environmentVariableShared.js';
import { GeneralShellType, IProcessDataEvent, IProcessPropertyMap, IReconnectionProperties, IShellLaunchConfig, ITerminalDimensionsOverride, ITerminalLaunchError, ITerminalLogService, PosixShellType, ProcessPropertyType, ShellIntegrationStatus, TerminalExitReason, TerminalIcon, TerminalLocation, TerminalSettingId, TerminalShellType, TitleEventSource, WindowsShellType, type ShellIntegrationInjectionFailureReason } from '../../../../platform/terminal/common/terminal.js';
import { formatMessageForTerminal } from '../../../../platform/terminal/common/terminalStrings.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { getIconRegistry } from '../../../../platform/theme/common/iconRegistry.js';
import { IColorTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from '../../../common/theme.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IRequestAddInstanceToGroupEvent, ITerminalConfigurationService, ITerminalContribution, ITerminalInstance, IXtermColorProvider, TerminalDataTransfers } from './terminal.js';
import { TerminalLaunchHelpAction } from './terminalActions.js';
import { TerminalEditorInput } from './terminalEditorInput.js';
import { TerminalExtensionsRegistry } from './terminalExtensions.js';
import { getColorClass, createColorStyleElement, getStandardColors } from './terminalIcon.js';
import { TerminalProcessManager } from './terminalProcessManager.js';
import { ITerminalStatusList, TerminalStatus, TerminalStatusList } from './terminalStatusList.js';
import { getTerminalResourcesFromDragEvent, getTerminalUri } from './terminalUri.js';
import { TerminalWidgetManager } from './widgets/widgetManager.js';
import { LineDataEventAddon } from './xterm/lineDataEventAddon.js';
import { XtermTerminal, getXtermScaledDimensions } from './xterm/xtermTerminal.js';
import { IEnvironmentVariableInfo } from '../common/environmentVariable.js';
import { DEFAULT_COMMANDS_TO_SKIP_SHELL, ITerminalProcessManager, ITerminalProfileResolverService, ProcessState, TERMINAL_VIEW_ID, TerminalCommandId } from '../common/terminal.js';
import { TERMINAL_BACKGROUND_COLOR } from '../common/terminalColorRegistry.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { getUriLabelForShell, getShellIntegrationTimeout, getWorkspaceForTerminal, preparePathForShell } from '../common/terminalEnvironment.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { isHorizontal, IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { importAMDNodeModule } from '../../../../amdX.js';
import type { IMarker, Terminal as XTermTerminal, IBufferLine } from '@xterm/xterm';
import { AccessibilityCommandId } from '../../accessibility/common/accessibilityCommands.js';
import { terminalStrings } from '../common/terminalStrings.js';
import { TerminalIconPicker } from './terminalIconPicker.js';
import { TerminalResizeDebouncer } from './terminalResizeDebouncer.js';
import { openContextMenu } from './terminalContextMenu.js';
import type { IMenu } from '../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { TerminalContribCommandId } from '../terminalContribExports.js';
import type { IProgressState } from '@xterm/addon-progress';
import { generateUuid } from '../../../../base/common/uuid.js';
import { PromptInputState } from '../../../../platform/terminal/common/capabilities/commandDetection/promptInputModel.js';
import { hasKey, isNumber, isString } from '../../../../base/common/types.js';

const enum Constants {
	/**
	 * The maximum amount of milliseconds to wait for a container before starting to create the
	 * terminal process. This period helps ensure the terminal has good initial dimensions to work
	 * with if it's going to be a foreground terminal.
	 */
	WaitForContainerThreshold = 100,

	DefaultCols = 80,
	DefaultRows = 30,
	MaxCanvasWidth = 4096
}

let xtermConstructor: Promise<typeof XTermTerminal> | undefined;

interface ICanvasDimensions {
	width: number;
	height: number;
}

interface IGridDimensions {
	cols: number;
	rows: number;
}

const shellIntegrationSupportedShellTypes: (PosixShellType | GeneralShellType | WindowsShellType)[] = [
	PosixShellType.Bash,
	PosixShellType.Zsh,
	GeneralShellType.PowerShell,
	GeneralShellType.Python,
];

export class TerminalInstance extends Disposable implements ITerminalInstance {
	private static _lastKnownCanvasDimensions: ICanvasDimensions | undefined;
	private static _lastKnownGridDimensions: IGridDimensions | undefined;
	private static _instanceIdCounter = 1;

	private readonly _scopedInstantiationService: IInstantiationService;

	private readonly _processManager: ITerminalProcessManager;
	private readonly _contributions: Map<string, ITerminalContribution> = new Map();
	private readonly _resource: URI;

	/**
	 * Resolves when xterm.js is ready, this will be undefined if the terminal instance is disposed
	 * before xterm.js could be created.
	 */
	private _xtermReadyPromise: Promise<XtermTerminal | undefined>;
	get xtermReadyPromise(): Promise<XtermTerminal | undefined> { return this._xtermReadyPromise; }

	private _pressAnyKeyToCloseListener: IDisposable | undefined;
	private _instanceId: number;
	private _latestXtermWriteData: number = 0;
	private _latestXtermParseData: number = 0;
	private _isExiting: boolean;
	private _hadFocusOnExit: boolean;
	private _isVisible: boolean;
	private _exitCode: number | undefined;
	private _exitReason: TerminalExitReason | undefined;
	private _skipTerminalCommands: string[];
	private _shellType: TerminalShellType | undefined;
	private _title: string = '';
	private _titleSource: TitleEventSource = TitleEventSource.Process;
	private _container: HTMLElement | undefined;
	private _wrapperElement: (HTMLElement & { xterm?: XTermTerminal });
	get domElement(): HTMLElement { return this._wrapperElement; }
	private _horizontalScrollbar: DomScrollableElement | undefined;
	private _terminalFocusContextKey: IContextKey<boolean>;
	private _terminalHasFixedWidth: IContextKey<boolean>;
	private _terminalHasTextContextKey: IContextKey<boolean>;
	private _terminalAltBufferActiveContextKey: IContextKey<boolean>;
	private _terminalShellIntegrationEnabledContextKey: IContextKey<boolean>;
	private _cols: number = 0;
	private _rows: number = 0;
	private _fixedCols: number | undefined;
	private _fixedRows: number | undefined;
	private _cwd: string | undefined = undefined;
	private _initialCwd: string | undefined = undefined;
	private _injectedArgs: string[] | undefined = undefined;
	private _layoutSettingsChanged: boolean = true;
	private _dimensionsOverride: ITerminalDimensionsOverride | undefined;
	private _areLinksReady: boolean = false;
	private readonly _initialDataEventsListener: MutableDisposable<IDisposable> = this._register(new MutableDisposable());
	private _initialDataEvents: string[] | undefined = [];
	private _containerReadyBarrier: AutoOpenBarrier;
	private _attachBarrier: AutoOpenBarrier;
	private _icon: TerminalIcon | undefined;
	private readonly _messageTitleDisposable: MutableDisposable<IDisposable> = this._register(new MutableDisposable());
	private _widgetManager: TerminalWidgetManager;
	private readonly _dndObserver: MutableDisposable<IDisposable> = this._register(new MutableDisposable());
	private _lastLayoutDimensions: dom.Dimension | undefined;
	private _description?: string;
	private _processName: string = '';
	private _sequence?: string;
	private _staticTitle?: string;
	private _workspaceFolder?: IWorkspaceFolder;
	private _labelComputer?: TerminalLabelComputer;
	private _userHome?: string;
	private _hasScrollBar?: boolean;
	private _usedShellIntegrationInjection: boolean = false;
	get usedShellIntegrationInjection(): boolean { return this._usedShellIntegrationInjection; }
	private _shellIntegrationInjectionInfo: ShellIntegrationInjectionFailureReason | undefined;
	get shellIntegrationInjectionFailureReason(): ShellIntegrationInjectionFailureReason | undefined { return this._shellIntegrationInjectionInfo; }
	private _lineDataEventAddon: LineDataEventAddon | undefined;
	private readonly _scopedContextKeyService: IContextKeyService;
	private _resizeDebouncer?: TerminalResizeDebouncer;

	readonly capabilities = this._register(new TerminalCapabilityStoreMultiplexer());
	readonly statusList: ITerminalStatusList;

	get store(): DisposableStore {
		return this._store;
	}

	get extEnvironmentVariableCollection(): IMergedEnvironmentVariableCollection | undefined { return this._processManager.extEnvironmentVariableCollection; }

	xterm?: XtermTerminal;
	disableLayout: boolean = false;

	get waitOnExit(): ITerminalInstance['waitOnExit'] { return this._shellLaunchConfig.attachPersistentProcess?.waitOnExit || this._shellLaunchConfig.waitOnExit; }
	set waitOnExit(value: ITerminalInstance['waitOnExit']) {
		this._shellLaunchConfig.waitOnExit = value;
	}

	private _targetRef: ImmortalReference<TerminalLocation | undefined> = new ImmortalReference(undefined);
	get targetRef(): IReference<TerminalLocation | undefined> { return this._targetRef; }

	get target(): TerminalLocation | undefined { return this._targetRef.object; }
	set target(value: TerminalLocation | undefined) {
		this._targetRef.object = value;
		this._onDidChangeTarget.fire(value);
	}

	get instanceId(): number { return this._instanceId; }
	get resource(): URI { return this._resource; }
	get cols(): number {
		if (this._fixedCols !== undefined) {
			return this._fixedCols;
		}
		if (this._dimensionsOverride && this._dimensionsOverride.cols) {
			if (this._dimensionsOverride.forceExactSize) {
				return this._dimensionsOverride.cols;
			}
			return Math.min(Math.max(this._dimensionsOverride.cols, 2), this._cols);
		}
		return this._cols;
	}
	get rows(): number {
		if (this._fixedRows !== undefined) {
			return this._fixedRows;
		}
		if (this._dimensionsOverride && this._dimensionsOverride.rows) {
			if (this._dimensionsOverride.forceExactSize) {
				return this._dimensionsOverride.rows;
			}
			return Math.min(Math.max(this._dimensionsOverride.rows, 2), this._rows);
		}
		return this._rows;
	}
	get isDisposed(): boolean { return this._store.isDisposed; }
	get fixedCols(): number | undefined { return this._fixedCols; }
	get fixedRows(): number | undefined { return this._fixedRows; }
	get maxCols(): number { return this._cols; }
	get maxRows(): number { return this._rows; }
	// TODO: Ideally processId would be merged into processReady
	get processId(): number | undefined { return this._processManager.shellProcessId; }
	// TODO: How does this work with detached processes?
	// TODO: Should this be an event as it can fire twice?
	get processReady(): Promise<void> { return this._processManager.ptyProcessReady; }
	get hasChildProcesses(): boolean { return this.shellLaunchConfig.attachPersistentProcess?.hasChildProcesses || this._processManager.hasChildProcesses; }
	get reconnectionProperties(): IReconnectionProperties | undefined { return this.shellLaunchConfig.attachPersistentProcess?.reconnectionProperties || this.shellLaunchConfig.reconnectionProperties; }
	get areLinksReady(): boolean { return this._areLinksReady; }
	get initialDataEvents(): string[] | undefined { return this._initialDataEvents; }
	get exitCode(): number | undefined { return this._exitCode; }
	get exitReason(): TerminalExitReason | undefined { return this._exitReason; }
	get hadFocusOnExit(): boolean { return this._hadFocusOnExit; }
	get isTitleSetByProcess(): boolean { return !!this._messageTitleDisposable.value; }
	get shellLaunchConfig(): IShellLaunchConfig { return this._shellLaunchConfig; }
	get shellType(): TerminalShellType | undefined { return this._shellType; }
	get os(): OperatingSystem | undefined { return this._processManager.os; }
	get hasRemoteAuthority(): boolean { return this._processManager.remoteAuthority !== undefined; }
	get remoteAuthority(): string | undefined { return this._processManager.remoteAuthority; }
	get hasFocus(): boolean { return dom.isAncestorOfActiveElement(this._wrapperElement); }
	get title(): string { return this._title; }
	get titleSource(): TitleEventSource { return this._titleSource; }
	get icon(): TerminalIcon | undefined { return this._getIcon(); }
	get color(): string | undefined { return this._getColor(); }
	get processName(): string { return this._processName; }
	get sequence(): string | undefined { return this._sequence; }
	get staticTitle(): string | undefined { return this._staticTitle; }
	get progressState(): IProgressState | undefined { return this.xterm?.progressState; }
	get workspaceFolder(): IWorkspaceFolder | undefined { return this._workspaceFolder; }
	get cwd(): string | undefined { return this._cwd; }
	get initialCwd(): string | undefined { return this._initialCwd; }
	get description(): string | undefined {
		if (this._description) {
			return this._description;
		}
		const type = this.shellLaunchConfig.attachPersistentProcess?.type || this.shellLaunchConfig.type;
		switch (type) {
			case 'Task': return terminalStrings.typeTask;
			case 'Local': return terminalStrings.typeLocal;
			default: return undefined;
		}
	}
	get userHome(): string | undefined { return this._userHome; }
	get shellIntegrationNonce(): string { return this._processManager.shellIntegrationNonce; }
	get injectedArgs(): string[] | undefined { return this._injectedArgs; }

	// The onExit event is special in that it fires and is disposed after the terminal instance
	// itself is disposed
	private readonly _onExit = new Emitter<number | ITerminalLaunchError | undefined>();
	readonly onExit = this._onExit.event;
	private readonly _onDisposed = this._register(new Emitter<ITerminalInstance>());
	readonly onDisposed = this._onDisposed.event;
	private readonly _onProcessIdReady = this._register(new Emitter<ITerminalInstance>());
	readonly onProcessIdReady = this._onProcessIdReady.event;
	private readonly _onProcessReplayComplete = this._register(new Emitter<void>());
	readonly onProcessReplayComplete = this._onProcessReplayComplete.event;
	private readonly _onTitleChanged = this._register(new Emitter<ITerminalInstance>());
	readonly onTitleChanged = this._onTitleChanged.event;
	private readonly _onIconChanged = this._register(new Emitter<{ instance: ITerminalInstance; userInitiated: boolean }>());
	readonly onIconChanged = this._onIconChanged.event;
	private readonly _onWillData = this._register(new Emitter<string>());
	readonly onWillData = this._onWillData.event;
	private readonly _onData = this._register(new Emitter<string>());
	readonly onData = this._onData.event;
	private readonly _onBinary = this._register(new Emitter<string>());
	readonly onBinary = this._onBinary.event;
	private readonly _onRequestExtHostProcess = this._register(new Emitter<ITerminalInstance>());
	readonly onRequestExtHostProcess = this._onRequestExtHostProcess.event;
	private readonly _onDimensionsChanged = this._register(new Emitter<void>());
	readonly onDimensionsChanged = this._onDimensionsChanged.event;
	private readonly _onMaximumDimensionsChanged = this._register(new Emitter<void>());
	readonly onMaximumDimensionsChanged = this._onMaximumDimensionsChanged.event;
	private readonly _onDidFocus = this._register(new Emitter<ITerminalInstance>());
	readonly onDidFocus = this._onDidFocus.event;
	private readonly _onDidRequestFocus = this._register(new Emitter<void>());
	readonly onDidRequestFocus = this._onDidRequestFocus.event;
	private readonly _onDidBlur = this._register(new Emitter<ITerminalInstance>());
	readonly onDidBlur = this._onDidBlur.event;
	private readonly _onDidInputData = this._register(new Emitter<string>());
	readonly onDidInputData = this._onDidInputData.event;
	private readonly _onDidChangeSelection = this._register(new Emitter<ITerminalInstance>());
	readonly onDidChangeSelection = this._onDidChangeSelection.event;
	private readonly _onRequestAddInstanceToGroup = this._register(new Emitter<IRequestAddInstanceToGroupEvent>());
	readonly onRequestAddInstanceToGroup = this._onRequestAddInstanceToGroup.event;
	private readonly _onDidChangeHasChildProcesses = this._register(new Emitter<boolean>());
	readonly onDidChangeHasChildProcesses = this._onDidChangeHasChildProcesses.event;
	private readonly _onDidExecuteText = this._register(new Emitter<void>());
	readonly onDidExecuteText = this._onDidExecuteText.event;
	private readonly _onDidChangeTarget = this._register(new Emitter<TerminalLocation | undefined>());
	readonly onDidChangeTarget = this._onDidChangeTarget.event;
	private readonly _onDidSendText = this._register(new Emitter<string>());
	readonly onDidSendText = this._onDidSendText.event;
	private readonly _onDidChangeShellType = this._register(new Emitter<TerminalShellType>());
	readonly onDidChangeShellType = this._onDidChangeShellType.event;
	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	private readonly _onLineData = this._register(new Emitter<string>({
		onDidAddFirstListener: async () => (this.xterm ?? await this._xtermReadyPromise)?.raw.loadAddon(this._lineDataEventAddon!)
	}));
	readonly onLineData = this._onLineData.event;

	readonly sessionId = generateUuid();

	constructor(
		private readonly _terminalShellTypeContextKey: IContextKey<string>,
		private _shellLaunchConfig: IShellLaunchConfig,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService,
		@ITerminalProfileResolverService private readonly _terminalProfileResolverService: ITerminalProfileResolverService,
		@IPathService private readonly _pathService: IPathService,
		@IFileService private readonly _fileService: IFileService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IPreferencesService _preferencesService: IPreferencesService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IThemeService private readonly _themeService: IThemeService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@IStorageService _storageService: IStorageService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IProductService _productService: IProductService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IWorkbenchEnvironmentService private readonly _workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IEditorService private readonly _editorService: IEditorService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IHistoryService private readonly _historyService: IHistoryService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ICommandService private readonly _commandService: ICommandService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@IViewDescriptorService private readonly _viewDescriptorService: IViewDescriptorService,
	) {
		super();

		this._wrapperElement = document.createElement('div');
		this._wrapperElement.classList.add('terminal-wrapper');

		this._widgetManager = this._register(instantiationService.createInstance(TerminalWidgetManager));

		this._skipTerminalCommands = [];
		this._isExiting = false;
		this._hadFocusOnExit = false;
		this._isVisible = false;
		this._instanceId = TerminalInstance._instanceIdCounter++;
		this._fixedRows = _shellLaunchConfig.attachPersistentProcess?.fixedDimensions?.rows;
		this._fixedCols = _shellLaunchConfig.attachPersistentProcess?.fixedDimensions?.cols;
		this._shellLaunchConfig.shellIntegrationEnvironmentReporting = this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnvironmentReporting);

		this._resource = getTerminalUri(this._workspaceContextService.getWorkspace().id, this.instanceId, this.title);

		if (this._shellLaunchConfig.attachPersistentProcess?.hideFromUser) {
			this._shellLaunchConfig.hideFromUser = this._shellLaunchConfig.attachPersistentProcess.hideFromUser;
		}

		if (this._shellLaunchConfig.attachPersistentProcess?.isFeatureTerminal) {
			this._shellLaunchConfig.isFeatureTerminal = this._shellLaunchConfig.attachPersistentProcess.isFeatureTerminal;
		}

		if (this._shellLaunchConfig.attachPersistentProcess?.type) {
			this._shellLaunchConfig.type = this._shellLaunchConfig.attachPersistentProcess.type;
		}

		if (this._shellLaunchConfig.attachPersistentProcess?.tabActions) {
			this._shellLaunchConfig.tabActions = this._shellLaunchConfig.attachPersistentProcess.tabActions;
		}

		if (this.shellLaunchConfig.cwd) {
			const cwdUri = isString(this._shellLaunchConfig.cwd) ? URI.from({
				scheme: Schemas.file,
				path: this._shellLaunchConfig.cwd
			}) : this._shellLaunchConfig.cwd;
			if (cwdUri) {
				this._workspaceFolder = this._workspaceContextService.getWorkspaceFolder(cwdUri) ?? undefined;
			}
		}
		if (!this._workspaceFolder) {
			const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot();
			this._workspaceFolder = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? undefined : undefined;
		}

		const scopedContextKeyService = this._register(_contextKeyService.createScoped(this._wrapperElement));
		this._scopedContextKeyService = scopedContextKeyService;
		this._scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService]
		)));

		this._terminalFocusContextKey = TerminalContextKeys.focus.bindTo(scopedContextKeyService);
		this._terminalHasFixedWidth = TerminalContextKeys.terminalHasFixedWidth.bindTo(scopedContextKeyService);
		this._terminalHasTextContextKey = TerminalContextKeys.textSelected.bindTo(this._contextKeyService);
		this._terminalAltBufferActiveContextKey = TerminalContextKeys.altBufferActive.bindTo(scopedContextKeyService);
		this._terminalShellIntegrationEnabledContextKey = TerminalContextKeys.terminalShellIntegrationEnabled.bindTo(scopedContextKeyService);

		this._logService.trace(`terminalInstance#ctor (instanceId: ${this.instanceId})`, this._shellLaunchConfig);
		this._register(this.capabilities.onDidAddCapability(e => this._logService.debug('terminalInstance added capability', e.id)));
		this._register(this.capabilities.onDidRemoveCapability(e => this._logService.debug('terminalInstance removed capability', e.id)));

		const capabilityListeners = this._register(new DisposableMap<TerminalCapability, IDisposable>());
		this._register(this.capabilities.onDidAddCapability(e => {
			capabilityListeners.get(e.id)?.dispose();
			const refreshInfo = () => {
				this._labelComputer?.refreshLabel(this);
				this._refreshShellIntegrationInfoStatus(this);
			};
			switch (e.id) {
				case TerminalCapability.CwdDetection: {
					capabilityListeners.set(e.id, e.capability.onDidChangeCwd(e => {
						this._cwd = e;
						this._setTitle(this.title, TitleEventSource.Config);
					}));
					break;
				}
				case TerminalCapability.CommandDetection: {
					e.capability.promptInputModel.setShellType(this.shellType);
					capabilityListeners.set(e.id, Event.any(
						e.capability.promptInputModel.onDidStartInput,
						e.capability.promptInputModel.onDidChangeInput,
						e.capability.promptInputModel.onDidFinishInput
					)(refreshInfo));
					this._register(e.capability.onCommandExecuted(async (command) => {
						// Only generate ID if command doesn't already have one (i.e., it's a manual command, not Copilot-initiated)
						// The tool terminal sets the command ID before command start, so this won't override it
						if (!command.id && command.command) {
							const commandId = generateUuid();
							this.xterm?.shellIntegration.setNextCommandId(command.command, commandId);
							await this._processManager.setNextCommandId(command.command, commandId);
						}
					}));
					break;
				}
				case TerminalCapability.PromptTypeDetection: {
					capabilityListeners.set(e.id, e.capability.onPromptTypeChanged(refreshInfo));
					break;
				}
			}
		}));
		this._register(this.onDidChangeShellType(() => this._refreshShellIntegrationInfoStatus(this)));
		this._register(this.capabilities.onDidRemoveCapability(e => {
			capabilityListeners.get(e.id)?.dispose();
		}));

		// Resolve just the icon ahead of time so that it shows up immediately in the tabs. This is
		// disabled in remote because this needs to be sync and the OS may differ on the remote
		// which would result in the wrong profile being selected and the wrong icon being
		// permanently attached to the terminal. This also doesn't work when the default profile
		// setting is set to null, that's handled after the process is created.
		if (!this.shellLaunchConfig.executable && !this._workbenchEnvironmentService.remoteAuthority) {
			this._terminalProfileResolverService.resolveIcon(this._shellLaunchConfig, OS);
		}
		this._icon = _shellLaunchConfig.attachPersistentProcess?.icon || _shellLaunchConfig.icon;

		// When a custom pty is used set the name immediately so it gets passed over to the exthost
		// and is available when Pseudoterminal.open fires.
		if (this.shellLaunchConfig.customPtyImplementation) {
			this._setTitle(this._shellLaunchConfig.name, TitleEventSource.Api);
		}

		this.statusList = this._register(this._scopedInstantiationService.createInstance(TerminalStatusList));
		this._initDimensions();
		this._processManager = this._createProcessManager();

		this._containerReadyBarrier = new AutoOpenBarrier(Constants.WaitForContainerThreshold);
		this._attachBarrier = new AutoOpenBarrier(1000);
		this._xtermReadyPromise = this._createXterm();
		this._xtermReadyPromise.then(async () => {
			// Wait for a period to allow a container to be ready
			await this._containerReadyBarrier.wait();

			// Resolve the executable ahead of time if shell integration is enabled, this should not
			// be done for custom PTYs as that would cause extension Pseudoterminal-based terminals
			// to hang in resolver extensions
			let os: OperatingSystem | undefined;
			if (!this.shellLaunchConfig.customPtyImplementation && this._terminalConfigurationService.config.shellIntegration?.enabled && !this.shellLaunchConfig.executable) {
				os = await this._processManager.getBackendOS();
				const defaultProfile = (await this._terminalProfileResolverService.getDefaultProfile({ remoteAuthority: this.remoteAuthority, os }));
				this.shellLaunchConfig.executable = defaultProfile.path;
				this.shellLaunchConfig.args = defaultProfile.args;
				// Only use default icon and color and env if they are undefined in the SLC
				this.shellLaunchConfig.icon ??= defaultProfile.icon;
				this.shellLaunchConfig.color ??= defaultProfile.color;
				this.shellLaunchConfig.env ??= defaultProfile.env;
			}

			// Resolve the shell type ahead of time to allow features that depend upon it to work
			// before the process is actually created (like terminal suggest manual request)
			if (os && this.shellLaunchConfig.executable) {
				this.setShellType(guessShellTypeFromExecutable(os, this.shellLaunchConfig.executable));
			}

			await this._createProcess();

			// Re-establish the title after reconnect
			if (this.shellLaunchConfig.attachPersistentProcess) {
				this._cwd = this.shellLaunchConfig.attachPersistentProcess.cwd;
				this._setTitle(this.shellLaunchConfig.attachPersistentProcess.title, this.shellLaunchConfig.attachPersistentProcess.titleSource);
				this.setShellType(this.shellType);
			}

			if (this._fixedCols) {
				await this._addScrollbar();
			}
		}).catch((err) => {
			// Ignore exceptions if the terminal is already disposed
			if (!this.isDisposed) {
				throw err;
			}
		});

		this._register(this._configurationService.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.Terminal)) {
				this._setAriaLabel(this.xterm?.raw, this._instanceId, this.title);
			}
			if (e.affectsConfiguration('terminal.integrated')) {
				this.updateConfig();
				this.setVisible(this._isVisible);
			}
			const layoutSettings: string[] = [
				TerminalSettingId.FontSize,
				TerminalSettingId.FontFamily,
				TerminalSettingId.FontWeight,
				TerminalSettingId.FontWeightBold,
				TerminalSettingId.LetterSpacing,
				TerminalSettingId.LineHeight,
				'editor.fontFamily'
			];
			if (layoutSettings.some(id => e.affectsConfiguration(id))) {
				this._layoutSettingsChanged = true;
				await this._resize();
			}
			if (e.affectsConfiguration(TerminalSettingId.UnicodeVersion)) {
				this._updateUnicodeVersion();
			}
			if (e.affectsConfiguration('editor.accessibilitySupport')) {
				this.updateAccessibilitySupport();
			}
			if (
				e.affectsConfiguration(TerminalSettingId.TerminalTitle) ||
				e.affectsConfiguration(TerminalSettingId.TerminalTitleSeparator) ||
				e.affectsConfiguration(TerminalSettingId.TerminalDescription)) {
				this._labelComputer?.refreshLabel(this);
			}
		}));
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._labelComputer?.refreshLabel(this)));

		// Clear out initial data events after 10 seconds, hopefully extension hosts are up and
		// running at that point.
		let initialDataEventsTimeout: number | undefined = dom.getWindow(this._container).setTimeout(() => {
			initialDataEventsTimeout = undefined;
			this._initialDataEvents = undefined;
			this._initialDataEventsListener.clear();
		}, 10000);
		this._register(toDisposable(() => {
			if (initialDataEventsTimeout) {
				dom.getWindow(this._container).clearTimeout(initialDataEventsTimeout);
			}
		}));

		// Initialize contributions
		const contributionDescs = TerminalExtensionsRegistry.getTerminalContributions();
		for (const desc of contributionDescs) {
			if (this._contributions.has(desc.id)) {
				onUnexpectedError(new Error(`Cannot have two terminal contributions with the same id ${desc.id}`));
				continue;
			}
			let contribution: ITerminalContribution;
			try {
				contribution = this._register(this._scopedInstantiationService.createInstance(desc.ctor, {
					instance: this,
					processManager: this._processManager,
					widgetManager: this._widgetManager
				}));
				this._contributions.set(desc.id, contribution);
			} catch (err) {
				onUnexpectedError(err);
			}
			this._xtermReadyPromise.then(xterm => {
				if (xterm) {
					contribution.xtermReady?.(xterm);
				}
			});
			this._register(this.onDisposed(() => {
				contribution.dispose();
				this._contributions.delete(desc.id);
			}));
		}
	}

	public getContribution<T extends ITerminalContribution>(id: string): T | null {
		return this._contributions.get(id) as T | null;
	}

	private async _handleOnData(data: string): Promise<void> {
		await this._processManager.write(data);
		this._onDidInputData.fire(data);
	}

	private _getIcon(): TerminalIcon | undefined {
		if (!this._icon) {
			this._icon = this._processManager.processState >= ProcessState.Launching
				? getIconRegistry().getIcon(this._configurationService.getValue(TerminalSettingId.TabsDefaultIcon))
				: undefined;
		}
		return this._icon;
	}

	private _getColor(): string | undefined {
		if (this.shellLaunchConfig.color) {
			return this.shellLaunchConfig.color;
		}
		if (this.shellLaunchConfig?.attachPersistentProcess?.color) {
			return this.shellLaunchConfig.attachPersistentProcess.color;
		}

		if (this._processManager.processState >= ProcessState.Launching) {
			return undefined;
		}
		return undefined;
	}

	private _initDimensions(): void {
		// The terminal panel needs to have been created to get the real view dimensions
		if (!this._container) {
			// Set the fallback dimensions if not
			this._cols = Constants.DefaultCols;
			this._rows = Constants.DefaultRows;
			return;
		}

		const computedStyle = dom.getWindow(this._container).getComputedStyle(this._container);
		const width = parseInt(computedStyle.width);
		const height = parseInt(computedStyle.height);

		this._evaluateColsAndRows(width, height);
	}

	/**
	 * Evaluates and sets the cols and rows of the terminal if possible.
	 * @param width The width of the container.
	 * @param height The height of the container.
	 * @return The terminal's width if it requires a layout.
	 */
	private _evaluateColsAndRows(width: number, height: number): number | null {
		// Ignore if dimensions are undefined or 0
		if (!width || !height) {
			this._setLastKnownColsAndRows();
			return null;
		}

		const dimension = this._getDimension(width, height);
		if (!dimension) {
			this._setLastKnownColsAndRows();
			return null;
		}

		const font = this.xterm ? this.xterm.getFont() : this._terminalConfigurationService.getFont(dom.getWindow(this.domElement));
		const newRC = getXtermScaledDimensions(dom.getWindow(this.domElement), font, dimension.width, dimension.height);
		if (!newRC) {
			this._setLastKnownColsAndRows();
			return null;
		}

		if (this._cols !== newRC.cols || this._rows !== newRC.rows) {
			this._cols = newRC.cols;
			this._rows = newRC.rows;
			this._fireMaximumDimensionsChanged();
		}

		return dimension.width;
	}

	private _setLastKnownColsAndRows(): void {
		if (TerminalInstance._lastKnownGridDimensions) {
			this._cols = TerminalInstance._lastKnownGridDimensions.cols;
			this._rows = TerminalInstance._lastKnownGridDimensions.rows;
		}
	}

	@debounce(50)
	private _fireMaximumDimensionsChanged(): void {
		this._onMaximumDimensionsChanged.fire();
	}

	private _getDimension(width: number, height: number): ICanvasDimensions | undefined {
		// The font needs to have been initialized
		const font = this.xterm ? this.xterm.getFont() : this._terminalConfigurationService.getFont(dom.getWindow(this.domElement));
		if (!font || !font.charWidth || !font.charHeight) {
			return undefined;
		}

		if (!this.xterm?.raw.element) {
			return undefined;
		}
		const computedStyle = dom.getWindow(this.xterm.raw.element).getComputedStyle(this.xterm.raw.element);
		const horizontalPadding = parseInt(computedStyle.paddingLeft) + parseInt(computedStyle.paddingRight) + 14/*scroll bar padding*/;
		const verticalPadding = parseInt(computedStyle.paddingTop) + parseInt(computedStyle.paddingBottom);
		TerminalInstance._lastKnownCanvasDimensions = new dom.Dimension(
			Math.min(Constants.MaxCanvasWidth, width - horizontalPadding),
			height - verticalPadding + (this._hasScrollBar && this._horizontalScrollbar ? -5/* scroll bar height */ : 0));
		return TerminalInstance._lastKnownCanvasDimensions;
	}

	get persistentProcessId(): number | undefined { return this._processManager.persistentProcessId; }
	get shouldPersist(): boolean { return this._processManager.shouldPersist && !this.shellLaunchConfig.isTransient && (!this.reconnectionProperties || this._configurationService.getValue('task.reconnection') === true); }

	public static getXtermConstructor(keybindingService: IKeybindingService, contextKeyService: IContextKeyService) {
		const keybinding = keybindingService.lookupKeybinding(TerminalContribCommandId.A11yFocusAccessibleBuffer, contextKeyService);
		if (xtermConstructor) {
			return xtermConstructor;
		}
		xtermConstructor = Promises.withAsyncBody<typeof XTermTerminal>(async (resolve) => {
			const Terminal = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
			// Localize strings
			Terminal.strings.promptLabel = nls.localize('terminal.integrated.a11yPromptLabel', 'Terminal input');
			Terminal.strings.tooMuchOutput = keybinding ? nls.localize('terminal.integrated.useAccessibleBuffer', 'Use the accessible buffer {0} to manually review output', keybinding.getLabel()) : nls.localize('terminal.integrated.useAccessibleBufferNoKb', 'Use the Terminal: Focus Accessible Buffer command to manually review output');
			resolve(Terminal);
		});
		return xtermConstructor;
	}

	/**
	 * Create xterm.js instance and attach data listeners.
	 */
	protected async _createXterm(): Promise<XtermTerminal | undefined> {
		const Terminal = await TerminalInstance.getXtermConstructor(this._keybindingService, this._contextKeyService);
		if (this.isDisposed) {
			return undefined;
		}

		const disableShellIntegrationReporting = (this.shellLaunchConfig.executable === undefined || this.shellType === undefined) || !shellIntegrationSupportedShellTypes.includes(this.shellType);
		const xterm = this._scopedInstantiationService.createInstance(XtermTerminal, this._resource, Terminal, {
			cols: this._cols,
			rows: this._rows,
			xtermColorProvider: this._scopedInstantiationService.createInstance(TerminalInstanceColorProvider, this._targetRef),
			capabilities: this.capabilities,
			shellIntegrationNonce: this._processManager.shellIntegrationNonce,
			disableShellIntegrationReporting,
		}, this.onDidExecuteText);
		this.xterm = xterm;
		this._resizeDebouncer = this._register(new TerminalResizeDebouncer(
			() => this._isVisible,
			() => xterm,
			async (cols, rows) => {
				xterm.resize(cols, rows);
				await this._updatePtyDimensions(xterm.raw);
			},
			async (cols) => {
				xterm.resize(cols, xterm.raw.rows);
				await this._updatePtyDimensions(xterm.raw);
			},
			async (rows) => {
				xterm.resize(xterm.raw.cols, rows);
				await this._updatePtyDimensions(xterm.raw);
			}
		));
		this._register(toDisposable(() => this._resizeDebouncer = undefined));
		this.updateAccessibilitySupport();
		this._register(this.xterm.onDidRequestRunCommand(e => {
			this.sendText(e.command.command, e.noNewLine ? false : true);
		}));
		this._register(this.xterm.onDidRequestRefreshDimensions(() => {
			if (this._lastLayoutDimensions) {
				this.layout(this._lastLayoutDimensions);
			}
		}));
		// Write initial text, deferring onLineFeed listener when applicable to avoid firing
		// onLineData events containing initialText
		const initialTextWrittenPromise = this._shellLaunchConfig.initialText ? new Promise<void>(r => this._writeInitialText(xterm, r)) : undefined;
		const lineDataEventAddon = this._register(new LineDataEventAddon(initialTextWrittenPromise));
		this._register(lineDataEventAddon.onLineData(e => this._onLineData.fire(e)));
		this._lineDataEventAddon = lineDataEventAddon;
		// Delay the creation of the bell listener to avoid showing the bell when the terminal
		// starts up or reconnects
		disposableTimeout(() => {
			this._register(xterm.raw.onBell(() => {
				if (this._configurationService.getValue(TerminalSettingId.EnableBell) || this._configurationService.getValue(TerminalSettingId.EnableVisualBell)) {
					this.statusList.add({
						id: TerminalStatus.Bell,
						severity: Severity.Warning,
						icon: Codicon.bell,
						tooltip: nls.localize('bellStatus', "Bell")
					}, this._terminalConfigurationService.config.bellDuration);
				}
				this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalBell);
			}));
		}, 1000, this._store);
		this._register(xterm.raw.onSelectionChange(() => this._onDidChangeSelection.fire(this)));
		this._register(xterm.raw.buffer.onBufferChange(() => this._refreshAltBufferContextKey()));

		this._register(this._processManager.onProcessData(e => this._onProcessData(e)));
		this._register(xterm.raw.onData(async data => {
			await this._handleOnData(data);
		}));
		this._register(xterm.raw.onBinary(data => this._processManager.processBinary(data)));
		// Init winpty compat and link handler after process creation as they rely on the
		// underlying process OS
		this._register(this._processManager.onProcessReady(async (processTraits) => {
			// Respond to DA1 with basic conformance. Note that including this is required to avoid
			// a long delay in conpty 1.22+ where it waits for the response.
			// Reference: https://github.com/microsoft/terminal/blob/3760caed97fa9140a40777a8fbc1c95785e6d2ab/src/terminal/adapter/adaptDispatch.cpp#L1471-L1495
			if (processTraits?.windowsPty?.backend === 'conpty') {
				this._register(xterm.raw.parser.registerCsiHandler({ final: 'c' }, params => {
					if (params.length === 0 || params.length === 1 && params[0] === 0) {
						this._handleOnData('\x1b[?61;4c');
						return true;
					}
					return false;
				}));
			}
			if (this._processManager.os) {
				lineDataEventAddon.setOperatingSystem(this._processManager.os);
			}
			xterm.raw.options.windowsPty = processTraits.windowsPty;
		}));
		this._register(this._processManager.onRestoreCommands(e => this.xterm?.shellIntegration.deserialize(e)));

		this._register(this._viewDescriptorService.onDidChangeLocation(({ views }) => {
			if (views.some(v => v.id === TERMINAL_VIEW_ID)) {
				xterm.refresh();
			}
		}));
		this._register(xterm.onDidChangeProgress(() => this._labelComputer?.refreshLabel(this)));

		// Register and update the terminal's shell integration status
		this._register(Event.runAndSubscribe(xterm.shellIntegration.onDidChangeSeenSequences, () => {
			if (xterm.shellIntegration.seenSequences.size > 0) {
				this._refreshShellIntegrationInfoStatus(this);
			}
		}));

		// Set up updating of the process cwd on key press, this is only needed when the cwd
		// detection capability has not been registered
		if (!this.capabilities.has(TerminalCapability.CwdDetection)) {
			let onKeyListener: IDisposable | undefined = xterm.raw.onKey(e => {
				const event = new StandardKeyboardEvent(e.domEvent);
				if (event.equals(KeyCode.Enter)) {
					this._updateProcessCwd();
				}
			});
			this._register(this.capabilities.onDidAddCwdDetectionCapability(() => {
				onKeyListener?.dispose();
				onKeyListener = undefined;
			}));
		}

		if (this.xterm?.shellIntegration) {
			this.capabilities.add(this.xterm.shellIntegration.capabilities);
		}

		this._pathService.userHome().then(userHome => {
			this._userHome = userHome.fsPath;
		});

		if (this._isVisible) {
			this._open();
		}

		return xterm;
	}

	// Debounce this to avoid impacting input latency while typing into the prompt
	@debounce(500)
	private _refreshShellIntegrationInfoStatus(instance: ITerminalInstance) {
		if (!instance.xterm) {
			return;
		}
		const cmdDetectionType = (
			instance.capabilities.get(TerminalCapability.CommandDetection)?.hasRichCommandDetection
				? nls.localize('shellIntegration.rich', 'Rich')
				: instance.capabilities.has(TerminalCapability.CommandDetection)
					? nls.localize('shellIntegration.basic', 'Basic')
					: instance.usedShellIntegrationInjection
						? nls.localize('shellIntegration.injectionFailed', "Injection failed to activate")
						: nls.localize('shellIntegration.no', 'No')
		);

		const detailedAdditions: string[] = [];
		if (instance.shellType) {
			detailedAdditions.push(`Shell type: \`${instance.shellType}\``);
		}
		const cwd = instance.cwd;
		if (cwd) {
			detailedAdditions.push(`Current working directory: \`${cwd}\``);
		}
		const seenSequences = Array.from(instance.xterm.shellIntegration.seenSequences);
		if (seenSequences.length > 0) {
			detailedAdditions.push(`Seen sequences: ${seenSequences.map(e => `\`${e}\``).join(', ')}`);
		}
		const promptType = instance.capabilities.get(TerminalCapability.PromptTypeDetection)?.promptType;
		if (promptType) {
			detailedAdditions.push(`Prompt type: \`${promptType}\``);
		}
		const combinedString = instance.capabilities.get(TerminalCapability.CommandDetection)?.promptInputModel.getCombinedString();
		if (combinedString !== undefined) {
			detailedAdditions.push(`Prompt input: \`\`\`${combinedString}\`\`\``);
		}
		const detailedAdditionsString = detailedAdditions.length > 0
			? '\n\n' + detailedAdditions.map(e => `- ${e}`).join('\n')
			: '';

		instance.statusList.add({
			id: TerminalStatus.ShellIntegrationInfo,
			severity: Severity.Info,
			tooltip: `${nls.localize('shellIntegration', "Shell integration")}: ${cmdDetectionType}`,
			detailedTooltip: `${nls.localize('shellIntegration', "Shell integration")}: ${cmdDetectionType}${detailedAdditionsString}`
		});
	}

	async runCommand(commandLine: string, shouldExecute: boolean, commandId?: string): Promise<void> {
		let commandDetection = this.capabilities.get(TerminalCapability.CommandDetection);
		const siInjectionEnabled = this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnabled) === true;
		const timeoutMs = getShellIntegrationTimeout(
			this._configurationService,
			siInjectionEnabled,
			this.hasRemoteAuthority,
			this._processManager.processReadyTimestamp
		);

		if (!commandDetection || commandDetection.promptInputModel.state !== PromptInputState.Input) {
			const store = new DisposableStore();

			await Promise.race([
				new Promise<void>(r => {
					store.add(this.capabilities.onDidAddCommandDetectionCapability(e => {
						commandDetection = e;
						if (commandDetection.promptInputModel.state === PromptInputState.Input) {
							r();
						} else {
							store.add(commandDetection.promptInputModel.onDidStartInput(() => {
								r();
							}));
						}
					}));
				}),
				timeout(timeoutMs)
			]);
			store.dispose();
		}

		// If a command ID was provided and we have command detection, set it as the next command ID
		// so it will be used when the shell sends the command start sequence
		if (commandId && commandDetection) {
			this.xterm?.shellIntegration.setNextCommandId(commandLine, commandId);
			await this._processManager.setNextCommandId(commandLine, commandId);
		}

		// Determine whether to send ETX (ctrl+c) before running the command. Only do this when the
		// command will be executed immediately or when command detection shows the prompt contains text.
		if (shouldExecute && (!commandDetection || commandDetection.promptInputModel.value.length > 0)) {
			await this.sendText('\x03', false);
			// Wait a little before running the command to avoid the sequences being echoed while the ^C
			// is being evaluated
			await timeout(100);
		}
		// Use bracketed paste mode only when not running the command
		await this.sendText(commandLine, shouldExecute, !shouldExecute);
	}

	detachFromElement(): void {
		this._wrapperElement.remove();
		this._container = undefined;
	}

	attachToElement(container: HTMLElement): void {
		// The container did not change, do nothing
		if (this._container === container) {
			return;
		}

		if (!this._attachBarrier.isOpen()) {
			this._attachBarrier.open();
		}

		// The container changed, reattach
		this._container = container;
		this._container.appendChild(this._wrapperElement);

		// If xterm is already attached, call open again to pick up any changes to the window.
		if (this.xterm?.raw.element) {
			this.xterm.raw.open(this.xterm.raw.element);
		}

		this.xterm?.refresh();

		setTimeout(() => {
			if (this._store.isDisposed) {
				return;
			}
			this._initDragAndDrop(container);
		}, 0);
	}

	/**
	 * Opens the terminal instance inside the parent DOM element previously set with
	 * `attachToElement`, you must ensure the parent DOM element is explicitly visible before
	 * invoking this function as it performs some DOM calculations internally
	 */
	private _open(): void {
		if (!this.xterm || this.xterm.raw.element) {
			return;
		}

		if (!this._container || !this._container.isConnected) {
			throw new Error('A container element needs to be set with `attachToElement` and be part of the DOM before calling `_open`');
		}

		const xtermHost = document.createElement('div');
		xtermHost.classList.add('terminal-xterm-host');
		this._wrapperElement.appendChild(xtermHost);

		this._container.appendChild(this._wrapperElement);

		const xterm = this.xterm;

		// Attach the xterm object to the DOM, exposing it to the smoke tests
		this._wrapperElement.xterm = xterm.raw;

		const screenElement = xterm.attachToElement(xtermHost);

		// Fire xtermOpen on all contributions
		for (const contribution of this._contributions.values()) {
			if (!this.xterm) {
				this._xtermReadyPromise.then(xterm => {
					if (xterm) {
						contribution.xtermOpen?.(xterm);
					}
				});
			} else {
				contribution.xtermOpen?.(this.xterm);
			}
		}

		this._register(xterm.shellIntegration.onDidChangeStatus(() => {
			if (this.hasFocus) {
				this._setShellIntegrationContextKey();
			} else {
				this._terminalShellIntegrationEnabledContextKey.reset();
			}
		}));

		if (!xterm.raw.element || !xterm.raw.textarea) {
			throw new Error('xterm elements not set after open');
		}

		this._setAriaLabel(xterm.raw, this._instanceId, this._title);

		xterm.raw.attachCustomKeyEventHandler((event: KeyboardEvent): boolean => {
			// Disable all input if the terminal is exiting
			if (this._isExiting) {
				return false;
			}

			const standardKeyboardEvent = new StandardKeyboardEvent(event);
			const resolveResult = this._keybindingService.softDispatch(standardKeyboardEvent, standardKeyboardEvent.target);

			// Respect chords if the allowChords setting is set and it's not Escape. Escape is
			// handled specially for Zen Mode's Escape, Escape chord, plus it's important in
			// terminals generally
			const isValidChord = resolveResult.kind === ResultKind.MoreChordsNeeded && this._terminalConfigurationService.config.allowChords && event.key !== 'Escape';
			if (this._keybindingService.inChordMode || isValidChord) {
				event.preventDefault();
				return false;
			}

			// Skip processing by xterm.js of keyboard events that resolve to commands defined in
			// the commandsToSkipShell setting. Ensure sendKeybindingsToShell is respected here
			// which will disable this special handling and always opt to send the keystroke to the
			// shell process
			if (!this._terminalConfigurationService.config.sendKeybindingsToShell && resolveResult.kind === ResultKind.KbFound && resolveResult.commandId && this._skipTerminalCommands.some(k => k === resolveResult.commandId)) {
				event.preventDefault();
				return false;
			}

			// Skip processing by xterm.js of keyboard events that match menu bar mnemonics
			if (this._terminalConfigurationService.config.allowMnemonics && !isMacintosh && event.altKey) {
				return false;
			}

			// If tab focus mode is on, tab is not passed to the terminal
			if (TabFocus.getTabFocusMode() && event.key === 'Tab') {
				return false;
			}

			// Prevent default when shift+tab is being sent to the terminal to avoid it bubbling up
			// and changing focus https://github.com/microsoft/vscode/issues/188329
			if (event.key === 'Tab' && event.shiftKey) {
				event.preventDefault();
				return true;
			}

			// Always have alt+F4 skip the terminal on Windows and allow it to be handled by the
			// system
			if (isWindows && event.altKey && event.key === 'F4' && !event.ctrlKey) {
				return false;
			}

			// Fallback to force ctrl+v to paste on browsers that do not support
			// navigator.clipboard.readText
			if (!BrowserFeatures.clipboard.readText && event.key === 'v' && event.ctrlKey) {
				return false;
			}

			return true;
		});
		this._register(dom.addDisposableListener(xterm.raw.element, 'mousedown', () => {
			// We need to listen to the mouseup event on the document since the user may release
			// the mouse button anywhere outside of _xterm.element.
			const listener = dom.addDisposableListener(xterm.raw.element!.ownerDocument, 'mouseup', () => {
				// Delay with a setTimeout to allow the mouseup to propagate through the DOM
				// before evaluating the new selection state.
				setTimeout(() => this._refreshSelectionContextKey(), 0);
				listener.dispose();
			});
		}));
		this._register(dom.addDisposableListener(xterm.raw.element, 'touchstart', () => {
			xterm.raw.focus();
		}));

		// xterm.js currently drops selection on keyup as we need to handle this case.
		this._register(dom.addDisposableListener(xterm.raw.element, 'keyup', () => {
			// Wait until keyup has propagated through the DOM before evaluating
			// the new selection state.
			setTimeout(() => this._refreshSelectionContextKey(), 0);
		}));

		this._register(dom.addDisposableListener(xterm.raw.textarea, 'focus', () => this._setFocus(true)));
		this._register(dom.addDisposableListener(xterm.raw.textarea, 'blur', () => this._setFocus(false)));
		this._register(dom.addDisposableListener(xterm.raw.textarea, 'focusout', () => this._setFocus(false)));

		this._initDragAndDrop(this._container);

		this._widgetManager.attachToElement(screenElement);

		if (this._lastLayoutDimensions) {
			this.layout(this._lastLayoutDimensions);
		}
		this.updateConfig();

		// If IShellLaunchConfig.waitOnExit was true and the process finished before the terminal
		// panel was initialized.
		if (xterm.raw.options.disableStdin) {
			this._attachPressAnyKeyToCloseListener(xterm.raw);
		}
	}

	private _setFocus(focused?: boolean): void {
		if (focused) {
			this._terminalFocusContextKey.set(true);
			this._setShellIntegrationContextKey();
			this._onDidFocus.fire(this);
		} else {
			this.resetFocusContextKey();
			this._onDidBlur.fire(this);
			this._refreshSelectionContextKey();
		}
	}

	private _setShellIntegrationContextKey(): void {
		if (this.xterm) {
			this._terminalShellIntegrationEnabledContextKey.set(this.xterm.shellIntegration.status === ShellIntegrationStatus.VSCode);
		}
	}

	resetFocusContextKey(): void {
		this._terminalFocusContextKey.reset();
		this._terminalShellIntegrationEnabledContextKey.reset();
	}

	private _initDragAndDrop(container: HTMLElement) {
		const store = new DisposableStore();
		const dndController = store.add(this._scopedInstantiationService.createInstance(TerminalInstanceDragAndDropController, container));
		store.add(dndController.onDropTerminal(e => this._onRequestAddInstanceToGroup.fire(e)));
		store.add(dndController.onDropFile(async path => {
			this.focus();
			await this.sendPath(path, false);
		}));
		store.add(new dom.DragAndDropObserver(container, dndController));
		this._dndObserver.value = store;
	}

	hasSelection(): boolean {
		return this.xterm ? this.xterm.raw.hasSelection() : false;
	}

	get selection(): string | undefined {
		return this.xterm && this.hasSelection() ? this.xterm.raw.getSelection() : undefined;
	}

	clearSelection(): void {
		this.xterm?.raw.clearSelection();
	}

	private _refreshAltBufferContextKey() {
		this._terminalAltBufferActiveContextKey.set(!!(this.xterm && this.xterm.raw.buffer.active === this.xterm.raw.buffer.alternate));
	}

	override dispose(reason?: TerminalExitReason): void {
		if (this.shellLaunchConfig.type === 'Task' && reason === TerminalExitReason.Process && this._exitCode !== 0 && !this.shellLaunchConfig.waitOnExit) {
			return;
		}
		if (this.isDisposed) {
			return;
		}
		this._logService.trace(`terminalInstance#dispose (instanceId: ${this.instanceId})`);
		dispose(this._widgetManager);

		if (this.xterm?.raw.element) {
			this._hadFocusOnExit = this.hasFocus;
		}
		if (this._wrapperElement.xterm) {
			this._wrapperElement.xterm = undefined;
		}
		if (this._horizontalScrollbar) {
			this._horizontalScrollbar.dispose();
			this._horizontalScrollbar = undefined;
		}

		try {
			this.xterm?.dispose();
		} catch (err: unknown) {
			// See https://github.com/microsoft/vscode/issues/153486
			this._logService.error('Exception occurred during xterm disposal', err);
		}

		// HACK: Workaround for Firefox bug https://bugzilla.mozilla.org/show_bug.cgi?id=559561,
		// as 'blur' event in xterm.raw.textarea is not triggered on xterm.dispose()
		// See https://github.com/microsoft/vscode/issues/138358
		if (isFirefox) {
			this.resetFocusContextKey();
			this._terminalHasTextContextKey.reset();
			this._onDidBlur.fire(this);
		}

		if (this._pressAnyKeyToCloseListener) {
			this._pressAnyKeyToCloseListener.dispose();
			this._pressAnyKeyToCloseListener = undefined;
		}

		if (this._exitReason === undefined) {
			this._exitReason = reason ?? TerminalExitReason.Unknown;
		}

		this._processManager.dispose();
		// Process manager dispose/shutdown doesn't fire process exit, trigger with undefined if it
		// hasn't happened yet
		this._onProcessExit(undefined);

		this._onDisposed.fire(this);

		super.dispose();
	}

	async detachProcessAndDispose(reason: TerminalExitReason): Promise<void> {
		// Detach the process and dispose the instance, without the instance dispose the terminal
		// won't go away. Force persist if the detach was requested by the user (not shutdown).
		await this._processManager.detachFromProcess(reason === TerminalExitReason.User);
		this.dispose(reason);
	}

	focus(force?: boolean): void {
		this._refreshAltBufferContextKey();
		if (!this.xterm) {
			return;
		}
		if (force || !dom.getActiveWindow().getSelection()?.toString()) {
			this.xterm.raw.focus();
			this._onDidRequestFocus.fire();
		}
	}

	async focusWhenReady(force?: boolean): Promise<void> {
		await this._xtermReadyPromise;
		await this._attachBarrier.wait();
		this.focus(force);
	}

	async sendText(text: string, shouldExecute: boolean, bracketedPasteMode?: boolean): Promise<void> {
		// Apply bracketed paste sequences if the terminal has the mode enabled, this will prevent
		// the text from triggering keybindings and ensure new lines are handled properly
		if (bracketedPasteMode && this.xterm?.raw.modes.bracketedPasteMode) {
			text = `\x1b[200~${text}\x1b[201~`;
		}

		// Normalize line endings to 'enter' press.
		text = text.replace(/\r?\n/g, '\r');
		if (shouldExecute && !text.endsWith('\r')) {
			text += '\r';
		}

		// Send it to the process
		this._logService.debug('sending data (vscode)', text);
		await this._processManager.write(text);
		this._onDidInputData.fire(text);
		this._onDidSendText.fire(text);
		this.xterm?.scrollToBottom();
		if (shouldExecute) {
			this._onDidExecuteText.fire();
		}
	}

	async sendSignal(signal: string): Promise<void> {
		this._logService.debug('sending signal (vscode)', signal);
		await this._processManager.sendSignal(signal);
	}

	async sendPath(originalPath: string | URI, shouldExecute: boolean): Promise<void> {
		return this.sendText(await this.preparePathForShell(originalPath), shouldExecute);
	}

	async preparePathForShell(originalPath: string | URI): Promise<string> {
		// Wait for shell type to be ready
		await this.processReady;
		return preparePathForShell(originalPath, this.shellLaunchConfig.executable, this.title, this.shellType, this._processManager.backend, this._processManager.os);
	}

	async getUriLabelForShell(uri: URI): Promise<string> {
		// Wait for shell type to be ready
		await this.processReady;
		return getUriLabelForShell(uri, this._processManager.backend!, this.shellType, this.os);
	}

	setVisible(visible: boolean): void {
		const didChange = this._isVisible !== visible;
		this._isVisible = visible;
		this._wrapperElement.classList.toggle('active', visible);
		if (visible && this.xterm) {
			this._open();
			// Flush any pending resizes
			this._resizeDebouncer?.flush();
			// Resize to re-evaluate dimensions, this will ensure when switching to a terminal it is
			// using the most up to date dimensions (eg. when terminal is created in the background
			// using cached dimensions of a split terminal).
			this._resize();
		}
		if (didChange) {
			this._onDidChangeVisibility.fire(visible);
		}
	}

	scrollDownLine(): void {
		this.xterm?.scrollDownLine();
	}

	scrollDownPage(): void {
		this.xterm?.scrollDownPage();
	}

	scrollToBottom(): void {
		this.xterm?.scrollToBottom();
	}

	scrollUpLine(): void {
		this.xterm?.scrollUpLine();
	}

	scrollUpPage(): void {
		this.xterm?.scrollUpPage();
	}

	scrollToTop(): void {
		this.xterm?.scrollToTop();
	}

	clearBuffer(): void {
		this._processManager.clearBuffer();
		this.xterm?.clearBuffer();
	}

	private _refreshSelectionContextKey() {
		const isActive = !!this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID);
		let isEditorActive = false;
		const editor = this._editorService.activeEditor;
		if (editor) {
			isEditorActive = editor instanceof TerminalEditorInput;
		}
		this._terminalHasTextContextKey.set((isActive || isEditorActive) && this.hasSelection());
	}

	protected _createProcessManager(): TerminalProcessManager {
		let deserializedCollections: ReadonlyMap<string, IEnvironmentVariableCollection> | undefined;
		if (this.shellLaunchConfig.attachPersistentProcess?.environmentVariableCollections) {
			deserializedCollections = deserializeEnvironmentVariableCollections(this.shellLaunchConfig.attachPersistentProcess.environmentVariableCollections);
		}
		const processManager = this._scopedInstantiationService.createInstance(
			TerminalProcessManager,
			this._instanceId,
			this.shellLaunchConfig?.cwd,
			deserializedCollections,
			this.shellLaunchConfig.shellIntegrationNonce ?? this.shellLaunchConfig.attachPersistentProcess?.shellIntegrationNonce
		);
		this.capabilities.add(processManager.capabilities);
		this._register(processManager.onProcessReady(async (e) => {
			this._onProcessIdReady.fire(this);
			this._initialCwd = await this.getInitialCwd();
			// Set the initial name based on the _resolved_ shell launch config, this will also
			// ensure the resolved icon gets shown
			if (!this._labelComputer) {
				this._labelComputer = this._register(this._scopedInstantiationService.createInstance(TerminalLabelComputer));
				this._register(this._labelComputer.onDidChangeLabel(e => {
					const wasChanged = this._title !== e.title || this._description !== e.description;
					if (wasChanged) {
						this._title = e.title;
						this._description = e.description;
						this._onTitleChanged.fire(this);
					}
				}));
			}
			if (this._shellLaunchConfig.name) {
				this._setTitle(this._shellLaunchConfig.name, TitleEventSource.Api);
			} else {
				// Listen to xterm.js' sequence title change event, trigger this async to ensure
				// _xtermReadyPromise is ready constructed since this is called from the ctor
				setTimeout(() => {
					this._xtermReadyPromise.then(xterm => {
						if (xterm) {
							this._messageTitleDisposable.value = xterm.raw.onTitleChange(e => this._onTitleChange(e));
						}
					});
				});
				this._setTitle(this._shellLaunchConfig.executable, TitleEventSource.Process);
			}
		}));
		this._register(processManager.onProcessExit(exitCode => this._onProcessExit(exitCode)));
		this._register(processManager.onDidChangeProperty(({ type, value }) => {
			switch (type) {
				case ProcessPropertyType.Cwd:
					this._cwd = value as IProcessPropertyMap[ProcessPropertyType.Cwd];
					this._labelComputer?.refreshLabel(this);
					break;
				case ProcessPropertyType.InitialCwd:
					this._initialCwd = value as IProcessPropertyMap[ProcessPropertyType.InitialCwd];
					this._cwd = this._initialCwd;
					this._setTitle(this.title, TitleEventSource.Config);
					this._icon = this._shellLaunchConfig.attachPersistentProcess?.icon || this._shellLaunchConfig.icon;
					this._onIconChanged.fire({ instance: this, userInitiated: false });
					break;
				case ProcessPropertyType.Title:
					this._setTitle(value as IProcessPropertyMap[ProcessPropertyType.Title] ?? '', TitleEventSource.Process);
					break;
				case ProcessPropertyType.OverrideDimensions:
					this.setOverrideDimensions(value as IProcessPropertyMap[ProcessPropertyType.OverrideDimensions], true);
					break;
				case ProcessPropertyType.ResolvedShellLaunchConfig:
					this._setResolvedShellLaunchConfig(value as IProcessPropertyMap[ProcessPropertyType.ResolvedShellLaunchConfig]);
					break;
				case ProcessPropertyType.ShellType:
					this.setShellType(value as IProcessPropertyMap[ProcessPropertyType.ShellType]);
					break;
				case ProcessPropertyType.HasChildProcesses:
					this._onDidChangeHasChildProcesses.fire(value as IProcessPropertyMap[ProcessPropertyType.HasChildProcesses]);
					break;
				case ProcessPropertyType.UsedShellIntegrationInjection:
					this._usedShellIntegrationInjection = true;
					break;
				case ProcessPropertyType.ShellIntegrationInjectionFailureReason:
					this._shellIntegrationInjectionInfo = value as IProcessPropertyMap[ProcessPropertyType.ShellIntegrationInjectionFailureReason];
					break;
			}
		}));

		this._initialDataEventsListener.value = processManager.onProcessData(ev => this._initialDataEvents?.push(ev.data));
		this._register(processManager.onProcessReplayComplete(() => this._onProcessReplayComplete.fire()));
		this._register(processManager.onEnvironmentVariableInfoChanged(e => this._onEnvironmentVariableInfoChanged(e)));
		this._register(processManager.onPtyDisconnect(() => {
			if (this.xterm) {
				this.xterm.raw.options.disableStdin = true;
			}
			this.statusList.add({
				id: TerminalStatus.Disconnected,
				severity: Severity.Error,
				icon: Codicon.debugDisconnect,
				tooltip: nls.localize('disconnectStatus', "Lost connection to process")
			});
		}));
		this._register(processManager.onPtyReconnect(() => {
			if (this.xterm) {
				this.xterm.raw.options.disableStdin = false;
			}
			this.statusList.remove(TerminalStatus.Disconnected);
		}));

		return processManager;
	}

	private async _createProcess(): Promise<void> {
		if (this.isDisposed) {
			return;
		}
		const trusted = await this._trust();
		// Allow remote and local terminals from remote to be created in untrusted remote workspace
		if (!trusted && !this.remoteAuthority && !this._workbenchEnvironmentService.remoteAuthority) {
			this._onProcessExit({ message: nls.localize('workspaceNotTrustedCreateTerminal', "Cannot launch a terminal process in an untrusted workspace") });
		} else if (this._workspaceContextService.getWorkspace().folders.length === 0 && this._cwd && this._userHome && this._cwd !== this._userHome) {
			// something strange is going on if cwd is not userHome in an empty workspace
			this._onProcessExit({
				message: nls.localize('workspaceNotTrustedCreateTerminalCwd', "Cannot launch a terminal process in an untrusted workspace with cwd {0} and userHome {1}", this._cwd, this._userHome)
			});
		}
		// Re-evaluate dimensions if the container has been set since the xterm instance was created
		if (this._container && this._cols === 0 && this._rows === 0) {
			this._initDimensions();
			this.xterm?.resize(this._cols || Constants.DefaultCols, this._rows || Constants.DefaultRows);
		}
		const originalIcon = this.shellLaunchConfig.icon;
		await this._processManager.createProcess(this._shellLaunchConfig, this._cols || Constants.DefaultCols, this._rows || Constants.DefaultRows).then(result => {
			if (result) {
				if (hasKey(result, { message: true })) {
					this._onProcessExit(result);
				} else if (hasKey(result, { injectedArgs: true })) {
					this._injectedArgs = result.injectedArgs;
				}
			}
		});
		if (this.isDisposed) {
			return;
		}
		if (originalIcon !== this.shellLaunchConfig.icon || this.shellLaunchConfig.color) {
			this._icon = this._shellLaunchConfig.attachPersistentProcess?.icon || this._shellLaunchConfig.icon;
			this._onIconChanged.fire({ instance: this, userInitiated: false });
		}
	}

	public registerMarker(offset?: number): IMarker | undefined {
		return this.xterm?.raw.registerMarker(offset);
	}

	public addBufferMarker(properties: IMarkProperties): void {
		this.capabilities.get(TerminalCapability.BufferMarkDetection)?.addMark(properties);
	}

	public scrollToMark(startMarkId: string, endMarkId?: string, highlight?: boolean): void {
		this.xterm?.markTracker.scrollToClosestMarker(startMarkId, endMarkId, highlight);
	}

	public async freePortKillProcess(port: string, command: string): Promise<void> {
		await this._processManager?.freePortKillProcess(port);
		this.runCommand(command, false);
	}

	private _onProcessData(ev: IProcessDataEvent): void {
		// Ensure events are split by SI command execute and command finished sequence to ensure the
		// output of the command can be read by extensions and the output of the command is of a
		// consistent form respectively. This must be done here as xterm.js does not currently have
		// a listener for when individual data events are parsed, only `onWriteParsed` which fires
		// when the write buffer is flushed.
		const leadingSegmentedData: string[] = [];
		const matches = ev.data.matchAll(/(?<seq>\x1b\][16]33;(?:C|D(?:;\d+)?)\x07)/g);
		let i = 0;
		for (const match of matches) {
			if (match.groups?.seq === undefined) {
				throw new BugIndicatingError('seq must be defined');
			}
			leadingSegmentedData.push(ev.data.substring(i, match.index));
			leadingSegmentedData.push(match.groups?.seq ?? '');
			i = match.index + match[0].length;
		}
		const lastData = ev.data.substring(i);

		// Write all leading segmented data first, followed by the last data, tracking commit if
		// necessary
		for (let i = 0; i < leadingSegmentedData.length; i++) {
			this._writeProcessData(leadingSegmentedData[i]);
		}
		if (ev.trackCommit) {
			ev.writePromise = new Promise<void>(r => this._writeProcessData(lastData, r));
		} else {
			this._writeProcessData(lastData);
		}
	}

	private _writeProcessData(data: string, cb?: () => void) {
		this._onWillData.fire(data);
		const messageId = ++this._latestXtermWriteData;
		this.xterm?.raw.write(data, () => {
			this._latestXtermParseData = messageId;
			this._processManager.acknowledgeDataEvent(data.length);
			cb?.();
			this._onData.fire(data);
		});
	}

	/**
	 * Called when either a process tied to a terminal has exited or when a terminal renderer
	 * simulates a process exiting (e.g. custom execution task).
	 * @param exitCode The exit code of the process, this is undefined when the terminal was exited
	 * through user action.
	 */
	private async _onProcessExit(exitCodeOrError?: number | ITerminalLaunchError): Promise<void> {
		// Prevent dispose functions being triggered multiple times
		if (this._isExiting) {
			return;
		}
		const parsedExitResult = parseExitResult(exitCodeOrError, this.shellLaunchConfig, this._processManager.processState, this._initialCwd);

		if (this._usedShellIntegrationInjection && this._processManager.processState === ProcessState.KilledDuringLaunch && parsedExitResult?.code !== 0) {
			this._relaunchWithShellIntegrationDisabled(parsedExitResult?.message);
			this._onExit.fire(exitCodeOrError);
			return;
		}

		this._isExiting = true;

		await this._flushXtermData();

		this._exitCode = parsedExitResult?.code;
		const exitMessage = parsedExitResult?.message;

		this._logService.debug('Terminal process exit', 'instanceId', this.instanceId, 'code', this._exitCode, 'processState', this._processManager.processState);

		// Only trigger wait on exit when the exit was *not* triggered by the
		// user (via the `workbench.action.terminal.kill` command).
		const waitOnExit = this.waitOnExit;
		if (waitOnExit && this._processManager.processState !== ProcessState.KilledByUser) {
			this._xtermReadyPromise.then(xterm => {
				if (!xterm) {
					return;
				}
				if (exitMessage) {
					xterm.raw.write(formatMessageForTerminal(exitMessage));
				}
				switch (typeof waitOnExit) {
					case 'string':
						xterm.raw.write(formatMessageForTerminal(waitOnExit, { excludeLeadingNewLine: true }));
						break;
					case 'function':
						if (this.exitCode !== undefined) {
							xterm.raw.write(formatMessageForTerminal(waitOnExit(this.exitCode), { excludeLeadingNewLine: true }));
						}
						break;
				}
				// Disable all input if the terminal is exiting and listen for next keypress
				xterm.raw.options.disableStdin = true;
				if (xterm.raw.textarea) {
					this._attachPressAnyKeyToCloseListener(xterm.raw);
				}
			});
		} else {
			if (exitMessage) {
				const failedDuringLaunch = this._processManager.processState === ProcessState.KilledDuringLaunch;
				if (failedDuringLaunch || (this._terminalConfigurationService.config.showExitAlert && this.xterm?.lastInputEvent !== /*Ctrl+D*/'\x04')) {
					// Always show launch failures
					this._notificationService.notify({
						message: exitMessage,
						severity: Severity.Error,
						actions: { primary: [this._scopedInstantiationService.createInstance(TerminalLaunchHelpAction)] }
					});
				} else {
					// Log to help surface the error in case users report issues with showExitAlert
					// disabled
					this._logService.warn(exitMessage);
				}
			}
			this.dispose(TerminalExitReason.Process);
		}

		// First onExit to consumers, this can happen after the terminal has already been disposed.
		this._onExit.fire(exitCodeOrError);

		// Dispose of the onExit event if the terminal will not be reused again
		if (this.isDisposed) {
			this._onExit.dispose();
		}
	}

	private _relaunchWithShellIntegrationDisabled(exitMessage: string | undefined): void {
		this._shellLaunchConfig.ignoreShellIntegration = true;
		this.relaunch();
		this.statusList.add({
			id: TerminalStatus.ShellIntegrationAttentionNeeded,
			severity: Severity.Warning,
			icon: Codicon.warning,
			tooltip: `${exitMessage} ` + nls.localize('launchFailed.exitCodeOnlyShellIntegration', 'Disabling shell integration in user settings might help.'),
			hoverActions: [{
				commandId: TerminalCommandId.ShellIntegrationLearnMore,
				label: nls.localize('shellIntegration.learnMore', "Learn more about shell integration"),
				run: () => {
					this._openerService.open('https://code.visualstudio.com/docs/editor/integrated-terminal#_shell-integration');
				}
			}, {
				commandId: 'workbench.action.openSettings',
				label: nls.localize('shellIntegration.openSettings', "Open user settings"),
				run: () => {
					this._commandService.executeCommand('workbench.action.openSettings', 'terminal.integrated.shellIntegration.enabled');
				}
			}]
		});
		this._telemetryService.publicLog2<{}, { owner: 'meganrogge'; comment: 'Indicates the process exited when created with shell integration args' }>('terminal/shellIntegrationFailureProcessExit');
	}

	/**
	 * Ensure write calls to xterm.js have finished before resolving.
	 */
	private _flushXtermData(): Promise<void> {
		if (this._latestXtermWriteData === this._latestXtermParseData) {
			return Promise.resolve();
		}
		let retries = 0;
		return new Promise<void>(r => {
			const interval = dom.disposableWindowInterval(dom.getActiveWindow().window, () => {
				if (this._latestXtermWriteData === this._latestXtermParseData || ++retries === 5) {
					interval.dispose();
					r();
				}
			}, 20);
		});
	}

	private _attachPressAnyKeyToCloseListener(xterm: XTermTerminal) {
		if (xterm.textarea && !this._pressAnyKeyToCloseListener) {
			this._pressAnyKeyToCloseListener = dom.addDisposableListener(xterm.textarea, 'keypress', (event: KeyboardEvent) => {
				if (this._pressAnyKeyToCloseListener) {
					this._pressAnyKeyToCloseListener.dispose();
					this._pressAnyKeyToCloseListener = undefined;
					this.dispose(TerminalExitReason.Process);
					event.preventDefault();
				}
			});
		}
	}

	private _writeInitialText(xterm: XtermTerminal, callback?: () => void): void {
		if (!this._shellLaunchConfig.initialText) {
			callback?.();
			return;
		}
		const text = isString(this._shellLaunchConfig.initialText)
			? this._shellLaunchConfig.initialText
			: this._shellLaunchConfig.initialText?.text;
		if (isString(this._shellLaunchConfig.initialText)) {
			xterm.raw.writeln(text, callback);
		} else {
			if (this._shellLaunchConfig.initialText.trailingNewLine) {
				xterm.raw.writeln(text, callback);
			} else {
				xterm.raw.write(text, callback);
			}
		}
	}

	async reuseTerminal(shell: IShellLaunchConfig, reset: boolean = false): Promise<void> {
		// Unsubscribe any key listener we may have.
		this._pressAnyKeyToCloseListener?.dispose();
		this._pressAnyKeyToCloseListener = undefined;

		const xterm = this.xterm;
		if (xterm) {
			if (!reset) {
				// Ensure new processes' output starts at start of new line
				await new Promise<void>(r => xterm.raw.write('\n\x1b[G', r));
			}

			// Print initialText if specified
			if (shell.initialText) {
				this._shellLaunchConfig.initialText = shell.initialText;
				await new Promise<void>(r => this._writeInitialText(xterm, r));
			}

			// Clean up waitOnExit state
			if (this._isExiting && this._shellLaunchConfig.waitOnExit) {
				xterm.raw.options.disableStdin = false;
				this._isExiting = false;
			}
			if (reset) {
				xterm.clearDecorations();
			}
		}

		// Dispose the environment info widget if it exists
		this.statusList.remove(TerminalStatus.RelaunchNeeded);

		if (!reset) {
			// HACK: Force initialText to be non-falsy for reused terminals such that the
			// conptyInheritCursor flag is passed to the node-pty, this flag can cause a Window to stop
			// responding in Windows 10 1903 so we only want to use it when something is definitely written
			// to the terminal.
			shell.initialText = ' ';
		}

		// Set the new shell launch config
		this._shellLaunchConfig = shell; // Must be done before calling _createProcess()
		await this._processManager.relaunch(this._shellLaunchConfig, this._cols || Constants.DefaultCols, this._rows || Constants.DefaultRows, reset).then(result => {
			if (result) {
				if (hasKey(result, { message: true })) {
					this._onProcessExit(result);
				} else if (hasKey(result, { injectedArgs: true })) {
					this._injectedArgs = result.injectedArgs;
				}
			}
		});
	}

	@debounce(1000)
	relaunch(): void {
		// Clear the attachPersistentProcess flag to ensure we create a new process
		// instead of trying to reattach to the existing one during relaunch.
		const shellLaunchConfig = { ...this._shellLaunchConfig };
		delete shellLaunchConfig.attachPersistentProcess;

		this.reuseTerminal(shellLaunchConfig, true);
	}

	private _onTitleChange(title: string): void {
		if (this.isTitleSetByProcess) {
			this._setTitle(title, TitleEventSource.Sequence);
		}
	}

	private async _trust(): Promise<boolean> {
		return (await this._workspaceTrustRequestService.requestWorkspaceTrust(
			{
				message: nls.localize('terminal.requestTrust', "Creating a terminal process requires executing code")
			})) === true;
	}

	@debounce(2000)
	private async _updateProcessCwd(): Promise<void> {
		if (this.isDisposed || this.shellLaunchConfig.customPtyImplementation) {
			return;
		}
		// reset cwd if it has changed, so file based url paths can be resolved
		try {
			const cwd = await this._refreshProperty(ProcessPropertyType.Cwd);
			if (!isString(cwd)) {
				throw new Error(`cwd is not a string ${cwd}`);
			}
		} catch (e: unknown) {
			// Swallow this as it means the process has been killed
			if (e instanceof Error && e.message === 'Cannot refresh property when process is not set') {
				return;
			}
			throw e;
		}
	}

	updateConfig(): void {
		this._setCommandsToSkipShell(this._terminalConfigurationService.config.commandsToSkipShell);
		this._refreshEnvironmentVariableInfoWidgetState(this._processManager.environmentVariableInfo);
	}

	private async _updateUnicodeVersion(): Promise<void> {
		this._processManager.setUnicodeVersion(this._terminalConfigurationService.config.unicodeVersion);
	}

	updateAccessibilitySupport(): void {
		this.xterm!.raw.options.screenReaderMode = this._accessibilityService.isScreenReaderOptimized();
	}

	private _setCommandsToSkipShell(commands: string[]): void {
		const excludeCommands = commands.filter(command => command[0] === '-').map(command => command.slice(1));
		this._skipTerminalCommands = DEFAULT_COMMANDS_TO_SKIP_SHELL.filter(defaultCommand => {
			return !excludeCommands.includes(defaultCommand);
		}).concat(commands);
	}

	layout(dimension: dom.Dimension): void {
		this._lastLayoutDimensions = dimension;
		if (this.disableLayout) {
			return;
		}

		// Don't layout if dimensions are invalid (eg. the container is not attached to the DOM or
		// if display: none
		if (dimension.width <= 0 || dimension.height <= 0) {
			return;
		}

		// Evaluate columns and rows, exclude the wrapper element's margin
		const terminalWidth = this._evaluateColsAndRows(dimension.width, dimension.height);
		if (!terminalWidth) {
			return;
		}

		this._resize();

		// Signal the container is ready
		if (!this._containerReadyBarrier.isOpen()) {
			this._containerReadyBarrier.open();
		}

		// Layout all contributions
		for (const contribution of this._contributions.values()) {
			if (!this.xterm) {
				this._xtermReadyPromise.then(xterm => {
					if (xterm) {
						contribution.layout?.(xterm, dimension);
					}
				});
			} else {
				contribution.layout?.(this.xterm, dimension);
			}
		}
	}

	private async _resize(immediate?: boolean): Promise<void> {
		if (!this.xterm) {
			return;
		}

		let cols = this.cols;
		let rows = this.rows;

		// Only apply these settings when the terminal is visible so that
		// the characters are measured correctly.
		if (this._isVisible && this._layoutSettingsChanged) {
			const font = this.xterm.getFont();
			const config = this._terminalConfigurationService.config;
			this.xterm.raw.options.letterSpacing = font.letterSpacing;
			this.xterm.raw.options.lineHeight = font.lineHeight;
			this.xterm.raw.options.fontSize = font.fontSize;
			this.xterm.raw.options.fontFamily = font.fontFamily;
			this.xterm.raw.options.fontWeight = config.fontWeight;
			this.xterm.raw.options.fontWeightBold = config.fontWeightBold;

			// Any of the above setting changes could have changed the dimensions of the
			// terminal, re-evaluate now.
			this._initDimensions();
			cols = this.cols;
			rows = this.rows;

			this._layoutSettingsChanged = false;
		}

		if (isNaN(cols) || isNaN(rows)) {
			return;
		}

		if (cols !== this.xterm.raw.cols || rows !== this.xterm.raw.rows) {
			if (this._fixedRows || this._fixedCols) {
				await this._updateProperty(ProcessPropertyType.FixedDimensions, { cols: this._fixedCols, rows: this._fixedRows });
			}
			this._onDimensionsChanged.fire();
		}

		TerminalInstance._lastKnownGridDimensions = { cols, rows };
		this._resizeDebouncer!.resize(cols, rows, immediate ?? false);
	}

	private async _updatePtyDimensions(rawXterm: XTermTerminal): Promise<void> {
		await this._processManager.setDimensions(rawXterm.cols, rawXterm.rows);
	}

	setShellType(shellType: TerminalShellType | undefined) {
		if (this._shellType === shellType) {
			return;
		}
		this._shellType = shellType;
		if (shellType === undefined) {
			this._terminalShellTypeContextKey.reset();
		} else {
			this._terminalShellTypeContextKey.set(shellType?.toString());
		}
		this._onDidChangeShellType.fire(shellType);

	}

	private _setAriaLabel(xterm: XTermTerminal | undefined, terminalId: number, title: string | undefined): void {
		const labelParts: string[] = [];
		if (xterm && xterm.textarea) {
			if (title && title.length > 0) {
				labelParts.push(nls.localize('terminalTextBoxAriaLabelNumberAndTitle', "Terminal {0}, {1}", terminalId, title));
			} else {
				labelParts.push(nls.localize('terminalTextBoxAriaLabel', "Terminal {0}", terminalId));
			}
			const screenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
			if (!screenReaderOptimized) {
				labelParts.push(nls.localize('terminalScreenReaderMode', "Run the command: Toggle Screen Reader Accessibility Mode for an optimized screen reader experience"));
			}
			const accessibilityHelpKeybinding = this._keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
			if (this._configurationService.getValue(AccessibilityVerbositySettingId.Terminal) && accessibilityHelpKeybinding) {
				labelParts.push(nls.localize('terminalHelpAriaLabel', "Use {0} for terminal accessibility help", accessibilityHelpKeybinding));
			}
			xterm.textarea.setAttribute('aria-label', labelParts.join('\n'));
		}
	}

	private _updateTitleProperties(title: string | undefined, eventSource: TitleEventSource): string {
		if (!title) {
			return this._processName;
		}
		switch (eventSource) {
			case TitleEventSource.Process:
				if (this._processManager.os === OperatingSystem.Windows) {
					// Extract the file name without extension
					title = path.win32.parse(title).name;
				} else {
					const firstSpaceIndex = title.indexOf(' ');
					if (title.startsWith('/')) {
						title = path.basename(title);
					} else if (firstSpaceIndex > -1) {
						title = title.substring(0, firstSpaceIndex);
					}
				}
				this._processName = title;
				break;
			case TitleEventSource.Api:
				// If the title has not been set by the API or the rename command, unregister the handler that
				// automatically updates the terminal name
				this._staticTitle = title;
				this._messageTitleDisposable.value = undefined;
				break;
			case TitleEventSource.Sequence:
				// On Windows, some shells will fire this with the full path which we want to trim
				// to show just the file name. This should only happen if the title looks like an
				// absolute Windows file path
				this._sequence = title;
				if (this._processManager.os === OperatingSystem.Windows &&
					title.match(/^[a-zA-Z]:\\.+\.[a-zA-Z]{1,3}/)) {
					this._sequence = path.win32.parse(title).name;
				}
				break;
		}
		this._titleSource = eventSource;
		return title;
	}

	setOverrideDimensions(dimensions: ITerminalDimensionsOverride | undefined, immediate: boolean = false): void {
		if (this._dimensionsOverride && this._dimensionsOverride.forceExactSize && !dimensions && this._rows === 0 && this._cols === 0) {
			// this terminal never had a real size => keep the last dimensions override exact size
			this._cols = this._dimensionsOverride.cols;
			this._rows = this._dimensionsOverride.rows;
		}
		this._dimensionsOverride = dimensions;
		if (immediate) {
			this._resize(true);
		} else {
			this._resize();
		}
	}

	async setFixedDimensions(): Promise<void> {
		const cols = await this._quickInputService.input({
			title: nls.localize('setTerminalDimensionsColumn', "Set Fixed Dimensions: Column"),
			placeHolder: 'Enter a number of columns or leave empty for automatic width',
			validateInput: async (text) => text.length > 0 && !text.match(/^\d+$/) ? { content: 'Enter a number or leave empty size automatically', severity: Severity.Error } : undefined
		});
		if (cols === undefined) {
			return;
		}
		this._fixedCols = this._parseFixedDimension(cols);
		this._labelComputer?.refreshLabel(this);
		this._terminalHasFixedWidth.set(!!this._fixedCols);
		const rows = await this._quickInputService.input({
			title: nls.localize('setTerminalDimensionsRow', "Set Fixed Dimensions: Row"),
			placeHolder: 'Enter a number of rows or leave empty for automatic height',
			validateInput: async (text) => text.length > 0 && !text.match(/^\d+$/) ? { content: 'Enter a number or leave empty size automatically', severity: Severity.Error } : undefined
		});
		if (rows === undefined) {
			return;
		}
		this._fixedRows = this._parseFixedDimension(rows);
		this._labelComputer?.refreshLabel(this);
		await this._refreshScrollbar();
		this._resize();
		this.focus();
	}

	private _parseFixedDimension(value: string): number | undefined {
		if (value === '') {
			return undefined;
		}
		const parsed = parseInt(value);
		if (parsed <= 0) {
			throw new Error(`Could not parse dimension "${value}"`);
		}
		return parsed;
	}

	async toggleSizeToContentWidth(): Promise<void> {
		if (!this.xterm?.raw.buffer.active) {
			return;
		}
		if (this._hasScrollBar) {
			this._terminalHasFixedWidth.set(false);
			this._fixedCols = undefined;
			this._fixedRows = undefined;
			this._hasScrollBar = false;
			this._initDimensions();
			await this._resize();
		} else {
			const font = this.xterm ? this.xterm.getFont() : this._terminalConfigurationService.getFont(dom.getWindow(this.domElement));
			const maxColsForTexture = Math.floor(Constants.MaxCanvasWidth / (font.charWidth ?? 20));
			// Fixed columns should be at least xterm.js' regular column count
			const proposedCols = Math.max(this.maxCols, Math.min(this.xterm.getLongestViewportWrappedLineLength(), maxColsForTexture));
			// Don't switch to fixed dimensions if the content already fits as it makes the scroll
			// bar look bad being off the edge
			if (proposedCols > this.xterm.raw.cols) {
				this._fixedCols = proposedCols;
			}
		}
		await this._refreshScrollbar();
		this._labelComputer?.refreshLabel(this);
		this.focus();
	}

	private _refreshScrollbar(): Promise<void> {
		if (this._fixedCols || this._fixedRows) {
			return this._addScrollbar();
		}
		return this._removeScrollbar();
	}

	private async _addScrollbar(): Promise<void> {
		const charWidth = (this.xterm ? this.xterm.getFont() : this._terminalConfigurationService.getFont(dom.getWindow(this.domElement))).charWidth;
		if (!this.xterm?.raw.element || !this._container || !charWidth || !this._fixedCols) {
			return;
		}
		this._wrapperElement.classList.add('fixed-dims');
		this._hasScrollBar = true;
		this._initDimensions();
		await this._resize();
		this._terminalHasFixedWidth.set(true);
		if (!this._horizontalScrollbar) {
			this._horizontalScrollbar = this._register(new DomScrollableElement(this._wrapperElement, {
				vertical: ScrollbarVisibility.Hidden,
				horizontal: ScrollbarVisibility.Auto,
				useShadows: false,
				scrollYToX: false,
				consumeMouseWheelIfScrollbarIsNeeded: false
			}));
			this._container.appendChild(this._horizontalScrollbar.getDomNode());
		}
		this._horizontalScrollbar.setScrollDimensions({
			width: this.xterm.raw.element.clientWidth,
			scrollWidth: this._fixedCols * charWidth + 40 // Padding + scroll bar
		});
		this._horizontalScrollbar.getDomNode().style.paddingBottom = '16px';

		// work around for https://github.com/xtermjs/xterm.js/issues/3482
		if (isWindows) {
			for (let i = this.xterm.raw.buffer.active.viewportY; i < this.xterm.raw.buffer.active.length; i++) {
				interface ILineWithInternals extends IBufferLine {
					_line: {
						isWrapped: boolean;
					};
				}
				const line = this.xterm.raw.buffer.active.getLine(i);
				(line as ILineWithInternals)._line.isWrapped = false;
			}
		}
	}

	private async _removeScrollbar(): Promise<void> {
		if (!this._container || !this._horizontalScrollbar) {
			return;
		}
		this._horizontalScrollbar.getDomNode().remove();
		this._horizontalScrollbar.dispose();
		this._horizontalScrollbar = undefined;
		this._wrapperElement.remove();
		this._wrapperElement.classList.remove('fixed-dims');
		this._container.appendChild(this._wrapperElement);
	}

	private _setResolvedShellLaunchConfig(shellLaunchConfig: IShellLaunchConfig): void {
		this._shellLaunchConfig.args = shellLaunchConfig.args;
		this._shellLaunchConfig.cwd = shellLaunchConfig.cwd;
		this._shellLaunchConfig.executable = shellLaunchConfig.executable;
		this._shellLaunchConfig.env = shellLaunchConfig.env;
	}

	private _onEnvironmentVariableInfoChanged(info: IEnvironmentVariableInfo): void {
		if (info.requiresAction) {
			this.xterm?.raw.textarea?.setAttribute('aria-label', nls.localize('terminalStaleTextBoxAriaLabel', "Terminal {0} environment is stale, run the 'Show Environment Information' command for more information", this._instanceId));
		}
		this._refreshEnvironmentVariableInfoWidgetState(info);
	}

	private async _refreshEnvironmentVariableInfoWidgetState(info?: IEnvironmentVariableInfo): Promise<void> {
		// Check if the status should exist
		if (!info) {
			this.statusList.remove(TerminalStatus.RelaunchNeeded);
			this.statusList.remove(TerminalStatus.EnvironmentVariableInfoChangesActive);
			return;
		}

		// Recreate the process seamlessly without informing the use if the following conditions are
		// met.
		if (
			// The change requires a relaunch
			info.requiresAction &&
			// The feature is enabled
			this._terminalConfigurationService.config.environmentChangesRelaunch &&
			// Has not been interacted with
			!this._processManager.hasWrittenData &&
			// Not a feature terminal or is a reconnecting task terminal (TODO: Need to explain the latter case)
			(!this._shellLaunchConfig.isFeatureTerminal || (this.reconnectionProperties && this._configurationService.getValue('task.reconnection') === true)) &&
			// Not a custom pty
			!this._shellLaunchConfig.customPtyImplementation &&
			// Not an extension owned terminal
			!this._shellLaunchConfig.isExtensionOwnedTerminal &&
			// Not a reconnected or revived terminal
			!this._shellLaunchConfig.attachPersistentProcess &&
			// Not a Windows remote using ConPTY (#187084)
			!(this._processManager.remoteAuthority && this._terminalConfigurationService.config.windowsEnableConpty && (await this._processManager.getBackendOS()) === OperatingSystem.Windows)
		) {
			this.relaunch();
			return;
		}
		// Re-create statuses
		const workspaceFolder = getWorkspaceForTerminal(this.shellLaunchConfig.cwd, this._workspaceContextService, this._historyService);
		this.statusList.add(info.getStatus({ workspaceFolder }));
	}

	async getInitialCwd(): Promise<string> {
		if (!this._initialCwd) {
			this._initialCwd = this._processManager.initialCwd;
		}
		return this._initialCwd;
	}

	async getSpeculativeCwd(): Promise<string> {
		if (this.capabilities.has(TerminalCapability.CwdDetection)) {
			return this.capabilities.get(TerminalCapability.CwdDetection)!.getCwd();
		} else if (this.capabilities.has(TerminalCapability.NaiveCwdDetection)) {
			return this.capabilities.get(TerminalCapability.NaiveCwdDetection)!.getCwd();
		}
		return this._processManager.initialCwd;
	}

	async getCwdResource(): Promise<URI | undefined> {
		const cwd = this.capabilities.get(TerminalCapability.CwdDetection)?.getCwd();
		if (!cwd) {
			return undefined;
		}
		let resource: URI;
		if (this.remoteAuthority) {
			resource = await this._pathService.fileURI(cwd);
		} else {
			resource = URI.file(cwd);
		}
		if (await this._fileService.exists(resource)) {
			return resource;
		}
		return undefined;
	}

	private async _refreshProperty<T extends ProcessPropertyType>(type: T): Promise<IProcessPropertyMap[T]> {
		await this.processReady;
		return this._processManager.refreshProperty(type);
	}

	private async _updateProperty<T extends ProcessPropertyType>(type: T, value: IProcessPropertyMap[T]): Promise<void> {
		return this._processManager.updateProperty(type, value);
	}

	async rename(title?: string, source?: TitleEventSource) {
		this._setTitle(title, source ?? TitleEventSource.Api);
	}

	private _setTitle(title: string | undefined, eventSource: TitleEventSource): void {
		if ((this._shellLaunchConfig?.type === 'Task' || this._titleSource === TitleEventSource.Api) && eventSource === TitleEventSource.Process) {
			return;
		}

		const reset = !title;
		title = this._updateTitleProperties(title, eventSource);
		const titleChanged = title !== this._title;
		this._title = title;
		this._labelComputer?.refreshLabel(this, reset);
		this._setAriaLabel(this.xterm?.raw, this._instanceId, this._title);

		if (titleChanged) {
			this._onTitleChanged.fire(this);
		}
	}

	async changeIcon(icon?: TerminalIcon): Promise<TerminalIcon | undefined> {
		if (icon) {
			this._icon = icon;
			this._onIconChanged.fire({ instance: this, userInitiated: true });
			return icon;
		}
		const iconPicker = this._scopedInstantiationService.createInstance(TerminalIconPicker);
		const pickedIcon = await iconPicker.pickIcons();
		iconPicker.dispose();
		if (!pickedIcon) {
			return undefined;
		}
		this._icon = pickedIcon;
		this._onIconChanged.fire({ instance: this, userInitiated: true });
		return pickedIcon;
	}

	async changeColor(color?: string, skipQuickPick?: boolean): Promise<string | undefined> {
		if (color) {
			this.shellLaunchConfig.color = color;
			this._onIconChanged.fire({ instance: this, userInitiated: true });
			return color;
		} else if (skipQuickPick) {
			// Reset this tab's color
			this.shellLaunchConfig.color = '';
			this._onIconChanged.fire({ instance: this, userInitiated: true });
			return;
		}
		const icon = this._getIcon();
		if (!icon) {
			return;
		}
		const colorTheme = this._themeService.getColorTheme();
		const standardColors: string[] = getStandardColors(colorTheme);
		const colorStyleDisposable = createColorStyleElement(colorTheme);
		const items: QuickPickItem[] = [];
		for (const colorKey of standardColors) {
			const colorClass = getColorClass(colorKey);
			items.push({
				label: `$(${Codicon.circleFilled.id}) ${colorKey.replace('terminal.ansi', '')}`, id: colorKey, description: colorKey, iconClasses: [colorClass]
			});
		}
		items.push({ type: 'separator' });
		const showAllColorsItem = { label: 'Reset to default' };
		items.push(showAllColorsItem);

		const disposables: IDisposable[] = [];
		const quickPick = this._quickInputService.createQuickPick({ useSeparators: true });
		disposables.push(quickPick);
		quickPick.items = items;
		quickPick.matchOnDescription = true;
		quickPick.placeholder = nls.localize('changeColor', 'Select a color for the terminal');
		quickPick.show();
		const result = await new Promise<IQuickPickItem | undefined>(r => {
			disposables.push(quickPick.onDidHide(() => r(undefined)));
			disposables.push(quickPick.onDidAccept(() => r(quickPick.selectedItems[0])));
		});
		dispose(disposables);

		if (result) {
			this.shellLaunchConfig.color = result.id;
			this._onIconChanged.fire({ instance: this, userInitiated: true });
		}

		quickPick.hide();
		colorStyleDisposable.dispose();
		return result?.id;
	}

	forceScrollbarVisibility(): void {
		this._wrapperElement.classList.add('force-scrollbar');
	}

	resetScrollbarVisibility(): void {
		this._wrapperElement.classList.remove('force-scrollbar');
	}

	setParentContextKeyService(parentContextKeyService: IContextKeyService): void {
		this._scopedContextKeyService.updateParent(parentContextKeyService);
	}

	async handleMouseEvent(event: MouseEvent, contextMenu: IMenu): Promise<{ cancelContextMenu: boolean } | void> {
		// Don't handle mouse event if it was on the scroll bar
		if (dom.isHTMLElement(event.target) && (event.target.classList.contains('scrollbar') || event.target.classList.contains('slider'))) {
			return { cancelContextMenu: true };
		}

		// Allow contributions to handle the mouse event first
		for (const contrib of this._contributions.values()) {
			const result = await contrib.handleMouseEvent?.(event);
			if (result?.handled) {
				return { cancelContextMenu: true };
			}
		}

		// Middle click
		if (event.which === 2) {
			switch (this._terminalConfigurationService.config.middleClickBehavior) {
				case 'default':
				default:
					// Drop selection and focus terminal on Linux to enable middle button paste
					// when click occurs on the selection itself.
					this.focus();
					break;
			}
			return;
		}

		// Right click
		if (event.which === 3) {
			// Shift click forces the context menu
			if (event.shiftKey) {
				openContextMenu(dom.getActiveWindow(), event, this, contextMenu, this._contextMenuService);
				return;
			}

			const rightClickBehavior = this._terminalConfigurationService.config.rightClickBehavior;
			if (rightClickBehavior === 'nothing') {
				if (!event.shiftKey) {
					return { cancelContextMenu: true };
				}
				return;
			}
		}
	}
}

class TerminalInstanceDragAndDropController extends Disposable implements dom.IDragAndDropObserverCallbacks {
	private _dropOverlay?: HTMLElement;

	private readonly _onDropFile = this._register(new Emitter<string | URI>());
	get onDropFile(): Event<string | URI> { return this._onDropFile.event; }
	private readonly _onDropTerminal = this._register(new Emitter<IRequestAddInstanceToGroupEvent>());
	get onDropTerminal(): Event<IRequestAddInstanceToGroupEvent> { return this._onDropTerminal.event; }

	constructor(
		private readonly _container: HTMLElement,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IViewDescriptorService private readonly _viewDescriptorService: IViewDescriptorService,
	) {
		super();
		this._register(toDisposable(() => this._clearDropOverlay()));
	}

	private _clearDropOverlay() {
		this._dropOverlay?.remove();
		this._dropOverlay = undefined;
	}

	onDragEnter(e: DragEvent) {
		if (!containsDragType(e, DataTransfers.FILES, DataTransfers.RESOURCES, TerminalDataTransfers.Terminals, CodeDataTransfers.FILES)) {
			return;
		}

		if (!this._dropOverlay) {
			this._dropOverlay = document.createElement('div');
			this._dropOverlay.classList.add('terminal-drop-overlay');
		}

		// Dragging terminals
		if (containsDragType(e, TerminalDataTransfers.Terminals)) {
			const side = this._getDropSide(e);
			this._dropOverlay.classList.toggle('drop-before', side === 'before');
			this._dropOverlay.classList.toggle('drop-after', side === 'after');
		}

		if (!this._dropOverlay.parentElement) {
			this._container.appendChild(this._dropOverlay);
		}
	}
	onDragLeave(e: DragEvent) {
		this._clearDropOverlay();
	}

	onDragEnd(e: DragEvent) {
		this._clearDropOverlay();
	}

	onDragOver(e: DragEvent) {
		if (!e.dataTransfer || !this._dropOverlay) {
			return;
		}

		// Dragging terminals
		if (containsDragType(e, TerminalDataTransfers.Terminals)) {
			const side = this._getDropSide(e);
			this._dropOverlay.classList.toggle('drop-before', side === 'before');
			this._dropOverlay.classList.toggle('drop-after', side === 'after');
		}

		this._dropOverlay.style.opacity = '1';
	}

	async onDrop(e: DragEvent) {
		this._clearDropOverlay();

		if (!e.dataTransfer) {
			return;
		}

		const terminalResources = getTerminalResourcesFromDragEvent(e);
		if (terminalResources) {
			for (const uri of terminalResources) {
				const side = this._getDropSide(e);
				this._onDropTerminal.fire({ uri, side });
			}
			return;
		}

		// Check if files were dragged from the tree explorer
		let path: URI | undefined;
		const rawResources = e.dataTransfer.getData(DataTransfers.RESOURCES);
		if (rawResources) {
			path = URI.parse(JSON.parse(rawResources)[0]);
		}

		const rawCodeFiles = e.dataTransfer.getData(CodeDataTransfers.FILES);
		if (!path && rawCodeFiles) {
			path = URI.file(JSON.parse(rawCodeFiles)[0]);
		}

		if (!path && e.dataTransfer.files.length > 0 && getPathForFile(e.dataTransfer.files[0])) {
			// Check if the file was dragged from the filesystem
			path = URI.file(getPathForFile(e.dataTransfer.files[0])!);
		}

		if (!path) {
			return;
		}

		this._onDropFile.fire(path);
	}

	private _getDropSide(e: DragEvent): 'before' | 'after' {
		const target = this._container;
		if (!target) {
			return 'after';
		}

		const rect = target.getBoundingClientRect();
		return this._getViewOrientation() === Orientation.HORIZONTAL
			? (e.clientX - rect.left < rect.width / 2 ? 'before' : 'after')
			: (e.clientY - rect.top < rect.height / 2 ? 'before' : 'after');
	}

	private _getViewOrientation(): Orientation {
		const panelPosition = this._layoutService.getPanelPosition();
		const terminalLocation = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID);
		return terminalLocation === ViewContainerLocation.Panel && isHorizontal(panelPosition)
			? Orientation.HORIZONTAL
			: Orientation.VERTICAL;
	}
}

interface ITerminalLabelTemplateProperties {
	cwd?: string | null | undefined;
	cwdFolder?: string | null | undefined;
	workspaceFolderName?: string | null | undefined;
	workspaceFolder?: string | null | undefined;
	local?: string | null | undefined;
	process?: string | null | undefined;
	sequence?: string | null | undefined;
	progress?: string | null | undefined;
	task?: string | null | undefined;
	fixedDimensions?: string | null | undefined;
	separator?: string | ISeparator | null | undefined;
	shellType?: string | undefined;
	shellCommand?: string | undefined;
	shellPromptInput?: string | undefined;
}

const enum TerminalLabelType {
	Title = 'title',
	Description = 'description'
}

export class TerminalLabelComputer extends Disposable {
	private _title: string = '';
	private _description: string = '';
	get title(): string | undefined { return this._title; }
	get description(): string { return this._description; }

	private readonly _onDidChangeLabel = this._register(new Emitter<{ title: string; description: string }>());
	readonly onDidChangeLabel = this._onDidChangeLabel.event;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService
	) {
		super();
	}

	refreshLabel(instance: Pick<ITerminalInstance, 'shellLaunchConfig' | 'shellType' | 'cwd' | 'fixedCols' | 'fixedRows' | 'initialCwd' | 'processName' | 'sequence' | 'userHome' | 'workspaceFolder' | 'staticTitle' | 'capabilities' | 'title' | 'description'>, reset?: boolean): void {
		this._title = this.computeLabel(instance, this._terminalConfigurationService.config.tabs.title, TerminalLabelType.Title, reset);
		this._description = this.computeLabel(instance, this._terminalConfigurationService.config.tabs.description, TerminalLabelType.Description);
		if (this._title !== instance.title || this._description !== instance.description || reset) {
			this._onDidChangeLabel.fire({ title: this._title, description: this._description });
		}
	}

	computeLabel(
		instance: Pick<ITerminalInstance, 'shellLaunchConfig' | 'shellType' | 'cwd' | 'fixedCols' | 'fixedRows' | 'initialCwd' | 'processName' | 'sequence' | 'userHome' | 'workspaceFolder' | 'staticTitle' | 'capabilities' | 'title' | 'description' | 'progressState'>,
		labelTemplate: string,
		labelType: TerminalLabelType,
		reset?: boolean
	) {
		const type = instance.shellLaunchConfig.attachPersistentProcess?.type || instance.shellLaunchConfig.type;
		const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
		const promptInputModel = commandDetection?.promptInputModel;
		const nonTaskSpinner = type === 'Task' ? '' : ' $(loading~spin)';
		const templateProperties: ITerminalLabelTemplateProperties = {
			cwd: instance.cwd || instance.initialCwd || '',
			cwdFolder: '',
			workspaceFolderName: instance.workspaceFolder?.name,
			workspaceFolder: instance.workspaceFolder ? path.basename(instance.workspaceFolder.uri.fsPath) : undefined,
			local: type === 'Local' ? terminalStrings.typeLocal : undefined,
			process: instance.processName,
			sequence: instance.sequence,
			task: type === 'Task' ? terminalStrings.typeTask : undefined,
			fixedDimensions: instance.fixedCols
				? (instance.fixedRows ? `\u2194${instance.fixedCols} \u2195${instance.fixedRows}` : `\u2194${instance.fixedCols}`)
				: (instance.fixedRows ? `\u2195${instance.fixedRows}` : ''),
			separator: { label: this._terminalConfigurationService.config.tabs.separator },
			shellType: instance.shellType,
			// Shell command requires high confidence
			shellCommand: commandDetection?.executingCommand && commandDetection.executingCommandConfidence === 'high' && promptInputModel
				? promptInputModel.value + nonTaskSpinner
				: undefined,
			// Shell prompt input does not require high confidence as it's largely for VS Code developers
			shellPromptInput: commandDetection?.executingCommand && promptInputModel
				? promptInputModel.getCombinedString(true) + nonTaskSpinner
				: promptInputModel?.getCombinedString(true),
			progress: this._getProgressStateString(instance.progressState)
		};
		templateProperties.workspaceFolderName = instance.workspaceFolder?.name ?? templateProperties.workspaceFolder;
		labelTemplate = labelTemplate.trim();
		if (!labelTemplate) {
			return labelType === TerminalLabelType.Title ? (instance.processName || '') : '';
		}
		if (!reset && instance.staticTitle && labelType === TerminalLabelType.Title) {
			return instance.staticTitle.replace(/[\n\r\t]/g, '') || templateProperties.process?.replace(/[\n\r\t]/g, '') || '';
		}
		const detection = instance.capabilities.has(TerminalCapability.CwdDetection) || instance.capabilities.has(TerminalCapability.NaiveCwdDetection);
		const folders = this._workspaceContextService.getWorkspace().folders;
		const multiRootWorkspace = folders.length > 1;

		// Only set cwdFolder if detection is on
		if (templateProperties.cwd && detection && (!instance.shellLaunchConfig.isFeatureTerminal || labelType === TerminalLabelType.Title)) {
			const cwdUri = URI.from({
				scheme: instance.workspaceFolder?.uri.scheme || Schemas.file,
				path: instance.cwd ? path.resolve(instance.cwd) : undefined
			});
			// Multi-root workspaces always show cwdFolder to disambiguate them, otherwise only show
			// when it differs from the workspace folder in which it was launched from
			let showCwd = false;
			if (multiRootWorkspace) {
				showCwd = true;
			} else if (instance.workspaceFolder?.uri) {
				const caseSensitive = this._fileService.hasCapability(instance.workspaceFolder.uri, FileSystemProviderCapabilities.PathCaseSensitive);
				showCwd = cwdUri.fsPath.localeCompare(instance.workspaceFolder.uri.fsPath, undefined, { sensitivity: caseSensitive ? 'case' : 'base' }) !== 0;
			}
			if (showCwd) {
				templateProperties.cwdFolder = path.basename(templateProperties.cwd);
			}
		}

		// Remove special characters that could mess with rendering
		const label = template(labelTemplate, (templateProperties as unknown) as { [key: string]: string | ISeparator | undefined | null }).replace(/[\n\r\t]/g, '').trim();
		return label === '' && labelType === TerminalLabelType.Title ? (instance.processName || '') : label;
	}

	private _getProgressStateString(progressState?: IProgressState): string {
		if (!progressState) {
			return '';
		}
		switch (progressState.state) {
			case 0: return '';
			case 1: return `${Math.round(progressState.value)}%`;
			case 2: return '$(error)';
			case 3: return '$(loading~spin)';
			case 4: return '$(alert)';
		}
	}
}

export function parseExitResult(
	exitCodeOrError: ITerminalLaunchError | number | undefined,
	shellLaunchConfig: IShellLaunchConfig,
	processState: ProcessState,
	initialCwd: string | undefined
): { code: number | undefined; message: string | undefined } | undefined {
	// Only return a message if the exit code is non-zero
	if (exitCodeOrError === undefined || exitCodeOrError === 0) {
		return { code: exitCodeOrError, message: undefined };
	}

	const code = isNumber(exitCodeOrError) ? exitCodeOrError : exitCodeOrError.code;

	// Create exit code message
	let message: string | undefined = undefined;
	switch (typeof exitCodeOrError) {
		case 'number': {
			let commandLine: string | undefined = undefined;
			if (shellLaunchConfig.executable) {
				commandLine = shellLaunchConfig.executable;
				if (isString(shellLaunchConfig.args)) {
					commandLine += ` ${shellLaunchConfig.args}`;
				} else if (shellLaunchConfig.args && shellLaunchConfig.args.length) {
					commandLine += shellLaunchConfig.args.map(a => ` '${a}'`).join();
				}
			}
			if (processState === ProcessState.KilledDuringLaunch) {
				if (commandLine) {
					message = nls.localize('launchFailed.exitCodeAndCommandLine', "The terminal process \"{0}\" failed to launch (exit code: {1}).", commandLine, code);
				} else {
					message = nls.localize('launchFailed.exitCodeOnly', "The terminal process failed to launch (exit code: {0}).", code);
				}
			} else {
				if (commandLine) {
					message = nls.localize('terminated.exitCodeAndCommandLine', "The terminal process \"{0}\" terminated with exit code: {1}.", commandLine, code);
				} else {
					message = nls.localize('terminated.exitCodeOnly', "The terminal process terminated with exit code: {0}.", code);
				}
			}
			break;
		}
		case 'object': {
			// Ignore internal errors
			if (exitCodeOrError.message.toString().includes('Could not find pty with id')) {
				break;
			}
			// Convert conpty code-based failures into human friendly messages
			let innerMessage = exitCodeOrError.message;
			const conptyError = exitCodeOrError.message.match(/.*error code:\s*(\d+).*$/);
			if (conptyError) {
				const errorCode = conptyError.length > 1 ? parseInt(conptyError[1]) : undefined;
				switch (errorCode) {
					case 5:
						innerMessage = `Access was denied to the path containing your executable "${shellLaunchConfig.executable}". Manage and change your permissions to get this to work`;
						break;
					case 267:
						innerMessage = `Invalid starting directory "${initialCwd}", review your terminal.integrated.cwd setting`;
						break;
					case 1260:
						innerMessage = `Windows cannot open this program because it has been prevented by a software restriction policy. For more information, open Event Viewer or contact your system Administrator`;
						break;
				}
			}
			message = nls.localize('launchFailed.errorMessage', "The terminal process failed to launch: {0}.", innerMessage);
			break;
		}
	}

	return { code, message };
}


export class TerminalInstanceColorProvider implements IXtermColorProvider {
	constructor(
		private readonly _target: IReference<TerminalLocation | undefined>,
		@IViewDescriptorService private readonly _viewDescriptorService: IViewDescriptorService,
	) {
	}

	getBackgroundColor(theme: IColorTheme) {
		const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR);
		if (terminalBackground) {
			return terminalBackground;
		}
		if (this._target.object === TerminalLocation.Editor) {
			return theme.getColor(editorBackground);
		}
		const location = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID)!;
		if (location === ViewContainerLocation.Panel) {
			return theme.getColor(PANEL_BACKGROUND);
		}
		return theme.getColor(SIDE_BAR_BACKGROUND);
	}
}

function guessShellTypeFromExecutable(os: OperatingSystem, executable: string): TerminalShellType | undefined {
	const exeBasename = path.basename(executable);
	const generalShellTypeMap: Map<TerminalShellType, RegExp> = new Map([
		[GeneralShellType.Julia, /^julia$/],
		[GeneralShellType.Node, /^node$/],
		[GeneralShellType.NuShell, /^nu$/],
		[GeneralShellType.PowerShell, /^pwsh(-preview)?|powershell$/],
		[GeneralShellType.Python, /^py(?:thon)?$/],
		[GeneralShellType.Xonsh, /^xonsh/]
	]);
	for (const [shellType, pattern] of generalShellTypeMap) {
		if (exeBasename.match(pattern)) {
			return shellType;
		}
	}

	if (os === OperatingSystem.Windows) {
		const windowsShellTypeMap: Map<TerminalShellType, RegExp> = new Map([
			[WindowsShellType.CommandPrompt, /^cmd$/],
			[WindowsShellType.GitBash, /^bash$/],
			[WindowsShellType.Wsl, /^wsl$/]
		]);
		for (const [shellType, pattern] of windowsShellTypeMap) {
			if (exeBasename.match(pattern)) {
				return shellType;
			}
		}
	} else {
		const posixShellTypes: PosixShellType[] = [
			PosixShellType.Bash,
			PosixShellType.Csh,
			PosixShellType.Fish,
			PosixShellType.Ksh,
			PosixShellType.Sh,
			PosixShellType.Zsh,
		];
		for (const type of posixShellTypes) {
			if (exeBasename === type) {
				return type;
			}
		}
	}
	return undefined;
}
