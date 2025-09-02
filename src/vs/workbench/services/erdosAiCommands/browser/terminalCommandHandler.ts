/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { ITerminalService } from '../../../contrib/terminal/browser/terminal.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ITerminalCommandHandler } from '../common/terminalCommandHandler.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';

export class TerminalCommandHandler extends Disposable implements ITerminalCommandHandler {
	readonly _serviceBrand: undefined;
	
	private terminalInstances = new Map<string, {
		instance: any,
		callId: string,
		outputBuffer: string,
		exitCode: number | undefined,
		isDone: boolean
	}>();

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
			// Create terminal exactly like Rao's .rs.api.terminalExecute
			const terminal = await this.terminalService.createTerminal({
				config: {
					executable: isWindows ? 'cmd.exe' : '/bin/bash',
					args: isWindows ? ['/c', command] : ['-c', command],
					hideFromUser: true // Hidden terminal like Rao
				}
			});

			// Store terminal state like Rao's global variables (.rs.terminal_id, .rs.terminal_done, etc.)
			const terminalId = terminal.instanceId.toString();
			this.terminalInstances.set(terminalId, {
				instance: terminal,
				callId: callId,
				outputBuffer: '',
				exitCode: undefined,
				isDone: false
			});

			// Set up output capture like Rao's terminalBuffer
			const dataDisposable = terminal.onData((data: string) => {
				const state = this.terminalInstances.get(terminalId);
				if (state) {
					state.outputBuffer += data;
				}
			});

			// Set up exit detection like Rao's terminalExitCode
			const exitDisposable = terminal.onExit((exitCodeOrError) => {
				const state = this.terminalInstances.get(terminalId);
				if (state) {
					if (typeof exitCodeOrError === 'number') {
						state.exitCode = exitCodeOrError;
					} else {
						state.exitCode = 1; // Error case
					}
					state.isDone = true;
				}
				
				// Clean up event listeners
				dataDisposable.dispose();
				exitDisposable.dispose();
			});

			// Wait for terminal to be ready
			await terminal.processReady;
			
			// Send the command to the terminal
			await terminal.sendText(command, true);
			
			// Poll for completion like Rao's check_terminal_complete
			return this.pollTerminalCompletion(terminalId);

		} catch (error) {
			throw new Error(`Error executing terminal command: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	private async pollTerminalCompletion(terminalId: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const maxWaitTime = 30000; // 30 seconds timeout
			const pollInterval = 100;   // Poll every 100ms like Rao
			let totalWaitTime = 0;

			const poll = () => {
				const state = this.terminalInstances.get(terminalId);
				if (!state) {
					reject(new Error('Terminal state lost during polling'));
					return;
				}

				// Check if terminal is done (like Rao's !is_busy check)
				if (state.isDone) {
					// Process output exactly like Rao does in check_terminal_complete
					let terminalOutput = state.outputBuffer;
					
					// Clean ANSI escape codes exactly like Rao: gsub("\033\\[[0-9;]*m", "", terminal_output)
					if (terminalOutput && terminalOutput.length > 0) {
						terminalOutput = terminalOutput
							.replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color codes
							.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // Remove other ANSI escape sequences
							.trim();
						
						if (terminalOutput.length === 0) {
							terminalOutput = "Terminal command executed successfully";
						}
					} else {
						terminalOutput = "Terminal command executed successfully";
					}

					// Add exit code exactly like Rao does
					const exitCode = state.exitCode ?? 0;
					if (exitCode !== 0) {
						terminalOutput += `\n\nExit code: ${exitCode}`;
					} else {
						terminalOutput += `\n\nExit code: 0 (success)`;
					}

					// Clean up terminal instance
					this.terminalInstances.delete(terminalId);
					state.instance.dispose();

					resolve(terminalOutput);
					return;
				}

				// Check timeout
				totalWaitTime += pollInterval;
				if (totalWaitTime >= maxWaitTime) {
					// Timeout - clean up and return what we have
					const partialOutput = state.outputBuffer || "Terminal command executed (timed out after 30 seconds)";
					this.terminalInstances.delete(terminalId);
					state.instance.dispose();
					resolve(partialOutput);
					return;
				}

				// Continue polling
				setTimeout(poll, pollInterval);
			};

			// Start polling
			poll();
		});
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