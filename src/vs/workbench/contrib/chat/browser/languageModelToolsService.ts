/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderStringAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, DisposableStore, dispose, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ChatModel } from '../common/chatModel.js';
import { ChatToolInvocation } from '../common/chatProgressTypes/chatToolInvocation.js';
import { IChatService } from '../common/chatService.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolData, IToolImpl, IToolInvocation, IToolResult } from '../common/languageModelToolsService.js';

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


	private _callsByRequestId = new Map<string, IDisposable[]>();

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IChatService private readonly _chatService: IChatService,
		@IDialogService private readonly _dialogService: IDialogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(this._toolContextKeys)) {
				// Not worth it to compute a delta here unless we have many tools changing often
				this._onDidChangeToolsScheduler.schedule();
			}
		}));
	}

	registerToolData(toolData: IToolData): IDisposable {
		if (this._tools.has(toolData.id)) {
			throw new Error(`Tool "${toolData.id}" is already registered.`);
		}

		this._tools.set(toolData.id, { data: toolData });
		this._onDidChangeToolsScheduler.schedule();

		toolData.when?.keys().forEach(key => this._toolContextKeys.add(key));

		return toDisposable(() => {
			this._tools.delete(toolData.id);
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
		return Iterable.filter(toolDatas, toolData => !toolData.when || this._contextKeyService.contextMatchesRules(toolData.when));
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

				const prepared = tool.impl.prepareToolInvocation ?
					await tool.impl.prepareToolInvocation(dto.parameters, token)
					: undefined;

				toolInvocation = new ChatToolInvocation(prepared, tool.data);
				model.acceptResponseProgress(request, toolInvocation);
				if (prepared?.confirmationMessages) {
					const userConfirmed = await toolInvocation.confirmed.p;
					if (!userConfirmed) {
						throw new CancellationError();
					}

					dto.toolSpecificData = toolInvocation?.toolSpecificData;
				}
			} else {
				const prepared = tool.impl.prepareToolInvocation ?
					await tool.impl.prepareToolInvocation(dto.parameters, token)
					: undefined;

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
			this._telemetryService.publicLog2<LanguageModelToolInvokedEvent, LanguageModelToolInvokedClassification>(
				'languageModelToolInvoked',
				{
					result: 'success',
					chatSessionId: dto.context?.sessionId,
					toolId: tool.data.id,
					toolExtensionId: tool.data.extensionId?.value,
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
					toolExtensionId: tool.data.extensionId?.value,
				});
			throw err;
		} finally {
			toolInvocation?.complete(toolResult);

			if (requestId && store) {
				this.cleanupCallDisposables(requestId, store);
			}
		}
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
	}
}

type LanguageModelToolInvokedEvent = {
	result: 'success' | 'error' | 'userCancelled';
	chatSessionId: string | undefined;
	toolId: string;
	toolExtensionId: string | undefined;
};

type LanguageModelToolInvokedClassification = {
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether invoking the LanguageModelTool resulted in an error.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the chat session that the tool was used within, if applicable.' };
	toolId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the tool used.' };
	toolExtensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension that contributed the tool.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of language model tools.';
};
