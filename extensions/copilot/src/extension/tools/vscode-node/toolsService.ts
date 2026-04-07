/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { CopilotChatAttr, emitToolCallEvent, GenAiAttr, GenAiMetrics, GenAiOperationName, GenAiToolType, StdAttr, truncateForOTel } from '../../../platform/otel/common/index';
import { IOTelService, SpanKind, SpanStatusCode } from '../../../platform/otel/common/otelService';
import { getCurrentCapturingToken } from '../../../platform/requestLogger/node/requestLogger';
import { equals as arraysEqual } from '../../../util/vs/base/common/arrays';
import { Iterable } from '../../../util/vs/base/common/iterator';
import { Lazy } from '../../../util/vs/base/common/lazy';
import { isDisposable } from '../../../util/vs/base/common/lifecycle';
import { autorunIterableDelta } from '../../../util/vs/base/common/observableInternal';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { getContributedToolName, getToolName, mapContributedToolNamesInSchema, mapContributedToolNamesInString, ToolName } from '../common/toolNames';
import { ICopilotTool, ICopilotToolExtension, modelSpecificToolApplies, ToolRegistry } from '../common/toolsRegistry';
import { BaseToolsService } from '../common/toolsService';

export class ToolsService extends BaseToolsService {
	declare _serviceBrand: undefined;

	private readonly _copilotTools: Lazy<Map<ToolName, ICopilotTool<unknown>>>;

	// Extensions to override definitions for existing tools.
	private readonly _toolExtensions: Lazy<Map<ToolName, ICopilotToolExtension<unknown>>>;

	private _connectedModelSpecificTools = false;

	override get modelSpecificTools() {
		this.getModelSpecificTools();
		return super.modelSpecificTools;
	}

	private readonly _contributedToolCache: {
		input: readonly vscode.LanguageModelToolInformation[];
		output: readonly vscode.LanguageModelToolInformation[];
	} = { input: [], output: [] };

	get tools(): ReadonlyArray<vscode.LanguageModelToolInformation> {
		const tools = vscode.lm.tools;
		if (arraysEqual(this._contributedToolCache.input, tools)) {
			return this._contributedToolCache.output;
		}
		const input = [...tools];
		const contributedTools = [...input]
			.sort((a, b) => {
				// Sort builtin tools to the top
				const aIsBuiltin = a.name.startsWith('vscode_') || a.name.startsWith('copilot_');
				const bIsBuiltin = b.name.startsWith('vscode_') || b.name.startsWith('copilot_');
				if (aIsBuiltin && bIsBuiltin) {
					return a.name.localeCompare(b.name);
				} else if (!aIsBuiltin && !bIsBuiltin) {
					return a.name.localeCompare(b.name);
				}

				return aIsBuiltin ? -1 : 1;
			})
			.map(tool => {
				const owned = this.getCopilotTool(getToolName(tool.name));
				return owned?.alternativeDefinition?.(tool) ?? tool;
			});

		const result: vscode.LanguageModelToolInformation[] = contributedTools.map(tool => {
			return {
				...tool,
				name: getToolName(tool.name),
				description: mapContributedToolNamesInString(tool.description),
				inputSchema: tool.inputSchema && mapContributedToolNamesInSchema(tool.inputSchema),
			};
		});

		this._contributedToolCache.input = input;
		this._contributedToolCache.output = result;

		return result;
	}

