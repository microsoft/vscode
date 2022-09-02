/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Orientation } from 'vs/base/browser/ui/splitview/splitview';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { OperatingSystem } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IKeyMods } from 'vs/platform/quickinput/common/quickInput';
import { ITerminalCapabilityStore, ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IExtensionTerminalProfile, IProcessPropertyMap, IReconnectionProperties, IShellIntegration, IShellLaunchConfig, ITerminalDimensions, ITerminalLaunchError, ITerminalProfile, ITerminalTabLayoutInfoById, ProcessPropertyType, TerminalExitReason, TerminalIcon, TerminalLocation, TerminalShellType, TerminalType, TitleEventSource, WaitOnExitValue } from 'vs/platform/terminal/common/terminal';
import { IGenericMarkProperties } from 'vs/platform/terminal/common/terminalProcess';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IEditableData } from 'vs/workbench/common/views';
import { TerminalFindWidget } from 'vs/workbench/contrib/terminal/browser/terminalFindWidget';
import { ITerminalStatusList } from 'vs/workbench/contrib/terminal/browser/terminalStatusList';
import { INavigationMode, IRegisterContributedProfileArgs, IRemoteTerminalAttachTarget, IStartExtensionTerminalRequest, ITerminalBackend, ITerminalConfigHelper, ITerminalFont, ITerminalProcessExtHostProxy } from 'vs/workbench/contrib/terminal/common/terminal';
import { EditorGroupColumn } from 'vs/workbench/services/editor/common/editorGroupColumn';
import { IMarker } from 'xterm';

export const ITerminalService = createDecorator<ITerminalService>('terminalService');
export const ITerminalEditorService = createDecorator<ITerminalEditorService>('terminalEditorService');
export const ITerminalGroupService = createDecorator<ITerminalGroupService>('terminalGroupService');
export const ITerminalInstanceService = createDecorator<ITerminalInstanceService>('terminalInstanceService');

/**
 * A service used to create instances or fetch backends, this services allows services that
 * ITerminalService depends on to also create instances.
 *
 * **This service is intended to only be used within the terminal contrib.**
 */
export interface ITerminalInstanceService {
	readonly _serviceBrand: undefined;

	/**
	 * An event that's fired when a terminal instance is created.
	 */
	onDidCreateInstance: Event<ITerminalInstance>;

	/**
	 * Helper function to convert a shell launch config, a profile or undefined into its equivalent
	 * shell launch config.
	 * @param shellLaunchConfigOrProfile A shell launch config, a profile or undefined
	 * @param cwd A cwd to override.
	 */
	convertProfileToShellLaunchConfig(shellLaunchConfigOrProfile?: IShellLaunchConfig | ITerminalProfile, cwd?: string | URI): IShellLaunchConfig;

	/**
	 * Create a new terminal instance.
	 * @param launchConfig The shell launch config.
	 * @param target The target of the terminal, when this is undefined the default target will be
	 * used.
	 * @param resource The URI for the terminal. Note that this is the unique identifier for the
	 * terminal, not the cwd.
	 */
	createInstance(launchConfig: IShellLaunchConfig, target?: TerminalLocation, resource?: URI): ITerminalInstance;

	/**
	 * Gets the registered backend for a remote authority (undefined = local). This is a convenience
	 * method to avoid using the more verbose fetching from the registry.
	 * @param remoteAuthority The remote authority of the backend.
	 */
	getBackend(remoteAuthority?: string): Promise<ITerminalBackend | undefined>;
}

export interface IBrowserTerminalConfigHelper extends ITerminalConfigHelper {
	panelContainer: HTMLElement | undefined;
}

export const enum Direction {
	Left = 0,
	Right = 1,
	Up = 2,
	Down = 3
}

export interface IQuickPickTerminalObject {
	config: IRegisterContributedProfileArgs | ITerminalProfile | { profile: IExtensionTerminalProfile; options: { icon?: string; color?: string } } | undefined;
	keyMods: IKeyMods | undefined;
}

export interface ICommandTracker {
	scrollToPreviousCommand(): void;
	scrollToNextCommand(): void;
	selectToPreviousCommand(): void;
	selectToNextCommand(): void;
	selectToPreviousLine(): void;
	selectToNextLine(): void;
	clearMarker(): void;
}

export interface ITerminalGroup {
	activeInstance: ITerminalInstance | undefined;
	terminalInstances: ITerminalInstance[];
	title: string;

