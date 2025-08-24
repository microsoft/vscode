/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../../platform/files/common/files.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { 
    ConversationMessage, 
    ConversationSummaries, 
    SummaryEntry, 
    BackgroundSummarizationState,
    ConversationPaths
} from './conversationTypes.js';
import { BackendClient } from '../api/backendClient.js';

/**
 * Conversation Summarization Manager for Erdos AI
 * Implements identical background summarization logic to rao codebase
 */
export class ConversationSummarization {
    constructor(
        private readonly fileService: IFileService,
        private readonly backendClient: BackendClient
    ) {}

    /**
     * Count messages with role="user" that have original_query=TRUE
     * Exactly matches rao's count_original_queries function
     */
    public countOriginalQueries(conversationLog: ConversationMessage[]): number {
        let count = 0;
        for (const msg of conversationLog) {
            if (msg.role === 'user' && msg.original_query === true) {
                count++;
            }
        }
        return count;
    }

    /**
     * Trigger summarization if we have 2+ original queries
     * Query N triggers summarization of query N-1, so we start with query 2
     * Exactly matches rao's should_trigger_summarization function
     */
    public shouldTriggerSummarization(conversationLog: ConversationMessage[]): boolean {
        return this.countOriginalQueries(conversationLog) >= 2;
    }

    /**
     * Get highest query number that has been summarized
     * Exactly matches rao's get_highest_summarized_query function
     */
    public async getHighestSummarizedQuery(conversationPaths: ConversationPaths): Promise<number> {
        const summaries = await this.loadConversationSummaries(conversationPaths);
        if (Object.keys(summaries.summaries).length === 0) {
            return 0;
        }
        
        const queryNumbers = Object.keys(summaries.summaries).map(k => parseInt(k));
        return Math.max(...queryNumbers);
    }

    /**
     * Load conversation summaries from summaries.json file
     * Exactly matches rao's load_conversation_summaries function
     */
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

    /**
     * Save conversation summary to summaries.json file
     * Exactly matches rao's save_conversation_summary function
     */
    public async saveConversationSummary(
        conversationPaths: ConversationPaths, 
        queryNumber: number, 
        summaryText: string
    ): Promise<boolean> {
        try {
            const summariesPath = URI.parse(conversationPaths.summariesPath);
            const allSummaries = await this.loadConversationSummaries(conversationPaths);
            
            // Add new summary as text
            const summaryEntry: SummaryEntry = {
                query_number: queryNumber,
                timestamp: new Date().toISOString(),
                summary_text: summaryText
            };
            
            allSummaries.summaries[queryNumber.toString()] = summaryEntry;
            
            // Save back to file
            const jsonContent = JSON.stringify(allSummaries, null, 2);
            await this.fileService.writeFile(summariesPath, VSBuffer.fromString(jsonContent));
            
            return true;
        } catch (error) {
            console.error('Failed to save conversation summary:', error);
            return false;
        }
    }

    /**
     * Extract the conversation portion for a specific target query number
     * Exactly matches rao's extract_query_conversation_portion function
     */
    public extractQueryConversationPortion(
        conversationLog: ConversationMessage[], 
        targetQueryNumber: number
    ): ConversationMessage[] {
        // Find all original queries in ID order
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
        
        // Sort original queries by ID to ensure proper chronological order
        originalQueries.sort((a, b) => a.id - b.id);
        
        // Find the target query
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
        
        // Find the start and end indices for this query's conversation
        const startIndex = targetQueryInfo.index;
        
        // Find the end index (before the next original query, or end of conversation)
        let endIndex = conversationLog.length - 1;
        for (const queryInfo of originalQueries) {
            if (queryInfo.queryNumber === targetQueryNumber + 1) {
                endIndex = queryInfo.index - 1;
                break;
            }
        }
        
        // Extract the conversation portion
        if (startIndex <= endIndex) {
            return conversationLog.slice(startIndex, endIndex + 1);
        } else {
            return [];
        }
    }

