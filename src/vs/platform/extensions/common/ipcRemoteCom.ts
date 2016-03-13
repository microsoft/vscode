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

const pendingRPCReplies: { [msgId: string]: IRPCReply; } = {};

function createRPC(serializeAndSend: (obj: any) => void): IRPCFunc {
	let lastMessageId = 0;

	return function rpc(rpcId: string, method: string, args: any[]): winjs.TPromise<any> {
		let req = String(++lastMessageId);
		let reply: IRPCReply = {
			c: null,
			e: null,
			p: null
		};
		let r = new winjs.TPromise<any>((c, e, p) => {
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
}

export interface IMainProcessExtHostIPC extends remote.IRemoteCom {
	handle(msg: string[]): void;
}

export function create(send: (obj: string[]) => void): IMainProcessExtHostIPC {
	let rpc = createRPC(marshallAndSend);
	let bigHandler: remote.IManyHandler = null;
	let invokedHandlers: { [req: string]: winjs.TPromise<any>; } = Object.create(null);
	let messagesToSend: string[] = [];

	let messagesToReceive: string[] = [];
	let receiveOneMessage = () => {
		let rawmsg = messagesToReceive.shift();

		if (messagesToReceive.length > 0) {
			process.nextTick(receiveOneMessage);
		}

		let msg = marshalling.parse(rawmsg);

		if (msg.seq) {
			if (!pendingRPCReplies.hasOwnProperty(msg.seq)) {
				console.warn('Got reply to unknown seq');
				return;
			}
			let reply = pendingRPCReplies[msg.seq];
			delete pendingRPCReplies[msg.seq];

			if (msg.err) {
				let err = msg.err;
				if (msg.err.$isError) {
					err = new Error();
					err.name = msg.err.name;
					err.message = msg.err.message;
					err.stack = msg.err.stack;
				}
				reply.e(err);
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

		let rpcId = msg.rpcId;

		if (!bigHandler) {
			throw new Error('got message before big handler attached!');
		}

		let req = msg.req;

		invokedHandlers[req] = invokeHandler(rpcId, msg.method, msg.args);

		invokedHandlers[req].then((r) => {
			delete invokedHandlers[req];
			marshallAndSend({
				seq: req,
				res: r
			});
		}, (err) => {
			delete invokedHandlers[req];
			marshallAndSend({
				seq: req,
				err: errors.transformErrorForSerialization(err)
			});
		});
	};

	let r: IMainProcessExtHostIPC = {
		callOnRemote: rpc,
		setManyHandler: (_bigHandler: remote.IManyHandler): void => {
			bigHandler = _bigHandler;
		},
		handle: (rawmsg) => {
			// console.log('RECEIVED ' + rawmsg.length + ' MESSAGES.');
			if (messagesToReceive.length === 0) {
				process.nextTick(receiveOneMessage);
			}

			messagesToReceive = messagesToReceive.concat(rawmsg);
		}
	};

	function sendAccumulated(): void {
		let tmp = messagesToSend;
		messagesToSend = [];

		// console.log('SENDING ' + tmp.length + ' MESSAGES.');
		send(tmp);
	}

	function marshallAndSend(msg: any): void {
		let value = marshalling.stringify(msg);

		if (messagesToSend.length === 0) {
			process.nextTick(sendAccumulated);
		}

		messagesToSend.push(value);
	}

	function invokeHandler(rpcId: string, method: string, args: any[]): winjs.TPromise<any> {
		try {
			return winjs.TPromise.as(bigHandler.handle(rpcId, method, args));
		} catch (err) {
			return winjs.TPromise.wrapError(err);
		}
	}

	return r;
}

