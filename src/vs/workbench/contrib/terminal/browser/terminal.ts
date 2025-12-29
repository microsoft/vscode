/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDimension } from '../../../../base/browser/dom.js';
import { Orientation } from '../../../../base/browser/ui/splitview/splitview.js';
import { Color } from '../../../../base/common/color.js';
import { Event, IDynamicListEventMultiplexer, type DynamicListEventMultiplexer } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, type IReference } from '../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeyMods } from '../../../../platform/quickinput/common/quickInput.js';
import { IMarkProperties, ITerminalCapabilityImplMap, ITerminalCapabilityStore, ITerminalCommand, TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { IMergedEnvironmentVariableCollection } from '../../../../platform/terminal/common/environmentVariable.js';
import { IExtensionTerminalProfile, IReconnectionProperties, IShellIntegration, IShellLaunchConfig, ITerminalBackend, ITerminalDimensions, ITerminalLaunchError, ITerminalProfile, ITerminalTabLayoutInfoById, TerminalExitReason, TerminalIcon, TerminalLocation, TerminalShellType, TerminalType, TitleEventSource, WaitOnExitValue, type IDecorationAddon, type ShellIntegrationInjectionFailureReason } from '../../../../platform/terminal/common/terminal.js';
import { IColorTheme } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditableData } from '../../../common/views.js';
import { ITerminalStatusList } from './terminalStatusList.js';
import { XtermTerminal } from './xterm/xtermTerminal.js';
import { IRegisterContributedProfileArgs, IRemoteTerminalAttachTarget, IStartExtensionTerminalRequest, ITerminalConfiguration, ITerminalFont, ITerminalProcessExtHostProxy, ITerminalProcessInfo } from '../common/terminal.js';
import type { IMarker, ITheme, Terminal as RawXtermTerminal, IBufferRange, IMarker as IXtermMarker } from '@xterm/xterm';
import { ScrollPosition } from './xterm/markNavigationAddon.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { GroupIdentifier } from '../../../common/editor.js';
import { ACTIVE_GROUP_TYPE, AUX_WINDOW_GROUP_TYPE, SIDE_GROUP_TYPE } from '../../../services/editor/common/editorService.js';
import type { ICurrentPartialCommand } from '../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js';
import type { IXtermCore } from './xterm-private.js';
import type { IMenu } from '../../../../platform/actions/common/actions.js';
import type { IProgressState } from '@xterm/addon-progress';
import type { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import type { TerminalEditorInput } from './terminalEditorInput.js';
import type { MaybePromise } from '../../../../base/common/async.js';
import { isNumber, type SingleOrMany } from '../../../../base/common/types.js';

export const ITerminalService = createDecorator<ITerminalService>('terminalService');
export const ITerminalConfigurationService = createDecorator<ITerminalConfigurationService>('terminalConfigurationService');
export const ITerminalEditorService = createDecorator<ITerminalEditorService>('terminalEditorService');
export const ITerminalEditingService = createDecorator<ITerminalEditingService>('terminalEditingService');
export const ITerminalGroupService = createDecorator<ITerminalGroupService>('terminalGroupService');
export const ITerminalInstanceService = createDecorator<ITerminalInstanceService>('terminalInstanceService');
export const ITerminalChatService = createDecorator<ITerminalChatService>('terminalChatService');

/**
 * A terminal contribution that gets created whenever a terminal is created. A contribution has
 * access to the process manager through the constructor and provides a method for when xterm.js has
 * been initialized.
 */
export interface ITerminalContribution extends IDisposable {
	layout?(xterm: IXtermTerminal & { raw: RawXtermTerminal }, dimension: IDimension): void;
	xtermOpen?(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void;
	xtermReady?(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void;

	handleMouseEvent?(event: MouseEvent): MaybePromise<{ handled: boolean } | void>;
}

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
	readonly onDidCreateInstance: Event<ITerminalInstance>;

	/**
	 * An event that's fired when a new backend is registered.
	 */
	readonly onDidRegisterBackend: Event<ITerminalBackend>;

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
	 * @param target The target of the terminal.
	 */
	createInstance(launchConfig: IShellLaunchConfig, target: TerminalLocation, editorOptions?: TerminalEditorLocation): ITerminalInstance;

	/**
	 * Gets the registered backend for a remote authority (undefined = local). This is a convenience
	 * method to avoid using the more verbose fetching from the registry.
	 * @param remoteAuthority The remote authority of the backend.
	 */
	getBackend(remoteAuthority?: string): Promise<ITerminalBackend | undefined>;

	getRegisteredBackends(): IterableIterator<ITerminalBackend>;
	didRegisterBackend(backend: ITerminalBackend): void;
}

/**
 * Service enabling communication between the chat tool implementation in terminal contrib and workbench contribs.
 * Acts as a communication mechanism for chat-related terminal features.
 */
export interface IChatTerminalToolProgressPart {
	readonly elementIndex: number;
	readonly contentIndex: number;
	focusTerminal(): Promise<void>;
	toggleOutputFromKeyboard(): Promise<void>;
	focusOutput(): void;
	getCommandAndOutputAsText(): string | undefined;
}

export interface ITerminalChatService {
	readonly _serviceBrand: undefined;

	/**
	 * Fired when a terminal instance is registered for a tool session id. This can happen after
	 * the chat UI first renders, enabling late binding of the focus action.
	 */
	readonly onDidRegisterTerminalInstanceWithToolSession: Event<ITerminalInstance>;

	/**
	 * Associate a tool session id with a terminal instance. The association is automatically
	 * cleared when the instance is disposed.
	 */
	registerTerminalInstanceWithToolSession(terminalToolSessionId: string | undefined, instance: ITerminalInstance): void;

	/**
	 * Resolve a terminal instance by its tool session id.
	 * @param terminalToolSessionId The tool session id provided in toolSpecificData.
	 * If no tool session ID is provided, we do nothing.
	 */
	getTerminalInstanceByToolSessionId(terminalToolSessionId: string): Promise<ITerminalInstance | undefined>;

	/**
	 * Returns the list of terminal instances that have been registered with a tool session id.
	 * This is used for surfacing tool-driven/background terminals in UI (eg. quick picks).
	 */
	getToolSessionTerminalInstances(hiddenOnly?: boolean): readonly ITerminalInstance[];

	/**
	 * Returns the tool session ID for a given terminal instance, if it has been registered.
	 * @param instance The terminal instance to look up
	 * @returns The tool session ID if found, undefined otherwise
	 */
	getToolSessionIdForInstance(instance: ITerminalInstance): string | undefined;

	/**
	 * Associate a chat session ID with a terminal instance. This is used to retrieve the chat
	 * session title for display purposes.
	 * @param chatSessionId The chat session ID
	 * @param instance The terminal instance
	 */
	registerTerminalInstanceWithChatSession(chatSessionId: string, instance: ITerminalInstance): void;

	/**
	 * Returns the chat session ID for a given terminal instance, if it has been registered.
	 * @param instance The terminal instance to look up
	 * @returns The chat session ID if found, undefined otherwise
	 */
	getChatSessionIdForInstance(instance: ITerminalInstance): string | undefined;

	/**
	 * Check if a terminal is a background terminal (tool-driven terminal that may be hidden from
	 * normal UI).
	 * @param terminalToolSessionId The tool session ID to check, if provided
	 * @returns True if the terminal is a background terminal, false otherwise
	 */
	isBackgroundTerminal(terminalToolSessionId?: string): boolean;

	/**
	 * Register a chat terminal tool progress part for tracking and focus management.
	 * @param part The progress part to register
	 * @returns A disposable that unregisters the progress part when disposed
	 */
	registerProgressPart(part: IChatTerminalToolProgressPart): IDisposable;

	/**
	 * Set the currently focused progress part.
	 * @param part The progress part to focus
	 */
	setFocusedProgressPart(part: IChatTerminalToolProgressPart): void;

	/**
	 * Clear the focused state from a progress part.
	 * @param part The progress part to clear focus from
	 */
	clearFocusedProgressPart(part: IChatTerminalToolProgressPart): void;

	/**
	 * Get the currently focused progress part, if any.
	 * @returns The focused progress part or undefined if none is focused
	 */
	getFocusedProgressPart(): IChatTerminalToolProgressPart | undefined;

	/**
	 * Get the most recently registered progress part, if any.
	 * @returns The most recent progress part or undefined if none exist
	 */
	getMostRecentProgressPart(): IChatTerminalToolProgressPart | undefined;

	/**
	 * Enable or disable auto approval for all commands in a specific session.
	 * @param chatSessionId The chat session ID
	 * @param enabled Whether to enable or disable session auto approval
	 */
	setChatSessionAutoApproval(chatSessionId: string, enabled: boolean): void;

	/**
	 * Check if a session has auto approval enabled for all commands.
	 * @param chatSessionId The chat session ID
	 * @returns True if the session has auto approval enabled
	 */
	hasChatSessionAutoApproval(chatSessionId: string): boolean;
}

/**
 * A service responsible for managing terminal editing state and functionality. This includes
 * tracking which terminal is currently being edited and managing editable data associated with
 * terminal instances.
 */
export interface ITerminalEditingService {
	readonly _serviceBrand: undefined;

	/**
	 * Get the editable data for a terminal instance.
	 * @param instance The terminal instance.
	 * @returns The editable data if the instance is editable, undefined otherwise.
	 */
	getEditableData(instance: ITerminalInstance): IEditableData | undefined;

	/**
	 * Set the editable data for a terminal instance.
	 * @param instance The terminal instance.
	 * @param data The editable data to set, or null to clear.
	 */
	setEditable(instance: ITerminalInstance, data: IEditableData | null): void;

	/**
	 * Check if a terminal instance is currently editable.
	 * @param instance The terminal instance to check.
	 * @returns True if the instance is editable, false otherwise.
	 */
	isEditable(instance: ITerminalInstance | undefined): boolean;

	/**
	 * Get the terminal instance that is currently being edited.
	 * @returns The terminal instance being edited, or undefined if none.
	 */
	getEditingTerminal(): ITerminalInstance | undefined;

	/**
	 * Set the terminal instance that is currently being edited.
	 * @param instance The terminal instance to set as editing, or undefined to clear.
	 */
	setEditingTerminal(instance: ITerminalInstance | undefined): void;
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

export interface IMarkTracker {
	scrollToPreviousMark(scrollPosition?: ScrollPosition, retainSelection?: boolean, skipEmptyCommands?: boolean): void;
	scrollToNextMark(): void;
	selectToPreviousMark(): void;
	selectToNextMark(): void;
	selectToPreviousLine(): void;
	selectToNextLine(): void;
	clear(): void;
	scrollToClosestMarker(startMarkerId: string, endMarkerId?: string, highlight?: boolean | undefined): void;

	scrollToLine(line: number, position: ScrollPosition): void;
	revealCommand(command: ITerminalCommand | ICurrentPartialCommand | URI, position?: ScrollPosition): void;
	revealRange(range: IBufferRange): void;
	registerTemporaryDecoration(marker: IMarker, endMarker: IMarker | undefined, showOutline: boolean): void;
	showCommandGuide(command: ITerminalCommand | undefined): void;

	saveScrollState(): void;
	restoreScrollState(): void;
}

export interface ITerminalGroup {
	activeInstance: ITerminalInstance | undefined;
	terminalInstances: ITerminalInstance[];
	title: string;
	readonly hadFocusOnExit: boolean;

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
	moveInstance(instances: SingleOrMany<ITerminalInstance>, index: number, position: 'before' | 'after'): void;
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

export interface IDetachedXTermOptions {
	cols: number;
	rows: number;
	colorProvider: IXtermColorProvider;
	capabilities?: ITerminalCapabilityStore & IDisposable;
	readonly?: boolean;
	processInfo: ITerminalProcessInfo;
	disableOverviewRuler?: boolean;
}

/**
 * A generic interface implemented in both the {@link ITerminalInstance} (an
 * interface used for terminals attached to the terminal panel or editor) and
 * {@link IDetachedTerminalInstance} (a terminal used elsewhere in VS Code UI).
 */
export interface IBaseTerminalInstance {
	readonly capabilities: ITerminalCapabilityStore;

	/**
	 * DOM element the terminal is mounted in.
	 */
	readonly domElement?: HTMLElement;

	/**
	 * Current selection in the terminal.
	 */
	readonly selection: string | undefined;

	/**
	 * Check if anything is selected in terminal.
	 */
	hasSelection(): boolean;

	/**
	 * Clear current selection.
	 */
	clearSelection(): void;

	/**
	 * Focuses the terminal instance if it's able to (the xterm.js instance must exist).
	 *
	 * @param force Force focus even if there is a selection.
	 */
	focus(force?: boolean): void;

	/**
	 * Force the scroll bar to be visible until {@link resetScrollbarVisibility} is called.
	 */
	forceScrollbarVisibility(): void;

	/**
	 * Resets the scroll bar to only be visible when needed, this does nothing unless
	 * {@link forceScrollbarVisibility} was called.
	 */
	resetScrollbarVisibility(): void;

	/**
	 * Gets a terminal contribution by its ID.
	 */
	getContribution<T extends ITerminalContribution>(id: string): T | null;
}

/**
 * A {@link ITerminalInstance}-like object that emulates a subset of
 * capabilities. This instance is returned from {@link ITerminalService.createDetachedTerminal}
 * to represent terminals that appear in other parts of the VS Code UI outside
 * of the "Terminal" view or editors.
 */
export interface IDetachedTerminalInstance extends IDisposable, IBaseTerminalInstance {
	readonly xterm: IDetachedXtermTerminal;

	/**
	 * Attached the terminal to the given element. This should be preferred over
	 * calling {@link IXtermTerminal.attachToElement} so that extra DOM elements
	 * for contributions are initialized.
	 *
	 * @param container Container the terminal will be rendered in
	 * @param options Additional options for mounting the terminal in an element
	 */
	attachToElement(container: HTMLElement, options?: Partial<IXtermAttachToElementOptions>): void;
}

export const isDetachedTerminalInstance = (t: ITerminalInstance | IDetachedTerminalInstance): t is IDetachedTerminalInstance => !isNumber((t as ITerminalInstance).instanceId);

export interface ITerminalService extends ITerminalInstanceHost {
	readonly _serviceBrand: undefined;

	/** Gets all terminal instances, including editor, terminal view (group), and background instances. */
	readonly instances: readonly ITerminalInstance[];

	readonly foregroundInstances: readonly ITerminalInstance[];

	/** Gets detached terminal instances created via {@link createDetachedXterm}. */
	readonly detachedInstances: Iterable<IDetachedTerminalInstance>;

	readonly isProcessSupportRegistered: boolean;
	readonly connectionState: TerminalConnectionState;
	readonly whenConnected: Promise<void>;
	/** The number of restored terminal groups on startup. */
	readonly restoredGroupCount: number;

	readonly onDidCreateInstance: Event<ITerminalInstance>;
	readonly onDidChangeInstanceDimensions: Event<ITerminalInstance>;
	readonly onDidRequestStartExtensionTerminal: Event<IStartExtensionTerminalRequest>;
	readonly onDidRegisterProcessSupport: Event<void>;
	readonly onDidChangeConnectionState: Event<void>;

	// Group events
	readonly onDidChangeActiveGroup: Event<ITerminalGroup | undefined>;

	// Multiplexed events
	readonly onAnyInstanceData: Event<{ instance: ITerminalInstance; data: string }>;
	readonly onAnyInstanceDataInput: Event<ITerminalInstance>;
	readonly onAnyInstanceIconChange: Event<{ instance: ITerminalInstance; userInitiated: boolean }>;
	readonly onAnyInstanceMaximumDimensionsChange: Event<ITerminalInstance>;
	readonly onAnyInstancePrimaryStatusChange: Event<ITerminalInstance>;
	readonly onAnyInstanceProcessIdReady: Event<ITerminalInstance>;
	readonly onAnyInstanceSelectionChange: Event<ITerminalInstance>;
	readonly onAnyInstanceTitleChange: Event<ITerminalInstance>;
	readonly onAnyInstanceShellTypeChanged: Event<ITerminalInstance>;
	readonly onAnyInstanceAddedCapabilityType: Event<TerminalCapability>;

	/**
	 * Creates a terminal.
	 * @param options The options to create the terminal with, when not specified the default
	 * profile will be used at the default target.
	 */
	createTerminal(options?: ICreateTerminalOptions): Promise<ITerminalInstance>;

	/**
	 * Creates and focuses a terminal.
	 * @param options The options to create the terminal with, when not specified the default
	 * profile will be used at the default target.
	 */
	createAndFocusTerminal(options?: ICreateTerminalOptions): Promise<ITerminalInstance>;

	/**
	 * Creates a detached xterm instance which is not attached to the DOM or
	 * tracked as a terminal instance.
	 * @params options The options to create the terminal with
	 */
	createDetachedTerminal(options: IDetachedXTermOptions): Promise<IDetachedTerminalInstance>;

	/**
	 * Creates a raw terminal instance, this should not be used outside of the terminal part.
	 */
	getInstanceFromId(terminalId: number): ITerminalInstance | undefined;

	/**
	 * An owner of terminals might be created after reconnection has occurred,
	 * so store them to be requested/adopted later
	 * @deprecated Use {@link onDidReconnectToSession}
	 */
	getReconnectedTerminals(reconnectionOwner: string): ITerminalInstance[] | undefined;

	getActiveOrCreateInstance(options?: { acceptsInput?: boolean }): Promise<ITerminalInstance>;
	revealTerminal(source: ITerminalInstance, preserveFocus?: boolean): Promise<void>;
	/**
	 * @param instance
	 * @param suppressSetActive Do not set the active instance when there is only one terminal
	 * @param forceSaveState Used when the window is shutting down and we need to reveal and save hideFromUser terminals
	 */
	showBackgroundTerminal(instance: ITerminalInstance, suppressSetActive?: boolean): Promise<void>;
	revealActiveTerminal(preserveFocus?: boolean): Promise<void>;
	moveToEditor(source: ITerminalInstance, group?: GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE | AUX_WINDOW_GROUP_TYPE): void;
	moveIntoNewEditor(source: ITerminalInstance): void;
	moveToTerminalView(source: ITerminalInstance | URI): Promise<void>;
	getPrimaryBackend(): ITerminalBackend | undefined;
	setNextCommandId(id: number, commandLine: string, commandId: string): Promise<void>;

	/**
	 * Fire the onActiveTabChanged event, this will trigger the terminal dropdown to be updated,
	 * among other things.
	 */
	refreshActiveGroup(): void;

	registerProcessSupport(isSupported: boolean): void;

	showProfileQuickPick(type: 'setDefault' | 'createInstance', cwd?: string | URI): Promise<ITerminalInstance | undefined>;

	setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): void;

	requestStartExtensionTerminal(proxy: ITerminalProcessExtHostProxy, cols: number, rows: number): Promise<ITerminalLaunchError | undefined>;
	isAttachedToTerminal(remoteTerm: IRemoteTerminalAttachTarget): boolean;
	safeDisposeTerminal(instance: ITerminalInstance): Promise<void>;

	getDefaultInstanceHost(): ITerminalInstanceHost;
	getInstanceHost(target: ITerminalLocationOptions | undefined): Promise<ITerminalInstanceHost>;

	resolveLocation(location?: ITerminalLocationOptions): Promise<TerminalLocation | undefined>;
	setNativeDelegate(nativeCalls: ITerminalServiceNativeDelegate): void;

	/**
	 * Creates an instance event listener that listens to all instances, dynamically adding new
	 * instances and removing old instances as needed.
	 * @param getEvent Maps the instance to the event.
	 */
	createOnInstanceEvent<T>(getEvent: (instance: ITerminalInstance) => Event<T>): DynamicListEventMultiplexer<ITerminalInstance, T>;

	/**
	 * Creates a capability event listener that listens to capabilities on all instances,
	 * dynamically adding and removing instances and capabilities as needed.
	 * @param capabilityId The capability type to listen to an event on.
	 * @param getEvent Maps the capability to the event.
	 */
	createOnInstanceCapabilityEvent<T extends TerminalCapability, K>(capabilityId: T, getEvent: (capability: ITerminalCapabilityImplMap[T]) => Event<K>): IDynamicListEventMultiplexer<{ instance: ITerminalInstance; data: K }>;

	/**
	 * Reveals the terminal and, if provided, scrolls to the command mark.
	 * @param resource the terminal resource
	 */
	openResource(resource: URI): void;
}

/**
 * A service that provides convenient access to the terminal configuration and derived values.
 */
export interface ITerminalConfigurationService {
	readonly _serviceBrand: undefined;

	/**
	 * A typed and partially validated representation of the terminal configuration.
	 */
	readonly config: Readonly<ITerminalConfiguration>;

	/**
	 * The default location for terminals.
	 */
	readonly defaultLocation: TerminalLocation;

	/**
	 * Fires when something within the terminal configuration changes.
	 */
	readonly onConfigChanged: Event<void>;

	setPanelContainer(panelContainer: HTMLElement): void;
	configFontIsMonospace(): boolean;
	getFont(w: Window, xtermCore?: IXtermCore, excludeDimensions?: boolean): ITerminalFont;
}

export class TerminalLinkQuickPickEvent extends MouseEvent {

}
export interface ITerminalServiceNativeDelegate {
	getWindowCount(): Promise<number>;
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
	detachInstance(instance: ITerminalInstance): void;
	splitInstance(instanceToSplit: ITerminalInstance, shellLaunchConfig?: IShellLaunchConfig): ITerminalInstance;
	revealActiveEditor(preserveFocus?: boolean): Promise<void>;
	resolveResource(instance: ITerminalInstance): URI;
	reviveInput(deserializedInput: IDeserializedTerminalEditorInput): EditorInput;
	getInputFromResource(resource: URI): TerminalEditorInput;
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
	readonly shellIntegrationNonce: string;
}

export interface ISerializedTerminalEditorInput extends ITerminalEditorInputObject {
}

export interface IDeserializedTerminalEditorInput extends ITerminalEditorInputObject {
}

export type ITerminalLocationOptions = TerminalLocation | TerminalEditorLocation | { parentTerminal: MaybePromise<ITerminalInstance> } | { splitActiveTerminal: boolean };

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

	/**
	 * This terminal will not wait for contributed profiles to resolve which means it will proceed
	 * when the workbench is not yet loaded.
	 */
	skipContributedProfileCheck?: boolean;
}

export interface TerminalEditorLocation {
	viewColumn: GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE | AUX_WINDOW_GROUP_TYPE;
	preserveFocus?: boolean;
	auxiliary?: IEditorOptions['auxiliary'];
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
	/**
	 * Gets or sets the last accessed menu, this is used to select the instance(s) for menu actions.
	 */
	lastAccessedMenu: 'inline-tab' | 'tab-list';

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
	moveGroup(source: SingleOrMany<ITerminalInstance>, target: ITerminalInstance): void;
	moveGroupToEnd(source: SingleOrMany<ITerminalInstance>): void;

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
	focusHover(): void;
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
	 * Reveal and focus the instance, regardless of its location.
	 */
	focusInstance(instance: ITerminalInstance): Promise<void>;
	/**
	 * Reveal and focus the active instance, regardless of its location.
	 */
	focusActiveInstance(): Promise<void>;
	/**
	 * Gets an instance from a resource if it exists. This MUST be used instead of getInstanceFromId
	 * when you only know about a terminal's URI. (a URI's instance ID may not be this window's instance ID)
	 */
	getInstanceFromResource(resource: UriComponents | undefined): ITerminalInstance | undefined;
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

export interface ITerminalInstance extends IBaseTerminalInstance {
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
	readonly domElement: HTMLElement;
	readonly icon?: TerminalIcon;
	readonly color?: string;
	readonly reconnectionProperties?: IReconnectionProperties;
	readonly processName: string;
	readonly sequence?: string;
	readonly staticTitle?: string;
	readonly progressState?: IProgressState;
	readonly workspaceFolder?: IWorkspaceFolder;
	readonly cwd?: string;
	readonly initialCwd?: string;
	readonly os?: OperatingSystem;
	readonly usedShellIntegrationInjection: boolean;
	readonly shellIntegrationInjectionFailureReason: ShellIntegrationInjectionFailureReason | undefined;
	readonly injectedArgs: string[] | undefined;
	readonly extEnvironmentVariableCollection: IMergedEnvironmentVariableCollection | undefined;

	/**
	 * The underlying disposable store, allowing objects who share the same lifecycle as the
	 * terminal instance but are created externally to be managed by the instance.
	 */
	readonly store: DisposableStore;

	readonly statusList: ITerminalStatusList;

	/**
	 * The process ID of the shell process, this is undefined when there is no process associated
	 * with this terminal.
	 */
	processId: number | undefined;

	/**
	 * The position of the terminal.
	 */
	target: TerminalLocation | undefined;
	targetRef: IReference<TerminalLocation | undefined>;

	/**
	 * The id of a persistent process. This is defined if this is a terminal created by a pty host
	 * that supports reconnection.
	 */
	readonly persistentProcessId: number | undefined;

	/**
	 * Whether the process should be persisted across reloads.
	 */
	readonly shouldPersist: boolean;

	/*
	 * Whether this terminal has been disposed of
	 */
	readonly isDisposed: boolean;

	/**
	 * Whether the terminal's pty is hosted on a remote.
	 */
	readonly hasRemoteAuthority: boolean;

	/**
	 * The remote authority of the terminal's pty.
	 */
	readonly remoteAuthority: string | undefined;

	/**
	 * Whether an element within this terminal is focused.
	 */
	readonly hasFocus: boolean;

	/**
	 * The ID of the session that this terminal is connected to
	 */
	readonly sessionId: string;

	/**
	 * Get or set the behavior of the terminal when it closes. This was indented only to be called
	 * after reconnecting to a terminal.
	 */
	waitOnExit: WaitOnExitValue | undefined;

	/**
	 * An event that fires when the terminal instance's title changes.
	 */
	readonly onTitleChanged: Event<ITerminalInstance>;

	/**
	 * An event that fires when the terminal instance's icon changes.
	 */
	readonly onIconChanged: Event<{ instance: ITerminalInstance; userInitiated: boolean }>;

	/**
	 * An event that fires when the terminal instance is disposed.
	 */
	readonly onDisposed: Event<ITerminalInstance>;

	readonly onProcessIdReady: Event<ITerminalInstance>;
	readonly onProcessReplayComplete: Event<void>;
	readonly onRequestExtHostProcess: Event<ITerminalInstance>;
	readonly onDimensionsChanged: Event<void>;
	readonly onMaximumDimensionsChanged: Event<void>;
	readonly onDidChangeHasChildProcesses: Event<boolean>;

	readonly onDidFocus: Event<ITerminalInstance>;
	readonly onDidRequestFocus: Event<void>;
	readonly onDidBlur: Event<ITerminalInstance>;
	readonly onDidInputData: Event<string>;
	readonly onDidChangeSelection: Event<ITerminalInstance>;
	readonly onDidExecuteText: Event<void>;
	readonly onDidChangeTarget: Event<TerminalLocation | undefined>;
	readonly onDidSendText: Event<string>;
	readonly onDidChangeShellType: Event<TerminalShellType>;
	readonly onDidChangeVisibility: Event<boolean>;

	/**
	 * An event that fires when a terminal is dropped on this instance via drag and drop.
	 */
	readonly onRequestAddInstanceToGroup: Event<IRequestAddInstanceToGroupEvent>;

	/**
	 * Attach a listener to the raw data stream coming from the pty, including ANSI escape
	 * sequences.
	 */
	readonly onData: Event<string>;
	readonly onWillData: Event<string>;

	/**
	 * Attach a listener to the binary data stream coming from xterm and going to pty
	 */
	readonly onBinary: Event<string>;

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
	readonly onLineData: Event<string>;

	/**
	 * Attach a listener that fires when the terminal's pty process exits. The number in the event
	 * is the processes' exit code, an exit code of undefined means the process was killed as a result of
	 * the ITerminalInstance being disposed.
	 */
	readonly onExit: Event<number | ITerminalLaunchError | undefined>;

	/**
	 * The exit code or undefined when the terminal process hasn't yet exited or
	 * the process exit code could not be determined. Use {@link exitReason} to see
	 * why the process has exited.
	 */
	readonly exitCode: number | undefined;

	/**
	 * The reason the terminal process exited, this will be undefined if the process is still
	 * running.
	 */
	readonly exitReason: TerminalExitReason | undefined;

	/**
	 * The xterm.js instance for this terminal.
	 */
	readonly xterm?: XtermTerminal;

	/**
	 * Resolves when the xterm.js instance for this terminal is ready.
	 */
	readonly xtermReadyPromise: Promise<XtermTerminal | undefined>;

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
	readonly shellType: TerminalShellType | undefined;

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

	/**
	 * The description of the terminal, this is typically displayed next to {@link title}.
	 */
	description: string | undefined;

	/**
	 * The remote-aware $HOME directory (or Windows equivalent) of the terminal.
	 */
	userHome: string | undefined;

	/**
	 * The nonce used to verify commands coming from shell integration.
	 */
	shellIntegrationNonce: string;

	/**
	 * Registers and returns a marker
	 * @param the y offset from the cursor
	 */
	registerMarker(offset?: number): IMarker | undefined;

	/**
	 * Adds a marker to the buffer, mapping it to an ID if provided.
	 */
	addBufferMarker(properties: IMarkProperties): void;

	/**
	 *
	 * @param startMarkId The ID for the start marker
	 * @param endMarkId The ID for the end marker
	 * @param highlight Whether the buffer from startMarker to endMarker
	 * should be highlighted
	 */
	scrollToMark(startMarkId: string, endMarkId?: string, highlight?: boolean): void;

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
	 * When the panel is hidden or a terminal in the editor area becomes inactive, reset the focus context key
	 * to avoid issues like #147180.
	 */
	resetFocusContextKey(): void;

	/**
	 * Focuses the terminal instance when it's ready (the xterm.js instance much exist). This is the
	 * best focus call when the terminal is being shown for example.
	 * when the terminal is being shown.
	 *
	 * @param force Force focus even if there is a selection.
	 */
	focusWhenReady(force?: boolean): Promise<void>;

	/**
	 * Send text to the terminal instance. The text is written to the stdin of the underlying pty
	 * process (shell) of the terminal instance.
	 *
	 * @param text The text to send.
	 * @param shouldExecute Indicates that the text being sent should be executed rather than just inserted in the terminal.
	 * The character(s) added are \n or \r\n, depending on the platform. This defaults to `true`.
	 * @param bracketedPasteMode Whether to wrap the text in the bracketed paste mode sequence when
	 * it's enabled. When true, the shell will treat the text as if it were pasted into the shell,
	 * this may for example select the text and it will also ensure that the text will not be
	 * interpreted as a shell keybinding.
	 */
	sendText(text: string, shouldExecute: boolean, bracketedPasteMode?: boolean): Promise<void>;

	/**
	 * Sends a signal to the terminal instance's process.
	 *
	 * @param signal The signal to send (e.g., 'SIGTERM', 'SIGINT', 'SIGKILL').
	 */
	sendSignal(signal: string): Promise<void>;

	/**
	 * Sends a path to the terminal instance, preparing it as needed based on the detected shell
	 * running within the terminal. The text is written to the stdin of the underlying pty process
	 * (shell) of the terminal instance.
	 *
	 * @param originalPath The path to send.
	 * @param shouldExecute Indicates that the text being sent should be executed rather than just inserted in the terminal.
	 * The character(s) added are \n or \r\n, depending on the platform. This defaults to `true`.
	 */
	sendPath(originalPath: string | URI, shouldExecute: boolean): Promise<void>;

	runCommand(command: string, shouldExecute?: boolean, commandId?: string): Promise<void>;

	/**
	 * Takes a path and returns the properly escaped path to send to a given shell. On Windows, this
	 * includes trying to prepare the path for WSL if needed.
	 *
	 * @param originalPath The path to be escaped and formatted.
	 */
	preparePathForShell(originalPath: string): Promise<string>;

	/**
	 * Formats a file system URI for display in UI so that it appears in the terminal shell's format.
	 * @param uri The URI to format.
	 */
	getUriLabelForShell(uri: URI): Promise<string>;

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
	 * Layout the terminal instance.
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
	 * Sets the terminal instance's dimensions to the values provided via the onDidOverrideDimensions event,
	 * which allows overriding the regular dimensions (fit to the size of the panel).
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

	/**
	 * Gets the initial current working directory, fetching it from the backend if required.
	 */
	getInitialCwd(): Promise<string>;

	/**
	 * Gets the current working directory from cwd detection capabilities if available, otherwise
	 * from the backend. This will return the initial cwd if cwd detection is not available (ie.
	 * on Windows when shell integration is disabled).
	 */
	getSpeculativeCwd(): Promise<string>;

	/**
	 * Gets the cwd as a URI that has been validated to exist.
	 */
	getCwdResource(): Promise<URI | undefined>;

	/**
	 * Sets the title of the terminal to the provided string. If no title is provided, it will reset
	 * to the terminal's title if it was not explicitly set by the user or API.
	 * @param title The new title.
	 */
	rename(title?: string): Promise<void>;

	/**
	 * Sets or triggers a quick pick to change the icon of this terminal.
	 */
	changeIcon(icon?: TerminalIcon): Promise<TerminalIcon | undefined>;

	/**
	 * Sets or triggers a quick pick to change the color of the associated terminal tab icon.
	 */
	changeColor(color?: string, skipQuickPick?: boolean): Promise<string | undefined>;

	/**
	 * Attempts to detect and kill the process listening on specified port.
	 * If successful, places commandToRun on the command line
	 */
	freePortKillProcess(port: string, commandToRun: string): Promise<void>;

	/**
	 * Update the parent context key service to use for this terminal instance.
	 */
	setParentContextKeyService(parentContextKeyService: IContextKeyService): void;

	/**
	 * Handles a mouse event for the terminal, this may happen on an anscestor of the terminal
	 * instance's element.
	 * @param event The mouse event.
	 * @param contextMenu The context menu to show if needed.
	 * @returns Whether the context menu should be suppressed.
	 */
	handleMouseEvent(event: MouseEvent, contextMenu: IMenu): Promise<{ cancelContextMenu: boolean } | void>;
}

export const enum XtermTerminalConstants {
	SearchHighlightLimit = 20000
}

export interface IXtermAttachToElementOptions {
	/**
	 * Whether GPU rendering should be enabled for this element, defaults to true.
	 */
	enableGpu: boolean;
}

export interface IXtermTerminal extends IDisposable {
	/**
	 * An object that tracks when commands are run and enables navigating and selecting between
	 * them.
	 */
	readonly markTracker: IMarkTracker;

	/**
	 * Reports the status of shell integration and fires events relating to it.
	 */
	readonly shellIntegration: IShellIntegration;

	readonly decorationAddon: IDecorationAddon;

	readonly onDidChangeSelection: Event<void>;
	readonly onDidChangeFindResults: Event<{ resultIndex: number; resultCount: number }>;
	readonly onDidRequestRunCommand: Event<{ command: ITerminalCommand; noNewLine?: boolean }>;
	readonly onDidRequestCopyAsHtml: Event<{ command: ITerminalCommand }>;

	/**
	 * Event fired when focus enters (fires with true) or leaves (false) the terminal.
	 */
	readonly onDidChangeFocus: Event<boolean>;

	/**
	 * Fires after a search is performed.
	 */
	readonly onAfterSearch: Event<void>;

	/**
	 * Fires before a search is performed.
	 */
	readonly onBeforeSearch: Event<void>;

	/**
	 * Gets a view of the current texture atlas used by the renderers.
	 */
	readonly textureAtlas: Promise<ImageBitmap> | undefined;

	/**
	 * Whether the `disableStdin` option in xterm.js is set.
	 */
	readonly isStdinDisabled: boolean;

	/**
	 * Whether the terminal is currently focused.
	 */
	readonly isFocused: boolean;

	/**
	 * Whether a canvas-based renderer is being used.
	 */
	readonly isGpuAccelerated: boolean;

	/**
	 * The last `onData` input event fired by {@link RawXtermTerminal.onData}.
	 */
	readonly lastInputEvent: string | undefined;

	/**
	 * Attached the terminal to the given element
	 * @param container Container the terminal will be rendered in
	 * @param options Additional options for mounting the terminal in an element
	 */
	attachToElement(container: HTMLElement, options?: Partial<IXtermAttachToElementOptions>): void;

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

	/**
	 * Gets the content between two markers as VT sequences.
	 * @param startMarker The marker to start from.
	 * @param endMarker The marker to end at.
	 * @param skipLastLine Whether the last line should be skipped (e.g. when it's the prompt line)
	 */
	getRangeAsVT(startMarker: IXtermMarker, endMarker?: IXtermMarker, skipLastLine?: boolean): Promise<string>;

	/**
	 * Gets whether there's any terminal selection.
	 */
	hasSelection(): boolean;

	/**
	 * Clears any terminal selection.
	 */
	clearSelection(): void;

	/**
	 * Selects all terminal contents/
	 */
	selectAll(): void;

	/**
	 * Selects the content between the two markers by their VS Code OSC `SetMarker`
	 * ID. It's a no-op if either of the two markers are not found.
	 *
	 * @param fromMarkerId Start marker ID
	 * @param toMarkerId End marker ID
	 * @param scrollIntoView Whether the terminal should scroll to the start of
	 * the range, defaults tof alse
	 */
	selectMarkedRange(fromMarkerId: string, toMarkerId: string, scrollIntoView?: boolean): void;

	/**
	 * Copies the terminal selection.
	 * @param copyAsHtml Whether to copy selection as HTML, defaults to false.
	 */
	copySelection(copyAsHtml?: boolean, command?: ITerminalCommand): void;
	/**
	 * Focuses the terminal. Warning: {@link ITerminalInstance.focus} should be
	 * preferred when dealing with terminal instances in order to get
	 * accessibility triggers.
	 */
	focus(): void;

	/** Scroll the terminal buffer down 1 line.   */ scrollDownLine(): void;
	/** Scroll the terminal buffer down 1 page.   */ scrollDownPage(): void;
	/** Scroll the terminal buffer to the bottom. */ scrollToBottom(): void;
	/** Scroll the terminal buffer up 1 line.     */ scrollUpLine(): void;
	/** Scroll the terminal buffer up 1 page.     */ scrollUpPage(): void;
	/** Scroll the terminal buffer to the top.    */ scrollToTop(): void;
	/** Scroll the terminal buffer to a set line  */ scrollToLine(line: number, position?: ScrollPosition): void;

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
	 * Returns a reverse iterator of buffer lines as strings
	 */
	getBufferReverseIterator(): IterableIterator<string>;

	/**
	 * Gets the contents of the buffer from a start marker (or line 0) to the end marker (or the
	 * last line).
	 */
	getContentsAsText(startMarker?: IXtermMarker, endMarker?: IXtermMarker): string;

	/**
	 * Gets the buffer contents as HTML.
	 */
	getContentsAsHtml(): Promise<string>;

	/**
	 * Refreshes the terminal after it has been moved.
	 */
	refresh(): void;

	getXtermTheme(theme?: IColorTheme): ITheme;
}

export interface IDetachedXtermTerminal extends IXtermTerminal {
	/**
	 * Writes data to the terminal.
	 * @param data data to write
	 * @param callback Optional callback that fires when the data was processed
	 * by the parser.
	 */
	write(data: string | Uint8Array, callback?: () => void): void;

	/**
	 * Resizes the terminal.
	 */
	resize(columns: number, rows: number): void;
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

export interface IXtermColorProvider {
	getBackgroundColor(theme: IColorTheme): Color | undefined;
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
