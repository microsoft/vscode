/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';

/**
 * Conversation Variable Manager for Erdos AI
 * Manages conversation-specific variables that persist across conversation switches
 */
export class ConversationVariableManager {
    private conversationVariableCache: Map<string, any> = new Map();
    private currentCachedConversationId: number | null = null;
    private storageRoot: URI;

    constructor(
        private readonly fileService: IFileService,
        private readonly environmentService: IEnvironmentService,
        private readonly workspaceContextService: IWorkspaceContextService
    ) {
        // Use same storage root as conversation manager
        const workspace = this.workspaceContextService.getWorkspace();
        const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
        const workspaceId = this.workspaceContextService.getWorkspace().id;
        
        this.storageRoot = isEmptyWindow ?
            URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
            URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');

        this.initializeConversationVariableCache();
    }

    /**
     * Initialize conversation variable cache
     */
    private initializeConversationVariableCache(): void {
        if (!this.conversationVariableCache) {
            this.conversationVariableCache = new Map();
        }
        if (this.currentCachedConversationId === undefined) {
            this.currentCachedConversationId = null;
        }
    }

    /**
     * Get list of conversation-specific variables
     */
    private getConversationSpecificVariables(): string[] {
        return [
            "active_api_request_id",
            "ai_cancelled",
            "tracking_plots",
            "previous_plots",
            "previous_device", 
            "previous_plot_record",
            "plot_info",
            "function_call_depth",
            "ai_in_error",
            "context_items",
            "assistant_message_count",
            "preallocated_message_ids"
        ];
    }

    /**
     * Store conversation variables to file
     */
    public async storeConversationVariables(conversationId: number): Promise<void> {
        await this.saveConversationVariablesToFile(conversationId);
    }

    /**
     * Load conversation variables from file
     */
    public async loadConversationVariables(conversationId: number): Promise<void> {
        await this.ensureConversationVariablesLoaded(conversationId);
    }

    /**
     * Initialize conversation defaults
     */
    public initializeConversationDefaults(): void {
        this.initializeConversationDefaultsInCache();
    }

    /**
     * Clear conversation variables
     */
    public clearConversationVariables(): void {
        this.conversationVariableCache.clear();
        this.currentCachedConversationId = null;
    }

    /**
     * Set conversation variable
     */
    public setConversationVar(varName: string, value: any): boolean {
        this.initializeConversationVariableCache();
        
        // Validate variable name is in the allowed list
        const allowedVars = this.getConversationSpecificVariables();
        if (!allowedVars.includes(varName)) {
            throw new Error(`Variable '${varName}' is not a recognized conversation variable`);
        }
        
        this.conversationVariableCache.set(varName, value);
        return true;
    }

    /**
     * Get conversation variable
     */
    public getConversationVar(varName: string, defaultValue?: any): any {
        this.initializeConversationVariableCache();
        
        if (this.conversationVariableCache.has(varName)) {
            return this.conversationVariableCache.get(varName);
        }
        
        return defaultValue;
    }

    /**
     * Check if conversation variable exists
     */
    public conversationVarExists(varName: string): boolean {
        this.initializeConversationVariableCache();
        return this.conversationVariableCache.has(varName);
    }

    /**
     * Remove conversation variable
     */
    public removeConversationVar(varName: string): boolean {
        this.initializeConversationVariableCache();
        
        if (this.conversationVariableCache.has(varName)) {
            this.conversationVariableCache.delete(varName);
            return true;
        }
        
        return false;
    }

    /**
     * Set conversation variable in cache
     */
    public setConversationVarInCache(varName: string, value: any): boolean {
        this.initializeConversationVariableCache();
        this.conversationVariableCache.set(varName, value);
        return true;
    }

