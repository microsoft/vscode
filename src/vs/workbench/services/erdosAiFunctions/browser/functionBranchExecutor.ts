/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFunctionBranchExecutor } from '../common/functionBranchExecutor.js';
import { FunctionBranch, BranchResult } from '../../erdosAi/browser/parallelFunctionBranchManager.js';
import { IWidgetManager } from '../../erdosAi/common/widgetManager.js';
import { IFunctionCallService } from '../common/functionCallService.js';
import { IInfrastructureRegistry } from '../common/infrastructureRegistry.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';

export class FunctionBranchExecutor extends Disposable implements IFunctionBranchExecutor {
    readonly _serviceBrand: undefined;
    
    constructor(
        @ILogService private readonly logService: ILogService,
        @IWidgetManager private readonly widgetManager: IWidgetManager,
        @IFunctionCallService private readonly functionCallService: IFunctionCallService,
        @IInfrastructureRegistry private readonly infrastructureRegistry: IInfrastructureRegistry,
        @IConversationManager private readonly conversationManager: IConversationManager
    ) {
        super();
    }
    
    async executeBranch(branch: FunctionBranch): Promise<BranchResult> {
        try {
            const isInteractive = this.isInteractiveFunction(branch.functionCall.name);
            
            let result: BranchResult;
            
            if (isInteractive) {
                result = await this.executeInteractiveBranch(branch);
            } else {
                result = await this.executeNonInteractiveBranch(branch);
            }
            
            return result;
        } catch (error) {
            this.logService.error(`[BRANCH EXECUTOR] Failed to execute branch: ${branch.id}`, error);
            
            const errorResult = {
                type: 'error' as const,
                status: 'error',
                error: error instanceof Error ? error.message : String(error)
            };
            
            return errorResult;
        }
    }
    
    private async executeInteractiveBranch(branch: FunctionBranch): Promise<BranchResult> {
        // Special handling for delete_file and run_file: validate BEFORE widget creation
        if (branch.functionCall.name === 'delete_file' || branch.functionCall.name === 'run_file') {
            
            // Add the function call message to the conversation FIRST
            // This ensures the message exists in the conversation log
            const currentConversation = this.conversationManager.getCurrentConversation();
            
            if (currentConversation) {
                await this.conversationManager.addFunctionCallMessage(
                    currentConversation.info.id,
                    branch.messageId,
                    branch.functionCall,
                    branch.userMessageId,
                    false, // createPendingOutput
                    undefined, // pendingOutputId
                    branch.requestId
                );
            }

            // Validate the function call before creating widget
            const callContext = this.infrastructureRegistry.createCallContext(
                branch.userMessageId, 
                branch.requestId, 
                this.conversationManager,
                branch.messageId
            );

            // Process through function handler to validate and create function_call_output
            const result = await this.functionCallService.processFunctionCall({
                name: branch.functionCall.name,
                arguments: branch.functionCall.arguments,
                call_id: branch.functionCall.call_id,
                msg_id: branch.messageId
            }, callContext);

            if (result.type === 'success' && (result as any).function_call_output) {
                const functionOutput = (result as any).function_call_output;
                
                // Check if this is a validation failure (either old or new pattern)
                const shouldContinueSilent = (result as any).status === 'continue_silent';
                const validationFailed = functionOutput.success === false || shouldContinueSilent;
                
                if (validationFailed) {
                    // Add the function call output to show the error message in conversation
                    await this.conversationManager.addFunctionCallOutput(functionOutput);
                    
                    // Return display message data for failed interactive functions
                    // This makes them display during streaming just like non-interactive functions
                    const completionResult = {
                        type: 'success' as const,
                        status: 'continue_silent',
                        data: {
                            message: functionOutput.output,
                            related_to_id: branch.userMessageId,
                            request_id: branch.requestId
                        },
                        // Include display message data so orchestrator can fire the display event
                        displayMessage: {
                            id: branch.messageId,
                            function_call: {
                                name: branch.functionCall.name,
                                arguments: branch.functionCall.arguments,
                                call_id: branch.functionCall.call_id,
                                msg_id: branch.messageId
                            },
                            timestamp: new Date().toISOString()
                        }
                    };
                    
                    return completionResult;
                }
                
                // Add the function call output to the conversation
                await this.conversationManager.addFunctionCallOutput(functionOutput);
            } else {
                // If validation failed, return the error result WITHOUT creating widget
                const functionType = branch.functionCall.name === 'delete_file' ? 'Delete file' : 'Run file';
                const errorMessage = result.type === 'error' ? (result as any).error_message : `${functionType} validation failed`;
                
                this.logService.error(`[BRANCH EXECUTOR] ${functionType} validation failed: ${errorMessage}`);

                const errorResult = {
                    type: 'error' as const,
                    status: 'continue_silent',
                    error: errorMessage,
                    data: {
                        message: errorMessage,
                        related_to_id: branch.userMessageId,
                        request_id: branch.requestId
                    }
                };
                
                return errorResult;
            }
        }

        // Create widget for user interaction - this fires the widget requested event
        // so the UI can display the widget and start streaming into it right away
        const widget = this.widgetManager.createWidgetFromBranch(branch);
        
        if (!widget) {
            const errorMessage = `Failed to create widget for function: ${branch.functionCall.name}`;
            
            return {
                type: 'error',
                status: 'error',
                error: errorMessage
            };
        }
        
        // Widget is now ready to receive streaming content via function_delta events
        // Return pending status - widget completion will trigger branch completion
        const pendingResult = {
            type: 'success' as const,
            status: 'pending',
            data: {
                message: `Function ${branch.functionCall.name} waiting for user confirmation`,
                related_to_id: branch.userMessageId,
                request_id: branch.requestId
            }
        };
        
        return pendingResult;
    }
    
    private async executeNonInteractiveBranch(branch: FunctionBranch): Promise<BranchResult> {
        // Execute function directly
        const callContext = this.infrastructureRegistry.createCallContext(
            branch.userMessageId,
            branch.requestId,
            this.conversationManager,
            branch.messageId
        );
        
        const result = await this.functionCallService.processFunctionCall({
            name: branch.functionCall.name,
            arguments: branch.functionCall.arguments,
            call_id: branch.functionCall.call_id,
            msg_id: branch.messageId
        }, callContext);
        
        
        if (result.type === 'success' && (result as any).function_call_output) {
            // Add function call output to conversation
            await this.conversationManager.addFunctionCallOutput((result as any).function_call_output);
            
            // Handle image_message_entry from view_image function
            if ((result as any).image_message_entry) {
                // Add the image message to the conversation properly using addMessageWithId
                const imageMessage = (result as any).image_message_entry;
                await this.conversationManager.addMessageWithId(imageMessage);
            }
            
            const successResult = {
                type: 'success' as const,
                status: 'continue_silent',
                data: {
                    message: `Function ${branch.functionCall.name} completed successfully`,
                    related_to_id: branch.userMessageId,
                    request_id: branch.requestId
                }
            };
            
            return successResult;
        } else {
            const errorMessage = (result as any).error_message || `Function ${branch.functionCall.name} failed`;
            
            const errorResult = {
                type: 'error' as const,
                status: 'error',
                error: errorMessage
            };
            
            return errorResult;
        }
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
}
