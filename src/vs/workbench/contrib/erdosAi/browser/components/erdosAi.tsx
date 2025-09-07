/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, memo, useCallback } from 'react';
import { IReactComponentContainer } from '../../../../../base/browser/erdosReactRenderer.js';
import { IErdosAiServiceCore } from '../../../../services/erdosAi/common/erdosAiServiceCore.js';
import { IErdosAiAuthService } from '../../../../services/erdosAi/common/erdosAiAuthService.js';
import { IErdosAiAutomationService } from '../../../../services/erdosAi/common/erdosAiAutomationService.js';
import { IHelpService } from '../../../../services/erdosAiContext/common/helpService.js';
import { ConversationMessage, Conversation, ConversationInfo } from '../../../../services/erdosAi/common/conversationTypes.js';
import { StreamData } from '../../../../services/erdosAiBackend/browser/streamingParser.js';
import { SettingsPanel } from './settingsPanel.js';
import { ErdosAiMarkdownComponent } from './erdosAiMarkdownRenderer.js';
import { ErdosAiMarkdownRenderer } from '../markdown/erdosAiMarkdownRenderer.js';
import { IErdosAiWidgetInfo, IErdosAiWidgetHandlers } from '../widgets/widgetTypes.js';
import { DiffHighlighter } from './diffHighlighter.js';
import { ICommonUtils } from '../../../../services/erdosAiUtils/common/commonUtils.js';
import { IErdosAiSettingsService } from '../../../../services/erdosAiSettings/common/settingsService.js';
import { ContextBar } from './contextBar.js';
import { ErrorMessage } from './errorMessage.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { URI } from '../../../../../base/common/uri.js';
import { IErdosAiMarkdownRenderer } from '../../../../services/erdosAiUtils/common/erdosAiMarkdownRenderer.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ImageAttachmentToolbar } from './imageAttachmentToolbar.js';

interface WidgetWrapperProps {
	widgetInfo: IErdosAiWidgetInfo;
	handlers: IErdosAiWidgetHandlers;
	context: any;
	streamingContent: string;
	erdosAiService: IErdosAiServiceCore;
	diffData?: any;
	services: any;
	commonUtils: ICommonUtils;
	isHistorical?: boolean; // Flag to indicate this widget is from conversation log
}

/**
 * React wrapper component for widgets
 */
