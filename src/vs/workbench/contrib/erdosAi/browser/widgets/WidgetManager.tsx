/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect, memo, useCallback } from 'react';
import { IErdosAiServiceCore } from '../../../../services/erdosAi/common/erdosAiServiceCore.js';
import { ConversationMessage } from '../../../../services/erdosAi/common/conversationTypes.js';
import { IErdosAiWidgetInfo, IErdosAiWidgetHandlers, IMonacoWidgetServices } from '../widgets/widgetTypes.js';
import { ICommonUtils } from '../../../../services/erdosAiUtils/common/commonUtils.js';
import { BashCommandExtractor } from '../../../../services/erdosAiCommands/common/bashParser.js';
import { IFunctionParserService } from '../../../../services/erdosAiCommands/common/functionParserService.js';
import { IErdosAiSettingsService } from '../../../../services/erdosAiSettings/common/settingsService.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { MonacoWidgetEditor } from '../components/MonacoWidgetEditor.js';
import { MonacoDiffWidget } from '../components/MonacoDiffWidget.js';

interface WidgetWrapperProps {
	widgetInfo: IErdosAiWidgetInfo;
	handlers: IErdosAiWidgetHandlers;
	context: any;
	streamingContent: string;
	erdosAiService: IErdosAiServiceCore;
	diffData?: any;
	services: any;
	erdosAiSettingsService: IErdosAiSettingsService;
	commonUtils: ICommonUtils;
	functionParserService: IFunctionParserService;
	isHistorical?: boolean; // Flag to indicate this widget is from conversation log
}

/**
 * React wrapper component for widgets
 */
