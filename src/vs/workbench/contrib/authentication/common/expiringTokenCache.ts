/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Utility class for managing tokens or links with expiration functionality.
 * This can be used for password reset links, authentication tokens, or any other
 * temporary resources that should expire after a certain period.
 */
export class ExpiringTokenCache<T = string> {
	private readonly _tokens = new Map<string, { value: T; expiresAt: number }>();
	private _cleanupTimeout?: number;

	constructor(
		private readonly _defaultTtlMs: number = 10 * 60 * 1000, // 10 minutes default
		private readonly _cleanupInterval: number = 60 * 1000 // 1 minute cleanup interval
	) {
		this._scheduleCleanup();
	}

	/**
	 * Store a token with optional custom TTL
	 */
	set(key: string, value: T, customTtlMs?: number): void {
		const ttl = customTtlMs ?? this._defaultTtlMs;
		const expiresAt = Date.now() + ttl;
		
		this._tokens.set(key, { value, expiresAt });
		
		// Reschedule cleanup if needed
		this._scheduleCleanup();
	}

	/**
	 * Retrieve a token if it hasn't expired
	 */
	get(key: string): T | undefined {
		const entry = this._tokens.get(key);
		if (!entry) {
			return undefined;
		}

		if (Date.now() > entry.expiresAt) {
			this._tokens.delete(key);
			return undefined;
		}

		return entry.value;
	}

	/**
	 * Check if a token exists and is valid (not expired)
	 */
	has(key: string): boolean {
		return this.get(key) !== undefined;
	}

	/**
	 * Remove a token manually
	 */
	delete(key: string): boolean {
		return this._tokens.delete(key);
	}

	/**
	 * Clear all tokens
	 */
	clear(): void {
		this._tokens.clear();
		if (this._cleanupTimeout) {
			clearTimeout(this._cleanupTimeout);
			this._cleanupTimeout = undefined;
		}
	}

	/**
	 * Get the number of valid (non-expired) tokens
	 */
	get size(): number {
		this._cleanupExpired();
		return this._tokens.size;
	}

	/**
	 * Check if a token is expired
	 */
	isExpired(key: string): boolean {
		const entry = this._tokens.get(key);
		if (!entry) {
			return true; // Consider non-existent tokens as expired
		}
		return Date.now() > entry.expiresAt;
	}

	/**
	 * Get remaining time for a token in milliseconds
	 */
	getRemainingTime(key: string): number {
		const entry = this._tokens.get(key);
		if (!entry) {
			return 0;
		}
		return Math.max(0, entry.expiresAt - Date.now());
	}

	private _scheduleCleanup(): void {
		if (this._cleanupTimeout) {
			return;
		}

		this._cleanupTimeout = setTimeout(() => {
			this._cleanupExpired();
			this._cleanupTimeout = undefined;
			
			// Schedule next cleanup if there are still tokens
			if (this._tokens.size > 0) {
				this._scheduleCleanup();
			}
		}, this._cleanupInterval) as any;
	}

	private _cleanupExpired(): void {
		const now = Date.now();
		for (const [key, entry] of this._tokens.entries()) {
			if (now > entry.expiresAt) {
				this._tokens.delete(key);
			}
		}
	}

	dispose(): void {
		this.clear();
	}
}

/**
 * Example usage for password reset functionality:
 * 
 * const passwordResetTokens = new ExpiringTokenCache<{ email: string; userId: string }>(
 *     15 * 60 * 1000 // 15 minutes TTL for password reset links
 * );
 * 
 * // Generate and store a reset token
 * const resetToken = generateRandomToken();
 * passwordResetTokens.set(resetToken, { email: 'user@example.com', userId: 'user123' });
 * 
 * // Later, validate the reset token
 * const resetData = passwordResetTokens.get(resetToken);
 * if (resetData) {
 *     // Token is valid, proceed with password reset
 *     console.log(`Reset password for ${resetData.email}`);
 * } else {
 *     // Token is expired or invalid
 *     console.log('Invalid or expired reset token');
 * }
 */