/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import type { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import type { IPendingToolConfirmation } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { FONT_SIZE, addKeyboardActivation } from './tokens.js';

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

function hoverIcon(className: string, ariaLabel: string): HTMLElement {
	const el = dom.$(`span.codicon.${className}`);
	el.role = 'button';
	el.tabIndex = 0;
	el.ariaLabel = ariaLabel;
	el.style.cssText = `font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:1px;`;
	el.addEventListener('mouseenter', () => { el.style.color = 'var(--vscode-foreground)'; });
	el.addEventListener('mouseleave', () => { el.style.color = 'var(--vscode-descriptionForeground)'; });
	addKeyboardActivation(el);
	return el;
}

function createSessionRow(session: SessionRowData, props: SessionListProps): HTMLElement {
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

	const row = dom.$('div');
	row.role = 'option';
	row.tabIndex = 0;
	row.ariaLabel = session.label || 'Untitled session';
	row.setAttribute('aria-selected', String(isSelected));
	row.style.cssText = `display:flex;align-items:center;gap:6px;height:28px;padding:0 4px;border-bottom:1px solid var(--vscode-editorGroup-border);flex-shrink:0;cursor:pointer;${rowBg}`;

	row.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (isSelected) {
			props.onSelectTarget(undefined);
		} else {
			props.onSelectTarget(session.resource);
		}
	});
	row.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			row.click();
		}
	});

	const showActions = () => {
		if (stats) { stats.style.display = 'none'; }
		if (actions) { actions.style.display = 'flex'; }
	};
	const hideActions = () => {
		if (stats) { stats.style.display = 'flex'; }
		if (actions) { actions.style.display = 'none'; }
	};
	row.addEventListener('mouseenter', showActions);
	row.addEventListener('mouseleave', hideActions);
	row.addEventListener('focusin', showActions);
	row.addEventListener('focusout', (e) => {
		if (!row.contains((e as FocusEvent).relatedTarget as Node | null)) {
			hideActions();
		}
	});

	// Dot or check
	if (isSelected) {
		const check = dom.$('span.codicon.codicon-check');
		check.style.cssText = `font-size:10px;color:${rowLabelColor};flex-shrink:0;`;
		row.append(check);
	} else {
		const dot = dom.$('span');
		dot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${effectiveDotColor};flex-shrink:0;${shouldPulse ? 'animation:agents-voice-pulse 1.4s ease-in-out infinite;' : ''}`;
		row.append(dot);
	}

	// Label
	const label = dom.$('span');
	label.style.cssText = `font-size:${FONT_SIZE.body};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${rowLabelColor};font-weight:${labelWeight};`;
	label.textContent = session.label || 'Untitled session';
	row.append(label);

	// Actions container
	const actionsContainer = dom.$('div');
	actionsContainer.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0;';

	const stats = dom.$('span');
	stats.setAttribute('data-role', 'stats');
	stats.style.cssText = `display:flex;gap:4px;font-size:${FONT_SIZE.body};`;
	if (session.insertions > 0) {
		const ins = dom.$('span');
		ins.style.color = 'var(--vscode-charts-green)';
		ins.textContent = `+${session.insertions}`;
		stats.append(ins);
	}
	if (session.deletions > 0) {
		const del = dom.$('span');
		del.style.color = 'var(--vscode-editorError-foreground)';
		del.textContent = `-${session.deletions}`;
		stats.append(del);
	}

	const actions = dom.$('span');
	actions.setAttribute('data-role', 'actions');
	actions.style.cssText = 'display:none;gap:4px;align-items:center;';

	if (!session.isIdle) {
		const stopBtn = hoverIcon('codicon-debug-stop', localize('agentsVoice.stopSessionAction', "Stop session"));
		stopBtn.addEventListener('mouseenter', () => { stopBtn.style.color = 'var(--vscode-editorError-foreground)'; });
		stopBtn.addEventListener('mouseleave', () => { stopBtn.style.color = 'var(--vscode-descriptionForeground)'; });
		stopBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); props.onStopSession(session.resource); });
		actions.append(stopBtn);
	}

	actionsContainer.append(stats, actions);
	row.append(actionsContainer);

	const wrapper = dom.$('div');
	wrapper.append(row);

	// Tool confirmation
	if (session.toolConfirmation) {
		const tc = session.toolConfirmation;
		const confRow = dom.$('div');
		confRow.style.cssText = 'display:flex;flex-direction:column;gap:3px;padding:2px 2px 6px 15px;border-bottom:1px solid var(--vscode-panel-border);';

		const confDesc = dom.$('span');
		confDesc.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-editorWarning-foreground);`;
		confDesc.textContent = tc.description;

		const confBtns = dom.$('div');
		confBtns.style.cssText = 'display:flex;gap:6px;';

		const btnStyle = `-webkit-app-region:no-drag;border:none;color:var(--vscode-button-foreground);font-size:${FONT_SIZE.body};padding:2px 8px;border-radius:3px;cursor:pointer;`;

		if (tc.type === 'approval') {
			const approveBtn = dom.$('button');
			approveBtn.style.cssText = `${btnStyle}background:var(--vscode-charts-green);`;
			approveBtn.textContent = localize('agentsVoice.approve', "Approve");
			approveBtn.addEventListener('click', () => tc.approve());

			const denyBtn = dom.$('button');
			denyBtn.style.cssText = `${btnStyle}background:var(--vscode-button-secondaryBackground);color:var(--vscode-foreground);`;
			denyBtn.textContent = localize('agentsVoice.deny', "Deny");
			denyBtn.addEventListener('click', () => tc.deny());

			const stopBtn = dom.$('button');
			stopBtn.style.cssText = `${btnStyle}background:var(--vscode-button-secondaryBackground);color:var(--vscode-foreground);`;
			stopBtn.textContent = localize('agentsVoice.stop', "Stop");
			stopBtn.addEventListener('click', () => props.onCancelSession(session.resource));

			confBtns.append(approveBtn, denyBtn, stopBtn);
		} else {
			const openInVSCode = dom.$('button');
			openInVSCode.style.cssText = `${btnStyle}background:var(--vscode-button-background);`;
			openInVSCode.textContent = localize('agentsVoice.openInVSCode', "Open in VS Code");
			openInVSCode.addEventListener('click', () => props.onOpenSession(session.resource));
			confBtns.append(openInVSCode);
		}

		confRow.append(confDesc, confBtns);
		wrapper.append(confRow);
	}

	return wrapper;
}

