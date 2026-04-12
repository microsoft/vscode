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
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import { isSessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { getAgentHostIcon } from '../agentSessions.js';
/**
 * Provides session list items for the chat sessions sidebar by querying
 * active sessions from an agent host connection. Listens to protocol
 * notifications for incremental updates.
 *
 * Works with both local and remote agent host connections via the
 * {@link IAgentConnection} interface.
 */
let AgentHostSessionListController = class AgentHostSessionListController extends Disposable {
    constructor(_sessionType, _provider, _connection, _description, _productService) {
        super();
        this._sessionType = _sessionType;
        this._provider = _provider;
        this._connection = _connection;
        this._description = _description;
        this._productService = _productService;
        this._onDidChangeChatSessionItems = this._register(new Emitter());
        this.onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;
        this._items = [];
        // React to protocol notifications for session list changes
        this._register(this._connection.onDidNotification(n => {
            if (n.type === 'notify/sessionAdded' && n.summary.provider === this._provider) {
                const rawId = AgentSession.id(n.summary.resource);
                const workingDir = typeof n.summary.workingDirectory === 'string' ? URI.parse(n.summary.workingDirectory) : undefined;
                const item = {
                    resource: URI.from({ scheme: this._sessionType, path: `/${rawId}` }),
                    label: n.summary.title ?? `Session ${rawId.substring(0, 8)}`,
                    description: this._description,
                    iconPath: getAgentHostIcon(this._productService),
                    status: 1 /* ChatSessionStatus.Completed */,
                    metadata: this._buildMetadata(workingDir),
                    timing: {
                        created: n.summary.createdAt,
                        lastRequestStarted: n.summary.modifiedAt,
                        lastRequestEnded: n.summary.modifiedAt,
                    },
                };
                this._items.push(item);
                this._onDidChangeChatSessionItems.fire({ addedOrUpdated: [item] });
            }
            else if (n.type === 'notify/sessionRemoved' && AgentSession.provider(n.session) === this._provider) {
                const removedId = AgentSession.id(n.session);
                const idx = this._items.findIndex(item => item.resource.path === `/${removedId}`);
                if (idx >= 0) {
                    const [removed] = this._items.splice(idx, 1);
                    this._onDidChangeChatSessionItems.fire({ removed: [removed.resource] });
                }
            }
        }));
        // Refresh on turnComplete actions for metadata updates (title, timing)
        this._register(this._connection.onDidAction(e => {
            if (e.action.type === 'session/turnComplete' && isSessionAction(e.action) && AgentSession.provider(e.action.session) === this._provider) {
                const cts = new CancellationTokenSource();
                this.refresh(cts.token).finally(() => cts.dispose());
            }
        }));
    }
    get items() {
        return this._items;
    }
    async refresh(_token) {
        try {
            const sessions = await this._connection.listSessions();
            const filtered = sessions.filter(s => AgentSession.provider(s.session) === this._provider);
            const rawId = (s) => AgentSession.id(s.session);
            this._items = filtered.map(s => ({
                resource: URI.from({ scheme: this._sessionType, path: `/${rawId(s)}` }),
                label: s.summary ?? `Session ${rawId(s).substring(0, 8)}`,
                description: this._description,
                iconPath: getAgentHostIcon(this._productService),
                status: 1 /* ChatSessionStatus.Completed */,
                metadata: this._buildMetadata(s.workingDirectory),
                timing: {
                    created: s.startTime,
                    lastRequestStarted: s.modifiedTime,
                    lastRequestEnded: s.modifiedTime,
                },
            }));
        }
        catch {
            this._items = [];
        }
        this._onDidChangeChatSessionItems.fire({ addedOrUpdated: this._items });
    }
    _buildMetadata(workingDirectory) {
        if (!this._description) {
            return undefined;
        }
        const result = { remoteAgentHost: this._description };
        if (workingDirectory) {
            result.workingDirectoryPath = workingDirectory.fsPath;
        }
        return result;
    }
};
AgentHostSessionListController = __decorate([
    __param(4, IProductService)
], AgentHostSessionListController);
export { AgentHostSessionListController };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0U2Vzc2lvbkxpc3RDb250cm9sbGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFNlc3Npb25MaXN0Q29udHJvbGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDM0csT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxZQUFZLEVBQXlCLE1BQU0sNkRBQTZELENBQUM7QUFDbEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBRXRHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRXZEOzs7Ozs7O0dBT0c7QUFDSSxJQUFNLDhCQUE4QixHQUFwQyxNQUFNLDhCQUErQixTQUFRLFVBQVU7SUFPN0QsWUFDa0IsWUFBb0IsRUFDcEIsU0FBaUIsRUFDakIsV0FBNkIsRUFDN0IsWUFBZ0MsRUFDaEMsZUFBaUQ7UUFFbEUsS0FBSyxFQUFFLENBQUM7UUFOUyxpQkFBWSxHQUFaLFlBQVksQ0FBUTtRQUNwQixjQUFTLEdBQVQsU0FBUyxDQUFRO1FBQ2pCLGdCQUFXLEdBQVgsV0FBVyxDQUFrQjtRQUM3QixpQkFBWSxHQUFaLFlBQVksQ0FBb0I7UUFDZixvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFW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