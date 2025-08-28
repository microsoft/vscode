/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface DropDownListBoxItemOptions<T extends NonNullable<any>, V extends NonNullable<any>> {
	readonly identifier: T;
	readonly title?: string;
	readonly icon?: string;
	readonly disabled?: boolean;
	value: V;
}

export class DropDownListBoxItem<T extends NonNullable<any>, V extends NonNullable<any>> {
	constructor(readonly options: DropDownListBoxItemOptions<T, V>) { }
}