    /**
     * Save conversation variables to file
     */
    private async saveConversationVariablesToFile(conversationId: number): Promise<boolean> {
        this.initializeConversationVariableCache();
        
        const conversationsDir = URI.joinPath(this.storageRoot, 'conversations');
        const conversationDir = URI.joinPath(conversationsDir, `conversation_${conversationId}`);
        
        // Ensure directory exists
        try {
            await this.fileService.createFolder(conversationDir);
        } catch (error) {
            // Directory might already exist
        }
        
        const varsFile = URI.joinPath(conversationDir, 'conversation_vars.json');
        
        // Convert Map to object for JSON serialization
        const varsValues: Record<string, any> = {};
        for (const [key, value] of this.conversationVariableCache) {
            varsValues[key] = value;
        }
        
        try {
            const content = JSON.stringify(varsValues, null, 2);
            await this.fileService.writeFile(varsFile, VSBuffer.fromString(content));
            return true;
        } catch (error) {
            // Silently handle save errors - variables will be initialized with defaults
            return false;
        }
    }

    /**
     * Load conversation variables from file
     */
    private async loadConversationVariablesFromFile(conversationId: number): Promise<boolean> {
        this.initializeConversationVariableCache();
        
        const conversationsDir = URI.joinPath(this.storageRoot, 'conversations');
        const conversationDir = URI.joinPath(conversationsDir, `conversation_${conversationId}`);
        const varsFile = URI.joinPath(conversationDir, 'conversation_vars.json');
        
        try {
            const exists = await this.fileService.exists(varsFile);
            if (!exists) {
                this.initializeConversationDefaultsInCache();
                return true;
            }
            
            const content = await this.fileService.readFile(varsFile);
            const varsValues = JSON.parse(content.value.toString());
            
            // Load variables into cache
            this.conversationVariableCache.clear();
            for (const [varName, value] of Object.entries(varsValues)) {
                this.conversationVariableCache.set(varName, value);
            }
            
            return true;
        } catch (error) {
            // Initialize defaults when loading fails - this is expected for new conversations
            this.initializeConversationDefaultsInCache();
            return false;
        }
    }

    /**
     * Initialize conversation defaults in cache
     */
    private initializeConversationDefaultsInCache(): void {
        // Clear existing cache
        this.conversationVariableCache.clear();
        
        // Set default values for conversation variables
        this.conversationVariableCache.set("active_api_request_id", null);
        this.conversationVariableCache.set("ai_cancelled", false);
        // All widget functionality has been removed from Erdos AI
        this.conversationVariableCache.set("tracking_plots", false);
        this.conversationVariableCache.set("previous_plots", []);
        this.conversationVariableCache.set("previous_device", null);
        this.conversationVariableCache.set("previous_plot_record", null);
        this.conversationVariableCache.set("plot_info", null);
        this.conversationVariableCache.set("function_call_depth", 0);
        this.conversationVariableCache.set("ai_in_error", false);
        this.conversationVariableCache.set("context_items", []);
        this.conversationVariableCache.set("assistant_message_count", 0);
        this.conversationVariableCache.set("preallocated_message_ids", {});
    }

    /**
     * Ensure conversation variables are loaded for the given conversation
     */
    private async ensureConversationVariablesLoaded(conversationId: number): Promise<void> {
        // If we already have this conversation loaded, nothing to do
        if (this.currentCachedConversationId === conversationId) {
            return;
        }
        
        // Save current conversation variables if we have a different conversation loaded
        if (this.currentCachedConversationId !== null && this.currentCachedConversationId !== conversationId) {
            await this.saveConversationVariablesToFile(this.currentCachedConversationId);
        }
        
        // Load variables for the new conversation
        await this.loadConversationVariablesFromFile(conversationId);
        
        // Update current conversation ID
        this.currentCachedConversationId = conversationId;
    }

    /**
     * Get current cached conversation ID
     */
    public getCurrentCachedConversationId(): number | null {
        return this.currentCachedConversationId;
    }

    /**
     * Force save current conversation variables
     */
    public async forceSaveCurrentConversationVariables(): Promise<boolean> {
        if (this.currentCachedConversationId !== null) {
            return await this.saveConversationVariablesToFile(this.currentCachedConversationId);
        }
        return false;
    }

    /**
     * Switch to a different conversation's variables
     */
    public async switchToConversation(conversationId: number): Promise<void> {
        await this.ensureConversationVariablesLoaded(conversationId);
    }

    /**
     * Get all current conversation variables (for debugging)
     */
    public getAllConversationVars(): Record<string, any> {
        const result: Record<string, any> = {};
        for (const [key, value] of this.conversationVariableCache) {
            result[key] = value;
        }
        return result;
    }
}
