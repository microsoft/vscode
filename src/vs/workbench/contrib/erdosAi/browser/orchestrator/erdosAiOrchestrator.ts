/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IErdosAiService } from '../../common/erdosAiService.js';

/**
 * Orchestrates AI operations using flat architecture where each function call
 * is processed individually and the orchestrator controls the overall flow.
 * Based on Rao's AiOrchestrator.java
 */
export class ErdosAiOrchestrator {
	// Status constants matching Rao's R-side constants
	private static readonly AI_STATUS_DONE = 'done';
	private static readonly AI_STATUS_CONTINUE_SILENT = 'continue_silent';
	private static readonly AI_STATUS_CONTINUE_AND_DISPLAY = 'continue_and_display';
	private static readonly AI_STATUS_PENDING = 'pending';
	private static readonly AI_STATUS_ERROR = 'error';

	private isProcessing = false;
	private currentRequestId: string | null = null;

	constructor(
		private readonly erdosAiService: IErdosAiService
	) {
		// Access logService through the main service
		this.logService = (erdosAiService as any).logService;
	}

	private logService: any;

	/**
	 * Starts a new AI search using the flat architecture.
	 */
	public startAiSearch(query: string, requestId: string): void {
		// Set processing state and store request ID
		this.isProcessing = true;
		this.currentRequestId = requestId;

		// Notify React component that processing started
		(this.erdosAiService as any).fireOrchestratorStateChange(true);

		// Start initial conversation
		this.initializeConversation(query, requestId);
	}

	/**
	 * Continues a conversation by making an API call with the current conversation state.
	 * Used when function completions return "continue" status.
	 * This is exactly like Rao's continueConversation method.
	 */
	public continueConversation(relatedToId: number, requestId: string): void {
		if (!relatedToId) {
			return;
		}

		// Set processing state
		this.isProcessing = true;
		this.currentRequestId = requestId;

		// Notify React component that processing started
		(this.erdosAiService as any).fireOrchestratorStateChange(true);

		// Make continue API call - this goes back to the top-level sendMessage logic
		this.makeContinueApiCall(relatedToId, requestId);
	}

	/**
	 * Handles function completion results based on status.
	 * This is called when terminal/console commands complete.
	 */
	public handleFunctionCompletion(status: string, data: any): void {
		console.log(`[DEBUG STOP BUTTON] Orchestrator handleFunctionCompletion: status=${status}, isProcessing=${this.isProcessing}`);

		switch (status) {
			case ErdosAiOrchestrator.AI_STATUS_DONE:
				// Processing complete
				console.log(`[DEBUG STOP BUTTON] Orchestrator: DONE status - finishing processing`);
				this.handleSearchCompletion(data);
				this.finishProcessing();
				break;

			case ErdosAiOrchestrator.AI_STATUS_CONTINUE_SILENT:
				// Continue silently - extract related_to_id and make another API call
				console.log(`[DEBUG STOP BUTTON] Orchestrator: CONTINUE_SILENT status - continuing processing`);
				const relatedToId = data?.related_to_id;
				const requestId = data?.request_id || this.currentRequestId;

				if (!relatedToId) {
					break;
				}

				// Continue the conversation at the orchestrator level
				this.continueConversation(relatedToId, requestId);
				break;

			case ErdosAiOrchestrator.AI_STATUS_CONTINUE_AND_DISPLAY:
				// Continue and update display
				console.log(`[DEBUG STOP BUTTON] Orchestrator: CONTINUE_AND_DISPLAY status - continuing processing`);
				this.handleContinueAndDisplay(data);
				break;

			case ErdosAiOrchestrator.AI_STATUS_PENDING:
				// Function is pending user interaction - stop processing
				console.log(`[DEBUG STOP BUTTON] Orchestrator: PENDING status - should stop processing and wait for user`);
				this.setPendingState();
				break;

			case ErdosAiOrchestrator.AI_STATUS_ERROR:
				// Handle error status
				console.log(`[DEBUG STOP BUTTON] Orchestrator: ERROR status - finishing processing`);
				this.handleError(data?.error || 'Function completion failed');
				break;

			default:
				console.log(`[DEBUG STOP BUTTON] Orchestrator: Unknown status=${status}`);
				break;
		}
	}

	/**
	 * Sets pending state - waiting for user interaction.
	 * This should stop processing and hide the stop button.
	 */
	private setPendingState(): void {
		console.log(`[DEBUG STOP BUTTON] Orchestrator: setPendingState - stopping processing for user interaction`);
		this.isProcessing = false;
		// Don't clear currentRequestId since we're still in the same request, just waiting for user
		
		// Notify React component that processing is done (waiting for user interaction)
		(this.erdosAiService as any).fireOrchestratorStateChange(false);
	}

	/**
	 * Checks if currently processing.
	 */
	public isProcessingNow(): boolean {
		return this.isProcessing;
	}

	/**
	 * Cancels current processing.
	 */
	public cancel(): void {
		if (this.isProcessing) {
			this.finishProcessing();
		}
	}

