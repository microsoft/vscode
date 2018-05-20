/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// TODO@api this was previously a hardcoded list of editor positions (ONE, TWO, THREE)
// that with the introduction of grid editor feature is now unbounded. This should be
// revisited when the grid functionality is exposed to extensions
export type EditorPosition = number;