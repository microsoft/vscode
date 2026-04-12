/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
export const ISessionsProvidersService = createDecorator('sessionsProvidersService');
/**
 * Separator used to construct globally unique session IDs: `${providerId}:${localId}`.
 */
const SESSION_ID_SEPARATOR = ':';
export class SessionsProvidersService extends Disposable {
    constructor() {
        super(...arguments);
        this._providers = new Map();
        this._onDidChangeProviders = this._register(new Emitter());
        this.onDidChangeProviders = this._onDidChangeProviders.event;
        this._onDidChangeSessions = this._register(new Emitter());
        this.onDidChangeSessions = this._onDidChangeSessions.event;
        this._onDidReplaceSession = this._register(new Emitter());
        this.onDidReplaceSession = this._onDidReplaceSession.event;
    }
    // -- Provider Registry --
    registerProvider(provider) {
        if (this._providers.has(provider.id)) {
            throw new Error(`Sessions provider '${provider.id}' is already registered.`);
        }
        const disposables = new DisposableStore();
        // Forward session change events from this provider
        disposables.add(provider.onDidChangeSessions(e => {
            this._onDidChangeSessions.fire(e);
        }));
        // Forward replace session events if the provider supports them
        if (provider.onDidReplaceSession) {
            disposables.add(provider.onDidReplaceSession(e => {
                this._onDidReplaceSession.fire(e);
            }));
        }
        this._providers.set(provider.id, { provider, disposables });
        this._onDidChangeProviders.fire();
        return toDisposable(() => {
            const entry = this._providers.get(provider.id);
            if (entry) {
                entry.disposables.dispose();
                this._providers.delete(provider.id);
                this._onDidChangeProviders.fire();
            }
        });
    }
    getProviders() {
        return Array.from(this._providers.values(), e => e.provider);
    }
    getProvider(providerId) {
        return this._providers.get(providerId)?.provider;
    }
    // -- Session Types --
    getSessionTypesForProvider(providerId) {
        const entry = this._providers.get(providerId);
        if (!entry) {
            return [];
        }
        return [...entry.provider.sessionTypes];
    }
    getSessionTypes(sessionId) {
        const { provider } = this._resolveProvider(sessionId);
        if (!provider) {
            return [];
        }
        return provider.getSessionTypes(sessionId);
    }
    // -- Aggregated Sessions --
    getSessions() {
        const sessions = [];
        for (const { provider } of this._providers.values()) {
            sessions.push(...provider.getSessions());
        }
        return sessions;
    }
    getSession(sessionId) {
        const { provider } = this._resolveProvider(sessionId);
        if (!provider) {
            return undefined;
        }
        return provider.getSessions().find(s => s.sessionId === sessionId);
    }
    // -- Session Actions --
    async archiveSession(sessionId) {
        const { provider } = this._resolveProvider(sessionId);
        if (provider) {
            await provider.archiveSession(sessionId);
        }
    }
    async unarchiveSession(sessionId) {
        const { provider } = this._resolveProvider(sessionId);
        if (provider) {
            await provider.unarchiveSession(sessionId);
        }
    }
    async deleteSession(sessionId) {
        const { provider } = this._resolveProvider(sessionId);
        if (provider) {
            await provider.deleteSession(sessionId);
        }
    }
    async renameChat(sessionId, chatUri, title) {
        const { provider } = this._resolveProvider(sessionId);
        if (provider) {
            await provider.renameChat(sessionId, chatUri, title);
        }
    }
    async deleteChat(sessionId, chatUri) {
        const { provider } = this._resolveProvider(sessionId);
        if (provider) {
            await provider.deleteChat(sessionId, chatUri);
        }
    }
    setRead(sessionId, read) {
        const { provider } = this._resolveProvider(sessionId);
        if (provider) {
            provider.setRead(sessionId, read);
        }
    }
    resolveWorkspace(providerId, repositoryUri) {
        const entry = this._providers.get(providerId);
        return entry?.provider.resolveWorkspace(repositoryUri);
    }
    async sendAndCreateChat(sessionId, options) {
        const { provider } = this._resolveProvider(sessionId);
        if (!provider) {
            throw new Error(`Sessions provider for session ID '${sessionId}' not found`);
        }
        return provider.sendAndCreateChat(sessionId, options);
    }
    // -- Private Helpers --
    /**
     * Extract provider ID from a globally unique session ID and look up the provider.
     */
    _resolveProvider(chatId) {
        const separatorIndex = chatId.indexOf(SESSION_ID_SEPARATOR);
        if (separatorIndex === -1) {
            return { provider: undefined, localId: chatId };
        }
        const providerId = chatId.substring(0, separatorIndex);
        const localId = chatId.substring(separatorIndex + 1);
        const entry = this._providers.get(providerId);
        return { provider: entry?.provider, localId };
    }
}
registerSingleton(ISessionsProvidersService, SessionsProvidersService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDOUcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzdGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUsvRyxNQUFNLENBQUMsTUFBTSx5QkFBeUIsR0FBRyxlQUFlLENBQTRCLDBCQUEwQixDQUFDLENBQUM7QUFpRWhIOztHQUVHO0FBQ0gsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLENBQUM7QUFFakMsTUFBTSxPQUFPLHdCQUF5QixTQUFRLFVBQVU7SUFBeEQ7O1FBR2tCLGVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBeUUsQ0FBQztRQUU5RiwwQkFBcUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUNwRSx5QkFBb0IsR0FBZ0IsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQztRQUU3RCx5QkFBb0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUF1QixDQUFDLENBQUM7UUFDbEYsd0JBQW1CLEdBQStCLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUM7UUFFMUUseUJBQW9CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBc0QsQ0FBQyxDQUFDO1FBQ2pILHdC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