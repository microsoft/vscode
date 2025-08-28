/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromiseHandles } from './async';

export class UICommRequest {
	constructor(
		public readonly method: string,
		public readonly args: Array<any>,
		public readonly promise: PromiseHandles<any>) {
	}
}
