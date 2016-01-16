/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import winjs = require('vs/base/common/winjs.base');
import marshalling = require('vs/base/common/marshalling');
import remote = require('vs/base/common/remote');
import errors = require('vs/base/common/errors');

interface IRPCReply {
	c: winjs.ValueCallback;
	e: winjs.ErrorCallback;
	p: winjs.ProgressCallback;
}

interface IRPCFunc {
	(rpcId: string, method: string, args: any[]): winjs.TPromise<any>;
}

var pendingRPCReplies: { [msgId: string]: IRPCReply; } = {};

function createRPC(serializeAndSend:(obj:any)=>void): IRPCFunc {
	var lastMessageId = 0;

	return function rpc(rpcId: string, method: string, args: any[]): winjs.TPromise<any> {
		var req = String(++lastMessageId);
		var reply: IRPCReply = {
			c: null,
			e: null,
			p: null
		};
		var r = new winjs.TPromise<any>((c, e, p) => {
			reply.c = c;
			reply.e = e;
			reply.p = p;
		}, () => {
			serializeAndSend({
				cancel: req
			});
		});
		pendingRPCReplies[req] = reply;

		serializeAndSend({
			req: req,
			rpcId: rpcId,
			method: method,
			args: args
		});

		return r;
	};
};

export interface IPluginsIPC extends remote.IRemoteCom {
	handle(msg: string): void;
}

export function create(send:(obj:string)=>void): IPluginsIPC {
	var rpc = createRPC(serializeAndSend);
	var bigHandler: remote.IManyHandler = null;
	var invokedHandlers: { [req: string]: winjs.TPromise<any>; } = Object.create(null);

	var r: IPluginsIPC = {
		callOnRemote: rpc,
		registerBigHandler: (_bigHandler: remote.IManyHandler): void => {
			bigHandler = _bigHandler;
		},
		handle: (rawmsg) => {
			var msg = marshalling.demarshallObject(rawmsg, proxiesMarshalling);

			if (msg.seq) {
				if (!pendingRPCReplies.hasOwnProperty(msg.seq)) {
					console.warn('Got reply to unknown seq');
					return;
				}
				var reply = pendingRPCReplies[msg.seq];
				delete pendingRPCReplies[msg.seq];

				if (msg.err) {
					reply.e(msg.err);
					return;
				}

				reply.c(msg.res);
				return;
			}

			if (msg.cancel) {
				if (invokedHandlers[msg.cancel]) {
					invokedHandlers[msg.cancel].cancel();
				}
				return;
			}

			if (msg.err) {
				console.error(msg.err);
				return;
			}

			var rpcId = msg.rpcId;

			if (!bigHandler) {
				throw new Error('got message before big handler attached!');
			}

			var req = msg.req;

			invokedHandlers[req] = invokeHandler(rpcId, msg.method, msg.args);

			invokedHandlers[req].then((r) => {
				delete invokedHandlers[req];
				serializeAndSend({
					seq: req,
					res: r
				});
			},(err) => {
				delete invokedHandlers[req];
				serializeAndSend({
					seq: req,
					err: errors.transformErrorForSerialization(err)
				});
			});
		}
	};

	var proxiesMarshalling = new remote.ProxiesMarshallingContribution(r);

	function serializeAndSend(msg:any): void {
		send(marshalling.marshallObject(msg, proxiesMarshalling));
	}

	function invokeHandler(rpcId:string, method:string, args:any[]): winjs.TPromise<any> {
		try {
			return winjs.TPromise.as(bigHandler.handle(rpcId, method, args));
		} catch (err) {
			return winjs.TPromise.wrapError(err);
		}
	}

	return r;
};

