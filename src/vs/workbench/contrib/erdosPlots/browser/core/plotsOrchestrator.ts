/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IErdosPlotsService, IErdosPlotClient, IPlotHistoryGroup } from '../../common/erdosPlotsService.js';
import { ILanguageRuntimeService, ILanguageRuntimeMessageOutput, ILanguageRuntimeMessageWebOutput, LanguageRuntimeSessionMode, RuntimeOutputKind } from '../../../../services/languageRuntime/common/languageRuntimeService.js';
import { StaticPlotInstance, AutomaticPlotSizer } from '../../common/erdosPlotsService.js';
import { IRuntimeSessionService, ILanguageRuntimeSession, IRuntimeSessionWillStartEvent } from '../../../../services/runtimeSession/common/runtimeSessionService.js';
import { PlotClientInstance, IErdosPlotMetadata } from '../../../../services/languageRuntime/common/languageRuntimePlotClient.js';
import { ErdosPlotCommProxy } from '../../../../services/languageRuntime/common/erdosPlotCommProxy.js';
import { ErdosPlotRenderQueue } from '../../../../services/languageRuntime/common/erdosPlotRenderQueue.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IErdosNotebookOutputWebviewService } from '../../../erdosOutputWebview/browser/notebookOutputWebviewService.js';
import { NOTEBOOK_PLOT_MIRRORING_KEY } from '../../../notebook/browser/notebookConfig.js';
import { IErdosConsoleService } from '../../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { IConsoleCodeAttribution } from '../../../../services/erdosConsole/common/erdosConsoleCodeExecution.js';
import { PlotInstanceRegistry } from './plotInstanceRegistry.js';
import { HistoryGroupManager } from './historyGroupManager.js';
import { ExecutionAttributionTracker } from './executionAttributionTracker.js';
import { NotebookWidgetClient } from '../clients/notebookWidgetClient.js';
import { HtmlPlotClient } from '../clients/htmlPlotClient.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { UiFrontendEvent, ShowHtmlFileEvent } from '../../../../services/languageRuntime/common/erdosUiComm.js';
import { MultiMessageWidgetClient } from '../clients/multiMessageWidgetClient.js';
import { isWebviewDisplayMessage } from '../../../../services/erdosIPyWidgets/common/webviewPreloadUtils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';

/**
 * Main orchestrator coordinating plot management, runtime integration, and UI updates.
 */
export class PlotsOrchestrator extends Disposable implements IErdosPlotsService {
	readonly _serviceBrand: undefined;

	private readonly _instanceRegistry = this._register(new PlotInstanceRegistry());
	private readonly _historyManager = this._register(new HistoryGroupManager());
	private readonly _attributionTracker = this._register(new ExecutionAttributionTracker());

	private readonly _renderQueuesBySession = new Map<string, ErdosPlotRenderQueue>();
	private readonly _commProxiesByPlot = new Map<string, ErdosPlotCommProxy>();

	private readonly _webviewMessagesBySessionId = new Map<string, ILanguageRuntimeMessageWebOutput[]>();
	private _webviewSessionDisposables = new Map<string, DisposableStore>();

	constructor(
		@ILanguageRuntimeService private readonly _languageRuntimeService: ILanguageRuntimeService,
		@IRuntimeSessionService private readonly _sessionService: IRuntimeSessionService,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IErdosNotebookOutputWebviewService private readonly _webviewService: IErdosNotebookOutputWebviewService,
		@IErdosConsoleService private readonly _consoleService: IErdosConsoleService,
		@IWebviewService private readonly _webviewOverlayService: IWebviewService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();
		// NOTE: Do NOT call this.initialize() here - it's called by MainThreadLanguageRuntime
	}

	initialize(): void {
		this._attachRuntimeHooks();
		this._initializeWebviewPreloadHandling();
	}

	private _initializeWebviewPreloadHandling(): void {
		this._sessionService.activeSessions.forEach(session => {
			this._attachWebviewSession(session);
		});

		this._register(this._sessionService.onWillStartSession((event: IRuntimeSessionWillStartEvent) => {
			this._attachWebviewSession(event.session);
		}));
	}

