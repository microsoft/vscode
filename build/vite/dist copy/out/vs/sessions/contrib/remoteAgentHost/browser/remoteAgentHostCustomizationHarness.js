/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { BUILTIN_STORAGE } from '../../chat/common/builtinPromptsStorage.js';
export { AgentCustomizationSyncProvider as RemoteAgentSyncProvider } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationSyncProvider.js';
/**
 * Maps a {@link CustomizationStatus} enum value to the string literal
 * expected by {@link IExternalCustomizationItem.status}.
 */
function toStatusString(status) {
    switch (status) {
        case "loading" /* CustomizationStatus.Loading */: return 'loading';
        case "loaded" /* CustomizationStatus.Loaded */: return 'loaded';
        case "degraded" /* CustomizationStatus.Degraded */: return 'degraded';
        case "error" /* CustomizationStatus.Error */: return 'error';
        default: return undefined;
    }
}
/**
 * Provider that exposes a remote agent's customizations as
 * {@link IExternalCustomizationItem} entries for the list widget.
 *
 * Baseline items come from {@link IAgentInfo.customizations} (available
 * without an active session). When a session is active, the provider
 * overlays {@link ISessionCustomization} data, which includes loading
 * status and enabled state.
 */
export class RemoteAgentCustomizationItemProvider extends Disposable {
    constructor(agentInfo, _clientState) {
        super();
        this._clientState = _clientState;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._agentCustomizations = agentInfo.customizations ?? [];
        // Listen for session state changes that include customization updates
        this._register(this._clientState.onDidChangeSessionState(({ state }) => {
            if (state.customizations !== this._sessionCustomizations) {
                this._sessionCustomizations = state.customizations;
                this._onDidChange.fire();
            }
        }));
    }
    /**
     * Updates the baseline agent customizations (e.g. when root state
     * changes and agent info is refreshed).
     */
    updateAgentCustomizations(customizations) {
        this._agentCustomizations = customizations;
        this._onDidChange.fire();
    }
    async provideChatSessionCustomizations(_token) {
        // When a session is active, prefer session-level data (includes status)
        if (this._sessionCustomizations) {
            return this._sessionCustomizations.map(sc => ({
                uri: URI.isUri(sc.customization.uri) ? sc.customization.uri : URI.parse(sc.customization.uri),
                type: 'plugin',
                name: sc.customization.displayName,
                description: sc.customization.description,
                status: toStatusString(sc.status),
                statusMessage: sc.statusMessage,
                enabled: sc.enabled,
            }));
        }
        // Baseline: agent-level customizations (no status info)
        return this._agentCustomizations.map(ref => ({
            uri: URI.isUri(ref.uri) ? ref.uri : URI.parse(ref.uri),
            type: 'plugin',
            name: ref.displayName,
            description: ref.description,
        }));
    }
}
/**
 * Creates a {@link IHarnessDescriptor} for a remote agent discovered via
 * the agent host protocol.
 *
 * The descriptor exposes the agent's server-provided customizations through
 * an {@link IExternalCustomizationItemProvider} and allows the user to
 * select local customizations for syncing via an {@link ICustomizationSyncProvider}.
 */
export function createRemoteAgentHarnessDescriptor(harnessId, displayName, itemProvider, syncProvider) {
    const allSources = [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin, BUILTIN_STORAGE];
    const filter = { sources: allSources };
    return {
        id: harnessId,
        label: displayName,
        icon: ThemeIcon.fromId(Codicon.remote.id),
        hiddenSections: [
            AICustomizationManagementSection.Models,
            AICustomizationManagementSection.McpServers,
        ],
        hideGenerateButton: true,
        getStorageSourceFilter(_type) {
            return filter;
        },
        itemProvider,
        syncProvider,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQWdlbnRIb3N0Q3VzdG9taXphdGlvbkhhcm5lc3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL3JlbW90ZUFnZW50SG9zdC9icm93c2VyL3JlbW90ZUFnZW50SG9zdEN1c3RvbWl6YXRpb25IYXJuZXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFakUsT0FBTyxFQUFFLGdDQUFnQyxFQUE2QixNQUFNLDhFQUE4RSxDQUFDO0FBQzNKLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUtsSCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFHN0UsT0FBTyxFQUFFLDhCQUE4QixJQUFJLHVCQUF1QixFQUFFLE1BQU0sc0dBQXNHLENBQUM7QUFFakw7OztHQUdHO0FBQ0gsU0FBUyxjQUFjLENBQUMsTUFBdUM7SUFDOUQsUUFBUSxNQUFNLEVBQUUsQ0FBQztRQUNoQixnREFBZ0MsQ0FBQyxDQUFDLE9BQU8sU0FBUyxDQUFDO1FBQ25ELDhDQUErQixDQUFDLENBQUMsT0FBTyxRQUFRLENBQUM7UUFDakQsa0RBQWlDLENBQUMsQ0FBQyxPQUFPLFVBQVUsQ0FBQztRQUNyRCw0Q0FBOEIsQ0FBQyxDQUFDLE9BQU8sT0FBTyxDQUFDO1FBQy9DLE9BQU8sQ0FBQyxDQUFDLE9BQU8sU0FB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