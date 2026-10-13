/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotRequestContext } from '@github/copilot-sdk';
import type { ICopilotApiService } from '../../../shared/copilotApiService.js';
import { toChatTemplateKwargs, type LocalModelThinkingSupport } from '../localModelThinking.js';
import { CHAT_TEMPLATE_RESERVE_TOKENS, DEFAULT_CAPI_ORIGIN, KNOWN_AUTO_LOCAL_IDS, LOCAL_CAPI_ID_SUFFIX, SENTINEL_ORIGIN } from './constants.js';
import type { ILocalModelFamilyLimits, ILocalModelLiveGates, ILocalModelServerProps, IServingSnapshot } from './servingAccess.js';

/* Pure routing logic for the request-handler bridge (classification, `/auto` handling, adapters, cloud fallback); no I/O. */

/** A model-layer request with its body read once, so every routing branch can replay it. */
export interface ILocalModelBufferedRequest {
	readonly url: URL;
	readonly method: string;
	readonly headers: Headers;
	/** `undefined` when the request had no body. */
	readonly body: Uint8Array | undefined;
	readonly redirect: RequestRedirect;
}

/** A parsed JSON request or response body. Untrusted: every field is validated before use. */
export type LocalModelJsonBody = Record<string, unknown>;

const textEncoder = new TextEncoder();

function isObject(value: unknown): value is LocalModelJsonBody {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Parses a JSON object body; `undefined` for anything else. */
export function parseJsonObject(bytes: Uint8Array | string | undefined): LocalModelJsonBody | undefined {
	if (bytes === undefined) {
		return undefined;
	}
	try {
		const value: unknown = JSON.parse(typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes));
		return isObject(value) ? value : undefined;
	} catch {
		return undefined;
	}
}

/** Serializes a JSON body. */
export function encodeJsonBody(body: LocalModelJsonBody): Uint8Array<ArrayBuffer> {
	return textEncoder.encode(JSON.stringify(body));
}

/** Whether `model` is a CAPI on-device id (`…-local`). Such an id is never sent to CAPI inference. */
export function isLocalCapiModelId(model: string): boolean {
	return model.toLowerCase().endsWith(LOCAL_CAPI_ID_SUFFIX);
}

// #region Environment (CAPI origins)

/** What classification needs to know about the host. */
export interface ILocalModelRouterEnv {
	/** Normalized CAPI base URLs (`origin` + base path, no trailing slash) of the signed-in accounts plus the default family. */
	readonly capiBaseUrls: readonly string[];
	/** `http://on-device.vscode.invalid`. */
	readonly sentinelOrigin: string;
	/** Lower-cased CAPI on-device ids Auto admits. */
	readonly knownAutoLocalIds: readonly string[];
}

/** The default CAPI family; always treated as CAPI, whatever the signed-in accounts resolve to. */
export const DEFAULT_CAPI_BASE_URLS: readonly string[] = [
	DEFAULT_CAPI_ORIGIN,
	'https://api.individual.githubcopilot.com',
	'https://api.business.githubcopilot.com',
	'https://api.enterprise.githubcopilot.com',
];

/** Normalizes a CAPI endpoint URL to `origin` + base path; `undefined` when it is not an HTTP(S) URL or is the sentinel. */
export function normalizeCapiBaseUrl(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}
	if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin === SENTINEL_ORIGIN) {
		return undefined;
	}
	return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** Builds the router environment from resolved CAPI endpoints (see {@link resolveLocalModelCapiBaseUrls}). */
export function createLocalModelRouterEnv(capiBaseUrls: readonly (string | undefined)[] = []): ILocalModelRouterEnv {
	const bases = new Set<string>();
	for (const value of [...DEFAULT_CAPI_BASE_URLS, ...capiBaseUrls]) {
		const normalized = normalizeCapiBaseUrl(value);
		if (normalized) {
			bases.add(normalized);
		}
	}
	return { capiBaseUrls: [...bases], sentinelOrigin: SENTINEL_ORIGIN, knownAutoLocalIds: KNOWN_AUTO_LOCAL_IDS.map(id => id.toLowerCase()) };
}

/**
 * Resolves the CAPI endpoints of the signed-in accounts (covering Enterprise and proxies) plus an optional
 * `VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE`; failed resolutions are skipped. Call it again on sign-in changes.
 */
export async function resolveLocalModelCapiBaseUrls(copilotApiService: Pick<ICopilotApiService, 'resolveApiEndpoint'>, githubTokens: readonly string[], capiUrlOverride?: string): Promise<string[]> {
	const resolved = await Promise.all(githubTokens.map(async token => {
		try {
			return await copilotApiService.resolveApiEndpoint(token);
		} catch {
			return undefined;
		}
	}));
	const result: string[] = [];
	for (const value of [capiUrlOverride, ...resolved]) {
		const normalized = normalizeCapiBaseUrl(value);
		if (normalized && !result.includes(normalized)) {
			result.push(normalized);
		}
	}
	return result;
}

// #endregion

// #region Classification

/**
 * Why a request was rejected outright (fail closed):
 * - `sentinelEndpoint`: a sentinel-origin request other than `POST /v1/chat/completions`;
 * - `capiLocalModel`: a CAPI request carrying a `-local` model id outside the `localAuto` shape.
 */
export type LocalModelRejectReason = 'sentinelEndpoint' | 'capiLocalModel';

export type LocalModelRequestClassification =
	| { readonly kind: 'capiAuto'; readonly body: LocalModelJsonBody }
	| { readonly kind: 'localAuto'; readonly body: LocalModelJsonBody; readonly model: string }
	| { readonly kind: 'localDirect'; readonly body: LocalModelJsonBody | undefined }
	| { readonly kind: 'rejected'; readonly reason: LocalModelRejectReason }
	| { readonly kind: 'passThrough' };

function capiBasePathFor(url: URL, env: ILocalModelRouterEnv): string[] {
	const paths: string[] = [];
	for (const base of env.capiBaseUrls) {
		const baseUrl = new URL(base);
		if (baseUrl.origin === url.origin) {
			paths.push(baseUrl.pathname.replace(/\/+$/, ''));
		}
	}
	return paths;
}

