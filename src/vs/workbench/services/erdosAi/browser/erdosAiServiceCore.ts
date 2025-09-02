/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { diffStorage as diffStore } from '../../erdosAiUtils/browser/diffUtils.js';
import { Conversation, ConversationInfo, ConversationMessage } from '../common/conversationTypes.js';
import { StreamData } from '../../erdosAiBackend/browser/streamingParser.js';
import { IErdosAiWidgetInfo } from '../../../contrib/erdosAi/browser/widgets/widgetTypes.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';
import { IMessageIdManager } from '../../erdosAiConversation/common/messageIdManager.js';
import { IBackendClient } from '../../erdosAiBackend/common/backendClient.js';
import { IConversationSummarization } from '../../erdosAiConversation/common/conversationSummarization.js';
import { IFileChangeTracker } from '../common/fileChangeTracker.js';
import { IFunctionCallBuffer } from '../../erdosAiFunctions/common/functionCallBuffer.js';
import { ISearchReplaceCommandHandler } from '../../erdosAiCommands/common/searchReplaceCommandHandler.js';
import { IConsoleCommandHandler } from '../../erdosAiCommands/common/consoleCommandHandler.js';
import { IContextService } from '../../erdosAiContext/common/contextService.js';
import { IFunctionMessageManager } from '../../erdosAiFunctions/common/functionMessageManager.js';
import { IConversationVariableManager } from '../../erdosAiConversation/common/conversationVariableManager.js';
import { IFileCommandHandler } from '../../erdosAiCommands/common/fileCommandHandler.js';
import { ITerminalCommandHandler } from '../../erdosAiCommands/common/terminalCommandHandler.js';
import { IDeleteFileCommandHandler } from '../../erdosAiCommands/common/deleteFileCommandHandler.js';
import { IMessageReversion } from '../common/messageReversion.js';
import { IInfrastructureRegistry } from '../../erdosAiFunctions/common/infrastructureRegistry.js';
import { IFunctionCallService } from '../../erdosAiFunctions/common/functionCallService.js';
import { IErdosAiServiceCore } from '../common/erdosAiServiceCore.js';
import { ISearchService } from '../../../services/search/common/search.js';
import { IErdosAiNameService } from '../common/erdosAiNameService.js';


export class ErdosAiServiceCore extends Disposable implements IErdosAiServiceCore {
	readonly _serviceBrand: undefined;
	
	/**
	 * This is the single source of truth for ALL message IDs in the system
	 */
	private messageIdCounter = 0;
	private readonly _onConversationCreated = this._register(new Emitter<Conversation>());
	readonly onConversationCreated: Event<Conversation> = this._onConversationCreated.event;

	private readonly _onConversationLoaded = this._register(new Emitter<Conversation>());
	readonly onConversationLoaded: Event<Conversation> = this._onConversationLoaded.event;

	private readonly _onMessageAdded = this._register(new Emitter<ConversationMessage>());
	readonly onMessageAdded: Event<ConversationMessage> = this._onMessageAdded.event;

	private readonly _onStreamingData = this._register(new Emitter<StreamData>());
	readonly onStreamingData: Event<StreamData> = this._onStreamingData.event;

	private readonly _onStreamingComplete = this._register(new Emitter<void>());
	readonly onStreamingComplete: Event<void> = this._onStreamingComplete.event;

	private readonly _onStreamingError = this._register(new Emitter<{ errorId: string; message: string }>());
	readonly onStreamingError: Event<{ errorId: string; message: string }> = this._onStreamingError.event;

	private readonly _onThinkingMessage = this._register(new Emitter<{ message: string; hideCancel?: boolean }>());
	readonly onThinkingMessage: Event<{ message: string; hideCancel?: boolean }> = this._onThinkingMessage.event;

	private readonly _onOrchestratorStateChange = this._register(new Emitter<{isProcessing: boolean}>());
	readonly onOrchestratorStateChange: Event<{isProcessing: boolean}> = this._onOrchestratorStateChange.event;

	private readonly _onFunctionCallDisplayMessage = this._register(new Emitter<{ id: number; content: string; timestamp: string }>());
	readonly onFunctionCallDisplayMessage: Event<{ id: number; content: string; timestamp: string }> = this._onFunctionCallDisplayMessage.event;

	private readonly _onWidgetRequested = this._register(new Emitter<IErdosAiWidgetInfo>());
	readonly onWidgetRequested: Event<IErdosAiWidgetInfo> = this._onWidgetRequested.event;

	private readonly _onWidgetStreamingUpdate = this._register(new Emitter<{ 
		messageId: number; 
		delta: string; 
		isComplete: boolean; 
		replaceContent?: boolean;
		isSearchReplace?: boolean;
		field?: string;
		filename?: string;
		requestId?: string;
		diffData?: {
			diff: any[];
			added: number;
			deleted: number;
			clean_filename?: string;
		};
	}>());

	readonly onWidgetStreamingUpdate: Event<{ 
		messageId: number; 
		delta: string; 
		isComplete: boolean; 
		replaceContent?: boolean;
		isSearchReplace?: boolean;
		field?: string;
		filename?: string;
		requestId?: string;
	}> = this._onWidgetStreamingUpdate.event;

	private readonly _onWidgetButtonAction = this._register(new Emitter<{ messageId: number; action: string }>());
	readonly onWidgetButtonAction: Event<{ messageId: number; action: string }> = this._onWidgetButtonAction.event;

	private readonly _onShowConversationHistory = this._register(new Emitter<void>());
	readonly onShowConversationHistory: Event<void> = this._onShowConversationHistory.event;

	private readonly _onShowSettings = this._register(new Emitter<void>());
	readonly onShowSettings: Event<void> = this._onShowSettings.event;
	private currentRequestId: string | undefined;
	private currentRequestWasCancelled = false;
	private streamingBuffer: string = '';
	
	private processThinkingTagsWithBuffer(delta: string): string {
		this.streamingBuffer += delta;
		
		let processed = this.streamingBuffer.replace(
			/<thinking>([\s\S]*?)<\/thinking>/g,
			'<em class="erdos-ai-thinking">$1</em>'
		);
		
		const incompleteOpenMatch = processed.match(/<thinking(?:\s[^>]*)?$/);
		if (incompleteOpenMatch) {
			const incompleteTag = incompleteOpenMatch[0];
			const output = processed.substring(0, processed.length - incompleteTag.length);
			this.streamingBuffer = incompleteTag;
			return output;
		}
		
		const incompleteCloseMatch = processed.match(/<\/thinking?(?:\s[^>]*)?$/);
		if (incompleteCloseMatch) {
			const incompleteTag = incompleteCloseMatch[0];
			const output = processed.substring(0, processed.length - incompleteTag.length);
			this.streamingBuffer = incompleteTag;
			return output;
		}
		
		processed = processed.replace(/<thinking>/g, '<em class="erdos-ai-thinking">');
		processed = processed.replace(/<\/thinking>/g, '</em>');
		
		const result = processed;
		this.streamingBuffer = '';
		return result;
	}
	
	private resetThinkingBuffer(): void {
		this.streamingBuffer = '';
	}
	