export interface SessionListComponent {
	readonly element: HTMLElement;
	update(props: SessionListProps): void;
}

export function createSessionList(): SessionListComponent {
	const container = dom.$('div.voice-session-list');
	container.style.cssText = 'display:flex;flex-direction:column;min-height:84px;max-height:320px;overflow-y:auto;margin:0 -14px 0 0;padding-right:8px;';

	const style = dom.$('style');
	style.textContent = `
		@keyframes agents-voice-pulse{0%,100%{opacity:1}50%{opacity:0.4}}
		.voice-session-list::-webkit-scrollbar{width:6px;background:transparent;}
		.voice-session-list::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-activeBackground);border-radius:3px;}
		.voice-session-list::-webkit-scrollbar-thumb:hover{background:var(--vscode-scrollbarSlider-activeBackground);}
		.voice-session-list > div:last-of-type{border-bottom:none !important;}
	`;

	return {
		element: container,
		update(props: SessionListProps) {
			dom.clearNode(container);

			const hasGroups = props.groups && props.groups.length > 0;
			const hasSessions = props.sessions.length > 0;

			// Header row
			const headerRow = dom.$('div');
			headerRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:2px 2px 4px;border-bottom:1px solid var(--vscode-editorGroup-border);';

			const headerLabel = dom.$('span');
			headerLabel.style.cssText = `font-size:${FONT_SIZE.micro};color:var(--vscode-disabledForeground);text-transform:uppercase;letter-spacing:0.5px;font-weight:500;`;
			headerLabel.textContent = props.selectedTarget ? localize('agentsVoice.sendTo', "Send to") : localize('agentsVoice.sendToActive', "Send to (active)");

			const addBtn = hoverIcon('codicon-add', localize('agentsVoice.newSession', "New session"));
			addBtn.title = localize('agentsVoice.newSession', "New session");
			addBtn.style.cssText += 'padding:1px 2px;';
			addBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); props.onNewSession(); });

			headerRow.append(headerLabel, addBtn);
			container.append(headerRow);

			if (!hasGroups && !hasSessions) {
				const empty = dom.$('div');
				empty.style.cssText = 'display:flex;align-items:center;justify-content:center;height:60px;';
				const emptyText = dom.$('span');
				emptyText.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-foreground);`;
				emptyText.textContent = localize('agentsVoice.noActiveSessions', "No active sessions");
				empty.append(emptyText);
				container.append(empty);
			} else if (hasGroups) {
				for (const group of props.groups!) {
					const groupHeader = dom.$('div');
					groupHeader.style.cssText = 'padding:4px 2px 2px;';
					const groupLabel = dom.$('span');
					groupLabel.style.cssText = `font-size:${FONT_SIZE.micro};color:var(--vscode-disabledForeground);text-transform:uppercase;letter-spacing:0.5px;font-weight:500;`;
					groupLabel.textContent = group.label;
					groupHeader.append(groupLabel);
					container.append(groupHeader);

					for (const session of group.sessions) {
						container.append(createSessionRow(session, props));
					}
				}
			} else {
				for (const session of props.sessions) {
					container.append(createSessionRow(session, props));
				}
			}

			container.append(style);
		}
	};
}
