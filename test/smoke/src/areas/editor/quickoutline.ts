/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';
import { QuickOpen } from '../quickopen/quickopen';

export class QuickOutline extends QuickOpen {

	constructor(spectron: SpectronApplication) {
		super(spectron);
	}

	async waitForQuickOutlineList(): Promise<void> {
		await this.spectron.client.waitForExist(`div.monaco-quick-open-widget.show-file-icons.monaco-builder-hidden`);
		await this.spectron.workbench.quickopen.runCommand('Go to Symbol in File...');

		await this.spectron.client.waitForExist(`div.monaco-quick-open-widget.show-file-icons.monaco-builder-hidden`);
		await this.spectron.client.waitForExist(`div.monaco-quick-open-widget.show-file-icons.content-changing`);

		await this.spectron.client.waitForNotExist(`div.monaco-quick-open-widget.show-file-icons.content-changing`);
	}
}