/**
 * Classifies a buffered model-layer request. Pure; never throws for
 * malformed bodies.
 *
 * | Class | Predicate |
 * |---|---|
 * | `capiAuto` | POST, HTTP transport, CAPI origin, pathname exactly `<api base path>/auto`, JSON body with a string `prompt` |
 * | `localAuto` | POST, CAPI origin, pathname ends with `/chat/completions`, `body.model` in known Auto local ids |
 * | `localDirect` | POST, sentinel origin, pathname `/v1/chat/completions` |
 * | `rejected` | any other sentinel request; any other CAPI request whose `body.model` is a `-local` id |
 * | `passThrough` | everything else (BYOK bridge on loopback, other providers, ...) |
 */
export function classifyLocalModelRequest(request: ILocalModelBufferedRequest, ctx: Pick<CopilotRequestContext, 'transport'>, env: ILocalModelRouterEnv): LocalModelRequestClassification {
	const url = request.url;
	if (url.origin === env.sentinelOrigin) {
		if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
			return { kind: 'localDirect', body: parseJsonObject(request.body) };
		}
		return { kind: 'rejected', reason: 'sentinelEndpoint' };
	}

	if (request.method !== 'POST' || !request.body) {
		return { kind: 'passThrough' };
	}
	const basePaths = capiBasePathFor(url, env);
	if (basePaths.length === 0) {
		return { kind: 'passThrough' };
	}

	const text = new TextDecoder().decode(request.body);
	if (ctx.transport === 'http' && basePaths.some(basePath => url.pathname === `${basePath}/auto`)) {
		const body = parseJsonObject(text);
		if (body && typeof body.prompt === 'string') {
			return { kind: 'capiAuto', body };
		}
	}

	if (!/-local/i.test(text)) {
		return { kind: 'passThrough' };
	}
	const body = parseJsonObject(text);
	const model = typeof body?.model === 'string' ? body.model : undefined;
	if (!body || !model || !isLocalCapiModelId(model)) {
		return { kind: 'passThrough' };
	}
	if (url.pathname.endsWith('/chat/completions') && env.knownAutoLocalIds.includes(model.toLowerCase())) {
		return { kind: 'localAuto', body, model };
	}
	return { kind: 'rejected', reason: 'capiLocalModel' };
}

const CONVERSATION_INTERACTION_TYPES: ReadonlySet<string> = new Set(['conversation-agent', 'conversation-user', 'conversation-subagent']);

/**
 * Why a routed Auto request ran in the cloud instead:
 * - `staleModel`: the route's serving generation is gone (swap, update, reload) or `body.model` differs from it;
 * - `disabled`: the effective gate or `useInAuto` is off;
 * - `ancillary`: not a user-visible conversation turn;
 * - `image`: the messages contain image parts;
 * - `endpointDown`: the server is not ready, or its endpoint is down-marked;
 * - `slotsFull`: every slot is busy;
 * - before the commit point: `connectFailed` (refused or connect timeout; down-marks the endpoint),
 *   `firstOutputTimeout`, `httpError` (non-2xx), `emptyStream` (2xx without output),
 *   `streamError` (an error event first), `localError` (any other local failure),
 *   `contextExceeded` (the prompt does not fit the context the server serves).
 */
export type LocalModelFallbackReason =
	| 'staleModel'
	| 'disabled'
	| 'ancillary'
	| 'image'
	| 'endpointDown'
	| 'slotsFull'
	| 'connectFailed'
	| 'firstOutputTimeout'
	| 'httpError'
	| 'emptyStream'
	| 'streamError'
	| 'localError'
	| 'contextExceeded';

/** Whether `ctx.interactionType` is ancillary work that stays in the cloud so the local slot serves user-visible turns; a missing value counts as a turn. */
export function isAncillaryInteraction(interactionType: string | undefined): boolean {
	return !!interactionType && !CONVERSATION_INTERACTION_TYPES.has(interactionType);
}

/** Whether any chat message carries an image part. */
export function hasImageParts(body: LocalModelJsonBody): boolean {
	if (!Array.isArray(body.messages)) {
		return false;
	}
	return body.messages.some(message => isObject(message) && Array.isArray(message.content) && message.content.some(part =>
		isObject(part) && (part.type === 'image_url' || part.type === 'image' || part.type === 'input_image' || part.image_url !== undefined)));
}

const CONNECT_FAILURE_CODES: ReadonlySet<string> = new Set(['ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH']);

/** Whether a fetch error is a refused connection or a connect timeout (walks `cause`). */
export function isConnectFailure(error: unknown): boolean {
	let current = error;
	for (let depth = 0; depth < 5 && isObject(current); depth++) {
		if (typeof current.code === 'string' && CONNECT_FAILURE_CODES.has(current.code)) {
			return true;
		}
		current = current.cause;
	}
	return false;
}

// #endregion

// #region `/auto` injection

export type AutoInjectionSkipReason =
	| 'alreadyDeclared'
	| 'image'
	| 'disabled'
	| 'noActiveModel'
	| 'swapInProgress'
	| 'notReady'
	| 'notAutoEligible'
	| 'notAutoCapable'
	| 'endpointDown';

export interface IAutoInjectionState {
	readonly gates: ILocalModelLiveGates;
	readonly serving: IServingSnapshot | undefined;
	/** The active generation's endpoint is down-marked. */
	readonly endpointDown: boolean;
	readonly knownAutoLocalIds: readonly string[];
}

export type AutoInjectionDecision =
	| { readonly inject: true; readonly serving: IServingSnapshot }
	| { readonly inject: false; readonly reason: AutoInjectionSkipReason };

