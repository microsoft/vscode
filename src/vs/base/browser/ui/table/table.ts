/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListRenderer } from 'vs/base/browser/ui/list/list';

export interface ITableColumn<TRow, TCell> {
	readonly label: string;
	readonly weight: number;
	readonly templateId: string;
	project(row: TRow): TCell;
}

export interface ITableVirtualDelegate<TRow> {
	readonly headerRowHeight: number;
	getHeight(row: TRow): number;
}

export interface ITableRenderer<TCell, TTemplateData> extends IListRenderer<TCell, TTemplateData> { }

export class TableError extends Error {

	constructor(user: string, message: string) {
		super(`TableError [${user}] ${message}`);
	}
}
