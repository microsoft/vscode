/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FileSystemUtils } from './fileSystemUtils.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';

/**
 * Interface for conversation log entries
 */
interface ConversationLogEntry {
    id: number;
    role: string;
    content?: string;
    type?: string;
    function_call?: {
        name: string;
        call_id: string;
        arguments?: any;
    };
    call_id?: string;
    output?: string;
    related_to?: number;
}

/**
 * Conversation Utilities for Erdos AI function handlers
 * Provides conversation management and history analysis
 */
export class ConversationUtilities {
    private currentConversationIndex: number = 1;
    private messageIdGenerator?: () => number;

    constructor(
        private readonly fileSystemUtils: FileSystemUtils,
        private readonly environmentService: IEnvironmentService
    ) {
        this.initializeConversationIndex();
    }

    /**
     * Set message ID generator (delegates to main service)
     */
    setMessageIdGenerator(generator: () => number): void {
        this.messageIdGenerator = generator;
    }

    /**
     * Get current conversation index
     */
    getCurrentConversationIndex(): number {
        if (this.currentConversationIndex < 1) {
            throw new Error('No current conversation index');
        }
        return this.currentConversationIndex;
    }

    /**
     * Set current conversation index
     */
    setCurrentConversationIndex(index: number): boolean {
        if (!Number.isInteger(index) || index < 1) {
            throw new Error('Conversation index must be a positive integer');
        }
        this.currentConversationIndex = index;
        return true;
    }

    /**
     * Find highest conversation index
     */
    async findHighestConversationIndex(): Promise<number> {
        try {
            const baseAiDir = await this.getAiBaseDir();
            const conversationsDir = this.fileSystemUtils.joinPath(baseAiDir, 'conversations');

            if (!(await this.fileSystemUtils.directoryExists(conversationsDir))) {
                return 1;
            }

            const allDirs = await this.fileSystemUtils.listFiles(conversationsDir);
            const conversationDirs = allDirs.filter(dir => /^conversation_[0-9]+$/.test(dir));

            if (conversationDirs.length === 0) {
                return 1;
            }

            const indices = conversationDirs.map(dir => {
                const match = dir.match(/^conversation_([0-9]+)$/);
                return match ? parseInt(match[1], 10) : 0;
            }).filter(index => index > 0);

            return Math.max(...indices);
        } catch (error) {
            return 1;
        }
    }

    /**
     * Analyze conversation history for dynamic limits
     */
    async analyzeConversationHistory(filePath: string, currentLog: ConversationLogEntry[]): Promise<{
        prevReadSameFile: boolean;
        prevMaxLines: number;
    }> {
        const baseMaxLines = 50;
        let prevReadSameFile = false;
        let prevMaxLines = baseMaxLines;

        for (let i = currentLog.length - 1; i >= 0; i--) {
            const logEntry = currentLog[i];

            if (logEntry.function_call &&
                logEntry.function_call.name &&
                (logEntry.function_call.name === 'read_file' || logEntry.function_call.name === 'read_file_lines')) {

                let prevArgs: any = null;
                try {
                    prevArgs = logEntry.function_call.arguments;
                } catch (error) {
                    continue;
                }

                const prevFilePath = prevArgs?.filename || prevArgs?.file_path;

                if (prevArgs && prevFilePath && prevFilePath === filePath) {
                    prevReadSameFile = true;

                    for (let j = i; j < currentLog.length; j++) {
                        const outputEntry = currentLog[j];

                        if (outputEntry.type === 'function_call_output' &&
                            outputEntry.call_id === logEntry.function_call.call_id) {

                            const output = outputEntry.output || '';

                            const truncateMatch = output.match(/Truncated due to length at line ([0-9]+)/);
                            if (truncateMatch) {
                                const truncLine = parseInt(truncateMatch[1], 10);
                                const prevStartLine = prevArgs.start_line_one_indexed || prevArgs.start_line;

                                if (!isNaN(truncLine) && prevStartLine != null && truncLine > prevStartLine) {
                                    const lineCount = truncLine - prevStartLine;
                                    if (lineCount > prevMaxLines) {
                                        prevMaxLines = lineCount;
                                    }
                                }
                            } else {
                                const linesMatch = output.match(/Lines ([0-9]+)-([0-9]+)/);
                                if (linesMatch) {
                                    const startLine = parseInt(linesMatch[1], 10);
                                    const endLine = parseInt(linesMatch[2], 10);

                                    if (!isNaN(startLine) && !isNaN(endLine)) {
                                        const lineCount = endLine - startLine + 1;
                                        if (lineCount > prevMaxLines) {
                                            prevMaxLines = lineCount;
                                        }
                                    }
                                }
                            }

                            break;
                        }
                    }
                }
            }
        }

        return {
            prevReadSameFile,
            prevMaxLines
        };
    }

    /**
     * Get next message ID
     * Delegates to main service message ID generator
     */
    getNextMessageId(): number {
        if (!this.messageIdGenerator) {
            throw new Error('Message ID generator not set - call setMessageIdGenerator first');
        }
        return this.messageIdGenerator();
    }

    /**
     * Initialize conversation index
     */
    private async initializeConversationIndex(): Promise<void> {
        try {
            const highestIndex = await this.findHighestConversationIndex();
            if (highestIndex >= 1) {
                this.currentConversationIndex = highestIndex;
            } else {
                this.currentConversationIndex = 1;
            }
        } catch (error) {
            this.currentConversationIndex = 1;
        }
    }

