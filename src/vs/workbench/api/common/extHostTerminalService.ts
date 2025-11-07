/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Event, Emitter } from '../../../base/common/event.js';
import { ExtHostTerminalServiceShape, MainContext, MainThreadTerminalServiceShape, ITerminalDimensionsDto, ITerminalLinkDto, ExtHostTerminalIdentifier, ICommandDto, ITerminalQuickFixOpenerDto, ITerminalQuickFixTerminalCommandDto, TerminalCommandMatchResultDto, ITerminalCommandDto, ITerminalCompletionContextDto, TerminalCompletionListDto } from './extHost.protocol.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../base/common/uri.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { IDisposable, DisposableStore, Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { Disposable as VSCodeDisposable, EnvironmentVariableMutatorType, TerminalExitReason, TerminalCompletionItem } from './extHostTypes.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { localize } from '../../../nls.js';
import { NotSupportedError } from '../../../base/common/errors.js';
import { serializeEnvironmentDescriptionMap, serializeEnvironmentVariableCollection } from '../../../platform/terminal/common/environmentVariableShared.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IEnvironmentVariableCollectionDescription, IEnvironmentVariableMutator, ISerializableEnvironmentVariableCollection } from '../../../platform/terminal/common/environmentVariable.js';
import { ICreateContributedTerminalProfileOptions, IProcessReadyEvent, IShellLaunchConfigDto, ITerminalChildProcess, ITerminalLaunchError, ITerminalProfile, TerminalIcon, TerminalLocation, IProcessProperty, ProcessPropertyType, IProcessPropertyMap, TerminalShellType, WindowsShellType } from '../../../platform/terminal/common/terminal.js';
import { TerminalDataBufferer } from '../../../platform/terminal/common/terminalDataBuffering.js';
import { ThemeColor } from '../../../base/common/themables.js';
import { Promises } from '../../../base/common/async.js';
import { EditorGroupColumn } from '../../services/editor/common/editorGroupColumn.js';
import { TerminalCompletionList, TerminalQuickFix, ViewColumn } from './extHostTypeConverters.js';
import { IExtHostCommands } from './extHostCommands.js';
import { MarshalledId } from '../../../base/common/marshallingIds.js';
import { ISerializedTerminalInstanceContext } from '../../contrib/terminal/common/terminal.js';
import { isWindows } from '../../../base/common/platform.js';
import { hasKey } from '../../../base/common/types.js';

export interface IExtHostTerminalService extends ExtHostTerminalServiceShape, IDisposable {

	readonly _serviceBrand: undefined;

	activeTerminal: vscode.Terminal | undefined;
	terminals: vscode.Terminal[];

	readonly onDidCloseTerminal: Event<vscode.Terminal>;
	readonly onDidOpenTerminal: Event<vscode.Terminal>;
	readonly onDidChangeActiveTerminal: Event<vscode.Terminal | undefined>;
	readonly onDidChangeTerminalDimensions: Event<vscode.TerminalDimensionsChangeEvent>;
	readonly onDidChangeTerminalState: Event<vscode.Terminal>;
	readonly onDidWriteTerminalData: Event<vscode.TerminalDataWriteEvent>;
	readonly onDidExecuteTerminalCommand: Event<vscode.TerminalExecutedCommand>;
	readonly onDidChangeShell: Event<string>;

	createTerminal(name?: string, shellPath?: string, shellArgs?: readonly string[] | string): vscode.Terminal;
	createTerminalFromOptions(options: vscode.TerminalOptions, internalOptions?: ITerminalInternalOptions): vscode.Terminal;
	createExtensionTerminal(options: vscode.ExtensionTerminalOptions): vscode.Terminal;
	attachPtyToTerminal(id: number, pty: vscode.Pseudoterminal): void;
	getDefaultShell(useAutomationShell: boolean): string;
	getDefaultShellArgs(useAutomationShell: boolean): string[] | string;
	registerLinkProvider(provider: vscode.TerminalLinkProvider): vscode.Disposable;
	registerProfileProvider(extension: IExtensionDescription, id: string, provider: vscode.TerminalProfileProvider): vscode.Disposable;
	registerTerminalQuickFixProvider(id: string, extensionId: string, provider: vscode.TerminalQuickFixProvider): vscode.Disposable;
	getEnvironmentVariableCollection(extension: IExtensionDescription): IEnvironmentVariableCollection;
	getTerminalById(id: number): ExtHostTerminal | null;
	getTerminalIdByApiObject(apiTerminal: vscode.Terminal): number | null;
	registerTerminalCompletionProvider(extension: IExtensionDescription, provider: vscode.TerminalCompletionProvider<vscode.TerminalCompletionItem>, ...triggerCharacters: string[]): vscode.Disposable;
}

interface IEnvironmentVariableCollection extends vscode.EnvironmentVariableCollection {
	getScoped(scope: vscode.EnvironmentVariableScope): vscode.EnvironmentVariableCollection;
}

export interface ITerminalInternalOptions {
	cwd?: string | URI;
	isFeatureTerminal?: boolean;
	forceShellIntegration?: boolean;
	useShellEnvironment?: boolean;
	resolvedExtHostIdentifier?: ExtHostTerminalIdentifier;
	/**
	 * This location is different from the API location because it can include splitActiveTerminal,
	 * a property we resolve internally
	 */
	location?: TerminalLocation | { viewColumn: number; preserveState?: boolean } | { splitActiveTerminal: boolean };
}

export const IExtHostTerminalService = createDecorator<IExtHostTerminalService>('IExtHostTerminalService');

export class ExtHostTerminal extends Disposable {
	private _disposed: boolean = false;
	private _pidPromise: Promise<number | undefined>;
	private _cols: number | undefined;
	private _pidPromiseComplete: ((value: number | undefined) => any) | undefined;
	private _rows: number | undefined;
	private _exitStatus: vscode.TerminalExitStatus | undefined;
	private _state: vscode.TerminalState = { isInteractedWith: false, shell: undefined };
	private _selection: string | undefined;

	shellIntegration: vscode.TerminalShellIntegration | undefined;

	public isOpen: boolean = false;

	readonly value: vscode.Terminal;

