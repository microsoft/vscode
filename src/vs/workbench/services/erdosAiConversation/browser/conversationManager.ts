/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { MessageStore } from './messageStore.js';
import { 
    Conversation, 
    ConversationInfo, 
    ConversationMessage, 
    StreamingMessage, 
    MessageMetadata,
    ConversationPaths
} from '../../erdosAi/common/conversationTypes.js';
import { IConversationManager } from '../common/conversationManager.js';

export class ConversationManager extends Disposable implements IConversationManager {
    readonly _serviceBrand: undefined;
    private messageStore: MessageStore;
    private currentConversation: Conversation | null = null;
    private storageRoot: URI;
    private conversationsDir: URI;
    
    private messageIdGenerator?: () => number;

    private readonly _onMessageAdded = new Emitter<any>();
    readonly onMessageAdded: Event<any> = this._onMessageAdded.event;

    constructor(
        @IFileService private readonly fileService: IFileService,
        @IEnvironmentService private readonly environmentService: IEnvironmentService,
        @IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
        @ILogService private readonly logService: ILogService
    ) {
        super();
        this.messageStore = new MessageStore();
        
        const workspace = this.workspaceContextService.getWorkspace();
        const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
        const workspaceId = this.workspaceContextService.getWorkspace().id;
        
        this.storageRoot = isEmptyWindow ?
            joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
            joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
            
        this.conversationsDir = joinPath(this.storageRoot, 'conversations');
        
        this.ensureDirectories();
    }

    public setMessageIdGenerator(generator: () => number): void {
        this.messageIdGenerator = generator;
    }

    public getCurrentConversation(): Conversation | null {
        return this.currentConversation;
    }

    public async addMessage(conversationId: number, role: 'user' | 'assistant', content: string, metadata?: Partial<MessageMetadata>): Promise<ConversationMessage> {
        if (!this.messageIdGenerator) {
            throw new Error('Message ID generator not set');
        }

        const message: ConversationMessage = {
            id: this.messageIdGenerator(),
            role,
            content,
            timestamp: new Date().toISOString(),
            ...metadata
        };

        this.messageStore.addMessageWithId(message);

        if (this.currentConversation && this.currentConversation.info.id === conversationId) {
            this.currentConversation.messages = this.messageStore.getAllMessages();
            this.currentConversation.info.message_count = this.messageStore.getMessageCount();
            this.currentConversation.info.updated_at = new Date().toISOString();
            
            await this.saveConversationLog(this.currentConversation);
        }

        return message;
    }

    public async addMessageWithId(message: ConversationMessage): Promise<void> {
        this.messageStore.addMessageWithId(message);

        if (this.currentConversation) {
            this.currentConversation.messages = this.messageStore.getAllMessages();
            this.currentConversation.info.message_count = this.messageStore.getMessageCount();
            this.currentConversation.info.updated_at = new Date().toISOString();
            
            await this.saveConversationLog(this.currentConversation);
        }
    }

    public async addFunctionCallMessage(
        conversationId: number, 
        messageId: number, 
        functionCall: any, 
        relatedToId: number,
        createPendingOutput: boolean = false,
        pendingOutputId?: number,
        requestId?: string
    ): Promise<ConversationMessage> {
        if (!this.messageIdGenerator) {
            throw new Error('Message ID generator not set');
        }

        const message: ConversationMessage = {
            id: messageId,
            role: 'assistant',
            timestamp: new Date().toISOString(),
            function_call: {
                name: functionCall.name,
                arguments: functionCall.arguments,
                call_id: functionCall.call_id,
                msg_id: messageId
            },
            related_to: relatedToId,
            procedural: false,
            request_id: requestId
        };

        this.messageStore.addMessageWithId(message);

        if (createPendingOutput && pendingOutputId) {
            const pendingOutput: ConversationMessage = {
                id: pendingOutputId,
                timestamp: new Date().toISOString(),
                type: 'function_call_output',
                call_id: functionCall.call_id,
                related_to: messageId,
                output: "Response pending...",
                procedural: true
            };

            this.messageStore.addMessageWithId(pendingOutput);
            
        }

        if (this.currentConversation && this.currentConversation.info.id === conversationId) {
            this.currentConversation.messages = this.messageStore.getAllMessages();
            this.currentConversation.info.message_count = this.messageStore.getMessageCount();
            this.currentConversation.info.updated_at = new Date().toISOString();
            
            await this.saveConversationLog(this.currentConversation);
        }

        return message;
    }