/** Decides whether to declare the active model to `/auto`. Gates are re-read by the caller for every call. */
export function decideAutoInjection(body: LocalModelJsonBody, state: IAutoInjectionState): AutoInjectionDecision {
	if (body.local_models !== undefined) {
		return { inject: false, reason: 'alreadyDeclared' };
	}
	if (body.has_image === true) {
		return { inject: false, reason: 'image' };
	}
	const { gates, serving } = state;
	if (!gates.enabled || !gates.accountGate || !gates.useInAuto) {
		return { inject: false, reason: 'disabled' };
	}
	if (!serving) {
		return { inject: false, reason: 'noActiveModel' };
	}
	if (serving.swapInProgress) {
		return { inject: false, reason: 'swapInProgress' };
	}
	if (serving.server !== 'ready' || !serving.endpoint || !serving.props) {
		return { inject: false, reason: 'notReady' };
	}
	if (!serving.autoEligible) {
		return { inject: false, reason: 'notAutoEligible' };
	}
	if (!state.knownAutoLocalIds.includes(serving.identity.capiId.toLowerCase())) {
		return { inject: false, reason: 'notAutoCapable' };
	}
	if (state.endpointDown) {
		return { inject: false, reason: 'endpointDown' };
	}
	return { inject: true, serving };
}

/** The `/auto` request with `local_models: [capiId]` added and `content-length` dropped. */
export function buildInjectedAutoRequest(request: ILocalModelBufferedRequest, body: LocalModelJsonBody, capiId: string): ILocalModelBufferedRequest {
	const headers = new Headers(request.headers);
	headers.delete('content-length');
	return { url: request.url, method: request.method, headers, body: encodeJsonBody({ ...body, local_models: [capiId] }), redirect: request.redirect };
}

// #endregion

// #region `/auto` response handling

/** The validated, chat-capable cloud fallback model `F` of an `/auto` answer. */
export interface ILocalModelFallbackModel {
	readonly id: string;
	readonly maxContextWindowTokens?: number;
	readonly maxPromptTokens?: number;
	readonly maxOutputTokens?: number;
	/** `capabilities.supports.reasoning_effort` when it lists allowed values. */
	readonly reasoningEfforts?: readonly string[];
}

/** Limits for a request built for the local model that is also valid for the fallback. Integers. */
export interface ILocalModelAutoLimits {
	readonly maxContextWindowTokens: number;
	readonly maxPromptTokens: number;
	readonly maxOutputTokens: number;
}

/**
 * The bounded limits reported for the local model:
 * ```
 * slotCtx   = floor(n_ctx / total_slots)
 * maxCtx    = min(slotCtx, F.max_context_window_tokens ?? slotCtx, tag maxContextWindowTokens)
 * maxOutput = min(tag maxOutputTokens, F.max_output_tokens ?? Infinity, floor(maxCtx / 4))
 * maxPrompt = min(tag maxPromptTokens, F.max_prompt_tokens ?? Infinity, maxCtx - maxOutput - 1024)
 * ```
 * Without `fallback` (direct rows, no-route serving) the `F` terms drop out.
 * Returns `undefined` when the result is not a usable positive budget.
 */
export function computeLocalModelLimits(props: ILocalModelServerProps, tags: ILocalModelFamilyLimits, fallback?: Pick<ILocalModelFallbackModel, 'maxContextWindowTokens' | 'maxPromptTokens' | 'maxOutputTokens'>): ILocalModelAutoLimits | undefined {
	if (!isPositiveNumber(props.nCtx) || !isPositiveNumber(props.totalSlots)) {
		return undefined;
	}
	const slotCtx = Math.floor(props.nCtx / props.totalSlots);
	const maxContextWindowTokens = Math.floor(Math.min(slotCtx, fallback?.maxContextWindowTokens ?? slotCtx, tags.maxContextWindowTokens));
	const maxOutputTokens = Math.floor(Math.min(tags.maxOutputTokens, fallback?.maxOutputTokens ?? Infinity, Math.floor(maxContextWindowTokens / 4)));
	const maxPromptTokens = Math.floor(Math.min(tags.maxPromptTokens, fallback?.maxPromptTokens ?? Infinity, maxContextWindowTokens - maxOutputTokens - CHAT_TEMPLATE_RESERVE_TOKENS));
	if (![maxContextWindowTokens, maxOutputTokens, maxPromptTokens].every(isPositiveNumber)) {
		return undefined;
	}
	return { maxContextWindowTokens, maxPromptTokens, maxOutputTokens };
}

/** Reads `F`; `undefined` unless it has a non-local string id and supports `/chat/completions`. */
export function readFallbackModel(value: unknown): ILocalModelFallbackModel | undefined {
	if (!isObject(value) || typeof value.id !== 'string' || !value.id || isLocalCapiModelId(value.id)) {
		return undefined;
	}
	if (!Array.isArray(value.supported_endpoints) || !value.supported_endpoints.includes('/chat/completions')) {
		return undefined;
	}
	const capabilities = isObject(value.capabilities) ? value.capabilities : undefined;
	const limits = isObject(capabilities?.limits) ? capabilities.limits : undefined;
	const supports = isObject(capabilities?.supports) ? capabilities.supports : undefined;
	const efforts = Array.isArray(supports?.reasoning_effort) ? supports.reasoning_effort.filter((effort): effort is string => typeof effort === 'string') : undefined;
	return {
		id: value.id,
		maxContextWindowTokens: isPositiveNumber(limits?.max_context_window_tokens) ? Math.floor(limits.max_context_window_tokens) : undefined,
		maxPromptTokens: isPositiveNumber(limits?.max_prompt_tokens) ? Math.floor(limits.max_prompt_tokens) : undefined,
		maxOutputTokens: isPositiveNumber(limits?.max_output_tokens) ? Math.floor(limits.max_output_tokens) : undefined,
		reasoningEfforts: efforts?.length ? efforts : undefined,
	};
}

/** The patched `selected_model`; the fallback's `reasoningEfforts` are declared so the session's `reasoning_effort` reaches the local chat template and stays valid for the fallback. */
export function patchSelectedModel(selected: LocalModelJsonBody, limits: ILocalModelAutoLimits, displayName: string, reasoningEfforts?: readonly string[]): LocalModelJsonBody {
	const capabilities = isObject(selected.capabilities) ? selected.capabilities : {};
	return {
		...selected,
		name: displayName,
		vendor: 'Microsoft',
		supported_endpoints: ['/chat/completions'],
		capabilities: {
			...capabilities,
			limits: {
				max_context_window_tokens: limits.maxContextWindowTokens,
				max_prompt_tokens: limits.maxPromptTokens,
				max_output_tokens: limits.maxOutputTokens,
			},
			supports: { tool_calls: true, streaming: true, parallel_tool_calls: false, vision: false, ...(reasoningEfforts?.length ? { reasoning_effort: [...reasoningEfforts] } : {}) },
		},
	};
}

