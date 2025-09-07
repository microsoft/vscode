/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { FunctionCall } from '../common/conversationTypes.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';
import { IMessageIdManager } from '../../erdosAiConversation/common/messageIdManager.js';

export interface FunctionBranch {
    id: string;
    functionCall: FunctionCall;
    messageId: number;
    batchId: string;
    requestId: string;
    userMessageId: number;
    status: BranchStatus;
    result?: BranchResult;
    createdAt: Date;
    completedAt?: Date;
}

export type BranchStatus = 'created' | 'streaming' | 'ready' | 'executing' | 'waiting_user' | 'completed' | 'error';

export interface BranchResult {
    type: 'success' | 'error' | 'cancelled';
    status: string; // 'continue_silent' | 'pending' | 'done' | 'error'
    data?: any;
    error?: string;
}

export interface BatchStatus {
    batchId: string;
    requestId: string;
    userMessageId: number;
    status: 'pending' | 'continue_silent' | 'done' | 'error';
    streamComplete: boolean;
    branches: FunctionBranch[];
    pendingInteractiveCount: number;
    completedBranchCount: number;
    totalBranchCount: number;
}

export const IParallelFunctionBranchManager = createDecorator<IParallelFunctionBranchManager>('parallelFunctionBranchManager');

export interface IParallelFunctionBranchManager {
    readonly _serviceBrand: undefined;
    
    // Batch lifecycle
    startNewBatch(requestId: string, userMessageId: number): string;
    markBatchStreamComplete(batchId: string): void;
    isBatchComplete(batchId: string): boolean;
    getBatchStatus(batchId: string): BatchStatus;
    
    // Branch lifecycle
    createBranch(functionCall: FunctionCall, batchId: string, usePreallocatedIds?: boolean): Promise<string>;
    completeBranch(branchId: string, result: BranchResult): Promise<void>;
    
    // State management
    getBranchStatus(branchId: string): BranchStatus;
    getBranchByCallId(callId: string): FunctionBranch | undefined;
    getBatchBranches(batchId: string): FunctionBranch[];
    cancelAllBranches(requestId: string): void;
    
    // Events
    readonly onBatchComplete: Event<{ batchId: string; status: BatchStatus }>;
}

export class ParallelFunctionBranchManager extends Disposable implements IParallelFunctionBranchManager {
    readonly _serviceBrand: undefined;
    
    private branches: Map<string, FunctionBranch> = new Map();
    private batches: Map<string, BatchStatus> = new Map();
    private batchIdCounter = 0;
    private branchIdCounter = 0;
    
    private readonly _onBatchComplete = this._register(new Emitter<{ batchId: string; status: BatchStatus }>());
    readonly onBatchComplete: Event<{ batchId: string; status: BatchStatus }> = this._onBatchComplete.event;
    
    constructor(
        @ILogService private readonly logService: ILogService,
        @IConversationManager private readonly conversationManager: IConversationManager,
        @IMessageIdManager private readonly messageIdManager: IMessageIdManager
    ) {
        super();
    }
    
    startNewBatch(requestId: string, userMessageId: number): string {
        const batchId = `batch_${++this.batchIdCounter}`;
        
        const batchStatus: BatchStatus = {
            batchId,
            requestId,
            userMessageId,
            status: 'pending',
            streamComplete: false,
            branches: [],
            pendingInteractiveCount: 0,
            completedBranchCount: 0,
            totalBranchCount: 0
        };
        
        this.batches.set(batchId, batchStatus);
        return batchId;
    }
    
    markBatchStreamComplete(batchId: string): void {
        const batch = this.batches.get(batchId);
        if (!batch) {
            this.logService.warn(`[BRANCH MANAGER] markBatchStreamComplete: batch not found: ${batchId}`);
            return;
        }
        
        batch.streamComplete = true;
        this.checkBatchCompletion(batchId);
    }
    
    async createBranch(functionCall: FunctionCall, batchId: string, usePreallocatedIds: boolean = false): Promise<string> {
        const branchId = `branch_${++this.branchIdCounter}`;
        
        const batch = this.batches.get(batchId);
        if (!batch) {
            throw new Error(`Batch not found: ${batchId}`);
        }
        
        let functionCallMessageId: number;
        
        if (usePreallocatedIds && functionCall.msg_id) {
            // Use the preallocated message ID that was passed in
            functionCallMessageId = functionCall.msg_id;
        } else {
            // Pre-allocate new message IDs for this function call (function call + output)
            functionCallMessageId = this.messageIdManager.preallocateFunctionMessageIds(
                functionCall.name, 
                functionCall.call_id
            );
        }
        
        const branch: FunctionBranch = {
            id: branchId,
            functionCall,
            messageId: functionCallMessageId,
            batchId,
            requestId: batch.requestId,
            userMessageId: batch.userMessageId,
            status: 'created',
            createdAt: new Date()
        };
                
        this.branches.set(branchId, branch);
        batch.branches.push(branch);
        batch.totalBranchCount++;
        
        // Track interactive functions
        const isInteractive = this.isInteractiveFunction(functionCall.name);
        
        if (isInteractive) {
            batch.pendingInteractiveCount++;
        }
        
        // Add function call to conversation log (except for delete_file and run_file which handle this themselves)
        if (branch.functionCall.name !== 'delete_file' && branch.functionCall.name !== 'run_file') {
            await this.addFunctionCallToConversation(branch);
        }
        
        return branchId;
    }
    
