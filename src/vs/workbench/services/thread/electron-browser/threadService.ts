/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as strings from 'vs/base/common/strings';
import { TPromise } from 'vs/base/common/winjs.base';
import { IMainProcessExtHostIPC, create } from 'vs/platform/extensions/common/ipcRemoteCom';
import { AbstractThreadService } from 'vs/workbench/services/thread/common/abstractThreadService';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';

// Enable to see detailed message communication between window and extension host
const logExtensionHostCommunication = false;

export class MainThreadService extends AbstractThreadService implements IThreadService {
	public _serviceBrand: any;

	private remoteCom: IMainProcessExtHostIPC;

	constructor(extensionHostMessagingProtocol: IMessagePassingProtocol, @IEnvironmentService environmentService: IEnvironmentService) {
		super(true);

		let logCommunication = logExtensionHostCommunication || environmentService.logExtensionHostCommunication;
		// Message: Window --> Extension Host
		this.remoteCom = create((msg) => {
			if (logCommunication) {
				console.log('%c[Window \u2192 Extension]%c[len: ' + strings.pad(msg.length, 5, ' ') + ']', 'color: darkgreen', 'color: grey', msg);
			}

			extensionHostMessagingProtocol.send(msg);
		});

		// Message: Extension Host --> Window
		extensionHostMessagingProtocol.onMessage((msg) => {
			if (logCommunication) {
				console.log('%c[Extension \u2192 Window]%c[len: ' + strings.pad(msg.length, 5, ' ') + ']', 'color: darkgreen', 'color: grey', msg);
			}

			this.remoteCom.handle(msg);
		});

		this.remoteCom.setManyHandler(this);
	}

	protected _callOnRemote(proxyId: string, path: string, args: any[]): TPromise<any> {
		return this.remoteCom.callOnRemote(proxyId, path, args);
	}
}