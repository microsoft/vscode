/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { isUriComponents, URI, UriComponents } from '../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { toToolSetKey } from '../../contrib/chat/common/tools/languageModelToolsContribution.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolData, IToolInvocation, IToolProgressStep, IToolResult, ToolDataSource, ToolProgress, toolResultHasBuffers, ToolSet } from '../../contrib/chat/common/tools/languageModelToolsService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { Dto, SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostContext, ExtHostLanguageModelToolsShape, IToolDataDto, IToolDefinitionDto, MainContext, MainThreadLanguageModelToolsShape } from '../common/extHost.protocol.js';

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
		@ILogService private readonly _logService: ILogService,
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

	$registerTool(id: string, hasHandleToolStream: boolean): void {
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
				handleToolStream: hasHandleToolStream ? (context, token) => this._proxy.$handleToolStream(id, context, token) : undefined,
			});
		this._tools.set(id, disposable);
	}

	$registerToolWithDefinition(extensionId: ExtensionIdentifier, definition: IToolDefinitionDto, hasHandleToolStream: boolean): void {
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
			models: definition.models,
			canBeReferencedInPrompt: !!definition.userDescription && !definition.toolSet,
		};

		// Register both tool data and implementation
		const id = definition.id;
		const store = new DisposableStore();
		store.add(this._languageModelToolsService.registerTool(
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
				handleToolStream: hasHandleToolStream ? (context, token) => this._proxy.$handleToolStream(id, context, token) : undefined,
				prepareToolInvocation: (context, token) => this._proxy.$prepareToolInvocation(id, context, token),
			}
		));

		if (definition.toolSet) {
			const ts = this._languageModelToolsService.getToolSet(toToolSetKey(extensionId, definition.toolSet)) || this._languageModelToolsService.getToolSet(definition.toolSet);
			if (!ts || !(ts instanceof ToolSet)) {
				this._logService.warn(`ToolSet ${definition.toolSet} not found for tool ${definition.id} from extension ${extensionId.value}`);
			} else {
				store.add(ts.addTool(toolData));
			}
		}

		this._tools.set(id, store);
	}

	$unregisterTool(name: string): void {
		this._tools.deleteAndDispose(name);
	}
}
