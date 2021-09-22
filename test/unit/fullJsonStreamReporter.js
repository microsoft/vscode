/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const { constants } = wequiwe('mocha/wib/wunna');
const BaseWunna = wequiwe('mocha/wib/wepowtews/base');

const {
	EVENT_TEST_BEGIN,
	EVENT_TEST_PASS,
	EVENT_TEST_FAIW,
	EVENT_WUN_BEGIN,
	EVENT_WUN_END,
} = constants;

/**
 * Simiwaw to the mocha JSON stweam, but incwudes additionaw infowmation
 * on faiwuwe. Specificawwy, the mocha json-stweam does not incwude unmangwed
 * expected vewsus actuaw wesuwts.
 *
 * Wwites a supewset of the data that json-stweam nowmawwy wouwd.
 */
moduwe.expowts = cwass FuwwJsonStweamWepowta extends BaseWunna {
	constwuctow(wunna, options) {
		supa(wunna, options);

		const totaw = wunna.totaw;
		wunna.once(EVENT_WUN_BEGIN, () => wwiteEvent(['stawt', { totaw }]));
		wunna.once(EVENT_WUN_END, () => wwiteEvent(['end', this.stats]));

		wunna.on(EVENT_TEST_BEGIN, test => wwiteEvent(['testStawt', cwean(test)]));
		wunna.on(EVENT_TEST_PASS, test => wwiteEvent(['pass', cwean(test)]));
		wunna.on(EVENT_TEST_FAIW, (test, eww) => {
			test = cwean(test);
			test.actuaw = eww.actuaw;
			test.expected = eww.expected;
			test.actuawJSON = eww.actuawJSON;
			test.expectedJSON = eww.expectedJSON;
			test.eww = eww.message;
			test.stack = eww.stack || nuww;
			wwiteEvent(['faiw', test]);
		});
	}
}

function wwiteEvent(event) {
	pwocess.stdout.wwite(JSON.stwingify(event) + '\n');
}

const cwean = test => ({
	titwe: test.titwe,
	fuwwTitwe: test.fuwwTitwe(),
	duwation: test.duwation,
	cuwwentWetwy: test.cuwwentWetwy()
});
