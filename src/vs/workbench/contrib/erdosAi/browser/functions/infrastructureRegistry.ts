/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FileSystemUtils } from './fileSystemUtils.js';
import { SettingsUtils } from './settingsUtils.js';
import { DocumentManager } from '../document/documentManager.js';
import { ImageProcessingManager } from './imageProcessingManager.js';
import { ConversationUtilities } from './conversationUtilities.js';
import { RMarkdownParser } from './rMarkdownParser.js';
import { OutputLimiter } from './outputLimiter.js';
import { CallContext } from './types.js';
import { IFileService } from '../../../../../../vs/platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../../vs/platform/workspace/common/workspace.js';
import { IEnvironmentService } from '../../../../../../vs/platform/environment/common/environment.js';
import { IConfigurationService } from '../../../../../../vs/platform/configuration/common/configuration.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ITextModelService } from '../../../../../../vs/editor/common/services/resolverService.js';
import { IModelService } from '../../../../../../vs/editor/common/services/model.js';
import { IInstantiationService } from '../../../../../../vs/platform/instantiation/common/instantiation.js';
import { IJupytextService } from '../services/jupytextService.js';

import { ILanguageRuntimeService } from '../../../../services/languageRuntime/common/languageRuntimeService.js';

/**
 * Infrastructure Registry for Erdos AI
 * Creates and manages all the real infrastructure components
 * Replaces all mocked functionality with real implementations
 */
export class InfrastructureRegistry {
    private fileSystemUtils: FileSystemUtils;
    private settingsUtils: SettingsUtils;
    private documentManager: DocumentManager;
    private imageProcessingManager: ImageProcessingManager;


    private conversationUtilities: ConversationUtilities;
    private rMarkdownParser: RMarkdownParser;
    private outputLimiter: OutputLimiter;

    
    // These are set after construction from the main service
    public conversationManager?: any;
    public functionCallOrchestrator?: any;
    private searchService?: any;

    constructor(
        fileService: IFileService,
        workspaceService: IWorkspaceContextService,
        environmentService: IEnvironmentService,
        configurationService: IConfigurationService,
        editorService: IEditorService,
        textFileService: ITextFileService,
        textModelService: ITextModelService,
        modelService: IModelService,
        instantiationService: IInstantiationService,
        jupytextService: IJupytextService,
        languageRuntimeService: ILanguageRuntimeService
    ) {
        // Initialize core utilities
        this.fileSystemUtils = new FileSystemUtils(fileService, workspaceService, environmentService);
        this.settingsUtils = new SettingsUtils(configurationService);
        
        // Initialize document operations with real Erdos DocumentManager
        this.documentManager = instantiationService.createInstance(DocumentManager);
        
        // Initialize specialized managers
        this.imageProcessingManager = new ImageProcessingManager(this.fileSystemUtils);


        this.conversationUtilities = new ConversationUtilities(this.fileSystemUtils, environmentService);
        
        // Initialize utilities
        this.rMarkdownParser = new RMarkdownParser();
        this.outputLimiter = new OutputLimiter();
    }

    /**
     * Set conversation manager instance
     */
    setConversationManager(conversationManager: any): void {
        this.conversationManager = conversationManager;
    }

    /**
     * Set function call orchestrator instance
     */
    setFunctionCallOrchestrator(functionCallOrchestrator: any): void {
        this.functionCallOrchestrator = functionCallOrchestrator;
    }

    /**
     * Set search service instance for ripgrep functionality
     */
    setSearchService(searchService: any): void {
        // Store search service for injection into call context
        this.searchService = searchService;
    }

