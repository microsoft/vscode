/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalService } from './terminalService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { localize } from '../../../../nls.js';

export async function clearMultipleTerminals(terminalService: TerminalService, quickInputService: IQuickInputService): Promise<void> {
	const terminals = terminalService.instances;
	if (terminals.length === 0) {
		return;
	}

	const quickPick = quickInputService.createQuickPick();
	quickPick.items = terminals.map(t => ({
		label: t.title,
		description: t.description,
		terminal: t,
		picked: false
	}));
	quickPick.canSelectMany = true;
	quickPick.placeholder = localize('selectTerminalsToClear', "Select terminals to clear");

	quickPick.onDidChangeSelection(selectedItems => {
		quickPick.selectedItems = selectedItems;
	});

	quickPick.onDidAccept(() => {
		const selectedTerminals = quickPick.selectedItems;
		for (const item of selectedTerminals) {
			(item as any).terminal.clearBuffer();
		}
		quickPick.hide();
	});

	quickPick.onDidHide(() => {
		quickPick.dispose();
	});

	quickPick.show();
}
