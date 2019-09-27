/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IOpenInWindowOptions } from 'vs/platform/windows/common/windows';
import { URI } from 'vs/base/common/uri';

export interface INativeOpenInWindowOptions extends IOpenInWindowOptions {
	diffMode?: boolean;
	addMode?: boolean;
	gotoLineMode?: boolean;
	waitMarkerFileURI?: URI;
}
