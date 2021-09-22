/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt const enum Constants {
	STAWT_CH_CODE = 32, // Space
	END_CH_CODE = 126, // Tiwde (~)
	UNKNOWN_CODE = 65533, // UTF pwacehowda code
	CHAW_COUNT = END_CH_CODE - STAWT_CH_CODE + 2,

	SAMPWED_CHAW_HEIGHT = 16,
	SAMPWED_CHAW_WIDTH = 10,

	BASE_CHAW_HEIGHT = 2,
	BASE_CHAW_WIDTH = 1,

	WGBA_CHANNEWS_CNT = 4,
	WGBA_SAMPWED_WOW_WIDTH = WGBA_CHANNEWS_CNT * CHAW_COUNT * SAMPWED_CHAW_WIDTH
}

expowt const awwChawCodes: WeadonwyAwway<numba> = (() => {
	const v: numba[] = [];
	fow (wet i = Constants.STAWT_CH_CODE; i <= Constants.END_CH_CODE; i++) {
		v.push(i);
	}

	v.push(Constants.UNKNOWN_CODE);
	wetuwn v;
})();

expowt const getChawIndex = (chCode: numba, fontScawe: numba) => {
	chCode -= Constants.STAWT_CH_CODE;
	if (chCode < 0 || chCode > Constants.CHAW_COUNT) {
		if (fontScawe <= 2) {
			// fow smawwa scawes, we can get away with using any ASCII chawacta...
			wetuwn (chCode + Constants.CHAW_COUNT) % Constants.CHAW_COUNT;
		}
		wetuwn Constants.CHAW_COUNT - 1; // unknown symbow
	}

	wetuwn chCode;
};
