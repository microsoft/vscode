/*
 * Copyright (C) 2025 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { IFileSystemUtils } from '../../erdosAiUtils/common/fileSystemUtils.js';
import { SettingsUtils } from '../../erdosAiUtils/browser/settingsUtils.js';
import { DocumentManager } from '../../erdosAiDocument/browser/documentManager.js';
import { ImageProcessingManager } from '../../erdosAiMedia/browser/imageProcessingManager.js';
import { ConversationUtilities } from '../../erdosAiConversation/browser/conversationUtilities.js';
import { RMarkdownParser } from '../../erdosAiUtils/browser/rMarkdownParser.js';
import { OutputLimiter } from '../../erdosAiUtils/browser/outputLimiter.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { CallContext } from '../common/functionTypes.js';
import { DocumentInfo, MatchResult } from '../../erdosAiDocument/common/documentUtils.js';
import { IFileService } from '../../../../../vs/platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../vs/platform/workspace/common/workspace.js';
import { IEnvironmentService } from '../../../../../vs/platform/environment/common/environment.js';
import { IConfigurationService } from '../../../../../vs/platform/configuration/common/configuration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ITextModelService } from '../../../../../vs/editor/common/services/resolverService.js';
import { IModelService } from '../../../../../vs/editor/common/services/model.js';
import { IInstantiationService } from '../../../../../vs/platform/instantiation/common/instantiation.js';
import { IJupytextService } from '../../erdosAiIntegration/common/jupytextService.js';

import { ILanguageRuntimeService } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInfrastructureRegistry } from '../common/infrastructureRegistry.js';
import { IMessageIdManager } from '../../erdosAiConversation/common/messageIdManager.js';

// Infrastructure Registry for Erdos AI
export class InfrastructureRegistry extends Disposable implements IInfrastructureRegistry {
    readonly _serviceBrand: undefined;
    private fileSystemUtils: IFileSystemUtils;
    private settingsUtils: SettingsUtils;
    private documentManager: DocumentManager;
    private imageProcessingManager: ImageProcessingManager;

    private conversationUtilities: ConversationUtilities;
    private rMarkdownParser: RMarkdownParser;
    private outputLimiter: OutputLimiter;
    private commonUtils: ICommonUtils;

    public conversationManager?: any;
    public messageIdManager?: IMessageIdManager;
    private searchService?: any;

    constructor(
        @IFileSystemUtils fileSystemUtilsService: IFileSystemUtils,
        @IFileService fileService: IFileService,
        @IWorkspaceContextService workspaceService: IWorkspaceContextService,
        @IEnvironmentService environmentService: IEnvironmentService,
        @IConfigurationService configurationService: IConfigurationService,
        @IEditorService editorService: IEditorService,
        @ITextFileService textFileService: ITextFileService,
        @ITextModelService textModelService: ITextModelService,
        @IModelService modelService: IModelService,
        @IInstantiationService instantiationService: IInstantiationService,
        @IJupytextService jupytextService: IJupytextService,
        @ILanguageRuntimeService languageRuntimeService: ILanguageRuntimeService,
        @ICommonUtils commonUtils: ICommonUtils,
        @IMessageIdManager messageIdManager: IMessageIdManager
    ) {
        super();
        this.fileSystemUtils = fileSystemUtilsService;
        this.settingsUtils = new SettingsUtils(configurationService);
        this.commonUtils = commonUtils;
        this.messageIdManager = messageIdManager;
        
        this.documentManager = instantiationService.createInstance(DocumentManager);
        
        this.imageProcessingManager = new ImageProcessingManager(this.fileSystemUtils, commonUtils);

        this.conversationUtilities = instantiationService.createInstance(ConversationUtilities);
        
        this.rMarkdownParser = instantiationService.createInstance(RMarkdownParser);
        this.outputLimiter = instantiationService.createInstance(OutputLimiter);
    }

    override async dispose(): Promise<void> {
        super.dispose();
    }

    async initialize(): Promise<void> {
    }

    setConversationManager(conversationManager: any): void {
        this.conversationManager = conversationManager;
    }

    setMessageIdManager(messageIdManager: IMessageIdManager): void {
        this.messageIdManager = messageIdManager;
    }


    setSearchService(searchService: any): void {
        this.searchService = searchService;
    }

    createCallContext(relatedToId: string | number, requestId: string, conversationManager: any): CallContext {
        return {
            relatedToId,
            requestId,
            conversationManager: {
                getPreallocatedMessageId: (callId: string, index: number) => 
                    this.messageIdManager ? 
                        this.messageIdManager.getPreallocatedMessageId(callId, index) : null,
                getNextMessageId: () => 
                    conversationManager.getNextMessageId ? 
                        conversationManager.getNextMessageId() : 0,
                getCurrentConversation: () => 
                    conversationManager.getCurrentConversation ? 
                        conversationManager.getCurrentConversation() : null,
                addFunctionCallMessage: (
                    conversationId: number, 
                    messageId: number, 
                    functionCall: any, 
                    relatedToId: number,
                    createPendingOutput?: boolean,
                    pendingOutputId?: number,
                    requestId?: string
                ) => 
                    conversationManager.addFunctionCallMessage ? 
                        conversationManager.addFunctionCallMessage(conversationId, messageId, functionCall, relatedToId, createPendingOutput, pendingOutputId, requestId) : 
                        Promise.resolve({})
            },
            
            documentManager: {
                getEffectiveFileContent: (filePath: string, startLine?: number, endLine?: number) => 
                    this.documentManager.getEffectiveFileContent(filePath, startLine, endLine),
                getDiskFileContent: (filePath: string, startLine?: number, endLine?: number) => 
                    this.documentManager.getEffectiveFileContent(filePath, startLine, endLine),
                isFileOpenInEditor: async (filePath: string) => 
                    this.documentManager.isFileOpenInEditor(filePath),
                getOpenDocumentContent: (filePath: string) => 
                    this.documentManager.getOpenDocumentContent(filePath),
                getAllOpenDocuments: async (includeContent?: boolean) => {
                    const docs = await this.documentManager.getAllOpenDocuments(includeContent);
                    return docs.map((doc: DocumentInfo) => ({
                        path: doc.path,
                        isDirty: !doc.isSaved,
                        content: includeContent ? doc.content : '',
                        isActive: doc.isActive,
                        isSaved: doc.isSaved
                    }));
                },
                matchTextInOpenDocuments: async (searchText: string, options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean; }) => {
                    const matches = await this.documentManager.matchTextInOpenDocuments(searchText, options);
                    return matches.map((match: MatchResult) => ({
                        path: match.documentPath,
                        line: match.line,
                        column: match.column,
                        text: match.matchText
                    }));
                },
                updateOpenDocumentContent: (documentId: string, newContent: string) => 
                    this.documentManager.updateOpenDocumentContent(documentId, newContent)
            },

            fileSystemUtils: this.fileSystemUtils,

            settingsUtils: this.settingsUtils,

            searchService: this.searchService,

            imageProcessingManager: {
                resizeImageForAI: (imagePath: string, targetSizeKb?: number) => 
                    this.imageProcessingManager.resizeImageForAI(imagePath, targetSizeKb),
                validateImageFile: async (imagePath: string, maxSizeMb?: number) => {
                    const result = await this.imageProcessingManager.validateImageFile(imagePath, maxSizeMb);
                    return {
                        isValid: result.valid,
                        errorMessage: result.error
                    };
                }
            },

            conversationUtilities: {
                getCurrentConversationIndex: () => this.conversationUtilities.getCurrentConversationIndex(),
                analyzeConversationHistory: (filePath: string, currentLog: any[]) => 
                    this.conversationUtilities.analyzeConversationHistory(filePath, currentLog),
                getNextMessageId: () => conversationManager.getNextMessageId ? conversationManager.getNextMessageId() : 0,
                readConversationLog: (conversationIndex?: number) => 
                    this.conversationUtilities.readConversationLog(conversationIndex),
                writeConversationLog: (log: any[], conversationIndex?: number) => 
                    this.conversationUtilities.writeConversationLog(log, conversationIndex),
                isConversationEmpty: (conversationIndex?: number) => 
                    this.conversationUtilities.isConversationEmpty(conversationIndex),
                createNewConversation: () => this.conversationUtilities.createNewConversation(),
                switchConversation: (index: number) => this.conversationUtilities.switchConversation(index)
            },

            rMarkdownParser: {
                extractRCodeFromRmd: (fileLines: string[]) => this.rMarkdownParser.extractRCodeFromRmd(fileLines),
                extractRmdCodeChunks: (fileLines: string[]) => this.rMarkdownParser.extractRmdCodeChunks(fileLines),
                extractExecutableRCode: (fileContent: string[], filename: string) => 
                    this.rMarkdownParser.extractExecutableRCode(fileContent, filename),
                isRMarkdownFile: (filename: string) => this.rMarkdownParser.isRMarkdownFile(filename),
                getDocumentType: (filename: string) => this.rMarkdownParser.getDocumentType(filename),
                hasRMarkdownChunks: (content: string) => this.rMarkdownParser.hasRMarkdownChunks(content)
            },

            outputLimiter: {
                limitOutputText: (outputText: string[] | string, maxTotalChars?: number, maxLines?: number, maxLineLength?: number) => 
                    this.outputLimiter.limitOutputText(outputText, maxTotalChars, maxLines, maxLineLength),
                limitFileContent: (fileContent: string) => this.outputLimiter.limitFileContent(fileContent),
                limitConsoleOutput: (output: string) => this.outputLimiter.limitConsoleOutput(output),
                limitSearchResults: (results: string, maxMatches?: number) => 
                    this.outputLimiter.limitSearchResults(results, maxMatches),
                limitByContentType: (content: string, contentType: any) => 
                    this.outputLimiter.limitByContentType(content, contentType)
            },

            commonUtils: {
                getBasename: (filePath: string) => this.commonUtils.getBasename(filePath),
                compareBasenames: (basename1: string, basename2: string) => this.commonUtils.compareBasenames(basename1, basename2),
                splitNameAndExtension: (filename: string) => this.commonUtils.splitNameAndExtension(filename),
                comparePathsWithCaseInsensitiveExtensions: (path1: string, path2: string) => this.commonUtils.comparePathsWithCaseInsensitiveExtensions(path1, path2),
                resolveFile: (filePath: string, context: any) => this.commonUtils.resolveFile(filePath, context),
                isAbsolutePath: (path: string) => this.commonUtils.isAbsolutePath(path),
                isRelativePath: (path: string) => this.commonUtils.isRelativePath(path),
                getRelativePath: (absolutePath: string, baseDir: string) => this.commonUtils.getRelativePath(absolutePath, baseDir),
                getDirname: (filePath: string) => this.commonUtils.getDirname(filePath),
                getFileExtension: (filePath: string) => this.commonUtils.getFileExtension(filePath),
                detectLanguage: (filePath: string) => this.commonUtils.detectLanguage(filePath),
                getCommentSyntax: (filePath: string) => this.commonUtils.getCommentSyntax(filePath),
                expandPath: (path: string, workspaceRoot?: string) => this.commonUtils.expandPath(path, workspaceRoot),
                joinPath: (...parts: string[]) => this.commonUtils.joinPath(...parts),
                normalizePath: (path: string) => this.commonUtils.normalizePath(path),
                resolvePath: (path: string, workspaceRoot: string) => this.commonUtils.resolvePath(path, workspaceRoot),
                resolveFilePathToUri: (filePath: string, resolverContext: any) => this.commonUtils.resolveFilePathToUri(filePath, resolverContext),
                formatFileSize: (sizeInBytes: number) => this.commonUtils.formatFileSize(sizeInBytes)
            }
        };
    }
}
