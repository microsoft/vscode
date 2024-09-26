/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Delayer } from '../../../../../base/common/async.js';
import { fromNow, getDurationString } from '../../../../../base/common/date.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { combinedDisposable, Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { ITerminalCommand } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';

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