	readonly onDidDisposeInstance: Event<ITerminalInstance>;
	readonly onDisposed: Event<ITerminalGroup>;
	readonly onInstancesChanged: Event<void>;
	readonly onPanelOrientationChanged: Event<Orientation>;

	focusPreviousPane(): void;
	focusNextPane(): void;
	resizePane(direction: Direction): void;
	resizePanes(relativeSizes: number[]): void;
	setActiveInstanceByIndex(index: number, force?: boolean): void;
	attachToElement(element: HTMLElement): void;
	addInstance(instance: ITerminalInstance): void;
	removeInstance(instance: ITerminalInstance): void;
	moveInstance(instance: ITerminalInstance, index: number): void;
	setVisible(visible: boolean): void;
	layout(width: number, height: number): void;
	addDisposable(disposable: IDisposable): void;
	split(shellLaunchConfig: IShellLaunchConfig): ITerminalInstance;
	getLayoutInfo(isActive: boolean): ITerminalTabLayoutInfoById;
}

export const enum TerminalConnectionState {
	Connecting,
	Connected
}

export interface ITerminalService extends ITerminalInstanceHost {
	readonly _serviceBrand: undefined;

	/** Gets all terminal instances, including editor and terminal view (group) instances. */
	readonly instances: readonly ITerminalInstance[];
	configHelper: ITerminalConfigHelper;
	isProcessSupportRegistered: boolean;
	readonly connectionState: TerminalConnectionState;
	readonly defaultLocation: TerminalLocation;


	initializeTerminals(): Promise<void>;
	onDidChangeActiveGroup: Event<ITerminalGroup | undefined>;
	onDidDisposeGroup: Event<ITerminalGroup>;
	onDidCreateInstance: Event<ITerminalInstance>;
	onDidReceiveProcessId: Event<ITerminalInstance>;
	onDidChangeInstanceDimensions: Event<ITerminalInstance>;
	onDidMaximumDimensionsChange: Event<ITerminalInstance>;
	onDidRequestStartExtensionTerminal: Event<IStartExtensionTerminalRequest>;
	onDidChangeInstanceTitle: Event<ITerminalInstance | undefined>;
	onDidChangeInstanceIcon: Event<ITerminalInstance | undefined>;
	onDidChangeInstanceColor: Event<ITerminalInstance | undefined>;
	onDidChangeInstancePrimaryStatus: Event<ITerminalInstance>;
	onDidInputInstanceData: Event<ITerminalInstance>;
	onDidRegisterProcessSupport: Event<void>;
	onDidChangeConnectionState: Event<void>;

	/**
	 * Creates a terminal.
	 * @param options The options to create the terminal with, when not specified the default
	 * profile will be used at the default target.
	 */
	createTerminal(options?: ICreateTerminalOptions): Promise<ITerminalInstance>;

	/**
	 * Creates a raw terminal instance, this should not be used outside of the terminal part.
	 */
	getInstanceFromId(terminalId: number): ITerminalInstance | undefined;
	getInstanceFromIndex(terminalIndex: number): ITerminalInstance;

	/**
	 * An owner of terminals might be created after reconnection has occurred,
	 * so store them to be requested/adopted later
	 */
	getReconnectedTerminals(reconnectionOwner: string): ITerminalInstance[] | undefined;

	getActiveOrCreateInstance(): Promise<ITerminalInstance>;
	moveToEditor(source: ITerminalInstance): void;
	moveToTerminalView(source?: ITerminalInstance | URI): Promise<void>;
	getPrimaryBackend(): ITerminalBackend | undefined;

	/**
	 * Perform an action with the active terminal instance, if the terminal does
	 * not exist the callback will not be called.
	 * @param callback The callback that fires with the active terminal
	 */
	doWithActiveInstance<T>(callback: (terminal: ITerminalInstance) => T): T | void;

	/**
	 * Fire the onActiveTabChanged event, this will trigger the terminal dropdown to be updated,
	 * among other things.
	 */
	refreshActiveGroup(): void;

	registerProcessSupport(isSupported: boolean): void;
	/**
	 * Registers a link provider that enables integrators to add links to the terminal.
	 * @param linkProvider When registered, the link provider is asked whenever a cell is hovered
	 * for links at that position. This lets the terminal know all links at a given area and also
	 * labels for what these links are going to do.
	 */
	registerLinkProvider(linkProvider: ITerminalExternalLinkProvider): IDisposable;