/** Why a local pick is answered with the cloud-only re-issue instead of a patch. */
export type AutoReissueReason = 'noFallback' | 'fallbackNotChat' | 'noSessionToken' | 'limits' | 'otherLocalModel';

export type AutoResponseOutcome =
	| { readonly kind: 'notOurs' }
	| { readonly kind: 'reissue'; readonly reason: AutoReissueReason }
	| {
		readonly kind: 'patch';
		readonly body: LocalModelJsonBody;
		readonly sessionToken: string;
		readonly fallback: ILocalModelFallbackModel;
		readonly limits: ILocalModelAutoLimits;
		/** `expires_at` in milliseconds, when CAPI sent it. */
		readonly expiresAtMs: number | undefined;
	};

/** The `selected_model.id` of an `/auto` answer, when it has one. Pure. */
export function readAutoSelectedModelId(response: LocalModelJsonBody): string | undefined {
	const selected = isObject(response.selected_model) ? response.selected_model : undefined;
	return typeof selected?.id === 'string' ? selected.id : undefined;
}

/** CAPI's request id header, quoted in the `/auto` diagnostics so a decision can be looked up server-side. */
export const CAPI_REQUEST_ID_HEADER = 'x-github-request-id';

/** A log-safe identifier: model ids, enum values and request ids pass; anything else is `other`. */
function logIdentifier(value: unknown): string | undefined {
	if (typeof value !== 'string' || !value) {
		return undefined;
	}
	return /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : 'other';
}

/**
 * One log line of CAPI's `/auto` decision for a declared on-device model and the routing state the request carried.
 * Only identifiers, enum values, counts and flags; never the prompt, previous messages, session or state tokens. Pure.
 */
export function describeAutoDecision(request: LocalModelJsonBody, response: LocalModelJsonBody | undefined, headers: Headers): string {
	const fields: [string, string | number | boolean | undefined][] = [];
	if (response) {
		const fallback = response.cloud_fallback_model ?? response.fallback_model;
		const multiTurn = isObject(response.multi_turn) ? response.multi_turn : undefined;
		const hydra = isObject(response.hydra_rl_multi_turn) ? response.hydra_rl_multi_turn : undefined;
		const skipTurns = hydra?.skip_turns;
		fields.push(
			['selected', logIdentifier(readAutoSelectedModelId(response)) ?? 'none'],
			['cloudFallback', logIdentifier(isObject(fallback) ? fallback.id : undefined) ?? 'none'],
			['multiTurnMode', logIdentifier(response.multi_turn_mode) ?? 'none'],
			['multiTurnEnabled', typeof multiTurn?.enabled === 'boolean' ? multiTurn.enabled : undefined],
			['decision', logIdentifier(hydra?.decision)],
			['skipTurns', isTokenCount(skipTurns) ? skipTurns : undefined],
		);
	}
	const requestHydra = isObject(request.hydra_rl_multi_turn) ? request.hydra_rl_multi_turn : undefined;
	fields.push(
		['tier', logIdentifier(request.tier) ?? 'default'],
		['requestMultiTurn', requestHydra ? 'hydra_rl' : isObject(request.multi_turn) ? 'model_cards' : 'none'],
		['stateToken', requestHydra ? typeof requestHydra.state_token === 'string' && !!requestHydra.state_token : undefined],
		['advance', typeof requestHydra?.advance === 'boolean' ? requestHydra.advance : undefined],
		['previousUserMessages', Array.isArray(request.previous_user_messages) ? request.previous_user_messages.length : undefined],
		['requestId', logIdentifier(headers.get(CAPI_REQUEST_ID_HEADER) ?? undefined) ?? 'none'],
	);
	return fields.filter(([, value]) => value !== undefined).map(([key, value]) => `${key}=${value}`).join(', ');
}

/** Decides what to do with a buffered 2xx `/auto` answer to an injected request. */
export function evaluateAutoResponse(response: LocalModelJsonBody, serving: IServingSnapshot): AutoResponseOutcome {
	const selected = isObject(response.selected_model) ? response.selected_model : undefined;
	const selectedId = readAutoSelectedModelId(response);
	if (!selected || !selectedId) {
		return { kind: 'notOurs' };
	}
	if (selectedId.toLowerCase() !== serving.identity.capiId.toLowerCase()) {
		return isLocalCapiModelId(selectedId) ? { kind: 'reissue', reason: 'otherLocalModel' } : { kind: 'notOurs' };
	}
	const rawFallback = response.cloud_fallback_model ?? response.fallback_model;
	if (rawFallback === undefined || rawFallback === null) {
		return { kind: 'reissue', reason: 'noFallback' };
	}
	const fallback = readFallbackModel(rawFallback);
	if (!fallback) {
		return { kind: 'reissue', reason: 'fallbackNotChat' };
	}
	if (typeof response.session_token !== 'string' || !response.session_token) {
		return { kind: 'reissue', reason: 'noSessionToken' };
	}
	const limits = serving.props ? computeLocalModelLimits(serving.props, serving.limits, fallback) : undefined;
	if (!limits) {
		return { kind: 'reissue', reason: 'limits' };
	}
	return {
		kind: 'patch',
		body: { ...response, selected_model: patchSelectedModel(selected, limits, serving.displayName, serving.thinking ? fallback.reasoningEfforts : undefined) },
		sessionToken: response.session_token,
		fallback,
		limits,
		expiresAtMs: isPositiveNumber(response.expires_at) ? response.expires_at * 1000 : undefined,
	};
}

// #endregion

// #region Request adapters

/** Keys never sent to `llama-server` as the runtime sent them. */
function isStrippedRequestKey(key: string): boolean {
	return key === 'reasoning_effort' || key.startsWith('copilot_') || key === 'prompt_cache_key' || key === 'intent' || key === 'n' || key === 'return_progress';
}

function mapAssistantReasoning(message: unknown): unknown {
	if (!isObject(message) || message.role !== 'assistant') {
		return message;
	}
	const { reasoning_text: reasoningText, reasoning_opaque: _opaque, encrypted_content: _encrypted, ...rest } = message;
	if (typeof reasoningText === 'string' && rest.reasoning_content === undefined) {
		rest.reasoning_content = reasoningText;
	}
	return rest;
}

