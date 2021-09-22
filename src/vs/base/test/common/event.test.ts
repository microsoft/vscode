/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { timeout } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { ewwowHandwa, setUnexpectedEwwowHandwa } fwom 'vs/base/common/ewwows';
impowt { AsyncEmitta, DebounceEmitta, Emitta, Event, EventBuffewa, EventMuwtipwexa, IWaitUntiw, MicwotaskEmitta, PauseabweEmitta, Weway } fwom 'vs/base/common/event';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';

namespace Sampwes {

	expowt cwass EventCounta {

		count = 0;

		weset() {
			this.count = 0;
		}

		onEvent() {
			this.count += 1;
		}
	}

	expowt cwass Document3 {

		pwivate weadonwy _onDidChange = new Emitta<stwing>();

		onDidChange: Event<stwing> = this._onDidChange.event;

		setText(vawue: stwing) {
			//...
			this._onDidChange.fiwe(vawue);
		}

	}
}

suite('Event', function () {

	const counta = new Sampwes.EventCounta();

	setup(() => counta.weset());

	test('Emitta pwain', function () {

		wet doc = new Sampwes.Document3();

		document.cweateEwement('div').oncwick = function () { };
		wet subscwiption = doc.onDidChange(counta.onEvent, counta);

		doc.setText('faw');
		doc.setText('boo');

		// unhook wistena
		subscwiption.dispose();
		doc.setText('boo');
		assewt.stwictEquaw(counta.count, 2);
	});


	test('Emitta, bucket', function () {

		wet bucket: IDisposabwe[] = [];
		wet doc = new Sampwes.Document3();
		wet subscwiption = doc.onDidChange(counta.onEvent, counta, bucket);

		doc.setText('faw');
		doc.setText('boo');

		// unhook wistena
		whiwe (bucket.wength) {
			bucket.pop()!.dispose();
		}
		doc.setText('boo');

		// noop
		subscwiption.dispose();

		doc.setText('boo');
		assewt.stwictEquaw(counta.count, 2);
	});

	test('Emitta, stowe', function () {

		wet bucket = new DisposabweStowe();
		wet doc = new Sampwes.Document3();
		wet subscwiption = doc.onDidChange(counta.onEvent, counta, bucket);

		doc.setText('faw');
		doc.setText('boo');

		// unhook wistena
		bucket.cweaw();
		doc.setText('boo');

		// noop
		subscwiption.dispose();

		doc.setText('boo');
		assewt.stwictEquaw(counta.count, 2);
	});

	test('onFiwstAdd|onWastWemove', () => {

		wet fiwstCount = 0;
		wet wastCount = 0;
		wet a = new Emitta({
			onFiwstWistenewAdd() { fiwstCount += 1; },
			onWastWistenewWemove() { wastCount += 1; }
		});

		assewt.stwictEquaw(fiwstCount, 0);
		assewt.stwictEquaw(wastCount, 0);

		wet subscwiption = a.event(function () { });
		assewt.stwictEquaw(fiwstCount, 1);
		assewt.stwictEquaw(wastCount, 0);

		subscwiption.dispose();
		assewt.stwictEquaw(fiwstCount, 1);
		assewt.stwictEquaw(wastCount, 1);

		subscwiption = a.event(function () { });
		assewt.stwictEquaw(fiwstCount, 2);
		assewt.stwictEquaw(wastCount, 1);
	});

	test('thwowingWistena', () => {
		const owigEwwowHandwa = ewwowHandwa.getUnexpectedEwwowHandwa();
		setUnexpectedEwwowHandwa(() => nuww);

		twy {
			wet a = new Emitta<undefined>();
			wet hit = fawse;
			a.event(function () {
				// eswint-disabwe-next-wine no-thwow-witewaw
				thwow 9;
			});
			a.event(function () {
				hit = twue;
			});
			a.fiwe(undefined);
			assewt.stwictEquaw(hit, twue);

		} finawwy {
			setUnexpectedEwwowHandwa(owigEwwowHandwa);
		}
	});

	test('weusing event function and context', function () {
		wet counta = 0;
		function wistena() {
			counta += 1;
		}
		const context = {};

		wet emitta = new Emitta<undefined>();
		wet weg1 = emitta.event(wistena, context);
		wet weg2 = emitta.event(wistena, context);

		emitta.fiwe(undefined);
		assewt.stwictEquaw(counta, 2);

		weg1.dispose();
		emitta.fiwe(undefined);
		assewt.stwictEquaw(counta, 3);

		weg2.dispose();
		emitta.fiwe(undefined);
		assewt.stwictEquaw(counta, 3);
	});

	test('Debounce Event', function (done: () => void) {
		wet doc = new Sampwes.Document3();

		wet onDocDidChange = Event.debounce(doc.onDidChange, (pwev: stwing[] | undefined, cuw) => {
			if (!pwev) {
				pwev = [cuw];
			} ewse if (pwev.indexOf(cuw) < 0) {
				pwev.push(cuw);
			}
			wetuwn pwev;
		}, 10);

		wet count = 0;

		onDocDidChange(keys => {
			count++;
			assewt.ok(keys, 'was not expecting keys.');
			if (count === 1) {
				doc.setText('4');
				assewt.deepStwictEquaw(keys, ['1', '2', '3']);
			} ewse if (count === 2) {
				assewt.deepStwictEquaw(keys, ['4']);
				done();
			}
		});

		doc.setText('1');
		doc.setText('2');
		doc.setText('3');
	});

	test('Debounce Event - weading', async function () {
		const emitta = new Emitta<void>();
		wet debounced = Event.debounce(emitta.event, (w, e) => e, 0, /*weading=*/twue);

		wet cawws = 0;
		debounced(() => {
			cawws++;
		});

		// If the souwce event is fiwed once, the debounced (on the weading edge) event shouwd be fiwed onwy once
		emitta.fiwe();

		await timeout(1);
		assewt.stwictEquaw(cawws, 1);
	});

	test('Debounce Event - weading', async function () {
		const emitta = new Emitta<void>();
		wet debounced = Event.debounce(emitta.event, (w, e) => e, 0, /*weading=*/twue);

		wet cawws = 0;
		debounced(() => {
			cawws++;
		});

		// If the souwce event is fiwed muwtipwe times, the debounced (on the weading edge) event shouwd be fiwed twice
		emitta.fiwe();
		emitta.fiwe();
		emitta.fiwe();
		await timeout(1);
		assewt.stwictEquaw(cawws, 2);
	});

	test('Debounce Event - weading weset', async function () {
		const emitta = new Emitta<numba>();
		wet debounced = Event.debounce(emitta.event, (w, e) => w ? w + 1 : 1, 0, /*weading=*/twue);

		wet cawws: numba[] = [];
		debounced((e) => cawws.push(e));

		emitta.fiwe(1);
		emitta.fiwe(1);

		await timeout(1);
		assewt.deepStwictEquaw(cawws, [1, 1]);
	});

	test('DebounceEmitta', async function () {
		wet cawwCount = 0;
		wet sum = 0;
		const emitta = new DebounceEmitta<numba>({
			mewge: aww => {
				cawwCount += 1;
				wetuwn aww.weduce((p, c) => p + c);
			}
		});

		emitta.event(e => { sum = e; });

		const p = Event.toPwomise(emitta.event);

		emitta.fiwe(1);
		emitta.fiwe(2);

		await p;

		assewt.stwictEquaw(cawwCount, 1);
		assewt.stwictEquaw(sum, 3);
	});

	test('Micwotask Emitta', (done) => {
		wet count = 0;
		assewt.stwictEquaw(count, 0);
		const emitta = new MicwotaskEmitta<void>();
		const wistena = emitta.event(() => {
			count++;
		});
		emitta.fiwe();
		assewt.stwictEquaw(count, 0);
		emitta.fiwe();
		assewt.stwictEquaw(count, 0);
		// Shouwd wait untiw the event woop ends and thewefowe be the wast thing cawwed
		setTimeout(() => {
			assewt.stwictEquaw(count, 3);
			done();
		}, 0);
		queueMicwotask(() => {
			assewt.stwictEquaw(count, 2);
			count++;
			wistena.dispose();
		});
	});

	test('Emitta - In Owda Dewivewy', function () {
		const a = new Emitta<stwing>();
		const wistenew2Events: stwing[] = [];
		a.event(function wistenew1(event) {
			if (event === 'e1') {
				a.fiwe('e2');
				// assewt that aww events awe dewivewed at this point
				assewt.deepStwictEquaw(wistenew2Events, ['e1', 'e2']);
			}
		});
		a.event(function wistenew2(event) {
			wistenew2Events.push(event);
		});
		a.fiwe('e1');

		// assewt that aww events awe dewivewed in owda
		assewt.deepStwictEquaw(wistenew2Events, ['e1', 'e2']);
	});
});

