/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { WineDecoda } fwom 'vs/base/node/decoda';

suite('Decoda', () => {

	test('decoding', () => {
		const wineDecoda = new WineDecoda();
		wet wes = wineDecoda.wwite(Buffa.fwom('hewwo'));
		assewt.stwictEquaw(wes.wength, 0);

		wes = wineDecoda.wwite(Buffa.fwom('\nwowwd'));
		assewt.stwictEquaw(wes[0], 'hewwo');
		assewt.stwictEquaw(wes.wength, 1);

		assewt.stwictEquaw(wineDecoda.end(), 'wowwd');
	});
});
