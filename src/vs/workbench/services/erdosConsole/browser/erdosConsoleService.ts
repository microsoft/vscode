/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { IViewsService } from '../../views/common/viewsService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ThrottledEmitter } from './classes/throttledEmitter.js';
import { 
	RuntimeItem, RuntimeItemTrace, RuntimeItemExited, RuntimeItemStarted, RuntimeItemStartup, 
	RuntimeItemOffline, RuntimeItemReconnected, RuntimeItemPendingInput, RuntimeItemRestartButton,
	RuntimeItemStartupFailure, RuntimeItemActivity, RuntimeItemStarting 
} from './classes/runtimeItems.js';
import { 
	ActivityItemPrompt, ActivityItemPromptState, ActivityItemInput, ActivityItemInputState,
	ActivityItemStream, ActivityItemStreamType, ActivityItemOutputPlot, ActivityItemOutputHtml,
	ActivityItemErrorMessage, ActivityItemOutputMessage, ActivityItem, ActivityItemOutput
} from './classes/activityItems.js';
import { 
	IErdosConsoleInstance, IErdosConsoleService, ERDOS_CONSOLE_VIEW_ID, 
	ErdosConsoleState, SessionAttachMode 
} from './interfaces/erdosConsoleService.js';
import { 
	ILanguageRuntimeExit, ILanguageRuntimeMessage, ILanguageRuntimeMessageOutput, 
	ILanguageRuntimeMessageOutputData, ILanguageRuntimeMessageUpdateOutput, ILanguageRuntimeMetadata, 
	LanguageRuntimeSessionMode, RuntimeCodeExecutionMode, RuntimeCodeFragmentStatus, 
	RuntimeErrorBehavior, RuntimeExitReason, RuntimeOnlineState, RuntimeOutputKind, RuntimeState, 
	formatLanguageRuntimeMetadata, formatLanguageRuntimeSession 
} from '../../languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession, IRuntimeSessionMetadata, IRuntimeSessionService, RuntimeStartMode, IRuntimeSessionWillStartEvent, ILanguageRuntimeSessionStateEvent } from '../../runtimeSession/common/runtimeSessionService.js';
import type { IRuntimeSessionService as IRuntimeSessionServiceType } from '../../runtimeSession/common/runtimeSessionTypes.js';
import { UiFrontendEvent } from '../../languageRuntime/common/erdosUiComm.js';
import { IRuntimeStartupService, ISessionRestoreFailedEvent, SerializedSessionMetadata } from '../../runtimeStartup/common/runtimeStartupService.js';
import { Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { CodeAttributionSource, IConsoleCodeAttribution, ILanguageRuntimeCodeExecutedEvent } from '../common/erdosConsoleCodeExecution.js';
import { EDITOR_FONT_DEFAULTS } from '../../../../editor/common/config/editorOptions.js';

const ON_DID_CHANGE_RUNTIME_ITEMS_THROTTLE_THRESHOLD = 20;
const ON_DID_CHANGE_RUNTIME_ITEMS_THROTTLE_INTERVAL = 50;

const TRACE_OUTPUT_MAX_LENGTH = 1000;

const formatTimestamp = (timestamp: Date) => {
	const toTwoDigits = (v: number) => v < 10 ? `0${v}` : v;
	const toFourDigits = (v: number) => v < 10 ? `000${v}` : v < 1000 ? `0${v}` : v;
	return `${toTwoDigits(timestamp.getHours())}:${toTwoDigits(timestamp.getMinutes())}:${toTwoDigits(timestamp.getSeconds())}.${toFourDigits(timestamp.getMilliseconds())}`;
};

const formatCallbackTrace = (callback: string, languageRuntimeMessage: ILanguageRuntimeMessage) =>
	`${callback} (ID: ${languageRuntimeMessage.id} Parent ID: ${languageRuntimeMessage.parent_id} When: ${formatTimestamp(new Date(languageRuntimeMessage.when))})`;

const formatOutputMessage = (message: ILanguageRuntimeMessageOutput | ILanguageRuntimeMessageUpdateOutput) =>
	message.output_id ? `Output ID: ${message.output_id}` : '' + formatOutputData(message.data);

const formatOutputData = (data: ILanguageRuntimeMessageOutputData) => {
	let result = '\nOutput:';
	if (!data['text/plain']) {
		result += ' None';
	} else {
		result += '\n' + data['text/plain'];
	}
	return result;
};

const formatTraceback = (traceback: string[]) => {
	let result = '\nTraceback:';
	if (!traceback.length) {
		result += ' None';
	} else {
		traceback.forEach((tracebackEntry, index) => result += `\n[${index + 1}]: ${tracebackEntry}`);
	}
	return result;
};

const sanitizeTraceOutput = (traceOutput: string) => {
	traceOutput = traceOutput.slice(0, TRACE_OUTPUT_MAX_LENGTH);
	traceOutput = traceOutput.replaceAll('\t', '[HT]');
	traceOutput = traceOutput.replaceAll('\n', '[LF]');
	traceOutput = traceOutput.replaceAll('\r', '[CR]');
	traceOutput = traceOutput.replaceAll('\x9B', 'CSI');
	traceOutput = traceOutput.replaceAll('\x1b', 'ESC');
	traceOutput = traceOutput.replaceAll('\x9B', 'CSI');

	if (traceOutput.length > TRACE_OUTPUT_MAX_LENGTH) {
		traceOutput += '...';
	}

	return traceOutput;
};

const formattedLength = (length: number) => {
	if (length < 1000) {
		return `${length} chars`;
	}
	if (length < 1000 * 1000) {
		return `${(length / 1000).toFixed(1)} KB`;
	}
	return `${(length / 1000 / 1000).toFixed(1)} MB`;
};

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

const consoleServiceConfigurationBaseNode = Object.freeze<IConfigurationNode>({
	id: 'console',
	order: 100,
	type: 'object',
	title: localize('consoleConfigurationTitle', "Console"),
});

export const scrollbackSizeSettingId = 'console.scrollbackSize';
configurationRegistry.registerConfiguration({
	...consoleServiceConfigurationBaseNode,
	properties: {
		'console.fontFamily': {
			type: 'string',
			'default': EDITOR_FONT_DEFAULTS.fontFamily,
			description: localize('console.fontFamily', "Controls the font family."),
		},
		'console.fontLigatures': {
			type: 'boolean',
			default: false,
			description: localize('console.fontLigatures.markdownDescription', "Enable font ligatures ('calt' and 'liga' font features)."),
		},
		'console.fontSize': {
			type: 'number',
			minimum: 6,
			maximum: 100,
			default: EDITOR_FONT_DEFAULTS.fontSize,
			description: localize('console.fontSize', "Controls the font size in pixels."),
		},
		'console.fontVariations': {
			type: 'boolean',
			default: false,
			description: localize('console.fontVariations', "Enable the translation from font-weight to font-variation-settings."),
		},
		'console.fontWeight': {
			type: 'string',
			enum: ['normal', 'bold'],
			enumDescriptions: [
				localize('console.fontWeight.normal', "Normal font weight."),
				localize('console.fontWeight.bold', "Bold font weight.")
			],
			default: EDITOR_FONT_DEFAULTS.fontWeight,
			description: localize('console.fontWeight', "Controls the font weight."),
		},
		'console.letterSpacing': {
			type: 'number',
			minimum: -5,
			maximum: 20,
			default: EDITOR_FONT_DEFAULTS.letterSpacing,
			markdownDescription: localize('console.letterSpacing', "Controls the letter spacing in pixels."),
		},
		'console.lineHeight': {
			type: 'number',
			minimum: 0,
			maximum: 150,
			default: EDITOR_FONT_DEFAULTS.lineHeight,
			description: localize('console.lineHeight', "Controls the line height."),
			markdownDescription: localize('console.lineHeight2', "Controls the line height. \n - Use 0 to automatically compute the line height from the font size.\n - Values between 0 and 8 will be used as a multiplier with the font size.\n - Values greater than or equal to 8 will be used as effective values."),
		},
		'console.scrollbackSize': {
			type: 'number',
			'minimum': 500,
			'maximum': 5000,
			'default': 1000,
			markdownDescription: localize('console.scrollbackSize', "The number of console output items to display."),
		}
	}
});

export class ErdosConsoleService extends Disposable implements IErdosConsoleService {
	private readonly _erdosConsoleInstancesBySessionId = new Map<string, ErdosConsoleInstance>();
	private _activeErdosConsoleInstance?: IErdosConsoleInstance;
	private readonly _onDidStartErdosConsoleInstanceEmitter = this._register(new Emitter<IErdosConsoleInstance>);
	private readonly _onDidDeleteErdosConsoleInstanceEmitter = this._register(new Emitter<IErdosConsoleInstance>);
	private readonly _onDidChangeActiveErdosConsoleInstanceEmitter = this._register(new Emitter<IErdosConsoleInstance | undefined>);
	private readonly _onDidChangeConsoleWidthEmitter = this._register(new Emitter<number>());
	private readonly _onDidExecuteCodeEmitter = this._register(new Emitter<ILanguageRuntimeCodeExecutedEvent>);
	private _consoleWidthDebounceTimer: Timeout | undefined;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IRuntimeSessionService private readonly _runtimeSessionService: IRuntimeSessionServiceType,
		@IRuntimeStartupService private readonly _runtimeStartupService: IRuntimeStartupService,
		@IViewsService private readonly _viewsService: IViewsService,
	) {
		super();

		this._runtimeStartupService.getRestoredSessions().then(restoredSessions => {
			let first = true;
			const hasActiveSession = !!this.activeErdosConsoleInstance;
			restoredSessions.forEach((session: SerializedSessionMetadata) => {
				const activate = first && !hasActiveSession;
				if (session.metadata.sessionMode === LanguageRuntimeSessionMode.Console) {
					first = false;
					try {
						this.restoreErdosConsole(session, activate);
					} catch (err) {
						this._logService.error(
							`Error restoring ${session.metadata.sessionId}: ${err}`);
					}
				}
			});
		}).catch((err: any) => {
			this._logService.error('Error restoring Erdos console sessions:', err);
		});

		let first = true;
		this._runtimeSessionService.activeSessions.forEach((session: ILanguageRuntimeSession) => {
			if (session.metadata.sessionMode === LanguageRuntimeSessionMode.Console) {
				let activate = false;
				if (this._runtimeSessionService.foregroundSession &&
					session.sessionId === this._runtimeSessionService.foregroundSession.sessionId) {
					activate = true;
				}

				if (first && !this._runtimeSessionService.foregroundSession) {
					activate = true;
				}

				this.startErdosConsoleInstance(session, SessionAttachMode.Connected, activate);
				first = false;
			}
		});

		this._register(this._runtimeSessionService.onWillStartSession((e: IRuntimeSessionWillStartEvent) => {
			if (e.session.metadata.sessionMode === LanguageRuntimeSessionMode.Console) {
			} else if (e.session.metadata.sessionMode === LanguageRuntimeSessionMode.Notebook) {
				const consoleConnectionEnabled = this._configurationService.getValue<boolean>('erdosNotebook.consoleConnection.enabled') ?? true;
				if (!consoleConnectionEnabled) {
					return;
				}
			} else {
				return;
			}

			let attachMode: SessionAttachMode;
			if (e.startMode === RuntimeStartMode.Starting) {
				attachMode = SessionAttachMode.Starting;
			} else if (e.startMode === RuntimeStartMode.Restarting) {
				attachMode = SessionAttachMode.Restarting;
			} else if (e.startMode === RuntimeStartMode.Reconnecting) {
				attachMode = SessionAttachMode.Reconnecting;
			} else if (e.startMode === RuntimeStartMode.Switching) {
				attachMode = SessionAttachMode.Switching;
			} else {
				throw new Error(`Unexpected runtime start mode: ${e.startMode}`);
			}

			const existingInstance = this._erdosConsoleInstancesBySessionId.get(
				e.session.sessionId);
			if (existingInstance) {
				existingInstance.attachRuntimeSession(e.session, attachMode);
				return;
			}

			const erdosConsoleInstance = this._erdosConsoleInstancesBySessionId.get(e.session.sessionId);

			if (erdosConsoleInstance) {
				this._erdosConsoleInstancesBySessionId.delete(erdosConsoleInstance.sessionId);
				erdosConsoleInstance.attachRuntimeSession(e.session, attachMode);
				this._erdosConsoleInstancesBySessionId.set(e.session.sessionId, erdosConsoleInstance);
			} else {
				this.startErdosConsoleInstance(e.session, attachMode, e.activate);
			}
		}));

		this._register(this._runtimeSessionService.onDidStartRuntime((session: ILanguageRuntimeSession) => {
			const erdosConsoleInstance = this._erdosConsoleInstancesBySessionId.get(session.sessionId);

			if (erdosConsoleInstance) {
				erdosConsoleInstance.setState(ErdosConsoleState.Ready);
			}

			if (session.metadata.sessionMode === LanguageRuntimeSessionMode.Notebook) {
				const consoleConnectionEnabled = this._configurationService.getValue<boolean>('erdosNotebook.consoleConnection.enabled') ?? true;
				if (consoleConnectionEnabled) {
					const existingConsoleSession = this._runtimeSessionService.getConsoleSessionForLanguage(session.runtimeMetadata.languageId);
					if (existingConsoleSession && existingConsoleSession.sessionId !== session.sessionId) {
						const existingInstance = this._erdosConsoleInstancesBySessionId.get(existingConsoleSession.sessionId);
						if (existingInstance) {
						}
					}
				}
			}
		}));

		this._register(this._runtimeSessionService.onDidFailStartRuntime((session: ILanguageRuntimeSession) => {
			const erdosConsoleInstance = this._erdosConsoleInstancesBySessionId.get(session.sessionId);

			if (erdosConsoleInstance) {
				erdosConsoleInstance.setState(ErdosConsoleState.Exited);
			}
		}));

		this._register(this._runtimeStartupService.onSessionRestoreFailure((evt: ISessionRestoreFailedEvent) => {
			const erdosConsoleInstance =
				this._erdosConsoleInstancesBySessionId.get(evt.sessionId);
			if (erdosConsoleInstance) {
				erdosConsoleInstance.showRestoreFailure(evt);
			}
		}));

		this._register(this._runtimeSessionService.onDidChangeRuntimeState((languageRuntimeStateEvent: ILanguageRuntimeSessionStateEvent) => {
			const erdosConsoleInstance = this._erdosConsoleInstancesBySessionId.get(languageRuntimeStateEvent.session_id);
			if (!erdosConsoleInstance) {
				return;
			}

			switch (languageRuntimeStateEvent.new_state) {
				case RuntimeState.Uninitialized:
				case RuntimeState.Initializing:
					break;

				case RuntimeState.Starting:
					erdosConsoleInstance.setState(ErdosConsoleState.Starting);
					break;

				case RuntimeState.Ready:
					erdosConsoleInstance.setState(ErdosConsoleState.Ready);
					break;

				case RuntimeState.Offline:
					erdosConsoleInstance.setState(ErdosConsoleState.Offline);
					break;

				case RuntimeState.Exiting:
					erdosConsoleInstance.setState(ErdosConsoleState.Exiting);
					break;

				case RuntimeState.Exited:
					erdosConsoleInstance.setState(ErdosConsoleState.Exited);
					break;
			}
		}));

		this._register(this._runtimeSessionService.onDidChangeForegroundSession((session: ILanguageRuntimeSession | undefined) => {
			if (!session) {
				this.setActiveErdosConsoleInstance();
			} else {
				const erdosConsoleInstance = this._erdosConsoleInstancesBySessionId.get(
					session.sessionId);
				if (erdosConsoleInstance) {
					this.setActiveErdosConsoleInstance(erdosConsoleInstance);
				} else {
					this._logService.error(
						`Cannot show Console: ${formatLanguageRuntimeSession(session)} ` +
						`became active, but a REPL instance for it is not running.`);
				}
			}
		}));

		this._register(this._runtimeSessionService.onDidDeleteRuntimeSession((sessionId: string) => {
			this.deleteErdosConsoleSession(sessionId);
		}));
	}

	declare readonly _serviceBrand: undefined;

	readonly onDidStartErdosConsoleInstance = this._onDidStartErdosConsoleInstanceEmitter.event;

	readonly onDidDeleteErdosConsoleInstance = this._onDidDeleteErdosConsoleInstanceEmitter.event;

	readonly onDidChangeActiveErdosConsoleInstance = this._onDidChangeActiveErdosConsoleInstanceEmitter.event;

	readonly onDidChangeConsoleWidth = this._onDidChangeConsoleWidthEmitter.event;

	readonly onDidExecuteCode = this._onDidExecuteCodeEmitter.event;

	get erdosConsoleInstances(): IErdosConsoleInstance[] {
		return Array.from(this._erdosConsoleInstancesBySessionId.values());
	}

	get activeErdosConsoleInstance(): IErdosConsoleInstance | undefined {
		return this._activeErdosConsoleInstance;
	}

	get activeCodeEditor(): ICodeEditor | undefined {
		return this._activeErdosConsoleInstance?.codeEditor;
	}

	initialize() {
	}

	private restoreErdosConsole(session: SerializedSessionMetadata, activate: boolean) {
		const console = this.createErdosConsoleInstance(
			session.sessionName,
			session.metadata,
			session.runtimeMetadata,
			activate
		);

		console.initialWorkingDirectory = session.workingDirectory;
	}

	async executeCode(languageId: string,
		code: string,
		attribution: IConsoleCodeAttribution,
		focus: boolean,
		allowIncomplete?: boolean,
		mode?: RuntimeCodeExecutionMode,
		errorBehavior?: RuntimeErrorBehavior,
		executionId?: string): Promise<string> {
		await this._viewsService.openView(ERDOS_CONSOLE_VIEW_ID, false);

		const runningLanguageRuntimeSessions = this._runtimeSessionService.activeSessions.filter(
			(session: ILanguageRuntimeSession) => session.runtimeMetadata.languageId === languageId);

		if (!runningLanguageRuntimeSessions.length) {
			const languageRuntime = this._runtimeStartupService.getPreferredRuntime(languageId);
			if (languageRuntime) {
				this._logService.trace(`Language runtime ` +
					`${formatLanguageRuntimeMetadata(languageRuntime)} automatically starting`);
				await this._runtimeSessionService.startNewRuntimeSession(
					languageRuntime.runtimeId,
					languageRuntime.runtimeName,
					LanguageRuntimeSessionMode.Console,
					undefined,
					`User executed code in language ${languageId}, and no running runtime session was found ` +
					`for the language.`,
					RuntimeStartMode.Starting,
					true
				);
			} else {
				throw new Error(
					`Cannot execute code because there is no registered runtime for the '${languageId}' language.`);
			}
		}

		let erdosConsoleInstance: ErdosConsoleInstance | undefined;
		if (this._activeErdosConsoleInstance?.runtimeMetadata.languageId === languageId) {
			erdosConsoleInstance = this._erdosConsoleInstancesBySessionId.get(
				this._activeErdosConsoleInstance?.sessionId);
		} else {
			erdosConsoleInstance = Array.from(this._erdosConsoleInstancesBySessionId.values())
				.sort((a, b) => b.sessionMetadata.createdTimestamp - a.sessionMetadata.createdTimestamp)
				.find(consoleInstance => {
					return consoleInstance.runtimeMetadata.languageId === languageId &&
						consoleInstance.state === ErdosConsoleState.Ready;
				});
		}

		if (!erdosConsoleInstance) {
			throw new Error(
				`Could not find or create console for language ID ${languageId} ` +
				`(attempting to execute ${code})`);
		}

		if (erdosConsoleInstance !== this._activeErdosConsoleInstance) {
			this.setActiveErdosConsoleInstance(erdosConsoleInstance);

			this._runtimeSessionService.foregroundSession = erdosConsoleInstance.session;
		}

		if (focus) {
			erdosConsoleInstance.focusInput();
		}

		await erdosConsoleInstance.enqueueCode(code, attribution, allowIncomplete, mode, errorBehavior, executionId);
		return Promise.resolve(erdosConsoleInstance.sessionId);
	}

	private startErdosConsoleInstance(
		session: ILanguageRuntimeSession,
		attachMode: SessionAttachMode,
		activate: boolean
	): IErdosConsoleInstance {
		const instance = this.createErdosConsoleInstance(
			session.dynState.sessionName,
			session.metadata,
			session.runtimeMetadata,
			activate
		);

		instance.attachRuntimeSession(session, attachMode);
		return instance;
	}

	private createErdosConsoleInstance(
		sessionName: string,
		sessionMetadata: IRuntimeSessionMetadata,
		runtimeMetadata: ILanguageRuntimeMetadata,
		activate: boolean): IErdosConsoleInstance {
		const erdosConsoleInstance = this._register(this._instantiationService.createInstance(
			ErdosConsoleInstance,
			sessionName,
			sessionMetadata,
			runtimeMetadata,
		));

		this._erdosConsoleInstancesBySessionId.set(
			sessionMetadata.sessionId,
			erdosConsoleInstance
		);

		this._onDidStartErdosConsoleInstanceEmitter.fire(erdosConsoleInstance);

		if (activate) {
			this._activeErdosConsoleInstance = erdosConsoleInstance;

			this._onDidChangeActiveErdosConsoleInstanceEmitter.fire(erdosConsoleInstance);
		}

		this._register(erdosConsoleInstance.onDidChangeWidthInChars(width => {
			this.onConsoleWidthChange(width);
		}));

		this._register(erdosConsoleInstance.onDidExecuteCode(codeExecution => {
			this._onDidExecuteCodeEmitter.fire(codeExecution);
		}));

		return erdosConsoleInstance;
	}

	getConsoleWidth(): number {
		if (this._activeErdosConsoleInstance) {
			return this._activeErdosConsoleInstance.getWidthInChars();
		}
		throw new Error('No active Erdos console instance; cannot get width.');
	}

	private onConsoleWidthChange(newWidth: number) {
		if (this._consoleWidthDebounceTimer) {
			clearTimeout(this._consoleWidthDebounceTimer);
		}

		this._consoleWidthDebounceTimer = setTimeout(() => {
			this._onDidChangeConsoleWidthEmitter.fire(newWidth);
		}, 500);
	}

	setActiveErdosConsoleSession(sessionId: string): void {
		const consoleInstance = this._erdosConsoleInstancesBySessionId.get(sessionId);
		if (consoleInstance) {
			this.setActiveErdosConsoleInstance(consoleInstance);
		}
	}

	deleteErdosConsoleSession(sessionId: string): void {
		const consoleInstance = this._erdosConsoleInstancesBySessionId.get(sessionId);
		if (!consoleInstance) {
			return;
		}

		let runtimeSession = this._runtimeSessionService.getConsoleSessionForRuntime(
			consoleInstance.runtimeMetadata.runtimeId
		);
		if (!runtimeSession) {
			const sessions = Array.from(this._erdosConsoleInstancesBySessionId.values());
			const currentIndex = sessions.indexOf(consoleInstance);
			if (currentIndex !== -1) {
				const nextSession = sessions[currentIndex + 1] || sessions[currentIndex - 1];
				runtimeSession = nextSession?.session;
			}
		}
		this._runtimeSessionService.foregroundSession = runtimeSession;
		this._erdosConsoleInstancesBySessionId.delete(sessionId);

		consoleInstance.dispose();

		this._onDidDeleteErdosConsoleInstanceEmitter.fire(consoleInstance);
	}

	private setActiveErdosConsoleInstance(erdosConsoleInstance?: IErdosConsoleInstance) {
		this._activeErdosConsoleInstance = erdosConsoleInstance;
		this._onDidChangeActiveErdosConsoleInstanceEmitter.fire(erdosConsoleInstance);
	}
}

