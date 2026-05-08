/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestMetadata, RequestType } from '@vscode/copilot-api';
import { AssistantMessage, BasePromptElementProps, Chunk, IfEmpty, Image, JSONTree, PromptElement, PromptElementProps, PromptMetadata, PromptPiece, PromptSizing, TokenLimit, ToolCall, ToolMessage, useKeepWith, UserMessage } from '@vscode/prompt-tsx';
import type { ChatParticipantToolToken, LanguageModelToolInvocationOptions, LanguageModelToolResult2, LanguageModelToolTokenizationOptions } from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { IChatHookService, IPreToolUseHookResult } from '../../../../platform/chat/common/chatHookService';
import { ISessionTranscriptService } from '../../../../platform/chat/common/sessionTranscriptService';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { modelCanUseMcpResultImageURL } from '../../../../platform/endpoint/common/chatModelCapabilities';
import { CompactionDataContainer } from '../../../../platform/endpoint/common/compactionDataContainer';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { CacheType } from '../../../../platform/endpoint/common/endpointTypes';
import { PhaseDataContainer } from '../../../../platform/endpoint/common/phaseDataContainer';
import { StatefulMarkerContainer } from '../../../../platform/endpoint/common/statefulMarkerContainer';
import { ThinkingDataContainer } from '../../../../platform/endpoint/common/thinkingDataContainer';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { IImageService } from '../../../../platform/image/common/imageService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IOTelService } from '../../../../platform/otel/common/otelService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { toErrorMessage } from '../../../../util/common/errorMessage';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../../util/vs/base/common/errors';
import { getExtensionForMimeType } from '../../../../util/vs/base/common/mime';
import { URI, UriComponents } from '../../../../util/vs/base/common/uri';
import { IInstantiationService, ServicesAccessor } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from '../../../../util/vs/platform/instantiation/common/serviceCollection';
import { LanguageModelDataPart, LanguageModelDataPart2, LanguageModelPartAudience, LanguageModelPromptTsxPart, LanguageModelTextPart, LanguageModelTextPart2, LanguageModelToolMCPSource, LanguageModelToolResult } from '../../../../vscodeTypes';
import { isImageDataPart } from '../../../conversation/common/languageModelChatMessageHelpers';
import { IResultMetadata } from '../../../prompt/common/conversation';
import { IBuildPromptContext, IToolCall, IToolCallRound } from '../../../prompt/common/intents';
import { toJsonSchema } from '../../../tools/common/toJsonSchema';
import { ToolName } from '../../../tools/common/toolNames';
import { CopilotToolMode } from '../../../tools/common/toolsRegistry';
import { IToolsService } from '../../../tools/common/toolsService';
import { IChatDiskSessionResources } from '../../common/chatDiskSessionResources';
import { IPromptEndpoint, PromptRenderer } from '../base/promptRenderer';
import { Tag } from '../base/tag';

export interface ChatToolCallsProps extends BasePromptElementProps {
	readonly promptContext: IBuildPromptContext;
	readonly toolCallRounds: readonly IToolCallRound[] | undefined;
	readonly toolCallResults: Record<string, LanguageModelToolResult2> | undefined;
	readonly isHistorical?: boolean;
	readonly toolCallMode?: CopilotToolMode;
	readonly enableCacheBreakpoints?: boolean;
	readonly truncateAt?: number;
}

const MAX_INPUT_VALIDATION_RETRIES = 5;

/**
 * Render one round of the assistant response's tool calls.
 * One assistant response "turn" which contains multiple rounds of assistant message text, tool calls, and tool results.
 */
export class ChatToolCalls extends PromptElement<ChatToolCallsProps, void> {
	constructor(
		props: PromptElementProps<ChatToolCallsProps>,
		@IToolsService private readonly toolsService: IToolsService,
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing, _progress?: unknown, token?: CancellationToken): Promise<PromptPiece<any, any> | undefined> {
		if (!this.props.promptContext.tools || !this.props.toolCallRounds?.length) {
			return;
		}

		// Create a child instantiation service with IBuildPromptContext registered
		const hydratedInstantiationService = this.instantiationService.createChild(
			new ServiceCollection([IBuildPromptContext, this.props.promptContext])
		);

		// Shared budget to limit total image data across all tool results in this turn.
		// Prevents 413 errors when many image-returning tools run in parallel.
		const sharedImageBudget: SharedImageBudget = { remaining: CAPI_IMAGE_BUDGET_BYTES };

		const toolCallRounds = this.props.toolCallRounds.flatMap((round, i) => {
			return this.renderOneToolCallRound(round, i, this.props.toolCallRounds!.length, hydratedInstantiationService, sharedImageBudget, token);
		});
		if (!toolCallRounds.length) {
			return;
		}

		const KeepWith = useKeepWith();
		return <>
			<KeepWith priority={1} flexGrow={1}>
				{toolCallRounds}
			</KeepWith>
		</>;
	}

