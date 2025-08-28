/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DropDownListBoxEntry } from '../../erdosComponents/dropDownListBox/dropDownListBox.js';
import { DropDownListBoxItem } from '../../erdosComponents/dropDownListBox/dropDownListBoxItem.js';
import { DropDownListBoxSeparator } from '../../erdosComponents/dropDownListBox/dropDownListBoxSeparator.js';
import { ILanguageRuntimeMetadata } from '../../../services/languageRuntime/common/languageRuntimeService.js';

export interface InterpreterInfo {
	preferred: boolean;
	runtimeId: string;
	languageName: string;
	languageVersion: string;
	runtimePath: string;
	runtimeSource: string;
}

export const interpretersToDropdownItems = (
	interpreters: ILanguageRuntimeMetadata[],
	preferredRuntimeId?: string,
) => {
	return interpreters
		.reduce<DropDownListBoxEntry<string, InterpreterInfo>[]>(
			(entries, runtime, index, runtimes) => {
				if (
					index &&
					runtimes[index].runtimeSource !== runtimes[index - 1].runtimeSource
				) {
					entries.push(new DropDownListBoxSeparator());
				}

				entries.push(
					new DropDownListBoxItem<string, InterpreterInfo>({
						identifier: runtime.runtimeId,
						value: {
							preferred: runtime.runtimeId === preferredRuntimeId,
							runtimeId: runtime.runtimeId,
							languageName: runtime.languageName,
							languageVersion: runtime.languageVersion,
							runtimePath: runtime.runtimePath,
							runtimeSource: runtime.runtimeSource,
						},
					})
				);

				return entries;
			},
			[]
		);
};
