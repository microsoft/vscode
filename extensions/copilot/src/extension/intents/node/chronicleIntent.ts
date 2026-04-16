/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ICopilotTokenManager } from '../../../platform/authentication/common/copilotTokenManager';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { type SessionRow, type RefRow, ISessionStore } from '../../../platform/chronicle/common/sessionStore';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { IGitService } from '../../../platform/git/common/gitService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelChatMessage } from '../../../vscodeTypes';
import { type AnnotatedRef, type AnnotatedSession, type SessionFileInfo, type SessionTurnInfo, SESSIONS_QUERY_SQLITE, buildRefsQuery, buildFilesQuery, buildTurnsQuery, buildStandupPrompt } from '../../chronicle/common/standupPrompt';
import { SessionIndexingPreference } from '../../chronicle/common/sessionIndexingPreference';
import { CloudSessionStoreClient } from '../../chronicle/node/cloudSessionStoreClient';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IToolsService } from '../../tools/common/toolsService';
import { ToolName } from '../../tools/common/toolNames';
import { Conversation } from '../../prompt/common/conversation';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { ChatTelemetryBuilder } from '../../prompt/node/chatParticipantTelemetry';
import { IDocumentContext } from '../../prompt/node/documentContext';
import { DefaultIntentRequestHandler } from '../../prompt/node/defaultIntentRequestHandler';
import { IIntent, IIntentInvocation, IIntentInvocationContext, IIntentSlashCommandInfo, IntentLinkificationOptions } from '../../prompt/node/intents';
import { PromptRenderer, RendererIntentInvocation } from '../../prompts/node/base/promptRenderer';
import { ChroniclePrompt } from '../../prompts/node/panel/chroniclePrompt';

/** Cloud SQL dialect sessions query. */
const SESSIONS_QUERY_CLOUD = `SELECT id, summary, branch, repository, cwd, created_at, updated_at
	FROM sessions
	WHERE updated_at >= now() - INTERVAL '1 day'
	ORDER BY updated_at DESC
	LIMIT 50`;

const SUBCOMMANDS = ['standup', 'tips', 'improve'] as const;
type ChronicleSubcommand = typeof SUBCOMMANDS[number];

export class ChronicleIntent implements IIntent {

