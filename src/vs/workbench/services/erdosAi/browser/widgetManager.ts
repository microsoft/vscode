/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IWidgetManager, ActiveWidget, WidgetStreamingUpdate } from '../common/widgetManager.js';
import { IErdosAiWidgetInfo } from '../../../contrib/erdosAi/browser/widgets/widgetTypes.js';
import { IFileContentService } from '../../erdosAiUtils/common/fileContentService.js';
import { ISearchReplaceCommandHandler } from '../../erdosAiCommands/common/searchReplaceCommandHandler.js';
import { IConsoleCommandHandler } from '../../erdosAiCommands/common/consoleCommandHandler.js';
import { ITerminalCommandHandler } from '../../erdosAiCommands/common/terminalCommandHandler.js';
import { IErdosAiSettingsService } from '../../erdosAiSettings/common/settingsService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FunctionBranch, IParallelFunctionBranchManager } from './parallelFunctionBranchManager.js';
import { diffStorage } from '../../erdosAiUtils/browser/diffUtils.js';
import { IFunctionParserService } from '../../erdosAiCommands/common/functionParserService.js';

/**
 * Implementation of ActiveWidget
 */
class ActiveWidgetImpl implements ActiveWidget {
	public isStreaming: boolean = false;
	public accumulatedContent: string = '';
	public streamedContent: string = '';
	public isStreamingComplete: boolean = false;
	public onStreamingCompleteCallback?: () => void;
	public hasAsyncContentUpdate: boolean = false;

	constructor(
		public messageId: number,
		public callId: string,
		public functionType: string,
		public requestId: string
	) {}

	appendDelta(delta: string): void {
		this.accumulatedContent += delta;
	}

	markComplete(): void {
		this.isStreaming = false;
		this.isStreamingComplete = true;
		
		// Immediately call the completion callback if set
		if (this.onStreamingCompleteCallback) {
			this.onStreamingCompleteCallback();
		}
	}
}

export class WidgetManager extends Disposable implements IWidgetManager {
	readonly _serviceBrand: undefined;

	private activeWidgets: Map<string, ActiveWidgetImpl> = new Map();

	private readonly _onWidgetRequested = this._register(new Emitter<IErdosAiWidgetInfo>());
	readonly onWidgetRequested: Event<IErdosAiWidgetInfo> = this._onWidgetRequested.event;

	private readonly _onWidgetStreamingUpdate = this._register(new Emitter<WidgetStreamingUpdate>());
	readonly onWidgetStreamingUpdate: Event<WidgetStreamingUpdate> = this._onWidgetStreamingUpdate.event;

	private readonly _onWidgetCreated = this._register(new Emitter<string>());
	readonly onWidgetCreated: Event<string> = this._onWidgetCreated.event;

	private readonly _onWidgetButtonAction = this._register(new Emitter<{ messageId: number; action: string }>());
	readonly onWidgetButtonAction: Event<{ messageId: number; action: string }> = this._onWidgetButtonAction.event;

