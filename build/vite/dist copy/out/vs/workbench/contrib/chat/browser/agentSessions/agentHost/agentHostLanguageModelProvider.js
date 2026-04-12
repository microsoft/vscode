/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
/**
 * Exposes models available from the agent host process as selectable
 * language models in the chat model picker. Models are provided from
 * root state (via {@link IAgentInfo.models}) rather than via RPC.
 */
export class AgentHostLanguageModelProvider extends Disposable {
    constructor(_sessionType, _vendor) {
        super();
        this._sessionType = _sessionType;
        this._vendor = _vendor;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._models = [];
    }
    /**
     * Called by {@link AgentHostContribution} when models change in root state.
     */
    updateModels(models) {
        this._models = models;
        this._onDidChange.fire();
    }
    async provideLanguageModelChatInfo(_options, _token) {
        return this._models
            .filter(m => m.policyState !== 'disabled')
            .map(m => ({
            identifier: `${this._vendor}:${m.id}`,
            metadata: {
                extension: new ExtensionIdentifier('vscode.agent-host'),
                name: m.name,
                id: m.id,
                vendor: this._vendor,
                version: '1.0',
                family: m.id,
                maxInputTokens: m.maxContextWindow ?? 0,
                maxOutputTokens: 0,
                isDefaultForLocation: {},
                isUserSelectable: true,
                modelPickerCategory: undefined,
                targetChatSessionType: this._sessionType,
                capabilities: {
                    vision: m.supportsVision ?? false,
                    toolCalling: true,
                    agentMode: true,
                },
            },
        }));
    }
    async sendChatRequest() {
        throw new Error('Agent-host models do not support direct chat requests');
    }
    async provideTokenCount() {
        return 0;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0TGFuZ3VhZ2VNb2RlbFByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdExhbmd1YWdlTW9kZWxQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBSWpHOzs7O0dBSUc7QUFDSCxNQUFNLE9BQU8sOEJBQStCLFNBQVEsVUFBVTtJQU03RCxZQUNrQixZQUFvQixFQUNwQixPQUFlO1FBRWhDLEtBQUssRUFBRSxDQUFDO1FBSFMsaUJBQVksR0FBWixZQUFZLENBQVE7UUFDcEIsWUFBTyxHQUFQLE9BQU8sQ0FBUTtRQVBoQixpQkFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQzNELGdCQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUM7UUFFdkMsWUFBTyxHQUFpQyxFQUFFLENBQUM7SUFPbkQsQ0FBQztJQUVEOztPQUVHO0lBQ0gsWUFBWSxDQUFDLE1BQW9DO1FBQ2hELElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDMUIsQ0FBQztJQUVELEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxRQUFpQixFQUFFLE1BQXlCO1FBQzlFLE9BQU8sSUFBSSxDQUFDLE9BQU87YUFDakIsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsS0FBSyxVQUFVLENBQUM7YUFDekMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNWLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxDQUFDLEVBQUUsRUFBRTtZQUNyQyxRQUFRLEVBQUU7Z0JBQ1QsU0FBUyxFQUFFLElBQUksbUJBQW1CLENBQUMsbUJBQW1CLENBQUM7Z0JBQ3ZELElBQUksRUFBRSxDQUFDLENBQUMsSUFBSTtnQkFDWixFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUU7Z0JBQ1IsTUFBTSxFQUFFLElBQUksQ0FBQyxPQUFPO2dCQUNwQixPQUFPLEVBQUUsS0FBSztnQkFDZCxNQUFNLEVBQUUsQ0FBQyxDQUFDLEVBQUU7Z0JBQ1osY0FBYyxFQUFFLENBQUMsQ0FBQyxnQkFBZ0IsSUFBSSxDQUFDO2dCQUN2QyxlQUFlLEVBQUUsQ0FBQztnQkFDbEIsb0JBQW9CLEVBQUUsRUFBRTtnQkFDeEIsZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsbUJBQW1CLEVBQUUsU0FBUztnQkFDOUIscUJBQXFCLEVBQUUsSUFBSSxDQUFDLFlBQVk7Z0JBQ3hDLFlBQVksRUFBRTtvQkFDYixNQUFNLEVBQUUsQ0FBQyxDQUFDLGNBQWMsSUFBSSxLQUFLO29CQUNqQyxXQUFXLEVBQUUsSUFBSTtvQkFDakIsU0FBUyxFQUFFLElBQUk7aUJBQ2Y7YUFDRDtTQUNELENBQUMsQ0FBQyxDQUFDO0lBQ04sQ0FBQztJQUVELEtBQUssQ0FBQyxlQUFlO1FBQ3BCLE1BQU0sSUFBSSxLQUFLLENBQUMsdURBQXVELENBQUMsQ0FBQztJQUMxRSxDQUFDO0lBRUQsS0FBSyxDQUFDLGlCQUFpQjtRQUN0QixPQUFPLENBQUMsQ0FBQztJQUNWLENBQUM7Q0FDRCJ9