	/**
	 * Render one round of tool calling: the assistant message text, its tool calls, and the results of those tool calls.
	 */
	private renderOneToolCallRound(round: IToolCallRound, index: number, total: number, hydratedInstantiationService: IInstantiationService, sharedImageBudget: SharedImageBudget, token?: CancellationToken): PromptElement[] {
		let fixedNameToolCalls = round.toolCalls.map(tc => ({ ...tc, name: this.toolsService.validateToolName(tc.name) ?? tc.name }));
		if (this.props.isHistorical) {
			fixedNameToolCalls = fixedNameToolCalls.filter(tc => tc.id && this.props.toolCallResults?.[tc.id]);
		}

		if (round.toolCalls.length && !fixedNameToolCalls.length) {
			return [];
		}

		const assistantToolCalls: Required<ToolCall>[] = fixedNameToolCalls.map(tc => ({
			type: 'function',
			function: { name: tc.name, arguments: tc.arguments },
			id: tc.id!,
			keepWith: useKeepWith(),
		}));
		const children: PromptElement[] = [];

		// Don't include this when rendering and triggering summarization
		const statefulMarker = round.statefulMarker && <StatefulMarkerContainer statefulMarker={{ modelId: this.promptEndpoint.model, marker: round.statefulMarker }} />;
		// Backward compat: older persisted rounds use `phaseModelId` instead of `modelId`. Read both.
		const roundModelId = round.modelId ?? (round as IToolCallRound & { phaseModelId?: string }).phaseModelId;
		const includeThinking = !this.props.isHistorical || (this.promptEndpoint.apiType === 'responses' && roundModelId === this.promptEndpoint.model);
		const thinking = includeThinking && round.thinking && <ThinkingDataContainer thinking={round.thinking} />;
		const phase = (round.phase && roundModelId === this.promptEndpoint.model) ? <PhaseDataContainer phase={round.phase} /> : undefined;
		const compaction = round.compaction && <CompactionDataContainer compaction={round.compaction} />;
		children.push(
			<AssistantMessage toolCalls={assistantToolCalls}>
				{statefulMarker}
				{thinking}
				{phase}
				{compaction}
				{round.response}
			</AssistantMessage>);

		// Tool call elements should be rendered with the later elements first, allowed to grow to fill the available space
		// Each tool 'reserves' 1/(N*4) of the available space just so that newer tool calls don't completely elimate
		// older tool calls.
		const reserve1N = (1 / (total * 4)) / fixedNameToolCalls.length;
		// todo@connor4312: historical tool calls don't need to reserve and can all be flexed together
		for (const [i, toolCall] of fixedNameToolCalls.entries()) {
			const KeepWith = assistantToolCalls[i].keepWith;
			children.push(
				<KeepWith priority={index} flexGrow={index + 1} flexReserve={`/${1 / reserve1N}`}>
					{hydratedInstantiationService.invokeFunction(buildToolResultElement, {
						toolCall: toolCall,
						toolInvocationToken: this.props.promptContext.tools!.toolInvocationToken,
						toolCallResult: this.props.toolCallResults?.[toolCall.id!],
						allowInvokingTool: !this.props.isHistorical,
						validateInput: round.toolInputRetry < MAX_INPUT_VALIDATION_RETRIES,
						requestId: this.props.promptContext.requestId,
						toolCallMode: this.props.toolCallMode ?? CopilotToolMode.PartialContext,
						isLast: !this.props.isHistorical && i === fixedNameToolCalls.length - 1 && index === total - 1,
						enableCacheBreakpoints: this.props.enableCacheBreakpoints ?? false,
						truncateAt: this.props.truncateAt,
						sessionId: this.props.promptContext.request?.sessionId,
						// Strip images from historical turns to avoid 413 errors
						stripImages: !!this.props.isHistorical,
						sharedImageBudget,
						token: token ?? CancellationToken.None,
					})}
				</KeepWith>,
			);
		}

		// If a hook added context after this round, render it as a user message
		if (round.hookContext) {
			children.push(<UserMessage>{round.hookContext}</UserMessage>);
		}

		return children;
	}
}

/**
 * Half the CAPI body-size limit (5 MB), used to cap image data so the rest
 * of the prompt still fits.  Shared by both the per-tool and cross-tool budgets.
 */
const CAPI_IMAGE_BUDGET_BYTES = (5 * 1024 * 1024) / 2;

/**
 * Shared mutable counter that limits the total image data rendered across
 * all tool results within a turn, preventing 413 (request too large) errors
 * when many image-returning tools (e.g. view_image) run in parallel.
 */
interface SharedImageBudget {
	remaining: number;
}

interface ToolResultOpts {
	readonly toolCall: IToolCall;
	readonly toolInvocationToken: ChatParticipantToolToken | undefined;
	readonly toolCallResult: LanguageModelToolResult2 | undefined;
	readonly allowInvokingTool?: boolean;
	readonly validateInput?: boolean;
	readonly requestId?: string;
	readonly toolCallMode: CopilotToolMode;
	readonly isLast: boolean;
	readonly enableCacheBreakpoints: boolean;
	readonly truncateAt?: number;
	readonly sessionId: string | undefined;
	readonly stripImages?: boolean;
	readonly sharedImageBudget?: SharedImageBudget;
	readonly token: CancellationToken;
}

const toolErrorSuffix = '\nPlease check your input and try again.';

/**
 * Creates a <ToolResult /> element. Eagerly starts the tool call if we know
 * that the tool will not need/consume sizing information (e.g. MCP calls) and
 * therefore don't need to wait for other elements to sequentially render.
 */
