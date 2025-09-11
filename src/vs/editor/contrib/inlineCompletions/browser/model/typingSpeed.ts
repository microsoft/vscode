/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sum } from '../../../../../base/common/arrays.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ITextModel } from '../../../../common/model.js';
import { IModelContentChangedEvent } from '../../../../common/textModelEvents.js';

interface TypingSession {
	startTime: number;
	endTime: number;
	characterCount: number; // Effective character count for typing interval calculation
}

interface TypingIntervalResult {
	averageInterval: number; // Average milliseconds between keystrokes
	characterCount: number; // Number of characters involved in the computation
}

/**
 * Tracks typing speed as average milliseconds between keystrokes.
 * Higher values indicate slower typing.
 */
export class TypingInterval extends Disposable {

	private readonly _typingSessions: TypingSession[] = [];
	private _currentSession: TypingSession | null = null;
	private _lastChangeTime = 0;
	private _cachedTypingIntervalResult: TypingIntervalResult | null = null;
	private _cacheInvalidated = true;

	// Configuration constants
	private static readonly MAX_SESSION_GAP_MS = 3_000; // 3 seconds max gap between keystrokes in a session
	private static readonly MIN_SESSION_DURATION_MS = 1_000; // Minimum session duration to consider
	private static readonly SESSION_HISTORY_LIMIT = 50; // Keep last 50 sessions for calculation
	private static readonly TYPING_SPEED_WINDOW_MS = 300_000; // 5 minutes window for speed calculation
	private static readonly MIN_CHARS_FOR_RELIABLE_SPEED = 20; // Minimum characters needed for reliable speed calculation

	/**
	 * Gets the current typing interval as average milliseconds between keystrokes
	 * and the number of characters involved in the computation.
	 * Higher interval values indicate slower typing.
	 * Returns { interval: 0, characterCount: 0 } if no typing data is available.
	 */
	public getTypingInterval(): TypingIntervalResult {
		if (this._cacheInvalidated || this._cachedTypingIntervalResult === null) {
			this._cachedTypingIntervalResult = this._calculateTypingInterval();
			this._cacheInvalidated = false;
		}
		return this._cachedTypingIntervalResult;
	}

	constructor(private readonly _textModel: ITextModel) {
		super();

		this._register(this._textModel.onDidChangeContent(e => this._updateTypingSpeed(e)));
	}

	private _updateTypingSpeed(change: IModelContentChangedEvent): void {
		const now = Date.now();

		if (!this._isUserTyping(change)) {
			this._finalizeCurrentSession();
			return;
		}

		// If too much time has passed since last change, start a new session
		if (this._currentSession && (now - this._lastChangeTime) > TypingInterval.MAX_SESSION_GAP_MS) {
			this._finalizeCurrentSession();
		}

		// Start new session if none exists
		if (!this._currentSession) {
			this._currentSession = {
				startTime: now,
				endTime: now,
				characterCount: 0
			};
		}

		// Update current session
		this._currentSession.endTime = now;
		this._currentSession.characterCount += this._getActualCharacterCount(change);

		this._lastChangeTime = now;
		this._cacheInvalidated = true;
	}

	private _getActualCharacterCount(change: IModelContentChangedEvent): number {
		let totalChars = 0;
		for (const c of change.changes) {
			// Count characters added or removed (use the larger of the two)
			totalChars += Math.max(c.text.length, c.rangeLength);
		}
		return totalChars;
	}

	private _isUserTyping(change: IModelContentChangedEvent): boolean {
		// If no detailed reasons, assume user typing
		if (!change.detailedReasons || change.detailedReasons.length === 0) {
			return false;
		}

		// Check if any of the reasons indicate actual user typing
		for (const reason of change.detailedReasons) {
			if (this._isUserTypingReason(reason)) {
				return true;
			}
		}

		return false;
	}

	private _isUserTypingReason(reason: any): boolean {
		// Handle undo/redo - not considered user typing
		if (reason.metadata.isUndoing || reason.metadata.isRedoing) {
			return false;
		}

		// Handle different source types
		switch (reason.metadata.source) {
			case 'cursor': {
				// Direct user input via cursor
				const kind = reason.metadata.kind;
				return kind === 'type' || kind === 'compositionType' || kind === 'compositionEnd';
			}

			default:
				// All other sources (paste, suggestions, code actions, etc.) are not user typing
				return false;
		}
	}

	private _finalizeCurrentSession(): void {
		if (!this._currentSession) {
			return;
		}

		const sessionDuration = this._currentSession.endTime - this._currentSession.startTime;

		// Only keep sessions that meet minimum duration and have actual content
		if (sessionDuration >= TypingInterval.MIN_SESSION_DURATION_MS && this._currentSession.characterCount > 0) {
			this._typingSessions.push(this._currentSession);

			// Limit session history
			if (this._typingSessions.length > TypingInterval.SESSION_HISTORY_LIMIT) {
				this._typingSessions.shift();
			}
		}

		this._currentSession = null;
	}

	private _calculateTypingInterval(): TypingIntervalResult {
		// Finalize current session for calculation
		if (this._currentSession) {
			const tempSession = { ...this._currentSession };
			const sessionDuration = tempSession.endTime - tempSession.startTime;
			if (sessionDuration >= TypingInterval.MIN_SESSION_DURATION_MS && tempSession.characterCount > 0) {
				const allSessions = [...this._typingSessions, tempSession];
				return this._calculateSpeedFromSessions(allSessions);
			}
		}

		return this._calculateSpeedFromSessions(this._typingSessions);
	}

	private _calculateSpeedFromSessions(sessions: TypingSession[]): TypingIntervalResult {
		if (sessions.length === 0) {
			return { averageInterval: 0, characterCount: 0 };
		}

		// Sort sessions by recency (most recent first) to ensure we get the most recent sessions
		const sortedSessions = [...sessions].sort((a, b) => b.endTime - a.endTime);

		// First, try the standard window
		const cutoffTime = Date.now() - TypingInterval.TYPING_SPEED_WINDOW_MS;
		const recentSessions = sortedSessions.filter(session => session.endTime > cutoffTime);
		const olderSessions = sortedSessions.splice(recentSessions.length);

		let totalChars = sum(recentSessions.map(session => session.characterCount));

		// If we don't have enough characters in the standard window, expand to include older sessions
		for (let i = 0; i < olderSessions.length && totalChars < TypingInterval.MIN_CHARS_FOR_RELIABLE_SPEED; i++) {
			recentSessions.push(olderSessions[i]);
			totalChars += olderSessions[i].characterCount;
		}

		const totalTime = sum(recentSessions.map(session => session.endTime - session.startTime));
		if (totalTime === 0 || totalChars <= 1) {
			return { averageInterval: 0, characterCount: totalChars };
		}

		// Calculate average milliseconds between keystrokes
		const keystrokeIntervals = Math.max(1, totalChars - 1);
		const avgMsBetweenKeystrokes = totalTime / keystrokeIntervals;

		return {
			averageInterval: Math.round(avgMsBetweenKeystrokes),
			characterCount: totalChars
		};
	}

	/**
	 * Reset all typing speed data
	 */
	public reset(): void {
		this._typingSessions.length = 0;
		this._currentSession = null;
		this._lastChangeTime = 0;
		this._cachedTypingIntervalResult = null;
		this._cacheInvalidated = true;
	}

	public override dispose(): void {
		this._finalizeCurrentSession();
		super.dispose();
	}
}
