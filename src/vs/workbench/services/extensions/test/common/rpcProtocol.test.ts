/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ProxyIdentifier, SerializableObjectWithBuffers } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import { RPCProtocol } from 'vs/workbench/services/extensions/common/rpcProtocol';

suite('RPCProtocol', () => {

	let disposables: DisposableStore;

	class MessagePassingProtocol implements IMessagePassingProtocol {
		private _pair?: MessagePassingProtocol;

		private readonly _onMessage = new Emitter<VSBuffer>();
		public readonly onMessage: Event<VSBuffer> = this._onMessage.event;

		public setPair(other: MessagePassingProtocol) {
			this._pair = other;
		}

		public send(buffer: VSBuffer): void {
			Promise.resolve().then(() => {
				this._pair!._onMessage.fire(buffer);
			});
		}
	}

	let delegate: (a1: any, a2: any) => any;
	let bProxy: BClass;
	class BClass {
		$m(a1: any, a2: any): Promise<any> {
			return Promise.resolve(delegate.call(null, a1, a2));
		}
	}

	setup(() => {
		disposables = new DisposableStore();

		const a_protocol = new MessagePassingProtocol();
		const b_protocol = new MessagePassingProtocol();
		a_protocol.setPair(b_protocol);
		b_protocol.setPair(a_protocol);

		const A = disposables.add(new RPCProtocol(a_protocol));
		const B = disposables.add(new RPCProtocol(b_protocol));

		const bIdentifier = new ProxyIdentifier<BClass>('bb');
		const bInstance = new BClass();
		B.set(bIdentifier, bInstance);
		bProxy = A.getProxy(bIdentifier);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('simple call', function (done) {
		delegate = (a1: number, a2: number) => a1 + a2;
		bProxy.$m(4, 1).then((res: number) => {
			assert.strictEqual(res, 5);
			done(null);
		}, done);
	});

	test('simple call without result', function (done) {
		delegate = (a1: number, a2: number) => { };
		bProxy.$m(4, 1).then((res: number) => {
			assert.strictEqual(res, undefined);
			done(null);
		}, done);
	});

	test('passing buffer as argument', function (done) {
		delegate = (a1: VSBuffer, a2: number) => {
			assert.ok(a1 instanceof VSBuffer);
			return a1.buffer[a2];
		};
		const b = VSBuffer.alloc(4);
		b.buffer[0] = 1;
		b.buffer[1] = 2;
		b.buffer[2] = 3;
		b.buffer[3] = 4;
		bProxy.$m(b, 2).then((res: number) => {
			assert.strictEqual(res, 3);
			done(null);
		}, done);
	});

	test('returning a buffer', function (done) {
		delegate = (a1: number, a2: number) => {
			const b = VSBuffer.alloc(4);
			b.buffer[0] = 1;
			b.buffer[1] = 2;
			b.buffer[2] = 3;
			b.buffer[3] = 4;
			return b;
		};
		bProxy.$m(4, 1).then((res: VSBuffer) => {
			assert.ok(res instanceof VSBuffer);
			assert.strictEqual(res.buffer[0], 1);
			assert.strictEqual(res.buffer[1], 2);
			assert.strictEqual(res.buffer[2], 3);
			assert.strictEqual(res.buffer[3], 4);
			done(null);
		}, done);
	});

	test('cancelling a call via CancellationToken before', function (done) {
		delegate = (a1: number, a2: number) => a1 + a2;
		const p = bProxy.$m(4, CancellationToken.Cancelled);
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
			assert.strictEqual(res, 5);
			done(null);
		}, done);
	});

	test('cancelling a call via CancellationToken quickly', function (done) {
		// this is an implementation which, when cancellation is triggered, will return 7
		delegate = (a1: number, token: CancellationToken) => {
			return new Promise((resolve, reject) => {
				const disposable = token.onCancellationRequested((e) => {
					disposable.dispose();
					resolve(7);
				});
			});
		};
		const tokenSource = new CancellationTokenSource();
		const p = bProxy.$m(4, tokenSource.token);
		p.then((res: number) => {
			assert.strictEqual(res, 7);
		}, (err) => {
			assert.fail('should not receive error');
		}).finally(done);
		tokenSource.cancel();
	});

	test('throwing an error', function (done) {
		delegate = (a1: number, a2: number) => {
			throw new Error(`nope`);
		};
		bProxy.$m(4, 1).then((res) => {
			assert.fail('unexpected');
		}, (err) => {
			assert.strictEqual(err.message, 'nope');
		}).finally(done);
	});

	test('error promise', function (done) {
		delegate = (a1: number, a2: number) => {
			return Promise.reject(undefined);
		};
		bProxy.$m(4, 1).then((res) => {
			assert.fail('unexpected');
		}, (err) => {
			assert.strictEqual(err, undefined);
		}).finally(done);
	});

	test('issue #60450: Converting circular structure to JSON', function (done) {
		delegate = (a1: number, a2: number) => {
			const circular = <any>{};
			circular.self = circular;
			return circular;
		};
		bProxy.$m(4, 1).then((res) => {
			assert.strictEqual(res, null);
		}, (err) => {
			assert.fail('unexpected');
		}).finally(done);
	});

	test('issue #72798: null errors are hard to digest', function (done) {
		delegate = (a1: number, a2: number) => {
			// eslint-disable-next-line no-throw-literal
			throw { 'what': 'what' };
		};
		bProxy.$m(4, 1).then((res) => {
			assert.fail('unexpected');
		}, (err) => {
			assert.strictEqual(err.what, 'what');
		}).finally(done);
	});

	test('undefined arguments arrive as null', function () {
		delegate = (a1: any, a2: any) => {
			assert.strictEqual(typeof a1, 'undefined');
			assert.strictEqual(a2, null);
			return 7;
		};
		return bProxy.$m(undefined, null).then((res) => {
			assert.strictEqual(res, 7);
		});
	});

	test('issue #81424: SerializeRequest should throw if an argument can not be serialized', () => {
		const badObject = {};
		(<any>badObject).loop = badObject;

		assert.throws(() => {
			bProxy.$m(badObject, '2');
		});
	});

	test('SerializableObjectWithBuffers is correctly transfered', function (done) {
		delegate = (a1: SerializableObjectWithBuffers<{ string: string; buff: VSBuffer }>, a2: number) => {
			return new SerializableObjectWithBuffers({ string: a1.value.string + ' world', buff: a1.value.buff });
		};

		const b = VSBuffer.alloc(4);
		b.buffer[0] = 1;
		b.buffer[1] = 2;
		b.buffer[2] = 3;
		b.buffer[3] = 4;

		bProxy.$m(new SerializableObjectWithBuffers({ string: 'hello', buff: b }), undefined).then((res: SerializableObjectWithBuffers<any>) => {
			assert.ok(res instanceof SerializableObjectWithBuffers);
			assert.strictEqual(res.value.string, 'hello world');

			assert.ok(res.value.buff instanceof VSBuffer);

			const bufferValues = Array.from(res.value.buff.buffer);

			assert.strictEqual(bufferValues[0], 1);
			assert.strictEqual(bufferValues[1], 2);
			assert.strictEqual(bufferValues[2], 3);
			assert.strictEqual(bufferValues[3], 4);
			done(null);
		}, done);
	});
});
