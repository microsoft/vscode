/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStreamingOrchestrator } from '../common/streamingOrchestrator.js';
import { IParallelFunctionBranchManager } from './parallelFunctionBranchManager.js';
import { IFunctionBranchExecutor } from '../../erdosAiFunctions/common/functionBranchExecutor.js';
import { IWidgetManager } from '../common/widgetManager.js';
import { ITextStreamHandler } from '../common/textStreamHandler.js';
import { IMessageIdManager } from '../../erdosAiConversation/common/messageIdManager.js';
import { 
	StreamEvent, 
	ContentStreamEvent,
	FunctionCallStreamEvent,
	FunctionDeltaStreamEvent,
	FunctionCompleteStreamEvent,
	StreamCompleteEvent
} from '../common/streamingTypes.js';


export class StreamingOrchestrator extends Disposable implements IStreamingOrchestrator {
	readonly _serviceBrand: undefined;

	private currentUserMessageId: number = 0;
	private currentRequestId: string = '';
	private currentBatchId: string | null = null;
	private isStreamProcessing = false;
	private isCancelled = false;
	private callIdToMessageIdMap: Map<string, number> = new Map();
	
	// Track accumulated deltas for synthetic function calls
	private accumulatedDeltas: Map<string, string[]> = new Map();
	// Track accumulated content and streamed content for JSON parsing
	private accumulatedContent = new Map<string, string>(); // call_id -> accumulated JSON content
	private streamedContent = new Map<string, string>(); // call_id -> already streamed content
	
	// Track synthetic function calls that shouldn't be executed until complete
	private pendingSyntheticCalls: Set<string> = new Set();
	
	// Buffer deltas that arrive before widgets are created
	

	// Events that need to be forwarded to the main service
	private readonly _onStreamingData = this._register(new Emitter<any>());
	readonly onStreamingData: Event<any> = this._onStreamingData.event;

	private readonly _onMessageAdded = this._register(new Emitter<any>());
	readonly onMessageAdded: Event<any> = this._onMessageAdded.event;

	private readonly _onFunctionCallDisplayMessage = this._register(new Emitter<{ id: number; function_call: any; timestamp: string }>());
	readonly onFunctionCallDisplayMessage: Event<{ id: number; function_call: any; timestamp: string }> = this._onFunctionCallDisplayMessage.event;

	private readonly _onStreamingWidgetRequested = this._register(new Emitter<any>());
	readonly onStreamingWidgetRequested: Event<any> = this._onStreamingWidgetRequested.event;

	private readonly _onWidgetStreamingUpdate = this._register(new Emitter<any>());
	readonly onWidgetStreamingUpdate: Event<any> = this._onWidgetStreamingUpdate.event;

	private readonly _onWidgetButtonAction = this._register(new Emitter<{ messageId: number; action: string }>());
	readonly onWidgetButtonAction: Event<{ messageId: number; action: string }> = this._onWidgetButtonAction.event;

	private readonly _onThinkingMessageHide = this._register(new Emitter<void>());
	readonly onThinkingMessageHide: Event<void> = this._onThinkingMessageHide.event;

	private readonly _onOrchestratorStateChange = this._register(new Emitter<{isProcessing: boolean}>());
	readonly onOrchestratorStateChange: Event<{isProcessing: boolean}> = this._onOrchestratorStateChange.event;

	private readonly _onBatchCompleted = this._register(new Emitter<{batchId: string; status: string}>());
	readonly onBatchCompleted: Event<{batchId: string; status: string}> = this._onBatchCompleted.event;


	constructor(
		@ILogService private readonly logService: ILogService,
		@IParallelFunctionBranchManager private readonly branchManager: IParallelFunctionBranchManager,
		@IFunctionBranchExecutor private readonly branchExecutor: IFunctionBranchExecutor,
		@IWidgetManager private readonly widgetManager: IWidgetManager,
		@ITextStreamHandler private readonly textStreamHandler: ITextStreamHandler,
		@IMessageIdManager private readonly messageIdManager: IMessageIdManager,
	) {
		super();

		// Wire up event forwarding from components to main service
		this._register(this.textStreamHandler.onStreamingData((data) => {
			this._onStreamingData.fire(data);
		}));

		this._register(this.textStreamHandler.onMessageAdded((message) => {
			this._onMessageAdded.fire(message);
		}));

		this._register(this.textStreamHandler.onThinkingMessageHide(() => {
			this._onThinkingMessageHide.fire();
		}));

		this._register(this.widgetManager.onWidgetRequested((request) => {
			this._onStreamingWidgetRequested.fire(request);
		}));

		this._register(this.widgetManager.onWidgetStreamingUpdate((update) => {
			this._onWidgetStreamingUpdate.fire(update);
		}));

		this._register(this.widgetManager.onWidgetButtonAction((action) => {
			this._onWidgetButtonAction.fire(action);
		}));

		this._register(this.branchManager.onBatchComplete((event) => {
			this._onBatchCompleted.fire({
				batchId: event.batchId,
				status: event.status.status
			});
		}));
	}


