/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { html, nothing, type TemplateResult } from '../../../../../base/common/lit-html/lit-html.js';
import { localize } from '../../../../../nls.js';
import type { IPendingToolConfirmation } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { renderToolConfirmations } from './confirmationComponent.js';
import { URI } from '../../../../../base/common/uri.js';
import { FONT_SIZE } from './tokens.js';

export interface StatusRowsProps {
	readonly workingCount: number;
	readonly needsInputCount: number;
	readonly doneCount: number;
	readonly speakingSessionLabel: string | undefined;
	readonly pendingToolConfirmations: readonly IPendingToolConfirmation[];
	readonly onOpenSession: (resource: URI) => void;
	/** When false, hide the counter rows and the "No active sessions" placeholder. */
	readonly showCounters?: boolean;
}

function renderStatusRow(dotColor: string, count: number, label: string): TemplateResult | typeof nothing {
	if (count <= 0) {
		return nothing;
	}
	return html`
		<div style="display:flex;align-items:center;gap:6px;height:20px;flex-shrink:0;padding-left:2px;">
			<span style="width:7px;height:7px;border-radius:50%;background:${dotColor};flex-shrink:0;"></span>
			<span style="font-size:${FONT_SIZE.body};color:var(--vscode-descriptionForeground);">${count} session${count > 1 ? 's' : ''} ${label}</span>
		</div>
	`;
}

export function renderStatusRows(props: StatusRowsProps): TemplateResult {
	const showCounters = props.showCounters ?? true;
	const hasAny = props.workingCount > 0 || props.needsInputCount > 0 || props.doneCount > 0 || !!props.speakingSessionLabel;

	return html`
		<div style="display:flex;flex-direction:column;">
			<div style="display:flex;flex-direction:column;">
				${props.speakingSessionLabel ? html`
					<div style="display:flex;align-items:center;gap:6px;height:20px;flex-shrink:0;padding-left:2px;">
						<span style="width:7px;height:7px;border-radius:50%;background:var(--vscode-agentsVoice-speakingForeground);flex-shrink:0;animation:agents-voice-pulse 1.4s ease-in-out infinite;"></span>
						<span style="font-size:${FONT_SIZE.body};color:var(--vscode-agentsVoice-speakingForeground);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${props.speakingSessionLabel}</span>
					</div>
				` : nothing}
				${showCounters ? renderStatusRow('var(--vscode-charts-green)', props.workingCount, localize('agentsVoice.working', "working")) : nothing}
				${showCounters ? renderStatusRow('var(--vscode-editorWarning-foreground)', props.needsInputCount, localize('agentsVoice.needsInput', "needs input")) : nothing}
				${showCounters ? renderStatusRow('var(--vscode-disabledForeground)', props.doneCount, localize('agentsVoice.done', "done")) : nothing}
				${showCounters && !hasAny ? html`
					<div style="display:flex;align-items:center;height:20px;flex-shrink:0;padding-left:2px;">
						<span style="font-size:${FONT_SIZE.body};color:var(--vscode-descriptionForeground);font-style:italic;">${localize('agentsVoice.noActiveSessions', "No active sessions")}</span>
					</div>
				` : nothing}
			</div>
			${renderToolConfirmations({
		confirmations: props.pendingToolConfirmations,
		onOpenSession: props.onOpenSession,
	})}
			${props.speakingSessionLabel ? html`<style>@keyframes agents-voice-pulse{0%,100%{opacity:1}50%{opacity:0.4}}</style>` : nothing}
		</div>
	`;
}