	showProfileQuickPick(type: 'setDefault' | 'createInstance', cwd?: string | URI): Promise<ITerminalInstance | undefined>;

	setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): void;

	requestStartExtensionTerminal(proxy: ITerminalProcessExtHostProxy, cols: number, rows: number): Promise<ITerminalLaunchError | undefined>;
	isAttachedToTerminal(remoteTerm: IRemoteTerminalAttachTarget): boolean;
	getEditableData(instance: ITerminalInstance): IEditableData | undefined;
	setEditable(instance: ITerminalInstance, data: IEditableData | null): void;
	isEditable(instance: ITerminalInstance | undefined): boolean;
	safeDisposeTerminal(instance: ITerminalInstance): Promise<void>;

	getDefaultInstanceHost(): ITerminalInstanceHost;
	getInstanceHost(target: ITerminalLocationOptions | undefined): ITerminalInstanceHost;

	resolveLocation(location?: ITerminalLocationOptions): TerminalLocation | undefined;
	setNativeDelegate(nativeCalls: ITerminalServiceNativeDelegate): void;
	handleNewRegisteredBackend(backend: ITerminalBackend): void;
	toggleEscapeSequenceLogging(): Promise<void>;
}
export class TerminalLinkQuickPickEvent extends MouseEvent {

}
export interface ITerminalServiceNativeDelegate {
	getWindowCount(): Promise<number>;
	openDevTools(): Promise<void>;
	toggleDevTools(): Promise<void>;
}

/**
 * This service is responsible for integrating with the editor service and managing terminal
 * editors.
 */
export interface ITerminalEditorService extends ITerminalInstanceHost {
	readonly _serviceBrand: undefined;

	/** Gets all _terminal editor_ instances. */
	readonly instances: readonly ITerminalInstance[];

	openEditor(instance: ITerminalInstance, editorOptions?: TerminalEditorLocation): Promise<void>;
	detachActiveEditorInstance(): ITerminalInstance;
	detachInstance(instance: ITerminalInstance): void;
	splitInstance(instanceToSplit: ITerminalInstance, shellLaunchConfig?: IShellLaunchConfig): ITerminalInstance;
	revealActiveEditor(preserveFocus?: boolean): void;
	resolveResource(instance: ITerminalInstance | URI): URI;
	reviveInput(deserializedInput: IDeserializedTerminalEditorInput): EditorInput;
	getInputFromResource(resource: URI): EditorInput;
}

export const terminalEditorId = 'terminalEditor';

interface ITerminalEditorInputObject {
	readonly id: number;
	readonly pid: number;
	readonly title: string;
	readonly titleSource: TitleEventSource;
	readonly cwd: string;
	readonly icon: TerminalIcon | undefined;
	readonly color: string | undefined;
	readonly hasChildProcesses?: boolean;
	readonly type?: TerminalType;
	readonly isFeatureTerminal?: boolean;
	readonly hideFromUser?: boolean;
	readonly reconnectionProperties?: IReconnectionProperties;
}

export interface ISerializedTerminalEditorInput extends ITerminalEditorInputObject {
	readonly resource: string;
}

export interface IDeserializedTerminalEditorInput extends ITerminalEditorInputObject {
	readonly resource: URI;
}

export type ITerminalLocationOptions = TerminalLocation | TerminalEditorLocation | { parentTerminal: ITerminalInstance } | { splitActiveTerminal: boolean };

export interface ICreateTerminalOptions {
	/**
	 * The shell launch config or profile to launch with, when not specified the default terminal
	 * profile will be used.
	 */
	config?: IShellLaunchConfig | ITerminalProfile | IExtensionTerminalProfile;
	/**
	 * The current working directory to start with, this will override IShellLaunchConfig.cwd if
	 * specified.
	 */
	cwd?: string | URI;
	/**
	 * The terminal's resource, passed when the terminal has moved windows.
	 */
	resource?: URI;

	/**
	 * The terminal's location (editor or panel), it's terminal parent (split to the right), or editor group
	 */
	location?: ITerminalLocationOptions;
}

export interface TerminalEditorLocation {
	viewColumn: EditorGroupColumn;
	preserveFocus?: boolean;
}

/**
 * This service is responsible for managing terminal groups, that is the terminals that are hosted
 * within the terminal panel, not in an editor.
 */
export interface ITerminalGroupService extends ITerminalInstanceHost {
	readonly _serviceBrand: undefined;

