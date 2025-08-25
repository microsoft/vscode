/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { PromiseHandles } from './async';

export class UICommRequest {
	constructor(
		public readonly method: string,
		public readonly args: Array<any>,
		public readonly promise: PromiseHandles<any>) {
	}
}
