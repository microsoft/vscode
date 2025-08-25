/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IErdosAiService } from '../common/erdosAiService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IViewZoneChangeAccessor, MouseTargetType, IViewZone } from '../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';


import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { joinPath } from '../../../../base/common/resources.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';


import { IRuntimeSessionService, RuntimeStartMode } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { IJupytextService } from './services/jupytextService.js';
import { TerminalAutoRunner } from './services/terminalAutoRunner.js';

import { ILanguageRuntimeMessageOutput, ILanguageRuntimeMessageResult, ILanguageRuntimeMessageError, ILanguageRuntimeMessageStream, RuntimeCodeExecutionMode, RuntimeErrorBehavior, LanguageRuntimeSessionMode, ILanguageRuntimeService } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { INotebookExecutionService } from '../../notebook/common/notebookExecutionService.js';
import { INotebookEditor } from '../../notebook/browser/notebookBrowser.js';
import { CellKind, NOTEBOOK_EDITOR_ID } from '../../notebook/common/notebookCommon.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IRuntimeStartupService } from '../../../services/runtimeStartup/common/runtimeStartupService.js';

import { BackendClient } from './api/backendClient.js';
import { ConversationManager } from './conversation/conversationManager.js';
import { ConversationSummarization } from './conversation/conversationSummarization.js';
import { filterDiffForDisplay as filterDiff, diffStorage as diffStore } from './utils/diffUtils.js';
import { fileChangesStorage } from './utils/fileChangesUtils.js';
import { ConversationVariableManager } from './conversation/conversationVariableManager.js';
import { Conversation, ConversationInfo, ConversationMessage } from './conversation/conversationTypes.js';
import { ApiKeyManager } from './settings/apiKeyManager.js';
import { StreamData } from './api/streamingParser.js';
import { IErdosAiWidgetInfo } from './widgets/widgetTypes.js';
import { IOAuthCallbackService, OAuthCallbackService } from './services/oauthCallbackService.js';
import { DocumentManager } from './document/documentManager.js';
import { ContextManager } from './context/contextManager.js';
import { CommonUtils } from './utils/commonUtils.js';


import { FileBrowser } from './context/fileBrowser.js';
import { ContextService } from './context/contextService.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ErdosAiMarkdownRenderer } from './markdown/erdosAiMarkdownRenderer.js';
import { InfrastructureRegistry } from './functions/infrastructureRegistry.js';
import { ISearchService } from '../../../services/search/common/search.js';
import { FunctionCallOrchestrator } from './functions/functionCallOrchestrator.js';
import { ErdosAiOrchestrator } from './orchestrator/erdosAiOrchestrator.js';
import { ImageAttachmentService, IImageAttachmentService } from './attachments/imageAttachmentService.js';

// Import CSS for diff highlighting
import './media/erdosAiDiffHighlighting.css';


export class ErdosAiService extends Disposable implements IErdosAiService {
	declare readonly _serviceBrand: undefined;

	private readonly _onConversationCreated = this._register(new Emitter<Conversation>());
	readonly onConversationCreated: Event<Conversation> = this._onConversationCreated.event;

	private readonly _onConversationLoaded = this._register(new Emitter<Conversation>());
	readonly onConversationLoaded: Event<Conversation> = this._onConversationLoaded.event;

	private readonly _onMessageAdded = this._register(new Emitter<ConversationMessage>());
	readonly onMessageAdded: Event<ConversationMessage> = this._onMessageAdded.event;

	private readonly _onStreamingData = this._register(new Emitter<StreamData>());
	readonly onStreamingData: Event<StreamData> = this._onStreamingData.event;

	private readonly _onStreamingComplete = this._register(new Emitter<void>());
	readonly onStreamingComplete: Event<void> = this._onStreamingComplete.event;

	private readonly _onStreamingError = this._register(new Emitter<{ errorId: string; message: string }>());
	readonly onStreamingError: Event<{ errorId: string; message: string }> = this._onStreamingError.event;

	private readonly _onThinkingMessage = this._register(new Emitter<{ message: string; hideCancel?: boolean }>());
	readonly onThinkingMessage: Event<{ message: string; hideCancel?: boolean }> = this._onThinkingMessage.event;

	private readonly _onOrchestratorStateChange = this._register(new Emitter<{isProcessing: boolean}>());
	readonly onOrchestratorStateChange: Event<{isProcessing: boolean}> = this._onOrchestratorStateChange.event;

	private readonly _onFunctionCallDisplayMessage = this._register(new Emitter<{ id: number; content: string; timestamp: string }>());
	readonly onFunctionCallDisplayMessage: Event<{ id: number; content: string; timestamp: string }> = this._onFunctionCallDisplayMessage.event;

	private readonly _onWidgetRequested = this._register(new Emitter<IErdosAiWidgetInfo>());
	readonly onWidgetRequested: Event<IErdosAiWidgetInfo> = this._onWidgetRequested.event;

	private readonly _onWidgetStreamingUpdate = this._register(new Emitter<{ 
		messageId: number; 
		delta: string; 
		isComplete: boolean; 
		replaceContent?: boolean;
		isSearchReplace?: boolean;
		field?: string;
		filename?: string;
		requestId?: string;
		diffData?: {
			diff: any[];
			added: number;
			deleted: number;
			clean_filename?: string;
		};
	}>());

	// File change tracking events - similar to Rao's implementation
	private readonly _onFileChangesDetected = this._register(new Emitter<{ conversationId: number; changedFiles: URI[] }>());
	readonly onFileChangesDetected: Event<{ conversationId: number; changedFiles: URI[] }> = this._onFileChangesDetected.event;
	readonly onWidgetStreamingUpdate: Event<{ 
		messageId: number; 
		delta: string; 
		isComplete: boolean; 
		replaceContent?: boolean;
		isSearchReplace?: boolean;
		field?: string;
		filename?: string;
		requestId?: string;
	}> = this._onWidgetStreamingUpdate.event;

	private readonly _onWidgetButtonAction = this._register(new Emitter<{ messageId: number; action: string }>());
	readonly onWidgetButtonAction: Event<{ messageId: number; action: string }> = this._onWidgetButtonAction.event;

	private readonly backendClient: BackendClient;
	private readonly conversationManager: ConversationManager;
	private readonly conversationSummarization: ConversationSummarization;
	private readonly conversationVariableManager: ConversationVariableManager;
	private readonly apiKeyManager: ApiKeyManager;
	private currentRequestId: string | undefined;
	private currentRequestWasCancelled = false;
	private readonly oauthCallbackService: IOAuthCallbackService;
	
	private readonly documentManager: DocumentManager;
	private readonly contextManager: ContextManager;
	private readonly terminalAutoRunner: TerminalAutoRunner;

	private readonly fileBrowser: FileBrowser;
	private readonly contextService: ContextService;
	private readonly markdownRenderer: ErdosAiMarkdownRenderer;
	
		// Image attachment service
	private imageAttachmentServices: Map<string, IImageAttachmentService> = new Map();
	
	// Thinking tag processing
	private streamingBuffer: string = '';
	
	/**
	 * Process thinking tags by buffering content and converting to proper HTML elements
	 * Converts <thinking> to <em class="erdos-ai-thinking"> and </thinking> to </em>
	 * Handles streaming scenarios where tags might be split across deltas
	 */
	private processThinkingTagsWithBuffer(delta: string): string {
		this.streamingBuffer += delta;
		
		// First, handle complete thinking blocks
		let processed = this.streamingBuffer.replace(
			/<thinking>([\s\S]*?)<\/thinking>/g,
			'<em class="erdos-ai-thinking">$1</em>'
		);
		
		// Check if we have an incomplete opening tag at the end (like "<thinki" or "<thinking")
		const incompleteOpenMatch = processed.match(/<thinking(?:\s[^>]*)?$/);
		if (incompleteOpenMatch) {
			// Keep the incomplete tag in buffer for next delta
			const incompleteTag = incompleteOpenMatch[0];
			const output = processed.substring(0, processed.length - incompleteTag.length);
			this.streamingBuffer = incompleteTag;
			return output;
		}
		
		// Check if we have an incomplete closing tag at the end (like "</thinki" or "</thinking")
		const incompleteCloseMatch = processed.match(/<\/thinking?(?:\s[^>]*)?$/);
		if (incompleteCloseMatch) {
			// Keep the incomplete tag in buffer for next delta
			const incompleteTag = incompleteCloseMatch[0];
			const output = processed.substring(0, processed.length - incompleteTag.length);
			this.streamingBuffer = incompleteTag;
			return output;
		}
		
		// Convert any complete standalone tags
		processed = processed.replace(/<thinking>/g, '<em class="erdos-ai-thinking">');
		processed = processed.replace(/<\/thinking>/g, '</em>');
		
		// Return all processed content and clear buffer
		const result = processed;
		this.streamingBuffer = '';
		return result;
	}
	
	/**
	 * Reset streaming buffer
	 */
	private resetThinkingBuffer(): void {
		this.streamingBuffer = '';
	}
	
	/**
	 * Process thinking tags in a complete message (non-streaming)
	 * This is used for final message processing to ensure any remaining thinking tags are converted
	 */
	private processThinkingTagsComplete(content: string): string {
		// Process complete blocks
		let processed = content.replace(
			/<thinking>([\s\S]*?)<\/thinking>/g,
			'<em class="erdos-ai-thinking">$1</em>'
		);
		
		// Convert any standalone tags
		processed = processed.replace(/<thinking>/g, '<em class="erdos-ai-thinking">');
		processed = processed.replace(/<\/thinking>/g, '</em>');
		
		return processed;
	}

	// Phase 5 - Function Call System Infrastructure
	private readonly infrastructureRegistry: InfrastructureRegistry;
	private readonly functionCallOrchestrator: FunctionCallOrchestrator;
	
	private functionCallBuffer: Array<{ function_call: any, request_id: string, message_id: string | number }> = [];
	private functionCallMessageIds: Map<string, number> = new Map(); // Maps call_id to message_id
	
	// Thinking message tracking - following Rao's pattern
	private lastThinkingMessageTime: Date | null = null;
	private isThinkingMessageActive = false;

	// Terminal state tracking (like Rao's global variables)
	private terminalInstances = new Map<string, {
		instance: any,
		callId: string,
		outputBuffer: string,
		exitCode: number | undefined,
		isDone: boolean
	}>();

	// Real orchestrator (like Rao's AiOrchestrator)
	private _orchestrator: ErdosAiOrchestrator;
	
	public get orchestrator(): ErdosAiOrchestrator {
		return this._orchestrator;
	}

	// File change tracking - similar to Rao's approach
	private readonly conversationFileHighlighting = new Map<number, boolean>(); // conversation ID -> enabled
	private readonly fileDecorations = new Map<string, string[]>(); // file URI -> decoration IDs
	private readonly fileDeletedContent = new Map<string, Map<number, string[]>>(); // file URI -> line number -> deleted lines
	private readonly fileViewZones = new Map<string, string[]>(); // file URI -> view zone IDs
	private readonly fileViewZonesByLine = new Map<string, Map<number, string>>(); // file URI -> line number -> view zone ID
	private readonly fileViewZoneDomNodes = new Map<string, Map<number, HTMLElement>>(); // file URI -> line number -> DOM node
	private readonly fileExpandedStates = new Map<string, Map<number, boolean>>(); // file URI -> line number -> expanded state
	private readonly editorClickHandlers = new Set<string>(); // editor instance IDs that have handlers registered
	private modelContentChangeTimeout: any; // Debounce timeout for model content changes

	constructor(
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IHoverService private readonly hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISearchService private readonly searchService: ISearchService,
		@IRuntimeSessionService private readonly runtimeSessionService: IRuntimeSessionService,
		@IRuntimeStartupService private readonly runtimeStartupService: IRuntimeStartupService,
		@ILanguageRuntimeService private readonly languageRuntimeService: ILanguageRuntimeService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IStorageService private readonly storageService: IStorageService,
		@IJupytextService private readonly jupytextService: IJupytextService,
		@INotebookExecutionService private readonly notebookExecutionService: INotebookExecutionService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();
		
		this.oauthCallbackService = this._register(new OAuthCallbackService(this.logService, this.mainProcessService));
		
		// Initialize authentication manager with OAuth service (CRITICAL for backend communication)
		this.apiKeyManager = new ApiKeyManager(
			this.secretStorageService, 
			this.configurationService, 
			this.logService,
			this.oauthCallbackService
		);
		
		// Initialize backend client with authentication
		this.backendClient = new BackendClient(this.apiKeyManager);
		
		// Detect environment (localhost vs production) for proper backend URL
		this.initializeBackendEnvironment();
		
		// Initialize conversation manager
		this.conversationManager = new ConversationManager(
			this.fileService,
			this.environmentService,
			this.workspaceContextService
		);
		
		// Initialize conversation summarization
		this.conversationSummarization = new ConversationSummarization(
			this.fileService,
			this.backendClient
		);
		
		this.conversationVariableManager = new ConversationVariableManager(
			this.fileService,
			this.environmentService,
			this.workspaceContextService
		);
		
		this.conversationManager.setMessageIdGenerator(() => this.getNextMessageId());
		
		// Initialize document manager for editor integration
		this.documentManager = new DocumentManager(
			this.editorService,
			this.textFileService,
			this.textModelService,
			this.modelService,
			this.workspaceContextService,
			this.fileService,
			this.jupytextService
		);

		// Initialize context manager for file/directory context
		this.contextManager = new ContextManager(
			this.fileService,
			this.documentManager
		);

		// Initialize terminal auto-runner for auto-executing terminal commands
		this.terminalAutoRunner = new TerminalAutoRunner(
			this.configurationService,
			this.logService
		);
		

		
		// Initialize file browser for file/directory selection
		this.fileBrowser = new FileBrowser(
			this.fileService,
			this.workspaceContextService,
			this.fileDialogService
		);
		
		// Initialize context service for attachment management
		this.contextService = new ContextService(this.fileService, this.logService, this.conversationSummarization, this);
		
		// Initialize markdown renderer for AI content formatting
		this.markdownRenderer = new ErdosAiMarkdownRenderer(
			undefined,
			this.languageService,
			this.openerService,
			this.hoverService,
			this.fileService,
			this.commandService
		);
		
		// Initialize Phase 5 - Function Call System Infrastructure
		this.functionCallOrchestrator = new FunctionCallOrchestrator(this.logService);
		
		// Initialize the real orchestrator (like Rao's AiOrchestrator)
		this._orchestrator = new ErdosAiOrchestrator(this);
		
		// Message ID generator removed - widget functionality disabled
		
		this.infrastructureRegistry = new InfrastructureRegistry(
			this.fileService,
			this.workspaceContextService,
			this.environmentService,
			this.configurationService,
			this.editorService,
			this.textFileService,
			this.textModelService,
			this.modelService,
			this.instantiationService,
			this.jupytextService,
			this.languageRuntimeService
		);
		
		// Set the managers that infrastructure registry needs to access
		this.infrastructureRegistry.setConversationManager(this.conversationManager);
		this.infrastructureRegistry.setFunctionCallOrchestrator(this.functionCallOrchestrator);
		this.infrastructureRegistry.setSearchService(this.searchService);
		
		// Widget manager removed

		// Message ID Manager removed - widget functionality removed from Erdos AI

		// Operation Orchestrator removed - widget functionality disabled
		
		// Delta accumulator simplified - widget functionality removed
		
		this.logService.info('Erdos AI service initialized with file system persistence, document integration, function extraction, markdown rendering, function call system, and streaming panel');
		
		// Console output capture is now handled directly in executeConsoleCommandWithOutputCapture
	}
	
	/**
	 * Initialize backend environment detection
	 * Detects if localhost backend is available and switches to it if so
	 */
	private async initializeBackendEnvironment(): Promise<void> {
		try {
			const config = await this.backendClient.detectEnvironment();
			const envName = config.environment === 'local' ? 'Local Development' : 'Production';
			this.logService.info(`Erdos AI backend environment detected: ${envName} (${config.url})`);
		} catch (error) {
			this.logService.warn('Failed to detect backend environment, using production:', error);
		}
	}
	
	/**
	 * Process file for execution - implements RAO's handle_run_file logic
	 * Reads file content and processes it for R execution
	 */
	private async processFileForExecution(functionCall: any, callId: string): Promise<string> {
		try {
			// Parse function arguments (same as RAO)
			const args = JSON.parse(functionCall.arguments || '{}');
			const filename = args.filename;
			const startLine = args.start_line_one_indexed;
			const endLine = args.end_line_one_indexed_inclusive;
			
			if (!filename) {
				return 'Error: No filename provided';
			}
			
			// Use the unified file resolution system
			const resolverContext = this.createResolverContext();
			const fileResult = await CommonUtils.resolveFile(filename, resolverContext);
			if (!fileResult.found || !fileResult.uri) {
				return `Error: File does not exist: ${filename}`;
			}

			const fileUri = fileResult.uri;
			
			// Check if it's a directory
			const stat = await this.fileService.resolve(fileUri);
			if (stat.isDirectory) {
				return 'Error: Cannot run directories. Specify a file instead.';
			}
			
			// Read file content using DocumentManager for .ipynb conversion
			const fileContent = await this.documentManager.getEffectiveFileContent(filename);
			
			if (fileContent === null) {
				return 'Error: File does not exist or is unreadable.';
			}
			
			if (fileContent.trim().length === 0) {
				return 'Error: File is empty.';
			}
			
			// Split content into lines for line range processing (like RAO)
			let lines = fileContent.split('\n');
			
			// Apply line range if specified (like RAO implementation)
			if (startLine !== undefined || endLine !== undefined) {
				const totalLines = lines.length;
				const start = startLine ? Math.max(1, startLine) : 1;
				const end = endLine ? Math.min(totalLines, endLine) : totalLines;
				
				if (start > totalLines) {
					return `Error: Start line ${start} exceeds file length (${totalLines} lines)`;
				}
				
				// Convert to 0-based indexing for array slice
				lines = lines.slice(start - 1, end);
			}
			
			// Check if this is an R Markdown file and extract code chunks if so (like RAO)
			const fileExt = CommonUtils.getFileExtension(filename).toLowerCase();
			let command: string;
			
			if (fileExt === 'rmd' || fileExt === 'qmd') {
				// Extract only R code chunks from the content
				const codeContent = this.extractRCodeFromRmd(lines);
				
				// If no R code chunks were found, treat the content as regular code
				if (codeContent.length === 0) {
					command = lines.join('\n');
				} else {
					command = codeContent.join('\n');
				}
			} else {
				// For regular files, use all content
				command = lines.join('\n');
			}
			
			if (!command.trim()) {
				return 'Error: No executable code found in the specified file or range.';
			}
			
			return command;
			
		} catch (error) {
			return `Error: Cannot read file: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	/**
	 * Extract R code chunks from R Markdown content (implements RAO's extract_r_code_from_rmd)
	 */
	private extractRCodeFromRmd(fileLines: string[]): string[] {
		const codeLines: string[] = [];
		let inRChunk = false;
		
		for (const line of fileLines) {
			// Check for R code chunk start
			if (/^```\{r/.test(line) || /^```r\s*$/.test(line)) {
				inRChunk = true;
				continue;
			}
			
			// Check for code chunk end
			if (/^```\s*$/.test(line)) {
				inRChunk = false;
				continue;
			}
			
			// If we're in an R chunk, collect the line
			if (inRChunk) {
				codeLines.push(line);
			}
		}
		
		return codeLines;
	}



