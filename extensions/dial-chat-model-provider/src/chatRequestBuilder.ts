import { aggregateMessagesForLog } from './messageConversion';
import { stripReasoningEffortWhenUnsupported } from './reasoningEffort';
import { isRecord, type JsonObject, type JsonValue } from './runtimeGuards';
import {
	type DialChatMessage,
	type DialChatRequest,
	type DialDeployment,
	type DialDeploymentFeatures,
	type Nullable,
} from './types';

export type OutputTokenLimitField = 'max_completion_tokens' | 'max_tokens';

/** DIAL Core defaults when a feature flag is absent from listing. */
const DIAL_FEATURE_DEFAULTS = {
	max_tokens_supported: true,
	max_completion_tokens_supported: false,
	custom_temperature_supported: true,
} as const satisfies Record<
	keyof Pick<
		DialDeploymentFeatures,
		'max_tokens_supported' | 'max_completion_tokens_supported' | 'custom_temperature_supported'
	>,
	boolean
>;

function readFeatureFlag(
	features: Nullable<DialDeploymentFeatures>,
	key: keyof typeof DIAL_FEATURE_DEFAULTS,
): boolean {
	const value = features?.[key];
	if (typeof value === 'boolean') {
		return value;
	}
	return DIAL_FEATURE_DEFAULTS[key];
}

/**
 * Which output token limit field to send, from DIAL `features`:
 * - `max_completion_tokens_supported` wins when both are true
 * - else `max_tokens_supported`
 * - else omit both limit parameters
 */
export function selectOutputTokenLimitField(
	deployment?: DialDeployment,
): Nullable<OutputTokenLimitField> {
	const features = deployment?.features;

	if (readFeatureFlag(features, 'max_completion_tokens_supported')) {
		return 'max_completion_tokens';
	}
	if (readFeatureFlag(features, 'max_tokens_supported')) {
		return 'max_tokens';
	}
	return undefined;
}

/** Whether to include `temperature` in the request (from `custom_temperature_supported`). */
function supportsCustomTemperature(deployment?: Pick<DialDeployment, 'features'>): boolean {
	return readFeatureFlag(deployment?.features, 'custom_temperature_supported');
}

