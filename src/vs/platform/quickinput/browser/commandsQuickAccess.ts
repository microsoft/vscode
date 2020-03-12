/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { PickerQuickAccessProvider, IPickerQuickAccessItem } from 'vs/platform/quickinput/common/quickAccess';
import { distinct } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { or, matchesPrefix, matchesWords, matchesContiguousSubString } from 'vs/base/common/filters';
import { withNullAsUndefined } from 'vs/base/common/types';

export interface ICommandQuickPick extends IPickerQuickAccessItem {
	commandId: string;
}

export abstract class AbstractCommandsQuickAccessProvider extends PickerQuickAccessProvider<ICommandQuickPick> {

	static PREFIX = '>';

	private static WORD_FILTER = or(matchesPrefix, matchesWords, matchesContiguousSubString);

	constructor() {
		super(AbstractCommandsQuickAccessProvider.PREFIX);
	}

	protected async getPicks(filter: string, disposables: DisposableStore, token: CancellationToken): Promise<Array<ICommandQuickPick | IQuickPickSeparator>> {

		// Ask subclass for all command picks
		const allCommandPicks = await this.getCommandPicks(disposables, token);

		// Filter
		const filteredCommandPicks: ICommandQuickPick[] = [];
		for (const commandPick of allCommandPicks) {
			const labelHighlights = withNullAsUndefined(AbstractCommandsQuickAccessProvider.WORD_FILTER(filter, commandPick.label));
			const detailHighlights = commandPick.detail ? withNullAsUndefined(AbstractCommandsQuickAccessProvider.WORD_FILTER(filter, commandPick.detail)) : undefined;

			if (labelHighlights || detailHighlights) {
				commandPick.highlights = { label: labelHighlights, detail: detailHighlights };
				filteredCommandPicks.push(commandPick);
			}
		}

		// Remove duplicates
		const distinctCommandPicks = distinct(filteredCommandPicks, pick => `${pick.label}${pick.commandId}`);

		// Add description to commands that have duplicate labels
		const mapLabelToCommand = new Map<string, ICommandQuickPick>();
		for (const commandPick of distinctCommandPicks) {
			const existingCommandForLabel = mapLabelToCommand.get(commandPick.label);
			if (existingCommandForLabel) {
				commandPick.description = commandPick.commandId;
				existingCommandForLabel.description = existingCommandForLabel.commandId;
			} else {
				mapLabelToCommand.set(commandPick.label, commandPick);
			}
		}

		return distinctCommandPicks;
	}

	protected abstract getCommandPicks(disposables: DisposableStore, token: CancellationToken): Promise<Array<ICommandQuickPick>>;
}