	/**
	 * Accept console command - called directly by widgets
	 * This ensures all function calls go through the orchestrator
	 */
	public async acceptConsoleCommand(messageId: number, command: string, requestId: string): Promise<void> {
		try {
			// Call service method and get status result
			const statusResult = await (this.erdosAiService as any).acceptConsoleCommand(messageId, command, requestId);
			
			// Handle the returned status (like Rao's handleOperationResult)
			this.handleFunctionCompletion(statusResult.status, statusResult.data);
			
		} catch (error) {
			console.error('ORCHESTRATOR: Error in acceptConsoleCommand:', error);
		}
	}

	/**
	 * Accept file command - called directly by widgets
	 * This ensures all function calls go through the orchestrator
	 */
	public async acceptFileCommand(messageId: number, command: string, requestId: string): Promise<void> {
		try {
			console.log(`[ORCHESTRATOR] acceptFileCommand called: messageId=${messageId}, requestId=${requestId}`);
			// Call service method and get status result
			const statusResult = await (this.erdosAiService as any).acceptFileCommand(messageId, command, requestId);
			
			console.log(`[ORCHESTRATOR] acceptFileCommand got status result:`, statusResult);
			console.log(`[ORCHESTRATOR] Status: "${statusResult.status}", Data:`, statusResult.data);
			if (statusResult.status === 'error') {
				console.log(`[ORCHESTRATOR ERROR] Error details:`, statusResult.data.error);
			}
			
			// Handle the returned status (like Rao's handleOperationResult)
			this.handleFunctionCompletion(statusResult.status, statusResult.data);
			
		} catch (error) {
			console.error('ORCHESTRATOR: Error in acceptFileCommand:', error);
		}
	}

	/**
	 * Cancel file command - called directly by widgets
	 */
	public async cancelFileCommand(messageId: number, requestId: string): Promise<void> {
		try {
			// Call service method and get status result
			const statusResult = await (this.erdosAiService as any).cancelFileCommand(messageId, requestId);
			
			// Handle the returned status (like Rao's handleOperationResult)
			this.handleFunctionCompletion(statusResult.status, statusResult.data);
			
		} catch (error) {
			console.error('ORCHESTRATOR: Error in cancelFileCommand:', error);
		}
	}

	/**
	 * Cancel console command - called directly by widgets
	 */
	public async cancelConsoleCommand(messageId: number, requestId: string): Promise<void> {
		
		try {
			// Call service method and get status result
			const statusResult = await (this.erdosAiService as any).cancelConsoleCommand(messageId, requestId);
			
			// Handle the returned status (like Rao's handleOperationResult)
			this.handleFunctionCompletion(statusResult.status, statusResult.data);
			
		} catch (error) {
		}
	}

	/**
	 * Accept terminal command - called directly by widgets
	 */
	public async acceptTerminalCommand(messageId: number, command: string, requestId: string): Promise<void> {
		
		try {
			// Call service method and get status result
			const statusResult = await (this.erdosAiService as any).acceptTerminalCommand(messageId, command, requestId);
			
			// Handle the returned status (like Rao's handleOperationResult)
			this.handleFunctionCompletion(statusResult.status, statusResult.data);
			
		} catch (error) {
		}
	}

	/**
	 * Cancel terminal command - called directly by widgets
	 */
	public async cancelTerminalCommand(messageId: number, requestId: string): Promise<void> {
		
		try {
			// Call service method and get status result
			const statusResult = await (this.erdosAiService as any).cancelTerminalCommand(messageId, requestId);
			
			// Handle the returned status (like Rao's handleOperationResult)
			this.handleFunctionCompletion(statusResult.status, statusResult.data);
			
		} catch (error) {
		}
	}

	/**
	 * Accept search replace command - called directly by widgets
	 */
	public async acceptSearchReplaceCommand(messageId: number, content: string, requestId: string): Promise<void> {
		console.log('[ORCHESTRATOR] acceptSearchReplaceCommand called:', messageId);
		try {
			// Call service method and get status result
			const statusResult = await (this.erdosAiService as any).acceptSearchReplaceCommand(messageId, content, requestId);
			
			// Handle the returned status (like console commands)
			this.handleFunctionCompletion(statusResult.status, statusResult.data);
			
		} catch (error) {
			console.error('ORCHESTRATOR: Error in acceptSearchReplaceCommand:', error);
		}
	}

	/**
	 * Cancel search replace command - called directly by widgets
	 */
	public async cancelSearchReplaceCommand(messageId: number, requestId: string): Promise<void> {
		try {
			// Call service method and get status result
			const statusResult = await (this.erdosAiService as any).cancelSearchReplaceCommand(messageId, requestId);
			
			// Handle the returned status (like console commands)
			this.handleFunctionCompletion(statusResult.status, statusResult.data);
			
		} catch (error) {
			console.error('ORCHESTRATOR: Error in cancelSearchReplaceCommand:', error);
		}
	}

