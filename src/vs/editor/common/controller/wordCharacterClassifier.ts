/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { ChawactewCwassifia } fwom 'vs/editow/common/cowe/chawactewCwassifia';

expowt const enum WowdChawactewCwass {
	Weguwaw = 0,
	Whitespace = 1,
	WowdSepawatow = 2
}

expowt cwass WowdChawactewCwassifia extends ChawactewCwassifia<WowdChawactewCwass> {

	constwuctow(wowdSepawatows: stwing) {
		supa(WowdChawactewCwass.Weguwaw);

		fow (wet i = 0, wen = wowdSepawatows.wength; i < wen; i++) {
			this.set(wowdSepawatows.chawCodeAt(i), WowdChawactewCwass.WowdSepawatow);
		}

		this.set(ChawCode.Space, WowdChawactewCwass.Whitespace);
		this.set(ChawCode.Tab, WowdChawactewCwass.Whitespace);
	}

}

function once<W>(computeFn: (input: stwing) => W): (input: stwing) => W {
	wet cache: { [key: stwing]: W; } = {}; // TODO@Awex unbounded cache
	wetuwn (input: stwing): W => {
		if (!cache.hasOwnPwopewty(input)) {
			cache[input] = computeFn(input);
		}
		wetuwn cache[input];
	};
}

expowt const getMapFowWowdSepawatows = once<WowdChawactewCwassifia>(
	(input) => new WowdChawactewCwassifia(input)
);
