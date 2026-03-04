/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IReference, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogger, log, LogLevel } from '../../../../platform/log/common/log.js';
import { IMcpHostDelegate, IMcpMessageTransport } from './mcpRegistryTypes.js';
import { McpServerRequestHandler } from './mcpServerRequestHandler.js';
import { McpTaskManager } from './mcpTaskManager.js';
import { IMcpClientMethods, IMcpPotentialSandboxBlock, IMcpServerConnection, McpCollectionDefinition, McpConnectionState, McpServerDefinition, McpServerLaunch } from './mcpTypes.js';

export class McpServerConnection extends Disposable implements IMcpServerConnection {
	private readonly _launch = this._register(new MutableDisposable<IReference<IMcpMessageTransport>>());
	private readonly _state = observableValue<McpConnectionState>('mcpServerState', { state: McpConnectionState.Kind.Stopped });
	private readonly _requestHandler = observableValue<McpServerRequestHandler | undefined>('mcpServerRequestHandler', undefined);
	private readonly _onPotentialSandboxBlock = this._register(new Emitter<IMcpPotentialSandboxBlock>());

	public readonly state: IObservable<McpConnectionState> = this._state;
	public readonly handler: IObservable<McpServerRequestHandler | undefined> = this._requestHandler;
	public readonly onPotentialSandboxBlock = this._onPotentialSandboxBlock.event;

	constructor(
		private readonly _collection: McpCollectionDefinition,
		public readonly definition: McpServerDefinition,
		private readonly _delegate: IMcpHostDelegate,
		public readonly launchDefinition: McpServerLaunch,
		private readonly _logger: ILogger,
		private readonly _errorOnUserInteraction: boolean | undefined,
		private readonly _taskManager: McpTaskManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	/** @inheritdoc */
	public async start(methods: IMcpClientMethods): Promise<McpConnectionState> {
		const currentState = this._state.get();
		if (!McpConnectionState.canBeStarted(currentState.state)) {
			return this._waitForState(McpConnectionState.Kind.Running, McpConnectionState.Kind.Error);
		}

		this._launch.value = undefined;
		this._state.set({ state: McpConnectionState.Kind.Starting }, undefined);
		this._logger.info(localize('mcpServer.starting', 'Starting server {0}', this.definition.label));

		try {
			const launch = this._delegate.start(this._collection, this.definition, this.launchDefinition, { errorOnUserInteraction: this._errorOnUserInteraction });
			this._launch.value = this.adoptLaunch(launch, methods);
			return this._waitForState(McpConnectionState.Kind.Running, McpConnectionState.Kind.Error);
		} catch (e) {
			const errorState: McpConnectionState = {
				state: McpConnectionState.Kind.Error,
				message: e instanceof Error ? e.message : String(e)
			};
			this._state.set(errorState, undefined);
			return errorState;
		}
	}

	private adoptLaunch(launch: IMcpMessageTransport, methods: IMcpClientMethods): IReference<IMcpMessageTransport> {
		const store = new DisposableStore();
		const cts = new CancellationTokenSource();

		store.add(toDisposable(() => cts.dispose(true)));
		store.add(launch);
		store.add(launch.onDidLog(({ level, message }) => {
			log(this._logger, level, message);
			const potentialBlock = this._toPotentialSandboxBlock(message);
			if (potentialBlock) {
				this._onPotentialSandboxBlock.fire(potentialBlock);
			}
		}));

		let didStart = false;
		store.add(autorun(reader => {
			const state = launch.state.read(reader);
			this._state.set(state, undefined);
			this._logger.info(localize('mcpServer.state', 'Connection state: {0}', McpConnectionState.toString(state)));

			if (state.state === McpConnectionState.Kind.Running && !didStart) {
				didStart = true;
				McpServerRequestHandler.create(this._instantiationService, {
					...methods,
					launch,
					logger: this._logger,
					requestLogLevel: this.definition.devMode ? LogLevel.Info : LogLevel.Debug,
					taskManager: this._taskManager,
				}, cts.token).then(
					handler => {
						if (!store.isDisposed) {
							this._requestHandler.set(handler, undefined);
						} else {
							handler.dispose();
						}
					},
					err => {
						if (!store.isDisposed && McpConnectionState.isRunning(this._state.read(undefined))) {
							let message = err.message;
							if (err instanceof CancellationError) {
								message = 'Server exited before responding to `initialize` request.';
								this._logger.error(message);
							} else {
								this._logger.error(err);
							}
							this._state.set({ state: McpConnectionState.Kind.Error, message }, undefined);
						}
						store.dispose();
					},
				);
			}
		}));

		return { dispose: () => store.dispose(), object: launch };
	}

	public async stop(): Promise<void> {
		this._logger.info(localize('mcpServer.stopping', 'Stopping server {0}', this.definition.label));
		this._launch.value?.object.stop();
		await this._waitForState(McpConnectionState.Kind.Stopped, McpConnectionState.Kind.Error);
	}

	public override dispose(): void {
		this._requestHandler.get()?.dispose();
		super.dispose();
		this._state.set({ state: McpConnectionState.Kind.Stopped }, undefined);
	}

	private _waitForState(...kinds: McpConnectionState.Kind[]): Promise<McpConnectionState> {
		const current = this._state.get();
		if (kinds.includes(current.state)) {
			return Promise.resolve(current);
		}

		return new Promise(resolve => {
			const disposable = autorun(reader => {
				const state = this._state.read(reader);
				if (kinds.includes(state.state)) {
					disposable.dispose();
					resolve(state);
				}
			});
		});
	}

	private _toPotentialSandboxBlock(message: string): IMcpPotentialSandboxBlock | undefined {
		if (!this.definition.sandboxEnabled) {
			return undefined;
		}

		if (/No matching config rule, denying:/i.test(message)) {
			return {
				kind: 'network',
				message,
				host: this._extractSandboxHost(message),
			};
		}

		if (/\b(?:EAI_AGAIN|ENOTFOUND)\b/i.test(message)) {
			return {
				kind: 'network',
				message,
				host: this._extractSandboxHost(message),
			};
		}

		if (/(?:\b(?:EACCES|EPERM|ENOENT|fail(?:ed|ure)?)\b|not accessible)/i.test(message)) {
			return {
				kind: 'filesystem',
				message,
				path: this._extractSandboxPath(message),
			};
		}

		return undefined;
	}

	private _extractSandboxPath(line: string): string | undefined {
		const bracketedPath = line.match(/\[(\/[^\]\r\n]+)\]/);
		if (bracketedPath?.[1]) {
			return bracketedPath[1].trim();
		}

		const quotedPath = line.match(/["'](\/[^"']+)["']/);
		if (quotedPath?.[1]) {
			return quotedPath[1];
		}

		const trailingPath = line.match(/(\/[\w.\-~/ ]+)$/);
		return trailingPath?.[1]?.trim();
	}

	private _extractSandboxHost(value: string): string | undefined {
		const deniedMatch = value.match(/No matching config rule, denying:\s+(.+)$/i);
		const matchTarget = deniedMatch?.[1] ?? value;
		const trimmed = matchTarget.trim().replace(/^["'`]+|["'`,.;]+$/g, '');
		if (!trimmed) {
			return undefined;
		}

		const withoutProtocol = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
		const firstToken = withoutProtocol.split(/[\s/]/, 1)[0] ?? '';
		const host = firstToken.replace(/:\d+$/, '');
		return host || undefined;
	}
}
