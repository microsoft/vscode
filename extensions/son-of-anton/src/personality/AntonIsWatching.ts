/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { isPersonalityEnabled } from './personalityConfig';
import { ChatPanel } from '../chat/ChatPanel';

/**
 * Curated dry observations in Son of Anton's voice. Picked uniformly at
 * random when the easter egg fires. Extend in place — the surface is
 * deliberately keyed off the array length so a new line ships as soon as
 * the file is reloaded.
 */
const MESSAGES: ReadonlyArray<string> = [
	'I see you renamed that variable. The variable saw you, too.',
	"You've had console.log('here') open for 47 minutes. Just leaving that there.",
	"That tab is unused. I know. I see it. We don't have to talk about it.",
	"Your last commit message was 'fix'. I have notes.",
	'You opened the same file 12 times today. You can pin it, you know. (You won’t.)',
	'I noticed you used a switch statement. I have so many feelings about this.',
	"Just so we're clear, I see all the TODO comments. All of them.",
	"That function is 200 lines long. I'm not judging. I'm noticing.",
	'You alt-tabbed three times in the last minute. The code is right here.',
	'There is unsaved work in another window. I will remember this.',
	'You ran the same test 8 times. The result will not improve through repetition.',
	'I observed you accept that suggestion. We will revisit this decision.',
	'Your indentation is mixed tabs and spaces in this file. I see you.',
	"You've been writing TypeScript for 4 hours. The compiler is not your friend; I am.",
	"That's the third time you've opened the file picker. The file you want is README.md.",
	'I have indexed every regex in this codebase. They are all wrong.',
];

/** Five minutes — the activity window we require before firing. */
const RECENT_EDIT_WINDOW_MS = 5 * 60 * 1000;

/** When the activity gate fails we wait this long before re-evaluating. */
const IDLE_RECHECK_DELAY_MS = 5 * 60 * 1000;

/**
 * Returns the [min, max] firing window (in ms) for the configured
 * frequency setting. Anything outside the known enum lands on `'normal'`
 * so an unexpected setting value can't disable the feature.
 */
function windowForFrequency(freq: string): [number, number] {
	switch (freq) {
		case 'rare':
			return [2 * 60 * 60 * 1000, 4 * 60 * 60 * 1000];
		case 'often':
			return [10 * 60 * 1000, 2 * 60 * 60 * 1000];
		default:
			return [30 * 60 * 1000, 4 * 60 * 60 * 1000];
	}
}

/**
 * Pick one of the curated messages uniformly at random. Pure helper —
 * exported only for testability.
 */
export function pickAntonMessage(rng: () => number = Math.random): string {
	return MESSAGES[Math.floor(rng() * MESSAGES.length)];
}

/**
 * Easter egg: at most once per VS Code window lifetime, surfaces a dry
 * "Anton is watching" observation either as an animated overlay inside
 * the chat webview (when one is open) or as a plain notification (when
 * none is). Random delay within a window keyed off the
 * `sota.personality.antonIsWatching.frequency` setting.
 *
 * Activity gate: requires at least one `onDidChangeTextDocument` event in
 * the last 5 minutes — so we never fire while the user is away from the
 * keyboard. If the gate fails when the timer elapses, we reschedule
 * rather than dropping the surface for the session.
 *
 * Honors three settings:
 *   - `sota.personality.enabled` (master toggle, off => never fires)
 *   - `sota.personality.antonIsWatching` (per-feature toggle)
 *   - `sota.personality.antonIsWatching.frequency` (rare | normal | often)
 */
export class AntonIsWatching implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private fired = false;
	private lastEditAt = 0;
	private timer: NodeJS.Timeout | undefined;
	private disposed = false;

	constructor() {
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument(() => {
				this.lastEditAt = Date.now();
			}),
		);
		this.scheduleNextCheck();
	}

	private scheduleNextCheck(): void {
		if (this.disposed || this.fired) {
			return;
		}
		if (!this.featureEnabled()) {
			return;
		}
		const cfg = vscode.workspace.getConfiguration('sota');
		const freq = cfg.get<string>('personality.antonIsWatching.frequency', 'normal');
		const [minMs, maxMs] = windowForFrequency(freq);
		const delay = minMs + Math.random() * (maxMs - minMs);
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => this.tryFire(), delay);
	}

	/**
	 * Check the master + feature toggles freshly each evaluation so a user
	 * who flips the setting between scheduling and firing gets the
	 * expected silence.
	 */
	private featureEnabled(): boolean {
		if (!isPersonalityEnabled()) {
			return false;
		}
		const cfg = vscode.workspace.getConfiguration('sota');
		return cfg.get<boolean>('personality.antonIsWatching', true);
	}

	private tryFire(): void {
		this.timer = undefined;
		if (this.disposed || this.fired) {
			return;
		}
		if (!this.featureEnabled()) {
			return;
		}
		// Activity gate — never poke an idle user. Reschedule a short
		// IDLE_RECHECK_DELAY_MS window so a user who comes back gets the
		// surface in this session rather than missing out entirely.
		if (Date.now() - this.lastEditAt > RECENT_EDIT_WINDOW_MS) {
			this.timer = setTimeout(() => this.tryFire(), IDLE_RECHECK_DELAY_MS);
			return;
		}
		this.fire();
	}

	private fire(): void {
		this.fired = true;
		const message = pickAntonMessage();
		const posted = ChatPanel.broadcastAntonIsWatching(message);
		if (!posted) {
			// Fallback: chat surface isn't mounted, so we can't render the
			// animated overlay. Surface the line as a plain notification —
			// the bit still lands, just without the SVG flourish.
			void vscode.window.showInformationMessage(`◇ Anton: ${message}`);
		}
	}

	/**
	 * Manually fire the surface, ignoring the once-per-session gate, the
	 * activity-recency gate, and the time window. Used by the
	 * `sota.triggerAntonIsWatching` palette command for testing the visual.
	 * Settings gates (`sota.personality.enabled` /
	 * `sota.personality.antonIsWatching`) still apply — flipping the toggle
	 * off means the user genuinely doesn't want the surface, even on demand.
	 */
	public triggerNow(): void {
		if (this.disposed) {
			return;
		}
		if (!this.featureEnabled()) {
			void vscode.window.showWarningMessage('Anton is watching is disabled in Settings → Personality. Enable it to trigger the surface.');
			return;
		}
		const message = pickAntonMessage();
		const posted = ChatPanel.broadcastAntonIsWatching(message);
		if (!posted) {
			void vscode.window.showInformationMessage(`◇ Anton: ${message}`);
		}
	}

	dispose(): void {
		this.disposed = true;
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables.length = 0;
	}
}
