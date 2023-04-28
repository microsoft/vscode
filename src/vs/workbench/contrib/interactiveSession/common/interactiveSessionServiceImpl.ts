/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { withNullAsUndefined } from 'vs/base/common/types';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { CONTEXT_PROVIDER_EXISTS } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContextKeys';
import { ISerializableInteractiveSessionData, ISerializableInteractiveSessionsData, InteractiveSessionModel, InteractiveSessionWelcomeMessageModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionModel';
import { IInteractiveProgress, IInteractiveProvider, IInteractiveProviderInfo, IInteractiveSession, IInteractiveSessionCompleteResponse, IInteractiveSessionDetail, IInteractiveSessionDynamicRequest, IInteractiveSessionReplyFollowup, IInteractiveSessionService, IInteractiveSessionUserActionEvent, IInteractiveSlashCommand, InteractiveSessionCopyKind, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

const serializedInteractiveSessionKey = 'interactive.sessions';

type InteractiveSessionProviderInvokedEvent = {
	providerId: string;
	timeToFirstProgress: number;
	totalTime: number;
	result: 'success' | 'error' | 'errorWithOutput' | 'cancelled' | 'filtered';
	requestType: 'string' | 'followup' | 'slashCommand';
};

type InteractiveSessionProviderInvokedClassification = {
	providerId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The identifier of the provider that was invoked.' };
	timeToFirstProgress: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The time in milliseconds from invoking the provider to getting the first data.' };
	totalTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The total time it took to run the provider\'s `provideResponseWithProgress`.' };
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether invoking the InteractiveSessionProvider resulted in an error.' };
	requestType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of request that the user made.' };
	owner: 'roblourens';
	comment: 'Provides insight into the performance of InteractiveSession providers.';
};

type InteractiveSessionVoteEvent = {
	providerId: string;
	direction: 'up' | 'down';
};

type InteractiveSessionVoteClassification = {
	providerId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The identifier of the provider that this response came from.' };
	direction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the user voted up or down.' };
	owner: 'roblourens';
	comment: 'Provides insight into the performance of InteractiveSession providers.';
};

type InteractiveSessionCopyEvent = {
	providerId: string;
	copyKind: 'action' | 'toolbar';
};

type InteractiveSessionCopyClassification = {
	providerId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The identifier of the provider that this codeblock response came from.' };
	copyKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the copy was initiated.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of InteractiveSession features.';
};

type InteractiveSessionInsertEvent = {
	providerId: string;
	newFile: boolean;
};

type InteractiveSessionInsertClassification = {
	providerId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The identifier of the provider that this codeblock response came from.' };
	newFile: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the code was inserted into a new untitled file.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of InteractiveSession features.';
};

type InteractiveSessionCommandEvent = {
	providerId: string;
	commandId: string;
};

type InteractiveSessionCommandClassification = {
	providerId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The identifier of the provider that this codeblock response came from.' };
	commandId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the command that was executed.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of InteractiveSession features.';
};

type InteractiveSessionTerminalEvent = {
	providerId: string;
	languageId: string;
};

type InteractiveSessionTerminalClassification = {
	providerId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The identifier of the provider that this codeblock response came from.' };
	languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language of the code that was run in the terminal.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of InteractiveSession features.';
};

const maxPersistedSessions = 20;

export class InteractiveSessionService extends Disposable implements IInteractiveSessionService {
	declare _serviceBrand: undefined;

	private readonly _providers = new Map<string, IInteractiveProvider>();
	private readonly _sessionModels = new Map<string, InteractiveSessionModel>();
	private readonly _pendingRequests = new Map<string, CancelablePromise<void>>();
	private readonly _persistedSessions: ISerializableInteractiveSessionsData;
	private readonly _hasProvider: IContextKey<boolean>;

	private readonly _onDidPerformUserAction = this._register(new Emitter<IInteractiveSessionUserActionEvent>());
	public readonly onDidPerformUserAction: Event<IInteractiveSessionUserActionEvent> = this._onDidPerformUserAction.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this._hasProvider = CONTEXT_PROVIDER_EXISTS.bindTo(this.contextKeyService);

		const sessionData = storageService.get(serializedInteractiveSessionKey, StorageScope.WORKSPACE, '');
		if (sessionData) {
			this._persistedSessions = this.deserializeInteractiveSessions(sessionData);
			const countsForLog = Object.keys(this._persistedSessions).length;
			this.trace('constructor', `Restored ${countsForLog} persisted sessions`);
		} else {
			this._persistedSessions = {};
			this.trace('constructor', 'No persisted sessions');
		}

		this._register(storageService.onWillSaveState(() => this.saveState()));
	}

	private saveState(): void {
		let allSessions: (InteractiveSessionModel | ISerializableInteractiveSessionData)[] = Array.from(this._sessionModels.values())
			.filter(session => session.getRequests().length > 0);
		allSessions = allSessions.concat(
			Object.values(this._persistedSessions).filter(session => session.requests.length));
		allSessions.sort((a, b) => (b.creationDate ?? 0) - (a.creationDate ?? 0));
		allSessions = allSessions.slice(0, maxPersistedSessions);
		this.trace('onWillSaveState', `Persisting ${allSessions.length} sessions`);

		const serialized = JSON.stringify(allSessions);
		this.storageService.store(serializedInteractiveSessionKey, serialized, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	notifyUserAction(action: IInteractiveSessionUserActionEvent): void {
		if (action.action.kind === 'vote') {
			this.telemetryService.publicLog2<InteractiveSessionVoteEvent, InteractiveSessionVoteClassification>('interactiveSessionVote', {
				providerId: action.providerId,
				direction: action.action.direction === InteractiveSessionVoteDirection.Up ? 'up' : 'down'
			});
		} else if (action.action.kind === 'copy') {
			this.telemetryService.publicLog2<InteractiveSessionCopyEvent, InteractiveSessionCopyClassification>('interactiveSessionCopy', {
				providerId: action.providerId,
				copyKind: action.action.copyType === InteractiveSessionCopyKind.Action ? 'action' : 'toolbar'
			});
		} else if (action.action.kind === 'insert') {
			this.telemetryService.publicLog2<InteractiveSessionInsertEvent, InteractiveSessionInsertClassification>('interactiveSessionInsert', {
				providerId: action.providerId,
				newFile: !!action.action.newFile
			});
		} else if (action.action.kind === 'command') {
			const command = CommandsRegistry.getCommand(action.action.command.commandId);
			const commandId = command ? action.action.command.commandId : 'INVALID';
			this.telemetryService.publicLog2<InteractiveSessionCommandEvent, InteractiveSessionCommandClassification>('interactiveSessionCommand', {
				providerId: action.providerId,
				commandId
			});
		} else if (action.action.kind === 'runInTerminal') {
			this.telemetryService.publicLog2<InteractiveSessionTerminalEvent, InteractiveSessionTerminalClassification>('interactiveSessionRunInTerminal', {
				providerId: action.providerId,
				languageId: action.action.languageId ?? ''
			});
		}

		this._onDidPerformUserAction.fire(action);
	}

	private trace(method: string, message: string): void {
		this.logService.trace(`InteractiveSessionService#${method}: ${message}`);
	}

	private error(method: string, message: string): void {
		this.logService.error(`InteractiveSessionService#${method} ${message}`);
	}

	private deserializeInteractiveSessions(sessionData: string): ISerializableInteractiveSessionsData {
		try {
			const arrayOfSessions: ISerializableInteractiveSessionData[] = JSON.parse(sessionData);
			if (!Array.isArray(arrayOfSessions)) {
				throw new Error('Expected array');
			}

			const sessions = arrayOfSessions.reduce((acc, session) => {
				acc[session.sessionId] = session;
				return acc;
			}, {} as ISerializableInteractiveSessionsData);
			return sessions;
		} catch (err) {
			this.error('deserializeInteractiveSessions', `Malformed session data: ${err}. [${sessionData.substring(0, 20)}${sessionData.length > 20 ? '...' : ''}]`);
			return {};
		}
	}

	getHistory(): IInteractiveSessionDetail[] {
		const sessions = Object.values(this._persistedSessions);
		sessions.sort((a, b) => (b.creationDate ?? 0) - (a.creationDate ?? 0));

		return sessions.map(item => {
			return <IInteractiveSessionDetail>{
				sessionId: item.sessionId,
				title: item.requests[0]?.message || '',
			};
		});
	}

	startSession(providerId: string, token: CancellationToken): InteractiveSessionModel {
		this.trace('startSession', `providerId=${providerId}`);
		return this._startSession(providerId, undefined, token);
	}

	private _startSession(providerId: string, someSessionHistory: ISerializableInteractiveSessionData | undefined, token: CancellationToken): InteractiveSessionModel {
		const model = this.instantiationService.createInstance(InteractiveSessionModel, providerId, someSessionHistory);
		this._sessionModels.set(model.sessionId, model);
		const modelInitPromise = this.initializeSession(model, someSessionHistory, token);
		modelInitPromise.then(resolvedModel => {
			if (!resolvedModel) {
				model.dispose();
				this._sessionModels.delete(model.sessionId);
			}
		}).catch(err => {
			this.trace('startSession', `initializeSession failed: ${err}`);
			model.dispose();
			this._sessionModels.delete(model.sessionId);
		});

		return model;
	}

	private async initializeSession(model: InteractiveSessionModel, sessionHistory: ISerializableInteractiveSessionData | undefined, token: CancellationToken): Promise<InteractiveSessionModel | undefined> {
		await this.extensionService.activateByEvent(`onInteractiveSession:${model.providerId}`);

		const provider = this._providers.get(model.providerId);
		if (!provider) {
			throw new Error(`Unknown provider: ${model.providerId}`);
		}

		let session: IInteractiveSession | undefined;
		try {
			session = withNullAsUndefined(await provider.prepareSession(model.providerState, token));
		} catch (err) {
			this.trace('initializeSession', `Provider initializeSession threw: ${err}`);
		}

		if (!session) {
			if (sessionHistory) {
				// sessionHistory was not used, so store it for later
				this._persistedSessions[sessionHistory.sessionId] = sessionHistory;
			}

			this.trace('startSession', 'Provider returned no session');
			return undefined;
		}

		this.trace('startSession', `Provider returned session`);

		const welcomeMessage = sessionHistory ? undefined : withNullAsUndefined(await provider.provideWelcomeMessage?.(token));
		const welcomeModel = welcomeMessage && new InteractiveSessionWelcomeMessageModel(
			welcomeMessage.map(item => typeof item === 'string' ? new MarkdownString(item) : item as IInteractiveSessionReplyFollowup[]), session.responderUsername, session.responderAvatarIconUri);

		model.initialize(session, welcomeModel);
		return model;
	}

	retrieveSession(sessionId: string): InteractiveSessionModel | undefined {
		const model = this._sessionModels.get(sessionId);
		if (model) {
			return model;
		}

		const sessionData = this._persistedSessions[sessionId];
		if (!sessionData) {
			return undefined;
		}

		delete this._persistedSessions[sessionId];
		return this._startSession(sessionData.providerId, sessionData, CancellationToken.None);
	}

	async sendRequest(sessionId: string, request: string | IInteractiveSessionReplyFollowup): Promise<boolean> {
		const messageText = typeof request === 'string' ? request : request.message;
		this.trace('sendRequest', `sessionId: ${sessionId}, message: ${messageText.substring(0, 20)}${messageText.length > 20 ? '[...]' : ''}}`);
		if (!messageText.trim()) {
			this.trace('sendRequest', 'Rejected empty message');
			return false;
		}

		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		await model.waitForInitialization();
		const provider = this._providers.get(model.providerId);
		if (!provider) {
			throw new Error(`Unknown provider: ${model.providerId}`);
		}

		if (this._pendingRequests.has(sessionId)) {
			this.trace('sendRequest', `Session ${sessionId} already has a pending request`);
			return false;
		}

		// This method is only returning whether the request was accepted - don't block on the actual request
		this._sendRequestAsync(model, provider, request);
		return true;
	}

	private _sendRequestAsync(model: InteractiveSessionModel, provider: IInteractiveProvider, message: string | IInteractiveSessionReplyFollowup): CancelablePromise<void> {
		const request = model.addRequest(message);
		let gotProgress = false;
		const requestType = typeof message === 'string' ?
			(message.startsWith('/') ? 'slashCommand' : 'string') :
			'followup';

		const rawResponsePromise = createCancelablePromise<void>(async token => {
			const progressCallback = (progress: IInteractiveProgress) => {
				if (token.isCancellationRequested) {
					return;
				}

				gotProgress = true;
				if ('content' in progress) {
					this.trace('sendRequest', `Provider returned progress for session ${model.sessionId}, ${progress.content.length} chars`);
				} else {
					this.trace('sendRequest', `Provider returned id for session ${model.sessionId}, ${progress.responseId}`);
				}

				model.acceptResponseProgress(request, progress);
			};

			const stopWatch = new StopWatch(false);
			token.onCancellationRequested(() => {
				this.trace('sendRequest', `Request for session ${model.sessionId} was cancelled`);
				this.telemetryService.publicLog2<InteractiveSessionProviderInvokedEvent, InteractiveSessionProviderInvokedClassification>('interactiveSessionProviderInvoked', {
					providerId: provider.id,
					timeToFirstProgress: -1,
					// Normally timings happen inside the EH around the actual provider. For cancellation we can measure how long the user waited before cancelling
					totalTime: stopWatch.elapsed(),
					result: 'cancelled',
					requestType
				});

				model.cancelRequest(request);
			});
			let rawResponse = await provider.provideReply({ session: model.session!, message: request.message }, progressCallback, token);
			if (token.isCancellationRequested) {
				return;
			} else {
				if (!rawResponse) {
					this.trace('sendRequest', `Provider returned no response for session ${model.sessionId}`);
					rawResponse = { session: model.session!, errorDetails: { message: localize('emptyResponse', "Provider returned null response") } };
				}

				const result = rawResponse.errorDetails?.responseIsFiltered ? 'filtered' :
					rawResponse.errorDetails && gotProgress ? 'errorWithOutput' :
						rawResponse.errorDetails ? 'error' :
							'success';
				this.telemetryService.publicLog2<InteractiveSessionProviderInvokedEvent, InteractiveSessionProviderInvokedClassification>('interactiveSessionProviderInvoked', {
					providerId: provider.id,
					timeToFirstProgress: rawResponse.timings?.firstProgress ?? 0,
					totalTime: rawResponse.timings?.totalElapsed ?? 0,
					result,
					requestType
				});
				model.completeResponse(request, rawResponse);
				this.trace('sendRequest', `Provider returned response for session ${model.sessionId}`);

				if (provider.provideFollowups) {
					Promise.resolve(provider.provideFollowups(model.session!, CancellationToken.None)).then(followups => {
						model.setFollowups(request, withNullAsUndefined(followups));
					});
				}
			}
		});
		this._pendingRequests.set(model.sessionId, rawResponsePromise);
		rawResponsePromise.finally(() => {
			this._pendingRequests.delete(model.sessionId);
		});
		return rawResponsePromise;
	}

	async getSlashCommands(sessionId: string, token: CancellationToken): Promise<IInteractiveSlashCommand[] | undefined> {
		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		await model.waitForInitialization();
		const provider = this._providers.get(model.providerId);
		if (!provider) {
			throw new Error(`Unknown provider: ${model.providerId}`);
		}

		if (!provider.provideSlashCommands) {
			return;
		}

		return withNullAsUndefined(await provider.provideSlashCommands(model.session!, token));
	}

	async addInteractiveRequest(context: any): Promise<void> {
		// This and resolveRequest are not currently used by any scenario, but leave for future use

		// TODO How to decide which session this goes to?
		const model = Iterable.first(this._sessionModels.values());
		if (!model) {
			// If no session, create one- how and is the service the right place to decide this?
			this.trace('addInteractiveRequest', 'No session available');
			return;
		}

		const provider = this._providers.get(model.providerId);
		if (!provider || !provider.resolveRequest) {
			this.trace('addInteractiveRequest', 'No provider available');
			return undefined;
		}

		this.trace('addInteractiveRequest', `Calling resolveRequest for session ${model.sessionId}`);
		const request = await provider.resolveRequest(model.session!, context, CancellationToken.None);
		if (!request) {
			this.trace('addInteractiveRequest', `Provider returned no request for session ${model.sessionId}`);
			return;
		}

		// Maybe this API should queue a request after the current one?
		this.trace('addInteractiveRequest', `Sending resolved request for session ${model.sessionId}`);
		this.sendRequest(model.sessionId, request.message);
	}

	async sendInteractiveRequestToProvider(sessionId: string, message: IInteractiveSessionDynamicRequest): Promise<void> {
		this.trace('sendInteractiveRequestToProvider', `sessionId: ${sessionId}`);
		await this.sendRequest(sessionId, message.message);
	}

	getProviders(): string[] {
		return Array.from(this._providers.keys());
	}

	async addCompleteRequest(sessionId: string, message: string, response: IInteractiveSessionCompleteResponse): Promise<void> {
		this.trace('addCompleteRequest', `message: ${message}`);

		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		await model.waitForInitialization();
		const request = model.addRequest(message);
		model.acceptResponseProgress(request, {
			content: response.message,
		});
		model.completeResponse(request, {
			session: model.session!,
			errorDetails: response.errorDetails,
		});
	}

	cancelCurrentRequestForSession(sessionId: string): void {
		this.trace('cancelCurrentRequestForSession', `sessionId: ${sessionId}`);
		this._pendingRequests.get(sessionId)?.cancel();
	}

	clearSession(sessionId: string): void {
		this.trace('clearSession', `sessionId: ${sessionId}`);
		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		this._persistedSessions[sessionId] = model.toJSON();
		model.dispose();
		this._sessionModels.delete(sessionId);
		this._pendingRequests.get(sessionId)?.cancel();
	}

	registerProvider(provider: IInteractiveProvider): IDisposable {
		this.trace('registerProvider', `Adding new interactive session provider`);

		if (this._providers.has(provider.id)) {
			throw new Error(`Provider ${provider.id} already registered`);
		}

		this._providers.set(provider.id, provider);
		this._hasProvider.set(true);

		return toDisposable(() => {
			this.trace('registerProvider', `Disposing interactive session provider`);
			this._providers.delete(provider.id);
			this._hasProvider.set(this._providers.size > 0);
		});
	}

	getProviderInfos(): IInteractiveProviderInfo[] {
		return Array.from(this._providers.values()).map(provider => {
			return {
				id: provider.id,
				displayName: provider.displayName
			};
		});
	}
}