	private processThinkingTagsComplete(content: string): string {
		let processed = content.replace(
			/<thinking>([\s\S]*?)<\/thinking>/g,
			'<em class="erdos-ai-thinking">$1</em>'
		);
		
		processed = processed.replace(/<thinking>/g, '<em class="erdos-ai-thinking">');
		processed = processed.replace(/<\/thinking>/g, '</em>');
		
		return processed;
	}
	
	private functionCallMessageIds: Map<string, number> = new Map();
	private lastThinkingMessageTime: Date | null = null;
	private isThinkingMessageActive = false;
	
	// Orchestrator state moved inline
	private static readonly AI_STATUS_DONE = 'done';
	private static readonly AI_STATUS_CONTINUE_SILENT = 'continue_silent';
	private static readonly AI_STATUS_CONTINUE_AND_DISPLAY = 'continue_and_display';
	private static readonly AI_STATUS_PENDING = 'pending';
	private static readonly AI_STATUS_ERROR = 'error';
	
	private orchestratorIsProcessing = false;
	private orchestratorCurrentRequestId: string | null = null;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IConversationManager private readonly conversationManager: IConversationManager,
		@IMessageIdManager private readonly messageIdManager: IMessageIdManager,
		@IBackendClient private readonly backendClient: IBackendClient,
		@IConversationSummarization private readonly conversationSummarization: IConversationSummarization,
		@IFileChangeTracker private readonly fileChangeTracker: IFileChangeTracker,
		@IFunctionCallBuffer private readonly functionCallBuffer: IFunctionCallBuffer,
		@ISearchReplaceCommandHandler private readonly searchReplaceCommandHandler: ISearchReplaceCommandHandler,
		@IConsoleCommandHandler private readonly consoleCommandHandler: IConsoleCommandHandler,
		@IContextService private readonly contextService: IContextService,
		@IFunctionMessageManager private readonly functionMessageManager: IFunctionMessageManager,
		@IConversationVariableManager private readonly conversationVariableManager: IConversationVariableManager,
		@IFileCommandHandler private readonly fileCommandHandler: IFileCommandHandler,
		@ITerminalCommandHandler private readonly terminalCommandHandler: ITerminalCommandHandler,
		@IDeleteFileCommandHandler private readonly deleteFileCommandHandler: IDeleteFileCommandHandler,
		@IMessageReversion private readonly messageReversion: IMessageReversion,
		@IInfrastructureRegistry private readonly infrastructureRegistry: IInfrastructureRegistry,
		@IFunctionCallService private readonly functionCallService: IFunctionCallService,
		@ISearchService private readonly searchService: ISearchService,
		@ICommonUtils private readonly commonUtils: ICommonUtils,
		@IErdosAiNameService private readonly nameService: IErdosAiNameService,
	) {
		super();
		
		this.logService.info('ErdosAiServiceCore: Constructor starting...');
		
		// Set up the message ID generator for the conversation manager
		this.conversationManager.setMessageIdGenerator(() => this.getNextMessageId());
		
		// Set up the message ID generator for the message ID manager
		this.messageIdManager.setMessageIdGenerator(() => this.getNextMessageId());
		
		// Set up the infrastructure registry with all dependencies
		this.infrastructureRegistry.setConversationManager(this.conversationManager);
		this.infrastructureRegistry.setMessageIdManager(this.messageIdManager);
		this.infrastructureRegistry.setSearchService(this.searchService);
		
		// Listen for conversation name updates from the name service
		this._register(this.nameService.onConversationNameUpdated(async (event: { conversationId: number; newName: string }) => {
			// Reload and fire the conversation loaded event to update the UI
			const updatedConversation = await this.conversationManager.loadConversation(event.conversationId);
			if (updatedConversation) {
				this._onConversationLoaded.fire(updatedConversation);
			}
		}));
		
		// Initialize backend environment detection (like the original does)
		this.initializeBackendEnvironment().catch(error => {
			this.logService.error('Failed to initialize backend environment:', error);
		});
		
		this.logService.info('ErdosAiServiceCore: Constructor completed - services injected via DI');
	}
	
	/**
	 * This is the ONLY method that should allocate message IDs anywhere in the system
	 */
	public getNextMessageId(): number {
		this.messageIdCounter += 1;
		return this.messageIdCounter;
	}
	
	private async initializeBackendEnvironment(): Promise<void> {
		try {
			const config = await this.backendClient.detectEnvironment();
			const envName = config.environment === 'local' ? 'Local Development' : 'Production';
			this.logService.info(`Erdos AI backend environment detected: ${envName} (${config.url})`);
		} catch (error) {
			this.logService.warn('Failed to detect backend environment, using production:', error);
		}
	}

	async newConversation(name?: string): Promise<Conversation> {
		this.logService.info('Creating new conversation', name ? `with name: ${name}` : '');
		
		try {
			const highestBlankId = await this.conversationManager.findHighestBlankConversation();
			
			if (highestBlankId !== null) {
				this.logService.info('Found existing blank conversation:', highestBlankId, 'switching to it instead of creating new one');
				
				const existingConversation = await this.conversationManager.loadConversation(highestBlankId);
				
				if (existingConversation) {
					if (name) {
						await this.conversationManager.renameConversation(highestBlankId, name);
						existingConversation.info.name = name;
					}
					
					this.messageIdManager.clearPreallocationStateForConversationSwitch();
					
					this.fileChangeTracker.clearAllFileHighlighting();
					
					await this.conversationManager.switchToConversation(highestBlankId);
					
					await this.conversationVariableManager.loadConversationVariables(highestBlankId);
					
					diffStore.setConversationManager(this.conversationManager);
					await diffStore.loadDiffsFromFile();
					
					this._onConversationLoaded.fire(existingConversation);
					
					this.logService.info('Switched to existing blank conversation:', existingConversation.info.id);
					return existingConversation;
				}
			}
			
			const conversation = await this.conversationManager.createNewConversation(name);
			
			this.messageIdManager.clearPreallocationStateForConversationSwitch();
			
			await this.fileChangeTracker.initializeFileChangeTracking(conversation.info.id);
			
			this._onConversationCreated.fire(conversation);
			this._onConversationLoaded.fire(conversation);
			
			this.logService.info('New conversation created:', conversation.info.id);
			return conversation;
		} catch (error) {
			this.logService.error('Failed to create new conversation:', error);
			throw error;
		}
	}

	async loadConversation(id: number): Promise<Conversation | null> {
		this.logService.info('Loading conversation:', id);
		
		this.hideThinkingMessage();
		
		try {
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation) {
				await this.conversationVariableManager.storeConversationVariables(currentConversation.info.id);
			}
			
			const success = await this.conversationManager.switchToConversation(id);
			if (success) {
				const conversation = this.conversationManager.getCurrentConversation();
				if (conversation) {
					await this.conversationVariableManager.loadConversationVariables(conversation.info.id);
					
					diffStore.setConversationManager(this.conversationManager);
					await diffStore.loadDiffsFromFile();
					
					this.messageIdManager.resetMessageIdCounterForConversation(conversation);
					
					this.messageIdManager.clearPreallocationStateForConversationSwitch();
					
					this.fileChangeTracker.clearAllFileHighlighting();
					
					await this.fileChangeTracker.initializeFileChangeTracking(conversation.info.id);
					
					this._onConversationLoaded.fire(conversation);
					return conversation;
				}
			}
			return null;
		} catch (error) {
			this.logService.error('Failed to load conversation:', error);
			return null;
		}
	}

	async sendMessage(message: string): Promise<void> {
		this.resetThinkingBuffer();
		if (!message.trim()) {
			throw new Error('Message cannot be empty');
		}

		const conversation = this.conversationManager.getCurrentConversation();
		if (!conversation) {
			throw new Error('No active conversation');
		}

		this.logService.info('[SERVICE] Routing user message through orchestrator:', message);

		const requestId = this.generateRequestId();
		
		this.startAiSearch(message, requestId);
	}

	async getDiffDataForMessage(messageId: string): Promise<any> {
		try {
			diffStore.setConversationManager(this.conversationManager);
			const storedDiff = diffStore.getDiffData(messageId);
			return storedDiff;
		} catch (error) {
			console.error(`[SERVICE_DIFF_DEBUG] Failed to get diff data for message ${messageId}:`, error);
			return null;
		}
	}

	async executeStreamingForOrchestrator(message: string, userMessageId: number, requestId: string): Promise<void> {
		try {
			this.functionCallBuffer.clearBuffer();
			this.functionCallMessageIds.clear();
			this.messageIdManager.resetFirstFunctionCallTracking();

			this.currentRequestId = requestId;
			this.currentRequestWasCancelled = false;

			if (this.shouldAutoShowThinkingMessage()) {
				this.showThinkingMessage();
			}

		const provider = this.getAIProvider();
		const model = this.getAIModel();
		const temperature = this.getTemperatureSync();

		let messages = this.conversationManager.getMessages();

		const conversation = this.conversationManager.getCurrentConversation();
		if (conversation) {
			const conversationPaths = this.conversationManager.getConversationPaths(conversation.info.id);
			const currentQueryCount = this.conversationSummarization.countOriginalQueries(messages);
			
			if (currentQueryCount >= 3) {
				const state = await this.conversationSummarization.loadBackgroundSummarizationState(conversationPaths);
				const neededSummaryQuery = currentQueryCount - 2;
				if (state && state.target_query === neededSummaryQuery) {
					await this.conversationSummarization.waitForPersistentBackgroundSummarization(conversationPaths);
				}
			}
			
			await this.conversationSummarization.checkPersistentBackgroundSummarization(conversationPaths);
		}

		let conversationWithSummary: { conversation: ConversationMessage[], summary: any } = { conversation: messages, summary: null };
		if (conversation) {
			const conversationPaths = this.conversationManager.getConversationPaths(conversation.info.id);
			conversationWithSummary = await this.conversationSummarization.prepareConversationWithSummaries(messages, conversationPaths);
			messages = conversationWithSummary.conversation;
		}

		const isBackendHealthy = await this.checkBackendHealth();
		if (!isBackendHealthy) {
			this.hideThinkingMessage();
			
			this.handleFunctionCompletion('error', {
				error: 'Backend health check failed'
			});
			
			const errorId = `error_${Date.now()}_${Math.floor(Math.random() * 9000) + 1000}`;
			this._onStreamingError.fire({
				errorId,
				message: 'Could not connect to backend server within 30 seconds. Please check your internet connectivity and try again. Often this is solved by just retrying. If the problem persists, please open a thread at https://community.lotas.ai/.'
			});
			
			this._onStreamingComplete.fire();
			return;
		}

		const contextData = await this.contextService.prepareContextForBackend(messages);
		
		if (conversationWithSummary.summary) {
			contextData.previous_summary = conversationWithSummary.summary;
		}

		let hasStartedStreaming = false;
		let hasFunctionCallsInResponse = false;
		let assistantMessageId: number | null = null;
		let accumulatedResponse = '';

		const streamingWidgets = new Map<string, { messageId: number; functionType: string; accumulatedContent: string; streamedContent: string }>();


		let skipAssistantMessageStreaming = false;

		await this.backendClient.sendStreamingQuery(
			messages,
			provider,
			model,
			temperature || 0.7,
			requestId,
			contextData || {},
			async (data: StreamData) => {
				if (data.type === 'content' && data.delta) {
					

					if (!assistantMessageId && !skipAssistantMessageStreaming) {
						assistantMessageId = this.conversationManager.getNextMessageId();
					}


					
					accumulatedResponse += data.delta;

					if (!skipAssistantMessageStreaming) {
						const processedDelta = this.processThinkingTagsWithBuffer(data.delta);
						
						if (!hasStartedStreaming && assistantMessageId) {
							this.hideThinkingMessage();
							this.conversationManager.startStreamingMessageWithId(assistantMessageId);
							hasStartedStreaming = true;
						}
						
						this.conversationManager.updateStreamingMessage(processedDelta, true);
						
						this._onStreamingData.fire({
							...data,
							delta: processedDelta,
							content: processedDelta
						});
					}
				}
				
				if (data.type === 'function_call' && data.functionCall) {
					this.hideThinkingMessage();
	
					hasFunctionCallsInResponse = true;
					
					if (assistantMessageId && accumulatedResponse.length > 0) {

						const textMessageId = this.conversationManager.completeStreamingMessage({
							related_to: userMessageId
						}, this.processThinkingTagsComplete.bind(this));

						
						
						const finalConversation = this.conversationManager.getCurrentConversation();
						const completedTextMessage = finalConversation?.messages.find((m: ConversationMessage) => m.id === textMessageId);
						if (completedTextMessage) {
							this._onMessageAdded.fire(completedTextMessage);
						}
						
						accumulatedResponse = '';
						
						assistantMessageId = null;
						hasStartedStreaming = false;
					}
					
					const preallocatedMessageId = this.messageIdManager.preallocateFunctionMessageIds(data.functionCall.name, data.functionCall.call_id);
					
					// For streaming functions, skip immediate processing - they're handled after streaming completes
					if (this.functionMessageManager.isStreamingFunction(data.functionCall.name)) {
						this.functionCallBuffer.addToFunctionCallBuffer({
							function_call: data.functionCall,
							request_id: requestId,
							message_id: preallocatedMessageId.toString()
						});
						this.logService.info('Added streaming function to buffer - will be processed after streaming completes:', data.functionCall.name);
					} else {
						// Non-streaming functions: Process immediately
						this.logService.info('Processing non-streaming function immediately:', data.functionCall.name);
						
						try {
							const functionResult = await this.processIndividualFunctionCall(data.functionCall, userMessageId, requestId, preallocatedMessageId);
							
							if (functionResult) {
								this.logService.info(`[FUNCTION RESULT] Function ${data.functionCall.name} returned status: ${functionResult.status}`);
								
								// CRITICAL: Call orchestrator to handle the status exactly like erdosAiService.ts does
								this.handleFunctionCompletion(functionResult.status, functionResult.data);
							}
						} catch (error) {
							this.logService.error('Failed to process non-streaming function call:', error);
						}
					}
				}

				if (data.type === 'done' && data.isComplete) {
					
					if (accumulatedResponse.length > 0) {
						
						if (!assistantMessageId) {
							assistantMessageId = this.conversationManager.getNextMessageId();
						} else {
						}
						
						const textMessageId = this.conversationManager.completeStreamingMessage({
							related_to: userMessageId
						}, this.processThinkingTagsComplete.bind(this));
						
						
						const finalConversation = this.conversationManager.getCurrentConversation();
						const completedTextMessage = finalConversation?.messages.find((m: ConversationMessage) => m.id === textMessageId);
						if (completedTextMessage) {
							this._onMessageAdded.fire(completedTextMessage);
						} else {
							if (finalConversation?.messages) {
							}
						}
						
						accumulatedResponse = '';
						
						assistantMessageId = null;
						hasStartedStreaming = false;
					} else {
					}
				}

				if (data.type === 'function_delta' && data.field && data.call_id) {
					
					if (!hasFunctionCallsInResponse) {
						hasFunctionCallsInResponse = true;
					}
					
					this.hideThinkingMessage();

					
					if (!streamingWidgets.has(data.call_id)) {
						if (assistantMessageId && accumulatedResponse.length > 0) {
							const textMessageId = this.conversationManager.completeStreamingMessage({
								related_to: userMessageId
							}, this.processThinkingTagsComplete.bind(this));
							
							const finalConversation = this.conversationManager.getCurrentConversation();
							const completedTextMessage = finalConversation?.messages.find((m: ConversationMessage) => m.id === textMessageId);
							if (completedTextMessage) {
								this._onMessageAdded.fire(completedTextMessage);
							}
							
							accumulatedResponse = '';
							assistantMessageId = null;
						}
						
						const messageId = this.messageIdManager.preallocateFunctionMessageIds(data.field, data.call_id);
						streamingWidgets.set(data.call_id, {
							messageId,
							functionType: data.field,
							accumulatedContent: '',
							streamedContent: ''
						});
						
						if (data.field === 'run_console_cmd') {
							
							this._onWidgetRequested.fire({
								messageId,
								requestId,
								functionCallType: 'run_console_cmd',
								initialContent: '',
								filename: undefined,
								handlers: {
									onAccept: async (msgId: number, content: string) => {
										this.fireWidgetButtonAction(msgId, 'hide');
										const result = await this.consoleCommandHandler.acceptConsoleCommand(msgId, content, requestId);
										this.handleFunctionCompletion(result.status, result.data);
									},
									onCancel: async (msgId: number) => {
										this.fireWidgetButtonAction(msgId, 'hide');
										const result = await this.consoleCommandHandler.cancelConsoleCommand(msgId, requestId);
										this.handleFunctionCompletion(result.status, result.data);
									},
									onAllowList: async (msgId: number, content: string) => {
									}
								}
							});
						} else if (data.field === 'run_terminal_cmd') {							
							this.logService.info('Terminal auto-run denied during streaming');

							this._onWidgetRequested.fire({
								messageId,
								requestId,
								functionCallType: 'run_terminal_cmd',
								initialContent: '',
								filename: undefined,
								autoAccept: false,
								handlers: {
									onAccept: async (msgId: number, content: string) => {
										this.fireWidgetButtonAction(msgId, 'hide');
										const result = await this.terminalCommandHandler.acceptTerminalCommand(msgId, content, requestId);
										this.handleFunctionCompletion(result.status, result.data);
									},
									onCancel: async (msgId: number) => {
										this.fireWidgetButtonAction(msgId, 'hide');
										const result = await this.terminalCommandHandler.cancelTerminalCommand(msgId, requestId);
										this.handleFunctionCompletion(result.status, result.data);
									},
									onAllowList: async (msgId: number, content: string) => {
									}
								}
							});
						} else if (data.field === 'search_replace') {
							
							this._onWidgetRequested.fire({
								messageId,
								requestId,
								functionCallType: 'search_replace',
								initialContent: '',
								filename: undefined,
								handlers: {
									onAccept: async (msgId: number, content: string) => {
										this.fireWidgetButtonAction(msgId, 'hide');
										const result = await this.searchReplaceCommandHandler.acceptSearchReplaceCommand(msgId, content, requestId);
										this.handleFunctionCompletion(result.status, result.data);
									},
									onCancel: async (msgId: number) => {
										this.fireWidgetButtonAction(msgId, 'hide');
										const result = await this.searchReplaceCommandHandler.cancelSearchReplaceCommand(msgId, requestId);
										this.handleFunctionCompletion(result.status, result.data);
									},
									onAllowList: async (msgId: number, content: string) => {
										this.fireWidgetButtonAction(msgId, 'hide');
									}
								}
							});
						} else if (data.field === 'delete_file') {
							
							this._onWidgetRequested.fire({
								messageId,
								requestId,
								functionCallType: 'delete_file',
								initialContent: '',
								filename: undefined,
								handlers: {
									onAccept: async (msgId: number, content: string) => {
										this.fireWidgetButtonAction(msgId, 'hide');
										const result = await this.deleteFileCommandHandler.acceptDeleteFileCommand(msgId, content, requestId);
										this.handleFunctionCompletion(result.status, result.data);
									},
									onCancel: async (msgId: number) => {
										this.fireWidgetButtonAction(msgId, 'hide');
										const result = await this.deleteFileCommandHandler.cancelDeleteFileCommand(msgId, requestId);
										this.handleFunctionCompletion(result.status, result.data);
									},
									onAllowList: async (msgId: number, content: string) => {
									}
								}
							});
						} else if (data.field === 'run_file') {
							// Extract filename from function call arguments for initial content
							let initialContent = '';
							let filename = '';
							try {
								const functionCall = data.functionCall;
								if (functionCall && functionCall.arguments) {
									const args = JSON.parse(functionCall.arguments);
									filename = args.filename || '';
									if (filename) {
										initialContent = await this.fileCommandHandler.extractFileContentForWidget(
											filename,
											args.start_line_one_indexed,
											args.end_line_one_indexed_inclusive
										);
									}
								}
							} catch (error) {
								this.logService.warn('Failed to extract file content for run_file widget:', error);
								initialContent = 'Error: Could not load file content';
							}
							
							this._onWidgetRequested.fire({
								messageId,
								requestId,
								functionCallType: 'run_file',
								initialContent,
								filename,
								startLine: data.functionCall?.arguments ? JSON.parse(data.functionCall.arguments || '{}').start_line_one_indexed : undefined,
								endLine: data.functionCall?.arguments ? JSON.parse(data.functionCall.arguments || '{}').end_line_one_indexed_inclusive : undefined,
								handlers: {
									onAccept: async (msgId: number, content: string) => {
										this.fireWidgetButtonAction(msgId, 'hide');
										const result = await this.fileCommandHandler.acceptFileCommand(msgId, content, requestId);
										this.handleFunctionCompletion(result.status, result.data);
									},
									onCancel: async (msgId: number) => {
										this.fireWidgetButtonAction(msgId, 'hide');
										const result = await this.fileCommandHandler.cancelFileCommand(msgId, requestId);
										this.handleFunctionCompletion(result.status, result.data);
									},
									onAllowList: async (msgId: number, content: string) => {
										this.fireWidgetButtonAction(msgId, 'hide');
									}
								}
							});
						}
					}
					
					const widget = streamingWidgets.get(data.call_id);
					if (widget && data.delta) {
						widget.accumulatedContent += data.delta;
						const isConsole = data.field === 'run_console_cmd';
						const isTerminal = data.field === 'run_terminal_cmd';
						const isSearchReplace = data.field === 'search_replace';
						
						let parsed: { content: string; isComplete: boolean };
						
						if (isSearchReplace) {
							parsed = this.searchReplaceCommandHandler.extractAndProcessSearchReplaceContent(widget.accumulatedContent, data.call_id);
						} else if (isTerminal) {
							parsed = this.terminalCommandHandler.extractAndProcessCommandContent(widget.accumulatedContent, false);
						} else {
							parsed = this.consoleCommandHandler.extractAndProcessCommandContent(widget.accumulatedContent, isConsole);
						}
						
						if (parsed.content.length > widget.streamedContent.length) {
							const newContent = parsed.content.substring(widget.streamedContent.length);
							
							if (newContent.length > 0) {
								
								let filename: string | undefined = undefined;
								if (isSearchReplace) {
									const filenameMatch = widget.accumulatedContent.match(/"file_path"\s*:\s*"([^"]*)"/);
									filename = filenameMatch ? filenameMatch[1] : undefined;
								}
								
								this._onWidgetStreamingUpdate.fire({
									messageId: widget.messageId,
									delta: newContent,
									isComplete: false,
									isSearchReplace: isSearchReplace,
									filename: filename,
									field: data.field,
									requestId: requestId
								});
								
								widget.streamedContent = parsed.content;
							}
						}
					}
				}
				
				if (data.type === 'function_complete' && data.field && data.call_id) {
					const widget = streamingWidgets.get(data.call_id);
					if (widget) {
						const functionResult = await this.functionMessageManager.createFunctionCallMessageWithCompleteArguments(data.field, data.call_id, widget.messageId, widget.accumulatedContent, requestId);
						
						if (functionResult?.status) {
							this.handleFunctionCompletion(functionResult.status, functionResult.data);
							return;
						}

						// If it's search_replace and validation succeeded, fire widget update with diff data
						if (data.field === 'search_replace') {
							await this.retrieveAndFireSearchReplaceDiffUpdate(widget.messageId);
						}
						
						if (data.field !== 'search_replace') {
							this._onWidgetStreamingUpdate.fire({
								messageId: widget.messageId,
								delta: '',
								isComplete: true
							});
						}
						
						streamingWidgets.delete(data.call_id);
						
						if (this.functionMessageManager.isSimpleFunction(data.field)) {
						}
					}
				}
					
				this._onStreamingData.fire(data);
			},
				(error: Error) => {
					this.logService.error('Streaming error:', error);
					
					this.hideThinkingMessage();
					
					this.handleFunctionCompletion('error', {
						error: error.message || 'Streaming error occurred'
					});
					
					
					const errorId = `error_${Date.now()}_${Math.floor(Math.random() * 9000) + 1000}`;
					this._onStreamingError.fire({
						errorId,
						message: error.message
					});
					
					if (hasStartedStreaming) {
						this.conversationManager.cancelStreamingMessage();
					}
					this.currentRequestId = undefined;
					this.currentRequestWasCancelled = false;
					this._onStreamingComplete.fire();
				},
				async () => {
					
					if (this.currentRequestWasCancelled) {
						return;
					}
					
					if (hasStartedStreaming && !hasFunctionCallsInResponse) {
						try {
							const messageId = this.conversationManager.completeStreamingMessage({
								related_to: userMessageId
							}, this.processThinkingTagsComplete.bind(this));
							
							const finalConversation = this.conversationManager.getCurrentConversation();
							const completedMessage = finalConversation?.messages.find((m: ConversationMessage) => m.id === messageId);
							if (completedMessage) {
								this._onMessageAdded.fire(completedMessage);
							}
							
							this.handleFunctionCompletion('done', {
								message: 'Pure text response completed successfully',
								related_to_id: userMessageId,
								request_id: requestId
							});
							
						} catch (error) {
							this.logService.error('Failed to complete streaming message:', error);
							
							this.handleFunctionCompletion('error', {
								error: error.message || 'Failed to complete streaming message'
							});
							
							const errorId = `error_${Date.now()}_${Math.floor(Math.random() * 9000) + 1000}`;
							this._onStreamingError.fire({
								errorId,
								message: error.message || 'Failed to complete streaming message'
							});
							
							throw error;
						}
					} else if (hasFunctionCallsInResponse) {
					} else {
						this.handleFunctionCompletion('done', {
							message: 'No streaming response completed',
							related_to_id: userMessageId,
							request_id: requestId
						});
					}
					
					this.currentRequestId = undefined;
					this.currentRequestWasCancelled = false;
					
					this.hideThinkingMessage();
					
					await this.processBufferedFunctionCallsAfterStreaming();
					
					this.messageIdManager.resetFirstFunctionCallTracking();
					
					// Trigger conversation naming check using the dedicated name service
					this.nameService.triggerConversationNameCheck();
					
					this._onStreamingComplete.fire();
				}
			);

		} catch (error) {
			this.logService.error('Failed to send message:', error);
			
			this.hideThinkingMessage();
			
			this.handleFunctionCompletion('error', {
				error: error.message || 'Pre-streaming error occurred'
			});
			
			const errorId = `error_${Date.now()}_${Math.floor(Math.random() * 9000) + 1000}`;
			this._onStreamingError.fire({
				errorId,
				message: error.message || 'Failed to send message'
			});
			
			this._onStreamingComplete.fire();
			
			this.currentRequestId = undefined;
		}
	}

	async cancelStreaming(): Promise<void> {
		this.logService.info('Cancelling streaming');
		
		this.hideThinkingMessage();
		
		if (this.currentRequestId) {
			try {
				await this.backendClient.cancelRequest(this.currentRequestId);
			} catch (error) {
				this.logService.error('Failed to send cancellation request to backend:', error);
			}
		}
		
		this.currentRequestWasCancelled = true;
		
		this.backendClient.cancelStreaming();
		
		this.conversationManager.cancelStreamingMessage();
		
		this.currentRequestId = undefined;
		
		this._onStreamingComplete.fire();
	}

	showThinkingMessage(message?: string): void {
		const thinkingText = message || 'Thinking...';
		this.isThinkingMessageActive = true;
		this.lastThinkingMessageTime = new Date();
		this._onThinkingMessage.fire({ message: thinkingText, hideCancel: false });
	}

	hideThinkingMessage(): void {
		if (this.isThinkingMessageActive) {
			this.isThinkingMessageActive = false;
			this.lastThinkingMessageTime = null;
			this._onThinkingMessage.fire({ message: '', hideCancel: true });
		}
	}

	fireOrchestratorStateChange(isProcessing: boolean): void {
		this._onOrchestratorStateChange.fire({ isProcessing });
	}

	fireWidgetButtonAction(messageId: number, action: string): void {
		this._onWidgetButtonAction.fire({ messageId, action });
	}

	private shouldAutoShowThinkingMessage(): boolean {
		if (this.isThinkingMessageActive) {
			return false;
		}
		
		if (!this.lastThinkingMessageTime) {
			return true;
		}
		
		const now = new Date();
		const timeDiff = (now.getTime() - this.lastThinkingMessageTime.getTime()) / 1000;
		return timeDiff > 2;
	}

	getCurrentConversation(): Conversation | null {
		return this.conversationManager.getCurrentConversation();
	}

	async revertToMessage(messageId: number): Promise<{ status: string; message?: string }> {
		const result = await this.messageReversion.revertToMessage(messageId);
		
		// Fire event to update UI like the backup version did
		if (result.status === 'success') {
			const conversation = this.conversationManager.getCurrentConversation();
			if (conversation) {
				this._onConversationLoaded.fire(conversation);
			}
		}
		
		return result;
	}

	async listConversations(): Promise<ConversationInfo[]> {
		this.logService.info('Listing conversations');
		return await this.conversationManager.listConversations();
	}

	async deleteConversation(id: number): Promise<boolean> {
		this.logService.info('Deleting conversation:', id);
		return await this.conversationManager.deleteConversation(id);
	}

	async deleteAllConversations(): Promise<boolean> {
		this.logService.info('Deleting all conversations');
		return await this.conversationManager.deleteAllConversations();
	}

	async renameConversation(id: number, name: string): Promise<boolean> {
		this.logService.info('Renaming conversation:', id, 'to:', name);
		return await this.conversationManager.renameConversation(id, name);
	}

	async isConversationBlank(id: number): Promise<boolean> {
		return await this.conversationManager.isConversationBlank(id);
	}

	async findHighestBlankConversation(): Promise<number | null> {
		return await this.conversationManager.findHighestBlankConversation();
	}

	async checkBackendHealth(): Promise<boolean> {
		this.logService.info('Checking backend health');
		
		try {
			const health = await this.backendClient.checkHealth();
			return health.status === 'UP';
		} catch (error) {
			this.logService.error('Backend health check failed:', error);
			return false;
		}
	}

	async getBackendEnvironment(): Promise<string> {
		try {
			return await this.backendClient.getEnvironmentName();
		} catch (error) {
			this.logService.error('Failed to get backend environment:', error);
			return 'Unknown';
		}
	}

	private getAIProvider(): string {
		const model = this.getAIModel();
		if (model === 'claude-sonnet-4-20250514') {
			return 'anthropic';
		} else if (model === 'gpt-5-mini') {
			return 'openai';
		}
		return 'anthropic'; 
	}

	private getAIModel(): string {
		return this.configurationService.getValue<string>('erdosAi.selectedModel') || 'claude-sonnet-4-20250514';
	}

	private getTemperatureSync(): number {
		return this.configurationService.getValue<number>('erdosAi.temperature') || 0.7;
	}

	generateRequestId(): string {
		const timestamp = Date.now();
		const random = Math.floor(Math.random() * 1000);
		return `req_${timestamp}_${random}`;
	}

	getCurrentRequestId(): string | undefined {
		return this.currentRequestId;
	}
	
	async retrieveAndFireSearchReplaceDiffUpdate(messageId: number): Promise<void> {
		try {
			// Set conversation manager for diff storage access
			diffStore.setConversationManager(this.conversationManager);
			
			// Retrieve stored diff entry
			const storedDiffEntry = diffStore.getStoredDiffEntry(messageId.toString());
			if (!storedDiffEntry) {
				return;
			}
			
			// Count added/deleted lines
			let added = 0, deleted = 0;
			for (const diffItem of storedDiffEntry.diff_data) {
				if (diffItem.type === 'added') added++;
				else if (diffItem.type === 'deleted') deleted++;
			}
			
			// Data is already filtered when stored, use as-is (like Rao's pattern after storage)
			const filteredDiff = storedDiffEntry.diff_data;
			
			// Get clean filename
			const cleanFilename = this.commonUtils.getBasename(storedDiffEntry.file_path || 'unknown');
			
			// Reconstruct content from filtered diff for widget display (like Rao's filtered_content)
			let filteredContent = '';
			for (const diffItem of filteredDiff) {
				if (diffItem.type !== 'deleted' && diffItem.content) {
					filteredContent += diffItem.content + '\n';
				}
			}
			// Remove trailing newline
			filteredContent = filteredContent.replace(/\n$/, '');
			
			// Fire widget update with diff data for UI highlighting
			this._onWidgetStreamingUpdate.fire({
				messageId: messageId,
				delta: filteredContent, // Use filtered content like Rao
				isComplete: true,
				diffData: {
					diff: filteredDiff,
					added: added,
					deleted: deleted,
					clean_filename: cleanFilename
				},
				filename: cleanFilename,
				replaceContent: true // Replace with filtered content
			});
			
		} catch (error) {
			console.error('[DIFF_SERVICE] Failed to retrieve and fire search_replace diff update:', error);
		}
	}

	async acceptFileCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}> {
		this.fireWidgetButtonAction(messageId, 'hide');
		return await this.fileCommandHandler.acceptFileCommand(messageId, command, requestId);
	}

	async acceptConsoleCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}> {
		this.fireWidgetButtonAction(messageId, 'hide');
		return await this.consoleCommandHandler.acceptConsoleCommand(messageId, command, requestId);
	}

	async acceptTerminalCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}> {
		this.fireWidgetButtonAction(messageId, 'hide');
		return await this.terminalCommandHandler.acceptTerminalCommand(messageId, command, requestId);
	}

	async acceptSearchReplaceCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}> {
		this.fireWidgetButtonAction(messageId, 'hide');
		return await this.searchReplaceCommandHandler.acceptSearchReplaceCommand(messageId, command, requestId);
	}

	async acceptDeleteFileCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}> {
		this.fireWidgetButtonAction(messageId, 'hide');
		return await this.deleteFileCommandHandler.acceptDeleteFileCommand(messageId, command, requestId);
	}

	async cancelConsoleCommand(messageId: number, requestId: string): Promise<{status: string, data: any}> {
		this.fireWidgetButtonAction(messageId, 'hide');
		return await this.consoleCommandHandler.cancelConsoleCommand(messageId, requestId);
	}

	async cancelTerminalCommand(messageId: number, requestId: string): Promise<{status: string, data: any}> {
		this.fireWidgetButtonAction(messageId, 'hide');
		return await this.terminalCommandHandler.cancelTerminalCommand(messageId, requestId);
	}

	async cancelSearchReplaceCommand(messageId: number, requestId: string): Promise<{status: string, data: any}> {
		this.fireWidgetButtonAction(messageId, 'hide');
		return await this.searchReplaceCommandHandler.cancelSearchReplaceCommand(messageId, requestId);
	}

	async cancelDeleteFileCommand(messageId: number, requestId: string): Promise<{status: string, data: any}> {
		this.fireWidgetButtonAction(messageId, 'hide');
		return await this.deleteFileCommandHandler.cancelDeleteFileCommand(messageId, requestId);
	}

	async cancelFileCommand(messageId: number, requestId: string): Promise<{status: string, data: any}> {
		this.fireWidgetButtonAction(messageId, 'hide');
		return await this.fileCommandHandler.cancelFileCommand(messageId, requestId);
	}

	private async processBufferedFunctionCallsAfterStreaming(): Promise<void> {
		await this.functionCallBuffer.processBufferedFunctionCalls(async (functionCallData) => {
			const functionResult = await this.functionMessageManager.createFunctionCallMessageWithCompleteArguments(
				functionCallData.function_call.name,
				functionCallData.function_call.call_id,
				typeof functionCallData.message_id === 'number' ? functionCallData.message_id : parseInt(functionCallData.message_id),
				functionCallData.function_call.arguments,
				functionCallData.request_id
			);

			// Pass status to orchestrator like the original does
			if (functionResult && functionResult.status) {
				this.handleFunctionCompletion(functionResult.status, functionResult.data);
			}

			return functionResult;
		});
	}

	/**
	 * Process individual function call
	 */
	private async processIndividualFunctionCall(functionCall: any, relatedToId: number, requestId: string, messageId: number): Promise<{status: string, data?: any} | null> {
		try {
			// Check if this is a widget function that should bypass the function handler
			const isWidgetFunction = (name: string) => {
				return ['run_console_cmd', 'run_terminal_cmd', 'search_replace', 'delete_file', 'run_file'].includes(name);
			};

			if (isWidgetFunction(functionCall.name)) {
				// Widget functions should create widgets immediately without going through function handler
				this.logService.info(`[WIDGET FUNCTION] Creating widget for ${functionCall.name} without function handler`);
				
				// Extract arguments for widget creation
				const args = JSON.parse(functionCall.arguments || '{}');
				
				// Get initial content for run_file widgets
				let widgetInitialContent = '';
				if (functionCall.name === 'run_file') {
					// Extract the file content for display in the widget
					widgetInitialContent = await this.fileCommandHandler.extractFileContentForWidget(
						args.filename, 
						args.start_line_one_indexed, 
						args.end_line_one_indexed_inclusive
					);
				}

				const widgetInfo = {
					messageId,
					requestId,
					functionCallType: functionCall.name as 'search_replace' | 'run_console_cmd' | 'run_terminal_cmd' | 'delete_file' | 'run_file',
					initialContent: widgetInitialContent,
					filename: args.filename || args.file_path || undefined,
					autoAccept: false, // TODO: Implement auto-accept logic
					startLine: args.start_line_one_indexed,
					endLine: args.end_line_one_indexed_inclusive,
					handlers: {
						onAccept: async (msgId: number, content: string) => {
							this.fireWidgetButtonAction(msgId, 'hide');
							if (functionCall.name === 'search_replace') {
								const result = await this.searchReplaceCommandHandler.acceptSearchReplaceCommand(msgId, content, requestId);
								this.handleFunctionCompletion(result.status, result.data);
							} else if (functionCall.name === 'run_console_cmd') {
								const result = await this.consoleCommandHandler.acceptConsoleCommand(msgId, content, requestId);
								this.handleFunctionCompletion(result.status, result.data);
							} else if (functionCall.name === 'run_terminal_cmd') {
								const result = await this.terminalCommandHandler.acceptTerminalCommand(msgId, content, requestId);
								this.handleFunctionCompletion(result.status, result.data);
							} else if (functionCall.name === 'delete_file') {
								const result = await this.deleteFileCommandHandler.acceptDeleteFileCommand(msgId, content, requestId);
								this.handleFunctionCompletion(result.status, result.data);
							} else if (functionCall.name === 'run_file') {
								const result = await this.fileCommandHandler.acceptFileCommand(msgId, content, requestId);
								this.handleFunctionCompletion(result.status, result.data);
							}
						},
						onCancel: async (msgId: number) => {
							this.fireWidgetButtonAction(msgId, 'hide');
							if (functionCall.name === 'search_replace') {
								const result = await this.searchReplaceCommandHandler.cancelSearchReplaceCommand(msgId, requestId);
								this.handleFunctionCompletion(result.status, result.data);
							} else if (functionCall.name === 'run_console_cmd') {
								const result = await this.consoleCommandHandler.cancelConsoleCommand(msgId, requestId);
								this.handleFunctionCompletion(result.status, result.data);
							} else if (functionCall.name === 'run_terminal_cmd') {
								const result = await this.terminalCommandHandler.cancelTerminalCommand(msgId, requestId);
								this.handleFunctionCompletion(result.status, result.data);
							} else if (functionCall.name === 'delete_file') {
								const result = await this.deleteFileCommandHandler.cancelDeleteFileCommand(msgId, requestId);
								this.handleFunctionCompletion(result.status, result.data);
							} else if (functionCall.name === 'run_file') {
								const result = await this.fileCommandHandler.cancelFileCommand(msgId, requestId);
								this.handleFunctionCompletion(result.status, result.data);
							}
						},
						onAllowList: async (msgId: number, content: string) => {
							// Allow list functionality if needed
						}
					}
				};
				
				this._onWidgetRequested.fire(widgetInfo);
				
				// Fire the actual function call message to trigger React re-render
				const conversation = this.conversationManager.getCurrentConversation();
				if (conversation) {
					const actualMessage = conversation.messages.find((m: ConversationMessage) => m.id === messageId);
					if (actualMessage) {
						this._onMessageAdded.fire(actualMessage);
					}
				}
				
				return {
					status: 'pending',
					data: {
						message: `Function ${functionCall.name} waiting for user confirmation`,
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			}

			// For non-widget functions, use the function call orchestrator
			this.logService.info(`[NON-WIDGET FUNCTION] Processing ${functionCall.name} via function call orchestrator`);
			
			// Create CallContext for the function call orchestrator
			const callContext = this.infrastructureRegistry.createCallContext(relatedToId, requestId, this.conversationManager);
			
			// Process the function call through the orchestrator
			try {
				const result = await this.functionCallService.processFunctionCall({
					name: functionCall.name,
					arguments: functionCall.arguments,
					call_id: functionCall.call_id,
					msg_id: messageId
				}, callContext);
				
				if (result.type === 'success' && result.function_call_output) {
					// Add the function call output to the conversation
					await this.conversationManager.addFunctionCallOutput(result.function_call_output);
					
					// For simple functions like read_file, save function call and generate display message
					if (this.functionMessageManager.isSimpleFunction(functionCall.name)) {
						// Save function call to conversation log
						await this.functionMessageManager.saveFunctionCallToConversationLog(functionCall, messageId, relatedToId);
						const displayMessage = this.functionMessageManager.generateFunctionCallDisplayMessage(functionCall);
						if (displayMessage) {
							this._onFunctionCallDisplayMessage.fire({
								id: messageId,
								content: displayMessage,
								timestamp: new Date().toISOString()
							});
						}
					}
					
					return {
						status: 'continue_and_display',
						data: {
							message: `Function ${functionCall.name} completed successfully`,
							related_to_id: relatedToId,
							request_id: requestId
						}
					};
				} else if (result.type === 'error') {
					this.logService.error(`Function ${functionCall.name} failed:`, result.error_message);
					return {
						status: 'error',
						data: {
							message: result.error_message || `Function ${functionCall.name} failed`,
							related_to_id: relatedToId,
							request_id: requestId
						}
					};
				}
			} catch (error) {
				this.logService.error(`Failed to process function ${functionCall.name}:`, error);
				return {
					status: 'error',
					data: {
						message: `Failed to process function ${functionCall.name}: ${error instanceof Error ? error.message : String(error)}`,
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			}

			return {
				status: 'pending',
				data: {
					message: `Function ${functionCall.name} processed`,
					related_to_id: relatedToId,
					request_id: requestId
				}
			};

		} catch (error) {
			this.logService.error('Failed to process individual function call:', error);
			return {
				status: 'error',
				data: {
					error: error instanceof Error ? error.message : 'Unknown error',
					related_to_id: relatedToId,
					request_id: requestId
				}
			};
		}
	}

	async showConversationHistory(): Promise<void> {
		this._onShowConversationHistory.fire();
	}

	async showSettings(): Promise<void> {
		this._onShowSettings.fire();
	}

	async extractFileContentForWidget(filename: string, startLine?: number, endLine?: number): Promise<string> {
		return await this.fileCommandHandler.extractFileContentForWidget(filename, startLine, endLine);
	}

	async getHelpAsMarkdown(topic: string, packageName?: string, language?: 'R' | 'Python'): Promise<string> {
		// For now, return empty string - this would need to be implemented if help functionality is needed
		return '';
	}

	// Model Settings Implementation (from tmp_backup)
	async getAvailableModels(): Promise<string[]> {
		return await this.backendClient.getAvailableModels();
	}

	async getSelectedModel(): Promise<string> {
		return this.configurationService.getValue<string>('erdosAi.selectedModel') || 'claude-sonnet-4-20250514';
	}

	async setSelectedModel(model: string): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.selectedModel', model);
			return true;
		} catch (error) {
			this.logService.error('Failed to set selected model:', error);
			return false;
		}
	}

	async getTemperature(): Promise<number> {
		return this.configurationService.getValue<number>('erdosAi.temperature') || 0.5;
	}

	async setTemperature(temperature: number): Promise<boolean> {
		try {
			if (temperature < 0 || temperature > 1) {
				throw new Error('Temperature must be between 0 and 1');
			}
			await this.configurationService.updateValue('erdosAi.temperature', temperature);
			return true;
		} catch (error) {
			this.logService.error('Failed to set temperature:', error);
			return false;
		}
	}

	async getSecurityMode(): Promise<'secure' | 'improve'> {
		return this.configurationService.getValue<'secure' | 'improve'>('erdosAi.securityMode') || 'improve';
	}

	async setSecurityMode(mode: 'secure' | 'improve'): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.securityMode', mode);
			return true;
		} catch (error) {
			this.logService.error('Failed to set security mode:', error);
			return false;
		}
	}

	async getWebSearchEnabled(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.webSearchEnabled') || false;
	}

	async setWebSearchEnabled(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.webSearchEnabled', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set web search enabled:', error);
			return false;
		}
	}

	// Orchestrator methods moved inline to eliminate circular dependency
	
	public startAiSearch(query: string, requestId: string): void {
		this.orchestratorIsProcessing = true;
		this.orchestratorCurrentRequestId = requestId;

		this.fireOrchestratorStateChange(true);

		this.initializeConversation(query, requestId);
	}

	public continueConversation(relatedToId: number, requestId: string): void {
		if (!relatedToId) {
			return;
		}

		this.orchestratorIsProcessing = true;
		this.orchestratorCurrentRequestId = requestId;

		this.fireOrchestratorStateChange(true);

		this.makeContinueApiCall(relatedToId, requestId);
	}

	public handleFunctionCompletion(status: string, data: any): void {
		switch (status) {
			case ErdosAiServiceCore.AI_STATUS_DONE:
				this.handleSearchCompletion(data);
				this.finishProcessing();
				break;

			case ErdosAiServiceCore.AI_STATUS_CONTINUE_SILENT:
				const relatedToId = data?.related_to_id;
				const requestId = data?.request_id || this.orchestratorCurrentRequestId;

				if (!relatedToId) {
					break;
				}

				this.continueConversation(relatedToId, requestId);
				break;

			case ErdosAiServiceCore.AI_STATUS_CONTINUE_AND_DISPLAY:
				this.handleContinueAndDisplay(data);
				break;

			case ErdosAiServiceCore.AI_STATUS_PENDING:
				this.setPendingState();
				break;

			case ErdosAiServiceCore.AI_STATUS_ERROR:
				this.handleError(data?.error || 'Function completion failed');
				break;

			default:
				break;
		}
	}

	public cancel(): void {
		if (this.orchestratorIsProcessing) {
			this.finishProcessing();
		}
	}

	private async initializeConversation(query: string, requestId: string): Promise<void> {
		try {
			const userMessageId = this.conversationManager.addUserMessage(query, {
				original_query: true
			});

			const userMessage = this.conversationManager.getMessages().find((m: any) => m.id === userMessageId)!;
			this._onMessageAdded.fire(userMessage);

			const conversationLog = this.conversationManager.getMessages();
			const shouldTrigger = this.conversationSummarization.shouldTriggerSummarization(conversationLog);
			
			if (shouldTrigger) {
				const currentQueryCount = this.conversationSummarization.countOriginalQueries(conversationLog);
				const conversation = this.conversationManager.getCurrentConversation();
				if (conversation) {
					const conversationPaths = this.conversationManager.getConversationPaths(conversation.info.id);
					const highestSummarized = await this.conversationSummarization.getHighestSummarizedQuery(conversationPaths);
					
					const targetQuery = currentQueryCount - 1;

					if (targetQuery > highestSummarized && targetQuery >= 1) {
						await this.conversationSummarization.saveBackgroundSummarizationState(conversationPaths, requestId, targetQuery, '');
					}
				}
			}

			await this.executeStreamingForOrchestrator(query, userMessageId, requestId);

		} catch (error) {
			this.logService.error('Failed to initialize conversation:', error);
		}
	}

	private async makeContinueApiCall(relatedToId: number, requestId: string): Promise<void> {
		try {
			await this.executeStreamingForOrchestrator('', relatedToId, requestId);
		} catch (error) {
			this.logService.error('Failed to make continue API call:', error);
		}
	}

	private handleSearchCompletion(data: any): void {
		this.logService?.info('AI search completed successfully', data);
	}

	private handleContinueAndDisplay(data: any): void {
		const relatedToId = data?.related_to_id;
		const requestId = data?.request_id || this.orchestratorCurrentRequestId;

		if (relatedToId) {
			this.continueConversation(relatedToId, requestId);
		} else {
			this.logService?.error('Cannot continue conversation - missing related_to_id in data:', data);
		}
	}

	private handleError(error: string): void {
		this.finishProcessing();
	}

	private setPendingState(): void {
		this.orchestratorIsProcessing = false;
		
		this.fireOrchestratorStateChange(false);
	}

	private finishProcessing(): void {
		this.orchestratorIsProcessing = false;
		this.orchestratorCurrentRequestId = null;
		
		this.fireOrchestratorStateChange(false);
		
		// Clear images if available
		const contextService = this.contextService as any;
		if (contextService?.getImageAttachmentService) {
			const imageService = contextService.getImageAttachmentService();
			if (imageService) {
				imageService.clearAllImages().catch((error: any) => {
					this.logService.warn('Failed to clear images:', error);
				});
			}
		}
	}


}
