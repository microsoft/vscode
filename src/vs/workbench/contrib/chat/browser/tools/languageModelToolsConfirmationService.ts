/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../base/common/map.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputButton, IQuickInputButtonWithToggle, IQuickInputService, IQuickTreeItem, QuickInputButtonLocation } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfirmedReason, ToolConfirmKind } from '../../common/chatService/chatService.js';
import { isAutoApprovePolicyRestricted } from '../../common/agentHostConfigPolicy.js';
import { ILanguageModelToolConfirmationActions, ILanguageModelToolConfirmationContribution, ILanguageModelToolConfirmationContributionQuickTreeItem, ILanguageModelToolConfirmationRef, ILanguageModelToolsConfirmationService, IToolPreApprovalStore } from '../../common/tools/languageModelToolsConfirmationService.js';
import { IToolData, ToolDataSource } from '../../common/tools/languageModelToolsService.js';

const RUN_WITHOUT_APPROVAL = localize('runWithoutApproval', "without approval");
const CONTINUE_WITHOUT_REVIEWING_RESULTS = localize('continueWithoutReviewingResults', "without reviewing result");

/**
 * Represents an auto-confirmation entry in the confirm store.
 * When `confirmed` is true, the tool/combination is auto-confirmed.
 * When `label` is set, it provides a human-readable description
 * for display in the management UI.
 */
interface IAutoConfirmEntry {
	readonly confirmed: true;
	readonly label?: string;
	readonly arguments?: string;
}


class GenericConfirmStore extends Disposable {
	private _workspaceStore: Lazy<ToolConfirmStore>;
	private _profileStore: Lazy<ToolConfirmStore>;
	private _memoryStore = new Map<string, IAutoConfirmEntry>();

	constructor(
		private readonly _storageKey: string,
		private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._workspaceStore = new Lazy(() => this._register(this._instantiationService.createInstance(ToolConfirmStore, StorageScope.WORKSPACE, this._storageKey)));
		this._profileStore = new Lazy(() => this._register(this._instantiationService.createInstance(ToolConfirmStore, StorageScope.PROFILE, this._storageKey)));
	}

	public setAutoConfirmation(id: string, scope: 'workspace' | 'profile' | 'session' | 'never', label?: string, args?: string): void {
		// Clear from all scopes first
		this._workspaceStore.value.setAutoConfirm(id, undefined);
		this._profileStore.value.setAutoConfirm(id, undefined);
		this._memoryStore.delete(id);

		const entry: IAutoConfirmEntry = { confirmed: true, label, arguments: args };
		// Set in the appropriate scope
		if (scope === 'workspace') {
			this._workspaceStore.value.setAutoConfirm(id, entry);
		} else if (scope === 'profile') {
			this._profileStore.value.setAutoConfirm(id, entry);
		} else if (scope === 'session') {
			this._memoryStore.set(id, entry);
		}
	}

