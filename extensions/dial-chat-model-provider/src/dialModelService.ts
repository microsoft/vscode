import * as vscode from 'vscode';
import { createHash } from 'crypto';
import { DialClient } from './dialClient';
import { type CredentialStore } from './credentialStore';
import {
	filterByRequiredTopics,
	logTopicFilterDiagnostics,
	modelIdsSignature,
	partitionByKind,
	summarizeModelPipeline,
	topicsEqual,
} from './deploymentFilter';
import { dialLog } from './logger';
import { summarizeAccessToken, summarizeAccessTokenClaims } from './jwtUtils';
import {
	flattenRequestMessageText,
	toDialMessages,
	toOpenAITools,
	toToolChoice,
} from './messageConversion';
import { isTokenizeUnavailableError, isRetryableTokenizeError } from './tokenization';
import { abortError, isAbortError } from './cancel';
import { retryWithBackoff } from './retry';
import { applyReasoningEffort } from './reasoningEffort';
import { reportStreamUsage } from './usageReporting';
import {
	type Credential,
	type DialChatRequest,
	type DialConfig,
	type DialDeployment,
	type Nullable,
	type OpenAIStreamUsage,
} from './types';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
/** Refetch when the picker opens if the cached listing is older than this. */
const PICKER_STALE_MS = 60_000;
/** Upper bound on cached token counts; the IDE re-counts every message each turn. */
const TOKENIZE_CACHE_MAX = 1000;

export interface ModelListChange {
	readonly kind: 'chat' | 'embedding';
	readonly models: readonly DialDeployment[];
	readonly added: readonly string[];
	readonly removed: readonly string[];
}

export interface DialModelServiceOptions {
	/** When false, skips silent restore fetches and the periodic refresh timer (used in VS Code test runs). */
	readonly backgroundSync?: boolean;
}

/**
 * Reactive model service.
 *
 * Constructor is synchronous — subscribes to {@link CredentialStore.onDidChange}.
 * When credentials arrive → fetches deployments from DIAL and emits
 * {@link onDidChangeModels}. Also refreshes models on a periodic timer.
 */
export class DialModelService implements vscode.Disposable {
	private readonly _onDidChangeModels = new vscode.EventEmitter<ModelListChange>();
	readonly onDidChangeModels = this._onDidChangeModels.event;

	private readonly _onDidChangeEmbeddingModels = new vscode.EventEmitter<ModelListChange>();
	readonly onDidChangeEmbeddingModels = this._onDidChangeEmbeddingModels.event;

	private client: Nullable<DialClient>;
	private _sourceModels: readonly DialDeployment[] = [];
	private _chatModels: readonly DialDeployment[] = [];
	private _embeddingModels: readonly DialDeployment[] = [];
	private lastFetchCompletedAt = 0;
	private timer: Nullable<ReturnType<typeof setInterval>>;
	private fetchInFlight: Nullable<Promise<void>>;
	private readonly subs: vscode.Disposable[] = [];
	private readonly credentialStore: CredentialStore;
	private config: DialConfig;
	private readonly backgroundSync: boolean;
	/** Deployments whose tokenize endpoint is missing (HTTP 404) — fail fast for the session. */
	private readonly tokenizeUnavailable = new Set<string>();
	/** Deployments for which a successful tokenize call has already been logged once. */
	private readonly tokenizeLogged = new Set<string>();
	/** Bounded cache of token counts keyed by deployment + content hash (counts are deterministic). */
	private readonly tokenizeCache = new Map<string, number>();
	/** In-flight tokenize calls keyed by cache key — coalesce concurrent identical requests. */
	private readonly tokenizeInFlight = new Map<string, Promise<number>>();

	constructor(
		credentialStore: CredentialStore,
		config: DialConfig,
		options?: DialModelServiceOptions,
	) {
		this.credentialStore = credentialStore;
		this.config = config;
		this.backgroundSync = options?.backgroundSync !== false;
		this.subs.push(credentialStore.onDidChange((c) => this.onCredential(c)));
	}

	/** Current chat deployments for the language model picker (empty until auth succeeds). */
	get models(): readonly DialDeployment[] {
		return this._chatModels;
	}