    public async addFunctionCallOutput(functionCallOutput: any): Promise<void> {
        if (!this.currentConversation) {
            throw new Error('No active conversation');
        }

        console.log(`[CONVERSATION_MANAGER] Adding function_call_output:`, functionCallOutput);

        const outputMessage: ConversationMessage = {
            id: functionCallOutput.id,
            timestamp: new Date().toISOString(),
            type: 'function_call_output',
            call_id: functionCallOutput.call_id,
            related_to: functionCallOutput.related_to,
            output: functionCallOutput.output,
            procedural: functionCallOutput.procedural || false,
            ...(functionCallOutput.success !== undefined && { success: functionCallOutput.success })
        } as ConversationMessage & { success?: boolean };

        console.log(`[CONVERSATION_MANAGER] Created outputMessage:`, outputMessage);

        this.messageStore.addMessageWithId(outputMessage);

        this.currentConversation.messages = this.messageStore.getAllMessages();
        this.currentConversation.info.message_count = this.messageStore.getMessageCount();
        this.currentConversation.info.updated_at = new Date().toISOString();
        
        console.log(`[CONVERSATION_MANAGER] Updated conversation, message count: ${this.currentConversation.info.message_count}`);
        
        await this.saveConversationLog(this.currentConversation);
        console.log(`[CONVERSATION_MANAGER] Saved conversation to disk`);
    }

    public getMessages(): ConversationMessage[] {
        return this.currentConversation?.messages || [];
    }

    public getNextMessageId(): number {
        if (!this.messageIdGenerator) {
            throw new Error('Message ID generator not set');
        }
        return this.messageIdGenerator();
    }

    private async ensureDirectories(): Promise<void> {
        try {
            await this.fileService.createFolder(this.storageRoot);
            
            await this.fileService.createFolder(this.conversationsDir);
            
            const conversationNamesPath = joinPath(this.storageRoot, 'conversation_names.csv');
            try {
                await this.fileService.readFile(conversationNamesPath);
            } catch {
                const csvContent = 'conversation_id,name\n';
                await this.fileService.writeFile(conversationNamesPath, VSBuffer.fromString(csvContent));
            }
        } catch (error) {
        }
    }

    public getConversationPaths(id: number): ConversationPaths {
        const conversationDir = joinPath(this.conversationsDir, `conversation_${id}`);
        
        return {
            conversationDir: conversationDir.toString(),
            conversationLogPath: joinPath(conversationDir, 'conversation_log.json').toString(),
            scriptHistoryPath: joinPath(conversationDir, 'script_history.tsv').toString(),
            diffLogPath: joinPath(conversationDir, 'file_changes.json').toString(),
            conversationDiffLogPath: joinPath(conversationDir, 'conversation_diffs.json').toString(),
            buttonsCsvPath: joinPath(conversationDir, 'message_buttons.csv').toString(),
            attachmentsCsvPath: joinPath(conversationDir, 'attachments.csv').toString(),
            summariesPath: joinPath(conversationDir, 'summaries.json').toString(),
            backgroundSummarizationStatePath: joinPath(conversationDir, 'background_summarization.json').toString(),
            plotsDir: joinPath(conversationDir, 'plots').toString()
        };
    }

