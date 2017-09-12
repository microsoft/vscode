/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

export class Rename {

	private static RENAME_BOX = '.monaco-editor .monaco-editor.rename-box';
	private static RENAME_INPUT = `${Rename.RENAME_BOX} .rename-input`;

	constructor(private term: string, private spectron: SpectronApplication) {
	}

	public async waitUntilOpen(): Promise<void> {
		await this.spectron.client.waitForVisibility(Rename.RENAME_BOX);
		await this.spectron.client.waitForValue(Rename.RENAME_INPUT, this.term);
	}

	public async rename(newTerm: string): Promise<void> {
		await this.spectron.client.type(newTerm);
		await this.spectron.client.keys(['Enter', 'NULL']);
		await this.spectron.client.waitForVisibility(Rename.RENAME_BOX, result => !result);
	}
}