    /**
     * Create a complete CallContext with all real infrastructure
     * This replaces the mocked context creation throughout the system
     */
    createCallContext(relatedToId: string | number, requestId: string, conversationManager: any): CallContext {
        return {
            relatedToId,
            requestId,
            conversationManager: {
                // CRITICAL: Use the provided conversationManager's methods directly
                // This ensures we use the main service's preallocated message IDs
                getPreallocatedMessageId: (callId: string, index: number) => 
                    conversationManager.getPreallocatedMessageId ? 
                        conversationManager.getPreallocatedMessageId(callId, index) : null,
                getNextMessageId: () => 
                    conversationManager.getNextMessageId ? 
                        conversationManager.getNextMessageId() : 0
            },
            
            // Real document manager
            documentManager: {
                getEffectiveFileContent: (filePath: string, startLine?: number, endLine?: number) => 
                    this.documentManager.getEffectiveFileContent(filePath, startLine, endLine),
                getDiskFileContent: (filePath: string, startLine?: number, endLine?: number) => 
                    this.documentManager.getEffectiveFileContent(filePath, startLine, endLine),
                isFileOpenInEditor: async (filePath: string) => 
                    this.documentManager.checkIfFileOpenInEditor(filePath),
                getOpenDocumentContent: (filePath: string) => 
                    this.documentManager.getOpenDocumentContent(filePath),
                getAllOpenDocuments: async (includeContent?: boolean) => {
                    const docs = await this.documentManager.getAllOpenDocuments(includeContent);
                    return docs.map(doc => ({
                        path: doc.path,
                        isDirty: !doc.isSaved,
                        content: includeContent ? doc.content : '',
                        isActive: doc.isActive,
                        isSaved: doc.isSaved
                    }));
                },
                matchTextInOpenDocuments: async (searchText: string, options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean; }) => {
                    const matches = await this.documentManager.matchTextInOpenDocuments(searchText, options);
                    return matches.map(match => ({
                        path: match.documentPath,
                        line: match.line,
                        column: match.column,
                        text: match.matchText
                    }));
                },
                updateOpenDocumentContent: (documentId: string, newContent: string) => 
                    this.documentManager.updateOpenDocumentContent(documentId, newContent),
                isDocumentSaved: (documentId: string) => 
                    this.documentManager.isDocumentSaved(documentId),
                getDocumentPath: (documentId: string) => 
                    this.documentManager.getDocumentPath(documentId),
                checkIfFileOpenInEditor: (filePath: string) => 
                    this.documentManager.checkIfFileOpenInEditor(filePath)
            },

            // Real file system utilities
            fileSystemUtils: this.fileSystemUtils,

            // Real settings utilities
            settingsUtils: this.settingsUtils,

            // Real search capabilities - injected by main service
            searchService: this.searchService,



            // Real image processing
            imageProcessingManager: {
                resizeImageForAI: (imagePath: string, targetSizeKb?: number) => 
                    this.imageProcessingManager.resizeImageForAI(imagePath, targetSizeKb),
                validateImageFile: async (imagePath: string, maxSizeMb?: number) => {
                    const result = await this.imageProcessingManager.validateImageFile(imagePath, maxSizeMb);
                    return {
                        isValid: result.valid,
                        errorMessage: result.error
                    };
                },
                isImageFile: (filePath: string) => this.imageProcessingManager.isImageFile(filePath),
                getSupportedFormats: () => this.imageProcessingManager.getSupportedFormats()
            },

            // Real conversation utilities
            conversationUtilities: {
                getCurrentConversationIndex: () => this.conversationUtilities.getCurrentConversationIndex(),
                analyzeConversationHistory: (filePath: string, currentLog: any[]) => 
                    this.conversationUtilities.analyzeConversationHistory(filePath, currentLog),
                getNextMessageId: () => this.conversationUtilities.getNextMessageId(),
                readConversationLog: (conversationIndex?: number) => 
                    this.conversationUtilities.readConversationLog(conversationIndex),
                writeConversationLog: (log: any[], conversationIndex?: number) => 
                    this.conversationUtilities.writeConversationLog(log, conversationIndex),
                isConversationEmpty: (conversationIndex?: number) => 
                    this.conversationUtilities.isConversationEmpty(conversationIndex),
                createNewConversation: () => this.conversationUtilities.createNewConversation(),
                switchConversation: (index: number) => this.conversationUtilities.switchConversation(index)
            },

            // Real R Markdown parsing
            rMarkdownParser: {
                extractRCodeFromRmd: (fileLines: string[]) => this.rMarkdownParser.extractRCodeFromRmd(fileLines),
                extractRmdCodeChunks: (fileLines: string[]) => this.rMarkdownParser.extractRmdCodeChunks(fileLines),
                extractExecutableRCode: (fileContent: string[], filename: string) => 
                    this.rMarkdownParser.extractExecutableRCode(fileContent, filename),
                isRMarkdownFile: (filename: string) => this.rMarkdownParser.isRMarkdownFile(filename),
                getDocumentType: (filename: string) => this.rMarkdownParser.getDocumentType(filename),
                hasRMarkdownChunks: (content: string) => this.rMarkdownParser.hasRMarkdownChunks(content)
            },

            // Real output limiting
            outputLimiter: {
                limitOutputText: (outputText: string[] | string, maxTotalChars?: number, maxLines?: number, maxLineLength?: number) => 
                    this.outputLimiter.limitOutputText(outputText, maxTotalChars, maxLines, maxLineLength),
                limitFileContent: (fileContent: string) => this.outputLimiter.limitFileContent(fileContent),
                limitConsoleOutput: (output: string) => this.outputLimiter.limitConsoleOutput(output),
                limitSearchResults: (results: string, maxMatches?: number) => 
                    this.outputLimiter.limitSearchResults(results, maxMatches),
                limitByContentType: (content: string, contentType: any) => 
                    this.outputLimiter.limitByContentType(content, contentType)
            }
        };
    }

    /**
     * Get file system utilities
     */
    getFileSystemUtils(): FileSystemUtils {
        return this.fileSystemUtils;
    }

    /**
     * Get settings utilities
     */
    getSettingsUtils(): SettingsUtils {
        return this.settingsUtils;
    }

    /**
     * Get document manager
     */
    getDocumentManager(): DocumentManager {
        return this.documentManager;
    }

    /**
     * Get image processing manager
     */
    getImageProcessingManager(): ImageProcessingManager {
        return this.imageProcessingManager;
    }

    /**
     * Get conversation utilities
     */
    getConversationUtilities(): ConversationUtilities {
        return this.conversationUtilities;
    }

    /**
     * Get R Markdown parser
     */
    getRMarkdownParser(): RMarkdownParser {
        return this.rMarkdownParser;
    }

    /**
     * Get output limiter
     */
    getOutputLimiter(): OutputLimiter {
        return this.outputLimiter;
    }

    /**
     * Initialize all infrastructure components
     * Call this after construction to ensure everything is ready
     */
    async initialize(): Promise<void> {
    }

    /**
     * Clean up resources
     */
    async dispose(): Promise<void> {
        // Clean up any resources that need disposal
        // Most components don't need explicit cleanup, but this provides a hook
    }
}
