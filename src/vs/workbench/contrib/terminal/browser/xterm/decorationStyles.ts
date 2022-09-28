/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from 'vs/base/browser/dom';
import { Delayer } from 'vs/base/common/async';
import { fromNow } from 'vs/base/common/date';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { ITerminalCommand } from 'vs/workbench/contrib/terminal/common/terminal';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';

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
	QuickFix = 'quick-fix',
	LightBulb = 'codicon-light-bulb'
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

export function createHover(hoverService: IHoverService, element: HTMLElement, command: ITerminalCommand | undefined, hoverDelayer: Delayer<void>, hideHover: (hoverDelayer?: Delayer<void>, hoverService?: IHoverService) => void, contextMenuVisible: boolean, hoverMessage?: string): IDisposable[] {
	return [
		dom.addDisposableListener(element, dom.EventType.MOUSE_ENTER, () => {
			if (contextMenuVisible) {
				return;
			}
			hoverDelayer.trigger(() => {
				let hoverContent = `${localize('terminalPromptContextMenu', "Show Command Actions")}`;
				hoverContent += '\n\n---\n\n';
				if (!command) {
					if (hoverMessage) {
						hoverContent = hoverMessage;
					} else {
						return;
					}
				} else if (command.markProperties || hoverMessage) {
					if (command.markProperties?.hoverMessage || hoverMessage) {
						hoverContent = command.markProperties?.hoverMessage || hoverMessage || '';
					} else {
						return;
					}
				} else if (command.exitCode) {
					if (command.exitCode === -1) {
						hoverContent += localize('terminalPromptCommandFailed', 'Command executed {0} and failed', fromNow(command.timestamp, true));
					} else {
						hoverContent += localize('terminalPromptCommandFailedWithExitCode', 'Command executed {0} and failed (Exit Code {1})', fromNow(command.timestamp, true), command.exitCode);
					}
				} else {
					hoverContent += localize('terminalPromptCommandSuccess', 'Command executed {0}', fromNow(command.timestamp, true));
				}
				hoverService.showHover({ content: new MarkdownString(hoverContent), target: element });
			});
		}),
		dom.addDisposableListener(element, dom.EventType.MOUSE_LEAVE, () => hideHover(hoverDelayer, hoverService)),
		dom.addDisposableListener(element, dom.EventType.MOUSE_OUT, () => hideHover(hoverDelayer, hoverService))
	];
}
