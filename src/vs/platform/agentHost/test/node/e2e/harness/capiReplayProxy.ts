/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A record/replay HTTP proxy for the CAPI (Copilot API) traffic that the agent
 * host's bundled Copilot SDK/CLI produces.
 *
 * It sits in front of an upstream CAPI-speaking server (either the in-repo mock
 * LLM server or, when recording with a real token, real CAPI) and:
 *
 *  - **replay** mode (default): serves recorded responses from the committed
 *    fixture with no upstream contact at all — deterministic and token-free.
 *    The fixture must exist (a missing one throws) and a request with no
 *    recorded response is a strict cache miss that fails the run, so CI can
 *    never silently reach real CAPI.
 *  - **record** mode: forwards every request to the upstream, streams the
 *    response back to the caller, and captures it to the fixture on disk.
 *    Opt-in (`AGENT_HOST_REPLAY_RECORD=1`, including the first pass of
 *    `AGENT_HOST_UPDATE_SNAPSHOTS=1`) since it needs a real token.
 *
 * The proxy is intentionally **wire-agnostic**: it captures and replays the raw
 * response body, so it works identically for the Chat Completions
 * (`/chat/completions`), Responses (`/responses`) and Anthropic Messages
 * (`/v1/messages`) SSE dialects without needing per-dialect adapters.
 *
 * Matching is **sequence-based per `(method, path)`**: the Nth request to a
 * given endpoint replays the Nth recorded response. In replay the agent's
 * behavior is driven entirely by the recorded responses, so the sequence of
 * calls it makes is reproduced exactly — making exact-body matching (which is
 * brittle against volatile fields like dates or request ids) unnecessary. The
 * normalized request body is still stored in the fixture for reviewability.
 */

import type * as http from 'http';
import type * as https from 'https';
import { createRequire } from 'module';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { basename, dirname } from '../../../../../../base/common/path.js';
import { aggregateAnthropicSse, anthropicMessageToSse, ANTHROPIC_MESSAGES_PATH, aggregateResponsesSse, responsesMessageToSse, RESPONSES_PATH, summarizeResponsesRequest, deserializeAnthropicContent, serializeAnthropicContent, summarizeAnthropicRequest, type AnthropicContentBlock, type IAnthropicMessage, type IReadableAnthropicRequest } from './capiWireCodec.js';
import { getAncillaryStub } from './capiStubs.js';
import { findPosixOnlyCommands, formatPosixCommandError, getRecordedShellCommand, type IRecordedCommand } from './posixCommandLint.js';
import { formatModelRequestMismatch, modelRequestsMatch, projectModelRequest } from './modelRequestProjection.js';
import { expandShellToolName, normalizeShellToolNameForCapture } from './shellToolNames.js';
import { scrubUserName, USER_NAME_PLACEHOLDER } from './userNameScrub.js';

// `http`/`https`/`js-yaml` are lazily required (slow to load and/or not in this
// layer's import allowlist); `import type` above still gives us http/https types.
const nodeRequire = createRequire(import.meta.url);
const httpModule = nodeRequire('http') as typeof http;
const httpsModule = nodeRequire('https') as typeof https;
const zlibModule = nodeRequire('zlib') as typeof import('zlib');
const yamlModule = nodeRequire('js-yaml') as { load(input: string): unknown; dump(obj: unknown, opts?: { lineWidth?: number; noRefs?: boolean; quotingType?: '"' | '\''; forceQuotes?: boolean }): string };

/** Model-producing endpoints. Replaying past the recorded count here is a hard
 * cache miss (reusing a stale turn could spin the agent loop forever), whereas
 * idempotent endpoints (`/models`, token) may be safely re-served. */
const MODEL_ENDPOINTS = new Set(['/chat/completions', '/responses', '/v1/messages']);
const STORED_RESPONSE_HEADERS = new Set(['content-type']);

const WORKDIR_PLACEHOLDER = '${workdir}';
const HOMEDIR_PLACEHOLDER = '${homedir}';
const COPIED_PLUGIN_DIR_PLACEHOLDER = '${plugin_copy}';
const COPIED_PLUGIN_DIR_RE = /\$\{homedir\}(?:\/|\\\\)user-data(?:\/|\\\\)agentPlugins(?:\/|\\\\)[^\/\\"]+/g;
const TEMP_DIR_SUFFIX_PLACEHOLDER = '${temp}';
const TEMP_DIR_SUFFIX_RE = /(\$\{workdir\}(?:\/|\\\\)(?:ahp-(?:snapshot|perm-test|plan-test|abort|test|wt-test|subagent-test|subagent-replay|attachment-test|cd-strip-test|coverage-[a-z-]+)-|copilot-(?:cost-report|text-blob)-|read-sdk-simple))[A-Za-z0-9]{6}/g;
const UUID_PLACEHOLDER_RE = /\$\{uuid_\d+\}/g;
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const FILE_LISTING_DATE_RE = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+(?:\d{2}:\d{2}|\d{4})\b/g;

/**
 * Placeholder for the recorder's OS username. It appears in captured tool output
 * (e.g. the owner column of `ls -la`) where it is not part of a path, so
 * `homeDir` normalization misses it — scrub it explicitly to keep local identity
 * out of fixtures.
 */
const USER_PLACEHOLDER = USER_NAME_PLACEHOLDER;
/**
 * Placeholder for the upstream CAPI origin in recorded response bodies. Token /
 * user-discovery responses echo the CAPI host (`endpoints.api`); rewriting that
 * origin to this placeholder — and back to the proxy's own URL on replay —
 * keeps the SDK/agent host pointed at the proxy rather than at a real (or mock)
 * host on replay.
 */
const CAPI_PLACEHOLDER = '${capi}';
/**
 * Redacts short-lived credentials from recorded response bodies so fixtures
 * carry no secrets. The GitHub bearer token lives only in request headers
 * (never stored); the one response-side secret is the minted Copilot session
 * token returned by `/copilot_internal/v2/token` (and `session_token` from the
 * auto-model endpoint).
 */
const SECRET_PLACEHOLDER = '${redacted}';
const SECRET_FIELD_RE = /("(?:token|session_token)"\s*:\s*)"[^"]*"/g;

