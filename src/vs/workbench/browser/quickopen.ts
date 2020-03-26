/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IWorkbenchQuickOpenConfiguration {
	workbench: {
		commandPalette: {
			history: number;
			preserveInput: boolean;
		},
		quickOpen: {
			enableExperimentalNewVersion: boolean;
			preserveInput: boolean;
		}
	};
}
