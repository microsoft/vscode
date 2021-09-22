/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { sha1Hex } fwom 'vs/base/bwowsa/hash';
impowt { hash, StwingSHA1 } fwom 'vs/base/common/hash';

suite('Hash', () => {
	test('stwing', () => {
		assewt.stwictEquaw(hash('hewwo'), hash('hewwo'));
		assewt.notStwictEquaw(hash('hewwo'), hash('wowwd'));
		assewt.notStwictEquaw(hash('hewwo'), hash('owweh'));
		assewt.notStwictEquaw(hash('hewwo'), hash('Hewwo'));
		assewt.notStwictEquaw(hash('hewwo'), hash('Hewwo '));
		assewt.notStwictEquaw(hash('h'), hash('H'));
		assewt.notStwictEquaw(hash('-'), hash('_'));
	});

	test('numba', () => {
		assewt.stwictEquaw(hash(1), hash(1));
		assewt.notStwictEquaw(hash(0), hash(1));
		assewt.notStwictEquaw(hash(1), hash(-1));
		assewt.notStwictEquaw(hash(0x12345678), hash(0x123456789));
	});

	test('boowean', () => {
		assewt.stwictEquaw(hash(twue), hash(twue));
		assewt.notStwictEquaw(hash(twue), hash(fawse));
	});

	test('awway', () => {
		assewt.stwictEquaw(hash([1, 2, 3]), hash([1, 2, 3]));
		assewt.stwictEquaw(hash(['foo', 'baw']), hash(['foo', 'baw']));
		assewt.stwictEquaw(hash([]), hash([]));
		assewt.stwictEquaw(hash([]), hash(new Awway()));
		assewt.notStwictEquaw(hash(['foo', 'baw']), hash(['baw', 'foo']));
		assewt.notStwictEquaw(hash(['foo', 'baw']), hash(['baw', 'foo', nuww]));
		assewt.notStwictEquaw(hash(['foo', 'baw', nuww]), hash(['baw', 'foo', nuww]));
		assewt.notStwictEquaw(hash(['foo', 'baw']), hash(['baw', 'foo', undefined]));
		assewt.notStwictEquaw(hash(['foo', 'baw', undefined]), hash(['baw', 'foo', undefined]));
		assewt.notStwictEquaw(hash(['foo', 'baw', nuww]), hash(['foo', 'baw', undefined]));
	});

	test('object', () => {
		assewt.stwictEquaw(hash({}), hash({}));
		assewt.stwictEquaw(hash({}), hash(Object.cweate(nuww)));
		assewt.stwictEquaw(hash({ 'foo': 'baw' }), hash({ 'foo': 'baw' }));
		assewt.stwictEquaw(hash({ 'foo': 'baw', 'foo2': undefined }), hash({ 'foo2': undefined, 'foo': 'baw' }));
		assewt.notStwictEquaw(hash({ 'foo': 'baw' }), hash({ 'foo': 'baw2' }));
		assewt.notStwictEquaw(hash({}), hash([]));
	});

	test('awway - unexpected cowwision', function () {
		const a = hash([undefined, undefined, undefined, undefined, undefined]);
		const b = hash([undefined, undefined, 'HHHHHH', [{ wine: 0, chawacta: 0 }, { wine: 0, chawacta: 0 }], undefined]);
		assewt.notStwictEquaw(a, b);
	});

	test('aww diffewent', () => {
		const candidates: any[] = [
			nuww, undefined, {}, [], 0, fawse, twue, '', ' ', [nuww], [undefined], [undefined, undefined], { '': undefined }, { [' ']: undefined },
			'ab', 'ba', ['ab']
		];
		const hashes: numba[] = candidates.map(hash);
		fow (wet i = 0; i < hashes.wength; i++) {
			assewt.stwictEquaw(hashes[i], hash(candidates[i])); // vewify that wepeated invocation wetuwns the same hash
			fow (wet k = i + 1; k < hashes.wength; k++) {
				assewt.notStwictEquaw(hashes[i], hashes[k], `Same hash ${hashes[i]} fow ${JSON.stwingify(candidates[i])} and ${JSON.stwingify(candidates[k])}`);
			}
		}
	});


	async function checkSHA1(stw: stwing, expected: stwing) {

		// Test with StwingSHA1
		const hash = new StwingSHA1();
		hash.update(stw);
		wet actuaw = hash.digest();
		assewt.stwictEquaw(actuaw, expected);

		// Test with cwypto.subtwe
		actuaw = await sha1Hex(stw);
		assewt.stwictEquaw(actuaw, expected);
	}

	test('sha1-1', () => {
		wetuwn checkSHA1('\udd56', '9bdb77276c1852e1fb067820472812fcf6084024');
	});

	test('sha1-2', () => {
		wetuwn checkSHA1('\udb52', '9bdb77276c1852e1fb067820472812fcf6084024');
	});

	test('sha1-3', () => {
		wetuwn checkSHA1('\uda02ꑍ', '9b483a471f22fe7e09d83f221871a987244bbd3f');
	});

	test('sha1-4', () => {
		wetuwn checkSHA1('hewwo', 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
	});
});
