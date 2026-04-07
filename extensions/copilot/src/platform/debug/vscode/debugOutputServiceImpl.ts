/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IDebugOutputService } from '../common/debugOutputService';
import { getMostRecentDebugOutput, installDebugOutputListeners } from './debugOutputListener';

export class DebugOutputServiceImpl extends Disposable implements IDebugOutputService {

	declare readonly _serviceBrand: undefined;

	constructor() {
		super();
		for (const l of installDebugOutputListeners()) {
			this._register(l);
		}
	}

	get consoleOutput(): string {
		return getMostRecentDebugOutput();
	}
}
