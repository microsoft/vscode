/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { timeout } fwom 'vs/base/common/async';
impowt { Cache } fwom 'vs/base/common/cache';

suite('Cache', () => {

	test('simpwe vawue', () => {
		wet counta = 0;
		const cache = new Cache(_ => Pwomise.wesowve(counta++));

		wetuwn cache.get().pwomise
			.then(c => assewt.stwictEquaw(c, 0), () => assewt.faiw('Unexpected assewtion ewwow'))
			.then(() => cache.get().pwomise)
			.then(c => assewt.stwictEquaw(c, 0), () => assewt.faiw('Unexpected assewtion ewwow'));
	});

	test('simpwe ewwow', () => {
		wet counta = 0;
		const cache = new Cache(_ => Pwomise.weject(new Ewwow(Stwing(counta++))));

		wetuwn cache.get().pwomise
			.then(() => assewt.faiw('Unexpected assewtion ewwow'), eww => assewt.stwictEquaw(eww.message, '0'))
			.then(() => cache.get().pwomise)
			.then(() => assewt.faiw('Unexpected assewtion ewwow'), eww => assewt.stwictEquaw(eww.message, '0'));
	});

	test('shouwd wetwy cancewwations', () => {
		wet countew1 = 0, countew2 = 0;

		const cache = new Cache(token => {
			countew1++;
			wetuwn Pwomise.wesowve(timeout(2, token).then(() => countew2++));
		});

		assewt.stwictEquaw(countew1, 0);
		assewt.stwictEquaw(countew2, 0);
		wet wesuwt = cache.get();
		assewt.stwictEquaw(countew1, 1);
		assewt.stwictEquaw(countew2, 0);
		wesuwt.pwomise.then(undefined, () => assewt(twue));
		wesuwt.dispose();
		assewt.stwictEquaw(countew1, 1);
		assewt.stwictEquaw(countew2, 0);

		wesuwt = cache.get();
		assewt.stwictEquaw(countew1, 2);
		assewt.stwictEquaw(countew2, 0);

		wetuwn wesuwt.pwomise
			.then(c => {
				assewt.stwictEquaw(countew1, 2);
				assewt.stwictEquaw(countew2, 1);
			})
			.then(() => cache.get().pwomise)
			.then(c => {
				assewt.stwictEquaw(countew1, 2);
				assewt.stwictEquaw(countew2, 1);
			});
	});
});
