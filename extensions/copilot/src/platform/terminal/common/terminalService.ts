/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

export const ITerminalService = createServiceIdentifier<ITerminalService>('ITerminalService');

export interface ITerminalService {

	readonly _serviceBrand: undefined;

	readonly terminalBuffer: string;

	readonly terminalLastCommand: vscode.TerminalExecutedCommand | undefined;

	readonly terminalSelection: string;

	readonly terminalShellType: string;

	readonly onDidChangeTerminalShellIntegration: vscode.Event<vscode.TerminalShellIntegrationChangeEvent>;
	readonly onDidEndTerminalShellExecution: vscode.Event<vscode.TerminalShellExecutionEndEvent>;
	readonly onDidCloseTerminal: vscode.Event<vscode.Terminal>;
	readonly onDidWriteTerminalData: vscode.Event<vscode.TerminalDataWriteEvent>;

	/**
	 * See {@link vscode.window.createTerminal}.
	 */
	createTerminal(name?: string, shellPath?: string, shellArgs?: readonly string[] | string): vscode.Terminal;
	createTerminal(options: vscode.TerminalOptions): vscode.Terminal;
	createTerminal(options: vscode.ExtensionTerminalOptions): vscode.Terminal;

	/**
	 * Gets the buffer for a terminal.
	 * @param maxChars The maximum number of chars to return from the buffer, defaults to 16k
	 */
	getBufferForTerminal(terminal: vscode.Terminal, maxChars?: number): string;

	/**
	 * Gets the buffer for a terminal with the given pid.
	 * @param maxChars The maximum number of chars to return from the buffer, defaults to 16k
	 */
	getBufferWithPid(pid: number, maxChars?: number): Promise<string>;

	/**
	 * Gets the last command executed in a terminal.
	 * @param terminal The terminal to get the last command for
	 */
	getLastCommandForTerminal(terminal: vscode.Terminal): vscode.TerminalExecutedCommand | undefined;

	/**
	 * Contributes a path to the terminal PATH environment variable.
	 * @param contributor Unique identifier for the contributor
	 * @param pathLocation The path to add to PATH
	 * @param description Optional description for the PATH contribution
	 * @param prepend Whether to prepend (true) or append (false) the path. Defaults to false (append).
	*/
	contributePath(contributor: string, pathLocation: string, description?: string, prepend?: boolean): void;
	/**
	 * Contributes a path to the terminal PATH environment variable.
	 * @param contributor Unique identifier for the contributor
	 * @param pathLocation The path to add to PATH
	 * @param description Optional command thats contributed in the Terminal.
	 * @param prepend Whether to prepend (true) or append (false) the path. Defaults to false (append).
	*/
	contributePath(contributor: string, pathLocation: string, description?: { command: string }, prepend?: boolean): void;

	/**
	 * Removes a path contribution from the terminal PATH environment variable.
	 * @param contributor Unique identifier for the contributor
	 */
	removePathContribution(contributor: string): void;

	readonly terminals: readonly vscode.Terminal[];
}

export const enum ShellIntegrationQuality {
	None = 'none',
	Basic = 'basic',
	Rich = 'rich',
}


export class NullTerminalService extends Disposable implements ITerminalService {
	private _onDidWriteTerminalData = this._register(new Emitter<vscode.TerminalDataWriteEvent>());
	onDidWriteTerminalData: Event<vscode.TerminalDataWriteEvent> = this._onDidWriteTerminalData.event;
	private _onDidChangeTerminalShellIntegration = this._register(new Emitter<vscode.TerminalShellIntegrationChangeEvent>());
	onDidChangeTerminalShellIntegration: Event<vscode.TerminalShellIntegrationChangeEvent> = this._onDidChangeTerminalShellIntegration.event;
	private _onDidEndTerminalShellExecution = this._register(new Emitter<vscode.TerminalShellExecutionEndEvent>());
	onDidEndTerminalShellExecution: Event<vscode.TerminalShellExecutionEndEvent> = this._onDidEndTerminalShellExecution.event;
	private _onDidCloseTerminal = this._register(new Emitter<vscode.Terminal>());
	onDidCloseTerminal: Event<vscode.Terminal> = this._onDidCloseTerminal.event;

	declare readonly _serviceBrand: undefined;

	static readonly Instance = new NullTerminalService();

	get terminalBuffer(): string {
		return '';
	}

	get terminalLastCommand(): vscode.TerminalExecutedCommand | undefined {
		return undefined;
	}

	get terminalSelection(): string {
		return '';
	}

	get terminalShellType(): string {
		return '';
	}

	async getCwdForSession(sessionId: string): Promise<vscode.Uri | undefined> {
		return Promise.resolve(undefined);
	}

	async getCopilotTerminals(sessionId: string): Promise<IKnownTerminal[]> {
		return Promise.resolve([]);
	}

	getTerminalsWithSessionInfo(): Promise<{ terminal: IKnownTerminal; sessionId: string; shellIntegrationQuality: ShellIntegrationQuality }[]> {
		throw new Error('Method not implemented.');
	}

	getToolTerminalForSession(sessionId: string): Promise<{ terminal: IKnownTerminal; shellIntegrationQuality: ShellIntegrationQuality } | undefined> {
		throw new Error('Method not implemented.');
	}

	async associateTerminalWithSession(terminal: vscode.Terminal, sessionId: string, shellIntegrationquality: ShellIntegrationQuality): Promise<void> {
		Promise.resolve();
	}

	createTerminal(name?: string, shellPath?: string, shellArgs?: readonly string[] | string): vscode.Terminal;
	createTerminal(options: vscode.TerminalOptions): vscode.Terminal;
	createTerminal(options: vscode.ExtensionTerminalOptions): vscode.Terminal;
	createTerminal(name?: any, shellPath?: any, shellArgs?: any): vscode.Terminal {
		return {} as vscode.Terminal;
	}

	get terminals(): readonly vscode.Terminal[] {
		return [];
	}

	getBufferForTerminal(terminal: vscode.Terminal, maxLines?: number): string {
		return '';
	}

	getBufferWithPid(pid: number, maxChars?: number): Promise<string> {
		return Promise.resolve('');
	}

	getLastCommandForTerminal(terminal: vscode.Terminal): vscode.TerminalExecutedCommand | undefined {
		return undefined;
	}

	contributePath(contributor: string, pathLocation: string, description?: string, prepend?: boolean): void;
	contributePath(contributor: string, pathLocation: string, description?: { command: string }, prepend?: boolean): void;
	contributePath(contributor: unknown, pathLocation: unknown, description?: unknown, prepend?: unknown): void {
		// No-op for null service
	}


	removePathContribution(contributor: string): void {
		// No-op for null service
	}
}
export function isTerminalService(thing: any): thing is ITerminalService {
	return thing && typeof thing.createTerminal === 'function';
}
export function isNullTerminalService(thing: any): thing is NullTerminalService {
	return thing && typeof thing.createTerminal === 'function' && thing.createTerminal() === undefined;
}

export interface IKnownTerminal extends vscode.Terminal {
	id: string;
}