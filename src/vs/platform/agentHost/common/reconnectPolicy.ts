/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** How a remote agent host kind should be re-established after its transport drops. */
export interface IRemoteAgentHostReconnectPolicy {
	/**
	 * Whether a dropped transport may be restored automatically, with no user intent.
	 * `false` means the connection is surfaced as lost and recovery waits for an explicit user action.
	 */
	readonly autoRestore: boolean;
	/** First retry delay, in milliseconds. */
	readonly initialDelayMs: number;
	/** Ceiling for exponential backoff, in milliseconds. */
	readonly maxDelayMs: number;
	/**
	 * Consecutive failed attempts before automatic restore gives up. Exhaustion is
	 * terminal for the automatic path; recovery falls back to an explicit user action.
	 */
	readonly maxAttempts: number;
}

/** Default automatic reconnect policy for remote agent hosts. */
export const DEFAULT_RECONNECT_POLICY: IRemoteAgentHostReconnectPolicy = {
	autoRestore: true,
	initialDelayMs: 1000,
	maxDelayMs: 30_000,
	maxAttempts: 10,
};

/**
 * Computes a retry delay after a failed automatic reconnect attempt.
 * `attempt` is 1-based: pass 1 after the first failure, 2 after the second, and so on.
 */
export function computeReconnectDelay(policy: IRemoteAgentHostReconnectPolicy, attempt: number): number {
	return Math.min(policy.initialDelayMs * Math.pow(2, attempt - 1), policy.maxDelayMs);
}

/**
 * Whether automatic reconnect has reached its failure limit.
 * `attempt` is the 1-based count of consecutive failed automatic reconnect attempts.
 */
export function hasExhaustedReconnectAttempts(policy: IRemoteAgentHostReconnectPolicy, attempt: number): boolean {
	return attempt >= policy.maxAttempts;
}