	public getAutoConfirmation(id: string): 'workspace' | 'profile' | 'session' | 'never' {
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

	public getAutoConfirmationIn(id: string, scope: 'workspace' | 'profile' | 'session'): boolean {
		if (scope === 'workspace') {
			return !!this._workspaceStore.value.getAutoConfirm(id);
		} else if (scope === 'profile') {
			return !!this._profileStore.value.getAutoConfirm(id);
		} else {
			return this._memoryStore.has(id);
		}
	}

	public getLabel(id: string): string | undefined {
		return this._workspaceStore.value.getAutoConfirm(id)?.label
			?? this._profileStore.value.getAutoConfirm(id)?.label
			?? this._memoryStore.get(id)?.label;
	}

	public getArguments(id: string): string | undefined {
		return this._workspaceStore.value.getAutoConfirm(id)?.arguments
			?? this._profileStore.value.getAutoConfirm(id)?.arguments
			?? this._memoryStore.get(id)?.arguments;
	}

	public reset(): void {
		this._workspaceStore.value.reset();
		this._profileStore.value.reset();
		this._memoryStore.clear();
	}

	public checkAutoConfirmation(id: string): ConfirmedReason | undefined {
		if (this._workspaceStore.value.getAutoConfirm(id)) {
			return { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' };
		}
		if (this._profileStore.value.getAutoConfirm(id)) {
			return { type: ToolConfirmKind.LmServicePerTool, scope: 'profile' };
		}
		if (this._memoryStore.has(id)) {
			return { type: ToolConfirmKind.LmServicePerTool, scope: 'session' };
		}
		return undefined;
	}

	public getAllConfirmed(): Set<string> {
		const all = new Set<string>();
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

class ToolConfirmStore extends Disposable {
	private _autoConfirmTools: LRUCache<string, IAutoConfirmEntry> = new LRUCache<string, IAutoConfirmEntry>(100);
	private _didChange = false;

	constructor(
		private readonly _scope: StorageScope,
		private readonly _storageKey: string,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		// Read stored data — supports both legacy string[] and new Record<string, string | boolean | object> formats
		const raw = storageService.get(this._storageKey, this._scope);
		if (raw) {
			try {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					// Legacy format: string[]
					for (const key of parsed) {
						this._autoConfirmTools.set(key, { confirmed: true });
					}
				} else if (typeof parsed === 'object' && parsed !== null) {
					for (const [key, value] of Object.entries(parsed)) {
						if (typeof value === 'object' && value !== null) {
							// New format: { label?: string; arguments?: string }
							const obj = value as { label?: string; arguments?: string };
							this._autoConfirmTools.set(key, { confirmed: true, label: obj.label, arguments: obj.arguments });
						} else {
							// Legacy format: string | boolean
							this._autoConfirmTools.set(key, { confirmed: true, label: typeof value === 'string' ? value : undefined });
						}
					}
				}
			} catch {
				// Ignore malformed data
			}
		}

		this._register(storageService.onWillSaveState(() => {
			if (this._didChange) {
				const data: Record<string, string | boolean | { label?: string; arguments?: string }> = {};
				for (const [key, entry] of this._autoConfirmTools) {
					if (entry.arguments) {
						data[key] = { label: entry.label, arguments: entry.arguments };
					} else {
						data[key] = entry.label ?? true;
					}
				}
				this.storageService.store(this._storageKey, JSON.stringify(data), this._scope, StorageTarget.MACHINE);
				this._didChange = false;
			}
		}));
	}

	public reset() {
		this._autoConfirmTools.clear();
		this._didChange = true;
	}

	public getAutoConfirm(id: string): IAutoConfirmEntry | undefined {
		const entry = this._autoConfirmTools.get(id);
		if (entry) {
			this._didChange = true;
			return entry;
		}
		return undefined;
	}

	public setAutoConfirm(id: string, entry: IAutoConfirmEntry | undefined): void {
		if (!entry) {
			this._autoConfirmTools.delete(id);
		} else {
			this._autoConfirmTools.set(id, entry);
		}
		this._didChange = true;
	}

	public getAll(): string[] {
		return [...this._autoConfirmTools.keys()];
	}
}

export class LanguageModelToolsConfirmationService extends Disposable implements ILanguageModelToolsConfirmationService {
	declare readonly _serviceBrand: undefined;

	private _preExecutionToolConfirmStore: GenericConfirmStore;
	private _postExecutionToolConfirmStore: GenericConfirmStore;
	private _preExecutionServerConfirmStore: GenericConfirmStore;
	private _postExecutionServerConfirmStore: GenericConfirmStore;
	private _combinationConfirmStore: GenericConfirmStore;

	private _contributions = new Map<string, ILanguageModelToolConfirmationContribution>();

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._preExecutionToolConfirmStore = this._register(new GenericConfirmStore('chat/autoconfirm', this._instantiationService));
		this._postExecutionToolConfirmStore = this._register(new GenericConfirmStore('chat/autoconfirm-post', this._instantiationService));
		this._preExecutionServerConfirmStore = this._register(new GenericConfirmStore('chat/servers/autoconfirm', this._instantiationService));
		this._postExecutionServerConfirmStore = this._register(new GenericConfirmStore('chat/servers/autoconfirm-post', this._instantiationService));
		this._combinationConfirmStore = this._register(new GenericConfirmStore('chat/autoconfirm-combination', this._instantiationService));
	}

	getPreConfirmAction(ref: ILanguageModelToolConfirmationRef): ConfirmedReason | undefined {
		// Check contribution first
		const contribution = this._contributions.get(ref.toolId);
		if (contribution?.getPreConfirmAction) {
			const result = contribution.getPreConfirmAction(ref);
			if (result) {
				return result;
			}
		}

		// If contribution disables default permissions, don't check default stores
		if (contribution && contribution.canUseDefaultApprovals === false) {
			return undefined;
		}

		if (isAutoApprovePolicyRestricted(this._configurationService)) {
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

	getPostConfirmAction(ref: ILanguageModelToolConfirmationRef): ConfirmedReason | undefined {
		// Check contribution first
		const contribution = this._contributions.get(ref.toolId);
		if (contribution?.getPostConfirmAction) {
			const result = contribution.getPostConfirmAction(ref);
			if (result) {
				return result;
			}
		}

		// If contribution disables default permissions, don't check default stores
		if (contribution && contribution.canUseDefaultApprovals === false) {
			return undefined;
		}

		if (isAutoApprovePolicyRestricted(this._configurationService)) {
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

	getPreConfirmActions(ref: ILanguageModelToolConfirmationRef): ILanguageModelToolConfirmationActions[] {
		const actions: ILanguageModelToolConfirmationActions[] = [];

		// Add contribution actions first
		const contribution = this._contributions.get(ref.toolId);
		if (contribution?.getPreConfirmActions) {
			actions.push(...contribution.getPreConfirmActions(ref));
		}

		// If contribution disables default permissions, only return contribution actions
		if (contribution && contribution.canUseDefaultApprovals === false) {
			return actions;
		}

		if (isAutoApprovePolicyRestricted(this._configurationService)) {
			return actions;
		}

		// Add combination-level actions when approveCombination is provided
		if (ref.combination) {
			const { label: combinationLabel, key: combinationKey, arguments: combinationArgs } = ref.combination;
			actions.push(
				{
					label: localize('allowCombinationSession', '{0} in this Session', combinationLabel),
					detail: localize('allowCombinationSessionTooltip', 'Allow this particular combination of tool and arguments in this session without confirmation.'),
					divider: !!actions.length,
					scope: 'session',
					select: async () => {
						this._combinationConfirmStore.setAutoConfirmation(combinationKey, 'session', combinationLabel, combinationArgs);
						return true;
					}
				},
				{
					label: localize('allowCombinationWorkspace', '{0} in this Workspace', combinationLabel),
					detail: localize('allowCombinationWorkspaceTooltip', 'Allow this particular combination of tool and arguments in this workspace without confirmation.'),
					scope: 'workspace',
					select: async () => {
						this._combinationConfirmStore.setAutoConfirmation(combinationKey, 'workspace', combinationLabel, combinationArgs);
						return true;
					}
				},
				{
					label: localize('allowCombinationGlobally', 'Always {0}', combinationLabel),
					detail: localize('allowCombinationGloballyTooltip', 'Always allow this particular combination of tool and arguments without confirmation.'),
					scope: 'profile',
					select: async () => {
						this._combinationConfirmStore.setAutoConfirmation(combinationKey, 'profile', combinationLabel, combinationArgs);
						return true;
					}
				},
			);
		}

		// Add default tool-level actions
		actions.push(
			{
				label: localize('allowSession', 'Allow in this Session'),
				detail: localize('allowSessionTooltip', 'Allow this tool to run in this session without confirmation.'),
				divider: !!actions.length,
				scope: 'session',
				select: async () => {
					this._preExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, 'session');
					return true;
				}
			},
			{
				label: localize('allowWorkspace', 'Allow in this Workspace'),
				detail: localize('allowWorkspaceTooltip', 'Allow this tool to run in this workspace without confirmation.'),
				scope: 'workspace',
				select: async () => {
					this._preExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, 'workspace');
					return true;
				}
			},
			{
				label: localize('allowGlobally', 'Always Allow'),
				detail: localize('allowGloballyTooltip', 'Always allow this tool to run without confirmation.'),
				scope: 'profile',
				select: async () => {
					this._preExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, 'profile');
					return true;
				}
			}
		);

		// Add server-level actions for MCP tools
		if (ref.source.type === 'mcp') {
			const { serverLabel, definitionId } = ref.source;
			actions.push(
				{
					label: localize('allowServerSession', 'Allow Tools from {0} in this Session', serverLabel),
					detail: localize('allowServerSessionTooltip', 'Allow all tools from this server to run in this session without confirmation.'),
					divider: true,
					scope: 'session',
					select: async () => {
						this._preExecutionServerConfirmStore.setAutoConfirmation(definitionId, 'session');
						return true;
					}
				},
				{
					label: localize('allowServerWorkspace', 'Allow Tools from {0} in this Workspace', serverLabel),
					detail: localize('allowServerWorkspaceTooltip', 'Allow all tools from this server to run in this workspace without confirmation.'),
					scope: 'workspace',
					select: async () => {
						this._preExecutionServerConfirmStore.setAutoConfirmation(definitionId, 'workspace');
						return true;
					}
				},
				{
					label: localize('allowServerGlobally', 'Always Allow Tools from {0}', serverLabel),
					detail: localize('allowServerGloballyTooltip', 'Always allow all tools from this server to run without confirmation.'),
					scope: 'profile',
					select: async () => {
						this._preExecutionServerConfirmStore.setAutoConfirmation(definitionId, 'profile');
						return true;
					}
				}
			);
		}

		return actions;
	}

	getPostConfirmActions(ref: ILanguageModelToolConfirmationRef): ILanguageModelToolConfirmationActions[] {
		const actions: ILanguageModelToolConfirmationActions[] = [];

		// Add contribution actions first
		const contribution = this._contributions.get(ref.toolId);
		if (contribution?.getPostConfirmActions) {
			actions.push(...contribution.getPostConfirmActions(ref));
		}

		// If contribution disables default permissions, only return contribution actions
		if (contribution && contribution.canUseDefaultApprovals === false) {
			return actions;
		}

		if (isAutoApprovePolicyRestricted(this._configurationService)) {
			return actions;
		}

		// Add default tool-level actions
		actions.push(
			{
				label: localize('allowSessionPost', 'Allow Without Review in this Session'),
				detail: localize('allowSessionPostTooltip', 'Allow results from this tool to be sent without confirmation in this session.'),
				divider: !!actions.length,
				scope: 'session',
				select: async () => {
					this._postExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, 'session');
					return true;
				}
			},
			{
				label: localize('allowWorkspacePost', 'Allow Without Review in this Workspace'),
				detail: localize('allowWorkspacePostTooltip', 'Allow results from this tool to be sent without confirmation in this workspace.'),
				scope: 'workspace',
				select: async () => {
					this._postExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, 'workspace');
					return true;
				}
			},
			{
				label: localize('allowGloballyPost', 'Always Allow Without Review'),
				detail: localize('allowGloballyPostTooltip', 'Always allow results from this tool to be sent without confirmation.'),
				scope: 'profile',
				select: async () => {
					this._postExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, 'profile');
					return true;
				}
			}
		);

		// Add server-level actions for MCP tools
		if (ref.source.type === 'mcp') {
			const { serverLabel, definitionId } = ref.source;
			actions.push(
				{
					label: localize('allowServerSessionPost', 'Allow Tools from {0} Without Review in this Session', serverLabel),
					detail: localize('allowServerSessionPostTooltip', 'Allow results from all tools from this server to be sent without confirmation in this session.'),
					divider: true,
					scope: 'session',
					select: async () => {
						this._postExecutionServerConfirmStore.setAutoConfirmation(definitionId, 'session');
						return true;
					}
				},
				{
					label: localize('allowServerWorkspacePost', 'Allow Tools from {0} Without Review in this Workspace', serverLabel),
					detail: localize('allowServerWorkspacePostTooltip', 'Allow results from all tools from this server to be sent without confirmation in this workspace.'),
					scope: 'workspace',
					select: async () => {
						this._postExecutionServerConfirmStore.setAutoConfirmation(definitionId, 'workspace');
						return true;
					}
				},
				{
					label: localize('allowServerGloballyPost', 'Always Allow Tools from {0} Without Review', serverLabel),
					detail: localize('allowServerGloballyPostTooltip', 'Always allow results from all tools from this server to be sent without confirmation.'),
					scope: 'profile',
					select: async () => {
						this._postExecutionServerConfirmStore.setAutoConfirmation(definitionId, 'profile');
						return true;
					}
				}
			);
		}

		return actions;
	}

