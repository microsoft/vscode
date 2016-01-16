/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IMarshallingContribution} from 'vs/base/common/marshalling';

export interface IManyHandler {
	handle(rpcId:string, method:string, args:any[]): any;
}

export interface IProxyHelper {
	callOnRemote(proxyId: string, path: string, args:any[]): TPromise<any>;
}

export interface IRemoteCom extends IProxyHelper {
	registerBigHandler(handler:IManyHandler): void;
}

var hasOwnProperty = Object.prototype.hasOwnProperty;

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

export interface IObjDescriptor {
	methods: string[];
	props: {[name:string]:any;};
}

export interface ISerializedProxy {
	$isProxyDescriptor: boolean;
	proxyId: string;
	desc: IObjDescriptor;
}

export class ProxiesMarshallingContribution implements IMarshallingContribution {

	private _remoteCom:IProxyHelper;

	constructor(remoteCom:IProxyHelper) {
		this._remoteCom = remoteCom;
	}

	public canSerialize(obj:any): boolean {
		return (typeof obj.$__CREATE__PROXY__REQUEST === 'string');
	}

	public serialize(obj:any, serialize:(obj:any)=>any): ISerializedProxy {
		var desc: IObjDescriptor = {
			methods: [],
			props: <any>{}
		};

		var keys = Object.keys(obj);
		for (var i = 0; i < keys.length; i++) {
			var key = keys[i];

			if (typeof obj[key] === 'function') {
				desc.methods.push(key);
			} else {
				desc.props[key] = serialize(obj[key]);
			}
		}

		return {
			$isProxyDescriptor: true,
			proxyId: obj.$__CREATE__PROXY__REQUEST,
			desc: desc
		};
	}

	public canDeserialize(obj:ISerializedProxy): boolean {
		return obj.$isProxyDescriptor === true;
	}

	public deserialize(obj:ISerializedProxy, deserialize:(obj:any)=>any): any {
		// this is an object
		var result: any = {
			$__IS_REMOTE_OBJ: true
		};

		var methods = obj.desc.methods;
		for (var i = 0; i < methods.length; i++) {
			result[methods[i]] = createMethodProxy(this._remoteCom, obj.proxyId, methods[i]);
		}

		var props = obj.desc.props;
		for (var prop in props) {
			if (hasOwnProperty.call(props, prop)) {
				result[prop] = deserialize(props[prop]);
			}
		}

		return result;
	}
}