export interface ILocalRequestAdapterOptions {
	/** `auto` for CAPI chat requests (reasoning mapping, usage chunk); `direct` for sentinel BYOK requests. */
	readonly mode: 'auto' | 'direct';
	/** `--alias` of the serving identity the request is bound to. */
	readonly alias: string;
	/** Clamp for `max_tokens`. */
	readonly maxOutputTokens?: number;
	/** The serving model's thinking control: the request's `reasoning_effort` becomes `chat_template_kwargs`. */
	readonly thinking?: LocalModelThinkingSupport;
}

/**
 * Builds the body sent to `llama-server`: `model := alias`, CAPI-only keys dropped, `reasoning_effort` passed as
 * `chat_template_kwargs` when the chat template understands it, only function tools kept, `max_tokens` clamped and
 * `return_progress` requested when streaming. Auto also maps assistant reasoning fields and requests usage.
 */
export function adaptLocalRequestBody(body: LocalModelJsonBody, options: ILocalRequestAdapterOptions): LocalModelJsonBody {
	const result: LocalModelJsonBody = {};
	for (const [key, value] of Object.entries(body)) {
		if (!isStrippedRequestKey(key)) {
			result[key] = value;
		}
	}
	result.model = options.alias;
	const kwargs = toChatTemplateKwargs(body.reasoning_effort, options.thinking);
	if (kwargs) {
		result.chat_template_kwargs = { ...(isObject(body.chat_template_kwargs) ? body.chat_template_kwargs : {}), ...kwargs };
	}
	if (Array.isArray(body.tools)) {
		const tools = body.tools.filter(tool => isObject(tool) && tool.type === 'function');
		if (tools.length) {
			result.tools = tools;
		} else {
			delete result.tools;
			delete result.tool_choice;
		}
	}
	if (options.mode === 'auto' && Array.isArray(body.messages)) {
		result.messages = body.messages.map(mapAssistantReasoning);
	}
	if (options.maxOutputTokens !== undefined && typeof result.max_tokens === 'number' && result.max_tokens > options.maxOutputTokens) {
		result.max_tokens = options.maxOutputTokens;
	}
	if (options.mode === 'auto' && body.stream === true) {
		result.stream_options = { ...(isObject(body.stream_options) ? body.stream_options : {}), include_usage: true };
	}
	if (body.stream === true) {
		result.return_progress = true;
	}
	return result;
}

/** Effort levels, lowest first, for mapping to the nearest allowed value. */
const REASONING_EFFORT_ORDER: readonly string[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

/** Maps a requested `reasoning_effort` to one `allowed` accepts (nearest, ties toward lower effort), or `undefined` to drop it. */
export function mapReasoningEffort(requested: string, allowed: readonly string[] | undefined): string | undefined {
	if (!allowed?.length) {
		return undefined;
	}
	if (allowed.includes(requested)) {
		return requested;
	}
	const requestedRank = REASONING_EFFORT_ORDER.indexOf(requested);
	if (requestedRank < 0) {
		return undefined;
	}
	let best: string | undefined;
	let bestRank = -1;
	for (const candidate of allowed) {
		const rank = REASONING_EFFORT_ORDER.indexOf(candidate);
		if (rank < 0) {
			continue;
		}
		const distance = Math.abs(rank - requestedRank);
		const bestDistance = best === undefined ? Infinity : Math.abs(bestRank - requestedRank);
		if (distance < bestDistance || (distance === bestDistance && rank < bestRank)) {
			best = candidate;
			bestRank = rank;
		}
	}
	return best;
}

/**
 * The cloud fallback request: the original CAPI request with `model := F.id`, `reasoning_effort` mapped or dropped,
 * `max_tokens` clamped to F and the route's `Copilot-Session-Token`; every other header is kept.
 */
export function buildFallbackChatRequest(original: ILocalModelBufferedRequest, body: LocalModelJsonBody, fallback: ILocalModelFallbackModel, sessionToken: string): ILocalModelBufferedRequest {
	const next: LocalModelJsonBody = { ...body, model: fallback.id };
	if (next.reasoning_effort !== undefined) {
		const mapped = typeof next.reasoning_effort === 'string' ? mapReasoningEffort(next.reasoning_effort, fallback.reasoningEfforts) : undefined;
		if (mapped) {
			next.reasoning_effort = mapped;
		} else {
			delete next.reasoning_effort;
		}
	}
	if (fallback.maxOutputTokens !== undefined && typeof next.max_tokens === 'number' && next.max_tokens > fallback.maxOutputTokens) {
		next.max_tokens = fallback.maxOutputTokens;
	}
	const headers = new Headers(original.headers);
	headers.delete('content-length');
	headers.set('copilot-session-token', sessionToken);
	return { url: original.url, method: original.method, headers, body: encodeJsonBody(next), redirect: original.redirect };
}

// #endregion

// #region Response adapters

function renameReasoning(value: unknown): unknown {
	if (!isObject(value) || value.reasoning_content === undefined) {
		return value;
	}
	const { reasoning_content: reasoning, ...rest } = value;
	if (reasoning !== null && reasoning !== undefined) {
		rest.reasoning_text = reasoning;
	}
	return rest;
}

/** Rewrites one Auto chat payload (SSE chunk or complete JSON): `model` → `capiId` and `reasoning_content` → `reasoning_text`. */
export function rewriteAutoResponsePayload(payload: LocalModelJsonBody, capiId: string): LocalModelJsonBody {
	const result: LocalModelJsonBody = { ...payload, model: capiId };
	if (Array.isArray(payload.choices)) {
		result.choices = payload.choices.map(choice => {
			if (!isObject(choice)) {
				return choice;
			}
			const next: LocalModelJsonBody = { ...choice };
			if (choice.delta !== undefined) {
				next.delta = renameReasoning(choice.delta);
			}
			if (choice.message !== undefined) {
				next.message = renameReasoning(choice.message);
			}
			return next;
		});
	}
	return result;
}

function readCompletionTokens(payload: LocalModelJsonBody): number | undefined {
	const usage = isObject(payload.usage) ? payload.usage : undefined;
	return typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : undefined;
}

/** `llama-server`'s prompt processing progress (`return_progress`), in tokens of the prompt. */
export interface ILocalPromptProgress {
	readonly total: number;
	/** Reused from the prompt cache. */
	readonly cache: number;
	/** In the context so far, the cached ones included. */
	readonly processed: number;
}

function isTokenCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** The `prompt_progress` of a local stream payload, when it carries a valid one. Pure. */
export function readLocalPromptProgress(payload: LocalModelJsonBody): ILocalPromptProgress | undefined {
	const progress = isObject(payload.prompt_progress) ? payload.prompt_progress : undefined;
	const total = progress?.total;
	const cache = progress?.cache;
	const processed = progress?.processed;
	return isTokenCount(total) && isTokenCount(cache) && isTokenCount(processed) ? { total, cache, processed } : undefined;
}

function hasDeltaOutput(delta: unknown): boolean {
	return isObject(delta) && (
		(typeof delta.content === 'string' && delta.content.length > 0)
		|| (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0)
		|| (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0));
}

/** Whether a local stream payload carries anything for the runtime: output, a finish reason, usage or an error. */
function hasLocalOutput(payload: LocalModelJsonBody): boolean {
	if (payload.usage !== undefined || isErrorPayload(payload)) {
		return true;
	}
	return Array.isArray(payload.choices) && payload.choices.some(choice => isObject(choice)
		&& ((choice.finish_reason !== undefined && choice.finish_reason !== null) || choice.message !== undefined || hasDeltaOutput(choice.delta)));
}

/** A payload that only reports prompt processing progress (`llama-server` sends each in its own chunk); never output, never forwarded. Pure. */
export function isPromptProgressOnly(payload: LocalModelJsonBody): boolean {
	return payload.prompt_progress !== undefined && !hasLocalOutput(payload);
}

/**
 * Whether a local chat stream ended properly: every choice reported a real `finish_reason`, or `[DONE]` arrived
 * after one finished. An earlier EOF is a truncated response and must surface as an error.
 */
class LocalStreamTermination {

	private readonly _choices = new Set<number>();
	private readonly _finished = new Set<number>();
	private _done = false;

	get terminated(): boolean {
		if (this._done && this._finished.size > 0) {
			return true;
		}
		return this._choices.size > 0 && [...this._choices].every(index => this._finished.has(index));
	}

	observePayload(payload: LocalModelJsonBody): void {
		if (!Array.isArray(payload.choices)) {
			return;
		}
		for (const choice of payload.choices) {
			if (!isObject(choice)) {
				continue;
			}
			const index = typeof choice.index === 'number' ? choice.index : 0;
			this._choices.add(index);
			if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
				this._finished.add(index);
			}
		}
	}

	observeDone(): void {
		this._done = true;
	}
}

