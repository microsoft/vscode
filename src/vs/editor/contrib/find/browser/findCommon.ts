/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const FIND_CONTROLLER_ID = 'editor.contrib.findController';

export interface IFindInputTransformer {
	transformFocusedInput(transform: (text: string) => string): boolean;
}