	async processStreamEvent(event: StreamEvent): Promise<void> {
		try {
			if (this.isCancelled) {
				return;
			}

			// Set processing state when we start handling events
			if (!this.isStreamProcessing) {
				this.isStreamProcessing = true;
			}

			switch (event.type) {
				case 'function_call':
					await this.handleFunctionCallEvent(event as FunctionCallStreamEvent);
					break;
					
				case 'function_delta':
					await this.handleFunctionDeltaEvent(event as FunctionDeltaStreamEvent);
					break;
					
				case 'function_complete':
					await this.handleFunctionCompleteEvent(event as FunctionCompleteStreamEvent);
					break;
					
				case 'done':
					await this.handleStreamCompleteEvent(event as StreamCompleteEvent);
					break;
					
				default:
					// Pass through other events (text, thinking, etc.) to existing handlers
					await this.handleOtherEvent(event);
					break;
			}
		} catch (error) {
			this.logService.error('Error processing stream event:', error);
		}
	}


	cancel(): void {
		this.isStreamProcessing = false;
		this.isCancelled = true;
		this._onOrchestratorStateChange.fire({ isProcessing: false });
	}

	isWidgetStreamingComplete(messageId: number): boolean {
		return this.widgetManager.isWidgetStreamingComplete(messageId);
	}


	setCurrentUserMessageId(messageId: number): void {
		this.currentUserMessageId = messageId;
	}

	setCurrentRequestId(requestId: string): void {
		this.currentRequestId = requestId;
		this.isCancelled = false; // Reset cancellation flag for new request
		
		// Start processing immediately when a new request begins
		this.isStreamProcessing = true;
	}

	clearFunctionQueue(): void {
		if (this.currentRequestId) {
			this.branchManager.cancelAllBranches(this.currentRequestId);
		}
		this.currentBatchId = null;
		this.callIdToMessageIdMap.clear();
		this.accumulatedDeltas.clear();
		this.pendingSyntheticCalls.clear();
	}

	/**
	 * Clear current batch - called before each API call to start fresh
	 */
	clearCurrentBatch(): void {
		// Clear the batch ID so new function calls will create a fresh batch
		this.currentBatchId = null;
		
		// Clear call ID mappings for the new request
		this.callIdToMessageIdMap.clear();
		
		// Clear JSON parsing state
		this.accumulatedContent.clear();
		this.streamedContent.clear();
		
		// Reset text stream handler for new streaming session
		this.textStreamHandler.reset();
	}

	// New parallel branch event handlers
	private async handleFunctionCallEvent(event: FunctionCallStreamEvent): Promise<void> {
		// Start new batch if this is the first function call in the response
		if (!this.currentBatchId) {
			this.currentBatchId = this.branchManager.startNewBatch(this.currentRequestId, this.currentUserMessageId);
		}
		
		// Create branch - message ID generation should happen at the source (backend/stream processing)
		// For now, we'll let the branch manager handle proper ID allocation
		const branchId = await this.branchManager.createBranch(event.functionCall, this.currentBatchId);
		
		// Get the message ID from the created branch for delta routing
		const branches = this.branchManager.getBatchBranches(this.currentBatchId);
		const branch = branches.find(b => b.id === branchId);
		
		if (branch) {
			this.callIdToMessageIdMap.set(event.functionCall.call_id, branch.messageId);
			
			// Fire function call display message ONLY for NON-INTERACTIVE functions
			// Interactive functions (widgets) handle their own display through the widget system
			const isInteractive = this.isInteractiveFunction(event.functionCall.name);
			
			if (!isInteractive) {
				this._onFunctionCallDisplayMessage.fire({
					id: branch.messageId,
					function_call: {
						name: event.functionCall.name,
						arguments: event.functionCall.arguments,
						call_id: event.functionCall.call_id,
						msg_id: branch.messageId
					},
					timestamp: new Date().toISOString()
				});
			}
		}
		
		// Check if this is a pending synthetic call that shouldn't be executed yet
		const isPendingSynthetic = this.pendingSyntheticCalls.has(event.functionCall.call_id);
		
		if (!isPendingSynthetic) {
			// Execute branch immediately - this creates widgets for interactive functions
			this.executeBranchAsync(branchId);
		}
	}