	protected readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	constructor(
		private _proxy: MainThreadTerminalServiceShape,
		public _id: ExtHostTerminalIdentifier,
		private readonly _creationOptions: vscode.TerminalOptions | vscode.ExtensionTerminalOptions,
		private _name?: string,
	) {
		super();

		this._creationOptions = Object.freeze(this._creationOptions);
		this._pidPromise = new Promise<number | undefined>(c => this._pidPromiseComplete = c);

		const that = this;
		this.value = {
			get name(): string {
				return that._name || '';
			},
			get processId(): Promise<number | undefined> {
				return that._pidPromise;
			},
			get creationOptions(): Readonly<vscode.TerminalOptions | vscode.ExtensionTerminalOptions> {
				return that._creationOptions;
			},
			get exitStatus(): vscode.TerminalExitStatus | undefined {
				return that._exitStatus;
			},
			get state(): vscode.TerminalState {
				return that._state;
			},
			get selection(): string | undefined {
				return that._selection;
			},
			get shellIntegration(): vscode.TerminalShellIntegration | undefined {
				return that.shellIntegration;
			},
			sendText(text: string, shouldExecute: boolean = true): void {
				that._checkDisposed();
				that._proxy.$sendText(that._id, text, shouldExecute);
			},
			show(preserveFocus: boolean): void {
				that._checkDisposed();
				that._proxy.$show(that._id, preserveFocus);
			},
			hide(): void {
				that._checkDisposed();
				that._proxy.$hide(that._id);
			},
			dispose(): void {
				if (!that._disposed) {
					that._disposed = true;
					that._proxy.$dispose(that._id);
				}
			},
			get dimensions(): vscode.TerminalDimensions | undefined {
				if (that._cols === undefined || that._rows === undefined) {
					return undefined;
				}
				return {
					columns: that._cols,
					rows: that._rows
				};
			}
		};
	}

	override dispose(): void {
		this._onWillDispose.fire();
		super.dispose();
	}

	public async create(
		options: vscode.TerminalOptions,
		internalOptions?: ITerminalInternalOptions,
	): Promise<void> {
		if (typeof this._id !== 'string') {
			throw new Error('Terminal has already been created');
		}
		await this._proxy.$createTerminal(this._id, {
			name: options.name,
			shellPath: options.shellPath ?? undefined,
			shellArgs: options.shellArgs ?? undefined,
			cwd: options.cwd ?? internalOptions?.cwd ?? undefined,
			env: options.env ?? undefined,
			icon: asTerminalIcon(options.iconPath) ?? undefined,
			color: ThemeColor.isThemeColor(options.color) ? options.color.id : undefined,
			initialText: options.message ?? undefined,
			strictEnv: options.strictEnv ?? undefined,
			hideFromUser: options.hideFromUser ?? undefined,
			forceShellIntegration: internalOptions?.forceShellIntegration ?? undefined,
			isFeatureTerminal: internalOptions?.isFeatureTerminal ?? undefined,
			isExtensionOwnedTerminal: true,
			useShellEnvironment: internalOptions?.useShellEnvironment ?? undefined,
			location: internalOptions?.location || this._serializeParentTerminal(options.location, internalOptions?.resolvedExtHostIdentifier),
			isTransient: options.isTransient ?? undefined,
			shellIntegrationNonce: options.shellIntegrationNonce ?? undefined,
		});
	}


	public async createExtensionTerminal(location?: TerminalLocation | vscode.TerminalEditorLocationOptions | vscode.TerminalSplitLocationOptions, internalOptions?: ITerminalInternalOptions, parentTerminal?: ExtHostTerminalIdentifier, iconPath?: TerminalIcon, color?: ThemeColor, shellIntegrationNonce?: string): Promise<number> {
		if (typeof this._id !== 'string') {
			throw new Error('Terminal has already been created');
		}
		await this._proxy.$createTerminal(this._id, {
			name: this._name,
			isExtensionCustomPtyTerminal: true,
			icon: iconPath,
			color: ThemeColor.isThemeColor(color) ? color.id : undefined,
			location: internalOptions?.location || this._serializeParentTerminal(location, parentTerminal),
			isTransient: true,
			shellIntegrationNonce: shellIntegrationNonce ?? undefined,
		});
		// At this point, the id has been set via `$acceptTerminalOpened`
		if (typeof this._id === 'string') {
			throw new Error('Terminal creation failed');
		}
		return this._id;
	}

	private _serializeParentTerminal(location?: TerminalLocation | vscode.TerminalEditorLocationOptions | vscode.TerminalSplitLocationOptions, parentTerminal?: ExtHostTerminalIdentifier): TerminalLocation | { viewColumn: EditorGroupColumn; preserveFocus?: boolean } | { parentTerminal: ExtHostTerminalIdentifier } | undefined {
		if (typeof location === 'object') {
			if (hasKey(location, { parentTerminal: true }) && location.parentTerminal && parentTerminal) {
				return { parentTerminal };
			}

			if (hasKey(location, { viewColumn: true })) {
				return { viewColumn: ViewColumn.from(location.viewColumn), preserveFocus: location.preserveFocus };
			}

			return undefined;
		}

		return location;
	}

	private _checkDisposed() {
		if (this._disposed) {
			throw new Error('Terminal has already been disposed');
		}
	}

	public set name(name: string) {
		this._name = name;
	}

	public setExitStatus(code: number | undefined, reason: TerminalExitReason) {
		this._exitStatus = Object.freeze({ code, reason });
	}

	public setDimensions(cols: number, rows: number): boolean {
		if (cols === this._cols && rows === this._rows) {
			// Nothing changed
			return false;
		}
		if (cols === 0 || rows === 0) {
			return false;
		}
		this._cols = cols;
		this._rows = rows;
		return true;
	}

	public setInteractedWith(): boolean {
		if (!this._state.isInteractedWith) {
			this._state = {
				...this._state,
				isInteractedWith: true
			};
			return true;
		}
		return false;
	}

	public setShellType(shellType: TerminalShellType | undefined): boolean {

		if (this._state.shell !== shellType) {
			this._state = {
				...this._state,
				shell: shellType
			};
			return true;
		}
		return false;
	}

	public setSelection(selection: string | undefined): void {
		this._selection = selection;
	}

	public _setProcessId(processId: number | undefined): void {
		// The event may fire 2 times when the panel is restored
		if (this._pidPromiseComplete) {
			this._pidPromiseComplete(processId);
			this._pidPromiseComplete = undefined;
		} else {
			// Recreate the promise if this is the nth processId set (e.g. reused task terminals)
			this._pidPromise.then(pid => {
				if (pid !== processId) {
					this._pidPromise = Promise.resolve(processId);
				}
			});
		}
	}
}

class ExtHostPseudoterminal implements ITerminalChildProcess {
	readonly id = 0;
	readonly shouldPersist = false;

	private readonly _onProcessData = new Emitter<string>();
	public readonly onProcessData: Event<string> = this._onProcessData.event;
	private readonly _onProcessReady = new Emitter<IProcessReadyEvent>();
	public get onProcessReady(): Event<IProcessReadyEvent> { return this._onProcessReady.event; }
	private readonly _onDidChangeProperty = new Emitter<IProcessProperty<any>>();
	public readonly onDidChangeProperty = this._onDidChangeProperty.event;
	private readonly _onProcessExit = new Emitter<number | undefined>();
	public readonly onProcessExit: Event<number | undefined> = this._onProcessExit.event;

