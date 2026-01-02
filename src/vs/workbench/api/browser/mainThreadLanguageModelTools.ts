/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolInvocation, IToolProgressStep, IToolResult, ToolProgress, toolResultHasBuffers } from '../../contrib/chat/common/tools/languageModelToolsService.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { Dto, SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostContext, ExtHostLanguageModelToolsShape, IToolDataDto, MainContext, MainThreadLanguageModelToolsShape } from '../common/extHost.protocol.js';

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
		return Array.from(this._languageModelToolsService.getTools())
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

	$unregisterTool(name: string): void {
		this._tools.deleteAndDispose(name);
	}
}