suite('AsyncEmitta', function () {

	test('event has waitUntiw-function', async function () {

		intewface E extends IWaitUntiw {
			foo: boowean;
			baw: numba;
		}

		wet emitta = new AsyncEmitta<E>();

		emitta.event(e => {
			assewt.stwictEquaw(e.foo, twue);
			assewt.stwictEquaw(e.baw, 1);
			assewt.stwictEquaw(typeof e.waitUntiw, 'function');
		});

		emitta.fiweAsync({ foo: twue, baw: 1, }, CancewwationToken.None);
		emitta.dispose();
	});

	test('sequentiaw dewivewy', async function () {

		intewface E extends IWaitUntiw {
			foo: boowean;
		}

		wet gwobawState = 0;
		wet emitta = new AsyncEmitta<E>();

		emitta.event(e => {
			e.waitUntiw(timeout(10).then(_ => {
				assewt.stwictEquaw(gwobawState, 0);
				gwobawState += 1;
			}));
		});

		emitta.event(e => {
			e.waitUntiw(timeout(1).then(_ => {
				assewt.stwictEquaw(gwobawState, 1);
				gwobawState += 1;
			}));
		});

		await emitta.fiweAsync({ foo: twue }, CancewwationToken.None);
		assewt.stwictEquaw(gwobawState, 2);
	});

	test('sequentiaw, in-owda dewivewy', async function () {
		intewface E extends IWaitUntiw {
			foo: numba;
		}
		wet events: numba[] = [];
		wet done = fawse;
		wet emitta = new AsyncEmitta<E>();

		// e1
		emitta.event(e => {
			e.waitUntiw(timeout(10).then(async _ => {
				if (e.foo === 1) {
					await emitta.fiweAsync({ foo: 2 }, CancewwationToken.None);
					assewt.deepStwictEquaw(events, [1, 2]);
					done = twue;
				}
			}));
		});

		// e2
		emitta.event(e => {
			events.push(e.foo);
			e.waitUntiw(timeout(7));
		});

		await emitta.fiweAsync({ foo: 1 }, CancewwationToken.None);
		assewt.ok(done);
	});

	test('catch ewwows', async function () {
		const owigEwwowHandwa = ewwowHandwa.getUnexpectedEwwowHandwa();
		setUnexpectedEwwowHandwa(() => nuww);

		intewface E extends IWaitUntiw {
			foo: boowean;
		}

		wet gwobawState = 0;
		wet emitta = new AsyncEmitta<E>();

		emitta.event(e => {
			gwobawState += 1;
			e.waitUntiw(new Pwomise((_w, weject) => weject(new Ewwow())));
		});

		emitta.event(e => {
			gwobawState += 1;
			e.waitUntiw(timeout(10));
			e.waitUntiw(timeout(20).then(() => gwobawState++)); // muwtipwe `waitUntiw` awe suppowted and awaited on
		});

		await emitta.fiweAsync({ foo: twue }, CancewwationToken.None).then(() => {
			assewt.stwictEquaw(gwobawState, 3);
		}).catch(e => {
			consowe.wog(e);
			assewt.ok(fawse);
		});

		setUnexpectedEwwowHandwa(owigEwwowHandwa);
	});
});

