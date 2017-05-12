/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as errors from 'vs/base/common/errors';
import { MainThreadErrorsShape } from '../node/extHost.protocol';

export class MainThreadErrors extends MainThreadErrorsShape {

	public onUnexpectedExtHostError(err: any): void {
		errors.onUnexpectedError(err);
	}

}
