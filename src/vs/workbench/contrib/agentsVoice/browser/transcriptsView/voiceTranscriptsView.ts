/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { autorun } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IVoiceSessionController, type VoiceState } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { IVoiceTranscriptStore, IVoiceTranscriptTurn } from '../../common/voiceTranscriptStore.js';

const $ = DOM.$;

type Pair = { user?: IVoiceTranscriptTurn; assistant?: IVoiceTranscriptTurn; timestamp: string };
type Group = { label: string; pairs: Pair[] };

/**
 * Side-panel view that lists the user's persisted voice-conversation turns,
 * grouped by relative time bucket. Display-only — read from the local
 * voiceTranscriptStore (JSONL on disk).
 */
export class VoiceTranscriptsViewPane extends ViewPane {

	static readonly ID = 'workbench.view.voiceTranscripts';

	private contentContainer: HTMLElement | undefined;
	private emptyState: HTMLElement | undefined;

	/** Cached login resolved on first render, refreshed lazily on each refresh(). */
	private userLogin: string | undefined;

	constructor(
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IVoiceTranscriptStore private readonly voiceTranscriptStore: IVoiceTranscriptStore,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IVoiceSessionController private readonly voiceSessionController: IVoiceSessionController,
		@ILogService private readonly logService: ILogService,
	) {
		super(
			options,
			keybindingService,
			contextMenuService,
			configurationService,
			contextKeyService,
			viewDescriptorService,
			instantiationService,
			openerService,
			themeService,
			hoverService,
		);

		// Auto-refresh when a voice turn completes: state goes from a
		// mid-turn value (speaking/processing) back to idle/listening. The
		// transcript store has been written by then.
		let lastState: VoiceState | undefined;
		this._register(autorun(reader => {
			const state = this.voiceSessionController.voiceState.read(reader);
			const wasMidTurn = lastState === 'speaking' || lastState === 'processing';
			const nowIdle = state === 'idle' || state === 'listening';
			lastState = state;
			if (wasMidTurn && nowIdle && this.isBodyVisible()) {
				void this.refresh();
			}
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('voice-transcripts-view');
		container.style.display = 'flex';
		container.style.flexDirection = 'column';
		container.style.overflow = 'hidden';

		this.contentContainer = DOM.append(container, $('.voice-transcripts-content'));
		this.contentContainer.style.flex = '1';
		this.contentContainer.style.overflowY = 'auto';
		this.contentContainer.style.padding = '6px 12px 12px';
		this.contentContainer.style.fontSize = '13px';

		this.emptyState = DOM.append(container, $('.voice-transcripts-empty'));
		this.emptyState.style.display = 'none';
		this.emptyState.style.padding = '24px 16px';
		this.emptyState.style.textAlign = 'center';
		this.emptyState.style.color = 'var(--vscode-descriptionForeground)';
		this.emptyState.style.fontSize = '13px';
		this.emptyState.textContent = localize(
			'voiceTranscripts.empty',
			"No transcripts yet. Start a voice conversation to populate this view."
		);

		void this.refresh();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		// Native ViewPane handles outer chrome — our content is naturally scrollable.
	}

	/**
	 * Re-read the transcript JSONL and re-render. Cheap; the file is text-only
	 * and bounded by the user's actual usage.
	 */
	async refresh(): Promise<void> {
		if (!this.contentContainer || !this.emptyState) {
			return;
		}

		try {
			this.userLogin = await this.resolveUserLogin();
			if (!this.userLogin) {
				this.renderEmpty();
				return;
			}
			const turns = await this.voiceTranscriptStore.loadTurns(this.userLogin);
			const indexEntry = this.voiceTranscriptStore.getIndexEntry(this.userLogin);
			const archiveCutoff = indexEntry?.archivedBefore;
			// Only voice-spoken entries are user-visible. ``agent_tool_call`` and
			// ``coding_event`` rows live in the same JSONL so they can be
			// replayed to the backend as cross-session context, but they
			// would clutter the transcript view (and a user reading the
			// transcript expects only the spoken conversation).
			const spoken = turns.filter(t => t.kind === 'user_voice' || t.kind === 'agent_voice');
			const visible = archiveCutoff
				? spoken.filter(t => t.timestamp >= archiveCutoff)
				: spoken;
			const archivedCount = spoken.length - visible.length;

			if (visible.length === 0 && archivedCount === 0) {
				this.renderEmpty();
				return;
			}

			this.renderTurns(visible, archivedCount);
		} catch (err) {
			this.logService.warn('[voiceTranscripts] refresh failed', err);
			this.renderEmpty();
		}
	}

	async archiveAll(): Promise<void> {
		if (!this.userLogin) {
			this.userLogin = await this.resolveUserLogin();
		}
		if (!this.userLogin) {
			return;
		}
		const cutoff = new Date().toISOString();
		try {
			await this.voiceTranscriptStore.archiveUpTo(this.userLogin, cutoff);
		} catch (err) {
			this.logService.warn('[voiceTranscripts] archiveUpTo failed', err);
		}
		await this.refresh();
	}

	async deleteAll(): Promise<void> {
		if (!this.userLogin) {
			this.userLogin = await this.resolveUserLogin();
		}
		if (!this.userLogin) {
			return;
		}
		try {
			await this.voiceTranscriptStore.deleteAll(this.userLogin);
		} catch (err) {
			this.logService.warn('[voiceTranscripts] deleteAll failed', err);
		}
		await this.refresh();
	}

	// --- Internals ---

	private async resolveUserLogin(): Promise<string | undefined> {
		try {
			const sessions = await this.authenticationService.getSessions('github');
			return sessions[0]?.account.label;
		} catch (err) {
			this.logService.warn('[voiceTranscripts] failed to resolve github session', err);
			return undefined;
		}
	}

	private renderEmpty(): void {
		if (!this.contentContainer || !this.emptyState) { return; }
		DOM.clearNode(this.contentContainer);
		this.contentContainer.style.display = 'none';
		this.emptyState.style.display = 'block';
	}

	private renderTurns(turns: readonly IVoiceTranscriptTurn[], archivedCount: number): void {
		if (!this.contentContainer || !this.emptyState) { return; }
		this.emptyState.style.display = 'none';
		this.contentContainer.style.display = 'block';
		DOM.clearNode(this.contentContainer);

		const groups = groupTurnsByTime(turns).filter(g => g.pairs.length > 0);

		for (const group of groups) {
			this.renderGroup(group);
		}

		if (archivedCount > 0) {
			const archived = DOM.append(this.contentContainer, $('.voice-transcripts-archived-note'));
			archived.style.marginTop = '12px';
			archived.style.fontSize = '11px';
			archived.style.color = 'var(--vscode-descriptionForeground)';
			archived.style.fontStyle = 'italic';
			archived.textContent = localize(
				'voiceTranscripts.archivedNote',
				"{0} archived turn{1} hidden.",
				archivedCount,
				archivedCount === 1 ? '' : 's'
			);
		}
	}

	private renderGroup(group: Group): void {
		if (!this.contentContainer) { return; }
		const groupEl = DOM.append(this.contentContainer, $('.voice-transcripts-group'));
		groupEl.style.marginBottom = '14px';

		const heading = DOM.append(groupEl, $('.voice-transcripts-group-heading'));
		heading.textContent = group.label;
		heading.style.fontSize = '11px';
		heading.style.fontWeight = '600';
		heading.style.textTransform = 'uppercase';
		heading.style.letterSpacing = '0.5px';
		heading.style.color = 'var(--vscode-descriptionForeground)';
		heading.style.padding = '4px 0 6px';
		heading.style.borderBottom = '1px solid var(--vscode-editorWhitespace-foreground)';
		heading.style.marginBottom = '4px';

		for (const pair of group.pairs) {
			this.renderPair(groupEl, pair);
		}
	}

	private renderPair(parent: HTMLElement, pair: Pair): void {
		const pairEl = DOM.append(parent, $('.voice-transcripts-pair'));
		pairEl.style.padding = '6px 0';
		pairEl.style.borderBottom = '1px solid var(--vscode-editorWhitespace-foreground)';

		const time = DOM.append(pairEl, $('.voice-transcripts-time'));
		time.textContent = formatTime(pair.timestamp);
		time.style.fontSize = '10px';
		time.style.color = 'var(--vscode-descriptionForeground)';
		time.style.marginBottom = '4px';

		if (pair.user) {
			this.renderRow(pairEl, 'You', pair.user.text);
		}
		if (pair.assistant) {
			this.renderRow(pairEl, 'Voice', pair.assistant.text);
		}
	}

	private renderRow(parent: HTMLElement, label: string, text: string): void {
		const row = DOM.append(parent, $('.voice-transcripts-row'));
		row.style.display = 'flex';
		row.style.gap = '6px';
		row.style.alignItems = 'baseline';
		row.style.marginBottom = '3px';
		row.style.lineHeight = '1.4';

		const labelEl = DOM.append(row, $('span'));
		labelEl.textContent = `${label}:`;
		labelEl.style.fontSize = '11px';
		labelEl.style.fontWeight = '600';
		labelEl.style.color = 'var(--vscode-descriptionForeground)';
		labelEl.style.flex = '0 0 auto';
		labelEl.style.minWidth = '32px';

		const textEl = DOM.append(row, $('span'));
		textEl.textContent = text;
		textEl.style.fontSize = '13px';
		textEl.style.color = 'var(--vscode-foreground)';
		textEl.style.whiteSpace = 'pre-wrap';
		textEl.style.wordBreak = 'break-word';
	}
}

// --- Helpers ---

function formatTime(timestamp: string): string {
	try {
		return new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	} catch {
		return '';
	}
}

function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Group a flat chronological turn list into relative-time buckets, pairing
 * each user turn with the subsequent assistant turn (and vice-versa for
 * orphaned assistant-only turns produced by proactive narration).
 */
function groupTurnsByTime(turns: readonly IVoiceTranscriptTurn[]): Group[] {
	if (turns.length === 0) {
		return [];
	}

	const now = new Date();
	const today = startOfDay(now);
	const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
	const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
	const monthStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

	const buckets: Group[] = [
		{ label: localize('voiceTranscripts.today', "Today"), pairs: [] },
		{ label: localize('voiceTranscripts.yesterday', "Yesterday"), pairs: [] },
		{ label: localize('voiceTranscripts.earlierWeek', "Earlier this week"), pairs: [] },
		{ label: localize('voiceTranscripts.earlierMonth', "Earlier this month"), pairs: [] },
		{ label: localize('voiceTranscripts.older', "Older"), pairs: [] },
	];

	for (const turn of turns) {
		const ts = new Date(turn.timestamp);
		let bucket: Group;
		if (ts >= today) {
			bucket = buckets[0];
		} else if (ts >= yesterday) {
			bucket = buckets[1];
		} else if (ts >= weekStart) {
			bucket = buckets[2];
		} else if (ts >= monthStart) {
			bucket = buckets[3];
		} else {
			bucket = buckets[4];
		}

		const last = bucket.pairs[bucket.pairs.length - 1];
		if (turn.role === 'user') {
			bucket.pairs.push({ user: turn, timestamp: turn.timestamp });
		} else if (last && !last.assistant) {
			last.assistant = turn;
		} else {
			bucket.pairs.push({ assistant: turn, timestamp: turn.timestamp });
		}
	}

	return buckets;
}
