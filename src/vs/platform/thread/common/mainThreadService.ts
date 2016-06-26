/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {AbstractThreadService} from 'vs/platform/thread/common/abstractThreadService';
import {IThreadService} from 'vs/platform/thread/common/thread';

export abstract class CommonMainThreadService extends AbstractThreadService implements IThreadService {
	public serviceId = IThreadService;

	constructor() {
		super(true);
	}
}
