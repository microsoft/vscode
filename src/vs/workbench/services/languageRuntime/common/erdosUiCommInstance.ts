/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRuntimeClientInstance } from './languageRuntimeClientInstance.js';
import { ErdosUiComm } from './erdosUiComm.js';

export class ErdosUiCommInstance extends ErdosUiComm {
	constructor(client: IRuntimeClientInstance<any, any>) {
		super(client);

		super.createEventEmitter('CallMethodReply', []);
	}
}