/**
 * Scrub the echoed system prompt out of recorded response bodies. The OpenAI
 * Responses API (`/responses`, used by Codex) echoes the full request
 * `instructions` (the system prompt) back inside `response.created` /
 * `in_progress` / `completed` events; replace it with a placeholder so the
 * large prompt (and any tenant-specific content in it) never lands in fixtures.
 */
const SYSTEM_FIELD_RE = /("instructions"\s*:\s*)"(?:[^"\\]|\\.)*"/g;
const SYSTEM_PROMPT_PLACEHOLDER = '${system}';

/** GitHub-API path prefixes (routed to the GitHub upstream, not CAPI). */
const GITHUB_API_PREFIXES = ['/copilot_internal', '/telemetry', '/copilot/mcp_registry'];

export type CapiReplayMode = 'record' | 'replay';

export interface ICapiReplayResponse {
	readonly status: number;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
}

interface IRecordedExchange {
	readonly method: string;
	readonly path: string;
	/** Normalized request body, stored for human review of fixture diffs. */
	readonly requestBody: string;
	readonly response: ICapiReplayResponse;
}

/** Wire dialect the fixture's model turns were captured in. Drives SSE
 * regeneration on replay and the `(method, path)` the turns replay under. */
type TurnDialect = 'anthropic' | 'responses';

/** The `(method, path)` each dialect's turns are recorded/replayed under.
 * `method` is always POST and `path` is fixed per dialect, so neither is stored
 * per exchange — the fixture carries a single top-level `dialect` instead. */
const DIALECT_ENDPOINT: Readonly<Record<TurnDialect, { readonly method: string; readonly path: string }>> = {
	anthropic: { method: 'POST', path: ANTHROPIC_MESSAGES_PATH },
	responses: { method: 'POST', path: RESPONSES_PATH },
};

/**
 * The stored form of an assistant reply. Content is a bare string for a lone
 * text reply, or an explicit block list for richer (tool-calling) replies.
 */
interface IStoredAnthropicMessage {
	readonly content: string | AnthropicContentBlock[];
	readonly stopReason: string | null;
}

/**
 * A model turn in the YAML fixture: a readable request summary + the captured
 * assistant reply. On replay the reply is regenerated into the fixture
 * dialect's SSE stream, so captures stay human-readable instead of raw SSE
 * blobs. The endpoint is derived from the fixture-level `dialect`, so it is not
 * repeated here.
 */
interface ITurnExchange {
	readonly request: IReadableAnthropicRequest;
	readonly response: IStoredAnthropicMessage;
}

/**
 * A raw ancillary exchange served verbatim on replay. Carries its own
 * `(method, path)` since it is not tied to the fixture dialect. Not produced by
 * the current recorder — model turns cover every captured exchange — but the
 * loader still honours it if a fixture contains one.
 */
interface IRawFixtureExchange {
	readonly method: string;
	readonly path: string;
	readonly response: ICapiReplayResponse;
}

type IFixtureExchange = ITurnExchange | IRawFixtureExchange;

interface IFixture {
	readonly version: 1;
	/** Dialect shared by every turn exchange; omitted when there are no turns. */
	readonly dialect?: TurnDialect;
	readonly exchanges: IFixtureExchange[];
}

function isTurnExchange(exchange: IFixtureExchange): exchange is ITurnExchange {
	return (exchange as ITurnExchange).request !== undefined;
}

export interface ICapiReplayProxyOptions {
	/** Absolute path to the JSON fixture for this test. */
	readonly fixturePath: string;
	/**
	 * Single upstream base URL to forward all traffic to while recording (e.g.
	 * a mock server). Use {@link githubUpstreamUrl}/{@link capiUpstreamUrl}
	 * instead to split GitHub-API vs CAPI traffic across two real hosts.
	 */
	readonly upstreamUrl?: string;
	/** Real GitHub-API base for `/copilot_internal/*` while recording (e.g. `https://api.github.com`). */
	readonly githubUpstreamUrl?: string;
	/** Real CAPI base for model/`/models` traffic while recording (e.g. `https://api.githubcopilot.com`). */
	readonly capiUpstreamUrl?: string;
	/** Recording/replay behavior. Defaults to `replay`. */
	readonly mode?: CapiReplayMode;
	/** Absolute working directory to normalize out of request bodies. */
	readonly workDir?: string;
	/** Absolute home directory to normalize out of request bodies. */
	readonly homeDir?: string;
	/** OS username to normalize out of recorded bodies (e.g. `ls -la` owner columns). */
	readonly userName?: string;
	/**
	 * Fail (throw from {@link stop}) if any request missed the cache while
	 * replaying. Defaults to true. Ignored while recording.
	 */
	readonly strict?: boolean;
	/**
	 * Skip the POSIX-only shell command check when writing a fixture.
	 *
	 * Only for a scenario that genuinely cannot be portable — the test must also
	 * be scoped to a platform explicitly at its call site, with the reason
	 * stated there. See `posixCommandLint.ts`.
	 */
	readonly allowPosixCommands?: boolean;

