/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Delayer } from 'vs/base/common/async';
import { fromNow } from 'vs/base/common/date';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { combinedDisposable, Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
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
	QuickFix = 'quick-fix'
}

export class TerminalDecorationHoverManager extends Disposable {
	private _hoverDelayer: Delayer<void>;
	private _contextMenuVisible: boolean = false;

	constructor(@IHoverService private readonly _hoverService: IHoverService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService contextMenuService: IContextMenuService) {
		super();
		this._register(contextMenuService.onDidShowContextMenu(() => this._contextMenuVisible = true));
		this._register(contextMenuService.onDidHideContextMenu(() => this._contextMenuVisible = false));
		this._hoverDelayer = this._register(new Delayer(configurationService.getValue('workbench.hover.delay')));
	}

	public hideHover() {
		this._hoverDelayer.cancel();
		this._hoverService.hideHover();
	}

	createHover(element: HTMLElement, command: ITerminalCommand | undefined, hoverMessage?: string): IDisposable {
		return combinedDisposable(
			dom.addDisposableListener(element, dom.EventType.MOUSE_ENTER, () => {
				if (this._contextMenuVisible) {
					return;
				}
				this._hoverDelayer.trigger(() => {
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
					this._hoverService.showHover({ content: new MarkdownString(hoverContent), target: element });
				});
			}),
			dom.addDisposableListener(element, dom.EventType.MOUSE_LEAVE, () => this.hideHover()),
			dom.addDisposableListener(element, dom.EventType.MOUSE_OUT, () => this.hideHover())
		);
	}

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