	registerConfirmationContribution(toolName: string, contribution: ILanguageModelToolConfirmationContribution): IDisposable {
		this._contributions.set(toolName, contribution);
		return {
			dispose: () => {
				this._contributions.delete(toolName);
			}
		};
	}

	toolCanManageConfirmation(tool: IToolData): boolean {
		return !!tool.canRequestPreApproval
			|| !!tool.canRequestPostApproval
			|| this._contributions.has(tool.id)
			|| !!this._preExecutionToolConfirmStore.checkAutoConfirmation(tool.id)
			|| !!this._postExecutionToolConfirmStore.checkAutoConfirmation(tool.id)
			|| this._hasCombinationApprovalsForTool(tool.id);
	}

	private _hasCombinationApprovalsForTool(toolId: string): boolean {
		const prefix = toolId + ':combination:';
		for (const key of this._combinationConfirmStore.getAllConfirmed()) {
			if (key.startsWith(prefix)) {
				return true;
			}
		}
		return false;
	}

	private _getCombinationApprovalsForTool(toolId: string, scope: 'workspace' | 'profile' | 'session'): { key: string; label: string; arguments?: string }[] {
		const prefix = toolId + ':combination:';
		const results: { key: string; label: string; arguments?: string }[] = [];
		for (const key of this._combinationConfirmStore.getAllConfirmed()) {
			if (key.startsWith(prefix) && this._combinationConfirmStore.getAutoConfirmationIn(key, scope)) {
				const label = this._combinationConfirmStore.getLabel(key) ?? key;
				const args = this._combinationConfirmStore.getArguments(key);
				results.push({ key, label, arguments: args });
			}
		}
		return results;
	}

