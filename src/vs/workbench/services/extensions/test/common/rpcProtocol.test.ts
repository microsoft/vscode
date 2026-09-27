/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { URITransformer } from '../../../../../base/common/uriIpc.js';
import { IMessagePassingProtocol } from '../../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ProxyIdentifier, SerializableObjectWithBuffers } from '../../common/proxyIdentifier.js';
import { parseJsonAndRestoreBufferRefs, RPCProtocol, stringifyJsonWithBufferRefs } from '../../common/rpcProtocol.js';

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
	let bProtocol: RPCProtocol;
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
		bProtocol = disposables.add(new RPCProtocol(b_protocol));

		const bIdentifier = new ProxyIdentifier<BClass>('bb');
		const bInstance = new BClass();
		bProtocol.set(bIdentifier, bInstance);
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

	test('releases cancellation handler when the invoked call does not settle', async function () {
		let resolveRemoteToken!: (token: CancellationToken) => void;
		const remoteToken = new Promise<CancellationToken>(resolve => resolveRemoteToken = resolve);
		delegate = (_a1: number, token: CancellationToken) => {
			resolveRemoteToken(token);
			return new Promise(() => { });
		};

		const tokenSource = disposables.add(new CancellationTokenSource());
		void bProxy.$m(4, tokenSource.token);
		const token = await remoteToken;
		const cancellationRequested = new Promise<void>(resolve => {
			disposables.add(token.onCancellationRequested(() => resolve()));
		});
		tokenSource.cancel();
		await cancellationRequested;

		const cancelInvokedHandlers = Reflect.get(bProtocol, '_cancelInvokedHandlers') as Record<string, () => void>;
		assert.deepStrictEqual(Object.keys(cancelInvokedHandlers), []);
	});

	test('does not track uncancellable calls that do not settle', async function () {
		let resolveInvoked!: () => void;
		const invoked = new Promise<void>(resolve => resolveInvoked = resolve);
		delegate = () => {
			resolveInvoked();
			return new Promise(() => { });
		};

		void bProxy.$m(4, 1);
		await invoked;

		const cancelInvokedHandlers = Reflect.get(bProtocol, '_cancelInvokedHandlers') as Record<string, () => void>;
		assert.deepStrictEqual(Object.keys(cancelInvokedHandlers), []);
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
			// eslint-disable-next-line local/code-no-any-casts
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
		// eslint-disable-next-line local/code-no-any-casts
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

	test('externalizes large strings instead of aggregating them into RPC JSON', () => {
		const text = 'x'.repeat(128 * 1024);
		const history = Array.from({ length: 32 }, (_, index) => ({
			requestId: `request-${index}`,
			result: { metadata: { text } }
		}));

		const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(history);

		assert.deepStrictEqual({
			smallJson: jsonString.length < 8 * 1024,
			bufferCount: referencedBuffers.length
		}, { smallJson: true, bufferCount: 32 });
		assert.deepStrictEqual(parseJsonAndRestoreBufferRefs(jsonString, referencedBuffers, null), history);
	});

	test('only externalizes strings at or above the large-string threshold', () => {
		const value = { small: 's'.repeat(64 * 1024 - 1), large: 'l'.repeat(64 * 1024) };
		const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(value);

		assert.strictEqual(referencedBuffers.length, 1);
		assert.deepStrictEqual(parseJsonAndRestoreBufferRefs(jsonString, referencedBuffers, null), value);
	});

	test('transfers large strings losslessly in buffer-backed requests and replies', async () => {
		const value = {
			text: '"\\\u0000\u2028\ud800x\udfff\ud83d\ude80'.repeat(8192),
			buffer: VSBuffer.wrap(new Uint8Array([1, 2, 3])),
			nested: { text: 'short' }
		};
		delegate = (arg: SerializableObjectWithBuffers<typeof value>) => new SerializableObjectWithBuffers(arg.value);

		const result: SerializableObjectWithBuffers<typeof value> = await bProxy.$m(new SerializableObjectWithBuffers(value), undefined);

		assert.deepStrictEqual(result.value, value);
	});

	test('buffer-backed JSON can retain standard undefined normalization', async () => {
		const value = {
			text: 'x'.repeat(128 * 1024),
			omitted: undefined,
			items: [undefined, 1, Number.NaN]
		};
		delegate = (arg: SerializableObjectWithBuffers<typeof value>) => new SerializableObjectWithBuffers(arg.value);

		const result: SerializableObjectWithBuffers<typeof value> = await bProxy.$m(new SerializableObjectWithBuffers(value, { preserveUndefined: false }), undefined);

		assert.deepStrictEqual(result.value, JSON.parse(JSON.stringify(value)));
	});

	test('preserves literal reference-shaped metadata', () => {
		const value = {
			text: 'x'.repeat(64 * 1024),
			references: [
				{ '$$ref$$': 0, type: 'json' },
				{ '$$ref$$': 0, type: 'string' },
				{ '$$ref$$': -1 }
			]
		};
		const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(value, null, false, false);
		const result: typeof value = parseJsonAndRestoreBufferRefs(jsonString, referencedBuffers, null);

		assert.deepStrictEqual(result.references.map(reference => reference?.type), value.references.map(reference => reference.type));
		assert.deepStrictEqual(result, value);
	});

	test('keeps nested buffers and large strings externalized in literal reference-shaped metadata', () => {
		const value = {
			'$$ref$$': 0,
			payload: VSBuffer.wrap(new Uint8Array([1, 2, 3])),
			history: Array.from({ length: 8 }, () => ({ '$$ref$$': -1, text: 'x'.repeat(64 * 1024) }))
		};
		const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(value);

		assert.deepStrictEqual({
			smallJson: jsonString.length < 2 * 1024,
			bufferCount: referencedBuffers.length
		}, { smallJson: true, bufferCount: 9 });
		assert.deepStrictEqual(parseJsonAndRestoreBufferRefs(jsonString, referencedBuffers, null), value);
	});

	test('preserves nested buffers in literal reference-shaped requests and replies', async () => {
		const value = {
			'$$ref$$': 0,
			payload: VSBuffer.wrap(new Uint8Array([1, 2, 3])),
			nested: { '$$ref$$': { value: 4 } }
		};
		delegate = (arg: SerializableObjectWithBuffers<typeof value>) => new SerializableObjectWithBuffers(arg.value);

		const result: SerializableObjectWithBuffers<typeof value> = await bProxy.$m(new SerializableObjectWithBuffers(value), undefined);

		assert.deepStrictEqual(result.value, value);
	});

	for (const preserveUndefined of [true, false]) {
		test(`preserves literal reference values with preserveUndefined=${preserveUndefined}`, () => {
			const references = [0, -1, 'literal', false, null, NaN, undefined, [], { value: 0 }, { '$$ref$$': 0 }, () => undefined, Symbol('ignored')];
			const value = references.map(reference => ({ '$$ref$$': reference, sibling: 'retained' }));
			const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(value, null, false, preserveUndefined);

			assert.deepStrictEqual(parseJsonAndRestoreBufferRefs(jsonString, referencedBuffers, null), JSON.parse(JSON.stringify(value)));
		});

		test(`preserves nested undefined values in literal reference-shaped metadata with preserveUndefined=${preserveUndefined}`, () => {
			const value = { '$$ref$$': 0, nested: { omitted: undefined, items: [undefined] } };
			const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(value, null, false, preserveUndefined);

			assert.deepStrictEqual(parseJsonAndRestoreBufferRefs(jsonString, referencedBuffers, null), {
				'$$ref$$': 0,
				nested: { items: preserveUndefined ? new Array(1) : [null] }
			});
		});
	}

	test('transforms incoming URIs inside literal reference-shaped metadata', () => {
		const value = { '$$ref$$': 0, uri: URI.file('/original').toJSON() };
		const transformer = new URITransformer({
			transformIncoming: uri => ({ ...uri, path: '/transformed' }),
			transformOutgoing: uri => uri,
			transformOutgoingScheme: scheme => scheme
		});
		const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(value);
		const result: typeof value = parseJsonAndRestoreBufferRefs(jsonString, referencedBuffers, transformer);

		assert.deepStrictEqual({ reference: result.$$ref$$, uri: URI.revive(result.uri).toString() }, {
			reference: 0,
			uri: URI.file('/transformed').toString()
		});
	});

	test('rejects cycles through literal reference-shaped metadata', () => {
		const value: { '$$ref$$': number; self?: object } = { '$$ref$$': 0 };
		value.self = value;

		assert.throws(() => stringifyJsonWithBufferRefs(value), TypeError);
		assert.strictEqual(stringifyJsonWithBufferRefs(value, null, true).jsonString, 'null');
	});

	test('normalizes literal reference values only once', () => {
		const keys: string[] = [];
		const reference = {
			text: 'literal',
			toJSON: (key: string): object => {
				keys.push(key);
				return reference;
			}
		};
		const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs({ '$$ref$$': reference });

		assert.deepStrictEqual({
			keys,
			result: parseJsonAndRestoreBufferRefs(jsonString, referencedBuffers, null)
		}, { keys: ['$$ref$$'], result: { '$$ref$$': { text: 'literal' } } });
	});
});
