/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A registered agent host entry.
 */
export interface HostEntry {
	/** Server-generated unique ID. */
	readonly id: string;
	/** GitHub user ID that owns this host. */
	readonly githubUserId: number;
	/** The tunnel URL that clients use to connect. */
	tunnelUrl: string;
	/** Secret token required for WebSocket authentication to the agent host. */
	connectionToken: string;
	/** Human-readable name for display in host pickers. */
	hostName: string;
	/** Epoch ms of the most recent heartbeat (or initial registration). */
	lastHeartbeat: number;
	/** Epoch ms when this entry was created. */
	readonly createdAt: number;
}

/**
 * Public shape returned by GET /api/hosts — excludes the connectionToken
 * so that listing hosts never leaks secrets.
 */
export interface PublicHost {
	readonly id: string;
	readonly tunnelUrl: string;
	readonly hostName: string;
}

/**
 * Body of POST /api/hosts.
 */
export interface RegisterHostBody {
	tunnelUrl: string;
	connectionToken: string;
	hostName: string;
}

/**
 * Authenticated user info extracted from a validated GitHub token.
 */
export interface GitHubUser {
	readonly id: number;
	readonly login: string;
}

/**
 * Body returned by POST /api/hosts/:id/connect — includes the
 * connectionToken so that the requesting user can actually connect.
 */
export interface ConnectInfo {
	readonly tunnelUrl: string;
	readonly connectionToken: string;
}
