/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { html, nothing, type TemplateResult } from '../../../../../base/common/lit-html/lit-html.js';
import type { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import type { IPendingToolConfirmation } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { FONT_SIZE } from './tokens.js';

export interface SessionRowData {
	readonly resource: URI;
	readonly label: string;
	readonly isActive: boolean;
	readonly needsInput: boolean;
	readonly isIdle: boolean;
	readonly isSpeaking: boolean;
	readonly insertions: number;
	readonly deletions: number;
	readonly toolConfirmation: IPendingToolConfirmation | undefined;
}

export interface SessionGroupData {
	readonly label: string;
	readonly sessions: readonly SessionRowData[];
}

export interface SessionListProps {
	readonly sessions: readonly SessionRowData[];
	readonly groups?: readonly SessionGroupData[];
	readonly selectedTarget?: URI;
	readonly onOpenSession: (resource: URI) => void;
	readonly onStopSession: (resource: URI) => void;
	readonly onCancelSession: (resource: URI) => void;
	readonly onSelectTarget: (resource: URI | undefined) => void;
	readonly onNewSession: () => void;
}

function renderSessionRow(session: SessionRowData, props: SessionListProps): TemplateResult {
	const isSelected = props.selectedTarget?.toString() === session.resource.toString();
	const dotColor = session.needsInput ? 'var(--vscode-editorWarning-foreground)'
		: session.isActive ? 'var(--vscode-charts-green)'
			: 'var(--vscode-editorWhitespace-foreground)';
	const effectiveDotColor = session.isSpeaking ? 'var(--vscode-agentsVoice-speakingForeground)' : dotColor;
	const shouldPulse = session.isActive || session.isSpeaking;

	const labelColor = session.isSpeaking ? 'var(--vscode-agentsVoice-speakingForeground)'
		: session.isIdle ? 'var(--vscode-descriptionForeground)'
			: 'var(--vscode-foreground)';
	const labelWeight = session.isSpeaking ? '500' : 'normal';

	const rowBg = isSelected ? 'background:var(--vscode-list-activeSelectionBackground);border-radius:4px;' : '';
	const rowLabelColor = isSelected ? 'var(--vscode-list-activeSelectionForeground)' : labelColor;

	return html`
		<div
			role="option"
			tabindex="0"
			aria-label="${session.label || 'Untitled session'}"
			aria-selected="${isSelected}"
			style="display:flex;align-items:center;gap:6px;height:28px;padding:0 4px;border-bottom:1px solid var(--vscode-editorGroup-border);flex-shrink:0;cursor:pointer;${rowBg}"
			@click=${(e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (isSelected) {
				props.onSelectTarget(undefined);
			} else {
				props.onSelectTarget(session.resource);
			}
		}}
			@mouseenter=${(e: MouseEvent) => {
			const row = e.currentTarget as HTMLElement;
			// eslint-disable-next-line no-restricted-syntax
			const stats = row.querySelector('[data-role="stats"]') as HTMLElement | null;
			// eslint-disable-next-line no-restricted-syntax
			const actions = row.querySelector('[data-role="actions"]') as HTMLElement | null;
			if (stats) { stats.style.display = 'none'; }
			if (actions) { actions.style.display = 'flex'; }
		}}
			@mouseleave=${(e: MouseEvent) => {
			const row = e.currentTarget as HTMLElement;
			// eslint-disable-next-line no-restricted-syntax
			const stats = row.querySelector('[data-role="stats"]') as HTMLElement | null;
			// eslint-disable-next-line no-restricted-syntax
			const actions = row.querySelector('[data-role="actions"]') as HTMLElement | null;
			if (stats) { stats.style.display = 'flex'; }
			if (actions) { actions.style.display = 'none'; }
		}}>
			${isSelected ? html`<span class="codicon codicon-check" style="font-size:10px;color:${rowLabelColor};flex-shrink:0;"></span>` : html`<span style="width:7px;height:7px;border-radius:50%;background:${effectiveDotColor};flex-shrink:0;${shouldPulse ? 'animation:agents-voice-pulse 1.4s ease-in-out infinite;' : ''}"></span>`}
			<span style="font-size:${FONT_SIZE.body};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${rowLabelColor};font-weight:${labelWeight};">${session.label || 'Untitled session'}</span>
			<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
				<span data-role="stats" style="display:flex;gap:4px;font-size:${FONT_SIZE.body};">
					${session.insertions > 0 ? html`<span style="color:var(--vscode-charts-green);">+${session.insertions}</span>` : nothing}
					${session.deletions > 0 ? html`<span style="color:var(--vscode-editorError-foreground);">-${session.deletions}</span>` : nothing}
				</span>
				<span data-role="actions" style="display:none;gap:4px;align-items:center;">
					<span
						class="codicon codicon-link-external"
						role="button"
						tabindex="0"
						aria-label="${localize('agentsVoice.openSessionAction', "Open session")}"
						style="font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:1px;"
						@mouseenter=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-foreground)'; }}
						@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-descriptionForeground)'; }}
						@mousedown=${(e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); props.onOpenSession(session.resource); }}></span>
					${!session.isIdle ? html`
						<span
							class="codicon codicon-debug-stop"
							role="button"
							tabindex="0"
							aria-label="${localize('agentsVoice.stopSessionAction', "Stop session")}"
							style="font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:1px;"
							@mouseenter=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-editorError-foreground)'; }}
							@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-descriptionForeground)'; }}
							@mousedown=${(e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); props.onStopSession(session.resource); }}></span>
					` : nothing}
				</span>
			</div>
		</div>
		${session.toolConfirmation ? html`
			<div style="display:flex;flex-direction:column;gap:3px;padding:2px 2px 6px 15px;border-bottom:1px solid var(--vscode-panel-border);">
				<span style="font-size:${FONT_SIZE.body};color:var(--vscode-editorWarning-foreground);">${session.toolConfirmation.description}</span>
				<div style="display:flex;gap:6px;">
					${session.toolConfirmation.type === 'approval' ? html`
						<button style="-webkit-app-region:no-drag;background:var(--vscode-charts-green);border:none;color:var(--vscode-button-foreground);font-size:${FONT_SIZE.body};padding:2px 8px;border-radius:3px;cursor:pointer;"
							@click=${() => session.toolConfirmation!.approve()}>${localize('agentsVoice.approve', "Approve")}</button>
						<button style="-webkit-app-region:no-drag;background:var(--vscode-button-secondaryBackground);border:none;color:var(--vscode-foreground);font-size:${FONT_SIZE.body};padding:2px 8px;border-radius:3px;cursor:pointer;"
							@click=${() => session.toolConfirmation!.deny()}>${localize('agentsVoice.deny', "Deny")}</button>
						<button style="-webkit-app-region:no-drag;background:var(--vscode-button-secondaryBackground);border:none;color:var(--vscode-foreground);font-size:${FONT_SIZE.body};padding:2px 8px;border-radius:3px;cursor:pointer;"
							@click=${() => props.onCancelSession(session.resource)}>${localize('agentsVoice.stop', "Stop")}</button>
					` : html`
						<button style="-webkit-app-region:no-drag;background:var(--vscode-button-background);border:none;color:var(--vscode-button-foreground);font-size:${FONT_SIZE.body};padding:2px 8px;border-radius:3px;cursor:pointer;"
							@click=${() => props.onOpenSession(session.resource)}>${localize('agentsVoice.openInVSCode', "Open in VS Code")}</button>
					`}
				</div>
			</div>
		` : nothing}
	`;
}

