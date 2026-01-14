/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { isDefined } from '../../../base/common/types.js';
import { isUriComponents, URI, UriComponents } from '../../../base/common/uri.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../contrib/chat/common/actions/chatContextKeys.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolData, IToolInvocation, IToolProgressStep, IToolResult, ToolDataSource, ToolProgress, toolResultHasBuffers } from '../../contrib/chat/common/tools/languageModelToolsService.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { Dto, SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostContext, ExtHostLanguageModelToolsShape, ILanguageModelChatSelectorDto, IToolDataDto, IToolDefinitionDto, MainContext, MainThreadLanguageModelToolsShape } from '../common/extHost.protocol.js';

/**
 * Compile a single model selector to a ContextKeyExpression.
 * All specified fields must match (AND).
 */
function selectorToContextKeyExpr(selector: ILanguageModelChatSelectorDto): ContextKeyExpression | undefined {
	const conditions: ContextKeyExpression[] = [];
	if (selector.id) {
		conditions.push(ContextKeyExpr.equals(ChatContextKeys.Model.id.key, selector.id));
	}
	if (selector.vendor) {
		conditions.push(ContextKeyExpr.equals(ChatContextKeys.Model.vendor.key, selector.vendor));
	}
	if (selector.family) {
		conditions.push(ContextKeyExpr.equals(ChatContextKeys.Model.family.key, selector.family));
	}
	if (selector.version) {
		conditions.push(ContextKeyExpr.equals(ChatContextKeys.Model.version.key, selector.version));
	}
	if (conditions.length === 0) {
		return undefined;
	}
	return ContextKeyExpr.and(...conditions);
}

/**
 * Compile multiple model selectors to a ContextKeyExpression.
 * Any selector may match (OR).
 */
function selectorsToContextKeyExpr(selectors: ILanguageModelChatSelectorDto[]): ContextKeyExpression | undefined {
	if (selectors.length === 0) {
		return undefined;
	}
	const expressions = selectors.map(selectorToContextKeyExpr).filter(isDefined);
	if (expressions.length === 0) {
		return undefined;
	}
	if (expressions.length === 1) {
		return expressions[0];
	}
	return ContextKeyExpr.or(...expressions);
}

@extHostNamedCustomer(MainContext.MainThreadLanguageModelTools)
export class MainThreadLanguageModelTools extends Disposable implements MainThreadLanguageModelToolsShape {

	private readonly _proxy: ExtHostLanguageModelToolsShape;
	private readonly _tools = this._register(new DisposableMap<string>());
	private readonly _runningToolCalls = new Map</* call ID */string, {
		countTokens: CountTokensCallback;
		progress: ToolProgress;
	}>();

	constructor(
		extHostContext: IExtHostContext,
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostLanguageModelTools);

