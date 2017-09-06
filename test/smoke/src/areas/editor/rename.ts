/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

export class Rename {

	private static RENAME_WIDGET = '.monaco-editor .rename-box .rename-input';

	constructor(private term: string, private spectron: SpectronApplication) {
	}

	public async waitUntilOpen(): Promise<void> {
		await this.spectron.client.waitForElement(Rename.RENAME_WIDGET);
		await this.spectron.client.waitForValue(Rename.RENAME_WIDGET, this.term);
	}

	public async rename(newTerm: string): Promise<void> {
		await this.spectron.client.type(newTerm);
		await this.spectron.client.keys(['Enter', 'NULL']);
		await this.spectron.client.waitForElement(Rename.RENAME_WIDGET, element => !element);
	}
}