/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { IReactComponentContainer } from '../../../../base/browser/erdosReactRenderer.js';
import { IErdosAiServiceCore } from '../../../services/erdosAi/common/erdosAiServiceCore.js';
import { IErdosAiAuthService } from '../../../services/erdosAi/common/erdosAiAuthService.js';
import { IErdosAiAutomationService } from '../../../services/erdosAi/common/erdosAiAutomationService.js';
import { IHelpService } from '../../../services/erdosAiContext/common/helpService.js';
import { ConversationMessage, Conversation } from '../../../services/erdosAi/common/conversationTypes.js';
import { StreamData } from '../../../services/erdosAiBackend/browser/streamingParser.js';
import { SettingsPanel } from './components/settingsPanel.js';
import { ErdosAiMarkdownComponent } from './components/erdosAiMarkdownRenderer.js';
import { ErdosAiMarkdownRenderer } from './markdown/erdosAiMarkdownRenderer.js';
import { IErdosAiWidgetInfo } from './widgets/widgetTypes.js';
import { ICommonUtils } from '../../../services/erdosAiUtils/common/commonUtils.js';
import { IErdosAiSettingsService } from '../../../services/erdosAiSettings/common/settingsService.js';
import { ContextBar } from './components/contextBar.js';
import { ErrorMessage } from './components/errorMessage.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IErdosAiMarkdownRenderer } from '../../../services/erdosAiUtils/common/erdosAiMarkdownRenderer.js';
import { useErdosReactServicesContext } from '../../../../base/browser/erdosReactRendererContext.js';
import { HistoryDropdown } from './components/ConversationHistory.js';
import { MessageInput } from './components/MessageInput.js';
import { UserMessage, AssistantMessage, calculateAndSetTextareaHeight } from './messages/MessageRenderer.js';
import { MemoizedWidgetWrapper, createWidgetHandlers, createWidgetInfo } from './widgets/WidgetManager.js';
import { updateSingleMessage, filterMessagesForDisplay, formatFunctionCallMessage, parseFunctionArgs, extractCleanedCommand, formatSearchReplaceContent } from './messages/messageUtils.js';
import { useMessageEditing } from './hooks/useMessageEditing.js';
import { useMessageInput } from './hooks/useMessageInput.js';

const WIDGET_FUNCTIONS = ['run_console_cmd', 'run_terminal_cmd', 'search_replace', 'delete_file', 'run_file'] as const;

export interface ErdosAiProps {
	readonly reactComponentContainer: IReactComponentContainer;
	readonly erdosAiService: IErdosAiServiceCore;
	readonly erdosAiAuthService: IErdosAiAuthService;
	readonly erdosAiFullService: IErdosAiServiceCore;
	readonly erdosAiAutomationService: IErdosAiAutomationService;
	readonly helpService: IHelpService;
	readonly fileService?: IFileService;
	readonly fileDialogService?: IFileDialogService;
	readonly textFileService?: ITextFileService;
	readonly textModelService?: ITextModelService;
	readonly erdosPlotsService?: any;
	readonly markdownRenderer: IErdosAiMarkdownRenderer;
	readonly commonUtils: ICommonUtils;
	readonly erdosAiSettingsService: IErdosAiSettingsService;
}

export interface ErdosAiRef {
	showHistory: () => void;
	showSettings: () => void;
}

