/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IRemoteCom } from 'vs/platform/extensions/common/ipcRemoteCom';
import { TPromise } from 'vs/base/common/winjs.base';
import { AbstractThreadService } from 'vs/workbench/services/thread/common/abstractThreadService';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';

export class ExtHostThreadService extends AbstractThreadService implements IThreadService {
	public _serviceBrand: any;
	protected _remoteCom: IRemoteCom;

	constructor(remoteCom: IRemoteCom) {
		super(false);
		this._remoteCom = remoteCom;
		this._remoteCom.setManyHandler(this);
	}

	protected _callOnRemote(proxyId: string, path: string, args: any[]): TPromise<any> {
		return this._remoteCom.callOnRemote(proxyId, path, args);
	}
}
