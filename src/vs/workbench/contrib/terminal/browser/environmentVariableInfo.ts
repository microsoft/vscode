/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentVariableInfo, IMergedEnvironmentVariableCollection, IMergedEnvironmentVariableCollectionDiff, EnvironmentVariableMutatorType } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { format } from 'vs/base/common/strings';
import { TERMINAL_COMMAND_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';

export class EnvironmentVariableInfoStale implements IEnvironmentVariableInfo {
	constructor(
		private readonly _diff: IMergedEnvironmentVariableCollectionDiff,
		private readonly _terminalId: number,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
	}

	getInfo(): string {
		// TODO: Localize
		let info = 'Extensions want to make the follow changes to the terminal\'s environment:';
		info += `\n\n${this._summarizeDiff()}`;
		return info;
	}

	getIcon(): string {
		return 'warning';
	}

	getActions(): { label: string, iconClass?: string, run: (target: HTMLElement) => void, commandId: string }[] {
		return [{
			label: 'Relaunch terminal',
			run: () => this._terminalService.getInstanceFromId(this._terminalId)?.relaunch(),
			commandId: TERMINAL_COMMAND_ID.RELAUNCH
		}];
	}

	private _summarizeDiff(): string {
		const summary: string[] = [];
		this._diff.added.forEach((mutators, variable) => {
			mutators.forEach(mutator => {
				summary.push(`- ${format(mutatorTypeLabel(mutator.type), mutator.value, variable)}`);
			});
		});
		this._diff.changed.forEach((mutators, variable) => {
			mutators.forEach(mutator => {
				summary.push(`- "${format(mutatorTypeLabel(mutator.type), mutator.value, variable)}"`);
			});
		});
		this._diff.removed.forEach((mutators, variable) => {
			mutators.forEach(mutator => {
				// TODO: Localize
				summary.push(`- Remove the change "${format(mutatorTypeLabel(mutator.type), mutator.value, variable)}"`);
			});
		});
		return summary.join('\n');
	}
}

export class EnvironmentVariableInfoChangesActive implements IEnvironmentVariableInfo {
	constructor(
		private _collection: IMergedEnvironmentVariableCollection
	) {
	}

	getInfo(): string {
		// TODO: Localize
		const info: string[] = ['Extensions have made changes to this terminal\'s environment:', ''];
		this._collection.map.forEach((mutators, variable) => {
			mutators.forEach(mutator => {
				info.push(`- ${format(mutatorTypeLabel(mutator.type), mutator.value, variable)}`);
			});
		});
		return info.join('\n');
	}

	getIcon(): string {
		return 'info';
	}
}

function mutatorTypeLabel(type: EnvironmentVariableMutatorType): string {
	// TODO: Localize
	switch (type) {
		case EnvironmentVariableMutatorType.Prepend: return 'Add `{0}` to the beginning of `{1}`';
		case EnvironmentVariableMutatorType.Append: return 'Add `{0}` to the end of `{1}`';
		default: return 'Replace `{1}`\'s value with `{0}`';
	}
}