function buildToolResultElement(accessor: ServicesAccessor, props: ToolResultOpts) {
	const toolsService: IToolsService = accessor.get(IToolsService);
	const logService: ILogService = accessor.get(ILogService);
	const telemetryService: ITelemetryService = accessor.get(ITelemetryService);
	const endpointProvider: IEndpointProvider = accessor.get(IEndpointProvider);
	const promptEndpoint: IPromptEndpoint = accessor.get(IPromptEndpoint);
	const promptContext: IBuildPromptContext = accessor.get(IBuildPromptContext);
	const sessionTranscriptService = accessor.get(ISessionTranscriptService);
	const chatHookService = accessor.get(IChatHookService);
	const otelService = accessor.get(IOTelService);
	const instantiationService = accessor.get(IInstantiationService);
	const tool = toolsService.getTool(props.toolCall.name);

	async function getToolResult(sizing: PromptSizing) {
		const tokenizationOptions: LanguageModelToolTokenizationOptions = {
			tokenBudget: sizing.tokenBudget,
			countTokens: async (content: string) => sizing.countTokens(content),
		};

		if (!props.toolCallResult && !props.allowInvokingTool) {
			throw new Error(`Missing tool call result for "${props.toolCall.id}" (${props.toolCall.name})`);
		}

		const extraMetadata: PromptMetadata[] = [];
		let isCancelled = false;
		let toolResult = props.toolCallResult;
		const copilotTool = toolsService.getCopilotTool(props.toolCall.name as ToolName);
		if (toolResult === undefined) {
			let inputObj: unknown;
			let validation: ToolValidationOutcome = ToolValidationOutcome.Unknown;
			if (props.validateInput) {
				const validationResult = toolsService.validateToolInput(props.toolCall.name, props.toolCall.arguments);
				if ('error' in validationResult) {
					validation = ToolValidationOutcome.Invalid;
					extraMetadata.push(new ToolFailureEncountered(props.toolCall.id));
					toolResult = textToolResult(validationResult.error + toolErrorSuffix);
				} else {
					validation = ToolValidationOutcome.Valid;
					inputObj = validationResult.inputObj;
				}
			} else {
				inputObj = JSON.parse(props.toolCall.arguments);
			}

			let outcome: ToolInvocationOutcome = toolResult === undefined ? ToolInvocationOutcome.Success : ToolInvocationOutcome.InvalidInput;
			if (toolResult === undefined) {
				try {
					if (promptContext.tools && !promptContext.tools.availableTools.find(t => t.name === props.toolCall.name)) {
						outcome = ToolInvocationOutcome.DisabledByUser;
						throw new Error(`Tool ${props.toolCall.name} is currently disabled by the user, and cannot be called.`);
					}

					if (copilotTool?.resolveInput) {
						inputObj = await copilotTool.resolveInput(inputObj, promptContext, props.toolCallMode);
					}

					// Execute preToolUse hook before invoking the tool
					const hookResult = await chatHookService.executePreToolUseHook(
						props.toolCall.name, inputObj, props.toolCall.id,
						promptContext.request?.hooks, promptContext.conversation?.sessionId,
						props.token,
						promptContext.stream
					);

					// Apply updatedInput from hook (input modification takes effect before invocation)
					if (hookResult?.updatedInput) {
						inputObj = hookResult.updatedInput;
					}

					const subAgentInvocationId = promptContext.request?.subAgentInvocationId;
					// Capture the active trace context (from the invoke_agent span) so that
					// the execute_tool span is properly parented even when async context
					// propagation doesn't carry the active span.
					const parentTraceContext = otelService.getActiveTraceContext();
					const invocationOptions: LanguageModelToolInvocationOptions<unknown> = {
						input: inputObj,
						toolInvocationToken: props.toolInvocationToken,
						tokenizationOptions,
						chatRequestId: props.requestId,
						subAgentInvocationId,
						// Split on `__vscode` so it's the chat stream id
						// TODO @lramos15 - This is a gross hack
						chatStreamToolCallId: props.toolCall.id.split('__vscode')[0],
						preToolUseResult: hookResult ? {
							permissionDecision: hookResult.permissionDecision,
							permissionDecisionReason: hookResult.permissionDecisionReason,
							updatedInput: hookResult.updatedInput,
						} : undefined,
					};
					// Attach trace context for span parenting (not in the VS Code API type)
					(invocationOptions as { parentTraceContext?: { traceId: string; spanId: string } }).parentTraceContext = parentTraceContext;

					const transcriptSessionId = promptContext.conversation?.sessionId;
					if (transcriptSessionId) {
						let parsedArgs: unknown;
						try { parsedArgs = JSON.parse(props.toolCall.arguments); } catch { parsedArgs = props.toolCall.arguments; }
						sessionTranscriptService.logToolExecutionStart(transcriptSessionId, props.toolCall.id, props.toolCall.name, parsedArgs);
					}

					toolResult = await toolsService.invokeToolWithEndpoint(props.toolCall.name, invocationOptions, promptEndpoint, props.token);
					sendInvokedToolTelemetry(instantiationService, promptEndpoint, telemetryService, props.toolCall.name, toolResult);

					// Run hook context handling after tool execution
					appendHookContext(toolResult, hookResult, chatHookService, props, inputObj, promptContext);

					if (transcriptSessionId) {
						sessionTranscriptService.logToolExecutionComplete(transcriptSessionId, props.toolCall.id, true);
					}
				} catch (err) {
					const errResult = toolCallErrorToResult(err);
					toolResult = errResult.result;
					isCancelled = errResult.isCancelled ?? false;
					if (errResult.isCancelled) {
						outcome = ToolInvocationOutcome.Cancelled;
					} else {
						outcome = outcome === ToolInvocationOutcome.DisabledByUser ? outcome : ToolInvocationOutcome.Error;
						extraMetadata.push(new ToolFailureEncountered(props.toolCall.id));
						logService.error(`Error from tool ${props.toolCall.name} with args ${props.toolCall.arguments}`, toErrorMessage(err, true));
					}
					if (promptContext.conversation?.sessionId) {
						sessionTranscriptService.logToolExecutionComplete(promptContext.conversation.sessionId, props.toolCall.id, false);
					}
				}
			}

			sendToolCallTelemetry(props, promptContext, outcome, validation, endpointProvider, telemetryService);
		}

		return { toolResult, isCancelled, extraMetadata };
	}

	let call: IToolResultElementActualProps['call'];
	if (tool?.source instanceof LanguageModelToolMCPSource || tool?.name && toolsCalledInParallel.has(tool.name as ToolName)) {
		const promise = getToolResult({ tokenBudget: 1, countTokens: () => 1, endpoint: { modelMaxPromptTokens: 1 } });
		call = () => promise;
	} else {
		call = getToolResult;
	}

	return <ToolResultElement
		call={call}
		enableCacheBreakpoints={props.enableCacheBreakpoints}
		truncateAt={props.truncateAt}
		toolCall={props.toolCall}
		isLast={props.isLast}
		sessionId={props.sessionId}
		stripImages={props.stripImages}
		sharedImageBudget={props.sharedImageBudget}
	/>;
}

