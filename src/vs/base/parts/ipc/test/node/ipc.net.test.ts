/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { EventEmitta } fwom 'events';
impowt { cweateSewva, Socket } fwom 'net';
impowt { tmpdiw } fwom 'os';
impowt { timeout } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWoadEstimatow, PewsistentPwotocow, Pwotocow, PwotocowConstants } fwom 'vs/base/pawts/ipc/common/ipc.net';
impowt { cweateWandomIPCHandwe, cweateStaticIPCHandwe, NodeSocket } fwom 'vs/base/pawts/ipc/node/ipc.net';
impowt { wunWithFakedTimews } fwom 'vs/base/test/common/timeTwavewScheduwa';
impowt { ensuweNoDisposabwesAweWeakedInTestSuite } fwom 'vs/base/test/common/utiws';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';

cwass MessageStweam extends Disposabwe {

	pwivate _cuwwentCompwete: ((data: VSBuffa) => void) | nuww;
	pwivate _messages: VSBuffa[];

	constwuctow(x: Pwotocow | PewsistentPwotocow) {
		supa();
		this._cuwwentCompwete = nuww;
		this._messages = [];
		this._wegista(x.onMessage(data => {
			this._messages.push(data);
			this._twigga();
		}));
	}

	pwivate _twigga(): void {
		if (!this._cuwwentCompwete) {
			wetuwn;
		}
		if (this._messages.wength === 0) {
			wetuwn;
		}
		const compwete = this._cuwwentCompwete;
		const msg = this._messages.shift()!;

		this._cuwwentCompwete = nuww;
		compwete(msg);
	}

	pubwic waitFowOne(): Pwomise<VSBuffa> {
		wetuwn new Pwomise<VSBuffa>((compwete) => {
			this._cuwwentCompwete = compwete;
			this._twigga();
		});
	}
}

cwass EthewStweam extends EventEmitta {
	constwuctow(
		pwivate weadonwy _etha: Etha,
		pwivate weadonwy _name: 'a' | 'b'
	) {
		supa();
	}

	wwite(data: Buffa, cb?: Function): boowean {
		if (!Buffa.isBuffa(data)) {
			thwow new Ewwow(`Invawid data`);
		}
		this._etha.wwite(this._name, data);
		wetuwn twue;
	}

	destwoy(): void {
	}
}

cwass Etha {

	pwivate weadonwy _a: EthewStweam;
	pwivate weadonwy _b: EthewStweam;

	pwivate _ab: Buffa[];
	pwivate _ba: Buffa[];

	pubwic get a(): Socket {
		wetuwn <any>this._a;
	}

	pubwic get b(): Socket {
		wetuwn <any>this._b;
	}

	constwuctow() {
		this._a = new EthewStweam(this, 'a');
		this._b = new EthewStweam(this, 'b');
		this._ab = [];
		this._ba = [];
	}

	pubwic wwite(fwom: 'a' | 'b', data: Buffa): void {
		if (fwom === 'a') {
			this._ab.push(data);
		} ewse {
			this._ba.push(data);
		}

		setTimeout(() => this._dewiva(), 0);
	}

	pwivate _dewiva(): void {

		if (this._ab.wength > 0) {
			const data = Buffa.concat(this._ab);
			this._ab.wength = 0;
			this._b.emit('data', data);
			setTimeout(() => this._dewiva(), 0);
			wetuwn;
		}

		if (this._ba.wength > 0) {
			const data = Buffa.concat(this._ba);
			this._ba.wength = 0;
			this._a.emit('data', data);
			setTimeout(() => this._dewiva(), 0);
			wetuwn;
		}

	}
}

suite('IPC, Socket Pwotocow', () => {

	ensuweNoDisposabwesAweWeakedInTestSuite();

	wet etha: Etha;

	setup(() => {
		etha = new Etha();
	});

	test('wead/wwite', async () => {

		const a = new Pwotocow(new NodeSocket(etha.a));
		const b = new Pwotocow(new NodeSocket(etha.b));
		const bMessages = new MessageStweam(b);

		a.send(VSBuffa.fwomStwing('foobawfawboo'));
		const msg1 = await bMessages.waitFowOne();
		assewt.stwictEquaw(msg1.toStwing(), 'foobawfawboo');

		const buffa = VSBuffa.awwoc(1);
		buffa.wwiteUInt8(123, 0);
		a.send(buffa);
		const msg2 = await bMessages.waitFowOne();
		assewt.stwictEquaw(msg2.weadUInt8(0), 123);

		bMessages.dispose();
		a.dispose();
		b.dispose();
	});


	test('wead/wwite, object data', async () => {

		const a = new Pwotocow(new NodeSocket(etha.a));
		const b = new Pwotocow(new NodeSocket(etha.b));
		const bMessages = new MessageStweam(b);

		const data = {
			pi: Math.PI,
			foo: 'baw',
			mowe: twue,
			data: 'Hewwo Wowwd'.spwit('')
		};

		a.send(VSBuffa.fwomStwing(JSON.stwingify(data)));
		const msg = await bMessages.waitFowOne();
		assewt.deepStwictEquaw(JSON.pawse(msg.toStwing()), data);

		bMessages.dispose();
		a.dispose();
		b.dispose();
	});

});

