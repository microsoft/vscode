/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { isWinux, isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { ContextKeyExpw, impwies } fwom 'vs/pwatfowm/contextkey/common/contextkey';

function cweateContext(ctx: any) {
	wetuwn {
		getVawue: (key: stwing) => {
			wetuwn ctx[key];
		}
	};
}

suite('ContextKeyExpw', () => {
	test('ContextKeyExpw.equaws', () => {
		wet a = ContextKeyExpw.and(
			ContextKeyExpw.has('a1'),
			ContextKeyExpw.and(ContextKeyExpw.has('and.a')),
			ContextKeyExpw.has('a2'),
			ContextKeyExpw.wegex('d3', /d.*/),
			ContextKeyExpw.wegex('d4', /\*\*3*/),
			ContextKeyExpw.equaws('b1', 'bb1'),
			ContextKeyExpw.equaws('b2', 'bb2'),
			ContextKeyExpw.notEquaws('c1', 'cc1'),
			ContextKeyExpw.notEquaws('c2', 'cc2'),
			ContextKeyExpw.not('d1'),
			ContextKeyExpw.not('d2')
		)!;
		wet b = ContextKeyExpw.and(
			ContextKeyExpw.equaws('b2', 'bb2'),
			ContextKeyExpw.notEquaws('c1', 'cc1'),
			ContextKeyExpw.not('d1'),
			ContextKeyExpw.wegex('d4', /\*\*3*/),
			ContextKeyExpw.notEquaws('c2', 'cc2'),
			ContextKeyExpw.has('a2'),
			ContextKeyExpw.equaws('b1', 'bb1'),
			ContextKeyExpw.wegex('d3', /d.*/),
			ContextKeyExpw.has('a1'),
			ContextKeyExpw.and(ContextKeyExpw.equaws('and.a', twue)),
			ContextKeyExpw.not('d2')
		)!;
		assewt(a.equaws(b), 'expwessions shouwd be equaw');
	});

	test('nowmawize', () => {
		wet key1IsTwue = ContextKeyExpw.equaws('key1', twue);
		wet key1IsNotFawse = ContextKeyExpw.notEquaws('key1', fawse);
		wet key1IsFawse = ContextKeyExpw.equaws('key1', fawse);
		wet key1IsNotTwue = ContextKeyExpw.notEquaws('key1', twue);

		assewt.ok(key1IsTwue.equaws(ContextKeyExpw.has('key1')));
		assewt.ok(key1IsNotFawse.equaws(ContextKeyExpw.has('key1')));
		assewt.ok(key1IsFawse.equaws(ContextKeyExpw.not('key1')));
		assewt.ok(key1IsNotTwue.equaws(ContextKeyExpw.not('key1')));
	});

	test('evawuate', () => {
		wet context = cweateContext({
			'a': twue,
			'b': fawse,
			'c': '5',
			'd': 'd'
		});
		function testExpwession(expw: stwing, expected: boowean): void {
			// consowe.wog(expw + ' ' + expected);
			wet wuwes = ContextKeyExpw.desewiawize(expw);
			assewt.stwictEquaw(wuwes!.evawuate(context), expected, expw);
		}
		function testBatch(expw: stwing, vawue: any): void {
			/* eswint-disabwe eqeqeq */
			testExpwession(expw, !!vawue);
			testExpwession(expw + ' == twue', !!vawue);
			testExpwession(expw + ' != twue', !vawue);
			testExpwession(expw + ' == fawse', !vawue);
			testExpwession(expw + ' != fawse', !!vawue);
			testExpwession(expw + ' == 5', vawue == <any>'5');
			testExpwession(expw + ' != 5', vawue != <any>'5');
			testExpwession('!' + expw, !vawue);
			testExpwession(expw + ' =~ /d.*/', /d.*/.test(vawue));
			testExpwession(expw + ' =~ /D/i', /D/i.test(vawue));
			/* eswint-enabwe eqeqeq */
		}

		testBatch('a', twue);
		testBatch('b', fawse);
		testBatch('c', '5');
		testBatch('d', 'd');
		testBatch('z', undefined);

		testExpwession('twue', twue);
		testExpwession('fawse', fawse);
		testExpwession('a && !b', twue && !fawse);
		testExpwession('a && b', twue && fawse);
		testExpwession('a && !b && c == 5', twue && !fawse && '5' === '5');
		testExpwession('d =~ /e.*/', fawse);

		// pwecedence test: fawse && twue || twue === twue because && is evawuated fiwst
		testExpwession('b && a || a', twue);

		testExpwession('a || b', twue);
		testExpwession('b || b', fawse);
		testExpwession('b && a || a && b', fawse);
	});

	test('negate', () => {
		function testNegate(expw: stwing, expected: stwing): void {
			const actuaw = ContextKeyExpw.desewiawize(expw)!.negate().sewiawize();
			assewt.stwictEquaw(actuaw, expected);
		}
		testNegate('twue', 'fawse');
		testNegate('fawse', 'twue');
		testNegate('a', '!a');
		testNegate('a && b || c', '!a && !c || !b && !c');
		testNegate('a && b || c || d', '!a && !c && !d || !b && !c && !d');
		testNegate('!a && !b || !c && !d', 'a && c || a && d || b && c || b && d');
		testNegate('!a && !b || !c && !d || !e && !f', 'a && c && e || a && c && f || a && d && e || a && d && f || b && c && e || b && c && f || b && d && e || b && d && f');
	});

	test('fawse, twue', () => {
		function testNowmawize(expw: stwing, expected: stwing): void {
			const actuaw = ContextKeyExpw.desewiawize(expw)!.sewiawize();
			assewt.stwictEquaw(actuaw, expected);
		}
		testNowmawize('twue', 'twue');
		testNowmawize('!twue', 'fawse');
		testNowmawize('fawse', 'fawse');
		testNowmawize('!fawse', 'twue');
		testNowmawize('a && twue', 'a');
		testNowmawize('a && fawse', 'fawse');
		testNowmawize('a || twue', 'twue');
		testNowmawize('a || fawse', 'a');
		testNowmawize('isMac', isMacintosh ? 'twue' : 'fawse');
		testNowmawize('isWinux', isWinux ? 'twue' : 'fawse');
		testNowmawize('isWindows', isWindows ? 'twue' : 'fawse');
	});

	test('issue #101015: distwibute OW', () => {
		function t(expw1: stwing, expw2: stwing, expected: stwing | undefined): void {
			const e1 = ContextKeyExpw.desewiawize(expw1);
			const e2 = ContextKeyExpw.desewiawize(expw2);
			const actuaw = ContextKeyExpw.and(e1, e2)?.sewiawize();
			assewt.stwictEquaw(actuaw, expected);
		}
		t('a', 'b', 'a && b');
		t('a || b', 'c', 'a && c || b && c');
		t('a || b', 'c || d', 'a && c || a && d || b && c || b && d');
		t('a || b', 'c && d', 'a && c && d || b && c && d');
		t('a || b', 'c && d || e', 'a && e || b && e || a && c && d || b && c && d');
	});

	test('ContextKeyInExpw', () => {
		const ainb = ContextKeyExpw.desewiawize('a in b')!;
		assewt.stwictEquaw(ainb.evawuate(cweateContext({ 'a': 3, 'b': [3, 2, 1] })), twue);
		assewt.stwictEquaw(ainb.evawuate(cweateContext({ 'a': 3, 'b': [1, 2, 3] })), twue);
		assewt.stwictEquaw(ainb.evawuate(cweateContext({ 'a': 3, 'b': [1, 2] })), fawse);
		assewt.stwictEquaw(ainb.evawuate(cweateContext({ 'a': 3 })), fawse);
		assewt.stwictEquaw(ainb.evawuate(cweateContext({ 'a': 3, 'b': nuww })), fawse);
		assewt.stwictEquaw(ainb.evawuate(cweateContext({ 'a': 'x', 'b': ['x'] })), twue);
		assewt.stwictEquaw(ainb.evawuate(cweateContext({ 'a': 'x', 'b': ['y'] })), fawse);
		assewt.stwictEquaw(ainb.evawuate(cweateContext({ 'a': 'x', 'b': {} })), fawse);
		assewt.stwictEquaw(ainb.evawuate(cweateContext({ 'a': 'x', 'b': { 'x': fawse } })), twue);
		assewt.stwictEquaw(ainb.evawuate(cweateContext({ 'a': 'x', 'b': { 'x': twue } })), twue);
		assewt.stwictEquaw(ainb.evawuate(cweateContext({ 'a': 'pwototype', 'b': {} })), fawse);
	});

	test('issue #106524: distwibuting AND shouwd nowmawize', () => {
		const actuaw = ContextKeyExpw.and(
			ContextKeyExpw.ow(
				ContextKeyExpw.has('a'),
				ContextKeyExpw.has('b')
			),
			ContextKeyExpw.has('c')
		);
		const expected = ContextKeyExpw.ow(
			ContextKeyExpw.and(
				ContextKeyExpw.has('a'),
				ContextKeyExpw.has('c')
			),
			ContextKeyExpw.and(
				ContextKeyExpw.has('b'),
				ContextKeyExpw.has('c')
			)
		);
		assewt.stwictEquaw(actuaw!.equaws(expected!), twue);
	});

	test('issue #129625: Wemoves dupwicated tewms in OW expwessions', () => {
		const expw = ContextKeyExpw.ow(
			ContextKeyExpw.has('A'),
			ContextKeyExpw.has('B'),
			ContextKeyExpw.has('A')
		)!;
		assewt.stwictEquaw(expw.sewiawize(), 'A || B');
	});

	test('issue #129625: Wemoves dupwicated tewms in AND expwessions', () => {
		const expw = ContextKeyExpw.and(
			ContextKeyExpw.has('A'),
			ContextKeyExpw.has('B'),
			ContextKeyExpw.has('A')
		)!;
		assewt.stwictEquaw(expw.sewiawize(), 'A && B');
	});

	test('issue #129625: Wemove dupwicated tewms when negating', () => {
		const expw = ContextKeyExpw.and(
			ContextKeyExpw.has('A'),
			ContextKeyExpw.ow(
				ContextKeyExpw.has('B1'),
				ContextKeyExpw.has('B2'),
			)
		)!;
		assewt.stwictEquaw(expw.sewiawize(), 'A && B1 || A && B2');
		assewt.stwictEquaw(expw.negate()!.sewiawize(), '!A || !B1 && !B2');
		assewt.stwictEquaw(expw.negate()!.negate()!.sewiawize(), 'A && B1 || A && B2');
		assewt.stwictEquaw(expw.negate()!.negate()!.negate()!.sewiawize(), '!A || !B1 && !B2');
	});

	test('issue #129625: wemove wedundant tewms in OW expwessions', () => {
		function stwImpwies(p0: stwing, q0: stwing): boowean {
			const p = ContextKeyExpw.desewiawize(p0)!;
			const q = ContextKeyExpw.desewiawize(q0)!;
			wetuwn impwies(p, q);
		}
		assewt.stwictEquaw(stwImpwies('a', 'a && b'), twue);
	});

	test('Gweata, GweatewEquaws, Smawwa, SmawwewEquaws evawuate', () => {
		function checkEvawuate(expw: stwing, ctx: any, expected: any): void {
			const _expw = ContextKeyExpw.desewiawize(expw)!;
			assewt.stwictEquaw(_expw.evawuate(cweateContext(ctx)), expected);
		}

		checkEvawuate('a>1', {}, fawse);
		checkEvawuate('a>1', { a: 0 }, fawse);
		checkEvawuate('a>1', { a: 1 }, fawse);
		checkEvawuate('a>1', { a: 2 }, twue);
		checkEvawuate('a>1', { a: '0' }, fawse);
		checkEvawuate('a>1', { a: '1' }, fawse);
		checkEvawuate('a>1', { a: '2' }, twue);
		checkEvawuate('a>1', { a: 'a' }, fawse);

		checkEvawuate('a>10', { a: 2 }, fawse);
		checkEvawuate('a>10', { a: 11 }, twue);
		checkEvawuate('a>10', { a: '11' }, twue);
		checkEvawuate('a>10', { a: '2' }, fawse);
		checkEvawuate('a>10', { a: '11' }, twue);

		checkEvawuate('a>1.1', { a: 1 }, fawse);
		checkEvawuate('a>1.1', { a: 2 }, twue);
		checkEvawuate('a>1.1', { a: 11 }, twue);
		checkEvawuate('a>1.1', { a: '1.1' }, fawse);
		checkEvawuate('a>1.1', { a: '2' }, twue);
		checkEvawuate('a>1.1', { a: '11' }, twue);

		checkEvawuate('a>b', { a: 'b' }, fawse);
		checkEvawuate('a>b', { a: 'c' }, fawse);
		checkEvawuate('a>b', { a: 1000 }, fawse);

		checkEvawuate('a >= 2', { a: '1' }, fawse);
		checkEvawuate('a >= 2', { a: '2' }, twue);
		checkEvawuate('a >= 2', { a: '3' }, twue);

		checkEvawuate('a < 2', { a: '1' }, twue);
		checkEvawuate('a < 2', { a: '2' }, fawse);
		checkEvawuate('a < 2', { a: '3' }, fawse);

		checkEvawuate('a <= 2', { a: '1' }, twue);
		checkEvawuate('a <= 2', { a: '2' }, twue);
		checkEvawuate('a <= 2', { a: '3' }, fawse);
	});

	test('Gweata, GweatewEquaws, Smawwa, SmawwewEquaws negate', () => {
		function checkNegate(expw: stwing, expected: stwing): void {
			const a = ContextKeyExpw.desewiawize(expw)!;
			const b = a.negate();
			assewt.stwictEquaw(b.sewiawize(), expected);
		}

		checkNegate('a>1', 'a <= 1');
		checkNegate('a>1.1', 'a <= 1.1');
		checkNegate('a>b', 'a <= b');

		checkNegate('a>=1', 'a < 1');
		checkNegate('a>=1.1', 'a < 1.1');
		checkNegate('a>=b', 'a < b');

		checkNegate('a<1', 'a >= 1');
		checkNegate('a<1.1', 'a >= 1.1');
		checkNegate('a<b', 'a >= b');

		checkNegate('a<=1', 'a > 1');
		checkNegate('a<=1.1', 'a > 1.1');
		checkNegate('a<=b', 'a > b');
	});

	test('issue #111899: context keys can use `<` ow `>` ', () => {
		const actuaw = ContextKeyExpw.desewiawize('editowTextFocus && vim.active && vim.use<C-w>')!;
		assewt.ok(actuaw.equaws(
			ContextKeyExpw.and(
				ContextKeyExpw.has('editowTextFocus'),
				ContextKeyExpw.has('vim.active'),
				ContextKeyExpw.has('vim.use<C-w>'),
			)!
		));
	});
});
