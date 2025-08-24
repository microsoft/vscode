/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { MessageStore } from './messageStore.js';
import { 
    Conversation, 
    ConversationInfo, 
    ConversationMessage, 
    StreamingMessage, 
    MessageMetadata,
    ConversationPaths,
    FunctionCall
} from './conversationTypes.js';

/**
 * Manages conversation lifecycle, persistence, and state
 * Uses Erdos's file service for persistence
 */
export class ConversationManager {
    private messageStore: MessageStore;
    private currentConversation: Conversation | null = null;
    private storageRoot: URI;
    private conversationsDir: URI;
    
    /**
     * CRITICAL: Message ID generation must be provided externally
     */
    private messageIdGenerator?: () => number;

    constructor(
        private readonly fileService: IFileService,
        private readonly environmentService: IEnvironmentService,
        private readonly workspaceContextService: IWorkspaceContextService
    ) {
        this.messageStore = new MessageStore();
        
        // Use Erdos's workspace storage structure, matching ChatSessionStore pattern exactly
        const workspace = this.workspaceContextService.getWorkspace();
        const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
        const workspaceId = this.workspaceContextService.getWorkspace().id;
        
        // Follow exact same pattern as ChatSessionStore for storage location
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
            ...metadata  // Spread all metadata including original_query, procedural, etc.
        };

        // Add to message store
        this.messageStore.addMessageWithId(message);

        // Update current conversation if it's loaded
        if (this.currentConversation && this.currentConversation.info.id === conversationId) {
            // Sync with MessageStore to get properly sorted messages
            this.currentConversation.messages = this.messageStore.getAllMessages();
            this.currentConversation.info.message_count = this.messageStore.getMessageCount();
            this.currentConversation.info.updated_at = new Date().toISOString();
            
            // CRITICAL: Save conversation to disk immediately to ensure persistence
            await this.saveConversationLog(this.currentConversation);
        }