	/**
	 * Accept delete file command - called directly by widgets
	 */
	public async acceptDeleteFileCommand(messageId: number, content: string, requestId: string): Promise<void> {
		try {
			// Call service method and get status result
			const statusResult = await (this.erdosAiService as any).acceptDeleteFileCommand(messageId, content, requestId);
			
			// Handle the returned status (like Rao's pattern)
			this.handleFunctionCompletion(statusResult.status, statusResult.data);
			
		} catch (error) {
			console.error('ORCHESTRATOR: Error in acceptDeleteFileCommand:', error);
		}
	}

	/**
	 * Cancel delete file command - called directly by widgets
	 */
	public async cancelDeleteFileCommand(messageId: number, requestId: string): Promise<void> {
		try {
			// Call service method and get status result
			const statusResult = await (this.erdosAiService as any).cancelDeleteFileCommand(messageId, requestId);
			
			// Handle the returned status (like Rao's pattern)
			this.handleFunctionCompletion(statusResult.status, statusResult.data);
			
		} catch (error) {
			console.error('ORCHESTRATOR: Error in cancelDeleteFileCommand:', error);
		}
	}

	/**
	 * Initializes conversation with user query and then makes API call.
	 * This exactly matches Rao's initializeConversation flow.
	 */
	private async initializeConversation(query: string, requestId: string): Promise<void> {
		try {

			// Add user message to conversation first (like Rao does)
			const userMessageId = (this.erdosAiService as any).conversationManager.addUserMessage(query, {
				original_query: true
			});

			// Fire event to update UI with user message
			const userMessage = (this.erdosAiService as any).conversationManager.getMessages().find((m: any) => m.id === userMessageId)!;
			(this.erdosAiService as any)._onMessageAdded.fire(userMessage);

			// Handle background summarization for original queries (exactly like rao)
			const conversationLog = (this.erdosAiService as any).conversationManager.getMessages();
			const shouldTrigger = (this.erdosAiService as any).conversationSummarization.shouldTriggerSummarization(conversationLog);
			
			if (shouldTrigger) {
				const currentQueryCount = (this.erdosAiService as any).conversationSummarization.countOriginalQueries(conversationLog);
				const conversation = (this.erdosAiService as any).conversationManager.getCurrentConversation();
				const conversationPaths = (this.erdosAiService as any).conversationManager.getConversationPaths(conversation.info.id);
				const highestSummarized = await (this.erdosAiService as any).conversationSummarization.getHighestSummarizedQuery(conversationPaths);
				
	
				
				// Check if we need to start summarization for query N-1
				// Query N triggers summarization of query N-1
				const targetQuery = currentQueryCount - 1;

				if (targetQuery > highestSummarized && targetQuery >= 1) {
	
					// CRITICAL: Don't await - start background summarization without blocking main query
					(this.erdosAiService as any).conversationSummarization.startBackgroundSummarization(conversationLog, targetQuery, conversationPaths);
				} else {
	
				}
			} else {
	
			}

			// Execute the streaming logic through the service
			await (this.erdosAiService as any).executeStreamingForOrchestrator(query, userMessageId, requestId);

		} catch (error) {
		}
	}

	/**
	 * Makes an API call for continuing a conversation.
	 * This exactly matches Rao's makeContinueApiCall.
	 */
	private async makeContinueApiCall(relatedToId: number, requestId: string): Promise<void> {
		try {

			// Execute the same streaming logic as initial messages but for continuation
			// The relatedToId is the original user message ID that triggered the sequence
			await (this.erdosAiService as any).executeStreamingForOrchestrator('', relatedToId, requestId);

		} catch (error) {
		}
	}

	/**
	 * Handles search completion.
	 */
	private handleSearchCompletion(data: any): void {
		this.logService?.info('AI search completed successfully', data);
	}

	/**
	 * Handles continue and display status.
	 */
	private handleContinueAndDisplay(data: any): void {
		// Update display and continue
		const relatedToId = data?.related_to_id;
		const requestId = data?.request_id || this.currentRequestId;

		if (relatedToId) {
			this.continueConversation(relatedToId, requestId);
		} else {
			this.logService?.error('Cannot continue conversation - missing related_to_id in data:', data);
		}
	}

	/**
	 * Handles errors.
	 */
	private handleError(error: string): void {
		this.finishProcessing();
	}

	/**
	 * Finishes processing and resets state.
	 * Clears attached images after AI exchange is complete, like Rao does.
	 */
	private finishProcessing(): void {
		this.isProcessing = false;
		this.currentRequestId = null;
		
		// Notify React component that processing is done
		(this.erdosAiService as any).fireOrchestratorStateChange(false);
		
		// Clear attached images after AI exchange is complete (like Rao's finishProcessing)
		// Images should be cleared when the conversation exchange ends, not at the start
		const imageService = (this.erdosAiService as any).getImageAttachmentService();
		if (imageService) {
			imageService.clearAllImages().catch((error: any) => {
				// Log errors but don't block the finishProcessing flow
			});
		}
	}
}
