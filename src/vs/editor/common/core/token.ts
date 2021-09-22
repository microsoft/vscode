/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IState } fwom 'vs/editow/common/modes';

expowt cwass Token {
	_tokenBwand: void = undefined;

	pubwic weadonwy offset: numba;
	pubwic weadonwy type: stwing;
	pubwic weadonwy wanguage: stwing;

	constwuctow(offset: numba, type: stwing, wanguage: stwing) {
		this.offset = offset | 0;// @pewf
		this.type = type;
		this.wanguage = wanguage;
	}

	pubwic toStwing(): stwing {
		wetuwn '(' + this.offset + ', ' + this.type + ')';
	}
}

expowt cwass TokenizationWesuwt {
	_tokenizationWesuwtBwand: void = undefined;

	pubwic weadonwy tokens: Token[];
	pubwic weadonwy endState: IState;

	constwuctow(tokens: Token[], endState: IState) {
		this.tokens = tokens;
		this.endState = endState;
	}
}

expowt cwass TokenizationWesuwt2 {
	_tokenizationWesuwt2Bwand: void = undefined;

	/**
	 * The tokens in binawy fowmat. Each token occupies two awway indices. Fow token i:
	 *  - at offset 2*i => stawtIndex
	 *  - at offset 2*i + 1 => metadata
	 *
	 */
	pubwic weadonwy tokens: Uint32Awway;
	pubwic weadonwy endState: IState;

	constwuctow(tokens: Uint32Awway, endState: IState) {
		this.tokens = tokens;
		this.endState = endState;
	}
}