	private _attachWebviewSession(session: ILanguageRuntimeSession): void {
		if (this._webviewSessionDisposables.has(session.sessionId)) {
			return;
		}

		const disposables = new DisposableStore();
		this._webviewSessionDisposables.set(session.sessionId, disposables);
		this._webviewMessagesBySessionId.set(session.sessionId, []);

		if (session.metadata.sessionMode !== LanguageRuntimeSessionMode.Console) {
			return;
		}

		const handleMessage = (msg: ILanguageRuntimeMessageOutput) => {
			if (msg.kind !== RuntimeOutputKind.WebviewPreload) {
				return;
			}
			this._handleWebviewMessage(session, msg as ILanguageRuntimeMessageWebOutput);
		};

		disposables.add(session.onDidReceiveRuntimeClientEvent((e) => {
			if (e.name !== UiFrontendEvent.ClearWebviewPreloads) { return; }
			this._webviewMessagesBySessionId.set(session.sessionId, []);
		}));

		disposables.add(session.onDidReceiveRuntimeMessageResult(handleMessage));
		disposables.add(session.onDidReceiveRuntimeMessageOutput(handleMessage));
	}

	private _handleWebviewMessage(session: ILanguageRuntimeSession, msg: ILanguageRuntimeMessageWebOutput): void {
		if (isWebviewDisplayMessage(msg)) {
			this._createWebviewPlot(session, msg);
			return;
		}

		const messagesForSession = this._webviewMessagesBySessionId.get(session.sessionId);
		if (!messagesForSession) {
			console.error('[PlotsOrchestrator] Session not found:', session.sessionId);
			return;
		}
		messagesForSession.push(msg);
	}

	private async _createWebviewPlot(session: ILanguageRuntimeSession, displayMessage: ILanguageRuntimeMessageWebOutput): Promise<void> {
		const storedMessages = this._webviewMessagesBySessionId.get(session.sessionId) ?? [];
		const client = new MultiMessageWidgetClient(
			this._webviewService, session, storedMessages, displayMessage
		);
		this._enrollNewClient(client);
	}

	readonly onPlotCreated: Event<IErdosPlotClient> = this._instanceRegistry.onClientAdded;
	readonly onPlotActivated: Event<string> = this._instanceRegistry.onClientSelected;
	readonly onPlotDeleted: Event<string> = this._instanceRegistry.onClientRemoved;
	readonly onPlotsReplaced: Event<IErdosPlotClient[]> = this._instanceRegistry.onClientsReplaced;
	readonly onPlotMetadataChanged: Event<IErdosPlotClient> = this._instanceRegistry.onMetadataModified;
	readonly onHistoryChanged: Event<void> = this._historyManager.onGroupModified;

	get allPlots(): IErdosPlotClient[] {
		return this._instanceRegistry.getAllClients();
	}

	get activePlotId(): string | undefined {
		return this._instanceRegistry.getActiveClientIdentifier();
	}

	get historyGroups(): IPlotHistoryGroup[] {
		return this._historyManager.getAllGroups();
	}

	fetchPlotsInGroup(groupId: string): IErdosPlotClient[] {
		return this._historyManager.retrieveMembersOfGroup(groupId, (id) => this._instanceRegistry.lookupClient(id));
	}

	activatePlot(plotId: string): void {
		this._instanceRegistry.activateClient(plotId);
	}

	activatePreviousPlot(): void {
		this._instanceRegistry.navigateToPreviousClient();
	}

	activateNextPlot(): void {
		this._instanceRegistry.navigateToNextClient();
	}

	deletePlot(plotId: string, suppressHistoryUpdate: boolean = false): void {
		this._instanceRegistry.discardClient(plotId, suppressHistoryUpdate);
		if (!suppressHistoryUpdate) {
			this._historyManager.removeClient(plotId);
		}
	}

	deletePlots(plotIds: string[]): void {
		this._instanceRegistry.discardMultipleClients(plotIds);
		this._historyManager.removeMultipleClients(plotIds);
	}

	deleteAllPlots(): void {
		this._instanceRegistry.purgeAllClients();
		this._historyManager.purgeAllGroups();
	}

	modifyPlotMetadata(plotId: string, updates: Partial<IErdosPlotMetadata>): void {
		this._instanceRegistry.modifyClientMetadata(plotId, updates);
	}

	fetchPlotAtIndex(index: number): IErdosPlotClient | undefined {
		return this._instanceRegistry.retrieveClientByPosition(index);
	}