const WidgetWrapper: React.FC<WidgetWrapperProps> = ({ widgetInfo, handlers, context, streamingContent, erdosAiService, diffData: initialDiffData, services, commonUtils, isHistorical }) => {
	const functionType = widgetInfo.functionCallType;
	
	const getInitialButtonVisibility = () => {
		if (widgetInfo.autoAccept) {
			return false;
		}
		
		// For search_replace, hide buttons initially and show them only when diff data arrives
		// This prevents buttons from showing before the diff is computed and displayed
		if (functionType === 'search_replace' && !initialDiffData) {
			return false;
		}
		
		// Check showButtons for ALL function types (if it was explicitly set)
		if ((widgetInfo as any).showButtons !== undefined) {
			return (widgetInfo as any).showButtons !== false;
		}
		
		// Default to true for interactive functions
		return true;
	};
	
    const [buttonsVisible, setButtonsVisible] = useState(() => {
		const initialVisibility = getInitialButtonVisibility();
		return initialVisibility;
	});
	// Initialize streamingComplete based on the actual widget state in the backend
	// This removes dependency on React event timing and uses the authoritative source
	const [streamingComplete, setStreamingComplete] = useState(() => {
		// For delete_file and run_file, always start with streamingComplete = true since they don't stream
		if (functionType === 'delete_file' || functionType === 'run_file') {
			return true;
		}
		
		// For historical widgets (recreated from conversation log), they've already completed
		// their creation/streaming phase, so streamingComplete should be true
		if (isHistorical) {
			return true;
		}
		
		// CRITICAL: For new widgets, directly read the backend completion state
		// This prevents race conditions where events are fired before React listeners are ready
		const backendCompletionState = erdosAiService.isWidgetStreamingComplete(widgetInfo.messageId);
		return backendCompletionState;
	});
    const [currentContent, setCurrentContent] = useState(streamingContent);
    const [diffData, setDiffData] = useState<any>(initialDiffData || null);
    const [isExpanded, setIsExpanded] = useState(true);
    const consoleTextareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        // Don't reset content to empty string if we already have content
        // This prevents the useEffect from clearing content when widgets are recreated from conversation log
        if (streamingContent || !currentContent) {
            setCurrentContent(streamingContent);
        }
    }, [streamingContent]);

    useEffect(() => {
        if (consoleTextareaRef.current && currentContent !== undefined) {
            const el = consoleTextareaRef.current;
            el.style.height = 'auto';
            const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
            const contentLines = (currentContent || '').split('\n').length;
            const maxLines = 6;
            const heightLines = Math.min(contentLines, maxLines);
            const newHeight = lineHeight * heightLines;
            el.style.height = `${newHeight}px`;
        }
    }, [currentContent]);

    useEffect(() => {
        if (consoleTextareaRef.current) {
            const el = consoleTextareaRef.current;
            el.style.height = 'auto';
            const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
            const contentLines = (el.value || '').split('\n').length;
            const maxLines = 6;
            const heightLines = Math.min(contentLines, maxLines);
            const newHeight = lineHeight * heightLines;
            el.style.height = `${newHeight}px`;
        }
    }, []);

	useEffect(() => {
		const buttonActionDisposable = erdosAiService.onWidgetButtonAction((action) => {
			if (action.messageId === widgetInfo.messageId && action.action === 'hide') {
				setButtonsVisible(false);
			}
		});

		return () => {
			buttonActionDisposable.dispose();
		};
	}, [erdosAiService, widgetInfo.messageId]);

	// Set up streaming update listener immediately (synchronously) when component is created
	// This avoids race condition where backend fires completion event before useEffect runs
	const [streamingUpdateDisposable] = useState(() => {
		return erdosAiService.onWidgetStreamingUpdate((update) => {
			if (update.messageId === widgetInfo.messageId) {
				if (update.diffData) {
					setDiffData(update.diffData);
					
					// For search_replace widgets, show buttons when diff data arrives
					// This ensures buttons only appear after the diff is computed and ready for display
					if (functionType === 'search_replace' && !buttonsVisible) {
						setButtonsVisible(true);
					}
				}
				
				if (update.replaceContent && update.delta) {
					setCurrentContent(update.delta);
				}
				
				// Track streaming completion to control button visibility
				if (update.isComplete !== undefined) {
					setStreamingComplete(update.isComplete);
				}
			}
		});
	});

	useEffect(() => {
		return () => {
			streamingUpdateDisposable.dispose();
		};
	}, [streamingUpdateDisposable]);

	useEffect(() => {
		if (functionType === 'search_replace') {
		}
	}, [diffData, currentContent, functionType, widgetInfo.messageId]);

	useEffect(() => {
		if (widgetInfo.autoAccept && (functionType === 'search_replace' || functionType === 'delete_file')) {
			const timeoutId = setTimeout(() => {
				handlers.onAccept?.(widgetInfo.messageId, currentContent);
			}, 0);
			
			return () => clearTimeout(timeoutId);
		}
		return () => {};
	}, [widgetInfo.autoAccept, functionType, widgetInfo.messageId, currentContent, handlers]);

	const handleAccept = () => {
		handlers.onAccept?.(widgetInfo.messageId, currentContent);
	};

	const handleCancel = () => {
		handlers.onCancel?.(widgetInfo.messageId);
	};



	const handleCopyToClipboard = async () => {
		let textToCopy = '';
		
		if (functionType === 'run_console_cmd' || functionType === 'run_terminal_cmd') {
			textToCopy = currentContent;
		} else if (functionType === 'run_file') {
			textToCopy = currentContent;
		} else if (functionType === 'search_replace') {
			if (diffData && diffData.diff_data) {
				const resultLines = diffData.diff_data
					.filter((item: any) => item.type === 'added' || item.type === 'unchanged')
					.map((item: any) => item.content)
					.join('\n');
				textToCopy = resultLines;
			}
		}
		
		await services.clipboardService.writeText(textToCopy);
	};

	const getWidgetTitleInfo = () => {
		switch (functionType) {
			case 'run_console_cmd': 
				return { title: 'Console', filename: null, diffStats: null };
			case 'run_terminal_cmd': 
				return { title: 'Terminal', filename: null, diffStats: null };
			case 'search_replace': 
				return { 
					title: null, 
					filename: widgetInfo.filename || 'Search & Replace', 
					diffStats: widgetInfo.diffStats || null 
				};
			case 'delete_file':
				return {
					title: 'Delete',
					filename: widgetInfo.filename || 'File',
					diffStats: null
				};
			case 'run_file':
				const fileName = widgetInfo.filename ? commonUtils.getBasename(widgetInfo.filename) : 'Execute';
				const lineNumbers = (widgetInfo.startLine && widgetInfo.endLine) 
					? ` (${widgetInfo.startLine}-${widgetInfo.endLine})`
					: '';
				return {
					title: fileName + lineNumbers,
					filename: null,
					diffStats: null
				};
			default: 
				return { title: functionType, filename: null, diffStats: null };
		}
	};

	const getPromptSymbol = () => {
		return (functionType === 'run_console_cmd' || functionType === 'run_file') ? '>' : '$';
	};

	const isConsoleOrTerminal = functionType === 'run_console_cmd' || functionType === 'run_terminal_cmd' || functionType === 'run_file';
	const buttonLabel = functionType === 'search_replace' ? 'Accept' : functionType === 'delete_file' ? 'Delete' : 'Run';
	const titleInfo = getWidgetTitleInfo();

	if (functionType === 'delete_file') {
		return (
			<div className="delete-file-widget-custom">
				<div className="delete-file-content">
					<span className="delete-file-text">Delete: {widgetInfo.filename}</span>
					{buttonsVisible && streamingComplete && (
						<div className="delete-file-buttons">
							<button 
								className="delete-file-btn delete-file-btn-primary"
								onClick={handleAccept}
								title="Delete file"
							>
								<span className="codicon codicon-trash"></span>
							</button>
							<button 
								className="delete-file-btn delete-file-btn-cancel"
								onClick={handleCancel}
								title="Cancel delete"
							>
								<span className="codicon codicon-close"></span>
							</button>
						</div>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="erdos-ai-widget-wrapper">
			<div className={`erdos-ai-widget erdos-ai-${functionType}-widget ${!isExpanded ? 'widget-collapsed' : ''}`}>
				<div className="widget-header">
					<div className="widget-header-content">
						{titleInfo.title && <span>{titleInfo.title}</span>}
						{titleInfo.filename && (
							<>
								<span>{titleInfo.filename}</span>
								{titleInfo.diffStats && (
									<span className="diff-stats">
										<span className="addition">+{titleInfo.diffStats.added}</span>
										{' '}
										<span className="removal">-{titleInfo.diffStats.deleted}</span>
									</span>
								)}
							</>
						)}
					</div>
					<div className="widget-header-actions">
						<button
							className="clipboard-icon"
							onClick={handleCopyToClipboard}
							title={`Copy ${functionType === 'search_replace' ? 'result lines' : 'content'} to clipboard`}
						>
							<span className="codicon codicon-copy"></span>
						</button>
						<button
							className="expand-contract-icon"
							onClick={() => setIsExpanded(!isExpanded)}
							title={isExpanded ? 'Collapse widget' : 'Expand widget'}
						>
							<span className={`codicon ${isExpanded ? 'codicon-chevron-up' : 'codicon-chevron-down'}`}></span>
						</button>
					</div>
				</div>

				{isExpanded && (
					<div className="widget-main-container">
						<div className="widget-content">
						{isConsoleOrTerminal ? (
							<div className="console-prompt-container">
								<span className="console-prompt">
									{getPromptSymbol()}
								</span>
                                <textarea
                                    ref={consoleTextareaRef}
                                    className="console-input"
                                    rows={1}
                                    value={currentContent}
                                    onChange={(e) => {
                                        setCurrentContent(e.target.value);
                                        const el = e.currentTarget as HTMLTextAreaElement;
                                        el.style.height = 'auto';
                                        const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
                                        const contentLines = (e.target.value || '').split('\n').length;
                                        const maxLines = 6;
                                        const heightLines = Math.min(contentLines, maxLines);
                                        const newHeight = lineHeight * heightLines;
                                        el.style.height = `${newHeight}px`;
                                    }}
                                />
							</div>
						) : functionType === 'search_replace' ? (
							<div className="search-replace-widget-container">
								<DiffHighlighter
									content={currentContent || 'Loading search and replace content...'}
									diffData={diffData}
									filename={widgetInfo.filename}
									language="typescript"
									isReadOnly={true}
								/>
							</div>
						) : (
							<textarea
								className="file-content-input"
								value={currentContent}
								onChange={(e) => setCurrentContent(e.target.value)}
							/>
						)}
					</div>
				</div>
			)}
			</div>

			{buttonsVisible && streamingComplete && (
				<div className="widget-button-stack-container">
					<div className="widget-button-stack">
						<button
							className="widget-button widget-button-primary"
							onClick={handleAccept}
						>
							{buttonLabel}
						</button>
						<button
							className="widget-button widget-button-cancel"
							onClick={handleCancel}
						>
							Cancel
						</button>
					</div>
				</div>
			)}
		</div>
	);
};

const WIDGET_FUNCTIONS = ['run_console_cmd', 'run_terminal_cmd', 'search_replace', 'delete_file', 'run_file'] as const;

function parseFunctionArgs(functionCall: any, defaultValue: any = {}): any {
	if (!functionCall || typeof functionCall.arguments !== 'string') {
		return defaultValue;
	}
	
	try {
		const parsed = JSON.parse(functionCall.arguments || '{}');
		return parsed !== null && typeof parsed === 'object' ? parsed : defaultValue;
	} catch (error) {
		console.warn('Failed to parse function call arguments:', error);
		return defaultValue;
	}
}

function extractCleanedCommand(functionName: string, args: any): string {
	if (!args || !args.command) return '';
	
	let command = args.command;
	
	if (functionName === 'run_console_cmd') {
		command = command.replace(/^```(?:[rR]?[mM]?[dD]?|python|py)?\s*\n?/g, '');
		command = command.replace(/\n?```\s*$/g, '');
		command = command.replace(/```\n/g, '');
		command = command.trim();
	} else if (functionName === 'run_terminal_cmd') {
		command = command.replace(/^```(?:shell|bash|sh)?\s*\n?/g, '');
		command = command.replace(/\n?```\s*$/g, '');
		command = command.replace(/```\n/g, '');
		command = command.trim();
	}
	
	return command;
}

function formatSearchReplaceContent(args: any, commonUtils: ICommonUtils): string {
	const filename = args.file_path || '';
	const oldString = args.old_string || '';
	const newString = args.new_string || '';
	
	const commentSyntax = filename ? commonUtils.getCommentSyntax(filename) : '# ';
	
	let result = `${commentSyntax}Old content\n${oldString}`;
	result += `\n\n${commentSyntax}New content\n${newString}`;
	
	return result;
}

function formatFunctionCallMessage(functionCall: any, commonUtils: ICommonUtils, currentConversation?: Conversation | null): string {
	const args = parseFunctionArgs(functionCall);
	
	switch (functionCall.name) {
		case 'read_file':
			const readFilename = args.filename ? commonUtils.getBasename(args.filename) : 'unknown';
			let lineInfo = '';
			if (args.should_read_entire_file) {
				lineInfo = ' (1-end)';
			} else if (args.start_line_one_indexed && args.end_line_one_indexed_inclusive) {
				lineInfo = ` (${args.start_line_one_indexed}-${args.end_line_one_indexed_inclusive})`;
			} else if (args.start_line_one_indexed) {
				lineInfo = ` (${args.start_line_one_indexed}-end)`;
			} else if (args.end_line_one_indexed_inclusive) {
				lineInfo = ` (1-${args.end_line_one_indexed_inclusive})`;
			}
			return `Read ${readFilename}${lineInfo}`;
			
		case 'search_for_file':
			return `Searched for files matching "${args.query || 'unknown'}"`;
			
		case 'list_dir':
			const path = args.relative_workspace_path || '.';
			const displayPath = path === '.' ? 'the current directory' : path;
			return `Listed contents of ${displayPath}`;
			
		case 'grep_search':
			const pattern = args.query || 'unknown';
			const displayPattern = pattern.length > 50 ? pattern.substring(0, 50) + '...' : pattern;
			
			let patternsInfo = '';
			if (args.include_pattern || args.exclude_pattern) {
				const parts = [];
				if (args.include_pattern) parts.push(`include: ${args.include_pattern}`);
				if (args.exclude_pattern) parts.push(`exclude: ${args.exclude_pattern}`);
				patternsInfo = ` (${parts.join(', ')})`;
			}
			
			return `Searched pattern "${displayPattern}"${patternsInfo}`;
			
		case 'delete_file':
			// For conversation log messages, check for related output first
			if (currentConversation && functionCall.msg_id) {
				const relatedOutput = currentConversation.messages.find((msg: ConversationMessage) => 
					msg.type === 'function_call_output' && 
					msg.related_to === functionCall.msg_id
				);
				if (relatedOutput && relatedOutput.output) {
					return relatedOutput.output;
				}
			}
			return `Delete ${args.filename || 'unknown'}`;

		case 'search_replace':
			const searchReplaceFilePath = args.file_path || args.filename || 'unknown';
			const searchReplaceFilename = searchReplaceFilePath ? commonUtils.getBasename(searchReplaceFilePath) : 'unknown';
			return `Model failed to edit ${searchReplaceFilename}`;

		default:
			return functionCall.name.replace(/_/g, ' ');
	}
}

async function executeWidgetActionWithRequestId(
	actionType: 'accept' | 'cancel',
	functionName: string,
	erdosAiService: IErdosAiServiceCore,
	erdosAiFullService: IErdosAiServiceCore | undefined,
	messageId: number,
	requestId: string,
	content?: string
): Promise<void> {
	
	// Set the widget decision
	erdosAiService.setWidgetDecision(functionName, messageId, actionType, content, requestId);
	
	// Signal the persistent processing loop to continue instead of starting a new loop
	erdosAiService.signalProcessingContinuation();
}

function createWidgetHandlers(
	functionName: string, 
	erdosAiService: IErdosAiServiceCore,
	erdosAiFullService: IErdosAiServiceCore | undefined,
	erdosAiAutomationService: IErdosAiAutomationService,
	requestId: string,
	setIsAiProcessing?: (processing: boolean) => void,

): IErdosAiWidgetHandlers {
	return {
		onAccept: async (messageId: number, content: string) => {
			try {
				// Fire button action to hide buttons immediately
				erdosAiService.fireWidgetButtonAction(messageId, 'hide');
				
				await executeWidgetActionWithRequestId('accept', functionName, erdosAiService, erdosAiFullService, messageId, requestId, content);
			} catch (error) {
				console.error('Failed to accept widget command:', error);
				// State machine will handle processing state - no manual override needed
			}
		},
		onCancel: async (messageId: number) => {
			try {
				// Fire button action to hide buttons immediately
				erdosAiService.fireWidgetButtonAction(messageId, 'hide');
				
				await executeWidgetActionWithRequestId('cancel', functionName, erdosAiService, erdosAiFullService, messageId, requestId);
			} catch (error) {
				console.error('Failed to cancel widget command:', error);
				// State machine will handle processing state - no manual override needed
			}
		},
		onAllowList: async (messageId: number, content: string) => {
			try {
				// Fire button action to hide buttons immediately
				erdosAiService.fireWidgetButtonAction(messageId, 'hide');
				
				if (functionName === 'search_replace') {
					try {
						await erdosAiAutomationService.setAutoAcceptEdits(true);
					} catch (error) {
						console.error('[REACT] Failed to enable auto-accept edits:', error);
					}
				}
				
				if (functionName === 'delete_file') {
					try {
						await erdosAiAutomationService.setAutoDeleteFiles(true);
					} catch (error) {
						console.error('[REACT] Failed to enable auto-delete files:', error);
					}
				}
				
				await executeWidgetActionWithRequestId('accept', functionName, erdosAiService, erdosAiFullService, messageId, requestId, content);
			} catch (error) {
				console.error('Failed to accept widget command:', error);
				// State machine will handle processing state - no manual override needed
			}
		}
	};
}

function createWidgetInfo(
	message: ConversationMessage,
	functionName: string,
	args: any,
	initialContent: string,
	handlers: IErdosAiWidgetHandlers,
	diffData?: any,
	showButtons?: boolean
): IErdosAiWidgetInfo {
	const widgetInfo: IErdosAiWidgetInfo = {
		messageId: message.id,
		requestId: message.request_id || `req_${message.id}`,
		functionCallType: functionName as 'search_replace' | 'run_console_cmd' | 'run_terminal_cmd' | 'delete_file' | 'run_file',
		filename: functionName === 'search_replace' 
			? undefined
			: args.filename || args.file_path || undefined,
		initialContent: initialContent,
		language: functionName === 'run_console_cmd' ? 'r' : 'shell',
		startLine: args.start_line_one_indexed,
		endLine: args.end_line_one_indexed_inclusive,
		...(showButtons !== undefined && { showButtons })
	};

	if (diffData && diffData.clean_filename) {
		widgetInfo.filename = diffData.clean_filename;
		widgetInfo.diffStats = {
			added: diffData.added || 0,
			deleted: diffData.deleted || 0
		};
	}

	return widgetInfo;
}

// Utility functions for incremental message updates
function smartMergeMessages(currentMessages: ConversationMessage[], newMessages: ConversationMessage[]): ConversationMessage[] {
	// Create a map of current messages by ID for fast lookup
	const currentMap = new Map(currentMessages.map(m => [m.id, m]));
	const result: ConversationMessage[] = [];
	
	// Add/update messages from newMessages
	for (const newMessage of newMessages) {
		result.push(newMessage);
		currentMap.delete(newMessage.id); // Remove from current map to avoid duplicates
	}
	
	// Add any remaining current messages that weren't in newMessages (shouldn't happen in normal flow)
	for (const [, currentMessage] of currentMap) {
		if (!result.some(m => m.id === currentMessage.id)) {
			result.push(currentMessage);
		}
	}
	
	// Sort by ID to maintain order
	return result.sort((a, b) => a.id - b.id);
}

function updateSingleMessage(currentMessages: ConversationMessage[], updatedMessage: ConversationMessage): ConversationMessage[] {
	const exists = currentMessages.some(m => m.id === updatedMessage.id);
	
	if (exists) {
		// Update existing message
		return currentMessages.map(m => m.id === updatedMessage.id ? updatedMessage : m);
	} else {
		// Add new message and sort
		return [...currentMessages, updatedMessage].sort((a, b) => a.id - b.id);
	}
}

function filterMessagesForDisplay(messagesToFilter: ConversationMessage[], allMessages?: ConversationMessage[]): ConversationMessage[] {
	
	const contextMessages = allMessages || messagesToFilter;
	
	const filtered = messagesToFilter.filter(message => {
		if (message.procedural) {
			return false;
		}
		
		if (message.type === 'function_call_output') {
			const relatedMessage = contextMessages.find(m => m.id === message.related_to);
			if (relatedMessage && relatedMessage.function_call && relatedMessage.function_call.name === 'search_replace') {
				const success = (message as any).success;
				return success === false;
			}
			return false;
		}
		
		if (message.role === 'user') {
			return true;
		}
		
		if (message.function_call && message.function_call.name) {
			const functionName = message.function_call.name;
			
			const nonWidgetFunctions = ['grep_search', 'read_file', 'view_image', 'search_for_file', 'list_dir'];
			if (nonWidgetFunctions.includes(functionName)) {
				return true;
			}
			
			const allWidgetFunctions = [...WIDGET_FUNCTIONS, 'delete_file', 'run_file'];
			if (allWidgetFunctions.includes(functionName as any)) {
				return true;
			}
			
			return true;
		}
		
		if (message.role === 'assistant') {
			return true;
		}
		
		if (message.type === 'assistant' && (message as any).web_search_call) {
			return true;
		}
		
		return false;
	});
	
	return filtered;
}

interface HistoryDropdownProps {
	erdosAiService: IErdosAiServiceCore;
	isOpen: boolean;
	onClose: () => void;
	onSelectConversation: (conversationId: string) => void;
	buttonRef: React.RefObject<HTMLButtonElement>;
}

const HistoryDropdown = (props: HistoryDropdownProps) => {
	const [conversations, setConversations] = useState<ConversationInfo[]>([]);
	const [filteredConversations, setFilteredConversations] = useState<ConversationInfo[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState('');
	const [editingId, setEditingId] = useState<number | null>(null);
	const [editingName, setEditingName] = useState('');
	const dropdownRef = useRef<HTMLDivElement>(null);

	const loadConversations = async () => {
		try {
			setIsLoading(true);
			const conversationInfos = await props.erdosAiService.listConversations();
			const sorted = conversationInfos.sort((a, b) => b.id - a.id);
			setConversations(sorted);
			setFilteredConversations(sorted);
		} catch (error) {
			console.error('Failed to load conversations:', error);
			setConversations([]);
			setFilteredConversations([]);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		if (props.isOpen) {
			loadConversations();
		}
	}, [props.isOpen, props.erdosAiService]);

	useEffect(() => {
		const filtered = conversations.filter(conv => 
			conv.name.toLowerCase().includes(searchQuery.toLowerCase())
		);
		setFilteredConversations(filtered);
	}, [conversations, searchQuery]);

	useEffect(() => {
		if (props.isOpen && dropdownRef.current && props.buttonRef.current) {
			const buttonRect = props.buttonRef.current.getBoundingClientRect();
			const dropdown = dropdownRef.current;
			const dropdownWidth = Math.max(320, buttonRect.width);
			
			let leftPosition = buttonRect.left;
			const rightEdge = leftPosition + dropdownWidth;
			const windowWidth = window.innerWidth;
			
			if (rightEdge > windowWidth) {
				leftPosition = buttonRect.right - dropdownWidth;
				if (leftPosition < 0) {
					leftPosition = 8;
				}
			}
			
			dropdown.style.top = `${buttonRect.bottom + 4}px`;
			dropdown.style.left = `${leftPosition}px`;
			dropdown.style.minWidth = `${dropdownWidth}px`;
		}
	}, [props.isOpen, props.buttonRef]);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
				props.buttonRef.current && !props.buttonRef.current.contains(event.target as Node)) {
				props.onClose();
			}
		};

		if (props.isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
		
		return () => {};
	}, [props.isOpen, props.onClose, props.buttonRef]);

	const handleRename = async (id: number, newName: string) => {
		if (newName.trim() && newName !== conversations.find(c => c.id === id)?.name) {
			try {
				await props.erdosAiService.renameConversation(id, newName.trim());
				await loadConversations();
			} catch (error) {
				console.error('Failed to rename conversation:', error);
			}
		}
		setEditingId(null);
		setEditingName('');
	};

	const handleDelete = async (id: number) => {
		if (confirm('Are you sure you want to delete this conversation?')) {
			try {
				await props.erdosAiService.deleteConversation(id);
				await loadConversations();
			} catch (error) {
				console.error('Failed to delete conversation:', error);
			}
		}
	};

	const handleDeleteAll = async () => {
		if (confirm('Are you sure you want to delete ALL conversations? This action cannot be undone.')) {
			try {
				await props.erdosAiService.deleteAllConversations();
				await loadConversations();
			} catch (error) {
				console.error('Failed to delete all conversations:', error);
			}
		}
	};

	const startEditing = (conv: ConversationInfo) => {
		setEditingId(conv.id);
		setEditingName(conv.name);
	};

	if (!props.isOpen) return null;

	return (
		<div 
			ref={dropdownRef}
			className="erdos-ai-history-dropdown"
		>
			<div className="erdos-ai-history-header">
				<input
					type="text"
					className="erdos-ai-history-search"
					placeholder="Search conversations..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					autoFocus
				/>
			</div>
			
			<div className="erdos-ai-history-list">
				{isLoading ? (
					<div className="erdos-ai-history-item erdos-ai-history-loading">
						Loading conversations...
					</div>
				) : filteredConversations.length === 0 ? (
					<div className="erdos-ai-history-item erdos-ai-history-empty">
						{searchQuery ? 'No conversations match your search.' : 'No conversations found.'}
					</div>
				) : (
					filteredConversations.map(conv => (
						<div key={conv.id} className="erdos-ai-history-item">
							{editingId === conv.id ? (
								<input
									type="text"
									className="erdos-ai-history-edit-input"
									value={editingName}
									onChange={(e) => setEditingName(e.target.value)}
									onBlur={() => handleRename(conv.id, editingName)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											handleRename(conv.id, editingName);
										} else if (e.key === 'Escape') {
											setEditingId(null);
											setEditingName('');
										}
									}}
									autoFocus
								/>
							) : (
								<>
									<div 
										className="erdos-ai-history-name"
										onClick={() => props.onSelectConversation(conv.id.toString())}
									>
										{conv.name}
									</div>
									<div className="erdos-ai-history-date">
										{new Date(conv.created_at).toLocaleString(undefined, {
											month: 'short',
											day: 'numeric',
											hour: 'numeric',
											minute: '2-digit',
											hour12: true
										})}
									</div>
									<div className="erdos-ai-history-actions">
										<button
											className="erdos-ai-history-action-btn"
											onClick={(e) => {
												e.stopPropagation();
												startEditing(conv);
											}}
											title="Rename conversation"
										>
											<span className="codicon codicon-edit"></span>
										</button>
										<button
											className="erdos-ai-history-action-btn erdos-ai-history-delete-btn"
											onClick={(e) => {
												e.stopPropagation();
												handleDelete(conv.id);
											}}
											title="Delete conversation"
										>
											<span className="codicon codicon-trash"></span>
										</button>
									</div>
								</>
							)}
						</div>
					))
				)}
			</div>
			
			{!isLoading && conversations.length > 0 && (
				<div className="erdos-ai-history-footer">
					<button
						className="erdos-ai-history-delete-all-btn"
						onClick={handleDeleteAll}
						title="Delete all conversations"
					>
						Delete All Conversations
					</button>
				</div>
			)}
		</div>
	);
};