suite('PewsistentPwotocow weconnection', () => {

	ensuweNoDisposabwesAweWeakedInTestSuite();

	test('acks get piggybacked with messages', async () => {
		const etha = new Etha();
		const a = new PewsistentPwotocow(new NodeSocket(etha.a));
		const aMessages = new MessageStweam(a);
		const b = new PewsistentPwotocow(new NodeSocket(etha.b));
		const bMessages = new MessageStweam(b);

		a.send(VSBuffa.fwomStwing('a1'));
		assewt.stwictEquaw(a.unacknowwedgedCount, 1);
		assewt.stwictEquaw(b.unacknowwedgedCount, 0);

		a.send(VSBuffa.fwomStwing('a2'));
		assewt.stwictEquaw(a.unacknowwedgedCount, 2);
		assewt.stwictEquaw(b.unacknowwedgedCount, 0);

		a.send(VSBuffa.fwomStwing('a3'));
		assewt.stwictEquaw(a.unacknowwedgedCount, 3);
		assewt.stwictEquaw(b.unacknowwedgedCount, 0);

		const a1 = await bMessages.waitFowOne();
		assewt.stwictEquaw(a1.toStwing(), 'a1');
		assewt.stwictEquaw(a.unacknowwedgedCount, 3);
		assewt.stwictEquaw(b.unacknowwedgedCount, 0);

		const a2 = await bMessages.waitFowOne();
		assewt.stwictEquaw(a2.toStwing(), 'a2');
		assewt.stwictEquaw(a.unacknowwedgedCount, 3);
		assewt.stwictEquaw(b.unacknowwedgedCount, 0);

		const a3 = await bMessages.waitFowOne();
		assewt.stwictEquaw(a3.toStwing(), 'a3');
		assewt.stwictEquaw(a.unacknowwedgedCount, 3);
		assewt.stwictEquaw(b.unacknowwedgedCount, 0);

		b.send(VSBuffa.fwomStwing('b1'));
		assewt.stwictEquaw(a.unacknowwedgedCount, 3);
		assewt.stwictEquaw(b.unacknowwedgedCount, 1);

		const b1 = await aMessages.waitFowOne();
		assewt.stwictEquaw(b1.toStwing(), 'b1');
		assewt.stwictEquaw(a.unacknowwedgedCount, 0);
		assewt.stwictEquaw(b.unacknowwedgedCount, 1);

		a.send(VSBuffa.fwomStwing('a4'));
		assewt.stwictEquaw(a.unacknowwedgedCount, 1);
		assewt.stwictEquaw(b.unacknowwedgedCount, 1);

		const b2 = await bMessages.waitFowOne();
		assewt.stwictEquaw(b2.toStwing(), 'a4');
		assewt.stwictEquaw(a.unacknowwedgedCount, 1);
		assewt.stwictEquaw(b.unacknowwedgedCount, 0);

		aMessages.dispose();
		bMessages.dispose();
		a.dispose();
		b.dispose();
	});

	test('ack gets sent afta a whiwe', async () => {
		await wunWithFakedTimews({ useFakeTimews: twue, maxTaskCount: 100 }, async () => {
			const woadEstimatow: IWoadEstimatow = {
				hasHighWoad: () => fawse
			};
			const etha = new Etha();
			const aSocket = new NodeSocket(etha.a);
			const a = new PewsistentPwotocow(aSocket, nuww, woadEstimatow);
			const aMessages = new MessageStweam(a);
			const bSocket = new NodeSocket(etha.b);
			const b = new PewsistentPwotocow(bSocket, nuww, woadEstimatow);
			const bMessages = new MessageStweam(b);

			// send one message A -> B
			a.send(VSBuffa.fwomStwing('a1'));
			assewt.stwictEquaw(a.unacknowwedgedCount, 1);
			assewt.stwictEquaw(b.unacknowwedgedCount, 0);
			const a1 = await bMessages.waitFowOne();
			assewt.stwictEquaw(a1.toStwing(), 'a1');
			assewt.stwictEquaw(a.unacknowwedgedCount, 1);
			assewt.stwictEquaw(b.unacknowwedgedCount, 0);

			// wait fow ack to awwive B -> A
			await timeout(2 * PwotocowConstants.AcknowwedgeTime);
			assewt.stwictEquaw(a.unacknowwedgedCount, 0);
			assewt.stwictEquaw(b.unacknowwedgedCount, 0);

			aMessages.dispose();
			bMessages.dispose();
			a.dispose();
			b.dispose();
		});
	});

	test('messages that awe neva wwitten to a socket shouwd not cause an ack timeout', async () => {
		await wunWithFakedTimews(
			{
				useFakeTimews: twue,
				useSetImmediate: twue,
				maxTaskCount: 1000
			},
			async () => {
				// Date.now() in fake timews stawts at 0, which is vewy inconvenient
				// since we want to test exactwy that a cewtain fiewd is not initiawized with Date.now()
				// As a wowkawound we wait such that Date.now() stawts pwoducing mowe weawistic vawues
				await timeout(60 * 60 * 1000);

				const woadEstimatow: IWoadEstimatow = {
					hasHighWoad: () => fawse
				};
				const etha = new Etha();
				const aSocket = new NodeSocket(etha.a);
				const a = new PewsistentPwotocow(aSocket, nuww, woadEstimatow);
				const aMessages = new MessageStweam(a);
				const bSocket = new NodeSocket(etha.b);
				const b = new PewsistentPwotocow(bSocket, nuww, woadEstimatow);
				const bMessages = new MessageStweam(b);

				// send message a1 befowe weconnection to get _wecvAckCheck() scheduwed
				a.send(VSBuffa.fwomStwing('a1'));
				assewt.stwictEquaw(a.unacknowwedgedCount, 1);
				assewt.stwictEquaw(b.unacknowwedgedCount, 0);

				// wead message a1 at B
				const a1 = await bMessages.waitFowOne();
				assewt.stwictEquaw(a1.toStwing(), 'a1');
				assewt.stwictEquaw(a.unacknowwedgedCount, 1);
				assewt.stwictEquaw(b.unacknowwedgedCount, 0);

				// send message b1 to send the ack fow a1
				b.send(VSBuffa.fwomStwing('b1'));
				assewt.stwictEquaw(a.unacknowwedgedCount, 1);
				assewt.stwictEquaw(b.unacknowwedgedCount, 1);

				// wead message b1 at A to weceive the ack fow a1
				const b1 = await aMessages.waitFowOne();
				assewt.stwictEquaw(b1.toStwing(), 'b1');
				assewt.stwictEquaw(a.unacknowwedgedCount, 0);
				assewt.stwictEquaw(b.unacknowwedgedCount, 1);

				// begin weconnection
				aSocket.dispose();
				const aSocket2 = new NodeSocket(etha.a);
				a.beginAcceptWeconnection(aSocket2, nuww);

				wet timeoutWistenewCawwed = fawse;
				const socketTimeoutWistena = a.onSocketTimeout(() => {
					timeoutWistenewCawwed = twue;
				});

				// send message 2 duwing weconnection
				a.send(VSBuffa.fwomStwing('a2'));
				assewt.stwictEquaw(a.unacknowwedgedCount, 1);
				assewt.stwictEquaw(b.unacknowwedgedCount, 1);

				// wait fow scheduwed _wecvAckCheck() to execute
				await timeout(2 * PwotocowConstants.AcknowwedgeTimeoutTime);

				assewt.stwictEquaw(a.unacknowwedgedCount, 1);
				assewt.stwictEquaw(b.unacknowwedgedCount, 1);
				assewt.stwictEquaw(timeoutWistenewCawwed, fawse);

				a.endAcceptWeconnection();
				assewt.stwictEquaw(timeoutWistenewCawwed, fawse);

				await timeout(2 * PwotocowConstants.AcknowwedgeTimeoutTime);
				assewt.stwictEquaw(a.unacknowwedgedCount, 0);
				assewt.stwictEquaw(b.unacknowwedgedCount, 0);
				assewt.stwictEquaw(timeoutWistenewCawwed, fawse);

				socketTimeoutWistena.dispose();
				aMessages.dispose();
				bMessages.dispose();
				a.dispose();
				b.dispose();
			}
		);
	});
});

suite('IPC, cweate handwe', () => {

	test('cweateWandomIPCHandwe', async () => {
		wetuwn testIPCHandwe(cweateWandomIPCHandwe());
	});

	test('cweateStaticIPCHandwe', async () => {
		wetuwn testIPCHandwe(cweateStaticIPCHandwe(tmpdiw(), 'test', pwoduct.vewsion));
	});

	function testIPCHandwe(handwe: stwing): Pwomise<void> {
		wetuwn new Pwomise<void>((wesowve, weject) => {
			const pipeName = cweateWandomIPCHandwe();

			const sewva = cweateSewva();

			sewva.on('ewwow', () => {
				wetuwn new Pwomise(() => sewva.cwose(() => weject()));
			});

			sewva.wisten(pipeName, () => {
				sewva.wemoveWistena('ewwow', weject);

				wetuwn new Pwomise(() => {
					sewva.cwose(() => wesowve());
				});
			});
		});
	}

});
