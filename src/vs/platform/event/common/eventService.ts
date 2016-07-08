/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EventEmitter} from 'vs/base/common/eventEmitter';
import {IEventService} from './event';

// --- implementation ------------------------------------------

export class EventService extends EventEmitter implements IEventService {
	public _serviceBrand: any;
	constructor() {
		super();
	}
}