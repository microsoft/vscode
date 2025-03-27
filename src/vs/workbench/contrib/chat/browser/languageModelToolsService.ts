/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderStringAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, DisposableStore, dispose, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import * as JSONContributionRegistry from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { ChatModel } from '../common/chatModel.js';
import { ChatToolInvocation } from '../common/chatProgressTypes/chatToolInvocation.js';
import { IChatService } from '../common/chatService.js';
import { ChatConfiguration } from '../common/constants.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolResult, stringifyPromptTsxPart } from '../common/languageModelToolsService.js';

const jsonSchemaRegistry = Registry.as<JSONContributionRegistry.IJSONContributionRegistry>(JSONContributionRegistry.Extensions.JSONContribution);

interface IToolEntry {
	data: IToolData;
	impl?: IToolImpl;
}

export class LanguageModelToolsService extends Disposable implements ILanguageModelToolsService {
	_serviceBrand: undefined;

	private _onDidChangeTools = new Emitter<void>();
	readonly onDidChangeTools = this._onDidChangeTools.event;

	/** Throttle tools updates because it sends all tools and runs on context key updates */
	private _onDidChangeToolsScheduler = new RunOnceScheduler(() => this._onDidChangeTools.fire(), 750);

	private _tools = new Map<string, IToolEntry>();
	private _toolContextKeys = new Set<string>();
	private readonly _ctxToolsCount: IContextKey<number>;

	private _callsByRequestId = new Map<string, IDisposable[]>();

	private _workspaceToolConfirmStore: Lazy<ToolConfirmStore>;
	private _profileToolConfirmStore: Lazy<ToolConfirmStore>;
	private _memoryToolConfirmStore = new Set<string>();

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IChatService private readonly _chatService: IChatService,
		@IDialogService private readonly _dialogService: IDialogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
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
			const schemaUrl = URI.from({ scheme: Schemas.vscode, authority: 'schemas', path: `/lm/tool/${toolData.id}` }).toString();
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

