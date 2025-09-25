/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILogService } from '../../../../platform/log/common/log.js';
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
import { IContextService } from '../../erdosAiContext/common/contextService.js';
import { IConversationVariableManager } from '../../erdosAiConversation/common/conversationVariableManager.js';
import { IMessageReversion } from '../common/messageReversion.js';
import { IErdosAiServiceCore } from '../common/erdosAiServiceCore.js';
import { IErdosAiNameService } from '../common/erdosAiNameService.js';
import { IThinkingProcessor } from '../common/thinkingProcessor.js';
import { IErdosAiSettingsService } from '../../erdosAiSettings/common/settingsService.js';
import { IStreamingOrchestrator } from '../common/streamingOrchestrator.js';
import { IParallelFunctionBranchManager } from './parallelFunctionBranchManager.js';
import { IFileContentService } from '../../erdosAiUtils/common/fileContentService.js';
import { ISearchService } from '../../../services/search/common/search.js';
import { IInfrastructureRegistry } from '../../erdosAiFunctions/common/infrastructureRegistry.js';
import { ISearchReplaceCommandHandler } from '../../erdosAiCommands/common/searchReplaceCommandHandler.js';
import { IConsoleCommandHandler } from '../../erdosAiCommands/common/consoleCommandHandler.js';
import { ITerminalCommandHandler } from '../../erdosAiCommands/common/terminalCommandHandler.js';
import { IDeleteFileCommandHandler } from '../../erdosAiCommands/common/deleteFileCommandHandler.js';
import { IFileCommandHandler } from '../../erdosAiCommands/common/fileCommandHandler.js';
import { IAutoAcceptHandler } from '../../erdosAiCommands/common/autoAcceptHandler.js';
import { mapStreamDataToEvent } from './streamEventMapper.js';


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

	private readonly _onFunctionCallDisplayMessage = this._register(new Emitter<{ id: number; function_call: any; timestamp: string }>());
	readonly onFunctionCallDisplayMessage: Event<{ id: number; function_call: any; timestamp: string }> = this._onFunctionCallDisplayMessage.event;

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
			diff_data: any[];
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
		diffData?: {
			diff_data: any[];
			added: number;
			deleted: number;
			clean_filename?: string;
		};
	}> = this._onWidgetStreamingUpdate.event;

	private readonly _onWidgetButtonAction = this._register(new Emitter<{ messageId: number; action: string }>());
	readonly onWidgetButtonAction: Event<{ messageId: number; action: string }> = this._onWidgetButtonAction.event;

	private readonly _onWidgetContentUpdated = this._register(new Emitter<{ messageId: number; content: string; functionType: string }>());
	readonly onWidgetContentUpdated: Event<{ messageId: number; content: string; functionType: string }> = this._onWidgetContentUpdated.event;

	private readonly _onShowConversationHistory = this._register(new Emitter<void>());
	readonly onShowConversationHistory: Event<void> = this._onShowConversationHistory.event;

	private readonly _onShowSettings = this._register(new Emitter<void>());
	readonly onShowSettings: Event<void> = this._onShowSettings.event;
	private currentRequestId: string | undefined;
	private currentRequestWasCancelled = false;
	
	private lastThinkingMessageTime: Date | null = null;
	private isThinkingMessageActive = false;
	
	private pendingWidgetDecisions: Array<{
		functionType: string;
		messageId: number;
		decision: 'accept' | 'cancel';
		content?: string;
		requestId?: string;
	}> = [];
	
	// State machine for persistent processing loop
	private isProcessingLoopActive = false;
	private processingSignal: Promise<void> | null = null;
	private signalResolve: (() => void) | null = null;
	
	constructor(
		@ILogService private readonly logService: ILogService,
		@IConversationManager private readonly conversationManager: IConversationManager,
		@IMessageIdManager private readonly messageIdManager: IMessageIdManager,
		@IBackendClient private readonly backendClient: IBackendClient,
		@IConversationSummarization private readonly conversationSummarization: IConversationSummarization,
		@IFileChangeTracker private readonly fileChangeTracker: IFileChangeTracker,
		@IContextService private readonly contextService: IContextService,
		@IConversationVariableManager private readonly conversationVariableManager: IConversationVariableManager,
		@IMessageReversion private readonly messageReversion: IMessageReversion,
		@ICommonUtils private readonly commonUtils: ICommonUtils,
		@IErdosAiNameService private readonly nameService: IErdosAiNameService,
		@IThinkingProcessor private readonly thinkingProcessor: IThinkingProcessor,
		@IErdosAiSettingsService private readonly settingsService: IErdosAiSettingsService,
		@IStreamingOrchestrator private readonly streamingOrchestrator: IStreamingOrchestrator,
		@IParallelFunctionBranchManager private readonly branchManager: IParallelFunctionBranchManager,
		@IFileContentService private readonly fileContentService: IFileContentService,
		@ISearchService private readonly searchService: ISearchService,
		@IInfrastructureRegistry private readonly infrastructureRegistry: IInfrastructureRegistry,
		@ISearchReplaceCommandHandler private readonly searchReplaceCommandHandler: ISearchReplaceCommandHandler,
		@IConsoleCommandHandler private readonly consoleCommandHandler: IConsoleCommandHandler,
		@ITerminalCommandHandler private readonly terminalCommandHandler: ITerminalCommandHandler,
		@IDeleteFileCommandHandler private readonly deleteFileCommandHandler: IDeleteFileCommandHandler,
		@IFileCommandHandler private readonly fileCommandHandler: IFileCommandHandler,
		@IAutoAcceptHandler private readonly autoAcceptHandler: IAutoAcceptHandler,
	) {
		super();
		
		// Set up the auto-accept handler with widget decision setter to avoid circular dependency
		this.autoAcceptHandler.setWidgetDecisionSetter({
			setWidgetDecision: (functionType, messageId, decision, content, requestId) => {
				this.setWidgetDecision(functionType, messageId, decision, content, requestId);
			}
		});
		
		
		// Set up the message ID generator for the conversation manager
		this.conversationManager.setMessageIdGenerator(() => this.getNextMessageId());
		
		// Set up the message ID generator for the message ID manager
		this.messageIdManager.setMessageIdGenerator(() => this.getNextMessageId());
		
		// Set up the reset callback for the message ID manager
		this.messageIdManager.setResetCounterCallback((maxId: number) => this.resetMessageIdCounter(maxId));
		
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

		// Wire up streaming orchestrator events
		this._register(this.streamingOrchestrator.onStreamingData((data) => {
			this._onStreamingData.fire(data);
		}));

		this._register(this.streamingOrchestrator.onMessageAdded((message) => {
			this._onMessageAdded.fire(message);
		}));

		// CRITICAL FIX: Wire up conversation manager's onMessageAdded events
		// This is needed for updateConversationDisplay() to reach React
		this._register(this.conversationManager.onMessageAdded((message: ConversationMessage) => {
			this._onMessageAdded.fire(message);
		}));

		this._register(this.streamingOrchestrator.onFunctionCallDisplayMessage((event) => {
			this._onFunctionCallDisplayMessage.fire(event);
		}));

		this._register(this.streamingOrchestrator.onStreamingWidgetRequested((request) => {
			this._onWidgetRequested.fire(request);
		}));

		this._register(this.streamingOrchestrator.onWidgetStreamingUpdate((update) => {
			this._onWidgetStreamingUpdate.fire(update);
		}));

		this._register(this.streamingOrchestrator.onWidgetButtonAction((action) => {
			this._onWidgetButtonAction.fire(action);
		}));

		this._register(this.streamingOrchestrator.onWidgetContentUpdated((update) => {
			this._onWidgetContentUpdated.fire(update);
		}));

		this._register(this.streamingOrchestrator.onThinkingMessageHide(() => {
			this.hideThinkingMessage();
		}));

		this._register(this.streamingOrchestrator.onOrchestratorStateChange((state) => {
			this._onOrchestratorStateChange.fire(state);
		}));

		// CRITICAL: Listen for batch completion to signal state machine continuation
		this._register(this.streamingOrchestrator.onBatchCompleted((event: {batchId: string; status: string}) => {			
			// Signal processing continuation when batch completes with continue_silent or done
			if (event.status === 'continue_silent' || event.status === 'done') {
				this.signalProcessingContinuation(this.currentRequestId);
			}
		}));

		// Listen for branch status changes to trigger auto-accept immediately
		this._register(this.branchManager.onBranchStatusChanged((branch) => {
			// Only trigger auto-accept for interactive functions that are waiting for user decision
			if (branch.status === 'waiting_user' && branch.requestId === this.currentRequestId) {
				// Use existing auto-accept logic - it already handles all function types correctly
				this.autoAcceptHandler.checkAndHandleAutoAccept(branch).then(wasHandled => {
					if (wasHandled) {
						this.signalProcessingContinuation(this.currentRequestId);
					}
				});
			}
		}));
	}
	
	/**
	 * This is the ONLY method that should allocate message IDs anywhere in the system
	 */
	public getNextMessageId(): number {
		this.messageIdCounter += 1;
		return this.messageIdCounter;
	}
	
	/**
	 * Reset the message ID counter to continue from a specific value
	 * Used when switching conversations to continue from the highest existing ID
	 */
	public resetMessageIdCounter(maxExistingId: number): void {
		this.messageIdCounter = maxExistingId;
	}
	
	private async initializeBackendEnvironment(): Promise<void> {
		try {
			await this.backendClient.detectEnvironment();
			// Environment detection completed silently
		} catch (error) {
			this.logService.warn('Failed to detect backend environment, using production:', error);
		}
	}

	async newConversation(name?: string): Promise<Conversation> {
		this.hideThinkingMessage();
		
		// Cancel any active processing loop from the previous conversation
		this.isProcessingLoopActive = false;
		this.currentRequestWasCancelled = true;
		this.signalResolve = null;
		this.processingSignal = null;
		this.currentRequestId = undefined;
		
		try {
			const highestBlankId = await this.conversationManager.findHighestBlankConversation();
			
			if (highestBlankId !== null) {
				const existingConversation = await this.conversationManager.loadConversation(highestBlankId);
				
				if (existingConversation) {
					if (name) {
						await this.conversationManager.renameConversation(highestBlankId, name);
						existingConversation.info.name = name;
					}
					
					this.messageIdManager.clearPreallocationStateForConversationSwitch();
					
					this.branchManager.cancelAllBranches(this.currentRequestId || '');
					
					this.fileChangeTracker.clearAllFileHighlighting();
					
					await this.conversationManager.switchToConversation(highestBlankId);
					
					await this.conversationVariableManager.loadConversationVariables(highestBlankId);
					
					diffStore.setConversationManager(this.conversationManager);
					await diffStore.loadDiffsFromFile();
					
					this._onConversationLoaded.fire(existingConversation);
					
					return existingConversation;
				}
			}
			
			const conversation = await this.conversationManager.createNewConversation(name);
			
			// Reset message ID counter to 0 for new conversations (first message will be ID 1)
			this.messageIdManager.resetMessageIdCounterForConversation(conversation);
			
			this.messageIdManager.clearPreallocationStateForConversationSwitch();
			
			this.streamingOrchestrator.clearFunctionQueue();
			
			await this.fileChangeTracker.initializeFileChangeTracking(conversation.info.id);
			
			this._onConversationCreated.fire(conversation);
			
			this._onConversationLoaded.fire(conversation);
			
			return conversation;
		} catch (error) {
			this.logService.error('Failed to create new conversation:', error);
			throw error;
		}
	}

	async loadConversation(id: number): Promise<Conversation | null> {
		this.hideThinkingMessage();
		
		// Cancel any active processing loop from the previous conversation
		this.isProcessingLoopActive = false;
		this.currentRequestWasCancelled = true;
		this.signalResolve = null;
		this.processingSignal = null;
		this.currentRequestId = undefined;
		
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
					
					this.branchManager.cancelAllBranches(this.currentRequestId || '');
					
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
		this.thinkingProcessor.resetThinkingBuffer();
		if (!message.trim()) {
			throw new Error('Message cannot be empty');
		}

		const conversation = this.conversationManager.getCurrentConversation();
		if (!conversation) {
			throw new Error('No active conversation');
		}

		// Clear branches and state like when creating a new conversation
		
		// CRITICAL: Stop any active processing loop first
		if (this.isProcessingLoopActive) {
			this.isProcessingLoopActive = false;
			this.currentRequestWasCancelled = true;
			this.signalResolve = null;
			this.processingSignal = null;
			this.pendingWidgetDecisions = [];
		}
		
		this.messageIdManager.clearPreallocationStateForConversationSwitch();
		this.branchManager.cancelAllBranches(this.currentRequestId || '');
		this.streamingOrchestrator.clearFunctionQueue();
		this.fileChangeTracker.clearAllFileHighlighting();

		const requestId = this.generateRequestId();
		
		// Initialize conversation with new orchestrator-based approach
		await this.initializeConversationWithOrchestrator(message, requestId);
	}

	getDiffDataForMessage(messageId: string): any {
		try {
			diffStore.setConversationManager(this.conversationManager);
			const storedDiff = diffStore.getDiffData(messageId);
			return storedDiff;
		} catch (error) {
			this.logService.error(`Failed to get diff data for message ${messageId}:`, error);
			return null;
		}
	}

	async executeStreamingForOrchestrator(message: string, userMessageId: number, requestId: string): Promise<void> {
		try {
			this.currentRequestId = requestId;
			this.currentRequestWasCancelled = false;

			// Clear any existing signal state to prevent cross-conversation contamination
			this.signalResolve = null;
			this.processingSignal = null;

			// Set up orchestrator context
			this.streamingOrchestrator.setCurrentUserMessageId(userMessageId);
			this.streamingOrchestrator.setCurrentRequestId(requestId);

			if (this.shouldAutoShowThinkingMessage()) {
				this.showThinkingMessage();
			}

			// Start the main processing loop that will handle all API calls and continuations
			await this.processAllWork(true); // Pass true for initial API call

		} catch (error) {
			this.hideThinkingMessage();
			
			const errorId = `error_${Date.now()}_${Math.floor(Math.random() * 9000) + 1000}`;
			
			this._onStreamingError.fire({
				errorId,
				message: error instanceof Error ? error.message : String(error)
			});
			
			this._onStreamingComplete.fire();
			
			this.currentRequestId = undefined;
			throw error;
		}
	}

	async cancelStreaming(): Promise<void> {
		this.hideThinkingMessage();
		
		// Set cancellation flag to prevent further processing
		this.currentRequestWasCancelled = true;
		// Cancel the streaming orchestrator
		this.streamingOrchestrator.cancel();
		
		if (this.currentRequestId) {
			try {
				// Check if BYOK is enabled - if so, skip backend cancellation request
				const anthropicBYOKEnabled = await this.settingsService.getBYOKAnthropicEnabled();
				const openAiBYOKEnabled = await this.settingsService.getBYOKOpenAiEnabled();
				const isBYOKEnabled = anthropicBYOKEnabled || openAiBYOKEnabled;
				
				// Only send cancellation request to remote backend when not using BYOK
				if (!isBYOKEnabled) {
					await this.backendClient.cancelRequest(this.currentRequestId);
				}
			} catch (error) {
				this.logService.error('[ERDOS CANCEL] Failed to send cancellation request to backend:', error);
			}
		}
		
		this.backendClient.cancelStreaming();
		
		this.conversationManager.cancelStreamingMessage();
		
		// Clear signal state when cancelling to prevent stale signals
		this.signalResolve = null;
		this.processingSignal = null;
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

	isWidgetStreamingComplete(messageId: number): boolean {
		return this.streamingOrchestrator.isWidgetStreamingComplete(messageId);
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

	getConversationDirectory(conversationId: number): string | null {
		const conversationPaths = this.conversationManager.getConversationPaths(conversationId);
		return conversationPaths?.conversationDir || null;
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
		return await this.conversationManager.listConversations();
	}

	async deleteConversation(id: number): Promise<boolean> {
		return await this.conversationManager.deleteConversation(id);
	}

	async deleteAllConversations(): Promise<boolean> {
		return await this.conversationManager.deleteAllConversations();
	}

	async renameConversation(id: number, name: string): Promise<boolean> {
		return await this.conversationManager.renameConversation(id, name);
	}

	async isConversationBlank(id: number): Promise<boolean> {
		return await this.conversationManager.isConversationBlank(id);
	}

	async findHighestBlankConversation(): Promise<number | null> {
		return await this.conversationManager.findHighestBlankConversation();
	}

	async updateMessageContent(messageId: number, content: string): Promise<boolean> {
		try {
			const success = this.conversationManager.updateMessage(messageId, { content });
			
			if (success) {
				// Fire conversation loaded event to refresh UI
				const conversation = this.getCurrentConversation();
				if (conversation) {
					this._onConversationLoaded.fire(conversation);
				}
			}
			return success;
		} catch (error) {
			this.logService.error('Failed to update message content:', error);
			return false;
		}
	}

	generateRequestId(): string {
		const timestamp = Date.now();
		const random = Math.floor(Math.random() * 1000);
		return `req_${timestamp}_${random}`;
	}

	getCurrentRequestId(): string | undefined {
		return this.currentRequestId;
	}

	setWidgetDecision(functionType: string, messageId: number, decision: 'accept' | 'cancel', content?: string, requestId?: string): void {
		const newDecision = {
			functionType,
			messageId,
			decision,
			content,
			requestId
		};
		
		this.pendingWidgetDecisions.push(newDecision);
		this.signalProcessingContinuation(requestId);
	}

	/**
	 * Signal the processing loop to wake up and continue
	 */
	signalProcessingContinuation(requestId?: string): void {
		// If there's no active processing loop, this might be a historical widget being reactivated
		if (!this.isProcessingLoopActive && requestId) {
			// Reactivate the old request ID and start a new processing loop
			this.currentRequestId = requestId;
			this.currentRequestWasCancelled = false;
			this.signalResolve = null;
			this.processingSignal = null;
			
			// Start processing loop to handle the widget decision
			this.processAllWork();
			return;
		}
		
		// Validate request ID if provided (for active processing loops)
		if (requestId && requestId !== this.currentRequestId) {
			return;
		}
		
		// Ignore signals if processing loop is not active (conversation switched)
		if (!this.isProcessingLoopActive) {
			return;
		}
		
		if (this.signalResolve) {
			this.signalResolve();
			this.signalResolve = null;
			this.processingSignal = null;
		}
	}

	/**
	 * Wait for a signal to continue processing
	 */
	private async waitForSignal(): Promise<void> {
		if (!this.processingSignal) {
			this.processingSignal = new Promise<void>((resolve) => {
				this.signalResolve = resolve;
			});
		}
		return this.processingSignal;
	}

	/**
	 * Determine the next action for the state machine
	 */
	private async determineNextAction(needsInitialApiCall: boolean): Promise<'api_call' | 'process_widget_decision' | 'wait_for_processing' | 'wait_for_widget_decision' | 'complete' | 'error'> {
		// Check cancellation
		if (this.currentRequestWasCancelled) {
			return 'complete';
		}

		// Handle pending widget decisions first
		if (this.pendingWidgetDecisions.length > 0) {
			return 'process_widget_decision';
		}

		// Make initial API call if needed
		if (needsInitialApiCall) {
			return 'api_call';
		}

		// CRITICAL FIX: Check batch status FIRST before processing state
		// When batch status is 'pending', we should wait for widget decisions regardless of processing state
		const batchStatus = this.streamingOrchestrator.getCurrentBatchStatus();
		const isProcessingComplete = this.streamingOrchestrator.isProcessingComplete();
		
		// Handle batch status first
		if (batchStatus === 'pending') {
			if (this.pendingWidgetDecisions.length > 0) {
				return 'process_widget_decision';
			}
			return 'wait_for_widget_decision';
		} else if (batchStatus === 'continue_silent') {
			return 'api_call';
		} else if (batchStatus === 'done') {
			return 'complete';
		} else if (batchStatus === 'error') {
			return 'error';
		} else if (batchStatus === null) {
			return 'complete';
		}

		// If batch status is not decisive, check processing state
		if (!isProcessingComplete) {
			return 'wait_for_processing';
		}

		// Fallback - should not reach here
		return 'error';
	}

	/**
	 * Handle processing errors in the state machine
	 */
	private handleProcessingError(caughtError?: Error): void {
		this.hideThinkingMessage();
		
		// Try to extract the actual error message from the batch
		let errorMessage = 'Function execution failed';
		
		// If we have a caught error, use it as the primary source
		if (caughtError) {
			errorMessage = caughtError.message;
		}
		
		try {
			const batchId = this.streamingOrchestrator.getCurrentBatchId();
			if (batchId) {
				const batchStatus = this.streamingOrchestrator.getCurrentBatchStatus();
				if (batchStatus === 'error') {
					// Get the batch details to extract error messages from branch manager
					const branches = this.branchManager.getBatchBranches(batchId);
					const errorBranch = branches.find((branch: any) => branch.result?.type === 'error');
					
					if (errorBranch?.result?.error) {
						// Only override the caught error if we found a more specific one from branches
						if (!caughtError) {
							errorMessage = errorBranch.result.error;
						}
					}
				}
			}
		} catch (e) {
			// If we can't extract the specific error, fall back to generic message
			this.logService.warn('[STATE MACHINE] Could not extract specific error message:', e);
		}
		
		const errorId = `error_${Date.now()}_${Math.floor(Math.random() * 9000) + 1000}`;
		this._onStreamingError.fire({
			errorId,
			message: errorMessage
		});
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
				delta: filteredContent,
				isComplete: true,
				diffData: {
					diff_data: filteredDiff,
					added: added,
					deleted: deleted,
					clean_filename: cleanFilename
				},
				filename: cleanFilename,
				replaceContent: true // Replace with filtered content
			});
			
		} catch (error) {
			this.logService.error('Failed to retrieve and fire search_replace diff update:', error);
		}
	}

	async showConversationHistory(): Promise<void> {
		this._onShowConversationHistory.fire();
	}

	async showSettings(): Promise<void> {
		this._onShowSettings.fire();
	}

	async extractFileContentForWidget(filename: string, startLine?: number, endLine?: number): Promise<string> {
		return await this.fileContentService.extractFileContentForWidgetDisplay(filename, startLine, endLine);
	}

	getWidget(messageId: number): any {
		return this.streamingOrchestrator.getWidget(messageId);
	}

	/**
	 * Update widget content (for historical widgets loaded from conversation log)
	 */
	updateWidgetContent(messageId: number, content: string): void {
		// Fire the widget content update event directly for historical widgets
		this._onWidgetContentUpdated.fire({
			messageId,
			content,
			functionType: 'run_file' // For now, only run_file widgets use this
		});
	}

	/**
	 * Process widget decision (accept/cancel)
	 */
	private async processWidgetDecision(): Promise<void> {
		if (this.pendingWidgetDecisions.length === 0) {
			return;
		}
		
		const decision = this.pendingWidgetDecisions.shift()!;
		
		let result: {status: string, data: any} | undefined;
		
		if (decision.decision === 'accept') {
			// Call the appropriate command handler directly and capture result
			switch (decision.functionType) {
				case 'run_console_cmd':
					result = await this.consoleCommandHandler.acceptConsoleCommand(decision.messageId, decision.content || '', decision.requestId || '');
					break;
				case 'run_terminal_cmd':
					result = await this.terminalCommandHandler.acceptTerminalCommand(decision.messageId, decision.content || '', decision.requestId || '');
					break;
				case 'search_replace':
					result = await this.searchReplaceCommandHandler.acceptSearchReplaceCommand(decision.messageId, decision.content || '', decision.requestId || '');
					break;
				case 'delete_file':
					result = await this.deleteFileCommandHandler.acceptDeleteFileCommand(decision.messageId, decision.content || '', decision.requestId || '');
					break;
				case 'run_file':
					result = await this.fileCommandHandler.acceptFileCommand(decision.messageId, decision.content || '', decision.requestId || '');
					break;
				default:
					this.logService.error(`[WIDGET DECISION] Unknown function type: ${decision.functionType}`);
			}
		} else {
			// Handle cancellation by calling command handlers directly
			switch (decision.functionType) {
				case 'run_console_cmd':
					result = await this.consoleCommandHandler.cancelConsoleCommand(decision.messageId, decision.requestId || '');
					break;
				case 'run_terminal_cmd':
					result = await this.terminalCommandHandler.cancelTerminalCommand(decision.messageId, decision.requestId || '');
					break;
				case 'search_replace':
					result = await this.searchReplaceCommandHandler.cancelSearchReplaceCommand(decision.messageId, decision.requestId || '');
					break;
				case 'delete_file':
					result = await this.deleteFileCommandHandler.cancelDeleteFileCommand(decision.messageId, decision.requestId || '');
					break;
				case 'run_file':
					result = await this.fileCommandHandler.cancelFileCommand(decision.messageId, decision.requestId || '');
					break;
				default:
					this.logService.error(`[WIDGET DECISION] Unknown function type: ${decision.functionType}`);
			}
		}
		
		// CRITICAL FIX: Complete the branch with the command handler result
		// This updates the branch status and triggers batch status recalculation
		if (result) {
			// Find the branch by message ID and complete it using the established pattern
			const branches = this.branchManager.getBatchBranches(this.streamingOrchestrator.getCurrentBatchId() || '');
			const branch = branches.find(b => b.messageId === decision.messageId);
			
			if (branch) {
				// Complete the branch with the result from the command handler
				await this.branchManager.completeBranch(branch.id, {
					type: result.status === 'error' ? 'error' : 'success',
					status: result.status,
					data: result.data,
					...(result.status === 'error' && { error: result.data?.error })
				});
			}
		}
	}

	/**
	 * Main processing state machine - persistent loop that can be signaled to continue
	 */
	public async processAllWork(needsInitialApiCall: boolean = false): Promise<void> {
		// Prevent multiple instances - signal existing loop instead
		if (this.isProcessingLoopActive) {
			this.signalProcessingContinuation();
			return;
		}

		this.isProcessingLoopActive = true;
		
		// CRITICAL: Set processing state to true when state machine starts
		this.fireOrchestratorStateChange(true);
		
		let iteration = 0;
		const maxIterations = 1000; // Safety limit

		try {
			// State machine loop
			while (this.isProcessingLoopActive && iteration < maxIterations) {
				iteration++;
								
				// Determine next action based on current state
				const action = await this.determineNextAction(needsInitialApiCall);
				needsInitialApiCall = false; // Only true for first iteration
				
				switch (action) {
					case 'api_call':
						await this.makeApiCall();
						break;
						
					case 'process_widget_decision':
						await this.processWidgetDecision();
						break;
						
					case 'wait_for_processing':
						await new Promise(resolve => setTimeout(resolve, 100));
						break;
						
					case 'wait_for_widget_decision':
						// Set processing to false while waiting for user interaction
						this.fireOrchestratorStateChange(false);
						await this.waitForSignal();
						// Set processing back to true when signal received
						this.fireOrchestratorStateChange(true);
						break;
						
					case 'complete':
						this.isProcessingLoopActive = false;
						break;
						
					case 'error':
						this.handleProcessingError();
						this.isProcessingLoopActive = false;
						break;
						
					default:
						this.isProcessingLoopActive = false;
						break;
				}
			}
			
			if (iteration >= maxIterations) {
				this.logService.warn(`[STATE MACHINE] Reached maximum iterations (${maxIterations}) - stopping`);
			}
						
		} catch (error) {
			this.logService.error('[STATE MACHINE] Error in processing loop:', error);
			this.handleProcessingError(error instanceof Error ? error : new Error(String(error)));
		} finally {
			// Clean up state
			this.isProcessingLoopActive = false;
			this.signalResolve = null;
			this.processingSignal = null;
			
			// CRITICAL: Set processing state to false when state machine completes
			this.fireOrchestratorStateChange(false);
			
			// Fire completion events
			this._onStreamingComplete.fire();
			this.currentRequestId = undefined;
		}
	}

	/**
	 * Make an API call (initial or continuation)
	 */
	private async makeApiCall(): Promise<void> {
		this.streamingOrchestrator.clearCurrentBatch();

		// Prepare conversation and context
		const model = await this.settingsService.getSelectedModel();
		const provider = this.settingsService.getProviderForModel(model);
		const temperature = await this.settingsService.getTemperature();

		let messages = this.conversationManager.getMessages();

		const conversation = this.conversationManager.getCurrentConversation();
		let conversationWithSummary: { conversation: ConversationMessage[], summary: any } = { conversation: messages, summary: null };
		if (conversation) {
			const conversationPaths = this.conversationManager.getConversationPaths(conversation.info.id);
			conversationWithSummary = await this.conversationSummarization.prepareConversationWithSummaries(messages, conversationPaths);
			messages = conversationWithSummary.conversation;
		}

		// Backend health check - skip for BYOK since we use local backend
		const anthropicBYOKEnabled = await this.settingsService.getBYOKAnthropicEnabled();
		const openAiBYOKEnabled = await this.settingsService.getBYOKOpenAiEnabled();
		const sagemakerBYOKEnabled = await this.settingsService.getBYOKSagemakerEnabled();
		const isBYOKEnabled = anthropicBYOKEnabled || openAiBYOKEnabled || sagemakerBYOKEnabled;
		
		if (!isBYOKEnabled) {
			const isBackendHealthy = await this.backendClient.checkBackendHealth();
			if (!isBackendHealthy) {
				this.hideThinkingMessage();
				
				throw new Error('Could not connect to backend server within 30 seconds. Please check your internet connectivity and try again. Often this is solved by just retrying. If the problem persists, please open a thread at https://community.lotas.ai/.');
			}
		}

		const contextData = await this.contextService.prepareContextForBackend(messages);
		
		if (conversationWithSummary.summary) {
			contextData.previous_summary = conversationWithSummary.summary;
		}

		
		// Make the API call and wait for it to complete
		return new Promise<void>((resolve, reject) => {
			this.backendClient.sendStreamingQuery(
				messages,
				provider,
				model,
				temperature || 0.1,
				this.currentRequestId!,
				contextData || {},
				async (data: StreamData) => {
					// Map StreamData to StreamEvent and process with orchestrator
					const streamEvent = mapStreamDataToEvent(data);
					if (streamEvent) {
						await this.streamingOrchestrator.processStreamEvent(streamEvent);
					}
				},
				(error: Error) => {
					this.logService.error('Streaming error:', error);
					this.hideThinkingMessage();
					
					const errorId = `error_${Date.now()}_${Math.floor(Math.random() * 9000) + 1000}`;
					this._onStreamingError.fire({
						errorId,
						message: error.message
					});
					
					reject(error);
				},
				async () => {
					// Check if request was cancelled
					if (this.currentRequestWasCancelled) {
						resolve();
						return;
					}
					
					this.hideThinkingMessage();
					
					// Trigger conversation naming check
					this.nameService.triggerConversationNameCheck();
					
					resolve();
				}
			).catch(reject);
		});
	}

	/**
	 * Initialize conversation using the new orchestrator-based approach
	 */
	private async initializeConversationWithOrchestrator(query: string, requestId: string): Promise<void> {
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
						// Get current model and provider for background summarization
						const model = await this.settingsService.getSelectedModel();
						const provider = this.settingsService.getProviderForModel(model);
						
						// Start background summarization (fire and forget)
						this.conversationSummarization.startBackgroundSummarization(
							conversationLog,
							targetQuery,
							conversationPaths,
							provider,
							model
						);
					}
				}
			}

			await this.executeStreamingForOrchestrator(query, userMessageId, requestId);

		} catch (error) {
			this.logService.error('Failed to initialize conversation:', error);
			throw error;
		}
	}


}