	private _attachRuntimeHooks(): void {
		this._register(this._languageRuntimeService.onDidRegisterRuntime((runtime: any) => {
			// Hook for future runtime-specific initialization
		}));

		this._register(this._consoleService.onDidExecuteCode((event) => {
			if (!event.executionId) {
				return;
			}
			this._attributionTracker.recordExecution(event.executionId, event.code, event.attribution);
		}));

		this._register(this._sessionService.onDidStartRuntime((session) => {
			this._attachSessionMonitors(session);
		}));

		this._register(this._sessionService.onDidReceiveRuntimeEvent(async (event: any) => {
			if (event.event.name === UiFrontendEvent.ShowHtmlFile) {
				// The data structure is: event.event.data = { uri: URI, event: ShowHtmlFileEvent }
				const wrappedData = event.event.data;
				const data = wrappedData.event as ShowHtmlFileEvent;
				if (data.is_plot) {
					await this._createHtmlPlot(event.session_id, data);
				}
			}
		}));
	}

	private _attachSessionMonitors(session: any): void {
		this._register(session.onDidReceiveRuntimeMessageOutput((message: ILanguageRuntimeMessageOutput) => {
			this._processOutputMessage(message, session);
		}));

		this._register(session.onDidReceiveRuntimeMessageResult?.((message: ILanguageRuntimeMessageOutput) => {
			this._processOutputMessage(message, session);
		}) ?? { dispose: () => { } });

		this._register(session.onDidReceiveRuntimeMessageInput?.((message: any) => {
			if (message.parent_id && message.code && !this._attributionTracker.hasRecord(message.parent_id)) {
				this._attributionTracker.recordExecution(message.parent_id, message.code);
			}
		}) ?? { dispose: () => { } });

		this._register(session.onDidCreateClientInstance?.((event: any) => {
			if (event.client.getClientType() === 'erdos.plot') {
				this._handleDynamicClientCreation(event, session);
			}
		}) ?? { dispose: () => { } });
	}

	private _processOutputMessage(message: ILanguageRuntimeMessageOutput, session: any): void {
		if (message.kind !== RuntimeOutputKind.StaticImage && message.kind !== RuntimeOutputKind.PlotWidget) {
			return;
		}

		if (this._instanceRegistry.containsClient(message.id)) {
			return;
		}

		if (session.metadata?.sessionMode === 'notebook') {
			const mirroringEnabled = this._configurationService.getValue<boolean>(NOTEBOOK_PLOT_MIRRORING_KEY) ?? true;
			if (!mirroringEnabled) {
				return;
			}
		}

		const client = this._constructClientFromMessage(message, session);
		if (client) {
			this._enrollNewClient(client);
		}
	}

	private _constructClientFromMessage(message: ILanguageRuntimeMessageOutput, session: ILanguageRuntimeSession): IErdosPlotClient | undefined {
		const sourceCode = this._attributionTracker.extractCode(message.parent_id);
		const attributionData = this._attributionTracker.extractAttribution(message.parent_id);

		if (message.kind === RuntimeOutputKind.StaticImage) {
			return this._buildStaticClient(message, session.sessionId, sourceCode, attributionData, session);
		} else if (message.kind === RuntimeOutputKind.PlotWidget) {
			return new NotebookWidgetClient(this._webviewService, session, message, sourceCode, attributionData);
		}

		return undefined;
	}

	private _buildStaticClient(message: ILanguageRuntimeMessageOutput, sessionId: string, sourceCode: string, attributionData?: IConsoleCodeAttribution, session?: ILanguageRuntimeSession): StaticPlotInstance | undefined {
		try {
			let imageContent: string | null = null;
			let contentType = 'image/png';

			if (message.data) {
				const supportedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/gif'];
				for (const mimeType of supportedTypes) {
					if (message.data[mimeType] && typeof message.data[mimeType] === 'string') {
						imageContent = message.data[mimeType] as string;
						contentType = mimeType;
						break;
					}
				}

				if (!imageContent && typeof message.data === 'string') {
					imageContent = message.data as string;
				}
			}

			if (!imageContent) {
				console.warn('PlotsOrchestrator: No image content in message');
				return undefined;
			}

			if (!imageContent.startsWith('data:')) {
				imageContent = `data:${contentType};base64,${imageContent}`;
			}

			let sourceFile: string | undefined;
			let sourceType: string | undefined;
			let batchId: string | undefined;

			if (attributionData) {
				sourceType = attributionData.source;
				batchId = attributionData.batchId;
				if (attributionData.metadata?.file) {
					sourceFile = attributionData.metadata.file;
				} else if (attributionData.metadata?.notebook) {
					sourceFile = attributionData.metadata.notebook;
				}
			}

		const languageId = session?.runtimeMetadata.languageId;

		return StaticPlotInstance.createFromRuntimeMessage(this._storageService, sessionId, message, sourceFile, sourceType, batchId, languageId);
	} catch (error) {
		console.error('PlotsOrchestrator: Failed to build static client:', error);
			return undefined;
		}
	}

