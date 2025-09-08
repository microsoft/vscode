/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { OffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IChatAgentService } from './chatAgents.js';
import { ChatModel, IChatModel } from './chatModel.js';
import { ChatModelErrorClassification, ChatModelErrorEvent, ChatModelLoadClassification, ChatModelLoadEvent, IChatModelService } from './chatModelService.js';
import { ChatRequestTextPart, IParsedChatRequest } from './chatParserTypes.js';
import { IChatSessionsService } from './chatSessionsService.js';
import { ChatUri as ChatSessionUri } from './chatUri.js';
import { ChatAgentLocation } from './constants.js';

class CancellableRequest extends Disposable {
	constructor(
		public readonly cancellationTokenSource: CancellationTokenSource,
		public requestId: string | undefined
	) {
		super();
	}

	dispose() {
		this.cancellationTokenSource.dispose();
		super.dispose();
	}

	cancel() {
		this.cancellationTokenSource.cancel();
	}
}

export class ChatModelService extends Disposable implements IChatModelService {
	declare readonly _serviceBrand: undefined;

	private readonly _contentProviderSessionModels = new Map<string, Map<string, { readonly model: IChatModel; readonly disposables: DisposableStore }>>();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IChatSessionsService private readonly chatSessionService: IChatSessionsService
	) {
		super();
	}

	async loadSessionForResource(resource: URI, location: ChatAgentLocation, token: CancellationToken): Promise<IChatModel | undefined> {
		const stopwatch = new StopWatch();
		let sessionType: 'local' | 'contentProvider' = 'local';
		let sessionId = '';
		let success = false;

		try {
			const parsed = ChatSessionUri.parse(resource);
			if (!parsed) {
				this.telemetryService.publicLogError2<ChatModelErrorEvent, ChatModelErrorClassification>('chatModelServiceError', {
					operation: 'parseUri',
					errorMessage: 'Invalid chat session URI',
					duration: stopwatch.elapsed()
				});
				throw new Error('Invalid chat session URI');
			}

			sessionId = this.anonymizeSessionId(parsed.sessionId);
			sessionType = parsed.chatSessionType === 'local' ? 'local' : 'contentProvider';

			const existing = this._contentProviderSessionModels.get(parsed.chatSessionType)?.get(parsed.sessionId);
			if (existing) {
				success = true;
				this.logService.trace(`ChatModelService: Returning existing session ${parsed.sessionId}`);
				return existing.model;
			}

			if (parsed.chatSessionType === 'local') {
				// For local sessions, delegate to the chat service
				// This maintains backwards compatibility
				this.logService.trace(`ChatModelService: Loading local session ${parsed.sessionId}`);
				// Note: This would need to be injected or accessed differently in the real implementation
				// For now, we return undefined and let the calling code handle local sessions
				success = true;
				return undefined; // Let ChatService handle local sessions for now
			}

			this.logService.trace(`ChatModelService: Loading content provider session ${parsed.sessionId} of type ${parsed.chatSessionType}`);
			const model = await this.loadContentProviderSession(parsed.chatSessionType, parsed.sessionId, location, token);
			success = !!model;
			return model;

		} catch (error) {
			this.telemetryService.publicLogError2<ChatModelErrorEvent, ChatModelErrorClassification>('chatModelServiceError', {
				operation: 'loadSession',
				errorMessage: error instanceof Error ? error.message : String(error),
				sessionType,
				duration: stopwatch.elapsed()
			});
			throw error;
		} finally {
			this.telemetryService.publicLog2<ChatModelLoadEvent, ChatModelLoadClassification>('chatModelServiceLoad', {
				sessionType,
				success,
				duration: stopwatch.elapsed(),
				sessionId,
				location: location.toString()
			});
		}
	}

	private async loadContentProviderSession(chatSessionType: string, sessionId: string, location: ChatAgentLocation, token: CancellationToken): Promise<IChatModel | undefined> {
		try {
			const content = await this.chatSessionService.provideChatSessionContent(chatSessionType, sessionId, token);

			const model = this.instantiationService.createInstance(ChatModel, undefined, location);
			if (!this._contentProviderSessionModels.has(chatSessionType)) {
				this._contentProviderSessionModels.set(chatSessionType, new Map());
			}
			const disposables = new DisposableStore();
			this._contentProviderSessionModels.get(chatSessionType)!.set(sessionId, { model, disposables });

			disposables.add(model.onDidDispose(() => {
				this._contentProviderSessionModels?.get(chatSessionType)?.delete(sessionId);
				content.dispose();
			}));

			await this.populateModelFromContent(model, content, disposables);
			this.logService.trace(`ChatModelService: Successfully loaded content provider session ${sessionId}`);
			return model;

		} catch (error) {
			this.telemetryService.publicLogError2<ChatModelErrorEvent, ChatModelErrorClassification>('chatModelServiceError', {
				operation: 'createModel',
				errorMessage: error instanceof Error ? error.message : String(error),
				sessionType: chatSessionType
			});
			this.logService.error(`ChatModelService: Error loading content provider session ${sessionId}:`, error);
			throw error;
		}
	}

	private async populateModelFromContent(model: ChatModel, content: any, disposables: DisposableStore): Promise<void> {
		let lastRequest: any | undefined;
		for (const message of content.history) {
			if (message.type === 'request') {
				if (lastRequest) {
					model.completeResponse(lastRequest);
				}

				const requestText = message.prompt;
				const parsedRequest: IParsedChatRequest = {
					text: requestText,
					parts: [new ChatRequestTextPart(
						new OffsetRange(0, requestText.length),
						{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: requestText.length + 1 },
						requestText
					)]
				};

				const agent = message.participant
					? this.chatAgentService.getAgent(message.participant)
					: this.chatAgentService.getAgent(content.type);

				lastRequest = model.addRequest(parsedRequest,
					{ variables: [] }, // variableData
					0, // attempt
					undefined,
					agent,
					undefined, // slashCommand
					undefined, // confirmation
					undefined, // locationData
					undefined, // attachments
					true // isCompleteAddedRequest
				);
			} else {
				// response
				if (lastRequest) {
					for (const part of message.parts) {
						model.acceptResponseProgress(lastRequest, part);
					}
				}
			}
		}

		// Handle ongoing progress if available
		if (content.progressObs && lastRequest && content.interruptActiveResponseCallback) {
			this.setupProgressObservation(model, content, lastRequest, disposables);
		}
	}

	private setupProgressObservation(model: ChatModel, content: any, lastRequest: any, disposables: DisposableStore): void {
		const initialCancellationRequest = new CancellableRequest(new CancellationTokenSource(), undefined);
		const cancellationListener = new MutableDisposable();

		const createCancellationListener = (token: CancellationToken) => {
			return token.onCancellationRequested(() => {
				content.interruptActiveResponseCallback?.().then((userConfirmedInterruption: boolean) => {
					if (!userConfirmedInterruption) {
						const newCancellationRequest = new CancellableRequest(new CancellationTokenSource(), undefined);
						cancellationListener.value = createCancellationListener(newCancellationRequest.cancellationTokenSource.token);
					}
				});
			});
		};

		cancellationListener.value = createCancellationListener(initialCancellationRequest.cancellationTokenSource.token);
		disposables.add(cancellationListener);
		disposables.add(initialCancellationRequest);

		let lastProgressLength = 0;
		disposables.add(autorun(reader => {
			const progressArray = content.progressObs?.read(reader) ?? [];
			const isComplete = content.isCompleteObs?.read(reader) ?? false;

			// Process only new progress items
			if (progressArray.length > lastProgressLength) {
				const newProgress = progressArray.slice(lastProgressLength);
				for (const progress of newProgress) {
					model.acceptResponseProgress(lastRequest, progress, true);
				}
				lastProgressLength = progressArray.length;
			}

			if (isComplete && lastRequest && !lastRequest.response?.isComplete) {
				model.completeResponse(lastRequest);
			}
		}));
	}

	getContentProviderSession(chatSessionType: string, sessionId: string): IChatModel | undefined {
		return this._contentProviderSessionModels.get(chatSessionType)?.get(sessionId)?.model;
	}

	disposeSessionsOfType(chatSessionType: string): void {
		const sessions = this._contentProviderSessionModels.get(chatSessionType);
		if (sessions) {
			for (const [sessionId, { disposables }] of sessions) {
				disposables.dispose();
				this.logService.trace(`ChatModelService: Disposed session ${sessionId} of type ${chatSessionType}`);
			}
			this._contentProviderSessionModels.delete(chatSessionType);
		}
	}

	private anonymizeSessionId(sessionId: string): string {
		// Simple anonymization - in a real implementation you might want a more sophisticated approach
		return sessionId.length > 8 ? sessionId.substring(0, 8) + '...' : sessionId;
	}

	override dispose(): void {
		// Dispose all content provider sessions
		for (const [chatSessionType] of this._contentProviderSessionModels) {
			this.disposeSessionsOfType(chatSessionType);
		}
		super.dispose();
	}
}