	manageConfirmationPreferences(tools: readonly IToolData[], options?: { defaultScope?: 'workspace' | 'profile' | 'session'; focusToolId?: string; preApprovalStore?: IToolPreApprovalStore }): void {
		interface IToolTreeItem extends IQuickTreeItem {
			type: 'tool' | 'server' | 'tool-pre' | 'tool-post' | 'server-pre' | 'server-post' | 'manage' | 'combination';
			toolId?: string;
			serverId?: string;
			scope?: 'workspace' | 'profile';
			combinationKey?: string;
			combinationArgs?: string;
			manageActionIndex?: number;
		}

		const manageActionSequencer = new Sequencer();
		const uncheckedManageActions = new Map<string, { item: IToolTreeItem; index: number }>();
		const preApprovalStore = options?.preApprovalStore;

		const viewArgsButton: IQuickInputButton = {
			iconClass: ThemeIcon.asClassName(Codicon.info),
			tooltip: localize('viewCombinationArguments', "View Arguments"),
		};

		// Helper to track tools under servers
		const trackServerTool = (serverId: string, label: string, toolId: string, serversWithTools: Map<string, { label: string; tools: Set<string> }>) => {
			if (!serversWithTools.has(serverId)) {
				serversWithTools.set(serverId, { label, tools: new Set() });
			}
			serversWithTools.get(serverId)!.tools.add(toolId);
		};

		// Helper to add server tool from source
		const addServerToolFromSource = (source: ToolDataSource, toolId: string, serversWithTools: Map<string, { label: string; tools: Set<string> }>) => {
			if (source.type === 'mcp') {
				trackServerTool(source.definitionId, source.serverLabel || source.label, toolId, serversWithTools);
			} else if (!preApprovalStore && source.type === 'extension') {
				trackServerTool(source.extensionId.value, source.label, toolId, serversWithTools);
			}
		};

		// Determine which tools should be shown
		let allTools = tools;
		const relevantTools = new Set<string>();
		const serversWithTools = new Map<string, { label: string; tools: Set<string> }>();
		const updateTools = (discoveredTools: readonly IToolData[]) => {
			allTools = preApprovalStore ? [...new Map([...tools, ...discoveredTools].map(tool => [tool.id, tool])).values()] : tools;
			relevantTools.clear();
			serversWithTools.clear();
			for (const server of preApprovalStore?.servers ?? []) {
				serversWithTools.set(server.id, { label: server.label, tools: new Set() });
			}
			for (const tool of allTools) {
				if (preApprovalStore
					? (tool.source.type === 'mcp' && tool.canRequestPreApproval) || this._contributions.has(tool.id)
					: tool.canRequestPreApproval || tool.canRequestPostApproval || this._contributions.has(tool.id)) {
					relevantTools.add(tool.id);
					addServerToolFromSource(tool.source, tool.id, serversWithTools);
				}
			}
		};
		updateTools(preApprovalStore?.discoveredTools?.get() ?? []);

		if (!preApprovalStore) {
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
		}

		if (relevantTools.size === 0 && serversWithTools.size === 0 && !preApprovalStore?.isDiscovering?.get()) {
			return; // Nothing to show
		}

		// Determine initial scope from options
		let currentScope = options?.defaultScope ?? 'workspace';
		const isServerPreApproved = (serverId: string) => preApprovalStore
			? preApprovalStore.isServerApproved(serverId)
			: this._preExecutionServerConfirmStore.getAutoConfirmationIn(serverId, currentScope);
		const isToolPreApproved = (tool: IToolData) => preApprovalStore
			? preApprovalStore.isToolApproved(tool)
			: this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);