	/** Gets all _terminal view_ instances, ie. instances contained within terminal groups. */
	readonly instances: readonly ITerminalInstance[];
	readonly groups: readonly ITerminalGroup[];
	activeGroup: ITerminalGroup | undefined;
	readonly activeGroupIndex: number;

	readonly onDidChangeActiveGroup: Event<ITerminalGroup | undefined>;
	readonly onDidDisposeGroup: Event<ITerminalGroup>;
	/** Fires when a group is created, disposed of, or shown (in the case of a background group). */
	readonly onDidChangeGroups: Event<void>;
	/** Fires when the panel has been shown and expanded, so has non-zero dimensions. */
	readonly onDidShow: Event<void>;
	readonly onDidChangePanelOrientation: Event<Orientation>;

	createGroup(shellLaunchConfig?: IShellLaunchConfig): ITerminalGroup;
	createGroup(instance?: ITerminalInstance): ITerminalGroup;
	getGroupForInstance(instance: ITerminalInstance): ITerminalGroup | undefined;

	/**
	 * Moves a terminal instance's group to the target instance group's position.
	 * @param source The source instance to move.
	 * @param target The target instance to move the source instance to.
	 */
	moveGroup(source: ITerminalInstance, target: ITerminalInstance): void;
	moveGroupToEnd(source: ITerminalInstance): void;

	moveInstance(source: ITerminalInstance, target: ITerminalInstance, side: 'before' | 'after'): void;
	unsplitInstance(instance: ITerminalInstance): void;
	joinInstances(instances: ITerminalInstance[]): void;
	instanceIsSplit(instance: ITerminalInstance): boolean;

	getGroupLabels(): string[];
	setActiveGroupByIndex(index: number): void;
	setActiveGroupToNext(): void;
	setActiveGroupToPrevious(): void;

	setActiveInstanceByIndex(terminalIndex: number): void;

	setContainer(container: HTMLElement): void;

	showPanel(focus?: boolean): Promise<void>;
	hidePanel(): void;
	focusTabs(): void;
	showTabs(): void;
	updateVisibility(): void;
}

/**
 * An interface that indicates the implementer hosts terminal instances, exposing a common set of
 * properties and events.
 */
export interface ITerminalInstanceHost {
	readonly activeInstance: ITerminalInstance | undefined;
	readonly instances: readonly ITerminalInstance[];

	readonly onDidDisposeInstance: Event<ITerminalInstance>;
	readonly onDidFocusInstance: Event<ITerminalInstance>;
	readonly onDidChangeActiveInstance: Event<ITerminalInstance | undefined>;
	readonly onDidChangeInstances: Event<void>;
	readonly onDidChangeInstanceCapability: Event<ITerminalInstance>;

	setActiveInstance(instance: ITerminalInstance): void;
	/**
	 * Gets an instance from a resource if it exists. This MUST be used instead of getInstanceFromId
	 * when you only know about a terminal's URI. (a URI's instance ID may not be this window's instance ID)
	 */
	getInstanceFromResource(resource: URI | undefined): ITerminalInstance | undefined;
}

/**
 * Similar to xterm.js' ILinkProvider but using promises and hides xterm.js internals (like buffer
 * positions, decorations, etc.) from the rest of vscode. This is the interface to use for
 * workbench integrations.
 */
export interface ITerminalExternalLinkProvider {
	provideLinks(instance: ITerminalInstance, line: string): Promise<ITerminalLink[] | undefined>;
}

export interface ITerminalLink {
	/** The startIndex of the link in the line. */
	startIndex: number;
	/** The length of the link in the line. */
	length: number;
	/** The descriptive label for what the link does when activated. */
	label?: string;
	/**
	 * Activates the link.
	 * @param text The text of the link.
	 */
	activate(text: string): void;
}

export interface ISearchOptions {
	/** Whether the find should be done as a regex. */
	regex?: boolean;
	/** Whether only whole words should match. */
	wholeWord?: boolean;
	/** Whether find should pay attention to case. */
	caseSensitive?: boolean;
	/** Whether the search should start at the current search position (not the next row). */
	incremental?: boolean;
}

export interface ITerminalBeforeHandleLinkEvent {
	terminal?: ITerminalInstance;
	/** The text of the link */
	link: string;
	/** Call with whether the link was handled by the interceptor */
	resolve(wasHandled: boolean): void;
}