		this._register(this._languageModelToolsService.onDidChangeTools(e => this._proxy.$onDidChangeTools(this.getToolDtos())));
	}

	private getToolDtos(): IToolDataDto[] {
		return Array.from(this._languageModelToolsService.getAllToolsIncludingDisabled())
			.map(tool => ({
				id: tool.id,
				displayName: tool.displayName,
				toolReferenceName: tool.toolReferenceName,
				legacyToolReferenceFullNames: tool.legacyToolReferenceFullNames,
				tags: tool.tags,
				userDescription: tool.userDescription,
				modelDescription: tool.modelDescription,
				inputSchema: tool.inputSchema,
				source: tool.source,
			} satisfies IToolDataDto));
	}

	async $getTools(): Promise<IToolDataDto[]> {
		return this.getToolDtos();
	}

	async $invokeTool(dto: Dto<IToolInvocation>, token?: CancellationToken): Promise<Dto<IToolResult> | SerializableObjectWithBuffers<Dto<IToolResult>>> {
		const result = await this._languageModelToolsService.invokeTool(
			revive<IToolInvocation>(dto),
			(input, token) => this._proxy.$countTokensForInvocation(dto.callId, input, token),
			token ?? CancellationToken.None,
		);

		// Only return content and metadata to EH
		const out: Dto<IToolResult> = {
			content: result.content,
			toolMetadata: result.toolMetadata
		};
		return toolResultHasBuffers(result) ? new SerializableObjectWithBuffers(out) : out;
	}

	$acceptToolProgress(callId: string, progress: IToolProgressStep): void {
		this._runningToolCalls.get(callId)?.progress.report(progress);
	}

	$countTokensForInvocation(callId: string, input: string, token: CancellationToken): Promise<number> {
		const fn = this._runningToolCalls.get(callId);
		if (!fn) {
			throw new Error(`Tool invocation call ${callId} not found`);
		}

		return fn.countTokens(input, token);
	}

	$registerTool(id: string): void {
		const disposable = this._languageModelToolsService.registerToolImplementation(
			id,
			{
				invoke: async (dto, countTokens, progress, token) => {
					try {
						this._runningToolCalls.set(dto.callId, { countTokens, progress });
						const resultSerialized = await this._proxy.$invokeTool(dto, token);
						const resultDto: Dto<IToolResult> = resultSerialized instanceof SerializableObjectWithBuffers ? resultSerialized.value : resultSerialized;
						return revive<IToolResult>(resultDto);
					} finally {
						this._runningToolCalls.delete(dto.callId);
					}
				},
				prepareToolInvocation: (context, token) => this._proxy.$prepareToolInvocation(id, context, token),
			});
		this._tools.set(id, disposable);
	}

	$registerToolWithDefinition(definition: IToolDefinitionDto): void {
		let icon: IToolData['icon'] | undefined;
		if (definition.icon) {
			if (ThemeIcon.isThemeIcon(definition.icon)) {
				icon = definition.icon;
			} else if (typeof definition.icon === 'object' && definition.icon !== null && isUriComponents(definition.icon)) {
				icon = { dark: URI.revive(definition.icon as UriComponents) };
			} else {
				const iconObj = definition.icon as { light?: UriComponents; dark: UriComponents };
				icon = { dark: URI.revive(iconObj.dark), light: iconObj.light ? URI.revive(iconObj.light) : undefined };
			}
		}

		// Compile model selectors to when clause
		let when: ContextKeyExpression | undefined;
		if (definition.models?.length) {
			when = selectorsToContextKeyExpr(definition.models);
		}

		// Convert source from DTO
		const source = revive<ToolDataSource>(definition.source);

		// Create the tool data
		const toolData: IToolData = {
			id: definition.id,
			displayName: definition.displayName,
			toolReferenceName: definition.toolReferenceName,
			legacyToolReferenceFullNames: definition.legacyToolReferenceFullNames,
			tags: definition.tags,
			userDescription: definition.userDescription,
			modelDescription: definition.modelDescription,
			inputSchema: definition.inputSchema,
			source,
			icon,
			when,
			models: definition.models,
			canBeReferencedInPrompt: true,
		};

		// Register both tool data and implementation
		const id = definition.id;
		const disposable = this._languageModelToolsService.registerTool(
			toolData,
			{
				invoke: async (dto, countTokens, progress, token) => {
					try {
						this._runningToolCalls.set(dto.callId, { countTokens, progress });
						const resultSerialized = await this._proxy.$invokeTool(dto, token);
						const resultDto: Dto<IToolResult> = resultSerialized instanceof SerializableObjectWithBuffers ? resultSerialized.value : resultSerialized;
						return revive<IToolResult>(resultDto);
					} finally {
						this._runningToolCalls.delete(dto.callId);
					}
				},
				prepareToolInvocation: (context, token) => this._proxy.$prepareToolInvocation(id, context, token),
			}
		);
		this._tools.set(id, disposable);
	}

	$unregisterTool(name: string): void {
		this._tools.deleteAndDispose(name);
	}
}
