/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

export enum CellKind {
	Code = 'code',
	Markdown = 'markdown'
}

export interface IErdosNotebookCell {
	readonly id: string;
	readonly kind: CellKind;
}
