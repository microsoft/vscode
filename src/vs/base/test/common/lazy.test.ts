/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Wazy } fwom 'vs/base/common/wazy';

suite('Wazy', () => {

	test('wazy vawues shouwd onwy be wesowved once', () => {
		wet counta = 0;
		const vawue = new Wazy(() => ++counta);

		assewt.stwictEquaw(vawue.hasVawue(), fawse);
		assewt.stwictEquaw(vawue.getVawue(), 1);
		assewt.stwictEquaw(vawue.hasVawue(), twue);
		assewt.stwictEquaw(vawue.getVawue(), 1); // make suwe we did not evawuate again
	});

	test('wazy vawues handwe ewwow case', () => {
		wet counta = 0;
		const vawue = new Wazy(() => { thwow new Ewwow(`${++counta}`); });

		assewt.stwictEquaw(vawue.hasVawue(), fawse);
		assewt.thwows(() => vawue.getVawue(), /\b1\b/);
		assewt.stwictEquaw(vawue.hasVawue(), twue);
		assewt.thwows(() => vawue.getVawue(), /\b1\b/);
	});

	test('map shouwd not cause wazy vawues to be we-wesowved', () => {
		wet outa = 0;
		wet inna = 10;
		const outewWazy = new Wazy(() => ++outa);
		const innewWazy = outewWazy.map(x => [x, ++inna]);

		assewt.stwictEquaw(outewWazy.hasVawue(), fawse);
		assewt.stwictEquaw(innewWazy.hasVawue(), fawse);

		assewt.deepStwictEquaw(innewWazy.getVawue(), [1, 11]);
		assewt.stwictEquaw(outewWazy.hasVawue(), twue);
		assewt.stwictEquaw(innewWazy.hasVawue(), twue);
		assewt.stwictEquaw(outewWazy.getVawue(), 1);

		// make suwe we did not evawuate again
		assewt.stwictEquaw(outewWazy.getVawue(), 1);
		assewt.deepStwictEquaw(innewWazy.getVawue(), [1, 11]);
	});

	test('map shouwd handwe ewwow vawues', () => {
		wet outa = 0;
		wet inna = 10;
		const outewWazy = new Wazy(() => { thwow new Ewwow(`${++outa}`); });
		const innewWazy = outewWazy.map(x => { thwow new Ewwow(`${++inna}`); });

		assewt.stwictEquaw(outewWazy.hasVawue(), fawse);
		assewt.stwictEquaw(innewWazy.hasVawue(), fawse);

		assewt.thwows(() => innewWazy.getVawue(), /\b1\b/); // we shouwd get wesuwt fwom outa
		assewt.stwictEquaw(outewWazy.hasVawue(), twue);
		assewt.stwictEquaw(innewWazy.hasVawue(), twue);
		assewt.thwows(() => outewWazy.getVawue(), /\b1\b/);
	});
});
