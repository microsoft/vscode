/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentVariableInfo, IMergedEnvironmentVariableCollection, IMergedEnvironmentVariableCollectionDiff, EnvironmentVariableMutatorType } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { format } from 'vs/base/common/strings';

export class EnvironmentVariableInfoStale implements IEnvironmentVariableInfo {
	constructor(
		private _diff: IMergedEnvironmentVariableCollectionDiff
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

	private _summarizeDiff(): string {
		let summary: string[] = [];
		this._diff.added.forEach((mutators, variable) => {
			mutators.forEach(mutator => {
				summary.push(`- ${format(this._mutatorTypeLabel(mutator.type), mutator.value, variable)}`);
			});
		});
		this._diff.changed.forEach((mutators, variable) => {
			mutators.forEach(mutator => {
				summary.push(`- "${format(this._mutatorTypeLabel(mutator.type), mutator.value, variable)}"`);
			});
		});
		this._diff.removed.forEach((mutators, variable) => {
			mutators.forEach(mutator => {
				summary.push(`- Remove the change "${format(this._mutatorTypeLabel(mutator.type), mutator.value, variable)}"`);
			});
		});
		return summary.join('\n');
	}

	private _mutatorTypeLabel(type: EnvironmentVariableMutatorType): string {
		switch (type) {
			case EnvironmentVariableMutatorType.Prepend: return 'Add `{0}` to the beginning of `{1}`';
			case EnvironmentVariableMutatorType.Append: return 'Add `{0}` to the end of `{1}`';
			default: return 'Replace `{1}`\'s value with `{0}`';
		}
	}
}

export class EnvironmentVariableInfoChangesActive implements IEnvironmentVariableInfo {
	constructor(
		private _collection: IMergedEnvironmentVariableCollection
	) {
	}

	getInfo(): string {
		// TODO: Localize
		return 'Extensions have made changes to this terminal\'s environment';
	}

	getIcon(): string {
		return 'info';
	}
}