	/**
	 * Skip comparing the live model request against the recorded one.
	 *
	 * Only for a capture that cannot be refreshed; see
	 * `STALE_RECORDED_REQUEST_EXCEPTIONS` in `agentHostE2ETestHarness.ts`.
	 */
	readonly allowStaleRecordedRequest?: boolean;
}

/** A replayable item: raw bytes (ancillary) or a model reply to regenerate. */
type IReplayItem =
	| { readonly kind: 'raw'; readonly response: ICapiReplayResponse }
	| { readonly kind: 'turn'; readonly dialect: TurnDialect; readonly message: IAnthropicMessage; readonly request: IReadableAnthropicRequest };

/** Sequence cursor for one `(method, path)` bucket during replay. */
interface IReplayBucket {
	readonly items: IReplayItem[];
	index: number;
}

export class CapiReplayProxy {
	private _server: http.Server | undefined;
	private _url: string | undefined;
	private _stopped = false;

	private readonly _mode: CapiReplayMode;
	private readonly _strict: boolean;
	private readonly _isReplaying: boolean;

	/** Buckets used for replay, keyed by `${method} ${path}`. */
	private readonly _replayBuckets = new Map<string, IReplayBucket>();
	/** Exchanges captured during recording, in arrival order. */
	private readonly _recorded: IRecordedExchange[] = [];
	private readonly _observedModelRequestBodies: string[] = [];
	private readonly _cacheMisses: string[] = [];
	private readonly _requestMismatches: string[] = [];
	private readonly _replayPlaceholderValues = new Map<string, string>();
	private _modelTurnCount = 0;
	private _workingDirectory: string | undefined;
	private _recordingModelResponse: ICapiReplayResponse | undefined;

	/**
	 * Fixture currently being replayed. Mutable so a single long-lived proxy can
	 * be re-pointed at a new per-test fixture via {@link resetForReplay} without
	 * restarting (the URL the agent host was pointed at stays fixed). Recording
	 * always uses the fixture the proxy was constructed with.
	 */
	private _fixturePath: string;

	/**
	 * Whether the current fixture's recorded request may disagree with the live
	 * one. Per-test like {@link _fixturePath}, since a shared replay proxy
	 * serves every test in the suite.
	 */
	private _allowStaleRecordedRequest: boolean;

	constructor(private readonly _options: ICapiReplayProxyOptions) {
		this._allowStaleRecordedRequest = _options.allowStaleRecordedRequest ?? false;
		this._fixturePath = _options.fixturePath;
		this._workingDirectory = _options.workDir;
		const fixtureExists = existsSync(this._fixturePath);
		this._mode = _options.mode ?? 'replay';
		this._strict = _options.strict ?? true;

		if (this._mode === 'replay' && !fixtureExists) {
			throw new Error(`[capi-replay] replay mode requires a fixture but none exists at ${this._fixturePath}`);
		}

		// Replay is read-only (never contacts the upstream); recording is the
		// only mode that proxies real traffic. This keeps CI from ever reaching
		// real CAPI: a missing fixture throws above rather than silently recording.
		this._isReplaying = this._mode === 'replay';
		if (this._isReplaying) {
			this._loadFixture();
		}
	}

	/** Base URL the agent host should be pointed at. Available after {@link start}. */
	get url(): string {
		if (!this._url) {
			throw new Error('[capi-replay] proxy not started');
		}
		return this._url;
	}

	get isReplaying(): boolean {
		return this._isReplaying;
	}

	async start(): Promise<string> {
		this._server = httpModule.createServer((req, res) => this._handle(req, res));
		return new Promise((resolve, reject) => {
			this._server!.on('error', reject);
			this._server!.listen(0, '127.0.0.1', () => {
				const addr = this._server!.address();
				if (addr && typeof addr === 'object') {
					this._url = `http://127.0.0.1:${addr.port}`;
					resolve(this._url);
				} else {
					reject(new Error('[capi-replay] failed to determine proxy address'));
				}
			});
		});
	}

	/**
	 * Stop the proxy. When recording, flushes captured exchanges to the fixture.
	 * When replaying in strict mode, throws if any request missed the cache.
	 */
	async stop(): Promise<void> {
		if (this._stopped) {
			return;
		}
		this._stopped = true;
		await this._closeSocket();

		if (this._isReplaying) {
			this.assertNoReplayMismatches();
			return;
		}

		// Always write a fixture when recording, even with zero model turns:
		// tests that only touch stubbed ancillary endpoints (e.g. listModels)
		// need a committed fixture so replay serves stubs instead of trying to
		// self-heal against real CAPI.
		this._writeFixture();
	}

	/**
	 * Re-point a long-lived replay proxy at a different per-test fixture without
	 * restarting the HTTP server (so the URL the agent host was pointed at stays
	 * valid). Clears the previous fixture's replay buckets and cache-miss log.
	 * Replay-only: recording keeps one fixture per proxy.
	 */
	resetForReplay(fixturePath: string, allowStaleRecordedRequest = false): void {
		if (!this._isReplaying) {
			throw new Error('[capi-replay] resetForReplay is only valid in replay mode');
		}
		if (!existsSync(fixturePath)) {
			throw new Error(`[capi-replay] replay mode requires a fixture but none exists at ${fixturePath}`);
		}
		this._fixturePath = fixturePath;
		this._allowStaleRecordedRequest = allowStaleRecordedRequest;
		this._workingDirectory = undefined;
		this._replayBuckets.clear();
		this._observedModelRequestBodies.length = 0;
		this._cacheMisses.length = 0;
		this._requestMismatches.length = 0;
		this._replayPlaceholderValues.clear();
		this._modelTurnCount = 0;
		this._loadFixture();
	}

	setWorkingDirectory(workingDirectory: string): void {
		this._workingDirectory = workingDirectory;
	}

