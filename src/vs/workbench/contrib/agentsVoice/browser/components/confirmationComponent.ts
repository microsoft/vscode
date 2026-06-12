/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { html, nothing, type TemplateResult } from '../../../../../base/common/lit-html/lit-html.js';
import { localize } from '../../../../../nls.js';
import type { IPendingToolConfirmation } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { FONT_SIZE, FONT_WEIGHT } from './tokens.js';

export interface ToolConfirmationsProps {
	readonly confirmations: readonly IPendingToolConfirmation[];
	readonly onOpenSession: (resource: IPendingToolConfirmation['sessionResource']) => void;
}

export function renderToolConfirmations(props: ToolConfirmationsProps): TemplateResult | typeof nothing {
	if (props.confirmations.length === 0) {
		return nothing;
	}
	return html`
		<div style="display:flex;flex-direction:column;gap:4px;padding:6px 2px 2px;border-top:1px solid var(--vscode-editorWidget-background);margin-top:4px;">
			${props.confirmations.map(tc => tc.type === 'approval' ? html`
				<div style="display:flex;flex-direction:column;gap:3px;">
					<span style="font-size:${FONT_SIZE.body};color:var(--vscode-editorWarning-foreground);font-weight:${FONT_WEIGHT.medium};">${tc.sessionLabel}</span>
					<span style="font-size:${FONT_SIZE.body};color:var(--vscode-descriptionForeground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tc.description}</span>
					<div style="display:flex;gap:6px;">
						<button style="-webkit-app-region:no-drag;background:var(--vscode-charts-green);border:none;color:var(--vscode-button-foreground);font-size:${FONT_SIZE.body};padding:2px 8px;border-radius:3px;cursor:pointer;"
							@click=${() => tc.approve()}>${localize('agentsVoice.approve', "Approve")}</button>
						<button style="-webkit-app-region:no-drag;background:var(--vscode-editorError-foreground);border:none;color:var(--vscode-button-foreground);font-size:${FONT_SIZE.body};padding:2px 8px;border-radius:3px;cursor:pointer;"
							@click=${() => tc.deny()}>${localize('agentsVoice.deny', "Deny")}</button>
					</div>
				</div>
			` : html`
				<div style="display:flex;flex-direction:column;gap:3px;">
					<span style="font-size:${FONT_SIZE.body};color:var(--vscode-editorWarning-foreground);font-weight:${FONT_WEIGHT.medium};">${tc.sessionLabel}</span>
					<span style="font-size:${FONT_SIZE.body};color:var(--vscode-descriptionForeground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tc.description}</span>
					<div style="display:flex;gap:6px;">
						<button style="-webkit-app-region:no-drag;background:var(--vscode-button-background);border:none;color:var(--vscode-button-foreground);font-size:${FONT_SIZE.body};padding:2px 8px;border-radius:3px;cursor:pointer;"
							@click=${() => props.onOpenSession(tc.sessionResource)}>${localize('agentsVoice.openInVSCode', "Open in VS Code")}</button>
					</div>
				</div>
			`)}
		</div>
	`;
}