	static readonly ID = 'chronicle';
	readonly id = ChronicleIntent.ID;
	readonly description = l10n.t('Session history tools and insights (standup, tips, improve)');
	get locations(): ChatLocation[] {
		return this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.SessionSearchLocalIndexEnabled, this._expService) ? [ChatLocation.Panel] : [];
	}

	readonly commandInfo: IIntentSlashCommandInfo = {
		allowsEmptyArgs: true,
	};

	constructor(
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@ISessionStore private readonly _sessionStore: ISessionStore,
		@ICopilotTokenManager private readonly _tokenManager: ICopilotTokenManager,
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@IGitService _gitService: IGitService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@IFetcherService private readonly _fetcherService: IFetcherService,
	) {
		this._indexingPreference = new SessionIndexingPreference(this._configService);
	}

	private readonly _indexingPreference: SessionIndexingPreference;

	/** Stashed system prompt for tool-calling subcommands (tips, free-form). */
	private _pendingSystemPrompt: string | undefined;

	async handleRequest(
		conversation: Conversation,
		request: vscode.ChatRequest,
		stream: vscode.ChatResponseStream,
		token: CancellationToken,
		documentContext: IDocumentContext | undefined,
		_agentName: string,
		location: ChatLocation,
		chatTelemetry: ChatTelemetryBuilder,
	): Promise<vscode.ChatResult> {
		if (!this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.SessionSearchLocalIndexEnabled, this._expService)) {
			stream.markdown(l10n.t('Session search is not available yet.'));
			return {};
		}

		// Route by command name (e.g. 'chronicle:standup') or fall back to parsing the prompt
		const { subcommand, rest } = this._resolveSubcommand(request);

		switch (subcommand) {
			case 'standup':
				return this._handleStandup(rest, stream, request, token);
			case 'tips':
				return this._handleTips(rest, stream, request, token, conversation, documentContext, location, chatTelemetry);
			case 'improve':
				stream.markdown(l10n.t('`/chronicle {0}` is not yet implemented. Try `/chronicle:standup` or `/chronicle:tips`.', subcommand));
				return {};
			default:
				return this._handleFreeForm(request.prompt ?? '', stream, request, token, conversation, documentContext, location, chatTelemetry);
		}
	}

	/**
	 * Resolve the subcommand from the request command (e.g. 'chronicle:standup')
	 * or fall back to parsing the prompt text for backwards compatibility.
	 */
	private _resolveSubcommand(request: vscode.ChatRequest): { subcommand: ChronicleSubcommand | string; rest: string | undefined } {
		// Prefer explicit command routing (e.g. /chronicle:standup)
		if (request.command) {
			const colonIdx = request.command.indexOf(':');
			if (colonIdx !== -1) {
				return {
					subcommand: request.command.slice(colonIdx + 1).toLowerCase(),
					rest: request.prompt?.trim() || undefined,
				};
			}
		}

		// Fall back to parsing the prompt (for bare /chronicle or /chronicle standup)
		const trimmed = request.prompt?.trim() ?? '';
		if (!trimmed) {
			return { subcommand: 'standup', rest: undefined };
		}
		const spaceIdx = trimmed.indexOf(' ');
		if (spaceIdx === -1) {
			return { subcommand: trimmed.toLowerCase(), rest: undefined };
		}
		return {
			subcommand: trimmed.slice(0, spaceIdx).toLowerCase(),
			rest: trimmed.slice(spaceIdx + 1).trim() || undefined,
		};
	}

	private async _handleStandup(
		extra: string | undefined,
		stream: vscode.ChatResponseStream,
		request: vscode.ChatRequest,
		token: CancellationToken,
	): Promise<vscode.ChatResult> {
		// Always query local SQLite (has current machine's sessions)
		const localSessions = this._queryLocalStore();

		// Query cloud if user has cloud consent for any repo
		let cloudSessions: { sessions: AnnotatedSession[]; refs: AnnotatedRef[] } = { sessions: [], refs: [] };
		if (this._indexingPreference.hasCloudConsent()) {
			cloudSessions = await this._queryCloudStore();
		}

		// Merge and dedup by session ID (cloud wins on conflict since it has cross-machine data)
		const seenIds = new Set<string>();
		const sessions: AnnotatedSession[] = [];
		const refs: AnnotatedRef[] = [];

		// Add cloud sessions first (higher priority)
		for (const s of cloudSessions.sessions) {
			if (!seenIds.has(s.id)) {
				seenIds.add(s.id);
				sessions.push(s);
			}
		}
		// Add local sessions not already in cloud
		for (const s of localSessions.sessions) {
			if (!seenIds.has(s.id)) {
				seenIds.add(s.id);
				sessions.push(s);
			}
		}
		// Merge refs (dedup by session_id + ref_type + ref_value)
		const seenRefs = new Set<string>();
		for (const r of [...cloudSessions.refs, ...localSessions.refs]) {
			const key = `${r.session_id}:${r.ref_type}:${r.ref_value}`;
			if (!seenRefs.has(key)) {
				seenRefs.add(key);
				refs.push(r);
			}
		}

		// Sort by updated_at descending, cap to 20
		sessions.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
		const capped = sessions.slice(0, 20);
		const cappedIds = new Set(capped.map(s => s.id));
		const cappedRefs = refs.filter(r => cappedIds.has(r.session_id));

		// Fetch turns and files for capped sessions (local only — lightweight detail)
		let cappedTurns: SessionTurnInfo[] = [];
		let cappedFiles: SessionFileInfo[] = [];
		if (capped.length > 0) {
			const ids = capped.map(s => s.id);
			try {
				cappedTurns = this._sessionStore.executeReadOnlyFallback(buildTurnsQuery(ids)) as unknown as SessionTurnInfo[];
			} catch { /* non-fatal */ }
			try {
				cappedFiles = this._sessionStore.executeReadOnlyFallback(buildFilesQuery(ids)) as unknown as SessionFileInfo[];
			} catch { /* non-fatal */ }
		}

		const standupPrompt = buildStandupPrompt(capped, cappedRefs, cappedTurns, cappedFiles, extra);

		if (capped.length === 0) {
			stream.markdown(l10n.t('No sessions found. There\'s nothing to report for a standup.'));
			return {};
		}

		const localCount = capped.filter(s => s.source !== 'cloud').length;
		const cloudCount = capped.filter(s => s.source === 'cloud').length;

		this._sendTelemetry('standup', localCount, cloudCount);

		if (cloudCount > 0 && localCount > 0) {
			stream.progress(l10n.t('Generating standup from {0} cloud and {1} local session(s)...', cloudCount, localCount));
		} else if (cloudCount > 0) {
			stream.progress(l10n.t('Generating standup from {0} cloud session(s)...', cloudCount));
		} else {
			stream.progress(l10n.t('Generating standup from {0} local session(s)...', localCount));
		}

		const model = request.model;
		const messages = [
			LanguageModelChatMessage.User(standupPrompt),
		];

		try {
			const response = await model.sendRequest(messages, {}, token);

			for await (const part of response.text) {
				stream.markdown(part);
			}
		} catch (err) {
			stream.markdown(l10n.t('Failed to generate standup. Please try again.'));
		}

		return {};
	}

	private async _handleTips(
		extra: string | undefined,
		stream: vscode.ChatResponseStream,
		request: vscode.ChatRequest,
		token: CancellationToken,
		conversation: Conversation,
		documentContext: IDocumentContext | undefined,
		location: ChatLocation,
		chatTelemetry: ChatTelemetryBuilder,
	): Promise<vscode.ChatResult> {
		const hasCloud = this._indexingPreference.hasCloudConsent();
		const schema = this._getSchemaDescription(hasCloud);

		let prompt = `You have access to the session_store_sql tool that can execute read-only SQL queries against the user's Copilot session database.

Your task: Analyze the user's Copilot usage patterns and provide personalized recommendations.

Database schema:

${schema}

Instructions:
1. IMMEDIATELY call the session_store_sql tool to query sessions from the last 7 days. Do not explain what you will do first.
2. After getting results, make additional queries for tool usage, prompting patterns, and session durations.
3. Based on the data, provide 3-5 specific, actionable tips grounded in actual usage data.
4. Consider VS Code features like inline chat, @workspace, agent mode, custom instructions, and prompt files.
5. Only one query per call — do not combine multiple statements with semicolons.
6. Always use LIMIT (max 50) in your queries and prefer aggregations (COUNT, GROUP BY) over raw row dumps.`;

		if (extra) {
			prompt += `\n\nThe user is especially interested in: ${extra}`;
		}

		this._pendingSystemPrompt = prompt;
		this._sendTelemetry('tips', 0, 0);
		return this._delegateToToolCallingHandler(conversation, request, stream, token, documentContext, location, chatTelemetry);
	}

	private async _handleFreeForm(
		userQuery: string,
		stream: vscode.ChatResponseStream,
		request: vscode.ChatRequest,
		token: CancellationToken,
		conversation: Conversation,
		documentContext: IDocumentContext | undefined,
		location: ChatLocation,
		chatTelemetry: ChatTelemetryBuilder,
	): Promise<vscode.ChatResult> {
		const hasCloud = this._indexingPreference.hasCloudConsent();
		const schema = this._getSchemaDescription(hasCloud);

		this._pendingSystemPrompt = `The user is asking about their Copilot session history. Use the session_store_sql tool to query the data and answer their question.

${schema}

User's question: ${userQuery}

Use the session_store_sql tool to run queries. Start with a broad query, then drill down as needed.
- Only SELECT queries are allowed
- Only one query per call — do not combine multiple statements with semicolons
- Always use LIMIT (max 50) and prefer aggregations (COUNT, GROUP BY) over raw row dumps
- Present results in a clear, readable format with markdown tables or bullet points`;

		this._sendTelemetry('freeform', 0, 0);
		return this._delegateToToolCallingHandler(conversation, request, stream, token, documentContext, location, chatTelemetry);
	}

	private async _delegateToToolCallingHandler(
		conversation: Conversation,
		request: vscode.ChatRequest,
		stream: vscode.ChatResponseStream,
		token: CancellationToken,
		documentContext: IDocumentContext | undefined,
		location: ChatLocation,
		chatTelemetry: ChatTelemetryBuilder,
	): Promise<vscode.ChatResult> {
		const handler = this._instantiationService.createInstance(
			DefaultIntentRequestHandler,
			this,
			conversation,
			request,
			stream,
			token,
			documentContext,
			location,
			chatTelemetry,
			{ maxToolCallIterations: 8, temperature: 0, confirmOnMaxToolIterations: false },
			undefined,
		);
		return handler.getResult();
	}

	private _sendTelemetry(subcommand: string, localSessionCount: number, cloudSessionCount: number): void {
		const hasCloudConsent = this._indexingPreference.hasCloudConsent();
		const querySource = hasCloudConsent ? (localSessionCount > 0 ? 'both' : 'cloud') : 'local';
		/* __GDPR__
"chronicle" : {
"owner": "vijayu",
"comment": "Tracks chronicle subcommand usage, data sources, and query failures",
"subcommand": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chronicle subcommand: standup, tips, or freeform." },
"querySource": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The data source used: local, cloud, both, or cloudRefs." },
"error": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "Truncated error message." },
"localSessionCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of local sessions used." },
"cloudSessionCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of cloud sessions used." },
"totalSessionCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total sessions used." }
}
*/
		this._telemetryService.sendMSFTTelemetryEvent('chronicle', {
			subcommand,
			querySource,
		}, {
			localSessionCount,
			cloudSessionCount,
			totalSessionCount: localSessionCount + cloudSessionCount,
		});
	}

	private _getSchemaDescription(hasCloud: boolean): string {
		return hasCloud
			? `Available tables (cloud SQL syntax):
- **sessions**: id, repository, branch, summary, created_at, updated_at (TIMESTAMP). NOTE: cwd is always NULL in the cloud.
- **turns**: session_id, turn_index, user_message, assistant_response, timestamp (TIMESTAMP)
- **session_files**: session_id, file_path, tool_name, turn_index
- **session_refs**: session_id, ref_type (commit/pr/issue), ref_value, turn_index

Use \`now() - INTERVAL '1 day'\` for date math, \`ILIKE\` for text search.`
			: `Available tables (SQLite syntax — local):
- **sessions**: id, cwd, repository, branch, summary, created_at, updated_at
- **turns**: session_id, turn_index, user_message, assistant_response, timestamp
- **session_files**: session_id, file_path, tool_name, turn_index
- **session_refs**: session_id, ref_type (commit/pr/issue), ref_value, turn_index
- **search_index**: FTS5 table. Use \`WHERE search_index MATCH 'query'\`

Use \`datetime('now', '-1 day')\` for date math.`;
	}

	/**
	 * Query the local SQLite session store for sessions and refs.
	 */
	private _queryLocalStore(): { sessions: AnnotatedSession[]; refs: AnnotatedRef[] } {
		try {
			// Use fallback (no authorizer) since these are known-safe SELECT queries
			const rawSessions = this._sessionStore.executeReadOnlyFallback(SESSIONS_QUERY_SQLITE) as unknown as SessionRow[];
			const sessions: AnnotatedSession[] = rawSessions.map(s => ({ ...s, source: 'vscode' as const }));

			let refs: AnnotatedRef[] = [];
			if (sessions.length > 0) {
				const ids = sessions.map(s => s.id);
				const rawRefs = this._sessionStore.executeReadOnlyFallback(buildRefsQuery(ids)) as unknown as RefRow[];
				refs = rawRefs.map(r => ({ ...r, source: 'vscode' as const }));
			}

			return { sessions, refs };
		} catch (err) {

			this._telemetryService.sendMSFTTelemetryErrorEvent('chronicle', {
				subcommand: 'standup',
				querySource: 'local',
				error: err instanceof Error ? err.message.substring(0, 100) : 'unknown',
			}, {});
			return { sessions: [], refs: [] };
		}
	}

	private async _queryCloudStore(): Promise<{ sessions: AnnotatedSession[]; refs: AnnotatedRef[] }> {
		const empty = { sessions: [] as AnnotatedSession[], refs: [] as AnnotatedRef[] };
		try {
			const client = new CloudSessionStoreClient(this._tokenManager, this._authService, this._fetcherService);

			const sessionsResult = await client.executeQuery(SESSIONS_QUERY_CLOUD);
			if (!sessionsResult || sessionsResult.rows.length === 0) {
				return empty;
			}

			const sessions: AnnotatedSession[] = sessionsResult.rows.map(r => ({
				id: r.id as string,
				summary: r.summary as string | undefined,
				branch: r.branch as string | undefined,
				repository: r.repository as string | undefined,
				created_at: r.created_at as string | undefined,
				updated_at: r.updated_at as string | undefined,
				source: 'cloud' as const,
			}));

			// Query refs for these sessions
			const ids = sessions.map(s => s.id);
			let refs: AnnotatedRef[] = [];
			try {
				const refsQuery = `SELECT session_id, ref_type, ref_value FROM session_refs WHERE session_id IN (${ids.map(s => `'${s.replace(/'/g, '\'\'')}'`).join(',')})`;
				const refsResult = await client.executeQuery(refsQuery);
				if (refsResult && refsResult.rows.length > 0) {
					refs = refsResult.rows.map(r => ({
						session_id: r.session_id as string,
						ref_type: r.ref_type as 'commit' | 'pr' | 'issue',
						ref_value: r.ref_value as string,
						source: 'cloud' as const,
					}));
				}
			} catch (refsErr) {

				this._telemetryService.sendMSFTTelemetryErrorEvent('chronicle', {
					subcommand: 'standup',
					querySource: 'cloudRefs',
					error: refsErr instanceof Error ? refsErr.message.substring(0, 100) : 'unknown',
				}, {});
			}

			return { sessions, refs };
		} catch (err) {

			this._telemetryService.sendMSFTTelemetryErrorEvent('chronicle', {
				subcommand: 'standup',
				querySource: 'cloud',
				error: err instanceof Error ? err.message.substring(0, 100) : 'unknown',
			}, {});
			return empty;
		}
	}

	async invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation> {
		const { location, request } = invocationContext;
		const endpoint = await this.endpointProvider.getChatEndpoint(request);
		const systemPrompt = this._pendingSystemPrompt ?? '';
		this._pendingSystemPrompt = undefined;
		return this._instantiationService.createInstance(
			ChronicleIntentInvocation, this, location, endpoint, request, systemPrompt
		);
	}
}

class ChronicleIntentInvocation extends RendererIntentInvocation implements IIntentInvocation {

	readonly linkification: IntentLinkificationOptions = { disable: false };

	constructor(
		intent: IIntent,
		location: ChatLocation,
		endpoint: IChatEndpoint,
		private readonly request: vscode.ChatRequest,
		private readonly systemPrompt: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IToolsService private readonly toolsService: IToolsService,
	) {
		super(intent, location, endpoint);
	}

	async createRenderer(promptContext: IBuildPromptContext, endpoint: IChatEndpoint, _progress: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart>, _token: vscode.CancellationToken) {
		return PromptRenderer.create(this.instantiationService, endpoint, ChroniclePrompt, {
			endpoint,
			promptContext,
			systemPrompt: this.systemPrompt,
		});
	}

	getAvailableTools(): vscode.LanguageModelToolInformation[] | Promise<vscode.LanguageModelToolInformation[]> | undefined {
		return this.toolsService.getEnabledTools(this.request, this.endpoint,
			tool => tool.name === ToolName.SessionStoreSql
		);
	}
}