	setRecordingModelResponse(response: ICapiReplayResponse): void {
		if (this._isReplaying) {
			throw new Error('[capi-replay] setRecordingModelResponse is only valid in record mode');
		}
		this._recordingModelResponse = response;
	}

	get observedModelRequestBodies(): readonly string[] {
		return this._observedModelRequestBodies;
	}

	/**
	 * Surface strict replay failures — unrecorded requests and requests that do
	 * not match the recorded one — without stopping the proxy. Lets a shared
	 * replay server verify each test's traffic in `teardown` while keeping the
	 * server (and the agent host's cached SDK client) alive for the next test.
	 */
	assertNoReplayMismatches(): void {
		const error = this._createReplayError();
		if (error) {
			throw error;
		}
	}

	/** Returns and consumes the current replay failure so it can be surfaced at the original test failure. */
	takeReplayError(): Error | undefined {
		const error = this._createReplayError();
		this._cacheMisses.length = 0;
		this._requestMismatches.length = 0;
		return error;
	}

	private _createReplayError(): Error | undefined {
		if (!this._isReplaying || !this._strict) {
			return undefined;
		}
		const sections: string[] = [];
		if (this._cacheMisses.length > 0) {
			sections.push(`[capi-replay] ${this._cacheMisses.length} cache miss(es):\n${this._cacheMisses.join('\n')}`);
		}
		if (this._requestMismatches.length > 0) {
			sections.push(`[capi-replay] ${this._requestMismatches.length} model request mismatch(es):\n${this._requestMismatches.join('\n')}`);
		}
		const unconsumed = Array.from(this._replayBuckets.entries())
			.flatMap(([key, bucket]) => bucket.index < bucket.items.length ? [`${key}: ${bucket.items.length - bucket.index} response(s)`] : []);
		if (unconsumed.length > 0) {
			sections.push(`[capi-replay] unconsumed recorded responses:\n${unconsumed.join('\n')}`);
		}
		return sections.length > 0 ? new Error(sections.join('\n\n')) : undefined;
	}

	/**
	 * Close the HTTP server socket without running the strict replay checks or
	 * writing a fixture. Used to tear down a shared replay proxy after per-test
	 * verification has already happened via {@link assertNoReplayMismatches}.
	 */
	async close(): Promise<void> {
		if (this._stopped) {
			return;
		}
		this._stopped = true;
		await this._closeSocket();
	}

	private async _closeSocket(): Promise<void> {
		const server = this._server;
		this._server = undefined;
		if (server) {
			// Force-drop any lingering sockets (e.g. an in-flight upstream
			// request left open by an aborted turn) so `close` resolves instead
			// of hanging until the connection drains.
			await new Promise<void>(resolve => {
				server.close(() => resolve());
				server.closeAllConnections?.();
			});
		}
	}

	// -- request handling -----------------------------------------------------

	private _handle(req: http.IncomingMessage, res: http.ServerResponse): void {
		const chunks: Buffer[] = [];
		req.on('data', chunk => chunks.push(chunk));
		req.on('end', () => {
			const body = Buffer.concat(chunks).toString('utf8');
			if (this._isReplaying) {
				this._replay(req, body, res);
			} else {
				this._record(req, body, res);
			}
		});
		req.on('error', () => this._fail(res, 'request stream error'));
	}

	private _replay(req: http.IncomingMessage, body: string, res: http.ServerResponse): void {
		const method = req.method ?? 'GET';
		const path = new URL(req.url ?? '/', 'http://localhost').pathname;

		// Ancillary bootstrap endpoints are never recorded — serve them from
		// hardcoded stubs (keeps identity/model-catalog out of fixtures).
		const stub = getAncillaryStub(method, path, body);
		if (stub) {
			res.writeHead(stub.status, { ...stub.headers });
			res.end(replaceAll(stub.body, CAPI_PLACEHOLDER, this.url));
			return;
		}

		const key = `${method} ${path}`;
		if (MODEL_ENDPOINTS.has(path)) {
			this._observedModelRequestBodies.push(this._normalize(body));
		}
		const bucket = this._replayBuckets.get(key);

		let item: IReplayItem | undefined;
		if (bucket) {
			if (bucket.index < bucket.items.length) {
				item = bucket.items[bucket.index++];
			} else if (!MODEL_ENDPOINTS.has(path)) {
				// Idempotent endpoint called more often than recorded — re-serve
				// the last recorded item rather than failing.
				item = bucket.items[bucket.items.length - 1];
			}
		}

		if (!item) {
			this._cacheMisses.push(`${key} (call #${(bucket?.index ?? 0) + 1}) — no recorded response`);
			this._fail(res, `no recorded response for ${key}`);
			return;
		}

		if (item.kind === 'turn') {
			this._assertRecordedRequest(item.dialect, item.request, body);
			// Regenerate the dialect's SSE stream from the captured reply.
			const message = this._expandReplayMessage(item.message);
			const sseBody = item.dialect === 'responses' ? responsesMessageToSse(message) : anthropicMessageToSse(message);
			res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
			res.end(sseBody);
			return;
		}

		const headers = { ...item.response.headers };
		// Let Node recompute framing for the exact recorded body.
		delete headers['content-length'];
		delete headers['transfer-encoding'];
		res.writeHead(item.response.status, headers);
		res.end(this._expandReplayPlaceholders(item.response.body));
	}

