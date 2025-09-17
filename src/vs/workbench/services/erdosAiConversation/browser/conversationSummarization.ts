/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { 
    ConversationMessage,
    ConversationSummaries, 
    SummaryEntry, 
    ConversationPaths
} from '../../erdosAi/common/conversationTypes.js';
import { IBackendClient } from '../../erdosAiBackend/common/backendClient.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConversationSummarization } from '../common/conversationSummarization.js';

export class ConversationSummarization extends Disposable implements IConversationSummarization {
    readonly _serviceBrand: undefined;
    
    constructor(
        @IFileService private readonly fileService: IFileService,
        @IBackendClient private readonly backendClient: IBackendClient
    ) {
        super();
    }

    public countOriginalQueries(conversationLog: ConversationMessage[]): number {
        let count = 0;
        for (const msg of conversationLog) {
            if (msg.role === 'user' && msg.original_query === true) {
                count++;
            }
        }
        return count;
    }

    public extractQueryConversationPortion(
        conversationLog: ConversationMessage[], 
        targetQueryNumber: number
    ): ConversationMessage[] {
        const originalQueries: Array<{index: number, id: number, queryNumber: number}> = [];
        
        for (let i = 0; i < conversationLog.length; i++) {
            const msg = conversationLog[i];
            if (msg.role === 'user' && msg.original_query === true) {
                originalQueries.push({
                    index: i,
                    id: msg.id,
                    queryNumber: originalQueries.length + 1
                });
            }
        }
        
        originalQueries.sort((a, b) => a.id - b.id);
        
        let targetQueryInfo = null;
        for (const queryInfo of originalQueries) {
            if (queryInfo.queryNumber === targetQueryNumber) {
                targetQueryInfo = queryInfo;
                break;
            }
        }
        
        if (!targetQueryInfo) {
            console.error(`Could not find target query ${targetQueryNumber}`);
            return [];
        }
        
        const startIndex = targetQueryInfo.index;
        
        let endIndex = conversationLog.length - 1;
        for (const queryInfo of originalQueries) {
            if (queryInfo.queryNumber === targetQueryNumber + 1) {
                endIndex = queryInfo.index - 1;
                break;
            }
        }
        
        if (startIndex <= endIndex) {
            return conversationLog.slice(startIndex, endIndex + 1);
        } else {
            return [];
        }
    }

    public shouldTriggerSummarization(conversationLog: ConversationMessage[]): boolean {
        const queryCount = this.countOriginalQueries(conversationLog);
        const shouldTrigger = queryCount >= 2;
        return shouldTrigger;
    }

    public async getHighestSummarizedQuery(conversationPaths: ConversationPaths): Promise<number> {
        const summaries = await this.loadConversationSummaries(conversationPaths);
        if (Object.keys(summaries.summaries).length === 0) {
            return 0;
        }
        
        const queryNumbers = Object.keys(summaries.summaries).map(k => parseInt(k));
        return Math.max(...queryNumbers);
    }

    public async loadConversationSummaries(conversationPaths: ConversationPaths): Promise<ConversationSummaries> {
        const summariesPath = URI.parse(conversationPaths.summariesPath);
        
        try {
            const exists = await this.fileService.exists(summariesPath);
            if (!exists) {
                return { summaries: {} };
            }
            
            const content = await this.fileService.readFile(summariesPath);
            const jsonContent = content.value.toString();
            return JSON.parse(jsonContent);
        } catch (error) {
            return { summaries: {} };
        }
    }

    public async saveConversationSummary(
        conversationPaths: ConversationPaths, 
        queryNumber: number, 
        summaryText: string
    ): Promise<boolean> {
        try {
            const summariesPath = URI.parse(conversationPaths.summariesPath);
            const allSummaries = await this.loadConversationSummaries(conversationPaths);
            
            const summaryEntry: SummaryEntry = {
                query_number: queryNumber,
                timestamp: new Date().toISOString(),
                summary_text: summaryText
            };
            
            allSummaries.summaries[queryNumber.toString()] = summaryEntry;
            
            const jsonContent = JSON.stringify(allSummaries, null, 2);
            await this.fileService.writeFile(summariesPath, VSBuffer.fromString(jsonContent));
            
            return true;
        } catch (error) {
            console.error('Failed to save conversation summary:', error);
            return false;
        }
    }


