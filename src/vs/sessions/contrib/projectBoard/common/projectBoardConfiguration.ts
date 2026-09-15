/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IProjectBoardAxis {
	readonly id: string;
	readonly label: string;
}

export interface IProjectBoardPlacement {
	readonly rowId: string;
	readonly columnId: string;
}

export interface IProjectBoardConfiguration {
	readonly version: 1;
	readonly rows: readonly IProjectBoardAxis[];
	readonly columns: readonly IProjectBoardAxis[];
	readonly placements: readonly (IProjectBoardPlacement & { readonly cardId: string })[];
	readonly autoIncludeSessions: boolean;
	readonly display?: IProjectBoardDisplayOptions;
}

export interface IProjectBoardDisplayOptions {
	readonly showStateDuration: boolean;
	readonly showCredits: boolean;
	readonly showLastPrompt?: boolean;
	readonly showModelDetails?: boolean;
	readonly showPermissionDetails?: boolean;
}