	constructor(private readonly _pty: vscode.Pseudoterminal) { }

	refreshProperty<T extends ProcessPropertyType>(property: ProcessPropertyType): Promise<IProcessPropertyMap[T]> {
		throw new Error(`refreshProperty is not suppported in extension owned terminals. property: ${property}`);
	}

	updateProperty<T extends ProcessPropertyType>(property: ProcessPropertyType, value: IProcessPropertyMap[T]): Promise<void> {
		throw new Error(`updateProperty is not suppported in extension owned terminals. property: ${property}, value: ${value}`);
	}

	async start(): Promise<undefined> {
		return undefined;
	}

	shutdown(): void {
		this._pty.close();
	}

	input(data: string): void {
		this._pty.handleInput?.(data);
	}

	sendSignal(signal: string): void {
		// Extension owned terminals don't support sending signals directly to processes
		// This could be extended in the future if the pseudoterminal API is enhanced
	}

	resize(cols: number, rows: number): void {
		this._pty.setDimensions?.({ columns: cols, rows });
	}

	clearBuffer(): void {
		// no-op
	}

	async processBinary(data: string): Promise<void> {
		// No-op, processBinary is not supported in extension owned terminals.
	}

	acknowledgeDataEvent(charCount: number): void {
		// No-op, flow control is not supported in extension owned terminals. If this is ever
		// implemented it will need new pause and resume VS Code APIs.
	}

	async setUnicodeVersion(version: '6' | '11'): Promise<void> {
		// No-op, xterm-headless isn't used for extension owned terminals.
	}

	async setNextCommandId(commandLine: string, commandId: string): Promise<void> {
		// No-op, command IDs are only tracked on the renderer for extension terminals.
	}

	getInitialCwd(): Promise<string> {
		return Promise.resolve('');
	}

	getCwd(): Promise<string> {
		return Promise.resolve('');
	}

	startSendingEvents(initialDimensions: ITerminalDimensionsDto | undefined): void {
		// Attach the listeners
		this._pty.onDidWrite(e => this._onProcessData.fire(e));
		this._pty.onDidClose?.((e: number | void = undefined) => {
			this._onProcessExit.fire(e === void 0 ? undefined : e);
		});
		this._pty.onDidOverrideDimensions?.(e => {
			if (e) {
				this._onDidChangeProperty.fire({ type: ProcessPropertyType.OverrideDimensions, value: { cols: e.columns, rows: e.rows } });
			}
		});
		this._pty.onDidChangeName?.(title => {
			this._onDidChangeProperty.fire({ type: ProcessPropertyType.Title, value: title });
		});

		this._pty.open(initialDimensions ? initialDimensions : undefined);

		if (initialDimensions) {
			this._pty.setDimensions?.(initialDimensions);
		}

		this._onProcessReady.fire({ pid: -1, cwd: '', windowsPty: undefined });
	}
}

let nextLinkId = 1;

interface ICachedLinkEntry {
	provider: vscode.TerminalLinkProvider;
	link: vscode.TerminalLink;
}

export abstract class BaseExtHostTerminalService extends Disposable implements IExtHostTerminalService, ExtHostTerminalServiceShape {

	readonly _serviceBrand: undefined;

	protected _proxy: MainThreadTerminalServiceShape;
	protected _activeTerminal: ExtHostTerminal | undefined;
	protected _terminals: ExtHostTerminal[] = [];
	protected _terminalProcesses: Map<number, ITerminalChildProcess> = new Map();
	protected _terminalProcessDisposables: { [id: number]: IDisposable } = {};
	protected _extensionTerminalAwaitingStart: { [id: number]: { initialDimensions: ITerminalDimensionsDto | undefined } | undefined } = {};
	protected _getTerminalPromises: { [id: number]: Promise<ExtHostTerminal | undefined> } = {};
	protected _environmentVariableCollections: Map<string, UnifiedEnvironmentVariableCollection> = new Map();
	private _defaultProfile: ITerminalProfile | undefined;
	private _defaultAutomationProfile: ITerminalProfile | undefined;
	private readonly _lastQuickFixCommands: MutableDisposable<IDisposable> = this._register(new MutableDisposable());

	private readonly _bufferer: TerminalDataBufferer;
	private readonly _linkProviders: Set<vscode.TerminalLinkProvider> = new Set();
	private readonly _completionProviders: Map<string, vscode.TerminalCompletionProvider<vscode.TerminalCompletionItem>> = new Map();
	private readonly _profileProviders: Map<string, vscode.TerminalProfileProvider> = new Map();
	private readonly _quickFixProviders: Map<string, vscode.TerminalQuickFixProvider> = new Map();
	private readonly _terminalLinkCache: Map<number, Map<number, ICachedLinkEntry>> = new Map();
	private readonly _terminalLinkCancellationSource: Map<number, CancellationTokenSource> = new Map();

	public get activeTerminal(): vscode.Terminal | undefined { return this._activeTerminal?.value; }
	public get terminals(): vscode.Terminal[] { return this._terminals.map(term => term.value); }

	protected readonly _onDidCloseTerminal = new Emitter<vscode.Terminal>();
	readonly onDidCloseTerminal = this._onDidCloseTerminal.event;
	protected readonly _onDidOpenTerminal = new Emitter<vscode.Terminal>();
	readonly onDidOpenTerminal = this._onDidOpenTerminal.event;
	protected readonly _onDidChangeActiveTerminal = new Emitter<vscode.Terminal | undefined>();
	readonly onDidChangeActiveTerminal = this._onDidChangeActiveTerminal.event;
	protected readonly _onDidChangeTerminalDimensions = new Emitter<vscode.TerminalDimensionsChangeEvent>();
	readonly onDidChangeTerminalDimensions = this._onDidChangeTerminalDimensions.event;
	protected readonly _onDidChangeTerminalState = new Emitter<vscode.Terminal>();
	readonly onDidChangeTerminalState = this._onDidChangeTerminalState.event;
	protected readonly _onDidChangeShell = new Emitter<string>();
	readonly onDidChangeShell = this._onDidChangeShell.event;

	protected readonly _onDidWriteTerminalData = new Emitter<vscode.TerminalDataWriteEvent>({
		onWillAddFirstListener: () => this._proxy.$startSendingDataEvents(),
		onDidRemoveLastListener: () => this._proxy.$stopSendingDataEvents()
	});
	readonly onDidWriteTerminalData = this._onDidWriteTerminalData.event;
	protected readonly _onDidExecuteCommand = new Emitter<vscode.TerminalExecutedCommand>({
		onWillAddFirstListener: () => this._proxy.$startSendingCommandEvents(),
		onDidRemoveLastListener: () => this._proxy.$stopSendingCommandEvents()
	});
	readonly onDidExecuteTerminalCommand = this._onDidExecuteCommand.event;