function readDefaultNumber(defaults: Nullable<JsonObject>, key: string): Nullable<number> {
	const value = defaults?.[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function defaultMaxOutput(deployment?: DialDeployment): number {
	const limits = deployment?.limits;
	if (limits?.maxCompletionTokens) {
		return limits.maxCompletionTokens;
	}
	const defaults = deployment?.defaults;
	const fromCompletion = readDefaultNumber(defaults, 'max_completion_tokens');
	if (fromCompletion !== undefined) {
		return fromCompletion;
	}
	const fromMax = readDefaultNumber(defaults, 'max_tokens');
	if (fromMax !== undefined) {
		return fromMax;
	}
	if (deployment?.maxOutputTokens) {
		return deployment.maxOutputTokens;
	}
	return 8192;
}

/** Apply the correct output token limit field for the deployment. */
function applyOutputTokenLimit(
	request: DialChatRequest,
	deployment: Nullable<DialDeployment>,
	maxOutput?: number,
): DialChatRequest {
	const { max_tokens: _omitMax, max_completion_tokens: _omitCompletion, ...rest } = request;
	const field = selectOutputTokenLimitField(deployment);
	if (field === undefined) {
		return { ...rest };
	}
	const limit = maxOutput ?? defaultMaxOutput(deployment);
	if (field === 'max_completion_tokens') {
		return { ...rest, max_completion_tokens: limit };
	}
	return { ...rest, max_tokens: limit };
}

/** Apply temperature only when the deployment supports it; honor DIAL defaults when set. */
function applyTemperature(
	request: DialChatRequest,
	deployment: Nullable<DialDeployment>,
): DialChatRequest {
	if (!supportsCustomTemperature(deployment)) {
		const { temperature: _omit, ...rest } = request;
		return { ...rest };
	}

	const defaultTemp = readDefaultNumber(deployment?.defaults, 'temperature');
	if (defaultTemp !== undefined) {
		return { ...request, temperature: defaultTemp };
	}
	if (request.temperature === undefined) {
		return { ...request, temperature: 0.7 };
	}
	return request;
}

/** Strip tools when the deployment explicitly disables tool calling. */
function stripToolsWhenUnsupported(
	request: DialChatRequest,
	deployment: Nullable<DialDeployment>,
): DialChatRequest {
	if (deployment?.features?.tools_supported !== false) {
		return request;
	}
	if (request.tools === undefined && request.tool_choice === undefined) {
		return request;
	}
	const { tools: _tools, tool_choice: _choice, ...rest } = request;
	return rest;
}

/**
 * Apply deployment-aware constraints from DIAL metadata
 * (features, defaults, limits) before sending a chat completion request.
 */
export function applyDeploymentConstraints(
	request: DialChatRequest,
	deployment: Nullable<DialDeployment>,
): DialChatRequest {
	let next = applyTemperature(applyOutputTokenLimit(request, deployment), deployment);
	next = stripToolsWhenUnsupported(next, deployment);
	next = stripReasoningEffortWhenUnsupported(next, deployment);
	if (next.stream) {
		next = { ...next, stream_options: { include_usage: true } };
	}
	return next;
}

/** Serialize for the OpenAI-compatible API (only one of the limit fields). */
export function toApiRequestBody(request: DialChatRequest): JsonObject {
	const { max_tokens, max_completion_tokens, ...rest } = request;
	// DialChatRequest is a tagged union with `readonly` arrays; widen via `unknown` because
	// the union does not carry a JsonObject index signature even though every leaf is JSON.
	const body: Record<string, JsonValue> = { ...(rest as unknown as Record<string, JsonValue>) };
	if (max_completion_tokens !== undefined) {
		body.max_completion_tokens = max_completion_tokens;
	} else if (max_tokens !== undefined) {
		body.max_tokens = max_tokens;
	}
	return body;
}

/**
 * Upstream says `max_tokens` is the wrong field (typical for o-series / GPT-5
 * proxies that expect `max_completion_tokens`).
 *
 * Both regexes are anchored to a `max_tokens` token that is NOT preceded by
 * `completion_` — otherwise an error mentioning the other field would match
 * here and we would swap in the wrong direction.
 */
export function isUnsupportedMaxTokensError(message: string): boolean {
	return (
		/(?<!completion_)max_tokens.*not supported/i.test(message) ||
		/unsupported_parameter.*(?<!completion_)max_tokens/i.test(message)
	);
}

/** Upstream says `max_completion_tokens` is the wrong field (classic chat models). */
export function isUnsupportedMaxCompletionTokensError(message: string): boolean {
	return (
		/max_completion_tokens.*not supported/i.test(message) ||
		/unsupported_parameter.*max_completion_tokens/i.test(message)
	);
}

export function isUnsupportedTemperatureError(message: string): boolean {
	return /temperature.*not support/i.test(message) || /unsupported.*temperature/i.test(message);
}

/**
 * Upstream rejected the request because prompt + requested output exceed the
 * model's context window (e.g. vLLM: "This model's maximum context length is N
 * tokens. However, you requested … output tokens and your prompt contains …").
 */
export function isContextLengthExceededError(message: string): boolean {
	return (
		/maximum context length/i.test(message) ||
		/context[_ ]length[_ ]exceeded/i.test(message) ||
		/reduce the (length of the (input )?prompt|number of requested output tokens)/i.test(
			message,
		)
	);
}

export interface ContextLengthInfo {
	/** Model context window (`maximum context length is N`). */
	readonly maxContext?: number;
	/** Reported prompt size (`prompt contains at least N input tokens`). */
	readonly inputTokens?: number;
	/** Output reservation that triggered the overflow (`requested N output tokens`). */
	readonly requestedOutput?: number;
}

function matchInt(message: string, re: RegExp): number | undefined {
	const captured = re.exec(message)?.[1];
	if (captured === undefined) {
		return undefined;
	}
	const n = Number.parseInt(captured, 10);
	return Number.isFinite(n) ? n : undefined;
}

/** Extract the numeric limits from a context-length-exceeded error message. */
export function parseContextLengthError(message: string): ContextLengthInfo {
	const maxContext = matchInt(message, /maximum context length is (\d+)/i);
	const requestedOutput = matchInt(message, /requested (\d+) output tokens/i);
	const inputTokens =
		matchInt(message, /prompt contains at least (\d+) input tokens/i) ??
		matchInt(message, /(\d+) input tokens/i);
	return {
		...(maxContext !== undefined ? { maxContext } : {}),
		...(inputTokens !== undefined ? { inputTokens } : {}),
		...(requestedOutput !== undefined ? { requestedOutput } : {}),
	};
}

/** Smallest output reservation worth keeping after a context clamp; below this, only compaction helps. */
export const MIN_CONTEXT_OUTPUT_TOKENS = 256;

/**
 * Slack reserved below `maxContext` when shrinking the output limit. Upstream reports
 * prompt size as "at least N", and the true templated count can be higher on retry.
 */
export function contextClampSlack(maxContext: number): number {
	return Math.min(2048, Math.max(256, Math.ceil(maxContext * 0.005)));
}

/**
 * Compute a smaller output limit that should fit `inputTokens` inside `maxContext`.
 * Returns `undefined` when the prompt alone leaves no usable output budget.
 */
export function computeClampedOutputTokens(
	info: ContextLengthInfo,
	currentOutput: number,
): number | undefined {
	const { maxContext, inputTokens } = info;
	if (maxContext === undefined || inputTokens === undefined) {
		return undefined;
	}
	const available = maxContext - inputTokens - contextClampSlack(maxContext);
	if (available < MIN_CONTEXT_OUTPUT_TOKENS) {
		return undefined;
	}
	return Math.min(currentOutput, available);
}

/**
 * Overwrite whichever output-limit field the request currently carries with a
 * smaller value (used to make an over-budget prompt fit by shrinking the output
 * reservation). No-op when neither field is present — then output is not the lever.
 */
export function clampOutputTokenLimit(request: DialChatRequest, limit: number): DialChatRequest {
	if (request.max_completion_tokens !== undefined) {
		return { ...request, max_completion_tokens: limit };
	}
	if (request.max_tokens !== undefined) {
		return { ...request, max_tokens: limit };
	}
	return request;
}

/** Human-readable summary for logs (no message bodies). */
export function summarizeChatRequest(
	request: DialChatRequest,
	deployment?: DialDeployment,
): Record<string, unknown> {
	return {
		deploymentId: deployment?.id,
		model: deployment?.model,
		messageCount: request.messages.length,
		messageStats: aggregateMessagesForLog(request.messages),
		toolCount: request.tools?.length ?? 0,
		toolChoice: request.tool_choice,
		stream: request.stream,
		stream_options: request.stream_options,
		maxInputTokens: deployment?.maxInputTokens,
		maxOutputTokens: deployment?.maxOutputTokens,
		temperature: request.temperature ?? '(omitted)',
		reasoning_effort: request.reasoning_effort ?? '(omitted)',
		max_tokens: request.max_tokens,
		max_completion_tokens: request.max_completion_tokens,
		features: deployment?.features
			? {
					max_tokens_supported: deployment.features.max_tokens_supported,
					max_completion_tokens_supported:
						deployment.features.max_completion_tokens_supported,
					custom_temperature_supported: deployment.features.custom_temperature_supported,
					reasoning_efforts: deployment.features.reasoning_efforts,
					tools_supported: deployment.features.tools_supported,
					system_prompt_supported: deployment.features.system_prompt_supported,
				}
			: undefined,
		selectedLimitField: selectOutputTokenLimitField(deployment),
	};
}

/** Compact request snapshot for retry/error logs (no deployment metadata). */
export function summarizeChatRequestRetry(request: DialChatRequest): Record<string, unknown> {
	return {
		messageCount: request.messages.length,
		messageStats: aggregateMessagesForLog(request.messages),
		temperature: request.temperature ?? '(omitted)',
		max_tokens: request.max_tokens,
		max_completion_tokens: request.max_completion_tokens,
	};
}

/** Redact message bodies from API payload before logging. */
export function sanitizeApiBodyForLog(body: JsonObject): Record<string, unknown> {
	const messages = body.messages;
	if (!Array.isArray(messages)) {
		return { ...body };
	}
	const typed = messages.filter(isDialChatMessageLike);
	const { messages: _messages, ...rest } = body;
	return { ...rest, messageStats: aggregateMessagesForLog(typed) };
}

const KNOWN_CHAT_ROLES: ReadonlySet<string> = new Set<DialChatMessage['role']>([
	'system',
	'user',
	'assistant',
	'tool',
]);

function isDialChatMessageLike(value: JsonValue): value is DialChatMessage & JsonObject {
	return isRecord(value) && typeof value.role === 'string' && KNOWN_CHAT_ROLES.has(value.role);
}

export function forceMaxCompletionTokens(request: DialChatRequest): DialChatRequest {
	const limit = request.max_tokens ?? request.max_completion_tokens;
	const { max_tokens: _omit, ...rest } = request;
	if (limit !== undefined) {
		return { ...rest, max_completion_tokens: limit };
	}
	return { ...rest };
}

export function forceMaxTokens(request: DialChatRequest): DialChatRequest {
	const limit = request.max_completion_tokens ?? request.max_tokens;
	const { max_completion_tokens: _omit, ...rest } = request;
	if (limit !== undefined) {
		return { ...rest, max_tokens: limit };
	}
	return { ...rest };
}

/** Drop both output-token limit fields — let upstream apply its internal default. */
export function dropOutputTokenLimit(request: DialChatRequest): DialChatRequest {
	const { max_tokens: _t, max_completion_tokens: _c, ...rest } = request;
	return { ...rest };
}

/** Drop `temperature` — used after upstream rejects it as unsupported. */
export function dropTemperature(request: DialChatRequest): DialChatRequest {
	const { temperature: _t, ...rest } = request;
	return { ...rest };
}
