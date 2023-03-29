/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { groupBy } from 'vs/base/common/collections';
import { Emitter, Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { withNullAsUndefined } from 'vs/base/common/types';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IViewsService } from 'vs/workbench/common/views';
import { IInteractiveSessionContributionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContributionService';
import { ISerializableInteractiveSessionData, ISerializableInteractiveSessionsData, InteractiveSessionModel, InteractiveWelcomeMessageModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionModel';
import { IInteractiveProgress, IInteractiveProvider, IInteractiveSessionCompleteResponse, IInteractiveSessionDynamicRequest, IInteractiveSessionReplyFollowup, IInteractiveSessionService, IInteractiveSessionUserActionEvent, IInteractiveSlashCommand } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

const serializedInteractiveSessionKey = 'interactive.sessions';

type InteractiveSessionProviderInvokedEvent = {
	providerId: string;
	timeToFirstProgress: number;
	totalTime: number;
	result: 'success' | 'error' | 'errorWithOutput' | 'cancelled';
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

export class InteractiveSessionService extends Disposable implements IInteractiveSessionService {
	declare _serviceBrand: undefined;

	private readonly _providers = new Map<string, IInteractiveProvider>();
	private readonly _sessionModels = new Map<number, InteractiveSessionModel>();
	private readonly _releasedSessions = new Set<number>();
	private readonly _pendingRequests = new Map<number, CancelablePromise<void>>();
	private readonly _unprocessedPersistedSessions: ISerializableInteractiveSessionsData;

	private readonly _onDidPerformUserAction = this._register(new Emitter<IInteractiveSessionUserActionEvent>());
	public readonly onDidPerformUserAction: Event<IInteractiveSessionUserActionEvent> = this._onDidPerformUserAction.event;

	constructor(
		@IStorageService storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IViewsService private readonly viewsService: IViewsService,
		@IInteractiveSessionContributionService private readonly interactiveSessionContributionService: IInteractiveSessionContributionService,
	) {
		super();
		const sessionData = storageService.get(serializedInteractiveSessionKey, StorageScope.WORKSPACE, '');
		if (sessionData) {
			this._unprocessedPersistedSessions = this.deserializeInteractiveSessions(sessionData);
			const countsForLog = Object.keys(this._unprocessedPersistedSessions).map(key => `${key}: ${this._unprocessedPersistedSessions[key].length}`).join(', ');
			this.trace('constructor', `Restored persisted sessions: ${countsForLog}`);
		} else {
			this._unprocessedPersistedSessions = {};
			this.trace('constructor', 'No persisted sessions');
		}

		this._register(storageService.onWillSaveState(e => {
			const allSessions = Array.from(this._sessionModels.values())
				.filter(session => session.getRequests().length > 0);
			const serialized = JSON.stringify(allSessions);
			this.trace('onWillSaveState', `Persisting ${this._sessionModels.size} sessions`);
			storageService.store(serializedInteractiveSessionKey, serialized, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}));
	}

	notifyUserAction(action: IInteractiveSessionUserActionEvent): void {
		this._onDidPerformUserAction.fire(action);
	}

	progressiveRenderingEnabled(providerId: string): boolean {
		return this._providers.get(providerId)?.progressiveRenderingEnabled ?? false;
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

			return groupBy(arrayOfSessions, item => item.providerId);
		} catch (err) {
			this.error('deserializeInteractiveSessions', `Malformed session data: ${err}. [${sessionData.substring(0, 20)}${sessionData.length > 20 ? '...' : ''}]`);
			return {};
		}
	}

	async startSession(providerId: string, allowRestoringSession: boolean, token: CancellationToken): Promise<InteractiveSessionModel | undefined> {
		this.trace('startSession', `providerId=${providerId}, allowRestoringSession=${allowRestoringSession}`);
		await this.extensionService.activateByEvent(`onInteractiveSession:${providerId}`);

		const provider = this._providers.get(providerId);
		if (!provider) {
			throw new Error(`Unknown provider: ${providerId}`);
		}

		const restored = allowRestoringSession ? this.getNextRestoredSession(providerId) : undefined;
		if (restored instanceof InteractiveSessionModel) {
			this.trace('startSession', `Restored live session with id ${restored.sessionId}`);
			return restored;
		}

		const someSessionHistory = restored;
		this.trace('startSession', `Has history: ${!!someSessionHistory}. Including provider state: ${!!someSessionHistory?.providerState}`);
		const session = await provider.prepareSession(someSessionHistory?.providerState, token);
		if (!session) {
			if (someSessionHistory) {
				const providerData = this._unprocessedPersistedSessions[providerId];
				providerData?.unshift(someSessionHistory);
			}

			this.trace('startSession', 'Provider returned no session');
			return undefined;
		}

		this.trace('startSession', `Provider returned session with id ${session.id}`);

		const welcomeMessage = someSessionHistory ? undefined : await provider.provideWelcomeMessage?.(token);
		const welcomeModel = welcomeMessage && new InteractiveWelcomeMessageModel(
			welcomeMessage.map(item => typeof item === 'string' ? new MarkdownString(item) : item as IInteractiveSessionReplyFollowup[]), session.responderUsername, session.responderAvatarIconUri);
		const model = this.instantiationService.createInstance(InteractiveSessionModel, session, providerId, withNullAsUndefined(welcomeModel), someSessionHistory);
		this._sessionModels.set(model.sessionId, model);
		return model;
	}

	private getNextRestoredSession(providerId: string): InteractiveSessionModel | ISerializableInteractiveSessionData | undefined {
		const releasedSessionId = Iterable.find(this._releasedSessions.values(), sessionId => this._sessionModels.get(sessionId)?.providerId === providerId);
		if (typeof releasedSessionId === 'number') {
			this._releasedSessions.delete(releasedSessionId);
			return this._sessionModels.get(releasedSessionId);
		}

		const providerData = this._unprocessedPersistedSessions[providerId] ?? [];
		return providerData.shift();
	}

	releaseSession(sessionId: number): void {
		this.trace('releaseSession', `sessionId=${sessionId}`);
		this._releasedSessions.add(sessionId);
	}

	sendRequest(sessionId: number, request: string | IInteractiveSessionReplyFollowup): { completePromise: CancelablePromise<void> } | undefined {
		const messageText = typeof request === 'string' ? request : request.message;
		this.trace('sendRequest', `sessionId: ${sessionId}, message: ${messageText.substring(0, 20)}${messageText.length > 20 ? '[...]' : ''}}`);
		if (!messageText.trim()) {
			this.trace('sendRequest', 'Rejected empty message');
			return undefined;
		}

		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		const provider = this._providers.get(model.providerId);
		if (!provider) {
			throw new Error(`Unknown provider: ${model.providerId}`);
		}

		if (this._pendingRequests.has(sessionId)) {
			this.trace('sendRequest', `Session ${sessionId} already has a pending request`);
			return undefined;
		}

		return { completePromise: this._sendRequestAsync(model, provider, request) };
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
			let rawResponse = await provider.provideReply({ session: model.session, message: request.message }, progressCallback, token);
			if (token.isCancellationRequested) {
				return;
			} else {
				if (!rawResponse) {
					this.trace('sendRequest', `Provider returned no response for session ${model.sessionId}`);
					rawResponse = { session: model.session, errorDetails: { message: localize('emptyResponse', "Provider returned null response") } };
				}

				this.telemetryService.publicLog2<InteractiveSessionProviderInvokedEvent, InteractiveSessionProviderInvokedClassification>('interactiveSessionProviderInvoked', {
					providerId: provider.id,
					timeToFirstProgress: rawResponse.timings?.firstProgress ?? 0,
					totalTime: rawResponse.timings?.totalElapsed ?? 0,
					result: rawResponse.errorDetails && gotProgress ? 'errorWithOutput' : rawResponse.errorDetails ? 'error' : 'success',
					requestType
				});
				model.completeResponse(request, rawResponse);
				this.trace('sendRequest', `Provider returned response for session ${model.sessionId}`);

				if (provider.provideFollowups) {
					Promise.resolve(provider.provideFollowups(model.session, CancellationToken.None)).then(followups => {
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

	async getSlashCommands(sessionId: number, token: CancellationToken): Promise<IInteractiveSlashCommand[] | undefined> {
		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		const provider = this._providers.get(model.providerId);
		if (!provider) {
			throw new Error(`Unknown provider: ${model.providerId}`);
		}

		if (!provider.provideSlashCommands) {
			return;
		}

		return withNullAsUndefined(await provider.provideSlashCommands(model.session, token));
	}

	acceptNewSessionState(sessionId: number, state: any): void {
		this.trace('acceptNewSessionState', `sessionId: ${sessionId}`);
		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		model.acceptNewProviderState(state);
	}

	async addInteractiveRequest(context: any): Promise<void> {
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
		const request = await provider.resolveRequest(model.session, context, CancellationToken.None);
		if (!request) {
			this.trace('addInteractiveRequest', `Provider returned no request for session ${model.sessionId}`);
			return;
		}

		// Maybe this API should queue a request after the current one?
		this.trace('addInteractiveRequest', `Sending resolved request for session ${model.sessionId}`);
		this.sendRequest(model.sessionId, request.message);
	}

	async sendInteractiveRequestToProvider(providerId: string, message: IInteractiveSessionDynamicRequest): Promise<void> {
		this.trace('sendInteractiveRequestToProvider', `providerId: ${providerId}`);
		const viewId = this.interactiveSessionContributionService.getViewIdForProvider(providerId);
		const view = await this.viewsService.openView(viewId);
		if (view) {
			// TODO The ViewPane type is in /browser/, do this somewhere else
			if ((view as any).acceptInput) {
				this.trace('sendInteractiveRequestToProvider', `Sending request to view ${viewId}`);
				(view as any).acceptInput(message.message); // TODO extend the request type to take metadata? Or call a resolve() method? Or something else.
				return;
			}
		}

		this.trace('sendInteractiveRequestToProvider', `Something went wrong, couldn't send request to view ${viewId}`);
	}

	async addCompleteRequest(message: string, response: IInteractiveSessionCompleteResponse): Promise<void> {
		this.trace('addCompleteRequest', `message: ${message}`);

		// TODO this api should take a providerId, but there is no relation between the interactive editor provider and this provider, so just grab the first one
		const providerId = Iterable.first(this._providers.keys());
		if (!providerId) {
			throw new Error('No providers available');
		}

		const viewId = this.interactiveSessionContributionService.getViewIdForProvider(providerId);
		const view = await this.viewsService.openView(viewId);

		if ((view as any).waitForViewModel) {
			// TODO The ViewPane type is in /browser/, and the flow is a bit weird, rethink this
			await (view as any).waitForViewModel();
		}

		// Currently we only support one session per provider
		const modelForProvider = Iterable.find(this._sessionModels.values(), model => model.providerId === providerId);

		if (!modelForProvider) {
			throw new Error(`Could not start session for provider ${providerId}`);
		}

		const request = modelForProvider.addRequest(message);
		modelForProvider.acceptResponseProgress(request, {
			content: response.message,
		});
		modelForProvider.completeResponse(request, {
			session: modelForProvider.session,
			errorDetails: response.errorDetails,
		});
	}

	cancelCurrentRequestForSession(sessionId: number): void {
		this.trace('cancelCurrentRequestForSession', `sessionId: ${sessionId}`);
		this._pendingRequests.get(sessionId)?.cancel();
	}

	clearSession(sessionId: number): void {
		this.trace('clearSession', `sessionId: ${sessionId}`);
		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		model.dispose();
		this._sessionModels.delete(sessionId);
		this._pendingRequests.get(sessionId)?.cancel();
		this._releasedSessions.delete(sessionId);
	}

	registerProvider(provider: IInteractiveProvider): IDisposable {
		this.trace('registerProvider', `Adding new interactive session provider`);

		if (this._providers.has(provider.id)) {
			throw new Error(`Provider ${provider.id} already registered`);
		}

		this._providers.set(provider.id, provider);

		return toDisposable(() => {
			this.trace('registerProvider', `Disposing interactive session provider`);
			this._providers.delete(provider.id);
		});
	}

	getAll() {
		return [...this._providers];
	}

	async provideSuggestions(providerId: string, token: CancellationToken): Promise<string[] | undefined> {
		this.trace('provideSuggestions', `Called for provider ${providerId}`);
		await this.extensionService.activateByEvent(`onInteractiveSession:${providerId}`);

		const provider = this._providers.get(providerId);
		if (!provider) {
			throw new Error(`Unknown provider: ${providerId}`);
		}

		if (!provider.provideSuggestions) {
			return;
		}

		const suggestions = await provider.provideSuggestions(token);
		this.trace('provideSuggestions', `Provider returned ${suggestions?.length} suggestions`);
		return withNullAsUndefined(suggestions);
	}
}
