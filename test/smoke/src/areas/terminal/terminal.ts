/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

export class Terminal {

	static TERMINAL_SELECTOR = '.panel.integrated-terminal';
	static TERMINAL_ROWS_SELECTOR = `${Terminal.TERMINAL_SELECTOR} .xterm-rows > div`;
	static TERMINAL_CURSOR = `${Terminal.TERMINAL_SELECTOR} .terminal-cursor`;

	constructor(private spectron: SpectronApplication) {
	}

	public async showTerminal(): Promise<void> {
		if (!await this.isVisible()) {
			await this.spectron.workbench.quickopen.runCommand('View: Toggle Integrated Terminal');
			await this.spectron.client.waitForElement(Terminal.TERMINAL_CURSOR);
			await this.waitForTerminalText(text => text.length > 0, 'Waiting for Terminal to be ready');
		}
	}

	public async isVisible(): Promise<boolean> {
		const element = await this.spectron.client.element(Terminal.TERMINAL_SELECTOR);
		return !!element;
	}

	public async runCommand(commandText: string): Promise<void> {
		await this.spectron.client.type(commandText);
		await this.spectron.client.keys(['Enter', 'NULL']);
	}

	public async waitForTerminalText(fn: (text: string[]) => boolean, timeOutDescription: string = 'Getting Terminal Text'): Promise<string[]> {
		return this.spectron.client.waitFor(async () => {
			const terminalText = await this.getTerminalText();
			if (fn(terminalText)) {
				return terminalText;
			}
			return undefined;
		}, void 0, timeOutDescription);
	}

	public getCurrentLineNumber(): Promise<number> {
		return this.getTerminalText().then(text => text.length);
	}

	private async getTerminalText(): Promise<string[]> {
		const linesText: string[] = await this.spectron.webclient.selectorExecute<string[]>(Terminal.TERMINAL_ROWS_SELECTOR,
			div => (Array.isArray(div) ? div : [div])
				.map(element => {
					function getTextFromAll(spanElements: NodeList): string {
						let text = '';
						for (let i = 0; i < spanElements.length; i++) {
							text += getText(spanElements.item(i) as HTMLElement);
						}
						return text;
					}
					function getText(spanElement: HTMLElement): string {
						if (spanElement.hasChildNodes()) {
							return getTextFromAll(spanElement.childNodes);
						}
						return spanElement.textContent || '';
					}
					return getTextFromAll(element.querySelectorAll('span'));
				}));
		let lastLineIndex = 0;
		for (let index = 0; index < linesText.length; index++) {
			if (linesText[index].trim()) {
				lastLineIndex = index;
			}
		}
		return linesText.slice(0, lastLineIndex + 1);
	}
}