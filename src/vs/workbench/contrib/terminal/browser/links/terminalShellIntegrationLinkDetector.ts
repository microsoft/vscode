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

// This is intentionally not localized currently as it must match the text in the shell script
const linkText = 'Shell integration activated';
const linkCodes = new Uint8Array(linkText.split('').map(e => e.charCodeAt(0)));

export class TerminalShellIntegrationLinkDetector implements ITerminalLinkDetector {
	static id = 'shellintegration';

	constructor(
		readonly xterm: Terminal,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
	}

	detect(lines: IBufferLine[], startLine: number, endLine: number): ITerminalSimpleLink[] {
		if (this._matches(lines)) {
			return [{
				text: linkText,
				type: TerminalBuiltinLinkType.Url,
				label: localize('learn', 'Learn about shell integration'),
				uri: URI.from({
					scheme: Schemas.https,
					path: 'aka.ms/vscode-shell-integration'
				}),
				bufferRange: {
					start: { x: 1, y: startLine + 1 },
					end: { x: linkText.length % this.xterm.cols, y: startLine + Math.floor(linkText.length / this.xterm.cols) + 1 }
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

	private _matches(lines: IBufferLine[]): boolean {
		if (lines.length < linkCodes.length) {
			return false;
		}
		let cell: IBufferCell | undefined;
		for (let i = 0; i < linkCodes.length; i++) {
			cell = lines[Math.floor(i / this.xterm.cols)].getCell(i % this.xterm.cols, cell);
			if (cell?.getCode() !== linkCodes[i]) {
				return false;
			}
		}
		return true;
	}

	private async _hideMessage() {
		await this._configurationService.updateValue(TerminalSettingId.ShellIntegrationShowWelcome, false);
	}
}
