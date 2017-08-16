/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { RPCProtocol } from 'vs/workbench/services/extensions/node/rpcProtocol';
import { AbstractThreadService } from 'vs/workbench/services/thread/node/abstractThreadService';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';

export class ExtHostThreadService extends AbstractThreadService implements IThreadService {
	constructor(rpcProtocol: RPCProtocol) {
		super(rpcProtocol, false);
	}
}
