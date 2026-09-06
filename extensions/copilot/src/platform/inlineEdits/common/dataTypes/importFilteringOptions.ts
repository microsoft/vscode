/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vEnum } from '../../../configuration/common/validator';

export enum ImportChanges {
	All = 'all',
	None = 'none',
}

export namespace ImportChanges {
	export const VALIDATOR = vEnum(ImportChanges.All, ImportChanges.None);
}