const toolsCalledInParallel = new Set<ToolName>([
	ToolName.CoreRunSubagent,
	ToolName.ReadFile,
	ToolName.FindFiles,
	ToolName.FindTextInFiles,
	ToolName.ListDirectory,
	ToolName.Codebase,
	ToolName.GetErrors,
	ToolName.GetScmChanges,
	ToolName.GetNotebookSummary,
	ToolName.ReadCellOutput,
	ToolName.InstallExtension,
	ToolName.FetchWebPage,
]);

async function sendToolCallTelemetry(props: ToolResultOpts, promptContext: IBuildPromptContext, invokeOutcome: ToolInvocationOutcome, validateOutcome: ToolValidationOutcome, endpointProvider: IEndpointProvider, telemetryService: ITelemetryService) {
	const model = promptContext.request?.model && (await endpointProvider.getChatEndpoint(promptContext.request?.model)).model;
	const toolName = props.toolCall.name;

	/* __GDPR__
		"toolInvoke" : {
			"owner": "donjayamanne",
			"comment": "Details about invocation of tools",
			"validateOutcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the tool input validation. valid, invalid and unknown" },
			"invokeOutcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the tool Invokcation. invalidInput, disabledByUser, success, error, cancelled" },
			"toolName": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The name of the tool being invoked." },
			"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that invoked the tool" }
		}
	*/
	telemetryService.sendMSFTTelemetryEvent('toolInvoke',
		{
			validateOutcome,
			invokeOutcome,
			toolName,
			model
		}
	);

	if (toolName === ToolName.EditNotebook) {
		sendNotebookEditToolValidationTelemetry(invokeOutcome, validateOutcome, props.toolCall.arguments, telemetryService, model);
	}
}

interface IToolResultElementActualProps {
	call(sizing: PromptSizing): Promise<{
		toolResult: LanguageModelToolResult2;
		isCancelled: boolean;
		extraMetadata: PromptMetadata[];
	}>;
	enableCacheBreakpoints: boolean;
	truncateAt: number | undefined;
	toolCall: IToolCall;
	sessionId: string | undefined;
	isLast: boolean;
	stripImages?: boolean;
	sharedImageBudget?: SharedImageBudget;
}

function buildImageUri(sessionId: string | undefined, toolCallId: string | undefined, imageIndex: number | undefined, mimeType: string): string | undefined {
	if (!sessionId || !toolCallId || imageIndex === undefined) {
		return undefined;
	}
	const coreToolCallId = toolCallId.split('__vscode')[0];
	return buildToolImageResourceUri(sessionId, coreToolCallId, imageIndex, getExtensionForMimeType(mimeType) ?? '.bin');
}

/**
 * Replaces image data parts with text placeholders in tool results.
 * Used for historical turns to prevent large base64 image data from
 * accumulating and causing 413 (request too large) errors from the API.
 */
function replaceImagesWithPlaceholders(
	content: LanguageModelToolResult2['content'],
	toolCallId: string | undefined,
	sessionId: string | undefined,
): LanguageModelToolResult2['content'] {
	if (!content.some(part => isImageDataPart(part))) {
		return content;
	}
	return content.map((part, index) => {
		if (!isImageDataPart(part)) {
			return part;
		}
		const uri = buildImageUri(sessionId, toolCallId, index, part.mimeType);
		const uriRef = uri ? ` Image URI: ${uri}` : '';
		return new LanguageModelTextPart(`[Image was previously shown to you.${uriRef}]`);
	});
}

/**
 * One tool call result, which either comes from the cache or from invoking the tool.
 */
class ToolResultElement extends PromptElement<IToolResultElementActualProps & BasePromptElementProps, void> {
	async render(state: void, sizing: PromptSizing) {
		const { extraMetadata, toolResult, isCancelled } = await this.props.call(sizing);

		// For historical turns, replace image data with text placeholders
		// to avoid accumulating large base64 payloads across conversation turns (413 errors)
		const content = this.props.stripImages
			? replaceImagesWithPlaceholders(toolResult.content, this.props.toolCall.id, this.props.sessionId)
			: toolResult.content;

		const toolResultElement = this.props.enableCacheBreakpoints ?
			<>
				<Chunk>
					<ToolResult content={content} truncate={this.props.truncateAt} toolCallId={this.props.toolCall.id} sessionId={this.props.sessionId} toolName={this.props.toolCall.name} sharedImageBudget={this.props.sharedImageBudget} />
				</Chunk>
			</> :
			<ToolResult content={content} truncate={this.props.truncateAt} toolCallId={this.props.toolCall.id} sessionId={this.props.sessionId} toolName={this.props.toolCall.name} sharedImageBudget={this.props.sharedImageBudget} />;

		return (
			<ToolMessage toolCallId={this.props.toolCall.id!}>
				<meta value={new ToolResultMetadata(this.props.toolCall.id!, toolResult, isCancelled)} />
				{...extraMetadata.map(m => <meta value={m} />)}
				{toolResultElement}
				{this.props.isLast && this.props.enableCacheBreakpoints && <cacheBreakpoint type={CacheType} />}
			</ToolMessage>
		);
	}
}

export function sendInvokedToolTelemetry(instantiationService: IInstantiationService, endpoint: IChatEndpoint, telemetry: ITelemetryService, toolName: string, toolResult: LanguageModelToolResult2) {
	// Override the token budget to Infinity for telemetry counting to avoid truncation,
	// matching the prior behavior with modelMaxPromptTokens: Infinity
	const endpointWithUnlimitedBudget: IChatEndpoint = {
		...endpoint,
		modelMaxPromptTokens: Infinity,
	};

	PromptRenderer.create(
		instantiationService,
		endpointWithUnlimitedBudget,
		class extends PromptElement {
			render() {
				return <UserMessage><PrimitiveToolResult content={toolResult.content} /></UserMessage>;
			}
		},
		{},
	).render().then(({ tokenCount }) => {
		/* __GDPR__
			"agent.tool.responseLength" : {
				"owner": "connor4312",
				"comment": "Counts the number of tokens generated by tools",
				"toolName": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The name of the tool being invoked." },
				"tokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of tokens used.", "isMeasurement": true }
			}
		*/
		telemetry.sendMSFTTelemetryEvent('agent.tool.responseLength', { toolName }, { tokenCount });
	});
}