	/**
	 * Execute console command with output capture - uses Erdos's runtime pattern
	 * Based on erdos/src/vs/workbench/contrib/chat/browser/tools/runConsoleCommandTool.ts
	 */
	private async executeConsoleCommandWithOutputCapture(command: string, executionId: string, language: string = 'r'): Promise<string> {
		
		// Get appropriate session based on language
		const session = this.runtimeSessionService.getConsoleSessionForLanguage(language);
		if (!session) {
			// Try to start the appropriate session if none exists
			if (language === 'r') {
				await this.ensureRSession();
				const rSession = this.runtimeSessionService.getConsoleSessionForLanguage('r');
				if (!rSession) {
					throw new Error('No R session available and failed to start one');
				}
			} else if (language === 'python') {
				await this.ensurePythonSession();
				const pythonSession = this.runtimeSessionService.getConsoleSessionForLanguage('python');
				if (!pythonSession) {
					throw new Error('No Python session available and failed to start one');
				}
			}
			
			// Get the session again after ensuring it exists
			const retrySession = this.runtimeSessionService.getConsoleSessionForLanguage(language);
			if (!retrySession) {
				throw new Error(`No ${language} session available`);
			}
		}
		// Get the final session after potential retry
		const finalSession = this.runtimeSessionService.getConsoleSessionForLanguage(language);
		if (!finalSession) {
			throw new Error(`Failed to get ${language} session`);
		}
		
		return new Promise<string>((resolve, reject) => {
			try {
				
				// Set up output capture variables
				let outputBuffer = '';
				let errorBuffer = '';
				let resultBuffer = '';
				
				const timeout = 30000; // 30 second timeout like RAO
				
				// Create disposables for event handlers
				const disposables: IDisposable[] = [];
				
				// Set up timeout
				const timeoutHandle = setTimeout(() => {
					cleanup();
					resolve(`Error: ${language.toUpperCase()} command timed out after 30 seconds`);
				}, timeout);
				
				const cleanup = () => {
					clearTimeout(timeoutHandle);
					disposables.forEach(d => d.dispose());
				};
				
				// Handle output messages (stdout)
				disposables.push(finalSession.onDidReceiveRuntimeMessageOutput((message: ILanguageRuntimeMessageOutput) => {
					this.logService.info(`[${language.toUpperCase()} OUTPUT] Received message with parent_id: ${message.parent_id}, executionId: ${executionId}`);
					if (message.parent_id === executionId) {
						const messageData = message.data['text/plain'] || message.data || '';
						this.logService.info(`[${language.toUpperCase()} OUTPUT] Captured output: ${messageData}`);
						outputBuffer += messageData;
					}
				}));
				
				// Handle state messages for execution completion
				disposables.push(finalSession.onDidReceiveRuntimeMessageState((message: any) => {
					this.logService.info(`[${language.toUpperCase()} STATE] Received state message with parent_id: ${message.parent_id}, executionId: ${executionId}, state: ${message.state}`);
					if (message.parent_id === executionId && message.state === 'idle') {
						this.logService.info(`[${language.toUpperCase()} STATE] Execution completed, resolving with output: ${outputBuffer}`);
						cleanup();
						// Return both output and result buffers combined
						const finalOutput = (outputBuffer + resultBuffer).trim();
						resolve(finalOutput || `${language.toUpperCase()} code executed successfully`);
					}
				}));
				
				// Handle result messages (execution results) - don't auto-complete here
				disposables.push(finalSession.onDidReceiveRuntimeMessageResult((message: ILanguageRuntimeMessageResult) => {
					if (message.parent_id === executionId) {
						const messageData = message.data['text/plain'] || message.data || '';
						this.logService.info(`[${language.toUpperCase()} RESULT] Captured result: ${messageData}`);
						resultBuffer += messageData;
						// Don't resolve here - wait for state message indicating idle
					}
				}));
				
				// Handle error messages
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
				
				// Handle stream messages (stdout/stderr in real-time)
				disposables.push(finalSession.onDidReceiveRuntimeMessageStream((message: ILanguageRuntimeMessageStream) => {
					if (message.parent_id === executionId) {
						if (message.name === 'stdout') {
							outputBuffer += message.text;
						} else if (message.name === 'stderr') {
							errorBuffer += message.text;
						}
					}
				}));
				
				// Execute the command
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
	
	/**
	 * Update conversation with captured console output
	 */
	private async updateConversationWithConsoleOutput(
		messageId: number, 
		callId: string, 
		command: string, 
		output: string
	): Promise<{status: string, data: any}> {
		
		// Find and update the existing function_call_output entry instead of creating a new one
		const currentConversation = this.conversationManager.getCurrentConversation();
		if (!currentConversation) {
			return {
				status: 'error',
				data: {
					error: 'No current conversation found',
					related_to_id: messageId,
					request_id: this.currentRequestId
				}
			};
		}
		
		
		// Find the existing pending function_call_output for this call_id (like Rao does)
		const existingOutputMessage = currentConversation.messages.find(m => 
			m.type === 'function_call_output' && 
			m.call_id === callId &&
			m.output === "Response pending..."
		);
		
		
		if (existingOutputMessage) {
			
			existingOutputMessage.output = output;
			existingOutputMessage.timestamp = new Date().toISOString();
			
			// CRITICAL: Save the updated conversation to disk
			await this.conversationManager.saveConversationLog(currentConversation);
			
			// Fire event to update UI with the updated message
			this._onMessageAdded.fire({
				id: existingOutputMessage.id,
				type: 'function_call_output',
				content: existingOutputMessage.output,
				timestamp: existingOutputMessage.timestamp,
				related_to: messageId
			});
			
		} else {
			
			// Create new output message as fallback
			const outputMessage = {
				id: this.getNextMessageId(),
				type: 'function_call_output',
				call_id: callId,
				output: output,
				related_to: messageId,
				procedural: true
			};
			
			await this.conversationManager.addFunctionCallOutput(outputMessage);
			
			// Fire event to update UI
			this._onMessageAdded.fire({
				id: outputMessage.id,
				type: 'function_call_output',
				content: outputMessage.output,
				timestamp: new Date().toISOString(),
				related_to: messageId
			});
		}
		
		this.logService.info(`Console output captured for message ${messageId}: ${output.length} characters`);
		
		// CRITICAL: Check for newer messages like Rao does (same logic for accept and cancel)
		// If newer messages exist, don't continue; if no newer messages, continue
		const hasNewerMessages = this.hasNewerMessages(currentConversation, messageId, callId);
		const relatedToId = currentConversation.messages.find(m => m.id === messageId)?.related_to || messageId;
		
		if (hasNewerMessages) {
			// Conversation has moved on - don't continue
			return {
				status: 'done',
				data: {
					message: 'Console command completed - conversation has moved on, not continuing API',
					related_to_id: relatedToId,
					request_id: this.currentRequestId
				}
			};
		} else {
			// No newer messages - continue the conversation  
			return {
				status: 'continue_silent',
				data: {
					message: 'Console command completed - returning control to orchestrator',
					related_to_id: relatedToId,
					request_id: this.currentRequestId
				}
			};
		}
	}

	/**
	 * Execute terminal command with output capture - exactly like Rao's terminalExecute + polling
	 */
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

	/**
	 * Poll terminal completion exactly like Rao's check_terminal_complete polling logic
	 */
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

	/**
	 * Update conversation with captured terminal output - exactly like console but for terminal commands
	 */
	private async updateConversationWithTerminalOutput(
		messageId: number, 
		callId: string, 
		command: string, 
		output: string
	): Promise<{status: string, data: any}> {
		
		// Find and update the existing function_call_output entry instead of creating a new one
		const currentConversation = this.conversationManager.getCurrentConversation();
		if (!currentConversation) {
			return {
				status: 'error',
				data: {
					error: 'No current conversation found',
					related_to_id: messageId,
					request_id: this.currentRequestId
				}
			};
		}
		
		
		// Find the existing pending function_call_output for this call_id (like Rao does)
		const existingOutputMessage = currentConversation.messages.find(m => 
			m.type === 'function_call_output' && 
			m.call_id === callId &&
			m.output === "Response pending..."
		);
		
		
		if (existingOutputMessage) {
			
			existingOutputMessage.output = output;
			existingOutputMessage.timestamp = new Date().toISOString();
			
			// CRITICAL: Save the updated conversation to disk
			await this.conversationManager.saveConversationLog(currentConversation);
			
			// Fire event to update UI with the updated message
			this._onMessageAdded.fire({
				id: existingOutputMessage.id,
				type: 'function_call_output',
				content: existingOutputMessage.output,
				timestamp: existingOutputMessage.timestamp,
				related_to: messageId
			});
			
		} else {
			
			// Create new output message as fallback
			const outputMessage = {
				id: this.getNextMessageId(),
				type: 'function_call_output',
				call_id: callId,
				output: output,
				related_to: messageId,
				procedural: true
			};
			
			await this.conversationManager.addFunctionCallOutput(outputMessage);
			
			// Fire event to update UI
			this._onMessageAdded.fire({
				id: outputMessage.id,
				type: 'function_call_output',
				content: outputMessage.output,
				timestamp: new Date().toISOString(),
				related_to: messageId
			});
		}
		
		this.logService.info(`Terminal output captured for message ${messageId}: ${output.length} characters`);
		
		// CRITICAL: Check for newer messages like Rao does (same logic for accept and cancel)
		// If newer messages exist, don't continue; if no newer messages, continue
		const hasNewerMessages = this.hasNewerMessages(currentConversation, messageId, callId);
		const relatedToId = currentConversation.messages.find(m => m.id === messageId)?.related_to || messageId;
		
		if (hasNewerMessages) {
			// Conversation has moved on - don't continue
			return {
				status: 'done',
				data: {
					message: 'Terminal command completed - conversation has moved on, not continuing API',
					related_to_id: relatedToId,
					request_id: this.currentRequestId
				}
			};
		} else {
			// No newer messages - continue the conversation  
			return {
				status: 'continue_silent',
				data: {
					message: 'Terminal command completed - returning control to orchestrator',
					related_to_id: relatedToId,
					request_id: this.currentRequestId
				}
			};
		}
	}

	async newConversation(name?: string): Promise<Conversation> {
		this.logService.info('Creating new conversation', name ? `with name: ${name}` : '');
		
		try {
			// Check if there's already a blank conversation with the highest ID
			const highestBlankId = await this.conversationManager.findHighestBlankConversation();
			
			if (highestBlankId !== null) {
				this.logService.info('Found existing blank conversation:', highestBlankId, 'switching to it instead of creating new one');
				
				// Load the existing blank conversation
				const existingConversation = await this.conversationManager.loadConversation(highestBlankId);
				
				if (existingConversation) {
					// Update the name if provided
					if (name) {
						await this.conversationManager.renameConversation(highestBlankId, name);
						existingConversation.info.name = name;
					}
					
					// CRITICAL: Reset message ID counter for conversation switch (starts at 0)
					this.messageIdCounter = 0;
					
					// CRITICAL: Clear preallocation state for conversation switch
					this.clearPreallocationStateForConversationSwitch();
					
					// Clear all existing file highlighting from previous conversation
					this.clearAllFileHighlighting();
					
					// Switch to the existing conversation
					await this.conversationManager.switchToConversation(highestBlankId);
					
					// Load conversation variables for this conversation
					await this.conversationVariableManager.loadConversationVariables(highestBlankId);
					
								// Load diff data from conversation_diffs.json for search_replace widgets
			diffStore.setConversationManager(this.conversationManager);
			await diffStore.loadDiffsFromFile();
			
			this._onConversationLoaded.fire(existingConversation);
					
					this.logService.info('Switched to existing blank conversation:', existingConversation.info.id);
					return existingConversation;
				}
			}
			
			// No blank conversation found, create a new one
			const conversation = await this.conversationManager.createNewConversation(name);
			
			// CRITICAL: Reset message ID counter for new conversation (starts at 0)
			this.messageIdCounter = 0;
			
			// CRITICAL: Clear preallocation state for new conversation  
			this.clearPreallocationStateForConversationSwitch();
			
			// Initialize file change tracking for the new conversation
			await this.initializeFileChangeTracking(conversation.info.id);
			
			this._onConversationCreated.fire(conversation);
			this._onConversationLoaded.fire(conversation);
			
			this.logService.info('New conversation created:', conversation.info.id);
			return conversation;
		} catch (error) {
			this.logService.error('Failed to create new conversation:', error);
			throw error;
		}
	}

	async loadConversation(id: number): Promise<Conversation | null> {
		this.logService.info('Loading conversation:', id);
		
		// Hide any active thinking message when switching conversations
		this.hideThinkingMessage();
		
		try {
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation) {
				await this.conversationVariableManager.storeConversationVariables(currentConversation.info.id);
			}
			
			const success = await this.conversationManager.switchToConversation(id);
			if (success) {
				const conversation = this.conversationManager.getCurrentConversation();
				if (conversation) {
					await this.conversationVariableManager.loadConversationVariables(conversation.info.id);
					
					// Load diff data from conversation_diffs.json for search_replace widgets
					diffStore.setConversationManager(this.conversationManager);
					await diffStore.loadDiffsFromFile();
					
					// Lines 409-426 in SessionAiConversationHandlers.R show exact logic
					this.resetMessageIdCounterForConversation(conversation);
					
					// CRITICAL: Clear preallocation state for new conversation
					this.clearPreallocationStateForConversationSwitch();
					
					// Clear all existing file highlighting from previous conversation
					this.clearAllFileHighlighting();
					
					// Initialize file change tracking for the loaded conversation
					await this.initializeFileChangeTracking(conversation.info.id);
					
					this._onConversationLoaded.fire(conversation);
					return conversation;
				}
			}
			return null;
		} catch (error) {
			this.logService.error('Failed to load conversation:', error);
			return null;
		}
	}

	async sendMessage(message: string): Promise<void> {
		// Reset thinking buffer for new request
		this.resetThinkingBuffer();
		if (!message.trim()) {
			throw new Error('Message cannot be empty');
		}

		const conversation = this.conversationManager.getCurrentConversation();
		if (!conversation) {
			throw new Error('No active conversation');
		}

		this.logService.info('[SERVICE] Routing user message through orchestrator:', message);

		// Generate request ID
		const requestId = this.generateRequestId();
		
		// Route through orchestrator instead of direct processing
		this._orchestrator.startAiSearch(message, requestId);
	}

	/**
	 * Get diff data for a specific message ID (for React components)
	 */
	async getDiffDataForMessage(messageId: string): Promise<any> {
		try {
			diffStore.setConversationManager(this.conversationManager);
			const storedDiff = diffStore.getDiffData(messageId);
			return storedDiff;
		} catch (error) {
			console.error(`[SERVICE_DIFF_DEBUG] Failed to get diff data for message ${messageId}:`, error);
			return null;
		}
	}

	/**
	 * Execute streaming for orchestrator - this is the real streaming implementation
	 * Called by orchestrator for both initial and continuation requests
	 */
	async executeStreamingForOrchestrator(message: string, userMessageId: number, requestId: string): Promise<void> {
		try {
			// Clear function call buffer and first function call tracking for new request
			this.functionCallBuffer = [];
			this.functionCallMessageIds.clear();
			this.resetFirstFunctionCallTracking();

			// Store request ID for potential cancellation
			this.currentRequestId = requestId;
			this.currentRequestWasCancelled = false;

			// Auto-show thinking message if needed (following Rao's 2-second rule)
			if (this.shouldAutoShowThinkingMessage()) {
				this.showThinkingMessage();
			}

		// Get AI settings
		const provider = this.getAIProvider();
		const model = this.getAIModel();
		const temperature = this.getTemperatureSync();

		// Get all conversation messages for context
		let messages = this.conversationManager.getMessages();

		// Check if we need to wait for background summarization before making API call
		// This ensures we have the most recent summary available when needed (exactly like rao)
		const conversation = this.conversationManager.getCurrentConversation();
		if (conversation) {
			const conversationPaths = this.conversationManager.getConversationPaths(conversation.info.id);
			const currentQueryCount = this.conversationSummarization.countOriginalQueries(messages);
			
			// If we have 3+ queries and there's background summarization in progress,
			// we need to wait for it ONLY if it's creating the summary we actually need (N-2)
			if (currentQueryCount >= 3) {
				const state = await this.conversationSummarization.loadBackgroundSummarizationState(conversationPaths);
				const neededSummaryQuery = currentQueryCount - 2;
				if (state && state.target_query === neededSummaryQuery) {
					await this.conversationSummarization.waitForPersistentBackgroundSummarization(conversationPaths);
				}
			}
			
			// Check for persistent background summarization (non-blocking check)
			await this.conversationSummarization.checkPersistentBackgroundSummarization(conversationPaths);
		}

		// Prepare conversation with existing summaries (exactly like rao)
		let conversationWithSummary: { conversation: ConversationMessage[], summary: any } = { conversation: messages, summary: null };
		if (conversation) {
			const conversationPaths = this.conversationManager.getConversationPaths(conversation.info.id);
			conversationWithSummary = await this.conversationSummarization.prepareConversationWithSummaries(messages, conversationPaths);
			messages = conversationWithSummary.conversation;
		}

		// Check backend connectivity before making API requests (exactly like Rao)
		// Skip health check for conversation name and summarization requests to avoid delays
		const isBackendHealthy = await this.checkBackendHealth();
		if (!isBackendHealthy) {
			// Clean up UI state exactly like Rao
			this.hideThinkingMessage();
			
			// Notify orchestrator of error
			this._orchestrator.handleFunctionCompletion('error', {
				error: 'Backend health check failed'
			});
			
			// Fire streaming error event for in-conversation display (same as API key error)
			// Use Rao's exact error message for backend connectivity issues
			const errorId = `error_${Date.now()}_${Math.floor(Math.random() * 9000) + 1000}`;
			this._onStreamingError.fire({
				errorId,
				message: 'Could not connect to backend server within 30 seconds. Please check your internet connectivity and try again. Often this is solved by just retrying. If the problem persists, please open a thread at https://community.lotas.ai/.'
			});
			
			// Fire streaming complete to ensure component state is reset
			this._onStreamingComplete.fire();
			return;
		}

		// CRITICAL: Prepare context data for backend (Phase 4 - File Operations Integration)
		const contextData = await this.prepareContextForBackend(messages);
		
		// Add previous summary to context data if available (exactly like rao)
		if (conversationWithSummary.summary) {
			contextData.previous_summary = conversationWithSummary.summary;
		}

		// RAO streaming variables (exactly like SessionAiAPI.R)
		let hasStartedStreaming = false;
		let hasFunctionCallsInResponse = false;
		let assistantMessageId: number | null = null;
		let accumulatedResponse = '';  // Like RAO's accumulated_response

		// Widget state tracking for streaming (like RAO)
		const streamingWidgets = new Map<string, { messageId: number; functionType: string; accumulatedContent: string; streamedContent: string }>();


		let skipAssistantMessageStreaming = false;

		await this.backendClient.sendStreamingQuery(
			messages,
			provider,
			model,
			temperature || 0.7,
			requestId,
			contextData || {},
			async (data: StreamData) => {
				// Handle content streaming - ONLY content deltas go to accumulated_response (RAO line 1677)
				if (data.type === 'content' && data.delta) {
					


					// Generate assistant_message_id if needed and not skipping (like RAO line 1688)
					if (!assistantMessageId && !skipAssistantMessageStreaming) {
						assistantMessageId = this.getNextMessageId();
					}


					
					// Accumulate response like RAO (line 1677) - ONLY for content, not function deltas
					accumulatedResponse += data.delta;

					if (!skipAssistantMessageStreaming) {
						// Process thinking tags in delta
						const processedDelta = this.processThinkingTagsWithBuffer(data.delta);
						
						// Start streaming message if not started
						if (!hasStartedStreaming && assistantMessageId) {
							// Hide thinking message when first assistant response starts (Rao rule)
							this.hideThinkingMessage();
							this.conversationManager.startStreamingMessageWithId(assistantMessageId);
							hasStartedStreaming = true;
						}
						
						// Update streaming message with processed content
						this.conversationManager.updateStreamingMessage(processedDelta, true);
						
						// CRITICAL: Fire streaming data event to trigger UI updates with processed content
						this._onStreamingData.fire({
							...data,
							delta: processedDelta,
							content: processedDelta
						});
					}
				}
				
				// Handle function call ACTION (like RAO lines 1873-1909)
				if (data.type === 'function_call' && data.functionCall) {
					// Hide thinking message when function call starts (Rao rule)
					this.hideThinkingMessage();
	
					hasFunctionCallsInResponse = true;
					
					// RAO: Save accumulated text content FIRST when function call occurs (lines 1877-1909)
					if (assistantMessageId && accumulatedResponse.length > 0) {

						// Complete and save the streaming message with accumulated text BEFORE creating function call
						const textMessageId = this.conversationManager.completeStreamingMessage({
							related_to: userMessageId
						}, this.processThinkingTagsComplete.bind(this));

						
						
						// Fire event for the completed text message
						const finalConversation = this.conversationManager.getCurrentConversation();
						const completedTextMessage = finalConversation?.messages.find(m => m.id === textMessageId);
						if (completedTextMessage) {
							this._onMessageAdded.fire(completedTextMessage);
						}
						
						// RAO: Clear accumulated response since we've processed it (line 1908)
						accumulatedResponse = '';
						
						// Reset streaming state
						assistantMessageId = null;
						hasStartedStreaming = false;
					}
					
					// Pre-allocate message ID for function call
					const preallocatedMessageId = this.preallocateFunctionMessageIds(data.functionCall.name, data.functionCall.call_id);
					
					// Buffer function call for processing (like RAO)
					this.functionCallBuffer.push({
						function_call: data.functionCall,
						request_id: requestId,
						message_id: preallocatedMessageId.toString()
					});
				}

				// Handle completion events (like RAO lines 2058-2332)
				if (data.type === 'done' && data.isComplete) {
					
					// RAO: Save accumulated text content to conversation log if we have content (lines 2260-2301)
					if (accumulatedResponse.length > 0) {
						
						// Generate assistant message ID if not already generated
						if (!assistantMessageId) {
							assistantMessageId = this.getNextMessageId();
						} else {
						}
						
						// Complete and save the streaming message
						const textMessageId = this.conversationManager.completeStreamingMessage({
							related_to: userMessageId
						}, this.processThinkingTagsComplete.bind(this));
						
						
						// Always fire _onMessageAdded for text messages - they should be displayed alongside function calls
						// The text message and function call messages are separate and both should be visible
						const finalConversation = this.conversationManager.getCurrentConversation();
						const completedTextMessage = finalConversation?.messages.find(m => m.id === textMessageId);
						if (completedTextMessage) {
							this._onMessageAdded.fire(completedTextMessage);
						} else {
							if (finalConversation?.messages) {
							}
						}
						
						// RAO: Reset accumulated response since we've saved it (line 2317)
						accumulatedResponse = '';
						
						// RAO: Reset assistant_message_id for next content (line 2331)
						assistantMessageId = null;
						hasStartedStreaming = false;
					} else {
					}
				}

				// Handle function call streaming (widgets) - separate from accumulated_response
				if (data.type === 'function_delta' && data.field && data.call_id) {
					
					// CRITICAL FIX: Widget functions only send function_delta/function_complete, never function_call
					// Set hasFunctionCallsInResponse=true when we see the first function_delta for a widget
					if (!hasFunctionCallsInResponse) {
						hasFunctionCallsInResponse = true;
					}
					
					// Hide thinking message when function delta starts (Rao rule)
					this.hideThinkingMessage();

					
					// Create widget if it doesn't exist yet
					if (!streamingWidgets.has(data.call_id)) {
						// CRITICAL: Save accumulated text FIRST before creating function call (RAO pattern)
						if (assistantMessageId && accumulatedResponse.length > 0) {
							const textMessageId = this.conversationManager.completeStreamingMessage({
								related_to: userMessageId
							}, this.processThinkingTagsComplete.bind(this));
							
							// Fire event for the completed text message
							const finalConversation = this.conversationManager.getCurrentConversation();
							const completedTextMessage = finalConversation?.messages.find(m => m.id === textMessageId);
							if (completedTextMessage) {
								this._onMessageAdded.fire(completedTextMessage);
							}
							
							// Clear accumulated response since we've processed it
							accumulatedResponse = '';
							assistantMessageId = null;
						}
						
						// Use preallocated message ID for this function call (like Rao)
						const messageId = this.preallocateFunctionMessageIds(data.field, data.call_id);
						streamingWidgets.set(data.call_id, {
							messageId,
							functionType: data.field,
							accumulatedContent: '',
							streamedContent: ''
						});
						
						// Create widget immediately for console and terminal commands
						if (data.field === 'run_console_cmd') {
							
							this._onWidgetRequested.fire({
								messageId,
								requestId,
								functionCallType: 'run_console_cmd',
								initialContent: '',
								filename: undefined,
								handlers: {
									onAccept: async (msgId: number, content: string) => {
										await this._orchestrator.acceptConsoleCommand(msgId, content, requestId);
									},
									onCancel: async (msgId: number) => {
										await this._orchestrator.cancelConsoleCommand(msgId, requestId);
									},
									onAllowList: async (msgId: number, content: string) => {
									}
								}
							});
						} else if (data.field === 'run_terminal_cmd') {							
							// Check if terminal command should auto-run
							const terminalCommand = data.content || '';
							const autoRunResult = this.terminalAutoRunner.shouldAutoRunTerminalCommand(terminalCommand);
							const shouldAutoAccept = autoRunResult.shouldAutoRun;
							
							if (shouldAutoAccept) {
								this.logService.info(`Terminal auto-run approved during streaming: ${autoRunResult.reason}`);
							} else {
								this.logService.info(`Terminal auto-run denied during streaming: ${autoRunResult.reason}`);
							}

							this._onWidgetRequested.fire({
								messageId,
								requestId,
								functionCallType: 'run_terminal_cmd',
								initialContent: '',
								filename: undefined,
								autoAccept: shouldAutoAccept,
								handlers: {
									onAccept: async (msgId: number, content: string) => {
										await this._orchestrator.acceptTerminalCommand(msgId, content, requestId);
									},
									onCancel: async (msgId: number) => {
										await this._orchestrator.cancelTerminalCommand(msgId, requestId);
									},
									onAllowList: async (msgId: number, content: string) => {
									}
								}
							});
						} else if (data.field === 'search_replace') {
							
							this._onWidgetRequested.fire({
								messageId,
								requestId,
								functionCallType: 'search_replace',
								initialContent: '',
								filename: undefined, // Will be updated when filename is detected
								handlers: {
									onAccept: async (msgId: number, content: string) => {
										await this._orchestrator.acceptSearchReplaceCommand(msgId, content, requestId);
									},
									onCancel: async (msgId: number) => {
										await this._orchestrator.cancelSearchReplaceCommand(msgId, requestId);
									},
									onAllowList: async (msgId: number, content: string) => {
									}
								}
							});
						} else if (data.field === 'delete_file') {
							
							this._onWidgetRequested.fire({
								messageId,
								requestId,
								functionCallType: 'delete_file',
								initialContent: '',
								filename: undefined, // Will be updated when filename is detected
								handlers: {
									onAccept: async (msgId: number, content: string) => {
										await this._orchestrator.acceptDeleteFileCommand(msgId, content, requestId);
									},
									onCancel: async (msgId: number) => {
										await this._orchestrator.cancelDeleteFileCommand(msgId, requestId);
									},
									onAllowList: async (msgId: number, content: string) => {
									}
								}
							});
						}
					}
					
					// Stream content to widget (RAO's intelligent parsing)
					const widget = streamingWidgets.get(data.call_id);
					if (widget && data.delta) {
						// Accumulate the delta in memory (like RAO's delta accumulators)
						widget.accumulatedContent += data.delta;
						

						
						// Extract and process command content with RAO's intelligent parsing
						const isConsole = data.field === 'run_console_cmd';
						const isSearchReplace = data.field === 'search_replace';
						
						let parsed: { content: string; isComplete: boolean };
						
						if (isSearchReplace) {
							// Parse search_replace content exactly like Rao
							parsed = this.extractAndProcessSearchReplaceContent(widget.accumulatedContent, data.call_id);
						} else {
							// For console and other commands, use existing logic
							parsed = this.extractAndProcessCommandContent(widget.accumulatedContent, isConsole);
						}
						
						// Only stream new content (like RAO's streaming tracking)
						if (parsed.content.length > widget.streamedContent.length) {
							const newContent = parsed.content.substring(widget.streamedContent.length);
							
							if (newContent.length > 0) {
								
								// Extract filename for search_replace widgets
								let filename: string | undefined = undefined;
								if (isSearchReplace) {
									const filenameMatch = widget.accumulatedContent.match(/"file_path"\s*:\s*"([^"]*)"/);
									filename = filenameMatch ? filenameMatch[1] : undefined;
								}
								
								this._onWidgetStreamingUpdate.fire({
									messageId: widget.messageId,
									delta: newContent,
									isComplete: false,
									isSearchReplace: isSearchReplace,
									filename: filename,
									field: data.field,
									requestId: requestId
								});
								
								// Update streamed content tracking
								widget.streamedContent = parsed.content;
							}
						}
					}
				}
				
				// Handle function completion
				if (data.type === 'function_complete' && data.field && data.call_id) {
					const widget = streamingWidgets.get(data.call_id);
					if (widget) {
						// RAO Pattern: Create function call message with complete arguments (first and only save)
						const functionResult = await this.createFunctionCallMessageWithCompleteArguments(data.field, data.call_id, widget.messageId, widget.accumulatedContent, requestId);
						
						// Handle status result from search_replace validation
						if (functionResult?.status) {
							// Call orchestrator to handle the status (continue_silent, pending, etc.)
							this._orchestrator.handleFunctionCompletion(functionResult.status, functionResult.data);
							return; // Don't continue processing if we need to retry or are pending
						}
						
						// Fire completion event for the widget
						if (data.field !== 'search_replace') {
							this._onWidgetStreamingUpdate.fire({
								messageId: widget.messageId,
								delta: '',
								isComplete: true
							});
						}
						
						// Clean up widget from streaming state
						streamingWidgets.delete(data.call_id);
						
						// Simple functions are now handled in processIndividualFunctionCall -> orchestrator continuation
						if (this.isSimpleFunction(data.field)) {
						}
					}
				}
					
				this._onStreamingData.fire(data);
			},
				(error: Error) => {
					this.logService.error('Streaming error:', error);
					
					// Hide thinking message on error (Rao rule)
					this.hideThinkingMessage();
					
					// CRITICAL FIX: Notify orchestrator of error
					this._orchestrator.handleFunctionCompletion('error', {
						error: error.message || 'Streaming error occurred'
					});
					
					
					// Fire streaming error event for in-conversation display (exactly like Rao)
					const errorId = `error_${Date.now()}_${Math.floor(Math.random() * 9000) + 1000}`;
					this._onStreamingError.fire({
						errorId,
						message: error.message
					});
					
					// Cancel streaming message if error occurs
					if (hasStartedStreaming) {
						this.conversationManager.cancelStreamingMessage();
					}
					// Clear current request ID and reset cancellation flag
					this.currentRequestId = undefined;
					this.currentRequestWasCancelled = false;
					this._onStreamingComplete.fire();
				},
				async () => {
					
					// Check if this request was manually cancelled by user - if so, don't run completion logic
					if (this.currentRequestWasCancelled) {
						return;
					}
					
					if (hasStartedStreaming && !hasFunctionCallsInResponse) {
						// Pure text response - complete the message and notify orchestrator
						try {
							const messageId = this.conversationManager.completeStreamingMessage({
								related_to: userMessageId
							}, this.processThinkingTagsComplete.bind(this));
							
							// Get the completed message and fire event to update UI
							const finalConversation = this.conversationManager.getCurrentConversation();
							const completedMessage = finalConversation?.messages.find(m => m.id === messageId);
							if (completedMessage) {
								this._onMessageAdded.fire(completedMessage);
							}
							
							// CRITICAL FIX: Notify orchestrator that pure text processing is done
							this._orchestrator.handleFunctionCompletion('done', {
								message: 'Pure text response completed successfully',
								related_to_id: userMessageId,
								request_id: requestId
							});
							
						} catch (error) {
							this.logService.error('Failed to complete streaming message:', error);
							
							// Notify orchestrator of error
							this._orchestrator.handleFunctionCompletion('error', {
								error: error.message || 'Failed to complete streaming message'
							});
							
							// Fire streaming error event for in-conversation display (same as other error handlers)
							const errorId = `error_${Date.now()}_${Math.floor(Math.random() * 9000) + 1000}`;
							this._onStreamingError.fire({
								errorId,
								message: error.message || 'Failed to complete streaming message'
							});
							
							throw error;
						}
					} else if (hasFunctionCallsInResponse) {
						// Function calls occurred - orchestrator will be notified when function calls complete
					} else {
						// No streaming started - notify orchestrator that we're done
						this._orchestrator.handleFunctionCompletion('done', {
							message: 'No streaming response completed',
							related_to_id: userMessageId,
							request_id: requestId
						});
					}
					
					// Clear current request ID and reset cancellation flag
					this.currentRequestId = undefined;
					this.currentRequestWasCancelled = false;
					
					// Hide thinking message on completion (Rao rule)
					this.hideThinkingMessage();
					
					await this.processBufferedFunctionCallsAfterStreaming();
					
					// Reset first function call tracking for next request
					this.resetFirstFunctionCallTracking();
					
					this.triggerConversationNameCheck();
					
					this._onStreamingComplete.fire();
				}
			);

		} catch (error) {
			this.logService.error('Failed to send message:', error);
			
			// CRITICAL: Clean up UI state when pre-streaming errors occur (like API key missing)
			
			// Hide thinking message on error (Rao rule)
			this.hideThinkingMessage();
			
			// Notify orchestrator of error (same as streaming error handler)
			this._orchestrator.handleFunctionCompletion('error', {
				error: error.message || 'Pre-streaming error occurred'
			});
			
			// Fire streaming error event for in-conversation display (exactly like Rao)
			const errorId = `error_${Date.now()}_${Math.floor(Math.random() * 9000) + 1000}`;
			this._onStreamingError.fire({
				errorId,
				message: error.message || 'Failed to send message'
			});
			
			// Fire streaming complete to ensure component state is reset
			this._onStreamingComplete.fire();
			
			// Clear current request ID on error
			this.currentRequestId = undefined;
			
			// Don't re-throw the error since we've handled it properly
		}
	}

	async cancelStreaming(): Promise<void> {
		this.logService.info('Cancelling streaming');
		
		// Hide thinking message on cancellation (Rao rule)
		this.hideThinkingMessage();
		
		// Send cancellation request to backend if we have a request ID
		if (this.currentRequestId) {
			try {
				await this.backendClient.cancelRequest(this.currentRequestId);
			} catch (error) {
				this.logService.error('Failed to send cancellation request to backend:', error);
			}
		}
		
		// Mark current request as cancelled by user
		this.currentRequestWasCancelled = true;
		
		// Cancel the streaming request locally
		this.backendClient.cancelStreaming();
		
		// Cancel the streaming message in conversation manager
		this.conversationManager.cancelStreamingMessage();
		
		// Clear current request ID
		this.currentRequestId = undefined;
		
		// Fire completion event to update UI
		this._onStreamingComplete.fire();
	}

	/**
	 * Show thinking message - following Rao's rules
	 */
	showThinkingMessage(message?: string): void {
		const thinkingText = message || 'Thinking...';
		this.isThinkingMessageActive = true;
		this.lastThinkingMessageTime = new Date();
		this._onThinkingMessage.fire({ message: thinkingText, hideCancel: false });
	}

	/**
	 * Hide thinking message - following Rao's rules
	 */
	hideThinkingMessage(): void {
		if (this.isThinkingMessageActive) {
			this.isThinkingMessageActive = false;
			this.lastThinkingMessageTime = null;
			this._onThinkingMessage.fire({ message: '', hideCancel: true });
		}
	}

	/**
	 * Fire orchestrator state change event
	 */
	fireOrchestratorStateChange(isProcessing: boolean): void {
		this._onOrchestratorStateChange.fire({ isProcessing });
	}

	/**
	 * Check if thinking message should be auto-shown (if no thinking message in last 2 seconds)
	 * Following Rao's auto-show logic
	 */
	private shouldAutoShowThinkingMessage(): boolean {
		if (this.isThinkingMessageActive) {
			return false; // Already showing
		}
		
		if (!this.lastThinkingMessageTime) {
			return true; // Never shown
		}
		
		const now = new Date();
		const timeDiff = (now.getTime() - this.lastThinkingMessageTime.getTime()) / 1000;
		return timeDiff > 2; // Show if last message was more than 2 seconds ago
	}

	getCurrentConversation(): Conversation | null {
		return this.conversationManager.getCurrentConversation();
	}

	async listConversations(): Promise<ConversationInfo[]> {
		this.logService.info('Listing conversations');
		return await this.conversationManager.listConversations();
	}

	async deleteConversation(id: number): Promise<boolean> {
		this.logService.info('Deleting conversation:', id);
		return await this.conversationManager.deleteConversation(id);
	}

	async deleteAllConversations(): Promise<boolean> {
		this.logService.info('Deleting all conversations');
		return await this.conversationManager.deleteAllConversations();
	}

	async renameConversation(id: number, name: string): Promise<boolean> {
		this.logService.info('Renaming conversation:', id, 'to:', name);
		return await this.conversationManager.renameConversation(id, name);
	}

	async isConversationBlank(id: number): Promise<boolean> {
		return await this.conversationManager.isConversationBlank(id);
	}

	async findHighestBlankConversation(): Promise<number | null> {
		return await this.conversationManager.findHighestBlankConversation();
	}

	async checkBackendHealth(): Promise<boolean> {
		this.logService.info('Checking backend health');
		
		try {
			const health = await this.backendClient.checkHealth();
			return health.status === 'UP';
		} catch (error) {
			this.logService.error('Backend health check failed:', error);
			return false;
		}
	}

	async getBackendEnvironment(): Promise<string> {
		try {
			return await this.backendClient.getEnvironmentName();
		} catch (error) {
			this.logService.error('Failed to get backend environment:', error);
			return 'Unknown';
		}
	}

	// Authentication methods - delegate to ApiKeyManager
	async saveApiKey(provider: string, key: string): Promise<{ success: boolean; message: string }> {
		return await this.apiKeyManager.saveApiKey(provider, key);
	}

	async deleteApiKey(provider: string): Promise<{ success: boolean; message: string }> {
		return await this.apiKeyManager.deleteApiKey(provider);
	}

	async getApiKeyStatus(): Promise<boolean> {
		return await this.apiKeyManager.getApiKeyStatus();
	}

	async startOAuthFlow(provider: string = "rao"): Promise<string> {
		return await this.apiKeyManager.startOAuthFlow(provider);
	}

	async getUserProfile(): Promise<any> {
		try {
			// First try to get cached profile from storage
			const cachedProfile = await this.apiKeyManager.getUserProfile();
			if (cachedProfile) {
				return cachedProfile;
			}

			const profile = await this.backendClient.getUserProfile();
			
			// Cache the profile for future use
			await this.apiKeyManager.saveUserProfile(profile);
			
			return profile;
		} catch (error) {
			this.logService.error('Failed to get user profile:', error);
			
			const hasKey = await this.apiKeyManager.getApiKeyStatus();
			if (!hasKey) {
				throw new Error('No API key configured');
			}
			
			// Return error information for UI to handle
			throw error;
		}
	}

	async getSubscriptionStatus(): Promise<any> {
		try {
			return await this.backendClient.getSubscriptionStatus();
		} catch (error) {
			this.logService.error('Failed to get subscription status:', error);
			throw error;
		}
	}

	async isUserAuthenticated(): Promise<boolean> {
		return await this.apiKeyManager.isUserAuthenticated();
	}

	async signOut(): Promise<void> {
		await this.apiKeyManager.signOut();
	}






	private getAIProvider(): string {
		const model = this.getAIModel();
		if (model === 'claude-sonnet-4-20250514') {
			return 'anthropic';
		} else if (model === 'gpt-5-mini') {
			return 'openai';
		}
		return 'anthropic'; 
	}

	private getAIModel(): string {
		return this.configurationService.getValue<string>('erdosAi.selectedModel') || 'claude-sonnet-4-20250514';
	}

	private getTemperatureSync(): number {
		return this.configurationService.getValue<number>('erdosAi.temperature') || 0.7;
	}

	private generateRequestId(): string {
		const timestamp = Date.now();
		const random = Math.floor(Math.random() * 1000);
		return `req_${timestamp}_${random}`;
	}

	/**
	 * Get the current active request ID for widget operations
	 */
	getCurrentRequestId(): string | undefined {
		return this.currentRequestId;
	}

	/**
	 * This is the single source of truth for ALL message IDs in the system
	 */
	private messageIdCounter = 0;

	/**
	 * This is the ONLY method that should allocate message IDs anywhere in the system
	 */
	public getNextMessageId(): number {
		this.messageIdCounter += 1;
		return this.messageIdCounter;
	}

	// Model Settings Implementation
	async getAvailableModels(): Promise<string[]> {
		return await this.backendClient.getAvailableModels();
	}

	async getSelectedModel(): Promise<string | null> {
		const settings = await this.loadSettingsFromFile();
		return settings.selected_model || 'claude-sonnet-4-20250514';
	}

	async setSelectedModel(model: string): Promise<boolean> {
		try {

			
			const settings = await this.loadSettingsFromFile();

			
			settings.selected_model = model;

			
			const result = await this.saveSettingsToFile(settings);

			
			if (result) {
				await this.configurationService.updateValue('erdosAi.selectedModel', model);

			}
			
			return result;
		} catch (error) {
			console.error('[ErdosAI] Failed to set selected model:', error);
			this.logService.error('Failed to set selected model:', error);
			return false;
		}
	}

	async getTemperature(): Promise<number> {
		const settings = await this.loadSettingsFromFile();
		return settings.temperature || 0.5;
	}

	async setTemperature(temperature: number): Promise<boolean> {
		try {
			if (temperature < 0 || temperature > 1) {
				throw new Error('Temperature must be between 0 and 1');
			}
			
			const settings = await this.loadSettingsFromFile();
			settings.temperature = temperature;
			const result = await this.saveSettingsToFile(settings);
			
			if (result) {
				await this.configurationService.updateValue('erdosAi.temperature', temperature);
			}
			
			return result;
		} catch (error) {
			this.logService.error('Failed to set temperature:', error);
			return false;
		}
	}

	// Working Directory Implementation
	async getWorkingDirectory(): Promise<string> {
		const workspace = this.workspaceContextService.getWorkspace();
		if (workspace.folders.length > 0) {
			return workspace.folders[0].uri.fsPath;
		}
		// Fallback to user roaming data home since userHome is not available on base IEnvironmentService
		return this.environmentService.userRoamingDataHome.fsPath;
	}

	async setWorkingDirectory(path: string): Promise<boolean> {
		try {
			// Working directory change - acknowledge the request 
			// Working directory changes are handled by supported function operations
			this.logService.info('Working directory change requested:', path);
			return true;
		} catch (error) {
			this.logService.error('Failed to set working directory:', error);
			return false;
		}
	}

	// Context Management Implementation
	getContextService(): ContextService {
		return this.contextService;
	}

	// Security Settings Implementation
	async isFirstTimeUser(): Promise<boolean> {
		try {
			// Check if the settings JSON file exists, just like RAO does
			// This matches RAO's logic: if (!file.exists(settings_path))
			const settingsPath = this.getSettingsFilePath();
			const exists = await this.fileService.exists(settingsPath);
			return !exists;
		} catch (error) {
			this.logService.error('Failed to check if settings file exists:', error);
			// If we can't check the file, assume it's not a first-time user for security
			return false;
		}
	}

	private getSettingsFilePath(): URI {
		// Create a path similar to RAO's ai_settings.json
		// Use the same storage root as conversations for consistency
		const workspace = this.workspaceContextService.getWorkspace();
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		const workspaceId = this.workspaceContextService.getWorkspace().id;
		
		// Follow exact same pattern as ConversationManager for storage location
		const storageRoot = isEmptyWindow ?
			URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
			URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
			
		return URI.joinPath(storageRoot, 'erdos_ai_settings.json');
	}

	private async loadSettingsFromFile(): Promise<any> {
		try {
			const settingsPath = this.getSettingsFilePath();

			
			const exists = await this.fileService.exists(settingsPath);

			
			if (!exists) {
				// Return default settings like RAO does when file doesn't exist
				return {
					selected_model: "claude-sonnet-4-20250514",
					temperature: 0.5,
					security_mode: "improve", // First-time users get 'improve'
					web_search_enabled: false,
					auto_accept_edits: false
				};
			}
			
			const fileContent = await this.fileService.readFile(settingsPath);
			const settingsJson = fileContent.value.toString();
			const parsed = JSON.parse(settingsJson);
			return parsed;
		} catch (error) {
			console.error('[ErdosAI] Failed to load settings from file:', error);
			this.logService.error('Failed to load settings from file:', error);
			// Return default settings on error
			return {
				selected_model: "claude-sonnet-4-20250514",
				temperature: 0.5,
				security_mode: "secure", // Existing users get 'secure' as fallback
				web_search_enabled: false,
				auto_accept_edits: false
			};
		}
	}

	private async saveSettingsToFile(settings: any): Promise<boolean> {
		try {
			const settingsPath = this.getSettingsFilePath();

			
			// Ensure the directory exists
			const parentDir = URI.joinPath(settingsPath, '..');

			await this.fileService.createFolder(parentDir);
			
			const content = JSON.stringify(settings, null, 2);

			
			await this.fileService.writeFile(settingsPath, VSBuffer.fromString(content));

			return true;
		} catch (error) {
			console.error('[ErdosAI] Failed to save settings to file:', error);
			this.logService.error('Failed to save settings to file:', error);
			return false;
		}
	}

	async getSecurityMode(): Promise<'secure' | 'improve'> {
		// Load from JSON file like RAO does
		const settings = await this.loadSettingsFromFile();
		return settings.security_mode || 'secure';
	}

	async setSecurityMode(mode: 'secure' | 'improve'): Promise<boolean> {
		try {
	
			
			// Load existing settings, update security mode, and save back
			const settings = await this.loadSettingsFromFile();

			
			settings.security_mode = mode;

			
			const result = await this.saveSettingsToFile(settings);

			
			// Also update VS Code configuration for integration
			if (result) {
				await this.configurationService.updateValue('erdosAi.securityMode', mode);

			}
			
			return result;
		} catch (error) {
			console.error('[ErdosAI] Failed to set security mode:', error);
			this.logService.error('Failed to set security mode:', error);
			return false;
		}
	}



	async getWebSearchEnabled(): Promise<boolean> {
		const settings = await this.loadSettingsFromFile();
		return settings.web_search_enabled || false;
	}

	async setWebSearchEnabled(enabled: boolean): Promise<boolean> {
		try {
			const settings = await this.loadSettingsFromFile();
			settings.web_search_enabled = enabled;
			const result = await this.saveSettingsToFile(settings);
			
			if (result) {
				await this.configurationService.updateValue('erdosAi.webSearchEnabled', enabled);
			}
			
			return result;
		} catch (error) {
			this.logService.error('Failed to set web search enabled:', error);
			return false;
		}
	}

	// User Rules Implementation
	async getUserRules(): Promise<string[]> {
		return this.configurationService.getValue<string[]>('erdosAi.userRules') || [];
	}

	async addUserRule(rule: string): Promise<boolean> {
		try {
			const currentRules = await this.getUserRules();
			const updatedRules = [...currentRules, rule];
			await this.configurationService.updateValue('erdosAi.userRules', updatedRules);
			return true;
		} catch (error) {
			this.logService.error('Failed to add user rule:', error);
			return false;
		}
	}

	async editUserRule(index: number, rule: string): Promise<boolean> {
		try {
			const currentRules = await this.getUserRules();
			if (index < 0 || index >= currentRules.length) {
				throw new Error('Invalid rule index');
			}
			const updatedRules = [...currentRules];
			updatedRules[index] = rule;
			await this.configurationService.updateValue('erdosAi.userRules', updatedRules);
			return true;
		} catch (error) {
			this.logService.error('Failed to edit user rule:', error);
			return false;
		}
	}

	async deleteUserRule(index: number): Promise<boolean> {
		try {
			const currentRules = await this.getUserRules();
			if (index < 0 || index >= currentRules.length) {
				throw new Error('Invalid rule index');
			}
			const updatedRules = currentRules.filter((_, i) => i !== index);
			await this.configurationService.updateValue('erdosAi.userRules', updatedRules);
			return true;
		} catch (error) {
			this.logService.error('Failed to delete user rule:', error);
			return false;
		}
	}

	// Automation Settings Implementation
	async getAutoAcceptEdits(): Promise<boolean> {
		const settings = await this.loadSettingsFromFile();
		return settings.auto_accept_edits || false;
	}

	async setAutoAcceptEdits(enabled: boolean): Promise<boolean> {
		try {
			const settings = await this.loadSettingsFromFile();
			settings.auto_accept_edits = enabled;
			const result = await this.saveSettingsToFile(settings);
			
			if (result) {
				await this.configurationService.updateValue('erdosAi.autoAcceptEdits', enabled);
			}
			
			return result;
		} catch (error) {
			this.logService.error('Failed to set auto-accept edits:', error);
			return false;
		}
	}

	async getAutoAcceptConsole(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.autoAcceptConsole') || false;
	}

	async setAutoAcceptConsole(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.autoAcceptConsole', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set auto-accept file edits:', error);
			return false;
		}
	}
	