/**
 * Line-buffered SSE adapter for local responses; tolerates frames split across chunks, even inside multi-byte
 * characters. `auto` mode rewrites each `data:` payload ({@link rewriteAutoResponsePayload}); both modes drop
 * prompt progress events and observe usage and whether the stream {@link terminated} properly.
 */
export class LocalSseResponseAdapter {

	private readonly _decoder = new TextDecoder();
	private readonly _termination = new LocalStreamTermination();
	private _buffer = '';
	private _outputTokens: number | undefined;
	/** A prompt progress event was removed: the blank line that ends it goes too. */
	private _skipSeparator = false;

	constructor(
		private readonly _mode: 'auto' | 'direct',
		private readonly _capiId: string,
	) { }

	/** `usage.completion_tokens` from the last usage chunk seen. */
	get outputTokens(): number | undefined {
		return this._outputTokens;
	}

	/** Whether the stream so far ended properly; check after {@link flush} at EOF. */
	get terminated(): boolean {
		return this._termination.terminated;
	}

	/** Adapts the complete lines received so far; a partial line waits for the rest. */
	push(chunk: Uint8Array): Uint8Array {
		const text = this._buffer + this._decoder.decode(chunk, { stream: true });
		const lastNewline = text.lastIndexOf('\n');
		if (lastNewline < 0) {
			this._buffer = text;
			return new Uint8Array(0);
		}
		this._buffer = text.slice(lastNewline + 1);
		return textEncoder.encode(this._processLines(text.slice(0, lastNewline + 1)));
	}

	flush(): Uint8Array {
		const text = this._buffer + this._decoder.decode();
		this._buffer = '';
		return textEncoder.encode(text ? this._processLines(text) : '');
	}

	/** Complete lines, then at most one partial line (at {@link flush}). */
	private _processLines(text: string): string {
		const lines = text.split('\n');
		const partial = lines.pop() ?? '';
		let output = '';
		for (const line of lines) {
			const adapted = this._processLine(line);
			if (adapted !== undefined) {
				output += `${adapted}\n`;
			}
		}
		return partial ? output + (this._processLine(partial) ?? '') : output;
	}

	/** The adapted line, or `undefined` to remove it. */
	private _processLine(line: string): string | undefined {
		const carriageReturn = line.endsWith('\r');
		const content = carriageReturn ? line.slice(0, -1) : line;
		if (this._skipSeparator) {
			this._skipSeparator = false;
			if (!content) {
				return undefined;
			}
		}
		if (!content.startsWith('data:')) {
			return line;
		}
		const rawPayload = content.slice(5).trim();
		if (rawPayload === '[DONE]') {
			this._termination.observeDone();
			return line;
		}
		let payload = parseJsonObject(rawPayload);
		if (!payload) {
			return line;
		}
		let rewritten = false;
		if (payload.prompt_progress !== undefined) {
			if (isPromptProgressOnly(payload)) {
				this._skipSeparator = true;
				return undefined;
			}
			const { prompt_progress: _progress, ...rest } = payload;
			payload = rest;
			rewritten = true;
		}
		this._termination.observePayload(payload);
		this._outputTokens = readCompletionTokens(payload) ?? this._outputTokens;
		if (this._mode === 'direct') {
			return rewritten ? `data: ${JSON.stringify(payload)}${carriageReturn ? '\r' : ''}` : line;
		}
		return `data: ${JSON.stringify(rewriteAutoResponsePayload(payload, this._capiId))}${carriageReturn ? '\r' : ''}`;
	}
}

