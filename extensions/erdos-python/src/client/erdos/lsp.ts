/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, State, StreamInfo } from 'vscode-languageclient/node';
import { Socket } from 'net';
import * as erdos from 'erdos';

import { PYTHON_LANGUAGE } from '../common/constants';
import { IServiceContainer } from '../ioc/types';
import { traceError, traceInfo } from '../logging';
import { ProgressReporting } from '../activation/progress';
import { PromiseHandles } from './util';
import { PythonErrorHandler } from './errorHandler';
import { PythonHelpTopicProvider } from './help';
import { PythonStatementRangeProvider } from './statementRange';
import { PythonLspOutputChannelManager } from './lspOutputChannelManager';

export enum LspState {
    uninitialized = 'uninitialized',
    starting = 'starting',
    stopped = 'stopped',
    running = 'running',
}

export class PythonLsp implements vscode.Disposable {
    private _client?: LanguageClient;

    private _state: LspState = LspState.uninitialized;

    private _initializing?: Promise<void>;

    private _outputChannel: vscode.OutputChannel;

    private activationDisposables: vscode.Disposable[] = [];

    public constructor(
        private readonly serviceContainer: IServiceContainer,
        private readonly _version: string,
        private readonly _clientOptions: LanguageClientOptions,
        private readonly _metadata: erdos.RuntimeSessionMetadata,
        private readonly _dynState: erdos.LanguageRuntimeDynState,
    ) {
        this._outputChannel = PythonLspOutputChannelManager.instance.getOutputChannel(
            this._dynState.sessionName,
            this._metadata.sessionMode,
        );
    }

    public async activate(port: number): Promise<void> {
        this.activationDisposables.forEach((d) => d.dispose());
        this.activationDisposables = [];

        const serverOptions = async (): Promise<StreamInfo> => {
            const out = new PromiseHandles<StreamInfo>();
            const socket = new Socket();

            socket.on('ready', () => {
                const streams: StreamInfo = {
                    reader: socket,
                    writer: socket,
                };
                out.resolve(streams);
            });
            socket.on('error', (error) => {
                out.reject(error);
            });
            socket.connect(port);

            return out.promise;
        };

        const { notebookUri, workingDirectory } = this._metadata;

        this._clientOptions.documentSelector = notebookUri
            ? [{ language: 'python', pattern: notebookUri.fsPath }]
            : [
                  { language: 'python', scheme: 'untitled' },
                  { language: 'python', scheme: 'inmemory' },
                  { language: 'python', pattern: '**/*.py' },
              ];

        this._clientOptions.notebookDocumentOptions = notebookUri
            ? {
                  filterCells: (notebookDocument, cells) =>
                      notebookUri.toString() === notebookDocument.uri.toString() ? cells : [],
              }
            : { filterCells: () => [] };

        this._clientOptions.errorHandler = new PythonErrorHandler(this._version, port);

        this._clientOptions.outputChannel = this._outputChannel as any;

        if (notebookUri) {
            this._clientOptions.initializationOptions.erdos = {
                working_directory: workingDirectory,
            };
        }

        const message = `Creating Python ${this._version} language client (port ${port})`;
        traceInfo(message);
        this._outputChannel.appendLine(message);

        this._client = new LanguageClient(
            PYTHON_LANGUAGE,
            `Python Language Server (${this._version})`,
            serverOptions,
            this._clientOptions,
        );

        const out = new PromiseHandles<void>();
        this._initializing = out.promise;

        this.activationDisposables.push(
            this._client.onDidChangeState((event) => {
                const oldState = this._state;
                switch (event.newState) {
                    case State.Starting:
                        this._state = LspState.starting;
                        break;
                    case State.Running:
                        if (this._initializing) {
                            traceInfo(`Python (${this._version}) language client init successful`);
                            this._initializing = undefined;
                            out.resolve();
                        }
                        if (this._client) {
                            this.registerErdosLspExtensions(this._client);
                        }
                        this._state = LspState.running;
                        break;
                    case State.Stopped:
                        if (this._initializing) {
                            traceInfo(`Python (${this._version}) language client init failed`);
                            out.reject('Python LSP client stopped before initialization');
                        }
                        this._state = LspState.stopped;
                        break;
                    default:
                        traceError(`Unexpected language client state: ${event.newState}`);
                        out.reject('Unexpected language client state');
                }
                traceInfo(`Python (${this._version}) language client state changed ${oldState} => ${this._state}`);
            }),
        );

        this.activationDisposables.push(new ProgressReporting(this._client));

        this._client.start();
        await out.promise;
    }

    public async deactivate(): Promise<void> {
        if (!this._client) {
            this._outputChannel.appendLine('No client to stop');
            return;
        }

        if (!this._client.needsStop()) {
            this._outputChannel.appendLine('Client does not need to stop');
            return;
        }

        this._outputChannel.appendLine('Waiting for client to initialize before stopping');
        await this._initializing;

        this._outputChannel.appendLine('Client initialized, stopping');
        const stopped = new Promise<void>((resolve) => {
            const disposable = this._client!.onDidChangeState((event) => {
                this._outputChannel.appendLine(`Client stopped state change: ${event.newState}`);
                if (event.newState === State.Stopped) {
                    this._outputChannel.appendLine('Client stopped');
                    resolve();
                    disposable.dispose();
                }
            });
            this._client!.stop();
        });

        const timeout = new Promise<void>((_, reject) => {
            setTimeout(() => {
                this._outputChannel.appendLine(`Timed out after 2 seconds waiting for client to stop.`);
                reject(Error(`Timed out after 2 seconds waiting for client to stop.`));
            }, 2000);
        });

        await Promise.race([stopped, timeout]);
    }

    get state(): LspState {
        return this._state;
    }

    private registerErdosLspExtensions(client: LanguageClient) {
        const rangeDisposable = erdos.languages.registerStatementRangeProvider(
            'python',
            new PythonStatementRangeProvider(this.serviceContainer),
        );
        this.activationDisposables.push(rangeDisposable);

        const helpDisposable = erdos.languages.registerHelpTopicProvider(
            'python',
            new PythonHelpTopicProvider(client),
        );
        this.activationDisposables.push(helpDisposable);
    }

    async dispose(): Promise<void> {
        this.activationDisposables.forEach((d) => d.dispose());
        await this.deactivate();
    }

    public showOutput(): void {
        this._outputChannel.show();
    }
}