	async getAutoRunFiles(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.autoRunFiles') || false;
	}

	async setAutoRunFiles(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.autoRunFiles', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set auto-run files:', error);
			return false;
		}
	}

	async getAutoDeleteFiles(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.autoDeleteFiles') || false;
	}

	async setAutoDeleteFiles(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.autoDeleteFiles', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set auto-delete files:', error);
			return false;
		}
	}

	// Widget functionality removed from Erdos AI



	async getAutoRunFilesAllowAnything(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.autoRunFilesAllowAnything') || false;
	}

	async setAutoRunFilesAllowAnything(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.autoRunFilesAllowAnything', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set auto-run files allow anything:', error);
			return false;
		}
	}

	async getAutoDeleteFilesAllowAnything(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.autoDeleteFilesAllowAnything') || false;
	}

	async setAutoDeleteFilesAllowAnything(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.autoDeleteFilesAllowAnything', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set auto-delete files allow anything:', error);
			return false;
		}
	}




	async getRunFilesAutomationList(): Promise<string[]> {
		return this.configurationService.getValue<string[]>('erdosAi.runFilesAutomationList') || [];
	}

	async setRunFilesAutomationList(files: string[]): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.runFilesAutomationList', files);
			return true;
		} catch (error) {
			this.logService.error('Failed to set run files automation list:', error);
			return false;
		}
	}

	async getDeleteFilesAutomationList(): Promise<string[]> {
		return this.configurationService.getValue<string[]>('erdosAi.deleteFilesAutomationList') || [];
	}

	async setDeleteFilesAutomationList(files: string[]): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.deleteFilesAutomationList', files);
			return true;
		} catch (error) {
			this.logService.error('Failed to set delete files automation list:', error);
			return false;
		}
	}

	/**
	 * Generate conversation name using AI backend
	 * @param conversationId Conversation ID to generate name for
	 * @returns Generated conversation name or null if generation fails
	 */
	async generateConversationName(conversationId: number): Promise<string | null> {
		try {
			const conversation = await this.conversationManager.loadConversation(conversationId);
			if (!conversation) {
				return null;
			}

			const existingName = conversation.info.name;
			
			// If conversation already has a non-default name, return it without making API call
			if (existingName && 
				existingName !== 'New conversation' && 
				!/^New conversation \d+$/.test(existingName)) {
				return existingName;
			}

			// Check if conversation has enough content for naming
			if (conversation.messages.length < 2) {
				return null;
			}

			const userAssistantMessages = conversation.messages.filter(msg => 
				(msg.role === 'user' || msg.role === 'assistant') &&
				msg.content &&
				(msg.function_call === null || msg.function_call === undefined) &&
				(!msg.type || msg.type !== 'function_call_output') &&
				(typeof msg.content === 'string' || Array.isArray(msg.content))
			).slice(0, 3);

			if (userAssistantMessages.length === 0) {
				return null;
			}

			// Convert to Rao message format - remove timestamp field and match Rao's exact structure
			const raoFormatMessages = userAssistantMessages.map(msg => {
				const raoMsg: any = {
					id: msg.id,
					role: msg.role,
					content: msg.content
				};
				
				// Add only the fields that Rao includes
				if (msg.related_to !== undefined) {
					raoMsg.related_to = msg.related_to;
				}
				if (msg.original_query !== undefined) {
					raoMsg.original_query = msg.original_query;
				}
				if (msg.procedural !== undefined) {
					raoMsg.procedural = msg.procedural;
				}
				
				return raoMsg;
			});

			// Call backend for AI-generated name
			const generatedName = await this.backendClient.generateConversationName(raoFormatMessages);
			
			if (!generatedName) {
				return null;
			}

			const cleanedName = generatedName.replace(/["'`]/g, '').trim();
			
			if (cleanedName.length > 0 && cleanedName !== 'New conversation') {
				await this.conversationManager.renameConversation(conversationId, cleanedName);
				return cleanedName;
			}
			
			return null;
		} catch (error) {
			return null; 
		}
	}

	/**
	 * Check if conversation should get an AI-generated name
	 * @param conversationId Conversation ID to check
	 * @returns True if conversation should get an AI-generated name
	 */
	async shouldPromptForName(conversationId: number): Promise<boolean> {
		return await this.conversationManager.shouldPromptForName(conversationId);
	}

	/**
	 * Triggers conversation name generation after streaming completes
	 */
	private triggerConversationNameCheck(): void {
		setTimeout(async () => {
			try {
				const currentConversation = this.conversationManager.getCurrentConversation();
				if (!currentConversation) {
					return;
				}

				const conversationId = currentConversation.info.id;
				
				const shouldPrompt = await this.shouldPromptForName(conversationId);
				
				if (shouldPrompt) {
					const generatedName = await this.generateConversationName(conversationId);
					
					if (generatedName) {
						// Fire event to update UI
						this._onConversationLoaded.fire(this.conversationManager.getCurrentConversation()!);
					}
				}
			} catch (error) {
				// Handle error silently
			}
		}, 500); 
	}

	/**
	 * Phase 5 - Message ID preallocation system for function calls
	 */
	private preallocatedMessageIds: Map<string, number[]> = new Map();
	private firstFunctionCallId: string | null = null;


	/**
	 * Pre-allocate message IDs for a function call
	 */
	preallocateFunctionMessageIds(functionName: string, callId: string): number {
		// Check if this call_id already has pre-allocated IDs
		const existingIds = this.preallocatedMessageIds.get(callId);
		
		if (existingIds && existingIds.length > 0) {
			// Already exists - return the first message ID from the existing set
			return existingIds[0];
		}
		
		// Get the number of message IDs needed
		const idCount = this.getFunctionMessageIdCount(functionName);
		
		// Pre-allocate all needed message IDs
		const messageIds: number[] = [];
		for (let i = 0; i < idCount; i++) {
			messageIds.push(this.getNextMessageId());
		}
		
		// Store them keyed by call_id
		this.preallocatedMessageIds.set(callId, messageIds);
		
		// Return the first message ID (for the function call itself)
		return messageIds[0];
	}

	/**
	 * Get pre-allocated message ID for a function call
	 */
	getPreallocatedMessageId(callId: string, index: number = 1): number | null {
		const preallocatedIds = this.preallocatedMessageIds.get(callId);
		
		const arrayIndex = index - 1;
		
		if (preallocatedIds && preallocatedIds.length > arrayIndex && arrayIndex >= 0) {
			return preallocatedIds[arrayIndex];
		}
		
		// Fallback - generate new ID if not found
		return this.getNextMessageId();
	}

	/**
	 * Check if a function is handled via streaming (RAO-style buffered processing)
	 */
	private isStreamingFunction(functionName: string): boolean {
		// Streaming (interactive) functions in RAO
		return ['run_console_cmd', 'run_terminal_cmd', 'search_replace'].includes(functionName);
	}

	/**
	 * Check if function is a simple function (non-interactive, should trigger orchestrator continuation)
	 * Based on Rao's simple functions list
	 */
	private isSimpleFunction(functionName: string): boolean {
		const simpleFunctions = ['list_dir', 'grep_search', 'read_file', 'view_image', 'search_for_file'];
		return simpleFunctions.includes(functionName);
	}

	/**
	 * Check if a function output indicates failure (should continue conversation)
	 * vs. success (should wait for user interaction)
	 */
	private isFunctionOutputFailure(functionName: string, output: string): boolean {
		if (functionName === 'search_replace') {
			return output.includes('old_string was not found') || 
				   output.includes('old_string does not exist') ||
				   output.includes('similar content matches') ||
				   output.includes('Error:') ||
				   output.includes('Missing required arguments');
		} else if (functionName === 'delete_file') {
			return output.includes('could not be found');
		}
		return false;
	}

	/**
	 * Extract and process command content from accumulated JSON (RAO's intelligent parsing)
	 */
	private extractAndProcessCommandContent(accumulatedContent: string, isConsole: boolean = true): { content: string; isComplete: boolean } {
		// Use RAO's exact parsing logic
		const commandStartMatch = accumulatedContent.match(/"command"\s*:\s*"/);
		if (!commandStartMatch) {
			return { content: '', isComplete: false };
		}

		// Find the start of the actual content (after the opening quote)
		const contentStartPos = commandStartMatch.index! + commandStartMatch[0].length;
		
		// Extract everything from the content start to the end of the accumulator
		let rawContent = accumulatedContent.substring(contentStartPos);
		
		// First unescape the raw content completely (RAO's escape handling)
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

		// Check if we've reached the end of the command field by looking for ", "explanation"
		const explanationMatch = processedContent.match(/\s*"\s*,\s*"explanation"/);
		
		const bufferSize = 20; // Hold back 20 characters to be safe (same as RAO)
		let contentToStream = processedContent;
		let isComplete = false;
		
		if (explanationMatch) {
			// We found the end of command field - truncate content before any trailing whitespace and quote
			contentToStream = processedContent.substring(0, explanationMatch.index!);
			isComplete = true;
		} else if (processedContent.length > bufferSize) {
			// No end marker found yet - stream all but the last buffer_size characters
			contentToStream = processedContent.substring(0, processedContent.length - bufferSize);
		} else {
			// Content is shorter than buffer size - don't stream anything yet
			contentToStream = '';
		}

		// Apply the same trimming logic as RAO handlers for proper command execution
		if (contentToStream.length > 0) {
			if (isConsole) {
				// Apply console command trimming (same as handle_run_console_cmd)
				contentToStream = contentToStream
					.replace(/^```[rR]?[mM]?[dD]?\s*\n?/g, '')
					.replace(/\n?```\s*$/g, '')
					.replace(/```\n/g, '');
			} else {
				// Apply terminal command trimming (same as handle_run_terminal_cmd)
				contentToStream = contentToStream
					.replace(/^```(?:shell|bash|sh)?\s*\n?/g, '')
					.replace(/\n?```\s*$/g, '')
					.replace(/```\n/g, '');
			}
			contentToStream = contentToStream.trim();
		}

		
		return { content: contentToStream, isComplete };
	}

	/**
	 * Determine how many message IDs a function type needs
	 */
	private getFunctionMessageIdCount(functionName: string): number {
		// All functions use 2 IDs: function_call + function_call_output
		// Interactive functions show "Response pending..." until accepted/rejected, then update to show result
		return 2;
	}

	/**
	 * Determine if this call_id is the first function call in the parallel set
	 */
	isFirstFunctionCallInParallelSet(callId: string): boolean {
		if (this.firstFunctionCallId === null) {
			// This is the first function call we've encountered - mark it and return TRUE
			this.firstFunctionCallId = callId;
			return true;
		} else {
			// Check if this call_id matches the first one we encountered
			return callId === this.firstFunctionCallId;
		}
	}

	/**
	 * Reset first function call tracking for new request
	 */
	private resetFirstFunctionCallTracking(): void {
		this.firstFunctionCallId = null;
	}

	/**
	 * Reset message ID counter to highest ID in conversation
	 */
	private resetMessageIdCounterForConversation(conversation: Conversation): void {
		try {
			let maxId = 0;
			
			// Check conversation messages for highest IDs
			if (conversation.messages && conversation.messages.length > 0) {
				const messageIds = conversation.messages
					.map(msg => msg.id)
					.filter(id => typeof id === 'number' && !isNaN(id) && isFinite(id))
					.map(id => Number(id));
				
				if (messageIds.length > 0) {
					maxId = Math.max(maxId, ...messageIds);
				}
			}
			
			this.messageIdCounter = maxId;
			this.logService.info('Reset message ID counter to:', maxId, 'for conversation:', conversation.info.id);
			
		} catch (error) {
			this.logService.error('Failed to reset message ID counter:', error);
			// Fallback to 0 if reset fails
			this.messageIdCounter = 0;
		}
	}

	/**
	 * Clear preallocation state when switching conversations
	 */
	private clearPreallocationStateForConversationSwitch(): void {
		try {
			this.preallocatedMessageIds.clear();
			
			// Reset first function call tracking
			this.firstFunctionCallId = null;
			
			// Clear function call buffer
			this.functionCallBuffer = [];
			
			// REMOVED: Clear pending continuations - orchestrator pattern used instead
			
			this.logService.info('Cleared preallocation state for conversation switch');
			
		} catch (error) {
			this.logService.error('Failed to clear preallocation state:', error);
		}
	}

	// Document Operations (Phase 4 Implementation)

	/**
	 * Get all currently open documents with their content
	 */
	async getAllOpenDocuments(includeContent: boolean = true): Promise<any[]> {
		return this.documentManager.getAllOpenDocuments(includeContent);
	}

	/**
	 * Get the currently active document
	 */
	async getActiveDocument(): Promise<any> {
		return this.documentManager.getActiveDocument();
	}

	/**
	 * Search for text in all open documents
	 */
	async matchTextInOpenDocuments(searchText: string, options?: any): Promise<any[]> {
		return this.documentManager.matchTextInOpenDocuments(searchText, options);
	}

	/**
	 * Update the content of an open document
	 */
	async updateOpenDocumentContent(documentIdOrPath: string, newContent: string, markClean: boolean = true): Promise<boolean> {
		return this.documentManager.updateOpenDocumentContent(documentIdOrPath, newContent, markClean);
	}

	/**
	 * Get effective file content (handles both saved and unsaved files)
	 */
	async getEffectiveFileContent(filePath: string, startLine?: number, endLine?: number): Promise<string | null> {
		const content = await this.documentManager.getEffectiveFileContent(filePath, startLine, endLine);
		return content; // Return null if file doesn't exist, don't convert to empty string
	}

	/**
	 * Check if a file is currently open in the editor
	 */
	checkIfFileOpenInEditor(filePath: string): boolean {
		return this.documentManager.checkIfFileOpenInEditor(filePath);
	}

	/**
	 */
	async getOpenDocumentContent(filePath: string): Promise<string | null> {
		return this.documentManager.getOpenDocumentContent(filePath);
	}

	/**
	 * Check if pasted text matches content in open documents using RAO's algorithm
	 * Returns match details if found, null otherwise
	 */
	async checkPastedTextInOpenDocuments(pastedText: string): Promise<{ filePath: string; startLine: number; endLine: number } | null> {
		
		if (!pastedText || pastedText.trim().length === 0) {
			return null;
		}

		// Normalize line endings and trim (following RAO's exact algorithm)
		let searchText = pastedText.trim();
		searchText = searchText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

		// Check if the text contains a line break or matches a complete line from any open document
		// This ensures paste events from files are meaningful content, not just short fragments
		const hasLineBreak = searchText.includes('\n');
		let isCompleteLine = false;

		if (!hasLineBreak) {
			// Check if the text matches a complete line from any open document
			const documents = await this.documentManager.getAllOpenDocuments(true);
			
			for (const doc of documents) {
				if (!doc.content || doc.content.length === 0) {
					continue;
				}

				// Normalize document content line endings
				let content = doc.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
				
				// Split into lines and check each one
				const lines = content.split('\n');
				
				for (const line of lines) {
					const trimmedLine = line.trim();
					const trimmedSearch = searchText.trim();
					if (trimmedLine.length > 0 && trimmedLine === trimmedSearch) {
						isCompleteLine = true;
						break;
					}
				}
				
				if (isCompleteLine) {
					break;
				}
			}
		}

		const hasLine = hasLineBreak || isCompleteLine;

		if (!hasLine) {
			return null;
		}

		// Search for exact match in documents
		const documents = await this.documentManager.getAllOpenDocuments(true);

		for (const doc of documents) {
			if (!doc.content || doc.content.length === 0) {
				continue;
			}

			// Normalize content line endings
			let content = doc.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
			
			// Look for exact match
			const pos = content.indexOf(searchText);
			if (pos !== -1) {
				
				// Found a match - now determine line numbers (following RAO's algorithm)
				const lines = content.split('\n');
				
				// Find which line contains the start of the match
				let currentPos = 0;
				let startLine = 1;
				let endLine = 1;
				
				for (let lineNum = 0; lineNum < lines.length; lineNum++) {
					const lineLength = lines[lineNum].length + 1; // +1 for newline
					
					if (currentPos <= pos && pos < currentPos + lineLength) {
						startLine = lineNum + 1; // Convert to 1-based
						break;
					}
					currentPos += lineLength;
				}
				
				// Find end line
				const matchEnd = pos + searchText.length;
				currentPos = 0;
				
				for (let lineNum = 0; lineNum < lines.length; lineNum++) {
					const lineLength = lines[lineNum].length + 1; // +1 for newline
					
					if (currentPos <= matchEnd && matchEnd <= currentPos + lineLength) {
						endLine = lineNum + 1; // Convert to 1-based
						break;
					}
					currentPos += lineLength;
				}

				
				return {
					filePath: doc.path,
					startLine: startLine,
					endLine: endLine
				};
			}
		}

		return null;
	}

	// Context Management (Phase 4 Implementation)

	/**
	 * Add a file to the AI context
	 */
	async addContextFile(path: string): Promise<boolean> {
		return this.contextManager.addFile(path);
	}

	/**
	 * Add a directory to the AI context
	 */
	async addContextDirectory(path: string, recursive: boolean = false): Promise<boolean> {
		return this.contextManager.addDirectory(path, recursive);
	}

	/**
	 * Add specific lines from a file to context
	 */
	async addContextLines(path: string, startLine: number, endLine: number): Promise<boolean> {
		return this.contextManager.addLines(path, startLine, endLine);
	}

	/**
	 */
	addContextDocumentation(topic: string, name?: string): boolean {
		return this.contextManager.addDocumentation(topic, name);
	}

	/**
	 * Add conversation reference to context
	 */
	addContextConversation(conversationId: number, name?: string): boolean {
		return this.contextManager.addConversation(conversationId, name);
	}

	/**
	 * Get all context data for AI request
	 */
	async getContextForRequest(): Promise<any> {
		return this.contextManager.getContextForRequest();
	}

	/**
	 * Remove an item from context
	 */
	removeContextItem(pathOrId: string): boolean {
		return this.contextManager.removeItem(pathOrId);
	}

	/**
	 * Clear all context items
	 */
	clearContext(): void {
		this.contextManager.clear();
	}

	/**
	 * Get all context items
	 */
	getContextItems(): any[] {
		return this.contextManager.getContextItems();
	}


	/**
	 * Get document manager instance (for advanced usage)
	 */
	getDocumentManager(): DocumentManager {
		return this.documentManager;
	}

	/**
	 * Get context manager instance (for advanced usage)
	 */
	getContextManager(): ContextManager {
		return this.contextManager;
	}

	/**
	 */
	async browseDirectory(): Promise<any> {
		return this.fileBrowser.browseDirectory();
	}

	/**
	 */
	async browseForFile(): Promise<any> {
		return this.fileBrowser.browseForFile();
	}

	/**
	 * List files in a directory
	 */
	async listDirectory(directoryPath: string): Promise<any[]> {
		return this.fileBrowser.listDirectory(directoryPath);
	}

	/**
	 * Get current workspace directory
	 */
	getCurrentWorkspaceDirectory(): string | null {
		return this.fileBrowser.getCurrentWorkspaceDirectory();
	}

	/**
	 * Check if a path exists
	 */
	async pathExists(path: string): Promise<boolean> {
		return this.fileBrowser.pathExists(path);
	}

	/**
	 * Get file information
	 */
	async getFileInfo(path: string): Promise<any> {
		return this.fileBrowser.getFileInfo(path);
	}



	/**
	 * Get file browser instance (for advanced usage)
	 */
	getFileBrowser(): FileBrowser {
		return this.fileBrowser;
	}

	/**
	 * Get service instance by name (for accessing injected services)
	 */
	getService(serviceName: string): any {
		switch (serviceName) {
			case 'IJupytextService':
				return this.jupytextService;
			default:
				return null;
		}
	}

	/**
	 * Get markdown renderer instance (for UI components)
	 */
	getMarkdownRenderer(): ErdosAiMarkdownRenderer {
		return this.markdownRenderer;
	}

	/**
	 * This implements the critical missing piece from Phase 4
	 */
	private async prepareContextForBackend(messages: ConversationMessage[], vscodeReferences?: any[]): Promise<any> {
		try {
			const userRules = await this.getUserRules();
			const environmentInfo = await this.gatherEnvironmentInfo();
			
			// Create symbols_note for user-added context only (no keywords/symbols processing)
			const symbolsNote = await this.createSymbolsNoteForContext();
			
			return {
				symbols_note: symbolsNote,
				user_rules: userRules,
				...environmentInfo
			};
		} catch (error) {
			this.logService.error('Failed to prepare context for backend:', error);
			return {
				symbols_note: null,
				user_rules: []
			};
		}
	}

	/**
	 * Create symbols_note containing only user-added context (no keyword/symbol processing)
	 */
	private async createSymbolsNoteForContext(): Promise<any> {
		// Get user-added context items from context service
		const directContextItems = await this.contextService.generateDirectContextData();
		const openFiles = await this.getOpenFilesInfo();

		// Prepare attached images like Rao's prepare_image_context_data
		const imageService = this.getImageAttachmentService();
		const attachedImages: any[] = [];
		if (imageService) {
			const images = imageService.getAttachedImages();
			
			// Convert our image format to Rao's backend format
			for (const image of images) {
				attachedImages.push({
					filename: image.filename,
					original_path: image.originalPath,
					local_path: image.localPath,
					mime_type: image.mimeType,
					base64_data: image.base64Data,
					timestamp: image.timestamp
				});
			}
		}

		// Return null if no context to include (including images)
		if (directContextItems.length === 0 && openFiles.length === 0 && attachedImages.length === 0) {
			return null;
		}

		// Return minimal symbols_note structure with only user-added context
		const symbolsNote = {
			direct_context: directContextItems,
			environment_variables: {
				Data: [],
				Function: [],
				Value: []
			}, // Empty - no environment variable processing
			open_files: openFiles,
			attached_images: attachedImages
		};
		


		return symbolsNote;
	}

	/**
	 */
	private async gatherEnvironmentInfo(): Promise<any> {
		try {
			const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
			
			return {
				user_os_version: navigator.platform || 'unknown',
				user_workspace_path: workspaceFolder?.uri.fsPath || '',
				user_shell: 'bash', // Default for web environment
				project_layout: '', // Would be generated from workspace analysis
				client_version: '0.3.3'
			};
		} catch (error) {
			this.logService.error('Failed to gather environment info:', error);
			return {
				user_os_version: 'unknown',
				user_workspace_path: '',
				user_shell: 'bash',
				project_layout: '',
				client_version: '0.3.3'
			};
		}
	}


	/**
	 * Ensures an R session is available, starting one if needed
	 * Private helper method for help content retrieval
	 */
	private async ensureRSession(): Promise<void> {
		// Check if there's already an R session running
		const existingRSession = this.runtimeSessionService.getConsoleSessionForLanguage('r');
		if (existingRSession) {
			return; // Already have an R session
		}

		// Get the preferred R runtime
		const rRuntime = this.runtimeStartupService.getPreferredRuntime('r');
		if (!rRuntime) {
			throw new Error('No R interpreter is available');
		}

		// Start a new R console session
		await this.runtimeSessionService.startNewRuntimeSession(
			rRuntime.runtimeId,
			rRuntime.runtimeName,
			LanguageRuntimeSessionMode.Console,
			undefined, // No notebook URI (console session)
			'Erdos AI help content request',
			RuntimeStartMode.Starting,
			false // Don't activate/focus
		);

		// Wait a moment for the session to be ready
		await new Promise(resolve => setTimeout(resolve, 1000));
	}

	/**
	 * Ensures a Python session is available, starting one if needed
	 * Private helper method for help content retrieval
	 */
	private async ensurePythonSession(): Promise<void> {
		// Check if there's already a Python session running
		const existingPythonSession = this.runtimeSessionService.getConsoleSessionForLanguage('python');
		if (existingPythonSession) {
			return; // Already have a Python session
		}

		// Get the preferred Python runtime
		const pythonRuntime = this.runtimeStartupService.getPreferredRuntime('python');
		if (!pythonRuntime) {
			throw new Error('No Python interpreter is available');
		}

		// Start a new Python console session
		await this.runtimeSessionService.startNewRuntimeSession(
			pythonRuntime.runtimeId,
			pythonRuntime.runtimeName,
			LanguageRuntimeSessionMode.Console,
			undefined, // No notebook URI (console session)
			'Erdos AI help content request',
			RuntimeStartMode.Starting,
			false // Don't activate/focus
		);

		// Wait a moment for the session to be ready
		await new Promise(resolve => setTimeout(resolve, 1000));
	}

	/**
	 * Get help as markdown for both R and Python topics
	 * Public method required by IErdosAiService interface
	 */
	public async getHelpAsMarkdown(topic: string, packageName?: string, language?: 'R' | 'Python'): Promise<string> {
		try {
			// If language is specified, ensure that session is started and use that specific command
			if (language === 'Python') {
				try {
					await this.ensurePythonSession();
					const markdown = await this.commandService.executeCommand<string>('python.getHelpAsMarkdown', topic);
					return typeof markdown === 'string' ? markdown : `Help topic: ${topic}\n\nNo Python help content available.`;
				} catch (error) {
					return `Help topic: ${topic}\n\nCould not start Python session for help content.`;
				}
			} else if (language === 'R') {
				try {
					await this.ensureRSession();
					const markdown = await this.commandService.executeCommand<string>('r.getHelpAsMarkdown', topic, packageName || '');
					return typeof markdown === 'string' ? markdown : `Help topic: ${topic}\n\nNo R help content available.`;
				} catch (error) {
					return `Help topic: ${topic}\n\nCould not start R session for help content.`;
				}
			}

			// If no language specified, try R first
			try {
				await this.ensureRSession();
				const rMarkdown = await this.commandService.executeCommand<string>('r.getHelpAsMarkdown', topic, packageName || '');
				if (typeof rMarkdown === 'string' && rMarkdown.length > 0) {
					return rMarkdown;
				}
			} catch (rError) {
				// R failed, try Python
			}

			// Try Python if R failed or returned empty
			try {
				await this.ensurePythonSession();
				const pythonMarkdown = await this.commandService.executeCommand<string>('python.getHelpAsMarkdown', topic);
				if (typeof pythonMarkdown === 'string' && pythonMarkdown.length > 0) {
					return pythonMarkdown;
				}
			} catch (pythonError) {
				// Both failed
			}

			return `Help topic: ${topic}\n\nNo help content available from R or Python.`;
		} catch (error) {
			this.logService.error('Failed to get help as markdown:', error);
			return `Help topic: ${topic}\n\nError retrieving help content.`;
		}
	}



	/**
	 */
	private async getOpenFilesInfo(): Promise<any[]> {
		try {
			const openDocs = await this.documentManager.getAllOpenDocuments(false);
			return openDocs.map(doc => ({
				id: doc.id,
				path: doc.path,
				type: doc.metadata?.language || 'text',
				dirty: !doc.isSaved,
				name: CommonUtils.getBasename(doc.path) || doc.id,
				minutes_since_last_update: 0, // Would calculate actual time
				is_active: doc.isActive
			}));
		} catch (error) {
			this.logService.error('Failed to get open files info:', error);
			return [];
		}
	}

	/**
	 * Validate and process search_replace function call (like Rao's handle_search_replace)
	 * Returns success=true if widget should be created, success=false if error should trigger retry
	 */
	private async validateAndProcessSearchReplace(functionCall: any, messageId: number, relatedToId: number, requestId: string): Promise<{success: boolean, errorMessage?: string}> {
		try {
			// Parse arguments safely (like Rao's safe_parse_function_arguments)
			let args: any;
			try {
				args = JSON.parse(functionCall.arguments || '{}');
			} catch (error) {
				const errorMsg = 'Invalid JSON in search_replace arguments';
				await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
				return { success: false, errorMessage: errorMsg };
			}

			const filePath = args.file_path;
			let oldString = args.old_string;
			let newString = args.new_string;

			// Validate required arguments (like Rao lines 894-948)
			// Note: oldString can be empty string for file creation, so check for null/undefined only
			if (!filePath || oldString === null || oldString === undefined || newString === null || newString === undefined) {
				const errorMsg = 'Missing required arguments: file_path, old_string, and new_string are all required';
				await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
				return { success: false, errorMessage: errorMsg };
			}

			// Remove line numbers (like Rao lines 859-866)
			oldString = this.removeLineNumbers(oldString);
			newString = this.removeLineNumbers(newString);

			// Validate old_string != new_string (like Rao lines 868-891)
			if (oldString === newString) {
				const errorMsg = 'Your old_string and new_string were the same. They must be different.';
				await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
				return { success: false, errorMessage: errorMsg };
			}

			// Handle special case: empty old_string means create/append to file (like Rao lines 919-1066)
			if (oldString === '') {
				// For empty old_string, we allow creating new files or appending to existing ones
				const effectiveContent = await this.getEffectiveFileContent(filePath);
				// For empty old_string, we create new file or append to existing file
				let currentContent = effectiveContent || '';
				
				// Append new content to existing content (like Rao's create/append logic)
				const newContent = currentContent + (currentContent ? '\n' : '') + newString;
				
				// Compute diff and store it (reusing existing diff computation logic)
				const { computeLineDiff } = await import('./utils/diffUtils.js');
				
				// Set conversation manager for file persistence
				diffStore.setConversationManager(this.conversationManager);
				
				const oldLines = currentContent.split('\n');
				const newLines = newContent.split('\n');
				const diffResult = computeLineDiff(oldLines, newLines);
			
				// Filter diff before storage to prevent storing entire files (like Rao's pattern)
				const filteredDiff = filterDiff(diffResult.diff);
				
				// Store filtered diff data for later retrieval
				diffStore.storeDiffData(
					messageId.toString(),
					filteredDiff,
					currentContent,
					newContent,
					{ is_start_edit: false, is_end_edit: false },
					filePath,
					'',
					newString
				);
				
				return { success: true };
			}

			// For normal search_replace mode, validate that file exists (like Rao lines 1069-1094)
			const effectiveContent = await this.getEffectiveFileContent(filePath);
			if (!effectiveContent && effectiveContent !== '') {
				const errorMsg = `File not found: ${filePath}. Please check the file path or read the current file structure.`;
				await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
				return { success: false, errorMessage: errorMsg };
			}

			// CRITICAL: Do match counting validation immediately (like Rao lines 1096-1143)
			// Count occurrences of old_string in the file, allowing flexible trailing whitespace
			const flexiblePattern = this.createFlexibleWhitespacePattern(oldString);
			const oldStringMatches = [...effectiveContent.matchAll(new RegExp(flexiblePattern, 'g'))];
			const matchCount = oldStringMatches.length;


			// Handle different match scenarios - return errors that trigger continue (like Rao lines 1102-1191)
			if (matchCount === 0) {
				// Perform fuzzy search when no exact matches are found (like Rao lines 1104-1143)
				const fileLines = effectiveContent.split('\n');
				const fuzzyResults = this.performFuzzySearchInContent(oldString, fileLines);
				
				let errorMsg: string;
				if (fuzzyResults.length > 0) {
					// Create match details directly from fuzzy results (like Rao lines 1109-1119)
					const matchDetails = fuzzyResults.map((result, i) => 
						`Match ${i + 1} (${result.similarity}% similar, around line ${result.line}):\n\`\`\`\n${result.text}\n\`\`\``
					);
					
					errorMsg = `The old_string was not found exactly in the file ${filePath}. However, here are similar content matches that might be what you're looking for. If this is what you wanted, please use the exact text from one of these matches:\n\n${matchDetails.join('\n\n')}`;
				} else {
					errorMsg = 'The old_string does not exist in the file and no similar content was found. Read the content and try again with the exact text.';
				}
				
				await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
				return { success: false, errorMessage: errorMsg };
			}

			if (matchCount > 1) {
				// Multiple matches found - provide unique context for each match (like Rao lines 1145-1191)
				const fileLines = effectiveContent.split('\n');
				
				// Find line numbers for each match (like Rao lines 1149-1163)
				const matchLineNums: number[] = [];
				for (let i = 0; i < matchCount; i++) {
					const matchPos = oldStringMatches[i].index!;
					let charCount = 0;
					let lineNum = 1;
					for (const line of fileLines) {
						charCount += line.length + 1; // +1 for newline
						if (charCount >= matchPos) {
							break;
						}
						lineNum++;
					}
					matchLineNums[i] = lineNum;
				}
				
				// Generate unique context for each match (like Rao line 1166)
				const matchDetails = this.generateUniqueContexts(fileLines, matchLineNums);
				
				const errorMsg = `The old_string was found ${matchCount} times in the file ${filePath}. Please provide a more specific old_string that matches exactly one location. Here are all the matches with context:\n\n${matchDetails.join('\n\n')}`;
				
				await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
				return { success: false, errorMessage: errorMsg };
			}

			// SUCCESS: Exactly one match found - compute and store diff data (like Rao lines 1193-1270)
			
			// Simulate the replacement to get new content
			const newContent = effectiveContent.replace(new RegExp(flexiblePattern), newString);
			
			// Compute diff and store it (reusing existing diff computation logic)
			const { computeLineDiff } = await import('./utils/diffUtils.js');
			
			// Set conversation manager for file persistence
			diffStore.setConversationManager(this.conversationManager);
			
			const oldLines = effectiveContent.split('\n');
			const newLines = newContent.split('\n');
					const diffResult = computeLineDiff(oldLines, newLines);
		
			// Filter diff before storage to prevent storing entire files (like Rao's pattern)
			const filteredDiff = filterDiff(diffResult.diff);
			
			// Store filtered diff data for later retrieval
			diffStore.storeDiffData(
				messageId.toString(),
				filteredDiff,
				effectiveContent,
				newContent,
				{ is_start_edit: false, is_end_edit: false },
				filePath,
				oldString,
				newString
			);


			// Save successful function_call_output (like Rao lines 1261-1270)
			await this.saveSearchReplaceSuccess(functionCall.call_id, messageId);

			return { success: true };

		} catch (error) {
			console.error(`[SEARCH_REPLACE] Error during validation:`, error);
			const errorMsg = `Search and replace operation failed: ${error instanceof Error ? error.message : String(error)}`;
			await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
			return { success: false, errorMessage: errorMsg };
		}
	}

	/**
	 * Save search_replace error to conversation log (like Rao's error returns)
	 */
	private async saveSearchReplaceError(callId: string, messageId: number, errorMessage: string): Promise<void> {
		try {
			// Replace the pending function_call_output with error (like Rao line 879)
			await this.replacePendingFunctionCallOutput(callId, errorMessage, false); // success = false
			
			// Update conversation display immediately to replace widget with error message (like Rao)
			await this.updateConversationDisplay();
		} catch (error) {
			console.error(`[SEARCH_REPLACE] Failed to save error:`, error);
		}
	}

	/**
	 * Save search_replace success to conversation log (like Rao's success returns)
	 */
	private async saveSearchReplaceSuccess(callId: string, messageId: number): Promise<void> {
		try {
			const successMessage = 'Response pending...';
			await this.replacePendingFunctionCallOutput(callId, successMessage, true); // success = true
		} catch (error) {
			console.error(`[SEARCH_REPLACE] Failed to save success:`, error);
		}
	}

	/**
	 * Perform fuzzy search in content (exactly like Rao's perform_fuzzy_search_in_content)
	 */
	private performFuzzySearchInContent(searchString: string, fileLines: string[]): Array<{similarity: number, line: number, text: string}> {
		if (!searchString || searchString.trim().length === 0 || !fileLines || fileLines.length === 0) {
			return [];
		}
		
		// Clean up the search string
		searchString = searchString.trim();
		
		// Convert file to single text string
		const fileText = fileLines.join('\n');
		
		const searchLen = searchString.length;
		const fileLen = fileText.length;
		
		if (searchLen < 3 || fileLen < searchLen) {
			return [];
		}
		
		// Seed-and-extend algorithm for fast approximate matching (like Rao's BLAST-style algorithm)
		
		// Step 1: Generate seeds from trimmed lines of the search string
		const searchLines = searchString.split('\n');
		const seeds: string[] = [];
		const seedPositions: number[] = [];
		
		// Use entire lines as seeds, with leading/trailing whitespace removed
		for (let i = 0; i < searchLines.length; i++) {
			const line = searchLines[i];
			const trimmedLine = line.trim();
			
			// Only use non-empty trimmed lines as seeds
			if (trimmedLine.length > 0) {
				// Find the actual position of this trimmed seed in the original search string
				const seedMatch = searchString.indexOf(trimmedLine);
				if (seedMatch !== -1) {
					// Use the first occurrence position
					seeds.push(trimmedLine);
					seedPositions.push(seedMatch);
				}
			}
		}
		
		// Step 2: Find all exact matches of seeds in the text (very fast)
		const candidatePositions: Array<{filePos: number, seedMatchPos: number, seedInSearch: number}> = [];
		for (let j = 0; j < seeds.length; j++) {
			const seed = seeds[j];
			const seedPos = seedPositions[j];
			
			// Use indexOf for fast exact matching (much faster than sliding window)
			let searchPos = 0;
			while (true) {
				const matchPos = fileText.indexOf(seed, searchPos);
				if (matchPos === -1) break;
				
				// Calculate where the full search string would align
				const alignStart = matchPos - seedPos + 1;
				candidatePositions.push({
					filePos: alignStart,
					seedMatchPos: matchPos,
					seedInSearch: seedPos
				});
				searchPos = matchPos + 1;
			}
		}
		
		if (candidatePositions.length === 0) {
			return [];
		}
		
		// Step 3: Group nearby candidates and evaluate alignments
		// Sort candidates by file position
		candidatePositions.sort((a, b) => a.filePos - b.filePos);
		
		const alignments: Array<{text: string, similarity: number, line: number, distance: number, filePos: number}> = [];
		const processedPositions: number[] = [];
		
		for (const candidate of candidatePositions) {
			const filePos = candidate.filePos;
			
			// Skip if we've already processed a nearby position (within 10 chars)
			if (processedPositions.some(pos => Math.abs(pos - filePos) < 10)) {
				continue;
			}
			
			// Calculate alignment boundaries (exactly like Rao)
			const alignStart = Math.max(1, filePos); // 1-based like Rao
			const alignEnd = Math.min(fileLen, alignStart + searchLen - 1);
			
			if (alignEnd > alignStart + 2) { // Need at least 3 chars
				// Extract aligned region from file (using 1-based positions like Rao)
				const alignedText = fileText.slice(alignStart - 1, alignEnd); // Convert to 0-based for slice
				const actualLen = alignedText.length;
				
				// Use the shorter of the two lengths for fair comparison
				const compareLen = Math.min(searchLen, actualLen);
				if (compareLen >= 3) {
					const searchSubstr = searchString.slice(0, compareLen);
					const alignedSubstr = alignedText.slice(0, compareLen);
					
					// Fast edit distance calculation only for promising candidates (exactly like Rao's adist)
					const distance = this.calculateEditDistance(searchSubstr, alignedSubstr);
					const similarity = Math.round((1 - distance / compareLen) * 100 * 10) / 10; // round to 1 decimal like Rao
					
					// Only keep reasonably good matches (>= 50% similarity)
					if (similarity >= 50) {
						// Find line number for display (exactly like Rao)
						const textBefore = fileText.slice(0, alignStart - 1); // alignStart - 1 like Rao
						const lineNum = textBefore.split('\n').length;
						
						alignments.push({
							text: alignedText,
							similarity: similarity,
							line: lineNum,
							distance: distance,
							filePos: alignStart
						});
						
						processedPositions.push(filePos);
					}
				}
			}
		}
		
		if (alignments.length === 0) {
			return [];
		}
		
		// Step 4: Sort by similarity and return top matches
		alignments.sort((a, b) => b.similarity - a.similarity);
		
		const results: Array<{similarity: number, line: number, text: string}> = [];
		const usedLineRanges: Array<{start: number, end: number}> = [];
		
		for (const alignment of alignments) {
			// Calculate line range for this match
			const startLine = alignment.line;
			const matchLines = alignment.text.split('\n');
			const endLine = startLine + matchLines.length - 1;
			
			// Check for overlap with any previously used line ranges
			let hasOverlap = false;
			for (const usedRange of usedLineRanges) {
				if (!(endLine < usedRange.start || startLine > usedRange.end)) {
					hasOverlap = true;
					break;
				}
			}
			
			// Skip if overlaps with previous result
			if (hasOverlap) {
				continue;
			}
			
			results.push({
				similarity: alignment.similarity, // Keep the 1 decimal place from calculation
				line: alignment.line,
				text: alignment.text
			});
			usedLineRanges.push({start: startLine, end: endLine});
			
			// Limit to 5 best distinct matches
			if (results.length >= 5) {
				break;
			}
		}
		
		return results;
	}

	/**
	 * Calculate edit distance (Levenshtein distance) between two strings
	 */
	private calculateEditDistance(str1: string, str2: string): number {
		const len1 = str1.length;
		const len2 = str2.length;
		
		// Create matrix
		const matrix: number[][] = [];
		for (let i = 0; i <= len1; i++) {
			matrix[i] = [];
			matrix[i][0] = i;
		}
		for (let j = 0; j <= len2; j++) {
			matrix[0][j] = j;
		}
		
		// Fill matrix
		for (let i = 1; i <= len1; i++) {
			for (let j = 1; j <= len2; j++) {
				const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
				matrix[i][j] = Math.min(
					matrix[i - 1][j] + 1,     // deletion
					matrix[i][j - 1] + 1,     // insertion
					matrix[i - 1][j - 1] + cost // substitution
				);
			}
		}
		
		return matrix[len1][len2];
	}

	/**
	 * Generate unique contexts for multiple matches (exactly like Rao's generate_unique_contexts)
	 */
	private generateUniqueContexts(fileLines: string[], matchLineNums: number[]): string[] {
		// Generate the minimum context needed to make each match unique
		
		if (matchLineNums.length <= 1) {
			return [];
		}
		
		const maxContext = 10; // Maximum context lines to prevent huge outputs
		
		for (let contextSize = 1; contextSize <= maxContext; contextSize++) {
			// Try current context size
			const currentContexts: Array<{context: string, display: string}> = [];
			
			for (let i = 0; i < matchLineNums.length; i++) {
				const lineNum = matchLineNums[i]; // This is 1-based line number from Rao logic
				
				// Get context window (convert from 1-based to 0-based indexing)
				const startLine = Math.max(0, lineNum - contextSize - 1); // Convert 1-based to 0-based
				const endLine = Math.min(fileLines.length - 1, lineNum + contextSize - 1); // Convert 1-based to 0-based
				const contextLines = fileLines.slice(startLine, endLine + 1);
				
				// Create context string
				const contextStr = contextLines.join('\n');
				currentContexts[i] = {
					context: contextStr,
					display: `Match ${i + 1} (around line ${lineNum}):\n\`\`\`\n${contextStr}\n\`\`\``
				};
			}
			
			// Check if all contexts are unique
			const contextStrings = currentContexts.map(x => x.context);
			const uniqueStrings = new Set(contextStrings);
			if (uniqueStrings.size === contextStrings.length) {
				// All contexts are unique, return them
				return currentContexts.map(x => x.display);
			}
		}
		
		// If we couldn't make them unique even with max context, just return what we have
		// This shouldn't happen often, but provides a fallback
		const finalContexts: string[] = [];
		for (let i = 0; i < matchLineNums.length; i++) {
			const lineNum = matchLineNums[i];
			const startLine = Math.max(0, lineNum - maxContext - 1);
			const endLine = Math.min(fileLines.length - 1, lineNum + maxContext - 1);
			const contextLines = fileLines.slice(startLine, endLine + 1);
			const contextStr = contextLines.join('\n');
			finalContexts.push(`Match ${i + 1} (around line ${lineNum}):\n\`\`\`\n${contextStr}\n\`\`\``);
		}
		
		return finalContexts;
	}

	/**
	 * Create function call message with complete arguments when function completes (RAO approach)
	 * This is the ONLY time function calls get saved to conversation log
	 */
	private async createFunctionCallMessageWithCompleteArguments(
		functionName: string, 
		callId: string, 
		messageId: number, 
		completeArguments: string,
		requestId: string
	): Promise<{status?: string, data?: any} | void> {
		const conversation = this.conversationManager.getCurrentConversation();
		if (!conversation) {
			return;
		}

		const userMessages = conversation.messages.filter(m => m.role === 'user');
		const relatedToId: number = userMessages.length > 0 ? userMessages[userMessages.length - 1].id : 0;

		try {
			// Create function call with complete arguments (like RAO does on completion)
			const functionCall = {
				name: functionName,
				arguments: completeArguments, // Complete accumulated JSON
				call_id: callId
			};

			// Get preallocated ID for the pending function_call_output (like Rao does)
			const pendingOutputId = this.getPreallocatedMessageId(callId, 2);
			if (pendingOutputId === null) {
				throw new Error(`Pre-allocated function call output ID not found for call_id: ${callId}`);
			}

			const added = await this.conversationManager.addFunctionCallMessage(
				conversation.info.id,
				messageId,
				functionCall,
				relatedToId,
				true,
				pendingOutputId,
				requestId  // Pass request_id for widget operations (like Rao)
			);
			
			
			// For search_replace operations, run validation and diff computation (like Rao's handle_search_replace)
			if (functionName === 'search_replace') {
				const validationResult = await this.validateAndProcessSearchReplace(functionCall, messageId, relatedToId, requestId);
				
				// If validation failed, return continue_silent status (like console/terminal accept methods)
				if (!validationResult.success) {
					
					// RETURN status to orchestrator (like console/terminal accept methods do)
					return {
						status: 'continue_silent',
						data: {
							message: validationResult.errorMessage,
							related_to_id: relatedToId,
							request_id: requestId
						}
					};
				}
				
				// If validation succeeded, fire widget update with diff data and return pending status
				await this.retrieveAndFireSearchReplaceDiffUpdate(messageId);
				
				// Return pending status to indicate waiting for user interaction (like console/terminal)
				return {
					status: 'pending',
					data: {
						message: 'Search replace operation ready for user approval',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			}
			
			// Notify UI so conversation log gets updated
			this._onMessageAdded.fire(added);
		} catch (error) {
			this.logService.error('Failed to create function call message with complete arguments:', error);
		}
	}

	/**
	 * Update conversation display - re-renders conversation to replace failed widgets with error messages (like Rao)
	 */
	private async updateConversationDisplay(): Promise<void> {
		try {
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (!currentConversation) {
				return;
			}
			
			
			// Fire conversation loaded event to trigger full re-render (like Rao's recreate_console_widgets_for_conversation)
			this._onConversationLoaded.fire(currentConversation);
			
		} catch (error) {
			console.error(`[UPDATE_CONVERSATION_DISPLAY] Failed to update conversation display:`, error);
		}
	}

	/**
	 * Retrieve stored diff data for search_replace and fire widget update (like Rao's widget creation)
	 */
	private async retrieveAndFireSearchReplaceDiffUpdate(messageId: number): Promise<void> {
		try {
			// Set conversation manager for diff storage access
			diffStore.setConversationManager(this.conversationManager);
			
			// Retrieve stored diff entry
			const storedDiffEntry = diffStore.getStoredDiffEntry(messageId.toString());
			if (!storedDiffEntry) {
				return;
			}
			
			// Count added/deleted lines
			let added = 0, deleted = 0;
			for (const diffItem of storedDiffEntry.diff_data) {
				if (diffItem.type === 'added') added++;
				else if (diffItem.type === 'deleted') deleted++;
			}
			
					// Data is already filtered when stored, use as-is (like Rao's pattern after storage)
		const filteredDiff = storedDiffEntry.diff_data;
			
			// Get clean filename
			const cleanFilename = CommonUtils.getBasename(storedDiffEntry.file_path || 'unknown');
			
			// Reconstruct content from filtered diff for widget display (like Rao's filtered_content)
			let filteredContent = '';
			for (const diffItem of filteredDiff) {
				if (diffItem.type !== 'deleted' && diffItem.content) {
					filteredContent += diffItem.content + '\n';
				}
			}
			// Remove trailing newline
			filteredContent = filteredContent.replace(/\n$/, '');
			
			// Fire widget update with diff data for UI highlighting
			this._onWidgetStreamingUpdate.fire({
				messageId: messageId,
				delta: filteredContent, // Use filtered content like Rao
				isComplete: true,
				diffData: {
					diff: filteredDiff,
					added: added,
					deleted: deleted,
					clean_filename: cleanFilename
				},
				filename: cleanFilename,
				replaceContent: true // Replace with filtered content
			});
			
		} catch (error) {
			console.error('[DIFF_SERVICE] Failed to retrieve and fire search_replace diff update:', error);
		}
	}

	/**
	 * Each function call returns to orchestrator with status - NO NESTED API CALLS
	 */
	private async processSingleFunctionCallWithOrchestration(functionCall: any, requestId: string, messageId?: string | number): Promise<{status: string, data?: any} | null> {
		try {
			
			// Note: Function name and call_id are available in functionCall object when needed
			
			// Get current conversation to find the related message
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation || conversation.messages.length === 0) {
				this.logService.error('No conversation available for function call processing');
				return {
					status: 'error',
					data: {
						error: 'No conversation available for function call processing'
					}
				};
			}

			const userMessages = conversation.messages.filter(m => m.role === 'user');
			const relatedToId: number = userMessages.length > 0 ? userMessages[userMessages.length - 1].id : 0;

			// If message_id provided from buffer, use it; otherwise get preallocated or generate new
			let functionCallMessageId: number;
			if (messageId !== undefined && messageId !== null) {
				functionCallMessageId = Number(messageId);
			} else {
				functionCallMessageId = Number(this.getPreallocatedMessageId(functionCall.call_id || '', 1) || this.getNextMessageId());
			}

		// ALL functions should get pending function_call_output messages that get replaced when the actual result comes in
		// Get preallocated ID for the pending function_call_output (like Rao does)
		const pendingOutputId = this.getPreallocatedMessageId(functionCall.call_id, 2);
		if (pendingOutputId === null) {
			throw new Error(`Pre-allocated function call output ID not found for call_id: ${functionCall.call_id}`);
		}

		// ALWAYS create the function call message for ALL functions
		// Interactive functions get their pending output created during streaming
		// Simple functions create their final output directly in their handlers
		await this.conversationManager.addFunctionCallMessage(
			conversation.info.id,
			functionCallMessageId,
			functionCall,
			relatedToId,
			false,
			pendingOutputId,
			requestId
		);
		

		// This message is for display only and does NOT get saved to conversation log
		const humanReadableMessage = this.generateFunctionCallDisplayMessage(functionCall);
		
		if (humanReadableMessage) {
			// This creates a UI display without adding to conversation log
			this._onFunctionCallDisplayMessage.fire({
				id: functionCallMessageId,
				content: humanReadableMessage,
				timestamp: new Date().toISOString()
			});
		}

			// For streaming functions, skip immediate processing - they're handled after streaming completes
			if (!this.isStreamingFunction(functionCall.name)) {
				// This calls R with "process_function_call" and returns status to orchestrator
				const functionResult = await this.processIndividualFunctionCall(functionCall, relatedToId, requestId, functionCallMessageId);
				
				// CRITICAL: Return status to caller instead of calling orchestrator here
				// The caller should handle passing status to orchestrator at the right level
				this.logService.info(`[FUNCTION RESULT] Function ${functionCall.name} returned status: ${functionResult.status}`);
				return functionResult;
			} else {
				this.logService.info('Skipping immediate processing for streaming function - will be processed after streaming completes:', functionCall.name);
				return null;
			}

		} catch (error) {
			this.logService.error('Failed to process function call with orchestration:', error);
			return {
				status: 'error',
				data: {
					error: error instanceof Error ? error.message : String(error)
				}
			};
		}
	}

	/**
	 */
	private generateFunctionCallDisplayMessage(functionCall: any): string {
		const functionName = functionCall.name;
		let args: any = {};
		
		try {
			args = typeof functionCall.arguments === 'string' 
				? JSON.parse(functionCall.arguments) 
				: functionCall.arguments;
		} catch (e) {
			// If parsing fails, use empty args
		}

		switch (functionName) {
			case 'read_file':
				const filename = args.filename ? CommonUtils.getBasename(args.filename) : 'unknown';
				let lineInfo = '';
				if (args.should_read_entire_file) {
					lineInfo = ' (1-end)';
				} else if (args.start_line_one_indexed && args.end_line_one_indexed_inclusive) {
					lineInfo = ` (${args.start_line_one_indexed}-${args.end_line_one_indexed_inclusive})`;
				}
				return `Read ${filename}${lineInfo}`;

			case 'list_dir':
				const path = args.relative_workspace_path || '.';
				const displayPath = path === '.' ? 'current directory' : path;
				return `Listed content of ${displayPath}`;

			case 'grep_search':
				const pattern = args.query || 'unknown';
				const displayPattern = pattern.length > 50 ? pattern.substring(0, 50) + '...' : pattern;
				return `Searched pattern "${displayPattern}"`;





			default:
				return functionName.replace(/_/g, ' ');
		}
	}

	/**
	 * Calls R with operation_type: "process_function_call" and handles returned status
	 */
	private async processIndividualFunctionCall(functionCall: any, relatedToId: number, requestId: string, messageId: number): Promise<{status: string, data?: any}> {
		try {
			// Check if this is a widget function that should bypass the function handler
			const isWidgetFunction = (name: string) => {
				return ['run_console_cmd', 'run_terminal_cmd', 'search_replace', 'delete_file', 'run_file'].includes(name);
			};

			if (isWidgetFunction(functionCall.name)) {
				// Widget functions should create widgets immediately without going through function handler
				this.logService.info(`[WIDGET FUNCTION] Creating widget for ${functionCall.name} without function handler`);
				
				// Extract arguments for widget creation
				const args = JSON.parse(functionCall.arguments || '{}');
				
				// Get initial content for run_file widgets
				let widgetInitialContent = '';
				if (functionCall.name === 'run_file') {
					// Extract the file content for display in the widget
					widgetInitialContent = await this.extractFileContentForWidget(
						args.filename, 
						args.start_line_one_indexed, 
						args.end_line_one_indexed_inclusive
					);
				}

				// Check if terminal command should auto-run
				let shouldAutoAccept = false;
				if (functionCall.name === 'run_terminal_cmd') {
					try {
						const terminalCommand = args.command || '';
						const autoRunResult = this.terminalAutoRunner.shouldAutoRunTerminalCommand(terminalCommand);
						shouldAutoAccept = autoRunResult.shouldAutoRun;
						
						if (shouldAutoAccept) {
							this.logService.info(`Terminal auto-run approved during individual processing: ${autoRunResult.reason}`);
						} else {
							this.logService.info(`Terminal auto-run denied during individual processing: ${autoRunResult.reason}`);
						}
					} catch (error) {
						this.logService.error('Failed to check terminal auto-run during individual processing:', error);
						shouldAutoAccept = false;
					}
				}

				const widgetInfo = {
					messageId,
					requestId,
					functionCallType: functionCall.name as 'search_replace' | 'run_console_cmd' | 'run_terminal_cmd' | 'delete_file' | 'run_file',
					initialContent: widgetInitialContent,
					filename: args.filename || args.file_path || undefined,
					autoAccept: shouldAutoAccept,
					handlers: {
						onAccept: async (msgId: number, content: string) => {
							if (functionCall.name === 'search_replace') {
								await this._orchestrator.acceptSearchReplaceCommand(msgId, content, requestId);
							} else if (functionCall.name === 'run_console_cmd') {
								await this._orchestrator.acceptConsoleCommand(msgId, content, requestId);
							} else if (functionCall.name === 'run_terminal_cmd') {
								await this._orchestrator.acceptTerminalCommand(msgId, content, requestId);
							} else if (functionCall.name === 'delete_file') {
								await this._orchestrator.acceptDeleteFileCommand(msgId, content, requestId);
							} else if (functionCall.name === 'run_file') {
								await this._orchestrator.acceptFileCommand(msgId, content, requestId);
							}
						},
						onCancel: async (msgId: number) => {
							if (functionCall.name === 'search_replace') {
								await this._orchestrator.cancelSearchReplaceCommand(msgId, requestId);
							} else if (functionCall.name === 'run_console_cmd') {
								await this._orchestrator.cancelConsoleCommand(msgId, requestId);
							} else if (functionCall.name === 'run_terminal_cmd') {
								await this._orchestrator.cancelTerminalCommand(msgId, requestId);
							} else if (functionCall.name === 'delete_file') {
								await this._orchestrator.cancelDeleteFileCommand(msgId, requestId);
							} else if (functionCall.name === 'run_file') {
								await this._orchestrator.cancelFileCommand(msgId, requestId);
							}
						},
						onAllowList: async (msgId: number, content: string) => {
							// Allow list functionality if needed
						}
					}
				};
				

				this._onWidgetRequested.fire(widgetInfo);
				
				// CRITICAL: Fire the actual function call message to trigger React re-render
				const conversation = this.conversationManager.getCurrentConversation();
				if (conversation) {
					const actualMessage = conversation.messages.find(m => m.id === messageId);
					if (actualMessage) {
						this._onMessageAdded.fire(actualMessage);
					}
				}
				
				return {
					status: 'pending',
					data: {
						message: `Function ${functionCall.name} waiting for user confirmation`,
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			}

			// For non-widget functions, use the original function handler path
			const conversationManagerInterface = {
				getPreallocatedMessageId: (callId: string, index: number) => this.getPreallocatedMessageId(callId, index),
				getNextMessageId: () => this.getNextMessageId()
			};

			const callContext = this.infrastructureRegistry.createCallContext(
				relatedToId,
				requestId,
				conversationManagerInterface
			);
			
			// CRITICAL: Add function call message ID to context for related_to field
			callContext.functionCallMessageId = messageId;

					// CRITICAL: Ensure function call has correct msg_id before processing
		const normalizedFunctionCall = {
			...functionCall,
			msg_id: messageId // Set to function call message ID
		};

		const result = await this.functionCallOrchestrator.processSingleFunctionCall(
			normalizedFunctionCall,
			relatedToId,
			requestId,
			undefined, // response_id
			messageId,
			callContext
		);

		if (result.type === 'success' && result.function_call_output) {
			// Add the function_call_output to conversation (this creates the "Response pending..." message)
			await this.conversationManager.addFunctionCallOutput(result.function_call_output);


			this.logService.info('Function call completed - returning status to orchestrator');
			
			// CRITICAL: Return status based on function type (like Rao does)
			if (this.isSimpleFunction(normalizedFunctionCall.name)) {
				// Simple functions return "continue_and_display" status to trigger next API call
				this.logService.info(`[SIMPLE FUNCTION] Returning continue_and_display status for ${normalizedFunctionCall.name}`);
				return {
					status: 'continue_and_display',
					data: {
						message: `Function ${normalizedFunctionCall.name} completed successfully`,
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			} else if (result.breakout_of_function_calls) {
				// Interactive functions that need user confirmation return "pending" status
				this.logService.info(`[INTERACTIVE FUNCTION] Returning pending status for ${normalizedFunctionCall.name}`);
				
				// CRITICAL: Create widget for interactive functions that need user confirmation
				if (normalizedFunctionCall.name === 'delete_file' || normalizedFunctionCall.name === 'search_replace' || 
					normalizedFunctionCall.name === 'run_console_cmd' || normalizedFunctionCall.name === 'run_terminal_cmd' ||
					normalizedFunctionCall.name === 'run_file') {
					
					// Extract arguments for widget creation
					const args = JSON.parse(normalizedFunctionCall.arguments || '{}');
					
					// Check if auto-accept is enabled for search_replace and delete_file
					let shouldAutoAccept = false;
					if (normalizedFunctionCall.name === 'search_replace') {
						try {
							shouldAutoAccept = await this.getAutoAcceptEdits();
						} catch (error) {
							this.logService.error('Failed to check auto-accept edits setting:', error);
							shouldAutoAccept = false;
						}
					} else if (normalizedFunctionCall.name === 'delete_file') {
						try {
							shouldAutoAccept = await this.getAutoDeleteFiles();
						} catch (error) {
							this.logService.error('Failed to check auto-delete files setting:', error);
							shouldAutoAccept = false;
						}
					} else if (normalizedFunctionCall.name === 'run_terminal_cmd') {
						try {
							// Use terminal auto-runner to check if command should auto-run
							const terminalCommand = args.command || '';
							const autoRunResult = this.terminalAutoRunner.shouldAutoRunTerminalCommand(terminalCommand);
							shouldAutoAccept = autoRunResult.shouldAutoRun;
							
							if (shouldAutoAccept) {
								this.logService.info(`Terminal auto-run approved: ${autoRunResult.reason}`);
							} else {
								this.logService.info(`Terminal auto-run denied: ${autoRunResult.reason}`);
							}
						} catch (error) {
							this.logService.error('Failed to check terminal auto-run:', error);
							shouldAutoAccept = false;
						}
					}
					
					this.logService.info(`[WIDGET CREATION] Creating widget for ${normalizedFunctionCall.name}`);
					
					// Get initial content for run_file widgets
					let widgetInitialContent = '';
					if (normalizedFunctionCall.name === 'run_file') {
						// Extract the file content for display in the widget
						widgetInitialContent = await this.extractFileContentForWidget(
							args.filename, 
							args.start_line_one_indexed, 
							args.end_line_one_indexed_inclusive
						);
					}

					const widgetInfo = {
						messageId,
						requestId,
						functionCallType: normalizedFunctionCall.name as 'search_replace' | 'run_console_cmd' | 'run_terminal_cmd' | 'delete_file' | 'run_file',
						initialContent: widgetInitialContent,
						filename: args.filename || args.file_path || undefined,
						autoAccept: shouldAutoAccept, // Pass auto-accept flag to widget
						handlers: {
							onAccept: async (msgId: number, content: string) => {
								if (normalizedFunctionCall.name === 'search_replace') {
									await this._orchestrator.acceptSearchReplaceCommand(msgId, content, requestId);
								} else if (normalizedFunctionCall.name === 'run_console_cmd') {
									await this._orchestrator.acceptConsoleCommand(msgId, content, requestId);
								} else if (normalizedFunctionCall.name === 'run_terminal_cmd') {
									await this._orchestrator.acceptTerminalCommand(msgId, content, requestId);
								} else if (normalizedFunctionCall.name === 'delete_file') {
									await this._orchestrator.acceptDeleteFileCommand(msgId, content, requestId);
								} else if (normalizedFunctionCall.name === 'run_file') {
									await this._orchestrator.acceptFileCommand(msgId, content, requestId);
								}
							},
							onCancel: async (msgId: number) => {
								if (normalizedFunctionCall.name === 'search_replace') {
									await this._orchestrator.cancelSearchReplaceCommand(msgId, requestId);
								} else if (normalizedFunctionCall.name === 'run_console_cmd') {
									await this._orchestrator.cancelConsoleCommand(msgId, requestId);
								} else if (normalizedFunctionCall.name === 'run_terminal_cmd') {
									await this._orchestrator.cancelTerminalCommand(msgId, requestId);
								} else if (normalizedFunctionCall.name === 'delete_file') {
									await this._orchestrator.cancelDeleteFileCommand(msgId, requestId);
								} else if (normalizedFunctionCall.name === 'run_file') {
									await this._orchestrator.cancelFileCommand(msgId, requestId);
								}
							},
							onAllowList: async (msgId: number, content: string) => {
								// Allow list functionality if needed
							}
						}
					};
					

					this._onWidgetRequested.fire(widgetInfo);
					
					// CRITICAL: Fire the actual function call message to trigger React re-render
					const conversation = this.conversationManager.getCurrentConversation();
					if (conversation) {
						const actualMessage = conversation.messages.find(m => m.id === messageId);
						if (actualMessage) {
							this._onMessageAdded.fire(actualMessage);
						}
					}
				}
				
				return {
					status: 'pending',
					data: {
						message: `Function ${normalizedFunctionCall.name} waiting for user confirmation`,
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			} else {
				// Check if this is a failed function by looking at the output
				const output = result.function_call_output?.output || '';
				const isFailed = this.isFunctionOutputFailure(normalizedFunctionCall.name, output);
				
				if (isFailed) {
					// Failed functions should continue so AI knows about the failure
					this.logService.info(`[FAILED FUNCTION] Returning continue_and_display status for failed ${normalizedFunctionCall.name}`);
					return {
						status: 'continue_and_display',
						data: {
							message: `Function ${normalizedFunctionCall.name} failed - continuing conversation`,
							related_to_id: relatedToId,
							request_id: requestId
						}
					};
				} else {
					// Other functions return done status
					return {
						status: 'done',
						data: {
							message: `Function ${normalizedFunctionCall.name} completed successfully`,
							related_to_id: relatedToId,
							request_id: requestId
						}
					};
				}
			}
		}
			// Widget functionality removed - breakout results no longer supported
			else if (result.type === 'error') {
				this.logService.error('Function call failed:', result.error_message);
				return {
					status: 'error',
					data: {
						error: result.error_message,
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			}

		} catch (error) {
			this.logService.error('Failed to process individual function call:', error);
			return {
				status: 'error',
				data: {
					error: error instanceof Error ? error.message : String(error),
					related_to_id: relatedToId,
					request_id: requestId
				}
			};
		}
		
		// Fallback return
		return {
			status: 'done',
			data: {
				message: 'Function call processing completed',
				related_to_id: relatedToId,
				request_id: requestId
			}
		};
	}



	/**
	 * Process all buffered function calls after streaming completion
	 */
	private async processBufferedFunctionCallsAfterStreaming(): Promise<void> {
		try {
			
			// Check if there are buffered function calls in our internal buffer
			if (this.functionCallBuffer.length === 0) {
				return;
			}


			// Note: Using individual function call orchestration instead of batch processing

			for (const bufferedCall of this.functionCallBuffer) {
				
				const functionResult = await this.processSingleFunctionCallWithOrchestration(
					bufferedCall.function_call, 
					bufferedCall.request_id,
					bufferedCall.message_id
				);
				
				// CRITICAL: Pass returned status to orchestrator at the right level (like Rao does)
				if (functionResult && functionResult.status) {
					this.logService.info(`[BUFFERED FUNCTION RESULT] Function ${bufferedCall.function_call.name} returned status: ${functionResult.status}`);
					this._orchestrator.handleFunctionCompletion(functionResult.status, functionResult.data);
				}
				
			}
			
			// Clear the buffer after processing
			this.functionCallBuffer = [];


		} catch (error) {
			this.logService.error('Failed to process buffered function calls:', error);
		}
	}

	// Widget breakout functionality has been removed

	// Widget utility methods have been removed

	/**
	 */
	private async replacePendingFunctionCallOutput(callId: string, actualOutput: string, success?: boolean): Promise<void> {
		try {
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				throw new Error('No active conversation');
			}

			const pendingEntries = conversation.messages.filter(entry => 
				entry.type === 'function_call_output' && 
				entry.call_id === callId &&
				entry.output === "Response pending..."
			);

			if (pendingEntries.length !== 1) {
				throw new Error(`Expected exactly 1 pending message for call_id ${callId}, found ${pendingEntries.length}`);
			}

		const pendingEntry = pendingEntries[0];
		pendingEntry.output = actualOutput;
		
		// Set success field if provided (like Rao does)
		if (success !== undefined) {
			(pendingEntry as any).success = success;
		}

		await this.conversationManager.saveConversationLog(conversation);
			
			this.logService.info('Replaced pending function call output:', callId);
			
		} catch (error) {
			this.logService.error('Failed to replace pending function call output:', error);
			throw error; // Re-throw to ensure system errors out as required
		}
	}




	/**
	 * Add message to conversation (for function handlers)
	 */
	addMessageToConversation(message: any): void {
		try {
			// Add message using the conversation manager
			if (message.type === 'function_call_output') {
				this.conversationManager.addFunctionCallOutput(message);
			} else {
				// Use the general addMessage method - need conversation ID
				const currentConversation = this.conversationManager.getCurrentConversation();
				if (currentConversation) {
					this.conversationManager.addMessage(
						currentConversation.info.id,
						message.role || 'user',
						message.content || '',
						{
							related_to: message.related_to,
							procedural: message.procedural
						}
					);
				}
			}

		} catch (error) {
			this.logService.error('Failed to add message to conversation:', error);
		}
	}
	/**
	 * Accept console command - returns status to orchestrator like Rao's pattern
	 */
	async acceptConsoleCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}> {
		try {
			
			// Hide buttons in the widget
			this._onWidgetButtonAction.fire({ messageId, action: 'hide' });
			
			// Get the actual call_id from the function call message
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (!currentConversation) {
				throw new Error('No active conversation');
			}
			
			
			const functionCallMessage = currentConversation.messages.find(m => m.id === messageId);
			
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			const callId = functionCallMessage.function_call.call_id;
			
			// Extract language parameter from function arguments for Erdos AI
			let language = 'r'; // Default to R for backward compatibility
			let actualCommand = command; // Default to widget command as fallback
			
			if (functionCallMessage.function_call.arguments) {
				try {
					const args = JSON.parse(functionCallMessage.function_call.arguments);
					if (args.language) {
						language = args.language.toLowerCase();
						// Validate language parameter
						if (language !== 'r' && language !== 'python') {
							throw new Error(`Invalid language parameter: ${language}. Must be 'r' or 'python'.`);
						}
					}
					
					// Debug: Log both the widget command and the args command to see if there's a difference
					this.logService.info(`[COMMAND DEBUG] Widget command: ${command}`);
					this.logService.info(`[COMMAND DEBUG] Args command: ${args.command}`);
					
					// Use the args.command as it has the correct unescaped syntax
					// The widget command has escaped quotes from the JSON serialization
					if (args.command) {
						actualCommand = args.command;
						this.logService.info(`[COMMAND DEBUG] Using args.command: ${actualCommand}`);
					} else {
						this.logService.warn(`[COMMAND DEBUG] No args.command found, using widget command: ${command}`);
					}
					
				} catch (error) {
					if (error instanceof Error && error.message.includes('Invalid language parameter')) {
						throw error; // Re-throw validation errors
					}
					// If JSON parsing fails, continue with default 'r'
					this.logService.warn('Failed to parse function call arguments, defaulting to R console:', error);
				}
			}
			
			// Clean command by removing backticks - exactly like RAO (SessionAiSearch.R lines 2473-2476)
			const cleanedCommand = this.cleanConsoleCommand(actualCommand);
			
			
			// Execute console command using Erdos's pattern and capture output
			try {
				const consoleOutput = await this.executeConsoleCommandWithOutputCapture(cleanedCommand, callId, language);
				
				// Update the pending message with actual output - returns status
				const statusResult = await this.updateConversationWithConsoleOutput(messageId, callId, cleanedCommand, consoleOutput);
				
				// Return the status from updateConversationWithConsoleOutput
				return statusResult;
				
			} catch (executionError) {
				
				// Update with error message and return error status
				const errorOutput = `Error executing command: ${executionError instanceof Error ? executionError.message : 'Unknown error'}`;
				await this.updateConversationWithConsoleOutput(messageId, callId, cleanedCommand, errorOutput);
				
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
			
			// Return error status to orchestrator
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

	/**
	 * Accept file command (run_file) - following exact same pattern as acceptConsoleCommand
	 * Processes the file and executes its content in the appropriate console (R or Python) based on file extension
	 */
	async acceptFileCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}> {
		this.logService.info(`[ACCEPT FILE] Starting acceptFileCommand for messageId: ${messageId}, requestId: ${requestId}`);
		
		try {
			// Hide buttons in the widget (same as console command)
			this._onWidgetButtonAction.fire({ messageId, action: 'hide' });
			
			// Get the actual call_id from the function call message (same pattern as console command)
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (!currentConversation) {
				throw new Error('No active conversation');
			}
			
			const functionCallMessage = currentConversation.messages.find(m => m.id === messageId);
			
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			const callId = functionCallMessage.function_call.call_id;
			
			// Extract language parameter and filename based on file extension
			let language = 'r'; // Default to R for backward compatibility
			let filename: string | undefined;
			if (functionCallMessage.function_call.arguments) {
				try {
					const args = JSON.parse(functionCallMessage.function_call.arguments);
					filename = args.filename;
					
					if (filename) {
						const fileExt = CommonUtils.getFileExtension(filename).toLowerCase();
						
						// Determine language based on file extension (CommonUtils returns extension without dot)
						if (fileExt === 'py' || fileExt === 'ipynb') {
							language = 'python';
						} else if (fileExt === 'r' || fileExt === 'rmd' || fileExt === 'qmd') {
							language = 'r';
						}
						// Default remains 'r' for unknown extensions
						
						this.logService.info(`[RUN FILE] File extension: ${fileExt}, detected language: ${language}`);
					}
				} catch (error) {
					this.logService.warn('Failed to parse function arguments for language detection, defaulting to R:', error);
					language = 'r';
				}
			}
			
			// Process the file to get executable command - following RAO's handle_run_file logic
			const executableCommand = await this.processFileForExecution(functionCallMessage.function_call, callId);
			
			if (executableCommand.startsWith('Error:')) {
				// Update with error message and return error status
				await this.updateConversationWithConsoleOutput(messageId, callId, command, executableCommand);
				
				return {
					status: 'error',
					data: {
						error: executableCommand,
						related_to_id: functionCallMessage.related_to || messageId,
						request_id: requestId
					}
				};
			}
			
			// Execute the processed command using same pattern as console command
			try {
				let consoleOutput: string;
				
						// Check if this is a notebook file - if so, execute cells individually
		if (language === 'python' && filename && this.isJupyterNotebook(filename)) {
			consoleOutput = await this.executeNotebookFile(filename, callId, executableCommand);
		} else {
			consoleOutput = await this.executeConsoleCommandWithOutputCapture(executableCommand, callId, language);
		}
				
				// Update the pending message with actual output - returns status
				const statusResult = await this.updateConversationWithConsoleOutput(messageId, callId, executableCommand, consoleOutput);
				
				// Return the status from updateConversationWithConsoleOutput
				return statusResult;
				
			} catch (executionError) {
				// Update with error message and return error status
				const errorOutput = `Error executing file: ${executionError instanceof Error ? executionError.message : 'Unknown error'}`;
				await this.updateConversationWithConsoleOutput(messageId, callId, executableCommand, errorOutput);
				
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
			this.logService.error('Failed to accept file command:', error);
			
			// Return error status to orchestrator
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

	/**
	 * Cancel file command - returns status to orchestrator
	 */
	async cancelFileCommand(messageId: number, requestId: string): Promise<{status: string, data: any}> {
		this.logService.info(`[CANCEL FILE] Starting cancelFileCommand for messageId: ${messageId}, requestId: ${requestId}`);
		
		try {
			// Same pattern as cancelConsoleCommand
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				throw new Error('No active conversation');
			}
			const callId = generateUuid();
			
			// Update with cancellation message
			await this.updateConversationWithConsoleOutput(
				messageId, 
				callId, 
				'# File execution cancelled by user', 
				'File execution was cancelled'
			);
			
			// Return done status to orchestrator (like Rao's cancel operations)
			return {
				status: 'done',
				data: {
					related_to_id: messageId,
					request_id: requestId
				}
			};
			
		} catch (error) {
			this.logService.error('Failed to cancel file command:', error);
			
			// Return error status to orchestrator  
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

	/**
	 * Cancel console command - returns status to orchestrator
	 */
	async cancelConsoleCommand(messageId: number, requestId: string): Promise<{status: string, data: any}> {
		try {
			this.logService.info(`Cancelling console command for message ${messageId}`);
			
			// Hide buttons in the widget
			this._onWidgetButtonAction.fire({ messageId, action: 'hide' });
			
			// Get the actual call_id from the function call message
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (!currentConversation) {
				throw new Error('No active conversation');
			}
			
			const functionCallMessage = currentConversation.messages.find(m => m.id === messageId);
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			const callId = functionCallMessage.function_call.call_id;
			
			// Add function call output to mark cancellation
			const outputMessage = {
				id: this.getNextMessageId(),
				type: 'function_call_output',
				call_id: callId,
				output: 'Console command cancelled',
				related_to: messageId,
				procedural: true
			};
			
			await this.conversationManager.addFunctionCallOutput(outputMessage);
			
			// Fire event to update UI
			this._onMessageAdded.fire({
				id: outputMessage.id,
				type: 'function_call_output',
				content: outputMessage.output,
				timestamp: new Date().toISOString(),
				related_to: messageId
			});
			
			// CRITICAL: Check for newer messages like Rao does (same logic as accept)
			// If newer messages exist, don't continue; if no newer messages, continue
			const hasNewerMessages = this.hasNewerMessages(currentConversation, messageId, callId);
			const relatedToId = functionCallMessage.related_to || messageId;
			
			if (hasNewerMessages) {
				// Conversation has moved on - don't continue
				return {
					status: 'done',
					data: {
						message: 'Console command cancelled - conversation has moved on, not continuing API',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			} else {
				// No newer messages - continue the conversation
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

	/**
	 * Check if there are newer messages after a given function call (like Rao does)
	 * Used to determine whether to continue conversation after accept/cancel
	 */
	private hasNewerMessages(conversation: any, functionCallMessageId: number, callId: string): boolean {
		this.logService.info(`[HAS NEWER MESSAGES] Checking for messages newer than ${functionCallMessageId} with callId ${callId}`);
		
		const newerMessages = conversation.messages.filter((entry: any) => {
			if (!entry.id || entry.id <= functionCallMessageId) {
				return false;
			}
			
			// Exclude the function_call_output for this specific function call
			if (entry.type === 'function_call_output' && entry.call_id === callId) {
				this.logService.info(`[HAS NEWER MESSAGES] Excluding function_call_output with matching callId: ${entry.id}`);
				return false;
			}
			
			// Exclude images related to this function call (role = "user", related_to = function_call_message_id)
			if (entry.role === 'user' && entry.related_to === functionCallMessageId) {
				this.logService.info(`[HAS NEWER MESSAGES] Excluding related user message: ${entry.id}`);
				return false;
			}
			
			// If we get here, this is a legitimate newer message
			this.logService.info(`[HAS NEWER MESSAGES] Found newer message: ${entry.id}, type: ${entry.type}`);
			return true;
		});
		
		const hasNewer = newerMessages.length > 0;
		this.logService.info(`[HAS NEWER MESSAGES] Result: ${hasNewer}, found ${newerMessages.length} newer messages`);
		return hasNewer;
	}

	/**
	 * Clean console command by removing markdown backticks - exactly like RAO's handle_run_console_cmd
	 */
	private cleanConsoleCommand(command: string): string {
		// Apply same trimming logic as RAO's handle_run_console_cmd, extended for Python
		let trimmedCommand = command;
		
		// Remove triple backticks with r or python language specifiers
		trimmedCommand = trimmedCommand.replace(/^```(?:r|python|py)?\s*\n?/g, '');
		
		// Remove closing backticks
		trimmedCommand = trimmedCommand.replace(/\n?```\s*$/g, '');
		
		// Clean up any remaining backtick lines
		trimmedCommand = trimmedCommand.replace(/```\n/g, '');
		
		return trimmedCommand.trim();
	}

	/**
	 * Accept search replace command - mirrors RAO's accept_search_replace_command exactly
	 */
	async acceptSearchReplaceCommand(messageId: number, content: string, requestId: string): Promise<{status: string, data: any}> {
		try {
			this.logService.info(`Accepting search replace command for message ${messageId}`);
			
			// Hide buttons in the widget
			this._onWidgetButtonAction.fire({ messageId, action: 'hide' });
			
			// Get the search_replace function call to extract arguments
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				throw new Error('No active conversation');
			}
			
			const functionCallMessage = conversation.messages.find(m => m.id === messageId);
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			// Verify this is actually a search_replace function call
			if (functionCallMessage.function_call.name !== 'search_replace') {
				throw new Error(`Expected search_replace function call, but got ${functionCallMessage.function_call.name}`);
			}
			
			// Extract arguments from search_replace function call
			const args = JSON.parse(functionCallMessage.function_call.arguments || '{}');
			const filePath = args.file_path;
			const oldString = args.old_string;
			const newString = args.new_string;
			
			// Note: oldString can be empty string for file creation, so check for null/undefined only
			if (!filePath || oldString === null || oldString === undefined || newString === null || newString === undefined) {
				throw new Error('Missing required arguments: file_path, old_string, or new_string');
			}
			
			// Remove line numbers from old_string and new_string (like RAO does)
			const cleanOldString = this.removeLineNumbers(oldString);
			const cleanNewString = this.removeLineNumbers(newString);
			
			const callId = functionCallMessage.function_call.call_id;
			
			// Apply the search replace operation using identical logic to RAO
			await this.applySearchReplaceOperation(messageId, callId, filePath, cleanOldString, cleanNewString, requestId);
			
			// Update the function_call_output message to show completion (like Rao's acceptance pattern)
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation) {
				const targetMessage = currentConversation.messages.find(entry => 
					entry.type === 'function_call_output' && 
					entry.call_id === functionCallMessage.function_call?.call_id &&
					entry.output === "Response pending..."
				);

				if (targetMessage) {
					targetMessage.output = "Search and replace completed successfully.";
					targetMessage.timestamp = new Date().toISOString();
					await this.conversationManager.saveConversationLog(currentConversation);
				}
			}
			
			// Save to workspace script history for persistence across sessions
			await this.saveToWorkspaceHistory(filePath);
			
			// Check if conversation has moved on (like console commands do)
			const relatedToId = functionCallMessage.related_to || messageId;
			const hasNewerMessages = this.hasNewerMessages(currentConversation, messageId, functionCallMessage.function_call.call_id);
			
			if (hasNewerMessages) {
				// Conversation has moved on - don't continue
				return {
					status: 'done',
					data: {
						message: 'Search replace command accepted - conversation has moved on, not continuing API',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			} else {
				// No newer messages - continue the conversation
				return {
					status: 'continue_silent',
					data: {
						message: 'Search replace command accepted - returning control to orchestrator',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			}
			
		} catch (error) {
			this.logService.error('Failed to accept search replace command:', error);
			
			// Return error status to orchestrator
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

	/**
	 * Cancel search replace command
	 */
	async cancelSearchReplaceCommand(messageId: number, requestId: string): Promise<{status: string, data: any}> {
		try {
			this.logService.info(`Cancelling search replace command for message ${messageId}`);
			
			// Hide buttons in the widget
			this._onWidgetButtonAction.fire({ messageId, action: 'hide' });
			
			// Get the search_replace function call
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				throw new Error('No active conversation');
			}
			
			const functionCallMessage = conversation.messages.find(m => m.id === messageId);
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			// Update the function_call_output message to show cancellation (like Rao's cancellation pattern)
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation) {
				const targetMessage = currentConversation.messages.find(entry => 
					entry.type === 'function_call_output' && 
					entry.call_id === functionCallMessage.function_call?.call_id &&
					entry.output === "Response pending..."
				);

				if (targetMessage) {
					targetMessage.output = "Search and replace cancelled.";
					targetMessage.timestamp = new Date().toISOString();
					await this.conversationManager.saveConversationLog(currentConversation);
				}
			}
			
			// Check if conversation has moved on (like console commands do)
			const relatedToId = functionCallMessage.related_to || messageId;
			const hasNewerMessages = this.hasNewerMessages(currentConversation, messageId, functionCallMessage.function_call.call_id);
			
			if (hasNewerMessages) {
				// Conversation has moved on - don't continue
				return {
					status: 'done',
					data: {
						message: 'Search replace command cancelled - conversation has moved on, not continuing API',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			} else {
				// No newer messages - continue the conversation
				return {
					status: 'continue_silent',
					data: {
						message: 'Search replace command cancelled - returning control to orchestrator',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			}
			
		} catch (error) {
			this.logService.error('Failed to cancel search replace command:', error);
			
			// Return error status to orchestrator
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

	/**
	 * Accept delete file command - mirrors Rao's accept_delete_file_command pattern
	 */
	async acceptDeleteFileCommand(messageId: number, content: string, requestId: string): Promise<{status: string, data: any}> {
		try {
			this.logService.info(`Accepting delete file command for message ${messageId}`);
			
			// Hide buttons in the widget
			this._onWidgetButtonAction.fire({ messageId, action: 'hide' });
			
			// Get the delete_file function call to extract arguments
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				throw new Error('No active conversation');
			}
			
			const functionCallMessage = conversation.messages.find(m => m.id === messageId);
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			// Verify this is actually a delete_file function call
			if (functionCallMessage.function_call.name !== 'delete_file') {
				throw new Error(`Expected delete_file function call, but got ${functionCallMessage.function_call.name}`);
			}
			
			// Extract arguments from delete_file function call
			const args = JSON.parse(functionCallMessage.function_call.arguments || '{}');
			const filename = args.filename;
			
			if (!filename) {
				throw new Error('Missing required argument: filename');
			}
			
			const callId = functionCallMessage.function_call.call_id;
			
			// Perform the file deletion (like Rao's pattern)
			await this.applyDeleteFileOperation(messageId, callId, filename, requestId);
			
			// Update the function_call_output message to show completion (like Rao's acceptance pattern)
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation) {
				const targetMessage = currentConversation.messages.find(entry => 
					entry.type === 'function_call_output' && 
					entry.call_id === functionCallMessage.function_call?.call_id &&
					entry.output === "Response pending..."
				);

				if (targetMessage) {
					targetMessage.output = `File deleted: ${filename}`;
					targetMessage.timestamp = new Date().toISOString();
					await this.conversationManager.saveConversationLog(currentConversation);
				}
			}
			
			// Check if conversation has moved on (like console commands do)
			const relatedToId = functionCallMessage.related_to || messageId;
			const hasNewerMessages = this.hasNewerMessages(currentConversation, messageId, functionCallMessage.function_call.call_id);
			
			if (hasNewerMessages) {
				// Conversation has moved on - don't continue
				return {
					status: 'done',
					data: {
						message: 'Delete file command accepted - conversation has moved on, not continuing API',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			} else {
				// No newer messages - continue the conversation
				return {
					status: 'continue_silent',
					data: {
						message: 'Delete file command accepted - returning control to orchestrator',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			}
			
		} catch (error) {
			this.logService.error('Failed to accept delete file command:', error);
			
			// Return error status to orchestrator
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

	/**
	 * Cancel delete file command
	 */
	async cancelDeleteFileCommand(messageId: number, requestId: string): Promise<{status: string, data: any}> {
		try {
			this.logService.info(`Cancelling delete file command for message ${messageId}`);
			
			// Hide buttons in the widget
			this._onWidgetButtonAction.fire({ messageId, action: 'hide' });
			
			// Get the delete_file function call
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				throw new Error('No active conversation');
			}
			
			const functionCallMessage = conversation.messages.find(m => m.id === messageId);
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			// Update the function_call_output message to show cancellation (like Rao's cancellation pattern)
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation) {
				const targetMessage = currentConversation.messages.find(entry => 
					entry.type === 'function_call_output' && 
					entry.call_id === functionCallMessage.function_call?.call_id &&
					entry.output === "Response pending..."
				);

				if (targetMessage) {
					targetMessage.output = "File deletion cancelled.";
					targetMessage.timestamp = new Date().toISOString();
					await this.conversationManager.saveConversationLog(currentConversation);
				}
			}
			
			// Check if conversation has moved on (like console commands do)
			const relatedToId = functionCallMessage.related_to || messageId;
			const hasNewerMessages = this.hasNewerMessages(currentConversation, messageId, functionCallMessage.function_call.call_id);
			
			if (hasNewerMessages) {
				// Conversation has moved on - don't continue
				return {
					status: 'done',
					data: {
						message: 'Delete file command cancelled - conversation has moved on, not continuing API',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			} else {
				// No newer messages - continue the conversation
				return {
					status: 'continue_silent',
					data: {
						message: 'Delete file command cancelled - returning control to orchestrator',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			}
			
		} catch (error) {
			this.logService.error('Failed to cancel delete file command:', error);
			
			// Return error status to orchestrator
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

	/**
	 * Accept terminal command - returns status to orchestrator instead of making calls
	 * Based on Rao's accept_terminal_command but returns status object
	 */
	async acceptTerminalCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}> {
		try {
			
			// Hide buttons in the widget
			this._onWidgetButtonAction.fire({ messageId, action: 'hide' });
			
			// Clean command exactly like RAO's handle_run_terminal_cmd
			const cleanedCommand = this.cleanTerminalCommand(command);
			
			// Get call_id for this terminal command
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (!currentConversation) {
				throw new Error('No active conversation found');
			}
			
			const functionCallMessage = currentConversation.messages.find(m => m.id === messageId);
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			const callId = functionCallMessage.function_call.call_id;
			

			
			// Execute terminal command using real terminal service and capture output
			
			const terminalOutput = await this.executeTerminalCommandWithOutputCapture(cleanedCommand, callId);
			
			// Update conversation with output
			const statusResult = await this.updateConversationWithTerminalOutput(messageId, callId, cleanedCommand, terminalOutput);
			
			// Return the status from updateConversationWithTerminalOutput
			return statusResult;
			
		} catch (error) {
			
			// Return error status to orchestrator
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

	/**
	 * Cancel terminal command - returns status to orchestrator
	 */
	async cancelTerminalCommand(messageId: number, requestId: string): Promise<{status: string, data: any}> {
		try {
			
			// Hide buttons in the widget
			this._onWidgetButtonAction.fire({ messageId, action: 'hide' });
			
			// Get call_id and update conversation with cancellation message
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (!currentConversation) {
				throw new Error('No active conversation');
			}
			
			const functionCallMessage = currentConversation.messages.find(m => m.id === messageId);
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			const callId = functionCallMessage.function_call.call_id;
			
			// Update with cancellation message
			await this.updateConversationWithTerminalOutput(messageId, callId, 'cancelled', 'Terminal command cancelled by user');
			
			// CRITICAL: Check for newer messages like Rao does (same logic as accept)
			// If newer messages exist, don't continue; if no newer messages, continue
			const hasNewerMessages = this.hasNewerMessages(currentConversation, messageId, callId);
			const relatedToId = functionCallMessage.related_to || messageId;
			
			if (hasNewerMessages) {
				// Conversation has moved on - don't continue
				return {
					status: 'done',
					data: {
						message: 'Terminal command cancelled - conversation has moved on, not continuing API',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			} else {
				// No newer messages - continue the conversation
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

	/**
	 * Clean terminal command by removing markdown backticks - exactly like RAO's handle_run_terminal_cmd
	 */
	private cleanTerminalCommand(command: string): string {
		// Apply same trimming logic as RAO's handle_run_terminal_cmd
		let trimmedCommand = command;
		
		// Remove triple backticks with shell/bash language specifiers - exact match to RAO line 2425
		trimmedCommand = trimmedCommand.replace(/^```(?:shell|bash|sh)?\s*\n?/g, '');
		
		// Remove closing backticks - exact match to RAO line 2426
		trimmedCommand = trimmedCommand.replace(/\n?```\s*$/g, '');
		
		// Clean up any remaining backtick lines - exact match to RAO line 2427
		trimmedCommand = trimmedCommand.replace(/```\n/g, '');
		
		return trimmedCommand.trim();
	}

	/**
	 * Remove line numbers from code strings - exactly like RAO's remove_line_numbers
	 */
	private removeLineNumbers(text: string): string {
		if (!text) {
			return text;
		}
		
		// Split into lines and process each line to remove line numbers
		const lines = text.split('\n');
		const cleanedLines = lines.map(line => {
			// Remove patterns like "  123|", "123:", "123 ", etc. from the beginning of lines
			return line.replace(/^\s*\d+[\|\:\s]\s*/, '');
		});
		
		return cleanedLines.join('\n');
	}

	/**
	 * Create flexible whitespace pattern for search_replace - exactly like RAO's create_flexible_whitespace_pattern
	 */
	private createFlexibleWhitespacePattern(text: string): string {
		if (!text) {
			return '';
		}
		
		// Escape special regex characters first
		let escapedText = text.replace(/[.^$*+?{}[\]|()\\]/g, '\\$&');
		
		// Split into lines
		const lines = escapedText.split('\n');
		
		// For each line, make trailing whitespace optional
		const flexibleLines = lines.map(line => {
			// Remove any existing trailing whitespace and add optional whitespace pattern
			const lineTrimmed = line.replace(/[ \t]*$/, '');
			return lineTrimmed + '[ \\t]*';
		});
		
		// Join lines back with newline pattern
		return flexibleLines.join('\n');
	}

	/**
	 * Apply search replace operation - mirrors RAO's accept_search_replace_command logic
	 */
	private async applySearchReplaceOperation(
		messageId: number, 
		callId: string, 
		filePath: string, 
		oldString: string, 
		newString: string, 
		requestId: string
	): Promise<void> {
		let modificationMade = false;
		let fileWritten = false;
		
		try {
			let currentContent = '';
			let newContent = '';
			let uri: any;
			
			// Handle special case: empty old_string means create/append to file (like Rao)
			let isCreateMode = false;
			let isAppendMode = false;
			
			if (oldString === '') {
				// Check if file exists using effective file content like Rao does (before file resolution)
				const effectiveContent = await this.getEffectiveFileContent(filePath);
				
				if (effectiveContent !== null) {
					// File exists - append mode (mutually exclusive with create mode)
					isAppendMode = true;
					currentContent = effectiveContent;
					if (currentContent.length > 0 && !currentContent.endsWith('\n')) {
						newContent = currentContent + '\n' + newString;
					} else {
						newContent = currentContent + newString;
					}
					
					// Resolve existing file for append mode
					const resolverContext = this.createResolverContext();
					const fileResult = await CommonUtils.resolveFile(filePath, resolverContext);
					if (!fileResult.found || !fileResult.uri) {
						throw new Error(`Could not resolve existing file: ${filePath}`);
					}
					uri = fileResult.uri;
				} else {
					// File doesn't exist - create mode (mutually exclusive with append mode)
					isCreateMode = true;
					currentContent = '';
					newContent = newString;
					
					// For file creation, resolve the path relative to workspace root
					// This follows RAO's pattern where apply_edit_to_disk creates directories and files
					const resolverContext = this.createResolverContext();
					const workspaceRoot = await resolverContext.getCurrentWorkingDirectory();
					const resolvedPath = CommonUtils.resolvePath(filePath, workspaceRoot);
					uri = URI.file(resolvedPath);
				}
			} else {
				// Normal search_replace mode - file must exist
				// Use effective file content like Rao does (handles both saved and unsaved files)
				const effectiveContent = await this.getEffectiveFileContent(filePath);
				
				if (effectiveContent === null) {
					// File doesn't exist - add function call output and return
					const outputMessage = {
						id: this.getNextMessageId(),
						type: 'function_call_output',
						call_id: callId,
						output: `File not found: ${filePath}. Please check the file path or read the current file structure.`,
						related_to: messageId,
						procedural: true
					};
					
					await this.conversationManager.addFunctionCallOutput(outputMessage);
					
					this._onMessageAdded.fire({
						id: outputMessage.id,
						type: 'function_call_output',
						content: outputMessage.output,
						timestamp: new Date().toISOString(),
						related_to: messageId
					});
					
					return;
				} else {
					currentContent = effectiveContent;
					
					// Resolve existing file for normal search_replace mode
					const resolverContext = this.createResolverContext();
					const fileResult = await CommonUtils.resolveFile(filePath, resolverContext);
					if (!fileResult.found || !fileResult.uri) {
						throw new Error(`Could not resolve existing file: ${filePath}`);
					}
					uri = fileResult.uri;
				}
				
				// Apply the flexible whitespace pattern replacement (exactly like RAO)
				const flexiblePattern = this.createFlexibleWhitespacePattern(oldString);
				const regex = new RegExp(flexiblePattern, 'g');
				newContent = currentContent.replace(regex, newString);
			}
			
			// Process content for writing (handles notebook conversion if needed)
			// Get conversation directory for temporary files
						const conversation = this.conversationManager.getCurrentConversation();
			const conversationDir = conversation ? URI.parse(this.conversationManager.getConversationPaths(conversation.info.id).conversationDir).fsPath : undefined;

			// CRITICAL: This will throw an error if Jupytext conversion fails - DO NOT CATCH IT
			const processedContent = await this.documentManager.processContentForWriting(filePath, newContent, conversationDir);
			
			// Write the processed content to the file
			// For file creation, ensure parent directories exist (like RAO's apply_edit_to_disk)
			if (isCreateMode) {
				try {
					// Ensure parent directory exists by creating it if it doesn't exist
					const parentDir = URI.joinPath(uri, '..');
					if (parentDir.path && parentDir.path !== uri.path) {
						await this.fileService.createFolder(parentDir);
					}
				} catch (error) {
				}
			}
			
			await this.fileService.writeFile(uri, VSBuffer.fromString(processedContent));
			fileWritten = true;
			modificationMade = true;
			
			// Record the file change like Rao does
			if (isCreateMode) {
				// New file creation
				await this.recordFileCreation(filePath, newContent, messageId);
			} else {
				// Modification or append (determine if was unsaved based on file state)
				const wasUnsaved = false; // For search_replace, files are typically saved
				await this.recordFileModificationWithDiff(filePath, currentContent, newContent, messageId, wasUnsaved);
			}
						
			// Update function_call_output to show success (using preallocated ID index 2)
			const functionOutputId = this.getPreallocatedMessageId(callId, 2);
			if (!functionOutputId) {
				throw new Error(`Pre-allocated message ID not found for call_id: ${callId} index: 2`);
			}
			
			// Update the function_call_output from "Response pending..." to completion message
			// Using 2-message pattern: function_call + function_call_output (no separate procedural message)
			// Match Rao's logic exactly: check is_create_mode first (when file doesn't exist), then is_append_mode (when file exists)
			const completionMessage = isCreateMode
				? `Successfully created: ${CommonUtils.getBasename(filePath)}`
				: isAppendMode 
					? `Content appended successfully to: ${CommonUtils.getBasename(filePath)}`
					: 'Search and replace completed successfully.';
			
			// Find and update the existing function_call_output with "Response pending..."
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation) {
				const existingOutputMessage = currentConversation.messages.find(m => 
					m.type === 'function_call_output' && 
					m.call_id === callId &&
					m.output === "Response pending..."
				);
				
				if (existingOutputMessage) {
					existingOutputMessage.output = completionMessage;
					existingOutputMessage.timestamp = new Date().toISOString();
					// Preserve success field for search_replace (like Rao does)
					(existingOutputMessage as any).success = true;
					
					// Save the updated conversation to disk
					await this.conversationManager.saveConversationLog(currentConversation);
					
					// Fire event to update UI with the updated message
					this._onMessageAdded.fire({
						id: existingOutputMessage.id,
						type: 'function_call_output',
						content: existingOutputMessage.output,
						timestamp: existingOutputMessage.timestamp,
						related_to: messageId
					});
				}
			}
			
			// Open document in editor (like Rao)
			if (modificationMade && fileWritten) {
				await this.openDocumentInEditor(filePath);
			}
			
		} catch (error) {
			// Update "Response pending..." function_call_output with error (2-message pattern)
			const conversationForError = this.conversationManager.getCurrentConversation();
			if (conversationForError) {
				const existingOutputMessage = conversationForError.messages.find(m => 
					m.type === 'function_call_output' && 
					m.call_id === callId &&
					m.output === "Response pending..."
				);
				
				if (existingOutputMessage) {
					existingOutputMessage.output = `Failed to apply search replace: ${error instanceof Error ? error.message : String(error)}`;
					existingOutputMessage.timestamp = new Date().toISOString();
					(existingOutputMessage as any).success = false;
					
					// Save the updated conversation to disk
					await this.conversationManager.saveConversationLog(conversationForError);
					
					// Fire event to update UI
					this._onMessageAdded.fire({
						id: existingOutputMessage.id,
						type: 'function_call_output',
						content: existingOutputMessage.output,
						timestamp: existingOutputMessage.timestamp,
						related_to: messageId
					});
				}
			}
			
			throw error;
		}
	}






	/**
	 * Get comment syntax for a file - exactly like Rao's get_comment_syntax
	 */
	private getCommentSyntax(filename: string): string {
		return CommonUtils.getCommentSyntax(filename);
	}



	// Removed unused streamJsonFieldContentForSearchReplace - now using unified system

	/**
	 * Extract and process search_replace content exactly like Rao's stream_json_field_content
	 * This mimics Rao's lines 1318-1501 for parsing search_replace JSON deltas
	 */
	private extractAndProcessSearchReplaceContent(accumulatedContent: string, callId: string): { content: string; isComplete: boolean } {
		
		// Step 1: Check if we have file_path to determine filename for comments
		const filenameMatch = accumulatedContent.match(/"file_path"\s*:\s*"([^"]*)"/);
		const filename = filenameMatch ? filenameMatch[1] : '';
		const commentSyntax = this.getCommentSyntax(filename);
		
		// Step 2: Extract old_string content
		let result = '';
		
		// Look for old_string field
		const oldStringStartPattern = /"old_string"\s*:\s*"/;
		const oldStringStartMatch = accumulatedContent.match(oldStringStartPattern);
		
		if (oldStringStartMatch) {
			result += `${commentSyntax}Old content\n`;
			
			// Extract old_string content until "new_string" field
			const oldStringStartPos = oldStringStartMatch.index! + oldStringStartMatch[0].length;
			const newStringPattern = /"\s*,\s*"new_string"/;
			const newStringMatch = accumulatedContent.substring(oldStringStartPos).match(newStringPattern);
			
			if (newStringMatch) {
				// We have complete old_string
				const oldStringEndPos = oldStringStartPos + newStringMatch.index!;
				const rawOldString = accumulatedContent.substring(oldStringStartPos, oldStringEndPos);
				const processedOldString = this.unescapeJsonString(rawOldString);
				const cleanedOldString = this.removeLineNumbers(processedOldString);
				result += cleanedOldString;
				
				// Step 3: Extract new_string content
				result += `\n\n${commentSyntax}New content\n`;
				
				const newStringStartPattern = /"new_string"\s*:\s*"/;
				const newStringStartMatch = accumulatedContent.substring(oldStringEndPos).match(newStringStartPattern);
				
				if (newStringStartMatch) {
					const newStringStartPos = oldStringEndPos + newStringStartMatch.index! + newStringStartMatch[0].length;
					
					// Look for end of new_string field
					const newStringEndPattern = /"\s*}/;
					const newStringEndMatch = accumulatedContent.substring(newStringStartPos).match(newStringEndPattern);
					
					if (newStringEndMatch) {
						// We have complete new_string
						const newStringEndPos = newStringStartPos + newStringEndMatch.index!;
						const rawNewString = accumulatedContent.substring(newStringStartPos, newStringEndPos);
						const processedNewString = this.unescapeJsonString(rawNewString);
						const cleanedNewString = this.removeLineNumbers(processedNewString);
						result += cleanedNewString;
						
						return { content: result, isComplete: true };
					} else {
						// Partial new_string content
						const partialNewString = accumulatedContent.substring(newStringStartPos);
						if (partialNewString.length > 20) { // Buffer like Rao
							const processedPartial = this.unescapeJsonString(partialNewString.substring(0, partialNewString.length - 20));
							const cleanedPartial = this.removeLineNumbers(processedPartial);
							result += cleanedPartial;
						}
					}
				}
			} else {
				// Partial old_string content
				const partialOldString = accumulatedContent.substring(oldStringStartPos);
				if (partialOldString.length > 20) { // Buffer like Rao
					const processedPartial = this.unescapeJsonString(partialOldString.substring(0, partialOldString.length - 20));
					const cleanedPartial = this.removeLineNumbers(processedPartial);
					result += cleanedPartial;
				}
			}
		}
		
		return { content: result, isComplete: false };
	}
	
	/**
	 * Unescape JSON string exactly like Rao's complex escaping logic
	 */
	private unescapeJsonString(str: string): string {
		return str
			// First pass - handle double escapes
			.replace(/\\\\\\\\/g, '<<<BS>>>')     // \\\\ -> <<<BS>>>
			.replace(/\\\\\\\"/g, '<<<DQ>>>')     // \\" -> <<<DQ>>>
			.replace(/\\\\\\t/g, '<<<TAB>>>')     // \\t -> <<<TAB>>>
			.replace(/\\\\\\n/g, '<<<NL>>>')      // \\n -> <<<NL>>>
			// Second pass - handle single escapes
			.replace(/\\\"/g, '<<<DQ>>>')         // \" -> <<<DQ>>>
			.replace(/\\t/g, '<<<TAB>>>')         // \t -> <<<TAB>>>
			.replace(/\\n/g, '<<<NL>>>')          // \n -> <<<NL>>>
			.replace(/\\\\/g, '<<<BS>>>')         // \\ -> <<<BS>>>
			// Third pass - restore actual characters
			.replace(/<<<BS>>>/g, '\\')
			.replace(/<<<DQ>>>/g, '"')
			.replace(/<<<TAB>>>/g, '\t')
			.replace(/<<<NL>>>/g, '\n');
	}



	// All search_replace state is now handled by the unified widget system

	/**
	 * Record file creation - like Rao's record_file_creation
	 */
	private async recordFileCreation(filePath: string, content: string, messageId: number): Promise<void> {

		
		// Set up file changes storage with conversation manager
		fileChangesStorage.setConversationManager(this.conversationManager);
		
		// Record in file_changes.json (like Rao's pattern) - will throw on failure
		await fileChangesStorage.recordFileCreation(filePath, content, messageId);
		
		
		this.logService.info(`File created: ${filePath}`);
	}

	/**
	 * Record file modification with diff - like Rao's record_file_modification_with_diff_with_state
	 */
	private async recordFileModificationWithDiff(filePath: string, oldContent: string, newContent: string, messageId: number, wasUnsaved: boolean = false): Promise<void> {
		// Set up file changes storage with conversation manager
		fileChangesStorage.setConversationManager(this.conversationManager);
		
		// Record in file_changes.json (like Rao's pattern) - will throw on failure
		await fileChangesStorage.recordFileModification(filePath, oldContent, newContent, messageId, wasUnsaved);
		
		// Import diffStorage from diffUtils to store diff data
		const { diffStorage, computeLineDiff, filterDiffForDisplay } = await import('./utils/diffUtils.js');
		
		// Compute diff between old and new content
		const oldLines = oldContent.split('\n');
		const newLines = newContent.split('\n');
		const diffResult = computeLineDiff(oldLines, newLines);
	
		// Filter diff before storage to prevent storing entire files (like Rao's pattern)
		const filteredDiff = filterDiffForDisplay(diffResult.diff);
		
		// Store filtered diff data with a generated key based on file path and timestamp
		const diffKey = `${filePath}_${Date.now()}`;
		diffStorage.storeDiffData(
			diffKey,
			filteredDiff,
			oldContent,
			newContent,
			{ is_start_edit: false, is_end_edit: false },
			filePath
		);

		this.logService.info(`File modified: ${filePath} (+${diffResult.added}/-${diffResult.deleted} lines)`);
	}



	/**
	 * Open document in editor and ensure content is refreshed - like Rao's api.documentOpen
	 */
	private async openDocumentInEditor(filePath: string): Promise<void> {
		try {
			// Use unified file resolution system
			const resolverContext = this.createResolverContext();
			const fileResult = await CommonUtils.resolveFile(filePath, resolverContext);
			if (!fileResult.found || !fileResult.uri) {
				throw new Error(`Could not resolve file: ${filePath}`);
			}

			const uri = fileResult.uri;
			
			// Check if file is already open in editor
			const existingModel = this.modelService.getModel(uri);
			
			if (existingModel) {
				// File is already open - need to refresh content from disk
				try {
					// Read the current content from disk
					const fileContent = await this.fileService.readFile(uri);
					const diskContent = fileContent.value.toString();
					
					// Update the model content if it differs from disk
					const currentContent = existingModel.getValue();
					if (currentContent !== diskContent) {
						// Get the text file model to handle dirty state properly
						const textFileModel = this.textFileService.files.get(uri);
						
						if (textFileModel) {
							// Set the ignore dirty flag to prevent marking as dirty when updating content
							(textFileModel as any).ignoreDirtyOnModelContentChange = true;
							
							// Update the model with the new content from disk
							existingModel.setValue(diskContent);
							
							// Clear the ignore dirty flag
							(textFileModel as any).ignoreDirtyOnModelContentChange = false;
							
							// Since the content matches what's on disk, ensure the file is not marked as dirty
							// The setDirty(false) call will automatically update the saved version ID
							if (textFileModel.isDirty()) {
								(textFileModel as any).setDirty(false);
							}
							
							this.logService.info(`Refreshed content for already open file: ${filePath} (dirty state preserved)`);
						} else {
							// Fallback: just update the model content
							existingModel.setValue(diskContent);
							this.logService.info(`Refreshed content for already open file: ${filePath}`);
						}
					}
				} catch (error) {
					this.logService.error('Failed to refresh file content:', error);
				}
			}
			
			// Open the file in editor (or bring it to focus if already open)
			// Using preserveFocus: false to ensure the file gets focus
			await this.editorService.openEditor({ 
				resource: uri,
				options: {
					preserveFocus: false,
					revealIfVisible: true
				}
			});
			
			this.logService.info(`Opened and focused file in editor: ${filePath}`);
		} catch (error) {
			this.logService.error('Failed to open document in editor:', error);
		}
	}



	/**
	 * Save to workspace-level script history
	 */
	private async saveToWorkspaceHistory(filePath: string): Promise<void> {
		try {
			const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
			if (!workspaceFolder) return;
			
			const historyDir = joinPath(workspaceFolder.uri, '.vscode', 'erdosai');
			const historyFile = joinPath(historyDir, 'script_history.json');
			
			// Ensure directory exists
			try {
				await this.fileService.createFolder(historyDir);
			} catch (error) {
				// Directory might already exist
			}
			
			// Read existing history
			let history: any[] = [];
			try {
				const content = await this.fileService.readFile(historyFile);
				history = JSON.parse(content.value.toString());
			} catch (error) {
				// File might not exist yet
			}
			
			// Add new entry
			const entry = {
				file_path: filePath,
				timestamp: new Date().toISOString(),
				workspace: workspaceFolder.name
			};
			
			history.push(entry);
			
			// Keep only last 100 entries
			if (history.length > 100) {
				history = history.slice(-100);
			}
			
			// Save updated history
			await this.fileService.writeFile(historyFile, VSBuffer.fromString(JSON.stringify(history, null, 2)));
		} catch (error) {
			this.logService.error('Failed to save to workspace history:', error);
		}
	}

	/**
	 * Suggest help topics based on a query string from both R and Python runtimes
	 */
	async suggestTopics(query: string): Promise<Array<{name: string, topic: string, language: 'R' | 'Python'}>> {
		const allTopics: Array<{name: string, topic: string, language: 'R' | 'Python'}> = [];

		// Get R topics - ensure R session is started first
		try {
			await this.ensureRSession();
			const rTopics = await this.commandService.executeCommand<string[]>('r.suggestHelpTopics', query);
			if (Array.isArray(rTopics)) {
				allTopics.push(...rTopics.map(topic => ({
					name: `${topic} (R)`,
					topic,
					language: 'R' as const
				})));
			}
		} catch (error) {
			// R extension might not be available, continue
		}

		// Get Python topics - ensure Python session is started first
		try {
			await this.ensurePythonSession();
			const pythonTopics = await this.commandService.executeCommand<string[]>('python.suggestHelpTopics', query);
			if (Array.isArray(pythonTopics)) {
				allTopics.push(...pythonTopics.map(topic => ({
					name: `${topic} (Python)`,
					topic,
					language: 'Python' as const
				})));
			}
		} catch (error) {
			// Python extension might not be available, continue
		}

		return allTopics;
	}
	/**
	 * Get the image attachment service for the current conversation.
	 * Uses the exact same conversation that sendMessage() uses.
	 */
	getImageAttachmentService(): IImageAttachmentService | null {
		// Use the exact same conversation logic as sendMessage()
		const conversation = this.conversationManager.getCurrentConversation();
		
		if (!conversation) {
			return null;
		}

		const conversationId = conversation.info.id.toString();
		
		// Create service if it doesn't exist for this conversation
		if (!this.imageAttachmentServices.has(conversationId)) {
			const service = new ImageAttachmentService(
				this.fileService,
				this.storageService,
				this.logService,
				conversationId
			);
			this.imageAttachmentServices.set(conversationId, service);
		}
		
		const service = this.imageAttachmentServices.get(conversationId)!;
		return service;
	}

	/**
	 * Apply delete file operation - perform the actual file deletion
	 * Based on Rao's accept_delete_file pattern with file changes tracking
	 */
	private async applyDeleteFileOperation(messageId: number, callId: string, filename: string, requestId: string): Promise<void> {
		try {
			// Resolve the file path
			const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
			if (!workspaceFolder) {
				throw new Error('No workspace folder available for file deletion');
			}
			
			const filePath = joinPath(workspaceFolder.uri, filename);
			
			// Check if file exists
			const exists = await this.fileService.exists(filePath);
			if (!exists) {
				this.logService.warn(`File does not exist: ${filename}`);
				return; // Don't throw error for non-existent files
			}
			
			// Get original content for file changes tracking (like Rao's pattern)
			let originalContent = '';
			try {
				const content = await this.fileService.readFile(filePath);
				originalContent = content.value.toString();
			} catch (error) {
				this.logService.warn(`Could not read file content before deletion: ${filename}`);
				// Continue with deletion even if we can't read content
			}
			
			// Close any open editors for this file before deletion
			await this.closeOpenDocument(filename);
			
			// Delete the file
			await this.fileService.del(filePath);
			
			// Record deletion in file changes log (like Rao's record_file_deletion)
			await this.recordFileDeletion(filename, originalContent, messageId);
			
			this.logService.info(`Successfully deleted file: ${filename}`);
			
		} catch (error) {
			this.logService.error(`Failed to delete file ${filename}:`, error);
			throw error;
		}
	}

	/**
	 * Record file deletion - like Rao's record_file_deletion
	 */
	private async recordFileDeletion(filePath: string, originalContent: string, messageId: number): Promise<void> {
		// Set up file changes storage with conversation manager
		const { fileChangesStorage } = await import('./utils/fileChangesUtils.js');
		fileChangesStorage.setConversationManager(this.conversationManager);
		
		// Record in file_changes.json (like Rao's pattern) - will throw on failure
		await fileChangesStorage.recordFileDeletion(filePath, originalContent, messageId);
		
		this.logService.info(`File deletion recorded: ${filePath}`);
	}

	/**
	 * Close open document - like Rao's request_document_close_for_revert
	 */
	private async closeOpenDocument(filePath: string): Promise<void> {
		try {
			// Resolve file path to URI for editor operations
			const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
			if (!workspaceFolder) {
				return; // No workspace, can't close documents
			}
			
			// Note: Editor closing is handled automatically by the file service when files are deleted
			// No manual editor closing is needed in Erdos

			this.logService.info(`Closed editors for file: ${filePath}`);
		} catch (error) {
			this.logService.error(`Failed to close document for ${filePath}:`, error);
			// Don't throw - file deletion should continue even if closing editors fails
		}
	}

	/**
	 * Revert conversation to a specific user message, removing all messages after it
	 * Similar to rao's revert functionality
	 */
	async revertToMessage(messageId: number): Promise<{status: string, data: any}> {
		try {
			this.logService.info(`Reverting conversation to message ${messageId}`);
			
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				throw new Error('No active conversation');
			}

			// Find the target message
			const targetMessage = conversation.messages.find(m => m.id === messageId);
			if (!targetMessage || targetMessage.role !== 'user') {
				throw new Error(`User message with ID ${messageId} not found`);
			}

			// Find all messages from this message onwards (including the clicked message)
			const messagesToRemove = conversation.messages.filter(m => m.id >= messageId);
			
			if (messagesToRemove.length === 0) {
				this.logService.info('No messages to remove - message not found');
				return { status: 'success', data: { removedCount: 0 } };
			}

			// Update the conversation messages array to remove the clicked message and all after it
			conversation.messages = conversation.messages.filter(m => m.id < messageId);

			// Also remove from the conversation manager's message store
			for (const message of messagesToRemove) {
				// Access the internal message store through the conversation manager
				const messageStore = (this.conversationManager as any).messageStore;
				if (messageStore) {
					messageStore.deleteMessage(message.id);
				}
			}

			// Save the updated conversation to disk
			await this.conversationManager.saveConversationLog(conversation);

			// Revert file changes like rao does
			await this.revertFileChanges(messageId, conversation.info.id);

			// Fire events to update UI
			this._onConversationLoaded.fire(conversation);

			this.logService.info(`Successfully reverted conversation, removed ${messagesToRemove.length} messages`);
			
			return { 
				status: 'success', 
				data: { 
					removedCount: messagesToRemove.length,
					lastMessageId: messageId
				} 
			};
		} catch (error) {
			this.logService.error('Failed to revert conversation:', error);
			return { 
				status: 'error', 
				data: { error: error instanceof Error ? error.message : 'Unknown error' } 
			};
		}
	}

	// ================================================================================================
	// File Change Tracking Methods - Similar to Rao's Implementation
	// ================================================================================================

	/**
	 * Initialize file change tracking for a conversation
	 * Similar to Rao's conversation initialization
	 */
	async initializeFileChangeTracking(conversationId: number): Promise<void> {
		try {
			this.logService.info(`Initializing file change tracking for conversation ${conversationId}`);
			
			// Enable highlighting by default for this conversation
			this.conversationFileHighlighting.set(conversationId, true);
			
			// Set up file change listeners if not already set up
			this.setupFileChangeListeners();
			
			// Apply highlighting to any files that already have changes tracked
			await this.applyExistingFileHighlighting(conversationId);
			
			this.logService.info(`File change tracking initialized for conversation ${conversationId}`);
			
		} catch (error) {
			this.logService.error(`Failed to initialize file change tracking for conversation ${conversationId}:`, error);
		}
	}

	/**
	 * Apply highlighting from existing file_changes.json when conversation loads
	 */
	private async applyExistingFileHighlighting(conversationId: number): Promise<void> {
		try {
			await this.applyHighlightingFromFileChanges(conversationId);
		} catch (error) {
			this.logService.error('Failed to apply existing file highlighting:', error);
		}
	}

	/**
	 * Get the original content of a file from file_changes.json
	 * Similar to Rao's get_original_file_content
	 */
	async getOriginalFileContent(filePath: string, conversationId: number): Promise<string | undefined> {
		try {
			const fileChanges = await this.loadFileChangesForConversation(conversationId);
			if (!fileChanges || !fileChanges.changes) {
				return undefined;
			}

			// Find the most recent change for this file
			const change = fileChanges.changes
				.filter((c: any) => c.file_path === filePath)
				.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

			return change?.previous_content;
		} catch (error) {
			this.logService.error(`Failed to get original file content for ${filePath}:`, error);
			return undefined;
		}
	}

	/**
	 * Compute line-by-line diff between original and current content
	 * Similar to Rao's compute_line_diff using LCS algorithm
	 */
	async computeLineDiff(oldContent: string, newContent: string): Promise<Array<{
		type: 'added' | 'deleted' | 'unchanged';
		content: string;
		oldLine: number;
		newLine: number;
	}>> {
		// Use the existing, proven diff algorithm from diffUtils
		const { computeLineDiff } = await import('./utils/diffUtils.js');
		
		const oldLines = oldContent ? oldContent.split('\n') : [];
		const newLines = newContent ? newContent.split('\n') : [];
		
		const diffResult = computeLineDiff(oldLines, newLines);
		
		// Convert from diffUtils format to our format
		return diffResult.diff.map(item => ({
			type: item.type as 'added' | 'deleted' | 'unchanged',
			content: item.content,
			oldLine: item.old_line || -1,
			newLine: item.new_line || -1
		}));
	}




	/**
	 * Apply gutter-based diff indicators (green bars for added, red arrows for deleted)
	 * No overlapping - clean separation between added and deleted indicators
	 */
	private async applyDiffDecorations(uri: URI, diffEntries: Array<{
		type: 'added' | 'deleted' | 'unchanged';
		content: string;
		oldLine: number;
		newLine: number;
	}>): Promise<void> {
		try {
			// Get the model for this URI
			const model = this.modelService.getModel(uri);
			if (!model) {
				return;
			}

			// Clear existing decorations
			this.clearFileHighlighting(uri);

			// Separate added and deleted lines to avoid overlap
			const addedLines = new Set<number>();
			const deletedLinesByPosition = new Map<number, string[]>();

		// First pass: collect added lines (these exist in current file)
		for (const diffEntry of diffEntries) {
			if (diffEntry.type === 'added' && diffEntry.newLine > 0) {
				addedLines.add(diffEntry.newLine);
			}
		}

			// Second pass: collect deleted lines and position them appropriately
			for (let i = 0; i < diffEntries.length; i++) {
				const diffEntry = diffEntries[i];
				
				if (diffEntry.type === 'deleted') {
					// Use Rao's algorithm: find the next unchanged line after this deleted line in the original file
					let nextUnchangedLine: typeof diffEntry | null = null;
					let minOldLineAfterDeletion = Number.MAX_VALUE;
					
					for (const otherEntry of diffEntries) {
						// Look for unchanged lines that come after the deleted line in the original file
						if (otherEntry.type === 'unchanged' && 
							otherEntry.oldLine > 0 && 
							otherEntry.oldLine > diffEntry.oldLine && 
							otherEntry.oldLine < minOldLineAfterDeletion &&
							otherEntry.newLine > 0) {
							minOldLineAfterDeletion = otherEntry.oldLine;
							nextUnchangedLine = otherEntry;
						}
					}
					
					let showAtLine: number;
					if (nextUnchangedLine) {
						// Position one line before the next unchanged line in the current file (rao's exact algorithm)
						showAtLine = Math.max(1, nextUnchangedLine.newLine - 1);
					} else {
						// Fallback: position at end of file (rao's exact algorithm)
						showAtLine = Math.max(1, model.getLineCount());
					}
					
					// CRITICAL: Only add to deletedLinesByPosition if this position doesn't already have content
					// This prevents duplicate dropdowns for the same position
					if (!deletedLinesByPosition.has(showAtLine)) {
						deletedLinesByPosition.set(showAtLine, []);
					}
					deletedLinesByPosition.get(showAtLine)!.push(diffEntry.content);
				}
			}

			// Create decorations
			const decorations: Array<{
				range: any;
				options: any;
			}> = [];

			// Green gutter bars for added lines
			for (const lineNumber of addedLines) {
				if (lineNumber <= model.getLineCount()) {
					decorations.push({
						range: {
							startLineNumber: lineNumber,
							startColumn: 1,
							endLineNumber: lineNumber,
							endColumn: model.getLineLength(lineNumber) + 1
						},
						options: {
							isWholeLine: true,
							linesDecorationsClassName: 'erdos-ai-diff-added-gutter',
							overviewRuler: {
								color: 'rgba(0, 255, 0, 0.6)',
								position: 7
							}
						}
					});
				}
			}

			// Red arrows for deleted content (glyph margin indicators) - start collapsed (right arrow)
			for (const [lineNumber, deletedLines] of deletedLinesByPosition) {
				if (lineNumber <= model.getLineCount()) {
					decorations.push({
						range: {
							startLineNumber: lineNumber,
							startColumn: 1,
							endLineNumber: lineNumber,
							endColumn: 1
						},
						options: {
							glyphMarginClassName: 'erdos-ai-diff-deleted-arrow', // Start with right arrow (collapsed)
							glyphMarginHoverMessage: {
								value: `Click to expand ${deletedLines.length} deleted line(s)`
							},
							overviewRuler: {
								color: 'rgba(255, 0, 0, 0.6)',
								position: 7
							}
						}
					});
				}
			}

			// Apply decorations for added lines and glyph margin indicators
			if (decorations.length > 0) {
				const decorationIds = model.deltaDecorations([], decorations);
				this.fileDecorations.set(uri.toString(), decorationIds);
						}

		// Add ViewZone implementation using proven working pattern from notebook diff decorator
		const activeTextEditor = this.codeEditorService.getActiveCodeEditor();
		if (activeTextEditor && activeTextEditor.getModel()?.uri.toString() === uri.toString() && deletedLinesByPosition.size > 0) {
			// Store deleted content for toggle functionality
			this.fileDeletedContent.set(uri.toString(), deletedLinesByPosition);
			
			// Initialize per-line ViewZone tracking for this file if not exists
			const uriString = uri.toString();
			if (!this.fileViewZonesByLine.has(uriString)) {
				this.fileViewZonesByLine.set(uriString, new Map<number, string>());
			}
			if (!this.fileExpandedStates.has(uriString)) {
				this.fileExpandedStates.set(uriString, new Map<number, boolean>());
			}
			const viewZoneIdsByLine = this.fileViewZonesByLine.get(uriString)!;
			
			// Set up click handler for glyph margin arrows (only once per editor instance)
			const editorId = activeTextEditor.getId();
			if (!this.editorClickHandlers.has(editorId)) {
				this.editorClickHandlers.add(editorId);
				activeTextEditor.onMouseDown((e) => {
				if (e.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
					const clickedLine = e.target.position?.lineNumber;
					if (clickedLine) {
						// Get the current file's deleted content from persistent storage
						const currentUri = activeTextEditor.getModel()?.uri.toString();
						const currentDeletedContent = currentUri ? this.fileDeletedContent.get(currentUri) : null;
						
						if (currentDeletedContent && currentDeletedContent.has(clickedLine)) {
							const deletedLines = currentDeletedContent.get(clickedLine)!;
							
							// Get expanded states from persistent storage
							const currentExpandedStates = currentUri ? this.fileExpandedStates.get(currentUri) : null;
							if (!currentExpandedStates) return;
							
							const isCurrentlyExpanded = currentExpandedStates.get(clickedLine) || false;
							const newExpandedState = !isCurrentlyExpanded;
							
							// Update state
							currentExpandedStates.set(clickedLine, newExpandedState);
						
							// Get ViewZone tracking from persistent storage
							const currentViewZonesByLine = currentUri ? this.fileViewZonesByLine.get(currentUri) : null;
							if (!currentViewZonesByLine) return;
							

							
							// Use the exact pattern from notebook cell diff decorator
							activeTextEditor.changeViewZones((viewZoneChangeAccessor) => {
								// Clear existing ViewZone for THIS specific line only
								const existingZoneId = currentViewZonesByLine.get(clickedLine);
								if (existingZoneId) {
									viewZoneChangeAccessor.removeZone(existingZoneId);
									currentViewZonesByLine.delete(clickedLine);
								}
							
							// Only add ViewZone if expanding
							if (newExpandedState) {
								// Create DOM node with complete CSS isolation
								const domNode = document.createElement('div');
								domNode.className = 'erdos-ai-deleted-content-zone';
								
								// Remove all default spacing and set exact font matching
								domNode.style.margin = '0';
								domNode.style.padding = '0';
								domNode.style.border = 'none';
								domNode.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
								domNode.style.color = '#ff6666';
								domNode.style.fontStyle = 'italic';
								domNode.style.fontFamily = activeTextEditor.getOption(EditorOption.fontFamily);
								domNode.style.fontSize = activeTextEditor.getOption(EditorOption.fontSize) + 'px';
								domNode.style.lineHeight = activeTextEditor.getOption(EditorOption.lineHeight) + 'px';
								domNode.style.position = 'relative';
																
								// Add deleted lines without "- " prefix and no extra spacing
								deletedLines.forEach((line, index) => {
									const lineDiv = document.createElement('div');
									lineDiv.textContent = line; // No "- " prefix
									lineDiv.style.margin = '0';
									lineDiv.style.padding = '0';
									lineDiv.style.border = 'none';
									lineDiv.style.whiteSpace = 'pre';
									lineDiv.style.height = activeTextEditor.getOption(EditorOption.lineHeight) + 'px';
									lineDiv.style.lineHeight = activeTextEditor.getOption(EditorOption.lineHeight) + 'px';
																		
									domNode.appendChild(lineDiv);
								});
								
								// Make DOM fully interactive for text selection
								domNode.addEventListener('mousedown', (e) => {
									e.stopPropagation(); // Prevent editor from handling the event
								});
								domNode.addEventListener('selectstart', (e) => {
									e.stopPropagation(); // Allow text selection to start
								});
								
								// Use ViewZone with predictable positioning
								const viewZoneData: IViewZone = {
									afterLineNumber: clickedLine,
									heightInLines: deletedLines.length,
									domNode,
									ordinal: 50000 + clickedLine,
									suppressMouseDown: false // Explicitly allow mouse events
								};
								
								const newZoneId = viewZoneChangeAccessor.addZone(viewZoneData);
								currentViewZonesByLine.set(clickedLine, newZoneId);
							}
							});
							
							// Update arrow direction
							const uri = URI.parse(currentUri!);
							this.updateGlyphMarginArrow(uri, clickedLine, newExpandedState);
						}
					}
				}
			});
			}
			
			// Store ViewZone IDs for cleanup - the persistent tracking is already stored in this.fileViewZonesByLine
			// Update the legacy fileViewZones for backward compatibility
			const allViewZoneIds = Array.from(viewZoneIdsByLine.values());
			this.fileViewZones.set(uri.toString(), allViewZoneIds);
		}

		} catch (error) {
			this.logService.error(`Failed to apply diff decorations for ${uri.toString()}:`, error);
		}
	}



	/**
	 * Update glyph margin arrow direction based on expansion state
	 */
	private updateGlyphMarginArrow(uri: URI, lineNumber: number, isExpanded: boolean): void {
		// Find and update the glyph margin decoration for this line
		const model = this.modelService.getModel(uri);
		if (!model) return;
		
		const decorationIds = this.fileDecorations.get(uri.toString());
		if (!decorationIds) return;
		
		// Get all current decorations
		const decorations = model.getAllDecorations();
		
		// Find the decoration for this specific line
		for (const decoration of decorations) {
			if (decoration.range.startLineNumber === lineNumber && 
				decoration.options.glyphMarginClassName?.includes('erdos-ai-diff-deleted-arrow')) {
				
				// Update the CSS class based on expansion state
				const newClassName = isExpanded ? 'erdos-ai-diff-deleted-arrow-expanded' : 'erdos-ai-diff-deleted-arrow';
				
				// Update the decoration
				const newDecoration = {
					range: decoration.range,
					options: {
						...decoration.options,
						glyphMarginClassName: newClassName,
						glyphMarginHoverMessage: {
							value: isExpanded ? 'Click to collapse deleted content' : 'Click to expand deleted content'
						}
					}
				};
				
				model.deltaDecorations([decoration.id], [newDecoration]);
				break;
			}
		}
	}

	/**
	 * Clear file highlighting for a specific file
	 */
	clearFileHighlighting(uri: URI): void {
		try {
			const uriString = uri.toString();
			
			// Clear decorations
			const decorationIds = this.fileDecorations.get(uriString);
			if (decorationIds) {
				const model = this.modelService.getModel(uri);
				if (model) {
					model.deltaDecorations(decorationIds, []);
				}
				this.fileDecorations.delete(uriString);
			}
			
			// Clear view zones - check both storage locations
			const viewZoneIds = this.fileViewZones.get(uriString);
			const viewZonesByLine = this.fileViewZonesByLine.get(uriString);
			const allViewZoneIds = new Set([
				...(viewZoneIds || []),
				...(viewZonesByLine ? Array.from(viewZonesByLine.values()) : [])
			]);
			
			if (allViewZoneIds.size > 0) {
				const activeTextEditor = this.codeEditorService.getActiveCodeEditor();
				const activeEditorUri = activeTextEditor?.getModel()?.uri.toString();
				
				if (activeTextEditor && activeEditorUri === uriString) {
					activeTextEditor.changeViewZones((accessor: IViewZoneChangeAccessor) => {
						for (const zoneId of allViewZoneIds) {
							accessor.removeZone(zoneId);
						}
					});
				}
				
				// Clear both storage locations
				this.fileViewZones.delete(uriString);
				this.fileViewZonesByLine.delete(uriString);
			}
			
			// Clear deleted content storage
			this.fileDeletedContent.delete(uriString);
			
			// Clear per-line ViewZone tracking
			this.fileViewZonesByLine.delete(uriString);
			
			// Clear expanded states
			this.fileExpandedStates.delete(uriString);
			
			// Clear DOM node references
			this.fileViewZoneDomNodes.delete(uriString);
		} catch (error) {
			this.logService.error(`Failed to clear file highlighting for ${uri.toString()}:`, error);
		}
	}

	/**
	 * Clear all file highlighting across all open files
	 */
	private clearAllFileHighlighting(): void {
		try {
			// Clear all stored decorations and view zones
			for (const uriString of this.fileDecorations.keys()) {
				const uri = URI.parse(uriString);
				this.clearFileHighlighting(uri);
			}
			
			// Clear all maps
			this.fileDecorations.clear();
			this.fileViewZones.clear();
			this.fileViewZonesByLine.clear();
			this.fileDeletedContent.clear();
			this.fileExpandedStates.clear();
			this.fileViewZoneDomNodes.clear();
			this.editorClickHandlers.clear();
			
		} catch (error) {
			this.logService.error('Failed to clear all file highlighting:', error);
		}
	}

	/**
	 * Set file highlighting enabled/disabled for a conversation
	 * Similar to Rao's highlighting toggle functionality
	 */
	setFileHighlightingEnabled(conversationId: number, enabled: boolean): void {
		this.conversationFileHighlighting.set(conversationId, enabled);
		
		if (enabled) {
			// Apply highlighting to all tracked files for this conversation
			this.updateHighlightingForConversation(conversationId);
		} else {
			// Clear highlighting for all files tracked by this conversation
			this.clearHighlightingForConversation(conversationId);
		}
		
		this.logService.info(`File highlighting ${enabled ? 'enabled' : 'disabled'} for conversation ${conversationId}`);
	}

	/**
	 * Check if file highlighting is enabled for a conversation
	 */
	isFileHighlightingEnabled(conversationId: number): boolean {
		return this.conversationFileHighlighting.get(conversationId) ?? false;
	}

	/**
	 * Update highlighting for all files in a conversation
	 */
	private async updateHighlightingForConversation(conversationId: number): Promise<void> {
		try {
			await this.applyHighlightingFromFileChanges(conversationId);
		} catch (error) {
			this.logService.error(`Failed to update highlighting for conversation ${conversationId}:`, error);
		}
	}

	/**
	 * Clear highlighting for all files in a conversation
	 */
	private async clearHighlightingForConversation(conversationId: number): Promise<void> {
		try {
			// Load file changes to know which files need clearing
			const fileChanges = await this.loadFileChangesForConversation(conversationId);
			if (!fileChanges || !fileChanges.changes) {
				return;
			}

					// Clear highlighting for each modified file
		for (const change of fileChanges.changes) {
			if (change.action === 'modify' && change.file_path) {
				const uri = await this.resolveFileUri(change.file_path);
				if (uri) {
					this.clearFileHighlighting(uri);
				}
			}
		}
		} catch (error) {
			this.logService.error(`Failed to clear highlighting for conversation ${conversationId}:`, error);
		}
	}

	/**
	 * Set up file change listeners (called once during initialization)
	 */
	private setupFileChangeListeners(): void {
		// Listen for file changes
		this._register(this.fileService.onDidFilesChange(e => {
			this.onFilesChanged();
		}));

		// Listen for active editor changes
		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.onActiveEditorChanged();
		}));

		// Listen for model content changes to update diff highlighting in real-time
		this._register(this.modelService.onModelAdded((model) => {
			// Set up content change listener for each new model
			this._register(model.onDidChangeContent(() => {
				this.onModelContentChanged(model.uri);
			}));
		}));

		// Set up listeners for already existing models
		this.modelService.getModels().forEach(model => {
			this._register(model.onDidChangeContent(() => {
				this.onModelContentChanged(model.uri);
			}));
		});
	}

	/**
	 * Handle file changes to update highlighting
	 */
	private async onFilesChanged(): Promise<void> {
		try {
			// Update highlighting for all conversations when files change
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation && this.isFileHighlightingEnabled(currentConversation.info.id)) {
				await this.updateHighlightingForConversation(currentConversation.info.id);
			}
		} catch (error) {
			this.logService.error('Failed to handle file changes:', error);
		}
	}

	/**
	 * Handle active editor changes to apply highlighting to newly opened files
	 */
	private async onActiveEditorChanged(): Promise<void> {
		try {
			const activeEditor = this.editorService.activeTextEditorControl;
			if (!activeEditor) {
				return;
			}

			// Get the model from the active editor
			let model: any;
			try {
				model = (activeEditor as any).getModel();
				if (!model) {
					return;
				}
			} catch {
				return;
			}

			const uri = model.uri;
			const currentConversation = this.conversationManager.getCurrentConversation();
			
			if (currentConversation) {
				const conversationId = currentConversation.info.id;
				
				// Check if this file has changes tracked and apply highlighting
				const fileChanges = await this.loadFileChangesForConversation(conversationId);
				if (fileChanges && fileChanges.changes) {
					const filePath = this.uriToRelativePath(uri);
					const change = fileChanges.changes.find((c: any) => c.file_path === filePath);
					
					if (change && this.isFileHighlightingEnabled(conversationId)) {
						// Only apply highlighting if it's not already applied to avoid destroying view zones
						const uriString = uri.toString();
						const hasExistingDecorations = this.fileDecorations.has(uriString);
						const hasExistingViewZones = this.fileViewZonesByLine.has(uriString);
						
						if (!hasExistingDecorations && !hasExistingViewZones) {
							await this.applyFileChangeHighlighting(uri, change);
						}
					}
				}
			}
		} catch (error) {
			this.logService.error('Failed to handle active editor change:', error);
		}
	}

	/**
	 * Handle model content changes to update diff highlighting in real-time
	 * This enables diff updates as the user types, not just on save
	 */
	private async onModelContentChanged(uri: URI): Promise<void> {
		try {
			// Debounce to prevent excessive computations while typing
			if (this.modelContentChangeTimeout) {
				clearTimeout(this.modelContentChangeTimeout);
			}
			
			this.modelContentChangeTimeout = setTimeout(async () => {
				const currentConversation = this.conversationManager.getCurrentConversation();
				if (!currentConversation || !this.isFileHighlightingEnabled(currentConversation.info.id)) {
					return;
				}

				// Check if this file has changes tracked
				const fileChanges = await this.loadFileChangesForConversation(currentConversation.info.id);
				if (fileChanges && fileChanges.changes) {
					const filePath = this.uriToRelativePath(uri);
					const change = fileChanges.changes.find((c: any) => c.file_path === filePath);
					
					if (change) {
						// Apply highlighting based on the tracked file change
						await this.applyFileChangeHighlighting(uri, change);
					}
				}
			}, 500); // 500ms debounce
			
		} catch (error) {
			this.logService.error('Failed to handle model content change:', error);
		}
	}

	/**
	 * Apply diff highlighting to an editor based on file change data
	 * Following Rao's approach: compare current editor content against previous_content from file_changes.json
	 */
	async applyFileChangeHighlighting(uri: URI, fileChange: any): Promise<void> {
		try {
			const conversationId = fileChange.conversation_id;
			
			// Check if highlighting is enabled for this conversation
			if (!this.conversationFileHighlighting.get(conversationId)) {
				return;
			}

			// Get the original content from file_changes.json
			const originalContent = fileChange.previous_content || '';

			// Get current content from the editor or file
			let currentContent: string;
			const model = this.modelService.getModel(uri);
			if (model) {
				currentContent = model.getValue();
			} else {
				try {
					const fileContent = await this.fileService.readFile(uri);
					currentContent = fileContent.value.toString();
				} catch {
					// File might not exist anymore
					currentContent = '';
				}
			}

			this.logService.debug(`Computing diff for: ${uri.toString()}`);
			this.logService.debug(`Original content from first file_changes.json entry has ${originalContent.split('\n').length} lines`);
			this.logService.debug(`Current content has ${currentContent.split('\n').length} lines`);
			
			// Debug: Show first few lines to verify empty lines are preserved
			const originalLines = originalContent.split('\n');
			const currentLines = currentContent.split('\n');
			this.logService.debug('First 5 original lines:', originalLines.slice(0, 5).map((line: string, i: number) => `${i+1}: "${line}"`));
			this.logService.debug('First 5 current lines:', currentLines.slice(0, 5).map((line: string, i: number) => `${i+1}: "${line}"`));

			// If content is the same as original, no highlighting needed
			if (originalContent === currentContent) {
				this.clearFileHighlighting(uri);
				return;
			}

			// Compute diff between original and current
			const diffEntries = await this.computeLineDiff(originalContent, currentContent);

			// Apply highlighting to the editor
			await this.applyDiffDecorations(uri, diffEntries);

		} catch (error) {
			this.logService.error(`Failed to apply file change highlighting for ${uri.toString()}:`, error);
		}
	}

	/**
	 * Load and apply highlighting from file_changes.json
	 * This is the core of Rao's approach
	 */
	private async applyHighlightingFromFileChanges(conversationId: number): Promise<void> {
		try {
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation || conversation.info.id !== conversationId) {
				return;
			}

			// Read file_changes.json from conversation directory
			const fileChanges = await this.loadFileChangesForConversation(conversationId);
			if (!fileChanges || !fileChanges.changes) {
				return;
			}

			// Apply highlighting to each modified file
			this.logService.debug(`file_changes.json has ${fileChanges.changes.length} entries`);
			
			// Group changes by file path and use the FIRST instance (earliest modification)
			const firstChangeByFile = new Map<string, any>();
			for (const change of fileChanges.changes) {
				if (change.action === 'modify' && change.file_path) {
					if (!firstChangeByFile.has(change.file_path)) {
						firstChangeByFile.set(change.file_path, change);
						this.logService.debug(`Using first instance for file: ${change.file_path}, message_id: ${change.message_id}`);
					}
				}
			}
			
					// Apply highlighting using only the first instance of each file
		for (const [filePath, change] of firstChangeByFile) {
			const uri = await this.resolveFileUri(filePath);
			if (uri) {
				await this.applyFileChangeHighlighting(uri, change);
			}
		}

		} catch (error) {
			this.logService.error(`Failed to apply highlighting from file changes:`, error);
		}
	}

	/**
	 * Load file_changes.json for a conversation
	 * Similar to Rao's read_file_changes_log
	 */
	private async loadFileChangesForConversation(conversationId: number): Promise<any> {
		try {
			const conversationPaths = this.conversationManager.getConversationPaths(conversationId);
			const fileChangesPath = URI.parse(conversationPaths.diffLogPath);
			
			const exists = await this.fileService.exists(fileChangesPath);
			if (!exists) {
				return { changes: [] };
			}

			const content = await this.fileService.readFile(fileChangesPath);
			return JSON.parse(content.value.toString());

		} catch (error) {
			this.logService.error(`Failed to load file changes for conversation ${conversationId}:`, error);
			return { changes: [] };
		}
	}

	/**
	 * Create unified resolver context for CommonUtils.resolveFile
	 */
	private createResolverContext() {
		return {
			getAllOpenDocuments: async () => {
				const docs = await this.documentManager.getAllOpenDocuments(true);
				return docs.map(doc => ({
					path: doc.path,
					content: doc.content,
					isDirty: !doc.isSaved,
					isActive: doc.isActive,
					isSaved: doc.isSaved
				}));
			},
			getCurrentWorkingDirectory: async () => {
				const workspaces = this.workspaceContextService.getWorkspace().folders;
				return workspaces && workspaces.length > 0 ? workspaces[0].uri.fsPath : process.cwd();
			},
			fileExists: async (path: string) => {
				try {
					const uri = URI.file(path);
					return await this.fileService.exists(uri);
				} catch {
					return false;
				}
			},
			joinPath: (base: string, ...parts: string[]) => {
				return parts.reduce((acc, part) => acc + '/' + part, base);
			},
			getFileContent: async (uri: URI) => {
				const fileContent = await this.documentManager.getEffectiveFileContent(uri.fsPath);
				return fileContent || '';
			}
		};
	}

	/**
	 * Resolve a file path to a URI using unified file resolution
	 */
	private async resolveFileUri(filePath: string): Promise<URI | null> {
		try {
			const resolverContext = this.createResolverContext();
			const fileResult = await CommonUtils.resolveFile(filePath, resolverContext);
			return fileResult.found ? fileResult.uri || null : null;
		} catch (error) {
			this.logService.error(`Failed to resolve file URI for ${filePath}:`, error);
			return null;
		}
	}

	/**
	 * Convert URI to relative path for comparison with file_changes.json paths
	 */
	private uriToRelativePath(uri: URI): string {
		try {
			const workspaces = this.workspaceContextService.getWorkspace().folders;
			if (!workspaces || workspaces.length === 0) {
				return uri.fsPath;
			}
			
			const workspaceUri = workspaces[0].uri;
			const workspacePath = workspaceUri.fsPath;
			const filePath = uri.fsPath;
			
			// Return relative path if file is within workspace
			if (filePath.startsWith(workspacePath)) {
				return filePath.substring(workspacePath.length + 1);
			}
			
			return filePath;
		} catch (error) {
			return uri.fsPath;
		}
	}

	/**
	 * Extract file content for widget display - public method called during run_file widget creation
	 * Uses the same file resolution logic as search_replace and other file operations
	 */
	async extractFileContentForWidget(filename: string, startLine?: number, endLine?: number): Promise<string> {
		try {
			this.logService.debug('extractFileContentForWidget called with:', { filename, startLine, endLine });
			
			// Use the document manager's getEffectiveFileContent method
			// This handles both absolute and relative paths, workspace resolution, and open/unsaved files
			const fileContent = await this.documentManager.getEffectiveFileContent(filename);
			
			this.logService.debug('getEffectiveFileContent returned:', fileContent ? fileContent.substring(0, 100) + '...' : 'null');
			
			if (!fileContent && fileContent !== '') {
				return `Error: File does not exist: ${filename}`;
			}
			
			if (fileContent.trim().length === 0) {
				return 'Error: File is empty or unreadable.';
			}
			
			// Split content into lines for line range processing (like RAO)
			let lines = fileContent.split('\n');
			
			// Apply line range if specified (like RAO implementation)
			if (startLine !== undefined || endLine !== undefined) {
				const totalLines = lines.length;
				const start = startLine ? Math.max(1, startLine) : 1;
				const end = endLine ? Math.min(totalLines, endLine) : totalLines;
				
				if (start > totalLines) {
					return `Error: Start line ${start} exceeds file length (${totalLines} lines)`;
				}
				
				// Convert to 0-based indexing for array slice
				lines = lines.slice(start - 1, end);
			}
			
			// Check if this is an R Markdown file and extract code chunks if so (like RAO)
			const fileExt = CommonUtils.getFileExtension(filename).toLowerCase();
			let command: string;
			
			if (fileExt === 'rmd' || fileExt === 'qmd') {
				// Extract only R code chunks from the content
				const codeContent = this.extractRCodeFromRmd(lines);
				
				// If no R code chunks were found, treat the content as regular code
				if (codeContent.length === 0) {
					command = lines.join('\n');
				} else {
					command = codeContent.join('\n');
				}
			} else {
				// For regular files, use all content
				command = lines.join('\n');
			}
			
			if (!command.trim()) {
				return 'Error: No executable code found in the specified file or range.';
			}
			
			this.logService.debug('extractFileContentForWidget returning command:', command.substring(0, 100) + '...');
			return command;
			
		} catch (error) {
			this.logService.error('extractFileContentForWidget error:', error);
			return `Error: Cannot read file: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	/**
	 * Revert file changes made after a specific message ID
	 * Similar to rao's revert functionality that handles file changes
	 */
	private async revertFileChanges(messageId: number, conversationId: number): Promise<void> {
		try {
			this.logService.info(`Reverting file changes after message ${messageId} for conversation ${conversationId}`);
			
			// Load file changes for this conversation
			const fileChanges = await this.loadFileChangesForConversation(conversationId);
			if (!fileChanges || !fileChanges.changes) {
				this.logService.info('No file changes to revert');
				return;
			}

			// Find changes made after the revert point
			const changesToRevert = fileChanges.changes.filter((change: any) => 
				change.message_id >= messageId
			);

			if (changesToRevert.length === 0) {
				this.logService.info('No file changes to revert after message', messageId);
				return;
			}

			// Sort changes by timestamp (newest first) to revert in reverse order
			changesToRevert.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

			// Revert each change
			for (const change of changesToRevert) {
				try {
					await this.revertSingleFileChange(change, conversationId);
				} catch (error) {
					this.logService.error(`Failed to revert file change for ${change.file_path}:`, error);
					// Continue with other files even if one fails
				}
			}

			// Remove the reverted changes from file_changes.json
			const remainingChanges = fileChanges.changes.filter((change: any) => 
				change.message_id < messageId
			);

			// Update file_changes.json
			const updatedFileChanges = {
				...fileChanges,
				changes: remainingChanges
			};

			await this.saveFileChangesForConversation(conversationId, updatedFileChanges);

			this.logService.info(`Successfully reverted ${changesToRevert.length} file changes`);

		} catch (error) {
			this.logService.error('Failed to revert file changes:', error);
			// Don't throw - conversation revert should succeed even if file revert fails
		}
	}

	/**
	 * Revert a single file change
	 */
	private async revertSingleFileChange(change: any, conversationId: number): Promise<void> {
		try {
			const filePath = change.file_path;
			if (!filePath) {
				return;
			}

			// Resolve file URI
			const uri = await this.resolveFileUri(filePath);
			if (!uri) {
				this.logService.warn(`Could not resolve URI for file: ${filePath}`);
				return;
			}

			if (change.action === 'create') {
				// File was created - delete it
				const exists = await this.fileService.exists(uri);
				if (exists) {
					await this.fileService.del(uri);
					this.logService.info(`Deleted created file: ${filePath}`);
				}

			} else if (change.action === 'modify') {
				// File was modified - restore previous content
				if (change.previous_content !== undefined) {
					await this.fileService.writeFile(uri, VSBuffer.fromString(change.previous_content));
					this.logService.info(`Restored previous content for: ${filePath}`);
				}

			} else if (change.action === 'remove') {
				// File was deleted - restore it
				if (change.previous_content !== undefined) {
					await this.fileService.writeFile(uri, VSBuffer.fromString(change.previous_content));
					this.logService.info(`Restored deleted file: ${filePath}`);
				}
			}

			// Clear any highlighting for this file
			this.clearFileHighlighting(uri);

		} catch (error) {
			this.logService.error(`Failed to revert file change for ${change.file_path}:`, error);
			throw error;
		}
	}

	/**
	 * Save file changes data for a conversation
	 */
	private async saveFileChangesForConversation(conversationId: number, fileChanges: any): Promise<void> {
		try {
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation || conversation.info.id !== conversationId) {
				this.logService.warn(`Cannot save file changes for conversation ${conversationId} - not current conversation`);
				return;
			}

			const paths = this.conversationManager.getConversationPaths(conversationId);
			const fileChangesPath = joinPath(URI.parse(paths.conversationDir), 'file_changes.json');
			
			await this.fileService.writeFile(fileChangesPath, VSBuffer.fromString(JSON.stringify(fileChanges, null, 2)));
			
		} catch (error) {
			this.logService.error(`Failed to save file changes for conversation ${conversationId}:`, error);
			throw error;
		}
	}

	/**
	 * Check if a file is a Jupyter notebook based on extension
	 */
	private isJupyterNotebook(filename: string): boolean {
		return filename.toLowerCase().endsWith('.ipynb');
	}

	/**
	 * Get the active notebook editor
	 */
	private getActiveNotebookEditor(): INotebookEditor | undefined {
		const activeEditorPane = this.editorService.activeEditorPane;
		if (activeEditorPane && activeEditorPane.getId() === NOTEBOOK_EDITOR_ID) {
			const notebookEditor = activeEditorPane.getControl() as INotebookEditor;
			if (notebookEditor.hasModel()) {
				return notebookEditor;
			}
		}
		return undefined;
	}

	/**
	 * Execute a Jupyter notebook file by running cells in the notebook interface
	 */
	private async executeNotebookFile(filename: string, callId: string, selectedJupytextContent: string): Promise<string> {
		try {
			
			// Use the unified file resolution system
			const resolverContext = this.createResolverContext();
			const fileResult = await CommonUtils.resolveFile(filename, resolverContext);
			if (!fileResult.found || !fileResult.uri) {
				throw new Error(`Could not resolve notebook file: ${filename}`);
			}

			const fileUri = fileResult.uri;
			
			// Open the notebook in the editor
			await this.editorService.openEditor({
				resource: fileUri,
				options: { revealIfOpened: true }
			});
			
			// Get the active notebook editor
			const notebookEditor = this.getActiveNotebookEditor();
			if (!notebookEditor) {
				throw new Error(`Could not find active notebook editor for ${filename}`);
			}
			
			if (!notebookEditor.hasModel()) {
				throw new Error(`Notebook editor has no model for ${filename}`);
			}
			
			const notebookModel = notebookEditor.textModel;
			if (!notebookModel) {
				throw new Error(`Could not get notebook model for ${filename}`);
			}
			
			// Convert the full notebook to jupytext (same as what the model sees)
			const fullJupytextContent = await this.documentManager.getEffectiveFileContent(fileUri.fsPath);
			if (!fullJupytextContent) {
				throw new Error(`Could not get jupytext content for ${fileUri.fsPath}`);
			}
			
			// Find which cells the selected content corresponds to
			const cellsToExecute = await this.mapSelectedContentToCells(selectedJupytextContent, fullJupytextContent, notebookModel);
			
			if (cellsToExecute.length === 0) {
				return `# No executable cells found in the selected content from ${filename}`;
			}
			
			// Execute the specific cells using the notebook execution service
			await this.notebookExecutionService.executeNotebookCells(notebookModel, cellsToExecute, this.contextKeyService);
			
			// Wait a bit for execution to complete and outputs to be generated
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			// Collect outputs from the executed cells
			let aggregatedOutput = '';
			
			for (let i = 0; i < cellsToExecute.length; i++) {
				const cell = cellsToExecute[i];
				
				// Get outputs from the cell
				if (cell.outputs && cell.outputs.length > 0) {
					for (const output of cell.outputs) {
						if (output.outputs && output.outputs.length > 0) {
							for (const outputItem of output.outputs) {
								if (outputItem.mime === 'application/vnd.code.notebook.stdout' || 
									outputItem.mime === 'application/vnd.code.notebook.stderr' ||
									outputItem.mime === 'text/plain') {
									const outputText = outputItem.data.toString();
									aggregatedOutput += outputText;
								}
							}
						}
					}
				}
			}
			
			return aggregatedOutput;
			
		} catch (error) {
			const errorMsg = `Failed to execute notebook ${filename}: ${error instanceof Error ? error.message : error}`;
			this.logService.error(`[NOTEBOOK EXECUTION] ${errorMsg}`);
			throw new Error(errorMsg);
		}
	}



	/**
	 * Map selected content to corresponding notebook cells using proper jupytext conversion
	 */
	private async mapSelectedContentToCells(selectedContent: string, fullJupytextContent: string, notebookModel: any): Promise<any[]> {
		const cellsToExecute: any[] = [];
		
		this.logService.info(`[CELL MAPPING] Selected content length: ${selectedContent.length}`);
		this.logService.info(`[CELL MAPPING] Full jupytext length: ${fullJupytextContent.length}`);
		
		try {
			// Use jupytext service to convert the selected content back to notebook format
			const selectedNotebookJson = await this.jupytextService.pythonTextToNotebook(selectedContent, {
				extension: '.py',
				format_name: 'percent'
			});
			
			// Parse the selected notebook to get cell information
			const selectedNotebook = JSON.parse(selectedNotebookJson);
			this.logService.info(`[CELL MAPPING] Selected content contains ${selectedNotebook.cells?.length || 0} cells`);
			
			// Also convert the full content to get complete cell mapping
			const fullNotebookJson = await this.jupytextService.pythonTextToNotebook(fullJupytextContent, {
				extension: '.py',
				format_name: 'percent'
			});
			
			const fullNotebook = JSON.parse(fullNotebookJson);
			this.logService.info(`[CELL MAPPING] Full notebook contains ${fullNotebook.cells?.length || 0} cells`);
			
			if (!selectedNotebook.cells || !fullNotebook.cells) {
				this.logService.warn(`[CELL MAPPING] Could not parse cells from jupytext content`);
				return cellsToExecute;
			}
			
			// Match selected cells to their position in the full notebook by content
			const selectedCells = selectedNotebook.cells.filter((cell: any) => cell.cell_type === 'code');
			const fullCells = fullNotebook.cells.filter((cell: any) => cell.cell_type === 'code');
			
			for (const selectedCell of selectedCells) {
				const selectedSource = Array.isArray(selectedCell.source) ? selectedCell.source.join('') : selectedCell.source;
				
				// Find matching cell in full notebook
				for (let i = 0; i < fullCells.length; i++) {
					const fullCell = fullCells[i];
					const fullSource = Array.isArray(fullCell.source) ? fullCell.source.join('') : fullCell.source;
					
					if (selectedSource.trim() === fullSource.trim()) {
						// Found matching cell, get corresponding notebook model cell
						const allCodeCells = notebookModel.cells.filter((cell: any) => cell.cellKind === CellKind.Code);
						if (i < allCodeCells.length) {
							cellsToExecute.push(allCodeCells[i]);
							this.logService.info(`[CELL MAPPING] Matched selected cell to notebook cell ${i}`);
						}
						break;
					}
				}
			}
			
			this.logService.info(`[CELL MAPPING] Mapped ${cellsToExecute.length} cells for execution using jupytext`);
			return cellsToExecute;
			
		} catch (error) {
			this.logService.error(`[CELL MAPPING] Error using jupytext to map cells:`, error);
			// Fallback: if jupytext fails, don't execute anything rather than guess
			return cellsToExecute;
		}
	}

	/**
	 * Show conversation history dialog
	 */
	async showConversationHistory(): Promise<void> {
		// This will be handled by the view pane - trigger an event
		this._onShowConversationHistory.fire();
	}

	/**
	 * Show settings panel
	 */
	async showSettings(): Promise<void> {
		// This will be handled by the view pane - trigger an event
		this._onShowSettings.fire();
	}

	// Event emitters for the new UI actions
	private readonly _onShowConversationHistory = this._register(new Emitter<void>());
	readonly onShowConversationHistory: Event<void> = this._onShowConversationHistory.event;

	private readonly _onShowSettings = this._register(new Emitter<void>());
	readonly onShowSettings: Event<void> = this._onShowSettings.event;


}

