/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fromNow, getDurationString } from '../../../../../base/common/date.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITerminalCommand } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';

const enum DecorationStyles {
	DefaultDimension = 16,
	MarginLeft = -17,
}

export const enum DecorationSelector {
	CommandDecoration = 'terminal-command-decoration',
	Hide = 'hide',
	ErrorColor = 'error',
	DefaultColor = 'default-color',
	Default = 'default',
	Codicon = 'codicon',
	XtermDecoration = 'xterm-decoration',
	OverviewRuler = '.xterm-decoration-overview-ruler',
}

export function getTerminalDecorationHoverContent(command: ITerminalCommand | undefined, hoverMessage?: string): string {
	let hoverContent = `${localize('terminalPromptContextMenu', "Show Command Actions")}`;
	hoverContent += '\n\n---\n\n';
	if (!command) {
		if (hoverMessage) {
			hoverContent = hoverMessage;
		} else {
			return '';
		}
	} else if (command.markProperties || hoverMessage) {
		if (command.markProperties?.hoverMessage || hoverMessage) {
			hoverContent = command.markProperties?.hoverMessage || hoverMessage || '';
		} else {
			return '';
		}
	} else {
		if (command.duration) {
			const durationText = getDurationString(command.duration);
			if (command.exitCode) {
				if (command.exitCode === -1) {
					hoverContent += localize('terminalPromptCommandFailed.duration', 'Command executed {0}, took {1} and failed', fromNow(command.timestamp, true), durationText);
				} else {
					hoverContent += localize('terminalPromptCommandFailedWithExitCode.duration', 'Command executed {0}, took {1} and failed (Exit Code {2})', fromNow(command.timestamp, true), durationText, command.exitCode);
				}
			} else {
				hoverContent += localize('terminalPromptCommandSuccess.duration', 'Command executed {0} and took {1}', fromNow(command.timestamp, true), durationText);
			}
		} else {
			if (command.exitCode) {
				if (command.exitCode === -1) {
					hoverContent += localize('terminalPromptCommandFailed', 'Command executed {0} and failed', fromNow(command.timestamp, true));
				} else {
					hoverContent += localize('terminalPromptCommandFailedWithExitCode', 'Command executed {0} and failed (Exit Code {1})', fromNow(command.timestamp, true), command.exitCode);
				}
			} else {
				hoverContent += localize('terminalPromptCommandSuccess', 'Command executed {0}', fromNow(command.timestamp, true));
			}
		}
	}
	return hoverContent;
}

export function updateLayout(configurationService: IConfigurationService, element?: HTMLElement): void {
	if (!element) {
		return;
	}
	const fontSize = configurationService.inspect(TerminalSettingId.FontSize).value;
	const defaultFontSize = configurationService.inspect(TerminalSettingId.FontSize).defaultValue;
	const lineHeight = configurationService.inspect(TerminalSettingId.LineHeight).value;
	if (typeof fontSize === 'number' && typeof defaultFontSize === 'number' && typeof lineHeight === 'number') {
		const scalar = (fontSize / defaultFontSize) <= 1 ? (fontSize / defaultFontSize) : 1;
		// must be inlined to override the inlined styles from xterm
		element.style.width = `${scalar * DecorationStyles.DefaultDimension}px`;
		element.style.height = `${scalar * DecorationStyles.DefaultDimension * lineHeight}px`;
		element.style.fontSize = `${scalar * DecorationStyles.DefaultDimension}px`;
		element.style.marginLeft = `${scalar * DecorationStyles.MarginLeft}px`;
	}
}
