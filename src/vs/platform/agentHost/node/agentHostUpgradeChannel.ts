/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Environment variable populated by the VS Code CLI when it spawns the
 * agent host server. Its value is the path of a unix-domain socket
 * (POSIX) or named pipe (Windows) on which the CLI is serving its HTTP
 * management API. Presence of the variable also serves as the "I was
 * spawned by a managing CLI" marker that decides whether the server
 * advertises an in-band upgrade method to clients.
 */
export const VSCODE_AGENT_HOST_MANAGEMENT_SOCKET_ENV = 'VSCODE_AGENT_HOST_MANAGEMENT_SOCKET';

/**
 * Status payload returned by the CLI's `POST /upgrade` endpoint. Sent
 * back verbatim to the agent host client so the UI can surface it.
 */
export interface IUpgradeRequestResponse {
	readonly ok: boolean;
	/** Whether the running server is older than the latest known release. */
	readonly upgradeNeeded?: boolean;
	/** Whether the CLI committed to performing the upgrade (true => kill+respawn was scheduled). */
	readonly upgradeStarted?: boolean;
	/** Commit hash of the currently running server, or `null` if none. */
	readonly runningCommit?: string | null;
	/** Commit hash of the latest known release at the time of the call. */
	readonly latestCommit?: string;
	/** Milliseconds the client should wait before reconnecting (only set when upgrade started). */
	readonly restartDelayMs?: number;
	/** Human-readable error message when `ok` is false. */
	readonly error?: string;
}

/**
 * Returns the management socket path advertised by the hosting CLI, or
 * `undefined` when the current process was not spawned by one.
 */
export function getAgentHostManagementSocketPath(): string | undefined {
	const value = process.env[VSCODE_AGENT_HOST_MANAGEMENT_SOCKET_ENV];
	return value && value.length > 0 ? value : undefined;
}

/**
 * Ask the hosting CLI to check for an update and (if needed) restart this
 * server. Sends `POST /upgrade` to the management socket and returns the
 * CLI's parsed JSON response.
 *
 * Rejects when no management socket is advertised, when the connection
 * fails, on non-2xx responses, or when the response body cannot be parsed.
 */
export async function requestAgentHostUpgrade(socketPath = getAgentHostManagementSocketPath()): Promise<IUpgradeRequestResponse> {
	const http = await import('http');

	if (!socketPath) {
		return Promise.reject(new Error(`Cannot request upgrade: ${VSCODE_AGENT_HOST_MANAGEMENT_SOCKET_ENV} is not set.`));
	}
	return new Promise<IUpgradeRequestResponse>((resolve, reject) => {
		const req = http.request({
			socketPath,
			method: 'POST',
			path: '/upgrade',
			headers: { 'content-length': '0' },
		}, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => {
				const body = Buffer.concat(chunks).toString('utf8');
				const status = res.statusCode ?? 0;
				let parsed: IUpgradeRequestResponse | undefined;
				try {
					parsed = body ? JSON.parse(body) as IUpgradeRequestResponse : undefined;
				} catch {
					// fall through to error reporting below
				}
				if (status >= 200 && status < 300 && parsed && parsed.ok !== false) {
					resolve(parsed);
				} else {
					const reason = parsed?.error || body || `HTTP ${status}`;
					reject(new Error(`Agent host upgrade request failed: ${reason}`));
				}
			});
			res.on('error', reject);
		});
		req.once('error', reject);
		req.end();
	});
}