	private _handleDynamicClientCreation(event: any, session: ILanguageRuntimeSession): void {
		try {
			const clientId = event.client.getClientId();

			if (this._instanceRegistry.containsClient(clientId)) {
				return;
			}

			const sourceCode = this._attributionTracker.extractCode(event.message.parent_id);
			const attributionData = this._attributionTracker.extractAttribution(event.message.parent_id);

			let sourceFile: string | undefined;
			let sourceType: string | undefined;
			let batchId: string | undefined;

			if (attributionData) {
				sourceType = attributionData.source;
				batchId = attributionData.batchId;
				if (attributionData.metadata?.file) {
					sourceFile = attributionData.metadata.file;
				} else if (attributionData.metadata?.notebook) {
					sourceFile = attributionData.metadata.notebook;
				}
			}

			const metadata = {
				id: clientId,
				created: Date.parse(event.message.when),
				parent_id: event.message.parent_id,
				code: sourceCode,
				session_id: session.sessionId,
				language: session.runtimeMetadata?.languageId || 'python',
				zoom_level: undefined,
				source_file: sourceFile,
				source_type: sourceType,
				batch_id: batchId
			};

			const client = this._assembleDynamicClient(event.client, metadata, session);
			if (client) {
				this._enrollNewClient(client);
			}
		} catch (error) {
			console.error('PlotsOrchestrator: Failed to handle dynamic client creation:', error);
		}
	}

	private _assembleDynamicClient(client: any, metadata: any, session?: any): IErdosPlotClient | undefined {
		try {
		const communicationProxy = this._establishCommProxy(client, metadata);

		return new PlotClientInstance(
			communicationProxy,
			new AutomaticPlotSizer(),
			metadata
		);
		} catch (error) {
			console.error('PlotsOrchestrator: Failed to assemble dynamic client:', error);
			return undefined;
		}
	}

	private _establishCommProxy(client: any, metadata: any): ErdosPlotCommProxy {
		let renderQueue = this._renderQueuesBySession.get(metadata.session_id);
		if (!renderQueue) {
			const session = this._sessionService.getSession(metadata.session_id);
			if (session) {
				renderQueue = new ErdosPlotRenderQueue(session, this._logService);
				this._register(renderQueue);
				this._renderQueuesBySession.set(metadata.session_id, renderQueue);
			} else {
				this._logService.error(`Cannot locate session ${metadata.session_id} for plot ${metadata.id}`);
				throw new Error(`Cannot locate session ${metadata.session_id} for plot ${metadata.id}`);
			}
		}

		const communicationProxy = new ErdosPlotCommProxy(client, renderQueue);
		this._commProxiesByPlot.set(metadata.id, communicationProxy);

		this._register(communicationProxy.onDidClose(() => {
			this._commProxiesByPlot.delete(metadata.id);
		}));

		this._register(communicationProxy);

		return communicationProxy;
	}

	private _enrollNewClient(client: IErdosPlotClient): void {
		this._instanceRegistry.registerClient(client);
		this._historyManager.incorporateClient(client);
	}

	private async _createHtmlPlot(sessionId: string, event: ShowHtmlFileEvent): Promise<void> {
		const session = this._sessionService.getSession(sessionId);
		if (!session) {
			this._logService.error(`Cannot create HTML plot: session ${sessionId} not found`);
			return;
		}

		const plotClient = new HtmlPlotClient(
			this._webviewOverlayService,
			this._openerService,
			this._commandService,
			session,
			event
		);

		this._enrollNewClient(plotClient);
	}
}

