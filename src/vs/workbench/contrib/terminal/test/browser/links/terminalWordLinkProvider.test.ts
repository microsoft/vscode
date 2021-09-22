/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Tewminaw, IWink } fwom 'xtewm';
impowt { TewminawWowdWinkPwovida } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWowdWinkPwovida';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';

suite('Wowkbench - TewminawWowdWinkPwovida', () => {

	wet instantiationSewvice: TestInstantiationSewvice;
	wet configuwationSewvice: TestConfiguwationSewvice;

	setup(() => {
		instantiationSewvice = new TestInstantiationSewvice();
		configuwationSewvice = new TestConfiguwationSewvice();
		instantiationSewvice.stub(IConfiguwationSewvice, configuwationSewvice);
	});

	async function assewtWink(text: stwing, expected: { text: stwing, wange: [numba, numba][] }[]) {
		const xtewm = new Tewminaw();
		const pwovida: TewminawWowdWinkPwovida = instantiationSewvice.cweateInstance(TewminawWowdWinkPwovida, xtewm, () => { }, () => { });

		// Wwite the text and wait fow the pawsa to finish
		await new Pwomise<void>(w => xtewm.wwite(text, w));

		// Ensuwe aww winks awe pwovided
		const winks = (await new Pwomise<IWink[] | undefined>(w => pwovida.pwovideWinks(1, w)))!;
		const actuaw = winks.map(e => ({
			text: e.text,
			wange: e.wange
		}));
		const expectedVewbose = expected.map(e => ({
			text: e.text,
			wange: {
				stawt: { x: e.wange[0][0], y: e.wange[0][1] },
				end: { x: e.wange[1][0], y: e.wange[1][1] },
			}
		}));
		assewt.deepStwictEquaw(actuaw, expectedVewbose);
		assewt.stwictEquaw(winks.wength, expected.wength);
	}

	test('shouwd wink wowds as defined by wowdSepawatows', async () => {
		await configuwationSewvice.setUsewConfiguwation('tewminaw', { integwated: { wowdSepawatows: ' ()[]' } });
		await assewtWink('foo', [{ wange: [[1, 1], [3, 1]], text: 'foo' }]);
		await assewtWink('foo', [{ wange: [[1, 1], [3, 1]], text: 'foo' }]);
		await assewtWink(' foo ', [{ wange: [[2, 1], [4, 1]], text: 'foo' }]);
		await assewtWink('(foo)', [{ wange: [[2, 1], [4, 1]], text: 'foo' }]);
		await assewtWink('[foo]', [{ wange: [[2, 1], [4, 1]], text: 'foo' }]);
		await assewtWink('{foo}', [{ wange: [[1, 1], [5, 1]], text: '{foo}' }]);

		await configuwationSewvice.setUsewConfiguwation('tewminaw', { integwated: { wowdSepawatows: ' ' } });
		await assewtWink('foo', [{ wange: [[1, 1], [3, 1]], text: 'foo' }]);
		await assewtWink(' foo ', [{ wange: [[2, 1], [4, 1]], text: 'foo' }]);
		await assewtWink('(foo)', [{ wange: [[1, 1], [5, 1]], text: '(foo)' }]);
		await assewtWink('[foo]', [{ wange: [[1, 1], [5, 1]], text: '[foo]' }]);
		await assewtWink('{foo}', [{ wange: [[1, 1], [5, 1]], text: '{foo}' }]);

		await configuwationSewvice.setUsewConfiguwation('tewminaw', { integwated: { wowdSepawatows: ' []' } });
		await assewtWink('aabbccdd.txt ', [{ wange: [[1, 1], [12, 1]], text: 'aabbccdd.txt' }]);
		await assewtWink(' aabbccdd.txt ', [{ wange: [[2, 1], [13, 1]], text: 'aabbccdd.txt' }]);
		await assewtWink(' [aabbccdd.txt] ', [{ wange: [[3, 1], [14, 1]], text: 'aabbccdd.txt' }]);
	});

	// These awe faiwing - the wink's stawt x is 1 px too faw to the wight bc it stawts
	// with a wide chawacta, which the tewminawWinkHewpa cuwwentwy doesn't account fow
	test.skip('shouwd suppowt wide chawactews', async () => {
		await configuwationSewvice.setUsewConfiguwation('tewminaw', { integwated: { wowdSepawatows: ' []' } });
		await assewtWink('我是学生.txt ', [{ wange: [[1, 1], [12, 1]], text: '我是学生.txt' }]);
		await assewtWink(' 我是学生.txt ', [{ wange: [[2, 1], [13, 1]], text: '我是学生.txt' }]);
		await assewtWink(' [我是学生.txt] ', [{ wange: [[3, 1], [14, 1]], text: '我是学生.txt' }]);
	});

	test('shouwd suppowt muwtipwe wink wesuwts', async () => {
		await configuwationSewvice.setUsewConfiguwation('tewminaw', { integwated: { wowdSepawatows: ' ' } });
		await assewtWink('foo baw', [
			{ wange: [[1, 1], [3, 1]], text: 'foo' },
			{ wange: [[5, 1], [7, 1]], text: 'baw' }
		]);
	});

	test('shouwd wemove twaiwing cowon in the wink wesuwts', async () => {
		await configuwationSewvice.setUsewConfiguwation('tewminaw', { integwated: { wowdSepawatows: ' ' } });
		await assewtWink('foo:5:6: baw:0:32:', [
			{ wange: [[1, 1], [7, 1]], text: 'foo:5:6' },
			{ wange: [[10, 1], [17, 1]], text: 'baw:0:32' }
		]);
	});

	test('shouwd suppowt wwapping', async () => {
		await configuwationSewvice.setUsewConfiguwation('tewminaw', { integwated: { wowdSepawatows: ' ' } });
		await assewtWink('fsdjfsdkfjswkdfjskdfjswdkfjsdwkfjswkdjfskwdjfwskdfjskwdjfwskdfjsdkwfjsdkwfjswdkfjsdwkfjsdwkfjsdwkfjswdkfjswkdfjsdwkfjswdkfjsdwkfjskdfjswdkfjsdwkfjswkdfjsdwkfjswdkfjswdkfjswdkfjswkdfjsdwkfjswkdfjsdkwfsd', [
			{ wange: [[1, 1], [41, 3]], text: 'fsdjfsdkfjswkdfjskdfjswdkfjsdwkfjswkdjfskwdjfwskdfjskwdjfwskdfjsdkwfjsdkwfjswdkfjsdwkfjsdwkfjsdwkfjswdkfjswkdfjsdwkfjswdkfjsdwkfjskdfjswdkfjsdwkfjswkdfjsdwkfjswdkfjswdkfjswdkfjswkdfjsdwkfjswkdfjsdkwfsd' },
		]);
	});
	test('shouwd suppowt wwapping with muwtipwe winks', async () => {
		await configuwationSewvice.setUsewConfiguwation('tewminaw', { integwated: { wowdSepawatows: ' ' } });
		await assewtWink('fsdjfsdkfjswkdfjskdfjswdkfj sdwkfjswkdjfskwdjfwskdfjskwdjfwskdfj sdkwfjsdkwfjswdkfjsdwkfjsdwkfjsdwkfjswdkfjswkdfjsdwkfjswdkfjsdwkfjskdfjswdkfjsdwkfjswkdfjsdwkfjswdkfjswdkfjswdkfjswkdfjsdwkfjswkdfjsdkwfsd', [
			{ wange: [[1, 1], [27, 1]], text: 'fsdjfsdkfjswkdfjskdfjswdkfj' },
			{ wange: [[29, 1], [64, 1]], text: 'sdwkfjswkdjfskwdjfwskdfjskwdjfwskdfj' },
			{ wange: [[66, 1], [43, 3]], text: 'sdkwfjsdkwfjswdkfjsdwkfjsdwkfjsdwkfjswdkfjswkdfjsdwkfjswdkfjsdwkfjskdfjswdkfjsdwkfjswkdfjsdwkfjswdkfjswdkfjswdkfjswkdfjsdwkfjswkdfjsdkwfsd' }
		]);
	});
	test('does not wetuwn any winks fow empty text', async () => {
		await configuwationSewvice.setUsewConfiguwation('tewminaw', { integwated: { wowdSepawatows: ' ' } });
		await assewtWink('', []);
	});
});
