/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickOpen } from '../quickopen/quickopen';

const QUICK_OPEN_INPUT = '.quick-open-widget .quick-open-input input';
const QUICK_OPEN_FOCUSED_ELEMENT = '.quick-open-widget .quick-open-tree .monaco-tree-row.focused .monaco-highlighted-label';

export class CommandPallette extends QuickOpen {

	public async runCommand(commandText: string): Promise<void> {
		// run command
		await this.spectron.command('workbench.action.showCommands');

		// wait for quick open
		await this.waitForQuickOpenOpened();

		// type the text
		await this.spectron.client.keys([commandText, 'NULL']);

		// wait for text to be in input box
		await this.spectron.client.waitForValue(QUICK_OPEN_INPUT, `>${commandText}`);

		// wait for best choice to be focused
		await this.spectron.client.waitForTextContent(QUICK_OPEN_FOCUSED_ELEMENT, commandText);

		// wait and click on best choice
		await this.spectron.client.waitAndClick(QUICK_OPEN_FOCUSED_ELEMENT);
	}
}
