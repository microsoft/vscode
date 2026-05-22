/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../../util/vs/base/common/errors';

export class FetchCancellationError extends CancellationError {
	constructor(
		public readonly extraInformation?: string
	) {
		super();
	}
}