    async completeBranch(branchId: string, result: BranchResult): Promise<void> {
        const branch = this.branches.get(branchId);
        if (!branch) {
            this.logService.warn(`[BRANCH MANAGER] completeBranch: branch not found: ${branchId}`);
            return;
        }
        
        branch.result = result;
        branch.status = 'completed';
        branch.completedAt = new Date();
        
        const batch = this.batches.get(branch.batchId);
        if (!batch) {
            this.logService.warn(`[BRANCH MANAGER] completeBranch: batch not found: ${branch.batchId}`);
            return;
        }
        
        batch.completedBranchCount++;
        
        // Decrease pending interactive count if this was interactive
        const isInteractive = this.isInteractiveFunction(branch.functionCall.name);
        
        if (isInteractive) {
            batch.pendingInteractiveCount--;
        }
        
        // Check if batch is now complete
        this.checkBatchCompletion(branch.batchId);
    }
    
    private checkBatchCompletion(batchId: string): void {
        const batch = this.batches.get(batchId);
        if (!batch) {
            return;
        }
        
        if (!batch.streamComplete) {
            return;
        }
        
        // Batch is complete when stream ended AND all branches completed
        if (batch.completedBranchCount >= batch.totalBranchCount) {
            // Determine batch status based on branch results
            const newStatus = this.calculateBatchStatus(batch);
            
            batch.status = newStatus;
            
            this._onBatchComplete.fire({ batchId, status: batch });
        }
    }
    
    private calculateBatchStatus(batch: BatchStatus): 'pending' | 'continue_silent' | 'done' | 'error' {
        // Check for errors
        const hasErrors = batch.branches.some(b => b.result?.type === 'error');
        
        if (hasErrors) {
            return 'error';
        }
        
        // Check if any interactive functions still pending
        if (batch.pendingInteractiveCount > 0) {
            return 'pending';
        }
        
        // Check if any functions returned continue_silent
        const hasContinueSilent = batch.branches.some(b => b.result?.status === 'continue_silent');
        
        if (hasContinueSilent) {
            return 'continue_silent';
        }
        
        return 'done';
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
    
    private async addFunctionCallToConversation(branch: FunctionBranch): Promise<void> {
        const conversation = this.conversationManager.getCurrentConversation();
        if (!conversation) {
            return;
        }
        
        // Get preallocated ID for pending function_call_output
        const pendingOutputId = this.messageIdManager.getPreallocatedMessageId(branch.functionCall.call_id, 2);
        
        await this.conversationManager.addFunctionCallMessage(
            conversation.info.id,
            branch.messageId,
            branch.functionCall,
            branch.userMessageId,
            this.isInteractiveFunction(branch.functionCall.name), // createPendingOutput for interactive functions
            pendingOutputId,
            branch.requestId
        );
    }
    
    isBatchComplete(batchId: string): boolean {
        const batch = this.batches.get(batchId);
        return batch ? batch.status !== 'pending' : false;
    }
    
    getBatchStatus(batchId: string): BatchStatus {
        const batch = this.batches.get(batchId);
        if (!batch) {
            throw new Error(`Batch not found: ${batchId}`);
        }
        return batch;
    }
    
    getBranchStatus(branchId: string): BranchStatus {
        const branch = this.branches.get(branchId);
        return branch ? branch.status : 'error';
    }
    
    getBranchByCallId(callId: string): FunctionBranch | undefined {
        for (const branch of this.branches.values()) {
            if (branch.functionCall.call_id === callId) {
                return branch;
            }
        }
        return undefined;
    }
    
    getBatchBranches(batchId: string): FunctionBranch[] {
        const batch = this.batches.get(batchId);
        return batch ? batch.branches : [];
    }
    
    cancelAllBranches(requestId: string): void {
        for (const batch of this.batches.values()) {
            if (batch.requestId === requestId) {
                for (const branch of batch.branches) {
                    branch.status = 'error';
                    branch.result = { type: 'cancelled', status: 'error', error: 'Cancelled' };
                }
                batch.status = 'error';
            }
        }
        
    }
}
