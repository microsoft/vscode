/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IErdosConsoleInstance, IErdosConsoleService, ErdosConsoleState, SessionAttachMode } from '../../browser/interfaces/erdosConsoleService.js';
import { RuntimeItem } from '../../browser/classes/runtimeItems.js';
import { ILanguageRuntimeMetadata, RuntimeCodeExecutionMode, RuntimeErrorBehavior } from '../../../languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession, IRuntimeSessionMetadata } from '../../../runtimeSession/common/runtimeSessionService.js';

import { CodeAttributionSource, IConsoleCodeAttribution, ILanguageRuntimeCodeExecutedEvent } from '../../common/erdosConsoleCodeExecution.js';

export class TestErdosConsoleService implements IErdosConsoleService {
	declare readonly _serviceBrand: undefined;

	private readonly _erdosConsoleInstances: IErdosConsoleInstance[] = [];

	private _activeErdosConsoleInstance?: IErdosConsoleInstance;

	private _consoleWidth: number = 80;

	private readonly _onDidStartErdosConsoleInstanceEmitter = new Emitter<IErdosConsoleInstance>();

	private readonly _onDidDeleteErdosConsoleInstanceEmitter = new Emitter<IErdosConsoleInstance>();

	private readonly _onDidChangeActiveErdosConsoleInstanceEmitter = new Emitter<IErdosConsoleInstance | undefined>();

	private readonly _onDidChangeConsoleWidthEmitter = new Emitter<number>();

	private readonly _onDidExecuteCodeEmitter = new Emitter<ILanguageRuntimeCodeExecutedEvent>();

	get erdosConsoleInstances(): IErdosConsoleInstance[] {
		return this._erdosConsoleInstances;
	}

	get activeErdosConsoleInstance(): IErdosConsoleInstance | undefined {
		return this._activeErdosConsoleInstance;
	}

	get activeCodeEditor(): ICodeEditor | undefined {
		return this._activeErdosConsoleInstance?.codeEditor;
	}

	get onDidStartErdosConsoleInstance(): Event<IErdosConsoleInstance> {
		return this._onDidStartErdosConsoleInstanceEmitter.event;
	}

	get onDidDeleteErdosConsoleInstance(): Event<IErdosConsoleInstance> {
		return this._onDidDeleteErdosConsoleInstanceEmitter.event;
	}

	get onDidChangeActiveErdosConsoleInstance(): Event<IErdosConsoleInstance | undefined> {
		return this._onDidChangeActiveErdosConsoleInstanceEmitter.event;
	}

	get onDidChangeConsoleWidth(): Event<number> {
		return this._onDidChangeConsoleWidthEmitter.event;
	}

	get onDidExecuteCode(): Event<ILanguageRuntimeCodeExecutedEvent> {
		return this._onDidExecuteCodeEmitter.event;
	}

	setActiveErdosConsoleSession(sessionId: string): void {
		const instance = this._erdosConsoleInstances.find(instance => instance.sessionId === sessionId);
		this._activeErdosConsoleInstance = instance;
		this._onDidChangeActiveErdosConsoleInstanceEmitter.fire(instance);
	}

	deleteErdosConsoleSession(sessionId: string): void {
		const index = this._erdosConsoleInstances.findIndex(instance => instance.sessionId === sessionId);
		if (index !== -1) {
			const instance = this._erdosConsoleInstances[index];
			this._erdosConsoleInstances.splice(index, 1);
			this._onDidDeleteErdosConsoleInstanceEmitter.fire(instance);

			if (this._activeErdosConsoleInstance?.sessionId === sessionId) {
				this._activeErdosConsoleInstance = undefined;
				this._onDidChangeActiveErdosConsoleInstanceEmitter.fire(undefined);
			}
		}
	}

	initialize(): void {
	}

	getConsoleWidth(): number {
		return this._consoleWidth;
	}

	async executeCode(
		languageId: string,
		code: string,
		attribution: IConsoleCodeAttribution,
		focus: boolean,
		allowIncomplete?: boolean,
		mode?: RuntimeCodeExecutionMode,
		errorBehavior?: RuntimeErrorBehavior,
		executionId?: string
	): Promise<string> {
		const event = this.createTestCodeExecutedEvent(languageId, code, attribution);

		this._onDidExecuteCodeEmitter.fire(event);

		return event.sessionId;
	}

	addTestConsoleInstance(instance: IErdosConsoleInstance): void {
		this._erdosConsoleInstances.push(instance);
		this._activeErdosConsoleInstance = instance;
		this._onDidStartErdosConsoleInstanceEmitter.fire(instance);
	}