class ErdosConsoleInstance extends Disposable implements IErdosConsoleInstance {
	private _pendingExecutionIds: Map<string, string> = new Map<string, string>();
	private _externalExecutionIds: Set<string> = new Set<string>();
	private _session: ILanguageRuntimeSession | undefined;
	private _initialSessionName: string;
	private readonly _runtimeDisposableStore = new DisposableStore();
	private _runtimeState: RuntimeState = RuntimeState.Uninitialized;
	private _runtimeAttached = false;
	private _state = ErdosConsoleState.Uninitialized;
	private _trace = false;
	private _wordWrap = true;
	private _runtimeItemPendingInput?: RuntimeItemPendingInput;
	private _pendingInputState: 'Idle' | 'Processing' | 'Interrupted' = 'Idle';
	private _runtimeItems: RuntimeItem[] = [];
	private _runtimeItemActivities = new Map<string, RuntimeItemActivity>();
	private _activeActivityItemPrompt?: ActivityItemPrompt;
	private _scrollbackSize: number;
	private _scrollLocked = false;
	private _lastScrollTop = 0;
	private readonly _onFocusInputEmitter = this._register(new Emitter<void>);
	private readonly _onDidChangeStateEmitter = this._register(new Emitter<ErdosConsoleState>);
	private readonly _onDidChangeTraceEmitter = this._register(new Emitter<boolean>);
	private readonly _onDidChangeWordWrapEmitter = this._register(new Emitter<boolean>);
	private readonly _onDidChangeRuntimeItemsEmitter = this._register(new ThrottledEmitter<void>(
		ON_DID_CHANGE_RUNTIME_ITEMS_THROTTLE_THRESHOLD,
		ON_DID_CHANGE_RUNTIME_ITEMS_THROTTLE_INTERVAL
	));
	private _lastPastedText: string = '';
	private readonly _onDidPasteTextEmitter = this._register(new Emitter<string>);
	private readonly _onDidSelectAllEmitter = this._register(new Emitter<void>);
	private readonly _onDidClearConsoleEmitter = this._register(new Emitter<void>);
	private readonly _onDidSetPendingCodeEmitter = this._register(new Emitter<string | undefined>);
	private readonly _onDidExecuteCodeEmitter = this._register(new Emitter<ILanguageRuntimeCodeExecutedEvent>);
	private readonly _onDidSelectPlotEmitter = this._register(new Emitter<string>);
	private readonly _onDidRequestRestart = this._register(new Emitter<void>);
	private readonly _onDidAttachRuntime = this._register(
		new Emitter<ILanguageRuntimeSession | undefined>);
	private _codeEditor: ICodeEditor | undefined;
	private readonly _widthInChars: ISettableObservable<number>;
	private _initialWorkingDirectory: string = '';

