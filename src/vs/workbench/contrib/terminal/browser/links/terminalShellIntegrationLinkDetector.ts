/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { ITerminalSimpleLink, ITerminalLinkDetector, TerminalBuiltinLinkType } from 'vs/workbench/contrib/terminal/browser/links/links';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';
import { IBufferCell, IBufferLine, Terminal } from 'xterm';

interface IShellIntegrationLink {
	type: LinkType;
	codes: Uint8Array;
}

const enum LinkType {
	// This is intentionally not localized currently as it must match the text in the shell script
	Activated = 'Shell integration activated',
	Disabled = 'Shell integration cannot be activated due to complex PROMPT_COMMAND:'
}

const activatedLink: IShellIntegrationLink = { type: LinkType.Activated, codes: getCodesForText(LinkType.Activated) };
const disabledLink: IShellIntegrationLink = { type: LinkType.Disabled, codes: getCodesForText(LinkType.Disabled) };

function getCodesForText(text: string): Uint8Array {
	return new Uint8Array(text.split('').map(e => e.charCodeAt(0)));
}

export class TerminalShellIntegrationLinkDetector implements ITerminalLinkDetector {
	static id = 'shellintegration';

	constructor(
		readonly xterm: Terminal,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
	}

	detect(lines: IBufferLine[], startLine: number, endLine: number): ITerminalSimpleLink[] {
		const match = this._matches(lines);
		if (match) {
			return [{
				text: match,
				type: TerminalBuiltinLinkType.Url,
				label: localize('learn', 'Learn about shell integration'),
				uri: URI.from({
					scheme: Schemas.https,
					path: 'aka.ms/vscode-shell-integration'
				}),
				bufferRange: {
					start: { x: 1, y: startLine + 1 },
					end: { x: match.length % this.xterm.cols, y: startLine + Math.floor(match.length / this.xterm.cols) + 1 }
				},
				actions: [{
					label: terminalStrings.doNotShowAgain,
					commandId: '',
					run: () => this._hideMessage()
				}]
			}];
		}

		return [];
	}

	private _matches(lines: IBufferLine[]): LinkType | undefined {
		if (lines[0].length < activatedLink.codes.length && lines[0].length < disabledLink.codes.length) {
			return undefined;
		}
		let cell: IBufferCell | undefined;
		let i: number = 0;
		for (; i < activatedLink.codes.length; i++) {
			cell = lines[Math.floor(i / this.xterm.cols)].getCell(i % this.xterm.cols, cell);
			if (cell?.getCode() !== activatedLink.codes[i]) {
				break;
			}
		}
		if (i === activatedLink.codes.length) {
			return LinkType.Activated;
		}
		let j: number = 0;
		for (; j < disabledLink.codes.length; j++) {
			cell = lines[Math.floor(j / this.xterm.cols)].getCell(j % this.xterm.cols, cell);
			if (cell?.getCode() !== disabledLink.codes[j]) {
				break;
			}
		}
		return j === disabledLink.codes.length ? LinkType.Disabled : undefined;
	}

	private async _hideMessage() {
		await this._configurationService.updateValue(TerminalSettingId.ShellIntegrationShowWelcome, false);
	}
}
