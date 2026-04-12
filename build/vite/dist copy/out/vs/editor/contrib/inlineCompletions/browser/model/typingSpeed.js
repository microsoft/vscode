/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { sum } from '../../../../../base/common/arrays.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
/**
 * Tracks typing speed as average milliseconds between keystrokes.
 * Higher values indicate slower typing.
 */
export class TypingInterval extends Disposable {
    // Configuration constants
    static { this.MAX_SESSION_GAP_MS = 3_000; } // 3 seconds max gap between keystrokes in a session
    static { this.MIN_SESSION_DURATION_MS = 1_000; } // Minimum session duration to consider
    static { this.SESSION_HISTORY_LIMIT = 50; } // Keep last 50 sessions for calculation
    static { this.TYPING_SPEED_WINDOW_MS = 300_000; } // 5 minutes window for speed calculation
    static { this.MIN_CHARS_FOR_RELIABLE_SPEED = 20; } // Minimum characters needed for reliable speed calculation
    /**
     * Gets the current typing interval as average milliseconds between keystrokes
     * and the number of characters involved in the computation.
     * Higher interval values indicate slower typing.
     * Returns { interval: 0, characterCount: 0 } if no typing data is available.
     */
    getTypingInterval() {
        if (this._cacheInvalidated || this._cachedTypingIntervalResult === null) {
            this._cachedTypingIntervalResult = this._calculateTypingInterval();
            this._cacheInvalidated = false;
        }
        return this._cachedTypingIntervalResult;
    }
    constructor(_textModel) {
        super();
        this._textModel = _textModel;
        this._typingSessions = [];
        this._currentSession = null;
        this._lastChangeTime = 0;
        this._cachedTypingIntervalResult = null;
        this._cacheInvalidated = true;
        this._register(this._textModel.onDidChangeContent(e => this._updateTypingSpeed(e)));
    }
    _updateTypingSpeed(change) {
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
    _getActualCharacterCount(change) {
        let totalChars = 0;
        for (const c of change.changes) {
            // Count characters added or removed (use the larger of the two)
            totalChars += Math.max(c.text.length, c.rangeLength);
        }
        return totalChars;
    }
    _isUserTyping(change) {
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
    _isUserTypingReason(reason) {
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
    _finalizeCurrentSession() {
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
    _calculateTypingInterval() {
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
    _calculateSpeedFromSessions(sessions) {
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
    reset() {
        this._typingSessions.length = 0;
        this._currentSession = null;
        this._lastChangeTime = 0;
        this._cachedTypingIntervalResult = null;
        this._cacheInvalidated = true;
    }
    dispose() {
        this._finalizeCurrentSession();
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwaW5nU3BlZWQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL21vZGVsL3R5cGluZ1NwZWVkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFlckU7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLGNBQWUsU0FBUSxVQUFVO0lBUTdDLDBCQUEwQjthQUNGLHVCQUFrQixHQUFHLEtBQUssQUFBUixDQUFTLEdBQUMsb0RBQW9EO2FBQ2hGLDRCQUF1QixHQUFHLEtBQUssQUFBUixDQUFTLEdBQUMsdUNBQXVDO2FBQ3hFLDBCQUFxQixHQUFHLEVBQUUsQUFBTCxDQUFNLEdBQUMsd0NBQXdDO2FBQ3BFLDJCQUFzQixHQUFHLE9BQU8sQUFBVixDQUFXLEdBQUMseUNBQXlDO2FBQzNFLGlDQUE0QixHQUFHLEVBQUUsQUFBTCxDQUFNLEdBQUMsMkRBQTJEO0lBRXRIOzs7OztPQUtHO0lBQ0ksaUJBQWlCO1FBQ3ZCLElBQUksSUFBSSxDQUFDLGlCQUFpQixJQUFJLElBQUksQ0FBQywyQkFBMkIsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUN6RSxJQUFJLENBQUMsMkJBQTJCLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixFQUFFLENBQUM7WUFDbkUsSUFBSSxDQUFDLGlCQUFpQixHQUFHLEtBQUssQ0FBQztRQUNoQyxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsMkJBQTJCLENBQUM7SUFDekMsQ0FBQztJQUVELFlBQTZCLFVBQXNCO1FBQ2xELEtBQUssRUFBRSxDQUFDO1FBRG9CLGVBQVUsR0FBVixVQUFVLENBQVk7UUEzQmxDLG9CQUFlLEdBQW9C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