	constructor(
		supportsProcesses: boolean,
		@IExtHostCommands private readonly _extHostCommands: IExtHostCommands,
		@IExtHostRpcService extHostRpc: IExtHostRpcService
	) {
		super();
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadTerminalService);
		this._bufferer = new TerminalDataBufferer(this._proxy.$sendProcessData);
		this._proxy.$registerProcessSupport(supportsProcesses);
		this._extHostCommands.registerArgumentProcessor({
			processArgument: arg => {
				const deserialize = (arg: any) => {
					const cast = arg as ISerializedTerminalInstanceContext;
					return this.getTerminalById(cast.instanceId)?.value;
				};
				switch (arg?.$mid) {
					case MarshalledId.TerminalContext: return deserialize(arg);
					default: {
						// Do array transformation in place as this is a hot path
						if (Array.isArray(arg)) {
							for (let i = 0; i < arg.length; i++) {
								if (arg[i].$mid === MarshalledId.TerminalContext) {
									arg[i] = deserialize(arg[i]);
								} else {
									// Probably something else, so exit early
									break;
								}
							}
						}
						return arg;
					}
				}
			}
		});
		this._register({
			dispose: () => {
				for (const [_, terminalProcess] of this._terminalProcesses) {
					terminalProcess.shutdown(true);
				}
			}
		});
	}

	public abstract createTerminal(name?: string, shellPath?: string, shellArgs?: string[] | string): vscode.Terminal;
	public abstract createTerminalFromOptions(options: vscode.TerminalOptions, internalOptions?: ITerminalInternalOptions): vscode.Terminal;

	public getDefaultShell(useAutomationShell: boolean): string {
		const profile = useAutomationShell ? this._defaultAutomationProfile : this._defaultProfile;
		return profile?.path || '';
	}

	public getDefaultShellArgs(useAutomationShell: boolean): string[] | string {
		const profile = useAutomationShell ? this._defaultAutomationProfile : this._defaultProfile;
		return profile?.args || [];
	}

	public createExtensionTerminal(options: vscode.ExtensionTerminalOptions, internalOptions?: ITerminalInternalOptions): vscode.Terminal {
		const terminal = new ExtHostTerminal(this._proxy, generateUuid(), options, options.name);
		const p = new ExtHostPseudoterminal(options.pty);
		terminal.createExtensionTerminal(options.location, internalOptions, this._serializeParentTerminal(options, internalOptions).resolvedExtHostIdentifier, asTerminalIcon(options.iconPath), asTerminalColor(options.color), options.shellIntegrationNonce).then(id => {
			const disposable = this._setupExtHostProcessListeners(id, p);
			this._terminalProcessDisposables[id] = disposable;
		});
		this._terminals.push(terminal);
		return terminal.value;
	}

	protected _serializeParentTerminal(options: vscode.TerminalOptions, internalOptions?: ITerminalInternalOptions): ITerminalInternalOptions {
		internalOptions = internalOptions ? internalOptions : {};
		if (options.location && typeof options.location === 'object' && hasKey(options.location, { parentTerminal: true })) {
			const parentTerminal = options.location.parentTerminal;
			if (parentTerminal) {
				const parentExtHostTerminal = this._terminals.find(t => t.value === parentTerminal);
				if (parentExtHostTerminal) {
					internalOptions.resolvedExtHostIdentifier = parentExtHostTerminal._id;
				}
			}
		} else if (options.location && typeof options.location !== 'object') {
			internalOptions.location = options.location;
		} else if (internalOptions.location && typeof internalOptions.location === 'object' && hasKey(internalOptions.location, { splitActiveTerminal: true })) {
			internalOptions.location = { splitActiveTerminal: true };
		}
		return internalOptions;
	}

	public attachPtyToTerminal(id: number, pty: vscode.Pseudoterminal): void {
		const terminal = this.getTerminalById(id);
		if (!terminal) {
			throw new Error(`Cannot resolve terminal with id ${id} for virtual process`);
		}
		const p = new ExtHostPseudoterminal(pty);
		const disposable = this._setupExtHostProcessListeners(id, p);
		this._terminalProcessDisposables[id] = disposable;
	}

	public async $acceptActiveTerminalChanged(id: number | null): Promise<void> {
		const original = this._activeTerminal;
		if (id === null) {
			this._activeTerminal = undefined;
			if (original !== this._activeTerminal) {
				this._onDidChangeActiveTerminal.fire(this._activeTerminal);
			}
			return;
		}
		const terminal = this.getTerminalById(id);
		if (terminal) {
			this._activeTerminal = terminal;
			if (original !== this._activeTerminal) {
				this._onDidChangeActiveTerminal.fire(this._activeTerminal.value);
			}
		}
	}

	public async $acceptTerminalProcessData(id: number, data: string): Promise<void> {
		const terminal = this.getTerminalById(id);
		if (terminal) {
			this._onDidWriteTerminalData.fire({ terminal: terminal.value, data });
		}
	}

	public async $acceptTerminalDimensions(id: number, cols: number, rows: number): Promise<void> {
		const terminal = this.getTerminalById(id);
		if (terminal) {
			if (terminal.setDimensions(cols, rows)) {
				this._onDidChangeTerminalDimensions.fire({
					terminal: terminal.value,
					dimensions: terminal.value.dimensions as vscode.TerminalDimensions
				});
			}
		}
	}

	public async $acceptDidExecuteCommand(id: number, command: ITerminalCommandDto): Promise<void> {
		const terminal = this.getTerminalById(id);
		if (terminal) {
			this._onDidExecuteCommand.fire({ terminal: terminal.value, ...command });
		}
	}

	public async $acceptTerminalMaximumDimensions(id: number, cols: number, rows: number): Promise<void> {
		// Extension pty terminal only - when virtual process resize fires it means that the
		// terminal's maximum dimensions changed
		this._terminalProcesses.get(id)?.resize(cols, rows);
	}

	public async $acceptTerminalTitleChange(id: number, name: string): Promise<void> {
		const terminal = this.getTerminalById(id);
		if (terminal) {
			terminal.name = name;
		}
	}

	public async $acceptTerminalClosed(id: number, exitCode: number | undefined, exitReason: TerminalExitReason): Promise<void> {
		const index = this._getTerminalObjectIndexById(this._terminals, id);
		if (index !== null) {
			const terminal = this._terminals.splice(index, 1)[0];
			terminal.setExitStatus(exitCode, exitReason);
			this._onDidCloseTerminal.fire(terminal.value);
		}
	}

	public $acceptTerminalOpened(id: number, extHostTerminalId: string | undefined, name: string, shellLaunchConfigDto: IShellLaunchConfigDto): void {
		if (extHostTerminalId) {
			// Resolve with the renderer generated id
			const index = this._getTerminalObjectIndexById(this._terminals, extHostTerminalId);
			if (index !== null) {
				// The terminal has already been created (via createTerminal*), only fire the event
				this._terminals[index]._id = id;
				this._onDidOpenTerminal.fire(this.terminals[index]);
				this._terminals[index].isOpen = true;
				return;
			}
		}

		const creationOptions: vscode.TerminalOptions = {
			name: shellLaunchConfigDto.name,
			shellPath: shellLaunchConfigDto.executable,
			shellArgs: shellLaunchConfigDto.args,
			cwd: typeof shellLaunchConfigDto.cwd === 'string' ? shellLaunchConfigDto.cwd : URI.revive(shellLaunchConfigDto.cwd),
			env: shellLaunchConfigDto.env,
			hideFromUser: shellLaunchConfigDto.hideFromUser
		};
		const terminal = new ExtHostTerminal(this._proxy, id, creationOptions, name);
		this._terminals.push(terminal);
		this._onDidOpenTerminal.fire(terminal.value);
		terminal.isOpen = true;
	}

	public async $acceptTerminalProcessId(id: number, processId: number): Promise<void> {
		const terminal = this.getTerminalById(id);
		terminal?._setProcessId(processId);
	}

	public async $startExtensionTerminal(id: number, initialDimensions: ITerminalDimensionsDto | undefined): Promise<ITerminalLaunchError | undefined> {
		// Make sure the ExtHostTerminal exists so onDidOpenTerminal has fired before we call
		// Pseudoterminal.start
		const terminal = this.getTerminalById(id);
		if (!terminal) {
			return { message: localize('launchFail.idMissingOnExtHost', "Could not find the terminal with id {0} on the extension host", id) };
		}

		// Wait for onDidOpenTerminal to fire
		if (!terminal.isOpen) {
			await new Promise<void>(r => {
				// Ensure open is called after onDidOpenTerminal
				const listener = this.onDidOpenTerminal(async e => {
					if (e === terminal.value) {
						listener.dispose();
						r();
					}
				});
			});
		}

		const terminalProcess = this._terminalProcesses.get(id);
		if (terminalProcess) {
			(terminalProcess as ExtHostPseudoterminal).startSendingEvents(initialDimensions);
		} else {
			// Defer startSendingEvents call to when _setupExtHostProcessListeners is called
			this._extensionTerminalAwaitingStart[id] = { initialDimensions };
		}

		return undefined;
	}

	protected _setupExtHostProcessListeners(id: number, p: ITerminalChildProcess): IDisposable {
		const disposables = new DisposableStore();
		disposables.add(p.onProcessReady(e => this._proxy.$sendProcessReady(id, e.pid, e.cwd, e.windowsPty)));
		disposables.add(p.onDidChangeProperty(property => this._proxy.$sendProcessProperty(id, property)));

		// Buffer data events to reduce the amount of messages going to the renderer
		this._bufferer.startBuffering(id, p.onProcessData);
		disposables.add(p.onProcessExit(exitCode => this._onProcessExit(id, exitCode)));
		this._terminalProcesses.set(id, p);

		const awaitingStart = this._extensionTerminalAwaitingStart[id];
		if (awaitingStart && p instanceof ExtHostPseudoterminal) {
			p.startSendingEvents(awaitingStart.initialDimensions);
			delete this._extensionTerminalAwaitingStart[id];
		}

		return disposables;
	}

	public $acceptProcessAckDataEvent(id: number, charCount: number): void {
		this._terminalProcesses.get(id)?.acknowledgeDataEvent(charCount);
	}

	public $acceptProcessInput(id: number, data: string): void {
		this._terminalProcesses.get(id)?.input(data);
	}

	public $acceptTerminalInteraction(id: number): void {
		const terminal = this.getTerminalById(id);
		if (terminal?.setInteractedWith()) {
			this._onDidChangeTerminalState.fire(terminal.value);
		}
	}

	public $acceptTerminalSelection(id: number, selection: string | undefined): void {
		this.getTerminalById(id)?.setSelection(selection);
	}

	public $acceptProcessResize(id: number, cols: number, rows: number): void {
		try {
			this._terminalProcesses.get(id)?.resize(cols, rows);
		} catch (error) {
			// We tried to write to a closed pipe / channel.
			if (error.code !== 'EPIPE' && error.code !== 'ERR_IPC_CHANNEL_CLOSED') {
				throw (error);
			}
		}
	}

	public $acceptProcessShutdown(id: number, immediate: boolean): void {
		this._terminalProcesses.get(id)?.shutdown(immediate);
	}

	public $acceptProcessRequestInitialCwd(id: number): void {
		this._terminalProcesses.get(id)?.getInitialCwd().then(initialCwd => this._proxy.$sendProcessProperty(id, { type: ProcessPropertyType.InitialCwd, value: initialCwd }));
	}

	public $acceptProcessRequestCwd(id: number): void {
		this._terminalProcesses.get(id)?.getCwd().then(cwd => this._proxy.$sendProcessProperty(id, { type: ProcessPropertyType.Cwd, value: cwd }));
	}

	public $acceptProcessRequestLatency(id: number): Promise<number> {
		return Promise.resolve(id);
	}


	public registerProfileProvider(extension: IExtensionDescription, id: string, provider: vscode.TerminalProfileProvider): vscode.Disposable {
		if (this._profileProviders.has(id)) {
			throw new Error(`Terminal profile provider "${id}" already registered`);
		}
		this._profileProviders.set(id, provider);
		this._proxy.$registerProfileProvider(id, extension.identifier.value);
		return new VSCodeDisposable(() => {
			this._profileProviders.delete(id);
			this._proxy.$unregisterProfileProvider(id);
		});
	}

	public registerTerminalCompletionProvider(extension: IExtensionDescription, provider: vscode.TerminalCompletionProvider<TerminalCompletionItem>, ...triggerCharacters: string[]): vscode.Disposable {
		if (this._completionProviders.has(extension.identifier.value)) {
			throw new Error(`Terminal completion provider "${extension.identifier.value}" already registered`);
		}
		this._completionProviders.set(extension.identifier.value, provider);
		this._proxy.$registerCompletionProvider(extension.identifier.value, extension.identifier.value, ...triggerCharacters);
		return new VSCodeDisposable(() => {
			this._completionProviders.delete(extension.identifier.value);
			this._proxy.$unregisterCompletionProvider(extension.identifier.value);
		});
	}

	public async $provideTerminalCompletions(id: string, options: ITerminalCompletionContextDto): Promise<TerminalCompletionListDto | undefined> {
		const token = new CancellationTokenSource().token;
		if (token.isCancellationRequested || !this.activeTerminal) {
			return undefined;
		}

		const provider = this._completionProviders.get(id);
		if (!provider) {
			return;
		}

		const completions = await provider.provideTerminalCompletions(this.activeTerminal, options, token);
		if (completions === null || completions === undefined) {
			return undefined;
		}
		const pathSeparator = !isWindows || this.activeTerminal.state?.shell === WindowsShellType.GitBash ? '/' : '\\';
		return TerminalCompletionList.from(completions, pathSeparator);
	}

	public $acceptTerminalShellType(id: number, shellType: TerminalShellType | undefined): void {
		const terminal = this.getTerminalById(id);
		if (terminal?.setShellType(shellType)) {
			this._onDidChangeTerminalState.fire(terminal.value);
		}
	}

	public registerTerminalQuickFixProvider(id: string, extensionId: string, provider: vscode.TerminalQuickFixProvider): vscode.Disposable {
		if (this._quickFixProviders.has(id)) {
			throw new Error(`Terminal quick fix provider "${id}" is already registered`);
		}
		this._quickFixProviders.set(id, provider);
		this._proxy.$registerQuickFixProvider(id, extensionId);
		return new VSCodeDisposable(() => {
			this._quickFixProviders.delete(id);
			this._proxy.$unregisterQuickFixProvider(id);
		});
	}

	public async $provideTerminalQuickFixes(id: string, matchResult: TerminalCommandMatchResultDto): Promise<(ITerminalQuickFixTerminalCommandDto | ITerminalQuickFixOpenerDto | ICommandDto)[] | ITerminalQuickFixTerminalCommandDto | ITerminalQuickFixOpenerDto | ICommandDto | undefined> {
		const token = new CancellationTokenSource().token;
		if (token.isCancellationRequested) {
			return;
		}
		const provider = this._quickFixProviders.get(id);
		if (!provider) {
			return;
		}
		const quickFixes = await provider.provideTerminalQuickFixes(matchResult, token);
		if (quickFixes === null || (Array.isArray(quickFixes) && quickFixes.length === 0)) {
			return undefined;
		}

		const store = new DisposableStore();
		this._lastQuickFixCommands.value = store;

		// Single
		if (!Array.isArray(quickFixes)) {
			return quickFixes ? TerminalQuickFix.from(quickFixes, this._extHostCommands.converter, store) : undefined;
		}

		// Many
		const result = [];
		for (const fix of quickFixes) {
			const converted = TerminalQuickFix.from(fix, this._extHostCommands.converter, store);
			if (converted) {
				result.push(converted);
			}
		}
		return result;
	}

	public async $createContributedProfileTerminal(id: string, options: ICreateContributedTerminalProfileOptions): Promise<void> {
		const token = new CancellationTokenSource().token;
		let profile = await this._profileProviders.get(id)?.provideTerminalProfile(token);
		if (token.isCancellationRequested) {
			return;
		}
		if (profile && !hasKey(profile, { options: true })) {
			profile = { options: profile };
		}

		if (!profile || !hasKey(profile, { options: true })) {
			throw new Error(`No terminal profile options provided for id "${id}"`);
		}

		if (hasKey(profile.options, { pty: true })) {
			this.createExtensionTerminal(profile.options, options);
			return;
		}
		this.createTerminalFromOptions(profile.options, options);
	}

	public registerLinkProvider(provider: vscode.TerminalLinkProvider): vscode.Disposable {
		this._linkProviders.add(provider);
		if (this._linkProviders.size === 1) {
			this._proxy.$startLinkProvider();
		}
		return new VSCodeDisposable(() => {
			this._linkProviders.delete(provider);
			if (this._linkProviders.size === 0) {
				this._proxy.$stopLinkProvider();
			}
		});
	}

	public async $provideLinks(terminalId: number, line: string): Promise<ITerminalLinkDto[]> {
		const terminal = this.getTerminalById(terminalId);
		if (!terminal) {
			return [];
		}

		// Discard any cached links the terminal has been holding, currently all links are released
		// when new links are provided.
		this._terminalLinkCache.delete(terminalId);

		const oldToken = this._terminalLinkCancellationSource.get(terminalId);
		oldToken?.dispose(true);
		const cancellationSource = new CancellationTokenSource();
		this._terminalLinkCancellationSource.set(terminalId, cancellationSource);

		const result: ITerminalLinkDto[] = [];
		const context: vscode.TerminalLinkContext = { terminal: terminal.value, line };
		const promises: vscode.ProviderResult<{ provider: vscode.TerminalLinkProvider; links: vscode.TerminalLink[] }>[] = [];

		for (const provider of this._linkProviders) {
			promises.push(Promises.withAsyncBody(async r => {
				cancellationSource.token.onCancellationRequested(() => r({ provider, links: [] }));
				const links = (await provider.provideTerminalLinks(context, cancellationSource.token)) || [];
				if (!cancellationSource.token.isCancellationRequested) {
					r({ provider, links });
				}
			}));
		}

		const provideResults = await Promise.all(promises);

		if (cancellationSource.token.isCancellationRequested) {
			return [];
		}

		const cacheLinkMap = new Map<number, ICachedLinkEntry>();
		for (const provideResult of provideResults) {
			if (provideResult && provideResult.links.length > 0) {
				result.push(...provideResult.links.map(providerLink => {
					const link = {
						id: nextLinkId++,
						startIndex: providerLink.startIndex,
						length: providerLink.length,
						label: providerLink.tooltip
					};
					cacheLinkMap.set(link.id, {
						provider: provideResult.provider,
						link: providerLink
					});
					return link;
				}));
			}
		}

		this._terminalLinkCache.set(terminalId, cacheLinkMap);

		return result;
	}

	$activateLink(terminalId: number, linkId: number): void {
		const cachedLink = this._terminalLinkCache.get(terminalId)?.get(linkId);
		if (!cachedLink) {
			return;
		}
		cachedLink.provider.handleTerminalLink(cachedLink.link);
	}

	private _onProcessExit(id: number, exitCode: number | undefined): void {
		this._bufferer.stopBuffering(id);

		// Remove process reference
		this._terminalProcesses.delete(id);
		delete this._extensionTerminalAwaitingStart[id];

		// Clean up process disposables
		const processDiposable = this._terminalProcessDisposables[id];
		if (processDiposable) {
			processDiposable.dispose();
			delete this._terminalProcessDisposables[id];
		}
		// Send exit event to main side
		this._proxy.$sendProcessExit(id, exitCode);
	}

	public getTerminalById(id: number): ExtHostTerminal | null {
		return this._getTerminalObjectById(this._terminals, id);
	}

	public getTerminalIdByApiObject(terminal: vscode.Terminal): number | null {
		const index = this._terminals.findIndex(item => {
			return item.value === terminal;
		});
		return index >= 0 ? index : null;
	}

	private _getTerminalObjectById<T extends ExtHostTerminal>(array: T[], id: number): T | null {
		const index = this._getTerminalObjectIndexById(array, id);
		return index !== null ? array[index] : null;
	}

	private _getTerminalObjectIndexById<T extends ExtHostTerminal>(array: T[], id: ExtHostTerminalIdentifier): number | null {
		const index = array.findIndex(item => {
			return item._id === id;
		});
		return index >= 0 ? index : null;
	}

	public getEnvironmentVariableCollection(extension: IExtensionDescription): IEnvironmentVariableCollection {
		let collection = this._environmentVariableCollections.get(extension.identifier.value);
		if (!collection) {
			collection = this._register(new UnifiedEnvironmentVariableCollection());
			this._setEnvironmentVariableCollection(extension.identifier.value, collection);
		}
		return collection.getScopedEnvironmentVariableCollection(undefined);
	}

	private _syncEnvironmentVariableCollection(extensionIdentifier: string, collection: UnifiedEnvironmentVariableCollection): void {
		const serialized = serializeEnvironmentVariableCollection(collection.map);
		const serializedDescription = serializeEnvironmentDescriptionMap(collection.descriptionMap);
		this._proxy.$setEnvironmentVariableCollection(extensionIdentifier, collection.persistent, serialized.length === 0 ? undefined : serialized, serializedDescription);
	}

	public $initEnvironmentVariableCollections(collections: [string, ISerializableEnvironmentVariableCollection][]): void {
		collections.forEach(entry => {
			const extensionIdentifier = entry[0];
			const collection = this._register(new UnifiedEnvironmentVariableCollection(entry[1]));
			this._setEnvironmentVariableCollection(extensionIdentifier, collection);
		});
	}

	public $acceptDefaultProfile(profile: ITerminalProfile, automationProfile: ITerminalProfile): void {
		const oldProfile = this._defaultProfile;
		this._defaultProfile = profile;
		this._defaultAutomationProfile = automationProfile;
		if (oldProfile?.path !== profile.path) {
			this._onDidChangeShell.fire(profile.path);
		}
	}

	private _setEnvironmentVariableCollection(extensionIdentifier: string, collection: UnifiedEnvironmentVariableCollection): void {
		this._environmentVariableCollections.set(extensionIdentifier, collection);
		this._register(collection.onDidChangeCollection(() => {
			// When any collection value changes send this immediately, this is done to ensure
			// following calls to createTerminal will be created with the new environment. It will
			// result in more noise by sending multiple updates when called but collections are
			// expected to be small.
			this._syncEnvironmentVariableCollection(extensionIdentifier, collection);
		}));
	}
}

