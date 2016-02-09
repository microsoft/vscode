/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';

export interface IManyHandler {
	handle(rpcId:string, method:string, args:any[]): any;
}

export interface IProxyHelper {
	callOnRemote(proxyId: string, path: string, args:any[]): TPromise<any>;
}

export interface IRemoteCom extends IProxyHelper {
	registerBigHandler(handler:IManyHandler): void;
}

export function createProxyFromCtor(remote:IProxyHelper, id:string, ctor:Function): any {
	var result: any = {
		$__IS_REMOTE_OBJ: true
	};
	for (var prop in ctor.prototype) {
		if (typeof ctor.prototype[prop] === 'function') {
			result[prop] = createMethodProxy(remote, id, prop);
		}
	}
	return result;
}

function createMethodProxy(remote:IProxyHelper, proxyId: string, path: string): (...myArgs: any[]) => TPromise<any> {
	return (...myArgs: any[]) => {
		return remote.callOnRemote(proxyId, path, myArgs);
	};
}
