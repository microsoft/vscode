/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect } from 'react';
import { IReactComponentContainer } from '../../../../../base/browser/erdosReactRenderer.js';
import { IErdosAiService } from '../../common/erdosAiService.js';
import { ConversationMessage, Conversation, ConversationInfo } from '../conversation/conversationTypes.js';
import { StreamData } from '../api/streamingParser.js';
import { SettingsPanel } from './settingsPanel.js';
import { ErdosAiMarkdownComponent } from './erdosAiMarkdownRenderer.js';
import { ErdosAiMarkdownRenderer } from '../markdown/erdosAiMarkdownRenderer.js';
import { IErdosAiWidgetInfo, IErdosAiWidgetHandlers } from '../widgets/widgetTypes.js';
import { DiffHighlighter } from './diffHighlighter.js';
import { CommonUtils } from '../utils/commonUtils.js';
import { ContextBar } from './contextBar.js';
import { ErrorMessage } from './errorMessage.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { URI } from '../../../../../base/common/uri.js';
import '../widgets/erdosAiWidgets.css';
import './contextBar.css';
import './imageAttachment.css';
import '../erdosAiView.css';

import { PlotsIcon } from './plotsIcon.js';
import { ChevronIcon } from './chevronIcon.js';
import { IAttachedImage, IImageAttachmentService } from '../attachments/imageAttachmentService.js';

// import { IAutoAcceptService, AutoAcceptCheckResult } from '../services/autoAcceptService.js';
// import { AutoAcceptIntegration } from '../services/autoAcceptIntegration.js';

// React wrapper for widgets
interface WidgetWrapperProps {
	widgetInfo: IErdosAiWidgetInfo;
	handlers: IErdosAiWidgetHandlers;
	context: any;
	streamingContent: string;
	erdosAiService: IErdosAiService;
	diffData?: any; // Diff data for search_replace widgets
}