	public get copilotTools() {
		return this._copilotTools.value;
	}

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
		@IOTelService private readonly _otelService: IOTelService,
	) {
		super(logService);
		this._copilotTools = new Lazy(() => new Map(ToolRegistry.getTools().map(t => [t.toolName, _instantiationService.createInstance(t)] as const)));
		this._toolExtensions = new Lazy(() => new Map(ToolRegistry.getToolExtensions().map(t => [t.toolName, _instantiationService.createInstance(t)] as const)));
	}

	private getModelSpecificTools() {
		if (!this._connectedModelSpecificTools) {
			this._register(autorunIterableDelta(
				reader => ToolRegistry.modelSpecificTools.read(reader),
				({ addedValues, removedValues }) => {
					for (const { definition } of removedValues) {
						const prev = this._modelSpecificTools.get(definition.name);
						if (isDisposable(prev)) {
							prev.dispose();
						}
						this._modelSpecificTools.delete(definition.name);
					}
					for (const { definition, tool } of addedValues) {
						const instance = this._instantiationService.createInstance(tool);
						this._modelSpecificTools.set(definition.name, { definition, tool: instance });
					}
				},
				v => v.definition,
			));
			this._connectedModelSpecificTools = true;
		}

		return this._modelSpecificTools;
	}

	invokeTool(name: string | ToolName, options: vscode.LanguageModelToolInvocationOptions<Object>, token: vscode.CancellationToken): Thenable<vscode.LanguageModelToolResult | vscode.LanguageModelToolResult2> {
		this._onWillInvokeTool.fire({ toolName: name });

		const isMcpTool = String(name).includes('mcp_');
		const toolInfo = this.tools.find(t => t.name === String(name));
		const chatSessionId = getCurrentCapturingToken()?.chatSessionId;
		const parentChatSessionId = getCurrentCapturingToken()?.parentChatSessionId;
		const debugLogLabel = getCurrentCapturingToken()?.debugLogLabel;
		const parentTraceContext = (options as { parentTraceContext?: { traceId: string; spanId: string } }).parentTraceContext;
		const span = this._otelService.startSpan(`execute_tool ${name}`, {
			kind: SpanKind.INTERNAL,
			parentTraceContext,
			attributes: {
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.EXECUTE_TOOL,
				[GenAiAttr.TOOL_NAME]: String(name),
				[GenAiAttr.TOOL_TYPE]: isMcpTool ? GenAiToolType.EXTENSION : GenAiToolType.FUNCTION,
				[GenAiAttr.TOOL_CALL_ID]: (options as { chatStreamToolCallId?: string }).chatStreamToolCallId ?? '',
				...(toolInfo?.description ? { [GenAiAttr.TOOL_DESCRIPTION]: toolInfo.description } : {}),
				...(chatSessionId ? { [CopilotChatAttr.CHAT_SESSION_ID]: chatSessionId } : {}),
				...(parentChatSessionId ? { [CopilotChatAttr.PARENT_CHAT_SESSION_ID]: parentChatSessionId } : {}),
				...(debugLogLabel ? { [CopilotChatAttr.DEBUG_LOG_LABEL]: debugLogLabel } : {}),
			},
		});
		// Always capture tool call arguments for the debug panel
		if (options.input !== undefined) {
			try {
				span.setAttribute(GenAiAttr.TOOL_CALL_ARGUMENTS, truncateForOTel(JSON.stringify(options.input)));
			} catch { /* swallow serialization errors */ }
		}

		// For runSubagent tool, store this execute_tool span's trace context so the subagent's
		// invoke_agent span can be parented to THIS tool call (not the grandparent invoke_agent).
		const chatStreamToolCallId = (options as { chatStreamToolCallId?: string }).chatStreamToolCallId;
		const chatRequestId = (options as { chatRequestId?: string }).chatRequestId;
		const subAgentInvocationId = (options as { subAgentInvocationId?: string }).subAgentInvocationId;
		if (String(name) === 'runSubagent') {
			const traceCtx = span.getSpanContext();
			if (traceCtx) {
				if (chatStreamToolCallId) {
					this._otelService.storeTraceContext(`subagent:toolcall:${chatStreamToolCallId}`, traceCtx);
				}
				if (subAgentInvocationId) {
					this._otelService.storeTraceContext(`subagent:invocation:${subAgentInvocationId}`, traceCtx);
				}
				// Store by request ID — re-store each time so parallel tool calls
				// all have their parent's context available (getStoredTraceContext auto-deletes)
				if (chatRequestId) {
					this._otelService.storeTraceContext(`subagent:request:${chatRequestId}`, traceCtx);
				}
			}
		}

		const startTime = Date.now();

		return vscode.lm.invokeTool(getContributedToolName(name), options, token).then(
			result => {
				span.setStatus(SpanStatusCode.OK);
				// Always capture tool result for the debug panel
				try {
					const parts: string[] = [];
					for (const p of result.content) {
						if (p instanceof vscode.LanguageModelTextPart) {
							parts.push(p.value);
						} else if (p instanceof vscode.LanguageModelPromptTsxPart) {
							parts.push(JSON.stringify(p.value));
						} else if (p instanceof vscode.LanguageModelDataPart) {
							parts.push(`[${p.mimeType}: ${p.data.byteLength} bytes]`);
						}
					}
					if (parts.length > 0) {
						span.setAttribute(GenAiAttr.TOOL_CALL_RESULT, truncateForOTel(parts.join('')));
					}
				} catch { /* swallow */ }
				span.end();
				const durationMs = Date.now() - startTime;
				GenAiMetrics.recordToolCallCount(this._otelService, String(name), true);
				GenAiMetrics.recordToolCallDuration(this._otelService, String(name), durationMs);
				emitToolCallEvent(this._otelService, String(name), durationMs, true);
				return result;
			},
			err => {
				span.setStatus(SpanStatusCode.ERROR, err instanceof Error ? err.message : String(err));
				span.setAttribute(StdAttr.ERROR_TYPE, err instanceof Error ? err.constructor.name : 'Error');
				span.setAttribute(GenAiAttr.TOOL_CALL_RESULT, truncateForOTel(`ERROR: ${err instanceof Error ? err.message : String(err)}`));
				span.recordException(err);
				span.end();
				const durationMs = Date.now() - startTime;
				GenAiMetrics.recordToolCallCount(this._otelService, String(name), false);
				GenAiMetrics.recordToolCallDuration(this._otelService, String(name), durationMs);
				emitToolCallEvent(this._otelService, String(name), durationMs, false, err instanceof Error ? err.constructor.name : 'Error');
				throw err;
			},
		);
	}

	override invokeToolWithEndpoint(name: string, options: vscode.LanguageModelToolInvocationOptions<Object>, endpoint: IChatEndpoint | undefined, token: vscode.CancellationToken): Thenable<vscode.LanguageModelToolResult2> {
		if (endpoint) {
			const toolName = getToolName(name);
			for (const [overridesTool] of this.getToolOverridesForEndpoint(endpoint)) {
				if (overridesTool === toolName) {
					return this.invokeTool(toolName, options, token);
				}
			}
		}

		return this.invokeTool(name, options, token);
	}

	override getCopilotTool(name: string): ICopilotTool<unknown> | undefined {
		return this._copilotTools.value.get(name as ToolName) || this.getModelSpecificTools().get(name)?.tool;
	}

	getTool(name: string | ToolName): vscode.LanguageModelToolInformation | undefined {
		return this.tools.find(tool => tool.name === name);
	}

	getToolByToolReferenceName(name: string): vscode.LanguageModelToolInformation | undefined {
		// Can't actually implement this in prod, name is not exposed
		throw new Error('This method for tests only');
	}

	getEnabledTools(request: vscode.ChatRequest, endpoint: IChatEndpoint, filter?: (tool: vscode.LanguageModelToolInformation) => boolean | undefined): vscode.LanguageModelToolInformation[] {
		const tools = this.tools;
		const toolMap = new Map(tools.map(t => [t.name, t]));
		// todo@connor4312: string check here is for back-compat for 1.109 Insiders
		const requestToolsByName = new Map(Iterable.map(request.tools, ([t, enabled]) => [typeof t === 'string' ? t : t.name, enabled]));

		const modelSpecificOverrides = new Map(this.getToolOverridesForEndpoint(endpoint, tools));
		const modelSpecificTools = this.getModelSpecificTools();

		return tools
			.filter(tool => {
				// 0. If the tool was a model specific tool with an override, it'll be mixed in in the 'map' later.
				if (modelSpecificTools.get(tool.name)?.tool.overridesTool) {
					return false;
				}

				// 0. Check if the tool was disabled via the tool picker. If so, it must be disabled here
				const toolPickerSelection = requestToolsByName.get(getContributedToolName(tool.name));
				if (toolPickerSelection === false) {
					return false;
				}

				// 1. Check for what the consumer wants explicitly
				const explicit = filter?.(tool);
				if (explicit !== undefined) {
					return explicit;
				}

				// 2. Check if the request's tools explicitly asked for this tool to be enabled
				for (const ref of request.toolReferences) {
					const usedTool = toolMap.get(ref.name);
					if (usedTool?.tags.includes(`enable_other_tool_${tool.name}`)) {
						return true;
					}
				}

				// 3. If this tool is neither enabled nor disabled, then consumer didn't have opportunity to enable/disable it.
				// This can happen when a tool is added during another tool call (e.g. installExt tool installs an extension that contributes tools).
				if (toolPickerSelection === undefined && tool.tags.includes('extension_installed_by_tool')) {
					return true;
				}

				// Tool was enabled via tool picker
				if (toolPickerSelection === true) {
					return true;
				}

				return false;
			})
			.map(tool => {
				// Apply model-specific alternative if available via alternativeDefinition
				const toolName = getToolName(tool.name) as ToolName;
				const override = modelSpecificOverrides.get(toolName);
				let resultTool = tool;
				if (override?.tool) {
					resultTool = { ...override.info, name: resultTool.name };
				}

				const owned = override?.tool || this.getCopilotTool(toolName);
				if (owned?.alternativeDefinition) {
					resultTool = owned.alternativeDefinition(resultTool, endpoint);
				}

				const extension = this._toolExtensions.value.get(toolName);
				if (extension?.alternativeDefinition) {
					resultTool = extension.alternativeDefinition(resultTool, endpoint);
				}

				return resultTool;
			});
	}

	private *getToolOverridesForEndpoint(endpoint: IChatEndpoint, tools = this.tools) {
		for (const tool of tools) {
			const modelSpecificTool = this.getModelSpecificTools().get(tool.name);
			if (!modelSpecificTool) {
				continue;
			}
			if (!modelSpecificToolApplies(modelSpecificTool.definition, endpoint)) {
				continue;
			}

			if (modelSpecificTool.tool.overridesTool) {
				yield [modelSpecificTool.tool.overridesTool, { info: tool, tool: modelSpecificTool.tool }] as const;
			}
		}
	}
}