/** Adapts a complete (non-streaming) local JSON response; returns the body and its output tokens. */
export function adaptLocalJsonResponse(payload: LocalModelJsonBody, mode: 'auto' | 'direct', capiId: string): { readonly body: LocalModelJsonBody; readonly outputTokens: number | undefined } {
	return { body: mode === 'auto' ? rewriteAutoResponsePayload(payload, capiId) : payload, outputTokens: readCompletionTokens(payload) };
}

/** Whether a local response payload is an error object (`{"error": ...}`). */
export function isErrorPayload(payload: LocalModelJsonBody): boolean {
	return payload.error !== undefined && payload.error !== null;
}

/** A prompt that does not fit the context `llama-server` serves, with the sizes it reported. */
export interface ILocalContextOverflow {
	readonly promptTokens?: number;
	readonly contextTokens?: number;
}

/** `llama-server`'s `request (N tokens) exceeds the available context size (M tokens)`. */
const LLAMA_CONTEXT_OVERFLOW_MESSAGE = /exceeds the available context size/i;

/** Reads `llama-server`'s context-overflow error (`exceed_context_size_error` or its message), else `undefined`. Pure. */
export function readLocalContextOverflow(payload: LocalModelJsonBody | undefined): ILocalContextOverflow | undefined {
	const error = isObject(payload?.error) ? payload.error : undefined;
	if (!error || (error.type !== 'exceed_context_size_error' && !(typeof error.message === 'string' && LLAMA_CONTEXT_OVERFLOW_MESSAGE.test(error.message)))) {
		return undefined;
	}
	return {
		...(isPositiveNumber(error.n_prompt_tokens) ? { promptTokens: Math.floor(error.n_prompt_tokens) } : {}),
		...(isPositiveNumber(error.n_ctx) ? { contextTokens: Math.floor(error.n_ctx) } : {}),
	};
}

/**
 * The OpenAI-shaped `context_length_exceeded` body returned with HTTP 413, which the runtime treats as a context
 * limit (it compacts and retries). The message is protocol text, not UI. Pure.
 */
export function buildContextLengthExceededBody(overflow: ILocalContextOverflow): LocalModelJsonBody {
	const limit = overflow.contextTokens !== undefined ? ` is ${overflow.contextTokens} tokens` : ' was exceeded';
	const prompt = overflow.promptTokens !== undefined ? ` However, your messages resulted in ${overflow.promptTokens} tokens.` : '';
	return {
		error: {
			message: `This model's maximum context length${limit}.${prompt} Please reduce the length of the messages.`,
			type: 'invalid_request_error',
			param: 'messages',
			code: 'context_length_exceeded',
		},
	};
}

/**
 * The local body for a non-streaming runtime request: it always streams, so the first-output timer bounds only the
 * time to the first token; {@link LocalChatCompletionAssembler} assembles the response.
 */
export function toStreamingLocalRequestBody(body: LocalModelJsonBody): LocalModelJsonBody {
	return { ...body, stream: true, stream_options: { ...(isObject(body.stream_options) ? body.stream_options : {}), include_usage: true } };
}

interface IAssembledToolCall {
	id: string | undefined;
	type: string | undefined;
	name: string;
	arguments: string;
}

interface IAssembledChoice {
	role: string | undefined;
	content: string;
	hasContent: boolean;
	reasoning: string;
	readonly toolCalls: Map<number, IAssembledToolCall>;
	finishReason: unknown;
}

/**
 * Builds one `chat.completion` from a local SSE stream, for runtime requests that asked for a non-streaming response:
 * content and reasoning are concatenated per choice, `tool_calls` merged by `index`, and the last `finish_reason`
 * wins (never invented). Callers must not return it unless {@link terminated} and not {@link failed}.
 */
export class LocalChatCompletionAssembler {

	private readonly _decoder = new TextDecoder();
	private readonly _termination = new LocalStreamTermination();
	private _buffer = '';
	private _id: string | undefined;
	private _created: number | undefined;
	private _model: string | undefined;
	private _systemFingerprint: string | undefined;
	private _usage: LocalModelJsonBody | undefined;
	private readonly _choices = new Map<number, IAssembledChoice>();
	private _failed = false;
	private _done = false;

	constructor(
		private readonly _mode: 'auto' | 'direct',
		private readonly _capiId: string,
	) { }

	/** An error event or an unparsable payload was seen; the completion must not be returned. */
	get failed(): boolean {
		return this._failed;
	}

	/** `[DONE]` was seen. */
	get done(): boolean {
		return this._done;
	}

	/** The stream ended properly (see `LocalStreamTermination`); check after {@link finish}. */
	get terminated(): boolean {
		return this._termination.terminated;
	}

	get outputTokens(): number | undefined {
		return this._usage ? readCompletionTokens({ usage: this._usage }) : undefined;
	}

	push(chunk: Uint8Array): void {
		const text = this._buffer + this._decoder.decode(chunk, { stream: true });
		const lines = text.split('\n');
		this._buffer = lines.pop() ?? '';
		for (const line of lines) {
			this._processLine(line);
		}
	}

	/** Processes any buffered partial line and returns the assembled `chat.completion`. */
	finish(): LocalModelJsonBody {
		const rest = this._buffer + this._decoder.decode();
		this._buffer = '';
		if (rest) {
			this._processLine(rest);
		}
		const reasoningKey = this._mode === 'auto' ? 'reasoning_text' : 'reasoning_content';
		const choices = [...this._choices.entries()].sort(([a], [b]) => a - b).map(([index, choice]) => {
			const toolCalls = [...choice.toolCalls.entries()].sort(([a], [b]) => a - b).map(([callIndex, call]) => ({
				id: call.id ?? `call_${index}_${callIndex}`,
				type: call.type ?? 'function',
				function: { name: call.name, arguments: call.arguments },
			}));
			const message: LocalModelJsonBody = { role: choice.role ?? 'assistant', content: choice.hasContent ? choice.content : (toolCalls.length ? null : '') };
			if (choice.reasoning) {
				message[reasoningKey] = choice.reasoning;
			}
			if (toolCalls.length) {
				message.tool_calls = toolCalls;
			}
			return { index, message, finish_reason: choice.finishReason ?? null };
		});
		const completion: LocalModelJsonBody = {
			id: this._id ?? 'chatcmpl-local',
			object: 'chat.completion',
			created: this._created ?? 0,
			model: this._mode === 'auto' ? this._capiId : (this._model ?? this._capiId),
			choices,
		};
		if (this._systemFingerprint) {
			completion.system_fingerprint = this._systemFingerprint;
		}
		if (this._usage) {
			completion.usage = this._usage;
		}
		return completion;
	}