		// Helper function to build tree items based on current scope
		const buildTreeItems = (): IToolTreeItem[] => {
			const treeItems: IToolTreeItem[] = [];
			const defaultApprovalsDisabled = isAutoApprovePolicyRestricted(this._configurationService);

			// Add server nodes
			for (const [serverId, serverInfo] of serversWithTools) {
				const serverChildren: IToolTreeItem[] = [];

				// Add server-level controls as first children
				const hasAnyPre = !!preApprovalStore || Array.from(serverInfo.tools).some(toolId => {
					const tool = allTools.find(t => t.id === toolId);
					return tool?.canRequestPreApproval;
				});
				const hasAnyPost = !preApprovalStore && Array.from(serverInfo.tools).some(toolId => {
					const tool = allTools.find(t => t.id === toolId);
					return tool?.canRequestPostApproval;
				});

				const serverPreConfirmed = isServerPreApproved(serverId);
				const serverPostConfirmed = !preApprovalStore && this._postExecutionServerConfirmStore.getAutoConfirmationIn(serverId, currentScope);

				// Add individual tools from this server as children
				for (const toolId of serverInfo.tools) {
					const tool = allTools.find(t => t.id === toolId);
					if (!tool) {
						continue;
					}

					const toolChildren: IToolTreeItem[] = [];
					const hasPre = !serverPreConfirmed && (tool.canRequestPreApproval || isToolPreApproved(tool));
					const hasPost = !preApprovalStore && !serverPostConfirmed && (tool.canRequestPostApproval || this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope));

					// Add child items for granular control when both approval types exist
					if (hasPre && hasPost) {
						toolChildren.push({
							id: `tool-pre/${tool.id}`,
							type: 'tool-pre',
							toolId: tool.id,
							label: RUN_WITHOUT_APPROVAL,
							disabled: defaultApprovalsDisabled,
							checked: isToolPreApproved(tool)
						});
						toolChildren.push({
							id: `tool-post/${tool.id}`,
							type: 'tool-post',
							toolId: tool.id,
							label: CONTINUE_WITHOUT_REVIEWING_RESULTS,
							disabled: defaultApprovalsDisabled,
							checked: this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope)
						});
					}

					// Add combination approval children
					const combinationApprovals = preApprovalStore ? [] : this._getCombinationApprovalsForTool(tool.id, currentScope);
					for (const { key, label, arguments: args } of combinationApprovals) {
						toolChildren.push({
							id: `combination/${key}`,
							type: 'combination',
							toolId: tool.id,
							combinationKey: key,
							combinationArgs: args,
							label,
							disabled: defaultApprovalsDisabled,
							checked: true,
							buttons: args ? [viewArgsButton] : undefined,
						});
					}

					// Tool item always has a checkbox
					const preApproval = isToolPreApproved(tool);
					const postApproval = !preApprovalStore && this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
					let checked: boolean | 'mixed';
					let description: string | undefined;

					if (hasPre && hasPost) {
						// Both: checkbox is mixed if only one is enabled
						checked = preApproval && postApproval ? true : (!preApproval && !postApproval ? false : 'mixed');
					} else if (hasPre) {
						checked = preApproval;
						description = RUN_WITHOUT_APPROVAL;
					} else if (hasPost) {
						checked = postApproval;
						description = CONTINUE_WITHOUT_REVIEWING_RESULTS;
					} else if (toolChildren.length > 0) {
						// Tool has combination approvals only
						checked = false;
					} else {
						continue;
					}

					// Skip tools with no active approvals, no children, and no approval capabilities.
					// Tools that can request pre/post approval should always remain visible.
					if (checked === false && toolChildren.length === 0 && !tool.canRequestPreApproval && !tool.canRequestPostApproval) {
						continue;
					}

					serverChildren.push({
						id: `tool/${tool.id}`,
						type: 'tool',
						toolId: tool.id,
						label: tool.displayName || tool.id,
						description,
						disabled: defaultApprovalsDisabled,
						checked,
						collapsed: true,
						children: toolChildren.length > 0 ? toolChildren : undefined
					});
				}