const WidgetWrapper: React.FC<WidgetWrapperProps> = ({ widgetInfo, handlers, context, streamingContent, erdosAiService, diffData: initialDiffData }) => {
	const functionType = widgetInfo.functionCallType;
	
	// Determine initial button visibility based on operation status
	const getInitialButtonVisibility = () => {
		// Hide buttons if auto-accept is enabled (widget will execute automatically)
		if (widgetInfo.autoAccept) {
			return false;
		}
		
		// For non-interactive functions, always show buttons
		if (functionType !== 'search_replace' && functionType !== 'delete_file') {
			return true;
		}
		
		// For interactive functions, check if operation was completed
		// This info should be passed in the widgetInfo if operation is from conversation log
		return (widgetInfo as any).showButtons !== false;
	};
	
    const [buttonsVisible, setButtonsVisible] = useState(getInitialButtonVisibility());
    const [currentContent, setCurrentContent] = useState(streamingContent);
    const [diffData, setDiffData] = useState<any>(initialDiffData || null);
    const consoleTextareaRef = useRef<HTMLTextAreaElement | null>(null);

    
    // Update local content when streaming content changes
    useEffect(() => {
        setCurrentContent(streamingContent);
    }, [streamingContent]);

    // Recalculate height when content changes (for dynamic sizing)
    useEffect(() => {
        if (consoleTextareaRef.current && currentContent !== undefined) {
            const el = consoleTextareaRef.current;
            el.style.height = 'auto';
            const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
            const contentLines = (currentContent || '').split('\n').length;
            const maxLines = 6; // Max 6 lines before scrolling
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
            const maxLines = 6; // Max 6 lines before scrolling
            const heightLines = Math.min(contentLines, maxLines);
            const newHeight = lineHeight * heightLines;
            el.style.height = `${newHeight}px`;
        }
    }, []);

	// Listen for button hide actions
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

	// Listen for diff data updates from streaming (like Rao's diff data propagation)
	useEffect(() => {
		const streamingUpdateDisposable = erdosAiService.onWidgetStreamingUpdate((update) => {
			
			if (update.messageId === widgetInfo.messageId) {
				if (update.diffData) {
					setDiffData(update.diffData);
				}
				
				if (update.replaceContent && update.delta) {
					setCurrentContent(update.delta);
				}
			}
		});

		return () => {
			streamingUpdateDisposable.dispose();
		};
	}, [erdosAiService, widgetInfo.messageId]);

	// Debug what's actually being passed to DiffHighlighter for search_replace
	useEffect(() => {
		if (functionType === 'search_replace') {
		}
	}, [diffData, currentContent, functionType, widgetInfo.messageId]);

	// Handle auto-accept functionality - schedule deferred execution like Rao
	useEffect(() => {
		if (widgetInfo.autoAccept && (functionType === 'search_replace' || functionType === 'delete_file')) {
			console.log(`[REACT] Auto-accept enabled for ${functionType}, scheduling deferred execution`);
			
			// Use setTimeout for deferred execution (similar to Rao's Scheduler.scheduleDeferred)
			const timeoutId = setTimeout(() => {
				console.log(`[REACT] Executing auto-accept for ${functionType}`);
				handlers.onAccept?.(widgetInfo.messageId, currentContent);
			}, 0); // Execute in next event loop iteration
			
			return () => clearTimeout(timeoutId);
		}
		// Return cleanup function even when not auto-accepting
		return () => {};
	}, [widgetInfo.autoAccept, functionType, widgetInfo.messageId, currentContent, handlers]);

	const handleAccept = () => {
		handlers.onAccept?.(widgetInfo.messageId, currentContent);
	};

	const handleCancel = () => {
		handlers.onCancel?.(widgetInfo.messageId);
	};

	const handleAllowList = () => {
		handlers.onAllowList?.(widgetInfo.messageId, currentContent);
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
				return {
					title: 'File',
					filename: widgetInfo.filename || 'Execute',
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

	// Special case: delete_file gets a completely different, compact layout
	if (functionType === 'delete_file') {
		return (
			<div className="delete-file-widget-compact">
				<span className="delete-file-text">Delete: {widgetInfo.filename}</span>
				{buttonsVisible && (
					<div className="delete-file-buttons">
						<button 
							className="delete-file-btn delete-file-confirm"
							onClick={handleAccept}
							title="Delete file"
						>
							✓
						</button>
						<button 
							className="delete-file-btn delete-file-cancel"
							onClick={handleCancel}
							title="Cancel"
						>
							✕
						</button>
						<button 
							className="delete-file-btn delete-file-allow-list"
							onClick={handleAllowList}
							title="Add to allow list and delete"
						>
							+
						</button>
					</div>
				)}
			</div>
		);
	}

	// Normal widget layout for all other function types
	return (
		<div className="erdos-ai-widget-wrapper">
			<div className={`erdos-ai-widget erdos-ai-${functionType}-widget`}>
				{/* Widget Header - compact like chat headers */}
				<div className="widget-header">
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

				{/* Widget Content Container */}
				<div className="widget-main-container">
					{/* Content Area */}
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
                                         const maxLines = 6; // Max 6 lines before scrolling
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
			</div>

			{/* Button stack below, aligned to bottom-right, outside widget box */}
			{buttonsVisible && (
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
						{/* <div className="widget-button-divider"></div>
						<button
							className="widget-button widget-button-allow-list"
							onClick={handleAllowList}
						>
							Add to Allow List
						</button> */}
					</div>
				</div>
			)}
		</div>
	);
};

// Compact image attachment button component
interface ImageAttachmentButtonProps {
	imageAttachmentService: IImageAttachmentService;
	fileDialogService: IFileDialogService;
	onError: (message: string) => void;
}

const ImageAttachmentButton: React.FC<ImageAttachmentButtonProps> = ({
	imageAttachmentService,
	fileDialogService,
	onError
}) => {
	const [attachedImages, setAttachedImages] = useState<IAttachedImage[]>([]);
	const [showImageViewer, setShowImageViewer] = useState(false);
	const [updateCounter, setUpdateCounter] = useState(0);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const countButtonRef = useRef<HTMLButtonElement>(null);
	const popupRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		// Force initial load and state update
		const initialImages = imageAttachmentService.getAttachedImages();
		setAttachedImages([...initialImages]); // Force new array to trigger re-render

		// Subscribe to changes
		const disposable = imageAttachmentService.onImagesChanged((images) => {
			setAttachedImages([...images]); // Force new array to trigger re-render
			setUpdateCounter(prev => prev + 1); // Force component re-render
			// Hide image viewer if no images left
			if (images.length === 0) {
				setShowImageViewer(false);
			}
		});

		return () => disposable.dispose();
	}, [imageAttachmentService]);

	// Position popup to avoid clipping like the history dropdown
	useEffect(() => {
		if (showImageViewer && popupRef.current && countButtonRef.current) {
			const buttonRect = countButtonRef.current.getBoundingClientRect();
			const popup = popupRef.current;
			const popupWidth = Math.max(250, popup.offsetWidth);
			
			// Calculate left position to prevent overflow (same logic as "Show chats...")
			let leftPosition = buttonRect.left;
			const rightEdge = leftPosition + popupWidth;
			const windowWidth = window.innerWidth;
			
			// If popup would extend beyond the right edge, adjust position
			if (rightEdge > windowWidth) {
				// Align right edge of popup with right edge of button
				leftPosition = buttonRect.right - popupWidth;
				// If that would push it off the left edge, align with left edge of viewport
				if (leftPosition < 0) {
					leftPosition = 8; // Small margin from edge
				}
			}
			
			// Use fixed positioning like the history dropdown
			popup.style.position = 'fixed';
			popup.style.top = `${buttonRect.top - popup.offsetHeight - 8}px`;
			popup.style.left = `${leftPosition}px`;
			popup.style.minWidth = `${popupWidth}px`;
		}
	}, [showImageViewer, attachedImages.length]); // Re-position when number of images changes

	const handleAttachImage = () => {
		fileInputRef.current?.click();
	};

	const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) {
			try {
				await imageAttachmentService.attachImageFromFile(file);
				// Force refresh
				const updatedImages = imageAttachmentService.getAttachedImages();
				setAttachedImages([...updatedImages]);
				setUpdateCounter(prev => prev + 1);
			} catch (error) {
				console.error('Failed to attach image:', error);
				onError(error instanceof Error ? error.message : 'Failed to attach image');
			}
		}
		// Reset the input
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	const handleRemoveImage = async (imageId: string) => {
		try {
			await imageAttachmentService.removeImage(imageId);
			// Force refresh
			const updatedImages = imageAttachmentService.getAttachedImages();
			setAttachedImages([...updatedImages]);
			setUpdateCounter(prev => prev + 1);
			
			// Re-position popup after DOM updates
			setTimeout(() => {
				if (showImageViewer && popupRef.current && countButtonRef.current) {
					const buttonRect = countButtonRef.current.getBoundingClientRect();
					const popup = popupRef.current;
					popup.style.top = `${buttonRect.top - popup.offsetHeight - 8}px`;
				}
			}, 0);
		} catch (error) {
			onError(error instanceof Error ? error.message : 'Failed to remove image');
		}
	};

	const imageCount = attachedImages.length;
	
	return (
		<div className="image-attachment-button-container" data-update-counter={updateCounter}>
			{/* Image attachment icon */}
			<button
				className="image-attachment-button"
				onClick={handleAttachImage}
				title="Attach image"
			>
				<PlotsIcon width={16} height={16} stroke="#666" fill="none" strokeWidth={1.5} />
			</button>

			{/* Hidden file input */}
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				onChange={handleFileChange}
				style={{ display: 'none' }}
			/>

			{/* Image count display */}
			{imageCount > 0 && (
				<div className="image-attachment-count">
					<button
						ref={countButtonRef}
						className="image-count-button"
						onClick={() => setShowImageViewer(!showImageViewer)}
						title={`${imageCount} image(s) attached`}
					>
						<span>{imageCount} image{imageCount !== 1 ? 's' : ''} attached</span>
						<ChevronIcon 
							width={10} 
							height={10} 
							direction={showImageViewer ? 'down' : 'up'}
							className="chevron-icon"
						/>
					</button>

					{/* Image viewer popup */}
					{showImageViewer && (
						<div ref={popupRef} className="image-viewer-popup">
							{attachedImages.map((image) => (
								<div key={image.id} className="attached-image-item">
									<img
										src={`data:${image.mimeType};base64,${image.base64Data}`}
										alt={image.filename}
										className="attached-image-thumbnail"
									/>
									<div className="attached-image-info">
										<span className="attached-image-name">{image.filename}</span>
										<button
											className="remove-image-button"
											onClick={() => handleRemoveImage(image.id)}
											title="Remove image"
										>
											×
										</button>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
};

// Extract and clean command content for widget display (mirrors RAO's extract_command_and_explanation)
function extractCleanedCommand(functionName: string, args: any): string {
	if (!args || !args.command) return '';
	
	let command = args.command;
	
	// Apply RAO's trimming logic for console and terminal commands
	if (functionName === 'run_console_cmd') {
		// Remove triple backticks with r or python language specifiers
		command = command.replace(/^```(?:[rR]?[mM]?[dD]?|python|py)?\s*\n?/g, '');
		command = command.replace(/\n?```\s*$/g, '');
		command = command.replace(/```\n/g, '');
		command = command.trim();
	} else if (functionName === 'run_terminal_cmd') {
		// Remove triple backticks with shell language specifiers
		command = command.replace(/^```(?:shell|bash|sh)?\s*\n?/g, '');
		command = command.replace(/\n?```\s*$/g, '');
		command = command.replace(/```\n/g, '');
		command = command.trim();
	}
	
	return command;
}

/**
 * Format search_replace content for display in widgets, matching the streaming parser behavior
 */
function formatSearchReplaceContent(args: any): string {
	const filename = args.file_path || '';
	const oldString = args.old_string || '';
	const newString = args.new_string || '';
	
	// Get comment syntax based on file extension using CommonUtils
	const commentSyntax = filename ? CommonUtils.getCommentSyntax(filename) : '# ';
	
	// Format like the streaming parser does
	let result = `${commentSyntax}Old content\n${oldString}`;
	result += `\n\n${commentSyntax}New content\n${newString}`;
	
	return result;
}

// Constants for widget functions
const WIDGET_FUNCTIONS = ['run_console_cmd', 'run_terminal_cmd', 'search_replace', 'delete_file', 'run_file'] as const;

/**
 * Safely parse function call arguments with proper error handling
 */
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

/**
 * Helper function to execute widget actions based on function type (with explicit request ID)
 */
async function executeWidgetActionWithRequestId(
	actionType: 'accept' | 'cancel',
	functionName: string,
	erdosAiService: IErdosAiService,
	messageId: number,
	requestId: string,
	content?: string
): Promise<void> {
	if (actionType === 'accept') {
		if (functionName === 'run_console_cmd') {
			await erdosAiService.orchestrator.acceptConsoleCommand(messageId, content!, requestId);
		} else if (functionName === 'run_terminal_cmd') {
			await erdosAiService.orchestrator.acceptTerminalCommand(messageId, content!, requestId);
		} else if (functionName === 'search_replace') {
			console.log('[REACT] calling acceptSearchReplaceCommand:', messageId);
			await erdosAiService.orchestrator.acceptSearchReplaceCommand(messageId, content!, requestId);
		} else if (functionName === 'delete_file') {
			await erdosAiService.orchestrator.acceptDeleteFileCommand(messageId, content!, requestId);
		} else if (functionName === 'run_file') {
			await erdosAiService.orchestrator.acceptFileCommand(messageId, content!, requestId);
		}
	} else if (actionType === 'cancel') {
		if (functionName === 'run_console_cmd') {
			await erdosAiService.orchestrator.cancelConsoleCommand(messageId, requestId);
		} else if (functionName === 'run_terminal_cmd') {
			await erdosAiService.orchestrator.cancelTerminalCommand(messageId, requestId);
		} else if (functionName === 'search_replace') {
			await erdosAiService.orchestrator.cancelSearchReplaceCommand(messageId, requestId);
		} else if (functionName === 'delete_file') {
			await erdosAiService.orchestrator.cancelDeleteFileCommand(messageId, requestId);
		} else if (functionName === 'run_file') {
			await erdosAiService.orchestrator.cancelFileCommand(messageId, requestId);
		}
	}
}



/**
 * Factory function to create widget handlers - eliminates duplication
 */
function createWidgetHandlers(
	functionName: string, 
	erdosAiService: IErdosAiService,
	requestId: string,
	setIsAiProcessing?: (processing: boolean) => void,
	// autoAcceptService?: IAutoAcceptService,

): IErdosAiWidgetHandlers {
	return {
		onAccept: async (messageId: number, content: string) => {
			try {
				// Mark AI processing as active when user clicks accept
				if (setIsAiProcessing) {
					setIsAiProcessing(true);
				}
				await executeWidgetActionWithRequestId('accept', functionName, erdosAiService, messageId, requestId, content);
			} catch (error) {
				console.error('Failed to accept widget command:', error);
				// Clear processing state on error
				if (setIsAiProcessing) {
					setIsAiProcessing(false);
				}
			}
		},
		onCancel: async (messageId: number) => {
			try {
				// Mark AI processing as active when user clicks cancel
				if (setIsAiProcessing) {
					setIsAiProcessing(true);
				}
				await executeWidgetActionWithRequestId('cancel', functionName, erdosAiService, messageId, requestId);
			} catch (error) {
				console.error('Failed to cancel widget command:', error);
				// Clear processing state on error
				if (setIsAiProcessing) {
					setIsAiProcessing(false);
				}
			}
		},
		onAllowList: async (messageId: number, content: string) => {
			try {
				// Mark AI processing as active when user clicks allow list (which accepts)
				if (setIsAiProcessing) {
					setIsAiProcessing(true);
				}
				
				// Enable auto-accept for search_replace when allow list is clicked
				if (functionName === 'search_replace') {
					try {
						await erdosAiService.setAutoAcceptEdits(true);
						console.log('[REACT] Auto-accept edits enabled via allow list');
					} catch (error) {
						console.error('[REACT] Failed to enable auto-accept edits:', error);
					}
				}
				
				// Enable auto-accept for delete_file when allow list is clicked
				if (functionName === 'delete_file') {
					try {
						await erdosAiService.setAutoDeleteFiles(true);
						console.log('[REACT] Auto-delete files enabled via allow list');
					} catch (error) {
						console.error('[REACT] Failed to enable auto-delete files:', error);
					}
				}

				// // Add extracted functions to allow list for run_console_cmd (following RAO pattern)
				// Auto-accept functionality removed with help service
				// 			// Enable auto-accept console first
				// 			const settings = autoAcceptService.getSettings();
				// 			if (!settings.autoAcceptConsole) {
				// 				autoAcceptService.updateSettings({ autoAcceptConsole: true });
				// 				console.log('[REACT] Auto-accept console enabled via allow list');
				// 			}

				// 			// Add each extracted function to the allow list
				// 			parseResult.functions.forEach(func => {
				// 				autoAcceptService.addToConsoleAllowList(func);
				// 				console.log(`[REACT] Added ${func} to console allow list`);
				// 			});
				// 		}
				// 	} catch (error) {
				// 		console.error('[REACT] Failed to add functions to allow list:', error);
				// 	}
				// }
				
				// Then accept the current command
				await executeWidgetActionWithRequestId('accept', functionName, erdosAiService, messageId, requestId, content);
			} catch (error) {
				console.error('Failed to accept widget command:', error);
				// Clear processing state on error
				if (setIsAiProcessing) {
					setIsAiProcessing(false);
				}
			}
		}
	};
}

/**
 * Factory function to create widget info - eliminates duplication
 */
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
		requestId: message.request_id || `req_${message.id}`, // Use stored request_id from conversation log (like Rao)
		functionCallType: functionName as 'search_replace' | 'run_console_cmd' | 'run_terminal_cmd' | 'delete_file' | 'run_file',
		filename: functionName === 'search_replace' 
			? undefined  // Will be set from diffData if available
			: args.filename || args.file_path || undefined,
		initialContent: initialContent,
		language: functionName === 'run_console_cmd' ? 'r' : 'shell',
		handlers: handlers,
		...(showButtons !== undefined && { showButtons })
	};

	// Update widgetInfo with clean data from diffData
	if (diffData && diffData.clean_filename) {
		widgetInfo.filename = diffData.clean_filename;
		widgetInfo.diffStats = {
			added: diffData.added || 0,
			deleted: diffData.deleted || 0
		};
	}

	return widgetInfo;
}

/**
 * Filter messages for display based on RAO's conversation display criteria
 * Only shows messages that should be visible to users in the conversation UI
 */
function filterMessagesForDisplay(messagesToFilter: ConversationMessage[], allMessages?: ConversationMessage[]): ConversationMessage[] {
	
	// Use messagesToFilter as allMessages if not provided (for conversation loading)
	const contextMessages = allMessages || messagesToFilter;
	
	const filtered = messagesToFilter.filter(message => {
		// Hide procedural messages (internal system messages)
		if (message.procedural) {
			return false;
		}
		
		// Handle function call output messages
		if (message.type === 'function_call_output') {
			// Check if this is a search_replace function_call_output
			const relatedMessage = contextMessages.find(m => m.id === message.related_to);
			if (relatedMessage && relatedMessage.function_call && relatedMessage.function_call.name === 'search_replace') {
				// For search_replace, only show if it's a failed operation (success = false)
				// Successful search_replace function_call_output should be procedural and hidden (like Rao)
				const success = (message as any).success;
				return success === false;
			}
			// Hide other function call output messages (raw execution results)
			return false;
		}
		
		// Show user messages (already filtered for procedural above)
		if (message.role === 'user') {
			return true;
		}
		
		// Handle function call messages
		if (message.function_call && message.function_call.name) {
			const functionName = message.function_call.name;
			
			// Show function calls for non-widget functions (these become text messages)
			const nonWidgetFunctions = ['grep_search', 'read_file', 'view_image', 'search_for_file', 'list_dir'];
			if (nonWidgetFunctions.includes(functionName)) {
				return true;
			}
			
			// Do NOT hide widget-generating function calls; they are rendered as widgets
			// Note: delete_file and run_file are also widget functions but not in main WIDGET_FUNCTIONS constant
			const allWidgetFunctions = [...WIDGET_FUNCTIONS, 'delete_file', 'run_file'];
			if (allWidgetFunctions.includes(functionName as any)) {
				return true;
			}
			
			// Default: show other function calls
			return true;
		}
		
		// Handle assistant messages
		if (message.role === 'assistant') {
			return true;
		}
		
		// Handle web search entries (type="assistant" with web_search_call field)
		if (message.type === 'assistant' && (message as any).web_search_call) {
			return true;
		}
		
		// Default: hide unknown message types
		return false;
	});
	
	return filtered;
}

interface HistoryDropdownProps {
	erdosAiService: IErdosAiService;
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
			// Sort newest to oldest (by ID descending, since IDs are sequential)
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
		// Filter conversations based on search query
		const filtered = conversations.filter(conv => 
			conv.name.toLowerCase().includes(searchQuery.toLowerCase())
		);
		setFilteredConversations(filtered);
	}, [conversations, searchQuery]);

	useEffect(() => {
		// Position dropdown below button
		if (props.isOpen && dropdownRef.current && props.buttonRef.current) {
			const buttonRect = props.buttonRef.current.getBoundingClientRect();
			const dropdown = dropdownRef.current;
			const dropdownWidth = Math.max(320, buttonRect.width);
			
			// Calculate left position to prevent overflow
			let leftPosition = buttonRect.left;
			const rightEdge = leftPosition + dropdownWidth;
			const windowWidth = window.innerWidth;
			
			// If dropdown would extend beyond the right edge, adjust position
			if (rightEdge > windowWidth) {
				// Align right edge of dropdown with right edge of button
				leftPosition = buttonRect.right - dropdownWidth;
				// If that would push it off the left edge, align with left edge of viewport
				if (leftPosition < 0) {
					leftPosition = 8; // Small margin from edge
				}
			}
			
			dropdown.style.top = `${buttonRect.bottom + 4}px`;
			dropdown.style.left = `${leftPosition}px`;
			dropdown.style.minWidth = `${dropdownWidth}px`;
		}
	}, [props.isOpen, props.buttonRef]);

	useEffect(() => {
		// Close dropdown when clicking outside
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
		
		// Return cleanup function for when props.isOpen is false
		return () => {};
	}, [props.isOpen, props.onClose, props.buttonRef]);

	const handleRename = async (id: number, newName: string) => {
		if (newName.trim() && newName !== conversations.find(c => c.id === id)?.name) {
			try {
				await props.erdosAiService.renameConversation(id, newName.trim());
				await loadConversations(); // Reload to get updated data
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
				await loadConversations(); // Reload to remove deleted conversation
			} catch (error) {
				console.error('Failed to delete conversation:', error);
			}
		}
	};

	const handleDeleteAll = async () => {
		if (confirm('Are you sure you want to delete ALL conversations? This action cannot be undone.')) {
			try {
				await props.erdosAiService.deleteAllConversations();
				await loadConversations(); // Reload to show empty list
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

export interface ErdosAiProps {
	readonly reactComponentContainer: IReactComponentContainer;
	readonly erdosAiService: IErdosAiService;
	readonly fileService?: IFileService;
	readonly fileDialogService?: IFileDialogService;
	readonly textFileService?: ITextFileService;
	readonly textModelService?: ITextModelService;
	// readonly autoAcceptService?: IAutoAcceptService;

}

export const ErdosAi = (props: ErdosAiProps) => {
	const [messages, setMessages] = useState<ConversationMessage[]>([]);
	const [inputValue, setInputValue] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [isAiProcessing, setIsAiProcessing] = useState(false); // Track orchestrator processing state
	const [thinkingMessage, setThinkingMessage] = useState<string>('');
	const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);

	const [showHistory, setShowHistory] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [streamingErrors, setStreamingErrors] = useState<Map<string, string>>(new Map());

	// Widget state tracking
	// Simple widget state - just what we need
	const [widgets, setWidgets] = useState<Map<number, {info: IErdosAiWidgetInfo, content: string, diffData?: any}>>(new Map());
	
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const historyButtonRef = useRef<HTMLButtonElement>(null);
	const [markdownRenderer, setMarkdownRenderer] = useState<ErdosAiMarkdownRenderer | null>(null);

	// Auto-accept integration removed with help service
	
	// Scroll to bottom when new messages are added
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages, currentConversation?.streaming]);

	// Populate run_file widget content after widgets are created
	useEffect(() => {
		const populateRunFileContent = async () => {
			for (const [messageId, widget] of widgets) {
				if (widget.info.functionCallType === 'run_file' && 
					widget.content === '# Loading file content...') {
					
					console.log('[DEBUG run_file] Populating content for widget', messageId);
					
					// Find the function call message to get the args
					const functionCallMessage = messages.find(m => m.id === messageId && m.function_call);
					if (functionCallMessage && functionCallMessage.function_call) {
						try {
							const args = JSON.parse(functionCallMessage.function_call.arguments || '{}');
							console.log('[DEBUG run_file] Calling extractFileContentForWidget with:', args);
							
							const fileContent = await (props.erdosAiService as any).extractFileContentForWidget(
								args.filename, 
								args.start_line_one_indexed, 
								args.end_line_one_indexed_inclusive
							);
							
							console.log('[DEBUG run_file] Got file content:', fileContent?.substring(0, 100) + '...');
							
							// Update the widget content
							setWidgets(prev => {
								const updated = new Map(prev);
								const existingWidget = updated.get(messageId);
								if (existingWidget) {
									updated.set(messageId, {
										...existingWidget,
										content: fileContent || '# Error: Could not extract file content'
									});
								}
								return updated;
							});
						} catch (error) {
							console.error('[DEBUG run_file] Error extracting file content:', error);
							// Update with error content
							setWidgets(prev => {
								const updated = new Map(prev);
								const existingWidget = updated.get(messageId);
								if (existingWidget) {
									updated.set(messageId, {
										...existingWidget,
										content: `# Error reading file: ${error}`
									});
								}
								return updated;
							});
						}
					}
				}
			}
		};

		populateRunFileContent();
	}, [widgets, messages, props.erdosAiService]);

	// Initialize markdown renderer
	useEffect(() => {
		const renderer = props.erdosAiService.getMarkdownRenderer() as ErdosAiMarkdownRenderer;
		setMarkdownRenderer(renderer);
	}, [props.erdosAiService]);



	// Set up service event listeners
	useEffect(() => {
		const conversationLoadedDisposable = props.erdosAiService.onConversationLoaded(async (conversation: Conversation) => {
			setCurrentConversation(conversation);
			const displayableMessages = filterMessagesForDisplay(conversation.messages);
			setMessages(displayableMessages);
			
			// Reset AI processing state when switching conversations
			setIsAiProcessing(false);
			setIsLoading(false);
			
			// Recreate widgets from conversation log
			const recreatedWidgets = new Map<number, {info: IErdosAiWidgetInfo, content: string, diffData?: any}>();
			
			// Process all messages to find function calls that should have widgets
			for (const message of conversation.messages) {
				if (message.function_call && message.function_call.name) {
					if (WIDGET_FUNCTIONS.includes(message.function_call.name as any)) {
						try {
							const args = parseFunctionArgs(message.function_call);
							
							// For interactive functions, check if they succeeded by looking at function_call_output (like Rao)
							let functionSucceeded = true; // Default to true for non-interactive functions
							if (message.function_call.name === 'search_replace' || message.function_call.name === 'delete_file' || message.function_call.name === 'run_file') {
								console.log(`[ERDOS_AI_UI] loadConversation: Checking success for ${message.function_call.name}, message id: ${message.id}`);
								// Look for related function_call_output to determine success/failure
								let foundOutput = false;
								for (const logEntry of conversation.messages) {
									if (logEntry.type === 'function_call_output' && 
										logEntry.related_to === message.id) {
										foundOutput = true;
										
										// Use the success field to determine operation status
										const success = (logEntry as any).success;
										console.log(`[ERDOS_AI_UI] loadConversation: Found function_call_output for ${message.function_call.name}, success:`, success, 'logEntry:', logEntry);
										
										if (success === false) {
											// Operation failed (file not found, etc.)
											functionSucceeded = false;
											console.log(`[ERDOS_AI_UI] loadConversation: Function ${message.function_call.name} failed, will skip widget creation`);
										}
										
										break;
									}
								}
								
								// If no function_call_output found, assume it's pending/successful (don't skip widget creation)
								if (!foundOutput) {
									functionSucceeded = true;
									console.log(`[ERDOS_AI_UI] loadConversation: No function_call_output found for ${message.function_call.name}, assuming success`);
								}
								
								// If function failed, don't create widget - create function call message instead
								if (!functionSucceeded) {
									console.log(`[ERDOS_AI_UI] loadConversation: Skipping widget creation for failed ${message.function_call.name}, will show function call message instead`);
									continue; // Skip widget creation, will be handled by function call message logic below
								}
							}
							
							// For search_replace widgets, retrieve stored diff data first (like Rao's conversation display)
							let diffData = null;
							if (message.function_call.name === 'search_replace') {
								try {
									// Get diff data from the service which has the loaded diffStorage
									const storedDiff = await props.erdosAiService.getDiffDataForMessage(message.id.toString());
									
									if (storedDiff && storedDiff.diff_data) {
										// Recreate diff data structure for display
										const filePath = args.file_path || args.filename;
										const baseName = filePath ? CommonUtils.getBasename(filePath) : 'file';
										
										// Count added/deleted lines
										let added = 0, deleted = 0;
										storedDiff.diff_data.forEach((item: any) => {
											if (item.type === 'added') added++;
											if (item.type === 'deleted') deleted++;
										});
										
										// Store only clean structured data - no HTML generation
										diffData = {
											diff: storedDiff.diff_data,
											added: added,
											deleted: deleted,
											clean_filename: baseName
										};
										
									} else {
										// No stored diff data available
									}
								} catch (error) {
									console.error('Failed to retrieve diff data for search_replace widget:', error);
								}
							}
							
							// Create widget handlers using factory function
							const handlers = createWidgetHandlers(message.function_call.name, props.erdosAiService, message.request_id || `req_${message.id}`, setIsAiProcessing);
							
							// Extract and clean command content to match streaming behavior (RAO pattern)
							let initialContent = args.command || args.content || '';
							if (message.function_call.name === 'run_console_cmd' || message.function_call.name === 'run_terminal_cmd') {
								initialContent = extractCleanedCommand(message.function_call.name, args);
							} else if (message.function_call.name === 'delete_file') {
								// For delete_file, show the filename and explanation
								initialContent = `Delete ${args.filename}${args.explanation ? ': ' + args.explanation : ''}`;
							} else if (message.function_call.name === 'search_replace') {
								// For search_replace, format the content like the streaming parser does
								initialContent = formatSearchReplaceContent(args);
							} else if (message.function_call.name === 'run_file') {
								// For run_file, the content should come from service during widget creation
								// If no content provided, show placeholder that will be updated
								console.log('[DEBUG run_file] args:', args);
								console.log('[DEBUG run_file] args.command:', args.command);
								initialContent = args.command || '# Loading file content...';
								console.log('[DEBUG run_file] initialContent set to:', initialContent);
							}

							// Determine if buttons should be shown for interactive functions
							let showButtons = true;
							if (message.function_call.name === 'search_replace' || message.function_call.name === 'delete_file' || message.function_call.name === 'run_file') {
								// Check if operation was completed by looking at function_call_output
								for (const logEntry of conversation.messages) {
									if (logEntry.type === 'function_call_output' && 
										logEntry.related_to === message.id) {
										const output = logEntry.output || '';
										// If not "Response pending...", operation was completed
										if (output !== 'Response pending...') {
											showButtons = false;
										}
										break;
									}
								}
							}

							// Create widget info using factory function
							const widgetInfo = createWidgetInfo(message, message.function_call.name, args, initialContent, handlers, diffData, showButtons);
							
							recreatedWidgets.set(message.id, {
								info: widgetInfo,
								content: widgetInfo.initialContent || '',
								diffData: diffData // Store diff data for widget reconstruction
							});
							
						} catch (error) {
							console.error('Failed to recreate widget for message', message.id, error);
						}
					}
				}
			}
			
			setWidgets(recreatedWidgets);
			
		});

		const messageAddedDisposable = props.erdosAiService.onMessageAdded((message: ConversationMessage) => {
			// Need to check filtering against all messages in the current conversation for relationships
			const conversation = props.erdosAiService.getCurrentConversation();
			if (!conversation) return;
			
			const allMessages = conversation.messages;
			const shouldDisplay = filterMessagesForDisplay([message], allMessages).length > 0;
			
			if (shouldDisplay) {
				setMessages(prev => {
					// If this is a function call message being added, remove any temporary display message with the same ID
					// This ensures temporary "search_replace" messages get replaced with actual failed function messages
					let updated = prev;
					if (message.function_call) {
						updated = prev.filter(m => !(m.id === message.id && (m as any).isFunctionCallDisplay));
					}
					
					// Avoid duplicates
					const exists = updated.some(m => m.id === message.id);
					if (exists) {
						updated = updated.map(m => m.id === message.id ? message : m);
						return updated;
					}
					
					updated = [...updated, message];
					return updated;
				});
			} else {
			}
			
			// CRITICAL: Update currentConversation state to pick up cleared streaming state
			// This prevents double display of streaming + completed messages
			setCurrentConversation({...conversation});
		});

		const streamingDataDisposable = props.erdosAiService.onStreamingData((data: StreamData) => {
			if (data.type === 'content' && data.content) {
				// Update current conversation to trigger re-render
				const conversation = props.erdosAiService.getCurrentConversation();
				if (conversation) {
					setCurrentConversation({...conversation});
				}
			} else if (data.type === 'thinking') {
				// Thinking state handled by conversation manager
			} else if (data.type === 'done') {
			}
		});

		const streamingCompleteDisposable = props.erdosAiService.onStreamingComplete(() => {
			setIsLoading(false);
			// Don't immediately clear operation state - wait for all operations to complete
			
			// Clear attached images after streaming is completely done
			const imageService = props.erdosAiService.getImageAttachmentService();
			if (imageService) {
				imageService.clearAllImages().catch((error: any) => {
				});
			}
		});

		const thinkingMessageDisposable = props.erdosAiService.onThinkingMessage((data) => {
			if (data.message && !data.hideCancel) {
				// Show thinking message
				setThinkingMessage(data.message);
			} else {
				// Hide thinking message
				setThinkingMessage('');
			}
		});

		const orchestratorStateDisposable = props.erdosAiService.onOrchestratorStateChange((state: {isProcessing: boolean}) => {
			setIsAiProcessing(state.isProcessing);
			
			// CRITICAL FIX: When orchestrator stops processing (pending/done/error), also clear loading state
			if (!state.isProcessing) {
				setIsLoading(false);
			}
		});

		const streamingErrorDisposable = props.erdosAiService.onStreamingError((data) => {
			// Add streaming error to conversation display - exactly like Rao
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
				content: displayMessage.content,
				timestamp: displayMessage.timestamp,
				procedural: false,
				isFunctionCallDisplay: true // Mark as function call display message
			};
			
			// Update messages state to include the display message
			setMessages(prevMessages => {
				// Check if message already exists (avoid duplicates)
				const existingIndex = prevMessages.findIndex(m => m.id === displayMessage.id);
				if (existingIndex >= 0) {
					// Replace existing message
					const updated = [...prevMessages];
					updated[existingIndex] = tempMessage;
					return updated;
				} else {
					// Add new message in correct chronological order
					const updated = [...prevMessages, tempMessage];
					const sorted = updated.sort((a, b) => a.id - b.id);
					return sorted;
				}
			});
		});

		// Widget creation - simple and direct
		const widgetRequestedDisposable = props.erdosAiService.onWidgetRequested((widgetInfo: IErdosAiWidgetInfo) => {
			console.log(`[DEBUG REACT WIDGET] Widget requested for messageId: ${widgetInfo.messageId}, functionType: ${widgetInfo.functionCallType}`);
			console.log(`[DEBUG REACT WIDGET] Widget info:`, widgetInfo);
			
			setWidgets(prev => {
				console.log(`[DEBUG REACT WIDGET] Previous widgets:`, Array.from(prev.keys()));
				const updated = new Map(prev).set(widgetInfo.messageId, {
					info: widgetInfo,
					content: widgetInfo.initialContent || ''
				});
				console.log(`[DEBUG REACT WIDGET] Updated widgets:`, Array.from(updated.keys()));
				return updated;
			});
			
			console.log(`[DEBUG REACT WIDGET] Widget creation completed for messageId: ${widgetInfo.messageId}`);
		});

		const widgetStreamingUpdateDisposable = props.erdosAiService.onWidgetStreamingUpdate((update: { 
			messageId: number; 
			delta: string; 
			isComplete: boolean; 
			replaceContent?: boolean;
			filename?: string;
		}) => {
			if (update.delta) {
				setWidgets(prev => {
					const existing = prev.get(update.messageId);
					if (!existing) return prev;
					
					const newContent = update.replaceContent ? update.delta : existing.content + update.delta;
					const newWidget = { ...existing, content: newContent };
					
					// Update filename if provided (for search_replace)
					if (update.filename) {
						newWidget.info = { ...newWidget.info, filename: update.filename };
					}
					
					return new Map(prev).set(update.messageId, newWidget);
				});
			}
		});

		const widgetButtonActionDisposable = props.erdosAiService.onWidgetButtonAction((action) => {
			if (action.action === 'hide') {
				// Hide buttons for the specific widget - this will be handled by the WidgetWrapper
				// The WidgetWrapper component will listen for this event and hide the buttons
				// Note: Processing state is now managed by orchestrator, not widget existence
			}
		});

		// Initialize with current conversation
		const conversation = props.erdosAiService.getCurrentConversation();
		if (conversation) {
			setCurrentConversation(conversation);
			const displayableMessages = filterMessagesForDisplay(conversation.messages);
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
		
		// If currently processing, stop the current operation first (preserve content like stop button)
		if (isLoading || isAiProcessing) {
			try {
				// Call the service's cancel method directly (same as stop button)
				await props.erdosAiService.cancelStreaming();
				
				// CRITICAL: Clear streaming state and reload conversation to show cancelled message
				setIsLoading(false);
				setIsAiProcessing(false);
				
				// Reload conversation to pick up the newly saved cancelled message
				const updatedConversation = props.erdosAiService.getCurrentConversation();
				if (updatedConversation) {
					setCurrentConversation({...updatedConversation});
					const displayableMessages = filterMessagesForDisplay(updatedConversation.messages);
					setMessages(displayableMessages);
				}
				
				// Small delay to let UI update and show the cancelled message
				await new Promise(resolve => setTimeout(resolve, 50));
				
			} catch (error) {
				console.error('Failed to cancel before sending new message:', error);
				// Clear states even on error
				setIsLoading(false);
				setIsAiProcessing(false);
			}
		}
		
		setInputValue('');
		setIsLoading(true);
		setIsAiProcessing(true);

		try {
			// If no conversation exists, create one first
			if (!currentConversation) {
				await props.erdosAiService.newConversation();
			}

			// Send message to the service and wait for it to complete
			await props.erdosAiService.sendMessage(messageContent);

		} catch (error) {
			console.error('Failed to send message:', error);
			setIsLoading(false);
			setIsAiProcessing(false);
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
		
		// Auto-resize textarea
		const textarea = event.target;
		textarea.style.height = 'auto';
		const scrollHeight = Math.min(textarea.scrollHeight, 120); // Max height from CSS
		textarea.style.height = `${Math.max(scrollHeight, 24)}px`; // Min height from CSS
	};

	const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
		console.log('DEBUG: Paste event detected in search input');
		
		// Check if clipboardData is available
		if (!event.clipboardData) {
			console.log('DEBUG: No clipboardData available, skipping paste processing');
			return;
		}

		// Get the pasted text
		const pastedText = event.clipboardData.getData('text/plain');
		
		if (!pastedText || pastedText.trim().length === 0) {
			console.log('DEBUG: No text content in paste, skipping');
			return;
		}

		console.log('DEBUG: Processing pasted text:', pastedText.substring(0, 100) + (pastedText.length > 100 ? '...' : ''));

		try {
			// Check if pasted text matches content in open documents
			const matchResult = await props.erdosAiService.checkPastedTextInOpenDocuments(pastedText);
			
			if (matchResult) {
				console.log('DEBUG: Found match in document, adding as context:', matchResult.filePath);
				
				// Add the file to context with line numbers
				const contextService = props.erdosAiService.getContextService();
				
				// Handle both regular files and unsaved files (like RAO does)
				let uri: URI;
				if (matchResult.filePath.startsWith('__UNSAVED_')) {
					// For unsaved files, we need to use the path as-is since the DocumentManager handles the resolution
					uri = URI.parse(`untitled:${matchResult.filePath}`);
				} else {
					uri = URI.file(matchResult.filePath);
				}
				
				const success = await contextService.addFileContext(uri, matchResult.startLine, matchResult.endLine);
				
				if (success) {
					console.log('DEBUG: Successfully added file context with lines', matchResult.startLine, 'to', matchResult.endLine);
					
					// Prevent the default paste behavior since we're handling it as context
					event.preventDefault();
					
					// Remove the pasted text from the current input value (like RAO does)
					// This removes only the specific pasted text that was matched
					const currentValue = inputValue;
					let newValue = currentValue;
					
					// If the pasted text would be added at the end (most common case)
					if (!currentValue || currentValue.trim().length === 0) {
						// If input is empty, keep it empty
						newValue = '';
					} else {
						// Remove the pasted text if it appears in the current value
						newValue = currentValue.replace(pastedText, '');
					}
					
					setInputValue(newValue);
					console.log('DEBUG: Removed pasted text from input, context added instead');
				} else {
					console.log('DEBUG: Failed to add file context, allowing normal paste');
				}
			} else {
				console.log('DEBUG: No match found in open documents, allowing normal paste');
			}
		} catch (error) {
			console.error('DEBUG: Error processing pasted text:', error);
			// Allow normal paste on error
		}
	};

	const handleNewConversation = async () => {
		try {
			await props.erdosAiService.newConversation();
		} catch (error) {
			console.error('Failed to create new conversation:', error);
		}
	};

	const handleShowHistory = async () => {
		setShowHistory(true);
	};

	const handleCancelStreaming = async () => {
		try {
			await props.erdosAiService.cancelStreaming();
			setIsLoading(false);
			setIsAiProcessing(false);
		} catch (error) {
			console.error('Failed to cancel streaming:', error);
			// Still update UI state even if cancellation request failed
			setIsLoading(false);
			setIsAiProcessing(false);
		}
	};

	const handleRevertToMessage = async (messageId: number) => {
		// Show confirmation dialog similar to rao
		const confirmed = confirm(
			'This will delete this message and all messages after it in the conversation. This cannot be undone.\n\nDo you want to continue?'
		);
		
		if (!confirmed) {
			return;
		}

		try {
			const result = await props.erdosAiService.revertToMessage(messageId);
			if (result.status === 'error') {
				console.error('Failed to revert conversation:', result.data.error);
				alert('Failed to revert conversation: ' + result.data.error);
			} else {
				console.log(`Successfully reverted conversation, removed ${result.data.removedCount} messages`);
			}
		} catch (error) {
			console.error('Failed to revert conversation:', error);
			alert('Failed to revert conversation: ' + (error instanceof Error ? error.message : 'Unknown error'));
		}
	};

	// Widget creation helper
	const createWidget = (message: ConversationMessage, functionCall: any): React.ReactElement | null => {
		if (!functionCall || !functionCall.name) return null;

		if (!WIDGET_FUNCTIONS.includes(functionCall.name as any)) return null;

		// Check if we have a widget for this message
		const widget = widgets.get(message.id);
		if (widget) {
			return (
				<div key={`widget-${message.id}`} className="erdos-ai-widget-container">
					<WidgetWrapper 
						widgetInfo={widget.info}
						handlers={widget.info.handlers}
						context={{}}
						streamingContent={widget.content}
						erdosAiService={props.erdosAiService}
						diffData={widget.diffData}
					/>
				</div>
			);
		}
		
		// For failed search_replace operations, show "Model failed to edit [filename]" (like Rao)
		if (functionCall.name === 'search_replace') {
			const args = parseFunctionArgs(functionCall);
			const filePath = args.file_path || args.filename || 'unknown';
			const filename = CommonUtils.getBasename(filePath);
			return (
				<div key={`function-call-${message.id}`} className="erdos-ai-function-call-message">
					Model failed to edit {filename}
				</div>
			);
		}
		
		// For failed delete_file operations, show "Model failed to delete [filename]"
		if (functionCall.name === 'delete_file') {
			const args = parseFunctionArgs(functionCall);
			const filename = args.filename || 'unknown';
			console.log(`[ERDOS_AI_UI] Rendering failed delete_file for filename: ${filename}, message:`, message);
			return (
				<div key={`function-call-${message.id}`} className="erdos-ai-function-call-message">
					Model failed to delete {filename}
				</div>
			);
		}
		
		// For failed run_file operations, show "Model failed to run [filename]"
		if (functionCall.name === 'run_file') {
			const args = parseFunctionArgs(functionCall);
			const filePath = args.file_path || args.filename || 'unknown';
			const filename = CommonUtils.getBasename(filePath);
			return (
				<div key={`function-call-${message.id}`} className="erdos-ai-function-call-message">
					Model failed to run {filename}
				</div>
			);
		}
		
		return (
			<div key={`widget-error-${message.id}`} className="erdos-ai-widget-error">
				Widget not available for {functionCall.name}
			</div>
		);
	};



	// If settings panel is shown, render it instead of the chat interface
	if (showSettings) {
		return (
			<SettingsPanel 
				erdosAiService={props.erdosAiService}
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
							}
						} catch (error) {
							console.error('Failed to load conversation:', error);
						}
					}
				}}
			/>


			{/* View title toolbar */}
			<div className="erdos-ai-view-title">
				<div className="erdos-ai-conversation-name">
					{currentConversation?.info?.name || 'New conversation'}
				</div>
				<div className="erdos-ai-view-title-actions">
										<button
						className="erdos-ai-toolbar-button"
						onClick={handleNewConversation}
						title="New Chat"
					>
						<span className="codicon codicon-add"></span>
					</button>
					<button 
						ref={historyButtonRef}
						className="erdos-ai-toolbar-button"
						onClick={handleShowHistory}
						title="Show Chats..."
					>
						<span className="codicon codicon-history"></span>
					</button>
									<button 
					className="erdos-ai-toolbar-button"
					onClick={() => setShowSettings(!showSettings)}
					title="Configure Chat..."
				>
					<span className="codicon codicon-settings-gear"></span>
				</button>
				</div>
			</div>
			
			<div className="erdos-ai-messages">
				{messages.length === 0 && !isLoading ? (
					<div className="erdos-ai-welcome">
						<h3>Welcome to Erdos</h3>
						<p>Ask me anything about your data, and I'll help you out!</p>
					</div>
				) : (
					<>
						{/* Render messages and widgets in unified chronological order */}
						{(() => {
							// Create unified list of messages and widgets sorted by ID
							const allItems: Array<{type: 'message' | 'widget', id: number, data: any}> = [];
							
							// Add all messages
							messages.forEach(message => {
								allItems.push({type: 'message', id: message.id, data: message});
							});
							
							// Add widgets that don't have corresponding messages
							Array.from(widgets.entries()).forEach(([messageId, widget]) => {
								const hasConversationMessage = messages.some(msg => msg.id === messageId);
								if (!hasConversationMessage && widget.info.handlers) {
									allItems.push({type: 'widget', id: messageId, data: widget});
								}
							});
							
							// Sort all items by ID for chronological order
							allItems.sort((a, b) => a.id - b.id);
							
							return allItems.map((item, index) => {
								if (item.type === 'widget') {
									const widget = item.data;
									return (
										<div key={`widget-${item.id}`} className="erdos-ai-widget-container">
											<WidgetWrapper 
												widgetInfo={widget.info}
												handlers={widget.info.handlers}
												context={{}}
												streamingContent={widget.content}
												erdosAiService={props.erdosAiService}
											/>
										</div>
									);
								} else {
									// Render message
									const message = item.data;
									
									if (message.role === 'user') {
										return (
											<div key={message.id} className="erdos-ai-user-container">
												<div className="erdos-ai-message user">
													{message.content}
													<div 
														className="erdos-ai-revert-icon"
														onClick={() => handleRevertToMessage(message.id)}
														title="Delete this message and all messages after it"
													>
																											<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
														<path d="M 5 11 L 11 11 A 3 3 0 0 0 11 5 L 5 5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
														<path d="M 4.5 5 L 8.5 2.0 M 4.5 5 L 8.5 8.0" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
													</svg>
													</div>
												</div>
											</div>
										);
									} else {
										if (message.function_call) {
											const functionCall = message.function_call;
											
											// Check if this is a widget function
											if (WIDGET_FUNCTIONS.includes(functionCall.name as any)) {
												// For interactive functions, check if they succeeded (same logic as conversation loading)
												let functionSucceeded = true;
												if (functionCall.name === 'search_replace' || functionCall.name === 'delete_file' || functionCall.name === 'run_file') {
													console.log(`[ERDOS_AI_UI] renderFunctionCallMessage: Checking success for ${functionCall.name}, message id: ${message.id}`);
													// Look for related function_call_output to determine success/failure
													for (const msg of (currentConversation?.messages || [])) {
														if (msg.type === 'function_call_output' && 
															msg.related_to === message.id) {
															const success = (msg as any).success;
															console.log(`[ERDOS_AI_UI] renderFunctionCallMessage: Found function_call_output, success:`, success, 'msg:', msg);
															if (success === false) {
																functionSucceeded = false;
																console.log(`[ERDOS_AI_UI] renderFunctionCallMessage: Function ${functionCall.name} failed, will show function call message`);
															}
															break;
														}
													}
												}
												
												// If function failed, don't create widget - fall through to function call message
												if (!functionSucceeded) {
													console.log(`[ERDOS_AI_UI] renderFunctionCallMessage: Function ${functionCall.name} failed, falling through to function call message`);
													// Fall through to function call message rendering below
												} else {
													// Create widget for interactive functions
													const widgetResult = createWidget(message, functionCall);
													return widgetResult;
												}
											}
											
											// Handle non-widget functions with text display
											let functionMessage = '';
											
											switch (functionCall.name) {
												case 'read_file':
													const readArgs = parseFunctionArgs(functionCall, { filename: 'unknown' });
													const readFilename = readArgs.filename ? CommonUtils.getBasename(readArgs.filename) : 'unknown';
													let lineInfo = '';
													if (readArgs.should_read_entire_file) {
														lineInfo = ' (1-end)';
													} else if (readArgs.start_line_one_indexed && readArgs.end_line_one_indexed_inclusive) {
														lineInfo = ` (${readArgs.start_line_one_indexed}-${readArgs.end_line_one_indexed_inclusive})`;
													} else if (readArgs.start_line_one_indexed) {
														lineInfo = ` (${readArgs.start_line_one_indexed}-end)`;
													} else if (readArgs.end_line_one_indexed_inclusive) {
														lineInfo = ` (1-${readArgs.end_line_one_indexed_inclusive})`;
													}
													functionMessage = `Read ${readFilename}${lineInfo}`;
													break;
												case 'search_for_file':
													const searchFileArgs = parseFunctionArgs(functionCall, { query: 'unknown' });
													functionMessage = `Searched for files matching "${searchFileArgs.query}"`;
													break;
												case 'list_dir':
													const listArgs = parseFunctionArgs(functionCall, { relative_workspace_path: '.' });
													const path = listArgs.relative_workspace_path || '.';
													const displayPath = path === '.' ? 'the current directory' : path;
													functionMessage = `Listed contents of ${displayPath}`;
													break;
												case 'grep_search':
													const grepArgs = parseFunctionArgs(functionCall, { query: 'unknown' });
													const pattern = grepArgs.query || 'unknown';
													const displayPattern = pattern.length > 50 ? pattern.substring(0, 50) + '...' : pattern;
													
													// Build patterns info
													let patternsInfo = '';
													if (grepArgs.include_pattern || grepArgs.exclude_pattern) {
														const parts = [];
														if (grepArgs.include_pattern) parts.push(`include: ${grepArgs.include_pattern}`);
														if (grepArgs.exclude_pattern) parts.push(`exclude: ${grepArgs.exclude_pattern}`);
														patternsInfo = ` (${parts.join(', ')})`;
													}
													
													functionMessage = `Searched pattern "${displayPattern}"${patternsInfo}`;
													break;
												
												case 'delete_file':
													// For failed delete_file, show the actual error message from function_call_output
													const relatedOutput = (currentConversation?.messages || []).find(msg => 
														msg.type === 'function_call_output' && 
														msg.related_to === message.id
													);
													if (relatedOutput && relatedOutput.output) {
														functionMessage = relatedOutput.output;
													} else {
														const deleteArgs = parseFunctionArgs(functionCall, { filename: 'unknown' });
														functionMessage = `Delete ${deleteArgs.filename}`;
													}
													break;

												case 'search_replace':
													// For failed search_replace, show "Model failed to edit [filename]" (like Rao)
													const searchReplaceArgs = parseFunctionArgs(functionCall, { file_path: 'unknown' });
													const searchReplaceFilePath = searchReplaceArgs.file_path || searchReplaceArgs.filename || 'unknown';
													const searchReplaceFilename = searchReplaceFilePath ? CommonUtils.getBasename(searchReplaceFilePath) : 'unknown';
													functionMessage = `Model failed to edit ${searchReplaceFilename}`;
													break;

											default:
												console.log(`[DEBUG MESSAGE RENDER] Using default fallback for function: ${functionCall.name}`);
												functionMessage = functionCall.name.replace(/_/g, ' ');
											}
											
											return (
												<div key={message.id} className="erdos-ai-function-call-message">
													{functionMessage}
												</div>
											);
										}
										
										// Check if this is a function call display message (from streaming)
										if ((message as any).isFunctionCallDisplay) {
											return (
												<div key={message.id} className="erdos-ai-function-call-message">
													{message.content}
												</div>
											);
										}
										
										// Regular assistant messages
										return (
											<div key={message.id} className="erdos-ai-message assistant">
												{markdownRenderer ? (
													<ErdosAiMarkdownComponent
														content={message.content || ''}
														isStreaming={false}
														renderer={markdownRenderer}
														className="erdos-ai-message-content"
													/>
												) : (
													message.content || ''
												)}
											</div>
										);
									}
								}
							});
						})()}
						
						{/* Display active streaming message */}
						{currentConversation?.streaming && markdownRenderer && (
							<div className="erdos-ai-message assistant">
								<ErdosAiMarkdownComponent
									content={currentConversation.streaming.content}
									isStreaming={true}
									renderer={markdownRenderer}
									className="erdos-ai-message-content"
								/>
							</div>
						)}

					</>
				)}
				{/* Thinking message as part of conversation flow - following Rao's pattern */}
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


				{/* Display streaming errors in conversation - exactly like Rao */}
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

			{/* All widget functionality has been removed from Erdos AI */}

			{/* Context bar for file/folder/chat/docs attachments */}
			{props.fileService && props.fileDialogService && (
				<ContextBar
					contextService={props.erdosAiService.getContextService()}
					fileService={props.fileService}
					fileDialogService={props.fileDialogService}
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
							{/* Image attachment button */}
							<div className="image-attachment-wrapper">
								{props.fileDialogService ? (
									(() => {
										// Use exact same logic as handleSendMessage for conversation
										if (!currentConversation) {
											return (
												<button 
													className="erdos-ai-image-attach-btn"
													onClick={async () => {
														try {
															// Create conversation first, exactly like handleSendMessage does
															await props.erdosAiService.newConversation();
														} catch (error) {
															console.error('Failed to create conversation:', error);
															// Note: conversation creation errors should use dialogs, not streaming errors
														}
													}}
													title="Create conversation to attach images"
												>
													<PlotsIcon width={16} height={16} />
												</button>
											);
										}
										
										// Now we know conversation exists, get the service (same as sendMessage flow)
										const imageService = props.erdosAiService.getImageAttachmentService();
										if (!imageService) {
											console.error('Image service should be available when conversation exists');
											return (
												<button 
													className="erdos-ai-image-attach-btn disabled"
													disabled
													title="Image service unavailable"
												>
													<PlotsIcon width={16} height={16} />
												</button>
											);
										}

										return (
											<ImageAttachmentButton
												key={`image-attachment-${currentConversation.info.id}`}
												imageAttachmentService={imageService}
												fileDialogService={props.fileDialogService}
												onError={(message) => {
													console.error('Image attachment error:', message);
													// Note: image attachment errors should use dialogs, not streaming errors
												}}
											/>
										);
									})()
								) : (
									// Show disabled if no file dialog service
									<button 
										className="erdos-ai-image-attach-btn disabled"
										disabled
										title="File dialog service not available"
									>
										<PlotsIcon width={16} height={16} />
									</button>
								)}

							</div>
							{inputValue.trim() ? (
								<button
									className="erdos-ai-send-button"
									onClick={handleSendMessage}
									title="Send message (will stop current operation if needed)"
								>
									<span className="codicon codicon-send"></span>
								</button>
							) : (isLoading || isAiProcessing) ? (
								<button
									className="erdos-ai-stop-button"
									onClick={handleCancelStreaming}
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
};
