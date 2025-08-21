/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { RuntimeItem } from '../classes/runtimeItems.js';
import { Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

import { ILanguageRuntimeSession, IRuntimeSessionMetadata } from '../../../runtimeSession/common/runtimeSessionService.js';
import { ILanguageRuntimeMetadata, RuntimeCodeExecutionMode, RuntimeErrorBehavior } from '../../../languageRuntime/common/languageRuntimeService.js';
import { IConsoleCodeAttribution, ILanguageRuntimeCodeExecutedEvent } from '../../common/erdosConsoleCodeExecution.js';

export const IErdosConsoleService = createDecorator<IErdosConsoleService>('erdosConsoleService');

export const ERDOS_CONSOLE_VIEW_ID = 'workbench.panel.erdosConsole';

export const enum ErdosConsoleState {
	Uninitialized = 'Uninitialized',
	Starting = 'Starting',
	Busy = 'Busy',
	Ready = 'Ready',
	Offline = 'Offline',
	Exiting = 'Exiting',
	Exited = 'Exited',
	Disconnected = 'Disconnected'
}

export interface IErdosConsoleService {
	readonly _serviceBrand: undefined;
	readonly erdosConsoleInstances: IErdosConsoleInstance[];
	readonly activeErdosConsoleInstance?: IErdosConsoleInstance;
	readonly activeCodeEditor: ICodeEditor | undefined;
	readonly onDidStartErdosConsoleInstance: Event<IErdosConsoleInstance>;
	readonly onDidDeleteErdosConsoleInstance: Event<IErdosConsoleInstance>;
	readonly onDidChangeActiveErdosConsoleInstance: Event<IErdosConsoleInstance | undefined>;
	setActiveErdosConsoleSession(sessionId: string): void;
	deleteErdosConsoleSession(sessionId: string): void;
	readonly onDidChangeConsoleWidth: Event<number>;
	initialize(): void;
	getConsoleWidth(): number;
	executeCode(languageId: string,
		code: string,
		attribution: IConsoleCodeAttribution,
		focus: boolean,
		allowIncomplete?: boolean,
		mode?: RuntimeCodeExecutionMode,
		errorBehavior?: RuntimeErrorBehavior,
		executionId?: string): Promise<string>;
	onDidExecuteCode: Event<ILanguageRuntimeCodeExecutedEvent>;
}

export enum SessionAttachMode {
	Starting = 'starting',
	Restarting = 'restarting',
	Switching = 'switching',
	Reconnecting = 'reconnecting',
	Connected = 'connected',
}

export interface IErdosConsoleInstance {
	readonly state: ErdosConsoleState;
	readonly sessionMetadata: IRuntimeSessionMetadata;
	readonly runtimeMetadata: ILanguageRuntimeMetadata;
	readonly sessionId: string;
	readonly sessionName: string;
	readonly trace: boolean;
	readonly wordWrap: boolean;
	readonly runtimeItems: RuntimeItem[];
	readonly promptActive: boolean;
	readonly runtimeAttached: boolean;
	scrollLocked: boolean;
	lastScrollTop: number;
	addDisposables(disposables: IDisposable): void;
	readonly onFocusInput: Event<void>;
	readonly onDidChangeState: Event<ErdosConsoleState>;
	readonly onDidChangeWordWrap: Event<boolean>;
	readonly onDidChangeTrace: Event<boolean>;
	readonly onDidChangeRuntimeItems: Event<void>;
	readonly onDidPasteText: Event<string>;
	readonly onDidSelectAll: Event<void>;
	readonly onDidClearConsole: Event<void>;
	readonly onDidSetPendingCode: Event<string | undefined>;
	readonly onDidExecuteCode: Event<ILanguageRuntimeCodeExecutedEvent>;
	readonly onDidSelectPlot: Event<string>;
	readonly onDidRequestRestart: Event<void>;
	readonly onDidAttachSession: Event<ILanguageRuntimeSession | undefined>;
	readonly onDidChangeWidthInChars: Event<number>;
	focusInput(): void;
	setWidthInChars(newWidth: number): void;
	getWidthInChars(): number;
	codeEditor: ICodeEditor | undefined;
	toggleTrace(): void;
	toggleWordWrap(): void;
	pasteText(text: string): void;
	selectAll(): void;
	clearConsole(): void;
	interrupt(code?: string): void;
	getClipboardRepresentation(commentPrefix: string): string[];
	initialWorkingDirectory: string;
	enqueueCode(code: string,
		attribution: IConsoleCodeAttribution,
		allowIncomplete?: boolean,
		mode?: RuntimeCodeExecutionMode,
		errorBehavior?: RuntimeErrorBehavior,
		executionId?: string): Promise<void>;
	executeCode(code: string,
		attribution: IConsoleCodeAttribution,
		mode?: RuntimeCodeExecutionMode,
		errorBehavior?: RuntimeErrorBehavior,
		executionId?: string): void;
	replyToPrompt(value: string): void;
	attachRuntimeSession(session: ILanguageRuntimeSession | undefined, mode: SessionAttachMode): void;
	attachedRuntimeSession: ILanguageRuntimeSession | undefined;
}