	/**
	 * Compare the live request against the one recorded for this turn.
	 *
	 * Both sides go through the same summarizer and the same projection, so the
	 * committed `request:` block becomes the expectation without its stored
	 * shape having to change.
	 */
	private _assertRecordedRequest(dialect: TurnDialect, recorded: IReadableAnthropicRequest, body: string): void {
		const turnIndex = this._modelTurnCount++;
		const summarize = dialect === 'responses' ? summarizeResponsesRequest : summarizeAnthropicRequest;
		const normalizedBody = this._normalize(body);
		const observed = summarize(normalizedBody);
		if (!observed) {
			return;
		}
		captureReplayPlaceholderValues(recorded, observed, this._replayPlaceholderValues);
		if (this._allowStaleRecordedRequest) {
			return;
		}
		const normalizedObserved = summarize(this._normalizeReplayPlaceholderValues(normalizedBody));
		if (!normalizedObserved) {
			return;
		}
		const expected = projectModelRequest(recorded);
		const actual = projectModelRequest(normalizedObserved);
		if (!modelRequestsMatch(expected, actual)) {
			this._requestMismatches.push(formatModelRequestMismatch(turnIndex, expected, actual));
		}
	}

	private _normalizeReplayPlaceholderValues(text: string): string {
		let result = text;
		for (const [placeholder, value] of this._replayPlaceholderValues) {
			result = replaceAll(result, value, placeholder);
		}
		return result;
	}

	private _record(req: http.IncomingMessage, body: string, res: http.ServerResponse): void {
		const method = req.method ?? 'GET';
		const path = new URL(req.url ?? '/', 'http://localhost').pathname;
		const stub = getAncillaryStub(method, path, body);
		if (stub) {
			res.writeHead(stub.status, { ...stub.headers });
			res.end(replaceAll(stub.body, CAPI_PLACEHOLDER, this.url));
			return;
		}
		if (MODEL_ENDPOINTS.has(path)) {
			this._observedModelRequestBodies.push(this._normalize(body));
		}
		if (MODEL_ENDPOINTS.has(path) && this._recordingModelResponse) {
			const response = this._recordingModelResponse;
			res.writeHead(response.status, response.headers);
			res.end(response.body);
			this._recorded.push({
				method,
				path,
				requestBody: this._normalize(body),
				response: {
					...response,
					headers: filterRecordedResponseHeaders(response.headers),
					body: this._normalize(response.body),
				},
			});
			return;
		}
		const upstreamBase = this._upstreamFor(path);
		const upstream = new URL(req.url ?? '/', upstreamBase);
		const isHttps = upstream.protocol === 'https:';
		const transport = isHttps ? httpsModule : httpModule;

		const forwardHeaders = { ...req.headers };
		forwardHeaders.host = upstream.host;
		delete forwardHeaders['connection'];
		delete forwardHeaders['content-length'];

		const upstreamReq = transport.request(
			{
				hostname: upstream.hostname,
				port: upstream.port || (isHttps ? 443 : 80),
				path: upstream.pathname + upstream.search,
				method,
				headers: forwardHeaders,
			},
			upstreamRes => {
				const respChunks: Buffer[] = [];
				const status = upstreamRes.statusCode ?? 502;
				const headers = flattenHeaders(upstreamRes.headers);
				res.writeHead(status, headers);
				upstreamRes.on('data', chunk => {
					respChunks.push(chunk);
					res.write(chunk);
				});
				upstreamRes.on('end', () => {
					res.end();
					// Ancillary bootstrap endpoints are forwarded (so the live run
					// works) but never stored — they are served from stubs on replay.
					if (getAncillaryStub(method, path, body)) {
						return;
					}
					// Decompress so stored bodies are readable text and the model
					// filters / codecs can parse them. The live client already
					// received the original (compressed) chunks above.
					const decoded = decodeBody(Buffer.concat(respChunks), headers['content-encoding']);
					const storedHeaders = filterRecordedResponseHeaders(headers);
					// Rewrite the CAPI origin to a placeholder (so replay re-points
					// discovery at the proxy), normalize local paths, and redact
					// response-side secrets.
					const capiOrigin = new URL(this._capiUpstream).origin;
					const normalizedBody = this._normalize(replaceAll(decoded, capiOrigin, CAPI_PLACEHOLDER))
						.replace(SECRET_FIELD_RE, `$1"${SECRET_PLACEHOLDER}"`)
						.replace(SYSTEM_FIELD_RE, `$1"${SYSTEM_PROMPT_PLACEHOLDER}"`);
					this._recorded.push({
						method,
						path,
						requestBody: this._normalize(body),
						response: { status, headers: storedHeaders, body: normalizedBody },
					});
				});
			},
		);
		upstreamReq.on('error', err => this._fail(res, `upstream error: ${err instanceof Error ? err.message : String(err)}`));
		if (body) {
			upstreamReq.write(body);
		}
		upstreamReq.end();
	}

	/** GitHub-API paths go to the GitHub upstream; everything else to CAPI. */
	private _upstreamFor(path: string): string {
		if (GITHUB_API_PREFIXES.some(prefix => path.startsWith(prefix))) {
			return this._githubUpstream;
		}
		return this._capiUpstream;
	}

	private get _capiUpstream(): string {
		const url = this._options.capiUpstreamUrl ?? this._options.upstreamUrl;
		if (!url) {
			throw new Error('[capi-replay] no CAPI upstream configured (set capiUpstreamUrl or upstreamUrl)');
		}
		return url;
	}

	private get _githubUpstream(): string {
		const url = this._options.githubUpstreamUrl ?? this._options.upstreamUrl;
		if (!url) {
			throw new Error('[capi-replay] no GitHub upstream configured (set githubUpstreamUrl or upstreamUrl)');
		}
		return url;
	}

