/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { PromiseHandles, timeout } from './util';
import { RStatementRangeProvider } from './statement-range';
import { LOGGER } from './extension';
import { RErrorHandler } from './error-handler';
import { ILanguageRuntimeMetadata, ILangaugeRuntimeDynState } from '../../../src/vs/workbench/services/languageRuntime/common/languageRuntimeService.js';

import {
	LanguageClient,
	LanguageClientOptions,
	State,
	StreamInfo,
	RevealOutputChannelOn
} from 'vscode-languageclient/node';

import { Socket } from 'net';
import { RHelpTopicProvider } from './help';
import { RLspOutputChannelManager } from './lsp-output-channel-manager';
import { R_DOCUMENT_SELECTORS } from './provider';
import { VirtualDocumentProvider } from './virtual-documents';

export enum LspState {
	uninitialized = 'uninitialized',
	starting = 'starting',
	stopped = 'stopped',
	running = 'running',
}

export class ArkLsp implements vscode.Disposable {

	private _client?: LanguageClient;

	private _state: LspState = LspState.uninitialized;
	private _stateEmitter = new vscode.EventEmitter<LspState>();
	onDidChangeState = this._stateEmitter.event;

	private _initializing?: Promise<void>;

	private activationDisposables: vscode.Disposable[] = [];

	public constructor(
		private readonly _version: string,
		private readonly _metadata: ILanguageRuntimeMetadata,
		private readonly _dynState: ILangaugeRuntimeDynState,
	) { }

	private setState(state: LspState) {
		this._state = state;
		this._stateEmitter.fire(state);
	}

	public async activate(port: number): Promise<void> {

		this.activationDisposables.forEach(d => d.dispose());
		this.activationDisposables = [];

		const serverOptions = async (): Promise<StreamInfo> => {
			const out = new PromiseHandles<StreamInfo>();
			const socket = new Socket();

			socket.on('ready', () => {
				const streams: StreamInfo = {
					reader: socket,
					writer: socket
				};
				out.resolve(streams);
			});
			socket.on('error', (error) => {
				out.reject(error);
			});
			socket.connect(port);

			return out.promise;
		};

		const { notebookUri } = this._metadata;

		const outputChannel = RLspOutputChannelManager.instance.getOutputChannel(
			this._dynState.sessionName,
			this._metadata.sessionMode
		);

		const clientOptions: LanguageClientOptions = {
			documentSelector: notebookUri ?
				[{ language: 'r', pattern: notebookUri.fsPath }] :
				R_DOCUMENT_SELECTORS,
			synchronize: notebookUri ?
				undefined :
				{
					fileEvents: vscode.workspace.createFileSystemWatcher('**/*.R')
				},
			errorHandler: new RErrorHandler(this._version, port),
			outputChannel: outputChannel,
			revealOutputChannelOn: RevealOutputChannelOn.Never,
			middleware: {
				handleDiagnostics(uri, diagnostics, next) {
					if (uri.scheme === 'assistant-code-confirmation-widget') {
						return undefined;
					}
					return next(uri, diagnostics);
				},
			}
		};

		const id = 'erdos.r';

		const message = `Creating Erdos R ${this._version} language client (port ${port})`;
		LOGGER.info(message);
		outputChannel.appendLine(message);

		this._client = new LanguageClient(id, `Erdos R Language Server (${this._version})`, serverOptions, clientOptions);

		const out = new PromiseHandles<void>();
		this._initializing = out.promise;

		this.activationDisposables.push(this._client.onDidChangeState(event => {
			const oldState = this._state;
			switch (event.newState) {
				case State.Starting:
					this.setState(LspState.starting);
					break;
				case State.Running:
					if (this._initializing) {
						LOGGER.info(`ARK (R ${this._version}) language client init successful`);
						this._initializing = undefined;
						if (this._client) {
							this.registerErdosLspExtensions(this._client);
						}
						out.resolve();
					}
					this.setState(LspState.running);
					break;
				case State.Stopped:
					if (this._initializing) {
						LOGGER.info(`ARK (R ${this._version}) language client init failed`);
						out.reject('Ark LSP client stopped before initialization');
					}
					this.setState(LspState.stopped);
					break;
			}
			LOGGER.info(`ARK (R ${this._version}) language client state changed ${oldState} => ${this._state}`);
		}));

		this._client.start();
		await out.promise;
	}

	public async deactivate() {
		if (!this._client) {
			return;
		}

		if (!this._client.needsStop()) {
			return;
		}

		await this._initializing;

		const stopped = new Promise<void>((resolve) => {
			const disposable = this._client!.onDidChangeState((event) => {
				if (event.newState === State.Stopped) {
					resolve();
					disposable.dispose();
				}
			});
		});

		this._client!.stop();

		await Promise.race([stopped, timeout(2000, 'waiting for client to stop')]);
	}

	get state(): LspState {
		return this._state;
	}

	async wait(): Promise<boolean> {
		switch (this.state) {
			case LspState.running: return true;
			case LspState.stopped: return false;

			case LspState.starting: {
				await this._initializing;
				return true;
			}

			case LspState.uninitialized: {
				const handles = new PromiseHandles<boolean>();

				const cleanup = this.onDidChangeState(state => {
					let out: boolean;
					switch (this.state) {
						case LspState.running: out = true; break;
						case LspState.stopped: out = false; break;
						case LspState.uninitialized: return;
						case LspState.starting: {
							if (this._initializing) {
								cleanup.dispose();
								this._initializing.
									then(() => handles.resolve(true)).
									catch((err) => handles.reject(err));
							}
							return;
						}
					}

					cleanup.dispose();
					handles.resolve(out);
				});

				return await handles.promise;
			}
		}
	}

	private registerErdosLspExtensions(client: LanguageClient) {
		const vdocDisposable = vscode.workspace.registerTextDocumentContentProvider('ark',
			new VirtualDocumentProvider(client));
		this.activationDisposables.push(vdocDisposable);

		const rangeDisposable = vscode.languages.registerDocumentRangeFormattingEditProvider('r',
			new RStatementRangeProvider(client));
		this.activationDisposables.push(rangeDisposable);

		const helpDisposable = vscode.languages.registerHoverProvider('r',
			new RHelpTopicProvider(client));
		this.activationDisposables.push(helpDisposable);
	}

	async dispose() {
		this.activationDisposables.forEach(d => d.dispose());
		await this.deactivate();
	}

	public showOutput() {
		const outputChannel = RLspOutputChannelManager.instance.getOutputChannel(
			this._dynState.sessionName,
			this._metadata.sessionMode
		);
		outputChannel.show();
	}
}
