/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import type { IPendingToolConfirmation } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { createToolConfirmations } from './confirmationComponent.js';
import { URI } from '../../../../../base/common/uri.js';
import { FONT_SIZE } from './tokens.js';

export interface StatusRowsProps {
	readonly workingCount: number;
	readonly needsInputCount: number;
	readonly doneCount: number;
	readonly speakingSessionLabel: string | undefined;
	readonly speakingSessionResource: URI | undefined;
	readonly pendingToolConfirmations: readonly IPendingToolConfirmation[];
	readonly onOpenSession: (resource: URI) => void;
	/** When false, hide the counter rows and the "No active sessions" placeholder. */
	readonly showCounters?: boolean;
}

function createStatusRow(): { element: HTMLElement; update(dotColor: string, count: number, label: string): void } {
	const row = dom.$('div');
	row.style.cssText = 'display:flex;align-items:center;gap:6px;height:20px;flex-shrink:0;padding-left:2px;';

	const dot = dom.$('span');
	dot.style.cssText = 'width:7px;height:7px;border-radius:50%;flex-shrink:0;';

	const text = dom.$('span');
	text.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-descriptionForeground);`;

	row.append(dot, text);

	return {
		element: row,
		update(dotColor: string, count: number, label: string) {
			if (count <= 0) {
				row.style.display = 'none';
				return;
			}
			row.style.display = 'flex';
			dot.style.background = dotColor;
			text.textContent = `${count} session${count > 1 ? 's' : ''} ${label}`;
		}
	};
}

export interface StatusRowsComponent {
	readonly element: HTMLElement;
	update(props: StatusRowsProps): void;
}

export function createStatusRows(): StatusRowsComponent {
	const container = dom.$('div');
	container.style.cssText = 'display:flex;flex-direction:column;';

	const inner = dom.$('div');
	inner.style.cssText = 'display:flex;flex-direction:column;';

	const speakingRow = dom.$('div');
	speakingRow.style.cssText = 'display:flex;align-items:center;gap:6px;height:20px;flex-shrink:0;padding-left:2px;';
	const speakingDot = dom.$('span');
	speakingDot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:var(--vscode-agentsVoice-speakingForeground);flex-shrink:0;animation:agents-voice-pulse 1.4s ease-in-out infinite;';
	const speakingLabel = dom.$('span');
	speakingLabel.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-agentsVoice-speakingForeground);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
	speakingRow.append(speakingDot, speakingLabel);
	let speakingClickHandler: (() => void) | undefined;
	let speakingKeyHandler: ((e: KeyboardEvent) => void) | undefined;

	const workingRow = createStatusRow();
	const needsInputRow = createStatusRow();
	const doneRow = createStatusRow();

	const noSessionsRow = dom.$('div');
	noSessionsRow.style.cssText = 'display:flex;align-items:center;height:20px;flex-shrink:0;padding-left:2px;';
	const noSessionsText = dom.$('span');
	noSessionsText.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-descriptionForeground);font-style:italic;`;
	noSessionsText.textContent = localize('agentsVoice.noActiveSessions', "No active sessions");
	noSessionsRow.append(noSessionsText);

	inner.append(speakingRow, workingRow.element, needsInputRow.element, doneRow.element, noSessionsRow);

	const confirmations = createToolConfirmations();

	const pulseStyle = dom.$('style');
	pulseStyle.textContent = '@keyframes agents-voice-pulse{0%,100%{opacity:1}50%{opacity:0.4}}';

	container.append(inner, confirmations.element, pulseStyle);

	return {
		element: container,
		update(props: StatusRowsProps) {
			const showCounters = props.showCounters ?? true;
			const hasAny = props.workingCount > 0 || props.needsInputCount > 0 || props.doneCount > 0 || !!props.speakingSessionLabel;

			if (props.speakingSessionLabel) {
				speakingRow.style.display = 'flex';
				speakingLabel.textContent = props.speakingSessionLabel;

				// Clean up previous handlers
				if (speakingClickHandler) {
					speakingRow.removeEventListener('click', speakingClickHandler);
					speakingClickHandler = undefined;
				}
				if (speakingKeyHandler) {
					speakingRow.removeEventListener('keydown', speakingKeyHandler);
					speakingKeyHandler = undefined;
				}

				if (props.speakingSessionResource) {
					const resource = props.speakingSessionResource;
					speakingClickHandler = () => props.onOpenSession(resource);
					speakingKeyHandler = (e: KeyboardEvent) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							props.onOpenSession(resource);
						}
					};
					speakingRow.addEventListener('click', speakingClickHandler);
					speakingRow.addEventListener('keydown', speakingKeyHandler);
					speakingRow.style.cursor = 'pointer';
					speakingRow.tabIndex = 0;
					speakingRow.setAttribute('role', 'button');
					speakingRow.title = localize('agentsVoice.jumpToSession', "Jump to session");
				} else {
					speakingRow.style.cursor = '';
					speakingRow.removeAttribute('tabIndex');
					speakingRow.removeAttribute('role');
					speakingRow.title = '';
				}
			} else {
				speakingRow.style.display = 'none';
				// Clean up when hidden
				if (speakingClickHandler) {
					speakingRow.removeEventListener('click', speakingClickHandler);
					speakingClickHandler = undefined;
				}
				if (speakingKeyHandler) {
					speakingRow.removeEventListener('keydown', speakingKeyHandler);
					speakingKeyHandler = undefined;
				}
				speakingRow.style.cursor = '';
				speakingRow.removeAttribute('tabIndex');
				speakingRow.removeAttribute('role');
				speakingRow.title = '';
			}

			if (showCounters) {
				workingRow.update('var(--vscode-charts-green)', props.workingCount, localize('agentsVoice.working', "working"));
				needsInputRow.update('var(--vscode-editorWarning-foreground)', props.needsInputCount, localize('agentsVoice.needsInput', "needs input"));
				doneRow.update('var(--vscode-disabledForeground)', props.doneCount, localize('agentsVoice.done', "done"));
				noSessionsRow.style.display = !hasAny ? 'flex' : 'none';
			} else {
				workingRow.element.style.display = 'none';
				needsInputRow.element.style.display = 'none';
				doneRow.element.style.display = 'none';
				noSessionsRow.style.display = 'none';
			}

			confirmations.update({
				confirmations: props.pendingToolConfirmations,
				onOpenSession: props.onOpenSession,
			});

			pulseStyle.style.display = props.speakingSessionLabel ? '' : 'none';
		}
	};
}