	private _fail(res: http.ServerResponse, message: string): void {
		if (!res.headersSent) {
			// `x-should-retry: false` mirrors the CLI proxy so the SDK does not
			// hammer a missing fixture with retries.
			res.writeHead(500, { 'content-type': 'text/plain', 'x-should-retry': 'false' });
		}
		res.end(`[capi-replay] ${message}`);
	}

	// -- fixture I/O ----------------------------------------------------------

	private _loadFixture(): void {
		const fixture = yamlModule.load(readFileSync(this._fixturePath, 'utf8')) as IFixture;
		const turnEndpoint = fixture.dialect ? DIALECT_ENDPOINT[fixture.dialect] : undefined;
		for (const exchange of fixture.exchanges) {
			let key: string;
			let item: IReplayItem;
			if (isTurnExchange(exchange)) {
				if (!turnEndpoint) {
					throw new Error(`[capi-replay] fixture has turn exchanges but no top-level dialect: ${this._fixturePath}`);
				}
				key = `${turnEndpoint.method} ${turnEndpoint.path}`;
				item = { kind: 'turn', dialect: fixture.dialect!, message: { content: deserializeAnthropicContent(exchange.response.content), stopReason: exchange.response.stopReason }, request: exchange.request };
			} else {
				key = `${exchange.method} ${exchange.path}`;
				item = { kind: 'raw', response: exchange.response };
			}
			let bucket = this._replayBuckets.get(key);
			if (!bucket) {
				bucket = { items: [], index: 0 };
				this._replayBuckets.set(key, bucket);
			}
			bucket.items.push(item);
		}
	}

	private _writeFixture(): void {
		const built = this._recorded.map(exchange => this._toFixtureExchange(exchange));
		const exchanges = built.map(b => b.exchange);
		this._normalizeToolCallIds(exchanges);
		this._normalizeUuids(exchanges);
		this._assertNoPosixOnlyCommands(exchanges);
		// Every turn in a fixture shares one endpoint, so the dialect (and the
		// `(method, path)` it implies) is stored once at the top instead of on each
		// exchange.
		const dialect = built.find(b => b.dialect !== undefined)?.dialect;
		const fixture: IFixture = { version: 1, ...(dialect ? { dialect } : {}), exchanges };
		mkdirSync(dirname(this._fixturePath), { recursive: true });
		writeFileSync(this._fixturePath, yamlModule.dump(fixture, { lineWidth: -1, noRefs: true }));
	}

	/**
	 * Reject a recording whose shell commands cannot run on Windows.
	 *
	 * Only the assistant's `tool_use` blocks matter: those are what replay feeds
	 * back to the agent, so they are the commands that will actually be executed
	 * on whatever platform the test later runs on. The `tool_result` blocks
	 * echoed in request summaries are never read back.
	 *
	 * Throws before the file is written so a rejected recording cannot leave a
	 * half-portable fixture behind.
	 */
	private _assertNoPosixOnlyCommands(exchanges: IFixtureExchange[]): void {
		if (this._options.allowPosixCommands) {
			return;
		}
		const commands: IRecordedCommand[] = [];
		for (const exchange of exchanges) {
			if (!isTurnExchange(exchange)) {
				continue;
			}
			for (const block of deserializeAnthropicContent(exchange.response.content)) {
				if (block.type !== 'tool_use') {
					continue;
				}
				const command = getRecordedShellCommand(block.input as { command?: unknown; cmd?: unknown } | undefined);
				if (command) {
					commands.push({ command, toolName: block.name });
				}
			}
		}
		const findings = findPosixOnlyCommands(commands);
		if (findings.length > 0) {
			throw new Error(formatPosixCommandError(this._fixturePath, findings));
		}
	}

	/**
	 * Replace the backend's opaque tool-call ids with stable, readable ordinals
	 * (`toolcall_0`, `toolcall_1`, ...) across the whole fixture. Assistant
	 * `tool_use` blocks define the ordering; the `tool_result` blocks that refer
	 * back to them in later requests reuse the same mapping. Keeps captures
	 * deterministic across re-records and easy to follow.
	 */
	private _normalizeToolCallIds(exchanges: IFixtureExchange[]): void {
		const idMap = new Map<string, string>();
		const mapId = (id: string): string => {
			let mapped = idMap.get(id);
			if (mapped === undefined) {
				mapped = `toolcall_${idMap.size}`;
				idMap.set(id, mapped);
			}
			return mapped;
		};
		// First pass: assistant tool_use ids (in reply order) seed the mapping.
		for (const exchange of exchanges) {
			if (!isTurnExchange(exchange) || !Array.isArray(exchange.response.content)) {
				continue;
			}
			for (const block of exchange.response.content) {
				const b = block as { type?: string; id?: string };
				if (b.type === 'tool_use' && typeof b.id === 'string' && b.id) {
					b.id = mapId(b.id);
				}
			}
		}
		// Second pass: tool_result references in requests reuse the same ids.
		for (const exchange of exchanges) {
			if (!isTurnExchange(exchange)) {
				continue;
			}
			for (const message of exchange.request.messages) {
				const content = (message as { content?: unknown }).content;
				if (!Array.isArray(content)) {
					continue;
				}
				for (const block of content) {
					const b = block as { type?: string; tool_use_id?: string };
					if (b.type === 'tool_result' && typeof b.tool_use_id === 'string' && b.tool_use_id) {
						b.tool_use_id = mapId(b.tool_use_id);
					}
				}
			}
		}
	}

