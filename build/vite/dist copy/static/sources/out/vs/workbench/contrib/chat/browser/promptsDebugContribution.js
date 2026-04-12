/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PromptsDebugContribution_1;
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatDebugService } from '../common/chatDebugService.js';
import { IChatAgentService } from '../common/participants/chatAgents.js';
import { PromptsType } from '../common/promptSyntax/promptTypes.js';
import { IPromptsService } from '../common/promptSyntax/service/promptsService.js';
/**
 * Bridges prompt discovery information to {@link IChatDebugService}.
 */
let PromptsDebugContribution = class PromptsDebugContribution extends Disposable {
    static { PromptsDebugContribution_1 = this; }
    static { this.ID = 'workbench.contrib.promptsDebug'; }
    static { this.MAX_DISCOVERY_DETAILS = 10_000; }
    constructor(promptsService, chatAgentService, chatDebugService, logService) {
        super();
        this.promptsService = promptsService;
        /**
         * Maps debug event IDs to their discovery info, so that
         * {@link IChatDebugService.resolveEvent} can return rich details.
         */
        this._discoveryEventDetails = new Map();
        // Forward discovery log events to the debug service.
        this._register(chatAgentService.onWillInvokeAgent(async (e) => {
            const sessionResource = e.request.sessionResource;
            const cts = new CancellationTokenSource();
            try {
                const discoveryInfos = await Promise.all([PromptsType.agent, PromptsType.instructions, PromptsType.prompt, PromptsType.skill, PromptsType.hook].map(type => this.promptsService.getDiscoveryInfo(type, cts.token)));
                for (const discoveryInfo of discoveryInfos) {
                    const { name, details } = this.getDiscoveryLogEntry(discoveryInfo);
                    const eventId = generateUuid();
                    this._discoveryEventDetails.set(eventId, discoveryInfo);
                    // Evict oldest entries when the map exceeds the cap.
                    if (this._discoveryEventDetails.size > PromptsDebugContribution_1.MAX_DISCOVERY_DETAILS) {
                        const first = this._discoveryEventDetails.keys().next().value;
                        if (first !== undefined) {
                            this._discoveryEventDetails.delete(first);
                        }
                    }
                    // Enrich details with file paths so they appear in the event
                    // payload (e.g. forwarded via onDidReceiveChatDebugEvent to the
                    // extension's JSONL file logger).
                    const loaded = discoveryInfo.files
                        .filter(f => f.status === 'loaded')
                        .map(f => f.promptPath.name ?? f.promptPath.uri.path.split('/').pop() ?? f.promptPath.uri.toString());
                    const skipped = discoveryInfo.files.filter(f => f.status === 'skipped').map(f => {
                        const label = f.promptPath.uri.toString();
                        return f.skipReason ? `${label} (${f.skipReason})` : label;
                    });
                    const folders = discoveryInfo.sourceFolders?.map(sf => sf.uri.path) ?? [];
                    const parts = [];
                    if (details) {
                        parts.push(details);
                    }
                    if (loaded.length > 0) {
                        parts.push(`loaded: [${truncateList(loaded)}]`);
                    }
                    if (skipped.length > 0) {
                        parts.push(`skipped: [${truncateList(skipped)}]`);
                    }
                    if (folders.length > 0) {
                        parts.push(`folders: [${truncateList(folders)}]`);
                    }
                    const newDetails = parts.join(' | ') || undefined;
                    chatDebugService.log(sessionResource, name, newDetails, undefined, { id: eventId, category: 'discovery' });
                }
            }
            catch (error) {
                logService.error('Error while logging prompt discovery info to chat debug service', error);
            }
            finally {
                cts.dispose();
            }
        }));
        // Register a resolve provider so expanding a discovery event
        // in the Agent Debug Logs shows the full file list.
        this._register(chatDebugService.registerProvider({
            provideChatDebugLog: async () => undefined,
            resolveChatDebugLogEvent: async (eventId) => {
                return this._resolveDiscoveryEvent(eventId);
            }
        }));
    }
    getDiscoveryLogEntry(discoveryInfo) {
        const durationInMillis = discoveryInfo.durationInMillis.toFixed(1);
        const loadedCount = discoveryInfo.files.filter(file => file.status === 'loaded').length;
        const skippedCount = discoveryInfo.files.length - loadedCount;
        switch (discoveryInfo.type) {
            case PromptsType.prompt:
                return {
                    name: localize('promptsService.loadSlashCommands', 'Load Slash Commands'),
                    details: loadedCount === 1
                        ? localize('promptsDebugContribution.resolvedSlashCommand', 'Resolved {0} slash command in {1}ms', loadedCount, durationInMillis)
                        : localize('promptsDebugContribution.resolvedSlashCommands', 'Resolved {0} slash commands in {1}ms', loadedCount, durationInMillis)
                };
            case PromptsType.agent:
                return {
                    name: localize('promptsService.loadAgents', 'Load Agents'),
                    details: loadedCount === 1
                        ? localize('promptsDebugContribution.resolvedAgent', 'Resolved {0} agent in {1}ms', loadedCount, durationInMillis)
                        : localize('promptsDebugContribution.resolvedAgents', 'Resolved {0} agents in {1}ms', loadedCount, durationInMillis)
                };
            case PromptsType.skill:
                return {
                    name: localize('promptsService.loadSkills', 'Load Skills'),
                    details: loadedCount === 1
                        ? localize('promptsDebugContribution.resolvedSkill', 'Resolved {0} skill in {1}ms', loadedCount, durationInMillis)
                        : localize('promptsDebugContribution.resolvedSkills', 'Resolved {0} skills in {1}ms', loadedCount, durationInMillis)
                };
            case PromptsType.instructions:
                return {
                    name: localize('promptsService.loadInstructions', 'Load Instructions'),
                    details: loadedCount === 1
                        ? localize('promptsDebugContribution.resolvedInstruction', 'Resolved {0} instruction in {1}ms', loadedCount, durationInMillis)
                        : localize('promptsDebugContribution.resolvedInstructions', 'Resolved {0} instructions in {1}ms', loadedCount, durationInMillis)
                };
            case PromptsType.hook: {
                const hookDiscoveryInfo = discoveryInfo;
                const hookCount = hookDiscoveryInfo.hooksInfo
                    ? Object.values(hookDiscoveryInfo.hooksInfo.hooks).reduce((total, hooks) => total + hooks.length, 0)
                    : loadedCount;
                const details = skippedCount > 0
                    ? localize('promptsDebugContribution.resolvedHooksWithSkipped', 'Resolved {0} hooks from {1} files in {2}ms, skipped {3}', hookCount, loadedCount, durationInMillis, skippedCount)
                    : hookCount === 1
                        ? localize('promptsDebugContribution.resolvedHook', 'Resolved {0} hook in {1}ms', hookCount, durationInMillis)
                        : localize('promptsDebugContribution.resolvedHooks', 'Resolved {0} hooks in {1}ms', hookCount, durationInMillis);
                return {
                    name: localize('promptsService.loadHooks', 'Load Hooks'),
                    details
                };
            }
        }
    }
    _resolveDiscoveryEvent(eventId) {
        const info = this._discoveryEventDetails.get(eventId);
        if (!info) {
            return undefined;
        }
        return {
            kind: 'fileList',
            discoveryType: info.type,
            durationInMillis: info.durationInMillis,
            files: info.files.map(f => ({
                uri: f.promptPath.uri,
                name: f.promptPath.name,
                status: f.status,
                storage: f.promptPath.storage,
                extensionId: f.promptPath.extension?.identifier.value,
                skipReason: f.skipReason,
                errorMessage: f.errorMessage,
                duplicateOf: f.duplicateOf,
            })),
            sourceFolders: info.sourceFolders?.map(sf => ({
                uri: sf.uri,
                storage: sf.storage,
            })),
        };
    }
};
PromptsDebugContribution = PromptsDebugContribution_1 = __decorate([
    __param(0, IPromptsService),
    __param(1, IChatAgentService),
    __param(2, IChatDebugService),
    __param(3, ILogService)
], PromptsDebugContribution);
export { PromptsDebugContribution };
const MAX_LIST_ITEMS = 100;
/**
 * Join a list of strings, truncating after {@link MAX_LIST_ITEMS} entries.
 * Full details are available via {@link IChatDebugService.resolveEvent}.
 */