// Memoized components to prevent unnecessary re-renders
const MemoizedWidgetWrapper = memo(WidgetWrapper);

interface UserMessageProps {
	message: ConversationMessage;
	isEditing: boolean;
	editingContent: string;
	editTextareaRef: React.RefObject<HTMLTextAreaElement>;
	onEditMessage: (messageId: number, content: string) => void;
	onRevertToMessage: (messageId: number) => void;
	onEditingContentChange: (content: string) => void;
	onEditKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	onEditBlur: () => void;
	calculateAndSetTextareaHeight: (textarea: HTMLTextAreaElement, content: string) => void;
}

const UserMessage = memo<UserMessageProps>(({ 
	message, 
	isEditing, 
	editingContent, 
	editTextareaRef, 
	onEditMessage, 
	onRevertToMessage, 
	onEditingContentChange,
	onEditKeyDown,
	onEditBlur,
	calculateAndSetTextareaHeight
}) => {
	// Track if this is the initial edit to avoid reselecting text on every change
	const isInitialEditRef = useRef(false);
	
	// Handle height calculation and focus after DOM updates
	useLayoutEffect(() => {
		if (isEditing && editTextareaRef.current && editingContent !== undefined) {
			const textarea = editTextareaRef.current;
			
			// Only focus and select on the initial edit, not on every content change
			if (!isInitialEditRef.current) {
				textarea.focus();
				textarea.select();
				isInitialEditRef.current = true;
			}
			
			// Always calculate and set proper height
			calculateAndSetTextareaHeight(textarea, editingContent);
		}
		
		// Reset the initial edit flag when exiting edit mode
		if (!isEditing) {
			isInitialEditRef.current = false;
		}
	}, [isEditing, editingContent, editTextareaRef, calculateAndSetTextareaHeight]);
	
	return (
		<div className={`erdos-ai-message user ${isEditing ? 'editing' : ''}`}>
			{isEditing ? (
				<textarea
					ref={editTextareaRef}
					className="erdos-ai-message-edit-textarea"
					value={editingContent}
					onChange={(e) => {
						const newValue = e.target.value;
						onEditingContentChange(newValue);
						
						// Use the same height calculation function
						const textarea = e.currentTarget as HTMLTextAreaElement;
						calculateAndSetTextareaHeight(textarea, newValue);
					}}
					onKeyDown={onEditKeyDown}
					onBlur={onEditBlur}
				/>
			) : (
				<>
					<div 
						className="erdos-ai-message-content"
						onClick={() => onEditMessage(message.id, message.content || '')}
						title="Click to edit this message"
						ref={(el) => {
							// Check if content would need clamping (exceeds 4 lines)
							if (el) {
								// Temporarily measure natural height
								const originalDisplay = el.style.display;
								const originalMaxHeight = el.style.maxHeight;
								const originalLineClamp = el.style.webkitLineClamp;
								
								// Reset to natural layout to measure
								el.style.display = 'block';
								el.style.maxHeight = 'none';
								el.style.webkitLineClamp = 'none';
								
								// Calculate if content exceeds 4 lines
								const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
								const maxHeight = lineHeight * 4;
								const needsClamping = el.scrollHeight > maxHeight;
								
								// Restore original styles
								el.style.display = originalDisplay;
								el.style.maxHeight = originalMaxHeight;
								el.style.webkitLineClamp = originalLineClamp;
								
								el.setAttribute('data-clamped', needsClamping.toString());
							}
						}}
					>
						{message.content || ''}
					</div>
					<div 
						className="erdos-ai-revert-icon"
						onClick={() => onRevertToMessage(message.id)}
						title="Delete this message and all messages after it"
					>
						<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
							<path d="M 5 11 L 11 11 A 3 3 0 0 0 11 5 L 5 5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
							<path d="M 4.5 5 L 8.5 2.0 M 4.5 5 L 8.5 8.0" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
						</svg>
					</div>
				</>
			)}
		</div>
	);
}, (prevProps, nextProps) => {
	// Custom comparison for memo - only re-render if relevant props change
	return (
		prevProps.message.id === nextProps.message.id &&
		prevProps.message.content === nextProps.message.content &&
		prevProps.isEditing === nextProps.isEditing &&
		prevProps.editingContent === nextProps.editingContent &&
		prevProps.editTextareaRef === nextProps.editTextareaRef
	);
});

