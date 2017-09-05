/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

export class Editor {

	constructor(private spectron: SpectronApplication) {
	}

	public async getEditorFirstLineText(): Promise<string> {
		const result = await this.spectron.client.waitForText('.monaco-editor.focused .view-lines span span:nth-child(1)');
		return Array.isArray(result) ? result.join() : result;
	}

	public async waitForHighlightingLine(line: number): Promise<void> {
		const currentLineIndex = await this.spectron.client.waitFor<number>(async () => {
			const lineNumbers = await this.spectron.webclient.selectorExecute(`.monaco-editor .line-numbers`,
				elements => (Array.isArray(elements) ? elements : [elements]).map(element => element.textContent));
			for (let index = 0; index < lineNumbers.length; index++) {
				if (lineNumbers[index] === `${line}`) {
					return index + 1;
				}
			}
			return undefined;
		});
		await this.spectron.client.waitForElement(`.monaco-editor .view-overlays>:nth-child(${currentLineIndex}) .current-line`);
	}
}