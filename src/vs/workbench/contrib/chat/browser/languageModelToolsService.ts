/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { IObservable, ObservableSet } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import * as JSONContributionRegistry from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { ChatConfiguration } from '../common/constants.js';
import { CountTokensCallback, createToolSchemaUri, IInvokeToolInput, ILanguageModelToolsService, IToolData, IToolImpl, IToolResult, ToolDataSource, ToolSet } from '../common/languageModelToolsService.js';

const jsonSchemaRegistry = Registry.as<JSONContributionRegistry.IJSONContributionRegistry>(JSONContributionRegistry.Extensions.JSONContribution);

interface IToolEntry<T> {
	data: IToolData;
	impl?: IToolImpl<T>;
}

export class LanguageModelToolsService extends Disposable implements ILanguageModelToolsService {
	_serviceBrand: undefined;

	private _onDidChangeTools = new Emitter<void>();
	readonly onDidChangeTools = this._onDidChangeTools.event;

	/** Throttle tools updates because it sends all tools and runs on context key updates */
	private _onDidChangeToolsScheduler = new RunOnceScheduler(() => this._onDidChangeTools.fire(), 750);

	private _tools = new Map<string, IToolEntry<unknown>>();
	private _toolContextKeys = new Set<string>();
	private readonly _ctxToolsCount: IContextKey<number>;

	private _workspaceToolConfirmStore: Lazy<ToolConfirmStore>;
	private _profileToolConfirmStore: Lazy<ToolConfirmStore>;
	private _memoryToolConfirmStore = new Set<string>();

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._workspaceToolConfirmStore = new Lazy(() => this._register(this._instantiationService.createInstance(ToolConfirmStore, StorageScope.WORKSPACE)));
		this._profileToolConfirmStore = new Lazy(() => this._register(this._instantiationService.createInstance(ToolConfirmStore, StorageScope.PROFILE)));

