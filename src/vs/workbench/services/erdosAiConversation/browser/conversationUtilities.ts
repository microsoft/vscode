/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileSystemUtils } from '../../erdosAiUtils/common/fileSystemUtils.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { ConversationLogEntry, IConversationUtilities } from '../common/conversationUtilities.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export class ConversationUtilities extends Disposable implements IConversationUtilities {
    readonly _serviceBrand: undefined;
    private currentConversationIndex: number = 1;

    constructor(
        @IFileSystemUtils private readonly fileSystemUtils: IFileSystemUtils,
        @IEnvironmentService private readonly environmentService: IEnvironmentService,
        @IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
        @ICommonUtils private readonly commonUtils: ICommonUtils
    ) {
        super();
        this.initializeConversationIndex();
    }

    getCurrentConversationIndex(): number {
        if (this.currentConversationIndex < 1) {
            throw new Error('No current conversation index');
        }
        return this.currentConversationIndex;
    }

    setCurrentConversationIndex(index: number): boolean {
        if (!Number.isInteger(index) || index < 1) {
            throw new Error('Conversation index must be a positive integer');
        }
        this.currentConversationIndex = index;
        return true;
    }

    async findHighestConversationIndex(): Promise<number> {
        try {
            const baseAiDir = await this.getAiBaseDir();
            const conversationsDir = this.commonUtils.joinPath(baseAiDir, 'conversations');

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

    private async getAiBaseDir(): Promise<string> {
        // Follow the same pattern as ConversationManager for storage location
        const workspace = this.workspaceContextService.getWorkspace();
        const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
        const workspaceId = workspace.id;
        
        const storageRoot = isEmptyWindow ?
            this.commonUtils.joinPath(this.environmentService.userRoamingDataHome.fsPath, 'emptyWindowErdosAi') :
            this.commonUtils.joinPath(this.environmentService.workspaceStorageHome.fsPath, workspaceId, 'erdosAi');
            
        return storageRoot;
    }

    async readConversationLog(conversationIndex?: number): Promise<ConversationLogEntry[]> {
        try {
            const index = conversationIndex || this.currentConversationIndex;
            const baseAiDir = await this.getAiBaseDir();
            const conversationDir = this.commonUtils.joinPath(this.commonUtils.joinPath(baseAiDir, 'conversations'), `conversation_${index}`);
            const logPath = this.commonUtils.joinPath(conversationDir, 'conversation_log.json');

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

    async writeConversationLog(log: ConversationLogEntry[], conversationIndex?: number): Promise<boolean> {
        try {
            const index = conversationIndex || this.currentConversationIndex;
            const baseAiDir = await this.getAiBaseDir();
            const conversationDir = this.commonUtils.joinPath(this.commonUtils.joinPath(baseAiDir, 'conversations'), `conversation_${index}`);
            const logPath = this.commonUtils.joinPath(conversationDir, 'conversation_log.json');

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

    async isConversationEmpty(conversationIndex?: number): Promise<boolean> {
        try {
            const log = await this.readConversationLog(conversationIndex);
            return log.length === 0;
        } catch (error) {
            return true;
        }
    }



    async conversationExists(conversationIndex: number): Promise<boolean> {
        try {
            const baseAiDir = await this.getAiBaseDir();
            const conversationDir = this.commonUtils.joinPath(this.commonUtils.joinPath(baseAiDir, 'conversations'), `conversation_${conversationIndex}`);
            return await this.fileSystemUtils.directoryExists(conversationDir);
        } catch (error) {
            return false;
        }
    }

    async createNewConversation(): Promise<number> {
        try {
            const highestIndex = await this.findHighestConversationIndex();
            const newIndex = highestIndex + 1;

            this.setCurrentConversationIndex(newIndex);

            await this.writeConversationLog([]);

            return newIndex;
        } catch (error) {
            return 1;
        }
    }

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

            this.setCurrentConversationIndex(index);

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
