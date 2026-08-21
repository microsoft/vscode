/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import type { CreateTerminalParams } from '../../common/state/protocol/commands.js';
import type { TerminalClaim, TerminalInfo, TerminalState } from '../../common/state/protocol/state.js';
import type { IAgentHostTerminalManager, ICommandFinishedEvent } from '../../node/agentHostTerminalManager.js';

/**
 * Controllable fake {@link IAgentHostTerminalManager} for tests. `createTerminal`
 * records the request and announces the terminal URI via
 * {@link onDidCreateTerminal}; tests drive command completion with
 * {@link fireCommandFinished}. When no terminal interaction is needed it also
 * serves as a benign no-op stand-in.
 */
export class TestAgentHostTerminalManager extends Disposable implements IAgentHostTerminalManager {
	declare readonly _serviceBrand: undefined;

	defaultShell = '/bin/bash';
	commandDetectionSupported = true;
	readonly created: CreateTerminalParams[] = [];
	readonly sentTexts: { uri: string; data: string }[] = [];
	readonly disposedTerminals: string[] = [];
	readonly outputTerminalsCreated: { uri: string; title: string; claim: TerminalClaim }[] = [];
	readonly outputTerminalData: { uri: string; data: string }[] = [];
	readonly outputTerminalResets: string[] = [];
	readonly outputTerminalsFinalized: { uri: string; exitCode: number | undefined }[] = [];

	/** Resolves once a command-finished listener is registered (i.e. a command is running). */
	readonly commandFinishedListenerRegistered = new DeferredPromise<void>();

	private readonly _onCommandFinished = this._register(new Emitter<ICommandFinishedEvent>());
	private readonly _onData = this._register(new Emitter<string>());
	private readonly _onExit = this._register(new Emitter<number>());
	private readonly _onClaimChanged = this._register(new Emitter<TerminalClaim>());
	private readonly _onDidCreateTerminal = this._register(new Emitter<string>());
	readonly onDidCreateTerminal = this._onDidCreateTerminal.event;

	async createTerminal(params: CreateTerminalParams): Promise<void> {
		this.created.push(params);
		this._onDidCreateTerminal.fire(params.channel);
	}
	writeInput(): void { }
	async sendText(uri: string, data: string): Promise<void> { this.sentTexts.push({ uri, data }); }
	onData(_uri: string, cb: (data: string) => void): IDisposable { return this._onData.event(cb); }
	onExit(_uri: string, cb: (exitCode: number) => void): IDisposable { return this._onExit.event(cb); }
	onClaimChanged(_uri: string, cb: (claim: TerminalClaim) => void): IDisposable { return this._onClaimChanged.event(cb); }
	onCommandFinished(_uri: string, cb: (event: ICommandFinishedEvent) => void): IDisposable {
		this.commandFinishedListenerRegistered.complete();
		return this._onCommandFinished.event(cb);
	}
	createAltBufferPromise(): Promise<void> { return new Promise<void>(() => { }); }
	getContent(): string | undefined { return undefined; }
	getClaim(): TerminalClaim | undefined { return undefined; }
	hasTerminal(): boolean { return false; }
	getExitCode(): number | undefined { return undefined; }
	supportsCommandDetection(): boolean { return this.commandDetectionSupported; }
	disposeTerminal(uri: string): void { this.disposedTerminals.push(uri); }
	getTerminalInfos(): TerminalInfo[] { return []; }
	getTerminalState(): TerminalState | undefined { return undefined; }
	async getDefaultShell(): Promise<string> { return this.defaultShell; }
	createOutputTerminal(uri: string, options: { title: string; claim: TerminalClaim }): void { this.outputTerminalsCreated.push({ uri, title: options.title, claim: options.claim }); }
	appendOutputTerminalData(uri: string, data: string): void { this.outputTerminalData.push({ uri, data }); }
	resetOutputTerminal(uri: string): void { this.outputTerminalResets.push(uri); }
	finalizeOutputTerminal(uri: string, exitCode: number | undefined): void { this.outputTerminalsFinalized.push({ uri, exitCode }); }
	fireCommandFinished(event: ICommandFinishedEvent): void { this._onCommandFinished.fire(event); }
}