export const ErdosAi = React.forwardRef<ErdosAiRef, ErdosAiProps>((props, ref) => {
	const services = useErdosReactServicesContext();
	const [messages, setMessages] = useState<ConversationMessage[]>([]);
	const [inputValue, setInputValue] = useState('');
	const [isAiProcessing, setIsAiProcessing] = useState(false);
	const [thinkingMessage, setThinkingMessage] = useState<string>('');
	const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);

	const [showHistory, setShowHistory] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [streamingErrors, setStreamingErrors] = useState<Map<string, string>>(new Map());

	const [widgets, setWidgets] = useState<Map<number, {info: IErdosAiWidgetInfo, content: string, diffData?: any}>>(new Map());
	
	const editTextareaRef = useRef<HTMLTextAreaElement>(null);
	
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const historyButtonRef = useRef<HTMLButtonElement>(null);
	const [markdownRenderer, setMarkdownRenderer] = useState<ErdosAiMarkdownRenderer | null>(null);
	
	// GitHub Copilot's exact scroll management approach
	const [scrollLock, setScrollLock] = useState(true); // Initialize to true like GitHub Copilot
	const [isLoadingConversation, setIsLoadingConversation] = useState(false);
	const previousScrollHeightRef = useRef(0);
	
	React.useImperativeHandle(ref, () => ({
		showHistory: () => setShowHistory(true),
		showSettings: () => setShowSettings(true)
	}));

	// Message editing hook
	const {
		editingMessageId,
		editingContent,
		handleEditingContentChange,
		handleEditKeyDown,
		handleEditBlur,
		handleEditMessage,
		handleRevertToMessage
	} = useMessageEditing({
		erdosAiService: props.erdosAiService,
		currentConversation,
		setCurrentConversation,
		setMessages,
		setInputValue
	});

	// Message input hook
	const {
		handleSendMessage,
		handleKeyPress,
		handleInputChange,
		handlePaste,
		handleCancelStreaming
	} = useMessageInput({
		erdosAiService: props.erdosAiService,
		currentConversation,
		inputValue,
		isAiProcessing,
		setInputValue,
		setCurrentConversation,
		setMessages,
		setScrollLock,
		services
	});
	

	// Memoize the combined items array at the top level - CRITICAL: hooks must be at top level!
	const allItems = useMemo(() => {		
		const items: Array<{type: 'message' | 'widget' | 'streaming', id: number, data: any}> = [];
		
		messages.forEach(message => {
			items.push({type: 'message', id: message.id, data: message});
		});
		
		// Add streaming text as a phantom item with its pre-allocated ID
		if (currentConversation?.streaming && markdownRenderer) {
			const streamingId = currentConversation.streaming.id;
			if (streamingId && !messages.some(msg => msg.id === streamingId)) {
				items.push({
					type: 'streaming', 
					id: streamingId, 
					data: {
						content: currentConversation.streaming.content,
						renderer: markdownRenderer
					}
				});
			}
		}
		
		Array.from(widgets.entries()).forEach(([messageId, widget]) => {
			const hasConversationMessage = messages.some(msg => msg.id === messageId);
			if (!hasConversationMessage) {
				items.push({type: 'widget', id: messageId, data: widget});
			}
		});
		
		items.sort((a, b) => a.id - b.id);
		return items;
	}, [messages, widgets, currentConversation?.streaming, markdownRenderer]);
	
	useEffect(() => {
		const container = messagesContainerRef.current;
		if (!container || !messagesEndRef.current) return;
		
		// Don't auto-scroll when loading an existing conversation
		if (isLoadingConversation) {
			setIsLoadingConversation(false);
			return;
		}
		
		// If the scroll height changed
		if (container.scrollHeight !== previousScrollHeightRef.current) {
			const lastResponseIsRendering = currentConversation?.streaming;
			
			if (!lastResponseIsRendering || scrollLock) {
				// Due to rounding, the scrollTop + clientHeight will not exactly match the scrollHeight.
				// Consider scrolled all the way down if it is within 2px of the bottom.
				// Use PREVIOUS scroll height like GitHub Copilot does
				const lastElementWasVisible = container.scrollTop + container.clientHeight >= previousScrollHeightRef.current - 2;
				
				if (lastElementWasVisible) {
					// Use requestAnimationFrame like GitHub Copilot's scheduleAtNextAnimationFrame
					requestAnimationFrame(() => {
						messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
					});
				}
			}
		}
		
		previousScrollHeightRef.current = container.scrollHeight;
	}, [messages, currentConversation?.streaming, scrollLock, isLoadingConversation]);

	useEffect(() => {
		const renderer = props.markdownRenderer as unknown as ErdosAiMarkdownRenderer;
		setMarkdownRenderer(renderer);
	}, [props.markdownRenderer]);

	useEffect(() => {
		const conversationLoadedDisposable = props.erdosAiService.onConversationLoaded(async (conversation: Conversation) => {
			
			// Mark that we're loading a conversation to prevent auto-scroll
			setIsLoadingConversation(true);
			
			setCurrentConversation(conversation);
			const displayableMessages = filterMessagesForDisplay(conversation.messages);
			
			// When loading a conversation, replace messages completely (don't merge)
			setMessages(displayableMessages);
			setWidgets(new Map());
			
		});

		const messageAddedDisposable = props.erdosAiService.onMessageAdded((message: ConversationMessage) => {
			const conversation = props.erdosAiService.getCurrentConversation();
			if (!conversation) return;
			
			const allMessages = conversation.messages;
			const shouldDisplay = filterMessagesForDisplay([message], allMessages).length > 0;
			
			if (shouldDisplay) {
				setMessages(prev => {
					// Remove any function call display messages for this ID
					let filtered = prev;
					if (message.function_call) {
						filtered = prev.filter(m => !(m.id === message.id && (m as any).isFunctionCallDisplay));
					}
					
					// Use incremental update
					const updated = updateSingleMessage(filtered, message);
					return updated;
				});
			}
			
			setCurrentConversation({...conversation});
		});

		const streamingDataDisposable = props.erdosAiService.onStreamingData((data: StreamData) => {
			if (data.type === 'content' && data.content) {
				const conversation = props.erdosAiService.getCurrentConversation();
				if (conversation) {
					setCurrentConversation({...conversation});
				}
			} else if (data.type === 'thinking') {
			} else if (data.type === 'done') {
			}
		});

		const streamingCompleteDisposable = props.erdosAiService.onStreamingComplete(() => {			
			const imageService = services.imageAttachmentService;
			if (imageService) {
				imageService.clearAllImages().catch((error: any) => {
				});
			}
		});

		const thinkingMessageDisposable = props.erdosAiService.onThinkingMessage((data) => {
			if (data.message && !data.hideCancel) {
				setThinkingMessage(data.message);
			} else {
				setThinkingMessage('');
			}
		});

		const orchestratorStateDisposable = props.erdosAiService.onOrchestratorStateChange((state: {isProcessing: boolean}) => {
			setIsAiProcessing(state.isProcessing);
		});

		const streamingErrorDisposable = props.erdosAiService.onStreamingError((data) => {
			setStreamingErrors(prev => {
				const updated = new Map(prev);
				updated.set(data.errorId, data.message);
				return updated;
			});
		});

		const functionCallDisplayDisposable = props.erdosAiService.onFunctionCallDisplayMessage((displayMessage) => {
			const tempMessage: ConversationMessage = {
				id: displayMessage.id,
				role: 'assistant' as const,
				timestamp: displayMessage.timestamp,
				procedural: false,
				function_call: displayMessage.function_call
			};
			
			setMessages(prevMessages => updateSingleMessage(prevMessages, tempMessage));
		});

		const widgetRequestedDisposable = props.erdosAiService.onWidgetRequested((widgetInfo: IErdosAiWidgetInfo) => {
			setWidgets(prev => {
				const updated = new Map(prev).set(widgetInfo.messageId, {
					info: widgetInfo,
					content: widgetInfo.initialContent || ''
				});
				return updated;
			});
		});

		const widgetStreamingUpdateDisposable = props.erdosAiService.onWidgetStreamingUpdate((update: { 
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
		}) => {
			if (update.delta) {
				setWidgets(prev => {
					const existing = prev.get(update.messageId);
					if (!existing) return prev;
					
					const newContent = update.replaceContent ? update.delta : existing.content + update.delta;
					const newWidget = { ...existing, content: newContent };
					
					if (update.filename) {
						newWidget.info = { ...newWidget.info, filename: update.filename };
					}
					
					if (update.diffData) {
						newWidget.diffData = update.diffData;
					}
					
					return new Map(prev).set(update.messageId, newWidget);
				});
			}
			
			if (update.isComplete !== undefined) {
			}
		});

		const widgetButtonActionDisposable = props.erdosAiService.onWidgetButtonAction((action) => {
			if (action.action === 'hide') {
				// Button hiding is handled by individual widget components
			}
		});

		const conversation = props.erdosAiService.getCurrentConversation();
		if (conversation) {
			setCurrentConversation(conversation);
			const displayableMessages = filterMessagesForDisplay(conversation.messages);
			// Initial conversation loading should replace messages completely
			setMessages(displayableMessages);
		}

		return () => {
			conversationLoadedDisposable.dispose();
			messageAddedDisposable.dispose();
			streamingDataDisposable.dispose();
			streamingCompleteDisposable.dispose();
			thinkingMessageDisposable.dispose();
			streamingErrorDisposable.dispose();
			orchestratorStateDisposable.dispose();
			functionCallDisplayDisposable.dispose();
			widgetRequestedDisposable.dispose();
			widgetStreamingUpdateDisposable.dispose();
			widgetButtonActionDisposable.dispose();
		};
	}, [props.erdosAiService]);


	const createWidget = (message: ConversationMessage, functionCall: any): React.ReactElement | null => {
		
		if (!functionCall || !functionCall.name) {
			return null;
		}

		if (!WIDGET_FUNCTIONS.includes(functionCall.name as any)) {
			return null;
		}

		// First check if we have a live streaming widget
		const widget = widgets.get(message.id);
		if (widget) {
			// Create handlers using the unified flow (same as historical widgets)
			const handlers = createWidgetHandlers(
				functionCall.name, 
				props.erdosAiService, 
				props.erdosAiFullService, 
				props.erdosAiAutomationService, 
				widget.info.requestId, 
				setIsAiProcessing
			);
			
			return (
				<MemoizedWidgetWrapper 
					key={`widget-${message.id}`}
					widgetInfo={widget.info}
					handlers={handlers}
					context={{}}
					streamingContent={widget.content}
					erdosAiService={props.erdosAiService}
					diffData={widget.diffData}
					services={services}
					commonUtils={props.commonUtils}
				/>
			);
		}
				
		// Create widget from conversation log message - this is what was missing!
		const args = parseFunctionArgs(functionCall);
		
		// Extract content from function call arguments for display
		let initialContent = '';
		let filename = '';
		let diffData = undefined;
		
		if (functionCall.name === 'search_replace') {
			const filePath = args.file_path || args.filename || '';
			filename = filePath ? props.commonUtils.getBasename(filePath) : '';
			
			// Try to get diff data for search_replace from the service
			if (props.erdosAiService?.getDiffDataForMessage) {
				try {
					// Now synchronous call - get diff data directly
					const storedDiff = props.erdosAiService.getDiffDataForMessage(message.id.toString());
					
					if (storedDiff && storedDiff.diff_data) {
						// We have synchronous diff data
						diffData = storedDiff;
						// Extract content from diff for display
						let content = '';
						for (const diffItem of storedDiff.diff_data || []) {
							if (diffItem.type !== 'deleted' && diffItem.content) {
								content += diffItem.content + '\n';
							}
						}
						initialContent = content.replace(/\n$/, '');
					}
				} catch (error) {
					console.error(`%c[DIFF DEBUG] Failed to get diff data for search_replace widget:`, 'color: red', error);
				}
			}
			
			if (!initialContent) {
				// Use formatSearchReplaceContent helper
				initialContent = formatSearchReplaceContent(args, props.commonUtils);
			}
		} else if (functionCall.name === 'run_console_cmd') {
			initialContent = extractCleanedCommand(functionCall.name, args);
		} else if (functionCall.name === 'run_terminal_cmd') {
			initialContent = extractCleanedCommand(functionCall.name, args);
		} else if (functionCall.name === 'delete_file') {
			filename = args.filename || args.file_path || '';
			initialContent = `Delete ${args.filename}${args.explanation ? ': ' + args.explanation : ''}`;
		} else if (functionCall.name === 'run_file') {
			filename = args.filename || args.file_path || '';
			// For run_file, extract the file content synchronously (like console commands)
			try {
				if (props.erdosAiService && typeof props.erdosAiService.extractFileContentForWidget === 'function' && filename) {
					// Get the content synchronously - just like extractCleanedCommand does for console
					initialContent = props.erdosAiService.extractFileContentForWidget(
						filename,
						args.start_line_one_indexed,
						args.end_line_one_indexed_inclusive
					);
				} else {
					// Fallback: show the command arguments
					initialContent = args.command || '# Error: Could not extract file content';
				}
			} catch (error) {
				console.error('[DEBUG run_file] Error extracting file content:', error);
				initialContent = `Error loading file ${filename}: ${error instanceof Error ? error.message : String(error)}`;
			}
		}
		
		// Check if this widget should show buttons by looking at function_call_output
		// If output is "Response pending...", the widget is still interactive
		const conversation = props.erdosAiService.getCurrentConversation();
		let showButtons = true;
		
		if (conversation) {
			// Look for function_call_output related to this message
			for (const logEntry of conversation.messages) {
				if (logEntry.type === 'function_call_output' && logEntry.related_to === message.id) {
					const output = logEntry.output || '';
					// If not "Response pending...", operation was completed - hide buttons
					if (output !== 'Response pending...') {
						showButtons = false;
					}
					break;
				}
			}
		}

		// Create proper handlers using the helper functions
		const handlers = createWidgetHandlers(
			functionCall.name, 
			props.erdosAiService, 
			props.erdosAiFullService, 
			props.erdosAiAutomationService, 
			message.request_id || `error`, 
			setIsAiProcessing
		);

		// Create widget info using the helper function
		const widgetInfo = createWidgetInfo(
			message, 
			functionCall.name, 
			args, 
			initialContent, 
			handlers, 
			diffData, 
			showButtons
		);
		
		// Set showButtons property for button visibility logic
		(widgetInfo as any).showButtons = showButtons;
		
		return (
			<MemoizedWidgetWrapper 
				key={`widget-${message.id}`}
				widgetInfo={widgetInfo}
				handlers={handlers}
				context={{}}
				streamingContent={initialContent}
				erdosAiService={props.erdosAiService}
				diffData={diffData}
				services={services}
				commonUtils={props.commonUtils}
				isHistorical={true} // Add flag to indicate this is from conversation log
			/>
		);
	};

	if (showSettings) {
		return (
			<SettingsPanel 
				erdosAiAuthService={props.erdosAiAuthService}
				erdosAiService={props.erdosAiFullService}
				erdosAiSettingsService={props.erdosAiSettingsService}
				onClose={() => setShowSettings(false)}
			/>
		);
	}

	return (
		<div className="erdos-ai-container">

			<HistoryDropdown 
				erdosAiService={props.erdosAiService}
				isOpen={showHistory}
				onClose={() => setShowHistory(false)}
				buttonRef={historyButtonRef}
				onSelectConversation={async (conversationId: string) => {
					setShowHistory(false);
					const id = parseInt(conversationId, 10);
					if (!isNaN(id)) {
						try {
							const conversation = await props.erdosAiService.loadConversation(id);
							if (conversation) {								
								const displayableMessages = filterMessagesForDisplay(conversation.messages);
								setMessages(displayableMessages);
								setCurrentConversation(conversation);
								// Clear widgets so historical widgets from conversation log can be displayed
								setWidgets(new Map());
							}
						} catch (error) {
							console.error('Failed to load conversation:', error);
						}
					}
				}}
			/>

			<div className="erdos-ai-messages" ref={messagesContainerRef}>
				{messages.length === 0 && !isAiProcessing ? (
					<div className="erdos-ai-welcome">
						<h3>Welcome to Erdos</h3>
						<p>Ask me about your data, scripts, or anything else!</p>
					</div>
				) : (
					<>
						{allItems.map((item, index) => {
								if (item.type === 'widget') {
									const widget = item.data;
									// Create handlers using the unified flow (same as historical widgets)
									const handlers = createWidgetHandlers(
										widget.info.functionCallType, 
										props.erdosAiService, 
										props.erdosAiFullService, 
										props.erdosAiAutomationService, 
										widget.info.requestId, 
										setIsAiProcessing
									);
									
									return (
										<MemoizedWidgetWrapper 
											key={`widget-${item.id}`}
											widgetInfo={widget.info}
											handlers={handlers}
											context={{}}
											streamingContent={widget.content}
											erdosAiService={props.erdosAiService}
											services={services}
											commonUtils={props.commonUtils}
										/>
									);
								} else if (item.type === 'streaming') {
									const streamingData = item.data;
									return (
										<div key={`streaming-${item.id}`} data-message-id={item.id} data-type="streaming-text" className="erdos-ai-message assistant">
											<ErdosAiMarkdownComponent
												content={streamingData.content}
												isStreaming={true}
												renderer={streamingData.renderer}
												className="erdos-ai-message-content"
											/>
										</div>
									);
								} else {
									const message = item.data;
									
									if (message.role === 'user') {
										const isEditing = editingMessageId === message.id;
										
										return (
											<UserMessage
												key={message.id}
												message={message}
												isEditing={isEditing}
												editingContent={editingContent}
												editTextareaRef={editTextareaRef}
												onEditMessage={handleEditMessage}
												onRevertToMessage={handleRevertToMessage}
												onEditingContentChange={handleEditingContentChange}
												onEditKeyDown={handleEditKeyDown}
												onEditBlur={handleEditBlur}
												calculateAndSetTextareaHeight={calculateAndSetTextareaHeight}
											/>
										);
									} else {
										if (message.function_call) {
											const functionCall = message.function_call;
											
											if (WIDGET_FUNCTIONS.includes(functionCall.name as any)) {
												
												let functionSucceeded = true;
												if (functionCall.name === 'search_replace' || functionCall.name === 'delete_file' || functionCall.name === 'run_file') {
													for (const msg of (currentConversation?.messages || [])) {
														if (msg.type === 'function_call_output' && 
															msg.related_to === message.id) {
															const success = (msg as any).success;
															if (success === false) {
																functionSucceeded = false;
															}
															break;
														}
													}
												}
												
												if (functionSucceeded) {
													const widgetResult = createWidget(message, functionCall);
													return widgetResult;
												}
											}
											
											const functionMessage = formatFunctionCallMessage(functionCall, props.commonUtils, currentConversation);
											
											return (
												<div key={message.id} className="erdos-ai-function-call-message">
													{functionMessage}
												</div>
											);
										}
										
										return (
											<AssistantMessage
												key={message.id}
												message={message}
												markdownRenderer={markdownRenderer}
											/>
										);
									}
								}
							})}

					</>
				)}
				{thinkingMessage && (
					<div className="erdos-ai-message assistant">
						<div className="erdos-ai-message-content">
							<span className="erdos-ai-thinking-text">
								{thinkingMessage.replace(/\.+$/, '')}
								<span className="erdos-ai-thinking-dots"></span>
							</span>
						</div>
					</div>
				)}

				{Array.from(streamingErrors.entries()).map(([errorId, errorMessage]) => (
					<ErrorMessage 
						key={errorId}
						errorMessage={errorMessage}
						onClose={() => {
							setStreamingErrors(prev => {
								const updated = new Map(prev);
								updated.delete(errorId);
								return updated;
							});
						}}
					/>
				))}

				<div ref={messagesEndRef} />
			</div>

			{services.contextService && (
				<ContextBar
					contextService={services.contextService}
					fileService={props.fileService!}
					fileDialogService={props.fileDialogService!}
					helpService={props.helpService}
					erdosAiService={props.erdosAiService}
				/>
			)}

			<MessageInput
				inputValue={inputValue}
				isAiProcessing={isAiProcessing}
				currentConversation={currentConversation}
				erdosAiService={props.erdosAiService}
				fileDialogService={props.fileDialogService}
				erdosPlotsService={props.erdosPlotsService}
				onInputChange={handleInputChange}
				onKeyPress={handleKeyPress}
				onPaste={handlePaste}
				onSendMessage={handleSendMessage}
				onCancelStreaming={handleCancelStreaming}
			/>
		</div>
	);
});
