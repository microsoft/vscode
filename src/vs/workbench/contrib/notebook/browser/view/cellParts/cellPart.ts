/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';

export abstract class CellPart extends Disposable {
	constructor() {
		super();
	}

	/**
	 * Read DOM
	 */
	abstract prepareRender(): void;

	/**
	 * Update DOM based on layout info
	 */
	abstract updateLayout(): void;
}