enum ToolValidationOutcome {
	Valid = 'valid',
	Invalid = 'invalid',
	Unknown = 'unknown'
}

enum ToolInvocationOutcome {
	InvalidInput = 'invalidInput',
	DisabledByUser = 'disabledByUser',
	Success = 'success',
	Error = 'error',
	Cancelled = 'cancelled',
}

export async function imageDataPartToTSX(part: LanguageModelDataPart, githubToken?: string, urlOrRequestMetadata?: string | RequestMetadata, logService?: ILogService, imageService?: IImageService) {
	if (isImageDataPart(part)) {
		let imageData: Uint8Array = part.data;
		let mimeType = part.mimeType;

		if (imageService) {
			try {
				const resized = await imageService.resizeImage(imageData, mimeType);
				imageData = resized.data;
				mimeType = resized.mimeType;
			} catch (error) {
				logService?.warn(`Image resize failed, using original: ${error}`);
			}
		}

		const base64 = Buffer.from(imageData).toString('base64');
		let imageSource = `data:${mimeType};base64,${base64}`;
		const isChatRequest = typeof urlOrRequestMetadata !== 'string' && (
			urlOrRequestMetadata?.type === RequestType.ChatCompletions ||
			urlOrRequestMetadata?.type === RequestType.ChatResponses ||
			urlOrRequestMetadata?.type === RequestType.ChatMessages);
		if (githubToken && isChatRequest && imageService) {
			try {
				const uri = await imageService.uploadChatImageAttachment(imageData, 'tool-result-image', mimeType ?? 'image/png', githubToken);
				if (uri) {
					imageSource = uri.toString();
				}
			} catch (error) {
				if (logService) {
					logService.warn(`Image upload failed, using base64 fallback: ${error}`);
				}
			}
		}

		return <Image src={imageSource} mimeType={mimeType} />;
	}
}

/**
 * Appends hook context to a tool result after execution.
 * Handles preToolUse additionalContext and executes the postToolUse hook,
 * appending block messages and additionalContext as `<*-context>` tags.
 */
async function appendHookContext(
	toolResult: LanguageModelToolResult2,
	preHookResult: IPreToolUseHookResult | undefined,
	chatHookService: IChatHookService,
	props: ToolResultOpts,
	toolInput: unknown,
	promptContext: IBuildPromptContext,
): Promise<void> {
	// Append additional context from preToolUse hook
	if (preHookResult?.additionalContext) {
		for (const context of preHookResult.additionalContext) {
			toolResult.content.push(new LanguageModelTextPart('\n<PreToolUse-context>\n' + context + '\n</PreToolUse-context>'));
		}
	}

	// Skip postToolUse hook if preToolUse denied the tool — no tool actually ran
	if (preHookResult?.permissionDecision === 'deny') {
		return;
	}

	// Execute postToolUse hook after successful tool execution
	const postHookResult = await chatHookService.executePostToolUseHook(
		props.toolCall.name,
		toolInput,
		toolResultToText(toolResult),
		props.toolCall.id,
		promptContext.request?.hooks,
		promptContext.conversation?.sessionId,
		props.token,
		promptContext.stream
	);
	if (postHookResult?.decision === 'block') {
		const blockReason = postHookResult.reason ?? 'Hook blocked tool result';
		const blockMessage = `The PostToolUse hook blocked this tool result. Reason: ${blockReason}`;
		toolResult.content.push(new LanguageModelTextPart('\n<PostToolUse-context>\n' + blockMessage + '\n</PostToolUse-context>'));
	}
	if (postHookResult?.additionalContext) {
		for (const context of postHookResult.additionalContext) {
			toolResult.content.push(new LanguageModelTextPart('\n<PostToolUse-context>\n' + context + '\n</PostToolUse-context>'));
		}
	}
}

function toolResultToText(result: LanguageModelToolResult2): string {
	return result.content
		.filter((part): part is LanguageModelTextPart | LanguageModelTextPart2 =>
			part instanceof LanguageModelTextPart || part instanceof LanguageModelTextPart2)
		.map(part => part.value)
		.join('\n');
}

function textToolResult(text: string): LanguageModelToolResult {
	return new LanguageModelToolResult([new LanguageModelTextPart(text)]);
}

export function toolCallErrorToResult(err: unknown) {
	if (isCancellationError(err)) {
		return { result: textToolResult('The user cancelled the tool call.'), isCancelled: true };
	} else {
		const errorMessage = err instanceof Error ? err.message : String(err);
		return { result: textToolResult(`ERROR while calling tool: ${errorMessage}${toolErrorSuffix}`) };
	}
}

export class ToolFailureEncountered extends PromptMetadata {
	constructor(
		public toolCallId: string
	) {
		super();
	}
}

export class ToolResultMetadata extends PromptMetadata {
	constructor(
		public readonly toolCallId: string,
		public readonly result: LanguageModelToolResult2,
		public isCancelled?: boolean
	) {
		super();
	}
}

// Some MCP servers return a ton of resources as a 'download' action.
// Only include them all eagerly if we have a manageable number.
const DONT_INCLUDE_RESOURCE_CONTENT_IF_TOOL_HAS_MORE_THAN = 9;

class McpLinkedResourceToolResult extends PromptElement<{ resourceUri: URI; mimeType: string | undefined; count: number } & BasePromptElementProps> {
	public static readonly mimeType = 'application/vnd.code.resource-link';
	private static MAX_PREVIEW_LINES = 500;