export interface ITerminalInstance {
	/**
	 * The ID of the terminal instance, this is an arbitrary number only used to uniquely identify
	 * terminal instances within a window.
	 */
	readonly instanceId: number;
	/**
	 * A unique URI for this terminal instance with the following encoding:
	 * path: /<workspace ID>/<instance ID>
	 * fragment: Title
	 * Note that when dragging terminals across windows, this will retain the original workspace ID /instance ID
	 * from the other window.
	 */
	readonly resource: URI;

	readonly cols: number;
	readonly rows: number;
	readonly maxCols: number;
	readonly maxRows: number;
	readonly fixedCols?: number;
	readonly fixedRows?: number;
	readonly icon?: TerminalIcon;
	readonly color?: string;
	readonly reconnectionProperties?: IReconnectionProperties;
	readonly processName: string;
	readonly sequence?: string;
	readonly staticTitle?: string;
	readonly workspaceFolder?: IWorkspaceFolder;
	readonly cwd?: string;
	readonly initialCwd?: string;
	readonly os?: OperatingSystem;
	readonly capabilities: ITerminalCapabilityStore;

	readonly statusList: ITerminalStatusList;

	readonly findWidget: TerminalFindWidget;

	/**
	 * The process ID of the shell process, this is undefined when there is no process associated
	 * with this terminal.
	 */
	processId: number | undefined;

	/**
	 * The position of the terminal.
	 */
	target?: TerminalLocation;

	/**
	 * Whether or not shell integration telemetry / warnings should be reported for this terminal.
	 */
	disableShellIntegrationReporting: boolean;

	/**
	 * The id of a persistent process. This is defined if this is a terminal created by a pty host
	 * that supports reconnection.
	 */
	readonly persistentProcessId: number | undefined;

	/**
	 * The id of a persistent process during the shutdown process
	 */
	shutdownPersistentProcessId: number | undefined;

	/**
	 * Whether the process should be persisted across reloads.
	 */
	readonly shouldPersist: boolean;

	/**
	 * Whether the process communication channel has been disconnected.
	 */
	readonly isDisconnected: boolean;

	/*
	 * Whether this terminal has been disposed of
	 */
	readonly isDisposed: boolean;

	/**
	 * Whether the terminal's pty is hosted on a remote.
	 */
	readonly isRemote: boolean;

	/**
	 * The remote authority of the terminal's pty.
	 */
	readonly remoteAuthority: string | undefined;

	/**
	 * Whether an element within this terminal is focused.
	 */
	readonly hasFocus: boolean;

	/**
	 * Get or set the behavior of the terminal when it closes. This was indented only to be called
	 * after reconnecting to a terminal.
	 */
	waitOnExit: WaitOnExitValue | undefined;

	/**
	 * An event that fires when the terminal instance's title changes.
	 */
	onTitleChanged: Event<ITerminalInstance>;

	/**
	 * An event that fires when the terminal instance's icon changes.
	 */
	onIconChanged: Event<ITerminalInstance>;

	/**
	 * An event that fires when the terminal instance is disposed.
	 */
	onDisposed: Event<ITerminalInstance>;

	onProcessIdReady: Event<ITerminalInstance>;
	onLinksReady: Event<ITerminalInstance>;
	onRequestExtHostProcess: Event<ITerminalInstance>;
	onDimensionsChanged: Event<void>;
	onMaximumDimensionsChanged: Event<void>;
	onDidChangeHasChildProcesses: Event<boolean>;

	onDidFocus: Event<ITerminalInstance>;
	onDidBlur: Event<ITerminalInstance>;
	onDidInputData: Event<ITerminalInstance>;

	/**
	 * An event that fires when a terminal is dropped on this instance via drag and drop.
	 */
	onRequestAddInstanceToGroup: Event<IRequestAddInstanceToGroupEvent>;

	/**
	 * Attach a listener to the raw data stream coming from the pty, including ANSI escape
	 * sequences.
	 */
	onData: Event<string>;

	/**
	 * Attach a listener to the binary data stream coming from xterm and going to pty
	 */
	onBinary: Event<string>;

	/**
	 * Attach a listener to listen for new lines added to this terminal instance.
	 *
	 * @param listener The listener function which takes new line strings added to the terminal,
	 * excluding ANSI escape sequences. The line event will fire when an LF character is added to
	 * the terminal (ie. the line is not wrapped). Note that this means that the line data will
	 * not fire for the last line, until either the line is ended with a LF character of the process
	 * is exited. The lineData string will contain the fully wrapped line, not containing any LF/CR
	 * characters.
	 */
	onLineData: Event<string>;