export function renderSessionList(props: SessionListProps): TemplateResult {
	const hasGroups = props.groups && props.groups.length > 0;
	const hasSessions = props.sessions.length > 0;

	const headerRow = html`
		<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 2px 4px;border-bottom:1px solid var(--vscode-editorGroup-border);">
			<span style="font-size:${FONT_SIZE.micro};color:var(--vscode-disabledForeground);text-transform:uppercase;letter-spacing:0.5px;font-weight:500;">${props.selectedTarget ? localize('agentsVoice.sendTo', "Send to") : localize('agentsVoice.sendToActive', "Send to (active)")}</span>
			<span
				class="codicon codicon-add"
				role="button"
				tabindex="0"
				aria-label="${localize('agentsVoice.newSession', "New session")}"
				style="font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:1px 2px;"
				title="${localize('agentsVoice.newSession', "New session")}"
				@mouseenter=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-foreground)'; }}
				@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-descriptionForeground)'; }}
				@mousedown=${(e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); props.onNewSession(); }}></span>
		</div>
	`;

	if (!hasGroups && !hasSessions) {
		return html`
			<div style="display:flex;flex-direction:column;min-height:84px;max-height:140px;overflow-y:auto;">
				${headerRow}
				<div style="display:flex;align-items:center;justify-content:center;height:60px;">
					<span style="font-size:${FONT_SIZE.body};color:var(--vscode-foreground);">${localize('agentsVoice.noActiveSessions', "No active sessions")}</span>
				</div>
			</div>
		`;
	}

	if (hasGroups) {
		return html`
			<div class="voice-session-list" style="display:flex;flex-direction:column;min-height:84px;max-height:320px;overflow-y:auto;margin:0 -14px 0 0;padding-right:8px;">
				${headerRow}
				${props.groups!.map(group => html`
					<div style="padding:4px 2px 2px;">
						<span style="font-size:${FONT_SIZE.micro};color:var(--vscode-disabledForeground);text-transform:uppercase;letter-spacing:0.5px;font-weight:500;">${group.label}</span>
					</div>
					${group.sessions.map(session => renderSessionRow(session, props))}
				`)}
				<style>
					@keyframes agents-voice-pulse{0%,100%{opacity:1}50%{opacity:0.4}}
					.voice-session-list::-webkit-scrollbar{width:6px;background:transparent;}
					.voice-session-list::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-activeBackground);border-radius:3px;}
					.voice-session-list::-webkit-scrollbar-thumb:hover{background:var(--vscode-scrollbarSlider-activeBackground);}
					.voice-session-list > div:last-of-type{border-bottom:none !important;}
				</style>
			</div>
		`;
	}

	return html`
		<div class="voice-session-list" style="display:flex;flex-direction:column;min-height:84px;max-height:320px;overflow-y:auto;margin:0 -14px 0 0;padding-right:8px;">
			${headerRow}
			${props.sessions.map(session => renderSessionRow(session, props))}
			<style>
				@keyframes agents-voice-pulse{0%,100%{opacity:1}50%{opacity:0.4}}
				.voice-session-list::-webkit-scrollbar{width:6px;background:transparent;}
				.voice-session-list::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-activeBackground);border-radius:3px;}
				.voice-session-list::-webkit-scrollbar-thumb:hover{background:var(--vscode-scrollbarSlider-activeBackground);}
					.voice-session-list > div:last-of-type{border-bottom:none !important;}
			</style>
		</div>
	`;
}