    public async prepareConversationWithSummaries(
        conversation: ConversationMessage[],
        conversationPaths: ConversationPaths
    ): Promise<{conversation: ConversationMessage[], summary: SummaryEntry | null}> {
        const summaries = await this.loadConversationSummaries(conversationPaths);
        
        const originalQueries: Array<{index: number, id: number, message: ConversationMessage}> = [];
        
        for (let i = 0; i < conversation.length; i++) {
            const msg = conversation[i];
            if (msg.role === 'user' && msg.original_query === true) {
                originalQueries.push({
                    index: i,
                    id: msg.id,
                    message: msg
                });
            }
        }
        
        originalQueries.sort((a, b) => a.id - b.id);
        
        const currentQueryCount = originalQueries.length;
        
        if (currentQueryCount === 0) {
            return { conversation, summary: null };
        }
        
        if (currentQueryCount === 1) {
            const latestOriginalQuery = originalQueries[0];
            const recentConversation = conversation.slice(latestOriginalQuery.index);
            return { conversation: recentConversation, summary: null };
        }
        
        const previousOriginalQuery = originalQueries[currentQueryCount - 2];
        
        const startIndex = previousOriginalQuery.index;
        const recentConversation = conversation.slice(startIndex);
        
        let previousSummary: SummaryEntry | null = null;
        if (Object.keys(summaries.summaries).length > 0 && currentQueryCount > 2) {
            const targetSummaryQuery = currentQueryCount - 2;
            
            if (summaries.summaries[targetSummaryQuery.toString()]) {
                previousSummary = summaries.summaries[targetSummaryQuery.toString()];
            } else {
                const availableQueryNumbers = Object.keys(summaries.summaries).map(k => parseInt(k));
                const maxAllowedQuery = currentQueryCount - 2;
                const validSummaries = availableQueryNumbers.filter(q => q <= maxAllowedQuery);
                
                if (validSummaries.length > 0) {
                    const mostRecentQuery = Math.max(...validSummaries);
                    previousSummary = summaries.summaries[mostRecentQuery.toString()];
                }
            }
        }
        
        return {
            conversation: recentConversation,
            summary: previousSummary
        };
    }

    public async startBackgroundSummarization(
        conversationLog: ConversationMessage[],
        targetQueryNumber: number,
        conversationPaths: ConversationPaths,
        provider: string,
        model: string
    ): Promise<boolean> {
        try {
            const requestId = `summary_${Date.now()}_${Math.floor(Math.random() * 90000) + 10000}`;
            
            const conversationPortion = this.extractQueryConversationPortion(conversationLog, targetQueryNumber);
            
            let previousSummary = null;
            if (targetQueryNumber > 1) {
                const summaries = await this.loadConversationSummaries(conversationPaths);
                const previousSummaryKey = (targetQueryNumber - 1).toString();
                
                if (summaries.summaries[previousSummaryKey]) {
                    previousSummary = summaries.summaries[previousSummaryKey];
                } else if (Object.keys(summaries.summaries).length > 0) {
                    const availableQueryNumbers = Object.keys(summaries.summaries).map(k => parseInt(k));
                    const validSummaries = availableQueryNumbers.filter(q => q < targetQueryNumber);
                    
                    if (validSummaries.length > 0) {
                        const mostRecentQuery = Math.max(...validSummaries);
                        previousSummary = summaries.summaries[mostRecentQuery.toString()];
                    }
                }
            }
            
            this.backendClient.sendBackgroundSummarizationRequest(
                conversationPortion,
                targetQueryNumber,
                previousSummary,
                requestId,
                provider,
                model,
                async (result) => {
                    try {
                        if (result.success && result.summary) {
                            await this.saveConversationSummary(conversationPaths, targetQueryNumber, result.summary);
                        } else {
                            console.error('Background summarization failed:', result.error);
                        }
                    } catch (error) {
                        console.error('Error handling background summarization completion:', error);
                    }
                }
            );
            
            return true;
        } catch (error) {
            console.error('Failed to start background summarization:', error);
            return false;
        }
    }

}
