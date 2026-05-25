/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { INTEGRATION_ID } from '../../../../platform/endpoint/common/licenseAgreement';
import { PermissiveAuthRequiredError } from '../../../../platform/github/common/githubService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IFetcherService } from '../../../../platform/networking/common/fetcherService';

/** Base path for Mission Control (agent session) endpoints. */
const SESSIONS_PATH = '/agents/sessions';

/** Per-request timeout (ms). */
const REQUEST_TIMEOUT_MS = 10_000;

/** Event payload forwarded to Mission Control. */
export interface McEvent {
	id: string;
	timestamp: string;
	parentId: string | null;
	ephemeral?: boolean;
	type: string;
	data: Record<string, unknown>;
}

/** Steering command returned from Mission Control. */
export interface McCommand {
	id: string;
	content: string;
	type?: string;
	state: string;
}

/** Result of a session creation call. */
export interface McSessionCreateResult {
	id: string;
	taskId: string;
}

/**
 * Authentication options for Mission Control requests.
 *
 * Mission Control endpoints write to the `/agents/sessions` API family, which
 * requires a permissive GitHub token (same scope as the Copilot Coding Agent
 * job dispatch endpoint). Callers pass `createIfNone` to surface an interactive
 * sign-in prompt when no permissive session is available.
 */
export interface McAuthOptions {
	/** If provided, shows an interactive permission-upgrade prompt when no silent session exists. */
	readonly createIfNone?: { readonly detail: string };
}

/**
 * HTTP client for the Mission Control agent-session API.
 *
 * Wraps the four endpoints used by the Copilot CLI `/remote` command:
 *  - `POST   /agents/sessions`                         — create session
 *  - `POST   /agents/sessions/{id}/events`             — submit events (+ ack completed commands)
 *  - `GET    /agents/sessions/{id}/commands`           — poll for steering commands
 *  - `DELETE /agents/sessions/{id}`                    — tear down session
 *
 * All requests are routed through {@link IFetcherService} so proxy, custom CA,
 * and telemetry configuration are applied consistently. Authentication uses a
 * permissive GitHub session (fetched on each call to pick up token refreshes);
 * when no permissive session exists and interactive prompting is disabled the
 * call throws {@link PermissiveAuthRequiredError}, mirroring the pattern used
 * by `IOctoKitService.postCopilotAgentJob`.
 */
export class MissionControlApiClient {

	constructor(
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@IFetcherService private readonly _fetcherService: IFetcherService,
		@ILogService private readonly _logService: ILogService,
	) { }

	/**
	 * Create a Mission Control session for the given repo and agent task id.
	 *
	 * @throws {PermissiveAuthRequiredError} if `createIfNone` is not set and no silent permissive session exists.
	 */
	async createSession(
		ownerId: number,
		repoId: number,
		agentTaskId: string,
		authOptions: McAuthOptions,
	): Promise<McSessionCreateResult> {
		const { url, headers } = await this._buildRequest(SESSIONS_PATH, authOptions);
		const res = await this._fetcherService.fetch(url, {
			callSite: 'copilotcli.mc.createSession',
			method: 'POST',
			headers,
			json: {
				owner_id: ownerId,
				repo_id: repoId,
				agent_task_id: agentTaskId,
			},
			timeout: REQUEST_TIMEOUT_MS,
		});
		if (!res.ok) {
			const body = await res.text().catch(() => '');
			throw new Error(`Mission Control session creation failed: ${res.status} ${res.statusText} - ${body}`);
		}
		const data = await res.json() as { id: string; task_id?: string };
		return { id: data.id, taskId: data.task_id ?? agentTaskId };
	}