    private async findHighestConversationIndex(): Promise<number> {
        try {
            const stat = await this.fileService.resolve(this.conversationsDir);
            
            let maxIndex = 0;
            if (stat.children) {
                for (const child of stat.children) {
                    if (child.isDirectory && child.name.startsWith('conversation_')) {
                        const indexStr = child.name.substring('conversation_'.length);
                        const index = parseInt(indexStr, 10);
                        if (!isNaN(index) && index > maxIndex) {
                            maxIndex = index;
                        }
                    }
                }
            }
            
            return maxIndex;
        } catch (error) {
            return 0;
        }
    }

    public async createNewConversation(name?: string): Promise<Conversation> {
        const nextIndex = await this.findHighestConversationIndex() + 1;
        const timestamp = new Date().toISOString();
        
        const conversationInfo: ConversationInfo = {
            id: nextIndex,
            name: name || `New conversation`,  
            created_at: timestamp,
            updated_at: timestamp,
            message_count: 0
        };

        const conversation: Conversation = {
            info: conversationInfo,
            messages: []
        };

        const paths = this.getConversationPaths(nextIndex);
        await this.createConversationDirectory(paths);

        await this.saveConversationLog(conversation);

        await this.updateConversationNamesCSV(conversationInfo);

        this.currentConversation = conversation;
        this.messageStore.clear();

        return conversation;
    }

    private async createConversationDirectory(paths: ConversationPaths): Promise<void> {
        const conversationDirUri = URI.parse(paths.conversationDir);
        
        await this.fileService.createFolder(conversationDirUri);
        
        await this.fileService.writeFile(
            URI.parse(paths.conversationLogPath),
            VSBuffer.fromString('[]')
        );
        
        await this.fileService.writeFile(
            URI.parse(paths.scriptHistoryPath),
            VSBuffer.fromString('filename\torder\n')
        );
        
        await this.fileService.writeFile(
            URI.parse(paths.diffLogPath),
            VSBuffer.fromString('{"changes": []}')
        );
        
        await this.fileService.writeFile(
            URI.parse(paths.conversationDiffLogPath),
            VSBuffer.fromString('{}')
        );
        
        const buttonsCsvHeaders = 'message_id,buttons_run,next_button,on_deck_button\n';
        await this.fileService.writeFile(
            URI.parse(paths.buttonsCsvPath),
            VSBuffer.fromString(buttonsCsvHeaders)
        );
        
        await this.fileService.createFolder(URI.parse(paths.plotsDir));
    }

    public async saveConversationLog(conversation: Conversation): Promise<void> {
        const paths = this.getConversationPaths(conversation.info.id);
        
        let conversationLog = [...conversation.messages];

        if (this.messageIdGenerator) {
            for (let i = 0; i < conversationLog.length; i++) {
                if (conversationLog[i].id === undefined || conversationLog[i].id === null) {
                    conversationLog[i] = { ...conversationLog[i], id: this.messageIdGenerator() };
                }
            }
        }

        const jsonContent = JSON.stringify(conversationLog, null, 2);
        await this.fileService.writeFile(
            URI.parse(paths.conversationLogPath),
            VSBuffer.fromString(jsonContent)
        );
    }

    public async loadConversation(id: number): Promise<Conversation | null> {
        const paths = this.getConversationPaths(id);
        
        try {
            const logContent = await this.fileService.readFile(URI.parse(paths.conversationLogPath));
            const messages: ConversationMessage[] = JSON.parse(logContent.value.toString());
            
            const conversationName = await this.getConversationName(id);
            
            const conversationInfo: ConversationInfo = {
                id: id,
                name: conversationName,
                created_at: messages.length > 0 ? messages[0].timestamp : new Date().toISOString(),
                updated_at: messages.length > 0 ? messages[messages.length - 1].timestamp : new Date().toISOString(),
                message_count: messages.length
            };
            
            return {
                info: conversationInfo,
                messages: messages
            };
        } catch (error) {
            return null;
        }
    }