interface AssistantMessageProps {
	message: ConversationMessage;
	markdownRenderer: ErdosAiMarkdownRenderer | null;
}

const AssistantMessage = memo<AssistantMessageProps>(({ message, markdownRenderer }) => {
	const content = message.content || '';
	return (
		<div className="erdos-ai-message assistant">
			{markdownRenderer ? (
				<ErdosAiMarkdownComponent
					content={content}
					isStreaming={false}
					renderer={markdownRenderer}
					className="erdos-ai-message-content"
				/>
			) : (
				content
			)}
		</div>
	);
});

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
	
	// User message editing state
	const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
	const [editingContent, setEditingContent] = useState<string>('');
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
	
	// Stable callback functions for memoized components
	const handleEditingContentChange = useCallback((content: string) => {
		setEditingContent(content);
	}, []);
	
	const handleCancelEdit = useCallback(() => {
		setEditingMessageId(null);
		setEditingContent('');
	}, []);

	const handleSaveEdit = useCallback(async () => {
		if (editingMessageId === null) return;
		
		try {
			// Update the message content through the service
			await props.erdosAiService.updateMessageContent(editingMessageId, editingContent);
			
			// Refresh conversation to show updated content
			const updatedConversation = props.erdosAiService.getCurrentConversation();
			if (updatedConversation) {
				setCurrentConversation({...updatedConversation});
				const displayableMessages = filterMessagesForDisplay(updatedConversation.messages);
				setMessages(prev => smartMergeMessages(prev, displayableMessages));
			}
			
			// Exit edit mode
			setEditingMessageId(null);
			setEditingContent('');
		} catch (error) {
			console.error('Failed to update message:', error);
		}
	}, [editingMessageId, editingContent, props.erdosAiService]);
	
	const handleEditAndContinue = useCallback(async () => {
		if (editingMessageId === null || !editingContent.trim()) {
			return;
		}

		const confirmed = confirm(
			'Would you like to revert and continue from this point?\n\nThis will delete all messages after this one and send your edited message as a new query.'
		);
		
		if (!confirmed) {
			return;
		}

		try {
			// Store the new message content
			const newMessageContent = editingContent.trim();
			
			// Exit edit mode first
			setEditingMessageId(null);
			setEditingContent('');
			
			// Revert to the message being edited
			const result = await props.erdosAiService.revertToMessage(editingMessageId);
			if (result.status === 'error') {
				console.error('Failed to revert conversation:', result.message);
				alert('Failed to revert conversation: ' + (result.message || 'Unknown error'));
				return;
			}
			
			// Ensure we have a conversation
			if (!currentConversation) {
				await props.erdosAiService.newConversation();
			}

			// Set the input value and send the edited message as a new query
			// State machine will handle processing state
			setInputValue(newMessageContent);
			// Use setTimeout to ensure state is updated before sending
			setTimeout(async () => {
				await props.erdosAiService.sendMessage(newMessageContent);
				setInputValue(''); // Clear after sending
			}, 0);

		} catch (error) {
			console.error('Failed to edit and continue:', error);
			alert('Failed to edit and continue: ' + (error instanceof Error ? error.message : 'Unknown error'));
		}
	}, [editingMessageId, editingContent, currentConversation, props.erdosAiService]);
	
	const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			handleCancelEdit();
		} else if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleEditAndContinue();
		}
	}, [handleCancelEdit, handleEditAndContinue]);
	
	const handleEditBlur = useCallback(async () => {
		// Auto-save when user clicks out or loses focus
		if (editingMessageId !== null) {
			await handleSaveEdit();
		}
	}, [editingMessageId, handleSaveEdit]);
	

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
	
	// Memoize image attachment component to avoid complex IIFE in JSX
	const imageAttachmentComponent = useMemo(() => {
		if (!props.fileDialogService) {
			return (
				<button 
					className="image-attachment-button"
					disabled
					title="File dialog service not available"
				>
					<span className="codicon codicon-graph"></span>
				</button>
			);
		}
		
		if (!currentConversation) {
			return (
				<button 
					className="image-attachment-button"
					onClick={async () => {
						try {
							await props.erdosAiService.newConversation();
						} catch (error) {
							console.error('Failed to create conversation:', error);
						}
					}}
					title="Create conversation to attach images"
				>
					<span className="codicon codicon-graph"></span>
				</button>
			);
		}
		
		const imageService = services.imageAttachmentService;
		if (!imageService) {
			console.error('Image service should be available when conversation exists');
			return (
				<button 
					className="image-attachment-button"
					disabled
					title="Image service unavailable"
				>
					<span className="codicon codicon-graph"></span>
				</button>
			);
		}

		return (
			<ImageAttachmentToolbar
				key={`image-attachment-${currentConversation.info.id}`}
				imageAttachmentService={imageService}
				fileDialogService={props.fileDialogService!}
				erdosPlotsService={props.erdosPlotsService}
				onError={(message) => {
					console.error('Image attachment error:', message);
				}}
			/>
		);
	}, [props.fileDialogService, currentConversation, services.imageAttachmentService, props.erdosAiService, props.erdosPlotsService]);
	
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



	// Note: Removed populateRunFileContent useEffect - run_file content is now extracted synchronously during widget creation

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

	const handleSendMessage = async () => {
		if (!inputValue.trim()) {
			return;
		}

		const messageContent = inputValue.trim();
		
		// Re-enable scroll lock when user sends a new message (like GitHub Copilot)
		setScrollLock(true);
		
		if (isAiProcessing) {
			try {
				await props.erdosAiService.cancelStreaming();
				
				const updatedConversation = props.erdosAiService.getCurrentConversation();
				if (updatedConversation) {
					setCurrentConversation({...updatedConversation});
					const displayableMessages = filterMessagesForDisplay(updatedConversation.messages);
					// After canceling, refresh with current conversation state (replace)
					setMessages(displayableMessages);
				}
				
				await new Promise(resolve => setTimeout(resolve, 50));
				
			} catch (error) {
				console.error('Failed to cancel before sending new message:', error);
			}
		}
		
		setInputValue('');

		try {
			if (!currentConversation) {
				await props.erdosAiService.newConversation();
			}

			// State machine will handle processing state
			await props.erdosAiService.sendMessage(messageContent);

		} catch (error) {
			console.error('Failed to send message:', error);
		}
	};

	const handleKeyPress = (event: React.KeyboardEvent) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSendMessage();
		}
	};

	const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
		setInputValue(event.target.value);
		
		const textarea = event.target;
		textarea.style.height = 'auto';
		const scrollHeight = Math.min(textarea.scrollHeight, 120);
		textarea.style.height = `${Math.max(scrollHeight, 24)}px`;
	};

	const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {

		if (!event.clipboardData) {
			return;
		}

		const pastedText = event.clipboardData.getData('text/plain');
		
		if (!pastedText || pastedText.trim().length === 0) {
			return;
		}

		try {
			const matchResult = await services.documentServiceIntegration.checkPastedTextInOpenDocuments(pastedText);
			
			if (matchResult) {
				
				const contextService = services.contextService;
				
				let uri: URI;
				if (matchResult.filePath.startsWith('__UNSAVED_')) {
					uri = URI.parse(`untitled:${matchResult.filePath}`);
				} else {
					uri = URI.file(matchResult.filePath);
				}
				
				const success = await contextService.addFileContext(uri, matchResult.startLine, matchResult.endLine);
				
				if (success) {
					
					event.preventDefault();
					
					const currentValue = inputValue;
					let newValue = currentValue;
					
					if (!currentValue || currentValue.trim().length === 0) {
						newValue = '';
					} else {
						newValue = currentValue.replace(pastedText, '');
					}
					
					setInputValue(newValue);
				} else {
				}
			}
		} catch (error) {
			console.error('DEBUG: Error processing pasted text:', error);
		}
	};

	const handleCancelStreaming = async () => {
		try {
			// State machine will handle processing state when cancellation completes
			await props.erdosAiService.cancelStreaming();
		} catch (error) {
			console.error('%c[REACT CANCEL] Failed to cancel streaming:', 'color: red; font-weight: bold', error);
		}
	};

	const handleRevertToMessage = async (messageId: number) => {
		const confirmed = confirm(
			'This will delete this message and all messages after it in the conversation. This cannot be undone.\n\nDo you want to continue?'
		);
		
		if (!confirmed) {
			return;
		}

		try {
			const result = await props.erdosAiService.revertToMessage(messageId);
			if (result.status === 'error') {
				console.error('Failed to revert conversation:', result.message);
				alert('Failed to revert conversation: ' + (result.message || 'Unknown error'));
			}
		} catch (error) {
			console.error('Failed to revert conversation:', error);
			alert('Failed to revert conversation: ' + (error instanceof Error ? error.message : 'Unknown error'));
		}
	};

	// Helper function to calculate and set textarea height
	const calculateAndSetTextareaHeight = useCallback((textarea: HTMLTextAreaElement, content: string) => {
		// Reset height to auto to get accurate scrollHeight measurement
		textarea.style.height = 'auto';
		
		// Use the actual scrollHeight from the DOM, which accounts for text wrapping
		// This is more accurate than just counting newline characters
		const actualScrollHeight = textarea.scrollHeight;
		const maxHeight = 120; // Match CSS max-height
		const minHeight = 18.2; // At least 1 line (13px * 1.4)
		
		// Use the browser-calculated scroll height, clamped to our min/max bounds
		const newHeight = Math.max(minHeight, Math.min(actualScrollHeight, maxHeight));
		
		textarea.style.height = `${newHeight}px`;
		textarea.style.setProperty('height', `${newHeight}px`, 'important');
	}, []);

	// User message editing handlers
	const handleEditMessage = (messageId: number, currentContent: string) => {
		setEditingMessageId(messageId);
		setEditingContent(currentContent);
	};

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
				<WidgetWrapper 
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
			<WidgetWrapper 
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

			<div className="erdos-ai-input-part">
				<div className="erdos-ai-input-and-side-toolbar">
					<div className="erdos-ai-input-container">
						<div className="erdos-ai-editor-container">
							<textarea
								className="erdos-ai-input"
								placeholder="Ask Erdos anything..."
								value={inputValue}
								onChange={handleInputChange}
								onKeyDown={handleKeyPress}
								onPaste={handlePaste}
								rows={1}
							/>
						</div>
						<div className="erdos-ai-input-toolbars">
							<div className="image-attachment-wrapper">
								{imageAttachmentComponent}
							</div>
							{inputValue.trim() ? (
								<button
									className="erdos-ai-send-button"
									onClick={handleSendMessage}
									title="Send message (will stop current operation if needed)"
								>
									<span className="codicon codicon-send"></span>
								</button>
							) : isAiProcessing ? (
								<button
									className="erdos-ai-stop-button"
									onClick={() => {
										handleCancelStreaming();
									}}
									title="Stop generation"
								>
									<span className="codicon codicon-primitive-square"></span>
								</button>
							) : (
								<button
									className="erdos-ai-send-button"
									onClick={handleSendMessage}
									disabled={true}
									title="Enter a message to send"
								>
									<span className="codicon codicon-send"></span>
								</button>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
});