/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Circuit breaker states:
 * - CLOSED: Normal operation, requests are allowed
 * - OPEN: Circuit is tripped, requests fail immediately
 * - HALF_OPEN: Testing if the service has recovered
 */
export const CircuitState = {
	CLOSED: 'CLOSED',
	OPEN: 'OPEN',
	HALF_OPEN: 'HALF_OPEN',
} as const;

export type CircuitState = (typeof CircuitState)[keyof typeof CircuitState];

export interface CircuitBreakerOptions {
	/** Number of consecutive failures before opening the circuit. */
	failureThreshold: number;
	/** Time in milliseconds before attempting to close the circuit. */
	resetTimeoutMs: number;
	/** Time in milliseconds before a probe request times out and allows another probe. */
	probeTimeoutMs: number;
	/** Maximum reset timeout after exponential backoff on failed probes. Defaults to resetTimeoutMs (no backoff). */
	maxResetTimeoutMs?: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
	failureThreshold: 5,
	resetTimeoutMs: 1_000,
	probeTimeoutMs: 30_000,
};

/**
 * Circuit breaker implementation to prevent cascading failures.
 *
 * When multiple consecutive failures occur, the circuit "opens" and
 * immediately rejects subsequent requests without attempting them.
 * After a cooldown period, it allows a single "probe" request to test
 * if the service has recovered.
 *
 * Ported from copilot-agent-runtime/src/helpers/circuit-breaker.ts.
 */
export class CircuitBreaker {
	private state: CircuitState = CircuitState.CLOSED;
	private failureCount: number = 0;
	private lastFailureTime: number = 0;
	private probeInFlight: boolean = false;
	private probeStartTime: number = 0;
	private readonly options: CircuitBreakerOptions;
	/** Current reset timeout, increases via exponential backoff on failed probes. */
	private currentResetTimeoutMs: number;

	constructor(options: Partial<CircuitBreakerOptions> = {}) {
		this.options = { ...DEFAULT_OPTIONS, ...options };
		this.currentResetTimeoutMs = this.options.resetTimeoutMs;
	}

	/**
	 * Get the current state of the circuit breaker.
	 */
	getState(): CircuitState {
		this.updateState();
		return this.state;
	}

	/**
	 * Check if requests should be allowed through.
	 * In HALF_OPEN state, only one probe request is allowed at a time.
	 */
	canRequest(): boolean {
		this.updateState();

		switch (this.state) {
			case CircuitState.CLOSED:
				return true;
			case CircuitState.HALF_OPEN:
				// Check if probe has timed out — prevents permanent deadlock
				if (this.probeInFlight) {
					const probeElapsed = Date.now() - this.probeStartTime;
					if (probeElapsed >= this.options.probeTimeoutMs) {
						this.probeInFlight = false;
					}
				}
				if (this.probeInFlight) {
					return false;
				}
				this.probeInFlight = true;
				this.probeStartTime = Date.now();
				return true;
			case CircuitState.OPEN:
				return false;
		}
	}

	/**
	 * Record a successful request. Resets failure count and closes the circuit.
	 */
	recordSuccess(): void {
		this.failureCount = 0;
		this.probeInFlight = false;
		this.currentResetTimeoutMs = this.options.resetTimeoutMs;
		this.state = CircuitState.CLOSED;
	}

	/**
	 * Record a failed request. May open the circuit if threshold is exceeded.
	 */
	recordFailure(): void {
		const wasHalfOpen = this.state === CircuitState.HALF_OPEN;
		this.failureCount++;
		this.lastFailureTime = Date.now();
		this.probeInFlight = false;

		if (this.failureCount >= this.options.failureThreshold) {
			this.state = CircuitState.OPEN;
		}

		// Exponential backoff: double the probe interval after each failed probe
		if (wasHalfOpen && this.state === CircuitState.OPEN) {
			const maxTimeout = this.options.maxResetTimeoutMs ?? this.options.resetTimeoutMs;
			this.currentResetTimeoutMs = Math.min(this.currentResetTimeoutMs * 2, maxTimeout);
		}
	}

	/**
	 * Get the number of consecutive failures.
	 */
	getFailureCount(): number {
		return this.failureCount;
	}

	/**
	 * Force reset the circuit breaker to closed state.
	 */
	reset(): void {
		this.state = CircuitState.CLOSED;
		this.failureCount = 0;
		this.lastFailureTime = 0;
		this.probeInFlight = false;
		this.probeStartTime = 0;
		this.currentResetTimeoutMs = this.options.resetTimeoutMs;
	}

	/**
	 * Update state based on timeout — transitions from OPEN to HALF_OPEN
	 * after the reset timeout has elapsed.
	 */
	private updateState(): void {
		if (this.state === CircuitState.OPEN) {
			const elapsed = Date.now() - this.lastFailureTime;
			if (elapsed >= this.currentResetTimeoutMs) {
				this.state = CircuitState.HALF_OPEN;
			}
		}
	}
}
