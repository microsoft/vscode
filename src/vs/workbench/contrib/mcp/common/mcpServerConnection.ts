/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, IReference, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogger, ILoggerService } from '../../../../platform/log/common/log.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { IMcpHostDelegate, IMcpMessageTransport } from './mcpRegistryTypes.js';
import { McpServerRequestHandler } from './mcpServerRequestHandler.js';
import { McpCollectionDefinition, IMcpServerConnection, McpServerDefinition, McpConnectionState, McpServerLaunch } from './mcpTypes.js';

export class McpServerConnection extends Disposable implements IMcpServerConnection {
	private readonly _launch = this._register(new MutableDisposable<IReference<IMcpMessageTransport>>());
	private readonly _state = observableValue<McpConnectionState>('mcpServerState', { state: McpConnectionState.Kind.Stopped });
	private readonly _requestHandler = observableValue<McpServerRequestHandler | undefined>('mcpServerRequestHandler', undefined);

	public readonly state: IObservable<McpConnectionState> = this._state;
	public readonly handler: IObservable<McpServerRequestHandler | undefined> = this._requestHandler;

	private readonly _loggerId: string;
	private readonly _logger: ILogger;

	constructor(
		private readonly _collection: McpCollectionDefinition,
		public readonly definition: McpServerDefinition,
		private readonly _delegate: IMcpHostDelegate,
		private readonly _launchDefinition: McpServerLaunch,
		@ILoggerService private readonly _loggerService: ILoggerService,
		@IOutputService private readonly _outputService: IOutputService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._loggerId = `mcpServer/${definition.id}`;
		this._logger = this._register(_loggerService.createLogger(this._loggerId, { hidden: true, name: `MCP: ${definition.label}` }));
	}

	/** @inheritdoc */
	public showOutput(): void {
		this._loggerService.setVisibility(this._loggerId, true);
		this._outputService.showChannel(this._loggerId);
	}

	/** @inheritdoc */
	public async start(): Promise<McpConnectionState> {
		const currentState = this._state.get();
		if (!McpConnectionState.canBeStarted(currentState.state)) {
			return this._waitForState(McpConnectionState.Kind.Running, McpConnectionState.Kind.Error);
		}

		this._launch.value = undefined;
		this._state.set({ state: McpConnectionState.Kind.Starting }, undefined);
		this._logger.info(localize('mcpServer.starting', 'Starting server {0}', this.definition.label));

		try {
			const launch = this._delegate.start(this._collection, this.definition, this._launchDefinition);
			this._launch.value = this.adoptLaunch(launch);
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

	private adoptLaunch(launch: IMcpMessageTransport): IReference<IMcpMessageTransport> {
		const store = new DisposableStore();
		const cts = new CancellationTokenSource();

		store.add(toDisposable(() => cts.dispose(true)));
		store.add(launch);
		store.add(launch.onDidLog(msg => {
			this._logger.info(msg);
		}));
		store.add(autorun(reader => {
			const state = launch.state.read(reader);
			this._state.set(state, undefined);
			this._logger.info(localize('mcpServer.state', 'Connection state: {0}', McpConnectionState.toString(state)));

			if (state.state === McpConnectionState.Kind.Running) {
				McpServerRequestHandler.create(this._instantiationService, launch, this._logger, cts.token).then(
					handler => this._requestHandler.set(handler, undefined),
					err => {
						store.dispose();
						this._logger.error(err);
						this._state.set({ state: McpConnectionState.Kind.Error, message: `Could not initialize MCP server: ${err.message}` }, undefined);
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
		super.dispose();
		this._state.set({ state: McpConnectionState.Kind.Stopped }, undefined);
	}

	private _waitForState(...kinds: McpConnectionState.Kind[]): Promise<McpConnectionState> {
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
}
