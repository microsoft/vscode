/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/node/ipc';
import { ProxyIdentifier } from 'vs/workbench/services/extensions/node/proxyIdentifier';
import { RPCProtocol } from 'vs/workbench/services/extensions/node/rpcProtocol';

suite('RPCProtocol', () => {

	class MessagePassingProtocol implements IMessagePassingProtocol {
		private _pair: MessagePassingProtocol;

		private readonly _onMessage: Emitter<Buffer> = new Emitter<Buffer>();
		public readonly onMessage: Event<Buffer> = this._onMessage.event;

		public setPair(other: MessagePassingProtocol) {
			this._pair = other;
		}

		public send(buffer: Buffer): void {
			process.nextTick(() => {
				this._pair._onMessage.fire(buffer);
			});
		}
	}

	let delegate: (a1: any, a2: any) => any;
	let bProxy: BClass;
	class BClass {
		$m(a1: any, a2: any): Thenable<any> {
			return Promise.resolve(delegate.call(null, a1, a2));
		}
	}

	setup(() => {
		let a_protocol = new MessagePassingProtocol();
		let b_protocol = new MessagePassingProtocol();
		a_protocol.setPair(b_protocol);
		b_protocol.setPair(a_protocol);

		let A = new RPCProtocol(a_protocol);
		let B = new RPCProtocol(b_protocol);

		delegate = null;

		const bIdentifier = new ProxyIdentifier<BClass>(false, 'bb');
		const bInstance = new BClass();
		B.set(bIdentifier, bInstance);
		bProxy = A.getProxy(bIdentifier);
	});

	test('simple call', function (done) {
		delegate = (a1: number, a2: number) => a1 + a2;
		bProxy.$m(4, 1).then((res: number) => {
			assert.equal(res, 5);
			done(null);
		}, done);
	});

	test('simple call without result', function (done) {
		delegate = (a1: number, a2: number) => { };
		bProxy.$m(4, 1).then((res: number) => {
			assert.equal(res, undefined);
			done(null);
		}, done);
	});

	test('passing buffer as argument', function (done) {
		delegate = (a1: Buffer, a2: number) => {
			assert.ok(Buffer.isBuffer(a1));
			return a1[a2];
		};
		let b = Buffer.allocUnsafe(4);
		b[0] = 1;
		b[1] = 2;
		b[2] = 3;
		b[3] = 4;
		bProxy.$m(b, 2).then((res: number) => {
			assert.equal(res, 3);
			done(null);
		}, done);
	});

	test('returning a buffer', function (done) {
		delegate = (a1: number, a2: number) => {
			let b = Buffer.allocUnsafe(4);
			b[0] = 1;
			b[1] = 2;
			b[2] = 3;
			b[3] = 4;
			return b;
		};
		bProxy.$m(4, 1).then((res: Buffer) => {
			assert.ok(Buffer.isBuffer(res));
			assert.equal(res[0], 1);
			assert.equal(res[1], 2);
			assert.equal(res[2], 3);
			assert.equal(res[3], 4);
			done(null);
		}, done);
	});

	test('cancelling a call via CancellationToken before', function (done) {
		delegate = (a1: number, a2: number) => a1 + a2;
		let p = bProxy.$m(4, CancellationToken.Cancelled);
		p.then((res: number) => {
			assert.fail('should not receive result');
		}, (err) => {
			assert.ok(true);
			done(null);
		});
	});

	test('passing CancellationToken.None', function (done) {
		delegate = (a1: number, token: CancellationToken) => {
			assert.ok(!!token);
			return a1 + 1;
		};
		bProxy.$m(4, CancellationToken.None).then((res: number) => {
			assert.equal(res, 5);
			done(null);
		}, done);
	});

	test('cancelling a call via CancellationToken quickly', function (done) {
		// this is an implementation which, when cancellation is triggered, will return 7
		delegate = (a1: number, token: CancellationToken) => {
			return new Promise((resolve, reject) => {
				token.onCancellationRequested((e) => {
					resolve(7);
				});
			});
		};
		let tokenSource = new CancellationTokenSource();
		let p = bProxy.$m(4, tokenSource.token);
		p.then((res: number) => {
			assert.equal(res, 7);
			done(null);
		}, (err) => {
			assert.fail('should not receive error');
			done();
		});
		tokenSource.cancel();
	});

	test('throwing an error', function (done) {
		delegate = (a1: number, a2: number) => {
			throw new Error(`nope`);
		};
		bProxy.$m(4, 1).then((res) => {
			assert.fail('unexpected');
			done(null);
		}, (err) => {
			assert.equal(err.message, 'nope');
			done(null);
		});
	});

	test('error promise', function (done) {
		delegate = (a1: number, a2: number) => {
			return Promise.reject(undefined);
		};
		bProxy.$m(4, 1).then((res) => {
			assert.fail('unexpected');
			done(null);
		}, (err) => {
			assert.equal(err, undefined);
			done(null);
		});
	});

	test('issue #60450: Converting circular structure to JSON', function (done) {
		delegate = (a1: number, a2: number) => {
			let circular = <any>{};
			circular.self = circular;
			return circular;
		};
		bProxy.$m(4, 1).then((res) => {
			assert.equal(res, null);
			done(null);
		}, (err) => {
			assert.fail('unexpected');
			done(null);
		});
	});
});
