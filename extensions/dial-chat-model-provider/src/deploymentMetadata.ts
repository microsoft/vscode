import {
	asRecord,
	isRecord,
	readBoolean,
	readNonEmptyString,
	readNumber,
	readObject,
	readStringArray,
	type JsonObject,
	type JsonValue,
} from './runtimeGuards';
import {
	type DialDeployment,
	type DialDeploymentFeatures,
	type DialDeploymentKind,
	type DialDeploymentLimits,
	type Nullable,
} from './types';

const FEATURE_KEYS = [
	'rate_endpoint',
	'tokenize_endpoint',
	'truncate_prompt_endpoint',
	'configuration_endpoint',
	'system_prompt_supported',
	'tools_supported',
	'seed_supported',
	'url_attachments_supported',
	'folder_attachments_supported',
	'allow_resume',
	'accessible_by_per_request_key',
	'content_parts_supported',
	'temperature_supported',
	'cache_supported',
	'auto_caching_supported',
	'consent_required',
	'parallel_tool_calls_supported',
	'assistant_attachments_in_request_supported',
	'support_comment_in_rate_response',
	'max_tokens_supported',
	'max_completion_tokens_supported',
	'custom_temperature_supported',
] as const satisfies readonly (keyof DialDeploymentFeatures)[];

function normalizeReasoningEfforts(raw: JsonObject): readonly string[] | undefined {
	const levels = readStringArray(raw, 'reasoning_efforts')
		.map((item) => item.trim().toLowerCase())
		.filter((item) => item.length > 0);
	return levels.length > 0 ? [...new Set(levels)] : undefined;
}

function normalizeFeatures(raw: Nullable<JsonValue>): Nullable<DialDeploymentFeatures> {
	if (!isRecord(raw)) {
		return undefined;
	}

	const out: Record<string, string | boolean | readonly string[]> = {};
	for (const key of FEATURE_KEYS) {
		const value = raw[key];
		if (typeof value === 'string' || typeof value === 'boolean') {
			out[key] = value;
		}
	}
	const reasoningEfforts = normalizeReasoningEfforts(raw);
	if (reasoningEfforts !== undefined) {
		out.reasoning_efforts = reasoningEfforts;
	}
	return out as DialDeploymentFeatures;
}

/**
 * Read a numeric limit tolerating both casings: DIAL Core config uses camelCase
 * (`maxTotalTokens`), while the `/openai/deployments` listing serializes the same
 * fields in snake_case (`max_total_tokens`), mirroring `input_attachment_types`.
 */
function readLimitNumber(raw: JsonObject, snakeKey: string, camelKey: string): Nullable<number> {
	return readNumber(raw, snakeKey) ?? readNumber(raw, camelKey);
}

function normalizeLimits(raw: Nullable<JsonValue>): Nullable<DialDeploymentLimits> {
	if (!isRecord(raw)) {
		return undefined;
	}
	const maxPromptTokens = readLimitNumber(raw, 'max_prompt_tokens', 'maxPromptTokens');
	const maxCompletionTokens = readLimitNumber(
		raw,
		'max_completion_tokens',
		'maxCompletionTokens',
	);
	const maxTotalTokens = readLimitNumber(raw, 'max_total_tokens', 'maxTotalTokens');
	if (
		maxPromptTokens === undefined &&
		maxCompletionTokens === undefined &&
		maxTotalTokens === undefined
	) {
		return undefined;
	}
	return {
		...(maxPromptTokens !== undefined ? { maxPromptTokens } : {}),
		...(maxCompletionTokens !== undefined ? { maxCompletionTokens } : {}),
		...(maxTotalTokens !== undefined ? { maxTotalTokens } : {}),
	};
}

function normalizeDefaults(raw: Nullable<JsonValue>): Nullable<JsonObject> {
	return isRecord(raw) ? { ...raw } : undefined;
}

function normalizeInputAttachmentTypes(raw: JsonObject): readonly string[] | undefined {
	const types = readStringArray(raw, 'input_attachment_types');
	return types.length > 0 ? types : undefined;
}

function normalizeTopics(raw: JsonObject): readonly string[] | undefined {
	const fromKeywords = [
		...readStringArray(raw, 'description_keywords'),
		...readStringArray(raw, 'descriptionKeywords'),
	];
	const fromTopics = [...readStringArray(raw, 'topics'), ...readStringArray(raw, 'Topics')];
	const merged = [...fromKeywords, ...fromTopics]
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
	if (merged.length === 0) {
		return undefined;
	}
	return [...new Set(merged)];
}

function readCapabilityFlag(raw: JsonObject, snakeKey: string, camelKey: string): boolean {
	const caps = readObject(raw, 'capabilities');
	if (!caps) {
		return false;
	}
	return readBoolean(caps, snakeKey) === true || readBoolean(caps, camelKey) === true;
}