/**
 * Unified environment variable collection carrying information for all scopes, for a specific extension.
 */
class UnifiedEnvironmentVariableCollection extends Disposable {
	readonly map: Map<string, IEnvironmentVariableMutator> = new Map();
	private readonly scopedCollections: Map<string, ScopedEnvironmentVariableCollection> = new Map();
	readonly descriptionMap: Map<string, IEnvironmentVariableCollectionDescription> = new Map();
	private _persistent: boolean = true;

	public get persistent(): boolean { return this._persistent; }
	public set persistent(value: boolean) {
		this._persistent = value;
		this._onDidChangeCollection.fire();
	}

	protected readonly _onDidChangeCollection: Emitter<void> = new Emitter<void>();
	get onDidChangeCollection(): Event<void> { return this._onDidChangeCollection && this._onDidChangeCollection.event; }

	constructor(
		serialized?: ISerializableEnvironmentVariableCollection
	) {
		super();
		this.map = new Map(serialized);
	}

	getScopedEnvironmentVariableCollection(scope: vscode.EnvironmentVariableScope | undefined): IEnvironmentVariableCollection {
		const scopedCollectionKey = this.getScopeKey(scope);
		let scopedCollection = this.scopedCollections.get(scopedCollectionKey);
		if (!scopedCollection) {
			scopedCollection = new ScopedEnvironmentVariableCollection(this, scope);
			this.scopedCollections.set(scopedCollectionKey, scopedCollection);
			this._register(scopedCollection.onDidChangeCollection(() => this._onDidChangeCollection.fire()));
		}
		return scopedCollection;
	}

