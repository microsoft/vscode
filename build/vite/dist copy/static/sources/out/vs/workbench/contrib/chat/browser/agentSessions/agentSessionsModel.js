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
var AgentSessionsModel_1, AgentSessionsCache_1;
import { ThrottledDelayer } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { safeStringify } from '../../../../../base/common/objects.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService, LogLevel } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { Extensions, IOutputService } from '../../../../services/output/common/output.js';
import { IChatSessionsService, isSessionInProgressStatus } from '../../common/chatSessionsService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { IChatWidgetService } from '../chat.js';
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName, isBuiltInAgentSessionProvider } from './agentSessions.js';
//#region Interfaces, Types
export { ChatSessionStatus as AgentSessionStatus, isSessionInProgressStatus } from '../../common/chatSessionsService.js';
/**
 * Checks if the provided changes object represents valid diff information.
 */
export function hasValidDiff(changes) {
    if (!changes) {
        return false;
    }
    if (changes instanceof Array) {
        return changes.length > 0;
    }
    return changes.files > 0 || changes.insertions > 0 || changes.deletions > 0;
}
/**
 * Gets a summary of agent session changes, converting from array format to object format if needed.
 */
export function getAgentChangesSummary(changes) {
    if (!changes) {
        return;
    }
    if (!(changes instanceof Array)) {
        return changes;
    }
    let insertions = 0;
    let deletions = 0;
    for (const change of changes) {
        insertions += change.insertions;
        deletions += change.deletions;
    }
    return { files: changes.length, insertions, deletions };
}
export function isLocalAgentSessionItem(session) {
    return session.providerType === AgentSessionProviders.Local;
}
export function isAgentSession(obj) {
    const session = obj;
    return URI.isUri(session?.resource)
        && typeof session.isArchived === 'function'
        && typeof session.setArchived === 'function'
        && typeof session.isPinned === 'function'
        && typeof session.setPinned === 'function'
        && typeof session.isRead === 'function'
        && typeof session.isMarkedUnread === 'function'
        && typeof session.setRead === 'function';
}
export function isAgentSessionsModel(obj) {
    const sessionsModel = obj;
    return Array.isArray(sessionsModel?.sessions) && typeof sessionsModel?.getSession === 'function';
}
export function countUnreadSessions(sessions) {
    let unread = 0;
    for (const session of sessions) {
        if (!session.isArchived() && session.status === 1 /* AgentSessionStatus.Completed */ && !session.isRead()) {
            unread++;
        }
    }
    return unread;
}
export var AgentSessionSection;
(function (AgentSessionSection) {
    // Pinned Grouping
    AgentSessionSection["Pinned"] = "pinned";
    // Date Grouping
    AgentSessionSection["Today"] = "today";
    AgentSessionSection["Yesterday"] = "yesterday";
    AgentSessionSection["Week"] = "week";
    AgentSessionSection["Older"] = "older";
    AgentSessionSection["Archived"] = "archived";
    // Capped Grouping
    AgentSessionSection["More"] = "more";
    // Repository Grouping
    AgentSessionSection["Repository"] = "repository";
})(AgentSessionSection || (AgentSessionSection = {}));
export function isAgentSessionSection(obj) {
    const candidate = obj;
    return typeof candidate.section === 'string' && Array.isArray(candidate.sessions);
}
export function isAgentSessionShowMore(obj) {
    return obj?.showMore === true;
}
export function isAgentSessionShowLess(obj) {
    return obj?.showLess === true;
}
export function isMarshalledAgentSessionContext(thing) {
    if (typeof thing === 'object' && thing !== null) {
        const candidate = thing;
        return candidate.$mid === 25 /* MarshalledId.AgentSessionContext */ && typeof candidate.session === 'object' && candidate.session !== null;
    }
    return false;
}
//#endregion
//#region Sessions Logger
const agentSessionsOutputChannelId = 'agentSessionsOutput';
const agentSessionsOutputChannelLabel = localize('agentSessionsOutput', "Agent Sessions");
function statusToString(status) {
    switch (status) {
        case 0 /* AgentSessionStatus.Failed */: return 'Failed';
        case 1 /* AgentSessionStatus.Completed */: return 'Completed';
        case 2 /* AgentSessionStatus.InProgress */: return 'InProgress';
        case 3 /* AgentSessionStatus.NeedsInput */: return 'NeedsInput';
        default: return `Unknown(${status})`;
    }
}
let AgentSessionsLogger = class AgentSessionsLogger extends Disposable {
    constructor(getSessionsData, logService, outputService, chatEntitlementService) {
        super();
        this.getSessionsData = getSessionsData;
        this.logService = logService;
        this.outputService = outputService;
        this.chatEntitlementService = chatEntitlementService;
        this.isChannelRegistered = false;
        this.updateChannelRegistration();
        this.registerListeners();
    }
    updateChannelRegistration() {
        const chatDisabled = this.chatEntitlementService.sentiment.hidden;
        if (chatDisabled && this.isChannelRegistered) {
            Registry.as(Extensions.OutputChannels).removeChannel(agentSessionsOutputChannelId);
            this.isChannelRegistered = false;
        }
        else if (!chatDisabled && !this.isChannelRegistered) {
            Registry.as(Extensions.OutputChannels).registerChannel({
                id: agentSessionsOutputChannelId,
                label: agentSessionsOutputChannelLabel,
                log: false
            });
            this.isChannelRegistered = true;
        }
    }
    registerListeners() {
        this._register(this.logService.onDidChangeLogLevel(level => {
            if (level === LogLevel.Trace) {
                this.logAllStatsIfTrace('Log level changed to trace');
            }
        }));
        this._register(this.chatEntitlementService.onDidChangeSentiment(() => {
            this.updateChannelRegistration();
        }));
    }
    logIfTrace(msg) {
        if (this.logService.getLevel() !== LogLevel.Trace) {
            return;
        }
        this.trace(`[Agent Sessions] ${msg}`);
    }
    logAllStatsIfTrace(reason) {
        if (this.logService.getLevel() !== LogLevel.Trace) {
            return;
        }
        this.logAllSessions(reason);
        this.logSessionStates();
    }
    logAllSessions(reason) {
        const { sessions, sessionStates } = this.getSessionsData();
        const lines = [];
        lines.push(`=== Agent Sessions (${reason}) ===`);
        let count = 0;
        for (const session of sessions) {
            count++;
            const state = sessionStates.get(session.resource);
            lines.push(`--- Session: ${session.label} ---`);
            lines.push(`  Resource: ${session.resource.toString()}`);
            lines.push(`  Provider Type: ${session.providerType}`);
            lines.push(`  Provider Label: ${session.providerLabel}`);
            lines.push(`  Status: ${statusToString(session.status)}`);
            lines.push(`  Icon: ${session.icon.id}`);
            if (session.description) {
                lines.push(`  Description: ${typeof session.description === 'string' ? session.description : session.description.value}`);
            }
            if (session.badge) {
                lines.push(`  Badge: ${typeof session.badge === 'string' ? session.badge : session.badge.value}`);
            }
            if (session.tooltip) {
                lines.push(`  Tooltip: ${typeof session.tooltip === 'string' ? session.tooltip : session.tooltip.value}`);
            }
            // Timing info
            lines.push(`  Timing:`);
            lines.push(`    Created: ${session.timing.created ? new Date(session.timing.created).toISOString() : 'N/A'}`);
            lines.push(`    Last Request Started: ${session.timing.lastRequestStarted ? new Date(session.timing.lastRequestStarted).toISOString() : 'N/A'}`);
            lines.push(`    Last Request Ended: ${session.timing.lastRequestEnded ? new Date(session.timing.lastRequestEnded).toISOString() : 'N/A'}`);
            // Changes info
            if (session.changes) {
                const summary = getAgentChangesSummary(session.changes);
                if (summary) {
                    lines.push(`  Changes: ${summary.files} files, +${summary.insertions} -${summary.deletions}`);
                }
            }
            // Metadata
            if (session.metadata && Object.keys(session.metadata).length > 0) {
                lines.push(`  Metadata:`);
                for (const [key, value] of Object.entries(session.metadata)) {
                    const renderedValue = typeof value === 'string' ? value : safeStringify(value);
                    lines.push(`    ${key}: ${renderedValue}`);
                }
            }
            // Our state (read/unread, archived)
            lines.push(`  State:`);
            lines.push(`    Archived (provider): ${session.archived ?? 'N/A'}`);
            lines.push(`    Archived (computed): ${session.isArchived()}`);
            lines.push(`    Archived (stored): ${state?.archived ?? 'N/A'}`);
            lines.push(`    Pinned: ${session.isPinned()}`);
            lines.push(`    Pinned (stored): ${state?.pinned ?? 'N/A'}`);
            lines.push(`    Read: ${session.isRead()}`);
            lines.push(`    Read date (stored): ${state?.read ? new Date(state.read).toISOString() : 'N/A'}`);
            lines.push('');
        }
        lines.unshift(`Total sessions: ${count}`, '');
        lines.push(`=== End Agent Sessions ===`);
        this.trace(lines.join('\n'));
    }
    logSessionStates() {
        const { sessionStates } = this.getSessionsData();
        const lines = [];
        lines.push(`=== Session States ===`);
        lines.push(`Total stored states: ${sessionStates.size}`);
        lines.push('');
        for (const [resource, state] of sessionStates) {
            lines.push(`URI: ${resource.toString()}`);
            lines.push(`  Archived: ${state.archived}`);
            lines.push(`  Pinned: ${state.pinned}`);
            lines.push(`  Read: ${state.read ? new Date(state.read).toISOString() : '0 (unread)'}`);
            lines.push('');
        }
        lines.push(`=== End Session States ===`);
        this.trace(lines.join('\n'));
    }
    trace(msg) {
        const channel = this.outputService.getChannel(agentSessionsOutputChannelId);
        if (!channel) {
            return;
        }
        channel.append(`${msg}\n`);
    }
};
AgentSessionsLogger = __decorate([
    __param(1, ILogService),
    __param(2, IOutputService),
    __param(3, IChatEntitlementService)
], AgentSessionsLogger);
//#endregion
let AgentSessionsModel = class AgentSessionsModel extends Disposable {
    static { AgentSessionsModel_1 = this; }
    get resolved() { return this._resolved; }
    get sessions() { return Array.from(this._sessions.values()); }
    constructor(chatSessionsService, lifecycleService, instantiationService, storageService, productService, chatWidgetService, workspaceContextService, workspaceTrustManagementService, chatEntitlementService) {
        super();
        this.chatSessionsService = chatSessionsService;
        this.lifecycleService = lifecycleService;
        this.instantiationService = instantiationService;
        this.storageService = storageService;
        this.productService = productService;
        this.chatWidgetService = chatWidgetService;
        this.workspaceContextService = workspaceContextService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        this.chatEntitlementService = chatEntitlementService;
        this._onWillResolve = this._register(new Emitter());
        this.onWillResolve = this._onWillResolve.event;
        this._onDidResolve = this._register(new Emitter());
        this.onDidResolve = this._onDidResolve.event;
        this._onDidChangeSessions = this._register(new Emitter());
        this.onDidChangeSessions = this._onDidChangeSessions.event;
        this._onDidChangeSessionArchivedState = this._register(new Emitter());
        this.onDidChangeSessionArchivedState = this._onDidChangeSessionArchivedState.event;
        this._resolved = false;
        this.resolvers = this._register(new DisposableMap());
        this._sessions = new ResourceMap();
        this.cache = this.instantiationService.createInstance(AgentSessionsCache);
        for (const data of this.cache.loadCachedSessions()) {
            const session = this.toAgentSession(data);
            this._sessions.set(session.resource, session);
        }
        this.sessionStates = this.cache.loadSessionStates();
        this.logger = this._register(this.instantiationService.createInstance(AgentSessionsLogger, () => ({
            sessions: this._sessions.values(),
            sessionStates: this.sessionStates,
        })));
        this.logger.logAllStatsIfTrace('Loaded cached sessions');
        this.readDateBaseline = this.resolveReadDateBaseline(); // we use this to account for bugfixes in the read/unread tracking
        this.registerListeners();
    }
    registerListeners() {
        // Sessions updates
        this._register(this.chatSessionsService.onDidChangeItemsProviders(({ chatSessionType }) => this.resolve(chatSessionType)));
        this._register(this.chatSessionsService.onDidChangeAvailability(() => this.resolve(undefined)));
        this._register(this.chatSessionsService.onDidChangeSessionItems((delta) => {
            const changedChatSessionTypes = new Set();
            for (const resource of delta.addedOrUpdated ?? []) {
                changedChatSessionTypes.add(getChatSessionType(resource.resource));
            }
            for (const resource of delta.removed ?? []) {
                changedChatSessionTypes.add(getChatSessionType(resource));
            }
            for (const chatSessionType of changedChatSessionTypes) {
                this.resolveProvider(chatSessionType, { refreshProvider: false /* skip because we react on an event already */ });
            }
        }));
        this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.resolve(undefined)));
        this._register(this.workspaceTrustManagementService.onDidChangeTrust(() => this.resolve(undefined)));
        // State
        this._register(this.storageService.onWillSaveState(() => {
            this.cache.saveCachedSessions(Array.from(this._sessions.values()));
            this.cache.saveSessionStates(this.sessionStates);
        }));
    }
    getSession(resource) {
        return this._sessions.get(resource);
    }
    async resolve(provider) {
        const providers = Array.isArray(provider)
            ? provider
            : provider !== undefined
                ? [provider]
                : this.chatSessionsService.getRegisteredChatSessionItemProviders();
        await Promise.all(providers.map(provider => this.resolveProvider(provider, { refreshProvider: true })));
    }
    resolveProvider(provider, options) {
        if (this.chatEntitlementService.sentiment.hidden) {
            return Promise.resolve(); // don't resolve if AI features are disabled
        }
        let resolver = this.resolvers.get(provider);
        if (!resolver) {
            resolver = new ThrottledDelayer(500);
            this.resolvers.set(provider, resolver);
        }
        return resolver.trigger(async (token) => {
            if (token.isCancellationRequested || this.lifecycleService.willShutdown) {
                return;
            }
            try {
                this._onWillResolve.fire(provider);
                return await this.doResolveProvider(provider, options, token);
            }
            catch (error) {
                this.logger.logIfTrace(`Error resolving sessions for provider ${provider}: ${error instanceof Error ? error.stack : String(error)}`);
            }
            finally {
                this._onDidResolve.fire(provider);
            }
        });
    }
    async doResolveProvider(provider, options, token) {
        if (options.refreshProvider) {
            await this.chatSessionsService.refreshChatSessionItems([provider], token);
        }
        const mapSessionContributionToType = new Map();
        for (const contribution of this.chatSessionsService.getAllChatSessionContributions()) {
            mapSessionContributionToType.set(contribution.type, contribution);
        }
        // Phase 1: Fetch new items for this provider (async, may interleave with other providers)
        const sessions = new ResourceMap();
        for await (const { chatSessionType, items: providerSessions } of this.chatSessionsService.getChatSessionItems([provider], token)) {
            if (token.isCancellationRequested) {
                return;
            }
            for (const session of providerSessions) {
                let icon;
                let providerLabel;
                const agentSessionProvider = getAgentSessionProvider(chatSessionType);
                if (agentSessionProvider !== undefined) {
                    providerLabel = getAgentSessionProviderName(agentSessionProvider);
                    icon = getAgentSessionProviderIcon(agentSessionProvider);
                }
                else {
                    providerLabel = mapSessionContributionToType.get(chatSessionType)?.name ?? chatSessionType;
                    icon = session.iconPath ?? Codicon.terminal;
                }
                const changes = session.changes;
                const normalizedChanges = changes && !(changes instanceof Array)
                    ? { files: changes.files, insertions: changes.insertions, deletions: changes.deletions }
                    : changes;
                sessions.set(session.resource, this.toAgentSession({
                    providerType: chatSessionType,
                    providerLabel,
                    resource: session.resource,
                    label: session.label.split('\n')[0], // protect against weird multi-line labels that break our layout
                    description: session.description,
                    icon,
                    badge: session.badge,
                    tooltip: session.tooltip,
                    status: session.status ?? 1 /* AgentSessionStatus.Completed */,
                    archived: session.archived,
                    timing: session.timing,
                    changes: normalizedChanges,
                    metadata: session.metadata,
                }));
            }
        }
        // Phase 2: Atomically update sessions (sync - reads latest this._sessions
        // so concurrent updateItems calls for other providers don't lose data)
        for (const [, session] of this._sessions) {
            if (session.providerType !== provider &&
                !sessions.has(session.resource) &&
                (isBuiltInAgentSessionProvider(session.providerType) || mapSessionContributionToType.has(session.providerType))) {
                sessions.set(session.resource, session);
            }
        }
        this._sessions = sessions;
        this._resolved = true;
        this.logger.logAllStatsIfTrace('Sessions resolved from providers');
        this._onDidChangeSessions.fire();
    }
    toAgentSession(data) {
        return {
            ...data,
            isArchived: () => this.isArchived(data),
            setArchived: (archived) => this.setArchived(data, archived),
            isPinned: () => this.isPinned(data),
            setPinned: (pinned) => this.setPinned(data, pinned),
            isRead: () => this.isRead(data),
            isMarkedUnread: () => this.isMarkedUnread(data),
            setRead: (read) => this.setRead(data, read),
        };
    }
    //#region States
    static { this.UNREAD_MARKER = -1; }
    isArchived(session) {
        return this.sessionStates.get(session.resource)?.archived ?? Boolean(session.archived);
    }
    setArchived(session, archived) {
        if (archived) {
            this.setRead(session, true); // mark as read when archiving
        }
        if (archived === this.isArchived(session)) {
            return; // no change
        }
        const state = this.sessionStates.get(session.resource) ?? {};
        this.sessionStates.set(session.resource, { ...state, archived });
        const agentSession = this._sessions.get(session.resource);
        if (agentSession) {
            this._onDidChangeSessionArchivedState.fire(agentSession);
        }
        this._onDidChangeSessions.fire();
    }
    isPinned(session) {
        return this.sessionStates.get(session.resource)?.pinned ?? false;
    }
    setPinned(session, pinned) {
        if (pinned === this.isPinned(session)) {
            return; // no change
        }
        const state = this.sessionStates.get(session.resource) ?? {};
        this.sessionStates.set(session.resource, { ...state, pinned });
        this._onDidChangeSessions.fire();
    }
    isMarkedUnread(session) {
        return this.sessionStates.get(session.resource)?.read === AgentSessionsModel_1.UNREAD_MARKER;
    }
    isRead(session) {
        if (this.isArchived(session)) {
            return true; // archived sessions are always read
        }
        const storedReadDate = this.sessionStates.get(session.resource)?.read;
        if (storedReadDate === AgentSessionsModel_1.UNREAD_MARKER) {
            return false;
        }
        const readDate = Math.max(storedReadDate ?? 0, this.readDateBaseline /* Use read date baseline when no read date is stored */);
        // Install a heuristic to reduce false positives: a user might observe
        // the output of a session and quickly click on another session before
        // it is finished. Strictly speaking the session is unread, but we
        // allow a certain threshold of time to count as read to accommodate.
        if (readDate >= this.sessionTimeForReadStateTracking(session) - 2000) {
            return true;
        }
        // Never consider a session as unread if its connected to a widget
        return !!this.chatWidgetService.getWidgetBySessionResource(session.resource);
    }
    sessionTimeForReadStateTracking(session) {
        return session.timing.lastRequestEnded ?? session.timing.created;
    }
    setRead(session, read, skipEvent) {
        const state = this.sessionStates.get(session.resource) ?? {};
        let newRead;
        if (read) {
            newRead = Math.max(Date.now(), this.sessionTimeForReadStateTracking(session));
            if (typeof state.read === 'number' && state.read >= newRead) {
                return; // already read with a sufficient timestamp
            }
        }
        else {
            newRead = AgentSessionsModel_1.UNREAD_MARKER;
            if (state.read === AgentSessionsModel_1.UNREAD_MARKER) {
                return; // already unread
            }
        }
        this.sessionStates.set(session.resource, { ...state, read: newRead });
        if (!skipEvent) {
            this._onDidChangeSessions.fire();
        }
    }
    static { this.READ_DATE_BASELINE_KEY = 'agentSessions.readDateBaseline2'; }
    resolveReadDateBaseline() {
        let readDateBaseline = this.storageService.getNumber(AgentSessionsModel_1.READ_DATE_BASELINE_KEY, 1 /* StorageScope.WORKSPACE */, 0);
        if (readDateBaseline > 0) {
            return readDateBaseline; // already resolved
        }
        // For stable, preserve unread state for sessions from the last 7 days
        // For other qualities, mark all sessions as read
        readDateBaseline = this.productService.quality === 'stable'
            ? Date.now() - (7 * 24 * 60 * 60 * 1000)
            : Date.now();
        this.storageService.store(AgentSessionsModel_1.READ_DATE_BASELINE_KEY, readDateBaseline, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        return readDateBaseline;
    }
};
AgentSessionsModel = AgentSessionsModel_1 = __decorate([
    __param(0, IChatSessionsService),
    __param(1, ILifecycleService),
    __param(2, IInstantiationService),
    __param(3, IStorageService),
    __param(4, IProductService),
    __param(5, IChatWidgetService),
    __param(6, IWorkspaceContextService),
    __param(7, IWorkspaceTrustManagementService),
    __param(8, IChatEntitlementService)
], AgentSessionsModel);
export { AgentSessionsModel };
let AgentSessionsCache = class AgentSessionsCache {
    static { AgentSessionsCache_1 = this; }
    static { this.SESSIONS_STORAGE_KEY = 'agentSessions.model.cache'; }
    static { this.STATE_STORAGE_KEY = 'agentSessions.state.cache'; }
    constructor(storageService) {
        this.storageService = storageService;
    }
    //#region Sessions
    saveCachedSessions(sessions) {
        const serialized = sessions.map(session => ({
            providerType: session.providerType,
            providerLabel: session.providerLabel,
            resource: session.resource.toString(),
            icon: session.icon.id,
            label: session.label,
            description: session.description,
            badge: session.badge,
            tooltip: session.tooltip,
            status: isSessionInProgressStatus(session.status) ? 1 /* AgentSessionStatus.Completed */ : session.status, // never cache sessions as in progress, this needs to be live state
            archived: session.archived,
            timing: session.timing,
            changes: session.changes,
            metadata: session.metadata
        }));
        this.storageService.store(AgentSessionsCache_1.SESSIONS_STORAGE_KEY, safeStringify(serialized), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
    }
    loadCachedSessions() {
        const sessionsCache = this.storageService.get(AgentSessionsCache_1.SESSIONS_STORAGE_KEY, 1 /* StorageScope.WORKSPACE */);
        if (!sessionsCache) {
            return [];
        }
        try {
            const cached = JSON.parse(sessionsCache);
            return cached.map((session) => ({
                providerType: session.providerType,
                providerLabel: session.providerLabel,
                resource: typeof session.resource === 'string' ? URI.parse(session.resource) : URI.revive(session.resource),
                icon: ThemeIcon.fromId(session.icon),
                label: session.label,
                description: session.description,
                badge: session.badge,
                tooltip: session.tooltip,
                status: session.status,
                archived: session.archived,
                timing: {
                    created: session.timing.created ?? 0,
                    lastRequestStarted: session.timing.lastRequestStarted,
                    lastRequestEnded: session.timing.lastRequestEnded,
                },
                changes: Array.isArray(session.changes) ? session.changes.map((change) => ({
                    modifiedUri: URI.revive(change.modifiedUri),
                    originalUri: change.originalUri ? URI.revive(change.originalUri) : undefined,
                    insertions: change.insertions,
                    deletions: change.deletions,
                })) : session.changes,
                metadata: session.metadata,
            }));
        }
        catch {
            return []; // invalid data in storage, fallback to empty sessions list
        }
    }
    //#endregion
    //#region States
    saveSessionStates(states) {
        const serialized = Array.from(states.entries()).map(([resource, state]) => ({
            resource: resource.toString(),
            archived: state.archived,
            pinned: state.pinned,
            read: state.read
        }));
        this.storageService.store(AgentSessionsCache_1.STATE_STORAGE_KEY, JSON.stringify(serialized), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
    }
    loadSessionStates() {
        const states = new ResourceMap();
        const statesCache = this.storageService.get(AgentSessionsCache_1.STATE_STORAGE_KEY, 1 /* StorageScope.WORKSPACE */);
        if (!statesCache) {
            return states;
        }
        try {
            const cached = JSON.parse(statesCache);
            for (const entry of cached) {
                states.set(typeof entry.resource === 'string' ? URI.parse(entry.resource) : URI.revive(entry.resource), {
                    archived: entry.archived,
                    pinned: entry.pinned,
                    read: entry.read
                });
            }
        }
        catch {
            // invalid data in storage, fallback to empty states
        }
        return states;
    }
};
AgentSessionsCache = AgentSessionsCache_1 = __decorate([
    __param(0, IStorageService)
], AgentSessionsCache);
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc01vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc01vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUV2RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLHFDQUFxQyxDQUFDO0FBRXJFLE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxtQ0FBbUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNsRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDM0YsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sbURBQW1ELENBQUM7QUFDakgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdURBQXVELENB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