/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { assertNever } from '../../../../base/common/assert.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { encodeBase64 } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { combinedDisposable, Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { IObservable, ObservableSet } from '../../../../base/common/observable.js';
import Severity from '../../../../base/common/severity.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
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
import { AccessibilityWorkbenchSettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { ChatModel } from '../common/chatModel.js';
import { IVariableReference } from '../common/chatModes.js';
import { ChatToolInvocation } from '../common/chatProgressTypes/chatToolInvocation.js';
import { ConfirmedReason, IChatService, ToolConfirmKind } from '../common/chatService.js';
import { ChatRequestToolReferenceEntry, toToolSetVariableEntry, toToolVariableEntry } from '../common/chatVariableEntries.js';
import { ChatConfiguration } from '../common/constants.js';
import { CountTokensCallback, createToolSchemaUri, ILanguageModelToolsService, IPreparedToolInvocation, IToolAndToolSetEnablementMap, IToolData, IToolImpl, IToolInvocation, IToolResult, IToolResultInputOutputDetails, stringifyPromptTsxPart, ToolDataSource, ToolSet } from '../common/languageModelToolsService.js';
import { getToolConfirmationAlert } from './chatAccessibilityProvider.js';

const jsonSchemaRegistry = Registry.as<JSONContributionRegistry.IJSONContributionRegistry>(JSONContributionRegistry.Extensions.JSONContribution);

interface IToolEntry {
	data: IToolData;
	impl?: IToolImpl;
}

interface ITrackedCall {
	invocation?: ChatToolInvocation;
	store: IDisposable;
}

const enum AutoApproveStorageKeys {
	GlobalAutoApproveOptIn = 'chat.tools.global.autoApprove.optIn'
}

const SkipAutoApproveConfirmationKey = 'vscode.chat.tools.global.autoApprove.testMode';

export const globalAutoApproveDescription = localize2(
	{
		key: 'autoApprove2.markdown',
		comment: [
			'{Locked=\'](https://github.com/features/codespaces)\'}',
			'{Locked=\'](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)\'}',
			'{Locked=\'](https://code.visualstudio.com/docs/copilot/security)\'}',
			'{Locked=\'**\'}',
		]
	},
	'Global auto approve also known as "YOLO mode" disables manual approval completely for _all tools in all workspaces_, allowing the agent to act fully autonomously. This is extremely dangerous and is *never* recommended, even containerized environments like [Codespaces](https://github.com/features/codespaces) and [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) have user keys forwarded into the container that could be compromised.\n\n**This feature disables [critical security protections](https://code.visualstudio.com/docs/copilot/security) and makes it much easier for an attacker to compromise the machine.**'
);

export class LanguageModelToolsService extends Disposable implements ILanguageModelToolsService {
	_serviceBrand: undefined;

	private _onDidChangeTools = new Emitter<void>();
	readonly onDidChangeTools = this._onDidChangeTools.event;

	/** Throttle tools updates because it sends all tools and runs on context key updates */
	private _onDidChangeToolsScheduler = new RunOnceScheduler(() => this._onDidChangeTools.fire(), 750);

	private _tools = new Map<string, IToolEntry>();
	private _toolContextKeys = new Set<string>();
	private readonly _ctxToolsCount: IContextKey<number>;

	private _callsByRequestId = new Map<string, ITrackedCall[]>();

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
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@IStorageService private readonly _storageService: IStorageService,
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

		// Clear out warning accepted state if the setting is disabled
		this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, e => {
			if (!e || e.affectsConfiguration(ChatConfiguration.GlobalAutoApprove)) {
				if (this._configurationService.getValue(ChatConfiguration.GlobalAutoApprove) !== true) {
					this._storageService.remove(AutoApproveStorageKeys.GlobalAutoApproveOptIn, StorageScope.APPLICATION);
				}
			}
		}));

		this._ctxToolsCount = ChatContextKeys.Tools.toolsCount.bindTo(_contextKeyService);
	}
	override dispose(): void {
		super.dispose();

		this._callsByRequestId.forEach(calls => calls.forEach(call => call.store.dispose()));
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

	registerTool(toolData: IToolData, tool: IToolImpl): IDisposable {
		return combinedDisposable(
			this.registerToolData(toolData),
			this.registerToolImplementation(toolData.id, tool)
		);
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

	private _getToolEntry(id: string): IToolEntry | undefined {
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

	setToolAutoConfirmation(toolId: string, scope: 'workspace' | 'profile' | 'session' | 'never'): void {
		this._workspaceToolConfirmStore.value.setAutoConfirm(toolId, scope === 'workspace');
		this._profileToolConfirmStore.value.setAutoConfirm(toolId, scope === 'profile');

		if (scope === 'session') {
			this._memoryToolConfirmStore.add(toolId);
		} else {
			this._memoryToolConfirmStore.delete(toolId);
		}
	}

	getToolAutoConfirmation(toolId: string): 'workspace' | 'profile' | 'session' | 'never' {
		if (this._workspaceToolConfirmStore.value.getAutoConfirm(toolId)) {
			return 'workspace';
		}
		if (this._profileToolConfirmStore.value.getAutoConfirm(toolId)) {
			return 'profile';
		}
		if (this._memoryToolConfirmStore.has(toolId)) {
			return 'session';
		}
		return 'never';
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
				const trackedCall: ITrackedCall = { store };
				this._callsByRequestId.get(requestId)!.push(trackedCall);

				const source = new CancellationTokenSource();
				store.add(toDisposable(() => {
					source.dispose(true);
				}));
				store.add(token.onCancellationRequested(() => {
					toolInvocation?.confirmed.complete({ type: ToolConfirmKind.Denied });
					source.cancel();
				}));
				store.add(source.token.onCancellationRequested(() => {
					toolInvocation?.confirmed.complete({ type: ToolConfirmKind.Denied });
				}));
				token = source.token;

				const prepared = await this.prepareToolInvocation(tool, dto, token);

				toolInvocation = new ChatToolInvocation(prepared, tool.data, dto.callId, dto.fromSubAgent);
				trackedCall.invocation = toolInvocation;
				const autoConfirmed = await this.shouldAutoConfirm(tool.data.id, tool.data.runsInWorkspace);
				if (autoConfirmed) {
					toolInvocation.confirmed.complete(autoConfirmed);
				}

				model.acceptResponseProgress(request, toolInvocation);

				dto.toolSpecificData = toolInvocation?.toolSpecificData;
				this.informScreenReader(prepared?.invocationMessage ?? `${tool.data.displayName} started`);

				if (prepared?.confirmationMessages) {
					if (!toolInvocation.isConfirmed?.type && !autoConfirmed) {
						this.playAccessibilitySignal([toolInvocation]);
					}
					const userConfirmed = await toolInvocation.confirmed.p;
					if (userConfirmed.type === ToolConfirmKind.Denied) {
						throw new CancellationError();
					}
					if (userConfirmed.type === ToolConfirmKind.Skipped) {
						toolResult = {
							content: [{
								kind: 'text',
								value: 'The user chose to skip the tool call, they want to proceed without running it'
							}]
						};
						return toolResult;
					}

					if (dto.toolSpecificData?.kind === 'input') {
						dto.parameters = dto.toolSpecificData.rawInput;
						dto.toolSpecificData = undefined;
					}
				}
			} else {
				const prepared = await this.prepareToolInvocation(tool, dto, token);
				if (prepared?.confirmationMessages && !(await this.shouldAutoConfirm(tool.data.id, tool.data.runsInWorkspace))) {
					const result = await this._dialogService.confirm({ message: renderAsPlaintext(prepared.confirmationMessages.title), detail: renderAsPlaintext(prepared.confirmationMessages.message) });
					if (!result.confirmed) {
						throw new CancellationError();
					}
				}

				dto.toolSpecificData = prepared?.toolSpecificData;
			}

			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			toolResult = await tool.impl.invoke(dto, countTokens, {
				report: step => {
					toolInvocation?.acceptProgress(step);
				}
			}, token);
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
			this._logService.error(`[LanguageModelToolsService#invokeTool] Error from tool ${dto.toolId} with parameters ${JSON.stringify(dto.parameters)}:\n${toErrorMessage(err, true)}`);

			toolResult ??= { content: [] };
			toolResult.toolResultError = err instanceof Error ? err.message : String(err);
			if (tool.data.alwaysDisplayInputOutput) {
				toolResult.toolResultDetails = { input: this.formatToolInput(dto), output: [{ type: 'embed', isText: true, value: String(err) }], isError: true };
			}

			throw err;
		} finally {
			toolInvocation?.complete(toolResult);
			if (ChatContextKeys.requestInProgress.getValue(this._contextKeyService)) {
				this.informScreenReader(toolInvocation?.pastTenseMessage ?? `${tool.data.displayName} finished`);
			}
			if (store) {
				this.cleanupCallDisposables(requestId, store);
			}
		}
	}

	private async prepareToolInvocation(tool: IToolEntry, dto: IToolInvocation, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const prepared = tool.impl!.prepareToolInvocation ?
			await tool.impl!.prepareToolInvocation({
				parameters: dto.parameters,
				chatRequestId: dto.chatRequestId,
				chatSessionId: dto.context?.sessionId,
				chatInteractionId: dto.chatInteractionId
			}, token)
			: undefined;

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

	private informScreenReader(msg: string | IMarkdownString): void {
		if (this._configurationService.getValue(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates)) {
			alert(typeof msg === 'string' ? msg : msg.value);
		}
	}

	private playAccessibilitySignal(toolInvocations: ChatToolInvocation[]): void {
		const autoApproved = this._configurationService.getValue(ChatConfiguration.GlobalAutoApprove);
		if (autoApproved) {
			return;
		}
		const setting: { sound?: 'auto' | 'on' | 'off'; announcement?: 'auto' | 'off' } | undefined = this._configurationService.getValue(AccessibilitySignal.chatUserActionRequired.settingsKey);
		if (!setting) {
			return;
		}
		const soundEnabled = setting.sound === 'on' || (setting.sound === 'auto' && (this._accessibilityService.isScreenReaderOptimized()));
		const announcementEnabled = this._accessibilityService.isScreenReaderOptimized() && setting.announcement === 'auto';
		if (soundEnabled || announcementEnabled) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.chatUserActionRequired, { customAlertMessage: this._instantiationService.invokeFunction(getToolConfirmationAlert, toolInvocations), userGesture: true, modality: !soundEnabled ? 'announcement' : undefined });
		}
	}

	private ensureToolDetails(dto: IToolInvocation, toolResult: IToolResult, toolData: IToolData): void {
		if (!toolResult.toolResultDetails && toolData.alwaysDisplayInputOutput) {
			toolResult.toolResultDetails = {
				input: this.formatToolInput(dto),
				output: this.toolResultToIO(toolResult),
			};
		}
	}

	private formatToolInput(dto: IToolInvocation): string {
		return JSON.stringify(dto.parameters, undefined, 2);
	}

	private toolResultToIO(toolResult: IToolResult): IToolResultInputOutputDetails['output'] {
		return toolResult.content.map(part => {
			if (part.kind === 'text') {
				return { type: 'embed', isText: true, value: part.value };
			} else if (part.kind === 'promptTsx') {
				return { type: 'embed', isText: true, value: stringifyPromptTsxPart(part) };
			} else if (part.kind === 'data') {
				return { type: 'embed', value: encodeBase64(part.value.data), mimeType: part.value.mimeType };
			} else {
				assertNever(part);
			}
		});
	}

	private async shouldAutoConfirm(toolId: string, runsInWorkspace: boolean | undefined): Promise<ConfirmedReason | undefined> {
		if (this._workspaceToolConfirmStore.value.getAutoConfirm(toolId)) {
			return { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' };
		}
		if (this._profileToolConfirmStore.value.getAutoConfirm(toolId)) {
			return { type: ToolConfirmKind.LmServicePerTool, scope: 'profile' };
		}
		if (this._memoryToolConfirmStore.has(toolId)) {
			return { type: ToolConfirmKind.LmServicePerTool, scope: 'session' };
		}

		const config = this._configurationService.inspect<boolean | Record<string, boolean>>(ChatConfiguration.GlobalAutoApprove);

		// If we know the tool runs at a global level, only consider the global config.
		// If we know the tool runs at a workspace level, use those specific settings when appropriate.
		let value = config.value ?? config.defaultValue;
		if (typeof runsInWorkspace === 'boolean') {
			value = config.userLocalValue ?? config.applicationValue;
			if (runsInWorkspace) {
				value = config.workspaceValue ?? config.workspaceFolderValue ?? config.userRemoteValue ?? value;
			}
		}

		const autoConfirm = value === true || (typeof value === 'object' && value.hasOwnProperty(toolId) && value[toolId] === true);
		if (autoConfirm) {
			if (await this._checkGlobalAutoApprove()) {
				return { type: ToolConfirmKind.Setting, id: ChatConfiguration.GlobalAutoApprove };
			}
		}

		return undefined;
	}

	private async _checkGlobalAutoApprove(): Promise<boolean> {
		const optedIn = this._storageService.getBoolean(AutoApproveStorageKeys.GlobalAutoApproveOptIn, StorageScope.APPLICATION, false);
		if (optedIn) {
			return true;
		}

		if (this._contextKeyService.getContextKeyValue(SkipAutoApproveConfirmationKey) === true) {
			return true;
		}

		const promptResult = await this._dialogService.prompt({
			type: Severity.Warning,
			message: localize('autoApprove2.title', 'Enable global auto approve?'),
			buttons: [
				{
					label: localize('autoApprove2.button.enable', 'Enable'),
					run: () => true
				},
				{
					label: localize('autoApprove2.button.disable', 'Disable'),
					run: () => false
				},
			],
			custom: {
				icon: Codicon.warning,
				disableCloseAction: true,
				markdownDetails: [{
					markdown: new MarkdownString(globalAutoApproveDescription.value),
				}],
			}
		});

		if (promptResult.result !== true) {
			await this._configurationService.updateValue(ChatConfiguration.GlobalAutoApprove, false);
			return false;
		}

		this._storageService.store(AutoApproveStorageKeys.GlobalAutoApproveOptIn, true, StorageScope.APPLICATION, StorageTarget.USER);
		return true;
	}

	private cleanupCallDisposables(requestId: string | undefined, store: DisposableStore): void {
		if (requestId) {
			const disposables = this._callsByRequestId.get(requestId);
			if (disposables) {
				const index = disposables.findIndex(d => d.store === store);
				if (index > -1) {
					disposables.splice(index, 1);
				}
				if (disposables.length === 0) {
					this._callsByRequestId.delete(requestId);
				}
			}
		}

		store.dispose();
	}

	cancelToolCallsForRequest(requestId: string): void {
		const calls = this._callsByRequestId.get(requestId);
		if (calls) {
			calls.forEach(call => call.store.dispose());
			this._callsByRequestId.delete(requestId);
		}
	}

	/**
	 * Create a map that contains all tools and toolsets with their enablement state.
	 * @param toolOrToolSetNames A list of tool or toolset names that are enabled.
	 * @returns A map of tool or toolset instances to their enablement state.
	 */
	toToolAndToolSetEnablementMap(enabledQualifiedToolOrToolSetNames: readonly string[]): IToolAndToolSetEnablementMap {
		const toolOrToolSetNames = new Set(enabledQualifiedToolOrToolSetNames);
		const result = new Map<ToolSet | IToolData, boolean>();

		for (const [tool, toolReferenceName] of this.getPromptReferencableTools()) {
			if (tool instanceof ToolSet) {
				const enabled = toolOrToolSetNames.has(toolReferenceName) || toolOrToolSetNames.has(tool.referenceName);
				result.set(tool, enabled);
				if (enabled) {
					for (const memberTool of tool.getTools()) {
						result.set(memberTool, true);
					}
				}
			} else {
				if (!result.has(tool)) { // already set via an enabled toolset
					const enabled = toolOrToolSetNames.has(toolReferenceName) || toolOrToolSetNames.has(tool.toolReferenceName ?? tool.displayName);
					result.set(tool, enabled);
				}
			}
		}
		// also add all user tool sets (not part of the prompt referencable tools)
		for (const toolSet of this._toolSets) {
			if (toolSet.source.type === 'user') {
				const enabled = Iterable.every(toolSet.getTools(), t => result.get(t) === true);
				result.set(toolSet, enabled);
			}
		}
		return result;
	}

	toQualifiedToolNames(map: IToolAndToolSetEnablementMap): string[] {
		const result: string[] = [];
		const toolsCoveredByEnabledToolSet = new Set<IToolData>();
		for (const [tool, toolReferenceName] of this.getPromptReferencableTools()) {
			if (tool instanceof ToolSet) {
				if (map.get(tool)) {
					result.push(toolReferenceName);
					for (const memberTool of tool.getTools()) {
						toolsCoveredByEnabledToolSet.add(memberTool);
					}
				}
			} else {
				if (map.get(tool) && !toolsCoveredByEnabledToolSet.has(tool)) {
					result.push(toolReferenceName);
				}
			}
		}
		return result;
	}

	toToolReferences(variableReferences: readonly IVariableReference[]): ChatRequestToolReferenceEntry[] {
		const toolsOrToolSetByName = new Map<string, ToolSet | IToolData>();
		for (const [tool, toolReferenceName] of this.getPromptReferencableTools()) {
			toolsOrToolSetByName.set(toolReferenceName, tool);
		}

		const result: ChatRequestToolReferenceEntry[] = [];
		for (const ref of variableReferences) {
			const toolOrToolSet = toolsOrToolSetByName.get(ref.name);
			if (toolOrToolSet) {
				if (toolOrToolSet instanceof ToolSet) {
					result.push(toToolSetVariableEntry(toolOrToolSet, ref.range));
				} else {
					result.push(toToolVariableEntry(toolOrToolSet, ref.range));
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

	private *getPromptReferencableTools(): Iterable<[IToolData | ToolSet, string]> {
		const coveredByToolSets = new Set<IToolData>();
		for (const toolSet of this.toolSets.get()) {
			if (toolSet.source.type !== 'user') {
				yield [toolSet, getToolSetReferenceName(toolSet)];
				for (const tool of toolSet.getTools()) {
					yield [tool, getToolReferenceName(tool, toolSet)];
					coveredByToolSets.add(tool);
				}
			}
		}
		for (const tool of this.getTools()) {
			if (tool.canBeReferencedInPrompt && !coveredByToolSets.has(tool)) {
				yield [tool, getToolReferenceName(tool)];
			}
		}
	}

	*getQualifiedToolNames(): Iterable<string> {
		for (const [, toolReferenceName] of this.getPromptReferencableTools()) {
			yield toolReferenceName;
		}
	}

	getDeprecatedQualifiedToolNames(): Map<string, string> {
		const result = new Map<string, string>();
		const add = (name: string, toolReferenceName: string) => {
			if (name !== toolReferenceName) {
				result.set(name, toolReferenceName);
			}
		};
		for (const [tool, toolReferenceName] of this.getPromptReferencableTools()) {
			if (tool instanceof ToolSet) {
				add(tool.referenceName, toolReferenceName);
			} else {
				add(tool.toolReferenceName ?? tool.displayName, toolReferenceName);
			}
		}
		return result;
	}

	getToolByQualifiedName(qualifiedName: string): IToolData | ToolSet | undefined {
		for (const [tool, toolReferenceName] of this.getPromptReferencableTools()) {
			if (qualifiedName === toolReferenceName) {
				return tool;
			}
			// legacy: check for the old name
			if (qualifiedName === (tool instanceof ToolSet ? tool.referenceName : tool.toolReferenceName ?? tool.displayName)) {
				return tool;
			}

		}
		return undefined;
	}

	getQualifiedToolName(tool: IToolData | ToolSet, toolSet?: ToolSet): string {
		if (tool instanceof ToolSet) {
			return getToolSetReferenceName(tool);
		}
		return getToolReferenceName(tool, toolSet);
	}
}

function getToolReferenceName(tool: IToolData, toolSet?: ToolSet) {
	const toolName = tool.toolReferenceName ?? tool.displayName;
	if (toolSet) {
		return `${toolSet.referenceName}/${toolName}`;
	} else if (tool.source.type === 'extension') {
		return `${tool.source.extensionId.value.toLowerCase()}/${toolName}`;
	}
	return toolName;
}

function getToolSetReferenceName(toolSet: ToolSet) {
	if (toolSet.source.type === 'mcp') {
		return `${toolSet.referenceName}/*`;
	}
	return toolSet.referenceName;
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
