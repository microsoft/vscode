/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILanguageRuntimeMessageOutput, ILanguageRuntimeMessageResult, ILanguageRuntimeMessageError, ILanguageRuntimeMessageStream, RuntimeCodeExecutionMode, RuntimeErrorBehavior } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { IConsoleCommandHandler } from '../common/consoleCommandHandler.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';
import { ISessionManagement } from '../../erdosAiUtils/common/sessionManagement.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ERDOS_CONSOLE_VIEW_ID, IErdosConsoleService } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';

export class ConsoleCommandHandler extends Disposable implements IConsoleCommandHandler {
	readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IRuntimeSessionService private readonly runtimeSessionService: IRuntimeSessionService,
		@IConversationManager private readonly conversationManager: IConversationManager,
		@ISessionManagement private readonly sessionManagement: ISessionManagement,
		@IViewsService private readonly viewsService: IViewsService,
		@IErdosConsoleService private readonly erdosConsoleService: IErdosConsoleService
	) {
		super();
	}

	async acceptConsoleCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}> {
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
			
			let language = 'r';
			let actualCommand = command;
			
			if (functionCallMessage.function_call.arguments) {
				try {
					const args = JSON.parse(functionCallMessage.function_call.arguments);
					if (args.language) {
						language = args.language.toLowerCase();
						if (language !== 'r' && language !== 'python') {
							throw new Error(`Invalid language parameter: ${language}. Must be 'r' or 'python'.`);
						}
					}
					
					if (args.command) {
						actualCommand = args.command;
					}
					
				} catch (error) {
					if (error instanceof Error && error.message.includes('Invalid language parameter')) {
						throw error;
					}
					this.logService.warn('Failed to parse function call arguments, defaulting to R console:', error);
				}
			}
			
			const cleanedCommand = this.cleanConsoleCommand(actualCommand);
			
			// Focus the console panel and switch to the session BEFORE executing the command
			try {
				await this.focusConsoleForLanguage(language);
			} catch (focusError) {
				// Continue with execution even if focusing fails
			}
			
			try {
				const consoleOutput = await this.executeConsoleCommandWithOutputCapture(cleanedCommand, callId, language);
				
				await this.conversationManager.replacePendingFunctionCallOutput(callId, consoleOutput, true);
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
							message: 'Console command completed - conversation has moved on, not continuing API',
							related_to_id: relatedToId,
							request_id: requestId
						}
					};
				} else {
					// No newer messages - continue the conversation  
					return {
						status: 'continue_silent',
						data: {
							message: 'Console command completed - returning control to orchestrator',
							related_to_id: relatedToId,
							request_id: requestId
						}
					};
				}
				
			} catch (executionError) {
				
				const errorOutput = `Error executing command: ${executionError instanceof Error ? executionError.message : 'Unknown error'}`;
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
			this.logService.error('Failed to accept console command:', error);
			
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

	async cancelConsoleCommand(messageId: number, requestId: string): Promise<{status: string, data: any}> {
		try {
			this.logService.info(`Cancelling console command for message ${messageId}`);
			
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
				output: 'Console command cancelled',
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
						message: 'Console command cancelled - conversation has moved on, not continuing API',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			} else {
				return {
					status: 'continue_silent',
					data: {
						message: 'Console command cancelled - returning control to orchestrator',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			}
			
		} catch (error) {
			this.logService.error('Failed to cancel console command:', error);
			
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

	private cleanConsoleCommand(command: string): string {
		let trimmedCommand = command;
		
		trimmedCommand = trimmedCommand.replace(/^```(?:r|python|py)?\s*\n?/g, '');
		
		trimmedCommand = trimmedCommand.replace(/\n?```\s*$/g, '');
		
		trimmedCommand = trimmedCommand.replace(/```\n/g, '');
		
		return trimmedCommand.trim();
	}

	async focusConsoleForLanguage(language: string): Promise<void> {
		// Get or create the session for the specified language
		const session = await this.getOrCreateSession(language);
		
		// Focus the console panel and switch to the session
		await this.viewsService.openView(ERDOS_CONSOLE_VIEW_ID, true);
		this.erdosConsoleService.setActiveErdosConsoleSession(session.sessionId);
	}

	private async getOrCreateSession(language: string) {
		let session = this.runtimeSessionService.getConsoleSessionForLanguage(language);
		if (!session) {
			if (language === 'r') {
				await this.sessionManagement.ensureRSession();
				session = this.runtimeSessionService.getConsoleSessionForLanguage('r');
				if (!session) {
					throw new Error('No R session available and failed to start one');
				}
			} else if (language === 'python') {
				await this.sessionManagement.ensurePythonSession();
				session = this.runtimeSessionService.getConsoleSessionForLanguage('python');
				if (!session) {
					throw new Error('No Python session available and failed to start one');
				}
			} else {
				throw new Error(`Unsupported language: ${language}`);
			}
		}
		return session;
	}

	async executeConsoleCommandWithOutputCapture(command: string, executionId: string, language: string = 'r'): Promise<string> {
		const finalSession = this.runtimeSessionService.getConsoleSessionForLanguage(language);
		if (!finalSession) {
			throw new Error(`Failed to get ${language} session`);
		}
		
		return new Promise<string>((resolve, reject) => {
			try {
				
				let outputBuffer = '';
				let errorBuffer = '';
				let resultBuffer = '';
				
				const timeout = 30000;
				
				const disposables: any[] = [];
				
				const timeoutHandle = setTimeout(() => {
					cleanup();
					resolve(`Error: ${language.toUpperCase()} command timed out after 30 seconds`);
				}, timeout);
				
				const cleanup = () => {
					clearTimeout(timeoutHandle);
					disposables.forEach(d => d.dispose());
				};
				
				disposables.push(finalSession.onDidReceiveRuntimeMessageOutput((message: ILanguageRuntimeMessageOutput) => {
					this.logService.info(`[${language.toUpperCase()} OUTPUT] Received message with parent_id: ${message.parent_id}, executionId: ${executionId}`);
					if (message.parent_id === executionId) {
						const messageData = message.data['text/plain'] || message.data || '';
						this.logService.info(`[${language.toUpperCase()} OUTPUT] Captured output: ${messageData}`);
						outputBuffer += messageData;
					}
				}));
				
				disposables.push(finalSession.onDidReceiveRuntimeMessageState((message: any) => {
					this.logService.info(`[${language.toUpperCase()} STATE] Received state message with parent_id: ${message.parent_id}, executionId: ${executionId}, state: ${message.state}`);
					if (message.parent_id === executionId && message.state === 'idle') {
						this.logService.info(`[${language.toUpperCase()} STATE] Execution completed, resolving with output: ${outputBuffer}`);
						cleanup();
						const finalOutput = (outputBuffer + resultBuffer).trim();
						resolve(finalOutput || `${language.toUpperCase()} code executed successfully`);
					}
				}));
				
				disposables.push(finalSession.onDidReceiveRuntimeMessageResult((message: ILanguageRuntimeMessageResult) => {
					if (message.parent_id === executionId) {
						const messageData = message.data['text/plain'] || message.data || '';
						this.logService.info(`[${language.toUpperCase()} RESULT] Captured result: ${messageData}`);
						resultBuffer += messageData;
					}
				}));
				
				disposables.push(finalSession.onDidReceiveRuntimeMessageError((message: ILanguageRuntimeMessageError) => {
					if (message.parent_id === executionId) {
						errorBuffer += message.name + ': ' + message.message + '\n';
						if (message.traceback) {
							errorBuffer += message.traceback.join('\n') + '\n';
						}
						cleanup();
						resolve(`Error: ${errorBuffer.trim()}`);
					}
				}));
				
				disposables.push(finalSession.onDidReceiveRuntimeMessageStream((message: ILanguageRuntimeMessageStream) => {
					if (message.parent_id === executionId) {
						if (message.name === 'stdout') {
							outputBuffer += message.text;
						} else if (message.name === 'stderr') {
							errorBuffer += message.text;
						}
					}
				}));
				
				this.logService.info(`[${language.toUpperCase()} EXECUTION] Executing ${language} command with executionId: ${executionId}`);
				this.logService.info(`[${language.toUpperCase()} EXECUTION] Command: ${command.substring(0, 200)}...`);
				finalSession.execute(
					command,
					executionId,
					RuntimeCodeExecutionMode.Interactive,
					RuntimeErrorBehavior.Continue
				);
				
			} catch (error) {
				reject(`Error executing ${language} code: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		});
	}


	extractAndProcessCommandContent(accumulatedContent: string, isConsole: boolean = true): { content: string; isComplete: boolean } {
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
