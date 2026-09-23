/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import type { CreateTerminalParams } from '../../common/state/protocol/commands.js';
import { TerminalClaimKind, TerminalLifecycleStatus, type TerminalClaim, type TerminalInfo, type TerminalState } from '../../common/state/protocol/state.js';
import type { IAgentHostTerminalManager, ICommandFinishedEvent, IRetainedTerminalState } from '../../node/agentHostTerminalManager.js';

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
	readonly retainedTerminalStates = new Map<string, IRetainedTerminalState>();
	private readonly _outputTerminalStates = new Map<string, TerminalState>();

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
	supportsCommandDetection(): boolean { return this.commandDetectionSupported; }
	disposeTerminal(uri: string): void {
		this.disposedTerminals.push(uri);
		this._outputTerminalStates.delete(uri);
		this.retainedTerminalStates.delete(uri);
	}
	getTerminalInfos(): TerminalInfo[] { return []; }
	getTerminalState(uri: string): TerminalState | undefined { return this._outputTerminalStates.get(uri); }
	async resolveRetainedTerminalState(): Promise<TerminalState | undefined> { return undefined; }
	async statRetainedTerminalOutput(): Promise<undefined> { return undefined; }
	async readRetainedTerminalOutput(): Promise<undefined> { return undefined; }
	retainTerminalState(uri: string, state: IRetainedTerminalState): void {
		this.retainedTerminalStates.set(uri, state);
		this._outputTerminalStates.delete(uri);
	}
	removeRetainedTerminalsForOwner(owner: URI): void {
		for (const [uri, retained] of this.retainedTerminalStates) {
			if (retained.claim.kind === TerminalClaimKind.Session && (retained.claim.session === owner.toString() || retained.claim.chat === owner.toString())) {
				this.retainedTerminalStates.delete(uri);
			}
		}
	}
	async getDefaultShell(): Promise<string> { return this.defaultShell; }
	createOutputTerminal(uri: string, options: { title: string; claim: TerminalClaim }): void {
		this.outputTerminalsCreated.push({ uri, title: options.title, claim: options.claim });
		this._outputTerminalStates.set(uri, {
			title: options.title,
			content: [],
			lifecycle: { status: TerminalLifecycleStatus.Running },
			claim: options.claim,
			isPty: false,
		});
	}
	appendOutputTerminalData(uri: string, data: string): void {
		this.outputTerminalData.push({ uri, data });
		const state = this._outputTerminalStates.get(uri);
		if (!state) {
			return;
		}
		const tail = state.content.at(-1);
		if (tail?.type === 'unclassified') {
			tail.value += data;
		} else {
			state.content.push({ type: 'unclassified', value: data });
		}
	}
	resetOutputTerminal(uri: string): void {
		this.outputTerminalResets.push(uri);
		const state = this._outputTerminalStates.get(uri);
		if (state) {
			state.content = [];
		}
	}
	finalizeOutputTerminal(uri: string, exitCode: number | undefined): void {
		this.outputTerminalsFinalized.push({ uri, exitCode });
		const state = this._outputTerminalStates.get(uri);
		if (state) {
			state.lifecycle = exitCode === undefined
				? { status: TerminalLifecycleStatus.Exited }
				: { status: TerminalLifecycleStatus.Exited, exitCode };
		}
	}
	fireCommandFinished(event: ICommandFinishedEvent): void { this._onCommandFinished.fire(event); }
}
