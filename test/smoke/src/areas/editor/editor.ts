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
}