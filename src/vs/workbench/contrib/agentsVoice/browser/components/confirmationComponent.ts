/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import type { IPendingToolConfirmation } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { FONT_SIZE, FONT_WEIGHT } from './tokens.js';

export interface ToolConfirmationsProps {
	readonly confirmations: readonly IPendingToolConfirmation[];
	readonly onOpenSession: (resource: IPendingToolConfirmation['sessionResource']) => void;
}

function createConfirmationRow(tc: IPendingToolConfirmation, onOpenSession: ToolConfirmationsProps['onOpenSession']): HTMLElement {
	const row = dom.$('div');
	row.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

	const label = dom.$('span');
	label.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-editorWarning-foreground);font-weight:${FONT_WEIGHT.medium};`;
	label.textContent = tc.sessionLabel;

	const desc = dom.$('span');
	desc.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-descriptionForeground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
	desc.textContent = tc.description;

	const btnRow = dom.$('div');
	btnRow.style.cssText = 'display:flex;gap:6px;';

	const btnStyle = `-webkit-app-region:no-drag;border:none;color:var(--vscode-button-foreground);font-size:${FONT_SIZE.body};padding:2px 8px;border-radius:3px;cursor:pointer;`;

	if (tc.type === 'approval') {
		const approveBtn = dom.$('button');
		approveBtn.style.cssText = `${btnStyle}background:var(--vscode-charts-green);`;
		approveBtn.textContent = localize('agentsVoice.approve', "Approve");
		approveBtn.addEventListener('click', () => tc.approve());

		const denyBtn = dom.$('button');
		denyBtn.style.cssText = `${btnStyle}background:var(--vscode-editorError-foreground);`;
		denyBtn.textContent = localize('agentsVoice.deny', "Deny");
		denyBtn.addEventListener('click', () => tc.deny());

		btnRow.append(approveBtn, denyBtn);
	} else {
		const openBtn = dom.$('button');
		openBtn.style.cssText = `${btnStyle}background:var(--vscode-button-background);`;
		openBtn.textContent = localize('agentsVoice.openInVSCode', "Open in VS Code");
		openBtn.addEventListener('click', () => onOpenSession(tc.sessionResource));

		btnRow.append(openBtn);
	}

	row.append(label, desc, btnRow);
	return row;
}

export interface ToolConfirmationsComponent {
	readonly element: HTMLElement;
	update(props: ToolConfirmationsProps): void;
}

export function createToolConfirmations(): ToolConfirmationsComponent {
	const container = dom.$('div');
	container.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:6px 2px 2px;border-top:1px solid var(--vscode-editorWidget-background);margin-top:4px;';

	return {
		element: container,
		update(props: ToolConfirmationsProps) {
			dom.clearNode(container);
			if (props.confirmations.length === 0) {
				container.style.display = 'none';
				return;
			}
			container.style.display = 'flex';
			for (const tc of props.confirmations) {
				container.append(createConfirmationRow(tc, props.onOpenSession));
			}
		}
	};
}
