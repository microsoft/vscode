/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { groupBy } from 'vs/base/common/collections';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { withNullAsUndefined } from 'vs/base/common/types';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ISerializableInteractiveSessionsData, InteractiveSessionModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionModel';
import { IInteractiveProgress, IInteractiveProvider, IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

const serializedInteractiveSessionKey = 'interactive.sessions';

export class InteractiveSessionService extends Disposable implements IInteractiveSessionService {
	declare _serviceBrand: undefined;

	private readonly _providers = new Map<string, IInteractiveProvider>();
	private readonly _sessionModels = new Map<number, InteractiveSessionModel>();
	private readonly _pendingRequestSessions = new Set<number>();
	private readonly _unprocessedPersistedSessions: ISerializableInteractiveSessionsData;

	constructor(
		@IStorageService storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
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
			const serialized = JSON.stringify(Array.from(this._sessionModels.values()));
			this.trace('onWillSaveState', `Persisting ${this._sessionModels.size} sessions`);
			storageService.store(serializedInteractiveSessionKey, serialized, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}));
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
			const arrayOfSessions = JSON.parse(sessionData);
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

		const providerData = this._unprocessedPersistedSessions[providerId] ?? [];
		const someSessionHistory = allowRestoringSession ? providerData.shift() : undefined;
		this.trace('startSession', `Has history: ${!!someSessionHistory}. Including provider state: ${!!someSessionHistory?.providerState}`);
		const session = await provider.prepareSession(someSessionHistory?.providerState, token);
		if (!session) {
			if (someSessionHistory) {
				providerData.unshift(someSessionHistory);
			}

			this.trace('startSession', 'Provider returned no session');
			return undefined;
		}

		this.trace('startSession', `Provider returned session with id ${session.id}`);
		const model = this.instantiationService.createInstance(InteractiveSessionModel, session, providerId, someSessionHistory);
		this._sessionModels.set(model.sessionId, model);
		return model;
	}

	sendRequest(sessionId: number, message: string, token: CancellationToken): boolean {
		this.trace('sendRequest', `sessionId: ${sessionId}, message: ${message.substring(0, 20)}${message.length > 20 ? '[...]' : ''}}`);
		if (!message.trim()) {
			this.trace('sendRequest', 'Rejected empty message');
			return false;
		}

		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		const provider = this._providers.get(model.providerId);
		if (!provider) {
			throw new Error(`Unknown provider: ${model.providerId}`);
		}

		if (this._pendingRequestSessions.has(sessionId)) {
			this.trace('sendRequest', `Session ${sessionId} already has a pending request`);
			return false;
		}

		// TODO log failures, add dummy response with error message
		const _sendRequest = async (): Promise<void> => {
			try {
				this._pendingRequestSessions.add(sessionId);
				const request = model.addRequest(message);
				const progressCallback = (progress: IInteractiveProgress) => {
					this.trace('sendRequest', `Provider returned progress for session ${sessionId}, ${progress.responsePart.length} chars`);
					model.mergeResponseContent(request, progress.responsePart);
				};
				const rawResponse = await provider.provideReply({ session: model.session, message }, progressCallback, token);
				if (!rawResponse) {
					this.trace('sendRequest', `Provider returned no response for session ${sessionId}`);
					return;
				}

				model.completeResponse(request, rawResponse.followups);
				this.trace('sendRequest', `Provider returned response for session ${sessionId} with ${rawResponse.followups} followups`);
			} finally {
				this._pendingRequestSessions.delete(sessionId);
			}
		};

		// Return immediately that the request was accepted, don't wait
		_sendRequest();
		return true;
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
		this.sendRequest(model.sessionId, request.message, CancellationToken.None);
	}

	clearSession(sessionId: number): void {
		this.trace('clearSession', `sessionId: ${sessionId}`);
		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		model.dispose();
		this._sessionModels.delete(sessionId);
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