	constructor(
		props: { resourceUri: URI; mimeType: string | undefined; count: number } & BasePromptElementProps,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
	) {
		super(props);
	}

	async render() {
		if (await this.ignoreService.isCopilotIgnored(this.props.resourceUri)) {
			return null;
		}

		if (this.props.count > DONT_INCLUDE_RESOURCE_CONTENT_IF_TOOL_HAS_MORE_THAN) {
			return <Tag name='resource' attrs={{ uri: this.props.resourceUri.toString() }} />;
		}

		let contents: Uint8Array;
		try {
			contents = await this.fileSystemService.readFile(this.props.resourceUri);
		} catch (e) {
			const isNotFound = e instanceof Error && ('code' in e && (e.code === 'FileNotFound' || e.code === 'EntryNotFound'));
			const message = isNotFound
				? 'resource not found - the file may have been deleted or become inaccessible'
				: `failed to read resource - ${toErrorMessage(e)}`;
			return <Tag name='resource' attrs={{ uri: this.props.resourceUri.toString() }}>
				{message}
			</Tag>;
		}
		const lines = new TextDecoder().decode(contents).split(/\r?\n/g);
		const maxLines = McpLinkedResourceToolResult.MAX_PREVIEW_LINES;

		return <>
			<Tag name='resource' attrs={{ uri: this.props.resourceUri.toString(), isTruncated: lines.length > maxLines }}>
				{lines.slice(0, maxLines).join('\n')}
			</Tag>
		</>;
	}
}

interface IPrimitiveToolResultProps extends BasePromptElementProps {
	content: LanguageModelToolResult2['content'];
	/**
	 * Shared budget limiting total image data across all tool results in a turn.
	 */
	sharedImageBudget?: SharedImageBudget;
}

class PrimitiveToolResult<T extends IPrimitiveToolResultProps> extends PromptElement<T> {
	protected readonly linkedResources: LanguageModelDataPart[];

	/**
	 * Some models do not yet support CAPI image uploads. For these cases,
	 * track the number of images bytes we're sending and truncate any images
	 * that would exceed that budget.
	 */
	private imageSizeBudgetLeft = CAPI_IMAGE_BUDGET_BYTES;

	constructor(
		props: T,
		@IPromptEndpoint protected readonly endpoint: IPromptEndpoint,
		@IAuthenticationService private readonly authService: IAuthenticationService,
		@ILogService private readonly logService?: ILogService,
		@IImageService private readonly imageService?: IImageService,
		@IConfigurationService private readonly configurationService?: IConfigurationService,
		@IExperimentationService private readonly experimentationService?: IExperimentationService
	) {
		super(props);
		this.linkedResources = this.props.content.filter((c): c is LanguageModelDataPart => c instanceof LanguageModelDataPart && c.mimeType === McpLinkedResourceToolResult.mimeType);
	}

	async render(): Promise<PromptPiece | undefined> {

		return (
			<>
				<IfEmpty alt='(empty)'>
					{await Promise.all(this.props.content.filter(part => this.hasAssistantAudience(part)).map(async part => {
						if (part instanceof LanguageModelTextPart) {
							return await this.onText(part.value);
						} else if (part instanceof LanguageModelPromptTsxPart) {
							return await this.onTSX(part.value as JSONTree.PromptElementJSON);
						} else if (isImageDataPart(part)) {
							return await this.onImage(part, this.props.content.indexOf(part));
						} else if (part instanceof LanguageModelDataPart) {
							return await this.onData(part);
						}
					}))}
					{this.linkedResources.length > 0 && `\n\nHint: you can read the full contents of any ${this.linkedResources.length > DONT_INCLUDE_RESOURCE_CONTENT_IF_TOOL_HAS_MORE_THAN ? '' : 'truncated '}resources by passing their URIs as the absolutePath to the ${ToolName.ReadFile}.\n`}
				</IfEmpty>
			</>
		);
	}

	private hasAssistantAudience(part: LanguageModelTextPart2 | LanguageModelPromptTsxPart | LanguageModelDataPart2 | unknown): boolean {
		if (part instanceof LanguageModelPromptTsxPart) {
			return true;
		}
		if (!(part instanceof LanguageModelDataPart2 || part instanceof LanguageModelTextPart2) || !part.audience) {
			return true;
		}
		return part.audience.includes(LanguageModelPartAudience.Assistant);
	}

	protected async onData(part: LanguageModelDataPart) {
		if (part.mimeType === McpLinkedResourceToolResult.mimeType) {
			return this.onResourceLink(new TextDecoder().decode(part.data));
		} else {
			return '';
		}
	}

	protected async onImage(part: LanguageModelDataPart, _imageIndex?: number) {
		if (!this.endpoint.supportsVision) {
			return '[Image content is not available because vision is not supported by the current model or is disabled by your organization.]';
		}

		const uploadsEnabled = this.configurationService && this.experimentationService
			? this.configurationService.getExperimentBasedConfig(ConfigKey.EnableChatImageUpload, this.experimentationService)
			: false;

		// Anthropic (from CAPI) currently does not support image uploads from tool calls.
		const canUpload = uploadsEnabled && modelCanUseMcpResultImageURL(this.endpoint);

		// Enforce image budgets only when images will be inlined as base64.
		// When uploads are available, the request body stays small (URL reference).
		if (!canUpload) {
			// Enforce shared cross-tool budget (prevents 413s when many tools return images)
			const sharedBudget = this.props.sharedImageBudget;
			if (sharedBudget) {
				if (sharedBudget.remaining < 0) {
					return this.sharedBudgetPlaceholder();
				} else if (part.data.length > sharedBudget.remaining) {
					sharedBudget.remaining = -1;
					return this.sharedBudgetPlaceholder();
				}
				sharedBudget.remaining -= part.data.length;
			}

			// Enforce per-tool budget
			if (this.imageSizeBudgetLeft < 0) {
				return ''; // already exceeded and messages about it
			} else if (part.data.length > this.imageSizeBudgetLeft) {
				this.imageSizeBudgetLeft = -1; // just now exceeding
				return 'Additional images are available, but there is no more space in the context. Try requesting a smaller amount of data, if possible.';
			} else {
				this.imageSizeBudgetLeft -= part.data.length; // bookkeep
			}
		}

		// Only call getGitHubSession when uploads are potentially available
		let uploadToken: string | undefined;
		if (canUpload) {
			uploadToken = (await this.authService.getGitHubSession('any', { silent: true }))?.accessToken;
		}

		return Promise.resolve(imageDataPartToTSX(part, uploadToken, this.endpoint.urlOrRequestMetadata, this.logService, this.imageService));
	}