        return message;
    }

    /**
     * Add message with pre-assigned ID to conversation (like rao's message saving)
     */
    public async addMessageWithId(message: ConversationMessage): Promise<void> {
        // Add to message store with pre-assigned ID
        this.messageStore.addMessageWithId(message);

        // Update current conversation if it's loaded
        if (this.currentConversation) {
            // Sync with MessageStore to get properly sorted messages
            this.currentConversation.messages = this.messageStore.getAllMessages();
            this.currentConversation.info.message_count = this.messageStore.getMessageCount();
            this.currentConversation.info.updated_at = new Date().toISOString();
            
            // CRITICAL: Save conversation to disk immediately to ensure persistence
            await this.saveConversationLog(this.currentConversation);
        }
    }

    /**
     * Add function call message to conversation
     */
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
            request_id: requestId  // Store request_id like Rao does
        };

        // Add to message store with pre-assigned ID
        this.messageStore.addMessageWithId(message);

        // If requested, also create the pending function_call_output immediately (like Rao does)
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

            // Add pending output to message store
            this.messageStore.addMessageWithId(pendingOutput);
            
        }

        // Update current conversation if it's loaded
        if (this.currentConversation && this.currentConversation.info.id === conversationId) {
            // Sync with MessageStore to get properly sorted messages
            this.currentConversation.messages = this.messageStore.getAllMessages();
            this.currentConversation.info.message_count = this.messageStore.getMessageCount();
            this.currentConversation.info.updated_at = new Date().toISOString();
            
            // CRITICAL: Save conversation to disk immediately to ensure persistence
            await this.saveConversationLog(this.currentConversation);
        }

        return message;
    }

    /**
     * Update existing function call message arguments during streaming
     */
    public updateFunctionCallMessage(messageId: number, functionCall: Partial<FunctionCall>): void {
        const message = this.messageStore.getMessage(messageId);
        if (message?.function_call) {
            message.function_call = { ...message.function_call, ...functionCall };
            
            // Update current conversation if it's loaded
            if (this.currentConversation && this.currentConversation.info.id === this.currentConversation.info.id) {
                // Sync with MessageStore to get updated messages
                this.currentConversation.messages = this.messageStore.getAllMessages();
                this.currentConversation.info.updated_at = new Date().toISOString();
            }
        }
    }

    /**
     * Add function call output to conversation
     */
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
            // Preserve success field from function handlers (like Rao does)
            ...(functionCallOutput.success !== undefined && { success: functionCallOutput.success })
        } as ConversationMessage & { success?: boolean };

        console.log(`[CONVERSATION_MANAGER] Created outputMessage:`, outputMessage);

        // Add to message store with pre-assigned ID
        this.messageStore.addMessageWithId(outputMessage);

        // Update current conversation
        this.currentConversation.messages = this.messageStore.getAllMessages();
        this.currentConversation.info.message_count = this.messageStore.getMessageCount();
        this.currentConversation.info.updated_at = new Date().toISOString();
        
        console.log(`[CONVERSATION_MANAGER] Updated conversation, message count: ${this.currentConversation.info.message_count}`);
        
        // CRITICAL: Save conversation to disk immediately for persistence
        await this.saveConversationLog(this.currentConversation);
        console.log(`[CONVERSATION_MANAGER] Saved conversation to disk`);
    }

    public getMessages(): ConversationMessage[] {
        return this.currentConversation?.messages || [];
    }

    /**
     * This method redirects to the external generator provided by the service
     */
    public getNextMessageId(): number {
        if (!this.messageIdGenerator) {
            throw new Error('Message ID generator not set - must use compatible sequential IDs');
        }
        return this.messageIdGenerator();
    }

    /**
     * Uses Erdos's file service for directory creation
     */
    private async ensureDirectories(): Promise<void> {
        try {
            // Create base storage directory
            await this.fileService.createFolder(this.storageRoot);
            
            // Create conversations subdirectory
            await this.fileService.createFolder(this.conversationsDir);
            
            const conversationNamesPath = joinPath(this.storageRoot, 'conversation_names.csv');
            try {
                await this.fileService.readFile(conversationNamesPath);
            } catch {
                const csvContent = 'conversation_id,name\n';
                await this.fileService.writeFile(conversationNamesPath, VSBuffer.fromString(csvContent));
            }
        } catch (error) {
            // Directory creation is best-effort, failures will be caught at file operations
        }
    }

    /**
     * @param id Conversation ID
     * @returns Object with all conversation file paths as URIs
     */
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

    /**
     * Find the highest existing conversation index
     * @returns Highest conversation ID or 0 if none exist
     */
    private async findHighestConversationIndex(): Promise<number> {
        try {
            // List all directories in conversations folder using resolve
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
            // Directory doesn't exist yet or other error - return 0 (first conversation)
            return 0;
        }
    }

    /**
     * @param name Optional conversation name
     * @returns New conversation object
     */
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

        // Create conversation directory structure
        const paths = this.getConversationPaths(nextIndex);
        await this.createConversationDirectory(paths);

        // Save conversation log
        await this.saveConversationLog(conversation);

        // Update conversation names
        await this.updateConversationNamesCSV(conversationInfo);

        // Set as current conversation
        this.currentConversation = conversation;
        this.messageStore.clear();

        return conversation;
    }

    /**
     * @param paths Conversation file paths
     */
    private async createConversationDirectory(paths: ConversationPaths): Promise<void> {
        const conversationDirUri = URI.parse(paths.conversationDir);
        
        // Create the conversation directory
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
        
        // Create plots directory
        await this.fileService.createFolder(URI.parse(paths.plotsDir));
    }

    /**
     * @param conversation Conversation to save
     */
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

        // This produces clean JSON with no array boxing
        const jsonContent = JSON.stringify(conversationLog, null, 2);
        await this.fileService.writeFile(
            URI.parse(paths.conversationLogPath),
            VSBuffer.fromString(jsonContent)
        );
    }

    /**
     * @param id Conversation ID
     * @returns Loaded conversation or null if not found
     */
    public async loadConversation(id: number): Promise<Conversation | null> {
        const paths = this.getConversationPaths(id);
        
        try {
            // Load conversation log
            const logContent = await this.fileService.readFile(URI.parse(paths.conversationLogPath));
            const messages: ConversationMessage[] = JSON.parse(logContent.value.toString());
            
            // Get conversation name from conversation_names.csv
            const conversationName = await this.getConversationName(id);
            
            // Create conversation info
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

    /**
     * Switch to a different conversation
     * @param id Conversation ID to switch to
     * @returns True if switch was successful
     */
    public async switchToConversation(id: number): Promise<boolean> {
        const conversation = await this.loadConversation(id);
        if (!conversation) {
            return false;
        }

        this.currentConversation = conversation;
        this.messageStore.loadMessages(conversation.messages);
        return true;
    }

    /**
     * Delete a conversation
     * @param id Conversation ID to delete
     * @returns True if deletion was successful
     */
    public async deleteConversation(id: number): Promise<boolean> {
        try {
            const paths = this.getConversationPaths(id);
            
            // Delete the entire conversation directory
            await this.fileService.del(URI.parse(paths.conversationDir), { recursive: true });
            
            // Remove from conversation names CSV
            const conversationNamesPath = joinPath(this.storageRoot, 'conversation_names.csv');
            try {
                const content = await this.fileService.readFile(conversationNamesPath);
                const lines = content.value.toString().split('\n');
                
                // Filter out the deleted conversation
                const filteredLines = lines.filter(line => {
                    if (!line.trim() || line.includes('conversation_id,name')) {
                        return true; // Keep header and empty lines
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
                // CSV update failed but directory deletion succeeded
            }
            
            // If this was the current conversation, clear it
            if (this.currentConversation?.info.id === id) {
                this.currentConversation = null;
                this.messageStore.clear();
            }
            
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Delete all conversations
     * @returns True if deletion was successful
     */
    public async deleteAllConversations(): Promise<boolean> {
        try {
            // Get all conversations first
            const conversations = await this.listConversations();
            
            // Delete each conversation directory
            for (const conversation of conversations) {
                const paths = this.getConversationPaths(conversation.id);
                try {
                    await this.fileService.del(URI.parse(paths.conversationDir), { recursive: true });
                } catch (error) {
                    // Continue deleting even if one fails
                    console.error(`Failed to delete conversation ${conversation.id}:`, error);
                }
            }
            
            // Clear the conversation names CSV file
            const conversationNamesPath = joinPath(this.storageRoot, 'conversation_names.csv');
            try {
                // Write just the header
                await this.fileService.writeFile(
                    conversationNamesPath,
                    VSBuffer.fromString('conversation_id,name\n')
                );
            } catch (error) {
                // CSV clear failed but directory deletions may have succeeded
            }
            
            // Clear current conversation
            this.currentConversation = null;
            this.messageStore.clear();
            
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Rename a conversation
     * @param id Conversation ID
     * @param newName New conversation name
     * @returns True if rename was successful
     */
    public async renameConversation(id: number, newName: string): Promise<boolean> {
        try {
            // Update conversation names file
            const conversationInfo: ConversationInfo = {
                id: id,
                name: newName,
                created_at: '', // These will be preserved from existing CSV
                updated_at: new Date().toISOString(),
                message_count: 0
            };
            
            await this.updateConversationNamesCSV(conversationInfo);
            
            // Update current conversation if it's the one being renamed
            if (this.currentConversation?.info.id === id) {
                this.currentConversation.info.name = newName;
                this.currentConversation.info.updated_at = new Date().toISOString();
            }
            
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * @returns Array of conversation info objects
     */
    public async listConversations(): Promise<ConversationInfo[]> {
        try {
            // List all conversation directories using resolve
            const stat = await this.fileService.resolve(this.conversationsDir);
            const conversations: ConversationInfo[] = [];
            
            if (stat.children) {
                for (const child of stat.children) {
                    if (child.isDirectory && child.name.startsWith('conversation_')) {
                        const indexStr = child.name.substring('conversation_'.length);
                        const id = parseInt(indexStr, 10);
                        
                        if (!isNaN(id)) {
                            // Load conversation to get metadata
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

    /**
     * Check if a conversation is blank (has no user messages)
     * @param id Conversation ID to check
     * @returns True if conversation has no user messages, false otherwise
     */
    public async isConversationBlank(id: number): Promise<boolean> {
        try {
            const conversation = await this.loadConversation(id);
            if (!conversation) {
                return false;
            }
            
            // Check if there are any user messages (excluding system messages)
            const userMessages = conversation.messages.filter(msg => msg.role === 'user');
            return userMessages.length === 0;
        } catch (error) {
            return false;
        }
    }

    /**
     * Find the highest ID conversation that is blank (has no user messages)
     * @returns Conversation ID of the highest blank conversation, or null if none found
     */
    public async findHighestBlankConversation(): Promise<number | null> {
        try {
            const conversations = await this.listConversations();
            if (conversations.length === 0) {
                return null;
            }
            
            // Sort by ID descending to find highest first
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

    /**
     * @param conversationInfo Conversation info to update
     */
    private async updateConversationNamesCSV(conversationInfo: ConversationInfo): Promise<void> {
        const conversationNamesPath = joinPath(this.storageRoot, 'conversation_names.csv');
        
        try {
            // Read existing CSV content
            const content = await this.fileService.readFile(conversationNamesPath);
            const lines = content.value.toString().split('\n');
            
            // Find if conversation already exists
            let found = false;
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const parts = lines[i].split(',');
                    const existingId = parseInt(parts[0], 10);
                    
                    if (existingId === conversationInfo.id) {
                        // Update existing entry (escape quotes in name for CSV format)
                        const escapedName = conversationInfo.name.replace(/"/g, '""');
                        lines[i] = `${conversationInfo.id},"${escapedName}"`;
                        found = true;
                        break;
                    }
                }
            }
            
            // If not found, add new entry
            if (!found) {
                // Escape quotes in name for CSV format
                const escapedName = conversationInfo.name.replace(/"/g, '""');
                lines.push(`${conversationInfo.id},"${escapedName}"`);
            }
            
            // Write back to file
            await this.fileService.writeFile(
                conversationNamesPath,
                VSBuffer.fromString(lines.join('\n'))
            );
        } catch (error) {
            // If file doesn't exist, create it with headers and this entry
            const escapedName = conversationInfo.name.replace(/"/g, '""');
            const csvContent = `conversation_id,name\n${conversationInfo.id},"${escapedName}"\n`;
            await this.fileService.writeFile(conversationNamesPath, VSBuffer.fromString(csvContent));
        }
    }

    /**
     * @param id Conversation ID
     * @returns Conversation name
     */
    private async getConversationName(id: number): Promise<string> {
        const conversationNamesPath = joinPath(this.storageRoot, 'conversation_names.csv');
        
        try {
            const content = await this.fileService.readFile(conversationNamesPath);
            const lines = content.value.toString().split('\n');
            
            // Skip header line, look for matching conversation ID
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
            // File doesn't exist or can't read - return default
        }
        
        return 'New conversation'; 
    }

    /**
     * Add a user message to the current conversation
     * @param content Message content
     * @param metadata Optional message metadata
     * @returns Message ID
     */
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
        
        // Add to message store and conversation
        this.messageStore.addMessageWithId(message);

        // Update conversation messages
        this.currentConversation.messages = this.messageStore.getAllMessages();
        this.currentConversation.info.message_count = this.messageStore.getMessageCount();
        this.currentConversation.info.updated_at = new Date().toISOString();

        // Save to disk asynchronously
        this.saveConversationLog(this.currentConversation);

        return messageId;
    }

    /**
     * Add an assistant message to the current conversation
     * @param content Message content
     * @param metadata Optional message metadata
     * @returns Message ID
     */
    public addAssistantMessage(content: string, metadata?: MessageMetadata): number {
        if (!this.currentConversation) {
            throw new Error('No active conversation');
        }

        if (!this.messageIdGenerator) {
            throw new Error('Message ID generator not set');
        }

        // Generate new message ID using external generator
        const messageId = this.messageIdGenerator();
        
        // Create complete message with proper ID
        const assistantMessage: ConversationMessage = {
            id: messageId,
            role: 'assistant',
            content: content,
            timestamp: new Date().toISOString(),
            ...metadata
        };

        // Add the message to the store using addMessageWithId
        this.messageStore.addMessageWithId(assistantMessage);

        // Update conversation messages
        this.currentConversation.messages = this.messageStore.getAllMessages();
        this.currentConversation.info.message_count = this.messageStore.getMessageCount();
        this.currentConversation.info.updated_at = new Date().toISOString();

        // Save to disk asynchronously
        this.saveConversationLog(this.currentConversation);

        return messageId;
    }

    /**
     * Update a message in the current conversation
     * @param id Message ID
     * @param updates Partial message updates
     * @returns True if update was successful
     */
    public updateMessage(id: number, updates: Partial<ConversationMessage>): boolean {
        if (!this.currentConversation) {
            return false;
        }

        const success = this.messageStore.updateMessage(id, updates);
        if (success) {
            // Update conversation messages
            this.currentConversation.messages = this.messageStore.getAllMessages();
            this.currentConversation.info.updated_at = new Date().toISOString();

            // Save to disk asynchronously
            this.saveConversationLog(this.currentConversation);
        }

        return success;
    }



    /**
     * Get all messages from the current conversation
     * @returns Array of messages
     */
    public getCurrentMessages(): ConversationMessage[] {
        return this.messageStore.getAllMessages();
    }

    /**
     * Get visible messages (non-procedural) from the current conversation
     * @returns Array of visible messages
     */
    public getVisibleMessages(): ConversationMessage[] {
        return this.messageStore.getVisibleMessages();
    }

    /**
     * Start streaming a new assistant message
     * @param initialContent Initial content (can be empty)
     * @returns Streaming message object
     */
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

    /**
     * This ensures correct ID ordering when text comes before function calls
     */
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

    /**
     * Update the streaming message content
     * @param content New content to append or replace
     * @param append Whether to append or replace content
     */
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

    /**
     * Add function call to streaming message
     * @param functionCall Function call data
     */
    // Function calls are always saved as separate assistant messages

    /**
     * Complete the streaming message and add it to the conversation
     * @param metadata Optional message metadata
     * @param contentProcessor Optional function to process the final content (e.g., for thinking tags)
     * @returns Final message ID
     */
    public completeStreamingMessage(metadata?: MessageMetadata, contentProcessor?: (content: string) => string): number {
        if (!this.currentConversation?.streaming) {
            throw new Error('No active streaming message');
        }

        const streamingMessage = this.currentConversation.streaming;
        
        // Use the streaming message's pre-allocated ID if it has one, otherwise generate new ID
        const messageId = streamingMessage.id || (this.messageIdGenerator ? this.messageIdGenerator() : 0);
        
        // Process content if processor is provided
        const finalContent = contentProcessor ? contentProcessor(streamingMessage.content) : streamingMessage.content;
        
        // Create complete message with proper ID
        const completedMessage: ConversationMessage = {
            id: messageId,
            role: 'assistant',
            content: finalContent,
            timestamp: new Date().toISOString(),
            function_call: streamingMessage.function_call,
            ...metadata
        };

        // Add the completed message to the store using addMessageWithId
        this.messageStore.addMessageWithId(completedMessage);

        // Update conversation
        this.currentConversation.messages = this.messageStore.getAllMessages();
        this.currentConversation.info.message_count = this.messageStore.getMessageCount();
        this.currentConversation.info.updated_at = new Date().toISOString();
        
        // Clear streaming state
        this.currentConversation.streaming = undefined;

        // Save to disk asynchronously
        this.saveConversationLog(this.currentConversation);

        return messageId;
    }

    /**
     * Cancel the current streaming message - preserves accumulated content like Rao
     */
    public cancelStreamingMessage(): void {
        if (this.currentConversation?.streaming) {
            const streamingMessage = this.currentConversation.streaming;
            
            // If there's accumulated content, preserve it by completing the message
            if (streamingMessage.content && streamingMessage.content.trim().length > 0) {
                console.log(`[DEBUG CANCEL] Preserving streaming content: "${streamingMessage.content.substring(0, 50)}..."`);
                try {
                    // Complete the streaming message to preserve content in conversation log
                    this.completeStreamingMessage({
                        cancelled: true  // Mark as cancelled for potential UI indication
                    }, undefined); // No content processor needed for cancelled messages
                    console.log(`[DEBUG CANCEL] Streaming content preserved in conversation log`);
                    return; // completeStreamingMessage already clears the streaming state
                } catch (error) {
                    console.error('Failed to preserve streaming content:', error);
                    // Fall through to just clear streaming state
                }
            } else {
                console.log(`[DEBUG CANCEL] No content to preserve, just clearing streaming state`);
            }
            
            // Clear streaming state (either no content to preserve or completion failed)
            this.currentConversation.streaming = undefined;
        }
    }

    /**
     * Get the current streaming message (for manual completion)
     */
    public getCurrentStreamingMessage(): StreamingMessage | undefined {
        return this.currentConversation?.streaming;
    }

    /**
     * Add a message with a specific pre-allocated ID
     */
    public addMessageWithSpecificId(message: ConversationMessage): void {
        if (!this.currentConversation) {
            throw new Error('No active conversation');
        }
        
        this.messageStore.addMessageWithId(message);
        this.currentConversation.messages = this.messageStore.getAllMessages();
        this.currentConversation.info.message_count = this.messageStore.getMessageCount();
        this.currentConversation.info.updated_at = new Date().toISOString();
        
        // Save to disk asynchronously
        this.saveConversationLog(this.currentConversation);
    }

    /**
     * Clear streaming state without completing the message
     */
    public clearStreaming(): void {
        if (this.currentConversation?.streaming) {
            this.currentConversation.streaming = undefined;
        }
    }

    /**
     * Check if a conversation should get an AI-generated name
     * @param conversationId Conversation ID to check
     * @returns True if conversation should get an AI-generated name
     */
    public async shouldPromptForName(conversationId: number): Promise<boolean> {
        try {
            // Get current conversation name
            const currentName = await this.getConversationName(conversationId);
            
            // If conversation already has a real name (not default), never prompt
            if (currentName !== 'New conversation' && !/^New conversation \d+$/.test(currentName)) {
                return false;
            }
            
            // If conversation has default name, check if it has enough content
            if (currentName === 'New conversation' || /^New conversation \d+$/.test(currentName)) {
                const conversation = await this.loadConversation(conversationId);
                if (!conversation) {
                    return false;
                }
                
                // Count user and assistant messages
                const userMessages = conversation.messages.filter(msg => msg.role === 'user').length;
                const assistantMessages = conversation.messages.filter(msg => msg.role === 'assistant').length;
                
                // Require at least 1 user message and 1 assistant response for naming
                const shouldPrompt = userMessages >= 1 && assistantMessages >= 1;
                return shouldPrompt;
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Generate an AI-powered conversation name from conversation content
     * @param conversationId Conversation ID to generate name for
     * @param backendClient Backend client to use for AI generation
     * @returns Generated conversation name or null if generation fails
     */
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

            // Call backend for AI-generated name
            const generatedName = await backendClient.generateConversationName(userAssistantMessages);
            
            if (!generatedName) {
                return null;
            }

            const cleanedName = generatedName.replace(/["'`]/g, '').trim();
            
            if (cleanedName.length > 0 && cleanedName !== 'New conversation') {
                // Update the conversation name
                await this.renameConversation(conversationId, cleanedName);
                return cleanedName;
            }
            
            return null;
        } catch (error) {
            console.error('Failed to generate AI conversation name:', error);
            return null; 
        }
    }

    /**
     * Generate a conversation name from the first user message (basic fallback)
     * @param firstMessage First user message content
     * @returns Generated conversation name
     */
    public generateConversationName(firstMessage: string): string {
        // Take first 50 characters and clean up
        let name = firstMessage.substring(0, 50).trim();
        
        // Remove newlines and multiple spaces
        name = name.replace(/\s+/g, ' ');
        
        // Add ellipsis if truncated
        if (firstMessage.length > 50) {
            name += '...';
        }
        
        return name || 'New Conversation';
    }
}
