/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Contract for the inline model feedback survey.
 *
 * A survey is fully described by a versioned JSON payload delivered as an experiment treatment,
 * so one can be authored or retired without shipping code. The shapes stay close to the editor
 * pane survey in `contrib/surveys/browser/surveyQuestions.ts` so the two can converge later,
 * but cannot share code today because that renderer needs telemetry keys known at compile time.
 */

/** Payload versions this build understands. Bump when making a breaking shape change. */
export const CHAT_MODEL_FEEDBACK_SURVEY_CONFIG_VERSION = 1;

/** Sentinel matching sessions that are not backed by an agent host. */
export const CHAT_MODEL_FEEDBACK_SURVEY_NO_HARNESS = 'none';

const MAX_STEPS = 8;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;
const MAX_ID_LENGTH = 64;
const MAX_TITLE_LENGTH = 200;
const MAX_LABEL_LENGTH = 120;
const MAX_PLACEHOLDER_LENGTH = 100;
const MAX_COMMENT_LENGTH = 1000;
const MAX_SELECTORS = 32;

const MATCH_FIELDS = ['selectedModels', 'resolvedModels', 'modes', 'harnesses', 'sessionTypes'] as const;

/** Ids appear in telemetry, so they are restricted to a shape that needs no sanitization. */
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export const enum ChatModelFeedbackSurveyStepKind {
	Choice = 'choice',
	Text = 'text',
}

export interface IChatModelFeedbackSurveyOption {
	readonly id: string;
	readonly label: string;
}

interface IChatModelFeedbackSurveyStepBase {
	readonly id: string;
	readonly title: string;
}

export interface IChatModelFeedbackSurveyChoiceStep extends IChatModelFeedbackSurveyStepBase {
	readonly kind: ChatModelFeedbackSurveyStepKind.Choice;
	readonly options: readonly IChatModelFeedbackSurveyOption[];
}

export interface IChatModelFeedbackSurveyTextStep extends IChatModelFeedbackSurveyStepBase {
	readonly kind: ChatModelFeedbackSurveyStepKind.Text;
	readonly placeholder?: string;
	readonly maxLength: number;
}

export type ChatModelFeedbackSurveyStep = IChatModelFeedbackSurveyChoiceStep | IChatModelFeedbackSurveyTextStep;

/**
 * Which responses a survey attaches to. An omitted or empty selector list means any.
 *
 * Selected and resolved models are matched separately on purpose. A survey about Auto routing
 * targets the selected model `auto`, and must not fire just because another request happened to
 * be routed to the same model.
 */
export interface IChatModelFeedbackSurveyMatch {
	readonly selectedModels: readonly string[];
	readonly resolvedModels: readonly string[];
	readonly modes: readonly string[];
	/** Agent host provider ids (e.g. `copilotcli`), or {@link CHAT_MODEL_FEEDBACK_SURVEY_NO_HARNESS}. */
	readonly harnesses: readonly string[];
	readonly sessionTypes: readonly string[];
}

/**
 * Rules governing when the survey opens *by itself*.
 *
 * None of this applies to manual activation: clicking the feedback control is an explicit
 * request for the survey and always opens it. These rules exist only to keep unprompted
 * surfacing rare enough not to be a nuisance.
 */
export interface IChatModelFeedbackSurveyPrompt {
	/** Minimum days between two automatic prompts. `0` disables the cooldown. */
	readonly cooldownDays: number;
	/** How many times the survey may open itself within one chat session. */
	readonly maxPerSession: number;
	readonly chance: IChatModelFeedbackSurveyChance;
	readonly triggers: IChatModelFeedbackSurveyTriggers;
}

/**
 * A probability that ramps with usage. Every eligible response that does not prompt raises the
 * odds up to {@link IChatModelFeedbackSurveyChance.max}, so heavier users are asked sooner. The
 * odds reset once a prompt is shown.
 */