    public async switchToConversation(id: number): Promise<boolean> {
        const conversation = await this.loadConversation(id);
        if (!conversation) {
            return false;
        }

        this.currentConversation = conversation;
        this.messageStore.loadMessages(conversation.messages);
        return true;
    }

    public async deleteConversation(id: number): Promise<boolean> {
        try {
            const paths = this.getConversationPaths(id);
            
            await this.fileService.del(URI.parse(paths.conversationDir), { recursive: true });
            
            const conversationNamesPath = joinPath(this.storageRoot, 'conversation_names.csv');
            try {
                const content = await this.fileService.readFile(conversationNamesPath);
                const lines = content.value.toString().split('\n');
                
                const filteredLines = lines.filter(line => {
                    if (!line.trim() || line.includes('conversation_id,name')) {
                        return true;
                    }
                    const parts = line.split(',');
                    const conversationId = parseInt(parts[0], 10);
                    return conversationId !== id;
                });
                
                await this.fileService.writeFile(
                    conversationNamesPath,
                    VSBuffer.fromString(filteredLines.join('\n'))
                );
            } catch (error) {
            }
            
            if (this.currentConversation?.info.id === id) {
                this.currentConversation = null;
                this.messageStore.clear();
            }
            
            return true;
        } catch (error) {
            return false;
        }
    }

    public async deleteAllConversations(): Promise<boolean> {
        try {
            const conversations = await this.listConversations();
            
            for (const conversation of conversations) {
                const paths = this.getConversationPaths(conversation.id);
                try {
                    await this.fileService.del(URI.parse(paths.conversationDir), { recursive: true });
                } catch (error) {
                    console.error(`Failed to delete conversation ${conversation.id}:`, error);
                }
            }
            
            const conversationNamesPath = joinPath(this.storageRoot, 'conversation_names.csv');
            try {
                await this.fileService.writeFile(
                    conversationNamesPath,
                    VSBuffer.fromString('conversation_id,name\n')
                );
            } catch (error) {
            }
            
            this.currentConversation = null;
            this.messageStore.clear();
            
            return true;
        } catch (error) {
            return false;
        }
    }

    public async renameConversation(id: number, newName: string): Promise<boolean> {
        try {
            const conversationInfo: ConversationInfo = {
                id: id,
                name: newName,
                created_at: '',
                updated_at: new Date().toISOString(),
                message_count: 0
            };
            
            await this.updateConversationNamesCSV(conversationInfo);
            
            if (this.currentConversation?.info.id === id) {
                this.currentConversation.info.name = newName;
                this.currentConversation.info.updated_at = new Date().toISOString();
            }
            
            return true;
        } catch (error) {
            return false;
        }
    }

    public async listConversations(): Promise<ConversationInfo[]> {
        try {
            const stat = await this.fileService.resolve(this.conversationsDir);
            const conversations: ConversationInfo[] = [];
            
            if (stat.children) {
                for (const child of stat.children) {
                    if (child.isDirectory && child.name.startsWith('conversation_')) {
                        const indexStr = child.name.substring('conversation_'.length);
                        const id = parseInt(indexStr, 10);
                        
                        if (!isNaN(id)) {
                            const conversation = await this.loadConversation(id);
                            if (conversation) {
                                conversations.push(conversation.info);
                            }
                        }
                    }
                }
            }
            
            conversations.sort((a, b) => a.id - b.id);
            return conversations;
        } catch (error) {
            return [];
        }
    }

    public async isConversationBlank(id: number): Promise<boolean> {
        try {
            const conversation = await this.loadConversation(id);
            if (!conversation) {
                return false;
            }
            
            const userMessages = conversation.messages.filter(msg => msg.role === 'user');
            return userMessages.length === 0;
        } catch (error) {
            return false;
        }
    }