    /**
     * Get AI base directory
     */
    private async getAiBaseDir(): Promise<string> {
        // In a real implementation, this would get the user's AI directory
        // Use the computed conversation base path
        const userHome = await this.getUserHomeDirectory();
        return this.fileSystemUtils.joinPath(this.fileSystemUtils.joinPath(userHome, '.rstudio'), 'ai');
    }

    /**
     * Get user home directory using Erdos's environment service
     */
    private async getUserHomeDirectory(): Promise<string> {
        try {
            // Use Erdos's environment service for proper user home detection
            return this.environmentService.userRoamingDataHome.fsPath;
        } catch (error) {
            // Fallback to environment variables if service fails
            return process.env.HOME || process.env.USERPROFILE || '/tmp';
        }
    }

    /**
     * Read conversation log
     */
    async readConversationLog(conversationIndex?: number): Promise<ConversationLogEntry[]> {
        try {
            const index = conversationIndex || this.currentConversationIndex;
            const baseAiDir = await this.getAiBaseDir();
            const conversationDir = this.fileSystemUtils.joinPath(this.fileSystemUtils.joinPath(baseAiDir, 'conversations'), `conversation_${index}`);
            const logPath = this.fileSystemUtils.joinPath(conversationDir, 'conversation_log.json');

            if (!(await this.fileSystemUtils.fileExists(logPath))) {
                return [];
            }

            const logContent = await this.fileSystemUtils.readFileContent(logPath);
            if (!logContent) {
                return [];
            }

            return JSON.parse(logContent);
        } catch (error) {
            return [];
        }
    }

    /**
     * Write conversation log
     */
    async writeConversationLog(log: ConversationLogEntry[], conversationIndex?: number): Promise<boolean> {
        try {
            const index = conversationIndex || this.currentConversationIndex;
            const baseAiDir = await this.getAiBaseDir();
            const conversationDir = this.fileSystemUtils.joinPath(this.fileSystemUtils.joinPath(baseAiDir, 'conversations'), `conversation_${index}`);
            const logPath = this.fileSystemUtils.joinPath(conversationDir, 'conversation_log.json');

            if (!(await this.fileSystemUtils.directoryExists(conversationDir))) {
                const created = await this.fileSystemUtils.createDirectory(conversationDir);
                if (!created) {
                    return false;
                }
            }

            const logContent = JSON.stringify(log, null, 2);
            return await this.fileSystemUtils.writeFileContent(logPath, logContent);
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if conversation is empty
     */
    async isConversationEmpty(conversationIndex?: number): Promise<boolean> {
        try {
            const log = await this.readConversationLog(conversationIndex);
            return log.length === 0;
        } catch (error) {
            return true;
        }
    }

    /**
     * List conversation indices
     */
    async listConversationIndices(): Promise<number[]> {
        try {
            const baseAiDir = await this.getAiBaseDir();
            const conversationsDir = this.fileSystemUtils.joinPath(baseAiDir, 'conversations');

            if (!(await this.fileSystemUtils.directoryExists(conversationsDir))) {
                return [];
            }

            const allDirs = await this.fileSystemUtils.listFiles(conversationsDir);
            const conversationDirs = allDirs.filter(dir => /^conversation_[0-9]+$/.test(dir));

            const indices = conversationDirs.map(dir => {
                const match = dir.match(/^conversation_([0-9]+)$/);
                return match ? parseInt(match[1], 10) : 0;
            }).filter(index => index > 0);

            return indices.sort((a, b) => a - b);
        } catch (error) {
            return [];
        }
    }

    // REMOVED: resetMessageIdCounter, setMessageIdCounter, getMessageIdCounter
    // Message ID management now delegated to main service

    /**
     * Check if conversation exists
     */
    async conversationExists(conversationIndex: number): Promise<boolean> {
        try {
            const baseAiDir = await this.getAiBaseDir();
            const conversationDir = this.fileSystemUtils.joinPath(this.fileSystemUtils.joinPath(baseAiDir, 'conversations'), `conversation_${conversationIndex}`);
            return await this.fileSystemUtils.directoryExists(conversationDir);
        } catch (error) {
            return false;
        }
    }

    /**
     * Create new conversation
     */
    async createNewConversation(): Promise<number> {
        try {
            const highestIndex = await this.findHighestConversationIndex();
            const newIndex = highestIndex + 1;

            // Initialize new conversation
            this.setCurrentConversationIndex(newIndex);
            // Note: Message ID counter reset handled by main service

            // Create empty conversation log
            await this.writeConversationLog([]);

            return newIndex;
        } catch (error) {
            return 1;
        }
    }

    /**
     * Switch to conversation
     */
    async switchConversation(index: number): Promise<{
        success: boolean;
        message?: string;
        index?: number;
    }> {
        try {
            if (!Number.isInteger(index) || index < 1) {
                return {
                    success: false,
                    message: 'Index must be a positive integer'
                };
            }

            if (!(await this.conversationExists(index))) {
                return {
                    success: false,
                    message: 'Conversation does not exist'
                };
            }

            // Switch to new conversation
            this.setCurrentConversationIndex(index);

            // NOTE: Message ID counter management is handled by main ErdosAiService
            // ConversationUtilities only provides conversation log access

            return {
                success: true,
                index
            };
        } catch (error) {
            return {
                success: false,
                message: `Failed to switch conversation: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}