	replace(variable: string, value: string, options: vscode.EnvironmentVariableMutatorOptions | undefined, scope: vscode.EnvironmentVariableScope | undefined): void {
		this._setIfDiffers(variable, { value, type: EnvironmentVariableMutatorType.Replace, options: options ?? { applyAtProcessCreation: true }, scope });
	}

	append(variable: string, value: string, options: vscode.EnvironmentVariableMutatorOptions | undefined, scope: vscode.EnvironmentVariableScope | undefined): void {
		this._setIfDiffers(variable, { value, type: EnvironmentVariableMutatorType.Append, options: options ?? { applyAtProcessCreation: true }, scope });
	}

	prepend(variable: string, value: string, options: vscode.EnvironmentVariableMutatorOptions | undefined, scope: vscode.EnvironmentVariableScope | undefined): void {
		this._setIfDiffers(variable, { value, type: EnvironmentVariableMutatorType.Prepend, options: options ?? { applyAtProcessCreation: true }, scope });
	}

	private _setIfDiffers(variable: string, mutator: vscode.EnvironmentVariableMutator & { scope: vscode.EnvironmentVariableScope | undefined }): void {
		if (mutator.options && mutator.options.applyAtProcessCreation === false && !mutator.options.applyAtShellIntegration) {
			throw new Error('EnvironmentVariableMutatorOptions must apply at either process creation or shell integration');
		}
		const key = this.getKey(variable, mutator.scope);
		const current = this.map.get(key);
		const newOptions = mutator.options ? {
			applyAtProcessCreation: mutator.options.applyAtProcessCreation ?? false,
			applyAtShellIntegration: mutator.options.applyAtShellIntegration ?? false,
		} : {
			applyAtProcessCreation: true
		};
		if (
			!current ||
			current.value !== mutator.value ||
			current.type !== mutator.type ||
			current.options?.applyAtProcessCreation !== newOptions.applyAtProcessCreation ||
			current.options?.applyAtShellIntegration !== newOptions.applyAtShellIntegration ||
			current.scope?.workspaceFolder?.index !== mutator.scope?.workspaceFolder?.index
		) {
			const key = this.getKey(variable, mutator.scope);
			const value: IEnvironmentVariableMutator = {
				variable,
				...mutator,
				options: newOptions
			};
			this.map.set(key, value);
			this._onDidChangeCollection.fire();
		}
	}