	/** Current embedding deployments for {@link vscode.lm.registerEmbeddingsProvider}. */
	get embeddingModels(): readonly DialDeployment[] {
		return this._embeddingModels;
	}

	/** Underlying DIAL HTTP client when authenticated. */
	getDialClient(): Nullable<DialClient> {
		return this.client;
	}

	/**
	 * Apply updated workspace settings without a full window reload.
	 * Topic filter changes reprocess the cached listing immediately; server/auth changes refetch.
	 */
	updateConfig(next: DialConfig): void {
		const topicsChanged = !topicsEqual(this.config.requiredTopics, next.requiredTopics);
		const serverChanged =
			this.config.serverUrl !== next.serverUrl || this.config.authMethod !== next.authMethod;
		this.config = next;

		if (serverChanged) {
			const cred = this.credentialStore.current;
			if (cred) {
				this.client = new DialClient(this.config, cred.token);
				void this.fetchModels();
			}
			return;
		}

		if (topicsChanged) {
			if (this._sourceModels.length > 0) {
				this.applyCachedModels();
			} else if (this.client) {
				void this.fetchModels();
			}
		}
	}

	/** Waits for the current model fetch (starting one if needed), then returns the count. */
	async awaitModelUpdate(timeoutMs = 15_000): Promise<number> {
		await Promise.race([
			this.fetchModels(),
			new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
		]);
		return this._chatModels.length;
	}

	async streamChat(
		deploymentId: string,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
	): Promise<void> {
		const client = this.client;
		if (!client) {
			const msg = 'DIAL: not authenticated — run "DIAL: Login" first';
			dialLog.error(msg);
			throw new Error(msg);
		}

		const accessToken = await this.credentialStore.ensureValidToken();
		client.updateAuthToken(accessToken);

		if (this.config.authMethod === 'openid') {
			dialLog.info(
				`streamChat auth id=${deploymentId}`,
				summarizeAccessToken(accessToken),
				summarizeAccessTokenClaims(accessToken),
			);
		}

		let deployment: Nullable<DialDeployment> = this._chatModels.find((m) => m.id === deploymentId);
		if (!deployment) {
			try {
				deployment = await client.getDeployment(deploymentId);
				dialLog.info(`Fetched deployment metadata for ${deploymentId}`);
			} catch (e: unknown) {
				const detail = e instanceof Error ? e.message : String(e);
				dialLog.warn(`Could not fetch deployment metadata for ${deploymentId}: ${detail}`);
			}
		}

		const tools = toOpenAITools(options.tools);
		const hasTools = (tools?.length ?? 0) > 0;
		const toolChoice = toToolChoice(options.toolMode, hasTools);
		let resolvedForMessages: DialDeployment;
		if (deployment) {
			resolvedForMessages = deployment;
		} else {
			dialLog.warn(
				`Deployment metadata unavailable for ${deploymentId}; ` +
					'attachments will be rejected (only text will be forwarded).',
			);
			resolvedForMessages = { id: deploymentId, model: deploymentId };
		}
		const baseRequest: DialChatRequest = {
			messages: toDialMessages(messages, resolvedForMessages),
			...(tools !== undefined ? { tools } : {}),
			...(toolChoice !== undefined ? { tool_choice: toolChoice } : {}),
		};
		const { request, diagnostic: reasoningDiagnostic } = applyReasoningEffort(
			baseRequest,
			deployment,
			options,
		);

		dialLog.info(`streamChat start id=${deploymentId}`, {
			messageCount: request.messages.length,
			toolCount: request.tools?.length ?? 0,
			reasoning: reasoningDiagnostic,
		});

		const abort = new AbortController();
		const cancelSub = token.onCancellationRequested(() => {
			dialLog.info(`streamChat cancel requested id=${deploymentId}`);
			abort.abort();
		});
		let lastUsage: OpenAIStreamUsage | undefined;
		try {
			await client.streamChatCompletion(
				deploymentId,
				request,
				{
					onText: (chunk) => progress.report(new vscode.LanguageModelTextPart(chunk)),
					onToolCall: (callId, name, input) =>
						progress.report(new vscode.LanguageModelToolCallPart(callId, name, input)),
					onUsage: (usage) => {
						lastUsage = usage;
					},
				},
				deployment,
				{ signal: abort.signal },
			);
			if (lastUsage) {
				reportStreamUsage(progress, lastUsage);
				dialLog.info(`streamChat usage reported id=${deploymentId}`, {
					prompt_tokens: lastUsage.prompt_tokens,
					completion_tokens: lastUsage.completion_tokens,
					total_tokens: lastUsage.total_tokens,
					budget_maxInputTokens: deployment?.maxInputTokens,
					budget_maxOutputTokens: deployment?.maxOutputTokens,
				});
			} else {
				dialLog.warn(
					`streamChat finished without usage id=${deploymentId} — Chat context counters will stay at 0. ` +
						'Check upstream supports stream_options.include_usage on the final SSE chunk.',
					{
						stream_options: { include_usage: true },
						budget_maxInputTokens: deployment?.maxInputTokens,
						budget_maxOutputTokens: deployment?.maxOutputTokens,
					},
				);
			}
		} catch (e: unknown) {
			if (isAbortError(e)) {
				dialLog.info(`streamChat cancelled id=${deploymentId}`);
				throw e;
			}
			const detail = e instanceof Error ? e.message : String(e);
			dialLog.error(`streamChat failed id=${deploymentId}`, detail);
			throw new Error(appendDialSessionHint(detail));
		} finally {
			cancelSub.dispose();
		}
	}