const WidgetWrapper: React.FC<WidgetWrapperProps> = ({ widgetInfo, handlers, context, streamingContent, erdosAiService, diffData: initialDiffData, services, erdosAiSettingsService, commonUtils, functionParserService, isHistorical }) => {
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
    
    // Terminal auto-accept state
    const [showAllowListButton, setShowAllowListButton] = useState(false);
    const [allowListCommands, setAllowListCommands] = useState<string[]>([]);
    
    // Console auto-accept state
    const [showConsoleAllowListButton, setShowConsoleAllowListButton] = useState(false);
    const [consoleAllowListCommands, setConsoleAllowListCommands] = useState<string[]>([]);
    
    // Language extracted from streaming updates (for console/terminal commands)
    const [extractedLanguage, setExtractedLanguage] = useState<'python' | 'r' | undefined>(widgetInfo.language);
    

    useEffect(() => {
        // Always update content when streamingContent changes, unless streamingContent is null/undefined
        // and we already have content (this prevents clearing content when widgets are recreated)
        if (streamingContent !== null && streamingContent !== undefined) {
            setCurrentContent(streamingContent);
        } else if (!currentContent) {
            setCurrentContent(streamingContent);
        }
    }, [streamingContent]);


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

	// Handle async content updates for run_file widgets
	useEffect(() => {
		// First, check if widget already has async content update (in case event fired before React mounted)
		const widget = erdosAiService.getWidget(widgetInfo.messageId);
		if (widget && widget.hasAsyncContentUpdate) {
			setCurrentContent(widget.accumulatedContent);
			setStreamingComplete(true);
		}

		// Set up listener for future content updates
		const contentUpdateDisposable = erdosAiService.onWidgetContentUpdated((update) => {
			if (update.messageId === widgetInfo.messageId) {
				setCurrentContent(update.content);
				setStreamingComplete(true);
			}
		});

		return () => {
			contentUpdateDisposable.dispose();
		};
	}, [erdosAiService, widgetInfo.messageId]);

	// Check if we should show the Allow-list button for terminal commands
	useEffect(() => {
		if (functionType === 'run_terminal_cmd' && !isWindows && streamingComplete && buttonsVisible) {
			checkTerminalAutoAcceptStatus();
		}
	}, [functionType, streamingComplete, buttonsVisible, currentContent]);

	// Check if we should show the Allow-list button for console commands
	useEffect(() => {
		if (functionType === 'run_console_cmd' && streamingComplete && buttonsVisible) {
			checkConsoleAutoAcceptStatus();
		}
	}, [functionType, streamingComplete, buttonsVisible, currentContent]);

	// Check if we should show the Allow-list button for run_file commands
	useEffect(() => {
		if (functionType === 'run_file' && streamingComplete && buttonsVisible) {
			checkRunFileAutoAcceptStatus();
		}
	}, [functionType, streamingComplete, buttonsVisible, currentContent]);

	const checkTerminalAutoAcceptStatus = async () => {
		try {
			if (!erdosAiSettingsService) return;

			const [autoAcceptEnabled, mode] = await Promise.all([
				erdosAiSettingsService.getAutoAcceptTerminal(),
				erdosAiSettingsService.getTerminalAutoAcceptMode()
			]);

			// Create BashCommandExtractor instance
			const bashParser = new BashCommandExtractor(services.commandService, erdosAiSettingsService);

			if (!autoAcceptEnabled) {
				// Auto-accept is off, parse the command to show Allow-list button with actual commands
				// Extract commands by calling the extension host directly
				const result = await services.commandService.executeCommand('erdosAi.parseBashCommands', currentContent);
				const commands = result as string[] || [];
				setAllowListCommands(commands);
				setShowAllowListButton(commands.length > 0);
			} else if (mode === 'allow-list') {
				// Auto-accept is on with allow-list mode, check if command should be auto-accepted
				const shouldAutoAccept = await bashParser.checkAutoAccept(currentContent);
				if (!shouldAutoAccept) {
					// Command not auto-accepted, extract actual commands for Allow-list button
					const result = await services.commandService.executeCommand('erdosAi.parseBashCommands', currentContent);
					const commands = result as string[] || [];
					setAllowListCommands(commands);
					setShowAllowListButton(commands.length > 0);
				} else {
					// Command should be auto-accepted
					setShowAllowListButton(false);
					setButtonsVisible(false); // Hide all buttons for auto-accepted commands
					
					// Automatically execute the command
					handlers.onAccept?.(widgetInfo.messageId, currentContent);
				}
			} else {
				// Deny-list mode, check if command should be auto-accepted
				const shouldAutoAccept = await bashParser.checkAutoAccept(currentContent);
				
				if (shouldAutoAccept) {
					// Command should be auto-accepted
					setShowAllowListButton(false);
					setButtonsVisible(false); // Hide all buttons for auto-accepted commands
					
					// Automatically execute the command
					handlers.onAccept?.(widgetInfo.messageId, currentContent);
				} else {
					// Command is in deny-list, show normal buttons (no Allow-list button in deny-list mode)
					setShowAllowListButton(false);
				}
			}
		} catch (error) {
			console.error('Failed to check terminal auto-accept status:', error);
			setShowAllowListButton(false);
		}
	};

	const checkConsoleAutoAcceptStatus = async () => {
		try {
			if (!erdosAiSettingsService) return;

			const [autoAcceptEnabled, mode] = await Promise.all([
				erdosAiSettingsService.getAutoAcceptConsole(),
				erdosAiSettingsService.getConsoleAutoAcceptMode()
			]);

		// Use extracted language from streaming updates, fallback to widgetInfo.language
		const language = extractedLanguage || widgetInfo.language;
		
		if (!language) {
			console.error('No language specified for console command');
			return;
		}

		if (!autoAcceptEnabled) {
			// Auto-accept is off, parse the command to show Allow-list button with actual function calls
			// Extract function calls for display
			const functionCalls = await functionParserService.extractFunctionCallsForDisplay(currentContent, language);
			const commands = functionCalls ? functionCalls.split(', ').filter((cmd: string) => cmd.trim()) : [];
			setConsoleAllowListCommands(commands);
			setShowConsoleAllowListButton(commands.length > 0);
		} else if (mode === 'allow-list') {
			// Auto-accept is on with allow-list mode, check if command should be auto-accepted
			const shouldAutoAccept = await functionParserService.checkAutoAccept(currentContent, language);
			if (!shouldAutoAccept) {
				// Command not auto-accepted, extract actual function calls for Allow-list button
				const functionCalls = await functionParserService.extractFunctionCallsForDisplay(currentContent, language);
				const commands = functionCalls ? functionCalls.split(', ').filter((cmd: string) => cmd.trim()) : [];
				setConsoleAllowListCommands(commands);
				setShowConsoleAllowListButton(commands.length > 0);
			} else {
				// Command should be auto-accepted
				setShowConsoleAllowListButton(false);
				setButtonsVisible(false); // Hide all buttons for auto-accepted commands
				
				// Automatically execute the command
				handlers.onAccept?.(widgetInfo.messageId, currentContent);
			}
		} else {
			// Deny-list mode, check if command should be auto-accepted
			const shouldAutoAccept = await functionParserService.checkAutoAccept(currentContent, language);
			
			if (shouldAutoAccept) {
				// Command should be auto-accepted
				setShowConsoleAllowListButton(false);
				setButtonsVisible(false); // Hide all buttons for auto-accepted commands
				
				// Automatically execute the command
				handlers.onAccept?.(widgetInfo.messageId, currentContent);
			} else {
				// Command is in deny-list, show normal buttons (no Allow-list button in deny-list mode)
				setShowConsoleAllowListButton(false);
			}
		}
		} catch (error) {
			console.error('Failed to check console auto-accept status:', error);
			setShowConsoleAllowListButton(false);
		}
	};

	const checkRunFileAutoAcceptStatus = async () => {
		try {
			if (!erdosAiSettingsService) return;

			const [autoAcceptEnabled, mode] = await Promise.all([
				erdosAiSettingsService.getAutoAcceptConsole(),
				erdosAiSettingsService.getConsoleAutoAcceptMode()
			]);

			// Determine language from filename extension (same logic as fileCommandHandler.ts)
			let language: 'python' | 'r' = 'r';
			if (widgetInfo.filename) {
				const fileExt = commonUtils.getFileExtension(widgetInfo.filename).toLowerCase();
				if (fileExt === 'py' || fileExt === 'ipynb') {
					language = 'python';
				} else if (fileExt === 'r' || fileExt === 'rmd' || fileExt === 'qmd') {
					language = 'r';
				}
			}

			if (!autoAcceptEnabled) {
				// Auto-accept is off, parse the file content to show Allow-list button with actual function calls
				const functionCalls = await functionParserService.extractFunctionCallsForDisplay(currentContent, language);
				const commands = functionCalls ? functionCalls.split(', ').filter((cmd: string) => cmd.trim()) : [];
				setConsoleAllowListCommands(commands);
				setShowConsoleAllowListButton(commands.length > 0);
			} else if (mode === 'allow-list') {
				// Auto-accept is on with allow-list mode, check if file content should be auto-accepted
				const shouldAutoAccept = await functionParserService.checkAutoAccept(currentContent, language);
				if (!shouldAutoAccept) {
					// File content not auto-accepted, extract actual function calls for Allow-list button
					const functionCalls = await functionParserService.extractFunctionCallsForDisplay(currentContent, language);
					const commands = functionCalls ? functionCalls.split(', ').filter((cmd: string) => cmd.trim()) : [];
					setConsoleAllowListCommands(commands);
					setShowConsoleAllowListButton(commands.length > 0);
				} else {
					// File content should be auto-accepted
					setShowConsoleAllowListButton(false);
					setButtonsVisible(false); // Hide all buttons for auto-accepted commands
					
					// Automatically execute the file
					handlers.onAccept?.(widgetInfo.messageId, currentContent);
				}
			} else {
				// Deny-list mode, check if file content should be auto-accepted
				const shouldAutoAccept = await functionParserService.checkAutoAccept(currentContent, language);
				
				if (shouldAutoAccept) {
					// File content should be auto-accepted
					setShowConsoleAllowListButton(false);
					setButtonsVisible(false); // Hide all buttons for auto-accepted commands
					
					// Automatically execute the file
					handlers.onAccept?.(widgetInfo.messageId, currentContent);
				} else {
					// File content is in deny-list, show normal buttons (no Allow-list button in deny-list mode)
					setShowConsoleAllowListButton(false);
				}
			}
		} catch (error) {
			console.error('Failed to check run_file auto-accept status:', error);
			setShowConsoleAllowListButton(false);
		}
	};

	// Set up streaming update listener immediately (synchronously) when component is created
	// This avoids race condition where backend fires completion event before useEffect runs
	const [streamingUpdateDisposable] = useState(() => {
		return erdosAiService.onWidgetStreamingUpdate((update) => {
			if (update.messageId === widgetInfo.messageId) {
				if (update.diffData) {
					setDiffData(update.diffData);
					
					// For search_replace widgets, show buttons when diff data arrives
					// This ensures buttons only appear after the diff is computed and ready for display
					// But don't show buttons if auto-accept is enabled
					if (functionType === 'search_replace' && !buttonsVisible && !widgetInfo.autoAccept) {
						setButtonsVisible(true);
					}
				}
				
				if (update.replaceContent && update.delta) {
					setCurrentContent(update.delta);
				}
				
				// Extract language from streaming update (for console/terminal commands)
				if (update.language && !extractedLanguage) {
					setExtractedLanguage(update.language);
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


	const handleAccept = () => {
		handlers.onAccept?.(widgetInfo.messageId, currentContent);
	};

	const handleCancel = () => {
		handlers.onCancel?.(widgetInfo.messageId);
	};

	const handleAllowList = async () => {
		try {
			const settingsService = erdosAiSettingsService;
			if (!settingsService) {
				return;
			}

			// Add commands to allow list
			for (const command of allowListCommands) {
				await settingsService.addToTerminalAllowList(command);
			}

			// Enable auto-accept terminal if not already enabled
			const autoAcceptEnabled = await settingsService.getAutoAcceptTerminal();
			if (!autoAcceptEnabled) {
				await settingsService.setAutoAcceptTerminal(true);
			}

			// Hide the Allow-list button and accept the command
			setShowAllowListButton(false);
			handlers.onAccept?.(widgetInfo.messageId, currentContent);
		} catch (error) {
			console.error('Failed to handle Allow-list button:', error);
		}
	};

	const handleConsoleAllowList = async () => {
		try {
			const settingsService = erdosAiSettingsService;
			if (!settingsService) {
				return;
			}

			let language: 'python' | 'r';
			
			if (functionType === 'run_file') {
				// For run_file, determine language from filename extension (same logic as checkRunFileAutoAcceptStatus)
				language = 'r';
				if (widgetInfo.filename) {
					const fileExt = commonUtils.getFileExtension(widgetInfo.filename).toLowerCase();
					if (fileExt === 'py' || fileExt === 'ipynb') {
						language = 'python';
					} else if (fileExt === 'r' || fileExt === 'rmd' || fileExt === 'qmd') {
						language = 'r';
					}
				}
			} else {
				// For run_console_cmd, use the same language as determined in checkConsoleAutoAcceptStatus
				const extractedOrWidgetLanguage = extractedLanguage || widgetInfo.language;
				if (!extractedOrWidgetLanguage) {
					return;
				}
				language = extractedOrWidgetLanguage as 'python' | 'r';
			}
			
			// Add function calls to the console allow list with language tuples
			for (const functionCall of consoleAllowListCommands) {
				await settingsService.addToConsoleAllowList(functionCall, language);
			}

			// Enable auto-accept console if not already enabled
			const autoAcceptEnabled = await settingsService.getAutoAcceptConsole();
			if (!autoAcceptEnabled) {
				await settingsService.setAutoAcceptConsole(true);
			}

			// Hide the Allow-list button and accept the command
			setShowConsoleAllowListButton(false);
			handlers.onAccept?.(widgetInfo.messageId, currentContent);
		} catch (error) {
			console.error('Failed to handle console Allow-list button:', error);
		}
	};

	const formatAllowListButtonText = (commands: string[], limit: number = 10): { text: string; tooltip: string } => {
		const fullList = commands.join(', ');
		if (commands.length <= limit) {
			return {
				text: fullList,
				tooltip: `Allow-list ${fullList} and run`
			};
		}
		
		const displayedCommands = commands.slice(0, limit).join(', ');
		const remaining = commands.length - limit;
		return {
			text: `${displayedCommands} and ${remaining} more`,
			tooltip: `Allow-list ${fullList} and run`
		};
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

	const handleHeaderClick = useCallback(async () => {
		if (!widgetInfo.filename || !services.editorService) {
			return;
		}

		try {
			// Use fileResolverService directly
			const result = await services.fileResolverService.resolveFileForWidget(widgetInfo.filename);
			
			if (result.found && result.uri) {
				// Open the file in the editor
				await services.editorService.openEditor({
					resource: result.uri,
					options: { 
						pinned: false,
						revealIfOpened: true,
						preserveFocus: false
					}
				});
			}
		} catch (error) {
			console.error('Failed to open file:', error);
			// Silently fail - don't show error to user for this convenience feature
		}
	}, [widgetInfo.filename, functionType, services]);

	const getWidgetTitleInfo = () => {
		// Get the current language for display (extracted or from widgetInfo)
		const currentLanguage = extractedLanguage || widgetInfo.language;
		
		switch (functionType) {
			case 'run_console_cmd': 
				const consoleTitle = currentLanguage ? `${currentLanguage.charAt(0).toUpperCase() + currentLanguage.slice(1)} Console` : 'Console';
				return { title: consoleTitle, filename: null, diffStats: null };
			case 'run_terminal_cmd': 
				return { title: 'Terminal', filename: null, diffStats: null };
		case 'search_replace': 
			const searchReplaceFilename = widgetInfo.filename 
				? commonUtils.getBasename(widgetInfo.filename)
				: 'Search & Replace';
			
			// Handle the two distinct cases precisely
			let diffStats: { added: number; deleted: number } | null = null;
			
			if (isHistorical) {
				// Historical widget: use pre-computed diffStats from widgetInfo
				diffStats = widgetInfo.diffStats || null;
			} else {
				// Streaming widget: use live diffData state that gets updated via streaming
				diffStats = diffData ? { added: diffData.added || 0, deleted: diffData.deleted || 0 } : null;
			}
			
			return { 
				title: null, 
				filename: searchReplaceFilename, 
				diffStats: diffStats 
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
		// For run_file with .ipynb files (notebook cells), don't show > symbol
		if (functionType === 'run_file' && widgetInfo.filename && commonUtils.getFileExtension(widgetInfo.filename).toLowerCase() === 'ipynb') {
			return '';
		}
		return (functionType === 'run_console_cmd' || functionType === 'run_file') ? '>' : '$';
	};

	const isConsoleOrTerminal = functionType === 'run_console_cmd' || functionType === 'run_terminal_cmd' || functionType === 'run_file';
	const buttonLabel = functionType === 'search_replace' ? 'Accept' : functionType === 'delete_file' ? 'Delete' : 'Run';
	const titleInfo = getWidgetTitleInfo();
	
	// Get Monaco font configuration for the header
	const getHeaderFontStyle = () => {
		if (!widgetInfo.monacoServices) return {};
		
		try {
			const editorConfig = services.configurationService.getValue('editor');
			
			// Simple font extraction without full font measurements for header
			const fontSize = editorConfig.fontSize || 12;
			const fontFamily = editorConfig.fontFamily || 'Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace';
			
			return {
				fontSize: `${fontSize}px`,
				fontFamily: fontFamily,
				fontWeight: 'normal'
			};
		} catch (error) {
			console.warn('[WidgetManager] Failed to get header font style:', error);
			return {};
		}
	};

	if (functionType === 'delete_file') {
		return (
			<div className="delete-file-widget-custom">
				<div className={`delete-file-content ${widgetInfo.filename ? 'widget-header-clickable' : ''}`}
					 onClick={widgetInfo.filename ? handleHeaderClick : undefined}
					 title={widgetInfo.filename ? `Click to open ${widgetInfo.filename}` : undefined}>
					<span className="delete-file-text">
						Delete: <span>
							{widgetInfo.filename}
						</span>
					</span>
					{buttonsVisible && streamingComplete && (
						<div className="delete-file-buttons" onClick={(e) => e.stopPropagation()}>
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
				<div className={`widget-header ${widgetInfo.filename ? 'widget-header-clickable' : ''}`} 
					 onClick={widgetInfo.filename ? handleHeaderClick : undefined}
					 title={widgetInfo.filename ? `Click to open ${widgetInfo.filename}` : undefined}>
					<div className="widget-header-content" style={getHeaderFontStyle()}>
						{titleInfo.title && <span>{titleInfo.title}</span>}
						{titleInfo.filename && (
							<>
								<span>
									{titleInfo.filename}
								</span>
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
					<div className="widget-header-actions" onClick={(e) => e.stopPropagation()}>
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
								{(() => {
									return (
										<MonacoWidgetEditor
											content={currentContent || ''}
											functionType={functionType}
											language={extractedLanguage}
											isReadOnly={false}
											monacoServices={widgetInfo.monacoServices!}
											configurationService={services.configurationService}
											commonUtils={commonUtils}
											onContentChange={setCurrentContent}
											className="console-monaco-editor"
										/>
									);
								})()}
							</div>
						) : functionType === 'search_replace' ? (
							<MonacoDiffWidget
								content={currentContent || 'Loading search and replace content...'}
								diffData={diffData}
								filename={widgetInfo.filename}
								monacoServices={widgetInfo.monacoServices!}
								configurationService={services.configurationService}
								commonUtils={commonUtils}
								jupytextService={services.jupytextService}
								className="search-replace-monaco-diff"
							/>
						) : (
							(() => {
								return (
									<MonacoWidgetEditor
										content={currentContent || ''}
										filename={widgetInfo.filename}
										functionType={functionType}
										isReadOnly={false}
										monacoServices={widgetInfo.monacoServices!}
										configurationService={services.configurationService}
										commonUtils={commonUtils}
										onContentChange={setCurrentContent}
										className="widget-monaco-editor"
									/>
								);
							})()
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
						{showAllowListButton && functionType === 'run_terminal_cmd' && (() => {
							const { text, tooltip } = formatAllowListButtonText(allowListCommands);
							return (
								<button
									className="widget-button widget-button-allowlist"
									onClick={handleAllowList}
									title={tooltip}
								>
									Allow-list {text}
								</button>
							);
						})()}
						{showConsoleAllowListButton && (functionType === 'run_console_cmd' || functionType === 'run_file') && (() => {
							const { text, tooltip } = formatAllowListButtonText(consoleAllowListCommands);
							return (
								<button
									className="widget-button widget-button-allowlist"
									onClick={handleConsoleAllowList}
									title={tooltip}
								>
									Allow-list {text}
								</button>
							);
						})()}
					</div>
				</div>
			)}
		</div>
	);
};

export async function executeWidgetActionWithRequestId(
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
	
	// Pass the request ID to ensure the signal is only processed by the correct conversation
	erdosAiService.signalProcessingContinuation(requestId);
}

export function createWidgetHandlers(
	functionName: string, 
	erdosAiService: IErdosAiServiceCore,
	erdosAiFullService: IErdosAiServiceCore | undefined,
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
				
				await executeWidgetActionWithRequestId('accept', functionName, erdosAiService, erdosAiFullService, messageId, requestId, content);
			} catch (error) {
				console.error('Failed to accept widget command:', error);
				// State machine will handle processing state - no manual override needed
			}
		}
	};
}

export function createWidgetInfo(
	message: ConversationMessage,
	functionName: string,
	args: any,
	initialContent: string,
	handlers: IErdosAiWidgetHandlers,
	diffData?: any,
	showButtons?: boolean,
	monacoServices?: IMonacoWidgetServices
): IErdosAiWidgetInfo {
	const widgetInfo: IErdosAiWidgetInfo = {
		messageId: message.id,
		conversationId: message.conversationId,
		requestId: message.request_id || `req_${message.id}`,
		functionCallType: functionName as 'search_replace' | 'run_console_cmd' | 'run_terminal_cmd' | 'delete_file' | 'run_file',
		filename: args.filename || args.file_path || undefined,
		initialContent: initialContent,
		startLine: args.start_line_one_indexed,
		endLine: args.end_line_one_indexed_inclusive,
		language: args.language, // Extract language from function call arguments
		monacoServices: monacoServices,
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

// Memoized components to prevent unnecessary re-renders
export const MemoizedWidgetWrapper = memo(WidgetWrapper);

export { WidgetWrapper };
