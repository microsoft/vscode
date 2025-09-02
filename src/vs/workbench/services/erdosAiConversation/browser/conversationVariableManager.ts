/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConversationVariableManager } from '../common/conversationVariableManager.js';

export class ConversationVariableManager extends Disposable implements IConversationVariableManager {
    readonly _serviceBrand: undefined;
    private conversationVariableCache: Map<string, any> = new Map();
    private currentCachedConversationId: number | null = null;
    private storageRoot: URI;

    constructor(
        @IFileService private readonly fileService: IFileService,
        @IEnvironmentService private readonly environmentService: IEnvironmentService,
        @IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
    ) {
        super();
        const workspace = this.workspaceContextService.getWorkspace();
        const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
        const workspaceId = this.workspaceContextService.getWorkspace().id;
        
        this.storageRoot = isEmptyWindow ?
            URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
            URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');

        this.initializeConversationVariableCache();
    }

    private initializeConversationVariableCache(): void {
        if (!this.conversationVariableCache) {
            this.conversationVariableCache = new Map();
        }
        if (this.currentCachedConversationId === undefined) {
            this.currentCachedConversationId = null;
        }
    }

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
            "preallocated_message_ids",
            "first_function_call_id"
        ];
    }

    public async storeConversationVariables(conversationId: number): Promise<void> {
        await this.saveConversationVariablesToFile(conversationId);
    }

    public async loadConversationVariables(conversationId: number): Promise<void> {
        await this.ensureConversationVariablesLoaded(conversationId);
    }

    public initializeConversationDefaults(): void {
        this.initializeConversationDefaultsInCache();
    }

    public clearConversationVariables(): void {
        this.conversationVariableCache.clear();
        this.currentCachedConversationId = null;
    }

    public setConversationVar(varName: string, value: any): boolean {
        this.initializeConversationVariableCache();
        
        const allowedVars = this.getConversationSpecificVariables();
        if (!allowedVars.includes(varName)) {
            throw new Error(`Variable '${varName}' is not a recognized conversation variable`);
        }
        
        this.conversationVariableCache.set(varName, value);
        return true;
    }

    public getConversationVar(varName: string, defaultValue?: any): any {
        this.initializeConversationVariableCache();
        
        if (this.conversationVariableCache.has(varName)) {
            return this.conversationVariableCache.get(varName);
        }
        
        return defaultValue;
    }

    public conversationVarExists(varName: string): boolean {
        this.initializeConversationVariableCache();
        return this.conversationVariableCache.has(varName);
    }

    public removeConversationVar(varName: string): boolean {
        this.initializeConversationVariableCache();
        
        if (this.conversationVariableCache.has(varName)) {
            this.conversationVariableCache.delete(varName);
            return true;
        }
        
        return false;
    }

    public setConversationVarInCache(varName: string, value: any): boolean {
        this.initializeConversationVariableCache();
        this.conversationVariableCache.set(varName, value);
        return true;
    }

    private async saveConversationVariablesToFile(conversationId: number): Promise<boolean> {
        this.initializeConversationVariableCache();
        
        const conversationsDir = URI.joinPath(this.storageRoot, 'conversations');
        const conversationDir = URI.joinPath(conversationsDir, `conversation_${conversationId}`);
        
        try {
            await this.fileService.createFolder(conversationDir);
        } catch (error) {
        }
        
        const varsFile = URI.joinPath(conversationDir, 'conversation_vars.json');
        
        const varsValues: Record<string, any> = {};
        for (const [key, value] of this.conversationVariableCache) {
            varsValues[key] = value;
        }
        
        try {
            const content = JSON.stringify(varsValues, null, 2);
            await this.fileService.writeFile(varsFile, VSBuffer.fromString(content));
            return true;
        } catch (error) {
            return false;
        }
    }

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
            
            this.conversationVariableCache.clear();
            for (const [varName, value] of Object.entries(varsValues)) {
                this.conversationVariableCache.set(varName, value);
            }
            
            return true;
        } catch (error) {
            this.initializeConversationDefaultsInCache();
            return false;
        }
    }

    private initializeConversationDefaultsInCache(): void {
        this.conversationVariableCache.clear();
        
        this.conversationVariableCache.set("active_api_request_id", null);
        this.conversationVariableCache.set("ai_cancelled", false);
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

    private async ensureConversationVariablesLoaded(conversationId: number): Promise<void> {
        if (this.currentCachedConversationId === conversationId) {
            return;
        }
        
        if (this.currentCachedConversationId !== null && this.currentCachedConversationId !== conversationId) {
            await this.saveConversationVariablesToFile(this.currentCachedConversationId);
        }
        
        await this.loadConversationVariablesFromFile(conversationId);
        
        this.currentCachedConversationId = conversationId;
    }

    public getCurrentCachedConversationId(): number | null {
        return this.currentCachedConversationId;
    }

    public async forceSaveCurrentConversationVariables(): Promise<boolean> {
        if (this.currentCachedConversationId !== null) {
            return await this.saveConversationVariablesToFile(this.currentCachedConversationId);
        }
        return false;
    }

    public async switchToConversation(conversationId: number): Promise<void> {
        await this.ensureConversationVariablesLoaded(conversationId);
    }

    public getAllConversationVars(): Record<string, any> {
        const result: Record<string, any> = {};
        for (const [key, value] of this.conversationVariableCache) {
            result[key] = value;
        }
        return result;
    }
}
