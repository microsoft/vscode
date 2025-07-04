/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ITextModel } from '../../../../common/model.js';
import { IModelContentChangedEvent } from '../../../../common/textModelEvents.js';

interface TypingSession {
	startTime: number;
	endTime: number;
	characterCount: number; // Effective character count for typing speed calculation
}

export class TypingSpeed extends Disposable {

	private readonly _typingSessions: TypingSession[] = [];
	private _currentSession: TypingSession | null = null;
	private _lastChangeTime = 0;
	private _cachedTypingSpeed: number | null = null;
	private _cacheInvalidated = true;

	// Configuration constants
	private static readonly MAX_SESSION_GAP_MS = 3_000; // 3 seconds max gap between keystrokes in a session
	private static readonly MIN_SESSION_DURATION_MS = 1_000; // Minimum session duration to consider
	private static readonly SESSION_HISTORY_LIMIT = 50; // Keep last 50 sessions for calculation
	private static readonly TYPING_SPEED_WINDOW_MS = 300_000; // 5 minutes window for speed calculation

	public get speed(): number {
		if (this._cacheInvalidated || this._cachedTypingSpeed === null) {
			this._cachedTypingSpeed = this._calculateTypingSpeed();
			this._cacheInvalidated = false;
		}
		return this._cachedTypingSpeed;
	}

	constructor(private readonly _textModel: ITextModel) {
		super();

		this._register(this._textModel.onDidChangeContent(e => this._updateTypingSpeed(e)));
	}

	private _updateTypingSpeed(change: IModelContentChangedEvent): void {
		const now = Date.now();
		const characterCount = this._calculateEffectiveCharacterCount(change);

		// If too much time has passed since last change, start a new session
		if (this._currentSession && (now - this._lastChangeTime) > TypingSpeed.MAX_SESSION_GAP_MS) {
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
		this._currentSession.characterCount += characterCount;

		this._lastChangeTime = now;
		this._cacheInvalidated = true;
	}

	private _calculateEffectiveCharacterCount(change: IModelContentChangedEvent): number {
		const actualCharCount = this._getActualCharacterCount(change);

		// If this is actual user typing, count all characters
		if (this._isUserTyping(change)) {
			return actualCharCount;
		}

		// For all other actions (paste, suggestions, etc.), count as 1 regardless of size
		return actualCharCount > 0 ? 1 : 0;
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
			return true;
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
		if (sessionDuration >= TypingSpeed.MIN_SESSION_DURATION_MS && this._currentSession.characterCount > 0) {
			this._typingSessions.push(this._currentSession);

			// Limit session history
			if (this._typingSessions.length > TypingSpeed.SESSION_HISTORY_LIMIT) {
				this._typingSessions.shift();
			}
		}

		this._currentSession = null;
	}

	private _calculateTypingSpeed(): number {
		// Finalize current session for calculation
		if (this._currentSession) {
			const tempSession = { ...this._currentSession };
			const sessionDuration = tempSession.endTime - tempSession.startTime;
			if (sessionDuration >= TypingSpeed.MIN_SESSION_DURATION_MS && tempSession.characterCount > 0) {
				const allSessions = [...this._typingSessions, tempSession];
				return this._calculateSpeedFromSessions(allSessions);
			}
		}

		return this._calculateSpeedFromSessions(this._typingSessions);
	}

	private _calculateSpeedFromSessions(sessions: TypingSession[]): number {
		if (sessions.length === 0) {
			return 0;
		}

		const now = Date.now();
		const cutoffTime = now - TypingSpeed.TYPING_SPEED_WINDOW_MS;

		// Filter sessions within the time window
		const recentSessions = sessions.filter(session => session.endTime > cutoffTime);

		if (recentSessions.length === 0) {
			return 0;
		}

		// Calculate typing speed
		let totalChars = 0;
		let totalTime = 0;

		for (const session of recentSessions) {
			const sessionDuration = session.endTime - session.startTime;

			totalChars += session.characterCount;
			totalTime += sessionDuration;
		}

		if (totalTime === 0) {
			return 0;
		}

		// Convert to characters per minute
		const charsPerMs = totalChars / totalTime;
		const charsPerMinute = charsPerMs * 60 * 1000;

		return Math.round(charsPerMinute);
	}

	/**
	 * Reset all typing speed data
	 */
	public reset(): void {
		this._typingSessions.length = 0;
		this._currentSession = null;
		this._lastChangeTime = 0;
		this._cachedTypingSpeed = null;
		this._cacheInvalidated = true;
	}

	public override dispose(): void {
		this._finalizeCurrentSession();
		super.dispose();
	}
}