				serverChildren.sort((a, b) => a.label.localeCompare(b.label));

				if (hasAnyPost) {
					serverChildren.unshift({
						id: `server-post/${serverId}`,
						type: 'server-post',
						serverId,
						iconClass: ThemeIcon.asClassName(Codicon.play),
						label: localize('continueWithoutReviewing', "Continue without reviewing any tool results"),
						disabled: defaultApprovalsDisabled,
						checked: serverPostConfirmed
					});
				}
				if (hasAnyPre) {
					serverChildren.unshift({
						id: `server-pre/${serverId}`,
						type: 'server-pre',
						serverId,
						iconClass: ThemeIcon.asClassName(Codicon.play),
						label: localize('runToolsWithoutApproval', "Run any tool without approval"),
						disabled: defaultApprovalsDisabled,
						checked: serverPreConfirmed
					});
				}

				// Server node has checkbox to control both pre and post
				const serverHasPre = isServerPreApproved(serverId);
				const serverHasPost = !preApprovalStore && this._postExecutionServerConfirmStore.getAutoConfirmationIn(serverId, currentScope);
				let serverChecked: boolean | 'mixed';
				if (hasAnyPre && hasAnyPost) {
					serverChecked = serverHasPre && serverHasPost ? true : (!serverHasPre && !serverHasPost ? false : 'mixed');
				} else if (hasAnyPre) {
					serverChecked = serverHasPre;
				} else if (hasAnyPost) {
					serverChecked = serverHasPost;
				} else {
					serverChecked = false;
				}

