/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

// eslint-disable-next-line import/no-unresolved
import * as erdos from 'erdos';

export interface JupyterSessionState {
	sessionId: string;
	logFile: string;
	profileFile?: string;
	connectionFile: string;
	processId: number;
}

export interface JupyterSession {
	readonly state: JupyterSessionState;
}

export interface JupyterKernel {
	connectToSession(session: JupyterSession): Promise<void>;
	log(msg: string): void;
}

export interface JupyterKernelSpec {
	argv: Array<string>;
	display_name: string;
	language: string;
	interrupt_mode?: 'signal' | 'message';
	env?: NodeJS.ProcessEnv;
	kernel_protocol_version: string;
	startKernel?: (session: JupyterSession, kernel: JupyterKernel) => Promise<void>;
}

export interface JupyterLanguageRuntimeSession extends erdos.LanguageRuntimeSession {
	startErdosLsp(clientId: string, ipAddress: string): Promise<number>;
	startErdosDap(clientId: string, debugType: string, debugName: string): Promise<void>;
	createErdosLspClientId(): string;
	createErdosDapClientId(): string;
	emitJupyterLog(message: string, logLevel?: vscode.LogLevel): void;
	showOutput(channel?: erdos.LanguageRuntimeSessionChannel): void;
	listOutputChannels(): erdos.LanguageRuntimeSessionChannel[];
	callMethod(method: string, ...args: Array<any>): Promise<any>;
	getKernelLogFile(): string;
}

export interface ErdosSupervisorApi extends vscode.Disposable {
	createSession(
		runtimeMetadata: erdos.LanguageRuntimeMetadata,
		sessionMetadata: erdos.RuntimeSessionMetadata,
		kernel: JupyterKernelSpec,
		dynState: erdos.LanguageRuntimeDynState,
		extra?: JupyterKernelExtra | undefined,
	): Promise<JupyterLanguageRuntimeSession>;

	validateSession(sessionId: string): Promise<boolean>;

	restoreSession(
		runtimeMetadata: erdos.LanguageRuntimeMetadata,
		sessionMetadata: erdos.RuntimeSessionMetadata,
		dynState: erdos.LanguageRuntimeDynState,
	): Promise<JupyterLanguageRuntimeSession>;
}

export interface JupyterKernelExtra {
	attachOnStartup?: {
		init: (args: Array<string>) => void;
		attach: () => Promise<void>;
	};
	sleepOnStartup?: {
		init: (args: Array<string>, delay: number) => void;
	};
}