    /**
     * Save background summarization state to background_summarization.json
     * Exactly matches rao's save_background_summarization_state function
     */
    public async saveBackgroundSummarizationState(
        conversationPaths: ConversationPaths,
        requestId: string,
        targetQuery: number,
        streamFile: string,
        processId?: number
    ): Promise<boolean> {
        try {
            const statePath = URI.parse(conversationPaths.backgroundSummarizationStatePath);
            
            const state: BackgroundSummarizationState = {
                request_id: requestId,
                target_query: targetQuery,
                stream_file: streamFile,
                process_id: processId,
                timestamp: new Date().toISOString()
            };
            
            const jsonContent = JSON.stringify(state, null, 2);
            await this.fileService.writeFile(statePath, VSBuffer.fromString(jsonContent));
            
            return true;
        } catch (error) {
            console.error('Failed to save background summarization state:', error);
            return false;
        }
    }

    /**
     * Load background summarization state from background_summarization.json
     * Exactly matches rao's load_background_summarization_state function
     */
    public async loadBackgroundSummarizationState(
        conversationPaths: ConversationPaths
    ): Promise<BackgroundSummarizationState | null> {
        try {
            const statePath = URI.parse(conversationPaths.backgroundSummarizationStatePath);
            
            const exists = await this.fileService.exists(statePath);
            if (!exists) {
                return null;
            }
            
            const content = await this.fileService.readFile(statePath);
            const jsonContent = content.value.toString();
            return JSON.parse(jsonContent);
        } catch (error) {
            return null;
        }
    }

    /**
     * Clear background summarization state file
     * Exactly matches rao's clear_background_summarization_state function
     */
    public async clearBackgroundSummarizationState(conversationPaths: ConversationPaths): Promise<void> {
        try {
            const statePath = URI.parse(conversationPaths.backgroundSummarizationStatePath);
            const exists = await this.fileService.exists(statePath);
            if (exists) {
                await this.fileService.del(statePath);
            }
        } catch (error) {
            console.error('Failed to clear background summarization state:', error);
        }
    }

    /**
     * Prepare conversation with existing summaries for API calls
     * Exactly matches rao's prepare_conversation_with_summaries function
     */
    public async prepareConversationWithSummaries(
        conversation: ConversationMessage[],
        conversationPaths: ConversationPaths
    ): Promise<{conversation: ConversationMessage[], summary: SummaryEntry | null}> {
        const summaries = await this.loadConversationSummaries(conversationPaths);
        
        // Find all original queries in ID order
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
        
        // Sort original queries by ID to ensure proper chronological order
        originalQueries.sort((a, b) => a.id - b.id);
        
        const currentQueryCount = originalQueries.length;
        
        if (currentQueryCount === 0) {
            // No original queries found, return original conversation with no summary
            return { conversation, summary: null };
        }
        
        if (currentQueryCount === 1) {
            // Only one original query, keep everything from that query onward
            const latestOriginalQuery = originalQueries[0];
            const recentConversation = conversation.slice(latestOriginalQuery.index);
            return { conversation: recentConversation, summary: null };
        }
        
        // For 2+ original queries, keep the previous query (N-1) and current query (N) plus everything in between
        const previousOriginalQuery = originalQueries[currentQueryCount - 2]; // N-1
        // Current query (N) is available as originalQueries[currentQueryCount - 1] if needed
        
        // Start from the previous original query (N-1)
        const startIndex = previousOriginalQuery.index;
        const recentConversation = conversation.slice(startIndex);
        
        // Get the summary S_{N-2} if it exists, otherwise use most recent available (summary up to query N-2)
        let previousSummary: SummaryEntry | null = null;
        if (Object.keys(summaries.summaries).length > 0 && currentQueryCount > 2) {
            const targetSummaryQuery = currentQueryCount - 2;
            
            // First try to get the exact N-2 summary
            if (summaries.summaries[targetSummaryQuery.toString()]) {
                previousSummary = summaries.summaries[targetSummaryQuery.toString()];
            } else {
                // Fallback: use the most recent available summary (highest query number less than N-1)
                const availableQueryNumbers = Object.keys(summaries.summaries).map(k => parseInt(k));
                // Only use summaries that are older than the previous query (N-1)
                const maxAllowedQuery = currentQueryCount - 2;
                const validSummaries = availableQueryNumbers.filter(q => q <= maxAllowedQuery);
                
                if (validSummaries.length > 0) {
                    const mostRecentQuery = Math.max(...validSummaries);
                    previousSummary = summaries.summaries[mostRecentQuery.toString()];
                }
            }
        }
        
        // Return conversation and summary separately
        return {
            conversation: recentConversation,
            summary: previousSummary
        };
    }