export interface IChatModelFeedbackSurveyChance {
	/** Probability applied to the first eligible response. `0` disables random prompting. */
	readonly initial: number;
	/** Added to the probability for each eligible response that did not prompt. */
	readonly increment: number;
	/** Ceiling the ramped probability cannot exceed. */
	readonly max: number;
}

/** Moments that prompt directly, without a probability roll. */
export interface IChatModelFeedbackSurveyTriggers {
	/** Fires when the user switches the picker off a model this survey matches. */
	readonly modelSwitchedAway: IChatModelFeedbackSurveyTrigger;
}

export interface IChatModelFeedbackSurveyTrigger {
	readonly enabled: boolean;
	/** Whether the trigger prompts even inside the cooldown window. */
	readonly bypassCooldown: boolean;
}

export interface IChatModelFeedbackSurveyConfig {
	readonly version: number;
	readonly id: string;
	readonly match: IChatModelFeedbackSurveyMatch;
	readonly prompt: IChatModelFeedbackSurveyPrompt;
	readonly steps: readonly ChatModelFeedbackSurveyStep[];
}

export type ChatModelFeedbackSurveyParseResult =
	| { readonly config: IChatModelFeedbackSurveyConfig; readonly error?: undefined }
	| { readonly config?: undefined; readonly error: string };

/** Describes the response a survey is matched against. The caller resolves any model aliases. */
export interface IChatModelFeedbackSurveyMatchContext {
	/** The model identifier the user selected, as recorded on the request. */
	readonly selectedModelId?: string;
	/** Other identifiers for the selected model, such as its id, family, name and vendor. */
	readonly selectedModelAliases?: readonly string[];
	/** The model a routing layer (e.g. Auto) actually resolved to, when different. */
	readonly resolvedModelId?: string;
	readonly modeId?: string;
	/** Agent host provider id, or `undefined` for sessions with no agent host. */
	readonly harness?: string;
	readonly sessionType?: string;
}

/**
 * Parses and validates a survey payload. Never throws, and rejects a bad config whole rather
 * than in part, since dropping one malformed step would quietly change what the experiment
 * measures.
 */