	get(variable: string, scope: vscode.EnvironmentVariableScope | undefined): vscode.EnvironmentVariableMutator | undefined {
		const key = this.getKey(variable, scope);
		const value = this.map.get(key);
		// TODO: Set options to defaults if needed
		return value ? convertMutator(value) : undefined;
	}

	private getKey(variable: string, scope: vscode.EnvironmentVariableScope | undefined) {
		const scopeKey = this.getScopeKey(scope);
		return scopeKey.length ? `${variable}:::${scopeKey}` : variable;
	}

	private getScopeKey(scope: vscode.EnvironmentVariableScope | undefined): string {
		return this.getWorkspaceKey(scope?.workspaceFolder) ?? '';
	}

	private getWorkspaceKey(workspaceFolder: vscode.WorkspaceFolder | undefined): string | undefined {
		return workspaceFolder ? workspaceFolder.uri.toString() : undefined;
	}

	public getVariableMap(scope: vscode.EnvironmentVariableScope | undefined): Map<string, vscode.EnvironmentVariableMutator> {
		const map = new Map<string, vscode.EnvironmentVariableMutator>();
		for (const [_, value] of this.map) {
			if (this.getScopeKey(value.scope) === this.getScopeKey(scope)) {
				map.set(value.variable, convertMutator(value));
			}
		}
		return map;
	}

