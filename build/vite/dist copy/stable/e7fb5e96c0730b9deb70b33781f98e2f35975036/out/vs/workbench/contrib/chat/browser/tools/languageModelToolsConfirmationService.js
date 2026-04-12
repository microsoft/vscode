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
import { Codicon } from '../../../../../base/common/codicons.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../base/common/map.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, QuickInputButtonLocation } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
const RUN_WITHOUT_APPROVAL = localize('runWithoutApproval', "without approval");
const CONTINUE_WITHOUT_REVIEWING_RESULTS = localize('continueWithoutReviewingResults', "without reviewing result");
class GenericConfirmStore extends Disposable {
    constructor(_storageKey, _instantiationService) {
        super();
        this._storageKey = _storageKey;
        this._instantiationService = _instantiationService;
        this._memoryStore = new Map();
        this._workspaceStore = new Lazy(() => this._register(this._instantiationService.createInstance(ToolConfirmStore, 1 /* StorageScope.WORKSPACE */, this._storageKey)));
        this._profileStore = new Lazy(() => this._register(this._instantiationService.createInstance(ToolConfirmStore, 0 /* StorageScope.PROFILE */, this._storageKey)));
    }
    setAutoConfirmation(id, scope, label) {
        // Clear from all scopes first
        this._workspaceStore.value.setAutoConfirm(id, undefined);
        this._profileStore.value.setAutoConfirm(id, undefined);
        this._memoryStore.delete(id);
        const entry = { confirmed: true, label };
        // Set in the appropriate scope
        if (scope === 'workspace') {
            this._workspaceStore.value.setAutoConfirm(id, entry);
        }
        else if (scope === 'profile') {
            this._profileStore.value.setAutoConfirm(id, entry);
        }
        else if (scope === 'session') {
            this._memoryStore.set(id, entry);
        }
    }
    getAutoConfirmation(id) {
        if (this._workspaceStore.value.getAutoConfirm(id)) {
            return 'workspace';
        }
        if (this._profileStore.value.getAutoConfirm(id)) {
            return 'profile';
        }
        if (this._memoryStore.has(id)) {
            return 'session';
        }
        return 'never';
    }
    getAutoConfirmationIn(id, scope) {
        if (scope === 'workspace') {
            return !!this._workspaceStore.value.getAutoConfirm(id);
        }
        else if (scope === 'profile') {
            return !!this._profileStore.value.getAutoConfirm(id);
        }
        else {
            return this._memoryStore.has(id);
        }
    }
    getLabel(id) {
        return this._workspaceStore.value.getAutoConfirm(id)?.label
            ?? this._profileStore.value.getAutoConfirm(id)?.label
            ?? this._memoryStore.get(id)?.label;
    }
    reset() {
        this._workspaceStore.value.reset();
        this._profileStore.value.reset();
        this._memoryStore.clear();
    }
    checkAutoConfirmation(id) {
        if (this._workspaceStore.value.getAutoConfirm(id)) {
            return { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'workspace' };
        }
        if (this._profileStore.value.getAutoConfirm(id)) {
            return { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'profile' };
        }
        if (this._memoryStore.has(id)) {
            return { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'session' };
        }
        return undefined;
    }
    getAllConfirmed() {
        const all = new Set();
        for (const key of this._workspaceStore.value.getAll()) {
            all.add(key);
        }
        for (const key of this._profileStore.value.getAll()) {
            all.add(key);
        }
        for (const key of this._memoryStore.keys()) {
            all.add(key);
        }
        return all;
    }
}
let ToolConfirmStore = class ToolConfirmStore extends Disposable {
    constructor(_scope, _storageKey, storageService) {
        super();
        this._scope = _scope;
        this._storageKey = _storageKey;
        this.storageService = storageService;
        this._autoConfirmTools = new LRUCache(100);
        this._didChange = false;
        // Read stored data — supports both legacy string[] and new Record<string, string | boolean> formats
        const raw = storageService.get(this._storageKey, this._scope);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    // Legacy format: string[]
                    for (const key of parsed) {
                        this._autoConfirmTools.set(key, { confirmed: true });
                    }
                }
                else if (typeof parsed === 'object' && parsed !== null) {
                    // New format: Record<string, string | boolean>
                    for (const [key, value] of Object.entries(parsed)) {
                        this._autoConfirmTools.set(key, { confirmed: true, label: typeof value === 'string' ? value : undefined });
                    }
                }
            }
            catch {
                // Ignore malformed data
            }
        }
        this._register(storageService.onWillSaveState(() => {
            if (this._didChange) {
                const data = {};
                for (const [key, entry] of this._autoConfirmTools) {
                    data[key] = entry.label ?? true;
                }
                this.storageService.store(this._storageKey, JSON.stringify(data), this._scope, 1 /* StorageTarget.MACHINE */);
                this._didChange = false;
            }
        }));
    }
    reset() {
        this._autoConfirmTools.clear();
        this._didChange = true;
    }
    getAutoConfirm(id) {
        const entry = this._autoConfirmTools.get(id);
        if (entry) {
            this._didChange = true;
            return entry;
        }
        return undefined;
    }
    setAutoConfirm(id, entry) {
        if (!entry) {
            this._autoConfirmTools.delete(id);
        }
        else {
            this._autoConfirmTools.set(id, entry);
        }
        this._didChange = true;
    }
    getAll() {
        return [...this._autoConfirmTools.keys()];
    }
};
ToolConfirmStore = __decorate([
    __param(2, IStorageService)
], ToolConfirmStore);
let LanguageModelToolsConfirmationService = class LanguageModelToolsConfirmationService extends Disposable {
    constructor(_instantiationService, _quickInputService) {
        super();
        this._instantiationService = _instantiationService;
        this._quickInputService = _quickInputService;
        this._contributions = new Map();
        this._preExecutionToolConfirmStore = this._register(new GenericConfirmStore('chat/autoconfirm', this._instantiationService));
        this._postExecutionToolConfirmStore = this._register(new GenericConfirmStore('chat/autoconfirm-post', this._instantiationService));
        this._preExecutionServerConfirmStore = this._register(new GenericConfirmStore('chat/servers/autoconfirm', this._instantiationService));
        this._postExecutionServerConfirmStore = this._register(new GenericConfirmStore('chat/servers/autoconfirm-post', this._instantiationService));
        this._combinationConfirmStore = this._register(new GenericConfirmStore('chat/autoconfirm-combination', this._instantiationService));
    }
    getPreConfirmAction(ref) {
        // Check contribution first
        const contribution = this._contributions.get(ref.toolId);
        if (contribution?.getPreConfirmAction) {
            const result = contribution.getPreConfirmAction(ref);
            if (result) {
                return result;
            }
        }
        // If contribution disables default approvals, don't check default stores
        if (contribution && contribution.canUseDefaultApprovals === false) {
            return undefined;
        }
        // Check combination-level confirmation
        if (ref.combination) {
            const combinationResult = this._combinationConfirmStore.checkAutoConfirmation(ref.combination.key);
            if (combinationResult) {
                return combinationResult;
            }
        }
        // Check tool-level confirmation
        const toolResult = this._preExecutionToolConfirmStore.checkAutoConfirmation(ref.toolId);
        if (toolResult) {
            return toolResult;
        }
        // Check server-level confirmation for MCP tools
        if (ref.source.type === 'mcp') {
            const serverResult = this._preExecutionServerConfirmStore.checkAutoConfirmation(ref.source.definitionId);
            if (serverResult) {
                return serverResult;
            }
        }
        return undefined;
    }
    getPostConfirmAction(ref) {
        // Check contribution first
        const contribution = this._contributions.get(ref.toolId);
        if (contribution?.getPostConfirmAction) {
            const result = contribution.getPostConfirmAction(ref);
            if (result) {
                return result;
            }
        }
        // If contribution disables default approvals, don't check default stores
        if (contribution && contribution.canUseDefaultApprovals === false) {
            return undefined;
        }
        // Check tool-level confirmation
        const toolResult = this._postExecutionToolConfirmStore.checkAutoConfirmation(ref.toolId);
        if (toolResult) {
            return toolResult;
        }
        // Check server-level confirmation for MCP tools
        if (ref.source.type === 'mcp') {
            const serverResult = this._postExecutionServerConfirmStore.checkAutoConfirmation(ref.source.definitionId);
            if (serverResult) {
                return serverResult;
            }
        }
        return undefined;
    }
    getPreConfirmActions(ref) {
        const actions = [];
        // Add contribution actions first
        const contribution = this._contributions.get(ref.toolId);
        if (contribution?.getPreConfirmActions) {
            actions.push(...contribution.getPreConfirmActions(ref));
        }
        // If contribution disables default approvals, only return contribution actions
        if (contribution && contribution.canUseDefaultApprovals === false) {
            return actions;
        }
        // Add combination-level actions when approveCombination is provided
        if (ref.combination) {
            const { label: combinationLabel, key: combinationKey } = ref.combination;
            actions.push({
                label: localize('allowCombinationSession', '{0} in this Session', combinationLabel),
                detail: localize('allowCombinationSessionTooltip', 'Allow this particular combination of tool and arguments in this session without confirmation.'),
                divider: !!actions.length,
                scope: 'session',
                select: async () => {
                    this._combinationConfirmStore.setAutoConfirmation(combinationKey, 'session', combinationLabel);
                    return true;
                }
            }, {
                label: localize('allowCombinationWorkspace', '{0} in this Workspace', combinationLabel),
                detail: localize('allowCombinationWorkspaceTooltip', 'Allow this particular combination of tool and arguments in this workspace without confirmation.'),
                scope: 'workspace',
                select: async () => {
                    this._combinationConfirmStore.setAutoConfirmation(combinationKey, 'workspace', combinationLabel);
                    return true;
                }
            }, {
                label: localize('allowCombinationGlobally', 'Always {0}', combinationLabel),
                detail: localize('allowCombinationGloballyTooltip', 'Always allow this particular combination of tool and arguments without confirmation.'),
                scope: 'profile',
                select: async () => {
                    this._combinationConfirmStore.setAutoConfirmation(combinationKey, 'profile', combinationLabel);
                    return true;
                }
            });
        }
        // Add default tool-level actions
        actions.push({
            label: localize('allowSession', 'Allow in this Session'),
            detail: localize('allowSessionTooltip', 'Allow this tool to run in this session without confirmation.'),
            divider: !!actions.length,
            scope: 'session',
            select: async () => {
                this._preExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, 'session');
                return true;
            }
        }, {
            label: localize('allowWorkspace', 'Allow in this Workspace'),
            detail: localize('allowWorkspaceTooltip', 'Allow this tool to run in this workspace without confirmation.'),
            scope: 'workspace',
            select: async () => {
                this._preExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, 'workspace');
                return true;
            }
        }, {
            label: localize('allowGlobally', 'Always Allow'),
            detail: localize('allowGloballyTooltip', 'Always allow this tool to run without confirmation.'),
            scope: 'profile',
            select: async () => {
                this._preExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, 'profile');
                return true;
            }
        });
        // Add server-level actions for MCP tools
        if (ref.source.type === 'mcp') {
            const { serverLabel, definitionId } = ref.source;
            actions.push({
                label: localize('allowServerSession', 'Allow Tools from {0} in this Session', serverLabel),
                detail: localize('allowServerSessionTooltip', 'Allow all tools from this server to run in this session without confirmation.'),
                divider: true,
                scope: 'session',
                select: async () => {
                    this._preExecutionServerConfirmStore.setAutoConfirmation(definitionId, 'session');
                    return true;
                }
            }, {
                label: localize('allowServerWorkspace', 'Allow Tools from {0} in this Workspace', serverLabel),
                detail: localize('allowServerWorkspaceTooltip', 'Allow all tools from this server to run in this workspace without confirmation.'),
                scope: 'workspace',
                select: async () => {
                    this._preExecutionServerConfirmStore.setAutoConfirmation(definitionId, 'workspace');
                    return true;
                }
            }, {
                label: localize('allowServerGlobally', 'Always Allow Tools from {0}', serverLabel),
                detail: localize('allowServerGloballyTooltip', 'Always allow all tools from this server to run without confirmation.'),
                scope: 'profile',
                select: async () => {
                    this._preExecutionServerConfirmStore.setAutoConfirmation(definitionId, 'profile');
                    return true;
                }
            });
        }
        return actions;
    }
    getPostConfirmActions(ref) {
        const actions = [];
        // Add contribution actions first
        const contribution = this._contributions.get(ref.toolId);
        if (contribution?.getPostConfirmActions) {
            actions.push(...contribution.getPostConfirmActions(ref));
        }
        // If contribution disables default approvals, only return contribution actions
        if (contribution && contribution.canUseDefaultApprovals === false) {
            return actions;
        }
        // Add default tool-level actions
        actions.push({
            label: localize('allowSessionPost', 'Allow Without Review in this Session'),
            detail: localize('allowSessionPostTooltip', 'Allow results from this tool to be sent without confirmation in this session.'),
            divider: !!actions.length,
            scope: 'session',
            select: async () => {
                this._postExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, 'session');
                return true;
            }
        }, {
            label: localize('allowWorkspacePost', 'Allow Without Review in this Workspace'),
            detail: localize('allowWorkspacePostTooltip', 'Allow results from this tool to be sent without confirmation in this workspace.'),
            scope: 'workspace',
            select: async () => {
                this._postExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, 'workspace');
                return true;
            }
        }, {
            label: localize('allowGloballyPost', 'Always Allow Without Review'),
            detail: localize('allowGloballyPostTooltip', 'Always allow results from this tool to be sent without confirmation.'),
            scope: 'profile',
            select: async () => {
                this._postExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, 'profile');
                return true;
            }
        });
        // Add server-level actions for MCP tools
        if (ref.source.type === 'mcp') {
            const { serverLabel, definitionId } = ref.source;
            actions.push({
                label: localize('allowServerSessionPost', 'Allow Tools from {0} Without Review in this Session', serverLabel),
                detail: localize('allowServerSessionPostTooltip', 'Allow results from all tools from this server to be sent without confirmation in this session.'),
                divider: true,
                scope: 'session',
                select: async () => {
                    this._postExecutionServerConfirmStore.setAutoConfirmation(definitionId, 'session');
                    return true;
                }
            }, {
                label: localize('allowServerWorkspacePost', 'Allow Tools from {0} Without Review in this Workspace', serverLabel),
                detail: localize('allowServerWorkspacePostTooltip', 'Allow results from all tools from this server to be sent without confirmation in this workspace.'),
                scope: 'workspace',
                select: async () => {
                    this._postExecutionServerConfirmStore.setAutoConfirmation(definitionId, 'workspace');
                    return true;
                }
            }, {
                label: localize('allowServerGloballyPost', 'Always Allow Tools from {0} Without Review', serverLabel),
                detail: localize('allowServerGloballyPostTooltip', 'Always allow results from all tools from this server to be sent without confirmation.'),
                scope: 'profile',
                select: async () => {
                    this._postExecutionServerConfirmStore.setAutoConfirmation(definitionId, 'profile');
                    return true;
                }
            });
        }
        return actions;
    }
    registerConfirmationContribution(toolName, contribution) {
        this._contributions.set(toolName, contribution);
        return {
            dispose: () => {
                this._contributions.delete(toolName);
            }
        };
    }
    toolCanManageConfirmation(tool) {
        return !!tool.canRequestPreApproval
            || !!tool.canRequestPostApproval
            || this._contributions.has(tool.id)
            || !!this._preExecutionToolConfirmStore.checkAutoConfirmation(tool.id)
            || !!this._postExecutionToolConfirmStore.checkAutoConfirmation(tool.id)
            || this._hasCombinationApprovalsForTool(tool.id);
    }
    _hasCombinationApprovalsForTool(toolId) {
        const prefix = toolId + ':combination:';
        for (const key of this._combinationConfirmStore.getAllConfirmed()) {
            if (key.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }
    _getCombinationApprovalsForTool(toolId, scope) {
        const prefix = toolId + ':combination:';
        const results = [];
        for (const key of this._combinationConfirmStore.getAllConfirmed()) {
            if (key.startsWith(prefix) && this._combinationConfirmStore.getAutoConfirmationIn(key, scope)) {
                const label = this._combinationConfirmStore.getLabel(key) ?? key;
                results.push({ key, label });
            }
        }
        return results;
    }
    manageConfirmationPreferences(tools, options) {
        // Helper to track tools under servers
        const trackServerTool = (serverId, label, toolId, serversWithTools) => {
            if (!serversWithTools.has(serverId)) {
                serversWithTools.set(serverId, { label, tools: new Set() });
            }
            serversWithTools.get(serverId).tools.add(toolId);
        };
        // Helper to add server tool from source
        const addServerToolFromSource = (source, toolId, serversWithTools) => {
            if (source.type === 'mcp') {
                trackServerTool(source.definitionId, source.serverLabel || source.label, toolId, serversWithTools);
            }
            else if (source.type === 'extension') {
                trackServerTool(source.extensionId.value, source.label, toolId, serversWithTools);
            }
        };
        // Determine which tools should be shown
        const relevantTools = new Set();
        const serversWithTools = new Map();
        // Add tools that request approval
        for (const tool of tools) {
            if (tool.canRequestPreApproval || tool.canRequestPostApproval || this._contributions.has(tool.id)) {
                relevantTools.add(tool.id);
                addServerToolFromSource(tool.source, tool.id, serversWithTools);
            }
        }
        // Add tools that have stored approvals (but we can't display them without metadata)
        for (const id of this._preExecutionToolConfirmStore.getAllConfirmed()) {
            if (!relevantTools.has(id)) {
                // Only add if we have the tool data
                const tool = tools.find(t => t.id === id);
                if (tool) {
                    relevantTools.add(id);
                    addServerToolFromSource(tool.source, id, serversWithTools);
                }
            }
        }
        for (const id of this._postExecutionToolConfirmStore.getAllConfirmed()) {
            if (!relevantTools.has(id)) {
                // Only add if we have the tool data
                const tool = tools.find(t => t.id === id);
                if (tool) {
                    relevantTools.add(id);
                    addServerToolFromSource(tool.source, id, serversWithTools);
                }
            }
        }
        // Add tools that have combination approvals
        for (const tool of tools) {
            if (!relevantTools.has(tool.id) && this._hasCombinationApprovalsForTool(tool.id)) {
                relevantTools.add(tool.id);
                addServerToolFromSource(tool.source, tool.id, serversWithTools);
            }
        }
        if (relevantTools.size === 0) {
            return; // Nothing to show
        }
        // Determine initial scope from options
        let currentScope = options?.defaultScope ?? 'workspace';
        // Helper function to build tree items based on current scope
        const buildTreeItems = () => {
            const treeItems = [];
            // Add server nodes
            for (const [serverId, serverInfo] of serversWithTools) {
                const serverChildren = [];
                // Add server-level controls as first children
                const hasAnyPre = Array.from(serverInfo.tools).some(toolId => {
                    const tool = tools.find(t => t.id === toolId);
                    return tool?.canRequestPreApproval;
                });
                const hasAnyPost = Array.from(serverInfo.tools).some(toolId => {
                    const tool = tools.find(t => t.id === toolId);
                    return tool?.canRequestPostApproval;
                });
                const serverPreConfirmed = this._preExecutionServerConfirmStore.getAutoConfirmationIn(serverId, currentScope);
                const serverPostConfirmed = this._postExecutionServerConfirmStore.getAutoConfirmationIn(serverId, currentScope);
                // Add individual tools from this server as children
                for (const toolId of serverInfo.tools) {
                    const tool = tools.find(t => t.id === toolId);
                    if (!tool) {
                        continue;
                    }
                    const toolChildren = [];
                    const hasPre = !serverPreConfirmed && (tool.canRequestPreApproval || this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope));
                    const hasPost = !serverPostConfirmed && (tool.canRequestPostApproval || this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope));
                    // Add child items for granular control when both approval types exist
                    if (hasPre && hasPost) {
                        toolChildren.push({
                            type: 'tool-pre',
                            toolId: tool.id,
                            label: RUN_WITHOUT_APPROVAL,
                            checked: this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope)
                        });
                        toolChildren.push({
                            type: 'tool-post',
                            toolId: tool.id,
                            label: CONTINUE_WITHOUT_REVIEWING_RESULTS,
                            checked: this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope)
                        });
                    }
                    // Add combination approval children
                    const combinationApprovals = this._getCombinationApprovalsForTool(tool.id, currentScope);
                    for (const { key, label } of combinationApprovals) {
                        toolChildren.push({
                            type: 'combination',
                            toolId: tool.id,
                            combinationKey: key,
                            label,
                            checked: true,
                        });
                    }
                    // Tool item always has a checkbox
                    const preApproval = this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
                    const postApproval = this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
                    let checked;
                    let description;
                    if (hasPre && hasPost) {
                        // Both: checkbox is mixed if only one is enabled
                        checked = preApproval && postApproval ? true : (!preApproval && !postApproval ? false : 'mixed');
                    }
                    else if (hasPre) {
                        checked = preApproval;
                        description = RUN_WITHOUT_APPROVAL;
                    }
                    else if (hasPost) {
                        checked = postApproval;
                        description = CONTINUE_WITHOUT_REVIEWING_RESULTS;
                    }
                    else if (toolChildren.length > 0) {
                        // Tool has combination approvals only
                        checked = false;
                    }
                    else {
                        continue;
                    }
                    serverChildren.push({
                        type: 'tool',
                        toolId: tool.id,
                        label: tool.displayName || tool.id,
                        description,
                        checked,
                        collapsed: true,
                        children: toolChildren.length > 0 ? toolChildren : undefined
                    });
                }
                serverChildren.sort((a, b) => a.label.localeCompare(b.label));
                if (hasAnyPost) {
                    serverChildren.unshift({
                        type: 'server-post',
                        serverId,
                        iconClass: ThemeIcon.asClassName(Codicon.play),
                        label: localize('continueWithoutReviewing', "Continue without reviewing any tool results"),
                        checked: serverPostConfirmed
                    });
                }
                if (hasAnyPre) {
                    serverChildren.unshift({
                        type: 'server-pre',
                        serverId,
                        iconClass: ThemeIcon.asClassName(Codicon.play),
                        label: localize('runToolsWithoutApproval', "Run any tool without approval"),
                        checked: serverPreConfirmed
                    });
                }
                // Server node has checkbox to control both pre and post
                const serverHasPre = this._preExecutionServerConfirmStore.getAutoConfirmationIn(serverId, currentScope);
                const serverHasPost = this._postExecutionServerConfirmStore.getAutoConfirmationIn(serverId, currentScope);
                let serverChecked;
                if (hasAnyPre && hasAnyPost) {
                    serverChecked = serverHasPre && serverHasPost ? true : (!serverHasPre && !serverHasPost ? false : 'mixed');
                }
                else if (hasAnyPre) {
                    serverChecked = serverHasPre;
                }
                else if (hasAnyPost) {
                    serverChecked = serverHasPost;
                }
                else {
                    serverChecked = false;
                }
                const existingItem = quickTree.itemTree.find(i => i.serverId === serverId);
                treeItems.push({
                    type: 'server',
                    serverId,
                    label: serverInfo.label,
                    checked: serverChecked,
                    children: serverChildren,
                    collapsed: existingItem ? quickTree.isCollapsed(existingItem) : true,
                    pickable: false
                });
            }
            // Add individual tool nodes (only for non-MCP/extension tools)
            const sortedTools = tools.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
            for (const tool of sortedTools) {
                if (!relevantTools.has(tool.id)) {
                    continue;
                }
                // Skip tools that belong to MCP/extension servers (they're shown under server nodes)
                if (tool.source.type === 'mcp' || tool.source.type === 'extension') {
                    continue;
                }
                const contributed = this._contributions.get(tool.id);
                const toolChildren = [];
                const manageActions = contributed?.getManageActions?.();
                if (manageActions) {
                    toolChildren.push(...manageActions.map(action => ({
                        type: 'manage',
                        ...action,
                    })));
                }
                let checked = false;
                let description;
                let pickable = false;
                if (contributed?.canUseDefaultApprovals !== false) {
                    pickable = true;
                    const hasPre = tool.canRequestPreApproval || this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
                    const hasPost = tool.canRequestPostApproval || this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
                    // Add child items for granular control when both approval types exist
                    if (hasPre && hasPost) {
                        toolChildren.push({
                            type: 'tool-pre',
                            toolId: tool.id,
                            label: RUN_WITHOUT_APPROVAL,
                            checked: this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope)
                        });
                        toolChildren.push({
                            type: 'tool-post',
                            toolId: tool.id,
                            label: CONTINUE_WITHOUT_REVIEWING_RESULTS,
                            checked: this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope)
                        });
                    }
                    // Add combination approval children
                    const combinationApprovals = this._getCombinationApprovalsForTool(tool.id, currentScope);
                    for (const { key, label } of combinationApprovals) {
                        toolChildren.push({
                            type: 'combination',
                            toolId: tool.id,
                            combinationKey: key,
                            label,
                            checked: true,
                        });
                    }
                    // Tool item always has a checkbox
                    const preApproval = this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
                    const postApproval = this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
                    if (hasPre && hasPost) {
                        // Both: checkbox is mixed if only one is enabled
                        checked = preApproval && postApproval ? true : (!preApproval && !postApproval ? false : 'mixed');
                    }
                    else if (hasPre) {
                        checked = preApproval;
                        description = RUN_WITHOUT_APPROVAL;
                    }
                    else if (hasPost) {
                        checked = postApproval;
                        description = CONTINUE_WITHOUT_REVIEWING_RESULTS;
                    }
                    else {
                        // No approval capabilities - shouldn't happen but handle it
                        checked = false;
                    }
                }
                treeItems.push({
                    type: 'tool',
                    toolId: tool.id,
                    label: tool.displayName || tool.id,
                    description,
                    checked,
                    pickable,
                    collapsed: tools.length > 1,
                    children: toolChildren.length > 0 ? toolChildren : undefined
                });
            }
            return treeItems;
        };
        const disposables = new DisposableStore();
        const quickTree = disposables.add(this._quickInputService.createQuickTree());
        quickTree.ignoreFocusOut = true;
        quickTree.sortByLabel = false;
        // Only show toggle if not in session scope
        if (currentScope !== 'session') {
            const scopeButton = {
                iconClass: ThemeIcon.asClassName(Codicon.folder),
                tooltip: localize('workspaceScope', "Configure for this workspace only"),
                toggle: { checked: currentScope === 'workspace' },
                location: QuickInputButtonLocation.Input
            };
            quickTree.buttons = [scopeButton];
            disposables.add(quickTree.onDidTriggerButton(button => {
                if (button === scopeButton) {
                    currentScope = currentScope === 'workspace' ? 'profile' : 'workspace';
                    updatePlaceholder();
                    quickTree.setItemTree(buildTreeItems());
                }
            }));
        }
        const updatePlaceholder = () => {
            if (currentScope === 'session') {
                quickTree.placeholder = localize('configureSessionToolApprovals', "Configure session tool approvals");
            }
            else {
                quickTree.placeholder = currentScope === 'workspace'
                    ? localize('configureWorkspaceToolApprovals', "Configure workspace tool approvals")
                    : localize('configureGlobalToolApprovals', "Configure global tool approvals");
            }
        };
        updatePlaceholder();
        quickTree.setItemTree(buildTreeItems());
        disposables.add(quickTree.onDidChangeCheckboxState(item => {
            const newState = item.checked ? currentScope : 'never';
            if (item.type === 'server' && item.serverId) {
                // Server-level checkbox: update both pre and post based on server capabilities
                const serverInfo = serversWithTools.get(item.serverId);
                if (serverInfo) {
                    this._preExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
                    this._postExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
                }
            }
            else if (item.type === 'tool' && item.toolId) {
                const tool = tools.find(t => t.id === item.toolId);
                if (tool?.canRequestPostApproval || newState === 'never') {
                    this._postExecutionToolConfirmStore.setAutoConfirmation(item.toolId, newState);
                }
                if (tool?.canRequestPreApproval || newState === 'never') {
                    this._preExecutionToolConfirmStore.setAutoConfirmation(item.toolId, newState);
                }
                // Also clear combination approvals when unchecking the tool
                if (newState === 'never') {
                    for (const key of this._combinationConfirmStore.getAllConfirmed()) {
                        if (key.startsWith(item.toolId + ':combination:')) {
                            this._combinationConfirmStore.setAutoConfirmation(key, 'never');
                        }
                    }
                }
                quickTree.setItemTree(buildTreeItems());
            }
            else if (item.type === 'tool-pre' && item.toolId) {
                this._preExecutionToolConfirmStore.setAutoConfirmation(item.toolId, newState);
            }
            else if (item.type === 'tool-post' && item.toolId) {
                this._postExecutionToolConfirmStore.setAutoConfirmation(item.toolId, newState);
            }
            else if (item.type === 'server-pre' && item.serverId) {
                this._preExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
                quickTree.setItemTree(buildTreeItems());
            }
            else if (item.type === 'server-post' && item.serverId) {
                this._postExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
                quickTree.setItemTree(buildTreeItems());
            }
            else if (item.type === 'manage') {
                item.onDidChangeChecked?.(!!item.checked);
            }
            else if (item.type === 'combination' && item.combinationKey) {
                this._combinationConfirmStore.setAutoConfirmation(item.combinationKey, newState);
                quickTree.setItemTree(buildTreeItems());
            }
        }));
        disposables.add(quickTree.onDidTriggerItemButton(i => {
            if (i.item.type === 'manage') {
                i.item.onDidTriggerItemButton?.(i.button);
            }
        }));
        disposables.add(quickTree.onDidAccept(async () => {
            const manageItem = quickTree.activeItems.find(i => i.type === 'manage');
            if (manageItem) {
                quickTree.hide();
                await manageItem.onDidOpen?.();
                this.manageConfirmationPreferences(tools, options);
            }
            else {
                quickTree.hide();
            }
        }));
        disposables.add(quickTree.onDidHide(() => {
            disposables.dispose();
        }));
        quickTree.show();
        // If a focus tool was specified, expand its parent and set it as active.
        // Must happen after show() since the tree data is applied via autorun on visibility.
        if (options?.focusToolId) {
            const focusToolId = options.focusToolId;
            for (const serverItem of quickTree.itemTree) {
                const serverItemTyped = serverItem;
                if (serverItemTyped.children) {
                    const toolItem = serverItemTyped.children.find(c => c.type === 'tool' && c.toolId === focusToolId);
                    if (toolItem) {
                        quickTree.expand(serverItem);
                        quickTree.reveal(toolItem);
                        break;
                    }
                }
            }
        }
    }
    resetToolAutoConfirmation() {
        this._preExecutionToolConfirmStore.reset();
        this._postExecutionToolConfirmStore.reset();
        this._preExecutionServerConfirmStore.reset();
        this._postExecutionServerConfirmStore.reset();
        this._combinationConfirmStore.reset();
        // Reset all contributions
        for (const contribution of this._contributions.values()) {
            contribution.reset?.();
        }
    }
};
LanguageModelToolsConfirmationService = __decorate([
    __param(0, IInstantiationService),
    __param(1, IQuickInputService)
], LanguageModelToolsConfirmationService);
export { LanguageModelToolsConfirmationService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQStCLGtCQUFrQixFQUFrQix3QkFBd0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3BLLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sbURBQW1ELENBQUM7QUFLakgsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztBQUNoRixNQUFNLGtDQUFrQyxHQUFHLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO0FBY25ILE1BQU0sbUJBQW9CLFNBQVEsVUFBVTtJQUszQyxZQUNrQixXQUFtQixFQUNuQixxQkFBNEM7UUFFN0QsS0FBSyxFQUFFLENBQUM7UUFIUyxnQkFBVyxHQUFYLFdBQVcs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