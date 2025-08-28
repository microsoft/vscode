/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { ILanguageRuntimeMessageOutput, ILanguageRuntimeMessageWebOutput, LanguageRuntimeMessageType, LanguageRuntimeSessionMode, RuntimeOutputKind } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { IErdosWebviewPreloadService, NotebookPreloadOutputResults } from '../../../services/erdosWebviewPreloads/browser/erdosWebviewPreloadService.js';
import { ILanguageRuntimeSession, IRuntimeSessionWillStartEvent } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { IRuntimeSessionService as IRuntimeSessionServiceType } from '../../../services/runtimeSession/common/runtimeSessionTypes.js';
import { IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IErdosNotebookOutputWebviewService, INotebookOutputWebview } from '../../erdosOutputWebview/browser/notebookOutputWebviewService.js';
import { NotebookMultiMessagePlotClient } from '../../erdosPlots/browser/notebookMultiMessagePlotClient.js';
import { UiFrontendEvent } from '../../../services/languageRuntime/common/erdosUiComm.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { isWebviewDisplayMessage, getWebviewMessageType } from '../../../services/erdosIPyWidgets/common/webviewPreloadUtils.js';
import { IErdosNotebookInstance } from '../../../services/erdosNotebook/browser/IErdosNotebookInstance.js';

type NotebookOutput = { outputId: string; outputs: { mime: string; data: VSBuffer }[] };

export class ErdosWebviewPreloadService extends Disposable implements IErdosWebviewPreloadService {
	_serviceBrand: undefined;

	initialize() { }

	private readonly _messagesBySessionId = new Map<string, ILanguageRuntimeMessageWebOutput[]>();
	private readonly _messagesByNotebookId = new Map<string, ILanguageRuntimeMessageWebOutput[]>();

	private _sessionToDisposablesMap = new Map<string, DisposableStore>();
	private _notebookToDisposablesMap = new Map<string, DisposableStore>();

	private readonly _onDidCreatePlot = this._register(new Emitter<NotebookMultiMessagePlotClient>());

	onDidCreatePlot = this._onDidCreatePlot.event;

	constructor(
		@IRuntimeSessionService private _runtimeSessionService: IRuntimeSessionServiceType,
		@IErdosNotebookOutputWebviewService private _notebookOutputWebviewService: IErdosNotebookOutputWebviewService,
	) {
		super();

		this._runtimeSessionService.activeSessions.forEach(session => {
			this._attachSession(session);
		});

		this._register(this._runtimeSessionService.onWillStartSession((event: IRuntimeSessionWillStartEvent) => {
			this._attachSession(event.session);
		}));
	}

	override dispose(): void {
		super.dispose();
		this._sessionToDisposablesMap.forEach(disposables => disposables.dispose());
	}

	sessionInfo(sessionId: string) {
		const messages = this._messagesBySessionId.get(sessionId);
		if (!messages) {
			return null;
		}
		return {
			numberOfMessages: messages.length
		};
	}

	private _attachSession(session: ILanguageRuntimeSession) {
		if (this._sessionToDisposablesMap.has(session.sessionId)) {
			return;
		}

		const disposables = new DisposableStore();
		this._sessionToDisposablesMap.set(session.sessionId, disposables);
		this._messagesBySessionId.set(session.sessionId, []);

		if (session.metadata.sessionMode !== LanguageRuntimeSessionMode.Console) {
			return;
		}

		const handleMessage = (msg: ILanguageRuntimeMessageOutput) => {
			if (msg.kind !== RuntimeOutputKind.WebviewPreload) {
				return;
			}

			this._addMessageForSession(session, msg as ILanguageRuntimeMessageWebOutput);
		};

		disposables.add(session.onDidReceiveRuntimeClientEvent((e) => {
			if (e.name !== UiFrontendEvent.ClearWebviewPreloads) { return; }
			this._messagesBySessionId.set(session.sessionId, []);
		}));

		disposables.add(session.onDidReceiveRuntimeMessageResult(handleMessage));
		disposables.add(session.onDidReceiveRuntimeMessageOutput(handleMessage));
	}