	delete(variable: string, scope: vscode.EnvironmentVariableScope | undefined): void {
		const key = this.getKey(variable, scope);
		this.map.delete(key);
		this._onDidChangeCollection.fire();
	}

	clear(scope: vscode.EnvironmentVariableScope | undefined): void {
		if (scope?.workspaceFolder) {
			for (const [key, mutator] of this.map) {
				if (mutator.scope?.workspaceFolder?.index === scope.workspaceFolder.index) {
					this.map.delete(key);
				}
			}
			this.clearDescription(scope);
		} else {
			this.map.clear();
			this.descriptionMap.clear();
		}
		this._onDidChangeCollection.fire();
	}

	setDescription(description: string | vscode.MarkdownString | undefined, scope: vscode.EnvironmentVariableScope | undefined): void {
		const key = this.getScopeKey(scope);
		const current = this.descriptionMap.get(key);
		if (!current || current.description !== description) {
			let descriptionStr: string | undefined;
			if (typeof description === 'string') {
				descriptionStr = description;
			} else {
				// Only take the description before the first `\n\n`, so that the description doesn't mess up the UI
				descriptionStr = description?.value.split('\n\n')[0];
			}
			const value: IEnvironmentVariableCollectionDescription = { description: descriptionStr, scope };
			this.descriptionMap.set(key, value);
			this._onDidChangeCollection.fire();
		}
	}

	public getDescription(scope: vscode.EnvironmentVariableScope | undefined): string | vscode.MarkdownString | undefined {
		const key = this.getScopeKey(scope);
		return this.descriptionMap.get(key)?.description;
	}

	private clearDescription(scope: vscode.EnvironmentVariableScope | undefined): void {
		const key = this.getScopeKey(scope);
		this.descriptionMap.delete(key);
	}
}

class ScopedEnvironmentVariableCollection implements IEnvironmentVariableCollection {
	public get persistent(): boolean { return this.collection.persistent; }
	public set persistent(value: boolean) {
		this.collection.persistent = value;
	}

	protected readonly _onDidChangeCollection = new Emitter<void>();
	get onDidChangeCollection(): Event<void> { return this._onDidChangeCollection && this._onDidChangeCollection.event; }

	constructor(
		private readonly collection: UnifiedEnvironmentVariableCollection,
		private readonly scope: vscode.EnvironmentVariableScope | undefined
	) {
	}

	getScoped(scope: vscode.EnvironmentVariableScope | undefined) {
		return this.collection.getScopedEnvironmentVariableCollection(scope);
	}

	replace(variable: string, value: string, options?: vscode.EnvironmentVariableMutatorOptions | undefined): void {
		this.collection.replace(variable, value, options, this.scope);
	}

	append(variable: string, value: string, options?: vscode.EnvironmentVariableMutatorOptions | undefined): void {
		this.collection.append(variable, value, options, this.scope);
	}

	prepend(variable: string, value: string, options?: vscode.EnvironmentVariableMutatorOptions | undefined): void {
		this.collection.prepend(variable, value, options, this.scope);
	}

	get(variable: string): vscode.EnvironmentVariableMutator | undefined {
		return this.collection.get(variable, this.scope);
	}

	forEach(callback: (variable: string, mutator: vscode.EnvironmentVariableMutator, collection: vscode.EnvironmentVariableCollection) => any, thisArg?: any): void {
		this.collection.getVariableMap(this.scope).forEach((value, variable) => callback.call(thisArg, variable, value, this), this.scope);
	}

	[Symbol.iterator](): IterableIterator<[variable: string, mutator: vscode.EnvironmentVariableMutator]> {
		return this.collection.getVariableMap(this.scope).entries();
	}

	delete(variable: string): void {
		this.collection.delete(variable, this.scope);
		this._onDidChangeCollection.fire(undefined);
	}

	clear(): void {
		this.collection.clear(this.scope);
	}

	set description(description: string | vscode.MarkdownString | undefined) {
		this.collection.setDescription(description, this.scope);
	}

	get description(): string | vscode.MarkdownString | undefined {
		return this.collection.getDescription(this.scope);
	}
}

export class WorkerExtHostTerminalService extends BaseExtHostTerminalService {
	constructor(
		@IExtHostCommands extHostCommands: IExtHostCommands,
		@IExtHostRpcService extHostRpc: IExtHostRpcService
	) {
		super(false, extHostCommands, extHostRpc);
	}

	public createTerminal(name?: string, shellPath?: string, shellArgs?: string[] | string): vscode.Terminal {
		throw new NotSupportedError();
	}

	public createTerminalFromOptions(options: vscode.TerminalOptions, internalOptions?: ITerminalInternalOptions): vscode.Terminal {
		throw new NotSupportedError();
	}
}

function asTerminalIcon(iconPath?: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon): TerminalIcon | undefined {
	if (!iconPath || typeof iconPath === 'string') {
		return undefined;
	}

	if (!hasKey(iconPath, { id: true })) {
		return iconPath;
	}

	return {
		id: iconPath.id,
		color: iconPath.color as ThemeColor
	};
}

function asTerminalColor(color?: vscode.ThemeColor): ThemeColor | undefined {
	return ThemeColor.isThemeColor(color) ? color as ThemeColor : undefined;
}

function convertMutator(mutator: IEnvironmentVariableMutator): vscode.EnvironmentVariableMutator {
	const newMutator = { ...mutator };
	delete newMutator.scope;
	newMutator.options = newMutator.options ?? undefined;
	// eslint-disable-next-line local/code-no-any-casts
	delete (newMutator as any).variable;
	return newMutator as vscode.EnvironmentVariableMutator;
}