	private async handleFunctionDeltaEvent(event: FunctionDeltaStreamEvent): Promise<void> {
		// Route delta to the appropriate widget
		let messageId = this.callIdToMessageIdMap.get(event.call_id);
		
		if (!messageId) {
			// First delta for this call_id - create synchronous streaming widget immediately
			messageId = this.messageIdManager.preallocateFunctionMessageIds(event.field, event.call_id);
			
			// Create synchronous streaming widget via WidgetManager (creates both ActiveWidget and React UI)
			this.widgetManager.createSynchronousStreamingWidget(
				event.call_id,
				messageId, 
				event.field,
				this.currentRequestId
			);
			
			// Store the mapping for future deltas
			this.callIdToMessageIdMap.set(event.call_id, messageId);
		}
		
		// Route delta through WidgetManager for proper parsing
		if (messageId && event.delta) {
			// Accumulate delta for later branch creation
			const existingDeltas = this.accumulatedDeltas.get(event.call_id) || [];
			existingDeltas.push(event.delta);
			this.accumulatedDeltas.set(event.call_id, existingDeltas);
			
			// Accumulate content for JSON parsing (like rao's delta_accumulators)
			const currentAccumulated = this.accumulatedContent.get(event.call_id) || '';
			const newAccumulated = currentAccumulated + event.delta;
			this.accumulatedContent.set(event.call_id, newAccumulated);
			
			// Route delta to widget manager for proper parsing with command handlers
			// The widgetManager will handle the sophisticated JSON parsing and streaming
			this.widgetManager.streamDelta(event.call_id, event.delta, event.field);
		}
	}

	private async handleFunctionCompleteEvent(event: FunctionCompleteStreamEvent): Promise<void> {
		// Mark widget streaming complete
		let messageId = this.callIdToMessageIdMap.get(event.call_id);
		
		if (!messageId) {
			// Create synthetic function call
			const syntheticFunctionCall = {
				name: event.field,
				arguments: '', // Empty arguments for completion-only events
				call_id: event.call_id,
				msg_id: 0 // Will be updated when branch is created
			};
			
			// Create synthetic function call event to establish proper mapping
			const syntheticEvent: FunctionCallStreamEvent = {
				type: 'function_call',
				functionCall: syntheticFunctionCall
			};
			
			// Process the synthetic function call to establish mapping and create branch
			await this.handleFunctionCallEvent(syntheticEvent);
			
			// Now get the message ID that should have been created
			messageId = this.callIdToMessageIdMap.get(event.call_id);
			
			if (!messageId) {
				return;
			}
		}
		
		if (messageId) {
			// After streaming is complete, create proper branch and save to conversation log
			const accumulatedDeltas = this.accumulatedDeltas.get(event.call_id);
			if (accumulatedDeltas && accumulatedDeltas.length > 0) {
				const completeArguments = accumulatedDeltas.join('');
				try {
					// 1. Start batch if needed
					if (!this.currentBatchId) {
						this.currentBatchId = this.branchManager.startNewBatch(this.currentRequestId, this.currentUserMessageId);
					}
					
					// 2. Create proper function call with complete arguments
					const functionCall = {
						name: event.field,
						arguments: completeArguments,
						call_id: event.call_id,
						msg_id: messageId
					};
					
					// 3. Create proper branch now that we have complete data, using preallocated message ID
					const branchId = await this.branchManager.createBranch(functionCall, this.currentBatchId, true);
					
					// 4. For search_replace, generate diff data before executing branch (like old streaming approach)
					if (event.field === 'search_replace') {
						const diffResult = await this.widgetManager.generateSearchReplaceDiff(
							event.call_id,
							messageId,
							completeArguments,
							this.currentRequestId,
							this.currentUserMessageId
						);
						
						// CRITICAL FIX: If validation failed, the searchReplaceCommandHandler has already saved the error
						// We just need to complete the branch with continue_silent status and skip execution
						if (!diffResult.success) {
							// Complete the branch with success but continue_silent status
							// The error message has already been saved to conversation log by searchReplaceCommandHandler
							await this.branchManager.completeBranch(branchId, {
								type: 'success',
								status: 'continue_silent', // Continue with error message shown to user
								error: diffResult.errorMessage,
								data: {
									message: diffResult.errorMessage,
									related_to_id: this.currentUserMessageId,
									request_id: this.currentRequestId
								}
							});
							
							return; // Skip the executeBranchAsync call
						}
					}
					
					// 5. Execute the branch to complete it
					this.executeBranchAsync(branchId);
					
				} catch (error) {
					this.logService.error('[FUNCTION COMPLETE] Failed to create branch and save to conversation log:', error);
				}
				
				// Check if this was a pending synthetic call that can now be executed
				const wasPendingSynthetic = this.pendingSyntheticCalls.has(event.call_id);
				if (wasPendingSynthetic) {
					// Remove from pending set
					this.pendingSyntheticCalls.delete(event.call_id);
					
					// Find the branch and execute it now that arguments are complete
					if (this.currentBatchId) {
						const branches = this.branchManager.getBatchBranches(this.currentBatchId);
						const branch = branches.find(b => b.functionCall.call_id === event.call_id);
						if (branch) {
							// Update the branch's function call arguments with the complete accumulated arguments
							branch.functionCall.arguments = completeArguments;
							
							this.executeBranchAsync(branch.id);
						}
					}
				}
				
				// Clean up accumulated deltas
				this.accumulatedDeltas.delete(event.call_id);
			}
			
			this._onWidgetStreamingUpdate.fire({
				messageId: messageId,
				delta: '',
				isComplete: true,
				field: event.field,
				requestId: this.currentRequestId
			});
		}
	}