		this._register(this._contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(this._toolContextKeys)) {
				// Not worth it to compute a delta here unless we have many tools changing often
				this._onDidChangeToolsScheduler.schedule();
			}
		}));

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.ExtensionToolsEnabled)) {
				this._onDidChangeToolsScheduler.schedule();
			}
		}));

		this._ctxToolsCount = ChatContextKeys.Tools.toolsCount.bindTo(_contextKeyService);
	}
	override dispose(): void {
		super.dispose();

		this._ctxToolsCount.reset();
	}

	registerToolData(toolData: IToolData): IDisposable {
		if (this._tools.has(toolData.id)) {
			throw new Error(`Tool "${toolData.id}" is already registered.`);
		}

		this._tools.set(toolData.id, { data: toolData });
		this._ctxToolsCount.set(this._tools.size);
		this._onDidChangeToolsScheduler.schedule();

		toolData.when?.keys().forEach(key => this._toolContextKeys.add(key));

		let store: DisposableStore | undefined;
		if (toolData.inputSchema) {
			store = new DisposableStore();
			const schemaUrl = createToolSchemaUri(toolData.id).toString();
			jsonSchemaRegistry.registerSchema(schemaUrl, toolData.inputSchema, store);
			store.add(jsonSchemaRegistry.registerSchemaAssociation(schemaUrl, `/lm/tool/${toolData.id}/tool_input.json`));
		}

		return toDisposable(() => {
			store?.dispose();
			this._tools.delete(toolData.id);
			this._ctxToolsCount.set(this._tools.size);
			this._refreshAllToolContextKeys();
			this._onDidChangeToolsScheduler.schedule();
		});
	}

	private _refreshAllToolContextKeys() {
		this._toolContextKeys.clear();
		for (const tool of this._tools.values()) {
			tool.data.when?.keys().forEach(key => this._toolContextKeys.add(key));
		}
	}

	flushToolChanges(): void {
		this._onDidChangeToolsScheduler.cancel();
		this._onDidChangeTools.fire();
	}

	registerToolImplementation<T>(id: string, tool: IToolImpl<T>): IDisposable {
		const entry = this._tools.get(id);
		if (!entry) {
			throw new Error(`Tool "${id}" was not contributed.`);
		}

		if (entry.impl) {
			throw new Error(`Tool "${id}" already has an implementation.`);
		}

		entry.impl = tool;
		return toDisposable(() => {
			entry.impl = undefined;
		});
	}

	getTools(includeDisabled?: boolean): Iterable<Readonly<IToolData>> {
		const toolDatas = Iterable.map(this._tools.values(), i => i.data);
		const extensionToolsEnabled = this._configurationService.getValue<boolean>(ChatConfiguration.ExtensionToolsEnabled);
		return Iterable.filter(
			toolDatas,
			toolData => {
				const satisfiesWhenClause = includeDisabled || !toolData.when || this._contextKeyService.contextMatchesRules(toolData.when);
				const satisfiesExternalToolCheck = toolData.source.type !== 'extension' || !!extensionToolsEnabled;
				return satisfiesWhenClause && satisfiesExternalToolCheck;
			});
	}

	getTool(id: string): IToolData | undefined {
		return this._getToolEntry(id)?.data;
	}

	private _getToolEntry(id: string): IToolEntry<unknown> | undefined {
		const entry = this._tools.get(id);
		if (entry && (!entry.data.when || this._contextKeyService.contextMatchesRules(entry.data.when))) {
			return entry;
		} else {
			return undefined;
		}
	}

	getToolByName(name: string, includeDisabled?: boolean): IToolData | undefined {
		for (const tool of this.getTools(!!includeDisabled)) {
			if (tool.toolReferenceName === name) {
				return tool;
			}
		}
		return undefined;
	}

	setToolAutoConfirmation(toolId: string, scope: 'workspace' | 'profile' | 'memory', autoConfirm = true): void {
		if (scope === 'workspace') {
			this._workspaceToolConfirmStore.value.setAutoConfirm(toolId, autoConfirm);
		} else if (scope === 'profile') {
			this._profileToolConfirmStore.value.setAutoConfirm(toolId, autoConfirm);
		} else {
			this._memoryToolConfirmStore.add(toolId);
		}
	}

	resetToolAutoConfirmation(): void {
		this._workspaceToolConfirmStore.value.reset();
		this._profileToolConfirmStore.value.reset();
		this._memoryToolConfirmStore.clear();
	}

	async invokeTool(toolInput: IInvokeToolInput, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult> {

	}

	cancelToolCallsForRequest(requestId: string): void {
	}

	toToolEnablementMap(toolOrToolsetNames: Set<string>): Record<string, boolean> {
		const result: Record<string, boolean> = {};
		for (const tool of this._tools.values()) {
			if (tool.data.toolReferenceName && toolOrToolsetNames.has(tool.data.toolReferenceName)) {
				result[tool.data.id] = true;
			} else {
				result[tool.data.id] = false;
			}
		}

		for (const toolSet of this._toolSets) {
			if (toolOrToolsetNames.has(toolSet.referenceName)) {
				for (const tool of toolSet.getTools()) {
					result[tool.id] = true;
				}
			}
		}

		return result;
	}

	/**
	 * Create a map that contains all tools and toolsets with their enablement state.
	 * @param toolOrToolSetNames A list of tool or toolset names to check for enablement. If undefined, all tools and toolsets are enabled.
	 * @returns A map of tool or toolset instances to their enablement state.
	 */
	toToolAndToolSetEnablementMap(enabledToolOrToolSetNames: readonly string[] | undefined): Map<ToolSet | IToolData, boolean> {
		const toolOrToolSetNames = enabledToolOrToolSetNames ? new Set(enabledToolOrToolSetNames) : undefined;
		const result = new Map<ToolSet | IToolData, boolean>();
		for (const tool of this.getTools()) {
			if (tool.canBeReferencedInPrompt) {
				result.set(tool, toolOrToolSetNames === undefined || toolOrToolSetNames.has(tool.toolReferenceName ?? tool.displayName));
			}
		}
		for (const toolSet of this._toolSets) {
			const enabled = toolOrToolSetNames === undefined || toolOrToolSetNames.has(toolSet.referenceName);
			result.set(toolSet, enabled);

			// if a mcp toolset is enabled, all tools in it are enabled
			if (enabled && toolSet.source.type === 'mcp') {
				for (const tool of toolSet.getTools()) {
					if (tool.canBeReferencedInPrompt) {
						result.set(tool, enabled);
					}
				}
			}
		}
		return result;
	}

	private readonly _toolSets = new ObservableSet<ToolSet>();

	readonly toolSets: IObservable<Iterable<ToolSet>> = this._toolSets.observable;

	getToolSet(id: string): ToolSet | undefined {
		for (const toolSet of this._toolSets) {
			if (toolSet.id === id) {
				return toolSet;
			}
		}
		return undefined;
	}

	getToolSetByName(name: string): ToolSet | undefined {
		for (const toolSet of this._toolSets) {
			if (toolSet.referenceName === name) {
				return toolSet;
			}
		}
		return undefined;
	}

	createToolSet(source: ToolDataSource, id: string, referenceName: string, options?: { icon?: ThemeIcon; description?: string }): ToolSet & IDisposable {

		const that = this;

		const result = new class extends ToolSet implements IDisposable {
			dispose(): void {
				if (that._toolSets.has(result)) {
					this._tools.clear();
					that._toolSets.delete(result);
				}

			}
		}(id, referenceName, options?.icon ?? Codicon.tools, source, options?.description);

		this._toolSets.add(result);
		return result;
	}
}

class ToolConfirmStore extends Disposable {
	private static readonly STORED_KEY = 'chat/autoconfirm';

	private _autoConfirmTools: LRUCache<string, boolean> = new LRUCache<string, boolean>(100);
	private _didChange = false;

	constructor(
		private readonly _scope: StorageScope,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		const stored = storageService.getObject<string[]>(ToolConfirmStore.STORED_KEY, this._scope);
		if (stored) {
			for (const key of stored) {
				this._autoConfirmTools.set(key, true);
			}
		}

		this._register(storageService.onWillSaveState(() => {
			if (this._didChange) {
				this.storageService.store(ToolConfirmStore.STORED_KEY, [...this._autoConfirmTools.keys()], this._scope, StorageTarget.MACHINE);
				this._didChange = false;
			}
		}));
	}

	public reset() {
		this._autoConfirmTools.clear();
		this._didChange = true;
	}

	public getAutoConfirm(toolId: string): boolean {
		if (this._autoConfirmTools.get(toolId)) {
			this._didChange = true;
			return true;
		}

		return false;
	}

	public setAutoConfirm(toolId: string, autoConfirm: boolean): void {
		if (autoConfirm) {
			this._autoConfirmTools.set(toolId, true);
		} else {
			this._autoConfirmTools.delete(toolId);
		}
		this._didChange = true;
	}
}