				treeItems.push({
					id: `server/${serverId}`,
					type: 'server',
					serverId,
					label: serverInfo.label,
					disabled: defaultApprovalsDisabled,
					checked: serverChecked,
					children: serverChildren,
					collapsed: true,
					pickable: false
				});
			}

			// Add individual tool nodes (only for non-MCP/extension tools)
			const sortedTools = allTools.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
			for (const tool of sortedTools) {
				if (!relevantTools.has(tool.id)) {
					continue;
				}

				// Skip tools that belong to MCP/extension servers (they're shown under server nodes)
				if (tool.source.type === 'mcp' || (!preApprovalStore && tool.source.type === 'extension')) {
					continue;
				}

				const contributed = this._contributions.get(tool.id);
				const toolChildren: IToolTreeItem[] = [];

				const manageActions: IToolTreeItem[] = (contributed?.getManageActions?.() ?? []).map(action => ({
					type: 'manage',
					...action,
					id: `manage/${tool.id}/${action.id ?? action.label}`,
					toolId: tool.id,
				}));
				for (const [id, retained] of [...uncheckedManageActions].sort((a, b) => a[1].index - b[1].index)) {
					if (retained.item.toolId !== tool.id) {
						continue;
					}
					const freshAction = manageActions.find(action => action.id === id);
					if (freshAction?.checked) {
						uncheckedManageActions.delete(id);
					} else if (!freshAction) {
						manageActions.splice(Math.min(retained.index, manageActions.length), 0, { ...retained.item, checked: false });
					}
				}
				toolChildren.push(...manageActions.map((action, index) => ({ ...action, manageActionIndex: index })));

				if (preApprovalStore && toolChildren.length === 0) {
					continue;
				}

				let checked: boolean | 'mixed' = false;
				let description: string | undefined;
				let pickable = false;

				if (!preApprovalStore && contributed?.canUseDefaultApprovals !== false) {
					pickable = true;
					const hasPre = tool.canRequestPreApproval || this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
					const hasPost = tool.canRequestPostApproval || this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);

					// Add child items for granular control when both approval types exist
					if (hasPre && hasPost) {
						toolChildren.push({
							id: `tool-pre/${tool.id}`,
							type: 'tool-pre',
							toolId: tool.id,
							label: RUN_WITHOUT_APPROVAL,
							disabled: defaultApprovalsDisabled,
							checked: this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope)
						});
						toolChildren.push({
							id: `tool-post/${tool.id}`,
							type: 'tool-post',
							toolId: tool.id,
							label: CONTINUE_WITHOUT_REVIEWING_RESULTS,
							disabled: defaultApprovalsDisabled,
							checked: this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope)
						});
					}

					// Add combination approval children
					const combinationApprovals = this._getCombinationApprovalsForTool(tool.id, currentScope);
					for (const { key, label, arguments: args } of combinationApprovals) {
						toolChildren.push({
							id: `combination/${key}`,
							type: 'combination',
							toolId: tool.id,
							combinationKey: key,
							combinationArgs: args,
							label,
							disabled: defaultApprovalsDisabled,
							checked: true,
							buttons: args ? [viewArgsButton] : undefined,
						});
					}

					// Tool item always has a checkbox
					const preApproval = this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
					const postApproval = this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);

					if (hasPre && hasPost) {
						// Both: checkbox is mixed if only one is enabled
						checked = preApproval && postApproval ? true : (!preApproval && !postApproval ? false : 'mixed');
					} else if (hasPre) {
						checked = preApproval;
						description = RUN_WITHOUT_APPROVAL;
					} else if (hasPost) {
						checked = postApproval;
						description = CONTINUE_WITHOUT_REVIEWING_RESULTS;
					} else {
						// No approval capabilities - shouldn't happen but handle it
						checked = false;
					}
				}

				// Skip tools with no active approvals, no children, and no approval capabilities.
				// Tools that can request pre/post approval should always remain visible.
				if (checked === false && toolChildren.length === 0 && !tool.canRequestPreApproval && !tool.canRequestPostApproval && !this._contributions.has(tool.id)) {
					continue;
				}

				treeItems.push({
					id: `tool/${tool.id}`,
					type: 'tool',
					toolId: tool.id,
					label: tool.displayName || tool.id,
					description,
					disabled: defaultApprovalsDisabled && contributed?.canUseDefaultApprovals !== false,
					checked,
					pickable,
					collapsed: preApprovalStore ? true : allTools.length > 1,
					children: toolChildren.length > 0 ? toolChildren : undefined
				});
			}

			return treeItems;
		};

		const disposables = new DisposableStore();
		const quickTree = disposables.add(this._quickInputService.createQuickTree<IToolTreeItem>());
		quickTree.ignoreFocusOut = true;
		quickTree.sortByLabel = false;

		// Only show toggle if not in session scope
		if (!preApprovalStore && currentScope !== 'session') {
			const scopeButton: IQuickInputButtonWithToggle = {
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
			if (preApprovalStore) {
				quickTree.placeholder = preApprovalStore.placeholder;
			} else if (currentScope === 'session') {
				quickTree.placeholder = localize('configureSessionToolApprovals', "Configure session tool approvals");
			} else {
				quickTree.placeholder = currentScope === 'workspace'
					? localize('configureWorkspaceToolApprovals', "Configure workspace tool approvals")
					: localize('configureGlobalToolApprovals', "Configure global tool approvals");
			}
		};
		updatePlaceholder();

		quickTree.setItemTree(buildTreeItems());
		if (preApprovalStore) {
			quickTree.busy = preApprovalStore.isDiscovering?.get() ?? false;
		}

		// Serialize contributed edits, including their settings reads, before rebuilding.
		const runManageAction = (action: () => void | Promise<void>) => manageActionSequencer.queue(async () => {
			await action();
			if (!disposables.isDisposed) {
				quickTree.setItemTree(buildTreeItems());
			}
		});

		disposables.add(quickTree.onDidChangeCheckboxState(item => {
			if (isAutoApprovePolicyRestricted(this._configurationService) && item.type !== 'manage') {
				quickTree.setItemTree(buildTreeItems());
				return;
			}

			if (preApprovalStore && item.type !== 'manage') {
				if ((item.type === 'server' || item.type === 'server-pre') && item.serverId) {
					preApprovalStore.setServerApproved(item.serverId, !!item.checked);
				} else if ((item.type === 'tool' || item.type === 'tool-pre') && item.toolId) {
					const tool = allTools.find(t => t.id === item.toolId);
					if (tool?.source.type === 'mcp') {
						preApprovalStore.setToolApproved(tool, !!item.checked);
					}
				}
				quickTree.setItemTree(buildTreeItems());
				return;
			}

			const newState = item.checked ? currentScope : 'never';

			if (item.type === 'server' && item.serverId) {
				// Server-level checkbox: update both pre and post based on server capabilities
				const serverInfo = serversWithTools.get(item.serverId);
				if (serverInfo) {
					this._preExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
					this._postExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
				}
			} else if (item.type === 'tool' && item.toolId) {
				const tool = allTools.find(t => t.id === item.toolId);
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
			} else if (item.type === 'tool-pre' && item.toolId) {
				this._preExecutionToolConfirmStore.setAutoConfirmation(item.toolId, newState);
			} else if (item.type === 'tool-post' && item.toolId) {
				this._postExecutionToolConfirmStore.setAutoConfirmation(item.toolId, newState);
			} else if (item.type === 'server-pre' && item.serverId) {
				this._preExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
				quickTree.setItemTree(buildTreeItems());
			} else if (item.type === 'server-post' && item.serverId) {
				this._postExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
				quickTree.setItemTree(buildTreeItems());
			} else if (item.type === 'manage') {
				const checked = !!item.checked;
				if (!checked && item.id && item.manageActionIndex !== undefined) {
					uncheckedManageActions.set(item.id, { item, index: item.manageActionIndex });
				}
				void runManageAction(() => (item as ILanguageModelToolConfirmationContributionQuickTreeItem).onDidChangeChecked?.(checked));
			} else if (item.type === 'combination' && item.combinationKey) {
				this._combinationConfirmStore.setAutoConfirmation(item.combinationKey, newState, item.label, item.combinationArgs);
				quickTree.setItemTree(buildTreeItems());
			}
		}));

		disposables.add(quickTree.onDidTriggerItemButton(i => {
			if (i.item.type === 'manage') {
				if (i.item.id) {
					uncheckedManageActions.delete(i.item.id);
				}
				void runManageAction(() => (i.item as ILanguageModelToolConfirmationContributionQuickTreeItem).onDidTriggerItemButton?.(i.button));
			} else if (i.item.type === 'combination' && i.button === viewArgsButton && i.item.combinationArgs) {
				this._dialogService.prompt({
					message: localize('combinationArguments', "Arguments"),
					buttons: [],
					custom: {
						markdownDetails: [{
							markdown: new MarkdownString().appendCodeblock('json', i.item.combinationArgs),
						}],
					},
				});
			}
		}));

		disposables.add(quickTree.onDidAccept(async () => {
			const manageItem = quickTree.activeItems.find(i => i.type === 'manage') as ILanguageModelToolConfirmationContributionQuickTreeItem | undefined;
			if (manageItem) {
				quickTree.hide();
				await manageItem.onDidOpen?.();
				if (!manageItem.closesPicker) {
					this.manageConfirmationPreferences(tools, options);
				}
			} else {
				quickTree.hide();
			}
		}));

		disposables.add(quickTree.onDidHide(() => {
			disposables.dispose();
		}));

		let focusToolId = options?.focusToolId;
		const focusTool = () => {
			if (!focusToolId) {
				return;
			}
			for (const serverItem of quickTree.itemTree) {
				const toolItem = (serverItem.children as readonly IToolTreeItem[] | undefined)?.find(child => child.type === 'tool' && child.toolId === focusToolId);
				if (toolItem) {
					quickTree.expand(serverItem);
					quickTree.reveal(toolItem);
					focusToolId = undefined;
					break;
				}
			}
		};

		quickTree.show();
		if (preApprovalStore) {
			disposables.add(autorun(reader => {
				updateTools(preApprovalStore.discoveredTools?.read(reader) ?? []);
				quickTree.busy = preApprovalStore.isDiscovering?.read(reader) ?? false;
				quickTree.setItemTree(buildTreeItems());
				focusTool();
			}));
		} else {
			focusTool();
		}
	}

	public resetToolAutoConfirmation(): void {
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
}