	protected onTSX(part: JSONTree.PromptElementJSON) {
		return Promise.resolve(<elementJSON data={part} />);
	}

	protected onText(part: string) {
		return Promise.resolve(part);
	}

	protected onResourceLink(data: string) {
		return '';
	}

	protected sharedBudgetPlaceholder(): string {
		return '[Image omitted — context image budget exceeded. Try viewing fewer images at once.]';
	}
}

export interface IToolResultProps extends IPrimitiveToolResultProps {
	/**
	 * Number of tokens at which truncation will be triggered for string content.
	 */
	truncate?: number;
	/**
	 * The tool call associated with this result.
	 */
	toolCallId: string | undefined;
	/**
	 * The session ID associated with this result.
	 */
	sessionId?: string;
	/**
	 * The name of the tool that produced this result.
	 */
	toolName?: string;
}


/**
 * Inlined from prompt-tsx. In prompt-tsx it does `require('vscode)` for the instanceof checks which breaks in vitest
 * and unfortunately I can't figure out how to work around that with the tools we have!
 */
export class ToolResult extends PrimitiveToolResult<IToolResultProps> {
	constructor(
		props: IToolResultProps,
		@IPromptEndpoint endpoint: IPromptEndpoint,
		@IAuthenticationService authService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
		@IImageService imageService: IImageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
		@IChatDiskSessionResources private readonly diskSessionResources: IChatDiskSessionResources,
	) {
		super(props, endpoint, authService, _logService, imageService, _configurationService, _experimentationService);
	}

	protected override async onTSX(part: JSONTree.PromptElementJSON): Promise<any> {
		if (this.props.truncate) {
			return <TokenLimit max={this.props.truncate}>{await super.onTSX(part)}</TokenLimit>;
		}

		return super.onTSX(part);
	}

	protected override async onImage(part: LanguageModelDataPart, imageIndex?: number): Promise<PromptPiece | undefined> {
		const image = await super.onImage(part, imageIndex);
		if (!image || imageIndex === undefined || !this.props.toolCallId || !this.props.sessionId) {
			return image;
		}
		const uri = buildImageUri(this.props.sessionId, this.props.toolCallId, imageIndex, part.mimeType);
		return <>{image}{uri && `\n[Image URI: ${uri}]`}</>;
	}

	protected override sharedBudgetPlaceholder(): string {
		return '[Image omitted — context image budget exceeded. Try viewing fewer images at once or reference this image by URI.]';
	}

	protected override async onText(content: string): Promise<string> {
		const isDiskCachingEnabled = this._configurationService.getExperimentBasedConfig(
			ConfigKey.Advanced.LargeToolResultsToDiskEnabled,
			this._experimentationService
		);
		// Exempt the search and execution subagents and memory tool from disk caching as their results are often ignored if not written directly to the conversation
		if (isDiskCachingEnabled && this.diskSessionResources && this.props.toolCallId && this.props.sessionId && this.props.toolName !== ToolName.SearchSubagent && this.props.toolName !== ToolName.ExploreSubagent && this.props.toolName !== ToolName.ExecutionSubagent && this.props.toolName !== ToolName.Memory) {
			const thresholdBytes = this._configurationService.getExperimentBasedConfig(
				ConfigKey.Advanced.LargeToolResultsToDiskThreshold,
				this._experimentationService
			);

			if (content.length > thresholdBytes) {
				try {
					const sessionId = this.props.sessionId ?? 'unknown';
					const toolCallId = this.props.toolCallId;

					let contentFile = 'content.txt';
					let schema: string | undefined;
					try {
						const parsed = JSON.parse(content);
						schema = JSON.stringify(toJsonSchema(parsed));
						// re-stringify it as it's more friendly to line-based offsets in the read_file tool
						content = JSON.stringify(parsed, null, 2);
						contentFile = 'content.json';
					} catch {
						// ignored
					}

					const fileUri = await this.diskSessionResources.ensure(
						sessionId,
						toolCallId,
						{ [contentFile]: content, 'schema.json': schema },
					);

					const filePath = fileUri.fsPath;
					const contentFileUri = URI.joinPath(fileUri, contentFile);
					const schemaFileUri = schema ? URI.joinPath(fileUri, 'schema.json') : undefined;
					this._logService?.debug(`[ToolResult] Large tool result (${content.length} bytes) written to disk: ${filePath}`);

					return `Large tool result (${Math.round(content.length / 1024)}KB) written to file. Use the ${ToolName.ReadFile} tool to access the content at: ${contentFileUri.fsPath}${schemaFileUri ? `\n\nData schema found at: ${schemaFileUri.fsPath}` : ''}`;
				} catch (err) {
					this._logService?.warn(`[ToolResult] Failed to write large tool result to disk: ${toErrorMessage(err)}`);
					// Fall through to normal truncation
				}
			}
		}

		// Standard truncation logic
		const truncateAtTokens = this.props.truncate;
		if (!truncateAtTokens || content.length < truncateAtTokens) { // always >=1 character per token, early bail-out
			return content;
		}

		const tokens = await this.endpoint.acquireTokenizer().tokenLength(content);
		if (tokens < truncateAtTokens) {
			return content;
		}

		const approxCharsPerToken = content.length / tokens;
		const removedMessage = '\n[Tool response was too long and was truncated.]\n';
		const targetChars = Math.round(approxCharsPerToken * (truncateAtTokens - removedMessage.length));

		const keepInFirstHalf = Math.round(targetChars * 0.4);
		const keepInSecondHalf = targetChars - keepInFirstHalf;

		return content.slice(0, keepInFirstHalf) + removedMessage + content.slice(-keepInSecondHalf);
	}