	constructor(
		sessionName: string,
		private _sessionMetadata: IRuntimeSessionMetadata,
		private _runtimeMetadata: ILanguageRuntimeMetadata,
		@INotificationService private readonly _notificationService: INotificationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._initialSessionName = sessionName;

		this._scrollbackSize = this._configurationService.getValue<number>(scrollbackSizeSettingId);

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(scrollbackSizeSettingId)) {
				this._scrollbackSize = this._configurationService.getValue<number>(scrollbackSizeSettingId);
			}
		}));

		this._widthInChars = observableValue<number>('console-width', 80);
		this.onDidChangeWidthInChars = Event.fromObservable(this._widthInChars);
	}

	get codeEditor(): ICodeEditor | undefined {
		return this._codeEditor;
	}

	set codeEditor(value: ICodeEditor | undefined) {
		this._codeEditor = value;
	}

	get sessionMetadata(): IRuntimeSessionMetadata {
		return this._sessionMetadata;
	}

	get runtimeMetadata(): ILanguageRuntimeMetadata {
		return this._runtimeMetadata;
	}

	get sessionId(): string {
		return this._sessionMetadata.sessionId;
	}

	get sessionName(): string {
		return this._session?.dynState.sessionName || this._initialSessionName;
	}

	setWidthInChars(newWidth: number): void {
		this._widthInChars.set(newWidth, undefined);
	}

	getWidthInChars(): number {
		return this._widthInChars.get();
	}

	get attachedRuntimeSession(): ILanguageRuntimeSession | undefined {
		return this.runtimeAttached ? this._session : undefined;
	}

	override dispose() {
		if (this._trace) {
			this.addRuntimeItemTrace('dispose()');
		}

		super.dispose();

		this._runtimeDisposableStore.dispose();
	}

	addDisposables(disposables: IDisposable): void {
		this._register(disposables);
	}

	get session(): ILanguageRuntimeSession | undefined {
		return this._session;
	}

	get state(): ErdosConsoleState {
		return this._state;
	}

	get trace(): boolean {
		return this._trace;
	}

	get wordWrap(): boolean {
		return this._wordWrap;
	}

	get runtimeItems(): RuntimeItem[] {
		return this._runtimeItems;
	}

	get promptActive(): boolean {
		return this._activeActivityItemPrompt !== undefined;
	}

	get runtimeAttached(): boolean {
		return this._runtimeAttached;
	}

	get scrollLocked(): boolean {
		return this._scrollLocked;
	}
	set scrollLocked(value: boolean) {
		this._scrollLocked = value;
	}

	get lastScrollTop(): number {
		return this._lastScrollTop;
	}
	set lastScrollTop(value: number) {
		this._lastScrollTop = value;
	}

	readonly onFocusInput = this._onFocusInputEmitter.event;

	readonly onDidChangeState = this._onDidChangeStateEmitter.event;

	readonly onDidChangeTrace = this._onDidChangeTraceEmitter.event;

	readonly onDidChangeWordWrap = this._onDidChangeWordWrapEmitter.event;

	readonly onDidChangeRuntimeItems = this._onDidChangeRuntimeItemsEmitter.event;

	readonly onDidPasteText = this._onDidPasteTextEmitter.event;

	readonly onDidSelectAll = this._onDidSelectAllEmitter.event;

	readonly onDidClearConsole = this._onDidClearConsoleEmitter.event;

	readonly onDidSetPendingCode = this._onDidSetPendingCodeEmitter.event;

	readonly onDidExecuteCode = this._onDidExecuteCodeEmitter.event;

	readonly onDidSelectPlot = this._onDidSelectPlotEmitter.event;

	readonly onDidRequestRestart = this._onDidRequestRestart.event;

	readonly onDidAttachSession = this._onDidAttachRuntime.event;

	readonly onDidChangeWidthInChars: Event<number>;

	focusInput() {
		this._onFocusInputEmitter.fire();
	}

	toggleTrace() {
		this._trace = !this._trace;
		if (this._trace) {
			this.addRuntimeItemTrace('Trace enabled');
		}
		this._onDidChangeTraceEmitter.fire(this._trace);
	}

	toggleWordWrap() {
		this._wordWrap = !this._wordWrap;
		this._onDidChangeWordWrapEmitter.fire(this._wordWrap);
	}

	pasteText(text: string) {
		this.focusInput();
		this._lastPastedText = text;
		this._onDidPasteTextEmitter.fire(text);
	}

	selectAll() {
		this._onDidSelectAllEmitter.fire();
	}

	clearConsole() {
		if (this._activeActivityItemPrompt) {
			this._notificationService.notify({
				severity: Severity.Info,
				message: localize('erdos.clearConsole.promptActive', "Cannot clear console. A prompt is active."),
				sticky: false
			});
		} else {
			this._runtimeItems = [];
			this._runtimeItemActivities.clear();
			this._onDidChangeRuntimeItemsEmitter.fire();
			this._onDidClearConsoleEmitter.fire();
		}
	}

	interrupt(code?: string) {
		if (!this._session) {
			return;
		}

		const runtimeState = this._session.getRuntimeState();

		if (this._activeActivityItemPrompt) {
			this._activeActivityItemPrompt.state = ActivityItemPromptState.Interrupted;
			this._onDidChangeRuntimeItemsEmitter.fire();
			this._activeActivityItemPrompt = undefined;
		}

		this._session.interrupt();

		this.clearPendingInput();
		this.setPendingCode();

		if (runtimeState === RuntimeState.Ready || runtimeState === RuntimeState.Idle) {
			const id = generateUuid();
			this.addOrUpdateRuntimeItemActivity(
				id,
				new ActivityItemInput(
					id,
					id,
					new Date(),
					ActivityItemInputState.Cancelled,
					this._session.dynState.inputPrompt,
					this._session.dynState.continuationPrompt,
					code ?? '',
				)
			);
		}

		setTimeout(() => {
			this.focusInput();
		}, 0);
	}

	async enqueueCode(code: string,
		attribution: IConsoleCodeAttribution,
		allowIncomplete?: boolean,
		mode?: RuntimeCodeExecutionMode,
		errorBehavior?: RuntimeErrorBehavior,
		executionId?: string) {
		if (executionId) {
			this._externalExecutionIds.add(executionId);
		}

		if (this._runtimeItemPendingInput) {
			this.addPendingInput(code, attribution, executionId);
			return;
		}

		const runtimeState = this.session?.getRuntimeState() || RuntimeState.Uninitialized;
		if (!(runtimeState === RuntimeState.Idle || runtimeState === RuntimeState.Ready)) {
			this.addPendingInput(code, attribution, executionId);
			return;
		}

		const shouldExecuteCode = async (codeToCheck: string) => {
			if (!this.session) {
				return false;
			}

			if (allowIncomplete) {
				return true;
			}

			return await this.session.isCodeFragmentComplete(codeToCheck) === RuntimeCodeFragmentStatus.Complete;
		};

		if (mode === RuntimeCodeExecutionMode.Interactive) {
			let pendingCode = this.codeEditor?.getValue();
			if (pendingCode) {
				if (!executionId) {
					const storedExecutionId = this._pendingExecutionIds.get(code);
					if (storedExecutionId) {
						executionId = storedExecutionId;
					}
				}

				pendingCode += '\n' + code;
				if (await shouldExecuteCode(pendingCode)) {
					this.setPendingCode();
					this.doExecuteCode(pendingCode, attribution, mode, errorBehavior, executionId);
				} else {
					this.setPendingCode(pendingCode, executionId);
				}

				return;
			}
		}

		if (await shouldExecuteCode(code)) {
			this.doExecuteCode(code, attribution, mode, errorBehavior, executionId);
		} else {
			this.setPendingCode(code, executionId);
		}
	}

	executeCode(code: string,
		attribution: IConsoleCodeAttribution,
		mode?: RuntimeCodeExecutionMode,
		errorBehavior?: RuntimeErrorBehavior,
		executionId?: string) {
		this.setPendingCode();
		this.doExecuteCode(code, attribution, mode, errorBehavior, executionId);
	}

	replyToPrompt(value: string) {
		if (this._session && this._activeActivityItemPrompt) {
			const id = this._activeActivityItemPrompt.id;

			this._activeActivityItemPrompt.state = ActivityItemPromptState.Answered;
			this._activeActivityItemPrompt.answer = !this._activeActivityItemPrompt.password ? value : '';
			this._activeActivityItemPrompt = undefined;
			this._onDidChangeRuntimeItemsEmitter.fire();

			this._session.replyToPrompt(id, value);
		}
	}

	getClipboardRepresentation(commentPrefix: string): string[] {
		return this._runtimeItems.flatMap(runtimeItem =>
			runtimeItem.getClipboardRepresentation(commentPrefix)
		);
	}

	attachRuntimeSession(session: ILanguageRuntimeSession, attachMode: SessionAttachMode) {
		if (this._session && this._session.sessionId === session.sessionId) {
			if (this.runtimeAttached) {
				if (this._state === ErdosConsoleState.Exited) {
					this.emitStartRuntimeItems(attachMode);
				}
			} else {
				this.attachRuntime(session, attachMode);
			}
			return;
		}
		this.attachRuntime(session, attachMode);
	}

	set initialWorkingDirectory(workingDirectory: string) {
		this._initialWorkingDirectory = workingDirectory;
	}

	get initialWorkingDirectory(): string {
		return this._initialWorkingDirectory;
	}

	markInputBusyState(parentId: string, busy: boolean) {
		const activity = this._runtimeItemActivities.get(parentId);
		if (!activity) {
			return;
		}

		for (const item of activity.activityItems) {
			if (item instanceof ActivityItemInput) {
				const input = item as ActivityItemInput;
				if (input.state !== ActivityItemInputState.Provisional) {
					input.state = busy ?
						ActivityItemInputState.Executing :
						ActivityItemInputState.Completed;
				}

				break;
			}
		}
	}

	clearStartingItem() {
		for (let i = this._runtimeItems.length - 1; i >= 0; i--) {
			if (this._runtimeItems[i] instanceof RuntimeItemStarting) {
				this._runtimeItems.splice(i, 1);
				break;
			}
		}
	}

	showRestoreFailure(evt: ISessionRestoreFailedEvent) {
		if (this._trace) {
			this.addRuntimeItemTrace(`Restore failure: ${evt.error.toString()}`);
		}

		this.clearStartingItem();

		this.addRuntimeItem(new RuntimeItemStartupFailure(
			generateUuid(),
			evt.error.toString(),
			''
		));

		this.setState(ErdosConsoleState.Exited);
	}

	setState(state: ErdosConsoleState) {
		if (this._trace && this._state !== state) {
			this.addRuntimeItemTrace(`Console state change: ${this._state} => ${state}`);
		}

		switch (state) {
			case ErdosConsoleState.Uninitialized:
			case ErdosConsoleState.Starting:
				break;

			case ErdosConsoleState.Ready:
				switch (this._state) {
					case ErdosConsoleState.Starting:
						for (let i = this._runtimeItems.length - 1; i >= 0; i--) {
							if (this._runtimeItems[i] instanceof RuntimeItemStarting) {
								const runtimeItem = this._runtimeItems[i] as RuntimeItemStarting;
								let msg = '';
								switch (runtimeItem.attachMode) {
									case SessionAttachMode.Starting:
									case SessionAttachMode.Switching:
										msg = localize('erdosConsole.started', "{0} started.", this.sessionName);
										break;
									case SessionAttachMode.Restarting:
										msg = localize('erdosConsole.restarted', "{0} restarted.", this.sessionName);
										break;
									case SessionAttachMode.Connected:
										msg = localize('erdosConsole.connected', "{0} connected.", this.sessionName);
										break;
								}
								if (msg) {
									this._runtimeItems[i] = new RuntimeItemStarted(
										generateUuid(), msg);
									this._onDidChangeRuntimeItemsEmitter.fire();
								} else {
									this._runtimeItems.splice(i, 1);
									this._onDidChangeRuntimeItemsEmitter.fire();
								}
							}
						}
						break;

					case ErdosConsoleState.Offline:
						this.addRuntimeItem(
							new RuntimeItemReconnected(
								generateUuid(),
								`${this.sessionName} reconnected.`
							)
						);
						break;
				}
				break;

			case ErdosConsoleState.Offline:
				this.addRuntimeItem(
					new RuntimeItemOffline(
						generateUuid(),
						`${this.sessionName} offline. Waiting to reconnect.`
					)
				);
				break;
		}

		this._state = state;
		this._onDidChangeStateEmitter.fire(this._state);
	}

	private emitStartRuntimeItems(attachMode: SessionAttachMode) {
		const sessionName = this.sessionName;
		if (attachMode === SessionAttachMode.Restarting ||
			(attachMode === SessionAttachMode.Starting && this._state === ErdosConsoleState.Exited)) {
			this.setState(ErdosConsoleState.Starting);
			this.addRuntimeItem(new RuntimeItemStarting(
				generateUuid(),
				localize('erdosConsole.starting.restart', "{0} restarting.", sessionName),
				SessionAttachMode.Restarting));
		} else if (attachMode === SessionAttachMode.Starting ||
			attachMode === SessionAttachMode.Switching) {
			this.setState(ErdosConsoleState.Starting);
			this.addRuntimeItem(new RuntimeItemStarting(
				generateUuid(),
				localize('erdosConsole.starting.start', "{0} starting.", sessionName),
				attachMode));
		} else if (attachMode === SessionAttachMode.Reconnecting) {
			this.setState(ErdosConsoleState.Starting);
			this.addRuntimeItem(new RuntimeItemStarting(
				generateUuid(),
				localize('erdosConsole.starting.reconnect', "{0} reconnecting.", sessionName),
				attachMode));
		} else if (attachMode === SessionAttachMode.Connected) {
			this.setState(ErdosConsoleState.Ready);
			this.addRuntimeItem(new RuntimeItemReconnected(
				generateUuid(),
				localize('erdosConsole.starting.reconnected', "{0} reconnected.", sessionName),
			));
		}
	}

	private attachRuntime(
		session: ILanguageRuntimeSession,
		attachMode: SessionAttachMode) {

		this._session = session;
		this._runtimeAttached = true;

		if (this._trace) {
			this.addRuntimeItemTrace(`Attach session ${this.sessionName} ` +
				`(attach mode = ${attachMode})`);
		}

		if (attachMode !== SessionAttachMode.Reconnecting) {
			this.emitStartRuntimeItems(attachMode);
		}

		this._runtimeDisposableStore.add(this._session.onDidChangeRuntimeState(async runtimeState => {
			if (this._trace) {
				this.addRuntimeItemTrace(`onDidChangeRuntimeState (${runtimeState})`);
			}

			if (runtimeState === RuntimeState.Idle || runtimeState === RuntimeState.Ready) {
				this.processPendingInput();
			}

			if (runtimeState === RuntimeState.Ready) {
				this.clearRestartItems();
			}

			if (runtimeState === RuntimeState.Exited || runtimeState === RuntimeState.Uninitialized) {
				if (this._runtimeState === RuntimeState.Starting ||
					this._runtimeState === RuntimeState.Initializing) {
					setTimeout(() => {
						this.clearStartingItem();

						if ((this._runtimeState === RuntimeState.Exited ||
							this._runtimeState === RuntimeState.Uninitialized) &&
							this.runtimeAttached) {
							this.detachRuntime();

							this.addRuntimeItem(new RuntimeItemExited(
								generateUuid(),
								RuntimeExitReason.StartupFailed,
								`${session.dynState.sessionName} failed to start.`
							));
						}
					}, 1000);
				}
			}

			if (this._state === ErdosConsoleState.Offline &&
				(runtimeState === RuntimeState.Busy || runtimeState === RuntimeState.Idle)) {
				this.setState(ErdosConsoleState.Ready);
			}

			this._runtimeState = runtimeState;
		}));

		this._runtimeDisposableStore.add(this._session.onDidCompleteStartup(languageRuntimeInfo => {
			this.setState(ErdosConsoleState.Ready);

			if (this._trace) {
				this.addRuntimeItemTrace(`onDidCompleteStartup`);
			}

			if (attachMode !== SessionAttachMode.Reconnecting) {
				this.addRuntimeItem(new RuntimeItemStartup(
					generateUuid(),
					languageRuntimeInfo.banner,
					languageRuntimeInfo.implementation_version,
					languageRuntimeInfo.language_version
				));
			}
		}));

		this._runtimeDisposableStore.add(this._session.onDidEncounterStartupFailure(startupFailure => {
			if (this._trace) {
				this.addRuntimeItemTrace(`onDidEncounterStartupFailure`);
			}

			this.addRuntimeItem(new RuntimeItemExited(
				generateUuid(),
				RuntimeExitReason.StartupFailed,
				`${session.dynState.sessionName} failed to start.`
			));
			this.addRuntimeItem(new RuntimeItemStartupFailure(
				generateUuid(),
				startupFailure.message,
				startupFailure.details,
			));

			if ((this._runtimeState === RuntimeState.Exited ||
				this._runtimeState === RuntimeState.Uninitialized) && this.runtimeAttached) {
				this.detachRuntime();
			}

			this.clearStartingItem();
			this.setState(ErdosConsoleState.Exited);
		}));

		this._runtimeDisposableStore.add(this._session.onDidReceiveRuntimeMessageInput(languageRuntimeMessageInput => {
			if (this._trace) {
				this.addRuntimeItemTrace(
					formatCallbackTrace('onDidReceiveRuntimeMessageInput', languageRuntimeMessageInput) +
					'\nCode:\n' +
					languageRuntimeMessageInput.code
				);
			}

			this.addOrUpdateRuntimeItemActivity(
				languageRuntimeMessageInput.parent_id,
				new ActivityItemInput(
					languageRuntimeMessageInput.id,
					languageRuntimeMessageInput.parent_id,
					new Date(languageRuntimeMessageInput.when),
					ActivityItemInputState.Executing,
					session.dynState.inputPrompt,
					session.dynState.continuationPrompt,
					languageRuntimeMessageInput.code
				)
			);

			if (languageRuntimeMessageInput.parent_id.startsWith('direct-injection-')) {
				const languageId = this.session?.runtimeMetadata?.languageId;
				if (!languageId) {
					return;
				}

				this._onDidExecuteCodeEmitter.fire({
					sessionId: this.sessionId,
					languageId,
					code: languageRuntimeMessageInput.code,
					attribution: {
						source: CodeAttributionSource.Interactive,
					},
					runtimeName: this._runtimeMetadata.runtimeName,
					mode: RuntimeCodeExecutionMode.Interactive,
					errorBehavior: RuntimeErrorBehavior.Continue
				});
			}
		}));

		this._runtimeDisposableStore.add(this._session.onDidReceiveRuntimeMessagePrompt(languageRuntimeMessagePrompt => {
			if (this._trace) {
				this.addRuntimeItemTrace(
					formatCallbackTrace('onDidReceiveRuntimeMessagePrompt', languageRuntimeMessagePrompt) +
					`\nPrompt: ${languageRuntimeMessagePrompt.prompt}` +
					`\nPassword: ${languageRuntimeMessagePrompt.password}`
				);
			}

			this._activeActivityItemPrompt = new ActivityItemPrompt(
				languageRuntimeMessagePrompt.id,
				languageRuntimeMessagePrompt.parent_id,
				new Date(languageRuntimeMessagePrompt.when),
				languageRuntimeMessagePrompt.prompt,
				languageRuntimeMessagePrompt.password
			);

			this.addOrUpdateRuntimeItemActivity(
				languageRuntimeMessagePrompt.parent_id,
				this._activeActivityItemPrompt
			);
		}));

		const handleDidReceiveRuntimeMessageOutput = (
			(languageRuntimeMessageOutput: ILanguageRuntimeMessageOutput) => {
				if (this._trace) {
					this.addRuntimeItemTrace(
						formatCallbackTrace('onDidReceiveRuntimeMessageOutput', languageRuntimeMessageOutput) +
						formatOutputMessage(languageRuntimeMessageOutput)
					);
				}

				const activityItemOutput = this.createActivityItemOutput(languageRuntimeMessageOutput);
				if (!activityItemOutput) {
					return;
				}

				this.addOrUpdateRuntimeItemActivity(languageRuntimeMessageOutput.parent_id, activityItemOutput);
			});
		this._runtimeDisposableStore.add(this._session.onDidReceiveRuntimeMessageOutput(handleDidReceiveRuntimeMessageOutput));
		this._runtimeDisposableStore.add(this._session.onDidReceiveRuntimeMessageResult(handleDidReceiveRuntimeMessageOutput));

		this._runtimeDisposableStore.add(this._session.onDidReceiveRuntimeMessageStream(languageRuntimeMessageStream => {
			if (this._trace) {
				const traceOutput = sanitizeTraceOutput(languageRuntimeMessageStream.text);

				this.addRuntimeItemTrace(
					formatCallbackTrace('onDidReceiveRuntimeMessageStream', languageRuntimeMessageStream) +
					`\nStream ${languageRuntimeMessageStream.name}: "${traceOutput}" ${formattedLength(languageRuntimeMessageStream.text.length)}`
				);
			}

			if (languageRuntimeMessageStream.name === 'stdout') {
				this.addOrUpdateRuntimeItemActivity(
					languageRuntimeMessageStream.parent_id,
					new ActivityItemStream(
						languageRuntimeMessageStream.id,
						languageRuntimeMessageStream.parent_id,
						new Date(languageRuntimeMessageStream.when),
						ActivityItemStreamType.OUTPUT,
						languageRuntimeMessageStream.text
					)
				);
			} else if (languageRuntimeMessageStream.name === 'stderr') {
				this.addOrUpdateRuntimeItemActivity(
					languageRuntimeMessageStream.parent_id,
					new ActivityItemStream(
						languageRuntimeMessageStream.id,
						languageRuntimeMessageStream.parent_id,
						new Date(languageRuntimeMessageStream.when),
						ActivityItemStreamType.ERROR,
						languageRuntimeMessageStream.text
					)
				);
			}
		}));

		this._runtimeDisposableStore.add(this._session.onDidReceiveRuntimeMessageError(
			languageRuntimeMessageError => {
				if (this._trace) {
					this.addRuntimeItemTrace(
						formatCallbackTrace('onDidReceiveRuntimeMessageError', languageRuntimeMessageError) +
						`\nName: ${languageRuntimeMessageError.name}` +
						'\nMessage:\n' +
						languageRuntimeMessageError.message +
						formatTraceback(languageRuntimeMessageError.traceback)
					);
				}

				this.addOrUpdateRuntimeItemActivity(
					languageRuntimeMessageError.parent_id,
					new ActivityItemErrorMessage(
						languageRuntimeMessageError.id,
						languageRuntimeMessageError.parent_id,
						new Date(languageRuntimeMessageError.when),
						languageRuntimeMessageError.name,
						languageRuntimeMessageError.message,
						languageRuntimeMessageError.traceback
					)
				);
			}));

		this._runtimeDisposableStore.add(this._session.onDidReceiveRuntimeMessageState(
			languageRuntimeMessageState => {
				if (this._trace) {
					this.addRuntimeItemTrace(
						formatCallbackTrace('onDidReceiveRuntimeMessageState', languageRuntimeMessageState) +
						`\nState: ${languageRuntimeMessageState.state}`);
				}

				switch (languageRuntimeMessageState.state) {
					case RuntimeOnlineState.Starting: {
						break;
					}

					case RuntimeOnlineState.Busy: {
						if (languageRuntimeMessageState.parent_id.startsWith('fragment-') ||
							this._externalExecutionIds.has(languageRuntimeMessageState.parent_id) ||
							this.state === ErdosConsoleState.Offline) {
							this.setState(ErdosConsoleState.Busy);
						}
						this.markInputBusyState(languageRuntimeMessageState.parent_id, true);
						break;
					}

					case RuntimeOnlineState.Idle: {
						if (languageRuntimeMessageState.parent_id.startsWith('fragment-') ||
							this._externalExecutionIds.has(languageRuntimeMessageState.parent_id) ||
							this.state === ErdosConsoleState.Offline) {
							this.setState(ErdosConsoleState.Ready);
						}
						this.markInputBusyState(languageRuntimeMessageState.parent_id, false);
						this._externalExecutionIds.delete(languageRuntimeMessageState.parent_id);
						break;
					}
				}
			}));

		this._runtimeDisposableStore.add(this._session.onDidReceiveRuntimeClientEvent((event) => {
			if (event.name === UiFrontendEvent.ClearConsole) {
				this.clearConsole();
			}
		}));

		this._runtimeDisposableStore.add(this._session.onDidEndSession((exit) => {
			if (this._trace) {
				this.addRuntimeItemTrace(`onDidEndSession (code ${exit.exit_code}, reason '${exit.reason}')`);
			}

			this.clearStartingItem();

			if (exit.reason === RuntimeExitReason.ExtensionHost) {
				this.setState(ErdosConsoleState.Disconnected);
				this.detachRuntime();
				return;
			}

			let message = this.formatExit(exit);
			if (exit.message) {
				message += `\n\n${exit.message}`;
			}
			const exited = new RuntimeItemExited(generateUuid(),
				exit.reason,
				message);
			this.addRuntimeItem(exited);

			const crashedAndNeedRestartButton = exit.reason === RuntimeExitReason.Error &&
				!this._configurationService.getValue<boolean>('interpreters.restartOnCrash');

			const showRestartButton = false && (exit.reason === RuntimeExitReason.ForcedQuit ||
				exit.reason === RuntimeExitReason.Shutdown ||
				exit.reason === RuntimeExitReason.Unknown ||
				crashedAndNeedRestartButton);

			if (showRestartButton) {
				const restartButton = new RuntimeItemRestartButton(
					generateUuid(),
					this._session?.dynState.sessionName || this.runtimeMetadata.runtimeName,
					() => {
						this._onDidRequestRestart.fire();
					});
				this.addRuntimeItem(restartButton);
			}
			this.detachRuntime();
		}));

		this._onDidAttachRuntime.fire(this._session);
	}

	private formatExit(exit: ILanguageRuntimeExit): string {
		switch (exit.reason) {
			case RuntimeExitReason.ForcedQuit:
				return localize('erdosConsole.exit.forcedQuit', "{0} was forced to quit.", exit.session_name);

			case RuntimeExitReason.Restart:
				return localize('erdosConsole.exit.restart', "{0} exited (preparing for restart)", exit.session_name);

			case RuntimeExitReason.Shutdown:
			case RuntimeExitReason.SwitchRuntime:
				return localize('erdosConsole.exit.shutdown', "{0} shut down successfully.", exit.session_name);

			case RuntimeExitReason.Transferred:
				return localize('erdosConsole.exit.transfer', "{0} was opened in another window.", exit.runtime_name);

			case RuntimeExitReason.Error:
				return localize('erdosConsole.exit.error', "{0} exited unexpectedly: {1}", exit.session_name, this.formatExitCode(exit.exit_code));

			case RuntimeExitReason.StartupFailed:
				return localize('erdosConsole.exit.startupFailed', "{0} failed to start up (exit code {1})", exit.session_name, exit.exit_code);

			case RuntimeExitReason.ExtensionHost:
				return localize('erdosConsole.exit.extensionHost', "{0} was disconnected from the extension host.", exit.session_name);

			default:
			case RuntimeExitReason.Unknown:
				return localize('erdosConsole.exit.unknown', "{0} exited (exit code {1})", exit.session_name, exit.exit_code);
		}
	}

	private formatExitCode(exitCode: number): string {
		if (exitCode === 1) {
			return localize('erdosConsole.exitCode.error', "exit code 1 (error)");
		} else if (exitCode === 126) {
			return localize('erdosConsole.exitCode.cannotExit', "exit code 126 (not an executable or no permissions)");
		} else if (exitCode === 127) {
			return localize('erdosConsole.exitCode.notFound', "exit code 127 (command not found)");
		} else if (exitCode === 130) {
			return localize('erdosConsole.exitCode.interrupted', "exit code 130 (interrupted)");
		} else if (exitCode > 128 && exitCode < 160) {
			const signal = exitCode - 128;

			let formattedSignal = this.formatSignal(signal);
			if (formattedSignal.length > 0) {
				formattedSignal = ` (${formattedSignal})`;
			}

			return localize('erdosConsole.exitCode.killed', "killed with signal {0}{1}", signal, formattedSignal);
		}
		return localize('erdosConsole.exitCode.genericError', "exit code {0}", exitCode);
	}

	private formatSignal(signal: number): string {
		let name: string = '';
		if (signal === 1) {
			name = 'SIGHUP';
		} else if (signal === 2) {
			name = 'SIGINT';
		} else if (signal === 3) {
			name = 'SIGQUIT';
		} else if (signal === 4) {
			name = 'SIGILL';
		} else if (signal === 5) {
			name = 'SIGTRAP';
		} else if (signal === 6) {
			name = 'SIGABRT';
		} else if (signal === 7) {
			name = 'SIGBUS';
		} else if (signal === 9) {
			name = 'SIGKILL';
		} else if (signal === 11) {
			name = 'SIGSEGV';
		} else if (signal === 13) {
			name = 'SIGPIPE';
		} else if (signal === 15) {
			name = 'SIGTERM';
		} else if (signal === 19) {
			name = 'SIGSTOP';
		}
		return name;
	}

	private detachRuntime() {
		if (this._trace) {
			this.addRuntimeItemTrace(`Detach session ${this.sessionName} with ID: ${this.sessionMetadata.sessionId}`);
		}

		if (this.runtimeAttached) {
			this._runtimeAttached = false;
			this._onDidAttachRuntime.fire(undefined);

			for (const activity of this._runtimeItemActivities.values()) {
				for (const item of activity.activityItems) {
					if (item instanceof ActivityItemInput) {
						item.state = ActivityItemInputState.Completed;
					}
				}
			}

			this._runtimeDisposableStore.clear();
		} else {
			console.warn(
				`Attempt to detach already detached session ${this.sessionName} with ID: ${this.sessionMetadata.sessionId}.`);
		}
	}

	setPendingCode(pendingCode?: string, executionId?: string) {
		if (pendingCode && executionId) {
			this._pendingExecutionIds.set(pendingCode, executionId);
		} else if (!pendingCode) {
			this._pendingExecutionIds.clear();
		}

		this._onDidSetPendingCodeEmitter.fire(pendingCode);
	}

	private addPendingInput(code: string,
		attribution: IConsoleCodeAttribution,
		executionId?: string) {
		if (this._runtimeItemPendingInput) {
			const index = this.runtimeItems.indexOf(this._runtimeItemPendingInput);

			if (index > -1) {
				this._runtimeItems.splice(index, 1);
			}

			code = this._runtimeItemPendingInput.code + '\n' + code;
		}

		this._runtimeItemPendingInput = new RuntimeItemPendingInput(
			generateUuid(),
			this._session?.dynState.inputPrompt ?? '',
			attribution,
			executionId,
			code
		);

		this.addRuntimeItem(this._runtimeItemPendingInput);
	}

	private clearPendingInput() {
		if (this._runtimeItemPendingInput) {
			const index = this.runtimeItems.indexOf(this._runtimeItemPendingInput);

			if (index > -1) {
				this._runtimeItems.splice(index, 1);
			}

			this._runtimeItemPendingInput = undefined;

			if (this._pendingInputState === 'Processing') {
				this._pendingInputState = 'Interrupted';
			}
		}
	}

	private createActivityItemOutput(
		message: ILanguageRuntimeMessageOutput | ILanguageRuntimeMessageUpdateOutput,
	): ActivityItemOutput | undefined {
		if (message.kind === RuntimeOutputKind.ViewerWidget ||
			message.kind === RuntimeOutputKind.IPyWidget) {
			return undefined;
		}

		const images = Object.keys(message.data).find(
			key => key.startsWith('image/'));

		let html = Object.hasOwnProperty.call(message.data,
			'text/html');
		if (html) {
			const htmlContent = message.data['text/html']!.toLowerCase();
			if (htmlContent.indexOf('<script') >= 0 ||
				htmlContent.indexOf('<body') >= 0 ||
				htmlContent.indexOf('<html') >= 0 ||
				htmlContent.indexOf('<iframe') >= 0 ||
				htmlContent.indexOf('<!doctype') >= 0) {
				html = false;
			}
		}

		if (images) {
			return new ActivityItemOutputPlot(
				message.id,
				message.parent_id,
				new Date(message.when),
				message.data, () => {
					this._onDidSelectPlotEmitter.fire(message.id);
				},
				message.output_id
			);
		} else if (html) {
			return new ActivityItemOutputHtml(
				message.id,
				message.parent_id,
				new Date(message.when),
				message.data['text/html']!,
				message.data['text/plain'],
				message.output_id
			);
		} else {
			return new ActivityItemOutputMessage(
				message.id,
				message.parent_id,
				new Date(message.when),
				message.data,
				message.output_id
			);
		}
	}

	private clearRestartItems() {
		const itemCount = this._runtimeItems.length;

		this._runtimeItems = this.runtimeItems.filter(
			item => !(item instanceof RuntimeItemRestartButton));

		if (this._runtimeItems.length !== itemCount) {
			this._onDidChangeRuntimeItemsEmitter.fire();
		}
	}

	private async processPendingInput(): Promise<void> {
		if (this._pendingInputState !== 'Idle') {
			return;
		}

		this._pendingInputState = 'Processing';

		try {
			await this.processPendingInputImpl();
		} finally {
			this._pendingInputState = 'Idle';
		}
	}

	private async processPendingInputImpl(): Promise<void> {
		if (!this._runtimeItemPendingInput) {
			return;
		}

		if (!this._session) {
			return;
		}

		const attribution = this._runtimeItemPendingInput.attribution;

		let code = undefined;
		const codeLines: string[] = [];

		let pendingInputLines = this._runtimeItemPendingInput.code.split('\n');

		for (let i = 0; i < pendingInputLines.length; i++) {
			codeLines.push(pendingInputLines[i]);

			const codeFragment = codeLines.join('\n');
			const codeFragmentStatus = await this._session.isCodeFragmentComplete(codeFragment);

			if (this._pendingInputState === 'Interrupted') {
				return;
			}

			pendingInputLines = this._runtimeItemPendingInput.code.split('\n');

			if (codeFragmentStatus === RuntimeCodeFragmentStatus.Complete) {
				code = codeFragment;
				break;
			}
		}

		const index = this.runtimeItems.indexOf(this._runtimeItemPendingInput);

		if (index > -1) {
			this._runtimeItems.splice(index, 1);
		}

		if (code === undefined) {
			this._onDidChangeRuntimeItemsEmitter.fire();

			this.setPendingCode(
				this._runtimeItemPendingInput.code,
				this._runtimeItemPendingInput.executionId);

			this._runtimeItemPendingInput = undefined;

			return;
		}

		const id = this._runtimeItemPendingInput.executionId || this.generateExecutionId(code);

		const runtimeItemActivity = new RuntimeItemActivity(
			id,
			new ActivityItemInput(
				id,
				id,
				new Date(),
				ActivityItemInputState.Provisional,
				this._session.dynState.inputPrompt,
				this._session.dynState.continuationPrompt,
				code
			)
		);
		this._runtimeItems.push(runtimeItemActivity);
		this._runtimeItemActivities.set(id, runtimeItemActivity);

		const nCodeLines = codeLines.length;
		const nPendingLines = pendingInputLines.length;

		if (nCodeLines < nPendingLines) {
			this._runtimeItemPendingInput = new RuntimeItemPendingInput(
				generateUuid(),
				this._session.dynState.inputPrompt,
				attribution,
				id,
				pendingInputLines.slice(nCodeLines).join('\n'),
			);

			this._runtimeItems.push(this._runtimeItemPendingInput);
		} else if (nCodeLines === nPendingLines) {
			this._runtimeItemPendingInput = undefined;
		} else {
			throw new Error('Unexpected state. Can\'t have more code lines than pending lines.');
		}

		this._onDidChangeRuntimeItemsEmitter.fire();

		const mode = RuntimeCodeExecutionMode.Interactive;
		const errorBehavior = RuntimeErrorBehavior.Continue;

		this._session.execute(
			code,
			id,
			mode,
			errorBehavior,
		);

		const event: ILanguageRuntimeCodeExecutedEvent = {
			sessionId: this._session.sessionId,
			code,
			mode,
			attribution,
			errorBehavior,
			languageId: this._session.runtimeMetadata.languageId,
			runtimeName: this._session.runtimeMetadata.runtimeName
		};
		this._onDidExecuteCodeEmitter.fire(event);
	}

	private generateExecutionId(code: string): string {
		const storedExecutionId = this._pendingExecutionIds.get(code);
		if (storedExecutionId) {
			this._pendingExecutionIds.delete(code);
			return storedExecutionId;
		}

		return `fragment-${generateUuid()}`;
	}

	private doExecuteCode(
		code: string,
		attribution: IConsoleCodeAttribution,
		mode: RuntimeCodeExecutionMode = RuntimeCodeExecutionMode.Interactive,
		errorBehavior: RuntimeErrorBehavior = RuntimeErrorBehavior.Continue,
		executionId?: string
	) {
		const id = executionId || this.generateExecutionId(code);

		if (!this._session) {
			return;
		}

		if (mode !== RuntimeCodeExecutionMode.Silent) {
			const activityItemInput = new ActivityItemInput(
				id,
				id,
				new Date(),
				ActivityItemInputState.Provisional,
				this._session.dynState.inputPrompt,
				this._session.dynState.continuationPrompt,
				code
			);

			this.addOrUpdateRuntimeItemActivity(id, activityItemInput);
		}

		if (attribution.source === CodeAttributionSource.Interactive) {
			const lastPastedText = this._lastPastedText.trim();
			if (lastPastedText && code.trim() === lastPastedText) {
				attribution.source = CodeAttributionSource.Paste;
			}

			this._lastPastedText = '';
		}

		this._session.execute(
			code,
			id,
			mode,
			errorBehavior);

		const event: ILanguageRuntimeCodeExecutedEvent = {
			sessionId: this._session.sessionId,
			code,
			mode,
			attribution,
			errorBehavior,
			languageId: this._session.runtimeMetadata.languageId,
			runtimeName: this._session.runtimeMetadata.runtimeName
		};
		this._onDidExecuteCodeEmitter.fire(event);
	}

	private addRuntimeItemTrace(trace: string) {
		this.addRuntimeItem(new RuntimeItemTrace(generateUuid(), trace));
	}

	private addOrUpdateRuntimeItemActivity(parentId: string, activityItem: ActivityItem) {
		const runtimeItemActivity = this._runtimeItemActivities.get(parentId);
		if (runtimeItemActivity) {
			runtimeItemActivity.addActivityItem(activityItem);

			this.optimizeScrollback();

			this._onDidChangeRuntimeItemsEmitter.fire();
		} else {
			const runtimeItemActivity = new RuntimeItemActivity(parentId, activityItem);
			this._runtimeItemActivities.set(parentId, runtimeItemActivity);
			this.addRuntimeItem(runtimeItemActivity);
		}
	}

	private addRuntimeItem(runtimeItem: RuntimeItem) {
		this._runtimeItems.push(runtimeItem);
		if (runtimeItem instanceof RuntimeItemActivity) {
			this._runtimeItemActivities.set(runtimeItem.id, runtimeItem);
		}

		this.optimizeScrollback();

		this._onDidChangeRuntimeItemsEmitter.fire();
	}

	private optimizeScrollback() {
		for (let scrollbackSize = this._scrollbackSize, i = this._runtimeItems.length - 1; i >= 0; i--) {
			scrollbackSize = this._runtimeItems[i].optimizeScrollback(scrollbackSize);
		}
	}
}

registerSingleton(IErdosConsoleService, ErdosConsoleService, InstantiationType.Delayed);