    /**
     * Start background summarization for a specific query
     * Exactly matches rao's start_background_summarization function
     */
    public async startBackgroundSummarization(
        conversationLog: ConversationMessage[],
        targetQueryNumber: number,
        conversationPaths: ConversationPaths
    ): Promise<boolean> {
        try {
            // Generate request ID for summarization exactly like rao
            const requestId = `summary_${Date.now()}_${Math.floor(Math.random() * 90000) + 10000}`;
            
            // Extract the conversation portion for the target query
            const conversationPortion = this.extractQueryConversationPortion(conversationLog, targetQueryNumber);
            
            // Get the previous summary S_{target_query_number - 1} if it exists, otherwise use most recent available
            let previousSummary = null;
            if (targetQueryNumber > 1) {
                const summaries = await this.loadConversationSummaries(conversationPaths);
                const previousSummaryKey = (targetQueryNumber - 1).toString();
                
                // First try to get the exact previous summary
                if (summaries.summaries[previousSummaryKey]) {
                    previousSummary = summaries.summaries[previousSummaryKey];
                } else if (Object.keys(summaries.summaries).length > 0) {
                    // Fallback: use the most recent available summary (highest query number less than target)
                    const availableQueryNumbers = Object.keys(summaries.summaries).map(k => parseInt(k));
                    const validSummaries = availableQueryNumbers.filter(q => q < targetQueryNumber);
                    
                    if (validSummaries.length > 0) {
                        const mostRecentQuery = Math.max(...validSummaries);
                        previousSummary = summaries.summaries[mostRecentQuery.toString()];
                    }
                }
            }
            
            // Save state for tracking
            await this.saveBackgroundSummarizationState(
                conversationPaths,
                requestId,
                targetQueryNumber,
                'in_progress'
            );
            
            // Start async summarization request - this runs in background
            // CRITICAL: Don't await this - it should run in background like rao's callr::r_bg
            this.backendClient.sendBackgroundSummarizationRequest(
                conversationPortion,
                targetQueryNumber,
                previousSummary,
                requestId,
                async (result) => {
                    // Handle completion in background
                    try {
                        await this.clearBackgroundSummarizationState(conversationPaths);
                    } catch (error) {
                        console.error('Error handling background summarization completion:', error);
                        await this.clearBackgroundSummarizationState(conversationPaths);
                    }
                }
            );
            
            return true;
        } catch (error) {
            console.error('Failed to start background summarization:', error);
            return false;
        }
    }

    /**
     * Check if background summarization is complete (non-blocking)
     * Since we use callback-based completion, this mainly checks if there's an active background process
     */
    public async checkPersistentBackgroundSummarization(conversationPaths: ConversationPaths): Promise<boolean> {
        try {
            const state = await this.loadBackgroundSummarizationState(conversationPaths);
            // If no state exists, there's no background process running
            return !state;
        } catch (error) {
            return false;
        }
    }

    /**
     * Wait for persistent background summarization to complete (blocking)
     * Since we use callback-based completion, this waits for the state to be cleared
     */
    public async waitForPersistentBackgroundSummarization(conversationPaths: ConversationPaths): Promise<boolean> {
        try {
            const maxWaitTime = 30000; // 30 seconds max wait
            const pollInterval = 500; // Check every 500ms
            const startTime = Date.now();
            
            while (Date.now() - startTime < maxWaitTime) {
                const state = await this.loadBackgroundSummarizationState(conversationPaths);
                if (!state) {
                    // No background process running - we're done
                    return true;
                }
                
                // Wait before checking again
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
            
            // Timeout - clear state and return false
            await this.clearBackgroundSummarizationState(conversationPaths);
            return false;
        } catch (error) {
            console.error('Error waiting for background summarization:', error);
            await this.clearBackgroundSummarizationState(conversationPaths);
            return false;
        }
    }
}