export function parseChatModelFeedbackSurveyConfig(raw: string | undefined): ChatModelFeedbackSurveyParseResult {
	if (typeof raw !== 'string' || !raw.trim()) {
		return { error: 'empty payload' };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		return { error: `payload is not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
	}

	if (!isObject(parsed)) {
		return { error: 'payload is not an object' };
	}

	if (parsed.version !== CHAT_MODEL_FEEDBACK_SURVEY_CONFIG_VERSION) {
		return { error: `unsupported version ${JSON.stringify(parsed.version)}, expected ${CHAT_MODEL_FEEDBACK_SURVEY_CONFIG_VERSION}` };
	}

	const id = readId(parsed.id);
	if (!id) {
		return { error: 'missing or malformed survey id' };
	}

	const match = readMatch(parsed.match);
	if (typeof match === 'string') {
		return { error: match };
	}

	const prompt = readPrompt(parsed.prompt);
	if (typeof prompt === 'string') {
		return { error: prompt };
	}

	const steps = readSteps(parsed.steps);
	if (typeof steps === 'string') {
		return { error: steps };
	}

	return { config: { version: CHAT_MODEL_FEEDBACK_SURVEY_CONFIG_VERSION, id, match, prompt, steps } };
}

function readMatch(raw: unknown): IChatModelFeedbackSurveyMatch | string {
	if (raw !== undefined && !isObject(raw)) {
		return 'match must be an object';
	}
	const source = isObject(raw) ? raw : {};

	const match: Record<string, string[]> = {};
	for (const field of MATCH_FIELDS) {
		const selectors = readSelectorList(source[field], `match.${field}`);
		if (typeof selectors === 'string') {
			return selectors;
		}
		match[field] = selectors;
	}

	if (MATCH_FIELDS.every(field => match[field].length === 0)) {
		return 'match must narrow at least one dimension';
	}

	return {
		selectedModels: match.selectedModels,
		resolvedModels: match.resolvedModels,
		modes: match.modes,
		harnesses: match.harnesses,
		sessionTypes: match.sessionTypes,
	};
}

function readSelectorList(raw: unknown, path: string): string[] | string {
	if (raw === undefined) {
		return [];
	}
	if (!Array.isArray(raw)) {
		return `${path} must be an array of strings`;
	}
	if (raw.length > MAX_SELECTORS) {
		return `${path} exceeds ${MAX_SELECTORS} entries`;
	}
	const out: string[] = [];
	for (const entry of raw) {
		if (typeof entry !== 'string') {
			return `${path} must contain only strings`;
		}
		const normalized = normalizeSelector(entry);
		if (!normalized) {
			return `${path} must not contain empty strings`;
		}
		out.push(normalized);
	}
	return out;
}

/**
 * Reads the automatic prompting rules. An omitted `prompt` block gives a manual only survey, so
 * an experiment that forgets to describe its pacing under prompts rather than nags.
 */
function readPrompt(raw: unknown): IChatModelFeedbackSurveyPrompt | string {
	if (raw !== undefined && !isObject(raw)) {
		return 'prompt must be an object';
	}
	const source = isObject(raw) ? raw : {};

	const cooldownDays = readNonNegativeNumber(source.cooldownDays, 7);
	if (cooldownDays === undefined) {
		return 'prompt.cooldownDays must be a non-negative number';
	}

	const maxPerSession = readPositiveInteger(source.maxPerSession, 1);
	if (maxPerSession === undefined) {
		return 'prompt.maxPerSession must be a positive integer';
	}

	const chance = readChance(source.chance);
	if (typeof chance === 'string') {
		return chance;
	}

	const triggers = readTriggers(source.triggers);
	if (typeof triggers === 'string') {
		return triggers;
	}

	return { cooldownDays, maxPerSession, chance, triggers };
}

function readChance(raw: unknown): IChatModelFeedbackSurveyChance | string {
	if (raw !== undefined && !isObject(raw)) {
		return 'prompt.chance must be an object';
	}
	const source = isObject(raw) ? raw : {};

	const initial = readProbability(source.initial, 0);
	if (initial === undefined) {
		return 'prompt.chance.initial must be a probability between 0 and 1';
	}
	const increment = readProbability(source.increment, 0);
	if (increment === undefined) {
		return 'prompt.chance.increment must be a probability between 0 and 1';
	}
	const max = readProbability(source.max, 1);
	if (max === undefined) {
		return 'prompt.chance.max must be a probability between 0 and 1';
	}
	if (max < initial) {
		return 'prompt.chance.max must be greater than or equal to prompt.chance.initial';
	}

	return { initial, increment, max };
}

function readTriggers(raw: unknown): IChatModelFeedbackSurveyTriggers | string {
	if (raw !== undefined && !isObject(raw)) {
		return 'prompt.triggers must be an object';
	}
	const source = isObject(raw) ? raw : {};

	const modelSwitchedAway = readTrigger(source.modelSwitchedAway, 'prompt.triggers.modelSwitchedAway');
	if (typeof modelSwitchedAway === 'string') {
		return modelSwitchedAway;
	}

	return { modelSwitchedAway };
}

function readTrigger(raw: unknown, path: string): IChatModelFeedbackSurveyTrigger | string {
	if (raw === undefined) {
		return { enabled: false, bypassCooldown: false };
	}
	// `true` is accepted as shorthand for an enabled trigger that still respects the cooldown.
	if (typeof raw === 'boolean') {
		return { enabled: raw, bypassCooldown: false };
	}
	if (!isObject(raw)) {
		return `${path} must be a boolean or an object`;
	}
	if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') {
		return `${path}.enabled must be a boolean`;
	}
	if (raw.bypassCooldown !== undefined && typeof raw.bypassCooldown !== 'boolean') {
		return `${path}.bypassCooldown must be a boolean`;
	}
	return { enabled: raw.enabled ?? true, bypassCooldown: raw.bypassCooldown ?? false };
}

function readSteps(raw: unknown): ChatModelFeedbackSurveyStep[] | string {
	if (!Array.isArray(raw) || raw.length === 0) {
		return 'steps must be a non-empty array';
	}
	if (raw.length > MAX_STEPS) {
		return `steps exceeds ${MAX_STEPS} entries`;
	}

	const steps: ChatModelFeedbackSurveyStep[] = [];
	const seenIds = new Set<string>();

	for (let i = 0; i < raw.length; i++) {
		const step = readStep(raw[i], i);
		if (typeof step === 'string') {
			return step;
		}
		if (seenIds.has(step.id)) {
			return `steps[${i}].id "${step.id}" is duplicated`;
		}
		seenIds.add(step.id);
		steps.push(step);
	}

	// A text step is terminal because it carries the Submit button, so one in the middle would
	// make every later step unreachable.
	const textStepIndexes = steps.map((step, index) => step.kind === ChatModelFeedbackSurveyStepKind.Text ? index : -1).filter(index => index >= 0);
	if (textStepIndexes.length > 1) {
		return 'steps may contain at most one text step';
	}
	if (textStepIndexes.length === 1 && textStepIndexes[0] !== steps.length - 1) {
		return 'a text step must be the last step';
	}

	return steps;
}

function readStep(raw: unknown, index: number): ChatModelFeedbackSurveyStep | string {
	if (!isObject(raw)) {
		return `steps[${index}] must be an object`;
	}

	const id = readId(raw.id);
	if (!id) {
		return `steps[${index}].id is missing or malformed`;
	}

	const title = readText(raw.title, MAX_TITLE_LENGTH);
	if (!title) {
		return `steps[${index}].title is missing or too long`;
	}

	if (raw.kind === ChatModelFeedbackSurveyStepKind.Text) {
		const placeholder = raw.placeholder === undefined ? undefined : readText(raw.placeholder, MAX_PLACEHOLDER_LENGTH);
		if (raw.placeholder !== undefined && !placeholder) {
			return `steps[${index}].placeholder is empty or too long`;
		}
		const requestedMaxLength = readPositiveInteger(raw.maxLength, MAX_COMMENT_LENGTH);
		if (requestedMaxLength === undefined) {
			return `steps[${index}].maxLength must be a positive integer`;
		}
		return {
			kind: ChatModelFeedbackSurveyStepKind.Text,
			id,
			title,
			placeholder,
			maxLength: Math.min(requestedMaxLength, MAX_COMMENT_LENGTH),
		};
	}

	if (raw.kind !== ChatModelFeedbackSurveyStepKind.Choice) {
		return `steps[${index}].kind must be "${ChatModelFeedbackSurveyStepKind.Choice}" or "${ChatModelFeedbackSurveyStepKind.Text}"`;
	}

	if (!Array.isArray(raw.options) || raw.options.length < MIN_OPTIONS || raw.options.length > MAX_OPTIONS) {
		return `steps[${index}].options must have between ${MIN_OPTIONS} and ${MAX_OPTIONS} entries`;
	}

	const options: IChatModelFeedbackSurveyOption[] = [];
	const seenOptionIds = new Set<string>();
	for (let i = 0; i < raw.options.length; i++) {
		const option = raw.options[i];
		if (!isObject(option)) {
			return `steps[${index}].options[${i}] must be an object`;
		}
		const optionId = readId(option.id);
		if (!optionId) {
			return `steps[${index}].options[${i}].id is missing or malformed`;
		}
		if (seenOptionIds.has(optionId)) {
			return `steps[${index}].options[${i}].id "${optionId}" is duplicated`;
		}
		const label = readText(option.label, MAX_LABEL_LENGTH);
		if (!label) {
			return `steps[${index}].options[${i}].label is missing or too long`;
		}
		seenOptionIds.add(optionId);
		options.push({ id: optionId, label });
	}

	return { kind: ChatModelFeedbackSurveyStepKind.Choice, id, title, options };
}

function readId(raw: unknown): string | undefined {
	if (typeof raw !== 'string') {
		return undefined;
	}
	const trimmed = raw.trim().toLowerCase();
	if (!trimmed || trimmed.length > MAX_ID_LENGTH || !ID_PATTERN.test(trimmed)) {
		return undefined;
	}
	return trimmed;
}

function readText(raw: unknown, maxLength: number): string | undefined {
	if (typeof raw !== 'string') {
		return undefined;
	}
	const trimmed = raw.trim();
	if (!trimmed || trimmed.length > maxLength) {
		return undefined;
	}
	return trimmed;
}

function readPositiveInteger(raw: unknown, fallback: number): number | undefined {
	if (raw === undefined) {
		return fallback;
	}
	if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) {
		return undefined;
	}
	return raw;
}

function readNonNegativeNumber(raw: unknown, fallback: number): number | undefined {
	if (raw === undefined) {
		return fallback;
	}
	if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
		return undefined;
	}
	return raw;
}

function readProbability(raw: unknown, fallback: number): number | undefined {
	if (raw === undefined) {
		return fallback;
	}
	if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > 1) {
		return undefined;
	}
	return raw;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Builds every string a selector may match for a model.
 *
 * Identifiers are qualified differently across harnesses. The language model service uses
 * `<vendor>/<group>/<id>` while agent host sessions use `<sessionType>:<id>`, so a selector is
 * compared against each segment as well as the whole id. That lets `auto` match both
 * `copilot/auto` and `agent-host-copilotcli:auto`.
 */
export function expandModelMatchCandidates(modelId: string | undefined, aliases?: readonly string[]): Set<string> {
	const candidates = new Set<string>();
	const add = (value: string | undefined): void => {
		const normalized = value === undefined ? '' : normalizeSelector(value);
		if (normalized) {
			candidates.add(normalized);
		}
	};

	if (modelId) {
		add(modelId);
		for (const segment of modelId.split(/[/:]/)) {
			add(segment);
		}
	}
	for (const alias of aliases ?? []) {
		add(alias);
	}

	return candidates;
}

/** Whether the response described by `context` should be offered `config`'s survey. */
export function matchesChatModelFeedbackSurvey(config: IChatModelFeedbackSurveyConfig, context: IChatModelFeedbackSurveyMatchContext): boolean {
	const { match } = config;

	if (match.selectedModels.length) {
		const candidates = expandModelMatchCandidates(context.selectedModelId, context.selectedModelAliases);
		if (!match.selectedModels.some(selector => candidates.has(selector))) {
			return false;
		}
	}

	if (match.resolvedModels.length) {
		const candidates = expandModelMatchCandidates(context.resolvedModelId);
		if (!match.resolvedModels.some(selector => candidates.has(selector))) {
			return false;
		}
	}

	if (match.modes.length && !matchesScalar(match.modes, context.modeId)) {
		return false;
	}

	if (match.harnesses.length && !matchesScalar(match.harnesses, context.harness ?? CHAT_MODEL_FEEDBACK_SURVEY_NO_HARNESS)) {
		return false;
	}

	if (match.sessionTypes.length && !matchesScalar(match.sessionTypes, context.sessionType)) {
		return false;
	}

	return true;
}

function matchesScalar(selectors: readonly string[], value: string | undefined): boolean {
	const normalized = value === undefined ? undefined : normalizeSelector(value);
	return !!normalized && selectors.includes(normalized);
}

function normalizeSelector(value: string): string {
	return value.trim().toLowerCase().replace(/[\s_]+/g, '-');
}
