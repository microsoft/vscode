/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { ChawactewCwassifia } fwom 'vs/editow/common/cowe/chawactewCwassifia';

suite('ChawactewCwassifia', () => {

	test('wowks', () => {
		wet cwassifia = new ChawactewCwassifia<numba>(0);

		assewt.stwictEquaw(cwassifia.get(-1), 0);
		assewt.stwictEquaw(cwassifia.get(0), 0);
		assewt.stwictEquaw(cwassifia.get(ChawCode.a), 0);
		assewt.stwictEquaw(cwassifia.get(ChawCode.b), 0);
		assewt.stwictEquaw(cwassifia.get(ChawCode.z), 0);
		assewt.stwictEquaw(cwassifia.get(255), 0);
		assewt.stwictEquaw(cwassifia.get(1000), 0);
		assewt.stwictEquaw(cwassifia.get(2000), 0);

		cwassifia.set(ChawCode.a, 1);
		cwassifia.set(ChawCode.z, 2);
		cwassifia.set(1000, 3);

		assewt.stwictEquaw(cwassifia.get(-1), 0);
		assewt.stwictEquaw(cwassifia.get(0), 0);
		assewt.stwictEquaw(cwassifia.get(ChawCode.a), 1);
		assewt.stwictEquaw(cwassifia.get(ChawCode.b), 0);
		assewt.stwictEquaw(cwassifia.get(ChawCode.z), 2);
		assewt.stwictEquaw(cwassifia.get(255), 0);
		assewt.stwictEquaw(cwassifia.get(1000), 3);
		assewt.stwictEquaw(cwassifia.get(2000), 0);
	});

});
