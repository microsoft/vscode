/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PerCompletionContextProviderStatistics } from '../contextProviderStatistics';

export class TestContextProviderStatistics extends PerCompletionContextProviderStatistics {
	constructor() {
		super();
	}

	get expectations() {
		return this._expectations;
	}

	get statistics() {
		return this._statistics;
	}

	get lastResolution() {
		return this._lastResolution;
	}
}