/** Infer chat vs embedding from `/openai/models` listing fields. */
export function inferDeploymentKind(rawInput: JsonValue): Nullable<DialDeploymentKind> {
	const raw = isRecord(rawInput) ? rawInput : undefined;
	if (!raw) {
		return undefined;
	}
	if (readCapabilityFlag(raw, 'chat_completion', 'chatCompletion')) {
		return 'chat';
	}
	if (readCapabilityFlag(raw, 'completion', 'completion')) {
		return 'chat';
	}
	if (readCapabilityFlag(raw, 'embeddings', 'embeddings')) {
		return 'embedding';
	}
	const type = readNonEmptyString(raw, 'type')?.toLowerCase();
	if (type === 'chat' || type === 'completion') {
		return 'chat';
	}
	if (type === 'embedding') {
		return 'embedding';
	}
	return undefined;
}

/**
 * Safety margin reserved out of a *derived* input budget. The IDE sums
 * per-message `provideTokenCount` results (plain text), but the model counts the
 * fully templated prompt — role markers / special tokens add a few tokens per
 * message that the per-message sum never sees. Reserving a small slice of the
 * window keeps the IDE compacting *before* the prompt + output reservation hits
 * the true ceiling. Proportional to the window, clamped to a sane band.
 */
const INPUT_SAFETY_MARGIN_RATIO = 0.01;
const INPUT_SAFETY_MARGIN_MIN = 64;
const INPUT_SAFETY_MARGIN_MAX = 2048;

function inputSafetyMargin(window: number): number {
	const raw = Math.ceil(window * INPUT_SAFETY_MARGIN_RATIO);
	return Math.min(Math.max(raw, INPUT_SAFETY_MARGIN_MIN), INPUT_SAFETY_MARGIN_MAX);
}

/**
 * Input-token budget for the IDE (`LanguageModelChatInformation.maxInputTokens`).
 * Prefer an explicit prompt limit (authoritative — used as-is); otherwise reserve
 * the output budget *and* a safety margin out of the total context window so the
 * IDE compacts before DIAL rejects an over-budget prompt.
 */
function deriveMaxInputTokens(
	limits: Nullable<DialDeploymentLimits>,
	maxOutput: Nullable<number>,
): Nullable<number> {
	if (limits?.maxPromptTokens !== undefined) {
		return limits.maxPromptTokens;
	}
	const total = limits?.maxTotalTokens;
	if (total === undefined) {
		return undefined;
	}
	const reservedOutput = maxOutput !== undefined && maxOutput < total ? maxOutput : 0;
	const budget = total - reservedOutput - inputSafetyMargin(total);
	return Math.max(1, budget);
}

/** Raw model object from DIAL `/openai/models` or legacy `/openai/deployments` listing. */
export function normalizeDeployment(
	rawInput: JsonValue,
	kind?: DialDeploymentKind,
): DialDeployment {
	const raw = asRecord(rawInput);
	const features = normalizeFeatures(readObject(raw, 'features'));
	const limits = normalizeLimits(readObject(raw, 'limits'));
	const defaults = normalizeDefaults(readObject(raw, 'defaults'));
	const resolvedKind = kind ?? inferDeploymentKind(raw);

	const id = readNonEmptyString(raw, 'id') ?? readNonEmptyString(raw, 'name') ?? 'unknown';
	const name =
		readNonEmptyString(raw, 'display_name') ??
		readNonEmptyString(raw, 'name') ??
		readNonEmptyString(raw, 'id') ??
		'unknown';

	const maxOutput =
		limits?.maxCompletionTokens ??
		(defaults && typeof defaults.max_completion_tokens === 'number'
			? defaults.max_completion_tokens
			: undefined) ??
		(defaults && typeof defaults.max_tokens === 'number' ? defaults.max_tokens : undefined);
	const maxInput = deriveMaxInputTokens(limits, maxOutput);

	const description = readNonEmptyString(raw, 'description');
	const model = readNonEmptyString(raw, 'model');
	const inputAttachmentTypes = normalizeInputAttachmentTypes(raw);
	const maxInputAttachments = readNumber(raw, 'max_input_attachments');
	const topics = normalizeTopics(raw);

	return {
		id,
		...(resolvedKind !== undefined ? { kind: resolvedKind } : {}),
		name,
		...(description !== undefined ? { description } : {}),
		...(model !== undefined ? { model } : {}),
		...(maxInput !== undefined ? { maxInputTokens: maxInput } : {}),
		...(maxOutput !== undefined ? { maxOutputTokens: maxOutput } : {}),
		...(inputAttachmentTypes !== undefined ? { inputAttachmentTypes } : {}),
		...(maxInputAttachments !== undefined ? { maxInputAttachments } : {}),
		...(topics !== undefined ? { topics } : {}),
		...(features !== undefined ? { features } : {}),
		...(defaults !== undefined ? { defaults } : {}),
		...(limits !== undefined ? { limits } : {}),
	};
}

// Re-export to keep callers single-source.
export { readBoolean };