	private _processLine(rawLine: string): void {
		if (this._failed || this._done) {
			return;
		}
		const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
		if (line.startsWith('error:')) {
			this._failed = true;
			return;
		}
		if (!line.startsWith('data:')) {
			return;
		}
		const payload = line.slice(5).trim();
		if (!payload) {
			return;
		}
		if (payload === '[DONE]') {
			this._done = true;
			this._termination.observeDone();
			return;
		}
		const json = parseJsonObject(payload);
		if (!json || isErrorPayload(json)) {
			this._failed = true;
			return;
		}
		if (isPromptProgressOnly(json)) {
			return;
		}
		this._termination.observePayload(json);
		this._merge(json);
	}

	private _merge(chunk: LocalModelJsonBody): void {
		if (typeof chunk.id === 'string') {
			this._id ??= chunk.id;
		}
		if (typeof chunk.created === 'number') {
			this._created ??= chunk.created;
		}
		if (typeof chunk.model === 'string') {
			this._model ??= chunk.model;
		}
		if (typeof chunk.system_fingerprint === 'string') {
			this._systemFingerprint = chunk.system_fingerprint;
		}
		if (isObject(chunk.usage)) {
			this._usage = chunk.usage;
		}
		if (!Array.isArray(chunk.choices)) {
			return;
		}
		for (const rawChoice of chunk.choices) {
			if (!isObject(rawChoice)) {
				continue;
			}
			const index = typeof rawChoice.index === 'number' ? rawChoice.index : 0;
			let choice = this._choices.get(index);
			if (!choice) {
				choice = { role: undefined, content: '', hasContent: false, reasoning: '', toolCalls: new Map(), finishReason: undefined };
				this._choices.set(index, choice);
			}
			const delta = isObject(rawChoice.delta) ? rawChoice.delta : undefined;
			if (typeof delta?.role === 'string') {
				choice.role = delta.role;
			}
			if (typeof delta?.content === 'string') {
				choice.content += delta.content;
				choice.hasContent = true;
			}
			if (typeof delta?.reasoning_content === 'string') {
				choice.reasoning += delta.reasoning_content;
			}
			if (Array.isArray(delta?.tool_calls)) {
				this._mergeToolCalls(choice, delta.tool_calls);
			}
			if (rawChoice.finish_reason !== undefined && rawChoice.finish_reason !== null) {
				choice.finishReason = rawChoice.finish_reason;
			}
		}
	}

	private _mergeToolCalls(choice: IAssembledChoice, deltas: readonly unknown[]): void {
		deltas.forEach((rawCall, position) => {
			if (!isObject(rawCall)) {
				return;
			}
			const callIndex = typeof rawCall.index === 'number' ? rawCall.index : position;
			let call = choice.toolCalls.get(callIndex);
			if (!call) {
				call = { id: undefined, type: undefined, name: '', arguments: '' };
				choice.toolCalls.set(callIndex, call);
			}
			if (typeof rawCall.id === 'string' && rawCall.id && !call.id) {
				call.id = rawCall.id;
			}
			if (typeof rawCall.type === 'string' && rawCall.type && !call.type) {
				call.type = rawCall.type;
			}
			const fn = isObject(rawCall.function) ? rawCall.function : undefined;
			if (typeof fn?.name === 'string' && fn.name && !call.name) {
				call.name = fn.name;
			}
			if (typeof fn?.arguments === 'string') {
				call.arguments += fn.arguments;
			}
		});
	}
}

/**
 * State of a local SSE stream before the commit point:
 * - `pending`: no output yet;
 * - `committed`: the first non-empty `data:` event was read and parsed;
 * - `empty`: `[DONE]` before any output;
 * - `error`: an error event or an unparsable first payload.
 *
 * Prompt progress events ({@link isPromptProgressOnly}) are not output: they
 * are reported to `onPromptProgress` and the stream stays `pending`.
 */
export type LocalCommitState = 'pending' | 'committed' | 'empty' | 'error';

/** Finds the commit point of a local SSE stream. Line-buffered like {@link LocalSseResponseAdapter}. */
export class SseCommitScanner {

	private readonly _decoder = new TextDecoder();
	private _buffer = '';

	constructor(private readonly _onPromptProgress?: (progress: ILocalPromptProgress) => void) { }

	push(chunk: Uint8Array): LocalCommitState {
		const text = this._buffer + this._decoder.decode(chunk, { stream: true });
		const lines = text.split('\n');
		this._buffer = lines.pop() ?? '';
		return this._scan(lines);
	}

	/** At EOF; an EOF without output is `empty`. */
	end(): LocalCommitState {
		const rest = this._buffer + this._decoder.decode();
		this._buffer = '';
		const state = this._scan([rest]);
		return state === 'pending' ? 'empty' : state;
	}

	private _scan(lines: readonly string[]): LocalCommitState {
		for (const rawLine of lines) {
			const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
			if (line.startsWith('error:')) {
				return 'error';
			}
			if (!line.startsWith('data:')) {
				continue;
			}
			const payload = line.slice(5).trim();
			if (!payload) {
				continue;
			}
			if (payload === '[DONE]') {
				return 'empty';
			}
			const json = parseJsonObject(payload);
			if (json && isPromptProgressOnly(json)) {
				const progress = readLocalPromptProgress(json);
				if (progress) {
					this._onPromptProgress?.(progress);
				}
				continue;
			}
			return json && !isErrorPayload(json) ? 'committed' : 'error';
		}
		return 'pending';
	}
}

// #endregion