	/**
	 * Attach a listener that fires when the terminal's pty process exits. The number in the event
	 * is the processes' exit code, an exit code of undefined means the process was killed as a result of
	 * the ITerminalInstance being disposed.
	 */
	onExit: Event<number | ITerminalLaunchError | undefined>;

	onDidChangeFindResults: Event<{ resultIndex: number; resultCount: number } | undefined>;

	readonly exitCode: number | undefined;

	readonly exitReason: TerminalExitReason | undefined;

	readonly areLinksReady: boolean;

	/**
	 * The xterm.js instance for this terminal.
	 */
	readonly xterm?: IXtermTerminal;

	/**
	 * Returns an array of data events that have fired within the first 10 seconds. If this is
	 * called 10 seconds after the terminal has existed the result will be undefined. This is useful
	 * when objects that depend on the data events have delayed initialization, like extension
	 * hosts.
	 */
	readonly initialDataEvents: string[] | undefined;

	/** A promise that resolves when the terminal's pty/process have been created. */
	readonly processReady: Promise<void>;

	/** Whether the terminal's process has child processes (ie. is dirty/busy). */
	readonly hasChildProcesses: boolean;

	/**
	 * The title of the terminal. This is either title or the process currently running or an
	 * explicit name given to the terminal instance through the extension API.
	 */
	readonly title: string;

	/**
	 * How the current title was set.
	 */
	readonly titleSource: TitleEventSource;

	/**
	 * The shell type of the terminal.
	 */
	readonly shellType: TerminalShellType;

	/**
	 * The focus state of the terminal before exiting.
	 */
	readonly hadFocusOnExit: boolean;

	/**
	 * False when the title is set by an API or the user. We check this to make sure we
	 * do not override the title when the process title changes in the terminal.
	 */
	isTitleSetByProcess: boolean;

	/**
	 * The shell launch config used to launch the shell.
	 */
	readonly shellLaunchConfig: IShellLaunchConfig;

	/**
	 * Whether to disable layout for the terminal. This is useful when the size of the terminal is
	 * being manipulating (e.g. adding a split pane) and we want the terminal to ignore particular
	 * resize events.
	 */
	disableLayout: boolean;

	readonly navigationMode: INavigationMode | undefined;

	description: string | undefined;

	userHome: string | undefined;
	/**
	 * Shows the environment information hover if the widget exists.
	 */
	showEnvironmentInfoHover(): void;

	/**
	 * Registers and returns a marker
	 */
	registerMarker(): IMarker | undefined;

	/**
	 * Adds a decoration to the buffer at the @param marker with
	 * @param genericMarkProperties
	 */
	addGenericMark(marker: IMarker, genericMarkProperties: IGenericMarkProperties): void;

	/**
	 * Dispose the terminal instance, removing it from the panel/service and freeing up resources.
	 *
	 * @param reason The reason why the terminal is being disposed
	 */
	dispose(reason?: TerminalExitReason): void;

	/**
	 * Informs the process that the terminal is now detached and
	 * then disposes the terminal.
	 *
	 * @param reason The reason why the terminal is being disposed
	 */
	detachProcessAndDispose(reason: TerminalExitReason): Promise<void>;

	/**
	 * Check if anything is selected in terminal.
	 */
	hasSelection(): boolean;

	/**
	 * Copies the terminal selection to the clipboard.
	 */
	copySelection(asHtml?: boolean, command?: ITerminalCommand): Promise<void>;


	/**
	 * Copies the ouput of the last command
	 */
	copyLastCommandOutput(): Promise<void>;

	/**
	 * Current selection in the terminal.
	 */
	readonly selection: string | undefined;

	/**
	 * Clear current selection.
	 */
	clearSelection(): void;

	/**
	 * When the panel is hidden or a terminal in the editor area becomes inactive, reset the focus context key
	 * to avoid issues like #147180.
	 */
	resetFocusContextKey(): void;

	/**
	 * Select all text in the terminal.
	 */
	selectAll(): void;

	/**
	 * Focuses the terminal instance if it's able to (xterm.js instance exists).
	 *
	 * @param focus Force focus even if there is a selection.
	 */
	focus(force?: boolean): void;

	/**
	 * Focuses the terminal instance when it's ready (the xterm.js instance is created). Use this
	 * when the terminal is being shown.
	 *
	 * @param focus Force focus even if there is a selection.
	 */
	focusWhenReady(force?: boolean): Promise<void>;

