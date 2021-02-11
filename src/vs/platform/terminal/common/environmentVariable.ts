/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from 'vs/platform/theme/common/themeService';

export enum EnvironmentVariableMutatorType {
	Replace = 1,
	Append = 2,
	Prepend = 3
}
export interface IEnvironmentVariableMutator {
	readonly value: string;
	readonly type: EnvironmentVariableMutatorType;
}
/** [variable, mutator] */
export type ISerializableEnvironmentVariableCollection = [string, IEnvironmentVariableMutator][];

export interface IEnvironmentVariableInfo {
	readonly requiresAction: boolean;
	getInfo(): string;
	getIcon(): ThemeIcon;
	getActions?(): { label: string, iconClass?: string, run: () => void, commandId: string }[];
}
