/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentVariableInfo, IMergedEnvironmentVariableCollection, IMergedEnvironmentVariableCollectionDiff, EnvironmentVariableMutatorType } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { TERMINAL_COMMAND_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { localize } from 'vs/nls';

export class EnvironmentVariableInfoStale implements IEnvironmentVariableInfo {
	readonly requiresAction = true;

	constructor(
		private readonly _diff: IMergedEnvironmentVariableCollectionDiff,
		private readonly _terminalId: number,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
	}

	getInfo(): string {
		let info = localize('extensionEnvironmentContribution', "Extensions want to make the follow changes to the terminal's environment:");
		info += `\n\n${this._summarizeDiff()}`;
		return info;
	}

	getIcon(): string {
		return 'warning';
	}

	getActions(): { label: string, iconClass?: string, run: () => void, commandId: string }[] {
		return [{
			label: localize('relaunchTerminalLabel', "Relaunch terminal"),
			run: () => this._terminalService.getInstanceFromId(this._terminalId)?.relaunch(),
			commandId: TERMINAL_COMMAND_ID.RELAUNCH
		}];
	}

	private _summarizeDiff(): string {
		const summary: string[] = [];
		this._diff.added.forEach((mutators, variable) => {
			mutators.forEach(mutator => {
				summary.push(`- ${mutatorTypeLabel(mutator.type, mutator.value, variable)}`);
			});
		});
		this._diff.changed.forEach((mutators, variable) => {
			mutators.forEach(mutator => {
				summary.push(`- "${mutatorTypeLabel(mutator.type, mutator.value, variable)}"`);
			});
		});
		this._diff.removed.forEach((mutators, variable) => {
			mutators.forEach(mutator => {
				const removePrefixText = localize('removeEnvironmentVariableChange', "Remove the change {0}", mutatorTypeLabel(mutator.type, mutator.value, variable));
				summary.push(`- ${removePrefixText}`);
			});
		});
		return summary.join('\n');
	}
}

export class EnvironmentVariableInfoChangesActive implements IEnvironmentVariableInfo {
	readonly requiresAction = false;

	constructor(
		private _collection: IMergedEnvironmentVariableCollection
	) {
	}

	getInfo(): string {
		const info: string[] = ['Extensions have made changes to this terminal\'s environment:', ''];
		this._collection.map.forEach((mutators, variable) => {
			mutators.forEach(mutator => {
				info.push(`- ${mutatorTypeLabel(mutator.type, mutator.value, variable)}`);
			});
		});
		return info.join('\n');
	}

	getIcon(): string {
		return 'info';
	}
}

function mutatorTypeLabel(type: EnvironmentVariableMutatorType, value: string, variable: string): string {
	switch (type) {
		case EnvironmentVariableMutatorType.Prepend: return localize('prependValueToEnvironmentVariableMarkdown', "Add `{0}` to the beginning of `{1}`", value, variable);
		case EnvironmentVariableMutatorType.Append: return localize('appendValueToEnvironmentVariableMarkdown', "Add `{0}` to the end of `{1}`", value, variable);
		default: return localize('replaceEnvironmentVariableWithValueMarkdown', "Replace `{1}`\'s value with `{0}`", value, variable);
	}
}