    public async findHighestBlankConversation(): Promise<number | null> {
        try {
            const conversations = await this.listConversations();
            if (conversations.length === 0) {
                return null;
            }
            
            const sortedConversations = conversations.sort((a, b) => b.id - a.id);
            
            for (const conversationInfo of sortedConversations) {
                const isBlank = await this.isConversationBlank(conversationInfo.id);
                if (isBlank) {
                    return conversationInfo.id;
                }
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    private async updateConversationNamesCSV(conversationInfo: ConversationInfo): Promise<void> {
        const conversationNamesPath = joinPath(this.storageRoot, 'conversation_names.csv');
        
        try {
            const content = await this.fileService.readFile(conversationNamesPath);
            const lines = content.value.toString().split('\n');
            
            let found = false;
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const parts = lines[i].split(',');
                    const existingId = parseInt(parts[0], 10);
                    
                    if (existingId === conversationInfo.id) {
                        const escapedName = conversationInfo.name.replace(/"/g, '""');
                        lines[i] = `${conversationInfo.id},"${escapedName}"`;
                        found = true;
                        break;
                    }
                }
            }
            
            if (!found) {
                const escapedName = conversationInfo.name.replace(/"/g, '""');
                lines.push(`${conversationInfo.id},"${escapedName}"`);
            }
            
            await this.fileService.writeFile(
                conversationNamesPath,
                VSBuffer.fromString(lines.join('\n'))
            );
        } catch (error) {
            const escapedName = conversationInfo.name.replace(/"/g, '""');
            const csvContent = `conversation_id,name\n${conversationInfo.id},"${escapedName}"\n`;
            await this.fileService.writeFile(conversationNamesPath, VSBuffer.fromString(csvContent));
        }
    }

    private async getConversationName(id: number): Promise<string> {
        const conversationNamesPath = joinPath(this.storageRoot, 'conversation_names.csv');
        
        try {
            const content = await this.fileService.readFile(conversationNamesPath);
            const lines = content.value.toString().split('\n');
            
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const parts = lines[i].split(',');
                    const conversationId = parseInt(parts[0], 10);
                    
                    if (conversationId === id && parts.length > 1) {
                        return parts[1].replace(/^"/, '').replace(/"$/, '');
                    }
                }
            }
        } catch (error) {
        }
        
        return 'New conversation'; 
    }

    public addUserMessage(content: string, metadata?: MessageMetadata): number {
        if (!this.currentConversation) {
            throw new Error('No active conversation');
        }

        if (!this.messageIdGenerator) {
            throw new Error('Message ID generator not set - must use compatible sequential IDs');
        }

        const messageId = this.messageIdGenerator();
        
        const message: ConversationMessage = {
            id: messageId,
            role: 'user',
            content: content,
            timestamp: new Date().toISOString(),
            ...metadata
        };
        
        this.messageStore.addMessageWithId(message);

        this.currentConversation.messages = this.messageStore.getAllMessages();
        this.currentConversation.info.message_count = this.messageStore.getMessageCount();
        this.currentConversation.info.updated_at = new Date().toISOString();

        this.saveConversationLog(this.currentConversation);

        return messageId;
    }

    public addAssistantMessage(content: string, metadata?: MessageMetadata): number {
        if (!this.currentConversation) {
            throw new Error('No active conversation');
        }

        if (!this.messageIdGenerator) {
            throw new Error('Message ID generator not set');
        }

        const messageId = this.messageIdGenerator();
        
        const assistantMessage: ConversationMessage = {
            id: messageId,
            role: 'assistant',
            content: content,
            timestamp: new Date().toISOString(),
            ...metadata
        };

        this.messageStore.addMessageWithId(assistantMessage);

        this.currentConversation.messages = this.messageStore.getAllMessages();
        this.currentConversation.info.message_count = this.messageStore.getMessageCount();
        this.currentConversation.info.updated_at = new Date().toISOString();

        this.saveConversationLog(this.currentConversation);

        return messageId;
    }

    public updateMessage(id: number, updates: Partial<ConversationMessage>): boolean {
        if (!this.currentConversation) {
            return false;
        }

        const success = this.messageStore.updateMessage(id, updates);
        if (success) {
            this.currentConversation.messages = this.messageStore.getAllMessages();
            this.currentConversation.info.updated_at = new Date().toISOString();

            this.saveConversationLog(this.currentConversation);
        }

        return success;
    }

    public getCurrentMessages(): ConversationMessage[] {
        return this.messageStore.getAllMessages();
    }

    public startStreamingMessage(initialContent = ''): StreamingMessage {
        if (!this.currentConversation) {
            throw new Error('No active conversation');
        }

        if (!this.messageIdGenerator) {
            throw new Error('Message ID generator not set - must use compatible sequential IDs');
        }
        const messageId = this.messageIdGenerator();
        
        const streamingMessage: StreamingMessage = {
            id: messageId,
            content: initialContent,
            complete: false,
            start_time: new Date()
        };

        this.currentConversation.streaming = streamingMessage;
        return streamingMessage;
    }

    public startStreamingMessageWithId(messageId: number, initialContent = ''): StreamingMessage {
        if (!this.currentConversation) {
            throw new Error('No active conversation');
        }
        
        const streamingMessage: StreamingMessage = {
            id: messageId,
            content: initialContent,
            complete: false,
            start_time: new Date()
        };

        this.currentConversation.streaming = streamingMessage;
        return streamingMessage;
    }

    public updateStreamingMessage(content: string, append = true): void {
        if (!this.currentConversation?.streaming) {
            return;
        }

        if (append) {
            this.currentConversation.streaming.content += content;
        } else {
            this.currentConversation.streaming.content = content;
        }
    }

    public completeStreamingMessage(metadata?: MessageMetadata, contentProcessor?: (content: string) => string): number {
        if (!this.currentConversation?.streaming) {
            throw new Error('No active streaming message');
        }

        const streamingMessage = this.currentConversation.streaming;
        
        const messageId = streamingMessage.id || (this.messageIdGenerator ? this.messageIdGenerator() : 0);
        
        const finalContent = contentProcessor ? contentProcessor(streamingMessage.content) : streamingMessage.content;
        
        const completedMessage: ConversationMessage = {
            id: messageId,
            role: 'assistant',
            content: finalContent,
            timestamp: new Date().toISOString(),
            function_call: streamingMessage.function_call,
            ...metadata
        };

        this.messageStore.addMessageWithId(completedMessage);

        this.currentConversation.messages = this.messageStore.getAllMessages();
        this.currentConversation.info.message_count = this.messageStore.getMessageCount();
        this.currentConversation.info.updated_at = new Date().toISOString();
        
        this.currentConversation.streaming = undefined;

        this.saveConversationLog(this.currentConversation);

        return messageId;
    }

    public cancelStreamingMessage(): void {
        if (this.currentConversation?.streaming) {
            const streamingMessage = this.currentConversation.streaming;
            
            if (streamingMessage.content && streamingMessage.content.trim().length > 0) {
                console.log(`[DEBUG CANCEL] Preserving streaming content: "${streamingMessage.content.substring(0, 50)}..."`);
                try {
                    this.completeStreamingMessage({
                        cancelled: true
                    }, undefined);
                    console.log(`[DEBUG CANCEL] Streaming content preserved in conversation log`);
                    return;
                } catch (error) {
                    console.error('Failed to preserve streaming content:', error);
                }
            } else {
                console.log(`[DEBUG CANCEL] No content to preserve, just clearing streaming state`);
            }
            
            this.currentConversation.streaming = undefined;
        }
    }

    public getCurrentStreamingMessage(): StreamingMessage | undefined {
        return this.currentConversation?.streaming;
    }

    public addMessageWithSpecificId(message: ConversationMessage): void {
        if (!this.currentConversation) {
            throw new Error('No active conversation');
        }
        
        this.messageStore.addMessageWithId(message);
        this.currentConversation.messages = this.messageStore.getAllMessages();
        this.currentConversation.info.message_count = this.messageStore.getMessageCount();
        this.currentConversation.info.updated_at = new Date().toISOString();
        
        this.saveConversationLog(this.currentConversation);
    }

    public clearStreaming(): void {
        if (this.currentConversation?.streaming) {
            this.currentConversation.streaming = undefined;
        }
    }

    public async shouldPromptForName(conversationId: number): Promise<boolean> {
        try {
            const currentName = await this.getConversationName(conversationId);
            
            if (currentName !== 'New conversation' && !/^New conversation \d+$/.test(currentName)) {
                return false;
            }
            
            if (currentName === 'New conversation' || /^New conversation \d+$/.test(currentName)) {
                const conversation = await this.loadConversation(conversationId);
                if (!conversation) {
                    return false;
                }
                
                const userMessages = conversation.messages.filter(msg => msg.role === 'user').length;
                const assistantMessages = conversation.messages.filter(msg => msg.role === 'assistant').length;
                
                const shouldPrompt = userMessages >= 1 && assistantMessages >= 1;
                return shouldPrompt;
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }

    public async generateAIConversationName(conversationId: number, backendClient: any): Promise<string | null> {
        try {
            const conversation = await this.loadConversation(conversationId);
            if (!conversation) {
                return null;
            }

            const userAssistantMessages = conversation.messages.filter(msg => 
                (msg.role === 'user' || msg.role === 'assistant') &&
                msg.content && 
                (!msg.function_call) && 
                (typeof msg.content === 'string' || Array.isArray(msg.content))
            ).slice(0, 3);

            if (userAssistantMessages.length === 0) {
                return null;
            }

            const generatedName = await backendClient.generateConversationName(userAssistantMessages);
            
            if (!generatedName) {
                return null;
            }

            const cleanedName = generatedName.replace(/["'`]/g, '').trim();
            
            if (cleanedName.length > 0 && cleanedName !== 'New conversation') {
                await this.renameConversation(conversationId, cleanedName);
                return cleanedName;
            }
            
            return null;
        } catch (error) {
            console.error('Failed to generate AI conversation name:', error);
            return null; 
        }
    }

    public generateConversationName(firstMessage: string): string {
        let name = firstMessage.substring(0, 50).trim();
        
        name = name.replace(/\s+/g, ' ');
        
        if (firstMessage.length > 50) {
            name += '...';
        }
        
        return name || 'New Conversation';
    }

    hasNewerMessages(conversation: any, functionCallMessageId: number, callId: string): boolean {
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

    triggerConversationNameCheck(): void {
        setTimeout(async () => {
            try {
                const currentConversation = this.getCurrentConversation();
                if (!currentConversation) {
                    return;
                }

                const shouldPrompt = await this.shouldPromptForName(currentConversation.info.id);
                if (shouldPrompt) {
                    this.logService.info('Triggering conversation name generation');
                    // Fire event or call name generation logic here
                    // This would typically trigger the UI to show name generation
                }
            } catch (error) {
                this.logService.error('Error in triggerConversationNameCheck:', error);
            }
        }, 1000);
    }

    async replacePendingFunctionCallOutput(callId: string, actualOutput: string, success?: boolean): Promise<void> {
        try {
            const conversation = this.getCurrentConversation();
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
            
            if (success !== undefined) {
                (pendingEntry as any).success = success;
            }

            await this.saveConversationLog(conversation);
            
            this.logService.info('Replaced pending function call output:', callId);
            
        } catch (error) {
            this.logService.error('Error replacing pending function call output:', error);
            throw error;
        }
    }

    async updateConversationDisplay(): Promise<void> {
        try {
            const currentConversation = this.getCurrentConversation();
            if (!currentConversation) {
                return;
            }

            this._onMessageAdded.fire({
                id: -1,
                type: 'conversation_update',
                content: '',
                timestamp: new Date().toISOString(),
                related_to: undefined
            });
            
            this.logService.info('Updated conversation display');
        } catch (error) {
            this.logService.error('Error updating conversation display:', error);
        }
    }
}