	/**
	 * Count tokens for a string or single chat message via the DIAL tokenize endpoint.
	 *
	 * Results are served from a SHA-1 content cache. Uncached calls hit the API once
	 * (concurrent identical inputs share one in-flight request) and retry transient
	 * failures with exponential backoff (`dial.httpRetry*` settings).
	 */
	async countTokens(
		deploymentId: string,
		text: string | vscode.LanguageModelChatRequestMessage,
		token: vscode.CancellationToken,
	): Promise<number> {
		if (token.isCancellationRequested) {
			throw abortError('Token count cancelled');
		}

		const input = typeof text === 'string' ? text : flattenRequestMessageText(text);
		if (input.length === 0) {
			return 0;
		}

		if (!this.config.useServerTokenization) {
			throw new Error(
				'DIAL: server tokenization is disabled — set dial.useServerTokenization to true',
			);
		}

		const client = this.client;
		if (!client) {
			throw new Error('DIAL: not authenticated — run "DIAL: Login" first');
		}

		if (this.tokenizeUnavailable.has(deploymentId)) {
			throw new Error(`DIAL: tokenize endpoint unavailable for ${deploymentId}`);
		}

		const cacheKey = this.tokenizeCacheKey(deploymentId, input);
		const cached = this.tokenizeCache.get(cacheKey);
		if (cached !== undefined) {
			return cached;
		}

		const inflight = this.tokenizeInFlight.get(cacheKey);
		if (inflight) {
			return inflight;
		}

		const work = this.fetchTokenCount(deploymentId, input, cacheKey, client, token);
		this.tokenizeInFlight.set(cacheKey, work);
		try {
			return await work;
		} finally {
			this.tokenizeInFlight.delete(cacheKey);
		}
	}

	private async fetchTokenCount(
		deploymentId: string,
		input: string,
		cacheKey: string,
		client: DialClient,
		token: vscode.CancellationToken,
	): Promise<number> {
		const abort = new AbortController();
		const cancelSub = token.onCancellationRequested(() => abort.abort());

		try {
			return await retryWithBackoff(
				async () => {
					if (token.isCancellationRequested) {
						throw abortError('Token count cancelled');
					}
					const accessToken = await this.credentialStore.ensureValidToken();
					client.updateAuthToken(accessToken);
					const results = await client.tokenize(deploymentId, [input], {
						signal: abort.signal,
					});
					const result = results[0];
					if (result?.error) {
						throw new Error(`Tokenize error: ${result.error}`);
					}
					if (result?.tokenCount === undefined) {
						throw new Error('Tokenize response missing token_count');
					}
					this.cacheTokenCount(cacheKey, result.tokenCount);
					if (!this.tokenizeLogged.has(deploymentId)) {
						this.tokenizeLogged.add(deploymentId);
						dialLog.info(`Tokenize endpoint active for ${deploymentId}`);
					}
					return result.tokenCount;
				},
				{
					...this.config.httpRetry,
					signal: abort.signal,
					isRetryable: isRetryableTokenizeError,
					onRetry: (attempt, delayMs, detail) => {
						dialLog.warn(
							`Tokenize retry ${deploymentId} attempt=${attempt}/${this.config.httpRetry.maxAttempts} delayMs=${delayMs}`,
							detail,
						);
					},
				},
			);
		} catch (e: unknown) {
			const detail = e instanceof Error ? e.message : String(e);
			if (isTokenizeUnavailableError(detail)) {
				this.tokenizeUnavailable.add(deploymentId);
				dialLog.warn(`Tokenize endpoint unavailable for ${deploymentId}`, detail);
			}
			dialLog.error(`Tokenize failed for ${deploymentId}`, detail);
			throw e instanceof Error ? e : new Error(detail);
		} finally {
			cancelSub.dispose();
		}
	}