	/**
	 * Focuses and pastes the contents of the clipboard into the terminal instance.
	 */
	paste(): Promise<void>;

	/**
	 * Focuses and pastes the contents of the selection clipboard into the terminal instance.
	 */
	pasteSelection(): Promise<void>;

	/**
	 * Send text to the terminal instance. The text is written to the stdin of the underlying pty
	 * process (shell) of the terminal instance.
	 *
	 * @param text The text to send.
	 * @param addNewLine Whether to add a new line to the text being sent, this is normally required
	 * to run a command in the terminal. The character(s) added are \n or \r\n depending on the
	 * platform. This defaults to `true`.
	 * @param bracketedPasteMode Whether to wrap the text in the bracketed paste mode sequence when
	 * it's enabled. When true, the shell will treat the text as if it were pasted into the shell,
	 * this may for example select the text and it will also ensure that the text will not be
	 * interpreted as a shell keybinding.
	 */
	sendText(text: string, addNewLine: boolean, bracketedPasteMode?: boolean): Promise<void>;

	/**
	 * Sends a path to the terminal instance, preparing it as needed based on the detected shell
	 * running within the terminal. The text is written to the stdin of the underlying pty process
	 * (shell) of the terminal instance.
	 *
	 * @param originalPath The path to send.
	 * @param addNewLine Whether to add a new line to the path being sent, this is normally required
	 * to run a command in the terminal. The character(s) added are \n or \r\n depending on the
	 * platform. This defaults to `true`.
	 */
	sendPath(originalPath: string, addNewLine: boolean): Promise<void>;

	/**
	 * Takes a path and returns the properly escaped path to send to a given shell. On Windows, this
	 * includes trying to prepare the path for WSL if needed.
	 *
	 * @param originalPath The path to be escaped and formatted.
	 */
	preparePathForShell(originalPath: string): Promise<string>;

	/** Scroll the terminal buffer down 1 line. */   scrollDownLine(): void;
	/** Scroll the terminal buffer down 1 page. */   scrollDownPage(): void;
	/** Scroll the terminal buffer to the bottom. */ scrollToBottom(): void;
	/** Scroll the terminal buffer up 1 line. */     scrollUpLine(): void;
	/** Scroll the terminal buffer up 1 page. */     scrollUpPage(): void;
	/** Scroll the terminal buffer to the top. */    scrollToTop(): void;

	/**
	 * Clears the terminal buffer, leaving only the prompt line and moving it to the top of the
	 * viewport.
	 */
	clearBuffer(): void;

	/**
	 * Attaches the terminal instance to an element on the DOM, before this is called the terminal
	 * instance process may run in the background but cannot be displayed on the UI.
	 *
	 * @param container The element to attach the terminal instance to.
	 */
	attachToElement(container: HTMLElement): void;

	/**
	 * Detaches the terminal instance from the terminal editor DOM element.
	 */
	detachFromElement(): void;

	/**
	 * Configure the dimensions of the terminal instance.
	 *
	 * @param dimension The dimensions of the container.
	 */
	layout(dimension: { width: number; height: number }): void;

	/**
	 * Sets whether the terminal instance's element is visible in the DOM.
	 *
	 * @param visible Whether the element is visible.
	 */
	setVisible(visible: boolean): void;

	/**
	 * Immediately kills the terminal's current pty process and launches a new one to replace it.
	 *
	 * @param shell The new launch configuration.
	 */
	reuseTerminal(shell: IShellLaunchConfig): Promise<void>;

	/**
	 * Relaunches the terminal, killing it and reusing the launch config used initially. Any
	 * environment variable changes will be recalculated when this happens.
	 */
	relaunch(): void;

	/**
	 * Sets the title and description of the terminal instance's label.
	 */
	refreshTabLabels(title: string, eventSource: TitleEventSource): void;

	waitForTitle(): Promise<string>;

	/**
	 * Sets the terminal instance's dimensions to the values provided via the onDidOverrideDimensions event,
	 * which allows overriding the the regular dimensions (fit to the size of the panel).
	 */
	setOverrideDimensions(dimensions: ITerminalDimensions): void;

	/**
	 * Sets the terminal instance's dimensions to the values provided via quick input.
	 */
	setFixedDimensions(): Promise<void>;

	/**
	 * Toggles terminal line wrapping.
	 */
	toggleSizeToContentWidth(): Promise<void>;