function truncateList(items) {
    if (items.length <= MAX_LIST_ITEMS) {
        return items.join(', ');
    }
    return items.slice(0, MAX_LIST_ITEMS).join(', ') + ` (+${items.length - MAX_LIST_ITEMS} more)`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0c0RlYnVnQ29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3Byb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXJFLE9BQU8sRUFBa0MsaUJBQWlCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNsRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDcEUsT0FBTyxFQUE0QyxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUU3SDs7R0FFRztBQUNJLElBQU0sd0JBQXdCLEdBQTlCLE1BQU0sd0JBQXlCLFNBQVEsVUFBVTs7YUFFdkMsT0FBRSxHQUFHLGdDQUFnQyxBQUFuQyxDQUFvQzthQUU5QiwwQkFBcUIsR0FBRyxNQUFNLEFBQVQsQ0FBVTtJQVF2RCxZQUNrQixjQUFnRCxFQUM5QyxnQkFBbUMsRUFDbkMsZ0JBQW1DLEVBQ3pDLFVBQXVCO1FBRXBDLEtBQUssRUFBRSxDQUFDO1FBTDBCLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQVBsRTs7O1dBR0c7UUFDYywyQkFBc0IsR0FBRyxJQUFJLEdBQUcsRUFBZ0Ms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