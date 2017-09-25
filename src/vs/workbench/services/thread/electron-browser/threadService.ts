/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as strings from 'vs/base/common/strings';
import { RPCProtocol } from 'vs/workbench/services/extensions/node/rpcProtocol';
import { AbstractThreadService } from 'vs/workbench/services/thread/node/abstractThreadService';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';

// Enable to see detailed message communication between window and extension host
const logExtensionHostCommunication = false;


function asLoggingProtocol(protocol: IMessagePassingProtocol): IMessagePassingProtocol {

	protocol.onMessage(msg => {
		console.log('%c[Extension \u2192 Window]%c[len: ' + strings.pad(msg.length, 5, ' ') + ']', 'color: darkgreen', 'color: grey', msg);
	});

	return {
		onMessage: protocol.onMessage,

		send(msg: any) {
			protocol.send(msg);
			console.log('%c[Window \u2192 Extension]%c[len: ' + strings.pad(msg.length, 5, ' ') + ']', 'color: darkgreen', 'color: grey', msg);
		}
	};
}


export class MainThreadService extends AbstractThreadService implements IThreadService {
	constructor(protocol: IMessagePassingProtocol, @IEnvironmentService environmentService: IEnvironmentService) {
		if (logExtensionHostCommunication || environmentService.logExtensionHostCommunication) {
			protocol = asLoggingProtocol(protocol);
		}

		super(new RPCProtocol(protocol), true);
	}
}
