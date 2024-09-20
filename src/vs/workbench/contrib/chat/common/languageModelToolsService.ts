/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';

export interface IToolData {
	id: string;
	name?: string;
	icon?: { dark: URI; light?: URI } | ThemeIcon;
	when?: ContextKeyExpression;
	displayName?: string;
	userDescription?: string;
	modelDescription: string;
	parametersSchema?: IJSONSchema;
	canBeInvokedManually?: boolean;
}

interface IToolEntry {
	data: IToolData;
	impl?: IToolImpl;
}

export interface IToolInvocation {
	callId: string;
	toolId: string;
	parameters: any;
	tokenBudget?: number;
	context: IToolInvocationContext | undefined;
}

export interface IToolInvocationContext {
	sessionId: string;
}

export interface IToolResult {
	[contentType: string]: any;
	string: string;
}

export interface IToolImpl {
	invoke(dto: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult>;
}

export const ILanguageModelToolsService = createDecorator<ILanguageModelToolsService>('ILanguageModelToolsService');

export type CountTokensCallback = (input: string, token: CancellationToken) => Promise<number>;

export interface ILanguageModelToolsService {
	_serviceBrand: undefined;
	onDidChangeTools: Event<void>;
	registerToolData(toolData: IToolData): IDisposable;
	registerToolImplementation(name: string, tool: IToolImpl): IDisposable;
	getTools(): Iterable<Readonly<IToolData>>;
	getTool(id: string): IToolData | undefined;
	getToolByName(name: string): IToolData | undefined;
	invokeTool(dto: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult>;
}

export class LanguageModelToolsService extends Disposable implements ILanguageModelToolsService {
	_serviceBrand: undefined;

	private _onDidChangeTools = new Emitter<void>();
	readonly onDidChangeTools = this._onDidChangeTools.event;

	/** Throttle tools updates because it sends all tools and runs on context key updates */
	private _onDidChangeToolsScheduler = new RunOnceScheduler(() => this._onDidChangeTools.fire(), 750);

	private _tools = new Map<string, IToolEntry>();
	private _toolContextKeys = new Set<string>();

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
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

	registerToolImplementation(name: string, tool: IToolImpl): IDisposable {
		const entry = this._tools.get(name);
		if (!entry) {
			throw new Error(`Tool "${name}" was not contributed.`);
		}

		if (entry.impl) {
			throw new Error(`Tool "${name}" already has an implementation.`);
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
			if (toolData.name === name) {
				return toolData;
			}
		}
		return undefined;
	}

	async invokeTool(dto: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult> {
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

		return tool.impl.invoke(dto, countTokens, token);
	}
}