	addDisposable(disposable: IDisposable): void;

	toggleEscapeSequenceLogging(): Promise<boolean>;

	setEscapeSequenceLogging(enable: boolean): void;

	getInitialCwd(): Promise<string>;
	getCwd(): Promise<string>;

	refreshProperty<T extends ProcessPropertyType>(type: T): Promise<IProcessPropertyMap[T]>;

	/**
	 * @throws when called before xterm.js is ready.
	 */
	registerLinkProvider(provider: ITerminalExternalLinkProvider): IDisposable;

	/**
	 * Sets the terminal name to the provided title or triggers a quick pick
	 * to take user input. If no title is provided, will reset based to the value indicated
	 * user's configration.
	 */
	rename(title?: string | 'triggerQuickpick'): Promise<void>;

	/**
	 * Triggers a quick pick to change the icon of this terminal.
	 */
	changeIcon(): Promise<void>;

	/**
	 * Triggers a quick pick to change the color of the associated terminal tab icon.
	 */
	changeColor(): Promise<void>;

	/**
	 * Triggers a quick pick that displays links from the viewport of the active terminal.
	 * Selecting a file or web link will open it. Selecting a word link will copy it to the
	 * clipboard.
	 */
	showLinkQuickpick(): Promise<void>;

	/**
	 * Triggers a quick pick that displays recent commands or cwds. Selecting one will
	 * rerun it in the active terminal.
	 */
	runRecent(type: 'command' | 'cwd'): Promise<void>;

	/**
	 * Activates the most recent link of the given type.
	 */
	openRecentLink(type: 'localFile' | 'url'): Promise<void>;
}

export interface IXtermTerminal {
	/**
	 * An object that tracks when commands are run and enables navigating and selecting between
	 * them.
	 */
	readonly commandTracker: ICommandTracker;

	/**
	 * Reports the status of shell integration and fires events relating to it.
	 */
	readonly shellIntegration: IShellIntegration;

	readonly onDidChangeSelection: Event<void>;

	/**
	 * The position of the terminal.
	 */
	target?: TerminalLocation;

	findResult?: { resultIndex: number; resultCount: number };

	/**
	 * Find the next instance of the term
	*/
	findNext(term: string, searchOptions: ISearchOptions): Promise<boolean>;

	/**
	 * Find the previous instance of the term
	 */
	findPrevious(term: string, searchOptions: ISearchOptions): Promise<boolean>;

	/**
	 * Forces the terminal to redraw its viewport.
	 */
	forceRedraw(): void;

	/**
	 * Gets the font metrics of this xterm.js instance.
	 */
	getFont(): ITerminalFont;

	/** Scroll the terminal buffer down 1 line. */   scrollDownLine(): void;
	/** Scroll the terminal buffer down 1 page. */   scrollDownPage(): void;
	/** Scroll the terminal buffer to the bottom. */ scrollToBottom(): void;
	/** Scroll the terminal buffer up 1 line. */     scrollUpLine(): void;
	/** Scroll the terminal buffer up 1 page. */     scrollUpPage(): void;
	/** Scroll the terminal buffer to the top. */    scrollToTop(): void;

	/**
	 * Clears the terminal buffer, leaving only the prompt line and moving it to the top of the
	 * viewport.
	 */
	clearBuffer(): void;

	/**
	 * Clears the search result decorations
	 */
	clearSearchDecorations(): void;

	/**
	 * Clears the active search result decorations
	 */
	clearActiveSearchDecoration(): void;

	/**
	 * Adds a decoration at the @param marker with the given properties
	 * @param properties
	 */
	addDecoration(marker: IMarker, properties: IGenericMarkProperties): void;

	/**
	 * Returns a reverse iterator of buffer lines as strings
	 */
	getBufferReverseIterator(): IterableIterator<string>;
}

export interface IInternalXtermTerminal {
	/**
	 * Writes text directly to the terminal, bypassing the process.
	 *
	 * **WARNING:** This should never be used outside of the terminal component and only for
	 * developer purposed inside the terminal component.
	 */
	_writeText(data: string): void; // eslint-disable-line @typescript-eslint/naming-convention
}

export interface IRequestAddInstanceToGroupEvent {
	uri: URI;
	side: 'before' | 'after';
}

export const enum LinuxDistro {
	Unknown = 1,
	Fedora = 2,
	Ubuntu = 3,
}

export const enum TerminalDataTransfers {
	Terminals = 'Terminals'
}