	private readonly _onWidgetContentUpdated = this._register(new Emitter<{ messageId: number; content: string; functionType: string }>());
	readonly onWidgetContentUpdated: Event<{ messageId: number; content: string; functionType: string }> = this._onWidgetContentUpdated.event;


	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileContentService private readonly fileContentService: IFileContentService,
		@ISearchReplaceCommandHandler private readonly searchReplaceCommandHandler: ISearchReplaceCommandHandler,
		@IConsoleCommandHandler private readonly consoleCommandHandler: IConsoleCommandHandler,
		@ITerminalCommandHandler private readonly terminalCommandHandler: ITerminalCommandHandler,
		@IParallelFunctionBranchManager private readonly branchManager: IParallelFunctionBranchManager,
		@IErdosAiSettingsService private readonly settingsService: IErdosAiSettingsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@IFunctionParserService private readonly functionParserService: IFunctionParserService,
	) {
		super();
	}

    async createWidgetFromBranch(branch: FunctionBranch): Promise<ActiveWidget | null> {
        const widget = new ActiveWidgetImpl(
            branch.messageId,
            branch.functionCall.call_id,
            branch.functionCall.name,
            branch.requestId
        );

        // Enable streaming for interactive widgets immediately
        // This allows them to receive deltas via streamDelta method
        const isInteractive = this.isInteractiveFunction(branch.functionCall.name);
        
        if (isInteractive) {
            widget.isStreaming = true;
        }

		this.activeWidgets.set(branch.functionCall.call_id, widget);
		
		// Notify that widget is ready for streaming (so orchestrator can flush buffered deltas)
		this._onWidgetCreated.fire(branch.functionCall.call_id);

		// Set up synchronous streaming completion handler immediately
		// This ensures completion is handled without any dependency on React or async events
		widget.onStreamingCompleteCallback = () => {
			// Fire the streaming update event for React to receive
			this._onWidgetStreamingUpdate.fire({
				messageId: widget.messageId,
				delta: '',
				isComplete: true,
				replaceContent: false
			});
		};

		// Parse function arguments
		const args = JSON.parse(branch.functionCall.arguments || '{}');

		// Get initial content for specific widget types
		let initialContent = '';
		if (branch.functionCall.name === 'run_file') {
			// Start with loading message, then update asynchronously
			initialContent = 'Loading file content...';
			
			// Load content asynchronously and update widget when ready
			this.fileContentService.extractFileContentForWidgetDisplay(
				args.filename,
				args.start_line_one_indexed,
				args.end_line_one_indexed_inclusive
			).then(content => {
				// Update the widget content when file is loaded
				this.updateWidgetContent(widget.messageId, content);
			}).catch(error => {
				// Update with error message if loading fails
				this.updateWidgetContent(widget.messageId, `Error loading file: ${error instanceof Error ? error.message : String(error)}`);
			});
		}

		// Check auto-accept setting based on function type
		let autoAccept = false;
		if (branch.functionCall.name === 'search_replace') {
			try {
				autoAccept = await this.settingsService.getAutoAcceptEdits();
			} catch (error) {
				this.logService.error('[WIDGET_MANAGER] Failed to check auto-accept edits setting:', error);
				autoAccept = false; // Default to false on error
			}
		} else if (branch.functionCall.name === 'delete_file') {
			try {
				autoAccept = await this.settingsService.getAutoAcceptDeletes();
			} catch (error) {
				this.logService.error('[WIDGET_MANAGER] Failed to check auto-accept deletes setting:', error);
				autoAccept = false; // Default to false on error
			}
		} else if (branch.functionCall.name === 'run_terminal_cmd') {
			try {
				// Only check auto-accept on non-Windows platforms
				const isWindows = (await import('../../../../base/common/platform.js')).isWindows;
				if (!isWindows) {
					const terminalAutoAccept = await this.settingsService.getAutoAcceptTerminal();
					if (terminalAutoAccept) {
						// Extract command from function call arguments
						// According to conversationTypes.ts, arguments is always a JSON string
						let command: string | undefined;
						try {
							const args = JSON.parse(branch.functionCall.arguments);
							command = args.command;
						} catch (error) {
							this.logService.error('[WIDGET_MANAGER] Failed to parse function call arguments JSON:', error);
						}
						
						if (command && typeof command === 'string') {
							// Get settings for bash parser (it will use them internally)
							await Promise.all([
								this.settingsService.getTerminalAutoAcceptMode(),
								this.settingsService.getTerminalAllowList(),
								this.settingsService.getTerminalDenyList()
							]);
							
							// Use bash parser to check if command should be auto-accepted
							const { BashCommandExtractor } = await import('../../erdosAiCommands/common/bashParser.js');
							const bashParser = new BashCommandExtractor(this.commandService, this.settingsService);
							autoAccept = await bashParser.checkAutoAccept(command);
						}
					}
				}
			} catch (error) {
				this.logService.error('[WIDGET_MANAGER] Failed to check auto-accept terminal setting:', error);
				autoAccept = false; // Default to false on error
			}
		} else if (branch.functionCall.name === 'run_console_cmd') {
			try {
				const consoleAutoAccept = await this.settingsService.getAutoAcceptConsole();
				if (consoleAutoAccept) {
					// Extract command from function call arguments
					let command: string | undefined;
					let language: 'python' | 'r' | undefined;
					try {
						const args = JSON.parse(branch.functionCall.arguments);
						command = args.command;
						language = args.language;
					} catch (error) {
						this.logService.error('[WIDGET_MANAGER] Failed to parse console function call arguments JSON:', error);
					}
					
					if (command && typeof command === 'string' && language) {
						// Get settings for console parser (it will use them internally)
						await Promise.all([
							this.settingsService.getConsoleAutoAcceptMode(),
							this.settingsService.getConsoleAllowList(),
							this.settingsService.getConsoleDenyList(),
							this.settingsService.getConsoleLanguageFilter()
						]);
						
						// Use function parser service to check if command should be auto-accepted
						autoAccept = await this.functionParserService.checkAutoAccept(command, language);
					}
				}
			} catch (error) {
				this.logService.error('[WIDGET_MANAGER] Failed to check auto-accept console setting:', error);
				autoAccept = false; // Default to false on error
			}
		}

		// Handlers will be created by React component using the unified flow

		const widgetInfo: IErdosAiWidgetInfo = {
			messageId: branch.messageId,
			requestId: branch.requestId,
			functionCallType: branch.functionCall.name as any,
			filename: args.filename || args.file_path,
			initialContent: initialContent || undefined, // Ensure it's string | undefined, not empty string
			autoAccept: autoAccept,
			startLine: args.start_line_one_indexed,
			endLine: args.end_line_one_indexed_inclusive,
			language: args.language, // Extract language from function call arguments
		};

        this._onWidgetRequested.fire(widgetInfo);

        return widget;
	}

    createSynchronousStreamingWidget(callId: string, messageId: number, functionType: string, requestId: string): ActiveWidget {
        // Create ActiveWidget immediately (synchronous)
        const widget = new ActiveWidgetImpl(messageId, callId, functionType, requestId);
        
        // CRITICAL: Enable streaming immediately for interactive functions
        const isInteractive = this.isInteractiveFunction(functionType);
        if (isInteractive) {
            widget.isStreaming = true;
        }

		// Store in map so streamDelta() can find it
		this.activeWidgets.set(callId, widget);
		
		// Notify that widget is ready for streaming
		this._onWidgetCreated.fire(callId);

		// Set up synchronous streaming completion handler
		widget.onStreamingCompleteCallback = () => {
			this._onWidgetStreamingUpdate.fire({
				messageId: widget.messageId,
				delta: '',
				isComplete: true,
				replaceContent: false
			});
		};

		// Check auto-accept setting based on function type (synchronous version)
		let autoAccept = false;
		if (functionType === 'search_replace') {
			try {
				// Use configuration service directly for synchronous access
				autoAccept = this.configurationService.getValue<boolean>('erdosAi.autoAcceptEdits') || false;
			} catch (error) {
				this.logService.error('[WIDGET_MANAGER] Failed to check auto-accept edits setting in sync widget creation:', error);
				autoAccept = false;
			}
		} else if (functionType === 'delete_file') {
			try {
				// Use configuration service directly for synchronous access
				autoAccept = this.configurationService.getValue<boolean>('erdosAi.autoAcceptDeletes') || false;
			} catch (error) {
				this.logService.error('[WIDGET_MANAGER] Failed to check auto-accept deletes setting in sync widget creation:', error);
				autoAccept = false;
			}
		}

		// Create minimal widget info for React UI (no complete function arguments yet)
		const widgetInfo: IErdosAiWidgetInfo = {
			messageId: messageId,
			requestId: requestId,
			functionCallType: functionType as any,
			filename: undefined, // Will be extracted from deltas later
			initialContent: undefined,
			autoAccept: autoAccept,
			startLine: undefined,
			endLine: undefined,
			language: undefined, // Will be extracted from deltas later for console commands
			// No handlers - React will create them using createWidgetHandlers
		};

        // Fire widget requested event for React UI
        this._onWidgetRequested.fire(widgetInfo);

        return widget;
	}

	getActiveWidget(callId: string): ActiveWidget | null {
		return this.activeWidgets.get(callId) || null;
	}

	isWidgetStreamingComplete(messageId: number): boolean {
		// Find widget by messageId
		for (const widget of this.activeWidgets.values()) {
			if (widget.messageId === messageId) {
				return widget.isStreamingComplete;
			}
		}
		return false;
	}

	markWidgetComplete(callId: string): void {
		const widget = this.activeWidgets.get(callId);
        if (widget) {
            widget.markComplete();
            this.activeWidgets.delete(callId);
        }
	}

	async startStreaming(widget: ActiveWidget, bufferedData: string[]): Promise<void> {
		widget.isStreaming = true;

        // Stream all buffered deltas immediately
        for (const delta of bufferedData) {
            this.streamDelta(widget.callId, delta);
        }
	}

	streamDelta(callId: string, delta: string, field?: string): void {
		const widget = this.activeWidgets.get(callId);
		
		if (!widget || !widget.isStreaming) {
			return;
		}

		widget.appendDelta(delta);
		
		// Process the content based on function type
		let parsed: { content: string; isComplete: boolean };
		let filename: string | undefined;
		let language: 'python' | 'r' | undefined;

		switch (widget.functionType) {
			case 'search_replace':
				parsed = this.searchReplaceCommandHandler.extractAndProcessSearchReplaceContent(
					widget.accumulatedContent, 
					callId
				);
				// Extract filename for search_replace
				const filenameMatch = widget.accumulatedContent.match(/"file_path"\s*:\s*"([^"]*)"/); 
				filename = filenameMatch ? filenameMatch[1] : undefined;
				break;

			case 'run_terminal_cmd':
				parsed = this.terminalCommandHandler.extractAndProcessCommandContent(
					widget.accumulatedContent,
					false // isConsole = false for terminal
				);
				break;

			case 'run_console_cmd':
				parsed = this.consoleCommandHandler.extractAndProcessCommandContent(
					widget.accumulatedContent,
					true // isConsole = true for console
				);
				// Extract language for console commands
				const consoleLanguageMatch = widget.accumulatedContent.match(/"language"\s*:\s*"([^"]*)"/);
				language = consoleLanguageMatch ? consoleLanguageMatch[1] as 'python' | 'r' : undefined;
				break;

			default:
				// For other types, just pass through the content
				parsed = { content: widget.accumulatedContent, isComplete: false };
				break;
		}

		// Only fire update if content has changed
		if (parsed.content !== widget.streamedContent) {
			this._onWidgetStreamingUpdate.fire({
				messageId: widget.messageId,
				delta: parsed.content,
				isComplete: false,
				isSearchReplace: widget.functionType === 'search_replace',
				filename: filename,
				language: language,
				field: field,
				requestId: widget.requestId,
				replaceContent: true // Replace with full accumulated content
			});

			widget.streamedContent = parsed.content;
		}
	}

	completeWidgetStreaming(callId: string): void {	
		const widget = this.activeWidgets.get(callId);
		if (!widget) {
			this.logService.warn(`[WIDGET MANAGER] completeWidgetStreaming: widget not found for callId: ${callId}`);
			return;
		}

        // Handle completion-specific logic (like diff generation for search_replace)
		if (widget.functionType === 'search_replace') {
			// Get user message ID from the branch
			const branch = this.branchManager.getBranchByCallId(callId);
			if (!branch) {
				this.logService.error(`[WIDGET MANAGER] Could not find branch for call_id: ${callId}`);
				return;
			}
			
			// Generate diff data directly when search_replace streaming completes
			this.generateSearchReplaceDiff(callId, widget.messageId, widget.accumulatedContent, widget.requestId, branch.userMessageId)
				.then(result => {
					if (!result.success) {
						this.logService.error(`[WIDGET MANAGER] Diff generation failed in completeWidgetStreaming: ${result.errorMessage}`);
					}
				})
				.catch(error => {
					this.logService.error('[WIDGET MANAGER] Error in generateSearchReplaceDiff:', error);
				});
		}

        // Mark widget complete - this triggers the synchronous completion callback
        widget.markComplete();
	}

	fireWidgetButtonAction(messageId: number, action: string): void {
		this._onWidgetButtonAction.fire({ messageId, action });
	}

	isWidgetStreaming(callId: string): boolean {
		const widget = this.activeWidgets.get(callId);
		return widget ? widget.isStreaming : false;
	}

	hasPendingInteractiveWidgets(): boolean {
		// This method is kept for interface compatibility but Function Queue tracks the real state
		return this.activeWidgets.size > 0;
	}


	async generateSearchReplaceDiff(callId: string, messageId: number, completeArguments: string, requestId: string, userMessageId: number): Promise<{success: boolean, errorMessage?: string}> {
		try {
			// Create function call object for diff generation
			const functionCall = {
				name: 'search_replace',
				arguments: completeArguments,
				call_id: callId,
				msg_id: messageId
			};
			
			// Generate diff data using the search replace command handler
			const diffResult = await this.searchReplaceCommandHandler.validateAndProcessSearchReplace(
				functionCall,
				messageId,
				userMessageId,
				requestId
			);
			
			if (diffResult.success) {
				// Fire a special streaming update with diff data
				await this.fireSearchReplaceDiffUpdate(messageId);
				return {success: true};
			} else {
				this.logService.error(`[WIDGET_MANAGER] Diff generation failed: ${diffResult.errorMessage}`);
				
				// CRITICAL FIX: Return the validation failure to the orchestrator
				// so it can properly complete the branch with an error status
				return {success: false, errorMessage: diffResult.errorMessage};
			}
		} catch (error) {
			this.logService.error(`[WIDGET_MANAGER] Error generating diff data for search_replace:`, error);
			
			const errorMessage = error instanceof Error ? error.message : String(error);
			return {success: false, errorMessage: `Search and replace validation failed: ${errorMessage}`};
		}
	}
	
	private async fireSearchReplaceDiffUpdate(messageId: number): Promise<void> {
		try {
			// This mirrors the old retrieveAndFireSearchReplaceDiffUpdate logic
			// Retrieve stored diff entry
			const storedDiffEntry = diffStorage.getStoredDiffEntry(messageId.toString());
			if (!storedDiffEntry) {
				this.logService.warn(`[WIDGET_MANAGER] No stored diff entry found for messageId: ${messageId}`);
				return;
			}
			
			// Count added/deleted lines
			let added = 0, deleted = 0;
			for (const diffItem of storedDiffEntry.diff_data) {
				if (diffItem.type === 'added') added++;
				else if (diffItem.type === 'deleted') deleted++;
			}
			
			// Get clean filename
			const filePath = storedDiffEntry.file_path || 'unknown';
			const cleanFilename = filePath.split('/').pop() || filePath;
			
			// Reconstruct content from filtered diff for widget display
			let filteredContent = '';
			for (const diffItem of storedDiffEntry.diff_data) {
				if (diffItem.type !== 'deleted' && diffItem.content) {
					filteredContent += diffItem.content + '\n';
				}
			}
			// Remove trailing newline
			filteredContent = filteredContent.replace(/\n$/, '');
			
			const updateObject = {
				messageId: messageId,
				delta: filteredContent,
				isComplete: true,
				diffData: {
					diff_data: storedDiffEntry.diff_data,
					added: added,
					deleted: deleted,
					clean_filename: cleanFilename
				},
				filename: cleanFilename,
				replaceContent: true, // Replace with filtered content
				field: 'search_replace'
			};
			
			// Fire widget update with diff data for UI highlighting
			this._onWidgetStreamingUpdate.fire(updateObject);
			
		} catch (error) {
			this.logService.error(`[WIDGET_MANAGER] Failed to fire search_replace diff update:`, error);
		}
	}

	/**
	 * Update widget content asynchronously (for run_file widgets)
	 */
	private updateWidgetContent(messageId: number, content: string): void {
		// Find the widget by messageId
		let targetWidget: ActiveWidgetImpl | undefined;
		for (const widget of this.activeWidgets.values()) {
			if (widget.messageId === messageId) {
				targetWidget = widget;
				break;
			}
		}
		
		if (!targetWidget) {
			return;
		}

		// Update the widget's accumulated content and mark as updated
		targetWidget.accumulatedContent = content;
		targetWidget.hasAsyncContentUpdate = true;
		
		// Trigger a display update (this will notify the UI to refresh the widget)
		this._onWidgetContentUpdated.fire({
			messageId,
			content,
			functionType: targetWidget.functionType
		});
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

	/**
	 * Get widget by messageId for React components to check async content updates
	 */
	public getWidget(messageId: number): ActiveWidgetImpl | undefined {
		for (const widget of this.activeWidgets.values()) {
			if (widget.messageId === messageId) {
				return widget;
			}
		}
		return undefined;
	}
}