	protected override onResourceLink(data: string) {
		// https://github.com/microsoft/vscode/blob/34e38b4a78a751d006b99acee1a95d76117fec7b/src/vs/workbench/contrib/mcp/common/mcpTypes.ts#L846
		let parsed: {
			uri: UriComponents;
			underlyingMimeType?: string;
		};

		try {
			parsed = JSON.parse(data);
		} catch {
			return null;
		}

		return <McpLinkedResourceToolResult resourceUri={URI.revive(parsed.uri)} mimeType={parsed.underlyingMimeType} count={this.linkedResources.length} />;
	}
}

export interface IToolCallResultWrapperProps extends BasePromptElementProps {
	toolCallResults: IResultMetadata['toolCallResults'];
}

// Wrapper around ToolResult to allow rendering prompts
export class ToolCallResultWrapper extends PromptElement<IToolCallResultWrapperProps> {
	async render(): Promise<PromptPiece | undefined> {
		return (
			<>
				{Object.entries(this.props.toolCallResults ?? {}).map(([toolCallId, toolCallResult]) => (
					<ToolMessage toolCallId={toolCallId}>
						<ToolResult content={toolCallResult.content} toolCallId={undefined} />
					</ToolMessage>
				))}
			</>
		);
	}
}

function sendNotebookEditToolValidationTelemetry(invokeOutcome: ToolInvocationOutcome, validationResult: ToolValidationOutcome, toolArgs: string, telemetryService: ITelemetryService, model?: string): void {
	let editType: 'insert' | 'delete' | 'edit' | 'unknown' = 'unknown';
	let explanation: 'provided' | 'empty' | 'unknown' = 'unknown';
	let newCodeType: 'string' | 'string[]' | 'object' | 'object[]' | 'unknown' | '' = 'unknown';
	let cellId: 'TOP' | 'BOTTOM' | 'cellid' | 'unknown' | 'empty' = 'unknown';
	let inputParsed = 0;
	const knownProps = ['editType', 'explanation', 'newCode', 'cellId', 'filePath', 'language'];
	let missingProps: string[] = [];
	let unknownProps: string[] = [];
	try {
		const args = JSON.parse(toolArgs);
		if (args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).length > 0) {
			const props = Object.keys(args);
			unknownProps = props.filter(key => !knownProps.includes(key));
			unknownProps.sort();
			missingProps = knownProps.filter(key => !props.includes(key));
			missingProps.sort();
		}
		inputParsed = 1;
		if (args.editType) {
			editType = args.editType;
		}
		if (args.explanation) {
			explanation = 'provided';
		} else {
			explanation = 'empty';
		}
		if (args.newCode || typeof args.newCode === 'string') {
			if (typeof args.newCode === 'string') {
				newCodeType = 'string';
			} else if (Array.isArray(args.newCode) && (args.newCode as any[]).every(item => typeof item === 'string')) {
				newCodeType = 'string[]';
			} else if (Array.isArray(args.newCode)) {
				newCodeType = 'object[]';
			} else if (typeof args.newCode === 'object') {
				newCodeType = 'object';
			}
		}
		if (editType === 'delete') {
			newCodeType = '';
		}
		const cellIdValue = args.cellId;
		if (typeof cellIdValue === 'string') {
			if (cellIdValue === 'TOP' || cellIdValue === 'BOTTOM') {
				cellId = cellIdValue;
			} else {
				cellId = cellIdValue.trim().length === 0 ? 'cellid' : 'empty';
			}
		}
	} catch {
		//
	}

	/* __GDPR__
		"editNotebook.validation" : {
			"owner": "donjayamanne",
			"comment": "Validation failure for a Edit Notebook tool invocation",
			"validationResult": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The result of the tool input validation. valid, invalid and unknown" },
			"invokeOutcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The result of the tool Invocation. invalidInput, disabledByUser, success, error, cancelled" },
			"editType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The type of edit that was attempted. insert, delete, edit or unknown" },
			"unknownProps": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "List of unknown properties in the input" },
			"missingProps": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "List of missing properties in the input" },
			"newCodeType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The type of code, whether its string, string[], object, object[] or unknown" },
			"cellId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the cell, TOP, BOTTOM, cellid, empty or unknown" },
			"explanation": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The explanation for the edit. provided, empty and unknown" },
			"inputParsed": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether the input was parsed as JSON" },
			"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that invoked the tool" }
		}
	*/

	telemetryService.sendMSFTTelemetryEvent('editNotebook.validation',
		{
			validationResult,
			invokeOutcome,
			editType,
			newCodeType,
			cellId,
			explanation,
			model,
			unknownProps: unknownProps.join(','),
			missingProps: missingProps.join(','),
		},
		{
			inputParsed,
		}
	);
}

export function buildToolImageResourceUri(sessionId: string, coreToolCallId: string, imageIndex: number, ext: string): string {
	const sessionResource = `vscode-chat-session://local/${Buffer.from(sessionId).toString('base64url')}`;
	const authority = Buffer.from(sessionResource).toString('hex');
	return `vscode-chat-response-resource://${authority}/tool/${coreToolCallId}/${imageIndex}/file${ext}`;
}