	registerToolImplementation(id: string, tool: IToolImpl): IDisposable {
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

	getTools(): Iterable<Readonly<IToolData>> {
		const toolDatas = Iterable.map(this._tools.values(), i => i.data);
		const extensionToolsEnabled = this._configurationService.getValue(ChatConfiguration.ExtensionToolsEnabled);
		return Iterable.filter(
			toolDatas,
			toolData => {
				const satisfiesWhenClause = !toolData.when || this._contextKeyService.contextMatchesRules(toolData.when);
				const satisfiesExternalToolCheck = toolData.source.type === 'extension' && !extensionToolsEnabled ?
					!toolData.source.isExternalTool :
					true;
				return satisfiesWhenClause && satisfiesExternalToolCheck;
			});
	}

	getTool(id: string): IToolData | undefined {
		return this._getToolEntry(id)?.data;
	}

	private _getToolEntry(id: string): IToolEntry | undefined {
		const entry = this._tools.get(id);
		if (entry && (!entry.data.when || this._contextKeyService.contextMatchesRules(entry.data.when))) {
			return entry;
		} else {
			return undefined;
		}
	}

	getToolByName(name: string): IToolData | undefined {
		for (const toolData of this.getTools()) {
			if (toolData.toolReferenceName === name) {
				return toolData;
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

	async invokeTool(dto: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult> {
		this._logService.trace(`[LanguageModelToolsService#invokeTool] Invoking tool ${dto.toolId} with parameters ${JSON.stringify(dto.parameters)}`);

		// When invoking a tool, don't validate the "when" clause. An extension may have invoked a tool just as it was becoming disabled, and just let it go through rather than throw and break the chat.
		let tool = this._tools.get(dto.toolId);
		if (!tool) {
			throw new Error(`Tool ${dto.toolId} was not contributed`);
		}

		if (!tool.impl) {
			await this._extensionService.activateByEvent(`onLanguageModelTool:${dto.toolId}`);

			// Extension should activate and register the tool implementation
			tool = this._tools.get(dto.toolId);
			if (!tool?.impl) {
				throw new Error(`Tool ${dto.toolId} does not have an implementation registered.`);
			}
		}

		// Shortcut to write to the model directly here, but could call all the way back to use the real stream.
		let toolInvocation: ChatToolInvocation | undefined;

		let requestId: string | undefined;
		let store: DisposableStore | undefined;
		let toolResult: IToolResult | undefined;
		try {
			if (dto.context) {
				store = new DisposableStore();
				const model = this._chatService.getSession(dto.context?.sessionId) as ChatModel | undefined;
				if (!model) {
					throw new Error(`Tool called for unknown chat session`);
				}

				const request = model.getRequests().at(-1)!;
				requestId = request.id;
				dto.modelId = request.modelId;

				// Replace the token with a new token that we can cancel when cancelToolCallsForRequest is called
				if (!this._callsByRequestId.has(requestId)) {
					this._callsByRequestId.set(requestId, []);
				}
				this._callsByRequestId.get(requestId)!.push(store);

				const source = new CancellationTokenSource();
				store.add(toDisposable(() => {
					source.dispose(true);
				}));
				store.add(token.onCancellationRequested(() => {
					toolInvocation?.confirmed.complete(false);
					source.cancel();
				}));
				store.add(source.token.onCancellationRequested(() => {
					toolInvocation?.confirmed.complete(false);
				}));
				token = source.token;

				const prepared = await this.prepareToolInvocation(tool, dto, token);
				toolInvocation = new ChatToolInvocation(prepared, tool.data, dto.callId);
				if (this.shouldAutoConfirm(tool.data.id, tool.data.runsInWorkspace)) {
					toolInvocation.confirmed.complete(true);
				}

				model.acceptResponseProgress(request, toolInvocation);
				if (prepared?.confirmationMessages) {
					this._accessibilityService.alert(localize('toolConfirmationMessage', "Action required: {0}", prepared.confirmationMessages.title));
					const userConfirmed = await toolInvocation.confirmed.p;
					if (!userConfirmed) {
						throw new CancellationError();
					}

					dto.toolSpecificData = toolInvocation?.toolSpecificData;

					if (dto.toolSpecificData?.kind === 'input') {
						dto.parameters = dto.toolSpecificData.rawInput;
						dto.toolSpecificData = undefined;
					}
				}
			} else {
				const prepared = await this.prepareToolInvocation(tool, dto, token);
				if (prepared?.confirmationMessages) {
					const result = await this._dialogService.confirm({ message: prepared.confirmationMessages.title, detail: renderStringAsPlaintext(prepared.confirmationMessages.message) });
					if (!result.confirmed) {
						throw new CancellationError();
					}
				}
			}

			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			toolResult = await tool.impl.invoke(dto, countTokens, token);
			this.ensureToolDetails(dto, toolResult, tool.data);

			this._telemetryService.publicLog2<LanguageModelToolInvokedEvent, LanguageModelToolInvokedClassification>(
				'languageModelToolInvoked',
				{
					result: 'success',
					chatSessionId: dto.context?.sessionId,
					toolId: tool.data.id,
					toolExtensionId: tool.data.source.type === 'extension' ? tool.data.source.extensionId.value : undefined,
					toolSourceKind: tool.data.source.type,
				});
			return toolResult;
		} catch (err) {
			const result = isCancellationError(err) ? 'userCancelled' : 'error';
			this._telemetryService.publicLog2<LanguageModelToolInvokedEvent, LanguageModelToolInvokedClassification>(
				'languageModelToolInvoked',
				{
					result,
					chatSessionId: dto.context?.sessionId,
					toolId: tool.data.id,
					toolExtensionId: tool.data.source.type === 'extension' ? tool.data.source.extensionId.value : undefined,
					toolSourceKind: tool.data.source.type,
				});
			this._logService.error(`[LanguageModelToolsService#invokeTool] Error from tool ${dto.toolId}: ${toErrorMessage(err)}. With parameters ${JSON.stringify(dto.parameters)}`);
			throw err;
		} finally {
			toolInvocation?.complete(toolResult);

			if (requestId && store) {
				this.cleanupCallDisposables(requestId, store);
			}
		}
	}

	private async prepareToolInvocation(tool: IToolEntry, dto: IToolInvocation, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		let prepared = tool.impl!.prepareToolInvocation ?
			await tool.impl!.prepareToolInvocation(dto.parameters, token)
			: undefined;

		if (!prepared?.confirmationMessages && tool.data.requiresConfirmation && tool.data.source.type === 'extension') {
			if (!prepared) {
				prepared = {};
			}

			const toolWarning = localize(
				'tool.warning',
				"{0} This tool is from the extension `{1}`. Please carefully review any requested actions.",
				'$(info)',
				tool.data.source.extensionId.value,
			);
			prepared.confirmationMessages = {
				title: localize('msg.title', "Run {0}", `"${tool.data.displayName}"`),
				message: new MarkdownString((tool.data.userDescription ?? tool.data.modelDescription) + '\n\n' + toolWarning, { supportThemeIcons: true }),
				allowAutoConfirm: true,
			};
		}

		if (prepared?.confirmationMessages) {
			if (prepared.toolSpecificData?.kind !== 'terminal' && typeof prepared.confirmationMessages.allowAutoConfirm !== 'boolean') {
				prepared.confirmationMessages.allowAutoConfirm = true;
			}

			if (!prepared.toolSpecificData && tool.data.alwaysDisplayInputOutput) {
				prepared.toolSpecificData = {
					kind: 'input',
					rawInput: dto.parameters,
				};
			}
		}

		return prepared;
	}

	private ensureToolDetails(dto: IToolInvocation, toolResult: IToolResult, toolData: IToolData): void {
		if (!toolResult.toolResultDetails && toolData.alwaysDisplayInputOutput) {
			toolResult.toolResultDetails = {
				input: JSON.stringify(dto.parameters, undefined, 2),
				output: this.toolResultToString(toolResult),
			};
		}
	}

	private toolResultToString(toolResult: IToolResult): string {
		const strs = [];
		for (const part of toolResult.content) {
			if (part.kind === 'text') {
				strs.push(part.value);
			} else if (part.kind === 'promptTsx') {
				strs.push(stringifyPromptTsxPart(part));
			}
		}
		return strs.join('');
	}

	private shouldAutoConfirm(toolId: string, runsInWorkspace: boolean | undefined): boolean {
		if (this._workspaceToolConfirmStore.value.getAutoConfirm(toolId) || this._profileToolConfirmStore.value.getAutoConfirm(toolId) || this._memoryToolConfirmStore.has(toolId)) {
			return true;
		}

		const config = this._configurationService.inspect<boolean | Record<string, boolean>>('chat.tools.autoApprove');

		// If we know the tool runs at a global level, only consider the global config.
		// If we know the tool runs at a workspace level, use those specific settings when appropriate.
		let value = config.value ?? config.defaultValue;
		if (typeof runsInWorkspace === 'boolean') {
			value = config.userLocalValue ?? config.applicationValue;
			if (runsInWorkspace) {
				value = config.workspaceValue ?? config.workspaceFolderValue ?? config.userRemoteValue ?? value;
			}
		}

		return value === true || (typeof value === 'object' && value.hasOwnProperty(toolId) && value[toolId] === true);
	}

	private cleanupCallDisposables(requestId: string, store: DisposableStore): void {
		const disposables = this._callsByRequestId.get(requestId);
		if (disposables) {
			const index = disposables.indexOf(store);
			if (index > -1) {
				disposables.splice(index, 1);
			}
			if (disposables.length === 0) {
				this._callsByRequestId.delete(requestId);
			}
		}
		store.dispose();
	}

	cancelToolCallsForRequest(requestId: string): void {
		const calls = this._callsByRequestId.get(requestId);
		if (calls) {
			calls.forEach(call => call.dispose());
			this._callsByRequestId.delete(requestId);
		}
	}

	public override dispose(): void {
		super.dispose();

		this._callsByRequestId.forEach(calls => dispose(calls));
		this._ctxToolsCount.reset();
	}
}

type LanguageModelToolInvokedEvent = {
	result: 'success' | 'error' | 'userCancelled';
	chatSessionId: string | undefined;
	toolId: string;
	toolExtensionId: string | undefined;
	toolSourceKind: string;
};

type LanguageModelToolInvokedClassification = {
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether invoking the LanguageModelTool resulted in an error.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the chat session that the tool was used within, if applicable.' };
	toolId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the tool used.' };
	toolExtensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension that contributed the tool.' };
	toolSourceKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The source (mcp/extension/internal) of the tool.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of language model tools.';
};

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
