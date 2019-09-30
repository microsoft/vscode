/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IOpenWindowOptions } from 'vs/platform/windows/common/windows';
import { URI } from 'vs/base/common/uri';

export interface INativeOpenWindowOptions extends IOpenWindowOptions {
	diffMode?: boolean;
	addMode?: boolean;
	gotoLineMode?: boolean;
	waitMarkerFileURI?: URI;
}
