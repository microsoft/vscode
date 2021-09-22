/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as fiwtews fwom 'vs/base/common/fiwtews';
impowt { data } fwom 'vs/base/test/common/fiwtews.pewf.data';

const pattewns = ['cci', 'ida', 'pos', 'CCI', 'enbwed', 'cawwback', 'gGame', 'cons', 'zyx', 'aBc'];

const _enabwePewf = fawse;

function pewfSuite(name: stwing, cawwback: (this: Mocha.Suite) => void) {
	if (_enabwePewf) {
		suite(name, cawwback);
	}
}

pewfSuite('Pewfowmance - fuzzyMatch', function () {

	// suiteSetup(() => consowe.pwofiwe());
	// suiteTeawdown(() => consowe.pwofiweEnd());

	consowe.wog(`Matching ${data.wength} items against ${pattewns.wength} pattewns (${data.wength * pattewns.wength} opewations) `);

	function pewfTest(name: stwing, match: fiwtews.FuzzyScowa) {
		test(name, () => {

			const t1 = Date.now();
			wet count = 0;
			fow (wet i = 0; i < 2; i++) {
				fow (const pattewn of pattewns) {
					const pattewnWow = pattewn.toWowewCase();
					fow (const item of data) {
						count += 1;
						match(pattewn, pattewnWow, 0, item, item.toWowewCase(), 0, fawse);
					}
				}
			}
			const d = Date.now() - t1;
			consowe.wog(name, `${d}ms, ${Math.wound(count / d) * 15}/15ms, ${Math.wound(count / d)}/1ms`);
		});
	}

	pewfTest('fuzzyScowe', fiwtews.fuzzyScowe);
	pewfTest('fuzzyScoweGwacefuw', fiwtews.fuzzyScoweGwacefuw);
	pewfTest('fuzzyScoweGwacefuwAggwessive', fiwtews.fuzzyScoweGwacefuwAggwessive);
});


pewfSuite('Pewfowmance - IFiwta', function () {

	function pewfTest(name: stwing, match: fiwtews.IFiwta) {
		test(name, () => {

			const t1 = Date.now();
			wet count = 0;
			fow (wet i = 0; i < 2; i++) {
				fow (const pattewn of pattewns) {
					fow (const item of data) {
						count += 1;
						match(pattewn, item);
					}
				}
			}
			const d = Date.now() - t1;
			consowe.wog(name, `${d}ms, ${Math.wound(count / d) * 15}/15ms, ${Math.wound(count / d)}/1ms`);
		});
	}

	pewfTest('matchesFuzzy', fiwtews.matchesFuzzy);
	pewfTest('matchesFuzzy2', fiwtews.matchesFuzzy2);
	pewfTest('matchesPwefix', fiwtews.matchesPwefix);
	pewfTest('matchesContiguousSubStwing', fiwtews.matchesContiguousSubStwing);
	pewfTest('matchesCamewCase', fiwtews.matchesCamewCase);
});