	/**
	 * Submit a batch of events to a Mission Control session, optionally
	 * acknowledging completed steering command ids in the same request.
	 *
	 * Returns `true` on success; logs and returns `false` on failure so the
	 * caller can re-queue events.
	 */
	async submitEvents(
		sessionId: string,
		events: readonly McEvent[],
		completedCommandIds: readonly string[],
	): Promise<boolean> {
		try {
			const { url, headers } = await this._buildRequest(`${SESSIONS_PATH}/${sessionId}/events`, {});
			const res = await this._fetcherService.fetch(url, {
				callSite: 'copilotcli.mc.submitEvents',
				method: 'POST',
				headers,
				json: {
					events,
					completed_command_ids: completedCommandIds.length > 0 ? completedCommandIds : undefined,
				},
				timeout: REQUEST_TIMEOUT_MS,
			});
			if (!res.ok) {
				const body = await res.text().catch(() => '');
				this._logService.warn(`[MissionControlApiClient] submitEvents failed: ${res.status} ${res.statusText} - ${body}`);
				return false;
			}
			return true;
		} catch (err) {
			this._logService.warn(`[MissionControlApiClient] submitEvents error: ${err}`);
			return false;
		}
	}

	/**
	 * Poll for pending steering commands. Returns an empty array if the
	 * endpoint is unreachable or returns a non-OK response.
	 */
	async getPendingCommands(sessionId: string): Promise<McCommand[]> {
		try {
			const { url, headers } = await this._buildRequest(`${SESSIONS_PATH}/${sessionId}/commands`, {});
			const res = await this._fetcherService.fetch(url, {
				callSite: 'copilotcli.mc.getPendingCommands',
				method: 'GET',
				headers,
				timeout: REQUEST_TIMEOUT_MS,
			});
			if (!res.ok) {
				return [];
			}
			const data = await res.json() as { commands?: McCommand[] };
			return data.commands ?? [];
		} catch {
			return [];
		}
	}

	/**
	 * Tear down a Mission Control session. Best-effort: failures are swallowed
	 * so `/remote off` always completes locally even if the server is unreachable.
	 */
	async deleteSession(sessionId: string): Promise<void> {
		try {
			const { url, headers } = await this._buildRequest(`${SESSIONS_PATH}/${sessionId}`, {});
			await this._fetcherService.fetch(url, {
				callSite: 'copilotcli.mc.deleteSession',
				// FetchOptions.method is typed narrowly (GET/POST/PUT) but the
				// underlying fetcher forwards any string, so DELETE works at runtime.
				method: 'DELETE' as 'POST',
				headers,
				timeout: REQUEST_TIMEOUT_MS,
			});
		} catch (err) {
			this._logService.warn(`[MissionControlApiClient] deleteSession error: ${err}`);
		}
	}

	/**
	 * Build the absolute URL and auth headers for an MC request.
	 *
	 * Auth strategy follows `IOctoKitService.postCopilotAgentJob`: request a
	 * permissive GitHub session, optionally with an interactive upgrade prompt.
	 * If no session is available and prompting is disabled, throw
	 * {@link PermissiveAuthRequiredError} so callers can render a dedicated UX.
	 *
	 * The base URL is resolved via the Copilot token's `endpoints.api` which is
	 * GHES-aware.
	 */
	private async _buildRequest(
		path: string,
		authOptions: McAuthOptions,
	): Promise<{ url: string; headers: Record<string, string> }> {
		const session = authOptions.createIfNone
			? await this._authService.getGitHubSession('permissive', { createIfNone: authOptions.createIfNone })
			: await this._authService.getGitHubSession('permissive', { silent: true });
		if (!session?.accessToken) {
			throw new PermissiveAuthRequiredError();
		}

		const copilotToken = await this._authService.getCopilotToken();
		const baseUrl = copilotToken.endpoints?.api;
		if (!baseUrl) {
			throw new Error('Copilot API endpoint is not available');
		}

		const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
		const headers: Record<string, string> = {
			'Authorization': `Bearer ${session.accessToken}`,
			'Copilot-Integration-Id': INTEGRATION_ID,
		};
		return { url, headers };
	}
}