	/**
	 * Replace ephemeral UUIDs (shell ids, session-state ids, ...) that appear in
	 * captured request/response content with stable ordinal placeholders
	 * (`${uuid_0}`, `${uuid_1}`, ...). They change on every re-record, so
	 * normalizing them keeps committed fixtures diff-clean. Distinct UUIDs get
	 * distinct placeholders; repeats of the same UUID reuse its placeholder.
	 */
	private _normalizeUuids(exchanges: IFixtureExchange[]): void {
		const idMap = new Map<string, string>();
		const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
		const mapUuid = (uuid: string): string => {
			let mapped = idMap.get(uuid);
			if (mapped === undefined) {
				mapped = `\${uuid_${idMap.size}}`;
				idMap.set(uuid, mapped);
			}
			return mapped;
		};
		const walk = (value: unknown): unknown => {
			if (typeof value === 'string') {
				return value.replace(uuidRe, mapUuid);
			}
			if (Array.isArray(value)) {
				for (let i = 0; i < value.length; i++) {
					value[i] = walk(value[i]);
				}
				return value;
			}
			if (value && typeof value === 'object') {
				const obj = value as Record<string, unknown>;
				for (const key of Object.keys(obj)) {
					obj[key] = walk(obj[key]);
				}
				return value;
			}
			return value;
		};
		for (const exchange of exchanges) {
			walk(exchange);
		}
	}

	/**
	 * Convert a raw recorded exchange into its fixture form: model-endpoint calls
	 * become readable turns (parsed request + regeneratable reply) tagged with
	 * their dialect (hoisted to the fixture level by {@link _writeFixture});
	 * everything else stays raw.
	 */
	private _toFixtureExchange(exchange: IRecordedExchange): { exchange: IFixtureExchange; dialect?: TurnDialect } {
		if (exchange.method === 'POST' && exchange.path === ANTHROPIC_MESSAGES_PATH) {
			const request = summarizeAnthropicRequest(exchange.requestBody);
			const message = aggregateAnthropicSse(exchange.response.body);
			if (request && message) {
				const content = this._normalizeMessageContent(message.content);
				return { exchange: { request, response: { content: serializeAnthropicContent(content), stopReason: message.stopReason } }, dialect: 'anthropic' };
			}
		}
		if (exchange.method === 'POST' && exchange.path === RESPONSES_PATH) {
			const request = summarizeResponsesRequest(exchange.requestBody);
			const message = aggregateResponsesSse(exchange.response.body);
			if (request && message) {
				const content = this._normalizeMessageContent(message.content);
				return { exchange: { request, response: { content: serializeAnthropicContent(content), stopReason: message.stopReason } }, dialect: 'responses' };
			}
		}
		return { exchange: { method: exchange.method, path: exchange.path, response: exchange.response } };
	}

	/**
	 * Normalize local paths out of an aggregated assistant reply. Tool-input JSON
	 * streams split across many SSE deltas, so a string replace on the raw body
	 * can miss a path straddling a chunk boundary; normalizing the reassembled
	 * content (text + tool inputs) is reliable.
	 */
	private _normalizeMessageContent(content: AnthropicContentBlock[]): AnthropicContentBlock[] {
		return content.map((block): AnthropicContentBlock => {
			if (block.type === 'text') {
				return { type: 'text', text: this._normalize(block.text) };
			}
			let input = block.input;
			try {
				input = JSON.parse(this._normalize(JSON.stringify(block.input ?? {})));
			} catch {
				// non-serializable input; keep as-is
			}
			return { type: 'tool_use', id: block.id, name: normalizeShellToolNameForCapture(block.name), input };
		});
	}

	private _normalize(text: string): string {
		let result = text;
		if (this._workingDirectory) {
			const workDirs = new Set([this._workingDirectory]);
			try {
				workDirs.add(realpathSync.native(this._workingDirectory));
			} catch {
				// The recording work directory can disappear during teardown.
			}
			for (const workDir of [...workDirs].sort((a, b) => b.length - a.length)) {
				result = replaceAll(result, escapeJsonString(workDir), WORKDIR_PLACEHOLDER);
				result = replaceAll(result, workDir, WORKDIR_PLACEHOLDER);
			}
		}
		if (this._options.homeDir) {
			result = replaceAll(result, escapeJsonString(this._options.homeDir), HOMEDIR_PLACEHOLDER);
			result = replaceAll(result, this._options.homeDir, HOMEDIR_PLACEHOLDER);
		}
		if (this._options.userName) {
			result = scrubUserName(result, this._options.userName);
		}
		result = result.replace(COPIED_PLUGIN_DIR_RE, `${HOMEDIR_PLACEHOLDER}/user-data/agentPlugins/${COPIED_PLUGIN_DIR_PLACEHOLDER}`);
		result = result.replace(TEMP_DIR_SUFFIX_RE, `$1${TEMP_DIR_SUFFIX_PLACEHOLDER}`);
		result = replaceAll(result, `/private${WORKDIR_PLACEHOLDER}`, WORKDIR_PLACEHOLDER);
		result = result.replace(FILE_LISTING_DATE_RE, '${timestamp}');
		return result;
	}

	private _expandReplayMessage(message: IAnthropicMessage): IAnthropicMessage {
		return {
			...message,
			content: message.content.map(block => {
				if (block.type === 'text') {
					return { ...block, text: this._expandReplayPlaceholders(block.text) };
				}
				if (block.type === 'tool_use') {
					return { ...block, name: expandShellToolName(block.name), input: this._expandReplayValue(block.input) };
				}
				// Any future block kind passes through untouched rather than being
				// rewritten as if it were a tool call.
				return block;
			}),
		};
	}

	private _expandReplayValue(value: unknown): unknown {
		if (typeof value === 'string') {
			return this._expandReplayPlaceholders(value);
		}
		if (Array.isArray(value)) {
			return value.map(item => this._expandReplayValue(item));
		}
		if (value && typeof value === 'object') {
			const result: Record<string, unknown> = {};
			for (const [key, item] of Object.entries(value)) {
				result[key] = this._expandReplayValue(item);
			}
			return result;
		}
		return value;
	}

