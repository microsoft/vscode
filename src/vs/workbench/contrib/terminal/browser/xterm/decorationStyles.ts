/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fromNow, getDurationString } from '../../../../../base/common/date.js';
import { isNumber } from '../../../../../base/common/types.js';
import type { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import type { ITerminalCommand } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { terminalDecorationError, terminalDecorationIncomplete, terminalDecorationSuccess } from '../terminalIcons.js';

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

export function getTerminalDecorationHoverContent(command: ITerminalCommand | undefined, hoverMessage?: string, showCommandActions?: boolean): string {
	let hoverContent = showCommandActions ? `${localize('terminalPromptContextMenu', "Show Command Actions")}\n\n---\n\n` : '';
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
		if (isNumber(command.duration)) {
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
				hoverContent += localize('terminalPromptCommandSuccess', 'Command executed {0} now');
			}
		}
	}
	return hoverContent;
}

export interface ITerminalCommandDecorationPersistedState {
	exitCode?: number;
	timestamp?: number;
	duration?: number;
}

export const enum TerminalCommandDecorationStatus {
	Unknown = 'unknown',
	Running = 'running',
	Success = 'success',
	Error = 'error'
}

export interface ITerminalCommandDecorationState {
	status: TerminalCommandDecorationStatus;
	icon: ThemeIcon;
	classNames: string[];
	exitCode?: number;
	exitCodeText: string;
	startTimestamp?: number;
	startText: string;
	duration?: number;
	durationText: string;
	hoverMessage: string;
}

const unknownText = localize('terminalCommandDecoration.unknown', 'Unknown');
const runningText = localize('terminalCommandDecoration.running', 'Running');

export function getTerminalCommandDecorationTooltip(command?: ITerminalCommand, storedState?: ITerminalCommandDecorationPersistedState): string {
	if (command) {
		return getTerminalDecorationHoverContent(command);
	}
	if (!storedState) {
		return '';
	}
	const timestamp = storedState.timestamp;
	const exitCode = storedState.exitCode;
	const duration = storedState.duration;
	if (typeof timestamp !== 'number' || timestamp === undefined) {
		return '';
	}
	let hoverContent = '';
	const fromNowText = fromNow(timestamp, true);
	if (typeof duration === 'number') {
		const durationText = getDurationString(Math.max(duration, 0));
		if (exitCode) {
			if (exitCode === -1) {
				hoverContent += localize('terminalPromptCommandFailed.duration', 'Command executed {0}, took {1} and failed', fromNowText, durationText);
			} else {
				hoverContent += localize('terminalPromptCommandFailedWithExitCode.duration', 'Command executed {0}, took {1} and failed (Exit Code {2})', fromNowText, durationText, exitCode);
			}
		} else {
			hoverContent += localize('terminalPromptCommandSuccess.duration', 'Command executed {0} and took {1}', fromNowText, durationText);
		}
	} else {
		if (exitCode) {
			if (exitCode === -1) {
				hoverContent += localize('terminalPromptCommandFailed', 'Command executed {0} and failed', fromNowText);
			} else {
				hoverContent += localize('terminalPromptCommandFailedWithExitCode', 'Command executed {0} and failed (Exit Code {1})', fromNowText, exitCode);
			}
		} else {
			hoverContent += localize('terminalPromptCommandSuccess.', 'Command executed {0} ', fromNowText);
		}
	}
	return hoverContent;
}

export function getTerminalCommandDecorationState(
	command: ITerminalCommand | undefined,
	storedState?: ITerminalCommandDecorationPersistedState,
	now: number = Date.now()
): ITerminalCommandDecorationState {
	let status = TerminalCommandDecorationStatus.Unknown;
	const exitCode: number | undefined = command?.exitCode ?? storedState?.exitCode;
	let exitCodeText = unknownText;
	const startTimestamp: number | undefined = command?.timestamp ?? storedState?.timestamp;
	let startText = unknownText;
	let durationMs: number | undefined;
	let durationText = unknownText;

	if (typeof startTimestamp === 'number') {
		startText = new Date(startTimestamp).toLocaleString();
	}

	if (command) {
		if (command.exitCode === undefined) {
			status = TerminalCommandDecorationStatus.Running;
			exitCodeText = runningText;
			durationMs = startTimestamp !== undefined ? Math.max(0, now - startTimestamp) : undefined;
		} else if (command.exitCode !== 0) {
			status = TerminalCommandDecorationStatus.Error;
			exitCodeText = String(command.exitCode);
			durationMs = command.duration ?? (startTimestamp !== undefined ? Math.max(0, now - startTimestamp) : undefined);
		} else {
			status = TerminalCommandDecorationStatus.Success;
			exitCodeText = String(command.exitCode);
			durationMs = command.duration ?? (startTimestamp !== undefined ? Math.max(0, now - startTimestamp) : undefined);
		}
	} else if (storedState) {
		if (storedState.exitCode === undefined) {
			status = TerminalCommandDecorationStatus.Running;
			exitCodeText = runningText;
			durationMs = startTimestamp !== undefined ? Math.max(0, now - startTimestamp) : undefined;
		} else if (storedState.exitCode !== 0) {
			status = TerminalCommandDecorationStatus.Error;
			exitCodeText = String(storedState.exitCode);
			durationMs = storedState.duration;
		} else {
			status = TerminalCommandDecorationStatus.Success;
			exitCodeText = String(storedState.exitCode);
			durationMs = storedState.duration;
		}
	}

	if (typeof durationMs === 'number') {
		durationText = getDurationString(Math.max(durationMs, 0));
	}

	const classNames: string[] = [];
	let icon = terminalDecorationIncomplete;
	switch (status) {
		case TerminalCommandDecorationStatus.Running:
		case TerminalCommandDecorationStatus.Unknown:
			classNames.push(DecorationSelector.DefaultColor, DecorationSelector.Default);
			icon = terminalDecorationIncomplete;
			break;
		case TerminalCommandDecorationStatus.Error:
			classNames.push(DecorationSelector.ErrorColor);
			icon = terminalDecorationError;
			break;
		case TerminalCommandDecorationStatus.Success:
			classNames.push('success');
			icon = terminalDecorationSuccess;
			break;
	}

	const hoverMessage = getTerminalCommandDecorationTooltip(command, storedState);

	return {
		status,
		icon,
		classNames,
		exitCode,
		exitCodeText,
		startTimestamp,
		startText,
		duration: durationMs,
		durationText,
		hoverMessage
	};
}

export function updateLayout(configurationService: IConfigurationService, element?: HTMLElement): void {
	if (!element) {
		return;
	}
	const fontSize = configurationService.inspect(TerminalSettingId.FontSize).value;
	const defaultFontSize = configurationService.inspect(TerminalSettingId.FontSize).defaultValue;
	const lineHeight = configurationService.inspect(TerminalSettingId.LineHeight).value;
	if (isNumber(fontSize) && isNumber(defaultFontSize) && isNumber(lineHeight)) {
		const scalar = (fontSize / defaultFontSize) <= 1 ? (fontSize / defaultFontSize) : 1;
		// must be inlined to override the inlined styles from xterm
		element.style.width = `${scalar * DecorationStyles.DefaultDimension}px`;
		element.style.height = `${scalar * DecorationStyles.DefaultDimension * lineHeight}px`;
		element.style.fontSize = `${scalar * DecorationStyles.DefaultDimension}px`;
		element.style.marginLeft = `${scalar * DecorationStyles.MarginLeft}px`;
	}
}