	private tokenizeCacheKey(deploymentId: string, input: string): string {
		const hash = createHash('sha1').update(input).digest('base64');
		return `${deploymentId}\u0000${hash}`;
	}

	private cacheTokenCount(key: string, count: number): void {
		this.tokenizeCache.set(key, count);
		if (this.tokenizeCache.size > TOKENIZE_CACHE_MAX) {
			const oldest = this.tokenizeCache.keys().next().value;
			if (oldest !== undefined) {
				this.tokenizeCache.delete(oldest);
			}
		}
	}

	dispose(): void {
		this.stopTimer();
		this._onDidChangeModels.dispose();
		this._onDidChangeEmbeddingModels.dispose();
		for (const d of this.subs) {
			d.dispose();
		}
	}

	// ── Private ──────────────────────────────────────────────

	private onCredential(cred: Nullable<Credential>): void {
		this.stopTimer();

		if (!cred || !this.config.serverUrl) {
			dialLog.info(
				'Model service: credentials cleared or serverUrl missing',
				`hasCred=${Boolean(cred)}`,
				`serverUrl=${this.config.serverUrl || '(empty)'}`,
			);
			this.client = undefined;
			this._sourceModels = [];
			this.lastFetchCompletedAt = 0;
			this.publishModelList('chat', [], this._chatModels.map((m) => m.id));
			this.publishModelList('embedding', [], this._embeddingModels.map((m) => m.id));
			return;
		}

		dialLog.info(
			'Model service: credentials received — fetching deployments',
			`authMethod=${cred.method}`,
			`serverUrl=${this.config.serverUrl}`,
		);
		this.client = new DialClient(this.config, cred.token);
		if (!this.backgroundSync) {
			return;
		}
		void this.fetchModels();
		this.startTimer();
	}

	private fetchModels(): Promise<void> {
		if (!this.backgroundSync) {
			return Promise.resolve();
		}
		const client = this.client;
		if (!client) {
			dialLog.warn('Model fetch skipped — DialClient not initialized');
			return Promise.resolve();
		}

		if (this.fetchInFlight) {
			return this.fetchInFlight;
		}

		const run = this.runFetchModels(client);
		this.fetchInFlight = run;
		return run.finally(() => {
			if (this.fetchInFlight === run) {
				this.fetchInFlight = undefined;
			}
		});
	}

	private async runFetchModels(client: DialClient): Promise<void> {
		dialLog.info('Model fetch started');
		const previousChatIds = this._chatModels.map((m) => m.id);
		const previousEmbeddingIds = this._embeddingModels.map((m) => m.id);
		try {
			const token = await this.credentialStore.ensureValidToken();
			client.updateAuthToken(token);

			const allModels = await client.getModels();
			this._sourceModels = allModels;
			this.lastFetchCompletedAt = Date.now();
			this.applyCachedModels();
		} catch (e: unknown) {
			const detail = e instanceof Error ? e.message : String(e);
			dialLog.error('Model fetch failed', detail);
			if (isDialSessionExpired(detail) || isDialAuthFailure(detail)) {
				if (isDialAuthFailure(detail)) {
					await this.credentialStore.invalidateSession();
				}
				this.publishModelList('chat', [], previousChatIds);
				this.publishModelList('embedding', [], previousEmbeddingIds);
			} else {
				this.publishModelList('chat', this._chatModels, previousChatIds);
				this.publishModelList('embedding', this._embeddingModels, previousEmbeddingIds);
			}
		}
	}

