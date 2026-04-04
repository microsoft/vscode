/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Client for the Codamente host registry at https://codamente.com.
 * Handles host registration, heartbeat, and unregistration.
 */
export class CodamenteClient {

	private static readonly BASE_URL = 'https://codamente.com/api/hosts';
	private static readonly HEARTBEAT_INTERVAL_MS = 30_000;

	private _heartbeatTimer: ReturnType<typeof setInterval> | undefined;
	private _hostId: string | undefined;

	/**
	 * Register this agent host with the Codamente service.
	 *
	 * @param tunnelUrl The public tunnel URL that clients connect to.
	 * @param connectionToken The secret token for WebSocket authentication.
	 * @param hostName A friendly name for this host.
	 * @param githubToken GitHub token identifying the user.
	 */
	async register(tunnelUrl: string, connectionToken: string, hostName: string, githubToken: string): Promise<void> {
		const body = JSON.stringify({
			tunnelUrl,
			connectionToken,
			hostName,
		});

		const response = await fetch(CodamenteClient.BASE_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${githubToken}`,
			},
			body,
		});

		if (!response.ok) {
			throw new Error(`Failed to register host: ${response.status} ${response.statusText}`);
		}

		const data = await response.json() as { id: string };
		this._hostId = data.id;

		this._startHeartbeat(githubToken);
	}

	/**
	 * Unregister this host from the Codamente service.
	 */
	async unregister(githubToken: string): Promise<void> {
		this._stopHeartbeat();

		if (!this._hostId) {
			return;
		}

		try {
			await fetch(`${CodamenteClient.BASE_URL}/${this._hostId}`, {
				method: 'DELETE',
				headers: {
					'Authorization': `Bearer ${githubToken}`,
				},
			});
		} catch {
			// Best-effort — host will expire via missed heartbeats
		}

		this._hostId = undefined;
	}

	/**
	 * Fetch the list of available agent hosts for the authenticated user.
	 * Used in web mode to connect to an existing host.
	 */
	async listHosts(githubToken: string): Promise<CodamenteHost[]> {
		const response = await fetch(CodamenteClient.BASE_URL, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${githubToken}`,
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to list hosts: ${response.status} ${response.statusText}`);
		}

		return await response.json() as CodamenteHost[];
	}

	private _startHeartbeat(githubToken: string): void {
		this._stopHeartbeat();

		let heartbeatInProgress = false;

		this._heartbeatTimer = setInterval(async () => {
			if (!this._hostId || heartbeatInProgress) {
				return;
			}
			heartbeatInProgress = true;
			try {
				await fetch(`${CodamenteClient.BASE_URL}/${this._hostId}/heartbeat`, {
					method: 'PUT',
					headers: {
						'Authorization': `Bearer ${githubToken}`,
					},
				});
			} catch {
				// Heartbeat failures are non-fatal — the server will
				// clean up stale hosts after a timeout.
			} finally {
				heartbeatInProgress = false;
			}
		}, CodamenteClient.HEARTBEAT_INTERVAL_MS);
	}

	private _stopHeartbeat(): void {
		if (this._heartbeatTimer !== undefined) {
			clearInterval(this._heartbeatTimer);
			this._heartbeatTimer = undefined;
		}
	}

	dispose(): void {
		this._stopHeartbeat();
	}
}

export interface CodamenteHost {
	readonly id: string;
	readonly tunnelUrl: string;
	readonly hostName: string;
}