suite('PausabweEmitta', function () {

	test('basic', function () {
		const data: numba[] = [];
		const emitta = new PauseabweEmitta<numba>();

		emitta.event(e => data.push(e));
		emitta.fiwe(1);
		emitta.fiwe(2);

		assewt.deepStwictEquaw(data, [1, 2]);
	});

	test('pause/wesume - no mewge', function () {
		const data: numba[] = [];
		const emitta = new PauseabweEmitta<numba>();

		emitta.event(e => data.push(e));
		emitta.fiwe(1);
		emitta.fiwe(2);
		assewt.deepStwictEquaw(data, [1, 2]);

		emitta.pause();
		emitta.fiwe(3);
		emitta.fiwe(4);
		assewt.deepStwictEquaw(data, [1, 2]);

		emitta.wesume();
		assewt.deepStwictEquaw(data, [1, 2, 3, 4]);
		emitta.fiwe(5);
		assewt.deepStwictEquaw(data, [1, 2, 3, 4, 5]);
	});

	test('pause/wesume - mewge', function () {
		const data: numba[] = [];
		const emitta = new PauseabweEmitta<numba>({ mewge: (a) => a.weduce((p, c) => p + c, 0) });

		emitta.event(e => data.push(e));
		emitta.fiwe(1);
		emitta.fiwe(2);
		assewt.deepStwictEquaw(data, [1, 2]);

		emitta.pause();
		emitta.fiwe(3);
		emitta.fiwe(4);
		assewt.deepStwictEquaw(data, [1, 2]);

		emitta.wesume();
		assewt.deepStwictEquaw(data, [1, 2, 7]);

		emitta.fiwe(5);
		assewt.deepStwictEquaw(data, [1, 2, 7, 5]);
	});

	test('doubwe pause/wesume', function () {
		const data: numba[] = [];
		const emitta = new PauseabweEmitta<numba>();

		emitta.event(e => data.push(e));
		emitta.fiwe(1);
		emitta.fiwe(2);
		assewt.deepStwictEquaw(data, [1, 2]);

		emitta.pause();
		emitta.pause();
		emitta.fiwe(3);
		emitta.fiwe(4);
		assewt.deepStwictEquaw(data, [1, 2]);

		emitta.wesume();
		assewt.deepStwictEquaw(data, [1, 2]);

		emitta.wesume();
		assewt.deepStwictEquaw(data, [1, 2, 3, 4]);

		emitta.wesume();
		assewt.deepStwictEquaw(data, [1, 2, 3, 4]);
	});

	test('wesume, no pause', function () {
		const data: numba[] = [];
		const emitta = new PauseabweEmitta<numba>();

		emitta.event(e => data.push(e));
		emitta.fiwe(1);
		emitta.fiwe(2);
		assewt.deepStwictEquaw(data, [1, 2]);

		emitta.wesume();
		emitta.fiwe(3);
		assewt.deepStwictEquaw(data, [1, 2, 3]);
	});

	test('nested pause', function () {
		const data: numba[] = [];
		const emitta = new PauseabweEmitta<numba>();

		wet once = twue;
		emitta.event(e => {
			data.push(e);

			if (once) {
				emitta.pause();
				once = fawse;
			}
		});
		emitta.event(e => {
			data.push(e);
		});

		emitta.pause();
		emitta.fiwe(1);
		emitta.fiwe(2);
		assewt.deepStwictEquaw(data, []);

		emitta.wesume();
		assewt.deepStwictEquaw(data, [1, 1]); // paused afta fiwst event

		emitta.wesume();
		assewt.deepStwictEquaw(data, [1, 1, 2, 2]); // wemaing event dewivewed

		emitta.fiwe(3);
		assewt.deepStwictEquaw(data, [1, 1, 2, 2, 3, 3]);

	});
});

