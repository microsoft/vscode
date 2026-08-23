/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { autorun } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
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

/**
 * Side-panel debug view that renders the raw, persisted voice event stream.
 * Unlike the transcript view, this includes non-voice timeline entries
 * (tool calls and coding events), and supports copying the stream as JSONL.
 */
export class VoiceEventStreamViewPane extends ViewPane {

	static readonly ID = 'workbench.view.voiceEventStream';

	private contentContainer: HTMLElement | undefined;
	private emptyState: HTMLElement | undefined;

	/** Cached login resolved on first render, refreshed lazily on each refresh(). */
	private userLogin: string | undefined;
	private currentTurns: readonly IVoiceTranscriptTurn[] = [];

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
		@IClipboardService private readonly clipboardService: IClipboardService,
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
		container.classList.add('voice-event-stream-view');
		container.style.display = 'flex';
		container.style.flexDirection = 'column';
		container.style.overflow = 'hidden';

		this.contentContainer = DOM.append(container, $('.voice-event-stream-content'));
		this.contentContainer.style.flex = '1';
		this.contentContainer.style.overflowY = 'auto';
		this.contentContainer.style.padding = '6px 12px 12px';
		this.contentContainer.style.fontSize = '12px';

		this.emptyState = DOM.append(container, $('.voice-event-stream-empty'));
		this.emptyState.style.display = 'none';
		this.emptyState.style.padding = '24px 16px';
		this.emptyState.style.textAlign = 'center';
		this.emptyState.style.color = 'var(--vscode-descriptionForeground)';
		this.emptyState.style.fontSize = '13px';
		this.emptyState.textContent = localize(
			'voiceEventStream.empty',
			"No events yet. Start a voice conversation to populate this view."
		);

		void this.refresh();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}

	async refresh(): Promise<void> {
		if (!this.contentContainer || !this.emptyState) {
			return;
		}

		try {
			this.userLogin = await this.resolveUserLogin();
			if (!this.userLogin) {
				this.currentTurns = [];
				this.renderEmpty();
				return;
			}

			const turns = await this.voiceTranscriptStore.loadTurns(this.userLogin);
			this.currentTurns = turns;

			if (turns.length === 0) {
				this.renderEmpty();
				return;
			}

			this.renderTurns(turns);
		} catch (err) {
			this.logService.warn('[voiceEventStream] refresh failed', err);
			this.currentTurns = [];
			this.renderEmpty();
		}
	}

	async copyEventStream(): Promise<void> {
		if (this.currentTurns.length === 0) {
			await this.refresh();
		}

		if (this.currentTurns.length === 0) {
			return;
		}

		const serialized = this.currentTurns
			.map(turn => JSON.stringify(turn))
			.join('\n');
		await this.clipboardService.writeText(serialized);
	}

	private async resolveUserLogin(): Promise<string | undefined> {
		try {
			const sessions = await this.authenticationService.getSessions('github');
			return sessions[0]?.account.label;
		} catch (err) {
			this.logService.warn('[voiceEventStream] failed to resolve github session', err);
			return undefined;
		}
	}

	private renderEmpty(): void {
		if (!this.contentContainer || !this.emptyState) { return; }
		DOM.clearNode(this.contentContainer);
		this.contentContainer.style.display = 'none';
		this.emptyState.style.display = 'block';
	}

	private renderTurns(turns: readonly IVoiceTranscriptTurn[]): void {
		if (!this.contentContainer || !this.emptyState) { return; }
		this.emptyState.style.display = 'none';
		this.contentContainer.style.display = 'block';
		DOM.clearNode(this.contentContainer);

		for (const turn of turns) {
			this.renderTurn(turn);
		}
	}

	private renderTurn(turn: IVoiceTranscriptTurn): void {
		if (!this.contentContainer) {
			return;
		}

		const row = DOM.append(this.contentContainer, $('.voice-event-stream-row'));
		row.style.padding = '8px 0';
		row.style.borderBottom = '1px solid var(--vscode-editorWhitespace-foreground)';

		const header = DOM.append(row, $('.voice-event-stream-row-header'));
		header.style.display = 'flex';
		header.style.gap = '8px';
		header.style.flexWrap = 'wrap';
		header.style.alignItems = 'baseline';
		header.style.marginBottom = '4px';

		const time = DOM.append(header, $('span'));
		time.textContent = formatTime(turn.timestamp);
		time.style.fontSize = '11px';
		time.style.color = 'var(--vscode-descriptionForeground)';

		const kind = DOM.append(header, $('span'));
		kind.textContent = turn.kind;
		kind.style.fontSize = '11px';
		kind.style.padding = '1px 6px';
		kind.style.border = '1px solid var(--vscode-editorWhitespace-foreground)';
		kind.style.borderRadius = '10px';
		kind.style.color = 'var(--vscode-descriptionForeground)';

		const role = DOM.append(header, $('span'));
		role.textContent = turn.role;
		role.style.fontSize = '11px';
		role.style.color = 'var(--vscode-descriptionForeground)';

		const text = DOM.append(row, $('div'));
		text.textContent = turn.text;
		text.style.fontSize = '12px';
		text.style.color = 'var(--vscode-foreground)';
		text.style.whiteSpace = 'pre-wrap';
		text.style.wordBreak = 'break-word';

		if (turn.metadata) {
			const metadata = DOM.append(row, $('pre'));
			metadata.textContent = JSON.stringify(turn.metadata, null, 2);
			metadata.style.margin = '6px 0 0';
			metadata.style.padding = '6px 8px';
			metadata.style.background = 'var(--vscode-textCodeBlock-background)';
			metadata.style.borderRadius = '4px';
			metadata.style.fontSize = '11px';
			metadata.style.lineHeight = '1.4';
			metadata.style.color = 'var(--vscode-descriptionForeground)';
			metadata.style.whiteSpace = 'pre-wrap';
			metadata.style.wordBreak = 'break-word';
		}
	}
}

function formatTime(timestamp: string): string {
	try {
		return new Date(timestamp).toLocaleString();
	} catch {
		return timestamp;
	}
}