	public attachNotebookInstance(instance: IErdosNotebookInstance): void {
		const notebookId = instance.id;
		if (this._notebookToDisposablesMap.has(notebookId)) {
			this._notebookToDisposablesMap.get(notebookId)?.dispose();
		}

		const disposables = new DisposableStore();
		this._notebookToDisposablesMap.set(notebookId, disposables);

		const messagesForNotebook: ILanguageRuntimeMessageWebOutput[] = [];
		this._messagesByNotebookId.set(notebookId, messagesForNotebook);
	}

	static notebookMessageToRuntimeOutput(message: NotebookOutput, kind: RuntimeOutputKind): ILanguageRuntimeMessageWebOutput {
		return {
			id: message.outputId,
			type: LanguageRuntimeMessageType.Output,
			event_clock: 0,
			parent_id: '',
			when: '',
			kind,
			output_location: undefined,
			resource_roots: undefined,
			data: message.outputs.reduce((acc, output) => {
				acc[output.mime] = output.data.toString();
				return acc;
			}, {} as Record<string, any>)
		};
	}

	public addNotebookOutput({
		instance,
		outputId,
		outputs
	}: {
		instance: IErdosNotebookInstance;
		outputId: NotebookOutput['outputId'];
		outputs: NotebookOutput['outputs'];
	}): NotebookPreloadOutputResults | undefined {
		const notebookMessages = this._messagesByNotebookId.get(instance.id);

		if (!notebookMessages) {
			throw new Error(`ErdosWebviewPreloadService: Notebook ${instance.id} not found in messagesByNotebookId map.`);
		}

		const messageType = getWebviewMessageType(outputs);
		if (!messageType) {
			return undefined;
		}

		const runtimeOutput = ErdosWebviewPreloadService.notebookMessageToRuntimeOutput(
			{ outputId, outputs },
			RuntimeOutputKind.WebviewPreload
		);

		if (messageType === 'display') {
			return {
				preloadMessageType: messageType,
				webview: this._createNotebookPlotWebview(instance, runtimeOutput)
			};
		}

		notebookMessages.push(runtimeOutput);
		return { preloadMessageType: messageType };
	}

	private async _createNotebookPlotWebview(
		instance: IErdosNotebookInstance,
		displayMessage: ILanguageRuntimeMessageWebOutput,
	): Promise<INotebookOutputWebview> {
		const disposables = this._notebookToDisposablesMap.get(instance.id);
		if (!disposables) {
			throw new Error(`ErdosWebviewPreloadService: Could not find disposables for notebook ${instance.id}`);
		}

		const storedMessages = this._messagesByNotebookId.get(instance.id) ?? [];
		const webview = await this._notebookOutputWebviewService.createMultiMessageWebview({
			runtimeId: instance.id,
			preReqMessages: storedMessages,
			displayMessage: displayMessage,
			viewType: 'jupyter-notebook'
		});

		if (!webview) {
			throw new Error(`ErdosWebviewPreloadService: Failed to create webview for notebook ${instance.id}`);
		}

		return webview;
	}

	private _addMessageForSession(session: ILanguageRuntimeSession, msg: ILanguageRuntimeMessageWebOutput) {
		const sessionId = session.sessionId;

		if (isWebviewDisplayMessage(msg)) {
			this._createPlotClient(session, msg);
			return;
		}

		const messagesForSession = this._messagesBySessionId.get(sessionId);

		if (!messagesForSession) {
			throw new Error(`ErdosWebviewPreloadService: Session ${sessionId} not found in messagesBySessionId map.`);
		}
		messagesForSession.push(msg);
	}

	private async _createPlotClient(
		runtime: ILanguageRuntimeSession,
		displayMessage: ILanguageRuntimeMessageWebOutput,
	) {
		const disposables = this._sessionToDisposablesMap.get(runtime.sessionId);
		if (!disposables) {
			throw new Error(`ErdosWebviewPreloadService: Could not find disposables for session ${runtime.sessionId}`);
		}

		const storedMessages = this._messagesBySessionId.get(runtime.sessionId) ?? [];
		const client = disposables.add(new NotebookMultiMessagePlotClient(
			this._notebookOutputWebviewService, runtime, storedMessages, displayMessage,
		));
		this._onDidCreatePlot.fire(client);
	}
}

registerSingleton(IErdosWebviewPreloadService, ErdosWebviewPreloadService, InstantiationType.Delayed);