	setConsoleWidth(width: number): void {
		if (this._consoleWidth !== width) {
			this._consoleWidth = width;
			this._onDidChangeConsoleWidthEmitter.fire(width);
		}
	}

	createTestCodeExecutedEvent(
		languageId: string,
		code: string,
		attribution: IConsoleCodeAttribution = { source: CodeAttributionSource.Interactive },
		runtimeName: string = 'Test Runtime',
		mode: RuntimeCodeExecutionMode = RuntimeCodeExecutionMode.Interactive,
		errorBehavior: RuntimeErrorBehavior = RuntimeErrorBehavior.Continue
	): ILanguageRuntimeCodeExecutedEvent {
		const sessionId = this._activeErdosConsoleInstance?.sessionId || 'test-session-id';
		return {
			sessionId,
			languageId,
			code,
			attribution,
			runtimeName,
			mode,
			errorBehavior
		};
	}

	fireTestCodeExecutedEvent(event: ILanguageRuntimeCodeExecutedEvent): void {
		this._onDidExecuteCodeEmitter.fire(event);
	}

	createInstanceForSession(session: ILanguageRuntimeSession): IErdosConsoleInstance {
		const instance = new TestErdosConsoleInstance(
			session.sessionId,
			'dummy-session-name',
			session.metadata,
			session.runtimeMetadata,
			[],
			undefined
		);
		this.addTestConsoleInstance(instance);
		return instance;
	}
}

export class TestErdosConsoleInstance implements IErdosConsoleInstance {
	private readonly _onFocusInputEmitter = new Emitter<void>();
	private readonly _onDidChangeStateEmitter = new Emitter<ErdosConsoleState>();


	private readonly _onDidChangeRuntimeItemsEmitter = new Emitter<void>();
	private readonly _onDidPasteTextEmitter = new Emitter<string>();
	private readonly _onDidSelectAllEmitter = new Emitter<void>();
	private readonly _onDidClearConsoleEmitter = new Emitter<void>();

	private readonly _onDidSetPendingCodeEmitter = new Emitter<string | undefined>();
	private readonly _onDidExecuteCodeEmitter = new Emitter<ILanguageRuntimeCodeExecutedEvent>();
	private readonly _onDidSelectPlotEmitter = new Emitter<string>();
	private readonly _onDidRequestRestartEmitter = new Emitter<void>();
	private readonly _onDidAttachSessionEmitter = new Emitter<ILanguageRuntimeSession | undefined>();
	private readonly _onDidChangeWidthInCharsEmitter = new Emitter<number>();

	private _state: ErdosConsoleState = ErdosConsoleState.Ready;


	private _promptActive: boolean = false;
	private _runtimeAttached: boolean = true;
	private _widthInChars: number = 80;
	private _initialWorkingDirectory: string = '';
	private _attachedRuntimeSession?: ILanguageRuntimeSession;

	constructor(
		public readonly sessionId: string,
		public readonly sessionName: string,
		public readonly sessionMetadata: IRuntimeSessionMetadata,
		public readonly runtimeMetadata: ILanguageRuntimeMetadata,
		public readonly runtimeItems: RuntimeItem[] = [],
		public readonly codeEditor: ICodeEditor | undefined = undefined
	) { }

	get onFocusInput(): Event<void> {
		return this._onFocusInputEmitter.event;
	}

	get onDidChangeState(): Event<ErdosConsoleState> {
		return this._onDidChangeStateEmitter.event;
	}





	get onDidChangeRuntimeItems(): Event<void> {
		return this._onDidChangeRuntimeItemsEmitter.event;
	}

	get onDidPasteText(): Event<string> {
		return this._onDidPasteTextEmitter.event;
	}

	get onDidSelectAll(): Event<void> {
		return this._onDidSelectAllEmitter.event;
	}

	get onDidClearConsole(): Event<void> {
		return this._onDidClearConsoleEmitter.event;
	}

	get onDidSetPendingCode(): Event<string | undefined> {
		return this._onDidSetPendingCodeEmitter.event;
	}

	get onDidExecuteCode(): Event<ILanguageRuntimeCodeExecutedEvent> {
		return this._onDidExecuteCodeEmitter.event;
	}

	get onDidSelectPlot(): Event<string> {
		return this._onDidSelectPlotEmitter.event;
	}

	get onDidRequestRestart(): Event<void> {
		return this._onDidRequestRestartEmitter.event;
	}