	private async handleStreamCompleteEvent(event: StreamCompleteEvent): Promise<void> {
		// CRITICAL FIX: Complete any remaining text message before marking batch complete
		// This is what the previous system did in StreamCompleteHandler
		if (this.textStreamHandler.hasActiveContent()) {
			await this.textStreamHandler.completeTextMessage(this.currentUserMessageId);
		}
		
		if (this.currentBatchId) {
			this.branchManager.markBatchStreamComplete(this.currentBatchId);
		}
	}

	private async handleOtherEvent(event: StreamEvent): Promise<void> {
		// Handle non-function events (text, thinking, etc.) - pass through to existing text stream handler
		// Only handle content events - other events like thinking are handled elsewhere
		if (event.type === 'content') {
			await this.textStreamHandler.handle(event as ContentStreamEvent);
		}
	}

	private async executeBranchAsync(branchId: string): Promise<void> {
		// Execute the branch in parallel - no waiting
		const branches = this.branchManager.getBatchBranches(this.currentBatchId!);
		
		const branch = branches.find(b => b.id === branchId);
		
		if (branch) {
			this.branchExecutor.executeBranch(branch)
				.then(result => {
					// CRITICAL FIX: Interactive functions with 'pending' status should NOT be completed yet
					// They should wait for user interaction (accept/cancel) before being completed
					const isInteractive = this.isInteractiveFunction(branch.functionCall.name);
					
					if (isInteractive && result.status === 'pending') {
						// Update branch status to 'waiting_user' but DON'T complete the branch
						// The branch will be completed later when user accepts/cancels through widget handlers
						branch.status = 'waiting_user';
						branch.result = result;
						
						return; // Don't call completeBranch() yet!
					} else {
						// CRITICAL FIX: Fire display message event for failed interactive functions
						if ((result as any).displayMessage) {
							this._onFunctionCallDisplayMessage.fire((result as any).displayMessage);
						}
						
						return this.branchManager.completeBranch(branchId, result);
					}
				})
				.catch(error => {
					this.logService.error('[EXECUTE BRANCH ASYNC] Branch execution error:', error);
					return this.branchManager.completeBranch(branchId, {
						type: 'error',
						status: 'error', 
						error: error.message
					});
				});
		}
	}

	// Status query methods for ErdosAiServiceCore
	getCurrentBatchStatus(): 'pending' | 'continue_silent' | 'done' | 'error' | null {
		if (!this.currentBatchId) {
			return null;
		}
		
		const batchStatus = this.branchManager.getBatchStatus(this.currentBatchId);
		return batchStatus.status;
	}

	getCurrentBatchId(): string | null {
		return this.currentBatchId;
	}

	isProcessingComplete(): boolean {
		if (!this.currentBatchId) {
			return true;
		}
		
		const isComplete = this.branchManager.isBatchComplete(this.currentBatchId);
		return isComplete;
	}

	hasActiveWidgets(): boolean {
		if (!this.currentBatchId) {
			return false;
		}
		
		const branches = this.branchManager.getBatchBranches(this.currentBatchId);
		return branches.some(branch => 
			this.isInteractiveFunction(branch.functionCall.name) && 
			branch.status === 'waiting_user'
		);
	}

	private isInteractiveFunction(functionName: string): boolean {
		const interactiveFunctions = [
			'run_console_cmd',
			'run_terminal_cmd', 
			'search_replace',
			'delete_file',
			'run_file'
		];
		return interactiveFunctions.includes(functionName);
	}

	fireWidgetButtonAction(messageId: number, action: string): void {
		this._onWidgetButtonAction.fire({ messageId, action });
	}
}