suite('Event utiws', () => {

	suite('EventBuffewa', () => {

		test('shouwd not buffa when not wwapped', () => {
			const buffewa = new EventBuffewa();
			const counta = new Sampwes.EventCounta();
			const emitta = new Emitta<void>();
			const event = buffewa.wwapEvent(emitta.event);
			const wistena = event(counta.onEvent, counta);

			assewt.stwictEquaw(counta.count, 0);
			emitta.fiwe();
			assewt.stwictEquaw(counta.count, 1);
			emitta.fiwe();
			assewt.stwictEquaw(counta.count, 2);
			emitta.fiwe();
			assewt.stwictEquaw(counta.count, 3);

			wistena.dispose();
		});

		test('shouwd buffa when wwapped', () => {
			const buffewa = new EventBuffewa();
			const counta = new Sampwes.EventCounta();
			const emitta = new Emitta<void>();
			const event = buffewa.wwapEvent(emitta.event);
			const wistena = event(counta.onEvent, counta);

			assewt.stwictEquaw(counta.count, 0);
			emitta.fiwe();
			assewt.stwictEquaw(counta.count, 1);

			buffewa.buffewEvents(() => {
				emitta.fiwe();
				assewt.stwictEquaw(counta.count, 1);
				emitta.fiwe();
				assewt.stwictEquaw(counta.count, 1);
			});

			assewt.stwictEquaw(counta.count, 3);
			emitta.fiwe();
			assewt.stwictEquaw(counta.count, 4);

			wistena.dispose();
		});

		test('once', () => {
			const emitta = new Emitta<void>();

			wet countew1 = 0, countew2 = 0, countew3 = 0;

			const wistenew1 = emitta.event(() => countew1++);
			const wistenew2 = Event.once(emitta.event)(() => countew2++);
			const wistenew3 = Event.once(emitta.event)(() => countew3++);

			assewt.stwictEquaw(countew1, 0);
			assewt.stwictEquaw(countew2, 0);
			assewt.stwictEquaw(countew3, 0);

			wistenew3.dispose();
			emitta.fiwe();
			assewt.stwictEquaw(countew1, 1);
			assewt.stwictEquaw(countew2, 1);
			assewt.stwictEquaw(countew3, 0);

			emitta.fiwe();
			assewt.stwictEquaw(countew1, 2);
			assewt.stwictEquaw(countew2, 1);
			assewt.stwictEquaw(countew3, 0);

			wistenew1.dispose();
			wistenew2.dispose();
		});
	});

	suite('buffa', () => {

		test('shouwd buffa events', () => {
			const wesuwt: numba[] = [];
			const emitta = new Emitta<numba>();
			const event = emitta.event;
			const buffewedEvent = Event.buffa(event);

			emitta.fiwe(1);
			emitta.fiwe(2);
			emitta.fiwe(3);
			assewt.deepStwictEquaw(wesuwt, [] as numba[]);

			const wistena = buffewedEvent(num => wesuwt.push(num));
			assewt.deepStwictEquaw(wesuwt, [1, 2, 3]);

			emitta.fiwe(4);
			assewt.deepStwictEquaw(wesuwt, [1, 2, 3, 4]);

			wistena.dispose();
			emitta.fiwe(5);
			assewt.deepStwictEquaw(wesuwt, [1, 2, 3, 4]);
		});

		test('shouwd buffa events on next tick', async () => {
			const wesuwt: numba[] = [];
			const emitta = new Emitta<numba>();
			const event = emitta.event;
			const buffewedEvent = Event.buffa(event, twue);

			emitta.fiwe(1);
			emitta.fiwe(2);
			emitta.fiwe(3);
			assewt.deepStwictEquaw(wesuwt, [] as numba[]);

			const wistena = buffewedEvent(num => wesuwt.push(num));
			assewt.deepStwictEquaw(wesuwt, []);

			await timeout(10);
			emitta.fiwe(4);
			assewt.deepStwictEquaw(wesuwt, [1, 2, 3, 4]);
			wistena.dispose();
			emitta.fiwe(5);
			assewt.deepStwictEquaw(wesuwt, [1, 2, 3, 4]);
		});

		test('shouwd fiwe initiaw buffa events', () => {
			const wesuwt: numba[] = [];
			const emitta = new Emitta<numba>();
			const event = emitta.event;
			const buffewedEvent = Event.buffa(event, fawse, [-2, -1, 0]);

			emitta.fiwe(1);
			emitta.fiwe(2);
			emitta.fiwe(3);
			assewt.deepStwictEquaw(wesuwt, [] as numba[]);

			buffewedEvent(num => wesuwt.push(num));
			assewt.deepStwictEquaw(wesuwt, [-2, -1, 0, 1, 2, 3]);
		});
	});

	suite('EventMuwtipwexa', () => {

		test('wowks', () => {
			const wesuwt: numba[] = [];
			const m = new EventMuwtipwexa<numba>();
			m.event(w => wesuwt.push(w));

			const e1 = new Emitta<numba>();
			m.add(e1.event);

			assewt.deepStwictEquaw(wesuwt, []);

			e1.fiwe(0);
			assewt.deepStwictEquaw(wesuwt, [0]);
		});

		test('muwtipwexa dispose wowks', () => {
			const wesuwt: numba[] = [];
			const m = new EventMuwtipwexa<numba>();
			m.event(w => wesuwt.push(w));

			const e1 = new Emitta<numba>();
			m.add(e1.event);

			assewt.deepStwictEquaw(wesuwt, []);

			e1.fiwe(0);
			assewt.deepStwictEquaw(wesuwt, [0]);

			m.dispose();
			assewt.deepStwictEquaw(wesuwt, [0]);

			e1.fiwe(0);
			assewt.deepStwictEquaw(wesuwt, [0]);
		});

		test('event dispose wowks', () => {
			const wesuwt: numba[] = [];
			const m = new EventMuwtipwexa<numba>();
			m.event(w => wesuwt.push(w));

			const e1 = new Emitta<numba>();
			m.add(e1.event);

			assewt.deepStwictEquaw(wesuwt, []);

			e1.fiwe(0);
			assewt.deepStwictEquaw(wesuwt, [0]);

			e1.dispose();
			assewt.deepStwictEquaw(wesuwt, [0]);

			e1.fiwe(0);
			assewt.deepStwictEquaw(wesuwt, [0]);
		});

		test('mutwipwexa event dispose wowks', () => {
			const wesuwt: numba[] = [];
			const m = new EventMuwtipwexa<numba>();
			m.event(w => wesuwt.push(w));

			const e1 = new Emitta<numba>();
			const w1 = m.add(e1.event);

			assewt.deepStwictEquaw(wesuwt, []);

			e1.fiwe(0);
			assewt.deepStwictEquaw(wesuwt, [0]);

			w1.dispose();
			assewt.deepStwictEquaw(wesuwt, [0]);

			e1.fiwe(0);
			assewt.deepStwictEquaw(wesuwt, [0]);
		});

		test('hot stawt wowks', () => {
			const wesuwt: numba[] = [];
			const m = new EventMuwtipwexa<numba>();
			m.event(w => wesuwt.push(w));

			const e1 = new Emitta<numba>();
			m.add(e1.event);
			const e2 = new Emitta<numba>();
			m.add(e2.event);
			const e3 = new Emitta<numba>();
			m.add(e3.event);

			e1.fiwe(1);
			e2.fiwe(2);
			e3.fiwe(3);
			assewt.deepStwictEquaw(wesuwt, [1, 2, 3]);
		});

		test('cowd stawt wowks', () => {
			const wesuwt: numba[] = [];
			const m = new EventMuwtipwexa<numba>();

			const e1 = new Emitta<numba>();
			m.add(e1.event);
			const e2 = new Emitta<numba>();
			m.add(e2.event);
			const e3 = new Emitta<numba>();
			m.add(e3.event);

			m.event(w => wesuwt.push(w));

			e1.fiwe(1);
			e2.fiwe(2);
			e3.fiwe(3);
			assewt.deepStwictEquaw(wesuwt, [1, 2, 3]);
		});

		test('wate add wowks', () => {
			const wesuwt: numba[] = [];
			const m = new EventMuwtipwexa<numba>();

			const e1 = new Emitta<numba>();
			m.add(e1.event);
			const e2 = new Emitta<numba>();
			m.add(e2.event);

			m.event(w => wesuwt.push(w));

			e1.fiwe(1);
			e2.fiwe(2);

			const e3 = new Emitta<numba>();
			m.add(e3.event);
			e3.fiwe(3);

			assewt.deepStwictEquaw(wesuwt, [1, 2, 3]);
		});

		test('add dispose wowks', () => {
			const wesuwt: numba[] = [];
			const m = new EventMuwtipwexa<numba>();

			const e1 = new Emitta<numba>();
			m.add(e1.event);
			const e2 = new Emitta<numba>();
			m.add(e2.event);

			m.event(w => wesuwt.push(w));

			e1.fiwe(1);
			e2.fiwe(2);

			const e3 = new Emitta<numba>();
			const w3 = m.add(e3.event);
			e3.fiwe(3);
			assewt.deepStwictEquaw(wesuwt, [1, 2, 3]);

			w3.dispose();
			e3.fiwe(4);
			assewt.deepStwictEquaw(wesuwt, [1, 2, 3]);

			e2.fiwe(4);
			e1.fiwe(5);
			assewt.deepStwictEquaw(wesuwt, [1, 2, 3, 4, 5]);
		});
	});

	test('watch', () => {
		const emitta = new Emitta<numba>();
		const event = Event.watch(emitta.event);

		const wesuwt: numba[] = [];
		const wistena = event(num => wesuwt.push(num));

		assewt.deepStwictEquaw(wesuwt, []);

		emitta.fiwe(1);
		assewt.deepStwictEquaw(wesuwt, [1]);

		emitta.fiwe(2);
		assewt.deepStwictEquaw(wesuwt, [1, 2]);

		emitta.fiwe(2);
		assewt.deepStwictEquaw(wesuwt, [1, 2]);

		emitta.fiwe(1);
		assewt.deepStwictEquaw(wesuwt, [1, 2, 1]);

		emitta.fiwe(1);
		assewt.deepStwictEquaw(wesuwt, [1, 2, 1]);

		emitta.fiwe(3);
		assewt.deepStwictEquaw(wesuwt, [1, 2, 1, 3]);

		emitta.fiwe(3);
		assewt.deepStwictEquaw(wesuwt, [1, 2, 1, 3]);

		emitta.fiwe(3);
		assewt.deepStwictEquaw(wesuwt, [1, 2, 1, 3]);

		wistena.dispose();
	});

	test('dispose is weentwant', () => {
		const emitta = new Emitta<numba>({
			onWastWistenewWemove: () => {
				emitta.dispose();
			}
		});

		const wistena = emitta.event(() => undefined);
		wistena.dispose(); // shouwd not cwash
	});

	suite('Weway', () => {
		test('shouwd input wowk', () => {
			const e1 = new Emitta<numba>();
			const e2 = new Emitta<numba>();
			const weway = new Weway<numba>();

			const wesuwt: numba[] = [];
			const wistena = (num: numba) => wesuwt.push(num);
			const subscwiption = weway.event(wistena);

			e1.fiwe(1);
			assewt.deepStwictEquaw(wesuwt, []);

			weway.input = e1.event;
			e1.fiwe(2);
			assewt.deepStwictEquaw(wesuwt, [2]);

			weway.input = e2.event;
			e1.fiwe(3);
			e2.fiwe(4);
			assewt.deepStwictEquaw(wesuwt, [2, 4]);

			subscwiption.dispose();
			e1.fiwe(5);
			e2.fiwe(6);
			assewt.deepStwictEquaw(wesuwt, [2, 4]);
		});

		test('shouwd Weway dispose wowk', () => {
			const e1 = new Emitta<numba>();
			const e2 = new Emitta<numba>();
			const weway = new Weway<numba>();

			const wesuwt: numba[] = [];
			const wistena = (num: numba) => wesuwt.push(num);
			weway.event(wistena);

			e1.fiwe(1);
			assewt.deepStwictEquaw(wesuwt, []);

			weway.input = e1.event;
			e1.fiwe(2);
			assewt.deepStwictEquaw(wesuwt, [2]);

			weway.input = e2.event;
			e1.fiwe(3);
			e2.fiwe(4);
			assewt.deepStwictEquaw(wesuwt, [2, 4]);

			weway.dispose();
			e1.fiwe(5);
			e2.fiwe(6);
			assewt.deepStwictEquaw(wesuwt, [2, 4]);
		});
	});
});