	/** Start or refresh deployment fetch when the picker needs an up-to-date list. */
	ensureModelsLoaded(): void {
		if (!this.backgroundSync) {
			return;
		}
		if (!this.credentialStore.current || !this.client) {
			return;
		}
		if (this._sourceModels.length === 0) {
			void this.fetchModels();
			return;
		}
		if (Date.now() - this.lastFetchCompletedAt >= PICKER_STALE_MS) {
			void this.fetchModels();
		}
	}

	private applyCachedModels(): void {
		const previousChatIds = this._chatModels.map((m) => m.id);
		const previousEmbeddingIds = this._embeddingModels.map((m) => m.id);
		const requiredTopics = this.config.requiredTopics ?? [];
		const filtered = filterByRequiredTopics(this._sourceModels, requiredTopics);
		const partitioned = partitionByKind(filtered);
		dialLog.info(
			summarizeModelPipeline(this._sourceModels.length, filtered.length, partitioned),
		);
		logTopicFilterDiagnostics(this._sourceModels, requiredTopics, filtered, partitioned);

		this.publishModelList('chat', partitioned.chat, previousChatIds, { forceNotify: true });
		this.publishModelList('embedding', partitioned.embedding, previousEmbeddingIds, {
			forceNotify: true,
		});

		dialLog.info(
			`Chat models: ${partitioned.chat.length > 0 ? partitioned.chat.map((m) => m.id).join(', ') : '(none)'}`,
		);
		dialLog.info(
			`Embedding models: ${partitioned.embedding.length > 0 ? partitioned.embedding.map((m) => m.id).join(', ') : '(none)'}`,
		);
	}

	private publishModelList(
		kind: ModelListChange['kind'],
		models: readonly DialDeployment[],
		previousIds: readonly string[],
		options: { readonly forceNotify?: boolean } = {},
	): void {
		const previousSet = new Set(previousIds);
		const nextSet = new Set(models.map((m) => m.id));
		const added = models.filter((m) => !previousSet.has(m.id)).map((m) => m.id);
		const removed = previousIds.filter((id) => !nextSet.has(id));
		const portfolioChanged =
			modelIdsSignature(models) !== [...previousIds].sort().join(',') ||
			added.length > 0 ||
			removed.length > 0 ||
			models.length !== previousIds.length;

		if (kind === 'chat') {
			this._chatModels = models;
		} else {
			this._embeddingModels = models;
		}

		const emitter =
			kind === 'chat' ? this._onDidChangeModels : this._onDidChangeEmbeddingModels;

		const shouldNotifyPicker =
			options.forceNotify === true || portfolioChanged || previousIds.length === 0;
		if (!shouldNotifyPicker) {
			dialLog.info(`Model fetch (${kind}) — list unchanged, skipping refresh`);
			return;
		}

		if (portfolioChanged) {
			dialLog.info(
				`Model list changed (${kind})`,
				added.length > 0 ? `added=${added.join(', ')}` : '',
				removed.length > 0 ? `removed=${removed.join(', ')}` : '',
			);
		} else {
			dialLog.info(
				`Model fetch (${kind}) — refresh (${models.length} deployment(s), unchanged IDs)`,
			);
		}

		emitter.fire({ kind, models, added, removed });
	}

	private startTimer(): void {
		this.timer = setInterval(() => {
			void this.fetchModels();
		}, REFRESH_INTERVAL_MS);
	}

	private stopTimer(): void {
		if (this.timer !== undefined) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}
}

function isDialSessionExpired(detail: string): boolean {
	return detail.includes('DIAL session expired');
}

function isDialAuthFailure(detail: string): boolean {
	const lower = detail.toLowerCase();
	return lower.includes('http 401') || lower.includes('unknown api key');
}

function appendDialSessionHint(detail: string): string {
	if (isDialAuthFailure(detail) || detail.includes('user bucket')) {
		return `${detail} — try "DIAL: Login" to refresh your session`;
	}
	return detail;
}
