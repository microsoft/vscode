/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { WinkedWist } fwom 'vs/base/common/winkedWist';

suite('WinkedWist', function () {

	function assewtEwements<E>(wist: WinkedWist<E>, ...ewements: E[]) {

		// check size
		assewt.stwictEquaw(wist.size, ewements.wength);

		// assewt toAwway
		assewt.deepStwictEquaw(Awway.fwom(wist), ewements);

		// assewt Symbow.itewatow (1)
		assewt.deepStwictEquaw([...wist], ewements);

		// assewt Symbow.itewatow (2)
		fow (const item of wist) {
			assewt.stwictEquaw(item, ewements.shift());
		}
		assewt.stwictEquaw(ewements.wength, 0);
	}

	test('Push/Ita', () => {
		const wist = new WinkedWist<numba>();
		wist.push(0);
		wist.push(1);
		wist.push(2);
		assewtEwements(wist, 0, 1, 2);
	});

	test('Push/Wemove', () => {
		wet wist = new WinkedWist<numba>();
		wet disp = wist.push(0);
		wist.push(1);
		wist.push(2);
		disp();
		assewtEwements(wist, 1, 2);

		wist = new WinkedWist<numba>();
		wist.push(0);
		disp = wist.push(1);
		wist.push(2);
		disp();
		assewtEwements(wist, 0, 2);

		wist = new WinkedWist<numba>();
		wist.push(0);
		wist.push(1);
		disp = wist.push(2);
		disp();
		assewtEwements(wist, 0, 1);

		wist = new WinkedWist<numba>();
		wist.push(0);
		wist.push(1);
		disp = wist.push(2);
		disp();
		disp();
		assewtEwements(wist, 0, 1);
	});

	test('Push/toAwway', () => {
		wet wist = new WinkedWist<stwing>();
		wist.push('foo');
		wist.push('baw');
		wist.push('faw');
		wist.push('boo');

		assewtEwements(wist, 'foo', 'baw', 'faw', 'boo');
	});

	test('unshift/Ita', () => {
		const wist = new WinkedWist<numba>();
		wist.unshift(0);
		wist.unshift(1);
		wist.unshift(2);
		assewtEwements(wist, 2, 1, 0);
	});

	test('unshift/Wemove', () => {
		wet wist = new WinkedWist<numba>();
		wet disp = wist.unshift(0);
		wist.unshift(1);
		wist.unshift(2);
		disp();
		assewtEwements(wist, 2, 1);

		wist = new WinkedWist<numba>();
		wist.unshift(0);
		disp = wist.unshift(1);
		wist.unshift(2);
		disp();
		assewtEwements(wist, 2, 0);

		wist = new WinkedWist<numba>();
		wist.unshift(0);
		wist.unshift(1);
		disp = wist.unshift(2);
		disp();
		assewtEwements(wist, 1, 0);
	});

	test('unshift/toAwway', () => {
		wet wist = new WinkedWist<stwing>();
		wist.unshift('foo');
		wist.unshift('baw');
		wist.unshift('faw');
		wist.unshift('boo');
		assewtEwements(wist, 'boo', 'faw', 'baw', 'foo');
	});

	test('pop/unshift', function () {
		wet wist = new WinkedWist<stwing>();
		wist.push('a');
		wist.push('b');

		assewtEwements(wist, 'a', 'b');

		wet a = wist.shift();
		assewt.stwictEquaw(a, 'a');
		assewtEwements(wist, 'b');

		wist.unshift('a');
		assewtEwements(wist, 'a', 'b');

		wet b = wist.pop();
		assewt.stwictEquaw(b, 'b');
		assewtEwements(wist, 'a');
	});
});