	private _expandReplayPlaceholders(text: string): string {
		let result = replaceAll(text, CAPI_PLACEHOLDER, this.url);
		if (this._workingDirectory) {
			const workspaceName = basename(this._workingDirectory);
			const suffix = /-(?<suffix>[A-Za-z0-9]{6})$/.exec(workspaceName)?.groups?.suffix;
			let canonicalWorkingDirectory = this._workingDirectory;
			try {
				canonicalWorkingDirectory = realpathSync.native(this._workingDirectory);
			} catch {
				// The replay working directory can disappear during teardown.
			}
			if (suffix) {
				const workspaceStem = workspaceName.slice(0, -suffix.length);
				const normalizedWorkspaceName = `${workspaceStem}${TEMP_DIR_SUFFIX_PLACEHOLDER}`;
				const legacyWorkspacePlaceholder = `${WORKDIR_PLACEHOLDER}/${normalizedWorkspaceName}`;
				result = replaceAll(result, `/private${legacyWorkspacePlaceholder}`, canonicalWorkingDirectory);
				result = replaceAll(result, legacyWorkspacePlaceholder, this._workingDirectory);
				result = result.replace(
					new RegExp(`(?:\\/private)?${escapeRegExpCharacters(WORKDIR_PLACEHOLDER)}\\/${escapeRegExpCharacters(workspaceStem)}[A-Za-z0-9]{6}`, 'g'),
					match => match.startsWith('/private') ? canonicalWorkingDirectory : this._workingDirectory!,
				);
			}
			result = replaceAll(result, `/private${WORKDIR_PLACEHOLDER}`, canonicalWorkingDirectory);
			result = replaceAll(result, WORKDIR_PLACEHOLDER, this._workingDirectory);
			if (suffix) {
				result = replaceAll(result, TEMP_DIR_SUFFIX_PLACEHOLDER, suffix);
			}
		}
		if (this._options.homeDir) {
			result = replaceAll(result, HOMEDIR_PLACEHOLDER, this._options.homeDir);
		}
		if (this._options.userName) {
			result = replaceAll(result, USER_PLACEHOLDER, this._options.userName);
		}
		for (const [placeholder, value] of this._replayPlaceholderValues) {
			result = replaceAll(result, placeholder, value);
		}
		return result;
	}
}

function captureReplayPlaceholderValues(recorded: unknown, observed: unknown, values: Map<string, string>): void {
	if (typeof recorded === 'string' && typeof observed === 'string') {
		captureReplayPlaceholderValuesFromString(recorded, observed, values);
		return;
	}
	if (Array.isArray(recorded) && Array.isArray(observed)) {
		for (let index = 0; index < Math.min(recorded.length, observed.length); index++) {
			captureReplayPlaceholderValues(recorded[index], observed[index], values);
		}
		return;
	}
	if (!isRecord(recorded) || !isRecord(observed)) {
		return;
	}
	for (const [key, value] of Object.entries(recorded)) {
		captureReplayPlaceholderValues(value, observed[key], values);
	}
}

function captureReplayPlaceholderValuesFromString(recorded: string, observed: string, values: Map<string, string>): void {
	const placeholders: string[] = [];
	let pattern = '^';
	let offset = 0;
	for (const match of recorded.matchAll(UUID_PLACEHOLDER_RE)) {
		pattern += escapeRegExpCharacters(recorded.slice(offset, match.index));
		pattern += `(${UUID_PATTERN})`;
		placeholders.push(match[0]);
		offset = match.index + match[0].length;
	}
	if (placeholders.length === 0) {
		return;
	}
	pattern += `${escapeRegExpCharacters(recorded.slice(offset))}$`;
	const match = new RegExp(pattern, 'i').exec(observed);
	if (!match) {
		return;
	}
	const captured = new Map<string, string>();
	for (let index = 0; index < placeholders.length; index++) {
		const placeholder = placeholders[index];
		const value = match[index + 1];
		if ((captured.has(placeholder) && captured.get(placeholder) !== value)
			|| (values.has(placeholder) && values.get(placeholder) !== value)) {
			return;
		}
		captured.set(placeholder, value);
	}
	for (const [placeholder, value] of captured) {
		values.set(placeholder, value);
	}
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function replaceAll(text: string, search: string, replacement: string): string {
	if (!search) {
		return text;
	}
	return text.split(search).join(replacement);
}

function escapeJsonString(value: string): string {
	return JSON.stringify(value).slice(1, -1);
}

function escapeRegExpCharacters(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Decompress a response body per its `content-encoding` into a UTF-8 string. */
function decodeBody(buffer: Buffer, encoding: string | undefined): string {
	try {
		// Normalize header casing/whitespace (e.g. `GZIP`, ` gzip `) before matching.
		switch (encoding?.trim().toLowerCase()) {
			case 'gzip': return zlibModule.gunzipSync(buffer).toString('utf8');
			case 'br': return zlibModule.brotliDecompressSync(buffer).toString('utf8');
			case 'deflate': return zlibModule.inflateSync(buffer).toString('utf8');
			default: return buffer.toString('utf8');
		}
	} catch {
		// Not actually compressed / unknown encoding — fall back to raw text.
		return buffer.toString('utf8');
	}
}

function flattenHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		if (value === undefined) {
			continue;
		}
		result[key] = Array.isArray(value) ? value.join(', ') : value;
	}
	return result;
}

function filterRecordedResponseHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
	return Object.fromEntries(Object.entries(headers).filter(([key]) => STORED_RESPONSE_HEADERS.has(key.toLowerCase())));
}
