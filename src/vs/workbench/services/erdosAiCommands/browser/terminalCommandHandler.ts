/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { ITerminalService } from '../../../contrib/terminal/browser/terminal.js';
import { ITerminalCommandHandler } from '../common/terminalCommandHandler.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';

export class TerminalCommandHandler extends Disposable implements ITerminalCommandHandler {
	readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IConversationManager private readonly conversationManager: IConversationManager
	) {
		super();
	}

	async acceptTerminalCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}> {
		try {
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (!currentConversation) {
				throw new Error('No active conversation');
			}
			
			const functionCallMessage = currentConversation.messages.find((m: any) => m.id === messageId);
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			const callId = functionCallMessage.function_call.call_id;
			
			let actualCommand = command;
			
			// Parse function call arguments to get the actual command if available
			if (functionCallMessage.function_call.arguments) {
				try {
					const args = JSON.parse(functionCallMessage.function_call.arguments);
					
					if (args.command) {
						actualCommand = args.command;
					}
					
				} catch (error) {
					this.logService.warn('Failed to parse function call arguments, using widget command:', error);
				}
			}
			
			const cleanedCommand = this.cleanTerminalCommand(actualCommand);
			
			try {
				const terminalOutput = await this.executeTerminalCommandWithOutputCapture(cleanedCommand, callId);
				
				await this.conversationManager.replacePendingFunctionCallOutput(callId, terminalOutput, true);
				await this.conversationManager.updateConversationDisplay();
				
				// CRITICAL: Check for newer messages like Rao does (same logic for accept and cancel)
				// If newer messages exist, don't continue; if no newer messages, continue
				const hasNewerMessages = this.conversationManager.hasNewerMessages(currentConversation, messageId, callId);
				const relatedToId = functionCallMessage.related_to || messageId;
				
				if (hasNewerMessages) {
					// Conversation has moved on - don't continue
					return {
						status: 'done',
						data: {
							message: 'Terminal command completed - conversation has moved on, not continuing API',
							related_to_id: relatedToId,
							request_id: requestId
						}
					};
				} else {
					// No newer messages - continue the conversation  
					return {
						status: 'continue_silent',
						data: {
							message: 'Terminal command completed - returning control to orchestrator',
							related_to_id: relatedToId,
							request_id: requestId
						}
					};
				}
				
			} catch (executionError) {
				
				const errorOutput = `Error executing terminal command: ${executionError instanceof Error ? executionError.message : 'Unknown error'}`;
				await this.conversationManager.replacePendingFunctionCallOutput(callId, errorOutput, false);
				await this.conversationManager.updateConversationDisplay();
				
				return {
					status: 'error',
					data: {
						error: executionError instanceof Error ? executionError.message : String(executionError),
						related_to_id: functionCallMessage.related_to || messageId,
						request_id: requestId
					}
				};
			}
			
		} catch (error) {
			this.logService.error('Failed to accept terminal command:', error);
			
			return {
				status: 'error',
				data: {
					error: error instanceof Error ? error.message : String(error),
					related_to_id: messageId,
					request_id: requestId
				}
			};
		}
	}

	async cancelTerminalCommand(messageId: number, requestId: string): Promise<{status: string, data: any}> {
		try {
			this.logService.info(`Cancelling terminal command for message ${messageId}`);
			
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (!currentConversation) {
				throw new Error('No active conversation');
			}
			
			const functionCallMessage = currentConversation.messages.find((m: any) => m.id === messageId);
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			const callId = functionCallMessage.function_call.call_id;
			
			const outputMessage = {
				id: this.conversationManager.getNextMessageId(),
				type: 'function_call_output',
				call_id: callId,
				output: 'Terminal command cancelled',
				related_to: messageId,
				procedural: true
			};
			
			await this.conversationManager.addFunctionCallOutput(outputMessage);
			
			const hasNewerMessages = this.conversationManager.hasNewerMessages(currentConversation, messageId, callId);
			const relatedToId = functionCallMessage.related_to || messageId;
			
			if (hasNewerMessages) {
				return {
					status: 'done',
					data: {
						message: 'Terminal command cancelled - conversation has moved on, not continuing API',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			} else {
				return {
					status: 'continue_silent',
					data: {
						message: 'Terminal command cancelled - returning control to orchestrator',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			}
			
		} catch (error) {
			this.logService.error('Failed to cancel terminal command:', error);
			
			return {
				status: 'error',
				data: {
					error: error instanceof Error ? error.message : String(error),
					related_to_id: messageId,
					request_id: requestId
				}
			};
		}
	}

	private cleanTerminalCommand(command: string): string {
		let trimmedCommand = command;
		
		// Remove triple backticks with shell/bash language specifiers
		trimmedCommand = trimmedCommand.replace(/^```(?:shell|bash|sh)?\s*\n?/g, '');
		
		// Remove closing backticks
		trimmedCommand = trimmedCommand.replace(/\n?```\s*$/g, '');
		
		// Clean up any remaining backtick lines
		trimmedCommand = trimmedCommand.replace(/```\n/g, '');
		
		return trimmedCommand.trim();
	}

	private async executeTerminalCommandWithOutputCapture(command: string, callId: string): Promise<string> {
		
		try {
			// Try to get the active terminal first, or create a new one if none exists
			let terminal = this.terminalService.activeInstance;
			
			if (!terminal) {
				// Create a new interactive terminal (not one that exits immediately)
				terminal = await this.terminalService.createTerminal({
					location: TerminalLocation.Panel, // Ensure terminal appears in the terminal panel
				});
			}
			
			// Wait for terminal to be ready
			await terminal.processReady;
			
			// Focus the terminal so user can see it
			await terminal.focusWhenReady();
			
			// Use VSCode's built-in command detection capability
			return new Promise<string>((resolve, reject) => {
				// Wait for command detection capability to be available
				const waitForCommandDetection = () => {
					const commandDetection = terminal.capabilities.get(TerminalCapability.CommandDetection);
					
					if (!commandDetection) {
						// Wait for the capability to be added
						const disposable = terminal.capabilities.onDidAddCapabilityType((capabilityType) => {
							if (capabilityType === TerminalCapability.CommandDetection) {
								disposable.dispose();
								executeWithCommandDetection();
							}
						});
						
						// Set a reasonable timeout for capability initialization (not command execution)
						setTimeout(() => {
							disposable.dispose();
							const detection = terminal.capabilities.get(TerminalCapability.CommandDetection);
							if (detection) {
								executeWithCommandDetection();
							} else {
								this.logService.error(`Command detection capability never became available after 10 seconds`);
								reject(new Error('Terminal command detection capability is not available. This terminal may not support shell integration.'));
							}
						}, 10000); // 10 second timeout for capability setup only
						return;
					}
					
					executeWithCommandDetection();
				};
				
				const executeWithCommandDetection = () => {
					const commandDetection = terminal.capabilities.get(TerminalCapability.CommandDetection)!;
					
					let isResolved = false;
					
					// Listen for command completion
					const disposable = commandDetection.onCommandFinished((finishedCommand) => {
						
						// Check if this is our command (simple check)
						if (finishedCommand.command && finishedCommand.command.includes(command.trim())) {
							if (isResolved) {
								return;
							}
							
							isResolved = true;
							
							// Clean up
							disposable.dispose();
							
							// Get the command output
							const output = finishedCommand.getOutput();
							
							if (output) {
								// Clean up the output
								let cleanOutput = output
									.replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color codes
									.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // Remove other ANSI escape sequences
									.trim();
								
								// Add exit code info
								const exitCode = finishedCommand.exitCode ?? 0;
								if (exitCode !== 0) {
									cleanOutput += `\n\nExit code: ${exitCode}`;
								} else {
									cleanOutput += `\n\nExit code: 0 (success)`;
								}
								
								resolve(cleanOutput);
							} else {
								const result = `Command executed: ${command}\n\nExit code: ${finishedCommand.exitCode ?? 0} (success)`;
								resolve(result);
							}
						}
					});
					
					// Execute the command - let VSCode handle timing and completion detection
					terminal.runCommand(command, true).catch(error => {
						if (isResolved) {
							return;
						}
						
						isResolved = true;
						disposable.dispose();
						reject(error);
					});
				};
				
				// Start the process
				waitForCommandDetection();
			});

		} catch (error) {
			throw new Error(`Error executing terminal command: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	extractAndProcessCommandContent(accumulatedContent: string, isConsole: boolean = false): { content: string; isComplete: boolean } {
		const commandStartMatch = accumulatedContent.match(/"command"\s*:\s*"/);
		if (!commandStartMatch) {
			return { content: '', isComplete: false };
		}

		const contentStartPos = commandStartMatch.index! + commandStartMatch[0].length;
		
		let rawContent = accumulatedContent.substring(contentStartPos);
		
		let processedContent = rawContent;
		processedContent = processedContent
			.replace(/<<<BS>>>/g, '\\\\')
			.replace(/<<<DQ>>>/g, '\\"')
			.replace(/<<<TAB>>>/g, '\\\\t')
			.replace(/<<<NL>>>/g, '\\\\n')
			.replace(/\\t/g, '\t')
			.replace(/\\n/g, '\n')
			.replace(/\\\\"/g, '<<<DQ>>>')
			.replace(/\\\\\\\\t/g, '<<<TAB>>>')
			.replace(/\\\\\\\\n/g, '<<<NL>>>')
			.replace(/\\\\\\\\/g, '<<<BS>>>');

		const explanationMatch = processedContent.match(/\s*"\s*,\s*"explanation"/);
		
		const bufferSize = 20;
		let contentToStream = processedContent;
		let isComplete = false;
		
		if (explanationMatch) {
			contentToStream = processedContent.substring(0, explanationMatch.index!);
			isComplete = true;
		} else if (processedContent.length > bufferSize) {
			contentToStream = processedContent.substring(0, processedContent.length - bufferSize);
		} else {
			contentToStream = '';
		}

		if (contentToStream.length > 0) {
			if (isConsole) {
				contentToStream = contentToStream
					.replace(/^```[rR]?[mM]?[dD]?\s*\n?/g, '')
					.replace(/\n?```\s*$/g, '')
					.replace(/```\n/g, '');
			} else {
				contentToStream = contentToStream
					.replace(/^```(?:shell|bash|sh)?\s*\n?/g, '')
					.replace(/\n?```\s*$/g, '')
					.replace(/```\n/g, '');
			}
			contentToStream = contentToStream.trim();
		}

		return { content: contentToStream, isComplete };
	}

}