	get onDidAttachSession(): Event<ILanguageRuntimeSession | undefined> {
		return this._onDidAttachSessionEmitter.event;
	}

	get onDidChangeWidthInChars(): Event<number> {
		return this._onDidChangeWidthInCharsEmitter.event;
	}

	get state(): ErdosConsoleState {
		return this._state;
	}





	get promptActive(): boolean {
		return this._promptActive;
	}

	get runtimeAttached(): boolean {
		return this._runtimeAttached;
	}

	scrollLocked: boolean = false;
	lastScrollTop: number = 0;

	setState(state: ErdosConsoleState): void {
		this._state = state;
		this._onDidChangeStateEmitter.fire(state);
	}





	setPromptActive(promptActive: boolean): void {
		this._promptActive = promptActive;
	}

	setRuntimeAttached(runtimeAttached: boolean): void {
		this._runtimeAttached = runtimeAttached;
	}

	addDisposables(_disposables: IDisposable): void {
	}

	focusInput(): void {
		this._onFocusInputEmitter.fire();
	}

	setWidthInChars(newWidth: number): void {
		if (this._widthInChars !== newWidth) {
			this._widthInChars = newWidth;
			this._onDidChangeWidthInCharsEmitter.fire(newWidth);
		}
	}

	getWidthInChars(): number {
		return this._widthInChars;
	}





	pasteText(text: string): void {
		this._onDidPasteTextEmitter.fire(text);
	}

	selectAll(): void {
		this._onDidSelectAllEmitter.fire();
	}

	clearConsole(): void {
		this._onDidClearConsoleEmitter.fire();
	}

	setPendingCode(code: string | undefined): void {
		this._onDidSetPendingCodeEmitter.fire(code);
	}

	restartSession(): void {
		this._onDidRequestRestartEmitter.fire();
	}

	executeCode(
		code: string,
		attribution: IConsoleCodeAttribution,
		mode?: RuntimeCodeExecutionMode,
		errorBehavior?: RuntimeErrorBehavior,
		executionId?: string
	): void {
		const event: ILanguageRuntimeCodeExecutedEvent = {
			sessionId: this.sessionId,
			languageId: this.runtimeMetadata.languageId,
			code,
			attribution,
			runtimeName: this.runtimeMetadata.runtimeName,
			mode: mode || RuntimeCodeExecutionMode.Interactive,
			errorBehavior: errorBehavior || RuntimeErrorBehavior.Continue
		};
		this._onDidExecuteCodeEmitter.fire(event);
	}

	fireCodeExecutionEvent(event: ILanguageRuntimeCodeExecutedEvent): void {
		this._onDidExecuteCodeEmitter.fire(event);
	}

	selectPlot(plot: string): void {
		this._onDidSelectPlotEmitter.fire(plot);
	}

	interrupt(code: string): void {
	}

	getClipboardRepresentation(commentPrefix: string): string[] {
		return [];
	}

	replayExecutions(entries: any[]): void {
	}

	get initialWorkingDirectory(): string {
		return this._initialWorkingDirectory;
	}

	set initialWorkingDirectory(value: string) {
		this._initialWorkingDirectory = value;
	}

	async enqueueCode(
		code: string,
		attribution: IConsoleCodeAttribution,
		allowIncomplete?: boolean,
		mode?: RuntimeCodeExecutionMode,
		errorBehavior?: RuntimeErrorBehavior,
		executionId?: string
	): Promise<void> {
		this.executeCode(code, attribution, mode, errorBehavior, executionId);
	}

	replyToPrompt(value: string): void {
	}

	attachRuntimeSession(session: ILanguageRuntimeSession | undefined, mode: SessionAttachMode): void {
		this._attachedRuntimeSession = session;
		this._runtimeAttached = !!session;
		this._onDidAttachSessionEmitter.fire(session);
	}

	get attachedRuntimeSession(): ILanguageRuntimeSession | undefined {
		return this._attachedRuntimeSession;
	}

	attachSession(session: ILanguageRuntimeSession): void {
		this.attachRuntimeSession(session, SessionAttachMode.Connected);
	}

	detachSession(): void {
		this.attachRuntimeSession(undefined, SessionAttachMode.Connected);
	}

	addRuntimeItem(runtimeItem: RuntimeItem): void {
		(this.runtimeItems as RuntimeItem[]).push(runtimeItem);
		this._onDidChangeRuntimeItemsEmitter.fire();
	}
}
