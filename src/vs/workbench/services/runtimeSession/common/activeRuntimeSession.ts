/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { RuntimeState } from '../../languageRuntime/common/languageRuntimeService.js';
import { UiClientInstance, IUiClientMessageInput, IUiClientMessageOutput } from '../../languageRuntime/common/languageRuntimeUiClient.js';
import { UiFrontendEvent } from '../../languageRuntime/common/erdosUiComm.js';
import { RuntimeClientState } from '../../languageRuntime/common/languageRuntimeClientInstance.js';
import { ILanguageRuntimeGlobalEvent, ILanguageRuntimeSession, ILanguageRuntimeSessionManager, RuntimeClientType } from './runtimeSessionTypes.js';

export class ActiveRuntimeSession extends Disposable {

	public state: RuntimeState;

	public workingDirectory: string = '';

	private readonly _onDidReceiveRuntimeEventEmitter = this._register(new Emitter<ILanguageRuntimeGlobalEvent>());
	private readonly _onUiClientStartedEmitter = this._register(new Emitter<UiClientInstance>());

	private _uiClient: UiClientInstance | undefined;

	get uiClient(): UiClientInstance | undefined {
		return this._uiClient;
	}

	private _startingUiClient: DeferredPromise<string> | undefined;

	constructor(
		public session: ILanguageRuntimeSession,
		public manager: ILanguageRuntimeSessionManager,
		private readonly _logService: ILogService,
		private readonly _openerService: IOpenerService,
		private readonly _environmentService: IWorkbenchEnvironmentService
	) {
		super();

		this.state = session.getRuntimeState();
	}

	readonly onDidReceiveRuntimeEvent = this._onDidReceiveRuntimeEventEmitter.event;

	readonly onUiClientStarted = this._onUiClientStartedEmitter.event;

	public register<T extends IDisposable>(disposable: T): T {
		return this._register(disposable);
	}

	public async startUiClient(): Promise<string> {
		if (this._uiClient) {
			const clientState = this._uiClient.getClientState();
			if (clientState !== RuntimeClientState.Closed) {
				return this._uiClient.getClientId();
			} else {
				this._uiClient = undefined;
			}
		}

		if (this._startingUiClient && !this._startingUiClient.isSettled) {
			return this._startingUiClient.p;
		}

		const promise = new DeferredPromise<string>();
		this._startingUiClient = promise;
		this.startUiClientImpl().then(clientId => {
			promise.complete(clientId);
		}).catch(err => {
			promise.error(err);
		});
		return this._startingUiClient.p;
	}

	private async startUiClientImpl(): Promise<string> {
		const client = await this.session.createClient<IUiClientMessageInput, IUiClientMessageOutput>
			(RuntimeClientType.Ui, {});

		const uiClient = new UiClientInstance(client, this._logService, this._openerService, this._environmentService);
		this._uiClient = uiClient;
		this._register(this._uiClient);

		const sessionId = this.session.sessionId;

		this._register(uiClient.onDidBusy(event => {
			this._onDidReceiveRuntimeEventEmitter.fire({
				session_id: sessionId,
				event: {
					name: UiFrontendEvent.Busy,
					data: event
				}
			});
		}));
		this._register(uiClient.onDidClearConsole(event => {
			this._onDidReceiveRuntimeEventEmitter.fire({
				session_id: sessionId,
				event: {
					name: UiFrontendEvent.ClearConsole,
					data: event
				}
			});
		}));
		this._register(uiClient.onDidSetEditorSelections(event => {
			this._onDidReceiveRuntimeEventEmitter.fire({
				session_id: sessionId,
				event: {
					name: UiFrontendEvent.SetEditorSelections,
					data: event
				}
			});
		}));
		this._register(uiClient.onDidOpenEditor(event => {
			this._onDidReceiveRuntimeEventEmitter.fire({
				session_id: sessionId,
				event: {
					name: UiFrontendEvent.OpenEditor,
					data: event
				}
			});
		}));
		this._register(uiClient.onDidOpenWorkspace(event => {
			this._onDidReceiveRuntimeEventEmitter.fire({
				session_id: sessionId,
				event: {
					name: UiFrontendEvent.OpenWorkspace,
					data: event
				}
			});
		}));
		this._register(uiClient.onDidShowMessage(event => {
			this._onDidReceiveRuntimeEventEmitter.fire({
				session_id: sessionId,
				event: {
					name: UiFrontendEvent.ShowMessage,
					data: event
				}
			});
		}));
		this._register(uiClient.onDidPromptState(event => {
			this._onDidReceiveRuntimeEventEmitter.fire({
				session_id: sessionId,
				event: {
					name: UiFrontendEvent.PromptState,
					data: event
				}
			});
		}));
		this._register(uiClient.onDidWorkingDirectory(event => {
			// Track the working directory
			this.workingDirectory = event.directory;
			this._onDidReceiveRuntimeEventEmitter.fire({
				session_id: sessionId,
				event: {
					name: UiFrontendEvent.WorkingDirectory,
					data: event
				}
			});
		}));
		
		this._register(uiClient.onDidPromptState(event => {
		}));
		this._register(uiClient.onDidShowUrl(event => {
			this._onDidReceiveRuntimeEventEmitter.fire({
				session_id: sessionId,
				event: {
					name: UiFrontendEvent.ShowUrl,
					data: event
				}
			});
		}));
		this._register(uiClient.onDidShowHtmlFile(event => {
			this._onDidReceiveRuntimeEventEmitter.fire({
				session_id: sessionId,
				event: {
					name: UiFrontendEvent.ShowHtmlFile,
					data: event
				}
			});
		}));
		this._register(uiClient.onDidOpenWithSystem(event => {
			this._onDidReceiveRuntimeEventEmitter.fire({
				session_id: sessionId,
				event: {
					name: UiFrontendEvent.OpenWithSystem,
					data: event
				}
			});
		}));
		this._register(uiClient.onDidClearWebviewPreloads(event => {
			this._onDidReceiveRuntimeEventEmitter.fire({
				session_id: sessionId,
				event: {
					name: UiFrontendEvent.ClearWebviewPreloads,
					data: event
				}
			});
		}));

		this._onUiClientStartedEmitter.fire(uiClient);

		return client.getClientId();
	}
}
